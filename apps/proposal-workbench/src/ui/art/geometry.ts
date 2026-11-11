/** Deterministic randomness and smooth-curve helpers for the generated artwork. */

export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Pt = [number, number];

const f = (n: number) => Math.round(n * 10) / 10;

/** Catmull-Rom through the points, as cubic Bézier segments (without the initial M). */
export function smooth(points: Pt[]): string {
  let d = '';
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

export interface Ridge {
  d: string;
  points: Pt[];
  /** Height of the crest at x (linear between control points). */
  y: (x: number) => number;
}

/** A filled hill band from a wavy crest down to the bottom of the frame. */
export function ridge(W: number, H: number, base: number, amp: number, r: Rng, n = 5, tilt = 0): Ridge {
  const points: Pt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const x = (W * i) / n;
    points.push([x, base + (r() * 2 - 1) * amp + tilt * (i / n - 0.5)]);
  }
  const d = `M0 ${H} L${f(points[0][0])} ${f(points[0][1])}${smooth(points)} L${W} ${H} Z`;
  const y = (x: number) => {
    const seg = Math.min(n - 1, Math.max(0, Math.floor((x / W) * n)));
    const [x0, y0] = points[seg];
    const [x1, y1] = points[seg + 1];
    const t = (x - x0) / (x1 - x0 || 1);
    return y0 + (y1 - y0) * t;
  };
  return { d, points, y };
}

/** Splits a headline into lines of roughly `max` characters. */
export function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > max) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}

export const mix = (hex: string, other: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(other);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

export const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
