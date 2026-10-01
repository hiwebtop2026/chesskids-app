import { useState, useRef, useCallback, useEffect } from 'react';
import { enterFullscreen, exitFullscreen } from '../utils/fullscreen';

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

function cardText(c: GCard): string {
  if (c.k === 1) return '大王';
  if (c.k === 0) return '小王';
  return `${rankName(c.r)}${SUIT_SYMBOL[c.s] || ''}`;
}

// 牌值：用于牌型比较。王最大，级牌次之
export function cardVal(c: GCard, level: number): number {
  if (c.k === 1) return 18;
  if (c.k === 0) return 17;
  if (c.r === level) return 16;
  if (c.r === 15) return 2; // 非级牌 2 最小
  return c.r;
}

// 纯点数（级牌视为 16，王视为 17/18）
function pointVal(c: GCard, level: number): number {
  return cardVal(c, level);
}

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
// 一键理牌：按牌型分组（王/炸弹/三张/对子/单张），组内按点数降序
// ================================================================
export interface HandGroup {
  label: string;
  cards: GCard[];
}

export function groupHand(hand: GCard[], level: number): HandGroup[] {
  const groups = groupByR(hand);
  const sorted = [...groups.entries()].sort((a, b) => {
    const ka = a[0] === 19 || a[0] === 20 ? 100 : a[0];
    const kb = b[0] === 19 || b[0] === 20 ? 100 : b[0];
    return kb - ka;
  });

  const out: HandGroup[] = [];
  for (const [, cards] of sorted) {
    const c0 = cards[0];
    const ordered = [...cards].sort((a, b) => (a.s < b.s ? -1 : 1));
    if (c0.k === 1) out.push({ label: '大王', cards: ordered });
    else if (c0.k === 0) out.push({ label: '小王', cards: ordered });
    else if (cards.length >= 4) out.push({ label: `炸弹 ${cards.length}炸`, cards: ordered });
    else if (cards.length === 3) out.push({ label: `三张 ${rankName(c0.r)}${c0.r === level ? '·级' : ''}`, cards: ordered });
    else if (cards.length === 2) out.push({ label: `对子 ${rankName(c0.r)}${c0.r === level ? '·级' : ''}`, cards: ordered });
    else out.push({ label: `单张 ${rankName(c0.r)}${c0.r === level ? '·级' : ''}`, cards: ordered });
  }
  return out;
}

