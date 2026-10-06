/**
 * ChessKids - 五子棋 AI 引擎（v5 增强版）
 *
 * 核心升级（相对 v4）：
 * 1. 跳型（断点）威胁识别：X_XXX / XX_XX / X_XX 等跳四/跳三一子补缝即成五，
 *    不再被连续计数低估（v4 已上线）
 * 2. VCF 强制行棋搜索：master 下探测"连续冲四必胜链"，能杀时直接连杀，
 *    不再依赖大深度搜索偶然发现
 * 3. Zobrist 哈希 + 置换表（TT）：迭代加深跨层复用搜索结果，大幅提速，
 *    master 深度升至 5 层
 * 4. 自学习：结合近 10 盘对局记录（开局胜负加权 + 输局防守激进度），
 *    越下越了解对手弱项、越防越稳
 * 保留特性：先手/首手随机（候选点池）、中盘并列最高分随机、easy 随机扰动
 */

import {
  GOMOKU_SIZE, type GomokuBoard, type GomokuColor,
  gomokuPlaceStone, checkGomokuWin, isGomokuBoardFull,
} from './gomoku';

export interface GomokuDifficulty {
  key: 'easy' | 'medium' | 'hard' | 'master';
  label: string;
  depth: number;
  desc: string;
}

export const GOMOKU_DIFFICULTIES: GomokuDifficulty[] = [
  { key: 'easy', label: '简单', depth: 0, desc: '初级水平：只看眼前一步，偶尔会失误，适合刚入门的小朋友' },
  { key: 'medium', label: '中等', depth: 2, desc: '会看两步棋，能挡住你的冲四与活三，防守稳健' },
  { key: 'hard', label: '困难', depth: 3, desc: '三步推算 + 攻守兼顾，会主动做棋制造杀形' },
  { key: 'master', label: '大师', depth: 6, desc: '六步深算 + VCF 连杀 + 必胜组合识别，向高手水平看齐' },
];

// ============ 方向 ============
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

const inBoard = (r: number, c: number) => r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE;

// ============ 自学习（v5） ============

/** 自学习数据：开局胜负加权 + 防守激进度（由 gomokuLearn 分析对局记录生成） */
export interface GomokuLearnData {
  /** 加权开局池：AI 先手空盘时按权重随机落子（胜率高的开局权重高） */
  opening: Array<{ r: number; c: number; w: number }>;
  /** 防守激进度 0..3：历史输局越多越激进（越早堵组合威胁） */
  defenseLevel: number;
  /** v7：人类偏好方向权重（h/v/d1/d2 对应横/竖/主斜/副斜），对手该方向威胁加权，
   *  由对局记录中人类获胜五连方向统计生成——AI 对高发方向防守更提前 */
  dirWeights?: { h: number; v: number; d1: number; d2: number };
}

// ============ Zobrist 哈希 + 置换表（v5） ============

/** 随机表：ZOBRIST[r][c][0=黑 1=白] */
const ZOBRIST: number[][][] = (() => {
  const t: number[][][] = [];
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    t.push([]);
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      t[r].push([
        (Math.random() * 0xffffffff) >>> 0,
        (Math.random() * 0xffffffff) >>> 0,
      ]);
    }
  }
  return t;
})();

/** 全局面哈希（仅初始/根层调用，搜索内用增量） */
function boardHash(b: GomokuBoard): number {
  let h = 0;
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      const v = b[r][c];
      if (v === 'b') h ^= ZOBRIST[r][c][0];
      else if (v === 'w') h ^= ZOBRIST[r][c][1];
    }
  }
  return h;
}

interface TTEntry { d: number; f: 0 | 1 | 2; v: number; } // f: 0=精确 1=下界 2=上界
let tt = new Map<number, TTEntry>();
const TT_MAX = 400_000;
/** 每次 gomokuBestMove 开始时清空（rootColor 视角固定，避免符号串扰） */
function ttClear() { tt = new Map(); }

// ============ 候选 ============

