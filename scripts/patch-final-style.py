# -*- coding: utf-8 -*-
# 最终综合补丁（按用户认可的真实围棋照片 f67ee26d + 俯视分明 b0598025）：
import io

p = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p, encoding='utf-8').read()
def rep(old, new):
    global s
    if old in s:
        s = s.replace(old, new)
    else:
        print('MISS:', old[:70])

# 1) 网格线深棕黑
rep("const LINE_COLOR = '#3a2410';      // 网格线",
    "const LINE_COLOR = '#33200e';      // 网格线（真实棋盘：深棕黑）")

# 2) 凸度 0.16（真实扁平圆润）
rep("const PIECE_CENTER_H = PIECE_RADIUS * 0.18;  // 中心最高（真实云子凸度约直径5%）",
    "const PIECE_CENTER_H = PIECE_RADIUS * 0.16;  // 中心最高（真实云子凸度约直径5%）")

# 3) 环境贴图顶部调暗（俯视反射不发白）
rep("grad.addColorStop(0, '#ffffff');\n  grad.addColorStop(0.22, '#ede6d8');",
    "grad.addColorStop(0, '#efe8da');\n  grad.addColorStop(0.22, '#e0d8c6');")

# 4) 环境反射柔和
rep("scene.environmentIntensity = 0.85;", "scene.environmentIntensity = 0.55;")

# 5) 灯光柔和均匀
rep("scene.add(new T.AmbientLight(0xffffff, 0.24));",
    "scene.add(new T.AmbientLight(0xffffff, 0.3));")
rep("const hemi = new T.HemisphereLight(0xffffff, 0x70563a, 0.3);",
    "const hemi = new T.HemisphereLight(0xffffff, 0x806040, 0.45);")
rep("const sun = new T.DirectionalLight(0xfff2dd, 1.5);",
    "const sun = new T.DirectionalLight(0xfff2dd, 1.2);")

# 6) exposure 柔和提亮
rep("renderer.toneMappingExposure = 1.02;", "renderer.toneMappingExposure = 1.05;")

# 7) 材质：黑子哑光黑（俯视纯黑）/ 白子瓷白（俯视白亮）
rep("""    // 黑/白子材质：深黑哑光（低高光不泛灰）vs 纯白亮面（光泽温润），黑白对比分明
    // 黑子：乌黑光滑（云子质感），小面积镜面高光显立体
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
    });""",
"""    // 黑子：乌黑、哑光为主（俯视纯黑不泛灰），斜视保留柔和光泽
    const blackMat = new T.MeshPhysicalMaterial({
      color: 0x101010,
      roughness: 0.32,
      metalness: 0,
      clearcoat: 0.38,
      clearcoatRoughness: 0.3,
      specularIntensity: 0.45,
      specularColor: 0xd0c8b8,
    });
    // 白子：乳白温润、瓷光（俯视依然白亮）
    const whiteMat = new T.MeshPhysicalMaterial({
      color: 0xf8f3e7,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.12,
      specularIntensity: 0.5,
      specularColor: 0xefe7d4,
    });""")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('final style patch applied')
