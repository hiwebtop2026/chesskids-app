/**
 * ChessKids - 功能模块四：人机对局系统
 * 与AI对手进行完整对局
 */

import React, { useEffect, useMemo, useState } from 'react';
import { MoveHistory, GameControls } from '../components';
import { ThreeJSChessBoard } from '../components/ThreeJSChessBoard';
import { useGameStore } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';
import { findKing, isInCheck } from '../engine';
import { isGameOver } from '../types/chess';
import type { Difficulty } from '../types/chess';

export const GamePlay: React.FC = () => {
  const {
    board,
    turn,
    status,
    difficulty,
    playerColor,
    history,
    moves,
    lastMove,
    selection,
    hint,
    isAIThinking,
    selectSquare,
    startGame,
    resetGame,
    undoMove,
    requestHint,
    setDifficulty,
  } = useGameStore();

  const { recordGame } = useProgressStore();
  const gameRecorded = React.useRef(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedColor, setSelectedColor] = useState<'w' | 'b'>('w');

  /** 检查当前方是否被将军 */
  const checkSquare = useMemo(() => {
    if (status === 'playing' || status === 'check') {
      const kingPos = findKing(board, turn === 'w');
      if (kingPos && isInCheck(board, turn === 'w')) {
        return kingPos;
      }
    }
    return null;
  }, [board, status, turn]);

  /** 游戏结束时记录结果 */
  useEffect(() => {
    if (gameRecorded.current) return;
    if (isGameOver(status)) {
      let outcome: 'win' | 'loss' | 'draw' = 'draw';
      if (status === 'checkmate') {
        // 将杀方是当前回合的对方，即被将杀的是当前回合方
        // turn 是被将杀方，如果 turn === playerColor 则玩家输了
        outcome = turn === playerColor ? 'loss' : 'win';
      }
      recordGame({
        outcome,
        difficulty: difficulty as Difficulty,
        moveCount: moves.length,
        xpEarned: outcome === 'win' ? (difficulty >= 4 ? 60 : 30) : 0,
        date: new Date().toISOString(),
      });
      gameRecorded.current = true;
      setShowResultModal(true);
    }
  }, [status, turn, playerColor, difficulty, moves.length, recordGame]);

  /** 开始游戏 */
  const handleStartGame = () => {
    setGameStarted(true);
    gameRecorded.current = false;
    setShowResultModal(false);
    startGame(selectedColor);
  };

  /** 重置游戏 */
  const handleReset = () => {
    gameRecorded.current = false;
    setShowResultModal(false);
    resetGame();
  };

  /** 切换难度 */
  const handleDifficultyChange = (d: Difficulty) => {
    setDifficulty(d);
    if (gameStarted) {
      handleReset();
    }
  };

  /** 获取选中棋子的合法目标 */
  const legalTargets = selection?.legalTargets || [];

  // 游戏未开始：显示颜色选择界面
  if (!gameStarted) {
    return (
      <div className="module game-play">
        <div className="module-header">
          <h2>🤖 人机对局</h2>
          <p>选择你的阵营，开始一场国际象棋对局！</p>
        </div>

        <div className="color-setup-area">
          <div className="color-selection">
            <h3>选择你的阵营</h3>
            <div className="color-options">
              <button
                className={`color-option ${selectedColor === 'w' ? 'active' : ''}`}
                onClick={() => setSelectedColor('w')}
              >
                <span className="color-piece white-king">♔</span>
                <span className="color-label">白方</span>
                <span className="color-desc">先手 · 先行</span>
              </button>
              <button
                className={`color-option ${selectedColor === 'b' ? 'active' : ''}`}
                onClick={() => setSelectedColor('b')}
              >
                <span className="color-piece black-king">♚</span>
                <span className="color-label">黑方</span>
                <span className="color-desc">后手 · AI先行</span>
              </button>
            </div>
          </div>

          <div className="difficulty-setup">
            <h3>选择难度</h3>
            <div className="difficulty-options">
              {([1, 2, 3, 4, 5] as const).map((d) => (
                <button
                  key={d}
                  className={`difficulty-option ${difficulty === d ? 'active' : ''}`}
                  onClick={() => setDifficulty(d)}
                >
                  {d} {d === 1 ? '⭐' : d === 2 ? '⭐⭐' : d === 3 ? '⭐⭐⭐' : d === 4 ? '⭐⭐⭐⭐' : '⭐⭐⭐⭐⭐'}
                </button>
              ))}
            </div>
          </div>

          <button className="start-game-btn" onClick={handleStartGame}>
            🎮 开始对局
          </button>
        </div>
      </div>
    );
  }

  // 游戏中：显示棋盘和控制面板
  return (
    <div className="module game-play">
      <div className="module-header">
        <h2>🤖 人机对局</h2>
        <p>
          你执{playerColor === 'w' ? '白方' : '黑方'} · 
          {playerColor === 'w' ? ' 先手' : ' 后手'} · 
          难度 {difficulty}
        </p>
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
            flipped={playerColor === 'b'}
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
            onDifficultyChange={handleDifficultyChange}
          />

          <MoveHistory history={history} />

          {/* 游戏结束弹窗 */}
          {isGameOver(status) && showResultModal && (
            <div className="game-result-modal">
              <div className="result-content">
                <button className="result-close-btn" onClick={() => setShowResultModal(false)}>
                  ✕
                </button>
                <div className="result-icon">
                  {status === 'checkmate' && (turn === playerColor ? '😢' : '🎉')}
                  {status === 'stalemate' && '🤝'}
                  {status === 'draw' && '🤝'}
                </div>
                <h3 className="result-title">
                  {status === 'checkmate' && (turn === playerColor ? '你输了' : '你赢了！')}
                  {status === 'stalemate' && '逼和（平局）'}
                  {status === 'draw' && '和棋'}
                </h3>
                <p className="result-detail">
                  共走了 {moves.length} 步
                  {status === 'checkmate' && turn !== playerColor && ` (+${difficulty >= 4 ? 60 : 30} XP)`}
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
