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

// 棋子尺寸（鼓型）：直径 = 格距的 80%，高度 = 直径的 60%
const PIECE_RADIUS = CELL * 0.4;   // 0.4
const PIECE_HEIGHT = PIECE_RADIUS * 1.2; // 0.48

// 颜色（参考 3D 渲染图：黑方黑底红字 / 红方枣红金字）
const RED_BODY = 0xC23A24;        // 红方：枣红
const RED_CHAR = '#FFE9B0';       // 红方字：米金
const RED_RIM = 0x7A1B0E;         // 红方：深红环
const BLACK_BODY = 0x262626;      // 黑方：曜石黑（参考图）
const BLACK_CHAR = '#E2321C';     // 黑方字：朱红（参考图）
const BLACK_RIM = 0x0A0A0A;       // 黑方：黑环
const LINE_COLOR = '#3E2410';     // 棋盘线格颜色

// ============ 辅助：交叉点 → 世界坐标 ============
const squareToWorld = (row: number, col: number): [number, number] => {
  const x = (col - (COLS - 1) / 2) * CELL;
  const z = (row - (ROWS - 1) / 2) * CELL;
  return [x, z];
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

  // 坐标换算：像素 = 交叉点百分比 × 画布尺寸
  // 网格区占画布绝大部分，留边距
  const margin = 0.06; // 6% 边距
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

// ============ 阴文雕刻汉字纹理 ============
const createEngravedCharTexture = (
  char: string,
  charColor: string,
  bgTop: string,
  bgBottom: string,
): { displacement: any; bump: any; map: any } => {
  const size = 512;

  // displacement / bump：白底黑字 → 字处低值，位移向下（凹陷）
  const dispCanvas = document.createElement('canvas');
  dispCanvas.width = dispCanvas.height = size;
  const dctx = dispCanvas.getContext('2d')!;
  dctx.fillStyle = '#ffffff';
  dctx.fillRect(0, 0, size, size);
  dctx.fillStyle = '#000000';
  dctx.font = `bold ${Math.round(size * 0.66)}px "KaiTi", "STKaiti", "SimSun", serif`;
  dctx.textAlign = 'center';
  dctx.textBaseline = 'middle';
  dctx.fillText(char, size / 2, size / 2 + size * 0.02);

  const displacement = new (THREE as any).CanvasTexture(dispCanvas);
  displacement.colorSpace = (THREE as any).NoColorSpace;

  const bump = new (THREE as any).CanvasTexture(dispCanvas);
  bump.colorSpace = (THREE as any).NoColorSpace;

  // color map：浅木底 + 红/黑字
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d')!;
  // 浅木底
  const bgGrad = cctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.6);
  bgGrad.addColorStop(0, bgTop);
  bgGrad.addColorStop(1, bgBottom);
  cctx.fillStyle = bgGrad;
  cctx.fillRect(0, 0, size, size);
  // 字色
  cctx.fillStyle = charColor;
  cctx.font = `bold ${Math.round(size * 0.66)}px "KaiTi", "STKaiti", "SimSun", serif`;
  cctx.textAlign = 'center';
  cctx.textBaseline = 'middle';
  cctx.fillText(char, size / 2, size / 2 + size * 0.02);

  const map = new (THREE as any).CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;

  return { displacement, bump, map };
};

// ============ 鼓型棋子几何体 ============
// 鼓型轮廓：底面平 → 底座缘 → 腰部微收 → 顶缘 → 顶面微凸
const createDrumProfile = (): THREE.Vector2[] => {
  const R = PIECE_RADIUS;
  const H = PIECE_HEIGHT;
  const waist = R * 0.90; // 腰部略收
  const rimH = H * 0.12;
  const topDome = H * 0.04;
  return [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(R, 0),
    new THREE.Vector2(R, rimH),
    new THREE.Vector2(waist, H * 0.5),
    new THREE.Vector2(R, H - rimH),
    new THREE.Vector2(R, H),
    new THREE.Vector2(R * 0.6, H + topDome * 0.6),
    new THREE.Vector2(0, H + topDome),
  ];
};

