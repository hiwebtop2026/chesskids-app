/**
 * ChessKids - 中国象棋 AI 自适应学习引擎
 *
 * 目标：让 AI「越下越聪明」，同时更好地帮助孩子提升棋力。
 * 三层机制（对应主流棋类 AI 教学方案）：
 *
 * L1 动态难度自适应（玩家画像 → AI 匹配）
 *   - 用简化 ELO 记录玩家水平（localStorage 持久化）
 *   - 「🤖 自适应」模式下，AI 目标强度 = 玩家 ELO + 期望差（让玩家胜率约 45%），
 *     玩家进步 → ELO 上涨 → AI 自动升级；连续受挫 → AI 自动放水
 *   - 段位体系（启蒙/初级/中级/高级/大师）给孩子清晰成长目标
 *
 * L2 自我对弈学习（AI 本体变强）
 *   - 后台 Web Worker 低深度自对弈（AI vs AI），把胜负经验反哺到评估函数
 *   - 学习方式：胜方主力棋子（车/马/炮/兵）的价值偏置微升、负方微降，
 *     权重保存在 localStorage，下次对局自动生效 → AI 从经验中持续调整估值
 *
 * L3 开局库（让孩子学到规范开局）
 *   - 内置标准开局变例（中炮对屏风马等），AI 开局阶段走专业着法
 *   - 着法不合法时自动回退搜索，不影响对局
 */

import {
  XIANGQI_INITIAL_BOARD,
  cloneXiangqiBoard,
  applyXiangqiMove,
  getXiangqiGameStatus,
} from './xiangqi';
import type { XiangqiBoard, XiangqiColor, XiangqiSquare } from '../types/xiangqi';
import type { XiangqiAIDifficulty } from './xiangqiAI';

// ================================================================
// 常量
// ================================================================

const STORAGE_KEY = 'xiangqi_learning_v1';

/** 初始玩家 ELO（与"中级"AI 匹配，约 1000） */
export const INITIAL_ELO = 1000;

/** 手动四档对应的 AI 强度估计（用于 ELO 期望胜率计算） */
export const MANUAL_AI_ELO: Record<XiangqiAIDifficulty, number> = {
  easy: 600,
  medium: 1000,
  hard: 1450,
  master: 2000,
};

/** 职业段位信息（从引擎导入） */
export { DIFFICULTY_RANK } from './xiangqiAI';

/** 段位（按玩家 ELO） */
export const RANKS: Array<{ min: number; label: string; icon: string }> = [
  { min: 1600, label: '大师', icon: '👑' },
  { min: 1300, label: '高级', icon: '🥇' },
  { min: 1050, label: '中级', icon: '🥈' },
  { min: 800, label: '初级', icon: '🥉' },
  { min: 0, label: '启蒙', icon: '🌱' },
];

/** 棋子类型（小写，用于学习偏置） */
export const PIECE_TYPES = ['p', 'c', 'n', 'r', 'b', 'a', 'k'] as const;

// ================================================================
// 玩家画像（localStorage 持久化；Worker 环境自动降级为空画像）
// ================================================================

export interface XiangqiLearningProfile {
  /** 玩家 ELO */
  playerElo: number;
  /** 人机对局统计 */
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** 自对弈学习轮数 */
  selfPlayRounds: number;
  /** AI 评估偏置（自我对弈学习的成果）：棋子类型(小写) → 分值偏置 */
  pieceBias: Record<string, number>;
  /** 玩家连胜/连败（正=连胜、负=连败；用于自适应 AI 强度动态调节） */
  streak: number;
}

function defaultProfile(): XiangqiLearningProfile {
  return {
    playerElo: INITIAL_ELO,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    selfPlayRounds: 0,
    pieceBias: {},
    streak: 0,
  };
}

function readStorage(): string | null {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(v: string) {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* 隐私模式/配额满时静默降级 */
  }
}

export function getLearningProfile(): XiangqiLearningProfile {
  const raw = readStorage();
  if (!raw) return defaultProfile();
  try {
    const parsed = JSON.parse(raw) as Partial<XiangqiLearningProfile>;
    return {
      ...defaultProfile(),
      ...parsed,
      pieceBias: parsed.pieceBias && typeof parsed.pieceBias === 'object' ? parsed.pieceBias : {},
    };
  } catch {
    return defaultProfile();
  }
}

