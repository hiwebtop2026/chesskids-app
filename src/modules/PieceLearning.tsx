/**
 * ChessKids - 功能模块一：棋子认知与走法学习
 * 展示6种棋子的信息、走法演示和练习
 */

import React, { useState } from 'react';
import { ThreeJSChessBoard } from '../components';
import { PIECES_DATA, type PieceInfo } from '../data';
import { useProgressStore } from '../store';

export const PieceLearning: React.FC = () => {
  const [selectedPiece, setSelectedPiece] = useState<PieceInfo>(PIECES_DATA[0]);
  const [showTips, setShowTips] = useState(false);
  const { progress, completeLesson } = useProgressStore();

  const completedPieces = new Set(
    PIECES_DATA
      .filter(p => (progress.completedLessonIds ?? []).includes(`lesson-piece-${p.type}`))
      .map(p => p.type)
  );

  /** 选择一个棋子 */
  const handleSelectPiece = (piece: PieceInfo) => {
    setSelectedPiece(piece);
    setShowTips(false);
  };

  /** 标记完成 */
  const handleComplete = () => {
    completeLesson(`lesson-piece-${selectedPiece.type}`, 3);
  };

  const isCompleted = completedPieces.has(selectedPiece.type);

  return (
    <div className="module piece-learning">
      <div className="module-header">
        <h2>♟️ 棋子认知与走法学习</h2>
        <p>认识国际象棋的6种棋子，学习它们的走法和特点</p>
      </div>

      {/* 棋子选择器 */}
      <div className="piece-selector">
        {PIECES_DATA.map((piece) => (
          <button
            key={piece.type}
            className={`piece-tab ${selectedPiece.type === piece.type ? 'active' : ''} ${
              completedPieces.has(piece.type) ? 'completed' : ''
            }`}
            onClick={() => handleSelectPiece(piece)}
          >
            <span className="piece-symbol">{piece.symbol}</span>
            <span className="piece-tab-name">{piece.name}</span>
            {completedPieces.has(piece.type) && <span className="check-mark">✓</span>}
          </button>
        ))}
      </div>

      {/* 棋子信息 */}
      <div className="piece-detail">
        {/* 左侧：棋盘演示 */}
        <div className="piece-demo">
          <ThreeJSChessBoard
            board={selectedPiece.demoBoard}
            selectedSquare={selectedPiece.startPosition}
            legalTargets={selectedPiece.highlightSquares}
            lastMove={null}
            checkSquare={null}
            hint={null}
            onSquareClick={() => {}}
            readOnly
          />
          <div className="demo-legend">
            <span className="legend-item">
              <span className="legend-dot selected" /> 棋子位置
            </span>
            <span className="legend-item">
              <span className="legend-dot legal" /> 可走位置
            </span>
          </div>
        </div>

        {/* 右侧：信息面板 */}
        <div className="piece-info">
          <div className="piece-title">
            <span className="piece-big-symbol">{selectedPiece.symbol}</span>
            <div>
              <h3>{selectedPiece.name}（{selectedPiece.nameEn}）</h3>
              <span className="piece-value">价值: {selectedPiece.value}分</span>
            </div>
          </div>

          <p className="piece-description">{selectedPiece.description}</p>

          <div className="piece-move-rules">
            <h4>走法规则</h4>
            <p className="move-description">{selectedPiece.moveDescription}</p>
            <ul className="rules-list">
              {selectedPiece.moveRules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </div>

          {/* 实战提示 */}
          <div className={`piece-tips ${showTips ? 'expanded' : ''}`}>
            <button
              className="tips-toggle"
              onClick={() => setShowTips(!showTips)}
            >
              {showTips ? '▼' : '▶'} 实战小贴士
            </button>
            {showTips && (
              <ul className="tips-list">
                {selectedPiece.tips.map((tip, i) => (
                  <li key={i}>💡 {tip}</li>
                ))}
              </ul>
            )}
          </div>

          {/* 完成按钮 */}
          <button
            className={`complete-btn ${isCompleted ? 'done' : ''}`}
            onClick={handleComplete}
            disabled={isCompleted}
          >
            {isCompleted ? '✓ 已完成' : '标记为已学习'}
          </button>
        </div>
      </div>

      {/* 进度提示 */}
      <div className="module-progress">
        已学习 {completedPieces.size} / {PIECES_DATA.length} 种棋子
      </div>
    </div>
  );
};

export default PieceLearning;
