import { perBottlePrice } from '../qingyu-report/ChapterBoards';
import { r2Value, type QingyuR2Report } from '../qingyu-report/report-r2';
import { byId } from '../qingyu-report/report';
import { StudioIssue } from './errors';
import type { Chart, Point } from './model';

const groups = [
  { key: 'reported-price', label: '媒体原价／建议价' },
  { key: 'brand-reported-launch', label: '品牌投稿历史价' },
  { key: 'promotion', label: '历史促销' },
] as const;
export function priceSnapshot(report: QingyuR2Report) {
  if (report.id !== 'qingyu-packaging-public-report-r2-20261109' || report.revision.skillRevision !== 'r3-20261109' || report.revision.storedArtifactId !== 'art-qingyu-research-v1' || report.revision.basedOnBriefVersion !== 1) throw new StudioIssue('content', '历史报价身份不符');
  const records = report.prices.map(quote => {
    const sku = byId(report.skus, quote.skuId), ref = (x: typeof sku.capacity) => x ? r2Value(report, x) : null;
    return {
      quote,
      sku,
      source: byId(report.sources, quote.sourceId),
      amount: quote.kind === 'priced' ? r2Value(report, quote.price) : null,
      count: ref(sku.packCount),
      capacity: ref(sku.capacity),
      perBottle: perBottlePrice(report, quote),
      datums: sku.datumIds.map(id => byId(report.datums, id))
    };
  });
  const points: Point[] = groups.flatMap(group => records.filter(r => r.quote.priceNature === group.key).map(({ quote, sku, amount, count, capacity, perBottle }) => {
    if (perBottle === null || !Number.isFinite(perBottle) || perBottle <= 0 || count === null || !Number.isInteger(count) || count < 1) throw new Error('历史有价记录缺少有效换算依据');
    const spec = [capacity === null ? '容量未核' : capacity + 'ml', count > 1 ? `${count}瓶／${amount}元` : quote.id === 'CP18' ? '2025年4月限量' : quote.id === 'CP16' ? '味型同价未核' : ''].filter(Boolean).join(' · ');
    return {
      id: quote.id,
      label: sku.title.replace('，味型未指明', '（味型未明）').replace('（味型同价未核实）', '').replace(/ · \d+瓶装$/, ''),
      spec,
      group: group.label,
      value: perBottle
    };
  }));
  const unknown = records.filter(r => r.quote.kind === 'unknown');
  if (points.length !== 12 || unknown.length !== 1 || records.length !== 13 || new Set(points.map(p => p.id)).size !== 12) throw new Error('历史报价快照不完整');
  const target: [number, number] = [r2Value(report, { datumId: 'B-GIVEN', valuePath: '价格下限' }), r2Value(report, { datumId: 'B-GIVEN', valuePath: '价格上限' })];
  const chart: Chart = {
    kind: 'prices',
    id: 'R2-prices',
    title: '历史单瓶参照价（元／瓶）',
    points,
    groups: groups.map(g => g.label),
    target,
    unknown: unknown[0].sku.title + '：价格未知，不画点。'
  };
  return {
    chart,
    records,
    notes: { reportId: report.id, revision: report.revision, priceScope: report.priceScope, target: byId(report.datums, 'B-GIVEN'), records }
  };
}
