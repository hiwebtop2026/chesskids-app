# 中国象棋模块优化记录（2026-09-05）

# 中国象棋模块优化记录（2026-09-05）

## 2026-09-17：修复误判和棋 bug + 胜负动画音效 + 新增国风音乐 + AI 走法多样化

### 1. 【重要】修复"开局几步就判和棋"的严重 bug
- **现象**：用户反馈刚走 2 步（红炮平中、黑炮平中）就弹"和棋（重复局面/长对弈）"；3D 对局 16 步也误判和棋
- **根因**：重复局面检测的局面指纹 `boardKey` 用 `row.join('')` 生成——**有损编码**。炮从边路平到中路后，该行字符串仍压缩为 `'cc'`，不同局面指纹相同 → 误判"同一局面出现 3 次"→ 错判和棋
- **修复**：改为无损编码（空位用 `.` 占位，每行 9 字符固定长度），不同局面指纹必不相同
- **顺带**：`handleReset` 增加 `movesRef.current = []` 同步——避免 AI 调度/开局库拿到旧对局历史（执黑开局时 AI 立即走棋的潜在误判）
- **验证**：红炮平五+黑炮平五不判和、16 步随机对局不判和、真重复局面 3 次仍判和、120 步自然限着、将死优先——全部通过；浏览器实测走 2 步后状态正常"轮到 红方 走棋"

### 2. 赢棋/输棋动画与特定音效
- **胜负弹窗动画**：赢棋弹窗金色边框发光 + 弹跳入场（bounce）+ **全屏彩带雨**（30 条彩色粒子持续飘落）+ 🏆 奖杯弹跳发光；输棋/和棋温和上浮动画 + 💪 温柔摆动
- **鼓励文案**：输棋显示"没关系，多练习几局，你一定会越来越厉害！"；和棋"旗鼓相当，再来一局吧！"；赢棋随机祝贺语（太棒了/真厉害/绝杀/你赢啦/棋高一招）
- **特定音效升级**：胜利 = 六音五声琶音 + 明亮收尾和弦 + 喜庆小鼓点；输棋 = 温和下行 + 低音安慰（不打击孩子）

### 3. 新增 2 首国风轻音乐（Pixabay License 免费商用）
- 「A Peaceful Morning」清晨古风民乐（3:15）→ `xiangqi-bgm-morning.mp3`
- 「Mountain Spring」泉水笛韵（4:25）→ `xiangqi-bgm-spring.mp3`
- BGM 曲库扩为 **4 首**，⏭ 循环切换：古筝轻曲 / 古筝全曲 / 清晨古风 / 泉水笛韵

### 4. AI 走法多样化（不再千篇一律）
- **开局库随机化**：红方首步在中炮/仙人指路/飞相局三选一随机，黑方应手在屏风马/顺炮/反宫马三选一随机——每局开局都不同，孩子学到多种开局套路
- **搜索选着多样化**：各难度新增"近分窗口加权随机"——在分数接近最优的多个着法中加权随机选择（越接近最优权重越高）；必杀/必败局面仍走最优，棋力不降；easy/medium 窗口大更随机，hard/master 窗口小仍保持强
- **验证**：初始局面 20 次出现 3 种开局、中局 15 次出现 3 种应着、hard 12 次 3 种开局——全部多样；引擎测试全过

## 2026-09-17：上步棋提示增强 + 音效与国风背景音乐 + 和棋规则全面优化

### 5. 背景音乐加载加固（部署环境兼容）
- 背景音乐资源路径改用 `import.meta.env.BASE_URL` 拼接——部署到子路径/自定义域名时音乐仍能正确加载（此前绝对路径 `/audio/...` 在子路径部署下会 404 导致无声）
- 已验证：4 首 mp3 均在 GitHub 仓库（git ls-files 确认），本地 dev 实测播放正常（paused=false）

