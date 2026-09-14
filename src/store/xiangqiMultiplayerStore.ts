/**
 * ChessKids - 中国象棋联机对战状态管理
 * 基于 PeerJS (WebRTC P2P)，无需后端服务器，通过房间号/分享链接连接好友
 * 房主执红（先手），加入者执黑
 */

import { create } from 'zustand';
import type {
  XiangqiBoard,
  XiangqiColor,
  XiangqiGameStatus,
  XiangqiMove,
  XiangqiMoveHistoryEntry,
  XiangqiSquare,
} from '../types/xiangqi';
import {
  XIANGQI_INITIAL_BOARD,
  cloneXiangqiBoard,
  applyXiangqiMove,
  getAllXiangqiLegalMoves,
  getXiangqiGameStatus,
  getXiangqiMoveNotation,
  isXiangqiRed,
} from '../engine/xiangqi';

/** 动态加载 PeerJS（首次使用时加载，失败不影响其他模块） */
let peerjsPromise: Promise<any> | null = null;
async function loadPeerJS(): Promise<any> {
  if (peerjsPromise) return peerjsPromise;
  peerjsPromise = import('peerjs')
    .then((mod) => mod.default || mod.Peer || mod)
    .catch((err) => {
      peerjsPromise = null;
      throw err;
    });
  return peerjsPromise;
}

/** 连接状态 */
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/** 聊天消息 */
interface ChatMessage {
  from: XiangqiColor | 'system';
  message: string;
  timestamp: number;
  isVoice?: boolean;
  audioData?: string;
  duration?: number;
}

/** 选中状态 */
interface Selection {
  from: XiangqiSquare;
  legalTargets: XiangqiSquare[];
}

/** 对手信息 */
interface OpponentInfo {
  name: string;
  color: XiangqiColor;
}

/** 联网对战 Store 接口 */
interface XiangqiMultiplayerState {
  connectionStatus: ConnectionStatus;
  roomCode: string | null;
  color: XiangqiColor | null;
  opponent: OpponentInfo | null;
  inGame: boolean;
  peerId: string | null;

  board: XiangqiBoard;
  turn: XiangqiColor;
  status: XiangqiGameStatus;
  history: XiangqiMoveHistoryEntry[];
  moves: XiangqiMove[];
  lastMove: { from: XiangqiSquare; to: XiangqiSquare } | null;

  selection: Selection | null;
  chatMessages: ChatMessage[];
  notification: string | null;

  createRoom: () => void;
  joinRoom: (roomCode: string) => void;
  leaveRoom: () => void;
  sendChat: (message: string) => void;
  sendVoiceMessage: (audioData: string, duration: number) => void;
  selectSquare: (row: number, col: number) => void;
  requestReset: () => void;
  clearNotification: () => void;
  clearSelection: () => void;
}

// ===== 模块级变量 =====

/** PeerJS 实例 */
let peer: any = null;

/** 与对手的连接 */
let conn: any = null;

/** 连接超时计时器 */
let connectTimeout: ReturnType<typeof setTimeout> | null = null;

/** 标记是否正在重试（防止 destroy 触发 handleDisconnect 清空重试状态） */
let isRetrying = false;

// ===== 辅助函数 =====

/** 判断棋子是否属于指定颜色 */
function isOwnPiece(piece: string, color: XiangqiColor): boolean {
  if (!piece) return false;
  const isRedPiece = isXiangqiRed(piece);
  return (color === 'r' && isRedPiece) || (color === 'b' && !isRedPiece);
}

/** 生成带前缀的房间号（X-XXXXXX，X 代表 Xiangqi 中国象棋） */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'X-' + code;
}

/** 获取初始棋盘状态 */
function getInitialBoardState() {
  return {
    board: cloneXiangqiBoard(XIANGQI_INITIAL_BOARD),
    turn: 'r' as XiangqiColor,
    status: 'playing' as XiangqiGameStatus,
    history: [] as XiangqiMoveHistoryEntry[],
    moves: [] as XiangqiMove[],
    lastMove: null as { from: XiangqiSquare; to: XiangqiSquare } | null,
    selection: null as Selection | null,
  };
}

