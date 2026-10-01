import { useState, useRef, useCallback, useEffect } from 'react';
import { enterFullscreen, exitFullscreen } from '../utils/fullscreen';
import {
  getLearningProfile, recordGameResult,
  resolveAutoAiDifficulty,
  type GDAIDifficulty,
  type GuandanLearningProfile,
} from '../engine/guandanLearning';

/**
 * 掼蛋 · 人机对战（经典规则，四人两两组队）
 * - 两副牌 108 张，每人 27 张
 * - 牌型：单张/对子/三张/三带二/顺子/连对/钢板/炸弹/同花顺/天王炸
 * - 从 2 打起逐级升级，打 A 双上获胜
 * - 双下进贡还贡
 */

// ================================================================
// 牌的数据模型
// r: 点数 3..14(A) / 15(2)；k: 0=小王 1=大王（王没有 r）
// s: 花色 'S'|'H'|'C'|'D'
// ================================================================
export interface GCard {
  id: number;
  s: string;
  r: number; // 王为占位 0
  k?: number; // 0=小王 1=大王
}

export const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };

export function rankName(r: number): string {
  if (r === 15) return '2';
  if (r === 14) return 'A';
  if (r === 13) return 'K';
  if (r === 12) return 'Q';
  if (r === 11) return 'J';
  return String(r);
}

// 级牌点数 → 牌面点数 r 的映射：级牌 2 在牌面中用 r=15 表示，A 用 r=14
export function levelRank(level: number): number {
  return level === 2 || level === 15 ? 15 : level;
}

// 牌值：用于牌型比较。王最大，级牌次之
export function cardVal(c: GCard, level: number): number {
  if (c.k === 1) return 18;
  if (c.k === 0) return 17;
  if (c.r === levelRank(level)) return 16;
  if (c.r === 15) return 2; // 非级牌 2 最小
  return c.r;
}

// 纯点数（级牌视为 16，王视为 17/18）
function pointVal(c: GCard, level: number): number {
  return cardVal(c, level);
}

// ================================================================
// 逢人配（变牌）：红桃级牌可当除大小王外任意牌；
// 作单张时只比王牌小、大于其他所有牌（含普通级牌）
// ================================================================
export function isWild(c: GCard, level: number): boolean {
  return c.k === undefined && c.s === 'H' && c.r === levelRank(level);
}
export const WILD_SINGLE_KEY = 16.5; // 单张牌力：> 级牌(16)、< 小王(17)
export const WILD_GROUP_KEY = 16.5;  // 双变牌成对/三张时的最大组值

// 顺子/连对用点数：2 不能进顺子，级牌在顺子里按原数
function seqVal(r: number): number {
  return r; // 3..14 参与顺子；15(2) 不可
}

// ================================================================
// 牌型识别
// ================================================================
export type PlayType = 'SINGLE' | 'PAIR' | 'TRIPLE' | 'TRIPLE_PAIR' | 'STRAIGHT' | 'PAIR_SEQ' | 'PLANE' | 'BOMB' | 'STRAIGHT_FLUSH' | 'ROCKET';

export interface PlayInfo {
  type: PlayType;
  key: number;   // 比较点数（同型比较）
  size: number;  // 张数（炸弹比张数）
  cards: GCard[];
}

const TYPE_RANK: Record<string, number> = { ROCKET: 8, STRAIGHT_FLUSH: 7, BOMB: 6 };

export function groupByR(cards: GCard[]): Map<number, GCard[]> {
  const m = new Map<number, GCard[]>();
  for (const c of cards) {
    const r = c.k !== undefined ? (c.k === 1 ? 20 : 19) : c.r;
    if (!m.has(r)) m.set(r, []);
    m.get(r)!.push(c);
  }
  return m;
}

// ================================================================
// 一键理牌：按可出牌型识别分组（同花顺/炸弹/三连对/三带二/三张/对子/单张），
// 每组竖排叠放并标注牌型（参考实战理牌：KQJ109 同花顺、5555 四炸、334455 三连对等）
// ================================================================
export interface HandGroup {
  label: string;
  cards: GCard[];
}

// 桌垫分区框线（参考比赛专用桌垫：出牌区/收牌区，去掉报牌区，网格紧凑对称）
// 背景装饰层，游戏牌面与出牌区浮于其上；文字按方位旋转（北倒/南正/西左/东右），外围大正方形白框
export const GD_ZONES: { top: number; left: number; w: number; h: number; label: string; dir: string }[] = [
  { top: 20, left: 44.5, w: 12, h: 12, label: '收牌区', dir: 'n' },
  { top: 34, left: 44.5, w: 12, h: 12, label: '出牌区', dir: 'c' },
  { top: 48, left: 16, w: 12, h: 12, label: '收牌区', dir: 'w' },
  { top: 48, left: 30, w: 12, h: 12, label: '出牌区', dir: 'w' },
  { top: 48, left: 58, w: 12, h: 12, label: '出牌区', dir: 'e' },
  { top: 48, left: 72, w: 12, h: 12, label: '收牌区', dir: 'e' },
  { top: 62, left: 44.5, w: 12, h: 12, label: '出牌区', dir: 's' },
  { top: 76, left: 44.5, w: 12, h: 12, label: '收牌区', dir: 's' },
];