### 1. 上步棋提示（闪动/高亮）
- **2D 棋盘**：上步棋拆分起点/终点两种高亮——起点橙色半透明虚圈呼吸、终点橙色实心跳动闪烁（lastMoveFromPulse / lastMoveToPulse 动画），一眼可见
- **3D 棋盘**：放弃地面圆环方案，改为**落点棋子顶部发光球体**（半透明橙黄光球呼吸放大 + 地面亮环辅助），起点保留淡色光环——比圆环醒目得多

### 2. 音效与国风背景音乐
- **音效**（Web Audio 合成，零资源）：走子木声 / 吃子重击 / 将军警示双音 / 胜利五声琶音 / 失败下行音 / 点击音
- **背景音乐**：联网获取 **Pixabay License 免费商用**古筝轻音乐「Smooth As Silk」by kaazoom（无需署名），下载两版至 `public/audio/`（2 分钟轻量版 + 4:55 全曲版），循环播放、支持 ⏭ 切歌
- **音量**：初始音量调低至 25%（轻柔背景不打扰对局），工具栏新增音量滑块（实时调节、localStorage 持久化）
- **自动播放策略**：首次用户交互（点击/按键）解锁音频；页面隐藏自动暂停、恢复后继续
- 人机对战（工具栏）与联机对战（视图控制条）均接入音乐/音效/切歌/音量

### 3. 和棋判定全面优化
- **联机对战接入进阶判定**：`xiangqiMultiplayerStore.applyMoveToState` 改用 `getXiangqiGameStatusAdvanced`（含重复局面/自然限着和棋）
- **修复潜在 bug**：人机 AI 调度终局判断升级为进阶版——**和棋后 AI 不再继续落子**（原基础版不识别 draw，和棋后 AI 会再走）
- **引擎健壮性**：局面重放增加 try/catch 防御（走法序列损坏时保守跳过，不误判不崩溃）
- 回归验证：重复局面 3 次 / 1 次不判 / 120 步自然限着 / 119 步未到 / 有吃子不判 / 将死优先 / 异常走法防御——全部通过

### 验证
- `npx tsc --noEmit`、`npx vite build` 通过
- 浏览器实测：人机对战切 2D 走子后 `point-lastmove-from/to` 各 1 个闪烁标记；真实交互解锁后背景音乐播放（paused=false）；音量滑块实时同步（12% 显示与存储一致）；3D 棋盘渲染正常

## 2026-09-17：将军/将死 UI 区分 + 和棋规则补充（兵将死不判胜排查）

### 问题
用户上传 3D 残局截图：黑将被红兵三路围困，质疑"兵都 将死，还没判胜"。

### 排查结论（引擎无 bug）
- **渲染/交互链路审查**：3D/2D 棋盘均为受控组件（onSquareClick 回调 + checkSquare 王位高亮），
  status 由 useMemo 实时派生，弹窗/状态文案消费链路自洽无中断
- **引擎规则验证**：构造车/炮/马/兵/飞将等定向场景 + **20000 局随机局面独立交叉验证
  isXiangqiInCheck，0 不一致**；AI 实战自对弈 61 步正确判黑方将死；"兵将死"基础场景正确判 checkmate
- **用户截图局面的正确解读**：黑将旁有黑士（(0,3)(0,5)），黑方存在应将之路（士吃兵 / 将逃），
  引擎判"将军（check）"而非"将死（checkmate）"在规则上是正确的——真缺口是 UI 上
  "将军"与"将死"无区分、文案含糊，以及规则体系缺少和棋判定

### 优化内容
- **将军警示强化**：状态条在 check/checkmate 时追加 battle-status-check 红色呼吸警示类
  （checkBarFlash 动画）；文案升级为「X 被将军！请应将」，引导用户明确"将军≠判胜"
- **将死绝杀文案**：判胜文案升级为「绝杀！X 获胜！」，与普通胜利在语义上区分
- **和棋规则补充**（xiangqi.ts 新增 getXiangqiGameStatusAdvanced）：
  - 重复局面：同一局面出现 3 次 → 和棋（长将长捉 / 重复走子保护）
  - 自然限着：120 步（60 回合）内无吃子且无兵/卒移动 → 和棋
  - 重放起点为初始棋盘，重放与当前棋盘不一致时保守跳过（防误判）
  - checkmate/stalemate 加"王存在"防御，将死判定优先于和棋
