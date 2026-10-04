/**
 * 掼蛋 · 联机对战（四人两两组队，PeerJS P2P 星型 + AI 补位）
 * 房主(座位0)为中枢：发牌、回合仲裁、广播完整状态；其余玩家通过房间码连接房主。
 * 人数不足时可用 AI 补位，支持 1 人 + 3AI / 2 人 + 2AI / 3 人 + 1AI
 * 消息协议：JOIN / WELCOME / ROOM_STATE / STATE / PLAY / PASS / ERROR / LEAVE / AI_PLAY
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { enterFullscreen, exitFullscreen } from '../utils/fullscreen';
import { loadPeerJS, reloadPeerJS } from '../utils/peerjsLoader';
import {
  type GCard, type PlayInfo, analyzePlay, canBeat, cardVal, rankName,
  buildDeck, shuffle, groupHand, groupByR, GD_ZONES, SUIT_SYMBOL, isWild, levelRank, findSeq,
} from './GuandanGame';
import {
  aiDecide, generateAINames,
  type GDAIDifficulty, type AIPlayer,
} from '../engine/guandanAI';

// ================================================================
// 座位与队伍：0=房主(南) 2=队友(北) 1/3=对手
// ================================================================
const SEAT_NAMES = ['房主', '对手A', '队友', '对手B'];
function teamOf(seat: number): number { return seat === 0 || seat === 2 ? 0 : 1; }

// ================================================================
// 联机状态（与 GuandanGame 的 GameState 同构，lastPlay 只保留 cards）
// ================================================================
export interface GDOnlineState {
  hands: GCard[][];
  level: number;
  current: number;
  lastPlay: { player: number; cards: GCard[] } | null;
  lastPlayBy: number;
  turnStart: number;
  finished: number[];
  roundPass: number[];
  /** 本轮各方位已出的牌（一轮出完才清理），用于方位展示 */
  roundPlays: { player: number; cards: GCard[] }[];
  /** 一圈全过后标记为 true：保留出牌信息显示，直到下一次出牌才清除 */
  roundEnded: boolean;
  phase: 'playing' | 'over';
  winnerTeam: number | null;
  resultText: string;
  playerNames: string[];
  /** 打 A 连续未过局数（连续 3 把不过退回 2 重新打） */
  aStrikes: number;
  /** 双下进贡计划（结算时设置，下一局发牌后自动进贡/还贡） */
  tributePlan: { from: number; to: number }[] | null;
  /** 进贡/还贡提示（新一局开始时展示一次） */
  gongMessage: string;
}

// ================================================================
// 纯函数状态机（房主侧）：applyTurn(state, player, playCards|null)
// ================================================================
// 找到下一个未出完（未 finished）的玩家：头游后跳过，避免轮到空手玩家
export function nextAliveSeat(from: number, finished: number[]): number {
  let s = ((from % 4) + 4) % 4;
  for (let i = 0; i < 4; i++) {
    const p = (s + i) % 4;
    if (!finished.includes(p)) return p;
  }
  return s;
}

export function gdApplyTurn(prev: GDOnlineState, player: number, play: GCard[] | null): GDOnlineState {
  const hands = prev.hands.map((h) => [...h]);
  const roundPass = [...prev.roundPass];
  const finished = [...prev.finished];
  // 出牌时：若上一轮已结束（roundEnded），清除旧 roundPlays 重新开始；否则追加
  const roundPlays = play
    ? (prev.roundEnded ? [{ player, cards: play }] : [...prev.roundPlays, { player, cards: play }])
    : prev.roundPlays;

  if (play) {
    hands[player] = hands[player].filter((c) => !play.some((p) => p.id === c.id));
    if (hands[player].length === 0) {
      finished.push(player);
      if (finished.length === 4) {
        const order = finished;
        const myTeamWon = teamOf(order[0]) === 0;
        let up: number; let txt: string;
        let tributePlan: { from: number; to: number }[] | null = null;
        if (myTeamWon) {
          if (teamOf(order[1]) === 0) { up = 3; txt = '双下！升 3 级'; tributePlan = [{ from: order[3], to: order[0] }, { from: order[2], to: order[1] }]; }
          else if (teamOf(order[2]) === 0) { up = 2; txt = '升 2 级'; }
          else { up = 1; txt = '升 1 级'; }
        } else {
          if (teamOf(order[1]) === 1) { up = 3; txt = '对方双下，升 3 级'; tributePlan = [{ from: order[3], to: order[0] }, { from: order[2], to: order[1] }]; }
          else if (teamOf(order[2]) === 1) { up = 2; txt = '对方升 2 级'; }
          else { up = 1; txt = '对方升 1 级'; }
        }
        let newLevel = prev.level + up;
        let resultText = txt;
        let winnerTeam: number | null = null;
        let aStrikes = prev.aStrikes || 0;
        if (prev.level === 14) {
          // 打 A 中：必须双上（己方 1、2 名）才算过 A 获胜
          if (myTeamWon && up >= 3) {
            winnerTeam = 0; newLevel = 14; aStrikes = 0;
            resultText = '🏆 双上打过 A！房主队获胜！';
          } else if (!myTeamWon && up >= 3) {
            // 对方双上打过 A：退回 2 重新打
            newLevel = 2; aStrikes = 0;
            resultText = '对方双上打过 A，退回 2 重新打';
          } else {
            aStrikes += 1;
            if (aStrikes >= 3) {
              newLevel = 2; aStrikes = 0;
              resultText = '连续 3 把未过 A，退回 2 重新打';
            } else {
              newLevel = 14;
              resultText = `打 A 未过（第 ${aStrikes} 把，连 3 把不过退回 2）`;
            }
          }
        } else if (newLevel > 14) {
          // 升超 A：一律停在 14（A）继续打 A 局，不直接判胜（打 A 须双上才赢）
          newLevel = 14;
          resultText = myTeamWon ? '🚀 打到 A！下一局双上即获胜！' : '对方打到 A，我方须双上才赢';
        } else if (newLevel === 14) {
          resultText = myTeamWon ? '🚀 打到 A！下一局双上即获胜！' : '对方打到 A，我方须双上才赢';
        }
        return {
          ...prev, hands, roundPass: [], roundPlays, roundEnded: false, finished, phase: 'over', winnerTeam, resultText,
          level: newLevel, aStrikes, tributePlan, current: order[0], lastPlay: null, lastPlayBy: -1,
        };
      }
    }
    return {
      ...prev, hands,
      lastPlay: { player, cards: play }, lastPlayBy: player, roundPass: [], roundPlays, roundEnded: false,
      current: nextAliveSeat(player + 1, finished), turnStart: nextAliveSeat(player + 1, finished),
    };
  }
  // 不出
  roundPass.push(player);
  // 一圈结束：除最后出牌者外，所有未出完玩家都已 pass
  // （有玩家头游后活人数减少，pass 满 3 可能永远不满足 → 按"活人-1"判定，避免上一轮牌面残留）
  const aliveNotBy = [0, 1, 2, 3].filter((p) => !finished.includes(p) && p !== prev.lastPlayBy);
  if (roundPass.length >= Math.max(1, aliveNotBy.length)) {
    // 一圈全过 → 立即清空四家出牌信息，下一轮出牌从零开始
    // 接风规则：最后出牌者已出完（头游）时，由其对家（队友）接风自由出牌；否则最后出牌者自由出牌
    const freer = finished.includes(prev.lastPlayBy)
      ? (finished.includes(prev.lastPlayBy ^ 2) ? nextAliveSeat(prev.lastPlayBy + 1, finished) : prev.lastPlayBy ^ 2)
      : prev.lastPlayBy;
    return { ...prev, hands, roundPass: [], roundPlays: [], roundEnded: true, current: freer, lastPlay: null, lastPlayBy: freer };
  }
  return { ...prev, hands, roundPass, roundPlays, current: nextAliveSeat(player + 1, finished) };
}

