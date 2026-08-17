/**
 * ChessKids - 核心类型定义
 * 对应PRD功能需求详情中的棋盘、棋子、走法等数据结构
 */

/** 棋子类型 */
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

/** 棋子颜色 */
export type PieceColor = 'w' | 'b';

/** 棋盘上的棋子（大写=白方，小写=黑方，空字符串=空格） */
export type Piece = string;

/** 8x8 棋盘 */
export type Board = Piece[][];

/** 坐标 [row, col]，row 0=第8行(黑方)，row 7=第1行(白方) */
export type Square = [number, number];

/** 走法 */
export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece;
  promotion?: PieceType;
  notation?: string;
}

/** 合法走法（含评估信息） */
export interface LegalMove {
  from: Square;
  to: Square;
  piece: Piece;
  captures: boolean;
}

/** 游戏状态 */
export type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

/** 当前回合颜色 */
export type Turn = PieceColor;

/** AI 难度等级 1-5 */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** 棋子 Unicode 符号映射 */
export const PIECE_SYMBOLS: Record<string, string> = {
  K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
};

/** 棋子价值分值 */
export const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

/** 走棋记录条目 */
export interface MoveHistoryEntry {
  moveNumber: number;
  white: string;
  black: string;
}
