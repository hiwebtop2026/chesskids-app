/**
 * ChessKids - 中国象棋双人对战模块
 * 两位玩家在同一设备上轮流走棋
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { XiangqiBoard2D, type XiangqiBoard2DHandle } from '../components/XiangqiBoard2D';
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

const PLAYER_NAMES: Record<XiangqiColor, string> = {
  r: '红方',
  b: '黑方',
};

const STATUS_TEXT: Record<XiangqiGameStatus, (turn: XiangqiColor) => string> = {
  playing: (t) => `轮到 ${PLAYER_NAMES[t]} 走棋`,
  check: (t) => `${PLAYER_NAMES[t]} 被将军！`,
  checkmate: (t) => `${PLAYER_NAMES[t === 'r' ? 'b' : 'r']} 获胜！`,
  stalemate: () => '困毙（和棋）',
  draw: () => '和棋',
};

export const XiangqiLocalGame: React.FC = () => {
  const [board, setBoard] = useState<XiangqiBoard>(() =>
    cloneXiangqiBoard(XIANGQI_INITIAL_BOARD),
  );
  const [turn, setTurn] = useState<XiangqiColor>('r'); // 红方先行
  const [selection, setSelection] = useState<XiangqiSquare | null>(null);
  const [legalTargets, setLegalTargets] = useState<XiangqiSquare[]>([]);
  const [lastMove, setLastMove] = useState<{ from: XiangqiSquare; to: XiangqiSquare } | null>(null);
  const [moveHistory, setMoveHistory] = useState<XiangqiMoveHistoryEntry[]>([]);
  const [moves, setMoves] = useState<XiangqiMove[]>([]);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(supportsWebGL() ? '3d' : '2d');
  const webglOk = useMemo(() => supportsWebGL(), []); // 3D 按钮可用性
  const [isFloating, setIsFloating] = useState(false);
  const board3dRef = useRef<any>(null);
  const board2dRef = useRef<XiangqiBoard2DHandle>(null);

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

  const status = useMemo<XiangqiGameStatus>(
    () => getXiangqiGameStatus(board, turn),
    [board, turn],
  );

  const checkSquare = useMemo(() => {
    if (status === 'check' || status === 'checkmate') {
      return findXiangqiKing(board, turn);
    }
    return null;
  }, [board, status, turn]);

  const handleSquareClick = (row: number, col: number) => {
    if (isXiangqiGameOver(status)) return;

    const piece = board[row][col];

    // 如果已选中棋子，且点击的是可走位置 → 走棋
    if (selection && legalTargets.some((t) => t[0] === row && t[1] === col)) {
      makeMove(selection, [row, col]);
      return;
    }

    // 如果点击己方棋子 → 选中
    if (piece && ((turn === 'r' && isXiangqiRed(piece)) || (turn === 'b' && !isXiangqiRed(piece)))) {
      setSelection([row, col]);
      const allLegal = getAllXiangqiLegalMoves(board, turn);
      const targets = allLegal
        .filter((m) => m.from[0] === row && m.from[1] === col)
        .map((m) => m.to);
      setLegalTargets(targets);
      return;
    }

    // 其他情况 → 取消选中
    setSelection(null);
    setLegalTargets([]);
  };

  const makeMove = (from: XiangqiSquare, to: XiangqiSquare) => {
    const { board: newBoard, captured } = applyXiangqiMove(board, from, to);
    const piece = board[from[0]][from[1]];

    const move: XiangqiMove = {
      from,
      to,
      piece,
      captured: captured || undefined,
    };

    setBoard(newBoard);
    setMoves((m) => [...m, move]);
    setLastMove({ from, to });
    setSelection(null);
    setLegalTargets([]);
    setTurn(turn === 'r' ? 'b' : 'r');

    // 记录到历史
    const moveNum = moves.length + 1;
    const notation = getXiangqiMoveNotation(piece, from, to, captured);
    if (turn === 'r') {
      setMoveHistory((h) => [
        ...h,
        { moveNumber: Math.ceil(moveNum / 2), red: notation, black: '' },
      ]);
    } else {
      setMoveHistory((h) => {
        const last = h[h.length - 1];
        if (last && !last.black) {
          return [...h.slice(0, -1), { ...last, black: notation }];
        }
        return h;
      });
    }
  };

  const handleReset = () => {
    setBoard(cloneXiangqiBoard(XIANGQI_INITIAL_BOARD));
    setTurn('r');
    setSelection(null);
    setLegalTargets([]);
    setLastMove(null);
    setMoveHistory([]);
    setMoves([]);
  };

  const handleUndo = () => {
    if (moves.length === 0) return;
    // 简单重放：重新从头走，去掉最后一步
    const newMoves = moves.slice(0, -1);
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
    setLastMove(newMoves.length > 0 ? { from: newMoves[newMoves.length - 1].from, to: newMoves[newMoves.length - 1].to } : null);
    // 重建历史
    const history: XiangqiMoveHistoryEntry[] = [];
    for (let i = 0; i < newMoves.length; i += 2) {
      const red = newMoves[i];
      const black = newMoves[i + 1];
      history.push({
        moveNumber: i / 2 + 1,
        red: red ? getXiangqiMoveNotation(red.piece, red.from, red.to, red.captured || '') : '',
        black: black ? getXiangqiMoveNotation(black.piece, black.from, black.to, black.captured || '') : '',
      });
    }
    setMoveHistory(history);
  };

  const gameOver = isXiangqiGameOver(status);

  // 棋盘功能按钮栏（与上方功能按钮分区排列，不再悬浮遮挡棋盘）
  // 分区：① 视图切换（3D/2D）② 视角（复位）③ 缩放（2D）④ 浮动窗口
  const viewActions = (
    <div className="view-actions-bar">
      <div className="view-action-group">
        <button
          className={`view-tab-btn ${viewMode === '3d' ? 'active' : ''}`}
          onClick={() => setViewMode('3d')}
          disabled={!webglOk}
          title={webglOk ? '3D 视图' : '当前设备不支持 3D 渲染'}
        >
          🎲 3D
        </button>
        <button
          className={`view-tab-btn ${viewMode === '2d' ? 'active' : ''}`}
          onClick={() => setViewMode('2d')}
          title="2D 视图"
        >
          ▦ 2D
        </button>
      </div>
      <div className="view-action-group">
        <button
          className="view-tab-btn"
          onClick={() => {
            if (viewMode === '3d') board3dRef.current?.resetView?.();
            else board2dRef.current?.resetZoom();
          }}
          title="复位视角"
        >
          ↺ 复位
        </button>
      </div>
      <div className="view-action-group">
        <button className="view-tab-btn" onClick={() => board2dRef.current?.zoomIn()} disabled={viewMode !== '2d'} title="放大棋盘">
          ＋
        </button>
        <button className="view-tab-btn" onClick={() => board2dRef.current?.zoomOut()} disabled={viewMode !== '2d'} title="缩小棋盘">
          －
        </button>
      </div>
      {!isFloating && (
        <div className="view-action-group">
          <button className="view-tab-btn" onClick={toggleFloat} title="浮动窗口">
            ⛶ 浮动
          </button>
        </div>
      )}
    </div>
  );

  // 棋盘区域（功能按钮已移入上方工具栏，棋盘内不再悬浮任何控件）
  const boardArea = (
    <div className={`xiangqi-board-host view-${viewMode}`}>
      {viewMode === '3d' ? (
        <ThreeJSXiangqiBoard
          board={board}
          selectedSquare={selection}
          legalTargets={legalTargets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hint={null}
          onSquareClick={handleSquareClick}
          onReady={(api) => { board3dRef.current = api; }}
        />
      ) : (
        <XiangqiBoard2D
          ref={board2dRef}
          board={board}
          selectedSquare={selection}
          legalTargets={legalTargets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hint={null}
          onSquareClick={handleSquareClick}
          zoomable={true}
          zoomControls={false}
        />
      )}
    </div>
  );

  // 对局结果弹窗（正常模式与浮动窗口共用）
  const resultModal = gameOver ? (
    <div className="game-result-modal">
      <div className="result-content">
        <div className="result-icon">
          {status === 'checkmate' && '🏆'}
          {status === 'stalemate' && '🤝'}
          {status === 'draw' && '🤝'}
        </div>
        <h3 className="result-title">
          {status === 'checkmate' && PLAYER_NAMES[turn === 'r' ? 'b' : 'r'] + ' 获胜！'}
          {status === 'stalemate' && '困毙（和棋）'}
          {status === 'draw' && '和棋'}
        </h3>
        <p className="result-detail">共走了 {moves.length} 步</p>
        <button className="play-again-btn" onClick={handleReset}>
          再来一局
        </button>
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
              {STATUS_TEXT[status](turn)}
            </span>
            <div className="game-actions">
              <button className="action-btn" onClick={handleUndo} disabled={moves.length === 0}>
                ↩ 悔棋
              </button>
              <button className="action-btn primary" onClick={handleReset}>
                🔄 重新开始
              </button>
            </div>
          </div>

          {viewActions}
          {boardArea}
        </div>

        <div className="game-side-panel">
          <div className="move-history-panel">
            <h3>走棋记录</h3>
            <div className="move-history-list">
              {moveHistory.length === 0 && (
                <p className="empty-text">尚未走棋</p>
              )}
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

  // 浮动窗口模式（腾讯棋牌风格：独立可拖拽窗口，可缩放、可全屏，功能按钮集成在窗口内）
  if (isFloating) {
    return (
      <BoardFloatingWindow title="🐴 中国象棋 · 双人对战" onClose={toggleFloat}>
        <div className="float-status-bar">
          <span className="float-status-turn">{STATUS_TEXT[status](turn)}</span>
          <span className="float-status-room">红方先手 · 轮流出棋</span>
        </div>
        <div className="float-action-bar">
          <button className="float-action-btn" onClick={handleUndo} disabled={moves.length === 0}>↩ 悔棋</button>
          <button className="float-action-btn float-action-primary" onClick={handleReset}>🔄 重新开始</button>
        </div>
        {viewActions}
        {boardArea}
        {resultModal}
      </BoardFloatingWindow>
    );
  }

  // 正常模式
  return (
    <div className="module xiangqi-game">
      <div className="module-header">
        <h2>🐴 中国象棋 · 双人对战</h2>
        <p>两位玩家在同一设备上轮流对弈</p>
      </div>

      {gameContent}
    </div>
  );
};