export function gdNewGame(level: number, names: string[], firstSeat: number, keepStrikes = 0, tributePlan: { from: number; to: number }[] | null = null): GDOnlineState {
  const deck = shuffle(buildDeck());
  const hands: GCard[][] = [[], [], [], []];
  deck.forEach((c, i) => hands[i % 4].push(c));
  // 双下进贡/还贡：末游/三游进贡给头游/二游最大牌，头游/二游还一张 ≤10 的牌
  let gong = '';
  if (tributePlan && tributePlan.length > 0) {
    for (const t of tributePlan) {
      const from = hands[t.from];
      const to = hands[t.to];
      if (from.length === 0 || to.length === 0) continue;
      let maxIdx = 0;
      for (let i = 1; i < from.length; i++) {
        if (cardVal(from[i], level) > cardVal(from[maxIdx], level)) maxIdx = i;
      }
      const given = from.splice(maxIdx, 1)[0];
      let backIdx = -1;
      for (let i = 0; i < to.length; i++) {
        const c = to[i];
        if (c.k === undefined && cardVal(c, level) <= 10 && !isWild(c, level)) {
          if (backIdx < 0 || cardVal(c, level) < cardVal(to[backIdx], level)) backIdx = i;
        }
      }
      if (backIdx >= 0) {
        const back = to.splice(backIdx, 1)[0];
        to.push(given);
        from.push(back);
        gong += `${names[t.from] || SEAT_NAMES[t.from]} 进贡 ${rankName(given.r)}${given.k === undefined ? SUIT_SYMBOL[given.s] : (given.k === 1 ? '大王' : '小王')}，${names[t.to] || SEAT_NAMES[t.to]} 还贡 ${rankName(back.r)}${SUIT_SYMBOL[back.s]}；`;
      } else {
        to.push(given);
        gong += `${names[t.from] || SEAT_NAMES[t.from]} 进贡 ${rankName(given.r)}${given.k === undefined ? SUIT_SYMBOL[given.s] : (given.k === 1 ? '大王' : '小王')}；`;
      }
    }
    gong = `🔄 ${gong}`;
  }
  return {
    hands, level, current: firstSeat, lastPlay: null, lastPlayBy: -1, turnStart: firstSeat,
    finished: [], roundPass: [], roundPlays: [], roundEnded: false, phase: 'playing', winnerTeam: null, resultText: '', playerNames: names,
    aStrikes: keepStrikes, tributePlan: null, gongMessage: gong,
  };
}

// ================================================================
// PeerJS 封装 + ICE 配置 + 多信令服务器
// 优先级：TURNS(TLS/443) > TURN TCP(443) > TURN UDP(443) > STUN
// 确保校园网/移动网络下能通过中继建立连接
// 多信令节点：0.peerjs.com ~ 3.peerjs.com，自动切换避免单点故障
// ================================================================
// 使用统一的多 CDN 回退加载器（src/utils/peerjsLoader.ts）
// 支持 jsdelivr / unpkg / cdnjs / npmmirror / esm.sh 多源自动降级

const PEER_SERVERS = [
  // Cloudflare 默认节点（与五子棋联机一致，国内可达性更稳）：不传 host/port/path/secure，走 PeerJS 默认
  { host: '', port: 443, secure: true, path: '/', cloudflare: true },
  { host: '0.peerjs.com', port: 443, secure: true, path: '/' },
  { host: '1.peerjs.com', port: 443, secure: true, path: '/' },
  { host: '2.peerjs.com', port: 443, secure: true, path: '/' },
  { host: '3.peerjs.com', port: 443, secure: true, path: '/' },
];

