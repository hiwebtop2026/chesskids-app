# -*- coding: utf-8 -*-
# 重新设计棋子3D效果（参考真实围棋云子特写）：
# 1) 椭圆扁圆剖面（凸度 0.18×R，中央平缓、边缘圆润收薄）
# 2) 黑子乌黑光滑 / 白子温润光泽 + 镜面反射 + 程序化环境贴图（摄影棚柔光）
# 3) 木纹年轮弧线增强真实感
import io

p = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p, encoding='utf-8').read()

# ---- 1) 棋子凸度常量 ----
old_c = """// 棋子：透镜状凸面（参考真实云子/贝壳棋子比例）
const PIECE_RADIUS = CELL * 0.43;
const PIECE_CENTER_H = PIECE_RADIUS * 0.5;   // 中心最高
const PIECE_EDGE_H = PIECE_RADIUS * 0.09;    // 边缘厚度（微弧）"""
new_c = """// 棋子：椭圆扁圆（参考真实云子/贝壳棋子——凸度低、中央平缓、边缘圆润收薄）
const PIECE_RADIUS = CELL * 0.43;
const PIECE_CENTER_H = PIECE_RADIUS * 0.18;  // 中心最高（真实云子凸度约直径5%）
const PIECE_EDGE_H = PIECE_RADIUS * 0.05;    // 边缘厚度（微弧）"""
assert old_c in s
s = s.replace(old_c, new_c)

# ---- 2) 剖面几何：椭圆扁圆 ----
old_g = """function makeStoneGeometry(): any {
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
}"""
new_g = """function makeStoneGeometry(): any {
  const pts: any[] = [];
  const r = PIECE_RADIUS;
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;               // 0=中心, 1=边缘
    const x = r * t;
    // 椭圆扁圆剖面：中央平缓（斜率0），边缘圆润收薄到底
    const y = PIECE_EDGE_H + (PIECE_CENTER_H - PIECE_EDGE_H) * Math.sqrt(Math.max(0, 1 - t * t));
    pts.push(new T.Vector2(x, y));
  }
  // 底缘微倒角（更圆润）
  pts.push(new T.Vector2(r * 0.995, PIECE_EDGE_H * 0.35));
  const geo = new T.LatheGeometry(pts, 40);
  return geo;
}"""
assert old_g in s
s = s.replace(old_g, new_g)

# ---- 3) 环境贴图（摄影棚柔光，真实镜面反射的关键）----
old_tex = """/** 生成木质纹理（Canvas：木纹条纹 + 柔和噪点） */"""
new_tex = """/** 生成程序化环境贴图（摄影棚柔光：顶部亮、四周暗，用于棋子镜面反射） */
function makeEnvTexture(): any {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.22, '#ede6d8');
  grad.addColorStop(0.55, '#a89a80');
  grad.addColorStop(1, '#3f392e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // 柔光带（增加反射层次）
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, size, size * 0.3);
  const images: any[] = [];
  for (let i = 0; i < 6; i++) images.push(canvas);
  const cube = new T.CubeTexture(images);
  cube.needsUpdate = true;
  return cube;
}

/** 生成木质纹理（Canvas：年轮弧线 + 木纹条纹 + 柔和噪点） */"""
assert old_tex in s
s = s.replace(old_tex, new_tex, 1)

# ---- 4) 木纹年轮弧线 ----
old_wood = """  ctx.fillStyle = BOARD_TOP;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i++) {"""
new_wood = """  ctx.fillStyle = BOARD_TOP;
  ctx.fillRect(0, 0, 512, 512);
  // 年轮弧线（真实木纹层次）
  const cx = 200 + (Math.random() * 2 - 1) * 60;
  const cy = 260 + (Math.random() * 2 - 1) * 60;
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(138, 88, 38, ${0.045 + Math.random() * 0.05})`;
    ctx.lineWidth = 1.5 + Math.random() * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 30 + i * 24 + Math.random() * 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {"""
assert old_wood in s
s = s.replace(old_wood, new_wood)

# ---- 5) 初始化时挂载环境贴图 ----
old_env = """    renderer.outputColorSpace = T.SRGBColorSpace;
    container.appendChild(renderer.domElement);"""
new_env = """    renderer.outputColorSpace = T.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 环境贴图（棋子镜面反射的柔光来源，提升立体感）
    const envTex = makeEnvTexture();
    scene.environment = envTex;
    scene.environmentIntensity = 0.85;"""
assert old_env in s
s = s.replace(old_env, new_env)

# ---- 6) 棋子材质：光滑乌黑 / 温润白 + 镜面反射 ----
old_mat = """    const blackMat = new T.MeshPhysicalMaterial({
      color: 0x0a0a0a,        // 极深黑（俯视也纯黑）
      roughness: 0.72,        // 全哑光：顶部不泛灰
      metalness: 0,
      clearcoat: 0.1,         // 几乎无高光
      clearcoatRoughness: 0.8,
    });
    const whiteMat = new T.MeshPhysicalMaterial({
      color: 0xffffff,        // 纯白（俯视也纯白）
      roughness: 0.08,        // 亮面
      metalness: 0,
      clearcoat: 0.2,         // 微光瓷感（不再过曝）
      clearcoatRoughness: 0.3,
    });"""
new_mat = """    // 黑子：乌黑光滑（云子质感），小面积镜面高光显立体
    const blackMat = new T.MeshPhysicalMaterial({
      color: 0x0d0d0d,
      roughness: 0.16,
      metalness: 0,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      specularIntensity: 0.9,
      specularColor: 0xdfd8cc,
    });
    // 白子：温润贝壳白，瓷光
    const whiteMat = new T.MeshPhysicalMaterial({
      color: 0xf6f1e6,
      roughness: 0.1,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.08,
      specularIntensity: 0.6,
      specularColor: 0xf2ead8,
    });"""
assert old_mat in s
s = s.replace(old_mat, new_mat)

# ---- 7) 主光略增（凸度降低后顶部高光更集中，黑白依然分明）+ 环境光保持低 ----
old_sun = """    const sun = new T.DirectionalLight(0xfff2dd, 1.25);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd0ff, 0.22);"""
new_sun = """    const sun = new T.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd0ff, 0.25);"""
assert old_sun in s
s = s.replace(old_sun, new_sun)

# ---- 8) exposure 微调 ----
s = s.replace("    renderer.toneMappingExposure = 0.98;", "    renderer.toneMappingExposure = 1.02;")

# ---- 9) 清理时释放环境贴图 ----
old_dispose = """      woodTex.dispose();
      lineGeo.dispose();"""
new_dispose = """      woodTex.dispose();
      if (scene.environment) scene.environment.dispose();
      lineGeo.dispose();"""
assert old_dispose in s
s = s.replace(old_dispose, new_dispose)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('stone redesign applied')
