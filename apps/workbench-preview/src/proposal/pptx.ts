/**
 * Editable PowerPoint export, built in the browser with PptxGenJS.
 *
 * Editing boundary: headlines, copy, captions, colour fields, rules and charts are native
 * PowerPoint objects; generated artwork and mockups are placed as images that can be replaced.
 * Process records (scores, reviews, agent tasks) are never put in the client deck.
 */
import { rasterize as renderArt } from './artwork';
import type { ArtSpec, Direction, LayoutStyle, Proposal, Slide } from '../domain/proposal';
import { cobaltPage, directionArts, fraction } from './Slide';

const W = 13.333;
const H = 7.5;
const hex = (c: string) => c.replace('#', '').toUpperCase();

/**
 * Draws an artwork to a PNG data URL at the given pixel width. `radii` (top-left, top-right,
 * bottom-right, bottom-left, as fractions of the width) rounds the corners with transparency, for
 * styles that frame images in rounded shapes; the picture stays one replaceable image.
 */
/** The mat colour behind whole pieces: the slide's ink at 7% over its paper, as on screen. */
let MAT = '#ece8df';
const rasterize = (spec: ArtSpec, ratio: [number, number], px = 1600, radii?: [number, number, number, number]) => renderArt(spec, ratio, px, radii, MAT);
function mix(a: string, b: string, t: number) {
  const n = (c: string) => [1, 3, 5].map((i) => parseInt(c.replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}



type Pptx = InstanceType<(typeof import('pptxgenjs'))['default']>;
type PSlide = ReturnType<Pptx['addSlide']>;

interface Ctx {
  arts: Partial<Record<string, ArtSpec>>;
  style: LayoutStyle;
  dirs: Direction[];
  font: string;
  total: number;
  client: string;
  title: string;
}

function box(slide: PSlide, text: string, x: number, y: number, w: number, h: number, opts: Record<string, unknown>) {
  slide.addText(text, { x, y, w, h, margin: 0, valign: 'top', fit: 'shrink', ...opts });
}

async function addArt(slide: PSlide, s: Slide, x: number, y: number, w: number, h: number) {
  if (!s.art) return;
  const data = await rasterize(s.art, [Math.round(w * 100), Math.round(h * 100)]);
  slide.addImage({ data, x, y, w, h, altText: s.lead });
}

async function buildSlide(pptx: Pptx, s: Slide, i: number, c: Ctx) {
  if (c.style.id === 'cobalt') return buildCobalt(pptx, s, i, c);
  if (c.style.id === 'editorial') return buildEditorial(pptx, s, i, c);
  if (c.style.id === 'studio') return buildStudio(pptx, s, i, c);
  const { style } = c;
  const pal = style.palette;
  const dir = c.dirs.find((d) => d.id === s.directionId);
  const slide = pptx.addSlide();
  const poster = style.id === 'poster';
  const gallery = style.id === 'gallery';
  const field = poster && (s.kind === 'theme' || s.kind === 'cover') && dir ? dir.color : pal.paper;
  slide.background = { color: hex(field) };
  const ink = hex(pal.ink);
  const accent = hex(pal.accent);
  const muted = hex(pal.muted);
  const serif = c.font;
  const sans = 'Arial';
  if (s.notes) slide.addNotes(s.notes);
  slide.addText(`${String(i + 1).padStart(2, '0')} / ${String(c.total).padStart(2, '0')}`, { x: W - 1.6, y: H - 0.5, w: 1.2, h: 0.3, fontFace: sans, fontSize: 9, color: muted, align: 'right', margin: 0 });

  const flip = i % 2 === 1 && style.id === 'editorial';
  const textX = flip ? 8.9 : 0.7;
  const artX = flip ? 0.6 : 4.9;
  const dirTag = dir ? `${dir.id} · ${dir.name}`.toUpperCase() : '';

  switch (s.kind) {
    case 'cover': {
      if (gallery) {
        await addArt(slide, s, 4.2, 0.9, 4.9, 4.35);
        box(slide, s.lead, 0.7, 5.6, 9, 0.9, { fontFace: serif, fontSize: 30, color: ink });
        box(slide, s.support, 0.7, 6.45, 9, 0.4, { fontFace: sans, fontSize: 12, color: muted });
      } else {
        await addArt(slide, s, poster ? 6.2 : 5.6, 0, poster ? 7.13 : 7.73, H);
        box(slide, c.client.toUpperCase(), 0.7, 0.7, 4.6, 0.3, { fontFace: sans, fontSize: 10, color: poster ? hex('#ffffff') : muted, charSpacing: 2 });
        box(slide, s.lead, 0.7, 2.2, poster ? 5.2 : 4.6, 2.8, { fontFace: poster ? sans : serif, bold: poster, fontSize: poster ? 50 : 44, color: poster ? hex('#ffffff') : ink });
        box(slide, s.support, 0.7, 5.6, 4.6, 0.8, { fontFace: sans, fontSize: 13, color: poster ? hex('#ffffff') : muted });
      }
      break;
    }
    case 'question':
    case 'conclusion':
    case 'closing': {
      box(slide, s.support.toUpperCase(), 1.2, 1.2, 10, 0.3, { fontFace: sans, fontSize: 10, color: accent, charSpacing: 2 });
      box(slide, s.lead, 1.2, 2.0, poster ? 11 : 9.6, 3.6, { fontFace: poster ? sans : serif, bold: poster, fontSize: poster ? 44 : 38, color: ink });
      if (s.kind === 'conclusion') slide.addShape(pptx.ShapeType.rect, { x: 1.2, y: 5.9, w: 1.4, h: 0.06, fill: { color: accent }, line: { color: accent } });
      break;
    }
    case 'data': {
      box(slide, s.bigNumber ?? s.lead, 0.8, 1.4, 6, 3, { fontFace: sans, bold: true, fontSize: poster ? 140 : 120, color: poster ? accent : ink });
      box(slide, s.support, 7.2, 1.8, 5.4, 1.6, { fontFace: style.typeface === 'serif' ? serif : sans, fontSize: 22, color: ink });
      if (s.chart) {
        slide.addChart(pptx.ChartType.bar, [{ name: s.chart.measure, labels: s.chart.data.map((d) => d.label), values: s.chart.data.map((d) => d.value) }], {
          x: 7.2,
          y: 3.6,
          w: 5.4,
          h: 2.8,
          barDir: 'bar',
          chartColors: [accent],
          catAxisLabelColor: ink,
          valAxisHidden: true,
          valGridLine: { style: 'none' },
          showValue: true,
          dataLabelColor: ink,
        });
      }
      if (s.notes) box(slide, s.notes, 0.8, 6.5, 6, 0.4, { fontFace: sans, fontSize: 9, color: muted });
      break;
    }
    case 'theme': {
      const color = poster ? hex('#ffffff') : ink;
      if (!poster && dir) slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: H, fill: { color: hex(dir.color) }, line: { color: hex(dir.color) } });
      box(slide, dirTag, 1.2, 1.3, 10, 0.3, { fontFace: sans, fontSize: 11, bold: true, color: poster ? color : hex(dir?.color ?? pal.accent), charSpacing: 2 });
      box(slide, s.lead, 1.2, 2.0, 11, 3.2, { fontFace: poster ? sans : serif, bold: poster, fontSize: poster ? 66 : 60, color });
      box(slide, s.support, 1.2, 5.6, 9, 0.8, { fontFace: sans, fontSize: 14, color: poster ? color : muted });
      break;
    }
    case 'visual':
    case 'mockup': {
      if (gallery) {
        await addArt(slide, s, 2.2, 0.7, 8.9, 5.4);
        box(slide, `${dirTag ? `${dirTag}  ` : ''}${s.lead}`, 2.2, 6.3, 8.9, 0.35, { fontFace: sans, fontSize: 11, bold: true, color: ink });
        box(slide, s.support, 2.2, 6.65, 8.9, 0.5, { fontFace: sans, fontSize: 10, color: muted });
      } else {
        await addArt(slide, s, 0, 0, poster ? 8.9 : 9.4, H);
        if (dirTag) box(slide, dirTag, poster ? 9.4 : 9.9, 0.9, 3.3, 0.3, { fontFace: sans, fontSize: 9, bold: true, color: hex(dir?.color ?? pal.accent), charSpacing: 1 });
        box(slide, s.lead, poster ? 9.4 : 9.9, 1.4, 3.3, 1.6, { fontFace: poster ? sans : serif, bold: poster, fontSize: 26, color: ink });
        box(slide, s.support, poster ? 9.4 : 9.9, 3.2, 3.3, 2.4, { fontFace: sans, fontSize: 12, color: muted });
      }
      break;
    }
    case 'comparison': {
      box(slide, s.lead, 0.8, 0.8, 11.5, 1.0, { fontFace: style.typeface === 'serif' ? serif : sans, fontSize: 30, color: ink });
      const n = c.dirs.length || 1;
      const colW = (W - 1.6 - (n - 1) * 0.3) / n;
      c.dirs.forEach((d, k) => {
        const x = 0.8 + k * (colW + 0.3);
        slide.addShape(pptx.ShapeType.rect, { x, y: 2.2, w: colW, h: 0.08, fill: { color: hex(d.color) }, line: { color: hex(d.color) } });
        box(slide, `${d.id} · ${d.name}`.toUpperCase(), x, 2.45, colW, 0.3, { fontFace: sans, fontSize: 10, bold: true, color: hex(d.color) });
        box(slide, d.slogan, x, 2.9, colW, 1.6, { fontFace: style.typeface === 'serif' ? serif : sans, fontSize: 22, color: ink });
        box(slide, d.difference, x, 4.7, colW, 1.8, { fontFace: sans, fontSize: 11, color: muted });
      });
      break;
    }
    default: {
      box(slide, dirTag || String(i + 1).padStart(2, '0'), textX, 1.1, 3.8, 0.3, { fontFace: sans, fontSize: 10, bold: true, color: accent, charSpacing: 2 });
      box(slide, s.lead, textX, 1.6, 3.8, 3.2, { fontFace: style.typeface === 'serif' ? serif : sans, bold: poster, fontSize: 28, color: ink });
      box(slide, s.support, textX, 5.0, 3.8, 1.6, { fontFace: sans, fontSize: 12, color: muted });
      if (s.art) {
        if (gallery) await addArt(slide, s, 5.6, 0.9, 6.9, 5.7);
        else await addArt(slide, s, artX, 0, W - 4.9, H);
      }
    }
  }
}

