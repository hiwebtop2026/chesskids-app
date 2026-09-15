# 中国象棋模块优化记录（2026-09-05）

## 2026-09-16：浮动棋盘窗口 + 棋盘自适应全屏（参考腾讯棋牌）
### 新增：可拖拽浮动棋盘窗口
- 新增 `src/components/BoardFloatingWindow.tsx`（腾讯棋牌风格独立对局窗口）：
  - `position: fixed` 脱离页面布局流，标题栏拖拽移动（pointer capture + window 级降级监听）、右下角 CSS resize 缩放、边界钳制视口内
  - 标题栏内置「浏览器全屏」与「还原」按钮；ESC 退出浮动
  - 浏览器全屏 API 被拒绝/挂起时自动降级为**软件全屏**（`board-float-max` 铺满视口，500ms 超时保护）
  - 移动端（≤767px）与横屏窄窗（landscape ≤520px 高）自动铺满视口
- `XiangqiAIGame.tsx` / `XiangqiOnlineGame.tsx` 浮动模式改为该窗口（原 fixed 全屏 overlay + 自动 requestFullscreen 逻辑移除），标题栏显示对局类型 / 房间号
### 功能按钮集成到棋盘容器
- 新增 `.board-view-controls`：3D/2D 切换、复位视角、翻转棋盘、沉浸、浮动窗口等按钮以半透明毛玻璃悬浮条置于棋盘右上角（不占独立工具栏行）
- 人机对战状态栏瘦身（移除 3D/2D/最大化/翻转入棋盘内）；联机删除外部 `.view-toggle` 工具栏
### 棋盘自适应（取消固定 540px 限制）
- `.xiangqi-board-host` 与 `.xiangqi-board-wrapper` 移除 `max-width: 540px` 固定上限 → `max-width: 100%`，2D/3D 棋盘随容器背景自动撑满（内嵌、双人、联机全部生效）
- 浮动窗口 body 设 `container-type: size`，棋盘用 `width: min(100cqw, 100cqh*0.9)` + `aspect-ratio: 9/10` 等比缩放，任意窗口/全屏尺寸下填满可用空间且不变形
- 全屏/铺满模式背景加深（深棕径向渐变），增强沉浸感
### 验证
- `npx tsc --noEmit` 通过；`npm run build` 通过
- 浏览器实测：浮动窗口渲染/拖拽（窗口跟随指针移动）/软件全屏降级（1365×1243 与 880×1242 下棋盘 860×956 等比填满）/退出全屏还原/还原按钮回内嵌均正常
- 内嵌模式 2D 棋盘 `host.width === 容器宽度`（552/552，双人；461/461 人机），不再有固定 540 四周留白

### 追加：浮动窗口内功能操作栏 + 双人本地统一 + 容器查询循环依赖修复
- **浮动窗口内操作栏（`.float-action-bar`）**：
  - 人机：难度下拉（入门/中级/高级/大师）+ 悔棋 + 提示 + 新对局，状态条实时显示当前难度
  - 联机：分享（房主且无对手时复制链接）+ 重开游戏（无对手时禁用）+ 离开房间
  - 双人：悔棋 + 重新开始
  - 全屏深色沉浸背景下半透明毛玻璃变体
- **联机离开确认弹窗修复**：确认弹窗原写在 `gameContent` 内、浮动模式不渲染导致点「离开」无反应；将 `gameResultModal` / `leaveConfirmModal` 抽为组件级变量，正常模式与浮动窗口共用，浮动窗口内点离开 → 确认弹窗正常出现
- **双人本地模式统一为浮动棋盘窗口**：`XiangqiLocalGame.tsx` 删除旧 `floatRef + requestFullscreen + online-game-floating-overlay` 全屏覆盖层，改用 BoardFloatingWindow（标题栏 + 状态条 + 操作栏 + 棋盘内 viewControls 3D/2D/复位/浮动）
- **容器查询循环依赖修复（关键 BUG）**：`.board-float-window` 原 `height: auto` 依赖内容、而棋盘 cq 单位又依赖窗口高度 → 循环依赖导致 `container-type: size` 的 cq 单位解析为 0，浮动窗口初始尺寸（540 宽）时棋盘完全不渲染（0×0）。改为 `height: min(88vh, 780px)` 固定窗口高度后，三个模式任意窗口尺寸棋盘均正常等比渲染
### 追加验证
- 浏览器实测：AI 浮动窗口操作栏难度切换（medium→hard）状态条同步「难度：高级」；联机房间内浮窗标题带房间号、操作栏齐全、点「离开」确认弹窗在浮窗内正常显示；双人浮动窗口棋盘 520×578（9:10）、全屏 860×956；修复后 AI/双人浮动窗口初始尺寸棋盘均正常渲染
- `npx tsc --noEmit` 通过；`npm run build` 通过