/** 获取候选空位：已有棋子周围 2 格范围内的空点（控制搜索规模） */
export function gomokuCandidates(b: GomokuBoard): Array<[number, number]> {
  const n = GOMOKU_SIZE;
  const cand = new Set<string>();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] === '') continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (inBoard(nr, nc) && b[nr][nc] === '') cand.add(`${nr},${nc}`);
        }
      }
    }
  }
  const list: Array<[number, number]> = [];
  for (const s of cand) {
    const [rr, cc] = s.split(',').map(Number);
    list.push([rr, cc]);
  }
  // 无子时：从开局候选点随机选一个（先手/首手不固定不变）
  if (list.length === 0) {
    const ALL_OPENING: Array<[number, number]> = [
      [9, 9], [8, 8], [8, 9], [8, 10], [9, 8], [9, 10], [10, 8], [10, 9], [10, 10],
      [7, 7], [11, 11], [9, 7], [7, 9], [11, 9], [9, 11], [9, 5], [5, 9], [13, 9], [9, 13],
    ];
    const OPENING: Array<[number, number]> = ALL_OPENING.filter(([r, c]) => inBoard(r, c));
    const pick = OPENING[Math.floor(Math.random() * OPENING.length)];
    return [[pick[0], pick[1]]];
  }
  return list;
}

// ============ 威胁评估（v2 核心） ============

/**
 * v4 跳型（断点）威胁识别。
 * 传统"连续子"计数会把 X_XXX / XX_XX / X_XX 等跳型威胁低估为"三连/散子"，
 * 导致 AI 对对手沿对角/竖线逐步做棋（跳三→跳四→成五）反应滞后（对局记录实证）。
 * scanPattern 沿方向取 9 格窗口（含落子点），统计"总子数 + 断点数 + 两端开度"，
 * 一子补缝即可成五的跳型（sub>=5）会被立即识别。
 */
interface Pattern {
  sub: number;          // 窗口内同色子总数（落子点视为已落，截断到 5）
  brk: number;          // 断点数（0/1/2，两端各至多一段次连）
  openL: number;        // 主段左端是否开放（空位）
  openR: number;        // 主段右端是否开放
  mainStart: [number, number]; // 主连续段起点（供线级去重）
}

/** 沿方向扫描落子 (r,c)（视为已落 color）后的 5 子窗口模式 */
function scanPattern(b: GomokuBoard, r: number, c: number, dr: number, dc: number, color: GomokuColor): Pattern {
  const cells: string[] = [];
  // 9 格窗口：索引 4 必须是落子点 (r,c)（cells[4] 由下方覆盖为 color）
  for (let k = 0; k <= 8; k++) {
    const nr = r + dr * (k - 4), nc = c + dc * (k - 4);
    cells.push(inBoard(nr, nc) ? b[nr][nc] : '#');
  }
  cells[4] = color; // 落子点视为已落
  let li = 4, ri = 4, main = 1;
  while (li - 1 >= 0 && cells[li - 1] === color) { main++; li--; }
  while (ri + 1 <= 8 && cells[ri + 1] === color) { main++; ri++; }
  const openL = li - 1 >= 0 && cells[li - 1] === '' ? 1 : 0;
  const openR = ri + 1 <= 8 && cells[ri + 1] === '' ? 1 : 0;
  let leftSub = 0, rightSub = 0;
  if (openL) { let k = li - 2; while (k >= 0 && cells[k] === color) { leftSub++; k--; } }
  if (openR) { let k = ri + 2; while (k <= 8 && cells[k] === color) { rightSub++; k--; } }
  let sub = main, brk = 0;
  if (leftSub > 0) { sub += leftSub; brk++; }
  if (rightSub > 0) { sub += rightSub; brk++; }
  if (sub > 5) sub = 5;
  return {
    sub, brk,
    openL: openL as 0 | 1, openR: openR as 0 | 1,
    mainStart: [r + dr * (li - 4), c + dc * (li - 4)] as [number, number],
  };
}

/** 跳型模式分值（含断点型四/三，v4 核心升级） */
const PATTERN_VALUE = (p: Pattern): number => {
  const open = p.openL + p.openR;
  if (p.sub >= 5) return 10_000_000;                // 成五（含一子补缝成五）
  if (p.sub === 4) {
    if (p.brk === 0) return open === 2 ? 1_000_000 : open === 1 ? 200_000 : 0; // 活四 / 冲四
    return open === 2 ? 150_000 : open === 1 ? 80_000 : 0;                     // 跳四（活/眠）
  }
  if (p.sub === 3) {
    if (p.brk === 0) return open === 2 ? 50_000 : open === 1 ? 10_000 : 0;     // 活三 / 眠三
    return open === 2 ? 30_000 : open === 1 ? 8_000 : 0;                       // 跳三（活/眠）
  }
  if (p.sub === 2) {
    if (p.brk === 0) return open === 2 ? 5_000 : open === 1 ? 800 : 0;         // 活二 / 眠二
    return open === 2 ? 2_000 : open === 1 ? 400 : 0;                          // 跳二
  }
  return 100;
};

