/**
 * ChessKids - 五子棋 2D 棋盘组件
 * 15×15 网格/星位/落子/last move/提示点，深色花梨木为主色调
 * 内置浮动窗口模式（全屏自适应）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enterFullscreen, exitFullscreen } from '../utils/fullscreen';
import { GOMOKU_SIZE, GOMOKU_STAR_POINTS, type GomokuBoard as GomokuBoardT } from '../engine/gomoku';

interface GomokuBoardProps {
  board: GomokuBoardT;
  lastMove?: [number, number] | null;
  hintPoint?: [number, number] | null;
  winningLine?: Array<[number, number]> | null;
  onIntersectionClick?: (r: number, c: number) => void;
  /** 棋盘容器内嵌功能按钮区（渲染在棋盘下方，浮动模式跟随） */
  children?: React.ReactNode;
  disabled?: boolean;
  interactive?: boolean;
  flipped?: boolean;
  /** 默认进入浮动窗口全屏模式（脱离浏览器布局限制） */
  defaultFloating?: boolean;
  /** 日夜模式：light 护眼米杏 / dark 深色木纹夜间配色 */
  theme?: 'light' | 'dark';
  /** 浮动状态变化回调（模块层据此区分浮动/内嵌渲染结算弹窗与按钮） */
  onFloatChange?: (floating: boolean) => void;
}

