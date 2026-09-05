/* 中国象棋引擎/AI 运行时自测（tsx 执行） */
import {
  XIANGQI_INITIAL_BOARD,
  applyXiangqiMove,
  getXiangqiMoveNotation,
  getAllXiangqiLegalMoves,
  cloneXiangqiBoard,
  isXiangqiInCheck,
} from '../src/engine/xiangqi';
import { xiangqiBestMove, XIANGQI_AI_DIFFICULTIES } from '../src/engine/xiangqiAI';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

console.log('== 1. 记谱函数（红方：汉字路名，黑方：全角数字） ==');
check('红车右移一列 -> 车九平八', getXiangqiMoveNotation('R', [9,0],[9,1]) === '车九平八', getXiangqiMoveNotation('R',[9,0],[9,1]));
check('红车右移五列 -> 车九平四', getXiangqiMoveNotation('R', [9,0],[9,5]) === '车九平四', getXiangqiMoveNotation('R',[9,0],[9,5]));
check('红马跳 -> 马八进七', getXiangqiMoveNotation('N', [9,1],[7,2]) === '马八进七', getXiangqiMoveNotation('N',[9,1],[7,2]));
check('红炮前进一格 -> 炮八进一', getXiangqiMoveNotation('C', [9,1],[8,1]) === '炮八进一', getXiangqiMoveNotation('C',[9,1],[8,1]));
check('黑车右移一列 -> 车１平２', getXiangqiMoveNotation('r', [0,0],[0,1]) === '车１平２', getXiangqiMoveNotation('r',[0,0],[0,1]));
check('黑马跳 -> 马２进３', getXiangqiMoveNotation('n', [0,1],[2,2]) === '马２进３', getXiangqiMoveNotation('n',[0,1],[2,2]));
check('黑炮平 -> 炮２平５', getXiangqiMoveNotation('c', [0,1],[0,4]) === '炮２平５', getXiangqiMoveNotation('c',[0,1],[0,4]));
check('吃子标记 (吃)', getXiangqiMoveNotation('R',[9,0],[6,0],'p').includes('(吃)'));

console.log('== 2. AI 基础 ==');
for (const d of XIANGQI_AI_DIFFICULTIES) {
  const mv = xiangqiBestMove(XIANGQI_INITIAL_BOARD, 'r', d);
  check(`难度 ${d} 开局给出着法`, Array.isArray(mv) && mv.length === 2);
  if (Array.isArray(mv)) {
    const [f, t] = mv;
    check(`  着法坐标合法 ${JSON.stringify(mv)}`, f[0]>=0&&f[0]<10&&f[1]>=0&&f[1]<9&&t[0]>=0&&t[0]<10&&t[1]>=0&&t[1]<9);
  }
}
// 验证 AI 着法确实可执行
const aiMove = xiangqiBestMove(XIANGQI_INITIAL_BOARD, 'r', 'hard')!;
const [af, at] = aiMove;
check('AI 红方着法来自红方棋子', /[RNBAKCP]/.test(XIANGQI_INITIAL_BOARD[af[0]][af[1]]), XIANGQI_INITIAL_BOARD[af[0]][af[1]]);
const res2 = applyXiangqiMove(cloneXiangqiBoard(XIANGQI_INITIAL_BOARD), af, at);
check('执行 AI 着法后可计算将军状态', typeof isXiangqiInCheck(res2.board, 'b') === 'boolean');
check('AI 着法后红方不再被将军', isXiangqiInCheck(res2.board, 'r') === false, String(isXiangqiInCheck(res2.board,'r')));

console.log('== 3. 黑方执子（AI 执黑后手） ==');
const bInit = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
const redMove = applyXiangqiMove(bInit, [9,1],[7,4]); // 红炮二平五
const blackMove = xiangqiBestMove(redMove.board, 'b', 'medium');
check('黑方 AI 给出应对着法', Array.isArray(blackMove) && blackMove.length === 2, JSON.stringify(blackMove));
if (Array.isArray(blackMove)) {
  check('黑方着法来自黑方棋子', /[rnabkcp]/.test(redMove.board[blackMove[0][0]][blackMove[0][1]]), redMove.board[blackMove[0][0]][blackMove[0][1]]);
}

console.log('== 4. 引擎合法着法完整性 ==');
const moves = getAllXiangqiLegalMoves(XIANGQI_INITIAL_BOARD, 'r');
check(`开局红方合法着法数>30（实际${moves.length}）`, moves.length > 30, String(moves.length));
check('开局红方着法含炮二平五', moves.some(m => m.from[0]===7 && m.from[1]===1 && m.to[0]===7 && m.to[1]===4));

console.log('== 5. AI 完整对局冒烟（红先手, 双方各走 8 步不出错） ==');
let simBoard = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
let simColor: 'r'|'b' = 'r';
let ok = true;
for (let i = 0; i < 8; i++) {
  const mv = xiangqiBestMove(simBoard, simColor, 'medium');
  if (!mv) { ok = false; console.log(`  第${i}步无着法`); break; }
  const r = applyXiangqiMove(simBoard, mv[0], mv[1]);
  simBoard = r.board;
  simColor = simColor === 'r' ? 'b' : 'r';
}
check('8 步对局全程无异常', ok);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
