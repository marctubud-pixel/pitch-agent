import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { qingyuR2Report } from '../qingyu-report/bundle-r2';
import { qingyuR4Report } from '../qingyu-report/bundle-r4';
import { northline } from '../../services/proposal/fixtures/northline';
import { prepareResearchDeck, prepareProposalDeck, priceSnapshot, exportDeckStudio, type Deck } from './index';
import { compile, checkedNodes } from './engine';
import type { Chart, Draft, Media } from './model';

function input() {
  if (qingyuR4Report.kind !== 'valid' || qingyuR2Report.kind !== 'valid') throw new Error('Fixture invalid');
  return { report: qingyuR4Report.report, prices: qingyuR2Report.report, historical: false, latestBriefVersion: 1 };
}
const ctrl = () => new AbortController();
const native = process.env.DECK_STUDIO_CANVAS, output = process.env.DECK_STUDIO_OUTPUT;
const theme = { primary: '#002FA7', accent: '#112233', style: 'business', mode: 'light' } as const;
function run(t: Draft['template']) {
  return compile([{ id: 'test', template: t, notes: '', caption: '', chapter: 'test', title: '测试图版', eyebrow: '' }], '本地', theme)[0];
}
const chart: Chart = { kind: 'bar', id: 'charted', title: '计数', basis: '', unit: '', min: 0, max: 2, labels: ['甲', '乙'], values: [1, 2] };
const image: Media = { id: 'image', width: 2, height: 1, alt: '原图', data: 'data:image/png;base64,abc' };
beforeEach(() => {
  if (native) createRequire(import.meta.url)('../../../scripts/deck-studio-probe.cjs')(native);
  else {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ measureText: (ch: string) => ({ width: /[ -~]/.test(ch) ? 50 : 100 }) }) }) });
    vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(new URL('../../../public' + new URL(url).pathname, import.meta.url))));
  }
});
afterEach(() => vi.unstubAllGlobals());
async function artifact(deck: Deck) {
  const b = await exportDeckStudio(deck, ctrl().signal), bytes = new Uint8Array(await b.arrayBuffer());
  if (output) writeFileSync(join(output, deck.style + '.pptx'), bytes);
  return unzipSync(bytes);
}
describe('shared measured Deck Studio plans', () => {
  it('rejects silently truncated layouts and checks rich number/unit runs', () => {
    const stat = { value: '12.16', unit: '%', label: '销售额同比' }, t = { kind: 'data.hero', stats: [stat], chart, sub: '' } as const;
    expect(() => run({ ...t, stats: [] })).toThrow(/可容纳/);
    expect(() => run({ ...t, stats: Array(5).fill(stat) })).toThrow(/可容纳/);
    expect(run({ ...t, stats: Array(4).fill(stat) }).nodes.filter(n => n.kind === 'text' && n.runs.length)).toHaveLength(4);
    for (const length of [0, 1, 7]) expect(() => run({ kind: 'compare.lineup', items: Array(length).fill({ name: '样品', desc: '', image }), sub: '' })).toThrow(/可容纳/);
  });
  it('replaces only the complete image bind and refuses missing, duplicate or unknown output', () => {
    const p = run({ kind: 'combo.grid', items: [{ item: image, cap: '原图' }, { item: chart, cap: '实际计数' }] });
    expect(p.nodes.filter(n => n.kind === 'image' || n.kind === 'chart').map(n => [n.kind, n.bind])).toEqual([['image', 'items.0.img'], ['chart', 'items.1.img']]);
    const shape = { k: 'image', id: 'charted', bind: 'img', x: 0, y: 0, w: 10, h: 10 };
    for (const els of [[], [shape, shape], [{ ...shape, bind: 'other' }], [{ k: 'unrecognized' }]]) expect(() => checkedNodes({ bg: '#FFFFFF', th: { text: '#111111' }, els }, new Map([['img', chart]]), '#002FA7')).toThrow();
  });
  it('keeps exact prices, original quantities, quote conditions and the unknown SKU', () => {
    const a = priceSnapshot(input().prices);
    expect(a.chart.points).toHaveLength(12);
    expect(a.chart.groups.map(g => a.chart.points.filter(p => p.group === g).length)).toEqual([6, 2, 4]);
    expect(a.chart.points.find(p => p.id === 'CP01')?.value).toBe(34.9 / 15);
    expect(a.chart.points.find(p => p.id === 'CP06')?.value).toBe(8.4 / 2);
    expect(a.records.find(r => r.quote.kind === 'unknown')?.perBottle).toBeNull();
    expect(a.chart.points.every(pt => pt.value > 0)).toBe(true);
  });
  it('exports the research source identities, native chart ranges, repeated scatter and exact images', async () => {
    const data = input(), deck = await prepareResearchDeck(data, ctrl().signal);
    const pack = deck.pages.find(p => p.template === 'compare.lineup');
    expect(pack?.nodes.filter(n => n.kind === 'image').map(n => n.image.id)).toEqual(['C-A01', 'C-A02', 'C-A03', 'C-A04']);
    const notes = deck.pages.map(p => p.notes).join('');
    for (const item of [...data.report.sources, ...data.report.facts, ...data.report.findings, ...data.report.gaps]) expect(notes).toContain(JSON.stringify(item));
    const zip = await artifact(deck);
    const files = Object.keys(zip), charts = files.filter(f => /^ppt\/charts\/chart\d+\.xml$/.test(f)), books = files.filter(f => f.endsWith('.xlsx'));
    expect(charts).toHaveLength(3);
    expect(books).toHaveLength(3);
    const scatter = charts.map(path => strFromU8(zip[path])).find(x => x.includes('<c:scatterChart>'));
    expect(scatter).toBeDefined();
    const series = scatter?.match(/<c:ser>[\s\S]*?<\/c:ser>/g) ?? [];
    expect(series.map(s => (s.match(/<c:yVal>([\s\S]*?)<\/c:yVal>/)?.[1].match(/<c:pt idx=/g) ?? []).length)).toEqual([6, 2, 4]);
    expect(scatter).toContain('<c:v>' + 34.9 / 15 + '</c:v>');
    expect(scatter).toContain('<c:v>4.2</c:v>');
    const sha = files.filter(f => /^ppt\/media\/[^/]+$/.test(f)).map(f => createHash('sha256').update(zip[f]).digest('hex'));
    expect(data.report.media.every(m => sha.includes(m.sha256))).toBe(true);
    // The library numbers charts globally, so a second export must resolve its own relationships.
    expect((await exportDeckStudio(deck, ctrl().signal)).size).toBeGreaterThan(1000);
  }, 30000);
  it('refuses incomplete media, stale data and cancellation', async () => {
    const b = ctrl();
    b.abort();
    await expect(prepareResearchDeck(input(), b.signal)).rejects.toThrow();
    const bad = structuredClone(input());
    bad.report.facts[0].sourceIds = ['foreign'];
    await expect(prepareResearchDeck(bad, ctrl().signal)).rejects.toThrow(/完整性/);
    vi.stubGlobal('fetch', async () => new Response('bad'));
    await expect(prepareResearchDeck(input(), ctrl().signal)).rejects.toThrow(/图片身份/);
  });
  it('blocks future/empty layouts and unauthorized style identities before rendering', async () => {
    const p = structuredClone(northline);
    if (!p.layout) throw new Error('Missing fixture');
    const st = p.layout.styles[0];
    await expect(prepareProposalDeck(p, { ...st, name: 'foreign' }, ctrl().signal)).rejects.toMatchObject({ code: 'style' });
    p.stages.layout.status = 'not_started';
    await expect(prepareProposalDeck(p, st, ctrl().signal)).rejects.toMatchObject({ code: 'not-ready' });
    p.layout = null;
    await expect(prepareProposalDeck(p, st, ctrl().signal)).rejects.toMatchObject({ code: 'not-ready' });
  });
  it.skipIf(!native)('exports the complete sixteen-page engineering case in each supplied style', async () => {
    const p = northline;
    if (!p.layout) throw new Error('Missing layout');
    for (const st of p.layout.styles) {
      const deck = await prepareProposalDeck(p, st, ctrl().signal);
      expect(deck.style).toBe(st.id);
      expect(deck.pages.map(s => s.id)).toEqual(p.layout.slides.map(s => s.id));
      expect(deck.status).toContain('待人工终审');
      const zip = await artifact(deck);
      expect(Object.keys(zip).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(16);
      expect(Object.keys(zip).filter(f => f.endsWith('.xlsx'))).toHaveLength(1);
      const chart = Object.keys(zip).find(f => /^ppt\/charts\/chart\d+\.xml$/.test(f));
      expect(strFromU8(zip[chart ?? ''])).toContain('<c:v>9</c:v>');
    }
  }, 90000);
});

describe('nightflight production page-template adapters', () => {
  const media={...image,data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'};
  const points=[{k:'原料',d:'燕麦'},{k:'触点',d:'便利店'}];
  const templates: Draft['template'][]=[
    {kind:'section.left',no:'02',desc:'阶段判断'},
    {kind:'market.bars',series:[{label:'甲',value:42},{label:'乙',value:48}],sub:'渠道变化',source:'样本报告',unit:'%',chartTitle:'单位：%'},
    {kind:'competitor.table',headers:['图形'],rows:[{name:'甲',values:['蓝岩']},{name:'乙',values:['水流']}],sub:'瓶身对照'},
    {kind:'persona.single',name:'通勤者',profile:'在冰柜前选择早餐',needs:['看懂配料']},
    {kind:'selling.spec',usp:'四项原料',specs:[{k:'容量',v:'250ml'}]},
    {kind:'summary.pillars',points},
    {kind:'design.half',image:media,intro:'正面方案',points},
    {kind:'mood.split',image:media,slogan:'山间来水',sub:'场景'},
    {kind:'series.row',items:[{name:'海报一',image:media},{name:'海报二',image:{...media,id:'two'}}],sub:'触点'},
  ];
  it('exports native text and verified pictures for every requested template', async()=>{
    const pages=templates.map((t,i)=>({...run(t),id:'template-'+i}));
    const files=await artifact({pages,status:'试排',style:'business',title:'模板核验',fileName:'模板.pptx'});
    const chartKey=Object.keys(files).find(key=>/^ppt\/charts\/chart\d+\.xml$/.test(key))!;
    const nativeChart=strFromU8(files[chartKey]);
    expect(nativeChart).toContain('<c:barDir val="col"/>');
    expect(nativeChart).toContain('<c:v>42</c:v>');
    expect(nativeChart).toContain('<c:v>48</c:v>');
    expect(nativeChart).toContain('测试图版（%）');
    const workbook=unzipSync(files[Object.keys(files).find(key=>key.startsWith('ppt/embeddings/') && key.endsWith('.xlsx'))!]);
    const sheet=strFromU8(workbook['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('<v>42</v>');
    expect(sheet).toContain('<v>48</v>');
    expect(strFromU8(workbook['xl/sharedStrings.xml'])).toContain('测试图版（%）');
    const personaText=pages[3].nodes.filter(n=>n.kind==='text').flatMap(n=>n.lines);
    expect(personaText).not.toContain('痛点');
    expect(pages[3].nodes.some(n=>n.kind==='text' && n.lines.includes('通勤者') && n.x===80)).toBe(true);
    const samples=['阶段判断','渠道变化','蓝岩','通勤者','四项原料','燕麦','正面方案','山间来水','海报一'];
    for (const [i,page] of pages.entries()) {
      expect(page.template).toBe(templates[i].kind);
      const xml=strFromU8(files['ppt/slides/slide'+(i+1)+'.xml']);
      expect(xml).toContain(samples[i]);
      if(i>=6) expect(xml).toContain('<p:pic>');
    }
  });

  it.each(['gradient','vertical','highlight','rotate','font'] as const)('preserves %s in editable PPTX and SVG',async style=>{
    const raw=style==='gradient'
      ? {k:'rect',x:1,y:2,w:200,h:80,fill:'#884422',grad:{from:'#884422',to:'#551177',ang:45}}
      : {k:'text',x:20,y:25,w:300,h:200,fk:'serif',fw:700,size:32,lh:1.3,ls:0,color:'#000000',align:'left',valign:'top',fitOk:true,
        lines:['泉水泡茶'],vertical:style==='vertical',rotate:style==='rotate'?23:0,...(style==='highlight'?{hl:'泉水',hlColor:'#123456'}:{})};
    const page={...run({kind:'summary.statement',statement:'模板',sub:''}),
      ...checkedNodes({els:[raw],bg:'#FFFFFF',th:{text:'#000000'}},new Map(),'#000000')};
    const files=await artifact({pages:[page],status:'试排',style:'business',title:'样式核验',fileName:'样式.pptx'});
    const xml=strFromU8(files['ppt/slides/slide1.xml']);
    const {renderToStaticMarkup}=await import('react-dom/server');
    const {createElement}=await import('react');
    const {DeckStudioPage}=await import('./Viewer');
    const svg=renderToStaticMarkup(createElement(DeckStudioPage,{page}));
    const markers={gradient:['<a:gradFill','<linearGradient'],vertical:['vert="eaVert"','writing-mode="vertical-rl"'],
      highlight:['val="123456"','fill="#123456"'],rotate:['rot="1380000"','rotate(23 '],font:['typeface="Noto Serif SC"','Noto Serif SC']};
    expect(xml).toContain(markers[style][0]);
    expect(svg).toContain(markers[style][1]);
  });
});
