import type { ArtSpec, LayoutStyle, Proposal } from '../../domain/proposal';
import { artBox } from '../../ui/art/Art';
import { rasterize } from '../artwork';
import { fraction, directionArts } from '../Slide';
import { compile } from './engine';
import type { Chart, Deck, Draft, Media, Template, Theme } from './model';

import { StudioIssue } from './errors';
export function proposalReady(p: Proposal) {
  return Boolean(p.layout?.slides.length && p.layout.styles.some(s => s.id === p.layout?.chosen) && !['not_started', 'in_progress'].includes(p.stages.layout.status));
}
const styleMap = { editorial: 'editorial', cobalt: 'modern', studio: 'business', poster: 'bold', gallery: 'elegant' } satisfies Record<LayoutStyle['id'], Theme['style']>;
const labels = {
  cover: '封面',
  question: '提案问题',
  insight: '研究观察',
  data: '模拟数据',
  conclusion: '研究结论',
  strategy: '策略',
  theme: '创意主题',
  visual: '主视觉',
  mockup: '应用示意',
  comparison: '方向比较',
  recommendation: '提案建议',
  closing: '结语'
};
const reviewStatus = (p: Proposal) => p.stages.delivery.status === 'done' ? '依当前终审记录' : p.stages.delivery.status === 'needs_revision' ? '终审待修改' : '待人工终审';
export async function prepareProposalDeck(p: Proposal, style: LayoutStyle, signal: AbortSignal): Promise<Deck> {
  signal.throwIfAborted();
  const layout = p.layout;
  if (!layout || !proposalReady(p)) throw new StudioIssue('not-ready', '尚无可供排版导出的本案提案。');
  const st = layout.styles.find(s => s.id === style.id);
  if (!st || JSON.stringify(st) !== JSON.stringify(style)) throw new StudioIssue('style', '版式不属于当前提案。');
  const dirs = p.themes?.directions ?? [], arts = directionArts(layout.slides), status = reviewStatus(p), statusLabel = '本地工程模拟 · ' + status;
  const artworks = new Map<string, Media>();
  const picture = async (spec: ArtSpec) => {
    const key = JSON.stringify(spec), previous = artworks.get(key);
    if (previous) return previous;
    const ratio = artBox(spec), width = 1000, height = Math.round(width * ratio[1] / ratio[0]);
    const data = await rasterize(spec, ratio, width, undefined, st.palette.paper);
    signal.throwIfAborted();
    const image = { id: 'art-' + (artworks.size + 1), data, width, height, alt: p.client + ' · 生成作品示意' };
    artworks.set(key, image);
    return image;
  };
  const drafts: Draft[] = [];
  for (const s of layout.slides) {
    signal.throwIfAborted();
    const dir = dirs.find(d => d.id === s.directionId), eyebrow = [labels[s.kind], dir?.name].filter(Boolean).join(' · ');
    let template: Template, derived: string | undefined;
    if (s.kind === 'data') {
      const frac = fraction(s.bigNumber);
      let chart: Chart | undefined;
      if (s.chart) {
        const c = s.chart;
        if (!c.data.length || !c.data.every(d => Number.isFinite(d.value))) throw new StudioIssue('content', '图表数据不完整');
        chart = {
          id: c.id,
          kind: c.kind === 'timeline' ? 'line' : 'bar',
          title: c.title,
          unit: '',
          basis: c.measure,
          labels: c.data.map(d => d.label),
          values: c.data.map(d => d.value),
          min: Math.min(0, ...c.data.map(d => d.value)),
          max: Math.max(1, ...c.data.map(d => d.value))
        };
      }
      else if (frac) {
        const [part, total] = frac;
        chart = {
          kind: 'bar',
          id: s.id + '/fraction',
          title: '模拟样本与其中符合描述的数量',
          basis: s.notes,
          labels: ['其中符合描述', '样本总数'],
          values: [part, total],
          unit: p.workbenchId === 'northline' ? '人' : '个',
          min: 0,
          max: total
        };
        derived = `从原稿 ${s.bigNumber} 读取分子和分母，两项不相加。`;
      }
      template = chart ? { kind: 'data.hero', stats: [{ value: s.bigNumber ?? '', unit: '', label: s.lead }], sub: s.support, chart } : { kind: 'summary.statement', statement: s.bigNumber ?? s.lead, sub: [s.lead, s.support].join('。') };
    } else if (s.kind === 'comparison' && dirs.length >= 2) {
      if (dirs.every(d => arts[d.id])) {
        const items = await Promise.all(dirs.map(async d => {
          const spec = arts[d.id];
          if (!spec) throw new StudioIssue('content', '缺少方向作品');
          return { image: await picture(spec), name: d.id + ' · ' + d.name, desc: d.slogan + '\n' + d.difference };
        }));
        template = { kind: 'compare.lineup', items, sub: s.support };
      } else template = { kind: 'summary.list', points: dirs.map(d => ({ k: d.id + ' · ' + d.name, d: d.slogan + '　' + d.difference })) };
    } else if (s.art) {
      const image = await picture(s.art);
      template = s.kind === 'cover' ? { kind: 'cover.split', sub: s.support, meta: statusLabel, image } : { kind: s.kind === 'visual' || s.kind === 'mockup' ? 'design.stage' : 'design.half', image, intro: s.support, points: [] };
    } else template = { kind: s.kind === 'question' ? 'summary.question' : 'summary.statement', statement: s.lead, sub: s.support };
    drafts.push({
      id: s.id,
      title: s.lead,
      eyebrow: s.kind === 'comparison' ? s.support : eyebrow,
      chapter: s.kind,
      caption: s.notes,
      notes: JSON.stringify({
        project: p.id,
        revision: p.revision,
        layoutStyle: st.id,
        review: statusLabel,
        slide: s,
        ...(s.kind === 'comparison' ? { directions: dirs.map(({ id, name, slogan, difference }) => ({ id, name, slogan, difference })) } : {}),
        derived
      }),
      template
    });
  }
  return {
    title: p.name,
    status: statusLabel,
    style: st.id,
    fileName: p.name + '_' + st.name + '_' + status + '.pptx',
    pages: compile(drafts, p.client + ' · ' + statusLabel, { style: styleMap[st.id], primary: st.palette.accent, accent: st.palette.highlight ?? st.palette.ink, mode: 'light' })
  };
}
