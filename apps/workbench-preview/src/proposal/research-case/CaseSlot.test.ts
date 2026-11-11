import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServiceProvider, useServiceContext } from '../../app/services';
import { ConfirmProvider } from '../../app/confirm';
import { RouterProvider } from '../../app/router';
import type { BriefHistory, ResearchWorkspace } from '../../domain/models';
import type { Proposal } from '../../domain/proposal';
import { I18nProvider } from '../../i18n';
import { LocalIntakeService } from '../../services/intake/LocalIntakeService';
import { MockAssistantService } from '../../services/mock/MockAssistantService';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { MockProposalService } from '../../services/proposal/MockProposalService';
import { luma } from '../../services/proposal/fixtures/luma';
import { ResearchStage } from '../../views/stages/ResearchStage';
import { AuthoredCaseSlot } from './CaseSlot';
import { resolveAuthoredCase } from './report';

async function fixture(projectId = 'luma') {
  const store = memoryStore();
  const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const [workspace, history] = await Promise.all([service.getResearchWorkspace(projectId), service.getBriefHistory(projectId)]);
  const wrap = (children: ReactNode) => createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children: createElement(I18nProvider, { children }) });
  return { workspace, history, store, renderCase: () => renderToStaticMarkup(wrap(createElement(AuthoredCaseSlot, { result: resolveAuthoredCase({ requestedProjectId: projectId, workspace, history }) }))), renderStage: (proposal: Proposal) => renderToStaticMarkup(wrap(createElement(ConfirmProvider, { children: createElement(RouterProvider, { mode: 'memory', children: createElement(CachedStage, { workspace, history, proposal }) }) }))) };
}

function CachedStage({ workspace, history, proposal }: { workspace: ResearchWorkspace; history: BriefHistory; proposal: Proposal }) {
  const cache = useServiceContext().cache;
  cache.set(`research:${workspace.project.id}`, workspace);
  cache.set(`research-case-briefs:${workspace.project.id}`, history);
  cache.set(`research-method-briefs:${workspace.project.id}`, history);
  return createElement(ResearchStage, { proposal });
}

describe('authored report visible results', () => {
  it('renders all five concrete chapters, honest figures and original packshots as the default body', async () => {
    const { renderCase } = await fixture();
    const html = renderCase();
    expect(html).toContain('data-case-report="case-report:luma-uk-20261109-v1"');
    for (const title of ['行业与市场', '人群细分', '竞品分析', '产品与包装', '突破口']) expect(html).toContain(`>${title}</h3>`);
    for (const id of ['market-growth', 'new-launch-strength', 'same-day', 'need-states', 'price-abv', 'product-comparison', 'pack-references', 'pack-codes', 'luma-hierarchy', 'opportunity-chain', 'directions']) expect(html).toContain(`data-exhibit="${id}"`);
    expect(html).toContain('销量同比（%）');
    expect(html).toContain('>+2%</text>');
    expect(html).toContain('>-5%</text>');
    expect(html).toContain('>53%</text>');
    expect(html).toContain('>72%</text>');
    expect(html).toContain('最近一次商店买酒后，当天稍后饮用的比例');
    expect(html).toContain('>32%</text>');
    expect(html).toContain('>14%</text>');
    expect(html).toContain('目标25–34岁只是18–34岁的一部分');
    expect(html).toContain('0.727');
    expect(html).toContain('单罐标价 ÷ 容量ml × 100');
    expect(html).toContain('酒精度 / 售价');
    expect(html).toContain('尚未确定');
    expect(html).toContain('>页面标示缺货<');
    expect(html).toContain('src="/research-case/luma-uk-20261109/funkin-passionfruit-pack.jpg"');
    expect(html).not.toContain('funkin-passionfruit.png');
    expect(html).toContain('清爽原料感');
    expect(html).toContain('成熟餐桌感');
    expect(html).toContain('直接口味编码');
    expect(html).not.toContain('探索更多图表形式');
    expect(html).not.toContain('store-observation');
    const visibleText = html.replace(/<[^>]+>/g, '');
    expect(visibleText).not.toContain('case-report:');
    expect(visibleText).not.toContain('art-luma-research');
    expect(visibleText).not.toContain('authored-desk-research');
  });

  it('shows historical and incompatible binding states without retaining the case body', async () => {
    const context = await fixture();
    if (!context.history.current || !context.workspace.artifact) throw new Error('Luma fixture required');
    context.history.current = { ...context.history.current, id: 'brf-luma-v3', version: 3, audience: 'Changed scope' };
    context.history.versions.unshift(context.history.current);
    expect(context.renderCase()).toContain('历史案例，依据简报第2版');
    expect(context.renderCase()).toContain('当前已保存简报为第3版');
    context.workspace.artifact.version = 2;
    const html = context.renderCase();
    expect(html).toContain('data-case-status="head-changed"');
    expect(html).not.toContain('data-case-report=');
    expect(html).not.toContain('data-exhibit=');
  });

  it('withholds a mixed-snapshot case and offers a bounded read recheck', async () => {
    const context = await fixture();
    context.history.project.revision = context.workspace.project.revision + 1;
    const before = context.store.get('proposal-workbench/demo/db/zh-desktop-v1');
    const html = context.renderStage(luma);
    expect(html).toContain('data-case-status="snapshot-mismatch"');
    expect(html).not.toContain('data-case-report=');
    expect(html).toContain('重新核对当前记录');
    expect(html).toContain('既有研究与核验记录');
    expect(context.store.get('proposal-workbench/demo/db/zh-desktop-v1')).toBe(before);
  });

  it('disables repeated recheck while the read queries refresh', () => {
    const html = renderToStaticMarkup(createElement(AuthoredCaseSlot, { result: { kind: 'unavailable', reason: 'snapshot-mismatch', message: '记录不一致' }, recheck: { pending: true, run: () => { throw new Error('A static render must not read services'); } } }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('正在重新核对');
    expect(html).not.toContain('data-case-report=');
  });

  it('places old checks, method and research board together inside the closed history disclosure', async () => {
    const context = await fixture();
    const before = context.store.get('proposal-workbench/demo/db/zh-desktop-v1');
    const html = context.renderStage(luma);
    const split = html.indexOf('<details class="rm-legacy"');
    expect(split).toBeGreaterThan(0);
    const body = html.slice(0, split);
    const history = html.slice(split);
    expect(body).toContain('data-case-report=');
    expect(body).not.toContain('pw-checks');
    expect(body).not.toContain('research-method');
    expect(history).toMatch(/^<details class="rm-legacy"><summary>既有研究与核验记录/);
    expect(history).toContain('pw-checks');
    expect(history).toContain('research-method');
    expect(history).toContain('rs-hero');
    expect(context.store.get('proposal-workbench/demo/db/zh-desktop-v1')).toBe(before);
  });

  it('keeps the existing method and board display for another project', async () => {
    const context = await fixture('northline');
    const html = context.renderStage({ ...luma, id: 'other-case', workbenchId: 'northline' });
    const split = html.indexOf('<details class="rm-legacy"');
    expect(html).not.toContain('data-case-report=');
    expect(html.slice(0, split)).toContain('research-method');
    expect(html).toContain('既有研究板 · 案例、图表与原报告');
  });
});
