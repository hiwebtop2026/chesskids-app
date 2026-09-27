/**
 * ChessKids - 五子棋对局结束特效（炫酷版 v3）
 * win  → 中心大爆炸 + 多波烟花（高空放射绽放）+ 点赞动画 + 金色冲击波 + 光柱 + 全屏闪光 + 星星飘落 + 拖尾火花
 * lose → 暗色闷爆 + 灰蓝低落粒子 + 缓慢涟漪
 * draw → 蓝白柔光双爆 + 柔和涟漪
 * 挂载自动播放对应音效，约 2.8s 后淡出
 */
import React, { useEffect, useRef } from 'react';
import { playGomokuWin, playGomokuLose, playGomokuDraw } from '../engine/gomokuSound';

export type GomokuFXKind = 'win' | 'lose' | 'draw';

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; decay: number;
  r: number; c: string; grav: number; kind: 'burst' | 'star' | 'drop' | 'spark' | 'fw';
  px: number; py: number; spin: number; rot: number;
};
type Ring = { x: number; y: number; r: number; vr: number; life: number; decay: number; c: string; w: number };
type Beam = { x0: number; x1: number; life: number; decay: number; c: string; w: number };
type Firework = { x: number; y: number; targetY: number; vy: number; state: 'rise' | 'burst'; color: string };

