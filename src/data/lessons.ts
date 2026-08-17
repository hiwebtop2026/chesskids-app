/**
 * ChessKids - 教学课程数据
 * 对应PRD五大功能模块的课程体系
 */

import type { Module, Lesson } from '../types';

/** 教学模块数据 */
export const MODULES: Module[] = [
  // ===== 模块一：棋子认知与走法学习 =====
  {
    id: 'module-1',
    title: '棋子认知与走法学习',
    icon: 'chess',
    description: '认识国际象棋的6种棋子，学习它们的基本走法和特点。',
    order: 1,
    unlocked: true,
    progress: 0,
    lessons: [
      {
        id: 'lesson-1-1',
        moduleId: 'module-1',
        title: '认识国王',
        description: '了解国王的基本走法和重要性。',
        order: 1,
        stars: 0,
        completed: false,
        unlocked: true,
      },
      {
        id: 'lesson-1-2',
        moduleId: 'module-1',
        title: '认识皇后',
        description: '了解皇后的强大走法。',
        order: 2,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-1-3',
        moduleId: 'module-1',
        title: '认识车',
        description: '学习车沿直线移动的走法。',
        order: 3,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-1-4',
        moduleId: 'module-1',
        title: '认识象',
        description: '学习象沿斜线移动的走法。',
        order: 4,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-1-5',
        moduleId: 'module-1',
        title: '认识马',
        description: '学习马独特的"日"字走法。',
        order: 5,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-1-6',
        moduleId: 'module-1',
        title: '认识兵',
        description: '学习兵的前进和吃子规则。',
        order: 6,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-1-7',
        moduleId: 'module-1',
        title: '棋子价值',
        description: '了解不同棋子的价值大小。',
        order: 7,
        stars: 0,
        completed: false,
        unlocked: false,
      },
    ],
  },

  // ===== 模块二：基本规则学习 =====
  {
    id: 'module-2',
    title: '基本规则学习',
    icon: 'book',
    description: '学习将军、将死、和棋等基本规则。',
    order: 2,
    unlocked: false,
    progress: 0,
    lessons: [
      {
        id: 'lesson-2-1',
        moduleId: 'module-2',
        title: '将军',
        description: '什么是将军？如何识别将军？',
        order: 1,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-2-2',
        moduleId: 'module-2',
        title: '将死',
        description: '如何将死对方的国王？',
        order: 2,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-2-3',
        moduleId: 'module-2',
        title: '和棋',
        description: '哪些情况下棋局是平局？',
        order: 3,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-2-4',
        moduleId: 'module-2',
        title: '王车易位',
        description: '学习保护国王的特殊走法。',
        order: 4,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-2-5',
        moduleId: 'module-2',
        title: '吃过路兵',
        description: '了解兵的特殊吃法。',
        order: 5,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-2-6',
        moduleId: 'module-2',
        title: '兵的升变',
        description: '兵到达底线后的变化。',
        order: 6,
        stars: 0,
        completed: false,
        unlocked: false,
      },
    ],
  },

  // ===== 模块三：实战技巧训练 =====
  {
    id: 'module-3',
    title: '实战技巧训练',
    icon: 'puzzle',
    description: '通过战术谜题学习实战中的高级技巧。',
    order: 3,
    unlocked: false,
    progress: 0,
    lessons: [
      {
        id: 'lesson-3-1',
        moduleId: 'module-3',
        title: '抽将（叉子）',
        description: '学习用一个棋子同时攻击两个目标。',
        order: 1,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-3-2',
        moduleId: 'module-3',
        title: '牵制',
        description: '让对方棋子无法移动的战术。',
        order: 2,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-3-3',
        moduleId: 'module-3',
        title: '串击',
        description: '攻击价值高的棋子以获取后面的棋子。',
        order: 3,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-3-4',
        moduleId: 'module-3',
        title: '发现攻击',
        description: '移动一个棋子露出后面的攻击。',
        order: 4,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-3-5',
        moduleId: 'module-3',
        title: '双将',
        description: '最强大的将军方式。',
        order: 5,
        stars: 0,
        completed: false,
        unlocked: false,
      },
    ],
  },

  // ===== 模块四：人机对局系统 =====
  {
    id: 'module-4',
    title: '人机对局系统',
    icon: 'robot',
    description: '与AI对手进行实战对局，检验学习成果。',
    order: 4,
    unlocked: false,
    progress: 0,
    lessons: [
      {
        id: 'lesson-4-1',
        moduleId: 'module-4',
        title: '入门对局',
        description: '与最简单的AI对手对弈。',
        order: 1,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-4-2',
        moduleId: 'module-4',
        title: '进阶对局',
        description: '挑战中等难度的AI。',
        order: 2,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-4-3',
        moduleId: 'module-4',
        title: '高级对局',
        description: '与高难度AI进行挑战。',
        order: 3,
        stars: 0,
        completed: false,
        unlocked: false,
      },
    ],
  },

  // ===== 模块五：学习进度与激励系统 =====
  {
    id: 'module-5',
    title: '学习进度与激励系统',
    icon: 'trophy',
    description: '追踪学习进度，解锁成就徽章。',
    order: 5,
    unlocked: false,
    progress: 0,
    lessons: [
      {
        id: 'lesson-5-1',
        moduleId: 'module-5',
        title: '每日挑战',
        description: '完成每日练习获取奖励。',
        order: 1,
        stars: 0,
        completed: false,
        unlocked: false,
      },
      {
        id: 'lesson-5-2',
        moduleId: 'module-5',
        title: '成就殿堂',
        description: '查看和追踪已获得的成就。',
        order: 2,
        stars: 0,
        completed: false,
        unlocked: false,
      },
    ],
  },
];

/** 根据ID获取模块 */
export function getModuleById(id: string): Module | undefined {
  return MODULES.find(m => m.id === id);
}

/** 根据ID获取课程 */
export function getLessonById(id: string): Lesson | undefined {
  for (const mod of MODULES) {
    const lesson = mod.lessons.find(l => l.id === id);
    if (lesson) return lesson;
  }
  return undefined;
}

/** 获取所有课程 */
export function getAllLessons(): Lesson[] {
  return MODULES.flatMap(m => m.lessons);
}

/** 获取总课程数 */
export function getTotalLessonCount(): number {
  return MODULES.reduce((sum, m) => sum + m.lessons.length, 0);
}
