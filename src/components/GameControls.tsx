/**
 * ChessKids - 对局控制面板
 */

import React from 'react';
import type { Difficulty, GameStatus } from '../types/chess';

export interface GameControlsProps {
  status: GameStatus;
  turn: 'w' | 'b';
  difficulty: Difficulty;
  moveCount: number;
  isAIThinking: boolean;
  onReset: () => void;
  onUndo: () => void;
  onHint: () => void;
  onDifficultyChange: (d: Difficulty) => void;
}

/** 难度选项 */
const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 1, label: '入门' },
  { value: 2, label: '简单' },
  { value: 3, label: '中等' },
  { value: 4, label: '困难' },
  { value: 5, label: '大师' },
];

/** 对局控制 */
export const GameControls: React.FC<GameControlsProps> = ({
  status,
  turn,
  difficulty,
  moveCount,
  isAIThinking,
  onReset,
  onUndo,
  onHint,
  onDifficultyChange,
}) => {
  const statusText = (() => {
    switch (status) {
      case 'playing':
        return turn === 'w' ? '轮到你了（白方）' : 'AI思考中...（黑方）';
      case 'check':
        return turn === 'w' ? '你被将军了！' : 'AI被将军了！';
      case 'checkmate':
        return turn === 'w' ? '你被将死了！AI获胜' : '你赢了！将死AI';
      case 'stalemate':
        return '逼和（平局）';
      case 'draw':
        return '和棋';
      default:
        return '';
    }
  })();

  const gameOver = status === 'checkmate' || status === 'stalemate' || status === 'draw';

  return (
    <div className="game-controls">
      {/* 状态显示 */}
      <div className={`status-display status-${status}`}>
        <span className="status-icon">
          {status === 'checkmate' && '👑'}
          {status === 'check' && '⚔️'}
          {status === 'stalemate' && '🤝'}
          {status === 'draw' && '🤝'}
          {status === 'playing' && (isAIThinking ? '🤖' : '♟️')}
        </span>
        <span className="status-text">{statusText}</span>
      </div>

      {/* 难度选择 */}
      <div className="control-group">
        <label className="control-label">AI难度</label>
        <div className="difficulty-selector">
          {DIFFICULTY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`difficulty-btn ${difficulty === opt.value ? 'active' : ''}`}
              onClick={() => onDifficultyChange(opt.value)}
              disabled={!gameOver && moveCount > 0}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="control-group">
        <button
          className="control-btn hint-btn"
          onClick={onHint}
          disabled={gameOver || turn !== 'w' || isAIThinking}
        >
          💡 提示
        </button>
        <button
          className="control-btn undo-btn"
          onClick={onUndo}
          disabled={gameOver || moveCount < 2 || isAIThinking}
        >
          ↩️ 悔棋
        </button>
        <button className="control-btn reset-btn" onClick={onReset}>
          🔄 新游戏
        </button>
      </div>

      {/* 走棋计数 */}
      <div className="move-counter">
        已走 {Math.ceil(moveCount / 2)} 回合 ({moveCount} 步)
      </div>
    </div>
  );
};

export default GameControls;
