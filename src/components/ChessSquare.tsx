/**
 * ChessKids - 棋盘格子组件
 */

import React from 'react';
import { ChessPiece3D } from './ChessPiece3D';

export interface ChessSquareProps {
  piece: string;
  row: number;
  col: number;
  isSelected: boolean;
  isLegalMove: boolean;
  isLastMove: boolean;
  isCheck: boolean;
  isHint: boolean;
  onClick: (row: number, col: number) => void;
}

/** 棋盘格子 */
export const ChessSquare: React.FC<ChessSquareProps> = ({
  piece,
  row,
  col,
  isSelected,
  isLegalMove,
  isLastMove,
  isCheck,
  isHint,
  onClick,
}) => {
  const isDark = (row + col) % 2 === 1;

  const classNames = [
    'chess-square',
    isDark ? 'dark' : 'light',
    isSelected && 'selected',
    isLegalMove && (piece ? 'capture-target' : 'legal-move'),
    isLastMove && 'last-move',
    isCheck && 'check',
    isHint && 'hint',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      onClick={() => onClick(row, col)}
      data-row={row}
      data-col={col}
    >
      {piece && <ChessPiece3D piece={piece} />}
      {isLegalMove && !piece && <span className="dot" />}
    </div>
  );
};

export default ChessSquare;
