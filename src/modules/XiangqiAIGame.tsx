/**
 * ChessKids - 中国象棋人机对战模块
 * 参考国际象棋"人机对局"设计：难度可选、走子提示、悔棋（含AI一步）、思考提示
 */
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { XiangqiBoard2D } from '../components/XiangqiBoard2D';
import { ThreeJSXiangqiBoard } from '../components/ThreeJSXiangqiBoard';
import {
  XIANGQI_INITIAL_BOARD,
  cloneXiangqiBoard,
  applyXiangqiMove,
  getAllXiangqiLegalMoves,
  getXiangqiGameStatus,
  getXiangqiMoveNotation,
  findXiangqiKing,
  isXiangqiRed,
} from '../engine/xiangqi';
import { xiangqiBestMove } from '../engine/xiangqiAI';
import type { XiangqiAIDifficulty } from '../engine/xiangqiAI';
import { isXiangqiGameOver } from '../types/xiangqi';
import type {
  XiangqiBoard,
  XiangqiColor,
  XiangqiSquare,
  XiangqiMove,
  XiangqiGameStatus,
  XiangqiMoveHistoryEntry,
} from '../types/xiangqi';
import { supportsWebGL } from '../utils/webgl';

const PLAYER_NAMES: Record<XiangqiColor, string> = { r: '红方', b: '黑方' };
const STATUS_TEXT: Record<XiangqiGameStatus, (turn: XiangqiColor) => string> = {
  playing: (t) => `轮到 ${PLAYER_NAMES[t]} 走棋`,
  check: (t) => `${PLAYER_NAMES[t]} 被将军！`,
  checkmate: (t) => `${PLAYER_NAMES[t === 'r' ? 'b' : 'r']} 获胜！`,
  stalemate: () => '困毙（无子可动，判负）',
  draw: () => '和棋',
};
const DIFF_LABELS: Record<XiangqiAIDifficulty, string> = {
  easy: '入门',
  medium: '中级',
  hard: '高级',
  master: '大师',
};

