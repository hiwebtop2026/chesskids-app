/**
 * ChessKids - Three.js 3D 国际象棋棋盘
 * 真正的 3D 棋盘和棋子，PBR 材质 + 多光源阴影 + 木质边框
 * 通过 CDN importmap 加载 three.js，无需本地安装
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Board, PieceType, PieceColor } from '../types/chess';

// ============ 常量 ============
const SQUARE_SIZE = 1.0;
const BOARD_SIZE = SQUARE_SIZE * 8;
const BORDER_WIDTH = 0.6;
const BOARD_HEIGHT = 0.15;
const PIECE_BASE_Y = BOARD_HEIGHT / 2 + 0.04; // 棋子放在格子表面之上

// 标准黑白格棋盘配色：经典对比 + 深色边框
// 深格用中灰而非纯黑，确保黑棋可见；浅格用柔白减少刺眼
const SQUARE_WHITE = 0xEDEDED;   // 柔和白格（非纯白，减少视觉疲劳）
const SQUARE_BLACK = 0x5A5A5A;   // 中深灰黑格（非纯黑，黑棋仍可辨）
const BORDER_DARK = 0x2A2A2A;    // 深灰边框
const BORDER_LIGHT = 0x707070;  // 浅灰装饰线
// 棋子配色：白棋暖象牙与冷灰白格形成色温对比，黑棋近黑与中灰黑格形成明度对比
const WHITE_PIECE = 0xF2E6CC;  // 暖象牙白（色温偏暖，与冷灰白格区分）
const BLACK_PIECE = 0x1C1C1C;  // 近炭黑（明度远低于中灰黑格）
const WHITE_DARK_ACCENT = 0x9A8868; // 白棋暖灰棕装饰环
const BLACK_LIGHT_ACCENT = 0x5A5A5A; // 黑棋中灰装饰环

// ============ 工具函数 ============
const pieceTypeFromChar = (char: string): PieceType | null => {
  const lower = char.toLowerCase();
  if (lower === 'k') return 'K';
  if (lower === 'q') return 'Q';
  if (lower === 'r') return 'R';
  if (lower === 'b') return 'B';
  if (lower === 'n') return 'N';
  if (lower === 'p') return 'P';
  return null;
};

const pieceColorFromChar = (char: string): PieceColor => {
  return char === char.toUpperCase() ? 'w' : 'b';
};

// 将 [row, col] 转换为 3D 世界坐标
// 注意：x 轴翻转是为了适配白方视角相机（z 负方向看向 +z），
// 此时世界 +x 在屏幕左侧，所以 col=0(a) 应映射到 +x（屏幕左侧）
const squareToWorld = (row: number, col: number): [number, number] => {
  const x = (3.5 - col) * SQUARE_SIZE;
  const z = (3.5 - row) * SQUARE_SIZE;
  return [x, z];
};

// ============ 3D 棋子创建 ============
// 使用 LatheGeometry（车削几何体）重构，实现更光滑的 Staunton 风格轮廓
// 参考真实棋子照片：https://images.unsplash.com/photo-staunton-chess

// 棋子网格缓存：按 `${type}-${color}` 缓存克隆用的模板，避免每次 board 变化都重建几何体/材质
const pieceMeshCache = new Map<string, THREE.Group>();

const createPieceMesh = (
  type: PieceType,
  color: PieceColor
): THREE.Group => {
  const group = new THREE.Group();
  const isWhite = color === 'w';
  const baseColor = isWhite ? WHITE_PIECE : BLACK_PIECE;

  // 高端瓷质材质：白棋亮泽象牙瓷（强光影），黑棋深邃黑曜石（边缘高光）
  const P = THREE as any;
  const bodyMat = new P.MeshPhysicalMaterial({
    color: baseColor,
    // 粗糙度：白棋极低产生强镜面反射，黑棋极低产生锐利高光点
    roughness: isWhite ? 0.08 : 0.03,
    // 金属度：白棋零保持瓷质，黑棋微金属增强矿物质感
    metalness: isWhite ? 0.0 : 0.10,
    // 清漆层：双棋均最大光泽
    clearcoat: 1.0,
    // 白棋清漆粗糙度更低，产生更锐利的高光斑点
    clearcoatRoughness: isWhite ? 0.03 : 0.05,
    // 反射率：白棋最高反射，黑棋适中
    reflectivity: isWhite ? 0.85 : 0.6,
    sheen: isWhite ? 0.65 : 0.3,
    sheenColor: new THREE.Color(isWhite ? 0xfff8e8 : 0x586070),
    sheenRoughness: isWhite ? 0.20 : 0.40,
    emissive: new THREE.Color(isWhite ? 0x2a2520 : 0x050508),
    emissiveIntensity: isWhite ? 0.18 : 0.05,
    // 环境反射强度：白棋最高，黑棋适中
    envMapIntensity: isWhite ? 1.8 : 1.3,
  });

  // 深色边缘环材质（暗部装饰线，高对比）
  const accentMat = new P.MeshPhysicalMaterial({
    color: isWhite ? WHITE_DARK_ACCENT : BLACK_LIGHT_ACCENT,
    roughness: isWhite ? 0.35 : 0.12,
    metalness: isWhite ? 0.05 : 0.10,
    clearcoat: isWhite ? 0.6 : 0.6,
    clearcoatRoughness: isWhite ? 0.35 : 0.15,
    envMapIntensity: isWhite ? 1.2 : 1.3,
  });

  // 辅助：用 Vector2 数组创建车削几何体
  const createLathe = (points: THREE.Vector2[], yOffset = 0): THREE.Mesh => {
    const geo = new THREE.LatheGeometry(points, 64); // 高段数确保旋转面光滑
    const mesh = new THREE.Mesh(geo, bodyMat);
    mesh.position.y = yOffset;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // 辅助：添加水平装饰环（凹槽暗线）
  const addAccentRing = (y: number, radius: number, thickness = 0.012) => {
    const torusGeo = new THREE.TorusGeometry(radius, thickness, 8, 48);
    const torus = new THREE.Mesh(torusGeo, accentMat);
    torus.position.y = y;
    torus.rotation.x = Math.PI / 2;
    torus.castShadow = true;
    group.add(torus);
  };

  // 辅助：生成标准底座轮廓（所有棋子通用）- 进一步缩小
  const baseProfile = (): THREE.Vector2[] => [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.30, 0.0),
    new THREE.Vector2(0.30, 0.028),
    new THREE.Vector2(0.275, 0.033),
    new THREE.Vector2(0.275, 0.063),
    new THREE.Vector2(0.255, 0.073),
    new THREE.Vector2(0.240, 0.083),
    new THREE.Vector2(0.217, 0.100),
  ];

  // ========== 兵 Pawn ==========
  if (type === 'P') {
    const profile = [
      ...baseProfile(),
      new THREE.Vector2(0.20, 0.12),
      new THREE.Vector2(0.15, 0.18),
      new THREE.Vector2(0.108, 0.26),
      new THREE.Vector2(0.088, 0.36),
      new THREE.Vector2(0.075, 0.42),
      new THREE.Vector2(0.088, 0.46),
      new THREE.Vector2(0.106, 0.49),
      new THREE.Vector2(0.11, 0.51),
      new THREE.Vector2(0.0, 0.51),
    ];
    group.add(createLathe(profile));

    // 底座装饰环
    addAccentRing(0.095, 0.22);
    addAccentRing(0.47, 0.09);

    // 顶部圆球（完美球体）
    const ballGeo = new THREE.SphereGeometry(0.11, 48, 36);
    const ball = new THREE.Mesh(ballGeo, bodyMat);
    ball.position.y = 0.62;
    ball.castShadow = true;
    group.add(ball);

    // 顶部分模线（球与颈连接装饰）
    addAccentRing(0.515, 0.102, 0.009);

  // ========== 车 Rook ==========
  } else if (type === 'R') {
    // --- 主体：参照实拍图比例（底座直径≈2×腰径，顶部≈1.3×腰径）---
    const profile = [
      ...baseProfile(),
      // 柱身从底座平缓收窄
      new THREE.Vector2(0.20, 0.13),
      new THREE.Vector2(0.18, 0.20),
      new THREE.Vector2(0.16, 0.28),
      // 腰部最细处（半径0.15 = 底座的50%，适度收缩）
      new THREE.Vector2(0.15, 0.36),
      // 腰部以上平缓外扩
      new THREE.Vector2(0.16, 0.44),
      new THREE.Vector2(0.18, 0.52),
      new THREE.Vector2(0.19, 0.58),
      new THREE.Vector2(0.20, 0.62),
      new THREE.Vector2(0.20, 0.64),
      new THREE.Vector2(0.0, 0.64),
    ];
    group.add(createLathe(profile));

    // --- 装饰分模线 ---
    addAccentRing(0.095, 0.22);           // 双层底座的分层线
    addAccentRing(0.36, 0.155, 0.007);    // 腰部最细处分模线
    addAccentRing(0.58, 0.195, 0.008);    // 颈 collar 分模线

    // --- 领环（颈部与城墙连接处的微凸环）---
    const collarRingGeo = new THREE.TorusGeometry(0.20, 0.009, 12, 48);
    const collarRing = new THREE.Mesh(collarRingGeo, accentMat);
    collarRing.position.y = 0.645;
    collarRing.rotation.x = Math.PI / 2;
    collarRing.castShadow = true;
    group.add(collarRing);

    // --- 顶部城墙基座圆台 ---
    const battlementBaseGeo = new THREE.CylinderGeometry(0.21, 0.20, 0.04, 48);
    const battlementBase = new THREE.Mesh(battlementBaseGeo, bodyMat);
    battlementBase.position.y = 0.66;
    battlementBase.castShadow = true;
    battlementBase.receiveShadow = true;
    group.add(battlementBase);

    // --- 6 个方形城垛 ---
    const merlonCount = 6;
    const merlonW = 0.05;
    const merlonH = 0.09;
    const merlonTangent = 0.085;
    const merlonRadius = 0.165;
    for (let i = 0; i < merlonCount; i++) {
      const angle = (i / merlonCount) * Math.PI * 2;
      const merlonGeo = new THREE.BoxGeometry(merlonW, merlonH, merlonTangent);
      const merlon = new THREE.Mesh(merlonGeo, bodyMat);
      merlon.position.set(
        Math.cos(angle) * merlonRadius,
        0.68 + merlonH / 2,
        Math.sin(angle) * merlonRadius
      );
      merlon.rotation.y = -angle;
      merlon.castShadow = true;
      merlon.receiveShadow = true;
      group.add(merlon);
    }

  // ========== 马 Knight ==========
  } else if (type === 'N') {
    // ===== 马棋子设计 v2 =====
    // 基于马的真实解剖特征：长脸、高竖耳、大鼻孔、颈背鬃毛、明显下颌线
    // 参考：马头部解剖学特征（长吻部、高位眼、立耳、颈鬃）

    // --- 颈部：LatheGeometry旋转体 ---
    const bodyProfile = [
      ...baseProfile(),
      new THREE.Vector2(0.210, 0.106),
      new THREE.Vector2(0.200, 0.118),
      new THREE.Vector2(0.190, 0.132),
      new THREE.Vector2(0.183, 0.148),
      new THREE.Vector2(0.180, 0.165),
      new THREE.Vector2(0.180, 0.19),
      new THREE.Vector2(0.178, 0.22),
      new THREE.Vector2(0.176, 0.25),
      new THREE.Vector2(0.175, 0.28),
      new THREE.Vector2(0.176, 0.31),
      new THREE.Vector2(0.179, 0.34),
      new THREE.Vector2(0.183, 0.37),
      new THREE.Vector2(0.188, 0.40),
      new THREE.Vector2(0.193, 0.43),
      new THREE.Vector2(0.198, 0.46),
      new THREE.Vector2(0.202, 0.49),
      new THREE.Vector2(0.204, 0.51),
      new THREE.Vector2(0.204, 0.53),
      new THREE.Vector2(0.202, 0.54),
      new THREE.Vector2(0.198, 0.545),
      new THREE.Vector2(0.180, 0.548),
      new THREE.Vector2(0.140, 0.550),
      new THREE.Vector2(0.080, 0.551),
      new THREE.Vector2(0.0, 0.552),
    ];
    group.add(createLathe(bodyProfile));

    addAccentRing(0.095, 0.21);
    addAccentRing(0.165, 0.180, 0.005);
    addAccentRing(0.29, 0.176, 0.006);
    addAccentRing(0.39, 0.179, 0.005);

    const collarGeo = new THREE.TorusGeometry(0.204, 0.010, 12, 48);
    const collar = new THREE.Mesh(collarGeo, accentMat);
    collar.position.y = 0.505;
    collar.rotation.x = Math.PI / 2;
    collar.castShadow = true;
    group.add(collar);

    // ===== 马头 =====
    // 关键设计：长脸是马最突出的识别特征，吻部占头部50%长度
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.535, 0);

    const horseShape = new (THREE as any).Shape();

    // 起点：后方底部（连接颈顶）
    horseShape.moveTo(0.180, 0.0);

    // === 下颌线 ===
    // 颈底向前平移
    horseShape.quadraticCurveTo(0.10, -0.005, 0.02, 0.0);
    // 下颌骨弯曲（马的特征性下颌曲线）
    horseShape.quadraticCurveTo(-0.04, 0.01, -0.08, 0.025);
    horseShape.quadraticCurveTo(-0.12, 0.035, -0.16, 0.04);
    // 下颌到口鼻底部（明显的下巴转折）
    horseShape.quadraticCurveTo(-0.20, 0.045, -0.24, 0.05);
    horseShape.quadraticCurveTo(-0.28, 0.052, -0.32, 0.055);

    // === 鼻尖（长吻部前端，略微下垂）===
    horseShape.quadraticCurveTo(-0.35, 0.058, -0.36, 0.065);
    horseShape.quadraticCurveTo(-0.365, 0.075, -0.36, 0.085);
    horseShape.quadraticCurveTo(-0.35, 0.092, -0.34, 0.095);

    // === 上唇 → 鼻孔区 → 鼻梁（长直鼻梁，马的核心特征）===
    horseShape.quadraticCurveTo(-0.31, 0.10, -0.27, 0.108);
    horseShape.quadraticCurveTo(-0.22, 0.115, -0.17, 0.125);
    // 鼻梁平直上升（马鼻梁特征：长且直或微凸）
    horseShape.quadraticCurveTo(-0.12, 0.135, -0.07, 0.148);
    horseShape.quadraticCurveTo(-0.03, 0.16, 0.01, 0.172);

    // === 额头隆起 ===
    horseShape.quadraticCurveTo(0.04, 0.182, 0.06, 0.185);
    horseShape.quadraticCurveTo(0.08, 0.186, 0.09, 0.180);

    // === 头顶冠部 → 耳朵基部 ===
    horseShape.quadraticCurveTo(0.10, 0.172, 0.105, 0.16);
    // 后脑曲线
    horseShape.quadraticCurveTo(0.115, 0.14, 0.12, 0.11);

    // === 后颈（鬃毛流动区域）===
    horseShape.quadraticCurveTo(0.125, 0.08, 0.13, 0.05);
    horseShape.quadraticCurveTo(0.14, 0.025, 0.155, 0.01);
    horseShape.quadraticCurveTo(0.17, 0.002, 0.180, 0.0);
    horseShape.lineTo(0.180, 0.0);

    const extrudeSettings = {
      depth: 0.36,
      bevelEnabled: true,
      bevelThickness: 0.020,
      bevelSize: 0.016,
      bevelSegments: 10,
      steps: 1,
    };
    const headGeo = new (THREE as any).ExtrudeGeometry(horseShape, extrudeSettings);
    headGeo.translate(0, 0, -0.18);
    headGeo.computeVertexNormals();

    const headMesh = new THREE.Mesh(headGeo, bodyMat);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headGroup.add(headMesh);

    const faceZ = 0.185;

    // --- 鼻尖球体（圆润的鼻头）---
    const noseTipGeo = new THREE.SphereGeometry(0.018, 16, 12);
    const noseTip = new THREE.Mesh(noseTipGeo, bodyMat);
    noseTip.position.set(-0.355, 0.075, 0);
    noseTip.scale.set(1.0, 0.80, 0.85);
    noseTip.castShadow = true;
    headGroup.add(noseTip);

    // --- 耳朵：高竖立，尖锥形（马的关键识别特征）---
    // 耳朵位于头顶，高高竖起，细长尖锥
    const earGeo = new THREE.ConeGeometry(0.016, 0.065, 8);
    const earF = new THREE.Mesh(earGeo, bodyMat);
    earF.position.set(0.075, 0.218, -faceZ + 0.006);
    earF.rotation.z = -0.03; // 近垂直，微前倾
    earF.castShadow = true;
    headGroup.add(earF);
    const earB = new THREE.Mesh(earGeo, bodyMat);
    earB.position.set(0.075, 0.218, faceZ - 0.006);
    earB.rotation.z = -0.03;
    earB.castShadow = true;
    headGroup.add(earB);

    // --- 眼睛：高位，大而生动 ---
    // 马的眼睛位于头部上1/3处，靠近额头
    const eyeX = -0.02;
    const eyeY = 0.155;
    const eyeDotMat = new THREE.MeshStandardMaterial({ color: 0x100804, roughness: 0.2, metalness: 0.2 });
    const eyeRimGeo = new THREE.TorusGeometry(0.013, 0.003, 8, 24);
    const eyeRimF = new THREE.Mesh(eyeRimGeo, accentMat);
    eyeRimF.position.set(eyeX, eyeY, -faceZ - 0.001);
    eyeRimF.scale.set(1.0, 0.80, 1.0);
    headGroup.add(eyeRimF);
    const eyeRimB = new THREE.Mesh(eyeRimGeo, accentMat);
    eyeRimB.position.set(eyeX, eyeY, faceZ + 0.001);
    eyeRimB.scale.set(1.0, 0.80, 1.0);
    headGroup.add(eyeRimB);
    const eyeBallGeo = new THREE.SphereGeometry(0.010, 16, 12);
    const eyeBallF = new THREE.Mesh(eyeBallGeo, eyeDotMat);
    eyeBallF.position.set(eyeX, eyeY, -faceZ - 0.005);
    eyeBallF.castShadow = true;
    headGroup.add(eyeBallF);
    const eyeBallB = new THREE.Mesh(eyeBallGeo, eyeDotMat);
    eyeBallB.position.set(eyeX, eyeY, faceZ + 0.005);
    eyeBallB.castShadow = true;
    headGroup.add(eyeBallB);

    // --- 鼻孔：大而显眼（马的嗅觉特征）---
    const nostrilMat = new THREE.MeshStandardMaterial({
      color: isWhite ? 0x3a2a1a : 0x000000,
      roughness: 0.95,
    });
    const nostrilGeo = new THREE.SphereGeometry(0.012, 16, 12);
    const nostrilF = new THREE.Mesh(nostrilGeo, nostrilMat);
    nostrilF.position.set(-0.30, 0.085, -faceZ - 0.003);
    nostrilF.scale.set(0.9, 1.3, 0.5);
    headGroup.add(nostrilF);
    const nostrilB = new THREE.Mesh(nostrilGeo, nostrilMat);
    nostrilB.position.set(-0.30, 0.085, faceZ + 0.003);
    nostrilB.scale.set(0.9, 1.3, 0.5);
    headGroup.add(nostrilB);

    // --- 嘴缝（口鼻分界线）---
    const mouthGeo = new THREE.BoxGeometry(0.055, 0.003, 0.12);
    const mouth = new THREE.Mesh(mouthGeo, accentMat);
    mouth.position.set(-0.26, 0.058, 0);
    headGroup.add(mouth);

    // --- 鬃毛：沿颈背流动的浓密发束 ---
    // 马的鬃毛沿颈背流动，从耳后延伸到颈底
    const maneMat = new P.MeshPhysicalMaterial({
      color: isWhite ? 0xe0d4bc : 0x1C1C1C,
      roughness: isWhite ? 0.30 : 0.08,
      clearcoat: isWhite ? 0.7 : 0.9,
      clearcoatRoughness: isWhite ? 0.25 : 0.08,
      metalness: isWhite ? 0.0 : 0.05,
      envMapIntensity: isWhite ? 1.3 : 1.3,
    });
    // 8束发束，沿后颈曲线密集分布
    const maneCount = 8;
    const maneCurve = [
      { x: 0.105, y: 0.175 },
      { x: 0.115, y: 0.150 },
      { x: 0.122, y: 0.120 },
      { x: 0.125, y: 0.090 },
      { x: 0.130, y: 0.065 },
      { x: 0.140, y: 0.040 },
      { x: 0.155, y: 0.020 },
      { x: 0.170, y: 0.005 },
    ];
    for (let i = 0; i < maneCount; i++) {
      const t = i / (maneCount - 1);
      const seg = t * (maneCurve.length - 1);
      const idx = Math.floor(seg);
      const frac = seg - idx;
      const p0 = maneCurve[Math.min(idx, maneCurve.length - 1)];
      const p1 = maneCurve[Math.min(idx + 1, maneCurve.length - 1)];
      const cx = p0.x + (p1.x - p0.x) * frac;
      const cy = p0.y + (p1.y - p0.y) * frac;
      const sScale = 1 - t * 0.35;
      const maneSize = 0.022 * sScale;

      const maneGeo = new THREE.SphereGeometry(maneSize, 12, 10);
      const maneMain = new THREE.Mesh(maneGeo, maneMat);
      maneMain.scale.set(0.75, 1.4, 0.80);
      maneMain.position.set(cx + 0.010, cy, 0);
      maneMain.rotation.z = -0.08 - t * 0.25;
      maneMain.castShadow = true;
      headGroup.add(maneMain);

      if (i < maneCount - 1) {
        const sideGeo = new THREE.SphereGeometry(maneSize * 0.75, 10, 8);
        const maneSide = new THREE.Mesh(sideGeo, maneMat);
        maneSide.scale.set(0.65, 1.2, 0.65);
        const zDir = i % 2 === 0 ? 1 : -1;
        maneSide.position.set(cx + 0.005, cy + 0.004, faceZ * 0.35 * zDir);
        maneSide.rotation.z = -0.06 - t * 0.20;
        maneSide.rotation.x = 0.12 * zDir;
        maneSide.castShadow = true;
        headGroup.add(maneSide);
      }
    }

    if (!isWhite) {
      headGroup.rotation.y = Math.PI;
    }

    group.add(headGroup);

  // ========== 象 Bishop ==========
  } else if (type === 'B') {
    // 身体+头部一体车削：底座→收腰→颈部→主教冠→切口凹槽→顶部
    const profile = [
      ...baseProfile(),
      // 身体收腰曲线（基座上方平滑收窄）
      new THREE.Vector2(0.205, 0.12),
      new THREE.Vector2(0.192, 0.18),
      new THREE.Vector2(0.144, 0.25),
      new THREE.Vector2(0.104, 0.32),
      new THREE.Vector2(0.116, 0.40),
      new THREE.Vector2(0.142, 0.48),
      // 颈部到主教冠底部过渡
      new THREE.Vector2(0.156, 0.54),
      new THREE.Vector2(0.168, 0.58),
      // 主教冠主体（向上逐渐收窄的椭圆冠）
      new THREE.Vector2(0.16, 0.62),
      new THREE.Vector2(0.148, 0.68),
      new THREE.Vector2(0.128, 0.74),
      new THREE.Vector2(0.104, 0.80),
      // === 标志性斜切口凹槽 ===
      // 切口起点（前方）：半径骤降形成深凹槽
      new THREE.Vector2(0.052, 0.82),
      new THREE.Vector2(0.013, 0.83),
      new THREE.Vector2(0.0, 0.835),
      // 切口后方上升段
      new THREE.Vector2(0.04, 0.85),
      new THREE.Vector2(0.077, 0.88),
      // 后冠顶部（高于前冠顶部，形成前后高度差）
      new THREE.Vector2(0.064, 0.92),
      new THREE.Vector2(0.032, 0.95),
      new THREE.Vector2(0.0, 0.96),
    ];
    group.add(createLathe(profile));

    // 底座装饰环
    addAccentRing(0.095, 0.22);
    addAccentRing(0.475, 0.138);

    // 顶部装饰小球（提升段数）
    const topBallGeo = new THREE.SphereGeometry(0.032, 32, 24);
    const topBall = new THREE.Mesh(topBallGeo, bodyMat);
    topBall.position.y = 1.00;
    topBall.castShadow = true;
    group.add(topBall);

    // 项圈装饰环（颈部和冠体之间的细节）改为深色对比
    const collarRingGeo = new THREE.TorusGeometry(0.158, 0.011, 12, 48);
    const collarRing = new THREE.Mesh(collarRingGeo, accentMat);
    collarRing.position.y = 0.555;
    collarRing.rotation.x = Math.PI / 2;
    collarRing.castShadow = true;
    group.add(collarRing);

    // 冠体底部的装饰环（颈部与主教冠过渡区）
    addAccentRing(0.595, 0.162, 0.01);

    // 切口内部暗色嵌入物（增强切口深度感）使用 accentMat
    const slitMat = new (THREE as any).MeshPhysicalMaterial({
      color: isWhite ? WHITE_DARK_ACCENT : 0x050505,
      roughness: 1.0,
      metalness: 0,
    });
    const slitGeo = new THREE.SphereGeometry(0.077, 24, 16);
    const slit = new THREE.Mesh(slitGeo, slitMat);
    slit.scale.set(1.0, 0.25, 0.5);
    slit.position.set(0, 0.83, 0.04);
    slit.rotation.x = -0.3;
    group.add(slit);

    // 主教冠前侧凸起装饰线（中线脊）使用 accentMat 增加对比度
    const ridgeGeo = new THREE.BoxGeometry(0.016, 0.15, 0.013);
    const ridge = new THREE.Mesh(ridgeGeo, accentMat);
    ridge.position.set(0, 0.72, 0.136);
    ridge.castShadow = true;
    group.add(ridge);

    // 黑方象朝向旋转180°（切口面向对手）
    if (!isWhite) {
      group.rotation.y = Math.PI;
    }

  // ========== 后 Queen ==========
  } else if (type === 'Q') {
    const profile = [
      ...baseProfile(),
      new THREE.Vector2(0.205, 0.12),
      new THREE.Vector2(0.18, 0.20),
      new THREE.Vector2(0.128, 0.32),
      new THREE.Vector2(0.11, 0.44),
      new THREE.Vector2(0.128, 0.52),
      new THREE.Vector2(0.148, 0.58),
      // 颈部延伸 — 连接头部球体，消除分离间隙
      new THREE.Vector2(0.14, 0.64),
      new THREE.Vector2(0.108, 0.70),
      new THREE.Vector2(0.0, 0.72),
    ];
    group.add(createLathe(profile));

    // 底座装饰环
    addAccentRing(0.095, 0.22);
    addAccentRing(0.435, 0.112);

    // 项圈装饰（深色对比，更精致）
    const collarBigGeo = new THREE.TorusGeometry(0.136, 0.012, 14, 56);
    const collarBig = new THREE.Mesh(collarBigGeo, accentMat);
    collarBig.position.y = 0.56;
    collarBig.rotation.x = Math.PI / 2;
    collarBig.castShadow = true;
    group.add(collarBig);

    // 头部球（y=0.76, r=0.116 → 底部=0.644，与颈部顶 0.72 重叠连接）
    const headGeo = new THREE.SphereGeometry(0.116, 48, 36);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 0.76;
    head.castShadow = true;
    group.add(head);

    // 头部赤道装饰环（深色对比装饰环）
    addAccentRing(0.76, 0.114, 0.008);

    // 冠冕基座（y=0.90, h=0.05 → 底部=0.875，与头顶 0.876 重叠连接）
    const crownBaseGeo = new THREE.CylinderGeometry(0.142, 0.122, 0.05, 48);
    const crownBase = new THREE.Mesh(crownBaseGeo, bodyMat);
    crownBase.position.y = 0.90;
    crownBase.castShadow = true;
    group.add(crownBase);
    addAccentRing(0.88, 0.138, 0.009);
    addAccentRing(0.92, 0.124, 0.009);

    // 中心大球（y=0.96, r=0.042 → 底部=0.918，与冠冕顶 0.925 重叠连接）
    const centerBallGeo = new THREE.SphereGeometry(0.042, 28, 22);
    const centerBall = new THREE.Mesh(centerBallGeo, accentMat);
    centerBall.position.y = 0.96;
    centerBall.castShadow = true;
    group.add(centerBall);

    // 5 个冠齿（位于冠冕顶部与中心球之间）
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const petalGeo = new THREE.SphereGeometry(0.032, 24, 18);
      const petal = new THREE.Mesh(petalGeo, accentMat);
      petal.position.set(
        Math.cos(angle) * 0.084,
        0.93,
        Math.sin(angle) * 0.084
      );
      petal.castShadow = true;
      group.add(petal);
    }

  // ========== 王 King ==========
  } else if (type === 'K') {
    const profile = [
      ...baseProfile(),
      new THREE.Vector2(0.205, 0.12),
      new THREE.Vector2(0.186, 0.22),
      new THREE.Vector2(0.136, 0.34),
      new THREE.Vector2(0.116, 0.46),
      new THREE.Vector2(0.142, 0.54),
      new THREE.Vector2(0.16, 0.60),
      // 颈部延伸 — 连接头部球体，消除分离间隙
      new THREE.Vector2(0.15, 0.66),
      new THREE.Vector2(0.118, 0.72),
      new THREE.Vector2(0.0, 0.74),
    ];
    group.add(createLathe(profile));

    // 底座装饰环
    addAccentRing(0.095, 0.23);
    addAccentRing(0.455, 0.116);

    // 粗厚项圈（深色对比）
    const collarBigGeo = new THREE.TorusGeometry(0.148, 0.014, 16, 56);
    const collarBig = new THREE.Mesh(collarBigGeo, accentMat);
    collarBig.position.y = 0.58;
    collarBig.rotation.x = Math.PI / 2;
    collarBig.castShadow = true;
    group.add(collarBig);

    // 头部球（y=0.80, r=0.128 → 底部=0.672，与颈部顶 0.74 重叠连接）
    const headGeo = new THREE.SphereGeometry(0.128, 48, 36);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 0.80;
    head.castShadow = true;
    group.add(head);
    addAccentRing(0.80, 0.126, 0.008);

    // 王冠基座（y=0.94, h=0.06 → 底部=0.91，与头顶 0.928 重叠连接）
    const crownBaseGeo = new THREE.CylinderGeometry(0.148, 0.128, 0.06, 48);
    const crownBase = new THREE.Mesh(crownBaseGeo, bodyMat);
    crownBase.position.y = 0.94;
    crownBase.castShadow = true;
    group.add(crownBase);
    addAccentRing(0.92, 0.142, 0.01);
    addAccentRing(0.97, 0.130, 0.01);

    // 十字架支柱（y=1.02, h=0.08 → 底部=0.98，与冠冕顶 0.97 重叠连接）
    const stemGeo = new THREE.CylinderGeometry(0.035, 0.042, 0.08, 20);
    const stem = new THREE.Mesh(stemGeo, accentMat);
    stem.position.y = 1.02;
    stem.castShadow = true;
    group.add(stem);

    // 十字架 - 垂直（y=1.12, h=0.15 → 底部=1.045，与支柱顶 1.06 重叠连接）
    const crossVGeo = new THREE.BoxGeometry(0.042, 0.15, 0.042);
    const crossV = new THREE.Mesh(crossVGeo, accentMat);
    crossV.position.y = 1.12;
    crossV.castShadow = true;
    group.add(crossV);

    // 十字架 - 水平（深色对比）
    const crossHGeo = new THREE.BoxGeometry(0.095, 0.042, 0.042);
    const crossH = new THREE.Mesh(crossHGeo, accentMat);
    crossH.position.y = 1.10;
    crossH.castShadow = true;
    group.add(crossH);
  }

  return group;
};

/** 从缓存获取棋子网格（克隆模板，共享几何体和材质，避免重复创建） */
const getCachedPieceMesh = (type: PieceType, color: PieceColor): THREE.Group => {
  const key = `${type}-${color}`;
  if (!pieceMeshCache.has(key)) {
    pieceMeshCache.set(key, createPieceMesh(type, color));
  }
  return (pieceMeshCache.get(key) as any).clone(true);
};

