/**
 * Draws an ArtSpec as SVG: scenes, posters with integrated type, cans and gift sleeves, and
 * placement mockups. Everything here is generated demo artwork.
 */
import { useId, type ReactNode } from 'react';
import type { ArtSpec, CanDesign, MockupSpec, PackSpec, PosterFormat, PosterSpec, SceneSpec } from '../../domain/proposal';
import { mix, rng, wrap } from './geometry';
import { drawScene } from './scenes';

const SERIF = "'Newsreader', 'Iowan Old Style', Georgia, serif";
const SANS = "'Instrument Sans', 'IBM Plex Sans', system-ui, sans-serif";

export function artBox(spec: ArtSpec): [number, number] {
  switch (spec.kind) {
    case 'scene':
      return [400, 300];
    case 'poster':
      return posterBox(spec.format);
    case 'pack':
      return spec.format === 'can' ? [200, 320] : [420, 300];
    case 'mockup':
      return MOCKUP_BOX[spec.surface];
  }
}

/** Standard print ratios, 300 units wide (or high, for landscape formats). */
export function posterBox(format: PosterFormat = '3:4'): [number, number] {
  const [a, b] = format.split(':').map(Number);
  return a < b ? [300, Math.round((300 * b) / a)] : [Math.round((300 * a) / b), 300];
}

