/**
 * 掼蛋四人房间状态机（同构模块）
 * - 纯函数：发牌、进贡/还贡、出牌推进、接风、结算升级、视角遮罩
 * - 浏览器（单机/联机）与 Node 服务端共用，避免两套规则分叉
 */
import {
  type GCard,
  SUIT_SYMBOL, rankName, cardVal, isWild,
  buildDeck, shuffle,
} from './core.ts';
// ================================================================
// 座位与队伍：0=房主(南) 2=队友(北) 1/3=对手
// ================================================================
export const SEAT_NAMES = ['房主', '对手A', '队友', '对手B'];
export function teamOf(seat: number): number { return seat === 0 || seat === 2 ? 0 : 1; }

// ================================================================
// 联机状态（与 GuandanGame 的 GameState 同构，lastPlay 只保留 cards）
// ================================================================
export interface GDGameState {
  hands: GCard[][];
  level: number;
  current: number;
  lastPlay: { player: number; cards: GCard[] } | null;
  lastPlayBy: number;
  turnStart: number;
  finished: number[];
  roundPass: number[];
  /** 本轮各方位已出的牌（一轮出完才清理），用于方位展示 */
  roundPlays: { player: number; cards: GCard[]; roundId: number }[];
  /** 一圈全过后标记为 true：保留出牌信息显示，直到下一次出牌才清除 */
  roundEnded: boolean;
  /** 当前轮次号：出牌区显示层只认当前轮，上一轮记录即使残留也不显示 */
  roundId: number;
  phase: 'playing' | 'over';
  winnerTeam: number | null;
  resultText: string;
  playerNames: string[];
  /** 打 A 连续未过局数（连续 3 把不过退回 2 重新打） */
  aStrikes: number;
  /** 双下进贡计划（结算时设置，下一局发牌后自动进贡/还贡） */
  tributePlan: { from: number; to: number }[] | null;
  /** 进贡/还贡提示（新一局开始时展示一次） */
  gongMessage: string;
  /** 各家剩余手牌数：服务端视角遮罩时用它代替被隐藏的 hands */
  handCounts?: number[];
}

/** 兼容旧命名（联机组件此前使用的类型名） */
export type GDOnlineState = GDGameState;

// ================================================================
// 纯函数状态机（房主侧）：applyTurn(state, player, playCards|null)
// ================================================================
// 找到下一个未出完（未 finished）的玩家：头游后跳过，避免轮到空手玩家
export function nextAliveSeat(from: number, finished: number[]): number {
  let s = ((from % 4) + 4) % 4;
  for (let i = 0; i < 4; i++) {
    const p = (s + i) % 4;
    if (!finished.includes(p)) return p;
  }
  return s;
}

/** 状态一致性校验：确保 current 永远指向有牌、未出完的活人；手牌为空者强制加入 finished */
export function validateGDState(st: GDGameState): GDGameState {
  if (st.phase !== 'playing') return st;
  let changed = false;
  const finished = [...st.finished];
  // 1. 手牌为空但不在 finished 中 → 强制加入（防御：极端情况下漏登记）
  for (let p = 0; p < 4; p++) {
    if (st.hands[p].length === 0 && !finished.includes(p)) {
      finished.push(p);
      changed = true;
    }
  }
  // 2. 手牌不为空但在 finished 中 → 移除（防御：状态回退异常）
  const cleanedFinished = finished.filter((p) => st.hands[p].length === 0);
  if (cleanedFinished.length !== finished.length) changed = true;
  // 3. current 指向已出完玩家 → 推进到下一位活人
  let current = st.current;
  if (cleanedFinished.includes(current) || st.hands[current]?.length === 0) {
    current = nextAliveSeat(current + 1, cleanedFinished);
    changed = true;
  }
  // 4. 只剩一个活人 → 游戏结束（防御：死循环）
  const alive = [0, 1, 2, 3].filter((p) => !cleanedFinished.includes(p));
  if (alive.length <= 1 && cleanedFinished.length >= 3) {
    // 把最后一个活人也加入 finished，按顺序排名
    if (alive.length === 1 && !cleanedFinished.includes(alive[0])) {
      const finalFinished = [...cleanedFinished, alive[0]];
      return { ...st, finished: finalFinished, phase: 'over' as const, current: finalFinished[0], lastPlay: null, lastPlayBy: -1 };
    }
  }
  if (!changed) return st;
  return { ...st, finished: cleanedFinished, current, turnStart: current };
}