- 人机对战 status 改用进阶判定（deps 增加 moves），AI 调度仍用基础判定（不受和棋影响）

### 验证
- 和棋规则 7 项定向测试全部通过（重复局面 3 次 / 1 次不判 / 120 步限着 / 119 步未到 /
  有吃子不判 / 兵动不算无进展 / 将死优先）
- 将军检测回归：定向场景 + 20000 局随机交叉验证 0 不一致
- npx tsc --noEmit、npx vite build 通过，产物含新文案与警示样式
- 浏览器实测（127.0.0.1:3000）：人机对战走「炮二平五」→ AI「马8进7」应手正常，
  走棋记录、状态条、回合切换全部正确

## 2026-09-16：浮动窗口 2D 棋盘棋子文字等比缩放 + 加粗增强

### 问题
浮动窗口模式（尤其全屏）下 2D 棋盘棋子字体未加粗、比例不协调。
根因：棋子圆盘为百分比定位（随棋盘等比放大），而 `font-size` 是固定 `rem`，
棋盘全屏放大后文字不随之变大，导致圆盘大、文字小且观感不粗。

### 修复
- **等比缩放**：浮窗内 2D 棋子文字改用容器查询 `min(4cqw, (100cqh-56px)*0.9*0.04)`
  （与棋盘尺寸公式同源），全屏路径按 `(100cqh-56px)*0.92` 计算；不支持容器查询的浏览器
  用 vh 公式回退近似，与既有棋盘双轨尺寸方案一致
- **加粗增强**：浮窗棋子字重提升至 800（全屏 900），并加 `-webkit-text-stroke` 描边
  （普通浮窗 0.6px / 全屏 0.8px），弥补楷体无粗体变体、渲染偏细的问题
- 内嵌（非浮窗）模式不受影响

### 验证
- `npx tsc --noEmit`、`npx vite build` 通过
- 浏览器实测（857×1236 视口）：普通浮窗棋子 20.8px/800/0.6px 描边；浮窗全屏后
  33.5px/900/0.8px 描边，文字与圆盘比例协调、加粗清晰

## 2026-09-16：人机/联机对战 UI 全面优化——布局重构 + 交互增强

### 人机对战
- **对战信息条重构**：回合状态（呼吸点动画 + 思考中高亮）+ 段位徽章 + 「你执 X 方/换边」整合为一行，换边按钮从侧栏移至显眼位置
- **功能操作栏独立成行**：难度选择 + 悔棋/提示/新对局从拥挤状态栏中分离，布局更清爽、移动端可换行
- **侧栏棋力卡片**：新增段位图标 / ELO / 对局-胜-负-胜率 / 初学-大师进度条 / AI 自适应说明，儿童可直观看到成长
- **思考提示去重**：移除重复的 thinking-bar，思考状态统一在状态条显示（橙色呼吸动画）
- **换边二次确认**：换边会重置对局，增加儿童友好确认文案，避免误触丢失进度

### 联机对战
- **等待对手增强**：对手栏显示「等待对手加入 · 房间号」+ 一键「📋 复制邀请」按钮
- **轮到自己走棋高亮**：turn-indicator 增加红色呼吸动画（🔴 轮到你走棋）
- **按钮文案统一**：「最大化/退出最大化」改为「浮动窗口/退出浮动」，消除歧义

### 验证
- `npx tsc --noEmit` 通过；`npx vite build` 通过
- 浏览器实测：人机 2D 走子（炮八平五→马8进7）AI 应手 + 走棋记录正常；浮动窗口模式状态条/操作栏/棋盘完整；联机创建房间（UH4JFS）等待对手提示 + 复制邀请 + 轮次高亮 + 控制按钮全部正常

## 2026-09-16：稳定性全面加固——崩溃/卡死/资源泄漏专项修复

### 目标
用户反馈"游戏过程出现闪退和重启"，全面审查引擎、AI、联机、网络层后完成 12 项健壮性修复。

