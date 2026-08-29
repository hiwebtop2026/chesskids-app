/**
 * ChessKids - 学习进度状态管理
 * 管理用户的学习进度、经验值、等级、徽章等
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProgress, GameResult } from '../types';
import { BADGES, getLevelTitle, xpForLevel, XP_REWARDS } from '../data';

/** 进度Store */
interface ProgressState {
  progress: UserProgress;
  gameHistory: GameResult[];

  // 操作方法
  addXp: (amount: number) => void;
  completeLesson: (lessonId: string, stars: number) => void;
  solvePuzzle: (puzzleId: string, fastSolve?: boolean) => void;
  recordGame: (result: GameResult) => void;
  unlockBadge: (badgeId: string) => void;
  updateBadgeProgress: (badgeId: string, progress: number) => void;
  checkBadges: () => void;
  resetProgress: () => void;
}

/** 初始进度 */
function getInitialProgress(): UserProgress {
  return {
    level: 1,
    levelTitle: getLevelTitle(1),
    xp: 0,
    xpToNextLevel: xpForLevel(2),
    totalXp: 0,
    lessonsCompleted: 0,
    puzzlesSolved: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    longestStreak: 0,
    badges: BADGES.map(b => ({ ...b })),
    completedLessonIds: [],
    completedPuzzleIds: [],
  };
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      progress: getInitialProgress(),
      gameHistory: [],

      /** 增加经验值并检查升级 */
      addXp: (amount) => {
        const { progress } = get();
        let newTotalXp = progress.totalXp + amount;
        let newLevel = progress.level;
        let newXp = progress.xp + amount;

        // 检查升级
        while (newXp >= progress.xpToNextLevel) {
          newXp -= progress.xpToNextLevel;
          newLevel++;
        }

        set({
          progress: {
            ...progress,
            level: newLevel,
            levelTitle: getLevelTitle(newLevel),
            xp: newXp,
            xpToNextLevel: xpForLevel(newLevel + 1),
            totalXp: newTotalXp,
          },
        });

        // 检查等级相关徽章
        get().updateBadgeProgress('badge-015', newLevel);
        if (newLevel >= 10) {
          get().unlockBadge('badge-015');
        }
      },

      /** 完成课程 */
      completeLesson: (lessonId, stars) => {
        const { progress } = get();
        if (progress.completedLessonIds.includes(lessonId)) return;

        const newLessonsCompleted = progress.lessonsCompleted + 1;

        set({
          progress: {
            ...progress,
            lessonsCompleted: newLessonsCompleted,
            completedLessonIds: [...progress.completedLessonIds, lessonId],
          },
        });

        // 增加经验值
        const xpReward = stars === 3 ? XP_REWARDS.lessonThreeStars : XP_REWARDS.lessonComplete;
        get().addXp(xpReward);

        // 更新徽章进度
        get().updateBadgeProgress('badge-001', Math.min(newLessonsCompleted, 1));
        get().updateBadgeProgress('badge-002', Math.min(newLessonsCompleted, 10));
        get().updateBadgeProgress('badge-003', newLessonsCompleted);
        get().updateBadgeProgress('badge-014', newLessonsCompleted);

        // 解锁徽章
        if (newLessonsCompleted >= 1) get().unlockBadge('badge-001');
        if (newLessonsCompleted >= 10) get().unlockBadge('badge-002');
      },

      /** 解开谜题 */
      solvePuzzle: (puzzleId, fastSolve = false) => {
        const { progress } = get();
        if (progress.completedPuzzleIds.includes(puzzleId)) return;

        const newPuzzlesSolved = progress.puzzlesSolved + 1;

        set({
          progress: {
            ...progress,
            puzzlesSolved: newPuzzlesSolved,
            completedPuzzleIds: [...progress.completedPuzzleIds, puzzleId],
          },
        });

        // 增加经验值
        const xpReward = fastSolve ? XP_REWARDS.puzzleFastSolve : XP_REWARDS.puzzleSolved;
        get().addXp(xpReward);

        // 更新徽章进度
        get().updateBadgeProgress('badge-005', Math.min(newPuzzlesSolved, 1));
        get().updateBadgeProgress('badge-006', Math.min(newPuzzlesSolved, 10));
        get().updateBadgeProgress('badge-007', Math.min(newPuzzlesSolved, 3));
        if (fastSolve) get().updateBadgeProgress('badge-008', 1);

        // 解锁徽章
        if (newPuzzlesSolved >= 1) get().unlockBadge('badge-005');
        if (newPuzzlesSolved >= 10) get().unlockBadge('badge-006');
        if (fastSolve) get().unlockBadge('badge-008');
      },

      /** 记录对局结果 */
      recordGame: (result) => {
        const { progress } = get();
        const newGamesPlayed = progress.gamesPlayed + 1;
        const newGamesWon = progress.gamesWon + (result.outcome === 'win' ? 1 : 0);

        let newCurrentStreak = progress.currentStreak;
        if (result.outcome === 'win') {
          newCurrentStreak++;
        } else {
          newCurrentStreak = 0;
        }
        const newLongestStreak = Math.max(progress.longestStreak, newCurrentStreak);

        set({
          progress: {
            ...progress,
            gamesPlayed: newGamesPlayed,
            gamesWon: newGamesWon,
            currentStreak: newCurrentStreak,
            longestStreak: newLongestStreak,
          },
          gameHistory: [...get().gameHistory, result].slice(-50), // 保留最近50场
        });

        // 增加经验值
        if (result.outcome === 'win') {
          const xpReward = result.difficulty >= 4
            ? XP_REWARDS.gameWinHardDifficulty
            : XP_REWARDS.gameWin;
          get().addXp(xpReward);

          // 更新对局徽章
          get().updateBadgeProgress('badge-009', 1);
          get().updateBadgeProgress('badge-010', newCurrentStreak);
          if (result.difficulty >= 4) get().updateBadgeProgress('badge-011', 1);
          if (result.moveCount <= 20) get().updateBadgeProgress('badge-012', 1);

          if (newGamesWon >= 1) get().unlockBadge('badge-009');
          if (newCurrentStreak >= 3) get().unlockBadge('badge-010');
          if (result.difficulty >= 4) get().unlockBadge('badge-011');
          if (result.moveCount <= 20) get().unlockBadge('badge-012');
        }
      },

      /** 解锁徽章 */
      unlockBadge: (badgeId) => {
        const { progress } = get();
        const badges = progress.badges.map(b =>
          b.id === badgeId && !b.unlocked
            ? { ...b, unlocked: true, progress: b.total }
            : b
        );
        set({
          progress: { ...progress, badges },
        });
      },

      /** 更新徽章进度 */
      updateBadgeProgress: (badgeId, newProgress) => {
        const { progress } = get();
        const badges = progress.badges.map(b =>
          b.id === badgeId
            ? { ...b, progress: Math.min(newProgress, b.total ?? 1) }
            : b
        );
        set({
          progress: { ...progress, badges },
        });
      },

      /** 检查所有徽章状态 */
      checkBadges: () => {
        const { progress } = get();
        progress.badges.forEach(badge => {
          if (!badge.unlocked && (badge.progress ?? 0) >= (badge.total ?? 1)) {
            get().unlockBadge(badge.id);
          }
        });
      },

      /** 重置进度 */
      resetProgress: () => {
        set({
          progress: getInitialProgress(),
          gameHistory: [],
        });
      },
    }),
    {
      name: 'chesskids-progress',
      // 只持久化 progress 和 gameHistory
      partialize: (state) => ({
        progress: state.progress,
        gameHistory: state.gameHistory,
      }),
      merge: (persisted, current) => {
        const p = typeof persisted === 'string' ? JSON.parse(persisted) : persisted;
        if (!p) return current;
        return {
          ...current,
          ...p,
          progress: {
            ...current.progress,
            ...p.progress,
            completedLessonIds: p.progress?.completedLessonIds ?? [],
            completedPuzzleIds: p.progress?.completedPuzzleIds ?? [],
          },
        };
      },
    }
  )
);
