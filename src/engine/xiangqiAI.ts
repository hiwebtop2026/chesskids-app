/**
 * ChessKids - 中国象棋 AI 引擎（增强版）
 *
 * 算法：Negamax + Alpha-Beta 剪枝 + 迭代加深
 * 增强：Zobrist 置换表 + MVV-LVA 着法排序 + 历史启发 + 空着裁剪 + 位置价值表评估
 *
 * 坐标：board[row][col]，row 0=黑方底线，row 9=红方底线
 * 棋子：红方大写（K A B N R C P），黑方小写（k a b n r c p）
 */
import type { XiangqiBoard, XiangqiColor, XiangqiSquare } from '../types/xiangqi';

const COLS = 9;
const ROWS = 10;
const MATE = 1000000;
const INF = 1e9;

type FlatBoard = string[];

const TYPE = {
  GENERAL: 'k', ADVISOR: 'a', ELEPHANT: 'b', HORSE: 'n', ROOK: 'r', CANNON: 'c', PAWN: 'p',
} as const;

// 棋子基础价值
const PIECE_VALUE: Record<string, number> = {
  k: 10000, a: 120, b: 120, n: 350, r: 900, c: 450, p: 100,
  K: 10000, A: 120, B: 120, N: 350, R: 900, C: 450, P: 100,
};

// ===== 位置价值表 (红方视角，黑方镜像) =====
// 值越大位置越好

// 兵/卒位置价值表（红兵 row 9→0）
const PAWN_PST_RED = [
  [  0,  0,  0,  0,  0,  0,  0,  0,  0], // row 0 黑方底线
  [ 90, 90, 90, 96, 90, 96, 90, 90, 90], // row 1
  [ 90, 96,103, 97, 94, 97,103, 96, 90], // row 2
  [ 90, 96, 99,104,108,104, 99, 96, 90], // row 3
  [ 90, 96, 99,104,108,104, 99, 96, 90], // row 4 河岸
  [ 60, 60, 65, 72, 72, 72, 65, 60, 60], // row 5 红岸
  [ 20,  0, 20,  0, 20,  0, 20,  0, 20], // row 6 初始兵位
  [  0,  0,  0,  0,  0,  0,  0,  0,  0], // row 7
  [  0,  0,  0,  0,  0,  0,  0,  0,  0], // row 8
  [  0,  0,  0,  0,  0,  0,  0,  0,  0], // row 9 红方底线
];

// 马位置价值表
const HORSE_PST_RED = [
  [90, 90, 90, 96, 90, 96, 90, 90, 90],
  [90, 96,103, 97, 94, 97,103, 96, 90],
  [92, 98, 99,103, 99,103, 99, 98, 92],
  [93,108,100,107,100,107,100,108, 93],
  [90,100, 99,103,104,103, 99,100, 90],
  [90, 98,101,102,103,102,101, 98, 90],
  [92, 94, 98, 95, 98, 95, 98, 94, 92],
  [93, 92, 94, 95, 92, 95, 94, 92, 93],
  [85, 90, 92, 93, 78, 93, 92, 90, 85],
  [88, 85, 90, 88, 90, 88, 90, 85, 88],
];

// 车位置价值表
const ROOK_PST_RED = [
  [206,208,207,213,214,213,207,208,206],
  [206,212,209,216,233,216,209,212,206],
  [206,208,207,214,216,214,207,208,206],
  [206,213,213,216,216,216,213,213,206],
  [206,211,211,214,215,214,211,211,206],
  [206,212,212,214,215,214,212,212,206],
  [204,209,204,212,214,212,204,209,204],
  [198,208,204,212,212,212,204,208,198],
  [200,208,206,212,200,212,206,208,200],
  [194,206,204,212,200,212,204,206,194],
];

