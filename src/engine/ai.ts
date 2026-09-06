/**
 * ChessKids - AI 对手引擎（增强版）
 *
 * 算法：Negamax + Alpha-Beta 剪枝 + 迭代加深
 * 增强：Zobrist 置换表 + MVV-LVA 着法排序 + 历史启发 + 空着裁剪 + 位置价值表
 *
 * 难度等级 1-5：
 *   Level 1: 随机走法
 *   Level 2: 偏好吃子
 *   Level 3: 最优吃子 + 1层评估
 *   Level 4: 3层搜索 + 置换表 + 位置价值表
 *   Level 5: 5层搜索 + 全套增强算法
 */

import type { Board, LegalMove, Difficulty, Square } from '@/types/chess';
import { isWhite } from './board';
import { getAllLegalMoves, isInCheck } from './validation';

// ===== 常量 =====
const MATE = 100000;
const INF = 1e9;

// ===== 棋子位置价值表 (白方视角) =====
// 正值表示位置好，参考经典 PST 表简化版

const PAWN_PST = [
  [  0,  0,  0,  0,  0,  0,  0,  0], // row 0 黑方底线
  [ 50, 50, 50, 50, 50, 50, 50, 50], // row 1
  [ 10, 10, 20, 30, 30, 20, 10, 10], // row 2
  [  5,  5, 10, 25, 25, 10,  5,  5], // row 3
  [  0,  0,  0, 20, 20,  0,  0,  0], // row 4
  [  5, -5,-10,  0,  0,-10, -5,  5], // row 5
  [  5, 10, 10,-20,-20, 10, 10,  5], // row 6 初始兵位
  [  0,  0,  0,  0,  0,  0,  0,  0], // row 7 白方底线
];

const KNIGHT_PST = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50],
];

const BISHOP_PST = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20],
];

const ROOK_PST = [
  [  0,  0,  0,  0,  0,  0,  0,  0],
  [  5, 10, 10, 10, 10, 10, 10,  5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [  0,  0,  0,  5,  5,  0,  0,  0],
];

const QUEEN_PST = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [ -5,  0,  5,  5,  5,  5,  0, -5],
  [  0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  0,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20],
];

const KING_PST = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [ 20, 20,  0,  0,  0,  0, 20, 20],
  [ 20, 30, 10,  0,  0, 10, 30, 20],
];

// 棋子基础价值（乘 100，避免小数）
const PIECE_VAL: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
};

// ===== Zobrist 哈希 =====
const ZOBRIST: number[][] = [];

function mulberry32(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

(function initZobrist() {
  const rand = mulberry32(987654321);
  const pieceTypes = 12; // 6种 × 2色
  for (let i = 0; i < pieceTypes; i++) {
    ZOBRIST[i] = [];
    for (let j = 0; j < 64; j++) {
      ZOBRIST[i][j] = Math.floor(rand() * 0x7FFFFFFF);
    }
  }
  // 用最后一个作为走棋方
  (ZOBRIST as any).side = Math.floor(rand() * 0x7FFFFFFF);
})();

function pieceZIndex(p: string): number {
  if (!p) return -1;
  const t = p.toLowerCase();
  const map: Record<string, number> = { p:0, n:1, b:2, r:3, q:4, k:5 };
  const idx = map[t];
  if (idx === undefined) return -1;
  return isWhite(p) ? idx : idx + 6;
}

function computeHash(board: Board, whiteToMove: boolean): number {
  let h = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const pi = pieceZIndex(board[r][c]);
      if (pi >= 0) h ^= ZOBRIST[pi][r * 8 + c];
    }
  }
  if (!whiteToMove) h ^= (ZOBRIST as any).side;
  return h;
}

// ===== 置换表 =====
const TT_EXACT = 0;
const TT_ALPHA = 1;
const TT_BETA = 2;

interface TTEntry {
  hash: number;
  score: number;
  depth: number;
  flag: number;
  bestMove: LegalMove | null;
}

const TT_SIZE = 1 << 16; // 65536 条目
let transTable: TTEntry[] = new Array(TT_SIZE);

