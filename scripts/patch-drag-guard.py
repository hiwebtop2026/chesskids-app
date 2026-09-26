# -*- coding: utf-8 -*-
import io

p = r'src\components\ThreeJSGoBoard.tsx'
s = io.open(p, encoding='utf-8').read()

old_te = """    const handleTouchEnd = () => {
      isDragging = false;
      isTouchPanning = false;
    };"""
new_te = """    const handleTouchEnd = (event: TouchEvent) => {
      // 兜底：单指抬起时校验移动距离（防止无 touchmove 时误触发点击落子）
      if (isDragging && event.changedTouches.length > 0) {
        const dx = event.changedTouches[0].clientX - dragStartX;
        const dy = event.changedTouches[0].clientY - dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      }
      isDragging = false;
      isTouchPanning = false;
    };"""
if old_te in s:
    s = s.replace(old_te, new_te)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('touch guard patched')
else:
    print('SKIP: touch guard already patched or pattern changed')
    i = s.find('handleTouchEnd = ')
    print(s[i:i+260] if i >= 0 else 'not found')
