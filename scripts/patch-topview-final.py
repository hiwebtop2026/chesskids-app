# -*- coding: utf-8 -*-
# 1) 3D：俯视黑白分明——去除环境反射灰调（黑子纯黑哑光/白子纯白）、半球光降低、接触阴影增强
# 2) 2D：白子加深色轮廓（与木色棋盘区分）
import io

p3 = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p3, encoding='utf-8').read()
def rep(old, new, f):
    if old in f:
        f = f.replace(old, new)
    else:
        print('3D MISS:', old[:60])
    return f

# 环境反射几乎关闭（灰调根源）
s = rep("scene.environmentIntensity = 0.55;", "scene.environmentIntensity = 0.12;", s)
# 环境光/半球光降低（俯视黑子不泛灰）
s = rep("scene.add(new T.AmbientLight(0xffffff, 0.3));", "scene.add(new T.AmbientLight(0xffffff, 0.2));", s)
s = rep("const hemi = new T.HemisphereLight(0xffffff, 0x806040, 0.45);", "const hemi = new T.HemisphereLight(0xffffff, 0x806040, 0.22);", s)
# 黑子：全哑光纯黑（俯视纯黑）
s = rep("""      color: 0x101010,
      roughness: 0.32,
      metalness: 0,
      clearcoat: 0.38,
      clearcoatRoughness: 0.3,
      specularIntensity: 0.45,
      specularColor: 0xd0c8b8,""",
"""      color: 0x0c0c0c,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.5,
      specularIntensity: 0.15,
      specularColor: 0xaaa08e,""", s)
# 白子：纯白为主，轻微光泽（俯视依然白）
s = rep("""      color: 0xf8f3e7,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.12,
      specularIntensity: 0.5,
      specularColor: 0xefe7d4,""",
"""      color: 0xfaf6ec,
      roughness: 0.14,
      metalness: 0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.2,
      specularIntensity: 0.3,
      specularColor: 0xf2ead8,""", s)
# 接触阴影增强（棋子与棋盘分隔更立体）
s = rep("""    const shadowMat = new T.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false,
    });""",
"""    const shadowMat = new T.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false,
    });""", s)
# 环境贴图柔光带减弱（反射更弱）
s = rep("grad.addColorStop(0, '#efe8da');", "grad.addColorStop(0, '#c9c2b0');", s)
s = rep("grad.addColorStop(0.22, '#e0d8c6');", "grad.addColorStop(0.22, '#b4ac98');", s)
io.open(p3, 'w', encoding='utf-8', newline='').write(s)
print('3D contrast fix done')

# ---- 2D：白子轮廓可见 ----
p2 = r'src\components\GoBoard.tsx'
s2 = io.open(p2, encoding='utf-8').read()
old_white = """          fill={isB ? '#141414' : '#f8f3e7'}
          stroke={isB ? '#000' : '#a8a090'}"""
new_white = """          fill={isB ? '#141414' : '#fdfdf9'}
          stroke={isB ? '#000' : '#5a5548'}"""
if old_white in s2:
    s2 = s2.replace(old_white, new_white)
else:
    print('2D MISS: white stone fill')
io.open(p2, 'w', encoding='utf-8', newline='').write(s2)
print('2D white stone outline fixed')
