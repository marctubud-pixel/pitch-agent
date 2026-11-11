import { describe, expect, it } from 'vitest';
import { HttpWorkbenchService, mapHttpError } from './HttpWorkbenchService';
import { parseSnapshot } from './dto';
import { claimIdentity, mapArtifact, mapClaims, mapReview } from './mappers';

const id = 'synthetic-project', artifactId = 'synthetic-research', hash = 'a'.repeat(64);
const content = { outputKind: 'research_findings', status: 'complete', title: '隔离包装研究', summary: '只有所供原文可支持的发现。', sections: [{ heading: '真实章节', body: '独立使用单元是一项待验证的包装问题。', evidenceIds: ['source'] }], claims: [{ text: '所供来源描述了独立单元。', kind: 'fact', evidenceRefs: ['source'], limitations: ['未证明目标用户偏好。'] }], gaps: ['缺少目标人群使用证据。'] };
function rawSnapshot() {
  return { project: { id, name: '隔离测试项目', revision: 4, activeTaskCardId: 'card', taskCards: [{ id: 'card', brief: '隔离任务卡', createdBy: 'synthetic-operator' }], confirmations: [], jobs: [], artifacts: [{ id: artifactId, stage: 'research', contentHash: hash, claims: content.claims, inputVersionIds: ['card'], technicalReceipts: { sourceCatalogue: { records: [{ id: 'source', url: 'https://example.test/source', text: '来源原文。', scopeRelation: 'background', verification: 'captured' }] } } }], sourceCaptures: [], verifications: [], readinessReports: [], handoffReports: [], audit: [], processedCommands: {} }, view: { policy: { version: 1, mode: 'assisted', humanGates: ['strategy'], authorizedThrough: 'final_review' }, stages: [{ stage: 'research', status: 'awaiting_release', activeArtifactId: artifactId, blockedReasons: ['RESEARCH_READINESS_REQUIRED'] }, { stage: 'strategy', status: 'blocked', activeArtifactId: null, blockedReasons: ['DEPENDENCY_BLOCKED'] }], complete: false } };
}
function adapter(raw = rawSnapshot()) {
  return new HttpWorkbenchService({ baseUrl: '/api', fetchImpl: async (url) => Response.json(String(url).endsWith('/content') ? { artifactId, contentHash: hash, content, contentText: JSON.stringify(content) } : raw) });
}
describe('original UI live read models', () => {
  it('renders actual sections instead of serializing a report as JSON and keeps classification gaps', async () => {
    const ws = await adapter().getResearchWorkspace(id);
    expect(ws.artifact).toMatchObject({ title: content.title, summary: content.summary, status: 'blocked', simulated: false });
    expect(ws.artifact?.sections[0]).toMatchObject({ heading: '真实章节', blocks: [{ kind: 'paragraph', segments: [content.sections[0].body] }] });
    expect(ws.claims).toHaveLength(1);
    expect(ws.claims[0]).toMatchObject({topic:'unclassified', supportStatus:'unverified'});
    expect(ws.sources).toHaveLength(1);
    expect(ws.sources[0]).toMatchObject({intendedUse:'unclassified', verificationStatus:'unverified'});
    expect(ws.gaps[0].detail).toContain('1 条论点、1 项来源');
    expect(ws.verification).toBeNull();
    expect(ws.readiness).toBeNull();
    expect(ws.artifact?.release).toBeNull();
  });
  it('does not hide unclassified real sources as an empty library', async () => {
    expect((await adapter().listSources(id, {})).items[0]).toMatchObject({intendedUse:'unclassified', verificationStatus:'unverified'});
    const images = await adapter().listImages(id);
    expect(images.items).toEqual([]);
    const handoff = await adapter().getHandoffOverview(id);
    expect(handoff.canAccept.allowed).toBe(false);
    expect(handoff.researchSide).toBeNull();
  });
  it('uses hash identities rather than report array order, and never promotes bounded inference', async () => {
    const raw = rawSnapshot(), p = parseSnapshot(raw), a = raw.project.artifacts[0];
    const claims = [{ ...content.claims[0], topic: 'production' }];
    const key = await claimIdentity(0, claims[0]);
    p.textReports.verification = [{ artifactId, contentHash: hash, results: [{ claimKey: 'wrong-identity', outcome: 'supported_excerpt' }, { claimKey: key, outcome: 'bounded_inference', limitations: ['仍属推断。'] }] }];
    const mapped = await mapClaims(p, a, { ...content, claims });
    expect(mapped.items[0].id).toBe(key);
    expect(mapped.items[0].supportStatus).toBe('partial');
    expect(mapped.items[0].limitations).toContain('仍属推断。');
    p.textReports.verification[0].results = [{ claimKey: 'wrong-identity', outcome: 'supported_excerpt' }];
    expect((await mapClaims(p, a, { ...content, claims })).items[0].supportStatus).toBe('unverified');
  });
  it('never interprets missing blockers as a passed review or author complete as released', () => {
    const raw = rawSnapshot(), p = parseSnapshot(raw), a = raw.project.artifacts[0], artifact = mapArtifact(p, a, content);
    const review = mapReview(p, artifact, a, { id: 'review', artifactId, contentHash: hash }, 'verification');
    expect(review.decision).toBe('fail');
    expect(review.findings[0].severity).toBe('blocking');
    expect(artifact.status).toBe('blocked');
    expect(artifact.release).toBeNull();
  });
  it('rejects a mismatched content response instead of showing another artifact', async () => {
    const service = new HttpWorkbenchService({ baseUrl: '/api', fetchImpl: async (url) => Response.json(String(url).endsWith('/content') ? { artifactId: 'other', contentHash: hash, content } : rawSnapshot()) });
    await expect(service.getArtifact(id, artifactId)).rejects.toMatchObject({ kind: 'validation' });
  });
  it('preserves earlier current blocking reports instead of selecting a later positive report', async () => {
    const raw = rawSnapshot();
    const source = { ...raw.project, verifications: [{ id: 'negative', artifactId, contentHash: hash, hasBlockingFindings: true, results: [{ claimKey: 'unknown', outcome: 'unsupported', rationale: '原问题仍存在。' }] }, { id: 'later', artifactId, contentHash: hash, hasBlockingFindings: false, results: [] }] };
    const service = new HttpWorkbenchService({ baseUrl: '/api', fetchImpl: async (url) => Response.json(String(url).endsWith('/content') ? { artifactId, contentHash: hash, content } : { ...raw, project: source }) });
    expect((await service.getResearchWorkspace(id)).verification?.id).toBe('negative');
  });
});


