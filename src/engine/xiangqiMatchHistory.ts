/**
 * ChessKids - 中国象棋人机对战历史走棋记录
 *
 * 用途：保存玩家与 AI 最近 N 盘完整走棋记录（含难度、执子方、结果、ELO、
 * 完整走子序列），用于：
 * 1. 玩家复盘：查看历史对局的走棋明细与结果
 * 2. AI 引擎参考：为后续 AI 训练/难度校准提供真实对局数据（如分析玩家常走开局、
 *    各难度对局胜负分布、AI 应手质量等）
 *
 * 存储：localStorage（近 10 盘，先进先出；隐私模式/配额满时静默降级）
 */
import type { XiangqiColor, XiangqiSquare, XiangqiPiece } from '../types/xiangqi';
import type { XiangqiAIDifficulty } from './xiangqiAI';

// ================================================================
// 类型
// ================================================================

export interface XiangqiMoveStep {
  /** 起点 [row, col] */
  from: XiangqiSquare;
  /** 终点 [row, col] */
  to: XiangqiSquare;
  /** 走子棋子（大写=红、小写=黑） */
  piece: XiangqiPiece;
  /** 被吃棋子（如有） */
  captured?: XiangqiPiece;
}

export interface XiangqiMatchRecord {
  /** 唯一标识（时间戳+随机） */
  id: string;
  /** 对局结束时间戳（ms） */
  timestamp: number;
  /** 界面选择的难度档（含自适应） */
  difficulty: XiangqiAIDifficulty | 'auto';
  /** AI 本局实际使用难度（auto 时解析后的实际档） */
  actualDifficulty: XiangqiAIDifficulty;
  /** 玩家执子方 */
  humanColor: XiangqiColor;
  /** 玩家视角结果 */
  result: 'win' | 'loss' | 'draw';
  /** 对局结束时玩家 ELO */
  playerElo: number;
  /** 本局总走子数（单步） */
  totalPlies: number;
  /** 完整走子序列（红黑交替，moves[0] 为红方先手） */
  moves: XiangqiMoveStep[];
}

// ================================================================
// 常量与存储
// ================================================================

const STORAGE_KEY = 'xiangqi_match_history_v1';
/** 最多保留最近 10 盘 */
export const MAX_MATCH_RECORDS = 10;

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

/** 读取全部历史记录（已按时间倒序，最新的在前） */
export function loadMatchHistory(): XiangqiMatchRecord[] {
  const raw = readStorage();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as XiangqiMatchRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && Array.isArray(r.moves))
      .slice(0, MAX_MATCH_RECORDS);
  } catch {
    return [];
  }
}

/**
 * 追加一条对局记录（自动去重、截断为近 10 盘）。
 * @param record 完整对局记录
 * @returns 更新后的记录列表（最新在前）
 */
export function saveMatchRecord(record: XiangqiMatchRecord): XiangqiMatchRecord[] {
  const list = loadMatchHistory().filter((r) => r.id !== record.id);
  list.unshift(record);
  const trimmed = list.slice(0, MAX_MATCH_RECORDS);
  writeStorage(JSON.stringify(trimmed));
  return trimmed;
}

/** 删除指定记录（供"清空历史"使用） */
export function clearMatchHistory(): XiangqiMatchRecord[] {
  writeStorage('[]');
  return [];
}

/** 生成唯一 id */
export function genMatchRecordId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
