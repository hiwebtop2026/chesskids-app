/**
 * 掼蛋 AI 对家引擎（联机模式专用）
 *
 * 功能：
 * - 自动出牌（自由出牌 / 跟牌 / 出牌 / 不出）
 * - 团队配合策略：队友头游后全力送牌、不压队友
 * - 角色分工：主攻型（冲头游）/ 辅助型（送队友）/ 防守型（压对手）
 * - 动态角色切换：根据手牌强度和队友状态实时调整
 * - 炸弹决策：精准把握炸与不炸的时机
 *
 * 使用场景：联机房间人数不足时，用 AI 补位，实现 1 人 + 3 AI / 2 人 + 2 AI / 3 人 + 1 AI
 */

import {
  type GCard, type PlayInfo, type PlayType,
  cardVal, isWild, levelRank, groupByR, groupHand,
  analyzePlay, canBeat, bombCandidates, findSmallestBeat,
} from '../modules/GuandanGame';

// ================================================================
// 难度配置
// ================================================================
export type GDAIDifficulty = 'easy' | 'medium' | 'hard' | 'master';

export interface GDAIConfig {
  difficulty: GDAIDifficulty;
  /** 思考延迟（毫秒），模拟真人思考 */
  thinkDelay: number;
}

const DIFFICULTY_CONFIG: Record<GDAIDifficulty, {
  thinkDelay: number;
  bombWeight: number; rocketWeight: number; straightFlushWeight: number;
  kingWeight: number; bigCardWeight: number; straightWeight: number;
  singlePenalty: number; wildValue: number;
  aggressiveThreshold: number; supportThreshold: number;
  mustBombThreshold: number; partnerSaveThreshold: number;
  /** 失误概率（0-1），简单难度有概率乱出 */
  mistakeChance: number;
}> = {
  easy: {
    thinkDelay: 1200,
    bombWeight: 8, rocketWeight: 25, straightFlushWeight: 18,
    kingWeight: 4, bigCardWeight: 1.5, straightWeight: 2,
    singlePenalty: 1, wildValue: 4,
    aggressiveThreshold: 75, supportThreshold: 25,
    mustBombThreshold: 3, partnerSaveThreshold: 3,
    mistakeChance: 0.25,
  },
  medium: {
    thinkDelay: 900,
    bombWeight: 10, rocketWeight: 30, straightFlushWeight: 22,
    kingWeight: 5, bigCardWeight: 2, straightWeight: 3,
    singlePenalty: 2, wildValue: 6,
    aggressiveThreshold: 65, supportThreshold: 35,
    mustBombThreshold: 5, partnerSaveThreshold: 5,
    mistakeChance: 0.08,
  },
  hard: {
    thinkDelay: 700,
    bombWeight: 12, rocketWeight: 35, straightFlushWeight: 26,
    kingWeight: 6, bigCardWeight: 2.5, straightWeight: 4,
    singlePenalty: 2.5, wildValue: 7,
    aggressiveThreshold: 58, supportThreshold: 40,
    mustBombThreshold: 7, partnerSaveThreshold: 7,
    mistakeChance: 0.02,
  },
  master: {
    thinkDelay: 500,
    bombWeight: 14, rocketWeight: 40, straightFlushWeight: 30,
    kingWeight: 7, bigCardWeight: 3, straightWeight: 5,
    singlePenalty: 3, wildValue: 8,
    aggressiveThreshold: 52, supportThreshold: 45,
    mustBombThreshold: 9, partnerSaveThreshold: 8,
    mistakeChance: 0,
  },
};

export function getAIConfig(difficulty: GDAIDifficulty): GDAIConfig & typeof DIFFICULTY_CONFIG.easy {
  return { ...DIFFICULTY_CONFIG[difficulty], difficulty };
}