/**
 * 落子点威胁评分（color 视角）：
 * 单线分求和 + 组合威胁（双活三/四三/双冲四/活四 = 对手无法同时化解的必胜杀形）
 */
export function pointScore(b: GomokuBoard, r: number, c: number, color: GomokuColor): number {
  const lines = DIRS.map(([dr, dc]) => scanPattern(b, r, c, dr, dc, color));
  if (lines.some((p) => p.sub >= 5)) return 10_000_000; // 含跳型：一子补缝即成五

  let total = 0;
  let fours = 0;       // 四子威胁线（活四/冲四/跳四）
  let openFours = 0;   // 活四
  let threatThrees = 0;// 三子威胁线（活三/眠三/跳三）
  let openThrees = 0;  // 活三（含跳三活）
  let openTwos = 0;    // 活二
  for (const p of lines) {
    const open = p.openL + p.openR;
    if (open === 0) continue;
    total += PATTERN_VALUE(p);
    const isFour = p.sub === 4 && (p.brk === 0 ? open >= 1 : open === 2);
    const isThree = p.sub === 3 && (p.brk === 0 ? open >= 1 : open === 2);
    const isOpenThree = p.sub === 3 && p.brk === 0 && open === 2;
    const isOpenTwo = p.sub === 2 && p.brk === 0 && open === 2;
    if (isFour) { fours++; if (p.brk === 0 && open === 2) openFours++; }
    else if (isThree) { threatThrees++; if (isOpenThree) openThrees++; }
    else if (isOpenTwo) openTwos++;
  }

  // ---- 组合威胁（对手只能挡一处 → 必胜级） ----
  if (openFours >= 1) return 1_200_000;                    // 活四：下一步必成五
  if (fours >= 2) return 1_100_000;                        // 双冲四/冲四+跳四
  if (fours >= 1 && threatThrees >= 1) return 900_000;     // 四三杀（含跳三）
  if (openThrees >= 2) return 800_000;                     // 双活三（含跳三）
  if (openThrees >= 1 && threatThrees >= 2) return 700_000;// 活三 + 眠/跳三
  if (openTwos >= 2) total += 20_000;                      // 双活二

  return total;
}

/**
 * v7 核心：成长威胁窗口扫描（修复对局记录实证的"长线累积做棋防守滞后"）。
 *
 * 传统评估只识别"当前成型的活三/冲四/活四"，对手每 2-3 手在同一条线上 +1 子，
 * AI 分散应对各方向，最后一条长线连成五（对局记录 7 盘人类胜局中 6 盘如此）。
 *
 * 本函数枚举所有"3 子 + 2 空 + 无对方子"的 5 连窗口：对手落窗口内任一空位
 * 即成 4 子连威胁（活四/冲四/跳四），再落即成五。返回这些窗口内的 2 个空位
 * （升级点）＋ 窗口两端外侧的延伸点（落子同样会升级）。
 * AI 提前占据这些点 = 破坏对方成长线，从源头杜绝"活四成型后无解"。
 */
export function openThreeExtendPoints(b: GomokuBoard, color: GomokuColor): Set<string> {
  const n = GOMOKU_SIZE;
  const res = new Set<string>();
  const keyOf = (r: number, c: number) => `${r},${c}`;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] !== '') continue;
      for (const [dr, dc] of DIRS) {
        // 过 (r,c) 的方向线上，枚举所有包含 (r,c) 的 5 连窗口
        for (let off = 0; off < 5; off++) {
          const sr = r - dr * (4 - off), sc = c - dc * (4 - off);
          let cnt = 0, empty = 0, bad = false;
          const empties: Array<[number, number]> = [];
          for (let k = 0; k < 5; k++) {
            const nr = sr + dr * k, nc = sc + dc * k;
            if (!inBoard(nr, nc)) { bad = true; break; }
            const v = b[nr][nc];
            if (v === color) cnt++;
            else if (v === '') { empty++; empties.push([nr, nc]); }
            else { bad = true; break; }
          }
          if (bad || cnt !== 3 || empty !== 2) continue;
          // 3 子 2 空无对方子的窗口 = 成四升级窗口：窗口内 2 空位 + 两端外侧延伸点
          for (const [er, ec] of empties) res.add(keyOf(er, ec));
          const lr = sr - dr, lc = sc - dc;
          const rr = sr + dr * 5, rc = sc + dc * 5;
          if (inBoard(lr, lc) && b[lr][lc] === '') res.add(keyOf(lr, lc));
          if (inBoard(rr, rc) && b[rr][rc] === '') res.add(keyOf(rr, rc));
        }
      }
    }
  }
  return res;
}