export function saveLearningProfile(p: XiangqiLearningProfile) {
  writeStorage(JSON.stringify(p));
}

/** 获取当前 AI 学习偏置（供引擎注入） */
export function getLearnedPieceBias(): Record<string, number> {
  return { ...(getLearningProfile().pieceBias || {}) };
}

// ================================================================
// L1 玩家 ELO / 段位 / 自适应难度
// ================================================================

export type XiangqiGameResult = 'win' | 'loss' | 'draw';

/**
 * 对局结束后更新玩家画像（简化 ELO，K=24）。
 * @param result 玩家视角结果
 * @param aiDifficulty 本次 AI 难度（auto 时按当时玩家 ELO 估计）
 */
export function recordGameResult(result: XiangqiGameResult, aiDifficulty: XiangqiAIDifficulty | 'auto'): XiangqiLearningProfile {
  const p = getLearningProfile();
  const aiElo = aiDifficulty === 'auto'
    ? resolveAutoAiElo(p.playerElo)
    : MANUAL_AI_ELO[aiDifficulty] || 1000;

  // 期望胜率（玩家视角）：ELO 差越大，玩家获胜概率越低
  const expected = 1 / (1 + Math.pow(10, (aiElo - p.playerElo) / 400));
  const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const K = 24;
  p.playerElo = Math.round(Math.max(200, Math.min(2600, p.playerElo + K * (score - expected))));
  p.gamesPlayed += 1;
  if (result === 'win') {
    p.wins += 1;
    p.streak = p.streak > 0 ? p.streak + 1 : 1;
  } else if (result === 'loss') {
    p.losses += 1;
    p.streak = p.streak < 0 ? p.streak - 1 : -1;
  } else {
    p.draws += 1;
    p.streak = 0;
  }
  saveLearningProfile(p);
  return p;
}

/** 段位查询 */
export function getRank(elo: number): { label: string; icon: string } {
  return RANKS.find((r) => elo >= r.min) || RANKS[RANKS.length - 1];
}

/** 自适应模式下 AI 的目标 ELO：始终比玩家强一点点（期望胜率 ≈ 45%），
 * 并叠加"连胜/连败动量"——玩家连胜时 AI 逐局变强（保持挑战），连败时 AI 温和放水（保护信心）。
 * 动量上限 ±42 ELO（约 ±2 档内），不会剧烈跳档。
 */
export function resolveAutoAiElo(playerElo: number, streak = 0): number {
  const momentum = Math.max(-42, Math.min(42, streak * 14));
  return playerElo + 22 + momentum;
}

export interface AiStrengthConfig {
  difficulty: XiangqiAIDifficulty;
  /** 玩家胜率期望（用于展示） */
  expectedWinRate: number;
}

/**
 * 将 AI 强度 ELO 映射到可执行难度档位（分段，深度/噪声平滑递增）。
 */
export function eloToDifficulty(aiElo: number): XiangqiAIDifficulty {
  if (aiElo >= 1800) return 'master';
  if (aiElo >= 1300) return 'hard';
  if (aiElo >= 850) return 'medium';
  return 'easy';
}

/**
 * 解析最终 AI 难度：
 * - 手动四档：原样返回
 * - auto：根据玩家 ELO 计算 AI 目标强度并映射档位
 */
export function resolveAiDifficulty(
  difficulty: XiangqiAIDifficulty | 'auto',
  playerElo: number,
): { actual: XiangqiAIDifficulty; targetElo: number; expectedWinRate: number } {
  if (difficulty !== 'auto') {
    return {
      actual: difficulty,
      targetElo: MANUAL_AI_ELO[difficulty] || 1000,
      expectedWinRate: 1 / (1 + Math.pow(10, (MANUAL_AI_ELO[difficulty] - playerElo) / 400)),
    };
  }
  const targetElo = resolveAutoAiElo(playerElo);
  return {
    actual: eloToDifficulty(targetElo),
    targetElo,
    expectedWinRate: 1 / (1 + Math.pow(10, (targetElo - playerElo) / 400)),
  };
}

// ================================================================
// L2 自我对弈学习（在 Worker 内运行，纯计算，无 DOM 依赖）
// ================================================================

