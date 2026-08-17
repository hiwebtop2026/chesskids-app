/**
 * ChessKids - 棋谱记法
 * 对应PRD 6.4 模块：走棋记录面板的标准代数记谱法
 */

import type { Board } from '@/types/chess';
import { isEmpty, squareName } from './board';

/** 将走法转为标准代数记谱法 (如 Nf3, exd5, Qxe7) */
export function moveToNotation(
  board: Board,
  from: [number, number],
  to: [number, number]
): string {
  const piece = board[from[0]][from[1]];
  const type = piece.toUpperCase();
  const captured = !isEmpty(board[to[0]][to[1]]);
  let s = type === 'P' ? '' : type;

  if (captured) {
    if (type === 'P') s += squareName(from[0], from[1])[0]; // 兵吃子时标注来源列
    s += 'x';
  }

  s += squareName(to[0], to[1]);

  // 升变
  if (type === 'P' && (to[0] === 0 || to[0] === 7)) {
    s += '=Q';
  }

  return s;
}
