/**
 * ChessKids - 联机对战模块
 * 基于 PeerJS P2P，通过房间号/分享链接与好友对弈
 * 支持浮动窗口最大化、语音消息、角色区分聊天
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ThreeJSChessBoard } from '../components/ThreeJSChessBoard';
import { MoveHistory } from '../components';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { findKing, isInCheck } from '../engine';

/** 格式化时间戳为 HH:MM */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 格式化录音秒数为 M:SS */
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 将 Float32 PCM 音频块编码为 WAV base64 data URL（所有浏览器通用播放） */
function encodeWAVBase64(chunks: Float32Array[], sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
  const dataLength = totalSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

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
    sendVoiceMessage,
    requestReset,
    clearNotification,
  } = useMultiplayerStore();

  const [joinInput, setJoinInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);

  // 浮动窗口状态
  const [isFloating, setIsFloating] = useState(false);
  const floatRef = useRef<HTMLDivElement>(null);

  // 语音录制状态
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 语音播放
  const audioPlayRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  /** 页面加载时检查 URL 是否有房间号参数 */
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

  /** 浮动模式：ESC 退出 */
  useEffect(() => {
    if (!isFloating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFloating(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFloating]);

  /** 清理录音资源 */
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (processorNodeRef.current) { try { processorNodeRef.current.disconnect(); } catch {} }
      if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch {} }
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} }
      if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); }
    };
  }, []);

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

  const handleJoin = () => {
    joinRoom(joinInput);
  };

  const handleSendChat = () => {
    sendChat(chatInput);
    setChatInput('');
  };

  /** 开始录音（Web Audio API + WAV 编码，全浏览器通用） */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx({ sampleRate: 8000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processor;

      audioChunksRef.current = [];

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        audioChunksRef.current.push(new Float32Array(input));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.warn('[voice] 录音启动失败:', err);
    }
  }, [sendVoiceMessage]);

  /** 停止并发送录音 */
  const stopAndSendRecording = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    // 断开音频节点
    if (processorNodeRef.current) { try { processorNodeRef.current.disconnect(); } catch {} processorNodeRef.current = null; }
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch {} sourceNodeRef.current = null; }

    // 编码 WAV 并发送
    const audioContext = audioContextRef.current;
    if (audioContext && audioChunksRef.current.length > 0) {
      const wavBase64 = encodeWAVBase64(audioChunksRef.current, audioContext.sampleRate);
      const secs = recordSeconds;
      if (wavBase64.length < 150000) {
        sendVoiceMessage(wavBase64, secs);
      } else {
        console.warn('[voice] WAV too large:', wavBase64.length, 'bytes');
      }
      try { audioContext.close(); } catch {}
      audioContextRef.current = null;
    }

    // 停止麦克风
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    audioChunksRef.current = [];
    setIsRecording(false);
  }, [sendVoiceMessage, recordSeconds]);

  /** 取消录音 */
  const cancelRecording = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (processorNodeRef.current) { try { processorNodeRef.current.disconnect(); } catch {} processorNodeRef.current = null; }
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch {} sourceNodeRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordSeconds(0);
  }, []);

  /** 播放/暂停语音消息 */
  const togglePlayVoice = (msgIndex: number, audioData: string) => {
    if (playingId === msgIndex) {
      if (audioPlayRef.current) {
        audioPlayRef.current.pause();
        audioPlayRef.current = null;
      }
      setPlayingId(null);
      return;
    }

    if (audioPlayRef.current) {
      audioPlayRef.current.pause();
      audioPlayRef.current = null;
    }

    const audio = new Audio(audioData);
    audio.onended = () => setPlayingId(null);
    audio.onerror = (e) => {
      console.warn('[voice] Playback error:', e, 'data prefix:', audioData.substring(0, 40));
      setPlayingId(null);
    };
    audioPlayRef.current = audio;
    setPlayingId(msgIndex);
    audio.play().catch((err) => {
      console.warn('[voice] play() rejected:', err, 'data prefix:', audioData.substring(0, 40));
      setPlayingId(null);
    });
  };

  /** 切换浮动最大化 */
  const toggleFloat = () => {
    if (!isFloating) {
      setIsFloating(true);
      if (floatRef.current?.requestFullscreen) {
        floatRef.current.requestFullscreen().catch(() => {});
      }
    } else {
      setIsFloating(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  /** 监听浏览器全屏变化 */
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && isFloating) {
        setIsFloating(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [isFloating]);

  /** 状态文案映射 */
  const statusText: Record<string, string> = {
    playing: '对局中',
    check: '被将军！',
    checkmate: '将死！',
    stalemate: '逼和',
    draw: '和棋',
  };

  /** 判断消息是否来自自己 */
  const isMyMessage = (from: string) => from !== 'system' && from === color;
  /** 判断消息是否来自房主 */
  const isHostMessage = (from: string) => from === 'w';

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
          {connectionStatus === 'connecting' && (
            <div className="lobby-status lobby-status-connecting">
              <span className="status-dot" />
              <span className="status-text">正在连接...</span>
            </div>
          )}

          {notification && (
            <div className="notification-banner" onClick={clearNotification}>
              <span>{notification}</span>
              <button className="notification-close" aria-label="关闭通知" title="关闭通知">
                ✕
              </button>
            </div>
          )}

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

          <div className="lobby-tips">
            <p>💡 <strong>小提示：</strong>无需注册，无需安装，直接在浏览器中与好友对弈。</p>
            <p>📡 采用 P2P 直连技术，走棋数据仅在你和好友之间传输。</p>
            <p>🎙️ 支持语音消息，对局中可发送语音与好友交流。</p>
          </div>
        </div>
      </div>
    );
  }

  // ================================================================
  // 对局界面（已进入房间）
  // ================================================================
  const gameContent = (
    <>
      {/* 浮动模式顶部工具栏 */}
      {isFloating && (
        <div className="float-toolbar">
          <span className="float-title">
            🌐 联网对战 · 房间 {roomCode}
          </span>
          <button className="float-restore-btn" onClick={toggleFloat} title="退出最大化">
            退出最大化
          </button>
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

      <div className={`game-layout ${isFloating ? 'game-layout-floating' : ''}`}>
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
              {opponent ? `${isHostMessage(opponent.color) ? '房主' : '对手'} · ${opponent.name}` : '等待对手加入...'}
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
            <span className="player-name">
              {color === 'w' ? '房主 · 你' : '对手 · 你'}
            </span>
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
                <span className="info-label">你的身份</span>
                <span className="info-value">
                  {color === 'w' ? '房主 · 白方' : '对手 · 黑方'}
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
              {/* 最大化按钮 */}
              <button
                className={`control-btn float-toggle-btn ${isFloating ? 'active' : ''}`}
                onClick={toggleFloat}
                title={isFloating ? '退出最大化' : '最大化棋盘'}
              >
                {isFloating ? '退出最大化' : '最大化'}
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
                chatMessages.map((msg, i) => {
                  const mine = isMyMessage(msg.from);
                  const host = isHostMessage(msg.from);
                  const roleLabel = host ? '房主' : '对手';

                  if (msg.from === 'system') {
                    return (
                      <div key={i} className="chat-message chat-message-system">
                        <span className="chat-text">{msg.message}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={i}
                      className={`chat-message chat-bubble ${mine ? 'chat-bubble-mine' : 'chat-bubble-other'} ${host ? 'chat-bubble-host' : 'chat-bubble-guest'}`}
                    >
                      <div className="chat-bubble-header">
                        <span className="chat-role-badge">
                          {mine ? '我' : roleLabel}
                        </span>
                        <span className="chat-time">{formatTime(msg.timestamp)}</span>
                      </div>
                      {msg.isVoice ? (
                        <div className="chat-voice-message">
                          <button
                            className="voice-play-btn"
                            onClick={() => msg.audioData && togglePlayVoice(i, msg.audioData)}
                            aria-label={playingId === i ? '暂停语音' : '播放语音'}
                          >
                            {playingId === i ? '⏸' : '▶'}
                          </button>
                          <span className="voice-duration">
                            {formatDuration(msg.duration || 0)}
                          </span>
                          <span className="voice-wave">~</span>
                        </div>
                      ) : (
                        <span className="chat-text">{msg.message}</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 录音中状态 */}
            {isRecording ? (
              <div className="chat-recording-bar">
                <span className="recording-dot" />
                <span className="recording-timer">{formatDuration(recordSeconds)}</span>
                <button className="recording-cancel" onClick={cancelRecording}>
                  取消
                </button>
                <button className="recording-send" onClick={stopAndSendRecording}>
                  发送
                </button>
              </div>
            ) : (
              <div className="chat-input-group">
                <button
                  className="chat-voice-btn"
                  onClick={startRecording}
                  disabled={!opponent}
                  title="发送语音消息"
                  aria-label="发送语音消息"
                >
                  🎙
                </button>
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
            )}
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
                  setIsFloating(false);
                }}
              >
                确认离开
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // 浮动窗口模式：渲染为 fixed 全屏覆盖层
  if (isFloating) {
    return (
      <div
        ref={floatRef}
        className="online-game-floating-overlay"
      >
        {gameContent}
      </div>
    );
  }

  // 正常模式
  return (
    <div className="module online-game">
      <div className="module-header">
        <h2>🌐 联网对战</h2>
        <p>
          房间号：<strong className="room-code-inline">{roomCode}</strong>
          {opponent && (
            <span className="header-opponent">
              {' '}· {isHostMessage(opponent.color) ? '房主' : '对手'}：{opponent.name}
            </span>
          )}
        </p>
      </div>
      {gameContent}
    </div>
  );
};

export default OnlineGame;
