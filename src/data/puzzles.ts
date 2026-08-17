/**
 * ChessKids - 战术谜题数据
 * 对应PRD功能模块三：实战技巧训练
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
      b[0][3] = 'q';
      b[0][4] = 'k';
      b[2][3] = 'N';
      b[7][4] = 'K';
      return b;
    })(),
    answer: { from: [2, 3], to: [0, 2] },
    hint: '马走到哪里可以同时攻击黑方国王和皇后？',
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
      b[0][3] = 'q';
      b[0][4] = 'k';
      b[7][3] = 'R';
      b[7][4] = 'K';
      return b;
    })(),
    answer: { from: [7, 3], to: [0, 3] },
    hint: '车走到哪里可以让对方的后无法移动？（后后面是国王）',
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
      b[1][1] = 'k';
      b[3][3] = 'q';
      b[6][6] = 'B';
      b[7][2] = 'K';
      return b;
    })(),
    answer: { from: [6, 6], to: [2, 2] },
    hint: '象沿斜线走到哪里可以串击国王和皇后？',
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
      b[0][0] = 'r';
      b[0][4] = 'k';
      b[2][5] = 'N';
      b[3][2] = 'N';
      b[7][4] = 'K';
      return b;
    })(),
    answer: { from: [2, 5], to: [0, 4] },
    hint: '哪个马可以将军并同时威胁车？',
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
      b[0][4] = 'k';
      b[3][4] = 'B';
      b[4][4] = 'R';
      b[7][4] = 'K';
      return b;
    })(),
    answer: { from: [3, 4], to: [2, 3] },
    hint: '移动象，让车可以攻击国王。象应该走到哪里？',
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
      b[0][4] = 'k';
      b[2][2] = 'B';
      b[3][5] = 'N';
      b[7][4] = 'K';
      return b;
    })(),
    answer: { from: [3, 5], to: [1, 4] },
    hint: '马走到哪里可以同时让象和马都攻击国王？',
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
      b[0][0] = 'r';
      b[0][4] = 'k';
      b[0][7] = 'r';
      b[4][4] = 'Q';
      b[7][4] = 'K';
      return b;
    })(),
    answer: { from: [4, 4], to: [3, 4] },
    hint: '皇后走到哪里可以同时攻击国王和两个车？',
    difficulty: 3,
    stars: 0,
    solved: false,
  },
  {
    id: 'puzzle-008',
    type: 'skewer',
    typeName: '串击',
    title: '高级串击',
    description: '连续串击，获得子力优势！',
    fen: '',
    board: (() => {
      const b = emptyBoard();
      b[0][0] = 'k';
      b[2][2] = 'q';
      b[4][4] = 'r';
      b[7][0] = 'R';
      b[7][7] = 'K';
      return b;
    })(),
    answer: { from: [7, 0], to: [0, 0] },
    hint: '车走到哪里可以串击国王？国王移动后可以吃掉什么？',
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
