/**
 * ChessKids - 中国象棋战术训练模块
 * 红先一步杀（经典杀法）练习题，参考国际象棋 TacticsTraining 同构
 * 棋盘复用 XiangqiBoard2D（10×9 交叉点棋盘）
 */

import React, { useState, useEffect, useMemo } from 'react';
import { XiangqiBoard2D } from '../components/XiangqiBoard2D';
import {
  XIANGQI_PUZZLES,
  XIANGQI_TACTIC_TYPES,
  getXiangqiPuzzlesByDifficulty,
} from '../data/xiangqiPuzzles';
import { useProgressStore } from '../store';
import { getAllXiangqiLegalMoves } from '../engine/xiangqi';
import type { XiangqiSquare } from '../types/xiangqi';

export const XiangqiTacticsTraining: React.FC = () => {
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedFrom, setSelectedFrom] = useState<XiangqiSquare | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<'none' | 'correct' | 'wrong'>('none');
  const [startTime, setStartTime] = useState<number>(Date.now());
  const { progress, solvePuzzle } = useProgressStore();

  const solvedPuzzles = useMemo(
    () => new Set(progress.completedPuzzleIds ?? []),
    [progress.completedPuzzleIds],
  );

  const puzzles = getXiangqiPuzzlesByDifficulty(difficulty);
  const currentPuzzle = puzzles[currentIndex];

  /** 重置计时与选择 */
  useEffect(() => {
    setStartTime(Date.now());
    setSelectedFrom(null);
    setShowHint(false);
    setFeedback('none');
  }, [currentIndex, difficulty]);

  /** 选中棋子的合法走法（引擎计算，真实可走目标点） */
  const legalTargets: XiangqiSquare[] = useMemo(() => {
    if (!selectedFrom || !currentPuzzle) return [];
    return getAllXiangqiLegalMoves(currentPuzzle.board, 'r')
      .filter((m) => m.from[0] === selectedFrom[0] && m.from[1] === selectedFrom[1])
      .map((m) => m.to);
  }, [selectedFrom, currentPuzzle]);

  /** 处理点击格子 */
  const handleSquareClick = (row: number, col: number) => {
    if (!currentPuzzle || feedback === 'correct') return;

    // 第一次点击：选择起始格（只允许选红方棋子）
    if (!selectedFrom) {
      const piece = currentPuzzle.board[row][col];
      if (!piece || piece !== piece.toUpperCase()) return;
      setSelectedFrom([row, col]);
      return;
    }

    // 点击同一格：取消选择
    if (selectedFrom[0] === row && selectedFrom[1] === col) {
      setSelectedFrom(null);
      return;
    }

    // 第二次点击：校验答案
    const selectedTo: XiangqiSquare = [row, col];
    const answer = currentPuzzle.answer;

    if (
      selectedFrom[0] === answer.from[0] &&
      selectedFrom[1] === answer.from[1] &&
      selectedTo[0] === answer.to[0] &&
      selectedTo[1] === answer.to[1]
    ) {
      // 答对了！
      setFeedback('correct');
      const elapsed = (Date.now() - startTime) / 1000;
      solvePuzzle(currentPuzzle.id, elapsed < 30);
    } else {
      // 答错了
      setFeedback('wrong');
      setTimeout(() => setFeedback('none'), 1500);
    }

    setSelectedFrom(null);
  };

  /** 下一题 */
  const handleNext = () => {
    if (currentIndex < puzzles.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // 当前难度全部完成，尝试下一难度
      if (difficulty < 3) {
        setDifficulty((difficulty + 1) as 1 | 2 | 3);
        setCurrentIndex(0);
      }
    }
  };

  return (
    <div className="module tactics-training">
      <div className="module-header">
        <h2>🀄 实战战术训练</h2>
        <p>一步杀经典杀法练习，提升你的实战能力</p>
      </div>

      {/* 难度选择 */}
      <div className="difficulty-tabs">
        {([1, 2, 3] as const).map((d) => (
          <button
            key={d}
            className={`difficulty-tab ${difficulty === d ? 'active' : ''}`}
            onClick={() => { setDifficulty(d); setCurrentIndex(0); }}
          >
            难度 {d} {d === 1 ? '⭐' : d === 2 ? '⭐⭐' : '⭐⭐⭐'}
          </button>
        ))}
      </div>

      {/* 谜题主区域 */}
      <div className="puzzle-area">
        {/* 左侧：棋盘 */}
        <div className="puzzle-board">
          <XiangqiBoard2D
            board={currentPuzzle.board}
            selectedSquare={selectedFrom}
            legalTargets={legalTargets}
            lastMove={feedback === 'correct' ? { from: currentPuzzle.answer.from, to: currentPuzzle.answer.to } : null}
            checkSquare={null}
            hint={showHint ? [currentPuzzle.answer.from, currentPuzzle.answer.to] : null}
            onSquareClick={handleSquareClick}
          />

          {/* 反馈消息 */}
          {feedback === 'correct' && (
            <div className="feedback correct">
              ✅ 太棒了！你找到了正确杀法！
            </div>
          )}
          {feedback === 'wrong' && (
            <div className="feedback wrong">
              ❌ 不对哦，再想想看~
            </div>
          )}
        </div>

        {/* 右侧：谜题信息 */}
        <div className="puzzle-info">
          <div className="puzzle-meta">
            <span className="puzzle-type">{currentPuzzle.typeName}</span>
            <span className="puzzle-number">
              第 {currentIndex + 1} / {puzzles.length} 题
            </span>
          </div>

          <h3 className="puzzle-title">{currentPuzzle.title}</h3>
          <p className="puzzle-description">{currentPuzzle.description}</p>

          {/* 提示 */}
          <div className="puzzle-hint">
            <button
              className="hint-btn"
              onClick={() => setShowHint(!showHint)}
              disabled={feedback === 'correct'}
            >
              {showHint ? '🙈 隐藏提示' : '💡 显示提示'}
            </button>
            {showHint && (
              <p className="hint-text">💡 {currentPuzzle.hint}</p>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="puzzle-actions">
            <button
              className="next-btn"
              onClick={handleNext}
              disabled={feedback !== 'correct' || (currentIndex >= puzzles.length - 1 && difficulty >= 3)}
            >
              下一题 →
            </button>
            <button
              className="skip-btn"
              onClick={() => {
                if (feedback !== 'correct') {
                  setFeedback('wrong');
                  setTimeout(() => {
                    setFeedback('none');
                    handleNext();
                  }, 1000);
                } else {
                  handleNext();
                }
              }}
              disabled={currentIndex >= puzzles.length - 1 && difficulty >= 3}
            >
              {feedback === 'correct' ? '下一题 →' : '跳过 →'}
            </button>
          </div>

          {/* 战术类型说明 */}
          <div className="tactic-explainer">
            <h4>{XIANGQI_TACTIC_TYPES[currentPuzzle.type].icon} {XIANGQI_TACTIC_TYPES[currentPuzzle.type].name}</h4>
            <p>{XIANGQI_TACTIC_TYPES[currentPuzzle.type].description}</p>
          </div>
        </div>
      </div>

      {/* 进度提示 */}
      <div className="module-progress">
        已解开 {solvedPuzzles.size} / {XIANGQI_PUZZLES.length} 道谜题
      </div>
    </div>
  );
};

export default XiangqiTacticsTraining;
