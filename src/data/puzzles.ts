/**
 * ChessKids - 战术谜题数据
 * 对应PRD功能模块三：实战技巧训练
 *
 * 坐标系：board[row][col]，row 0 = 段 8（黑方底线），row 7 = 段 1（白方底线）
 * col 0 = a 列（左），col 7 = h 列（右）
 * 大写 = 白方棋子，小写 = 黑方棋子
 */

import type { Puzzle } from '../types';

/** 创建空棋盘辅助 */
function emptyBoard(): string[][] {
  return Array.from({ length: 8 }, () => Array(8).fill(''));
}

/** 战术谜题库 */
export const PUZZLES: Puzzle[] = [
  // ===== 难度1 =====
  {
    id: 'puzzle-001',
    type: 'fork',
    typeName: '抽将（叉子）',
    title: '马的抽将',
    description: '用马同时攻击国王和皇后，下一步可以吃掉皇后！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][2] = 'q';  // 黑后 c8
      b[0][4] = 'k';  // 黑王 e8
      b[3][5] = 'N';  // 白马 f5
      b[7][4] = 'K';  // 白王 e1
      return b;
    })(),
    answer: { from: [3, 5], to: [2, 3] },  // f5 → d6
    hint: '马走到d6，看看它同时攻击了哪两个棋子？',
    difficulty: 1,
    stars: 0,
    solved: false,
  },
  {
    id: 'puzzle-002',
    type: 'pin',
    typeName: '牵制',
    title: '车的牵制',
    description: '用车牵制对方的后，让对方的后无法移动！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][3] = 'k';  // 黑王 d8
      b[3][3] = 'q';  // 黑后 d4
      b[7][0] = 'R';  // 白车 a1
      b[7][4] = 'K';  // 白王 e1
      return b;
    })(),
    answer: { from: [7, 0], to: [7, 3] },  // a1 → d1
    hint: '车走到d1，沿d线攻击后，后后面是国王，后无法移动！',
    difficulty: 1,
    stars: 0,
    solved: false,
  },
  {
    id: 'puzzle-003',
    type: 'skewer',
    typeName: '串击',
    title: '象的串击',
    description: '用象串击国王和皇后，国王移动后可以吃掉皇后！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][0] = 'q';  // 黑后 a8
      b[1][1] = 'k';  // 黑王 b7
      b[5][5] = 'B';  // 白象 f3
      b[7][2] = 'K';  // 白王 c1
      return b;
    })(),
    answer: { from: [5, 5], to: [2, 2] },  // f3 → c6
    hint: '象沿斜线走到c6，先攻击国王（更近），国王逃跑后可以吃掉后面的皇后！',
    difficulty: 1,
    stars: 0,
    solved: false,
  },
  // ===== 难度2 =====
  {
    id: 'puzzle-004',
    type: 'fork',
    typeName: '抽将（叉子）',
    title: '双马配合抽将',
    description: '利用马的配合，同时攻击对方的国王和车！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][0] = 'r';  // 黑车 a8
      b[0][4] = 'k';  // 黑王 e8
      b[3][1] = 'N';  // 白马 b5
      b[3][4] = 'N';  // 白马 e5（配合：限制王的逃跑路线）
      b[7][4] = 'K';  // 白王 e1
      return b;
    })(),
    answer: { from: [3, 1], to: [1, 2] },  // b5 → c7
    hint: 'b5的马跳到c7，同时攻击e8的国王和a8的车！另一匹马在e5封锁国王的逃跑路线。',
    difficulty: 2,
    stars: 0,
    solved: false,
  },
  {
    id: 'puzzle-005',
    type: 'discovered',
    typeName: '发现攻击',
    title: '发现将军',
    description: '移动一个棋子，让后面的棋子攻击对方国王！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][4] = 'k';  // 黑王 e8
      b[3][4] = 'B';  // 白象 e5（挡住车对王的攻击线）
      b[4][4] = 'R';  // 白车 e4
      b[7][4] = 'K';  // 白王 e1
      return b;
    })(),
    answer: { from: [3, 4], to: [2, 3] },  // e5 → d6
    hint: '移动象，让车可以沿e线攻击国王。象应该走到哪里？',
    difficulty: 2,
    stars: 0,
    solved: false,
  },
  {
    id: 'puzzle-006',
    type: 'doublecheck',
    typeName: '双将',
    title: '致命双将',
    description: '制造双将军！对方国王无处可逃！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][4] = 'k';  // 黑王 e8
      b[3][1] = 'B';  // 白象 b5（攻击线被马挡住）
      b[1][3] = 'N';  // 白马 d7（挡住象的攻击线）
      b[7][4] = 'K';  // 白王 e1
      return b;
    })(),
    answer: { from: [1, 3], to: [2, 5] },  // d7 → f6
    hint: '马从d7跳到f6：象沿斜线发现将军（b5→e8），马也同时将军（f6→e8）！双将！',
    difficulty: 2,
    stars: 0,
    solved: false,
  },
  // ===== 难度3 =====
  {
    id: 'puzzle-007',
    type: 'fork',
    typeName: '抽将（叉子）',
    title: '皇后抽将',
    description: '用皇后同时攻击国王和两个车！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][1] = 'r';  // 黑车 b8
      b[0][4] = 'k';  // 黑王 e8
      b[0][7] = 'r';  // 黑车 h8
      b[4][4] = 'Q';  // 白后 e4
      b[7][4] = 'K';  // 白王 e1
      return b;
    })(),
    answer: { from: [4, 4], to: [3, 4] },  // e4 → e5
    hint: '皇后走到e5：沿e线将军(e8)，沿两条斜线同时攻击b8和h8的两个车！',
    difficulty: 3,
    stars: 0,
    solved: false,
  },
  {
    id: 'puzzle-008',
    type: 'skewer',
    typeName: '串击',
    title: '高级串击',
    description: '用车串击国王和皇后，获得子力优势！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][0] = 'q';  // 黑后 a8
      b[3][0] = 'k';  // 黑王 a5
      b[7][7] = 'R';  // 白车 h1
      b[6][7] = 'K';  // 白王 h2
      return b;
    })(),
    answer: { from: [7, 7], to: [7, 0] },  // h1 → a1
    hint: '车沿底线走到a1，沿a线串击：先攻击a5的国王，国王逃跑后吃掉a8的皇后！',
    difficulty: 3,
    stars: 0,
    solved: false,
  },
];

