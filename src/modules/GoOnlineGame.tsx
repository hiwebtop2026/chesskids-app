/**
 * ChessKids - 围棋联机对战模块
 * PeerJS P2P：创建/加入房间，同步落子，聊天+语音消息
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GoBoard } from '../components/GoBoard';
import {
  createGoGame, goPlayMove, goPass, isGoGameOver, goCountScore,
  type GoBoardSize, type GoGameState,
} from '../engine/go';
import { useGoMultiplayerStore } from '../store/goMultiplayerStore';

const EMOJI_LIST = ['😀', '😎', '🤗', '😋', '😍', '🤔', '😱', '😂', '🥳', '😴', '🤩', '😅', '👋', '👍', '👏', '🙌', '🤝', '✌️', '🙏', '💪', '❤️', '🔥', '⭐', '🎉', '🎊', '💯', '✨', '🌟', '🏆', '🎁', '🐱', '🐶', '🐰', '🦊', '🐼', '🦁'];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** PCM 音频块编码为 WAV base64 data URL */
function encodeWAVBase64(chunks: Float32Array[], sampleRate: number): string {
  const numChannels = 1, bitsPerSample = 16, bytesPerSample = bitsPerSample / 8;
  const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
  const dataLength = totalSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true); view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data'); view.setUint32(40, dataLength, true);
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

