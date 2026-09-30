/**
 * ChessKids - 五子棋双人对局模块（本地同屏）
 * 黑先白后轮流落子：悔棋、认输、重新开始、2D/3D 切换
 */
import React, { useCallback, useState } from 'react';
import { GomokuBoard } from '../components/GomokuBoard';
import { ThreeJSGomokuBoard } from '../components/ThreeJSGomokuBoard';
import {
  createGomokuGame, gomokuPlayMove, gomokuUndo, findGomokuWinningLine,
  type GomokuColor, type GomokuGameState,
} from '../engine/gomoku';
import { supportsWebGL } from '../utils/webgl';
import { GomokuResultFX } from '../components/GomokuResultFX';
import { playGomokuMove } from '../engine/gomokuSound';

export const GomokuLocalGame: React.FC = () => {
  const [viewMode, setViewMode] = useState<'2d' | '3d'>(() => (typeof window !== 'undefined' && supportsWebGL() ? '3d' : '2d'));
  const [started, setStarted] = useState(false);
  const [game, setGame] = useState<GomokuGameState>(() => createGomokuGame());
  const [result, setResult] = useState<{ winner: GomokuColor | 'draw' | null; winningLine: Array<[number, number]> | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** 浮动状态（棋盘组件上报）：区分内嵌/浮动渲染结算弹窗与按钮 */
  const [floating, setFloating] = useState(false);
  /** 下拉功能面板开关 */
  const [menuOpen, setMenuOpen] = useState(false);
  /** 日夜模式（localStorage 持久化） */
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (typeof localStorage !== 'undefined' ? (localStorage.getItem('gomoku-theme') === 'dark' ? 'dark' : 'light') : 'light'));
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('gomoku-theme', next); } catch { /* ignore */ }
      return next;
    });
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleClick = (r: number, c: number) => {
    if (!started || game.over) return;
    if (menuOpen) setMenuOpen(false);
    const next = gomokuPlayMove(game, r, c);
    if (!next) { showToast('该位置已有棋子'); return; }
    setGame(next);
    playGomokuMove();
    if (next.over) {
      const winningLine = next.winner && next.winner !== 'draw' ? findGomokuWinningLine(next.board, next.winner) : null;
      setResult({ winner: next.winner, winningLine });
    }
  };

  const handleUndo = () => {
    if (game.moves.length === 0) return;
    setGame(gomokuUndo(game, 1));
    setResult(null);
  };

  const handleStart = () => {
    setGame(createGomokuGame());
    setResult(null);
    setStarted(true);
  };

  if (!started) {
    return (
      <div className="module gomoku-game">
        <div className="module-header">
          <h2>👥 五子棋 · 双人对局</h2>
          <p>两人同屏轮流落子，黑先白后，先连成五子者获胜。</p>
        </div>
        <div className="gomoku-setup-panel">
          <button className="start-game-btn" onClick={handleStart}>🎮 开始对局</button>
        </div>
      </div>
    );
  }

  const moveCount = game.moves.length;
  const lastMove = moveCount ? [game.moves[moveCount - 1].r, game.moves[moveCount - 1].c] as [number, number] : null;
  // 提前提取 3D 判断，避免在 JSX 三元分支内被 TS 控制流收窄后再次比较 '3d' 报错
  const is3dView = viewMode === '3d';

  // 游戏时只显示棋盘：顶部仅窄把手，状态胶囊与全部功能按钮收进下拉面板
  const localStatus = (
    <div className="gomoku-float-status">
      <span className={`gomoku-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
      <span>{game.over ? '对局结束' : game.turn === 'b' ? '黑棋落子' : '白棋落子'}</span>
      <span className="gomoku-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
    </div>
  );
  const topHandle = (
    <button className={`gomoku-top-handle ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen((v) => !v)} title="游戏功能" aria-label="游戏功能">☰</button>
  );
  // 下拉功能面板：状态胶囊 + 悔棋/重开/日夜/3D/2D/退出浮动
  const menuPanel = (
    <div className={`gomoku-menu-panel ${menuOpen ? 'open' : ''}`}>
      <div className="gomoku-menu-status">{localStatus}</div>
      <div className="gomoku-menu-grid">
        <button className="gomoku-menu-btn" onClick={handleUndo} disabled={moveCount === 0}>↩️ 悔棋</button>
        <button className="gomoku-menu-btn" onClick={() => { setGame(createGomokuGame()); setResult(null); }}>🔄 重新开始</button>
        <button className="gomoku-menu-btn" onClick={toggleTheme} title="日夜模式切换">{theme === 'dark' ? '☀️ 日间' : '🌙 夜间'}</button>
        <button className={`gomoku-menu-btn ${is3dView ? 'active' : ''}`} onClick={() => setViewMode('3d')}>🀄 3D</button>
        <button className={`gomoku-menu-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')}>📐 2D</button>
      </div>
      {floating && (
        <div className="gomoku-menu-exit-row">
          <button className="gomoku-menu-btn gomoku-menu-exit" onClick={() => setFloating(false)}>⛶ 退出全屏</button>
        </div>
      )}
      <div className="gomoku-menu-hint">点击棋盘任意位置关闭面板</div>
    </div>
  );

  return (
    <div className={`module gomoku-game${theme === 'dark' ? ' gomoku-theme-dark' : ''}`}>
      <div className="module-header">
        <h2>👥 五子棋 · 双人对局</h2>
        <p>19×19 围棋棋盘 · 轮流落子</p>
      </div>
      <div className="game-layout" style={viewMode === '2d' && !floating ? { display: 'flex', justifyContent: 'center' } : undefined}>
        <div className="game-board-section gomoku-board-section" style={viewMode === '2d' && !floating ? { paddingTop: 8, paddingBottom: 8 } : undefined}>
          {viewMode === '3d' ? (
            <ThreeJSGomokuBoard
              board={game.board}
              lastMove={lastMove}
              winningLine={result?.winningLine || null}
              onIntersectionClick={handleClick}
              theme={theme}
            />
          ) : (
            <GomokuBoard
              board={game.board}
              lastMove={lastMove}
              winningLine={result?.winningLine || null}
              onIntersectionClick={handleClick}
              defaultFloating
              theme={theme}
              onFloatChange={setFloating}
            >
              {floating && (
                <div className="gomoku-board-topbar gomoku-float-topbar">{topHandle}</div>
              )}
              {!floating && (
                <div className="gomoku-board-topbar">{topHandle}</div>
              )}
              {menuPanel}
              {result && (
                <div className="gomoku-inboard-modal gomoku-inboard-result-modal">
                  <div className="result-content">
                    <button className="result-close-btn" onClick={() => setResult(null)}>✕</button>
                    <div className="result-icon">{result.winner === 'draw' ? '🤝' : result.winner === 'b' ? '⚫' : '⚪'}</div>
                    <h3 className="result-title">{result.winner === 'draw' ? '和棋' : `${result.winner === 'b' ? '黑棋' : '白棋'}获胜！`}</h3>
                    <p className="result-detail">共 {moveCount} 手</p>
                    <button className="play-again-btn" onClick={() => { setGame(createGomokuGame()); setResult(null); }}>再来一局</button>
                  </div>
                </div>
              )}
              {result && (
                <GomokuResultFX kind={result.winner === 'draw' ? 'draw' : 'win'} label={result.winner === 'draw' ? '和棋' : `${result.winner === 'b' ? '黑棋' : '白棋'}获胜！`} />
              )}
            </GomokuBoard>
          )}
          {toast && <div className="gomoku-toast">{toast}</div>}
        </div>
        {is3dView && (
        <div className="game-side-panel gomoku-side-panel">
          <div className="gomoku-status-bar">
            <span className={`gomoku-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
            <span>{game.over ? '对局结束' : game.turn === 'b' ? '黑棋落子' : '白棋落子'}</span>
            <span className="gomoku-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
          </div>
          <div className="gomoku-controls">
            <button className="ctrl-btn" onClick={handleUndo} disabled={moveCount === 0}>↩️ 悔棋</button>
            <button className="ctrl-btn" onClick={() => { setGame(createGomokuGame()); setResult(null); }}>🔄 重新开始</button>
          </div>
          <div className="gomoku-move-history">
            <h3>落子记录</h3>
            {moveCount === 0 ? <p className="empty-text">暂无落子</p> : (
              <div className="gomoku-move-list">
                {Array.from({ length: Math.ceil(moveCount / 2) }).map((_, i) => {
                  const b = game.moves[i * 2];
                  const w = game.moves[i * 2 + 1];
                  const fmt = (m: GomokuGameState['moves'][0]) => `${m.color === 'b' ? '⚫' : '⚪'}(${m.r + 1},${m.c + 1})`;
                  return (
                    <div key={i} className="gomoku-move-row">
                      <span className="gomoku-move-no">{i + 1}.</span>
                      <span>{b ? fmt(b) : ''}</span>
                      <span>{w ? fmt(w) : ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {is3dView && result && (
            <div className="game-result-modal gomoku-result-modal">
              <div className="result-content">
                <button className="result-close-btn" onClick={() => setResult(null)}>✕</button>
                <div className="result-icon">{result.winner === 'draw' ? '🤝' : result.winner === 'b' ? '⚫' : '⚪'}</div>
                <h3 className="result-title">{result.winner === 'draw' ? '和棋' : `${result.winner === 'b' ? '黑棋' : '白棋'}获胜！`}</h3>
                <p className="result-detail">共 {moveCount} 手</p>
                <button className="play-again-btn" onClick={() => { setGame(createGomokuGame()); setResult(null); }}>再来一局</button>
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GomokuLocalGame;
