/**
 * ChessKids - 围棋联机对战 Store
 * 基于 PeerJS (WebRTC P2P)：创建房间/加入房间，同步落子/PASS/认输/重开，聊天+语音
 * 消息设计：双方各自维护对局状态，通过同步落子序列保持一致
 */
import { create } from 'zustand';

/** 动态加载 PeerJS（首次使用时加载） */
let peerjsPromise: Promise<any> | null = null;
function loadPeerJS(): Promise<any> {
  if (peerjsPromise) return peerjsPromise;
  peerjsPromise = import('peerjs')
    .then((mod) => mod.default || mod.Peer || mod)
    .catch((err) => { peerjsPromise = null; throw err; });
  return peerjsPromise;
}

export type GoConnStatus = 'disconnected' | 'connecting' | 'connected';

export interface GoChatMessage {
  from: string; // 'me' | 'opponent' | 'system'
  message: string;
  timestamp: number;
  isVoice?: boolean;
  audioData?: string;
  duration?: number;
}

interface GoMultiplayerState {
  connectionStatus: GoConnStatus;
  peerId: string | null;
  roomCode: string | null;
  isHost: boolean;
  myColor: 'b' | 'w' | null;
  opponentColor: 'b' | 'w' | null;
  opponentName: string | null;
  chatMessages: GoChatMessage[];
  notification: string | null;

  createRoom: () => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  leaveRoom: () => void;
  sendMove: (r: number, c: number) => void;
  sendPass: () => void;
  sendResign: () => void;
  sendReset: () => void;
  sendChat: (message: string) => void;
  sendVoiceMessage: (audioData: string, duration: number) => void;
  clearNotification: () => void;

  // 对局回调（由模块注册）
  onOpponentMove: ((r: number, c: number) => void) | null;
  onOpponentPass: (() => void) | null;
  onOpponentResign: (() => void) | null;
  onOpponentReset: (() => void) | null;
  registerHandlers: (h: { onOpponentMove: (r: number, c: number) => void; onOpponentPass: () => void; onOpponentResign: () => void; onOpponentReset: () => void }) => void;
}

let peer: any = null;
let conn: any = null;

/**
 * 多信令节点（PeerJS 官方 0-3 子域）。
 * 公共信令服务器偶发不可达/被网络干扰是"异地无法进入房间"的头号原因：
 * 房主创建房间时逐个探测可用节点，并把节点序号编码进房间码末位；
 * 加入方按房间码解析同一节点连接，保证双方在同一信令域内互通。
 */
const PEER_SERVERS = [
  { host: '0.peerjs.com', port: 443, secure: true, path: '/' },
  { host: '1.peerjs.com', port: 443, secure: true, path: '/' },
  { host: '2.peerjs.com', port: 443, secure: true, path: '/' },
  { host: '3.peerjs.com', port: 443, secure: true, path: '/' },
];

/** 增强 ICE：多 STUN 打洞 + 多 TURN 中继（TCP/443、TLS 优先），跨网/蜂窝/企业 NAT 也能中继连通 */
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302'] },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:eu-0.turn.peerjs.com:443?transport=tcp', username: 'peerjs', credential: 'peerjsp' },
  { urls: 'turn:eu-0.turn.peerjs.com:443?transport=udp', username: 'peerjs', credential: 'peerjsp' },
];

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * 解析房间码 → { peerId, serverIdx }
 * 新格式：6 位字母数字 + 末位数字(0-3) = 信令节点序号；
 * 旧格式：6 位（无序号）→ 默认节点 0，保证旧房间码仍可加入。
 */
function parseRoomCode(code: string): { peerId: string; serverIdx: number } {
  const c = (code || '').trim().toUpperCase();
  if (c.length === 7 && c[6] >= '0' && c[6] <= '3') {
    return { peerId: c.slice(0, 6), serverIdx: Number(c[6]) };
  }
  return { peerId: c, serverIdx: 0 };
}

function addChatMessage(state: GoMultiplayerState, from: string, message: string, extra?: Partial<GoChatMessage>) {
  state.chatMessages = [...state.chatMessages, { from, message, timestamp: Date.now(), ...extra }];
}

