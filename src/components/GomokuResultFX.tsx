/**
 * ChessKids - 五子棋对局结束特效（Canvas 粒子 + 音效）
 * win  → 金色烟花从棋盘中心迸发 + 星星飘落
 * lose → 灰蓝低落粒子
 * draw → 蓝白中性粒子
 * 挂载即自动播放对应音效，粒子动画约 2.2s 后淡出
 */
import React, { useEffect, useRef } from 'react';
import { playGomokuWin, playGomokuLose, playGomokuDraw } from '../engine/gomokuSound';

export type GomokuFXKind = 'win' | 'lose' | 'draw';

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; decay: number;
  r: number; c: string; grav: number; kind: 'burst' | 'star' | 'drop';
  spin: number; rot: number;
};

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
    const cx = W / 2;
    const cy = H / 2;

    const winColors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#ffe66d', '#ff9f1c', '#ffffff', '#ff4d8d'];
    const loseColors = ['#9aa0a6', '#6d7278', '#565b62', '#8b9199'];
    const drawColors = ['#8ecae6', '#bde0fe', '#ffffff', '#a2d2ff'];
    const colors = kind === 'win' ? winColors : kind === 'draw' ? drawColors : loseColors;

    const N = kind === 'win' ? 110 : 48;
    // 迸发粒子
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'win' ? 4 + Math.random() * 9 : 2.5 + Math.random() * 4.5;
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (kind === 'win' ? 2.5 : 1.2),
        life: 1, decay: 0.008 + Math.random() * 0.014,
        r: 2 + Math.random() * (kind === 'win' ? 4.5 : 3),
        c: colors[i % colors.length],
        grav: kind === 'win' ? 0.22 : 0.12,
        kind: 'burst', spin: 0, rot: 0,
      });
    }
    // 胜利：顶部飘落星星
    if (kind === 'win') {
      for (let i = 0; i < 16; i++) {
        parts.push({
          x: Math.random() * W, y: -10 - Math.random() * 60,
          vx: (Math.random() - 0.5) * 0.8, vy: 1.4 + Math.random() * 1.8,
          life: 1, decay: 0.004 + Math.random() * 0.006,
          r: 5 + Math.random() * 6,
          c: colors[i % colors.length],
          grav: 0.015,
          kind: 'star', spin: (Math.random() - 0.5) * 0.12, rot: Math.random() * Math.PI,
        });
      }
    }

    let raf = 0;
    const t0 = performance.now();
    const DURATION = 2400;

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
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.grav;
        p.vx *= 0.985;
        p.life -= p.decay;
        if (p.life <= 0 || p.y > H + 20) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        if (p.kind === 'star') {
          p.rot += p.spin;
          drawStar(p.x, p.y, p.r * p.life, p.rot, p.c);
        } else {
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (elapsed < DURATION && parts.length > 0) {
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
        <div className="fx-banner fx-banner-win">
          <span className="fx-banner-icon">🎉</span>
          <span className="fx-banner-text">{label || '你赢了！'}</span>
          <span className="fx-banner-icon">🎉</span>
        </div>
      )}
    </div>
  );
};
