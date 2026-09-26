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
}

/** 列坐标字母（跳过 I） */
const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

export const GoBoard: React.FC<GoBoardProps> = ({
  board,
  size,
  lastMove,
  hintPoint,
  territory,
  onIntersectionClick,
  disabled,
  interactive = true,
  flipped = false,
}) => {
  const [floating, setFloating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const n = size;

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
    const cellPct = 100 / (n - 1);      // 一格宽（viewBox 单位）
    const stoneR = Math.max(3, cellPct * 0.46);   // 棋子半径 ≈ 0.46 格（直径≈0.92格）
    return (
      <g>
        <circle
          cx="0" cy="0"
          r={stoneR}
          fill={isB ? '#141414' : '#fdfdf9'}
          stroke={isB ? '#000' : '#5a5548'}
          strokeWidth={isB ? 0.4 : 0.8}
          className="go-stone"
        />
        {isB && (
          <circle cx="0" cy="0" r={Math.max(1.2, stoneR * 0.32)} fill="#444" className="go-stone-inner" />
        )}
      </g>
    );
  };

  const renderGrid = () => {
    const lines: React.ReactElement[] = [];
    const cellPct = 100 / (n - 1);
    for (let i = 0; i < n; i++) {
      lines.push(
        <line key={`h${i}`} x1="0" y1={`${i * cellPct}%`} x2="100%" y2={`${i * cellPct}%`} className="go-line" />,
        <line key={`v${i}`} x1={`${i * cellPct}%`} y1="0" x2={`${i * cellPct}%`} y2="100%" className="go-line" />,
      );
    }
    return lines;
  };

  const renderStars = () => {
    const pts: React.ReactElement[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (isGoStarPoint(r, c, size)) {
          pts.push(<circle key={`${r},${c}`} cx={`${c * 100 / (n - 1)}%`} cy={`${r * 100 / (n - 1)}%`} r={Math.max(1.4, 100 / (n - 1) * 0.16)} fill="#3a2a14" className="go-star" />);
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
              transform={`translate(${c * 100 / (n - 1)}%, ${r * 100 / (n - 1)}%)`}
              className="go-stone-wrap"
            >
              {renderStone(r, c)}
              {isLast && color && (
                <circle cx="0" cy="0" r={Math.max(1.1, 100 / (n - 1) * 0.13)} fill={color === 'b' ? '#ff5a4e' : '#e23c2c'} className="go-last-mark" />
              )}
              {hintPoint && hintPoint[0] === r && hintPoint[1] === c && !color && (
                <circle cx="0" cy="0" r={Math.max(1.6, 100 / (n - 1) * 0.22)} fill="none" stroke="#1e88e5" strokeWidth="1.8" opacity="0.9" className="go-hint" />
              )}
            </g>,
          );
        } else if (hintPoint && hintPoint[0] === r && hintPoint[1] === c) {
          stones.push(
            <g key={`${r},${c}`} transform={`translate(${c * 100 / (n - 1)}%, ${r * 100 / (n - 1)}%)`}>
              <circle cx="0" cy="0" r={Math.max(1.6, 100 / (n - 1) * 0.22)} fill="none" stroke="#1e88e5" strokeWidth="1.8" opacity="0.9" className="go-hint" />
            </g>,
          );
        }
      }
    }
    return stones;
  };

  const renderCoords = () => {
    const coords: React.ReactElement[] = [];
    for (let i = 0; i < n; i++) {
      const rowIdx = flipped ? n - 1 - i : i;
      const colIdx = flipped ? n - 1 - i : i;
      coords.push(
        <text key={`rc${i}`} x="-3.5%" y={`${i * 100 / (n - 1)}%`} className="go-coord" textAnchor="end" dominantBaseline="middle">{n - rowIdx}</text>,
        <text key={`cc${i}`} x={`${i * 100 / (n - 1)}%`} y="102%" className="go-coord" textAnchor="middle">{COL_LETTERS[colIdx]}</text>,
      );
    }
    return coords;
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
          // 找最近的交叉点
          const c = Math.round(px / (100 / (n - 1)));
          const r = Math.round(py / (100 / (n - 1)));
          if (r >= 0 && r < n && c >= 0 && c < n) handleClick(r, c);
        }}
      >
        <rect x="0" y="0" width="100" height="100" fill="#e8b96f" className="go-board-bg" />
        <g className="go-grid">{renderGrid()}</g>
        <g className="go-stars">{renderStars()}</g>
        <g className="go-stones">{renderStones()}</g>
        <g className="go-coords">{renderCoords()}</g>
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
