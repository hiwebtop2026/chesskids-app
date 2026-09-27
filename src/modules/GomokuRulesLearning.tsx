/**
 * ChessKids - 五子棋规则学习模块
 * 规则讲解 + 迷你演示棋盘
 */
import React, { useState } from 'react';
import { GomokuBoard } from '../components/GomokuBoard';
import {
  createGomokuGame, gomokuPlayMove, findGomokuWinningLine,
  type GomokuGameState,
} from '../engine/gomoku';

export const GomokuRulesLearning: React.FC = () => {
  const [demo, setDemo] = useState<GomokuGameState>(() => createGomokuGame());
  const [showLine, setShowLine] = useState(false);

  /** 加载演示棋型（黑五连） */
  const loadDemo = () => {
    const g = createGomokuGame();
    // 横五连：黑 (7,3)-(7,7)
    const demoMoves: Array<[number, number]> = [[7, 3], [8, 5], [7, 4], [6, 6], [7, 5], [8, 6], [7, 6], [9, 7], [7, 7]];
    let cur = g;
    for (const [r, c] of demoMoves) {
      const next = gomokuPlayMove(cur, r, c);
      if (next) cur = next;
    }
    setDemo(cur);
    setShowLine(true);
  };

  const handleClick = (r: number, c: number) => {
    const next = gomokuPlayMove(demo, r, c);
    if (next) { setDemo(next); setShowLine(false); }
  };

  const winningLine = showLine && demo.winner && demo.winner !== 'draw'
    ? findGomokuWinningLine(demo.board, demo.winner)
    : null;

  return (
    <div className="module gomoku-game">
      <div className="module-header">
        <h2>📖 五子棋 · 规则学习</h2>
        <p>五子棋简单易学，几分钟就能掌握，快来了解吧！</p>
      </div>

      <div className="gomoku-rules-content">
        <div className="gomoku-rules-card">
          <h3>🎯 游戏目标</h3>
          <p>
            黑白双方轮流在棋盘交叉点上落子，先在<b>横、竖、斜</b>任意方向上连成
            <b>五枚同色棋子</b>的一方获胜。
          </p>
        </div>
        <div className="gomoku-rules-card">
          <h3>⚫⚪ 基本规则</h3>
          <ul>
            <li>黑棋先手，白棋后手，交替落子</li>
            <li>每次只能下一子，落子后不能移动</li>
            <li>空点都可以落子（无禁手规则，适合入门）</li>
            <li>棋盘 19×19，共 361 个交叉点（标准围棋棋盘）</li>
            <li>棋盘下满仍未分出胜负，则为和棋</li>
          </ul>
        </div>
        <div className="gomoku-rules-card">
          <h3>🏆 获胜棋型</h3>
          <p>以下都是获胜方式：</p>
          <ul>
            <li><b>横五连</b>：同一行连成 5 子</li>
            <li><b>竖五连</b>：同一列连成 5 子</li>
            <li><b>斜五连</b>：对角线方向连成 5 子（两条斜线均可）</li>
          </ul>
        </div>
        <div className="gomoku-rules-card">
          <h3>💡 小技巧</h3>
          <ul>
            <li>先形成「活三」（两头都开放的三个子），对手很难同时堵住</li>
            <li>「冲四」是必胜手——对手必须堵，否则你就五连了</li>
            <li>开局抢中间位置更有优势（天元附近）</li>
            <li>既要进攻也要防守：看到对手快连四子，一定要先堵</li>
          </ul>
        </div>

        <div className="gomoku-rules-card demo-card">
          <h3>🧪 演示：点击加载一个「黑棋五连」棋型</h3>
          <button className="start-game-btn" onClick={loadDemo}>🎬 加载演示棋型</button>
          <div className="gomoku-demo-board">
            <GomokuBoard
              board={demo.board}
              winningLine={winningLine}
              lastMove={demo.moves.length ? [demo.moves[demo.moves.length - 1].r, demo.moves[demo.moves.length - 1].c] : null}
              onIntersectionClick={handleClick}
            />
          </div>
          <p className="gomoku-setup-hint">你也可以直接点击棋盘自由落子练习；加载演示后金色圆环标出五连。</p>
        </div>
      </div>
    </div>
  );
};

export default GomokuRulesLearning;
