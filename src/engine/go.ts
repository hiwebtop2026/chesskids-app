/**
 * ChessKids - 围棋规则引擎
 * 支持 9/13/19 路棋盘：落子、提子、打劫（ko）、自杀禁止、pass、数子法胜负
 */

export type GoColor = 'b' | 'w'; // b=黑（先手）, w=白
export type GoCell = GoColor | '';
export type GoBoard = GoCell[][]; // [row][col]，row 0 为黑方（上）一侧

export const GO_SIZES = [9, 13, 19] as const;
export type GoBoardSize = (typeof GO_SIZES)[number];

/** 星位（19 路标准） */
export const GO_STAR_POINTS_19: Array<[number, number]> = [
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15],
];

/** 生成空棋盘 */
export function createGoBoard(size: GoBoardSize = 19): GoBoard {
  return Array.from({ length: size }, () => Array<GoCell>(size).fill(''));
}

export function cloneGoBoard(b: GoBoard): GoBoard {
  return b.map((row) => [...row]);
}

const inBoard = (r: number, c: number, n: number) => r >= 0 && r < n && c >= 0 && c < n;

/** 计算 (r,c) 处棋子的连通组（组内所有子 + 气数） */
export function goGroupInfo(b: GoBoard, r: number, c: number): { group: Array<[number, number]>; liberties: Set<string> } {
  const n = b.length;
  const color = b[r][c];
  const group: Array<[number, number]> = [];
  const liberties = new Set<string>();
  if (!color) return { group, liberties };
  const visited = new Set<string>();
  const stack: Array<[number, number]> = [[r, c]];
  visited.add(`${r},${c}`);
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    group.push([cr, cc]);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = cr + dr, nc = cc + dc;
      if (!inBoard(nr, nc, n)) continue;
      const cell = b[nr][nc];
      if (cell === '') liberties.add(`${nr},${nc}`);
      else if (cell === color && !visited.has(`${nr},${nc}`)) {
        visited.add(`${nr},${nc}`);
        stack.push([nr, nc]);
      }
    }
  }
  return { group, liberties };
}

/** 在 (r,c) 落子 color——返回：新棋盘 + 提子数 + 是否合法（含打劫/自杀禁止） */
export function goPlaceStone(
  b: GoBoard,
  r: number,
  c: number,
  color: GoColor,
  koPoint: [number, number] | null,
): { board: GoBoard | null; captured: number; ko: [number, number] | null } {
  const n = b.length;
  if (!inBoard(r, c, n) || b[r][c] !== '') return { board: null, captured: 0, ko: null };

  const opp: GoColor = color === 'b' ? 'w' : 'b';
  const nb = cloneGoBoard(b);
  nb[r][c] = color;

  // 1) 提对方无气组
  let captured = 0;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = r + dr, nc = c + dc;
    if (!inBoard(nr, nc, n) || nb[nr][nc] !== opp) continue;
    const { group, liberties } = goGroupInfo(nb, nr, nc);
    if (liberties.size === 0) {
      for (const [gr, gc] of group) {
        nb[gr][gc] = '';
        captured++;
      }
    }
  }

  // 2) 自杀检查：自己无气且未提子 → 非法
  const self = goGroupInfo(nb, r, c);
  if (self.liberties.size === 0) {
    return { board: null, captured: 0, ko: null };
  }

  // 3) 打劫：提 1 子 → 记录提子位置，下一次对方不能立即在此落子
  let ko: [number, number] | null = null;
  if (captured === 1 && self.liberties.size === 1 && self.group.length === 1) {
    // 简单劫：我方提 1 子且自身仅 1 气 1 子（提后仅剩 1 气）——找被提子位置
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (!inBoard(nr, nc, n)) continue;
      if (b[nr][nc] === opp && nr === r + dr && nc === c + dc) {
        // 被提子必为四邻之一——确认它确实被提
        if (nb[nr][nc] === '') {
          ko = [nr, nc];
          break;
        }
      }
    }
  }
  // 若上一步是劫（koPoint），本步不能落在 koPoint（立即回提）
  if (koPoint && r === koPoint[0] && c === koPoint[1]) {
    return { board: null, captured: 0, ko: null };
  }

  return { board: nb, captured, ko };
}