// 炮位置价值表
const CANNON_PST_RED = [
  [100,100, 96, 91, 90, 91, 96,100,100],
  [ 98, 98, 96, 92, 89, 92, 96, 98, 98],
  [ 97, 97, 96, 91, 92, 91, 96, 97, 97],
  [ 96, 99, 99, 98,100, 98, 99, 99, 96],
  [ 96, 96, 96, 96,100, 96, 96, 96, 96],
  [ 95, 96, 99, 96,100, 96, 99, 96, 95],
  [ 96, 96, 96, 96, 96, 96, 96, 96, 96],
  [ 97, 96,100, 99,101, 99,100, 96, 97],
  [ 96, 97, 98, 98, 98, 98, 98, 97, 96],
  [ 96, 96, 97, 99, 99, 99, 97, 96, 96],
];

// 位置价值表查询
function getPST(piece: string, row: number, col: number): number {
  const type = piece.toLowerCase();
  const red = piece === piece.toUpperCase();
  const r = red ? row : 9 - row; // 黑方镜像
  const c = red ? col : 8 - col;
  switch (type) {
    case TYPE.PAWN: return PAWN_PST_RED[r][c] - 100; // 基准为0附近
    case TYPE.HORSE: return HORSE_PST_RED[r][c] - 100;
    case TYPE.ROOK: return ROOK_PST_RED[r][c] - 200;
    case TYPE.CANNON: return CANNON_PST_RED[r][c] - 100;
    default: return 0;
  }
}

const isRed = (p: string) => p !== '' && p === p.toUpperCase();

