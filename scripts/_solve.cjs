"use strict";

// src/engine/xiangqi.ts
var ROWS = 10;
var COLS = 9;
function cloneXiangqiBoard(board) {
  return board.map((row) => [...row]);
}
function isXiangqiRed(piece) {
  return piece !== "" && piece === piece.toUpperCase();
}
function isXiangqiEmpty(board, row, col) {
  return board[row]?.[col] === "";
}
function xiangqiInBounds(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}
function xiangqiSameColor(p1, p2) {
  if (!p1 || !p2) return false;
  return isXiangqiRed(p1) === isXiangqiRed(p2);
}
function xiangqiPieceColor(piece) {
  if (!piece) return null;
  return isXiangqiRed(piece) ? "r" : "b";
}
function inPalace(row, col, color) {
  if (col < 3 || col > 5) return false;
  if (color === "r") {
    return row >= 7 && row <= 9;
  } else {
    return row >= 0 && row <= 2;
  }
}
function hasCrossedRiver(row, color) {
  if (color === "r") {
    return row <= 4;
  } else {
    return row >= 5;
  }
}
function getXiangqiPieceMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const color = isXiangqiRed(piece) ? "r" : "b";
  const type = piece.toLowerCase();
  const moves = [];
  const addMove = (r, c) => {
    if (!xiangqiInBounds(r, c)) return false;
    const target = board[r][c];
    if (target && xiangqiSameColor(piece, target)) return false;
    moves.push({
      from: [row, col],
      to: [r, c],
      piece,
      captures: !!target
    });
    return !target;
  };
  switch (type) {
    case "k":
      kingMoves();
      break;
    case "a":
      advisorMoves();
      break;
    case "b":
      elephantMoves();
      break;
    case "n":
      horseMoves();
      break;
    case "r":
      chariotMoves();
      break;
    case "c":
      cannonMoves();
      break;
    case "p":
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
    const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (!xiangqiInBounds(nr, nc)) continue;
      if (color === "r" && nr < 5) continue;
      if (color === "b" && nr > 4) continue;
      const er = row + dr / 2;
      const ec = col + dc / 2;
      if (!isXiangqiEmpty(board, er, ec)) continue;
      addMove(nr, nc);
    }
  }
  function horseMoves() {
    const jumps = [
      [-2, -1, -1, 0],
      [-2, 1, -1, 0],
      // 先上2，马腿在上方
      [2, -1, 1, 0],
      [2, 1, 1, 0],
      // 先下2
      [-1, -2, 0, -1],
      [1, -2, 0, -1],
      // 先左2
      [-1, 2, 0, 1],
      [1, 2, 0, 1]
      // 先右2
    ];
    for (const [dr, dc, br, bc] of jumps) {
      const nr = row + dr;
      const nc = col + dc;
      if (!xiangqiInBounds(nr, nc)) continue;
      const lr = row + br;
      const lc = col + bc;
      if (!isXiangqiEmpty(board, lr, lc)) continue;
      addMove(nr, nc);
    }
  }
  function chariotMoves() {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr;
      let nc = col + dc;
      while (xiangqiInBounds(nr, nc)) {
        if (!addMove(nr, nc)) break;
        nr += dr;
        nc += dc;
      }
    }
  }
  function cannonMoves() {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr;
      let nc = col + dc;
      while (xiangqiInBounds(nr, nc) && isXiangqiEmpty(board, nr, nc)) {
        addMove(nr, nc);
        nr += dr;
        nc += dc;
      }
      if (xiangqiInBounds(nr, nc)) {
        nr += dr;
        nc += dc;
        while (xiangqiInBounds(nr, nc)) {
          if (!isXiangqiEmpty(board, nr, nc)) {
            const target = board[nr][nc];
            if (!xiangqiSameColor(piece, target)) {
              moves.push({
                from: [row, col],
                to: [nr, nc],
                piece,
                captures: true
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
    const forward = color === "r" ? -1 : 1;
    const nr = row + forward;
    if (xiangqiInBounds(nr, col)) {
      addMove(nr, col);
    }
    if (hasCrossedRiver(row, color)) {
      if (col > 0) addMove(row, col - 1);
      if (col < COLS - 1) addMove(row, col + 1);
    }
  }
}
function applyXiangqiMove(board, from, to) {
  const newBoard = cloneXiangqiBoard(board);
  const [fr, fc] = from;
  const [tr, tc] = to;
  const captured = newBoard[tr][tc];
  newBoard[tr][tc] = newBoard[fr][fc];
  newBoard[fr][fc] = "";
  return { board: newBoard, captured };
}
function findXiangqiKing(board, color) {
  const kingChar = color === "r" ? "K" : "k";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === kingChar) return [r, c];
    }
  }
  return null;
}
function isFlyingGeneral(board, _color) {
  const redKing = findXiangqiKing(board, "r");
  const blackKing = findXiangqiKing(board, "b");
  if (!redKing || !blackKing) return false;
  if (redKing[1] !== blackKing[1]) return false;
  const col = redKing[1];
  const minRow = Math.min(redKing[0], blackKing[0]);
  const maxRow = Math.max(redKing[0], blackKing[0]);
  for (let r = minRow + 1; r < maxRow; r++) {
    if (!isXiangqiEmpty(board, r, col)) return false;
  }
  return true;
}
function isXiangqiInCheck(board, color) {
  if (isFlyingGeneral(board, color)) return true;
  const kingPos = findXiangqiKing(board, color);
  if (!kingPos) return false;
  const enemyColor = color === "r" ? "b" : "r";
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
function getAllXiangqiLegalMoves(board, color) {
  const legal = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || xiangqiPieceColor(p) !== color) continue;
      const moves = getXiangqiPieceMoves(board, r, c);
      for (const m of moves) {
        const { board: newBoard } = applyXiangqiMove(board, [r, c], m.to);
        if (!isXiangqiInCheck(newBoard, color)) {
          legal.push({
            from: [r, c],
            to: m.to,
            piece: p,
            captured: m.captures ? board[m.to[0]][m.to[1]] : void 0
          });
        }
      }
    }
  }
  return legal;
}
function isXiangqiCheckmate(board, color) {
  if (!isXiangqiInCheck(board, color)) return false;
  return getAllXiangqiLegalMoves(board, color).length === 0;
}
function isXiangqiStalemate(board, color) {
  if (isXiangqiInCheck(board, color)) return false;
  return getAllXiangqiLegalMoves(board, color).length === 0;
}
function getXiangqiGameStatus(board, turn) {
  if (isXiangqiCheckmate(board, turn)) return "checkmate";
  if (isXiangqiStalemate(board, turn)) return "stalemate";
  if (isXiangqiInCheck(board, turn)) return "check";
  return "playing";
}
function getXiangqiMoveNotation(piece, from, to, captured) {
  const isRed = isXiangqiRed(piece);
  const colsRed = "\u4E5D\u516B\u4E03\u516D\u4E94\u56DB\u4E09\u4E8C\u4E00";
  const colsBlack = "\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19";
  const numsRed = "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D";
  const numsBlack = "\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19";
  const colNames = isRed ? colsRed : colsBlack;
  const stepNames = isRed ? numsRed : numsBlack;
  const pieceMap = isRed ? { K: "\u5E05", A: "\u4ED5", B: "\u76F8", N: "\u9A6C", R: "\u8F66", C: "\u70AE", P: "\u5175" } : { K: "\u5C06", A: "\u58EB", B: "\u8C61", N: "\u9A6C", R: "\u8F66", C: "\u70AE", P: "\u5352" };
  const name = pieceMap[piece.toUpperCase()] || piece;
  const fromCol = colNames[from[1]];
  const toCol = colNames[to[1]];
  const rowDiff = to[0] - from[0];
  const forward = isRed ? rowDiff < 0 : rowDiff > 0;
  let action = "\u5E73";
  let target = toCol;
  if (rowDiff !== 0 && from[1] === to[1]) {
    action = forward ? "\u8FDB" : "\u9000";
    target = stepNames[Math.abs(rowDiff) - 1];
  } else if (rowDiff !== 0) {
    action = forward ? "\u8FDB" : "\u9000";
    target = toCol;
  }
  return `${name}${fromCol}${action}${target}${captured ? "(\u5403)" : ""}`;
}

