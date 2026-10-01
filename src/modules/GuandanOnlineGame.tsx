/**
 * 掼蛋 · 联机对战（四人两两组队，PeerJS P2P 星型）
 * 房主(座位0)为中枢：发牌、回合仲裁、广播完整状态；其余三人通过房间码连接房主。
 * 消息协议：JOIN / WELCOME / ROOM_STATE / STATE / PLAY / PASS / ERROR / LEAVE
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { enterFullscreen, exitFullscreen } from '../utils/fullscreen';
import {
  type GCard, type PlayInfo, analyzePlay, canBeat, cardVal, rankName,
  buildDeck, shuffle, groupHand, groupByR, GD_ZONES, SUIT_SYMBOL, isWild, levelRank, findSeq,
} from './GuandanGame';

// ================================================================
// 座位与队伍：0=房主(南) 2=队友(北) 1/3=对手
// ================================================================
const SEAT_NAMES = ['房主', '对手A', '队友', '对手B'];
function teamOf(seat: number): number { return seat === 0 || seat === 2 ? 0 : 1; }

// ================================================================
// 联机状态（与 GuandanGame 的 GameState 同构，lastPlay 只保留 cards）
// ================================================================
export interface GDOnlineState {
  hands: GCard[][];
  level: number;
  current: number;
  lastPlay: { player: number; cards: GCard[] } | null;
  lastPlayBy: number;
  turnStart: number;
  finished: number[];
  roundPass: number[];
  /** 本轮各方位已出的牌（一轮出完才清理），用于方位展示 */
  roundPlays: { player: number; cards: GCard[] }[];
  phase: 'playing' | 'over';
  winnerTeam: number | null;
  resultText: string;
  playerNames: string[];
  /** 打 A 连续未过局数（连续 3 把不过退回 2 重新打） */
  aStrikes: number;
}

// ================================================================
// 纯函数状态机（房主侧）：applyTurn(state, player, playCards|null)
// ================================================================
// 找到下一个未出完（未 finished）的玩家：头游后跳过，避免轮到空手玩家
export function nextAliveSeat(from: number, finished: number[]): number {
  let s = ((from % 4) + 4) % 4;
  for (let i = 0; i < 4; i++) {
    const p = (s + i) % 4;
    if (!finished.includes(p)) return p;
  }
  return s;
}

export function gdApplyTurn(prev: GDOnlineState, player: number, play: GCard[] | null): GDOnlineState {
  const hands = prev.hands.map((h) => [...h]);
  const roundPass = [...prev.roundPass];
  const finished = [...prev.finished];
  // 本轮已出的牌：出牌追加到对应方位；一圈全过（新一轮）时清空
  const roundPlays = play ? [...prev.roundPlays, { player, cards: play }] : prev.roundPlays;

  if (play) {
    hands[player] = hands[player].filter((c) => !play.some((p) => p.id === c.id));
    if (hands[player].length === 0) {
      finished.push(player);
      if (finished.length === 4) {
        const order = finished;
        const myTeamWon = teamOf(order[0]) === 0;
        let up: number; let txt: string;
        if (myTeamWon) {
          if (teamOf(order[1]) === 0) { up = 3; txt = '双下！升 3 级'; }
          else if (teamOf(order[2]) === 0) { up = 2; txt = '升 2 级'; }
          else { up = 1; txt = '升 1 级'; }
        } else {
          if (teamOf(order[1]) === 1) { up = 3; txt = '对方双下，升 3 级'; }
          else if (teamOf(order[2]) === 1) { up = 2; txt = '对方升 2 级'; }
          else { up = 1; txt = '对方升 1 级'; }
        }
        let newLevel = prev.level + up;
        let resultText = txt;
        let winnerTeam: number | null = null;
        let aStrikes = prev.aStrikes || 0;
        if (prev.level === 14) {
          // 打 A 中：必须双上（己方 1、2 名）才算过 A 获胜
          if (myTeamWon && up >= 3) {
            winnerTeam = 0; newLevel = 14; aStrikes = 0;
            resultText = '🏆 双上打过 A！房主队获胜！';
          } else if (!myTeamWon && up >= 3) {
            // 对方双上打过 A：退回 2 重新打
            newLevel = 2; aStrikes = 0;
            resultText = '对方双上打过 A，退回 2 重新打';
          } else {
            aStrikes += 1;
            if (aStrikes >= 3) {
              newLevel = 2; aStrikes = 0;
              resultText = '连续 3 把未过 A，退回 2 重新打';
            } else {
              newLevel = 14;
              resultText = `打 A 未过（第 ${aStrikes} 把，连 3 把不过退回 2）`;
            }
          }
        } else if (newLevel > 14) {
          if (myTeamWon) { winnerTeam = 0; resultText = '🏆 打过 A！房主队获胜！'; }
          else { winnerTeam = 1; resultText = '对方打过 A，重新打 A'; newLevel = 14; }
        } else if (newLevel === 14) {
          resultText = myTeamWon ? '🚀 打到 A！下一局双上即获胜！' : '对方打到 A';
        }
        return {
          ...prev, hands, roundPass: [], roundPlays, finished, phase: 'over', winnerTeam, resultText,
          level: newLevel, aStrikes, current: order[0], lastPlay: null, lastPlayBy: -1,
        };
      }
    }
    return {
      ...prev, hands,
      lastPlay: { player, cards: play }, lastPlayBy: player, roundPass: [], roundPlays,
      current: nextAliveSeat(player + 1, finished), turnStart: nextAliveSeat(player + 1, finished),
    };
  }
  // 不出
  roundPass.push(player);
  if (roundPass.length >= 3) {
    // 一圈全过 → 最后出牌者自由出牌；若已头游则顺延给下一未出完者
    const freer = finished.includes(prev.lastPlayBy) ? nextAliveSeat(prev.lastPlayBy + 1, finished) : prev.lastPlayBy;
    return { ...prev, hands, roundPass: [], roundPlays: [], current: freer, lastPlay: null, lastPlayBy: freer };
  }
  return { ...prev, hands, roundPass, roundPlays, current: nextAliveSeat(player + 1, finished) };
}