// ---------------------------------------------------------------- cobalt & lime

/** Slide container units (as in cobalt.css) to inches: 100cqw is the slide width. */
const u = (cqw: number) => (cqw * W) / 100;

/** Round arrow button: a filled circle with a native arrow, as in the reference deck. */
function orb(pptx: Pptx, slide: PSlide, x: number, y: number, d: number, fill: string, ink: string, ring?: string) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: ring ? { color: ring, width: 6 } : { color: fill } });
  slide.addText('→', { x, y, w: d, h: d, margin: 0, align: 'center', valign: 'middle', fontFace: 'Arial', bold: true, fontSize: Math.round(d * 46), color: ink, rotate: 315 });
}

/** A pill with its text; the width follows the text roughly. */
function pill(pptx: Pptx, slide: PSlide, text: string, x: number, y: number, fill: string, ink: string, size = 12, w?: number) {
  const pw = w ?? Math.min(6, 0.5 + text.length * size * 0.0075);
  const ph = size * 0.028 + 0.14;
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w: pw, h: ph, rectRadius: ph / 2, fill: { color: fill }, line: { color: fill } });
  slide.addText(text, { x, y, w: pw, h: ph, margin: 0, align: 'center', valign: 'middle', fontFace: 'Arial', bold: true, fontSize: size, color: ink, fit: 'shrink' });
  return pw;
}

