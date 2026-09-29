/**
 * ChessKids - 五子棋对局结束特效（随机版 v4）
 * 每次胜利庆祝随机组合：随机主题色板 + 随机烟花数量/位置/时机 + 随机特效组合
 * （爆炸/烟花/彩带/爱心上升/星星雨/彩虹环/光柱）+ 随机点赞 emoji + 随机胜利文案
 * lose → 暗色闷爆；draw → 蓝白柔光
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { playGomokuWin, playGomokuLose, playGomokuDraw } from '../engine/gomokuSound';

export type GomokuFXKind = 'win' | 'lose' | 'draw';

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; decay: number;
  r: number; c: string; grav: number; kind: 'burst' | 'star' | 'drop' | 'spark' | 'fw' | 'heart' | 'confetti';
  px: number; py: number; spin: number; rot: number;
};
type Ring = { x: number; y: number; r: number; vr: number; life: number; decay: number; c: string; w: number };
type Firework = { x: number; y: number; targetY: number; vy: number; state: 'rise' | 'burst'; color: string };

const THEMES: Record<string, string[]> = {
  gold: ['#ffd700', '#ffb300', '#ffe66d', '#ff9f1c', '#ffffff'],
  rose: ['#ff5e78', '#ff8fa3', '#ffb3c1', '#ff2e63', '#ffffff'],
  ocean: ['#4ecdc4', '#7dd8ff', '#8ecae6', '#00b4d8', '#ffffff'],
  purple: ['#c084fc', '#a78bfa', '#e879f9', '#8b5cf6', '#ffffff'],
  green: ['#a3e635', '#4ade80', '#86efac', '#22c55e', '#ffffff'],
  rainbow: ['#ff5e78', '#ffb300', '#4ade80', '#4ecdc4', '#c084fc', '#ffd700', '#ffffff'],
};

const LIKE_POOL = ['👍', '👍', '❤️', '🌟', '🎉', '✨', '💖', '🥳', '🔥', '👏', '🎊', '⭐'];
const WIN_TEXTS = ['你赢了！', '太棒了！', '真厉害！', '漂亮！', '胜利！', '无敌啦！', '好棋！'];

type WinScheme = {
  theme: string[];
  fwCount: number;          // 高空烟花数量 2-5
  extraBursts: number;      // 额外爆炸次数 0-3
  likes: string[];          // 随机点赞 emoji 5-9 个
  label: string;            // 随机文案
  effects: ('beams' | 'starRain' | 'heartRise' | 'confetti' | 'rainbowRing')[];
  sparkle: boolean;
};

function buildWinScheme(): WinScheme {
  const themeKeys = Object.keys(THEMES);
  const theme = THEMES[themeKeys[Math.floor(Math.random() * themeKeys.length)]];
  const fwCount = 2 + Math.floor(Math.random() * 4);          // 2-5
  const extraBursts = Math.floor(Math.random() * 4);          // 0-3
  const likeCount = 5 + Math.floor(Math.random() * 5);        // 5-9
  const likes: string[] = [];
  for (let i = 0; i < likeCount; i++) {
    likes.push(LIKE_POOL[Math.floor(Math.random() * LIKE_POOL.length)]);
  }
  const allEffects: WinScheme['effects'] = ['beams', 'starRain', 'heartRise', 'confetti', 'rainbowRing'];
  // 随机选 2-4 个特效（洗牌取前 k）
  const shuffled = [...allEffects].sort(() => Math.random() - 0.5);
  const k = 2 + Math.floor(Math.random() * 3);
  const effects = shuffled.slice(0, Math.min(k, allEffects.length));
  return {
    theme,
    fwCount,
    extraBursts,
    likes,
    label: WIN_TEXTS[Math.floor(Math.random() * WIN_TEXTS.length)],
    effects,
    sparkle: Math.random() < 0.5,
  };
}

export const GomokuResultFX: React.FC<{ kind: GomokuFXKind; label?: string }> = ({ kind, label }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scheme = useMemo<WinScheme | null>(() => (kind === 'win' ? buildWinScheme() : null), [kind]);
  // 双人/联机胜负都算"庆祝"：非 draw 时默认 win 文案可覆盖
  const bannerText = scheme?.label || label || '你赢了！';

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
    const fireworks: Firework[] = [];
    const cx = W / 2;
    const cy = H / 2;

    const loseColors = ['#9aa0a6', '#6d7278', '#565b62', '#8b9199'];
    const drawColors = ['#8ecae6', '#bde0fe', '#ffffff', '#a2d2ff'];
    const colors = kind === 'win' ? (scheme?.theme || ['#ffd700', '#ffffff']) : kind === 'draw' ? drawColors : loseColors;

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
            c: '#ffffff', grav: 0.18, kind: 'spark', spin: 0, rot: 0,
          });
        }
      }
    };

    const fireworkBurst = (fx: number, fy: number, color: string) => {
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        const sp = 2.6 + Math.random() * 2.4;
        parts.push({
          x: fx, y: fy, px: fx, py: fy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1, decay: 0.02 + Math.random() * 0.02,
          r: 1.6 + Math.random() * 2.2,
          c: color, grav: 0.1, kind: 'fw', spin: 0, rot: 0,
        });
      }
      parts.push({
        x: fx, y: fy, px: fx, py: fy,
        vx: 0, vy: 0, life: 1, decay: 0.06,
        r: 4.5, c: '#ffffff', grav: 0, kind: 'burst', spin: 0, rot: 0,
      });
      ring(fx, fy, color, 1.6, 5, 0.06);
    };

    const launchFirework = (delay: number, x: number, targetY: number, color: string) => {
      setTimeout(() => {
        fireworks.push({ x, y: H + 12, targetY, vy: -10, state: 'rise', color });
      }, delay);
    };

    const ring = (bx: number, by: number, c: string, w: number, vr: number, decay: number) => {
      rings.push({ x: bx, y: by, r: 4, vr, life: 1, decay, c, w });
    };

    if (kind === 'win' && scheme) {
      const eff = new Set(scheme.effects);
      // 中心大爆炸（固定核心）
      burst(cx, cy, 80 + Math.floor(Math.random() * 40), 4, 12, scheme.sparkle);
      ring(cx, cy, scheme.theme[0], 3, 9, 0.03);
      if (scheme.sparkle) ring(cx, cy, '#ffffff', 1.6, 7, 0.045);

      // 随机特效组合
      if (eff.has('rainbowRing')) {
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            const c = scheme.theme[i % scheme.theme.length];
            ring(cx + (Math.random() - 0.5) * W * 0.4, cy + (Math.random() - 0.5) * H * 0.3, c, 2.2, 6 + Math.random() * 4, 0.03 + Math.random() * 0.02);
          }, 300 + i * 140);
        }
      }
      if (eff.has('confetti')) {
        for (let i = 0; i < 40; i++) {
          parts.push({
            x: Math.random() * W, y: -10 - Math.random() * 60,
            px: 0, py: 0,
            vx: (Math.random() - 0.5) * 1.6, vy: 2 + Math.random() * 2.6,
            life: 1, decay: 0.006 + Math.random() * 0.006,
            r: 3 + Math.random() * 4.5,
            c: scheme.theme[i % scheme.theme.length],
            grav: 0.06, kind: 'confetti', spin: (Math.random() - 0.5) * 0.22, rot: Math.random() * Math.PI,
          });
        }
      }
      if (eff.has('heartRise')) {
        for (let i = 0; i < 12; i++) {
          setTimeout(() => {
            parts.push({
              x: cx + (Math.random() - 0.5) * W * 0.5, y: cy + H * 0.2,
              px: 0, py: 0,
              vx: (Math.random() - 0.5) * 0.9, vy: -2.2 - Math.random() * 1.6,
              life: 1, decay: 0.012 + Math.random() * 0.01,
              r: 4 + Math.random() * 3.5,
              c: scheme.theme[1 % scheme.theme.length],
              grav: -0.02, kind: 'heart', spin: (Math.random() - 0.5) * 0.08, rot: Math.random() * Math.PI,
            });
          }, 500 + i * 120);
        }
      }
      if (eff.has('starRain')) {
        for (let i = 0; i < 16; i++) {
          parts.push({
            x: Math.random() * W, y: -12 - Math.random() * 80,
            px: Math.random() * W, py: -12 - Math.random() * 80,
            vx: (Math.random() - 0.5) * 1.0, vy: 1.6 + Math.random() * 2.2,
            life: 1, decay: 0.004 + Math.random() * 0.005,
            r: 5 + Math.random() * 7,
            c: scheme.theme[i % scheme.theme.length],
            grav: 0.012, kind: 'star', spin: (Math.random() - 0.5) * 0.14, rot: Math.random() * Math.PI,
          });
        }
      }
      if (eff.has('beams')) {
        const b1 = { x0: cx - 26, x1: cx - 6, life: 1, decay: 0.02, c: 'rgba(255,215,0,0.5)', w: 0 };
        const b2 = { x0: cx + 6, x1: cx + 26, life: 1, decay: 0.02, c: 'rgba(255,200,60,0.45)', w: 0 };
        // beams 简化为粒子光柱：直接用环+竖粒子替代（避免额外数组），此处不做独立光柱渲染
        for (let i = 0; i < 10; i++) {
          parts.push({
            x: cx + (Math.random() - 0.5) * 40, y: cy,
            px: cx + (Math.random() - 0.5) * 40, py: cy,
            vx: 0, vy: -3 - Math.random() * 3,
            life: 1, decay: 0.03 + Math.random() * 0.02,
            r: 1.6 + Math.random() * 1.8,
            c: i % 2 === 0 ? '#ffd700' : '#ffffff', grav: 0.01, kind: 'spark', spin: 0, rot: 0,
          });
        }
        void b1; void b2;
      }

      // 随机数量的高空烟花（时机/位置随机）
      const fwPositions: Array<[number, number]> = [];
      for (let i = 0; i < scheme.fwCount; i++) {
        const fwDelay = 400 + Math.floor(Math.random() * 1100);
        const fwX = W * (0.18 + Math.random() * 0.64);
        const fwY = H * (0.18 + Math.random() * 0.28);
        const fwColor = scheme.theme[i % scheme.theme.length];
        launchFirework(fwDelay, fwX, fwY, fwColor);
        fwPositions.push([fwX, fwY]);
      }

      // 随机次数额外爆炸
      for (let i = 0; i < scheme.extraBursts; i++) {
        const d = 300 + i * 260 + Math.floor(Math.random() * 250);
        setTimeout(() => {
          const bx = cx + (Math.random() - 0.5) * W * 0.6;
          const by = cy + (Math.random() - 0.5) * H * 0.4;
          burst(bx, by, 40 + Math.floor(Math.random() * 30), 3, 9, Math.random() < 0.5);
          ring(bx, by, scheme.theme[i % scheme.theme.length], 2, 7, 0.04);
        }, d);
      }
      void fwPositions;
    } else if (kind === 'draw') {
      burst(cx, cy - H * 0.1, 40, 2.5, 6, false);
      setTimeout(() => burst(cx + W * 0.22, cy + H * 0.15, 30, 2, 5, false), 250);
      ring(cx, cy, '#8ecae6', 2.4, 6, 0.04);
      ring(cx, cy, '#ffffff', 1.2, 5, 0.05);
    } else {
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

    const drawHeart = (x: number, y: number, r: number, rot: number, color: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.9);
      ctx.bezierCurveTo(-r * 1.1, 0, -r * 0.9, -r * 0.9, 0, -r * 0.4);
      ctx.bezierCurveTo(r * 0.9, -r * 0.9, r * 1.1, 0, 0, r * 0.9);
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

      // 烟花上升与绽放
      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];
        if (fw.state === 'rise') {
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
        } else if (p.kind === 'heart') {
          p.rot += p.spin;
          drawHeart(p.x, p.y, p.r * p.life, p.rot, p.c);
        } else if (p.kind === 'confetti') {
          p.rot += p.spin;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = a;
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.r * p.life, -p.r * 0.5 * p.life, p.r * 2 * p.life, p.r * p.life);
          ctx.restore();
          ctx.globalAlpha = 1;
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

      if (elapsed < DURATION && (parts.length > 0 || rings.length > 0 || fireworks.length > 0)) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return createPortal(
    <div className={`gomoku-result-fx ${kind === 'win' ? 'fx-win' : kind === 'draw' ? 'fx-draw' : 'fx-lose'}`}>
      <canvas ref={canvasRef} className="gomoku-result-fx-canvas" />
      {kind === 'win' && scheme && (
        <>
          <div className="fx-banner fx-banner-win">
            <span className="fx-banner-icon">🎉</span>
            <span className="fx-banner-text">{bannerText}</span>
            <span className="fx-banner-icon">🎉</span>
          </div>
          <div className="fx-like">
            {scheme.likes.map((e, i) => (
              <span
                key={i}
                className="fx-like-item"
                style={{
                  left: `${4 + i * (92 / Math.max(1, scheme.likes.length - 1))}%`,
                  animationDelay: `${0.2 + i * 0.18}s`,
                  fontSize: i % 3 === 0 ? '1.1em' : i % 3 === 1 ? '0.85em' : undefined,
                }}
              >
                {e}
              </span>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body
  );
};
