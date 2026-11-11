/**
 * Flat editorial illustrations, drawn from a palette and a seed. Each scene returns a back and
 * a front layer so a poster can slide its headline between them (type held by the landscape).
 * All of this is generated demo artwork.
 */
import type { ReactNode } from 'react';
import type { SceneSpec } from '../../domain/proposal';
import { luminance, mix, ridge, rng, smooth, type Pt, type Rng } from './geometry';

export interface SceneCtx {
  W: number;
  H: number;
  p: string[];
  r: Rng;
  uid: string;
  comp: SceneSpec['composition'];
  label?: string;
}

export interface Layers {
  defs?: ReactNode;
  back: ReactNode;
  front: ReactNode;
}

const P = (p: string[], i: number) => p[i] ?? p[p.length - 1];

function horizon(comp: SceneSpec['composition']) {
  switch (comp) {
    case 'low-horizon':
      return 0.64;
    case 'high-horizon':
      return 0.36;
    case 'close-up':
      return 0.44;
    case 'wide':
      return 0.58;
    default:
      return 0.54;
  }
}

function Walker({ x, y, s, color, arm = false, light }: { x: number; y: number; s: number; color: string; arm?: boolean; light?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className="art-figure">
      <circle cx="0" cy="-17" r="3.2" fill={color} />
      <path d="M-3.6 -13 L3.4 -13 L4.4 -3 L-4.2 -3 Z" fill={color} />
      <path d="M-4 -13 L-7.5 -12 L-7 -4.5 L-4 -5 Z" fill={color} opacity="0.85" />
      <path d="M-2.4 -3 L-3.4 5.5 M2.4 -3 L3.6 5.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      {arm ? <path d="M3.2 -12 L7.5 -16" stroke={color} strokeWidth="1.8" strokeLinecap="round" /> : <path d="M3.4 -12 L5.6 -5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />}
      {light && <circle cx="1.6" cy="-17.4" r="1.6" fill={light} opacity="0.85" />}
    </g>
  );
}

