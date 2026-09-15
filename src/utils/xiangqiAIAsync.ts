/**
 * ChessKids - 中国象棋 AI 异步调用封装
 * 通过 Web Worker 在主线程外计算，避免困难/大师难度下同步搜索冻结 UI；
 * Worker 不可用时自动回退到主线程同步计算，保证功能始终可用。
 * 扩展：权重注入（自我对弈学习成果）、开局库步数、后台自对弈训练。
 */
import type { XiangqiBoard, XiangqiColor, XiangqiSquare } from '../types/xiangqi';
import { xiangqiBestMove, setLearnedBias } from '../engine/xiangqiAI';
import type { XiangqiAIDifficulty } from '../engine/xiangqiAI';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: XiangqiSquare[] | null) => void; reject: (e: Error) => void }
>();

export interface TrainResult {
  bias: Record<string, number>;
  rounds: number;
  redWins: number;
  blackWins: number;
  draws: number;
}

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
 * @param ply 当前总走子数（开局库使用；null 则跳过开局库）
 * @param weights 自我对弈学习权重（可选）
 */
export function xiangqiBestMoveAsync(
  board: XiangqiBoard,
  color: XiangqiColor,
  difficulty: XiangqiAIDifficulty,
  opts?: { ply?: number; weights?: Record<string, number> | null },
): Promise<XiangqiSquare[] | null> {
  const { ply = null, weights = null } = opts || {};
  return new Promise((resolve, reject) => {
    const requestId = ++seq;
    pending.set(requestId, { resolve, reject });
    try {
      const w = getWorker();
      w.postMessage({ requestId, board, color, difficulty, weights, ply });
    } catch (err) {
      pending.delete(requestId);
      // Worker 不可用（如受限环境）时回退主线程同步计算，保证功能可用
      try {
        resolve(xiangqiBestMove(board, color, difficulty, weights, ply));
      } catch (e2) {
        reject(e2 as Error);
      }
    }
  });
}

/**
 * 后台自对弈训练：让 AI 与自己下 N 局，产出新的评估偏置（AI 从胜负经验中"越下越聪明"）。
 * 主线程只负责持久化结果，训练计算在 Worker 内完成，不阻塞 UI。
 */
export function trainSelfPlayAsync(
  games: number,
  weights: Record<string, number> | null,
): Promise<TrainResult> {
  return new Promise((resolve, reject) => {
    const requestId = ++seq;
    const handler = (e: MessageEvent) => {
      const data = (e.data || {}) as { requestId: number; bias: Record<string, number> | null; rounds: number; redWins: number; blackWins: number; draws: number; error?: string };
      if (data.requestId !== requestId) return;
      worker?.removeEventListener('message', handler);
      if (data.error || !data.bias) {
        reject(new Error(data.error || 'train failed'));
        return;
      }
      resolve({ bias: data.bias, rounds: data.rounds, redWins: data.redWins, blackWins: data.blackWins, draws: data.draws });
    };
    try {
      const w = getWorker();
      w.addEventListener('message', handler);
      w.postMessage({ type: 'train', requestId, games, weights });
    } catch (err) {
      reject(err as Error);
    }
  });
}

/** 初始化主线程引擎的学习权重（启动时调用一次） */
export function initEngineWeights(weights: Record<string, number> | null) {
  setLearnedBias(weights);
}
