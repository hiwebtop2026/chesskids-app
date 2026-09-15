/**
 * ChessKids - 中国象棋 AI 异步调用封装
 * 通过 Web Worker 在主线程外计算，避免困难/大师难度下同步搜索冻结 UI；
 * Worker 不可用时自动回退到主线程同步计算，保证功能始终可用。
 */
import type { XiangqiBoard, XiangqiColor, XiangqiSquare } from '../types/xiangqi';
import { xiangqiBestMove } from '../engine/xiangqiAI';
import type { XiangqiAIDifficulty } from '../engine/xiangqiAI';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: XiangqiSquare[] | null) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../engine/xiangqiAI.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (e: MessageEvent) => {
    const { requestId, moves, error } = (e.data || {}) as {
      requestId: number;
      moves: XiangqiSquare[] | null;
      error?: string;
    };
    const p = pending.get(requestId);
    if (!p) return;
    pending.delete(requestId);
    if (error) p.reject(new Error(error));
    else p.resolve(moves || null);
  };
  worker.onerror = (e) => {
    console.error('[AI Worker] 加载或运行失败，回退到主线程计算:', e.message || e);
    terminateWorker();
    for (const [, p] of pending) p.reject(new Error('AI worker error'));
    pending.clear();
  };
  return worker;
}

function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/**
 * 异步计算 AI 最佳着法。
 * 优先使用 Web Worker；Worker 环境受限时回退主线程同步计算。
 */
export function xiangqiBestMoveAsync(
  board: XiangqiBoard,
  color: XiangqiColor,
  difficulty: XiangqiAIDifficulty,
): Promise<XiangqiSquare[] | null> {
  return new Promise((resolve, reject) => {
    const requestId = ++seq;
    pending.set(requestId, { resolve, reject });
    try {
      const w = getWorker();
      w.postMessage({ requestId, board, color, difficulty });
    } catch (err) {
      pending.delete(requestId);
      // Worker 不可用（如受限环境）时回退主线程同步计算，保证功能可用
      try {
        resolve(xiangqiBestMove(board, color, difficulty));
      } catch (e2) {
        reject(e2 as Error);
      }
    }
  });
}