function sky(ctx: SceneCtx, top: string, bottom: string, id = 'sky') {
  return {
    def: (
      <linearGradient id={`${ctx.uid}-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={top} />
        <stop offset="1" stopColor={bottom} />
      </linearGradient>
    ),
    rect: <rect className="art-bg" width={ctx.W} height={ctx.H} fill={`url(#${ctx.uid}-${id})`} />,
  };
}

function stars(ctx: SceneCtx, n: number, color = '#ffffff') {
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i += 1) out.push(<circle key={i} cx={ctx.r() * ctx.W} cy={ctx.r() * ctx.H * 0.4} r={ctx.r() * 0.9 + 0.3} fill={color} opacity={0.4 + ctx.r() * 0.5} />);
  return out;
}

/** A path that narrows towards the far end, from the bottom of the frame up to (tx, ty). */
function trail(ctx: SceneCtx, tx: number, ty: number, color: string) {
  const { W, H } = ctx;
  const bx = W * 0.32;
  const bw = W * 0.14;
  const mid: Pt = [W * 0.5, (H + ty) / 2 + H * 0.05];
  const left = `M${bx - bw / 2} ${H} Q${mid[0] - W * 0.12} ${mid[1]} ${tx - 1} ${ty}`;
  const right = `L${tx + 1} ${ty} Q${mid[0] - W * 0.02} ${mid[1]} ${bx + bw / 2} ${H} Z`;
  return <path d={`${left} ${right}`} fill={color} opacity="0.85" />;
}

// ---------------------------------------------------------------------------

function ridgeScene(ctx: SceneCtx, frost: boolean): Layers {
  const { W, H, p, r, comp } = ctx;
  const hz = horizon(comp);
  const s = sky(ctx, mix(P(p, 0), '#ffffff', 0.25), P(p, 0));
  // Frost posters set type just above the ridge, so the sun sits high and clear of it.
  const sunY = frost ? H * hz * 0.32 : H * hz * 0.5;
  const far = ridge(W, H, H * hz, H * 0.045, r, 6);
  const mid = ridge(W, H, H * (hz + 0.1), H * 0.05, r, 5);
  const nearBase = comp === 'close-up' ? hz + 0.16 : hz + 0.25;
  const near = ridge(W, H, H * nearBase, H * (comp === 'close-up' ? 0.08 : 0.04), r, 4);
  const centered = comp === 'centered';
  const wx = centered ? W * 0.5 : W * 0.57;
  const wy = centered ? far.y(wx) + 1 : mid.y(wx) + 2;
  const ws = (H / 300) * (centered ? 1.5 : comp === 'wide' ? 0.75 : 1);
  const frostMarks: ReactNode[] = [];
  if (frost) {
    for (let i = 0; i < 90; i += 1) {
      const x = r() * W;
      const y0 = near.y(x) + 4 + r() * (H - near.y(x) - 4);
      const h = 2 + r() * 4;
      frostMarks.push(<path key={i} d={`M${x} ${y0} l${(r() - 0.5) * 2} ${-h}`} stroke="#ffffff" strokeWidth="1" opacity={0.45 + r() * 0.4} strokeLinecap="round" />);
    }
  }
  return {
    defs: s.def,
    back: (
      <>
        {s.rect}
        <circle cx={W * (frost ? 0.8 : 0.74)} cy={sunY} r={Math.min(W, H) * 0.065} fill={P(p, 4)} opacity={frost ? 0.85 : 1} />
        <path d={far.d} fill={P(p, 1)} />
      </>
    ),
    front: (
      <>
        <path d={mid.d} fill={P(p, 2)} />
        <path d={near.d} fill={P(p, 3)} />
        {frost && <path d={near.d} fill="#ffffff" opacity="0.12" />}
        {!centered && trail(ctx, wx, wy, mix(P(p, 0), '#ffffff', 0.3))}
        {frostMarks}
        <Walker x={wx} y={wy} s={ws} color={P(p, 5)} />
        {frost && <ellipse cx={wx + 9 * ws} cy={wy - 19 * ws} rx={4 * ws} ry={2.4 * ws} fill="#ffffff" opacity="0.75" />}
      </>
    ),
  };
}

function groupDusk(ctx: SceneCtx): Layers {
  const { W, H, p, r, comp } = ctx;
  const hz = horizon(comp);
  const dark = luminance(P(p, 0)) < 0.35;
  const s = sky(ctx, mix(P(p, 0), '#000000', 0.2), mix(P(p, 0), P(p, 4), dark ? 0.18 : 0.35));
  const far = ridge(W, H, H * hz, H * 0.04, r, 6);
  const mid = ridge(W, H, H * (hz + 0.12), H * 0.04, r, 5, -H * 0.04);
  const near = ridge(W, H, H * (hz + (comp === 'close-up' ? 0.18 : 0.26)), H * 0.035, r, 4, H * 0.05);
  const houses: ReactNode[] = [];
  if (comp !== 'low-horizon') {
    const unit = Math.min(W, H) * 0.045;
    for (let i = 0; i < 5; i += 1) {
      const w = unit * (1.3 + r() * 0.6);
      const x = W * (0.6 + i * 0.075);
      const y = mid.y(x + w / 2) + unit * 0.9;
      const h = unit * (0.9 + r() * 0.5);
      const roof = unit * 0.55;
      houses.push(
        <g key={i}>
          <circle cx={x + w / 2} cy={y - h / 2} r={w * 1.1} fill={P(p, 4)} opacity="0.16" />
          <path d={`M${x} ${y} L${x} ${y - h} L${x + w / 2} ${y - h - roof} L${x + w} ${y - h} L${x + w} ${y} Z`} fill={mix(P(p, 3), '#000000', 0.25)} />
          <rect x={x + w * 0.18} y={y - h * 0.72} width={w * 0.24} height={h * 0.32} fill={P(p, 4)} />
          {i % 2 === 0 && <rect x={x + w * 0.58} y={y - h * 0.72} width={w * 0.24} height={h * 0.32} fill={P(p, 4)} />}
        </g>,
      );
    }
  }
  const close = comp === 'close-up';
  const gs = (H / 300) * (close ? 2.6 : comp === 'wide' ? 0.95 : 1.1);
  const gx = close ? W * 0.3 : W * 0.26;
  const people = [0, 1, 2, 3].map((i) => {
    const x = gx + i * 13 * gs + (i === 2 ? 3 : 0);
    const y = (close ? H * 0.98 : near.y(x)) + 1;
    return <Walker key={i} x={x} y={y} s={gs * (i === 1 ? 1.08 : i === 3 ? 0.92 : 1)} color={P(p, 5)} arm={i === 0} light={close ? P(p, 4) : undefined} />;
  });
  return {
    defs: s.def,
    back: (
      <>
        {s.rect}
        {dark && stars(ctx, 26)}
        <path d={far.d} fill={P(p, 1)} />
      </>
    ),
    front: (
      <>
        <path d={mid.d} fill={P(p, 2)} />
        {houses}
        <path d={near.d} fill={P(p, 3)} />
        {!close && trail(ctx, gx + 50 * gs, near.y(gx + 50 * gs) + 1, mix(P(p, 3), P(p, 4), 0.18))}
        {people}
      </>
    ),
  };
}

function fabricTerrain(ctx: SceneCtx): Layers {
  const { W, H, p, r, comp, label } = ctx;
  const frost = label === 'frost';
  const bands: ReactNode[] = [];
  const tilt = comp === 'diagonal' ? -H * 0.22 : 0;
  const count = 11;
  let walkerRidge: ReturnType<typeof ridge> | null = null;
  for (let k = 0; k < count; k += 1) {
    const base = H * (0.24 + k * 0.075);
    const rg = ridge(W, H, base, H * 0.03, r, 9, tilt);
    if (k === 3) walkerRidge = rg;
    const t = k / (count - 1);
    const fill = t < 0.5 ? mix(P(p, 1), P(p, 2), t * 2) : mix(P(p, 2), P(p, 3), (t - 0.5) * 2);
    const crest = `M${rg.points[0][0]} ${rg.points[0][1]}${smooth(rg.points)}`;
    bands.push(
      <g key={k}>
        <path d={rg.d} fill={fill} />
        <path d={crest} fill="none" stroke={frost ? '#ffffff' : mix(P(p, 2), P(p, 4), 0.5)} strokeWidth={frost ? 2.6 : 1.1} opacity={frost ? 0.95 : 0.5} />
        {frost && rg.points.slice(1, -1).map(([x, y], i) => <circle key={i} cx={x} cy={y + 2} r={1.4} fill="#ffffff" opacity="0.8" />)}
      </g>,
    );
  }
  const split = comp === 'split';
  const close = comp === 'close-up';
  const wx = W * 0.64;
  const wr = walkerRidge as ReturnType<typeof ridge> | null;
  return {
    back: (
      <>
        <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />
        <circle cx={W * 0.8} cy={H * 0.16} r={Math.min(W, H) * 0.06} fill={P(p, 4)} />
      </>
    ),
    front: (
      <>
        {bands}
        {!close && wr && <Walker x={wx} y={wr.y(wx) + 1} s={H / 300} color={P(p, 5)} />}
        {split && (
          <g>
            <rect x="0" y="0" width={W * 0.45} height={H} fill={P(p, 0)} />
            <path d={`M${W * 0.12} ${H * 0.3} L${W * 0.33} ${H * 0.3} L${W * 0.38} ${H * 0.45} L${W * 0.33} ${H * 0.47} L${W * 0.32} ${H * 0.8} L${W * 0.13} ${H * 0.8} L${W * 0.12} ${H * 0.47} L${W * 0.07} ${H * 0.45} Z`} fill={P(p, 2)} />
          </g>
        )}
      </>
    ),
  };
}

function summit(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  const s = sky(ctx, P(p, 0), mix(P(p, 0), '#ffffff', 0.5));
  const peak = (cx: number, top: number, w: number, fill: string, snow: string, shade: string) => (
    <g>
      <path d={`M${cx - w} ${H} L${cx} ${top} L${cx + w} ${H} Z`} fill={fill} />
      <path d={`M${cx} ${top} L${cx + w} ${H} L${cx + w * 0.15} ${H} Z`} fill={shade} opacity="0.55" />
      <path d={`M${cx} ${top} L${cx - w * 0.22} ${top + (H - top) * 0.22} L${cx - w * 0.06} ${top + (H - top) * 0.17} L${cx + w * 0.05} ${top + (H - top) * 0.25} L${cx + w * 0.2} ${top + (H - top) * 0.2} Z`} fill={snow} />
    </g>
  );
  const top = H * (0.16 + r() * 0.05);
  return {
    defs: s.def,
    back: (
      <>
        {s.rect}
        {peak(W * 0.2, H * 0.42, W * 0.32, P(p, 1), P(p, 4), P(p, 3))}
        {peak(W * 0.85, H * 0.38, W * 0.3, P(p, 1), P(p, 4), P(p, 3))}
      </>
    ),
    front: (
      <>
        {peak(W * 0.52, top, W * 0.42, P(p, 2), P(p, 4), P(p, 3))}
        <Walker x={W * 0.52} y={top + 1} s={H / 260} color={P(p, 5)} arm />
        <path d={`M${W * 0.52 + 7} ${top - 14} l0 -14 l9 4 l-9 4`} fill="#d33f2a" stroke={P(p, 5)} strokeWidth="0.8" />
      </>
    ),
  };
}

function studioJacket(ctx: SceneCtx): Layers {
  const { W, H, p } = ctx;
  const cx = W * 0.5;
  const t = H * 0.18;
  const b = H * 0.82;
  const callout = (y: number, side: number, key: number) => (
    <g key={key}>
      <path d={`M${cx + side * W * 0.12} ${y} L${cx + side * W * 0.3} ${y}`} stroke={P(p, 3)} strokeWidth="1" />
      <circle cx={cx + side * W * 0.12} cy={y} r="2.5" fill={P(p, 3)} />
      <rect x={side > 0 ? cx + W * 0.31 : cx - W * 0.45} y={y - 6} width={W * 0.14} height="4" fill={P(p, 3)} />
      <rect x={side > 0 ? cx + W * 0.31 : cx - W * 0.45} y={y + 1} width={W * 0.09} height="3" fill={P(p, 3)} opacity="0.5" />
    </g>
  );
  return {
    back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />,
    front: (
      <>
        <ellipse cx={cx} cy={b + 6} rx={W * 0.2} ry={H * 0.02} fill="#000000" opacity="0.12" />
        <path d={`M${cx - W * 0.12} ${t} Q${cx} ${t - H * 0.06} ${cx + W * 0.12} ${t} L${cx + W * 0.26} ${t + H * 0.28} L${cx + W * 0.2} ${t + H * 0.3} L${cx + W * 0.15} ${t + H * 0.18} L${cx + W * 0.15} ${b} L${cx - W * 0.15} ${b} L${cx - W * 0.15} ${t + H * 0.18} L${cx - W * 0.2} ${t + H * 0.3} L${cx - W * 0.26} ${t + H * 0.28} Z`} fill={P(p, 1)} />
        <path d={`M${cx} ${t} L${cx} ${b}`} stroke={P(p, 4)} strokeWidth="1.5" />
        <path d={`M${cx + W * 0.02} ${t} L${cx + W * 0.15} ${b} L${cx} ${b} Z`} fill={P(p, 2)} opacity="0.5" />
        {callout(H * 0.32, 1, 1)}
        {callout(H * 0.55, -1, 2)}
        {callout(H * 0.68, 1, 3)}
      </>
    ),
  };
}

function cabinWindow(ctx: SceneCtx): Layers {
  const { W, H, p, r, uid, comp } = ctx;
  const close = comp === 'close-up';
  const s = sky(ctx, mix(P(p, 0), '#000000', 0.25), P(p, 0));
  const hill = ridge(W, H, H * 0.66, H * 0.03, r, 4);
  const cw = close ? W * 0.6 : W * 0.26;
  const ch = close ? H * 0.7 : H * 0.22;
  const cx = close ? W * 0.2 : W * 0.55;
  const cy = close ? H * 0.95 : hill.y(W * 0.68) + 2;
  const trees = [0.1, 0.2, 0.86, 0.93].map((t, i) => {
    const x = W * t;
    const y = hill.y(x) + 4;
    const h = H * (0.16 + r() * 0.08);
    return <path key={i} d={`M${x} ${y - h} L${x + h * 0.28} ${y} L${x - h * 0.28} ${y} Z`} fill={P(p, 3)} />;
  });
  return {
    defs: (
      <>
        {s.def}
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0" stopColor={P(p, 4)} stopOpacity="0.7" />
          <stop offset="1" stopColor={P(p, 4)} stopOpacity="0" />
        </radialGradient>
      </>
    ),
    back: (
      <>
        {s.rect}
        {stars(ctx, 30)}
      </>
    ),
    front: (
      <>
        <path d={hill.d} fill={P(p, 2)} />
        {trees}
        <circle cx={cx + cw * 0.5} cy={cy - ch * 0.5} r={cw * 0.9} fill={`url(#${uid}-glow)`} />
        <path d={`M${cx} ${cy} L${cx} ${cy - ch} L${cx + cw / 2} ${cy - ch - cw * 0.35} L${cx + cw} ${cy - ch} L${cx + cw} ${cy} Z`} fill={P(p, 3)} />
        <rect x={cx + cw * 0.2} y={cy - ch * 0.78} width={cw * 0.6} height={ch * 0.5} fill={P(p, 4)} />
        <path d={`M${cx + cw * 0.5} ${cy - ch * 0.78} l0 ${ch * 0.5} M${cx + cw * 0.2} ${cy - ch * 0.53} l${cw * 0.6} 0`} stroke={P(p, 3)} strokeWidth={cw * 0.03} />
        <path d={`M${cx + cw * 0.78} ${cy - ch - cw * 0.2} q${cw * 0.1} -${ch * 0.2} 0 -${ch * 0.4} q-${cw * 0.1} -${ch * 0.2} ${cw * 0.05} -${ch * 0.4}`} fill="none" stroke={mix(P(p, 0), '#ffffff', 0.4)} strokeWidth="2" opacity="0.5" />
      </>
    ),
  };
}

function contour(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  const cx = W * 0.55;
  const cy = H * 0.5;
  const loops: ReactNode[] = [];
  for (let k = 1; k <= 10; k += 1) {
    const pts: Pt[] = [];
    const n = 12;
    const base = Math.min(W, H) * 0.06 * k;
    for (let i = 0; i <= n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const rr = base * (1 + (r() - 0.5) * 0.25);
      pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr]);
    }
    pts[n] = pts[0];
    loops.push(<path key={k} d={`M${pts[0][0]} ${pts[0][1]}${smooth(pts)}`} fill="none" stroke={k % 3 === 0 ? P(p, 3) : P(p, 2)} strokeWidth={k % 3 === 0 ? 1.6 : 1} />);
  }
  return {
    back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />,
    front: (
      <>
        {loops}
        <path d={`M${W * 0.1} ${H * 0.9} Q${W * 0.35} ${H * 0.6} ${cx} ${cy}`} fill="none" stroke={P(p, 4)} strokeWidth="2.4" strokeDasharray="5 5" />
        <path d={`M${cx - 5} ${cy + 4} L${cx} ${cy - 6} L${cx + 5} ${cy + 4} Z`} fill={P(p, 5)} />
      </>
    ),
  };
}

