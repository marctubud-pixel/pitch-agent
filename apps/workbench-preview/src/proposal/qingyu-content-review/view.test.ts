import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryState } from '../../app/query';
import { ConfirmProvider } from '../../app/confirm';
import { FeedbackProvider } from '../../app/feedback';
import { RouterProvider } from '../../app/router';
import { ServiceProvider } from '../../app/services';
import { TeamProvider } from '../../collaboration/context';
import { LocalTeamStore } from '../../collaboration/LocalTeamStore';
import { TestStorage } from '../../collaboration/testSupport';
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
import ownerReading from './owner-reading.json';
import { ContentReviewStage } from '../../views/stages/ContentReviewStage';
import { ProposalArea } from '../../views/project/ProposalArea';

let researchQuery: QueryState<ResearchWorkspace>;
let briefQuery: QueryState<BriefHistory>;
vi.mock('../../app/query', () => ({ useServiceQuery: (key: string) => key.startsWith('research-case-briefs:') ? briefQuery : researchQuery }));
vi.mock('../drafts', async () => {
  const actual = await vi.importActual<typeof import('../drafts')>('../drafts');
  function useStoredDraft(key: string) { return [actual.readDraft(key), (patch: Partial<import('../drafts').IdeaDraft>) => actual.writeDraft(key, { ...actual.readDraft(key), ...patch }), () => actual.writeDraft(key, null)]; }
  return { ...actual, useIdeaDraft: useStoredDraft };
});

function render(children: ReactNode, actor = 'human-owner') {
  const team = new LocalTeamStore({ storage: new TestStorage(), sessionStorage: new TestStorage(), autoStart: false }); team.selectActor(actor);
  const store = memoryStore();
  const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  return renderToStaticMarkup(createElement(ServiceProvider, {
    service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }),
    children: createElement(I18nProvider, { children: createElement(ConfirmProvider, { children: createElement(RouterProvider, { mode: 'memory', children: createElement(TeamProvider, { store: team, children: createElement(FeedbackProvider, { children }) }) }) }) }),
  }));
}
beforeEach(async () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 100 }) }) }) });
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  researchQuery = { status: 'success', data: await service.getResearchWorkspace('qingyu'), error: null, refreshError: null, refreshing: false, refetch: vi.fn() };
  briefQuery = { status: 'success', data: await service.getBriefHistory('qingyu'), error: null, refreshError: null, refreshing: false, refetch: vi.fn() };
});
afterEach(() => vi.unstubAllGlobals());

describe('content reading workspace', () => {
  it('attributes the content owner summary to its actual reviewer', () => {
    const html = render(createElement(ContentReviewStage, { proposal: qingyuProposal }));
    const ownerParagraph = renderToStaticMarkup(createElement('p', null, ownerReading.summary.text));
    expect(html).toContain(`<h3>内容审阅负责人</h3>${ownerParagraph}`);
  });

  it('pairs each reviewed direction with its original main and supporting copy', () => {
    const html = render(createElement(ContentReviewStage, { proposal: qingyuProposal }));
    for (const copy of ownerReading.reviewedCopy) {
      const section = html.match(new RegExp(`<section[^>]+data-direction-id="${copy.directionId}"[^>]*>([\\s\\S]*?)</section>`))?.[1];
      expect(section, copy.name).toBeDefined();
      expect(section).toContain(copy.slogan);
      expect(section).toContain(copy.subline);
      expect((section?.match(/<img /g) ?? [])).toHaveLength(2);
    }
    expect(html).toContain('已审文字，尚未确认在图中落位');
  });

  it('shows actual issues, a truthful scope, closed details and no fake approval actions', () => {
    const html = render(createElement(ContentReviewStage, { proposal: qingyuProposal }));
    expect(html).toContain('data-reading-id="qingyu-content-review-owner-r1-20261110"');
    expect(html).toContain('内容尚未冻结');
    expect(html).toContain('待补资料');
    expect(html).toContain('建议整理稿，未替换上游原稿');
    expect((html.match(/class="cr-issue"/g) ?? [])).toHaveLength(3);
    expect((html.match(/<img /g) ?? [])).toHaveLength(6);
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('批准并排版');
    expect(html).not.toContain('已记录的修改对照');
  });

  it('keeps old review state while the active workspace presents layout', () => {
    const proposal = structuredClone(qingyuProposal);
    proposal.currentStage = 'content_review';
    const before = structuredClone(proposal);
    const html = render(createElement(ProposalArea, { proposal, stage: 'layout' }));
    expect(html).toContain('第 6/7 阶段');
    expect(html).toContain('当前演练稿；本地终审与正式流程状态分别记录');
    expect(html).not.toContain('id="contrib-content_review"');
    expect(html).not.toContain('/proposal/content_review');
    expect((html.match(/class="sp-spine"/g) ?? [])).toHaveLength(7);
    expect(html).toContain('/proposal/visual');
    expect(html).toContain('/proposal/delivery');
    expect(proposal).toEqual(before);
  });

  it('shows loading or a recoverable failure without claiming zero issues', () => {
    researchQuery = { status: 'loading', data: undefined, error: null, refreshError: null, refreshing: false, refetch: vi.fn() };
    let html = render(createElement(ContentReviewStage, { proposal: qingyuProposal }));
    expect(html).toContain('正在核对'); expect(html).not.toContain('cr-issue-list');
    researchQuery = { status: 'error', data: undefined, error: toServiceError(new Error('offline')), refreshError: null, refreshing: false, refetch: vi.fn() };
    html = render(createElement(ContentReviewStage, { proposal: qingyuProposal }));
    expect(html).toContain('重新核对依据'); expect(html).not.toContain('cr-issue-list');
  });

  it('retains an old reading with explicit refresh and historical notices', () => {
    if (!briefQuery.data?.current) throw new Error('fixture requires current brief');
    briefQuery.data.current = { ...briefQuery.data.current, version: 2 };
    researchQuery.refreshError = toServiceError(new Error('offline'));
    const html = render(createElement(ContentReviewStage, { proposal: qingyuProposal }));
    expect(html).toContain('历史审读'); expect(html).toContain('刷新失败'); expect(html).toContain('尚未重新核对');
  });

  it('retains formal narratives, changed passages and visitor edit restrictions', () => {
    const proposal = structuredClone(northline);
    proposal.stages.content_review.status = 'done';
    proposal.contentReview = { checks: [{ id: 'actual-check', question: '真实检查', outcome: 'open', note: '原生记录' }], narrative: [{ id: 'actual-passage', title: '正式段落', text: '原生正式正文', before: '原生旧正文', changeReason: '原生修改原因' }] };
    const html = render(createElement(ContentReviewStage, { proposal }), 'human-guest');
    expect(html).toContain('原生正式正文'); expect(html).toContain('原生旧正文');
    expect(html).not.toContain('data-reading-id');
    expect(html).toMatch(/<button hidden=""[^>]+>.*?<svg/s);
  });
});