/** 根据难度获取谜题 */
export function getPuzzlesByDifficulty(difficulty: 1 | 2 | 3): Puzzle[] {
  return PUZZLES.filter(p => p.difficulty === difficulty);
}

/** 根据类型获取谜题 */
export function getPuzzlesByType(type: Puzzle['type']): Puzzle[] {
  return PUZZLES.filter(p => p.type === type);
}

/** 根据ID获取谜题 */
export function getPuzzleById(id: string): Puzzle | undefined {
  return PUZZLES.find(p => p.id === id);
}

/** 战术类型说明 */
export const TACTIC_TYPES: Record<string, { name: string; description: string; icon: string }> = {
  fork: {
    name: '抽将（叉子）',
    description: '一个棋子同时攻击两个或以上对方棋子的战术。最常见的目标是同时攻击国王和另一个棋子。',
    icon: 'fork',
  },
  pin: {
    name: '牵制',
    description: '一个棋子无法移动，因为移动后会让后面的更有价值的棋子受到攻击。',
    icon: 'pin',
  },
  skewer: {
    name: '串击',
    description: '攻击对方价值较高的棋子，迫使其移动后，攻击后面的价值较低的棋子。',
    icon: 'skewer',
  },
  discovered: {
    name: '发现攻击',
    description: '移动一个棋子后，露出后面的棋子对对方的攻击。通常移动的棋子和被攻击的棋子都构成威胁。',
    icon: 'discovered',
  },
  doublecheck: {
    name: '双将',
    description: '用两个棋子同时将军对方的国王。双将必须通过移动国王来解将，是最强的将军方式之一。',
    icon: 'doublecheck',
  },
};
