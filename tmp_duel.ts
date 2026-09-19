import { cloneXiangqiBoard, XIANGQI_INITIAL_BOARD, applyXiangqiMove, getAllXiangqiLegalMoves, getXiangqiGameStatusAdvanced } from "./src/engine/xiangqi";
const n = await import("./tmp_vs_new.mjs");
const o = await import("./tmp_vs_old.mjs");
let nWin = 0, oWin = 0, draw = 0, illegal = 0;
const st = Date.now();
for (let g = 0; g < 12; g++) {
  let b = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
  let t = 'r';
  const redIsNew = g % 2 === 0;
  for (let step = 0; step < 200; step++) {
    const eng = (t === 'r') === redIsNew ? n : o;
    const m = eng.xiangqiBestMove(b, t, 'medium', null, 6);
    if (!m) break;
    const from = m[0], to = m[1];
    if (!getAllXiangqiLegalMoves(b, t).some(x => x.from[0] === from[0] && x.from[1] === from[1] && x.to[0] === to[0] && x.to[1] === to[1])) { illegal++; break; }
    b = applyXiangqiMove(b, from, to).board;
    const s = getXiangqiGameStatusAdvanced(b, t === 'r' ? 'b' : 'r', [{ from, to }]);
    if (s === 'checkmate' || s === 'stalemate') {
      const winnerIsNew = ((t === 'r' ? 'b' : 'r') === 'r') === redIsNew;
      if (winnerIsNew) nWin++; else oWin++;
      break;
    }
    if (s === 'draw') { draw++; break; }
    t = t === 'r' ? 'b' : 'r';
  }
}
console.log("NEW(侵略性+期望窗口) vs OLD(c502925) medium 12局:", JSON.stringify({ newWin: nWin, oldWin: oWin, draw, illegal, ms: Date.now() - st }));
