/**
 * ChessKids - 中国象棋 2D 棋盘组件
 * 传统中国象棋风格：棋子放在交叉点上
 *
 * 统一棋盘几何模型（单一数据源）：
 *   网格 = 9 条竖线 (col 0-8, 8 格宽) × 10 条横线 (row 0-9, 9 格高)
 *   SVG viewBox 为 "0 0 8 9"，交叉点 (col,row) 的 SVG 坐标就是 (col,row)
 *   棋子 CSS 百分比定位：left = col/8*100%，top = row/9*100%
 *   九宫斜线、炮位/兵位标记全部由交叉点公式生成，禁止硬编码像素
 */

import React, { useMemo } from 'react';
import type {
  XiangqiBoard,
  XiangqiSquare,
} from '../types/xiangqi';
import { XIANGQI_PIECE_CHARS } from '../types/xiangqi';
import { isXiangqiRed } from '../engine/xiangqi';

interface XiangqiBoard2DProps {
  board: XiangqiBoard;
  selectedSquare: XiangqiSquare | null;
  legalTargets: XiangqiSquare[];
  lastMove: { from: XiangqiSquare; to: XiangqiSquare } | null;
  checkSquare: XiangqiSquare | null;
  hint: XiangqiSquare[] | null;
  onSquareClick: (row: number, col: number) => void;
  readOnly?: boolean;
}

// ===== 棋盘几何常量（唯一数据源）=====
const ROWS = 10; // 横线数（row 0 = 黑方底线，row 9 = 红方底线）
const COLS = 9;  // 竖线数（col 0 = 红方视角九路，col 8 = 一路）
const RIVER_TOP_ROW = 4;    // 河界上沿（黑方河岸线）
const RIVER_BOTTOM_ROW = 5; // 河界下沿（红方河岸线）

/** 炮位、兵/卒位（传统棋盘上的小直角标记） */
const MARKER_POINTS: XiangqiSquare[] = [
  [2, 1], [2, 7], [7, 1], [7, 7],                       // 炮位
  [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],               // 黑方卒位
  [6, 0], [6, 2], [6, 4], [6, 6], [6, 8],               // 红方兵位
];

// 标记尺寸（以"格"为单位）
const MARKER_GAP = 0.07;  // 标记线端离交叉点的距离
const MARKER_LEN = 0.16;  // 标记线段长度

const LINE_COLOR = '#5D4037';

