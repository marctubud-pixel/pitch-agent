import './vendor/deck-engine.js';
import { chartLayout } from './chart-layout';
import { templateInput } from './templates';
import type { Box, Chart, Draft, Font, Media, Node, Page, Theme } from './model';

interface Engine {
  VERSION: string; FONTS: Record<string, { family: string; fallback: string; sys: { key: string; }; }>;
  setPlatform(p: object): void; build(project: object, idx: number): unknown;
}
declare global { var DeckEngine: Engine; }
const engine = globalThis.DeckEngine;
if (engine.VERSION !== '1.7.0') throw new Error('版式内核版本不符');
for (const font of Object.values(engine.FONTS)) font.family = font.sys.key;
engine.setPlatform({
  fontReady: () => true,
  loadFont: () => Promise.reject(new Error('仅用系统字体')),
  zip: () => Promise.reject(new Error('仅用工作台原生导出')),
  loadImage: () => Promise.reject(new Error('仅用已核验图片'))
});

function obj(x: unknown): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error('版式输出对象无效');
  return Object.fromEntries(Object.entries(x));
}
function num(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error('版式坐标或字号无效');
  return x;
}
function str(x: unknown): string {
  if (typeof x !== 'string') throw new Error('版式文本字段无效');
  return x;
}
function color(x: unknown) {
  const c = str(x);
  if (!/^#[a-f\d]{6}$/i.test(c)) throw new Error('版式颜色无效');
  return c;
}
function box(e: Record<string, unknown>): Box {
  const b = { x: num(e.x), y: num(e.y), w: num(e.w), h: num(e.h) };
  if (b.w <= 0 || b.h <= 0) throw new Error('版式容器无效');
  return b;
}
function font(e: Record<string, unknown>, ink: string): Font {
  const f = engine.FONTS[str(e.fk)];
  if (!f) throw new Error('版式字体未适配');
  return { face: f.family, weight: num(e.fw), size: num(e.size), color: color(e.color ?? ink) };
}
function oneOf<A extends string, B extends string, C extends string>(x: unknown, a: A, b: B, c: C): A | B | C {
  if (x === a) return a;
  if (x === b) return b;
  if (x === c) return c;
  throw new Error('文字对齐方式无效');
}
export function checkedNodes(raw: unknown, slots: ReadonlyMap<string, Media | Chart>, accent: string): { bg: string; nodes: Node[]; } {
  const built = obj(raw), ink = color(obj(built.th).text), bg = color(built.bg), seen = new Set<string>();
  if (!Array.isArray(built.els)) throw new Error('版式缺少图元');
  const nodes: Node[] = built.els.flatMap((rawNode: unknown): Node[] => {
    const e = obj(rawNode), opacity = num(e.op ?? 1);
    if (e.grad || e.vertical || e.hl || e.rotate) throw new Error('尚未适配的图元样式');
    switch (e.k) {
      case 'line': return [{ kind: 'line', x1: num(e.x1), x2: num(e.x2), y1: num(e.y1), y2: num(e.y2), width: num(e.w), color: color(e.color), opacity }];
      case 'rect': case 'ellipse': return [{
        ...box(e),
        kind: e.k,
        fill: e.fill ? color(e.fill) : null,
        stroke: e.line ? color(e.line) : null,
        lw: num(e.lw ?? 1),
        radius: num(e.r ?? 0),
        opacity
      }];
      case 'text': {
        if (e.fitOk !== true) throw new Error(`版式文字超出容量：${String(e.bind ?? e.value)}`);
        const lines = Array.isArray(e.lines) ? e.lines.map(str) : [], runs = Array.isArray(e.runs) ? e.runs.map((r: unknown) => {
          const run = obj(r);
          return { ...font(run, ink), text: str(run.value) };
        }) : [];
        if (!lines.length && !runs.some(r => r.text)) return [];
        return [{
          kind: 'text',
          ...box(e),
          ...font(e, ink),
          lines,
          runs,
          lh: num(e.lh),
          ls: num(e.ls),
          align: oneOf(e.align, 'left', 'right', 'center'),
          valign: oneOf(e.valign, 'top', 'middle', 'bottom'),
          opacity
        }];
      }
      case 'image': {
        const bind = str(e.bind), value = slots.get(bind);
        if (!value || seen.has(bind) || value.id !== e.id) throw new Error(`图片槽不匹配：${bind}`);
        seen.add(bind);
        if ('kind' in value) {
          const frame = box(e);
          return [{ kind: 'chart', ...frame, chart: value, bind, color: accent, plot: chartLayout(frame, value, accent) }];
        }
        if (!/^data:image\/(png|jpeg);base64,/.test(value.data) || value.width <= 0 || value.height <= 0) throw new Error('缺少本地图片');
        const b = box(e), scale = Math.min(b.w / value.width, b.h / value.height), w = value.width * scale, h = value.height * scale;
        return [{ kind: 'image', x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h, bind, image: value }];
      }
      default: throw new Error(`未适配的版式图元：${String(e.k)}`);
    }
  });
  if (seen.size !== slots.size) throw new Error('版式未生成全部具名图片槽');
  return { bg, nodes };
}
export function compile(drafts: Draft[], brand: string, theme: Theme): Page[] {
  if (!drafts.length || new Set(drafts.map(d => d.id)).size !== drafts.length) throw new Error('页数或页面身份无效');
  const inputs = drafts.map(templateInput), project = {
    name: brand,
    brand: { name: brand, logo: null },
    agency: { name: '', logo: null, place: 'none' },
    theme: { ...theme, gradient: 'none' },
    assets: {},
    slides: inputs.map(i => i.slide)
  };
  return drafts.map(({ template, ...page }, i) => ({ ...page, template: template.kind, ...checkedNodes(engine.build(project, i), inputs[i].slots, theme.primary) }));
}
