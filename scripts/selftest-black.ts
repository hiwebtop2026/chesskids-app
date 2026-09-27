/**
 * master(黑) vs hard(红) 短自对弈：
 * 验证 master 执黑时开局库走主流应手（棋谱场景：不再"卒9进1"、不出将）。
 */
import {
  XIANGQI_INITIAL_BOARD,
  cloneXiangqiBoard,
  applyXiangqiMove,
  getXiangqiGameStatus,
} from '../src/engine/xiangqi';
import { xiangqiBestMove } from '../src/engine/xiangqiAI';
import type { XiangqiColor } from '../src/types/xiangqi';

const NAMES: Record<string, string> = {
  K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
  k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒',
};

function main() {
  let board = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
  let turn: XiangqiColor = 'r';
  let ply = 0;
  const lines: string[] = [];
  const start = Date.now();
  while (ply < 16) {
    const diff = turn === 'b' ? 'master' : 'hard';
    const t0 = Date.now();
    const mv = xiangqiBestMove(board, turn, diff, null, ply);
    const ms = Date.now() - t0;
    if (!mv) { lines.push(`[${ply} ${turn} NO MOVE]`); break; }
    const piece = board[mv[0][0]][mv[0][1]];
    const name = NAMES[piece] || piece;
    board = applyXiangqiMove(board, mv[0], mv[1]).board;
    lines.push(`${turn==='r'?'红':'黑'}${name}(${mv[0]})→(${mv[1]}) ${ms}ms`);
    const status = getXiangqiGameStatus(board, turn === 'r' ? 'b' : 'r');
    if (status === 'checkmate' || status === 'stalemate' || status === 'draw') {
      lines.push(`END: ${status} @ ply ${ply}`);
      break;
    }
    turn = turn === 'r' ? 'b' : 'r';
    ply++;
  }
  console.log(lines.join('\n'));
  console.log(`total ${Date.now() - start}ms, ${ply} plies`);
}

main();