### 真实缺陷修复
1. **AI 异步 Promise 永不结算（可致"思考中"卡死）**：`xiangqiAIAsync.ts` 训练请求走独立 `addEventListener`，Worker 崩溃时收不到 reject 永久挂起。重构为统一 onmessage 分派（走子/训练共用 pending 表），Worker error 时一并 reject；走子请求加 15s 超时（超时回退主线程同步计算）、训练请求加 5min 超时兜底
2. **Zobrist 哈希换边不一致（置换表命中率低）**：`xiangqiAI.ts` 走子更新异或 SIDE[0]^SIDE[1] 而黑方 hash 只异或 SIDE[1]，修复为单一 SIDE[0] 语义（走子/空着/黑方 hash 全部统一），自对弈 20 步回归验证通过
3. **引擎走法应用无防御（非法坐标可崩溃）**：`xiangqi.ts` applyXiangqiMove 对越界坐标/空起始格返回原棋盘而非抛异常
4. **联机走法未校验合法性（脏数据可损坏棋盘）**：`xiangqiMultiplayerStore.ts` applyMoveToState 增加 `isXiangqiMoveLegal` 引擎校验，收到非法走法拒绝并提示
5. **autoRoom 残留导致重进联机误加旧房间**：`App.tsx` goHome 时清空 autoRoom
6. **房主等待计时器闭包泄漏**：`xiangqiMultiplayerStore.ts` hostWaitTimer 提升为模块级，多次创建房间先清理旧计时器
7. **JOIN_ERROR 后中继 socket 挂起**：加入失败时主动关闭 wsRelay 连接

### 资源/网络层加固
8. **服务器 maxPayload 未限制（恶意大消息可撑爆内存）**：`server/index.js` 设置 `maxPayload: 128KB`
9. **服务器 CHAT 无长度上限（刷屏/膨胀）**：文本超 500 字自动截断；前端 sendChat 同步限制
10. **广播/单发无异常隔离**：server broadcast/sendTo 增加 per-client try/catch，单客户端异常不影响其他玩家
11. **聊天记录无限增长**：前端 chatMessages 上限 200 条自动裁剪
12. **2D 棋盘滚轮 passive 问题**：`XiangqiBoard2D.tsx` 改原生非被动监听（React 合成事件 preventDefault 被浏览器忽略，滚轮缩放失效且页面同时滚动）；实测 preventDefault 生效、缩放正常
13. **训练 Worker 入参无防御**：`xiangqiAI.worker.ts` 限制训练局数 1-10、深度 2-6，防异常入参长时间卡死
14. **全屏 Promise 未捕获拒绝**：App 全屏调用补 catch；浮窗拖拽降级路径补 pointercancel 清理

### 验证
- `npx tsc --noEmit` 通过；`npx vite build` 通过
- 引擎回归测试（esbuild+node）：初始红方 44 合法走法、越界/空格防御、AI 自对弈 20 步全合法、黑方先手、master 深度 8 均通过
- 浏览器实测（2D + 浮动窗口）：炮八平五→马8进7、兵七进一→AI 应手正常，控制台零错误；滚轮缩放 preventDefault 生效且缩放正常

## 2026-09-16：战术训练增强——按钮修复 + 题库扩容 24 题 + 杀法大全/随机挑战

### 修复：答对后出现两个「下一题」按钮
- 根因：`skip-btn` 在答对后文案切换为「下一题 →」，与 `next-btn` 重复
- 修复：答对后只渲染主「下一题 →」按钮，未答对只渲染「跳过 →」，永不同时出现两个

### 题库扩容（15 → 24 题，每难度 8 题）
- 新增 9 题全部经 `scripts/xiangqi_puzzle_builder.ts` 引擎审计（红方未被将军 + 唯一一步杀）
- 难度1 +3：重炮·炮炮叠阵 / 闷宫·右路闷杀 / 白脸将·右肋锁将
- 难度2 +3：马后炮·右炮横击 / 双车错·左翼沉底 / 钓鱼马·炮保车沉底
- 难度3 +3：大刀剜心·双车穿心二 / 挂角马·双马护角 / **弃车杀·车吃底士（补全新杀法类型 qiju）**
- 构造要点：n2b 双车错变首版将帅同线非法（加 C[5,4] 中路隔子修复）；n3a 卧槽马变因黑士挡马腿（控制格也需马腿）失败放弃，改构造弃车杀

