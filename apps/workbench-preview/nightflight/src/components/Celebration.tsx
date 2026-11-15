import { useEffect, useRef } from 'react';

/**
 * 提案完成时的彩带。
 * 用工作区自己的配色（黑、白、灰、橙）撒一阵纸屑和彩带，约 4 秒后自行结束。
 * 系统开启"减少动态效果"时不播放。
 */

const COLORS = ['#0c0c0b', '#d8602a', '#bdbab3', '#ffffff', '#d8602a', '#0c0c0b', '#f1b55a'];

interface Piece { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string; ribbon: boolean; phase: number }

export function Celebration({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    el.width = W * dpr; el.height = H * dpr;
    ctx.scale(dpr, dpr);

    const count = Math.min(180, Math.round(W / 8));
    const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
      const ribbon = i % 5 === 0;
      return {
        x: Math.random() * W,
        y: -20 - Math.random() * H * 0.5,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 2.2 + Math.random() * 3.6,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.28,
        w: ribbon ? 5 : 6 + Math.random() * 6,
        h: ribbon ? 46 + Math.random() * 40 : 4 + Math.random() * 5,
        color: COLORS[i % COLORS.length],
        ribbon,
        phase: Math.random() * Math.PI * 2,
      };
    });

    const start = performance.now();
    const DURATION = 4200;
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = t > DURATION - 900 ? Math.max(0, (DURATION - t) / 900) : 1;
      for (const p of pieces) {
        p.x += p.vx + Math.sin(t / 380 + p.phase) * 0.8;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.ribbon) {
          // 彩带：一条随时间摆动的波浪线
          ctx.beginPath();
          for (let s = 0; s <= p.h; s += 4) {
            const dx = Math.sin(s / 9 + t / 160 + p.phase) * 5;
            if (s === 0) ctx.moveTo(dx, -s); else ctx.lineTo(dx, -s);
          }
          ctx.lineWidth = p.w;
          ctx.lineCap = 'round';
          ctx.strokeStyle = p.color === '#ffffff' ? '#0c0c0b' : p.color;
          ctx.stroke();
        } else {
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(t / 140 + p.phase)); // 翻转的纸屑
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          if (p.color === '#ffffff') { ctx.lineWidth = 1; ctx.strokeStyle = '#0c0c0b'; ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        }
        ctx.restore();
      }
      if (t < DURATION) raf = requestAnimationFrame(frame);
      else onDone();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  return <canvas ref={canvas} className="confetti" aria-hidden="true" />;
}
