/**
 * AI 自适应学习引擎单测（Node 环境，tsx 运行）
 * 覆盖：ELO 结算、自适应难度映射、开局库、自对弈学习
 * 运行：npx tsx scripts/xiangqi_learning_test.ts
 */
import {
  INITIAL_ELO,
  recordGameResult,
  getRank,
  resolveAiDifficulty,
  eloToDifficulty,
  getOpeningMove,
  getOpeningNote,
  runSelfPlayLearning,
} from '../src/engine/xiangqiLearning';
import {
  XIANGQI_INITIAL_BOARD,
  cloneXiangqiBoard,
  applyXiangqiMove,
  getXiangqiGameStatus,
  getXiangqiMoveNotation,
} from '../src/engine/xiangqi';
import { xiangqiBestMove } from '../src/engine/xiangqiAI';
import type { XiangqiSquare } from '../src/types/xiangqi';

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

console.log('== 1. ELO 结算 ==');
// 玩家赢中级 AI（AI elo=1000，玩家 elo=1000 → 期望 0.5 → 胜 +12）
let p = recordGameResult('win', 'medium');
assert('胜 medium 后 ELO 上升', p.playerElo === INITIAL_ELO + 12, `got ${p.playerElo}`);
assert('gamesPlayed+1', p.gamesPlayed === 1);
assert('wins=1', p.wins === 1);
// 连输大师
p = recordGameResult('loss', 'master');
assert('输 master 后 ELO 下降', p.playerElo < INITIAL_ELO + 12, `got ${p.playerElo}`);
// auto 模式：玩家赢 → ELO 涨
const before = p.playerElo;
p = recordGameResult('win', 'auto');
assert('胜 auto 后 ELO 上升', p.playerElo > before, `got ${p.playerElo}`);

console.log('== 2. 段位 ==');
assert('1000 → 初级', getRank(1000).label === '初级', getRank(1000).label);
assert('800 → 初级', getRank(800).label === '初级');
assert('600 → 启蒙', getRank(600).label === '启蒙', getRank(600).label);
assert('1300 → 高级', getRank(1300).label === '高级', getRank(1300).label);

console.log('== 3. 自适应难度映射 ==');
assert('auto@1000 → medium', resolveAiDifficulty('auto', 1000).actual === 'medium', resolveAiDifficulty('auto', 1000).actual);
assert('auto@600 → easy', resolveAiDifficulty('auto', 600).actual === 'easy', resolveAiDifficulty('auto', 600).actual);
assert('auto@2000 → master', resolveAiDifficulty('auto', 2000).actual === 'master');
assert('手动 hard → hard', resolveAiDifficulty('hard', 1000).actual === 'hard');
assert('auto 期望胜率 ~45%', Math.abs(resolveAiDifficulty('auto', 1000).expectedWinRate - 0.47) < 0.05, String(resolveAiDifficulty('auto', 1000).expectedWinRate));

console.log('== 4. 开局库 ==');
let book = getOpeningMove(0, 'r', XIANGQI_INITIAL_BOARD);
assert('ply0 红 → 炮二平五', book && book[0][0] === 7 && book[0][1] === 7 && book[1][1] === 4, JSON.stringify(book));
book = getOpeningMove(1, 'b', XIANGQI_INITIAL_BOARD);
assert('ply1 黑 → 马8进7', book && book[0][0] === 0 && book[0][1] === 1 && book[1][0] === 2 && book[1][1] === 2, JSON.stringify(book));
assert('ply8 出界 → null', getOpeningMove(8, 'r', XIANGQI_INITIAL_BOARD) === null);
assert('开局提示', getOpeningNote(0, 'r')?.includes('中炮') === true);

console.log('== 5. 记谱（黑方镜像） ==');
const m1 = getXiangqiMoveNotation('n', [0, 1] as XiangqiSquare, [2, 2] as XiangqiSquare);
assert('黑马8进7 记谱正确', m1 === '马８进７', m1);
const m2 = getXiangqiMoveNotation('N', [9, 7] as XiangqiSquare, [7, 6] as XiangqiSquare);
assert('红马二进三 记谱正确', m2 === '马二进三', m2);
const m3 = getXiangqiMoveNotation('n', [0, 7] as XiangqiSquare, [2, 6] as XiangqiSquare);
assert('黑马2进3 记谱正确', m3 === '马２进３', m3);

console.log('== 6. 自对弈学习 ==');
// 用真实引擎（medium 深度4）自对弈 2 局，保证有实质胜负产生学习信号
const result = runSelfPlayLearning(
  2,
  (b, c, w) => xiangqiBestMove(b, c, 'medium', w, null),
  {},
);
assert('自对弈完成 2 局', result.rounds === 2);
assert('胜负有记录', result.redWins + result.blackWins + result.draws === 2, JSON.stringify({ r: result.redWins, b: result.blackWins, d: result.draws }));
assert('产生偏置（学习信号）', Object.keys(result.bias).length >= 1, JSON.stringify(result.bias));
console.log(`    偏置: ${JSON.stringify(result.bias)} | 红胜${result.redWins} 黑胜${result.blackWins} 和${result.draws}`);

console.log('== 7. 完整对局走子（开局库→中局搜索 5 步） ==');
let board = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
let turn: 'r' | 'b' = 'r';
let legalSteps = 0;
const bookMoves: string[] = [];
for (let ply = 0; ply < 5; ply++) {
  // 引擎内置开局库：ply < 8 时优先走规范开局
  const mv = xiangqiBestMove(board, turn, 'medium', {}, ply);
  if (!mv) break;
  const b = getOpeningMove(ply, turn, board);
  if (b && b[0][0] === mv[0][0] && b[0][1] === mv[0][1] && b[1][0] === mv[1][0] && b[1][1] === mv[1][1]) {
    bookMoves.push(getOpeningNote(ply, turn) || '');
  }
  board = applyXiangqiMove(board, mv[0], mv[1]).board;
  turn = turn === 'r' ? 'b' : 'r';
  legalSteps += 1;
  const st = getXiangqiGameStatus(board, turn);
  if (st !== 'playing') break;
}
assert('5 步内全部合法', legalSteps === 5, `got ${legalSteps}`);
assert('开局库前 5 步全部命中', bookMoves.length === 5, `got ${bookMoves.length}: ${bookMoves.join(',')}`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
