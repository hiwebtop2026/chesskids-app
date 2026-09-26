# -*- coding: utf-8 -*-
# 俯视黑白分明修正（根因：clearcoat 镜面高光与 albedo 无关，俯视时黑子顶部大片高光→泛灰）：
# 黑子 clearcoat/specular 降低（俯视纯黑、斜视仍有光泽）；白子瓷白保持
import io

p = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p, encoding='utf-8').read()

old_mat = """    // 黑子：乌黑、细腻光泽（真实云子亚光漆感，柔和高光不泛灰）
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
new_mat = """    // 黑子：乌黑、哑光为主（俯视纯黑不泛灰），斜视保留柔和光泽
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
    });"""
assert old_mat in s
s = s.replace(old_mat, new_mat)

# 环境反射再柔和（顶部柔光减弱，避免俯视黑子反射白）
old_env = """    scene.environment = envTex;
    scene.environmentIntensity = 0.7;"""
new_env = """    scene.environment = envTex;
    scene.environmentIntensity = 0.55;"""
assert old_env in s
s = s.replace(old_env, new_env)

# 环境贴图顶部调暗（俯视反射源不发白）
old_grad = """  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.22, '#ede6d8');"""
new_grad = """  grad.addColorStop(0, '#efe8da');
  grad.addColorStop(0.22, '#e0d8c6');"""
assert old_grad in s
s = s.replace(old_grad, new_grad)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('top-view contrast fix applied')