// ===== Store 创建 =====

export const useXiangqiMultiplayerStore = create<XiangqiMultiplayerState>((set, get) => {
  /** 校验坐标是否合法（10行9列） */
  function isValidSquare(sq: any): sq is XiangqiSquare {
    return Array.isArray(sq) && sq.length === 2 &&
      typeof sq[0] === 'number' && typeof sq[1] === 'number' &&
      sq[0] >= 0 && sq[0] < 10 && sq[1] >= 0 && sq[1] < 9;
  }

  /** 在当前棋盘上应用一步走法 */
  function applyMoveToState(from: XiangqiSquare, to: XiangqiSquare) {
    const state = get();
    if (!isValidSquare(from) || !isValidSquare(to)) {
      console.error('[xq-multiplayer] applyMoveToState: invalid square', from, to);
      return;
    }
    const piece = state.board[from[0]][from[1]];
    const captured = state.board[to[0]][to[1]] || undefined;
    const notation = getXiangqiMoveNotation(piece, from, to, captured);
    const { board: newBoard } = applyXiangqiMove(state.board, from, to);
    const move: XiangqiMove = { from, to, piece, captured, notation };
    const newMoves = [...state.moves, move];
    const newTurn: XiangqiColor = state.turn === 'r' ? 'b' : 'r';
    const newStatus = getXiangqiGameStatus(newBoard, newTurn);

    const moveNum = Math.ceil(newMoves.length / 2);
    const newHistory = [...state.history];
    if (state.turn === 'r') {
      newHistory.push({ moveNumber: moveNum, red: notation, black: '' });
    } else {
      if (newHistory.length > 0) {
        newHistory[newHistory.length - 1].black = notation;
      }
    }

    set({ board: newBoard, turn: newTurn, status: newStatus, moves: newMoves, history: newHistory, lastMove: { from, to }, selection: null });
  }

  /** 添加聊天消息 */
  function addChatMessage(from: XiangqiColor | 'system', message: string) {
    set((state) => ({ chatMessages: [...state.chatMessages, { from, message, timestamp: Date.now() }] }));
  }

  /** 发送消息给对手 */
  function sendMessage(data: Record<string, unknown>): boolean {
    // 双重校验：conn.open + DataChannel.readyState === 'open'
    // 移动网络下通道可能已进入 closing/closed 但 conn.open 仍为 true
    if (!conn || !conn.open) {
      console.warn(`[xq-multiplayer] sendMessage failed: conn not open, type=${data.type}`);
      return false;
    }
    // 检查底层 RTCDataChannel 实际状态
    const channel = conn.dataChannel || conn.channel || conn._dc;
    if (channel && channel.readyState !== 'open') {
      console.warn(`[xq-multiplayer] sendMessage failed: channel readyState=${channel.readyState}, type=${data.type}`);
      set({ notification: '连接不稳定，消息发送失败，请检查网络' });
      return false;
    }
    try {
      const dataSize = JSON.stringify(data).length;
      console.log(`[xq-multiplayer] Sending ${data.type} message, ~${dataSize} bytes`);
      conn.send(data);
      return true;
    } catch (err) {
      console.error(`[xq-multiplayer] sendMessage error:`, err);
      set({ notification: '消息发送失败，网络连接不稳定' });
      return false;
    }
  }

  /** 处理对手发来的消息 */
  function handleMessage(data: any) {
    if (!data || !data.type) return;

    try {
      switch (data.type) {
        case 'HELLO': {
          const senderColor = data.color as XiangqiColor;
          if (senderColor !== 'r' && senderColor !== 'b') return;
          set({ opponent: { name: data.name || '对手', color: senderColor } });
          addChatMessage('system', `对手 ${data.name || '对手'} 已加入，对局开始！`);
          break;
        }

        case 'MOVE': {
          const from = data.from as XiangqiSquare;
          const to = data.to as XiangqiSquare;
          if (!isValidSquare(from) || !isValidSquare(to)) {
            console.error('[xq-multiplayer] Invalid MOVE coordinates:', data);
            return;
          }
          applyMoveToState(from, to);
          break;
        }

        case 'GAME_RESET': {
          set({ ...getInitialBoardState(), notification: '对手发起了重开，游戏已重置' });
          addChatMessage('system', '游戏已重置');
          break;
        }

        case 'CHAT': {
          if (typeof data.message !== 'string') return;
          const opponentColor = get().opponent?.color;
          if (opponentColor) {
            addChatMessage(opponentColor, data.message);
          }
          break;
        }

        case 'VOICE': {
          if (typeof data.audioData !== 'string') return;
          console.log('[xq-multiplayer] Received voice message, size: ~', data.audioData?.length || 0, 'chars');
          const opponentColor = get().opponent?.color;
          if (opponentColor) {
            set((state) => ({
              chatMessages: [...state.chatMessages, {
                from: opponentColor,
                message: '语音消息',
                timestamp: Date.now(),
                isVoice: true,
                audioData: data.audioData,
                duration: typeof data.duration === 'number' ? data.duration : 0,
              }],
            }));
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[xq-multiplayer] handleMessage error:', err);
    }
  }

  /** 初始化 Peer 实例 */
  function initPeer(peerId: string, roomCode: string, isHost: boolean, relayOnly: boolean = false): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (peer) {
        try { peer.destroy(); } catch {}
        peer = null;
      }

      set({ connectionStatus: 'connecting' });

      try {
        const Peer = await loadPeerJS();

        // ICE 服务器：TCP 443 / TLS 443 优先（校园网/企业网最易通过）
        const iceServers = [
          { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:eu-0.turn.peerjs.com:443?transport=tcp', username: 'peerjs', credential: 'peerjsp' },
          { urls: 'turn:eu-0.turn.peerjs.com:443', username: 'peerjs', credential: 'peerjsp' },
          { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:eu-0.turn.peerjs.com:3478?transport=tcp', username: 'peerjs', credential: 'peerjsp' },
          { urls: 'turn:eu-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
        ];

        peer = new Peer(peerId, {
          host: '0.peerjs.com',
          port: 443,
          path: '/',
          secure: true,
          debug: 2,
          config: {
            iceServers,
            iceTransportPolicy: relayOnly ? 'relay' : 'all',
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
          },
        });
        console.log(`[xq-multiplayer] Peer created, relayOnly=${relayOnly}, isHost=${isHost}`);

        peer.on('open', (id: string) => {
          set({ peerId: id, roomCode, connectionStatus: 'connected' });
          resolve();
        });

        peer.on('error', (err: any) => {
          console.warn('[xq-multiplayer] Peer error:', err);
          if (err.type === 'unavailable-id' && isHost) {
            const newCode = generateRoomCode();
            peer.destroy();
            peer = null;
            initPeer(newCode, newCode, true).then(resolve).catch(reject);
          } else if (err.type === 'peer-unavailable') {
            set({ notification: '房间不存在或对方已离开，请确认房间号是否正确', connectionStatus: 'disconnected' });
            reject(err);
          } else if (err.type === 'negotiation-failed' || err.type === 'ice-connection-failed') {
            reject(err);
          } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
            set({
              notification: '无法连接到信令服务器，请检查网络连接后重试',
              connectionStatus: 'disconnected',
            });
            reject(err);
          } else {
            set({ notification: `连接失败：${err.message || err.type}`, connectionStatus: 'disconnected' });
            reject(err);
          }
        });

        peer.on('close', () => {
          if (isRetrying) return;
          handleDisconnect();
        });

        peer.on('disconnected', () => {
          if (peer && !peer.destroyed) {
            try {
              peer.reconnect();
            } catch {
              handleDisconnect();
            }
          }
        });

        if (isHost) {
          peer.on('connection', (connection: any) => {
            console.log('[xq-multiplayer] Incoming connection from peer');
            if (conn && conn.open) {
              connection.close();
              return;
            }
            setupConnection(connection);
          });
        }
      } catch (err: any) {
        set({
          notification: `PeerJS 加载失败：${err.message || '网络错误'}`,
          connectionStatus: 'disconnected',
        });
        reject(err);
      }
    });
  }

  /** 设置数据连接 */
  function setupConnection(connection: any) {
    conn = connection;

    // === 先注册所有事件监听器，再处理 open 状态 ===
    // 这样可以确保：即使连接已经 open，对方发来的消息也不会丢失

    // 接收消息
    conn.on('data', (data: any) => {
      handleMessage(data);
    });

    // 连接关闭
    conn.on('close', () => {
      handleOpponentLeft('left');
    });

    // 连接错误
    conn.on('error', (err: any) => {
      const errType = err?.type || '';
      console.error('[xq-multiplayer] Connection error:', errType, err);
      if (errType === 'negotiation-failed' || errType === 'ice-connection-failed') {
        handleOpponentLeft('error');
      } else {
        handleOpponentLeft('network');
      }
    });

    const onConnOpen = () => {
      const state = get();
      const myColor = state.color;
      if (!myColor) return;

      // 二次确认 DataChannel 实际就绪
      const channel = conn.dataChannel || conn.channel || conn._dc;
      if (channel && channel.readyState !== 'open') {
        // 通道尚未就绪，延迟一小段时间再检查
        const checkReady = setInterval(() => {
          const ch = conn?.dataChannel || conn?.channel || conn?._dc;
          if (ch && ch.readyState === 'open') {
            clearInterval(checkReady);
            finishConnOpen(myColor);
          }
        }, 200);
        // 最多等待 5 秒
        setTimeout(() => clearInterval(checkReady), 5000);
        return;
      }

      finishConnOpen(myColor);
    };

    function finishConnOpen(myColor: XiangqiColor) {
      const opponentColor: XiangqiColor = myColor === 'r' ? 'b' : 'r';

      set({
        inGame: true,
        connectionStatus: 'connected',
        opponent: { name: '对手', color: opponentColor },
        ...getInitialBoardState(),
        chatMessages: [],
        notification: '对手已连接，对局开始！',
      });
      addChatMessage('system', '对手已连接，对局开始！');

      sendMessage({ type: 'HELLO', name: myColor === 'r' ? '房主' : '玩家', color: myColor });
    }

    if (conn.open) {
      onConnOpen();
    } else {
      conn.on('open', onConnOpen);
    }
  }

  /** 对手离开 / 连接断开 */
  function handleOpponentLeft(reason: 'left' | 'error' | 'network' = 'left') {
    // 清理连接引用，防止后续发送继续使用已关闭连接
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }
    conn = null;
    const messages: Record<string, string> = {
      left: '对手已断开连接',
      error: '连接中断，对方可能正在尝试重连',
      network: '网络不稳定，连接已断开',
    };
    set({
      opponent: null,
      notification: messages[reason],
      connectionStatus: 'disconnected',
    });
    addChatMessage('system', messages[reason]);
  }

  /** 断开连接处理 */
  function handleDisconnect() {
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }
    isRetrying = false;
    set({
      connectionStatus: 'disconnected',
      inGame: false,
      roomCode: null,
      color: null,
      opponent: null,
      peerId: null,
      ...getInitialBoardState(),
      chatMessages: [],
    });
    conn = null;
    peer = null;
  }

  return {
    connectionStatus: 'disconnected',
    roomCode: null,
    color: null,
    opponent: null,
    inGame: false,
    peerId: null,
    ...getInitialBoardState(),
    chatMessages: [],
    notification: null,

    // ===== 房间管理 =====

    /** 创建房间（房主执红） */
    createRoom: () => {
      const roomCode = generateRoomCode();
      let hostWaitTimer: ReturnType<typeof setTimeout> | null = null;

      const createWithMode = (relayOnly: boolean) => {
        initPeer(roomCode, roomCode, true, relayOnly)
          .then(() => {
            set({
              color: 'r',
              inGame: true,
              ...getInitialBoardState(),
              chatMessages: [],
              notification: `房间已创建，房间号：${roomCode.replace('X-', '')}，等待对手加入...`,
            });
            // 等待 30 秒如果还没人加入，提示可能在校园网内
            if (hostWaitTimer) clearTimeout(hostWaitTimer);
            hostWaitTimer = setTimeout(() => {
              if (!get().opponent && get().roomCode === roomCode) {
                set({ notification: '等待时间较长，如对方连不上可尝试：1) 切换手机热点 2) 让对方点加入房间重试 3) 双方都关闭VPN' });
              }
            }, 30000);
          })
          .catch(() => {});
      };

      createWithMode(false);
    },

    /** 加入房间（执黑） */
    joinRoom: (roomCode) => {
      const input = roomCode.trim().toUpperCase();
      // 兼容带前缀(X-)和不带前缀的输入，统一为 X-XXXXXX 格式
      let code = input;
      if (code.length === 6) {
        code = 'X-' + code;
      }
      if (!code || code.length !== 8 || !code.startsWith('X-')) {
        set({ notification: '请输入6位房间号' });
        return;
      }

      let retryAttempted = false;

      function attemptConnection(relayOnly: boolean) {
        isRetrying = false;
        const myPeerId = 'xq_' + Math.random().toString(36).substring(2, 10);

        initPeer(myPeerId, code, false, relayOnly)
          .then(() => {
            set({ color: 'b' });

            const connection = peer.connect(code, { reliable: true });
            console.log(`[xq-multiplayer] Connecting to room ${code}, relayOnly=${relayOnly}`);

            if (connectTimeout) clearTimeout(connectTimeout);
            // 校园网延迟高，延长超时时间：直连 20s，中继 35s
            const timeoutMs = relayOnly ? 35000 : 20000;
            connectTimeout = setTimeout(() => {
              if (!conn || !conn.open) {
                if (!retryAttempted) {
                  retryAttempted = true;
                  set({ notification: '直连较慢，正在切换中继模式（校园网推荐）...' });
                  isRetrying = true;
                  if (peer) { try { peer.destroy(); } catch {} peer = null; }
                  setTimeout(() => attemptConnection(true), 600);
                  return;
                }
                set({
                  notification: '连接失败：对方可能在校园网内。建议：1) 双方都用手机热点重试 2) 关闭VPN/代理 3) 确保双方网络正常',
                  connectionStatus: 'disconnected',
                });
              }
            }, timeoutMs);

            connection.on('open', () => {
              console.log(`[xq-multiplayer] Connection opened to ${code}`);
              if (connectTimeout) {
                clearTimeout(connectTimeout);
                connectTimeout = null;
              }
              set({
                inGame: true,
                roomCode: code,
                ...getInitialBoardState(),
                chatMessages: [],
                notification: `已加入房间 ${code}`,
              });
              addChatMessage('system', `已加入房间 ${code}`);
              setupConnection(connection);
            });

            connection.on('error', (err: any) => {
              console.warn('[xq-multiplayer] Connection error:', err);
              if (connectTimeout) {
                clearTimeout(connectTimeout);
                connectTimeout = null;
              }
              const errType = err.type || '';

              if (get().inGame) return;

              if ((errType === 'negotiation-failed' || errType === 'ice-connection-failed') && !retryAttempted) {
                retryAttempted = true;
                set({ notification: '直连失败，正在尝试中继连接...' });
                isRetrying = true;
                if (peer) { try { peer.destroy(); } catch {} peer = null; }
                setTimeout(() => attemptConnection(true), 800);
                return;
              }

              if (errType === 'negotiation-failed' || errType === 'ice-connection-failed') {
                set({
                  notification: '中继连接也失败了，建议：1）让对方切换手机热点重试 2）双方都关闭VPN/代理 3）换一个网络环境',
                  connectionStatus: 'disconnected',
                });
              } else if (errType === 'peer-unavailable') {
                set({
                  notification: '房间不存在或对方已离开，请确认房间号是否正确',
                  connectionStatus: 'disconnected',
                });
              } else {
                set({
                  notification: '加入房间失败：' + (err.message || '未知错误'),
                  connectionStatus: 'disconnected',
                });
              }
            });
          })
          .catch(() => {});
      }

      attemptConnection(false);
    },

    /** 离开房间 */
    leaveRoom: () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      isRetrying = false;
      if (conn) {
        try { conn.close(); } catch {}
        conn = null;
      }
      if (peer) {
        try { peer.destroy(); } catch {}
        peer = null;
      }
      set({
        connectionStatus: 'disconnected',
        inGame: false,
        roomCode: null,
        color: null,
        opponent: null,
        peerId: null,
        ...getInitialBoardState(),
        chatMessages: [],
        notification: null,
      });
    },

    // ===== 走棋 =====

    selectSquare: (row, col) => {
      const state = get();
      if (!state.color || !state.opponent) return;
      if (state.turn !== state.color) return;
      if (
        state.status === 'checkmate' ||
        state.status === 'stalemate' ||
        state.status === 'draw'
      ) return;

      const piece = state.board[row][col];

      if (state.selection) {
        const isTarget = state.selection.legalTargets.some(
          ([r, c]) => r === row && c === col
        );
        if (isTarget) {
          const from = state.selection.from;
          applyMoveToState(from, [row, col]);
          sendMessage({ type: 'MOVE', from, to: [row, col], by: state.color });
          return;
        }
      }

      if (piece && isOwnPiece(piece, state.color)) {
        const allLegal = getAllXiangqiLegalMoves(state.board, state.color);
        const legalTargets = allLegal
          .filter((m) => m.from[0] === row && m.from[1] === col)
          .map((m) => m.to as XiangqiSquare);
        set({ selection: { from: [row, col], legalTargets } });
      } else {
        set({ selection: null });
      }
    },

    // ===== 重开游戏 =====

    requestReset: () => {
      set({ ...getInitialBoardState(), notification: '已发起重开' });
      addChatMessage('system', '已重开游戏');
      sendMessage({ type: 'GAME_RESET' });
    },

    // ===== 聊天 =====

    sendChat: (message) => {
      const state = get();
      if (!state.color) return;
      const text = message.trim();
      if (!text) return;
      sendMessage({ type: 'CHAT', message: text });
      addChatMessage(state.color, text);
    },

    sendVoiceMessage: (audioData, duration) => {
      const state = get();
      if (!state.color) return;
      // 语音消息大小限制：最大 64KB（base64 后约 64KB = 约 48KB 原始音频）
      // 过大的语音消息在移动网络下容易导致 DataChannel 拥塞
      const MAX_VOICE_SIZE = 64 * 1024;
      if (audioData.length > MAX_VOICE_SIZE) {
        set({ notification: '语音消息过长，发送失败（请缩短录音时间）' });
        return;
      }
      const sent = sendMessage({ type: 'VOICE', audioData, duration });
      if (!sent) return;
      set((s) => ({
        chatMessages: [...s.chatMessages, {
          from: state.color!,
          message: '语音消息',
          timestamp: Date.now(),
          isVoice: true,
          audioData,
          duration,
        }],
      }));
    },

    // ===== 辅助方法 =====
    clearNotification: () => set({ notification: null }),
    clearSelection: () => set({ selection: null }),
  };
});