function ttStore(hash: number, score: number, depth: number, flag: number, bestMove: LegalMove | null) {
  const idx = hash & (TT_SIZE - 1);
  const existing = transTable[idx];
  if (!existing || depth >= existing.depth) {
    transTable[idx] = { hash, score, depth, flag, bestMove };
  }
}

function ttProbe(hash: number): TTEntry | null {
  const e = transTable[hash & (TT_SIZE - 1)];
  if (e && e.hash === hash) return e;
  return null;
}

// ===== 历史启发 =====
const historyTable: number[] = new Array(64 * 64).fill(0);
function historyIndex(from: Square, to: Square): number {
  return (from[0] * 8 + from[1]) * 64 + (to[0] * 8 + to[1]);
}

// ===== 评估函数 =====
function getPST(piece: string, row: number, col: number): number {
  const type = piece.toLowerCase();
  const white = isWhite(piece);
  const r = white ? row : 7 - row;
  const c = white ? col : 7 - col;
  switch (type) {
    case 'p': return PAWN_PST[r][c];
    case 'n': return KNIGHT_PST[r][c];
    case 'b': return BISHOP_PST[r][c];
    case 'r': return ROOK_PST[r][c];
    case 'q': return QUEEN_PST[r][c];
    case 'k': return KING_PST[r][c];
    default: return 0;
  }
}

/** 局面评估：正值对白方有利 */
function evaluate(board: Board): number {
  let material = 0;
  let positional = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const baseVal = PIECE_VAL[piece] || 0;
      const pstVal = getPST(piece, r, c);
      if (isWhite(piece)) {
        material += baseVal;
        positional += pstVal;
      } else {
        material -= baseVal;
        positional -= pstVal;
      }
    }
  }

  return material + positional;
}

// ===== 应用/撤销走法 =====
function applyMove(board: Board, m: LegalMove): string {
  const captured = board[m.to[0]][m.to[1]];
  board[m.to[0]][m.to[1]] = board[m.from[0]][m.from[1]];
  board[m.from[0]][m.from[1]] = '';
  return captured;
}

function undoMove(board: Board, m: LegalMove, captured: string) {
  board[m.from[0]][m.from[1]] = board[m.to[0]][m.to[1]];
  board[m.to[0]][m.to[1]] = captured;
}

// ===== MVV-LVA 着法排序 =====
function mvvLva(move: LegalMove, board: Board): number {
  if (!move.captures) return -100000;
  const victim = PIECE_VAL[board[move.to[0]][move.to[1]].toLowerCase()] || 0;
  const attacker = PIECE_VAL[move.piece.toLowerCase()] || 1;
  return victim * 100 - attacker;
}