function knit(ctx: SceneCtx): Layers {
  const { W, H, p } = ctx;
  const rows = 12;
  const cols = 11;
  const h = H / rows;
  const w = W / cols;
  const stitches: ReactNode[] = [];
  for (let y = 0; y < rows + 1; y += 1) {
    for (let x = 0; x < cols + 1; x += 1) {
      const cx = x * w + (y % 2 ? w / 2 : 0);
      const cy = y * h;
      const light = cx / W;
      const c = mix(P(p, 3), P(p, 4), light * 0.8);
      stitches.push(<path key={`${x}-${y}`} d={`M${cx - w * 0.32} ${cy} L${cx} ${cy + h * 0.7} L${cx + w * 0.32} ${cy}`} fill="none" stroke={c} strokeWidth={w * 0.26} strokeLinecap="round" strokeLinejoin="round" />);
    }
  }
  return { back: <rect className="art-bg" width={W} height={H} fill={P(p, 2)} />, front: <>{stitches}</> };
}

function thermos(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  const hill = ridge(W, H, H * 0.55, H * 0.04, r, 4);
  const ground = ridge(W, H, H * 0.78, H * 0.02, r, 3);
  const fx = W * 0.38;
  const fy = H * 0.86;
  return {
    back: (
      <>
        <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />
        <path d={hill.d} fill={P(p, 1)} />
      </>
    ),
    front: (
      <>
        <path d={ground.d} fill={P(p, 3)} />
        {[0.58, 0.72, 0.86].map((t, i) => (
          <rect key={i} x={W * t} y={H * 0.5} width={W * 0.018} height={H * 0.36} fill={P(p, 5)} />
        ))}
        <rect x={W * 0.56} y={H * 0.58} width={W * 0.34} height={H * 0.022} fill={P(p, 5)} />
        <rect x={W * 0.56} y={H * 0.68} width={W * 0.34} height={H * 0.022} fill={P(p, 5)} />
        <rect x={fx} y={fy - H * 0.32} width={W * 0.09} height={H * 0.32} rx={W * 0.015} fill={P(p, 2)} />
        <rect x={fx - W * 0.005} y={fy - H * 0.36} width={W * 0.1} height={H * 0.05} rx="3" fill={P(p, 5)} />
        <path d={`M${fx - W * 0.1} ${fy - H * 0.1} l${W * 0.06} 0 l-${W * 0.006} ${H * 0.1} l-${W * 0.048} 0 Z`} fill={P(p, 4)} />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${fx - W * 0.08 + i * 8} ${fy - H * 0.12} q6 -10 0 -20 q-6 -10 2 -22`} fill="none" stroke={P(p, 4)} strokeWidth="2" opacity="0.8" strokeLinecap="round" />
        ))}
      </>
    ),
  };
}

function catalogue(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  const a = ridge(W, H, H * 0.52, H * 0.06, r, 3);
  const b = ridge(W, H, H * 0.66, H * 0.06, r, 3);
  const c = ridge(W, H, H * 0.82, H * 0.04, r, 2);
  return {
    back: (
      <>
        <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />
        <circle cx={W * 0.5} cy={H * 0.42} r={Math.min(W, H) * 0.2} fill={P(p, 4)} />
        <path d={a.d} fill={P(p, 1)} />
      </>
    ),
    front: (
      <>
        <path d={b.d} fill={P(p, 2)} />
        <path d={c.d} fill={P(p, 3)} />
        <path d={`M${W * 0.2} ${H} Q${W * 0.45} ${H * 0.78} ${W * 0.62} ${b.y(W * 0.62)}`} fill="none" stroke={P(p, 0)} strokeWidth={W * 0.02} />
        <rect x="6" y="6" width={W - 12} height={H - 12} fill="none" stroke={P(p, 5)} strokeWidth="3" />
      </>
    ),
  };
}

function blossom(x: number, y: number, s: number, petal: string, centre: string, key: string | number) {
  return (
    <g key={key} transform={`translate(${x} ${y})`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return <circle key={i} cx={Math.cos(a) * s} cy={Math.sin(a) * s} r={s * 0.75} fill={petal} />;
      })}
      <circle r={s * 0.45} fill={centre} />
    </g>
  );
}

function plumInk(ctx: SceneCtx): Layers {
  const { W, H, p, r, comp, label } = ctx;
  const sc = Math.min(W, H) / 300;
  const startY = comp === 'low-horizon' ? H * 0.98 : H * 0.8;
  const noSeal = label === 'noseal';
  const main = `M${W * 0.04} ${startY} C${W * 0.25} ${H * 0.62} ${W * 0.38} ${H * 0.7} ${W * 0.55} ${H * 0.45} S${W * 0.82} ${H * 0.28} ${W * 0.98} ${H * 0.18}`;
  const twigs = [
    `M${W * 0.3} ${H * 0.64} q${W * 0.04} -${H * 0.14} ${W * 0.12} -${H * 0.2}`,
    `M${W * 0.55} ${H * 0.45} q-${W * 0.02} -${H * 0.15} ${W * 0.06} -${H * 0.27}`,
    `M${W * 0.7} ${H * 0.33} q${W * 0.08} ${H * 0.02} ${W * 0.12} ${H * 0.12}`,
  ];
  const flowers: ReactNode[] = [];
  const spots: Pt[] = [
    [0.42, 0.44],
    [0.61, 0.18],
    [0.82, 0.45],
    [0.5, 0.52],
    [0.72, 0.28],
    [0.9, 0.2],
    [0.27, 0.62],
    [0.36, 0.5],
  ];
  spots.forEach(([x, y], i) => flowers.push(blossom(W * x, H * y, (5 + r() * 3) * sc, P(p, 1), P(p, 4), `f${i}`)));
  const fruit: Pt[] = [
    [0.58, 0.5],
    [0.79, 0.36],
  ];
  const centred = comp === 'centered';
  const sealSize = (centred ? 70 : 34) * sc;
  const sx = centred ? W / 2 - sealSize / 2 : W * 0.82;
  const sy = centred ? H / 2 - sealSize / 2 : H * 0.72;
  return {
    back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />,
    front: (
      <>
        <path d={main} fill="none" stroke={P(p, 5)} strokeWidth={9 * sc} strokeLinecap="round" />
        <path d={main} fill="none" stroke={P(p, 5)} strokeWidth={4 * sc} strokeLinecap="round" transform={`translate(${2 * sc} ${-3 * sc})`} opacity="0.6" />
        {twigs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={P(p, 5)} strokeWidth={3.2 * sc} strokeLinecap="round" />
        ))}
        {flowers}
        {fruit.map(([x, y], i) => (
          <g key={i}>
            <circle cx={W * x} cy={H * y + 12 * sc} r={11 * sc} fill={P(p, 2)} />
            <circle cx={W * x - 3 * sc} cy={H * y + 8 * sc} r={3 * sc} fill="#ffffff" opacity="0.5" />
          </g>
        ))}
        {!noSeal && <rect x={sx} y={sy} width={sealSize} height={sealSize} rx={3 * sc} fill={P(p, 4)} />}
        {!noSeal && <path d={`M${sx + sealSize * 0.25} ${sy + sealSize * 0.25} h${sealSize * 0.5} M${sx + sealSize * 0.25} ${sy + sealSize * 0.5} h${sealSize * 0.5} M${sx + sealSize * 0.5} ${sy + sealSize * 0.25} v${sealSize * 0.5}`} stroke={P(p, 0)} strokeWidth={2.4 * sc} />}
      </>
    ),
  };
}

function bubbles(ctx: SceneCtx): Layers {
  const { W, H, p, r, uid, comp } = ctx;
  const g = (
    <linearGradient id={`${uid}-bub`} x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor={P(p, 0)} />
      <stop offset="1" stopColor={P(p, 3)} />
    </linearGradient>
  );
  const items: ReactNode[] = [];
  if (comp === 'close-up') {
    items.push(<circle key="big" cx={W * 0.5} cy={H * 0.52} r={Math.min(W, H) * 0.34} fill={P(p, 2)} opacity="0.5" stroke={P(p, 4)} strokeWidth="3" />);
  } else {
    for (let i = 0; i < 46; i += 1) {
      const t = r();
      const y = H * (1 - t);
      const x = comp === 'diagonal' ? W * (0.1 + t * 0.8) + (r() - 0.5) * W * 0.25 : r() * W;
      const rad = (2 + t * 12 + r() * 4) * (Math.min(W, H) / 300);
      items.push(<circle key={i} cx={x} cy={y} r={rad} fill={P(p, 4)} fillOpacity={0.12 + t * 0.15} stroke={P(p, 4)} strokeWidth={1 + t} opacity={0.5 + t * 0.4} />);
    }
  }
  return { defs: g, back: <rect className="art-bg" width={W} height={H} fill={`url(#${uid}-bub)`} />, front: <>{items}</> };
}

function plumTree(x: number, base: number, h: number, p: string[], r: Rng, key: string) {
  const trunk = `M${x} ${base} C${x - h * 0.05} ${base - h * 0.4} ${x + h * 0.08} ${base - h * 0.55} ${x} ${base - h * 0.8}`;
  const out: ReactNode[] = [
    <path key={`${key}t`} d={trunk} fill="none" stroke={P(p, 5)} strokeWidth={h * 0.05} strokeLinecap="round" />,
    <path key={`${key}b1`} d={`M${x} ${base - h * 0.55} q${h * 0.2} -${h * 0.1} ${h * 0.35} -${h * 0.35}`} fill="none" stroke={P(p, 5)} strokeWidth={h * 0.025} strokeLinecap="round" />,
    <path key={`${key}b2`} d={`M${x} ${base - h * 0.62} q-${h * 0.2} -${h * 0.08} -${h * 0.32} -${h * 0.3}`} fill="none" stroke={P(p, 5)} strokeWidth={h * 0.025} strokeLinecap="round" />,
  ];
  for (let i = 0; i < 26; i += 1) {
    const a = r() * Math.PI;
    const rr = h * (0.15 + r() * 0.35);
    out.push(blossom(x + Math.cos(a) * rr * 1.2, base - h * 0.7 - Math.sin(a) * rr * 0.8, h * 0.02 + r() * h * 0.012, i % 3 ? '#f2b8c6' : '#ffffff', P(p, 2), `${key}f${i}`));
  }
  return out;
}

function rooftop(ctx: SceneCtx): Layers {
  const { W, H, p, r, uid, comp } = ctx;
  const s = sky(ctx, P(p, 0), P(p, 1));
  const city: ReactNode[] = [];
  for (let i = 0; i < 14; i += 1) {
    const w = W * (0.05 + r() * 0.05);
    const x = (i / 14) * W - 6;
    const h = H * (0.18 + r() * 0.2);
    city.push(<rect key={i} x={x} y={H * 0.62 - h} width={w} height={h + 2} fill={P(p, 3)} />);
    for (let j = 0; j < 3; j += 1) if (r() > 0.4) city.push(<rect key={`${i}w${j}`} x={x + w * 0.3} y={H * 0.62 - h + h * (0.2 + j * 0.25)} width={w * 0.15} height={w * 0.15} fill={P(p, 4)} opacity="0.8" />);
  }
  const lights: ReactNode[] = [];
  for (let i = 0; i < 18; i += 1) {
    const t = i / 17;
    lights.push(<circle key={i} cx={W * t} cy={H * 0.3 + Math.sin(t * Math.PI) * H * 0.09} r={Math.min(W, H) * 0.008} fill={P(p, 4)} />);
  }
  const deckY = H * 0.86;
  const sc = H / 300;
  if (comp === 'high-horizon') {
    return {
      back: <rect className="art-bg" width={W} height={H} fill={P(p, 1)} />,
      front: (
        <>
          <circle cx={W / 2} cy={H / 2} r={Math.min(W, H) * 0.32} fill={P(p, 0)} />
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return <rect key={i} x={W / 2 + Math.cos(a) * 50 * sc - 6} y={H / 2 + Math.sin(a) * 50 * sc - 6} width={12 * sc} height={12 * sc} rx={6 * sc} fill={P(p, 2)} />;
          })}
        </>
      ),
    };
  }
  if (comp === 'close-up') {
    return {
      back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />,
      front: (
        <>
          <path d={`M0 ${H * 0.7} q${W * 0.25} -${H * 0.15} ${W * 0.45} -${H * 0.12} l0 ${H * 0.1} q-${W * 0.2} ${H * 0.02} -${W * 0.45} ${H * 0.2} Z`} fill={P(p, 3)} />
          <path d={`M${W} ${H * 0.6} q-${W * 0.25} -${H * 0.05} -${W * 0.42} ${H * 0.02} l0 ${H * 0.1} q${W * 0.2} -${H * 0.05} ${W * 0.42} ${H * 0.02} Z`} fill={P(p, 2)} />
          <rect x={W * 0.43} y={H * 0.42} width={W * 0.12} height={H * 0.3} rx={6} fill={P(p, 4)} />
        </>
      ),
    };
  }
  const people = [0.2, 0.36, 0.64, 0.8].map((t, i) => {
    const x = W * t;
    return (
      <g key={i}>
        <circle cx={x} cy={deckY - 34 * sc} r={6 * sc} fill={P(p, 5)} />
        <path d={`M${x - 9 * sc} ${deckY - 26 * sc} q${9 * sc} -${5 * sc} ${18 * sc} 0 l${2 * sc} ${16 * sc} l-${22 * sc} 0 Z`} fill={i % 2 ? P(p, 3) : P(p, 5)} />
        <rect x={x + (i < 2 ? 8 : -12) * sc} y={deckY - 20 * sc} width={4 * sc} height={7 * sc} rx="1" fill={P(p, 4)} />
      </g>
    );
  });
  return {
    defs: (
      <>
        {s.def}
        <clipPath id={`${uid}-full`}>
          <rect width={W} height={H} />
        </clipPath>
      </>
    ),
    back: (
      <>
        {s.rect}
        {city}
      </>
    ),
    front: (
      <>
        <path d={`M0 ${H * 0.3} Q${W / 2} ${H * 0.48} ${W} ${H * 0.3}`} fill="none" stroke={P(p, 5)} strokeWidth="0.8" opacity="0.6" />
        {lights}
        <rect x="0" y={H * 0.62} width={W} height={H * 0.38} fill={P(p, 2)} />
        <rect x="0" y={H * 0.62} width={W} height={H * 0.03} fill={P(p, 3)} />
        {plumTree(W * 0.5, deckY, H * 0.62, p, r, 'tree')}
        <rect x={W * 0.08} y={deckY - 12 * sc} width={W * 0.84} height={6 * sc} fill={P(p, 3)} />
        {people}
        {W / H > 1.6 && (
          <g>
            <path d={`M0 ${H * 0.34} C${W * 0.2} ${H * 0.26} ${W * 0.35} ${H * 0.4} ${W * 0.5} ${H * 0.33} S${W * 0.8} ${H * 0.26} ${W} ${H * 0.36}`} fill="none" stroke={P(p, 5)} strokeWidth={H * 0.018} strokeLinecap="round" />
            {Array.from({ length: 16 }, (_, i) => blossom(W * (0.03 + i * 0.0625), H * (0.31 + (i % 3) * 0.025), H * 0.016, i % 2 ? '#ffffff' : '#f2b8c6', P(p, 3), `pb${i}`))}
            {[0.12, 0.37, 0.62, 0.87].map((t, i) => (
              <circle key={`pf${i}`} cx={W * t} cy={H * 0.39} r={H * 0.022} fill="#b8323f" />
            ))}
          </g>
        )}
      </>
    ),
  };
}

