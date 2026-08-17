/**
 * ChessKids - 棋盘初始化与工具函数
 * 对应PRD 6.1/6.4 模块的棋盘渲染基础
 */

import type { Board, Piece } from '@/types/chess';

/** 标准开局棋盘 */
export const INITIAL_BOARD: Board = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

/** 创建空棋盘 */
export function createEmptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill('') as Piece[]);
}

/** 深拷贝棋盘 */
export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

/** 判断棋子是否为白方 */
export function isWhite(piece: Piece): boolean {
  return !!piece && piece === piece.toUpperCase() && piece !== '';
}

/** 判断棋子是否为黑方 */
export function isBlack(piece: Piece): boolean {
  return !!piece && piece === piece.toLowerCase() && piece !== '';
}

/** 判断格子是否为空 */
export function isEmpty(piece: Piece): boolean {
  return !piece || piece === '';
}

/** 判断两个棋子是否同色 */
export function sameColor(p1: Piece, p2: Piece): boolean {
  if (isEmpty(p1) || isEmpty(p2)) return false;
  return (isWhite(p1) && isWhite(p2)) || (isBlack(p1) && isBlack(p2));
}

/** 坐标是否在棋盘范围内 */
export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

/** 将坐标转为棋盘表示法 (如 e4) */
export function squareName(r: number, c: number): string {
  return 'abcdefgh'[c] + (8 - r);
}

/** 将棋盘表示法转为坐标 (如 e4 -> [4, 4]) */
export function parseSquare(name: string): [number, number] {
  const c = name.charCodeAt(0) - 97;
  const r = 8 - parseInt(name[1]);
  return [r, c];
}

/** 获取棋子类型（大写） */
export function pieceType(piece: Piece): string {
  return piece.toUpperCase();
}

/** 获取棋子颜色 */
export function pieceColor(piece: Piece): 'w' | 'b' | null {
  if (isEmpty(piece)) return null;
  return isWhite(piece) ? 'w' : 'b';
}

/** 在棋盘上应用走法，返回新棋盘 */
export function applyMove(board: Board, from: [number, number], to: [number, number]): Board {
  const nb = cloneBoard(board);
  nb[to[0]][to[1]] = nb[from[0]][from[1]];
  nb[from[0]][from[1]] = '';
  // 兵的升变（自动升变为后）
  const p = nb[to[0]][to[1]];
  if (p === 'P' && to[0] === 0) nb[to[0]][to[1]] = 'Q';
  if (p === 'p' && to[0] === 7) nb[to[0]][to[1]] = 'q';
  return nb;
}
