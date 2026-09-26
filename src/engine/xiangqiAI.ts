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
import { isXiangqiMoveLegal } from './xiangqi';
import { getOpeningMove } from './xiangqiLearning';

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

// ===== 可学习权重（自我对弈反哺）=====
// 按棋子类型（小写）保存的评估偏置分，来自 xiangqiLearning 的自对弈学习；
// 主线程从 localStorage 读取后通过 setLearnedBias / xiangqiBestMove 第 4 参传入（Worker 无 localStorage）。
let learnedBias: Record<string, number> | null = null;

export function setLearnedBias(bias: Record<string, number> | null) {
  learnedBias = bias;
}

export function getLearnedBias(): Record<string, number> | null {
  return learnedBias;
}


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
// 马腿表（相对马位置：pseudoMoves 着法生成用）——保持原值
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
// 走方标记（side to move）：黑方 hash 异或 SIDE[0]，每次走子异或一次 SIDE[0] 完成换边
// 注意：历史上曾同时异或 SIDE[0]^SIDE[1] 导致哈希不随换边正确翻转、置换表命中率低，
// 现统一为单一 SIDE[0] 语义（SIDE[1] 保留仅兼容旧引用）。
const ZOBRIST_SIDE = [0, 0];

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
  ZOBRIST_SIDE[1] = ZOBRIST_SIDE[0]; // 兼容：旧代码引用 SIDE[1] 的地方与 SIDE[0] 同值
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

const TT_SIZE = 1 << 19; // 524288 条目（master 深度搜索下 TT 命中率是速度关键）
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

// ===== 杀手着法（Killer Moves）=====
// 每层记录 2 个引起 beta cutoff 的非吃子着法，后续同层优先尝试
const MAX_KILLER_PLY = 64;
const killerMoves: Array<[number, number]>[] = [];
for (let i = 0; i < MAX_KILLER_PLY; i++) killerMoves.push([[-1, -1], [-1, -1]]);

function storeKiller(ply: number, from: number, to: number) {
  if (ply >= MAX_KILLER_PLY) return;
  const km = killerMoves[ply];
  // 避免重复
  if (km[0][0] === from && km[0][1] === to) return;
  km[1] = km[0];
  km[0] = [from, to];
}

function isKiller(ply: number, from: number, to: number): boolean {
  if (ply >= MAX_KILLER_PLY) return false;
  const km = killerMoves[ply];
  return (km[0][0] === from && km[0][1] === to) || (km[1][0] === from && km[1][1] === to);
}

