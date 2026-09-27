/**
 * ChessKids - 五子棋 2D 棋盘组件
 * 15×15 网格/星位/落子/last move/提示点，深色花梨木为主色调
 * 内置浮动窗口模式（全屏自适应）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GOMOKU_SIZE, GOMOKU_STAR_POINTS, type GomokuBoard as GomokuBoardT } from '../engine/gomoku';

interface GomokuBoardProps {
  board: GomokuBoardT;
  lastMove?: [number, number] | null;
  hintPoint?: [number, number] | null;
  winningLine?: Array<[number, number]> | null;
  onIntersectionClick?: (r: number, c: number) => void;
  disabled?: boolean;
  interactive?: boolean;
  flipped?: boolean;
}

export const GomokuBoard: React.FC<GomokuBoardProps> = ({
  board,
  lastMove,
  hintPoint,
  winningLine,
  onIntersectionClick,
  disabled,
  interactive = true,
}) => {
  const [floating, setFloating] = useState(false);
  const MARGIN_PCT = 7; // 边沿留白（百分比），参考折叠围棋盘外框比例
  const containerRef = useRef<HTMLDivElement>(null);
  const n = GOMOKU_SIZE;

  // 浮动窗口模式：随窗口自动缩放
  const floatSize = useMemo(() => {
    if (!floating) return 0;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth);
    const vh = Math.min(window.innerHeight, document.documentElement.clientHeight);
    const avail = Math.min(vw - 24, vh - 96);
    return Math.max(240, Math.min(avail, 900));
  }, [floating]);

  useEffect(() => {
    if (!floating) return;
    const handler = () => setFloating((f) => f);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [floating]);

  const boardSize = floating ? floatSize : undefined;

  const handleClick = (r: number, c: number) => {
    if (!interactive || disabled) return;
    onIntersectionClick?.(r, c);
  };

  const renderStone = (r: number, c: number) => {
    const color = board[r][c];
    if (!color) return null;
    const isB = color === 'b';
    const cellPct = 100 / (n - 1);
    const stoneR = Math.max(2.6, cellPct * 0.37);
    const isWin = winningLine?.some(([wr, wc]) => wr === r && wc === c);
    const hx = -stoneR * 0.3;
    const hy = -stoneR * 0.35;
    return (
      <g>
        {/* 落子阴影（贴地感） */}
        <circle cx="0.6" cy="0.9" r={stoneR} fill="rgba(0,0,0,0.28)" className="gomoku-stone-shadow" />
        {/* 云子主体：径向渐变模拟温润光泽 */}
        <circle
          cx="0" cy="0"
          r={stoneR}
          fill={isB ? 'url(#gStoneBlack)' : 'url(#gStoneWhite)'}
          stroke={isB ? '#000' : '#6a5a3a'}
          strokeWidth={isB ? 0.4 : 0.8}
          className="gomoku-stone"
        />
        {/* 顶部高光（左上斜光） */}
        <circle cx={hx} cy={hy} r={stoneR * (isB ? 0.2 : 0.26)} fill={isB ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)'} className="gomoku-stone-glint" />
        {/* 黑子内圈层次 */}
        {isB && (
          <circle cx="0" cy="0" r={Math.max(1.2, stoneR * 0.32)} fill="#3a3a3a" opacity="0.55" className="gomoku-stone-inner" />
        )}
        {isWin && (
          <circle cx="0" cy="0" r={Math.max(1.6, stoneR * 0.55)} fill="none" stroke="#ffb300" strokeWidth="1.1" className="gomoku-win-ring" />
        )}
      </g>
    );
  };

  const renderGrid = () => {
    const lines: React.ReactElement[] = [];
    const posPct = (i: number) => MARGIN_PCT + (i * (100 - MARGIN_PCT * 2)) / (n - 1);
    for (let i = 0; i < n; i++) {
      const p = posPct(i);
      lines.push(
        <line key={`h${i}`} x1={`${MARGIN_PCT}%`} y1={`${p}%`} x2={`${100 - MARGIN_PCT}%`} y2={`${p}%`} className="gomoku-line" />,
        <line key={`v${i}`} x1={`${p}%`} y1={`${MARGIN_PCT}%`} x2={`${p}%`} y2={`${100 - MARGIN_PCT}%`} className="gomoku-line" />,
      );
    }
    return lines;
  };

  const renderStars = () => {
    return GOMOKU_STAR_POINTS.map(([r, c]) => (
      <circle
        key={`${r},${c}`}
        cx={`${MARGIN_PCT + (c * (100 - MARGIN_PCT * 2)) / (n - 1)}%`}
        cy={`${MARGIN_PCT + (r * (100 - MARGIN_PCT * 2)) / (n - 1)}%`}
        r={Math.max(1.2, 100 / (n - 1) * 0.13)}
        fill="#1a1a1a"
        className="gomoku-star"
      />
    ));
  };

  const renderStones = () => {
    const stones: React.ReactElement[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const color = board[r][c];
        const isLast = lastMove && lastMove[0] === r && lastMove[1] === c;
        if (color) {
          stones.push(
            <g
              key={`${r},${c}`}
              transform={`translate(${MARGIN_PCT + (c * (100 - MARGIN_PCT * 2)) / (n - 1)}, ${MARGIN_PCT + (r * (100 - MARGIN_PCT * 2)) / (n - 1)})`}
              className="gomoku-stone-wrap"
            >
              {renderStone(r, c)}
              {isLast && color && (
                <circle cx="0" cy="0" r={Math.max(0.9, 100 / (n - 1) * 0.10)} fill={color === 'b' ? '#ffd54f' : '#ff7043'} className="gomoku-last-mark" />
              )}
            </g>,
          );
        } else if (hintPoint && hintPoint[0] === r && hintPoint[1] === c) {
          stones.push(
            <g key={`${r},${c}`} transform={`translate(${MARGIN_PCT + (c * (100 - MARGIN_PCT * 2)) / (n - 1)}, ${MARGIN_PCT + (r * (100 - MARGIN_PCT * 2)) / (n - 1)})`}>
              <circle cx="0" cy="0" r={Math.max(1.5, 100 / (n - 1) * 0.20)} fill="none" stroke="#ffb300" strokeWidth="1.8" opacity="0.95" className="gomoku-hint" />
            </g>,
          );
        }
      }
    }
    return stones;
  };


  const boardEl = (
    <div className={`gomoku-board-wrap ${floating ? 'gomoku-floating' : ''}`} style={boardSize ? { width: boardSize, height: boardSize } : undefined}>
      <svg
        viewBox="0 0 100 100"
        className="gomoku-board-svg"
        preserveAspectRatio="none"
        onClick={(e) => {
          if (!interactive || disabled) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width * 100;
          const py = (e.clientY - rect.top) / rect.height * 100;
          const c = Math.round(px / (100 / (n - 1)));
          const r = Math.round(py / (100 / (n - 1)));
          if (r >= 0 && r < n && c >= 0 && c < n) handleClick(r, c);
        }}
      >
        <defs>
          {/* 花梨木渐变底 */}
          <linearGradient id="gBoardWood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ead9b5" />
            <stop offset="50%" stopColor="#e2cfa6" />
            <stop offset="100%" stopColor="#d6c095" />
          </linearGradient>
          {/* 黑云子：乌黑带温润高光 */}
          <radialGradient id="gStoneBlack" cx="38%" cy="34%" r="78%">
            <stop offset="0%" stopColor="#4d4d4d" />
            <stop offset="42%" stopColor="#191919" />
            <stop offset="100%" stopColor="#040404" />
          </radialGradient>
          {/* 白云子：瓷白温润 */}
          <radialGradient id="gStoneWhite" cx="38%" cy="34%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f3eee3" />
            <stop offset="100%" stopColor="#d6cebd" />
          </radialGradient>
        </defs>
        {/* 深色花梨木棋盘面（渐变 + 木纹） */}
        <rect x="0" y="0" width="100" height="100" fill="url(#gBoardWood)" className="gomoku-board-bg" />
        <g className="gomoku-wood-grain">
          {Array.from({ length: 24 }).map((_, i) => (
            <line key={`wg${i}`} x1="0" y1={1.6 + i * 4.1} x2="100" y2={1.6 + i * 4.1} stroke="rgba(120,88,48,0.07)" strokeWidth={0.5 + (i % 3) * 0.45} />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`wl${i}`} x1="0" y1={3.2 + i * 11.2} x2="100" y2={3.2 + i * 11.2} stroke="rgba(90,64,34,0.05)" strokeWidth={0.3 + (i % 2) * 0.35} />
          ))}
          {Array.from({ length: 3 }).map((_, i) => (
            <ellipse key={`wr${i}`} cx={18 + i * 30} cy={82 - i * 14} rx={26 + i * 8} ry={5 + i * 1.6} fill="none" stroke="rgba(120,88,48,0.06)" strokeWidth="1.1" />
          ))}
        </g>
        <rect x="0" y="0" width="100" height="100" fill="none" stroke="#2b2b2b" strokeWidth="0.9" opacity="0.9" />
        <g className="gomoku-grid">{renderGrid()}</g>
        <g className="gomoku-stars">{renderStars()}</g>
        <g className="gomoku-stones">{renderStones()}</g>
      </svg>
      {floating && (
        <button className="gomoku-float-close" onClick={() => setFloating(false)} title="退出浮动窗口">✕</button>
      )}
    </div>
  );

  return (
    <div className="gomoku-board-container" ref={containerRef}>
      {!floating && (
        <div className="gomoku-board-toolbar">
          <button className="gomoku-float-btn" onClick={() => setFloating(true)} title="浮动窗口（全屏自适应）">⛶ 浮动窗口</button>
        </div>
      )}
      {boardEl}
    </div>
  );
};

export default GomokuBoard;