async function framedArt(slide: PSlide, s: Slide, x: number, y: number, w: number, h: number, radiiCqw: [number, number, number, number], backing?: { pptx: Pptx; color: string }) {
  if (!s.art) return;
  // The frame behind the picture (equal corners only), so letterboxed posters and packs sit in a shape as on screen.
  if (backing) slide.addShape(backing.pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: u(Math.min(...radiiCqw)), fill: { color: backing.color }, line: { color: backing.color } });
  const radii = radiiCqw.map((r) => u(r) / w) as [number, number, number, number];
  const data = await rasterize(s.art, [Math.round(w * 100), Math.round(h * 100)], 1600, radii);
  slide.addImage({ data, x, y, w, h, altText: s.lead });
}

/** The same compositions as the cobalt slides on screen (Slide.tsx, cobalt.css), as native objects. */
async function buildCobalt(pptx: Pptx, s: Slide, i: number, c: Ctx) {
  const pal = c.style.palette;
  const accent = hex(pal.accent);
  const hl = hex(pal.highlight ?? pal.accent);
  const ink = hex(pal.ink);
  const muted = hex(pal.muted);
  const white = 'FFFFFF';
  const page = cobaltPage(s.kind);
  const bg = page === 'cobalt' ? accent : page === 'wash' ? hex(pal.wash ?? pal.paper) : hex(pal.paper);
  const onCobalt = page === 'cobalt';
  const text = onCobalt ? white : ink;
  const sub = onCobalt ? 'E4E7FB' : muted;
  const font = 'Arial';
  const dir = c.dirs.find((d) => d.id === s.directionId);
  const slide = pptx.addSlide();
  slide.background = { color: bg };
  if (s.notes) slide.addNotes(s.notes);
  slide.addText(`${String(i + 1).padStart(2, '0')} / ${String(c.total).padStart(2, '0')}`, { x: W - 1.6, y: H - 0.5, w: 1.2, h: 0.3, fontFace: font, fontSize: 9, color: onCobalt ? 'C9CEF6' : muted, align: 'right', margin: 0 });
  const dirLabel = dir ? `${dir.id} · ${dir.name}` : '';

  switch (s.kind) {
    case 'cover': {
      const fx = W - u(4) - u(38);
      await framedArt(slide, s, fx, u(4.5), u(38), H - u(9), [11, 3, 3, 3]);
      box(slide, s.lead, u(6), u(9), u(48), u(17), { fontFace: font, fontSize: 66, color: white, valign: 'bottom' });
      pill(pptx, slide, c.client, u(28), u(27.4), hl, ink, 14);
      box(slide, s.support, u(6), u(36), u(44), u(6), { fontFace: font, fontSize: 15, color: sub });
      orb(pptx, slide, u(54.5), u(30), u(7.5), hl, ink, accent);
      break;
    }
    case 'question': {
      orb(pptx, slide, u(9), u(12), u(4.6), hl, ink);
      box(slide, s.lead, u(9), u(19), u(72), u(19), { fontFace: font, fontSize: 42, color: ink });
      pill(pptx, slide, s.support, u(9), u(40), accent, white, 12);
      break;
    }
    case 'conclusion':
    case 'strategy': {
      box(slide, s.lead, u(7), u(8), u(48), u(40), { fontFace: font, fontSize: 34, color: ink, valign: 'middle' });
      const items = s.support.split('·').map((x) => x.trim()).filter(Boolean);
      const ph = u(6.2);
      const gap = u(1.2);
      const panelH = items.length * ph + (items.length - 1) * gap + u(4.4);
      const py = (H - panelH) / 2;
      slide.addShape(pptx.ShapeType.roundRect, { x: u(60), y: py, w: u(33), h: panelH, rectRadius: u(3.4), fill: { color: hl }, line: { color: hl } });
      items.forEach((x, k) => pill(pptx, slide, x, u(62.2), py + u(2.2) + k * (ph + gap), accent, white, 18, u(28.6)));
      break;
    }
    case 'closing': {
      box(slide, s.support, u(10), u(15), u(80), u(3), { fontFace: font, fontSize: 12, color: sub, align: 'center' });
      box(slide, s.lead, u(10), u(19), u(80), u(16), { fontFace: font, fontSize: 42, color: white, align: 'center', valign: 'middle' });
      const pw = Math.min(6, 0.5 + c.client.length * 12 * 0.0075);
      pill(pptx, slide, c.client, (W - pw) / 2, u(38), hl, ink, 12, pw);
      orb(pptx, slide, (W - u(4)) / 2, u(43), u(4), hl, ink);
      break;
    }
    case 'data': {
      const num = s.bigNumber ?? s.lead;
      box(slide, num, u(7), u(12), u(44), u(15), { fontFace: font, fontSize: 120, color: accent, valign: 'bottom', fit: 'none' });
      orb(pptx, slide, Math.min(u(7) + num.length * u(6.6), u(48)), u(12.5), u(3.4), hl, ink);
      box(slide, s.support, u(7), u(29), u(38), u(9), { fontFace: font, fontSize: 19, color: ink });
      if (s.notes) box(slide, s.notes, u(7), u(39), u(38), u(3), { fontFace: font, fontSize: 9, color: muted });
      if (s.chart) {
        const max = Math.max(...s.chart.data.map((d) => d.value), 1);
        const bh = u(5.4);
        const y0 = (H - (s.chart.data.length * (bh + u(1)) - u(1))) / 2;
        s.chart.data.forEach((d, k) => {
          const w = Math.max(0.18, d.value / max) * u(38);
          const fill = k % 2 ? hl : accent;
          const fg = k % 2 ? ink : white;
          slide.addShape(pptx.ShapeType.roundRect, { x: u(55), y: y0 + k * (bh + u(1)), w, h: bh, rectRadius: u(1.2), fill: { color: fill }, line: { color: fill } });
          slide.addText([{ text: `${d.label}   `, options: { fontSize: 11 } }, { text: String(d.value), options: { fontSize: 18, bold: true } }], { x: u(56.4), y: y0 + k * (bh + u(1)), w: w - u(2.8), h: bh, margin: 0, valign: 'middle', fontFace: font, color: fg });
        });
      } else {
        const f = fraction(num);
        if (f) {
          const cols = Math.ceil(Math.sqrt(f[1] * 1.5));
          const rows = Math.ceil(f[1] / cols);
          const gap = u(1);
          const cell = Math.min((u(34) - (cols - 1) * gap) / cols, u(7));
          const y0 = (H - (rows * cell + (rows - 1) * gap)) / 2;
          for (let k = 0; k < f[1]; k += 1) {
            const fill = k < f[0] ? accent : hl;
            slide.addShape(pptx.ShapeType.roundRect, { x: u(55) + (k % cols) * (cell + gap), y: y0 + Math.floor(k / cols) * (cell + gap), w: cell, h: cell, rectRadius: u(1.4), fill: { color: fill }, line: { color: fill } });
          }
        }
      }
      break;
    }
    case 'theme': {
      if (dirLabel) pill(pptx, slide, dirLabel, u(7), u(13), accent, white, 12);
      box(slide, s.lead, u(7), u(18), u(52), u(20), { fontFace: font, fontSize: 52, color: ink, valign: 'middle' });
      box(slide, s.support, u(7), u(40), u(50), u(5), { fontFace: font, fontSize: 14, color: ink });
      const dc = hex(dir?.color ?? pal.accent);
      const cx = W - u(7) - u(26);
      slide.addShape(pptx.ShapeType.ellipse, { x: cx, y: u(13), w: u(26), h: u(26), fill: { color: dc }, line: { color: dc } });
      if (dir) slide.addText(dir.id, { x: cx, y: u(13), w: u(26), h: u(26), margin: 0, align: 'center', valign: 'middle', fontFace: font, fontSize: 96, color: white });
      slide.addShape(pptx.ShapeType.ellipse, { x: W - u(7) - u(38) + u(1), y: H - u(9) - u(13), w: u(13), h: u(13), fill: { color: hl }, line: { color: hl } });
      slide.addShape(pptx.ShapeType.ellipse, { x: W - u(7) - u(38) + u(6), y: u(10), w: u(8), h: u(8), fill: { color: accent }, line: { color: accent } });
      break;
    }
    case 'visual':
    case 'mockup': {
      await framedArt(slide, s, u(4), u(4), u(60), H - u(8), [3, 3, 3, 3], { pptx, color: 'DDDEDA' });
      const cw = u(36);
      const ch = u(24);
      const cx = W - u(5) - cw;
      const cy = (H - ch) / 2;
      slide.addShape(pptx.ShapeType.roundRect, { x: cx, y: cy, w: cw, h: ch, rectRadius: u(3), fill: { color: hl }, line: { color: hl } });
      if (dirLabel) box(slide, dirLabel.toUpperCase(), cx + u(3), cy + u(3), cw - u(6), u(2), { fontFace: font, fontSize: 10, bold: true, color: ink, charSpacing: 1 });
      box(slide, s.lead, cx + u(3), cy + u(5.6), cw - u(6), u(6), { fontFace: font, fontSize: 26, color: ink });
      box(slide, s.support, cx + u(3), cy + u(12), cw - u(6), u(6), { fontFace: font, fontSize: 12, color: ink });
      orb(pptx, slide, cx + cw - u(3) - u(4.6), cy + ch - u(3) - u(4.6), u(4.6), ink, hl);
      break;
    }
    case 'comparison': {
      box(slide, s.lead, u(6), u(7), u(88), u(5), { fontFace: font, fontSize: 28, color: ink });
      const n = c.dirs.length || 1;
      const gap = u(2);
      const cw = (W - u(12) - (n - 1) * gap) / n;
      c.dirs.forEach((d, k) => {
        const x = u(6) + k * (cw + gap);
        const y = u(15);
        const fill = k % 2 ? hl : accent;
        const fg = k % 2 ? ink : white;
        slide.addShape(pptx.ShapeType.roundRect, { x, y, w: cw, h: u(32), rectRadius: u(3), fill: { color: fill }, line: { color: fill } });
        slide.addShape(pptx.ShapeType.ellipse, { x: x + u(2.6), y: y + u(2.6), w: u(4.4), h: u(4.4), fill: { color: hex(d.color) }, line: { color: white, width: 2 } });
        slide.addText(d.id, { x: x + u(2.6), y: y + u(2.6), w: u(4.4), h: u(4.4), margin: 0, align: 'center', valign: 'middle', fontFace: font, bold: true, fontSize: 16, color: white });
        box(slide, d.name.toUpperCase(), x + u(2.6), y + u(8.4), cw - u(5.2), u(2), { fontFace: font, fontSize: 10, bold: true, color: fg, charSpacing: 1 });
        box(slide, d.slogan, x + u(2.6), y + u(11), cw - u(5.2), u(9), { fontFace: font, fontSize: 22, color: fg });
        box(slide, d.difference, x + u(2.6), y + u(22), cw - u(5.2), u(8), { fontFace: font, fontSize: 11, color: fg });
      });
      break;
    }
    default: {
      if (dirLabel) pill(pptx, slide, dirLabel, u(6), u(14), onCobalt ? white : accent, onCobalt ? accent : white, 12);
      else pill(pptx, slide, s.kind === 'recommendation' ? c.title : String(i + 1).padStart(2, '0'), u(6), u(14), hl, ink, 12);
      box(slide, s.lead, u(6), u(18.5), u(42), u(16), { fontFace: font, fontSize: 34, color: text });
      box(slide, s.support, u(6), u(36), u(40), u(8), { fontFace: font, fontSize: 13, color: sub });
      if (s.art) {
        const fx = W - u(4.5) - u(40);
        await framedArt(slide, s, fx, u(4.5), u(40), H - u(9), [3, 11, 3, 3]);
        orb(pptx, slide, fx + u(2.2), H - u(4.5) - u(2.2) - u(6), u(6), hl, ink);
      }
    }
  }
}

