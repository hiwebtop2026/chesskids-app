/**
 * ChessKids - 中国象棋规则学习模块
 * 展示各个棋子的走法和基本规则
 */

import React, { useState } from 'react';
import { XiangqiBoard2D } from '../components/XiangqiBoard2D';
import {
  getXiangqiPieceMoves,
} from '../engine/xiangqi';
import type { XiangqiBoard, XiangqiSquare } from '../types/xiangqi';

interface RuleItem {
  key: string;
  name: string;
  icon: string;
  description: string;
  board: XiangqiBoard;
  highlightFrom: XiangqiSquare;
}

function createEmptyBoard(): XiangqiBoard {
  return Array.from({ length: 10 }, () => Array(9).fill(''));
}

const RULE_ITEMS: RuleItem[] = [
  {
    key: 'king',
    name: '将/帅',
    icon: '帥',
    description: '将和帅只能在九宫内走，每次只能走一格，上下左右都行。双方的将帅不能直接对面（白脸将）。',
    board: (() => {
      const b = createEmptyBoard();
      b[1][4] = 'k'; // 黑将在九宫
      b[8][4] = 'K'; // 红帅在九宫
      return b;
    })(),
    highlightFrom: [8, 4],
  },
  {
    key: 'advisor',
    name: '士/仕',
    icon: '仕',
    description: '士和仕只能在九宫内斜着走，每次走一格斜线。它们是将帅的贴身护卫。',
    board: (() => {
      const b = createEmptyBoard();
      b[0][3] = 'a';
      b[0][5] = 'a';
      b[9][3] = 'A';
      b[9][5] = 'A';
      return b;
    })(),
    highlightFrom: [9, 3],
  },
  {
    key: 'elephant',
    name: '象/相',
    icon: '相',
    description: '象和相走"田"字（斜着走两格）。不能过河，而且"象眼"被塞住时不能走。',
    board: (() => {
      const b = createEmptyBoard();
      b[2][2] = 'b'; // 黑象
      b[2][6] = 'b';
      b[7][2] = 'B'; // 红相
      b[7][6] = 'B';
      return b;
    })(),
    highlightFrom: [7, 2],
  },
  {
    key: 'horse',
    name: '马',
    icon: '馬',
    description: '马走"日"字（先直走一格再斜走一格）。如果紧挨着的直线上有棋子挡住（蹩马腿），就不能走。',
    board: (() => {
      const b = createEmptyBoard();
      b[2][1] = 'n';
      b[2][7] = 'n';
      b[7][1] = 'N';
      b[7][7] = 'N';
      return b;
    })(),
    highlightFrom: [7, 1],
  },
  {
    key: 'chariot',
    name: '车',
    icon: '車',
    description: '车可以沿着横线或竖线走任意格数，是象棋中最厉害的棋子之一！',
    board: (() => {
      const b = createEmptyBoard();
      b[0][0] = 'r';
      b[0][8] = 'r';
      b[9][0] = 'R';
      b[9][8] = 'R';
      return b;
    })(),
    highlightFrom: [9, 0],
  },
  {
    key: 'cannon',
    name: '炮',
    icon: '炮',
    description: '炮走起来和车一样，但吃子时必须跳过一个棋子（叫做"炮架"）才能吃！',
    board: (() => {
      const b = createEmptyBoard();
      b[2][1] = 'c';
      b[2][7] = 'c';
      b[7][1] = 'C';
      b[7][7] = 'C';
      b[5][1] = 'P'; // 一个兵当炮架
      return b;
    })(),
    highlightFrom: [7, 1],
  },
  {
    key: 'pawn',
    name: '兵/卒',
    icon: '兵',
    description: '兵和卒每次只能向前走一格。过河以后，还可以左右走，但不能后退。',
    board: (() => {
      const b = createEmptyBoard();
      b[3][0] = 'p';
      b[3][2] = 'p';
      b[3][4] = 'p';
      b[3][6] = 'p';
      b[3][8] = 'p';
      b[6][0] = 'P';
      b[6][2] = 'P';
      b[6][4] = 'P';
      b[6][6] = 'P';
      b[6][8] = 'P';
      return b;
    })(),
    highlightFrom: [6, 4],
  },
];

export const XiangqiRulesLearning: React.FC = () => {
  const [activeRule, setActiveRule] = useState(0);
  const rule = RULE_ITEMS[activeRule];

  // 计算高亮棋子的可走位置
  const legalTargets = getXiangqiPieceMoves(
    rule.board,
    rule.highlightFrom[0],
    rule.highlightFrom[1],
  ).map((m) => m.to);

  return (
    <div className="module rules-learning xiangqi-rules">
      <div className="module-header">
        <h2>📖 中国象棋 · 规则学习</h2>
        <p>认识每个棋子，学会它们的走法！</p>
      </div>

      <div className="rule-nav">
        {RULE_ITEMS.map((r, i) => (
          <button
            key={r.key}
            className={`rule-nav-item ${i === activeRule ? 'active' : ''}`}
            onClick={() => setActiveRule(i)}
          >
            <span className="rule-icon">{r.icon}</span>
            <span className="rule-name">{r.name}</span>
          </button>
        ))}
      </div>

      <div className="rule-step-display xiangqi-rule-display">
        <div className="rule-board-wrapper">
          <XiangqiBoard2D
            board={rule.board}
            selectedSquare={rule.highlightFrom}
            legalTargets={legalTargets}
            lastMove={null}
            checkSquare={null}
            hint={null}
            onSquareClick={() => {}}
            readOnly
          />
        </div>
        <div className="step-info">
          <h3>{rule.name}</h3>
          <p className="step-desc">{rule.description}</p>
          <div className="step-tip">
            <strong>💡 小提示：</strong>
            图中<span className="hint-dot" />标记的位置都是可以走的地方，点击棋子试试！
          </div>
        </div>
      </div>

      <div className="rule-overview-section">
        <h3>🎯 基本规则</h3>
        <div className="overview-cards">
          <div className="overview-card">
            <h4>棋盘</h4>
            <p>9条竖线 × 10条横线，棋子放在交叉点上。中间是"楚河汉界"。</p>
          </div>
          <div className="overview-card">
            <h4>九宫</h4>
            <p>棋盘两端各有一个3×3的"九宫"，将/帅和士/仕不能走出九宫。</p>
          </div>
          <div className="overview-card">
            <h4>对弈</h4>
            <p>红方先行，双方轮流走棋。吃掉对方的将/帅就赢了！</p>
          </div>
          <div className="overview-card">
            <h4>将军</h4>
            <p>当你的将/帅被攻击时叫"将军"，必须马上想办法躲开。</p>
          </div>
        </div>
      </div>
    </div>
  );
};