### 追加：联机浮动窗口聊天 + 语音功能
- 浮动窗口底部新增「💬 聊天」开关按钮（含消息计数徽标），展开后为可折叠聊天面板（高 210px）：
  - 消息列表实时渲染（系统消息 / 我方 / 房主 / 对手气泡，语音消息带播放按钮）
  - 表情选择器、文字输入 + 回车/发送按钮、**🎤 按住说话**（录音计时、音量波形、上滑取消）全部复用正常模式状态与逻辑
- 聊天面板内容（`chatPanelContent`）抽为共用变量，正常模式侧边栏与浮动窗口面板共用一份渲染，不再重复维护
- 全屏/铺满模式深色背景下聊天栏与面板半透明毛玻璃适配（输入框、按钮、气泡、徽标均有深色变体）
### 追加验证（双标签页真实对局）
- 浏览器实测：房主/对手双标签对局中，浮动窗口展开聊天 → 文字消息双向收发正常；按住 🎤 录音 1 秒松开 → 语音消息「▶ 0:01」发送并在列表播放/暂停；表情面板展开；全屏（软件全屏）下棋盘 860×956 与聊天面板同时正常显示
- `npx tsc --noEmit` 通过；`npm run build` 通过

### 追加：人机浮动窗口换边（AI 先手 + 自动翻转）
- 浮动窗口操作栏新增「⇄ 换边」：一键切换执子方并重置对局；换边至黑方时 **AI 红方自动先行**，且 **2D 棋盘自动翻转 180°**（黑方/玩家在下方、红方/AI 在上方）；状态条实时显示「你执：红方/黑方 · 难度」
- 正常模式侧边栏「换边」同步使用统一换边逻辑（行为一致）
- **修复隐藏 BUG**：`.xiangqi-board-flipped` 的 `rotate(180deg)` 一直被棋盘缩放内联 `transform: translate/scale` 覆盖，导致 2D 棋盘「⇅ 翻转视角」实际从未生效；现翻转与缩放合成为同一 transform（翻转时平移取反），翻转/缩放/拖拽共存
### 追加验证
- 浏览器实测：浮动窗口点「⇄ 换边」→ 状态条「轮到 黑方 走棋 / 你执：黑方 · 难度：中级」，AI（红）先行一步后轮到玩家；棋盘 `matrix(-1,0,0,-1,0,0)` 翻转，截图中红方「帥」在顶、黑方「將」在底，玩家视角正确
- `npx tsc --noEmit` 通过；`npm run build` 通过

## 2026-09-15：联机对战移动端 2D 棋盘显示不全修复
### 根因分析（浏览器 375×667 实测定位）
- **纵向裁剪（主因）**：`.xiangqi-online-game .game-board-section` 用 `aspect-ratio: 9/10` 锁定整区高度，但区内还含对手栏 + 视图切换栏 + 己方栏（约 105px），棋盘 host `height:100%` 从栏目下方开始后底部溢出约 70px，被 `overflow:hidden` 裁掉棋盘下半部分（红方主力棋子不可见）
- **横向溢出**：`.app-header` 内容 min-content 约 441px 超出窄屏视口，把 `.app` 撑宽（457px）导致整页横向滚动、棋盘被横向裁切；侧面板聊天输入组（input 默认 min-width:auto）亦将页面撑宽约 10px
### 修复（`src/styles/global.css`）
- 联机对战棋盘区域改为**高度内容自适应**：section `aspect-ratio: auto` + host `height: auto`，棋盘按自身 9:10 比例完整显示，页面可滚动查看全部
- 3D 棋盘容器补 `aspect-ratio: 9/10`（host 高度自适应后 height:100% 失效，保证 3D 不塌陷）
- 沉浸模式同步处理（普通 + 桌面沉浸以视口高度为基准）
- 窄屏顶部导航 `flex-wrap` 换行收缩，消除页头撑宽
- 聊天输入组与布局容器 `min-width: 0`，防止任何内容撑出横向滚动
### 验证（真实浏览器移动视口实测）
- 375×667：页面滚动宽 457→375（无横向溢出）；section 无内部裁剪；棋盘 9:10 完整、32 子全可见
- 320×568：同样无溢出、无裁剪、棋盘完整
- `npx tsc --noEmit` 通过；`npm run build` 通过

