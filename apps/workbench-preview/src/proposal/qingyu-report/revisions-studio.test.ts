import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { ServiceProvider } from '../../app/services';
import { LocalIntakeService } from '../../services/intake/LocalIntakeService';
import { MockAssistantService } from '../../services/mock/MockAssistantService';
import { MockProposalService } from '../../services/proposal/MockProposalService';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { northline } from '../../services/proposal/fixtures/northline';
import { plumtide } from '../../services/proposal/fixtures/plumtide';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { DeliveryArea } from '../../views/project/DeliveryArea';
import { DeliveryStage } from '../../views/stages/DeliveryStage';
import { prepareResearchDeck, type Deck } from '../deck-studio';
import { resolveQingyuCase, type QingyuResolution } from './binding';
import { qingyuR2Report } from './bundle-r2';
import { qingyuR4Report } from './bundle-r4';
import { QingyuReportRevisions } from './QingyuReportRevisions';

let preparedDeck: Deck | null = null;
let preparationError: string | null = null;
vi.mock('../deck-studio-ui', async importOriginal => {
  const actual = await importOriginal<typeof import('../deck-studio-ui')>();
  return { ...actual, useStudioPreparation: () => ({ state: preparationError ? { kind: 'error', message: preparationError } : preparedDeck ? { kind: 'ready', value: preparedDeck } : { kind: 'loading' }, retry: () => {} }) };
});
vi.mock('../../app/router', async importOriginal => {
  const actual = await importOriginal<typeof import('../../app/router')>();
  return { ...actual, Link: ({ to, children, ...props }: ComponentProps<typeof actual.Link>) => createElement('a', { ...props, href: `#${to}` }, children) };
});
beforeEach(() => {
  preparedDeck = null; preparationError = null;
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ measureText: (char: string) => ({ width: /[ -~]/.test(char) ? 50 : 100 }) }) }) });
  vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(new URL('../../../public' + new URL(url).pathname, import.meta.url))));
});
afterEach(() => vi.unstubAllGlobals());
async function binding() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return { requestedProjectId: 'qingyu', workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}
function render(children: ReactNode) {
  const store = memoryStore(), service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  return renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children: createElement(I18nProvider, { children }) }));
}
function report(result: QingyuResolution, options: Partial<ComponentProps<typeof QingyuReportRevisions>> = {}) {
  return render(createElement(QingyuReportRevisions, { result, recheck: { pending: false, run: () => {} }, ...options }));
}
describe('studio default and business boundaries', () => {
  it('reads the same compiled research pages in five chapters with complete closed evidence', async () => {
    if (qingyuR4Report.kind !== 'valid' || qingyuR2Report.kind !== 'valid') throw new Error('Frozen reports invalid');
    const input = await binding(), before = JSON.stringify(input);
    preparedDeck = await prepareResearchDeck({ report: qingyuR4Report.report, prices: qingyuR2Report.report, historical: false, latestBriefVersion: 1 }, new AbortController().signal);
    const html = report(resolveQingyuCase(input));
    expect(html).toContain('data-report-revision="studio"');
    expect(html).toContain('aria-pressed="true">版式工坊图版');
    expect((html.match(/data-chapter=/g) ?? [])).toHaveLength(5);
    expect((html.match(/data-chapter-details=/g) ?? [])).toHaveLength(5);
    expect((html.match(/data-studio-board=/g) ?? [])).toHaveLength(preparedDeck.pages.length);
    expect((html.match(/data-price-point=/g) ?? [])).toHaveLength(12);
    expect((html.match(/data-price-quote=/g) ?? [])).toHaveLength(13);
    expect((html.match(/data-product-media=/g) ?? [])).toHaveLength(4);
    expect(html).toContain('data-template="compare.lineup"');
    expect(html).toContain('价格未知，不画点');
    expect(html).not.toMatch(/ · (?:promotion|reported-price|brand-reported-launch|observed-listing|unknown)<\/p>/);
    for (const item of [...qingyuR4Report.report.facts, ...qingyuR4Report.report.findings, ...qingyuR4Report.report.gaps, ...qingyuR4Report.report.sources]) expect(html.includes(item.id), item.id).toBe(true);
    for (const media of qingyuR4Report.report.media) expect(html.includes(media.sha256), media.id).toBe(true);
    expect(html).toContain(qingyuR4Report.report.origin.adoptionSha256);
    expect(html).toContain(qingyuR2Report.report.revision.skillRevision);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|>)|下载PNG|下载SVG/);
    expect((html.match(/>下载调研报告<\/button>/g) ?? [])).toHaveLength(1);
    for (const revision of ['修订4', '修订3', '修订2', '保存的研究第1版']) expect(html).toContain(revision);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('shows preparation and refusal honestly while keeping the report download disabled', async () => {
    const result = resolveQingyuCase(await binding());
    const loading = report(result);
    expect(loading).toContain('正在核对资源与准备版式');
    expect(loading).toMatch(/disabled="">下载调研报告<\/button>/);
    expect(loading).not.toContain('data-studio-board=');
    preparationError = '原图身份未通过核对';
    const failed = report(result);
    expect(failed).toContain('原图身份未通过核对'); expect(failed).toContain('重新准备');
    expect(failed).toMatch(/disabled="">下载调研报告<\/button>/);
  });
  it.each(['r4', 'r2'])('refuses invalid %s input without automatic historical fallback', async invalid => {
    const result = resolveQingyuCase(await binding());
    const html = report(result, invalid === 'r4' ? { bundleR4: { kind: 'invalid', message: 'internal damage' } } : { bundle: { kind: 'invalid', message: 'internal damage' } });
    expect(html).toContain('data-case-status="invalid-studio-bundle"');
    expect(html).not.toContain('data-case-report='); expect(html).not.toContain('internal damage');
  });
  it.each(['project', 'revision', 'head', 'brief', 'roster', 'simulated'])('runs the old binding guard before studio for %s', async mutation => {
    const input = await binding();
    if (!input.workspace.artifact) throw new Error('Research head required');
    if (mutation === 'project') input.history.project.id = 'foreign';
    if (mutation === 'revision') input.history.project.revision += 1;
    if (mutation === 'head') input.workspace.artifact.id = 'foreign-head';
    if (mutation === 'brief') input.history.versions[0]!.objectives.push('changed');
    if (mutation === 'roster') input.workspace.versions.push(structuredClone(input.workspace.versions[0]!));
    if (mutation === 'simulated') input.workspace.artifact.simulated = false;
    const html = report(resolveQingyuCase(input));
    expect(html).not.toContain('aria-label="青屿报告版本"'); expect(html).not.toContain('data-report-revision="studio"');
  });
  it('keeps current and historical task identities visible', async () => {
    const input = await binding();
    if (!input.history.current) throw new Error('Brief required');
    input.history.current = { ...input.history.current, id: 'brief-v2', version: 2, audience: '新版受众' };
    const html = report(resolveQingyuCase(input));
    expect(html).toContain('data-case-historical="true"'); expect(html).toContain('当前任务卡为第2版');
    expect(html).toContain('生成示意'); expect(html).toContain('依据任务卡第1版');
  });
  it('keeps Qingyu empty and Plumtide blocked while exposing the actual research entry', () => {
    const before = JSON.stringify([qingyuProposal, plumtide]);
    for (const proposal of [qingyuProposal, plumtide]) {
      const html = render(createElement(DeliveryArea, { proposal }));
      expect(html).toContain('版式工坊已接入'); expect(html).toContain('完整方案尚未就绪');
      expect(html).not.toContain('dc-hero__cta'); expect(html).not.toContain('data-studio-page=');
    }
    const qingyu = render(createElement(DeliveryStage, { proposal: qingyuProposal }));
    expect(qingyu).toContain('正在核对研究与任务卡');
    expect(qingyu).not.toContain('pw-empty');
    expect(qingyu).not.toContain('已批准交付');
    expect(JSON.stringify([qingyuProposal, plumtide])).toBe(before);
  });
  it('shows native work before review and keeps comparisons folded without writing approval', () => {
    const before = JSON.stringify(northline);
    const html = render(createElement(DeliveryStage, { proposal: northline }));
    expect(html.indexOf('delivery-current-deck')).toBeLessThan(html.indexOf('final-checks'));
    expect(html.indexOf('final-checks')).toBeLessThan(html.indexOf('delivery-export'));
    expect(html).toContain('<details class="qy-layout-records" aria-labelledby="compare">');
    expect(html).not.toContain('<details open');
    expect(JSON.stringify(northline)).toBe(before);
  });
  it('keeps Northline pending human review and disables downloads until actual pages are prepared', () => {
    const html = render(createElement(DeliveryArea, { proposal: northline }));
    expect(html).toContain('本地工程模拟'); expect(html).toContain('尚待人工终审');
    expect(html).toContain('正在准备实际版式与页数');
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(northline.layout!.styles.length + 1);
    expect(html).not.toContain('data-studio-page=');
    expect(northline.layout?.slides).toHaveLength(16); expect(northline.stages.delivery.status).toBe('waiting_for_you');
  });
});
