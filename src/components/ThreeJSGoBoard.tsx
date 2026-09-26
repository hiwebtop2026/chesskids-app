/**
 * ChessKids - Three.js 3D 围棋棋盘
 * 参考真实围棋棋子：透镜状凸面圆片（中心厚边缘薄）、乌黑高光黑子 / 温润光泽白子、木质棋盘
 * 支持 9/13/19 路、落子动画、last move 红点、提示环、相机自适应容器（浮动窗口可用）、视角翻转
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { isGoStarPoint, type GoBoard, type GoBoardSize, type GoColor } from '../engine/go';

// CDN three 0.160 类型声明为旧版自定义 d.ts——按既有 3D 组件模式以 any 访问全部 API
const T = THREE as any;

// 全局活跃 WebGL 渲染器管理：同时只保留一个 3D 上下文（防 context 泄漏/黑屏）
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

// ============ 棋盘几何常量（单个数据源，按棋盘路数动态缩放） ============
const CELL = 1.0;                 // 交叉点间距
const BOARD_MARGIN = 0.9;         // 棋盘四周留边（木框）
const BOARD_HEIGHT = 0.26;        // 棋盘厚度
const LINE_OPACITY = 0.9;

// 棋子：透镜状凸面（参考真实云子/贝壳棋子比例）
const PIECE_RADIUS = CELL * 0.43;
const PIECE_CENTER_H = PIECE_RADIUS * 0.5;   // 中心最高
const PIECE_EDGE_H = PIECE_RADIUS * 0.09;    // 边缘厚度（微弧）

// 颜色
const BOARD_TOP = '#d9a665';       // 棋盘面：暖木色
const BOARD_SIDE = '#8a5a2e';      // 棋盘侧面：深木色
const LINE_COLOR = '#3a2410';      // 网格线

/** 生成木质纹理（Canvas：木纹条纹 + 柔和噪点） */
function makeWoodTexture(): any {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BOARD_TOP;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i++) {
    const y = Math.random() * 512;
    const h = 2 + Math.random() * 10;
    ctx.fillStyle = `rgba(150, 96, 44, ${0.08 + Math.random() * 0.14})`;
    ctx.fillRect(0, y, 512, h);
    ctx.fillStyle = `rgba(236, 196, 130, ${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(0, y + h * 0.4, 512, 1 + Math.random() * 4);
  }
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(120,76,34,0.05)' : 'rgba(240,200,140,0.04)';
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new T.CanvasTexture(canvas);
  tex.wrapS = T.RepeatWrapping;
  tex.wrapT = T.RepeatWrapping;
  return tex;
}

/** 生成棋子剖面（Lathe）：中心厚、边缘薄、上弧下微弧 */
function makeStoneGeometry(): any {
  const pts: any[] = [];
  const r = PIECE_RADIUS;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;               // 0=中心, 1=边缘
    const x = r * t;
    const y = PIECE_EDGE_H + (PIECE_CENTER_H - PIECE_EDGE_H) * Math.cos(t * Math.PI * 0.5);
    pts.push(new T.Vector2(x, y));
  }
  pts.push(new T.Vector2(r, PIECE_EDGE_H * 0.2));
  const geo = new T.LatheGeometry(pts, 32);
  return geo;
}

let sharedStoneGeo: any = null;
function getStoneGeometry(): any {
  if (!sharedStoneGeo) sharedStoneGeo = makeStoneGeometry();
  return sharedStoneGeo;
}

export interface ThreeJSGoBoardProps {
  board: GoBoard;
  size: GoBoardSize;
  lastMove?: [number, number] | null;
  hintPoint?: [number, number] | null;
  territory?: GoBoard | null;
  onIntersectionClick?: (r: number, c: number) => void;
  disabled?: boolean;
  flipped?: boolean;
}

export const ThreeJSGoBoard: React.FC<ThreeJSGoBoardProps> = ({
  board,
  size,
  lastMove,
  hintPoint,
  territory,
  onIntersectionClick,
  disabled = false,
  flipped = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [glFailed, setGlFailed] = useState(false);

  const boardRef = useRef<GoBoard>(board);
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

  // 世界坐标
  const toWorld = (r: number, c: number): [number, number] => {
    const half = (size - 1) / 2;
    return [(c - half) * CELL, (r - half) * CELL];
  };
  const toWorldRef = useRef(toWorld);
  toWorldRef.current = toWorld;

  /** 相机按容器宽高比自动取景（完整显示棋盘，浮动窗口自适应） */
  const fitCamera = (camera: any, width: number, height: number) => {
    camera.aspect = width / height;
    const n = size;
    const gridW = (n - 1) * CELL;
    const halfW = gridW / 2 + BOARD_MARGIN + PIECE_RADIUS * 0.5;
    const halfD = halfW;
    const yTop = BOARD_HEIGHT + PIECE_CENTER_H;
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
    scene.background = new T.Color(0xa8a088);
    scene.fog = new T.Fog(0xa8a088, 28, 60);

    const camera = new T.PerspectiveCamera(40, width / height, 0.1, 120);
    fitCamera(camera, width, height);

    let renderer: any;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
    } catch (err) {
      console.error('[GoBoard3D] WebGL 初始化失败，请切换 2D 视图:', err);
      setGlFailed(true);
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = T.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    for (const old of activeRenderers) disposeRendererSafe(old);
    activeRenderers.clear();
    activeRenderers.add(renderer);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    clockRef.current = new T.Clock();

    // ---- 灯光 ----
    scene.add(new T.AmbientLight(0xffffff, 0.55));
    const hemi = new T.HemisphereLight(0xffffff, 0x806040, 0.5);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd0ff, 0.35);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    // ---- 棋盘 ----
    const n = size;
    const gridW = (n - 1) * CELL;
    const boardW = gridW + BOARD_MARGIN * 2;
    const woodTex = makeWoodTexture();
    const boardTop = new T.Mesh(
      new T.BoxGeometry(boardW, BOARD_HEIGHT, boardW),
      new T.MeshPhysicalMaterial({
        map: woodTex,
        color: 0xffffff,
        roughness: 0.55,
        metalness: 0,
        clearcoat: 0.25,
      }),
    );
    boardTop.position.y = -BOARD_HEIGHT / 2;
    boardTop.receiveShadow = true;
    scene.add(boardTop);

    // 侧面边框（深木色）
    const frameMesh = new T.Mesh(new T.BoxGeometry(boardW + 0.5, 0.5, boardW + 0.5),
      new T.MeshStandardMaterial({ color: new T.Color(BOARD_SIDE), roughness: 0.8 }));
    frameMesh.position.y = -BOARD_HEIGHT - 0.12;
    frameMesh.receiveShadow = true;
    scene.add(frameMesh);

    // ---- 网格线（LineSegments）----
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
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!isGoStarPoint(r, c, size)) continue;
        const [wx, wz] = toWorldRef.current(r, c);
        const star = new T.Mesh(new T.CircleGeometry(0.11, 20), starMat);
        star.rotation.x = -Math.PI / 2;
        star.position.set(wx, 0.02, wz);
        scene.add(star);
      }
    }

    // ---- 棋子组 / 标记组 ----
    const stones = new T.Group();
    scene.add(stones);
    stonesGroupRef.current = stones;
    const marks = new T.Group();
    scene.add(marks);
    marksGroupRef.current = marks;

    // ---- 交互平面（棋盘面，用于射线点击）----
    const hitPlane = new T.Mesh(
      new T.PlaneGeometry(gridW, gridW),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hitPlane.rotation.x = -Math.PI / 2;
    hitPlane.position.y = 0.05;
    scene.add(hitPlane);

    // ---- 射线 ----
    const raycaster = new T.Raycaster();
    raycasterRef.current = raycaster;
    mouseRef.current = new T.Vector2();

    // hover 高亮（半透明圆盘）
    const hoverMat = new T.MeshBasicMaterial({
      color: 0x2e7d32, transparent: true, opacity: 0.4, depthWrite: false,
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
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new T.Vector2(mx, my), camera);
      const hits = raycaster.intersectObjects([hitPlane]);
      if (hits.length === 0) return;
      const p = hits[0].point;
      // 找最近交叉点
      const n2 = size;
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
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('click', handleClick);

    // ---- 动画循环 ----
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      // 棋子落下动画（新生棋子 y 从高处落下）
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
      // hover 跟随
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
      lineGeo.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };

    return () => disposeRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // ---- 同步棋子与标记（棋盘变化时重建）----
  useEffect(() => {
    if (!stonesGroupRef.current || !marksGroupRef.current) return;
    const stones = stonesGroupRef.current;
    const marks = marksGroupRef.current;

    while (stones.children.length) stones.remove(stones.children[0]);
    while (marks.children.length) marks.remove(marks.children[0]);
    meshRef.current = [];

    const n = size;
    const geo = getStoneGeometry();

    // 黑/白子材质（共享，光泽）
    const blackMat = new T.MeshPhysicalMaterial({
      color: 0x171717, roughness: 0.22, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.25,
    });
    const whiteMat = new T.MeshPhysicalMaterial({
      color: 0xf4efe0, roughness: 0.16, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.12,
    });

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const color: GoColor | '' = board[r][c];
        if (!color) {
          // 领地标记（数子后）
          if (territory && territory[r][c] && territory[r][c] !== board[r][c]) {
            const [wx, wz] = toWorldRef.current(r, c);
            const tMat = new T.MeshBasicMaterial({
              color: territory[r][c] === 'b' ? 0x1a1a1a : 0xf0f0f0,
              transparent: true, opacity: 0.3, depthWrite: false,
            });
            const t = new T.Mesh(new T.CircleGeometry(PIECE_RADIUS * 0.7, 20), tMat);
            t.rotation.x = -Math.PI / 2;
            t.position.set(wx, 0.015, wz);
            marks.add(t);
          }
          continue;
        }
        const [wx, wz] = toWorldRef.current(r, c);
        const mesh = new T.Mesh(geo, color === 'b' ? blackMat : whiteMat);
        mesh.position.set(wx, 0, wz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        stones.add(mesh);
        meshRef.current.push({ r, c, mesh, bornAt: Date.now() });
      }
    }

    // last move 标记（红色小圆点，浮于棋子中心上方）
    if (lastMove) {
      const [wx, wz] = toWorldRef.current(lastMove[0], lastMove[1]);
      const lmMat = new T.MeshBasicMaterial({ color: 0xe53935 });
      const lm = new T.Mesh(new T.CircleGeometry(0.13, 16), lmMat);
      lm.rotation.x = -Math.PI / 2;
      lm.position.set(wx, PIECE_CENTER_H + 0.05, wz);
      marks.add(lm);
    }

    // 提示环（蓝色圆环）
    if (hintPoint) {
      const [wx, wz] = toWorldRef.current(hintPoint[0], hintPoint[1]);
      const ringGeo = new T.RingGeometry(0.26, 0.4, 32);
      const ringMat = new T.MeshBasicMaterial({ color: 0x1565c0, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
      const ring = new T.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(wx, 0.03, wz);
      marks.add(ring);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, lastMove, hintPoint, territory, size]);

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
      fitCamera(cam, w, h);
      cam.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, flipped]);

  // 翻转视角：相机重定位
  useEffect(() => {
    const cam = cameraRef.current;
    const renderer = rendererRef.current;
    if (!cam || !renderer) return;
    const w = containerRef.current?.clientWidth || 480;
    const h = containerRef.current?.clientHeight || 480;
    fitCamera(cam, w, h);
    cam.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, size]);

  if (glFailed) {
    return (
      <div className="go-3d-fallback">
        <p>⚠️ 当前设备无法启用 3D 渲染，请切换 2D 视图使用。</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="go-board-3d"
      style={{ width: '100%', height: '100%', minHeight: 420, borderRadius: 12, overflow: 'hidden', position: 'relative' }}
    />
  );
};

export default ThreeJSGoBoard;