// ===== 静态交换评估（SEE）=====
// 评估吃子交换的净收益，用于着法排序和裁剪
function seeExchange(b: FlatBoard, toIdx: number, attackerColor: 'r' | 'b'): number {
  const victim = b[toIdx];
  if (!victim) return 0;

  // 找到所有能攻击 toIdx 的棋子（双方）
  const tx = toIdx % COLS, ty = (toIdx / COLS) | 0;
  const attackers: Array<{ idx: number; val: number; color: 'r' | 'b' }> = [];

  // 车/炮沿四方向扫描
  for (const [dx, dy] of DIR4) {
    let nx = tx + dx, ny = ty + dy, screen = 0;
    while (inBoard(nx, ny)) {
      const q = b[ny * COLS + nx];
      if (q) {
        if (screen === 0) {
          // 车/将帅直线攻击：将帅只走一步，不能隔空攻击——SEE 仅统计能实际吃子的攻击者（将帅一步内的攻击极罕见，忽略）
          if (q.toLowerCase() === 'r') {
            attackers.push({ idx: ny * COLS + nx, val: PIECE_VALUE[q] || 0, color: isRed(q) ? 'r' : 'b' });
          }
        }
        if (q.toLowerCase() === 'c' && screen === 1) {
          attackers.push({ idx: ny * COLS + nx, val: PIECE_VALUE[q] || 0, color: isRed(q) ? 'r' : 'b' });
        }
        screen++;
        if (screen >= 2) break;
      }
      nx += dx; ny += dy;
    }
  }

  // 马攻击
  for (const [dx, dy] of HORSE_MV) {
    const px = tx + dx, py = ty + dy;
    if (!inBoard(px, py)) continue;
    const q = b[py * COLS + px];
    if (!q || q.toLowerCase() !== 'n') continue;
    const leg = HORSE_LEG['[' + dx + ',' + dy + ']'];
    const lx = px + leg[0], ly = py + leg[1];
    if (!inBoard(lx, ly) || !b[ly * COLS + lx]) {
      attackers.push({ idx: py * COLS + px, val: PIECE_VALUE[q] || 0, color: isRed(q) ? 'r' : 'b' });
    }
  }

  // 兵攻击
  // 红兵向上走（y-1），所以能攻击 ty 的红兵在 ty+1
  if (inBoard(tx, ty + 1) && b[(ty + 1) * COLS + tx] === 'P') {
    attackers.push({ idx: (ty + 1) * COLS + tx, val: PIECE_VALUE['P'], color: 'r' });
  }
  // 红兵过河后横吃
  if (ty <= 4) {
    if (inBoard(tx - 1, ty) && b[ty * COLS + tx - 1] === 'P')
      attackers.push({ idx: ty * COLS + tx - 1, val: PIECE_VALUE['P'], color: 'r' });
    if (inBoard(tx + 1, ty) && b[ty * COLS + tx + 1] === 'P')
      attackers.push({ idx: ty * COLS + tx + 1, val: PIECE_VALUE['P'], color: 'r' });
  }
  // 黑卒向下走
  if (inBoard(tx, ty - 1) && b[(ty - 1) * COLS + tx] === 'p') {
    attackers.push({ idx: (ty - 1) * COLS + tx, val: PIECE_VALUE['p'], color: 'b' });
  }
  if (ty >= 5) {
    if (inBoard(tx - 1, ty) && b[ty * COLS + tx - 1] === 'p')
      attackers.push({ idx: ty * COLS + tx - 1, val: PIECE_VALUE['p'], color: 'b' });
    if (inBoard(tx + 1, ty) && b[ty * COLS + tx + 1] === 'p')
      attackers.push({ idx: ty * COLS + tx + 1, val: PIECE_VALUE['p'], color: 'b' });
  }

  // 简化的 SEE：按攻击者价值升序模拟交换
  // 攻击方先手，轮流吃，直到一方不吃为止
  // 己方攻击者优先（按价值升序），对方攻击者随后（按价值升序）——保证先手回合交替，避免同值排序不稳定
  const sorted = attackers.sort((a, b) => {
    const aSelf = a.color === attackerColor ? 0 : 1;
    const bSelf = b.color === attackerColor ? 0 : 1;
    return aSelf - bSelf || a.val - b.val;
  });
  let gain = 0;
  let turn: 'r' | 'b' = attackerColor;
  let victimVal = PIECE_VALUE[victim] || 0;

  for (const atk of sorted) {
    if (atk.color !== turn) continue; // 非当前回合的攻击者跳过（己方/对方分块，回合交替处理）
    // 对方回合：若吃回亏本（用贵子换便宜子）则对方停手
    if (turn !== attackerColor && victimVal < atk.val) break;
    gain += turn === attackerColor ? victimVal : -victimVal;
    victimVal = atk.val;
    turn = opp(turn);
  }

  return gain;
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
    const px = x + dx, py = y + dy;
    if (inBoard(px, py) && b[py * COLS + px] && isRed(b[py * COLS + px]) === (color === 'r') &&
        b[py * COLS + px].toLowerCase() === TYPE.HORSE) {
      // 马腿（相对被攻击点 (x,y)）：直向为 |Δ|=2 的方向，马腿位于该方向的中间格
      // 修复：此前用 HORSE_LEG（相对马位置）导致马腿错位 → 漏检马攻击将军
      const lx = Math.abs(dx) === 2 ? x + dx / 2 : x + dx;
      const ly = Math.abs(dy) === 2 ? y + dy / 2 : y + dy;
      if (!b[ly * COLS + lx]) return true;
    }
  }
  const redPawn = (px: number, py: number) => b[py * COLS + px] && b[py * COLS + px] === 'P';
  const blkPawn = (px: number, py: number) => b[py * COLS + px] && b[py * COLS + px] === 'p';
  if (inBoard(x, y + 1) && redPawn(x, y + 1)) return true;
  // 红兵过河（row<=4）后在同排左右横吃将帅（修复：原检查 (x±1,y+1) 漏检同排横吃将军）
  if (y <= 4) { if (inBoard(x - 1, y) && redPawn(x - 1, y)) return true; if (inBoard(x + 1, y) && redPawn(x + 1, y)) return true; }
  if (inBoard(x, y - 1) && blkPawn(x, y - 1)) return true;
  // 黑兵过河（row>=5）后在同排左右横吃将帅
  if (y >= 5) { if (inBoard(x - 1, y) && blkPawn(x - 1, y)) return true; if (inBoard(x + 1, y) && blkPawn(x + 1, y)) return true; }
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
// 残局动态价值：主力子（车马炮+过河兵）数量少 → 残局，子力价值随阶段调整
function isEndgame(b: FlatBoard): boolean {
  let main = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const t = p.toLowerCase();
    if (t === 'r' || t === 'n' || t === 'c') main += 2;
    else if (t === 'p') {
      const y = (i / COLS) | 0;
      // 过河兵也算主力（红兵 y<=4，黑兵 y>=5）
      if ((isRed(p) && y <= 4) || (!isRed(p) && y >= 5)) main += 1;
    }
  }
  return main <= 6; // 约等于"车+马"级别以下的残局
}

