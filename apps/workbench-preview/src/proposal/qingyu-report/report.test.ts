import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import raw from './content.json';
import { byId, chartValue, parseQingyuReport, qingyuReport } from './report';
import { resolveQingyuCase } from './binding';
import { QingyuReportView } from './QingyuReportView';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { I18nProvider } from '../../i18n';
import { ServiceProvider } from '../../app/services';
import { LocalIntakeService } from '../../services/intake/LocalIntakeService';
import { MockAssistantService } from '../../services/mock/MockAssistantService';
import { MockProposalService } from '../../services/proposal/MockProposalService';
import { memoryStore } from '../../services/mock/storage';

async function binding() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return { requestedProjectId: 'qingyu', workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}

describe('Qingyu fixed results content', () => {
  it('parses the five result sections and keeps evidence identities separate', () => {
    if (qingyuReport.kind !== 'valid') throw new Error(qingyuReport.message);
    const report = qingyuReport.report;
    expect(report.sections.map(s => s.title)).toEqual(['行业与市场', '人群', '竞品', '产品本身', '研究结论']);
    expect(report.datums).toHaveLength(15); expect(report.sources).toHaveLength(9); expect(report.cases).toHaveLength(5);
    expect(byId(report.sources, 'BRIEF-S1').url).toBeNull();
    expect(byId(report.datums, 'CP-F11').evidenceType).toBe('brand-self-description');
    expect(byId(report.datums, 'BRIEF-pack').evidenceType).toBe('brief-condition');
    expect(byId(report.datums, 'CP-F16').evidenceType).toBe('visual-observation');
    expect(byId(report.findings, 'PK-F08').kind).toBe('research-synthesis');
    expect(report.datums.some(d => ['CP-F1', 'CP-F2', 'CP-F3', 'BRIEF-UNIT-PRICE'].includes(d.id))).toBe(false);
    expect(byId(report.cases, 'PK-CASE05').image.identityLabel).toContain('AI');
  });
  it('derives all plotted and compared capacities from the fact ledger', () => {
    if (qingyuReport.kind !== 'valid') throw new Error(qingyuReport.message);
    const report = qingyuReport.report;
    for (const chart of report.charts) {
      if (chart.type === 'comparison-table') expect(chart.rows.map(r => chartValue(report, { datumId: r.datumId, valuePath: r.valuePath }))).toEqual([480, 480, 480, 500, 500]);
      else expect(chart.rows.map(r => chartValue(report, r))).toEqual(chart.rows.map(r => r.value));
    }
  });
  it.each(['numeric-drift', 'capacity-drift', 'missing-cue', 'untrusted-image', 'source-url', 'null-url', 'dangling-finding', 'missing-chapter'])('rejects %s at the content boundary', mutation => {
    const input = structuredClone(raw);
    if (mutation === 'numeric-drift') { const row = input.charts[0].rows[0]; if ('value' in row) row.value = 95; }
    if (mutation === 'capacity-drift') input.cases[0].capacityMl = 500;
    if (mutation === 'missing-cue') { const row = input.charts[3].rows[0]; if ('cueDatumIds' in row) row.cueDatumIds = ['MISSING']; }
    if (mutation === 'untrusted-image') input.cases[0].image.file = '/tmp/foreign.png';
    if (mutation === 'source-url') input.sources[0].url = 'http://unsafe.example';
    if (mutation === 'null-url') input.sources[0].url = null;
    if (mutation === 'dangling-finding') input.sections[0].findingIds = ['MISSING'];
    if (mutation === 'missing-chapter') input.sections.pop();
    expect(parseQingyuReport(input).kind).toBe('invalid');
  });
});

describe('Qingyu exact historical binding', () => {
  it('shows the unconfirmed fixed brief and never treats research as released', async () => {
    const input = await binding(); const result = resolveQingyuCase(input);
    expect(result).toMatchObject({ kind: 'available', currency: 'current', brief: { confirmedAt: null } });
    expect(input.workspace.artifact).toMatchObject({ status: 'draft', release: null, producedByJobId: null });
    expect(input.workspace.readiness).toBeNull(); expect(input.workspace.verification).toBeNull();
  });
  it('renders result headings, real originals and collapsed methods with no developer paths', async () => {
    const result = resolveQingyuCase(await binding());
    const store = memoryStore();
    const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const content = createElement(QingyuReportView, { result, recheck: { pending: false, run: () => {} } });
    const html = renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children: createElement(I18nProvider, { children: content }) }));
    expect((html.match(/data-chapter=/g) ?? [])).toHaveLength(5);
    expect((html.match(/data-exhibit=/g) ?? [])).toHaveLength(4);
    expect((html.match(/data-case="PK-CASE/g) ?? [])).toHaveLength(5);
    expect(html).toContain('部分由AI生成');
    expect(html).not.toContain('/Users/'); expect(html).not.toContain('SOURCE-DECISIONS');
    expect(html).toContain('class="qy-notes"><summary>资料、口径与核验');
    expect(html).not.toContain('<details class="qy-notes" open');
  });
  it.each(['project', 'revision', 'lineage', 'head', 'roster', 'duplicate-roster', 'missing-brief', 'same-version-content', 'current-mixed-snapshot', 'stage', 'simulated'])('refuses %s mismatch', async mutation => {
    const input = await binding();
    if (mutation === 'project') input.history.project.id = 'luma';
    if (mutation === 'revision') input.history.project.revision += 1;
    if (!input.workspace.artifact) throw new Error('Fixture head required');
    if (mutation === 'lineage') input.workspace.artifact.lineageId = 'foreign';
    if (mutation === 'head') input.workspace.artifact.id = 'new-head';
    if (mutation === 'stage') input.workspace.artifact.stage = 'strategy';
    if (mutation === 'simulated') input.workspace.artifact.simulated = false;
    if (mutation === 'roster') input.history.dependentArtifacts = [];
    if (mutation === 'duplicate-roster') input.workspace.versions.push(structuredClone(input.workspace.versions[0]));
    if (mutation === 'missing-brief') input.history.versions = [];
    if (mutation === 'same-version-content') input.history.versions[0].objectives.push('Changed in place');
    if (mutation === 'current-mixed-snapshot' && input.history.current) input.history.current.background = 'foreign snapshot';
    expect(resolveQingyuCase(input).kind).toBe('unavailable');
  });
  it('labels the original head historical when a newer brief exists', async () => {
    const input = await binding(); if (!input.history.current) throw new Error('Brief required');
    input.history.current = { ...input.history.current, id: 'brf-qingyu-v2', version: 2, audience: '新的受众' };
    expect(resolveQingyuCase(input)).toMatchObject({ kind: 'available', currency: 'historical', latestBriefVersion: 2 });
  });
});
