/**
 * ChessKids - 用户档案/进度概览组件
 */

import React from 'react';
import type { UserProgress } from '../types';

export interface UserProfileProps {
  progress: UserProgress;
  compact?: boolean;
}

/** 用户档案 */
export const UserProfile: React.FC<UserProfileProps> = ({ progress, compact = false }) => {
  const xpPercent = Math.round((progress.xp / progress.xpToNextLevel) * 100);
  const winRate = progress.gamesPlayed > 0
    ? Math.round((progress.gamesWon / progress.gamesPlayed) * 100)
    : 0;
  const unlockedBadges = progress.badges.filter(b => b.unlocked).length;

  if (compact) {
    return (
      <div className="user-profile compact">
        <div className="profile-header">
          <div className="level-badge">Lv.{progress.level}</div>
          <div className="profile-info">
            <span className="level-title">{progress.levelTitle}</span>
            <div className="xp-bar">
              <div className="xp-fill" style={{ width: `${xpPercent}%` }} />
              <span className="xp-text">{progress.xp}/{progress.xpToNextLevel} XP</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-profile">
      {/* 等级与经验 */}
      <div className="profile-section">
        <div className="profile-header">
          <div className="level-badge large">Lv.{progress.level}</div>
          <div className="profile-info">
            <h3 className="level-title">{progress.levelTitle}</h3>
            <div className="xp-bar">
              <div className="xp-fill" style={{ width: `${xpPercent}%` }} />
              <span className="xp-text">{progress.xp} / {progress.xpToNextLevel} XP</span>
            </div>
            <span className="total-xp">总经验: {progress.totalXp}</span>
          </div>
        </div>
      </div>

      {/* 统计数据 */}
      <div className="profile-section">
        <h4>学习统计</h4>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{progress.lessonsCompleted}</span>
            <span className="stat-label">完成课程</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{progress.puzzlesSolved}</span>
            <span className="stat-label">解开谜题</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{progress.gamesPlayed}</span>
            <span className="stat-label">对局次数</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{winRate}%</span>
            <span className="stat-label">胜率</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{progress.currentStreak}</span>
            <span className="stat-label">当前连胜</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{unlockedBadges}</span>
            <span className="stat-label">获得徽章</span>
          </div>
        </div>
      </div>

      {/* 徽章预览 */}
      <div className="profile-section">
        <h4>最近成就</h4>
        <div className="badge-preview">
          {progress.badges
            .filter(b => b.unlocked)
            .slice(0, 6)
            .map(badge => (
              <div key={badge.id} className="badge-item unlocked">
                <span className="badge-icon">{getBadgeEmoji(badge.icon)}</span>
                <span className="badge-name">{badge.name}</span>
              </div>
            ))}
          {unlockedBadges === 0 && (
            <p className="empty-text">还没有获得徽章，继续努力吧！</p>
          )}
        </div>
      </div>
    </div>
  );
};

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

export default UserProfile;
