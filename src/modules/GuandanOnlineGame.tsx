/**
 * 掼蛋 · 联机对战（四人两两组队，PeerJS P2P 星型 + AI 补位）
 * 房主(座位0)为中枢：发牌、回合仲裁、广播完整状态；其余玩家通过房间码连接房主。
 * 人数不足时可用 AI 补位，支持 1 人 + 3AI / 2 人 + 2AI / 3 人 + 1AI
 * 消息协议：JOIN / WELCOME / ROOM_STATE / STATE / PLAY / PASS / ERROR / LEAVE / AI_PLAY
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { enterFullscreen, exitFullscreen } from '../utils/fullscreen';
import { openGameWindow } from '../utils/gameWindow';
import { playGdBombEffect } from '../utils/gdEffects';
import { GuandanJoker } from '../components/GuandanJoker';
import { loadPeerJS, reloadPeerJS } from '../utils/peerjsLoader';
import { GuandanServerClient, type GDServerPlayer } from '../utils/guandanServerClient';
import {
  type GCard, type PlayInfo, analyzePlay, canBeat, cardVal, rankName,
  groupHand, groupByR, GD_ZONES, SUIT_SYMBOL, isWild, levelRank, findSeq,
} from './GuandanGame';
import {
  aiDecide, generateAINames,
  type GDAIDifficulty, type AIPlayer,
} from '../engine/guandanAI';

// 四人状态机统一从共享引擎导入（客户端 / 服务端共用）
import {
  type GDOnlineState,
  validateGDState, gdApplyTurn, gdNewGame, teamOf, SEAT_NAMES,
} from '../engine/guandan/room.ts';
export * from '../engine/guandan/room.ts';


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
export const GuandanOnlineGame: React.FC<{ autoJoinRoom?: string | null; onExit?: () => void }> = ({ autoJoinRoom, onExit }) => {
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const roomCodeRef = useRef('');
  roomCodeRef.current = roomCode;
  const roleRef = useRef<'host' | 'guest' | null>(null);
  roleRef.current = role;
  /** 传输层：服务端权威优先，PeerJS P2P 作为降级通道 */
  const [transport, setTransport] = useState<'server' | 'p2p'>('p2p');
  const transportRef = useRef<'server' | 'p2p'>('p2p');
  const serverRef = useRef<GuandanServerClient | null>(null);
  const p2pJoinRef = useRef<((code: string) => void) | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearConnectTimer = useCallback(() => {
    if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
  }, []);
  const [joinInput, setJoinInput] = useState('');
  const [status, setStatus] = useState<'lobby' | 'connecting' | 'waiting' | 'playing' | 'error'>('lobby');
  const [players, setPlayers] = useState<string[]>(['', '', '', '']); // 各座位名字
  const [game, setGame] = useState<GDOnlineState | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const lastFxKeyRef = useRef('');

  const [mySeat, setMySeat] = useState(0);
  const mySeatRef = useRef(0);
  useEffect(() => { mySeatRef.current = mySeat; }, [mySeat]);
  const [selected, setSelected] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<'rank' | 'grouped'>('rank');
  const [sortScheme, setSortScheme] = useState(0); // 0~3 四套理牌方案循环切换
  const [notice, setNotice] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [copied, setCopied] = useState(false);
  // 出牌倒计时：轮到玩家时 15 秒内必须出牌，超时自动出最小牌
  const [countdown, setCountdown] = useState(15);
  // 浮动窗口全屏（对局时默认开启）+ 左上角 ☰ 折叠菜单
  const [floating, setFloating] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const enteredFsRef = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPlayedRef = useRef(false);

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

  // ============ 服务端权威通道（优先）/ PeerJS P2P（降级） ============
  const applyServerPlayers = useCallback((list: (GDServerPlayer | null)[]) => {
    const names = ['', '', '', ''];
    for (const p of list) if (p) names[p.seat] = p.name;
    setPlayers(names);
  }, []);

  const ensureServer = useCallback(() => {
    if (serverRef.current) return serverRef.current;
    const client = new GuandanServerClient({
      onWelcome: (m) => {
        clearConnectTimer();
        setTransport('server'); transportRef.current = 'server';
        setRoomCode(m.roomCode);
        setMySeat(m.seat);
        mySeatRef.current = m.seat;
        applyServerPlayers(m.players);
        setRole(m.seat === m.hostSeat ? 'host' : 'guest');
        setStatus(m.status === 'waiting' ? 'waiting' : 'playing');
        setNotice('');
        setErrorDetail('');
      },
      onRoom: (m) => {
        applyServerPlayers(m.players);
        if (m.hostSeat === mySeatRef.current) setRole('host');
        if (m.status === 'waiting' && statusRef.current !== 'playing') setStatus('waiting');
      },
      onState: (m) => {
        clearConnectTimer();
        // 服务端下发的已是对应座位视角（对手手牌为空、仅有 handCounts），不可再做本地"补全"
        setGame(m.state);
        setStatus('playing');
        setNotice('');
        setSelected([]);
        setFloating(true);
        if (!enteredFsRef.current) {
          enteredFsRef.current = true;
          try { enterFullscreen(); } catch { /* 忽略 */ }
        }
      },
      onError: (m) => {
        clearConnectTimer();
        if (m.code === 'ROOM_NOT_FOUND' && roleRef.current === 'guest' && transportRef.current === 'server') {
          // 6 位房间号可能是旧版 P2P 房间：自动降级
          setTransport('p2p'); transportRef.current = 'p2p';
          setNotice('服务器上未找到该房间，正在尝试 P2P 直连…');
          p2pJoinRef.current?.(roomCodeRef.current);
          return;
        }
        setNotice(m.message || '服务器错误');
      },
      onConnection: (s) => {
        if (s === 'closed' && transportRef.current === 'server') setNotice('⚠ 连接中断，正在重连…');
        if (s === 'reconnected') setNotice('');
      },
    });
    serverRef.current = client;
    return client;
  }, [applyServerPlayers, clearConnectTimer]);

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
    } else if (msg.type === 'SEAT_CHOOSE') {
      // 玩家主动选择东西南北任一座位（房主当前座位不可选，其余空位可反复换座）
      const want = msg.seat;
      if (typeof want !== 'number' || want < 0 || want > 3 || want === mySeatRef.current) return;
      const occupied = connsRef.current.some((c) => c !== conn && c._gdSeat === want);
      if (occupied) {
        try { conn.send(JSON.stringify({ type: 'SEAT_TAKEN', seat: want })); } catch {}
        return;
      }
      const oldSeat = conn._gdSeat;
      if (oldSeat !== undefined && oldSeat !== want) {
        setPlayers((p) => { const np = [...p]; np[oldSeat] = ''; return np; });
      }
      conn._gdSeat = want;
      conn._gdName = conn._gdName || '玩家';
      try { conn.send(JSON.stringify({ type: 'WELCOME', seat: want, name: conn._gdName })); } catch {}
      setPlayers((p) => { const np = [...p]; np[want] = conn._gdName; return np; });
      const playerList: string[] = ['房主', '', '', ''];
      for (const c of connsRef.current) {
        if (c._gdSeat !== undefined) playerList[c._gdSeat] = c._gdName || '玩家';
      }
      sendAll({ type: 'ROOM_STATE', players: playerList });
    } else if (msg.type === 'PLAY' || msg.type === 'PASS') {
      const seat = conn._gdSeat;
      if (seat === undefined) return;
      setGame((prev) => {
        if (!prev || prev.phase !== 'playing' || prev.current !== seat) return prev;
        // 服务端严格校验：已出完玩家禁止出牌（双重防御）
        if (prev.finished.includes(seat) || prev.hands[seat].length === 0) return prev;
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
      const names: string[] = msg.players || [];
      setPlayers((p) => {
        const np = [...p];
        names.forEach((n, i) => { if (n) np[i] = n; });
        return np;
      });
    } else if (msg.type === 'SEAT_TAKEN') {
      setNotice('⚠ 该座位已被其他玩家占用，请选择其他位置');
    } else if (msg.type === 'STATE') {
      // 收到状态后立即校验一致性，避免出现"已出完还提示出牌"的闪烁
      const validated = validateGDState(msg.state);
      setGame(validated);
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

  // ============ 创建房间（P2P 降级通道）—— 多信令节点自动选择 ============
  const createRoomP2P = useCallback(async () => {
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

  // ============ 创建房间：服务端权威优先，不可达时降级 PeerJS ============
  const createRoom = useCallback(async () => {
    setRole('host');
    setStatus('connecting');
    setErrorDetail('');
    setNotice('正在连接游戏服务器…');
    setPlayers(['房主', '', '', '']);
    try {
      const server = ensureServer();
      await server.connect(2500);
      setTransport('server');
      transportRef.current = 'server';
      setNotice('服务器已连接，正在创建房间…');
      server.createRoom('房主');
      clearConnectTimer();
      connectTimerRef.current = setTimeout(() => {
        if (transportRef.current === 'server' && !roomCodeRef.current) {
          setNotice('创建房间超时，已切换 P2P 直连模式');
          setTransport('p2p');
          transportRef.current = 'p2p';
          void createRoomP2P();
        }
      }, 5000);
    } catch {
      setTransport('p2p');
      transportRef.current = 'p2p';
      setNotice('游戏服务器不可用，已切换 P2P 直连模式');
      await createRoomP2P();
    }
  }, [ensureServer, createRoomP2P]);

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

  // ============ 加入房间（P2P 降级通道）—— 多信令节点自动遍历 ============
  const joinRoomP2P = useCallback(async (code: string) => {
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

  // ============ 加入房间：6 位优先服务端，失败自动降级 P2P ============
  const joinRoom = useCallback(async (code: string) => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setRoomCode(c);
    setRole('guest');
    setStatus('connecting');
    setErrorDetail('');
    setGame(null);

    // 7 位房间号是旧版 P2P 房间（6 位码 + 信令节点号），直接走 P2P
    if (c.length === 7) {
      setTransport('p2p');
      transportRef.current = 'p2p';
      await joinRoomP2P(c);
      return;
    }

    setNotice('正在连接游戏服务器…');
    try {
      const server = ensureServer();
      await server.connect(2500);
      setTransport('server');
      transportRef.current = 'server';
      setNotice('服务器已连接，正在加入房间…');
      // 房间不存在时由 onError(ROOM_NOT_FOUND) 自动降级到 P2P
      server.joinRoom(c, myNameRef.current);
      clearConnectTimer();
      connectTimerRef.current = setTimeout(() => {
        if (transportRef.current === 'server' && !roomCodeRef.current) {
          setNotice('加入房间超时，已切换 P2P 直连模式');
          setTransport('p2p');
          transportRef.current = 'p2p';
          void joinRoomP2P(c);
        }
      }, 5000);
    } catch {
      setTransport('p2p');
      transportRef.current = 'p2p';
      setNotice('游戏服务器不可用，已切换 P2P 直连模式');
      await joinRoomP2P(c);
    }
  }, [ensureServer, joinRoomP2P]);

  useEffect(() => { p2pJoinRef.current = (code: string) => { void joinRoomP2P(code); }; }, [joinRoomP2P]);

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
    // 服务端权威模式：发牌、AI 补位、回合仲裁全部交给服务器
    if (transportRef.current === 'server') {
      serverRef.current?.startGame(aiCount, aiDifficulty);
      setNotice('正在开局…');
      return;
    }
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

    // 收集所有玩家信息（房主按 mySeat 入座，默认南 0）
    const playerNames: string[] = ['', '', '', ''];
    playerNames[mySeat] = '房主';
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
  }, [aiCount, aiDifficulty, broadcastState, mySeat]);

  // ============ 房主：重新发牌（下一局） ============
  const nextRound = useCallback(() => {
    if (transportRef.current === 'server') {
      serverRef.current?.nextRound();
      return;
    }
    if (!game) return;
    // 保留 AI 玩家名字
    const names = [...game.playerNames];
    // 真实玩家名字同步
    names[mySeat] = '房主';
    for (const c of connsRef.current) {
      if (c._gdSeat !== undefined) names[c._gdSeat] = c._gdName || '玩家';
    }
    const st = gdNewGame(game.level, names, game.finished[0] ?? 0, game.aStrikes || 0, game.tributePlan);
    setGame(st);
    broadcastState(st);
  }, [game, broadcastState, mySeat]);

  // ============ 我的回合操作 ============
  // 严格判断是否轮到自己：必须是游戏中、是当前座位、未出完、手牌不为空
  const isMyTurn = !!game
    && game.phase === 'playing'
    && game.current === mySeat
    && !game.finished.includes(mySeat)
    && game.hands[mySeat].length > 0;
  const myHand = game ? game.hands[mySeat] : [];

  // ===== 出牌视觉特效：炸弹 / 同花顺 / 王炸（随机效果，天王炸最炫）=====
  useEffect(() => {
    if (!game || game.phase !== 'playing') return;
    const plays = game.roundPlays;
    if (!plays || plays.length === 0) return;
    const last = plays[plays.length - 1];
    if (!last || !last.cards || last.cards.length === 0) return;
    const info = analyzePlay(last.cards, game.level);
    if (!info) return;
    const isSpecial = info.type === 'BOMB' || info.type === 'STRAIGHT_FLUSH' || info.type === 'ROCKET';
    if (!isSpecial) return;
    const key = `${game.roundId}:${plays.length}:${last.player || ''}`;
    if (lastFxKeyRef.current === key) return;
    lastFxKeyRef.current = key;
    if (tableRef.current) {
      try { playGdBombEffect(tableRef.current, info.type, last.cards); } catch { /* 特效失败不影响游戏 */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.roundPlays, game?.phase]);

  const doPlay = (cardsOverride?: GCard[]) => {
    if (!isMyTurn) return;
    const cards = cardsOverride ?? myHand.filter((c) => selected.includes(c.id));
    if (cards.length === 0) return;
    if (transportRef.current === 'server') {
      // 只把动作发给服务器，状态以服务端广播为准
      serverRef.current?.play(cards);
      setSelected([]);
      return;
    }
    if (role === 'host') {
      setGame((prev) => {
        // 严格二次校验：防止竞态条件（状态已更新但UI还未刷新时点击出牌）
        if (!prev || prev.phase !== 'playing' || prev.current !== mySeat) return prev;
        if (prev.finished.includes(mySeat) || prev.hands[mySeat].length === 0) return prev;
        const next = gdApplyTurn(prev, mySeat, cards);
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

  // 超时自动出最小牌：有上家出最小能压的牌型；无上家出最小单张；压不过则过
  const autoPlaySmallest = useCallback(() => {
    if (!game || !isMyTurn) return;
    if (game.lastPlay) {
      const prev = analyzePlay(game.lastPlay.cards, game.level)!;
      const beats = allBeats(myHand, prev, game.level);
      if (beats.length > 0) {
        let min = beats[0];
        for (const b of beats) if (cardVal(b[0], game.level) < cardVal(min[0], game.level)) min = b;
        doPlay(min);
        return;
      }
      doPass();
    } else {
      let min = myHand[0];
      for (const c of myHand) if (cardVal(c, game.level) < cardVal(min, game.level)) min = c;
      doPlay([min]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, isMyTurn, myHand, game?.lastPlay]);

  // 15 秒出牌倒计时：轮到玩家启动，超时自动出最小牌
  useEffect(() => {
    if (!isMyTurn || !game || game.phase !== 'playing') {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
      setCountdown(15);
      autoPlayedRef.current = false;
      return;
    }
    if (autoPlayedRef.current) return;
    autoPlayedRef.current = false;
    setCountdown(15);
    countdownRef.current = setInterval(() => {
      setCountdown((v) => {
        if (v <= 1) {
          if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
          autoPlayedRef.current = true;
          try { autoPlaySmallest(); } catch { /* 忽略 */ }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, game?.current, game?.roundId, game?.roundEnded, game?.phase]);

  const doPass = () => {
    if (!isMyTurn || !game?.lastPlay) return;
    if (transportRef.current === 'server') {
      serverRef.current?.pass();
      setSelected([]);
      return;
    }
    if (role === 'host') {
      setGame((prev) => {
        // 严格二次校验：防止竞态条件
        if (!prev || prev.phase !== 'playing' || prev.current !== mySeat) return prev;
        if (prev.finished.includes(mySeat) || prev.hands[mySeat].length === 0) return prev;
        if (!prev.lastPlay) return prev;
        const next = gdApplyTurn(prev, mySeat, null);
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
      try { serverRef.current?.close(); } catch {}
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 浮动全屏时隐藏页面上下红色导航栏（header/nav），只显示棋盘容器
  useEffect(() => {
    if (floating) document.body.classList.add('gd-float-active');
    else document.body.classList.remove('gd-float-active');
    return () => document.body.classList.remove('gd-float-active');
  }, [floating]);

  // ============ 状态一致性自动校正 ============
  // 终极防御：任何状态变更后，如果 current 指向已出完/无牌玩家，自动推进到下一位活人
  useEffect(() => {
    if (transportRef.current === 'server') return; // 服务端权威，客户端不做补全
    if (!game || game.phase !== 'playing') return;
    if (!game.finished.includes(game.current) && game.hands[game.current]?.length > 0) return;
    // 发现不一致 → 调用 validateGDState 修复
    setGame((prev) => {
      if (!prev || prev.phase !== 'playing') return prev;
      const fixed = validateGDState(prev);
      if (fixed === prev) return prev;
      // 如果是房主，同步给所有客户端
      if (role === 'host') broadcastState(fixed);
      return fixed;
    });
  }, [game?.current, game?.finished, game?.hands, game?.phase, role, broadcastState]);

  // ============ AI 自动出牌驱动（仅房主侧） ============
  useEffect(() => {
    if (transportRef.current === 'server') return; // AI 由服务端托管
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
    if (transportRef.current === 'server') return; // 服务端主动推送，无需客户端重播
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
        {onExit && <button className="gd3-lobby-close" onClick={onExit} aria-label="退出联机">✕</button>}
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

  // ============ 渲染：等待房间（房主）——4 向座位格，可换座 ============
  if (role === 'host' && status === 'waiting') {
    // 人数统计统一读 players（服务端与 P2P 都会维护该数组）
    const connected = Math.max(0, players.filter(Boolean).length - 1);
    const needAI = Math.max(0, 4 - (connected + 1));
    const canStart = needAI <= aiCount; // AI 补位够就能开局

    // 4 个座位格（田字布局：北 2 上、东 1 左、西 3 右、南 0 下；0=南 1=东 2=北 3=西）
    const seatOrder = [2, 1, 3, 0];
    const seatLabels = ['南', '东', '北', '西'];
    const seatCells: { name: string; type: 'host' | 'guest' | 'ai' | 'empty' }[] = [
      { name: '', type: 'empty' }, { name: '', type: 'empty' }, { name: '', type: 'empty' }, { name: '', type: 'empty' },
    ];
    players.forEach((name, seat) => {
      if (!name) return;
      seatCells[seat] = { name, type: seat === mySeat ? 'host' : 'guest' };
    });
    if (seatCells[mySeat].type === 'empty') seatCells[mySeat] = { name: '房主（你）', type: 'host' };
    // AI 补位预览：空位按对手位(1,3)优先再队友位(2)
    const aiToShow = Math.min(needAI, aiCount);
    let aiIdx = 0;
    for (const seat of [1, 3, 2]) {
      if (aiIdx >= aiToShow) break;
      if (seatCells[seat].type === 'empty') {
        const diffName = aiDifficulty === 'easy' ? '简单' : aiDifficulty === 'medium' ? '中等' : aiDifficulty === 'hard' ? '困难' : '大师';
        seatCells[seat] = { name: `AI ${diffName}`, type: 'ai' };
        aiIdx++;
      }
    }

    // 房主换座：点击空位入座（支持反复换座，含换回默认南位）
    const moveMySeat = (seat: number) => {
      if (seat === mySeat) return;
      if (seatCells[seat].type !== 'empty') return;
      if (transportRef.current === 'server') {
        setNotice(`正在选择${seatLabels[seat]}位…`);
        serverRef.current?.chooseSeat(seat);
        return;
      }
      setMySeat(seat);
      setPlayers((p) => { const np = [...p]; np[mySeat] = ''; np[seat] = '房主'; return np; });
      const playerList: string[] = ['', '', '', ''];
      playerList[seat] = '房主';
      for (const c of connsRef.current) {
        if (c._gdSeat !== undefined) playerList[c._gdSeat] = c._gdName || '玩家';
      }
      sendAll({ type: 'ROOM_STATE', players: playerList });
    };

    return (
      <div className="gd-online">
        {onExit && <button className="gd3-lobby-close" onClick={onExit} aria-label="退出房间">✕</button>}
        <div className="gd-online-card">
          <h2>🃏 掼蛋房间</h2>
          <div className="gd-room-code" onClick={copyRoomCode} title="点击复制房间号">
            <span>房间号</span>
            <b>{roomCode}</b>
            <em>{copied ? '✅ 已复制' : '📋 点击复制'}</em>
          </div>
          <div className="gd-room-grid">
            {seatOrder.map((s) => {
              const cell = seatCells[s];
              return (
                <div
                  className={`gd-seat-cell ${cell.type} ${s === mySeat ? 'gd-seat-me' : ''} ${cell.type === 'empty' ? 'gd-seat-clickable' : ''}`}
                  key={s}
                  onClick={() => moveMySeat(s)}
                  title={cell.type === 'empty' ? `点击入座${seatLabels[s]}位` : ''}
                >
                  <span className="gd-seat-dir">{seatLabels[s]}</span>
                  <span className="gd-seat-name">{cell.name || '空位'}</span>
                  <span className="gd-seat-role">
                    {cell.type === 'empty' ? '点击入座' : cell.type === 'guest' ? '好友' : cell.type === 'ai' ? 'AI' : '你'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="gd-online-tip">
            玩家 {connected} 人 · AI {aiToShow} 人
            {!canStart && ` · 还需 ${needAI - aiCount} 人或增加 AI`}
          </p>
          <p className="gd-online-tip">
            通道：{transport === 'server' ? '🛰 服务器权威 · 断线可重连' : '🔗 P2P 直连'}
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

  // ============ 渲染：等待开局（来宾）——4 向座位格，可点选入座 ============
  if (role === 'guest' && status === 'waiting') {
    const seatOrder = [2, 1, 3, 0];
    const seatLabels = ['南', '东', '北', '西'];
    const chooseSeat = (seat: number) => {
      if (seat === mySeat) return; // 已在此座
      if (players[seat]) return; // 已占用（含房主位显示'房主'时）
      setNotice(`正在选择${seatLabels[seat]}位…`);
      if (transportRef.current === 'server') {
        serverRef.current?.chooseSeat(seat);
        return;
      }
      sendToHost({ type: 'SEAT_CHOOSE', seat });
    };
    return (
      <div className="gd-online">
        {onExit && <button className="gd3-lobby-close" onClick={onExit} aria-label="退出房间">✕</button>}
        <div className="gd-online-card">
          <h2>🃏 已加入房间</h2>
          <div className="gd-room-code">
            <span>房间号</span><b>{roomCode}</b>
          </div>
          <div className="gd-room-grid">
            {seatOrder.map((s) => {
              const occupied = !!players[s];
              return (
                <div
                  className={`gd-seat-cell ${occupied ? 'gd-seat-taken' : 'gd-seat-clickable'} ${s === mySeat ? 'gd-seat-me' : ''}`}
                  key={s}
                  onClick={() => chooseSeat(s)}
                  title={occupied ? `${seatLabels[s]}位已有人` : `点击入座${seatLabels[s]}位`}
                >
                  <span className="gd-seat-dir">{seatLabels[s]}</span>
                  <span className="gd-seat-name">{players[s] || '空位'}</span>
                  <span className="gd-seat-role">{s === mySeat ? '你' : occupied ? '已入座' : '点击入座'}</span>
                </div>
              );
            })}
          </div>
          <p className="gd-online-tip">点击空位选择入座方向，等待房主发牌开局…</p>
          <p className="gd-online-tip">
            通道：{transport === 'server' ? '🛰 服务器权威 · 断线可重连' : '🔗 P2P 直连'}
          </p>
        </div>
      </div>
    );
  }

  // ============ 渲染：对局 ============
  if (!game) return <div className="module-loading">对局准备中…</div>;

  // 头游：第一个出完牌的玩家
  const headSeat = game.finished.length > 0 ? game.finished[0] : -1;
  // 相对方位：底板永远是自己，对面是队友，左右为两名对手（任意座位入座都能正确显示）
  const seatBottom = mySeat;
  const seatRight = (mySeat + 1) % 4;
  const seatTop = (mySeat + 2) % 4;
  const seatLeft = (mySeat + 3) % 4;
  const partnerSeat = seatTop;
  // 明牌规则：仅本方头游时，把队友剩余手牌明牌给本方看
  const showPartnerCards = headSeat >= 0
    && teamOf(headSeat) === teamOf(mySeat)
    && headSeat !== partnerSeat
    && !game.finished.includes(partnerSeat);

  // 服务端视角只下发手牌张数（防作弊），P2P 模式回退到手牌长度
  const counts = game.handCounts ?? game.hands.map((h) => h.length);
  const myTeamCount = counts[seatBottom] + counts[seatTop];
  const oppTeamCount = counts[seatLeft] + counts[seatRight];
  const levelName = rankName(game.level);
  const myName = players[mySeat] || SEAT_NAMES[mySeat];
  const seatLabel = (s: number) => players[s] || SEAT_NAMES[s];

  const sortedHand = [...myHand].sort((a, b) => {
    const va = cardVal(a, game ? game.level : 2);
    const vb = cardVal(b, game ? game.level : 2);
    if (va !== vb) return vb - va;
    if (a.k !== undefined && b.k !== undefined) return b.k! - a.k!;
    return a.s < b.s ? -1 : 1;
  });

  // 出牌区只显示每位玩家当前轮（roundId 匹配）最近一手；上一轮记录即使残留也不显示，一圈结束整体清空
  const roundPlaysOf = (p: number) => {
    if (!game || game.roundPlays.length === 0) return [];
    const mine = game.roundPlays.filter((pl) => pl.player === p && pl.roundId === game.roundId);
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
    <div ref={tableRef} className={`gd-table gd3-stage ${floating ? 'gd-floating' : ''}`}>
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
      {/* 独立全屏舞台：左上角 ☰ 菜单 */}
      {(
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
              <button
                className="gd-menu-btn"
                title="在独立窗口中打开牌桌（新窗口为新的联机大厅）"
                onClick={() => {
                  setMenuOpen(false);
                  if (!openGameWindow('gd-online')) setNotice('浏览器拦截了独立窗口，请允许本站弹出窗口后重试');
                }}
              >
                🪟 独立窗口
              </button>
              <button className="gd-menu-btn" onClick={() => { copyRoomCode(); setMenuOpen(false); }}>
                📋 复制房间号
              </button>
              {role === 'host' && (
                <button className="gd-menu-btn" onClick={() => { nextRound(); setMenuOpen(false); }} disabled={!game || game.phase !== 'over'}>
                  🔄 开始下一局
                </button>
              )}
              <button className="gd-menu-btn danger" onClick={() => { if (onExit) onExit(); else { setFloating(false); try { exitFullscreen(); } catch { /* 忽略 */ } } }}>
                🚪 退出游戏
              </button>
            </div>
            <div className="gd-menu-hint">点击棋盘任意位置关闭面板</div>
          </div>
        </>
      )}
      <div className="gd-topbar">
        <span className="gd-info">🎯 打 <b className="gd-level">{levelName}</b></span>
        <span className="gd-info">🃏 变牌 <b className="gd-wild-gold">红桃{levelName}</b></span>
        <span className="gd-info">我方 <b>{myTeamCount}</b> 张</span>
        <span className="gd-info">对方 <b>{oppTeamCount}</b> 张</span>
        <span className="gd-info">房间 <b className="gd-level">{roomCode}</b></span>
        <span className={`gd-info gd-transport ${transport === 'server' ? 'gd-transport-server' : ''}`}>
          {transport === 'server' ? '🛰 服务器权威' : '🔗 P2P 直连'}
        </span>
        {isMyTurn && status === 'playing' && countdown > 0 && (
          <span className={`gd-countdown ${countdown <= 5 ? 'gd-countdown-urgent' : ''}`}>⏱ {countdown}s</span>
        )}
      </div>
      {game.gongMessage && <div className="gd-gong-bar">{game.gongMessage}</div>}

      <div className="gd-seats">
        <div className={`gd-seat gd-seat-top gd-team-mine ${game.current === seatTop ? 'gd-active' : ''}`}>
          <span className="gd-seat-name">🤝 {seatLabel(seatTop)}</span>
          <span className="gd-team-tag gd-team-mine-tag">我方</span>
          {game.finished.includes(seatTop)
            ? <span className={`gd-rank-tag ${game.finished[0] === seatTop ? 'gd-rank-1' : ''}`}>
                {game.finished[0] === seatTop ? '🏆 头游' : `第${game.finished.indexOf(seatTop) + 1}名`}
              </span>
            : null}
          {!game.finished.includes(seatTop) && counts[seatTop] <= 10 && <span className="gd-seat-count">{counts[seatTop]} 张</span>}
          {!game.finished.includes(seatTop) && game.roundPass.includes(seatTop) && <span className="gd-pass-tag">不出</span>}
        </div>
        {showPartnerCards && partnerSeat === seatTop && (
          <div className="gd-partner-cards">
            <span className="gd-partner-label">🤝 对家牌面</span>
            <div className="gd-partner-cards-row">
              {game.hands[partnerSeat].map((c) => (
                <span
                  key={c.id}
                  className={`gd-mini-card ${c.k !== undefined ? (c.k === 1 ? 'gd-mini-joker' : 'gd-mini-small-joker') : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'}`}
                >
                  <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                  {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                  {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                </span>
              ))}
              {counts[seatTop] === 0 && <span className="gd-partner-empty">已出完</span>}
            </div>
          </div>
        )}
        <div className="gd-play-area gd-play-north">{renderRoundPlays(seatTop)}</div>
        <div className="gd-side-row">
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-left gd-team-opp ${game.current === seatLeft ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 {seatLabel(seatLeft)}</span>
              <span className="gd-team-tag gd-team-opp-tag">对方</span>
              {headSeat === seatLeft && <span className="gd-head-tag">🏆 头游</span>}
              {counts[seatLeft] <= 10 && <span className="gd-seat-count">{counts[seatLeft]} 张</span>}
              {game.roundPass.includes(seatLeft) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(seatLeft) && <span className="gd-finished-tag">已出完</span>}
            </div>
            <div className="gd-play-area gd-play-west">{renderRoundPlays(seatLeft)}</div>
          </div>
          <div className="gd-center-play">
            {game.phase === 'over' ? <span className="gd-freetext">{game.resultText}</span> :
              game.lastPlay ? <span className="gd-freetext">跟牌：{seatLabel(game.lastPlay.player)}</span> :
              <span className="gd-freetext">自由出牌</span>}
          </div>
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-right gd-team-opp ${game.current === seatRight ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 {seatLabel(seatRight)}</span>
              <span className="gd-team-tag gd-team-opp-tag">对方</span>
              {headSeat === seatRight && <span className="gd-head-tag">🏆 头游</span>}
              {counts[seatRight] <= 10 && <span className="gd-seat-count">{counts[seatRight]} 张</span>}
              {game.roundPass.includes(seatRight) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(seatRight) && <span className="gd-finished-tag">已出完</span>}
            </div>
            <div className="gd-play-area gd-play-east">{renderRoundPlays(seatRight)}</div>
          </div>
        </div>
      </div>

      {/* 我方（南）出牌区：手牌上方 */}
      <div className="gd-play-area gd-play-south">{renderRoundPlays(seatBottom)}</div>

      <div className={`gd-actions ${game.finished.includes(mySeat) ? 'gd-actions-finished' : ''}`}>
        <span className="gd-turn-hint">
          {game.phase === 'over' ? game.resultText
            : game.finished.includes(mySeat)
              ? (headSeat === mySeat
                ? '🏆 你已头游！' + (game.finished.length < 4 ? ' 明牌查看对家剩余牌' : '')
                : `✅ 你已${game.finished.indexOf(mySeat) + 1}游，等待其他玩家…`)
              : isMyTurn
                ? (canPlay ? `🖐 轮到你（${myName}）出牌`
                  : game.lastPlay ? `🙅 没有牌大过上家（可点"不出"过牌）`
                  : `🖐 轮到你（${myName}）出牌`)
              : `等待 ${seatLabel(game.current)} 出牌…`}
        </span>
        {/* 已出完玩家：完全隐藏出牌操作按钮，避免误触和混淆 */}
        {!game.finished.includes(mySeat) && game.phase === 'playing' && (
          <>
            <button className="gd-btn gd-btn-pass" onClick={doPass} disabled={!canPass}>不出</button>
            <button className="gd-btn gd-btn-hint" onClick={applyHint} disabled={!isMyTurn}>提示</button>
            <button className="gd-btn gd-btn-play gd-btn-primary" onClick={() => doPlay()} disabled={!canPlay}>出牌</button>
          </>
        )}
        <button
          className="gd-btn gd-btn-sort"
          onClick={() => {
            if (sortMode === 'rank') { setSortMode('grouped'); setSortScheme(0); }
            else { setSortScheme((s) => (s + 1) % 4); }
          }}
        >
          {sortMode === 'rank' ? '一键理牌' : `方案${sortScheme + 1}/4`}
        </button>
        {sortMode === 'grouped' && (
          <button className="gd-btn gd-btn-sort gd-btn-restore" onClick={() => setSortMode('rank')}>↩️ 恢复理牌</button>
        )}
      </div>

      {sortMode === 'grouped' ? (
        <div className="gd-hand gd-hand-grouped">
          {groupHand(myHand, game.level, sortScheme).map((g, gi) => (
            <div className="gd-hand-group" key={gi}>
              <div className="gd-hand-group-cards">
                {g.cards.map((c, ci) => (
                  <button
                    key={c.id}
                    className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? (c.k === 1 ? 'gd-card-joker' : 'gd-card-small-joker') : (c.r === levelRank(game.level) ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    onClick={() => toggleCard(c.id)}
                    style={{ zIndex: ci + 1 }}
                  >
                    <span className="gd-card-corner gd-corner-tl">
                      <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
                    </span>
                    <span className="gd-card-center">{c.k !== undefined ? <GuandanJoker big={c.k === 1} /> : SUIT_SYMBOL[c.s]}</span>
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
              className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? (c.k === 1 ? 'gd-card-joker' : 'gd-card-small-joker') : (c.r === levelRank(game.level) ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
              onClick={() => toggleCard(c.id)}
              style={{ marginLeft: i > 0 ? -Math.min(34, 300 / sortedHand.length) : 0 }}
            >
              <span className="gd-card-corner gd-corner-tl">
                <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
              </span>
              <span className="gd-card-center">{c.k !== undefined ? <GuandanJoker big={c.k === 1} /> : SUIT_SYMBOL[c.s]}</span>
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
