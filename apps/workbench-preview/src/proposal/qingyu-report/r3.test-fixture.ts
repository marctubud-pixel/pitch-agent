import { R3_ADOPTION_SHA, type QingyuR3Report, type R3Chapter } from './report-r3';

export function r3TestFixture(): QingyuR3Report {
  const chapter = (id: R3Chapter['id']): R3Chapter => ({ id, title: `测试章 ${id}`, headline: '测试结论，非业务研究', summary: '测试范围', findingIds: ['finding-fixture'], gapIds: ['gap-fixture'], blocks: [{ id: `${id}-fixture-card`, title: '测试分类', subtitle: '', scope: '测试范围', caveat: '', factIds: [], findingIds: [], gapIds: [], method: '测试方法', kind: 'cards', items: [{ label: '测试分类', factIds: ['fact-fixture-a'], findingIds: ['finding-fixture'], gapIds: ['gap-fixture'] }] }] });
  const report: QingyuR3Report = {
    schemaVersion: 3, id: 'qingyu-packaging-public-report-r3-20261109', binding: { briefVersion: 1, storedArtifactId: 'art-qingyu-research-v1' }, origin: { skillRevision: 'r5-20261109', adoptionSha256: R3_ADOPTION_SHA, branchReceiptPaths: ['fixture-only'] }, title: '单测夹具，非业务报告', subtitle: '测试用', asOf: '2026-11-09', status: '研究待补', lead: '仅用于测试', scopeNote: '不得用于真实研究结论',
    sources: [{ id: 'source-fixture', title: '测试来源', publisher: '测试', url: 'https://example.com/test', published: null, dataPeriod: '测试期', market: '测试市场', population: '测试对象', method: '测试方法', access: '测试读取', locator: '测试定位', limits: '非真实研究' }],
    facts: [{ id: 'fact-fixture-a', text: '测试量A', sourceIds: ['source-fixture'], locator: '测试定位', scope: '同口径测试期', limits: '非业务事实', evidenceType: 'published-report', quantity: { value: 12.5, unit: '%', basis: '测试同口径' }, derivedFrom: [] }, { id: 'fact-fixture-b', text: '测试量B', sourceIds: ['source-fixture'], locator: '测试定位', scope: '同口径测试期', limits: '非业务事实', evidenceType: 'published-report', quantity: { value: 25, unit: '%', basis: '测试同口径' }, derivedFrom: [] }],
    findings: [{ id: 'finding-fixture', title: '测试判断', text: '非业务判断', factIds: ['fact-fixture-a'], sourceIds: ['source-fixture'], scope: '测试范围', limits: '非真实研究', kind: 'synthesis' }], gaps: [{ id: 'gap-fixture', title: '测试缺口', text: '真实资料待补', consequence: '不得推断' }], media: [], chapters: ['market', 'people', 'competition', 'product', 'conclusion'].map(id => { if (id !== 'market' && id !== 'people' && id !== 'competition' && id !== 'product' && id !== 'conclusion') throw new Error('fixture chapter'); return chapter(id); }),
  };
  report.chapters[0]?.blocks.push({ id: 'fixture-chart', title: '测试数字图', subtitle: '', scope: '同口径测试期', caveat: '非实测业务资料', factIds: [], findingIds: [], gapIds: [], method: '测试方法', kind: 'chart', chartType: 'bar', unit: '%', rows: [{ label: '测试A', factId: 'fact-fixture-a' }, { label: '测试B', factId: 'fact-fixture-b' }] });
  return report;
}