/** 偏置学习率：每局 ±lr 分 */
const BIAS_LR = 1.0;
/** 偏置上下限 */
const BIAS_CLAMP = 20;

/**
 * 运行一轮自对弈训练：
 * 用当前权重下 N 局（低深度），统计胜方主力棋子偏好，产出偏置增量。
 * @param playMove 落子函数（由调用方注入，避免模块循环依赖）
 * @param games 对局数
 */
export function runSelfPlayLearning(
  games: number,
  playMove: (
    board: XiangqiBoard,
    color: XiangqiColor,
    weights: Record<string, number>,
  ) => XiangqiSquare[] | null,
  baseBias: Record<string, number>,
): { bias: Record<string, number>; rounds: number; redWins: number; blackWins: number; draws: number } {
  const bias: Record<string, number> = { ...(baseBias || {}) };

  // 本轮开局随机化：红方中炮 / 红方巡河炮 两种主流开局起步，避免同型对局
  const OPENINGS: Array<{ from: XiangqiSquare; to: XiangqiSquare }> = [
    { from: [7, 7], to: [7, 4] }, // 炮二平五（中炮）
    { from: [7, 1], to: [7, 4] }, // 炮八平五（左中炮）
    { from: [7, 1], to: [2, 1] }, // 炮八进二（巡河炮）
  ];

  let redWins = 0;
  let blackWins = 0;
  let drawCount = 0;

  // 评估终局剩余子力（主力棋子统计）
  const countMainPieces = (board: XiangqiBoard, color: XiangqiColor) => {
    const counts: Record<string, number> = {};
    for (const row of board) {
      for (const p of row) {
        if (!p) continue;
        const isRed = p === p.toUpperCase();
        if ((color === 'r' && isRed) || (color === 'b' && !isRed)) {
          const t = p.toLowerCase();
          if (t === 'r' || t === 'c' || t === 'n' || t === 'p') {
            counts[t] = (counts[t] || 0) + 1;
          }
        }
      }
    }
    return counts;
  };

  for (let g = 0; g < games; g++) {
    let board = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
    let turn: XiangqiColor = 'r';
    let moveCount = 0;
    const opening = OPENINGS[g % OPENINGS.length];
    board = applyXiangqiMove(board, opening.from, opening.to).board;
    turn = 'b';
    moveCount = 1;

    let status = getXiangqiGameStatus(board, turn);
    let winner: XiangqiColor | null = null;
    const maxPlies = 120; // 防止无限循环（长将等）
    while ((status === 'playing' || status === 'check') && moveCount < maxPlies) {
      const mv = playMove(board, turn, bias);
      if (!mv) break;
      board = applyXiangqiMove(board, mv[0], mv[1]).board;
      turn = turn === 'r' ? 'b' : 'r';
      moveCount += 1;
      status = getXiangqiGameStatus(board, turn);
      // 简单和棋检测：仅双方只剩将/仕/相时判和
      let materialCount = 0;
      for (const row of board) {
        for (const p of row) {
          if (p) materialCount += 1;
        }
      }
      if (materialCount <= 4) {
        status = 'draw';
        break;
      }
    }

    if (status === 'checkmate') {
      // 被将死方是当前行棋方 → 对方获胜
      winner = turn === 'r' ? 'b' : 'r';
    } else if (status === 'stalemate') {
      winner = turn === 'r' ? 'b' : 'r';
    } else {
      status = 'draw';
    }

    if (winner === 'r') redWins += 1;
    else if (winner === 'b') blackWins += 1;
    else drawCount += 1;

    if (winner) {
      // 胜方主力子价值偏置微升，负方主力子偏置微降（经验反哺）
      const winCounts = countMainPieces(board, winner);
      const loser = winner === 'r' ? 'b' : 'r';
      const loseCounts = countMainPieces(board, loser);
      for (const t of ['r', 'c', 'n', 'p'] as const) {
        const w = winCounts[t] || 0;
        if (w > 0) {
          bias[t] = clampBias((bias[t] || 0) + BIAS_LR * 0.4 * w);
        }
        const l = loseCounts[t] || 0;
        if (l > 0) {
          bias[t] = clampBias((bias[t] || 0) - BIAS_LR * 0.2 * l);
        }
      }
      // 区域学习：统计胜方/负方"过河"主力子，学习推进价值（过河棋子是胜势关键）
      const countCrossed = (side: XiangqiColor) => {
        const counts: Record<string, number> = {};
        for (let rowIdx = 0; rowIdx < board.length; rowIdx++) {
          for (const p of board[rowIdx]) {
            if (!p) continue;
            const isRedPiece = p === p.toUpperCase();
            if ((side === 'r') !== isRedPiece) continue;
            const t = p.toLowerCase();
            if (t !== 'r' && t !== 'c' && t !== 'n' && t !== 'p') continue;
            // 红方过河 = row<=4；黑方过河 = row>=5
            const over = isRedPiece ? rowIdx <= 4 : rowIdx >= 5;
            if (over) counts[t] = (counts[t] || 0) + 1;
          }
        }
        return counts;
      };
      const wCross = countCrossed(winner);
      const lCross = countCrossed(loser);
      for (const t of ['r', 'c', 'n', 'p'] as const) {
        const wc = wCross[t] || 0;
        const lc = lCross[t] || 0;
        if (wc > 0) {
          const k = `z_${t}_cross`;
          bias[k] = clampZoneBias((bias[k] || 0) + BIAS_LR * 0.5 * wc);
        }
        if (lc > 0) {
          const k = `z_${t}_cross`;
          bias[k] = clampZoneBias((bias[k] || 0) - BIAS_LR * 0.25 * lc);
        }
      }
    }
  }

  return { bias, rounds: games, redWins, blackWins, draws: drawCount };
}