export function groupHand(hand: GCard[], level: number): HandGroup[] {
  const used = new Set<number>();
  const out: HandGroup[] = [];
  const lr = levelRank(level);
  const take = (cards: GCard[], label: string) => {
    if (!cards || cards.length === 0) return;
    cards.forEach((c) => used.add(c.id));
    out.push({ label, cards: [...cards] }); // 保持传入顺序：三带二三张在前聚在一起、顺子按点数顺序
  };
  const avail = () => hand.filter((c) => !used.has(c.id));

  // 变牌（红桃级牌）优先参与组合：补同花顺/炸弹/三连对/三带二/三张/对子
  const wildsOf = (cs: GCard[]) => cs.filter((c) => isWild(c, level));

  // 1) 同花顺：先用真实同花顺，再用变牌补缺（优先高位 5 连）
  let sf = true;
  while (sf) {
    sf = false;
    for (const s of ['S', 'H', 'C', 'D']) {
      const sc = avail().filter((c) => c.s === s && c.k === undefined && !isWild(c, level));
      const ranks = [...new Set(sc.map((c) => c.r))].sort((a, b) => b - a);
      for (let i = 0; i + 4 < ranks.length; i++) {
        let len = 1;
        while (i + len < ranks.length && ranks[i + len] === ranks[i] - len) len++;
        if (len >= 5) {
          const want = ranks.slice(i, i + 5);
          const pick = want.map((r) => sc.find((c) => c.r === r)!).filter(Boolean);
          take(pick, '同花顺');
          sf = true;
          break;
        }
      }
      if (sf) break;
    }
    if (!sf) {
      // 变牌补缺：对每花色找 5 连区间（含缺口），缺口用变牌补
      for (const s of ['S', 'H', 'C', 'D']) {
        const sc = avail().filter((c) => c.s === s && c.k === undefined && !isWild(c, level));
        const base = new Set(sc.map((c) => c.r));
        const ws = wildsOf(avail());
        for (let hi = 14; hi >= 6; hi--) {
          const lo = hi - 4;
          let missing = 0;
          const want: number[] = [];
          for (let r = lo; r <= hi; r++) {
            if (base.has(r)) want.push(r);
            else missing++;
          }
          if (missing > 0 && missing <= ws.length) {
            const pick = want.map((r) => sc.find((c) => c.r === r)!).filter(Boolean);
            const extra = ws.slice(0, missing);
            take([...pick, ...extra], '同花顺');
            sf = true;
            break;
          }
        }
        if (sf) break;
      }
    }
  }

  // 2) 炸弹：同点数 4 张（变牌补足，优先 3+1 / 2+2）
  let bomb = true;
  while (bomb) {
    bomb = false;
    const ng = groupByR(avail().filter((c) => !isWild(c, level)));
    for (const [k, arr] of ng) {
      if (k < 19) {
        const ws = wildsOf(avail());
        if (arr.length >= 4) { take(arr.slice(0, 4), `${arr.length}炸`); bomb = true; break; }
        if (arr.length === 3 && ws.length >= 1) { take([...arr.slice(0, 3), ws[0]], '4炸'); bomb = true; break; }
        if (arr.length === 2 && ws.length >= 2) { take([...arr.slice(0, 2), ws[0], ws[1]], '4炸'); bomb = true; break; }
      }
    }
  }

  // 3) 三连对：3 组连续点数各一对（变牌可补对）
  let trio = true;
  while (trio) {
    trio = false;
    const ng = groupByR(avail().filter((c) => !isWild(c, level)));
    const ws = wildsOf(avail());
    const pairRanks = [...ng.entries()].filter(([, arr]) => arr.length >= 2).map(([k]) => k).sort((a, b) => b - a);
    // 可补：一组对缺 1 张可用 1 变牌，缺 2 张用 2 变牌
    for (let i = 0; i + 2 < pairRanks.length; i++) {
      if (pairRanks[i + 1] === pairRanks[i] - 1 && pairRanks[i + 2] === pairRanks[i] - 2) {
        const pick = [pairRanks[i], pairRanks[i + 1], pairRanks[i + 2]].flatMap((k) => ng.get(k)!.slice(0, 2));
        take(pick, `三连对 ${rankName(pairRanks[i])}`);
        trio = true;
        break;
      }
    }
    if (!trio) {
      // 缺口补：任选 3 个连续点，组内不足 2 的用变牌补
      const cand = [...ng.entries()].filter(([, arr]) => arr.length >= 1).map(([k, arr]) => ({ k, have: Math.min(2, arr.length) }));
      const rankSet = new Set(cand.map((c) => c.k));
      for (let hi = 14; hi >= 5; hi--) {
        const seq = [hi, hi - 1, hi - 2];
        if (!seq.every((r) => rankSet.has(r))) continue;
        let need = 0;
        const pick: GCard[] = [];
        for (const r of seq) {
          const item = cand.find((c) => c.k === r)!;
          pick.push(...ng.get(r)!.slice(0, item.have));
          need += 2 - item.have;
        }
        if (need > 0 && need <= ws.length) {
          take([...pick, ...ws.slice(0, need)], `三连对 ${rankName(hi)}`);
          trio = true;
          break;
        }
      }
    }
  }

  // 4) 顺子：5 张连续（非同花色；级牌 2/大小王不参与；变牌可补缺口）
  let str8 = true;
  while (str8) {
    str8 = false;
    const ng = groupByR(avail().filter((c) => c.k === undefined && !isWild(c, level)));
    const ranks = [...ng.keys()].filter((k) => k >= 3 && k <= 14).sort((a, b) => b - a);
    const ws = wildsOf(avail());
    for (let i = 0; i + 4 < ranks.length; i++) {
      let len = 1;
      while (i + len < ranks.length && ranks[i + len] === ranks[i] - len) len++;
      if (len >= 5) {
        const want = ranks.slice(i, i + 5);
        const pick = want.map((r) => ng.get(r)![0]).filter(Boolean);
        take(pick, `顺子 ${rankName(want[0])}`);
        str8 = true;
        break;
      }
    }
    if (!str8) {
      // 变牌补缺
      for (let hi = 14; hi >= 6; hi--) {
        const lo = hi - 4;
        let missing = 0;
        const want: number[] = [];
        for (let r = lo; r <= hi; r++) {
          if (ng.has(r)) want.push(r);
          else missing++;
        }
        if (missing > 0 && missing <= ws.length) {
          const pick = want.map((r) => ng.get(r)![0]).filter(Boolean);
          take([...pick, ...ws.slice(0, missing)], `顺子 ${rankName(hi)}`);
          str8 = true;
          break;
        }
      }
    }
  }

  // 5) 三带二：三张 + 一对（变牌补）
  let full = true;
  while (full) {
    full = false;
    const ng = groupByR(avail().filter((c) => !isWild(c, level)));
    const ws = wildsOf(avail());
    const trips = [...ng.entries()].filter(([, arr]) => arr.length >= 3).map(([k]) => k).sort((a, b) => b - a);
    for (const t of trips) {
      const pair = [...ng.entries()].find(([k, arr]) => k < 19 && k !== t && arr.length >= 2);
      if (pair) { take([...ng.get(t)!.slice(0, 3), ...pair[1].slice(0, 2)], `三带二 ${rankName(t)}`); full = true; break; }
    }
    if (!full) {
      for (const t of trips) {
        const pair = [...ng.entries()].find(([k, arr]) => k < 19 && k !== t && arr.length >= 1);
        if (pair && pair[1].length === 1 && ws.length >= 1) {
          take([...ng.get(t)!.slice(0, 3), pair[1][0], ws[0]], `三带二 ${rankName(t)}`);
          full = true; break;
        }
      }
    }
    if (!full) {
      for (const t of trips) {
        if (ws.length >= 2) {
          take([...ng.get(t)!.slice(0, 3), ws[0], ws[1]], `三带二 ${rankName(t)}`);
          full = true; break;
        }
      }
    }
  }

  // 6) 剩余：三张 / 对子 / 单张（变牌补三张/对子；单张变牌为顶级单张）
  const rest = [...groupByR(avail()).entries()].sort((a, b) => {
    const ka = a[0] >= 19 ? 100 : a[0];
    const kb = b[0] >= 19 ? 100 : b[0];
    return kb - ka;
  });
  for (const [, arr] of rest) {
    const c0 = arr[0];
    if (c0.k === 1) take(arr, '大王');
    else if (c0.k === 0) take(arr, '小王');
    else if (isWild(c0, level)) {
      // 变牌单张：只比王牌小（若有多张变牌则补成三张/对子）
      const curWs = wildsOf(avail());
      if (curWs.length >= 3) take(curWs.slice(0, 3), '三张 ·变');
      else if (curWs.length >= 2) take(curWs.slice(0, 2), '对子 ·变');
      else take([c0], '变牌 顶级单张');
    }
    else if (arr.length === 3) take(arr, `三张 ${rankName(c0.r)}${c0.r === lr ? '·级' : ''}`);
    else if (arr.length === 2) take(arr, `对子 ${rankName(c0.r)}${c0.r === lr ? '·级' : ''}`);
    else take(arr, `单张 ${rankName(c0.r)}${c0.r === lr ? '·级' : ''}`);
  }
  return out;
}

// 识别一组牌型；不合法返回 null（变牌=红桃级牌，可补任意牌，但不可变王）
export function analyzePlay(cards: GCard[], level: number): PlayInfo | null {
  const n = cards.length;
  if (n === 0) return null;
  const wilds = cards.filter((c) => isWild(c, level));
  const normal = cards.filter((c) => !isWild(c, level));
  const w = wilds.length;
  const norm = cards.map((c) => ({ c, v: pointVal(c, level) }));
  norm.sort((a, b) => a.v - b.v);

  // 天王炸：四张王
  if (n === 4 && cards.every((c) => c.k !== undefined)) {
    return { type: 'ROCKET', key: 19, size: 4, cards };
  }

  // 单张：变牌单张只比王牌小
  if (n === 1) {
    return { type: 'SINGLE', key: isWild(cards[0], level) ? WILD_SINGLE_KEY : norm[0].v, size: 1, cards };
  }

  const groups = groupByR(cards);
  const sizes = [...groups.values()].map((g) => g.length).sort((a, b) => a - b);
  const ranks = [...groups.keys()].sort((a, b) => a - b);
  const pureSame = n >= 2 && groups.size === 1;

  // 对子：变牌可补
  if (n === 2) {
    if (w === 2) return { type: 'PAIR', key: WILD_GROUP_KEY, size: 2, cards };
    if (w === 1 && normal.length === 1 && normal[0].k === undefined) return { type: 'PAIR', key: cardVal(normal[0], level), size: 2, cards };
    if (w === 0 && pureSame && cards.every((c) => c.k === undefined)) return { type: 'PAIR', key: cardVal(cards[0], level), size: 2, cards };
    return null;
  }

  // 三张：变牌可补
  if (n === 3) {
    if (w === 3) return { type: 'TRIPLE', key: WILD_GROUP_KEY, size: 3, cards };
    if (w === 2 && normal.length === 1 && normal[0].k === undefined) return { type: 'TRIPLE', key: cardVal(normal[0], level), size: 3, cards };
    if (w === 1 && normal.length === 2 && normal[0].k === undefined && normal[0].r === normal[1].r) return { type: 'TRIPLE', key: cardVal(normal[0], level), size: 3, cards };
    if (w === 0 && pureSame && cards.every((c) => c.k === undefined)) return { type: 'TRIPLE', key: cardVal(cards[0], level), size: 3, cards };
    return null;
  }

  // 炸弹：同点数 count + 变牌补足（不含王，变牌不可变王）
  if (n >= 4) {
    for (const [k, arr] of groupByR(normal)) {
      if (k < 19 && arr.length + w === n && w <= 3) {
        return { type: 'BOMB', key: cardVal(arr[0], level), size: n, cards };
      }
    }
  }

  const onlySeqOk = (rs: number[]): boolean => {
    for (let i = 1; i < rs.length; i++) if (rs[i] !== rs[i - 1] + 1) return false;
    return rs.every((r) => r >= 3 && r <= 14); // 2 不能进顺
  };

  // 三带二：三张 + 对（变牌可补三张或补对）
  if (n === 5) {
    const ng = groupByR(normal);
    const nArr = [...ng.values()].filter((g) => g.every((c) => c.k === undefined));
    const g3 = nArr.find((g) => g.length >= 3);
    if (g3) {
      const pair = nArr.find((g) => g !== g3 && g.length >= 2);
      if (pair && pair.length + g3.length + w === 5) {
        return { type: 'TRIPLE_PAIR', key: cardVal(g3[0], level), size: 5, cards };
      }
      if (!pair && g3.length === 3 && w === 2) {
        return { type: 'TRIPLE_PAIR', key: cardVal(g3[0], level), size: 5, cards };
      }
      if (pair && pair.length === 1 && g3.length + 1 + w === 5) {
        return { type: 'TRIPLE_PAIR', key: cardVal(g3[0], level), size: 5, cards };
      }
    }
  }

  // 钢板（连续三张，无翅膀）
  if (w === 0 && n >= 6 && n % 3 === 0 && sizes.every((s) => s === 3) && onlySeqOk(ranks)) {
    return { type: 'PLANE', key: cardVal(cards.find((c) => c.r === ranks[ranks.length - 1])!, level), size: n, cards };
  }

  // 连对（3+ 对连续）
  if (w === 0 && n >= 6 && n % 2 === 0 && sizes.every((s) => s === 2) && onlySeqOk(ranks)) {
    return { type: 'PAIR_SEQ', key: cardVal(cards.find((c) => c.r === ranks[ranks.length - 1])!, level), size: n, cards };
  }

  // 顺子 / 同花顺（变牌补缺口）
  if (n >= 5 && normal.every((c) => c.k === undefined)) {
    const base = new Set<number>();
    let dup = false;
    for (const c of normal) {
      if (base.has(c.r)) { dup = true; break; }
      base.add(c.r);
    }
    if (!dup) {
      const rs = [...base].sort((a, b) => a - b);
      if (rs[rs.length - 1] <= 14) {
        for (let hi = Math.min(14, Math.max(...rs)); hi >= 3; hi--) {
          const lo = hi - n + 1;
          if (lo < 3) break;
          let missing = 0;
          let bad = false;
          for (let r = lo; r <= hi; r++) if (!base.has(r)) missing++;
          for (const r of rs) if (r < lo || r > hi) { bad = true; break; }
          if (!bad && missing === w) {
            // 同花顺：normal 同花色（变牌随花色）
            if (new Set(normal.map((c) => c.s)).size === 1) {
              return { type: 'STRAIGHT_FLUSH', key: seqVal(hi), size: n, cards };
            }
            return { type: 'STRAIGHT', key: seqVal(hi), size: n, cards };
          }
        }
      }
    }
  }

  return null;
}

