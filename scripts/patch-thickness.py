# -*- coding: utf-8 -*-
# 棋子加厚：真实云子厚度（高宽比≈1:4）——立体感来自侧弧面
import io

p = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p, encoding='utf-8').read()

old = """// 棋子：椭圆扁圆（参考真实云子/贝壳棋子——凸度低、中央平缓、边缘圆润收薄）
const PIECE_RADIUS = CELL * 0.43;
const PIECE_CENTER_H = PIECE_RADIUS * 0.16;  // 中心最高（真实云子凸度约直径5%）
const PIECE_EDGE_H = PIECE_RADIUS * 0.05;    // 边缘厚度（微弧）"""
new = """// 棋子：厚实圆润（参考真实云子——中心厚、边缘圆润收薄，高宽比≈1:4 有立体厚度）
const PIECE_RADIUS = CELL * 0.43;
const PIECE_CENTER_H = PIECE_RADIUS * 0.42;  // 中心最高（真实云子厚度）
const PIECE_EDGE_H = PIECE_RADIUS * 0.15;    // 边缘厚度（圆润收薄）"""
assert old in s
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('stone thickness fixed')
