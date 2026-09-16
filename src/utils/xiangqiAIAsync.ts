/**
 * ChessKids - 中国象棋 AI 异步调用封装
 * 通过 Web Worker 在主线程外计算，避免困难/大师难度下同步搜索冻结 UI；
 * Worker 不可用时自动回退到主线程同步计算，保证功能始终可用。
 * 扩展：权重注入（自我对弈学习成果）、开局库步数、后台自对弈训练。
 *
 * 健壮性（稳定性修复）：
 * - 所有请求（走子/训练）统一进入 pending 表，worker.onerror 时一并 reject，杜绝"永久挂起"；
 * - 每个请求带超时兜底（走子 15s / 训练 5min），Worker 卡死也不会让 UI 流程卡死；
 * - 超时/错误后自动回退主线程同步计算（走子）或向调用方抛出可捕获错误（训练）。
 */
import type { XiangqiBoard, XiangqiColor, XiangqiSquare } from '../types/xiangqi';
import { xiangqiBestMove, setLearnedBias } from '../engine/xiangqiAI';
import type { XiangqiAIDifficulty } from '../engine/xiangqiAI';

let worker: Worker | null = null;
let seq = 0;

type MoveRequest = {
  resolve: (v: XiangqiSquare[] | null) => void;
  reject: (e: Error) => void;
};
type TrainRequest = {
  resolve: (v: TrainResult) => void;
  reject: (e: Error) => void;
};
const pendingMoves = new Map<number, MoveRequest>();
const pendingTrains = new Map<number, TrainRequest>();

export interface TrainResult {
  bias: Record<string, number>;
  rounds: number;
  redWins: number;
  blackWins: number;
  draws: number;
}

/** 统一的 Worker 消息分派：走子与训练都通过 onmessage 结算，onerror 会同时清理两类请求 */
function dispatchWorkerMessage(data: unknown) {
  const d = (data || {}) as {
    requestId?: number;
    moves?: XiangqiSquare[] | null;
    bias?: Record<string, number> | null;
    rounds?: number;
    redWins?: number;
    blackWins?: number;
    draws?: number;
    error?: string;
  };
  if (typeof d.requestId !== 'number') return;

  // 训练请求（响应含 bias）
  const tp = pendingTrains.get(d.requestId);
  if (tp) {
    pendingTrains.delete(d.requestId);
    if (d.error || !d.bias) {
      tp.reject(new Error(d.error || 'AI 训练失败'));
    } else {
      tp.resolve({
        bias: d.bias,
        rounds: d.rounds || 0,
        redWins: d.redWins || 0,
        blackWins: d.blackWins || 0,
        draws: d.draws || 0,
      });
    }
    return;
  }

  // 走子请求
  const mp = pendingMoves.get(d.requestId);
  if (mp) {
    pendingMoves.delete(d.requestId);
    if (d.error) mp.reject(new Error(d.error));
    else mp.resolve(d.moves || null);
  }
}

function rejectAllPending(error: Error) {
  for (const [, p] of pendingMoves) p.reject(error);
  pendingMoves.clear();
  for (const [, p] of pendingTrains) p.reject(error);
  pendingTrains.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../engine/xiangqiAI.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (e: MessageEvent) => dispatchWorkerMessage(e.data);
  worker.onerror = (e) => {
    console.error('[AI Worker] 加载或运行失败，回退到主线程计算:', e.message || e);
    terminateWorker();
    rejectAllPending(new Error('AI worker error'));
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
 * 优先使用 Web Worker；Worker 环境受限或超时（15s）时回退主线程同步计算。
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
    let settled = false;
    const finish = (moves: XiangqiSquare[] | null, err?: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      pendingMoves.delete(requestId);
      if (err) reject(err);
      else resolve(moves);
    };
    const timeoutId = setTimeout(() => {
      // Worker 卡死兜底：回退主线程同步计算（不能直接 resolve null，会让 AI 放弃走子）
      if (settled) return;
      settled = true;
      pendingMoves.delete(requestId);
      console.warn('[AI Worker] 走子请求超时（15s），回退主线程计算');
      try {
        resolve(xiangqiBestMove(board, color, difficulty, weights, ply));
      } catch (e2) {
        reject(e2 as Error);
      }
    }, 15000);
    pendingMoves.set(requestId, { resolve: (v) => finish(v), reject: (e) => finish(null, e) });
    try {
      const w = getWorker();
      w.postMessage({ requestId, board, color, difficulty, weights, ply });
    } catch (err) {
      pendingMoves.delete(requestId);
      clearTimeout(timeoutId);
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
 * 训练耗时较长，超时兜底设为 5 分钟；Worker 崩溃/超时会 reject，调用方应捕获。
 */
export function trainSelfPlayAsync(
  games: number,
  weights: Record<string, number> | null,
): Promise<TrainResult> {
  return new Promise((resolve, reject) => {
    const requestId = ++seq;
    let settled = false;
    const finish = (tr?: TrainResult, err?: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      pendingTrains.delete(requestId);
      if (err) reject(err);
      else if (tr) resolve(tr);
    };
    const timeoutId = setTimeout(() => {
      console.warn('[AI Worker] 自对弈训练超时（5min），本次训练放弃');
      finish(undefined, new Error('AI 训练超时（Worker 无响应）'));
    }, 5 * 60 * 1000);
    pendingTrains.set(requestId, { resolve: (v) => finish(v), reject: (e) => finish(undefined, e) });
    try {
      const w = getWorker();
      w.postMessage({ type: 'train', requestId, games, weights });
    } catch (err) {
      pendingTrains.delete(requestId);
      clearTimeout(timeoutId);
      reject(err as Error);
    }
  });
}

/** 初始化主线程引擎的学习权重（启动时调用一次） */
export function initEngineWeights(weights: Record<string, number> | null) {
  setLearnedBias(weights);
}
