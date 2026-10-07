// ================================================================
// 掼蛋出牌视觉特效（Canvas 粒子系统）
// - 出炸弹 / 同花顺 / 王炸时触发，随机效果池保证每次效果不同
// - 普通炸弹 BOMB：随机三选一 —— 橙红爆炸冲击波 / 蓝紫能量环 / 金色碎片风暴
// - 同花顺 STRAIGHT_FLUSH：随机二选一 —— 彩虹光柱 / 彩带雨
// - 王炸 ROCKET（2 张王）：金色闪电 + 金粒子风暴
// - 天王炸 ROCKET（4 张王）：全屏烟花（3~5 枚齐发）+ 金色冲击波（最炫）
// - 特效 Canvas 覆盖在棋盘容器内（pointer-events:none，不影响操作），自动销毁
// ================================================================

interface GP {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  shape: 'circle' | 'rect' | 'ring' | 'star';
  rot: number; vr: number; g: number;
}

type EffectKind = 'bomb' | 'straight' | 'rocket2' | 'rocket4';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const BOMB_PALETTES: string[][] = [
  ['#ff6f00', '#ffab40', '#ff3d00', '#ffd180', '#fff3e0'],
  ['#4a6cf7', '#7c4dff', '#29b6f6', '#b388ff', '#e1f5fe'],
  ['#ffd54f', '#ffca28', '#ffb300', '#fff59d', '#ffffff'],
];
const RAINBOW = ['#ff5252', '#ffab40', '#ffd54f', '#69f0ae', '#40c4ff', '#b388ff', '#f48fb1'];
const GOLD = ['#ffd54f', '#ffca28', '#ffecb3', '#fff59d', '#fff'];

/** 创建一个覆盖容器的特效 Canvas（容器需 position:relative） */
function makeCanvas(container: HTMLElement): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } {
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:40;border-radius:inherit;';
  container.appendChild(cv);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = container.clientWidth, h = container.clientHeight;
  cv.width = Math.max(1, Math.floor(w * dpr));
  cv.height = Math.max(1, Math.floor(h * dpr));
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return { cv, ctx, w, h };
}

function runLoop(ctx: CanvasRenderingContext2D, parts: GP[], w: number, h: number, cv: HTMLCanvasElement, duration: number) {
  const t0 = performance.now();
  let raf = 0;
  const step = () => {
    const el = performance.now() - t0;
    ctx.clearRect(0, 0, w, h);
    const alpha = el > duration * 0.7 ? Math.max(0, 1 - (el - duration * 0.7) / (duration * 0.3)) : 1;
    ctx.globalAlpha = alpha;
    for (const p of parts) {
      // 引爆标记：倒计时（负 life）归零时生成二次爆炸粒子（烟花核心效果）
      if (p.life < 0) {
        p.life += 1;
        if (p.life >= 0) {
          for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = rnd(1.5, 7);
            parts.push({
              x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
              life: rnd(40, 70), max: 70, size: rnd(2, 5.5),
              color: pick(RAINBOW), shape: i % 3 === 0 ? 'star' : 'circle',
              rot: rnd(0, 6.28), vr: rnd(-0.3, 0.3), g: rnd(0.04, 0.1),
            });
          }
          parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 22, max: 22, size: rnd(55, 90), color: pick(GOLD), shape: 'ring', rot: 0, vr: 0, g: 0 });
        }
        continue;
      }
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.rot += p.vr; p.life -= 1;
      if (p.life <= 0) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, p.size * (p.life / p.max), 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else if (p.shape === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          const r = i === 0 ? p.size : p.size * 0.45;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
      } else if (p.shape === 'ring') {
        ctx.beginPath(); ctx.arc(0, 0, p.size * (1 - p.life / p.max), 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, p.size * 0.12); ctx.strokeStyle = p.color; ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (el < duration && parts.some((p) => p.life > 0 || p.life < 0)) {
      raf = requestAnimationFrame(step);
    } else {
      cancelAnimationFrame(raf);
      cv.remove();
    }
  };
  raf = requestAnimationFrame(step);
}

/** 中心爆炸：粒子 + 冲击波环 */
function burst(parts: GP[], cx: number, cy: number, count: number, palette: string[], speed: [number, number], size: [number, number]) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rnd(speed[0], speed[1]);
    parts.push({
      x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: rnd(45, 75), max: 75, size: rnd(size[0], size[1]),
      color: pick(palette), shape: pick(['circle', 'rect', 'star'] as const),
      rot: rnd(0, 6.28), vr: rnd(-0.2, 0.2), g: rnd(0.05, 0.12),
    });
  }
  // 冲击波环
  parts.push({ x: cx, y: cy, vx: 0, vy: 0, life: 30, max: 30, size: rnd(90, 150), color: palette[0], shape: 'ring', rot: 0, vr: 0, g: 0 });
  parts.push({ x: cx, y: cy, vx: 0, vy: 0, life: 24, max: 24, size: rnd(60, 100), color: palette[1], shape: 'ring', rot: 0, vr: 0, g: 0 });
}