// 残局"理论可守和"判定：双方均无过河兵时，攻方子力不足以取胜的定式局面
// 覆盖：车 vs 车、车+马 vs 车、车 vs 单马/单炮（守方有车/轻子）、马炮/双马/双炮 vs 士象全
// 用途：此类局面评估向 0 收敛——防守方不再误判大劣而"弃车送死"（修复"车+马 vs 车"守和认知缺失）
function isDrawish(b: FlatBoard): boolean {
  let redMain = 0, blkMain = 0; // 车马炮价值
  let redPawnCross = false, blkPawnCross = false; // 过河兵
  let redShield = 0, blkShield = 0; // 士+象数量
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const t = p.toLowerCase();
    const y = (i / COLS) | 0;
    if (t === 'r' || t === 'n' || t === 'c') {
      const v = PIECE_VALUE[p] || 0;
      if (isRed(p)) redMain += v; else blkMain += v;
    } else if (t === 'a' || t === 'b') {
      if (isRed(p)) redShield++; else blkShield++;
    } else if (t === 'p') {
      if ((isRed(p) && y <= 4) || (!isRed(p) && y >= 5)) { if (isRed(p)) redPawnCross = true; else blkPawnCross = true; }
    }
  }
  if (redPawnCross || blkPawnCross) return false; // 有过河兵可求胜
  const attacker = Math.max(redMain, blkMain);
  const defender = Math.min(redMain, blkMain);
  // 守方有车：攻方 ≤ 车+马（1250）基本和（车 vs 车 / 车+马 vs 车 / 车 vs 轻子组合）
  if (defender >= 900 && attacker <= 1250) return true;
  // 攻方单车（≤900）对守方轻子（无车）：和倾向（车不胜单马/单炮；车对马炮也难速胜，守方收敛防弃车）
  if (attacker <= 900 && defender > 0) return true;
  // 守方无车有士象全：攻方 ≤ 马炮（800）难胜（马炮/双马/双炮 vs 士象全）
  const defenderShield = redMain > blkMain ? blkShield : redShield;
  if (attacker <= 800 && defenderShield >= 4) return true;
  return false;
}

