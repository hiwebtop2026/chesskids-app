/**
 * ChessKids - AI 对手引擎
 * 对应PRD 6.4 模块：5个难度等级的AI对手
 *
 * 难度设计：
 * Level 1: 随机走法（几乎不构成威胁）
 * Level 2: 偏好吃子（随机选择吃子走法）
 * Level 3: 最优吃子 + 简单子力评估（1层搜索）
 * Level 4: 2层搜索 + 位置评估表
 * Level 5: 3层搜索 + 完整评估函数
 */

import type { Board, LegalMove, Difficulty } from '@/types/chess';
import { PIECE_VALUES } from '@/types/chess';
import { isWhite, isEmpty } from './board';
import { getAllLegalMoves, isInCheck } from './validation';
import { cloneBoard } from './board';

/** 位置评估表（中心格奖励） */
const POSITION_BONUS = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  [0.1, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.1],
  [0.2, 0.3, 0.4, 0.5, 0.5, 0.4, 0.3, 0.2],
  [0.2, 0.3, 0.4, 0.5, 0.5, 0.4, 0.3, 0.2],
  [0.1, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.1],
  [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

/** 局面评估函数（正值=白方优势，负值=黑方优势） */
export function evaluate(board: Board): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!isEmpty(piece)) {
        const val = PIECE_VALUES[piece.toLowerCase()] ?? 0;
        const posBonus = POSITION_BONUS[r][c];
        score += isWhite(piece) ? val + posBonus : -(val + posBonus);
      }
    }
  }
  return score;
}

/** 带将军检测的局面评估（被将军时大幅扣分） */
function evaluateWithCheck(board: Board, currentPlayerIsWhite: boolean): number {
  const score = evaluate(board);
  if (isInCheck(board, currentPlayerIsWhite)) {
    // 当前走棋方被将军，大幅扣分（表示该走法糟糕）
    return currentPlayerIsWhite ? score - 500 : score + 500;
  }
  return score;
}

/** Level 1: 随机走法 */
function randomMove(legal: LegalMove[]): LegalMove {
  return legal[Math.floor(Math.random() * legal.length)];
}

/** Level 2: 偏好吃子 */
function captureMove(legal: LegalMove[]): LegalMove {
  const captures = legal.filter((m) => m.captures);
  if (captures.length > 0) {
    return captures[Math.floor(Math.random() * captures.length)];
  }
  return randomMove(legal);
}

/** Level 3: 最优吃子（按价值排序） */
function bestCapture(legal: LegalMove[], board: Board): LegalMove {
  const captures = legal
    .filter((m) => m.captures)
    .sort((a, b) => {
      const va = PIECE_VALUES[board[b.to[0]][b.to[1]].toLowerCase()] ?? 0;
      const vb = PIECE_VALUES[board[a.to[0]][a.to[1]].toLowerCase()] ?? 0;
      return va - vb; // 优先吃高价值棋子
    });
  if (captures.length > 0) return captures[0];
  return randomMove(legal);
}

/** Level 4-5: Minimax 搜索 */
function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean
): number {
  if (depth === 0) return evaluateWithCheck(board, maximizing);

  const white = maximizing;
  const legal = getAllLegalMoves(board, white);

  if (legal.length === 0) {
    // 将死或逼和
    return maximizing ? -1000 : 1000;
  }

  if (maximizing) {
    let maxEval = -Infinity;
    for (const m of legal) {
      const nb = cloneBoard(board);
      nb[m.to[0]][m.to[1]] = nb[m.from[0]][m.from[1]];
      nb[m.from[0]][m.from[1]] = '';
      const ev = minimax(nb, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break; // Alpha-Beta 剪枝
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of legal) {
      const nb = cloneBoard(board);
      nb[m.to[0]][m.to[1]] = nb[m.from[0]][m.from[1]];
      nb[m.from[0]][m.from[1]] = '';
      const ev = minimax(nb, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

/** Level 4+: 评估每个走法并选择最优 */
function bestMove(legal: LegalMove[], board: Board, depth: number, aiIsWhite: boolean): LegalMove {
  let best = legal[0];
  let bestScore = aiIsWhite ? -Infinity : Infinity;

  for (const m of legal) {
    const nb = cloneBoard(board);
    nb[m.to[0]][m.to[1]] = nb[m.from[0]][m.from[1]];
    nb[m.from[0]][m.from[1]] = '';
    const score = minimax(nb, depth - 1, -Infinity, Infinity, !aiIsWhite);
    if (aiIsWhite) {
      if (score > bestScore || (score === bestScore && Math.random() < 0.3)) {
        bestScore = score;
        best = m;
      }
    } else {
      if (score < bestScore || (score === bestScore && Math.random() < 0.3)) {
        bestScore = score;
        best = m;
      }
    }
  }

  return best;
}

/** 获取能解除将军的走法（用于低难度AI防御） */
function getCheckEscapingMoves(board: Board, legal: LegalMove[], aiIsWhite: boolean): LegalMove[] {
  return legal.filter((m) => {
    const nb = cloneBoard(board);
    nb[m.to[0]][m.to[1]] = nb[m.from[0]][m.from[1]];
    nb[m.from[0]][m.from[1]] = '';
    return !isInCheck(nb, aiIsWhite);
  });
}

/** AI 选择走法主入口 */
export function aiMove(board: Board, difficulty: Difficulty, aiIsWhite = false): LegalMove | null {
  let legal = getAllLegalMoves(board, aiIsWhite);
  if (legal.length === 0) return null;

  // 低难度AI（Level 1-3）被将军时，优先选择能解除将军的走法
  if (difficulty <= 3 && isInCheck(board, aiIsWhite)) {
    const escapeMoves = getCheckEscapingMoves(board, legal, aiIsWhite);
    if (escapeMoves.length > 0) {
      legal = escapeMoves;
    }
  }

  switch (difficulty) {
    case 1:
      return randomMove(legal);
    case 2:
      return captureMove(legal);
    case 3:
      return bestCapture(legal, board);
    case 4:
      return bestMove(legal, board, 2, aiIsWhite);
    case 5:
      return bestMove(legal, board, 3, aiIsWhite);
    default:
      return randomMove(legal);
  }
}

/** 为用户生成走法提示（Level 4算法） */
export function getHint(board: Board, playerIsWhite = true): LegalMove | null {
  const legal = getAllLegalMoves(board, playerIsWhite);
  if (legal.length === 0) return null;

  let best = legal[0];
  let bestScore = playerIsWhite ? -Infinity : Infinity;

  for (const m of legal) {
    const nb = cloneBoard(board);
    nb[m.to[0]][m.to[1]] = nb[m.from[0]][m.from[1]];
    nb[m.from[0]][m.from[1]] = '';
    const score = minimax(nb, 1, -Infinity, Infinity, !playerIsWhite);
    if (playerIsWhite) {
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
  }

  return best;
}
