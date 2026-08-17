/**
 * ChessKids - 联网对战状态管理
 * 基于 Zustand，管理 WebSocket 连接、房间、在线对局棋盘状态
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

/** 连接状态 */
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/** 聊天消息 */
interface ChatMessage {
  from: PieceColor | 'system';
  message: string;
  timestamp: number;
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
  // 连接状态
  connectionStatus: ConnectionStatus;

  // 房间信息
  roomCode: string | null;
  color: PieceColor | null;
  opponent: OpponentInfo | null;
  inGame: boolean;

  // 在线对局棋盘状态
  board: Board;
  turn: Turn;
  status: GameStatus;
  history: MoveHistoryEntry[];
  moves: Move[];
  lastMove: { from: [number, number]; to: [number, number] } | null;

  // 交互状态
  selection: Selection | null;

  // 聊天
  chatMessages: ChatMessage[];

  // 提示通知
  notification: string | null;

  // ===== 方法 =====
  connect: () => void;
  disconnect: () => void;
  createRoom: () => void;
  joinRoom: (roomCode: string) => void;
  sendMove: (from: [number, number], to: [number, number]) => void;
  leaveRoom: () => void;
  sendChat: (message: string) => void;
  selectSquare: (row: number, col: number) => void;
  requestReset: () => void;
  clearNotification: () => void;
  clearSelection: () => void;
}

// ===== 模块级变量（不进入 React 状态，避免不必要的重渲染）=====

/** WebSocket 实例 */
let ws: WebSocket | null = null;

/** 心跳定时器 */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** 上一次收到 pong 的时间戳 */
let lastPongTime = 0;

/** 心跳间隔（毫秒） */
const HEARTBEAT_INTERVAL = 25000;

/** 心跳超时（毫秒），超过该时间未收到 pong 则认为连接断开 */
const HEARTBEAT_TIMEOUT = 10000;

// ===== 辅助函数 =====