const MOCKUP_BOX: Record<MockupSpec['surface'], [number, number]> = {
  'bus-shelter': [400, 300],
  elevator: [300, 400],
  phone: [240, 440],
  'store-window': [400, 300],
  billboard: [400, 240],
  shelf: [400, 300],
  'gift-table': [400, 300],
  hand: [300, 400],
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

function SceneArt({ spec, W, H, uid }: { spec: SceneSpec; W: number; H: number; uid: string }) {
  const layers = drawScene(spec, W, H, uid);
  return (
    <g className="art-scene">
      {layers.defs && <defs>{layers.defs}</defs>}
      {spec.sketch && <rect width={W} height={H} fill="#f7f4ec" className="art-paper" />}
      {layers.back}
      {layers.front}
      {spec.sketch && (
        <g className="art-guides" stroke="#c45a3c" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.6" fill="none">
          <path d={`M${W / 3} 0 V${H} M${(W * 2) / 3} 0 V${H} M0 ${H / 3} H${W} M0 ${(H * 2) / 3} H${W}`} />
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Poster: type placed in and around the artwork
// ---------------------------------------------------------------------------

function horizonOf(spec: SceneSpec) {
  return spec.composition === 'low-horizon' ? 0.64 : spec.composition === 'high-horizon' ? 0.36 : spec.composition === 'wide' ? 0.58 : 0.54;
}

function PosterArt({ spec, uid, W = posterBox(spec.format)[0], H = posterBox(spec.format)[1] }: { spec: PosterSpec; uid: string; W?: number; H?: number }) {
  const layers = drawScene(spec.scene, W, H, uid);
  const family = spec.typeface === 'serif' ? SERIF : SANS;
  const weight = spec.typeface === 'serif' ? 500 : 700;
  let type: ReactNode = null;
  let behind: ReactNode = null;
  // A soft halo behind the wordmark keeps it legible over paths and contour lines.
  const brand = (color: string, y = H - 22) => {
    const light = /^#(?:f|e|d)/i.test(color);
    const halo = light ? 'rgb(20 24 21 / 0.55)' : 'rgb(255 255 255 / 0.7)';
    return (
    <g stroke={halo} strokeWidth="3" strokeLinejoin="round" paintOrder="stroke">
      <path d={`M22 ${y} l6 -10 l6 10 Z`} fill={color} />
      <text x="40" y={y} fill={color} fontFamily={SANS} fontSize="11" fontWeight="700" letterSpacing="2.6">
        {spec.brand.toUpperCase()}
      </text>
    </g>
    );
  };
  if (spec.typeLayout === 'behind-ridge') {
    const lines = wrap(spec.headline, 12);
    const hz = horizonOf(spec.scene);
    const size = 40;
    // The headline's foot dips behind the far ridge, but stays above where the figure stands.
    const bottom = H * hz - 20;
    behind = (
      <text x={W / 2} textAnchor="middle" fill={spec.ink} fontFamily={family} fontWeight={weight} fontSize={size} letterSpacing="-0.5">
        {lines.map((l, i) => (
          <tspan key={i} x={W / 2} y={bottom - (lines.length - 1 - i) * size * 1.02}>
            {l}
          </tspan>
        ))}
      </text>
    );
    type = (
      <>
        {spec.subline && (
          <text x={W / 2} y={bottom - lines.length * size * 1.02 - 4} textAnchor="middle" fill={spec.ink} fontFamily={SANS} fontSize="10" letterSpacing="1.2" opacity="0.8">
            {spec.subline.toUpperCase()}
          </text>
        )}
        {brand('#ffffff')}
      </>
    );
  } else if (spec.typeLayout === 'bottom-band') {
    const lines = wrap(spec.headline, 18);
    type = (
      <>
        <rect x="0" y={H - 96} width={W} height="96" fill="#14181a" opacity="0.82" />
        <text fill={spec.ink} fontFamily={family} fontWeight={weight} fontSize="26">
          {lines.map((l, i) => (
            <tspan key={i} x="22" y={H - 62 + i * 27}>
              {l}
            </tspan>
          ))}
        </text>
        <text x={W - 22} y={H - 14} textAnchor="end" fill={spec.ink} fontFamily={SANS} fontSize="9" fontWeight="700" letterSpacing="2.4">
          {spec.brand.toUpperCase()}
        </text>
      </>
    );
  } else if (spec.typeLayout === 'stacked-left' || spec.typeLayout === 'vertical') {
    const lines = wrap(spec.headline, 11);
    const size = 30;
    type = (
      <>
        <text fill={spec.ink} fontFamily={family} fontWeight={weight} fontSize={size} letterSpacing="-0.8">
          {lines.map((l, i) => (
            <tspan key={i} x="22" y={56 + i * size * 1.02}>
              {l}
            </tspan>
          ))}
        </text>
        {spec.subline && (
          // Kept to a short column at the left, clear of the figure in the middle of the scene.
          <text fill={spec.ink} fontFamily={SANS} fontSize="10.5" fontWeight="500">
            {wrap(spec.subline, 26).map((l, i) => (
              <tspan key={i} x="22" y={56 + lines.length * size + 6 + i * 13}>
                {l}
              </tspan>
            ))}
          </text>
        )}
        {brand(spec.ink)}
      </>
    );
  } else {
    const lines = wrap(spec.headline, 13);
    const size = 34;
    type = (
      <>
        <text fill={spec.ink} fontFamily={family} fontWeight={weight} fontSize={size} letterSpacing="-0.6">
          {lines.map((l, i) => (
            <tspan key={i} x="22" y={62 + i * size * 1.04}>
              {l}
            </tspan>
          ))}
        </text>
        {spec.subline && (
          <text x="22" y={62 + lines.length * size + 4} fill={spec.ink} fontFamily={SANS} fontSize="10.5" opacity="0.85">
            {spec.subline}
          </text>
        )}
        {brand(spec.ink)}
      </>
    );
  }
  return (
    <g className="art-scene">
      {layers.defs && <defs>{layers.defs}</defs>}
      {layers.back}
      {behind}
      {layers.front}
      {type}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Packaging
// ---------------------------------------------------------------------------

const ROOF_PALETTE = (d: CanDesign) => [d.base, '#f3b49c', '#eab0b4', '#c7848f', '#fff1c4', '#3a2433'];

/** The label artwork for a design, drawn in a `w` × `h` box. `offset` shifts it for turned views. */
function Label({ d, w, h, uid, offset = 0 }: { d: CanDesign; w: number; h: number; uid: string; offset?: number }) {
  const r = rng(7);
  void r;
  let art: ReactNode;
  if (d.pattern === 'panorama') {
    const full = drawScene({ kind: 'scene', scene: 'rooftop', palette: ROOF_PALETTE(d), seed: 2, composition: 'wide' }, w * 4, h, `${uid}p`);
    art = (
      <g transform={`translate(${-(d.panel ?? 0) * w + offset} 0)`}>
        {full.defs && <defs>{full.defs}</defs>}
        {full.back}
        {full.front}
      </g>
    );
  } else if (d.pattern === 'plum-ink') {
    const sc = drawScene({ kind: 'scene', scene: 'plum-ink', palette: [d.base, '#f2b8c6', d.accent, d.ink, d.accent, d.ink], seed: 4, composition: 'wide', label: 'noseal' }, w * 1.5, h * 0.62, `${uid}i`);
    art = (
      <g transform={`translate(${offset - w * 0.25} ${h * 0.4})`}>
        <rect x={-w} y={-h} width={w * 4} height={h * 3} fill={d.base} />
        {sc.defs && <defs>{sc.defs}</defs>}
        {sc.front}
      </g>
    );
  } else if (d.pattern === 'bubbles') {
    const sc = drawScene({ kind: 'scene', scene: 'bubbles', palette: [d.base, mix(d.base, d.accent, 0.3), mix(d.base, d.accent, 0.6), d.accent, '#ffffff', d.ink], seed: 3 }, w * 1.5, h, `${uid}b`);
    art = (
      <g transform={`translate(${offset - w * 0.25} 0)`}>
        {sc.defs && <defs>{sc.defs}</defs>}
        {sc.back}
        {sc.front}
      </g>
    );
  } else {
    art = <rect x={-w} y={-h} width={w * 4} height={h * 3} fill={d.base} />;
  }
  const panorama = d.pattern === 'panorama';
  const serif = d.pattern === 'plum-ink' || panorama;
  return (
    <g>
      <rect width={w} height={h} fill={d.base} />
      {art}
      {panorama && <rect x="0" y="0" width={w} height={h * 0.22} fill="#f6eddc" opacity="0.94" />}
      <text x={w / 2 + offset * 0.4} y={panorama ? h * 0.14 : d.pattern === 'plum-ink' ? h * 0.2 : h * 0.4} textAnchor="middle" fill={panorama ? d.ink : d.pattern === 'bubbles' ? d.ink : d.ink} fontFamily={serif ? SERIF : SANS} fontWeight={serif ? 600 : 700} fontSize={Math.min(w * (serif ? 0.2 : 0.19), h * 0.16)} letterSpacing={serif ? 0 : -0.5}>
        {d.wordmark}
      </text>
      <text x={w / 2 + offset * 0.4} y={panorama ? h * 0.195 : (d.pattern === 'plum-ink' ? h * 0.2 : h * 0.4) + Math.min(w * 0.12, h * 0.1)} textAnchor="middle" fill={d.ink} fontFamily={SANS} fontSize={Math.min(w * 0.065, h * 0.05)} fontWeight="600" letterSpacing="1.4" opacity="0.85">
        {d.flavour.toUpperCase()}
      </text>
      {d.pattern !== 'plain' && (
        <g transform={`translate(${w * 0.72 + offset * 0.4} ${h * 0.86})`}>
          <rect width={w * 0.13} height={w * 0.13} rx="2" fill={d.accent} />
          <path d={`M${w * 0.03} ${w * 0.04} h${w * 0.07} M${w * 0.03} ${w * 0.075} h${w * 0.07} M${w * 0.065} ${w * 0.03} v${w * 0.07}`} stroke={d.base} strokeWidth="1.2" />
        </g>
      )}
    </g>
  );
}

function CanBack({ d, w, h }: { d: CanDesign; w: number; h: number }) {
  const lines = [0.2, 0.26, 0.32, 0.38, 0.44];
  return (
    <g>
      <rect width={w} height={h} fill={d.pattern === 'bubbles' ? d.base : mix(d.base, '#ffffff', 0.15)} />
      <text x={w * 0.12} y={h * 0.12} fill={d.ink} fontFamily={SERIF} fontSize={w * 0.12} fontWeight="600">
        {d.wordmark}
      </text>
      {lines.map((y, i) => (
        <rect key={i} x={w * 0.12} y={h * y} width={w * (i % 2 ? 0.6 : 0.76)} height={h * 0.018} fill={d.ink} opacity="0.35" />
      ))}
      <rect x={w * 0.1} y={h * 0.55} width={w * 0.8} height={h * 0.16} fill="none" stroke={d.ink} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.7" />
      <text x={w / 2} y={h * 0.615} textAnchor="middle" fill={d.ink} fontFamily={SANS} fontSize={w * 0.055} fontWeight="600">
        Strength, size, legal text
      </text>
      <text x={w / 2} y={h * 0.67} textAnchor="middle" fill={d.ink} fontFamily={SANS} fontSize={w * 0.05}>
        pending client confirmation
      </text>
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} x={w * 0.2 + i * w * 0.035} y={h * 0.78} width={i % 3 ? w * 0.012 : w * 0.022} height={h * 0.09} fill={d.ink} />
      ))}
    </g>
  );
}

function Can({ d, view, uid, x = 0, y = 0, scale = 1 }: { d: CanDesign; view: PackSpec['view']; uid: string; x?: number; y?: number; scale?: number }) {
  const w = 120;
  const top = 36;
  const bottom = 292;
  const lx = 40;
  const labelTop = 50;
  const labelH = 232;
  const hl = view === 'three-quarter' ? 0.28 : 0.42;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <rect x={lx} y={labelTop} width={w} height={labelH} />
        </clipPath>
        <linearGradient id={`${uid}-shade`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.38" />
          <stop offset={hl - 0.2} stopColor="#000" stopOpacity="0" />
          <stop offset={hl} stopColor="#fff" stopOpacity="0.28" />
          <stop offset={hl + 0.12} stopColor="#fff" stopOpacity="0" />
          <stop offset="0.85" stopColor="#000" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000" stopOpacity="0.42" />
        </linearGradient>
        <linearGradient id={`${uid}-metal`} x1="0" x2="1">
          <stop offset="0" stopColor="#9aa0a6" />
          <stop offset="0.45" stopColor="#eef0f2" />
          <stop offset="1" stopColor="#8c9298" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy={bottom + 14} rx="66" ry="8" fill="#000" opacity="0.14" />
      <path d={`M${lx} ${top} L${lx} ${bottom} Q100 ${bottom + 18} ${lx + w} ${bottom} L${lx + w} ${top} Z`} fill={`url(#${uid}-metal)`} />
      <g clipPath={`url(#${uid}-clip)`}>
        <g transform={`translate(${lx} ${labelTop})`}>{view === 'back' ? <CanBack d={d} w={w} h={labelH} /> : <Label d={d} w={w} h={labelH} uid={uid} offset={view === 'three-quarter' ? -26 : 0} />}</g>
      </g>
      <rect x={lx} y={top} width={w} height={bottom - top + 8} fill={`url(#${uid}-shade)`} />
      <ellipse cx="100" cy={top} rx="60" ry="10" fill={`url(#${uid}-metal)`} />
      <ellipse cx="100" cy={top + 1} rx="50" ry="7" fill="#b7bcc1" />
      <rect x="88" y={top - 4} width="24" height="7" rx="3.5" fill="#d4d8dc" stroke="#9aa0a6" strokeWidth="0.8" />
    </g>
  );
}

function Sleeve({ d, uid }: { d: CanDesign; uid: string }) {
  const W = 420;
  const fx = 40;
  const fy = 96;
  const fw = 340;
  const fh = 176;
  let face: ReactNode;
  if (d.pattern === 'panorama') {
    const sc = drawScene({ kind: 'scene', scene: 'rooftop', palette: ROOF_PALETTE(d), seed: 2, composition: 'wide' }, fw, fh, `${uid}s`);
    face = (
      <>
        {sc.defs && <defs>{sc.defs}</defs>}
        {sc.back}
        {sc.front}
        {[1, 2, 3].map((i) => (
          <path key={i} d={`M${(fw / 4) * i} 0 V${fh}`} stroke="#ffffff" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
        ))}
      </>
    );
  } else {
    face = (
      <g transform="translate(0 0)">
        <Label d={d} w={fw} h={fh} uid={`${uid}l`} />
      </g>
    );
  }
  return (
    <g>
      <defs>
        <clipPath id={`${uid}-face`}>
          <rect width={fw} height={fh} />
        </clipPath>
      </defs>
      <ellipse cx={W / 2} cy={fy + fh + 14} rx="190" ry="10" fill="#000" opacity="0.14" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={fx + 22 + i * 82} y={fy - 34} width="64" height="40" fill="#c9ced3" />
          <ellipse cx={fx + 54 + i * 82} cy={fy - 34} rx="32" ry="6" fill="#e3e6e9" stroke="#9aa0a6" strokeWidth="0.8" />
        </g>
      ))}
      <path d={`M${fx} ${fy} L${fx + 16} ${fy - 14} L${fx + fw + 16} ${fy - 14} L${fx + fw} ${fy} Z`} fill={mix(d.base, '#000000', 0.12)} />
      <path d={`M${fx + fw} ${fy} L${fx + fw + 16} ${fy - 14} L${fx + fw + 16} ${fy + fh - 14} L${fx + fw} ${fy + fh} Z`} fill={mix(d.base, '#000000', 0.25)} />
      <g transform={`translate(${fx} ${fy})`}>
        <g clipPath={`url(#${uid}-face)`}>{face}</g>
        {d.pattern === 'panorama' && (
          <>
            <rect x="0" y="0" width={fw} height="34" fill="#f6eddc" opacity="0.95" />
            <text x="16" y="23" fill={d.ink} fontFamily={SERIF} fontSize="20" fontWeight="600">
              {d.wordmark}
            </text>
            <text x={fw - 16} y="22" textAnchor="end" fill={d.ink} fontFamily={SANS} fontSize="9" fontWeight="700" letterSpacing="1.5">
              四罐 · 一幅画
            </text>
          </>
        )}
      </g>
      {d.pattern === 'panorama' && (
        <g transform={`translate(${W / 2} ${fy - 6})`}>
          <path d="M-6 0 q-26 -30 -6 -34 q10 4 8 30 Z" fill={d.accent} />
          <path d="M6 0 q26 -30 6 -34 q-10 4 -8 30 Z" fill={d.accent} />
          <ellipse rx="10" ry="7" fill={mix(d.accent, '#000000', 0.2)} />
        </g>
      )}
    </g>
  );
}