// 识别一组牌型；不合法返回 null
export function analyzePlay(cards: GCard[], level: number): PlayInfo | null {
  const n = cards.length;
  if (n === 0) return null;
  const norm = cards.map((c) => ({ c, v: pointVal(c, level) }));
  norm.sort((a, b) => a.v - b.v);

  // 天王炸：四张王
  if (n === 4 && cards.every((c) => c.k !== undefined)) {
    return { type: 'ROCKET', key: 19, size: 4, cards };
  }

  const groups = groupByR(cards);
  const sizes = [...groups.values()].map((g) => g.length).sort((a, b) => a - b);
  const ranks = [...groups.keys()].sort((a, b) => a - b);

  // 炸弹：4+ 同点数（不含王）
  if (n >= 4 && sizes.length === 1 && cards.every((c) => c.k === undefined)) {
    return { type: 'BOMB', key: cardVal(cards[0], level), size: n, cards };
  }

  const onlySeqOk = (rs: number[]): boolean => {
    for (let i = 1; i < rs.length; i++) if (rs[i] !== rs[i - 1] + 1) return false;
    return rs.every((r) => r >= 3 && r <= 14); // 2 不能进顺
  };

  // 单张 / 对子 / 三张
  if (n === 1) return { type: 'SINGLE', key: norm[0].v, size: 1, cards };
  if (n === 2 && sizes.length === 1 && cards.every((c) => c.k === undefined)) return { type: 'PAIR', key: cardVal(cards[0], level), size: 2, cards };
  if (n === 3 && sizes.length === 1 && cards.every((c) => c.k === undefined)) return { type: 'TRIPLE', key: cardVal(cards[0], level), size: 3, cards };

  // 三带二
  if (n === 5 && sizes.length === 2) {
    const three = sizes.includes(3);
    if (three && cards.every((c) => c.k === undefined)) {
      const g3 = [...groups.values()].find((g) => g.length === 3)!;
      return { type: 'TRIPLE_PAIR', key: cardVal(g3[0], level), size: 5, cards };
    }
  }

  // 钢板（连续三张，无翅膀）
  if (n >= 6 && n % 3 === 0 && sizes.every((s) => s === 3) && onlySeqOk(ranks)) {
    return { type: 'PLANE', key: cardVal(cards.find((c) => c.r === ranks[ranks.length - 1])!, level), size: n, cards };
  }

  // 连对（3+ 对连续）
  if (n >= 6 && n % 2 === 0 && sizes.every((s) => s === 2) && onlySeqOk(ranks)) {
    return { type: 'PAIR_SEQ', key: cardVal(cards.find((c) => c.r === ranks[ranks.length - 1])!, level), size: n, cards };
  }

  // 顺子（5+ 单张连续）
  if (n >= 5 && sizes.every((s) => s === 1) && onlySeqOk(ranks)) {
    // 同花顺
    const suitSet = new Set(cards.map((c) => c.s));
    if (suitSet.size === 1) {
      return { type: 'STRAIGHT_FLUSH', key: seqVal(ranks[ranks.length - 1]), size: n, cards };
    }
    return { type: 'STRAIGHT', key: seqVal(ranks[ranks.length - 1]), size: n, cards };
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
function findSmallestBeat(hand: GCard[], prev: PlayInfo, level: number): GCard[] | null {
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
  return null;
}

// 找顺子：len 张连续（或连对 len 张=len/2 对）
function findSeq(hand: GCard[], len: number, minKey: number, isPair: boolean, isPlane = false): GCard[] | null {
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

export function aiPlay(hand: GCard[], prev: PlayInfo | null, level: number, isMyTeamLast: boolean): { play: GCard[] | null; pass: boolean } {
  if (prev === null) {
    // 自由出牌：出最小单张/对子
    const groups = groupByR(hand);
    let best: GCard[] | null = null;
    for (const g of groups.values()) {
      const v = cardVal(g[0], level);
      if (g.length === 1 && (!best || v < cardVal(best[0], level))) best = [g[0]];
      else if (g.length === 2 && !best && g.every((c) => c.k === undefined)) best = g.slice(0, 2);
    }
    return { play: best || [hand[0]], pass: false };
  }

  // 队友刚出最大牌 → 不顶
  if (isMyTeamLast) {
    return { play: null, pass: true };
  }

  const beat = findSmallestBeat(hand, prev, level);
  if (beat) {
    // 王单出时机：手牌剩 ≤4 时随意
    if (beat.length === 1 && beat[0].k !== undefined && hand.length > 4) return { play: null, pass: true };
    return { play: beat, pass: false };
  }

  // 没普通牌型可大：考虑炸弹（手牌少时炸）
  const bomb = findBomb(hand, prev, level);
  if (bomb && hand.length <= 6) {
    return { play: bomb, pass: false };
  }
  return { play: null, pass: true };
}

function findBomb(hand: GCard[], prev: PlayInfo, level: number): GCard[] | null {
  const groups = groupByR(hand);
  let best: GCard[] | null = null;
  for (const g of groups.values()) {
    if (g.length >= 4 && g.every((c) => c.k === undefined)) {
      const p = { type: 'BOMB' as PlayType, key: cardVal(g[0], level), size: g.length, cards: g.slice(0, 4) };
      if (canBeat(prev, p)) {
        if (!best || g.length < best.length) best = g.slice(0, 4);
      }
    }
  }
  return best;
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
  phase: 'idle' | 'playing' | 'over';
  winnerTeam: number | null;
  resultText: string;
  gongMessage: string;
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

  const startNew = useCallback((prevLevel?: number) => {
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
      phase: 'playing',
      winnerTeam: null,
      resultText: '',
      gongMessage: '',
    });
    setSelected([]);
  }, []);

  useEffect(() => {
    startNew();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [startNew]);

  const me = game ? game.hands[0] : [];

  // 轮到玩家？
  const isMyTurn = game !== null && game.phase === 'playing' && game.current === 0;

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

  const applyHint = useCallback(() => {
    const ids = hint();
    if (ids.length) setSelected(ids);
  }, [hint]);

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
  const commitTurn = useCallback((player: number, play: GCard[] | null) => {
    setGame((prev) => {
      if (!prev) return prev;
      const hands = prev.hands.map((h) => [...h]);
      const lastPlay = play ? { player, cards: play, info: analyzePlay(play, prev.level)! } : null;
      const roundPass = [...prev.roundPass];
      const finished = [...prev.finished];
      // 本轮已出的牌：出牌追加到对应方位；一圈全过（新一轮）时清空
      const roundPlays = play ? [...prev.roundPlays, { player, cards: play }] : prev.roundPlays;

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
            if (newLevel > 14) {
              if (win === 0) { winnerTeam = 0; resultText = '🏆 打过 A！我方获胜！'; }
              else { winnerTeam = 1; resultText = '对方打过 A，重新打 A'; newLevel = 14; }
            } else if (newLevel === 14 && up >= 3) {
              // 到 A 即双上时才算胜——此处简化：到 A 后需要下一次双上，本局只升级到 A
              resultText = win === 0 ? '🚀 打到 A！下一局双上即获胜！' : '对方打到 A';
            }
            return {
              ...prev, hands, lastPlay, roundPass: [], roundPlays, finished,
              phase: 'over', winnerTeam, resultText,
              level: newLevel,
              current: finished[0],
            };
          }
        }
        // 出完非全结束：本轮继续（出牌追加到方位区，待一圈全过才清理）
        return {
          ...prev, hands, lastPlay, lastPlayBy: player, roundPass: [], roundPlays, current: (player + 1) % 4, turnStart: (player + 1) % 4,
        };
      } else {
        // 不出
        roundPass.push(player);
        if (roundPass.length >= 3) {
          // 一圈全过 → 最后出牌者自由出牌（新一轮开始，清理本轮出牌）
          const freer = prev.lastPlayBy;
          return { ...prev, hands, roundPass: [], roundPlays: [], current: freer, lastPlay: null, lastPlayBy: freer };
        }
        return { ...prev, hands, roundPass, roundPlays, current: (player + 1) % 4 };
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

  // AI 回合
  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.current === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const p = game.current;
    timerRef.current = setTimeout(() => {
      const prev = game.lastPlay;
      const isTeamLast = prev ? (prev.player === (p === 0 ? 2 : p === 2 ? 0 : p === 1 ? 3 : 1)) : false;
      const res = aiPlay(game.hands[p], prev ? prev.info : null, game.level, isTeamLast);
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
  const roundPlaysOf = (p: number) => (game ? game.roundPlays.filter((x) => x.player === p) : []);
  const renderRoundPlays = (p: number) => {
    const plays = roundPlaysOf(p);
    if (plays.length === 0) return null;
    return (
      <div className="gd-play-area">
        {plays.map((pl, i) => (
          <div key={i} className={`gd-play-hand ${i === plays.length - 1 ? 'gd-latest' : ''}`}>
            <span className="gd-play-hand-name">{NAMES[pl.player]}</span>
            <div className="gd-play-cards-row">
              {pl.cards.map((c) => (
                <span key={c.id} className={`gd-play-card ${c.k !== undefined ? 'gd-joker' : ''}`}>{cardText(c)}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const toggleCard = (id: number) => {
    if (!isMyTurn) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canPlay = checkSelection() !== null;
  const canPass = game?.lastPlay != null && isMyTurn;

  if (!game) return <div className="module-loading">发牌中…</div>;

  return (
    <div className={`gd-table ${floating ? 'gd-floating' : ''}`} onClick={requestFullscreenOnGesture}>
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
              <button className="gd-menu-btn" onClick={() => { startNew(game.level); setMenuOpen(false); }}>
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
          {counts[2] <= 10 && <span className="gd-seat-count">{counts[2]} 张</span>}
          {game.roundPass.includes(2) && <span className="gd-pass-tag">不出</span>}
          {game.finished.includes(2) && <span className="gd-finished-tag">已出完</span>}
        </div>
        <div className="gd-play-area gd-play-north">{renderRoundPlays(2)}</div>
        {/* 对手（左·西 / 右·东） + 中央轮状态 */}
        <div className="gd-side-row">
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-left ${game.current === 3 ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 对手B</span>
              {counts[3] <= 10 && <span className="gd-seat-count">{counts[3]} 张</span>}
              {game.roundPass.includes(3) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(3) && <span className="gd-finished-tag">已出完</span>}
            </div>
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
              {counts[1] <= 10 && <span className="gd-seat-count">{counts[1]} 张</span>}
              {game.roundPass.includes(1) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(1) && <span className="gd-finished-tag">已出完</span>}
            </div>
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
              <span className="gd-hand-group-label">{g.label}</span>
              <div className="gd-hand-group-cards">
                {g.cards.map((c) => (
                  <button
                    key={c.id}
                    className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? 'gd-card-joker' : (c.r === game.level ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'}`}
                    onClick={() => toggleCard(c.id)}
                  >
                    <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                    {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
                    {c.r === game.level && c.k === undefined && <span className="gd-card-level-tag">级</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {me.length === 0 && <div className="gd-hand-empty">牌已出完</div>}
        </div>
      ) : (
        <div className="gd-hand">
          {sortedHand.map((c, i) => (
            <button
              key={c.id}
              className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? 'gd-card-joker' : (c.r === game.level ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'}`}
              onClick={() => toggleCard(c.id)}
              style={{ marginLeft: i > 0 ? -Math.min(26, 260 / sortedHand.length) : 0 }}
            >
              <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
              {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
              {c.r === game.level && c.k === undefined && <span className="gd-card-level-tag">级</span>}
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
