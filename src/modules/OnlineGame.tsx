/**
 * ChessKids - 联网对战模块
 * 两种界面状态：大厅（创建/加入房间）和对局中（棋盘+聊天）
 */

import React, { useState, useRef, useEffect } from 'react';
import { ThreeJSChessBoard } from '../components/ThreeJSChessBoard';
import { MoveHistory } from '../components';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { findKing, isInCheck } from '../engine';

export const OnlineGame: React.FC = () => {
  const {
    connectionStatus,
    inGame,
    roomCode,
    color,
    opponent,
    board,
    turn,
    status,
    history,
    moves,
    lastMove,
    selection,
    chatMessages,
    notification,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    selectSquare,
    leaveRoom,
    sendChat,
    requestReset,
    clearNotification,
  } = useMultiplayerStore();

  const [joinInput, setJoinInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);

  /** 聊天列表自动滚动到底部 */
  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages]);

  /** 计算被将军的王所在格子 */
  const checkSquare: [number, number] | null = (() => {
    if (status === 'playing' || status === 'check') {
      const kingPos = findKing(board, turn === 'w');
      if (kingPos && isInCheck(board, turn === 'w')) {
        return kingPos;
      }
    }
    return null;
  })();

  const legalTargets = selection?.legalTargets || [];
  const isMyTurn = color !== null && turn === color;
  const isGameOver =
    status === 'checkmate' || status === 'stalemate' || status === 'draw';
  const boardReadOnly = !opponent || !isMyTurn || isGameOver;

  /** 加入房间 */
  const handleJoin = () => {
    joinRoom(joinInput);
    setJoinInput('');
  };

