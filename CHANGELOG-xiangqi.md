# 中国象棋模块优化记录（2026-09-05）

## 一、新增：人机对战模块（核心补全）
- **新增 AI 引擎** `src/engine/xiangqiAI.ts`
  - 扁平 90 格棋盘 + negamax + alpha-beta 剪枝 + 迭代加深
  - 四档难度：入门 / 中级 / 高级 / 大师（深度、时限、随机扰动不同）
  - 吃子着法排序、超时回滚、低难度随机化；含 PST 位置评估（兵过河、马、炮）
  - 导出 `xiangqiBestMove(board, color, difficulty)` 与 `XiangqiAIDifficulty`、`XIANGQI_AI_DIFFICULTIES`
- **新增模块** `src/modules/XiangqiAIGame.tsx`
  - 人机对局：难度下拉、3D/2D 切换、悔棋（含 AI 步）、提示、换边、新对局、结果弹窗
  - 支持执红 / 执黑开局（执黑时 AI 自动先手）
  - 修复 AI 调度竞态：`scheduleAI(b, t)` 显式传棋盘与走方，避免依赖未同步的 ref 导致 AI 不响应
- **接入路由**：`src/App.tsx` 中国象棋 Tab 新增「人机对战 🤖」；`src/modules/index.ts` 导出

## 二、记谱统一（消除重复实现）
- 引擎 `src/engine/xiangqi.ts` 新增导出 `getXiangqiMoveNotation`
  - 红方：汉字路名 + 汉字进退步数（如 炮八平五）
  - 黑方：全角数字路名 + 全角数字步数（如 炮８进７）
- `src/modules/XiangqiLocalGame.tsx` 删除私有 `getMoveNotation`，改调引擎统一版本

## 三、3D 棋子形象改版（参考上传渲染图：黑底红字）
- `src/components/ThreeJSXiangqiBoard.tsx`
  - 黑方：曜石黑亮漆主体（#262626）+ 朱红阴文汉字（#E2321C）
  - 红方：枣红亮漆主体（#C23A24）+ 米金阴文汉字（#FFE9B0）
  - 顶面新增内圈凸环（参考图棋子"圈"造型）、高光 clearcoat 漆面、雕刻更深、顶面底色随主体色渐变

## 四、规则学习增强
- `src/modules/XiangqiRulesLearning.tsx`：从只读演示改为可交互——点击绿色走位即可演示走子、点棋子复位；保留 3D/2D 切换与全部棋子讲解

## 五、健壮性
- 新增 `src/utils/webgl.ts`（supportsWebGL）；三个象棋模块默认视图按 WebGL 能力自动回退（无 GPU 环境自动用 2D，避免整模块报错）

## 六、验证
- `npx tsc --noEmit`：通过
- `npx vite build`：通过
- `scripts/xiangqi_test.ts`（tsx）：24/24 通过（记谱、四档 AI 着法、AI 执黑后手、8 步对局冒烟）
- 浏览器实测（2D 视图）：人机对局 AI 正常应战（红炮八平五 → 黑炮８进７吃马）、悔棋回退、换边执黑 AI 先手、走棋记录正确、规则学习交互走子、双人对战记谱正确
- 3D 视图需在有 GPU/WebGL 的浏览器中查看（本测试环境无 WebGL）