// ---------------------------------------------------------------- editorial (case-study grid)

const ED_ORBS = ['F2C59B', 'B7D3A8', 'B9B0E6'];
const ED_CHIPS: Array<[string, string]> = [
  ['F2C59B', '6B3B12'],
  ['B7D3A8', '24452A'],
  ['C9C1EE', '3C3270'],
];

function chips(pptx: Pptx, slide: PSlide, items: string[], x: number, y: number) {
  let cx = x;
  items.forEach((label, k) => {
    const [fill, ink] = ED_CHIPS[k % 3];
    const w = 0.28 + label.length * 0.075;
    slide.addShape(pptx.ShapeType.roundRect, { x: cx, y, w, h: 0.24, rectRadius: 0.06, fill: { color: fill }, line: { color: fill } });
    slide.addText(label.toUpperCase(), { x: cx, y, w, h: 0.24, margin: 0, align: 'center', valign: 'middle', fontFace: 'Arial', bold: true, fontSize: 8, color: ink, charSpacing: 0.5 });
    cx += w + u(0.6);
  });
}

/** Picture in a rounded frame with the pastel arrow button in a notch at its bottom-right. */
async function notchedPic(pptx: Pptx, slide: PSlide, art: ArtSpec | undefined, alt: string, x: number, y: number, w: number, h: number, orbColor: string, paper: string) {
  if (art) {
    const data = await rasterize(art, [Math.round(w * 100), Math.round(h * 100)], 1600, [u(1.6) / w, u(1.6) / w, u(1.6) / w, u(1.6) / w]);
    slide.addImage({ data, x, y, w, h, altText: alt });
  }
  const n = u(7.2);
  slide.addShape(pptx.ShapeType.roundRect, { x: x + w - n, y: y + h - n, w: n + 0.02, h: n + 0.02, rectRadius: u(3.4), fill: { color: paper }, line: { color: paper } });
  slide.addShape(pptx.ShapeType.rect, { x: x + w - n / 2, y: y + h - n, w: n / 2 + 0.02, h: n + 0.02, fill: { color: paper }, line: { color: paper } });
  slide.addShape(pptx.ShapeType.rect, { x: x + w - n, y: y + h - n / 2, w: n + 0.02, h: n / 2 + 0.02, fill: { color: paper }, line: { color: paper } });
  orb(pptx, slide, x + w - n + u(0.9), y + h - n + u(0.9), n - u(0.9), orbColor, '1B1A1F');
}