function clampBias(v: number): number {
  return Math.max(-BIAS_CLAMP, Math.min(BIAS_CLAMP, Math.round(v * 10) / 10));
}

/** 区域偏置（过河价值）上限更保守：±12 分 */
function clampZoneBias(v: number): number {
  return Math.max(-12, Math.min(12, Math.round(v * 10) / 10));
}

// ================================================================
// L3 开局库（标准开局变例）
// ================================================================

interface BookEntry {
  /** 对应总走子数（红黑合计，从 0 开始） */
  ply: number;
  color: XiangqiColor;
  from: XiangqiSquare;
  to: XiangqiSquare;
  note: string;
}

/** 中炮对屏风马主变 + 顺炮应手（每步都有说明，方便孩子学习开局套路） */
const OPENING_BOOK: BookEntry[] = [
  // 1. 红 炮二平五（中炮开局，控制中路）
  { ply: 0, color: 'r', from: [7, 7], to: [7, 4], note: '中炮开局：炮镇中路' },
  // 2. 黑 马8进7（屏风马应中炮）
  { ply: 1, color: 'b', from: [0, 1], to: [2, 2], note: '屏风马：马8进7' },
  // 3. 红 马二进三（跳正马保护中兵）
  { ply: 2, color: 'r', from: [9, 7], to: [7, 6], note: '红方跳马' },
  // 4. 黑 马2进3（双马结成屏风）
  { ply: 3, color: 'b', from: [0, 7], to: [2, 6], note: '黑方跳马' },
  // 5. 红 车一平二（出直车，占领肋道）
  { ply: 4, color: 'r', from: [9, 8], to: [7, 8], note: '红方出车' },
  // 6. 黑 卒3进1（活通马腿）
  { ply: 5, color: 'b', from: [3, 2], to: [4, 2], note: '黑卒3进1' },
  // 7. 红 车二进六（过河压马，形成中炮过河车）
  { ply: 6, color: 'r', from: [7, 8], to: [1, 8], note: '中炮过河车' },
  // 8. 黑 象7进5（补象巩固中路）
  { ply: 7, color: 'b', from: [0, 6], to: [1, 5], note: '黑方补象' },
  // 9. 红 兵七进一（活通七路马，保持中路压力）
  { ply: 8, color: 'r', from: [6, 6], to: [5, 6], note: '红兵七进一' },
  // 10. 黑 炮8平9（平炮兑车，邀兑过河车解压）
  { ply: 9, color: 'b', from: [2, 7], to: [2, 8], note: '黑炮8平9兑车' },
  // 11. 红 车二平三（压马，保持过河车牵制）
  { ply: 10, color: 'r', from: [1, 8], to: [1, 7], note: '红车压马' },
  // 12. 黑 炮2平1（左炮平边，活通右马）
  { ply: 11, color: 'b', from: [2, 1], to: [2, 0], note: '黑炮2平1' },
];

