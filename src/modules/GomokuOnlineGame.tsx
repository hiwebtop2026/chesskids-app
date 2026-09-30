/**
 * ChessKids - 五子棋联机对战模块
 * PeerJS P2P：创建/加入房间，同步落子，聊天+语音消息，认输/重开
 */
import React, { useEffect, useRef, useState } from 'react';
import { GomokuBoard } from '../components/GomokuBoard';
import { ThreeJSGomokuBoard } from '../components/ThreeJSGomokuBoard';
import {
  createGomokuGame, gomokuPlayMove, findGomokuWinningLine,
  type GomokuGameState,
} from '../engine/gomoku';
import { useGomokuMultiplayerStore } from '../store/gomokuMultiplayerStore';
import { GomokuResultFX } from '../components/GomokuResultFX';
import { playGomokuMove } from '../engine/gomokuSound';
import { enterFullscreen } from '../utils/fullscreen';

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

export const GomokuOnlineGame: React.FC<{ autoJoinRoom?: string | null }> = ({ autoJoinRoom }) => {
  const {
    connectionStatus, roomCode, myColor, opponentName,
    chatMessages, notification,
    createRoom, joinRoom,
    sendMove, sendResign, sendReset, sendChat, sendVoiceMessage,
    registerHandlers, clearNotification,
  } = useGomokuMultiplayerStore();

  const [game, setGame] = useState<GomokuGameState>(() => createGomokuGame());
  const [joinInput, setJoinInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 复制房间号（点击按钮或长按房间号均可触发）
  const copyRoomCode = () => {
    if (!roomCode) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(roomCode).catch(() => fallbackCopy(roomCode));
      } else {
        fallbackCopy(roomCode);
      }
    } catch {
      fallbackCopy(roomCode);
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };
  const fallbackCopy = (text: string) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch { /* 忽略复制失败 */ }
  };
  const roomLongPressProps = {
    onTouchStart: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(copyRoomCode, 400); },
    onTouchEnd: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); },
    onTouchMove: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); },
    onClick: copyRoomCode,
    title: '点击或长按复制房间号',
  };
  // 默认 2D 棋盘（启动即 2D + 浮动全屏）
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  /** 浮动状态（棋盘组件上报）：区分内嵌/浮动渲染结算弹窗与按钮 */
  const [floating, setFloating] = useState(false);
  /** 日夜模式（localStorage 持久化） */
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (typeof localStorage !== 'undefined' ? (localStorage.getItem('gomoku-theme') === 'dark' ? 'dark' : 'light') : 'light'));
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('gomoku-theme', next); } catch { /* ignore */ }
      return next;
    });
  };
  const [result, setResult] = useState<{ title: string; detail: string; emoji: string; winningLine: Array<[number, number]> | null } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const chatListRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<{ stream: MediaStream; chunks: Float32Array[]; ctx: AudioContext; recTimer: ReturnType<typeof setInterval>; processor: ScriptProcessorNode | null; source: MediaStreamAudioSourceNode | null } | null>(null);

  // 创建房间/加入房间后（connecting=等待对手）立即进入游戏界面（2D 棋盘），对手加入后（connected）才可落子
  const inGame = connectionStatus !== 'disconnected';
  const myTurn = connectionStatus === 'connected' && game.turn === myColor;

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
          const next = gomokuPlayMove(g, r, c);
          if (next) {
            playGomokuMove();
            if (next.over) {
              const winningLine = next.winner && next.winner !== 'draw' ? findGomokuWinningLine(next.board, next.winner) : null;
              setResult({
                title: next.winner === 'draw' ? '和棋' : `${next.winner === 'b' ? '黑棋' : '白棋'}获胜！`,
                detail: `共 ${next.moves.length} 手`,
                emoji: next.winner === 'draw' ? '🤝' : next.winner === myColor ? '🎉' : '😔',
                winningLine,
              });
            }
          }
          return next || g;
        });
      },
      onOpponentResign: () => {
        setResult({ title: '你赢了！', detail: '对手认输', emoji: '🎉', winningLine: null });
      },
      onOpponentReset: () => {
        setGame(createGomokuGame());
        setResult(null);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerHandlers]);

  const handleClick = (r: number, c: number) => {
    if (connectionStatus !== 'connected' || !myTurn || game.over) return;
    const next = gomokuPlayMove(game, r, c);
    if (!next) return;
    setGame(next);
    playGomokuMove();
    sendMove(r, c);
    if (next.over) {
      const winningLine = next.winner && next.winner !== 'draw' ? findGomokuWinningLine(next.board, next.winner) : null;
      setResult({
        title: next.winner === 'draw' ? '和棋' : `${next.winner === 'b' ? '黑棋' : '白棋'}获胜！`,
        detail: `共 ${next.moves.length} 手`,
        emoji: next.winner === 'draw' ? '🤝' : next.winner === myColor ? '🎉' : '😔',
        winningLine,
      });
    }
  };

  const handleResign = () => {
    if (!inGame || game.over) return;
    sendResign();
    setResult({ title: '你输了', detail: '你认输了', emoji: '😢', winningLine: null });
  };

  const handleReset = () => {
    if (!inGame) return;
    sendReset();
    setGame(createGomokuGame());
    setResult(null);
  };

  // ---- 语音录制 ----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      source.connect(processor);
      processor.connect(ctx.destination);
      processor.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      let sec = 0;
      const recTimer = setInterval(() => { sec++; setRecordingSec(sec); }, 1000);
      mediaRef.current = { stream, chunks, ctx, recTimer, processor, source };
      setRecording(true);
      setRecordingSec(0);
    } catch (err) {
      console.error('[gomoku] mic error:', err);
      useGomokuMultiplayerStore.setState({ notification: '无法访问麦克风，请检查权限设置' });
    }
  };

  const stopRecording = () => {
    const rec = mediaRef.current;
    if (!rec) return;
    clearInterval(rec.recTimer);
    try { rec.processor?.disconnect(); } catch {}
    try { rec.source?.disconnect(); } catch {}
    try { rec.stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { rec.ctx.close(); } catch {}
    mediaRef.current = null;
    setRecording(false);
    if (rec.chunks.length > 0) {
      const sampleRate = rec.ctx.sampleRate || 48000;
      const dataUrl = encodeWAVBase64(rec.chunks, sampleRate);
      sendVoiceMessage(dataUrl, recordingSec);
    }
  };

  // ---- 界面 ----
  const lastMove = game.moves.length ? [game.moves[game.moves.length - 1].r, game.moves[game.moves.length - 1].c] as [number, number] : null;
  const moveCount = game.moves.length;

  const lobby = (
    <div className="gomoku-lobby">
      <div className="gomoku-lobby-card">
        <h3>🏠 创建房间</h3>
        <p>创建一个房间，分享房间号给好友即可开始对局</p>
        <button className="start-game-btn" onClick={async () => { await createRoom(); }}>➕ 创建房间</button>
        {roomCode && connectionStatus !== 'connected' && (
          <div className="gomoku-room-code">
            <span>房间号：</span>
            <strong>{roomCode}</strong>
            <button className="copy-btn" onClick={() => { navigator.clipboard?.writeText(roomCode); }}>📋 复制</button>
          <button className="copy-btn" onClick={() => enterFullscreen()} title="全屏隐藏浏览器窗口">⛶ 全屏</button>
          </div>
        )}
      </div>
      <div className="gomoku-lobby-divider"><span>或</span></div>
      <div className="gomoku-lobby-card">
        <h3>🚪 加入房间</h3>
        <div className="gomoku-join-row">
          <input
            className="gomoku-join-input"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
            placeholder="输入房间号"
            maxLength={7}
          />
          <button className="start-game-btn" onClick={() => { joinRoom(joinInput); enterFullscreen(); }}>加入</button>
        </div>
      </div>
    </div>
  );

  // 2D/3D 切换：集成到棋盘容器按钮栏（浮动全屏下也可操作）
  const viewSwitchOnline = (
    <div className="view-switch-inboard">
      <button className={`view-tab-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')} title="切换 3D 棋盘">🀄 3D</button>
      <button className={`view-tab-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')} title="切换 2D 棋盘">📐 2D</button>
      {viewMode === '3d' && <button className={`view-tab-btn chat-btn ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen((v) => !v)}>💬 聊天</button>}
    </div>
  );

  // 浮动全屏时的顶部状态胶囊（棋盘容器内嵌，脱离侧栏）
  const floatStatus = (
    <div className="gomoku-float-status">
      <span className={`gomoku-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
      <span>
        {connectionStatus === 'connecting' ? '⏳ 等待对手加入…' : game.over ? '对局结束' : myTurn ? '轮到你落子' : `等待 ${opponentName || '对手'} 落子`}
      </span>
      <span className="gomoku-float-status-pill">执{myColor === 'b' ? '黑' : '白'}</span>
      <span className="gomoku-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
    </div>
  );

  // 浮动窗口模式棋盘上方：左房间号、中状态胶囊、右聊天；下方：左 3D、中认输/重开/夜间、右 2D
  const floatTopBar = (
    <div className="gomoku-board-topbar gomoku-float-topbar">
      <button className="gomoku-corner-btn" onClick={copyRoomCode} title="复制房间号发送给好友">{copied ? '✅ 已复制' : '📋 房间号'}</button>
      {floatStatus}
      <button className={`gomoku-corner-btn ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen((v) => !v)} title="聊天">💬 聊天</button>
    </div>
  );
  const floatBottomBar = (
    <div className="gomoku-board-bottombar gomoku-float-bottombar">
      <button className={`gomoku-corner-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')} title="切换 3D 棋盘">🀄 3D</button>
      <div className="gomoku-bottom-center">
        <button className="gomoku-corner-btn danger" onClick={handleResign} disabled={game.over || connectionStatus !== 'connected'}>🏳️ 认输</button>
        <button className="gomoku-corner-btn" onClick={handleReset} disabled={connectionStatus !== 'connected'}>🔄 重新开始</button>
        <button className="gomoku-corner-btn" onClick={toggleTheme} title="日夜模式切换">{theme === 'dark' ? '☀️ 日间' : '🌙 夜间'}</button>
      </div>
      <button className={`gomoku-corner-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')} title="切换 2D 棋盘">📐 2D</button>
    </div>
  );

  // 内嵌模式（非浮动）棋盘上方按钮：左房间号复制、右聊天（联机无悔棋/提示，用联机高频功能替代）
  const inBoardTopBar = (
    <div className="gomoku-board-topbar">
      <button className="gomoku-corner-btn" onClick={copyRoomCode} title="复制房间号发送给好友">{copied ? '✅ 已复制' : '📋 房间号'}</button>
      <button className={`gomoku-corner-btn ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen((v) => !v)} title="聊天">💬 聊天</button>
    </div>
  );
  // 内嵌模式棋盘下方按钮：左 3D、右 2D 切换
  const inBoardBottomBar = (
    <div className="gomoku-board-bottombar">
      <button className={`gomoku-corner-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')} title="切换 3D 棋盘">🀄 3D</button>
      <button className={`gomoku-corner-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')} title="切换 2D 棋盘">📐 2D</button>
    </div>
  );

  // 内嵌模式（非浮动）结算弹窗：只在棋盘容器内显示（不叠加到浏览器窗口/侧栏，避免重复）
  const inBoardResultModal = result && (
    <div className="gomoku-inboard-modal gomoku-inboard-result-modal">
      <div className="result-content">
        <button className="result-close-btn" onClick={() => setResult(null)}>✕</button>
        <div className="result-icon">{result.emoji}</div>
        <h3 className="result-title">{result.title}</h3>
        <p className="result-detail">{result.detail}</p>
        <button className="play-again-btn" onClick={handleReset}>再来一局</button>
      </div>
    </div>
  );

  // 聊天面板：2D 模式作为棋盘容器 children 渲染（浮动层内，不跳出窗口）；3D 模式显示在侧栏
  const chatPanelEl = (
    <div className={`gomoku-chat-panel ${chatOpen ? 'open' : ''} ${viewMode === '2d' ? 'float-inboard' : ''}`}>
      <div className="gomoku-chat-header">
        <span>💬 聊天室</span>
        <span className="gomoku-chat-opponent">{opponentName || '对手'}</span>
      </div>
      <div className="gomoku-chat-list" ref={chatListRef}>
        {chatMessages.length === 0 && <p className="empty-text">还没有消息，打个招呼吧！</p>}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`gomoku-chat-msg ${msg.from}`}>
            <span className="gomoku-chat-time">{formatTime(msg.timestamp)}</span>
            {msg.isVoice ? (
              <audio controls src={msg.audioData} style={{ height: 30 }} />
            ) : (
              <span className="gomoku-chat-text">{msg.message}</span>
            )}
          </div>
        ))}
      </div>
      <div className="gomoku-chat-emoji">
        {EMOJI_LIST.map((e) => (
          <button key={e} className="emoji-btn" onClick={() => sendChat(e)}>{e}</button>
        ))}
      </div>
      <div className="gomoku-chat-input-row">
        <input
          className="gomoku-chat-input"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && chatInput.trim()) { sendChat(chatInput); setChatInput(''); } }}
          placeholder="发送消息…"
        />
        <button className="send-btn" onClick={() => { if (chatInput.trim()) { sendChat(chatInput); setChatInput(''); } }}>发送</button>
        {recording ? (
          <button className="rec-btn recording" onClick={stopRecording}>🔴 {recordingSec}s</button>
        ) : (
          <button className="rec-btn" onClick={startRecording} title="按住说话">🎤</button>
        )}
      </div>
    </div>
  );

  return (
    <div className={`module gomoku-game${theme === 'dark' ? ' gomoku-theme-dark' : ''}`}>
      <div className="module-header">
        <h2>🌐 五子棋 · 联机对战</h2>
        <p>
          {inGame ? (
            <>
              房间{' '}
              <button className={`gomoku-room-code ${copied ? 'copied' : ''}`} {...roomLongPressProps}>
                {copied ? '✅ 已复制' : `📋 ${roomCode}`}
              </button>
              {' '}· {myColor === 'b' ? '⚫ 黑棋' : '⚪ 白棋'}
            </>
          ) : (
            '创建或加入房间，与好友实时对战'
          )}
        </p>
      </div>

      {!inGame ? lobby : (
        <div className="game-layout" style={viewMode === '2d' && !floating ? { display: 'flex', justifyContent: 'center' } : undefined}>
          <div className="game-board-section gomoku-board-section" style={viewMode === '2d' && !floating ? { paddingTop: 104, paddingBottom: 76 } : undefined}>
            {viewMode === '3d' ? (
              <ThreeJSGomokuBoard
                board={game.board}
                lastMove={lastMove}
                winningLine={result?.winningLine || null}
                onIntersectionClick={handleClick}
                disabled={!inGame || !myTurn}
                flipped={myColor === 'w'}
                theme={theme}
              />
            ) : (
              <GomokuBoard
                board={game.board}
                lastMove={lastMove}
                winningLine={result?.winningLine || null}
                onIntersectionClick={handleClick}
                disabled={!inGame || !myTurn}
                flipped={myColor === 'w'}
                defaultFloating
                theme={theme}
                onFloatChange={setFloating}
              >
                {viewMode === '2d' && floating && floatTopBar}
                {viewMode === '2d' && !floating && inBoardTopBar}
                {viewMode === '2d' && floating && floatBottomBar}
                {viewMode === '2d' && !floating && inBoardBottomBar}
                {chatOpen && viewMode === '2d' && chatPanelEl}
                {viewMode === '2d' && inBoardResultModal}
                {result && (
                  <GomokuResultFX kind={result.emoji === '🎉' ? 'win' : result.title === '和棋' ? 'draw' : 'lose'} label={result.title} />
                )}
              </GomokuBoard>
            )}
            {viewMode === '3d' && result && (
              <GomokuResultFX kind={result.emoji === '🎉' ? 'win' : result.title === '和棋' ? 'draw' : 'lose'} label={result.title} />
            )}
          </div>

          {viewMode === '3d' && (
          <div className="game-side-panel gomoku-side-panel">
            <div className="gomoku-status-bar">
              <span className={`gomoku-turn-dot ${game.turn === 'b' ? 'black' : 'white'}`} />
              <span>
                {connectionStatus === 'connecting' ? '⏳ 等待对手加入…' : game.over ? '对局结束' : myTurn ? '轮到你落子' : `等待 ${opponentName || '对手'} 落子`}
              </span>
              <span className="gomoku-move-count">第 {Math.floor(moveCount / 2) + 1} 手</span>
            </div>
            {viewSwitchOnline}
            {viewMode === '3d' && (
              <div className="gomoku-controls">
                <button className="ctrl-btn" onClick={copyRoomCode}>{copied ? '✅ 已复制' : '📋 房间号'}</button>
                <button className="ctrl-btn danger" onClick={handleResign} disabled={game.over || connectionStatus !== 'connected'}>🏳️ 认输</button>
                <button className="ctrl-btn" onClick={handleReset} disabled={connectionStatus !== 'connected'}>🔄 重新开始</button>
              </div>
            )}

            {/* 聊天面板（3D 模式显示在侧栏；2D 模式渲染在棋盘容器内） */}
            {viewMode === '3d' && chatPanelEl}

            <div className="gomoku-move-history">
              <h3>落子记录</h3>
              {moveCount === 0 ? <p className="empty-text">暂无落子</p> : (
                <div className="gomoku-move-list">
                  {Array.from({ length: Math.ceil(moveCount / 2) }).map((_, i) => {
                    const b = game.moves[i * 2];
                    const w = game.moves[i * 2 + 1];
                    const fmt = (m: GomokuGameState['moves'][0]) => `${m.color === 'b' ? '⚫' : '⚪'}(${m.r + 1},${m.c + 1})`;
                    return (
                      <div key={i} className="gomoku-move-row">
                        <span className="gomoku-move-no">{i + 1}.</span>
                        <span>{b ? fmt(b) : ''}</span>
                        <span>{w ? fmt(w) : ''}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {result && (
              <div className="game-result-modal gomoku-result-modal">
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
          )}
        </div>
      )}

      {notification && (
        <div className="gomoku-notification" onClick={clearNotification}>
          {notification}
        </div>
      )}
    </div>
  );
};

export default GomokuOnlineGame;