/** Editorial slides: off-white card on a coloured mat, as in the case-study grid (Slide.tsx, slides.css). */
async function buildEditorial(pptx: Pptx, s: Slide, i: number, c: Ctx) {
  const pal = c.style.palette;
  const paper = hex(pal.paper);
  const ink = hex(pal.ink);
  const muted = hex(pal.muted);
  const serif = 'Georgia';
  const sans = 'Arial';
  const dir = c.dirs.find((d) => d.id === s.directionId);
  const mat = s.kind === 'theme' && dir ? hex(dir.color) : hex(pal.wash ?? pal.accent);
  const slide = pptx.addSlide();
  slide.background = { color: mat };
  if (s.notes) slide.addNotes(s.notes);
  const cx = u(4);
  const cy = u(3.2);
  const cw = W - u(8);
  const ch = H - u(6.4);
  slide.addShape(pptx.ShapeType.roundRect, { x: cx, y: cy, w: cw, h: ch, rectRadius: u(1.6), fill: { color: paper }, line: { color: paper } });
  slide.addText(`${String(i + 1).padStart(2, '0')} / ${String(c.total).padStart(2, '0')}`, { x: cx + cw - 1.6, y: cy + ch - 0.45, w: 1.3, h: 0.3, fontFace: sans, fontSize: 8, color: muted, align: 'right', margin: 0 });
  const orbColor = ED_ORBS[i % 3];
  const pill = (text: string) => {
    const w = Math.min(6, 0.6 + text.length * 0.085);
    slide.addShape(pptx.ShapeType.roundRect, { x: (W - w) / 2, y: cy + ch - u(4) - 0.4, w, h: 0.4, rectRadius: 0.2, fill: { color: '141416' }, line: { color: '141416' } });
    slide.addText(text, { x: (W - w) / 2, y: cy + ch - u(4) - 0.4, w, h: 0.4, margin: 0, align: 'center', valign: 'middle', fontFace: sans, fontSize: 11, color: 'FFFFFF' });
  };
  switch (s.kind) {
    case 'cover':
      box(slide, s.lead, cx + u(5), cy + u(5), u(36), u(15), { fontFace: serif, fontSize: 48, color: ink });
      box(slide, s.support, cx + u(5), cy + u(21), u(36), u(4), { fontFace: sans, fontSize: 12, color: muted });
      chips(pptx, slide, [c.client], cx + u(5), cy + u(26));
      await notchedPic(pptx, slide, s.art, s.lead, cx + cw - u(4) - u(44), cy + u(4), u(44), ch - u(8), ED_ORBS[0], paper);
      break;
    case 'question':
    case 'conclusion':
    case 'closing':
    case 'strategy':
      box(slide, s.lead, cx + u(8), cy + u(7), cw - u(16), u(22), { fontFace: serif, fontSize: 34, color: ink, align: 'center', valign: 'middle' });
      if (s.kind === 'conclusion' || s.kind === 'strategy') {
        const items = s.support.split('·').map((x) => x.trim()).filter(Boolean);
        const total = items.reduce((a, x) => a + 0.28 + x.length * 0.075 + u(0.6), 0);
        chips(pptx, slide, items, (W - total) / 2, cy + u(31));
      } else box(slide, s.support, cx + u(8), cy + u(30), cw - u(16), u(3), { fontFace: sans, fontSize: 11, color: muted, align: 'center' });
      pill(s.kind === 'closing' ? c.client : c.title);
      break;
    case 'data':
      box(slide, s.bigNumber ?? s.lead, cx + u(6), cy + u(10), u(40), u(26), { fontFace: serif, fontSize: 118, color: ink, valign: 'middle', fit: 'none' });
      box(slide, s.support, cx + u(48), cy + u(15), u(38), u(14), { fontFace: serif, fontSize: 24, color: ink, valign: 'middle' });
      if (s.notes) box(slide, s.notes, cx + u(48), cy + u(30), u(38), u(3), { fontFace: sans, fontSize: 9, color: muted });
      break;
    case 'theme':
      if (dir) chips(pptx, slide, [`${dir.id} · ${dir.name}`], cx + u(7), cy + u(13));
      box(slide, s.lead, cx + u(7), cy + u(17), u(72), u(16), { fontFace: serif, fontSize: 46, color: ink, valign: 'middle' });
      box(slide, s.support, cx + u(7), cy + u(34), u(60), u(4), { fontFace: sans, fontSize: 12, color: muted });
      break;
    case 'comparison': {
      box(slide, s.lead, cx + u(5), cy + u(4.4), u(50), u(8), { fontFace: serif, fontSize: 26, color: ink });
      const gap = u(2);
      const w = (cw - u(8) - 2 * gap) / 3;
      for (const [k, d] of c.dirs.entries()) {
        const x = cx + u(4) + k * (w + gap);
        const y = cy + u(15);
        await notchedPic(pptx, slide, c.arts[d.id], d.name, x, y, w, u(17), ED_ORBS[k % 3], paper);
        box(slide, d.name, x, y + u(18), w, u(2.8), { fontFace: sans, fontSize: 18, color: ink });
        box(slide, d.slogan, x, y + u(21), w, u(4), { fontFace: sans, fontSize: 10, color: muted });
        chips(pptx, slide, [d.id], x, y + u(25.5));
      }
      break;
    }
    case 'visual':
    case 'mockup':
      await notchedPic(pptx, slide, s.art, s.lead, cx + u(4), cy + u(4), u(52), ch - u(8), orbColor, paper);
      box(slide, s.lead, cx + cw - u(5) - u(28), cy + u(14), u(28), u(6), { fontFace: serif, fontSize: 26, color: ink });
      box(slide, s.support, cx + cw - u(5) - u(28), cy + u(21), u(28), u(7), { fontFace: sans, fontSize: 11, color: muted });
      if (dir) chips(pptx, slide, [dir.id, dir.name], cx + cw - u(5) - u(28), cy + u(29));
      break;
    default:
      box(slide, s.kind === 'recommendation' ? c.title.toUpperCase() : String(i + 1).padStart(2, '0'), cx + u(5), cy + u(12), u(38), u(2), { fontFace: sans, fontSize: 9, bold: true, color: muted, charSpacing: 2 });
      box(slide, s.lead, cx + u(5), cy + u(15), u(38), u(14), { fontFace: serif, fontSize: 30, color: ink });
      box(slide, s.support, cx + u(5), cy + u(30), u(36), u(6), { fontFace: sans, fontSize: 11, color: muted });
      if (dir) chips(pptx, slide, [`${dir.id} · ${dir.name}`], cx + u(5), cy + u(37));
      if (s.art) await notchedPic(pptx, slide, s.art, s.lead, cx + cw - u(4) - u(40), cy + u(4), u(40), ch - u(8), orbColor, paper);
  }
}

