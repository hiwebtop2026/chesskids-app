/**
 * ChessKids - 中国象棋引擎
 * 棋盘：9列 x 10行
 * row 0-4 = 黑方区域，row 5-9 = 红方区域
 * col 0-8 = 列
 * 九宫：col 3-5, row 0-2 (黑方) 和 row 7-9 (红方)
 * 河界：row 4 和 row 5 之间
 */

import type {
  XiangqiBoard,
  XiangqiPiece,
  XiangqiColor,
  XiangqiSquare,
  XiangqiMove,
  XiangqiLegalMove,
  XiangqiGameStatus,
} from '../types/xiangqi';

// ===== 棋盘常量 =====

const ROWS = 10;
const COLS = 9;

/** 初始棋盘布局
 * row 0: 黑方底线 車馬象士將士象馬車
 * row 1:         空
 * row 2:           砲    砲
 * row 3: 卒 卒 卒 卒 卒
 * ...
 * row 6: 兵 兵 兵 兵 兵
 * row 7:           炮    炮
 * row 8:         空
 * row 9: 红方底线 俥傌相仕帥仕相傌俥
 */
export const XIANGQI_INITIAL_BOARD: XiangqiBoard = [
  ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'], // row 0 黑方底线
  ['', '', '', '', '', '', '', '', ''],          // row 1
  ['', 'c', '', '', '', '', '', 'c', ''],        // row 2 炮
  ['p', '', 'p', '', 'p', '', 'p', '', 'p'],     // row 3 卒
  ['', '', '', '', '', '', '', '', ''],          // row 4 河岸(黑)
  ['', '', '', '', '', '', '', '', ''],          // row 5 河岸(红)
  ['P', '', 'P', '', 'P', '', 'P', '', 'P'],     // row 6 兵
  ['', 'C', '', '', '', '', '', 'C', ''],        // row 7 炮
  ['', '', '', '', '', '', '', '', ''],          // row 8
  ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'], // row 9 红方底线
];

// ===== 辅助函数 =====

export function createEmptyXiangqiBoard(): XiangqiBoard {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(''));
}

export function cloneXiangqiBoard(board: XiangqiBoard): XiangqiBoard {
  return board.map(row => [...row]);
}

export function isXiangqiRed(piece: XiangqiPiece): boolean {
  return piece !== '' && piece === piece.toUpperCase();
}

export function isXiangqiBlack(piece: XiangqiPiece): boolean {
  return piece !== '' && piece === piece.toLowerCase();
}

export function isXiangqiEmpty(board: XiangqiBoard, row: number, col: number): boolean {
  return board[row]?.[col] === '';
}

