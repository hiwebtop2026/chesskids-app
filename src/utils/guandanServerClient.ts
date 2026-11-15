/**
 * 掼蛋服务端权威通道客户端
 *
 * - 连接现有 Node + ws 服务器（端口 3001，与页面同主机）
 * - 服务端负责发牌、仲裁、AI 托管；客户端只发送动作、接收自己视角的状态
 * - 断线自动重连：携带房间令牌重新入座（对局中服务端保留座位 90 秒）
 * - 服务器不可达时抛出错误，由上层降级到 PeerJS P2P 通道
 */
import type { GDGameState } from '../engine/guandan/room.ts';

export interface GDServerPlayer {
  seat: number;
  name: string;
  isAI: boolean;
  online: boolean;
}

export interface GDWelcomeMessage {
  type: 'GD_WELCOME';
  roomCode: string;
  seat: number;
  token: string;
  hostSeat: number;
  status: 'waiting' | 'playing' | 'over';
  players: (GDServerPlayer | null)[];
}

export interface GDRoomMessage {
  type: 'GD_ROOM';
  roomCode: string;
  hostSeat: number;
  status: 'waiting' | 'playing' | 'over';
  players: (GDServerPlayer | null)[];
}

export interface GDStateMessage {
  type: 'GD_STATE';
  seat: number;
  state: GDGameState;
}

export interface GDErrorMessage {
  type: 'GD_ERROR';
  code: string;
  message: string;
}

export interface GDServerHandlers {
  onWelcome?: (msg: GDWelcomeMessage) => void;
  onRoom?: (msg: GDRoomMessage) => void;
  onState?: (msg: GDStateMessage) => void;
  onError?: (msg: GDErrorMessage) => void;
  onConnection?: (state: 'connecting' | 'open' | 'closed' | 'reconnected') => void;
}

const TOKEN_PREFIX = 'gd-room-token:';

function readToken(code: string): string | null {
  try { return sessionStorage.getItem(TOKEN_PREFIX + code.toUpperCase()); } catch { return null; }
}
function writeToken(code: string, token: string): void {
  try { sessionStorage.setItem(TOKEN_PREFIX + code.toUpperCase(), token); } catch { /* 隐私模式忽略 */ }
}

function wsUrl(): string {
  const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof location !== 'undefined' ? location.hostname : '127.0.0.1';
  return `${proto}//${host}:3001`;
}

export class GuandanServerClient {
  private ws: WebSocket | null = null;
  private handlers: GDServerHandlers;
  private roomCode = '';
  private token = '';
  private manualClose = false;
  private retries = 0;
  private connectPromise: Promise<void> | null = null;
  /** 连接建立前暂存的动作（create/join） */
  private pending: object[] = [];

  constructor(handlers: GDServerHandlers) {
    this.handlers = handlers;
  }

  get currentRoom(): string { return this.roomCode; }
  get seatToken(): string { return this.token; }

  /** 建立连接，2.5 秒内未连通视为服务器不可用 */
  connect(timeoutMs = 2500): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.manualClose = false;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.handlers.onConnection?.('connecting');
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl());
      } catch (err) {
        this.connectPromise = null;
        reject(err);
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        try { ws.close(); } catch { /* 忽略 */ }
        reject(new Error('server-timeout'));
      }, timeoutMs);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.connectPromise = null;
        this.retries = 0;
        this.handlers.onConnection?.('open');
        // 重连后自动携带令牌归位
        if (this.roomCode && this.token) {
          this.rawSend({ type: 'GD_JOIN', roomCode: this.roomCode, token: this.token, name: '玩家' });
        }
        const queue = [...this.pending];
        this.pending = [];
        queue.forEach((m) => this.rawSend(m));
        resolve();
      };

      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.connectPromise = null;
        reject(new Error('server-unreachable'));
      };

      ws.onmessage = (ev) => this.handleRaw(ev.data);

      ws.onclose = () => {
        this.handlers.onConnection?.('closed');
        this.ws = null;
        if (this.manualClose) return;
        if (!this.roomCode) return;
        // 对局中断线：退避重连，最多 3 次
        if (this.retries < 3) {
          const delay = 700 * 2 ** this.retries;
          this.retries += 1;
          setTimeout(() => {
            if (this.manualClose) return;
            this.connect().then(() => this.handlers.onConnection?.('reconnected')).catch(() => { /* 放弃 */ });
          }, delay);
        }
      };
    });

    return this.connectPromise;
  }

  private rawSend(msg: object): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private send(msg: object): void {
    if (!this.rawSend(msg)) this.pending.push(msg);
  }

  private handleRaw(raw: unknown): void {
    let msg: Record<string, unknown> & { type?: string };
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'GD_WELCOME': {
        const m = msg as unknown as GDWelcomeMessage;
        this.roomCode = m.roomCode;
        this.token = m.token;
        writeToken(m.roomCode, m.token);
        this.handlers.onWelcome?.(m);
        break;
      }
      case 'GD_ROOM':
        this.handlers.onRoom?.(msg as unknown as GDRoomMessage);
        break;
      case 'GD_STATE':
        this.handlers.onState?.(msg as unknown as GDStateMessage);
        break;
      case 'GD_ERROR':
        this.handlers.onError?.(msg as unknown as GDErrorMessage);
        break;
      default:
        break;
    }
  }

  createRoom(name: string): void {
    this.roomCode = '';
    this.token = '';
    this.send({ type: 'GD_CREATE', name });
  }

  joinRoom(code: string, name: string): void {
    const c = code.trim().toUpperCase();
    this.roomCode = c;
    this.token = readToken(c) || '';
    this.send({ type: 'GD_JOIN', roomCode: c, name, token: this.token });
  }

  chooseSeat(seat: number): void {
    this.send({ type: 'GD_SEAT', seat });
  }

  startGame(aiCount: number, difficulty: string): void {
    this.send({ type: 'GD_START', aiCount, difficulty });
  }

  play(cards: { id: number }[]): void {
    this.send({ type: 'GD_PLAY', cards });
  }

  pass(): void {
    this.send({ type: 'GD_PASS' });
  }

  nextRound(): void {
    this.send({ type: 'GD_NEXT' });
  }

  leave(): void {
    this.rawSend({ type: 'GD_LEAVE' });
    this.roomCode = '';
    this.token = '';
  }

  close(): void {
    this.manualClose = true;
    if (this.roomCode && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'GD_LEAVE' })); } catch { /* 忽略 */ }
    }
    this.roomCode = '';
    this.token = '';
    this.pending = [];
    if (this.ws) {
      try { this.ws.close(); } catch { /* 忽略 */ }
      this.ws = null;
    }
  }
}