// ================================================================
// 手牌强度评估
// ================================================================
export function evaluateHandStrength(
  hand: GCard[],
  level: number,
  config: ReturnType<typeof getAIConfig>,
): number {
  let score = 0;

  // 1. 炸弹数量与质量
  const bombs = bombCandidates(hand, level);
  for (const b of bombs) {
    if (b.kind === 2) score += config.rocketWeight;
    else if (b.kind === 1) score += config.straightFlushWeight;
    else score += config.bombWeight + (b.n - 4) * 5;
  }

  // 2. 大牌数量
  const kings = hand.filter(c => c.k !== undefined).length;
  score += kings * config.kingWeight;

  const groups = groupByR(hand);
  const lr = levelRank(level);
  for (const [r, g] of groups) {
    if (r === 20 || r === 19) continue;
    const v = r === lr ? 16 : r === 15 ? 2 : r;
    if (v >= 13) score += g.length * config.bigCardWeight;
    else if (v >= 11) score += g.length * (config.bigCardWeight / 2);
  }

  // 3. 牌型完整度
  let straightCount = 0;
  const ranks = [...new Set(hand.filter(c => c.k === undefined).map(c => c.r))]
    .filter(r => r >= 3 && r <= 14).sort((a, b) => a - b);
  let runLen = 1;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1] + 1) { runLen++; if (runLen >= 5) straightCount++; }
    else runLen = 1;
  }
  score += straightCount * config.straightWeight;

  // 4. 单张数量惩罚
  let singleCount = 0;
  for (const g of groups.values()) {
    if (g.length === 1 && g[0].k === undefined) singleCount++;
  }
  score -= singleCount * config.singlePenalty;

  // 5. 变牌加分
  const wilds = hand.filter(c => isWild(c, level)).length;
  score += wilds * config.wildValue;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ================================================================
// 角色判断
// ================================================================
export type AIRole = 'aggressive' | 'normal' | 'support';

export function determineAIRole(
  handStrength: number,
  mySeat: number,
  partnerHandCount: number,
  _opponentHandCounts: number[],
  config: ReturnType<typeof getAIConfig>,
  headSeat: number,
): AIRole {
  const partnerSeat = mySeat ^ 2;

  // 队友已经头游 → 转为全力主攻（冲二游）
  if (headSeat === partnerSeat) return 'aggressive';

  // 自己已经快出完了 → 主攻
  if (partnerHandCount <= 5 && handStrength >= 40) return 'aggressive';

  // 队友牌很少（快出完了）→ 辅助送牌
  if (partnerHandCount <= 8) return 'support';

  // 根据手牌强度决定
  if (handStrength >= config.aggressiveThreshold) return 'aggressive';
  if (handStrength <= config.supportThreshold) return 'support';
  return 'normal';
}

// ================================================================
// 自由出牌（首攻）策略
// ================================================================
function aiLead(
  hand: GCard[],
  level: number,
  role: AIRole,
  _partnerHandCount: number,
  partnerHeadStart: boolean, // 队友是否头游（已出完）
): GCard[] {
  const groups = groupHand(hand, level);
  const byRank = groupByR(hand);

  // 队友已头游，自己冲刺：优先出整组牌型，尽快跑
  if (partnerHeadStart) {
    const comboGroups = groups.filter(g =>
      g.label.includes('顺') || g.label.includes('连对') ||
      g.label.includes('钢板') || g.label.includes('三带')
    );
    if (comboGroups.length > 0) {
      comboGroups.sort((a, b) => cardVal(a.cards[0], level) - cardVal(b.cards[0], level));
      return comboGroups[0].cards;
    }
  }

  // 辅助型：出最小的牌送队友
  if (role === 'support') {
    // 优先出单张（队友大概率要单张）
    const singles: GCard[] = [];
    for (const g of byRank.values()) {
      if (g.length === 1 && g[0].k === undefined && !isWild(g[0], level)) {
        singles.push(g[0]);
      }
    }
    singles.sort((a, b) => cardVal(a, level) - cardVal(b, level));
    if (singles.length > 0) return [singles[0]];

    // 没单张出最小对子
    const pairs: GCard[][] = [];
    for (const g of byRank.values()) {
      if (g.length >= 2 && g.every(c => c.k === undefined) && !isWild(g[0], level)) {
        pairs.push(g.slice(0, 2));
      }
    }
    pairs.sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level));
    if (pairs.length > 0) return pairs[0];
  }

  // 主攻型：出最大的组合牌
  if (role === 'aggressive') {
    const comboGroups = groups.filter(g =>
      g.label.includes('顺') || g.label.includes('连对') ||
      g.label.includes('钢板') || g.label.includes('三带')
    );
    if (comboGroups.length > 0) {
      comboGroups.sort((a, b) => cardVal(a.cards[0], level) - cardVal(b.cards[0], level));
      return comboGroups[0].cards;
    }
  }

  // 普通型：根据牌型数量决定
  const pairs: GCard[][] = [];
  const singles: GCard[] = [];
  for (const g of byRank.values()) {
    if (g.length >= 2 && g.every(c => c.k === undefined) && !isWild(g[0], level)) {
      pairs.push(g.slice(0, 2));
    }
    if (g.length === 1 && g[0].k === undefined && !isWild(g[0], level)) {
      singles.push(g[0]);
    }
  }
  pairs.sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level));
  singles.sort((a, b) => cardVal(a, level) - cardVal(b, level));

  if (singles.length >= pairs.length && singles.length > 0) return [singles[0]];
  if (pairs.length > 0) return pairs[0];
  if (singles.length > 0) return [singles[0]];

  // 只剩变牌/王，出最小的
  const remaining = [...hand].sort((a, b) => cardVal(a, level) - cardVal(b, level));
  return [remaining[0]];
}

