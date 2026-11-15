/**
 * 掼蛋服务端权威房间（Node + ws）
 *
 * 设计要点：
 * - 服务端是唯一权威：发牌、洗牌、回合推进、结算升级、AI 出牌全部在服务端完成
 * - 每个客户端只收到「自己视角」的状态：对手手牌不下发，仅给剩余张数
 * - 断线重连：玩家令牌（token）绑定座位，对局中掉线保留 90 秒，超时由 AI 托管
 * - 回合兜底：真人 25 秒未操作自动代打，保证牌局不会卡死
 *
 * 复用 src/engine/guandan 下的同构引擎（Node 原生 TS type stripping 直接加载）
 */
import crypto from 'node:crypto';
import {
  gdNewGame, gdApplyTurn, maskStateFor,
} from '../src/engine/guandan/room.ts';
import { analyzePlay, canBeat, cardVal } from '../src/engine/guandan/core.ts';
import { aiDecide, generateAINames } from '../src/engine/guandanAI.ts';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_MS = 30 * 60 * 1000;      // 等待中房间 30 分钟回收
const ROOM_PLAYING_MS = 3 * 60 * 60 * 1000; // 对局中房间 3 小时回收
const DISCONNECT_GRACE_MS = 90 * 1000;     // 对局中掉线保留座位 90 秒
const HUMAN_TURN_MS = 25 * 1000;           // 真人回合超时
const OFFLINE_TURN_MS = 2500;              // 掉线玩家由 AI 快速接管
const AI_THINK_MS = 700;

/** roomCode -> room */
const rooms = new Map();

function send(ws, msg) {
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(msg)); } catch { /* 单客户端异常不影响房间 */ }
}

function generateRoomCode() {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom(hostSeat, hostName, hostToken) {
  const room = {
    code: generateRoomCode(),
    hostSeat,
    seats: [null, null, null, null],
    state: null,
    status: 'waiting', // waiting | playing | over
    difficulty: 'medium',
    aiTimer: null,
    turnTimer: null,
    disconnectTimers: [null, null, null, null],
    createdAt: Date.now(),
  };
  room.seats[hostSeat] = {
    seat: hostSeat, name: hostName, token: hostToken, ws: null,
    isAI: false, online: false, difficulty: 'medium',
  };
  rooms.set(room.code, room);
  return room;
}

function playersPayload(room) {
  return room.seats.map((p) => (p ? {
    seat: p.seat, name: p.name, isAI: p.isAI, online: p.online,
  } : null));
}

function roomPayload(room) {
  return {
    type: 'GD_ROOM',
    roomCode: room.code,
    hostSeat: room.hostSeat,
    status: room.status,
    players: playersPayload(room),
  };
}

function broadcastRoom(room) {
  for (const p of room.seats) {
    if (p && !p.isAI && p.ws) send(p.ws, roomPayload(room));
  }
}

function broadcastState(room) {
  if (!room.state) return;
  for (const p of room.seats) {
    if (p && !p.isAI && p.ws) {
      send(p.ws, { type: 'GD_STATE', seat: p.seat, state: maskStateFor(room.state, p.seat) });
    }
  }
}

function clearTimers(room) {
  if (room.aiTimer) { clearTimeout(room.aiTimer); room.aiTimer = null; }
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  for (let i = 0; i < 4; i++) {
    if (room.disconnectTimers[i]) { clearTimeout(room.disconnectTimers[i]); room.disconnectTimers[i] = null; }
  }
}

function roomAlive(room) {
  const humans = room.seats.filter((p) => p && !p.isAI);
  return humans.length > 0;
}

function destroyRoom(room) {
  clearTimers(room);
  rooms.delete(room.code);
}

/** 校验一手牌是否合法（属于手牌 / 牌型合法 / 能压上一手） */
function validatePlay(st, seat, cards) {
  if (!st || st.phase !== 'playing') return { ok: false, reason: '对局未进行' };
  if (st.current !== seat) return { ok: false, reason: '还没轮到你' };
  if (st.finished.includes(seat)) return { ok: false, reason: '你已出完' };
  const hand = st.hands[seat];
  if (!hand || hand.length === 0) return { ok: false, reason: '手牌为空' };
  if (cards === null) {
    if (!st.lastPlay) return { ok: false, reason: '自由出牌不能过' };
    return { ok: true };
  }
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 27) {
    return { ok: false, reason: '牌数不合法' };
  }
  const handIds = new Set(hand.map((c) => c.id));
  const seen = new Set();
  for (const c of cards) {
    if (!c || typeof c.id !== 'number' || !handIds.has(c.id) || seen.has(c.id)) {
      return { ok: false, reason: '牌不属于你的手牌' };
    }
    seen.add(c.id);
  }
  const info = analyzePlay(cards, st.level);
  if (!info) return { ok: false, reason: '牌型不合法' };
  if (st.lastPlay) {
    const prevInfo = analyzePlay(st.lastPlay.cards, st.level);
    if (!prevInfo || !canBeat(prevInfo, info)) return { ok: false, reason: '压不过上一手' };
  }
  return { ok: true };
}

