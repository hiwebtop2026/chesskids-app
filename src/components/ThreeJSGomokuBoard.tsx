/**
 * ChessKids - Three.js 3D 五子棋棋盘
 * 棋子完全复用围棋方案（透镜状凸面圆片：俯视圆、横切面椭圆、中心厚边缘薄，黑白对比分明）
 * 棋盘：深色花梨木面板 + 深木侧面 + 程序化花梨木纹理
 * 视角控制（参考中国象棋 3D 方案）：左键拖拽旋转、右键拖拽平移、滚轮缩放、
 * 单指旋转 / 双指缩放 / 三指平移、重置视角按钮；拖拽与点击落子智能区分
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GOMOKU_SIZE, GOMOKU_STAR_POINTS, type GomokuBoard, type GomokuColor } from '../engine/gomoku';

const T = THREE as any;

// 全局活跃 WebGL 渲染器管理
const activeRenderers = new Set<any>();
function disposeRendererSafe(r: any) {
  if (!r) return;
  try { r.dispose(); } catch {}
  try {
    if (r.domElement && r.domElement.parentNode) {
      r.domElement.parentNode.removeChild(r.domElement);
    }
  } catch {}
}

// ============ 棋盘几何常量 ============
const CELL = 1.0;
const BOARD_MARGIN = 1.1;         // 四周留边（花梨木框）
const BOARD_HEIGHT = 0.28;        // 棋盘厚度
const BOARD_DEPTH = 1.0;          // 五子棋盘为正方形
const LINE_OPACITY = 0.95;

// 棋子（与围棋完全一致）：厚实圆润云子形态
const PIECE_RADIUS = CELL * 0.43;
const PIECE_CENTER_H = PIECE_RADIUS * 0.68;

// 深色花梨木为主色调
const BOARD_SIDE = '#5a3018';     // 侧面：深花梨木
const LINE_COLOR = '#2a1608';     // 网格线：深棕黑

/** 程序化环境贴图（摄影棚柔光） */
function makeEnvTexture(): any {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#c9c2b0');
  grad.addColorStop(0.22, '#b4ac98');
  grad.addColorStop(0.55, '#a89a80');
  grad.addColorStop(1, '#3f392e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, size, size * 0.3);
  const images: any[] = [];
  for (let i = 0; i < 6; i++) images.push(canvas);
  const cube = new T.CubeTexture(images);
  cube.needsUpdate = true;
  return cube;
}

/** 花梨木纹理：参考实木棋盘——细腻方向性木纹 + 年轮弧线 + 导管纹理 + 噪点 */
function makeRosewoodTexture(): any {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  // 基础暖棕底色（花梨木）
  const baseGrad = ctx.createLinearGradient(0, 0, 0, 512);
  baseGrad.addColorStop(0, '#9a5b33');
  baseGrad.addColorStop(0.5, '#8f542f');
  baseGrad.addColorStop(1, '#9d5f34');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 512, 512);
  // 主木纹：沿水平方向细密条纹（深浅棕交替，模拟花梨木直纹）
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 512;
    const h = 0.6 + Math.random() * 4.5;
    const tone = Math.random();
    if (tone < 0.42) {
      ctx.fillStyle = `rgba(58, 28, 10, ${0.05 + Math.random() * 0.11})`;
    } else if (tone < 0.8) {
      ctx.fillStyle = `rgba(48, 22, 8, ${0.03 + Math.random() * 0.07})`;
    } else {
      ctx.fillStyle = `rgba(216, 160, 96, ${0.03 + Math.random() * 0.07})`;
    }
    ctx.fillRect(0, y, 512, h);
  }
  // 细导管纹（浅金细线，增强实木感）
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 512;
    ctx.fillStyle = `rgba(224, 176, 118, ${0.04 + Math.random() * 0.08})`;
    ctx.fillRect(0, y, 512, 0.5 + Math.random() * 1.2);
    ctx.fillStyle = `rgba(40, 18, 6, ${0.03 + Math.random() * 0.06})`;
    ctx.fillRect(0, y + 1.5, 512, 0.4 + Math.random() * 0.8);
  }
  // 年轮弧线（右下角圆心，稀疏分布更自然）
  const cx = 150 + Math.random() * 120;
  const cy = 60 + Math.random() * 80;
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = `rgba(52, 24, 10, ${0.04 + Math.random() * 0.05})`;
    ctx.lineWidth = 0.8 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, 90 + i * 26 + Math.random() * 10, Math.PI * 0.4, Math.PI * 1.9);
    ctx.stroke();
  }
  // 局部深色木结
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const rr = 3 + Math.random() * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(34, 16, 6, 0.28)');
    g.addColorStop(1, 'rgba(34, 16, 6, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  // 细腻噪点
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(56,26,10,0.05)' : 'rgba(226,178,120,0.035)';
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  const tex = new T.CanvasTexture(canvas);
  tex.wrapS = T.RepeatWrapping;
  tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** 棋子剖面（Lathe）：不对称完整椭圆——底部微凸弧面（非平面）、顶部圆凸（与围棋云子一致） */
function makeStoneGeometry(): any {
  const pts: any[] = [];
  const r = PIECE_RADIUS;
  const a = PIECE_CENTER_H;
  const b = PIECE_CENTER_H * 0.3;
  const yOff = b;
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = -Math.PI / 2 + t * Math.PI;
    const x = r * Math.cos(th);
    const half = th < 0 ? b : a;
    const y = yOff + half * Math.sin(th);
    pts.push(new T.Vector2(x, y));
  }
  return new T.LatheGeometry(pts, 40);
}

