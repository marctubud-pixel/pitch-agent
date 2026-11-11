import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n';
import { ServiceProvider } from '../../app/services';
import { LocalIntakeService } from '../../services/intake/LocalIntakeService';
import { MockAssistantService } from '../../services/mock/MockAssistantService';
import { MockProposalService } from '../../services/proposal/MockProposalService';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { ChartEvidence, QingyuR2View } from './QingyuR2View';
import { parseQingyuR2, r2Value } from './report-r2';

function datum(id: string, value: number, unit: string) {
  return { id, text: `${id}测试事实，仅在测试使用`, value, unit, basis: '测试定义', limits: '测试数据不得用于正文', sourceIds: ['S'], derivedFrom: [], locator: '测试定位', scope: { market: '测试市场', period: '测试期', population: '测试样本' }, evidenceType: 'published-report' };
}
function ref(datumId: string) { return { datumId, valuePath: null }; }
export function fixture() {
  return {
    schemaVersion: 2, id: 'qingyu-packaging-public-report-r2-20261109',
    revision: { number: 2, basedOnBriefVersion: 1, storedArtifactId: 'art-qingyu-research-v1', authoredAt: '2026-11-09', skillId: 'design-research-lead', skillRevision: 'test-only' },
    title: '测试报告', subtitle: '单测夹具', asOf: '2026-11-09', status: '研究待补', lead: '仅供解析验证', scopeNote: '不得进入可见报告',
    sources: [{ id: 'S', title: '测试来源', publisher: '测试机构', url: 'https://example.com/test', published: null, dataPeriod: null, market: '测试', population: '测试', method: '测试', access: '测试', locator: '测试页', use: null }],
    datums: [datum('metric', -5, '亿元'), datum('price', 6, '元'), datum('capacity', 480, 'ml'), datum('count', 1, '瓶'), datum('other-price', 8, '元'), datum('other-capacity', 300, 'ml')],
    findings: [{ id: 'F', title: '测试发现', text: '测试', datumIds: ['metric'], sourceIds: ['S'], locator: '测试页', scope: '测试范围', kind: 'research-synthesis', implication: '测试意义' }],
    gaps: [{ id: 'G', title: '测试缺口', text: '测试待补', scope: '补查范围', consequence: '不可外推', sourceIds: ['S'], locator: '待补范围', status: '待补' }],
    sections: ['market', 'people', 'competition', 'product', 'conclusion'].map(id => ({ id, title: id, headline: '测试标题', conclusion: '测试结论', findingIds: ['F'], datumIds: ['metric'], chartIds: id === 'market' ? ['chart'] : [], caseIds: id === 'competition' ? ['case-a'] : [], gapIds: ['G'], footnote: '测试边界' })),
    charts: [{ id: 'chart', type: 'metrics', title: '测试负值指标', metricLabel: '测试金额变化', unit: '亿元', period: '测试期', comparison: '同比测试基期', channel: '测试渠道', population: '测试样本', sourceIds: ['S'], scope: '测试范围', caption: '不代表份额', locator: '测试页', rows: [{ label: '测试行', value: -5, ...ref('metric') }] }],
    questions: ['M1', 'M2', 'P1', 'P2', 'C1', 'C2', 'C3', 'R1', 'S1'].map(id => ({ id, question: `测试问题${id}`, answerStatus: id === 'P2' ? 'partial' : 'answered', answer: '测试回答', findingIds: ['F'], datumIds: ['metric'], gapIds: ['G'] })),
    skus: [{ id: 'sku-a', title: '测试茶', category: 'strict-tea', categoryLabel: '无糖茶', capacity: ref('capacity'), packCount: ref('count'), datumIds: ['price', 'capacity', 'count'] }, { id: 'sku-b', title: '测试邻近品类', category: 'adjacent', categoryLabel: '邻近品类', capacity: ref('other-capacity'), packCount: ref('count'), datumIds: ['other-price', 'other-capacity', 'count'] }],
    priceScope: '单测采样范围',
    prices: [{ id: 'quote-a', skuId: 'sku-a', quotedAt: '测试报价期', publishedAt: null, readAt: '2026-11-09', channel: '测试渠道', conditions: '测试条件', sourceId: 'S', locator: '测试定位', kind: 'priced', price: ref('price'), currency: 'CNY', priceNature: 'brand-reported-launch' }],
    imageManifest: [{ id: 'image-a', caseId: 'case-a', path: '/research-case/qingyu-pack-r2-20261109/test.png', sha256: '0'.repeat(64), sourceId: 'S', identityLabel: '单测图片', alt: '单测图片' }],
    cases: [{ id: 'case-a', title: '测试茶包装', skuId: 'sku-a', imageId: 'image-a', priceQuoteIds: ['quote-a'], sourceIds: ['S'], datumIds: ['capacity'], observation: '测试观察', comparisonUse: '测试用途', scope: '测试范围', locator: '测试定位', limits: '测试限制', transfer: null }],
    evidenceNotes: { defaultCollapsed: true, label: '测试方法', methodology: ['测试'], methodReferenceDatumIds: [], correctionsApplied: [], priorChecks: [] },
  };
}

