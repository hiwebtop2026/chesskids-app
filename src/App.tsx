/**
 * ChessKids - 主应用组件
 * 包含底部导航栏和五大功能模块的路由
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PieceLearning, RulesLearning, TacticsTraining, GamePlay, ProgressSystem, OnlineGame } from './modules';
import { UserProfile } from './components';
import { useProgressStore } from './store';

type TabKey = 'learn' | 'rules' | 'tactics' | 'game' | 'online' | 'progress';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'learn', label: '棋子学习', icon: '♟️' },
  { key: 'rules', label: '规则学习', icon: '📖' },
  { key: 'tactics', label: '战术训练', icon: '🧩' },
  { key: 'game', label: '人机对局', icon: '🤖' },
  { key: 'online', label: '联机对战', icon: '🌐' },
  { key: 'progress', label: '我的进度', icon: '🏆' },
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('learn');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { progress } = useProgressStore();

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

  return (
    <div className={`app ${isFullscreen ? 'app-fullscreen' : ''}`}>
      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">
            <span className="app-logo">♔</span>
            ChessKids
          </h1>
          <span className="app-subtitle">国际象棋少儿学堂</span>
        </div>
        <div className="header-right">
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
        {activeTab === 'learn' && <PieceLearning />}
        {activeTab === 'rules' && <RulesLearning />}
        {activeTab === 'tactics' && <TacticsTraining />}
        {activeTab === 'game' && <GamePlay />}
        {activeTab === 'online' && <OnlineGame />}
        {activeTab === 'progress' && <ProgressSystem />}
      </main>

      {/* 底部导航栏 */}
      <nav className="app-nav">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`nav-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
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
