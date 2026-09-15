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
import { xiangqiBestMoveAsync } from '../utils/xiangqiAIAsync';
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
import { BoardFloatingWindow } from '../components/BoardFloatingWindow';

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
  const webglOk = useMemo(() => supportsWebGL(), []); // 3D 按钮可用性（避免切 3D 后崩溃）
  const [isFloating, setIsFloating] = useState(false);
  const board3dRef = useRef<any>(null);

  /** 切换浮动窗口（腾讯棋牌风格：独立可拖拽窗口，不再自动占用浏览器全屏） */
  const toggleFloat = () => {
    setIsFloating((prev) => !prev);
  };

  /** ESC 键退出浮动模式 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFloating) {
        setIsFloating(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFloating]);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<XiangqiSquare[] | null>(null);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiCancelledRef = useRef(false);
  const aiGenRef = useRef(0); // AI 请求世代号：重置/换边后使在途计算结果失效，防止串局

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

  useEffect(() => {
    aiCancelledRef.current = false;
    return () => {
      aiCancelledRef.current = true;
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

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
  // 计算放在 Web Worker 中异步执行，困难/大师难度不再冻结主线程（防止"卡死/闪退"）
  const scheduleAI = useCallback((b: XiangqiBoard, t: XiangqiColor) => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    if (isXiangqiGameOver(getXiangqiGameStatus(b, t))) return;
    const gen = ++aiGenRef.current;
    setThinking(true);
    aiTimerRef.current = setTimeout(async () => {
      if (aiCancelledRef.current || gen !== aiGenRef.current) return;
      let mv: XiangqiSquare[] | null = null;
      try {
        mv = await xiangqiBestMoveAsync(b, t, diffRef.current);
      } catch (err) {
        console.error('[XiangqiAI] AI 计算失败:', err);
      }
      if (aiCancelledRef.current || gen !== aiGenRef.current) return;
      setThinking(false);
      if (mv) {
        commitMove(b, mv[0] as XiangqiSquare, mv[1] as XiangqiSquare, t);
      } else {
        setThinking(false);
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
    aiGenRef.current++; // 使在途 AI 计算结果失效，避免串到新对局
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

  const handleHint = async () => {
    if (thinking || gameOver) return;
    setThinking(true);
    try {
      const mv = await xiangqiBestMoveAsync(board, turn, 'hard');
      if (mv) setHint([mv[0] as XiangqiSquare, mv[1] as XiangqiSquare]);
    } catch (err) {
      console.error('[XiangqiAI] 提示计算失败:', err);
    } finally {
      setThinking(false);
    }
  };

  const newGameDialog = () => {
    const sideChoice = window.confirm('请选择执子方：\n\n确定 = 执红先行\n取消 = 执黑后行');
    handleReset(sideChoice ? 'r' : 'b');
  };

  // 棋盘内悬浮控制条（功能按钮集成到棋盘容器，参考腾讯棋牌）
  const viewControls = (
    <div className="board-view-controls">
      <button className={`view-ctrl-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')} disabled={!webglOk} title={webglOk ? '3D 视图' : '当前设备不支持 3D 渲染'}>🎲 3D</button>
      <button className={`view-ctrl-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')} title="2D 视图">▦ 2D</button>
      <button className="view-ctrl-btn" onClick={() => board3dRef.current?.resetView?.()} disabled={viewMode !== '3d'} title="复位视角">↺</button>
      <button className="view-ctrl-btn" onClick={() => setBoardFlipped(f => !f)} disabled={viewMode === '3d'} title="翻转棋盘视角">⇅</button>
      <button className={`view-ctrl-btn ${isFloating ? 'active' : ''}`} onClick={toggleFloat} title={isFloating ? '退出浮动窗口' : '浮动窗口'}>
        {isFloating ? '🗗' : '⛶'}
      </button>
    </div>
  );

  // 棋盘区域（含悬浮控制条），正常模式与浮动窗口共用
  const boardArea = (
    <div className={`xiangqi-board-host view-${viewMode}`}>
      {viewControls}
      {viewMode === '3d' ? (
        <ThreeJSXiangqiBoard
          board={board}
          selectedSquare={selection}
          legalTargets={legalTargets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hint={hint}
          onSquareClick={handleSquareClick}
          onReady={(api) => { board3dRef.current = api; }}
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
          flipped={boardFlipped}
          zoomable={true}
        />
      )}
    </div>
  );

  // 对局结果弹窗（正常模式与浮动窗口共用）
  const resultModal = gameOver ? (
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
  ) : null;

  // ================================================================
  // 对局内容
  // ================================================================
  const gameContent = (
    <>
      <div className={`game-layout ${isFloating ? 'game-layout-floating' : ''}`}>
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
              <button className="action-btn" onClick={handleUndo} disabled={moves.length === 0 || thinking}>↩ 悔棋</button>
              <button className="action-btn" onClick={handleHint} disabled={thinking || gameOver}>💡 提示</button>
              <button className="action-btn primary" onClick={newGameDialog}>🔄 新对局</button>
            </div>
          </div>
          {boardArea}
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
      {resultModal}
    </>
  );

  // 浮动窗口模式（腾讯棋牌风格：独立可拖拽窗口，可缩放、可全屏）
  if (isFloating) {
    return (
      <BoardFloatingWindow title="🤖 中国象棋 · 人机对战" onClose={toggleFloat}>
        <div className="float-status-bar">
          <span className="float-status-turn">
            {thinking ? '🤔 电脑思考中…' : STATUS_TEXT[status](turn)}
          </span>
          <span className="float-status-diff">难度：{DIFF_LABELS[difficulty]}</span>
        </div>
        {boardArea}
        {thinking && <div className="thinking-bar">🤔 电脑思考中，请稍候…</div>}
        {resultModal}
      </BoardFloatingWindow>
    );
  }

  // 正常模式
  return (
    <div className="module xiangqi-game">
      <div className="module-header">
        <h2>🤖 中国象棋 · 人机对战</h2>
        <p>和电脑下棋，难度可选，随时悔棋</p>
      </div>
      {gameContent}
    </div>
  );
};