## 2026-09-15：稳定性与健壮性全面优化（闪退/重启修复）
### 一、闪退根因修复
- **WebGL 渲染器创建保护**：`ThreeJSXiangqiBoard` / `ThreeJSChessBoard` 渲染器创建加 try/catch，WebGL 不可用或 context 耗尽时不再抛异常崩溃
  - 国际象棋 3D 棋盘失败时**自动无感回退到 2D 棋盘**（ChessBoard，props 完全一致）
  - 中国象棋 3D 棋盘失败时显示降级提示（模块已有 2D 切换）
- **国际象棋 3D 棋盘补齐 WebGL context lost/restored 处理**：GPU 切换/后台休眠恢复后不再黑屏/停滞（对齐象棋版）
- **国际象棋 3D 棋盘消除翻转重建**：`flipped`/`readOnly` 变化时不再重建整个 Three.js 场景与渲染器（此前频繁翻转会耗尽移动端 WebGL context 导致崩溃），改为只旋转组 + readOnly 走 ref
- **3D 切换按钮 WebGL 校验**：XiangqiAI/Local/Online/RulesLearning 四个模块在无 WebGL 环境禁用 3D 按钮
- **全局错误兜底**：`main.tsx` 增加 `error` / `unhandledrejection` 全局捕获，未捕获异常显示可刷新的提示条（不静默白屏）
### 二、卡死/重启根因修复
- **AI 计算移入 Web Worker**（新增 `src/engine/xiangqiAI.worker.ts` + `src/utils/xiangqiAIAsync.ts`）：困难/大师难度不再冻结主线程（此前同步搜索最长阻塞 5 秒，移动端易判定无响应）；Worker 不可用时自动回退主线程计算；失败不影响对局
- **AI 结果防串局**：`XiangqiAIGame` 增加世代号（aiGenRef），新对局/换边后使在途 AI 计算结果失效
- **渲染循环挂载保护**：`ThreeJSChessBoard` 动画循环加 isMounted 守卫 + 卸载后 ref 置空，消除 rAF 竞态访问已释放渲染器
- **服务器异常保护**：`server/index.js` 增加 uncaughtException / unhandledRejection 处理，单条消息异常不再导致整个服务器崩溃（全员掉线）
### 三、其他
- 清理 `__CHESS_DEBUG` 调试 API 随组件卸载释放，避免场景/渲染器残留引用
- 验证：`npx tsc --noEmit` 通过；`npm run build` 通过（Worker 独立打包 8.21 kB）

## 2026-09-15：三指/右键平移方向修复
- `src/components/ThreeJSXiangqiBoard.tsx`：`panCamera()` 水平平移方向取反
  - 修复前：平移为"推相机"语义，手指向右滑时棋盘向左移动（左右反向），与垂直方向语义不一致
  - 修复后：统一为"内容跟随手指"的同向语义，手指往哪个方向滑、棋盘就往哪个方向移；红方（angleX=0）与黑方（angleX=π）两个视角均验证通过
  - 垂直方向本就正确，未改动；三指平移与右键平移共用 `panCamera`，一处修复两处生效
- 备份：`backup/2026-09-15_xiangqi-pan-fix/`
- 验证：`npx tsc --noEmit` 通过；`npm run build` 通过；相机投影数学脚本验证两个视角水平/垂直均同向

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
