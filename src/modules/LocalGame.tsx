/**
 * ChessKids - 功能模块：双人对局
 * 两位玩家在同一设备上轮流走棋
 */

import React, { useMemo, useEffect, useRef, useState } from 'react';
import { MoveHistory } from '../components';
import { ThreeJSChessBoard } from '../components/ThreeJSChessBoard';
import { useLocalGameStore } from '../store/localGameStore';
import { useProgressStore } from '../store/progressStore';
import { findKing, isInCheck } from '../engine';
import { isGameOver } from '../types/chess';
import type { GameStatus } from '../types/chess';

const PLAYER_NAMES = {
  w: '白方',
  b: '黑方',
};

const STATUS_TEXT: Record<GameStatus, (turn: 'w' | 'b') => string> = {
  playing: (t) => `轮到 ${PLAYER_NAMES[t]} 走棋`,
  check: (t) => `${PLAYER_NAMES[t]} 被将军！`,
  checkmate: (t) => `${PLAYER_NAMES[t === 'w' ? 'b' : 'w']} 获胜！`,
  stalemate: () => '逼和（平局）',
  draw: () => '和棋',
};

export const LocalGame: React.FC = () => {
  const {
    board,
    turn,
    status,
    history,
    moves,
    lastMove,
    selection,
    autoFlip,
    flipped,
    selectSquare,
    resetGame,
    undoMove,
    toggleAutoFlip,
    toggleFlip,
  } = useLocalGameStore();

  const { recordGame } = useProgressStore();
  const gameRecorded = useRef(false);
  const [showResultModal, setShowResultModal] = useState(false);

  const checkSquare = useMemo(() => {
    if (status === 'playing' || status === 'check') {
      const kingPos = findKing(board, turn === 'w');
      if (kingPos && isInCheck(board, turn === 'w')) {
        return kingPos;
      }
    }
    return null;
  }, [board, status, turn]);

  useEffect(() => {
    if (gameRecorded.current) return;
    if (isGameOver(status)) {
      const outcome: 'win' | 'loss' | 'draw' =
        status === 'checkmate'
          ? (turn === 'b' ? 'win' : 'loss')
          : 'draw';
      recordGame({
        outcome,
        difficulty: 1,
        moveCount: moves.length,
        xpEarned: 20,
        date: new Date().toISOString(),
      });
      gameRecorded.current = true;
      setShowResultModal(true);
    }
  }, [status, turn, moves.length, recordGame]);

  const handleReset = () => {
    gameRecorded.current = false;
    setShowResultModal(false);
    resetGame();
  };

  const legalTargets = selection?.legalTargets || [];
  const gameOver = isGameOver(status);
  const statusText = STATUS_TEXT[status](turn);

  return (
    <div className="module local-game">
      <div className="module-header">
        <h2>👥 双人对局</h2>
        <p>两位棋手同屏对弈，轮流走棋，享受纯粹的国际象棋乐趣！</p>
      </div>

      <div className="game-layout local-game-layout">
        <div className="game-board-section">
          <ThreeJSChessBoard
            board={board}
            selectedSquare={selection?.from || null}
            legalTargets={legalTargets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            hint={null}
            onSquareClick={selectSquare}
            flipped={flipped}
          />
        </div>

        <div className="game-side-panel local-game-panel">
          <div className="game-controls">
            <div className={`status-display status-${status}`}>
              <span className="status-icon">
                {status === 'checkmate' && '👑'}
                {status === 'check' && '⚔️'}
                {status === 'stalemate' && '🤝'}
                {status === 'draw' && '🤝'}
                {status === 'playing' && (turn === 'w' ? '⚪' : '⚫')}
              </span>
              <span className="status-text">{statusText}</span>
            </div>

            <div className="player-info-bar">
              <div className={`player-chip ${turn === 'w' ? 'active' : ''}`}>
                <span className="player-color color-w">⚪</span>
                <span className="player-name">{PLAYER_NAMES.w}</span>
                {turn === 'w' && !gameOver && <span className="your-turn">走棋中</span>}
              </div>
              <div className="vs-divider">VS</div>
              <div className={`player-chip ${turn === 'b' ? 'active' : ''}`}>
                <span className="player-color color-b">⚫</span>
                <span className="player-name">{PLAYER_NAMES.b}</span>
                {turn === 'b' && !gameOver && <span className="your-turn">走棋中</span>}
              </div>
            </div>

            <div className="control-group">
              <label className="control-label">棋盘方向</label>
              <div className="flip-controls">
                <button
                  className={`control-btn ${autoFlip ? 'active' : ''}`}
                  onClick={toggleAutoFlip}
                >
                  {autoFlip ? '✅ 自动翻转' : '⬜ 自动翻转'}
                </button>
                <button
                  className="control-btn"
                  onClick={toggleFlip}
                  disabled={autoFlip}
                >
                  🔄 手动翻转
                </button>
              </div>
            </div>

            <div className="control-group">
              <button
                className="control-btn undo-btn"
                onClick={undoMove}
                disabled={gameOver || moves.length === 0}
              >
                ↩️ 悔棋
              </button>
              <button className="control-btn reset-btn" onClick={handleReset}>
                🔄 新游戏
              </button>
            </div>

            <div className="move-counter">
              已走 {Math.ceil(moves.length / 2)} 回合 ({moves.length} 步)
            </div>
          </div>

          <MoveHistory history={history} />

          {gameOver && showResultModal && (
            <div className="game-result-modal">
              <div className="result-content">
                <button className="result-close-btn" onClick={() => setShowResultModal(false)}>
                  ✕
                </button>
                <div className="result-icon">
                  {status === 'checkmate' && '🎉'}
                  {status === 'stalemate' && '🤝'}
                  {status === 'draw' && '🤝'}
                </div>
                <h3 className="result-title">
                  {status === 'checkmate' && `${PLAYER_NAMES[turn === 'w' ? 'b' : 'w']} 获胜！`}
                  {status === 'stalemate' && '逼和（平局）'}
                  {status === 'draw' && '和棋'}
                </h3>
                <p className="result-detail">共走了 {moves.length} 步</p>
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

export default LocalGame;