// 判断 cur 能否大过 prev
export function canBeat(prev: PlayInfo, cur: PlayInfo): boolean {
  const pr = TYPE_RANK[prev.type] || 1;
  const cr = TYPE_RANK[cur.type] || 1;
  if (cr > pr) return true;
  if (cr < pr) return false;
  if (prev.type === 'BOMB') {
    if (cur.type !== 'BOMB') return false;
    if (cur.size !== prev.size) return cur.size > prev.size;
    return cur.key > prev.key;
  }
  if (prev.type === 'STRAIGHT_FLUSH') {
    if (cur.type !== 'STRAIGHT_FLUSH') return false;
    if (cur.size !== prev.size) return false;
    return cur.key > prev.key;
  }
  if (prev.type === 'ROCKET') return false;
  // 普通牌型：必须同型且点数更大
  if (cur.type !== prev.type) return false;
  return cur.key > prev.key;
}

// ================================================================
// 发牌
// ================================================================
export function buildDeck(): GCard[] {
  const deck: GCard[] = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (const s of ['S', 'H', 'C', 'D']) {
      for (let r = 3; r <= 15; r++) deck.push({ id: id++, s, r });
    }
    deck.push({ id: id++, s: 'J', r: 0, k: 0 }); // 小王
    deck.push({ id: id++, s: 'J', r: 0, k: 1 }); // 大王
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ================================================================
// AI 策略
// ================================================================
export function findSmallestBeat(hand: GCard[], prev: PlayInfo, level: number): GCard[] | null {
  const groups = groupByR(hand);
  // 同型找最小能大
  if (prev.type === 'SINGLE') {
    let best: GCard[] | null = null;
    for (const g of groups.values()) {
      if (g.some((c) => c.k !== undefined)) continue;
      const v = cardVal(g[0], level);
      if (v > prev.key) {
        if (!best || v < cardVal(best[0], level)) best = [g[0]];
      }
    }
    // 王
    const ks = hand.filter((c) => c.k !== undefined).sort((a, b) => (b.k! - a.k!));
    for (const k of ks) {
      const v = cardVal(k, level);
      if (v > prev.key) { if (!best || v < cardVal(best[0], level)) best = [k]; }
    }
    return best;
  }
  if (prev.type === 'PAIR') {
    let best: GCard[] | null = null;
    for (const g of groups.values()) {
      if (g.length >= 2 && g.every((c) => c.k === undefined) && cardVal(g[0], level) > prev.key) {
        if (!best || cardVal(g[0], level) < cardVal(best[0], level)) best = g.slice(0, 2);
      }
    }
    return best;
  }
  if (prev.type === 'TRIPLE') {
    let best: GCard[] | null = null;
    for (const g of groups.values()) {
      if (g.length >= 3 && g.every((c) => c.k === undefined) && cardVal(g[0], level) > prev.key) {
        if (!best || cardVal(g[0], level) < cardVal(best[0], level)) best = g.slice(0, 3);
      }
    }
    return best;
  }
  if (prev.type === 'TRIPLE_PAIR') {
    const threeG = [...groups.values()].filter((g) => g.length >= 3 && g.every((c) => c.k === undefined)).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level));
    for (const g3 of threeG) {
      if (cardVal(g3[0], level) <= prev.key) continue;
      const pairG = [...groups.values()].find((g) => g !== g3 && g.length >= 2 && g.every((c) => c.k === undefined));
      if (pairG) return [...g3.slice(0, 3), ...pairG.slice(0, 2)];
    }
    return null;
  }
  // 顺子/连对/钢板：搜索组合
  if (prev.type === 'STRAIGHT' || prev.type === 'STRAIGHT_FLUSH') {
    const len = prev.size;
    const seq = findSeq(hand, len, prev.key + 1, false);
    return seq;
  }
  if (prev.type === 'PAIR_SEQ') {
    const len = prev.size / 2;
    return findSeq(hand, len * 2, prev.key + 1, true);
  }
  if (prev.type === 'PLANE') {
    const len = prev.size / 3;
    return findSeq(hand, len * 3, prev.key + 1, false, true);
  }
  // 同型找不到时：尝试用炸弹/同花顺/王炸压（如对方出对子，提示可用炸弹压）
  const bombBeat = findBombBeat(hand, prev, level);
  if (bombBeat) return bombBeat;
  return null;
}

// 找最小可压炸弹：4炸→5炸→同花顺→王炸（炸弹间张数多者大，同张数比点数；同花顺大于炸弹、小于王炸）
function findBombBeat(hand: GCard[], prev: PlayInfo, level: number): GCard[] | null {
  if (prev.type === 'ROCKET') return null;
  const groups = groupByR(hand);
  const kings = hand.filter((c) => c.k !== undefined);
  interface Cand { cards: GCard[]; kind: number; n: number; key: number }
  // kind: 0=普通炸弹(比张数n，同张数比点数key) 1=同花顺(比key) 2=王炸
  const cands: Cand[] = [];
  for (const g of groups.values()) {
    if (g.some((c) => c.k !== undefined)) continue;
    if (g.length >= 4) cands.push({ cards: g.slice(0, 4), kind: 0, n: g.length, key: cardVal(g[0], level) });
  }
  const sf = findStraightFlush(hand);
  if (sf) cands.push({ cards: sf, kind: 1, n: 5, key: Math.max(...sf.filter((c) => c.k === undefined).map((c) => c.r)) });
  if (kings.length === 4) cands.push({ cards: kings, kind: 2, n: 4, key: 0 });

  const ok = cands.filter((c) => {
    if (prev.type === 'BOMB') {
      if (c.kind === 0) return c.n > prev.size || (c.n === prev.size && c.key > prev.key);
      return true; // 同花顺/王炸都大于炸弹
    }
    if (prev.type === 'STRAIGHT_FLUSH') {
      if (c.kind === 1) return c.key > prev.key;
      return c.kind === 2;
    }
    return true; // 普通牌型：任何炸弹都能压
  });
  if (!ok.length) return null;
  ok.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind - b.kind;
    if (a.kind === 0) return a.n !== b.n ? a.n - b.n : a.key - b.key;
    if (a.kind === 1) return a.key - b.key;
    return 0;
  });
  return ok[0].cards;
}

