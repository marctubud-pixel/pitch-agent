import type {Artifact, ArtifactSummary, Claim, EvidenceGap, EvidenceTopic, Handoff, HandoffOverview, Job, ResearchWorkspace, Review, Source, SourceLibrary, SourceQuery} from '../../domain/models';
import {ServiceError} from '../../domain/service';
import {businessVersion, mapProject} from './briefModels';
import {object, records, strings, text, type Snapshot} from './dto';

export type ResearchSnapshot = Snapshot & {workflowVersion?: string | null; researchWorkflow?: Record<string, unknown> | null};
function requireResearchProtocol(p: ResearchSnapshot) {
  if (p.workflowVersion !== 'proposal-seven-v1') throw new ServiceError('unavailable', '旧项目保持原运行身份，不能作为新七阶段研究执行。');
}
function eventTime(p: Snapshot, predicate: (command: Record<string, unknown>) => boolean): string | null {
  for (const a of [...p.audit].reverse()) {
    const raw = p.processedCommands[a.commandId];
    if (typeof raw !== 'string') continue;
    try {if (predicate(object(JSON.parse(raw)))) return a.at || null;} catch { /* Keep missing historical witnesses unknown. */ }
  }
  return null;
}

export function mapArtifact(p: Snapshot, a: Record<string, unknown>, supplied?: unknown): Artifact {
  if (a.stage !== 'research') throw new ServiceError('unavailable', '此产物阶段尚未映射到原版界面。');
  const id = text(a.id), stage = a.stage, state = p.stages.find((s) => s.stage === stage), current = state?.activeArtifactId === id && state.status !== 'stale' && strings(a.inputVersionIds).includes(p.activeTaskCardId) && p.confirmations.some(c => c.taskCardId === p.activeTaskCardId);
  const content = supplied === undefined ? null : typeof supplied === 'string' ? object(JSON.parse(supplied)) : object(supplied);
  if (content && (!text(content.title).trim() || !text(content.summary).trim() || !Array.isArray(content.sections) || !content.sections.length)) throw new ServiceError('validation', '产物缺少真实标题、摘要或章节。');
  const peers = p.artifacts.filter((x) => x.stage === stage), index = peers.findIndex((x) => x.id === id);
  const producer = p.jobs.find((j) => strings(j.outputVersionIds).includes(id));
  const release = current ? p.releases.find(r => r.artifactId === id && r.policyVersion === p.policy.version) : undefined;
  const releasedAt = release ? eventTime(p, (c) => (c.kind === 'release-stage' && c.artifactId === id) || (c.kind === 'release-research' && nested(c.request).artifactId === id)) ?? '' : '';
  const status: Artifact['status'] = release ? 'released' : !current || state?.status === 'stale' ? 'stale' : state?.blockedReasons.length ? 'blocked' : state?.status === 'awaiting_release' ? 'ready' : 'draft';
  const sections: Artifact['sections'] = content ? records(content.sections).map((section, n) => ({ id: `${id}:section:${n}`, heading: text(section.heading), blocks: [{ kind: 'paragraph', segments: [text(section.body)] }] })) : [];
  if (content && strings(content.gaps).length) sections.push({ id: `${id}:gaps`, heading: '保留的研究缺口', blocks: [{ kind: 'list', items: strings(content.gaps) }] });
  const inputIds = strings(a.inputVersionIds);
  const cardIndex = p.cards.findIndex((c) => inputIds.includes(c.id));
  return { id, projectId: p.id, stage, lineageId: `${p.id}:${stage}`, version: index + 1, title: text(content?.title) || text(a.title) || `${stage} v${index + 1}`, summary: text(content?.summary) || text(a.summary), sections, claimIds: [], createdAt: text(a.createdAt) || text(records(producer?.attempts).at(-1)?.finishedAt), status, isCurrent: current, supersededAt: current ? null : text(peers[index + 1]?.createdAt) || null, basedOn: { briefVersion: cardIndex >= 0 ? businessVersion(p, p.cards[cardIndex]) : 0, researchArtifactId: null }, staleReason: current ? state?.status === 'stale' ? '后端已标记此版本过时。' : null : '此产物不是当前阶段版本。', producedByJobId: text(producer?.id) || null, release: release ? { releasedAt, releasedBy: text(release.actorId) } : null, coverage: [], simulated: a.provenance === 'synthetic' || nested(producer?.binding).providerId === 'local-synthetic' || nested(nested(producer?.task).execution).testOnly === true };
}
export function artifactSummary(a: Artifact): ArtifactSummary { return { ...a, claimCount: a.claimIds.length }; }

