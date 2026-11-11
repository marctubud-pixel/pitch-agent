import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryState } from '../../app/query';
import { ConfirmProvider } from '../../app/confirm';
import { RouterProvider } from '../../app/router';
import { ServiceProvider } from '../../app/services';
import type { BriefHistory, ResearchWorkspace } from '../../domain/models';
import { toServiceError } from '../../domain/service';
import { I18nProvider } from '../../i18n';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { LocalIntakeService } from '../../services/intake/LocalIntakeService';
import { MockAssistantService } from '../../services/mock/MockAssistantService';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { MockProposalService } from '../../services/proposal/MockProposalService';
import { northline } from '../../services/proposal/fixtures/northline';
import { plumtide } from '../../services/proposal/fixtures/plumtide';
import { ThemesStage } from '../../views/stages/ThemesStage';
import { QingyuThemesResultView } from './QingyuThemesPreview';
import { resolveQingyuThemesPreview } from './preview';
import { strategySummaryIdentity } from '../qingyu-strategy/summary';

let researchQuery: QueryState<ResearchWorkspace>;
let briefQuery: QueryState<BriefHistory>;
vi.mock('../../app/query', () => ({ useServiceQuery: (key: string) => key.startsWith('research-case-briefs:') ? briefQuery : researchQuery }));
const serviceError = toServiceError(new Error('offline'));

function render(children: ReactNode) {
  const store = memoryStore(), service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  return renderToStaticMarkup(createElement(ServiceProvider, {
    service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }),
    children: createElement(I18nProvider, { children: createElement(ConfirmProvider, { children: createElement(RouterProvider, { mode: 'memory', children }) }) }),
  }));
}
async function data() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return { proposal: structuredClone(qingyuProposal), workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}
afterEach(() => vi.unstubAllGlobals());
beforeEach(async () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ measureText: (char: string) => ({ width: /[ -~]/.test(char) ? 50 : 100 }) }) }) });
  const input = await data();
  researchQuery = { status: 'success', data: input.workspace, error: null, refreshError: null, refreshing: false, refetch: vi.fn() };
  briefQuery = { status: 'success', data: input.history, error: null, refreshError: null, refreshing: false, refetch: vi.fn() };
});

