/**
 * ChessKids - 中国象棋类型定义
 * 棋盘：9列 x 10行
 * 黑方（小写）在上（row 0-4），红方（大写）在下（row 5-9）
 * 楚河汉界在 row 4 和 row 5 之间
 */

/** 棋子类型 - 红方大写，黑方小写 */
export type XiangqiPieceType =
  | 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P'  // 红方：帅仕相马车炮兵
  | 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p'; // 黑方：将士象马车炮卒

/** 棋子颜色 */
export type XiangqiColor = 'r' | 'b'; // r=红方，b=黑方

/** 棋盘格子：空字符串或棋子 */
export type XiangqiPiece = string;

/** 9x10 棋盘
 * row 0 = 黑方底线（将在 row 0）
 * row 4 = 黑方河岸
 * row 5 = 红方河岸
 * row 9 = 红方底线（帅在 row 9）
 * col 0 = 最左列（红方视角的九路）
 * col 8 = 最右列（红方视角的一路）
 */
export type XiangqiBoard = XiangqiPiece[][];

/** 坐标 [row, col] */
export type XiangqiSquare = [number, number];

/** 走法 */
export interface XiangqiMove {
  from: XiangqiSquare;
  to: XiangqiSquare;
  piece: XiangqiPiece;
  captured?: XiangqiPiece;
  notation?: string;
}

/** 合法走法 */
export interface XiangqiLegalMove {
  from: XiangqiSquare;
  to: XiangqiSquare;
  piece: XiangqiPiece;
  captures: boolean;
}

/** 游戏状态 */
export type XiangqiGameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

/** 当前回合 */
export type XiangqiTurn = XiangqiColor;

/** 判断游戏是否结束 */
export const isXiangqiGameOver = (status: XiangqiGameStatus): boolean =>
  status === 'checkmate' || status === 'stalemate' || status === 'draw';

/** 棋子中文名 */
export const XIANGQI_PIECE_NAMES: Record<string, string> = {
  K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
  k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒',
};

/** 棋子 Unicode 符号（使用中文方块字风格） */
export const XIANGQI_PIECE_CHARS: Record<string, string> = {
  K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵',
  k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒',
};

/** 棋子价值 */
export const XIANGQI_PIECE_VALUES: Record<string, number> = {
  k: 1000, r: 9, c: 4.5, n: 4, b: 2, a: 2, p: 1,
  K: 1000, R: 9, C: 4.5, N: 4, B: 2, A: 2, P: 1,
};

/** 走棋记录条目 */
export interface XiangqiMoveHistoryEntry {
  moveNumber: number;
  red: string;
  black: string;
}