export function xiangqiInBounds(row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

export function xiangqiSameColor(p1: XiangqiPiece, p2: XiangqiPiece): boolean {
  if (!p1 || !p2) return false;
  return isXiangqiRed(p1) === isXiangqiRed(p2);
}

export function xiangqiPieceColor(piece: XiangqiPiece): XiangqiColor | null {
  if (!piece) return null;
  return isXiangqiRed(piece) ? 'r' : 'b';
}

/** 判断是否在九宫内 */
function inPalace(row: number, col: number, color: XiangqiColor): boolean {
  if (col < 3 || col > 5) return false;
  if (color === 'r') {
    return row >= 7 && row <= 9;
  } else {
    return row >= 0 && row <= 2;
  }
}

/** 判断是否过河 */
function hasCrossedRiver(row: number, color: XiangqiColor): boolean {
  if (color === 'r') {
    return row <= 4; // 红兵过河到黑方区域
  } else {
    return row >= 5; // 黑卒过河到红方区域
  }
}

// ===== 走法生成 =====

/** 获取某个棋子的所有走法（不考虑将军） */
export function getXiangqiPieceMoves(
  board: XiangqiBoard,
  row: number,
  col: number,
): XiangqiLegalMove[] {
  const piece = board[row][col];
  if (!piece) return [];

  const color: XiangqiColor = isXiangqiRed(piece) ? 'r' : 'b';
  const type = piece.toLowerCase();
  const moves: XiangqiLegalMove[] = [];

  const addMove = (r: number, c: number) => {
    if (!xiangqiInBounds(r, c)) return false;
    const target = board[r][c];
    if (target && xiangqiSameColor(piece, target)) return false;
    moves.push({
      from: [row, col],
      to: [r, c],
      piece,
      captures: !!target,
    });
    return !target; // 返回是否可以继续沿直线走
  };

  switch (type) {
    case 'k': // 将/帅
      kingMoves();
      break;
    case 'a': // 士/仕
      advisorMoves();
      break;
    case 'b': // 象/相
      elephantMoves();
      break;
    case 'n': // 马
      horseMoves();
      break;
    case 'r': // 车
      chariotMoves();
      break;
    case 'c': // 炮
      cannonMoves();
      break;
    case 'p': // 兵/卒
      pawnMoves();
      break;
  }

  return moves;

  function kingMoves() {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (inPalace(nr, nc, color)) {
        addMove(nr, nc);
      }
    }
  }

  function advisorMoves() {
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (inPalace(nr, nc, color)) {
        addMove(nr, nc);
      }
    }
  }

  function elephantMoves() {
    // 象走田：2步斜向，象眼不能被塞
    const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (!xiangqiInBounds(nr, nc)) continue;
      // 不能过河
      if (color === 'r' && nr < 5) continue;
      if (color === 'b' && nr > 4) continue;
      // 象眼：中间点
      const er = row + dr / 2;
      const ec = col + dc / 2;
      if (!isXiangqiEmpty(board, er, ec)) continue; // 象眼被塞
      addMove(nr, nc);
    }
  }

  function horseMoves() {
    // 马走日：先直1再斜1，马腿不能被别
    const jumps = [
      [-2, -1, -1, 0], [-2, 1, -1, 0],   // 先上2，马腿在上方
      [2, -1, 1, 0], [2, 1, 1, 0],       // 先下2
      [-1, -2, 0, -1], [1, -2, 0, -1],   // 先左2
      [-1, 2, 0, 1], [1, 2, 0, 1],       // 先右2
    ];
    for (const [dr, dc, br, bc] of jumps) {
      const nr = row + dr;
      const nc = col + dc;
      if (!xiangqiInBounds(nr, nc)) continue;
      // 马腿
      const lr = row + br;
      const lc = col + bc;
      if (!isXiangqiEmpty(board, lr, lc)) continue; // 马腿被别
      addMove(nr, nc);
    }
  }

  function chariotMoves() {
    // 车走直线，任意距离
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr;
      let nc = col + dc;
      while (xiangqiInBounds(nr, nc)) {
        if (!addMove(nr, nc)) break; // 遇到棋子停止
        nr += dr;
        nc += dc;
      }
    }
  }

  function cannonMoves() {
    // 炮：移动时同车，吃子需翻山（隔一个子）
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr;
      let nc = col + dc;
      // 第一阶段：空格可走
      while (xiangqiInBounds(nr, nc) && isXiangqiEmpty(board, nr, nc)) {
        addMove(nr, nc);
        nr += dr;
        nc += dc;
      }
      // 遇到第一个子（炮架），继续找第二个子
      if (xiangqiInBounds(nr, nc)) {
        nr += dr;
        nc += dc;
        while (xiangqiInBounds(nr, nc)) {
          if (!isXiangqiEmpty(board, nr, nc)) {
            // 第二个子：可以吃
            const target = board[nr][nc];
            if (!xiangqiSameColor(piece, target)) {
              moves.push({
                from: [row, col],
                to: [nr, nc],
                piece,
                captures: true,
              });
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    }
  }

  function pawnMoves() {
    // 兵/卒：前进一格，过河后可左右
    const forward = color === 'r' ? -1 : 1; // 红兵向上(row减)，黑卒向下(row加)
    // 前进
    const nr = row + forward;
    if (xiangqiInBounds(nr, col)) {
      addMove(nr, col);
    }
    // 过河后可左右
    if (hasCrossedRiver(row, color)) {
      if (col > 0) addMove(row, col - 1);
      if (col < COLS - 1) addMove(row, col + 1);
    }
  }
}

// ===== 应用走法 =====

export function applyXiangqiMove(
  board: XiangqiBoard,
  from: XiangqiSquare,
  to: XiangqiSquare,
): { board: XiangqiBoard; captured: XiangqiPiece } {
  const newBoard = cloneXiangqiBoard(board);
  const [fr, fc] = from;
  const [tr, tc] = to;
  const captured = newBoard[tr][tc];
  newBoard[tr][tc] = newBoard[fr][fc];
  newBoard[fr][fc] = '';
  return { board: newBoard, captured };
}

// ===== 将军检测 =====

/** 找到将/帅的位置 */
export function findXiangqiKing(
  board: XiangqiBoard,
  color: XiangqiColor,
): XiangqiSquare | null {
  const kingChar = color === 'r' ? 'K' : 'k';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === kingChar) return [r, c];
    }
  }
  return null;
}

/** 白脸将（飞将）检测：两王在同一列且中间无子 */
function isFlyingGeneral(board: XiangqiBoard, _color: XiangqiColor): boolean {
  const redKing = findXiangqiKing(board, 'r');
  const blackKing = findXiangqiKing(board, 'b');
  if (!redKing || !blackKing) return false;
  if (redKing[1] !== blackKing[1]) return false; // 不同列
  const col = redKing[1];
  const minRow = Math.min(redKing[0], blackKing[0]);
  const maxRow = Math.max(redKing[0], blackKing[0]);
  for (let r = minRow + 1; r < maxRow; r++) {
    if (!isXiangqiEmpty(board, r, col)) return false; // 中间有子
  }
  return true; // 两王对脸 = 飞将（当前走方被将军）
}

