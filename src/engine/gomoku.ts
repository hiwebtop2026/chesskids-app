/**
 * ChessKids - 五子棋规则引擎
 * 15×15 标准棋盘，黑先白后，连五即胜（简易规则，适合少儿入门；无禁手）
 */

export type GomokuColor = 'b' | 'w'; // b=黑（先手）, w=白
export type GomokuCell = GomokuColor | '';
export type GomokuBoard = GomokuCell[][]; // [row][col]，row 0 为上方

export const GOMOKU_SIZE = 15;

/** 星位（15 路标准五子棋/围棋棋盘） */
export const GOMOKU_STAR_POINTS: Array<[number, number]> = [
  [3, 3], [3, 7], [3, 11],
  [7, 3], [7, 7], [7, 11],
  [11, 3], [11, 7], [11, 11],
];

export function createGomokuBoard(): GomokuBoard {
  return Array.from({ length: GOMOKU_SIZE }, () => Array<GomokuCell>(GOMOKU_SIZE).fill(''));
}

export function cloneGomokuBoard(b: GomokuBoard): GomokuBoard {
  return b.map((row) => [...row]);
}

export interface GomokuMove {
  r: number;
  c: number;
  color: GomokuColor;
}

export interface GomokuGameState {
  board: GomokuBoard;
  turn: GomokuColor;
  moves: GomokuMove[];
  winner: GomokuColor | 'draw' | null;
  over: boolean;
}

export function createGomokuGame(): GomokuGameState {
  return {
    board: createGomokuBoard(),
    turn: 'b',
    moves: [],
    winner: null,
    over: false,
  };
}

const inBoard = (r: number, c: number) => r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE;

/** 在 (r,c) 落子 color——返回新棋盘；该位已有子/出界返回 null */
export function gomokuPlaceStone(b: GomokuBoard, r: number, c: number, color: GomokuColor): GomokuBoard | null {
  if (!inBoard(r, c) || b[r][c] !== '') return null;
  const next = cloneGomokuBoard(b);
  next[r][c] = color;
  return next;
}

/** 检查 (r,c) 处 color 是否形成五连（横/竖/两斜） */
export function checkGomokuWin(b: GomokuBoard, r: number, c: number, color: GomokuColor): boolean {
  const dirs: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (const s of [1, -1]) {
      let nr = r + dr * s, nc = c + dc * s;
      while (inBoard(nr, nc) && b[nr][nc] === color) {
        count++;
        nr += dr * s;
        nc += dc * s;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}

/** 棋盘是否已满（和棋） */
export function isGomokuBoardFull(b: GomokuBoard): boolean {
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (b[r][c] === '') return false;
    }
  }
  return true;
}

/** 落子推进对局——返回新状态；非法落子返回 null */
export function gomokuPlayMove(g: GomokuGameState, r: number, c: number): GomokuGameState | null {
  if (g.over) return null;
  const next = gomokuPlaceStone(g.board, r, c, g.turn);
  if (!next) return null;
  const color = g.turn;
  const win = checkGomokuWin(next, r, c, color);
  const full = isGomokuBoardFull(next);
  const moves = [...g.moves, { r, c, color }];
  return {
    board: next,
    turn: color === 'b' ? 'w' : 'b',
    moves,
    winner: win ? color : full ? 'draw' : null,
    over: win || full,
  };
}

/** 悔棋：撤销指定步数 */
export function gomokuUndo(g: GomokuGameState, count: number): GomokuGameState {
  const keep = g.moves.slice(0, Math.max(0, g.moves.length - count));
  const board = createGomokuBoard();
  for (const m of keep) board[m.r][m.c] = m.color;
  return {
    board,
    turn: keep.length % 2 === 0 ? 'b' : 'w',
    moves: keep,
    winner: null,
    over: false,
  };
}

/** 计算某色棋子的胜线（五连坐标），无则返回 null */
export function findGomokuWinningLine(board: GomokuBoard, color: GomokuColor): Array<[number, number]> | null {
  const n = GOMOKU_SIZE;
  const dirs: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (board[r][c] !== color) continue;
      for (const [dr, dc] of dirs) {
        const line: Array<[number, number]> = [[r, c]];
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < n && nc >= 0 && nc < n && board[nr][nc] === color) {
          line.push([nr, nc]);
          nr += dr; nc += dc;
        }
        if (line.length >= 5) return line;
      }
    }
  }
  return null;
}