const DIR4: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const HORSE_MV: Array<[number, number]> = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const HORSE_LEG: Record<string, [number, number]> = {
  '[-2,-1]': [-1, 0], '[-2,1]': [-1, 0], '[-1,-2]': [0, -1], '[-1,2]': [0, 1],
  '[1,-2]': [0, -1], '[1,2]': [0, 1], '[2,-1]': [1, 0], '[2,1]': [1, 0],
};
const ELE_MV: Array<[number, number]> = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
const ADV_MV: Array<[number, number]> = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const inBoard = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS;
const inPalace = (x: number, y: number, color: 'r' | 'b') =>
  x >= 3 && x <= 5 && (color === 'r' ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
const ownHalf = (y: number, color: 'r' | 'b') => (color === 'r' ? y >= 5 : y <= 4);
const crossed = (y: number, color: 'r' | 'b') => (color === 'r' ? y <= 4 : y >= 5);
const opp = (c: 'r' | 'b'): 'r' | 'b' => (c === 'r' ? 'b' : 'r');

// ===== Zobrist 哈希 =====
const ZOBRIST: number[][] = []; // [pieceIndex][squareIndex]
const ZOBRIST_SIDE = [0, 0]; // 红方走棋=0, 黑方走棋=1

// 简易随机数生成（Mulberry32）
function mulberry32(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 初始化 Zobrist 表
(function initZobrist() {
  const rand = mulberry32(123456789);
  const pieceTypes = 14; // 7种 × 2色
  for (let i = 0; i < pieceTypes; i++) {
    ZOBRIST[i] = [];
    for (let j = 0; j < COLS * ROWS; j++) {
      ZOBRIST[i][j] = Math.floor(rand() * 0x7FFFFFFF);
    }
  }
  ZOBRIST_SIDE[0] = Math.floor(rand() * 0x7FFFFFFF);
  ZOBRIST_SIDE[1] = Math.floor(rand() * 0x7FFFFFFF);
})();

function pieceZobristIndex(p: string): number {
  if (!p) return -1;
  const typeMap: Record<string, number> = { k:0, a:1, b:2, n:3, r:4, c:5, p:6 };
  const t = p.toLowerCase();
  const idx = typeMap[t];
  if (idx === undefined) return -1;
  return isRed(p) ? idx : idx + 7;
}

function computeHash(b: FlatBoard, color: 'r' | 'b'): number {
  let h = 0;
  for (let i = 0; i < b.length; i++) {
    const pi = pieceZobristIndex(b[i]);
    if (pi >= 0) h ^= ZOBRIST[pi][i];
  }
  if (color === 'b') h ^= ZOBRIST_SIDE[1];
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
  flag: number; // EXACT/ALPHA/BETA
  bestFrom: number;
  bestTo: number;
}

const TT_SIZE = 1 << 17; // 131072 条目
let transTable: TTEntry[] = new Array(TT_SIZE);

function ttStore(hash: number, score: number, depth: number, flag: number, bestFrom: number, bestTo: number) {
  const idx = hash & (TT_SIZE - 1);
  const existing = transTable[idx];
  // 总是替换（深度优先的简单策略）
  if (!existing || depth >= existing.depth) {
    transTable[idx] = { hash, score, depth, flag, bestFrom, bestTo };
  }
}

function ttProbe(hash: number): TTEntry | null {
  const entry = transTable[hash & (TT_SIZE - 1)];
  if (entry && entry.hash === hash) return entry;
  return null;
}

// ===== 历史启发 =====
const historyTable: number[] = new Array(COLS * ROWS * COLS * ROWS).fill(0);

function historyIndex(from: number, to: number): number {
  return from * COLS * ROWS + to;
}

// ===== 棋盘转换 =====
function toFlat(board: XiangqiBoard): FlatBoard {
  const f = new Array<string>(COLS * ROWS).fill('');
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) f[y * COLS + x] = board[y][x];
  return f;
}

// ===== 伪着法生成 =====
function pseudoMoves(b: FlatBoard, idx: number): number[] {
  const p = b[idx];
  if (!p) return [];
  const x = idx % COLS, y = (idx / COLS) | 0;
  const c: 'r' | 'b' = isRed(p) ? 'r' : 'b';
  const type = p.toLowerCase();
  const out: number[] = [];
  const add = (nx: number, ny: number) => {
    if (!inBoard(nx, ny)) return false;
    const q = b[ny * COLS + nx];
    if (q && isRed(q) === isRed(p)) return false;
    out.push(ny * COLS + nx);
    return !q;
  };
  const addIf = (nx: number, ny: number, cond: () => boolean) => {
    if (!inBoard(nx, ny) || !cond()) return;
    const q = b[ny * COLS + nx];
    if (q && isRed(q) === isRed(p)) return;
    out.push(ny * COLS + nx);
  };

  switch (type) {
    case TYPE.GENERAL:
      for (const [dx, dy] of DIR4) { const nx = x + dx, ny = y + dy; if (inPalace(nx, ny, c)) add(nx, ny); }
      break;
    case TYPE.ADVISOR:
      for (const [dx, dy] of ADV_MV) { const nx = x + dx, ny = y + dy; if (inPalace(nx, ny, c)) add(nx, ny); }
      break;
    case TYPE.ELEPHANT:
      for (const [dx, dy] of ELE_MV) {
        const nx = x + dx, ny = y + dy, ex = x + dx / 2, ey = y + dy / 2;
        addIf(nx, ny, () => ownHalf(ny, c) && !b[ey * COLS + ex]);
      }
      break;
    case TYPE.HORSE:
      for (const [dx, dy] of HORSE_MV) {
        const leg = HORSE_LEG['[' + dx + ',' + dy + ']'];
        const nx = x + dx, ny = y + dy, lx = x + leg[0], ly = y + leg[1];
        addIf(nx, ny, () => !b[ly * COLS + lx]);
      }
      break;
    case TYPE.ROOK:
      for (const [dx, dy] of DIR4) {
        let nx = x + dx, ny = y + dy;
        while (inBoard(nx, ny)) {
          if (!b[ny * COLS + nx]) add(nx, ny);
          else { if (isRed(b[ny * COLS + nx]) !== isRed(p)) add(nx, ny); break; }
          nx += dx; ny += dy;
        }
      }
      break;
    case TYPE.CANNON:
      for (const [dx, dy] of DIR4) {
        let nx = x + dx, ny = y + dy, screen = 0;
        while (inBoard(nx, ny)) {
          const q = b[ny * COLS + nx];
          if (!q) { if (screen === 0) add(nx, ny); }
          else {
            screen++;
            if (screen === 2) { if (isRed(q) !== isRed(p)) add(nx, ny); break; }
          }
          nx += dx; ny += dy;
        }
      }
      break;
    case TYPE.PAWN: {
      const fy = c === 'r' ? y - 1 : y + 1;
      if (inBoard(x, fy)) add(x, fy);
      if (crossed(y, c)) { if (inBoard(x - 1, y)) add(x - 1, y); if (inBoard(x + 1, y)) add(x + 1, y); }
      break;
    }
  }
  return out;
}

// ===== 攻击检测 =====
function isAttacked(b: FlatBoard, x: number, y: number, color: 'r' | 'b'): boolean {
  for (const [dx, dy] of DIR4) {
    let nx = x + dx, ny = y + dy, screen = 0;
    while (inBoard(nx, ny)) {
      const q = b[ny * COLS + nx];
      if (q) {
        if (isRed(q) === (color === 'r')) {
          if (screen === 0) {
            if (q.toLowerCase() === TYPE.ROOK) return true;
            if (q.toLowerCase() === TYPE.GENERAL && dx === 0) return true;
          }
          if (q.toLowerCase() === TYPE.CANNON && screen === 1) return true;
        }
        screen++;
        if (screen >= 2) break;
      }
      nx += dx; ny += dy;
    }
  }
  for (const [dx, dy] of HORSE_MV) {
    const leg = HORSE_LEG['[' + dx + ',' + dy + ']'];
    const px = x + dx, py = y + dy, lx = x + leg[0], ly = y + leg[1];
    if (inBoard(px, py) && b[py * COLS + px] && isRed(b[py * COLS + px]) === (color === 'r') &&
        b[py * COLS + px].toLowerCase() === TYPE.HORSE && !b[ly * COLS + lx]) return true;
  }
  const redPawn = (px: number, py: number) => b[py * COLS + px] && b[py * COLS + px] === 'P';
  const blkPawn = (px: number, py: number) => b[py * COLS + px] && b[py * COLS + px] === 'p';
  if (inBoard(x, y + 1) && redPawn(x, y + 1)) return true;
  if (y + 1 <= 4) { if (inBoard(x - 1, y + 1) && redPawn(x - 1, y + 1)) return true; if (inBoard(x + 1, y + 1) && redPawn(x + 1, y + 1)) return true; }
  if (inBoard(x, y - 1) && blkPawn(x, y - 1)) return true;
  if (y - 1 >= 5) { if (inBoard(x - 1, y - 1) && blkPawn(x - 1, y - 1)) return true; if (inBoard(x + 1, y - 1) && blkPawn(x + 1, y - 1)) return true; }
  return false;
}

function findGeneral(b: FlatBoard, c: 'r' | 'b'): number {
  const ch = c === 'r' ? 'K' : 'k';
  for (let i = 0; i < b.length; i++) if (b[i] === ch) return i;
  return -1;
}

const isInCheck = (b: FlatBoard, c: 'r' | 'b') => {
  const g = findGeneral(b, c);
  return g >= 0 ? isAttacked(b, g % COLS, (g / COLS) | 0, opp(c)) : false;
};

const applyMove = (b: FlatBoard, from: number, to: number) => { const cap = b[to]; b[to] = b[from]; b[from] = ''; return cap; };
const undoMove = (b: FlatBoard, from: number, to: number, cap: string) => { b[from] = b[to]; b[to] = cap; };

// ===== 评估函数 =====
function evaluate(b: FlatBoard, c: 'r' | 'b'): number {
  let material = 0;
  let positional = 0;
  let mobility = 0;

  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const x = i % COLS, y = (i / COLS) | 0;
    const mine = isRed(p) === (c === 'r');
    const baseVal = PIECE_VALUE[p] || 0;
    const pstVal = getPST(p, y, x);
    material += mine ? baseVal : -baseVal;
    positional += mine ? pstVal : -pstVal;
  }

  // 机动性评估（浅层：只计算己方）
  let myMobility = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] && isRed(b[i]) === (c === 'r')) {
      myMobility += pseudoMoves(b, i).length;
    }
  }
  mobility = myMobility * 2;

  return material + positional + mobility;
}