/** 判断某方是否被将军 */
export function isXiangqiInCheck(
  board: XiangqiBoard,
  color: XiangqiColor,
): boolean {
  // 飞将检测
  if (isFlyingGeneral(board, color)) return true;

  const kingPos = findXiangqiKing(board, color);
  if (!kingPos) return false;

  const enemyColor: XiangqiColor = color === 'r' ? 'b' : 'r';
  // 遍历敌方所有棋子，看是否能攻击到王
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || xiangqiPieceColor(p) !== enemyColor) continue;
      const moves = getXiangqiPieceMoves(board, r, c);
      for (const m of moves) {
        if (m.to[0] === kingPos[0] && m.to[1] === kingPos[1]) {
          return true;
        }
      }
    }
  }
  return false;
}

/** 获取所有合法走法（考虑将军） */
export function getAllXiangqiLegalMoves(
  board: XiangqiBoard,
  color: XiangqiColor,
): XiangqiMove[] {
  const legal: XiangqiMove[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || xiangqiPieceColor(p) !== color) continue;
      const moves = getXiangqiPieceMoves(board, r, c);
      for (const m of moves) {
        const { board: newBoard } = applyXiangqiMove(board, [r, c], m.to);
        // 走后不能被将军
        if (!isXiangqiInCheck(newBoard, color)) {
          legal.push({
            from: [r, c],
            to: m.to,
            piece: p,
            captured: m.captures ? board[m.to[0]][m.to[1]] : undefined,
          });
        }
      }
    }
  }
  return legal;
}

/** 判断是否将死 */
export function isXiangqiCheckmate(
  board: XiangqiBoard,
  color: XiangqiColor,
): boolean {
  if (!isXiangqiInCheck(board, color)) return false;
  return getAllXiangqiLegalMoves(board, color).length === 0;
}

/** 判断是否困毙（无子可动但没被将军） */
export function isXiangqiStalemate(
  board: XiangqiBoard,
  color: XiangqiColor,
): boolean {
  if (isXiangqiInCheck(board, color)) return false;
  return getAllXiangqiLegalMoves(board, color).length === 0;
}

/** 获取游戏状态 */
export function getXiangqiGameStatus(
  board: XiangqiBoard,
  turn: XiangqiColor,
): XiangqiGameStatus {
  if (isXiangqiCheckmate(board, turn)) return 'checkmate';
  if (isXiangqiStalemate(board, turn)) return 'stalemate';
  if (isXiangqiInCheck(board, turn)) return 'check';
  return 'playing';
}

/** 判断一步走法是否合法 */
export function isXiangqiMoveLegal(
  board: XiangqiBoard,
  from: XiangqiSquare,
  to: XiangqiSquare,
  color: XiangqiColor,
): boolean {
  const legalMoves = getAllXiangqiLegalMoves(board, color);
  return legalMoves.some(
    m => m.from[0] === from[0] && m.from[1] === from[1] &&
         m.to[0] === to[0] && m.to[1] === to[1],
  );
}

/** 中文记谱
 * 路名从各自右手边数起：红方在下（col 8 = 一路），黑方在上（col 0 = 1 路）
 * 红方用汉字数字、黑方用全角数字（符合传统记谱习惯）
 */
export function getXiangqiMoveNotation(
  piece: string,
  from: XiangqiSquare,
  to: XiangqiSquare,
  captured?: string,
): string {
  const isRed = isXiangqiRed(piece);
  const colsRed = '九八七六五四三二一';   // 红方路名
  const colsBlack = '１２３４５６７８９'; // 黑方路名
  const numsRed = '一二三四五六七八九';   // 红方进退步数
  const numsBlack = '１２３４５６７８９'; // 黑方进退步数
  const colNames = isRed ? colsRed : colsBlack;
  const stepNames = isRed ? numsRed : numsBlack;
  const pieceMap: Record<string, string> = isRed
    ? { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' }
    : { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' };
  const name = pieceMap[piece.toUpperCase()] || piece;
  const fromCol = colNames[from[1]];
  const toCol = colNames[to[1]];
  const rowDiff = to[0] - from[0];
  const forward = isRed ? rowDiff < 0 : rowDiff > 0;
  let action = '平';
  let target = toCol;
  if (rowDiff !== 0 && from[1] === to[1]) {
    // 直走（车、炮、兵、帅）：步数
    action = forward ? '进' : '退';
    target = stepNames[Math.abs(rowDiff) - 1];
  } else if (rowDiff !== 0) {
    // 斜走（马、相、士）：落点列
    action = forward ? '进' : '退';
    target = toCol;
  }
  return `${name}${fromCol}${action}${target}${captured ? '(吃)' : ''}`;
}