// scripts/solve_xiangqi.ts
function emptyBoard() {
  return Array.from({ length: 10 }, () => Array(9).fill(""));
}
function setup(pieces) {
  const b = emptyBoard();
  for (const [p, r, c] of pieces) b[r][c] = p;
  return b;
}
var candidates = [
  // xq-002 闷宫：炮借士架下底，红车封宫顶(1,4)与压象眼
  ["xq-002 \u95F7\u5BAB", "\u70AE\u501F\u58EB\u67B6", [
    ["K", 9, 4],
    ["C", 2, 2],
    ["R", 3, 4],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 0, 5],
    ["b", 2, 0]
  ]],
  // xq-003 马后炮：马贴将，黑将不能升(红车压)，炮推马后
  ["xq-003 \u9A6C\u540E\u70AE", "\u7AD6\u7EBF", [
    ["K", 9, 4],
    ["N", 1, 4],
    ["C", 4, 4],
    ["R", 8, 5],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 0, 5]
  ]],
  // xq-004 卧槽马：马卧槽将，车贴肋道封升将
  ["xq-004 \u5367\u69FD\u9A6C", "\u9A6C+\u808B\u8F66", [
    ["K", 9, 4],
    ["R", 0, 2],
    ["N", 3, 4],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 0, 5]
  ]],
  // xq-005 重炮：双炮叠将，红车封黑将上升格
  ["xq-005 \u91CD\u70AE", "\u53CC\u70AE\u53E0", [
    ["K", 9, 4],
    ["C", 7, 4],
    ["C", 8, 4],
    ["R", 3, 3],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 0, 5]
  ]],
  // xq-006 双车错：黑将在肋道，红车封升路
  ["xq-006 \u53CC\u8F66\u9519", "\u4EA4\u66FF", [
    ["K", 9, 4],
    ["R", 0, 2],
    ["R", 9, 5],
    ["R", 8, 2],
    ["k", 2, 3],
    ["a", 1, 4]
  ]],
  // xq-007 铁门栓：中炮锁士，车下底
  ["xq-007 \u94C1\u95E8\u6813", "\u70AE\u9501\u8F66\u4E0B\u5E95", [
    ["K", 9, 4],
    ["C", 7, 4],
    ["R", 9, 3],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 0, 5]
  ]],
  // xq-008 挂角马：马挂士角，肋车封升将
  ["xq-008 \u6302\u89D2\u9A6C", "\u9A6C\u6302\u89D2", [
    ["K", 9, 4],
    ["R", 9, 5],
    ["N", 3, 4],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 0, 5]
  ]],
  // xq-009 钓鱼马：马控将，肋车下底
  ["xq-009 \u9493\u9C7C\u9A6C", "\u9C7C\u94A9\u8F66", [
    ["K", 9, 4],
    ["R", 8, 5],
    ["N", 2, 3],
    ["A", 7, 4],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 0, 5]
  ]],
  // xq-011 大刀剜心：车砍中士，车控升将格
  ["xq-011 \u5927\u5200\u525C\u5FC3", "\u8F66\u780D\u5FC3\u58EB", [
    ["K", 9, 4],
    ["R", 2, 4],
    ["C", 8, 4],
    ["R2", 3, 5],
    ["k", 0, 4],
    ["a", 1, 3],
    ["a", 1, 5],
    ["b", 2, 2],
    ["b", 2, 6]
  ]],
  // xq-012 弃车杀：弃车引黑车，马后炮成杀（两步杀，先验证首着后黑方无解）
  ["xq-012 \u5F03\u8F66\u6740", "\u5F03\u8F66\u5F15\u79BB", [
    ["K", 9, 4],
    ["R", 3, 3],
    ["N", 1, 4],
    ["C", 5, 4],
    ["R2", 8, 6],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 0, 5],
    ["r", 2, 4]
  ]],
  // xq-013 双车错底车
  ["xq-013 \u53CC\u8F66\u9519", "\u5E95\u8F66\u4EA4\u9519", [
    ["K", 9, 4],
    ["R", 1, 5],
    ["R2", 3, 2],
    ["R3", 4, 6],
    ["A", 7, 4],
    ["k", 0, 4],
    ["a", 1, 3],
    ["b", 2, 6]
  ]],
  // xq-014 卧槽马炮：马卧槽，炮贴肋道
  ["xq-014 \u5367\u69FD\u9A6C", "\u9A6C\u70AE\u8054\u6740", [
    ["K", 9, 4],
    ["N", 2, 4],
    ["C", 9, 3],
    ["R", 5, 5],
    ["k", 0, 4],
    ["a", 0, 3],
    ["a", 1, 5],
    ["r", 0, 0]
  ]],
  // xq-015 闷宫：炮借象架
  ["xq-015 \u95F7\u5BAB", "\u8C61\u67B6\u95F7\u5BAB", [
    ["K", 9, 4],
    ["C", 3, 0],
    ["R", 4, 4],
    ["k", 0, 4],
    ["a", 1, 3],
    ["a", 1, 5],
    ["b", 0, 2]
  ]]
];
function findMates(board) {
  const mates = [];
  const redMoves = getAllXiangqiLegalMoves(board, "r");
  for (const m of redMoves) {
    const { board: nb } = applyXiangqiMove(board, m.from, m.to);
    if (getXiangqiGameStatus(nb, "b") === "checkmate") {
      const notation = getXiangqiMoveNotation(m.piece, m.from, m.to, m.captured);
      mates.push({ from: m.from, to: m.to, notation });
    }
  }
  return mates;
}
for (const [id, desc, piecesRaw] of candidates) {
  const pieces = piecesRaw.map(([p, r, c]) => {
    let piece = p;
    if (p === "R2" || p === "R3") piece = "R";
    return [piece, r, c];
  });
  const b = setup(pieces);
  const blackInCheckBefore = isXiangqiInCheck(b, "b");
  const mates = findMates(b);
  console.log(`
\u3010${id}\u3011${desc}`);
  if (blackInCheckBefore) console.log(`  \u26A0\uFE0F \u8D70\u524D\u9ED1\u65B9\u5DF2\u88AB\u5C06\u519B\uFF08\u5C40\u9762\u4E0D\u5408\u6CD5\uFF09`);
  if (mates.length === 0) {
    console.log(`  \u274C \u65E0\u89E3\uFF08\u975E\u4E00\u6B65\u6740\uFF09`);
  } else {
    for (const m of mates) {
      const uniq = mates.length === 1 ? "\u2705\u552F\u4E00" : "\u26A0\uFE0F\u591A\u89E3";
      console.log(`  ${uniq} ${m.notation}  [${m.from}]\u2192[${m.to}]`);
    }
  }
}
