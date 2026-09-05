"use strict";

// src/data/xiangqiPuzzles.ts
function emptyBoard() {
  return Array.from({ length: 10 }, () => Array(9).fill(""));
}
function setup(pieces) {
  const b = emptyBoard();
  for (const [p, r, c] of pieces) b[r][c] = p;
  return b;
}
var XIANGQI_PUZZLES = [
  // ================= 难度 1（一步杀，杀形明显）=================
  {
    id: "xq-001",
    type: "duimian",
    typeName: "\u767D\u8138\u5C06\uFF08\u5BF9\u9762\u7B11\uFF09",
    title: "\u8F66\u9501\u808B\u9053",
    description: "\u9ED1\u5C06\u88AB\u903C\u5230\u808B\u9053\uFF0C\u7EA2\u5E05\u9547\u4F4F\u4E2D\u8DEF\u3002\u7EA2\u8F66\u4E00\u6B65\u5C06\u519B\uFF0C\u9ED1\u5C06\u4E0D\u80FD\u56DE\u4E2D\uFF08\u5426\u5219\u5C06\u5E05\u5BF9\u9762\uFF09\uFF0C\u5373\u6210\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 8, 2],
      ["k", 2, 3],
      ["a", 0, 4]
    ]),
    answer: { from: [8, 2], to: [8, 3] },
    hint: "\u628A\u8F66\u5E73\u5230\u9ED1\u5C06\u6240\u5728\u7684\u808B\u9053\uFF08\u516D\u8DEF\uFF09\u5C06\u519B\uFF0C\u9ED1\u5C06\u80FD\u8EB2\u56DE\u4E2D\u8DEF\u5417\uFF1F",
    difficulty: 1
  },
  {
    id: "xq-002",
    type: "mangong",
    typeName: "\u95F7\u5BAB",
    title: "\u70AE\u6253\u95F7\u5BAB",
    description: "\u9ED1\u65B9\u53CC\u58EB\u5728\u5E95\u7EBF\u6324\u4F4F\u8001\u5C06\u3002\u7EA2\u70AE\u6C89\u5230\u5E95\u7EBF\uFF0C\u501F\u9ED1\u58EB\u5F53\u70AE\u67B6\u5C06\u519B\uFF0C\u9ED1\u5C06\u65E0\u5904\u53EF\u9003\u3002",
    board: setup([
      ["K", 9, 4],
      ["C", 2, 2],
      ["k", 0, 4],
      ["a", 0, 3],
      ["a", 0, 5]
    ]),
    answer: { from: [2, 2], to: [0, 2] },
    hint: "\u7EA2\u70AE\u4E0B\u5E95\uFF08\u8D70\u5230\u9ED1\u65B9\u5E95\u7EBF\uFF09\uFF0C\u4EE5\u54EA\u4E2A\u9ED1\u5B50\u5F53\u70AE\u67B6\uFF1F",
    difficulty: 1
  },
  {
    id: "xq-003",
    type: "mahoupao",
    typeName: "\u9A6C\u540E\u70AE",
    title: "\u7ECF\u5178\u9A6C\u540E\u70AE",
    description: "\u7EA2\u9A6C\u5DF2\u7ECF\u63A7\u5236\u9ED1\u5C06\uFF0C\u7EA2\u70AE\u8D70\u5230\u9A6C\u7684\u8EAB\u540E\u540C\u7EBF\u5C06\u519B\uFF0C\u5C31\u662F\u8457\u540D\u7684\u9A6C\u540E\u70AE\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["N", 1, 4],
      ["C", 3, 4],
      ["k", 0, 4],
      ["a", 0, 3],
      ["a", 0, 5]
    ]),
    answer: { from: [3, 4], to: [2, 4] },
    hint: "\u7EA2\u9A6C\u5728\u9ED1\u5C06\u6B63\u524D\u65B9\u4E00\u683C\u63A7\u5236\u8001\u5C06\uFF0C\u628A\u70AE\u6CBF\u4E2D\u8DEF\u63A8\u5230\u9A6C\u7684\u8EAB\u540E\u3002",
    difficulty: 1
  },
  {
    id: "xq-004",
    type: "wocao",
    typeName: "\u5367\u69FD\u9A6C",
    title: "\u5367\u69FD\u9A6C\u914D\u8F66",
    description: "\u7EA2\u9A6C\u8DF3\u5367\u69FD\u5C06\u519B\u903C\u9ED1\u5C06\u5347\u8D77\uFF0C\u7EA2\u8F66\u65E9\u5DF2\u5728\u808B\u9053\u7B49\u5019\uFF0C\u8001\u5C06\u4E00\u5347\u5934\u5373\u88AB\u8F66\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 9, 3],
      ["N", 2, 4],
      ["k", 0, 4],
      ["a", 0, 3],
      ["a", 0, 5]
    ]),
    answer: { from: [2, 4], to: [1, 3] },
    hint: "\u9A6C\u8DF3\u5230\u9ED1\u65B9\u4E0B\u4E8C\u8DEF\u58EB\u89D2\uFF08\u5367\u69FD\u4F4D\uFF09\u5C06\u519B\uFF0C\u9ED1\u5C06\u53EA\u80FD\u5347\u8D77\uFF0C\u8F66\u5728\u516D\u8DEF\u7B49\u7740\u5462\u3002",
    difficulty: 1
  },
  {
    id: "xq-005",
    type: "zhongpao",
    typeName: "\u91CD\u70AE",
    title: "\u53CC\u70AE\u53E0\u5C06",
    description: "\u4E24\u95E8\u7EA2\u70AE\u5728\u540C\u4E00\u6761\u7EBF\u4E0A\uFF0C\u524D\u70AE\u5F53\u67B6\u3001\u540E\u70AE\u5C06\u519B\uFF0C\u9ED1\u65B9\u65E0\u5B50\u53EF\u57AB\uFF0C\u91CD\u70AE\u6210\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["C", 8, 4],
      ["C", 7, 4],
      ["k", 0, 4],
      ["a", 0, 3],
      ["a", 0, 5],
      ["r", 0, 0]
    ]),
    answer: { from: [7, 4], to: [1, 4] },
    hint: "\u628A\u540E\u70AE\u6CBF\u4E2D\u8DEF\u4E00\u76F4\u63A8\u5230\u524D\u70AE\u8EAB\u540E\uFF08\u9ED1\u5C06\u9762\u524D\u4E24\u683C\uFF09\uFF0C\u53CC\u70AE\u53E0\u5C06\u3002",
    difficulty: 1
  },
  // ================= 难度 2（杀形稍隐蔽 / 子力多）=================
  {
    id: "xq-006",
    type: "shuangju",
    typeName: "\u53CC\u8F66\u9519",
    title: "\u53CC\u8F66\u4EA4\u66FF",
    description: "\u7EA2\u65B9\u53CC\u8F66\u5206\u636E\u4E24\u7FFC\uFF0C\u9ED1\u5C06\u5728\u808B\u9053\u3002\u5148\u7528\u4E00\u4E2A\u8F66\u5C06\u519B\uFF0C\u903C\u8001\u5C06\u79FB\u4F4D\uFF0C\u518D\u7531\u53E6\u4E00\u8F66\u6210\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 0, 2],
      ["R", 9, 5],
      ["k", 2, 3],
      ["a", 1, 4]
    ]),
    answer: { from: [9, 5], to: [2, 5] },
    hint: "\u56DB\u8DEF\uFF08\u9ED1\u5C06\u53F3\u4FA7\uFF09\u7684\u7EA2\u8F66\u53EF\u4EE5\u76F4\u63A5\u4E0B\u5230\u9ED1\u5C06\u540C\u4E00\u6A2A\u7EBF\u5C06\u519B\uFF0C\u8001\u5C06\u80FD\u5F80\u54EA\u8EB2\uFF1F\u53E6\u4E00\u8F66\u5728\u770B\u7740\u3002",
    difficulty: 2
  },
  {
    id: "xq-007",
    type: "tiemenshuan",
    typeName: "\u94C1\u95E8\u6813",
    title: "\u4E2D\u70AE\u94C1\u95E8\u6813",
    description: "\u7EA2\u70AE\u9547\u4F4F\u4E2D\u8DEF\u62F4\u4F4F\u9ED1\u58EB\uFF0C\u7EA2\u8F66\u76F4\u4E0B\u5C06\u95E8\u808B\u9053\uFF0C\u9ED1\u58EB\u4E0D\u80FD\u52A8\u3001\u8001\u5C06\u4E0D\u80FD\u8EB2\uFF0C\u94C1\u95E8\u6813\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["C", 7, 4],
      ["R", 9, 3],
      ["k", 0, 4],
      ["a", 1, 3],
      ["a", 1, 5]
    ]),
    answer: { from: [9, 3], to: [0, 3] },
    hint: "\u4E2D\u70AE\u9501\u4F4F\u9ED1\u58EB\u4E0D\u80FD\u56DE\u9632\uFF0C\u628A\u516D\u8DEF\u7EA2\u8F66\u4E00\u8DEF\u4E0B\u5230\u9ED1\u65B9\u5E95\u7EBF\u5C06\u519B\u3002",
    difficulty: 2
  },
  {
    id: "xq-008",
    type: "guajiao",
    typeName: "\u6302\u89D2\u9A6C",
    title: "\u9A6C\u6302\u58EB\u89D2",
    description: "\u7EA2\u9A6C\u8DF3\u9ED1\u65B9\u58EB\u89D2\u5C06\u519B\uFF0C\u9ED1\u5C06\u88AB\u903C\u51FA\u5BAB\uFF0C\u7EA2\u8F66\u8FCE\u9762\u4E00\u51FB\u6210\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 9, 5],
      ["N", 2, 4],
      ["k", 0, 4],
      ["a", 0, 3],
      ["a", 1, 5]
    ]),
    answer: { from: [2, 4], to: [1, 5] },
    hint: "\u9A6C\u8DF3\u5230\u9ED1\u65B9\u53F3\u4E0A\u89D2\u58EB\u89D2\uFF08\u56DB\u8DEF\u58EB\u89D2\uFF09\u5C06\u519B\uFF0C\u9ED1\u5C06\u53EA\u80FD\u5F80\u5DE6\u4FA7\u632A\uFF0C\u7EA2\u8F66\u5728\u56DB\u8DEF\u3002",
    difficulty: 2
  },
  {
    id: "xq-009",
    type: "diaoyu",
    typeName: "\u9493\u9C7C\u9A6C",
    title: "\u9493\u9C7C\u9A6C\u914D\u8F66",
    description: "\u7EA2\u9A6C\u5360\u4E09\u4E03\u8DEF\u5BAB\u9876\u7EBF\uFF0C\u94A9\u4F4F\u9ED1\u5C06\u4E24\u4E2A\u843D\u811A\u70B9\uFF0C\u7EA2\u8F66\u8FCE\u9762\u5C06\u519B\uFF0C\u8001\u5C06\u65E0\u5904\u8131\u8EAB\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 8, 5],
      ["N", 2, 3],
      ["k", 0, 4],
      ["a", 0, 3],
      ["a", 0, 5]
    ]),
    answer: { from: [8, 5], to: [0, 5] },
    hint: "\u7EA2\u9A6C\u5DF2\u94A9\u4F4F\u9ED1\u5C06\uFF0C\u56DB\u8DEF\u7EA2\u8F66\u4E0B\u5E95\u5C06\u519B\uFF0C\u9ED1\u5C06\u80FD\u5347\u8D77\u6216\u5DE6\u79FB\u5417\uFF1F\u90FD\u88AB\u9A6C\u63A7\u5236\u4E86\u3002",
    difficulty: 2
  },
  {
    id: "xq-010",
    type: "mahoupao",
    typeName: "\u9A6C\u540E\u70AE",
    title: "\u6A2A\u7EBF\u9A6C\u540E\u70AE",
    description: "\u5B50\u529B\u8F83\u591A\u7684\u6B8B\u5C40\u4E2D\uFF0C\u7EA2\u9A6C\u5728\u6A2A\u7EBF\u63A7\u5236\u9ED1\u5C06\uFF0C\u7EA2\u70AE\u5E73\u5230\u9A6C\u540E\u5C06\u519B\uFF0C\u9700\u5728\u7EB7\u4E71\u4E2D\u627E\u51FA\u6740\u70B9\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 9, 0],
      ["N", 0, 5],
      ["C", 3, 7],
      ["k", 0, 3],
      ["a", 1, 4],
      ["b", 2, 0],
      ["p", 6, 4]
    ]),
    answer: { from: [3, 7], to: [0, 7] },
    hint: "\u7EA2\u9A6C\u5728\u9ED1\u65B9\u5E95\u7EBF\u56DB\u8DEF\u63A7\u5236\u8001\u5C06\uFF0C\u628A\u70AE\u6CBF\u540C\u4E00\u6761\u6A2A\u7EBF\uFF08\u9ED1\u65B9\u5E95\u7EBF\uFF09\u62C9\u5230\u9A6C\u7684\u8EAB\u540E\u5C06\u519B\u3002",
    difficulty: 2
  },
  // ================= 难度 3（弃子 / 唯一解 / 杀点隐蔽）=================
  {
    id: "xq-011",
    type: "dadao",
    typeName: "\u5927\u5200\u525C\u5FC3",
    title: "\u8F66\u780D\u4E2D\u58EB",
    description: "\u9ED1\u65B9\u58EB\u8C61\u5168\u3001\u770B\u4F3C\u7A33\u56FA\u3002\u7EA2\u8F66\u5927\u80C6\u5403\u6389\u4E5D\u5BAB\u4E2D\u5FC3\u7684\u58EB\uFF0C\u525C\u5FC3\u4E00\u51FB\uFF0C\u9ED1\u5C06\u66B4\u9732\u88AB\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 2, 4],
      ["C", 8, 4],
      ["k", 0, 4],
      ["a", 1, 3],
      ["a", 1, 5],
      ["b", 2, 2],
      ["b", 2, 6]
    ]),
    answer: { from: [2, 4], to: [1, 4] },
    hint: "\u9ED1\u65B9\u4E5D\u5BAB\u4E2D\u5FC3\uFF08\u82B1\u5FC3\uFF09\u6709\u4E00\u4E2A\u58EB\uFF0C\u7EA2\u8F66\u6562\u4E0D\u6562\u76F4\u63A5\u5403\u6389\u5B83\uFF1F\u540E\u9762\u8FD8\u6709\u4E2D\u70AE\u3002",
    difficulty: 3
  },
  {
    id: "xq-012",
    type: "qiju",
    typeName: "\u5F03\u8F66\u6740",
    title: "\u5F03\u8F66\u5F15\u738B",
    description: "\u9ED1\u5C06\u8D34\u8EAB\u6709\u8F66\u9632\u5B88\u3002\u7EA2\u65B9\u4E3B\u52A8\u5F03\u8F66\u5C06\u519B\uFF0C\u5F15\u9ED1\u8F66\u79BB\u5F00\u5C06\u95E8\uFF0C\u968F\u540E\u9A6C\u540E\u70AE\u6210\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 3, 3],
      ["N", 1, 4],
      ["C", 5, 4],
      ["k", 0, 4],
      ["a", 0, 3],
      ["a", 0, 5],
      ["r", 2, 4]
    ]),
    answer: { from: [3, 3], to: [0, 3] },
    hint: "\u516D\u8DEF\u7EA2\u8F66\u4E0B\u5E95\u5C06\u519B\uFF0C\u9ED1\u65B9\u552F\u4E00\u80FD\u5E94\u7684\u662F\u7528\u8F66\u5403\u8F66\uFF1B\u5403\u5B8C\u540E\u7EA2\u65B9\u4E2D\u70AE\u63A8\u5230\u9A6C\u540E\u662F\u4EC0\u4E48\u6740\uFF1F",
    difficulty: 3
  },
  {
    id: "xq-013",
    type: "shuangju",
    typeName: "\u53CC\u8F66\u9519",
    title: "\u5E95\u8F66\u4EA4\u9519",
    description: "\u9ED1\u65B9\u58EB\u8C61\u4E0D\u5168\uFF0C\u7EA2\u53CC\u8F66\u5728\u4F4E\u4F4D\u3002\u9700\u9009\u62E9\u6B63\u786E\u7684\u8F66\u548C\u7EBF\u8DEF\uFF0C\u4E00\u6B65\u4EA4\u9519\u6210\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["R", 1, 5],
      ["R", 3, 2],
      ["k", 0, 4],
      ["a", 1, 3],
      ["b", 2, 6]
    ]),
    answer: { from: [3, 2], to: [0, 2] },
    hint: "\u9ED1\u5C06\u5728\u5E95\u7EBF\u4E2D\u8DEF\uFF0C\u53F3\u4FA7\u56DB\u8DEF\u88AB\u7EA2\u8F66\u5C01\u4F4F\u3002\u53E6\u4E00\u8DEF\u7EA2\u8F66\u4E0B\u5230\u9ED1\u65B9\u5E95\u7EBF\u5C06\u519B\uFF0C\u8001\u5C06\u80FD\u5F80\u53F3\u8EB2\u5417\uFF1F",
    difficulty: 3
  },
  {
    id: "xq-014",
    type: "wocao",
    typeName: "\u5367\u69FD\u9A6C",
    title: "\u5367\u69FD\u9A6C\u70AE\u8054\u6740",
    description: "\u7EA2\u9A6C\u5367\u69FD\u5C06\u519B\uFF0C\u9ED1\u65B9\u770B\u4F3C\u53EF\u57AB\u5C06\u3001\u53EF\u79FB\u5C06\uFF0C\u4F46\u7EA2\u70AE\u5728\u808B\u9053\u5C01\u6B7B\u6240\u6709\u9000\u8DEF\uFF0C\u4E00\u6B65\u6210\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["N", 2, 4],
      ["C", 9, 3],
      ["k", 0, 4],
      ["a", 0, 3],
      ["a", 1, 5],
      ["r", 0, 0]
    ]),
    answer: { from: [2, 4], to: [1, 3] },
    hint: "\u9A6C\u8DF3\u516D\u8DEF\u5367\u69FD\u5C06\u519B\uFF0C\u9ED1\u5C06\u5347\u8D77\u540E\uFF0C\u516D\u8DEF\u70AE\uFF08\u540C\u5217\uFF09\u662F\u4E0D\u662F\u6B63\u597D\u5C06\u519B\uFF1F",
    difficulty: 3
  },
  {
    id: "xq-015",
    type: "mangong",
    typeName: "\u95F7\u5BAB",
    title: "\u8C61\u4F4D\u95F7\u5BAB",
    description: "\u9ED1\u58EB\u8C61\u56DE\u9632\u770B\u4F3C\u5B89\u5168\uFF0C\u7EA2\u70AE\u501F\u9ED1\u8C61\u5F53\u70AE\u67B6\u5728\u5E95\u7EBF\u5C06\u519B\uFF0C\u9ED1\u5C06\u88AB\u81EA\u5DF1\u7684\u5B50\u529B\u95F7\u6740\u3002",
    board: setup([
      ["K", 9, 4],
      ["C", 3, 0],
      ["k", 0, 4],
      ["a", 1, 3],
      ["a", 1, 5],
      ["b", 0, 2]
    ]),
    answer: { from: [3, 0], to: [0, 0] },
    hint: "\u9ED1\u65B9\u5E95\u7EBF\u6709\u4E00\u53EA\u8C61\u5728\u8FB9\u8DEF\uFF0C\u7EA2\u70AE\u6C89\u5230\u5E95\u7EBF\uFF0C\u4EE5\u8FD9\u53EA\u8C61\u4E3A\u70AE\u67B6\u6A2A\u7EBF\u5C06\u519B\u3002",
    difficulty: 3
  }
];

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
function isXiangqiMoveLegal(board, from, to, color) {
  const legalMoves = getAllXiangqiLegalMoves(board, color);
  return legalMoves.some(
    (m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]
  );
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

// scripts/verify_xiangqi_puzzles.ts
var pass = 0;
var fail = 0;
for (const p of XIANGQI_PUZZLES) {
  const errors = [];
  const [fr, fc] = p.answer.from;
  const [tr, tc] = p.answer.to;
  const piece = p.board[fr][fc];
  if (!piece || piece !== piece.toUpperCase()) {
    errors.push(`\u8D77\u70B9 [${fr},${fc}] \u4E0D\u662F\u7EA2\u5B50\uFF08\u5B9E\u9645 '${piece}'\uFF09`);
  }
  if (piece && piece === piece.toUpperCase()) {
    if (!isXiangqiMoveLegal(p.board, p.answer.from, p.answer.to, "r")) {
      errors.push("\u7B54\u6848\u7740\u6CD5\u4E0D\u5408\u6CD5");
    }
  }
  if (errors.length === 0) {
    const { board: nb } = applyXiangqiMove(p.board, p.answer.from, p.answer.to);
    const status = getXiangqiGameStatus(nb, "b");
    const inCheck = isXiangqiInCheck(nb, "b");
    const blackMoves = getAllXiangqiLegalMoves(nb, "b");
    if (status !== "checkmate") {
      errors.push(`\u8D70\u540E\u4E0D\u662F\u5C06\u6B7B\uFF08status=${status}, inCheck=${inCheck}, \u9ED1\u65B9\u5408\u6CD5\u7740\u6CD5=${blackMoves.length}\uFF09`);
      if (blackMoves.length > 0) {
        const sample = blackMoves.slice(0, 6).map((m) => {
          const pc = nb[m.from[0]][m.from[1]];
          return `${pc}${m.from}->${m.to}`;
        });
        errors.push(`  \u9ED1\u65B9\u53EF\u5E94\uFF1A${sample.join(", ")}`);
      }
    }
  }
  const notation = piece ? getXiangqiMoveNotation(piece, p.answer.from, p.answer.to, p.board[tr][tc] || void 0) : "?";
  if (errors.length === 0) {
    pass++;
    console.log(`\u2705 ${p.id} [\u96BE\u5EA6${p.difficulty}] ${p.typeName}\u300C${p.title}\u300D ${notation}`);
  } else {
    fail++;
    console.log(`\u274C ${p.id} [\u96BE\u5EA6${p.difficulty}] ${p.typeName}\u300C${p.title}\u300D ${notation}`);
    errors.forEach((e) => console.log(`     - ${e}`));
  }
}
console.log(`
\u7ED3\u679C\uFF1A${pass} \u901A\u8FC7 / ${fail} \u5931\u8D25\uFF0C\u5171 ${XIANGQI_PUZZLES.length} \u9898`);
if (fail > 0) process.exit(1);