// 找 5 张同花色连续（纯牌，不含变牌；变牌补同花顺由出牌校验/理牌负责）
export function findStraightFlush(hand: GCard[]): GCard[] | null {
  for (const s of ['S', 'H', 'C', 'D']) {
    const sc = hand.filter((c) => c.s === s && c.k === undefined);
    const ranks = [...new Set(sc.map((c) => c.r))].filter((r) => r >= 3 && r <= 14).sort((a, b) => b - a);
    for (let i = 0; i + 4 < ranks.length; i++) {
      let len = 1;
      while (i + len < ranks.length && ranks[i + len] === ranks[i] - len) len++;
      if (len >= 5) {
        const want = ranks.slice(i, i + 5);
        return want.map((r) => sc.find((c) => c.r === r)!);
      }
    }
  }
  return null;
}

// 所有炸弹候选（4炸→5炸→同花顺→王炸 升序；供"连续点提示循环切换"枚举）
export function bombCandidates(hand: GCard[], level: number): { cards: GCard[]; kind: number; n: number; key: number }[] {
  const groups = groupByR(hand);
  const kings = hand.filter((c) => c.k !== undefined);
  const out: { cards: GCard[]; kind: number; n: number; key: number }[] = [];
  for (const g of groups.values()) {
    if (g.some((c) => c.k !== undefined)) continue;
    if (g.length >= 4) out.push({ cards: g.slice(0, 4), kind: 0, n: g.length, key: cardVal(g[0], level) });
  }
  for (const s of ['S', 'H', 'C', 'D']) {
    const sc = hand.filter((c) => c.s === s && c.k === undefined);
    const ranks = [...new Set(sc.map((c) => c.r))].filter((r) => r >= 3 && r <= 14).sort((a, b) => b - a);
    for (let i = 0; i + 4 < ranks.length; i++) {
      let len = 1;
      while (i + len < ranks.length && ranks[i + len] === ranks[i] - len) len++;
      if (len >= 5) {
        const want = ranks.slice(i, i + 5);
        const cards = want.map((r) => sc.find((c) => c.r === r)!);
        out.push({ cards, kind: 1, n: 5, key: want[0] });
        i += 4;
      }
    }
  }
  if (kings.length === 4) out.push({ cards: kings, kind: 2, n: 4, key: 0 });
  out.sort((a, b) => (a.kind !== b.kind ? a.kind - b.kind : (a.kind === 0 ? (a.n !== b.n ? a.n - b.n : a.key - b.key) : (a.kind === 1 ? a.key - b.key : 0))));
  return out;
}

// 所有能压 prev 的出牌方案（同型从最小到大，再追加炸弹/同花顺/王炸），供连续点击提示循环切换
function allBeats(hand: GCard[], prev: PlayInfo, level: number): GCard[][] {
  const out: GCard[][] = [];
  const push = (cards: GCard[]) => {
    const info = analyzePlay(cards, level);
    if (info && canBeat(prev, info)) out.push(cards);
  };
  const groups = groupByR(hand);
  const norm = [...groups.values()].filter((g) => !g.some((c) => c.k !== undefined));
  if (prev.type === 'SINGLE') {
    const cands: GCard[] = [];
    for (const g of norm) cands.push(g[0]);
    for (const k of hand.filter((c) => c.k !== undefined)) cands.push(k);
    cands.sort((a, b) => cardVal(a, level) - cardVal(b, level));
    cands.forEach((c) => push([c]));
  } else if (prev.type === 'PAIR') {
    norm.filter((g) => g.length >= 2).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level)).forEach((g) => push(g.slice(0, 2)));
  } else if (prev.type === 'TRIPLE') {
    norm.filter((g) => g.length >= 3).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level)).forEach((g) => push(g.slice(0, 3)));
  } else if (prev.type === 'TRIPLE_PAIR') {
    for (const t of norm.filter((g) => g.length >= 3).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level))) {
      const p = norm.find((g) => g !== t && g.length >= 2);
      if (p) push([...t.slice(0, 3), ...p.slice(0, 2)]);
    }
  } else if (prev.type === 'STRAIGHT') {
    for (let min = prev.key + 1; min <= 10; min++) { const seq = findSeq(hand, 5, min - 1, false); if (seq) push(seq); }
  } else if (prev.type === 'PAIR_SEQ') {
    for (let min = prev.key + 2; min <= 14; min += 2) { const seq = findSeq(hand, prev.size, min - 1, true); if (seq) push(seq); }
  } else if (prev.type === 'PLANE') {
    for (let min = prev.key + 3; min <= 14; min += 3) { const seq = findSeq(hand, prev.size, min - 1, false, true); if (seq) push(seq); }
  }
  // 炸弹/同花顺/王炸（不限同类）
  for (const b of bombCandidates(hand, level)) push(b.cards);
  return out;
}

// 找顺子：len 张连续（或连对 len 张=len/2 对）
export function findSeq(hand: GCard[], len: number, minKey: number, isPair: boolean, isPlane = false): GCard[] | null {
  const groups = groupByR(hand);
  const usable = new Map<number, GCard[]>();
  for (const [r, g] of groups) {
    if (r < 3 || r > 14) continue;
    const need = isPair ? 2 : isPlane ? 3 : 1;
    if (g.length >= need) usable.set(r, g.slice(0, need));
  }
  const ranks = [...usable.keys()].sort((a, b) => a - b);
  const step = isPair ? 2 : isPlane ? 3 : 1;
  const count = len / step;
  for (let i = 0; i + count <= ranks.length; i++) {
    const seg = ranks.slice(i, i + count);
    let ok = true;
    for (let j = 1; j < seg.length; j++) if (seg[j] !== seg[j - 1] + 1) { ok = false; break; }
    if (!ok) continue;
    const top = seg[seg.length - 1];
    if (top <= minKey) continue;
    return seg.flatMap((r) => usable.get(r)!);
  }
  return null;
}

// ================================================================
// 职业级 AI 出牌引擎
// - 手牌强度评估 + 牌型规划 + 团队配合 + 智能炸弹
// - 自由出牌：根据手牌强度决定主攻/辅助策略
// - 跟牌：最小牌型压制，队友领先时让牌
// - 炸弹：对手剩牌少必炸，队友冲刺不炸
// ================================================================

/** 手牌强度评估：0-100 分（支持学习参数调优） */
function evaluateHandStrength(hand: GCard[], level: number, params?: Partial<{
  bombWeight: number; rocketWeight: number; straightFlushWeight: number;
  kingWeight: number; bigCardWeight: number; straightWeight: number;
  singlePenalty: number; wildValue: number;
}>): number {
  const p = {
    bombWeight: 10, rocketWeight: 30, straightFlushWeight: 22,
    kingWeight: 5, bigCardWeight: 2, straightWeight: 3,
    singlePenalty: 2, wildValue: 6,
    ...params,
  };
  let score = 0;

  // 1. 炸弹数量与质量（权重最高）
  const bombs = bombCandidates(hand, level);
  for (const b of bombs) {
    if (b.kind === 2) score += p.rocketWeight;       // 天王炸
    else if (b.kind === 1) score += p.straightFlushWeight; // 同花顺
    else score += p.bombWeight + (b.n - 4) * 5;     // 4炸基准 + 每多1张+5
  }

  // 2. 大牌数量（王、级牌、A、K）
  const kings = hand.filter(c => c.k !== undefined).length;
  score += kings * p.kingWeight;

  const groups = groupByR(hand);
  const lr = levelRank(level);
  for (const [r, g] of groups) {
    if (r === 20 || r === 19) continue; // 王已算
    const v = r === lr ? 16 : r === 15 ? 2 : r;
    if (v >= 13) score += g.length * p.bigCardWeight;  // A/K
    else if (v >= 11) score += g.length * (p.bigCardWeight / 2); // Q/J
  }

  // 3. 牌型完整度（顺子、连对、飞机）
  const sf = findStraightFlush(hand);
  if (sf) score += p.straightFlushWeight * 0.4;

  // 顺子数量
  let straightCount = 0;
  const ranks = [...new Set(hand.filter(c => c.k === undefined).map(c => c.r))]
    .filter(r => r >= 3 && r <= 14).sort((a, b) => a - b);
  let runLen = 1;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1] + 1) {
      runLen++;
      if (runLen >= 5) straightCount++;
    } else {
      runLen = 1;
    }
  }
  score += straightCount * p.straightWeight;

  // 4. 单张数量（单张越多越弱）
  let singleCount = 0;
  for (const g of groups.values()) {
    if (g.length === 1 && g[0].k === undefined) singleCount++;
  }
  score -= singleCount * p.singlePenalty;

  // 5. 变牌加分
  const wilds = hand.filter(c => isWild(c, level)).length;
  score += wilds * p.wildValue;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** 自由出牌：选择最优首攻牌型 */
