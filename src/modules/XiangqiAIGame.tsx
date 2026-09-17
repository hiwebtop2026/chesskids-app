/**
 * ChessKids - 中国象棋人机对战模块
 * 参考国际象棋"人机对局"设计：难度可选、走子提示、悔棋（含AI一步）、思考提示
 */
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { XiangqiBoard2D, type XiangqiBoard2DHandle } from '../components/XiangqiBoard2D';
import {
  unlockAudio,
  playSfx,
  setMusicEnabled,
  setSfxEnabled,
  isMusicEnabled,
  isSfxEnabled,
  initAudioAutoPause,
  cycleBgmTrack,
  getBgmVolume,
  setBgmVolume,
  BGM_TRACKS,
} from '../utils/sound';
import { ThreeJSXiangqiBoard } from '../components/ThreeJSXiangqiBoard';
import {
  XIANGQI_INITIAL_BOARD,
  cloneXiangqiBoard,
  applyXiangqiMove,
  getAllXiangqiLegalMoves,
  getXiangqiGameStatusAdvanced,
  getXiangqiMoveNotation,
  findXiangqiKing,
  isXiangqiRed,
} from '../engine/xiangqi';
import { xiangqiBestMoveAsync } from '../utils/xiangqiAIAsync';
import type { XiangqiAIDifficulty } from '../engine/xiangqiAI';
import { isXiangqiGameOver } from '../types/xiangqi';
import type {
  XiangqiBoard,
  XiangqiColor,
  XiangqiSquare,
  XiangqiMove,
  XiangqiGameStatus,
  XiangqiMoveHistoryEntry,
} from '../types/xiangqi';
import { supportsWebGL } from '../utils/webgl';
import { BoardFloatingWindow } from '../components/BoardFloatingWindow';
import {
  getLearningProfile,
  recordGameResult,
  getRank,
  resolveAiDifficulty,
  getLearnedPieceBias,
  saveLearningProfile,
  type XiangqiGameResult,
} from '../engine/xiangqiLearning';
import { initEngineWeights, trainSelfPlayAsync } from '../utils/xiangqiAIAsync';

const PLAYER_NAMES: Record<XiangqiColor, string> = { r: '红方', b: '黑方' };
const STATUS_TEXT: Record<XiangqiGameStatus, (turn: XiangqiColor) => string> = {
  playing: (t) => `轮到 ${PLAYER_NAMES[t]} 走棋`,
  check: (t) => `${PLAYER_NAMES[t]} 被将军！请应将`,
  checkmate: (t) => `绝杀！${PLAYER_NAMES[t === 'r' ? 'b' : 'r']} 获胜！`,
  stalemate: () => '困毙（无子可动，判负）',
  draw: () => '和棋（重复局面 / 长对弈）',
};
const DIFF_LABELS: Record<XiangqiAIDifficulty | 'auto', string> = {
  easy: '入门',
  medium: '中级',
  hard: '高级',
  master: '大师',
  auto: '🤖 自适应',
};

