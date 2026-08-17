/**
 * ChessKids - 功能模块四：人机对局系统
 * 与AI对手进行完整对局
 */

import React, { useEffect } from 'react';
import { MoveHistory, GameControls } from '../components';
import { ThreeJSChessBoard } from '../components/ThreeJSChessBoard';
import { useGameStore } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';
import { findKing, isInCheck } from '../engine';
import type { Difficulty } from '../types/chess';

export const GamePlay: React.FC = () => {
  const {
    board,
    turn,
    status,
    difficulty,
    history,
    moves,
    lastMove,
    selection,
    hint,
    isAIThinking,
    selectSquare,
    resetGame,
    undoMove,
    requestHint,
    setDifficulty,
  } = useGameStore();

  const { recordGame } = useProgressStore();
  const gameRecorded = React.useRef(false);

  /** 检查当前方是否被将军 */
  const checkSquare = (() => {
    if (status === 'playing' || status === 'check') {
      const kingPos = findKing(board, turn === 'w');
      if (kingPos && isInCheck(board, turn === 'w')) {
        return kingPos;
      }
    }
    return null;
  })();

  /** 游戏结束时记录结果 */
  useEffect(() => {
    if (gameRecorded.current) return;
    if (status === 'checkmate' || status === 'stalemate' || status === 'draw') {
      let outcome: 'win' | 'loss' | 'draw' = 'draw';
      if (status === 'checkmate') {
        outcome = turn === 'w' ? 'loss' : 'win';
      }
      recordGame({
        outcome,
        difficulty: difficulty as Difficulty,
        moveCount: moves.length,
        xpEarned: outcome === 'win' ? (difficulty >= 4 ? 60 : 30) : 0,
        date: new Date().toISOString(),
      });
      gameRecorded.current = true;
    }
  }, [status, turn, difficulty, moves.length, recordGame]);

  /** 重置游戏 */
  const handleReset = () => {
    gameRecorded.current = false;
    resetGame();
  };

  /** 获取选中棋子的合法目标 */
  const legalTargets = selection?.legalTargets || [];

  return (
    <div className="module game-play">
      <div className="module-header">
        <h2>🤖 人机对局</h2>
        <p>与AI对手来一场国际象棋对局吧！</p>
      </div>

      <div className="game-layout">
        {/* 左侧：棋盘 */}
        <div className="game-board-section">
          <ThreeJSChessBoard
            board={board}
            selectedSquare={selection?.from || null}
            legalTargets={legalTargets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            hint={hint}
            onSquareClick={selectSquare}
            flipped={false}
          />
          {isAIThinking && (
            <div className="ai-thinking-overlay">
              <div className="thinking-indicator">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <p>AI正在思考...</p>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：控制面板 */}
        <div className="game-side-panel">
          <GameControls
            status={status}
            turn={turn}
            difficulty={difficulty}
            moveCount={moves.length}
            isAIThinking={isAIThinking}
            onReset={handleReset}
            onUndo={undoMove}
            onHint={requestHint}
            onDifficultyChange={(d) => {
              setDifficulty(d);
              handleReset();
            }}
          />

          <MoveHistory history={history} />

          {/* 游戏结束弹窗 */}
          {(status === 'checkmate' || status === 'stalemate' || status === 'draw') && (
            <div className="game-result-modal">
              <div className="result-content">
                <div className="result-icon">
                  {status === 'checkmate' && (turn === 'w' ? '😢' : '🎉')}
                  {status === 'stalemate' && '🤝'}
                  {status === 'draw' && '🤝'}
                </div>
                <h3 className="result-title">
                  {status === 'checkmate' && (turn === 'w' ? '你输了' : '你赢了！')}
                  {status === 'stalemate' && '逼和（平局）'}
                  {status === 'draw' && '和棋'}
                </h3>
                <p className="result-detail">
                  共走了 {moves.length} 步
                  {status === 'checkmate' && turn === 'b' && ` (+${difficulty >= 4 ? 60 : 30} XP)`}
                </p>
                <button className="play-again-btn" onClick={handleReset}>
                  再来一局
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GamePlay;