### 学习内容增强
- **杀法大全图鉴**：战术页新增折叠区，展示 11 种经典杀法图文 + 儿童口诀（参考调研信源：杀法口诀/适情雅趣/天天象棋题库模式）
- **🎲 随机挑战**：难度 tabs 右侧按钮，从全部 24 题随机抽题复习
- **✅ 已掌握标记**：已解开的题目标题旁显示徽章
- **进度文案**：全部 24 题完成显示 🏆 鼓励语
- `XIANGQI_TACTIC_TYPES` 增加 `chant` 口诀字段

### 验证
- `npx tsc --noEmit` 通过；`npx vite build` 通过
- 浏览器实测：答对 xq-022 双车穿心二 → 「✅ 太棒了」+ 进度 16→17/24 + 已掌握徽章 + 仅一个「下一题 →」按钮；随机挑战跳转正常；杀法大全展开显示 11 种杀法+口诀

## 2026-09-16：中国象棋战术训练模块（15 题经典一步杀，引擎审计合法唯一解）

### 背景
- 参考国际象棋战术训练模块（`src/modules/TacticsTraining.tsx`），为小孩新增中国象棋实战杀法训练
- 儿童学棋调研结论：杀法练习应「多频次反复练、积累杀形，每天 5-10 题」；儿童必学杀法 = 马后炮 / 双车错 / 铁门栓 / 卧槽马 / 闷宫 等

### 题库（`src/data/xiangqiPuzzles.ts` 全文件重写）
- **15 题全部经引擎审计**（`scripts/xiangqi_puzzle_builder.ts` 的 `analyze()`：红方未被将军 + 唯一一步杀）
- 难度 1（5 题杀形明显）：白脸将·车锁肋道 / 闷宫·炮打闷宫 / 重炮·双炮叠将 / 马后炮·经典马后炮 / 闷宫·双马锁宫
- 难度 2（5 题稍隐蔽）：马后炮·横线马后炮 / 双车错·双车交替 / 挂角马·马挂士角 / 钓鱼马·钓鱼马配车 / 重炮·重炮破防
- 难度 3（5 题子力多杀形深）：双车错·双车错杀满盘 / 卧槽马·卧槽马跃将 / 大刀剜心·车剜中心士 / 大刀剜心·双车穿心 / 马后炮·三马环伺马后炮
- 新增 `getXiangqiPuzzlesByDifficulty(difficulty)`；保留 `XIANGQI_TACTIC_TYPES`（11 种杀法科普文案，含调研信源依据）

### UI 模块（`src/modules/XiangqiTacticsTraining.tsx`）
- 难度 tabs（1-3 ⭐）；左侧 `XiangqiBoard2D`（10×9）+ 右侧题目信息/提示/下一题/跳过/杀法讲解
- 点击只允许选红方棋子；走法目标用引擎 `getAllXiangqiLegalMoves` 过滤真实合法点
- 答对 → `solvePuzzle(id, elapsed<30)`：XP + 已解开计数 + ✅ 反馈（30s 内快解加成）；答错 ❌ 反馈 1.5s；跳过 = 先计错后下一题
- 提示按钮高亮正解 from/to 格（`point-hint`）

### 注册
- `src/App.tsx`：`XiangqiTabKey` 加 `'xq-tactics'`、`XIANGQI_TABS` 插「🧩 战术训练」于规则学习后、`renderContent` 加 case、首页中国象棋棋卡 desc 更新
- `src/modules/index.ts` 导出 `XiangqiTacticsTraining`

