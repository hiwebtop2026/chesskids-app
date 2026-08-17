/**
 * ChessKids - 规则演示数据
 * 对应PRD功能模块二：基本规则学习
 */

import type { RuleDemo } from '../types';

function emptyBoard(): string[][] {
  return Array.from({ length: 8 }, () => Array(8).fill(''));
}

/** 规则演示数据集 */
export const RULE_DEMOS: RuleDemo[] = [
  {
    key: 'check',
    title: '将军',
    intro: '当国王受到攻击时，就是"将军"。被将军的一方必须立即解除将军。',
    steps: [
      {
        board: (() => {
          const b = emptyBoard();
          b[0][4] = 'k';
          b[7][4] = 'K';
          b[7][0] = 'R';
          return b;
        })(),
        text: '白车沿着e线向上移动，直接攻击黑方国王，形成将军！',
      },
      {
        board: (() => {
          const b = emptyBoard();
          b[0][4] = 'k';
          b[0][3] = 'q';
          b[7][4] = 'K';
          return b;
        })(),
        text: '白皇后移到e8旁边，将军黑国王。',
      },
      {
        board: (() => {
          const b = emptyBoard();
          b[0][4] = 'k';
          b[2][3] = 'N';
          b[7][4] = 'K';
          return b;
        })(),
        text: '马跳到d6，直接攻击e8上的黑国王，形成马的将军！',
      },
    ],
  },
  {
    key: 'checkmate',
    title: '将死',
    intro: '当国王被将军且无法逃脱时，就是"将死"。将死后棋局结束，被将死的一方输棋。',
    steps: [
      {
        board: (() => {
          const b = emptyBoard();
          b[0][0] = 'k';
          b[0][1] = 'r';
          b[1][0] = 'r';
          b[1][1] = 'r';
          b[3][0] = 'Q';
          b[7][4] = 'K';
          return b;
        })(),
        text: '白皇后在a4将军，黑国王无路可逃，被将死！',
      },
      {
        board: (() => {
          const b = emptyBoard();
          b[0][6] = 'k';
          b[1][7] = 'Q';
          b[1][5] = 'B';
          b[7][4] = 'K';
          return b;
        })(),
        text: '经典将死：皇后在g7将军，象在f6掩护，国王无法逃脱！',
      },
    ],
  },
  {
    key: 'stalemate',
    title: '逼和',
    intro: '当一方没有合法走法，但国王没有被将军时，就是"逼和"。逼和是平局（和棋）。',
    steps: [
      {
        board: (() => {
          const b = emptyBoard();
          b[0][0] = 'k';
          b[1][1] = 'Q';
          b[2][0] = 'K';
          return b;
        })(),
        text: '白皇后在b7控制了黑国王的所有出路，但国王没有被将军。黑方无棋可走，逼和！',
      },
    ],
  },
  {
    key: 'castling',
    title: '王车易位',
    intro: '王车易位是国王和车同时移动的特殊走法，用于保护国王。每局棋只能进行一次王车易位。',
    steps: [
      {
        board: (() => {
          const b = emptyBoard();
          b[0][4] = 'k';
          b[0][0] = 'r';
          b[7][4] = 'K';
          b[7][0] = 'R';
          return b;
        })(),
        text: '初始位置：国王在e线，车在a线（短易位则车在h线）。',
      },
      {
        board: (() => {
          const b = emptyBoard();
          b[0][2] = 'k';
          b[0][3] = 'r';
          b[7][2] = 'K';
          b[7][3] = 'R';
          return b;
        })(),
        text: '易位后：国王向车的方向移动两格，车跳到国王的另一侧。',
      },
    ],
  },
  {
    key: 'en-passant',
    title: '吃过路兵',
    intro: '当对方的兵从初始位置走了两格，恰好经过你兵的旁边时，你可以像它只走了一格一样吃掉它。',
    steps: [
      {
        board: (() => {
          const b = emptyBoard();
          b[3][4] = 'P';
          b[1][5] = 'p';
          b[7][4] = 'K';
          b[0][4] = 'k';
          return b;
        })(),
        text: '白兵在e5，黑兵从f7走到f5，正好经过白兵的旁边。',
      },
      {
        board: (() => {
          const b = emptyBoard();
          b[2][5] = 'P';
          b[7][4] = 'K';
          b[0][4] = 'k';
          return b;
        })(),
        text: '白兵可以斜走到f6，吃掉刚才"过路"的黑兵。注意：吃过路兵必须在下一步立即执行，否则失去机会。',
      },
    ],
  },
  {
    key: 'promotion',
    title: '兵的升变',
    intro: '当兵走到对方底线（第8横线）时，可以升变为后、车、象或马。通常升变为皇后，因为皇后最强大。',
    steps: [
      {
        board: (() => {
          const b = emptyBoard();
          b[1][3] = 'P';
          b[7][4] = 'K';
          b[0][4] = 'k';
          return b;
        })(),
        text: '白兵在d7，准备走到d8升变。',
      },
      {
        board: (() => {
          const b = emptyBoard();
          b[0][3] = 'Q';
          b[7][4] = 'K';
          b[0][4] = 'k';
          return b;
        })(),
        text: '白兵走到d8，升变为皇后！兵升变后将成为新的棋子，不再是兵。',
      },
    ],
  },
  {
    key: 'draw',
    title: '和棋',
    intro: '国际象棋中除了将死分出胜负外，还有多种和棋的情况。',
    steps: [
      {
        board: (() => {
          const b = emptyBoard();
          b[0][0] = 'K';
          b[7][7] = 'k';
          return b;
        })(),
        text: '双方只剩下国王——自动和棋（兵力不足将死）。',
      },
      {
        board: (() => {
          const b = emptyBoard();
          b[0][0] = 'K';
          b[0][7] = 'k';
          b[4][4] = 'B';
          return b;
        })(),
        text: '国王+象对国王也是和棋（兵力不足）。',
      },
    ],
  },
  {
    key: 'fifty-move',
    title: '五十步规则',
    intro: '如果连续50步双方没有吃子，也没有兵移动，棋局自动判为和棋。这是为了防止没有进展的棋局无限拖延。',
    steps: [
      {
        board: (() => {
          const b = emptyBoard();
          b[0][0] = 'k';
          b[0][2] = 'R';
          b[7][0] = 'K';
          return b;
        })(),
        text: '如果双方在50步内没有吃子或移动兵，可以要求和棋。',
      },
    ],
  },
];

/** 根据key获取规则演示 */
export function getRuleDemo(key: string): RuleDemo | undefined {
  return RULE_DEMOS.find(r => r.key === key);
}
