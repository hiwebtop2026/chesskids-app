/**
 * ChessKids - 围棋双人对战模块（本地同屏）
 * 黑先白后轮流落子：pass、悔棋、认输、数子判胜负
 */
import React, { useCallback, useState } from 'react';
import { GoBoard } from '../components/GoBoard';
import { ThreeJSGoBoard } from '../components/ThreeJSGoBoard';
import {
  createGoGame, goPlayMove, goPass, isGoGameOver, goCountScore,
  type GoBoardSize, type GoGameState,
} from '../engine/go';
import { supportsWebGL } from '../utils/webgl';

export const GoLocalGame: React.FC = () => {
  const [viewMode, setViewMode] = useState<'2d' | '3d'>(() => (typeof window !== 'undefined' && supportsWebGL() ? '3d' : '2d'));
  const [size, setSize] = useState<GoBoardSize>(9);
  const [started, setStarted] = useState(false);
  const [game, setGame] = useState<GoGameState>(() => createGoGame(9));
  const [result, setResult] = useState<ReturnType<typeof goCountScore> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const finish = (g: GoGameState) => {
    if (isGoGameOver(g)) {
      const c = goCountScore(g.board);
      setResult(c);
    }
  };

  const handleClick = (r: number, c: number) => {
    if (!started || isGoGameOver(game)) return;
    const next = goPlayMove(game, r, c);
    if (!next) { showToast('该位置不能落子（打劫或自杀）'); return; }
    setGame(next);
    finish(next);
  };

  const handlePass = () => {
    if (!started || isGoGameOver(game)) return;
    const next = goPass(game);
    setGame(next);
    finish(next);
  };

  const handleUndo = () => {
    if (game.moves.length === 0) return;
    const keep = game.moves.slice(0, game.moves.length - 1);
    const replay = createGoGame(size);
    let koRef: [number, number] | null = null;
    for (const mv of keep) {
      if (mv.pass) { koRef = null; continue; }
      const next = goPlayMove({ ...replay, ko: koRef }, mv.r, mv.c);
      if (next) { replay.board = next.board; replay.turn = next.turn; koRef = next.ko; }
    }
    replay.moves = keep;
    replay.turn = keep.length % 2 === 0 ? 'b' : 'w';
    replay.passCount = 0;
    replay.ko = koRef;
    setGame(replay);
    setResult(null);
  };

  const handleStart = () => {
    setGame(createGoGame(size));
    setResult(null);
    setStarted(true);
  };

  if (!started) {
    return (
      <div className="module go-game">
        <div className="module-header">
          <h2>👥 双人对局</h2>
          <p>两人同屏轮流落子，黑先白后。</p>
        </div>
        <div className="go-setup-panel">
          <div className="go-setup-row">
            <h3>棋盘大小</h3>
            <div className="go-option-group">
              {([9, 13, 19] as GoBoardSize[]).map((s) => (
                <button key={s} className={`go-opt ${size === s ? 'active' : ''}`} onClick={() => setSize(s)}>{s} 路</button>
              ))}
            </div>
          </div>
          <button className="start-game-btn" onClick={handleStart}>🎮 开始对局</button>
        </div>
      </div>
    );
  }

  const moveCount = game.moves.length;
  const lastMove = moveCount && !game.moves[moveCount - 1].pass
    ? [game.moves[moveCount - 1].r, game.moves[moveCount - 1].c] as [number, number]
    : null;

  return (
    <div className="module go-game">
      <div className="module-header">
        <h2>👥 围棋 · 双人对局</h2>
        <p>{size} 路棋盘 · 轮流落子</p>
      </div>
      <div className="game-layout">
        <div className="game-board-section go-board-section">
          <div className="view-switch-row">
            <button className={`view-tab-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')}>3D 棋盘</button>
            <button className={`view-tab-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')}>2D 棋盘</button>
          </div>
          {viewMode === '3d' ? (
            <ThreeJSGoBoard
              board={game.board}
              size={size}
              lastMove={lastMove}
              territory={result?.territory || null}
              onIntersectionClick={handleClick}
            />
          ) : (
            <GoBoard
              board={game.board}
              size={size}
              lastMove={lastMove}
              territory={result?.territory || null}
              onIntersectionClick={handleClick}
            />
          )}
          {toast && <div className="go-toast">{toast}</div>}
        </div>
        <div className="game-side-panel go-side-panel">
          <div className="go-status-bar">
            <span className={`go-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
            <span>{isGoGameOver(game) ? '对局结束' : game.turn === 'b' ? '黑棋落子' : '白棋落子'}</span>
            <span className="go-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
          </div>
          <div className="go-controls">
            <button className="ctrl-btn" onClick={handlePass} disabled={isGoGameOver(game)}>🙏 Pass</button>
            <button className="ctrl-btn" onClick={handleUndo} disabled={moveCount === 0}>↩️ 悔棋</button>
            <button className="ctrl-btn" onClick={() => { setGame(createGoGame(size)); setResult(null); }}>🔄 重新开始</button>
          </div>
          <div className="go-move-history">
            <h3>落子记录</h3>
            {moveCount === 0 ? <p className="empty-text">暂无落子</p> : (
              <div className="go-move-list">
                {Array.from({ length: Math.ceil(moveCount / 2) }).map((_, i) => {
                  const b = game.moves[i * 2];
                  const w = game.moves[i * 2 + 1];
                  const fmt = (m: GoGameState['moves'][0]) => m.pass ? 'Pass' : `(${m.r + 1},${m.c + 1})${m.captured > 0 ? ' 提' + m.captured : ''}`;
                  return (
                    <div key={i} className="go-move-row">
                      <span className="go-move-no">{i + 1}.</span>
                      <span>{b ? fmt(b) : ''}</span>
                      <span>{w ? fmt(w) : ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {result && (
            <div className="game-result-modal go-result-modal">
              <div className="result-content">
                <button className="result-close-btn" onClick={() => setResult(null)}>✕</button>
                <div className="result-icon">🤝</div>
                <h3 className="result-title">{result.blackWins ? '黑胜' : '白胜'}</h3>
                <p className="result-detail">黑 {Math.floor(result.black)}（子+地） · 白 {Math.floor(result.white - 7.5)}（子+地，贴 7.5 目）</p>
                <button className="play-again-btn" onClick={() => { setGame(createGoGame(size)); setResult(null); }}>再来一局</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoLocalGame;
