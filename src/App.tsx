/**
 * ChessKids - 主应用组件
 * 支持国际象棋和中国象棋两种游戏
 * 包含底部导航栏和功能模块的路由
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  PieceLearning,
  RulesLearning,
  TacticsTraining,
  GamePlay,
  LocalGame,
  ProgressSystem,
  OnlineGame,
  XiangqiRulesLearning,
  XiangqiLocalGame,
  XiangqiAIGame,
  XiangqiOnlineGame,
  XiangqiTacticsTraining,
  GoRulesLearning,
  GoGame,
  GoLocalGame,
  GoOnlineGame,
  GomokuRulesLearning,
  GomokuGame,
  GomokuLocalGame,
  GomokuOnlineGame,
} from './modules';
import { UserProfile, ErrorBoundary, WeChatGuide } from './components';
import { useProgressStore } from './store';
import { isWeChatBrowser } from './utils/wechat';
import { isImmersive, enterImmersive } from './utils/fullscreen';

type GameType = 'chess' | 'xiangqi' | 'go' | 'gomoku';
type ChessTabKey = 'learn' | 'rules' | 'tactics' | 'game' | 'local' | 'online' | 'progress';
type XiangqiTabKey = 'xq-rules' | 'xq-tactics' | 'xq-ai' | 'xq-local' | 'xq-online' | 'progress';
type GoTabKey = 'go-rules' | 'go-ai' | 'go-local' | 'go-online' | 'progress';
type GomokuTabKey = 'gomoku-rules' | 'gomoku-ai' | 'gomoku-local' | 'gomoku-online' | 'progress';
type TabKey = ChessTabKey | XiangqiTabKey | GoTabKey | GomokuTabKey;

const CHESS_TABS: { key: ChessTabKey; label: string; icon: string }[] = [
  { key: 'learn', label: '棋子学习', icon: '♟️' },
  { key: 'rules', label: '规则学习', icon: '📖' },
  { key: 'tactics', label: '战术训练', icon: '🧩' },
  { key: 'game', label: '人机对局', icon: '🤖' },
  { key: 'local', label: '双人对局', icon: '👥' },
  { key: 'online', label: '联机对战', icon: '🌐' },
  { key: 'progress', label: '我的进度', icon: '🏆' },
];

const XIANGQI_TABS: { key: XiangqiTabKey; label: string; icon: string }[] = [
  { key: 'xq-rules', label: '规则学习', icon: '📖' },
  { key: 'xq-tactics', label: '战术训练', icon: '🧩' },
  { key: 'xq-ai', label: '人机对战', icon: '🤖' },
  { key: 'xq-local', label: '双人对战', icon: '👥' },
  { key: 'xq-online', label: '联机对战', icon: '🌐' },
  { key: 'progress', label: '我的进度', icon: '🏆' },
];

const GO_TABS: { key: GoTabKey; label: string; icon: string }[] = [
  { key: 'go-rules', label: '规则学习', icon: '📖' },
  { key: 'go-ai', label: '人机对战', icon: '🤖' },
  { key: 'go-local', label: '双人对战', icon: '👥' },
  { key: 'go-online', label: '联机对战', icon: '🌐' },
  { key: 'progress', label: '我的进度', icon: '🏆' },
];

const GOMOKU_TABS: { key: GomokuTabKey; label: string; icon: string }[] = [
  { key: 'gomoku-rules', label: '规则学习', icon: '📖' },
  { key: 'gomoku-ai', label: '人机对战', icon: '🤖' },
  { key: 'gomoku-local', label: '双人对战', icon: '👥' },
  { key: 'gomoku-online', label: '联机对战', icon: '🌐' },
  { key: 'progress', label: '我的进度', icon: '🏆' },
];

// 启动时解析 URL 参数，支持通过分享链接自动进入房间
// 棋类判断优先级：game 参数 > 房间号前缀（C-/X-） > 默认国际象棋
function parseUrlParams(): { game: GameType; tab: TabKey; room: string } | null {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const game = params.get('game');
  if (!room) return null;

  const roomUpper = room.toUpperCase();
  let detectedGame: GameType = 'chess';

  if (game === 'xiangqi') {
    detectedGame = 'xiangqi';
  } else if (game === 'chess') {
    detectedGame = 'chess';
  } else if (game === 'go') {
    detectedGame = 'go';
  } else if (game === 'gomoku') {
    detectedGame = 'gomoku';
  } else if (roomUpper.startsWith('W-')) {
    // 从房间号前缀识别五子棋
    detectedGame = 'gomoku';
  } else if (roomUpper.startsWith('G-')) {
    // 从房间号前缀识别围棋
    detectedGame = 'go';
  } else if (roomUpper.startsWith('X-')) {
    // 从房间号前缀识别中国象棋
    detectedGame = 'xiangqi';
  } else if (roomUpper.startsWith('C-')) {
    // 从房间号前缀识别国际象棋
    detectedGame = 'chess';
  }

  const tab = detectedGame === 'xiangqi' ? 'xq-online' as TabKey
    : detectedGame === 'go' ? 'go-online' as TabKey
    : detectedGame === 'gomoku' ? 'gomoku-online' as TabKey
    : 'online' as TabKey;
  return { game: detectedGame, tab, room: roomUpper };
}

/**
 * 五子棋专属统一 Logo：木色棋盘背景 + 五颗黑棋横排在交叉点（对应"成五获胜"）。
 * 棋盘网格 5×5 交叉点，5 颗黑子正好落在线中点，替代原"✖"字符，更应景。
 */
