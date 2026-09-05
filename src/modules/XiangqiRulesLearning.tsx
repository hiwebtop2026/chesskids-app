/**
 * ChessKids - 中国象棋规则学习模块
 * 展示各个棋子的走法：点击绿色走位演示走子，点棋子复位
 */
import React, { useMemo, useState } from 'react';
import { XiangqiBoard2D } from '../components/XiangqiBoard2D';
import { ThreeJSXiangqiBoard } from '../components/ThreeJSXiangqiBoard';
import {
  getXiangqiPieceMoves,
  cloneXiangqiBoard,
} from '../engine/xiangqi';
import type { XiangqiBoard, XiangqiSquare } from '../types/xiangqi';
import { supportsWebGL } from '../utils/webgl';
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
      b[0][2] = 'b'; // 黑象（合法开局位）
      b[0][6] = 'b';
      b[9][2] = 'B'; // 红相（合法开局位）
      b[9][6] = 'B';
      return b;
    })(),
    highlightFrom: [9, 2],
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
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(supportsWebGL() ? '3d' : '2d');
  // 演示走子：高亮棋子的当前位置（初始为原位，点击绿色走位后移动）
  const [pos, setPos] = useState<XiangqiSquare | null>(null);
  const rule = RULE_ITEMS[activeRule];
  const demoPos = pos ?? rule.highlightFrom;
  // 展示棋盘：若已演示移动，把高亮棋子从原位移到演示位
  const displayBoard = useMemo(() => {
    const b = cloneXiangqiBoard(rule.board);
    if (pos) {
      const [fr, fc] = rule.highlightFrom;
      const [tr, tc] = pos;
      b[tr][tc] = b[fr][fc];
      b[fr][fc] = '';
    }
    return b;
  }, [rule, pos]);
  // 计算高亮棋子当前可走位置
  const legalTargets = getXiangqiPieceMoves(
    displayBoard,
    demoPos[0],
    demoPos[1],
  ).map((m) => m.to);
  const switchRule = (i: number) => {
    setActiveRule(i);
    setPos(null);
  };
  const handleClick = (r: number, c: number) => {
    if (legalTargets.some((t) => t[0] === r && t[1] === c)) {
      setPos([r, c]);
      return;
    }
    // 点击棋子本身 → 复位
    if (demoPos[0] === r && demoPos[1] === c) setPos(null);
  };
  const resetDemo = () => setPos(null);
  return (
    <div className="module rules-learning xiangqi-rules">
      <div className="module-header">
        <h2>📖 中国象棋 · 规则学习</h2>
        <p>认识每个棋子，点击绿色走位，亲手试试它们的走法！</p>
      </div>
      <div className="rule-nav">
        {RULE_ITEMS.map((r, i) => (
          <button
            key={r.key}
            className={`rule-nav-item ${i === activeRule ? 'active' : ''}`}
            onClick={() => switchRule(i)}
          >
            <span className="rule-icon">{r.icon}</span>
            <span className="rule-name">{r.name}</span>
          </button>
        ))}
      </div>
      <div className="rule-step-display xiangqi-rule-display">
        <div className="rule-board-wrapper">
          <div className="rule-view-switch">
            <button
              className={`action-btn ${viewMode === '3d' ? 'primary' : ''}`}
              onClick={() => setViewMode('3d')}
            >
              🎲 3D
            </button>
            <button
              className={`action-btn ${viewMode === '2d' ? 'primary' : ''}`}
              onClick={() => setViewMode('2d')}
            >
              ▦ 2D
            </button>
          </div>
          <div className={`xiangqi-board-host view-${viewMode}`}>
            {viewMode === '3d' ? (
              <ThreeJSXiangqiBoard
                board={displayBoard}
                selectedSquare={demoPos}
                legalTargets={legalTargets}
                lastMove={null}
                checkSquare={null}
                hint={null}
                onSquareClick={handleClick}
              />
            ) : (
              <XiangqiBoard2D
                board={displayBoard}
                selectedSquare={demoPos}
                legalTargets={legalTargets}
                lastMove={null}
                checkSquare={null}
                hint={null}
                onSquareClick={handleClick}
              />
            )}
          </div>
        </div>
        <div className="step-info">
          <h3>{rule.name}</h3>
          <p className="step-desc">{rule.description}</p>
          <div className="step-tip">
            <strong>💡 小提示：</strong>
            图中<span className="hint-dot" />标记的位置都可以走，点一下试试；点棋子可复位。
          </div>
          <button className="action-btn" onClick={resetDemo} style={{ alignSelf: 'flex-start' }}>
            ↩ 复位棋子
          </button>
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
