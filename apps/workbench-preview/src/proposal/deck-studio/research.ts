import { loadR4Media } from '../qingyu-report/pptx-r4';
import { parseQingyuR4, r4ById, r4BoardEvidence, r4ChapterEvidence, r4ChartSeries, r4EvidenceText, r4Quantity, type QingyuR4Report, type R4Chart } from '../qingyu-report/report-r4';
import type { QingyuR2Report } from '../qingyu-report/report-r2';
import { StudioIssue } from './errors';
import { priceSnapshot } from './prices';
import { compile } from './engine';
import type { Chart, Deck, Draft, Media, Template } from './model';

export type ResearchInput = { report: QingyuR4Report; prices: QingyuR2Report; historical: boolean; latestBriefVersion: number | null; };
const fmt = (v: number) => String(v);
function researchChart(report: QingyuR4Report, c: R4Chart): Chart {
  const s = r4ChartSeries(report, c);
  return {
    ...s,
    id: c.id,
    kind: c.kind,
    title: c.title + '（' + c.unit + '）',
    basis: c.kind === 'bar' ? '2023年无糖茶样本自报，独立选项不相加；不代表购买效果。' : s.basis,
    min: 0,
    max: c.kind === 'bar' ? 100 : Math.ceil(Math.max(...s.values) / 10) * 10
  };
}
export async function prepareResearchDeck(input: ResearchInput, signal: AbortSignal): Promise<Deck> {
  signal.throwIfAborted();
  const { prices, historical, latestBriefVersion } = input;
  const parsed = parseQingyuR4(input.report);
  if (parsed.kind === 'invalid') throw new StudioIssue('content', '修订4未通过完整性检查：' + parsed.message);
  const r = parsed.report, price = priceSnapshot(prices);
  const images: Media[] = (await loadR4Media(r, signal)).map(({ id, data, media }) => ({ id, data, width: media.width, height: media.height, alt: media.title + ' · ' + media.identity }));
  signal.throwIfAborted();
  const drafts: Draft[] = [], history = historical ? `历史任务卡第1版 · 当前${latestBriefVersion === null ? '版本未取得' : '第' + latestBriefVersion + '版'}` : '任务卡第1版';
  const brand = `青屿包装研究 · 研究待补 · ${history}`;
  for (const chapter of r.chapters) for (const b of chapter.boards) {
    const evidence = r4BoardEvidence(r, b), conclusion = r4ById(r.findings, b.conclusionId);
    const base = {
      id: r.id,
      binding: r.binding,
      origin: r.origin,
      status: r.status,
      scope: r.scopeNote,
      historical,
      latestBriefVersion,
      chapter: chapter.id,
      board: b,
      evidence,
      chapterEvidence: r4ChapterEvidence(r, chapter),
      media: b.kind === 'people' ? r.media.filter(m => m.id === b.sceneId) : b.kind === 'packaging' ? r.media.filter(m => m.role === 'original-product') : []
    };
    const add = (title: string, template: Template, options: { id?: string; eyebrow?: string; caption?: string; notes?: unknown; } = {}) => drafts.push({
      id: options.id ?? b.id,
      title,
      eyebrow: options.eyebrow ?? chapter.title,
      chapter: chapter.id,
      template,
      caption: options.caption ?? [b.scope, b.caveat].join('。'),
      notes: JSON.stringify({ ...base, additional: options.notes })
    });
    switch (b.kind) {
      case 'market': {
        if (b.charts.length !== 1) throw new Error('市场图版需要唯一结构图');
        const q = r4Quantity(r, b.heroFactId);
        add('线下无糖茶销额继续增长', {
          kind: 'data.hero',
          stats: [{ value: fmt(q.value), unit: q.unit, label: r4ById(r.facts, b.heroFactId).text }],
          sub: q.basis + '。马上赢监测中国县级以上城市传统线下渠道；销额不等于销量或人数。机构同时报告头部集中度提高。',
          chart: researchChart(r, b.charts[0])
        });
        break;
      }
      case 'people': {
        add('工作时段与茶歇，接触条件不同', {
          kind: 'design.stage',
          image: r4ById(images, b.sceneId),
          intro: '持续工作与短暂茶歇，是两组不同的情景参照。不能拼成一个目标消费者的画像。',
          points: [{ k: '工作时段', d: ['R4P01', 'R4P02'].map(id => r4ById(r.facts, id).text.replace('工作时段子组：', '')).join('') }, { k: '工作间歇', d: ['R4P03', 'R4P04'].map(id => r4ById(r.facts, id).text.replace('工作间歇子组：', '')).join('') }, { k: '样本范围', d: '益普索2026包装饮料子组；子组人数与年龄交叉未公开。' }]
        }, { eyebrow: '人群与包装作用 · AI生成情境示意，非实拍、非研究样本' });
        add('茶味与无糖标识，是历史样本的信息诉求', { kind: 'upload.framed', chart: researchChart(r, b.chart) }, { id: b.chart.id, eyebrow: '人群与包装作用 · 亿欧2023年调研，总样本1,200人，题目有效分母未公开', caption: '三项可重叠，不相加；不是当前办公者审美偏好或购买效果。' });
        break;
      }
      case 'landscape': {
        add('七个品牌，用四种理由讲茶味', {
          kind: 'summary.list', points: b.groupFindingIds.map(id => {
            const f = r4ById(r.findings, id);
            return { k: f.title, d: f.text };
          })
        }, { eyebrow: '竞品与包装 · 公开表达分组，非市场份额' });
        add('十二条历史报价，按购买条件比较', { kind: 'upload.framed', chart: price.chart }, { id: '03-prices', eyebrow: '竞品与包装 · 修订2历史快照，非当前价格排名', caption: '原价／建议价、品牌投稿、促销分别阅读；来源及购买条件见明细。', notes: price.notes });
        break;
      }
      case 'packaging': {
        add('四件原包装，茶种与品牌如何分工', {
          kind: 'compare.lineup',
          sub: '四件原物料来自三品牌。看得见的设计差异，不等于已测消费者偏好。',
          items: b.samples.map(s => ({
            image: r4ById(images, s.mediaId),
            name: r4ById(r.media, s.mediaId).title,
            desc: r4EvidenceText(r, s.cells[0]).join('').replace(/([，；])/g, '$1\n')
          }))
        });
        break;
      }
      case 'conditions': {
        add('规格与资产有题设，产品理由待补', {
          kind: 'summary.list',
          points: b.items.map(i => ({
            k: i.label,
            d: [...i.briefFactIds.map(id => r4ById(r.facts, id).text), ...i.assessmentFindingIds.map(id => r4ById(r.findings, id).title + '。')].join('')
          }))
        });
        break;
      }
      case 'synthesis': {
        add('青屿能说清哪一种可证明的差别？', {
          kind: 'summary.list', points: b.links.map(l => {
            const f = r4ById(r.findings, l.findingId);
            return { k: f.title, d: f.text };
          })
        }, { eyebrow: '研究结论 · 定位与视觉方向留给策略', caption: conclusion.text });
        add('回答之前，先补四类依据', { kind: 'summary.list', points: r.gaps.map(g => ({ k: g.title, d: g.text })) }, { id: 'gaps', eyebrow: '研究结论 · 研究待补', caption: '尚未获得当前目标人群的实证、同期渠道价、本品事实及实际寻找与理解效果。' });
        break;
      }
    }
  }
  return {
    title: r.title,
    status: r.status,
    style: 'studio-research',
    fileName: '青屿_版式工坊图版_调研报告.pptx',
    pages: compile(drafts, brand, { primary: '#002FA7', accent: '#A9C545', style: 'business', mode: 'light' })
  };
}
