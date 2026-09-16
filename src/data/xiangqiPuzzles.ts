/**
 * ChessKids - 中国象棋战术谜题数据
 * 全部为「红先一步杀」，每题均由引擎审计：红方未被将军、唯一正解
 * 按难度分三档：1⭐ 杀形明显 → 2⭐ 稍隐蔽 → 3⭐ 子力多/杀形深
 *
 * 坐标系：board[row][col]
 *  row 0 = 黑方底线（将），row 9 = 红方底线（帅）
 *  col 0 = 红方视角最左（九路），col 8 = 最右（一路）
 *  红方大写 K帅 A仕 B相 N马 R车 C炮 P兵
 *  黑方小写 k将 a士 b象 n马 r车 c炮 p卒
 */

import type { XiangqiBoard, XiangqiSquare } from '../types/xiangqi';

/** 战术谜题 */
export interface XiangqiPuzzle {
  id: string;
  /** 杀法类型 key */
  type: XiangqiTacticType;
  /** 杀法名 */
  typeName: string;
  title: string;
  description: string;
  board: XiangqiBoard;
  /** 正解：红方一步杀 [from, to] */
  answer: { from: XiangqiSquare; to: XiangqiSquare };
  hint: string;
  difficulty: 1 | 2 | 3;
}

export type XiangqiTacticType =
  | 'duimian'   // 白脸将/对面笑
  | 'mangong'   // 闷宫
  | 'mahoupao'  // 马后炮
  | 'wocao'     // 卧槽马
  | 'zhongpao'  // 重炮
  | 'shuangju'  // 双车错
  | 'tiemenshuan' // 铁门栓
  | 'dadao'     // 大刀剜心
  | 'guajiao'   // 挂角马
  | 'diaoyu'    // 钓鱼马
  | 'qiju';     // 弃车杀

export interface XiangqiTacticTypeInfo {
  name: string;
  description: string;
  icon: string;
  /** 口诀（儿童易记） */
  chant: string;
}

export const XIANGQI_TACTIC_TYPES: Record<XiangqiTacticType, XiangqiTacticTypeInfo> = {
  duimian: {
    name: '白脸将（对面笑）',
    description: '利用「将帅不能直接对面」的规则，用车或炮将军，使黑将无法躲回中路，形成杀棋。',
    icon: '🚗',
    chant: '将帅对面不相见，车炮借势锁中宫。',
  },
  mangong: {
    name: '闷宫',
    description: '炮借黑方自己的士（或象）当炮架将军，黑将被自己的士象堵在九宫无路可逃。',
    icon: '💥',
    chant: '士象堵住将门庭，炮打闷宫一步成。',
  },
  mahoupao: {
    name: '马后炮',
    description: '马先控制黑将的所有逃路，炮紧贴马后沿同一条线将军，黑将无处可躲。',
    icon: '🐴',
    chant: '马控将位炮跟进，一线绝杀最销魂。',
  },
  wocao: {
    name: '卧槽马',
    description: '马跳到黑方下二路象位（卧槽位）将军，逼黑将升起，再用车或炮成杀。',
    icon: '🐎',
    chant: '卧槽马儿跳象位，逼将升楼车炮追。',
  },
  zhongpao: {
    name: '重炮',
    description: '双炮叠在同一条线上，前炮当炮架、后炮将军，黑方无子可垫、无法化解。',
    icon: '🎯',
    chant: '两炮叠阵势如虹，无垫可解必成空。',
  },
  shuangju: {
    name: '双车错',
    description: '双车分占两条要道，交替将军，黑将顾此失彼、无法同时防守。',
    icon: '🚙',
    chant: '双车交错两翼攻，老将顾此又失彼。',
  },
  tiemenshuan: {
    name: '铁门栓',
    description: '中炮镇住中路拴链黑方士象，车直插将门肋道或下底，黑将无路可走。',
    icon: '🔒',
    chant: '中炮镇宫车闷门，铁栓一落将难逃。',
  },
  dadao: {
    name: '大刀剜心',
    description: '车（或兵）大胆吃掉黑方中心士，直插九宫花心，摧毁防线成杀。',
    icon: '🗡️',
    chant: '大刀剜心破士城，帅车接力定乾坤。',
  },
  guajiao: {
    name: '挂角马',
    description: '马跳到黑方士角（九宫角）将军，逼黑将离位，再配合车炮成杀。',
    icon: '🐴',
    chant: '马挂士角将离位，车炮齐鸣成杀势。',
  },
  diaoyu: {
    name: '钓鱼马',
    description: '马跳到黑方三七路宫顶线，像鱼钩一样钩住黑将的两个落脚点，用车成杀。',
    icon: '🎣',
    chant: '马钩宫角将难逃，车沉底路定输赢。',
  },
  qiju: {
    name: '弃车杀',
    description: '主动弃掉威力最大的车，引开或引住黑方防守子力，为其他子力创造杀机。',
    icon: '♟️',
    chant: '弃车引离为大局，小兵老帅建功勋。',
  },
};

