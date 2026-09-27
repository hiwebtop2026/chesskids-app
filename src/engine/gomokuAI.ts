/**
 * ChessKids - 五子棋 AI 引擎（v2 增强版）
 *
 * 核心升级（相对 v1）：
 * 1. 威胁组合评估：识别"活四/双活三/冲四+活三/双冲四"等必胜组合，
 *    并优先制造/防守此类杀棋（传统单点求和会低估双威胁的价值）
 * 2. 时间预算：master 深度搜索带 deadline，超时自动降级，避免 19 路卡顿
 * 3. 难度分层更明确：easy=贪心随机 / medium=深度2 防守 / hard=深度3 攻守 /
 *    master=深度4 + 必胜组合优先
 * 保留特性：先手/首手随机（候选点池）、中盘并列最高分随机、easy 随机扰动
 */

import {
  GOMOKU_SIZE, type GomokuBoard, type GomokuColor,
  gomokuPlaceStone, checkGomokuWin, isGomokuBoardFull,
} from './gomoku';

export interface GomokuDifficulty {
  key: 'easy' | 'medium' | 'hard' | 'master';
  label: string;
  depth: number;
  desc: string;
}

export const GOMOKU_DIFFICULTIES: GomokuDifficulty[] = [
  { key: 'easy', label: '简单', depth: 0, desc: '初级水平：只看眼前一步，偶尔会失误，适合刚入门的小朋友' },
  { key: 'medium', label: '中等', depth: 2, desc: '会看两步棋，能挡住你的冲四与活三，防守稳健' },
  { key: 'hard', label: '困难', depth: 3, desc: '三步推算 + 攻守兼顾，会主动做棋制造杀形' },
  { key: 'master', label: '大师', depth: 4, desc: '四步深算 + 必胜组合识别，向高手水平看齐' },
];

// ============ 方向 ============
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

const inBoard = (r: number, c: number) => r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE;

// ============ 候选 ============

/** 获取候选空位：已有棋子周围 2 格范围内的空点（控制搜索规模） */
export function gomokuCandidates(b: GomokuBoard): Array<[number, number]> {
  const n = GOMOKU_SIZE;
  const cand = new Set<string>();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] === '') continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (inBoard(nr, nc) && b[nr][nc] === '') cand.add(`${nr},${nc}`);
        }
      }
    }
  }
  const list: Array<[number, number]> = [];
  for (const s of cand) {
    const [rr, cc] = s.split(',').map(Number);
    list.push([rr, cc]);
  }
  // 无子时：从开局候选点随机选一个（先手/首手不固定不变）
  if (list.length === 0) {
    const ALL_OPENING: Array<[number, number]> = [
      [9, 9], [8, 8], [8, 9], [8, 10], [9, 8], [9, 10], [10, 8], [10, 9], [10, 10],
      [7, 7], [11, 11], [9, 7], [7, 9], [11, 9], [9, 11], [9, 5], [5, 9], [13, 9], [9, 13],
    ];
    const OPENING: Array<[number, number]> = ALL_OPENING.filter(([r, c]) => inBoard(r, c));
    const pick = OPENING[Math.floor(Math.random() * OPENING.length)];
    return [[pick[0], pick[1]]];
  }
  return list;
}

// ============ 威胁评估（v2 核心） ============

interface LineInfo {
  count: number;   // 该方向通过 (r,c) 的连续同色子数（含 (r,c)）
  openEnds: number; // 两端开放端数 0/1/2
}

/** 沿方向统计通过 (r,c) 的连子长度与两端状态 */
function countLine(b: GomokuBoard, r: number, c: number, dr: number, dc: number, color: GomokuColor): LineInfo {
  let count = 1;
  let openEnds = 0;
  {
    let nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc) && b[nr][nc] === color) { count++; nr += dr; nc += dc; }
    if (inBoard(nr, nc) && b[nr][nc] === '') openEnds++;
  }
  {
    let nr = r - dr, nc = c - dc;
    while (inBoard(nr, nc) && b[nr][nc] === color) { count++; nr -= dr; nc -= dc; }
    if (inBoard(nr, nc) && b[nr][nc] === '') openEnds++;
  }
  return { count, openEnds };
}

// 单线分值（未加组合加成）
const LINE_VALUE = (L: LineInfo): number => {
  if (L.count >= 5) return 10_000_000;
  if (L.openEnds === 0) return 0;                 // 两端堵死
  if (L.count === 4) return L.openEnds === 2 ? 1_000_000 : 200_000; // 活四 / 冲四
  if (L.count === 3) return L.openEnds === 2 ? 50_000 : 10_000;     // 活三 / 眠三
  if (L.count === 2) return L.openEnds === 2 ? 5_000 : 1_000;       // 活二 / 眠二
  return 100;
};

/**
 * 落子点威胁评分（color 视角）：
 * 单线分求和 + 组合威胁（双活三/四三/双冲四/活四 = 对手无法同时化解的必胜杀形）
 */