// ---------------------------------------------------------------- studio (marketing deck)

/** Studio slides: white page on a periwinkle ground, as in the marketing deck (Slide.tsx, slides.css). */
async function buildStudio(pptx: Pptx, s: Slide, i: number, c: Ctx) {
  const pal = c.style.palette;
  const paper = hex(pal.paper);
  const ink = hex(pal.ink);
  const muted = hex(pal.muted);
  const violet = hex(pal.accent);
  const lime = hex(pal.highlight ?? pal.accent);
  const lilac = '7D6FF2';
  const f = 'Arial';
  const dir = c.dirs.find((d) => d.id === s.directionId);
  const slide = pptx.addSlide();
  slide.background = { color: hex(pal.wash ?? pal.paper) };
  if (s.notes) slide.addNotes(s.notes);
  const px = u(3.4);
  const py = u(2.6);
  const pw = W - u(6.8);
  const ph = H - u(5.2);
  slide.addShape(pptx.ShapeType.roundRect, { x: px, y: py, w: pw, h: ph, rectRadius: u(1), fill: { color: paper }, line: { color: paper } });
  slide.addText(`${String(i + 1).padStart(2, '0')} / ${String(c.total).padStart(2, '0')}`, { x: px + pw - 1.6, y: py + ph - 0.42, w: 1.3, h: 0.3, fontFace: f, fontSize: 8, color: muted, align: 'right', margin: 0 });
  // Head: numbered dark tag and the client in small capitals.
  const label = s.kind === 'question' || s.kind === 'closing' ? s.support : dir ? `${dir.id} · ${dir.name}` : c.title;
  const tx = px + u(4);
  const ty = py + u(3);
  slide.addShape(pptx.ShapeType.ellipse, { x: tx, y: ty, w: u(1.9), h: u(1.9), fill: { color: '111214' }, line: { color: '111214' } });
  slide.addText(String(i + 1), { x: tx, y: ty, w: u(1.9), h: u(1.9), margin: 0, align: 'center', valign: 'middle', fontFace: f, bold: true, fontSize: 7, color: 'FFFFFF' });
  const lw = Math.min(5, 0.3 + label.length * 0.06);
  slide.addShape(pptx.ShapeType.roundRect, { x: tx + u(2.3), y: ty, w: lw, h: u(1.9), rectRadius: u(0.95), fill: { color: '111214' }, line: { color: '111214' } });
  slide.addText(label, { x: tx + u(2.3), y: ty, w: lw, h: u(1.9), margin: 0, align: 'center', valign: 'middle', fontFace: f, fontSize: 7, color: 'FFFFFF', fit: 'shrink' });
  box(slide, c.client.toUpperCase(), px + pw - u(4) - 4, ty, 4, u(1.9), { fontFace: f, fontSize: 7, bold: true, color: ink, align: 'right', valign: 'middle', charSpacing: 0.5 });
  const arrow = (x: number, y: number) => slide.addText('→', { x, y, w: u(4.6), h: u(4.6), margin: 0, align: 'center', valign: 'middle', fontFace: f, fontSize: 30, color: ink, rotate: 315 });
  const tall = async (art: ArtSpec | undefined, alt: string, x: number, y: number, w: number, h: number, pill: string, pillLime: boolean, n?: number, title?: string, line?: string) => {
    // A poster, pack or mockup is shown whole on a mat, with its text and pill below it, never
    // over it; a picture still fills the card under a dark caption, as on screen.
    const whole = Boolean(art && art.kind !== 'scene');
    const card = whole ? hex(MAT) : '1D1D22';
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: u(1.8), fill: { color: card }, line: { color: card } });
    if (art) {
      const ah = whole ? h - (title ? u(14.6) : u(4.8)) : h;
      const data = await rasterize(art, [Math.round(w * 100), Math.round(ah * 100)], 1400, [u(1.8) / w, u(1.8) / w, whole ? 0 : u(1.8) / w, whole ? 0 : u(1.8) / w]);
      slide.addImage({ data, x, y, w, h: ah, altText: alt });
    }
    if (title) {
      if (!whole) slide.addShape(pptx.ShapeType.roundRect, { x: x + u(0.6), y: y + h - u(13), w: w - u(1.2), h: u(12.4), rectRadius: u(1.4), fill: { color: '111214', transparency: 18 }, line: { color: '111214', transparency: 18 } });
      const tc = whole ? '111214' : 'FFFFFF';
      box(slide, title, x + u(1.4), y + h - u(12), w - u(2.8), u(3.4), { fontFace: f, bold: true, fontSize: 14, color: tc });
      if (line) box(slide, line, x + u(1.4), y + h - u(8.4), w - u(2.8), u(3), { fontFace: f, fontSize: 8, color: tc });
    }
    if (n) {
      slide.addShape(pptx.ShapeType.ellipse, { x: x + u(1.2), y: y + u(1.2), w: u(2.3), h: u(2.3), fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' } });
      slide.addText(String(n), { x: x + u(1.2), y: y + u(1.2), w: u(2.3), h: u(2.3), margin: 0, align: 'center', valign: 'middle', fontFace: f, bold: true, fontSize: 8, color: '111214' });
    }
    const fill = pillLime ? lime : violet;
    slide.addShape(pptx.ShapeType.roundRect, { x: x + u(1.2), y: y + h - u(1.2) - u(2.4), w: w - u(2.4), h: u(2.4), rectRadius: u(1.2), fill: { color: fill }, line: { color: fill } });
    slide.addText(`${pill}  ✓`, { x: x + u(2), y: y + h - u(1.2) - u(2.4), w: w - u(4), h: u(2.4), margin: 0, valign: 'middle', fontFace: f, fontSize: 8, color: pillLime ? '111214' : 'FFFFFF', fit: 'shrink' });
  };
  const ix = px + u(4);
  const iy = py + u(8);
  const iw = pw - u(8);
  const ih = ph - u(8) - u(3.6);
  switch (s.kind) {
    case 'cover':
      box(slide, s.lead, ix, py + u(9), u(48), u(18), { fontFace: f, bold: true, fontSize: 50, color: ink });
      box(slide, s.support, ix, py + u(30), u(40), u(3), { fontFace: f, fontSize: 10, color: muted });
      arrow(ix - u(0.4), py + ph - u(3.4) - u(4.6));
      await tall(s.art, s.lead, px + pw - u(4) - u(24), py + u(7), u(24), ph - u(7) - u(3.6), c.client, true);
      break;
    case 'question':
    case 'closing':
      box(slide, s.lead, ix, py + u(11), u(84), u(22), { fontFace: f, bold: true, fontSize: 40, color: ink });
      arrow(ix - u(0.4), py + ph - u(3.4) - u(4.6));
      break;
    case 'conclusion':
    case 'strategy': {
      const w1 = ((iw - u(1.4)) * 1.4) / 2.4;
      const w2 = iw - u(1.4) - w1;
      slide.addShape(pptx.ShapeType.roundRect, { x: ix, y: iy, w: w1, h: ih, rectRadius: u(2), fill: { color: lime }, line: { color: lime } });
      slide.addShape(pptx.ShapeType.roundRect, { x: ix + w1 + u(1.4), y: iy, w: w2, h: ih, rectRadius: u(2), fill: { color: violet }, line: { color: violet } });
      box(slide, s.lead, ix + u(2.6), iy + ih - u(2.6) - u(16), w1 - u(5.2), u(16), { fontFace: f, bold: true, fontSize: 24, color: '111214', valign: 'bottom' });
      const items = s.support.split('·').map((x) => x.trim()).filter(Boolean);
      box(slide, items.join('\n'), ix + w1 + u(4), iy + ih - u(2.6) - u(16), w2 - u(5.2), u(16), { fontFace: f, bold: true, fontSize: 16, color: 'FFFFFF', valign: 'bottom', paraSpaceAfter: 6 });
      break;
    }
    case 'data': {
      box(slide, s.support, ix, iy + u(6), u(44), u(18), { fontFace: f, bold: true, fontSize: 30, color: ink, valign: 'middle' });
      if (s.notes) box(slide, s.notes, ix, iy + u(26), u(44), u(3), { fontFace: f, fontSize: 8, color: muted });
      const sx = ix + u(50);
      slide.addShape(pptx.ShapeType.roundRect, { x: sx, y: iy + u(3), w: iw - u(50), h: u(26), rectRadius: u(2), fill: { color: lilac }, line: { color: lilac } });
      box(slide, s.bigNumber ?? s.lead, sx + u(2.6), iy + u(10), iw - u(55), u(10), { fontFace: f, bold: true, fontSize: 64, color: 'FFFFFF', valign: 'bottom', fit: 'none' });
      box(slide, s.support, sx + u(2.6), iy + u(21.5), iw - u(55), u(5), { fontFace: f, fontSize: 10, color: 'FFFFFF' });
      break;
    }
    case 'theme': {
      box(slide, s.lead, ix, iy + u(6), u(50), u(18), { fontFace: f, bold: true, fontSize: 44, color: ink, valign: 'middle' });
      box(slide, s.support, ix, iy + u(26), u(46), u(4), { fontFace: f, fontSize: 10, color: muted });
      const tw = iw - u(56);
      const color = hex(dir?.color ?? pal.accent);
      slide.addShape(pptx.ShapeType.roundRect, { x: ix + u(56), y: iy, w: tw, h: ih, rectRadius: u(2), fill: { color }, line: { color } });
      if (dir) {
        slide.addText(dir.id, { x: ix + u(56), y: iy + u(4), w: tw, h: ih - u(12), margin: 0, align: 'center', valign: 'middle', fontFace: f, bold: true, fontSize: 110, color: 'FFFFFF' });
        slide.addText(dir.name, { x: ix + u(56), y: iy + ih - u(9), w: tw, h: u(3), margin: 0, align: 'center', fontFace: f, bold: true, fontSize: 13, color: 'FFFFFF' });
      }
      break;
    }
    case 'comparison': {
      box(slide, s.lead, ix, iy, u(26), u(14), { fontFace: f, bold: true, fontSize: 28, color: ink });
      box(slide, s.support, ix, iy + u(15), u(26), u(4), { fontFace: f, fontSize: 9, color: muted });
      arrow(ix - u(0.4), py + ph - u(3.4) - u(4.6));
      const gx = ix + u(29);
      const gap = u(1.2);
      const w = (iw - u(29) - 2 * gap) / 3;
      for (const [k, d] of c.dirs.entries()) await tall(c.arts[d.id], d.name, gx + k * (w + gap), iy, w, ih, d.id, k === c.dirs.length - 1, k + 1, d.name, d.slogan);
      break;
    }
    case 'visual':
    case 'mockup':
      box(slide, s.lead, ix, iy, u(36), u(10), { fontFace: f, bold: true, fontSize: 28, color: ink });
      box(slide, s.support, ix, iy + u(11), u(34), u(6), { fontFace: f, fontSize: 10, color: muted });
      arrow(ix - u(0.4), py + ph - u(3.4) - u(4.6));
      await tall(s.art, s.lead, ix + u(39), iy, iw - u(39), ih, dir ? dir.name : c.client, dir?.id === 'C');
      break;
    default: {
      box(slide, s.lead, ix, iy, u(38), u(14), { fontFace: f, bold: true, fontSize: 28, color: ink });
      box(slide, s.support, ix, iy + u(15), u(36), u(6), { fontFace: f, fontSize: 10, color: muted });
      if (dir) pill(pptx, slide, `${dir.id} · ${dir.name}`, ix, iy + u(23), '111214', 'FFFFFF', 10);
      const mx = ix + u(42);
      const mw = iw - u(42);
      const sw = (mw - u(1.2)) / 2.3;
      slide.addShape(pptx.ShapeType.roundRect, { x: mx, y: iy, w: sw, h: ih, rectRadius: u(2), fill: { color: lilac }, line: { color: lilac } });
      box(slide, dir?.id ?? String(i + 1).padStart(2, '0'), mx + u(2), iy + ih - u(16), sw - u(4), u(9), { fontFace: f, bold: true, fontSize: 60, color: 'FFFFFF', valign: 'bottom', fit: 'none' });
      box(slide, dir?.slogan ?? c.title, mx + u(2), iy + ih - u(6.5), sw - u(4), u(5), { fontFace: f, fontSize: 9, color: 'FFFFFF' });
      if (s.art) {
        const ax = mx + sw + u(1.2);
        const aw = mw - sw - u(1.2);
        const data = await rasterize(s.art, [Math.round(aw * 100), Math.round(ih * 100)], 1400, [u(2) / aw, u(2) / aw, u(2) / aw, u(2) / aw]);
        slide.addImage({ data, x: ax, y: iy, w: aw, h: ih, altText: s.lead });
      }
    }
  }
}