const evidenceTopics: EvidenceTopic[] = ['audience', 'category', 'competitor', 'cultural', 'production'];
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
  for (const source of p.sourceEntries.filter(entry => entry.taskCardId === p.activeTaskCardId)) {
    const id = text(source.id);
    if (!known.has(id)) known.set(id, { ...source, text: text(source.excerpt), capturedAt: text(source.createdAt), context: {actorId: text(source.addedBy)}, provenance: {kind:'user_provided', originalUrl: text(source.url)} });
  }
  for (const capture of p.sourceCaptures) {
    if (capture.taskCardId !== p.activeTaskCardId) continue;
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
  if (raw.decision !== 'accept' && raw.decision !== 'blocked') throw new ServiceError('validation', '研究负责人原报告缺少明确接收或阻断结论。');
  const accept = raw.decision === 'accept';
  if (raw.side !== 'producer' && raw.side !== 'consumer') throw new ServiceError('validation', '研究交接缺少实际生产者或接收者身份。');
  return { id: text(raw.id), projectId: p.id, artifactId: text(raw.artifactId), artifactVersion: artifact.version, side, owner: text(nested(raw.ownerBinding).role), decision: accept ? side === 'research_owner' ? 'delivered' : 'accepted_with_conditions' : 'returned', permittedUses: strings(raw.permittedUses), prohibitedInferences: strings(raw.prohibitedInferences), unresolvedIssues: records(raw.unresolvedIssues).map((issue) => text(issue.reason)), note: text(body.summary) || strings(raw.limitations).join('\n'), createdAt: text(raw.createdAt), recordedBy: text(nested(raw.context).actorId), outdated: !artifact.isCurrent || raw.artifactId !== artifact.id || raw.contentHash !== p.artifacts.find((item) => item.id === artifact.id)?.contentHash, outdatedReason: !artifact.isCurrent || raw.artifactId !== artifact.id || raw.contentHash !== p.artifacts.find(item => item.id === artifact.id)?.contentHash ? '历史版本交接，不代表当前产物已接收。' : null };
}
export function projectionGaps(claims: number, sources: number): EvidenceGap[] {
  return claims || sources ? [{ id: 'unclassified-backend-evidence', kind: 'coverage', title: '研究用途分类尚未接入', detail: `${claims} 条论点、${sources} 项来源缺少后端明确的用途分类，未猜测人群或品类归属。`, recommendedAction: '原始正文、论点和来源记录均保留，未分类条目可查看与定位核验；后续按实际依据补分类，不猜测用途。', claimIds: [] }] : [];
}

