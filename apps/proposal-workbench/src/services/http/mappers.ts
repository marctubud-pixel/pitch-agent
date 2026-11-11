import type { Artifact, ArtifactSummary, Brief, BriefAttachment, Capabilities, Claim, ContinuationEligibility, EvidenceGap, EvidenceTopic, Handoff, ImageRecord, Job, Project, ProjectOverview, Review, Source, Stage } from '../../domain/models';
import { STAGES, STAGE_LABELS } from '../../domain/models';
import { ServiceError } from '../../domain/service';
import { readBrief } from './briefEnvelope';
import { object, records, strings, text, type BackendCard, type Snapshot } from './dto';

export function eventTime(p: Snapshot, predicate: (command: Record<string, unknown>) => boolean): string | null {
  for (const a of p.audit) {
    const raw = p.processedCommands[a.commandId];
    if (typeof raw !== 'string') continue;
    try { if (predicate(object(JSON.parse(raw)))) return a.at || null; } catch { /* Old commands may have a different witness format. */ }
  }
  return null;
}
export function cardTime(p: Snapshot, card: BackendCard): string {
  return readBrief(card.brief).savedAt || eventTime(p, (c) => c.taskCardId === card.id && c.kind === 'revise-task-card') || '';
}
export function mapBrief(p: Snapshot, card: BackendCard): Brief {
  const index = p.cards.findIndex((c) => c.id === card.id), envelope = readBrief(card.brief), f = envelope.fields;
  const confirmation = p.confirmations.find((c) => c.taskCardId === card.id);
  const confirmedAt = confirmation ? eventTime(p, (c) => c.kind === 'confirm-task-card' && c.taskCardId === card.id) : null;
  const createdAt = cardTime(p, card);
  return { ...f, id: card.id, projectId: p.id, version: index + 1, brand: f.brand ?? '', researchQuestions: f.researchQuestions ?? [], deliverableType: f.deliverableType ?? '', timeline: f.timeline ?? '', budget: f.budget ?? '', references: f.references ?? [], openQuestions: f.openQuestions ?? [], provenance: f.provenance ?? {}, attachmentIds: f.attachment ? [f.attachment.id] : [], confirmedAt, confirmedBy: confirmation?.actorId ?? null, createdAt, updatedAt: confirmedAt ?? createdAt, changeNote: f.changeNote || null, supersededAt: index < p.cards.length - 1 ? cardTime(p, p.cards[index + 1]) || null : null };
}
export function mapAttachments(p: Snapshot): BriefAttachment[] {
  const seen = new Set<string>();
  return p.cards.flatMap((card, i) => {
    const a = readBrief(card.brief).fields.attachment;
    if (!a || seen.has(a.id)) return [];
    seen.add(a.id);
    return [{ ...a, projectId: p.id, briefVersion: i + 1, createdAt: cardTime(p, card), addedBy: card.createdBy, fileAvailable: false }];
  });
}
function frontendStage(stage: string): Stage {
  if (stage === 'copy' || stage === 'references' || stage === 'sketch' || stage === 'visual') return 'creative';
  if (stage === 'layout' || stage === 'content_review' || stage === 'final_review') return 'final';
  return STAGES.find((s) => s === stage) ?? 'research';
}
export function mapProject(p: Snapshot): Project {
  const card = p.cards.find((c) => c.id === p.activeTaskCardId);
  if (!card) throw new ServiceError('validation', 'Active task card missing from backend project.');
  const f = readBrief(card.brief), b = mapBrief(p, card), confirmed = p.confirmations.some((c) => c.taskCardId === card.id);
  const reached = [...p.stages].reverse().find((s) => s.activeArtifactId || ['running', 'queued', 'failed', 'awaiting_reconciliation'].includes(s.status));
  const stage = !confirmed ? 'brief' : reached ? frontendStage(reached.stage) : 'research';
  const current = reached ?? p.stages.find((s) => s.stage === 'research');
  const blocked = current && (current.blockedReasons.length > 0 || ['failed', 'blocked', 'awaiting_reconciliation', 'stale'].includes(current.status));
  return { id: p.id, name: p.name, client: f.metadata.client, summary: f.metadata.summary || b.background.slice(0, 160), revision: p.revision, currentStage: stage, status: p.complete ? 'ready' : !confirmed ? 'draft' : blocked ? 'blocked' : 'in_progress', createdAt: cardTime(p, p.cards[0]), updatedAt: p.audit.at(-1)?.at || b.updatedAt, mode: p.policy.mode === 'auto' ? 'supervised' : 'step_by_step', humanGates: p.policy.humanGates.map((s) => ({ id: s, stage: frontendStage(s), label: s, description: '后端策略中的人工节点', status: 'not_reached', decidedAt: null, decidedBy: null })), owners: { research: f.metadata.researchOwner, strategy: f.metadata.strategyOwner }, taskCard: { briefVersion: b.version, goal: b.objectives.join('\n'), successCriteria: b.deliverables, confirmedAt: b.confirmedAt, confirmedBy: b.confirmedBy }, continuedToStrategyAt: null };
}
export function mapJob(p: Snapshot, j: Record<string, unknown>): Job {
  let purpose: Job['purpose'];
  if (j.purpose === 'verification') purpose = 'evidence_verification';
  else if (j.purpose === 'readiness') purpose = 'readiness_review';
  else if (j.purpose === 'observation') purpose = 'image_observation';
  else if ((!j.purpose || j.purpose === 'stage') && j.stage === 'strategy') purpose = 'strategy_generation';
  else if ((!j.purpose || j.purpose === 'stage') && j.stage === 'research') purpose = 'research_generation';
  else throw new ServiceError('unavailable', `此执行任务类型尚未接入原版任务模型：${text(j.purpose) || text(j.stage)}`);
  const status: Job['status'] = j.status === 'running' || j.status === 'succeeded' || j.status === 'queued' || j.status === 'blocked' || j.status === 'awaiting_reconciliation' ? j.status : 'failed';
  const attempts = records(j.attempts), last = attempts.at(-1), err = j.error ? object(j.error) : null;
  return { id: text(j.id), projectId: p.id, purpose, label: [text(j.stage), text(j.purpose)].filter(Boolean).join(' / '), status, commandId: '', createdAt: text(last?.startedAt), startedAt: text(last?.startedAt) || null, completedAt: text(last?.completedAt) || null, error: err ? { code: text(err.code), message: text(err.message), detail: JSON.stringify(err), retryable: false } : j.status === 'blocked' ? { code: 'blocked', message: '后端任务被阻断', detail: JSON.stringify(j), retryable: false } : null, receipt: null, target: { kind: 'project', id: p.id, label: p.name }, output: strings(j.outputVersionIds)[0] ? { kind: 'artifact', id: strings(j.outputVersionIds)[0] } : null, attempt: attempts.length, retryOfJobId: null, reconciledAt: null, recovery: { action: 'none', eligible: false, reason: '此适配器尚未接入重试或对账命令，请查看后端记录。' }, simulated: false };
}
export function mapArtifact(p: Snapshot, a: Record<string, unknown>, supplied?: unknown): Artifact {
  if (a.stage !== 'research' && a.stage !== 'strategy') throw new ServiceError('unavailable', '此产物阶段尚未映射到原版界面。');
  const id = text(a.id), stage = a.stage, state = p.stages.find((s) => s.stage === stage), current = state?.activeArtifactId === id;
  const content = supplied === undefined ? null : typeof supplied === 'string' ? object(JSON.parse(supplied)) : object(supplied);
  if (content && (!text(content.title).trim() || !text(content.summary).trim() || !Array.isArray(content.sections) || !content.sections.length)) throw new ServiceError('validation', '产物缺少真实标题、摘要或章节。');
  const peers = p.artifacts.filter((x) => x.stage === stage), index = peers.findIndex((x) => x.id === id);
  const producer = p.jobs.find((j) => strings(j.outputVersionIds).includes(id));
  const release = p.releases.find((r) => r.artifactId === id);
  const releasedAt = release ? eventTime(p, (c) => c.kind === 'release-stage' && c.artifactId === id) ?? '' : '';
  const status: Artifact['status'] = release ? 'released' : !current || state?.status === 'stale' ? 'stale' : state?.blockedReasons.length ? 'blocked' : state?.status === 'awaiting_release' ? 'ready' : 'draft';
  const sections: Artifact['sections'] = content ? records(content.sections).map((section, n) => ({ id: `${id}:section:${n}`, heading: text(section.heading), blocks: [{ kind: 'paragraph', segments: [text(section.body)] }] })) : [];
  if (content && strings(content.gaps).length) sections.push({ id: `${id}:gaps`, heading: '保留的研究缺口', blocks: [{ kind: 'list', items: strings(content.gaps) }] });
  const inputIds = strings(a.inputVersionIds);
  const cardIndex = p.cards.findIndex((c) => inputIds.includes(c.id));
  return { id, projectId: p.id, stage, lineageId: `${p.id}:${stage}`, version: index + 1, title: text(content?.title) || text(a.title) || `${stage} v${index + 1}`, summary: text(content?.summary) || text(a.summary), sections, claimIds: [], createdAt: text(a.createdAt) || text(records(producer?.attempts).at(-1)?.finishedAt), status, isCurrent: current, supersededAt: current ? null : text(peers[index + 1]?.createdAt) || null, basedOn: { briefVersion: cardIndex >= 0 ? cardIndex + 1 : 0, researchArtifactId: stage === 'strategy' ? inputIds.find((input) => p.artifacts.some((x) => x.id === input && x.stage === 'research')) ?? null : null }, staleReason: current ? state?.status === 'stale' ? '后端已标记此版本过时。' : null : '此产物不是当前阶段版本。', producedByJobId: text(producer?.id) || null, release: release ? { releasedAt, releasedBy: text(release.actorId) } : null, coverage: [], simulated: false };
}
export function artifactSummary(a: Artifact): ArtifactSummary { return { ...a, claimCount: a.claimIds.length }; }
export function mapEligibility(p: Snapshot): ContinuationEligibility {
  const s = p.stages.find((x) => x.stage === 'strategy');
  return { projectId: p.id, target: 'strategy', eligible: s?.status === 'ready', alreadyContinued: Boolean(s?.activeArtifactId), summary: s?.blockedReasons.join(' · ') || s?.status || '尚无后端阶段状态', checks: (s?.blockedReasons ?? []).map((code) => ({ id: code, label: code, passed: false, detail: code, fix: null })) };
}
export function mapOverview(p: Snapshot): ProjectOverview {
  const project = mapProject(p), current = p.cards.find((c) => c.id === p.activeTaskCardId), jobs = p.jobs.filter((j) => ['queued', 'running', 'awaiting_reconciliation'].includes(text(j.status))).map((j) => mapJob(p, j));
  const confirmed = p.confirmations.some((c) => c.taskCardId === p.activeTaskCardId);
  const blockers: ProjectOverview['blockers'] = p.stages.filter((s) => s.activeArtifactId || s.stage === 'research').flatMap((s) => s.blockedReasons.map((code) => ({ id: `${s.stage}:${code}`, title: code, detail: `${s.stage} · ${code}`, recommendedAction: '查看阶段记录并处理后端要求。', severity: 'blocking', link: { view: 'process' } })));
  const artifact = (stage: string) => { const state = p.stages.find((s) => s.stage === stage), a = p.artifacts.find((a) => a.id === state?.activeArtifactId); return a ? artifactSummary(mapArtifact(p, a)) : null; };
  return { project, brief: current ? mapBrief(p, current) : null, stages: STAGES.map((s) => ({ stage: s, label: STAGE_LABELS[s], state: s === 'brief' ? confirmed ? 'complete' : 'current' : s === project.currentStage ? project.status === 'blocked' ? 'blocked' : 'current' : 'upcoming', note: p.stages.filter((x) => frontendStage(x.stage) === s).map((x) => `${x.stage}: ${x.status}${x.blockedReasons.length ? ` (${x.blockedReasons.join(', ')})` : ''}`).join('\n') })), blockers, recentActivity: p.audit.slice(-12).reverse().map((a) => ({ id: a.commandId, projectId: p.id, type: a.kind.includes('task-card') ? 'brief' : 'project', message: a.kind, actor: a.actorId, createdAt: a.at })), nextAction: { label: !confirmed ? '确认任务卡' : '查看调研与执行记录', description: !confirmed ? '保存并确认当前任务卡后才可开始调研。' : '后续执行以实际模型配置、来源和人工节点为准。', link: { view: !confirmed ? 'brief' : 'research' }, command: !confirmed ? 'confirm_brief' : null, enabled: true, disabledReason: null }, eligibility: mapEligibility(p), research: artifact('research'), strategy: artifact('strategy'), activeJobs: jobs.filter((j) => ['queued', 'running', 'awaiting_reconciliation'].includes(j.status)) };
}
export function mapCapabilities(value: unknown): Capabilities {
  object(value);
  const feature = (supported: boolean, label: string) => ({ supported, label, reason: supported ? '后端提供执行能力，仍须满足项目输入与审核要求。' : '当前适配器尚未接入此能力。' });
  return { continuation_to_strategy: feature(false, 'Strategy'), creative_development: feature(false, 'Creative'), final_proposal: feature(false, 'Final proposal'), image_observation: feature(false, 'Image observation'), job_recovery: feature(false, 'Job recovery') };
}