/** 兜底出牌：最小能压 / 最小单张 / 过 */
function fallbackPlay(st, seat) {
  const hand = st.hands[seat] || [];
  if (hand.length === 0) return null;
  if (st.lastPlay) {
    const prevInfo = analyzePlay(st.lastPlay.cards, st.level);
    if (!prevInfo) return null;
    const sorted = [...hand].sort((a, b) => cardVal(a, st.level) - cardVal(b, st.level));
    for (const c of sorted) {
      const info = analyzePlay([c], st.level);
      if (info && canBeat(prevInfo, info)) return [c];
    }
    return null; // 过
  }
  const sorted = [...hand].sort((a, b) => cardVal(a, st.level) - cardVal(b, st.level));
  return [sorted[0]];
}

/** 应用一手牌并广播新状态 */
function applyAndAdvance(room, seat, cards) {
  const st = room.state;
  const check = validatePlay(st, seat, cards);
  if (!check.ok) return check.reason || '非法出牌';
  room.state = gdApplyTurn(st, seat, cards);
  if (room.state.phase === 'over') {
    room.status = 'over';
    clearTimers(room);
  }
  broadcastState(room);
  if (room.state.phase === 'playing') scheduleTurn(room);
  return null;
}

/** AI / 超时代打 */
function autoMove(room, seat, difficulty) {
  const st = room.state;
  if (!st || st.phase !== 'playing' || st.current !== seat) return;
  const hand = st.hands[seat] || [];
  if (hand.length === 0) return;
  let play = null;
  try {
    const res = aiDecide({
      hand,
      level: st.level,
      mySeat: seat,
      lastPlay: st.lastPlay,
      lastPlayBy: st.lastPlayBy,
      handCounts: st.hands.map((h) => h.length),
      finished: st.finished,
      roundPass: st.roundPass,
      difficulty: difficulty || room.difficulty,
    });
    play = Array.isArray(res.play) && res.play.length > 0 ? res.play : null;
  } catch {
    play = null;
  }
  // AI 给出的牌必须合法，否则退回兜底策略
  if (play && !validatePlay(st, seat, play).ok) play = fallbackPlay(st, seat);
  if (!play) play = st.lastPlay ? null : fallbackPlay(st, seat);
  applyAndAdvance(room, seat, play);
}

/** 为当前回合安排定时器：AI 自动出牌 / 掉线托管 / 真人超时兜底 */
function scheduleTurn(room) {
  if (room.aiTimer) { clearTimeout(room.aiTimer); room.aiTimer = null; }
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  const st = room.state;
  if (!st || st.phase !== 'playing') return;
  const seat = st.current;
  const p = room.seats[seat];
  if (!p) return;
  if (p.isAI) {
    room.aiTimer = setTimeout(() => {
      room.aiTimer = null;
      autoMove(room, seat, p.difficulty || room.difficulty);
    }, AI_THINK_MS + Math.floor(Math.random() * 350));
  } else if (!p.online) {
    room.turnTimer = setTimeout(() => {
      room.turnTimer = null;
      autoMove(room, seat, 'medium');
    }, OFFLINE_TURN_MS);
  } else {
    room.turnTimer = setTimeout(() => {
      room.turnTimer = null;
      autoMove(room, seat, 'medium');
    }, HUMAN_TURN_MS);
  }
}

function fillAI(room, aiCount, difficulty) {
  if (aiCount <= 0) return;
  const names = generateAINames(Math.max(aiCount, 3));
  const order = [1, 3, 2];
  let idx = 0;
  let placed = 0;
  for (const seat of order) {
    if (placed >= aiCount) break;
    if (!room.seats[seat]) {
      room.seats[seat] = {
        seat, name: `🤖 ${names[idx] || `AI${idx + 1}`}`, token: null, ws: null,
        isAI: true, online: true, difficulty,
      };
      idx++;
      placed++;
    }
  }
}

