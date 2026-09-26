# -*- coding: utf-8 -*-
# 按用户认可的真实围棋照片（f67ee26d）设计：
# 扁平圆润棋子 + 细腻光泽（非镜面哑光）+ 深棕网格线 + 柔和均匀光线 + 暖褐背景
import io

p = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p, encoding='utf-8').read()

# 1) 网格线：深棕黑（真实棋盘线）
old_line = "const LINE_COLOR = '#3a2410';      // 网格线"
new_line = "const LINE_COLOR = '#33200e';      // 网格线（真实棋盘：深棕黑）"
assert old_line in s
s = s.replace(old_line, new_line)

# 2) 凸度：0.18 → 0.16（真实扁平圆润）
old_c = """const PIECE_CENTER_H = PIECE_RADIUS * 0.18;  // 中心最高（真实云子凸度约直径5%）"""
new_c = """const PIECE_CENTER_H = PIECE_RADIUS * 0.16;  // 中心最高（真实云子凸度约直径5%）"""
assert old_c in s
s = s.replace(old_c, new_c)

# 3) 材质：细腻光泽（黑子乌黑柔光 / 白子乳白柔光）
old_mat = """    // 黑子：乌黑光滑（云子质感），小面积镜面高光显立体
    const blackMat = new T.MeshPhysicalMaterial({
      color: 0x0a0a0a,
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.1,
      clearcoatRoughness: 0.8,
    });
    // 白子：温润贝壳白，瓷亮
    const whiteMat = new T.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
    });"""
new_mat = """    // 黑子：乌黑、细腻光泽（真实云子亚光漆感，柔和高光不泛灰）
    const blackMat = new T.MeshPhysicalMaterial({
      color: 0x141414,
      roughness: 0.2,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      specularIntensity: 0.65,
      specularColor: 0xd8d0c0,
    });
    // 白子：乳白温润、瓷光
    const whiteMat = new T.MeshPhysicalMaterial({
      color: 0xf7f2e6,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 0.65,
      clearcoatRoughness: 0.1,
      specularIntensity: 0.55,
      specularColor: 0xefe7d4,
    });"""
assert old_mat in s
s = s.replace(old_mat, new_mat)

# 4) 环境反射柔和
old_env = """    scene.environment = envTex;
    scene.environmentIntensity = 1.0;"""
new_env = """    scene.environment = envTex;
    scene.environmentIntensity = 0.7;"""
assert old_env in s
s = s.replace(old_env, new_env)

# 5) 灯光：柔和均匀（真实照片漫射光）
old_sun = """    scene.add(new T.AmbientLight(0xffffff, 0.22));
    const hemi = new T.HemisphereLight(0xffffff, 0x70563a, 0.32);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff2dd, 1.45);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd0ff, 0.25);"""
new_sun = """    scene.add(new T.AmbientLight(0xffffff, 0.3));
    const hemi = new T.HemisphereLight(0xffffff, 0x806040, 0.45);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff2dd, 1.2);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd0ff, 0.25);"""
assert old_sun in s
s = s.replace(old_sun, new_sun)

# 6) exposure 柔和提亮
s = s.replace("    renderer.toneMappingExposure = 1.02;", "    renderer.toneMappingExposure = 1.05;")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('real-photo style applied')
