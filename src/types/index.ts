/**
 * ChessKids - 类型定义汇总导出
 */

import type { Difficulty } from './chess';
export * from './chess';

/** 教学关卡 */
export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  description: string;
  order: number;
  stars: number; // 0-3
  completed: boolean;
  unlocked: boolean;
}

/** 教学模块 */
export interface Module {
  id: string;
  title: string;
  icon: string;
  description: string;
  order: number;
  lessons: Lesson[];
  unlocked: boolean;
  progress: number; // 0-100
}

/** 战术谜题 */
export interface Puzzle {
  id: string;
  type: 'fork' | 'pin' | 'skewer' | 'discovered' | 'doublecheck';
  typeName: string;
  title: string;
  description: string;
  fen: string; // 局面表示
  board: string[][];
  answer: { from: [number, number]; to: [number, number] };
  hint: string;
  difficulty: 1 | 2 | 3;
  stars: number;
  solved: boolean;
}

/** 规则演示步骤 */
export interface RuleStep {
  board: string[][];
  text: string;
}

/** 规则演示数据 */
export interface RuleDemo {
  key: string;
  title: string;
  intro: string;
  steps: RuleStep[];
}

/** 成就徽章 */
export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'learning' | 'tactics' | 'game' | 'special';
  condition: string;
  unlocked: boolean;
  progress?: number;
  total?: number;
}

/** 用户学习进度 */
export interface UserProgress {
  level: number;
  levelTitle: string;
  xp: number;
  xpToNextLevel: number;
  totalXp: number;
  lessonsCompleted: number;
  puzzlesSolved: number;
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  longestStreak: number;
  badges: Badge[];
}

/** 对局结果 */
export interface GameResult {
  outcome: 'win' | 'loss' | 'draw';
  difficulty: Difficulty;
  moveCount: number;
  xpEarned: number;
  date: string;
}