/**
 * 线级威胁扫描（v3）：统计 color 在行/列/两向对角上的"整条连段"威胁。
 * 传统"点级求和"会把同一条活三线上的 3 个子拆成 3 份计分，且难以体现
 * 斜向长线做棋的累积价值；线级评估直接按"段长+两端状态"计分，
 * 能更早捕捉玩家沿对角逐步做棋的威胁。
 */
function lineSum(b: GomokuBoard, color: GomokuColor): number {
  const n = GOMOKU_SIZE;
  let total = 0;
  const seen = new Set<string>();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] !== color) continue;
      for (const [dr, dc] of DIRS) {
        const p = scanPattern(b, r, c, dr, dc, color);
        // 按主段起点去重：同一条连段的多个格子只计一次（跳型段起点=主段左端）
        const [sr, sc] = p.mainStart;
        const key = `${sr},${sc},${dr},${dc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        total += PATTERN_VALUE(p);
      }
    }
  }
  return total;
}

/** 全局面评估（v3）：线级威胁 + 点级交叉组合加成，防守系数 1.18 */
export function evaluateGomoku(b: GomokuBoard, color: GomokuColor): number {
  const opp = color === 'b' ? 'w' : 'b';
  const n = GOMOKU_SIZE;
  let mine = lineSum(b, color);
  let theirs = lineSum(b, opp);
  // 交叉组合加成：某点同时形成多条线威胁（活四/双冲四/四三/双活三）→ 必胜级加分
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = b[r][c];
      if (cell === color) { if (pointScore(b, r, c, color) >= 800_000) mine += 900_000; }
      else if (cell !== '') { if (pointScore(b, r, c, cell) >= 800_000) theirs += 900_000; }
    }
  }
  // v6：威胁潜力修正——统计双方"落 X 即形成 >=700k 组合"的空点数。
  // 对手潜力点越多，局面越危险（双杀/活四成型在即），评分相应下调，促使 AI 提前防守做棋苗头
  const cands = gomokuCandidates(b);
  // v6.2：潜力分级修正——对手落 X 即形成的组合威胁按强度加权，
  // 使"活三/跳三升级点"在做棋早期就在静态评估中显性（修复只堵成型、不防做棋的滞后）
  let myPot = 0, oppPot = 0;
  for (const [r, c] of cands) {
    const mv = pointScore(b, r, c, color);
    const ov = pointScore(b, r, c, opp);
    // v6.3：权重强化——对手落 X 即双活三/四三/活四（>=700k）是局面翻转点，重罚；
    //        对手落 X 即活三/冲四/跳四（>=50k）是做棋苗头，显著罚
    if (mv >= 700_000) myPot += 200_000;
    else if (mv >= 450_000) myPot += 60_000;
    else if (mv >= 200_000) myPot += 25_000;
    else if (mv >= 50_000) myPot += 15_000;
    if (ov >= 700_000) oppPot += 200_000;
    else if (ov >= 450_000) oppPot += 60_000;
    else if (ov >= 200_000) oppPot += 25_000;
    else if (ov >= 50_000) oppPot += 15_000;
  }
  mine += myPot;
  theirs += oppPot;
  // v8 攻守平衡：防守系数动态化——
  // 我方进攻潜力占优（mine >= theirs）→ 系数降到 1.0（不再用固定 1.18 压制进攻，鼓励进攻成形）；
  // 对方威胁更大 → 保持 1.18 加强防守。让搜索在攻守之间做真正的权衡而非一味防守。
  const defK = mine >= theirs ? 1.0 : 1.18;
  return mine - theirs * defK;
}

/**
 * 启发排序：候选按"落此子进攻分+防守分"降序。
 * v5：自学习防守激进度提升防守系数（历史输局多 → 更早堵对手苗头）
 */
/**
 * 启发排序：候选按"落此子进攻分+防守分"降序。
 * v5：自学习防守激进度提升防守系数（历史输局多 → 更早堵对手苗头）
 * v7：useGrowth=true（仅根层决策调用）时，计算成长窗口升级点并加权——
 * 搜索内部保持 v6 纯排序（openThreeExtendPoints 全盘扫描成本高，不能进搜索热路径）
 */
function orderedCandidates(
  b: GomokuBoard,
  color: GomokuColor,
  learn?: GomokuLearnData | null,
  useGrowth = false,
): Array<[number, number]> {
  const cands = gomokuCandidates(b);
  const opp = color === 'b' ? 'w' : 'b';
  // v8 攻守平衡：根层（useGrowth=true）动态防守加权——
  // 全局粗算攻守比：我方候选进攻分总和 >= 对方防守分总和 → 防守加权下调（鼓励进攻进候选）；
  // 对方威胁更大 → 防守加权上调（防守候选前置）。
  // 搜索内部保持固定 defK（避免热路径全盘求和开销）。
  let defK = 1.25 + (learn?.defenseLevel || 0) * 0.08;
  if (useGrowth) {
    let aSum = 0, dSum = 0;
    for (const [r, c] of cands) {
      aSum += pointScore(b, r, c, color);
      dSum += pointScore(b, r, c, opp);
    }
    if (aSum >= dSum) defK = Math.min(defK, 1.0);
    else defK = Math.max(defK, 1.3);
  }
  // v7：成长窗口升级点（仅根层决策时计算，避免搜索热路径全盘扫描）
  const oppGrowth = useGrowth ? openThreeExtendPoints(b, opp) : null;
  const myGrowth = useGrowth ? openThreeExtendPoints(b, color) : null;
  const scored = cands.map(([r, c]) => {
    const atk = pointScore(b, r, c, color);
    const def = pointScore(b, r, c, opp);
    // v6：对手落此子即形成组合威胁 → 防守分加权强制前置，
    // 让深度搜索一定把"提前封缝/封端"纳入候选（修复对局记录中"只堵成型、不防做棋"的滞后）
    // v6.3：新增 >=50k（对手活三/跳三成型点）x1.5——对手活三一手升活四/组合，
    //       必须让搜索候选必然包含这些点
    // v6.4：进攻分同样加权（己方组合威胁/活三成型点前置）——攻守双链都进候选
    let d = def;
    if (def >= 700_000) d *= 3.0;
    else if (def >= 450_000) d *= 1.6;
    else if (def >= 200_000) d *= 1.2;
    else if (def >= 50_000) d *= 1.5;
    // v7：成长升级点（对手 3 子窗口空位）权重提升——堵成长端优先于堵成型
    if (oppGrowth && oppGrowth.has(`${r},${c}`)) d *= 2.0;
    let a = atk;
    if (a >= 700_000) a *= 3.0;
    else if (a >= 450_000) a *= 1.6;
    else if (a >= 200_000) a *= 1.2;
    else if (a >= 50_000) a *= 1.3;
    if (myGrowth && myGrowth.has(`${r},${c}`)) a *= 1.7;
    return { r, c, v: a + d * defK + Math.random() * 0.001 };
  });
  scored.sort((a, b2) => b2.v - a.v);
  return scored.map((s) => [s.r, s.c] as [number, number]);
}

// ============ 搜索 ============

/**
 * alpha-beta 搜索（带时间预算）
 * @param deadline 性能上限（ms 时间戳）；超时返回当前层静态评估（浅层解）
 */
function search(
  b: GomokuBoard,
  color: GomokuColor,
  depth: number,
  alpha: number,
  beta: number,
  rootColor: GomokuColor,
  deadline: number,
  hash: number,
): number {
  if (performance.now() > deadline) return evaluateGomoku(b, rootColor);

  // 置换表查询（深度不足/界限不符时忽略）
  const entry = tt.get(hash);
  if (entry && entry.d >= depth) {
    if (entry.f === 0) return entry.v;
    if (entry.f === 1 && entry.v >= beta) return entry.v;
    if (entry.f === 2 && entry.v <= alpha) return entry.v;
  }

  const cands = gomokuCandidates(b);
  if (depth === 0 || cands.length === 0) return evaluateGomoku(b, rootColor);

  // 快速胜负检测：一步即胜
  if (depth >= 1) {
    const opp = color === 'b' ? 'w' : 'b';
    for (const [r, c] of cands) {
      const nb = gomokuPlaceStone(b, r, c, color);
      if (nb && checkGomokuWin(nb, r, c, color)) return rootColor === color ? 100_000_000 - depth : -100_000_000 + depth;
    }
    // 对方一步即胜（必须堵）
    for (const [r, c] of cands) {
      const nb = gomokuPlaceStone(b, r, c, opp);
      if (nb && checkGomokuWin(nb, r, c, opp)) {
        return rootColor === color ? -1_000_000 : 1_000_000;
      }
    }
  }

  const ordered = orderedCandidates(b, color);
  const limit = depth >= 5 ? 16 : depth >= 3 ? 14 : 12;
  const picks = ordered.slice(0, limit);

  let best = -Infinity;
  const alphaOrig = alpha;
  for (const [r, c] of picks) {
    const nb = gomokuPlaceStone(b, r, c, color)!;
    const childHash = hash ^ ZOBRIST[r][c][color === 'b' ? 0 : 1];
    const v = -search(nb, color === 'b' ? 'w' : 'b', depth - 1, -beta, -alpha, rootColor, deadline, childHash);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  // 置换表写入（内存上限保护）
  if (tt.size > TT_MAX) ttClear();
  if (best >= beta) tt.set(hash, { d: depth, f: 1, v: best });
  else if (best <= alphaOrig) tt.set(hash, { d: depth, f: 2, v: best });
  else tt.set(hash, { d: depth, f: 0, v: best });
  return best;
}

// ============ VCF 强制行棋（v5） ============

/**
 * VCF（连续冲四）必胜链探测：我方沿"单端冲四→对手唯一应对→再冲四…"连杀至成五。
 * 标准 VCF 每一步都是唯一应对（单端冲四），分支极小，深度可达 10+ 手。
 * @returns 链首着法（我方当前应落点）；找不到必胜链返回 null
 */
function vcfAttack(
  board: GomokuBoard,
  color: GomokuColor,
  depth = 0,
  maxDepth = 12,
  budget: { n: number } = { n: 0 },
): [number, number] | null {
  budget.n++;
  if (budget.n > 5000) return null;   // 节点预算保护
  if (depth >= maxDepth) return null;

  const cands = gomokuCandidates(board);
  // 一步成五 / 一步组合杀（含活四：对手堵不住两端）
  for (const [r, c] of cands) {
    const v = pointScore(board, r, c, color);
    if (v >= 10_000_000) return [r, c];
    if (v >= 900_000) return [r, c];
  }

  // 严格冲四候选：落 X 后形成"单端冲四"（对手唯一应对点=开放端）
  const opp = color === 'b' ? 'w' : 'b';
  const cds: Array<{ r: number; c: number; end: [number, number]; sc: number }> = [];
  for (const [r, c] of cands) {
    const nb = gomokuPlaceStone(board, r, c, color)!;
    for (const [dr, dc] of DIRS) {
      const p = scanPattern(nb, r, c, dr, dc, color);
      if (p.sub === 4 && p.brk === 0 && p.openL + p.openR === 1) {
        const [sr, sc2] = p.mainStart;
        const end: [number, number] = p.openL ? [sr - dr, sc2 - dc] : [sr + 4 * dr, sc2 + 4 * dc];
        cds.push({ r, c, end, sc: pointScore(board, r, c, color) });
        break;
      }
    }
  }
  if (cds.length === 0) return null;
  cds.sort((a, b2) => b2.sc - a.sc);

  // 逐个尝试：我方落 X → 对手必堵 end → 递归续冲四链
  for (const cd of cds.slice(0, 6)) {
    const nb = gomokuPlaceStone(board, cd.r, cd.c, color)!;
    const nb2 = gomokuPlaceStone(nb, cd.end[0], cd.end[1], opp)!;
    const chain = vcfAttack(nb2, color, depth + 1, maxDepth, budget);
    if (chain) return [cd.r, cd.c];
  }
  return null;
}

// ============ 对外主入口 ============

/** 五子棋最佳落子（按难度 + 可选自学习数据） */
export function gomokuBestMove(
  board: GomokuBoard,
  color: GomokuColor,
  diff: GomokuDifficulty,
  learn?: GomokuLearnData | null,
): [number, number] | null {
  const cands = gomokuCandidates(board);
  if (cands.length === 0) return null;
  const opp = color === 'b' ? 'w' : 'b';
  // 自学习：防守激进度 → 组合威胁必堵阈值下调（更早堵）/ 防守系数上调

  // 空盘先手：自学习加权开局（保持多样性，但偏好历史胜率高的开局点）
  const isEmpty = board.every((row) => row.every((cell) => cell === ''));
  if (isEmpty && learn && learn.opening.length > 0) {
    const total = learn.opening.reduce((s, e) => s + e.w, 0);
    if (total > 0) {
      let roll = Math.random() * total;
      for (const e of learn.opening) { roll -= e.w; if (roll <= 0) return [e.r, e.c]; }
      return [learn.opening[learn.opening.length - 1].r, learn.opening[learn.opening.length - 1].c];
    }
  }

  // easy：贪心（进攻+防守评分），带明显随机，水平弱但有变化
  if (diff.depth === 0) {
    const scored = cands.map(([r, c]) => {
      const atk = pointScore(board, r, c, color);
      const def = pointScore(board, r, c, opp);
      return { r, c, v: atk + def * 0.9 + Math.random() * 0.3 };
    });
    scored.sort((a, b2) => b2.v - a.v);
    return [scored[0].r, scored[0].c];
  }

  // 一步制胜
  for (const [r, c] of cands) {
    const nb = gomokuPlaceStone(board, r, c, color);
    if (nb && checkGomokuWin(nb, r, c, color)) return [r, c];
  }
  // 必须防守：对方一步胜
  for (const [r, c] of cands) {
    const nb = gomokuPlaceStone(board, r, c, opp);
    if (nb && checkGomokuWin(nb, r, c, opp)) return [r, c];
  }

  // v6 威胁分级（修复：旧版">=800k 立即返回"让 master 中局不做深算，只堵眼前成型、
  // 看不到对手 2-3 手后的做棋升级，导致对局记录中 5 局全部死于"活四/双杀成型"）
  // 1) 我方活四（>=1.2M）：必胜，直接走出
  if (diff.depth >= 3) {
    for (const [r, c] of cands) {
      if (pointScore(board, r, c, color) >= 1_200_000) return [r, c];
    }
  }
  // 2) 对方活四成型点（>=1.2M）：必堵（活四不可防，除己方已有必胜杀外优先堵）
  if (diff.depth >= 2) {
    const oppFours: Array<[number, number]> = [];
    for (const [r, c] of cands) {
      if (pointScore(board, r, c, opp) >= 1_200_000) oppFours.push([r, c]);
    }
    if (oppFours.length > 0) {
      const scored = oppFours.map(([r, c]) => ({
        r, c, v: pointScore(board, r, c, color) + pointScore(board, r, c, opp) + Math.random() * 0.001,
      }));
      scored.sort((a, b2) => b2.v - a.v);
      return [scored[0].r, scored[0].c];
    }
  }
  // 3) 组合威胁分级（v6.3：阈值 900k -> 700k，把"双活三 800k / 活三+眠三 700k"
  //    成型点也纳入必堵——对局记录实证 AI 多次死于对手一手成双活三后无解）
  //    我方 >=700k 组合且对方无同级威胁 → 直接进攻（快速路径）
  //    对方有 >=700k 威胁 → 必须优先堵（多威胁选攻防最优）
  if (diff.depth >= 3) {
    const my900: Array<[number, number]> = [];
    const opp900: Array<[number, number]> = [];
    for (const [r, c] of cands) {
      const av = pointScore(board, r, c, color);
      if (av >= 700_000 && av < 1_200_000) my900.push([r, c]);
      if (pointScore(board, r, c, opp) >= 700_000) opp900.push([r, c]);
    }
    if (opp900.length > 0) {
      // v8 攻守平衡：先测算我方进攻价值——若我方有同级组合威胁（>=700k）
      // 且最佳进攻值 >= 对方最佳威胁值 → 进攻优于防守，优先进攻
      const oppBest = Math.max(...opp900.map(([r, c]) => pointScore(board, r, c, opp)));
      let myBestAtk = 0;
      for (const [r, c] of cands) {
        const av = pointScore(board, r, c, color);
        if (av > myBestAtk) myBestAtk = av;
      }
      if (my900.length > 0 && myBestAtk >= 700_000 && myBestAtk >= oppBest) {
        const scored = my900.map(([r, c]) => ({
          r, c, v: pointScore(board, r, c, color) + pointScore(board, r, c, opp) + Math.random() * 0.001,
        }));
        scored.sort((a, b2) => b2.v - a.v);
        return [scored[0].r, scored[0].c];
      }
      // 对方威胁更紧迫 → 优先堵（攻防综合选最优堵点）
      const scored = opp900.map(([r, c]) => ({
        r, c, v: pointScore(board, r, c, color) + pointScore(board, r, c, opp) + Math.random() * 0.001,
      }));
      scored.sort((a, b2) => b2.v - a.v);
      return [scored[0].r, scored[0].c];
    }
    if (my900.length > 0) {
      // 取攻防综合最优者（避免堵点浪费）
      const scored = my900.map(([r, c]) => ({
        r, c, v: pointScore(board, r, c, color) + pointScore(board, r, c, opp) + Math.random() * 0.001,
      }));
      scored.sort((a, b2) => b2.v - a.v);
      return [scored[0].r, scored[0].c];
    }
  }

  // VCF 强制行棋（master）：有连续冲四必胜链时直接连杀（先于深度搜索）
  if (diff.depth >= 4) {
    const vcf = vcfAttack(board, color);
    if (vcf) return vcf;
  }

  // v7：成长端预堵快速路径（hard/master）——对方"3 子成长窗口"升级点，
  // 在对方连成 4 子之前封住成长线（对局记录实证：人类 6/7 盘胜局靠长线累积五连，
  // AI 在 3 子阶段堵升级点可提前瓦解；仅升级点 ≤10 时强制处理，避免中盘过度干预）
  if (diff.depth >= 3) {
    const oppGrowth = openThreeExtendPoints(board, opp);
    if (oppGrowth.size > 0 && oppGrowth.size <= 10) {
      const myGrowth = openThreeExtendPoints(board, color);
      const gpts: Array<[number, number]> = [];
      for (const s of oppGrowth) {
        const [gr, gc] = s.split(',').map(Number);
        gpts.push([gr, gc]);
      }
      // 攻防综合最优：优先选"同时对我方进攻也有帮助"的升级点
      const scored = gpts.map(([gr, gc]) => ({
        r: gr, c: gc,
        v: pointScore(board, gr, gc, color) + pointScore(board, gr, gc, opp) * 1.2
          + (myGrowth.has(`${gr},${gc}`) ? 400_000 : 0) + Math.random() * 0.001,
      }));
      scored.sort((a, b2) => b2.v - a.v);
      const bestPt = scored[0];
      // v8 攻守平衡：若我方有更强进攻成型点（>=450k 活三/组合级）且对方升级点威胁不足
      // → 进攻优于防守，不强制堵，交给深度搜索做攻守权衡（避免牺牲进攻机会）
      let myBestAtk = 0;
      for (const [r, c] of cands) {
        const av = pointScore(board, r, c, color);
        if (av > myBestAtk) myBestAtk = av;
      }
      // 仅在对方升级点数量少（早期做棋）且我方无更强进攻时强制，避免牺牲进攻
      if (bestPt.v > 150_000 && myBestAtk < 450_000) return [bestPt.r, bestPt.c];
    }
  }

  // 深度搜索：master 迭代加深（1→depth，超时保留最近完成的完整层），带置换表提速
  const budgetMs = diff.key === 'master' ? 3200 : diff.key === 'hard' ? 1400 : 900;
  const t0 = performance.now();
  ttClear(); // 每次决策独立 TT（rootColor 视角固定）
  const rootHash = boardHash(board);
  const picks = orderedCandidates(board, color, learn, true).slice(0, diff.depth >= 5 ? 20 : diff.depth >= 3 ? 18 : 12);
  let bestMoves: Array<[number, number]> = [];
  for (let d = 1; d <= diff.depth; d++) {
    const deadline = t0 + budgetMs * (d / diff.depth);
    let bv = -Infinity;
    const bm: Array<[number, number]> = [];
    for (const [r, c] of picks) {
      if (performance.now() > deadline) break;
      const nb = gomokuPlaceStone(board, r, c, color)!;
      const childHash = rootHash ^ ZOBRIST[r][c][color === 'b' ? 0 : 1];
      const v = -search(nb, opp, d - 1, -Infinity, Infinity, color, deadline, childHash);
      if (v > bv) { bv = v; bm.length = 0; bm.push([r, c]); }
      else if (v === bv) { bm.push([r, c]); }
    }
    if (bm.length > 0) bestMoves = bm;
    if (performance.now() > t0 + budgetMs) break;
  }
  if (bestMoves.length === 0) return picks[0] as [number, number];
  // 并列最高分时随机选择：同一局面不同对局 AI 落子位置不固定
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

/** 提示：用 hard 深度计算一着 */
export function gomokuHintMove(board: GomokuBoard, color: GomokuColor): [number, number] | null {
  return gomokuBestMove(board, color, { key: 'hard', label: '困难', depth: 3, desc: '' });
}

/** 简单局面终局判定（供模块复用） */
export function isGomokuOver(board: GomokuBoard): boolean {
  return isGomokuBoardFull(board);
}