export const GoOnlineGame: React.FC<{ autoJoinRoom?: string | null }> = ({ autoJoinRoom }) => {
  const {
    connectionStatus, roomCode, myColor, opponentName,
    chatMessages, notification,
    createRoom, joinRoom, leaveRoom,
    sendMove, sendPass, sendResign, sendReset, sendChat, sendVoiceMessage,
    registerHandlers, clearNotification,
  } = useGoMultiplayerStore();

  const [size, setSize] = useState<GoBoardSize>(9);
  const [game, setGame] = useState<GoGameState>(() => createGoGame(9));
  const [joinInput, setJoinInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [result, setResult] = useState<{ title: string; detail: string; emoji: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const chatListRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<{ stream: MediaStream; chunks: Float32Array[]; ctx: AudioContext; recTimer: ReturnType<typeof setInterval> | null } | null>(null);

  const inGame = connectionStatus === 'connected';
  const myTurn = inGame && game.turn === myColor;

  // 自动加入房间
  useEffect(() => {
    if (autoJoinRoom && connectionStatus === 'disconnected') {
      const code = autoJoinRoom.trim().toUpperCase();
      if (code) joinRoom(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoinRoom, connectionStatus]);

  // 聊天自动滚动
  useEffect(() => {
    chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  // 注册对手动作处理器
  useEffect(() => {
    registerHandlers({
      onOpponentMove: (r, c) => {
        setGame((g) => {
          const next = goPlayMove(g, r, c);
          if (next) return next;
          return g;
        });
      },
      onOpponentPass: () => {
        setGame((g) => goPass(g));
      },
      onOpponentResign: () => {
        setResult({ title: '你赢了！', detail: '对手认输', emoji: '🎉' });
      },
      onOpponentReset: () => {
        setGame(createGoGame(size));
        setResult(null);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, registerHandlers]);

  // 双 pass 结束
  useEffect(() => {
    if (inGame && isGoGameOver(game)) {
      const c = goCountScore(game.board);
      const title = c.blackWins ? '黑胜' : '白胜';
      setResult({
        title,
        detail: `黑 ${Math.floor(c.black)}（子+地） · 白 ${Math.floor(c.white - 7.5)}（子+地，贴 7.5 目）`,
        emoji: '🤝',
      });
    }
  }, [game, inGame]);

  const handleClick = (r: number, c: number) => {
    if (!inGame || !myTurn || isGoGameOver(game)) return;
    const next = goPlayMove(game, r, c);
    if (!next) return;
    setGame(next);
    sendMove(r, c);
  };

  const handlePass = () => {
    if (!inGame || !myTurn || isGoGameOver(game)) return;
    const next = goPass(game);
    setGame(next);
    sendPass();
  };

  const handleResign = () => {
    if (!inGame || isGoGameOver(game)) return;
    sendResign();
    setResult({ title: '你输了', detail: '你认输了', emoji: '😢' });
  };

  const handleReset = () => {
    if (!inGame) return;
    sendReset();
    setGame(createGoGame(size));
    setResult(null);
  };

  const shareLink = useCallback(() => {
    if (!roomCode) return;
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('game', 'go');
    url.searchParams.set('room', roomCode);
    const link = url.toString();
    try {
      navigator.clipboard.writeText(link).then(() => {
        useGoMultiplayerStore.setState({ notification: '房间链接已复制，分享给好友即可对战！' });
      }).catch(() => {
        useGoMultiplayerStore.setState({ notification: `房间链接：${link}` });
      });
    } catch {
      useGoMultiplayerStore.setState({ notification: `房间链接：${link}` });
    }
  }, [roomCode]);

  const sendChatMessage = () => {
    const t = chatInput.trim();
    if (!t) return;
    sendChat(t);
    setChatInput('');
  };

  // ============ 语音录制 ============
  const startRecording = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      const bufferSize = 2048;
      const script = ctx.createScriptProcessor(bufferSize, 1, 1);
      const chunks: Float32Array[] = [];
      let recTimer: ReturnType<typeof setInterval> | null = null;
      script.onaudioprocess = (e: any) => {
        const data = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
      };
      source.connect(analyser);
      analyser.connect(script);
      script.connect(ctx.destination);
      mediaRef.current = { stream, chunks, ctx, recTimer: null };
      setRecording(true);
      setRecordingSec(0);
      recTimer = setInterval(() => setRecordingSec((s) => s + 1), 1000);
      mediaRef.current!.recTimer = recTimer;
    } catch {
      useGoMultiplayerStore.setState({ notification: '无法访问麦克风，请检查浏览器权限' });
    }
  };

  const stopRecording = () => {
    const rec = mediaRef.current;
    if (!rec) return;
    if (rec.recTimer) clearInterval(rec.recTimer);
    try { rec.ctx.close(); } catch {}
    try { rec.stream.getTracks().forEach((t) => t.stop()); } catch {}
    const duration = recordingSec;
    if (rec.chunks.length > 0 && duration > 0) {
      const audioData = encodeWAVBase64(rec.chunks, rec.ctx.sampleRate || 44100);
      sendVoiceMessage(audioData, duration);
    } else {
      useGoMultiplayerStore.setState({ notification: '录音时间太短，请至少录制 1 秒' });
    }
    mediaRef.current = null;
    setRecording(false);
    setRecordingSec(0);
  };

  // 未连接：房间界面
  if (!inGame) {
    return (
      <div className="module go-online">
        <div className="module-header">
          <h2>🌐 围棋联机对战</h2>
          <p>创建房间或输入房间号加入，与好友实时对弈</p>
        </div>
        <div className="online-setup">
          <div className="go-setup-row">
            <h3>棋盘大小</h3>
            <div className="go-option-group">
              {([9, 13, 19] as GoBoardSize[]).map((s) => (
                <button key={s} className={`go-opt ${size === s ? 'active' : ''}`} onClick={() => setSize(s)}>{s} 路</button>
              ))}
            </div>
          </div>
          <div className="online-actions">
            <button className="start-game-btn" onClick={async () => {
              const code = await createRoom();
              if (code) {
                setGame(createGoGame(size));
                setResult(null);
              }
            }}>
              🏠 创建房间
            </button>
            <div className="online-join-row">
              <input
                className="online-input"
                placeholder="输入 6 位房间号"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button className="ctrl-btn" onClick={async () => {
                if (joinInput.trim()) {
                  const ok = await joinRoom(joinInput);
                  if (ok) { setGame(createGoGame(size)); setResult(null); }
                }
              }}>
                🔗 加入房间
              </button>
            </div>
          </div>
          {connectionStatus === 'connecting' && <p className="online-status">正在连接…</p>}
          {roomCode && connectionStatus === 'connecting' && (
            <div className="room-info">
              <p>房间号：<strong>{roomCode}</strong></p>
              <button className="ctrl-btn" onClick={shareLink}>📋 复制房间链接分享</button>
              <p className="room-tip">把房间号或链接发给好友，好友加入后开始对局（房主执黑先手）</p>
            </div>
          )}
        </div>
        {notification && (
          <div className="online-notice" onClick={clearNotification}>{notification}</div>
        )}
      </div>
    );
  }

  // 对局界面
  const moveCount = game.moves.length;
  const lastMove = moveCount && !game.moves[moveCount - 1].pass
    ? [game.moves[moveCount - 1].r, game.moves[moveCount - 1].c] as [number, number]
    : null;

  return (
    <div className="module go-online">
      <div className="module-header">
        <h2>🌐 围棋联机 · {size} 路</h2>
        <p>
          房号 {roomCode} · 你执 {myColor === 'b' ? '⚫ 黑' : '⚪ 白'}
          {opponentName ? ` · 对手：${opponentName}` : ''}
        </p>
      </div>
      <div className="online-layout">
        <div className="game-board-section go-board-section">
          <GoBoard
            board={game.board}
            size={size}
            lastMove={lastMove}
            onIntersectionClick={handleClick}
            disabled={!myTurn || isGoGameOver(game)}
          />
          {!myTurn && !isGoGameOver(game) && (
            <div className="ai-thinking-overlay">
              <div className="thinking-indicator">
                <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
                <p>等待对方落子…</p>
              </div>
            </div>
          )}
        </div>

        <div className="game-side-panel go-side-panel">
          <div className="go-status-bar">
            <span className={`go-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
            <span>{isGoGameOver(game) ? '对局结束' : myTurn ? '轮到你落子' : '等待对方落子'}</span>
            <span className="go-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
          </div>
          <div className="go-controls">
            <button className="ctrl-btn" onClick={handlePass} disabled={!myTurn || isGoGameOver(game)}>🙏 Pass</button>
            <button className="ctrl-btn danger" onClick={handleResign} disabled={isGoGameOver(game)}>🏳️ 认输</button>
            <button className="ctrl-btn" onClick={handleReset}>🔄 重新开始</button>
            <button className="ctrl-btn" onClick={leaveRoom}>🚪 退出房间</button>
          </div>

          {/* 聊天面板 */}
          <div className="chat-panel">
            <div className="chat-header">
              <strong>💬 聊天</strong>
              <button className="chat-toggle" onClick={() => setChatOpen(!chatOpen)}>{chatOpen ? '收起' : '展开'}</button>
            </div>
            {chatOpen && (
              <>
                <div className="chat-list" ref={chatListRef}>
                  {chatMessages.length === 0 && <p className="empty-text">打个招呼吧～</p>}
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`chat-msg ${m.from === 'me' ? 'mine' : m.from === 'system' ? 'system' : 'opponent'}`}>
                      {m.isVoice ? (
                        <div className="chat-voice">
                          <button className="voice-play-btn" onClick={() => {
                            const audio = new Audio(m.audioData);
                            audio.play().catch(() => {});
                          }}>🔊</button>
                          <span>{m.duration}″</span>
                        </div>
                      ) : (
                        <span>{m.message}</span>
                      )}
                      <span className="chat-time">{formatTime(m.timestamp)}</span>
                    </div>
                  ))}
                </div>
                <div className="chat-emoji-row">
                  {EMOJI_LIST.slice(0, 12).map((e) => (
                    <button key={e} className="chat-emoji" onClick={() => sendChat(e)}>{e}</button>
                  ))}
                </div>
                <div className="chat-input-row">
                  <input
                    className="online-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendChatMessage(); }}
                    placeholder="输入消息…"
                  />
                  <button className="ctrl-btn" onClick={sendChatMessage}>发送</button>
                  <button className={`ctrl-btn voice-btn ${recording ? 'recording' : ''}`} onClick={recording ? stopRecording : startRecording}>
                    {recording ? `⏹ ${recordingSec}s` : '🎤'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {notification && <div className="online-notice" onClick={clearNotification}>{notification}</div>}
      {result && (
        <div className="game-result-modal go-result-modal">
          <div className="result-content">
            <button className="result-close-btn" onClick={() => setResult(null)}>✕</button>
            <div className="result-icon">{result.emoji}</div>
            <h3 className="result-title">{result.title}</h3>
            <p className="result-detail">{result.detail}</p>
            <button className="play-again-btn" onClick={handleReset}>再来一局</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoOnlineGame;