/** 发送聊天消息 */
  const handleSendChat = () => {
    sendChat(chatInput);
    setChatInput('');
  };

  /** 状态文案映射 */
  const statusText: Record<string, string> = {
    playing: '对局中',
    check: '被将军！',
    checkmate: '将死！',
    stalemate: '逼和',
    draw: '和棋',
  };

  // ================================================================
  // 大厅界面（未进入房间）
  // ================================================================
  if (!inGame) {
    return (
      <div className="module online-game">
        <div className="module-header">
          <h2>🌐 联网对战</h2>
          <p>与好友在线对弈，一决高下！</p>
        </div>

        <div className="online-lobby">
          {/* 连接状态指示 */}
          <div className={`lobby-status lobby-status-${connectionStatus}`}>
            <span className="status-dot" />
            <span className="status-text">
              {connectionStatus === 'connected' && '已连接服务器'}
              {connectionStatus === 'connecting' && '正在连接服务器...'}
              {connectionStatus === 'disconnected' && '未连接服务器'}
            </span>
          </div>

          {/* 通知提示 */}
          {notification && (
            <div className="notification-banner" onClick={clearNotification}>
              <span>{notification}</span>
              <button className="notification-close" aria-label="关闭通知" title="关闭通知">
                ✕
              </button>
            </div>
          )}

          {connectionStatus !== 'connected' ? (
            /* 未连接：显示连接按钮 */
            <div className="lobby-card">
              <h3>第一步：连接服务器</h3>
              <p className="lobby-desc">
                请先连接到对战服务器，然后即可创建或加入房间开始在线对局。
              </p>
              <button
                className="lobby-primary-btn"
                onClick={connect}
                disabled={connectionStatus === 'connecting'}
              >
                {connectionStatus === 'connecting' ? '连接中...' : '连接服务器'}
              </button>
            </div>
          ) : (
            /* 已连接：显示创建/加入房间 */
            <>
              <div className="lobby-card">
                <h3>创建房间</h3>
                <p className="lobby-desc">
                  创建一个新房间，将房间号分享给好友，等待对方加入即可开始对战。
                </p>
                <button className="lobby-primary-btn" onClick={createRoom}>
                  创建房间
                </button>
              </div>

              <div className="lobby-card">
                <h3>加入房间</h3>
                <p className="lobby-desc">输入好友分享的 6 位房间号，加入对战。</p>
                <div className="lobby-input-group">
                  <input
                    type="text"
                    className="lobby-input"
                    placeholder="6位字母数字"
                    maxLength={6}
                    value={joinInput}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                      setJoinInput(val);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleJoin();
                    }}
                  />
                  <button
                    className="lobby-primary-btn"
                    onClick={handleJoin}
                    disabled={joinInput.length !== 6}
                  >
                    加入
                  </button>
                </div>
              </div>

              <button className="lobby-secondary-btn" onClick={disconnect}>
                断开连接
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ================================================================
  // 对局界面（已进入房间）
  // ================================================================
  return (
    <div className="module online-game">
      <div className="module-header">
        <h2>🌐 联网对战</h2>
        <p>房间号：{roomCode}</p>
      </div>

      {/* 通知提示 */}
      {notification && (
        <div className="notification-banner" onClick={clearNotification}>
          <span>{notification}</span>
          <span className="notification-close">x</span>
        </div>
      )}

      <div className="game-layout">
        {/* 左侧：棋盘区域 */}
        <div className="game-board-section">
          {/* 对手信息栏 */}
          <div className="online-player-bar opponent">
            <span
              className={`color-badge ${opponent ? `color-${opponent.color}` : ''}`}
            >
              {opponent
                ? opponent.color === 'w'
                  ? '白'
                  : '黑'
                : '?'}
            </span>
            <span className="player-name">
              {opponent ? opponent.name : '等待对手加入...'}
            </span>
          </div>

          <ThreeJSChessBoard
            board={board}
            selectedSquare={selection?.from || null}
            legalTargets={legalTargets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            hint={null}
            onSquareClick={selectSquare}
            flipped={color === 'b'}
            readOnly={boardReadOnly}
          />

          {/* 自己的信息栏 */}
          <div className="online-player-bar me">
            <span className={`color-badge color-${color}`}>
              {color === 'w' ? '白' : '黑'}
            </span>
            <span className="player-name">你</span>
            <span className="turn-indicator">
              {!opponent
                ? '等待对手...'
                : isMyTurn
                  ? '轮到你走棋'
                  : '等待对手走棋...'}
            </span>
          </div>

          {/* 等待对手遮罩 */}
          {!opponent && (
            <div className="ai-thinking-overlay">
              <div className="thinking-indicator">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <p>等待对手加入...</p>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：信息面板 */}
        <div className="game-side-panel">
          {/* 对局信息与控制 */}
          <div className="game-controls">
            <div className="online-game-info">
              <div className="info-row">
                <span className="info-label">房间号</span>
                <span className="info-value room-code-display">{roomCode}</span>
              </div>
              <div className="info-row">
                <span className="info-label">你的颜色</span>
                <span className="info-value">
                  {color === 'w' ? '白方' : '黑方'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">当前回合</span>
                <span className="info-value">
                  {turn === 'w' ? '白方' : '黑方'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">游戏状态</span>
                <span className={`info-value status-text-${status}`}>
                  {statusText[status] || '对局中'}
                </span>
              </div>
            </div>

            <div className="control-group">
              <button
                className="control-btn reset-btn"
                onClick={requestReset}
                disabled={!opponent}
              >
                重开游戏
              </button>
              <button className="control-btn reset-btn" onClick={() => setShowLeaveConfirm(true)}>
                离开房间
              </button>
            </div>
          </div>

          {/* 走棋历史 */}
          <MoveHistory history={history} />

          {/* 聊天面板 */}
          <div className="online-chat">
            <h3>聊天</h3>
            <div className="chat-messages" ref={chatListRef}>
              {chatMessages.length === 0 ? (
                <p className="empty-text">暂无消息，和对手打个招呼吧！</p>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`chat-message chat-message-${msg.from}`}
                  >
                    {msg.from !== 'system' && (
                      <span className="chat-sender">
                        {msg.from === color ? '我' : '对手'}：
                      </span>
                    )}
                    <span className="chat-text">{msg.message}</span>
                  </div>
                ))
              )}
            </div>
            <div className="chat-input-group">
              <input
                type="text"
                className="chat-input"
                placeholder="输入消息..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChat();
                }}
                maxLength={200}
              />
              <button
                className="chat-send-btn"
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
              >
                发送
              </button>
            </div>
          </div>

          {/* 游戏结束弹窗 */}
          {isGameOver && (
            <div className="game-result-modal">
              <div className="result-content">
                <div className="result-icon">
                  {status === 'checkmate' &&
                    (turn === color ? '😢' : '🎉')}
                  {status === 'stalemate' && '🤝'}
                  {status === 'draw' && '🤝'}
                </div>
                <h3 className="result-title">
                  {status === 'checkmate' &&
                    (turn === color ? '你输了' : '你赢了！')}
                  {status === 'stalemate' && '逼和（平局）'}
                  {status === 'draw' && '和棋'}
                </h3>
                <p className="result-detail">共走了 {moves.length} 步</p>
                <button className="play-again-btn" onClick={requestReset}>
                  再来一局
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 离开房间确认弹窗 */}
      {showLeaveConfirm && (
        <div className="game-result-modal" onClick={() => setShowLeaveConfirm(false)}>
          <div className="result-content" onClick={(e) => e.stopPropagation()}>
            <button className="result-close-btn" onClick={() => setShowLeaveConfirm(false)}>
              ✕
            </button>
            <div className="result-icon">🚪</div>
            <h3 className="result-title">确认离开房间？</h3>
            <p className="result-detail">离开后当前对局将中断，确认离开吗？</p>
            <div className="confirm-buttons">
              <button className="control-btn cancel-btn" onClick={() => setShowLeaveConfirm(false)}>
                取消
              </button>
              <button
                className="control-btn confirm-reset-btn"
                onClick={() => {
                  leaveRoom();
                  setShowLeaveConfirm(false);
                }}
              >
                确认离开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineGame;
