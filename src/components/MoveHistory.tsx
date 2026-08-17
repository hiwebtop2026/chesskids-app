/**
 * ChessKids - 走棋历史面板
 */

import React from 'react';
import type { MoveHistoryEntry } from '../types/chess';

export interface MoveHistoryProps {
  history: MoveHistoryEntry[];
  currentMove?: number;
}

/** 走棋历史 */
export const MoveHistory: React.FC<MoveHistoryProps> = ({ history, currentMove }) => {
  if (history.length === 0) {
    return (
      <div className="move-history">
        <h3>走棋记录</h3>
        <p className="empty-text">还没有走棋记录</p>
      </div>
    );
  }

  return (
    <div className="move-history">
      <h3>走棋记录</h3>
      <div className="history-list">
        <div className="history-header">
          <span className="col-move">#</span>
          <span className="col-white">白方</span>
          <span className="col-black">黑方</span>
        </div>
        {history.map((entry, i) => (
          <div
            key={i}
            className={`history-row ${currentMove === i ? 'current' : ''}`}
          >
            <span className="col-move">{entry.moveNumber}.</span>
            <span className="col-white">{entry.white || '...'}</span>
            <span className="col-black">{entry.black || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MoveHistory;