/** 释放棋子缓存（组件卸载时调用） */
const disposePieceCache = () => {
  for (const group of pieceMeshCache.values()) {
    const disposed = new Set<any>();
    group.traverse((c: any) => {
      if (c.geometry && !disposed.has(c.geometry)) { disposed.add(c.geometry); c.geometry.dispose(); }
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of mats) {
          if (!disposed.has(m)) { disposed.add(m); m.dispose(); }
          if (m.map) { m.map.dispose(); }
        }
      }
    });
  }
  pieceMeshCache.clear();
};

// ============ 棋盘创建 ============
const createBoardMesh = (): THREE.Group => {
  const group = new THREE.Group();

  // --- 外边框（深色） ---
  const outerBorderGeo = new THREE.BoxGeometry(
    BOARD_SIZE + BORDER_WIDTH * 2,
    BOARD_HEIGHT,
    BOARD_SIZE + BORDER_WIDTH * 2
  );
  const borderMaterial = new THREE.MeshStandardMaterial({
    color: BORDER_DARK,
    roughness: 0.6,
    metalness: 0.1,
  });
  const outerBorder = new THREE.Mesh(outerBorderGeo, borderMaterial);
  outerBorder.position.y = 0;
  outerBorder.castShadow = true;
  outerBorder.receiveShadow = true;
  group.add(outerBorder);

  // --- 内边框装饰 ---
  const innerBorderGeo = new THREE.BoxGeometry(
    BOARD_SIZE + BORDER_WIDTH * 0.4,
    BOARD_HEIGHT + 0.02,
    BOARD_SIZE + BORDER_WIDTH * 0.4
  );
  const innerBorderMat = new THREE.MeshStandardMaterial({
    color: BORDER_LIGHT,
    roughness: 0.5,
    metalness: 0.15,
  });
  const innerBorder = new THREE.Mesh(innerBorderGeo, innerBorderMat);
  innerBorder.position.y = 0.01;
  innerBorder.receiveShadow = true;
  group.add(innerBorder);

  // --- 64 个格子 ---
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      const squareGeo = new THREE.BoxGeometry(SQUARE_SIZE * 0.98, 0.02, SQUARE_SIZE * 0.98);
      const squareMat = new THREE.MeshStandardMaterial({
        color: isLight ? SQUARE_WHITE : SQUARE_BLACK,
        roughness: 0.5,
        metalness: 0.05,
        // polygonOffset 防止与棋盘底座 Z-fighting
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const square = new THREE.Mesh(squareGeo, squareMat);
      const [x, z] = squareToWorld(row, col);
      // 抬高 0.02 确保与底座有足够间距，避免 Z-fighting 花屏
      square.position.set(x, BOARD_HEIGHT / 2 + 0.03, z);
      square.receiveShadow = true;
      square.userData = { row, col, isSquare: true };
      group.add(square);
    }
  }

  // --- 文件和行标记 (a-h, 1-8) ---
  // 使用 Canvas 纹理生成文字坐标标记
  // 创建文字纹理，invert=true 时在Canvas内上下翻转180度绘制
  const createTextTexture = (text: string, invert = false): any => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    if (invert) {
      ctx.translate(64, 64);
      ctx.rotate(Math.PI);
      ctx.translate(-64, -64);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 90px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 68);
    ctx.restore();
    const texture = new (THREE as any).CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  };

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];
  for (let i = 0; i < 8; i++) {
    const file = FILES[i];
    const rank = RANKS[i];
    // 底部/左侧： invert=true（Canvas预先翻转，平面渲染后正立）
    // 顶部/右侧： invert=false（Canvas正立绘制，平面渲染后正好倒置）
    const fileTexBot = createTextTexture(file, true);
    const fileTexTop = createTextTexture(file, false);
    const rankTexLeft = createTextTexture(rank, true);
    const rankTexRight = createTextTexture(rank, false);
    const fileMatBot = new THREE.MeshStandardMaterial({ map: fileTexBot, transparent: true, roughness: 0.5, depthWrite: false });
    const fileMatTop = new THREE.MeshStandardMaterial({ map: fileTexTop, transparent: true, roughness: 0.5, depthWrite: false });
    const rankMatLeft = new THREE.MeshStandardMaterial({ map: rankTexLeft, transparent: true, roughness: 0.5, depthWrite: false });
    const rankMatRight = new THREE.MeshStandardMaterial({ map: rankTexRight, transparent: true, roughness: 0.5, depthWrite: false });
    const labelGeo = new THREE.PlaneGeometry(0.4, 0.4);

    // 文件标记 - 底部：a-h 从左到右，字母正立
    const [xBot] = squareToWorld(0, i);
    const labelBot = new THREE.Mesh(labelGeo, fileMatBot);
    labelBot.position.set(xBot, BOARD_HEIGHT / 2 + 0.06, -BOARD_SIZE / 2 - BORDER_WIDTH * 0.4);
    labelBot.rotation.x = -Math.PI / 2; // 水平放置，法线朝上
    group.add(labelBot);

    // 文件标记 - 顶部：a-h 从左到右，字母倒置
    const [xTop] = squareToWorld(0, i);
    const labelTop = new THREE.Mesh(labelGeo, fileMatTop);
    labelTop.position.set(xTop, BOARD_HEIGHT / 2 + 0.06, BOARD_SIZE / 2 + BORDER_WIDTH * 0.4);
    labelTop.rotation.x = -Math.PI / 2; // 水平放置，法线朝上
    group.add(labelTop);

    // 行标记 - 左侧：从上到下 1-8，数字垂直正立
    const [, zLeft] = squareToWorld(7 - i, 0);
    const labelLeft = new THREE.Mesh(labelGeo, rankMatLeft);
    labelLeft.position.set(-BOARD_SIZE / 2 - BORDER_WIDTH * 0.4, BOARD_HEIGHT / 2 + 0.06, zLeft);
    labelLeft.rotation.x = -Math.PI / 2;
    labelLeft.rotation.z = Math.PI / 2; // 垂直
    group.add(labelLeft);

    // 行标记 - 右侧：从上到下 1-8，数字垂直倒置
    const [, zRight] = squareToWorld(7 - i, 0);
    const labelRight = new THREE.Mesh(labelGeo, rankMatRight);
    labelRight.position.set(BOARD_SIZE / 2 + BORDER_WIDTH * 0.4, BOARD_HEIGHT / 2 + 0.06, zRight);
    labelRight.rotation.x = -Math.PI / 2;
    labelRight.rotation.z = Math.PI / 2; // 垂直
    group.add(labelRight);
  }

  return group;
};

