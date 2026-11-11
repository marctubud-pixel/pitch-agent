import { describe, expect, it } from 'vitest';
import { buildSeedDatabase } from './fixtures/seed';
import { demoChineseText, demoSourceChineseSummary } from './demoChinese';
import { localizeDeep, m, render } from './i18n';
import { runReadiness, runVerification } from './rules';
import { MockWorkbenchService } from './MockWorkbenchService';
import { memoryStore } from './storage';
import { placeholderImage } from './fixtures/placeholders';

const displayKeys = new Set([
  'name', 'client', 'summary', 'background', 'audience', 'goal', 'label', 'description', 'title', 'publisher', 'addedBy', 'owner',
  'confirmedBy', 'actor', 'note', 'message', 'detail', 'guidance', 'heading', 'text', 'changeNote', 'staleReason', 'requiredAction',
  'releasedBy', 'recordedBy', 'reviewer', 'decidedBy', 'sourceNote', 'recommendedAction', 'alt', 'objectives', 'deliverables', 'constraints', 'researchQuestions',
  'openQuestions', 'successCriteria', 'limitations', 'items', 'segments', 'visibleFeatures', 'transcribedText', 'uncertainties',
  'permittedUses', 'prohibitedInferences', 'unresolvedIssues', 'research', 'strategy', 'brand', 'timeline', 'deliverableType',
]);

function untranslatedDisplay(value: unknown, path = '', field = ''): string[] {
  if (typeof value === 'string') {
    const rest = value.replace(/HEIC|JPEG|PNG|PDF|px/g, '');
    return displayKeys.has(field) && /[A-Za-z]{3,}/.test(rest) ? [`${path}: ${value}`] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item, i) => untranslatedDisplay(item, `${path}[${i}]`, field));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => key === 'strategyTemplates' || key === 'excerpt' || key === 'quote' || key === 'fileName'
    ? [] : untranslatedDisplay(item, `${path}.${key}`, key));
}

function service() {
  return new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
}