describe('original review commands and error states', () => {
  it('maps all5xx responses to retryable network errors', async () => {
    for (const status of [500, 501, 503]) expect(await mapHttpError(Response.json({ error: { message: 'temporary failure' } }, { status }))).toMatchObject({ kind: 'network', retryable: true });
  });
  it('freezes current readiness-v2 command across accepted-response loss', async () => {
    const bodies: string[] = [];
    const service = new HttpWorkbenchService({ baseUrl: '/api', fetchImpl: async (_url, init) => {
      if (init?.method === 'GET') return Response.json(rawSnapshot());
      if (typeof init?.body !== 'string') throw new Error('Encoded mutation required');
      bodies.push(init.body);
      if (bodies.length === 1) return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('response lost')); } }), { status: 202 });
      const before = rawSnapshot();
      return Response.json({ ...before, jobId: 'readiness-one', project: { ...before.project, revision: 5, jobs: [{ id: 'readiness-one', purpose: 'readiness', stage: 'research', status: 'queued', attempts: [], outputVersionIds: [] }] } });
    } });
    const meta = { commandId: 'same-readiness', expectedRevision: 4 };
    await expect(service.startReadinessReview(id, meta)).rejects.toMatchObject({ outcomeUnknown: true });
    expect((await service.startReadinessReview(id, meta)).data).toMatchObject({ id: 'readiness-one', purpose: 'readiness_review', simulated: false });
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[0])).toEqual({ artifactId, protocolVersion: 'research-readiness-v2', ...meta });
  });
});