export const GomokuBoard: React.FC<GomokuBoardProps> = ({
  board,
  lastMove,
  hintPoint,
  winningLine,
  onIntersectionClick,
  disabled,
  interactive = true,
  defaultFloating = false,
  theme = 'light',
  children,
  onFloatChange,
}) => {
  const dark = theme === 'dark';
  const [floating, setFloating] = useState(defaultFloating);
  // 浮动状态同步到模块层（区分内嵌/浮动渲染结算弹窗与按钮，避免浏览器窗口重复显示）
  useEffect(() => { onFloatChange?.(floating); }, [floating, onFloatChange]);
  /** 视口尺寸 state：resize 时实时重算浮动尺寸（修复窗口缩放后棋盘不跟随的 bug） */
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const MARGIN_PCT = 7; // 边沿留白（百分比），参考折叠围棋盘外框比例
  const containerRef = useRef<HTMLDivElement>(null);
  const n = GOMOKU_SIZE;

  // 全屏联动：浮动模式下自动进入浏览器全屏（隐藏窗口/地址栏），脱离浏览器限制
  const requestFs = useCallback(() => enterFullscreen(), []);
  const exitFs = useCallback(() => exitFullscreen(), []);
  const enterFloat = useCallback(() => { setFloating(true); requestFs(); }, [requestFs]);
  const exitFloat = useCallback(() => { setFloating(false); exitFs(); }, [exitFs]);
  // 默认浮动（进入对局即 2D 全屏）：尝试自动全屏，非手势被拒则保持 fixed 全屏层
  useEffect(() => {
    if (defaultFloating) requestFs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 浮动窗口模式：随窗口自动缩放（视口尺寸来自 state，resize 时重算）
  const floatSize = useMemo(() => {
    if (!floating) return 0;
    const vw = viewport.w;
    const vh = viewport.h;
    const hasInboard = React.Children.count(children) > 0;
    // 顶部窄把手+留白约 44px：浮动棋盘预留空间大幅缩小，避免棋盘上下出现大片留白
    const avail = Math.min(vw - 20, vh - (hasInboard ? 44 : 80));
    // 自动匹配终端全屏：不设固定上限，随视口实时自适应
    return Math.max(280, avail);
  }, [floating, viewport.w, viewport.h, children]);

  useEffect(() => {
    if (!floating) return;
    const handler = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, [floating]);

  // 沉浸联动：浮动模式给 body 打标，隐藏页面头部/侧栏等非棋盘 UI（脱离浏览器窗口布局限制）
  useEffect(() => {
    if (!floating) return;
    document.body.classList.add('gomoku-float-active');
    return () => document.body.classList.remove('gomoku-float-active');
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
    const cellPct = (100 - 2 * MARGIN_PCT) / (n - 1);   // 有效格宽（扣除边沿留白）
    const stoneR = Math.max(2.0, cellPct * 0.30);   // 直径≈0.60格
    const isWin = winningLine?.some(([wr, wc]) => wr === r && wc === c);
    const hx = -stoneR * 0.3;
    const hy = -stoneR * 0.35;
    return (
      <g>
        {/* 落子阴影（贴地感） */}
        <circle cx="0.6" cy="0.9" r={stoneR} fill={dark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.22)"} className="gomoku-stone-shadow" />
        {/* 云子主体：径向渐变模拟温润光泽 */}
        <circle
          cx="0" cy="0"
          r={stoneR}
          fill={isB ? 'url(#gStoneBlack)' : 'url(#gStoneWhite)'}
          stroke="none"
          strokeWidth={0}
          className="gomoku-stone"
        />
        {/* 顶部高光（仅白子保留左上斜光；黑子保持纯黑无灰点） */}
        {!isB && (
          <circle cx={hx} cy={hy} r={stoneR * 0.26} fill="rgba(255,255,255,0.9)" className="gomoku-stone-glint" />
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
        fill={dark ? "#d9b57a" : "#8a5a2b"}
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
    <div className={`gomoku-board-wrap ${floating ? 'gomoku-floating' : ''}`} style={floating ? { width: boardSize } : undefined}>
      <svg
        viewBox="0 0 100 100"
        className="gomoku-board-svg"
        preserveAspectRatio="none"
        onClick={(e) => {
          if (!interactive || disabled) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width * 100;
          const py = (e.clientY - rect.top) / rect.height * 100;
          // 注意：网格内缩 MARGIN_PCT 边沿，坐标换算必须扣除边沿并按网格实际跨度映射，否则落点整体偏移
          const span = 100 - MARGIN_PCT * 2;
          const c = Math.round((px - MARGIN_PCT) / (span / (n - 1)));
          const r = Math.round((py - MARGIN_PCT) / (span / (n - 1)));
          if (r >= 0 && r < n && c >= 0 && c < n) handleClick(r, c);
        }}
      >
        <defs>
          {/* 护眼豆沙绿渐变底（低饱和、低反射，长时间对弈不刺眼） */}
          <linearGradient id="gBoardWood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dark ? "#6f8575" : "#f4efdc"} />
            <stop offset="50%" stopColor={dark ? "#62786a" : "#eae3cb"} />
            <stop offset="100%" stopColor={dark ? "#546a5d" : "#dcd2b4"} />
          </linearGradient>
          {/* 黑云子：乌黑带温润高光 */}
          <radialGradient id="gStoneBlack" cx="42%" cy="38%" r="80%">
            <stop offset="0%" stopColor={dark ? "#40362c" : "#26211c"} />
            <stop offset="55%" stopColor={dark ? "#16110c" : "#0e0c0a"} />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
          {/* 白云子：瓷白温润 */}
          <radialGradient id="gStoneWhite" cx="38%" cy="34%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f8f2e4" />
            <stop offset="100%" stopColor="#e2d9c0" />
          </radialGradient>
        </defs>
        {/* 深色花梨木棋盘面（渐变 + 木纹） */}
        <rect x="0" y="0" width="100" height="100" fill="url(#gBoardWood)" className="gomoku-board-bg" />
        <g className="gomoku-wood-grain">
          {Array.from({ length: 24 }).map((_, i) => (
            <line key={`wg${i}`} x1="0" y1={1.6 + i * 4.1} x2="100" y2={1.6 + i * 4.1} stroke={dark ? "rgba(190,160,110,0.16)" : "rgba(150,112,66,0.12)"} strokeWidth={0.5 + (i % 3) * 0.45} />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`wl${i}`} x1="0" y1={3.2 + i * 11.2} x2="100" y2={3.2 + i * 11.2} stroke={dark ? "rgba(190,160,110,0.10)" : "rgba(132,96,54,0.08)"} strokeWidth={0.3 + (i % 2) * 0.35} />
          ))}
          {Array.from({ length: 3 }).map((_, i) => (
            <ellipse key={`wr${i}`} cx={18 + i * 30} cy={82 - i * 14} rx={26 + i * 8} ry={5 + i * 1.6} fill="none" stroke={dark ? "rgba(190,160,110,0.12)" : "rgba(150,112,66,0.10)"} strokeWidth="1.1" />
          ))}
        </g>
        <rect x="0" y="0" width="100" height="100" fill="none" stroke={dark ? "#d9b57a" : "#8a5a2b"} strokeWidth="0.9" opacity="0.8" />
        <g className="gomoku-grid">{renderGrid()}</g>
        <g className="gomoku-stars">{renderStars()}</g>
        <g className="gomoku-stones">{renderStones()}</g>
      </svg>
      {floating && (
        <button className="gomoku-float-close" onClick={exitFloat} title="退出浮动窗口（退出全屏）">✕</button>
      )}
      {children}
    </div>
  );

  return (
    <div className="gomoku-board-container" ref={containerRef}>
      {!floating && (
        <div className="gomoku-board-toolbar">
          <button className="gomoku-float-btn" onClick={enterFloat} title="浮动窗口（全屏自适应，隐藏浏览器窗口）">⛶ 浮动窗口</button>
        </div>
      )}
      {boardEl}
    </div>
  );
};

export default GomokuBoard;