function GomokuLogoIcon({ size = 1.1 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={`${size}em`}
      height={`${size}em`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="五子棋"
    >
      <defs>
        <linearGradient id="gwood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ecd3a4" />
          <stop offset="1" stopColor="#d9a86b" />
        </linearGradient>
      </defs>
      {/* 棋盘背景（圆角木色板） */}
      <rect x="3" y="3" width="58" height="58" rx="10" fill="url(#gwood)" stroke="#9c6a33" strokeWidth="1.6" />
      {/* 5×5 网格线 */}
      <g stroke="#8a5a2b" strokeWidth="1.1" strokeLinecap="round">
        {[12, 22, 32, 42, 52].map((p) => (
          <g key={p}>
            <line x1={p} y1={12} x2={p} y2={52} />
            <line x1={12} y1={p} x2={52} y2={p} />
          </g>
        ))}
      </g>
      {/* 星位（天元与四星） */}
      <g fill="#8a5a2b">
        {[[32, 32], [12, 12], [52, 12], [12, 52], [52, 52]].map(([sx, sy], i) => (
          <circle key={i} cx={sx} cy={sy} r="1.6" />
        ))}
      </g>
      {/* 5 颗黑棋横排在交叉点上 */}
      {[12, 22, 32, 42, 52].map((x) => (
        <g key={x}>
          <circle cx={x} cy={32} r={4.4} fill="#1c1c1c" />
          <circle cx={x - 1.2} cy={32 - 1.4} r={1.3} fill="rgba(255,255,255,0.5)" />
        </g>
      ))}
    </svg>
  );
}

const App: React.FC = () => {
  // null = 尚未选择棋类（显示首页选择界面）
  const [gameType, setGameType] = useState<GameType | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('learn');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRoom, setAutoRoom] = useState<string | null>(null);
  const [showWeChatGuide, setShowWeChatGuide] = useState(false);
  const [weChatRoom, setWeChatRoom] = useState<string | null>(null);
  const [weChatGame, setWeChatGame] = useState<GameType>('chess');
  const { progress } = useProgressStore();

  const tabs = gameType === 'chess' ? CHESS_TABS : gameType === 'xiangqi' ? XIANGQI_TABS : gameType === 'go' ? GO_TABS : GOMOKU_TABS;

  /** 启动时检测 URL 参数，自动进入对应联机房间 */
  useEffect(() => {
    const parsed = parseUrlParams();
    if (parsed) {
      // 检测是否在微信内置浏览器中打开
      if (isWeChatBrowser()) {
        // 在微信中：显示引导页，提示用户在浏览器中打开
        setWeChatRoom(parsed.room);
        setWeChatGame(parsed.game);
        setShowWeChatGuide(true);
        // 清除 URL 参数，避免刷新时重复触发
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        url.searchParams.delete('game');
        window.history.replaceState({}, '', url.toString());
      } else {
        // 非微信环境：正常自动进入房间
        setGameType(parsed.game);
        setActiveTab(parsed.tab);
        setAutoRoom(parsed.room);
        // 清除 URL 参数，避免刷新时重复触发
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        url.searchParams.delete('game');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, []);

  /** 首页选择棋类，进入对应模块 */
  const selectGame = (type: GameType) => {
    setGameType(type);
    setActiveTab(type === 'chess' ? 'learn' : type === 'xiangqi' ? 'xq-rules' : type === 'go' ? 'go-rules' : 'gomoku-rules');
  };

  /** 返回首页（重新选择棋类） */
  const goHome = () => {
    setGameType(null);
    // 清除自动加入的房间，避免返回首页后再进联机时重复加入旧房间
    setAutoRoom(null);
  };

  const toggleFullscreen = useCallback(() => {
    // 沉浸模式优先退出（iOS Safari / Android WebView 等全屏不可用时的兜底）
    if (isImmersive()) {
      document.body.classList.remove('ios-immersive');
      return;
    }
    const onRejected = () => {
      // 全屏被拒绝（iOS Safari/Android WebView 等不支持时）→ 进入沉浸模式兜底
      try { enterImmersive(); } catch { /* 忽略 */ }
    };
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        Promise.resolve(docEl.requestFullscreen()).catch(onRejected);
      } else if (docEl.webkitRequestFullscreen) {
        Promise.resolve(docEl.webkitRequestFullscreen()).catch(onRejected);
      }
    } else {
      const doc = document as any;
      if (doc.exitFullscreen) {
        Promise.resolve(doc.exitFullscreen()).catch(onRejected);
      } else if (doc.webkitExitFullscreen) {
        Promise.resolve(doc.webkitExitFullscreen()).catch(onRejected);
      }
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(fs);
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'learn':
        return <PieceLearning />;
      case 'rules':
        return <RulesLearning />;
      case 'tactics':
        return <TacticsTraining />;
      case 'game':
        return <GamePlay />;
      case 'local':
        return <LocalGame />;
      case 'online':
        return <OnlineGame autoJoinRoom={autoRoom} />;
      case 'progress':
        return <ProgressSystem />;
      case 'xq-rules':
        return <XiangqiRulesLearning />;
      case 'xq-tactics':
        return <XiangqiTacticsTraining />;
      case 'xq-ai':
        return <XiangqiAIGame />;
      case 'xq-local':
        return <XiangqiLocalGame />;
      case 'xq-online':
        return <XiangqiOnlineGame autoJoinRoom={autoRoom} />;
      case 'go-rules':
        return <GoRulesLearning />;
      case 'go-ai':
        return <GoGame />;
      case 'go-local':
        return <GoLocalGame />;
      case 'go-online':
        return <GoOnlineGame autoJoinRoom={autoRoom} />;
      case 'gomoku-rules':
        return <GomokuRulesLearning />;
      case 'gomoku-ai':
        return <GomokuGame />;
      case 'gomoku-local':
        return <GomokuLocalGame />;
      case 'gomoku-online':
        return <GomokuOnlineGame autoJoinRoom={autoRoom} />;
      default:
        return null;
    }
  };

  // ================================================================
  // 首页：选择棋类
  // ================================================================
  if (gameType === null) {
    return (
      <div className="app app-home">
        <header className="app-header">
          <div className="header-left">
            <h1 className="app-title">
              <span className="app-logo">♔</span>
              棋乐园
            </h1>
            <span className="app-subtitle">少儿棋类学堂</span>
          </div>
          <div className="header-right">
            <UserProfile progress={progress} compact />
          </div>
        </header>

        <main className="app-main home-main">
          <div className="game-select-screen">
            <div className="game-select-header">
              <h2>🎯 选择你想学习的棋类</h2>
              <p>点击卡片进入，开始你的棋艺之旅吧！</p>
            </div>
            <div className="game-select-cards">
              <button
                className="game-select-card game-card-chess"
                onClick={() => selectGame('chess')}
              >
                <span className="game-card-icon">♔</span>
                <span className="game-card-title">国际象棋</span>
                <span className="game-card-desc">
                  棋子学习 · 规则 · 战术训练 · 人机 / 双人 / 联机对战
                </span>
                <span className="game-card-btn">进入游戏 →</span>
              </button>
              <button
                className="game-select-card game-card-xiangqi"
                onClick={() => selectGame('xiangqi')}
              >
                <span className="game-card-icon">帥</span>
                <span className="game-card-title">中国象棋</span>
                <span className="game-card-desc">
                  规则学习 · 战术训练 · 人机对战 · 双人对战 · 在线联机
                </span>
                <span className="game-card-btn">进入游戏 →</span>
              </button>
              <button
                className="game-select-card game-card-go"
                onClick={() => selectGame('go')}
              >
                <span className="game-card-icon">⚫</span>
                <span className="game-card-title">围棋</span>
                <span className="game-card-desc">
                  规则学习 · 人机对战 · 双人对战 · 在线联机（9/13/19 路）
                </span>
                <span className="game-card-btn">进入游戏 →</span>
              </button>
              <button
                className="game-select-card game-card-gomoku"
                onClick={() => selectGame('gomoku')}
              >
                <span className="game-card-icon">
                  <GomokuLogoIcon size={1.45} />
                </span>
                <span className="game-card-title">五子棋</span>
                <span className="game-card-desc">
                  规则学习 · 人机对战 · 双人对战 · 在线联机（花梨木 3D 棋盘）
                </span>
                <span className="game-card-btn">进入游戏 →</span>
              </button>
            </div>
          </div>
        </main>

        {/* 微信内置浏览器引导页 */}
        {showWeChatGuide && weChatRoom && (
          <WeChatGuide
            roomCode={weChatRoom}
            gameType={weChatGame}
            onClose={() => setShowWeChatGuide(false)}
          />
        )}
      </div>
    );
  }

  // ================================================================
  // 棋类模块界面
  // ================================================================
  return (
    <div className={`app ${isFullscreen ? 'app-fullscreen' : ''}`}>
      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title" onClick={goHome} style={{ cursor: 'pointer' }} title="返回首页">
            <span className="app-logo">{gameType === 'chess' ? '♔' : gameType === 'xiangqi' ? '帥' : gameType === 'go' ? '⚫' : <GomokuLogoIcon size={1.15} />}</span>
            棋乐园
          </h1>
          <span className="app-subtitle">
            {gameType === 'chess' ? '国际象棋' : gameType === 'xiangqi' ? '中国象棋' : gameType === 'go' ? '围棋' : '五子棋'}
          </span>
        </div>
        <div className="header-right">
          {/* 返回首页选择棋类 */}
          <button
            className="home-back-btn"
            onClick={goHome}
            title="返回首页重新选择棋类"
            aria-label="返回首页"
          >
            🏠 首页
          </button>
          <UserProfile progress={progress} compact />
          <button
            className="fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? '退出全屏' : '全屏模式'}
            aria-label={isFullscreen ? '退出全屏' : '全屏模式'}
          >
            {isFullscreen ? '🗗' : '⛶'}
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="app-main">
        <ErrorBoundary key={`${gameType}-${activeTab}`}>
          {renderContent()}
        </ErrorBoundary>
      </main>

      {/* 底部导航栏 */}
      <nav className="app-nav">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`nav-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key as TabKey)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* 微信内置浏览器引导页 */}
      {showWeChatGuide && weChatRoom && (
        <WeChatGuide
          roomCode={weChatRoom}
          gameType={weChatGame}
          onClose={() => setShowWeChatGuide(false)}
        />
      )}
    </div>
  );
};

export default App;
