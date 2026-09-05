/**
 * 验证象棋战术谜题：答案着法合法 且 走后为将死（红方一步杀）
 * 运行：npx tsx scripts/verify_xiangqi_puzzles.ts
 */
import { XIANGQI_PUZZLES } from '../src/data/xiangqiPuzzles';
import {
  applyXiangqiMove,
  isXiangqiMoveLegal,
  getXiangqiGameStatus,
  getAllXiangqiLegalMoves,
  isXiangqiInCheck,
  getXiangqiMoveNotation,
} from '../src/engine/xiangqi';
import type { XiangqiBoard } from '../src/types/xiangqi';

let pass = 0;
let fail = 0;

for (const p of XIANGQI_PUZZLES) {
  const errors: string[] = [];
  const [fr, fc] = p.answer.from;
  const [tr, tc] = p.answer.to;
  const piece = p.board[fr][fc];

  // 1) 起点必须是红子
  if (!piece || piece !== piece.toUpperCase()) {
    errors.push(`起点 [${fr},${fc}] 不是红子（实际 '${piece}'）`);
  }

  // 2) 答案着法必须合法
  if (piece && piece === piece.toUpperCase()) {
    if (!isXiangqiMoveLegal(p.board, p.answer.from, p.answer.to, 'r')) {
      errors.push('答案着法不合法');
    }
  }

  // 3) 走后必须为将死（黑方被将死）
  if (errors.length === 0) {
    const { board: nb } = applyXiangqiMove(p.board, p.answer.from, p.answer.to);
    const status = getXiangqiGameStatus(nb, 'b');
    const inCheck = isXiangqiInCheck(nb, 'b');
    const blackMoves = getAllXiangqiLegalMoves(nb, 'b');
    if (status !== 'checkmate') {
      errors.push(`走后不是将死（status=${status}, inCheck=${inCheck}, 黑方合法着法=${blackMoves.length}）`);
      // 列出黑方可逃着法辅助排查
      if (blackMoves.length > 0) {
        const sample = blackMoves.slice(0, 6).map((m) => {
          const pc = nb[m.from[0]][m.from[1]];
          return `${pc}${m.from}->${m.to}`;
        });
        errors.push(`  黑方可应：${sample.join(', ')}`);
      }
    }
  }

  const notation = piece
    ? getXiangqiMoveNotation(piece, p.answer.from, p.answer.to, p.board[tr][tc] || undefined)
    : '?';

  if (errors.length === 0) {
    pass++;
    console.log(`✅ ${p.id} [难度${p.difficulty}] ${p.typeName}「${p.title}」 ${notation}`);
  } else {
    fail++;
    console.log(`❌ ${p.id} [难度${p.difficulty}] ${p.typeName}「${p.title}」 ${notation}`);
    errors.forEach((e) => console.log(`     - ${e}`));
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败，共 ${XIANGQI_PUZZLES.length} 题`);
if (fail > 0) process.exit(1);
