/**
 * ChessKids - 功能模块二：基本规则学习
 * 交互式规则演示，支持步骤播放
 */

import React, { useState, useEffect } from 'react';
import { ThreeJSChessBoard } from '../components';
import { RULE_DEMOS } from '../data';
import type { RuleDemo } from '../types';
import { useProgressStore } from '../store';

export const RulesLearning: React.FC = () => {
  const [selectedRule, setSelectedRule] = useState<RuleDemo>(RULE_DEMOS[0]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completedRules, setCompletedRules] = useState<Set<string>>(new Set());
  const { completeLesson } = useProgressStore();

  /** 自动播放步骤 */
  useEffect(() => {
    if (!isPlaying) return;
    if (currentStep >= selectedRule.steps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, selectedRule]);

  /** 选择规则 */
  const handleSelectRule = (rule: RuleDemo) => {
    setSelectedRule(rule);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  /** 完成规则学习 */
  const handleComplete = () => {
    setCompletedRules(prev => new Set(prev).add(selectedRule.key));
    completeLesson(`lesson-rule-${selectedRule.key}`, 3);
  };

  const isCompleted = completedRules.has(selectedRule.key);
  const step = selectedRule.steps[currentStep];

  return (
    <div className="module rules-learning">
      <div className="module-header">
        <h2>📖 基本规则学习</h2>
        <p>通过交互演示学习国际象棋的基本规则</p>
      </div>

      {/* 规则选择器 */}
      <div className="rule-selector">
        {RULE_DEMOS.map((rule) => (
          <button
            key={rule.key}
            className={`rule-tab ${selectedRule.key === rule.key ? 'active' : ''} ${
              completedRules.has(rule.key) ? 'completed' : ''
            }`}
            onClick={() => handleSelectRule(rule)}
          >
            {rule.title}
            {completedRules.has(rule.key) && <span className="check-mark">✓</span>}
          </button>
        ))}
      </div>

      {/* 规则演示 */}
      <div className="rule-demo">
        <div className="rule-intro">
          <h3>{selectedRule.title}</h3>
          <p>{selectedRule.intro}</p>
        </div>

        <div className="rule-step-display">
          {/* 棋盘演示 */}
          <ThreeJSChessBoard
            board={step.board as unknown as string[][]}
            selectedSquare={null}
            legalTargets={[]}
            lastMove={null}
            checkSquare={null}
            hint={null}
            onSquareClick={() => {}}
            readOnly
          />

          {/* 步骤说明 */}
          <div className="step-info">
            <div className="step-text">{step.text}</div>
            <div className="step-controls">
              <button
                className="step-btn"
                onClick={() => { setCurrentStep(0); setIsPlaying(false); }}
                disabled={currentStep === 0}
              >
                ⏮ 重新开始
              </button>
              <button
                className="step-btn"
                onClick={() => { setIsPlaying(!isPlaying); }}
                disabled={currentStep >= selectedRule.steps.length - 1 && !isPlaying}
              >
                {isPlaying ? '⏸ 暂停' : '▶ 自动播放'}
              </button>
              <button
                className="step-btn"
                onClick={() => setCurrentStep((s) => Math.min(s + 1, selectedRule.steps.length - 1))}
                disabled={currentStep >= selectedRule.steps.length - 1}
              >
                ⏭ 下一步
              </button>
            </div>
            <div className="step-indicator">
              步骤 {currentStep + 1} / {selectedRule.steps.length}
              <div className="step-progress">
                {selectedRule.steps.map((_, i) => (
                  <span
                    key={i}
                    className={`step-dot ${i === currentStep ? 'current' : ''} ${
                      i < currentStep ? 'done' : ''
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
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

      {/* 进度提示 */}
      <div className="module-progress">
        已学习 {completedRules.size} / {RULE_DEMOS.length} 条规则
      </div>
    </div>
  );
};

export default RulesLearning;
