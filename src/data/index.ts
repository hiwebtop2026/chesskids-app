/**
 * ChessKids - 数据模块汇总导出
 */

// 棋子数据
export {
  PIECES_DATA,
  PIECE_NAMES,
  PIECE_NAMES_EN,
  getPieceInfo,
  getPieceName,
} from './pieces';
export type { PieceInfo } from './pieces';

// 谜题数据
export {
  PUZZLES,
  getPuzzlesByDifficulty,
  getPuzzlesByType,
  getPuzzleById,
  TACTIC_TYPES,
} from './puzzles';

// 徽章数据
export {
  BADGES,
  getBadgesByCategory,
  getBadgeById,
  LEVEL_TITLES,
  getLevelTitle,
  xpForLevel,
  XP_REWARDS,
} from './badges';

// 规则数据
export { RULE_DEMOS, getRuleDemo } from './rules';

// 课程数据
export {
  MODULES,
  getModuleById,
  getLessonById,
  getAllLessons,
  getTotalLessonCount,
} from './lessons';