describe('Chinese fictional demo display', () => {
  it('translates full demo reports, claims, descriptions, names, history and failures', () => {
    const db = localizeDeep(buildSeedDatabase());
    expect(untranslatedDisplay(db)).toEqual([]);
    expect(db.projects.find((p) => p.id === 'luma')?.summary).toContain('25–34');
    expect(db.artifacts.find((a) => a.projectId === 'plumtide')?.summary).toContain('梅花');
    expect(db.claims.find((c) => c.id.endsWith('-c6'))?.text).toContain('25–34');
  });

  it('covers actual service projections including derived gaps, jobs and handoff checklists', async () => {
    const svc = service();
    const db = buildSeedDatabase();
    const projects = await svc.listProjects({});
    expect(untranslatedDisplay(projects)).toEqual([]);
    for (const project of projects.items) {
      const outputs = await Promise.all([
        svc.getProjectOverview(project.id), svc.getResearchWorkspace(project.id), svc.listSources(project.id, {}),
        svc.listImages(project.id), svc.getHandoffOverview(project.id), svc.getBriefHistory(project.id), svc.listJobs(project.id),
        ...db.artifacts.filter((a) => a.projectId === project.id).map((a) => svc.getArtifact(project.id, a.id)),
      ]);
      expect(untranslatedDisplay(outputs, project.id)).toEqual([]);
    }
  });

  it('does not mutate the database, evidence links, numbers or verification results', () => {
    const raw = buildSeedDatabase();
    const snapshot = structuredClone(raw);
    const display = localizeDeep(raw);
    expect(raw).toEqual(snapshot);
    expect(display.sources.map((s) => [s.id, s.url, s.excerpt, s.verificationStatus])).toEqual(raw.sources.map((s) => [s.id, s.url, s.excerpt, s.verificationStatus]));
    expect(display.claims.map((c) => [c.id, c.sourceIds, c.topic, c.supportStatus])).toEqual(raw.claims.map((c) => [c.id, c.sourceIds, c.topic, c.supportStatus]));
    for (const [index, artifact] of raw.artifacts.entries()) {
      const projectedArtifact = display.artifacts[index];
      const before = runVerification(raw, artifact, () => 'test-finding');
      const after = runVerification(display, projectedArtifact, () => 'test-finding');
      expect(after.claimStatuses).toEqual(before.claimStatuses);
      expect(after.sourceStatuses).toEqual(before.sourceStatuses);
      expect(after.review.decision).toEqual(before.review.decision);
      expect(runReadiness(display, projectedArtifact, () => 'test-finding').coverage).toEqual(runReadiness(raw, artifact, () => 'test-finding').coverage);
    }
  });

  it('keeps original source text and exposes a separately labelled Chinese interpretation', () => {
    const source = buildSeedDatabase().sources.find((s) => s.id === 'src-luma-panel');
    if (!source) throw new Error('Missing demo panel source');
    const projected = localizeDeep(source);
    expect(projected.title).toBe('饮酒场景样本组：摘要报告');
    expect(projected.excerpt).toBe(source.excerpt);
    expect(demoSourceChineseSummary(projected)).toBe('在 21–44 岁成年人中，多罐装购买最常与计划中的居家聚会有关。报告未进一步拆分更窄的年龄段。');
    expect(demoSourceChineseSummary({ ...source, id: 'user-source', isSampleLink: false })).toBeNull();
  });

  it('preserves user files, extracted text, quote spans and user-entered titles even when words match demo copy', () => {
    const original = {
      attachments: [{ id: 'uploaded-original', fileName: 'Summary', text: 'Summary', extraction: { method: 'typed' }, quote: 'Summary' }],
      provenance: { background: { spans: [{ attachmentId: 'uploaded-original', start: 0, end: 7, quote: 'Summary' }] } },
      source: { id: 'user-source', projectId: 'luma', title: 'Summary', publisher: 'Research team', excerpt: 'Summary' },
      project: { id: 'user-project', name: 'Luma Social Spirits', client: 'User company', summary: 'My English research remains unchanged.' },
    };
    expect(localizeDeep(original)).toEqual(original);
  });

  it('localizes clipped fixture parameters only in output; render and stored rule messages stay unchanged', () => {
    const claim = 'Competitors increasingly use matte, low-saturation labels to signal a premium position.';
    const token = m('f.missing.msg', { claim: claim.replace(/\.$/, '') });
    expect(render(token)).toContain('Competitors increasingly');
    expect(localizeDeep(token)).toContain('Competitors increasingly');
    expect(localizeDeep({ id: 'art-luma-research-v1', message: token }).message).toBe('论点“竞品越来越多地使用哑光、低饱和标签传达高端定位”没有引用任何来源。');
    expect(demoChineseText('Multi-can sharing packs are a deciding factor for adults aged 25–34 when buying for a g…')).toContain('25–34');
  });

  it('returns Chinese service content while preserving uploaded original blobs', async () => {
    const svc = service();
    const project = await svc.getProjectOverview('luma');
    expect(project.project.name).toBe('露玛聚会气泡酒');
    expect(project.blockers.some((b) => /[A-Za-z]{4,}/.test(b.detail))).toBe(false);
    const originalText = 'Summary\nOriginal client words must remain verbatim.';
    const file = new Blob([originalText], { type: 'text/plain' });
    const history = await svc.getBriefHistory('luma');
    const current = history.current;
    if (!current) throw new Error('Missing current brief');
    await svc.saveBrief('luma', {
      ...current,
      background: 'User-authored English background.',
      changeNote: current.changeNote ?? '',
      attachment: {
        id: 'client-original', kind: 'file', fileName: 'Summary', mimeType: 'text/plain', size: file.size, text: originalText,
        extraction: { method: 'plain_text', pages: null, warnings: [] }, mapping: 'none', sampleId: null, file,
      },
    }, { commandId: 'client-original-save', expectedRevision: project.project.revision });
    const saved = await svc.getBriefHistory('luma');
    expect(saved.current?.background).toBe('User-authored English background.');
    expect(saved.attachments.find((a) => a.id === 'client-original')?.text).toBe(originalText);
    expect(saved.attachments.find((a) => a.id === 'client-original')?.fileName).toBe('Summary');
    expect(await (await svc.getBriefAttachmentFile('luma', 'client-original'))?.text()).toBe(originalText);
  });

  it('preserves a new user claim even when it quotes fixture words and cites a built-in source', async () => {
    const svc = service();
    const overview = await svc.getProjectOverview('luma');
    const workspace = await svc.getResearchWorkspace('luma');
    const original = 'Competitors increasingly use matte, low-saturation labels to signal a premium position.';
    const section = workspace.artifact?.sections[0];
    if (!section) throw new Error('Missing research section');
    const result = await svc.addClaim('luma', { sectionId: section.id, text: original, topic: 'competitor', sourceIds: ['src-luma-panel'] }, { commandId: 'user-claim-preservation', expectedRevision: overview.project.revision });
    expect(result.data.text).toBe(original);
    const refreshed = await svc.getResearchWorkspace('luma');
    expect(refreshed.claims.find((claim) => claim.id === result.data.id)?.text).toBe(original);
  });

  it('retains user-authored quoted text in findings and handoff guidance on a seeded project', () => {
    const claim = 'Competitors increasingly use matte, low-saturation labels to signal a premium position.';
    const message = m('f.missing.msg', { claimId: 'clm-user-123', claim });
    const fixtureContainer = { project: { id: 'luma' }, finding: { id: 'fnd-new', severity: 'blocking', claimIds: ['clm-user-123'], message }, prohibitedInferences: [m('h.noGeneralise', { claimId: 'clm-user-123', claim })] };
    const shown = localizeDeep(fixtureContainer);
    expect(shown.finding.message).toContain(claim);
    expect(shown.prohibitedInferences[0]).toContain(claim);
  });

  it('gives explicit Chinese demo captions for built-in illustrations', () => {
    const uri = placeholderImage('shelf', ['#d9604c', '#e8b43c', '#4f8a74', '#6a5a86'], 'Harbour St chilled bay');
    const svg = decodeURIComponent(uri.slice(uri.indexOf(',') + 1));
    expect(svg).toContain('占位插画 · 海港街冷藏区');
    expect(svg).not.toContain('Placeholder illustration');
  });
});
