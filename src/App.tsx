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
} from './modules';
import { UserProfile, ErrorBoundary } from './components';
import { useProgressStore } from './store';

type GameType = 'chess' | 'xiangqi';
type ChessTabKey = 'learn' | 'rules' | 'tactics' | 'game' | 'local' | 'online' | 'progress';
type XiangqiTabKey = 'xq-rules' | 'xq-ai' | 'xq-local' | 'progress';
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
  { key: 'progress', label: '我的进度', icon: '🏆' },
];

const App: React.FC = () => {
  const [gameType, setGameType] = useState<GameType>('chess');
  const [activeTab, setActiveTab] = useState<TabKey>('learn');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { progress } = useProgressStore();

  const tabs = gameType === 'chess' ? CHESS_TABS : XIANGQI_TABS;

  const switchGame = (type: GameType) => {
    setGameType(type);
    // 切换游戏时切换到对应默认页
    if (type === 'chess') {
      setActiveTab('learn');
    } else {
      setActiveTab('xq-rules');
    }
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
      default:
        return null;
    }
  };

  return (
    <div className={`app ${isFullscreen ? 'app-fullscreen' : ''}`}>
      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">
            <span className="app-logo">{gameType === 'chess' ? '♔' : '帥'}</span>
            ChessKids
          </h1>
          <span className="app-subtitle">
            {gameType === 'chess' ? '国际象棋少儿学堂' : '中国象棋少儿学堂'}
          </span>
        </div>
        <div className="header-right">
          {/* 游戏切换按钮 */}
          <div className="game-switcher">
            <button
              className={`game-switch-btn ${gameType === 'chess' ? 'active' : ''}`}
              onClick={() => switchGame('chess')}
              title="国际象棋"
            >
              ♔ 国际象棋
            </button>
            <button
              className={`game-switch-btn ${gameType === 'xiangqi' ? 'active' : ''}`}
              onClick={() => switchGame('xiangqi')}
              title="中国象棋"
            >
              🐴 中国象棋
            </button>
          </div>
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