function evaluate(b: FlatBoard, c: 'r' | 'b', withMobility = true): number {
  let material = 0;
  let positional = 0;
  let mobility = 0;
  let safety = 0;
  let coordination = 0;

  const endgame = isEndgame(b);
  // 区域学习偏置（自我对弈学习的"过河价值"）：learnedBias 键格式 'z_<type>_cross'/'z_<type>_home'
  const zCross: Record<string, number> = {};
  const zHome: Record<string, number> = {};
  if (learnedBias) {
    for (const k in learnedBias) {
      if (k.startsWith('z_')) {
        const parts = k.split('_'); // z_n_cross
        if (parts.length === 3) {
          const type = parts[1];
          const zone = parts[2];
          if (zone === 'cross') zCross[type] = learnedBias[k] || 0;
          else if (zone === 'home') zHome[type] = learnedBias[k] || 0;
        }
      }
    }
  }

  // 己方士相数量（将帅安全：士相掩护）与王位置
  let myAdvisors = 0, myElephants = 0;

  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const x = i % COLS, y = (i / COLS) | 0;
    const mine = isRed(p) === (c === 'r');
    const t = p.toLowerCase();
    // 基础价值 + 类型学习偏置 + 残局动态价值
    let baseVal = PIECE_VALUE[p] || 0;
    if (learnedBias) baseVal += learnedBias[t] || 0;
    if (endgame) {
      if (t === 'n') baseVal += 30;       // 残局马升
      else if (t === 'c') baseVal -= 25;  // 残局炮降
      else if (t === 'p') {
        baseVal += 25;                    // 残局兵升
        if (crossed(y, c)) baseVal += 20; // 残局过河兵是胜负手（价值再升）
      }
    }
    const pstVal = getPST(p, y, x);
    material += mine ? baseVal : -baseVal;
    positional += mine ? pstVal : -pstVal;

    // 区域学习偏置：过河/己方半场
    if (mine) {
      const zoneBonus = crossed(y, c) ? (zCross[t] || 0) : (zHome[t] || 0);
      positional += zoneBonus;
      if (t === 'a') myAdvisors += 1;
      else if (t === 'b') myElephants += 1;
    }
  }

  // 将帅安全：王居宫心加分；士相在场提供掩护
  const king = findGeneral(b, c);
  if (king >= 0) {
    const kx = king % COLS, ky = (king / COLS) | 0;
    if (kx === 4 && (ky === 8 || ky === 1)) safety += 8; // 王在宫心
  }
  safety += myAdvisors * 5 + myElephants * 5;

  // 炮有根：炮四邻有己方子掩护 +6
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p || p.toLowerCase() !== 'c' || isRed(p) !== (c === 'r')) continue;
    const x = i % COLS, y = (i / COLS) | 0;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (!inBoard(nx, ny)) continue;
      const np = b[ny * COLS + nx];
      if (np && isRed(np) === (c === 'r')) { safety += 6; break; }
    }
  }

  // 机动性评估（浅层：只计算己方；静态搜索等高频路径可关闭以提速）
  // 同时统计侵略性威胁：己方走法能攻击敌方将帅/高价值子（捉子、将军）→ 走法更有侵略性
  if (withMobility) {
    let myMobility = 0;
    for (let i = 0; i < b.length; i++) {
      if (b[i] && isRed(b[i]) === (c === 'r')) {
        myMobility += pseudoMoves(b, i).length;
      }
    }
    mobility = myMobility * 2;
    // 注：侵略性威胁分已移除——浅层搜索（4-6 层）下威胁分诱导"贪眼前将军/捉子"而失大局
    // （实测 0:12 → 5:6；保留完整机动性评估即已体现活动力价值）
  }

  // 防守评估（轻量）：无保护且被对方直接攻击的己方子 → 每子惩罚
  // 只做防守惩罚（不诱导进攻），修复"车捉马 AI 不逃"式送吃；四邻有己方子视为有保护（近似）
  if (withMobility) {
    let threatCount = 0;
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p || isRed(p) !== (c === 'r') || p.toLowerCase() === 'k') continue;
      const x = i % COLS, y = (i / COLS) | 0;
      if (!isAttacked(b, x, y, opp(c))) continue;
      let hasGuard = false;
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        const q = b[ny * COLS + nx];
        if (q && isRed(q) === (c === 'r')) { hasGuard = true; break; }
      }
      if (!hasGuard) threatCount++;
    }
    safety -= threatCount * 40;


  // 威胁检测：攻击敌方将帅周围格子（AKA - Attacking King's Adjacency）
  // 仅完整评估（withMobility）时启用：静态搜索高频路径跳过，保搜索深度
  if (withMobility) {
    const enemyKing = findGeneral(b, opp(c));
    let kingThreat = 0;
    if (enemyKing >= 0) {
      const ekx = enemyKing % COLS, eky = (enemyKing / COLS) | 0;
      for (const [dx, dy] of DIR4) {
        const nx = ekx + dx, ny = eky + dy;
        if (!inBoard(nx, ny)) continue;
        const nIdx = ny * COLS + nx;
        // 检查己方棋子是否能攻击将帅周围（围困将帅 → 将杀压力）
        for (let i = 0; i < b.length; i++) {
          const p = b[i];
          if (!p || isRed(p) !== (c === 'r')) continue;
          const moves = pseudoMoves(b, i);
          if (moves.includes(nIdx)) {
            kingThreat += 3;
            break;
          }
        }
      }
    }
    safety += kingThreat;
  }
  // 车马配合：车和马在相邻位置（攻击力增强）
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p || isRed(p) !== (c === 'r')) continue;
    if (p.toLowerCase() !== 'r') continue;
    const x = i % COLS, y = (i / COLS) | 0;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (!inBoard(nx, ny)) continue;
      const q = b[ny * COLS + nx];
      if (q && isRed(q) === (c === 'r') && q.toLowerCase() === 'n') {
        coordination += 6;
      }
    }
  }
  // 过河兵协同：多个过河兵相邻（兵阵推进更强）
  let crossedPawns = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p || p.toLowerCase() !== 'p' || isRed(p) !== (c === 'r')) continue;
    const y = (i / COLS) | 0;
    if (crossed(y, c)) {
      crossedPawns++;
      const x = i % COLS;
      // 检查相邻是否有己方过河兵
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        const q = b[ny * COLS + nx];
        if (q && q.toLowerCase() === 'p' && isRed(q) === (c === 'r') && crossed(ny, c)) {
          coordination += 4;
        }
      }
    }
  }

  // 兵型结构：过河兵兵链（斜前方己方兵互保）+ 底兵贬值
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p || p.toLowerCase() !== 'p' || isRed(p) !== (c === 'r')) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      if (crossed(y, c)) {
        const fy = c === 'r' ? y - 1 : y + 1;
        let chained = false;
        for (const dx of [-1, 1]) {
          if (inBoard(x + dx, fy) && b[fy * COLS + x + dx] && b[fy * COLS + x + dx].toLowerCase() === 'p' &&
              isRed(b[fy * COLS + x + dx]) === (c === 'r')) { chained = true; break; }
        }
        if (chained) coordination += 6;
        if (y === 0 || y === 9) positional -= 25; // 底兵贬值
      }
    }

    // 车开线价值：车所在纵线无己方其他子（开放线/半开放线——车活动与进攻要点）
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p || p.toLowerCase() !== 'r' || isRed(p) !== (c === 'r')) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      let ownOnFile = false, enemyPawnOnFile = false;
      for (let yy = 0; yy < ROWS; yy++) {
        if (yy === y) continue;
        const q = b[yy * COLS + x];
        if (!q) continue;
        if (isRed(q) === (c === 'r')) ownOnFile = true;
        else if (q.toLowerCase() === 'p') enemyPawnOnFile = true;
      }
      if (!ownOnFile) coordination += enemyPawnOnFile ? 6 : 12; // 半开线 / 全开线
    }

    // 将帅安全：将帅周围被对方攻击的格数（暴露度惩罚）
    const kg = findGeneral(b, c);
    if (kg >= 0) {
      const kx = kg % COLS, ky = (kg / COLS) | 0;
      let kExposed = 0;
      for (const [dx, dy] of DIR4) {
        const nx = kx + dx, ny = ky + dy;
        if (!inBoard(nx, ny)) continue;
        if (isAttacked(b, nx, ny, opp(c))) kExposed++;
      }
      safety -= kExposed * 15;
    }
  }

  const total = material + positional + mobility + safety + coordination;
  // 残局理论可守和：仅守方（子力少的一方）评估温和收敛 ×0.5——不再误判大劣而弃车送死；
  // 攻方不收敛——保留磨胜动力（实战残局可磨，避免消极求和）
  if (isDrawish(b)) {
    let my = 0, opp = 0;
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p.toLowerCase();
      if (t === 'r' || t === 'n' || t === 'c') {
        const v = PIECE_VALUE[p] || 0;
        if (isRed(p) === (c === 'r')) my += v; else opp += v;
      }
    }
    if (my < opp) return Math.round(total * 0.5);
  }
  return total;
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
  ply: number = 0,
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
        // 杀手着法（非吃子）：同层 beta cutoff 走法优先
        if (!cap && isKiller(ply, i, d)) score += 900000;
        // 历史着法加成（非吃子）
        if (!cap) score += historyTable[historyIndex(i, d)] || 0;
        // SEE 加成：不亏的吃子着法加分（平兑/净赚先搜，分数更准；净亏送吃排后）
        if (cap) {
          const seeScore = seeExchange(b, d, c);
          if (seeScore >= 0) score += 5000;
        }
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