export function gdNewGame(level: number, names: string[], firstSeat: number, keepStrikes = 0): GDOnlineState {
  const deck = shuffle(buildDeck());
  const hands: GCard[][] = [[], [], [], []];
  deck.forEach((c, i) => hands[i % 4].push(c));
  return {
    hands, level, current: firstSeat, lastPlay: null, lastPlayBy: -1, turnStart: firstSeat,
    finished: [], roundPass: [], roundPlays: [], phase: 'playing', winnerTeam: null, resultText: '', playerNames: names,
    aStrikes: keepStrikes,
  };
}

// ================================================================
// PeerJS 封装
// ================================================================
let peerjsPromise: Promise<any> | null = null;
function loadPeerJS(): Promise<any> {
  if (peerjsPromise) return peerjsPromise;
  peerjsPromise = import('peerjs')
    .catch((err) => { peerjsPromise = null; throw err; });
  return peerjsPromise;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ================================================================
// 组件
// ================================================================
export const GuandanOnlineGame: React.FC<{ autoJoinRoom?: string | null }> = ({ autoJoinRoom }) => {
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [status, setStatus] = useState<'lobby' | 'connecting' | 'waiting' | 'playing' | 'error'>('lobby');
  const [players, setPlayers] = useState<string[]>(['', '', '', '']); // 各座位名字
  const [game, setGame] = useState<GDOnlineState | null>(null);
  const [mySeat, setMySeat] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<'rank' | 'grouped'>('rank');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  // 浮动窗口全屏（对局时默认开启）+ 左上角 ☰ 折叠菜单
  const [floating, setFloating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const enteredFsRef = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const peerRef = useRef<any>(null);
  const connsRef = useRef<any[]>([]); // host：已连接的 guest connections
  const connRef = useRef<any>(null);  // guest：到 host 的连接
  const myNameRef = useRef('玩家');

  // ============ 复制房间号 ============
  const copyRoomCode = useCallback(() => {
    if (!roomCode) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(roomCode).catch(() => {});
      } else {
        const ta = document.createElement('textarea');
        ta.value = roomCode; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
    } catch {}
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [roomCode]);

  // ============ 消息发送 ============
  const sendAll = useCallback((msg: object) => {
    const data = JSON.stringify(msg);
    for (const c of connsRef.current) {
      try { if (c && c.open) c.send(data); } catch {}
    }
  }, []);

  const sendToHost = useCallback((msg: object) => {
    try { if (connRef.current && connRef.current.open) connRef.current.send(JSON.stringify(msg)); } catch {}
  }, []);

  // ============ 广播完整状态 ============
  const broadcastState = useCallback((st: GDOnlineState) => {
    sendAll({ type: 'STATE', state: st });
  }, [sendAll]);

  // ============ 房间事件 ============
  const onHostMessage = useCallback((conn: any, raw: string) => {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'JOIN') {
      const existing = connsRef.current.find((c) => c === conn);
      if (!existing) {
        connsRef.current.push(conn);
        // 分配座位：第一个=2(队友)，第二个=1，第三个=3
        const seats = connsRef.current.length;
        const seat = seats === 1 ? 2 : seats === 2 ? 1 : 3;
        const name = (msg.name || '玩家').slice(0, 12);
        conn._gdSeat = seat;
        conn._gdName = name;
        setPlayers((p) => { const np = [...p]; np[seat] = name; return np; });
        try { conn.send(JSON.stringify({ type: 'WELCOME', seat, name })); } catch {}
        // 同步房间人员到所有 guest
        sendAll({ type: 'ROOM_STATE', players: ['房主', connsRef.current.map((c) => c._gdName)] });
      }
    } else if (msg.type === 'PLAY' || msg.type === 'PASS') {
      const seat = conn._gdSeat;
      if (seat === undefined) return;
      setGame((prev) => {
        if (!prev || prev.phase !== 'playing' || prev.current !== seat) return prev;
        const cards = msg.type === 'PLAY' ? (msg.cards || []) : null;
        if (cards && cards.length === 0) return prev;
        const next = gdApplyTurn(prev, seat, cards);
        broadcastState(next);
        return next;
      });
    } else if (msg.type === 'LEAVE') {
      const idx = connsRef.current.indexOf(conn);
      if (idx >= 0) {
        connsRef.current.splice(idx, 1);
        const seat = conn._gdSeat;
        if (seat !== undefined) {
          setPlayers((p) => { const np = [...p]; np[seat] = ''; return np; });
          sendAll({ type: 'ROOM_STATE', players: ['房主', connsRef.current.map((c) => c._gdName)] });
          setNotice(`玩家「${conn._gdName || '玩家'}」已离开`);
        }
      }
    }
  }, [broadcastState]);

  const onGuestMessage = useCallback((raw: string) => {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'WELCOME') {
      setMySeat(msg.seat);
      setStatus('waiting');
    } else if (msg.type === 'ROOM_STATE') {
      const names: string[] = ['房主', ...(msg.players || [])];
      setPlayers((p) => {
        const np = [...p];
        names.forEach((n, i) => { if (n) np[i] = n; });
        return np;
      });
    } else if (msg.type === 'STATE') {
      setGame(msg.state);
      setStatus('playing');
      setSelected([]);
      // 进入对局：默认浮动窗口全屏，隐藏浏览器窗口（桌面全屏 / iOS 沉浸兜底）
      setFloating(true);
      if (!enteredFsRef.current) {
        enteredFsRef.current = true;
        try { enterFullscreen(); } catch { /* 忽略 */ }
      }
    } else if (msg.type === 'ERROR') {
      setNotice(msg.message || '错误');
    }
  }, []);

  // ============ 创建房间（房主） ============
  const createRoom = useCallback(async () => {
    const code = generateRoomCode();
    setRoomCode(code);
    setRole('host');
    setStatus('connecting');
    setPlayers((p) => { const np = [...p]; np[0] = '房主'; return np; });
    try {
      const Peer = await loadPeerJS();
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:eu-0.turn.peerjs.com:443?transport=tcp', username: 'peerjs', credential: 'peerjsp' },
      ];
      const peer = new Peer(code, { debug: 0, config: { iceServers } });
      peerRef.current = peer;
      peer.on('error', (err: any) => {
        if (err?.type === 'unavailable-id') {
          const alt = `${code}${Math.floor(Math.random() * 100)}`;
          setRoomCode(alt);
          createRoomAs(alt);
        } else {
          setStatus('error');
          setNotice('房间创建失败：' + (err?.type || '网络错误'));
        }
      });
      peer.on('open', () => {
        setStatus('waiting');
        setNotice('房间已创建，等待其他玩家加入…');
      });
      peer.on('connection', (incoming: any) => {
        incoming.on('open', () => {
          setStatus('waiting');
        });
        incoming.on('data', (d: any) => onHostMessage(incoming, typeof d === 'string' ? d : JSON.stringify(d)));
        incoming.on('close', () => onHostMessage(incoming, JSON.stringify({ type: 'LEAVE' })));
      });
    } catch {
      setStatus('error');
      setNotice('联机初始化失败，请检查网络后重试');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onHostMessage]);

  async function createRoomAs(code: string) {
    setRoomCode(code);
    try {
      const Peer = await loadPeerJS();
      const peer = new Peer(code, { debug: 0 });
      peerRef.current = peer;
      peer.on('open', () => { setStatus('waiting'); });
      peer.on('connection', (incoming: any) => {
        incoming.on('open', () => {});
        incoming.on('data', (d: any) => onHostMessage(incoming, typeof d === 'string' ? d : JSON.stringify(d)));
        incoming.on('close', () => onHostMessage(incoming, JSON.stringify({ type: 'LEAVE' })));
      });
    } catch {}
  }

  // ============ 加入房间（来宾） ============
  const joinRoom = useCallback(async (code: string) => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setRoomCode(c);
    setRole('guest');
    setStatus('connecting');
    try {
      const Peer = await loadPeerJS();
      const peer = new Peer(`${c}-${Math.floor(Math.random() * 100000)}`, { debug: 0 });
      peerRef.current = peer;
      peer.on('error', (err: any) => {
        setStatus('error');
        setNotice('连接失败：' + (err?.type || '网络错误'));
      });
      peer.on('open', () => {
        const conn = peer.connect(c, { reliable: true });
        connRef.current = conn;
        const timeout = setTimeout(() => {
          setStatus('error');
          setNotice('连接超时，请检查房间号与网络');
        }, 15000);
        conn.on('open', () => {
          clearTimeout(timeout);
          conn.send(JSON.stringify({ type: 'JOIN', name: myNameRef.current }));
        });
        conn.on('data', (d: any) => onGuestMessage(typeof d === 'string' ? d : JSON.stringify(d)));
        conn.on('close', () => {
          setStatus('error');
          setNotice('与房主连接已断开');
        });
      });
    } catch {
      setStatus('error');
      setNotice('联机初始化失败，请检查网络后重试');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGuestMessage]);

  // ============ 房主：开始对局 ============
  const startGame = useCallback(() => {
    const connected = connsRef.current.length;
    if (connected < 3) {
      setNotice(`还需 ${3 - connected} 名玩家加入才能开局`);
      return;
    }
    const names = ['房主', ...connsRef.current.map((c) => c._gdName)];
    const st = gdNewGame(2, names, Math.floor(Math.random() * 4));
    setGame(st);
    broadcastState(st);
    setStatus('playing');
    setNotice('');
  }, [broadcastState]);

  // ============ 房主：重新发牌（下一局） ============
  const nextRound = useCallback(() => {
    if (!game) return;
    const names = ['房主', ...connsRef.current.map((c) => c._gdName)];
    const st = gdNewGame(game.level, names, game.finished[0] ?? 0, game.aStrikes || 0);
    setGame(st);
    broadcastState(st);
  }, [game, broadcastState]);

  // ============ 我的回合操作 ============
  const isMyTurn = !!game && game.phase === 'playing' && game.current === mySeat && !game.finished.includes(mySeat);
  const myHand = game ? game.hands[mySeat] : [];

  const doPlay = () => {
    if (!isMyTurn) return;
    const cards = myHand.filter((c) => selected.includes(c.id));
    if (cards.length === 0) return;
    if (role === 'host') {
      setGame((prev) => {
        if (!prev || prev.current !== 0) return prev;
        const next = gdApplyTurn(prev, 0, cards);
        broadcastState(next);
        return next;
      });
    } else {
      sendToHost({ type: 'PLAY', cards });
    }
    setSelected([]);
  };

  const doPass = () => {
    if (!isMyTurn || !game?.lastPlay) return;
    if (role === 'host') {
      setGame((prev) => {
        if (!prev || prev.current !== 0) return prev;
        const next = gdApplyTurn(prev, 0, null);
        broadcastState(next);
        return next;
      });
    } else {
      sendToHost({ type: 'PASS' });
    }
    setSelected([]);
  };

  // 连续点击提示：依次切换所有可压方案（先同型从小到大，再炸弹/同花顺/王炸），不限同类牌型
  const hintBeatsRef = useRef<number[][]>([]);
  const hintKeyRef = useRef('');
  const hintIdxRef = useRef(-1);
  const applyHint = () => {
    if (!game || !isMyTurn) return;
    if (!game.lastPlay) {
      const g = groupByR(myHand);
      let best: GCard[] | null = null;
      for (const gr of g.values()) {
        if (!best || cardVal(gr[0], game.level) < cardVal(best[0], game.level)) best = gr.slice(0, 1);
      }
      if (best) setSelected(best.map((c) => c.id));
      return;
    }
    const prevInfo = analyzePlay(game.lastPlay.cards, game.level)!;
    const key = `${game.lastPlayBy}:${game.lastPlay.cards.map((c) => c.id).join(',')}`;
    if (hintKeyRef.current !== key) {
      hintKeyRef.current = key;
      hintIdxRef.current = -1;
      hintBeatsRef.current = allBeats(myHand, prevInfo, game.level).map((b) => b.map((c) => c.id));
    }
    const beats = hintBeatsRef.current;
    if (!beats.length) return;
    hintIdxRef.current = (hintIdxRef.current + 1) % beats.length;
    setSelected(beats[hintIdxRef.current]);
  };

  // 所有炸弹候选（4炸→5炸→同花顺→王炸 升序）
  function bombCandidates(hand: GCard[], level: number): { cards: GCard[]; kind: number; n: number; key: number }[] {
    const groups = groupByR(hand);
    const kings = hand.filter((c) => c.k !== undefined);
    const out: { cards: GCard[]; kind: number; n: number; key: number }[] = [];
    for (const g of groups.values()) {
      if (g.some((c) => c.k !== undefined)) continue;
      if (g.length >= 4) out.push({ cards: g.slice(0, 4), kind: 0, n: g.length, key: cardVal(g[0], level) });
    }
    for (const s of ['S', 'H', 'C', 'D']) {
      const sc = hand.filter((c) => c.s === s && c.k === undefined);
      const ranks = [...new Set(sc.map((c) => c.r))].filter((r) => r >= 3 && r <= 14).sort((a, b) => b - a);
      for (let i = 0; i + 4 < ranks.length; i++) {
        let len = 1;
        while (i + len < ranks.length && ranks[i + len] === ranks[i] - len) len++;
        if (len >= 5) {
          const want = ranks.slice(i, i + 5);
          const cards = want.map((r) => sc.find((c) => c.r === r)!);
          out.push({ cards, kind: 1, n: 5, key: want[0] });
          i += 4;
        }
      }
    }
    if (kings.length === 4) out.push({ cards: kings, kind: 2, n: 4, key: 0 });
    out.sort((a, b) => (a.kind !== b.kind ? a.kind - b.kind : (a.kind === 0 ? (a.n !== b.n ? a.n - b.n : a.key - b.key) : (a.kind === 1 ? a.key - b.key : 0))));
    return out;
  }

  // 所有能压 prev 的方案（同型从小到大 + 炸弹/同花顺/王炸），供连续点击提示循环切换
  function allBeats(hand: GCard[], prev: PlayInfo, level: number): GCard[][] {
    const out: GCard[][] = [];
    const push = (cards: GCard[]) => {
      const info = analyzePlay(cards, level);
      if (info && canBeat(prev, info)) out.push(cards);
    };
    const groups = groupByR(hand);
    const norm = [...groups.values()].filter((g) => !g.some((c) => c.k !== undefined));
    if (prev.type === 'SINGLE') {
      const cands: GCard[] = [];
      for (const g of norm) cands.push(g[0]);
      for (const k of hand.filter((c) => c.k !== undefined)) cands.push(k);
      cands.sort((a, b) => cardVal(a, level) - cardVal(b, level));
      cands.forEach((c) => push([c]));
    } else if (prev.type === 'PAIR') {
      norm.filter((g) => g.length >= 2).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level)).forEach((g) => push(g.slice(0, 2)));
    } else if (prev.type === 'TRIPLE') {
      norm.filter((g) => g.length >= 3).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level)).forEach((g) => push(g.slice(0, 3)));
    } else if (prev.type === 'TRIPLE_PAIR') {
      for (const t of norm.filter((g) => g.length >= 3).sort((a, b) => cardVal(a[0], level) - cardVal(b[0], level))) {
        const p = norm.find((g) => g !== t && g.length >= 2);
        if (p) push([...t.slice(0, 3), ...p.slice(0, 2)]);
      }
    } else if (prev.type === 'STRAIGHT') {
      for (let min = prev.key + 1; min <= 10; min++) { const seq = findSeq(hand, 5, min - 1, false); if (seq) push(seq); }
    } else if (prev.type === 'PAIR_SEQ') {
      for (let min = prev.key + 2; min <= 14; min += 2) { const seq = findSeq(hand, prev.size, min - 1, true); if (seq) push(seq); }
    } else if (prev.type === 'PLANE') {
      for (let min = prev.key + 3; min <= 14; min += 3) { const seq = findSeq(hand, prev.size, min - 1, false, true); if (seq) push(seq); }
    }
    for (const b of bombCandidates(hand, level)) push(b.cards);
    return out;
  }

  // ============ 自动加入（微信引导页跳转） ============
  useEffect(() => {
    if (autoJoinRoom) {
      joinRoom(autoJoinRoom);
    }
    return () => {
      try { if (peerRef.current) peerRef.current.destroy(); } catch {}
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 浮动全屏时隐藏页面上下红色导航栏（header/nav），只显示棋盘容器
  useEffect(() => {
    if (floating) document.body.classList.add('gd-float-active');
    else document.body.classList.remove('gd-float-active');
    return () => document.body.classList.remove('gd-float-active');
  }, [floating]);

  // 点击理牌分组名称：整组选中（已全选则取消）
  const selectGroup = (cards: GCard[]) => {
    const ids = cards.map((c) => c.id);
    setSelected((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : ids));
  };

  const toggleCard = (id: number) => {
    if (!isMyTurn) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canPlay = (() => {
    if (!game || !isMyTurn) return false;
    const cards = myHand.filter((c) => selected.includes(c.id));
    if (cards.length === 0) return false;
    const info = analyzePlay(cards, game.level);
    if (!info) return false;
    if (!game.lastPlay) return true;
    const prevInfo = analyzePlay(game.lastPlay.cards, game.level);
    if (!prevInfo) return true;
    return canBeat(prevInfo, info);
  })();
  const canPass = isMyTurn && !!game?.lastPlay;

  // ============ 渲染：大厅 ============
  if (status === 'lobby' || status === 'connecting' || status === 'error') {
    return (
      <div className="gd-online">
        <div className="gd-online-card">
          <h2>🃏 掼蛋 · 联机对战</h2>
          <p className="gd-online-sub">四人两两组队 · 经典规则 · 创建房间分享给好友即可开局</p>
          {status === 'error' && <p className="gd-online-error">{notice}</p>}
          <div className="gd-online-btns">
            <button className="gd-btn gd-btn-primary" onClick={createRoom} disabled={status === 'connecting'}>
              {status === 'connecting' ? '创建中…' : '创建房间'}
            </button>
          </div>
          <div className="gd-online-divider"><span>或加入好友房间</span></div>
          <div className="gd-online-join">
            <input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="输入 6 位房间号"
              maxLength={6}
            />
            <button className="gd-btn gd-btn-primary" onClick={() => joinRoom(joinInput)} disabled={status === 'connecting' || joinInput.length < 4}>
              加入房间
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ 渲染：等待房间（房主） ============
  if (role === 'host' && status === 'waiting') {
    const connected = connsRef.current.length;
    return (
      <div className="gd-online">
        <div className="gd-online-card">
          <h2>🃏 掼蛋房间</h2>
          <div className="gd-room-code" onClick={copyRoomCode} title="点击复制房间号">
            <span>房间号</span>
            <b>{roomCode}</b>
            <em>{copied ? '✅ 已复制' : '📋 点击复制'}</em>
          </div>
          <div className="gd-room-players">
            <div className="gd-room-player gd-host">👑 房主（你）</div>
            {connsRef.current.map((c, i) => (
              <div className="gd-room-player" key={i}>🎮 {c._gdName || '玩家'}</div>
            ))}
            {[0, 1, 2].map((i) => (
              <div className="gd-room-player gd-empty" key={`e${i}`}>⏳ 等待加入…</div>
            )).slice(connsRef.current.length)}
          </div>
          <p className="gd-online-tip">已加入 {connected}/3 名玩家</p>
          <div className="gd-online-btns">
            <button className="gd-btn gd-btn-primary" onClick={startGame} disabled={connected < 3}>
              {connected >= 3 ? '开始对局 →' : '等 3 人加入后开局'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ 渲染：等待开局（来宾） ============
  if (role === 'guest' && status === 'waiting') {
    return (
      <div className="gd-online">
        <div className="gd-online-card">
          <h2>🃏 已加入房间</h2>
          <div className="gd-room-code">
            <span>房间号</span><b>{roomCode}</b>
          </div>
          <div className="gd-room-players">
            {players.map((n, i) => (
              <div className={`gd-room-player ${i === mySeat ? 'gd-me' : ''} ${n ? '' : 'gd-empty'}`} key={i}>
                {i === 0 ? '👑 ' : ''}{n || '⏳ 等待加入…'}{i === mySeat ? '（你）' : ''}
              </div>
            ))}
          </div>
          <p className="gd-online-tip">等待房主发牌开局…</p>
        </div>
      </div>
    );
  }

  // ============ 渲染：对局 ============
  if (!game) return <div className="module-loading">对局准备中…</div>;

  // 头游：第一个出完牌的玩家；对家（搭档）= 头游 ^ 2（0↔2、1↔3）
  // 明牌规则：仅本方（0 我 或 2 队友）头游时，把本队另一人的剩余手牌明牌给本方看；对手头游不泄露对手牌
  const headSeat = game.finished.length > 0 ? game.finished[0] : -1;
  const partnerSeat = headSeat >= 0 ? headSeat ^ 2 : -1;
  const showPartnerCards = headSeat >= 0 && (headSeat === 0 || headSeat === 2) && partnerSeat !== 0;

  const counts = game.hands.map((h) => h.length);
  const myTeamCount = counts[0] + counts[2];
  const oppTeamCount = counts[1] + counts[3];
  const levelName = rankName(game.level);
  const myName = players[mySeat] || SEAT_NAMES[mySeat];
  const seatLabel = (s: number) => players[s] || SEAT_NAMES[s];

  const sortedHand = [...myHand].sort((a, b) => {
    if (a.k !== undefined && b.k !== undefined) return b.k! - a.k!;
    if (a.k !== undefined) return 1;
    if (b.k !== undefined) return -1;
    if (a.r !== b.r) return b.r - a.r;
    return a.s < b.s ? -1 : 1;
  });

  // 出牌区只显示当前最新一手出牌（显示在出牌人方位），上一手/上一轮自动消失
  const roundPlaysOf = (p: number) => {
    if (!game || game.roundPlays.length === 0) return [];
    const last = game.roundPlays[game.roundPlays.length - 1];
    return last.player === p ? [last] : [];
  };
  const renderRoundPlays = (p: number) => {
    const plays = roundPlaysOf(p);
    if (plays.length === 0) return null;
    return (
      <div className="gd-play-area">
        {plays.map((pl, i) => (
          <div key={i} className={`gd-play-hand ${i === plays.length - 1 ? 'gd-latest' : ''}`}>
            <span className="gd-play-hand-name">{seatLabel(pl.player)}</span>
            <div className="gd-play-cards-row">
              {pl.cards.map((c) => (
                <span key={c.id} className={`gd-play-card ${c.k !== undefined ? 'gd-joker' : ''}`}>
                  {c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : `${rankName(c.r)}${SUIT_SYMBOL[c.s]}`}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`gd-table ${floating ? 'gd-floating' : ''}`}>
      {/* 桌垫方位水印、分区框线与铭牌（参考比赛专用桌垫） */}
      <span className="gd-dir gd-dir-n">北</span>
      <span className="gd-dir gd-dir-s">南</span>
      <span className="gd-dir gd-dir-w">西</span>
      <span className="gd-dir gd-dir-e">东</span>
      <div className="gd-zones">
        {GD_ZONES.map((z, i) => (
          <span
            key={i}
            className={`gd-zone gd-zone-dir-${z.dir}`}
            style={{ top: `${z.top}%`, left: `${z.left}%`, width: `${z.w}%`, height: `${z.h}%` }}
          >
            {z.label}
          </span>
        ))}
      </div>
      <span className="gd-table-name">掼蛋比赛专用桌垫</span>
      {/* 浮动全屏：左上角 ☰ 折叠菜单 */}
      {floating && (
        <>
          <button
            className={`gd-top-handle ${menuOpen ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            title="游戏功能"
            aria-label="游戏功能"
          >
            <span className="gd-handle-bar" />
            <span className="gd-handle-bar" />
            <span className="gd-handle-bar" />
          </button>
          <div className={`gd-menu-panel ${menuOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="gd-menu-grid">
              <button className="gd-menu-btn" onClick={() => { setSortMode((m) => (m === 'rank' ? 'grouped' : 'rank')); setMenuOpen(false); }}>
                {sortMode === 'rank' ? '🃏 一键理牌' : '↩️ 恢复排序'}
              </button>
              <button className="gd-menu-btn" onClick={() => { copyRoomCode(); setMenuOpen(false); }}>
                📋 复制房间号
              </button>
              {role === 'host' && (
                <button className="gd-menu-btn" onClick={() => { nextRound(); setMenuOpen(false); }} disabled={!game || game.phase !== 'over'}>
                  🔄 开始下一局
                </button>
              )}
              <button className="gd-menu-btn danger" onClick={() => { setFloating(false); try { exitFullscreen(); } catch { /* 忽略 */ } setMenuOpen(false); }}>
                ⛶ 退出全屏
              </button>
            </div>
            <div className="gd-menu-hint">点击棋盘任意位置关闭面板</div>
          </div>
        </>
      )}
      <div className="gd-topbar">
        <span className="gd-info">我方 <b>{myTeamCount}</b> 张</span>
        <span className="gd-info">对方 <b>{oppTeamCount}</b> 张</span>
        <span className="gd-info">目标 <b className="gd-level">过 {levelName}</b></span>
        <span className="gd-info">房间 <b className="gd-level">{roomCode}</b></span>
      </div>

      <div className="gd-seats">
        <div className={`gd-seat gd-seat-top ${game.current === 2 ? 'gd-active' : ''}`}>
          <span className="gd-seat-name">🤝 {seatLabel(2)}</span>
          {headSeat === 2 && <span className="gd-head-tag">🏆 头游</span>}
          {counts[2] <= 10 && <span className="gd-seat-count">{counts[2]} 张</span>}
          {game.roundPass.includes(2) && <span className="gd-pass-tag">不出</span>}
          {game.finished.includes(2) && <span className="gd-finished-tag">已出完</span>}
        </div>
        {showPartnerCards && partnerSeat === 2 && (
          <div className="gd-partner-cards">
            <span className="gd-partner-label">🤝 对家牌面</span>
            <div className="gd-partner-cards-row">
              {game.hands[2].map((c) => (
                <span
                  key={c.id}
                  className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'}`}
                >
                  <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                  {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                  {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                </span>
              ))}
              {game.hands[2].length === 0 && <span className="gd-partner-empty">已出完</span>}
            </div>
          </div>
        )}
        <div className="gd-play-area gd-play-north">{renderRoundPlays(2)}</div>
        <div className="gd-side-row">
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-left ${game.current === 3 ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 {seatLabel(3)}</span>
              {headSeat === 3 && <span className="gd-head-tag">🏆 头游</span>}
              {counts[3] <= 10 && <span className="gd-seat-count">{counts[3]} 张</span>}
              {game.roundPass.includes(3) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(3) && <span className="gd-finished-tag">已出完</span>}
            </div>
            {showPartnerCards && partnerSeat === 3 && (
              <div className="gd-partner-cards">
                <span className="gd-partner-label">🤝 对家牌面</span>
                <div className="gd-partner-cards-row">
                  {game.hands[3].map((c) => (
                    <span
                      key={c.id}
                      className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    >
                      <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                      {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                      {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                    </span>
                  ))}
                  {game.hands[3].length === 0 && <span className="gd-partner-empty">已出完</span>}
                </div>
              </div>
            )}
            <div className="gd-play-area gd-play-west">{renderRoundPlays(3)}</div>
          </div>
          <div className="gd-center-play">
            {game.phase === 'over' ? <span className="gd-freetext">{game.resultText}</span> :
              game.lastPlay ? <span className="gd-freetext">跟牌：{seatLabel(game.lastPlay.player)}</span> :
              <span className="gd-freetext">自由出牌</span>}
          </div>
          <div className="gd-side-col">
            <div className={`gd-seat gd-seat-right ${game.current === 1 ? 'gd-active' : ''}`}>
              <span className="gd-seat-name">😈 {seatLabel(1)}</span>
              {headSeat === 1 && <span className="gd-head-tag">🏆 头游</span>}
              {counts[1] <= 10 && <span className="gd-seat-count">{counts[1]} 张</span>}
              {game.roundPass.includes(1) && <span className="gd-pass-tag">不出</span>}
              {game.finished.includes(1) && <span className="gd-finished-tag">已出完</span>}
            </div>
            {showPartnerCards && partnerSeat === 1 && (
              <div className="gd-partner-cards">
                <span className="gd-partner-label">🤝 对家牌面</span>
                <div className="gd-partner-cards-row">
                  {game.hands[1].map((c) => (
                    <span
                      key={c.id}
                      className={`gd-mini-card ${c.k !== undefined ? 'gd-mini-joker' : ''} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    >
                      <span className="gd-mini-rank">{c.k !== undefined ? (c.k === 1 ? '大王' : '小王') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-mini-suit">{SUIT_SYMBOL[c.s]}</span>}
                      {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-mini-level">级</span>}
                      {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                    </span>
                  ))}
                  {game.hands[1].length === 0 && <span className="gd-partner-empty">已出完</span>}
                </div>
              </div>
            )}
            <div className="gd-play-area gd-play-east">{renderRoundPlays(1)}</div>
          </div>
        </div>
      </div>

      {/* 我方（南）出牌区：手牌上方 */}
      <div className="gd-play-area gd-play-south">{renderRoundPlays(0)}</div>

      <div className="gd-actions">
        <span className="gd-turn-hint">
          {game.phase === 'over' ? game.resultText : isMyTurn ? `🖐 轮到你（${myName}）出牌` : `等待 ${seatLabel(game.current)} 出牌…`}
        </span>
        <button className="gd-btn gd-btn-pass" onClick={doPass} disabled={!canPass}>不出</button>
        <button className="gd-btn gd-btn-hint" onClick={applyHint} disabled={!isMyTurn}>提示</button>
        <button className="gd-btn gd-btn-play gd-btn-primary" onClick={doPlay} disabled={!canPlay}>出牌</button>
        <button className="gd-btn gd-btn-sort" onClick={() => setSortMode((m) => (m === 'rank' ? 'grouped' : 'rank'))}>
          {sortMode === 'rank' ? '一键理牌' : '恢复'}
        </button>
      </div>

      {sortMode === 'grouped' ? (
        <div className="gd-hand gd-hand-grouped">
          {groupHand(myHand, game.level).map((g, gi) => (
            <div className="gd-hand-group" key={gi}>
              <div className="gd-hand-group-cards">
                {g.cards.map((c, ci) => (
                  <button
                    key={c.id}
                    className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? 'gd-card-joker' : (c.r === levelRank(game.level) ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
                    onClick={() => toggleCard(c.id)}
                    style={{ zIndex: 100 - ci }}
                  >
                    <span className="gd-card-corner gd-corner-tl">
                      <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
                    </span>
                    <span className="gd-card-center">{c.k !== undefined ? 'JOKER' : SUIT_SYMBOL[c.s]}</span>
                    <span className="gd-card-corner gd-corner-br">
                      <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                      {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
                    </span>
                    {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-card-level-tag">级</span>}
                    {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
                  </button>
                ))}
              </div>
              <span
                className={`gd-hand-group-label ${g.cards.every((c) => selected.includes(c.id)) ? 'gd-group-selected' : ''}`}
                onClick={() => selectGroup(g.cards)}
              >
                {g.label}
              </span>
            </div>
          ))}
          {myHand.length === 0 && <div className="gd-hand-empty">牌已出完</div>}
        </div>
      ) : (
        <div className="gd-hand">
          {sortedHand.map((c, i) => (
            <button
              key={c.id}
              className={`gd-card ${selected.includes(c.id) ? 'gd-selected' : ''} ${c.k !== undefined ? 'gd-card-joker' : (c.r === levelRank(game.level) ? 'gd-card-level' : '')} ${c.s === 'H' || c.s === 'D' ? 'gd-red' : 'gd-black'} ${isWild(c, game.level) ? 'gd-wild' : ''}`}
              onClick={() => toggleCard(c.id)}
              style={{ marginLeft: i > 0 ? -Math.min(34, 300 / sortedHand.length) : 0 }}
            >
              <span className="gd-card-corner gd-corner-tl">
                <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
              </span>
              <span className="gd-card-center">{c.k !== undefined ? 'JOKER' : SUIT_SYMBOL[c.s]}</span>
              <span className="gd-card-corner gd-corner-br">
                <span className="gd-card-rank">{c.k !== undefined ? (c.k === 1 ? 'JOKER' : 'joker') : rankName(c.r)}</span>
                {c.k === undefined && <span className="gd-card-suit">{SUIT_SYMBOL[c.s]}</span>}
              </span>
              {c.r === levelRank(game.level) && c.k === undefined && <span className="gd-card-level-tag">级</span>}
              {isWild(c, game.level) && <span className="gd-wild-tag">变</span>}
            </button>
          ))}
          {sortedHand.length === 0 && <div className="gd-hand-empty">牌已出完</div>}
        </div>
      )}

      {/* 结算弹层：房主可开下一局 */}
      {game.phase === 'over' && (
        <div className="gd-overlay">
          <div className="gd-overlay-card">
            <h2>{game.resultText}</h2>
            <p className="gd-overlay-level">当前级别：<b>过 {rankName(game.level)}</b></p>
            {game.winnerTeam !== null && (
              <p className={game.winnerTeam === teamOf(mySeat) ? 'gd-overlay-win' : 'gd-overlay-lose'}>
                {game.winnerTeam === teamOf(mySeat) ? '🎉 恭喜！你们获胜！' : '再接再厉，加油！'}
              </p>
            )}
            <div className="gd-overlay-btns">
              {role === 'host' && (
                <button className="gd-btn gd-btn-primary" onClick={nextRound}>开始下一局</button>
              )}
              {role !== 'host' && <p className="gd-online-tip">房主将开启下一局…</p>}
            </div>
          </div>
        </div>
      )}
      {notice && <div className="gd-online-notice">{notice}</div>}
    </div>
  );
};

export default GuandanOnlineGame;
