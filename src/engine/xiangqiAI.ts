/**
 * ChessKids - 中国象棋 AI 引擎
 * 使用扁平 90 格棋盘 + 极简伪着法/吃子/将军检测（不克隆棋盘），
 * minimax + alpha-beta 剪枝，供"人机对战"模块使用。
 *
 * 坐标与项目引擎一致：board[row][col]，row 0=黑方底线，row 9=红方底线。
 * 棋子字符：红方大写（K A B N R C P），黑方小写（k a b n r c p）。
 */
import type { XiangqiBoard, XiangqiColor, XiangqiSquare } from '../types/xiangqi';

const COLS = 9;
const ROWS = 10;
const MATE = 1000000;
const INF = 1e9;

/** 扁平棋盘：90 格字符串数组 */
type FlatBoard = string[];

const TYPE = {
  GENERAL: 'k', ADVISOR: 'a', ELEPHANT: 'b', HORSE: 'n', ROOK: 'r', CANNON: 'c', PAWN: 'p',
} as const;

const VALUE: Record<string, number> = {
  k: 10000, a: 200, b: 200, n: 450, r: 900, c: 450, p: 100,
  K: 10000, A: 200, B: 200, N: 450, R: 900, C: 450, P: 100,
};

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

function toFlat(board: XiangqiBoard): FlatBoard {
  const f = new Array<string>(COLS * ROWS).fill('');
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) f[y * COLS + x] = board[y][x];
  return f;
}