// 棋子模板缓存
const pieceCache = new Map<string, THREE.Group>();

const createPieceMesh = (piece: string): THREE.Group => {
  const cacheKey = piece;
  const cached = pieceCache.get(cacheKey);
  if (cached) return (cached as any).clone(true);

  const group = new THREE.Group();
  const isRed = isXiangqiRed(piece);
  const charColor = isRed ? RED_CHAR : BLACK_CHAR;   // 红方米金字 / 黑方朱红字（参考图）
  const bodyColor = isRed ? RED_BODY : BLACK_BODY;
  const rimColor = isRed ? RED_RIM : BLACK_RIM;
  const char = XIANGQI_PIECE_CHARS[piece] || piece;

  const T = THREE as any;

  // 主体高光材质（亮漆质感）
  const bodyMat = new T.MeshPhysicalMaterial({
    color: bodyColor,
    roughness: 0.30,
    metalness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.16,
    sheen: 0.5,
    sheenColor: new THREE.Color(isRed ? 0xffa070 : 0x884444),
    envMapIntensity: 1.15,
  });

  // 鼓型主体
  const profile = createDrumProfile();
  const bodyGeo = new THREE.LatheGeometry(profile, 64);
  (bodyGeo as any).computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 上下缘装饰环（深色细线，勾勒轮廓）
  const rimMat = new T.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.4,
    metalness: 0.1,
  });
  const rimY = [PIECE_HEIGHT * 0.12, PIECE_HEIGHT * 0.88];
  rimY.forEach((y) => {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(PIECE_RADIUS, 0.014, 8, 48),
      rimMat,
    );
    torus.position.y = y;
    torus.rotation.x = Math.PI / 2;
    torus.castShadow = true;
    group.add(torus);
  });

  // 顶面内圈凸环（参考图棋子顶面的"圈"造型）
  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(PIECE_RADIUS * 0.62, 0.02, 8, 48),
    rimMat,
  );
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = PIECE_HEIGHT + PIECE_HEIGHT * 0.045;
  group.add(innerRing);

  // 顶面阴文雕刻汉字
  const { displacement, bump, map } = createEngravedCharTexture(
    char,
    charColor,
    isRed ? '#E8A26F' : '#4C4C4C',
    isRed ? '#9E2A16' : '#161616',
  );
  const topRadius = PIECE_RADIUS * 0.92;
  // 高分段圆面，位移贴图产生雕刻凹陷
  const topGeo = new (THREE as any).CircleGeometry(topRadius, 64);
  const topMat = new T.MeshStandardMaterial({
    map,
    displacementMap: displacement,
    displacementScale: 0.09, // 字凹陷更深，更立体
    bumpMap: bump,
    bumpScale: 0.03,
    roughness: 0.45,
    metalness: 0.0,
  });
  const topFace = new THREE.Mesh(topGeo, topMat);
  topFace.rotation.x = -Math.PI / 2; // 法线朝上
  topFace.position.y = PIECE_HEIGHT + PIECE_HEIGHT * 0.04; // 置于微凸顶面
  topFace.receiveShadow = true;
  group.add(topFace);

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
  const hoveredRef = useRef<THREE.Object3D | null>(null);
  const clockRef = useRef(new (THREE as any).Clock());

  // 始终保持 ref 最新
  useEffect(() => { onSquareClickRef.current = onSquareClick; });

  // ---- 初始化场景 ----
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xB8A888);
    scene.fog = new THREE.Fog(0xB8A888, 20, 40);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    // 红方视角：从斜上方看向棋盘中心，红方（row 9）靠近观察者（+z 方向）
    camera.position.set(0, 11, 9.5);
    camera.lookAt(0, 0, 0);

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
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
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
      if (readOnly) return;
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
