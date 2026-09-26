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

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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

  /** 初始化 Peer 并处理连接 */
  function initPeer(peerId: string, roomCode: string, isHost: boolean): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (peer) {
        try { peer.destroy(); } catch {}
        peer = null;
      }
      conn = null;
      set({ connectionStatus: 'connecting' });
      try {
        const Peer = await loadPeerJS();
        const iceServers = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:eu-0.turn.peerjs.com:443?transport=tcp', username: 'peerjs', credential: 'peerjsp' },
        ];
        peer = new Peer(peerId, { debug: 0, config: { iceServers } });
        peer.on('error', (err: any) => {
          console.warn('[go-multiplayer] peer error:', err?.type);
          if (err?.type === 'unavailable-id') {
            // 房间名被占用：尝试随机后缀
            const altId = `${roomCode}-${Math.floor(Math.random() * 10000)}`;
            initPeer(altId, roomCode, isHost).then(resolve).catch(reject);
            return;
          }
          if (err?.type === 'peer-unavailable') {
            set({ connectionStatus: 'disconnected', notification: '未找到对手，请确认房间号后重试' });
          } else {
            set({ connectionStatus: 'disconnected', notification: '连接失败：' + (err?.type || '网络错误') });
          }
          reject(err);
        });

        if (isHost) {
          peer.on('connection', (incoming: any) => {
            conn = incoming;
            conn.on('open', () => {
              set({ connectionStatus: 'connected' });
              sendMessage({ type: 'HELLO', name: '房主', color: 'b' });
              resolve();
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
                reject(new Error('timeout'));
              }
            }, 15000);
            outgoing.on('open', () => {
              clearTimeout(timeout);
              set({ connectionStatus: 'connected' });
              sendMessage({ type: 'HELLO', name: '玩家', color: 'w' });
              resolve();
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
        set({ connectionStatus: 'disconnected', notification: '联机初始化失败，请检查网络后重试' });
        reject(err);
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
      const code = generateRoomCode();
      set({ roomCode: code, isHost: true, myColor: 'b', opponentColor: null, opponentName: null, chatMessages: [], notification: null });
      try {
        await initPeer(code, code, true);
        return code;
      } catch {
        return null;
      }
    },

    joinRoom: async (code: string) => {
      const clean = code.trim().toUpperCase();
      if (!clean) return false;
      set({ roomCode: clean, isHost: false, myColor: 'w', opponentColor: null, opponentName: null, chatMessages: [], notification: null });
      try {
        await initPeer(clean, clean, false);
        return true;
      } catch {
        return false;
      }
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
