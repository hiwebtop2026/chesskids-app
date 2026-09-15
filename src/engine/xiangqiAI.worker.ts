/**
 * ChessKids - 中国象棋 AI 计算 Web Worker
 * 把耗时的 Negamax + Alpha-Beta 搜索移出主线程，避免对局时 UI 冻结/卡死（困难/大师难度可达数秒）
 */
import { xiangqiBestMove } from './xiangqiAI';
import type { XiangqiBoard, XiangqiColor, XiangqiSquare } from '../types/xiangqi';
import type { XiangqiAIDifficulty } from './xiangqiAI';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e: MessageEvent) => {
  const { requestId, board, color, difficulty } = (e.data || {}) as {
    requestId: number;
    board: XiangqiBoard;
    color: XiangqiColor;
    difficulty: XiangqiAIDifficulty;
  };
  try {
    const moves: XiangqiSquare[] | null = xiangqiBestMove(board, color, difficulty);
    ctx.postMessage({ requestId, moves });
  } catch (err: any) {
    ctx.postMessage({ requestId, moves: null, error: err?.message || String(err) });
  }
};