/** Builds the deck in the chosen style and starts the download. Returns the file name. */
export async function exportPptx(p: Proposal, style: LayoutStyle, onProgress?: (done: number, total: number) => void): Promise<string> {
  if (!p.layout) throw new Error('There is no layout to export yet.');
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = p.name;
  pptx.company = p.client;
  pptx.subject = `${style.name} presentation`;
  const slides = p.layout.slides;
  MAT = mix(style.palette.ink, style.palette.paper, 0.07);
  const ctx: Ctx = { arts: directionArts(slides), style, dirs: p.themes?.directions ?? [], font: style.typeface === 'serif' ? 'Georgia' : 'Arial', total: slides.length, client: p.client, title: p.name };
  for (let i = 0; i < slides.length; i += 1) {
    await buildSlide(pptx, slides[i], i, ctx);
    onProgress?.(i + 1, slides.length);
  }
  const fileName = `${p.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}-${style.id}.pptx`;
  const host = await hostDownloads();
  if (host) {
    // Inside the claude.ai artifact viewer pages cannot download directly; the viewer confirms the save.
    const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
    try {
      await host.save({ filename: fileName, data: blob });
    } catch (e) {
      const code = (e as { code?: string }).code;
      throw new Error(code === 'declined' ? 'declined' : (e as Error).message || 'The file could not be saved here.');
    }
    return fileName;
  }
  await pptx.writeFile({ fileName });
  return fileName;
}

type HostDownloads = { save(req: { filename: string; data: Blob }): Promise<unknown> };
let hostPromise: Promise<HostDownloads | null> | null = null;

/** The hosting viewer's download capability, when this page runs inside one; otherwise null. */
function hostDownloads(): Promise<HostDownloads | null> {
  const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (!claude?.use) return Promise.resolve(null);
  hostPromise ??= claude.use('downloads').then(
    (ns) => (ns as HostDownloads | null) ?? null,
    () => null,
  );
  return hostPromise;
}