// ===== MVV-LVA 着法排序 =====
function mvvLvaScore(piece: string, captured: string): number {
  if (!captured) return -10000 + (historyTable[historyIndex(0, 0)] || 0); // 非吃子按历史排序
  const victim = PIECE_VALUE[captured] || 0;
  const attacker = PIECE_VALUE[piece] || 1;
  return victim * 100 - attacker; // 受害者越值钱、攻击者越便宜，分数越高
}

// ===== 合法着法（带排序）=====
function legalMovesOrdered(
  b: FlatBoard,
  c: 'r' | 'b',
  bestFrom: number,
  bestTo: number,
): Array<{ from: number; to: number; cap: string; score: number }> {
  const pseudo: Array<{ from: number; to: number; cap: string; score: number }> = [];
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (p && isRed(p) === (c === 'r')) {
      for (const d of pseudoMoves(b, i)) {
        const cap = b[d];
        let score = mvvLvaScore(p, cap);
        // TT 最佳着法优先
        if (i === bestFrom && d === bestTo) score += 1000000;
        // 历史着法加成（非吃子）
        if (!cap) score += historyTable[historyIndex(i, d)] || 0;
        pseudo.push({ from: i, to: d, cap, score });
      }
    }
  }
  // 按分数从高到低排序
  pseudo.sort((a, z) => z.score - a.score);

  const legal: Array<{ from: number; to: number; cap: string; score: number }> = [];
  for (const m of pseudo) {
    const cap = applyMove(b, m.from, m.to);
    if (!isInCheck(b, c)) legal.push(m);
    undoMove(b, m.from, m.to, cap);
  }
  return legal;
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
  b: FlatBoard,
  c: 'r' | 'b',
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  allowNull: boolean,
  hash: number,
): number {
  checkTimeout();

  // 置换表探测
  const ttEntry = ttProbe(hash);
  let ttBestFrom = -1, ttBestTo = -1;
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_EXACT) return ttEntry.score;
    if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return ttEntry.score;
    if (ttEntry.flag === TT_BETA && ttEntry.score >= beta) return ttEntry.score;
  }
  if (ttEntry) {
    ttBestFrom = ttEntry.bestFrom;
    ttBestTo = ttEntry.bestTo;
  }

  // 到达深度 → 评估
  if (depth <= 0) {
    const score = evaluate(b, c);
    ttStore(hash, score, 0, TT_EXACT, -1, -1);
    return score;
  }

  // 空着裁剪（只在优势局面且非底线时使用）
  if (allowNull && depth >= 3 && !isInCheck(b, c)) {
    // 简单空着：跳过一步，让对手走
    const nullHash = hash ^ ZOBRIST_SIDE[c === 'r' ? 0 : 1] ^ ZOBRIST_SIDE[c === 'b' ? 0 : 1];
    const R = 2; // 空着裁剪深度减 2
    const score = -negamax(b, opp(c), depth - 1 - R, -beta, -beta + 1, ply + 1, false, nullHash);
    if (score >= beta) {
      return beta; // fail high
    }
  }

  // 生成着法并排序
  const moves = legalMovesOrdered(b, c, ttBestFrom, ttBestTo);
  if (moves.length === 0) {
    // 将死或困毙
    return -(MATE - ply);
  }

  let bestScore = -INF;
  let bestFrom = moves[0].from;
  let bestTo = moves[0].to;
  let originalAlpha = alpha;

  for (const m of moves) {
    const cap = applyMove(b, m.from, m.to);
    // 更新哈希
    const pi = pieceZobristIndex(b[m.to]);
    const capPi = cap ? pieceZobristIndex(cap) : -1;
    let newHash = hash;
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.to];
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.from];
    if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to];
    newHash ^= ZOBRIST_SIDE[0];
    newHash ^= ZOBRIST_SIDE[1];

    let score: number;
    try {
      score = -negamax(b, opp(c), depth - 1, -beta, -alpha, ply + 1, true, newHash);
    } catch (e) {
      undoMove(b, m.from, m.to, cap);
      throw e;
    }
    undoMove(b, m.from, m.to, cap);

    if (score > bestScore) {
      bestScore = score;
      bestFrom = m.from;
      bestTo = m.to;
    }
    if (bestScore > alpha) alpha = bestScore;
    if (alpha >= beta) {
      // Beta cutoff → 更新历史表
      if (!m.cap) {
        historyTable[historyIndex(m.from, m.to)] += depth * depth;
      }
      break;
    }
  }

  // 存入置换表
  let flag = TT_EXACT;
  if (bestScore <= originalAlpha) flag = TT_ALPHA;
  else if (bestScore >= beta) flag = TT_BETA;
  ttStore(hash, bestScore, depth, flag, bestFrom, bestTo);

  return bestScore;
}