describe('revision 2 boundary', () => {
  it('supports signed metrics and datum-linked capacity with no fixed legacy fact IDs', () => {
    const parsed = parseQingyuR2(fixture());
    if (parsed.kind !== 'valid') throw new Error(parsed.message);
    expect(r2Value(parsed.report, parsed.report.charts[0].rows[0])).toBe(-5);
    expect(parsed.report.skus[0].capacity).toEqual(ref('capacity'));
    expect(parsed.report.questions).toHaveLength(9);
  });
  it.each(['wrong-value', 'wrong-unit', 'unknown-ref', 'negative-bar', 'zero-price', 'foreign-price', 'foreign-capacity', 'foreign-quote', 'foreign-image', 'image-source', 'wrong-revision', 'missing-question', 'partial-without-gap', 'stacked-chart'])('rejects %s', mutation => {
    const input = fixture();
    if (mutation === 'wrong-value') input.charts[0].rows[0].value = 3;
    if (mutation === 'wrong-unit') input.charts[0].unit = '%';
    if (mutation === 'unknown-ref') input.charts[0].rows[0].datumId = 'missing';
    if (mutation === 'negative-bar') input.charts[0].type = 'bar';
    if (mutation === 'zero-price') input.datums[1].value = 0;
    if (mutation === 'foreign-price') input.prices[0].price = ref('other-price');
    if (mutation === 'foreign-capacity') input.skus[0].capacity = ref('other-capacity');
    if (mutation === 'foreign-quote') input.prices[0].skuId = 'sku-b';
    if (mutation === 'foreign-image') input.imageManifest[0].path = '/research-case/qingyu-pack-20261109/moli.png';
    if (mutation === 'image-source') input.imageManifest[0].sourceId = 'missing';
    if (mutation === 'wrong-revision') input.revision.number = 1;
    if (mutation === 'missing-question') input.questions.pop();
    if (mutation === 'partial-without-gap') input.questions[3].gapIds = [];
    if (mutation === 'stacked-chart') input.charts[0].type = 'stacked-bar';
    expect(parseQingyuR2(input).kind).toBe('invalid');
  });
  it('keeps missing price as an explicit unknown variant and rejects a hidden numeric amount', () => {
    const input = fixture(); const first = input.prices[0];
    const { price: _price, currency: _currency, ...base } = first;
    const unknown = { ...base, kind: 'unknown', priceNature: 'unknown', reason: '来源未提供标价' };
    expect(parseQingyuR2({ ...input, prices: [unknown] }).kind).toBe('valid');
    expect(parseQingyuR2({ ...input, prices: [{ ...unknown, price: ref('price') }] }).kind).toBe('invalid');
  });
  it('requires a transfer boundary for an adjacent category case', () => {
    const input = fixture(); input.cases[0].skuId = 'sku-b'; input.cases[0].priceQuoteIds = [];
    expect(parseQingyuR2(input).kind).toBe('invalid');
  });
  it('keeps an explicit numeric object path and rejects inherited or missing values', () => {
    const input = fixture(); const first = input.datums[0];
    const datums = [{ ...first, value: { yoy: -5 } }, ...input.datums.slice(1)];
    const rows = [{ ...input.charts[0].rows[0], valuePath: 'yoy' }];
    const parsed = parseQingyuR2({ ...input, datums, charts: [{ ...input.charts[0], rows }] });
    expect(parsed.kind).toBe('valid');
    expect(parseQingyuR2({ ...input, datums, charts: [{ ...input.charts[0], rows: [{ ...rows[0], valuePath: 'missing' }] }] }).kind).toBe('invalid');
  });
});