function PackArt({ spec, uid }: { spec: PackSpec; uid: string }) {
  if (spec.format === 'can') return <Can d={spec.design} view={spec.view} uid={uid} />;
  return <Sleeve d={spec.design} uid={uid} />;
}

// ---------------------------------------------------------------------------
// Mockups
// ---------------------------------------------------------------------------

function Nested({ spec, x, y, w, h, uid, fit = 'slice' }: { spec: MockupSpec['inner']; x: number; y: number; w: number; h: number; uid: string; fit?: 'slice' | 'meet' }) {
  // A poster re-flows to the frame's proportions instead of being cropped.
  if (spec.kind === 'poster') {
    const PH = Math.round((300 * h) / w);
    return (
      <svg x={x} y={y} width={w} height={h} viewBox={`0 0 300 ${PH}`} preserveAspectRatio="xMidYMid slice">
        <PosterArt spec={spec} uid={uid} W={300} H={PH} />
      </svg>
    );
  }
  const [vw, vh] = artBox(spec);
  return (
    <svg x={x} y={y} width={w} height={h} viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio={`xMidYMid ${fit}`}>
      <Inner spec={spec} uid={uid} />
    </svg>
  );
}

function MockupArt({ spec, uid }: { spec: MockupSpec; uid: string }) {
  const [W, H] = MOCKUP_BOX[spec.surface];
  const inner = spec.inner;
  switch (spec.surface) {
    case 'bus-shelter':
      return (
        <g>
          <defs>
            <linearGradient id={`${uid}-st`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2b3a55" />
              <stop offset="1" stopColor="#4d5a6e" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill={`url(#${uid}-st)`} />
          <rect x="0" y="80" width="120" height="170" fill="#232c3d" />
          <rect x="300" y="60" width="100" height="190" fill="#1e2636" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={14 + i * 26} y="100" width="12" height="16" fill="#f2c46a" opacity="0.7" />
          ))}
          <rect x="0" y="250" width={W} height="50" fill="#3b3f46" />
          <rect x="0" y="248" width={W} height="4" fill="#5b6068" />
          <rect x="150" y="44" width="230" height="10" fill="#7d858f" />
          <rect x="156" y="54" width="5" height="196" fill="#8b939c" />
          <rect x="374" y="54" width="5" height="196" fill="#8b939c" />
          <rect x="166" y="60" width="96" height="186" fill="#9fb4c8" opacity="0.18" />
          <rect x="266" y="58" width="104" height="168" fill="#f6efe0" opacity="0.25" />
          <Nested spec={inner} x={270} y={62} w={96} h={160} uid={`${uid}i`} />
          <rect x="266" y="58" width="104" height="168" fill="none" stroke="#5c636b" strokeWidth="4" />
          <rect x="176" y="214" width="80" height="6" fill="#6c737b" />
          <g transform="translate(118 252)" fill="#14181f">
            <circle cx="0" cy="-58" r="6" />
            <path d="M-8 -50 L8 -50 L10 -20 L-10 -20 Z" />
            <path d="M-5 -20 L-6 0 M5 -20 L6 0" stroke="#14181f" strokeWidth="4" />
          </g>
        </g>
      );
    case 'elevator':
      return (
        <g>
          <defs>
            <linearGradient id={`${uid}-steel`} x1="0" x2="1">
              <stop offset="0" stopColor="#a7adb3" />
              <stop offset="0.5" stopColor="#d9dde1" />
              <stop offset="1" stopColor="#9ba1a7" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill={`url(#${uid}-steel)`} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${i * 60} 0 V${H}`} stroke="#8d939a" strokeWidth="0.8" opacity="0.6" />
          ))}
          <rect x="0" y="352" width={W} height="48" fill="#3e4247" />
          <rect x="60" y="48" width="180" height="272" rx="6" fill="#16191c" />
          <Nested spec={inner} x={68} y={56} w={164} h={256} uid={`${uid}i`} />
          <rect x="250" y="160" width="26" height="70" rx="4" fill="#7f868d" />
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx="263" cy={172 + i * 15} r="4" fill="#e5e8eb" />
          ))}
          <rect x="0" y="330" width={W} height="6" fill="#c3c8cd" />
        </g>
      );
    case 'phone':
      return (
        <g>
          <rect x="6" y="6" width="228" height="428" rx="34" fill="#15171a" />
          <rect x="16" y="16" width="208" height="408" rx="26" fill="#000" />
          <Nested spec={inner} x={16} y={16} w={208} h={408} uid={`${uid}i`} />
          <rect x="16" y="16" width="208" height="408" rx="26" fill="none" stroke="#000" strokeWidth="2" />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={28 + i * 63} y="30" width="58" height="2.5" rx="1.25" fill="#ffffff" opacity={i === 0 ? 1 : 0.45} />
          ))}
          <circle cx="40" cy="50" r="9" fill="#ffffff" opacity="0.9" />
          <rect x="54" y="45" width="52" height="5" rx="2.5" fill="#ffffff" opacity="0.85" />
          <rect x="54" y="53" width="30" height="4" rx="2" fill="#ffffff" opacity="0.6" />
          <rect x="30" y="392" width="150" height="22" rx="11" fill="none" stroke="#ffffff" strokeWidth="1.4" opacity="0.8" />
          <rect x="94" y="22" width="52" height="12" rx="6" fill="#000" />
        </g>
      );
    case 'store-window':
      return (
        <g>
          <rect width={W} height={H} fill="#d9d1c2" />
          <rect x="0" y="0" width={W} height="40" fill="#1f2a24" />
          <text x={W / 2} y="26" textAnchor="middle" fill="#f4efe4" fontFamily={SANS} fontSize="14" fontWeight="700" letterSpacing="4">
            品牌展示
          </text>
          <rect x="30" y="58" width="340" height="196" fill="#2c3a3f" />
          <rect x="34" y="62" width="332" height="188" fill="#f1e9da" opacity="0.92" />
          <rect x="34" y="226" width="332" height="24" fill="#c8bba5" />
          <Nested spec={inner} x={196} y={72} w={108} h={150} uid={`${uid}i`} />
          <g fill="#56604f" opacity="0.9">
            <circle cx="110" cy="102" r="10" />
            <path d="M92 116 L128 116 L134 200 L86 200 Z" />
            <rect x="96" y="200" width="7" height="28" />
            <rect x="117" y="200" width="7" height="28" />
          </g>
          <path d="M60 62 L130 250 M300 62 L360 220" stroke="#ffffff" strokeWidth="18" opacity="0.08" />
          <rect x="30" y="58" width="340" height="196" fill="none" stroke="#1f2a24" strokeWidth="6" />
          <rect x="0" y="262" width={W} height="38" fill="#a59f94" />
        </g>
      );
    case 'billboard':
      return (
        <g>
          <rect width={W} height={H} fill="#c9d8e3" />
          <rect x="0" y="200" width={W} height="40" fill="#7d8f6a" />
          <rect x="120" y="150" width="8" height="70" fill="#59606a" />
          <rect x="272" y="150" width="8" height="70" fill="#59606a" />
          <rect x="56" y="24" width="288" height="130" fill="#1d241e" />
          <Nested spec={inner} x={60} y={28} w={280} h={122} uid={`${uid}i`} />
        </g>
      );
    case 'shelf': {
      const r = rng(5);
      const comp = ['#3a1838', '#5b2148', '#6d2a4f', '#8c2f43'];
      const cans = (y: number, withHero: boolean) =>
        Array.from({ length: 7 }, (_, i) => {
          const x = 20 + i * 52;
          if (withHero && i >= 2 && i <= 4) return <g key={i}><Can d={(inner as PackSpec).design} view="front" uid={`${uid}h${i}`} x={x - 10} y={y - 86} scale={0.33} /></g>;
          return (
            <g key={i}>
              <rect x={x + 4} y={y - 74} width="36" height="74" rx="4" fill={comp[i % comp.length]} />
              <circle cx={x + 22} cy={y - 38} r="10" fill="#c0476a" opacity={0.5 + r() * 0.3} />
            </g>
          );
        });
      return (
        <g>
          <rect width={W} height={H} fill="#1d1520" />
          {[96, 196, 292].map((y, i) => (
            <g key={y}>
              {cans(y, i === 1 && inner.kind === 'pack')}
              <rect x="10" y={y} width="380" height="6" fill="#d9c3d3" opacity="0.55" />
            </g>
          ))}
          <rect x="4" y="4" width="392" height="292" fill="none" stroke="#0e0a10" strokeWidth="10" />
          <path d="M60 296 L170 4" stroke="#ffffff" strokeWidth="26" opacity="0.05" />
        </g>
      );
    }
    case 'gift-table':
      return (
        <g>
          <rect width={W} height={H} fill="#efe6da" />
          <rect x="0" y="190" width={W} height="110" fill="#c99a6b" />
          <rect x="0" y="190" width={W} height="6" fill="#b38657" />
          <Nested spec={inner} x={60} y={70} w={280} h={200} uid={`${uid}i`} fit="meet" />
          <g transform="translate(340 214)">
            <rect x="-12" y="-28" width="24" height="30" rx="4" fill="#f6eddc" />
            <path d="M0 -28 q-10 -26 4 -40 M0 -28 q12 -20 10 -36" stroke="#5a7a5a" strokeWidth="3" fill="none" />
          </g>
          <g transform="translate(46 236)">
            <ellipse rx="16" ry="5" fill="#f6eddc" />
            <rect x="-12" y="-14" width="24" height="14" fill="#f6eddc" />
          </g>
        </g>
      );
    case 'hand':
      return (
        <g>
          <rect width={W} height={H} fill="#f3e3e7" />
          <Nested spec={inner} x={60} y={30} w={180} h={290} uid={`${uid}i`} fit="meet" />
          <path d="M70 250 q-30 40 -10 150 l160 0 q10 -70 -20 -140 Z" fill="#e3b394" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={92 + i * 2} y={212 + i * 26} width="128" height="24" rx="12" fill="#e9bc9f" stroke="#d29f80" strokeWidth="1" />
          ))}
          <path d="M80 236 q-20 -30 10 -40 q18 0 22 30" fill="#e3b394" stroke="#d29f80" strokeWidth="1" />
        </g>
      );
  }
}

// ---------------------------------------------------------------------------

function Inner({ spec, uid }: { spec: ArtSpec; uid: string }) {
  switch (spec.kind) {
    case 'scene': {
      const [w, h] = artBox(spec);
      return <SceneArt spec={spec} W={w} H={h} uid={uid} />;
    }
    case 'poster':
      return <PosterArt spec={spec} uid={uid} />;
    case 'pack':
      return <PackArt spec={spec} uid={uid} />;
    case 'mockup':
      return <MockupArt spec={spec} uid={uid} />;
  }
}

/**
 * Generated artwork. Decorative by default; pass `title` when the image carries meaning on its
 * own (the caption next to it usually does that job).
 */
export function Art({ spec, title, className = '', fit = 'meet', ratio, round }: { spec: ArtSpec; title?: string; className?: string; fit?: 'meet' | 'slice'; ratio?: [number, number]; round?: number }) {
  const uid = useId().replace(/[:«»]/g, '');
  const [w, h] = artBox(spec);
  // Rounded corners on the object itself, for pieces shown whole on a mat.
  const clip = round && !ratio ? `${uid}-round` : null;
  const sketch = spec.kind === 'scene' && spec.sketch;
  // Posters and packs are whole objects: letterbox them to the ratio instead of cropping.
  const whole = spec.kind === 'poster' || spec.kind === 'pack';
  const vb = ratio ? (whole ? expandBox(w, h, ratio) : fitBox(w, h, ratio)) : `0 0 ${w} ${h}`;
  return (
    <svg
      className={`art art--${spec.kind}${sketch ? ' art--sketch' : ''} ${className}`}
      viewBox={vb}
      preserveAspectRatio={`xMidYMid ${fit}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {clip ? (
        <>
          <clipPath id={clip}>
            <rect width={w} height={h} rx={round} />
          </clipPath>
          <g clipPath={`url(#${clip})`}>
            <Inner spec={spec} uid={uid} />
          </g>
        </>
      ) : (
        <Inner spec={spec} uid={uid} />
      )}
    </svg>
  );
}

/** A viewBox of the given ratio that contains the whole artwork, centred, with space around it. */
function expandBox(w: number, h: number, [rw, rh]: [number, number]) {
  const target = rw / rh;
  if (w / h > target) {
    const nh = w / target;
    return `0 ${-(nh - h) / 2} ${w} ${nh}`;
  }
  const nw = h * target;
  return `${-(nw - w) / 2} 0 ${nw} ${h}`;
}

/** A viewBox of the given ratio, centred on the artwork (for consistent card crops). */
function fitBox(w: number, h: number, [rw, rh]: [number, number]) {
  const target = rw / rh;
  if (w / h > target) {
    const nw = h * target;
    return `${(w - nw) / 2} 0 ${nw} ${h}`;
  }
  const nh = w / target;
  return `0 ${(h - nh) / 2} ${w} ${nh}`;
}
