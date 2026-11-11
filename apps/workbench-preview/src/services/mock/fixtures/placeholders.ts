import { demoChineseText } from '../demoChinese';

/**
 * Bundled placeholder illustrations for seeded image assets. They are simple SVGs built at
 * runtime, so the demo needs no network access and no binary assets.
 */

type Kind = 'shelf' | 'lineup' | 'bar' | 'festival' | 'trail' | 'window' | 'room' | 'detail';

const W = 800;
const H = 500;

function cans(x0: number, y0: number, count: number, colors: string[], w = 46, h = 88, gap = 14): string {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const x = x0 + i * (w + gap);
    const c = colors[i % colors.length];
    out += `<rect x="${x}" y="${y0}" width="${w}" height="${h}" rx="7" fill="${c}"/>`;
    out += `<rect x="${x + 6}" y="${y0 + h * 0.35}" width="${w - 12}" height="${h * 0.3}" rx="3" fill="#ffffff" fill-opacity="0.55"/>`;
    out += `<rect x="${x + 4}" y="${y0 - 5}" width="${w - 8}" height="6" rx="3" fill="#9aa3ad"/>`;
  }
  return out;
}

function bottles(x0: number, y0: number, count: number, colors: string[]): string {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const x = x0 + i * 58;
    const c = colors[i % colors.length];
    out += `<rect x="${x + 14}" y="${y0}" width="14" height="34" rx="4" fill="${c}"/>`;
    out += `<rect x="${x}" y="${y0 + 30}" width="42" height="92" rx="10" fill="${c}"/>`;
    out += `<rect x="${x + 6}" y="${y0 + 66}" width="30" height="30" rx="3" fill="#ffffff" fill-opacity="0.6"/>`;
  }
  return out;
}

function scene(kind: Kind, palette: string[]): string {
  const [a, b, c, d] = palette;
  switch (kind) {
    case 'shelf':
      return `<rect width="${W}" height="${H}" fill="#dfe6ea"/>
        <rect x="40" y="40" width="720" height="400" rx="8" fill="#f3f6f8" stroke="#b9c4cc" stroke-width="4"/>
        <rect x="40" y="170" width="720" height="10" fill="#b9c4cc"/><rect x="40" y="300" width="720" height="10" fill="#b9c4cc"/>
        ${cans(70, 78, 11, [a, b, c, d])}${cans(70, 208, 11, [c, a, d, b])}${cans(70, 338, 11, [b, d, a, c])}`;
    case 'lineup':
      return `<rect width="${W}" height="${H}" fill="#ece8e2"/><rect y="360" width="${W}" height="140" fill="#d6d0c6"/>
        ${cans(110, 210, 6, [a, b, c, d, b, a], 78, 150, 26)}`;
    case 'bar':
      return `<rect width="${W}" height="${H}" fill="#2c2a33"/>
        <rect x="0" y="190" width="${W}" height="12" fill="#5c5866"/><rect x="0" y="340" width="${W}" height="12" fill="#5c5866"/>
        ${bottles(60, 60, 12, [a, b, c, d])}${bottles(60, 212, 12, [c, d, a, b])}
        <rect x="0" y="420" width="${W}" height="80" fill="#3d3a46"/>`;
    case 'festival':
      return `<rect width="${W}" height="${H}" fill="#cfe0ea"/><rect y="330" width="${W}" height="170" fill="#9bb487"/>
        <polygon points="80,330 200,190 320,330" fill="${a}"/><polygon points="300,330 430,170 560,330" fill="${b}"/>
        <polygon points="540,330 650,210 760,330" fill="${c}"/><rect x="360" y="280" width="140" height="50" fill="${d}"/>`;
    case 'trail':
      return `<rect width="${W}" height="${H}" fill="#dde6ec"/>
        <polygon points="0,380 180,170 330,320 470,140 650,330 800,220 800,500 0,500" fill="${a}"/>
        <polygon points="0,430 220,300 420,410 620,320 800,400 800,500 0,500" fill="${b}"/>
        <path d="M360 500 C 380 440, 460 430, 430 380 S 500 330, 520 300" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"/>
        <circle cx="660" cy="100" r="38" fill="${d}"/>`;
    case 'window':
      return `<rect width="${W}" height="${H}" fill="#e7e3dc"/>
        <rect x="60" y="50" width="680" height="400" fill="#f8f6f1" stroke="#8f8a80" stroke-width="10"/>
        <path d="M190 140 h80 l30 40 v170 h-140 v-170 z" fill="${a}"/><path d="M360 130 h80 l30 40 v180 h-140 v-180 z" fill="${b}"/>
        <path d="M530 150 h80 l30 40 v160 h-140 v-160 z" fill="${c}"/><rect x="60" y="410" width="680" height="40" fill="${d}"/>`;
    case 'room':
      return `<rect width="${W}" height="${H}" fill="#efe9e1"/><rect y="370" width="${W}" height="130" fill="#d9cdbd"/>
        <rect x="150" y="250" width="380" height="120" rx="24" fill="${a}"/><rect x="170" y="210" width="340" height="70" rx="20" fill="${b}"/>
        <rect x="600" y="140" width="10" height="230" fill="#6b6259"/><polygon points="565,140 645,140 625,90 585,90" fill="${c}"/>
        <rect x="560" y="60" width="160" height="110" fill="${d}" opacity="0.6"/>`;
    case 'detail':
      return `<rect width="${W}" height="${H}" fill="#f1eee9"/>
        <rect x="80" y="90" width="190" height="320" rx="10" fill="${a}"/><rect x="305" y="90" width="190" height="320" rx="10" fill="${b}"/>
        <rect x="530" y="90" width="190" height="320" rx="10" fill="${c}"/><rect x="80" y="430" width="640" height="10" fill="${d}"/>`;
  }
}

export function placeholderImage(kind: Kind, palette: string[], caption: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    ${scene(kind, palette)}
    <rect x="0" y="${H - 34}" width="${W}" height="34" fill="#000000" fill-opacity="0.55"/>
    <text x="16" y="${H - 12}" font-family="system-ui, sans-serif" font-size="15" fill="#ffffff">占位插画 · ${demoChineseText(caption)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' '))}`;
}