function startGame(room, aiCount, difficulty) {
  if (room.status !== 'waiting') return '对局已开始';
  room.difficulty = difficulty || room.difficulty;
  fillAI(room, Math.max(0, Math.min(3, aiCount || 0)), room.difficulty);
  const filled = room.seats.filter(Boolean).length;
  if (filled < 4) return `还差 ${4 - filled} 人（或增加 AI 数量）`;
  const names = room.seats.map((p, i) => p?.name || `玩家${i + 1}`);
  const firstSeat = Math.floor(Math.random() * 4);
  room.state = gdNewGame(2, names, firstSeat, 0, null, () => crypto.randomInt(0, 2 ** 30) / 2 ** 30);
  room.status = 'playing';
  broadcastRoom(room);
  broadcastState(room);
  scheduleTurn(room);
  return null;
}

function nextRound(room) {
  if (!room.state || room.state.phase !== 'over') return '当前不能开下一局';
  const names = room.seats.map((p, i) => p?.name || `玩家${i + 1}`);
  const st = room.state;
  room.state = gdNewGame(
    st.level, names, st.finished[0] ?? 0, st.aStrikes || 0, st.tributePlan,
    () => crypto.randomInt(0, 2 ** 30) / 2 ** 30,
  );
  room.status = 'playing';
  broadcastRoom(room);
  broadcastState(room);
  scheduleTurn(room);
  return null;
}

function seatOf(room, token) {
  if (!token) return -1;
  return room.seats.findIndex((p) => p && p.token && p.token === token);
}

/**
 * 为每个 WebSocket 连接创建掼蛋会话。
 * 返回的 handleMessage 返回 true 表示该消息已被掼蛋协议消费。
 */