let sharedStoneGeo: any = null;
function getStoneGeometry(): any {
  if (!sharedStoneGeo) sharedStoneGeo = makeStoneGeometry();
  return sharedStoneGeo;
}

export interface ThreeJSGomokuBoardProps {
  board: GomokuBoard;
  lastMove?: [number, number] | null;
  hintPoint?: [number, number] | null;
  winningLine?: Array<[number, number]> | null;
  onIntersectionClick?: (r: number, c: number) => void;
  disabled?: boolean;
  flipped?: boolean;
  onReady?: (api: { resetView: () => void }) => void;
}

export const ThreeJSGomokuBoard: React.FC<ThreeJSGomokuBoardProps> = ({
  board,
  lastMove,
  hintPoint,
  winningLine,
  onIntersectionClick,
  disabled = false,
  flipped = false,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [glFailed, setGlFailed] = useState(false);
  const resetViewRef = useRef<(() => void) | null>(null);

  const boardRef = useRef<GomokuBoard>(board);
  const onIntersectionClickRef = useRef(onIntersectionClick);
  const disabledRef = useRef(disabled);
  const flippedRef = useRef(flipped);

  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const stonesGroupRef = useRef<any>(null);
  const marksGroupRef = useRef<any>(null);
  const meshRef = useRef<{ r: number; c: number; mesh: any; bornAt: number }[]>([]);
  const raycasterRef = useRef<any>(null);
  const mouseRef = useRef<any>(null);
  const hoverRef = useRef<any>(null);
  const clockRef = useRef<any>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    boardRef.current = board;
    onIntersectionClickRef.current = onIntersectionClick;
    disabledRef.current = disabled;
    flippedRef.current = flipped;
  });

  const toWorld = (r: number, c: number): [number, number] => {
    const half = (GOMOKU_SIZE - 1) / 2;
    return [(c - half) * CELL, (r - half) * CELL];
  };
  const toWorldRef = useRef(toWorld);
  toWorldRef.current = toWorld;

  /** 相机按容器宽高比自动取景 */
  const fitCamera = (camera: any, width: number, height: number) => {
    camera.aspect = width / height;
    const n = GOMOKU_SIZE;
    const gridW = (n - 1) * CELL;
    const halfW = gridW / 2 + BOARD_MARGIN + PIECE_RADIUS * 0.5;
    const halfD = halfW * BOARD_DEPTH;
    const yTop = BOARD_HEIGHT + PIECE_CENTER_H * 1.2;
    const target = new T.Vector3(0, 0.3, 0);
    const viewDir = new T.Vector3(0, 1, flippedRef.current ? -0.62 : 0.62).normalize();
    let dist = 16;
    for (let i = 0; i < 4; i++) {
      camera.position.copy(target).addScaledVector(viewDir, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      let maxNdc = 0;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        for (const sy of [0, yTop]) {
          const p = new T.Vector3(sx * halfW, sy, sz * halfD).project(camera);
          maxNdc = Math.max(maxNdc, Math.abs(p.x), Math.abs(p.y));
        }
      }
      dist *= (maxNdc + 0.14) * 1.02;
    }
    camera.position.copy(target).addScaledVector(viewDir, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    return dist;
  };

  // ---- 初始化场景 ----
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let width = container.clientWidth || 480;
    let height = container.clientHeight || 480;
    if (width < 10) width = 480;
    if (height < 10) height = 480;

    const scene = new T.Scene();
    scene.background = new T.Color(0x6e5842);
    scene.fog = new T.Fog(0x6e5842, 26, 54);

    const camera = new T.PerspectiveCamera(40, width / height, 0.1, 120);
    const cameraTarget = new T.Vector3(0, 0.3, 0);
    const initialDist = fitCamera(camera, width, height);

    let renderer: any;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
    } catch (err) {
      console.error('[GomokuBoard3D] WebGL 初始化失败，请切换 2D 视图:', err);
      setGlFailed(true);
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = T.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const envTex = makeEnvTexture();
    scene.environment = envTex;
    scene.environmentIntensity = 0.42;

    for (const old of activeRenderers) disposeRendererSafe(old);
    activeRenderers.clear();
    activeRenderers.add(renderer);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    clockRef.current = new T.Clock();

    // ============ 视角控制 ============
    let cameraDistance = initialDist;
    let cameraAngleX = 0;
    let cameraAngleY = 0.6;
    const MIN_DISTANCE = 8;
    const MAX_DISTANCE = 34;
    const MIN_ANGLE_Y = 0.12;
    const MAX_ANGLE_Y = Math.PI / 2 - 0.05;
    const panLimit = () => ((GOMOKU_SIZE - 1) / 2) * CELL + 2.4;

    const getSphericalFromCamera = () => {
      const dx = camera.position.x - cameraTarget.x;
      const dy = camera.position.y - cameraTarget.y;
      const dz = camera.position.z - cameraTarget.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const angleY = Math.acos(Math.min(1, Math.max(-1, dy / dist)));
      const angleX = Math.atan2(dx, dz);
      return { distance: dist, angleX, angleY };
    };
    const applySpherical = () => {
      const r = cameraDistance;
      const sinY = Math.sin(cameraAngleY);
      camera.position.x = cameraTarget.x + r * sinY * Math.sin(cameraAngleX);
      camera.position.y = cameraTarget.y + r * Math.cos(cameraAngleY);
      camera.position.z = cameraTarget.z + r * sinY * Math.cos(cameraAngleX);
      camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
      camera.updateProjectionMatrix();
    };

    const resetView = () => {
      const init = fitCamera(camera, container.clientWidth || width, container.clientHeight || height);
      const sph = getSphericalFromCamera();
      cameraDistance = init;
      cameraAngleX = sph.angleX;
      cameraAngleY = sph.angleY;
      applySpherical();
    };
    resetViewRef.current = resetView;
    onReady?.({ resetView });

    {
      const sph = getSphericalFromCamera();
      cameraDistance = sph.distance;
      cameraAngleX = sph.angleX;
      cameraAngleY = sph.angleY;
    }

    const panCamera = (deltaX: number, deltaY: number) => {
      const panScale = cameraDistance * 0.003;
      const rightX = Math.cos(cameraAngleX);
      const rightZ = -Math.sin(cameraAngleX);
      const forwardX = Math.sin(cameraAngleX) * Math.cos(cameraAngleY);
      const forwardZ = Math.cos(cameraAngleX) * Math.cos(cameraAngleY);
      cameraTarget.x -= rightX * deltaX * panScale;
      cameraTarget.z -= rightZ * deltaX * panScale;
      cameraTarget.x -= forwardX * deltaY * panScale;
      cameraTarget.z -= forwardZ * deltaY * panScale;
      const lim = panLimit();
      cameraTarget.x = Math.max(-lim, Math.min(lim, cameraTarget.x));
      cameraTarget.z = Math.max(-lim, Math.min(lim, cameraTarget.z));
      applySpherical();
    };

    // ---- 鼠标 ----
    let isDragging = false;
    let isPanning = false;
    let dragStartX = 0, dragStartY = 0;
    let dragStartAngleX = 0, dragStartAngleY = 0;
    let panStartX = 0, panStartY = 0;
    let dragMoved = false;

    const handleMouseDown = (event: MouseEvent) => {
      dragMoved = false;
      if (event.button === 2) {
        isPanning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        renderer.domElement.style.cursor = 'grabbing';
      } else {
        isDragging = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        dragStartAngleX = cameraAngleX;
        dragStartAngleY = cameraAngleY;
        renderer.domElement.style.cursor = 'grabbing';
      }
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (isPanning) {
        const dx = event.clientX - panStartX;
        const dy = event.clientY - panStartY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
        if (dx !== 0 || dy !== 0) panCamera(dx, dy);
      } else if (isDragging) {
        const dx = event.clientX - dragStartX;
        const dy = event.clientY - dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        cameraAngleX = dragStartAngleX - dx * 0.008;
        cameraAngleY = Math.max(MIN_ANGLE_Y, Math.min(MAX_ANGLE_Y, dragStartAngleY - dy * 0.008));
        applySpherical();
      }
    };
    const handleMouseUp = () => {
      isDragging = false;
      isPanning = false;
      renderer.domElement.style.cursor = 'grab';
    };
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = event.deltaY > 0 ? 1.1 : 0.9;
      cameraDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, cameraDistance * scale));
      applySpherical();
    };
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    // ---- 触摸 ----
    let touchStartDist = 0;
    let touchStartCameraDist = 0;
    let touchPanStartX = 0, touchPanStartY = 0;
    let isTouchPanning = false;
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        isDragging = true;
        isTouchPanning = false;
        dragMoved = false;
        dragStartX = event.touches[0].clientX;
        dragStartY = event.touches[0].clientY;
        dragStartAngleX = cameraAngleX;
        dragStartAngleY = cameraAngleY;
      } else if (event.touches.length === 2) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        touchStartDist = Math.sqrt(dx * dx + dy * dy);
        touchStartCameraDist = cameraDistance;
        isDragging = false;
        isTouchPanning = false;
        dragMoved = true;
      } else if (event.touches.length === 3) {
        isDragging = false;
        isTouchPanning = true;
        dragMoved = true;
        touchPanStartX = (event.touches[0].clientX + event.touches[1].clientX + event.touches[2].clientX) / 3;
        touchPanStartY = (event.touches[0].clientY + event.touches[1].clientY + event.touches[2].clientY) / 3;
      }
    };
    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      if (event.touches.length === 1 && isDragging) {
        const dx = event.touches[0].clientX - dragStartX;
        const dy = event.touches[0].clientY - dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        cameraAngleX = dragStartAngleX - dx * 0.008;
        cameraAngleY = Math.max(MIN_ANGLE_Y, Math.min(MAX_ANGLE_Y, dragStartAngleY - dy * 0.008));
        applySpherical();
      } else if (event.touches.length === 2) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (touchStartDist > 0 && dist > 0) {
          cameraDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, touchStartCameraDist * (touchStartDist / dist)));
          applySpherical();
        }
      } else if (event.touches.length === 3 && isTouchPanning) {
        const cx = (event.touches[0].clientX + event.touches[1].clientX + event.touches[2].clientX) / 3;
        const cy = (event.touches[0].clientY + event.touches[1].clientY + event.touches[2].clientY) / 3;
        const dx = cx - touchPanStartX;
        const dy = cy - touchPanStartY;
        panCamera(dx, dy);
      }
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (isDragging && event.changedTouches.length > 0) {
        const dx = event.changedTouches[0].clientX - dragStartX;
        const dy = event.changedTouches[0].clientY - dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      }
      isDragging = false;
      isTouchPanning = false;
    };

    // ---- 灯光 ----
    scene.add(new T.AmbientLight(0xffffff, 0.2));
    const hemi = new T.HemisphereLight(0xfff0e0, 0x503020, 0.3);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xffe8cc, 1.0);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd0ff, 0.32);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    // ---- 棋盘（花梨木） ----
    const n = GOMOKU_SIZE;
    const gridW = (n - 1) * CELL;
    const boardW = gridW + BOARD_MARGIN * 2;
    const woodTex = makeRosewoodTexture();
    const boardTop = new T.Mesh(
      new T.BoxGeometry(boardW, BOARD_HEIGHT, boardW * BOARD_DEPTH),
      new T.MeshPhysicalMaterial({
        map: woodTex,
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0,
        clearcoat: 0.55,
        clearcoatRoughness: 0.25,
        envMapIntensity: 0.4,
      }),
    );
    boardTop.position.y = -BOARD_HEIGHT / 2;
    boardTop.receiveShadow = true;
    scene.add(boardTop);

    const frameMesh = new T.Mesh(new T.BoxGeometry(boardW + 0.5, 0.5, (boardW + 0.5) * BOARD_DEPTH),
      new T.MeshStandardMaterial({ color: new T.Color(BOARD_SIDE), roughness: 0.8 }));
    frameMesh.position.y = -BOARD_HEIGHT - 0.12;
    frameMesh.receiveShadow = true;
    scene.add(frameMesh);

    // ---- 网格线 ----
    const lineMat = new T.LineBasicMaterial({ color: new T.Color(LINE_COLOR), transparent: true, opacity: LINE_OPACITY });
    const linePts: any[] = [];
    const half = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const p = (i - half) * CELL;
      const z0 = -half * CELL, z1 = half * CELL;
      const x0 = -half * CELL, x1 = half * CELL;
      linePts.push(new T.Vector3(p, 0.012, z0), new T.Vector3(p, 0.012, z1));
      linePts.push(new T.Vector3(x0, 0.012, p), new T.Vector3(x1, 0.012, p));
    }
    const lineGeo = new T.BufferGeometry().setFromPoints(linePts);
    const lines = new T.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    // ---- 星位 ----
    const starMat = new T.MeshBasicMaterial({ color: new T.Color(LINE_COLOR) });
    for (const [r, c] of GOMOKU_STAR_POINTS) {
      const [wx, wz] = toWorldRef.current(r, c);
      const star = new T.Mesh(new T.CircleGeometry(0.11, 20), starMat);
      star.rotation.x = -Math.PI / 2;
      star.position.set(wx, 0.02, wz);
      scene.add(star);
    }

    // ---- 棋子组 / 标记组 ----
    const stones = new T.Group();
    scene.add(stones);
    stonesGroupRef.current = stones;
    const marks = new T.Group();
    scene.add(marks);
    marksGroupRef.current = marks;

    // ---- 交互平面 ----
    const hitPlane = new T.Mesh(
      new T.PlaneGeometry(gridW, gridW),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hitPlane.rotation.x = -Math.PI / 2;
    hitPlane.position.y = 0.05;
    scene.add(hitPlane);

    const raycaster = new T.Raycaster();
    raycasterRef.current = raycaster;
    mouseRef.current = new T.Vector2();

    // hover 高亮（半透明金环）
    const hoverMat = new T.MeshBasicMaterial({
      color: 0xffb300, transparent: true, opacity: 0.45, depthWrite: false,
    });
    const hover = new T.Mesh(new T.CircleGeometry(PIECE_RADIUS * 0.95, 24), hoverMat);
    hover.rotation.x = -Math.PI / 2;
    hover.visible = false;
    scene.add(hover);
    hoverRef.current = hover;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      mouseRef.current!.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current!.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const handleClick = (e: PointerEvent) => {
      if (dragMoved) return;
      if (disabledRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new T.Vector2(mx, my), camera);
      const hits = raycaster.intersectObjects([hitPlane]);
      if (hits.length === 0) return;
      const p = hits[0].point;
      const n2 = GOMOKU_SIZE;
      let best: [number, number] | null = null;
      let bestD = 0.55 * CELL;
      for (let r = 0; r < n2; r++) {
        for (let c = 0; c < n2; c++) {
          const [wx, wz] = toWorldRef.current(r, c);
          const d = Math.hypot(p.x - wx, p.z - wz);
          if (d < bestD) { bestD = d; best = [r, c]; }
        }
      }
      if (best) onIntersectionClickRef.current?.(best[0], best[1]);
    };

    // 事件绑定
    const el = renderer.domElement;
    el.style.cursor = 'grab';
    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('contextmenu', handleContextMenu);
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('click', handleClick);

    // ---- 动画循环 ----
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const born = Date.now();
      for (const m of meshRef.current) {
        const age = born - m.bornAt;
        if (age < 280) {
          const t = Math.min(1, age / 280);
          const ease = 1 - (1 - t) * (1 - t);
          m.mesh.position.y = (1 - ease) * 1.4;
        } else {
          m.mesh.position.y = 0;
        }
      }
      if (hover.visible && mouseRef.current) {
        raycaster.setFromCamera(mouseRef.current!, camera);
        const hits = raycaster.intersectObjects([hitPlane]);
        if (hits.length > 0) {
          hover.position.set(hits[0].point.x, 0.02, hits[0].point.z);
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    // ---- 清理 ----
    disposeRef.current = () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('contextmenu', handleContextMenu);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('click', handleClick);
      disposeRendererSafe(renderer);
      activeRenderers.delete(renderer);
      scene.traverse((obj: any) => {
        const m = obj as any;
        if (m.geometry && m.geometry !== (getStoneGeometry() as unknown)) m.geometry.dispose();
        const mat = m.material as any;
        if (Array.isArray(mat)) mat.forEach((x: any) => x.dispose());
        else if (mat) mat.dispose();
      });
      woodTex.dispose();
      if (scene.environment) scene.environment.dispose();
      lineGeo.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };

    return () => disposeRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 同步棋子与标记 ----
  useEffect(() => {
    if (!stonesGroupRef.current || !marksGroupRef.current) return;
    const stones = stonesGroupRef.current;
    const marks = marksGroupRef.current;

    while (stones.children.length) stones.remove(stones.children[0]);
    while (marks.children.length) marks.remove(marks.children[0]);
    meshRef.current = [];

    const n = GOMOKU_SIZE;
    const geo = getStoneGeometry();

    // 黑子：乌黑哑光（俯视纯黑）
    const blackMat = new T.MeshPhysicalMaterial({
      color: 0x020202,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.32,
      specularIntensity: 0.65,
      specularColor: 0x333333,
      envMapIntensity: 0.5,
    });
    // 白子：乳白温润瓷光
    const whiteMat = new T.MeshPhysicalMaterial({
      color: 0xf7f3ea,
      roughness: 0.06,
      metalness: 0,
      clearcoat: 0.65,
      clearcoatRoughness: 0.08,
      specularIntensity: 0.5,
      specularColor: 0xffffff,
      envMapIntensity: 0.55,
    });
    const shadowMat = new T.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false,
    });
    const shadowGeo = new T.CircleGeometry(PIECE_RADIUS * 0.88, 20);
    // 胜线标记（金色）
    const winLineSet = new Set<string>();
    if (winningLine) for (const [wr, wc] of winningLine) winLineSet.add(`${wr},${wc}`);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const color: GomokuColor | '' = board[r][c];
        if (!color) continue;
        const [wx, wz] = toWorldRef.current(r, c);
        const sd = new T.Mesh(shadowGeo, shadowMat);
        sd.rotation.x = -Math.PI / 2;
        sd.position.set(wx, 0.008, wz);
        stones.add(sd);
        const mesh = new T.Mesh(geo, color === 'b' ? blackMat : whiteMat);
        mesh.position.set(wx, 0, wz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        stones.add(mesh);
        meshRef.current.push({ r, c, mesh, bornAt: Date.now() });
        // 胜线金环
        if (winLineSet.has(`${r},${c}`)) {
          const ringGeo = new T.RingGeometry(PIECE_RADIUS * 0.78, PIECE_RADIUS * 1.02, 28);
          const ringMat = new T.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false });
          const ring = new T.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(wx, PIECE_CENTER_H * 0.5 + 0.03, wz);
          marks.add(ring);
        }
      }
    }

    // last move 标记（红点）
    if (lastMove) {
      const [wx, wz] = toWorldRef.current(lastMove[0], lastMove[1]);
      const lmMat = new T.MeshBasicMaterial({ color: 0xe53935 });
      const lm = new T.Mesh(new T.CircleGeometry(0.13, 16), lmMat);
      lm.rotation.x = -Math.PI / 2;
      lm.position.set(wx, PIECE_CENTER_H * 1.2 + 0.05, wz);
      marks.add(lm);
    }

    // 提示环（金色）
    if (hintPoint) {
      const [wx, wz] = toWorldRef.current(hintPoint[0], hintPoint[1]);
      const ringGeo = new T.RingGeometry(0.26, 0.4, 32);
      const ringMat = new T.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
      const ring = new T.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(wx, 0.03, wz);
      marks.add(ring);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, lastMove, hintPoint, winningLine]);

  // ---- 相机 resize 自适应 ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const cam = cameraRef.current;
      const renderer = rendererRef.current;
      if (!cam || !renderer) return;
      const w = container.clientWidth || 480;
      const h = container.clientHeight || 480;
      if (w < 10 || h < 10) return;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // 翻转视角
  useEffect(() => {
    resetViewRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);

  if (glFailed) {
    return (
      <div className="gomoku-3d-fallback">
        <p>⚠️ 当前设备无法启用 3D 渲染，请切换 2D 视图使用。</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="gomoku-board-3d"
      style={{ width: '100%', height: '100%', minHeight: 420, borderRadius: 12, overflow: 'hidden', position: 'relative' }}
    >
      <button
        className="gomoku-3d-reset-btn"
        onClick={() => resetViewRef.current?.()}
        title="重置视角"
        aria-label="重置视角"
      >
        🔄 重置视角
      </button>
    </div>
  );
};

export default ThreeJSGomokuBoard;
