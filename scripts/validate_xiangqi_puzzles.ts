/**
 * ChessKids - 中国象棋谜题数据校验脚本
 * 验证每道题：① 起点是红方棋子 ② 走法合法 ③ 走完后黑方被将军 ④ 走完后黑方被将死（一步杀）
 * 运行：npx tsx scripts/validate_xiangqi_puzzles.ts
 */
import { XIANGQI_PUZZLES } from '../src/data/xiangqiPuzzles';
import {
  isXiangqiRed,
  isXiangqiMoveLegal,
  applyXiangqiMove,
  isXiangqiInCheck,
  isXiangqiCheckmate,
} from '../src/engine/xiangqi';

let pass = 0;
const failures: string[] = [];

for (const p of XIANGQI_PUZZLES) {
  const id = p.id;
  const { from, to } = p.answer;
  const piece = p.board[from[0]][from[1]];

  // ① 起点必须有红方棋子
  if (!piece || !isXiangqiRed(piece)) {
    failures.push(`${id}: 起点 [${from}] 无红方棋子 (${piece || '空'})`);
    continue;
  }

  // ② 走法必须合法
  if (!isXiangqiMoveLegal(p.board, from, to, 'r')) {
    failures.push(`${id}: 走法不合法 ${piece}[${from[0]},${from[1]}] -> [${to[0]},${to[1]}]`);
    continue;
  }

  // 走完后的局面
  const after = applyXiangqiMove(p.board, from, to).board;
  if (!after) {
    failures.push(`${id}: applyXiangqiMove 返回空`);
    continue;
  }

  // ③ 走完后黑方被将军
  if (!isXiangqiInCheck(after, 'b')) {
    failures.push(`${id}: 走完后黑方未被将军`);
    continue;
  }

  // ④ 走完后黑方被将死（一步杀）
  if (!isXiangqiCheckmate(after, 'b')) {
    failures.push(`${id}: 走完后黑方未被将死（非一步杀）`);
    continue;
  }

  // ⑤ 原局面黑方不应已在被将军状态（避免题目本身不成立）
  if (isXiangqiInCheck(p.board, 'b')) {
    failures.push(`${id}: 原局面黑方已在被将军状态（题目前已将军）`);
    continue;
  }

  pass++;
}

console.log(`\n===== 校验结果：${pass} / ${XIANGQI_PUZZLES.length} 通过 =====`);
if (failures.length) {
  console.log('\n失败题目：');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
} else {
  console.log('全部谜题均为「红先一步杀」且局面合法 ✅');
}