export const XiangqiAIGame: React.FC = () => {
  const [board, setBoard] = useState<XiangqiBoard>(() => cloneXiangqiBoard(XIANGQI_INITIAL_BOARD));
  const [turn, setTurn] = useState<XiangqiColor>('r');
  const [humanColor, setHumanColor] = useState<XiangqiColor>('r');
  // 难度：手动四档 + 「🤖 自适应」（默认自适应：AI 随玩家水平自动升降）
  const [difficulty, setDifficulty] = useState<XiangqiAIDifficulty | 'auto'>('auto');
  // 玩家学习画像（ELO/段位/胜率，用于展示与自适应）
  const [profile, setProfile] = useState(() => getLearningProfile());
  const [selection, setSelection] = useState<XiangqiSquare | null>(null);
  const [legalTargets, setLegalTargets] = useState<XiangqiSquare[]>([]);
  const [lastMove, setLastMove] = useState<{ from: XiangqiSquare; to: XiangqiSquare } | null>(null);
  const [moveHistory, setMoveHistory] = useState<XiangqiMoveHistoryEntry[]>([]);
  const [moves, setMoves] = useState<XiangqiMove[]>([]);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(supportsWebGL() ? '3d' : '2d');
  const webglOk = useMemo(() => supportsWebGL(), []); // 3D 按钮可用性（避免切 3D 后崩溃）
  const [isFloating, setIsFloating] = useState(false);
  const board3dRef = useRef<any>(null);
  const board2dRef = useRef<XiangqiBoard2DHandle>(null);

  /** 切换浮动窗口（腾讯棋牌风格：独立可拖拽窗口，不再自动占用浏览器全屏） */
  const toggleFloat = () => {
    setIsFloating((prev) => !prev);
  };

  /** 音效/音乐：首次用户交互后解锁音频（浏览器自动播放策略） */
  useEffect(() => {
    initAudioAutoPause();
    const unlockOnce = () => unlockAudio();
    window.addEventListener('pointerdown', unlockOnce, { once: true });
    window.addEventListener('click', unlockOnce, { once: true });
    window.addEventListener('keydown', unlockOnce, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('click', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, []);

  /** ESC 键退出浮动模式 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFloating) {
        setIsFloating(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFloating]);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<XiangqiSquare[] | null>(null);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [musicOn, setMusicOnState] = useState(() => isMusicEnabled());
  const [sfxOn, setSfxOnState] = useState(() => isSfxEnabled());
  const [bgmLabel, setBgmLabel] = useState(() => BGM_TRACKS[0].label);
  const [bgmVol, setBgmVolState] = useState(() => getBgmVolume());
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiCancelledRef = useRef(false);
  const aiGenRef = useRef(0); // AI 请求世代号：重置/换边后使在途计算结果失效，防止串局

  // refs 同步最新状态，供 AI 定时器读取
  const boardRef = useRef(board);
  boardRef.current = board;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const humanRef = useRef(humanColor);
  humanRef.current = humanColor;
  const diffRef = useRef<XiangqiAIDifficulty | 'auto'>(difficulty);
  diffRef.current = difficulty;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  /** 本局 AI 实际使用的难度（对局结束用于 ELO 结算） */
  const aiUsedDiffRef = useRef<XiangqiAIDifficulty>('medium');

  // 启动时：注入自我对弈学习权重（AI 越下越聪明的"记忆"）
  useEffect(() => {
    initEngineWeights(getLearnedPieceBias());
  }, []);

  const status = useMemo<XiangqiGameStatus>(
    () => getXiangqiGameStatusAdvanced(board, turn, moves),
    [board, turn, moves],
  );
  const checkSquare = useMemo(() => {
    if (status === 'check' || status === 'checkmate') return findXiangqiKing(board, turn);
    return null;
  }, [board, status, turn]);
  const gameOver = isXiangqiGameOver(status);
  const isHumanTurn = turn === humanColor;

  /** 对局音效：将军警示 / 终局胜负 */
  const prevStatusRef = useRef<XiangqiGameStatus | null>(null);
  useEffect(() => {
    if (prevStatusRef.current === status) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!prev) return; // 首次渲染不播
    if (status === 'check') {
      playSfx('check');
    } else if (status === 'checkmate') {
      playSfx(turn !== humanColor ? 'win' : 'lose');
    } else if (status === 'stalemate') {
      playSfx(turn === humanColor ? 'lose' : 'win');
    } else if (status === 'draw') {
      playSfx('click');
    }
  }, [status, turn, humanColor]);



  // ===== AI 越下越聪明：对局结束学习（ELO 结算 + 后台自对弈训练）=====
  const lastGameResultRef = useRef<XiangqiGameResult | null>(null);
  useEffect(() => {
    if (!gameOver) return;
    let res: XiangqiGameResult;
    if (status === 'draw') {
      res = 'draw';
    } else if (status === 'checkmate' || status === 'stalemate') {
      // 被将死/困毙方是当前行棋方 → 对方获胜
      res = turn === humanRef.current ? 'loss' : 'win';
    } else {
      res = 'draw';
    }
    if (lastGameResultRef.current === res) return;
    lastGameResultRef.current = res;
    // 1) 更新玩家 ELO / 段位（自适应难度据此自动升降）
    const p = recordGameResult(res, diffRef.current);
    setProfile(p);
    // 2) 节流触发 AI 自我对弈学习：每完成 3 局让 AI 与自己下 2 局，把胜负经验存进评估权重
    if (p.gamesPlayed % 3 === 0) {
      trainSelfPlayAsync(2, getLearnedPieceBias())
        .then((r) => {          const cur = getLearningProfile();
          cur.pieceBias = { ...(r.bias || {}) };
          cur.selfPlayRounds += r.rounds;
          saveLearningProfile(cur);
          setProfile(cur);
          initEngineWeights(cur.pieceBias);
        })
        .catch((e) => console.warn('[XiangqiAI] 自对弈学习失败:', e));
    }
  }, [gameOver, status, turn]);

  useEffect(() => {
    aiCancelledRef.current = false;
    return () => {
      aiCancelledRef.current = true;
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

  // 记录走子并更新全部状态（供 AI 与人类共用）
  const commitMove = useCallback((
    b: XiangqiBoard,
    from: XiangqiSquare,
    to: XiangqiSquare,
    movingColor: XiangqiColor,
  ) => {
    const { board: nb, captured } = applyXiangqiMove(b, from, to);
    const piece = b[from[0]][from[1]];
    const record: XiangqiMove = { from, to, piece, captured: captured || undefined };
    const newMoves = [...movesRef.current, record];
    const notation = getXiangqiMoveNotation(piece, from, to, captured);
    setMoveHistory((h) => {
      if (movingColor === 'r') {
        return [...h, { moveNumber: Math.ceil(newMoves.length / 2), red: notation, black: '' }];
      }
      const last = h[h.length - 1];
      if (last && !last.black) return [...h.slice(0, -1), { ...last, black: notation }];
      return h;
    });
    setBoard(nb);
    setMoves(newMoves);
    movesRef.current = newMoves; // 同步 ref，保证 AI 调度时能拿到最新步数（开局库 ply）
    setLastMove({ from, to });
    playSfx(captured ? 'capture' : 'move');
    setTurn(movingColor === 'r' ? 'b' : 'r');
    setSelection(null);
    setLegalTargets([]);
    setHint(null);
    return nb;
  }, []);

  // 让 AI 走一步（显式传入棋盘与走方，避免依赖未同步的 ref）
  // 计算放在 Web Worker 中异步执行，困难/大师难度不再冻结主线程（防止"卡死/闪退"）
  const scheduleAI = useCallback((b: XiangqiBoard, t: XiangqiColor, ply: number) => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    // 进阶判定（含重复局面/自然限着和棋）：和棋后 AI 不再落子
    if (isXiangqiGameOver(getXiangqiGameStatusAdvanced(b, t, movesRef.current))) return;
    const gen = ++aiGenRef.current;
    setThinking(true);
    // 自适应难度：按玩家 ELO 解析本次实际 AI 强度
    const resolved = resolveAiDifficulty(diffRef.current, profileRef.current.playerElo);
    aiUsedDiffRef.current = resolved.actual;
    aiTimerRef.current = setTimeout(async () => {
      if (aiCancelledRef.current || gen !== aiGenRef.current) return;
      let mv: XiangqiSquare[] | null = null;
      try {
        mv = await xiangqiBestMoveAsync(b, t, resolved.actual, {
          ply,
          weights: getLearnedPieceBias(),
        });
      } catch (err) {
        console.error('[XiangqiAI] AI 计算失败:', err);
      }
      if (aiCancelledRef.current || gen !== aiGenRef.current) return;
      setThinking(false);
      if (mv) {
        commitMove(b, mv[0] as XiangqiSquare, mv[1] as XiangqiSquare, t);
      } else {
        setThinking(false);
      }
    }, 140);
  }, [commitMove]);

  // 人类走子
  const makeHumanMove = (from: XiangqiSquare, to: XiangqiSquare) => {
    if (thinking || gameOver || !isHumanTurn) return;
    const nb = commitMove(board, from, to, turn);
    // AI 应战（ply = 当前总步数）；终局判定用进阶版，和棋后不再应战
    const nextTurn: XiangqiColor = turn === 'r' ? 'b' : 'r';
    if (!isXiangqiGameOver(getXiangqiGameStatusAdvanced(nb, nextTurn, movesRef.current)) && nextTurn !== humanColor) {
      scheduleAI(nb, nextTurn, movesRef.current.length);
    }
  };

  const handleSquareClick = (row: number, col: number) => {
    if (gameOver || thinking || !isHumanTurn) return;
    const piece = board[row][col];
    if (selection && legalTargets.some((t) => t[0] === row && t[1] === col)) {
      makeHumanMove(selection, [row, col]);
      return;
    }
    if (piece && isXiangqiRed(piece) === (humanColor === 'r')) {
      setSelection([row, col]);
      setLegalTargets(
        getAllXiangqiLegalMoves(board, humanColor)
          .filter((m) => m.from[0] === row && m.from[1] === col)
          .map((m) => m.to),
      );
      return;
    }
    setSelection(null);
    setLegalTargets([]);
  };

  const handleReset = (side?: XiangqiColor) => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiGenRef.current++; // 使在途 AI 计算结果失效，避免串到新对局
    lastGameResultRef.current = null; // 新对局重置结算标记
    const human = side ?? humanRef.current;
    const b = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
    setBoard(b);
    setTurn('r');
    setHumanColor(human);
    setSelection(null);
    setLegalTargets([]);
    setLastMove(null);
    setMoveHistory([]);
    setMoves([]);
    movesRef.current = []; // 同步 ref：避免 AI 调度/开局库拿到旧对局历史（防止误判和棋）
    setHint(null);
    setThinking(false);
    // 人类执黑时，AI（红）先走
    if (human === 'b') {
      setTurn('r');
      scheduleAI(b, 'r', 0); // AI 先手：第 0 步（开局库第一步）
    }
  };

  const handleUndo = () => {
    if (thinking || moves.length === 0) return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    // 人机模式：当前轮到人类（AI 刚走）撤 2 步，否则撤 1 步
    const undoCount = isHumanTurn ? Math.min(2, moves.length) : Math.min(1, moves.length);
    const newMoves = moves.slice(0, moves.length - undoCount);
    let newBoard = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
    for (const m of newMoves) {
      const { board: nb } = applyXiangqiMove(newBoard, m.from, m.to);
      newBoard = nb;
    }
    setBoard(newBoard);
    setMoves(newMoves);
    setTurn(newMoves.length % 2 === 0 ? 'r' : 'b');
    setSelection(null);
    setLegalTargets([]);
    setHint(null);
    setThinking(false);
    setLastMove(newMoves.length > 0
      ? { from: newMoves[newMoves.length - 1].from, to: newMoves[newMoves.length - 1].to }
      : null);
    const history: XiangqiMoveHistoryEntry[] = [];
    for (let i = 0; i < newMoves.length; i += 2) {
      const r = newMoves[i], b2 = newMoves[i + 1];
      history.push({
        moveNumber: i / 2 + 1,
        red: r ? getXiangqiMoveNotation(r.piece, r.from, r.to, r.captured || '') : '',
        black: b2 ? getXiangqiMoveNotation(b2.piece, b2.from, b2.to, b2.captured || '') : '',
      });
    }
    setMoveHistory(history);
  };

  const handleHint = async () => {
    if (thinking || gameOver) return;
    setThinking(true);
    try {
      const mv = await xiangqiBestMoveAsync(board, turn, 'hard');
      if (mv) setHint([mv[0] as XiangqiSquare, mv[1] as XiangqiSquare]);
    } catch (err) {
      console.error('[XiangqiAI] 提示计算失败:', err);
    } finally {
      setThinking(false);
    }
  };

  const newGameDialog = () => {
    const sideChoice = window.confirm('请选择执子方：\n\n确定 = 执红先行\n取消 = 执黑后行');
    handleReset(sideChoice ? 'r' : 'b');
  };

  /** 换边：切换执子方并重置对局，执黑时自动翻转棋盘视角（黑方在下、AI 红方先手） */
  const handleSwitchSide = () => {
    // 换边会重置当前对局，先向用户确认（儿童友好文案）
    const next = humanColor === 'r' ? 'b' : 'r';
    const ok = window.confirm(
      `换边后你将执${PLAYER_NAMES[next]}，当前对局将重新开始。\n\n确定换边吗？`,
    );
    if (!ok) return;
    handleReset(next);
    setBoardFlipped(next === 'b');
  };

  // 对局统计（侧栏棋力卡片使用）
  const winRate = profile.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;
  const eloProgress = Math.min(100, Math.max(0, Math.round(((profile.playerElo - 200) / (2600 - 200)) * 100)));

  // 棋盘功能按钮栏（与上方功能按钮分区排列，不再悬浮遮挡棋盘）
  // 分区：① 视图切换（3D/2D）② 视角（翻转/复位）③ 缩放（2D）④ 浮动窗口
  const viewActions = (
    <div className="view-actions-bar">
      <div className="view-action-group">
        <button
          className={`view-tab-btn ${viewMode === '3d' ? 'active' : ''}`}
          onClick={() => setViewMode('3d')}
          disabled={!webglOk}
          title={webglOk ? '3D 视图' : '当前设备不支持 3D 渲染'}
        >
          🎲 3D
        </button>
        <button
          className={`view-tab-btn ${viewMode === '2d' ? 'active' : ''}`}
          onClick={() => setViewMode('2d')}
          title="2D 视图"
        >
          ▦ 2D
        </button>
      </div>
      <div className="view-action-group">
        <button className="view-tab-btn" onClick={() => setBoardFlipped((f) => !f)} title="翻转棋盘视角">
          ⇅ 翻转
        </button>
        <button
          className="view-tab-btn"
          onClick={() => {
            if (viewMode === '3d') board3dRef.current?.resetView?.();
            else board2dRef.current?.resetZoom();
          }}
          title="复位视角"
        >
          ↺ 复位
        </button>
      </div>
      <div className="view-action-group">
        <button className="view-tab-btn" onClick={() => board2dRef.current?.zoomIn()} disabled={viewMode !== '2d'} title="放大棋盘">
          ＋
        </button>
        <button className="view-tab-btn" onClick={() => board2dRef.current?.zoomOut()} disabled={viewMode !== '2d'} title="缩小棋盘">
          －
        </button>
      </div>
      {!isFloating && (
        <div className="view-action-group">
          <button className="view-tab-btn" onClick={toggleFloat} title="浮动窗口">
            ⛶ 浮动
          </button>
        </div>
      )}
    </div>
  );

  // 棋盘区域（功能按钮已移入上方工具栏，棋盘内不再悬浮任何控件）
  const boardArea = (
    <div className={`xiangqi-board-host view-${viewMode}`}>
      {viewMode === '3d' ? (
        <ThreeJSXiangqiBoard
          board={board}
          selectedSquare={selection}
          legalTargets={legalTargets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hint={hint}
          flipped={boardFlipped}
          onSquareClick={handleSquareClick}
          onReady={(api) => { board3dRef.current = api; }}
        />
      ) : (
        <XiangqiBoard2D
          ref={board2dRef}
          board={board}
          selectedSquare={selection}
          legalTargets={legalTargets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hint={hint}
          onSquareClick={handleSquareClick}
          flipped={boardFlipped}
          zoomable={true}
          zoomControls={false}
        />
      )}
    </div>
  );

  // 对局结果弹窗（正常模式与浮动窗口共用）：胜负动画 + 彩带 + 鼓励文案
  const rank = getRank(profile.playerElo);
  const isWin = status === 'checkmate' && turn !== humanColor;
  const isLose = (status === 'checkmate' && turn === humanColor) || (status === 'stalemate' && turn === humanColor);
  const isDraw = status === 'draw' || (status === 'stalemate' && turn !== humanColor);
  const WIN_LINES = ['太棒了！', '真厉害！', '绝杀！', '你赢啦！', '棋高一招！'];
  const resultModal = gameOver ? (
    <div className={`game-result-modal result-${isWin ? 'win' : isLose ? 'lose' : 'draw'}`}>
      {isWin && (
        <div className="confetti-layer" aria-hidden="true">
          {Array.from({ length: 30 }).map((_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${(i * 41 + 7) % 100}%`,
                animationDelay: `${(i % 12) * 0.16}s`,
                animationDuration: `${2.4 + (i % 5) * 0.3}s`,
                background: i % 3 === 0 ? '#ffd54f' : i % 3 === 1 ? '#ef5350' : '#66bb6a',
              }}
            />
          ))}
        </div>
      )}
      <div className="result-content">
        <div className={`result-icon ${isWin ? 'result-icon-trophy' : isLose ? 'result-icon-soft' : ''}`}>
          {isWin ? '🏆' : isLose ? '💪' : '🤝'}
        </div>
        <h3 className="result-title">
          {isWin && `你获胜了！${WIN_LINES[moves.length % WIN_LINES.length]}`}
          {status === 'checkmate' && turn === humanColor && '电脑获胜'}
          {status === 'stalemate' && turn === humanColor && '你被困毙，判负'}
          {status === 'stalemate' && turn !== humanColor && '电脑被困毙，你获胜！'}
          {status === 'draw' && '和棋'}
        </h3>
        {isLose && <p className="result-encourage">没关系，多练习几局，你一定会越来越厉害！</p>}
        {isDraw && status === 'draw' && <p className="result-encourage">旗鼓相当，再来一局吧！</p>}
        <p className="result-detail">共走了 {moves.length} 步</p>
        <div className="result-learning">
          <span className="result-rank">{rank.icon} {rank.label} · ELO {profile.playerElo}</span>
          {difficulty === 'auto' && (
            <span className="result-ai-note">🤖 AI 会根据你的表现自动调整难度，越下越聪明</span>
          )}
        </div>
        <button className="play-again-btn" onClick={() => handleReset()}>再来一局</button>
      </div>
    </div>
  ) : null;

  // ================================================================
  // 对局内容
  // ================================================================
  const gameContent = (
    <>
      <div className={`game-layout ${isFloating ? 'game-layout-floating' : ''}`}>
        <div className="game-main-area">
          {/* 对战信息条：回合状态 + 段位徽章 + 执子/换边（换边会重置对局） */}
          <div className="battle-status-bar">
            <span className={`battle-status ${turn === humanColor ? 'battle-status-mine' : ''} ${thinking ? 'battle-status-thinking' : (status === 'check' || status === 'checkmate') ? 'battle-status-check' : ''}`}>
              <span className="status-pulse-dot" />
              {thinking ? '🤔 电脑思考中…' : STATUS_TEXT[status](turn)}
            </span>
            <span className="rank-badge" title="你的棋力等级（AI 会随你的进步自动调整难度）">
              {rank.icon} {rank.label} · {profile.playerElo}
            </span>
            <div className="side-switch">
              <span className="side-switch-label">
                你执 <b className={`side-color-${humanColor}`}>{PLAYER_NAMES[humanColor]}</b>
              </span>
              <button className="side-switch-btn" onClick={handleSwitchSide} disabled={thinking} title="换边（执黑时 AI 红方先手，棋盘自动翻转）">
                ⇄ 换边
              </button>
            </div>
          </div>

          {/* 功能操作栏：难度 + 悔棋 / 提示 / 新对局 */}
          <div className="game-toolbar">
            <div className="toolbar-left">
              <span className="toolbar-label">难度</span>
              <select
                className="difficulty-select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as XiangqiAIDifficulty | 'auto')}
                disabled={thinking}
                title="AI 难度"
              >
                {Object.entries(DIFF_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            <div className="toolbar-actions">
              <button className="action-btn" onClick={handleUndo} disabled={moves.length === 0 || thinking}>↩ 悔棋</button>
              <button className="action-btn" onClick={handleHint} disabled={thinking || gameOver}>💡 提示</button>
              <button className="action-btn primary" onClick={newGameDialog}>🔄 新对局</button>
              <button
                className={`action-btn sound-btn ${musicOn ? '' : 'action-btn-muted'}`}
                onClick={() => {
                  playSfx('click');
                  const v = !musicOn;
                  setMusicEnabled(v);
                  setMusicOnState(v);
                }}
                title={musicOn ? '关闭背景音乐' : '开启背景音乐'}
              >
                {musicOn ? '🎵' : '🔇'}
              </button>
              <button
                className={`action-btn sound-btn ${sfxOn ? '' : 'action-btn-muted'}`}
                onClick={() => {
                  const v = !sfxOn;
                  setSfxEnabled(v);
                  setSfxOnState(v);
                  if (v) playSfx('click');
                }}
                title={sfxOn ? '关闭音效' : '开启音效'}
              >
                {sfxOn ? '🔊' : '🔈'}
              </button>
              {musicOn && (
                <>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(bgmVol * 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    setBgmVolume(v);
                    setBgmVolState(v);
                  }}
                  className="bgm-volume-slider"
                  title={`背景音乐音量 ${Math.round(bgmVol * 100)}%`}
                />
                <button
                  className="action-btn sound-btn bgm-switch-btn"
                  onClick={() => {
                    const t = cycleBgmTrack();
                    setBgmLabel(t.label);
                    playSfx('click');
                  }}
                  title={`切换背景音乐（当前：${bgmLabel}）`}
                >
                  ⏭
                </button>
                </>
              )}
            </div>
          </div>
          {viewActions}
          {boardArea}
        </div>
        <div className="game-side-panel">
          {/* 棋力卡片：段位 / ELO / 胜率 */}
          <div className="profile-card">
            <div className="profile-card-head">
              <span className="profile-rank-icon">{rank.icon}</span>
              <span className="profile-rank-label">{rank.label}</span>
              <span className="profile-elo">ELO {profile.playerElo}</span>
            </div>
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-num">{profile.gamesPlayed}</span>
                <span className="profile-stat-label">对局</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-num profile-stat-win">{profile.wins}</span>
                <span className="profile-stat-label">胜</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-num profile-stat-lose">{profile.losses}</span>
                <span className="profile-stat-label">负</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-num">{winRate}%</span>
                <span className="profile-stat-label">胜率</span>
              </div>
            </div>
            <div className="profile-progress">
              <div className="profile-progress-track">
                <div className="profile-progress-bar" style={{ width: `${eloProgress}%` }} />
              </div>
              <div className="profile-progress-labels">
                <span>初学</span>
                <span>大师</span>
              </div>
            </div>
            {difficulty === 'auto' && (
              <p className="profile-note">🤖 AI 会根据你的表现自动调整难度，越下越聪明</p>
            )}
          </div>
          <div className="move-history-panel">
            <h3>走棋记录</h3>
            <div className="move-history-list">
              {moveHistory.length === 0 && <p className="empty-text">尚未走棋</p>}
              {moveHistory.map((entry) => (
                <div key={entry.moveNumber} className="move-history-row">
                  <span className="move-number">{entry.moveNumber}.</span>
                  <span className="move-red">{entry.red}</span>
                  <span className="move-black">{entry.black}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {resultModal}
    </>
  );

  // 浮动窗口模式（腾讯棋牌风格：独立可拖拽窗口，可缩放、可全屏，功能按钮集成在窗口内）
  if (isFloating) {
    return (
      <BoardFloatingWindow title="🤖 中国象棋 · 人机对战" onClose={toggleFloat}>
        <div className="float-status-bar">
          <span className="float-status-turn">
            {thinking ? '🤔 电脑思考中…' : STATUS_TEXT[status](turn)}
          </span>
          <span className="float-status-diff">你执：{PLAYER_NAMES[humanColor]} · 难度：{DIFF_LABELS[difficulty]}</span>
          <span className="float-status-rank" title="你的棋力等级（AI 会随你的进步自动调整难度）">
            {rank.icon} {rank.label} · {profile.playerElo}
          </span>
        </div>
        <div className="float-action-bar">
          <select
            className="difficulty-select"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as XiangqiAIDifficulty | 'auto')}
            disabled={thinking}
            title="AI 难度"
          >
            {Object.entries(DIFF_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <button className="float-action-btn" onClick={handleSwitchSide} disabled={thinking} title="换边（执黑时 AI 红方先手，棋盘自动翻转）">⇄ 换边</button>
          <button className="float-action-btn" onClick={handleUndo} disabled={moves.length === 0 || thinking}>↩ 悔棋</button>
          <button className="float-action-btn" onClick={handleHint} disabled={thinking || gameOver}>💡 提示</button>
          <button className="float-action-btn float-action-primary" onClick={newGameDialog}>🔄 新对局</button>
        </div>
        {viewActions}
        {boardArea}
        {resultModal}
      </BoardFloatingWindow>
    );
  }

  // 正常模式
  return (
    <div className="module xiangqi-game">
      <div className="module-header">
        <h2>🤖 中国象棋 · 人机对战</h2>
        <p>和电脑下棋，难度可选，随时悔棋</p>
      </div>
      {gameContent}
    </div>
  );
};
