/**
 * ChessKids - 双人对局状态管理
 * 两人同屏对局，无AI介入，支持棋盘自动翻转
 */

import { create } from 'zustand';
import type { Board, Turn, GameStatus, Move, MoveHistoryEntry } from '../types/chess';
import { isGameOver } from '../types/chess';
import {
  INITIAL_BOARD,
  cloneBoard,
  applyMove,
  getAllLegalMoves,
  getGameStatus,
  isMoveLegal,
  moveToNotation,
} from '../engine';

interface Selection {
  from: [number, number];
  legalTargets: [number, number][];
}

interface LocalGameState {
  board: Board;
  turn: Turn;
  status: GameStatus;
  history: MoveHistoryEntry[];
  moves: Move[];
  lastMove: { from: [number, number]; to: [number, number] } | null;
  selection: Selection | null;
  autoFlip: boolean;
  flipped: boolean;

  selectSquare: (row: number, col: number) => void;
  makeMove: (from: [number, number], to: [number, number]) => void;
  undoMove: () => void;
  resetGame: () => void;
  toggleAutoFlip: () => void;
  toggleFlip: () => void;
  clearSelection: () => void;
}

function getInitialState() {
  const board = cloneBoard(INITIAL_BOARD);
  return {
    board,
    turn: 'w' as Turn,
    status: 'playing' as GameStatus,
    history: [] as MoveHistoryEntry[],
    moves: [] as Move[],
    lastMove: null,
    selection: null,
    autoFlip: true,
    flipped: false,
  };
}

export const useLocalGameStore = create<LocalGameState>((set, get) => ({
  ...getInitialState(),

  selectSquare: (row, col) => {
    const state = get();
    if (isGameOver(state.status)) return;
    const piece = state.board[row][col];

    if (state.selection) {
      const isTarget = state.selection.legalTargets.some(
        ([r, c]) => r === row && c === col
      );
      if (isTarget) {
        get().makeMove(state.selection.from, [row, col]);
        return;
      }
    }

    if (piece && isOwnPiece(piece, state.turn)) {
      const allLegal = getAllLegalMoves(state.board, state.turn === 'w');
      const legalTargets = allLegal
        .filter((m) => m.from[0] === row && m.from[1] === col)
        .map((m) => m.to as [number, number]);

      set({ selection: { from: [row, col], legalTargets } });
    } else {
      set({ selection: null });
    }
  },

  makeMove: (from, to) => {
    const state = get();
    const piece = state.board[from[0]][from[1]];

    if (!isMoveLegal(state.board, from, to, state.turn === 'w')) {
      return;
    }

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

    const moveNum = Math.ceil(newMoves.length / 2);
    const newHistory = [...state.history];
    if (state.turn === 'w') {
      newHistory.push({ moveNumber: moveNum, white: notation, black: '' });
    } else {
      if (newHistory.length > 0) {
        newHistory[newHistory.length - 1].black = notation;
      }
    }

    const shouldFlip = state.autoFlip
      ? newTurn === 'b'
      : state.flipped;

    set({
      board: newBoard,
      turn: newTurn,
      status: newStatus,
      moves: newMoves,
      history: newHistory,
      lastMove: { from, to },
      selection: null,
      flipped: shouldFlip,
    });
  },

  undoMove: () => {
    const state = get();
    if (state.moves.length === 0) return;

    const movesToKeep = state.moves.slice(0, -1);
    let board = cloneBoard(INITIAL_BOARD);
    for (const move of movesToKeep) {
      board = applyMove(board, move.from, move.to);
    }

    const newTurn: Turn = movesToKeep.length % 2 === 0 ? 'w' : 'b';
    const newStatus = getGameStatus(board, newTurn);
    const newHistory = state.history.slice(0, Math.ceil(movesToKeep.length / 2));
    if (movesToKeep.length % 2 === 1 && newHistory.length > 0) {
      newHistory[newHistory.length - 1].black = '';
    }

    const shouldFlip = state.autoFlip
      ? newTurn === 'b'
      : state.flipped;

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
      flipped: shouldFlip,
    });
  },

  resetGame: () => {
    set({ ...getInitialState() });
  },

  toggleAutoFlip: () => {
    const state = get();
    const newAutoFlip = !state.autoFlip;
    set({
      autoFlip: newAutoFlip,
      flipped: newAutoFlip ? state.turn === 'b' : false,
    });
  },

  toggleFlip: () => {
    if (get().autoFlip) return;
    set({ flipped: !get().flipped });
  },

  clearSelection: () => {
    set({ selection: null });
  },
}));

function isOwnPiece(piece: string, turn: Turn): boolean {
  if (!piece) return false;
  const isWhite = piece === piece.toUpperCase();
  return (turn === 'w' && isWhite) || (turn === 'b' && !isWhite);
}
