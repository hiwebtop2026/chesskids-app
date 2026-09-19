import { xiangqiBestMove, setLearnedBias } from "./src/engine/xiangqiAI";
import { getAllXiangqiLegalMoves, applyXiangqiMove, XIANGQI_INITIAL_BOARD, cloneXiangqiBoard, getXiangqiGameStatusAdvanced } from "./src/engine/xiangqi";
setLearnedBias(null);
export { xiangqiBestMove };
export function selfplay(games: number, depth: 'easy' | 'medium'): { red: number; black: number; draw: number; ms: number; illegal: number } {
  const st = Date.now();
  let red = 0, black = 0, draw = 0, illegal = 0;
  for (let g = 0; g < games; g++) {
    let b = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
    let t: 'r' | 'b' = 'r';
    for (let step = 0; step < 160; step++) {
      const m = xiangqiBestMove(b, t, depth, null, 6);
      if (!m) break;
      const from = m[0], to = m[1];
      if (!getAllXiangqiLegalMoves(b, t).some(x => x.from[0] === from[0] && x.from[1] === from[1] && x.to[0] === to[0] && x.to[1] === to[1])) { illegal++; break; }
      b = applyXiangqiMove(b, from, to).board;
      const s = getXiangqiGameStatusAdvanced(b, t === 'r' ? 'b' : 'r', [{ from, to }]);
      if (s === 'checkmate' || s === 'stalemate') { if (t === 'r') black++; else red++; break; }
      if (s === 'draw') { draw++; break; }
      t = t === 'r' ? 'b' : 'r';
    }
  }
  return { red, black, draw, ms: Date.now() - st, illegal };
}
console.log("NEW-ready");