export async function readResearchArtifact(p: ResearchSnapshot, artifactId: string, loadContent: (artifactId: string) => Promise<unknown>) {
  requireResearchProtocol(p);
  const raw = p.artifacts.find(a => a.id === artifactId && a.stage === 'research');
  if (!raw || !/^[a-f0-9]{64}$/.test(text(raw.contentHash))) throw new ServiceError('validation', '研究产物身份或正文哈希无效。');
  const envelope = object(await loadContent(artifactId));
  if (envelope.artifactId !== artifactId || envelope.contentHash !== raw.contentHash || typeof envelope.contentText !== 'string') throw new ServiceError('validation', '研究正文缺少原始字节或与所选产物不符。');
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(envelope.contentText)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== raw.contentHash) throw new ServiceError('validation', '研究正文实际字节与登记哈希不符。');
  let content: Record<string, unknown>;
  try {content = object(JSON.parse(envelope.contentText));} catch {throw new ServiceError('validation', '研究原始正文不是有效JSON。');}
  if (canonical(content) !== canonical(envelope.content) || !Array.isArray(content.claims)) throw new ServiceError('validation', '研究正文对象与原始文本或论点清单不一致。');
  const artifact = mapArtifact(p, raw, content), claims = await mapClaims(p, raw, content), sources = mapSources(p, raw);
  artifact.claimIds = claims.items.map(c => c.id);
  const reviews = [...p.textReports.verification.filter(r => r.artifactId === artifactId).map(r => mapReview(p, artifact, raw, r, 'verification')), ...p.textReports.readiness.filter(r => r.artifactId === artifactId).map(r => mapReview(p, artifact, raw, r, 'readiness'))];
  return {artifact, claims: claims.items, sources: sources.items, reviews, gaps: projectionGaps(claims.unclassified, sources.unclassified)};
}

export function projectResearchJob(p: Snapshot, raw: Record<string, unknown>): Job {
  let purpose: Job['purpose'];
  if (raw.purpose === 'verification') purpose = 'evidence_verification';
  else if (raw.purpose === 'readiness') purpose = 'readiness_review';
  else if ((!raw.purpose || raw.purpose === 'stage') && raw.stage === 'research') purpose = 'research_generation';
  else throw new ServiceError('unavailable', '此研究执行类型尚未接入任务列表；原始任务仍保留。');
  const status: Job['status'] = raw.status === 'running' || raw.status === 'queued' || raw.status === 'awaiting_reconciliation' ? raw.status : raw.status === 'succeeded' ? 'succeeded' : 'failed';
  const last = records(raw.attempts).at(-1), error = nested(raw.error);
  return {id: text(raw.id), projectId: p.id, purpose, label: purpose === 'research_generation' ? '研究生产' : purpose === 'evidence_verification' ? '事实核验' : '研究有效性核验', status, commandId: text(nested(nested(raw.task).request).commandId), createdAt: text(last?.startedAt), startedAt: text(last?.startedAt) || null, completedAt: text(last?.finishedAt) || null,
    error: text(error.code) ? {code: text(error.code), message: '研究任务未完成，请核对原始执行记录。', detail: JSON.stringify(error), retryable: false} : null, receipt: null, target: {kind: 'project', id: p.id, label: p.name}, output: strings(raw.outputVersionIds)[0] ? {kind: 'artifact', id: strings(raw.outputVersionIds)[0]} : null,
    attempt: records(raw.attempts).length, retryOfJobId: null, reconciledAt: null, recovery: {action: 'none', eligible: false, reason: '此入口未自动恢复或重试执行任务。'}, simulated: nested(raw.binding).providerId === 'local-synthetic' || nested(nested(raw.task).execution).testOnly === true};
}

export async function projectResearchWorkspace(p: ResearchSnapshot, loadContent: (artifactId: string) => Promise<unknown>): Promise<ResearchWorkspace> {
  requireResearchProtocol(p);
  const state = p.stages.find(s => s.stage === 'research');
  const detail = state?.activeArtifactId ? await readResearchArtifact(p, state.activeArtifactId, loadContent) : null;
  const verification = detail?.reviews.filter(r => r.type === 'verification' && !r.outdated) ?? [];
  const readiness = detail?.reviews.filter(r => r.type === 'readiness' && !r.outdated) ?? [];
  const pending = p.jobs.filter(j => j.stage === 'research' && ['queued', 'running', 'awaiting_reconciliation'].includes(text(j.status)));
  // Owner/semantic/acquisition jobs have no truthful equivalent in the old Job model.
  // Keep their actual status in researchWorkflow; never rename them as generation jobs.
  const activeJobs = pending.filter(j => ['stage', 'verification', 'readiness', ''].includes(text(j.purpose))).map(j => projectResearchJob(p, j));
  return {project: mapProject(p), artifact: detail?.artifact ?? null, claims: detail?.claims ?? [], sources: detail?.sources ?? mapSources(p).items,
    verification: verification.find(r => r.decision === 'fail') ?? verification.at(-1) ?? null,
    readiness: readiness.find(r => r.decision === 'fail') ?? readiness.at(-1) ?? null,
    gaps: detail?.gaps ?? [], activeJobs, versions: p.artifacts.filter(a => a.stage === 'research').map(a => artifactSummary(mapArtifact(p, a)))};
}

