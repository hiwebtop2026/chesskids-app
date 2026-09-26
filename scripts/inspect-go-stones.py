# -*- coding: utf-8 -*-
import io, re

# 1) go.ts 的颜色定义
s = io.open(r'src\engine\go.ts', encoding='utf-8').read()
for m in re.finditer(r'(export type GoColor[^\n]*|type GoColor[^\n]*|\'b\'|\'w\'|"b"|"w")', s):
    print('go.ts:', m.group(0)[:80])
print('---')

# 2) ThreeJSGoBoard 棋子渲染段
t = io.open(r'src\components\ThreeJSGoBoard.tsx', encoding='utf-8').read()
i = t.find('同步棋子与标记')
print('sync section at', i)
seg = t[i:i+3200]
print(seg)