export const XiangqiAIGame: React.FC = () => {
  const [board, setBoard] = useState<XiangqiBoard>(() => cloneXiangqiBoard(XIANGQI_INITIAL_BOARD));
  const [turn, setTurn] = useState<XiangqiColor>('r');
  const [humanColor, setHumanColor] = useState<XiangqiColor>('r');
  const [difficulty, setDifficulty] = useState<XiangqiAIDifficulty>('medium');
  const [selection, setSelection] = useState<XiangqiSquare | null>(null);
  const [legalTargets, setLegalTargets] = useState<XiangqiSquare[]>([]);
  const [lastMove, setLastMove] = useState<{ from: XiangqiSquare; to: XiangqiSquare } | null>(null);
  const [moveHistory, setMoveHistory] = useState<XiangqiMoveHistoryEntry[]>([]);
  const [moves, setMoves] = useState<XiangqiMove[]>([]);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(supportsWebGL() ? '3d' : '2d');
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<XiangqiSquare[] | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // refs 同步最新状态，供 AI 定时器读取
  const boardRef = useRef(board);
  boardRef.current = board;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const humanRef = useRef(humanColor);
  humanRef.current = humanColor;
  const diffRef = useRef(difficulty);
  diffRef.current = difficulty;

  const status = useMemo<XiangqiGameStatus>(
    () => getXiangqiGameStatus(board, turn),
    [board, turn],
  );
  const checkSquare = useMemo(() => {
    if (status === 'check' || status === 'checkmate') return findXiangqiKing(board, turn);
    return null;
  }, [board, status, turn]);
  const gameOver = isXiangqiGameOver(status);
  const isHumanTurn = turn === humanColor;

  useEffect(() => () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); }, []);

  // 记录走子并更新全部状态（供 AI 与人类共用）
  const commitMove = useCallback((
    b: XiangqiBoard,
    from: XiangqiSquare,
    to: XiangqiSquare,
    movingColor: XiangqiColor,
  ) => {
    const { board: nb, captured } = applyXiangqiMove(b, from, to);
    const piece = b[from[0]][from[1]];
    const record: XiangqiMove = { from, to, piece, captured: captured || undefined };
    const newMoves = [...movesRef.current, record];
    const notation = getXiangqiMoveNotation(piece, from, to, captured);
    setMoveHistory((h) => {
      if (movingColor === 'r') {
        return [...h, { moveNumber: Math.ceil(newMoves.length / 2), red: notation, black: '' }];
      }
      const last = h[h.length - 1];
      if (last && !last.black) return [...h.slice(0, -1), { ...last, black: notation }];
      return h;
    });
    setBoard(nb);
    setMoves(newMoves);
    setLastMove({ from, to });
    setTurn(movingColor === 'r' ? 'b' : 'r');
    setSelection(null);
    setLegalTargets([]);
    setHint(null);
    return nb;
  }, []);

  // 让 AI 走一步（显式传入棋盘与走方，避免依赖未同步的 ref）
  const scheduleAI = useCallback((b: XiangqiBoard, t: XiangqiColor) => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    if (isXiangqiGameOver(getXiangqiGameStatus(b, t))) return;
    setThinking(true);
    aiTimerRef.current = setTimeout(() => {
      const mv = xiangqiBestMove(b, t, diffRef.current);
      setThinking(false);
      if (mv) {
        commitMove(b, mv[0] as XiangqiSquare, mv[1] as XiangqiSquare, t);
      }
    }, 140);
  }, [commitMove]);

  // 人类走子
  const makeHumanMove = (from: XiangqiSquare, to: XiangqiSquare) => {
    if (thinking || gameOver || !isHumanTurn) return;
    const nb = commitMove(board, from, to, turn);
    // AI 应战
    const nextTurn: XiangqiColor = turn === 'r' ? 'b' : 'r';
    if (!isXiangqiGameOver(getXiangqiGameStatus(nb, nextTurn)) && nextTurn !== humanColor) {
      scheduleAI(nb, nextTurn);
    }
  };

  const handleSquareClick = (row: number, col: number) => {
    if (gameOver || thinking || !isHumanTurn) return;
    const piece = board[row][col];
    if (selection && legalTargets.some((t) => t[0] === row && t[1] === col)) {
      makeHumanMove(selection, [row, col]);
      return;
    }
    if (piece && isXiangqiRed(piece) === (humanColor === 'r')) {
      setSelection([row, col]);
      setLegalTargets(
        getAllXiangqiLegalMoves(board, humanColor)
          .filter((m) => m.from[0] === row && m.from[1] === col)
          .map((m) => m.to),
      );
      return;
    }
    setSelection(null);
    setLegalTargets([]);
  };

  const handleReset = (side?: XiangqiColor) => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    const human = side ?? humanRef.current;
    const b = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
    setBoard(b);
    setTurn('r');
    setHumanColor(human);
    setSelection(null);
    setLegalTargets([]);
    setLastMove(null);
    setMoveHistory([]);
    setMoves([]);
    setHint(null);
    setThinking(false);
    // 人类执黑时，AI（红）先走
    if (human === 'b') {
      setTurn('r');
      scheduleAI(b, 'r');
    }
  };

  const handleUndo = () => {
    if (thinking || moves.length === 0) return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    // 人机模式：当前轮到人类（AI 刚走）撤 2 步，否则撤 1 步
    const undoCount = isHumanTurn ? Math.min(2, moves.length) : Math.min(1, moves.length);
    const newMoves = moves.slice(0, moves.length - undoCount);
    let newBoard = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
    for (const m of newMoves) {
      const { board: nb } = applyXiangqiMove(newBoard, m.from, m.to);
      newBoard = nb;
    }
    setBoard(newBoard);
    setMoves(newMoves);
    setTurn(newMoves.length % 2 === 0 ? 'r' : 'b');
    setSelection(null);
    setLegalTargets([]);
    setHint(null);
    setThinking(false);
    setLastMove(newMoves.length > 0
      ? { from: newMoves[newMoves.length - 1].from, to: newMoves[newMoves.length - 1].to }
      : null);
    const history: XiangqiMoveHistoryEntry[] = [];
    for (let i = 0; i < newMoves.length; i += 2) {
      const r = newMoves[i], b2 = newMoves[i + 1];
      history.push({
        moveNumber: i / 2 + 1,
        red: r ? getXiangqiMoveNotation(r.piece, r.from, r.to, r.captured || '') : '',
        black: b2 ? getXiangqiMoveNotation(b2.piece, b2.from, b2.to, b2.captured || '') : '',
      });
    }
    setMoveHistory(history);
  };

  const handleHint = () => {
    if (thinking || gameOver) return;
    const mv = xiangqiBestMove(board, turn, 'hard');
    if (mv) setHint([mv[0] as XiangqiSquare, mv[1] as XiangqiSquare]);
  };

  const newGameDialog = () => {
    const sideChoice = window.confirm('请选择执子方：\n\n确定 = 执红先行\n取消 = 执黑后行');
    handleReset(sideChoice ? 'r' : 'b');
  };

  return (
    <div className="module xiangqi-game">
      <div className="module-header">
        <h2>🤖 中国象棋 · 人机对战</h2>
        <p>和电脑下棋，难度可选，随时悔棋</p>
      </div>
      <div className="game-layout">
        <div className="game-main-area">
          <div className="game-status-bar">
            <span className={`turn-indicator turn-${turn}`}>
              {thinking ? '🤔 电脑思考中…' : STATUS_TEXT[status](turn)}
            </span>
            <div className="game-actions">
              <select
                className="difficulty-select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as XiangqiAIDifficulty)}
                disabled={thinking}
                title="AI 难度"
              >
                {Object.entries(DIFF_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <button className={`action-btn ${viewMode === '3d' ? 'primary' : ''}`} onClick={() => setViewMode('3d')}>🎲 3D</button>
              <button className={`action-btn ${viewMode === '2d' ? 'primary' : ''}`} onClick={() => setViewMode('2d')}>▦ 2D</button>
              <button className="action-btn" onClick={handleUndo} disabled={moves.length === 0 || thinking}>↩ 悔棋</button>
              <button className="action-btn" onClick={handleHint} disabled={thinking || gameOver}>💡 提示</button>
              <button className="action-btn primary" onClick={newGameDialog}>🔄 新对局</button>
            </div>
          </div>
          <div className={`xiangqi-board-host view-${viewMode}`}>
            {viewMode === '3d' ? (
              <ThreeJSXiangqiBoard
                board={board}
                selectedSquare={selection}
                legalTargets={legalTargets}
                lastMove={lastMove}
                checkSquare={checkSquare}
                hint={hint}
                onSquareClick={handleSquareClick}
              />
            ) : (
              <XiangqiBoard2D
                board={board}
                selectedSquare={selection}
                legalTargets={legalTargets}
                lastMove={lastMove}
                checkSquare={checkSquare}
                hint={hint}
                onSquareClick={handleSquareClick}
              />
            )}
          </div>
          {thinking && <div className="thinking-bar">🤔 电脑思考中，请稍候…</div>}
        </div>
        <div className="game-side-panel">
          <div className="side-badge">
            <span>你执：{PLAYER_NAMES[humanColor]}</span>
            <button className="action-btn" onClick={() => handleReset(humanColor === 'r' ? 'b' : 'r')}>
              换边
            </button>
          </div>
          <div className="move-history-panel">
            <h3>走棋记录</h3>
            <div className="move-history-list">
              {moveHistory.length === 0 && <p className="empty-text">尚未走棋</p>}
              {moveHistory.map((entry) => (
                <div key={entry.moveNumber} className="move-history-row">
                  <span className="move-number">{entry.moveNumber}.</span>
                  <span className="move-red">{entry.red}</span>
                  <span className="move-black">{entry.black}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {gameOver && (
        <div className="game-result-modal">
          <div className="result-content">
            <div className="result-icon">
              {status === 'checkmate' && (turn !== humanColor ? '🏆' : '😔')}
              {status === 'stalemate' && '🤝'}
              {status === 'draw' && '🤝'}
            </div>
            <h3 className="result-title">
              {status === 'checkmate' && (turn !== humanColor ? '你获胜了！' : '电脑获胜')}
              {status === 'stalemate' && (turn === humanColor ? '你被困毙，判负' : '电脑被困毙，你获胜！')}
              {status === 'draw' && '和棋'}
            </h3>
            <p className="result-detail">共走了 {moves.length} 步</p>
            <button className="play-again-btn" onClick={() => handleReset()}>再来一局</button>
          </div>
        </div>
      )}
    </div>
  );
};
