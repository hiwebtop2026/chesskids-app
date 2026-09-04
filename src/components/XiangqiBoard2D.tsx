/**
 * ChessKids - 中国象棋 2D 棋盘组件
 * 传统中国象棋风格：棋子放在交叉点上
 * 棋子使用绝对定位，精确对齐棋盘线交叉点
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

const ROWS = 10;
const COLS = 9;

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

  // 计算棋子在棋盘上的百分比位置（相对于棋盘线区域）
  // 横线: y = 0%, 10%, 20%, ..., 90% （10条线，9个间隔）
  // 竖线: x = 0%, 12.5%, 25%, ..., 100% （9条线，8个间隔）
  const getPosStyle = (r: number, c: number) => ({
    left: `${(c / (COLS - 1)) * 100}%`,
    top: `${r * 10}%`,
  });

  // 生成棋盘线的 SVG
  const boardLines = useMemo(() => {
    const lines: JSX.Element[] = [];

    // 横线 10条
    for (let r = 0; r < ROWS; r++) {
      lines.push(
        <line
          key={`h${r}`}
          x1="0"
          y1={r * 10}
          x2="100"
          y2={r * 10}
          stroke="#5D4037"
          strokeWidth="0.8"
        />,
      );
    }

    // 竖线：中间7列在河界处断开，两边两列贯通
    for (let c = 0; c < COLS; c++) {
      const x = (c / (COLS - 1)) * 100;
      if (c === 0 || c === COLS - 1) {
        // 最左最右贯通
        lines.push(
          <line
            key={`v-${c}`}
            x1={x}
            y1="0"
            x2={x}
            y2="90"
            stroke="#5D4037"
            strokeWidth="1.2"
          />,
        );
      } else {
        // 上半段 (0 - 40)
        lines.push(
          <line
            key={`v-top-${c}`}
            x1={x}
            y1="0"
            x2={x}
            y2="40"
            stroke="#5D4037"
            strokeWidth="0.8"
          />,
        );
        // 下半段 (50 - 90)
        lines.push(
          <line
            key={`v-bottom-${c}`}
            x1={x}
            y1="50"
            x2={x}
            y2="90"
            stroke="#5D4037"
            strokeWidth="0.8"
          />,
        );
      }
    }

    // 九宫斜线 - 黑方（上）：col 3-5, row 0-2
    // x: 37.5 - 62.5, y: 0 - 20
    lines.push(
      <line key="pal-b1" x1="37.5" y1="0" x2="62.5" y2="20" stroke="#5D4037" strokeWidth="0.8" />,
      <line key="pal-b2" x1="62.5" y1="0" x2="37.5" y2="20" stroke="#5D4037" strokeWidth="0.8" />,
    );
    // 九宫斜线 - 红方（下）：col 3-5, row 7-9
    // x: 37.5 - 62.5, y: 70 - 90
    lines.push(
      <line key="pal-r1" x1="37.5" y1="70" x2="62.5" y2="90" stroke="#5D4037" strokeWidth="0.8" />,
      <line key="pal-r2" x1="62.5" y1="70" x2="37.5" y2="90" stroke="#5D4037" strokeWidth="0.8" />,
    );

    return lines;
  }, []);

  return (
    <div className="xiangqi-board-wrapper">
      <div className="xiangqi-board">
        {/* 棋盘线 SVG：宽 100，高 90（10条横线 y=0..90，9条竖线 x=0..100） */}
        <svg
          className="xiangqi-board-lines"
          viewBox="0 0 100 90"
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