/** 判断棋子是否属于指定颜色 */
function isOwnPiece(piece: string, color: PieceColor): boolean {
  if (!piece) return false;
  const isWhitePiece = piece === piece.toUpperCase();
  return (color === 'w' && isWhitePiece) || (color === 'b' && !isWhitePiece);
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
  /**
   * 在当前棋盘上应用一步走法，更新棋盘/回合/状态/历史。
   * 供本地走棋和接收远程走棋共用。
   */
  function applyMoveToState(from: [number, number], to: [number, number]) {
    const state = get();
    const piece = state.board[from[0]][from[1]];

    const notation = moveToNotation(state.board, from, to);
    const newBoard = applyMove(state.board, from, to);

    const move: Move = {
      from,
      to,
      piece,
      captured: state.board[to[0]][to[1]] || undefined,
      notation,
    };

    const newMoves = [...state.moves, move];
    const newTurn: Turn = state.turn === 'w' ? 'b' : 'w';
    const newStatus = getGameStatus(newBoard, newTurn);

    // 更新走棋历史
    const moveNum = Math.ceil(newMoves.length / 2);
    const newHistory = [...state.history];
    if (state.turn === 'w') {
      newHistory.push({ moveNumber: moveNum, white: notation, black: '' });
    } else {
      if (newHistory.length > 0) {
        newHistory[newHistory.length - 1].black = notation;
      }
    }

    set({
      board: newBoard,
      turn: newTurn,
      status: newStatus,
      moves: newMoves,
      history: newHistory,
      lastMove: { from, to },
      selection: null,
    });
  }

  /** 添加一条聊天消息 */
  function addChatMessage(from: PieceColor | 'system', message: string) {
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { from, message, timestamp: Date.now() },
      ],
    }));
  }

  /** 处理服务器消息 */
  function handleMessage(data: string) {
    let msg: { type: string; [key: string]: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      // ===== 房间创建成功 =====
      case 'ROOM_CREATED': {
        set({
          roomCode: msg.roomCode as string,
          color: msg.color as PieceColor,
          inGame: true,
          ...getInitialBoardState(),
          chatMessages: [],
          notification: `房间已创建，房间号：${msg.roomCode as string}，等待对手加入...`,
        });
        break;
      }

      // ===== 加入房间成功 =====
      case 'JOIN_SUCCESS': {
        set({
          roomCode: msg.roomCode as string,
          color: msg.color as PieceColor,
          inGame: true,
          ...getInitialBoardState(),
          chatMessages: [],
          notification: `已加入房间 ${msg.roomCode as string}`,
        });
        break;
      }

      // ===== 加入房间失败 =====
      case 'JOIN_ERROR': {
        set({ notification: msg.message as string });
        break;
      }

      // ===== 对手加入 =====
      case 'OPPONENT_JOINED': {
        const opponent = msg.opponent as OpponentInfo;
        set({
          opponent,
          ...getInitialBoardState(),
          notification: `对手 ${opponent.name} 已加入，对局开始！`,
        });
        addChatMessage('system', `对手 ${opponent.name} 已加入，对局开始！`);
        break;
      }

      // ===== 走棋同步 =====
      case 'MOVE': {
        const from = msg.from as [number, number];
        const to = msg.to as [number, number];
        const by = msg.by as PieceColor;
        const state = get();

        // 如果是自己走的棋（回声），则忽略——本地已经更新过
        if (state.color && by === state.color) {
          break;
        }
        applyMoveToState(from, to);
        break;
      }

      // ===== 游戏重置 =====
      case 'GAME_RESET': {
        set({
          ...getInitialBoardState(),
          notification: '对手发起了重开，游戏已重置',
        });
        addChatMessage('system', '游戏已重置');
        break;
      }

      // ===== 对手离开 =====
      case 'OPPONENT_LEFT': {
        set({
          opponent: null,
          notification: '对手已离开房间',
        });
        addChatMessage('system', '对手已离开房间');
        break;
      }

      // ===== 聊天 =====
      case 'CHAT': {
        const from = msg.from as PieceColor;
        const message = msg.message as string;
        // 只接收对方的聊天消息（自己的消息在发送时已加入）
        const state = get();
        if (state.color && from !== state.color) {
          addChatMessage(from, message);
        }
        break;
      }

      // ===== 心跳响应 =====
      case 'PONG': {
        lastPongTime = Date.now();
        break;
      }

      // ===== 服务器错误 =====
      case 'ERROR': {
        set({ notification: msg.message as string });
        break;
      }

      default:
        break;
    }
  }

  /** 启动客户端心跳 */
  function startHeartbeat() {
    stopHeartbeat();
    lastPongTime = Date.now();
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      // 检查是否超时未收到 pong
      if (Date.now() - lastPongTime > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
        // 连接可能已断开，主动关闭
        console.warn('[multiplayer] 心跳超时，断开连接');
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ type: 'PING' }));
    }, HEARTBEAT_INTERVAL);
  }

  /** 停止心跳 */
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  return {
    // ===== 初始状态 =====
    connectionStatus: 'disconnected',
    roomCode: null,
    color: null,
    opponent: null,
    inGame: false,
    ...getInitialBoardState(),
    chatMessages: [],
    notification: null,

    // ===== 连接管理 =====

    /** 连接 WebSocket 服务器 */
    connect: () => {
      // 如果已经连接或正在连接，则不重复连接
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      set({ connectionStatus: 'connecting' });

      const url = `ws://${window.location.hostname}:3001`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        set({ connectionStatus: 'connected', notification: null });
        startHeartbeat();
      };

      ws.onclose = () => {
        set({
          connectionStatus: 'disconnected',
          inGame: false,
          roomCode: null,
          color: null,
          opponent: null,
          notification: '与服务器的连接已断开',
        });
        stopHeartbeat();
        ws = null;
      };

      ws.onerror = () => {
        set({
          connectionStatus: 'disconnected',
          notification: '连接服务器失败，请确认服务器已启动',
        });
      };

      ws.onmessage = (event: MessageEvent) => {
        handleMessage(typeof event.data === 'string' ? event.data : '');
      };
    },

    /** 断开 WebSocket 连接 */
    disconnect: () => {
      stopHeartbeat();
      if (ws) {
        ws.close();
        ws = null;
      }
      set({
        connectionStatus: 'disconnected',
        inGame: false,
        roomCode: null,
        color: null,
        opponent: null,
        ...getInitialBoardState(),
        chatMessages: [],
        notification: null,
      });
    },

    // ===== 房间管理 =====

    /** 创建房间 */
    createRoom: () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        set({ notification: '未连接服务器，请先连接' });
        return;
      }
      ws.send(JSON.stringify({ type: 'CREATE_ROOM' }));
    },

    /** 加入房间 */
    joinRoom: (roomCode: string) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        set({ notification: '未连接服务器，请先连接' });
        return;
      }
      const code = roomCode.trim().toUpperCase();
      if (!code) {
        set({ notification: '请输入房间号' });
        return;
      }
      ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode: code }));
    },

    /** 离开房间 */
    leaveRoom: () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
      }
      set({
        inGame: false,
        roomCode: null,
        color: null,
        opponent: null,
        ...getInitialBoardState(),
        chatMessages: [],
        notification: null,
      });
    },

    // ===== 走棋 =====

    /** 发送走棋并更新本地棋盘 */
    sendMove: (from, to) => {
      const state = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (!state.color) return;
      // 只有轮到自己时才能走棋
      if (state.turn !== state.color) return;
      // 游戏已结束
      if (
        state.status === 'checkmate' ||
        state.status === 'stalemate' ||
        state.status === 'draw'
      ) {
        return;
      }
      // 验证走法合法性
      if (!isMoveLegal(state.board, from, to, state.color === 'w')) return;

      // 本地应用走法
      applyMoveToState(from, to);

      // 发送给服务器（服务器会广播给对手）
      ws.send(JSON.stringify({ type: 'MAKE_MOVE', from, to }));
    },

    /** 选中棋盘格子（处理点击交互） */
    selectSquare: (row, col) => {
      const state = get();
      if (!state.color) return;
      // 只有轮到自己且游戏进行中才能操作
      if (state.turn !== state.color) return;
      if (
        state.status === 'checkmate' ||
        state.status === 'stalemate' ||
        state.status === 'draw'
      ) {
        return;
      }

      const piece = state.board[row][col];

      // 如果已有选中棋子，且点击的是合法目标，则走棋
      if (state.selection) {
        const isTarget = state.selection.legalTargets.some(
          ([r, c]) => r === row && c === col
        );
        if (isTarget) {
          get().sendMove(state.selection.from, [row, col]);
          return;
        }
      }

      // 如果点击的是自己的棋子，选中它
      if (piece && isOwnPiece(piece, state.color)) {
        const allLegal = getAllLegalMoves(state.board, state.color === 'w');
        const legalTargets = allLegal
          .filter((m) => m.from[0] === row && m.from[1] === col)
          .map((m) => m.to as [number, number]);

        set({ selection: { from: [row, col], legalTargets } });
      } else {
        // 点击空格或对方棋子，取消选中
        set({ selection: null });
      }
    },

    // ===== 重开游戏 =====

    /** 请求重开游戏 */
    requestReset: () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'RESET_GAME' }));
      set({
        ...getInitialBoardState(),
        notification: '已发起重开请求',
      });
      addChatMessage('system', '已重开游戏');
    },

    // ===== 聊天 =====

    /** 发送聊天消息 */
    sendChat: (message: string) => {
      const state = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (!state.color) return;
      const text = message.trim();
      if (!text) return;

      ws.send(
        JSON.stringify({ type: 'CHAT', message: text })
      );

      // 本地立即显示自己的消息
      addChatMessage(state.color, text);
    },

    // ===== 辅助方法 =====

    /** 清除通知 */
    clearNotification: () => {
      set({ notification: null });
    },

    /** 清除选中 */
    clearSelection: () => {
      set({ selection: null });
    },
  };
});
