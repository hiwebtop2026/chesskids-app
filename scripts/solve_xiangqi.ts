/**
 * 一步杀求解器：给定局面，找出红方所有一步杀着法
 * 用于校验/生成象棋战术谜题答案
 * npx esbuild scripts/solve_xiangqi.ts --bundle --platform=node --format=cjs --outfile=scripts/_solve.cjs && node scripts/_solve.cjs
 */
import {
  applyXiangqiMove,
  getAllXiangqiLegalMoves,
  getXiangqiGameStatus,
  getXiangqiMoveNotation,
  isXiangqiInCheck,
} from '../src/engine/xiangqi';
import type { XiangqiBoard, XiangqiSquare } from '../src/types/xiangqi';

function emptyBoard(): XiangqiBoard {
  return Array.from({ length: 10 }, () => Array(9).fill(''));
}
function setup(pieces: [string, number, number][]): XiangqiBoard {
  const b = emptyBoard();
  for (const [p, r, c] of pieces) b[r][c] = p;
  return b;
}

/** 候选局面：[编号, 说明, 棋子] */
const candidates: [string, string, [string, number, number][]][] = [
  // xq-002 闷宫：炮借士架下底，红车封宫顶(1,4)与压象眼
  ['xq-002 闷宫', '炮借士架', [
    ['K', 9, 4],
    ['C', 2, 2],
    ['R', 3, 4],
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 0, 5],
    ['b', 2, 0],
  ]],
  // xq-003 马后炮：马贴将，黑将不能升(红车压)，炮推马后
  ['xq-003 马后炮', '竖线', [
    ['K', 9, 4],
    ['N', 1, 4],
    ['C', 4, 4],
    ['R', 8, 5],
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 0, 5],
  ]],
  // xq-004 卧槽马：马卧槽将，车贴肋道封升将
  ['xq-004 卧槽马', '马+肋车', [
    ['K', 9, 4],
    ['R', 0, 2],
    ['N', 3, 4],
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 0, 5],
  ]],
  // xq-005 重炮：双炮叠将，红车封黑将上升格
  ['xq-005 重炮', '双炮叠', [
    ['K', 9, 4],
    ['C', 7, 4],
    ['C', 8, 4],
    ['R', 3, 3],
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 0, 5],
  ]],
  // xq-006 双车错：黑将在肋道，红车封升路
  ['xq-006 双车错', '交替', [
    ['K', 9, 4],
    ['R', 0, 2],
    ['R', 9, 5],
    ['R', 8, 2],
    ['k', 2, 3],
    ['a', 1, 4],
  ]],
  // xq-007 铁门栓：中炮锁士，车下底
  ['xq-007 铁门栓', '炮锁车下底', [
    ['K', 9, 4],
    ['C', 7, 4],
    ['R', 9, 3],
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 0, 5],
  ]],
  // xq-008 挂角马：马挂士角，肋车封升将
  ['xq-008 挂角马', '马挂角', [
    ['K', 9, 4],
    ['R', 9, 5],
    ['N', 3, 4],
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 0, 5],
  ]],
  // xq-009 钓鱼马：马控将，肋车下底
  ['xq-009 钓鱼马', '鱼钩车', [
    ['K', 9, 4],
    ['R', 8, 5],
    ['N', 2, 3],
    ['A', 7, 4],
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 0, 5],
  ]],
  // xq-011 大刀剜心：车砍中士，车控升将格
  ['xq-011 大刀剜心', '车砍心士', [
    ['K', 9, 4],
    ['R', 2, 4],
    ['C', 8, 4],
    ['R2', 3, 5] as any,
    ['k', 0, 4],
    ['a', 1, 3],
    ['a', 1, 5],
    ['b', 2, 2],
    ['b', 2, 6],
  ]],
  // xq-012 弃车杀：弃车引黑车，马后炮成杀（两步杀，先验证首着后黑方无解）
  ['xq-012 弃车杀', '弃车引离', [
    ['K', 9, 4],
    ['R', 3, 3],
    ['N', 1, 4],
    ['C', 5, 4],
    ['R2', 8, 6] as any,
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 0, 5],
    ['r', 2, 4],
  ]],
  // xq-013 双车错底车
  ['xq-013 双车错', '底车交错', [
    ['K', 9, 4],
    ['R', 1, 5],
    ['R2', 3, 2] as any,
    ['R3', 4, 6] as any,
    ['A', 7, 4],
    ['k', 0, 4],
    ['a', 1, 3],
    ['b', 2, 6],
  ]],
  // xq-014 卧槽马炮：马卧槽，炮贴肋道
  ['xq-014 卧槽马', '马炮联杀', [
    ['K', 9, 4],
    ['N', 2, 4],
    ['C', 9, 3],
    ['R', 5, 5],
    ['k', 0, 4],
    ['a', 0, 3],
    ['a', 1, 5],
    ['r', 0, 0],
  ]],
  // xq-015 闷宫：炮借象架
  ['xq-015 闷宫', '象架闷宫', [
    ['K', 9, 4],
    ['C', 3, 0],
    ['R', 4, 4],
    ['k', 0, 4],
    ['a', 1, 3],
    ['a', 1, 5],
    ['b', 0, 2],
  ]],
];

function findMates(board: XiangqiBoard): { from: XiangqiSquare; to: XiangqiSquare; notation: string }[] {
  const mates: { from: XiangqiSquare; to: XiangqiSquare; notation: string }[] = [];
  const redMoves = getAllXiangqiLegalMoves(board, 'r');
  for (const m of redMoves) {
    const { board: nb } = applyXiangqiMove(board, m.from, m.to);
    if (getXiangqiGameStatus(nb, 'b') === 'checkmate') {
      const notation = getXiangqiMoveNotation(m.piece, m.from, m.to, m.captured);
      mates.push({ from: m.from, to: m.to, notation });
    }
  }
  return mates;
}

for (const [id, desc, piecesRaw] of candidates) {
  // 过滤掉错误标记的 R2/R3 占位（改成正确棋子）
  const pieces = piecesRaw.map(([p, r, c]) => {
    let piece = p;
    if (p === 'R2' || p === 'R3') piece = 'R';
    return [piece, r, c] as [string, number, number];
  });
  const b = setup(pieces);

  // 走前黑方不应被将军（红方刚走完对手的局面应合法）
  const blackInCheckBefore = isXiangqiInCheck(b, 'b');
  const mates = findMates(b);

  console.log(`\n【${id}】${desc}`);
  if (blackInCheckBefore) console.log(`  ⚠️ 走前黑方已被将军（局面不合法）`);
  if (mates.length === 0) {
    console.log(`  ❌ 无解（非一步杀）`);
  } else {
    for (const m of mates) {
      const uniq = mates.length === 1 ? '✅唯一' : '⚠️多解';
      console.log(`  ${uniq} ${m.notation}  [${m.from}]→[${m.to}]`);
    }
  }
}