/** 排序后的合法着法 */
function orderedMoves(board: Board, white: boolean, ttBest: LegalMove | null): LegalMove[] {
  const moves = getAllLegalMoves(board, white);
  const scored = moves.map((m) => {
    let score = mvvLva(m, board);
    // TT 最佳着法优先
    if (ttBest && ttBest.from[0] === m.from[0] && ttBest.from[1] === m.from[1] &&
        ttBest.to[0] === m.to[0] && ttBest.to[1] === m.to[1]) {
      score += 1000000;
    }
    // 历史启发
    if (!m.captures) {
      score += historyTable[historyIndex(m.from, m.to)] || 0;
    }
    return { move: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.move);
}

// ===== 搜索控制 =====
let deadline = 0;
let nodeCount = 0;

function checkTimeout() {
  nodeCount++;
  if ((nodeCount & 1023) === 0 && Date.now() > deadline) {
    throw { timeout: true };
  }
}

// Negamax + Alpha-Beta + TT + 空着裁剪
function negamax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  whiteToMove: boolean,
  ply: number,
  allowNull: boolean,
  hash: number,
): number {
  checkTimeout();

  // 置换表探测
  const ttEntry = ttProbe(hash);
  let ttBest: LegalMove | null = null;
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_EXACT) return ttEntry.score;
    if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return ttEntry.score;
    if (ttEntry.flag === TT_BETA && ttEntry.score >= beta) return ttEntry.score;
  }
  if (ttEntry) ttBest = ttEntry.bestMove;

  // 到达深度
  if (depth <= 0) {
    const score = whiteToMove ? evaluate(board) : -evaluate(board);
    ttStore(hash, score, 0, TT_EXACT, null);
    return score;
  }

  const moves = orderedMoves(board, whiteToMove, ttBest);
  if (moves.length === 0) {
    // 将死或逼和：被将军则输，否则和棋
    if (isInCheck(board, whiteToMove)) {
      return -(MATE - ply); // 被将死
    }
    return 0; // 逼和
  }

  // 空着裁剪
  if (allowNull && depth >= 3 && !isInCheck(board, whiteToMove)) {
    const R = 2;
    const nullHash = hash ^ (ZOBRIST as any).side;
    const score = -negamax(board, depth - 1 - R, -beta, -beta + 1, !whiteToMove, ply + 1, false, nullHash);
    if (score >= beta) {
      return beta;
    }
  }

  let bestScore = -INF;
  let bestMove: LegalMove | null = moves[0];
  const originalAlpha = alpha;

  for (const m of moves) {
    const cap = applyMove(board, m);
    // 更新哈希
    const pi = pieceZIndex(board[m.to[0]][m.to[1]]);
    const capPi = cap ? pieceZIndex(cap) : -1;
    let newHash = hash;
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.to[0] * 8 + m.to[1]];
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.from[0] * 8 + m.from[1]];
    if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to[0] * 8 + m.to[1]];
    newHash ^= (ZOBRIST as any).side;

    let score: number;
    try {
      score = -negamax(board, depth - 1, -beta, -alpha, !whiteToMove, ply + 1, true, newHash);
    } catch (e) {
      undoMove(board, m, cap);
      throw e;
    }
    undoMove(board, m, cap);

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
    if (bestScore > alpha) alpha = bestScore;
    if (alpha >= beta) {
      // Beta cutoff
      if (!m.captures) {
        historyTable[historyIndex(m.from, m.to)] += depth * depth;
      }
      break;
    }
  }

  let flag = TT_EXACT;
  if (bestScore <= originalAlpha) flag = TT_ALPHA;
  else if (bestScore >= beta) flag = TT_BETA;
  ttStore(hash, bestScore, depth, flag, bestMove);

  return bestScore;
}

// ===== 难度配置 =====
interface DifficultyConfig {
  depth: number;
  timeMs: number;
  noise: number; // 随机扰动数量
  useEnhanced: boolean;
}

const DIFF_CONFIG: Record<Difficulty, DifficultyConfig> = {
  1: { depth: 1, timeMs: 100, noise: 999, useEnhanced: false }, // 完全随机
  2: { depth: 1, timeMs: 200, noise: 20, useEnhanced: false },  // 偏好吃子
  3: { depth: 2, timeMs: 400, noise: 8, useEnhanced: false },   // 最优吃子
  4: { depth: 3, timeMs: 1000, noise: 3, useEnhanced: true },   // 3层 + 增强
  5: { depth: 5, timeMs: 2500, noise: 0, useEnhanced: true },   // 5层 + 全套
};

// ===== 对外接口 =====

/**
 * AI 选择走法主入口
 */
