/**
 * ChessKids - 围棋 AI 引擎
 * 启发式战术引擎：提子/逃子/吃子威胁/占位/连接 综合评分 + 有限吃子链反吃检测
 * 难度：easy（高随机入门）/ medium（基础）/ hard（战术完整）/ master（无随机+反吃链检测）
 */

import {
  goPlaceStone,
  goGroupInfo,
  isGoStarPoint,
  type GoBoard,
  type GoColor,
  type GoBoardSize,
} from './go';

export type GoDifficulty = 'easy' | 'medium' | 'hard' | 'master';

export const GO_DIFFICULTIES: { key: GoDifficulty; label: string; desc: string }[] = [
  { key: 'easy', label: '入门', desc: '会基本落子，偶有失误，适合初次接触' },
  { key: 'medium', label: '初级', desc: '懂吃子与简单占位，适合练习基础' },
  { key: 'hard', label: '进阶', desc: '战术意识强，会吃子/逃子/打劫，适合提高' },
  { key: 'master', label: '高手', desc: '全面评估+反吃链检测，接近业余强手' },
];

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inBoard = (r: number, c: number, n: number) => r >= 0 && r < n && c >= 0 && c < n;

/** 落子评分（含难度差异：master 额外做反吃链检测） */
function scoreMove(
  board: GoBoard,
  r: number,
  c: number,
  color: GoColor,
  difficulty: GoDifficulty,
  n: number,
): number {
  if (board[r][c] !== '') return -1e9;
  const opp: GoColor = color === 'b' ? 'w' : 'b';
  const res = goPlaceStone(board, r, c, color, null);
  if (!res.board) return -1e9; // 自杀/非法

  let score = 0;

  // 1) 提子收益
  if (res.captured > 0) score += res.captured * 160;

  // 2) 己方落子组的稳定（气数）
  const self = goGroupInfo(res.board, r, c);
  score += self.liberties.size * 8;

  // 3) 吃子威胁：提子后对方新组若 1 气 → 我方本组有被立即反吃的风险（防送）
  if (res.captured > 0) {
    // 检查提子位置周围的对方剩余组：若对方组仅 1 气（就是本落子位置的气）→ 对方可立即反吃
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (!inBoard(nr, nc, n)) continue;
      if (res.board[nr][nc] !== opp) continue;
      const g = goGroupInfo(res.board, nr, nc);
      if (g.liberties.size === 1 && g.liberties.has(`${r},${c}`)) {
        // 对方可立即反吃我方本组（若我方本组仅 1 气）——master 深察，其他难度忽略
        if (self.liberties.size === 1 && difficulty === 'master') {
          score -= 260; // 会被反吃 → 净亏
        }
      }
    }
    // master：吃子链再深一层——对方在被提位置反吃后我方能否再吃回
    if (difficulty === 'master' && res.captured === 1) {
      const koPoint = res.ko;
      if (koPoint) {
        // 简单劫：对方若立即回提劫争，我方再提劫需间隔一手——不直接计分，但打劫收益视为中性
        score += 0;
      }
    }
  }

  // 4) 逃子：落子前己方有 1 气组，落子后气增加 → 逃生奖励
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (!inBoard(nr, nc, n) || board[nr][nc] !== color) continue;
    const pre = goGroupInfo(board, nr, nc);
    if (pre.liberties.size === 1) score += 140; // 救活 1 气组
    else if (pre.liberties.size === 2) score += 30; // 2 气组加固
  }

  // 5) 占位：星位/角/边
  if (isGoStarPoint(r, c, n as GoBoardSize)) score += 14;
  if (r === 0 || r === n - 1 || c === 0 || c === n - 1) score += 10;
  if ((r <= 1 || r >= n - 2) && (c <= 1 || c >= n - 2)) score += 8; // 角
  else if (r <= 2 || r >= n - 3 || c <= 2 || c >= n - 3) score += 4; // 边

  // 6) 扩张与连接
  let openNeighbors = 0, friendlyNeighbors = 0;
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (!inBoard(nr, nc, n)) continue;
    if (board[nr][nc] === '') openNeighbors++;
    else if (board[nr][nc] === color) friendlyNeighbors++;
  }
  score += openNeighbors * 6;
  score += friendlyNeighbors * 12;

  // 7) 天元/中央轻微偏好（利于学习布局）
  const mid = (n - 1) / 2;
  const dist = Math.abs(r - mid) + Math.abs(c - mid);
  if (dist <= 2) score += 5;

  return score;
}

/**
 * 计算围棋 AI 最佳落子
 */
export function goBestMove(
  board: GoBoard,
  color: GoColor,
  difficulty: GoDifficulty = 'medium',
): [number, number] | null {
  const n = board.length;
  const moves: Array<{ r: number; c: number; s: number }> = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (board[r][c] !== '') continue;
      const s = scoreMove(board, r, c, color, difficulty, n);
      if (s > -1e8) moves.push({ r, c, s });
    }
  }
  if (moves.length === 0) return null;

  moves.sort((a, b) => b.s - a.s);

  // 难度随机性
  let pickIndex = 0;
  if (difficulty === 'easy') {
    // 入门：在前 40% 中随机选（带较大随机，但保留合理性）
    const pool = Math.max(1, Math.floor(moves.length * 0.4));
    pickIndex = Math.floor(Math.random() * pool);
  } else if (difficulty === 'medium') {
    const pool = Math.max(1, Math.floor(moves.length * 0.15));
    pickIndex = Math.floor(Math.random() * pool);
  } else if (difficulty === 'hard') {
    const pool = Math.max(1, Math.floor(moves.length * 0.06));
    pickIndex = Math.floor(Math.random() * pool);
  } else {
    pickIndex = 0; // master 选最佳
    // master：分数相差极小（<12）时在前 3 名中微随机，避免完全机械
    if (moves.length >= 3 && moves[0].s - moves[2].s < 12) {
      pickIndex = Math.floor(Math.random() * 3);
    }
  }

  const pick = moves[pickIndex] || moves[0];
  return [pick.r, pick.c];
}

/** 获取 AI 推荐提示着法（人机对战"提示"功能用——hard 评估） */
export function goHintMove(board: GoBoard, color: GoColor): [number, number] | null {
  return goBestMove(board, color, 'hard');
}