/** 伪着法：返回目标格 index 列表 */
function pseudoMoves(b: FlatBoard, idx: number): number[] {
  const p = b[idx];
  if (!p) return [];
  const x = idx % COLS, y = (idx / COLS) | 0;
  const c: 'r' | 'b' = isRed(p) ? 'r' : 'b';
  const type = p.toLowerCase();
  const out: number[] = [];
  const add = (nx: number, ny: number) => {
    if (!inBoard(nx, ny)) return;
    const q = b[ny * COLS + nx];
    if (q && isRed(q) === isRed(p)) return; // 不能吃本方棋子
    out.push(ny * COLS + nx);
  };
  const addIf = (nx: number, ny: number, cond: () => boolean) => {
    if (!inBoard(nx, ny) || !cond()) return;
    const q = b[ny * COLS + nx];
    if (q && isRed(q) === isRed(p)) return; // 不能吃本方棋子
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
            if (screen === 1) { /* 炮架 */ }
            else if (screen === 2) { if (isRed(q) !== isRed(p)) add(nx, ny); break; }
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

/** (x,y) 是否被 color 方攻击 */
function isAttacked(b: FlatBoard, x: number, y: number, color: 'r' | 'b'): boolean {
  for (const [dx, dy] of DIR4) {
    let nx = x + dx, ny = y + dy, screen = 0;
    while (inBoard(nx, ny)) {
      const q = b[ny * COLS + nx];
      if (q) {
        if (isRed(q) === (color === 'r')) {
          if (screen === 0) {
            if (q.toLowerCase() === TYPE.ROOK) return true;
            if (q.toLowerCase() === TYPE.GENERAL && dx === 0) return true; // 王不见王
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
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (inBoard(nx, ny) && b[ny * COLS + nx] && isRed(b[ny * COLS + nx]) === (color === 'r') &&
        b[ny * COLS + nx].toLowerCase() === TYPE.GENERAL) return true;
  }
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

/** 合法着法（不破坏棋盘） */
function legalMoves(b: FlatBoard, c: 'r' | 'b'): Array<{ from: number; to: number; cap: string }> {
  const pseudo: Array<{ from: number; to: number; cap: string }> = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] && isRed(b[i]) === (c === 'r')) {
      for (const d of pseudoMoves(b, i)) pseudo.push({ from: i, to: d, cap: b[d] });
    }
  }
  const legal: Array<{ from: number; to: number; cap: string }> = [];
  for (const m of pseudo) {
    const cap = applyMove(b, m.from, m.to);
    if (!isInCheck(b, c)) legal.push(m);
    undoMove(b, m.from, m.to, cap);
  }
  return legal;
}

/** 局面评估：正值对 color 有利 */
function evaluate(b: FlatBoard, c: 'r' | 'b'): number {
  let s = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const x = i % COLS, y = (i / COLS) | 0;
    const mine = isRed(p) === (c === 'r');
    let v = VALUE[p] || 0;
    const type = p.toLowerCase();
    if (type === TYPE.PAWN) {
      const adv = isRed(p) ? (9 - y) : y;
      v += adv * 12 + (crossed(y, isRed(p) ? 'r' : 'b') ? 45 : 0) + (x === 4 ? 8 : x === 3 || x === 5 ? 4 : 0);
    } else if (type === TYPE.HORSE) {
      v += Math.max(0, 12 - (Math.abs(x - 4) * 3 + Math.abs(y - (isRed(p) ? 7 : 2)) * 2));
    } else if (type === TYPE.CANNON) {
      v += 6;
    }
    s += mine ? v : -v;
  }
  return s;
}

let deadline = 0;
let nodeCount = 0;

function negamax(b: FlatBoard, c: 'r' | 'b', depth: number, alpha: number, beta: number, maxDepth: number): number {
  nodeCount++;
  if ((nodeCount & 2047) === 0 && Date.now() > deadline) throw { timeout: true };
  const moves = legalMoves(b, c);
  if (moves.length === 0) return -(MATE - (maxDepth - depth) * 2);
  if (depth <= 0) return evaluate(b, c);
  // 着法排序：吃子优先
  moves.sort((a, z) => (VALUE[z.cap] || 0) - (VALUE[a.cap] || 0));
  let best = -INF;
  for (const m of moves) {
    const cap = applyMove(b, m.from, m.to);
    let score: number;
    try {
      score = -negamax(b, opp(c), depth - 1, -beta, -alpha, maxDepth);
    } catch (e) {
      undoMove(b, m.from, m.to, cap);
      throw e; // 超时：逐层回滚后再向上抛出
    }
    undoMove(b, m.from, m.to, cap);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export type XiangqiAIDifficulty = 'easy' | 'medium' | 'hard' | 'master';

export const XIANGQI_AI_DIFFICULTIES: XiangqiAIDifficulty[] = ['easy', 'medium', 'hard', 'master'];

const DIFFICULTY: Record<XiangqiAIDifficulty, { depth: number; timeMs: number; noise: number }> = {
  easy: { depth: 1, timeMs: 250, noise: 30 },
  medium: { depth: 2, timeMs: 600, noise: 6 },
  hard: { depth: 3, timeMs: 1800, noise: 0 },
  master: { depth: 4, timeMs: 4000, noise: 0 },
};

/**
 * 计算 AI 最佳着法。
 * @param board 2D 棋盘
 * @param color AI 执子方
 * @param difficulty 难度
 * @returns { from, to } 或 null（无着法）
 */
export function xiangqiBestMove(
  board: XiangqiBoard,
  color: XiangqiColor,
  difficulty: XiangqiAIDifficulty = 'medium',
): XiangqiSquare[] | null {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  deadline = Date.now() + cfg.timeMs;
  nodeCount = 0;
  const b = toFlat(board);
  const c: 'r' | 'b' = color;
  let moves = legalMoves(b, c);
  if (moves.length === 0) return null;
  const begin = Date.now();
  let best: { from: number; to: number } | null = null;
  let bestScore = -INF;
  // 迭代加深
  for (let d = 1; d <= cfg.depth; d++) {
    moves.sort((a, z) => (VALUE[z.cap] || 0) - (VALUE[a.cap] || 0));
    let curBest: { from: number; to: number } | null = null;
    let curScore = -INF;
    let alpha = -INF, beta = INF, timed = false;
    for (const m of moves) {
      const cap = applyMove(b, m.from, m.to);
      let score: number;
      try { score = -negamax(b, opp(c), d - 1, -beta, -alpha, d); }
      catch { timed = true; undoMove(b, m.from, m.to, cap); break; }
      undoMove(b, m.from, m.to, cap);
      if (score > curScore) { curScore = score; curBest = { from: m.from, to: m.to }; }
      if (curScore > alpha) alpha = curScore;
    }
    if (!timed && curBest) { best = curBest; bestScore = curScore; }
    else break;
    if (Date.now() - begin > cfg.timeMs * 0.9) break;
  }
  if (!best) {
    // 至少返回一个合法着法
    best = { from: moves[0].from, to: moves[0].to };
  }
  // 低难度随机扰动：从较优的若干着法中随机选
  if (cfg.noise > 0 && Math.abs(bestScore) < MATE * 0.5) {
    const top = moves.slice(0, Math.max(1, Math.min(moves.length, 1 + Math.floor(cfg.noise / 8))));
    const pick = top[(Math.random() * top.length) | 0];
    best = { from: pick.from, to: pick.to };
  }
  return [[(best.from / COLS) | 0, best.from % COLS], [(best.to / COLS) | 0, best.to % COLS]];
}