/** 烟花：从底部发射弹体，顶部二次爆炸 */
function fireworks(parts: GP[], w: number, h: number, shells: number) {
  for (let s = 0; s < shells; s++) {
    const tx = rnd(w * 0.15, w * 0.85);
    const ty = rnd(h * 0.15, h * 0.45);
    const sx = rnd(w * 0.1, w * 0.9);
    const travel = Math.floor(rnd(38, 55));
    // 弹体（上升轨迹）
    parts.push({
      x: sx, y: h + 10, vx: (tx - sx) / travel, vy: (ty - h - 10) / travel,
      life: travel, max: travel, size: rnd(3, 4.5), color: '#fff2cc', shape: 'circle',
      rot: 0, vr: 0, g: 0,
    });
    // 爆炸预判：在弹体生命结束时追加二次粒子（此处用延迟标记：负 life 表示待引爆）
    parts.push({
      x: tx, y: ty, vx: 0, vy: 0, life: -travel, max: travel, size: 0,
      color: '', shape: 'circle', rot: 0, vr: 0, g: 0,
    } as GP);
  }
}

/** 金色闪电（王炸）：几条折线闪电 + 金粒子 */
function lightning(parts: GP[], cx: number, cy: number) {
  // 用粒子近似闪电：连续节点按折线飘移
  for (let bolt = 0; bolt < 3; bolt++) {
    let x = cx + rnd(-80, 80), y = cy + rnd(-40, 40);
    const segs = Math.floor(rnd(6, 10));
    for (let i = 0; i < segs; i++) {
      const nx = x + rnd(-14, 14), ny = y + rnd(8, 18);
      parts.push({ x, y, vx: (nx - x) * 0.5, vy: (ny - y) * 0.5, life: 14, max: 14, size: rnd(2.5, 4), color: pick(GOLD), shape: 'circle', rot: 0, vr: 0, g: 0 });
      x = nx; y = ny;
    }
  }
  burst(parts, cx, cy, 70, GOLD, [3, 9], [2, 5]);
}

/** 主入口：按牌型与王数触发随机特效 */
export function playGdBombEffect(container: HTMLElement, playType: string, cards: { k?: number }[]): void {
  let kind: EffectKind;
  if (playType === 'ROCKET') {
    kind = cards.filter((c) => c.k !== undefined).length >= 4 ? 'rocket4' : 'rocket2';
  } else if (playType === 'STRAIGHT_FLUSH') {
    kind = 'straight';
  } else {
    kind = 'bomb';
  }
  const { cv, ctx, w, h } = makeCanvas(container);
  const cx = w / 2, cy = h / 2;
  const parts: GP[] = [];

  switch (kind) {
    case 'bomb': {
      const palette = pick(BOMB_PALETTES);
      const mode = Math.floor(Math.random() * 3);
      if (mode === 0) {
        burst(parts, cx, cy, 90, palette, [3, 11], [2, 6]);
        runLoop(ctx, parts, w, h, cv, 1100);
      } else if (mode === 1) {
        burst(parts, cx, cy, 70, palette, [2, 8], [3, 8]);
        burst(parts, cx + rnd(-90, 90), cy + rnd(-60, 60), 40, palette, [2, 6], [2, 5]);
        runLoop(ctx, parts, w, h, cv, 1200);
      } else {
        // 金色碎片风暴：环形高速粒子 + 内圈星星
        for (let i = 0; i < 110; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = rnd(4, 14);
          parts.push({
            x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: rnd(40, 70), max: 70, size: rnd(2, 5),
            color: pick(GOLD), shape: i % 3 === 0 ? 'star' : 'circle',
            rot: rnd(0, 6.28), vr: rnd(-0.3, 0.3), g: rnd(0.02, 0.06),
          });
        }
        runLoop(ctx, parts, w, h, cv, 1300);
      }
      break;
    }
    case 'straight': {
      const mode = Math.floor(Math.random() * 2);
      if (mode === 0) {
        // 彩虹光柱：中心竖直光柱 + 两侧粒子
        for (let i = 0; i < 80; i++) {
          parts.push({
            x: cx + rnd(-6, 6), y: cy + rnd(-h * 0.4, h * 0.4),
            vx: rnd(-1.5, 1.5), vy: rnd(-2.5, -0.5),
            life: rnd(30, 55), max: 55, size: rnd(3, 7),
            color: pick(RAINBOW), shape: i % 4 === 0 ? 'star' : 'rect',
            rot: rnd(0, 3.14), vr: rnd(-0.25, 0.25), g: -0.02,
          });
        }
        runLoop(ctx, parts, w, h, cv, 1400);
      } else {
        // 彩带雨：全屏彩色带下落 + 旋转
        for (let i = 0; i < 130; i++) {
          parts.push({
            x: rnd(0, w), y: rnd(-h, 0),
            vx: rnd(-0.8, 0.8), vy: rnd(2.5, 5.5),
            life: rnd(60, 90), max: 90, size: rnd(6, 12),
            color: pick(RAINBOW), shape: 'rect',
            rot: rnd(0, 3.14), vr: rnd(-0.35, 0.35), g: 0.08,
          });
        }
        runLoop(ctx, parts, w, h, cv, 1500);
      }
      break;
    }
    case 'rocket2': {
      // 金色闪电 + 金粒子风暴
      lightning(parts, cx, cy);
      runLoop(ctx, parts, w, h, cv, 1400);
      break;
    }
    case 'rocket4': {
      // 天王炸：全屏烟花（4~5 枚）+ 中央金色冲击波（最炫）
      fireworks(parts, w, h, 5);
      burst(parts, cx, cy, 90, GOLD, [4, 13], [2, 6]);
      // 二次引爆粒子（通过 life<0 的标记粒子实现，runLoop 中负 life 直接跳过，改为预生成爆炸粒子）
      // 简化：烟花弹体 + 直接生成中心大爆炸；弹体飞行轨迹另用尾迹粒子
      runLoop(ctx, parts, w, h, cv, 2200);
      break;
    }
  }
}
