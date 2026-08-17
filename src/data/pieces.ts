/**
 * ChessKids - 棋子信息数据
 * 对应PRD功能模块一：棋子认知与走法学习
 */

import { PieceType, PieceColor, Board, PIECE_SYMBOLS, PIECE_VALUES } from '../types/chess';

/** 棋子中文名称 */
export const PIECE_NAMES: Record<string, string> = {
  K: '国王', Q: '皇后', R: '车', B: '象', N: '马', P: '兵',
  k: '国王', q: '皇后', r: '车', b: '象', n: '马', p: '兵',
};

/** 棋子英文名称 */
export const PIECE_NAMES_EN: Record<string, string> = {
  K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn',
  k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn',
};

/** 单个棋子详细信息 */
export interface PieceInfo {
  type: PieceType;
  name: string;
  nameEn: string;
  symbol: string;
  value: number;
  color: PieceColor;
  description: string;
  moveDescription: string;
  moveRules: string[];
  tips: string[];
  /** 演示棋盘（高亮该棋子可走的位置） */
  demoBoard: Board;
  /** 可走位置高亮坐标 */
  highlightSquares: [number, number][];
  /** 棋子起始位置 */
  startPosition: [number, number];
}

/** 空棋盘 */
const EMPTY: Board = Array.from({ length: 8 }, () => Array(8).fill(''));

