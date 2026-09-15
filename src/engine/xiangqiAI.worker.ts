/**
 * ChessKids - 中国象棋 AI 计算 Web Worker
 * 把耗时的 Negamax + Alpha-Beta 搜索移出主线程，避免对局时 UI 冻结/卡死（困难/大师难度可达数秒）
 * 扩展：支持注入自我对弈学习权重（weights）、后台自对弈训练（type: 'train'）
 */
import { xiangqiBestMove, setLearnedBias } from './xiangqiAI';
import { runSelfPlayLearning } from './xiangqiLearning';
import type { XiangqiBoard, XiangqiColor, XiangqiSquare } from '../types/xiangqi';
import type { XiangqiAIDifficulty } from './xiangqiAI';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e: MessageEvent) => {
  const data = (e.data || {}) as {
    type?: string;
    requestId: number;
    board?: XiangqiBoard;
    color?: XiangqiColor;
    difficulty?: XiangqiAIDifficulty;
    weights?: Record<string, number> | null;
    games?: number;
    trainingDepth?: number;
  };

  // 自对弈训练请求：后台低深度对弈，产出新的评估偏置
  if (data.type === 'train') {
    const { requestId, games = 2, trainingDepth = 4, weights = null } = data;
    try {
      const result = runSelfPlayLearning(
        games,
        (b, c, w) => {
          setLearnedBias(w);
          // 训练用 medium（深度4）保证对局有实质胜负，产生有效学习信号
          return xiangqiBestMove(b, c, trainingDepth >= 4 ? 'medium' : 'easy', w, null);
        },
        weights || {},
      );
      ctx.postMessage({ requestId, bias: result.bias, rounds: result.rounds, redWins: result.redWins, blackWins: result.blackWins, draws: result.draws });
    } catch (err: any) {
      ctx.postMessage({ requestId, bias: null, error: err?.message || String(err) });
    }
    return;
  }

  // 常规最佳着法请求
  const { requestId, board, color, difficulty, weights = null, ply = null } = data as {
    requestId: number;
    board: XiangqiBoard;
    color: XiangqiColor;
    difficulty: XiangqiAIDifficulty;
    weights?: Record<string, number> | null;
    ply?: number | null;
  };
  try {
    // 开局库校验已统一集成在 xiangqiBestMove 内（ply < 8 时优先走规范开局）
    const moves: XiangqiSquare[] | null = xiangqiBestMove(board, color, difficulty, weights, ply);
    ctx.postMessage({ requestId, moves });
  } catch (err: any) {
    ctx.postMessage({ requestId, moves: null, error: err?.message || String(err) });
  }
};
