var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// tmp_vs_new.mjs
var tmp_vs_new_exports = {};
__export(tmp_vs_new_exports, {
  selfplay: () => selfplay,
  xiangqiBestMove: () => xiangqiBestMove
});
function cloneXiangqiBoard2(board) {
  return board.map((row) => [...row]);
}
function isXiangqiRed2(piece) {
  return piece !== "" && piece === piece.toUpperCase();
}
function isXiangqiEmpty2(board, row, col) {
  return board[row]?.[col] === "";
}
function xiangqiInBounds2(row, col) {
  return row >= 0 && row < ROWS2 && col >= 0 && col < COLS2;
}
function xiangqiSameColor2(p1, p2) {
  if (!p1 || !p2) return false;
  return isXiangqiRed2(p1) === isXiangqiRed2(p2);
}
function xiangqiPieceColor2(piece) {
  if (!piece) return null;
  return isXiangqiRed2(piece) ? "r" : "b";
}
function inPalace2(row, col, color) {
  if (col < 3 || col > 5) return false;
  if (color === "r") {
    return row >= 7 && row <= 9;
  } else {
    return row >= 0 && row <= 2;
  }
}
function hasCrossedRiver2(row, color) {
  if (color === "r") {
    return row <= 4;
  } else {
    return row >= 5;
  }
}
function getXiangqiPieceMoves2(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const color = isXiangqiRed2(piece) ? "r" : "b";
  const type = piece.toLowerCase();
  const moves = [];
  const addMove = (r, c) => {
    if (!xiangqiInBounds2(r, c)) return false;
    const target = board[r][c];
    if (target && xiangqiSameColor2(piece, target)) return false;
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
      if (inPalace2(nr, nc, color)) {
        addMove(nr, nc);
      }
    }
  }
  function advisorMoves() {
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (inPalace2(nr, nc, color)) {
        addMove(nr, nc);
      }
    }
  }
  function elephantMoves() {
    const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (!xiangqiInBounds2(nr, nc)) continue;
      if (color === "r" && nr < 5) continue;
      if (color === "b" && nr > 4) continue;
      const er = row + dr / 2;
      const ec = col + dc / 2;
      if (!isXiangqiEmpty2(board, er, ec)) continue;
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
      if (!xiangqiInBounds2(nr, nc)) continue;
      const lr = row + br;
      const lc = col + bc;
      if (!isXiangqiEmpty2(board, lr, lc)) continue;
      addMove(nr, nc);
    }
  }
  function chariotMoves() {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr;
      let nc = col + dc;
      while (xiangqiInBounds2(nr, nc)) {
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
      while (xiangqiInBounds2(nr, nc) && isXiangqiEmpty2(board, nr, nc)) {
        addMove(nr, nc);
        nr += dr;
        nc += dc;
      }
      if (xiangqiInBounds2(nr, nc)) {
        nr += dr;
        nc += dc;
        while (xiangqiInBounds2(nr, nc)) {
          if (!isXiangqiEmpty2(board, nr, nc)) {
            const target = board[nr][nc];
            if (!xiangqiSameColor2(piece, target)) {
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
    if (xiangqiInBounds2(nr, col)) {
      addMove(nr, col);
    }
    if (hasCrossedRiver2(row, color)) {
      if (col > 0) addMove(row, col - 1);
      if (col < COLS2 - 1) addMove(row, col + 1);
    }
  }
}
function applyXiangqiMove2(board, from, to) {
  if (!xiangqiInBounds2(from[0], from[1]) || !xiangqiInBounds2(to[0], to[1]) || !board[from[0]]?.[from[1]]) {
    return { board: cloneXiangqiBoard2(board), captured: "" };
  }
  const newBoard = cloneXiangqiBoard2(board);
  const [fr, fc] = from;
  const [tr, tc] = to;
  const captured = newBoard[tr][tc];
  newBoard[tr][tc] = newBoard[fr][fc];
  newBoard[fr][fc] = "";
  return { board: newBoard, captured };
}
function findXiangqiKing2(board, color) {
  const kingChar = color === "r" ? "K" : "k";
  for (let r = 0; r < ROWS2; r++) {
    for (let c = 0; c < COLS2; c++) {
      if (board[r][c] === kingChar) return [r, c];
    }
  }
  return null;
}
function isFlyingGeneral2(board, _color) {
  const redKing = findXiangqiKing2(board, "r");
  const blackKing = findXiangqiKing2(board, "b");
  if (!redKing || !blackKing) return false;
  if (redKing[1] !== blackKing[1]) return false;
  const col = redKing[1];
  const minRow = Math.min(redKing[0], blackKing[0]);
  const maxRow = Math.max(redKing[0], blackKing[0]);
  for (let r = minRow + 1; r < maxRow; r++) {
    if (!isXiangqiEmpty2(board, r, col)) return false;
  }
  return true;
}
function isXiangqiInCheck2(board, color) {
  if (isFlyingGeneral2(board, color)) return true;
  const kingPos = findXiangqiKing2(board, color);
  if (!kingPos) return false;
  const enemyColor = color === "r" ? "b" : "r";
  for (let r = 0; r < ROWS2; r++) {
    for (let c = 0; c < COLS2; c++) {
      const p = board[r][c];
      if (!p || xiangqiPieceColor2(p) !== enemyColor) continue;
      const moves = getXiangqiPieceMoves2(board, r, c);
      for (const m of moves) {
        if (m.to[0] === kingPos[0] && m.to[1] === kingPos[1]) {
          return true;
        }
      }
    }
  }
  return false;
}
function getAllXiangqiLegalMoves2(board, color) {
  const legal = [];
  for (let r = 0; r < ROWS2; r++) {
    for (let c = 0; c < COLS2; c++) {
      const p = board[r][c];
      if (!p || xiangqiPieceColor2(p) !== color) continue;
      const moves = getXiangqiPieceMoves2(board, r, c);
      for (const m of moves) {
        const { board: newBoard } = applyXiangqiMove2(board, [r, c], m.to);
        if (!isXiangqiInCheck2(newBoard, color)) {
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
function isXiangqiCheckmate2(board, color) {
  if (!findXiangqiKing2(board, color)) return false;
  if (!isXiangqiInCheck2(board, color)) return false;
  return getAllXiangqiLegalMoves2(board, color).length === 0;
}
function isXiangqiStalemate2(board, color) {
  if (!findXiangqiKing2(board, color)) return false;
  if (isXiangqiInCheck2(board, color)) return false;
  return getAllXiangqiLegalMoves2(board, color).length === 0;
}
function getXiangqiGameStatus2(board, turn) {
  if (isXiangqiCheckmate2(board, turn)) return "checkmate";
  if (isXiangqiStalemate2(board, turn)) return "stalemate";
  if (isXiangqiInCheck2(board, turn)) return "check";
  return "playing";
}
function getXiangqiGameStatusAdvanced2(board, turn, moves) {
  const base = getXiangqiGameStatus2(board, turn);
  if (base === "checkmate" || base === "stalemate") return base;
  const key = boardKey2(board);
  let count = 0;
  let b = cloneXiangqiBoard2(XIANGQI_INITIAL_BOARD2);
  const snapshotKeys = [boardKey2(b)];
  try {
    for (const m of moves) {
      if (!xiangqiInBounds2(m.from[0], m.from[1]) || !xiangqiInBounds2(m.to[0], m.to[1]) || !b[m.from[0]]?.[m.from[1]]) {
        snapshotKeys.length = 0;
        break;
      }
      const applied = applyXiangqiMove2(b, m.from, m.to);
      b = applied.board;
      snapshotKeys.push(boardKey2(b));
    }
  } catch {
    snapshotKeys.length = 0;
  }
  const replayKey = snapshotKeys[snapshotKeys.length - 1] || "";
  if (replayKey === key) {
    for (const k of snapshotKeys) {
      if (k === key) count++;
    }
    if (count >= 3) return "draw";
  } else {
    if (moves.length > 0) {
      console.warn("[xiangqi] \u5C40\u9762\u91CD\u653E\u4E0E\u5F53\u524D\u68CB\u76D8\u4E0D\u4E00\u81F4\uFF0C\u8DF3\u8FC7\u91CD\u590D\u5C40\u9762\u5224\u5B9A");
    }
  }
  const limit = 120;
  if (moves.length >= limit) {
    const recent = moves.slice(-limit);
    const hasProgress = recent.some(
      (m) => m.captured || m.piece === "P" || m.piece === "p"
    );
    if (!hasProgress) return "draw";
  }
  return base;
}
function boardKey2(board) {
  return board.map((row) => row.map((c) => c || ".").join("")).join("/");
}
function isXiangqiMoveLegal(board, from, to, color) {
  const legalMoves = getAllXiangqiLegalMoves2(board, color);
  return legalMoves.some(
    (m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]
  );
}
function getOpeningMove(ply, color, board) {
  if (ply >= 8) return null;
  if (ply === 0 && color === "r") {
    const pick = RED_OPENINGS[Math.random() * RED_OPENINGS.length | 0];
    return pick ? [pick.from, pick.to] : null;
  }
  if (ply === 1 && color === "b") {
    const pick = BLACK_RESPONSES[Math.random() * BLACK_RESPONSES.length | 0];
    return pick ? [pick.from, pick.to] : null;
  }
  const entries = OPENING_BOOK.filter((e) => e.ply === ply && e.color === color);
  const alt = OPENING_BOOK_ALTERNATE.filter((e) => e.ply === ply && e.color === color);
  const candidates = entries.length ? entries : alt;
  if (!candidates.length) return null;
  const [fr, fc] = candidates[0].from;
  const [tr, tc] = candidates[0].to;
  if (!board[fr] || !board[fr][fc]) return null;
  const piece = board[fr][fc];
  const isRedPiece = piece === piece.toUpperCase();
  if (color === "r" !== isRedPiece) return null;
  if (!board[tr] || board[tr][tc] === void 0) return null;
  return candidates[0].from && candidates[0].to ? [candidates[0].from, candidates[0].to] : null;
}
function setLearnedBias(bias) {
  learnedBias = bias;
}
function getPST(piece, row, col) {
  const type = piece.toLowerCase();
  const red = piece === piece.toUpperCase();
  const r = red ? row : 9 - row;
  const c = red ? col : 8 - col;
  switch (type) {
    case TYPE.PAWN:
      return PAWN_PST_RED[r][c] - 100;
    case TYPE.HORSE:
      return HORSE_PST_RED[r][c] - 100;
    case TYPE.ROOK:
      return ROOK_PST_RED[r][c] - 200;
    case TYPE.CANNON:
      return CANNON_PST_RED[r][c] - 100;
    default:
      return 0;
  }
}
function mulberry32(seed) {
  return function() {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pieceZobristIndex(p) {
  if (!p) return -1;
  const typeMap = { k: 0, a: 1, b: 2, n: 3, r: 4, c: 5, p: 6 };
  const t = p.toLowerCase();
  const idx = typeMap[t];
  if (idx === void 0) return -1;
  return isRed(p) ? idx : idx + 7;
}
function computeHash(b, color) {
  let h = 0;
  for (let i = 0; i < b.length; i++) {
    const pi = pieceZobristIndex(b[i]);
    if (pi >= 0) h ^= ZOBRIST[pi][i];
  }
  if (color === "b") h ^= ZOBRIST_SIDE[1];
  return h;
}
function ttStore(hash, score, depth, flag, bestFrom, bestTo) {
  const idx = hash & TT_SIZE - 1;
  const existing = transTable[idx];
  if (!existing || depth >= existing.depth) {
    transTable[idx] = { hash, score, depth, flag, bestFrom, bestTo };
  }
}
function ttProbe(hash) {
  const entry = transTable[hash & TT_SIZE - 1];
  if (entry && entry.hash === hash) return entry;
  return null;
}
function historyIndex(from, to) {
  return from * COLS22 * ROWS22 + to;
}
function toFlat(board) {
  const f = new Array(COLS22 * ROWS22).fill("");
  for (let y = 0; y < ROWS22; y++) for (let x = 0; x < COLS22; x++) f[y * COLS22 + x] = board[y][x];
  return f;
}
function pseudoMoves(b, idx) {
  const p = b[idx];
  if (!p) return [];
  const x = idx % COLS22, y = idx / COLS22 | 0;
  const c = isRed(p) ? "r" : "b";
  const type = p.toLowerCase();
  const out = [];
  const add = (nx, ny) => {
    if (!inBoard(nx, ny)) return false;
    const q = b[ny * COLS22 + nx];
    if (q && isRed(q) === isRed(p)) return false;
    out.push(ny * COLS22 + nx);
    return !q;
  };
  const addIf = (nx, ny, cond) => {
    if (!inBoard(nx, ny) || !cond()) return;
    const q = b[ny * COLS22 + nx];
    if (q && isRed(q) === isRed(p)) return;
    out.push(ny * COLS22 + nx);
  };
  switch (type) {
    case TYPE.GENERAL:
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy;
        if (inPalace22(nx, ny, c)) add(nx, ny);
      }
      break;
    case TYPE.ADVISOR:
      for (const [dx, dy] of ADV_MV) {
        const nx = x + dx, ny = y + dy;
        if (inPalace22(nx, ny, c)) add(nx, ny);
      }
      break;
    case TYPE.ELEPHANT:
      for (const [dx, dy] of ELE_MV) {
        const nx = x + dx, ny = y + dy, ex = x + dx / 2, ey = y + dy / 2;
        addIf(nx, ny, () => ownHalf(ny, c) && !b[ey * COLS22 + ex]);
      }
      break;
    case TYPE.HORSE:
      for (const [dx, dy] of HORSE_MV) {
        const leg = HORSE_LEG["[" + dx + "," + dy + "]"];
        const nx = x + dx, ny = y + dy, lx = x + leg[0], ly = y + leg[1];
        addIf(nx, ny, () => !b[ly * COLS22 + lx]);
      }
      break;
    case TYPE.ROOK:
      for (const [dx, dy] of DIR4) {
        let nx = x + dx, ny = y + dy;
        while (inBoard(nx, ny)) {
          if (!b[ny * COLS22 + nx]) add(nx, ny);
          else {
            if (isRed(b[ny * COLS22 + nx]) !== isRed(p)) add(nx, ny);
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    case TYPE.CANNON:
      for (const [dx, dy] of DIR4) {
        let nx = x + dx, ny = y + dy, screen = 0;
        while (inBoard(nx, ny)) {
          const q = b[ny * COLS22 + nx];
          if (!q) {
            if (screen === 0) add(nx, ny);
          } else {
            screen++;
            if (screen === 2) {
              if (isRed(q) !== isRed(p)) add(nx, ny);
              break;
            }
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    case TYPE.PAWN: {
      const fy = c === "r" ? y - 1 : y + 1;
      if (inBoard(x, fy)) add(x, fy);
      if (crossed(y, c)) {
        if (inBoard(x - 1, y)) add(x - 1, y);
        if (inBoard(x + 1, y)) add(x + 1, y);
      }
      break;
    }
  }
  return out;
}
function isAttacked(b, x, y, color) {
  for (const [dx, dy] of DIR4) {
    let nx = x + dx, ny = y + dy, screen = 0;
    while (inBoard(nx, ny)) {
      const q = b[ny * COLS22 + nx];
      if (q) {
        if (isRed(q) === (color === "r")) {
          if (screen === 0) {
            if (q.toLowerCase() === TYPE.ROOK) return true;
            if (q.toLowerCase() === TYPE.GENERAL && dx === 0) return true;
          }
          if (q.toLowerCase() === TYPE.CANNON && screen === 1) return true;
        }
        screen++;
        if (screen >= 2) break;
      }
      nx += dx;
      ny += dy;
    }
  }
  for (const [dx, dy] of HORSE_MV) {
    const px = x + dx, py = y + dy;
    if (inBoard(px, py) && b[py * COLS22 + px] && isRed(b[py * COLS22 + px]) === (color === "r") && b[py * COLS22 + px].toLowerCase() === TYPE.HORSE) {
      const lx = Math.abs(dx) === 2 ? x + dx / 2 : x + dx;
      const ly = Math.abs(dy) === 2 ? y + dy / 2 : y + dy;
      if (!b[ly * COLS22 + lx]) return true;
    }
  }
  const redPawn = (px, py) => b[py * COLS22 + px] && b[py * COLS22 + px] === "P";
  const blkPawn = (px, py) => b[py * COLS22 + px] && b[py * COLS22 + px] === "p";
  if (inBoard(x, y + 1) && redPawn(x, y + 1)) return true;
  if (y <= 4) {
    if (inBoard(x - 1, y) && redPawn(x - 1, y)) return true;
    if (inBoard(x + 1, y) && redPawn(x + 1, y)) return true;
  }
  if (inBoard(x, y - 1) && blkPawn(x, y - 1)) return true;
  if (y >= 5) {
    if (inBoard(x - 1, y) && blkPawn(x - 1, y)) return true;
    if (inBoard(x + 1, y) && blkPawn(x + 1, y)) return true;
  }
  return false;
}
function findGeneral(b, c) {
  const ch = c === "r" ? "K" : "k";
  for (let i = 0; i < b.length; i++) if (b[i] === ch) return i;
  return -1;
}
function isEndgame(b) {
  let main = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const t = p.toLowerCase();
    if (t === "r" || t === "n" || t === "c") main += 2;
    else if (t === "p") {
      const y = i / COLS22 | 0;
      if (isRed(p) && y <= 4 || !isRed(p) && y >= 5) main += 1;
    }
  }
  return main <= 6;
}
function evaluate(b, c, withMobility = true) {
  let material = 0;
  let positional = 0;
  let mobility = 0;
  let safety = 0;
  const endgame = isEndgame(b);
  const zCross = {};
  const zHome = {};
  if (learnedBias) {
    for (const k in learnedBias) {
      if (k.startsWith("z_")) {
        const parts = k.split("_");
        if (parts.length === 3) {
          const type = parts[1];
          const zone = parts[2];
          if (zone === "cross") zCross[type] = learnedBias[k] || 0;
          else if (zone === "home") zHome[type] = learnedBias[k] || 0;
        }
      }
    }
  }
  let myAdvisors = 0, myElephants = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const x = i % COLS22, y = i / COLS22 | 0;
    const mine = isRed(p) === (c === "r");
    const t = p.toLowerCase();
    let baseVal = PIECE_VALUE[p] || 0;
    if (learnedBias) baseVal += learnedBias[t] || 0;
    if (endgame) {
      if (t === "n") baseVal += 30;
      else if (t === "c") baseVal -= 25;
      else if (t === "p") baseVal += 25;
    }
    const pstVal = getPST(p, y, x);
    material += mine ? baseVal : -baseVal;
    positional += mine ? pstVal : -pstVal;
    if (mine) {
      const zoneBonus = crossed(y, c) ? zCross[t] || 0 : zHome[t] || 0;
      positional += zoneBonus;
      if (t === "a") myAdvisors += 1;
      else if (t === "b") myElephants += 1;
    }
  }
  const king = findGeneral(b, c);
  if (king >= 0) {
    const kx = king % COLS22, ky = king / COLS22 | 0;
    if (kx === 4 && (ky === 8 || ky === 1)) safety += 8;
  }
  safety += myAdvisors * 5 + myElephants * 5;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p || p.toLowerCase() !== "c" || isRed(p) !== (c === "r")) continue;
    const x = i % COLS22, y = i / COLS22 | 0;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (!inBoard(nx, ny)) continue;
      const np = b[ny * COLS22 + nx];
      if (np && isRed(np) === (c === "r")) {
        safety += 6;
        break;
      }
    }
  }
  if (withMobility) {
    let myMobility = 0;
    let aggression = 0;
    for (let i = 0; i < b.length; i++) {
      if (b[i] && isRed(b[i]) === (c === "r")) {
        const moves = pseudoMoves(b, i);
        myMobility += moves.length;
        for (const d of moves) {
          const q = b[d];
          if (!q || isRed(q) === (c === "r")) continue;
          const t = q.toLowerCase();
          if (t === "k") aggression += 90;
          else if (t === "r") aggression += 14;
          else if (t === "c" || t === "n") aggression += 7;
          else if (t === "p") aggression += 3;
        }
      }
    }
    mobility = myMobility * 2;
    safety += aggression;
  }
  return material + positional + mobility + safety;
}
function mvvLvaScore(piece, captured) {
  if (!captured) return -1e4 + (historyTable[historyIndex(0, 0)] || 0);
  const victim = PIECE_VALUE[captured] || 0;
  const attacker = PIECE_VALUE[piece] || 1;
  return victim * 100 - attacker;
}
function legalMovesOrdered(b, c, bestFrom, bestTo) {
  const pseudo = [];
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (p && isRed(p) === (c === "r")) {
      for (const d of pseudoMoves(b, i)) {
        const cap = b[d];
        let score = mvvLvaScore(p, cap);
        if (i === bestFrom && d === bestTo) score += 1e6;
        if (!cap) score += historyTable[historyIndex(i, d)] || 0;
        pseudo.push({ from: i, to: d, cap, score });
      }
    }
  }
  pseudo.sort((a, z) => z.score - a.score);
  const legal = [];
  for (const m of pseudo) {
    const cap = applyMove(b, m.from, m.to);
    if (!isInCheck(b, c)) legal.push(m);
    undoMove(b, m.from, m.to, cap);
  }
  return legal;
}
function captureMovesOrdered(b, c, bestFrom, bestTo) {
  const caps = [];
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (p && isRed(p) === (c === "r")) {
      for (const d of pseudoMoves(b, i)) {
        const cap = b[d];
        if (!cap) continue;
        let score = mvvLvaScore(p, cap);
        if (i === bestFrom && d === bestTo) score += 1e6;
        caps.push({ from: i, to: d, cap, score });
      }
    }
  }
  caps.sort((a, z) => z.score - a.score);
  const legal = [];
  for (const m of caps) {
    const cap = applyMove(b, m.from, m.to);
    if (!isInCheck(b, c)) legal.push(m);
    undoMove(b, m.from, m.to, cap);
  }
  return legal;
}
function quiescence(b, c, alpha, beta, ply, hash, qDepth = 0) {
  checkTimeout();
  const qtt = ttProbe(hash);
  if (qtt && qtt.depth === 0 && qtt.flag === TT_EXACT) return qtt.score;
  if (qDepth >= 4) return evaluate(b, c, false);
  const stand = evaluate(b, c, false);
  if (stand >= beta) {
    ttStore(hash, stand, 0, TT_BETA, -1, -1);
    return beta;
  }
  if (stand > alpha) alpha = stand;
  const inCheck = isInCheck(b, c);
  const moves = inCheck ? legalMovesOrdered(b, c, -1, -1) : captureMovesOrdered(b, c, -1, -1);
  if (moves.length === 0) {
    return inCheck ? -(MATE - ply) : stand;
  }
  let best = stand;
  for (const m of moves) {
    if (!inCheck) {
      const gain = (PIECE_VALUE[m.cap] || 0) + 50;
      if (stand + gain < alpha) continue;
    }
    const cap = applyMove(b, m.from, m.to);
    const pi = pieceZobristIndex(b[m.to]);
    const capPi = cap ? pieceZobristIndex(cap) : -1;
    let newHash = hash;
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.to];
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.from];
    if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to];
    newHash ^= ZOBRIST_SIDE[0];
    let score;
    try {
      score = -quiescence(b, opp(c), -beta, -alpha, ply + 1, newHash, qDepth + 1);
    } catch (e) {
      undoMove(b, m.from, m.to, cap);
      throw e;
    }
    undoMove(b, m.from, m.to, cap);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  const qFlag = best <= stand ? TT_ALPHA : TT_EXACT;
  ttStore(hash, best, 0, qFlag, -1, -1);
  return best;
}
function checkTimeout() {
  nodeCount++;
  if ((nodeCount & 1023) === 0 && Date.now() > deadline) {
    throw { timeout: true };
  }
}
function negamax(b, c, depth, alpha, beta, ply, allowNull, hash) {
  checkTimeout();
  const ttEntry = ttProbe(hash);
  let ttBestFrom = -1, ttBestTo = -1;
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_EXACT) return ttEntry.score;
    if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return ttEntry.score;
    if (ttEntry.flag === TT_BETA && ttEntry.score >= beta) return ttEntry.score;
  }
  if (ttEntry) {
    ttBestFrom = ttEntry.bestFrom;
    ttBestTo = ttEntry.bestTo;
  }
  if (depth <= 0) {
    return quiescence(b, c, alpha, beta, ply, hash);
  }
  const hasNullPotential = (() => {
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p.toLowerCase();
      if (t === "r" || t === "n" || t === "c") return true;
      if (t === "p") {
        const y = i / COLS22 | 0;
        if (isRed(p) && y <= 4 || !isRed(p) && y >= 5) return true;
      }
    }
    return false;
  })();
  if (allowNull && depth >= 3 && !isInCheck(b, c) && hasNullPotential) {
    const nullHash = hash ^ ZOBRIST_SIDE[0];
    const R = 2;
    const score = -negamax(b, opp(c), depth - 1 - R, -beta, -beta + 1, ply + 1, false, nullHash);
    if (score >= beta) {
      return beta;
    }
  }
  const moves = legalMovesOrdered(b, c, ttBestFrom, ttBestTo);
  if (moves.length === 0) {
    return -(MATE - ply);
  }
  let bestScore = -INF;
  let bestFrom = moves[0].from;
  let bestTo = moves[0].to;
  let originalAlpha = alpha;
  for (let idx = 0; idx < moves.length; idx++) {
    const m = moves[idx];
    const cap = applyMove(b, m.from, m.to);
    const pi = pieceZobristIndex(b[m.to]);
    const capPi = cap ? pieceZobristIndex(cap) : -1;
    let newHash = hash;
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.to];
    if (pi >= 0) newHash ^= ZOBRIST[pi][m.from];
    if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to];
    newHash ^= ZOBRIST_SIDE[0];
    const givesCheck = isInCheck(b, opp(c));
    const extension = givesCheck && depth >= 4 ? 1 : 0;
    const isTtBest = m.from === ttBestFrom && m.to === ttBestTo;
    let searchDepth = depth - 1 + extension;
    let reduced = false;
    if (depth >= 3 && !m.cap && !isTtBest && !givesCheck && idx >= 3) {
      searchDepth = depth - 2 + extension;
      reduced = true;
    }
    let score;
    try {
      if (idx === 0) {
        score = -negamax(b, opp(c), searchDepth, -beta, -alpha, ply + 1, true, newHash);
      } else {
        score = -negamax(b, opp(c), searchDepth, -alpha - 1, -alpha, ply + 1, true, newHash);
        if (score > alpha) {
          if (reduced) {
            score = -negamax(b, opp(c), depth - 1 + extension, -beta, -alpha, ply + 1, true, newHash);
          } else if (score < beta) {
            score = -negamax(b, opp(c), searchDepth, -beta, -alpha, ply + 1, true, newHash);
          }
        }
      }
    } catch (e) {
      undoMove(b, m.from, m.to, cap);
      throw e;
    }
    undoMove(b, m.from, m.to, cap);
    if (score > bestScore) {
      bestScore = score;
      bestFrom = m.from;
      bestTo = m.to;
    }
    if (bestScore > alpha) alpha = bestScore;
    if (alpha >= beta) {
      if (!m.cap) {
        historyTable[historyIndex(m.from, m.to)] += depth * depth * (givesCheck ? 2 : 1);
      }
      break;
    }
  }
  let flag = TT_EXACT;
  if (bestScore <= originalAlpha) flag = TT_ALPHA;
  else if (bestScore >= beta) flag = TT_BETA;
  ttStore(hash, bestScore, depth, flag, bestFrom, bestTo);
  return bestScore;
}
function xiangqiBestMove(board, color, difficulty = "medium", weights, ply) {
  if (weights) learnedBias = weights;
  if (ply != null && ply < 8) {
    const book = getOpeningMove(ply, color, board);
    if (book && isXiangqiMoveLegal(board, book[0], book[1], color)) {
      return book;
    }
  }
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  deadline = Date.now() + cfg.timeMs;
  nodeCount = 0;
  transTable = new Array(TT_SIZE);
  for (let i = 0; i < historyTable.length; i++) historyTable[i] = Math.floor(historyTable[i] / 2);
  const b = toFlat(board);
  const c = color;
  const initialHash = computeHash(b, c);
  const firstMoves = legalMovesOrdered(b, c, -1, -1);
  if (firstMoves.length === 0) return null;
  let best = null;
  let bestScore = -INF;
  const begin = Date.now();
  let scoredLevel = [];
  let prevScore = 0;
  for (let d = 1; d <= cfg.depth; d++) {
    let curBest = null;
    let curScore = -INF;
    let alpha = -INF, beta = INF, timedOut = false;
    let aspiration = false;
    if (d >= 3 && Math.abs(prevScore) < MATE * 0.5) {
      const delta = 60;
      alpha = prevScore - delta;
      beta = prevScore + delta;
      aspiration = true;
    }
    const moves = legalMovesOrdered(
      b,
      c,
      best ? best.from : -1,
      best ? best.to : -1
    );
    for (const m of moves) {
      const cap = applyMove(b, m.from, m.to);
      const pi = pieceZobristIndex(b[m.to]);
      const capPi = cap ? pieceZobristIndex(cap) : -1;
      let newHash = initialHash;
      if (pi >= 0) newHash ^= ZOBRIST[pi][m.to];
      if (pi >= 0) newHash ^= ZOBRIST[pi][m.from];
      if (capPi >= 0) newHash ^= ZOBRIST[capPi][m.to];
      newHash ^= ZOBRIST_SIDE[0];
      let score;
      try {
        score = -negamax(b, opp(c), d - 1, -beta, -alpha, 1, true, newHash);
        if (aspiration && (score <= alpha || score >= beta)) {
          score = -negamax(b, opp(c), d - 1, -INF, INF, 1, true, newHash);
        }
      } catch {
        timedOut = true;
        undoMove(b, m.from, m.to, cap);
        break;
      }
      undoMove(b, m.from, m.to, cap);
      if (score > curScore) {
        curScore = score;
        curBest = { from: m.from, to: m.to };
      }
      if (curScore > alpha) alpha = curScore;
      scoredLevel.push({ from: m.from, to: m.to, score });
    }
    if (!timedOut && curBest) {
      best = curBest;
      bestScore = curScore;
      prevScore = curScore;
    } else {
      break;
    }
    if (Date.now() - begin > cfg.timeMs * 0.85) break;
  }
  if (!best) {
    best = { from: firstMoves[0].from, to: firstMoves[0].to };
  }
  if (cfg.noise > 0 && Math.abs(bestScore) < MATE * 0.5) {
    const count = Math.max(1, Math.min(firstMoves.length, 1 + Math.floor(cfg.noise / 5)));
    const top = firstMoves.slice(0, count);
    const pick = top[Math.random() * top.length | 0];
    best = { from: pick.from, to: pick.to };
  }
  if (cfg.variety > 0 && Math.abs(bestScore) < MATE * 0.5 && scoredLevel.length > 1) {
    const bestS = Math.max(...scoredLevel.map((x) => x.score));
    const window2 = cfg.variety;
    const candidates = scoredLevel.filter((x) => bestS - x.score <= window2);
    if (candidates.length > 1) {
      const weights2 = candidates.map((x) => Math.max(1, 10 - (bestS - x.score) * 0.16));
      const total = weights2.reduce((a, b2) => a + b2, 0);
      let r = Math.random() * total;
      for (let i = 0; i < candidates.length; i++) {
        r -= weights2[i];
        if (r <= 0) {
          best = { from: candidates[i].from, to: candidates[i].to };
          bestScore = candidates[i].score;
          break;
        }
      }
    }
  }
  return [
    [best.from / COLS22 | 0, best.from % COLS22],
    [best.to / COLS22 | 0, best.to % COLS22]
  ];
}
function selfplay(games, depth) {
  const st2 = Date.now();
  let red = 0, black = 0, draw2 = 0, illegal2 = 0;
  for (let g = 0; g < games; g++) {
    let b = cloneXiangqiBoard2(XIANGQI_INITIAL_BOARD2);
    let t = "r";
    for (let step = 0; step < 160; step++) {
      const m = xiangqiBestMove(b, t, depth, null, 6);
      if (!m) break;
      const from = m[0], to = m[1];
      if (!getAllXiangqiLegalMoves2(b, t).some((x) => x.from[0] === from[0] && x.from[1] === from[1] && x.to[0] === to[0] && x.to[1] === to[1])) {
        illegal2++;
        break;
      }
      b = applyXiangqiMove2(b, from, to).board;
      const s = getXiangqiGameStatusAdvanced2(b, t === "r" ? "b" : "r", [{ from, to }]);
      if (s === "checkmate" || s === "stalemate") {
        if (t === "r") black++;
        else red++;
        break;
      }
      if (s === "draw") {
        draw2++;
        break;
      }
      t = t === "r" ? "b" : "r";
    }
  }
  return { red, black, draw: draw2, ms: Date.now() - st2, illegal: illegal2 };
}
var ROWS2, COLS2, XIANGQI_INITIAL_BOARD2, OPENING_BOOK, OPENING_BOOK_ALTERNATE, RED_OPENINGS, BLACK_RESPONSES, COLS22, ROWS22, MATE, INF, TYPE, PIECE_VALUE, learnedBias, PAWN_PST_RED, HORSE_PST_RED, ROOK_PST_RED, CANNON_PST_RED, isRed, DIR4, HORSE_MV, HORSE_LEG, ELE_MV, ADV_MV, inBoard, inPalace22, ownHalf, crossed, opp, ZOBRIST, ZOBRIST_SIDE, TT_EXACT, TT_ALPHA, TT_BETA, TT_SIZE, transTable, historyTable, isInCheck, applyMove, undoMove, deadline, nodeCount, DIFFICULTY;
var init_tmp_vs_new = __esm({
  "tmp_vs_new.mjs"() {
    "use strict";
    ROWS2 = 10;
    COLS2 = 9;
    XIANGQI_INITIAL_BOARD2 = [
      ["r", "n", "b", "a", "k", "a", "b", "n", "r"],
      // row 0 黑方底线
      ["", "", "", "", "", "", "", "", ""],
      // row 1
      ["", "c", "", "", "", "", "", "c", ""],
      // row 2 炮
      ["p", "", "p", "", "p", "", "p", "", "p"],
      // row 3 卒
      ["", "", "", "", "", "", "", "", ""],
      // row 4 河岸(黑)
      ["", "", "", "", "", "", "", "", ""],
      // row 5 河岸(红)
      ["P", "", "P", "", "P", "", "P", "", "P"],
      // row 6 兵
      ["", "C", "", "", "", "", "", "C", ""],
      // row 7 炮
      ["", "", "", "", "", "", "", "", ""],
      // row 8
      ["R", "N", "B", "A", "K", "A", "B", "N", "R"]
      // row 9 红方底线
    ];
    OPENING_BOOK = [
      // 1. 红 炮二平五（中炮开局，控制中路）
      { ply: 0, color: "r", from: [7, 7], to: [7, 4], note: "\u4E2D\u70AE\u5F00\u5C40\uFF1A\u70AE\u9547\u4E2D\u8DEF" },
      // 2. 黑 马8进7（屏风马应中炮）
      { ply: 1, color: "b", from: [0, 1], to: [2, 2], note: "\u5C4F\u98CE\u9A6C\uFF1A\u9A6C8\u8FDB7" },
      // 3. 红 马二进三（跳正马保护中兵）
      { ply: 2, color: "r", from: [9, 7], to: [7, 6], note: "\u7EA2\u65B9\u8DF3\u9A6C" },
      // 4. 黑 马2进3（双马结成屏风）
      { ply: 3, color: "b", from: [0, 7], to: [2, 6], note: "\u9ED1\u65B9\u8DF3\u9A6C" },
      // 5. 红 车一平二（出直车，占领肋道）
      { ply: 4, color: "r", from: [9, 8], to: [7, 8], note: "\u7EA2\u65B9\u51FA\u8F66" },
      // 6. 黑 卒3进1（活通马腿）
      { ply: 5, color: "b", from: [3, 2], to: [4, 2], note: "\u9ED1\u53523\u8FDB1" },
      // 7. 红 车二进六（过河压马，形成中炮过河车）
      { ply: 6, color: "r", from: [7, 8], to: [1, 8], note: "\u4E2D\u70AE\u8FC7\u6CB3\u8F66" },
      // 8. 黑 象7进5（补象巩固中路）
      { ply: 7, color: "b", from: [0, 6], to: [1, 5], note: "\u9ED1\u65B9\u8865\u8C61" }
    ];
    OPENING_BOOK_ALTERNATE = [
      { ply: 1, color: "b", from: [2, 1], to: [2, 4], note: "\u987A\u70AE\uFF1A\u9ED1\u70AE2\u5E735" },
      { ply: 2, color: "r", from: [9, 7], to: [7, 6], note: "\u7EA2\u65B9\u8DF3\u9A6C" },
      { ply: 3, color: "b", from: [0, 7], to: [2, 6], note: "\u9ED1\u65B9\u8DF3\u9A6C" },
      { ply: 4, color: "r", from: [9, 8], to: [7, 8], note: "\u7EA2\u65B9\u51FA\u8F66" },
      { ply: 5, color: "b", from: [3, 7], to: [4, 7], note: "\u9ED1\u53527\u8FDB1" },
      { ply: 6, color: "r", from: [7, 8], to: [2, 8], note: "\u7EA2\u8F66\u8FC7\u6CB3" },
      { ply: 7, color: "b", from: [0, 6], to: [1, 5], note: "\u9ED1\u65B9\u8865\u8C61" }
    ];
    RED_OPENINGS = [
      { from: [7, 7], to: [7, 4], note: "\u4E2D\u70AE\u5F00\u5C40\uFF1A\u70AE\u9547\u4E2D\u8DEF" },
      { from: [6, 2], to: [5, 2], note: "\u4ED9\u4EBA\u6307\u8DEF\uFF1A\u5175\u4E09\u8FDB\u4E00" },
      { from: [9, 6], to: [7, 4], note: "\u98DE\u76F8\u5C40\uFF1A\u76F8\u4E09\u8FDB\u4E94" }
    ];
    BLACK_RESPONSES = [
      { from: [0, 1], to: [2, 2], note: "\u5C4F\u98CE\u9A6C\uFF1A\u9A6C8\u8FDB7" },
      { from: [2, 1], to: [2, 4], note: "\u987A\u70AE\uFF1A\u9ED1\u70AE2\u5E735" },
      { from: [0, 7], to: [2, 6], note: "\u53CD\u5BAB\u9A6C\uFF1A\u9A6C2\u8FDB3" }
    ];
    COLS22 = 9;
    ROWS22 = 10;
    MATE = 1e6;
    INF = 1e9;
    TYPE = {
      GENERAL: "k",
      ADVISOR: "a",
      ELEPHANT: "b",
      HORSE: "n",
      ROOK: "r",
      CANNON: "c",
      PAWN: "p"
    };
    PIECE_VALUE = {
      k: 1e4,
      a: 120,
      b: 120,
      n: 350,
      r: 900,
      c: 450,
      p: 100,
      K: 1e4,
      A: 120,
      B: 120,
      N: 350,
      R: 900,
      C: 450,
      P: 100
    };
    learnedBias = null;
    PAWN_PST_RED = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      // row 0 黑方底线
      [90, 90, 90, 96, 90, 96, 90, 90, 90],
      // row 1
      [90, 96, 103, 97, 94, 97, 103, 96, 90],
      // row 2
      [90, 96, 99, 104, 108, 104, 99, 96, 90],
      // row 3
      [90, 96, 99, 104, 108, 104, 99, 96, 90],
      // row 4 河岸
      [60, 60, 65, 72, 72, 72, 65, 60, 60],
      // row 5 红岸
      [20, 0, 20, 0, 20, 0, 20, 0, 20],
      // row 6 初始兵位
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      // row 7
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      // row 8
      [0, 0, 0, 0, 0, 0, 0, 0, 0]
      // row 9 红方底线
    ];
    HORSE_PST_RED = [
      [90, 90, 90, 96, 90, 96, 90, 90, 90],
      [90, 96, 103, 97, 94, 97, 103, 96, 90],
      [92, 98, 99, 103, 99, 103, 99, 98, 92],
      [93, 108, 100, 107, 100, 107, 100, 108, 93],
      [90, 100, 99, 103, 104, 103, 99, 100, 90],
      [90, 98, 101, 102, 103, 102, 101, 98, 90],
      [92, 94, 98, 95, 98, 95, 98, 94, 92],
      [93, 92, 94, 95, 92, 95, 94, 92, 93],
      [85, 90, 92, 93, 78, 93, 92, 90, 85],
      [88, 85, 90, 88, 90, 88, 90, 85, 88]
    ];
    ROOK_PST_RED = [
      [206, 208, 207, 213, 214, 213, 207, 208, 206],
      [206, 212, 209, 216, 233, 216, 209, 212, 206],
      [206, 208, 207, 214, 216, 214, 207, 208, 206],
      [206, 213, 213, 216, 216, 216, 213, 213, 206],
      [206, 211, 211, 214, 215, 214, 211, 211, 206],
      [206, 212, 212, 214, 215, 214, 212, 212, 206],
      [204, 209, 204, 212, 214, 212, 204, 209, 204],
      [198, 208, 204, 212, 212, 212, 204, 208, 198],
      [200, 208, 206, 212, 200, 212, 206, 208, 200],
      [194, 206, 204, 212, 200, 212, 204, 206, 194]
    ];
    CANNON_PST_RED = [
      [100, 100, 96, 91, 90, 91, 96, 100, 100],
      [98, 98, 96, 92, 89, 92, 96, 98, 98],
      [97, 97, 96, 91, 92, 91, 96, 97, 97],
      [96, 99, 99, 98, 100, 98, 99, 99, 96],
      [96, 96, 96, 96, 100, 96, 96, 96, 96],
      [95, 96, 99, 96, 100, 96, 99, 96, 95],
      [96, 96, 96, 96, 96, 96, 96, 96, 96],
      [97, 96, 100, 99, 101, 99, 100, 96, 97],
      [96, 97, 98, 98, 98, 98, 98, 97, 96],
      [96, 96, 97, 99, 99, 99, 97, 96, 96]
    ];
    isRed = (p) => p !== "" && p === p.toUpperCase();
    DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    HORSE_MV = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    HORSE_LEG = {
      "[-2,-1]": [-1, 0],
      "[-2,1]": [-1, 0],
      "[-1,-2]": [0, -1],
      "[-1,2]": [0, 1],
      "[1,-2]": [0, -1],
      "[1,2]": [0, 1],
      "[2,-1]": [1, 0],
      "[2,1]": [1, 0]
    };
    ELE_MV = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
    ADV_MV = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    inBoard = (x, y) => x >= 0 && x < COLS22 && y >= 0 && y < ROWS22;
    inPalace22 = (x, y, color) => x >= 3 && x <= 5 && (color === "r" ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
    ownHalf = (y, color) => color === "r" ? y >= 5 : y <= 4;
    crossed = (y, color) => color === "r" ? y <= 4 : y >= 5;
    opp = (c) => c === "r" ? "b" : "r";
    ZOBRIST = [];
    ZOBRIST_SIDE = [0, 0];
    (function initZobrist() {
      const rand = mulberry32(123456789);
      const pieceTypes = 14;
      for (let i = 0; i < pieceTypes; i++) {
        ZOBRIST[i] = [];
        for (let j = 0; j < COLS22 * ROWS22; j++) {
          ZOBRIST[i][j] = Math.floor(rand() * 2147483647);
        }
      }
      ZOBRIST_SIDE[0] = Math.floor(rand() * 2147483647);
      ZOBRIST_SIDE[1] = ZOBRIST_SIDE[0];
    })();
    TT_EXACT = 0;
    TT_ALPHA = 1;
    TT_BETA = 2;
    TT_SIZE = 1 << 17;
    transTable = new Array(TT_SIZE);
    historyTable = new Array(COLS22 * ROWS22 * COLS22 * ROWS22).fill(0);
    isInCheck = (b, c) => {
      const g = findGeneral(b, c);
      return g >= 0 ? isAttacked(b, g % COLS22, g / COLS22 | 0, opp(c)) : false;
    };
    applyMove = (b, from, to) => {
      const cap = b[to];
      b[to] = b[from];
      b[from] = "";
      return cap;
    };
    undoMove = (b, from, to, cap) => {
      b[from] = b[to];
      b[to] = cap;
    };
    deadline = 0;
    nodeCount = 0;
    DIFFICULTY = {
      easy: { depth: 2, timeMs: 400, noise: 30, variety: 70 },
      medium: { depth: 4, timeMs: 1e3, noise: 8, variety: 30 },
      hard: { depth: 6, timeMs: 2500, noise: 0, variety: 14 },
      master: { depth: 9, timeMs: 5e3, noise: 0, variety: 9 }
    };
    setLearnedBias(null);
    console.log("NEW-ready");
  }
});

// tmp_vs_old.mjs
var tmp_vs_old_exports = {};
__export(tmp_vs_old_exports, {
  selfplay: () => selfplay2,
  xiangqiBestMove: () => xiangqiBestMove2
});
function cloneXiangqiBoard3(board) {
  return board.map((row) => [...row]);
}
function isXiangqiRed3(piece) {
  return piece !== "" && piece === piece.toUpperCase();
}
function isXiangqiEmpty3(board, row, col) {
  return board[row]?.[col] === "";
}
function xiangqiInBounds3(row, col) {
  return row >= 0 && row < ROWS3 && col >= 0 && col < COLS3;
}
function xiangqiSameColor3(p1, p2) {
  if (!p1 || !p2) return false;
  return isXiangqiRed3(p1) === isXiangqiRed3(p2);
}
function xiangqiPieceColor3(piece) {
  if (!piece) return null;
  return isXiangqiRed3(piece) ? "r" : "b";
}
function inPalace3(row, col, color) {
  if (col < 3 || col > 5) return false;
  if (color === "r") {
    return row >= 7 && row <= 9;
  } else {
    return row >= 0 && row <= 2;
  }
}
function hasCrossedRiver3(row, color) {
  if (color === "r") {
    return row <= 4;
  } else {
    return row >= 5;
  }
}
function getXiangqiPieceMoves3(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const color = isXiangqiRed3(piece) ? "r" : "b";
  const type = piece.toLowerCase();
  const moves = [];
  const addMove = (r, c) => {
    if (!xiangqiInBounds3(r, c)) return false;
    const target = board[r][c];
    if (target && xiangqiSameColor3(piece, target)) return false;
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
      if (inPalace3(nr, nc, color)) {
        addMove(nr, nc);
      }
    }
  }
  function advisorMoves() {
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (inPalace3(nr, nc, color)) {
        addMove(nr, nc);
      }
    }
  }
  function elephantMoves() {
    const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (!xiangqiInBounds3(nr, nc)) continue;
      if (color === "r" && nr < 5) continue;
      if (color === "b" && nr > 4) continue;
      const er = row + dr / 2;
      const ec = col + dc / 2;
      if (!isXiangqiEmpty3(board, er, ec)) continue;
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
      if (!xiangqiInBounds3(nr, nc)) continue;
      const lr = row + br;
      const lc = col + bc;
      if (!isXiangqiEmpty3(board, lr, lc)) continue;
      addMove(nr, nc);
    }
  }
  function chariotMoves() {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr;
      let nc = col + dc;
      while (xiangqiInBounds3(nr, nc)) {
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
      while (xiangqiInBounds3(nr, nc) && isXiangqiEmpty3(board, nr, nc)) {
        addMove(nr, nc);
        nr += dr;
        nc += dc;
      }
      if (xiangqiInBounds3(nr, nc)) {
        nr += dr;
        nc += dc;
        while (xiangqiInBounds3(nr, nc)) {
          if (!isXiangqiEmpty3(board, nr, nc)) {
            const target = board[nr][nc];
            if (!xiangqiSameColor3(piece, target)) {
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
    if (xiangqiInBounds3(nr, col)) {
      addMove(nr, col);
    }
    if (hasCrossedRiver3(row, color)) {
      if (col > 0) addMove(row, col - 1);
      if (col < COLS3 - 1) addMove(row, col + 1);
    }
  }
}
function applyXiangqiMove3(board, from, to) {
  if (!xiangqiInBounds3(from[0], from[1]) || !xiangqiInBounds3(to[0], to[1]) || !board[from[0]]?.[from[1]]) {
    return { board: cloneXiangqiBoard3(board), captured: "" };
  }
  const newBoard = cloneXiangqiBoard3(board);
  const [fr, fc] = from;
  const [tr, tc] = to;
  const captured = newBoard[tr][tc];
  newBoard[tr][tc] = newBoard[fr][fc];
  newBoard[fr][fc] = "";
  return { board: newBoard, captured };
}
function findXiangqiKing3(board, color) {
  const kingChar = color === "r" ? "K" : "k";
  for (let r = 0; r < ROWS3; r++) {
    for (let c = 0; c < COLS3; c++) {
      if (board[r][c] === kingChar) return [r, c];
    }
  }
  return null;
}
function isFlyingGeneral3(board, _color) {
  const redKing = findXiangqiKing3(board, "r");
  const blackKing = findXiangqiKing3(board, "b");
  if (!redKing || !blackKing) return false;
  if (redKing[1] !== blackKing[1]) return false;
  const col = redKing[1];
  const minRow = Math.min(redKing[0], blackKing[0]);
  const maxRow = Math.max(redKing[0], blackKing[0]);
  for (let r = minRow + 1; r < maxRow; r++) {
    if (!isXiangqiEmpty3(board, r, col)) return false;
  }
  return true;
}
function isXiangqiInCheck3(board, color) {
  if (isFlyingGeneral3(board, color)) return true;
  const kingPos = findXiangqiKing3(board, color);
  if (!kingPos) return false;
  const enemyColor = color === "r" ? "b" : "r";
  for (let r = 0; r < ROWS3; r++) {
    for (let c = 0; c < COLS3; c++) {
      const p = board[r][c];
      if (!p || xiangqiPieceColor3(p) !== enemyColor) continue;
      const moves = getXiangqiPieceMoves3(board, r, c);
      for (const m of moves) {
        if (m.to[0] === kingPos[0] && m.to[1] === kingPos[1]) {
          return true;
        }
      }
    }
  }
  return false;
}
function getAllXiangqiLegalMoves3(board, color) {
  const legal = [];
  for (let r = 0; r < ROWS3; r++) {
    for (let c = 0; c < COLS3; c++) {
      const p = board[r][c];
      if (!p || xiangqiPieceColor3(p) !== color) continue;
      const moves = getXiangqiPieceMoves3(board, r, c);
      for (const m of moves) {
        const { board: newBoard } = applyXiangqiMove3(board, [r, c], m.to);
        if (!isXiangqiInCheck3(newBoard, color)) {
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
function isXiangqiCheckmate3(board, color) {
  if (!findXiangqiKing3(board, color)) return false;
  if (!isXiangqiInCheck3(board, color)) return false;
  return getAllXiangqiLegalMoves3(board, color).length === 0;
}
function isXiangqiStalemate3(board, color) {
  if (!findXiangqiKing3(board, color)) return false;
  if (isXiangqiInCheck3(board, color)) return false;
  return getAllXiangqiLegalMoves3(board, color).length === 0;
}
function getXiangqiGameStatus3(board, turn) {
  if (isXiangqiCheckmate3(board, turn)) return "checkmate";
  if (isXiangqiStalemate3(board, turn)) return "stalemate";
  if (isXiangqiInCheck3(board, turn)) return "check";
  return "playing";
}
function getXiangqiGameStatusAdvanced3(board, turn, moves) {
  const base = getXiangqiGameStatus3(board, turn);
  if (base === "checkmate" || base === "stalemate") return base;
  const key = boardKey3(board);
  let count = 0;
  let b = cloneXiangqiBoard3(XIANGQI_INITIAL_BOARD3);
  const snapshotKeys = [boardKey3(b)];
  try {
    for (const m of moves) {
      if (!xiangqiInBounds3(m.from[0], m.from[1]) || !xiangqiInBounds3(m.to[0], m.to[1]) || !b[m.from[0]]?.[m.from[1]]) {
        snapshotKeys.length = 0;
        break;
      }
      const applied = applyXiangqiMove3(b, m.from, m.to);
      b = applied.board;
      snapshotKeys.push(boardKey3(b));
    }
  } catch {
    snapshotKeys.length = 0;
  }
  const replayKey = snapshotKeys[snapshotKeys.length - 1] || "";
  if (replayKey === key) {
    for (const k of snapshotKeys) {
      if (k === key) count++;
    }
    if (count >= 3) return "draw";
  } else {
    if (moves.length > 0) {
      console.warn("[xiangqi] \u5C40\u9762\u91CD\u653E\u4E0E\u5F53\u524D\u68CB\u76D8\u4E0D\u4E00\u81F4\uFF0C\u8DF3\u8FC7\u91CD\u590D\u5C40\u9762\u5224\u5B9A");
    }
  }
  const limit = 120;
  if (moves.length >= limit) {
    const recent = moves.slice(-limit);
    const hasProgress = recent.some(
      (m) => m.captured || m.piece === "P" || m.piece === "p"
    );
    if (!hasProgress) return "draw";
  }
  return base;
}
function boardKey3(board) {
  return board.map((row) => row.map((c) => c || ".").join("")).join("/");
}
function isXiangqiMoveLegal2(board, from, to, color) {
  const legalMoves = getAllXiangqiLegalMoves3(board, color);
  return legalMoves.some(
    (m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]
  );
}
function getOpeningMove2(ply, color, board) {
  if (ply >= 8) return null;
  if (ply === 0 && color === "r") {
    const pick = RED_OPENINGS2[Math.random() * RED_OPENINGS2.length | 0];
    return pick ? [pick.from, pick.to] : null;
  }
  if (ply === 1 && color === "b") {
    const pick = BLACK_RESPONSES2[Math.random() * BLACK_RESPONSES2.length | 0];
    return pick ? [pick.from, pick.to] : null;
  }
  const entries = OPENING_BOOK2.filter((e) => e.ply === ply && e.color === color);
  const alt = OPENING_BOOK_ALTERNATE2.filter((e) => e.ply === ply && e.color === color);
  const candidates = entries.length ? entries : alt;
  if (!candidates.length) return null;
  const [fr, fc] = candidates[0].from;
  const [tr, tc] = candidates[0].to;
  if (!board[fr] || !board[fr][fc]) return null;
  const piece = board[fr][fc];
  const isRedPiece = piece === piece.toUpperCase();
  if (color === "r" !== isRedPiece) return null;
  if (!board[tr] || board[tr][tc] === void 0) return null;
  return candidates[0].from && candidates[0].to ? [candidates[0].from, candidates[0].to] : null;
}
function setLearnedBias2(bias) {
  learnedBias2 = bias;
}
function getPST2(piece, row, col) {
  const type = piece.toLowerCase();
  const red = piece === piece.toUpperCase();
  const r = red ? row : 9 - row;
  const c = red ? col : 8 - col;
  switch (type) {
    case TYPE2.PAWN:
      return PAWN_PST_RED2[r][c] - 100;
    case TYPE2.HORSE:
      return HORSE_PST_RED2[r][c] - 100;
    case TYPE2.ROOK:
      return ROOK_PST_RED2[r][c] - 200;
    case TYPE2.CANNON:
      return CANNON_PST_RED2[r][c] - 100;
    default:
      return 0;
  }
}
function mulberry322(seed) {
  return function() {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pieceZobristIndex2(p) {
  if (!p) return -1;
  const typeMap = { k: 0, a: 1, b: 2, n: 3, r: 4, c: 5, p: 6 };
  const t = p.toLowerCase();
  const idx = typeMap[t];
  if (idx === void 0) return -1;
  return isRed2(p) ? idx : idx + 7;
}
function computeHash2(b, color) {
  let h = 0;
  for (let i = 0; i < b.length; i++) {
    const pi = pieceZobristIndex2(b[i]);
    if (pi >= 0) h ^= ZOBRIST2[pi][i];
  }
  if (color === "b") h ^= ZOBRIST_SIDE2[1];
  return h;
}
function ttStore2(hash, score, depth, flag, bestFrom, bestTo) {
  const idx = hash & TT_SIZE2 - 1;
  const existing = transTable2[idx];
  if (!existing || depth >= existing.depth) {
    transTable2[idx] = { hash, score, depth, flag, bestFrom, bestTo };
  }
}
function ttProbe2(hash) {
  const entry = transTable2[hash & TT_SIZE2 - 1];
  if (entry && entry.hash === hash) return entry;
  return null;
}
function historyIndex2(from, to) {
  return from * COLS23 * ROWS23 + to;
}
function toFlat2(board) {
  const f = new Array(COLS23 * ROWS23).fill("");
  for (let y = 0; y < ROWS23; y++) for (let x = 0; x < COLS23; x++) f[y * COLS23 + x] = board[y][x];
  return f;
}
function pseudoMoves2(b, idx) {
  const p = b[idx];
  if (!p) return [];
  const x = idx % COLS23, y = idx / COLS23 | 0;
  const c = isRed2(p) ? "r" : "b";
  const type = p.toLowerCase();
  const out = [];
  const add = (nx, ny) => {
    if (!inBoard2(nx, ny)) return false;
    const q = b[ny * COLS23 + nx];
    if (q && isRed2(q) === isRed2(p)) return false;
    out.push(ny * COLS23 + nx);
    return !q;
  };
  const addIf = (nx, ny, cond) => {
    if (!inBoard2(nx, ny) || !cond()) return;
    const q = b[ny * COLS23 + nx];
    if (q && isRed2(q) === isRed2(p)) return;
    out.push(ny * COLS23 + nx);
  };
  switch (type) {
    case TYPE2.GENERAL:
      for (const [dx, dy] of DIR42) {
        const nx = x + dx, ny = y + dy;
        if (inPalace23(nx, ny, c)) add(nx, ny);
      }
      break;
    case TYPE2.ADVISOR:
      for (const [dx, dy] of ADV_MV2) {
        const nx = x + dx, ny = y + dy;
        if (inPalace23(nx, ny, c)) add(nx, ny);
      }
      break;
    case TYPE2.ELEPHANT:
      for (const [dx, dy] of ELE_MV2) {
        const nx = x + dx, ny = y + dy, ex = x + dx / 2, ey = y + dy / 2;
        addIf(nx, ny, () => ownHalf2(ny, c) && !b[ey * COLS23 + ex]);
      }
      break;
    case TYPE2.HORSE:
      for (const [dx, dy] of HORSE_MV2) {
        const leg = HORSE_LEG2["[" + dx + "," + dy + "]"];
        const nx = x + dx, ny = y + dy, lx = x + leg[0], ly = y + leg[1];
        addIf(nx, ny, () => !b[ly * COLS23 + lx]);
      }
      break;
    case TYPE2.ROOK:
      for (const [dx, dy] of DIR42) {
        let nx = x + dx, ny = y + dy;
        while (inBoard2(nx, ny)) {
          if (!b[ny * COLS23 + nx]) add(nx, ny);
          else {
            if (isRed2(b[ny * COLS23 + nx]) !== isRed2(p)) add(nx, ny);
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    case TYPE2.CANNON:
      for (const [dx, dy] of DIR42) {
        let nx = x + dx, ny = y + dy, screen = 0;
        while (inBoard2(nx, ny)) {
          const q = b[ny * COLS23 + nx];
          if (!q) {
            if (screen === 0) add(nx, ny);
          } else {
            screen++;
            if (screen === 2) {
              if (isRed2(q) !== isRed2(p)) add(nx, ny);
              break;
            }
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    case TYPE2.PAWN: {
      const fy = c === "r" ? y - 1 : y + 1;
      if (inBoard2(x, fy)) add(x, fy);
      if (crossed2(y, c)) {
        if (inBoard2(x - 1, y)) add(x - 1, y);
        if (inBoard2(x + 1, y)) add(x + 1, y);
      }
      break;
    }
  }
  return out;
}
function isAttacked2(b, x, y, color) {
  for (const [dx, dy] of DIR42) {
    let nx = x + dx, ny = y + dy, screen = 0;
    while (inBoard2(nx, ny)) {
      const q = b[ny * COLS23 + nx];
      if (q) {
        if (isRed2(q) === (color === "r")) {
          if (screen === 0) {
            if (q.toLowerCase() === TYPE2.ROOK) return true;
            if (q.toLowerCase() === TYPE2.GENERAL && dx === 0) return true;
          }
          if (q.toLowerCase() === TYPE2.CANNON && screen === 1) return true;
        }
        screen++;
        if (screen >= 2) break;
      }
      nx += dx;
      ny += dy;
    }
  }
  for (const [dx, dy] of HORSE_MV2) {
    const px = x + dx, py = y + dy;
    if (inBoard2(px, py) && b[py * COLS23 + px] && isRed2(b[py * COLS23 + px]) === (color === "r") && b[py * COLS23 + px].toLowerCase() === TYPE2.HORSE) {
      const lx = Math.abs(dx) === 2 ? x + dx / 2 : x + dx;
      const ly = Math.abs(dy) === 2 ? y + dy / 2 : y + dy;
      if (!b[ly * COLS23 + lx]) return true;
    }
  }
  const redPawn = (px, py) => b[py * COLS23 + px] && b[py * COLS23 + px] === "P";
  const blkPawn = (px, py) => b[py * COLS23 + px] && b[py * COLS23 + px] === "p";
  if (inBoard2(x, y + 1) && redPawn(x, y + 1)) return true;
  if (y <= 4) {
    if (inBoard2(x - 1, y) && redPawn(x - 1, y)) return true;
    if (inBoard2(x + 1, y) && redPawn(x + 1, y)) return true;
  }
  if (inBoard2(x, y - 1) && blkPawn(x, y - 1)) return true;
  if (y >= 5) {
    if (inBoard2(x - 1, y) && blkPawn(x - 1, y)) return true;
    if (inBoard2(x + 1, y) && blkPawn(x + 1, y)) return true;
  }
  return false;
}
function findGeneral2(b, c) {
  const ch = c === "r" ? "K" : "k";
  for (let i = 0; i < b.length; i++) if (b[i] === ch) return i;
  return -1;
}
function isEndgame2(b) {
  let main = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const t = p.toLowerCase();
    if (t === "r" || t === "n" || t === "c") main += 2;
    else if (t === "p") {
      const y = i / COLS23 | 0;
      if (isRed2(p) && y <= 4 || !isRed2(p) && y >= 5) main += 1;
    }
  }
  return main <= 6;
}
function evaluate2(b, c, withMobility = true) {
  let material = 0;
  let positional = 0;
  let mobility = 0;
  let safety = 0;
  const endgame = isEndgame2(b);
  const zCross = {};
  const zHome = {};
  if (learnedBias2) {
    for (const k in learnedBias2) {
      if (k.startsWith("z_")) {
        const parts = k.split("_");
        if (parts.length === 3) {
          const type = parts[1];
          const zone = parts[2];
          if (zone === "cross") zCross[type] = learnedBias2[k] || 0;
          else if (zone === "home") zHome[type] = learnedBias2[k] || 0;
        }
      }
    }
  }
  let myAdvisors = 0, myElephants = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const x = i % COLS23, y = i / COLS23 | 0;
    const mine = isRed2(p) === (c === "r");
    const t = p.toLowerCase();
    let baseVal = PIECE_VALUE2[p] || 0;
    if (learnedBias2) baseVal += learnedBias2[t] || 0;
    if (endgame) {
      if (t === "n") baseVal += 30;
      else if (t === "c") baseVal -= 25;
      else if (t === "p") baseVal += 25;
    }
    const pstVal = getPST2(p, y, x);
    material += mine ? baseVal : -baseVal;
    positional += mine ? pstVal : -pstVal;
    if (mine) {
      const zoneBonus = crossed2(y, c) ? zCross[t] || 0 : zHome[t] || 0;
      positional += zoneBonus;
      if (t === "a") myAdvisors += 1;
      else if (t === "b") myElephants += 1;
    }
  }
  const king = findGeneral2(b, c);
  if (king >= 0) {
    const kx = king % COLS23, ky = king / COLS23 | 0;
    if (kx === 4 && (ky === 8 || ky === 1)) safety += 8;
  }
  safety += myAdvisors * 5 + myElephants * 5;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p || p.toLowerCase() !== "c" || isRed2(p) !== (c === "r")) continue;
    const x = i % COLS23, y = i / COLS23 | 0;
    for (const [dx, dy] of DIR42) {
      const nx = x + dx, ny = y + dy;
      if (!inBoard2(nx, ny)) continue;
      const np = b[ny * COLS23 + nx];
      if (np && isRed2(np) === (c === "r")) {
        safety += 6;
        break;
      }
    }
  }
  if (withMobility) {
    let myMobility = 0;
    for (let i = 0; i < b.length; i++) {
      if (b[i] && isRed2(b[i]) === (c === "r")) {
        myMobility += pseudoMoves2(b, i).length;
      }
    }
    mobility = myMobility * 2;
  }
  return material + positional + mobility + safety;
}
function mvvLvaScore2(piece, captured) {
  if (!captured) return -1e4 + (historyTable2[historyIndex2(0, 0)] || 0);
  const victim = PIECE_VALUE2[captured] || 0;
  const attacker = PIECE_VALUE2[piece] || 1;
  return victim * 100 - attacker;
}
function legalMovesOrdered2(b, c, bestFrom, bestTo) {
  const pseudo = [];
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (p && isRed2(p) === (c === "r")) {
      for (const d of pseudoMoves2(b, i)) {
        const cap = b[d];
        let score = mvvLvaScore2(p, cap);
        if (i === bestFrom && d === bestTo) score += 1e6;
        if (!cap) score += historyTable2[historyIndex2(i, d)] || 0;
        pseudo.push({ from: i, to: d, cap, score });
      }
    }
  }
  pseudo.sort((a, z) => z.score - a.score);
  const legal = [];
  for (const m of pseudo) {
    const cap = applyMove2(b, m.from, m.to);
    if (!isInCheck2(b, c)) legal.push(m);
    undoMove2(b, m.from, m.to, cap);
  }
  return legal;
}
function captureMovesOrdered2(b, c, bestFrom, bestTo) {
  const caps = [];
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (p && isRed2(p) === (c === "r")) {
      for (const d of pseudoMoves2(b, i)) {
        const cap = b[d];
        if (!cap) continue;
        let score = mvvLvaScore2(p, cap);
        if (i === bestFrom && d === bestTo) score += 1e6;
        caps.push({ from: i, to: d, cap, score });
      }
    }
  }
  caps.sort((a, z) => z.score - a.score);
  const legal = [];
  for (const m of caps) {
    const cap = applyMove2(b, m.from, m.to);
    if (!isInCheck2(b, c)) legal.push(m);
    undoMove2(b, m.from, m.to, cap);
  }
  return legal;
}
function quiescence2(b, c, alpha, beta, ply, hash, qDepth = 0) {
  checkTimeout2();
  const qtt = ttProbe2(hash);
  if (qtt && qtt.depth === 0 && qtt.flag === TT_EXACT2) return qtt.score;
  if (qDepth >= 4) return evaluate2(b, c, false);
  const stand = evaluate2(b, c, false);
  if (stand >= beta) {
    ttStore2(hash, stand, 0, TT_BETA2, -1, -1);
    return beta;
  }
  if (stand > alpha) alpha = stand;
  const inCheck = isInCheck2(b, c);
  const moves = inCheck ? legalMovesOrdered2(b, c, -1, -1) : captureMovesOrdered2(b, c, -1, -1);
  if (moves.length === 0) {
    return inCheck ? -(MATE2 - ply) : stand;
  }
  let best = stand;
  for (const m of moves) {
    if (!inCheck) {
      const gain = (PIECE_VALUE2[m.cap] || 0) + 50;
      if (stand + gain < alpha) continue;
    }
    const cap = applyMove2(b, m.from, m.to);
    const pi = pieceZobristIndex2(b[m.to]);
    const capPi = cap ? pieceZobristIndex2(cap) : -1;
    let newHash = hash;
    if (pi >= 0) newHash ^= ZOBRIST2[pi][m.to];
    if (pi >= 0) newHash ^= ZOBRIST2[pi][m.from];
    if (capPi >= 0) newHash ^= ZOBRIST2[capPi][m.to];
    newHash ^= ZOBRIST_SIDE2[0];
    let score;
    try {
      score = -quiescence2(b, opp2(c), -beta, -alpha, ply + 1, newHash, qDepth + 1);
    } catch (e) {
      undoMove2(b, m.from, m.to, cap);
      throw e;
    }
    undoMove2(b, m.from, m.to, cap);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  const qFlag = best <= stand ? TT_ALPHA2 : TT_EXACT2;
  ttStore2(hash, best, 0, qFlag, -1, -1);
  return best;
}
function checkTimeout2() {
  nodeCount2++;
  if ((nodeCount2 & 1023) === 0 && Date.now() > deadline2) {
    throw { timeout: true };
  }
}
function negamax2(b, c, depth, alpha, beta, ply, allowNull, hash) {
  checkTimeout2();
  const ttEntry = ttProbe2(hash);
  let ttBestFrom = -1, ttBestTo = -1;
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_EXACT2) return ttEntry.score;
    if (ttEntry.flag === TT_ALPHA2 && ttEntry.score <= alpha) return ttEntry.score;
    if (ttEntry.flag === TT_BETA2 && ttEntry.score >= beta) return ttEntry.score;
  }
  if (ttEntry) {
    ttBestFrom = ttEntry.bestFrom;
    ttBestTo = ttEntry.bestTo;
  }
  if (depth <= 0) {
    return quiescence2(b, c, alpha, beta, ply, hash);
  }
  const hasNullPotential = (() => {
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p.toLowerCase();
      if (t === "r" || t === "n" || t === "c") return true;
      if (t === "p") {
        const y = i / COLS23 | 0;
        if (isRed2(p) && y <= 4 || !isRed2(p) && y >= 5) return true;
      }
    }
    return false;
  })();
  if (allowNull && depth >= 3 && !isInCheck2(b, c) && hasNullPotential) {
    const nullHash = hash ^ ZOBRIST_SIDE2[0];
    const R = 2;
    const score = -negamax2(b, opp2(c), depth - 1 - R, -beta, -beta + 1, ply + 1, false, nullHash);
    if (score >= beta) {
      return beta;
    }
  }
  const moves = legalMovesOrdered2(b, c, ttBestFrom, ttBestTo);
  if (moves.length === 0) {
    return -(MATE2 - ply);
  }
  let bestScore = -INF2;
  let bestFrom = moves[0].from;
  let bestTo = moves[0].to;
  let originalAlpha = alpha;
  for (let idx = 0; idx < moves.length; idx++) {
    const m = moves[idx];
    const cap = applyMove2(b, m.from, m.to);
    const pi = pieceZobristIndex2(b[m.to]);
    const capPi = cap ? pieceZobristIndex2(cap) : -1;
    let newHash = hash;
    if (pi >= 0) newHash ^= ZOBRIST2[pi][m.to];
    if (pi >= 0) newHash ^= ZOBRIST2[pi][m.from];
    if (capPi >= 0) newHash ^= ZOBRIST2[capPi][m.to];
    newHash ^= ZOBRIST_SIDE2[0];
    const givesCheck = isInCheck2(b, opp2(c));
    const extension = givesCheck && depth >= 4 ? 1 : 0;
    const isTtBest = m.from === ttBestFrom && m.to === ttBestTo;
    let searchDepth = depth - 1 + extension;
    let reduced = false;
    if (depth >= 3 && !m.cap && !isTtBest && !givesCheck && idx >= 3) {
      searchDepth = depth - 2 + extension;
      reduced = true;
    }
    let score;
    try {
      if (idx === 0) {
        score = -negamax2(b, opp2(c), searchDepth, -beta, -alpha, ply + 1, true, newHash);
      } else {
        score = -negamax2(b, opp2(c), searchDepth, -alpha - 1, -alpha, ply + 1, true, newHash);
        if (score > alpha) {
          if (reduced) {
            score = -negamax2(b, opp2(c), depth - 1 + extension, -beta, -alpha, ply + 1, true, newHash);
          } else if (score < beta) {
            score = -negamax2(b, opp2(c), searchDepth, -beta, -alpha, ply + 1, true, newHash);
          }
        }
      }
    } catch (e) {
      undoMove2(b, m.from, m.to, cap);
      throw e;
    }
    undoMove2(b, m.from, m.to, cap);
    if (score > bestScore) {
      bestScore = score;
      bestFrom = m.from;
      bestTo = m.to;
    }
    if (bestScore > alpha) alpha = bestScore;
    if (alpha >= beta) {
      if (!m.cap) {
        historyTable2[historyIndex2(m.from, m.to)] += depth * depth;
      }
      break;
    }
  }
  let flag = TT_EXACT2;
  if (bestScore <= originalAlpha) flag = TT_ALPHA2;
  else if (bestScore >= beta) flag = TT_BETA2;
  ttStore2(hash, bestScore, depth, flag, bestFrom, bestTo);
  return bestScore;
}
function xiangqiBestMove2(board, color, difficulty = "medium", weights, ply) {
  if (weights) learnedBias2 = weights;
  if (ply != null && ply < 8) {
    const book = getOpeningMove2(ply, color, board);
    if (book && isXiangqiMoveLegal2(board, book[0], book[1], color)) {
      return book;
    }
  }
  const cfg = DIFFICULTY2[difficulty] || DIFFICULTY2.medium;
  deadline2 = Date.now() + cfg.timeMs;
  nodeCount2 = 0;
  transTable2 = new Array(TT_SIZE2);
  for (let i = 0; i < historyTable2.length; i++) historyTable2[i] = Math.floor(historyTable2[i] / 2);
  const b = toFlat2(board);
  const c = color;
  const initialHash = computeHash2(b, c);
  const firstMoves = legalMovesOrdered2(b, c, -1, -1);
  if (firstMoves.length === 0) return null;
  let best = null;
  let bestScore = -INF2;
  const begin = Date.now();
  let scoredLevel = [];
  for (let d = 1; d <= cfg.depth; d++) {
    let curBest = null;
    let curScore = -INF2;
    let alpha = -INF2, beta = INF2, timedOut = false;
    const moves = legalMovesOrdered2(
      b,
      c,
      best ? best.from : -1,
      best ? best.to : -1
    );
    for (const m of moves) {
      const cap = applyMove2(b, m.from, m.to);
      const pi = pieceZobristIndex2(b[m.to]);
      const capPi = cap ? pieceZobristIndex2(cap) : -1;
      let newHash = initialHash;
      if (pi >= 0) newHash ^= ZOBRIST2[pi][m.to];
      if (pi >= 0) newHash ^= ZOBRIST2[pi][m.from];
      if (capPi >= 0) newHash ^= ZOBRIST2[capPi][m.to];
      newHash ^= ZOBRIST_SIDE2[0];
      let score;
      try {
        score = -negamax2(b, opp2(c), d - 1, -beta, -alpha, 1, true, newHash);
      } catch {
        timedOut = true;
        undoMove2(b, m.from, m.to, cap);
        break;
      }
      undoMove2(b, m.from, m.to, cap);
      if (score > curScore) {
        curScore = score;
        curBest = { from: m.from, to: m.to };
      }
      if (curScore > alpha) alpha = curScore;
      scoredLevel.push({ from: m.from, to: m.to, score });
    }
    if (!timedOut && curBest) {
      best = curBest;
      bestScore = curScore;
    } else {
      break;
    }
    if (Date.now() - begin > cfg.timeMs * 0.85) break;
  }
  if (!best) {
    best = { from: firstMoves[0].from, to: firstMoves[0].to };
  }
  if (cfg.noise > 0 && Math.abs(bestScore) < MATE2 * 0.5) {
    const count = Math.max(1, Math.min(firstMoves.length, 1 + Math.floor(cfg.noise / 5)));
    const top = firstMoves.slice(0, count);
    const pick = top[Math.random() * top.length | 0];
    best = { from: pick.from, to: pick.to };
  }
  if (cfg.variety > 0 && Math.abs(bestScore) < MATE2 * 0.5 && scoredLevel.length > 1) {
    const bestS = Math.max(...scoredLevel.map((x) => x.score));
    const window2 = cfg.variety;
    const candidates = scoredLevel.filter((x) => bestS - x.score <= window2);
    if (candidates.length > 1) {
      const weights2 = candidates.map((x) => Math.max(1, 10 - (bestS - x.score) * 0.16));
      const total = weights2.reduce((a, b2) => a + b2, 0);
      let r = Math.random() * total;
      for (let i = 0; i < candidates.length; i++) {
        r -= weights2[i];
        if (r <= 0) {
          best = { from: candidates[i].from, to: candidates[i].to };
          bestScore = candidates[i].score;
          break;
        }
      }
    }
  }
  return [
    [best.from / COLS23 | 0, best.from % COLS23],
    [best.to / COLS23 | 0, best.to % COLS23]
  ];
}
function selfplay2(games, depth) {
  const st2 = Date.now();
  let red = 0, black = 0, draw2 = 0, illegal2 = 0;
  for (let g = 0; g < games; g++) {
    let b = cloneXiangqiBoard3(XIANGQI_INITIAL_BOARD3);
    let t = "r";
    for (let step = 0; step < 160; step++) {
      const m = xiangqiBestMove2(b, t, depth, null, 6);
      if (!m) break;
      const from = m[0], to = m[1];
      if (!getAllXiangqiLegalMoves3(b, t).some((x) => x.from[0] === from[0] && x.from[1] === from[1] && x.to[0] === to[0] && x.to[1] === to[1])) {
        illegal2++;
        break;
      }
      b = applyXiangqiMove3(b, from, to).board;
      const s = getXiangqiGameStatusAdvanced3(b, t === "r" ? "b" : "r", [{ from, to }]);
      if (s === "checkmate" || s === "stalemate") {
        if (t === "r") black++;
        else red++;
        break;
      }
      if (s === "draw") {
        draw2++;
        break;
      }
      t = t === "r" ? "b" : "r";
    }
  }
  return { red, black, draw: draw2, ms: Date.now() - st2, illegal: illegal2 };
}
var ROWS3, COLS3, XIANGQI_INITIAL_BOARD3, OPENING_BOOK2, OPENING_BOOK_ALTERNATE2, RED_OPENINGS2, BLACK_RESPONSES2, COLS23, ROWS23, MATE2, INF2, TYPE2, PIECE_VALUE2, learnedBias2, PAWN_PST_RED2, HORSE_PST_RED2, ROOK_PST_RED2, CANNON_PST_RED2, isRed2, DIR42, HORSE_MV2, HORSE_LEG2, ELE_MV2, ADV_MV2, inBoard2, inPalace23, ownHalf2, crossed2, opp2, ZOBRIST2, ZOBRIST_SIDE2, TT_EXACT2, TT_ALPHA2, TT_BETA2, TT_SIZE2, transTable2, historyTable2, isInCheck2, applyMove2, undoMove2, deadline2, nodeCount2, DIFFICULTY2;
var init_tmp_vs_old = __esm({
  "tmp_vs_old.mjs"() {
    "use strict";
    ROWS3 = 10;
    COLS3 = 9;
    XIANGQI_INITIAL_BOARD3 = [
      ["r", "n", "b", "a", "k", "a", "b", "n", "r"],
      // row 0 黑方底线
      ["", "", "", "", "", "", "", "", ""],
      // row 1
      ["", "c", "", "", "", "", "", "c", ""],
      // row 2 炮
      ["p", "", "p", "", "p", "", "p", "", "p"],
      // row 3 卒
      ["", "", "", "", "", "", "", "", ""],
      // row 4 河岸(黑)
      ["", "", "", "", "", "", "", "", ""],
      // row 5 河岸(红)
      ["P", "", "P", "", "P", "", "P", "", "P"],
      // row 6 兵
      ["", "C", "", "", "", "", "", "C", ""],
      // row 7 炮
      ["", "", "", "", "", "", "", "", ""],
      // row 8
      ["R", "N", "B", "A", "K", "A", "B", "N", "R"]
      // row 9 红方底线
    ];
    OPENING_BOOK2 = [
      // 1. 红 炮二平五（中炮开局，控制中路）
      { ply: 0, color: "r", from: [7, 7], to: [7, 4], note: "\u4E2D\u70AE\u5F00\u5C40\uFF1A\u70AE\u9547\u4E2D\u8DEF" },
      // 2. 黑 马8进7（屏风马应中炮）
      { ply: 1, color: "b", from: [0, 1], to: [2, 2], note: "\u5C4F\u98CE\u9A6C\uFF1A\u9A6C8\u8FDB7" },
      // 3. 红 马二进三（跳正马保护中兵）
      { ply: 2, color: "r", from: [9, 7], to: [7, 6], note: "\u7EA2\u65B9\u8DF3\u9A6C" },
      // 4. 黑 马2进3（双马结成屏风）
      { ply: 3, color: "b", from: [0, 7], to: [2, 6], note: "\u9ED1\u65B9\u8DF3\u9A6C" },
      // 5. 红 车一平二（出直车，占领肋道）
      { ply: 4, color: "r", from: [9, 8], to: [7, 8], note: "\u7EA2\u65B9\u51FA\u8F66" },
      // 6. 黑 卒3进1（活通马腿）
      { ply: 5, color: "b", from: [3, 2], to: [4, 2], note: "\u9ED1\u53523\u8FDB1" },
      // 7. 红 车二进六（过河压马，形成中炮过河车）
      { ply: 6, color: "r", from: [7, 8], to: [1, 8], note: "\u4E2D\u70AE\u8FC7\u6CB3\u8F66" },
      // 8. 黑 象7进5（补象巩固中路）
      { ply: 7, color: "b", from: [0, 6], to: [1, 5], note: "\u9ED1\u65B9\u8865\u8C61" }
    ];
    OPENING_BOOK_ALTERNATE2 = [
      { ply: 1, color: "b", from: [2, 1], to: [2, 4], note: "\u987A\u70AE\uFF1A\u9ED1\u70AE2\u5E735" },
      { ply: 2, color: "r", from: [9, 7], to: [7, 6], note: "\u7EA2\u65B9\u8DF3\u9A6C" },
      { ply: 3, color: "b", from: [0, 7], to: [2, 6], note: "\u9ED1\u65B9\u8DF3\u9A6C" },
      { ply: 4, color: "r", from: [9, 8], to: [7, 8], note: "\u7EA2\u65B9\u51FA\u8F66" },
      { ply: 5, color: "b", from: [3, 7], to: [4, 7], note: "\u9ED1\u53527\u8FDB1" },
      { ply: 6, color: "r", from: [7, 8], to: [2, 8], note: "\u7EA2\u8F66\u8FC7\u6CB3" },
      { ply: 7, color: "b", from: [0, 6], to: [1, 5], note: "\u9ED1\u65B9\u8865\u8C61" }
    ];
    RED_OPENINGS2 = [
      { from: [7, 7], to: [7, 4], note: "\u4E2D\u70AE\u5F00\u5C40\uFF1A\u70AE\u9547\u4E2D\u8DEF" },
      { from: [6, 2], to: [5, 2], note: "\u4ED9\u4EBA\u6307\u8DEF\uFF1A\u5175\u4E09\u8FDB\u4E00" },
      { from: [9, 6], to: [7, 4], note: "\u98DE\u76F8\u5C40\uFF1A\u76F8\u4E09\u8FDB\u4E94" }
    ];
    BLACK_RESPONSES2 = [
      { from: [0, 1], to: [2, 2], note: "\u5C4F\u98CE\u9A6C\uFF1A\u9A6C8\u8FDB7" },
      { from: [2, 1], to: [2, 4], note: "\u987A\u70AE\uFF1A\u9ED1\u70AE2\u5E735" },
      { from: [0, 7], to: [2, 6], note: "\u53CD\u5BAB\u9A6C\uFF1A\u9A6C2\u8FDB3" }
    ];
    COLS23 = 9;
    ROWS23 = 10;
    MATE2 = 1e6;
    INF2 = 1e9;
    TYPE2 = {
      GENERAL: "k",
      ADVISOR: "a",
      ELEPHANT: "b",
      HORSE: "n",
      ROOK: "r",
      CANNON: "c",
      PAWN: "p"
    };
    PIECE_VALUE2 = {
      k: 1e4,
      a: 120,
      b: 120,
      n: 350,
      r: 900,
      c: 450,
      p: 100,
      K: 1e4,
      A: 120,
      B: 120,
      N: 350,
      R: 900,
      C: 450,
      P: 100
    };
    learnedBias2 = null;
    PAWN_PST_RED2 = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      // row 0 黑方底线
      [90, 90, 90, 96, 90, 96, 90, 90, 90],
      // row 1
      [90, 96, 103, 97, 94, 97, 103, 96, 90],
      // row 2
      [90, 96, 99, 104, 108, 104, 99, 96, 90],
      // row 3
      [90, 96, 99, 104, 108, 104, 99, 96, 90],
      // row 4 河岸
      [60, 60, 65, 72, 72, 72, 65, 60, 60],
      // row 5 红岸
      [20, 0, 20, 0, 20, 0, 20, 0, 20],
      // row 6 初始兵位
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      // row 7
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      // row 8
      [0, 0, 0, 0, 0, 0, 0, 0, 0]
      // row 9 红方底线
    ];
    HORSE_PST_RED2 = [
      [90, 90, 90, 96, 90, 96, 90, 90, 90],
      [90, 96, 103, 97, 94, 97, 103, 96, 90],
      [92, 98, 99, 103, 99, 103, 99, 98, 92],
      [93, 108, 100, 107, 100, 107, 100, 108, 93],
      [90, 100, 99, 103, 104, 103, 99, 100, 90],
      [90, 98, 101, 102, 103, 102, 101, 98, 90],
      [92, 94, 98, 95, 98, 95, 98, 94, 92],
      [93, 92, 94, 95, 92, 95, 94, 92, 93],
      [85, 90, 92, 93, 78, 93, 92, 90, 85],
      [88, 85, 90, 88, 90, 88, 90, 85, 88]
    ];
    ROOK_PST_RED2 = [
      [206, 208, 207, 213, 214, 213, 207, 208, 206],
      [206, 212, 209, 216, 233, 216, 209, 212, 206],
      [206, 208, 207, 214, 216, 214, 207, 208, 206],
      [206, 213, 213, 216, 216, 216, 213, 213, 206],
      [206, 211, 211, 214, 215, 214, 211, 211, 206],
      [206, 212, 212, 214, 215, 214, 212, 212, 206],
      [204, 209, 204, 212, 214, 212, 204, 209, 204],
      [198, 208, 204, 212, 212, 212, 204, 208, 198],
      [200, 208, 206, 212, 200, 212, 206, 208, 200],
      [194, 206, 204, 212, 200, 212, 204, 206, 194]
    ];
    CANNON_PST_RED2 = [
      [100, 100, 96, 91, 90, 91, 96, 100, 100],
      [98, 98, 96, 92, 89, 92, 96, 98, 98],
      [97, 97, 96, 91, 92, 91, 96, 97, 97],
      [96, 99, 99, 98, 100, 98, 99, 99, 96],
      [96, 96, 96, 96, 100, 96, 96, 96, 96],
      [95, 96, 99, 96, 100, 96, 99, 96, 95],
      [96, 96, 96, 96, 96, 96, 96, 96, 96],
      [97, 96, 100, 99, 101, 99, 100, 96, 97],
      [96, 97, 98, 98, 98, 98, 98, 97, 96],
      [96, 96, 97, 99, 99, 99, 97, 96, 96]
    ];
    isRed2 = (p) => p !== "" && p === p.toUpperCase();
    DIR42 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    HORSE_MV2 = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    HORSE_LEG2 = {
      "[-2,-1]": [-1, 0],
      "[-2,1]": [-1, 0],
      "[-1,-2]": [0, -1],
      "[-1,2]": [0, 1],
      "[1,-2]": [0, -1],
      "[1,2]": [0, 1],
      "[2,-1]": [1, 0],
      "[2,1]": [1, 0]
    };
    ELE_MV2 = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
    ADV_MV2 = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    inBoard2 = (x, y) => x >= 0 && x < COLS23 && y >= 0 && y < ROWS23;
    inPalace23 = (x, y, color) => x >= 3 && x <= 5 && (color === "r" ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
    ownHalf2 = (y, color) => color === "r" ? y >= 5 : y <= 4;
    crossed2 = (y, color) => color === "r" ? y <= 4 : y >= 5;
    opp2 = (c) => c === "r" ? "b" : "r";
    ZOBRIST2 = [];
    ZOBRIST_SIDE2 = [0, 0];
    (function initZobrist2() {
      const rand = mulberry322(123456789);
      const pieceTypes = 14;
      for (let i = 0; i < pieceTypes; i++) {
        ZOBRIST2[i] = [];
        for (let j = 0; j < COLS23 * ROWS23; j++) {
          ZOBRIST2[i][j] = Math.floor(rand() * 2147483647);
        }
      }
      ZOBRIST_SIDE2[0] = Math.floor(rand() * 2147483647);
      ZOBRIST_SIDE2[1] = ZOBRIST_SIDE2[0];
    })();
    TT_EXACT2 = 0;
    TT_ALPHA2 = 1;
    TT_BETA2 = 2;
    TT_SIZE2 = 1 << 17;
    transTable2 = new Array(TT_SIZE2);
    historyTable2 = new Array(COLS23 * ROWS23 * COLS23 * ROWS23).fill(0);
    isInCheck2 = (b, c) => {
      const g = findGeneral2(b, c);
      return g >= 0 ? isAttacked2(b, g % COLS23, g / COLS23 | 0, opp2(c)) : false;
    };
    applyMove2 = (b, from, to) => {
      const cap = b[to];
      b[to] = b[from];
      b[from] = "";
      return cap;
    };
    undoMove2 = (b, from, to, cap) => {
      b[from] = b[to];
      b[to] = cap;
    };
    deadline2 = 0;
    nodeCount2 = 0;
    DIFFICULTY2 = {
      easy: { depth: 2, timeMs: 400, noise: 30, variety: 70 },
      medium: { depth: 4, timeMs: 1e3, noise: 8, variety: 30 },
      hard: { depth: 6, timeMs: 2500, noise: 0, variety: 14 },
      master: { depth: 9, timeMs: 5e3, noise: 0, variety: 9 }
    };
    setLearnedBias2(null);
    console.log("OLD-ready");
  }
});

// src/engine/xiangqi.ts
var ROWS = 10;
var COLS = 9;
var XIANGQI_INITIAL_BOARD = [
  ["r", "n", "b", "a", "k", "a", "b", "n", "r"],
  // row 0 黑方底线
  ["", "", "", "", "", "", "", "", ""],
  // row 1
  ["", "c", "", "", "", "", "", "c", ""],
  // row 2 炮
  ["p", "", "p", "", "p", "", "p", "", "p"],
  // row 3 卒
  ["", "", "", "", "", "", "", "", ""],
  // row 4 河岸(黑)
  ["", "", "", "", "", "", "", "", ""],
  // row 5 河岸(红)
  ["P", "", "P", "", "P", "", "P", "", "P"],
  // row 6 兵
  ["", "C", "", "", "", "", "", "C", ""],
  // row 7 炮
  ["", "", "", "", "", "", "", "", ""],
  // row 8
  ["R", "N", "B", "A", "K", "A", "B", "N", "R"]
  // row 9 红方底线
];
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
  if (!xiangqiInBounds(from[0], from[1]) || !xiangqiInBounds(to[0], to[1]) || !board[from[0]]?.[from[1]]) {
    return { board: cloneXiangqiBoard(board), captured: "" };
  }
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
  if (!findXiangqiKing(board, color)) return false;
  if (!isXiangqiInCheck(board, color)) return false;
  return getAllXiangqiLegalMoves(board, color).length === 0;
}
function isXiangqiStalemate(board, color) {
  if (!findXiangqiKing(board, color)) return false;
  if (isXiangqiInCheck(board, color)) return false;
  return getAllXiangqiLegalMoves(board, color).length === 0;
}
function getXiangqiGameStatus(board, turn) {
  if (isXiangqiCheckmate(board, turn)) return "checkmate";
  if (isXiangqiStalemate(board, turn)) return "stalemate";
  if (isXiangqiInCheck(board, turn)) return "check";
  return "playing";
}
function getXiangqiGameStatusAdvanced(board, turn, moves) {
  const base = getXiangqiGameStatus(board, turn);
  if (base === "checkmate" || base === "stalemate") return base;
  const key = boardKey(board);
  let count = 0;
  let b = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
  const snapshotKeys = [boardKey(b)];
  try {
    for (const m of moves) {
      if (!xiangqiInBounds(m.from[0], m.from[1]) || !xiangqiInBounds(m.to[0], m.to[1]) || !b[m.from[0]]?.[m.from[1]]) {
        snapshotKeys.length = 0;
        break;
      }
      const applied = applyXiangqiMove(b, m.from, m.to);
      b = applied.board;
      snapshotKeys.push(boardKey(b));
    }
  } catch {
    snapshotKeys.length = 0;
  }
  const replayKey = snapshotKeys[snapshotKeys.length - 1] || "";
  if (replayKey === key) {
    for (const k of snapshotKeys) {
      if (k === key) count++;
    }
    if (count >= 3) return "draw";
  } else {
    if (moves.length > 0) {
      console.warn("[xiangqi] \u5C40\u9762\u91CD\u653E\u4E0E\u5F53\u524D\u68CB\u76D8\u4E0D\u4E00\u81F4\uFF0C\u8DF3\u8FC7\u91CD\u590D\u5C40\u9762\u5224\u5B9A");
    }
  }
  const limit = 120;
  if (moves.length >= limit) {
    const recent = moves.slice(-limit);
    const hasProgress = recent.some(
      (m) => m.captured || m.piece === "P" || m.piece === "p"
    );
    if (!hasProgress) return "draw";
  }
  return base;
}
function boardKey(board) {
  return board.map((row) => row.map((c) => c || ".").join("")).join("/");
}

// tmp_duel.ts
var n = await Promise.resolve().then(() => (init_tmp_vs_new(), tmp_vs_new_exports));
var o = await Promise.resolve().then(() => (init_tmp_vs_old(), tmp_vs_old_exports));
var nWin = 0;
var oWin = 0;
var draw = 0;
var illegal = 0;
var st = Date.now();
for (let g = 0; g < 12; g++) {
  let b = cloneXiangqiBoard(XIANGQI_INITIAL_BOARD);
  let t = "r";
  const redIsNew = g % 2 === 0;
  for (let step = 0; step < 200; step++) {
    const eng = t === "r" === redIsNew ? n : o;
    const m = eng.xiangqiBestMove(b, t, "medium", null, 6);
    if (!m) break;
    const from = m[0], to = m[1];
    if (!getAllXiangqiLegalMoves(b, t).some((x) => x.from[0] === from[0] && x.from[1] === from[1] && x.to[0] === to[0] && x.to[1] === to[1])) {
      illegal++;
      break;
    }
    b = applyXiangqiMove(b, from, to).board;
    const s = getXiangqiGameStatusAdvanced(b, t === "r" ? "b" : "r", [{ from, to }]);
    if (s === "checkmate" || s === "stalemate") {
      const winnerIsNew = (t === "r" ? "b" : "r") === "r" === redIsNew;
      if (winnerIsNew) nWin++;
      else oWin++;
      break;
    }
    if (s === "draw") {
      draw++;
      break;
    }
    t = t === "r" ? "b" : "r";
  }
}
console.log("NEW(\u4FB5\u7565\u6027+\u671F\u671B\u7A97\u53E3) vs OLD(c502925) medium 12\u5C40:", JSON.stringify({ newWin: nWin, oldWin: oWin, draw, illegal, ms: Date.now() - st }));
