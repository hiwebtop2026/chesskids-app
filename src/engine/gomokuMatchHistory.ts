/**
 * ChessKids - 五子棋人机对战历史走棋记录
 *
 * 用途：保存玩家与 AI 最近 10 盘完整走棋记录（含难度、执子方、结果、
 * 完整落子序列），用于：
 * 1. 玩家复盘：查看历史对局的落子明细与结果
 * 2. AI 引擎参考：为后续 AI 训练/难度校准提供真实对局数据
 *
 * 存储：localStorage（近 10 盘，先进先出；隐私模式/配额满时静默降级）
 */
import type { GomokuColor } from './gomoku';

// ================================================================
// 类型
// ================================================================

export interface GomokuMoveStep {
  /** 落子方 */
  color: GomokuColor;
  /** 行 */
  r: number;
  /** 列 */
  c: number;
}

export type GomokuMatchResult = 'win' | 'loss' | 'draw';

export interface GomokuMatchRecord {
  /** 唯一标识（时间戳+随机） */
  id: string;
  /** 对局结束时间戳（ms） */
  timestamp: number;
  /** 难度 key */
  difficultyKey: 'easy' | 'medium' | 'hard' | 'master';
  /** 难度显示名 */
  difficultyLabel: string;
  /** 玩家执子方 */
  humanColor: GomokuColor;
  /** 玩家视角结果 */
  result: GomokuMatchResult;
  /** 本局总落子数 */
  totalPlies: number;
  /** 完整落子序列（黑先白后，moves[0] 为黑方第一手） */
  moves: GomokuMoveStep[];
}

// ================================================================
// 常量与存储
// ================================================================

const STORAGE_KEY = 'gomoku_match_history_v1';
/** 最多保留最近 10 盘 */
export const MAX_GOMOKU_MATCH_RECORDS = 10;

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
export function loadGomokuMatchHistory(): GomokuMatchRecord[] {
  const raw = readStorage();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as GomokuMatchRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && Array.isArray(r.moves))
      .slice(0, MAX_GOMOKU_MATCH_RECORDS);
  } catch {
    return [];
  }
}

/**
 * 追加一条对局记录（自动去重、截断为近 10 盘）。
 * @param record 完整对局记录
 * @returns 更新后的记录列表（最新在前）
 */
export function saveGomokuMatchRecord(record: GomokuMatchRecord): GomokuMatchRecord[] {
  const list = loadGomokuMatchHistory().filter((r) => r.id !== record.id);
  list.unshift(record);
  const trimmed = list.slice(0, MAX_GOMOKU_MATCH_RECORDS);
  writeStorage(JSON.stringify(trimmed));
  return trimmed;
}

/** 删除指定记录 */
export function clearGomokuMatchHistory(): GomokuMatchRecord[] {
  writeStorage('[]');
  return [];
}

// ================================================================
// 导出（棋谱文本 / JSON——供复盘分享与 AI 引擎参考/训练）
// ================================================================

const RESULT_TEXT: Record<GomokuMatchResult, string> = {
  win: '玩家胜',
  loss: '玩家负',
  draw: '和棋',
};

/** 生成单盘棋谱文本（含对局信息 + 完整记谱，人类可读） */
export function exportGomokuMatchToText(r: GomokuMatchRecord): string {
  const head = [
    `对局时间：${new Date(r.timestamp).toLocaleString()}`,
    `AI 难度：${r.difficultyLabel}`,
    `玩家执子：${r.humanColor === 'b' ? '黑棋（先手）' : '白棋（后手）'}`,
    `结果：${RESULT_TEXT[r.result]}`,
    `总落子数：${r.totalPlies}`,
    '',
  ].join('\n');
  const rows: string[] = [];
  for (let i = 0; i < r.moves.length; i += 2) {
    const b = r.moves[i];
    const w = r.moves[i + 1];
    const bTxt = b ? `${b.color === 'b' ? '黑' : '白'}(${b.r + 1},${b.c + 1})` : '';
    const wTxt = w ? `${w.color === 'b' ? '黑' : '白'}(${w.r + 1},${w.c + 1})` : '';
    rows.push(`${i / 2 + 1}. ${bTxt}${wTxt ? '  ' + wTxt : ''}`);
  }
  return `${head}棋谱：\n${rows.join('\n')}`;
}

/** 导出全部历史记录为 JSON 字符串（机器可读，完整走棋序列——供 AI 引擎参考/训练） */
export function exportGomokuMatchHistoryJson(): string {
  return JSON.stringify(loadGomokuMatchHistory(), null, 2);
}

/** 生成唯一 id */
export function genGomokuMatchRecordId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