// ================================================================
// 炸弹决策
// ================================================================
function decideBomb(
  hand: GCard[],
  prev: PlayInfo,
  level: number,
  mySeat: number,
  lastPlayBy: number,
  handCounts: number[],
  role: AIRole,
  config: ReturnType<typeof getAIConfig>,
  headSeat: number,
): GCard[] | null {
  const bombs = bombCandidates(hand, level);
  if (bombs.length === 0) return null;

  const isMyTeamLast = (lastPlayBy === (mySeat ^ 2));
  const partnerSeat = mySeat ^ 2;

  // 队友刚出的牌 → 绝对不炸队友
  if (isMyTeamLast) return null;

  // 对手座位（两个）
  const opp1Seat = (mySeat + 1) % 4;
  const opp2Seat = (mySeat + 3) % 4;
  const opp1Count = handCounts[opp1Seat];
  const opp2Count = handCounts[opp2Seat];
  const minOppCount = Math.min(opp1Count, opp2Count);
  const partnerCount = handCounts[partnerSeat];

  // 队友已头游 → 自己要冲，少用炸弹（除非必要）
  if (headSeat === partnerSeat) {
    if (minOppCount <= 3 && prev.type !== 'BOMB' && prev.type !== 'ROCKET') {
      for (const b of bombs) {
        const info = { type: 'BOMB' as PlayType, key: b.key, size: b.n, cards: b.cards };
        if (canBeat(prev, info) && b.kind === 0 && b.n <= 5) return b.cards;
      }
    }
    return null;
  }

  // 对手剩牌极少（≤ 必须炸阈值）→ 必须炸
  if (minOppCount <= config.mustBombThreshold) {
    for (const b of bombs) {
      const info = { type: 'BOMB' as PlayType, key: b.key, size: b.n, cards: b.cards };
      if (canBeat(prev, info)) return b.cards;
    }
  }

  // 上家（对手）剩牌不多且出较大牌 → 考虑炸
  const upperOppSeat = (mySeat + 3) % 4; // 上家是左手边
  const upperOppCount = handCounts[upperOppSeat];
  if (upperOppSeat === lastPlayBy && upperOppCount <= config.mustBombThreshold + 3) {
    for (const b of bombs) {
      const info = { type: 'BOMB' as PlayType, key: b.key, size: b.n, cards: b.cards };
      if (canBeat(prev, info) && b.kind === 0 && b.n <= 5) return b.cards;
    }
  }

  // 辅助型：队友牌少的时候不浪费炸弹，让队友冲
  if (role === 'support' && partnerCount <= config.partnerSaveThreshold + 3) {
    return null;
  }

  // 主攻型：手牌好的时候可以用炸弹抢出牌权
  if (role === 'aggressive' && hand.length <= 15) {
    for (const b of bombs) {
      const info = { type: 'BOMB' as PlayType, key: b.key, size: b.n, cards: b.cards };
      if (canBeat(prev, info) && b.kind === 0 && b.n <= 4) return b.cards;
    }
  }

  // 对手牌很多 → 不炸
  if (minOppCount > config.mustBombThreshold + 12) return null;

  return null;
}