// ============ 高亮标记创建 ============
const createHighlightMesh = (
  row: number,
  col: number,
  type: 'selected' | 'legal' | 'lastMove' | 'check' | 'hint'
): THREE.Object3D[] => {
  const [x, z] = squareToWorld(row, col);
  const group = new THREE.Group();
  const BasicMat = (THREE as any).MeshBasicMaterial;
  const LineBasicMat = (THREE as any).LineBasicMaterial;

  // legal 类型：蓝色圆点提示（类似 lichess/chess.com 风格）
  if (type === 'legal') {
    const dotGeo = new (THREE as any).CircleGeometry(0.16, 32);
    const dotMat = new BasicMat({
      color: 0x2196F3,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(x, BOARD_HEIGHT / 2 + 0.052, z);
    dot.rotation.x = -Math.PI / 2;
    dot.userData = { isHighlight: true, type, row, col };
    group.add(dot);
    return group.children;
  }

  // 其他类型配色
  const colors = {
    selected: { color: 0x4caf50, opacity: 0 },
    lastMove: { color: 0xff9800, opacity: 0.25 },
    check: { color: 0xf44336, opacity: 0.45 },
    hint: { color: 0x9c27b0, opacity: 0.35 },
  } as Record<string, { color: number; opacity: number }>;
  const borderColor = {
    selected: 0x00e676,
    lastMove: 0xff6f00,
    check: 0xd32f2f,
    hint: 0x6a1b9a,
  } as Record<string, number>;

  const config = colors[type];
  const bColor = borderColor[type];

  // 边框线
  const halfSize = type === 'selected' ? SQUARE_SIZE * 0.45 : SQUARE_SIZE * 0.42;
  const corners = [
    [-halfSize, -halfSize],
    [halfSize, -halfSize],
    [halfSize, halfSize],
    [-halfSize, halfSize],
  ];
  const linePoints: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = corners[i];
    const [x2, z2] = corners[(i + 1) % 4];
    linePoints.push(x + x1, BOARD_HEIGHT / 2 + 0.055, z + z1);
    linePoints.push(x + x2, BOARD_HEIGHT / 2 + 0.055, z + z2);
  }
  const lineGeo = new THREE.BufferGeometry() as any;
  lineGeo.setAttribute('position', new (THREE as any).Float32BufferAttribute(linePoints, 3));
  const lineMat = new LineBasicMat({
    color: bColor,
    transparent: true,
    opacity: type === 'selected' ? 1.0 : 0.9,
    depthWrite: false,
    depthTest: false,
  });
  const lines = new (THREE as any).LineSegments(lineGeo, lineMat);
  lines.userData = { isHighlight: true, type, row, col };
  group.add(lines);

  // 填充层（selected 类型无填充）
  if (config && config.opacity > 0) {
    const geo = new THREE.PlaneGeometry(SQUARE_SIZE * 0.80, SQUARE_SIZE * 0.80);
    const mat = new BasicMat({
      color: config.color,
      transparent: true,
      opacity: config.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, BOARD_HEIGHT / 2 + 0.05, z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData = { isHighlight: true, type, row, col };
    group.add(mesh);
  }

  // 选中效果：四角L形标记
  if (type === 'selected') {
    const cornerSize = 0.08;
    const cornerOffset = halfSize - cornerSize * 0.5;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * cornerOffset;
      const cz = z + sz * cornerOffset;
      const cornerGeo = new THREE.BufferGeometry() as any;
      const cPoints = sx * sz > 0
        ? [
            [cx - sx * cornerSize, BOARD_HEIGHT / 2 + 0.055, cz],
            [cx, BOARD_HEIGHT / 2 + 0.055, cz],
            [cx, BOARD_HEIGHT / 2 + 0.055, cz],
            [cx, BOARD_HEIGHT / 2 + 0.055, cz - sz * cornerSize],
          ]
        : [
            [cx + sx * cornerSize, BOARD_HEIGHT / 2 + 0.055, cz],
            [cx, BOARD_HEIGHT / 2 + 0.055, cz],
            [cx, BOARD_HEIGHT / 2 + 0.055, cz],
            [cx, BOARD_HEIGHT / 2 + 0.055, cz + sz * cornerSize],
          ];
      cornerGeo.setAttribute('position', new (THREE as any).Float32BufferAttribute(cPoints.flat(), 3));
      const cornerMat = new LineBasicMat({
        color: 0x00e676,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        depthTest: false,
      });
      const corner = new (THREE as any).LineSegments(cornerGeo, cornerMat);
      corner.userData = { isHighlight: true, type: 'selected', row, col };
      group.add(corner);
    }
  }

  // 非selected类型：外环边框
  if (type !== 'selected') {
    const borderGeo = new THREE.PlaneGeometry(SQUARE_SIZE * 0.92, SQUARE_SIZE * 0.92);
    const borderMat = new BasicMat({
      color: bColor,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.set(x, BOARD_HEIGHT / 2 + 0.048, z);
    borderMesh.rotation.x = -Math.PI / 2;
    borderMesh.userData = { isHighlight: true, type, row, col };
    group.add(borderMesh);
  }

  return group.children;
};

// ============ React 组件 ============
export interface ThreeJSChessBoardProps {
  board: Board;
  selectedSquare: [number, number] | null;
  legalTargets: [number, number][];
  lastMove: { from: [number, number]; to: [number, number] } | null;
  checkSquare: [number, number] | null;
  hint: { from: [number, number]; to: [number, number] } | null;
  highlightSquares?: [number, number][];
  onSquareClick: (row: number, col: number) => void;
  flipped?: boolean;
  readOnly?: boolean;
}

export const ThreeJSChessBoard: React.FC<ThreeJSChessBoardProps> = ({
  board,
  selectedSquare,
  legalTargets,
  lastMove,
  checkSquare,
  hint,
  onSquareClick,
  flipped = false,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const piecesGroupRef = useRef<THREE.Group | null>(null);
  const highlightsGroupRef = useRef<THREE.Group | null>(null);
  const boardGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseRef = useRef<THREE.Vector2 | null>(null);
  const needsRenderRef = useRef(true); // 按需渲染标志

  // --- 初始化 Three.js 场景 ---
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xC8C8C8);
    scene.fog = new THREE.Fog(0xC8C8C8, 18, 35);

    // 创建相机（白方视角：白棋在下靠近观察者，黑棋在上远离观察者）
    // 具体初始位置由下方 updateCameraFromSpherical 根据球面坐标确定
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);

    // 创建渲染器（alpha:false + logarithmicDepthBuffer 解决 Z-fighting 花屏）
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true,
    });
    (renderer as any).autoClear = true; // TS 类型缺失但实际存在
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = (THREE as any).PCFSoftShadowMap; // 软阴影
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3; // 提亮整体场景，突出白棋光影
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // --- 程序化环境反射贴图（增强高光塑料质感）---
    const pmremGenerator = new (THREE as any).PMREMGenerator(renderer);
    // 创建渐变环境纹理
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512;
    envCanvas.height = 256;
    const envCtx = envCanvas.getContext('2d')!;
    const gradient = envCtx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.2, '#f0f0f0');
    gradient.addColorStop(0.4, '#d8d8d8');
    gradient.addColorStop(0.6, '#a0a0a0');
    gradient.addColorStop(0.8, '#707070');
    gradient.addColorStop(1.0, '#3a3a3a');
    envCtx.fillStyle = gradient;
    envCtx.fillRect(0, 0, 512, 256);
    const envTexture = new (THREE as any).CanvasTexture(envCanvas);
    envTexture.mapping = 3; // EquirectangularReflectionMapping
    envTexture.needsUpdate = true;
    const envMap = pmremGenerator.fromEquirectangular(envTexture).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();

    // --- 光照系统：升级为真实摄影棚布光（三点布光 + 反光板 + 底光） ---
    // 环境光 - 柔和基础照明，提亮整体暗部
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    // 半球光 - 天空暖色/地面冷色，营造真实环境色温
    const hemi = new THREE.HemisphereLight(0xfff6e6, 0x3a4a5a, 0.55);
    hemi.position.set(0, 10, 0);
    scene.add(hemi);

    // 主光源 Key Light：暖白聚光灯，从观众右上方45°斜射（高过亮硬阴影）
    const mainLight = new THREE.DirectionalLight(0xfff1dd, 1.8);
    mainLight.position.set(6, 14, -7);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 40;
    mainLight.shadow.camera.left = -10;
    mainLight.shadow.camera.right = 10;
    mainLight.shadow.camera.top = 10;
    mainLight.shadow.camera.bottom = -10;
    mainLight.shadow.bias = -0.0005;
    mainLight.shadow.normalBias = 0.06;
    // radius 仅 VSMShadowMap 支持，已移除；通过更高分辨率 + 法线偏移改善软阴影
    scene.add(mainLight);

    // 补光 Fill Light：冷色调，从左侧补光，压暗阴影对比度
    const fillLight = new THREE.DirectionalLight(0xb8d0ff, 0.55);
    fillLight.position.set(-6, 9, -5);
    scene.add(fillLight);

    // 轮廓光 Rim Light：从背后下方勾勒棋子高光边缘（黑棋效果尤为明显）
    const rimLight = new THREE.DirectionalLight(0xfff0c8, 0.9);
    rimLight.position.set(0, 10, 8);
    scene.add(rimLight);

    // 底光 Ground Bounce：棋盘反射，模拟棋盘地面的反光
    const bounceLight = new THREE.PointLight(0xc0c0c0, 0.35, 12, 2.0);
    bounceLight.position.set(0, 0.2, 0);
    scene.add(bounceLight);

    // 顶部聚光 Ceiling Spot：营造棋桌上吊灯的氛围
    const spotLight = new THREE.SpotLight(0xffffff, 0.7, 25, Math.PI / 5, 0.4, 1.2);
    spotLight.position.set(0, 12, 0);
    spotLight.target.position.set(0, 0, 0);
    spotLight.castShadow = false;
    scene.add(spotLight);
    scene.add(spotLight.target);

    // --- 棋盘 ---
    const boardGroup = createBoardMesh();
    scene.add(boardGroup);

    // --- 棋子组 ---
    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);

    // --- 高亮组 ---
    const highlightsGroup = new THREE.Group();
    scene.add(highlightsGroup);

    // --- 地面平面（接收阴影） ---
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xB8B8B8,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -BOARD_HEIGHT / 2 - 0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- 保存引用 ---
    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    piecesGroupRef.current = piecesGroup;
    highlightsGroupRef.current = highlightsGroup;
    boardGroupRef.current = boardGroup;
    raycasterRef.current = new THREE.Raycaster();
    mouseRef.current = new THREE.Vector2();

    // --- 翻转处理 ---
    if (flipped) {
      boardGroup.rotation.y = Math.PI;
      piecesGroup.rotation.y = Math.PI;
      highlightsGroup.rotation.y = Math.PI;
    }

    // === 轨道相机控制（拖拽旋转 + 滚轮缩放）===
    // 使用球面坐标管理相机位置
    let cameraDistance = 12;       // 相机到原点的距离
    let cameraAngleX = Math.PI;    // 水平方位角（弧度），PI=从白方一侧看向棋盘
    let cameraAngleY = 0.9;        // 垂直俯仰角（弧度，0=正面，π/2=正上方）
    let cameraTargetX = 0;        // 相机注视目标X
    let cameraTargetY = 0;        // 相机注视目标Y
    let cameraTargetZ = 0;        // 相机注视目标Z
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartAngleX = 0;
    let dragStartAngleY = 0;

    // 根据球面坐标更新相机位置
    const updateCameraFromSpherical = () => {
      const r = cameraDistance;
      const sinY = Math.sin(cameraAngleY);
      camera.position.x = cameraTargetX + r * sinY * Math.sin(cameraAngleX);
      camera.position.y = cameraTargetY + r * Math.cos(cameraAngleY);
      camera.position.z = cameraTargetZ + r * sinY * Math.cos(cameraAngleX);
      camera.lookAt(cameraTargetX, cameraTargetY, cameraTargetZ);
      needsRenderRef.current = true;
    };
    updateCameraFromSpherical();

    // --- 鼠标按下：开始拖拽旋转 ---
    const handleMouseDown = (event: MouseEvent) => {
      isDragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragStartAngleX = cameraAngleX;
      dragStartAngleY = cameraAngleY;
      renderer.domElement.style.cursor = 'grabbing';
    };

    // --- 鼠标移动（拖拽时旋转视角） ---
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      // 水平拖拽 → 改变方位角（取反使棋盘跟随鼠标方向旋转）
      cameraAngleX = dragStartAngleX - dx * 0.008;
      // 垂直拖拽 → 改变俯仰角（取反使棋盘跟随鼠标方向倾斜，限制范围避免翻转）
      cameraAngleY = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, dragStartAngleY - dy * 0.008));
      updateCameraFromSpherical();
    };

    // --- 鼠标松开：结束拖拽 ---
    const handleMouseUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    // --- 滚轮缩放 ---
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      // 向上滚 → 放大（减小距离）；向下滚 → 缩小（增大距离）
      const scale = event.deltaY > 0 ? 1.1 : 0.9;
      cameraDistance = Math.max(6, Math.min(25, cameraDistance * scale));
      updateCameraFromSpherical();
    };

    // --- 鼠标点击处理（区分拖拽和点击） ---
    const handleCanvasClick = (event: MouseEvent) => {
      if (readOnly) return;
      // 如果是拖拽结束（移动距离>5px），不触发点击
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      if (isDragging || Math.abs(dx) > 5 || Math.abs(dy) > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (!mouseRef.current || !raycasterRef.current || !cameraRef.current) return;
      mouseRef.current.set(x, y);
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      // 获取棋盘格子进行 raycast
      const squares: THREE.Object3D[] = [];
      boardGroup.traverse((child) => {
        if (child.userData.isSquare) {
          squares.push(child);
        }
      });

      const intersects = raycasterRef.current.intersectObjects(squares, false);
      if (intersects.length > 0) {
        const hit = intersects[0];
        const obj = hit.object;
        // 棋盘翻转时，boardGroup 整体旋转了 180°，
        // 但方块 mesh 的 userData.row/col 仍是正确的逻辑坐标，
        // raycaster 击中的就是实际逻辑格子，无需额外转换
        onSquareClick(obj.userData.row, obj.userData.col);
      }
    };

    // --- 触摸支持（移动端拖拽旋转 + 双指缩放） ---
    let touchStartDist = 0;
    let touchStartCameraDist = 0;
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        isDragging = true;
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
      }
    };
    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      if (event.touches.length === 1 && isDragging) {
        const dx = event.touches[0].clientX - dragStartX;
        const dy = event.touches[0].clientY - dragStartY;
        cameraAngleX = dragStartAngleX - dx * 0.008;
        cameraAngleY = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, dragStartAngleY - dy * 0.008));
        updateCameraFromSpherical();
      } else if (event.touches.length === 2) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (touchStartDist > 0) {
          cameraDistance = Math.max(6, Math.min(25, touchStartCameraDist * (touchStartDist / dist)));
          updateCameraFromSpherical();
        }
      }
    };
    const handleTouchEnd = () => {
      isDragging = false;
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('mouseleave', handleMouseUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    renderer.domElement.addEventListener('click', handleCanvasClick);
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', handleTouchEnd);

    // --- 容器大小变化监听（ResizeObserver 替代 window resize）---
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      needsRenderRef.current = true;
    };
    // 监听容器尺寸变化（模块切换、布局调整等）
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);
    // 同时保留 window resize 监听
    window.addEventListener('resize', handleResize);

    // --- 渲染循环（按需渲染：仅在场景变化时渲染，降低GPU占用）---
    let autoRotateSpeed = 0;       // 调试用：每帧绕Y轴角度增量（弧度）
    let autoRotateTarget = 0;      // 调试用：自动旋转到指定角度（角度制），-1 表示持续自由旋转
    const animate = () => {
      if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return;
      // ===== 调试自动旋转控制 =====
      if (autoRotateSpeed !== 0) {
        if (autoRotateTarget === -1) {
          cameraAngleX += autoRotateSpeed;
        } else {
          const targetRad = autoRotateTarget * Math.PI / 180;
          const delta = ((targetRad - cameraAngleX) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const diff = delta > Math.PI ? delta - Math.PI * 2 : delta;
          if (Math.abs(diff) < 0.004) {
            cameraAngleX = targetRad;
            autoRotateSpeed = 0;
            autoRotateTarget = 0;
          } else {
            cameraAngleX += Math.sign(diff) * Math.min(Math.abs(diff), Math.abs(autoRotateSpeed));
          }
        }
        updateCameraFromSpherical();
        needsRenderRef.current = true;
      }
      // 仅在需要时渲染
      if (needsRenderRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        needsRenderRef.current = false;
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    // ===== 测试场景调试 API（挂到 window，供控制台或自动化测试调用）=====
    // 用法：
    //   __CHESS_DEBUG.setCamera({ distance: 4.2, angleDeg: 0, pitchDeg: 42 }) // 马头特写视角
    //   __CHESS_DEBUG.rotateTo(0);   // 转到右前 0° 并停止
    //   __CHESS_DEBUG.spin(true);    // 启动持续旋转
    //   __CHESS_DEBUG.spin(false);   // 停止旋转
    (window as any).__CHESS_DEBUG = {
      /** 设置相机球面坐标（angleDeg 为水平角度，0=右前（马头右前方），90=正左方，180=后颈，270=右方 */
      setCamera: (opts: { distance?: number; angleDeg?: number; pitchDeg?: number; target?: [number, number, number] }) => {
        if (opts.distance != null) cameraDistance = Math.max(3, Math.min(25, opts.distance));
        if (opts.angleDeg != null) {
          cameraAngleX = opts.angleDeg * Math.PI / 180;
          autoRotateTarget = 0; autoRotateSpeed = 0;
        }
        if (opts.pitchDeg != null) cameraAngleY = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, opts.pitchDeg * Math.PI / 180));
        if (opts.target) {
          cameraTargetX = opts.target[0];
          cameraTargetY = opts.target[1];
          cameraTargetZ = opts.target[2];
        }
        updateCameraFromSpherical();
        return { cameraDistance, cameraAngleX, cameraAngleY, cameraTargetX, cameraTargetY, cameraTargetZ };
      },
      /** 平滑旋转到指定角度（度） */
      rotateTo: (angleDeg: number, speed = 0.06) => {
        autoRotateTarget = angleDeg;
        autoRotateSpeed = speed;
      },
      /** 启动/停止持续自由旋转 */
      spin: (enable: boolean, speedDegPerFrame = 0.9) => {
        autoRotateTarget = enable ? -1 : 0;
        autoRotateSpeed = enable ? speedDegPerFrame * Math.PI / 180 : 0;
      },
      /** 立即获取当前相机状态 */
      getState: () => ({
        cameraDistance,
        cameraAngleXDeg: cameraAngleX * 180 / Math.PI,
        cameraAngleYDeg: cameraAngleY * 180 / Math.PI,
      }),
      scene,
      camera,
      renderer,
      boardGroup,
      piecesGroup,
    };

    // --- 清理 ---
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('mouseleave', handleMouseUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('click', handleCanvasClick);
      renderer.domElement.removeEventListener('touchstart', handleTouchStart);
      renderer.domElement.removeEventListener('touchmove', handleTouchMove);
      renderer.domElement.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();

      // 释放 boardGroup 资源（64 格子 + 边框 + 坐标标签纹理）
      const disposed = new Set<any>();
      boardGroup.traverse((c: any) => {
        if (c.geometry && !disposed.has(c.geometry)) { disposed.add(c.geometry); c.geometry.dispose(); }
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) {
            if (!disposed.has(m)) { disposed.add(m); m.dispose(); }
            if (m.map) { m.map.dispose(); }
          }
        }
      });
      // 释放地面资源
      groundGeo.dispose();
      groundMat.dispose();
      // 释放环境贴图
      envTexture.dispose();
      envMap.dispose();

      container.removeChild(renderer.domElement);
      renderer.dispose();
      disposePieceCache();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, readOnly]);

  // --- 更新棋子（使用缓存克隆，避免重建几何体/材质） ---
  useEffect(() => {
    if (!piecesGroupRef.current) return;
    // 清除旧棋子（无需 dispose，几何体/材质由缓存管理）
    (piecesGroupRef.current as any).clear();

    // 添加新棋子（从缓存克隆，共享几何体和材质）
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const char = board[row][col];
        if (!char) continue;
        const type = pieceTypeFromChar(char);
        if (!type) continue;
        const color = pieceColorFromChar(char);
        const pieceMesh = getCachedPieceMesh(type, color);
        const [x, z] = squareToWorld(row, col);
        pieceMesh.position.set(x, PIECE_BASE_Y, z);
        piecesGroupRef.current.add(pieceMesh);
      }
    }
    if (needsRenderRef.current !== undefined) needsRenderRef.current = true;
  }, [board]);

  // --- 更新高亮 ---
  useEffect(() => {
    if (!highlightsGroupRef.current) return;
    // 清除旧高亮
    while (highlightsGroupRef.current.children.length > 0) {
      const child = highlightsGroupRef.current.children[0];
      highlightsGroupRef.current.remove(child);
      // 清理几何体和材质（使用 Set 避免重复 dispose）
      const disposed = new Set<any>();
      child.traverse((c: any) => {
        if (c.geometry && !disposed.has(c.geometry)) {
          disposed.add(c.geometry);
          c.geometry.dispose();
        }
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) {
            if (!disposed.has(m)) {
              disposed.add(m);
              m.dispose();
            }
          }
        }
      });
    }

    // 添加新高亮
    const addHighlight = (row: number, col: number, type: 'selected' | 'legal' | 'lastMove' | 'check' | 'hint') => {
      const highlights = createHighlightMesh(row, col, type);
      highlights.forEach((mesh) => {
        highlightsGroupRef.current!.add(mesh);
      });
    };

    if (selectedSquare) {
      addHighlight(selectedSquare[0], selectedSquare[1], 'selected');
    }
    legalTargets.forEach(([r, c]) => addHighlight(r, c, 'legal'));
    if (lastMove) {
      addHighlight(lastMove.from[0], lastMove.from[1], 'lastMove');
      addHighlight(lastMove.to[0], lastMove.to[1], 'lastMove');
    }
    if (checkSquare) {
      addHighlight(checkSquare[0], checkSquare[1], 'check');
    }
    if (hint) {
      addHighlight(hint.from[0], hint.from[1], 'hint');
      addHighlight(hint.to[0], hint.to[1], 'hint');
    }
    needsRenderRef.current = true;
  }, [selectedSquare, legalTargets, lastMove, checkSquare, hint]);

  return (
    <div
      ref={containerRef}
      className="threejs-chess-board"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'radial-gradient(ellipse at center, #d8d8d8 0%, #c0c0c0 70%, #a8a8a8 100%)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)',
      }}
    />
  );
};

export default ThreeJSChessBoard;
