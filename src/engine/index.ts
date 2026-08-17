/**
 * ChessKids - 引擎汇总导出
 */

// 棋盘工具
export {
  INITIAL_BOARD,
  createEmptyBoard,
  cloneBoard,
  isWhite,
  isBlack,
  isEmpty,
  sameColor,
  inBounds,
  squareName,
  parseSquare,
  pieceType,
  pieceColor,
  applyMove,
} from './board';

// 走法生成
export { getMoves } from './moves';

// 验证与检测
export {
  findKing,
  isInCheck,
  getAllLegalMoves,
  isCheckmate,
  isStalemate,
  getGameStatus,
  isMoveLegal,
} from './validation';

// AI 引擎
export { evaluate, aiMove, getHint } from './ai';

// 棋谱记法
export { moveToNotation } from './notation';