// ===== 吃子走法（Quiescence 静态搜索用，MVV-LVA 排序） =====
function captureMovesOrdered(
  b: FlatBoard,
  c: 'r' | 'b',
  bestFrom: number,
  bestTo: number,
): Array<{ from: number; to: number; cap: string; score: number }> {
  const caps: Array<{ from: number; to: number; cap: string; score: number }> = [];
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (p && isRed(p) === (c === 'r')) {
      for (const d of pseudoMoves(b, i)) {
        const cap = b[d];
        if (!cap) continue; // 只保留吃子走法
        let score = mvvLvaScore(p, cap);
        if (i === bestFrom && d === bestTo) score += 1000000;
        caps.push({ from: i, to: d, cap, score });
      }
    }
  }
  caps.sort((a, z) => z.score - a.score);
  const legal: Array<{ from: number; to: number; cap: string; score: number }> = [];
  for (const m of caps) {
    const cap = applyMove(b, m.from, m.to);
    if (!isInCheck(b, c)) legal.push(m);
    undoMove(b, m.from, m.to, cap);
  }
  return legal;
}

// ===== 静态搜索（Quiescence）：叶子沿吃子链延伸，防止水平线效应（战术误判）=====
// 被将军时展开全部合法走法；否则只展开吃子走法；无应手且被将军 → 将死
function quiescence(
  b: FlatBoard,
  c: 'r' | 'b',
  alpha: number,
  beta: number,
  ply: number,
  hash: number,
  qDepth = 0,
  fullStand = true,
): number {
  checkTimeout();
  // 静态搜索 TT 缓存（仅精确值，且不与高层搜索条目冲突：qsearch 存 depth=0）
  const qtt = ttProbe(hash);
  if (qtt && qtt.depth === 0 && qtt.flag === TT_EXACT) return qtt.score;
  // 深度保护：静态搜索最多延伸 4 层吃子链（防爆炸，且足够覆盖大部分战术）
  if (qDepth >= 4) return evaluate(b, c, fullStand);
  // stand-pat：完整评估（机动性价值），吃子链深层用轻量评估提速
  const stand = evaluate(b, c, fullStand);
  if (stand >= beta) {
    ttStore(hash, stand, 0, TT_BETA, -1, -1);
    return beta;
  }
  if (stand > alpha) alpha = stand;

  const inCheck = isInCheck(b, c);
  // 被将军：展开全部合法走法；否则只展开吃子走法
  const moves = inCheck ? legalMovesOrdered(b, c, -1, -1) : captureMovesOrdered(b, c, -1, -1);
  if (moves.length === 0) {
    return inCheck ? -(MATE - ply) : stand; // 被将死 / 站稳
  }

  let best = stand;
  for (const m of moves) {
    // delta 裁剪：吃子价值都救不回 alpha → 跳过（吃子最大收益约 900 分）
    if (!inCheck) {
      const gain = (PIECE_VALUE[m.cap] || 0) + 50;
      if (stand + gain < alpha) continue;
    }
    const cap = applyMove(b, m.from, m.to);
    // 更新哈希
    const pi = pieceZobristIndex(b[m.to]);
    const capPi = cap ? pieceZobristIndex(cap) : -1;
    let newHash = hash;
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.to];
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.from];
    if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to];
    newHash ^= ZOBRIST_SIDE[0];
    let score: number;
    try {
      score = -quiescence(b, opp(c), -beta, -alpha, ply + 1, newHash, qDepth + 1, false);
    } catch (e) {
      // 超时异常：必须先恢复棋盘再上抛，防止污染后续走子
      undoMove(b, m.from, m.to, cap);
      throw e;
    }
    undoMove(b, m.from, m.to, cap);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  const qFlag = best <= stand ? TT_ALPHA : TT_EXACT;
  ttStore(hash, best, 0, qFlag, -1, -1);
  return best;
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

  // 到达深度 → 静态搜索（吃子延伸，防止战术误判）
  if (depth <= 0) {
    return quiescence(b, c, alpha, beta, ply, hash);
  }

  // 空着裁剪（只在优势局面且非底线时使用；无主力子时禁用，防困毙误判）
  const hasNullPotential = (() => {
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p.toLowerCase();
      if (t === 'r' || t === 'n' || t === 'c') return true;
      if (t === 'p') {
        const y = (i / COLS) | 0;
        if ((isRed(p) && y <= 4) || (!isRed(p) && y >= 5)) return true;
      }
    }
    return false;
  })();
  if (allowNull && depth >= 3 && !isInCheck(b, c) && hasNullPotential) {
    // 简单空着：跳过一步，让对手走（换边只异或一次 SIDE[0]）
    const nullHash = hash ^ ZOBRIST_SIDE[0];
    const R = 2; // 空着裁剪深度减 2（深层 R=3 实测 hard 误剪降棋力，保持 2 安全）
    const score = -negamax(b, opp(c), depth - 1 - R, -beta, -beta + 1, ply + 1, false, nullHash);
    if (score >= beta) {
      return beta; // fail high
    }
  }

  // 生成着法并排序（传入 ply 用于杀手着法查询）
  const moves = legalMovesOrdered(b, c, ttBestFrom, ttBestTo, ply);
  if (moves.length === 0) {
    // 将死或困毙
    return -(MATE - ply);
  }

  let bestScore = -INF;
  let bestFrom = moves[0].from;
  let bestTo = moves[0].to;
  let originalAlpha = alpha;
  // 预计算静态评估（仅 Futility 剪枝需要；被将军时不裁剪——必须处理将军）
  const staticEval = !isInCheck(b, c) ? evaluate(b, c, false) : NaN;

  // PVS：首着全窗口，其余零窗口试探（提速 20-40%）；配合 LMR 晚走法缩减与将军延伸
  for (let idx = 0; idx < moves.length; idx++) {
    const m = moves[idx];
    // Futility 剪枝：浅层非吃子走法，静态评估+裕量仍低于 alpha → 本走法无望翻盘，跳过
    // （在 applyMove 前判断，不落子不污染棋盘；被将军时跳过裁剪保证应将搜索完整）
    if (
      depth <= 2 &&
      !m.cap &&
      !isInCheck(b, c) &&
      idx >= 3 &&
      staticEval + (260 + 180 * depth) < alpha
    ) {
      continue;
    }
    const cap = applyMove(b, m.from, m.to);
    // 将军延伸：走子后将军对方 → 搜索深度不减（战术序列更准确）
    const givesCheck = isInCheck(b, opp(c));
    // 晚走法裁剪 LMP：浅层超晚的非吃子、非将军走法直接跳过（标准技术，不依赖历史分）
    // 公式 idx >= 4 + depth*depth*2：depth1→6、depth2→12、depth3→22——只裁"几乎不可能成为最优"的末尾走法
    if (
      depth <= 3 &&
      !m.cap &&
      !givesCheck &&
      !(m.from === ttBestFrom && m.to === ttBestTo) &&
      !isKiller(ply, m.from, m.to) &&
      idx >= 4 + depth * depth * 2
    ) {
      undoMove(b, m.from, m.to, cap);
      continue;
    }
    // 更新哈希
    const pi = pieceZobristIndex(b[m.to]);
    const capPi = cap ? pieceZobristIndex(cap) : -1;
    let newHash = hash;
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.to];
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.from];
    if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to];
    newHash ^= ZOBRIST_SIDE[0];
    const extension = givesCheck && depth >= 4 ? 1 : 0;

    // LMR 晚走法缩减：中后段非吃子、非 TT 最佳、非将军走法降 1 层，超 alpha 再全深度重搜
    const isTtBest = m.from === ttBestFrom && m.to === ttBestTo;
    let searchDepth = depth - 1 + extension;
    let reduced = false;
    if (depth >= 2 && !m.cap && !isTtBest && !givesCheck && idx >= 2) {
      // 深分支更激进：降 2 层（浅层降 1 层）；超 alpha 后全深度重搜兜底，保证正确性
      const reduceBy = depth >= 4 ? 2 : 1;
      searchDepth = depth - 1 - reduceBy + extension;
      reduced = true;
    }

    let score: number;
    try {
      if (idx === 0) {
        // PVS 首着：全窗口
        score = -negamax(b, opp(c), searchDepth, -beta, -alpha, ply + 1, true, newHash);
      } else {
        // PVS 其余：零窗口（null-window scout）
        score = -negamax(b, opp(c), searchDepth, -alpha - 1, -alpha, ply + 1, true, newHash);
        if (score > alpha) {
          if (reduced) {
            // LMR 缩减后超 alpha → 必须全深度重搜
            score = -negamax(b, opp(c), depth - 1 + extension, -beta, -alpha, ply + 1, true, newHash);
          } else if (score < beta) {
            // 零窗口试探失败（alpha < score < beta）→ 全窗口重搜
            score = -negamax(b, opp(c), searchDepth, -beta, -alpha, ply + 1, true, newHash);
          }
          // score >= beta（非缩减）：零窗口已 fail high，直接用该分数触发截断
        }
      }
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
      // Beta cutoff → 更新历史表和杀手着法
      if (!m.cap) {
        historyTable[historyIndex(m.from, m.to)] += depth * depth * (givesCheck ? 3 : 2);
        storeKiller(ply, m.from, m.to);
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

/** 职业段位映射：对应中国象棋协会等级标准 */
export const DIFFICULTY_RANK: Record<XiangqiAIDifficulty, { label: string; elo: number; description: string }> = {
  easy:   { label: '业余初级', elo: 600,  description: '会基本走法，偶有失误，适合入门学习' },
  medium: { label: '业余中等', elo: 1000, description: '懂基本战术，能识破简单陷阱，适合进阶训练' },
  hard:   { label: '业余高级', elo: 1450, description: '战术意识强，开局规范，适合挑战提高' },
  master: { label: '大师级',   elo: 2000, description: '深度搜索+全局评估，接近专业水平' },
};

const DIFFICULTY: Record<XiangqiAIDifficulty, { depth: number; timeMs: number; noise: number; variety: number }> = {
  easy:   { depth: 2, timeMs: 400,  noise: 0, variety: 70 },
  // 深度上限（A/B 实测：medium d5 思考过头+超时致 1:3 和 4、hard d7/master d10 无提升——保持现档，
  // 棋力提升靠评估增强与开局库）
  medium: { depth: 4, timeMs: 1200, noise: 0, variety: 30 },
  hard:   { depth: 6, timeMs: 4000, noise: 0,  variety: 14 },
  master: { depth: 9, timeMs: 8000, noise: 0, variety: 0  },
};

/**
 * 计算 AI 最佳着法
 */
export function xiangqiBestMove(
  board: XiangqiBoard,
  color: XiangqiColor,
  difficulty: XiangqiAIDifficulty = 'medium',
  weights?: Record<string, number> | null,
  ply?: number | null,
): XiangqiSquare[] | null {
  if (weights) learnedBias = weights;
  // 开局阶段优先走开局库着法（规范开局，孩子可学到标准套路）；着法不合法自动回退搜索
  if (ply != null && ply < 8) {
    const book = getOpeningMove(ply, color, board);
    if (book && isXiangqiMoveLegal(board, book[0], book[1], color)) {
      return book;
    }
  }
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  deadline = Date.now() + cfg.timeMs;
  nodeCount = 0;

  // 清空置换表（每步清空避免污染——实测跨步保留在 master 深度搜索下反而降低吞吐，保持清空策略）
  transTable = new Array(TT_SIZE);
  // 历史表温和衰减（×0.85）：原每步减半导致跨步累积不起来、排序质量差、剪枝效率低；
  // 温和衰减让"整局内多次出现的良着"持续获得排序加成（历史裁剪阈值配合此口径）
  for (let i = 0; i < historyTable.length; i++) historyTable[i] = Math.floor(historyTable[i] * 0.85);
  // 清空杀手着法表
  for (let i = 0; i < MAX_KILLER_PLY; i++) {
    killerMoves[i] = [[-1, -1], [-1, -1]];
  }

  const b = toFlat(board);
  const c: 'r' | 'b' = color;
  const initialHash = computeHash(b, c);

  // 先获取所有合法着法
  const firstMoves = legalMovesOrdered(b, c, -1, -1);
  if (firstMoves.length === 0) return null;

  let best: { from: number; to: number } | null = null;
  let bestScore = -INF;
  const begin = Date.now();
  // 记录最近完整一层所有着法的分数，用于结束时做近分加权随机（走法多样化）
  let scoredLevel: Array<{ from: number; to: number; score: number }> = [];

  // 迭代加深
  let prevScore = 0;
  for (let d = 1; d <= cfg.depth; d++) {
    scoredLevel.length = 0; // 每层清空：variety 随机只用"当前完整层"的搜索分数（防止浅层数据污染）
    let curBest: { from: number; to: number } | null = null;
    let curScore = -INF;
    let alpha = -INF, beta = INF, timedOut = false;

    // Aspiration 期望窗口：第 3 层起以上一层分数为中心的窄窗口搜索（着法排序良好时显著提速 → 同时间内看更多步）
    // 窗口内搜索失败（fail low/high）时用全窗口重搜兜底，保证正确性（fail 判定用"搜索时窗口"，不丢 fail-high 近似值）
    // 注意：Aspiration 与置换表存在 bound 污染风险（窄窗口条目被后续全窗口搜索误用），对弈实测 hard 1:7 崩坏，
    // 故本版保持关闭（性能收益不足以抵消正确性风险）
    let aspiration = false;
    if (false && d >= 3 && Math.abs(prevScore) < MATE * 0.5) {
      const delta = 120;
      alpha = prevScore - delta;
      beta = prevScore + delta;
      aspiration = true;
    }

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

      let score: number;
      try {
        // 记录搜索时的窗口（循环中 alpha 会更新，fail 判定必须用搜索时窗口）
        const winAlpha = alpha, winBeta = beta;
        score = -negamax(b, opp(c), d - 1, -winBeta, -winAlpha, 1, true, newHash);
        // Aspiration 失败：分数落在窄窗口外 → 用全窗口重搜本走法（保证分数正确，不丢 fail-high/fail-low）
        if (aspiration && (score <= winAlpha || score >= winBeta)) {
          score = -negamax(b, opp(c), d - 1, -INF, INF, 1, true, newHash);
        }
      } catch {
        timedOut = true;
        undoMove(b, m.from, m.to, cap);
        break;
      }
      undoMove(b, m.from, m.to, cap);

      // 同分时优先吃子/兑子走法，但仅当 SEE 为正（白赚/净赚）——避免"分数扁平时吃子送死"
      // （SEE 已按平兑链修正：被回吃净亏的吃子 SEE<0 不再优先）
      const curHadCap = curBest ? !!(b[curBest.to]) : false;
      // 同分吃子优先：仅 master（variety=0，深搜分数准确）附加 SEE>=0 防送吃；
      // medium/hard 浅层分数扁平、靠吃子累积优势，若加 SEE 条件会抑制大量正常吃子导致棋力崩（实测 0:7）
      const masterStrict = cfg.variety === 0;
      if (score > curScore || (score === curScore && m.cap && !curHadCap && (!masterStrict || seeExchange(b, m.to, c) >= 0))) {
        curScore = score;
        curBest = { from: m.from, to: m.to };
      }
      if (curScore > alpha) alpha = curScore;
      // 收集本层着法分数（供最终加权随机）
      scoredLevel.push({ from: m.from, to: m.to, score });
    }

    if (!timedOut && curBest) {
      best = curBest;
      bestScore = curScore;
      prevScore = curScore;
    } else {
      break; // 超时，用上次结果
    }
    // 时间用完 90% 就停止加深
    if (Date.now() - begin > cfg.timeMs * 0.85) break;
  }

  if (!best) {
    best = { from: firstMoves[0].from, to: firstMoves[0].to };
  }

  // 走法多样化：在分数接近最优的着法中加权随机（避免每局千篇一律、应对更灵活）
  // 注：低难度"放水"由 variety 的搜索分数窗口承担——此前 noise 从启发排序（非搜索排序）前 N 个乱选，
  // 实测会走出明显烂棋（"走棋不合理/不思考"主因）；删 noise 后放水是"次优但合理"着法
  // 仅限非必胜/非必败局面，且本层搜索完整未超时
  if (
    cfg.variety > 0 &&
    Math.abs(bestScore) < MATE * 0.5 &&
    scoredLevel.length > 1
  ) {
    const bestS = Math.max(...scoredLevel.map((x) => x.score));
    const window = cfg.variety;
    const candidates = scoredLevel.filter((x) => bestS - x.score <= window);
    if (candidates.length > 1) {
      // 权重：越接近最优权重越高（线性映射 [1, 10]）
      const weights = candidates.map((x) => Math.max(1, 10 - (bestS - x.score) * 0.16));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          best = { from: candidates[i].from, to: candidates[i].to };
          bestScore = candidates[i].score;
          break;
        }
      }
    }
  }

  return [
    [(best.from / COLS) | 0, best.from % COLS],
    [(best.to / COLS) | 0, best.to % COLS],
  ];
}