/** 棋子教学数据 */
export const PIECES_DATA: PieceInfo[] = [
  {
    type: 'P',
    name: '兵',
    nameEn: 'Pawn',
    symbol: PIECE_SYMBOLS.P,
    value: PIECE_VALUES.p,
    color: 'w',
    description: '兵是棋盘上数量最多的棋子，每方有8个兵。虽然兵看起来不起眼，但它们是棋局的基石。',
    moveDescription: '兵只能向前走，不能后退。每次走一格，第一次走时可以走两格。兵吃子时是斜向吃。',
    moveRules: [
      '向前走一格（不能后退）',
      '初始位置可以选择走一格或两格',
      '吃子时只能斜向前方吃',
      '不能横走或后退',
      '走到对方底线可以升变为其他棋子（后、车、象、马）',
    ],
    tips: [
      '兵链（相邻兵互相保护）是最坚固的兵型结构',
      '不要轻易让兵成为"孤兵"（没有同伴保护的兵）',
      '升变后通常选择变成皇后，因为皇后威力最大',
    ],
    demoBoard: (() => {
      const b = EMPTY.map(r => [...r]);
      b[6][3] = 'P';
      return b;
    })(),
    highlightSquares: [[5, 3], [4, 3]],
    startPosition: [6, 3],
  },
  {
    type: 'N',
    name: '马',
    nameEn: 'Knight',
    symbol: PIECE_SYMBOLS.N,
    value: PIECE_VALUES.n,
    color: 'w',
    description: '马是棋盘上唯一可以跳过其他棋子的棋子。它的走法独特，像一个字母"L"。',
    moveDescription: '马走"日"字：先走两格直线，再走一格垂直方向。马可以跳过其他棋子。',
    moveRules: [
      '走"日"字：两格直线+一格垂直',
      '可以跳过任何棋子（唯一有此能力的棋子）',
      '每次走法有最多8个可能的方向',
      '在棋盘中心时威力最大，角落时威力最小',
    ],
    tips: [
      '马在棋盘中央比在角落更有威力',
      '马在封闭局面（兵型密集）中比象更有优势',
      '双马配合可以制造很多战术机会',
    ],
    demoBoard: (() => {
      const b = EMPTY.map(r => [...r]);
      b[4][4] = 'N';
      return b;
    })(),
    highlightSquares: [[2, 3], [2, 5], [3, 2], [3, 6], [5, 2], [5, 6], [6, 3], [6, 5]],
    startPosition: [4, 4],
  },
  {
    type: 'B',
    name: '象',
    nameEn: 'Bishop',
    symbol: PIECE_SYMBOLS.B,
    value: PIECE_VALUES.b,
    color: 'w',
    description: '象沿着斜线行走，每方有两个象：一个走浅色格，一个走深色格。',
    moveDescription: '象沿对角线移动，可以走任意格数，但不能跳过其他棋子。',
    moveRules: [
      '沿对角线移动，距离不限',
      '不能跳过其他棋子',
      '每方的两个象分别只能在浅色格和深色格移动',
      '象和马的价值相同（均为3分）',
    ],
    tips: [
      '双象配合通常比双马或一象一马更有优势',
      '象在开放局面（兵少）中威力更大',
      '注意保护你的象，不要被对方的兵逼住',
    ],
    demoBoard: (() => {
      const b = EMPTY.map(r => [...r]);
      b[4][4] = 'B';
      return b;
    })(),
    highlightSquares: [[0, 0], [1, 1], [2, 2], [3, 3], [5, 5], [6, 6], [7, 7], [1, 7], [2, 6], [3, 5], [5, 3], [6, 2], [7, 1]],
    startPosition: [4, 4],
  },
  {
    type: 'R',
    name: '车',
    nameEn: 'Rook',
    symbol: PIECE_SYMBOLS.R,
    value: PIECE_VALUES.r,
    color: 'w',
    description: '车是强力的棋子，沿横线和竖线移动。在棋局后期，车的威力尤为突出。',
    moveDescription: '车沿横线或竖线移动，可以走任意格数，但不能跳过其他棋子。',
    moveRules: [
      '沿水平线或垂直线移动，距离不限',
      '不能跳过其他棋子',
      '车价值5分，比象和马强',
      '在开放线上（无兵阻挡的线）威力最大',
    ],
    tips: [
      '车在第七横线（对方第二横线）上非常强大',
      '把车放在开放线或半开放线上',
      '残局中双车配合可以形成强大的攻击力',
    ],
    demoBoard: (() => {
      const b = EMPTY.map(r => [...r]);
      b[4][4] = 'R';
      return b;
    })(),
    highlightSquares: [[0, 4], [1, 4], [2, 4], [3, 4], [5, 4], [6, 4], [7, 4], [4, 0], [4, 1], [4, 2], [4, 3], [4, 5], [4, 6], [4, 7]],
    startPosition: [4, 4],
  },
  {
    type: 'Q',
    name: '皇后',
    nameEn: 'Queen',
    symbol: PIECE_SYMBOLS.Q,
    value: PIECE_VALUES.q,
    color: 'w',
    description: '皇后是棋盘上最强大的棋子，集车和象的能力于一身。',
    moveDescription: '皇后可以沿横线、竖线或对角线移动，走任意格数，但不能跳过其他棋子。',
    moveRules: [
      '可沿横线、竖线、对角线移动',
      '距离不限，但不能跳过其他棋子',
      '价值9分，是棋盘上最有价值的棋子（除国王外）',
      '攻防兼备，是棋局中最重要的进攻棋子',
    ],
    tips: [
      '不要过早把皇后投入战场，以免被对方驱赶浪费时间',
      '皇后在中心位置时控制力最强',
      '保护好你的皇后，它是你最宝贵的进攻武器',
    ],
    demoBoard: (() => {
      const b = EMPTY.map(r => [...r]);
      b[4][4] = 'Q';
      return b;
    })(),
    highlightSquares: [
      [0, 4], [1, 4], [2, 4], [3, 4], [5, 4], [6, 4], [7, 4],
      [4, 0], [4, 1], [4, 2], [4, 3], [4, 5], [4, 6], [4, 7],
      [0, 0], [1, 1], [2, 2], [3, 3], [5, 5], [6, 6], [7, 7],
      [1, 7], [2, 6], [3, 5], [5, 3], [6, 2], [7, 1],
    ],
    startPosition: [4, 4],
  },
  {
    type: 'K',
    name: '国王',
    nameEn: 'King',
    symbol: PIECE_SYMBOLS.K,
    value: PIECE_VALUES.k,
    color: 'w',
    description: '国王是最重要的棋子。国王被将死，棋局就结束了。虽然国王不像皇后那样强大，但在残局中国王也是重要的战斗力量。',
    moveDescription: '国王每次只能走一格，可以走向任何方向（横、竖、斜）。',
    moveRules: [
      '每次只能走一格',
      '可走向任何方向（横、竖、斜）',
      '国王不能走到被对方攻击的格子',
      '国王不能走到与对方国王相邻的格子',
      '王车易位：国王和车可以同时移动的特殊走法',
    ],
    tips: [
      '开局和中局阶段，国王应躲在兵阵后面保护',
      '残局阶段，国王可以积极参与进攻',
      '王车易位是保护国王的重要手段，应尽早完成',
    ],
    demoBoard: (() => {
      const b = EMPTY.map(r => [...r]);
      b[4][4] = 'K';
      return b;
    })(),
    highlightSquares: [[3, 3], [3, 4], [3, 5], [4, 3], [4, 5], [5, 3], [5, 4], [5, 5]],
    startPosition: [4, 4],
  },
];

/** 根据棋子类型获取信息 */
export function getPieceInfo(type: PieceType): PieceInfo | undefined {
  return PIECES_DATA.find(p => p.type === type);
}

/** 根据棋子字符串获取名称 */
export function getPieceName(piece: string): string {
  return PIECE_NAMES[piece] || '';
}