export function aiMove(board: Board, difficulty: Difficulty, aiIsWhite = false): LegalMove | null {
  const cfg = DIFF_CONFIG[difficulty];
  let legal = getAllLegalMoves(board, aiIsWhite);
  if (legal.length === 0) return null;

  // Level 1: 完全随机
  if (difficulty === 1) {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  // Level 2: 偏好吃子
  if (difficulty === 2) {
    const captures = legal.filter((m) => m.captures);
    if (captures.length > 0 && Math.random() < 0.7) {
      return captures[Math.floor(Math.random() * captures.length)];
    }
    return legal[Math.floor(Math.random() * legal.length)];
  }

  // Level 3-5: 使用增强引擎
  deadline = Date.now() + cfg.timeMs;
  nodeCount = 0;
  transTable = new Array(TT_SIZE);
  // 历史表衰减
  for (let i = 0; i < historyTable.length; i++) historyTable[i] = Math.floor(historyTable[i] / 2);

  const initialHash = computeHash(board, aiIsWhite);
  let best: LegalMove | null = null;
  let bestScore = -INF;
  const begin = Date.now();

  // 迭代加深
  for (let d = 1; d <= cfg.depth; d++) {
    const moves = orderedMoves(board, aiIsWhite, best);
    let curBest: LegalMove | null = null;
    let curScore = -INF;
    let alpha = -INF, beta = INF, timedOut = false;

    for (const m of moves) {
      const cap = applyMove(board, m);
      const pi = pieceZIndex(board[m.to[0]][m.to[1]]);
      const capPi = cap ? pieceZIndex(cap) : -1;
      let newHash = initialHash;
      if (pi >= 0) newHash ^= ZOBRIST[pi][m.to[0] * 8 + m.to[1]];
      if (pi >= 0) newHash ^= ZOBRIST[pi][m.from[0] * 8 + m.from[1]];
      if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to[0] * 8 + m.to[1]];
      newHash ^= (ZOBRIST as any).side;

      let score: number;
      try {
        score = -negamax(board, d - 1, -beta, -alpha, !aiIsWhite, 1, cfg.useEnhanced, newHash);
      } catch {
        timedOut = true;
        undoMove(board, m, cap);
        break;
      }
      undoMove(board, m, cap);

      if (score > curScore) {
        curScore = score;
        curBest = m;
      }
      if (curScore > alpha) alpha = curScore;
    }

    if (!timedOut && curBest) {
      best = curBest;
      bestScore = curScore;
    } else {
      break;
    }

    if (Date.now() - begin > cfg.timeMs * 0.85) break;
  }

  if (!best) best = legal[0];

  // 随机扰动（低难度）
  if (cfg.noise > 0 && Math.abs(bestScore) < MATE * 0.5) {
    const count = Math.max(1, Math.min(legal.length, 1 + Math.floor(cfg.noise / 3)));
    const ordered = orderedMoves(board, aiIsWhite, best);
    const top = ordered.slice(0, count);
    best = top[(Math.random() * top.length) | 0];
  }

  return best;
}

/** 为用户生成走法提示（使用 hard 级别算法） */
export function getHint(board: Board, playerIsWhite = true): LegalMove | null {
  const legal = getAllLegalMoves(board, playerIsWhite);
  if (legal.length === 0) return null;

  deadline = Date.now() + 800;
  nodeCount = 0;
  transTable = new Array(TT_SIZE);

  const initialHash = computeHash(board, playerIsWhite);
  let best: LegalMove | null = null;
  const begin = Date.now();

  for (let d = 1; d <= 3; d++) {
    const moves = orderedMoves(board, playerIsWhite, best);
    let curBest: LegalMove | null = null;
    let curScore = -INF;
    let alpha = -INF, beta = INF, timedOut = false;

    for (const m of moves) {
      const cap = applyMove(board, m);
      const pi = pieceZIndex(board[m.to[0]][m.to[1]]);
      const capPi = cap ? pieceZIndex(cap) : -1;
      let newHash = initialHash;
      if (pi >= 0) newHash ^= ZOBRIST[pi][m.to[0] * 8 + m.to[1]];
      if (pi >= 0) newHash ^= ZOBRIST[pi][m.from[0] * 8 + m.from[1]];
      if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to[0] * 8 + m.to[1]];
      newHash ^= (ZOBRIST as any).side;

      let score: number;
      try {
        score = -negamax(board, d - 1, -beta, -alpha, !playerIsWhite, 1, true, newHash);
      } catch {
        timedOut = true;
        undoMove(board, m, cap);
        break;
      }
      undoMove(board, m, cap);

      if (score > curScore) {
        curScore = score;
        curBest = m;
      }
      if (curScore > alpha) alpha = curScore;
    }

    if (!timedOut && curBest) {
      best = curBest;
    } else {
      break;
    }
    if (Date.now() - begin > 600) break;
  }

  return best || legal[0];
}

// 保留旧导出名以兼容
export { evaluate };