function aiLead(hand: GCard[], level: number, strategy: 'aggressive' | 'normal' | 'support'): GCard[] {
  const groups = groupHand(hand, level);
  const byRank = groupByR(hand);

  // 策略1：主攻型 — 优先出整组牌型（顺子/连对/飞机/三带二）
  if (strategy === 'aggressive') {
    // 找最大的组合牌型优先出（减少手数）
    const comboGroups = groups.filter(g =>
      g.label.includes('顺') || g.label.includes('连对') ||
      g.label.includes('钢板') || g.label.includes('三带')
    );
    if (comboGroups.length > 0) {
      // 出最小的组合牌，保留大牌
      comboGroups.sort((a, b) => cardVal(a.cards[0], level) - cardVal(b.cards[0], level));
      return comboGroups[0].cards;
    }
  }

  // 策略2：辅助型 — 出最小单张送队友
  if (strategy === 'support') {
    const singles: GCard[] = [];
    for (const g of byRank.values()) {
      if (g.length === 1 && g[0].k === undefined && !isWild(g[0], level)) {
        singles.push(g[0]);
      }
    }
    singles.sort((a, b) => cardVal(a, level) - cardVal(b, level));
    if (singles.length > 0) return [singles[0]];
  }

  // 策略3：普通型 — 优先出对子/三张，其次最小单张
  // 先找最小的对子
  const pairs: GCard[][] = [];
  for (const g of byRank.values()) {
    if (g.length >= 2 && g.every(c => c.k === undefined) && !isWild(g[0], level)) {
      pairs.push(g.slice(0, 2));
    }
  }
  pairs.sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level));

  // 单张
  const singles: GCard[] = [];
  for (const g of byRank.values()) {
    if (g.length === 1 && g[0].k === undefined && !isWild(g[0], level)) {
      singles.push(g[0]);
    }
  }
  singles.sort((a, b) => cardVal(a, level) - cardVal(b, level));

  // 单张多于对子时出单张，反之出对子
  if (singles.length >= pairs.length && singles.length > 0) {
    return [singles[0]];
  }
  if (pairs.length > 0) {
    return pairs[0];
  }
  if (singles.length > 0) {
    return [singles[0]];
  }

  // 只剩变牌/王，出最小的
  const remaining = [...hand].sort((a, b) => cardVal(a, level) - cardVal(b, level));
  return [remaining[0]];
}

/** 判断是否应该炸 */
function shouldBomb(
  hand: GCard[],
  prev: PlayInfo,
  level: number,
  opponentHandCount: number,
  partnerHandCount: number,
  isMyTeamLast: boolean,
  params?: Partial<{ mustBombThreshold: number; partnerSaveThreshold: number }>,
): GCard[] | null {
  const mustBomb = params?.mustBombThreshold ?? 5;
  const partnerSave = params?.partnerSaveThreshold ?? 5;
  const bombs = bombCandidates(hand, level);
  if (bombs.length === 0) return null;

  // 队友刚出最大牌 → 绝对不炸
  if (isMyTeamLast) return null;

  // 对手剩牌很少 → 必须炸（阻止对方头游）
  if (opponentHandCount <= mustBomb) {
    // 找最小的能压住的炸弹
    for (const b of bombs) {
      const info = { type: 'BOMB' as PlayType, key: b.key, size: b.n, cards: b.cards };
      if (canBeat(prev, info)) return b.cards;
    }
  }

  // 对手剩 6-10 张 → 有较大概率头游，考虑炸
  if (opponentHandCount <= mustBomb + 5) {
    // 手牌也不多了（自己也有冲头游潜力）→ 炸
    if (hand.length <= 12) {
      for (const b of bombs) {
        const info = { type: 'BOMB' as PlayType, key: b.key, size: b.n, cards: b.cards };
        if (canBeat(prev, info) && b.kind === 0 && b.n <= 5) return b.cards; // 只用小炸
      }
    }
  }

  // 队友牌也很少 → 不浪费炸弹，让队友冲
  if (partnerHandCount <= partnerSave) return null;

  // 对手牌很多 → 不用炸，等后面
  if (opponentHandCount > mustBomb + 10) return null;

  return null;
}

export function aiPlay(
  hand: GCard[],
  prev: PlayInfo | null,
  level: number,
  isMyTeamLast: boolean,
  opponentHandCount: number = 27,
  partnerHandCount: number = 27,
  evalParams?: Partial<{
    bombWeight: number; rocketWeight: number; straightFlushWeight: number;
    kingWeight: number; bigCardWeight: number; straightWeight: number;
    singlePenalty: number; wildValue: number;
    aggressiveThreshold: number; supportThreshold: number;
    mustBombThreshold: number; partnerSaveThreshold: number;
  }>,
): { play: GCard[] | null; pass: boolean } {
  const handStrength = evaluateHandStrength(hand, level, evalParams);

  // 决定策略：根据手牌强度和队友状态
  const aggThresh = evalParams?.aggressiveThreshold ?? 65;
  const supThresh = evalParams?.supportThreshold ?? 35;
  let strategy: 'aggressive' | 'normal' | 'support' = 'normal';
  if (handStrength >= aggThresh) strategy = 'aggressive';
  else if (handStrength <= supThresh) strategy = 'support';

  // 如果队友牌很少，转为辅助策略
  if (partnerHandCount <= 8 && handStrength < 70) {
    strategy = 'support';
  }

  // ===== 自由出牌 =====
  if (prev === null) {
    const play = aiLead(hand, level, strategy);
    return { play, pass: false };
  }

  // ===== 队友刚出了最大的牌 → 让牌 =====
  if (isMyTeamLast) {
    return { play: null, pass: true };
  }

  // ===== 跟牌：找最小能压住的 =====
  const beat = findSmallestBeat(hand, prev, level);
  if (beat) {
    const beatInfo = analyzePlay(beat, level);

    // 用王单出的情况：谨慎
    if (beat.length === 1 && beat[0].k !== undefined) {
      // 手牌多 + 对手牌多 → 王留着关键时候用
      if (hand.length > 8 && opponentHandCount > 10) {
        // 看看有没有炸弹能替代
        const bomb = shouldBomb(hand, prev, level, opponentHandCount, partnerHandCount, isMyTeamLast, {
          mustBombThreshold: evalParams?.mustBombThreshold,
          partnerSaveThreshold: evalParams?.partnerSaveThreshold,
        });
        if (bomb) return { play: bomb, pass: false };
        return { play: null, pass: true };
      }
      // 对手快出完了 → 王必须出
      if (opponentHandCount <= 5) return { play: beat, pass: false };
    }

    // 用级牌单张压的情况：手牌多时保留
    if (beat.length === 1 && beatInfo && isWild(beat[0], level)) {
      if (hand.length > 10 && opponentHandCount > 8) {
        return { play: null, pass: true };
      }
    }

    // 大牌压制：如果用很大的牌压很小的牌，考虑过
    if (beatInfo) {
      const valDiff = beatInfo.key - prev.key;
      // 单张：差超过 5 点且手牌多，考虑过
      if (prev.type === 'SINGLE' && valDiff > 5 && hand.length > 12 && opponentHandCount > 10) {
        return { play: null, pass: true };
      }
    }

    return { play: beat, pass: false };
  }

  // ===== 没普通牌型可大 → 考虑炸弹 =====
  const bomb = shouldBomb(hand, prev, level, opponentHandCount, partnerHandCount, isMyTeamLast, {
    mustBombThreshold: evalParams?.mustBombThreshold,
    partnerSaveThreshold: evalParams?.partnerSaveThreshold,
  });
  if (bomb) {
    return { play: bomb, pass: false };
  }

  // ===== 实在不行就过 =====
  return { play: null, pass: true };
}

// ================================================================
// 组件
// ================================================================
interface GameState {
  hands: GCard[][];
  level: number;
  current: number;
  lastPlay: { player: number; cards: GCard[]; info: PlayInfo } | null;
  lastPlayBy: number; // 上一出牌人
  turnStart: number;
  finished: number[]; // 出完顺序（玩家 index）
  roundPass: number[]; // 本轮已 pass 的玩家
  /** 本轮各方位已出的牌（一轮出完才清理），用于方位展示 */
  roundPlays: { player: number; cards: GCard[] }[];
  /** 一圈全过后标记为 true：保留出牌信息显示，直到下一次出牌才清除 */
  roundEnded: boolean;
  phase: 'idle' | 'playing' | 'over';
  winnerTeam: number | null;
  resultText: string;
  gongMessage: string;
  /** 打 A 连续未过局数（连续 3 把不过退回 2 重新打） */
  aStrikes: number;
}

