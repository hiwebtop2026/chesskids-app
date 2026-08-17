/**
 * ChessKids - 棋盘组件
 * 8x8 棋盘渲染，支持点击交互、合法走法高亮、提示等
 */

import React, { useMemo } from 'react';
import { ChessSquare } from './ChessSquare';
import type { Board } from '../types/chess';

export interface ChessBoardProps {
  board: Board;
  selectedSquare: [number, number] | null;
  legalTargets: [number, number][];
  lastMove: { from: [number, number]; to: [number, number] } | null;
  checkSquare: [number, number] | null;
  hint: { from: [number, number]; to: [number, number] } | null;
  highlightSquares?: [number, number][];
  onSquareClick: (row: number, col: number) => void;
  /** 是否翻转棋盘（黑方在下方） */
  flipped?: boolean;
  /** 是否只读（不允许交互） */
  readOnly?: boolean;
}

/** 棋盘组件 */
export const ChessBoard: React.FC<ChessBoardProps> = ({
  board,
  selectedSquare,
  legalTargets,
  lastMove,
  checkSquare,
  hint,
  highlightSquares = [],
  onSquareClick,
  flipped = false,
  readOnly = false,
}) => {
  const rows = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const cols = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];

  // 文件标记 a-h
  const fileLabels = flipped
    ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']
    : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  // 排标记 1-8
  const rankLabels = flipped
    ? ['1', '2', '3', '4', '5', '6', '7', '8']
    : ['8', '7', '6', '5', '4', '3', '2', '1'];

  const isLegalTarget = useMemo(
    () => (r: number, c: number) => legalTargets.some(([rr, cc]) => rr === r && cc === c),
    [legalTargets]
  );

  return (
    <div className="chess-board-wrapper">
      <div className="chess-board">
        {/* 顶部文件标记 */}
        <div className="board-labels files">
          {fileLabels.map((f) => (
            <span key={f} className="label-file">{f}</span>
          ))}
        </div>

        {/* 棋盘主体 + 左侧排标记 */}
        <div className="board-body">
          <div className="board-labels ranks">
            {rankLabels.map((r) => (
              <span key={r} className="label-rank">{r}</span>
            ))}
          </div>

          <div className="board-grid">
            {rows.map((r) =>
              cols.map((c) => {
                const piece = board[r][c];
                const isSelected =
                  selectedSquare !== null &&
                  selectedSquare[0] === r &&
                  selectedSquare[1] === c;
                const isLastMove =
                  lastMove !== null &&
                  ((lastMove.from[0] === r && lastMove.from[1] === c) ||
                    (lastMove.to[0] === r && lastMove.to[1] === c));
                const isCheck =
                  checkSquare !== null &&
                  checkSquare[0] === r &&
                  checkSquare[1] === c;
                const isHintFrom =
                  hint !== null && hint.from[0] === r && hint.from[1] === c;
                const isHintTo =
                  hint !== null && hint.to[0] === r && hint.to[1] === c;

                return (
                  <ChessSquare
                    key={`${r}-${c}`}
                    piece={piece}
                    row={r}
                    col={c}
                    isSelected={isSelected}
                    isLegalMove={isLegalTarget(r, c)}
                    isLastMove={isLastMove}
                    isCheck={isCheck}
                    isHint={isHintFrom || isHintTo}
                    onClick={readOnly ? () => {} : onSquareClick}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 高亮标记列表（用于教学演示） */}
      {highlightSquares.length > 0 && (
        <div className="highlight-legend">
          {highlightSquares.map(([r, c], i) => (
            <span key={i} className="highlight-chip">
              {fileLabels[flipped ? 7 - c : c]}{rankLabels[flipped ? 7 - r : r]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChessBoard;
