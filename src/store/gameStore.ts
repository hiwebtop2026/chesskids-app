/**
 * ChessKids - 对局状态管理
 * 管理人机对局中的棋盘、走法、AI等状态
 */

import { create } from 'zustand';
import type { Board, Turn, GameStatus, Difficulty, Move, MoveHistoryEntry } from '../types/chess';
import {
  INITIAL_BOARD,
  cloneBoard,
  applyMove,
  getAllLegalMoves,
  getGameStatus,
  isMoveLegal,
  aiMove,
  getHint,
  moveToNotation,
} from '../engine';

/** 选中状态 */
interface Selection {
  from: [number, number];
  legalTargets: [number, number][];
}

/** 对局Store */
interface GameState {
  // 棋盘状态
  board: Board;
  turn: Turn;
  status: GameStatus;
  difficulty: Difficulty;

  // 走法历史
  history: MoveHistoryEntry[];
  moves: Move[];
  lastMove: { from: [number, number]; to: [number, number] } | null;

  // 交互状态
  selection: Selection | null;
  legalMoves: { from: [number, number]; to: [number, number]; piece: string }[];
  hint: { from: [number, number]; to: [number, number] } | null;
  isAIThinking: boolean;

  // 操作方法
  selectSquare: (row: number, col: number) => void;
  makeMove: (from: [number, number], to: [number, number]) => void;
  requestHint: () => void;
  undoMove: () => void;
  resetGame: () => void;
  setDifficulty: (d: Difficulty) => void;
  clearSelection: () => void;
  clearHint: () => void;
}

/** 初始游戏状态 */
function getInitialState() {
  const board = cloneBoard(INITIAL_BOARD);
  return {
    board,
    turn: 'w' as Turn,
    status: 'playing' as GameStatus,
    difficulty: 1 as Difficulty,
    history: [] as MoveHistoryEntry[],
    moves: [] as Move[],
    lastMove: null,
    selection: null,
    legalMoves: [],
    hint: null,
    isAIThinking: false,
  };
}

export const useGameStore = create<GameState>((set, get) => ({
  ...getInitialState(),

  /** 选中一个格子，显示合法走法 */
  selectSquare: (row, col) => {
    const state = get();
    const piece = state.board[row][col];

    // 如果已有选中棋子，且点击的是合法目标，则走棋
    if (state.selection) {
      const isTarget = state.selection.legalTargets.some(
        ([r, c]) => r === row && c === col
      );
      if (isTarget) {
        get().makeMove(state.selection.from, [row, col]);
        return;
      }
    }

    // 如果点击的是自己的棋子，选中它
    if (piece && isWhitePiece(piece, state.turn)) {
      const allLegal = getAllLegalMoves(state.board, state.turn === 'w');
      const legalTargets = allLegal
        .filter((m) => m.from[0] === row && m.from[1] === col)
        .map((m) => m.to as [number, number]);

      set({ selection: { from: [row, col], legalTargets }, hint: null });
    } else {
      // 点击空格或对方棋子，取消选中
      set({ selection: null });
    }
  },

  /** 执行走棋 */
  makeMove: (from, to) => {
    const state = get();
    const piece = state.board[from[0]][from[1]];

    // 验证走法合法性
    if (!isMoveLegal(state.board, from, to, state.turn === 'w')) {
      return;
    }

    // 执行走法
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

    // 更新走棋历史记录
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
      hint: null,
    });

    // 如果轮到AI（黑方）且游戏未结束，触发AI走棋（包括被将军时）
    if ((newStatus === 'playing' || newStatus === 'check') && newTurn === 'b') {
      set({ isAIThinking: true });
      // 使用setTimeout避免阻塞UI
      setTimeout(() => {
        const currentBoard = get().board;
        const aiResult = aiMove(currentBoard, get().difficulty);

        if (aiResult) {
          const aiPiece = currentBoard[aiResult.from[0]][aiResult.from[1]];
          const aiNotation = moveToNotation(
            currentBoard,
            aiResult.from,
            aiResult.to
          );
          const aiBoard = applyMove(currentBoard, aiResult.from, aiResult.to);
          const aiTurn: Turn = 'w';
          const aiStatus = getGameStatus(aiBoard, aiTurn);

          const aiMoves = [...get().moves, {
            from: aiResult.from,
            to: aiResult.to,
            piece: aiPiece,
            captured: currentBoard[aiResult.to[0]][aiResult.to[1]] || undefined,
            notation: aiNotation,
          }];

          const aiHistory = [...get().history];
          if (aiHistory.length > 0) {
            aiHistory[aiHistory.length - 1].black = aiNotation;
          }

          set({
            board: aiBoard,
            turn: aiTurn,
            status: aiStatus,
            moves: aiMoves,
            history: aiHistory,
            lastMove: { from: aiResult.from, to: aiResult.to },
            isAIThinking: false,
          });
        } else {
          set({ isAIThinking: false });
        }
      }, 300);
    }
  },

  /** 请求提示 */
  requestHint: () => {
    const state = get();
    if (state.turn !== 'w' || state.status !== 'playing') return;

    const hint = getHint(state.board);
    if (hint) {
      set({ hint: { from: hint.from, to: hint.to } });
    }
  },

  /** 悔棋（撤销上一步玩家和AI的走法） */
  undoMove: () => {
    const state = get();
    if (state.moves.length < 2) return;

    // 撤销最后两步（AI的一步和玩家的一步）
    const undoCount = state.moves.length >= 2 ? 2 : 1;
    const movesToKeep = state.moves.slice(0, -undoCount);

    // 重新从初始棋盘开始回放
    let board = cloneBoard(INITIAL_BOARD);
    for (const move of movesToKeep) {
      board = applyMove(board, move.from, move.to);
    }

    const newTurn: Turn = movesToKeep.length % 2 === 0 ? 'w' : 'b';
    const newStatus = getGameStatus(board, newTurn);
    const newHistory = state.history.slice(0, Math.floor(movesToKeep.length / 2));

    set({
      board,
      turn: newTurn,
      status: newStatus,
      moves: movesToKeep,
      history: newHistory,
      lastMove: movesToKeep.length > 0
        ? { from: movesToKeep[movesToKeep.length - 1].from, to: movesToKeep[movesToKeep.length - 1].to }
        : null,
      selection: null,
      hint: null,
      isAIThinking: false,
    });
  },

  /** 重置游戏（保留当前难度设置） */
  resetGame: () => {
    const currentDifficulty = get().difficulty;
    set({ ...getInitialState(), difficulty: currentDifficulty });
  },

  /** 设置难度 */
  setDifficulty: (d) => {
    set({ difficulty: d });
  },

  /** 清除选中 */
  clearSelection: () => {
    set({ selection: null });
  },

  /** 清除提示 */
  clearHint: () => {
    set({ hint: null });
  },
}));

/** 判断棋子是否属于当前回合方 */
function isWhitePiece(piece: string, turn: Turn): boolean {
  if (!piece) return false;
  const isWhite = piece === piece.toUpperCase();
  return (turn === 'w' && isWhite) || (turn === 'b' && !isWhite);
}
