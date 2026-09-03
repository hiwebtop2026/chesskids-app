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

/** 少儿友好表情包 */
const EMOJI_LIST = [
  '😀','😎','🤗','😋','😍','🤔','😱','😂','🥳','😴','🤩','😅','😆','😉','🥰','😜',
  '🐱','🐶','🐰','🦊','🐼','🦁','🐸','🐵','🐨','🐯','🐻','🐮','🐷','🐔','🐧','🦄',
  '👋','👍','👏','🙌','🤝','✌️','🤞','🙏','💪','🫡','🤙','👌','✊','🤚','🙋','🤟',
  '❤️','🔥','⭐','🎉','🎊','💯','✨','🌈','🌟','💎','🏆','🎁','🎈','🌸','☀️','🎶',
  '♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟','♟️','🎯','🎮','🧩',
];

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
  const [recordVolume, setRecordVolume] = useState(0); // 0-1 音量，用于波形动画
  const [isCancelling, setIsCancelling] = useState(false); // 滑动取消状态
  const recordSecondsRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumeAnimRef = useRef<number | null>(null);
  const recordStartYRef = useRef(0); // 记录按下时的 Y 坐标，用于滑动取消
  const maxRecordDuration = 15; // 最大录音时长 15 秒
  // 用 ref 跟踪录音状态，避免 async 导致的 stale closure
  const isRecordingRef = useRef(false);
  const isCancellingRef = useRef(false);
  const stopRecordingRef = useRef<() => void>(() => {});

  // 表情包面板
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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
      if (volumeAnimRef.current) cancelAnimationFrame(volumeAnimRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (processorNodeRef.current) { try { processorNodeRef.current.onaudioprocess = null; processorNodeRef.current.disconnect(); } catch {} }
      if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} }
      if (filterNodeRef.current) { try { filterNodeRef.current.disconnect(); } catch {} }
      if (gainNodeRef.current) { try { gainNodeRef.current.disconnect(); } catch {} }
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

  /** 开始录音（16kHz + 高通滤波 + 增益 + 音量分析，高质量语音采集） */
  const startRecording = useCallback(async (startY?: number) => {
    // 立即设置 ref，避免松开时 stale closure
    isRecordingRef.current = true;
    isCancellingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;

      // 复用 AudioContext
      let audioContext = audioContextRef.current;
      if (!audioContext || audioContext.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioCtx({ sampleRate: 16000 });
        audioContextRef.current = audioContext;
      }
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // 高通滤波器：去除低频噪音（空调、键盘等）
      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 300; // 300Hz 以下切掉
      filterNodeRef.current = highPass;

      // 增益节点：提升音量，让声音更清晰响亮
      const gain = audioContext.createGain();
      gain.gain.value = 1.8; // 1.8 倍增益
      gainNodeRef.current = gain;

      // 分析器节点：用于音量波形动画
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // 脚本处理节点：采集音频数据
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processor;

      audioChunksRef.current = [];

      // 音频链路：source → 高通滤波 → 增益 → 分析器 → 处理器 → 静音输出 → destination
      // 必须连到 destination，否则 ScriptProcessorNode.onaudioprocess 不触发
      source.connect(highPass);
      highPass.connect(gain);
      gain.connect(analyser);
      analyser.connect(processor);
      // 静音输出节点：保持音频图活跃但不产生回声
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        audioChunksRef.current.push(new Float32Array(input));
      };

      // 实时音量动画
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        // 计算平均音量（0-255 → 0-1）
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length / 255;
        setRecordVolume(Math.min(1, avg * 2.5)); // 放大显示
        volumeAnimRef.current = requestAnimationFrame(updateVolume);
      };
      volumeAnimRef.current = requestAnimationFrame(updateVolume);

      // 记录起始 Y 坐标（用于滑动取消）
      if (startY !== undefined) recordStartYRef.current = startY;

      setIsRecording(true);
      setRecordSeconds(0);
      setIsCancelling(false);
      isRecordingRef.current = true;
      isCancellingRef.current = false;
      recordSecondsRef.current = 0;
      recordTimerRef.current = setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
        // 到达最大时长自动停止并发送
        if (recordSecondsRef.current >= maxRecordDuration) {
          stopRecordingRef.current();
        }
      }, 1000);
    } catch (err) {
      isRecordingRef.current = false;
      isCancellingRef.current = false;
      setIsRecording(false);
      console.warn('[voice] 录音启动失败:', err);
    }
  }, [sendVoiceMessage]);

  /** 停止并发送录音 */
  const stopAndSendRecording = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (volumeAnimRef.current) {
      cancelAnimationFrame(volumeAnimRef.current);
      volumeAnimRef.current = null;
    }

    // 先停止处理回调，再断开节点
    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null;
      try { processorNodeRef.current.disconnect(); } catch {}
      processorNodeRef.current = null;
    }
    if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} analyserRef.current = null; }
    if (gainNodeRef.current) { try { gainNodeRef.current.disconnect(); } catch {} gainNodeRef.current = null; }
    if (filterNodeRef.current) { try { filterNodeRef.current.disconnect(); } catch {} filterNodeRef.current = null; }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch {}
      sourceNodeRef.current = null;
    }

    // 编码 WAV 并发送
    const audioContext = audioContextRef.current;
    const chunks = audioChunksRef.current;
    console.log('[voice] stopAndSend: chunks=', chunks.length, 'secs=', recordSecondsRef.current, 'ctx=', !!audioContext);
    if (audioContext && chunks.length > 0) {
      const wavBase64 = encodeWAVBase64(chunks, audioContext.sampleRate);
      const secs = recordSecondsRef.current;
      console.log('[voice] WAV size=', wavBase64.length, 'secs=', secs);
      if (secs >= 1 && wavBase64.length < 500000) {
        sendVoiceMessage(wavBase64, secs);
      } else if (secs < 1) {
        console.warn('[voice] 录音时间不足1秒，已丢弃');
      }
      // 挂起 AudioContext 而非关闭，允许复用
      try { audioContext.suspend(); } catch {}
    } else {
      console.warn('[voice] 无音频数据，chunks=', chunks.length);
    }

    // 停止麦克风
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordVolume(0);
    setIsCancelling(false);
    isRecordingRef.current = false;
    isCancellingRef.current = false;
  }, [sendVoiceMessage]);

  // 保持 ref 指向最新的 stopAndSendRecording
  stopRecordingRef.current = stopAndSendRecording;

  /** 取消录音 */
  const cancelRecording = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (volumeAnimRef.current) {
      cancelAnimationFrame(volumeAnimRef.current);
      volumeAnimRef.current = null;
    }
    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null;
      try { processorNodeRef.current.disconnect(); } catch {}
      processorNodeRef.current = null;
    }
    if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} analyserRef.current = null; }
    if (gainNodeRef.current) { try { gainNodeRef.current.disconnect(); } catch {} gainNodeRef.current = null; }
    if (filterNodeRef.current) { try { filterNodeRef.current.disconnect(); } catch {} filterNodeRef.current = null; }
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch {} sourceNodeRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.suspend(); } catch {} }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordVolume(0);
    setIsCancelling(false);
    setRecordSeconds(0);
    recordSecondsRef.current = 0;
    isRecordingRef.current = false;
    isCancellingRef.current = false;
  }, []);

  // ===== 按住说话交互 =====

  /** 按下开始录音（鼠标/触摸通用） */
  const handleRecordStart = useCallback((clientY: number) => {
    if (!opponent) return;
    startRecording(clientY);
  }, [opponent, startRecording]);

  /** 移动中检测是否滑动取消 */
  const handleRecordMove = useCallback((clientY: number) => {
    if (!isRecordingRef.current) return;
    const diff = recordStartYRef.current - clientY;
    const cancelling = diff > 60;
    isCancellingRef.current = cancelling;
    setIsCancelling(cancelling);
  }, []);

  /** 松开：如果在取消状态则取消，否则发送 */
  const handleRecordEnd = useCallback(() => {
    if (!isRecordingRef.current) return;
    if (isCancellingRef.current) {
      cancelRecording();
    } else {
      stopAndSendRecording();
    }
  }, [cancelRecording, stopAndSendRecording]);

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

            {/* 表情包面板 */}
            {showEmojiPicker && !isRecording && (
              <div className="emoji-picker-panel">
                {EMOJI_LIST.map((emoji, idx) => (
                  <button
                    key={idx}
                    className="emoji-item"
                    onClick={() => {
                      setChatInput((prev) => (prev + emoji).slice(0, 200));
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <div className="chat-input-group">
              <button
                className="chat-emoji-btn"
                onClick={() => setShowEmojiPicker((v) => !v)}
                disabled={!opponent || isRecording}
                title="表情"
                aria-label="表情"
              >
                😊
              </button>
              <button
                className={`chat-voice-btn ${isRecording ? (isCancelling ? 'voice-btn-cancel' : 'voice-btn-recording') : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleRecordStart(e.clientY);
                }}
                onMouseMove={(e) => {
                  handleRecordMove(e.clientY);
                }}
                onMouseUp={() => {
                  handleRecordEnd();
                }}
                onMouseLeave={() => {
                  if (isRecordingRef.current) handleRecordEnd();
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  handleRecordStart(touch.clientY);
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  handleRecordMove(touch.clientY);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleRecordEnd();
                }}
                disabled={!opponent}
                title="按住说话"
                aria-label="按住说话"
              >
                {isRecording ? (
                  <span className="voice-btn-timer">{recordSeconds}</span>
                ) : (
                  '🎤'
                )}
              </button>
              {/* 录音中：显示内联状态；非录音：显示输入框 */}
              {isRecording ? (
                <div className={`chat-recording-inline ${isCancelling ? 'recording-cancel-mode' : ''}`}>
                  <div className="recording-wave-inline">
                    {[...Array(5)].map((_, i) => (
                      <span
                        key={i}
                        className="wave-bar-inline"
                        style={{
                          height: `${Math.max(3, recordVolume * 24 * (0.5 + i * 0.15))}px`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="recording-hint-inline">
                    {isCancelling ? '松开取消' : '松开发送'}
                  </span>
                </div>
              ) : (
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
              )}
              {!isRecording && (
                <button
                  className="chat-send-btn"
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || !opponent}
                >
                  发送
                </button>
              )}
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
