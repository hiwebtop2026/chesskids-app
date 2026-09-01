/**
 * ChessKids - 联网对战状态管理
 * 基于 PeerJS (WebRTC P2P)，无需后端服务器，通过房间号/分享链接连接好友
 */

import { create } from 'zustand';
import type {
  Board,
  Turn,
  GameStatus,
  Move,
  MoveHistoryEntry,
  PieceColor,
} from '../types/chess';
import {
  INITIAL_BOARD,
  cloneBoard,
  applyMove,
  getAllLegalMoves,
  getGameStatus,
  isMoveLegal,
  moveToNotation,
} from '../engine';

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
  from: PieceColor | 'system';
  message: string;
  timestamp: number;
  isVoice?: boolean;
  audioData?: string;
  duration?: number;
}

/** 选中状态 */
interface Selection {
  from: [number, number];
  legalTargets: [number, number][];
}

/** 对手信息 */
interface OpponentInfo {
  name: string;
  color: PieceColor;
}

/** 联网对战 Store 接口 */
interface MultiplayerState {
  connectionStatus: ConnectionStatus;
  roomCode: string | null;
  color: PieceColor | null;
  opponent: OpponentInfo | null;
  inGame: boolean;
  peerId: string | null;

  board: Board;
  turn: Turn;
  status: GameStatus;
  history: MoveHistoryEntry[];
  moves: Move[];
  lastMove: { from: [number, number]; to: [number, number] } | null;

  selection: Selection | null;
  chatMessages: ChatMessage[];
  notification: string | null;

  createRoom: () => void;
  joinRoom: (roomCode: string) => void;
  sendMove: (from: [number, number], to: [number, number]) => void;
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

// ===== 辅助函数 =====

/** 判断棋子是否属于指定颜色 */
function isOwnPiece(piece: string, color: PieceColor): boolean {
  if (!piece) return false;
  const isWhitePiece = piece === piece.toUpperCase();
  return (color === 'w' && isWhitePiece) || (color === 'b' && !isWhitePiece);
}

/** 生成 6 位房间号 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** 获取初始棋盘状态 */
function getInitialBoardState() {
  return {
    board: cloneBoard(INITIAL_BOARD),
    turn: 'w' as Turn,
    status: 'playing' as GameStatus,
    history: [] as MoveHistoryEntry[],
    moves: [] as Move[],
    lastMove: null as { from: [number, number]; to: [number, number] } | null,
    selection: null as Selection | null,
  };
}

// ===== Store 创建 =====

export const useMultiplayerStore = create<MultiplayerState>((set, get) => {
  /** 在当前棋盘上应用一步走法 */
  function applyMoveToState(from: [number, number], to: [number, number]) {
    const state = get();
    const piece = state.board[from[0]][from[1]];
    const notation = moveToNotation(state.board, from, to);
    const newBoard = applyMove(state.board, from, to);
    const move: Move = { from, to, piece, captured: state.board[to[0]][to[1]] || undefined, notation };
    const newMoves = [...state.moves, move];
    const newTurn: Turn = state.turn === 'w' ? 'b' : 'w';
    const newStatus = getGameStatus(newBoard, newTurn);

    const moveNum = Math.ceil(newMoves.length / 2);
    const newHistory = [...state.history];
    if (state.turn === 'w') {
      newHistory.push({ moveNumber: moveNum, white: notation, black: '' });
    } else {
      if (newHistory.length > 0) {
        newHistory[newHistory.length - 1].black = notation;
      }
    }

    set({ board: newBoard, turn: newTurn, status: newStatus, moves: newMoves, history: newHistory, lastMove: { from, to }, selection: null });
  }

  /** 添加聊天消息 */
  function addChatMessage(from: PieceColor | 'system', message: string) {
    set((state) => ({ chatMessages: [...state.chatMessages, { from, message, timestamp: Date.now() }] }));
  }

  /** 发送消息给对手 */
  function sendMessage(data: Record<string, unknown>) {
    if (conn && conn.open) {
      conn.send(data);
    }
  }

  /** 处理对手发来的消息 */
  function handleMessage(data: any) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'HELLO': {
        const senderColor = data.color as PieceColor;
        set({ opponent: { name: data.name || '对手', color: senderColor } });
        addChatMessage('system', `对手 ${data.name || '对手'} 已加入，对局开始！`);
        break;
      }

      case 'MOVE': {
        const from = data.from as [number, number];
        const to = data.to as [number, number];
        applyMoveToState(from, to);
        break;
      }

      case 'GAME_RESET': {
        set({ ...getInitialBoardState(), notification: '对手发起了重开，游戏已重置' });
        addChatMessage('system', '游戏已重置');
        break;
      }

      case 'CHAT': {
        const opponentColor = get().opponent?.color;
        if (opponentColor) {
          addChatMessage(opponentColor, data.message);
        }
        break;
      }

      case 'VOICE': {
        const opponentColor = get().opponent?.color;
        if (opponentColor) {
          set((state) => ({
            chatMessages: [...state.chatMessages, {
              from: opponentColor,
              message: '语音消息',
              timestamp: Date.now(),
              isVoice: true,
              audioData: data.audioData,
              duration: data.duration,
            }],
          }));
        }
        break;
      }

      default:
        break;
    }
  }