function pointScore(b: GomokuBoard, r: number, c: number, color: GomokuColor): number {
  const lines = DIRS.map(([dr, dc]) => countLine(b, r, c, dr, dc, color));
  if (lines.some((L) => L.count >= 5)) return 10_000_000;

  let total = 0;
  let fours = 0;      // 四子线数（含活四/冲四）
  let openFours = 0;  // 活四
  let threes = 0;     // 三子线数（含活三/眠三）
  let openThrees = 0; // 活三
  let openTwos = 0;   // 活二
  for (const L of lines) {
    if (L.openEnds === 0) continue;
    total += LINE_VALUE(L);
    if (L.count === 4) { fours++; if (L.openEnds === 2) openFours++; }
    else if (L.count === 3) { threes++; if (L.openEnds === 2) openThrees++; }
    else if (L.count === 2 && L.openEnds === 2) openTwos++;
  }

  // ---- 组合威胁（对手只能挡一处 → 必胜级） ----
  if (openFours >= 1) return 1_200_000;                // 活四：下一步必成五
  if (fours >= 2) return 1_100_000;                    // 双冲四
  if (fours >= 1 && threes >= 1) return 900_000;       // 冲四 + 活三/眠三（四三杀）
  if (openThrees >= 2) return 800_000;                 // 双活三
  if (openThrees >= 1 && threes >= 2) return 700_000;  // 活三 + 眠三
  if (openTwos >= 2) total += 20_000;                  // 双活二（做棋苗头）

  return total;
}

/**
 * 线级威胁扫描（v3）：统计 color 在行/列/两向对角上的"整条连段"威胁。
 * 传统"点级求和"会把同一条活三线上的 3 个子拆成 3 份计分，且难以体现
 * 斜向长线做棋的累积价值；线级评估直接按"段长+两端状态"计分，
 * 能更早捕捉玩家沿对角逐步做棋的威胁。
 */
function lineSum(b: GomokuBoard, color: GomokuColor): number {
  const n = GOMOKU_SIZE;
  let total = 0;
  const seen = new Set<string>();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] !== color) continue;
      for (const [dr, dc] of DIRS) {
        const key = `${r},${c},${dr},${dc}`;
        if (seen.has(key)) continue;
        // 回溯到该段起点
        let sr = r, sc = c;
        while (inBoard(sr - dr, sc - dc) && b[sr - dr][sc - dc] === color) { sr -= dr; sc -= dc; }
        // 沿方向统计段长
        let len = 0, or = sr, oc = sc;
        const keys: string[] = [];
        while (inBoard(or, oc) && b[or][oc] === color) {
          len++; keys.push(`${or},${oc},${dr},${dc}`);
          or += dr; oc += dc;
        }
        const openL = inBoard(sr - dr, sc - dc) && b[sr - dr][sc - dc] === '' ? 1 : 0;
        const openR = inBoard(or, oc) && b[or][oc] === '' ? 1 : 0;
        for (const k of keys) seen.add(k);
        total += LINE_VALUE({ count: len, openEnds: openL + openR });
      }
    }
  }
  return total;
}

/** 全局面评估（v3）：线级威胁 + 点级交叉组合加成，防守系数 1.18 */
export function evaluateGomoku(b: GomokuBoard, color: GomokuColor): number {
  const opp = color === 'b' ? 'w' : 'b';
  const n = GOMOKU_SIZE;
  let mine = lineSum(b, color);
  let theirs = lineSum(b, opp);
  // 交叉组合加成：某点同时形成多条线威胁（活四/双冲四/四三/双活三）→ 必胜级加分
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = b[r][c];
      if (cell === color) { if (pointScore(b, r, c, color) >= 800_000) mine += 900_000; }
      else if (cell !== '') { if (pointScore(b, r, c, cell) >= 800_000) theirs += 900_000; }
    }
  }
  return mine - theirs * 1.18;
}

/** 启发排序：候选按"落此子进攻分+防守分"降序 */
function orderedCandidates(b: GomokuBoard, color: GomokuColor): Array<[number, number]> {
  const cands = gomokuCandidates(b);
  const scored = cands.map(([r, c]) => {
    const atk = pointScore(b, r, c, color);
    const def = pointScore(b, r, c, color === 'b' ? 'w' : 'b');
    return { r, c, v: atk + def * 1.25 + Math.random() * 0.001 };
  });
  scored.sort((a, b2) => b2.v - a.v);
  return scored.map((s) => [s.r, s.c] as [number, number]);
}

// ============ 搜索 ============

/**
 * alpha-beta 搜索（带时间预算）
 * @param deadline 性能上限（ms 时间戳）；超时返回当前层静态评估（浅层解）
 */