describe('Qingyu readonly reviewed copy', () => {
  it.each(['current', 'historical', 'no-current'])('shows the three authored directions with a truthful %s context and closed details', async context => {
    const input = await data();
    if (context === 'historical') {
      if (!input.history.current) throw new Error('Current brief required');
      input.history.current = { ...input.history.current, id: 'brf-qingyu-v2', version: 2 };
    }
    if (context === 'no-current') input.history.current = null;
    const before = JSON.stringify(input);
    const result = resolveQingyuThemesPreview(input);
    expect(result.kind).toBe(context === 'current' ? 'current' : 'historical');
    if (result.kind === 'unavailable') throw new Error('Readable copy required');
    expect(result.preview.bundle.basedOnStrategyDraftId).toBe(strategySummaryIdentity.draftId);
    const html = render(createElement(QingyuThemesResultView, { result, retry: () => {} }));
    expect(html).toContain(`data-copy-preview="${result.preview.bundle.id}"`);
    expect((html.match(/data-copy-direction=/g) ?? [])).toHaveLength(3);
    for (const section of ['derivation', 'reviews', 'history']) expect(html).toContain(`data-copy-section="${section}"`);
    for (const direction of result.preview.bundle.currentRound.directions) for (const text of [direction.name, direction.slogan, direction.subline]) expect(html).toContain(text);
    expect(html).toContain('未经真实消费者验证，不代表客户批准');
    expect(html).toContain('具体茶种、完整配料与水源使用凭据');
    expect(html).not.toMatch(/data-recommended|tx-badge|<button|<img|<image|桌角|<details[^>]* open/);
    expect(html.includes('历史依据预览')).toBe(context !== 'current');
    if (context !== 'current') expect(html.indexOf('历史依据预览')).toBeLessThan(html.indexOf('data-copy-direction'));
    if (context === 'no-current') expect(html).toContain('当前任务卡缺失');
    expect(JSON.stringify(input)).toBe(before);
    expect(input.proposal.themes).toBeNull();
    expect(input.proposal.stages.themes.status).toBe('not_started');
  });
  it.each(['proposal', 'workbench', 'type', 'formal-themes', 'formal-strategy', 'project', 'revision', 'head', 'head-version', 'brief', 'missing-brief', 'roster', 'simulated'])('denies %s without leaking copy', async mutation => {
    const input = await data();
    if (!input.workspace.artifact) throw new Error('Research required');
    const brief = input.history.versions[0];
    if (!brief) throw new Error('Brief required');
    if (mutation === 'proposal') input.proposal.id = 'other';
    if (mutation === 'workbench') input.proposal.workbenchId = 'northline';
    if (mutation === 'type') input.proposal.type = 'kv';
    if (mutation === 'formal-themes') input.proposal.themes = northline.themes;
    if (mutation === 'formal-strategy') input.proposal.strategy = northline.strategy;
    if (mutation === 'project') input.history.project.id = 'foreign';
    if (mutation === 'revision') input.history.project.revision += 1;
    if (mutation === 'head') input.workspace.artifact.id = 'new';
    if (mutation === 'head-version') input.workspace.artifact.version += 1;
    if (mutation === 'brief') brief.objectives.push('changed');
    if (mutation === 'missing-brief') input.history.versions = [];
    if (mutation === 'roster') {
      const first = input.workspace.versions[0];
      if (!first) throw new Error('Research roster required');
      input.workspace.versions.push(structuredClone(first));
    }
    if (mutation === 'simulated') input.workspace.artifact.simulated = false;
    const result = resolveQingyuThemesPreview(input);
    expect(result.kind).toBe('unavailable');
    const html = render(createElement(QingyuThemesResultView, { result, retry: () => {} }));
    expect(html).toContain('重新核对依据');
    expect(html).not.toContain('data-copy-direction');
  });
  it('hooks only the exact case with no formal copy and preserves other themes', () => {
    expect(render(createElement(ThemesStage, { proposal: qingyuProposal }))).toContain('data-copy-preview');
    for (const proposal of [northline, plumtide]) {
      if (!proposal.themes) throw new Error('Formal themes required');
      const html = render(createElement(ThemesStage, { proposal }));
      expect(html).not.toContain('data-copy-preview');
      for (const direction of proposal.themes.directions) expect(html).toContain(direction.name);
    }
    expect(render(createElement(ThemesStage, { proposal: { ...qingyuProposal, themes: northline.themes } }))).not.toContain('data-copy-preview');
    for (const proposal of [{ ...qingyuProposal, id: 'other' }, { ...qingyuProposal, workbenchId: 'other' }, { ...qingyuProposal, type: 'kv' } satisfies typeof qingyuProposal]) {
      const html = render(createElement(ThemesStage, { proposal }));
      expect(html).not.toContain('data-copy-preview');
      expect(html).toContain('pw-empty');
    }
  });
  it.each(['research', 'brief'])('shows loading, failure, stale refresh and retry for %s', query => {
    const successResearch = researchQuery, successBrief = briefQuery;
    if (query === 'research') researchQuery = { ...researchQuery, status: 'loading', data: undefined };
    else briefQuery = { ...briefQuery, status: 'loading', data: undefined };
    const loading = render(createElement(ThemesStage, { proposal: qingyuProposal }));
    expect(loading).toContain('正在核对研究与任务卡');
    expect(loading).not.toContain('data-copy-preview');
    if (query === 'research') researchQuery = { ...researchQuery, status: 'error', error: serviceError };
    else briefQuery = { ...briefQuery, status: 'error', error: serviceError };
    const failed = render(createElement(ThemesStage, { proposal: qingyuProposal }));
    expect(failed).toContain('重新核对依据');
    expect(failed).not.toContain('data-copy-preview');
    researchQuery = successResearch; briefQuery = successBrief;
    if (query === 'research') researchQuery = { ...researchQuery, refreshing: true };
    else briefQuery = { ...briefQuery, refreshing: true };
    const refreshing = render(createElement(ThemesStage, { proposal: qingyuProposal }));
    expect(refreshing).toContain('上次成功读取的依据');
    expect(refreshing).toContain('data-copy-preview');
    if (query === 'research') researchQuery = { ...researchQuery, refreshing: false, refreshError: serviceError };
    else briefQuery = { ...briefQuery, refreshing: false, refreshError: serviceError };
    const stale = render(createElement(ThemesStage, { proposal: qingyuProposal }));
    expect(stale).toContain('刷新失败');
    expect(stale).toContain('重试读取依据');
    expect(stale).toContain('data-copy-preview');
  });
  it('refuses a new current strategy identity instead of relabelling the existing copy', async () => {
    const original = strategySummaryIdentity.draftId;
    try {
      strategySummaryIdentity.draftId = 'new-strategy-version';
      expect(resolveQingyuThemesPreview(await data())).toMatchObject({ kind: 'unavailable', reason: 'draft-invalid' });
      expect(original).toBe('qingyu-strategy-owner-summary-20261110-v1');
    } finally { strategySummaryIdentity.draftId = original; }
  });
  it('reads without writing, releasing or advancing any persisted service state', async () => {
    const store = memoryStore(), service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const input = { proposal: structuredClone(qingyuProposal), workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
    const write = vi.spyOn(store, 'set'), remove = vi.spyOn(store, 'remove');
    expect(resolveQingyuThemesPreview(input).kind).toBe('current');
    expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
    expect(await service.getResearchWorkspace('qingyu')).toEqual(input.workspace);
    expect(await service.getBriefHistory('qingyu')).toEqual(input.history);
  });
});
