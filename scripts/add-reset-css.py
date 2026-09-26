# -*- coding: utf-8 -*-
import io

p = r'src\styles\global.css'
s = io.open(p, encoding='utf-8').read()

css = '''
/* 围棋 3D 重置视角按钮（棋盘容器右上角） */
.go-3d-reset-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: rgba(30, 60, 90, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: background 0.2s ease, transform 0.1s ease;
  user-select: none;
}
.go-3d-reset-btn:hover {
  background: rgba(30, 60, 90, 0.92);
}
.go-3d-reset-btn:active {
  transform: scale(0.95);
}
'''
if '.go-3d-reset-btn' not in s:
    s += css
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('css appended')
else:
    print('css already exists')