export function gdApplyTurn(prev: GDGameState, player: number, play: GCard[] | null): GDGameState {
  // ========== 入口前置校验：确保 prev 状态本身一致 ==========
  // 防御：如果传入状态已经不一致（如 current 指向已出完玩家），先修正再处理
  const st = validateGDState(prev);
  // 校验后发现游戏已结束 → 直接返回，不再处理任何出牌
  if (st.phase !== 'playing') return st;

  const hands = st.hands.map((h) => [...h]);
  const roundPass = [...st.roundPass];
  const finished = [...st.finished];
  // 出牌时：若上一轮已结束（roundEnded），清除旧 roundPlays 重新开始；否则追加
  // 记录一律带 roundId：显示层只显示当前轮，双保险杜绝上轮残留
  const roundPlays = play
    ? (st.roundEnded ? [{ player, cards: play, roundId: st.roundId }] : [...st.roundPlays, { player, cards: play, roundId: st.roundId }])
    : st.roundPlays;

  // 安全修正：如果传入的 player 已经出完，直接推进到下一位活人，避免死循环
  if (finished.includes(player)) {
    const next = nextAliveSeat(player + 1, finished);
    return { ...st, current: next, turnStart: next };
  }

  if (play) {
    hands[player] = hands[player].filter((c) => !play.some((p) => p.id === c.id));
    if (hands[player].length === 0) {
      finished.push(player);
      // 双下判定：前两名同队（0↔2、1↔3）→ 对方必为 3、4 名，胜负已定，立即结算
      const duo = finished.length >= 2 && ((finished[0] ^ 2) === finished[1]);
      if (finished.length === 4 || duo) {
        const order = [...finished];
        // 双下且对方未打完：按剩余手牌数推定 3、4 游（多者末游进贡、少者三游）
        if (duo && finished.length < 4) {
          const opps = [0, 1, 2, 3].filter((s) => !finished.includes(s));
          const ranked = [...opps].sort((a, b) => hands[b].length - hands[a].length);
          order.push(ranked[1], ranked[0]); // 少者=三游(order[2])、多者=末游(order[3])
        }
        const myTeamWon = teamOf(order[0]) === 0;
        let up: number; let txt: string;
        let tributePlan: { from: number; to: number }[] | null = null;
        if (myTeamWon) {
          if (teamOf(order[1]) === 0) { up = 3; txt = '双下！升 3 级'; tributePlan = [{ from: order[3], to: order[0] }, { from: order[2], to: order[1] }]; }
          else if (teamOf(order[2]) === 0) { up = 2; txt = '升 2 级'; }
          else { up = 1; txt = '升 1 级'; }
        } else {
          if (teamOf(order[1]) === 1) { up = 3; txt = '对手方双下，升 3 级'; tributePlan = [{ from: order[3], to: order[0] }, { from: order[2], to: order[1] }]; }
          else if (teamOf(order[2]) === 1) { up = 2; txt = '对手方升 2 级'; }
          else { up = 1; txt = '对手方升 1 级'; }
        }
        let newLevel = st.level + up;
        let resultText = txt;
        let winnerTeam: number | null = null;
        let aStrikes = st.aStrikes || 0;
        if (st.level === 14) {
          // 打 A 中：必须双上（己方 1、2 名）才算过 A 获胜
          if (myTeamWon && up >= 3) {
            winnerTeam = 0; newLevel = 14; aStrikes = 0;
            resultText = '🏆 双上打过 A！头游方获胜！';
          } else if (!myTeamWon && up >= 3) {
            // 对方双上打过 A：退回 2 重新打
            newLevel = 2; aStrikes = 0;
            resultText = '对手方双上打过 A，退回 2 重新打';
          } else {
            aStrikes += 1;
            if (aStrikes >= 3) {
              newLevel = 2; aStrikes = 0;
              resultText = '连续 3 把未过 A，退回 2 重新打';
            } else {
              newLevel = 14;
              resultText = `打 A 未过（第 ${aStrikes} 把，连 3 把不过退回 2）`;
            }
          }
        } else if (newLevel > 14) {
          // 升超 A：一律停在 14（A）继续打 A 局，不直接判胜（打 A 须双上才赢）
          newLevel = 14;
          resultText = myTeamWon ? '🚀 打到 A！下一局双上即获胜！' : '对手方打到 A，须双上才能赢';
        } else if (newLevel === 14) {
          resultText = myTeamWon ? '🚀 打到 A！下一局双上即获胜！' : '对手方打到 A，须双上才能赢';
        }
        return {
          ...st, hands, roundPass: [], roundPlays, roundEnded: false, finished, phase: 'over', winnerTeam, resultText,
          level: newLevel, aStrikes, tributePlan, current: order[0], lastPlay: null, lastPlayBy: -1,
        };
      }
    }
    // 出牌后推进轮次：跳过头游等已出完玩家
    const nextSeat = nextAliveSeat(player + 1, finished);
    return {
      ...st, hands,
      lastPlay: { player, cards: play }, lastPlayBy: player, roundPass: [], roundPlays, roundEnded: false,
      current: nextSeat, turnStart: nextSeat,
    };
  }
  // 不出
  roundPass.push(player);
  // 一圈结束：除最后出牌者外，所有未出完玩家都已 pass
  // （有玩家头游后活人数减少，pass 满 3 可能永远不满足 → 按"活人-1"判定，避免上一轮牌面残留）
  const aliveNotBy = [0, 1, 2, 3].filter((p) => !finished.includes(p) && p !== st.lastPlayBy);
  if (roundPass.length >= Math.max(1, aliveNotBy.length)) {
    // 一圈全过 → 立即清空四家出牌信息，下一轮出牌从零开始
    // 接风规则：最后出牌者已出完（头游）时，由其对家（队友）接风自由出牌；否则最后出牌者自由出牌
    let freer: number;
    if (finished.includes(st.lastPlayBy)) {
      // 最后出牌者已出完：队友接风；若队友也出完，找下一位活人
      const partner = st.lastPlayBy ^ 2;
      freer = finished.includes(partner) ? nextAliveSeat(st.lastPlayBy + 1, finished) : partner;
    } else {
      freer = st.lastPlayBy;
    }
    // 双重保险：freer 必须是活人
    if (finished.includes(freer)) freer = nextAliveSeat(freer + 1, finished);
    return { ...st, hands, roundPass: [], roundPlays: [], roundEnded: true, roundId: st.roundId + 1, current: freer, lastPlay: null, lastPlayBy: freer };
  }
  const nextSeat = nextAliveSeat(player + 1, finished);
  return { ...st, hands, roundPass, roundPlays, current: nextSeat };
}

