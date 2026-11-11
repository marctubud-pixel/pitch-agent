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
import { qingyuR2Report } from './bundle-r2';
import { QingyuReportRevisions } from './QingyuReportRevisions';
import type { QingyuResolution } from './binding';
import type { QingyuR2Parsed } from './report-r2';

async function binding() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return { requestedProjectId: 'qingyu', workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}
function render(result: QingyuResolution, bundle?: QingyuR2Parsed) {
  const store = memoryStore(); const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const children = createElement(I18nProvider, { children: createElement(QingyuReportRevisions, { result, bundle, initialRevision: 2, recheck: { pending: false, run: () => {} } }) });
  return renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children }));
}

describe('authored revision 2 and preserved research record', () => {
  it('loads the reviewed content and defaults to the independent public revision', async () => {
    if (qingyuR2Report.kind !== 'valid') throw new Error(qingyuR2Report.message);
    const input = await binding(); const before = JSON.stringify(input); const result = resolveQingyuCase(input);
    const html = render(result);
    expect(html).toContain('data-report-revision="2"');
    expect(html).toContain('公开资料报告·修订2');
    expect(html).toContain('保存的研究第1版');
    expect(html).toContain('关联项目保存的研究记录仍为研究第1版');
    expect(html).not.toContain('data-case-report="qingyu-packaging-results-20261109"');
    expect((html.match(/data-chapter=/g) ?? [])).toHaveLength(5);
    expect(html).toContain('data-question-matrix="true"');
    expect(html).toContain('data-method-notes="true"');
    expect(html).toContain('data-packaging-category="strict-tea"');
    expect(html).toContain('data-packaging-category="adjacent"');
    expect(html).toContain('邻近品类包装参照');
    expect(html).not.toContain('<details class="qy-r2-details" open');
    expect(html).not.toContain('/Users/');
    expect(html).not.toContain('SOURCE-DECISIONS');
    expect(html).not.toContain('单测夹具');
    expect(JSON.stringify(input)).toBe(before);
    expect(input.workspace.artifact).toMatchObject({ id: 'art-qingyu-research-v1', version: 1, release: null, status: 'draft' });
  });
  it('fails clearly when the default new bundle is invalid without silently rendering v1', async () => {
    const html = render(resolveQingyuCase(await binding()), { kind: 'invalid', message: 'Deliberately damaged test bundle' });
    expect(html).toContain('data-case-status="invalid-r2-bundle"');
    expect(html).toContain('保存的研究第1版');
    expect(html).not.toContain('data-case-report=');
    expect(html).not.toContain('Deliberately damaged');
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
  it('renders per-quote dates, conditions, units, image identity and explicit question states', async () => {
    if (qingyuR2Report.kind !== 'valid') throw new Error(qingyuR2Report.message);
    const report = qingyuR2Report.report; const html = render(resolveQingyuCase(await binding()));
    for (const chart of report.charts) {
      expect(html).toContain(chart.metricLabel);
      expect(html).toContain(chart.unit);
      expect(html).toContain(chart.period);
      expect(html).toContain(chart.comparison);
      expect(html).toContain(chart.channel);
    }
    for (const quote of report.prices) {
      expect(html).toContain(quote.quotedAt);
      expect(html).toContain(quote.readAt);
      expect(html).toContain(quote.conditions.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;'));
    }
    for (const image of report.imageManifest) {
      expect(html).toContain(image.path);
      expect(html).toContain(image.identityLabel);
    }
  });
});
