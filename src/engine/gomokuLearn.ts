/**
 * ChessKids - 五子棋自学习模块（v5→v7）
 *
 * 基于近 10 盘对局记录，提炼三类可执行经验：
 * 1. 开局胜负加权：AI 先手时偏好历史胜率高的开局点（保底权重 + 最近使用抑制，
 *    避免收敛到单一开局——v7 修复：对局记录 10 盘中 (8,10) 出现 7 次）
 * 2. 防守激进度：历史输局越多，组合威胁必堵阈值越低、防守权重越高
 * 3. 人类偏好方向（v7）：统计人类获胜五连的方向（横/竖/两斜），
 *    高发方向防守权重提升——修复"长线累积做棋"防守滞后
 *
 * 纯前端实现（localStorage），无后端依赖；数据随对局自动更新。
 */
import type { GomokuMatchRecord } from './gomokuMatchHistory';
import type { GomokuLearnData } from './gomokuAI';

const STORAGE_KEY = 'gomoku_learning_v1';

/** v7：五连方向检测（最后一手所在线的 5 连方向） */
function winningDirection(moves: Array<{ color: string; r: number; c: number }>): 'h' | 'v' | 'd1' | 'd2' | null {
  if (moves.length === 0) return null;
  const last = moves[moves.length - 1];
  const { r, c } = last;
  const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const names: Array<'v' | 'h' | 'd1' | 'd2'> = ['v', 'h', 'd1', 'd2'];
  // 构造迷你棋盘检查五连（仅判断方向，无需完整棋盘）
  for (let di = 0; di < DIRS.length; di++) {
    const [dr, dc] = DIRS[di];
    let cnt = 1;
    for (let s = 1; s <= 4; s++) {
      const nr = r - dr * s, nc = c - dc * s;
      if (nr < 0 || nr >= 19 || nc < 0 || nc >= 19) break;
      const mv = moves.find((m) => m.r === nr && m.c === nc && m.color === last.color);
      if (!mv) break;
      cnt++;
    }
    for (let s = 1; s <= 4; s++) {
      const nr = r + dr * s, nc = c + dc * s;
      if (nr < 0 || nr >= 19 || nc < 0 || nc >= 19) break;
      const mv = moves.find((m) => m.r === nr && m.c === nc && m.color === last.color);
      if (!mv) break;
      cnt++;
    }
    if (cnt >= 5) return names[di];
  }
  return null;
}

/**
 * 分析对局记录，提炼自学习数据。
 * @param records 近 10 盘记录（最新在前）
 */
export function analyzeHistory(records: GomokuMatchRecord[]): GomokuLearnData {
  // ---- 开局胜负统计（仅 AI 执黑先手的对局：humanColor==='w'） ----
  const openingMap = new Map<string, { r: number; c: number; w: number; l: number; recent: number }>();
  for (const rec of records) {
    if (rec.humanColor === 'w' && rec.moves.length >= 1) {
      const m0 = rec.moves[0];
      if (typeof m0.r !== 'number' || typeof m0.c !== 'number') continue;
      const key = `${m0.r},${m0.c}`;
      const e = openingMap.get(key) || { r: m0.r, c: m0.c, w: 0, l: 0, recent: 0 };
      if (rec.result === 'win') e.w++;
      else if (rec.result === 'loss') e.l++;
      openingMap.set(key, e);
    }
  }
  // v7 权重：基础 10，每胜 +4、每负 -4；保底下限 3（避免收敛单一开局）
  // 最近使用抑制：最新 3 盘用过的开局权重减半（保持开局多样性，避免"总走同一手"）
  const recentKeys = new Set<string>();
  let ri = 0;
  for (const rec of records) {
    if (ri >= 3) break;
    if (rec.humanColor === 'w' && rec.moves.length >= 1 && typeof rec.moves[0].r === 'number') {
      recentKeys.add(`${rec.moves[0].r},${rec.moves[0].c}`);
      ri++;
    }
  }
  const opening = Array.from(openingMap.values())
    .map((e) => {
      let w = Math.max(3, 10 + (e.w - e.l) * 4);
      if (recentKeys.has(`${e.r},${e.c}`)) w *= 0.5;
      return { r: e.r, c: e.c, w: Math.max(1, w) };
    })
    .filter((e) => e.w > 0);

  // ---- 防守激进度：输局越多越激进（0=默认，3=极高） ----
  const losses = records.filter((r) => r.result === 'loss').length;
  const defenseLevel = Math.min(3, losses >= 6 ? 3 : losses >= 3 ? 2 : losses >= 1 ? 1 : 0);

  // ---- v7 人类偏好方向：统计人类获胜五连的方向（AI 执黑输给人类/人类赢的局） ----
  const dirCount: Record<string, number> = { h: 0, v: 0, d1: 0, d2: 0 };
  for (const rec of records) {
    // 人类获胜（AI 执黑输了）→ 人类五连方向即 AI 的防守弱点方向
    if (rec.result === 'win' && rec.humanColor === 'w') {
      const dir = winningDirection(rec.moves);
      if (dir) dirCount[dir]++;
    }
  }
  const maxDir = Math.max(1, dirCount.h, dirCount.v, dirCount.d1, dirCount.d2);
  const dirWeights = {
    h: 1 + dirCount.h / maxDir * 0.6,
    v: 1 + dirCount.v / maxDir * 0.6,
    d1: 1 + dirCount.d1 / maxDir * 0.6,
    d2: 1 + dirCount.d2 / maxDir * 0.6,
  };

  return { opening, defenseLevel, dirWeights };
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
    const parsed = JSON.parse(raw) as { opening?: Array<{ r: number; c: number; w: number }>; defenseLevel?: number; dirWeights?: { h: number; v: number; d1: number; d2: number } };
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      opening: Array.isArray(parsed.opening)
        ? parsed.opening.filter((e) => e && typeof e.r === 'number' && typeof e.c === 'number' && e.w > 0)
        : [],
      defenseLevel: typeof parsed.defenseLevel === 'number' ? Math.min(3, Math.max(0, Math.floor(parsed.defenseLevel))) : 0,
      dirWeights: parsed.dirWeights && typeof parsed.dirWeights.h === 'number'
        ? {
            h: Math.max(1, parsed.dirWeights.h),
            v: Math.max(1, parsed.dirWeights.v),
            d1: Math.max(1, parsed.dirWeights.d1),
            d2: Math.max(1, parsed.dirWeights.d2),
          }
        : undefined,
    };
  } catch {
    return null;
  }
}
