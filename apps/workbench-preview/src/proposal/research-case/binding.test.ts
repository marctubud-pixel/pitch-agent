import { describe, expect, it } from 'vitest';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { resolveCaseBinding } from './binding';
import { originalLumaAttachments } from '../research-method/lumaReference';

async function fixture(basis?: typeof originalLumaAttachments[number]['brief']) {
  const store = memoryStore();
  const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const [workspace, history] = await Promise.all([service.getResearchWorkspace('luma'), service.getBriefHistory('luma')]);
  if (basis) {
    history.versions.forEach(brief => { if (brief.version === 2) Object.assign(brief, structuredClone(basis)); });
    if (history.current?.version === 2) Object.assign(history.current, structuredClone(basis));
  }
  return { requestedProjectId: 'luma', workspace, history, store };
}

describe('authored Luma case binding', () => {
  it('matches the actual historical fixture without changing its records', async () => {
    const context = await fixture();
    const before = JSON.stringify(context);
    expect(resolveCaseBinding(context)).toMatchObject({ kind: 'available', historicalBrief: { version: 2 }, currency: { kind: 'current' } });
    expect(JSON.stringify(context)).toBe(before);
  });

  it.each(['request-project', 'workspace-project', 'history-project', 'artifact-project', 'head-id', 'head-version', 'head-stage', 'not-current', 'head-brief', 'not-simulated', 'missing-brief', 'duplicate-brief', 'brief-text', 'brief-type'])('refuses an incompatible %s instead of borrowing a report', async mutation => {
    const context = await fixture();
    const { workspace, history } = context;
    if (!workspace.artifact || !history.current) throw new Error('Research fixture required');
    if (mutation === 'request-project') context.requestedProjectId = 'northline';
    if (mutation === 'workspace-project') workspace.project.id = 'northline';
    if (mutation === 'history-project') history.project.id = 'northline';
    if (mutation === 'artifact-project') workspace.artifact.projectId = 'northline';
    if (mutation === 'head-id') workspace.artifact.id = 'replacement';
    if (mutation === 'head-version') workspace.artifact.version += 1;
    if (mutation === 'head-stage') workspace.artifact.stage = 'strategy';
    if (mutation === 'not-current') workspace.artifact.isCurrent = false;
    if (mutation === 'head-brief') workspace.artifact.basedOn.briefVersion += 1;
    if (mutation === 'not-simulated') workspace.artifact.simulated = false;
    if (mutation === 'missing-brief') history.versions = [];
    if (mutation === 'duplicate-brief') history.versions.push(structuredClone(history.current));
    if (mutation === 'brief-text') history.versions.forEach(brief => { if (brief.version === 2) brief.audience += 'changed'; });
    if (mutation === 'brief-type') history.versions.forEach(brief => { if (brief.version === 2) brief.proposalType = 'kv'; });
    expect(resolveCaseBinding(context).kind).toBe('unavailable');
  });

  it('preserves the original report when only the current brief advances and labels it historical', async () => {
    const context = await fixture();
    if (!context.history.current) throw new Error('Brief fixture required');
    context.history.current = { ...context.history.current, version: 3, id: 'brf-luma-v3', audience: 'Changed scope', proposalType: 'kv' };
    context.history.versions.unshift(context.history.current);
    expect(resolveCaseBinding(context)).toMatchObject({ kind: 'available', historicalBrief: { version: 2 }, currency: { kind: 'historical', latestBriefVersion: 3 } });
  });

  it.each(originalLumaAttachments.map(item => item.brief))('refuses mixed query revisions for $brand', async basis => {
    for (const older of ['workspace', 'history']) {
      const context = await fixture(basis);
      context.workspace.project.revision = older === 'workspace' ? 10 : 11;
      context.history.project.revision = older === 'history' ? 10 : 11;
      expect(resolveCaseBinding(context)).toMatchObject({ kind: 'unavailable', reason: 'snapshot-mismatch' });
    }
  });

  it.each(originalLumaAttachments.map(item => item.brief))('does not borrow a newer history research head for $brand', async basis => {
    const context = await fixture(basis);
    context.workspace.project.revision = 10;
    context.history.project.revision = 11;
    context.history.dependentArtifacts.forEach(item => {
      if (item.stage === 'research') { item.id = 'art-luma-research-v2'; item.version = 2; }
    });
    expect(resolveCaseBinding(context)).toMatchObject({ kind: 'unavailable', reason: 'snapshot-mismatch' });
    context.workspace.project.revision = 11;
    expect(resolveCaseBinding(context)).toMatchObject({ kind: 'unavailable', reason: 'snapshot-mismatch' });
  });

  it.each(['workspace-missing', 'history-missing', 'workspace-duplicate', 'history-duplicate', 'workspace-lineage', 'history-not-current'])('refuses an incoherent current research roster with %s', async mutation => {
    const context = await fixture();
    const summaries = mutation.startsWith('workspace') ? context.workspace.versions : context.history.dependentArtifacts;
    const head = summaries.find(item => item.stage === 'research' && item.isCurrent);
    if (!head) throw new Error('Research summary fixture required');
    if (mutation.endsWith('missing')) summaries.splice(summaries.indexOf(head), 1);
    if (mutation.endsWith('duplicate')) summaries.push(structuredClone(head));
    if (mutation.endsWith('lineage')) head.lineageId = 'foreign-lineage';
    if (mutation.endsWith('not-current')) head.isCurrent = false;
    expect(resolveCaseBinding(context)).toMatchObject({ kind: 'unavailable', reason: 'snapshot-mismatch' });
  });

  it('refuses a coherent replacement report and preserves coherent historical currency', async () => {
    const context = await fixture();
    if (!context.history.current || !context.workspace.artifact) throw new Error('Luma fixture required');
    context.workspace.project.revision = 12;
    context.history.project.revision = 12;
    context.history.current = { ...context.history.current, version: 4, id: 'brf-luma-v4', audience: 'New scope', proposalType: 'kv' };
    context.history.versions.unshift(context.history.current);
    expect(resolveCaseBinding(context)).toMatchObject({ kind: 'available', currency: { kind: 'historical', latestBriefVersion: 4 } });
    context.workspace.artifact.id = 'art-luma-research-v2';
    context.workspace.artifact.version = 2;
    for (const summary of [...context.workspace.versions, ...context.history.dependentArtifacts]) {
      if (summary.stage === 'research' && summary.isCurrent) { summary.id = 'art-luma-research-v2'; summary.version = 2; }
    }
    expect(resolveCaseBinding(context)).toMatchObject({ kind: 'unavailable', reason: 'head-changed' });
  });

  it.each(originalLumaAttachments.map(item => item.brief))('keeps invalid explicit proposal types distinct from absence for $brand', async basis => {
    for (const invalid of [null, false, '', undefined, 0]) {
      const context = await fixture(basis);
      for (const brief of [...context.history.versions, ...(context.history.current ? [context.history.current] : [])]) {
        if (brief.version === 2) Object.defineProperty(brief, 'proposalType', { value: invalid, configurable: true, enumerable: true });
      }
      expect(resolveCaseBinding(context)).toMatchObject({ kind: 'unavailable', reason: 'brief-changed' });
    }
  });

  it('does not label an invalid current proposal type as the accepted current snapshot', async () => {
    const context = await fixture();
    if (!context.history.current) throw new Error('Brief fixture required');
    context.history.current = structuredClone(context.history.current);
    Object.defineProperty(context.history.current, 'proposalType', { value: null, enumerable: true });
    const result = resolveCaseBinding(context);
    expect(result.kind === 'available' && result.currency.kind === 'current').toBe(false);
  });

});
