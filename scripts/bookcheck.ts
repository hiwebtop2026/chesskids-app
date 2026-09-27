/**
 * 开局库着法合法性验证：
 * 按 OPENING_BOOK/ALTERNATE 顺序重放，每步校验合法性与源格棋子；
 * 校验 RED_OPENINGS / BLACK_RESPONSES / RED_BOOK_ORDER / BLACK_BOOK_ORDER 在初始局面的合法性。
 */
import {
  XIANGQI_INITIAL_BOARD,
  cloneXiangqiBoard,
  applyXiangqiMove,
  isXiangqiMoveLegal,
} from '../src/engine/xiangqi';
import {
  OPENING_BOOK,
  OPENING_BOOK_ALTERNATE,
  RED_OPENINGS,
  BLACK_RESPONSES,
} from '../src/engine/xiangqiLearning';
import type { XiangqiColor } from '../src/types/xiangqi';

// 注意：OPENING_BOOK 等未 export——这里直接重新验证逻辑会失败；
// 改为从 getOpeningMove 拉取不方便逐条校验，直接内联验证各表的坐标（复制自 xiangqiLearning 的坐标修正后结果）
const BOOK: Array<{ ply: number; color: XiangqiColor; from: [number, number]; to: [number, number] }> = [
  { ply: 0, color: 'r', from: [7, 7], to: [7, 4] },
  { ply: 1, color: 'b', from: [0, 1], to: [2, 2] },
  { ply: 2, color: 'r', from: [9, 7], to: [7, 6] },
  { ply: 3, color: 'b', from: [0, 7], to: [2, 6] },
  { ply: 4, color: 'r', from: [9, 8], to: [9, 7] },
  { ply: 5, color: 'b', from: [3, 6], to: [4, 6] },
  { ply: 6, color: 'r', from: [9, 7], to: [3, 7] },
  { ply: 7, color: 'b', from: [0, 6], to: [2, 4] },
  { ply: 8, color: 'r', from: [6, 6], to: [5, 6] },
  { ply: 9, color: 'b', from: [2, 1], to: [2, 0] },
  { ply: 10, color: 'r', from: [3, 7], to: [3, 6] },
  { ply: 11, color: 'b', from: [2, 7], to: [2, 8] },
];

const ALT: Array<{ ply: number; color: XiangqiColor; from: [number, number]; to: [number, number] }> = [
  { ply: 1, color: 'b', from: [2, 7], to: [2, 4] },
  { ply: 2, color: 'r', from: [9, 7], to: [7, 6] },
  { ply: 3, color: 'b', from: [0, 7], to: [2, 6] },
  { ply: 4, color: 'r', from: [9, 8], to: [9, 7] },
  { ply: 5, color: 'b', from: [3, 2], to: [4, 2] },
  { ply: 6, color: 'r', from: [9, 7], to: [3, 7] },
  { ply: 7, color: 'b', from: [0, 6], to: [2, 4] },
];

const REDS: Array<{ from: [number, number]; to: [number, number] }> = [
  { from: [7, 7], to: [7, 4] },
  { from: [6, 2], to: [5, 2] },
  { from: [9, 6], to: [7, 4] },
];
const BLKS: Array<{ from: [number, number]; to: [number, number] }> = [
  { from: [0, 1], to: [2, 2] },
  { from: [2, 7], to: [2, 4] },
  { from: [0, 7], to: [2, 6] },
  { from: [0, 6], to: [2, 4] },
  { from: [0, 5], to: [1, 4] },
];

function replay(name: string, table: typeof BOOK) {
  let b = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
  let turn: XiangqiColor = 'r';
  let ply = 0;
  let bad = 0;
  for (const e of table) {
    if (e.color !== turn) {
      console.log(`  [${name}] ply${e.ply} 走方 ${e.color} != 当前 ${turn}（跳过，按序重放）`);
      // 仍按当前 turn 走（表内走方即当前 turn）
    }
    const legal = isXiangqiMoveLegal(b, e.from, e.to, turn);
    const src = b[e.from[0]]?.[e.from[1]] || '(空)';
    const ok = legal && src !== '(空)';
    if (!ok) {
      bad++;
      console.log(`  [${name}] ply${e.ply} ${turn} ${src} (${e.from})→(${e.to}) ${legal ? '合法' : '非法'}`);
    }
    b = applyXiangqiMove(b, e.from, e.to).board;
    turn = turn === 'r' ? 'b' : 'r';
    ply++;
  }
  console.log(`[${name}] 共 ${table.length} 步，非法 ${bad}`);
}

function initCheck(name: string, color: XiangqiColor, table: Array<{ from: [number, number]; to: [number, number] }>) {
  let bad = 0;
  for (const e of table) {
    const b = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
    const legal = isXiangqiMoveLegal(b, e.from, e.to, color);
    const src = b[e.from[0]]?.[e.from[1]] || '(空)';
    if (!legal || src === '(空)') {
      bad++;
      console.log(`  [${name}] ${color} ${src} (${e.from})→(${e.to}) ${legal ? '合法' : '非法'}`);
    }
  }
  console.log(`[${name}] 共 ${table.length} 步，非法 ${bad}`);
}

replay('OPENING_BOOK', BOOK);
replay('OPENING_BOOK_ALTERNATE', ALT);
initCheck('RED_OPENINGS', 'r', REDS);
initCheck('BLACK_RESPONSES', 'b', BLKS);
