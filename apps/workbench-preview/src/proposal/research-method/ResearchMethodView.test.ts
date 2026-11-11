import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServiceProvider, useServiceContext } from '../../app/services';
import type { BriefHistory, ResearchWorkspace } from '../../domain/models';
import { createResearchMethodPlan } from '../../domain/researchMethod';
import { LocalIntakeService } from '../../services/intake/LocalIntakeService';
import { MockAssistantService } from '../../services/mock/MockAssistantService';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { MockProposalService } from '../../services/proposal/MockProposalService';
import { ResearchMethodView } from './ResearchMethodView';

async function fixture() {
  const store = memoryStore();
  const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const [workspace, history] = await Promise.all([service.getResearchWorkspace('luma'), service.getBriefHistory('luma')]);
  function render() {
    return renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children: createElement(CachedMethod, { workspace, history }) }));
  }
  return { workspace, history, render };
}

function CachedMethod({ workspace, history }: { workspace: ResearchWorkspace; history: BriefHistory }) {
  useServiceContext().cache.set(`research-method-briefs:${workspace.project.id}`, history);
  return createElement(ResearchMethodView, { workspace, onClaim: () => undefined, onOpenChecks: () => undefined });
}

describe('research method visible content', () => {
  it('renders the recorded titles and questions for all four historical nodes', async () => {
    const { workspace, history, render } = await fixture();
    if (!workspace.artifact || !history.current) throw new Error('Research fixture required');
    const plan = createResearchMethodPlan(workspace.artifact, history.current);
    plan.nodes = plan.nodes.map(node => ({ ...node, title: `冻结标题 ${node.id}`, questions: [`冻结问题 ${node.id}`] }));
    workspace.artifact.researchMethodPlan = plan;
    const html = render();
    expect(html).toContain('data-method-state="recorded"');
    for (const id of ['A', 'B', 'D', 'C']) {
      expect(html).toContain(`冻结标题 ${id}`);
      expect(html).toContain(`冻结问题 ${id}`);
    }
    expect(html).not.toContain('行业与使用场景发生了什么变化？');
  });

  it.each(['unverified', 'missing-source', 'outdated-review'])('keeps chain, cards and synthesis pending for %s', async state => {
    const { workspace, render } = await fixture();
    workspace.claims.forEach(claim => { claim.supportStatus = 'supported'; });
    if (state === 'unverified') workspace.claims.forEach(claim => { claim.supportStatus = 'unverified'; });
    if (state === 'missing-source') workspace.claims.forEach(claim => claim.sourceIds.push('missing-source'));
    if (state === 'outdated-review') {
      if (!workspace.verification) throw new Error('Verification fixture required');
      workspace.verification.outdated = true;
    }
    const html = render();
    expect(html).toContain('待核验论点');
    expect(html).toContain('当前论点仍待核验，尚无引用完整且核验有效的观察可供汇合。');
    expect(html).toContain('先取得完整依据并完成有效核验，暂不将现有问题或论点写成设计结论。');
    expect(html).toContain('当前引用或有效核验尚未满足，不能作为已证实观察。');
    expect(html).not.toContain('可参考已支持的观察');
    expect(html).not.toContain('可以从已支持的观察提出方向候选');
  });
});