const evidenceTopics: EvidenceTopic[] = ['audience', 'category', 'competitor', 'cultural', 'production', 'unclassified'];
function topic(value: unknown): EvidenceTopic | null { return evidenceTopics.find((entry) => entry === value) ?? null; }
function nested(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? object(value) : {}; }
function canonical(value: unknown): string { return JSON.stringify(value, (_, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(object(item)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item); }
export async function claimIdentity(index: number, claim: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(canonical({ index, claim }));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function sourceRecords(p: Snapshot, artifact?: Record<string, unknown>): Record<string, unknown>[] {
  const frozen = records(nested(nested(artifact?.technicalReceipts).sourceCatalogue).records);
  const known = new Map(frozen.map((source) => [text(source.id), source]));
  for (const source of p.sourceEntries) {
    const id = text(source.id);
    if (!known.has(id)) known.set(id, { ...source, text: text(source.excerpt), capturedAt: text(source.createdAt), context: {actorId: text(source.addedBy)}, provenance: {kind:'user_provided', originalUrl: text(source.url)} });
  }
  for (const capture of p.sourceCaptures) {
    const record = nested(capture.record), extraction = nested(record.extraction), id = text(capture.id);
    if (known.has(id)) continue;
    known.set(id, { id, url: text(record.finalUrl), text: text(extraction.text), title: text(extraction.title), capturedAt: text(record.retrievedAt), intendedUse: capture.intendedUse });
  }
  return [...known.values()];
}
export function mapSources(p: Snapshot, artifact?: Record<string, unknown>): { items: Source[]; unclassified: number } {
  const result: Source[] = []; let unclassified = 0;
  for (const entry of sourceRecords(p, artifact)) {
    const intendedUse = topic(entry.intendedUse) ?? 'unclassified';
    if (intendedUse === 'unclassified') unclassified++;
    const capture = p.sourceCaptures.find((item) => item.id === entry.id), record = nested(capture?.record), extraction = nested(record.extraction);
    const context = nested(entry.context), provenance = nested(entry.provenance);
    const originalUrl = provenance.kind === 'user_provided' && typeof provenance.originalUrl === 'string' ? provenance.originalUrl : text(entry.url);
    result.push({ id: text(entry.id), projectId: p.id, title: text(entry.title) || text(extraction.title) || text(entry.url), publisher: text(entry.publisher), url: originalUrl, isSampleLink: false, capturedAt: text(entry.capturedAt) || text(record.retrievedAt), excerpt: text(entry.text), intendedUse, verificationStatus: 'unverified', addedBy: text(context.actorId) });
  }
  return { items: result, unclassified };
}
export async function mapClaims(p: Snapshot, a: Record<string, unknown>, content: Record<string, unknown>): Promise<{ items: Claim[]; unclassified: number }> {
  const claims = records(content.claims), matching = p.textReports.verification.filter((r) => r.artifactId === a.id && r.contentHash === a.contentHash);
  let unclassified = 0;
  const items: Claim[] = [];
  for (const [index, raw] of claims.entries()) {
    const intendedTopic = topic(raw.topic) ?? 'unclassified';
    if (intendedTopic === 'unclassified') unclassified++;
    const id = await claimIdentity(index, raw);
    const results = matching.flatMap((review) => records(review.results).filter((result) => result.claimKey === id));
    const outcomes = results.map((result) => text(result.outcome));
    const supportStatus: Claim['supportStatus'] = outcomes.includes('unsupported') ? 'unsupported' : outcomes.includes('bounded_inference') || outcomes.includes('confirmed_requirement') ? 'partial' : outcomes.some((outcome) => outcome === 'supported_excerpt' || outcome === 'supported_visual') ? 'supported' : 'unverified';
    items.push({ id, artifactId: text(a.id), text: text(raw.text), topic: intendedTopic, sourceIds: strings(raw.evidenceRefs), supportStatus, limitations: [...strings(raw.limitations), ...results.flatMap((result) => strings(result.limitations)), ...(supportStatus === 'supported' ? ['仅为所供摘录或像素的有界支持，不认证来源真实性或消费者效果。'] : [])] });
  }
  return { items, unclassified };
}
export function mapReview(p: Snapshot, artifact: Artifact, a: Record<string, unknown>, raw: Record<string, unknown>, type: Review['type']): Review {
  const report = nested(raw.rawReport), findings: Review['findings'] = [];
  const add = (message: string, sourceIds: string[] = [], claimIds: string[] = []) => findings.push({ id: `${text(raw.id)}:finding:${findings.length}`, severity: 'blocking', message, requiredAction: '按原报告修订并重新检查；不覆盖旧报告。', sourceIds, claimIds, resolved: false });
  for (const result of records(raw.results ?? report.results)) if (result.outcome === 'unsupported') add(text(result.rationale), records(result.citations).map((citation) => text(citation.sourceId)).filter(Boolean), [text(result.claimKey)]);
  const scan = nested(raw.wholeTextScan ?? report.wholeTextScan);
  for (const issue of [...records(scan.omissions), ...records(scan.mismatchedCreative)]) add(text(issue.reason) || text(issue.text) || JSON.stringify(issue));
  for (const issue of records(raw.coverage ?? report.coverage)) if (['gap', 'unresolved'].includes(text(issue.status))) add(text(issue.reason) || text(issue.question) || JSON.stringify(issue));
  const blocking = raw.hasBlockingFindings;
  if (blocking !== true && blocking !== false) add('后端没有提供可确认的阻断项判定，不能视为通过。');
  if (blocking === true && !findings.length) add(text(raw.summary) || text(report.summary) || '原始评审存在阻断项，请查看所需修改。');
  const currentAssessment = p.stageAssessments.research?.currentId;
  const outdated = !artifact.isCurrent || raw.artifactId !== a.id || raw.contentHash !== a.contentHash || type === 'readiness' && (!currentAssessment || currentAssessment !== raw.id);
  const verdict = text(raw.verdict) || text(report.verdict);
  const decision: Review['decision'] = blocking !== false || findings.length || type === 'readiness' && verdict !== 'ready' ? 'fail' : 'pass_with_conditions';
  return { id: text(raw.id), projectId: p.id, artifactId: text(raw.artifactId), artifactVersion: artifact.version, type, decision, summary: text(raw.summary) || text(report.summary) || (type === 'verification' ? '独立摘录支持核验；不认证网站真实性或消费者效果。' : `研究适用性判定：${verdict || '未知'}`), findings, coverage: [], createdAt: text(raw.createdAt), reviewer: text(nested(raw.context).actorId), simulated: false, jobId: text(raw.jobId) || null, outdated, outdatedReason: outdated ? '原报告不是当前产物及当前有效评估。' : null };
}
export function mapHandoff(p: Snapshot, artifact: Artifact, raw: Record<string, unknown>): Handoff {
  const body = nested(raw.rawReport), side: Handoff['side'] = raw.side === 'producer' ? 'research_owner' : 'strategy_owner';
  const accept = raw.decision === 'accept';
  return { id: text(raw.id), projectId: p.id, artifactId: text(raw.artifactId), artifactVersion: artifact.version, side, owner: text(nested(raw.ownerBinding).role), decision: accept ? side === 'research_owner' ? 'delivered' : 'accepted_with_conditions' : 'returned', permittedUses: strings(raw.permittedUses), prohibitedInferences: strings(raw.prohibitedInferences), unresolvedIssues: records(raw.unresolvedIssues).map((issue) => text(issue.reason)), note: text(body.summary) || strings(raw.limitations).join('\n'), createdAt: text(raw.createdAt), recordedBy: text(nested(raw.context).actorId), outdated: !artifact.isCurrent || raw.artifactId !== artifact.id || raw.contentHash !== p.artifacts.find((item) => item.id === artifact.id)?.contentHash, outdatedReason: !artifact.isCurrent || raw.artifactId !== artifact.id ? '历史版本交接，不代表当前产物已接收。' : null };
}
export function projectionGaps(claims: number, sources: number): EvidenceGap[] {
  return claims || sources ? [{ id: 'unclassified-backend-evidence', kind: 'coverage', title: '研究用途分类尚未接入', detail: `${claims} 条论点、${sources} 项来源缺少后端明确的用途分类，未猜测人群或品类归属。`, recommendedAction: '以“未分类”保留展示；补齐带来源和版本的用途分类后再调整归属。正文与已有评审仍可查看。', claimIds: [] }] : [];
}
export function mapImageRecords(p: Snapshot, baseUrl: string): ImageRecord[] {
  return p.imageAssets.map((asset) => {
    const id = text(asset.id), provenance = nested(asset.provenance);
    const observation = [...p.imageObservations].reverse().find((entry) => records(entry.observations).some((item) => item.imageId === id && item.imageSha256 === asset.sha256));
    const current = observation ? records(observation.observations).find((entry) => entry.imageId === id) : undefined;
    const review = observation ? [...p.observationReviews].reverse().find((entry) => entry.observationId === observation.id && entry.observationContentHash === observation.reportHash && records(entry.images).some((image) => (image.id === id || image.imageId === id) && image.sha256 === asset.sha256)) : undefined;
    const featureIds = new Set([...records(current?.visibleFeatures), ...records(current?.legibleText)].map((feature) => text(feature.id)).filter(Boolean));
    const findings = records(review?.findings).filter((finding) => featureIds.has(text(finding.id))), reviewed = Boolean(review);
    const complete = featureIds.size > 0 && findings.length === featureIds.size && new Set(findings.map((finding) => text(finding.id))).size === featureIds.size;
    const reviewStatus = !reviewed ? 'unreviewed' : !complete || findings.some((finding) => finding.status !== 'supported') ? 'needs_revision' : 'confirmed';
    const reviewNote = reviewed ? [...findings.map((finding) => text(finding.reason)), ...(!complete ? ['当前图片的观察复核结果不完整。'] : [])].join('\n') : null;
    const latest = [...p.jobs].reverse().find((job) => strings(job.outputVersionIds).includes(text(observation?.id)) || records(nested(nested(job.task).observationInput).images).some((image) => image.id === id || image.imageId === id));
    return { image: { id, projectId: p.id, name: text(provenance.originalFilename) || id, previewUrl: `${baseUrl.replace(/\/$/, '')}/projects/${encodeURIComponent(p.id)}/images/${encodeURIComponent(id)}`, sourceNote: text(provenance.description) || text(provenance.sourcePageUrl), uploadedAt: text(asset.uploadedAt), observationStatus: observation ? 'observed' : latest?.status === 'running' || latest?.status === 'queued' ? 'pending' : latest?.status === 'failed' ? 'failed' : 'not_requested', isPlaceholder: false, width: typeof asset.width === 'number' ? asset.width : null, height: typeof asset.height === 'number' ? asset.height : null }, observation: observation && current ? { id: text(observation.id), imageId: id, visibleFeatures: records(current.visibleFeatures).map((feature) => text(feature.description)), transcribedText: records(current.legibleText).map((feature) => text(feature.transcription)), uncertainties: [...strings(current.uncertainties), ...strings(current.limitations)], reviewStatus, reviewNote, reviewedAt: text(review?.createdAt) || null, createdAt: text(observation.createdAt), jobId: text(observation.jobId) || null, simulated: false } : null, latestJob: latest ? mapJob(p, latest) : null };
  });
}