  /** 初始化 Peer 实例 */
  function initPeer(peerId: string, roomCode: string, isHost: boolean): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (peer) {
        peer.destroy();
        peer = null;
      }

      set({ connectionStatus: 'connecting' });

      try {
        const Peer = await loadPeerJS();

        peer = new Peer(peerId, {
          host: '0.peerjs.com',
          port: 443,
          path: '/',
          secure: true,
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'turn:eu-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
              { urls: 'turn:eu-0.turn.peerjs.com:3478?transport=tcp', username: 'peerjs', credential: 'peerjsp' },
              { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
              { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
              { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
            ],
          },
        });

        peer.on('open', (id: string) => {
          set({ peerId: id, roomCode, connectionStatus: 'connected' });
          resolve();
        });

        peer.on('error', (err: any) => {
          console.warn('[multiplayer] Peer error:', err);
          if (err.type === 'unavailable-id' && isHost) {
            const newCode = generateRoomCode();
            peer.destroy();
            peer = null;
            initPeer(newCode, newCode, true).then(resolve).catch(reject);
          } else if (err.type === 'peer-unavailable') {
            set({ notification: '房间不存在或对方已离开，请确认房间号是否正确', connectionStatus: 'disconnected' });
            reject(err);
          } else if (err.type === 'negotiation-failed' || err.type === 'ice-connection-failed') {
            set({
              notification: 'WebRTC连接失败，可能是网络环境（对称NAT/防火墙）阻止了P2P连接，请尝试更换网络',
              connectionStatus: 'disconnected',
            });
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
          handleDisconnect();
        });

        peer.on('disconnected', () => {
          handleDisconnect();
        });

        if (isHost) {
          peer.on('connection', (connection: any) => {
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

    const onConnOpen = () => {
      const state = get();
      const myColor = state.color;
      if (!myColor) return;

      const opponentColor: PieceColor = myColor === 'w' ? 'b' : 'w';

      set({
        inGame: true,
        opponent: { name: '对手', color: opponentColor },
        ...getInitialBoardState(),
        chatMessages: [],
        notification: '对手已连接，对局开始！',
      });
      addChatMessage('system', '对手已连接，对局开始！');

      sendMessage({ type: 'HELLO', name: myColor === 'w' ? '房主' : '玩家', color: myColor });
    };

    if (conn.open) {
      onConnOpen();
    } else {
      conn.on('open', onConnOpen);
    }

    conn.on('data', (data: any) => {
      handleMessage(data);
    });

    conn.on('close', () => {
      handleOpponentLeft();
    });

    conn.on('error', () => {
      handleOpponentLeft();
    });
  }

  /** 对手离开 */
  function handleOpponentLeft() {
    set({ opponent: null, notification: '对手已断开连接' });
    addChatMessage('system', '对手已断开连接');
  }

  /** 断开连接处理 */
  function handleDisconnect() {
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
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

    /** 创建房间（房主） */
    createRoom: () => {
      const roomCode = generateRoomCode();

      initPeer(roomCode, roomCode, true)
        .then(() => {
          set({
            color: 'w',
            inGame: true,
            ...getInitialBoardState(),
            chatMessages: [],
            notification: `房间已创建，房间号：${roomCode}，等待对手加入...`,
          });
        })
        .catch(() => {});
    },

    /** 加入房间 */
    joinRoom: (roomCode) => {
      const code = roomCode.trim().toUpperCase();
      if (!code || code.length !== 6) {
        set({ notification: '请输入6位房间号' });
        return;
      }

      const myPeerId = 'ck_' + Math.random().toString(36).substring(2, 10);

      initPeer(myPeerId, code, false)
        .then(() => {
          set({ color: 'b' });

          const connection = peer.connect(code, { reliable: true });

          if (connectTimeout) clearTimeout(connectTimeout);
          connectTimeout = setTimeout(() => {
            if (!conn || !conn.open) {
              set({
                notification: '连接超时，请确认：1）房间号是否正确 2）对方是否在线 3）网络是否允许WebRTC连接',
                connectionStatus: 'disconnected',
              });
            }
          }, 20000);

          connection.on('open', () => {
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
            if (connectTimeout) {
              clearTimeout(connectTimeout);
              connectTimeout = null;
            }
            set({
              notification: '加入房间失败：' + (err.message || '未知错误'),
              connectionStatus: 'disconnected',
            });
          });
        })
        .catch(() => {});
    },

    /** 离开房间 */
    leaveRoom: () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }
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

    sendMove: (from, to) => {
      const state = get();
      if (!state.color) return;
      if (state.turn !== state.color) return;
      if (
        state.status === 'checkmate' ||
        state.status === 'stalemate' ||
        state.status === 'draw'
      ) return;
      if (!isMoveLegal(state.board, from, to, state.color === 'w')) return;

      applyMoveToState(from, to);
      sendMessage({ type: 'MOVE', from, to, by: state.color });
    },

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
          get().sendMove(state.selection.from, [row, col]);
          return;
        }
      }

      if (piece && isOwnPiece(piece, state.color)) {
        const allLegal = getAllLegalMoves(state.board, state.color === 'w');
        const legalTargets = allLegal
          .filter((m) => m.from[0] === row && m.from[1] === col)
          .map((m) => m.to as [number, number]);
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
      sendMessage({ type: 'VOICE', audioData, duration });
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
