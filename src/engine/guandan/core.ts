/**
 * 掼蛋纯规则引擎（同构模块）
 * - 不依赖 React / DOM / Node API，浏览器、Web Worker、Node 服务端共用同一份规则
 * - 所有导出均为纯函数：牌型识别、比牌、发牌、跟牌搜索、理牌
 */
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
// 作单张时视为级牌本身（与普通级牌同级，互相不能压）
// ================================================================
export function isWild(c: GCard, level: number): boolean {
  return c.k === undefined && c.s === 'H' && c.r === levelRank(level);
}
export const WILD_SINGLE_KEY = 16; // 保留兼容：红桃级牌单出 = 级牌（同级 16）
export const WILD_GROUP_KEY = 16;  // 双变牌成对/三张 = 级牌组（同级 16）

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

export function groupHand(hand: GCard[], level: number, scheme: number = 0): HandGroup[] {
  // 理牌方案：不同优先级组合，用户可循环切换
  // 0=标准（同花顺优先→炸弹→三连对→顺子→三带二→散牌）
  // 1=炸弹优先（炸弹→三带二→三连对→同花顺→顺子→散牌）
  // 2=顺子优先（顺子→同花顺→三连对→三带二→炸弹→散牌）
  // 3=对子优先（三连对→三带二→对子→顺子→同花顺→炸弹→散牌）
  const SCHEMES: Record<number, string[]> = {
    0: ['sf', 'bomb', 'trio', 'str8', 'full', 'rest'],
    1: ['bomb', 'full', 'trio', 'sf', 'str8', 'rest'],
    2: ['str8', 'sf', 'trio', 'full', 'bomb', 'rest'],
    3: ['trio', 'full', 'pair', 'str8', 'sf', 'bomb', 'rest'],
  };
  const order = SCHEMES[scheme] || SCHEMES[0];
  const used = new Set<number>();
  const out: HandGroup[] = [];
  const lr = levelRank(level);
  const take = (cards: GCard[], label: string) => {
    if (!cards || cards.length === 0) return;
    cards.forEach((c) => used.add(c.id));
    out.push({ label, cards: [...cards] });
  };
  const avail = () => hand.filter((c) => !used.has(c.id));
  const wildsOf = (cs: GCard[]) => cs.filter((c) => isWild(c, level));

  // ---- 子函数：各牌型分组 ----
  const findStraightFlush = () => {
    let sf = true;
    while (sf) {
      sf = false;
      for (const s of ['S', 'H', 'C', 'D']) {
        const sc = avail().filter((c) => c.s === s && c.k === undefined && !isWild(c, level));
        const ranks = [...new Set(sc.map((c) => c.r))].filter((r) => r >= 3 && r <= 14).sort((a, b) => b - a); // 2 不能进顺/同花顺
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
        for (const s of ['S', 'H', 'C', 'D']) {
          const sc = avail().filter((c) => c.s === s && c.k === undefined && !isWild(c, level));
          const base = new Set(sc.map((c) => c.r));
          const ws = wildsOf(avail());
          for (let hi = 14; hi >= 7; hi--) {
            const lo = hi - 4; // 最小顺子 3-4-5-6-7，2 不能进顺
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
  };

  const findBombs = () => {
    let bomb = true;
    while (bomb) {
      bomb = false;
      const ng = groupByR(avail().filter((c) => !isWild(c, level)));
      for (const [k, arr] of ng) {
        if (k < 19) {
          const ws = wildsOf(avail());
          // 4张及以上同点数（含变牌）全部归为炸弹，不再只取4张
          if (arr.length >= 4) {
            // 纯炸弹：4张以上，全部放入炸弹组
            take([...arr], `${arr.length}炸`);
            bomb = true;
            break;
          }
          if (arr.length === 3 && ws.length >= 1) {
            take([...arr, ws[0]], '4炸');
            bomb = true;
            break;
          }
          if (arr.length === 2 && ws.length >= 2) {
            take([...arr, ws[0], ws[1]], '4炸');
            bomb = true;
            break;
          }
        }
      }
    }
  };

  const findTrioPairs = () => {
    let trio = true;
    while (trio) {
      trio = false;
      const ng = groupByR(avail().filter((c) => !isWild(c, level)));
      const ws = wildsOf(avail());
      // 按牌力排序且过滤 2：级牌优先、2 不能进连对
      const pairRanks = [...ng.entries()].filter(([, arr]) => arr.length >= 2)
        .map(([k]) => k).filter((k) => k >= 3 && k <= 14)
        .sort((a, b) => b - a);
      for (let i = 0; i + 2 < pairRanks.length; i++) {
        if (pairRanks[i + 1] === pairRanks[i] - 1 && pairRanks[i + 2] === pairRanks[i] - 2) {
          const pick = [pairRanks[i], pairRanks[i + 1], pairRanks[i + 2]].flatMap((k) => ng.get(k)!.slice(0, 2));
          take(pick, `三连对 ${rankName(pairRanks[i])}`);
          trio = true;
          break;
        }
      }
      if (!trio) {
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
  };

  const findStraights = () => {
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
  };

  const findFullHouses = () => {
    let full = true;
    while (full) {
      full = false;
      const ng = groupByR(avail().filter((c) => !isWild(c, level)));
      const ws = wildsOf(avail());
      // 按牌力排序：级牌三张优先组三带二（打 K 时 K 先于 A）
      const trips = [...ng.entries()].filter(([, arr]) => arr.length >= 3)
        .sort((a, b) => cardVal(b[1][0], level) - cardVal(a[1][0], level)).map(([k]) => k);
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
  };

  const findPairs = () => {
    const ng = groupByR(avail().filter((c) => !isWild(c, level)));
    const ws = wildsOf(avail());
    // 按牌力排序：级牌优先于普通牌（打 K 时 K 在 A 前）
    for (const [k, arr] of [...ng.entries()].sort((a, b) => cardVal(b[1][0], level) - cardVal(a[1][0], level))) {
      if (k < 19 && arr.length >= 2) {
        take(arr.slice(0, 2), `对子 ${rankName(k)}`);
      } else if (k < 19 && arr.length === 1 && ws.length >= 1) {
        take([arr[0], ws[0]], `对子 ${rankName(k)}`);
        ws.shift();
      }
    }
  };

  const collectRest = () => {
    // 散牌排序按牌力（cardVal）：大王 > 小王 > 级牌 > A > … > 3 > 非级牌2
    const rest = [...groupByR(avail()).entries()].sort((a, b) =>
      cardVal(b[1][0], level) - cardVal(a[1][0], level)
    );
    for (const [, arr] of rest) {
      const c0 = arr[0];
      if (c0.k === 1) take(arr, '大王');
      else if (c0.k === 0) take(arr, '小王');
      else if (isWild(c0, level)) {
        const curWs = wildsOf(avail());
        if (curWs.length >= 3) take(curWs.slice(0, 3), '三张 ·变');
        else if (curWs.length >= 2) take(curWs.slice(0, 2), '对子 ·变');
        else take([c0], '变牌 顶级单张');
      }
      else if (arr.length === 3) take(arr, `三张 ${rankName(c0.r)}${c0.r === lr ? '·级' : ''}`);
      else if (arr.length === 2) take(arr, `对子 ${rankName(c0.r)}${c0.r === lr ? '·级' : ''}`);
      else take(arr, `单张 ${rankName(c0.r)}${c0.r === lr ? '·级' : ''}`);
    }
  };

  // ---- 按方案顺序执行 ----
  const fns: Record<string, () => void> = {
    sf: findStraightFlush,
    bomb: findBombs,
    trio: findTrioPairs,
    str8: findStraights,
    full: findFullHouses,
    pair: findPairs,
    rest: collectRest,
  };
  for (const key of order) {
    if (fns[key]) fns[key]();
  }
  return out;
}


export function analyzePlay(cards: GCard[], level: number): PlayInfo | null {
  const n = cards.length;
  if (n === 0) return null;
  const wilds = cards.filter((c) => isWild(c, level));
  const normal = cards.filter((c) => !isWild(c, level));
  const w = wilds.length;
  const norm = cards.map((c) => ({ c, v: pointVal(c, level) }));
  norm.sort((a, b) => a.v - b.v);

  // 王炸：四张王（两副牌大小王各两张）——唯一王炸形态，全场最大
  if (n === 4 && cards.every((c) => c.k !== undefined)) {
    return { type: 'ROCKET', key: 19, size: 4, cards };
  }

  // 单张：红桃级牌单出视为级牌（key=16，与普通级牌同级，互相不能压）；王最大
  if (n === 1) {
    return { type: 'SINGLE', key: cardVal(cards[0], level), size: 1, cards };
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
    return { type: 'PLANE', key: seqVal(ranks[ranks.length - 1]), size: n, cards }; // 按最高牌原数，级牌不抬升
  }

  // 连对（3+ 对连续）/ 钢板（连续三张）：变牌可补缺口
  if (w > 0 && n >= 6) {
    const ng = groupByR(normal);
    const nArr = [...ng.entries()].filter(([, g]) => g.every((c) => c.k === undefined));
    // 连对：每组 ≤2 张，变牌补齐成对
    if (n % 2 === 0 && n / 2 >= 3) {
      let ok = true;
      const rs: number[] = [];
      let need = 0;
      for (const [r, g] of nArr) {
        if (r < 3 || r > 14) { ok = false; break; }
        if (g.length > 2) { ok = false; break; }
        rs.push(r);
        need += 2 - g.length;
      }
      if (ok && need <= w && nArr.length === n / 2) {
        rs.sort((a, b) => a - b);
        if (onlySeqOk(rs)) {
          return { type: 'PAIR_SEQ', key: seqVal(rs[rs.length - 1]), size: n, cards };
        }
      }
    }
    // 钢板：每组 ≤3 张，变牌补齐成三张
    if (n % 3 === 0 && n / 3 >= 2) {
      let ok = true;
      const rs: number[] = [];
      let need = 0;
      for (const [r, g] of nArr) {
        if (r < 3 || r > 14) { ok = false; break; }
        if (g.length > 3) { ok = false; break; }
        rs.push(r);
        need += 3 - g.length;
      }
      if (ok && need <= w && nArr.length === n / 3) {
        rs.sort((a, b) => a - b);
        if (onlySeqOk(rs)) {
          return { type: 'PLANE', key: seqVal(rs[rs.length - 1]), size: n, cards };
        }
      }
    }
  }

  // 连对（纯牌，3+ 对连续）
  if (w === 0 && n >= 6 && n % 2 === 0 && sizes.every((s) => s === 2) && onlySeqOk(ranks)) {
    return { type: 'PAIR_SEQ', key: seqVal(ranks[ranks.length - 1]), size: n, cards };
  }

  // 顺子 / 同花顺（固定 5 张；变牌补缺口）
  if (n === 5 && normal.every((c) => c.k === undefined)) {
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

// 判断 cur 能否大过 prev（职业规则：同花顺 > 4/5 炸，但 < 6 炸及以上；王炸最大）
export function canBeat(prev: PlayInfo, cur: PlayInfo): boolean {
  // 同花顺与炸弹交叉大小：同花顺只压 4/5 张炸弹；6 张及以上炸弹才能压同花顺
  if (prev.type === 'BOMB' && cur.type === 'STRAIGHT_FLUSH') return prev.size <= 5;
  if (prev.type === 'STRAIGHT_FLUSH' && cur.type === 'BOMB') return cur.size >= 6;
  if (prev.type === 'ROCKET') return false; // 王炸/天王炸：任何牌不能压
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
  // 普通牌型：必须同型且点数更大（顺子/连对/钢板等还需同长度）
  if (cur.type !== prev.type) return false;
  if (cur.size !== prev.size) return false;
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

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  if (prev.type === 'STRAIGHT') {
    const seq = findSeq(hand, prev.size, prev.key, false);
    if (seq) return seq;
  }
  if (prev.type === 'STRAIGHT_FLUSH') {
    // 只能被更大的同花顺压（同长）；找不到再考虑炸弹
    for (const s of ['S', 'H', 'C', 'D']) {
      const sc = hand.filter((c) => c.s === s && c.k === undefined);
      const ranks = [...new Set(sc.map((c) => c.r))].filter((r) => r >= 3 && r <= 14).sort((a, b) => b - a);
      for (let i = 0; i + 4 < ranks.length; i++) {
        let len = 1;
        while (i + len < ranks.length && ranks[i + len] === ranks[i] - len) len++;
        if (len >= 5) {
          const want = ranks.slice(i, i + 5);
          if (want[0] > prev.key) return want.map((r) => sc.find((c) => c.r === r)!);
        }
      }
    }
    const bombBeat = findBombBeat(hand, prev, level);
    if (bombBeat) return bombBeat;
    return null;
  }
  if (prev.type === 'PAIR_SEQ') {
    const len = prev.size / 2;
    return findSeq(hand, len * 2, prev.key, true);
  }
  if (prev.type === 'PLANE') {
    const len = prev.size / 3;
    return findSeq(hand, len * 3, prev.key, false, true);
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
  // 王炸候选：仅四张王才是王炸；两张/三张王不成牌型，绝不能当炸弹压
  if (kings.length === 4) cands.push({ cards: kings, kind: 2, n: 4, key: 0 });

  const ok = cands.filter((c) => {
    if (prev.type === 'BOMB') {
      if (c.kind === 0) return c.n > prev.size || (c.n === prev.size && c.key > prev.key);
      if (c.kind === 1) return prev.size <= 5; // 同花顺只压 4/5 张炸弹（职业规则）
      return true; // 王炸
    }
    if (prev.type === 'STRAIGHT_FLUSH') {
      if (c.kind === 1) return c.key > prev.key;
      if (c.kind === 0) return c.n >= 6; // 6 张及以上炸弹才能压同花顺（职业规则）
      return true; // 王炸
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
  // 王炸候选：仅四张王（两副牌大小王各两张）才是王炸；两张/三张王不成牌型，绝不能当炸弹压
  if (kings.length === 4) out.push({ cards: kings, kind: 2, n: 4, key: 0 });
  out.sort((a, b) => (a.kind !== b.kind ? a.kind - b.kind : (a.kind === 0 ? (a.n !== b.n ? a.n - b.n : a.key - b.key) : (a.kind === 1 ? a.key - b.key : 0))));
  return out;
}

// 所有能压 prev 的出牌方案（同型从最小到大，再追加炸弹/同花顺/王炸），供连续点击提示循环切换
export function allBeats(hand: GCard[], prev: PlayInfo, level: number): GCard[][] {
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
    const pushed = new Set<string>();
    for (let min = prev.key + 1; min <= 14; min++) { const seq = findSeq(hand, 5, min - 1, false); if (seq) { const k = seq.map((c) => c.id).sort((a, b) => a - b).join(','); if (!pushed.has(k)) { pushed.add(k); push(seq); } } }
  } else if (prev.type === 'PAIR_SEQ') {
    const pushed = new Set<string>();
    for (let min = prev.key + 1; min <= 14; min++) { const seq = findSeq(hand, prev.size, min - 1, true); if (seq) { const k = seq.map((c) => c.id).sort((a, b) => a - b).join(','); if (!pushed.has(k)) { pushed.add(k); push(seq); } } }
  } else if (prev.type === 'PLANE') {
    const pushed = new Set<string>();
    for (let min = prev.key + 1; min <= 14; min++) { const seq = findSeq(hand, prev.size, min - 1, false, true); if (seq) { const k = seq.map((c) => c.id).sort((a, b) => a - b).join(','); if (!pushed.has(k)) { pushed.add(k); push(seq); } } }
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