function giftWrap(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  const cx = W / 2;
  const cy = H * 0.56;
  const s = Math.min(W, H) * 0.36;
  const motifs: ReactNode[] = [];
  for (let i = 0; i < 16; i += 1) motifs.push(blossom(cx + (r() - 0.5) * s * 1.3, cy + (r() - 0.5) * s * 1.1, Math.min(W, H) * 0.014, P(p, 2), P(p, 4), i));
  return {
    back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />,
    front: (
      <>
        <ellipse cx={cx} cy={cy + s * 0.85} rx={s * 1.05} ry={s * 0.12} fill="#000000" opacity="0.1" />
        <path d={`M${cx - s * 0.85} ${cy - s * 0.35} L${cx + s * 0.85} ${cy - s * 0.35} Q${cx + s * 0.98} ${cy + s * 0.7} ${cx + s * 0.85} ${cy + s * 0.8} L${cx - s * 0.85} ${cy + s * 0.8} Q${cx - s * 0.98} ${cy + s * 0.7} ${cx - s * 0.85} ${cy - s * 0.35} Z`} fill={P(p, 1)} />
        <path d={`M${cx} ${cy - s * 0.4} L${cx - s * 0.85} ${cy + s * 0.8} M${cx} ${cy - s * 0.4} L${cx + s * 0.85} ${cy + s * 0.8}`} stroke={P(p, 2)} strokeWidth="1.2" opacity="0.45" />
        {motifs}
        <path d={`M${cx - s * 0.15} ${cy - s * 0.42} q-${s * 0.35} -${s * 0.4} -${s * 0.05} -${s * 0.45} q${s * 0.15} ${s * 0.1} ${s * 0.12} ${s * 0.4} Z`} fill={P(p, 2)} />
        <path d={`M${cx + s * 0.15} ${cy - s * 0.42} q${s * 0.35} -${s * 0.4} ${s * 0.05} -${s * 0.45} q-${s * 0.15} ${s * 0.1} -${s * 0.12} ${s * 0.4} Z`} fill={P(p, 2)} />
        <ellipse cx={cx} cy={cy - s * 0.4} rx={s * 0.13} ry={s * 0.09} fill={P(p, 3)} />
      </>
    ),
  };
}

