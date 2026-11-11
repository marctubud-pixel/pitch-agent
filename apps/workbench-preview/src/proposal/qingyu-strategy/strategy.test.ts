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
import { StrategyStage } from '../../views/stages/StrategyStage';
import { QingyuStrategyResult } from './QingyuStrategyPreview';
import { resolveQingyuStrategyPreview } from './preview';
import * as summary from './summary';

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

describe('strategy preview visible behavior', () => {
  it.each(['current', 'historical'])('renders three concise Deck Studio boards with separate identity for %s input', async (context) => {
    const input = await data();
    if (context === 'historical') {
      if (!input.history.current) throw new Error('Current brief required');
      input.history.current = { ...input.history.current, id: 'brf-qingyu-v2', version: 2, confirmedAt: '2026-11-09T12:00:00Z' };
    }
    const result = resolveQingyuStrategyPreview(input);
    expect(result.kind).toBe(context);
    if (result.kind === 'unavailable') throw new Error('Validated basis required');
    const before = JSON.stringify(input);
    const html = render(createElement(QingyuStrategyResult, { result, retry: () => {} }));
    expect(html).toContain(`data-strategy-preview="${summary.strategySummaryIdentity.draftId}"`);
    expect(html).not.toContain(`data-strategy-preview="${result.preview.document.draftId}"`);
    expect((html.match(/data-strategy-section=/g) ?? [])).toHaveLength(3);
    expect((html.match(/data-studio-page=/g) ?? [])).toHaveLength(3);
    expect((html.match(/data-template="summary.list"/g) ?? [])).toHaveLength(1);
    expect((html.match(/data-template="strategy.venn"/g) ?? [])).toHaveLength(1);
    expect((html.match(/<ellipse /g) ?? [])).toHaveLength(3);
    expect((html.match(/data-template="summary.statement"/g) ?? [])).toHaveLength(1);
    for (const board of summary.strategySummaryBoards) {
      expect(html).toContain(board.title);
      expect(html).toContain(board.caption);
    }
    expect(html).toContain('本稿未沿用旧稿的三方审查结论');
    expect(html).toContain('正式策略未开始');
    expect(html).toContain('R4 · 原生成方法 r6-20261109');
    expect(html).toContain('<details class="qs-evidence"><summary>依据与历史</summary>');
    expect(html).not.toContain('<details class="qs-evidence" open');
    expect(html).toContain('原研究与前稿依据记录');
    expect(html).toContain('回执只对应旧稿');
    expect(html).toContain('用户补充设定');
    expect(html).toContain('INIKIN-WATER');
    expect(html).toContain('https://www.teamuseum.cn/message/memorabilia.htm');
    expect(html).not.toMatch(/<table|<image|<img|qs-method|data-review-role|下载|建议选方向 02|三方独立 AI 模拟复核通过/);
    expect(html).toContain(`data-strategy-context="${context}"`);
    expect(html).toContain('data-strategy-status="owner-draft"');
    expect(html.includes('历史依据预览')).toBe(context === 'historical');
    if (context === 'historical') expect(html.indexOf('历史依据预览')).toBeLessThan(html.indexOf('data-studio-page='));
    expect(JSON.stringify(input)).toBe(before);
  });
  it('shows preparation failure without rendering partial boards or source claims', async () => {
    const result = resolveQingyuStrategyPreview(await data());
    const prepare = vi.spyOn(summary, 'prepareStrategySummary').mockImplementationOnce(() => { throw new Error('版式文字超出容量'); });
    const html = render(createElement(QingyuStrategyResult, { result, retry: () => {} }));
    expect(html).toContain('版式文字超出容量');
    expect(html).toContain('重新核对依据');
    expect(html).not.toContain('data-studio-page=');
    expect(html).not.toContain('data-strategy-claim=');
    prepare.mockRestore();
  });
  it('uses the Qingyu entry only for its exact packaging proposal and preserves existing formal strategies', () => {
    expect(render(createElement(StrategyStage, { proposal: qingyuProposal }))).toContain('data-strategy-preview=');
    for (const proposal of [northline, plumtide]) {
      if (!proposal.strategy) throw new Error('Existing strategy required');
      const html = render(createElement(StrategyStage, { proposal: proposal }));
      expect(html).toContain(proposal.strategy.question);
      expect(html).toContain(proposal.strategy.conclusion);
      expect((html.match(/class="st-card"/g) ?? [])).toHaveLength(3);
      expect(html).not.toContain('data-strategy-preview=');
    }
    const laterFormal = { ...qingyuProposal, strategy: northline.strategy };
    expect(render(createElement(StrategyStage, { proposal: laterFormal }))).not.toContain('data-strategy-preview=');
    for (const proposal of [{ ...qingyuProposal, id: 'another-proposal' }, { ...qingyuProposal, workbenchId: 'another-project' }, { ...qingyuProposal, type: 'kv' } satisfies typeof qingyuProposal]) {
      const html = render(createElement(StrategyStage, { proposal: proposal }));
      expect(html).not.toContain('data-strategy-preview=');
      expect(html).toContain('pw-empty');
    }
  });
  it.each(['research', 'brief'])('reports loading and first-read failure for %s separately', query => {
    if (query === 'research') researchQuery = { ...researchQuery, status: 'loading', data: undefined };
    else briefQuery = { ...briefQuery, status: 'loading', data: undefined };
    const loading = render(createElement(StrategyStage, { proposal: qingyuProposal }));
    expect(loading).toContain('正在核对研究与任务卡');
    expect(loading).not.toContain('data-strategy-preview=');
    expect(loading).not.toContain('建议选方向 02');
    if (query === 'research') researchQuery = { ...researchQuery, status: 'error', error: serviceError };
    else briefQuery = { ...briefQuery, status: 'error', error: serviceError };
    const failed = render(createElement(StrategyStage, { proposal: qingyuProposal }));
    expect(failed).toContain('重新核对依据');
    expect(failed).not.toContain('data-strategy-preview=');
    expect(failed).not.toContain('建议选方向 02');
  });
  it('retains the last owner draft on a failed refresh, but refuses a successfully changed head', () => {
    researchQuery.refreshError = serviceError;
    briefQuery.refreshing = true;
    let html = render(createElement(StrategyStage, { proposal: qingyuProposal }));
    expect(html).toContain('上次成功读取的依据');
    expect(html).toContain('尚未重新核对');
    expect(html).toContain('策略建议 · 待验证');
    expect(html).toContain('data-studio-page=');
    expect(html).not.toContain('sample.svg');
    expect(html).toContain('data-strategy-preview=');
    if (!researchQuery.data?.artifact) throw new Error('Research head required');
    researchQuery.data.artifact.id = 'new-head';
    html = render(createElement(StrategyStage, { proposal: qingyuProposal }));
    expect(html).toContain('当前研究头已更换或未匹配');
    expect(html).not.toContain('data-strategy-preview=');
  });
});