export function projectSources(p: ResearchSnapshot, query: SourceQuery = {}, workspace?: ResearchWorkspace): SourceLibrary {
  requireResearchProtocol(p);
  const raw = p.artifacts.find(a => a.id === p.stages.find(s => s.stage === 'research')?.activeArtifactId);
  const all = mapSources(p, raw).items.map(source => ({...source, citedByClaimIds: workspace?.claims.filter(c => c.sourceIds.includes(source.id)).map(c => c.id) ?? []}));
  const needle = query.search?.toLocaleLowerCase();
  const items = all.filter(s => (!query.intendedUse || query.intendedUse === 'all' || s.intendedUse === query.intendedUse) && (!query.verificationStatus || query.verificationStatus === 'all' || s.verificationStatus === query.verificationStatus) && (!needle || `${s.title} ${s.publisher} ${s.excerpt}`.toLocaleLowerCase().includes(needle)));
  return {project: mapProject(p), items, total: items.length, attachableClaims: workspace?.claims ?? []};
}

export function projectHandoff(p: ResearchSnapshot, workspace: ResearchWorkspace): HandoffOverview {
  requireResearchProtocol(p);
  if (workspace.project.id !== p.id) throw new ServiceError('validation', '研究交接工作区属于其他项目。');
  const workflow = p.researchWorkflow ?? {}, artifact = workspace.artifact;
  const check = (id: string) => records(workflow.checks).find(c => c.id === id)?.passed === true;
  const reports = nested(workflow.ownerReports);
  const currentReportIds = [nested(reports.producer).reportId, nested(reports.consumer).reportId].filter(value => typeof value === 'string');
  const history = artifact ? p.textReports.handoff.filter(r => r.artifactId === artifact.id).map(raw => {
    const handoff = mapHandoff(p, artifact, raw);
    const outdated = handoff.outdated || !currentReportIds.includes(handoff.id) || !check(raw.side === 'producer' ? 'delivery' : 'acceptance');
    return {...handoff, outdated, outdatedReason: outdated ? '历史或待重核的交接，不能代替当前研究接收。' : null};
  }) : [];
  const permission = (key: string) => {const raw = nested(workflow[key]); return {allowed: raw.allowed === true, reason: raw.allowed === true ? '' : '实际交接条件尚未满足，请查看研究执行与核验记录。'};};
  const suggested = nested(workflow.suggested);
  return {project: workspace.project, artifact: artifact ? artifactSummary(artifact) : null, verification: workspace.verification, readiness: workspace.readiness,
    researchSide: history.filter(h => !h.outdated && h.side === 'research_owner').at(-1) ?? null,
    strategySide: history.filter(h => !h.outdated && h.side === 'strategy_owner').at(-1) ?? null,
    release: artifact?.isCurrent && check('release') ? artifact.release : null, history,
    eligibility: {projectId: p.id, target: 'strategy', eligible: false, alreadyContinued: workflow.alreadyContinued === true, summary: '当前入口核对研究交接，尚未授权或接入策略生产。', checks: records(workflow.checks).map(c => ({id: text(c.id), label: text(c.label) || text(c.id), passed: c.passed === true, detail: text(c.detail), fix: null}))},
    suggested: {permittedUses: strings(suggested.permittedUses), prohibitedInferences: strings(suggested.prohibitedInferences), unresolvedIssues: strings(suggested.unresolvedIssues)},
    canDeliver: permission('canDeliver'), canAccept: permission('canAccept'), canRelease: permission('canRelease')};
}
