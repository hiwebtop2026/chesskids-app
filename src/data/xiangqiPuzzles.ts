/**
 * ChessKids - 中国象棋战术谜题数据
 * 全部为「红先胜」的一步杀（经典杀法），按难度分三档
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

export const XIANGQI_TACTIC_TYPES: Record<XiangqiTacticType, { name: string; description: string; icon: string }> = {
  duimian: {
    name: '白脸将（对面笑）',
    description: '利用「将帅不能直接对面」的规则，用车或炮将军，使黑将无法躲回中路，形成杀棋。',
    icon: '🚗',
  },
  mangong: {
    name: '闷宫',
    description: '炮借黑方自己的士（或象）当炮架将军，黑将被自己的士象堵在九宫无路可逃。',
    icon: '💥',
  },
  mahoupao: {
    name: '马后炮',
    description: '马先控制黑将的所有逃路，炮紧贴马后沿同一条线将军，黑将无处可躲。',
    icon: '🐴',
  },
  wocao: {
    name: '卧槽马',
    description: '马跳到黑方下二路象位（卧槽位）将军，逼黑将升起，再用车或炮成杀。',
    icon: '🐎',
  },
  zhongpao: {
    name: '重炮',
    description: '双炮叠在同一条线上，前炮当炮架、后炮将军，黑方无子可垫、无法化解。',
    icon: '🎯',
  },
  shuangju: {
    name: '双车错',
    description: '双车分占两条要道，交替将军，黑将顾此失彼、无法同时防守。',
    icon: '🚙',
  },
  tiemenshuan: {
    name: '铁门栓',
    description: '中炮镇住中路拴链黑方士象，车直插将门肋道或下底，黑将无路可走。',
    icon: '🔒',
  },
  dadao: {
    name: '大刀剜心',
    description: '车（或兵）大胆吃掉黑方中心士，直插九宫花心，摧毁防线成杀。',
    icon: '🗡️',
  },
  guajiao: {
    name: '挂角马',
    description: '马跳到黑方士角（九宫角）将军，逼黑将离位，再配合车炮成杀。',
    icon: '🐴',
  },
  diaoyu: {
    name: '钓鱼马',
    description: '马跳到黑方三七路宫顶线，像鱼钩一样钩住黑将的两个落脚点，用车成杀。',
    icon: '🎣',
  },
  qiju: {
    name: '弃车杀',
    description: '主动弃掉威力最大的车，引开或引住黑方防守子力，为其他子力创造杀机。',
    icon: '♟️',
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

export const XIANGQI_PUZZLES: XiangqiPuzzle[] = [
  // ================= 难度 1（一步杀，杀形明显）=================
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
    hint: '把车平到黑将所在的肋道（六路）将军，黑将能躲回中路吗？',
    difficulty: 1,
  },
  {
    id: 'xq-002',
    type: 'mangong',
    typeName: '闷宫',
    title: '炮打闷宫',
    description: '黑方双士在底线挤住老将。红炮沉到底线，借黑士当炮架将军，黑将无处可逃。',
    board: setup([
      ['K', 9, 4],
      ['C', 2, 2],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
    ]),
    answer: { from: [2, 2], to: [0, 2] },
    hint: '红炮下底（走到黑方底线），以哪个黑子当炮架？',
    difficulty: 1,
  },
  {
    id: 'xq-003',
    type: 'mahoupao',
    typeName: '马后炮',
    title: '经典马后炮',
    description: '红马已经控制黑将，红炮走到马的身后同线将军，就是著名的马后炮杀。',
    board: setup([
      ['K', 9, 4],
      ['N', 1, 4],
      ['C', 3, 4],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
    ]),
    answer: { from: [3, 4], to: [2, 4] },
    hint: '红马在黑将正前方一格控制老将，把炮沿中路推到马的身后。',
    difficulty: 1,
  },
  {
    id: 'xq-004',
    type: 'wocao',
    typeName: '卧槽马',
    title: '卧槽马配车',
    description: '红马跳卧槽将军逼黑将升起，红车早已在肋道等候，老将一升头即被车杀。',
    board: setup([
      ['K', 9, 4],
      ['R', 9, 3],
      ['N', 2, 4],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
    ]),
    answer: { from: [2, 4], to: [1, 3] },
    hint: '马跳到黑方下二路士角（卧槽位）将军，黑将只能升起，车在六路等着呢。',
    difficulty: 1,
  },
  {
    id: 'xq-005',
    type: 'zhongpao',
    typeName: '重炮',
    title: '双炮叠将',
    description: '两门红炮在同一条线上，前炮当架、后炮将军，黑方无子可垫，重炮成杀。',
    board: setup([
      ['K', 9, 4],
      ['C', 8, 4],
      ['C', 7, 4],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
      ['r', 0, 0],
    ]),
    answer: { from: [7, 4], to: [1, 4] },
    hint: '把后炮沿中路一直推到前炮身后（黑将面前两格），双炮叠将。',
    difficulty: 1,
  },

  // ================= 难度 2（杀形稍隐蔽 / 子力多）=================
  {
    id: 'xq-006',
    type: 'shuangju',
    typeName: '双车错',
    title: '双车交替',
    description: '红方双车分据两翼，黑将在肋道。先用一个车将军，逼老将移位，再由另一车成杀。',
    board: setup([
      ['K', 9, 4],
      ['R', 0, 2],
      ['R', 9, 5],
      ['k', 2, 3],
      ['a', 1, 4],
    ]),
    answer: { from: [9, 5], to: [2, 5] },
    hint: '四路（黑将右侧）的红车可以直接下到黑将同一横线将军，老将能往哪躲？另一车在看着。',
    difficulty: 2,
  },
  {
    id: 'xq-007',
    type: 'tiemenshuan',
    typeName: '铁门栓',
    title: '中炮铁门栓',
    description: '红炮镇住中路拴住黑士，红车直下将门肋道，黑士不能动、老将不能躲，铁门栓杀。',
    board: setup([
      ['K', 9, 4],
      ['C', 7, 4],
      ['R', 9, 3],
      ['k', 0, 4],
      ['a', 1, 3],
      ['a', 1, 5],
    ]),
    answer: { from: [9, 3], to: [0, 3] },
    hint: '中炮锁住黑士不能回防，把六路红车一路下到黑方底线将军。',
    difficulty: 2,
  },
  {
    id: 'xq-008',
    type: 'guajiao',
    typeName: '挂角马',
    title: '马挂士角',
    description: '红马跳黑方士角将军，黑将被逼出宫，红车迎面一击成杀。',
    board: setup([
      ['K', 9, 4],
      ['R', 9, 5],
      ['N', 2, 4],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 1, 5],
    ]),
    answer: { from: [2, 4], to: [1, 5] },
    hint: '马跳到黑方右上角士角（四路士角）将军，黑将只能往左侧挪，红车在四路。',
    difficulty: 2,
  },
  {
    id: 'xq-009',
    type: 'diaoyu',
    typeName: '钓鱼马',
    title: '钓鱼马配车',
    description: '红马占三七路宫顶线，钩住黑将两个落脚点，红车迎面将军，老将无处脱身。',
    board: setup([
      ['K', 9, 4],
      ['R', 8, 5],
      ['N', 2, 3],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
    ]),
    answer: { from: [8, 5], to: [0, 5] },
    hint: '红马已钩住黑将，四路红车下底将军，黑将能升起或左移吗？都被马控制了。',
    difficulty: 2,
  },
  {
    id: 'xq-010',
    type: 'mahoupao',
    typeName: '马后炮',
    title: '横线马后炮',
    description: '子力较多的残局中，红马在横线控制黑将，红炮平到马后将军，需在纷乱中找出杀点。',
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
    hint: '红马在黑方底线四路控制老将，把炮沿同一条横线（黑方底线）拉到马的身后将军。',
    difficulty: 2,
  },

  // ================= 难度 3（弃子 / 唯一解 / 杀点隐蔽）=================
  {
    id: 'xq-011',
    type: 'dadao',
    typeName: '大刀剜心',
    title: '车砍中士',
    description: '黑方士象全、看似稳固。红车大胆吃掉九宫中心的士，剜心一击，黑将暴露被杀。',
    board: setup([
      ['K', 9, 4],
      ['R', 2, 4],
      ['C', 8, 4],
      ['k', 0, 4],
      ['a', 1, 3],
      ['a', 1, 5],
      ['b', 2, 2],
      ['b', 2, 6],
    ]),
    answer: { from: [2, 4], to: [1, 4] },
    hint: '黑方九宫中心（花心）有一个士，红车敢不敢直接吃掉它？后面还有中炮。',
    difficulty: 3,
  },
  {
    id: 'xq-012',
    type: 'qiju',
    typeName: '弃车杀',
    title: '弃车引王',
    description: '黑将贴身有车防守。红方主动弃车将军，引黑车离开将门，随后马后炮成杀。',
    board: setup([
      ['K', 9, 4],
      ['R', 3, 3],
      ['N', 1, 4],
      ['C', 5, 4],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 0, 5],
      ['r', 2, 4],
    ]),
    answer: { from: [3, 3], to: [0, 3] },
    hint: '六路红车下底将军，黑方唯一能应的是用车吃车；吃完后红方中炮推到马后是什么杀？',
    difficulty: 3,
  },
  {
    id: 'xq-013',
    type: 'shuangju',
    typeName: '双车错',
    title: '底车交错',
    description: '黑方士象不全，红双车在低位。需选择正确的车和线路，一步交错成杀。',
    board: setup([
      ['K', 9, 4],
      ['R', 1, 5],
      ['R', 3, 2],
      ['k', 0, 4],
      ['a', 1, 3],
      ['b', 2, 6],
    ]),
    answer: { from: [3, 2], to: [0, 2] },
    hint: '黑将在底线中路，右侧四路被红车封住。另一路红车下到黑方底线将军，老将能往右躲吗？',
    difficulty: 3,
  },
  {
    id: 'xq-014',
    type: 'wocao',
    typeName: '卧槽马',
    title: '卧槽马炮联杀',
    description: '红马卧槽将军，黑方看似可垫将、可移将，但红炮在肋道封死所有退路，一步成杀。',
    board: setup([
      ['K', 9, 4],
      ['N', 2, 4],
      ['C', 9, 3],
      ['k', 0, 4],
      ['a', 0, 3],
      ['a', 1, 5],
      ['r', 0, 0],
    ]),
    answer: { from: [2, 4], to: [1, 3] },
    hint: '马跳六路卧槽将军，黑将升起后，六路炮（同列）是不是正好将军？',
    difficulty: 3,
  },
  {
    id: 'xq-015',
    type: 'mangong',
    typeName: '闷宫',
    title: '象位闷宫',
    description: '黑士象回防看似安全，红炮借黑象当炮架在底线将军，黑将被自己的子力闷杀。',
    board: setup([
      ['K', 9, 4],
      ['C', 3, 0],
      ['k', 0, 4],
      ['a', 1, 3],
      ['a', 1, 5],
      ['b', 0, 2],
    ]),
    answer: { from: [3, 0], to: [0, 0] },
    hint: '黑方底线有一只象在边路，红炮沉到底线，以这只象为炮架横线将军。',
    difficulty: 3,
  },
];

/** 按难度获取谜题 */
export function getXiangqiPuzzlesByDifficulty(difficulty: 1 | 2 | 3): XiangqiPuzzle[] {
  return XIANGQI_PUZZLES.filter((p) => p.difficulty === difficulty);
}

/** 按 id 获取谜题 */
export function getXiangqiPuzzleById(id: string): XiangqiPuzzle | undefined {
  return XIANGQI_PUZZLES.find((p) => p.id === id);
}