// ===== 对外接口 =====
export type XiangqiAIDifficulty = 'easy' | 'medium' | 'hard' | 'master';

export const XIANGQI_AI_DIFFICULTIES: XiangqiAIDifficulty[] = ['easy', 'medium', 'hard', 'master'];

const DIFFICULTY: Record<XiangqiAIDifficulty, { depth: number; timeMs: number; noise: number }> = {
  easy:   { depth: 2, timeMs: 400,  noise: 30 },
  medium: { depth: 4, timeMs: 1000, noise: 8  },
  hard:   { depth: 6, timeMs: 2500, noise: 0  },
  master: { depth: 8, timeMs: 5000, noise: 0  },
};

/**
 * 计算 AI 最佳着法
 */
export function xiangqiBestMove(
  board: XiangqiBoard,
  color: XiangqiColor,
  difficulty: XiangqiAIDifficulty = 'medium',
): XiangqiSquare[] | null {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  deadline = Date.now() + cfg.timeMs;
  nodeCount = 0;

  // 清空置换表（每步清空避免污染，也可以不清空保留前序信息）
  transTable = new Array(TT_SIZE);
  // 历史表衰减
  for (let i = 0; i < historyTable.length; i++) historyTable[i] = Math.floor(historyTable[i] / 2);

  const b = toFlat(board);
  const c: 'r' | 'b' = color;
  const initialHash = computeHash(b, c);

  // 先获取所有合法着法
  const firstMoves = legalMovesOrdered(b, c, -1, -1);
  if (firstMoves.length === 0) return null;

  let best: { from: number; to: number } | null = null;
  let bestScore = -INF;
  const begin = Date.now();

  // 迭代加深
  for (let d = 1; d <= cfg.depth; d++) {
    let curBest: { from: number; to: number } | null = null;
    let curScore = -INF;
    let alpha = -INF, beta = INF, timedOut = false;

    // 重新排序（用上一轮最佳着法优先）
    const moves = legalMovesOrdered(
      b, c,
      best ? best.from : -1,
      best ? best.to : -1,
    );

    for (const m of moves) {
      const cap = applyMove(b, m.from, m.to);
      const pi = pieceZobristIndex(b[m.to]);
      const capPi = cap ? pieceZobristIndex(cap) : -1;
      let newHash = initialHash;
      if (pi >= 0) newHash ^= ZOBRIST[pi][m.to];
      if (pi >= 0) newHash ^= ZOBRIST[pi][m.from];
      if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to];
      newHash ^= ZOBRIST_SIDE[0];
      newHash ^= ZOBRIST_SIDE[1];

      let score: number;
      try {
        score = -negamax(b, opp(c), d - 1, -beta, -alpha, 1, true, newHash);
      } catch {
        timedOut = true;
        undoMove(b, m.from, m.to, cap);
        break;
      }
      undoMove(b, m.from, m.to, cap);

      if (score > curScore) {
        curScore = score;
        curBest = { from: m.from, to: m.to };
      }
      if (curScore > alpha) alpha = curScore;
    }

    if (!timedOut && curBest) {
      best = curBest;
      bestScore = curScore;
    } else {
      break; // 超时，用上次结果
    }

    // 时间用完 90% 就停止加深
    if (Date.now() - begin > cfg.timeMs * 0.85) break;
  }

  if (!best) {
    best = { from: firstMoves[0].from, to: firstMoves[0].to };
  }

  // 低难度随机扰动
  if (cfg.noise > 0 && Math.abs(bestScore) < MATE * 0.5) {
    const count = Math.max(1, Math.min(firstMoves.length, 1 + Math.floor(cfg.noise / 5)));
    const top = firstMoves.slice(0, count);
    const pick = top[(Math.random() * top.length) | 0];
    best = { from: pick.from, to: pick.to };
  }

  return [
    [(best.from / COLS) | 0, best.from % COLS],
    [(best.to / COLS) | 0, best.to % COLS],
  ];
}
