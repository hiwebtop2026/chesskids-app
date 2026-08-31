/**
 * ChessKids - 联网对战模块
 * 基于 PeerJS P2P，通过房间号/分享链接与好友对弈
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
  const [copied, setCopied] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);

  /** 页面加载时检查 URL 是否有房间号参数，有则自动加入 */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && room.length === 6) {
      setJoinInput(room.toUpperCase());
    }
  }, []);

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

  /** 生成分享链接 */
  const shareLink = roomCode
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : '';

  /** 复制分享链接 */
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：用 select + execCommand
      const input = document.createElement('input');
      input.value = shareLink;
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
      document.body.removeChild(input);
    }
  };

  /** 加入房间 */
  const handleJoin = () => {
    joinRoom(joinInput);
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
          <p>创建房间，将链接分享给好友，即可在线对弈！</p>
        </div>

        <div className="online-lobby">
          {/* 连接状态指示 */}
          {connectionStatus === 'connecting' && (
            <div className="lobby-status lobby-status-connecting">
              <span className="status-dot" />
              <span className="status-text">正在连接...</span>
            </div>
          )}

          {/* 通知提示 */}
          {notification && (
            <div className="notification-banner" onClick={clearNotification}>
              <span>{notification}</span>
              <button className="notification-close" aria-label="关闭通知" title="关闭通知">
                ✕
              </button>
            </div>
          )}

          {/* 创建房间卡片 */}
          <div className="lobby-card">
            <div className="lobby-icon">🎮</div>
            <h3>创建房间</h3>
            <p className="lobby-desc">
              创建一个新房间，将分享链接发给好友，等待对方加入即可开始对战。
            </p>
            <button
              className="lobby-primary-btn"
              onClick={createRoom}
              disabled={connectionStatus === 'connecting'}
            >
              {connectionStatus === 'connecting' ? '连接中...' : '创建房间'}
            </button>
          </div>

          {/* 加入房间卡片 */}
          <div className="lobby-card">
            <div className="lobby-icon">🔗</div>
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
                  if (e.key === 'Enter' && joinInput.length === 6) handleJoin();
                }}
              />
              <button
                className="lobby-primary-btn"
                onClick={handleJoin}
                disabled={joinInput.length !== 6 || connectionStatus === 'connecting'}
              >
                加入
              </button>
            </div>
          </div>

          {/* 说明 */}
          <div className="lobby-tips">
            <p>💡 <strong>小提示：</strong>无需注册，无需安装，直接在浏览器中与好友对弈。</p>
            <p>📡 采用 P2P 直连技术，走棋数据仅在你和好友之间传输。</p>
          </div>
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
        <p>
          房间号：<strong className="room-code-inline">{roomCode}</strong>
          {opponent && <span className="header-opponent"> · 对手：{opponent.name}</span>}
        </p>
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
          {/* 分享链接（仅房主且对手未加入时显示） */}
          {color === 'w' && !opponent && (
            <div className="share-link-card">
              <h3>📤 分享给好友</h3>
              <p className="share-desc">将下方链接或房间号发给好友，对方加入后即可开始对战。</p>
              <div className="share-link-group">
                <input
                  type="text"
                  className="share-link-input"
                  value={shareLink}
                  readOnly
                />
                <button className="share-copy-btn" onClick={copyShareLink}>
                  {copied ? '✓ 已复制' : '复制链接'}
                </button>
              </div>
              <div className="share-room-code">
                房间号：<strong>{roomCode}</strong>
              </div>
            </div>
          )}

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
                disabled={!chatInput.trim() || !opponent}
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