export function gdNewGame(
  level: number,
  names: string[],
  firstSeat: number,
  keepStrikes = 0,
  tributePlan: { from: number; to: number }[] | null = null,
  rng: () => number = Math.random,
): GDGameState {
  const deck = shuffle(buildDeck(), rng);
  const hands: GCard[][] = [[], [], [], []];
  deck.forEach((c, i) => hands[i % 4].push(c));
  // 双下进贡/还贡：末游/三游进贡给头游/二游最大牌，头游/二游还一张 ≤10 的牌
  // 职业规则抗贡：进贡方持有红桃级牌（变牌）或两张大王 → 抗贡（免进贡也不收还贡），抗贡后仍由上盘头游先出
  let gong = '';
  let antiSeat: number | undefined;
  if (tributePlan && tributePlan.length > 0) {
    for (const t of tributePlan) {
      const from = hands[t.from];
      const to = hands[t.to];
      if (from.length === 0 || to.length === 0) continue;
      const hasWild = from.some((c) => isWild(c, level));
      const hasTwoBigJokers = from.filter((c) => c.k === 1).length >= 2;
      if (hasWild || hasTwoBigJokers) {
        gong += `${names[t.from] || SEAT_NAMES[t.from]} ${hasTwoBigJokers ? '持有两张大王' : '持有红桃级牌'}，抗贡！；`;
        if (antiSeat === undefined) antiSeat = t.from;
        continue;
      }
      let maxIdx = 0;
      for (let i = 1; i < from.length; i++) {
        if (cardVal(from[i], level) > cardVal(from[maxIdx], level)) maxIdx = i;
      }
      const given = from.splice(maxIdx, 1)[0];
      let backIdx = -1;
      for (let i = 0; i < to.length; i++) {
        const c = to[i];
        if (c.k === undefined && cardVal(c, level) <= 10 && !isWild(c, level)) {
          if (backIdx < 0 || cardVal(c, level) < cardVal(to[backIdx], level)) backIdx = i;
        }
      }
      if (backIdx >= 0) {
        const back = to.splice(backIdx, 1)[0];
        to.push(given);
        from.push(back);
        gong += `${names[t.from] || SEAT_NAMES[t.from]} 进贡 ${rankName(given.r)}${given.k === undefined ? SUIT_SYMBOL[given.s] : (given.k === 1 ? '大王' : '小王')}，${names[t.to] || SEAT_NAMES[t.to]} 还贡 ${rankName(back.r)}${SUIT_SYMBOL[back.s]}；`;
      } else {
        to.push(given);
        gong += `${names[t.from] || SEAT_NAMES[t.from]} 进贡 ${rankName(given.r)}${given.k === undefined ? SUIT_SYMBOL[given.s] : (given.k === 1 ? '大王' : '小王')}；`;
      }
    }
    gong = `🔄 ${gong}`;
  }
  // 抗贡时继续由上盘头游（tributePlan[0].to）先出
  const firstSeat2 = antiSeat !== undefined ? tributePlan![0].to : firstSeat;
  return {
    hands, level, current: firstSeat2, lastPlay: null, lastPlayBy: -1, turnStart: firstSeat2,
    finished: [], roundPass: [], roundPlays: [], roundEnded: false, roundId: 0, phase: 'playing', winnerTeam: null, resultText: '', playerNames: names,
    aStrikes: keepStrikes, tributePlan: null, gongMessage: gong,
    handCounts: hands.map((h) => h.length),
  };
}

// ================================================================
// 服务端视角遮罩
// - 自己：完整手牌
// - 队友：仅在本方头游（明牌规则）时可见完整手牌
// - 对手：只给剩余张数，不下发牌面（防作弊 + 减小消息体积）
// ================================================================
export function shouldRevealPartner(st: GDGameState, viewer: number): boolean {
  if (st.finished.length === 0) return false;
  const head = st.finished[0];
  const partner = viewer ^ 2;
  return teamOf(head) === teamOf(viewer)
    && head !== partner
    && !st.finished.includes(partner);
}

export function maskStateFor(st: GDGameState, viewer: number): GDGameState {
  const seat = ((viewer % 4) + 4) % 4;
  const revealPartner = shouldRevealPartner(st, seat);
  const partner = seat ^ 2;
  return {
    ...st,
    hands: st.hands.map((h, i) => (i === seat || (revealPartner && i === partner) ? h : [])),
    handCounts: st.hands.map((h) => h.length),
  };
}
