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
} from './modules';
import { UserProfile, ErrorBoundary } from './components';
import { useProgressStore } from './store';

type GameType = 'chess' | 'xiangqi';
type ChessTabKey = 'learn' | 'rules' | 'tactics' | 'game' | 'local' | 'online' | 'progress';
type XiangqiTabKey = 'xq-rules' | 'xq-ai' | 'xq-local' | 'xq-online' | 'progress';
type TabKey = ChessTabKey | XiangqiTabKey;

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
  { key: 'xq-ai', label: '人机对战', icon: '🤖' },
  { key: 'xq-local', label: '双人对战', icon: '👥' },
  { key: 'xq-online', label: '联机对战', icon: '🌐' },
  { key: 'progress', label: '我的进度', icon: '🏆' },
];

const App: React.FC = () => {
  // null = 尚未选择棋类（显示首页选择界面）
  const [gameType, setGameType] = useState<GameType | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('learn');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { progress } = useProgressStore();

  const tabs = gameType === 'chess' ? CHESS_TABS : XIANGQI_TABS;

  /** 首页选择棋类，进入对应模块 */
  const selectGame = (type: GameType) => {
    setGameType(type);
    setActiveTab(type === 'chess' ? 'learn' : 'xq-rules');
  };

  /** 返回首页（重新选择棋类） */
  const goHome = () => {
    setGameType(null);
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      }
    } else {
      const doc = document as any;
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
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
        return <OnlineGame />;
      case 'progress':
        return <ProgressSystem />;
      case 'xq-rules':
        return <XiangqiRulesLearning />;
      case 'xq-ai':
        return <XiangqiAIGame />;
      case 'xq-local':
        return <XiangqiLocalGame />;
      case 'xq-online':
        return <XiangqiOnlineGame />;
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
              ChessKids
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
                  规则学习 · 人机对战 · 双人对战 · 在线联机
                </span>
                <span className="game-card-btn">进入游戏 →</span>
              </button>
            </div>
          </div>
        </main>
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
            <span className="app-logo">{gameType === 'chess' ? '♔' : '帥'}</span>
            ChessKids
          </h1>
          <span className="app-subtitle">
            {gameType === 'chess' ? '国际象棋少儿学堂' : '中国象棋少儿学堂'}
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
    </div>
  );
};

export default App;