export const useGoMultiplayerStore = create<GoMultiplayerState>((set, get) => {
  /** 发送消息（校验连接状态） */
  function sendMessage(data: Record<string, unknown>): boolean {
    if (!conn || !conn.open) {
      console.warn(`[go-multiplayer] sendMessage failed: conn not open, type=${data.type}`);
      set({ notification: '连接不稳定，消息发送失败，请检查网络' });
      return false;
    }
    const channel = conn.dataChannel || conn.channel || conn._dc;
    if (channel && channel.readyState !== 'open') {
      set({ notification: '连接不稳定，消息发送失败，请检查网络' });
      return false;
    }
    try {
      conn.send(data);
      return true;
    } catch (err) {
      console.error('[go-multiplayer] sendMessage error:', err);
      set({ notification: '消息发送失败，网络连接不稳定' });
      return false;
    }
  }

  /** 处理对手消息 */
  function handleMessage(data: any) {
    if (!data || !data.type) return;
    const state = get();
    try {
      switch (data.type) {
        case 'HELLO': {
          const senderColor = data.color as 'b' | 'w';
          if (senderColor !== 'b' && senderColor !== 'w') return;
          set({
            opponentColor: senderColor,
            opponentName: data.name || '对手',
            connectionStatus: 'connected',
          });
          addChatMessage(get(), 'system', `对手已加入，对局开始！`);
          break;
        }
        case 'MOVE': {
          const r = data.r, c = data.c;
          if (typeof r !== 'number' || typeof c !== 'number') return;
          state.onOpponentMove?.(r, c);
          break;
        }
        case 'PASS': {
          state.onOpponentPass?.();
          break;
        }
        case 'RESIGN': {
          state.onOpponentResign?.();
          break;
        }
        case 'RESET': {
          state.onOpponentReset?.();
          break;
        }
        case 'CHAT': {
          if (typeof data.message !== 'string') return;
          const from = get().opponentColor || 'opponent';
          addChatMessage(get(), from, data.message);
          break;
        }
        case 'VOICE': {
          if (typeof data.audioData !== 'string') return;
          const from = get().opponentColor || 'opponent';
          addChatMessage(get(), from, '语音消息', {
            isVoice: true,
            audioData: data.audioData,
            duration: typeof data.duration === 'number' ? data.duration : 0,
          });
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error('[go-multiplayer] handleMessage error:', err);
    }
  }

  /**
   * 初始化 Peer 并处理连接。
   * @param serverIdx 信令节点序号（0-3）；房主探测与加入方必须一致才能互通
   * @param signalTimeout 信令建立超时（毫秒）：超过则销毁并 reject，供上层换节点/重试
   * 修复：
   *  - host 端等待 peer.on('open') 才 resolve（房间创建成功即可分享），不再因等对手而"卡住"
   *  - unavailable-id 不再静默改 id（会导致加入方按原码找不到房主），直接 reject 由上层换节点/换码
   */
  function initPeer(peerId: string, roomCode: string, isHost: boolean, serverIdx: number, signalTimeout = 8000): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (peer) {
        try { peer.destroy(); } catch {}
        peer = null;
      }
      conn = null;
      set({ connectionStatus: 'connecting' });
      let settled = false;
      const finishOk = () => { if (!settled) { settled = true; clearTimeout(signalTimer); resolve(); } };
      const finishErr = (err: any) => { if (!settled) { settled = true; clearTimeout(signalTimer); reject(err); } };
      const server = PEER_SERVERS[serverIdx] || PEER_SERVERS[0];
      const signalTimer = setTimeout(() => {
        console.warn('[go-multiplayer] 信令节点超时:', server.host);
        try { if (peer) { peer.destroy(); peer = null; } } catch {}
        finishErr(new Error('signal-timeout'));
      }, signalTimeout);
      try {
        const Peer = await loadPeerJS();
        // 关键：房主用"房间码"作为自己的 Peer id（对手凭码找到他）；
        // 加入方必须用匿名 id（不传 peerId），否则会与房主 id 冲突（unavailable-id）导致无法加入。
        const peerOpts = {
          debug: 0,
          host: server.host,
          port: server.port,
          path: server.path,
          secure: server.secure,
          config: { iceServers: ICE_SERVERS },
        };
        peer = isHost ? new Peer(peerId, peerOpts) : new Peer(peerOpts);
        peer.on('error', (err: any) => {
          console.warn('[go-multiplayer] peer error:', err?.type, server.host);
          try { if (peer) { peer.destroy(); peer = null; } } catch {}
          if (err?.type === 'unavailable-id') {
            // 房间号被占用：不再静默换 id，交给上层换节点/重新生成，避免加入方按原码找不到
            set({ connectionStatus: 'disconnected', notification: '房间号已被占用，请重新创建' });
            finishErr(err);
            return;
          }
          if (err?.type === 'peer-unavailable') {
            set({ connectionStatus: 'disconnected', notification: '未找到该房间，请确认房间号或让房主重新创建' });
          } else if (err?.type === 'server-error' || err?.type === 'network' || err?.type === 'socket-error') {
            set({ connectionStatus: 'disconnected', notification: `联机服务器（${server.host}）连接失败，正在尝试其他节点…` });
          } else {
            set({ connectionStatus: 'disconnected', notification: '连接失败：' + (err?.type || '网络错误') });
          }
          finishErr(err);
        });

        if (isHost) {
          peer.on('open', () => {
            // 房间创建成功：立即返回房间码供分享；对手连接由 conn.on('open') 接管
            set({ roomCode, isHost: true, myColor: 'b', opponentColor: null, opponentName: null });
            finishOk();
          });
          peer.on('connection', (incoming: any) => {
            conn = incoming;
            conn.on('open', () => {
              set({ connectionStatus: 'connected' });
              sendMessage({ type: 'HELLO', name: '房主', color: 'b' });
              finishOk();
            });
            conn.on('data', handleMessage);
            conn.on('close', () => {
              set({ connectionStatus: 'disconnected', notification: '对方已离开房间' });
              conn = null;
            });
          });
          // 等待连接（超时提示，不阻塞）
          setTimeout(() => {
            if (get().connectionStatus === 'connecting') {
              set({ notification: '等待对手加入中…可复制房间号分享给好友' });
            }
          }, 800);
        } else {
          peer.on('open', () => {
            const outgoing = peer.connect(roomCode, { reliable: true });
            conn = outgoing;
            const timeout = setTimeout(() => {
              if (get().connectionStatus === 'connecting') {
                set({ connectionStatus: 'disconnected', notification: '连接超时，请检查房间号与网络' });
                try { if (outgoing) outgoing.close(); } catch {}
                finishErr(new Error('timeout'));
              }
            }, 15000);
            outgoing.on('open', () => {
              clearTimeout(timeout);
              set({ connectionStatus: 'connected' });
              sendMessage({ type: 'HELLO', name: '玩家', color: 'w' });
              finishOk();
            });
            outgoing.on('data', handleMessage);
            outgoing.on('close', () => {
              set({ connectionStatus: 'disconnected', notification: '对方已离开房间' });
              conn = null;
            });
          });
        }
      } catch (err) {
        console.error('[go-multiplayer] initPeer error:', err);
        try { if (peer) { peer.destroy(); peer = null; } } catch {}
        set({ connectionStatus: 'disconnected', notification: '联机初始化失败，请检查网络后重试' });
        finishErr(err);
      }
    });
  }

  return {
    connectionStatus: 'disconnected',
    peerId: null,
    roomCode: null,
    isHost: false,
    myColor: null,
    opponentColor: null,
    opponentName: null,
    chatMessages: [],
    notification: null,
    onOpponentMove: null,
    onOpponentPass: null,
    onOpponentResign: null,
    onOpponentReset: null,

    registerHandlers: (h) => set({
      onOpponentMove: h.onOpponentMove,
      onOpponentPass: h.onOpponentPass,
      onOpponentResign: h.onOpponentResign,
      onOpponentReset: h.onOpponentReset,
    }),

    createRoom: async () => {
      const base = generateRoomCode();
      set({ roomCode: base, isHost: true, myColor: 'b', opponentColor: null, opponentName: null, chatMessages: [], notification: null });
      // 逐个探测信令节点：第一个可用的即作为本房间节点，节点序号编码进房间码末位
      for (let idx = 0; idx < PEER_SERVERS.length; idx++) {
        try {
          await initPeer(base, base, true, idx);
          const fullCode = base + String(idx);
          set({ roomCode: fullCode });
          return fullCode;
        } catch (err: any) {
          if (err?.type === 'unavailable-id' && idx < PEER_SERVERS.length - 1) continue;
          console.warn('[go-multiplayer] 节点探测失败 idx=', idx, err?.type);
        }
      }
      set({ connectionStatus: 'disconnected', notification: '无法连接联机服务器（网络受限或服务器繁忙），请稍后重试' });
      return null;
    },

    joinRoom: async (code: string) => {
      const { peerId, serverIdx } = parseRoomCode(code);
      if (!peerId) return false;
      set({ roomCode: peerId.length === 6 && code.trim().length === 7 ? peerId + String(serverIdx) : code.trim().toUpperCase(), isHost: false, myColor: 'w', opponentColor: null, opponentName: null, chatMessages: [], notification: null });
      // 跨网/信令抖动时自动重试（同一节点，最多 3 次，指数退避）
      const attempts = [0, 1, 2];
      for (let i = 0; i < attempts.length; i++) {
        try {
          await initPeer(peerId, peerId, false, serverIdx);
          return true;
        } catch (err: any) {
          if (i < attempts.length - 1) {
            const wait = 600 * (i + 1);
            await new Promise((r) => setTimeout(r, wait));
          } else {
            console.warn('[go-multiplayer] join failed after retries:', err?.type);
            set({ connectionStatus: 'disconnected', notification: '加入失败：未找到房间或网络受限（异地联机可让房主重新创建房间，或双方切换网络后重试）' });
          }
        }
      }
      return false;
    },

    leaveRoom: () => {
      if (conn) { try { conn.close(); } catch {} }
      if (peer) { try { peer.destroy(); } catch {} }
      peer = null;
      conn = null;
      set({
        connectionStatus: 'disconnected',
        roomCode: null,
        isHost: false,
        myColor: null,
        opponentColor: null,
        opponentName: null,
        notification: null,
      });
    },

    sendMove: (r, c) => sendMessage({ type: 'MOVE', r, c }),
    sendPass: () => sendMessage({ type: 'PASS' }),
    sendResign: () => sendMessage({ type: 'RESIGN' }),
    sendReset: () => sendMessage({ type: 'RESET' }),

    sendChat: (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const ok = sendMessage({ type: 'CHAT', message: trimmed });
      if (ok) addChatMessage(get(), 'me', trimmed);
    },

    sendVoiceMessage: (audioData: string, duration: number) => {
      const ok = sendMessage({ type: 'VOICE', audioData, duration });
      if (ok) addChatMessage(get(), 'me', '语音消息', { isVoice: true, audioData, duration });
    },

    clearNotification: () => set({ notification: null }),
  };
});
