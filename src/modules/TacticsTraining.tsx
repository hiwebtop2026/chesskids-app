/**
 * ChessKids - 功能模块三：实战技巧训练
 * 战术谜题练习系统
 */

import React, { useState, useEffect } from 'react';
import { ThreeJSChessBoard } from '../components/ThreeJSChessBoard';
import { PUZZLES, TACTIC_TYPES, getPuzzlesByDifficulty } from '../data';
import { useProgressStore } from '../store';

export const TacticsTraining: React.FC = () => {
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedFrom, setSelectedFrom] = useState<[number, number] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<'none' | 'correct' | 'wrong'>('none');
  const [startTime, setStartTime] = useState<number>(Date.now());
  const { progress, solvePuzzle } = useProgressStore();

  const solvedPuzzles = new Set(progress.completedPuzzleIds ?? []);

  const puzzles = getPuzzlesByDifficulty(difficulty);
  const currentPuzzle = puzzles[currentIndex];

  /** 重置计时器 */
  useEffect(() => {
    setStartTime(Date.now());
    setSelectedFrom(null);
    setShowHint(false);
    setFeedback('none');
  }, [currentIndex, difficulty]);

  /** 处理点击格子 */
  const handleSquareClick = (row: number, col: number) => {
    if (!currentPuzzle || feedback === 'correct') return;

    // 第一次点击：选择起始格
    if (!selectedFrom) {
      setSelectedFrom([row, col]);
      return;
    }

    // 点击同一个格子：取消选择
    if (selectedFrom[0] === row && selectedFrom[1] === col) {
      setSelectedFrom(null);
      return;
    }

    // 第二次点击：检查答案
    const selectedTo: [number, number] = [row, col];
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
      // 当前难度全部完成，尝试下一个难度
      if (difficulty < 3) {
        setDifficulty((difficulty + 1) as 1 | 2 | 3);
        setCurrentIndex(0);
      }
    }
  };

  return (
    <div className="module tactics-training">
      <div className="module-header">
        <h2>🧩 实战技巧训练</h2>
        <p>通过战术谜题提升你的实战能力</p>
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
          <ThreeJSChessBoard
            board={currentPuzzle.board}
            selectedSquare={selectedFrom}
            legalTargets={selectedFrom ? Array.from({ length: 8 }, (_, r) =>
              Array.from({ length: 8 }, (_, c) => [r, c] as [number, number])
            ).flat() : []}
            lastMove={feedback === 'correct' ? { from: currentPuzzle.answer.from, to: currentPuzzle.answer.to } : null}
            checkSquare={null}
            hint={showHint ? { from: currentPuzzle.answer.from, to: currentPuzzle.answer.to } : null}
            onSquareClick={handleSquareClick}
          />

          {/* 反馈消息 */}
          {feedback === 'correct' && (
            <div className="feedback correct">
              ✅ 太棒了！你找到了正确答案！
            </div>
          )}
          {feedback === 'wrong' && (
            <div className="feedback wrong">
              ❌ 不对哦，再想想看！
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
            <h4>战术说明：{TACTIC_TYPES[currentPuzzle.type].name}</h4>
            <p>{TACTIC_TYPES[currentPuzzle.type].description}</p>
          </div>
        </div>
      </div>

      {/* 进度提示 */}
      <div className="module-progress">
        已解开 {solvedPuzzles.size} / {PUZZLES.length} 道谜题
      </div>
    </div>
  );
};

export default TacticsTraining;
