/**
 * ChessKids - 走法生成
 * 对应PRD 6.1 模块：每种棋子的合法走法计算
 */

import type { Board, Square } from '@/types/chess';
import { isWhite, isEmpty, sameColor, inBounds } from './board';

/** 获取指定位置棋子的所有走法（不考虑将军限制） */
export function getMoves(board: Board, r: number, c: number): Square[] {
  const piece = board[r][c];
  if (isEmpty(piece)) return [];
  const type = piece.toUpperCase();
  switch (type) {
    case 'P': return pawnMoves(board, r, c);
    case 'N': return knightMoves(board, r, c);
    case 'B': return slideMoves(board, r, c, [[-1,-1],[-1,1],[1,-1],[1,1]]);
    case 'R': return slideMoves(board, r, c, [[-1,0],[1,0],[0,-1],[0,1]]);
    case 'Q': return slideMoves(board, r, c, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    case 'K': return kingMoves(board, r, c);
    default: return [];
  }
}

/** 兵的走法 */
function pawnMoves(board: Board, r: number, c: number): Square[] {
  const piece = board[r][c];
  const white = isWhite(piece);
  const dir = white ? -1 : 1;
  const startRow = white ? 6 : 1;
  const moves: Square[] = [];

  // 前进一格
  if (inBounds(r + dir, c) && isEmpty(board[r + dir][c])) {
    moves.push([r + dir, c]);
    // 起始位置可前进两格
    if (r === startRow && isEmpty(board[r + 2 * dir][c])) {
      moves.push([r + 2 * dir, c]);
    }
  }

  // 斜向吃子
  for (const dc of [-1, 1]) {
    const nr = r + dir;
    const nc = c + dc;
    if (inBounds(nr, nc) && !isEmpty(board[nr][nc]) && !sameColor(piece, board[nr][nc])) {
      moves.push([nr, nc]);
    }
  }

  return moves;
}

/** 马的走法（日字形，可跨越棋子） */
function knightMoves(board: Board, r: number, c: number): Square[] {
  const piece = board[r][c];
  const offsets = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]];
  const moves: Square[] = [];
  for (const [dr, dc] of offsets) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc) && (isEmpty(board[nr][nc]) || !sameColor(piece, board[nr][nc]))) {
      moves.push([nr, nc]);
    }
  }
  return moves;
}

/** 滑行棋子（象、车、后）的走法 */
function slideMoves(board: Board, r: number, c: number, dirs: number[][]): Square[] {
  const piece = board[r][c];
  const moves: Square[] = [];
  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      if (isEmpty(board[nr][nc])) {
        moves.push([nr, nc]);
      } else {
        if (!sameColor(piece, board[nr][nc])) moves.push([nr, nc]);
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return moves;
}

/** 王的走法（每次一格，任意方向） */
function kingMoves(board: Board, r: number, c: number): Square[] {
  const piece = board[r][c];
  const moves: Square[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && (isEmpty(board[nr][nc]) || !sameColor(piece, board[nr][nc]))) {
        moves.push([nr, nc]);
      }
    }
  }
  return moves;
}
