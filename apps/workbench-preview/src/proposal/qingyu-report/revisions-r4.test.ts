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
import { resolveQingyuCase, type QingyuResolution } from './binding';
import { QingyuReportRevisions } from './QingyuReportRevisions';
import type { QingyuR4Parsed } from './report-r4';

async function binding() { const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false }); return { requestedProjectId: 'qingyu', workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') }; }
function render(result: QingyuResolution, bundleR4?: QingyuR4Parsed, initialRevision: 1 | 2 | 3 | 4 = 4) {
  const store = memoryStore(), service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const children = createElement(I18nProvider, { children: createElement(QingyuReportRevisions, { result, bundleR4, initialRevision, recheck: { pending: false, run: () => {} } }) });
  return renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children }));
}
describe('R4 default and preserved revisions', () => {
  it('shows five chapters and six evidence boards with generated scene, four originals and one report download', async () => {
    const input = await binding(), before = JSON.stringify(input), html = render(resolveQingyuCase(input));
    expect(html).toContain('data-report-revision="4"');
    expect((html.match(/data-chapter=/g) ?? [])).toHaveLength(5); expect((html.match(/data-board=/g) ?? [])).toHaveLength(6);
    expect((html.match(/data-chapter-details=/g) ?? [])).toHaveLength(5); expect((html.match(/data-product-media=/g) ?? [])).toHaveLength(4);
    expect(html).toContain('百分比轴 0–100% · 各项独立，不相加'); expect(html).toContain('width:68.8%'); expect(html).toContain('生成情境示意'); expect(html).toContain('75ca946b2e78a5aaa363c9e0638a0e5bf420db5fd27a13cc8b17570e7798835c');
    expect(html).not.toMatch(/下载PNG|下载SVG|<details[^>]*\bopen(?:=|>)/); expect((html.match(/>下载调研报告<\/button>/g) ?? [])).toHaveLength(1);
    for (const edition of ['修订4', '修订3', '修订2', '保存的研究第1版']) expect(html).toContain(edition);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('shows independent invalid R4 without falling back to any older report', async () => {
    const html = render(resolveQingyuCase(await binding()), { kind: 'invalid', message: 'Fixture corruption' });
    expect(html).toContain('data-case-status="invalid-r4-bundle"'); expect(html).not.toContain('data-case-report='); expect(html).not.toContain('Fixture corruption');
  });
  it.each([1, 2, 3] satisfies (1 | 2 | 3)[])('retains explicit revision %s', async revision => {
    const html = render(resolveQingyuCase(await binding()), undefined, revision);
    if (revision === 1) expect(html).toContain('class="qy-report"'); else expect(html).toContain(`data-report-revision="${revision}"`); expect(html).not.toContain('data-report-revision="4"');
  });
  it.each(['project', 'revision', 'head', 'same-version-content', 'duplicate-roster', 'simulated'])('applies the existing binding guard before any R4 data for %s', async mutation => {
    const input = await binding(); if (!input.workspace.artifact) throw new Error('Head required');
    if (mutation === 'project') input.history.project.id = 'foreign';
    if (mutation === 'revision') input.history.project.revision += 1;
    if (mutation === 'head') input.workspace.artifact.id = 'new-head';
    if (mutation === 'same-version-content') input.history.versions[0]!.objectives.push('changed');
    if (mutation === 'duplicate-roster') input.workspace.versions.push(structuredClone(input.workspace.versions[0]!));
    if (mutation === 'simulated') input.workspace.artifact.simulated = false;
    const result = resolveQingyuCase(input); expect(result.kind).toBe('unavailable'); expect(render(result)).not.toContain('aria-label="青屿报告版本"');
  });
  it('clearly labels historical task context', async () => {
    const input = await binding(); if (!input.history.current) throw new Error('Brief required');
    input.history.current = { ...input.history.current, id: 'brf-qingyu-v2', version: 2, audience: '新的受众' };
    const html = render(resolveQingyuCase(input)); expect(html).toContain('data-case-historical="true"'); expect(html).toContain('当前任务卡为第2版');
  });
});
