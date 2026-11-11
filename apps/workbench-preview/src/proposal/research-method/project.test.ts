import { describe, expect, it } from 'vitest';
import type { EvidenceTopic } from '../../domain/models';
import { createResearchMethodPlan, methodBriefSnapshot, methodNodes } from '../../domain/researchMethod';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { buildSeedDatabase } from '../../services/mock/fixtures/seed';
import { localizeDeep } from '../../services/mock/i18n';
import { createResearchVersion } from '../../services/mock/simulation';
import { memoryStore } from '../../services/mock/storage';
import { planMatches, projectResearch, reviewLabel } from './project';

async function luma() {
  const svc = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  const [workspace, history] = await Promise.all([svc.getResearchWorkspace('luma'), svc.getBriefHistory('luma')]);
  return { workspace, history };
}

describe('research method projection', () => {
  it('tailors visual questions from the historical type and keeps missing type generic', async () => {
    const { history } = await luma();
    if (!history.current) throw new Error('Fixture requires brief');
    const snapshot = methodBriefSnapshot(history.current);
    expect(methodNodes(snapshot).find(n => n.id === 'D')?.title).toBe('产品与视觉');
    expect(methodNodes({ ...snapshot, proposalType: 'packaging' }).find(n => n.id === 'D')?.questions.join('')).toContain('材质、工艺');
    expect(methodNodes({ ...snapshot, proposalType: 'kv' }).find(n => n.id === 'D')?.questions.join('')).toContain('投放媒介');
    expect(methodNodes({ ...snapshot, proposalType: 'kv' }).find(n => n.id === 'D')?.questions.join('')).not.toContain('货架');
  });

  it('shows three supported diagram forms from the exact original fixture without modifying it', async () => {
    const { workspace, history } = await luma();
    const before = JSON.stringify({ workspace, history });
    const method = projectResearch(workspace, history);
    expect(method.planState).toBe('legacy');
    expect(method.figures.map(f => f.kind)).toEqual(['bars', 'matrix', 'chain']);
    expect(method.figures[0]).toMatchObject({ rows: [{ metric: { value: 4 } }, { metric: { value: 2 } }], origin: { sourceIds: ['src-luma-audit'], claimIds: ['art-luma-research-v1-c1'] } });
    expect(method.observations.some(claim => claim.id === 'art-luma-research-v1-c1')).toBe(true);
    const chain = method.figures.find(figure => figure.kind === 'chain');
    if (!chain || chain.kind !== 'chain') throw new Error('Insight chain required');
    expect(chain.steps[0].label).toBe('观察');
    expect(JSON.stringify({ workspace, history })).toBe(before);
    expect(workspace.artifact?.researchMethodPlan).toBeUndefined();
  });

  it('uses historical brief scope and only compares the current brief for staleness', async () => {
    const { workspace, history } = await luma();
    if (!history.current) throw new Error('Fixture requires current brief');
    history.current = { ...history.current, id: 'brf-luma-v4', version: 4, brand: '新品牌', audience: '新受众', researchQuestions: ['新版范围问题'], proposalType: 'kv' };
    history.versions.unshift(history.current);
    const method = projectResearch(workspace, history);
    expect(method.stale).toBe(true);
    expect(method.brief?.version).toBe(2);
    expect(method.brief?.brand).not.toBe('新品牌');
    expect(method.brief?.proposalType).toBeUndefined();
    expect(method.nodes.flatMap(n => n.questions)).not.toContain('新版范围问题');
    expect(method.figures[0].kind).toBe('bars');
  });

  it('distinguishes missing historical brief, no report and a different project', async () => {
    const { workspace, history } = await luma();
    const missing = projectResearch(workspace, { ...history, versions: [] });
    expect(missing.brief).toBeNull();
    expect(missing.planState).toBe('unavailable');
    expect(missing.figures.some(f => f.kind === 'bars')).toBe(false);
    expect(missing.claims).toHaveLength(workspace.claims.length);
    const empty = projectResearch({ ...workspace, artifact: null }, history);
    expect(empty.figures).toEqual([]);
    expect(empty.claims).toEqual([]);
    expect(empty.nodes.map(n => n.id)).toEqual(['A', 'B', 'D', 'C']);
    const other = projectResearch({ ...workspace, project: { ...workspace.project, id: 'another' } }, history);
    expect(other.claims).toEqual([]);
    expect(other.brief).toBeNull();
  });

  it.each(['excerpt', 'title', 'publisher', 'url', 'capturedAt'])('invalidates fixed counts after a source %s edit', async field => {
    const { workspace, history } = await luma();
    const source = workspace.sources.find(s => s.id === 'src-luma-audit');
    if (!source) throw new Error('Fixture requires audit');
    if (field === 'excerpt') source.excerpt = source.excerpt.replace('four', 'five');
    else if (field === 'title') source.title += ' 已编辑';
    else if (field === 'publisher') source.publisher += ' 已编辑';
    else if (field === 'url') source.url += '/edited';
    else source.capturedAt = '2026-11-01T00:00:00Z';
    const method = projectResearch(workspace, history);
    expect(method.figures.map(f => f.kind)).toEqual(['matrix', 'chain']);
    expect(method.attachmentReason).toContain('不一致');
  });

  it('invalidates fixed counts on changed claim text, assignments, exact ids or brief scope', async () => {
    for (const change of ['text', 'source', 'id', 'brief']) {
      const { workspace, history } = await luma();
      const claim = workspace.claims.find(c => c.id === 'art-luma-research-v1-c1');
      if (!claim || !workspace.artifact || !history.current) throw new Error('Fixture incomplete');
      if (change === 'text') claim.text = '新的陈列论点';
      if (change === 'source') claim.sourceIds = ['src-luma-audit'];
      if (change === 'id') { claim.id = 'regenerated-c1'; workspace.artifact.claimIds = workspace.artifact.claimIds.map(id => id === 'art-luma-research-v1-c1' ? claim.id : id); }
      if (change === 'brief') history.versions.find(b => b.version === 2)!.constraints.push('新的限制');
      expect(projectResearch(workspace, history).figures.some(f => f.kind === 'bars'), change).toBe(false);
    }
  });

  it('reads updated support, source availability and outdated/failed review without promoting them', async () => {
    const { workspace, history } = await luma();
    const claim = workspace.claims[0];
    claim.supportStatus = 'missing_citation';
    claim.sourceIds = ['missing-source'];
    const method = projectResearch(workspace, history);
    expect(method.claims[0].supportStatus).toBe('missing_citation');
    const matrix = method.figures.find(f => f.kind === 'matrix');
    expect(matrix?.rows[0].cells.map(c => c.text)).toEqual(['缺少引用', '引用记录缺失', '未记录限制']);
    expect(reviewLabel(null)).toBe('尚无评审记录');
    expect(reviewLabel(workspace.verification)).toBe('评审未通过');
    if (!workspace.verification) throw new Error('Fixture requires review');
    expect(reviewLabel({ ...workspace.verification, outdated: true, outdatedReason: '来源已修改' })).toContain('评审已过期');
  });

  it('retains current source verification status without silently changing the recorded count', async () => {
    const { workspace, history } = await luma();
    const source = workspace.sources.find(s => s.id === 'src-luma-audit');
    if (!source) throw new Error('Fixture requires audit');
    source.verificationStatus = 'insufficient';
    const figure = projectResearch(workspace, history).figures[0];
    expect(figure.kind).toBe('bars');
    expect(figure.origin.note).toContain('依据不足');
  });

  it('keeps regenerated unverified claims pending in the insight chain', async () => {
    const { workspace, history } = await luma();
    workspace.claims.forEach(claim => { claim.supportStatus = 'unverified'; });
    const before = JSON.stringify(workspace);
    const method = projectResearch(workspace, history);
    const chain = method.figures.find(figure => figure.kind === 'chain');
    if (!chain || chain.kind !== 'chain') throw new Error('Insight chain required');
    expect(chain.steps[0].label).toBe('待核验论点');
    expect(chain.steps[0].text).toContain('尚无已核验且引用完整的观察');
    expect(chain.steps[2].text).toContain('暂不能据此提出有依据的机会');
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it.each(['missing-source', 'unverified-source', 'insufficient-source', 'outdated-review', 'misbound-review', 'missing-review'])('does not promote supported claims with %s', async state => {
    const { workspace, history } = await luma();
    workspace.claims.forEach((claim, index) => { claim.supportStatus = index === 0 ? 'supported' : 'unverified'; });
    const claim = workspace.claims[0];
    const source = workspace.sources.find(source => source.id === claim.sourceIds[0]);
    if (!source || !workspace.verification) throw new Error('Verification fixture required');
    if (state === 'missing-source') claim.sourceIds.push('missing-source');
    if (state === 'unverified-source') source.verificationStatus = 'unverified';
    if (state === 'insufficient-source') source.verificationStatus = 'insufficient';
    if (state === 'outdated-review') workspace.verification.outdated = true;
    if (state === 'misbound-review') workspace.verification.artifactVersion += 1;
    if (state === 'missing-review') workspace.verification = null;
    const method = projectResearch(workspace, history);
    const chain = method.figures.find(figure => figure.kind === 'chain');
    if (!chain || chain.kind !== 'chain') throw new Error('Insight chain required');
    expect(chain.steps[0].label).toBe('待核验论点');
    expect(chain.steps[2].text).not.toContain('可将已支持观察');
    expect(method.observations).toEqual([]);
    expect(claim.supportStatus).toBe('supported');
  });

  it('uses all five evidence topic labels including cultural context', async () => {
    const { workspace, history } = await luma();
    if (!workspace.artifact) throw new Error('Research fixture required');
    const topics: EvidenceTopic[] = ['audience', 'category', 'competitor', 'cultural', 'production'];
    workspace.claims = topics.map((topic, index) => ({ ...workspace.claims[0], id: `topic-${index}`, topic }));
    workspace.artifact.claimIds = workspace.claims.map(claim => claim.id);
    const matrix = projectResearch(workspace, history).figures.find(figure => figure.kind === 'matrix');
    if (!matrix || matrix.kind !== 'matrix') throw new Error('Evidence matrix required');
    expect(matrix.rows.map(row => row.label.split(' · ')[1])).toEqual(workspace.claims.map(claim => ({ audience: '人群', category: '行业', competitor: '竞争', cultural: '文化背景', production: '产品' })[claim.topic]));
    expect(matrix.rows.some(row => row.label.endsWith('文化背景'))).toBe(true);
  });
});

describe('generation plan binding', () => {
  it.each(['custom-project', 'edited-seeded-project'])('preserves user research question wording through simulated %s service reads', async scope => {
    const db = buildSeedDatabase();
    const template = db.projects.find(project => project.id === 'luma');
    const originalBrief = db.briefs.find(brief => brief.id === 'brf-luma-v2');
    if (!template || !originalBrief) throw new Error('Luma fixture required');
    const question = 'How do competitors signal flavour and strength?';
    const project = scope === 'custom-project' ? { ...template, id: 'custom-method-project', name: 'User research project' } : template;
    if (scope === 'custom-project') db.projects.push(project);
    const brief = { ...originalBrief, id: `brf-user-method-${scope}`, projectId: project.id, version: scope === 'custom-project' ? 1 : 3, researchQuestions: [question] };
    db.briefs.push(brief);
    let n = 0;
    const artifact = createResearchVersion(db, project, '2026-11-09T00:00:00Z', null, prefix => `${prefix}-user-method-${++n}`);
    const before = JSON.stringify(artifact.researchMethodPlan);
    expect(artifact.researchMethodPlan?.binding.brief.researchQuestions).toEqual([question]);
    expect(artifact.researchMethodPlan?.nodes.find(node => node.id === 'A')?.questions).toContain(question);
    const store = memoryStore();
    store.set('proposal-workbench/demo/db/zh-desktop-v1', JSON.stringify(db));
    const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const [workspace, history] = await Promise.all([service.getResearchWorkspace(project.id), service.getBriefHistory(project.id)]);
    expect(history.current?.researchQuestions).toEqual([question]);
    expect(workspace.artifact?.researchMethodPlan?.binding.brief.researchQuestions).toEqual([question]);
    const projection = projectResearch(workspace, history);
    expect(projection.planState).toBe('recorded');
    expect(projection.nodes.find(node => node.id === 'A')?.questions).toContain(question);
    expect(projection.nodes.find(node => node.id === 'A')?.questions).not.toContain('竞品如何传达口味和酒精度？');
    expect(JSON.stringify(artifact.researchMethodPlan)).toBe(before);
  });

  it('still localizes the original seeded Luma question through public service reads', async () => {
    const db = buildSeedDatabase();
    const project = db.projects.find(project => project.id === 'luma');
    if (!project) throw new Error('Luma fixture required');
    let n = 0;
    createResearchVersion(db, project, '2026-11-09T00:00:00Z', null, prefix => `${prefix}-fixture-method-${++n}`);
    const store = memoryStore();
    store.set('proposal-workbench/demo/db/zh-desktop-v1', JSON.stringify(db));
    const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const [workspace, history] = await Promise.all([service.getResearchWorkspace('luma'), service.getBriefHistory('luma')]);
    const projection = projectResearch(workspace, history);
    expect(projection.planState).toBe('recorded');
    expect(projection.nodes.find(node => node.id === 'A')?.questions).toContain('竞品如何传达口味和酒精度？');
    expect(history.current?.researchQuestions).toContain('竞品如何传达口味和酒精度？');
  });

  it('keeps a raw-English seeded Morrow plan valid through actual public service reads', async () => {
    const db = buildSeedDatabase();
    const project = db.projects.find(p => p.id === 'morrow');
    if (!project) throw new Error('Morrow fixture required');
    let n = 0;
    const artifact = createResearchVersion(db, project, '2026-11-09T00:00:00Z', null, prefix => `${prefix}-public-method-${++n}`);
    const store = memoryStore();
    store.set('proposal-workbench/demo/db/zh-desktop-v1', JSON.stringify(db));
    const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const [workspace, history] = await Promise.all([service.getResearchWorkspace('morrow'), service.getBriefHistory('morrow')]);
    expect(workspace.artifact?.id).toBe(artifact.id);
    expect(history.current?.background).not.toBe(db.briefs.find(b => b.id === history.current?.id)?.background);
    expect(projectResearch(workspace, history).planState).toBe('recorded');
  });

  it('attaches a new exact plan only at existing local generation and remaps all claim references', () => {
    const db = buildSeedDatabase();
    const project = db.projects.find(p => p.id === 'luma');
    if (!project) throw new Error('Fixture requires project');
    let n = 0;
    const artifact = createResearchVersion(db, project, '2026-11-09T00:00:00Z', null, prefix => `${prefix}-method-test-${++n}`);
    const brief = db.briefs.find(b => b.projectId === 'luma' && b.version === artifact.basedOn.briefVersion);
    if (!brief) throw new Error('Fixture requires brief');
    expect(artifact.researchMethodPlan?.binding).toMatchObject({ artifactId: artifact.id, artifactVersion: 2, projectId: 'luma', brief: { id: brief.id, version: 2 } });
    expect(artifact.researchMethodPlan?.nodes[3]).toMatchObject({ kind: 'synthesis', dependsOn: ['A', 'B', 'D'] });
    expect(artifact.claimIds.every(id => id.startsWith('clm-method-test-'))).toBe(true);
    const paragraphRefs = artifact.sections.flatMap(s => s.blocks.flatMap(b => b.kind === 'paragraph' ? b.segments.flatMap(p => typeof p === 'string' ? [] : [p.claimId]) : []));
    expect(paragraphRefs.every(id => artifact.claimIds.includes(id))).toBe(true);
    const workspace = { project, artifact, claims: db.claims.filter(c => c.artifactId === artifact.id), sources: db.sources.filter(s => s.projectId === project.id), verification: null, readiness: null, gaps: [], activeJobs: [], versions: [] };
    expect(planMatches(artifact.researchMethodPlan, workspace, brief)).toBe(true);
    const localized = localizeDeep({ workspace, brief });
    expect(planMatches(localized.workspace.artifact.researchMethodPlan, localized.workspace, localized.brief)).toBe(true);
    const projection = projectResearch(localized.workspace, { project: localized.workspace.project, current: localized.brief, versions: [localized.brief], dependentArtifacts: [], attachments: [] });
    expect(projection.planState).toBe('recorded');
    expect(projection.figures.some(f => f.kind === 'bars')).toBe(false);
    expect(projection.observations).toEqual([]);
    const chain = projection.figures.find(figure => figure.kind === 'chain');
    if (!chain || chain.kind !== 'chain') throw new Error('Insight chain required');
    expect(chain.steps[0].label).toBe('待核验论点');
  });

  it('rejects wrong project/artifact/version/snapshot and malformed metadata without writing', async () => {
    const { workspace, history } = await luma();
    if (!workspace.artifact || !history.current) throw new Error('Fixture incomplete');
    const plan = createResearchMethodPlan(workspace.artifact, history.current);
    expect(planMatches(plan, workspace, history.current)).toBe(true);
    expect(planMatches({}, workspace, history.current)).toBe(false);
    expect(planMatches({ kind: 'dot-research-plan', binding: null }, workspace, history.current)).toBe(false);
    expect(planMatches({ ...plan, binding: { ...plan.binding, artifactId: 'wrong' } }, workspace, history.current)).toBe(false);
    expect(planMatches({ ...plan, binding: { ...plan.binding, artifactVersion: 9 } }, workspace, history.current)).toBe(false);
    expect(planMatches({ ...plan, binding: { ...plan.binding, projectId: 'wrong' } }, workspace, history.current)).toBe(false);
    expect(planMatches(plan, workspace, { ...history.current, audience: '新范围' })).toBe(false);
    expect(Object.keys(methodBriefSnapshot(history.current))).not.toContain('objectives');
    workspace.artifact.researchMethodPlan = { ...plan, binding: { ...plan.binding, artifactId: 'wrong' } };
    expect(projectResearch(workspace, history).planState).toBe('mismatch');
  });

  it('accepts equivalent snapshot property order and renders frozen question wording', async () => {
    const { workspace, history } = await luma();
    if (!workspace.artifact || !history.current) throw new Error('Fixture incomplete');
    const plan = createResearchMethodPlan(workspace.artifact, history.current);
    plan.nodes = plan.nodes.map(node => ({ ...node, title: `历史标题 ${node.id}`, questions: [`历史问题 ${node.id}`] }));
    const reordered = { nodes: [...plan.nodes].reverse(), binding: { brief: Object.fromEntries(Object.entries(plan.binding.brief).reverse()), artifactVersion: plan.binding.artifactVersion, artifactId: plan.binding.artifactId, projectId: plan.binding.projectId }, schemaVersion: plan.schemaVersion, kind: plan.kind };
    expect(planMatches(reordered, workspace, history.current)).toBe(true);
    Object.defineProperty(workspace.artifact, 'researchMethodPlan', { value: reordered, configurable: true, enumerable: true });
    const projection = projectResearch(workspace, history);
    expect(projection.planState).toBe('recorded');
    expect(projection.nodes.find(node => node.id === 'D')).toMatchObject({ title: '历史标题 D', questions: ['历史问题 D'] });
    expect(projection.nodes.find(node => node.id === 'C')).toMatchObject({ title: '历史标题 C', questions: ['历史问题 C'] });
  });

  it.each([false, null, undefined, {}, 0, ''])('treats present invalid plan %s as a mismatch', async raw => {
    const { workspace, history } = await luma();
    if (!workspace.artifact) throw new Error('Fixture incomplete');
    Object.defineProperty(workspace.artifact, 'researchMethodPlan', { value: raw, enumerable: true });
    expect(projectResearch(workspace, history).planState).toBe('mismatch');
  });

  it('rejects malformed node sets, fields, topics, dependencies and numeric versions', async () => {
    const { workspace, history } = await luma();
    if (!workspace.artifact || !history.current) throw new Error('Fixture incomplete');
    const plan = createResearchMethodPlan(workspace.artifact, history.current);
    const input = plan.nodes[0];
    const synthesis = plan.nodes[3];
    for (const nodes of [
      plan.nodes.slice(0, 3),
      [input, input, plan.nodes[2], synthesis],
      [{ ...input, id: 'X' }, ...plan.nodes.slice(1)],
      [{ ...input, title: 7 }, ...plan.nodes.slice(1)],
      [{ ...input, questions: ['question', null] }, ...plan.nodes.slice(1)],
      [{ ...input, topics: ['not-a-topic'] }, ...plan.nodes.slice(1)],
      [{ ...input, dependsOn: ['B'] }, ...plan.nodes.slice(1)],
      [...plan.nodes.slice(0, 3), { ...synthesis, dependsOn: ['A', 'B', 'B'] }],
      [...plan.nodes.slice(0, 3), { ...synthesis, kind: 'input' }],
    ]) expect(planMatches({ ...plan, nodes }, workspace, history.current)).toBe(false);
    expect(planMatches({ ...plan, binding: { ...plan.binding, artifactVersion: String(plan.binding.artifactVersion) } }, workspace, history.current)).toBe(false);
    expect(planMatches({ ...plan, binding: { ...plan.binding, brief: { ...plan.binding.brief, version: String(plan.binding.brief.version) } } }, workspace, history.current)).toBe(false);
  });
});
