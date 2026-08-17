/**
 * ChessKids - 走法验证与将军/将死检测
 * 对应PRD 6.2 模块：基本规则的判定逻辑
 */

import type { Board, Square, LegalMove } from '@/types/chess';
import { isWhite, isEmpty } from './board';
import { getMoves } from './moves';
import { cloneBoard } from './board';

/** 查找指定颜色方的王 */
export function findKing(board: Board, white: boolean): Square | null {
  const king = white ? 'K' : 'k';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === king) return [r, c];
    }
  }
  return null;
}

/** 判断指定方是否被将军 */
export function isInCheck(board: Board, white: boolean): boolean {
  const kp = findKing(board, white);
  if (!kp) return false;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!isEmpty(piece) && isWhite(piece) !== white) {
        const moves = getMoves(board, r, c);
        for (const [mr, mc] of moves) {
          if (mr === kp[0] && mc === kp[1]) return true;
        }
      }
    }
  }
  return false;
}

/** 获取指定方所有合法走法（排除会让自己被将军的走法） */
export function getAllLegalMoves(board: Board, white: boolean): LegalMove[] {
  const all: LegalMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!isEmpty(piece) && isWhite(piece) === white) {
        const moves = getMoves(board, r, c);
        for (const [mr, mc] of moves) {
          // 模拟走法，检查是否自将
          const nb = cloneBoard(board);
          nb[mr][mc] = nb[r][c];
          nb[r][c] = '';
          if (!isInCheck(nb, white)) {
            all.push({
              from: [r, c],
              to: [mr, mc],
              piece,
              captures: !isEmpty(board[mr][mc]),
            });
          }
        }
      }
    }
  }
  return all;
}

/** 判断是否将死 */
export function isCheckmate(board: Board, white: boolean): boolean {
  return isInCheck(board, white) && getAllLegalMoves(board, white).length === 0;
}

/** 判断是否逼和（无棋可走但未被将军） */
export function isStalemate(board: Board, white: boolean): boolean {
  return !isInCheck(board, white) && getAllLegalMoves(board, white).length === 0;
}

/** 获取游戏状态 */
export function getGameStatus(board: Board, turn: 'w' | 'b'): 'playing' | 'check' | 'checkmate' | 'stalemate' {
  const white = turn === 'w';
  if (isCheckmate(board, white)) return 'checkmate';
  if (isStalemate(board, white)) return 'stalemate';
  if (isInCheck(board, white)) return 'check';
  return 'playing';
}

/** 验证单个走法是否合法（不会导致自将） */
export function isMoveLegal(board: Board, from: Square, to: Square, white: boolean): boolean {
  const nb = cloneBoard(board);
  nb[to[0]][to[1]] = nb[from[0]][from[1]];
  nb[from[0]][from[1]] = '';
  return !isInCheck(nb, white);
}
