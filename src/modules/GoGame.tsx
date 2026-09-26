/**
 * ChessKids - 围棋人机对战模块
 * 参考国际象棋/中国象棋人机模式：难度/执子/棋盘大小可选、pass、悔棋、提示、历史记录、胜负弹窗
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GoBoard } from '../components/GoBoard';
import {
  createGoGame, goPlayMove, goPass, isGoGameOver, goCountScore, cloneGoBoard,
  type GoBoardSize, type GoColor, type GoGameState,
} from '../engine/go';
import { goBestMove, goHintMove, GO_DIFFICULTIES, type GoDifficulty } from '../engine/goAI';
import { useProgressStore } from '../store/progressStore';

type GoResultInfo = { black: number; white: number; blackWins: boolean; territory: ReturnType<typeof goCountScore>['territory']; detail: string };

export const GoGame: React.FC = () => {
  const { recordGame } = useProgressStore();
  const gameRecorded = useRef(false);

  const [started, setStarted] = useState(false);
  const [size, setSize] = useState<GoBoardSize>(9);
  const [difficulty, setDifficulty] = useState<GoDifficulty>('medium');
  const [humanColor, setHumanColor] = useState<GoColor>('b');
  const [selectedSize, setSelectedSize] = useState<GoBoardSize>(9);
  const [selectedDifficulty, setSelectedDifficulty] = useState<GoDifficulty>('medium');
  const [selectedColor, setSelectedColor] = useState<GoColor>('b');

  const [game, setGame] = useState<GoGameState>(() => createGoGame(9));
  const [aiThinking, setAiThinking] = useState(false);
  const [result, setResult] = useState<GoResultInfo | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [hint, setHint] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const recordResult = useCallback((win: boolean, moves: number, diff: GoDifficulty) => {
    if (gameRecorded.current) return;
    gameRecorded.current = true;
    const score = diff === 'easy' ? 1 : diff === 'medium' ? 2 : diff === 'hard' ? 3 : 4;
    recordGame({
      outcome: win ? 'win' : 'loss',
      difficulty: score as 1 | 2 | 3 | 4 | 5,
      moveCount: moves,
      xpEarned: win ? (score >= 3 ? 60 : 30) : 0,
      date: new Date().toISOString(),
    });
  }, [recordGame]);

  const finishGame = useCallback((g: GoGameState, info: GoResultInfo) => {
    setResult(info);
    setShowResultModal(true);
    const humanWin = info.blackWins === (humanColor === 'b');
    recordResult(humanWin, g.moves.length, difficulty);
  }, [humanColor, difficulty, recordResult]);

  const checkOver = useCallback((g: GoGameState) => {
    if (isGoGameOver(g)) {
      const c = goCountScore(g.board);
      const detail = `黑 ${Math.floor(c.black)}（子+地） · 白 ${Math.floor(c.white - 7.5)}（子+地，贴 7.5 目）`;
      finishGame(g, { ...c, detail });
    }
  }, [finishGame]);

  /** AI 走子 */
  const aiMove = useCallback((g: GoGameState, diff: GoDifficulty) => {
    setAiThinking(true);
    setHint(null);
    aiTimer.current = setTimeout(() => {
      const mv = goBestMove(g.board, g.turn, diff);
      if (mv) {
        const next = goPlayMove(g, mv[0], mv[1]);
        if (next) { setGame(next); checkOver(next); }
        else { const p = goPass(g); setGame(p); checkOver(p); }
      } else {
        const p = goPass(g); setGame(p); checkOver(p);
      }
      setAiThinking(false);
    }, 500);
  }, [checkOver]);

  // 玩家执白（AI 黑先手）：自动开始
  useEffect(() => {
    if (started && humanColor === 'w' && game.moves.length === 0 && game.turn === 'b' && !aiThinking) {
      aiMove(game, difficulty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, humanColor, game.turn, game.moves.length, aiThinking]);

  const handleStart = () => {
    setSize(selectedSize);
    setDifficulty(selectedDifficulty);
    setHumanColor(selectedColor);
    gameRecorded.current = false;
    setResult(null);
    setShowResultModal(false);
    setHint(null);
    setGame(createGoGame(selectedSize));
    setStarted(true);
  };

  const handleReset = () => {
    gameRecorded.current = false;
    setResult(null);
    setShowResultModal(false);
    setHint(null);
    setGame(createGoGame(size));
  };

  const handleIntersection = (r: number, c: number) => {
    if (!started || aiThinking || isGoGameOver(game)) return;
    if (game.turn !== humanColor) return;
    setHint(null);
    const next = goPlayMove(game, r, c);
    if (!next) { showToast('该位置不能落子（打劫或自杀）'); return; }
    setGame(next);
    setTimeout(() => aiMove(next, difficulty), 120);
  };

  const handlePass = () => {
    if (!started || aiThinking || isGoGameOver(game)) return;
    if (game.turn !== humanColor) { showToast('轮到 AI 落子'); return; }
    setHint(null);
    const next = goPass(game);
    setGame(next);
    if (!isGoGameOver(next)) setTimeout(() => aiMove(next, difficulty), 120);
    else checkOver(next);
  };

  const handleResign = () => {
    if (!started || isGoGameOver(game)) return;
    const info: GoResultInfo = { black: 0, white: 0, blackWins: humanColor === 'w', territory: cloneGoBoard(game.board), detail: '认输' };
    setResult(info);
    setShowResultModal(true);
    recordResult(humanColor === 'w', game.moves.length, difficulty);
  };

  const handleUndo = () => {
    if (!started || aiThinking) return;
    if (game.moves.length === 0) return;
    // 悔棋：撤销到"人类上一手"之前（通常撤销 AI 一手 + 人类一手）
    let removeCount = 1;
    if (game.moves.length >= 2) removeCount = 2;
    if (game.moves.length === 1) removeCount = 1;
    const keep = game.moves.slice(0, Math.max(0, game.moves.length - removeCount));
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
    setShowResultModal(false);
    setHint(null);
  };

  const handleHint = () => {
    if (!started || aiThinking || isGoGameOver(game)) return;
    if (game.turn !== humanColor) return;
    const h = goHintMove(game.board, humanColor);
    setHint(h);
  };

  const humanWin = result ? result.blackWins === (humanColor === 'b') : null;
  const moveCount = game.moves.length;

  if (!started) {
    return (
      <div className="module go-game">
        <div className="module-header">
          <h2>⚫ 人机对局</h2>
          <p>选择棋盘、执子与难度，开始一场围棋对局！</p>
        </div>
        <div className="go-setup-panel">
          <div className="go-setup-row">
            <h3>棋盘大小</h3>
            <div className="go-option-group">
              {([9, 13, 19] as GoBoardSize[]).map((s) => (
                <button key={s} className={`go-opt ${selectedSize === s ? 'active' : ''}`} onClick={() => setSelectedSize(s)}>{s} 路</button>
              ))}
            </div>
            <p className="go-setup-hint">9 路适合入门 · 13 路适合进阶 · 19 路为标准对局</p>
          </div>
          <div className="go-setup-row">
            <h3>选择执子</h3>
            <div className="go-option-group">
              <button className={`go-opt ${selectedColor === 'b' ? 'active' : ''}`} onClick={() => setSelectedColor('b')}>⚫ 黑棋（先手）</button>
              <button className={`go-opt ${selectedColor === 'w' ? 'active' : ''}`} onClick={() => setSelectedColor('w')}>⚪ 白棋（后手）</button>
            </div>
          </div>
          <div className="go-setup-row">
            <h3>选择难度</h3>
            <div className="go-option-group">
              {GO_DIFFICULTIES.map((d) => (
                <button key={d.key} className={`go-opt ${selectedDifficulty === d.key ? 'active' : ''}`} onClick={() => setSelectedDifficulty(d.key)}>{d.label}</button>
              ))}
            </div>
            <p className="go-setup-hint">{GO_DIFFICULTIES.find((d) => d.key === selectedDifficulty)?.desc}</p>
          </div>
          <button className="start-game-btn" onClick={handleStart}>🎮 开始对局</button>
        </div>
      </div>
    );
  }

  const diffLabel = GO_DIFFICULTIES.find((d) => d.key === difficulty)?.label || difficulty;
  const lastMove = game.moves.length && !game.moves[game.moves.length - 1].pass
    ? [game.moves[game.moves.length - 1].r, game.moves[game.moves.length - 1].c] as [number, number]
    : null;

  return (
    <div className="module go-game">
      <div className="module-header">
        <h2>⚫ 围棋 · 人机对局</h2>
        <p>你执 {humanColor === 'b' ? '黑棋（先手）' : '白棋（后手）'} · {size} 路 · 难度「{diffLabel}」</p>
      </div>
      <div className="game-layout">
        <div className="game-board-section go-board-section">
          <GoBoard
            board={game.board}
            size={size}
            lastMove={lastMove}
            hintPoint={hint}
            territory={result?.territory || null}
            onIntersectionClick={handleIntersection}
            disabled={aiThinking}
          />
          {aiThinking && (
            <div className="ai-thinking-overlay">
              <div className="thinking-indicator">
                <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
                <p>AI 正在思考...</p>
              </div>
            </div>
          )}
          {toast && <div className="go-toast">{toast}</div>}
        </div>

        <div className="game-side-panel go-side-panel">
          <div className="go-status-bar">
            <span className={`go-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
            <span>{aiThinking ? 'AI 思考中' : isGoGameOver(game) ? '对局结束' : game.turn === humanColor ? '轮到你落子' : '轮到 AI 落子'}</span>
            <span className="go-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
          </div>

          <div className="go-controls">
            <button className="ctrl-btn" onClick={handlePass} disabled={aiThinking || isGoGameOver(game)}>🙏 Pass</button>
            <button className="ctrl-btn" onClick={handleUndo} disabled={aiThinking || moveCount === 0}>↩️ 悔棋</button>
            <button className="ctrl-btn" onClick={handleHint} disabled={aiThinking || isGoGameOver(game)}>💡 提示</button>
            <button className="ctrl-btn danger" onClick={handleResign} disabled={isGoGameOver(game)}>🏳️ 认输</button>
            <button className="ctrl-btn" onClick={handleReset}>🔄 重新开始</button>
          </div>

          <div className="go-rules-tip">
            <p>📖 规则提示</p>
            <ul>
              <li>点击交叉点落子</li>
              <li>无气的棋子会被提走</li>
              <li>打劫不能立即回提</li>
              <li>双方连续 Pass 后数子判胜负</li>
            </ul>
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

          {showResultModal && result && (
            <div className="game-result-modal go-result-modal">
              <div className="result-content">
                <button className="result-close-btn" onClick={() => setShowResultModal(false)}>✕</button>
                <div className="result-icon">{humanWin ? '🎉' : '🤝'}</div>
                <h3 className="result-title">
                  {result.detail === '认输' ? (humanWin ? '对手认输，你赢了！' : '你认输了') : (humanWin ? '你赢了！' : (result.blackWins ? '黑胜' : '白胜'))}
                </h3>
                {result.detail !== '认输' && <p className="result-detail">{result.detail}</p>}
                <p className="result-detail">共 {moveCount} 手{humanWin ? ` (+${difficulty === 'hard' || difficulty === 'master' ? 60 : 30} XP)` : ''}</p>
                <button className="play-again-btn" onClick={handleReset}>再来一局</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoGame;