function canRow(W: number, y: number, h: number, colours: string[], dot: string, r: Rng, count: number, x0 = 0) {
  const w = (W - x0 * 2) / count;
  return Array.from({ length: count }, (_, i) => {
    const x = x0 + i * w + w * 0.12;
    const cw = w * 0.76;
    const c = colours[i % colours.length];
    return (
      <g key={i}>
        <rect x={x} y={y - h} width={cw} height={h} rx={cw * 0.12} fill={c} />
        <rect x={x} y={y - h} width={cw} height={h * 0.08} fill="#000000" opacity="0.15" />
        <circle cx={x + cw * 0.5} cy={y - h * 0.45} r={cw * 0.24} fill={dot} opacity={0.5 + r() * 0.2} />
        <circle cx={x + cw * 0.42} cy={y - h * 0.5} r={cw * 0.08} fill="#ffffff" opacity="0.35" />
      </g>
    );
  });
}

function shelfLineup(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  return {
    back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />,
    front: (
      <>
        {canRow(W, H * 0.74, H * 0.42, [P(p, 1), P(p, 2), P(p, 3)], P(p, 4), r, 6, W * 0.03)}
        <rect x="0" y={H * 0.74} width={W} height={H * 0.05} fill={P(p, 5)} />
        <rect x={W * 0.05} y={H * 0.8} width={W * 0.12} height={H * 0.05} fill={P(p, 4)} />
      </>
    ),
  };
}

