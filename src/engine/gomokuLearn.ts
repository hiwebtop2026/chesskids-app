/**
 * ChessKids - 五子棋自学习模块（v5）
 *
 * 基于近 10 盘对局记录，提炼两类可执行经验：
 * 1. 开局胜负加权：AI 先手时偏好历史胜率高的开局点（仍保持随机多样性）
 * 2. 防守激进度：历史输局越多，组合威胁必堵阈值越低、防守权重越高
 *
 * 纯前端实现（localStorage），无后端依赖；数据随对局自动更新。
 */
import type { GomokuMatchRecord } from './gomokuMatchHistory';
import type { GomokuLearnData } from './gomokuAI';

const STORAGE_KEY = 'gomoku_learning_v1';

/**
 * 分析对局记录，提炼自学习数据。
 * @param records 近 10 盘记录（最新在前）
 */
export function analyzeHistory(records: GomokuMatchRecord[]): GomokuLearnData {
  // ---- 开局胜负统计（仅 AI 执黑先手的对局：humanColor==='w'） ----
  const openingMap = new Map<string, { r: number; c: number; w: number; l: number }>();
  for (const rec of records) {
    if (rec.humanColor === 'w' && rec.moves.length >= 1) {
      const m0 = rec.moves[0];
      if (typeof m0.r !== 'number' || typeof m0.c !== 'number') continue;
      const key = `${m0.r},${m0.c}`;
      const e = openingMap.get(key) || { r: m0.r, c: m0.c, w: 0, l: 0 };
      if (rec.result === 'win') e.w++;
      else if (rec.result === 'loss') e.l++;
      openingMap.set(key, e);
    }
  }
  // 权重：基础 10，每胜 +3、每负 -3（至少保留 1，避免直接抹掉某个开局）
  const opening = Array.from(openingMap.values())
    .map((e) => ({ r: e.r, c: e.c, w: Math.max(1, 10 + (e.w - e.l) * 3) }))
    .filter((e) => e.w > 0);

  // ---- 防守激进度：输局越多越激进（0=默认，3=极高） ----
  const losses = records.filter((r) => r.result === 'loss').length;
  const defenseLevel = Math.min(3, losses >= 6 ? 3 : losses >= 3 ? 2 : losses >= 1 ? 1 : 0);

  return { opening, defenseLevel };
}

/** 保存自学习数据（隐私模式/配额满时静默降级） */
export function saveGomokuLearning(data: GomokuLearnData): GomokuLearnData {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 静默降级 */
  }
  return data;
}

/** 读取自学习数据；无数据或格式异常返回 null */
export function loadGomokuLearning(): GomokuLearnData | null {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { opening?: Array<{ r: number; c: number; w: number }>; defenseLevel?: number };
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      opening: Array.isArray(parsed.opening)
        ? parsed.opening.filter((e) => e && typeof e.r === 'number' && typeof e.c === 'number' && e.w > 0)
        : [],
      defenseLevel: typeof parsed.defenseLevel === 'number' ? Math.min(3, Math.max(0, Math.floor(parsed.defenseLevel))) : 0,
    };
  } catch {
    return null;
  }
}