### 验证
- `npx tsc --noEmit` 通过；`npx vite build` 通过（99 modules）
- 浏览器实测全链路通过：难度1 第1题渲染（俥/帥/將/士 + 楚河汉界）→ 显示提示 → 选俥（point-selected + hint 高亮 8,3）→ 走 8,3 → 「✅ 太棒了！」+ XP 0→15 + 已解开 1/15 → 下一题切第2题闷宫 → 难度 3 切换显示双车错杀满盘

## 2026-09-16：联机对战双通道中继（聊天/语音/走棋国内网络可用化）

### 背景
- 联机对战依赖 PeerJS 国际云信令（`0.peerjs.com` / TURN `openrelay.metered.ca`），国内网络无法连接 → 页面长期「正在连接…」，浮窗聊天、按住说话语音、走棋全部不可用
- 项目自带本地 WS 服务器（`server/index.js`：3001，完整 CREATE_ROOM/JOIN_ROOM/MAKE_MOVE/CHAT/LEAVE_ROOM 协议）此前从未被前端使用

### 方案：P2P 优先，信令失败自动降级本地 WS 中继
- **`server/index.js`（服务器改造）**
  - MOVE / RESET_GAME / CHAT 广播改为排除发起者（原来广播给全员、依赖客户端忽略回声，同一 WS 下可能误触发）
  - 新增 `VOICE` 消息类型：base64 音频转发（96KB 上限），排除发起者并记录日志
- **`src/store/xiangqiMultiplayerStore.ts`（前端双通道）**
  - 新增模块级 `wsRelay / useRelay / relayRoomCode`，`relayUrl()` 取页面协议+host:3001
  - `connectRelay()`（6s 超时，onopen 置 useRelay 并 setupRelay）；`setupRelay()` 处理 ROOM_CREATED/JOIN_SUCCESS/JOIN_ERROR/OPPONENT_JOINED/MOVE/GAME_RESET/CHAT/VOICE/OPPONENT_LEFT
  - `relaySend()` 做内部消息→服务器协议映射（MOVE→MAKE_MOVE、HELLO→空、LEAVE→LEAVE_ROOM 等）
  - `createRoom`/`joinRoom` PeerJS 失败自动降级：提示「已自动切换本地服务器模式」→ `connectRelay()` 后发 CREATE_ROOM/JOIN_ROOM（服务器房间码 6 位无前缀，join 时去掉 `X-` 前缀）
  - `leaveRoom` / `handleDisconnect` 完整清理 relay 引用
  - `sendMessage` 中继优先；`handleMessage` CHAT 改用 `data.from` 着色

### 验证（双标签页浏览器实测）
- 房主创建自动降级成功（房间号 KJQ7W5）→ 加入者「对手已连接，对局开始！」
- 文字聊天双向：黑方发「你好呀，我是黑方！」→ 红方收到
- 语音消息：黑方按住说话 1s 发送 → 红方收到「▶ 0:01」语音气泡
- 走棋同步双向：红兵七进一（6,2→5,2）同步到黑方；黑卒 3,2→4,2（卒７进１）同步到红方，回合状态与走棋记录双端一致
- `npx tsc --noEmit` 通过

## 2026-09-16：棋盘功能按钮分区工具栏（修复 2D 按钮遮挡棋子）

### 背景
- 原 `.board-view-controls` 悬浮于棋盘内部右上角（3D/2D 切换、复位、翻转、浮动等按钮），2D 模式下直接遮挡右上角黑方車馬象士將棋子并拦截走子点击；棋盘右下角缩放按钮（+/⟳/−）同样压住红方底线棋子

### 修复（人机 / 双人统一，联机保留棋盘内底部方案）
- **新增 `view-actions-bar` 分区工具栏**：所有棋盘功能按钮移出棋盘，排列在棋盘上方独立一行，按功能**分区设置**（竖线分隔）：
  - ① 视图切换组：🎲 3D / ▦ 2D（active 高亮）
  - ② 视角组：⇅ 翻转（3D/2D 均生效）、↺ 复位（3D 复位相机 / 2D 复位缩放）
  - ③ 缩放组：＋ / －（仅 2D 生效，3D 自动禁用——3D 用双指/滚轮缩放手势）
  - ④ 浮动窗口组：⛶ 浮动（进入浮窗后自动隐藏，避免重复）