const ICE_SERVERS = [
  { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:relay.metered.ca:80?transport=tcp' },
  { urls: 'turn:eu-0.turn.peerjs.com:443?transport=tcp', username: 'peerjs', credential: 'peerjsp' },
  { urls: 'turn:eu-0.turn.peerjs.com:443', username: 'peerjs', credential: 'peerjsp' },
  { urls: 'turn:eu-0.turn.peerjs.com:3478?transport=tcp', username: 'peerjs', credential: 'peerjsp' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 生成房间号：6位字母数字 + 1位节点序号(0-3) = 共7位
 * 新格式：ABCDEF0 → 节点0
 * 旧格式兼容：6位纯字母数字 → 视为节点0
 */
function generateRoomCode(serverIdx = 0): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return code + String(serverIdx);
}

/**
 * 解析房间号 → { peerId, serverIdx }
 * - 7位且末位为数字 → 新格式，末位为节点序号
 * - 6位 → 旧格式，默认节点0
 * - 其他情况 → 原样返回，节点0
 */
function parseRoomCode(code: string): { peerId: string; serverIdx: number } {
  const c = (code || '').trim().toUpperCase();
  if (c.length === 7 && c[6] >= '0' && c[6] <= '3') {
    return { peerId: c.slice(0, 6), serverIdx: Number(c[6]) };
  }
  return { peerId: c, serverIdx: 0 };
}

/** 带重试的消息发送：若 DataChannel 正在连接中，等待后重试 */
async function sendWithRetry(conn: any, data: string, maxRetries = 3): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (!conn) return false;
    const ch = conn.dataChannel || conn.channel || conn._dc;
    if (conn.open && (!ch || ch.readyState === 'open')) {
      try {
        conn.send(data);
        return true;
      } catch {
        // 发送失败，等待后重试
      }
    }
    // DataChannel 正在连接中，等待 200ms 后重试
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return false;
}

// ================================================================
// 组件
// ================================================================
export const GuandanOnlineGame: React.FC<{ autoJoinRoom?: string | null }> = ({ autoJoinRoom }) => {
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [status, setStatus] = useState<'lobby' | 'connecting' | 'waiting' | 'playing' | 'error'>('lobby');
  const [players, setPlayers] = useState<string[]>(['', '', '', '']); // 各座位名字
  const [game, setGame] = useState<GDOnlineState | null>(null);
  const [mySeat, setMySeat] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<'rank' | 'grouped'>('rank');
  const [sortScheme, setSortScheme] = useState(0); // 0~3 四套理牌方案循环切换
  const [notice, setNotice] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [copied, setCopied] = useState(false);
  // 浮动窗口全屏（对局时默认开启）+ 左上角 ☰ 折叠菜单
  const [floating, setFloating] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const enteredFsRef = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const peerRef = useRef<any>(null);
  const connsRef = useRef<any[]>([]); // host：已连接的 guest connections
  const connRef = useRef<any>(null);  // guest：到 host 的连接
  const myNameRef = useRef('玩家');
  const statusRef = useRef(status);
  statusRef.current = status;

  // AI 玩家状态（仅房主侧有效）
  const [aiPlayers, setAiPlayers] = useState<AIPlayer[]>([]);
  const [aiDifficulty, setAiDifficulty] = useState<GDAIDifficulty>('medium');
  const [aiCount, setAiCount] = useState(2); // 默认 2 个 AI（房主+好友 vs 2AI）
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============ 复制房间号 ============
  const copyRoomCode = useCallback(() => {
    if (!roomCode) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(roomCode).catch(() => {});
      } else {
        const ta = document.createElement('textarea');
        ta.value = roomCode; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
    } catch {}
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [roomCode]);

  // ============ 消息发送 ============
  const sendAll = useCallback((msg: object) => {
    const data = JSON.stringify(msg);
    for (const c of connsRef.current) {
      sendWithRetry(c, data).catch(() => {});
    }
  }, []);

  const sendToHost = useCallback(async (msg: object) => {
    const data = JSON.stringify(msg);
    const ok = await sendWithRetry(connRef.current, data);
    if (!ok) {
      setNotice('⚠ 连接不稳定，正在重连…请稍候再试');
      console.warn('[gd-online] sendToHost failed: channel not ready');
    }
  }, []);

  // ============ 广播完整状态 ============
  const broadcastState = useCallback((st: GDOnlineState) => {
    sendAll({ type: 'STATE', state: st });
  }, [sendAll]);

  // ============ 房间事件 ============
  const onHostMessage = useCallback((conn: any, raw: string) => {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'JOIN') {
      const existing = connsRef.current.find((c) => c === conn);
      if (!existing) {
        connsRef.current.push(conn);
        // 分配座位：第一个=2(队友)，第二个=1，第三个=3
        const seats = connsRef.current.length;
        const seat = seats === 1 ? 2 : seats === 2 ? 1 : 3;
        const name = (msg.name || '玩家').slice(0, 12);
        conn._gdSeat = seat;
        conn._gdName = name;
        setPlayers((p) => { const np = [...p]; np[seat] = name; return np; });
        try { conn.send(JSON.stringify({ type: 'WELCOME', seat, name })); } catch {}
        // 同步房间人员到所有 guest（按座位位置构建玩家列表）
        const playerList: string[] = ['房主', '', '', ''];
        for (const c of connsRef.current) {
          if (c._gdSeat !== undefined) playerList[c._gdSeat] = c._gdName || '玩家';
        }
        sendAll({ type: 'ROOM_STATE', players: playerList });
      }
    } else if (msg.type === 'PLAY' || msg.type === 'PASS') {
      const seat = conn._gdSeat;
      if (seat === undefined) return;
      setGame((prev) => {
        if (!prev || prev.phase !== 'playing' || prev.current !== seat) return prev;
        const cards = msg.type === 'PLAY' ? (msg.cards || []) : null;
        if (cards) {
          // 服务端校验：牌必须属于该玩家手牌、牌型合法、且能压过上一手（防异常客户端/越权出牌）
          if (cards.length === 0) return prev;
          const handIds = new Set(prev.hands[seat].map((c) => c.id));
          if (!cards.every((c: any) => c && typeof c.id === 'number' && handIds.has(c.id))) return prev;
          const info = analyzePlay(cards, prev.level);
          if (!info) return prev;
          if (prev.lastPlay) {
            const prevInfo = analyzePlay(prev.lastPlay.cards, prev.level);
            if (!prevInfo || !canBeat(prevInfo, info)) return prev;
          }
        }
        const next = gdApplyTurn(prev, seat, cards);
        broadcastState(next);
        return next;
      });
    } else if (msg.type === 'LEAVE') {
      const idx = connsRef.current.indexOf(conn);
      if (idx >= 0) {
        connsRef.current.splice(idx, 1);
        const seat = conn._gdSeat;
        if (seat !== undefined) {
          setPlayers((p) => { const np = [...p]; np[seat] = ''; return np; });
          const playerList: string[] = ['房主', '', '', ''];
          for (const c of connsRef.current) {
            if (c._gdSeat !== undefined) playerList[c._gdSeat] = c._gdName || '玩家';
          }
          sendAll({ type: 'ROOM_STATE', players: playerList });
          setNotice(`玩家「${conn._gdName || '玩家'}」已离开`);
        }
      }
    }
  }, [broadcastState]);

  const onGuestMessage = useCallback((raw: string) => {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'WELCOME') {
      setMySeat(msg.seat);
      setStatus('waiting');
    } else if (msg.type === 'ROOM_STATE') {
      const names: string[] = ['房主', ...(msg.players || [])];
      setPlayers((p) => {
        const np = [...p];
        names.forEach((n, i) => { if (n) np[i] = n; });
        return np;
      });
    } else if (msg.type === 'STATE') {
      setGame(msg.state);
      setStatus('playing');
      setNotice('');
      setSelected([]);
      // 进入对局：默认浮动窗口全屏，隐藏浏览器窗口（桌面全屏 / iOS 沉浸兜底）
      setFloating(true);
      if (!enteredFsRef.current) {
        enteredFsRef.current = true;
        try { enterFullscreen(); } catch { /* 忽略 */ }
      }
    } else if (msg.type === 'ERROR') {
      setNotice(msg.message || '错误');
    }
  }, []);

  // ============ 创建房间（房主）—— 多信令节点自动选择 ============
  const createRoom = useCallback(async () => {
    setRole('host');
    setStatus('connecting');
    setErrorDetail('');
    setPlayers((p) => { const np = [...p]; np[0] = '房主'; return np; });

    // 随机选择起始节点，均衡负载
    const startIdx = Math.floor(Math.random() * PEER_SERVERS.length);
    const serverOrder: number[] = [];
    for (let i = 0; i < PEER_SERVERS.length; i++) {
      serverOrder.push((startIdx + i) % PEER_SERVERS.length);
    }

    let lastErr: any = null;
    for (const serverIdx of serverOrder) {
      try {
        const code = generateRoomCode(serverIdx);
        const result = await tryCreateRoom(code, serverIdx);
        if (result.success) {
          setRoomCode(code);
          setStatus('waiting');
          setNotice('房间已创建，等待其他玩家加入…');
          return;
        }
        lastErr = result.error;
        // unavailable-id：换个房间码重试当前节点
        if (result.error?.type === 'unavailable-id') {
          for (let retry = 0; retry < 3; retry++) {
            const altCode = generateRoomCode(serverIdx);
            const r2 = await tryCreateRoom(altCode, serverIdx);
            if (r2.success) {
              setRoomCode(altCode);
              setStatus('waiting');
              setNotice('房间已创建，等待其他玩家加入…');
              return;
            }
            lastErr = r2.error;
          }
        }
        // 其他错误：尝试下一个节点
      } catch (err) {
        lastErr = err;
      }
    }

    // 全部失败
    setStatus('error');
    setNotice('房间创建失败');
    setErrorDetail(lastErr?.type || lastErr?.message || '所有信令服务器均无法连接');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onHostMessage]);

  /** 尝试在指定信令节点创建房间 */
  async function tryCreateRoom(code: string, serverIdx: number): Promise<{ success: boolean; error?: any }> {
    return new Promise(async (resolve) => {
      let settled = false;
      const server = PEER_SERVERS[serverIdx];
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { peerRef.current?.destroy(); } catch {}
          resolve({ success: false, error: { type: 'signal-timeout', message: `信令服务器 ${server.host} 连接超时` } });
        }
      }, 8000);

      try {
        const Peer = await loadPeerJS();
        const opts: any = server.cloudflare
          ? { debug: 0, config: { iceServers: ICE_SERVERS } }
          : {
              debug: 0,
              host: server.host,
              port: server.port,
              path: server.path,
              secure: server.secure,
              config: { iceServers: ICE_SERVERS },
            };
        const peer = new Peer(parseRoomCode(code).peerId, opts);
        peerRef.current = peer;

        peer.on('error', (err: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { peer.destroy(); } catch {}
          resolve({ success: false, error: err });
        });

        peer.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // 设置连接监听
          peer.on('connection', (incoming: any) => {
            incoming.on('open', () => { if (statusRef.current === 'waiting') setStatus('waiting'); });
            incoming.on('data', (d: any) => onHostMessage(incoming, typeof d === 'string' ? d : JSON.stringify(d)));
            incoming.on('close', () => onHostMessage(incoming, JSON.stringify({ type: 'LEAVE' })));
            incoming.on('error', () => onHostMessage(incoming, JSON.stringify({ type: 'LEAVE' })));
          });
          resolve({ success: true });
        });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ success: false, error: err });
      }
    });
  }

  // ============ 加入房间（来宾）—— 多信令节点自动遍历 ============
  const joinRoom = useCallback(async (code: string) => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setRoomCode(c);
    setRole('guest');
    setStatus('connecting');
    setErrorDetail('');

    const { peerId, serverIdx: hintIdx } = parseRoomCode(c);
    // 优先尝试房间号指定的节点，然后依次尝试其他所有节点
    const serverOrder: number[] = [hintIdx];
    for (let i = 0; i < PEER_SERVERS.length; i++) {
      if (i !== hintIdx) serverOrder.push(i);
    }

    const errors: string[] = [];
    let attempt = 0;

    for (const serverIdx of serverOrder) {
      attempt++;
      setNotice(`正在连接（${attempt}/${PEER_SERVERS.length}）…`);
      const result = await tryJoinRoom(peerId, serverIdx);
      if (result.success) return;
      const server = PEER_SERVERS[serverIdx];
      errors.push(`${server.host}: ${result.errorType || result.errorMsg || '未知错误'}`);
      // peer-unavailable：继续尝试下一个节点
      // 其他错误：也继续尝试（可能该节点暂时不可用）
    }

    // 全部失败
    const lastType = errors[errors.length - 1]?.split(': ')[1];
    setStatus('error');
    if (lastType === 'peer-unavailable') {
      setNotice('未找到房间，请确认房间号是否正确');
    } else if (lastType === 'signal-timeout') {
      setNotice('连接超时，请检查网络');
    } else {
      setNotice('加入房间失败');
    }
    setErrorDetail(`已尝试 ${PEER_SERVERS.length} 个信令服务器：\n` + errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGuestMessage]);

  /** 尝试在指定信令节点加入房间 */
  async function tryJoinRoom(hostPeerId: string, serverIdx: number): Promise<{ success: boolean; errorType?: string; errorMsg?: string }> {
    return new Promise(async (resolve) => {
      let settled = false;
      const server = PEER_SERVERS[serverIdx];
      const signalTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { peerRef.current?.destroy(); } catch {}
          resolve({ success: false, errorType: 'signal-timeout', errorMsg: '信令服务器连接超时' });
        }
      }, 8000);

      try {
        const Peer = await loadPeerJS();
        const guestId = `${hostPeerId}-g${Math.floor(Math.random() * 100000)}`;
        const opts: any = server.cloudflare
          ? { debug: 0, config: { iceServers: ICE_SERVERS } }
          : {
              debug: 0,
              host: server.host,
              port: server.port,
              path: server.path,
              secure: server.secure,
              config: { iceServers: ICE_SERVERS },
            };
        const peer = new Peer(guestId, opts);
        peerRef.current = peer;

        let connectTimer: ReturnType<typeof setTimeout> | null = null;

        peer.on('error', (err: any) => {
          if (settled) return;
          settled = true;
          if (connectTimer) clearTimeout(connectTimer);
          clearTimeout(signalTimer);
          try { peer.destroy(); } catch {}
          resolve({ success: false, errorType: err?.type, errorMsg: err?.message });
        });

        peer.on('open', () => {
          if (settled) return;
          const conn = peer.connect(hostPeerId, { reliable: true });
          connRef.current = conn;

          connectTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            clearTimeout(signalTimer);
            try { conn.close(); peer.destroy(); } catch {}
            resolve({ success: false, errorType: 'connect-timeout', errorMsg: '对方无响应' });
          }, 15000);

          conn.on('open', () => {
            if (settled) return;
            settled = true;
            if (connectTimer) clearTimeout(connectTimer);
            clearTimeout(signalTimer);
            conn.send(JSON.stringify({ type: 'JOIN', name: myNameRef.current }));
            // 设置消息监听
            conn.on('data', (d: any) => onGuestMessage(typeof d === 'string' ? d : JSON.stringify(d)));
            conn.on('close', () => {
              setStatus('error');
              setNotice('与房主连接已断开');
            });
            resolve({ success: true });
          });

          conn.on('error', () => {
            if (settled) return;
            settled = true;
            if (connectTimer) clearTimeout(connectTimer);
            clearTimeout(signalTimer);
            try { peer.destroy(); } catch {}
            resolve({ success: false, errorType: 'conn-error', errorMsg: '连接建立失败' });
          });
        });
      } catch (err: any) {
        if (settled) return;
        settled = true;
        clearTimeout(signalTimer);
        resolve({ success: false, errorType: 'init-error', errorMsg: err?.message || '初始化失败' });
      }
    });
  }

  // ============ 房主：开始对局（支持 AI 补位） ============
  const startGame = useCallback(() => {
    const realPlayers = connsRef.current.length + 1; // 房主 + 来宾
    const needAI = Math.max(0, 4 - realPlayers);

    if (needAI > aiCount) {
      setNotice(`还需 ${needAI - aiCount} 名玩家或增加 AI 数量才能开局`);
      return;
    }

    // 分配 AI 座位：先填满空位
    const aiNames = generateAINames(needAI);
    const aiDifficulties: GDAIDifficulty[] = [];
    for (let i = 0; i < needAI; i++) aiDifficulties.push(aiDifficulty);

    // 收集所有玩家信息
    const playerNames: string[] = ['房主', '', '', ''];
    const newAiPlayers: AIPlayer[] = [];

    // 已连接的真实玩家
    for (const c of connsRef.current) {
      if (c._gdSeat !== undefined) {
        playerNames[c._gdSeat] = c._gdName || '玩家';
      }
    }

    // 分配 AI 到空座位（按座位 1→3→2 顺序：先填对手位，再填队友位）
    // 房主(0) + 好友(2) = 我方，AI(1) + AI(3) = 对方
    const emptySeats = [1, 3, 2].filter(s => !playerNames[s]);
    for (let i = 0; i < needAI && i < emptySeats.length; i++) {
      const seat = emptySeats[i];
      playerNames[seat] = `🤖 ${aiNames[i]}`;
      newAiPlayers.push({ seat, name: `🤖 ${aiNames[i]}`, difficulty: aiDifficulties[i] });
    }

    setAiPlayers(newAiPlayers);
    setPlayers(playerNames);

    const st = gdNewGame(2, playerNames, Math.floor(Math.random() * 4));
    setGame(st);
    broadcastState(st);
    setStatus('playing');
    setNotice('');
    setErrorDetail('');
    setFloating(true);
    if (!enteredFsRef.current) {
      enteredFsRef.current = true;
      try { enterFullscreen(); } catch { /* 忽略 */ }
    }
  }, [aiCount, aiDifficulty, broadcastState]);

  // ============ 房主：重新发牌（下一局） ============
  const nextRound = useCallback(() => {
    if (!game) return;
    // 保留 AI 玩家名字
    const names = [...game.playerNames];
    // 真实玩家名字同步
    names[0] = '房主';
    for (const c of connsRef.current) {
      if (c._gdSeat !== undefined) names[c._gdSeat] = c._gdName || '玩家';
    }
    const st = gdNewGame(game.level, names, game.finished[0] ?? 0, game.aStrikes || 0, game.tributePlan);
    setGame(st);
    broadcastState(st);
  }, [game, broadcastState]);

  // ============ 我的回合操作 ============
  const isMyTurn = !!game && game.phase === 'playing' && game.current === mySeat && !game.finished.includes(mySeat);
  const myHand = game ? game.hands[mySeat] : [];

  const doPlay = () => {
    if (!isMyTurn) return;
    const cards = myHand.filter((c) => selected.includes(c.id));
    if (cards.length === 0) return;
    if (role === 'host') {
      setGame((prev) => {
        if (!prev || prev.current !== 0) return prev;
        const next = gdApplyTurn(prev, 0, cards);
        broadcastState(next);
        return next;
      });
      setSelected([]);
    } else {
      sendToHost({ type: 'PLAY', cards }).then(() => {
        setSelected([]);
      });
    }
  };

  const doPass = () => {
    if (!isMyTurn || !game?.lastPlay) return;
    if (role === 'host') {
      setGame((prev) => {
        if (!prev || prev.current !== 0) return prev;
        const next = gdApplyTurn(prev, 0, null);
        broadcastState(next);
        return next;
      });
      setSelected([]);
    } else {
      sendToHost({ type: 'PASS' }).then(() => {
        setSelected([]);
      });
    }
  };

  // 连续点击提示：依次切换所有可压方案（先同型从小到大，再炸弹/同花顺/王炸），不限同类牌型
  const hintBeatsRef = useRef<number[][]>([]);
  const hintKeyRef = useRef('');
  const hintIdxRef = useRef(-1);
  const applyHint = () => {
    if (!game || !isMyTurn) return;
    if (!game.lastPlay) {
      const g = groupByR(myHand);
      let best: GCard[] | null = null;
      for (const gr of g.values()) {
        if (!best || cardVal(gr[0], game.level) < cardVal(best[0], game.level)) best = gr.slice(0, 1);
      }
      if (best) setSelected(best.map((c) => c.id));
      return;
    }
    const prevInfo = analyzePlay(game.lastPlay.cards, game.level)!;
    const key = `${game.lastPlayBy}:${game.lastPlay.cards.map((c) => c.id).join(',')}`;
    if (hintKeyRef.current !== key) {
      hintKeyRef.current = key;
      hintIdxRef.current = -1;
      hintBeatsRef.current = allBeats(myHand, prevInfo, game.level).map((b) => b.map((c) => c.id));
    }
    const beats = hintBeatsRef.current;
    if (!beats.length) return;
    hintIdxRef.current = (hintIdxRef.current + 1) % beats.length;
    setSelected(beats[hintIdxRef.current]);
  };

  // 所有炸弹候选（4炸→5炸→同花顺→王炸 升序）
  function bombCandidates(hand: GCard[], level: number): { cards: GCard[]; kind: number; n: number; key: number }[] {
    const groups = groupByR(hand);
    const kings = hand.filter((c) => c.k !== undefined);
    const out: { cards: GCard[]; kind: number; n: number; key: number }[] = [];
    for (const g of groups.values()) {
      if (g.some((c) => c.k !== undefined)) continue;
      if (g.length >= 4) out.push({ cards: g.slice(0, 4), kind: 0, n: g.length, key: cardVal(g[0], level) });
    }
    for (const s of ['S', 'H', 'C', 'D']) {
      const sc = hand.filter((c) => c.s === s && c.k === undefined);
      const ranks = [...new Set(sc.map((c) => c.r))].filter((r) => r >= 3 && r <= 14).sort((a, b) => b - a);
      for (let i = 0; i + 4 < ranks.length; i++) {
        let len = 1;
        while (i + len < ranks.length && ranks[i + len] === ranks[i] - len) len++;
        if (len >= 5) {
          const want = ranks.slice(i, i + 5);
          const cards = want.map((r) => sc.find((c) => c.r === r)!);
          out.push({ cards, kind: 1, n: 5, key: want[0] });
          i += 4;
        }
      }
    }
    if (kings.length === 4) out.push({ cards: kings, kind: 2, n: 4, key: 0 });
    out.sort((a, b) => (a.kind !== b.kind ? a.kind - b.kind : (a.kind === 0 ? (a.n !== b.n ? a.n - b.n : a.key - b.key) : (a.kind === 1 ? a.key - b.key : 0))));
    return out;
  }

  // 所有能压 prev 的方案（同型从小到大 + 炸弹/同花顺/王炸），供连续点击提示循环切换
  function allBeats(hand: GCard[], prev: PlayInfo, level: number): GCard[][] {
    const out: GCard[][] = [];
    const push = (cards: GCard[]) => {
      const info = analyzePlay(cards, level);
      if (info && canBeat(prev, info)) out.push(cards);
    };
    const groups = groupByR(hand);
    const norm = [...groups.values()].filter((g) => !g.some((c) => c.k !== undefined));
    if (prev.type === 'SINGLE') {
      const cands: GCard[] = [];
      for (const g of norm) cands.push(g[0]);
      for (const k of hand.filter((c) => c.k !== undefined)) cands.push(k);
      cands.sort((a, b) => cardVal(a, level) - cardVal(b, level));
      cands.forEach((c) => push([c]));
    } else if (prev.type === 'PAIR') {
      norm.filter((g) => g.length >= 2).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level)).forEach((g) => push(g.slice(0, 2)));
    } else if (prev.type === 'TRIPLE') {
      norm.filter((g) => g.length >= 3).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level)).forEach((g) => push(g.slice(0, 3)));
    } else if (prev.type === 'TRIPLE_PAIR') {
      for (const t of norm.filter((g) => g.length >= 3).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level))) {
        const p = norm.find((g) => g !== t && g.length >= 2);
        if (p) push([...t.slice(0, 3), ...p.slice(0, 2)]);
      }
    } else if (prev.type === 'STRAIGHT') {
      for (let min = prev.key + 1; min <= 10; min++) { const seq = findSeq(hand, 5, min - 1, false); if (seq) push(seq); }
    } else if (prev.type === 'PAIR_SEQ') {
      for (let min = prev.key + 2; min <= 14; min += 2) { const seq = findSeq(hand, prev.size, min - 1, true); if (seq) push(seq); }
    } else if (prev.type === 'PLANE') {
      for (let min = prev.key + 3; min <= 14; min += 3) { const seq = findSeq(hand, prev.size, min - 1, false, true); if (seq) push(seq); }
    }
    for (const b of bombCandidates(hand, level)) push(b.cards);
    return out;
  }

  // ============ 自动加入（微信引导页跳转） ============
  useEffect(() => {
    if (autoJoinRoom) {
      joinRoom(autoJoinRoom);
    }
    return () => {
      try { if (peerRef.current) peerRef.current.destroy(); } catch {}
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 浮动全屏时隐藏页面上下红色导航栏（header/nav），只显示棋盘容器
  useEffect(() => {
    if (floating) document.body.classList.add('gd-float-active');
    else document.body.classList.remove('gd-float-active');
    return () => document.body.classList.remove('gd-float-active');
  }, [floating]);

  // ============ AI 自动出牌驱动（仅房主侧） ============
  useEffect(() => {
    if (role !== 'host') return;
    if (!game || game.phase !== 'playing') return;
    if (status !== 'playing') return;
    if (aiPlayers.length === 0) return;

    const currentSeat = game.current;
    const aiPlayer = aiPlayers.find(ai => ai.seat === currentSeat);
    if (!aiPlayer) return; // 不是 AI 回合

    // 检查 AI 是否已经出完
    if (game.finished.includes(currentSeat)) return;

    // 延迟出牌，模拟思考
    const handCounts = game.hands.map(h => h.length);
    const aiHand = game.hands[currentSeat];

    const decision = aiDecide({
      hand: aiHand,
      level: game.level,
      mySeat: currentSeat,
      lastPlay: game.lastPlay,
      lastPlayBy: game.lastPlayBy,
      handCounts,
      finished: game.finished,
      roundPass: game.roundPass,
      difficulty: aiPlayer.difficulty,
    });

    // 计算思考延迟
    const baseDelay = { easy: 1200, medium: 900, hard: 700, master: 500 }[aiPlayer.difficulty];
    const delay = baseDelay + Math.random() * 300;

    aiTimerRef.current = setTimeout(() => {
      setGame((prev) => {
        if (!prev || prev.phase !== 'playing' || prev.current !== currentSeat) return prev;
        const next = gdApplyTurn(prev, currentSeat, decision.play);
        broadcastState(next);
        return next;
      });
    }, delay);

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [game?.current, game?.lastPlayBy, game?.hands, game?.finished, game?.level, game?.phase, role, status, aiPlayers, broadcastState]);

  // ============ 房主定期状态同步（每 3 秒重播，确保客户端状态不脱节） ============
  useEffect(() => {
    if (role !== 'host' || status !== 'playing' || !game) return;
    const timer = setInterval(() => {
      setGame((prev) => {
        if (prev && prev.phase === 'playing') broadcastState(prev);
        return prev;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [role, status, game?.phase, broadcastState]);

  // 点击理牌分组名称：整组选中（已全选则取消）
  const selectGroup = (cards: GCard[]) => {
    const ids = cards.map((c) => c.id);
    setSelected((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : ids));
  };

  const toggleCard = (id: number) => {
    if (!isMyTurn) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canPlay = (() => {
    if (!game || !isMyTurn) return false;
    const cards = myHand.filter((c) => selected.includes(c.id));
    if (cards.length === 0) return false;
    const info = analyzePlay(cards, game.level);
    if (!info) return false;
    if (!game.lastPlay) return true;
    const prevInfo = analyzePlay(game.lastPlay.cards, game.level);
    if (!prevInfo) return true;
    return canBeat(prevInfo, info);
  })();
  const canPass = isMyTurn && !!game?.lastPlay;

  // ============ 渲染：大厅 ============
  if (status === 'lobby' || status === 'connecting' || status === 'error') {
    return (
      <div className="gd-online">
        <div className="gd-online-card">
          <h2>🃏 掼蛋 · 联机对战</h2>
          <p className="gd-online-sub">四人两两组队 · 经典规则 · 创建房间分享给好友即可开局</p>
          {status === 'error' && (
            <div className="gd-online-error">
              <div className="gd-error-title">❌ {notice}</div>
              {errorDetail && <div className="gd-error-detail">{errorDetail}</div>}
              <button
                className="gd-btn gd-btn-primary gd-retry-btn"
                onClick={() => {
                  reloadPeerJS();
                  setStatus('lobby');
                  setNotice('');
                  setErrorDetail('');
                }}
              >
                🔄 重新加载
              </button>
            </div>
          )}
          {/* AI 设置 */}
          <div className="gd-ai-settings">
            <div className="gd-ai-setting-row">
              <label>🤖 AI 数量</label>
              <div className="gd-ai-count-btns">
                {[0, 1, 2, 3].map(n => (
                  <button
                    key={n}
                    className={`gd-ai-count-btn ${aiCount === n ? 'active' : ''}`}
                    onClick={() => setAiCount(n)}
                    disabled={status === 'connecting'}
                  >
                    {n} 个
                  </button>
                ))}
              </div>
            </div>
            {aiCount > 0 && (
              <div className="gd-ai-setting-row">
                <label>⭐ AI 难度</label>
                <div className="gd-ai-diff-btns">
                  {(['easy', 'medium', 'hard', 'master'] as GDAIDifficulty[]).map(d => (
                    <button
                      key={d}
                      className={`gd-ai-diff-btn ${aiDifficulty === d ? 'active' : ''}`}
                      onClick={() => setAiDifficulty(d)}
                      disabled={status === 'connecting'}
                    >
                      {d === 'easy' ? '简单' : d === 'medium' ? '中等' : d === 'hard' ? '困难' : '大师'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="gd-online-btns">
            <button className="gd-btn gd-btn-primary" onClick={createRoom} disabled={status === 'connecting'}>
              {status === 'connecting' ? '创建中…' : '创建房间'}
            </button>
          </div>
          <div className="gd-online-divider"><span>或加入好友房间</span></div>
          <div className="gd-online-join">
            <input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
              placeholder="输入房间号"
              maxLength={7}
            />
            <button className="gd-btn gd-btn-primary" onClick={() => joinRoom(joinInput)} disabled={status === 'connecting' || joinInput.length < 4}>
              加入房间
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ 渲染：等待房间（房主） ============
  if (role === 'host' && status === 'waiting') {
    const connected = connsRef.current.length;
    const totalPlayers = connected + 1; // 房主 + 来宾
    const needAI = Math.max(0, 4 - totalPlayers);
    const canStart = needAI <= aiCount; // AI 补位够就能开局

    // 构建完整玩家列表（按座位号排列：0=房主, 1=对手A, 2=队友, 3=对手B）
    // AI 优先填对手位(1,3)，好友加入时自动坐队友位(2)
    const seats: { name: string; type: 'host' | 'guest' | 'ai' | 'empty' }[] = [
      { name: '房主（你）', type: 'host' },
      { name: '', type: 'empty' },
      { name: '', type: 'empty' },
      { name: '', type: 'empty' },
    ];
    // 已连接好友按加入顺序分配座位：第一个→2(队友)，第二个→1，第三个→3
    const guestSeatOrder = [2, 1, 3];
    const guests = connsRef.current;
    for (let i = 0; i < guests.length && i < 3; i++) {
      const seat = guestSeatOrder[i];
      seats[seat] = { name: guests[i]._gdName || '玩家', type: 'guest' };
    }
    // AI 补位：优先填对手位(1,3)，再填队友位(2)
    const aiToShow = Math.min(needAI, aiCount);
    const aiSeatOrder = [1, 3, 2]; // 对手优先
    let aiIdx = 0;
    for (const seat of aiSeatOrder) {
      if (aiIdx >= aiToShow) break;
      if (seats[seat].type === 'empty') {
        const diffName = aiDifficulty === 'easy' ? '简单' : aiDifficulty === 'medium' ? '中等' : aiDifficulty === 'hard' ? '困难' : '大师';
        seats[seat] = { name: `AI ${diffName}`, type: 'ai' };
        aiIdx++;
      }
    }
    const playerList = seats;

    return (
      <div className="gd-online">
        <div className="gd-online-card">
          <h2>🃏 掼蛋房间</h2>
          <div className="gd-room-code" onClick={copyRoomCode} title="点击复制房间号">
            <span>房间号</span>
            <b>{roomCode}</b>
            <em>{copied ? '✅ 已复制' : '📋 点击复制'}</em>
          </div>
          <div className="gd-room-players">
            {playerList.map((p, i) => (
              <div
                className={`gd-room-player ${p.type === 'host' ? 'gd-host' : ''} ${p.type === 'empty' ? 'gd-empty' : ''} ${p.type === 'ai' ? 'gd-ai' : ''} ${(i === 0 || i === 2) ? 'gd-room-team-mine' : 'gd-room-team-opp'}`}
                key={i}
              >
                {p.type === 'host' ? '👑 ' : p.type === 'guest' ? '🎮 ' : p.type === 'ai' ? '🤖 ' : '⏳ '}
                {p.name}
                <span className={`gd-room-team-label ${(i === 0 || i === 2) ? 'gd-mine-label' : 'gd-opp-label'}`}>{(i === 0 || i === 2) ? '我方' : '对方'}</span>
              </div>
            ))}
          </div>
          <p className="gd-online-tip">
            玩家 {connected} 人 · AI {aiToShow} 人
            {!canStart && ` · 还需 ${needAI - aiCount} 人或增加 AI`}
          </p>
          <div className="gd-online-btns">
            <button className="gd-btn gd-btn-primary" onClick={startGame} disabled={!canStart}>
              {canStart ? '开始对局 →' : '人数不足'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ 渲染：等待开局（来宾） ============
  if (role === 'guest' && status === 'waiting') {
    return (
      <div className="gd-online">
        <div className="gd-online-card">
          <h2>🃏 已加入房间</h2>
          <div className="gd-room-code">
            <span>房间号</span><b>{roomCode}</b>
          </div>
          <div className="gd-room-players">
            {players.map((n, i) => (
              <div className={`gd-room-player ${i === mySeat ? 'gd-me' : ''} ${n ? '' : 'gd-empty'}`} key={i}>
                {i === 0 ? '👑 ' : ''}{n || '⏳ 等待加入…'}{i === mySeat ? '（你）' : ''}
              </div>
            ))}
          </div>
          <p className="gd-online-tip">等待房主发牌开局…</p>
        </div>
      </div>
    );
  }

  // ============ 渲染：对局 ============
  if (!game) return <div className="module-loading">对局准备中…</div>;

  // 头游：第一个出完牌的玩家；对家（搭档）= 头游 ^ 2（0↔2、1↔3）
  // 明牌规则：仅本方（0 我 或 2 队友）头游时，把本队另一人的剩余手牌明牌给本方看；对手头游不泄露对手牌
  const headSeat = game.finished.length > 0 ? game.finished[0] : -1;
  const partnerSeat = headSeat >= 0 ? headSeat ^ 2 : -1;
  const showPartnerCards = headSeat >= 0 && (headSeat === 0 || headSeat === 2) && partnerSeat !== 0;

  const counts = game.hands.map((h) => h.length);
  const myTeamCount = counts[0] + counts[2];
  const oppTeamCount = counts[1] + counts[3];
  const levelName = rankName(game.level);
  const myName = players[mySeat] || SEAT_NAMES[mySeat];
  const seatLabel = (s: number) => players[s] || SEAT_NAMES[s];

  const sortedHand = [...myHand].sort((a, b) => {
    if (a.k !== undefined && b.k !== undefined) return b.k! - a.k!;
    if (a.k !== undefined) return 1;
    if (b.k !== undefined) return -1;
    if (a.r !== b.r) return b.r - a.r;
    return a.s < b.s ? -1 : 1;
  });

  // 出牌区显示每位玩家本轮所有出牌，下一轮出牌时才清空更新
  const roundPlaysOf = (p: number) => {
    if (!game || game.roundPlays.length === 0) return [];
    const mine = game.roundPlays.filter((pl) => pl.player === p);
    return mine.length > 0 ? [mine[mine.length - 1]] : [];
  };
  const renderRoundPlays = (p: number) => {
    const plays = roundPlaysOf(p);
    if (plays.length === 0) return null;
    return (
      <div className="gd-play-area">
        {plays.map((pl, i) => (
          <div key={i} className={`gd-play-hand ${i === plays.length - 1 ? 'gd-latest' : ''}`}>
            <span className="gd-play-hand-name">{seatLabel(pl.player)}</span>
            <div className="gd-play-cards-row">
              {pl.cards.map((c) => (
                <span key={c.id} className={`gd-play-card ${c.k !== undefined ? 'gd-joker' : ''}`}>
                  {c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : `${rankName(c.r)}${SUIT_SYMBOL[c.s]}`}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`gd-table ${floating ? 'gd-floating' : ''}`}>
      {/* 桌垫方位水印、分区框线与铭牌（参考比赛专用桌垫） */}
      <span className="gd-dir gd-dir-n">北</span>
      <span className="gd-dir gd-dir-s">南</span>
      <span className="gd-dir gd-dir-w">西</span>
      <span className="gd-dir gd-dir-e">东</span>
      <div className="gd-zones">
        {GD_ZONES.map((z, i) => (
          <span
            key={i}
            className={`gd-zone gd-zone-dir-${z.dir}`}
            style={{ top: `${z.top}%`, left: `${z.left}%`, width: `${z.w}%`, height: `${z.h}%` }}
          >
            {z.label}
          </span>
        ))}
      </div>
      <span className="gd-table-name">掼蛋比赛专用桌垫</span>
      {/* 浮动全屏：左上角 ☰ 折叠菜单 */}
      {floating && (
        <>
          <button
            className={`gd-top-handle ${menuOpen ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            title="游戏功能"
            aria-label="游戏功能"
          >
            <span className="gd-handle-bar" />
            <span className="gd-handle-bar" />
            <span className="gd-handle-bar" />
          </button>
          <div className={`gd-menu-panel ${menuOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="gd-menu-grid">
              <button className="gd-menu-btn" onClick={() => {
                if (sortMode === 'rank') { setSortMode('grouped'); setSortScheme(0); }
                else { setSortScheme((s) => (s + 1) % 4); }
                setMenuOpen(false);
              }}>
                {sortMode === 'rank' ? '🃏 一键理牌' : `🔄 方案${sortScheme + 1}/4`}
              </button>
              <button className="gd-menu-btn" onClick={() => { copyRoomCode(); setMenuOpen(false); }}>
                📋 复制房间号
              </button>
              {sortMode === 'grouped' && (
                <button className="gd-menu-btn" onClick={() => { setSortMode('rank'); setMenuOpen(false); }}>
                  ↩️ 恢复排序
                </button>
              )}
              {role === 'host' && (
                <button className="gd-menu-btn" onClick={() => { nextRound(); setMenuOpen(false); }} disabled={!game || game.phase !== 'over'}>
                  🔄 开始下一局
                </button>
              )}
              <button className="gd-menu-btn danger" onClick={() => { setFloating(false); try { exitFullscreen(); } catch { /* 忽略 */ } setMenuOpen(false); }}>
                ⛶ 退出全屏
              </button>
            </div>
            <div className="gd-menu-hint">点击棋盘任意位置关闭面板</div>
          </div>
        </>
      )}
      <div className="gd-topbar">
        <span className="gd-info">我方 <b>{myTeamCount}</b> 张</span>
        <span className="gd-info">对方 <b>{oppTeamCount}</b> 张</span>
        <span className="gd-info">目标 <b className="gd-level">过 {levelName}</b></span>
        <span className="gd-info">房间 <b className="gd-level">{roomCode}</b></span>
      </div>
      {game.gongMessage && <div className="gd-gong-bar">{game.gongMessage}</div>}

      <div className="gd-seats">
        <div className={`gd-seat gd-seat-top gd-team-mine ${game.current === 2 ? 'gd-active' : ''}`}>
          <span className="gd-seat-name">🤝 {seatLabel(2)}</span>
          <span className="gd-team-tag gd-team-mine-tag">我方</span>
          {headSeat === 2 && <span className="gd-head-tag">🏆 头游</span>}
          {counts[2] <= 10 && <span className="gd-seat-count">{counts[2]} 张</span>}
          {game.roundPass.includes(2) && <span className="gd-pass-tag">不出</span>}
          {game.finished.includes(2) && <span className="gd-finished-tag">已出完</span>}
        </div>
        {showPartnerCards && partnerSeat === 2 && (
          <div className="gd-partner-cards">
            <span className="gd-partner-label">🤝 对家牌面</span>
            <div className="gd-partner-cards-row">
              {game.hands[2].map((c) => (
                <span
                  key={c.id}
                  className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'}`}
                >
                  <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                  {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                  {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                </span>
              ))}
              {game.hands[2].length === 0 && <span className="gd-partner-empty">已出完</span>}
            </div>
          </div>
        )}
        <div className="gd-play-area gd-play-north">{renderRoundPlays(2)}</div>
        <div className="gd-side-row">
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-left gd-team-opp ${game.current === 3 ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 {seatLabel(3)}</span>
              <span className="gd-team-tag gd-team-opp-tag">对方</span>
              {headSeat === 3 && <span className="gd-head-tag">🏆 头游</span>}
              {counts[3] <= 10 && <span className="gd-seat-count">{counts[3]} 张</span>}
              {game.roundPass.includes(3) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(3) && <span className="gd-finished-tag">已出完</span>}
            </div>
            {showPartnerCards && partnerSeat === 3 && (
              <div className="gd-partner-cards">
                <span className="gd-partner-label">🤝 对家牌面</span>
                <div className="gd-partner-cards-row">
                  {game.hands[3].map((c) => (
                    <span
                      key={c.id}
                      className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    >
                      <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                      {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                      {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                    </span>
                  ))}
                  {game.hands[3].length === 0 && <span className="gd-partner-empty">已出完</span>}
                </div>
              </div>
            )}
            <div className="gd-play-area gd-play-west">{renderRoundPlays(3)}</div>
          </div>
          <div className="gd-center-play">
            {game.phase === 'over' ? <span className="gd-freetext">{game.resultText}</span> :
              game.lastPlay ? <span className="gd-freetext">跟牌：{seatLabel(game.lastPlay.player)}</span> :
              <span className="gd-freetext">自由出牌</span>}
          </div>
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-right gd-team-opp ${game.current === 1 ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 {seatLabel(1)}</span>
              <span className="gd-team-tag gd-team-opp-tag">对方</span>
              {headSeat === 1 && <span className="gd-head-tag">🏆 头游</span>}
              {counts[1] <= 10 && <span className="gd-seat-count">{counts[1]} 张</span>}
              {game.roundPass.includes(1) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(1) && <span className="gd-finished-tag">已出完</span>}
            </div>
            {showPartnerCards && partnerSeat === 1 && (
              <div className="gd-partner-cards">
                <span className="gd-partner-label">🤝 对家牌面</span>
                <div className="gd-partner-cards-row">
                  {game.hands[1].map((c) => (
                    <span
                      key={c.id}
                      className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    >
                      <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                      {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                      {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                    </span>
                  ))}
                  {game.hands[1].length === 0 && <span className="gd-partner-empty">已出完</span>}
                </div>
              </div>
            )}
            <div className="gd-play-area gd-play-east">{renderRoundPlays(1)}</div>
          </div>
        </div>
      </div>

      {/* 我方（南）出牌区：手牌上方 */}
      <div className="gd-play-area gd-play-south">{renderRoundPlays(0)}</div>

      <div className="gd-actions">
        <span className="gd-turn-hint">
          {game.phase === 'over' ? game.resultText : isMyTurn ? `🖐 轮到你（${myName}）出牌` : `等待 ${seatLabel(game.current)} 出牌…`}
        </span>
        <button className="gd-btn gd-btn-pass" onClick={doPass} disabled={!canPass}>不出</button>
        <button className="gd-btn gd-btn-hint" onClick={applyHint} disabled={!isMyTurn}>提示</button>
        <button className="gd-btn gd-btn-play gd-btn-primary" onClick={doPlay} disabled={!canPlay}>出牌</button>
        <button
          className="gd-btn gd-btn-sort"
          onClick={() => {
            if (sortMode === 'rank') { setSortMode('grouped'); setSortScheme(0); }
            else { setSortScheme((s) => (s + 1) % 4); }
          }}
        >
          {sortMode === 'rank' ? '一键理牌' : `方案${sortScheme + 1}/4`}
        </button>
      </div>

      {sortMode === 'grouped' ? (
        <div className="gd-hand gd-hand-grouped">
          {groupHand(myHand, game.level, sortScheme).map((g, gi) => (
            <div className="gd-hand-group" key={gi}>
              <div className="gd-hand-group-cards">
                {g.cards.map((c, ci) => (
                  <button
                    key={c.id}
                    className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? 'gd-card-joker' : (c.r === levelRank(game.level) ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    onClick={() => toggleCard(c.id)}
                    style={{ zIndex: 100 - ci }}
                  >
                    <span className="gd-card-corner gd-corner-tl">
                      <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
                    </span>
                    <span className="gd-card-center">{c.k !== undefined ? 'JOKER' : SUIT_SYMBOL[c.s]}</span>
                    <span className="gd-card-corner gd-corner-br">
                      <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
                    </span>
                    {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-card-level-tag">级</span>}
                    {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                  </button>
                ))}
              </div>
              <span
                className={`gd-hand-group-label ${g.cards.every((c) => selected.includes(c.id)) ? 'gd-group-selected' : ''}`}
                onClick={() => selectGroup(g.cards)}
              >
                {g.label}
              </span>
            </div>
          ))}
          {myHand.length === 0 && <div className="gd-hand-empty">牌已出完</div>}
        </div>
      ) : (
        <div className="gd-hand">
          {sortedHand.map((c, i) => (
            <button
              key={c.id}
              className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? 'gd-card-joker' : (c.r === levelRank(game.level) ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
              onClick={() => toggleCard(c.id)}
              style={{ marginLeft: i > 0 ? -Math.min(34, 300 / sortedHand.length) : 0 }}
            >
              <span className="gd-card-corner gd-corner-tl">
                <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
              </span>
              <span className="gd-card-center">{c.k !== undefined ? 'JOKER' : SUIT_SYMBOL[c.s]}</span>
              <span className="gd-card-corner gd-corner-br">
                <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
              </span>
              {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-card-level-tag">级</span>}
              {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
            </button>
          ))}
          {sortedHand.length === 0 && <div className="gd-hand-empty">牌已出完</div>}
        </div>
      )}

      {/* 结算弹层：房主可开下一局 */}
      {game.phase === 'over' && (
        <div className="gd-overlay">
          <div className="gd-overlay-card">
            <h2>{game.resultText}</h2>
            <p className="gd-overlay-level">当前级别：<b>过 {rankName(game.level)}</b></p>
            {game.winnerTeam !== null && (
              <p className={game.winnerTeam === teamOf(mySeat) ? 'gd-overlay-win' : 'gd-overlay-lose'}>
                {game.winnerTeam === teamOf(mySeat) ? '🎉 恭喜！你们获胜！' : '再接再厉，加油！'}
              </p>
            )}
            <div className="gd-overlay-btns">
              {role === 'host' && (
                <button className="gd-btn gd-btn-primary" onClick={nextRound}>开始下一局</button>
              )}
              {role !== 'host' && <p className="gd-online-tip">房主将开启下一局…</p>}
            </div>
          </div>
        </div>
      )}
      {notice && <div className="gd-online-notice">{notice}</div>}
    </div>
  );
};

export default GuandanOnlineGame;
