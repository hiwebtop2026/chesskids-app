/**
 * ChessKids - 五子棋 AI 引擎
 * 模式评分（活四/冲四/活三/眠三/活二…）+ 进攻防守双向评估
 * 难度分级：easy=贪心 / medium=深度2 / hard=深度3 / master=深度4（alpha-beta + 启发排序）
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
  { key: 'easy', label: '简单', depth: 0, desc: '初级水平：只看眼前一步，适合刚入门的小朋友' },
  { key: 'medium', label: '中等', depth: 2, desc: '会看两步棋，能挡住你的冲四与活三' },
  { key: 'hard', label: '困难', depth: 3, desc: '三步推算 + 攻守兼顾，需要认真思考才能赢' },
  { key: 'master', label: '大师', depth: 4, desc: '四步深算 + 强攻型评估，向高手水平看齐' },
];

// ============ 方向 ============
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

const inBoard = (r: number, c: number) => r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE;

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
  // 无子时返回天元附近（先手开局）
  if (list.length === 0) return [[7, 7]];
  return list;
}

/** 评估单点在四个方向上的连子模式分（color 视角） */
function pointScore(b: GomokuBoard, r: number, c: number, color: GomokuColor): number {
  let total = 0;
  for (const [dr, dc] of DIRS) {
    total += lineScore(b, r, c, dr, dc, color);
  }
  return total;
}

/**
 * 沿方向统计 (r,c) 向两端延伸的同色子数及两端状态，返回模式分
 * 模式：活四 > 冲四 > 活三 > 眠三 > 活二 > 眠二 > 单子
 */
function lineScore(b: GomokuBoard, r: number, c: number, dr: number, dc: number, color: GomokuColor): number {
  // 连续同色子数（含 (r,c) 本身）
  let count = 1;
  let openEnds = 0;
  // 正方向
  {
    let nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc) && b[nr][nc] === color) { count++; nr += dr; nc += dc; }
    if (inBoard(nr, nc) && b[nr][nc] === '') openEnds++;
  }
  // 负方向
  {
    let nr = r - dr, nc = c - dc;
    while (inBoard(nr, nc) && b[nr][nc] === color) { count++; nr -= dr; nc -= dc; }
    if (inBoard(nr, nc) && b[nr][nc] === '') openEnds++;
  }
  if (count >= 5) return 1000000;
  if (openEnds === 0) return 0;          // 两端都被堵死
  if (openEnds === 2) {
    if (count === 4) return 100000;      // 活四
    if (count === 3) return 10000;       // 活三
    if (count === 2) return 1000;        // 活二
    return 100;
  }
  // openEnds === 1
  if (count === 4) return 50000;         // 冲四（眠四）
  if (count === 3) return 5000;          // 眠三
  if (count === 2) return 500;           // 眠二
  return 50;
}

/** 全局面评估（color 视角）：己方模式分 ×1.0 + 对方模式分 ×1.1（防守略重） */
export function evaluateGomoku(b: GomokuBoard, color: GomokuColor): number {
  let mine = 0;
  let theirs = 0;
  const n = GOMOKU_SIZE;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = b[r][c];
      if (cell === color) mine += pointScore(b, r, c, color);
      else if (cell !== '') theirs += pointScore(b, r, c, cell);
    }
  }
  return mine - theirs * 1.1;
}

/** 启发排序：候选按"落此子进攻分+防守分"降序 */
function orderedCandidates(b: GomokuBoard, color: GomokuColor): Array<[number, number]> {
  const cands = gomokuCandidates(b);
  const scored = cands.map(([r, c]) => {
    // 进攻分（我落此子）+ 防守分（对方落此子的威胁）
    const atk = pointScore(b, r, c, color);
    const def = pointScore(b, r, c, color === 'b' ? 'w' : 'b');
    return { r, c, v: atk + def * 1.05 + Math.random() * 0.001 };
  });
  scored.sort((a, b2) => b2.v - a.v);
  return scored.map((s) => [s.r, s.c] as [number, number]);
}

/** alpha-beta 搜索 */
function search(
  b: GomokuBoard,
  color: GomokuColor,       // 当前轮到的一方（评估视角始终是根节点 color）
  depth: number,
  alpha: number,
  beta: number,
  rootColor: GomokuColor,
): number {
  // 深度 0 或棋盘满：静态评估
  const cands = gomokuCandidates(b);
  if (depth === 0 || cands.length === 0) return evaluateGomoku(b, rootColor);

  // 快速胜负检测：若存在一步即胜，直接返回极值
  if (depth >= 1) {
    const opp = color === 'b' ? 'w' : 'b';
    for (const [r, c] of cands) {
      const nb = gomokuPlaceStone(b, r, c, color);
      if (nb && checkGomokuWin(nb, r, c, color)) return rootColor === color ? 100000000 - depth : -100000000 + depth;
    }
    // 对方一步即胜（我必须堵）：若有多处冲四则必输
    for (const [r, c] of cands) {
      const nb = gomokuPlaceStone(b, r, c, opp);
      if (nb && checkGomokuWin(nb, r, c, opp)) {
        // 只能堵住其中一处；若对方还有其它一步胜则输——粗略按-1000000*数量处理
        return rootColor === color ? -1000000 : 1000000;
      }
    }
  }

  const ordered = orderedCandidates(b, color);
  // 限制分支：master/hard 取前 12，medium 取 10（easy 不搜索）
  const limit = depth >= 3 ? 12 : 10;
  const picks = ordered.slice(0, limit);

  let best = -Infinity;
  for (const [r, c] of picks) {
    const nb = gomokuPlaceStone(b, r, c, color)!;
    const v = -search(nb, color === 'b' ? 'w' : 'b', depth - 1, -beta, -alpha, rootColor);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** 五子棋最佳落子（按难度） */
export function gomokuBestMove(board: GomokuBoard, color: GomokuColor, diff: GomokuDifficulty): [number, number] | null {
  const cands = gomokuCandidates(board);
  if (cands.length === 0) return null;

  // easy：贪心（进攻+防守评分），带少量随机
  if (diff.depth === 0) {
    const scored = cands.map(([r, c]) => {
      const atk = pointScore(board, r, c, color);
      const def = pointScore(board, r, c, color === 'b' ? 'w' : 'b');
      return { r, c, v: atk + def * 0.9 + Math.random() * 0.05 };
    });
    scored.sort((a, b2) => b2.v - a.v);
    return [scored[0].r, scored[0].c];
  }

  // 直接一步制胜检测
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

  let bestMove: [number, number] = cands[0];
  let bestVal = -Infinity;
  const ordered = orderedCandidates(board, color);
  const picks = ordered.slice(0, diff.depth >= 3 ? 14 : 12);
  for (const [r, c] of picks) {
    const nb = gomokuPlaceStone(board, r, c, color)!;
    const v = -search(nb, opp, diff.depth - 1, -Infinity, Infinity, color);
    if (v > bestVal) { bestVal = v; bestMove = [r, c]; }
  }
  return bestMove;
}

/** 提示：用 hard 深度计算一着 */
export function gomokuHintMove(board: GomokuBoard, color: GomokuColor): [number, number] | null {
  return gomokuBestMove(board, color, { key: 'hard', label: '困难', depth: 3, desc: '' });
}

/** 简单局面终局判定（供模块复用） */
export function isGomokuOver(board: GomokuBoard): boolean {
  return isGomokuBoardFull(board);
}
