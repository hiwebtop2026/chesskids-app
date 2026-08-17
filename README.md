# ChessKids 国际象棋少儿学堂

面向 6-12 岁少儿的国际象棋教学与对局应用，使用 React + Three.js 构建，支持 3D 棋盘渲染、人机对局、棋子学习、规则教学等功能。

## 功能模块

- **人机对局** - 与 AI 对手进行完整对局，支持三档难度
- **棋子学习** - 认识每个棋子的走法和价值
- **规则教学** - 学习国际象棋基本规则（王车易位、过路兵、升变等）
- **战术训练** - 趣味 puzzles 提升战术能力
- **进度仪表盘** - 记录对局成绩，解锁徽章成就
- **联网对战** - 通过 WebSocket 进行在线对战（需启动服务器）

## 技术栈

- **前端框架**: React 18 + TypeScript
- **3D 渲染**: Three.js（通过 CDN importmap 加载）
- **构建工具**: Vite 5
- **状态管理**: Zustand
- **路由**: React Router v6

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

开发服务器默认运行在 `http://127.0.0.1:3000`。

## 在线对战（可选）

如需使用联网对战功能，需额外启动 WebSocket 服务器：

```bash
npm run server
```

服务器运行在端口 3001。

## 部署到 GitHub Pages

本项目已配置 GitHub Actions 自动部署。将代码推送到 GitHub 后：

1. 进入仓库 **Settings** > **Pages**
2. 在 **Source** 中选择 **GitHub Actions**
3. 等待 Actions 完成后，即可通过 `https://<用户名>.github.io/<仓库名>/` 访问

## iPad 访问

部署成功后，在 iPad 的 Safari 浏览器中打开 GitHub Pages 链接即可使用。已针对 iPad Safari 进行以下适配：

- 触摸操作优化（禁用双击缩放、高亮等）
- 安全区域适配（刘海屏/圆角边框）
- 响应式布局（适配横屏/竖屏）
- 支持添加到主屏幕（全屏 PWA 体验）

## 项目结构

```
src/
├── components/     # UI 组件（3D 棋盘、棋子、控制面板等）
├── modules/         # 功能模块（人机对局、学习、训练等）
├── engine/          # 国际象棋引擎（走法、验证、AI）
├── store/           # Zustand 状态管理
├── data/            # 课程、谜题、徽章数据
├── types/           # TypeScript 类型定义
├── styles/          # 全局样式
└── vendor/          # Three.js 类型声明
```

## 许可证

MIT
