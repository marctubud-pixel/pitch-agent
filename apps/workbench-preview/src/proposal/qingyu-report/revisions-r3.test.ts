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
import { resolveQingyuCase } from './binding';
import { qingyuR3Report } from './bundle-r3';
import { QingyuReportRevisions } from './QingyuReportRevisions';
import type { QingyuResolution } from './binding';
import type { QingyuR3Parsed } from './report-r3';

async function binding() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return { requestedProjectId: 'qingyu', workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}
function render(result: QingyuResolution, bundleR3?: QingyuR3Parsed) {
  const store = memoryStore(); const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const children = createElement(I18nProvider, { children: createElement(QingyuReportRevisions, { result, bundleR3, initialRevision: 3, recheck: { pending: false, run: () => {} } }) });
  return renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children }));
}

describe('R3 default and preserved historical report API', () => {
  it('loads the actual frozen R3 and keeps all three versions explicit', async () => {
    if (qingyuR3Report.kind !== 'valid') throw new Error(qingyuR3Report.message);
    const input = await binding(), before = JSON.stringify(input), html = render(resolveQingyuCase(input));
    expect(html).toContain('data-report-revision="3"');
    expect(html).toContain('公开资料报告·修订3'); expect(html).toContain('公开资料报告·修订2'); expect(html).toContain('保存的研究第1版');
    expect((html.match(/data-chapter=/g) ?? [])).toHaveLength(5);
    expect((html.match(/data-block=/g) ?? [])).toHaveLength(21);
    expect(html).not.toMatch(/下载PNG|下载SVG|<details[^>]*\bopen(?:=|>)/);
    expect((html.match(/>下载调研报告<\/button>/g) ?? [])).toHaveLength(1);
    expect(html).toContain('70.8');
    expect(JSON.stringify(input)).toBe(before);
    expect(input.workspace.artifact).toMatchObject({ id: 'art-qingyu-research-v1', version: 1, release: null, status: 'draft' });
  });
  it('shows independent R3 failure without silently using the valid R2', async () => {
    const html = render(resolveQingyuCase(await binding()), { kind: 'invalid', message: 'Fixture damage' });
    expect(html).toContain('data-case-status="invalid-r3-bundle"'); expect(html).not.toContain('data-case-report='); expect(html).not.toContain('Fixture damage');
  });
  it.each(['requested-project', 'project', 'revision', 'lineage', 'head', 'workspace-roster', 'history-roster', 'duplicate-roster', 'missing-brief', 'same-version-content', 'current-mixed-snapshot', 'stage', 'simulated'])('uses the unchanged guard before either revision for %s', async mutation => {
    const input = await binding();
    if (mutation === 'requested-project') input.requestedProjectId = 'luma';
    if (mutation === 'project') input.history.project.id = 'luma';
    if (mutation === 'revision') input.history.project.revision += 1;
    if (!input.workspace.artifact) throw new Error('Fixture head required');
    if (mutation === 'lineage') input.workspace.artifact.lineageId = 'foreign';
    if (mutation === 'head') input.workspace.artifact.id = 'new-head';
    if (mutation === 'stage') input.workspace.artifact.stage = 'strategy';
    if (mutation === 'simulated') input.workspace.artifact.simulated = false;
    if (mutation === 'workspace-roster') input.workspace.versions = [];
    if (mutation === 'history-roster') input.history.dependentArtifacts = [];
    if (mutation === 'duplicate-roster') input.workspace.versions.push(structuredClone(input.workspace.versions[0]));
    if (mutation === 'missing-brief') input.history.versions = [];
    if (mutation === 'same-version-content') input.history.versions[0].objectives.push('Changed in place');
    if (mutation === 'current-mixed-snapshot' && input.history.current) input.history.current.background = 'foreign snapshot';
    const result = resolveQingyuCase(input); const html = render(result);
    expect(result.kind).toBe('unavailable');
    expect(html).not.toContain('data-case-report=');
    expect(html).not.toContain('aria-label="青屿报告版本"');
  });
  it('marks a new brief as historical for the independently authored revision', async () => {
    const input = await binding(); if (!input.history.current) throw new Error('Brief required');
    input.history.current = { ...input.history.current, id: 'brf-qingyu-v2', version: 2, audience: '新的受众' };
    const html = render(resolveQingyuCase(input));
    expect(html).toContain('data-case-historical="true"');
    expect(html).toContain('当前任务卡为第2版');
  });
 });