// ================================================================
// 跟牌决策
// ================================================================
function aiFollow(
  hand: GCard[],
  prev: PlayInfo,
  level: number,
  mySeat: number,
  lastPlayBy: number,
  handCounts: number[],
  role: AIRole,
  config: ReturnType<typeof getAIConfig>,
  headSeat: number,
  finished: number[] = [],
  roundPass: number[] = [],
): GCard[] | null {
  const isMyTeamLast = (lastPlayBy === (mySeat ^ 2));

  // 队友刚出最大牌 → 让
  if (isMyTeamLast) return null;

  // 找最小能压住的牌
  const beat = findSmallestBeat(hand, prev, level);
  if (!beat) {
    // 没普通牌可大 → 考虑炸弹
    return decideBomb(hand, prev, level, mySeat, lastPlayBy, handCounts, role, config, headSeat);
  }

  const beatInfo = analyzePlay(beat, level);
  if (!beatInfo) return null;

  const opponentSeats = [(mySeat + 1) % 4, (mySeat + 3) % 4];
  const minOppCount = Math.min(...opponentSeats.map(s => handCounts[s]));
  const partnerSeat = mySeat ^ 2;
  const partnerCount = handCounts[partnerSeat];

  // 队友快出完（≤2 张）且我让牌后正好轮到队友 → 让牌给队友压（团队配合）
  const nextAfterAI = ((mySeat + 1) % 4 + 4) % 4;
  if (
    partnerCount <= 2 &&
    nextAfterAI === partnerSeat &&
    !finished.includes(partnerSeat) &&
    !roundPass.includes(partnerSeat) &&
    minOppCount > 2
  ) {
    return null;
  }

  // 对手即将出完（≤2 张）→ 能压必压，阻止对手抢先
  if (minOppCount <= 2) {
    return beat;
  }

  // 辅助型策略：尽量不压牌，保留大牌给队友
  if (role === 'support') {
    // 用王/大牌单压 → 尽量不出，留给关键时候
    if (beat.length === 1 && beat[0].k !== undefined) {
      if (hand.length > 8 && minOppCount > 10) {
        const bomb = decideBomb(hand, prev, level, mySeat, lastPlayBy, handCounts, role, config, headSeat);
        if (bomb) return bomb;
        return null;
      }
      if (minOppCount <= config.mustBombThreshold) return beat;
    }

    // 用变牌单压 → 手牌多时保留
    if (beat.length === 1 && isWild(beat[0], level)) {
      if (hand.length > 10 && minOppCount > 8) return null;
    }

    // 差距太大 → 过
    const valDiff = beatInfo.key - prev.key;
    if (prev.type === 'SINGLE' && valDiff > 6 && hand.length > 12 && minOppCount > 10) {
      return null;
    }
  }

  // 主攻型策略：能压就压，抢出牌权
  if (role === 'aggressive') {
    // 手牌不多了 → 尽量压
    if (hand.length <= 12) return beat;

    // 用王压的情况：谨慎
    if (beat.length === 1 && beat[0].k !== undefined && hand.length > 15 && minOppCount > 12) {
      // 看看有没有炸弹能替代
      const bomb = decideBomb(hand, prev, level, mySeat, lastPlayBy, handCounts, role, config, headSeat);
      if (bomb) return bomb;
      return null;
    }
  }

  // 普通型：综合判断
  if (beat.length === 1 && beat[0].k !== undefined) {
    if (hand.length > 8 && minOppCount > 10) {
      const bomb = decideBomb(hand, prev, level, mySeat, lastPlayBy, handCounts, role, config, headSeat);
      if (bomb) return bomb;
      return null;
    }
    if (minOppCount <= 5) return beat;
  }

  if (beat.length === 1 && isWild(beat[0], level)) {
    if (hand.length > 10 && minOppCount > 8) return null;
  }

  const valDiff = beatInfo.key - prev.key;
  if (prev.type === 'SINGLE' && valDiff > 5 && hand.length > 12 && minOppCount > 10) {
    return null;
  }

  return beat;
}