function fruitFlatlay(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  const plums: Array<[number, number, number]> = [
    [0.32, 0.5, 0.16],
    [0.62, 0.42, 0.13],
    [0.7, 0.72, 0.11],
  ];
  return {
    back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />,
    front: (
      <>
        {plums.map(([x, y, s], i) => {
          const R = Math.min(W, H) * s;
          return (
            <g key={i}>
              <circle cx={W * x} cy={H * y} r={R} fill={P(p, 3)} />
              {i === 0 && <ellipse cx={W * x} cy={H * y} rx={R * 0.82} ry={R * 0.78} fill={P(p, 4)} opacity="0.85" />}
              {i === 0 && <ellipse cx={W * x} cy={H * y} rx={R * 0.3} ry={R * 0.38} fill={P(p, 2)} />}
              <circle cx={W * x - R * 0.35} cy={H * y - R * 0.35} r={R * 0.12} fill="#ffffff" opacity="0.3" />
            </g>
          );
        })}
        {Array.from({ length: 14 }, (_, i) => (
          <ellipse key={i} cx={r() * W} cy={r() * H} rx={2 + r() * 2} ry={3 + r() * 2} fill="#ffffff" opacity="0.35" />
        ))}
      </>
    ),
  };
}

function perfumeGlass(ctx: SceneCtx): Layers {
  const { W, H, p, uid } = ctx;
  const bw = W * 0.3;
  const bh = H * 0.5;
  const x = W / 2 - bw / 2;
  const y = H * 0.3;
  return {
    defs: (
      <linearGradient id={`${uid}-glass`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor={P(p, 3)} />
        <stop offset="1" stopColor={P(p, 1)} />
      </linearGradient>
    ),
    back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />,
    front: (
      <>
        <ellipse cx={W / 2} cy={y + bh + 6} rx={bw * 0.7} ry={H * 0.025} fill="#000000" opacity="0.12" />
        <rect x={x} y={y} width={bw} height={bh} rx={bw * 0.18} fill={`url(#${uid}-glass)`} />
        <rect x={x + bw * 0.35} y={y - H * 0.1} width={bw * 0.3} height={H * 0.1} rx="3" fill={P(p, 5)} />
        <rect x={x + bw * 0.12} y={y + bh * 0.08} width={bw * 0.08} height={bh * 0.8} rx="3" fill="#ffffff" opacity="0.35" />
      </>
    ),
  };
}

function lanterns(ctx: SceneCtx): Layers {
  const { W, H, p, r, uid } = ctx;
  const strings: ReactNode[] = [];
  for (let s = 0; s < 3; s += 1) {
    const y = H * (0.18 + s * 0.14);
    strings.push(<path key={`s${s}`} d={`M0 ${y} Q${W / 2} ${y + H * 0.1} ${W} ${y}`} fill="none" stroke={P(p, 1)} strokeWidth="1" />);
    for (let i = 1; i < 9; i += 1) {
      const t = i / 9;
      const x = W * t;
      const yy = y + Math.sin(t * Math.PI) * H * 0.075 + 6;
      strings.push(
        <g key={`${s}-${i}`}>
          <circle cx={x} cy={yy} r={14} fill={`url(#${uid}-lg)`} />
          <ellipse cx={x} cy={yy} rx={6 + r() * 2} ry={8} fill={i % 2 ? P(p, 4) : P(p, 3)} />
        </g>,
      );
    }
  }
  return {
    defs: (
      <radialGradient id={`${uid}-lg`}>
        <stop offset="0" stopColor={P(p, 4)} stopOpacity="0.55" />
        <stop offset="1" stopColor={P(p, 4)} stopOpacity="0" />
      </radialGradient>
    ),
    back: (
      <>
        <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />
        <rect x="0" y={H * 0.2} width={W * 0.14} height={H * 0.8} fill={P(p, 1)} />
        <rect x={W * 0.86} y={H * 0.15} width={W * 0.14} height={H * 0.85} fill={P(p, 1)} />
      </>
    ),
    front: (
      <>
        {strings}
        <rect x="0" y={H * 0.88} width={W} height={H * 0.12} fill={P(p, 1)} />
      </>
    ),
  };
}

function chiller(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  const shelves = [0.32, 0.56, 0.8];
  return {
    back: <rect className="art-bg" width={W} height={H} fill={mix(P(p, 0), '#000000', 0.2)} />,
    front: (
      <>
        {shelves.map((y, i) => (
          <g key={i}>
            {canRow(W, H * y, H * 0.18, [P(p, 1), P(p, 2), P(p, 3), P(p, 1)], P(p, 4), r, 8, W * 0.06)}
            <rect x={W * 0.04} y={H * y} width={W * 0.92} height={H * 0.02} fill={mix(P(p, 4), '#ffffff', 0.4)} />
          </g>
        ))}
        <rect x={W * 0.02} y={H * 0.04} width={W * 0.96} height={H * 0.9} fill="none" stroke={P(p, 5)} strokeWidth={W * 0.03} />
        <path d={`M${W * 0.15} ${H * 0.9} L${W * 0.45} ${H * 0.08}`} stroke="#ffffff" strokeWidth={W * 0.06} opacity="0.06" />
        <rect x={W * 0.9} y={H * 0.4} width={W * 0.02} height={H * 0.2} rx="2" fill={mix(P(p, 4), '#ffffff', 0.5)} />
      </>
    ),
  };
}

function orchard(ctx: SceneCtx): Layers {
  const { W, H, p, r } = ctx;
  const trees: ReactNode[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 6; i += 1) {
      const x = W * (0.08 + i * 0.17) + row * 10;
      const y = H * (0.5 + row * 0.16);
      const s = 1 + row * 0.35;
      trees.push(
        <g key={`${row}-${i}`}>
          <rect x={x - 2 * s} y={y} width={4 * s} height={14 * s} fill={P(p, 5)} />
          <circle cx={x} cy={y - 4 * s} r={14 * s * (0.8 + r() * 0.3)} fill={row === 2 ? P(p, 2) : P(p, 1)} />
        </g>,
      );
    }
  }
  return { back: <rect className="art-bg" width={W} height={H} fill={P(p, 0)} />, front: <>{trees}</> };
}

const SCENES: Record<SceneSpec['scene'], (ctx: SceneCtx) => Layers> = {
  ridge: (c) => ridgeScene(c, false),
  'ridge-frost': (c) => ridgeScene(c, true),
  'group-dusk': groupDusk,
  'fabric-terrain': fabricTerrain,
  summit,
  'studio-jacket': studioJacket,
  'cabin-window': cabinWindow,
  contour,
  knit,
  thermos,
  'catalogue-1970': catalogue,
  'plum-ink': plumInk,
  bubbles,
  rooftop,
  orchard,
  'gift-wrap': giftWrap,
  'shelf-lineup': shelfLineup,
  'fruit-flatlay': fruitFlatlay,
  'perfume-glass': perfumeGlass,
  'festival-lanterns': lanterns,
  chiller,
};

export function drawScene(spec: SceneSpec, W: number, H: number, uid: string): Layers {
  return SCENES[spec.scene]({ W, H, p: spec.palette, r: rng(spec.seed ?? 1), uid, comp: spec.composition, label: spec.label });
}
