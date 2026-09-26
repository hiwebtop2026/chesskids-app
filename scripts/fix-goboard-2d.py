# -*- coding: utf-8 -*-
# 修复 GoBoard.tsx 2D 渲染：
# 1) circle cx/cy "50%" → "0"（百分比相对 viewBox，导致棋子全部堆在棋盘中心）
# 2) 棋子/标记尺寸按格宽自适应（真实围棋棋子直径≈0.9格）
import io

p = r'src\components\GoBoard.tsx'
s = io.open(p, encoding='utf-8').read()

# --- renderStone：主圆/内圆/领地 ---
old_stone = """    const isB = color === 'b';
    return (
      <g>
        <circle
          cx="50%" cy="50%"
          r={boardSize ? Math.max(8, boardSize / n * 0.44) : 11}
          fill={isB ? '#1a1a1a' : '#f7f7f7'}
          stroke={isB ? '#000' : '#999'}
          strokeWidth={isB ? 0.5 : 1}
          className="go-stone"
        />
        {isB && (
          <circle cx="50%" cy="50%" r={boardSize ? Math.max(3, boardSize / n * 0.14) : 4} fill="#444" />
        )}
      </g>
    );"""
new_stone = """    const isB = color === 'b';
    const cellPct = 100 / (n - 1);      // 一格宽（viewBox 单位）
    const stoneR = Math.max(3, cellPct * 0.46);   // 棋子半径 ≈ 0.46 格（直径≈0.92格）
    return (
      <g>
        <circle
          cx="0" cy="0"
          r={stoneR}
          fill={isB ? '#141414' : '#f8f3e7'}
          stroke={isB ? '#000' : '#a8a090'}
          strokeWidth={isB ? 0.4 : 0.8}
          className="go-stone"
        />
        {isB && (
          <circle cx="0" cy="0" r={Math.max(1.2, stoneR * 0.32)} fill="#444" className="go-stone-inner" />
        )}
      </g>
    );"""
assert old_stone in s, 'stone block not found'
s = s.replace(old_stone, new_stone)

# --- renderStones：lastMark / hint（cx/cy → 0，尺寸自适应）---
old_lm = """              {isLast && color && (
                <circle cx="50%" cy="50%" r="3" fill={color === 'b' ? '#ff5a4e' : '#e23c2c'} className="go-last-mark" />
              )}
              {hintPoint && hintPoint[0] === r && hintPoint[1] === c && !color && (
                <circle cx="50%" cy="50%" r="6" fill="none" stroke="#1e88e5" strokeWidth="2" opacity="0.9" className="go-hint" />
              )}"""
new_lm = """              {isLast && color && (
                <circle cx="0" cy="0" r={Math.max(1.1, 100 / (n - 1) * 0.13)} fill={color === 'b' ? '#ff5a4e' : '#e23c2c'} className="go-last-mark" />
              )}
              {hintPoint && hintPoint[0] === r && hintPoint[1] === c && !color && (
                <circle cx="0" cy="0" r={Math.max(1.6, 100 / (n - 1) * 0.22)} fill="none" stroke="#1e88e5" strokeWidth="1.8" opacity="0.9" className="go-hint" />
              )}"""
assert old_lm in s, 'lastmark block not found'
s = s.replace(old_lm, new_lm)

old_hint2 = """            <g key={`${r},${c}`} transform={`translate(${c * 100 / (n - 1)}%, ${r * 100 / (n - 1)}%)`}>
              <circle cx="50%" cy="50%" r="6" fill="none" stroke="#1e88e5" strokeWidth="2" opacity="0.9" className="go-hint" />
            </g>,"""
new_hint2 = """            <g key={`${r},${c}`} transform={`translate(${c * 100 / (n - 1)}%, ${r * 100 / (n - 1)}%)`}>
              <circle cx="0" cy="0" r={Math.max(1.6, 100 / (n - 1) * 0.22)} fill="none" stroke="#1e88e5" strokeWidth="1.8" opacity="0.9" className="go-hint" />
            </g>,"""
assert old_hint2 in s, 'hint2 block not found'
s = s.replace(old_hint2, new_hint2)

# --- 领地标记 cx/cy ---
old_ter = """        return <circle className="go-territory-mark" cx="50%" cy="50%" r="7" fill={territory[r][c] === 'b' ? '#1a1a1a' : '#e8e8e8'} opacity="0.35" />;"""
new_ter = """        return <circle className="go-territory-mark" cx="0" cy="0" r={Math.max(2, 100 / (n - 1) * 0.3)} fill={territory[r][c] === 'b' ? '#1a1a1a' : '#e8e8e8'} opacity="0.35" />;"""
assert old_ter in s, 'territory block not found'
s = s.replace(old_ter, new_ter)

# --- 星位尺寸微调 ---
old_star = 'r="3.2" fill="#444" className="go-star"'
new_star = 'r={Math.max(1.4, 100 / (n - 1) * 0.16)} fill="#3a2a14" className="go-star"'
assert old_star in s, 'star not found'
s = s.replace(old_star, new_star)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('GoBoard 2D render fixed')