- **棋盘内零控件**：`XiangqiBoard2D` 新增 `zoomControls` prop（默认 true 兼容其他模块）+ `forwardRef` 暴露 `zoomIn/zoomOut/resetZoom`；人机/双人 2D 传 `zoomControls={false}`，右下角 +/−/⟳ 移入工具栏分区
- **浮动窗口同步**：浮窗内 `float-action-bar` 下方同样渲染分区工具栏（3 组，无浮动按钮）；全屏深色变体适配
- **联机对战**：容器 class 独立（`.xiangqi-online-game`），保留棋盘内底部预留区方案（54px，棋盘不缩、不遮挡），本轮不改动其 TSX 避免大模块回归
- 恢复人机/双人 2D 棋盘全尺寸（取消 padding-bottom；棋盘不再被压缩）

### 验证（浏览器实测）
- 人机 2D：分区栏 4 组在棋盘上方独立一行，棋盘 32 子全可见、可点击；＋ 缩放 scale(1)→scale(1.2) 生效；棋盘内 `board-view-controls` 0 个、缩放控件 0 个
- 浮动窗口 2D：分区栏 3 组、＋ 可用、棋盘 520×578 完整
- 双人 2D：分区栏 4 组（无翻转）、棋盘 433×481 完整、无遮挡
- 3D 模式：＋/− 自动禁用（缩放走 WebGL 手势）；`tsc` + `npm run build` 通过

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

### 追加：人机浮动窗口无法打开 + 运行报警修复（WebGL context 堆积）
- **现象**：频繁切换 3D/2D/浮动窗口后，控制台堆积 `WARNING: Too many active WebGL contexts. Oldest context will be lost.`，最旧 context 被浏览器回收后 3D 渲染 `renderer.render()` 抛未捕获异常 → `main.tsx` 全局 error 兜底弹出「页面出现异常」报警 → 模块异常/浮动窗口无法再打开
- **根因**：`ThreeJSXiangqiBoard.tsx` / `ThreeJSChessBoard.tsx` 每次挂载（进出浮动窗口、3D↔2D 切换、模块切换）都新建一个 WebGL context；渲染循环对 `renderer.render()` 无任何 try/catch 保护，context 丢失后异常直接冒泡
- **修复**：
  - 两组件均新增**模块级全局活跃渲染器注册表** `activeRenderers` + `disposeRendererSafe()`：新渲染器挂载前先释放旧的，**同一时刻全局只保留一个活跃 3D context**，从源头消除 context 堆积
  - 渲染循环 `renderer.render(scene, camera)` 包 **try/catch**：失败时 `setGlFailed(true)` 显示降级提示并停止继续刷错误，异常不再冒泡到全局 error 兜底
  - `webglcontextlost` 事件处理增强：直接 `setGlFailed(true)` 降级提示（避免黑屏后误以为浮动窗口/3D 卡死）
  - 卸载改为 `activeRenderers.delete(renderer) + disposeRendererSafe()` 防御式释放（绝不抛异常）
### 追加验证
- 浏览器实测：人机对战 3D↔2D↔浮动窗口反复切换 **4 轮 × 各视图**，`Too many active WebGL contexts` 警告 **0 新增**，控制台无任何 warning/error，浮动窗口每次均可正常打开（`win open: 1`）
- `npx tsc --noEmit` 通过

### 追加：AI 越下越聪明 —— 自适应提升系统（L1 动态难度 + L2 自我对弈 + L3 开局库）
- **方案依据**：对比业界主流方案（ChallengeMate/SenseRobot 动态难度、Maia 按 ELO 分级、TD Learning 自对弈评估学习、开局库/残局库），结合本项目"传统搜索 AI + Web Worker"架构落地三层机制
- **L1 动态难度自适应**（新 `src/engine/xiangqiLearning.ts`）：
  - 简化 ELO 玩家画像（localStorage 持久化），初始 1000，对局结束 K=24 结算
  - 难度下拉新增「🤖 自适应」并设为默认：AI 目标强度 = 玩家 ELO + 22（期望玩家胜率 ≈ 45%，有挑战但可赢）；玩家进步 ELO 涨 → AI 自动升级，受挫 → 自动放水
  - 段位体系：启蒙🌱/初级🥉/中级🥈/高级🥇/大师👑，状态条与浮动窗口均显示「段位 · ELO」徽章
