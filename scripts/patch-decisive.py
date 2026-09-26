# -*- coding: utf-8 -*-
import io
p = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p, encoding='utf-8').read()
def rep(old, new, f):
    if old in f:
        f = f.replace(old, new)
    else:
        print('MISS:', old[:70])
    return f

s = rep("""      color: 0x0c0c0c,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.5,
      specularIntensity: 0.15,
      specularColor: 0xaaa08e,""",
"""      color: 0x050505,
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.6,
      specularIntensity: 0.1,
      specularColor: 0x8a8068,""", s)

s = rep("const sun = new T.DirectionalLight(0xfff2dd, 1.2);",
        "const sun = new T.DirectionalLight(0xfff2dd, 0.8);", s)

s = rep("renderer.toneMappingExposure = 1.05;", "renderer.toneMappingExposure = 1.0;", s)

s = rep("const BOARD_TOP = '#d9a665';       // 棋盘面：暖木色",
        "const BOARD_TOP = '#c29155';       // 棋盘面：暖木色（略深，衬托白子）", s)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('decisive contrast fix applied')
