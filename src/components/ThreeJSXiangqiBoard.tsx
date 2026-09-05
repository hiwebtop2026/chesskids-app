/**
 * ChessKids - Three.js 3D 中国象棋棋盘
 * 立体鼓型棋子 + 阴文雕刻汉字 + 经典木纹棋盘
 * 复用国际象棋 3D 棋盘架构（CDN Three.js、PBR、阴影、Raycaster）
 *
 * 坐标体系（与 2D 版统一）：
 *   col 0-8 (9条竖线, 8格宽), row 0-9 (10条横线, 9格高)
 *   row 0 = 黑方底线(远), row 9 = 红方底线(近)
 *   世界坐标: x = (col - 4) * CELL, z = (row - 4.5) * CELL
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type {
  XiangqiBoard,
  XiangqiSquare,
} from '../types/xiangqi';
import { XIANGQI_PIECE_CHARS } from '../types/xiangqi';
import { isXiangqiRed } from '../engine/xiangqi';

// ============ 棋盘几何常量（单一数据源）============
const CELL = 1.0;                 // 一格的长度
const COLS = 9;                   // 竖线数
const ROWS = 10;                  // 横线数
const GRID_W = (COLS - 1) * CELL; // 网格区宽 = 8
const GRID_D = (ROWS - 1) * CELL; // 网格区深 = 9
const BOARD_MARGIN = 0.8;         // 棋盘边框宽度
const BOARD_W = GRID_W + BOARD_MARGIN * 2;
const BOARD_D = GRID_D + BOARD_MARGIN * 2;
const BOARD_HEIGHT = 0.22;        // 棋盘厚度

// 棋子尺寸（传统鼓型）：直径 = 格距的 80%，高度约为直径的 40%（厚实圆木棋）
const PIECE_RADIUS = CELL * 0.4;    // 0.4
const PIECE_HEIGHT = PIECE_RADIUS * 0.8; // 0.32 鼓形实木比例

// 颜色（红黑双方棋身区分：红方朱红漆木 / 黑方墨黑漆木，白字阴刻高对比）
const SIDE_COLORS = {
  r: {
    body: 0xB5402A,        // 棋身：朱红漆木
    faceLight: '#D96A4F',  // 顶面中心：亮朱红
    faceDark: '#8E2B18',   // 顶面边缘：深枣红
    char: '#FFFFFF',       // 阴刻字：纯白（高对比）
    groove: 'rgba(60,12,5,0.6)', // 刻槽阴影
  },
  b: {
    body: 0x2B2723,        // 棋身：墨黑漆木
    faceLight: '#4A443C',  // 顶面中心：深褐亮面
    faceDark: '#1B1815',   // 顶面边缘：近黑
    char: '#FFFFFF',       // 阴刻字：纯白（高对比）
    groove: 'rgba(0,0,0,0.65)', // 刻槽阴影
  },
} as const;
const LINE_COLOR = '#3E2410';     // 棋盘线格颜色

// ============ 辅助：交叉点 → 世界坐标 ============
const squareToWorld = (row: number, col: number): [number, number] => {
  const x = (col - (COLS - 1) / 2) * CELL;
  const z = (row - (ROWS - 1) / 2) * CELL;
  return [x, z];
};

// ============ 相机自动取景：按容器宽高比调整距离，完整显示棋盘与棋子 ============
const fitCameraToBoard = (camera: THREE.PerspectiveCamera, width: number, height: number) => {
  const T = THREE as any;
  const cam = camera as any;
  cam.aspect = width / height;

  // 棋盘包围盒 8 角点（含边框、棋子高度与外围余量）
  const halfW = BOARD_W / 2 + PIECE_RADIUS * 0.6;
  const halfD = BOARD_D / 2 + PIECE_RADIUS * 0.6;
  const yTop = BOARD_HEIGHT + PIECE_HEIGHT;
  const corners: any[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    corners.push(new T.Vector3(sx * halfW, 0, sz * halfD));
    corners.push(new T.Vector3(sx * halfW, yTop, sz * halfD));
  }
  const target = new T.Vector3(0, 0.15, 0);
  // 观察方向固定（红方斜俯视），仅迭代调整距离
  const viewDir = new T.Vector3(0, 11, 9.8).normalize();

  const pad = 1.16; // 四周留白
  let dist = 13;
  for (let i = 0; i < 3; i++) {
    cam.position.copy(target).addScaledVector(viewDir, dist);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    let maxNdc = 0;
    for (const c of corners) {
      const p = c.clone().project(cam);
      maxNdc = Math.max(maxNdc, Math.abs(p.x), Math.abs(p.y));
    }
    dist *= maxNdc * pad; // NDC 超出量 ∝ 1/距离，按比例拉远
  }
};

// ============ 程序化木纹纹理 ============
const createWoodTexture = (
  baseColor: string,
  width = 1024,
  height = 1024,
): any => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 基础木色渐变
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, baseColor);
  grad.addColorStop(0.5, shade(baseColor, 8));
  grad.addColorStop(1, baseColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 木纹纹理线条（水平走向，模拟年轮）
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * height;
    const w = Math.random() * 3 + 0.5;
    const alpha = Math.random() * 0.12 + 0.03;
    ctx.strokeStyle = `rgba(60, 30, 10, ${alpha})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // 微微弯曲的木纹线
    const cp1x = width * 0.3;
    const cp1y = y + (Math.random() - 0.5) * 30;
    const cp2x = width * 0.7;
    const cp2y = y + (Math.random() - 0.5) * 30;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, width, y + (Math.random() - 0.5) * 20);
    ctx.stroke();
  }

  // 细微色差噪点
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    data[i] = clamp(data[i] + n);
    data[i + 1] = clamp(data[i + 1] + n * 0.8);
    data[i + 2] = clamp(data[i + 2] + n * 0.6);
  }
  ctx.putImageData(imgData, 0, 0);

  // 几个节疤
  for (let k = 0; k < 4; k++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const r = Math.random() * 22 + 10;
    const knot = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    knot.addColorStop(0, 'rgba(70, 35, 10, 0.35)');
    knot.addColorStop(1, 'rgba(70, 35, 10, 0)');
    ctx.fillStyle = knot;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new (THREE as any).CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = (THREE as any).RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

// 颜色加深/变亮
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(r + amt); g = clamp(g + amt); b = clamp(b + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
function clamp(v: number): number { return Math.max(0, Math.min(255, Math.round(v))); }

// ============ 棋盘顶面纹理（木纹 + 线格 + 河界 + 标记）============
const createBoardTopTexture = (): any => {
  const W = 1024, H = 1152; // 8:9 比例
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 木纹底
  ctx.fillStyle = '#D9B377';
  ctx.fillRect(0, 0, W, H);
  // 叠加木纹
  for (let i = 0; i < 180; i++) {
    const y = Math.random() * H;
    ctx.strokeStyle = `rgba(90, 50, 15, ${Math.random() * 0.10 + 0.02})`;
    ctx.lineWidth = Math.random() * 2.5 + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(W * 0.3, y + (Math.random() - 0.5) * 24, W * 0.7, y + (Math.random() - 0.5) * 24, W, y + (Math.random() - 0.5) * 16);
    ctx.stroke();
  }
  // 整体罩一层暖木色
  ctx.fillStyle = 'rgba(180, 120, 50, 0.12)';
  ctx.fillRect(0, 0, W, H);

  // 坐标换算：网格区占满整个平面（与棋子世界坐标严格对齐）
  // 棋子位于 (col-4)*CELL, (row-4.5)*CELL，故网格交叉点必须占满平面
  const margin = 0.0; // 0 边距，网格线与平面边缘重合，边框由外框提供
  const gx = (c: number) => (margin + (c / (COLS - 1)) * (1 - margin * 2)) * W;
  const gy = (r: number) => (margin + (r / (ROWS - 1)) * (1 - margin * 2)) * H;

  ctx.strokeStyle = LINE_COLOR;
  ctx.lineCap = 'round';

  // 横线 10 条
  for (let r = 0; r < ROWS; r++) {
    ctx.lineWidth = r === 0 || r === ROWS - 1 ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(gx(0), gy(r));
    ctx.lineTo(gx(COLS - 1), gy(r));
    ctx.stroke();
  }

  // 竖线 9 条（中间在河界断开）
  for (let c = 0; c < COLS; c++) {
    ctx.lineWidth = c === 0 || c === COLS - 1 ? 5 : 3;
    if (c === 0 || c === COLS - 1) {
      ctx.beginPath();
      ctx.moveTo(gx(c), gy(0));
      ctx.lineTo(gx(c), gy(ROWS - 1));
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(gx(c), gy(0));
      ctx.lineTo(gx(c), gy(4));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx(c), gy(5));
      ctx.lineTo(gx(c), gy(ROWS - 1));
      ctx.stroke();
    }
  }

  // 九宫斜线
  ctx.lineWidth = 3;
  // 黑方九宫（上）: (3,0)-(5,2), (5,0)-(3,2)
  ctx.beginPath(); ctx.moveTo(gx(3), gy(0)); ctx.lineTo(gx(5), gy(2)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gx(5), gy(0)); ctx.lineTo(gx(3), gy(2)); ctx.stroke();
  // 红方九宫（下）: (3,7)-(5,9), (5,7)-(3,9)
  ctx.beginPath(); ctx.moveTo(gx(3), gy(7)); ctx.lineTo(gx(5), gy(9)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gx(5), gy(7)); ctx.lineTo(gx(3), gy(9)); ctx.stroke();

  // 河界文字
  ctx.fillStyle = LINE_COLOR;
  ctx.font = `bold ${Math.round(H * 0.045)}px "KaiTi", "STKaiti", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const riverY = (gy(4) + gy(5)) / 2;
  ctx.fillText('楚  河', gx(2), riverY);
  ctx.fillText('漢  界', gx(6), riverY);

  // 炮位 / 兵卒位小直角标记
  const markerPts: XiangqiSquare[] = [
    [2, 1], [2, 7], [7, 1], [7, 7],
    [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
    [6, 0], [6, 2], [6, 4], [6, 6], [6, 8],
  ];
  const mGap = W * 0.012;
  const mLen = W * 0.026;
  ctx.lineWidth = 2.5;
  markerPts.forEach(([r, c]) => {
    const cx = gx(c), cy = gy(r);
    const drawCorner = (sx: number, sy: number) => {
      const x0 = cx + sx * mGap, y0 = cy + sy * mGap;
      const x1 = cx + sx * (mGap + mLen), y1 = cy + sy * (mGap + mLen);
      ctx.beginPath();
      ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0);
      ctx.stroke();
    };
    if (c > 0) { drawCorner(-1, -1); drawCorner(-1, 1); }
    if (c < COLS - 1) { drawCorner(1, -1); drawCorner(1, 1); }
  });

  const tex = new (THREE as any).CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

// ============ 棋身漆木纹理（侧面：Lathe UV 的 U=环绕 V=高度）============
const createPieceSideTextures = (baseHex: number): { map: any; bump: any } => {
  const w = 512, h = 256;
  const base = '#' + baseHex.toString(16).padStart(6, '0');
  const dark = shade(base, -34);
  const light = shade(base, 26);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 木纹：沿高度方向的波浪条纹（深色）
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * w;
    ctx.strokeStyle = `rgba(${hexRGB(dark)}, ${Math.random() * 0.22 + 0.05})`;
    ctx.lineWidth = Math.random() * 3 + 0.6;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 26, h * 0.33,
      x + (Math.random() - 0.5) * 26, h * 0.66,
      x + (Math.random() - 0.5) * 18, h + 10,
    );
    ctx.stroke();
  }
  // 少量亮色高光纹
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * w;
    ctx.strokeStyle = `rgba(${hexRGB(light)}, ${Math.random() * 0.14 + 0.04})`;
    ctx.lineWidth = Math.random() * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 20, h * 0.33,
      x + (Math.random() - 0.5) * 20, h * 0.66,
      x + (Math.random() - 0.5) * 14, h + 10,
    );
    ctx.stroke();
  }
  // 颗粒噪点
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] = clamp(img.data[i] + n);
    img.data[i + 1] = clamp(img.data[i + 1] + n);
    img.data[i + 2] = clamp(img.data[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);

  // bump 贴图：灰度木纹（条纹处凹陷/凸起）
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w; bumpCanvas.height = h;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * w;
    bctx.strokeStyle = `rgba(40,40,40,${Math.random() * 0.35 + 0.08})`;
    bctx.lineWidth = Math.random() * 3 + 0.6;
    bctx.beginPath();
    bctx.moveTo(x, -10);
    bctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 26, h * 0.33,
      x + (Math.random() - 0.5) * 26, h * 0.66,
      x + (Math.random() - 0.5) * 18, h + 10,
    );
    bctx.stroke();
  }

  const map = new (THREE as any).CanvasTexture(canvas);
  map.wrapS = map.wrapT = (THREE as any).RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new (THREE as any).CanvasTexture(bumpCanvas);
  bump.wrapS = bump.wrapT = (THREE as any).RepeatWrapping;
  bump.colorSpace = (THREE as any).NoColorSpace;
  bump.anisotropy = 8;
  return { map, bump };
};

// hex → "r,g,b"
function hexRGB(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// ============ 阴文雕刻纹理（汉字 + 顶面环槽 + 年轮）============
const createEngravedCharTexture = (
  char: string,
  charColor: string,
  bgTop: string,
  bgBottom: string,
  grooveColor: string,
): { displacement: any; bump: any; map: any } => {
  const size = 1024;
  const cx = size / 2;
  const cy = size / 2;
  const ringR = size * 0.39;   // 阴刻圆环半径（UV 空间 0.78）
  const ringW = size * 0.014;  // 环槽宽度
  const fontSize = Math.round(size * 0.62);
  const font = `bold ${fontSize}px "KaiTi", "STKaiti", "SimSun", serif`;

  // ---- displacement / bump：白底，黑字 + 黑环 = 凹陷处 ----
  const dispCanvas = document.createElement('canvas');
  dispCanvas.width = dispCanvas.height = size;
  const dctx = dispCanvas.getContext('2d')!;
  dctx.fillStyle = '#ffffff';
  dctx.fillRect(0, 0, size, size);
  dctx.fillStyle = '#000000';
  // 阴刻圆环槽
  dctx.lineWidth = ringW;
  dctx.beginPath();
  dctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  dctx.stroke();
  // 阴刻汉字
  dctx.font = font;
  dctx.textAlign = 'center';
  dctx.textBaseline = 'middle';
  dctx.fillText(char, cx, cy + size * 0.02);
  // 极浅年轮环（凹凸细微，仅作木质触感）
  dctx.strokeStyle = 'rgba(150,150,150,0.5)';
  for (let i = 1; i <= 7; i++) {
    dctx.lineWidth = size * 0.006;
    dctx.beginPath();
    dctx.arc(cx, cy, size * 0.065 * i, 0, Math.PI * 2);
    dctx.stroke();
  }

  // 轻微模糊 → 刻痕边缘形成斜面，更真实地捕捉光影
  const blurred = document.createElement('canvas');
  blurred.width = blurred.height = size;
  const bctx = blurred.getContext('2d')!;
  bctx.filter = 'blur(2.5px)';
  bctx.drawImage(dispCanvas, 0, 0);

  const displacement = new (THREE as any).CanvasTexture(blurred);
  displacement.colorSpace = (THREE as any).NoColorSpace;
  displacement.anisotropy = 8;

  const bump = new (THREE as any).CanvasTexture(dispCanvas);
  bump.colorSpace = (THREE as any).NoColorSpace;
  bump.anisotropy = 8;

  // ---- color map：木色底面 + 凹槽阴影 + 红/黑字 ----
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d')!;
  const bgGrad = cctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.55);
  bgGrad.addColorStop(0, bgTop);
  bgGrad.addColorStop(1, bgBottom);
  cctx.fillStyle = bgGrad;
  cctx.fillRect(0, 0, size, size);
  // 年轮：横截面同心环（微弱，漆木质感）
  for (let i = 1; i <= 9; i++) {
    const rr = size * 0.06 * i + (Math.random() - 0.5) * size * 0.012;
    cctx.strokeStyle = i % 2 === 0
      ? `rgba(${hexRGB(bgBottom)},0.10)`
      : `rgba(255,255,255,0.06)`;
    cctx.lineWidth = size * 0.008 + Math.random() * size * 0.006;
    cctx.beginPath();
    cctx.arc(cx + (Math.random() - 0.5) * 6, cy + (Math.random() - 0.5) * 6, rr, 0, Math.PI * 2);
    cctx.stroke();
  }
  // 环槽阴影色（模拟刻槽里的暗部）
  cctx.strokeStyle = grooveColor;
  cctx.lineWidth = ringW * 1.4;
  cctx.beginPath();
  cctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  cctx.stroke();
  // 汉字
  cctx.fillStyle = charColor;
  cctx.font = font;
  cctx.textAlign = 'center';
  cctx.textBaseline = 'middle';
  cctx.fillText(char, cx, cy + size * 0.02);

  const map = new (THREE as any).CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  return { displacement, bump, map };
};

// ============ 鼓型棋子几何体 ============
// 参考传统实木象棋：底/顶面平，缘部大圆角过渡，侧面外凸成鼓肚
const createDrumProfile = (): THREE.Vector2[] => {
  const R = PIECE_RADIUS;
  const H = PIECE_HEIGHT;
  const f = R * 0.18;       // 缘部圆角半径（顶面平坦区半径 = R-f）
  const bulge = R * 0.05;   // 鼓肚外凸量
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(R - f, 0),
  ];
  // 底缘圆角：四分之一圆弧，从底平面过渡到鼓身
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let i = 1; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  };
  arc(R - f, f, f, -Math.PI / 2, 0, 6);
  // 鼓肚：二次贝塞尔外凸，腰部最宽
  const p0 = new THREE.Vector2(R, f);
  const pc = new THREE.Vector2(R + bulge, H / 2);
  const p1 = new THREE.Vector2(R, H - f);
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const mt = 1 - t;
    pts.push(new THREE.Vector2(
      mt * mt * p0.x + 2 * mt * t * pc.x + t * t * p1.x,
      mt * mt * p0.y + 2 * mt * t * pc.y + t * t * p1.y,
    ));
  }
  // 顶缘圆角：从鼓身过渡到顶平面（轮廓止于外缘，顶面由阴刻面片覆盖，
  // 避免实体顶盖遮挡凹陷字槽）
  arc(R - f, H - f, f, 0, Math.PI / 2, 6);
  return pts;
};

// 棋子模板缓存
const pieceCache = new Map<string, THREE.Group>();
const sideTexCache = new Map<number, { map: any; bump: any }>();
const getSideTextures = (bodyColor: number) => {
  let t = sideTexCache.get(bodyColor);
  if (!t) {
    t = createPieceSideTextures(bodyColor);
    sideTexCache.set(bodyColor, t);
  }
  return t;
};

const createPieceMesh = (piece: string): THREE.Group => {
  const cacheKey = piece;
  const cached = pieceCache.get(cacheKey);
  if (cached) return (cached as any).clone(true);

  const group = new THREE.Group();
  const isRed = isXiangqiRed(piece);
  const pal = SIDE_COLORS[isRed ? 'r' : 'b'];   // 双方配色
  const char = XIANGQI_PIECE_CHARS[piece] || piece;

  const T = THREE as any;

  // 漆木鼓身（红方朱红 / 黑方墨黑）：木纹贴图 + 凹凸，微清漆质感
  const sideTex = getSideTextures(pal.body);
  const bodyMat = new T.MeshPhysicalMaterial({
    color: 0xffffff,
    map: sideTex.map,
    bumpMap: sideTex.bump,
    bumpScale: 0.012,
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.65,
    clearcoatRoughness: 0.28,
  });

  // 鼓型主体（单层实木鼓状）
  const profile = createDrumProfile();
  const bodyGeo = new THREE.LatheGeometry(profile, 96);
  (bodyGeo as any).computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 顶面阴刻（汉字 + 环槽）：RingGeometry 带径向细分，位移贴图才能真正凹陷成形
  const { displacement, bump, map } = createEngravedCharTexture(
    char,
    pal.char,
    pal.faceLight,
    pal.faceDark,
    pal.groove,
  );
  const topRadius = PIECE_RADIUS * 0.83; // 覆盖平顶并微叠鼓身缘口
  const topGeo = new T.RingGeometry(0.001, topRadius, 128, 48);
  const dispScale = PIECE_HEIGHT * 0.22; // 刻槽深度 ≈ 棋子高度的 22%（白字受光更亮）
  const topMat = new T.MeshPhysicalMaterial({
    map,
    displacementMap: displacement,
    displacementScale: dispScale,
    displacementBias: -dispScale, // 白底（棋面）贴平 y=H，黑字/黑环向下凹陷
    bumpMap: bump,
    bumpScale: 0.04,
    roughness: 0.38,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
    side: T.DoubleSide, // 凹槽内壁也要渲染
  });
  const topFace = new THREE.Mesh(topGeo, topMat);
  topFace.rotation.x = -Math.PI / 2; // 法线朝上
  topFace.position.y = PIECE_HEIGHT + 0.001; // 贴合平顶
  topFace.receiveShadow = true;
  group.add(topFace);

  // 黑方棋子文字朝向黑方视角：从红方看黑方棋子文字倒置（传统象棋规范）
  if (!isRed) group.rotation.y = Math.PI;

  pieceCache.set(cacheKey, group);
  return group;
};

// ============ 组件 Props ============
export interface ThreeJSXiangqiBoardProps {
  board: XiangqiBoard;
  selectedSquare: XiangqiSquare | null;
  legalTargets: XiangqiSquare[];
  lastMove: { from: XiangqiSquare; to: XiangqiSquare } | null;
  checkSquare: XiangqiSquare | null;
  hint: XiangqiSquare[] | null;
  onSquareClick: (row: number, col: number) => void;
  readOnly?: boolean;
}

export const ThreeJSXiangqiBoard: React.FC<ThreeJSXiangqiBoardProps> = ({
  board,
  selectedSquare,
  legalTargets,
  lastMove,
  checkSquare,
  hint,
  onSquareClick,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const piecesGroupRef = useRef<THREE.Group | null>(null);
  const highlightsGroupRef = useRef<THREE.Group | null>(null);
  const boardSurfaceRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseRef = useRef<THREE.Vector2 | null>(null);
  const needsRenderRef = useRef(true);
  const onSquareClickRef = useRef(onSquareClick);
  const readOnlyRef = useRef(readOnly);
  const hoveredRef = useRef<THREE.Object3D | null>(null);
  const clockRef = useRef(new (THREE as any).Clock());

  // 始终保持 ref 最新（避免初始化 effect 闭包捕获过期的 readOnly）
  useEffect(() => {
    onSquareClickRef.current = onSquareClick;
    readOnlyRef.current = readOnly;
  });

  // ---- 初始化场景 ----
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xB8A888);
    scene.fog = new THREE.Fog(0xB8A888, 30, 60);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    // 红方斜俯视，距离按容器宽高比自动取景（完整显示棋盘与棋子）
    fitCameraToBoard(camera, width, height);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true,
    });
    (renderer as any).autoClear = true;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = (THREE as any).PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 环境反射贴图
    const pmrem = new (THREE as any).PMREMGenerator(renderer);
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512; envCanvas.height = 256;
    const ectx = envCanvas.getContext('2d')!;
    const eg = ectx.createLinearGradient(0, 0, 0, 256);
    eg.addColorStop(0, '#fff8ee');
    eg.addColorStop(0.3, '#f0e0c8');
    eg.addColorStop(0.6, '#c8a878');
    eg.addColorStop(1.0, '#6b4a2a');
    ectx.fillStyle = eg;
    ectx.fillRect(0, 0, 512, 256);
    const envTex = new (THREE as any).CanvasTexture(envCanvas);
    envTex.mapping = 3;
    envTex.needsUpdate = true;
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
    pmrem.dispose();

    // 光照
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const hemi = new THREE.HemisphereLight(0xfff2dd, 0x5a3a1a, 0.5);
    hemi.position.set(0, 10, 0);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff0d8, 1.7);
    key.position.set(7, 13, 6);
    key.castShadow = true;
    (key.shadow.mapSize as any).set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xd8e8ff, 0.5);
    fill.position.set(-6, 8, -4);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffe8c0, 0.6);
    rim.position.set(0, 6, -8);
    scene.add(rim);

    // ---- 棋盘 ----
    const boardGroup = new THREE.Group();

    // 外框（深木色）
    const frameGeo = new THREE.BoxGeometry(BOARD_W, BOARD_HEIGHT, BOARD_D);
    const frameMat = new THREE.MeshStandardMaterial({
      map: createWoodTexture('#7A4A22'),
      roughness: 0.6,
      metalness: 0.0,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 0;
    frame.receiveShadow = true;
    frame.castShadow = true;
    boardGroup.add(frame);

    // 顶面（木纹 + 线格烘焙纹理）
    const topTex = createBoardTopTexture();
    const topGeo = new THREE.PlaneGeometry(GRID_W, GRID_D);
    const topMat = new THREE.MeshStandardMaterial({
      map: topTex,
      roughness: 0.55,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const topSurface = new THREE.Mesh(topGeo, topMat);
    topSurface.rotation.x = -Math.PI / 2;
    topSurface.position.y = BOARD_HEIGHT / 2 + 0.002;
    topSurface.receiveShadow = true;
    topSurface.userData = { isBoard: true };
    boardGroup.add(topSurface);
    boardSurfaceRef.current = topSurface;

    scene.add(boardGroup);

    // 棋子组
    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);
    piecesGroupRef.current = piecesGroup;

    // 高亮组
    const highlightsGroup = new THREE.Group();
    scene.add(highlightsGroup);
    highlightsGroupRef.current = highlightsGroup;

    // 地面阴影接收
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -BOARD_HEIGHT / 2 - 0.001;
    ground.receiveShadow = true;
    scene.add(ground);

    sceneRef.current = scene;
    raycasterRef.current = new THREE.Raycaster();
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // ---- 渲染循环（按需 + 悬停动画）----
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const t = clockRef.current.getElapsedTime();
      let need = needsRenderRef.current;

      // 选中棋子的上下浮动 + 将军脉冲
      piecesGroup.children.forEach((child) => {
        const g = child as THREE.Group;
        if (g.userData.selected) {
          g.position.y = BOARD_HEIGHT / 2 + 0.06 + Math.sin(t * 3) * 0.04;
          need = true;
        }
        if (g.userData.check) {
          const pulse = 1 + Math.sin(t * 6) * 0.12;
          (g.scale as any).setScalar(pulse);
          need = true;
        } else {
          (g.scale as any).setScalar(1);
        }
      });
      // 合法走法点呼吸
      highlightsGroup.children.forEach((h) => {
        if (h.userData.breathing) {
          const s = 1 + Math.sin(t * 4) * 0.25;
          (h.scale as any).setScalar(s);
          need = true;
        }
      });

      if (need) {
        renderer.render(scene, camera);
        needsRenderRef.current = false;
      }
    };
    const animationFrameRef = { current: 0 as number } as any;
    animate();

    // ---- 事件 ----
    const onResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      fitCameraToBoard(cameraRef.current, w, h); // 重新取景，保证棋盘完整显示
      rendererRef.current.setSize(w, h);
      needsRenderRef.current = true;
    };
    window.addEventListener('resize', onResize);

    const setMouse = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    const onPointerMove = (e: MouseEvent) => {
      setMouse(e);
      handleHover();
    };

    const onPointerClick = (e: MouseEvent) => {
      if (readOnlyRef.current) return;
      setMouse(e);
      handleClick();
    };

    // 绑定到容器（canvas 的父级），保证点击总能被接收
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerdown', onPointerClick);

    // 清理
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('resize', onResize);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerdown', onPointerClick);
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 悬停处理 ----
  const handleHover = () => {
    if (!raycasterRef.current || !cameraRef.current || !piecesGroupRef.current || !mouseRef.current) return;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const hits = raycasterRef.current.intersectObjects(piecesGroupRef.current.children, true);
    let target: THREE.Object3D | null = null;
    if (hits.length > 0) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && o.parent !== piecesGroupRef.current) o = o.parent;
      target = o;
    }
    if (target !== hoveredRef.current) {
      // 恢复旧的
      if (hoveredRef.current && !hoveredRef.current.userData.selected) {
        hoveredRef.current.position.y = BOARD_HEIGHT / 2;
      }
      hoveredRef.current = target;
      if (target && !target.userData.selected) {
        target.position.y = BOARD_HEIGHT / 2 + 0.12;
      }
      needsRenderRef.current = true;
    }
  };

  // ---- 点击处理 ----
  const handleClick = () => {
    if (!raycasterRef.current || !cameraRef.current || !piecesGroupRef.current || !mouseRef.current) return;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    // 先检测棋子
    const pieceHits = raycasterRef.current.intersectObjects(piecesGroupRef.current.children, true);
    if (pieceHits.length > 0) {
      let o: THREE.Object3D | null = pieceHits[0].object;
      while (o && o.parent !== piecesGroupRef.current) o = o.parent;
      if (o && o.userData.row !== undefined) {
        onSquareClickRef.current(o.userData.row, o.userData.col);
        return;
      }
    }

    // 再检测棋盘表面，计算最近交叉点
    if (boardSurfaceRef.current) {
      const boardHits = raycasterRef.current.intersectObjects([boardSurfaceRef.current], false);
      if (boardHits.length > 0) {
        const p = boardHits[0].point;
        const col = Math.round(p.x / CELL + (COLS - 1) / 2);
        const row = Math.round(p.z / CELL + (ROWS - 1) / 2);
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
          onSquareClickRef.current(row, col);
        }
      }
    }
  };

  // ---- 更新棋子 ----
  useEffect(() => {
    if (!piecesGroupRef.current) return;
    const group = piecesGroupRef.current;
    // 清空旧棋子
    while (group.children.length) group.remove(group.children[0]);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        const mesh = createPieceMesh(piece);
        const [x, z] = squareToWorld(r, c);
        mesh.position.set(x, BOARD_HEIGHT / 2, z);
        mesh.userData = { row: r, col: c, piece };
        mesh.castShadow = true;
        group.add(mesh);
      }
    }
    needsRenderRef.current = true;
  }, [board]);

  // ---- 更新高亮/选中状态 ----
  useEffect(() => {
    if (!piecesGroupRef.current) return;
    const group = piecesGroupRef.current;
    group.children.forEach((g) => {
      const u = g.userData;
      u.selected = !!(selectedSquare && selectedSquare[0] === u.row && selectedSquare[1] === u.col);
      u.check = !!(checkSquare && checkSquare[0] === u.row && checkSquare[1] === u.col);
      if (!u.selected && g !== hoveredRef.current) {
        g.position.y = BOARD_HEIGHT / 2;
      }
    });
    needsRenderRef.current = true;
  }, [selectedSquare, checkSquare]);

  // ---- 更新合法走法/上一步/hint 高亮 ----
  useEffect(() => {
    if (!highlightsGroupRef.current) return;
    const hg = highlightsGroupRef.current;
    while (hg.children.length) hg.remove(hg.children[0]);

    const T = THREE as any;
    const baseY = BOARD_HEIGHT / 2 + 0.02;

    // 合法走法
    legalTargets.forEach(([r, c]) => {
      const [x, z] = squareToWorld(r, c);
      const isCapture = board[r] && board[r][c];
      if (isCapture) {
        // 吃子：红色环
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(PIECE_RADIUS * 0.85, 0.02, 12, 32),
          new T.MeshBasicMaterial({ color: 0xEF5350, transparent: true, opacity: 0.85 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, baseY, z);
        ring.userData = { breathing: true };
        hg.add(ring);
      } else {
        // 空位：绿色点
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 16, 12),
          new T.MeshBasicMaterial({ color: 0x66BB6A, transparent: true, opacity: 0.8 }),
        );
        dot.position.set(x, baseY + 0.05, z);
        dot.userData = { breathing: true };
        hg.add(dot);
      }
    });

    // 上一步
    if (lastMove) {
      [lastMove.from, lastMove.to].forEach(([r, c]) => {
        const [x, z] = squareToWorld(r, c);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(PIECE_RADIUS * 0.7, 0.018, 12, 32),
          new T.MeshBasicMaterial({ color: 0xFFA726, transparent: true, opacity: 0.8 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, baseY, z);
        hg.add(ring);
      });
    }

    // hint
    if (hint) {
      hint.forEach(([r, c]) => {
        const [x, z] = squareToWorld(r, c);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(PIECE_RADIUS * 0.9, 0.02, 12, 32),
          new T.MeshBasicMaterial({ color: 0xAB47BC, transparent: true, opacity: 0.8 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, baseY, z);
        ring.userData = { breathing: true };
        hg.add(ring);
      });
    }

    needsRenderRef.current = true;
  }, [legalTargets, lastMove, hint, board]);

  return (
    <div
      ref={containerRef}
      className="threejs-xiangqi-board"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default ThreeJSXiangqiBoard;