/** 创建空棋盘 */
function emptyBoard(): XiangqiBoard {
  return Array.from({ length: 10 }, () => Array(9).fill(''));
}

/**
 * 布置棋子：[棋子, row, col][]
 */
function setup(pieces: [string, number, number][]): XiangqiBoard {
  const b = emptyBoard();
  for (const [p, r, c] of pieces) b[r][c] = p;
  return b;
}

/**
 * 题库（15 题，全部经 scripts/xiangqi_puzzle_builder.ts 引擎审计：
 * 红方未被将军 + 唯一一步杀）
 */
export const XIANGQI_PUZZLES: XiangqiPuzzle[] = [
  // ================= 难度 1（杀形明显）=================
  {
    id: 'xq-001',
    type: 'duimian',
    typeName: '白脸将（对面笑）',
    title: '车锁肋道',
    description: '黑将被逼到肋道，红帅镇住中路。红车一步将军，黑将不能回中（否则将帅对面），即成杀。',
    board: setup([
      ['K', 9, 4],
      ['R', 8, 2],
      ['k', 2, 3],
      ['a', 0, 4],
    ]),
    answer: { from: [8, 2], to: [8, 3] },
    hint: '把车平到黑将所在的肋道将军，黑将敢躲回中路吗？（将帅不能直接对面）',
    difficulty: 1,
  },
  {
    id: 'xq-002',
    type: 'mangong',
    typeName: '闷宫',
    title: '炮打闷宫',
    description: '黑方士象把老将围在九宫。红炮沉底线，借黑士当炮架将军，黑将无处可逃。',
    board: setup([
      ['K', 9, 4],
      ['C', 2, 2],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 1, 4],
    ]),
    answer: { from: [2, 2], to: [0, 2] },
    hint: '红炮下底（走到黑方底线），借哪一个黑子当炮架？',
    difficulty: 1,
  },
  {
    id: 'xq-003',
    type: 'zhongpao',
    typeName: '重炮',
    title: '双炮叠将',
    description: '两门红炮一前一后，前炮当架、后炮发威。把后炮平到中路，重炮成杀。',
    board: setup([
      ['K', 9, 4],
      ['C', 8, 4],
      ['C', 7, 2],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
    ]),
    answer: { from: [7, 2], to: [7, 4] },
    hint: '把右边的炮平到中路，叠在前炮后面——前炮当架、后炮将军。',
    difficulty: 1,
  },
  {
    id: 'xq-004',
    type: 'mahoupao',
    typeName: '马后炮',
    title: '经典马后炮',
    description: '红马已经控制黑将，红炮走到马的身后同线将军，这就是著名的马后炮杀。',
    board: setup([
      ['K', 9, 4],
      ['N', 2, 4],
      ['C', 4, 2],
      ['k', 0, 4],
      ['a', 1, 3],
      ['a', 1, 5],
    ]),
    answer: { from: [4, 2], to: [4, 4] },
    hint: '把炮平到中路、马的身后，让马当炮架——马后炮！',
    difficulty: 1,
  },
  {
    id: 'xq-005',
    type: 'mangong',
    typeName: '闷宫',
    title: '双马锁宫',
    description: '双马像门神一样锁住黑将两侧，红炮从边路沉底借士打将，黑将插翅难逃。',
    board: setup([
      ['K', 9, 4],
      ['C', 6, 8],
      ['N', 3, 2],
      ['N', 3, 6],
      ['k', 0, 4],
      ['a', 0, 5],
      ['a', 1, 4],
    ]),
    answer: { from: [6, 8], to: [0, 8] },
    hint: '炮沿边线沉到底线，借黑士打将；两匹马已经封住黑将的退路。',
    difficulty: 1,
  },

  // ================= 难度 2（杀形稍隐蔽 / 子力多）=================
  {
    id: 'xq-006',
    type: 'mahoupao',
    typeName: '马后炮',
    title: '横线马后炮',
    description: '黑将在边线肋道，红马卡在底线当炮架，红炮横线沉底打将，黑将左躲右闪都被封死。',
    board: setup([
      ['K', 9, 4],
      ['R', 9, 0],
      ['N', 0, 5],
      ['C', 3, 7],
      ['k', 0, 3],
      ['a', 1, 4],
      ['b', 2, 0],
      ['p', 6, 4],
    ]),
    answer: { from: [3, 7], to: [0, 7] },
    hint: '炮沿横线沉到底线，隔着自己的马打将——马后炮！',
    difficulty: 2,
  },
  {
    id: 'xq-007',
    type: 'shuangju',
    typeName: '双车错',
    title: '双车交替',
    description: '红方双车分据两翼，先用一个车沉底将军，另一车封死另一翼，黑将顾此失彼。',
    board: setup([
      ['K', 9, 4],
      ['C', 5, 4],
      ['R', 1, 5],
      ['R', 3, 2],
      ['k', 0, 4],
      ['a', 1, 3],
      ['a', 0, 5],
    ]),
    answer: { from: [3, 2], to: [0, 2] },
    hint: '把车沉到左肋道将军；另一辆车早已守住右肋道。',
    difficulty: 2,
  },
  {
    id: 'xq-008',
    type: 'guajiao',
    typeName: '挂角马',
    title: '马挂士角',
    description: '红马跳挂黑方士角（九宫角）将军，车炮提前封住黑将逃路，一锤定音。',
    board: setup([
      ['K', 9, 4],
      ['R', 4, 3],
      ['N', 1, 5],
      ['N', 2, 4],
      ['C', 7, 5],
      ['P', 5, 5],
      ['k', 0, 4],
      ['a', 0, 5],
      ['a', 1, 4],
    ]),
    answer: { from: [2, 4], to: [1, 2] },
    hint: '马跳到黑方士角将军，看看车和炮分别守住了哪些格子？',
    difficulty: 2,
  },
  {
    id: 'xq-009',
    type: 'diaoyu',
    typeName: '钓鱼马',
    title: '钓鱼马配车',
    description: '双马像鱼钩钩住黑将的两个落脚点，红车沉底将门成杀，炮在后方牢牢看住车。',
    board: setup([
      ['K', 9, 4],
      ['R', 3, 5],
      ['N', 3, 2],
      ['N', 3, 6],
      ['C', 7, 5],
      ['P', 5, 5],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 1, 4],
    ]),
    answer: { from: [3, 5], to: [0, 5] },
    hint: '车沉底将门将军！两匹马像鱼钩钩住了黑将的退路，炮保护着车。',
    difficulty: 2,
  },
  {
    id: 'xq-010',
    type: 'zhongpao',
    typeName: '重炮',
    title: '重炮破防',
    description: '黑方多一匹马防守也无济于事——重炮叠将，一条线上双炮齐发，黑方无法垫子。',
    board: setup([
      ['K', 9, 4],
      ['C', 8, 4],
      ['C', 7, 2],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
      ['n', 2, 3],
    ]),
    answer: { from: [7, 2], to: [7, 4] },
    hint: '后炮平中路叠将！黑方的马能挡住吗？',
    difficulty: 2,
  },

  // ================= 难度 3（子力多 / 杀形深）=================
  {
    id: 'xq-011',
    type: 'shuangju',
    typeName: '双车错',
    title: '双车错杀满盘',
    description: '黑方车马象全在阵中，红方双车依然完成双车错——先沉底将军，另一车锁死退路。',
    board: setup([
      ['K', 9, 4],
      ['C', 5, 4],
      ['R', 1, 5],
      ['R', 4, 2],
      ['N', 1, 1],
      ['N', 3, 6],
      ['k', 0, 4],
      ['a', 1, 3],
      ['a', 0, 5],
      ['n', 2, 3],
      ['b', 0, 2],
    ]),
    answer: { from: [4, 2], to: [0, 2] },
    hint: '车沉底将军，另一车守住黑将右路——黑方车马象再多也无解。',
    difficulty: 3,
  },
  {
    id: 'xq-012',
    type: 'wocao',
    typeName: '卧槽马',
    title: '卧槽马跃将',
    description: '红马一步跳入卧槽位将军！兵镇中路防黑将升起，另两子封死全部退路。',
    board: setup([
      ['K', 9, 4],
      ['N', 1, 3],
      ['N', 3, 5],
      ['N', 3, 6],
      ['R', 9, 5],
      ['P', 2, 4],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 1, 3],
    ]),
    answer: { from: [3, 5], to: [1, 6] },
    hint: '马跳到黑方下二路象位（卧槽位）将军！兵和车守住了什么？',
    difficulty: 3,
  },
  {
    id: 'xq-013',
    type: 'dadao',
    typeName: '大刀剜心',
    title: '车剜中心士',
    description: '红车大胆吃掉黑方中心士，直插九宫花心！帅在底线接应，黑将无路可逃。',
    board: setup([
      ['K', 9, 4],
      ['R', 1, 2],
      ['N', 3, 2],
      ['N', 3, 6],
      ['C', 8, 5],
      ['P', 5, 5],
      ['k', 0, 4],
      ['a', 1, 4],
      ['n', 0, 3],
    ]),
    answer: { from: [1, 2], to: [1, 4] },
    hint: '大胆用车吃掉中心士（剜心）！黑将敢吃车吗？帅在底线等着呢。',
    difficulty: 3,
  },
  {
    id: 'xq-014',
    type: 'dadao',
    typeName: '大刀剜心',
    title: '双车穿心',
    description: '双车双马形成合围，红车沉底穿心将军，黑将上下左右全被控制，无解。',
    board: setup([
      ['K', 9, 4],
      ['R', 1, 2],
      ['R', 9, 3],
      ['N', 3, 2],
      ['N', 3, 6],
      ['k', 0, 4],
      ['a', 1, 4],
      ['a', 0, 5],
      ['b', 2, 2],
    ]),
    answer: { from: [1, 2], to: [0, 2] },
    hint: '车沉底将军！黑将的五个落脚点分别被谁控制住了？',
    difficulty: 3,
  },
  {
    id: 'xq-015',
    type: 'mahoupao',
    typeName: '马后炮',
    title: '三马环伺马后炮',
    description: '红方三马环伺黑将，炮平中路借马成杀——马后炮的最高境界，黑方毫无还手之力。',
    board: setup([
      ['K', 9, 4],
      ['N', 2, 4],
      ['N', 3, 2],
      ['N', 3, 6],
      ['C', 4, 2],
      ['k', 0, 4],
      ['a', 1, 3],
      ['a', 1, 5],
    ]),
    answer: { from: [4, 2], to: [4, 4] },
    hint: '炮平中路、借马当架——马后炮！三匹马早已锁死黑将。',
    difficulty: 3,
  },
  // ================= 扩容二（2026-09-16，总 24 题）=================
  {
    id: 'xq-016',
    type: 'zhongpao',
    typeName: '重炮',
    title: '炮炮叠阵',
    description: '前炮已经镇住中路，把后炮平到前炮身后叠起来——重炮成杀，黑方无子可垫。',
    board: setup([
      ['K', 9, 4],
      ['C', 7, 4],
      ['C', 6, 2],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
    ]),
    answer: { from: [6, 2], to: [6, 4] },
    hint: '把后炮平到中路、叠在前炮后面，前炮当架、后炮发威。',
    difficulty: 1,
  },
  {
    id: 'xq-017',
    type: 'mangong',
    typeName: '闷宫',
    title: '右路闷杀',
    description: '红炮沿右路沉底，借黑方士当炮架闷宫将军，黑将被自己的士困死九宫。',
    board: setup([
      ['K', 9, 4],
      ['C', 2, 6],
      ['k', 0, 4],
      ['a', 0, 5],
      ['a', 1, 4],
    ]),
    answer: { from: [2, 6], to: [0, 6] },
    hint: '炮沿右路沉到底线，借哪个黑子当炮架？',
    difficulty: 1,
  },
  {
    id: 'xq-018',
    type: 'duimian',
    typeName: '白脸将（对面笑）',
    title: '右肋锁将',
    description: '黑将在右肋，红帅镇住中路。红车平到肋道将军，黑将躲回中路就被帅照将。',
    board: setup([
      ['K', 9, 4],
      ['R', 8, 6],
      ['k', 2, 5],
      ['a', 0, 4],
    ]),
    answer: { from: [8, 6], to: [8, 5] },
    hint: '把车平到黑将的肋道将军——黑将敢躲回中路吗？',
    difficulty: 1,
  },
  {
    id: 'xq-019',
    type: 'mahoupao',
    typeName: '马后炮',
    title: '右炮横击',
    description: '红马卡在宫心线当炮架，红炮从右路平到马后，马后炮一击致命。',
    board: setup([
      ['K', 9, 4],
      ['N', 2, 4],
      ['C', 4, 6],
      ['k', 0, 4],
      ['a', 1, 3],
      ['a', 1, 5],
    ]),
    answer: { from: [4, 6], to: [4, 4] },
    hint: '把右路的炮平到中路、马的身后——马后炮！',
    difficulty: 2,
  },
  {
    id: 'xq-020',
    type: 'shuangju',
    typeName: '双车错',
    title: '左翼沉底',
    description: '双车分据两翼，左车沉底将军，右车守住横线，黑将左右为难。',
    board: setup([
      ['K', 9, 4],
      ['R', 1, 3],
      ['R', 3, 6],
      ['C', 5, 4],
      ['k', 0, 4],
      ['a', 1, 5],
    ]),
    answer: { from: [3, 6], to: [0, 6] },
    hint: '把左翼的车沉到底线将军，另一辆车守住横线。',
    difficulty: 2,
  },
  {
    id: 'xq-021',
    type: 'diaoyu',
    typeName: '钓鱼马',
    title: '炮保车沉底',
    description: '马钩住黑将两个落脚点，红车沉底将军；炮隔兵保护着车，黑将吃车无门。',
    board: setup([
      ['K', 9, 4],
      ['R', 4, 5],
      ['N', 3, 6],
      ['N', 2, 2],
      ['C', 7, 5],
      ['P', 5, 5],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 1, 4],
    ]),
    answer: { from: [4, 5], to: [0, 5] },
    hint: '车沉底将军！炮隔着兵保护车，黑将敢吃吗？',
    difficulty: 2,
  },
  {
    id: 'xq-022',
    type: 'dadao',
    typeName: '大刀剜心',
    title: '双车穿心二',
    description: '红车大胆沉底穿心，帅在底线接应，黑将进退无路——剜心杀再显神威。',
    board: setup([
      ['K', 9, 4],
      ['R', 1, 2],
      ['N', 3, 2],
      ['N', 3, 6],
      ['C', 8, 5],
      ['P', 5, 5],
      ['k', 0, 4],
      ['a', 1, 4],
      ['n', 0, 5],
    ]),
    answer: { from: [1, 2], to: [0, 2] },
    hint: '车沉底穿心将军！黑将的退路被谁封住了？',
    difficulty: 3,
  },
  {
    id: 'xq-023',
    type: 'guajiao',
    typeName: '挂角马',
    title: '双马护角',
    description: '红马跳挂士角将军，另一马与车炮提前封住黑将全部退路——挂角马最高形态。',
    board: setup([
      ['K', 9, 4],
      ['R', 4, 3],
      ['N', 1, 5],
      ['N', 2, 4],
      ['C', 7, 5],
      ['P', 5, 5],
      ['N', 3, 6],
      ['k', 0, 4],
      ['a', 0, 5],
      ['a', 1, 4],
      ['b', 2, 2],
      ['p', 1, 1],
    ]),
    answer: { from: [2, 4], to: [1, 2] },
    hint: '马跳士角将军！车、炮、兵分别守住了哪些格？',
    difficulty: 3,
  },
  {
    id: 'xq-024',
    type: 'qiju',
    typeName: '弃车杀',
    title: '车吃底士',
    description: '红车大胆吃士弃子将军，炮隔兵暗中保车，黑将吃车反被将——弃车杀的精妙。',
    board: setup([
      ['K', 9, 4],
      ['R', 4, 5],
      ['C', 7, 5],
      ['P', 5, 5],
      ['N', 2, 6],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
      ['a', 1, 4],
    ]),
    answer: { from: [4, 5], to: [0, 5] },
    hint: '车吃底士将军！黑将敢吃车吗？炮隔着兵等着呢。',
    difficulty: 3,
  },
];

/** 按难度取题 */
export function getXiangqiPuzzlesByDifficulty(difficulty: 1 | 2 | 3): XiangqiPuzzle[] {
  return XIANGQI_PUZZLES.filter((p) => p.difficulty === difficulty);
}