function renderReport(input: unknown, chartEvidence = false) {
  const parsed = parseQingyuR2(input);
  if (parsed.kind !== 'valid') throw new Error(parsed.message);
  const store = memoryStore(); const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const children = createElement(I18nProvider, { children: chartEvidence ? createElement(ChartEvidence, { report: parsed.report, chart: parsed.report.charts[0] }) : createElement(QingyuR2View, { report: parsed.report, historical: false, latestBriefVersion: 1 }) });
  return renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children }));
}

describe('revision 2 visible units and quote identity', () => {
  it('shows signed metrics with their actual unit and explicit comparison metadata', () => {
    const html = renderReport(fixture());
    expect(html).toContain('-5<small>亿元</small>');
    expect(html).not.toContain('-5<small>%</small>');
    expect(html).toContain('比较口径 同比测试基期');
    expect(html).toContain('渠道 测试渠道');
    expect(html).toContain('480ml/瓶');
    expect(html).not.toContain('500ml/瓶');
  });
  it('shows raw bundle price and same-SKU per-bottle arithmetic without a normalized ticket price', () => {
    const input = fixture(); input.datums[1].value = 120; input.datums[3].value = 15;
    const html = renderReport(input);
    expect(html).toContain('¥120/15瓶装');
    expect(html).toContain('折合 ¥8/瓶');
    expect(html).toContain('原包装总价÷15瓶');
    expect(html).not.toContain('¥8/500ml');
    expect(html).toContain('品牌自述历史单价');
    expect(html).toContain('原文发布 页面未标日期');
  });
  it('uses a visible 0 to 100 percent scale and exposes each object-backed chart value', () => {
    const input = fixture();
    const datums = [{ ...input.datums[0], value: { earlier: 28.2, later: 38.4 }, unit: '%' }, ...input.datums.slice(1)];
    const rows = [{ label: '2023年', value: 28.2, datumId: 'metric', valuePath: 'earlier' }, { label: '2025年', value: 38.4, datumId: 'metric', valuePath: 'later' }];
    const next = { ...input, datums, charts: [{ ...input.charts[0], type: 'bar', unit: '%', rows }] };
    const html = renderReport(next);
    expect(html).toContain('横轴 0%至100%');
    expect(html).toContain('width:38.4%');
    const evidence = renderReport(next, true);
    expect(evidence).toContain('2023年');
    expect(evidence).toContain('28.2 %');
    expect(evidence).toContain('2025年');
    expect(evidence).toContain('38.4 %');
  });
  it('shows an unknown price without a fabricated zero and separates adjacent category samples', () => {
    const input = fixture(); const { price: _price, currency: _currency, ...base } = input.prices[0];
    const unknown = { ...base, id: 'quote-b', skuId: 'sku-b', kind: 'unknown', priceNature: 'unknown', reason: '来源未提供标价' };
    const html = renderReport({ ...input, prices: [input.prices[0], unknown] });
    expect(html).toContain('邻近品类参照 · 不计入无糖茶样本');
    expect(html).toContain('价格未核实');
    expect(html).toContain('来源未提供标价');
    expect(html).not.toContain('¥0');
    expect(html).toContain('data-price-category="strict-tea"');
    expect(html).toContain('data-price-category="adjacent"');
  });
});
