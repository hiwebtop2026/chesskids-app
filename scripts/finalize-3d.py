# -*- coding: utf-8 -*-
import io, os

# 1) 清理脚本
for f in ['scripts/update-golocal.py', 'scripts/update-index.py', 'scripts/rewrite-3dgo.py',
          'scripts/fix-3dgo-types.py', 'scripts/fix-3dgo-types2.py']:
    if os.path.exists(f):
        os.remove(f)
        print('removed', f)

# 2) CHANGELOG 追加 3D 条目
p = 'CHANGELOG-xiangqi.md'
s = io.open(p, encoding='utf-8').read()
entry = '''
## 2026-09-27（日）：围棋新增 3D 立体棋盘与棋子（参考真实围棋质感）

### 新增内容
- **3D 棋盘组件** src/components/ThreeJSGoBoard.tsx：Three.js（CDN 0.160）立体场景
  - **棋子**：LatheGeometry 透镜状凸面剖面（中心厚边缘薄，参考真实云子/贝壳棋子）；黑子乌黑高光（clearcoat 0.9）、白子温润光泽（clearcoat 1.0），阴影+ACES 色调映射
  - **棋盘**：Canvas 木纹纹理棋盘、深木边框、网格线、星位；支持 9/13/19 路动态网格
  - 落子动画（新子从上方落下）、last move 红色标记、提示蓝环、hover 落点高亮、领地半透明标记
  - 相机按容器宽高比自动取景（ResizeObserver 自适应，浮动窗口可用）、视角翻转（执白自动旋转）
  - 射线点击找最近交叉点；WebGL 初始化失败回退提示；全局单一活跃渲染器防 context 泄漏
- **人机对战（GoGame）/ 双人对战（GoLocalGame）**：新增「3D 棋盘 / 2D 棋盘」视图切换按钮（默认按 WebGL 支持自动选 3D）
- 样式：view-switch-row / view-tab-btn / go-board-3d / go-3d-fallback

### 验证
- tsc --noEmit、vite build 通过
- 浏览器实测：围棋 → 人机对战 → 默认 3D 棋盘渲染（木纹+天元）→ 落子 → AI 应手 → 落子记录，全部正常；3D/2D 切换按钮可用
'''
io.open(p, 'w', encoding='utf-8', newline='').write(s + entry)
print('CHANGELOG updated')
