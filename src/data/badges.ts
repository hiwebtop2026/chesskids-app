/**
 * ChessKids - 成就徽章数据
 * 对应PRD功能模块五：学习进度与激励系统
 */

import type { Badge } from '../types';

/** 徽章库 */
export const BADGES: Badge[] = [
  // ===== 学习类徽章 =====
  {
    id: 'badge-001',
    name: '初出茅庐',
    icon: 'seedling',
    description: '完成第一个教学关卡',
    category: 'learning',
    condition: '完成1个教学关卡',
    unlocked: false,
    progress: 0,
    total: 1,
  },
  {
    id: 'badge-002',
    name: '勤奋学子',
    icon: 'book',
    description: '完成10个教学关卡',
    category: 'learning',
    condition: '完成10个教学关卡',
    unlocked: false,
    progress: 0,
    total: 10,
  },
  {
    id: 'badge-003',
    name: '棋艺大师',
    icon: 'graduation-cap',
    description: '完成全部教学关卡',
    category: 'learning',
    condition: '完成全部教学关卡',
    unlocked: false,
    progress: 0,
    total: 30,
  },
  {
    id: 'badge-004',
    name: '棋子专家',
    icon: 'chess-pawn',
    description: '学习全部6种棋子的走法',
    category: 'learning',
    condition: '学习K/Q/R/B/N/P全部棋子',
    unlocked: false,
    progress: 0,
    total: 6,
  },

  // ===== 战术类徽章 =====
  {
    id: 'badge-005',
    name: '战术新秀',
    icon: 'lightbulb',
    description: '解开第一个战术谜题',
    category: 'tactics',
    condition: '解开1个谜题',
    unlocked: false,
    progress: 0,
    total: 1,
  },
  {
    id: 'badge-006',
    name: '战术高手',
    icon: 'puzzle-piece',
    description: '解开10个战术谜题',
    category: 'tactics',
    condition: '解开10个谜题',
    unlocked: false,
    progress: 0,
    total: 10,
  },
  {
    id: 'badge-007',
    name: '战术大师',
    icon: 'brain',
    description: '解开全部难度3的谜题',
    category: 'tactics',
    condition: '解开全部高难度谜题',
    unlocked: false,
    progress: 0,
    total: 3,
  },
  {
    id: 'badge-008',
    name: '速通达人',
    icon: 'bolt',
    description: '30秒内解开一个谜题',
    category: 'tactics',
    condition: '30秒内解开1个谜题',
    unlocked: false,
    progress: 0,
    total: 1,
  },

  // ===== 对局类徽章 =====
  {
    id: 'badge-009',
    name: '首战告捷',
    icon: 'trophy',
    description: '赢得第一场人机对局',
    category: 'game',
    condition: '赢得1场对局',
    unlocked: false,
    progress: 0,
    total: 1,
  },
  {
    id: 'badge-010',
    name: '常胜将军',
    icon: 'crown',
    description: '连续赢得3场人机对局',
    category: 'game',
    condition: '3连胜',
    unlocked: false,
    progress: 0,
    total: 3,
  },
  {
    id: 'badge-011',
    name: '以智取胜',
    icon: 'chess-king',
    description: '在难度4以上击败AI',
    category: 'game',
    condition: '难度4+获胜',
    unlocked: false,
    progress: 0,
    total: 1,
  },
  {
    id: 'badge-012',
    name: '速战速决',
    icon: 'stopwatch',
    description: '20步以内赢得对局',
    category: 'game',
    condition: '20步内获胜',
    unlocked: false,
    progress: 0,
    total: 1,
  },

  // ===== 特殊类徽章 =====
  {
    id: 'badge-013',
    name: '坚持不懈',
    icon: 'fire',
    description: '连续7天登录学习',
    category: 'special',
    condition: '7天连续登录',
    unlocked: false,
    progress: 0,
    total: 7,
  },
  {
    id: 'badge-014',
    name: '完美主义者',
    icon: 'star',
    description: '获得全部教学关卡的三星评价',
    category: 'special',
    condition: '全部教学关卡获三星',
    unlocked: false,
    progress: 0,
    total: 30,
  },
  {
    id: 'badge-015',
    name: '棋坛新星',
    icon: 'rocket',
    description: '达到等级10',
    category: 'special',
    condition: '达到等级10',
    unlocked: false,
    progress: 1,
    total: 10,
  },
  {
    id: 'badge-016',
    name: '全勤奖',
    icon: 'calendar-check',
    description: '累计登录30天',
    category: 'special',
    condition: '累计登录30天',
    unlocked: false,
    progress: 0,
    total: 30,
  },
];

/** 根据类别获取徽章 */
export function getBadgesByCategory(category: Badge['category']): Badge[] {
  return BADGES.filter(b => b.category === category);
}

/** 根据ID获取徽章 */
export function getBadgeById(id: string): Badge | undefined {
  return BADGES.find(b => b.id === id);
}

/** 等级称号 */
export const LEVEL_TITLES: Record<number, string> = {
  1: '棋坛新兵',
  2: '初学棋手',
  3: '勤奋学徒',
  4: '棋艺爱好者',
  5: '棋坛棋手',
  6: '战术学徒',
  7: '棋艺能手',
  8: '战术专家',
  9: '棋坛高手',
  10: '棋坛大师',
  11: '高级大师',
  12: '棋坛宗师',
};

/** 根据等级获取称号 */
export function getLevelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level, 12)] || '棋坛传奇';
}

/** 升级所需经验值（累计） */
export function xpForLevel(level: number): number {
  return level * 100 + (level - 1) * 50;
}

/** 每个等级获得的经验值奖励 */
export const XP_REWARDS = {
  lessonComplete: 20,
  lessonThreeStars: 50,
  puzzleSolved: 15,
  puzzleFastSolve: 25,
  gameWin: 30,
  gameWinHardDifficulty: 60,
  dailyLogin: 5,
  streakBonus: 10,
} as const;
