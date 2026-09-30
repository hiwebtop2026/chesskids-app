/**
 * ChessKids - 五子棋人机对战模块
 * 难度/执子可选、悔棋、提示、认输、2D/3D 切换、胜负弹窗、落子记录
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GomokuBoard } from '../components/GomokuBoard';
import { ThreeJSGomokuBoard } from '../components/ThreeJSGomokuBoard';
import {
  createGomokuGame, gomokuPlayMove, gomokuUndo, findGomokuWinningLine,
  type GomokuColor, type GomokuGameState,
} from '../engine/gomoku';
import { gomokuBestMove, gomokuHintMove, GOMOKU_DIFFICULTIES, type GomokuDifficulty } from '../engine/gomokuAI';
import { useProgressStore } from '../store/progressStore';
import { GomokuResultFX } from '../components/GomokuResultFX';
import { enterFullscreen } from '../utils/fullscreen';
import { playGomokuMove } from '../engine/gomokuSound';
import {
  loadGomokuMatchHistory, saveGomokuMatchRecord, clearGomokuMatchHistory,
  exportGomokuMatchHistoryJson, genGomokuMatchRecordId,
  type GomokuMatchRecord,
} from '../engine/gomokuMatchHistory';
import { analyzeHistory, saveGomokuLearning, loadGomokuLearning } from '../engine/gomokuLearn';
import type { GomokuLearnData } from '../engine/gomokuAI';

type ResultInfo = { winner: GomokuColor | 'draw' | null; humanWin: boolean; detail: string; winningLine: Array<[number, number]> | null };

export const GomokuGame: React.FC = () => {
  const { recordGame } = useProgressStore();
  const gameRecorded = useRef(false);

  const [started, setStarted] = useState(false);
  const [difficulty, setDifficulty] = useState<GomokuDifficulty>(GOMOKU_DIFFICULTIES[1]);
  const [humanColor, setHumanColor] = useState<GomokuColor>('b');
  const [selectedDifficulty, setSelectedDifficulty] = useState<GomokuDifficulty>(GOMOKU_DIFFICULTIES[1]);
  const [selectedColor, setSelectedColor] = useState<GomokuColor>('b');
  // 默认 2D 棋盘（启动即 2D + 浮动全屏，脱离浏览器布局限制）
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  // 浮动状态（棋盘组件上报）：浮动时用内嵌完整按钮栏+portal全屏弹窗；内嵌时用棋盘上下按钮+容器内弹窗
  const [floating, setFloating] = useState(false);
  /** 日夜模式（localStorage 持久化，三个模式共用） */
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (typeof localStorage !== 'undefined' ? (localStorage.getItem('gomoku-theme') === 'dark' ? 'dark' : 'light') : 'light'));
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('gomoku-theme', next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const [game, setGame] = useState<GomokuGameState>(() => createGomokuGame());
  const [aiThinking, setAiThinking] = useState(false);
  const [result, setResult] = useState<ResultInfo | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [hint, setHint] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [matchHistory, setMatchHistory] = useState<GomokuMatchRecord[]>(() => loadGomokuMatchHistory());
  /** 自学习数据：开局加权 + 防守激进度（随对局记录自动更新） */
  const [learning, setLearning] = useState<GomokuLearnData | null>(() => loadGomokuLearning());
  const [historyOpen, setHistoryOpen] = useState(false);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const recordResult = useCallback((win: boolean, moves: number, diff: GomokuDifficulty) => {
    if (gameRecorded.current) return;
    gameRecorded.current = true;
    const score = diff.key === 'easy' ? 1 : diff.key === 'medium' ? 2 : diff.key === 'hard' ? 3 : 4;
    recordGame({
      outcome: win ? 'win' : 'loss',
      difficulty: score as 1 | 2 | 3 | 4 | 5,
      moveCount: moves,
      xpEarned: win ? (score >= 3 ? 60 : 30) : 0,
      date: new Date().toISOString(),
    });
  }, [recordGame]);

  const finishGame = useCallback((g: GomokuGameState, info: ResultInfo) => {
    setResult(info);
    setShowResultModal(true);
    const humanWin = info.humanWin;
    recordResult(humanWin, g.moves.length, difficulty);
    // 保存近 10 盘对局记录（含完整落子序列，供复盘与 AI 训练参考）
    const rec: GomokuMatchRecord = {
      id: genGomokuMatchRecordId(),
      timestamp: Date.now(),
      difficultyKey: difficulty.key,
      difficultyLabel: difficulty.label,
      humanColor,
      result: info.winner === 'draw' ? 'draw' : humanWin ? 'win' : 'loss',
      totalPlies: g.moves.length,
      moves: g.moves.map((m) => ({ color: m.color, r: m.r, c: m.c })),
    };
    const list = saveGomokuMatchRecord(rec);
    setMatchHistory(list);
    // 自学习：根据最新对局记录刷新开局加权与防守激进度
    setLearning(saveGomokuLearning(analyzeHistory(list)));
  }, [difficulty, humanColor, recordResult]);

  const checkOver = useCallback((g: GomokuGameState) => {
    if (g.over && !result) {
      const last = g.moves[g.moves.length - 1];
      const winningLine = g.winner && g.winner !== 'draw' && last ? findGomokuWinningLine(g.board, g.winner) : null;
      const humanWin = g.winner === humanColor;
      const detail = g.winner === 'draw' ? '棋盘已满，和棋' : g.winner === humanColor ? '你赢了！' : 'AI 获胜';
      finishGame(g, { winner: g.winner, humanWin, detail, winningLine });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishGame, result]);

  /** AI 走棋 */
  const aiMove = useCallback((g: GomokuGameState, diff: GomokuDifficulty) => {
    setAiThinking(true);
    setHint(null);
    aiTimer.current = setTimeout(() => {
      const mv = gomokuBestMove(g.board, g.turn, diff, learning);
      if (mv) {
        const next = gomokuPlayMove(g, mv[0], mv[1]);
        if (next) { setGame(next); playGomokuMove(); checkOver(next); }
      }
      setAiThinking(false);
    }, 400);
  }, [checkOver]);

  // 玩家执白（AI 黑先手）：自动开始
  useEffect(() => {
    if (started && humanColor === 'w' && game.moves.length === 0 && game.turn === 'b' && !aiThinking) {
      aiMove(game, difficulty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, humanColor, game.turn, game.moves.length, aiThinking]);

  const handleStart = () => {
    enterFullscreen(); // 用户手势链内触发全屏，隐藏浏览器窗口
    setDifficulty(selectedDifficulty);
    setHumanColor(selectedColor);
    gameRecorded.current = false;
    setResult(null);
    setShowResultModal(false);
    setHint(null);
    setGame(createGomokuGame());
    setStarted(true);
  };

  const handleReset = () => {
    gameRecorded.current = false;
    setResult(null);
    setShowResultModal(false);
    setHint(null);
    setGame(createGomokuGame());
  };

  const handleIntersection = (r: number, c: number) => {
    if (!started || aiThinking || game.over) return;
    if (game.turn !== humanColor) return;
    setHint(null);
    const next = gomokuPlayMove(game, r, c);
    if (!next) { showToast('该位置已有棋子'); return; }
    setGame(next);
    playGomokuMove();
    if (!next.over) setTimeout(() => aiMove(next, difficulty), 120);
    else checkOver(next);
  };

  const handleResign = () => {
    if (!started || game.over) return;
    const info: ResultInfo = { winner: humanColor === 'b' ? 'w' : 'b', humanWin: false, detail: '认输', winningLine: null };
    setResult(info);
    setShowResultModal(true);
    recordResult(false, game.moves.length, difficulty);
    const rec: GomokuMatchRecord = {
      id: genGomokuMatchRecordId(),
      timestamp: Date.now(),
      difficultyKey: difficulty.key,
      difficultyLabel: difficulty.label,
      humanColor,
      result: 'loss',
      totalPlies: game.moves.length,
      moves: game.moves.map((m) => ({ color: m.color, r: m.r, c: m.c })),
    };
    const list = saveGomokuMatchRecord(rec);
    setMatchHistory(list);
    // 自学习：认输也是输局，同样刷新学习数据
    setLearning(saveGomokuLearning(analyzeHistory(list)));
  };

  const handleUndo = () => {
    if (!started || aiThinking) return;
    if (game.moves.length === 0) return;
    // 悔棋：撤销 AI 一手 + 人类一手
    const removeCount = game.moves.length >= 2 ? 2 : 1;
    setGame(gomokuUndo(game, removeCount));
    setResult(null);
    setShowResultModal(false);
    setHint(null);
  };

  const handleDownloadHistory = () => {
    if (matchHistory.length === 0) return;
    const json = exportGomokuMatchHistoryJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gomoku-match-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleHint = () => {
    if (!started || aiThinking || game.over) return;
    if (game.turn !== humanColor) return;
    const h = gomokuHintMove(game.board, humanColor);
    setHint(h);
  };

  if (!started) {
    return (
      <div className="module gomoku-game">
        <div className="module-header">
          <h2>⚫ 五子棋 · 人机对战</h2>
          <p>选择执子与难度，开始一场五子棋对局！</p>
        </div>
        <div className="gomoku-setup-panel">
          <div className="gomoku-setup-row">
            <h3>选择执子</h3>
            <div className="gomoku-option-group">
              <button className={`gomoku-opt ${selectedColor === 'b' ? 'active' : ''}`} onClick={() => setSelectedColor('b')}>⚫ 黑棋（先手）</button>
              <button className={`gomoku-opt ${selectedColor === 'w' ? 'active' : ''}`} onClick={() => setSelectedColor('w')}>⚪ 白棋（后手）</button>
            </div>
          </div>
          <div className="gomoku-setup-row">
            <h3>选择难度</h3>
            <div className="gomoku-option-group">
              {GOMOKU_DIFFICULTIES.map((d) => (
                <button key={d.key} className={`gomoku-opt ${selectedDifficulty.key === d.key ? 'active' : ''}`} onClick={() => setSelectedDifficulty(d)}>{d.label}</button>
              ))}
            </div>
            <p className="gomoku-setup-hint">{selectedDifficulty.desc}</p>
          </div>
          <button className="start-game-btn" onClick={handleStart}>🎮 开始对局</button>
        </div>
      </div>
    );
  }

  const diffLabel = difficulty.label;
  const lastMove = game.moves.length ? [game.moves[game.moves.length - 1].r, game.moves[game.moves.length - 1].c] as [number, number] : null;
  const humanWin = result ? result.humanWin : null;
  const moveCount = game.moves.length;

  // 2D/3D 切换：集成到棋盘容器按钮栏（浮动全屏下也可操作）
  const viewSwitchCtrl = (
    <div className="view-switch-inboard">
      <button className={`view-tab-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')} title="切换 3D 棋盘">🀄 3D</button>
      <button className={`view-tab-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')} title="切换 2D 棋盘">📐 2D</button>
    </div>
  );

  // 功能按钮：2D 内嵌到棋盘容器下方（3D/2D 切换与功能按钮同排一体）；3D 显示在侧栏。
  // 3D 模式下侧栏顶部已渲染 viewSwitchCtrl，此处不再重复（修复 3D 出现两套切换按钮的 bug）。
  const ctrlButtons = (
    <div className="gomoku-controls gomoku-inboard-controls">
      {viewMode === '2d' && viewSwitchCtrl}
      <button className="ctrl-btn" onClick={handleUndo} disabled={aiThinking || moveCount === 0}>↩️ 悔棋</button>
      <button className="ctrl-btn" onClick={handleHint} disabled={aiThinking || game.over}>💡 提示</button>
      <button className="ctrl-btn danger" onClick={handleResign} disabled={game.over}>🏳️ 认输</button>
      <button className="ctrl-btn" onClick={handleReset}>🔄 重新开始</button>
      <button className="ctrl-btn" onClick={() => setHistoryOpen(true)}>📁 记录</button>
      <button className="ctrl-btn" onClick={toggleTheme} title="日夜模式切换">{theme === 'dark' ? '☀️ 日间' : '🌙 夜间'}</button>
    </div>
  );

  // 浮动全屏时的顶部状态胶囊（棋盘容器内嵌，脱离侧栏）
  const floatStatus = (
    <div className="gomoku-float-status">
      <span className={`gomoku-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
      <span>{aiThinking ? 'AI 思考中…' : game.over ? '对局结束' : game.turn === humanColor ? '轮到你落子' : '轮到 AI 落子'}</span>
      <span className="gomoku-float-status-pill">执{humanColor === 'b' ? '黑' : '白'} · {diffLabel}</span>
      <span className="gomoku-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
    </div>
  );

  // 内嵌模式（非浮动）棋盘上方按钮：左悔棋、右提示（游戏时只显示棋盘，功能按钮集成棋盘上下）
  const inBoardTopBar = (
    <div className="gomoku-board-topbar">
      <button className="gomoku-corner-btn" onClick={handleUndo} disabled={aiThinking || moveCount === 0} title="悔棋">↩️ 悔棋</button>
      <button className="gomoku-corner-btn" onClick={handleHint} disabled={aiThinking || game.over} title="提示">💡 提示</button>
    </div>
  );
  // 内嵌模式棋盘下方按钮：左 3D、右 2D 切换
  const inBoardBottomBar = (
    <div className="gomoku-board-bottombar">
      <button className={`gomoku-corner-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')} title="切换 3D 棋盘">🀄 3D</button>
      <button className={`gomoku-corner-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')} title="切换 2D 棋盘">📐 2D</button>
    </div>
  );

  // 内嵌模式（非浮动）结算弹窗：只在棋盘容器内显示（不叠加到浏览器窗口/侧栏，避免重复）
  const inBoardResultModal = showResultModal && result && (
    <div className="gomoku-inboard-modal gomoku-inboard-result-modal">
      <div className="result-content">
        <button className="result-close-btn" onClick={() => setShowResultModal(false)}>✕</button>
        <div className="result-icon">{result.detail === '认输' ? '😢' : humanWin ? '🎉' : result.winner === 'draw' ? '🤝' : '😔'}</div>
        <h3 className="result-title">{result.detail}</h3>
        <p className="result-detail">共 {moveCount} 手{humanWin ? ` (+${difficulty.key === 'hard' || difficulty.key === 'master' ? 60 : 30} XP)` : ''}</p>
        <button className="play-again-btn" onClick={handleReset}>再来一局</button>
      </div>
    </div>
  );

  // 内嵌模式（非浮动）对局记录弹窗：棋盘容器内显示
  const inBoardHistoryModal = historyOpen && (
    <div className="gomoku-inboard-modal gomoku-inboard-history-modal" onClick={() => setHistoryOpen(false)}>
      <div className="gomoku-history-modal-inner" onClick={(e) => e.stopPropagation()}>
        <div className="gomoku-history-modal-header">
          <h3>📁 对局记录（近 {matchHistory.length}/10 盘）</h3>
          <button className="result-close-btn" onClick={() => setHistoryOpen(false)}>✕</button>
        </div>
        {matchHistory.length === 0 ? (
          <p className="empty-text">暂无对局记录，下完一盘棋后自动保存</p>
        ) : (
          <div className="gomoku-history-list">
            {matchHistory.map((r) => (
              <div key={r.id} className="gomoku-history-item">
                <span className={`gomoku-history-result ${r.result}`}>{r.result === 'win' ? '胜' : r.result === 'loss' ? '负' : '和'}</span>
                <span className="gomoku-history-diff">{r.difficultyLabel}</span>
                <span className="gomoku-history-color">{r.humanColor === 'b' ? '执黑' : '执白'}</span>
                <span className="gomoku-history-plies">{r.totalPlies} 手</span>
                <span className="gomoku-history-time">{new Date(r.timestamp).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
        <div className="gomoku-history-actions">
          <button className="history-btn" onClick={handleDownloadHistory} disabled={matchHistory.length === 0}>⬇ 下载 JSON</button>
          <button className="history-btn danger" onClick={() => setMatchHistory(clearGomokuMatchHistory())} disabled={matchHistory.length === 0}>🗑 清空记录</button>
        </div>
      </div>
    </div>
  );

  // 浮动全屏时的胜负弹窗（原侧栏弹窗在浮动模式下被遮罩隐藏，此处内嵌到棋盘容器）
  const floatResultModal = showResultModal && result && createPortal(
    <div className="gomoku-float-modal gomoku-float-result-modal" style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, width: '100%', height: '100%', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 71 }}>
      <div className="result-content">
        <button className="result-close-btn" onClick={() => setShowResultModal(false)}>✕</button>
        <div className="result-icon">{result.detail === '认输' ? '😢' : humanWin ? '🎉' : result.winner === 'draw' ? '🤝' : '😔'}</div>
        <h3 className="result-title">{result.detail}</h3>
        <p className="result-detail">共 {moveCount} 手{humanWin ? ` (+${difficulty.key === 'hard' || difficulty.key === 'master' ? 60 : 30} XP)` : ''}</p>
        <button className="play-again-btn" onClick={handleReset}>再来一局</button>
      </div>
    </div>,
    document.body
  );

  // 浮动全屏时的对局记录弹窗（点击遮罩关闭）
  const floatHistoryModal = historyOpen && createPortal(
    <div className="gomoku-float-modal gomoku-float-history-modal" onClick={() => setHistoryOpen(false)} style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, width: '100%', height: '100%', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 71 }}>
      <div className="gomoku-history-modal-inner" onClick={(e) => e.stopPropagation()}>
        <div className="gomoku-history-modal-header">
          <h3>📁 对局记录（近 {matchHistory.length}/10 盘）</h3>
          <button className="result-close-btn" onClick={() => setHistoryOpen(false)}>✕</button>
        </div>
        {matchHistory.length === 0 ? (
          <p className="empty-text">暂无对局记录，下完一盘棋后自动保存</p>
        ) : (
          <div className="gomoku-history-list">
            {matchHistory.map((r) => (
              <div key={r.id} className="gomoku-history-item">
                <span className={`gomoku-history-result ${r.result}`}>{r.result === 'win' ? '胜' : r.result === 'loss' ? '负' : '和'}</span>
                <span className="gomoku-history-diff">{r.difficultyLabel}</span>
                <span className="gomoku-history-color">{r.humanColor === 'b' ? '执黑' : '执白'}</span>
                <span className="gomoku-history-plies">{r.totalPlies} 手</span>
                <span className="gomoku-history-time">{new Date(r.timestamp).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
        <div className="gomoku-history-actions">
          <button className="history-btn" onClick={handleDownloadHistory} disabled={matchHistory.length === 0}>⬇ 下载 JSON</button>
          <button className="history-btn danger" onClick={() => setMatchHistory(clearGomokuMatchHistory())} disabled={matchHistory.length === 0}>🗑 清空记录</button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className={`module gomoku-game${theme === 'dark' ? ' gomoku-theme-dark' : ''}`}>
      <div className="module-header">
        <h2>⚫ 五子棋 · 人机对局</h2>
        <p>你执 {humanColor === 'b' ? '黑棋（先手）' : '白棋（后手）'} · 难度「{diffLabel}」</p>
      </div>
      <div className="game-layout" style={viewMode === '2d' && !floating ? { display: 'flex', justifyContent: 'center' } : undefined}>
        <div className="game-board-section gomoku-board-section" style={viewMode === '2d' && !floating ? { paddingTop: 104, paddingBottom: 76 } : undefined}>
          {viewMode === '3d' ? (
            <ThreeJSGomokuBoard
              board={game.board}
              lastMove={lastMove}
              hintPoint={hint}
              winningLine={result?.winningLine || null}
              onIntersectionClick={handleIntersection}
              disabled={aiThinking}
              flipped={humanColor === 'w'}
              theme={theme}
            />
          ) : (
            <GomokuBoard
              board={game.board}
              lastMove={lastMove}
              hintPoint={hint}
              winningLine={result?.winningLine || null}
              onIntersectionClick={handleIntersection}
              disabled={aiThinking}
              flipped={humanColor === 'w'}
              defaultFloating
              theme={theme}
              onFloatChange={setFloating}
            >
              {viewMode === '2d' && floatStatus}
              {viewMode === '2d' && !floating && inBoardTopBar}
              {viewMode === '2d' && !floating && inBoardBottomBar}
              {viewMode === '2d' && floating && ctrlButtons}
              {viewMode === '2d' && floating && floatResultModal}
              {viewMode === '2d' && !floating && inBoardResultModal}
              {viewMode === '2d' && floating && floatHistoryModal}
              {viewMode === '2d' && !floating && inBoardHistoryModal}
              {result && showResultModal && (
                <GomokuResultFX kind={result.humanWin ? 'win' : result.winner === 'draw' ? 'draw' : 'lose'} label={result.detail} />
              )}
            </GomokuBoard>
          )}
          {aiThinking && (
            <div className="ai-thinking-overlay">
              <div className="thinking-indicator">
                <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
                <p>AI 正在思考...</p>
              </div>
            </div>
          )}
          {toast && <div className="gomoku-toast">{toast}</div>}
          {viewMode === '3d' && result && showResultModal && (
            <GomokuResultFX kind={result.humanWin ? 'win' : result.winner === 'draw' ? 'draw' : 'lose'} label={result.detail} />
          )}
        </div>

        {viewMode === '3d' && (
          <div className="game-side-panel gomoku-side-panel">
            <div className="gomoku-status-bar">
              <span className={`gomoku-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
              <span>{aiThinking ? 'AI 思考中' : game.over ? '对局结束' : game.turn === humanColor ? '轮到你落子' : '轮到 AI 落子'}</span>
              <span className="gomoku-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
            </div>

          {viewSwitchCtrl}
          {viewMode === '3d' && ctrlButtons}

          <div className="gomoku-rules-tip">
            <p>📖 规则提示</p>
            <ul>
              <li>黑白双方轮流落子</li>
              <li>横、竖、斜任意方向连成五子即获胜</li>
              <li>棋盘下满仍未分胜负则为和棋</li>
            </ul>
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

          {showResultModal && result && (
            <div className="game-result-modal gomoku-result-modal">
              <div className="result-content">
                <button className="result-close-btn" onClick={() => setShowResultModal(false)}>✕</button>
                <div className="result-icon">{result.detail === '认输' ? '😢' : humanWin ? '🎉' : result.winner === 'draw' ? '🤝' : '😔'}</div>
                <h3 className="result-title">{result.detail}</h3>
                <p className="result-detail">共 {moveCount} 手{humanWin ? ` (+${difficulty.key === 'hard' || difficulty.key === 'master' ? 60 : 30} XP)` : ''}</p>
                <button className="play-again-btn" onClick={handleReset}>再来一局</button>
              </div>
            </div>
          )}

          {historyOpen && (
            <div className="gomoku-history-modal" onClick={() => setHistoryOpen(false)}>
              <div className="gomoku-history-modal-inner" onClick={(e) => e.stopPropagation()}>
                <div className="gomoku-history-modal-header">
                  <h3>📁 对局记录（近 {matchHistory.length}/10 盘）</h3>
                  <button className="result-close-btn" onClick={() => setHistoryOpen(false)}>✕</button>
                </div>
                {matchHistory.length === 0 ? (
                  <p className="empty-text">暂无对局记录，下完一盘棋后自动保存</p>
                ) : (
                  <div className="gomoku-history-list">
                    {matchHistory.map((r) => (
                      <div key={r.id} className="gomoku-history-item">
                        <span className={`gomoku-history-result ${r.result}`}>{r.result === 'win' ? '胜' : r.result === 'loss' ? '负' : '和'}</span>
                        <span className="gomoku-history-diff">{r.difficultyLabel}</span>
                        <span className="gomoku-history-color">{r.humanColor === 'b' ? '执黑' : '执白'}</span>
                        <span className="gomoku-history-plies">{r.totalPlies} 手</span>
                        <span className="gomoku-history-time">{new Date(r.timestamp).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="gomoku-history-actions">
                  <button className="history-btn" onClick={handleDownloadHistory} disabled={matchHistory.length === 0}>⬇ 下载 JSON</button>
                  <button className="history-btn danger" onClick={() => setMatchHistory(clearGomokuMatchHistory())} disabled={matchHistory.length === 0}>🗑 清空记录</button>
                </div>
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GomokuGame;