- **L2 自我对弈学习**（AI 本体变强）：
  - 每完成 3 局人机对局，后台 Worker 跑 2 局自对弈（medium 深度保证胜负），把胜负经验反哺评估函数子力偏置（胜方车/马/炮/兵价值微升、负方微降，±20 分钳制）
  - 权重持久化 localStorage，启动自动注入引擎；`xiangqiBestMove` 新增 weights 参数（Worker 无 localStorage，主线程读取后传入）
  - 修复自对弈循环 BUG：将军状态（'check'）被误判为终局导致永远和棋、无学习信号
- **L3 开局库**：
  - 内置标准开局变例（中炮对屏风马 + 顺炮备选，前 8 步，每步带说明），AI 开局走规范着法（孩子可学到标准开局套路）
  - 开局库校验统一集成进 `xiangqiBestMove`（ply 参数），着法不合法自动回退搜索，Worker/主线程回退路径一致
- **顺带修复历史 BUG**：`getXiangqiMoveNotation` 黑方路名未做 9-col 镜像（红视角 col1 被记成黑方"２"路），导致黑方所有着法记谱错误（如"马8进7"记成"马２进３"）——直接影响孩子学习开局，已修复
- **验证**：新增 `scripts/xiangqi_learning_test.ts` 单测 **26/26 通过**（ELO 结算/段位/难度映射/开局库/记谱镜像/自对弈学习信号/5 步开局全命中）；浏览器实测：AI 执黑应手「马８进７」（标准屏风马）、状态条「🥉 初级 · 1000 · 自适应」、控制台零告警；`tsc` + `npm run build` 通过

### 追加：3D 换边自动翻转视角 + iOS 移动端 3D 浮动窗口修复
- **3D 换边自动翻转视角**：`ThreeJSXiangqiBoard` 本已内置 flipped 相机旋转（`fitCameraToBoard(flipped)` + `_setAngle(π)` 平滑动画），但 `XiangqiAIGame` 3D 分支未传 `flipped` prop → 换边后视角不翻转。修复：3D 分支接入 `flipped={boardFlipped}`，同时解锁 3D 模式下「⇅ 翻转棋盘视角」按钮（原 disabled）
- **iOS 苹果手机无法进入 3D 浮动窗口（根因排查）**：
  - **主因**：浮动窗口内棋盘宽度使用容器查询单位 `min(100cqw, calc(100cqh*0.9))`（`container-type: size`），**iOS Safari 16 以下不支持容器查询** → cq 解析为 0 → 浮动窗口内棋盘尺寸为 0、不渲染（用户看到"进不去 3D 浮动窗口"，实际是窗口打开了但棋盘空白）
  - 修复：棋盘尺寸改为**默认 vh 回退方案** `min(100%, calc((100vh-140px)*0.9))`；支持容器查询的现代浏览器（Safari 16+ / Chrome 105+）用 `@supports (container-type: size)` 覆盖为精确 cq 尺寸——新旧 iOS 全覆盖
  - **iOS 手势干扰**：3D 棋盘容器新增 `touch-action: none` + `-webkit-touch-callout: none`，阻止 iOS 双击缩放/长按菜单干扰 WebGL 单指旋转与双指缩放
  - 既有防线（前轮已加固）：WebGL context 全局单例（iOS Safari context 上限更严）、全屏 API 被拒自动软件全屏降级、context lost 降级提示
- **验证**：浏览器实测 3D 换边 → AI 红先手走炮二平五、视角自动翻转（楚河汉界镜像、黑方在下）、⇅ 按钮 3D 可用；3D 浮动窗口棋盘完整渲染（窗口 540×780 / 棋盘 520×578 / canvas 780×867）；`tsc` + `npm run build` 通过

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