/** 双方连续 pass 判定结束 */
export interface GoGameState {
  board: GoBoard;
  turn: GoColor;
  passCount: number; // 连续 pass 数（2 结束）
  ko: [number, number] | null;
  moves: Array<{ r: number; c: number; color: GoColor; captured: number; pass?: boolean }>;
  size: GoBoardSize;
}

export function createGoGame(size: GoBoardSize = 19): GoGameState {
  return { board: createGoBoard(size), turn: 'b', passCount: 0, ko: null, moves: [], size };
}

/** 落子（合法则更新状态，非法返回 null） */
export function goPlayMove(s: GoGameState, r: number, c: number): GoGameState | null {
  if (s.passCount >= 2) return null; // 已结束
  const res = goPlaceStone(s.board, r, c, s.turn, s.ko);
  if (!res.board) return null;
  return {
    board: res.board,
    turn: s.turn === 'b' ? 'w' : 'b',
    passCount: 0,
    ko: res.ko,
    moves: [...s.moves, { r, c, color: s.turn, captured: res.captured }],
    size: s.size,
  };
}

/** 放弃落子（pass） */
export function goPass(s: GoGameState): GoGameState {
  return {
    ...s,
    turn: s.turn === 'b' ? 'w' : 'b',
    passCount: s.passCount + 1,
    ko: null,
    moves: [...s.moves, { r: -1, c: -1, color: s.turn, captured: 0, pass: true }],
  };
}

export function isGoGameOver(s: GoGameState): boolean {
  return s.passCount >= 2;
}

/**
 * 数子法胜负（中国规则，黑贴 3¾ 子）：
 * 双方 pass 后，数黑方（子 + 领地）——黑 ≥ 184.5 则黑胜。
 * 简化领地判定：把"仅被一方包围的空点"计为该方领地（四邻同色连通），其余空点不算。
 */
export function goCountScore(b: GoBoard): { black: number; white: number; blackWins: boolean; territory: GoBoard } {
  const n = b.length;
  const territory = cloneGoBoard(b);
  // 空点：找出连通空组，看是否仅邻接一方
  const visited = new Set<string>();
  let blackTerritory = 0, whiteTerritory = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] !== '' || visited.has(`${r},${c}`)) continue;
      // BFS 空组
      const group: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[r, c]];
      visited.add(`${r},${c}`);
      let touchesB = false, touchesW = false;
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        group.push([cr, cc]);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = cr + dr, nc = cc + dc;
          if (!inBoard(nr, nc, n)) continue;
          const cell = b[nr][nc];
          if (cell === 'b') touchesB = true;
          else if (cell === 'w') touchesW = true;
          else if (cell === '' && !visited.has(`${nr},${nc}`)) {
            visited.add(`${nr},${nc}`);
            stack.push([nr, nc]);
          }
        }
      }
      if (touchesB && !touchesW) {
        blackTerritory += group.length;
        for (const [gr, gc] of group) territory[gr][gc] = 'b';
      } else if (touchesW && !touchesB) {
        whiteTerritory += group.length;
        for (const [gr, gc] of group) territory[gr][gc] = 'w';
      }
    }
  }
  // 子 + 领地
  let blackStones = 0, whiteStones = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] === 'b') blackStones++;
      else if (b[r][c] === 'w') whiteStones++;
    }
  }
  const black = blackStones + blackTerritory;
  const white = whiteStones + whiteTerritory + 7.5; // 贴目（数子法黑贴 3¾ 子 ≈ 白 7.5 目）
  return { black, white, blackWins: black >= 184.5 && black > white, territory };
}

/** 获取该位置星位（按棋盘大小） */
export function isGoStarPoint(r: number, c: number, size: GoBoardSize): boolean {
  if (size !== 19) {
    const d = 19 - size;
    const base = (19 - 1 - d) / 2;
    const stars: Array<[number, number]> = [
      [base, base], [base, base + d], [base + 2 * d, base], [base + 2 * d, base + 2 * d], [base + d, base + d],
    ];
    return stars.some(([sr, sc]) => sr === r && sc === c);
  }
  return GO_STAR_POINTS_19.some(([sr, sc]) => sr === r && sc === c);
}
