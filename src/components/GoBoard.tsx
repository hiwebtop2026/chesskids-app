/**
 * ChessKids - 围棋 2D 棋盘组件
 * 支持 9/13/19 路：网格/星位/落子/提子/last move/坐标/提示点
 * 内置浮动窗口模式（全屏自适应，脱离页面布局限制）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isGoStarPoint, type GoBoard as GoBoardT, type GoBoardSize } from '../engine/go';

interface GoBoardProps {
  board: GoBoardT;
  size: GoBoardSize;
  lastMove?: [number, number] | null;
  hintPoint?: [number, number] | null;
  territory?: GoBoardT | null;
  onIntersectionClick?: (r: number, c: number) => void;
  disabled?: boolean;
  interactive?: boolean;
  flipped?: boolean;
  /** 默认进入浮动窗口全屏模式（脱离浏览器布局限制） */
  defaultFloating?: boolean;
}

export const GoBoard: React.FC<GoBoardProps> = ({
  board,
  size,
  lastMove,
  hintPoint,
  territory,
  onIntersectionClick,
  disabled,
  interactive = true,
  defaultFloating = false,
}) => {
  const [floating, setFloating] = useState(defaultFloating);
  const containerRef = useRef<HTMLDivElement>(null);
  const n = size;

  /** 标准围棋棋盘：网格边沿内缩留白（%） */
  const MARGIN_PCT = 7;

  // 浮动窗口模式：随窗口自动缩放（棋盘自适应）
  const floatSize = useMemo(() => {
    if (!floating) return 0;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth);
    const vh = Math.min(window.innerHeight, document.documentElement.clientHeight);
    // 保留顶部标题/底部导航空间，棋盘占最大正方形
    const avail = Math.min(vw - 24, vh - 96);
    return Math.max(240, Math.min(avail, 900));
  }, [floating]);

  useEffect(() => {
    if (!floating) return;
    const handler = () => {
      // 触发重算（依赖 floatSize 的 useMemo 由 resize 触发）
      setFloating((f) => f);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [floating]);

  const boardSize = floating ? floatSize : undefined;

  const handleClick = (r: number, c: number) => {
    if (!interactive || disabled) return;
    onIntersectionClick?.(r, c);
  };

  // 渲染棋子
  const renderStone = (r: number, c: number) => {
    const color = board[r][c];
    if (!color) {
      // 领地标记（胜负判定后）
      if (territory && territory[r][c] && territory[r][c] !== board[r][c]) {
        return <circle className="go-territory-mark" cx="0" cy="0" r={Math.max(2, 100 / (n - 1) * 0.3)} fill={territory[r][c] === 'b' ? '#1a1a1a' : '#e8e8e8'} opacity="0.35" />;
      }
      return null;
    }
    const isB = color === 'b';
    const cellPct = (100 - 2 * MARGIN_PCT) / (n - 1);   // 有效格宽（viewBox 单位）
    const stoneR = Math.max(2.5, cellPct * 0.40);   // 棋子半径 ≈ 0.40 格（直径≈0.80格）
    return (
      <g>
        <circle
          cx="0" cy="0"
          r={stoneR}
          fill={isB ? '#111111' : '#ffffff'}
          stroke={isB ? '#000' : 'none'}
          strokeWidth={isB ? 0.3 : 0}
          className="go-stone"
        />
      </g>
    );
  };

  const renderGrid = () => {
    const lines: React.ReactElement[] = [];
    for (let i = 0; i < n; i++) {
      const g0 = MARGIN_PCT;
      const g1 = 100 - MARGIN_PCT;
      const pos = (idx: number) => g0 + idx * (g1 - g0) / (n - 1);
      lines.push(
        <line key={`h${i}`} x1={`${g0}%`} y1={`${pos(i)}%`} x2={`${g1}%`} y2={`${pos(i)}%`} className="go-line" />,
        <line key={`v${i}`} x1={`${pos(i)}%`} y1={`${g0}%`} x2={`${pos(i)}%`} y2={`${g1}%`} className="go-line" />,
      );
    }
    return lines;
  };

  const renderStars = () => {
    const pts: React.ReactElement[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (isGoStarPoint(r, c, size)) {
          const pos = (idx: number) => MARGIN_PCT + idx * (100 - 2 * MARGIN_PCT) / (n - 1);
          pts.push(<circle key={`${r},${c}`} cx={`${pos(c)}%`} cy={`${pos(r)}%`} r={Math.max(1.3, (100 - 2 * MARGIN_PCT) / (n - 1) * 0.16)} fill="#1a1a1a" className="go-star" />);
        }
      }
    }
    return pts;
  };

  const renderStones = () => {
    const stones: React.ReactElement[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const color = board[r][c];
        const isLast = lastMove && lastMove[0] === r && lastMove[1] === c;
        if (color || (territory && territory[r][c])) {
          stones.push(
            <g
              key={`${r},${c}`}
              transform={`translate(${MARGIN_PCT + c * (100 - 2 * MARGIN_PCT) / (n - 1)}, ${MARGIN_PCT + r * (100 - 2 * MARGIN_PCT) / (n - 1)})`}
              className="go-stone-wrap"
            >
              {renderStone(r, c)}
              {isLast && color && (
                <circle cx="0" cy="0" r={Math.max(1.0, (100 - 2 * MARGIN_PCT) / (n - 1) * 0.13)} fill={color === 'b' ? '#ff5a4e' : '#e23c2c'} className="go-last-mark" />
              )}
              {hintPoint && hintPoint[0] === r && hintPoint[1] === c && !color && (
                <circle cx="0" cy="0" r={Math.max(1.5, (100 - 2 * MARGIN_PCT) / (n - 1) * 0.22)} fill="none" stroke="#1e88e5" strokeWidth="1.8" opacity="0.9" className="go-hint" />
              )}
            </g>,
          );
        } else if (hintPoint && hintPoint[0] === r && hintPoint[1] === c) {
          stones.push(
            <g key={`${r},${c}`} transform={`translate(${MARGIN_PCT + c * (100 - 2 * MARGIN_PCT) / (n - 1)}, ${MARGIN_PCT + r * (100 - 2 * MARGIN_PCT) / (n - 1)})`}>
              <circle cx="0" cy="0" r={Math.max(1.6, 100 / (n - 1) * 0.22)} fill="none" stroke="#1e88e5" strokeWidth="1.8" opacity="0.9" className="go-hint" />
            </g>,
          );
        }
      }
    }
    return stones;
  };

  const boardEl = (
    <div className={`go-board-wrap ${floating ? 'go-floating' : ''}`} style={boardSize ? { width: boardSize, height: boardSize } : undefined}>
      <svg
        viewBox="0 0 100 100"
        className="go-board-svg"
        preserveAspectRatio="none"
        onClick={(e) => {
          if (!interactive || disabled) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width * 100;
          const py = (e.clientY - rect.top) / rect.height * 100;
          // 标准围棋棋盘：网格内缩 MARGIN_PCT 边沿，换算需扣除
          const c = Math.round((px - MARGIN_PCT) / ((100 - 2 * MARGIN_PCT) / (n - 1)));
          const r = Math.round((py - MARGIN_PCT) / ((100 - 2 * MARGIN_PCT) / (n - 1)));
          if (r >= 0 && r < n && c >= 0 && c < n) handleClick(r, c);
        }}
      >
        <defs>
          <linearGradient id="goBoardWood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ead9b5" />
            <stop offset="0.5" stopColor="#e2cfa6" />
            <stop offset="1" stopColor="#d6c095" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#goBoardWood)" className="go-board-bg" />
        <g className="go-grid">{renderGrid()}</g>
        <g className="go-stars">{renderStars()}</g>
        <g className="go-stones">{renderStones()}</g>
      </svg>
      {floating && (
        <button className="go-float-close" onClick={() => setFloating(false)} title="退出浮动窗口">✕</button>
      )}
    </div>
  );

  return (
    <div className="go-board-container" ref={containerRef}>
      {!floating && (
        <div className="go-board-toolbar">
          <button className="go-float-btn" onClick={() => setFloating(true)} title="浮动窗口（全屏自适应）">⛶ 浮动窗口</button>
        </div>
      )}
      {boardEl}
    </div>
  );
};

export default GoBoard;