export const XiangqiBoard2D: React.FC<XiangqiBoard2DProps> = ({
  board,
  selectedSquare,
  legalTargets,
  lastMove,
  checkSquare,
  hint,
  onSquareClick,
  readOnly = false,
}) => {
  const isSelected = (r: number, c: number) =>
    selectedSquare && selectedSquare[0] === r && selectedSquare[1] === c;

  const isLegalTarget = (r: number, c: number) =>
    legalTargets.some((t) => t[0] === r && t[1] === c);

  const isLastMove = (r: number, c: number) =>
    lastMove &&
    ((lastMove.from[0] === r && lastMove.from[1] === c) ||
      (lastMove.to[0] === r && lastMove.to[1] === c));

  const isCheck = (r: number, c: number) =>
    checkSquare && checkSquare[0] === r && checkSquare[1] === c;

  const isHint = (r: number, c: number) =>
    hint && hint.some((h) => h[0] === r && h[1] === c);

  // 棋子中心定位：百分比相对网格区（与 SVG viewBox 0 0 8 9 完全同源）
  const getPosStyle = (r: number, c: number) => ({
    left: `${(c / (COLS - 1)) * 100}%`,
    top: `${(r / (ROWS - 1)) * 100}%`,
  });

  // 生成棋盘线的 SVG（坐标单位 = 格，viewBox 0 0 8 9）
  const boardLines = useMemo(() => {
    const lines: JSX.Element[] = [];

    // 横线 10 条：y = row，横贯左右
    for (let r = 0; r < ROWS; r++) {
      lines.push(
        <line
          key={`h${r}`}
          x1={0}
          y1={r}
          x2={COLS - 1}
          y2={r}
          stroke={LINE_COLOR}
          strokeWidth={r === 0 || r === ROWS - 1 ? 2 : 1.2}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }

    // 竖线 9 条：x = col
    for (let c = 0; c < COLS; c++) {
      if (c === 0 || c === COLS - 1) {
        // 最左最右两列贯通（棋盘外框）
        lines.push(
          <line
            key={`v-${c}`}
            x1={c}
            y1={0}
            x2={c}
            y2={ROWS - 1}
            stroke={LINE_COLOR}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />,
        );
      } else {
        // 中间 7 列在河界处断开：上段 row 0..4，下段 row 5..9
        lines.push(
          <line
            key={`v-top-${c}`}
            x1={c}
            y1={0}
            x2={c}
            y2={RIVER_TOP_ROW}
            stroke={LINE_COLOR}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />,
        );
        lines.push(
          <line
            key={`v-bottom-${c}`}
            x1={c}
            y1={RIVER_BOTTOM_ROW}
            x2={c}
            y2={ROWS - 1}
            stroke={LINE_COLOR}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />,
        );
      }
    }

    // 九宫斜线（端点固定为九宫对角交叉点）
    // 黑方九宫（上）：col 3-5, row 0-2
    lines.push(
      <line key="pal-b1" x1={3} y1={0} x2={5} y2={2}
        stroke={LINE_COLOR} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />,
      <line key="pal-b2" x1={5} y1={0} x2={3} y2={2}
        stroke={LINE_COLOR} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />,
    );
    // 红方九宫（下）：col 3-5, row 7-9
    lines.push(
      <line key="pal-r1" x1={3} y1={7} x2={5} y2={9}
        stroke={LINE_COLOR} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />,
      <line key="pal-r2" x1={5} y1={7} x2={3} y2={9}
        stroke={LINE_COLOR} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />,
    );

    // 炮位 / 兵卒位标记：交叉点四角的小直角（L 形），边缘点省略越界角
    const markers: JSX.Element[] = [];
    MARKER_POINTS.forEach(([r, c], i) => {
      const corners: Array<[number, number]> = [];
      // 角方向 (sx, sy)：横向朝内、纵向双向；col 0 只画右角，col 8 只画左角
      if (c > 0) corners.push([-1, -1], [-1, 1]);
      if (c < COLS - 1) corners.push([1, -1], [1, 1]);
      corners.forEach(([sx, sy], j) => {
        const x0 = c + sx * MARKER_GAP;
        const y0 = r + sy * MARKER_GAP;
        const x1 = c + sx * (MARKER_GAP + MARKER_LEN);
        const y1 = r + sy * (MARKER_GAP + MARKER_LEN);
        markers.push(
          <polyline
            key={`mk-${i}-${j}`}
            points={`${x0},${y1} ${x0},${y0} ${x1},${y0}`}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />,
        );
      });
    });

    return [...lines, ...markers];
  }, []);

  return (
    <div className="xiangqi-board-wrapper">
      <div className="xiangqi-board">
        {/* 棋盘线 SVG：viewBox 与网格同为 8 格宽 × 9 格高，拉伸填满网格区 */}
        <svg
          className="xiangqi-board-lines"
          viewBox={`0 0 ${COLS - 1} ${ROWS - 1}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {boardLines}
        </svg>

        {/* 河界文字 */}
        <div className="xiangqi-river">
          <span className="river-text">楚 河</span>
          <span className="river-text">漢 界</span>
        </div>

        {/* 棋子层：绝对定位，每个棋子中心对齐交叉点 */}
        <div className="xiangqi-pieces-layer">
          {board.map((row, r) =>
            row.map((piece, c) => {
              const selected = isSelected(r, c);
              const legal = isLegalTarget(r, c);
              const last = isLastMove(r, c);
              const check = isCheck(r, c);
              const hintSquare = isHint(r, c);
              const red = piece && isXiangqiRed(piece);
              const char = piece ? XIANGQI_PIECE_CHARS[piece] || piece : '';
              const pos = getPosStyle(r, c);

              return (
                <div
                  key={`${r}-${c}`}
                  className={`xiangqi-point ${selected ? 'point-selected' : ''} ${
                    last ? 'point-lastmove' : ''
                  } ${check ? 'point-check' : ''} ${hintSquare ? 'point-hint' : ''}`}
                  style={pos}
                  onClick={() => !readOnly && onSquareClick(r, c)}
                  role="button"
                  aria-label={piece ? `棋子 ${char}` : `空位 ${r},${c}`}
                >
                  {legal && !piece && (
                    <span className="legal-move-dot" />
                  )}
                  {legal && piece && (
                    <span className="legal-capture-ring" />
                  )}
                  {piece && (
                    <span
                      className={`xiangqi-piece ${red ? 'piece-red' : 'piece-black'} ${
                        selected ? 'piece-selected' : ''
                      }`}
                    >
                      {char}
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
};
