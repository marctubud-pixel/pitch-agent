import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { qingyuR4Report } from '../qingyu-report/bundle-r4';
import { parseQingyuR4 } from '../qingyu-report/report-r4';
import { northline } from '../../services/proposal/fixtures/northline';
import authored from './draft-r3.json';
import { parseStrategyDocument, parseStrategyIdentity, strategyIdentity } from './content';
import { resolveQingyuStrategyPreview } from './preview';

async function input() {
  const store = memoryStore();
  const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  return { proposal: structuredClone(qingyuProposal), workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}
afterEach(() => {
  vi.doUnmock('../qingyu-report/content-r4.json?raw');
  vi.doUnmock('./draft-r3.json?raw');
  vi.doUnmock('./identity.json');
  vi.resetModules();
});

describe('Qingyu authored strategy boundary', () => {
  it('uses the exact original R4 bytes, with the documented file SHA for both live and sealed input', () => {
    for (const path of ['../qingyu-report/content-r4.json', './basis-r4.txt']) {
      const bytes = readFileSync(new URL(path, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe('f784b423d412484e8323e7bb12033ab18198ff3e59634c34b86d1c2e67cbea8d');
    }
  });
  it('returns the exact reviewed body and separates R4 closure from new user and public inputs without changing state', async () => {
    if (qingyuR4Report.kind !== 'valid') throw new Error('Actual R4 required');
    const data = await input(), before = JSON.stringify(data);
    const result = resolveQingyuStrategyPreview(data);
    expect(result.kind).toBe('current');
    if (result.kind !== 'current') throw new Error('Current preview required');
    const p = result.preview, r4 = qingyuR4Report.report;
    expect(p.claims.map(c => c.id)).toEqual(authored.ledger.claims.map(c => c.id));
    expect(p.document.body).toBe(readFileSync(new URL('./reviewed-strategy.md', import.meta.url), 'utf8'));
    expect(p.document.sections).toHaveLength(5);
    expect(p.document.sections.flatMap(s => s.blocks).some(b => b.kind === 'table' && b.rows.length === 5)).toBe(true);
    expect(p.basis.research.origin.skillRevision).toBe('r6-20261109');
    expect(p.basis.strategy.strategy.skillRevision).toBe('r3-20261110');
    expect(p.basis.strategy.reviews.map(r => r.roleKind)).toEqual(['brand', 'user', 'strategy']);
    expect(p.brief).toMatchObject({ basisVersion: 1, basisConfirmed: false, latestVersion: 1, latestConfirmed: false });
    for (const original of authored.ledger.claims) {
      const closed = p.claims.find(c => c.id === original.id);
      if (!closed) throw new Error('Original claim missing');
      expect(closed.judgment).toBe(original.judgment);
      for (const ref of original.researchR4) {
        expect([...closed.research.facts, ...closed.research.findings].some(item => item.id === ref.id)).toBe(true);
        for (const id of ref.sourceIds) expect(closed.research.sources).toContainEqual(r4.sources.find(s => s.id === id));
      }
      for (const finding of closed.research.findings) for (const id of finding.factIds) expect(closed.research.facts.some(f => f.id === id)).toBe(true);
      for (const fact of closed.research.facts) {
        for (const id of fact.derivedFrom) expect(closed.research.facts.some(f => f.id === id)).toBe(true);
        for (const id of fact.sourceIds) expect(closed.research.sources).toContainEqual(r4.sources.find(s => s.id === id));
      }
      for (const source of closed.research.sources) expect(source.locator.length).toBeGreaterThan(0);
    }
    expect(p.claims.find(c => c.id === 'J2')?.research.facts.find(f => f.id === 'R4P17')?.quantity).toMatchObject({ value: 30.2, unit: '%' });
    expect(p.claims.find(c => c.id === 'J3')?.supplements.map(s => s.id)).toContain('U-PRODUCT-01');
    expect(p.claims.find(c => c.id === 'J3')?.supplements.map(s => s.id)).toContain('HUPAO-CULTURE');
    expect(p.claims.every(c => c.research.sources.every(s => !authored.supplements.some(extra => extra.id === s.id)))).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
    expect(data.proposal.stages.strategy.status).toBe('not_started');
    expect(data.proposal.stages.research.status).toBe('needs_revision');
    expect(data.workspace.artifact?.release).toBeNull();
  });
  it.each(['proposal', 'workbench', 'type', 'formal-strategy', 'project', 'revision', 'head', 'head-version', 'brief', 'missing-brief', 'roster', 'simulated'])('refuses %s instead of substituting another strategy', async mutation => {
    const data = await input();
    if (!data.workspace.artifact) throw new Error('Research head required');
    const brief = data.history.versions[0];
    if (!brief) throw new Error('Historical brief required');
    if (mutation === 'proposal') data.proposal.id = 'other-proposal';
    if (mutation === 'workbench') data.proposal.workbenchId = 'northline';
    if (mutation === 'type') data.proposal.type = 'kv';
    if (mutation === 'formal-strategy') data.proposal.strategy = northline.strategy;
    if (mutation === 'project') data.history.project.id = 'foreign';
    if (mutation === 'revision') data.history.project.revision += 1;
    if (mutation === 'head') data.workspace.artifact.id = 'new-research';
    if (mutation === 'head-version') data.workspace.artifact.version += 1;
    if (mutation === 'brief') brief.objectives.push('Same-version content drift');
    if (mutation === 'missing-brief') data.history.versions = [];
    if (mutation === 'roster') data.workspace.versions.push(structuredClone(data.workspace.versions[0] ?? data.workspace.artifact));
    if (mutation === 'simulated') data.workspace.artifact.simulated = false;
    expect(resolveQingyuStrategyPreview(data).kind).toBe('unavailable');
  });
  it('keeps historical context and reads confirmation from actual brief records', async () => {
    const data = await input();
    if (!data.history.current) throw new Error('Current brief required');
    data.history.current = { ...data.history.current, id: 'brf-qingyu-v2', version: 2, audience: '新的受众', confirmedAt: '2026-11-09T12:00:00Z' };
    const result = resolveQingyuStrategyPreview(data);
    expect(result.kind).toBe('historical');
    if (result.kind !== 'historical') throw new Error('Historical preview required');
    expect(result.latestBriefVersion).toBe(2);
    expect(result.preview.brief).toEqual({ basisVersion: 1, basisConfirmed: false, latestVersion: 2, latestConfirmed: true });
    const original = data.history.versions.find(b => b.version === 1);
    if (!original) throw new Error('Basis brief required');
    original.confirmedAt = '2026-11-09T13:00:00Z';
    const confirmed = resolveQingyuStrategyPreview(data);
    if (confirmed.kind !== 'historical') throw new Error('Historical preview required');
    expect(confirmed.preview.brief.basisConfirmed).toBe(true);
  });
  it('does not persist, confirm, release or advance business state while resolving readable and refused inputs', async () => {
    const store = memoryStore();
    const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const data = { proposal: structuredClone(qingyuProposal), workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
    const before = JSON.stringify(data);
    const write = vi.spyOn(store, 'set');
    const remove = vi.spyOn(store, 'remove');
    expect(resolveQingyuStrategyPreview(data).kind).toBe('current');
    expect(resolveQingyuStrategyPreview({ ...data, proposal: { ...data.proposal, id: 'foreign' } }).kind).toBe('unavailable');
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(JSON.stringify(data)).toBe(before);
    expect(await service.getResearchWorkspace('qingyu')).toEqual(data.workspace);
    expect(await service.getBriefHistory('qingyu')).toEqual(data.history);
  });
  it('refuses one-word R4 drift even when report and evidence IDs are unchanged', async () => {
    const raw = readFileSync(new URL('../qingyu-report/content-r4.json', import.meta.url), 'utf8');
    const changed = raw.replace('竞争已有不同解释', '竞争已有多种解释');
    expect(changed).not.toBe(raw);
    expect(parseQingyuR4(JSON.parse(changed)).kind).toBe('valid');
    vi.doMock('../qingyu-report/content-r4.json?raw', () => ({ default: changed }));
    const changedModule = await import('./preview');
    expect(changedModule.resolveQingyuStrategyPreview(await input())).toMatchObject({ kind: 'unavailable', reason: 'r4-mismatch' });
  });
  it.each(['research-id', 'research-source', 'supplement', 'checked-evidence'])('refuses a later claim with unknown %s', async mutation => {
    const changed = structuredClone(authored), later = changed.ledger.claims.find(c => c.id === 'J7');
    if (!later || !later.researchR4[0]) throw new Error('Validation claim required');
    if (mutation === 'research-id') later.researchR4[0].id = 'unknown-reference';
    if (mutation === 'research-source') later.researchR4[0].sourceIds.push('unknown-source');
    if (mutation === 'supplement') later.supplementalSourceIds.push('unknown-supplement');
    if (mutation === 'checked-evidence') later.checkedEvidenceIds.push('unknown-evidence');
    vi.doMock('./draft-r3.json?raw', () => ({ default: JSON.stringify(changed) }));
    const changedModule = await import('./preview');
    expect(changedModule.resolveQingyuStrategyPreview(await input())).toMatchObject({ kind: 'unavailable', reason: 'draft-invalid' });
  });
  it.each(['body-drift', 'claim-text-drift', 'supplement-text-drift', 'duplicate-claim', 'research-identity', 'duplicate-supplement'])('rejects %s at the document boundary', mutation => {
    if (qingyuR4Report.kind !== 'valid') throw new Error('Actual R4 required');
    const changed = structuredClone(authored);
    const firstClaim = changed.ledger.claims[0], firstSupplement = changed.supplements[0];
    if (!firstClaim || !firstSupplement) throw new Error('Actual source required');
    if (mutation === 'body-drift') changed.body += '未经评审的新摘要';
    if (mutation === 'claim-text-drift') firstClaim.judgment = '已证明消费者偏好青屿';
    if (mutation === 'supplement-text-drift') firstSupplement.text = '已完成感官和购买效果验证';
    if (mutation === 'duplicate-claim') changed.ledger.claims.push(structuredClone(firstClaim));
    if (mutation === 'research-identity') changed.ledger.basis.researchOrigin.skillRevision = 'r3-20261110';
    if (mutation === 'duplicate-supplement') changed.supplements.push(structuredClone(firstSupplement));
    const report = qingyuR4Report.report;
    expect(() => parseStrategyDocument(changed, report)).toThrow();
  });
  it.each(['missing-role', 'duplicate-role', 'unknown-role', 'different-draft', 'not-approved', 'wrong-scope', 'scope-text-drift', 'role-label-drift', 'report-substitution', 'first-read-drift', 'research-drift'])('does not expose the reviewed body for %s', async mutation => {
    const changed = structuredClone(strategyIdentity), review = changed.reviews[0];
    if (!review) throw new Error('Actual review required');
    if (mutation === 'missing-role') changed.reviews.pop();
    if (mutation === 'duplicate-role') changed.reviews[1] = structuredClone(review);
    if (mutation === 'unknown-role') review.roleKind = 'customer-approval';
    if (mutation === 'different-draft') review.draftSha256 = '0'.repeat(64);
    if (mutation === 'not-approved') review.verdict = '修改后再评审';
    if (mutation === 'wrong-scope') changed.scopeId = 'proven-consumer-purchase';
    if (mutation === 'scope-text-drift') changed.scope = '客户已批准，消费者实测胜出，可以扩大投入';
    if (mutation === 'role-label-drift') review.label = '真实客户批准';
    if (mutation === 'report-substitution') review.report = structuredClone(changed.reviews[1].report);
    if (mutation === 'first-read-drift') review.firstReadSha256 = '0'.repeat(64);
    if (mutation === 'research-drift') changed.research.skillRevision = 'r3-20261110';
    vi.doMock('./identity.json', () => ({ default: changed }));
    const changedModule = await import('./preview');
    const result = changedModule.resolveQingyuStrategyPreview(await input());
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'draft-invalid' });
    expect('preview' in result).toBe(false);
  });
  it('binds the packaged JSON and reviewed Markdown to their actual local bytes', () => {
    for (const [file, key] of [['draft-r3.json', 'draft-r3.json'], ['reviewed-strategy.md', 'strategy.md']] satisfies [string, 'draft-r3.json' | 'strategy.md'][]) {
      const bytes = readFileSync(new URL(`./${file}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(strategyIdentity.artifacts[key].sha256);
    }
    if (qingyuR4Report.kind !== 'valid') throw new Error('Actual R4 required');
    const document = parseStrategyDocument(authored, qingyuR4Report.report);
    expect(parseStrategyIdentity(strategyIdentity, document, qingyuR4Report.report).draftId).toBe('qingyu-strategy-r3-v2');
  });
});