// ================================================================
// 主决策函数
// ================================================================
export interface AIDecisionContext {
  hand: GCard[];
  level: number;
  mySeat: number;
  lastPlay: { player: number; cards: GCard[] } | null;
  lastPlayBy: number;
  handCounts: number[]; // 4 个方位的剩余牌数
  finished: number[];   // 已出完的座位
  roundPass: number[];  // 本轮已 pass 的座位
  difficulty: GDAIDifficulty;
}

export interface AIDecisionResult {
  play: GCard[] | null;
  pass: boolean;
  reason: string;
}

export function aiDecide(ctx: AIDecisionContext): AIDecisionResult {
  const { hand, level, mySeat, lastPlay, lastPlayBy, handCounts, finished, difficulty } = ctx;
  const config = getAIConfig(difficulty);

  // 已出完 → 不该调用
  if (finished.includes(mySeat)) {
    return { play: null, pass: true, reason: '已出完' };
  }

  // 评估手牌强度
  const handStrength = evaluateHandStrength(hand, level, config);

  // 头游座位
  const headSeat = finished.length > 0 ? finished[0] : -1;
  const partnerSeat = mySeat ^ 2;

  // 确定角色
  const role = determineAIRole(
    handStrength,
    mySeat,
    handCounts[partnerSeat],
    [(mySeat + 1) % 4, (mySeat + 3) % 4].map(s => handCounts[s]),
    config,
    headSeat,
  );

  // 失误概率（简单难度）
  if (config.mistakeChance > 0 && Math.random() < config.mistakeChance) {
    // 失误：随机选择出最小牌或 pass
    if (!lastPlay) {
      // 自由出牌时失误：随便出一张最小单张
      const sorted = [...hand].sort((a, b) => cardVal(a, level) - cardVal(b, level));
      return { play: [sorted[0]], pass: false, reason: '失误(随机)' };
    }
    return { play: null, pass: true, reason: '失误(让牌)' };
  }

  // ===== 自由出牌 =====
  if (!lastPlay) {
    const play = aiLead(hand, level, role, handCounts[partnerSeat], headSeat === partnerSeat);
    return { play, pass: false, reason: `首攻(${role})` };
  }

  // ===== 跟牌 =====
  const prevInfo = analyzePlay(lastPlay.cards, level);
  if (!prevInfo) {
    return { play: null, pass: true, reason: '无法识别上家牌型' };
  }

  const play = aiFollow(hand, prevInfo, level, mySeat, lastPlayBy, handCounts, role, config, headSeat, finished, ctx.roundPass);

  if (play) {
    const info = analyzePlay(play, level);
    return { play, pass: false, reason: `跟牌(${role}, ${info?.type || '?'})` };
  }

  return { play: null, pass: true, reason: `无法压(${role})` };
}

// ================================================================
// AI 玩家管理
// ================================================================
export interface AIPlayer {
  seat: number;
  name: string;
  difficulty: GDAIDifficulty;
}

/**
 * 为 AI 玩家生成名字
 */
export function generateAINames(count: number): string[] {
  const names = ['小贯', '小蛋', '小掼', '阿贯', '阿蛋', '掼神', '蛋王', '牌仙'];
  const shuffled = [...names].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * 根据当前已连接的真实玩家数量，计算需要补位的 AI 数量
 */
export function calcNeededAIs(connectedPlayers: number, totalNeeded = 4): number {
  return Math.max(0, totalNeeded - connectedPlayers);
}
