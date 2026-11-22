import type { Chart, Draft, Media } from './model';

export function capacity(name: string, count: number, low: number, high: number) {
  if (!Number.isInteger(count) || count < low || count > high) throw new Error(`${name} 可容纳 ${low}–${high} 项，实际 ${count} 项。请拆页。`);
}
export function templateInput(d: Draft) {
  const t = d.template, [type, variant] = t.kind.split('.');
  if (!d.title.trim()) throw new Error('图版标题为空');
  const fields = { variant, eyebrow: d.eyebrow, title: d.title, hl: d.highlight ?? '' };
  const slots = new Map<string, Media | Chart>();
  const bind = (path: string, value: Media | Chart) => {
    slots.set(path, value);
    return value.id;
  };
  function data() {
    switch (t.kind) {
      case 'section.left': return { ...fields, no: t.no ?? '', en: '', desc: t.desc };
      case 'market.bars': {
        capacity(t.kind,t.series.length,2,10);
        capacity(t.kind,t.findings?.length ?? 0,0,3);
        if(t.series.some(row=>!String(row.value).trim() || !Number.isFinite(Number(row.value)))) throw Error('市场柱形图需要有据的数值');
        return {...fields,sub:t.sub,source:t.source ?? '',chartTitle:t.chartTitle ?? '',series:t.series,findings:t.findings ?? []};
      }
      case 'competitor.table': {
        capacity(t.kind,t.headers.length,1,4);
        capacity(t.kind,t.rows.length,2,6);
        const cells=['a','b','c','e'];
        return {...fields,sub:t.sub,selfFirst:false,h0:'对照对象',
          ...Object.fromEntries(cells.map((_,i)=>['h'+(i+1),t.headers[i] ?? ''])),
          rows:t.rows.map(row=>{
            if(row.values.length!==t.headers.length) throw Error('竞品表格的比较项未对齐');
            return {name:row.name,...Object.fromEntries(row.values.map((value,i)=>[cells[i],value]))};
          })};
      }
      case 'persona.single': return {...fields,name:t.name,profile:t.profile,img:t.image?bind('img',t.image):null,
        quote:t.quote ?? '',tags:t.tags ?? '',needs:(t.needs ?? []).map(value=>({t:value})),pains:(t.pains ?? []).map(value=>({t:value}))};
      case 'selling.spec': capacity(t.kind,t.specs.length,0,6); return {...fields,usp:t.usp,specs:t.specs,img:t.image?bind('img',t.image):null};
      case 'summary.pillars': capacity(t.kind,t.points.length,2,4); return {...fields,points:t.points,sub:'',highlight:false};
      case 'mood.split': return {...fields,slogan:t.slogan,sub:t.sub,en:t.en ?? '',img:bind('img',t.image)};
      case 'series.row': capacity(t.kind,t.items.length,2,6); return {...fields,sub:t.sub,ratio:t.ratio ?? '',names:true,
        items:t.items.map((item,i)=>({name:item.name,img:bind('items.'+i+'.img',item.image)}))};
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
      case 'cover.type': case 'closing.type': return { ...fields, kicker: d.eyebrow, sub: t.sub, meta: t.meta };
      case 'contents.list': capacity(t.kind, t.items.length, 1, 8); return {
        ...fields, en: '', auto: false,
        items: t.items.map(item => ({ t: item.title, en: 'P' + String(item.page).padStart(2, '0') }))
      };
      case 'design.half': case 'design.stage': capacity(t.kind, t.points.length, 0, 4); return { ...fields, intro: t.intro, points: t.points, img: bind('img', t.image), fit: 'contain' };
    }
  }
  return { slide: { id: d.id, type, tone: t.kind === 'section.left' || t.kind === 'summary.question' || t.kind === 'closing.type' ? 'brand' : 'light', data: data() }, slots };
}