function search(
  b: GomokuBoard,
  color: GomokuColor,
  depth: number,
  alpha: number,
  beta: number,
  rootColor: GomokuColor,
  deadline: number,
): number {
  if (performance.now() > deadline) return evaluateGomoku(b, rootColor);

  const cands = gomokuCandidates(b);
  if (depth === 0 || cands.length === 0) return evaluateGomoku(b, rootColor);

  // 快速胜负检测：一步即胜
  if (depth >= 1) {
    const opp = color === 'b' ? 'w' : 'b';
    for (const [r, c] of cands) {
      const nb = gomokuPlaceStone(b, r, c, color);
      if (nb && checkGomokuWin(nb, r, c, color)) return rootColor === color ? 100_000_000 - depth : -100_000_000 + depth;
    }
    // 对方一步即胜（必须堵）
    for (const [r, c] of cands) {
      const nb = gomokuPlaceStone(b, r, c, opp);
      if (nb && checkGomokuWin(nb, r, c, opp)) {
        return rootColor === color ? -1_000_000 : 1_000_000;
      }
    }
  }

  const ordered = orderedCandidates(b, color);
  const limit = depth >= 3 ? 16 : 12;
  const picks = ordered.slice(0, limit);

  let best = -Infinity;
  for (const [r, c] of picks) {
    const nb = gomokuPlaceStone(b, r, c, color)!;
    const v = -search(nb, color === 'b' ? 'w' : 'b', depth - 1, -beta, -alpha, rootColor, deadline);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// ============ 对外主入口 ============

/** 五子棋最佳落子（按难度） */
export function gomokuBestMove(board: GomokuBoard, color: GomokuColor, diff: GomokuDifficulty): [number, number] | null {
  const cands = gomokuCandidates(board);
  if (cands.length === 0) return null;

  // easy：贪心（进攻+防守评分），带明显随机，水平弱但有变化
  if (diff.depth === 0) {
    const scored = cands.map(([r, c]) => {
      const atk = pointScore(board, r, c, color);
      const def = pointScore(board, r, c, color === 'b' ? 'w' : 'b');
      return { r, c, v: atk + def * 0.9 + Math.random() * 0.3 };
    });
    scored.sort((a, b2) => b2.v - a.v);
    return [scored[0].r, scored[0].c];
  }

  // 一步制胜
  for (const [r, c] of cands) {
    const nb = gomokuPlaceStone(board, r, c, color);
    if (nb && checkGomokuWin(nb, r, c, color)) return [r, c];
  }
  // 必须防守：对方一步胜
  const opp = color === 'b' ? 'w' : 'b';
  for (const [r, c] of cands) {
    const nb = gomokuPlaceStone(board, r, c, opp);
    if (nb && checkGomokuWin(nb, r, c, opp)) return [r, c];
  }

  // 我方组合威胁：本手能直接形成必胜组合（活四/双冲四/四三/双活三）→ 优先走出
  if (diff.depth >= 3) {
    for (const [r, c] of cands) {
      const v = pointScore(board, r, c, color);
      if (v >= 800_000) return [r, c];
    }
  }

  // v3 关键：对方"落子即形成必胜组合"的威胁点必须提前堵（组合级必防，
  // 比"一步成五"更早——玩家做对角/双线时往往先形成组合威胁再成五）
  if (diff.depth >= 2) {
    const threats: Array<[number, number]> = [];
    for (const [r, c] of cands) {
      if (pointScore(board, r, c, opp) >= 800_000) threats.push([r, c]);
    }
    if (threats.length > 0) {
      // 多个威胁无法全堵时，选防守后己方局面最优者
      const scored = threats.map(([r, c]) => ({
        r, c, v: pointScore(board, r, c, color) + pointScore(board, r, c, opp) + Math.random() * 0.001,
      }));
      scored.sort((a, b2) => b2.v - a.v);
      return [scored[0].r, scored[0].c];
    }
  }

  // 深度搜索：master 迭代加深（1→depth，超时保留最近完成的完整层，避免浅层降级）
  const budgetMs = diff.key === 'master' ? 2600 : diff.key === 'hard' ? 1400 : 900;
  const t0 = performance.now();
  const picks = orderedCandidates(board, color).slice(0, diff.depth >= 3 ? 16 : 12);
  let bestMoves: Array<[number, number]> = [];
  for (let d = 1; d <= diff.depth; d++) {
    const deadline = t0 + budgetMs * (d / diff.depth);
    let bv = -Infinity;
    const bm: Array<[number, number]> = [];
    for (const [r, c] of picks) {
      if (performance.now() > deadline) break;
      const nb = gomokuPlaceStone(board, r, c, color)!;
      const v = -search(nb, opp, d - 1, -Infinity, Infinity, color, deadline);
      if (v > bv) { bv = v; bm.length = 0; bm.push([r, c]); }
      else if (v === bv) { bm.push([r, c]); }
    }
    if (bm.length > 0) bestMoves = bm;
    if (performance.now() > t0 + budgetMs) break;
  }
  if (bestMoves.length === 0) return picks[0] as [number, number];
  // 并列最高分时随机选择：同一局面不同对局 AI 落子位置不固定
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

/** 提示：用 hard 深度计算一着 */
export function gomokuHintMove(board: GomokuBoard, color: GomokuColor): [number, number] | null {
  return gomokuBestMove(board, color, { key: 'hard', label: '困难', depth: 3, desc: '' });
}

/** 简单局面终局判定（供模块复用） */
export function isGomokuOver(board: GomokuBoard): boolean {
  return isGomokuBoardFull(board);
}
