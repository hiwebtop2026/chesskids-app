# -*- coding: utf-8 -*-
# 大幅增强黑白对比：黑子纯哑光深黑 / 白子纯白亮面；环境光减半、主光收敛、exposure 收紧
import io

p = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p, encoding='utf-8').read()

# 1) 灯光：环境光减半（俯视黑白对比关键）、主光略收敛
old_light = """    scene.add(new T.AmbientLight(0xffffff, 0.45));
    const hemi = new T.HemisphereLight(0xffffff, 0x806040, 0.5);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd0ff, 0.32);
    fill.position.set(-8, 6, -6);
    scene.add(fill);"""
new_light = """    scene.add(new T.AmbientLight(0xffffff, 0.24));
    const hemi = new T.HemisphereLight(0xffffff, 0x70563a, 0.3);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff2dd, 1.25);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd0ff, 0.22);
    fill.position.set(-8, 6, -6);
    scene.add(fill);"""
assert old_light in s
s = s.replace(old_light, new_light)

# 2) toneMappingExposure 收紧
old_tm = "    renderer.toneMappingExposure = 1.12;"
new_tm = "    renderer.toneMappingExposure = 0.98;"
assert old_tm in s
s = s.replace(old_tm, new_tm)

# 3) 棋子材质：黑子近纯黑+全哑光无高光；白子纯白+微光
old_mat = """    const blackMat = new T.MeshPhysicalMaterial({
      color: 0x0e0e0e,        // 近纯黑
      roughness: 0.42,        // 哑光：抑制高光泛灰
      metalness: 0,
      clearcoat: 0.35,        // 弱高光，保留一点瓷感
      clearcoatRoughness: 0.5,
    });
    const whiteMat = new T.MeshPhysicalMaterial({
      color: 0xfdfcf7,        // 近纯白
      roughness: 0.1,         // 亮面
      metalness: 0,
      clearcoat: 0.55,        // 瓷白光感
      clearcoatRoughness: 0.15,
    });"""
new_mat = """    const blackMat = new T.MeshPhysicalMaterial({
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
assert old_mat in s
s = s.replace(old_mat, new_mat)

# 4) 背景色略加深（增强对比）
s = s.replace("scene.background = new T.Color(0x9a9078);", "scene.background = new T.Color(0x8d8468);")
s = s.replace("scene.fog = new T.Fog(0x9a9078, 26, 54);", "scene.fog = new T.Fog(0x8d8468, 26, 54);")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('contrast patch applied')
