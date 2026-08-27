/**
 * ChessKids - 功能模块五：学习进度与激励系统
 * 展示用户的学习进度、成就徽章和历史记录
 */

import React, { useState } from 'react';
import { UserProfile } from '../components';
import { useProgressStore } from '../store';
import { getBadgesByCategory } from '../data';
import type { Badge } from '../types';

/** 徽章图标emoji映射 */
function getBadgeEmoji(icon: string): string {
  const emojiMap: Record<string, string> = {
    seedling: '🌱', book: '📚', 'graduation-cap': '🎓', 'chess-pawn': '♟️',
    lightbulb: '💡', 'puzzle-piece': '🧩', brain: '🧠', bolt: '⚡',
    trophy: '🏆', crown: '👑', 'chess-king': '♔', stopwatch: '⏱️',
    fire: '🔥', star: '⭐', rocket: '🚀', 'calendar-check': '📅',
  };
  return emojiMap[icon] || '🏅';
}

const CATEGORIES: { key: Badge['category']; label: string; icon: string }[] = [
  { key: 'learning', label: '学习成就', icon: '🎓' },
  { key: 'tactics', label: '战术成就', icon: '🧩' },
  { key: 'game', label: '对局成就', icon: '🏆' },
  { key: 'special', label: '特殊成就', icon: '⭐' },
];

export const ProgressSystem: React.FC = () => {
  const { progress, gameHistory, resetProgress } = useProgressStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const unlockedCount = progress.badges.filter(b => b.unlocked).length;
  const totalCount = progress.badges.length;
  const overallPercent = Math.round((unlockedCount / totalCount) * 100);

  return (
    <div className="module progress-system">
      <div className="module-header">
        <h2>🏆 学习进度与激励</h2>
        <p>追踪你的学习历程，收集所有成就徽章</p>
      </div>

      {/* 用户档案 */}
      <UserProfile progress={progress} />

      {/* 徽章收集 */}
      <div className="badges-section">
        <div className="section-header">
          <h3>🏅 成就徽章</h3>
          <span className="badge-count">
            {unlockedCount} / {totalCount} ({overallPercent}%)
          </span>
        </div>
        <div className="badge-progress-bar">
          <div className="badge-progress-fill" style={{ width: `${overallPercent}%` }} />
        </div>

        {CATEGORIES.map((cat) => {
          const badges = getBadgesByCategory(cat.key);
          return (
            <div key={cat.key} className="badge-category">
              <h4 className="category-title">{cat.icon} {cat.label}</h4>
              <div className="badge-grid">
                {badges.map((badge) => {
                  const userBadge = progress.badges.find(b => b.id === badge.id);
                  const isUnlocked = userBadge?.unlocked ?? false;
                  const badgeProgress = userBadge?.progress ?? 0;
                  const badgeTotal = badge.total ?? 1;
                  const percent = Math.round((badgeProgress / badgeTotal) * 100);

                  return (
                    <div
                      key={badge.id}
                      className={`badge-card ${isUnlocked ? 'unlocked' : 'locked'}`}
                    >
                      <div className="badge-icon-large">
                        {isUnlocked ? getBadgeEmoji(badge.icon) : '🔒'}
                      </div>
                      <div className="badge-info">
                        <span className="badge-title-text">{badge.name}</span>
                        <span className="badge-desc">{badge.description}</span>
                        {!isUnlocked && badgeTotal > 1 && (
                          <div className="badge-mini-progress">
                            <div
                              className="mini-progress-fill"
                              style={{ width: `${percent}%` }}
                            />
                            <span className="mini-progress-text">
                              {badgeProgress}/{badgeTotal}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 对局历史 */}
      <div className="history-section">
        <h3>📊 对局历史</h3>
        {gameHistory.length === 0 ? (
          <p className="empty-text">还没有对局记录，去人机对局试试吧！</p>
        ) : (
          <div className="history-table">
            <div className="history-table-header">
              <span>日期</span>
              <span>结果</span>
              <span>难度</span>
              <span>步数</span>
              <span>经验</span>
            </div>
            {gameHistory.slice().reverse().map((game, i) => (
              <div key={i} className="history-table-row">
                <span>{new Date(game.date).toLocaleDateString('zh-CN')}</span>
                <span className={`result-${game.outcome}`}>
                  {game.outcome === 'win' ? '✅ 胜利' : game.outcome === 'loss' ? '❌ 失败' : '🤝 和棋'}
                </span>
                <span>难度{game.difficulty}</span>
                <span>{game.moveCount}步</span>
                <span className={game.xpEarned > 0 ? 'xp-gained' : ''}>
                  {game.xpEarned > 0 ? `+${game.xpEarned} XP` : '-'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 重置按钮 */}
      <div className="danger-zone">
        <button className="reset-progress-btn" onClick={() => setShowResetConfirm(true)}>
          ⚠️ 重置所有进度
        </button>
      </div>

      {/* 重置确认弹窗 */}
      {showResetConfirm && (
        <div className="game-result-modal" onClick={() => setShowResetConfirm(false)}>
          <div className="result-content" onClick={(e) => e.stopPropagation()}>
            <button className="result-close-btn" onClick={() => setShowResetConfirm(false)}>
              ✕
            </button>
            <div className="result-icon">⚠️</div>
            <h3 className="result-title">确认重置所有进度？</h3>
            <p className="result-detail">
              这将清空你的经验值、徽章和对局历史，且无法恢复。
            </p>
            <div className="confirm-buttons">
              <button className="control-btn cancel-btn" onClick={() => setShowResetConfirm(false)}>
                取消
              </button>
              <button
                className="control-btn confirm-reset-btn"
                onClick={() => {
                  resetProgress();
                  setShowResetConfirm(false);
                }}
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressSystem;
