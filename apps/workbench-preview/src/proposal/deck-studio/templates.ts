import type { Chart, Draft, Media } from './model';

export function capacity(name: string, count: number, low: number, high: number) {
  if (!Number.isInteger(count) || count < low || count > high) throw new Error(`${name} 可容纳 ${low}–${high} 项，实际 ${count} 项。请拆页。`);
}
export function templateInput(d: Draft) {
  const t = d.template, [type, variant] = t.kind.split('.');
  if (!d.title.trim()) throw new Error('图版标题为空');
  const fields = { variant, eyebrow: d.eyebrow, title: d.title, hl: '' };
  const slots = new Map<string, Media | Chart>();
  const bind = (path: string, value: Media | Chart) => {
    slots.set(path, value);
    return value.id;
  };
  function data() {
    switch (t.kind) {
      case 'data.hero': capacity(t.kind, t.stats.length, 1, 4); return {
        ...fields,
        stats: t.stats.map(stat => ({ ...stat, note: '' })),
        sub: t.sub,
        tags: '',
        chartTitle: '',
        bars: [],
        fit: 'contain',
        img: bind('img', t.chart)
      };
      case 'combo.grid': capacity(t.kind, t.items.length, 1, 8); return {
        ...fields,
        sub: '',
        captions: true,
        items: t.items.map(({ item, cap }, i) => ({ img: bind(`items.${i}.img`, item), cap, hint: '' }))
      };
      case 'compare.lineup': capacity(t.kind, t.items.length, 2, 6); return {
        ...fields,
        sub: t.sub,
        mineLast: false,
        fit: 'contain',
        ratio: '',
        pair: [],
        posters: [],
        items: t.items.map(({ image, name, desc }, i) => ({ img: bind(`items.${i}.img`, image), name, desc, colors: '', score: '', hint: '' }))
      };
      case 'upload.framed': return { ...fields, img: bind('img', t.chart), fit: 'contain' };
      case 'summary.list': capacity(t.kind, t.points.length, 2, 6); return { ...fields, points: t.points, statement: '', sub: '', highlight: false };
      case 'summary.statement': case 'summary.question': return { ...fields, statement: t.statement, sub: t.sub, points: [], highlight: false };
      case 'cover.split': return { ...fields, kicker: d.eyebrow, sub: t.sub, meta: t.meta, img: bind('img', t.image), fit: 'contain' };
      case 'design.half': case 'design.stage': capacity(t.kind, t.points.length, 0, 4); return { ...fields, intro: t.intro, points: t.points, img: bind('img', t.image), fit: 'contain' };
    }
  }
  return { slide: { id: d.id, type, tone: t.kind === 'summary.question' ? 'brand' : 'light', data: data() }, slots };
}