export const GomokuResultFX: React.FC<{ kind: GomokuFXKind; label?: string }> = ({ kind, label }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (kind === 'win') playGomokuWin();
    else if (kind === 'draw') playGomokuDraw();
    else playGomokuLose();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth || 640;
    const H = canvas.clientHeight || 480;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const parts: Particle[] = [];
    const rings: Ring[] = [];
    const beams: Beam[] = [];
    const fireworks: Firework[] = [];
    const cx = W / 2;
    const cy = H / 2;

    const winColors = ['#ffd700', '#ffb300', '#ff6b6b', '#4ecdc4', '#ffe66d', '#ff9f1c', '#ffffff', '#ff4d8d'];
    const loseColors = ['#9aa0a6', '#6d7278', '#565b62', '#8b9199'];
    const drawColors = ['#8ecae6', '#bde0fe', '#ffffff', '#a2d2ff'];
    const fwColors = ['#ffd700', '#ff8c42', '#ff5e78', '#7dd8ff', '#c084fc', '#ffe66d'];

    const colors = kind === 'win' ? winColors : kind === 'draw' ? drawColors : loseColors;

    const burst = (bx: number, by: number, n: number, spMin: number, spMax: number, withSpark: boolean) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = spMin + Math.random() * (spMax - spMin);
        parts.push({
          x: bx, y: by, px: bx, py: by,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - sp * 0.3,
          life: 1, decay: 0.012 + Math.random() * 0.016,
          r: 2 + Math.random() * 4,
          c: colors[i % colors.length],
          grav: 0.2, kind: 'burst', spin: 0, rot: 0,
        });
        if (withSpark) {
          parts.push({
            x: bx, y: by, px: bx, py: by,
            vx: Math.cos(a) * sp * 1.5, vy: Math.sin(a) * sp * 1.5 - sp * 0.2,
            life: 1, decay: 0.02 + Math.random() * 0.03,
            r: 1.2 + Math.random() * 1.6,
            c: '#ffffff',
            grav: 0.18, kind: 'spark', spin: 0, rot: 0,
          });
        }
      }
    };

    /** 高空烟花绽放：放射星芒 + 慢坠光点 */
    const fireworkBurst = (fx: number, fy: number, color: string) => {
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        const sp = 2.6 + Math.random() * 2.4;
        parts.push({
          x: fx, y: fy, px: fx, py: fy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1, decay: 0.02 + Math.random() * 0.02,
          r: 1.6 + Math.random() * 2.2,
          c: color,
          grav: 0.1, kind: 'fw', spin: 0, rot: 0,
        });
      }
      // 中心白闪
      parts.push({
        x: fx, y: fy, px: fx, py: fy,
        vx: 0, vy: 0, life: 1, decay: 0.06,
        r: 4.5, c: '#ffffff', grav: 0, kind: 'burst', spin: 0, rot: 0,
      });
      ring(fx, fy, color, 1.6, 5, 0.06);
    };

    const launchFirework = (delay: number, x: number, targetY: number) => {
      setTimeout(() => {
        const c = fwColors[Math.floor(Math.random() * fwColors.length)];
        fireworks.push({ x, y: H + 12, targetY, vy: -10, state: 'rise', color: c });
      }, delay);
    };

    const ring = (bx: number, by: number, c: string, w: number, vr: number, decay: number) => {
      rings.push({ x: bx, y: by, r: 4, vr, life: 1, decay, c, w });
    };

    if (kind === 'win') {
      // 0ms 中心大爆炸 + 冲击波 + 光柱
      burst(cx, cy, 90, 4, 12, true);
      ring(cx, cy, '#ffd700', 3, 9, 0.03);
      ring(cx, cy, '#ffffff', 1.6, 7, 0.045);
      beams.push({ x0: cx - 26, x1: cx - 6, life: 1, decay: 0.02, c: 'rgba(255,215,0,0.5)', w: 0 });
      beams.push({ x0: cx + 6, x1: cx + 26, life: 1, decay: 0.02, c: 'rgba(255,200,60,0.45)', w: 0 });
      // 350ms 二次爆炸（上）
      setTimeout(() => {
        burst(cx, cy - H * 0.18, 60, 3, 9, true);
        ring(cx, cy - H * 0.18, '#ffb300', 2.4, 8, 0.035);
      }, 350);
      // 650ms 三次爆炸（左右）
      setTimeout(() => {
        burst(cx - W * 0.28, cy + H * 0.12, 45, 3, 8, true);
        burst(cx + W * 0.28, cy + H * 0.1, 45, 3, 8, true);
        ring(cx - W * 0.28, cy + H * 0.12, '#4ecdc4', 2, 7, 0.04);
        ring(cx + W * 0.28, cy + H * 0.1, '#ff6b6b', 2, 7, 0.04);
      }, 650);
      // 高空烟花：三朵依次绽放
      launchFirework(500, W * 0.22, H * 0.3);
      launchFirework(900, W * 0.75, H * 0.22);
      launchFirework(1400, W * 0.5, H * 0.32);
      // 星星飘落
      for (let i = 0; i < 20; i++) {
        parts.push({
          x: Math.random() * W, y: -12 - Math.random() * 80,
          px: Math.random() * W, py: -12 - Math.random() * 80,
          vx: (Math.random() - 0.5) * 1.0, vy: 1.6 + Math.random() * 2.2,
          life: 1, decay: 0.004 + Math.random() * 0.005,
          r: 5 + Math.random() * 7,
          c: colors[i % colors.length],
          grav: 0.012, kind: 'star', spin: (Math.random() - 0.5) * 0.14, rot: Math.random() * Math.PI,
        });
      }
    } else if (kind === 'draw') {
      burst(cx, cy - H * 0.1, 40, 2.5, 6, false);
      setTimeout(() => burst(cx + W * 0.22, cy + H * 0.15, 30, 2, 5, false), 250);
      ring(cx, cy, '#8ecae6', 2.4, 6, 0.04);
      ring(cx, cy, '#ffffff', 1.2, 5, 0.05);
    } else {
      // lose：暗色闷爆
      burst(cx, cy, 42, 2.5, 5.5, false);
      ring(cx, cy, '#6d7278', 2, 5.5, 0.045);
    }

    let raf = 0;
    const t0 = performance.now();
    const DURATION = 2800;

    const drawStar = (x: number, y: number, r: number, rot: number, color: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a1 = (i * 72 - 90) * Math.PI / 180;
        const a2 = ((i * 72) + 36 - 90) * Math.PI / 180;
        ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
        ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const tick = () => {
      const elapsed = performance.now() - t0;
      ctx.clearRect(0, 0, W, H);

      // 全屏闪光（前 0.42s）
      if (elapsed < 420) {
        const a = (1 - elapsed / 420) * (kind === 'win' ? 0.6 : 0.28);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.8);
        g.addColorStop(0, `rgba(255,244,200,${a})`);
        g.addColorStop(1, `rgba(255,244,200,0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // 光柱（前 0.9s）
      if (kind === 'win' && elapsed < 900) {
        beams.forEach((bm) => {
          bm.life -= bm.decay;
          if (bm.life <= 0) return;
          const h = H * 0.5 * bm.life;
          const wTop = 8 * bm.life;
          const g = ctx.createLinearGradient(0, cy, 0, cy - h);
          g.addColorStop(0, bm.c.replace(/[\d.]+\)$/, `${Math.max(0, bm.life * 0.7).toFixed(2)})`));
          g.addColorStop(1, 'rgba(255,215,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(cx + bm.x0, cy);
          ctx.lineTo(cx + (bm.x0 + bm.x1) / 2 - wTop, cy - h);
          ctx.lineTo(cx + (bm.x0 + bm.x1) / 2 + wTop, cy - h);
          ctx.lineTo(cx + bm.x1, cy);
          ctx.closePath();
          ctx.fill();
        });
      }

      // 烟花上升与绽放
      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];
        if (fw.state === 'rise') {
          // 上升光点 + 尾迹
          ctx.strokeStyle = fw.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(fw.x, fw.y);
          ctx.lineTo(fw.x, Math.min(fw.y + 14, H));
          ctx.stroke();
          fw.y += fw.vy;
          fw.vy += 0.28;
          if (fw.y <= fw.targetY) {
            fw.state = 'burst';
            fireworkBurst(fw.x, fw.y, fw.color);
            fireworks.splice(i, 1);
          }
        }
      }

      // 冲击波圆环
      rings.forEach((rng, i) => {
        rng.r += rng.vr;
        rng.life -= rng.decay;
        if (rng.life <= 0) { rings.splice(i, 1); return; }
        ctx.strokeStyle = rng.c;
        ctx.globalAlpha = Math.max(0, rng.life);
        ctx.lineWidth = rng.w * rng.life;
        ctx.beginPath();
        ctx.arc(rng.x, rng.y, rng.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // 粒子（带尾迹）
      parts.forEach((p, i) => {
        p.px = p.x; p.py = p.y;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.grav;
        p.vx *= 0.985;
        p.life -= p.decay;
        if (p.life <= 0 || p.y > H + 30) { parts.splice(i, 1); return; }
        const a = Math.max(0, Math.min(1, p.life));
        if (p.kind === 'star') {
          p.rot += p.spin;
          drawStar(p.x, p.y, p.r * p.life, p.rot, p.c);
        } else if (p.kind === 'spark' || p.kind === 'fw') {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.c;
          ctx.lineWidth = Math.max(0.4, p.r * p.life);
          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });

      if (elapsed < DURATION && (parts.length > 0 || rings.length > 0 || fireworks.length > 0 || (kind === 'win' && elapsed < 900))) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [kind]);

  return (
    <div className={`gomoku-result-fx ${kind === 'win' ? 'fx-win' : kind === 'draw' ? 'fx-draw' : 'fx-lose'}`}>
      <canvas ref={canvasRef} className="gomoku-result-fx-canvas" />
      {kind === 'win' && (
        <>
          <div className="fx-banner fx-banner-win">
            <span className="fx-banner-icon">🎉</span>
            <span className="fx-banner-text">{label || '你赢了！'}</span>
            <span className="fx-banner-icon">🎉</span>
          </div>
          {/* 点赞特效：👍 与 ❤️ 弹起上飘 */}
          <div className="fx-like">
            {['👍', '👍', '❤️', '🌟', '👍', '❤️', '👍'].map((e, i) => (
              <span
                key={i}
                className="fx-like-item"
                style={{
                  left: `${6 + i * 13.5}%`,
                  animationDelay: `${0.25 + i * 0.22}s`,
                  fontSize: i % 2 === 0 ? undefined : '0.8em',
                }}
              >
                {e}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