/** 黑方应中炮的另一主流变例（顺炮直车） */
const OPENING_BOOK_ALTERNATE: BookEntry[] = [
  { ply: 1, color: 'b', from: [2, 1], to: [2, 4], note: '顺炮：黑炮2平5' },
  { ply: 2, color: 'r', from: [9, 7], to: [7, 6], note: '红方跳马' },
  { ply: 3, color: 'b', from: [0, 7], to: [2, 6], note: '黑方跳马' },
  { ply: 4, color: 'r', from: [9, 8], to: [7, 8], note: '红方出车' },
  { ply: 5, color: 'b', from: [3, 7], to: [4, 7], note: '黑卒7进1' },
  { ply: 6, color: 'r', from: [7, 8], to: [2, 8], note: '红车过河' },
  { ply: 7, color: 'b', from: [0, 6], to: [1, 5], note: '黑方补象' },
];

/** 红方首步可用的主流开局（随机选择，避免每局千篇一律） */
const RED_OPENINGS: Array<{ from: XiangqiSquare; to: XiangqiSquare; note: string }> = [
  { from: [7, 7], to: [7, 4], note: '中炮开局：炮镇中路' },
  { from: [6, 2], to: [5, 2], note: '仙人指路：兵三进一' },
  { from: [9, 6], to: [7, 4], note: '飞相局：相三进五' },
];

/** 黑方应红方首步的主流应手（随机选择） */
const BLACK_RESPONSES: Array<{ from: XiangqiSquare; to: XiangqiSquare; note: string }> = [
  { from: [0, 1], to: [2, 2], note: '屏风马：马8进7' },
  { from: [2, 1], to: [2, 4], note: '顺炮：黑炮2平5' },
  { from: [0, 7], to: [2, 6], note: '反宫马：马2进3' },
];

/**
 * 查询开局库着法（随机变例，避免固定套路；着法不合法由调用方回退搜索）。
 * @param ply 当前总走子数（0 = 红方第一步）
 * @param color 当前行棋方
 * @param board 当前局面（用于校验着法合法性，调用方负责最终校验）
 * @returns 预置着法（from/to 坐标）或 null
 */
export function getOpeningMove(
  ply: number,
  color: XiangqiColor,
  board: XiangqiBoard,
): XiangqiSquare[] | null {
  if (ply >= 12) return null; // 开局库覆盖前 12 步（8 步主变 + 4 步续走，孩子可学到更完整开局套路）

  // 红方首步：三种主流开局随机
  if (ply === 0 && color === 'r') {
    const pick = RED_OPENINGS[(Math.random() * RED_OPENINGS.length) | 0];
    return pick ? [pick.from, pick.to] : null;
  }
  // 黑方应手：三种主流应法随机（不论红方走哪种开局都合法）
  if (ply === 1 && color === 'b') {
    const pick = BLACK_RESPONSES[(Math.random() * BLACK_RESPONSES.length) | 0];
    return pick ? [pick.from, pick.to] : null;
  }

  // 其余步数：主变优先；红方非中炮开局时主变着法不合法会自动回退搜索
  const entries = OPENING_BOOK.filter((e) => e.ply === ply && e.color === color);
  const alt = OPENING_BOOK_ALTERNATE.filter((e) => e.ply === ply && e.color === color);
  const candidates = entries.length ? entries : alt;
  if (!candidates.length) return null;

  // 着法是否在当前棋盘上可行（该格有对应颜色棋子且目标在界内）
  const [fr, fc] = candidates[0].from;
  const [tr, tc] = candidates[0].to;
  if (!board[fr] || !board[fr][fc]) return null;
  const piece = board[fr][fc];
  const isRedPiece = piece === piece.toUpperCase();
  if ((color === 'r') !== isRedPiece) return null;
  if (!board[tr] || board[tr][tc] === undefined) return null;
  return candidates[0].from && candidates[0].to ? [candidates[0].from, candidates[0].to] : null;
}

/** 获取当前步数的开局提示（用于状态条展示「AI 走开局套路」） */
export function getOpeningNote(ply: number, color: XiangqiColor): string | null {
  const book = OPENING_BOOK.concat(OPENING_BOOK_ALTERNATE);
  const e = book.find((x) => x.ply === ply && x.color === color);
  return e ? e.note : null;
}