const NAMES = ['你', '队友', '对手A', '对手B'];
// 座位：0=玩家(南) 2=队友(北) 1=右对手 3=左对手（对家组队 0-2 / 1-3）

export function GuandanGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<'rank' | 'grouped'>('rank');
  // 浮动窗口全屏模式（默认开启，脱离浏览器布局限制）+ 左上角 ☰ 折叠菜单
  const [floating, setFloating] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteredFsRef = useRef(false);

  // ===== AI 难度与自适应学习 =====
  const [aiDifficulty] = useState<GDAIDifficulty | 'auto'>('auto');
  const [learningProfile, setLearningProfile] = useState<GuandanLearningProfile | null>(null);
  const firstPlayTypeRef = useRef<PlayType | null>(null);
  const bombsUsedRef = useRef(0);

  // 加载学习档案
  useEffect(() => {
    setLearningProfile(getLearningProfile());
  }, []);

  // 解析当前实际 AI 难度（auto 模式下根据 ELO 动态匹配）
  const actualDifficulty: GDAIDifficulty = (() => {
    if (aiDifficulty !== 'auto') return aiDifficulty;
    if (!learningProfile) return 'medium';
    return resolveAutoAiDifficulty(learningProfile.playerElo, learningProfile.winStreak);
  })();

  // 挂载即进入浮动全屏容器；首次交互（用户手势）尝试隐藏浏览器窗口（桌面全屏 / iOS 沉浸兜底）
  useEffect(() => {
    setFloating(true);
    const t = setTimeout(() => {
      if (!enteredFsRef.current) {
        enteredFsRef.current = true;
        try { enterFullscreen(); } catch { /* 忽略 */ }
      }
    }, 400);
    return () => clearTimeout(t);
  }, []);

  const requestFullscreenOnGesture = useCallback(() => {
    if (enteredFsRef.current) return;
    enteredFsRef.current = true;
    try { enterFullscreen(); } catch { /* 忽略 */ }
  }, []);

  // 浮动全屏时隐藏页面上下红色导航栏（header/nav），只显示棋盘容器
  useEffect(() => {
    if (floating) document.body.classList.add('gd-float-active');
    else document.body.classList.remove('gd-float-active');
    return () => document.body.classList.remove('gd-float-active');
  }, [floating]);

  const startNew = useCallback((prevLevel?: number, keepStrikes = 0) => {
    const deck = shuffle(buildDeck());
    const hands: GCard[][] = [[], [], [], []];
    deck.forEach((c, i) => hands[i % 4].push(c));
    // 简化：0 号玩家先手（首局随机）
    const first = prevLevel === undefined ? Math.floor(Math.random() * 4) : 0;
    setGame({
      hands,
      level: prevLevel ?? 2,
      current: first,
      lastPlay: null,
      lastPlayBy: -1,
      turnStart: first,
      finished: [],
      roundPass: [],
      roundPlays: [],
      roundEnded: false,
      phase: 'playing',
      winnerTeam: null,
      resultText: '',
      gongMessage: '',
      aStrikes: keepStrikes,
    });
    setSelected([]);
  }, []);

  useEffect(() => {
    startNew();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [startNew]);

  const me = game ? game.hands[0] : [];

  // 轮到玩家？
  const isMyTurn = game !== null && game.phase === 'playing' && game.current === 0 && !game.finished.includes(0);

  // 提示：给出一个可出的最小合法牌
  const hint = useCallback((): number[] => {
    if (!game) return [];
    const prev = game.lastPlay;
    if (!prev) {
      // 自由出牌：最小单张/对子
      const g = groupByR(game.hands[0]);
      let best: GCard[] | null = null;
      for (const gr of g.values()) {
        if (!best || cardVal(gr[0], game.level) < cardVal(best[0], game.level)) best = gr.slice(0, 1);
      }
      return best ? best.map((c) => c.id) : [];
    }
    const beat = findSmallestBeat(game.hands[0], prev.info, game.level);
    return beat ? beat.map((c) => c.id) : [];
  }, [game]);

  // 连续点击提示：依次切换所有可压方案（先同型从小到大，再炸弹/同花顺/王炸），不限同类牌型
  const hintBeatsRef = useRef<number[][]>([]);
  const hintKeyRef = useRef('');
  const hintIdxRef = useRef(-1);
  const applyHint = useCallback(() => {
    if (!game) return;
    if (!game.lastPlay) {
      const ids = hint();
      if (ids.length) setSelected(ids);
      return;
    }
    const key = `${game.lastPlayBy}:${game.lastPlay.cards.map((c) => c.id).join(',')}`;
    if (hintKeyRef.current !== key) {
      hintKeyRef.current = key;
      hintIdxRef.current = -1;
      hintBeatsRef.current = allBeats(game.hands[0], game.lastPlay.info, game.level).map((b) => b.map((c) => c.id));
    }
    const beats = hintBeatsRef.current;
    if (!beats.length) return;
    hintIdxRef.current = (hintIdxRef.current + 1) % beats.length;
    setSelected(beats[hintIdxRef.current]);
  }, [game, hint]);

  // 校验玩家所选：合法且（自由出牌或大过）
  const checkSelection = (): PlayInfo | null => {
    if (!game) return null;
    const cards = game.hands[0].filter((c) => selected.includes(c.id));
    if (cards.length === 0) return null;
    const info = analyzePlay(cards, game.level);
    if (!info) return null;
    if (game.lastPlay && !canBeat(game.lastPlay.info, info)) return null;
    return info;
  };

  // 出牌/不出后推进
  // 找到下一个未出完（未 finished）的玩家：头游后跳过，避免轮到空手玩家
  const nextAlive = useCallback((from: number, finished: number[]) => {
    let s = ((from % 4) + 4) % 4;
    for (let i = 0; i < 4; i++) {
      const p = (s + i) % 4;
      if (!finished.includes(p)) return p;
    }
    return s;
  }, []);

  const commitTurn = useCallback((player: number, play: GCard[] | null) => {
    setGame((prev) => {
      if (!prev) return prev;
      const hands = prev.hands.map((h) => [...h]);
      const lastPlay = play ? { player, cards: play, info: analyzePlay(play, prev.level)! } : null;
      const roundPass = [...prev.roundPass];
      const finished = [...prev.finished];
      // 出牌时：若上一轮已结束（roundEnded），清除旧 roundPlays 重新开始；否则追加
      const roundPlays = play
        ? (prev.roundEnded ? [{ player, cards: play }] : [...prev.roundPlays, { player, cards: play }])
        : prev.roundPlays;

      if (play) {
        hands[player] = hands[player].filter((c) => !play.some((p) => p.id === c.id));
        if (hands[player].length === 0) {
          finished.push(player);
          if (finished.length === 4) {
            // 本局结束：结算升级
            const order = finished;
            const myTeam = order[0] === 0 || order[0] === 2;
            let win: number; let up: number; let txt: string;
            if (myTeam) {
              if (order[1] === 0 || order[1] === 2) { win = 0; up = 3; txt = '双下！升 3 级'; }
              else if (order[2] === 0 || order[2] === 2) { win = 0; up = 2; txt = '升 2 级'; }
              else { win = 0; up = 1; txt = '升 1 级'; }
            } else {
              if (order[1] === 1 || order[1] === 3) { win = 1; up = 3; txt = '对方双下，升 3 级'; }
              else if (order[2] === 1 || order[2] === 3) { win = 1; up = 2; txt = '对方升 2 级'; }
              else { win = 1; up = 1; txt = '对方升 1 级'; }
            }
            let newLevel = prev.level + up;
            let resultText = txt;
            let winnerTeam: number | null = null;
            let aStrikes = prev.aStrikes || 0;
            if (prev.level === 14) {
              // 打 A 中：必须双上（己方 1、2 名）才算过 A 获胜
              if (win === 0 && up >= 3) {
                winnerTeam = 0; newLevel = 14; aStrikes = 0;
                resultText = '🏆 双上打过 A！我方获胜！';
              } else if (win === 1 && up >= 3) {
                // 对方双上打过 A：我方退回 2 重新打
                newLevel = 2; aStrikes = 0;
                resultText = '对方双上打过 A，我方退回 2 重新打';
              } else {
                aStrikes += 1;
                if (aStrikes >= 3) {
                  newLevel = 2; aStrikes = 0;
                  resultText = `连续 3 把未过 A，退回 2 重新打`;
                } else {
                  newLevel = 14;
                  resultText = `打 A 未过（第 ${aStrikes} 把，连 3 把不过退回 2）`;
                }
              }
            } else if (newLevel > 14) {
              if (win === 0) { winnerTeam = 0; resultText = '🏆 打过 A！我方获胜！'; }
              else { winnerTeam = 1; resultText = '对方打过 A，重新打 A'; newLevel = 14; }
            } else if (newLevel === 14 && up >= 3) {
              // 首次双上到 A：下一局双上即获胜
              resultText = win === 0 ? '🚀 打到 A！下一局双上即获胜！' : '对方打到 A';
            }
            return {
              ...prev, hands, lastPlay, roundPass: [], roundPlays, roundEnded: false, finished,
              phase: 'over', winnerTeam, resultText,
              level: newLevel,
              aStrikes,
              current: finished[0],
            };
          }
        }
        // 出完非全结束：本轮继续（出牌追加到方位区，待一圈全过才清理）；跳过头游者
        return {
          ...prev, hands, lastPlay, lastPlayBy: player, roundPass: [], roundPlays, roundEnded: false, current: nextAlive(player + 1, finished), turnStart: nextAlive(player + 1, finished),
        };
      } else {
        // 不出
        roundPass.push(player);
        if (roundPass.length >= 3) {
          // 一圈全过 → 保留出牌信息显示（roundPlays 不清空），标记 roundEnded
          // 最后出牌者自由出牌（lastPlay=null），下一次出牌时才清除旧 roundPlays
          const freer = finished.includes(prev.lastPlayBy) ? nextAlive(prev.lastPlayBy + 1, finished) : prev.lastPlayBy;
          return { ...prev, hands, roundPass: [], roundPlays, roundEnded: true, current: freer, lastPlay: null, lastPlayBy: freer };
        }
        return { ...prev, hands, roundPass, roundPlays, current: nextAlive(player + 1, finished) };
      }
    });
  }, []);

  // 玩家出牌
  const doPlay = useCallback(() => {
    if (!game || game.current !== 0) return;
    const info = checkSelection();
    if (!info) { return; }
    const cards = game.hands[0].filter((c) => selected.includes(c.id));
    setSelected([]);
    commitTurn(0, cards);
  }, [game, selected, checkSelection, commitTurn]);

  const doPass = useCallback(() => {
    if (!game || game.current !== 0) return;
    if (!game.lastPlay) return; // 自由出牌不能不出
    setSelected([]);
    commitTurn(0, null);
  }, [game, commitTurn]);

  // ===== 游戏结束 → 记录学习 =====
  const gameOverRecordedRef = useRef(false);
  useEffect(() => {
    if (!game || game.phase !== 'over') {
      gameOverRecordedRef.current = false;
      return;
    }
    if (gameOverRecordedRef.current) return;
    gameOverRecordedRef.current = true;

    if (!learningProfile) return;

    const myTeamWon = game.winnerTeam === 0;
    const result = myTeamWon ? 'win' : 'loss';

    // 自己的名次
    const myRank = game.finished.indexOf(0) + 1;
    const partnerRank = game.finished.indexOf(2) + 1;

    // 手牌强度（估算：用最终手牌数反推，这里取平均值）
    const handStrength = 50; // 简化：实际应该记录初始手牌强度

    // 记录首攻牌型
    const firstPlay = firstPlayTypeRef.current;

    // 更新学习档案
    const newProfile = recordGameResult(learningProfile, result, actualDifficulty, {
      handStrength,
      bombsUsed: bombsUsedRef.current,
      partnerRank,
      myRank,
      firstPlayType: firstPlay || undefined,
    });
    setLearningProfile(newProfile);
  }, [game, learningProfile, actualDifficulty]);

  // AI 回合
  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.current === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const p = game.current;
    timerRef.current = setTimeout(() => {
      const prev = game.lastPlay;
      const isTeamLast = prev ? (prev.player === (p === 0 ? 2 : p === 2 ? 0 : p === 1 ? 3 : 1)) : false;
      // 队友座位
      const partnerSeat = p === 0 ? 2 : p === 2 ? 0 : p === 1 ? 3 : 1;
      // 对手中剩牌最少的（最危险的）
      const oppSeats = [0, 1, 2, 3].filter(s => s !== p && s !== partnerSeat);
      const opponentHandCount = Math.min(...oppSeats.map(s => game.hands[s].length));
      const partnerHandCount = game.hands[partnerSeat].length;
      const res = aiPlay(
        game.hands[p],
        prev ? prev.info : null,
        game.level,
        isTeamLast,
        opponentHandCount,
        partnerHandCount,
        learningProfile?.evalParams,
      );
      // 统计 AI 使用炸弹次数（用于学习）
      if (res.play && res.play.length >= 4) {
        const ranks = new Set(res.play.map(c => c.k !== undefined ? 99 : c.r));
        if (ranks.size === 1 && res.play.length >= 4) bombsUsedRef.current++;
      }
      commitTurn(p, res.play);
    }, 900);
  }, [game, commitTurn]);

  const sortedHand = [...me].sort((a, b) => {
    if (a.k !== undefined && b.k !== undefined) return b.k! - a.k!;
    if (a.k !== undefined) return 1;
    if (b.k !== undefined) return -1;
    if (a.r !== b.r) return b.r - a.r;
    return a.s < b.s ? -1 : 1;
  });

  const levelName = game ? rankName(game.level) : '-';

  // 各家剩余牌数
  const counts = game ? game.hands.map((h) => h.length) : [0, 0, 0, 0];
  const myTeamCount = game ? counts[0] + counts[2] : 0;
  const oppTeamCount = game ? counts[1] + counts[3] : 0;

  // 本轮各方位已出的牌（对应出牌区方位展示；一轮出完才清理）
  const roundPlaysOf = (p: number) => {
    if (!game || game.roundPlays.length === 0) return [];
    const last = game.roundPlays[game.roundPlays.length - 1];
    return last.player === p ? [last] : [];
  };
  const renderRoundPlays = (p: number) => {
    if (!game) return null;
    const plays = roundPlaysOf(p);
    if (plays.length === 0) return null;
    return (
      <div className="gd-play-area">
        {plays.map((pl, i) => (
          <div key={i} className={`gd-play-hand ${i === plays.length - 1 ? 'gd-latest' : ''}`}>
            <span className="gd-play-hand-name">{NAMES[pl.player]}</span>
            <div className="gd-play-cards-row">
              {pl.cards.map((c) => (
                <span
                  key={c.id}
                  className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                >
                  <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                  {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                  {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                  {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 点击理牌分组名称：整组选中（已全选则取消）
  const selectGroup = (cards: GCard[]) => {
    const ids = cards.map((c) => c.id);
    setSelected((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : ids));
  };

  const toggleCard = (id: number) => {
    if (!isMyTurn) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canPlay = checkSelection() !== null;
  const canPass = game?.lastPlay != null && isMyTurn;

  if (!game) return <div className="module-loading">发牌中…</div>;

  // 头游：第一个出完牌的玩家；对家（搭档）= 头游 ^ 2（0↔2、1↔3）
  // 明牌规则：仅本方（我方 0 或队友 2）头游时，把本队另一人的剩余手牌明牌给本方看；对手头游不泄露对手牌
  const headSeat = game.finished.length > 0 ? game.finished[0] : -1;
  const partnerSeat = headSeat >= 0 ? headSeat ^ 2 : -1;
  const showPartnerCards = headSeat >= 0 && (headSeat === 0 || headSeat === 2) && partnerSeat !== 0;

  return (
    <div className={`gd-table ${floating ? 'gd-floating' : ''}`} onClick={requestFullscreenOnGesture}>
      {/* 桌垫方位水印、分区框线与铭牌（参考比赛专用桌垫） */}
      <span className="gd-dir gd-dir-n">北</span>
      <span className="gd-dir gd-dir-s">南</span>
      <span className="gd-dir gd-dir-w">西</span>
      <span className="gd-dir gd-dir-e">东</span>
      <div className="gd-zones">
        {GD_ZONES.map((z, i) => (
          <span
            key={i}
            className={`gd-zone gd-zone-dir-${z.dir}`}
            style={{ top: `${z.top}%`, left: `${z.left}%`, width: `${z.w}%`, height: `${z.h}%` }}
          >
            {z.label}
          </span>
        ))}
      </div>
      <span className="gd-table-name">掼蛋比赛专用桌垫</span>
      {/* 浮动全屏：左上角 ☰ 折叠菜单（常用功能，点击展开/收起） */}
      {floating && (
        <>
          <button
            className={`gd-top-handle ${menuOpen ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            title="游戏功能"
            aria-label="游戏功能"
          >
            <span className="gd-handle-bar" />
            <span className="gd-handle-bar" />
            <span className="gd-handle-bar" />
          </button>
          <div className={`gd-menu-panel ${menuOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="gd-menu-grid">
              <button
                className="gd-menu-btn"
                onClick={() => { setSortMode((m) => (m === 'rank' ? 'grouped' : 'rank')); setMenuOpen(false); }}
              >
                {sortMode === 'rank' ? '🃏 一键理牌' : '↩️ 恢复排序'}
              </button>
              <button className="gd-menu-btn" onClick={() => { applyHint(); setMenuOpen(false); }} disabled={!isMyTurn}>
                💡 提示
              </button>
              <button className="gd-menu-btn" onClick={() => { startNew(game.level, game.aStrikes || 0); setMenuOpen(false); }}>
                🔄 重新发牌
              </button>
              <button className="gd-menu-btn danger" onClick={() => { setFloating(false); try { exitFullscreen(); } catch { /* 忽略 */ } setMenuOpen(false); }}>
                ⛶ 退出全屏
              </button>
            </div>
            <div className="gd-menu-hint">点击棋盘任意位置关闭面板</div>
          </div>
        </>
      )}
      {/* 顶部状态条 */}
      <div className="gd-topbar">
        <span className="gd-info">我方 <b>{myTeamCount}</b> 张</span>
        <span className="gd-info">对方 <b>{oppTeamCount}</b> 张</span>
        <span className="gd-info">目标 <b className="gd-level">过 {levelName}</b></span>
        <span className="gd-info">级牌 <b className="gd-level">{levelName}</b></span>
      </div>

      {/* 玩家信息区 + 四方位出牌区 */}
      <div className="gd-seats">
        {/* 队友（上·北） */}
        <div className={`gd-seat gd-seat-top ${game.current === 2 ? 'gd-active' : ''}`}>
          <span className="gd-seat-name">🤝 队友</span>
          {headSeat === 2 && <span className="gd-head-tag">🏆 头游</span>}
          {counts[2] <= 10 && <span className="gd-seat-count">{counts[2]} 张</span>}
          {game.roundPass.includes(2) && <span className="gd-pass-tag">不出</span>}
          {game.finished.includes(2) && <span className="gd-finished-tag">已出完</span>}
        </div>
        {showPartnerCards && partnerSeat === 2 && (
          <div className="gd-partner-cards">
            <span className="gd-partner-label">🤝 对家牌面</span>
            <div className="gd-partner-cards-row">
              {game.hands[2].map((c) => (
                <span
                  key={c.id}
                  className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                >
                  <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                  {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                  {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                  {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                </span>
              ))}
              {game.hands[2].length === 0 && <span className="gd-partner-empty">已出完</span>}
            </div>
          </div>
        )}
        <div className="gd-play-area gd-play-north">{renderRoundPlays(2)}</div>
        {/* 对手（左·西 / 右·东） + 中央轮状态 */}
        <div className="gd-side-row">
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-left ${game.current === 3 ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 对手B</span>
              {headSeat === 3 && <span className="gd-head-tag">🏆 头游</span>}
              {counts[3] <= 10 && <span className="gd-seat-count">{counts[3]} 张</span>}
              {game.roundPass.includes(3) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(3) && <span className="gd-finished-tag">已出完</span>}
            </div>
            {showPartnerCards && partnerSeat === 3 && (
              <div className="gd-partner-cards">
                <span className="gd-partner-label">🤝 对家牌面</span>
                <div className="gd-partner-cards-row">
                  {game.hands[3].map((c) => (
                    <span
                      key={c.id}
                      className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    >
                      <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                      {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                  {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                    </span>
                  ))}
                  {game.hands[3].length === 0 && <span className="gd-partner-empty">已出完</span>}
                </div>
              </div>
            )}
            <div className="gd-play-area gd-play-west">{renderRoundPlays(3)}</div>
          </div>
          <div className="gd-center-play">
            {game.phase === 'over' ? <span className="gd-freetext">{game.resultText}</span> :
              game.lastPlay ? <span className="gd-freetext">跟牌：{NAMES[game.lastPlay.player]}</span> :
              <span className="gd-freetext">自由出牌</span>}
          </div>
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-right ${game.current === 1 ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 对手A</span>
              {headSeat === 1 && <span className="gd-head-tag">🏆 头游</span>}
              {counts[1] <= 10 && <span className="gd-seat-count">{counts[1]} 张</span>}
              {game.roundPass.includes(1) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(1) && <span className="gd-finished-tag">已出完</span>}
            </div>
            {showPartnerCards && partnerSeat === 1 && (
              <div className="gd-partner-cards">
                <span className="gd-partner-label">🤝 对家牌面</span>
                <div className="gd-partner-cards-row">
                  {game.hands[1].map((c) => (
                    <span
                      key={c.id}
                      className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    >
                      <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                      {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                  {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                    </span>
                  ))}
                  {game.hands[1].length === 0 && <span className="gd-partner-empty">已出完</span>}
                </div>
              </div>
            )}
            <div className="gd-play-area gd-play-east">{renderRoundPlays(1)}</div>
          </div>
        </div>
      </div>

      {/* 操作区 */}
      <div className="gd-actions">
        <span className="gd-turn-hint">
          {game.phase === 'over' ? game.resultText : isMyTurn ? '🖐 轮到你出牌' : `等待 ${NAMES[game.current]} 出牌…`}
        </span>
        <button className="gd-btn gd-btn-pass" onClick={doPass} disabled={!canPass}>不出</button>
        <button className="gd-btn gd-btn-hint" onClick={applyHint} disabled={!isMyTurn}>提示</button>
        <button className="gd-btn gd-btn-play gd-btn-primary" onClick={doPlay} disabled={!canPlay}>出牌</button>
        <button
          className="gd-btn gd-btn-sort"
          onClick={() => setSortMode((m) => (m === 'rank' ? 'grouped' : 'rank'))}
        >
          {sortMode === 'rank' ? '一键理牌' : '恢复'}
        </button>
      </div>

      {/* 我方（南）出牌区：手牌上方 */}
      <div className="gd-play-area gd-play-south">{renderRoundPlays(0)}</div>

      {/* 手牌区：按类型竖排 / 普通排序 */}
      {sortMode === 'grouped' ? (
        <div className="gd-hand gd-hand-grouped">
          {groupHand(me, game.level).map((g, gi) => (
            <div className="gd-hand-group" key={gi}>
              <div className="gd-hand-group-cards">
                {g.cards.map((c, ci) => (
                  <button
                    key={c.id}
                    className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? 'gd-card-joker' : (c.r === levelRank(game.level) ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    onClick={() => toggleCard(c.id)}
                    style={{ zIndex: 100 - ci }}
                  >
                    <span className="gd-card-corner gd-corner-tl">
                      <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
                    </span>
                    <span className="gd-card-center">{c.k !== undefined ? 'JOKER' : SUIT_SYMBOL[c.s]}</span>
                    <span className="gd-card-corner gd-corner-br">
                      <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
                    </span>
                    {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-card-level-tag">级</span>}
                    {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                  </button>
                ))}
              </div>
              <span
                className={`gd-hand-group-label ${g.cards.every((c) => selected.includes(c.id)) ? 'gd-group-selected' : ''}`}
                onClick={() => selectGroup(g.cards)}
              >
                {g.label}
              </span>
            </div>
          ))}
          {me.length === 0 && <div className="gd-hand-empty">牌已出完</div>}
        </div>
      ) : (
        <div className="gd-hand">
          {sortedHand.map((c, i) => (
            <button
              key={c.id}
              className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? 'gd-card-joker' : (c.r === levelRank(game.level) ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
              onClick={() => toggleCard(c.id)}
              style={{ marginLeft: i > 0 ? -Math.min(34, 300 / sortedHand.length) : 0 }}
            >
              <span className="gd-card-corner gd-corner-tl">
                <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
              </span>
              <span className="gd-card-center">{c.k !== undefined ? 'JOKER' : SUIT_SYMBOL[c.s]}</span>
              <span className="gd-card-corner gd-corner-br">
                <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
              </span>
              {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-card-level-tag">级</span>}
              {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
            </button>
          ))}
          {sortedHand.length === 0 && <div className="gd-hand-empty">牌已出完</div>}
        </div>
      )}

      {/* 结算/升级弹层 */}
      {game.phase === 'over' && (
        <div className="gd-overlay">
          <div className="gd-overlay-card">
            <h2>{game.resultText}</h2>
            <p className="gd-overlay-level">当前级别：<b>过 {rankName(game.level)}</b></p>
            {game.winnerTeam === 0 && <p className="gd-overlay-win">🎉 恭喜！我方获胜！</p>}
            {game.winnerTeam === 1 && <p className="gd-overlay-lose">再接再厉，加油！</p>}
            <div className="gd-overlay-btns">
              <button className="gd-btn gd-btn-primary" onClick={() => startNew(game.level)}>开始下一局</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuandanGame;