export function attachGuandan(ws) {
  const ctx = { roomCode: null, seat: -1, token: crypto.randomUUID() };

  function currentRoom() {
    return ctx.roomCode ? rooms.get(ctx.roomCode) : null;
  }

  function bind(room, seat, token) {
    ctx.roomCode = room.code;
    ctx.seat = seat;
    ctx.token = token;
    const p = room.seats[seat];
    if (p) { p.ws = ws; p.online = true; }
    if (room.disconnectTimers[seat]) {
      clearTimeout(room.disconnectTimers[seat]);
      room.disconnectTimers[seat] = null;
    }
  }

  function welcome(room) {
    send(ws, {
      type: 'GD_WELCOME',
      roomCode: room.code,
      seat: ctx.seat,
      token: ctx.token,
      hostSeat: room.hostSeat,
      status: room.status,
      players: playersPayload(room),
    });
    send(ws, roomPayload(room));
    if (room.state) {
      send(ws, { type: 'GD_STATE', seat: ctx.seat, state: maskStateFor(room.state, ctx.seat) });
    }
  }

  function detach({ graceful }) {
    const room = currentRoom();
    if (!room) return;
    const seat = ctx.seat;
    const p = room.seats[seat];
    ctx.roomCode = null;
    ctx.seat = -1;
    if (!p) return;

    if (room.status === 'waiting') {
      room.seats[seat] = null;
      if (room.hostSeat === seat) {
        const nextHost = room.seats.findIndex((x) => x && !x.isAI);
        if (nextHost >= 0) room.hostSeat = nextHost;
      }
      if (!roomAlive(room)) { destroyRoom(room); return; }
      broadcastRoom(room);
      return;
    }

    // 对局中：保留座位等待重连；超时或主动离开则交给 AI 托管
    p.online = false;
    p.ws = null;
    broadcastRoom(room);
    if (graceful) {
      p.isAI = true;
      p.name = `${p.name}(托管)`;
      p.difficulty = p.difficulty || room.difficulty;
      broadcastRoom(room);
      if (room.state && room.state.current === seat) scheduleTurn(room);
      return;
    }
    room.disconnectTimers[seat] = setTimeout(() => {
      room.disconnectTimers[seat] = null;
      if (!p.online && !p.isAI) {
        p.isAI = true;
        p.name = `${p.name}(托管)`;
        p.difficulty = p.difficulty || room.difficulty;
        broadcastRoom(room);
        if (room.state && room.state.current === seat) scheduleTurn(room);
      }
    }, DISCONNECT_GRACE_MS);
    if (room.state && room.state.current === seat) scheduleTurn(room);
  }

  function handleMessage(msg) {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('GD_')) return false;

    switch (msg.type) {
      case 'GD_CREATE': {
        const name = String(msg.name || '房主').slice(0, 12);
        let room = currentRoom();
        if (room) return true;
        // 若客户端携带旧 token，尝试恢复原房间
        const oldCode = String(msg.roomCode || '').toUpperCase();
        if (oldCode) {
          const old = rooms.get(oldCode);
          const seat = old ? seatOf(old, msg.token) : -1;
          if (old && seat >= 0) {
            bind(old, seat, msg.token);
            welcome(old);
            return true;
          }
        }
        room = createRoom(0, name, ctx.token);
        bind(room, 0, ctx.token);
        welcome(room);
        return true;
      }

      case 'GD_JOIN': {
        const code = String(msg.roomCode || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          send(ws, { type: 'GD_ERROR', code: 'ROOM_NOT_FOUND', message: '房间不存在或已解散' });
          return true;
        }
        // 令牌重连：恢复原座位
        const token = String(msg.token || '');
        const oldSeat = seatOf(room, token);
        if (oldSeat >= 0) {
          bind(room, oldSeat, token);
          welcome(room);
          return true;
        }
        if (room.status !== 'waiting') {
          send(ws, { type: 'GD_ERROR', code: 'ROOM_PLAYING', message: '对局已开始，无法加入' });
          return true;
        }
        const seat = [1, 2, 3].find((s) => !room.seats[s]);
        if (seat === undefined) {
          send(ws, { type: 'GD_ERROR', code: 'ROOM_FULL', message: '房间已满' });
          return true;
        }
        const name = String(msg.name || '玩家').slice(0, 12);
        const newToken = crypto.randomUUID();
        room.seats[seat] = {
          seat, name, token: newToken, ws, isAI: false, online: true, difficulty: 'medium',
        };
        bind(room, seat, newToken);
        welcome(room);
        broadcastRoom(room);
        return true;
      }

      case 'GD_SEAT': {
        const room = currentRoom();
        if (!room || room.status !== 'waiting') return true;
        const want = Number(msg.seat);
        if (!Number.isInteger(want) || want < 0 || want > 3 || want === ctx.seat) return true;
        if (room.seats[want]) {
          send(ws, { type: 'GD_ERROR', code: 'SEAT_TAKEN', message: '该座位已被占用' });
          return true;
        }
        const p = room.seats[ctx.seat];
        if (!p) return true;
        room.seats[ctx.seat] = null;
        p.seat = want;
        room.seats[want] = p;
        if (room.hostSeat === ctx.seat) room.hostSeat = want;
        ctx.seat = want;
        welcome(room);
        broadcastRoom(room);
        return true;
      }

      case 'GD_START': {
        const room = currentRoom();
        if (!room) return true;
        if (ctx.seat !== room.hostSeat) {
          send(ws, { type: 'GD_ERROR', code: 'NOT_HOST', message: '只有房主可以开始对局' });
          return true;
        }
        const err = startGame(room, Number(msg.aiCount) || 0, String(msg.difficulty || 'medium'));
        if (err) send(ws, { type: 'GD_ERROR', code: 'START_FAILED', message: err });
        return true;
      }

      case 'GD_PLAY': {
        const room = currentRoom();
        if (!room) return true;
        const err = applyAndAdvance(room, ctx.seat, msg.cards);
        if (err) send(ws, { type: 'GD_ERROR', code: 'PLAY_REJECTED', message: err });
        return true;
      }

      case 'GD_PASS': {
        const room = currentRoom();
        if (!room) return true;
        const err = applyAndAdvance(room, ctx.seat, null);
        if (err) send(ws, { type: 'GD_ERROR', code: 'PASS_REJECTED', message: err });
        return true;
      }

      case 'GD_NEXT': {
        const room = currentRoom();
        if (!room) return true;
        if (ctx.seat !== room.hostSeat) {
          send(ws, { type: 'GD_ERROR', code: 'NOT_HOST', message: '只有房主可以开下一局' });
          return true;
        }
        const err = nextRound(room);
        if (err) send(ws, { type: 'GD_ERROR', code: 'NEXT_FAILED', message: err });
        return true;
      }

      case 'GD_LEAVE': {
        detach({ graceful: true });
        send(ws, { type: 'GD_LEFT' });
        return true;
      }

      case 'GD_PING': {
        send(ws, { type: 'GD_PONG', timestamp: Date.now() });
        return true;
      }

      default:
        return true;
    }
  }

  function handleClose() {
    detach({ graceful: false });
  }

  return { handleMessage, handleClose };
}

// 定期回收僵尸房间
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const ttl = room.status === 'waiting' ? ROOM_IDLE_MS : ROOM_PLAYING_MS;
    if (now - room.createdAt > ttl && !roomAlive(room)) destroyRoom(room);
  }
}, 60 * 1000).unref?.();

export { rooms };
