import {isDeepStrictEqual as equal} from 'node:util';

// Pure candidate only. Native currentness, image evidence and durable CAS remain required.
const purposes = new Set(['final_visual_plan', 'final_visual_image', 'final_visual_review', 'final_visual_aggregate', 'final_visual_revision']);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const need = (value, code) => { if (!value) throw Object.assign(new Error(code), {code}); };
const belongs = (job, target) => job?.finalVisualRunId === target.targetId && purposes.has(job.purpose);
const text = value => typeof value === 'string' && value.trim().length > 0;
const ownBoundary = boundary => boundary.kind === 'anchor_own_result' && text(boundary.jobId) && text(boundary.attemptId) &&
  ['actorId', 'runId', 'contextId'].every(key => text(boundary.executor?.[key]));

export function requireTargetIdle(jobs, target, boundary = {}) {
  // Only the post-claim anchor of this exact attempt can exempt its own running job.
  const own = ownBoundary(boundary) ? boundary : null;
  need(!jobs.some(job => belongs(job, target) && (
    ['awaiting_reconciliation', 'unknown'].includes(job.status) ||
    job.status === 'running' && !(own && job.id === own.jobId &&
      job.attempts?.at(-1)?.id === own.attemptId &&
      equal(job.attempts.at(-1)?.executor, own.executor))
  )), 'VISUAL_B_OUTCOME_UNKNOWN');
}

export function freezeStep({request, target, snapshot, method, jobs}) {
  need(request && equal(Object.keys(request).sort(), ['commandId', 'expectedRevision', 'jobIds', 'phase', 'sourceHash', 'targetId'].sort()), 'VISUAL_B_REQUEST_INVALID');
  need(typeof request.commandId === 'string' && request.commandId.trim() && request.commandId !== '__proto__' &&
    Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 0, 'VISUAL_B_REQUEST_INVALID');
  need(request.phase === 'final_visual' && target?.phase === request.phase && request.targetId === target.targetId &&
    hash(request.sourceHash) && request.sourceHash === target.sourceHash, 'VISUAL_B_TARGET_CHANGED');
  need(Array.isArray(request.jobIds) && request.jobIds.length >= 1 && request.jobIds.length <= 4 &&
    new Set(request.jobIds).size === request.jobIds.length, 'VISUAL_B_JOB_SET_INVALID');
  need(method?.path === 'skills/visual-development-lead/SKILL.md' && method.version === '1.0.0' && hash(method.sha256) &&
    ['packaging', 'kv'].includes(method.carrier) && Array.isArray(method.appendices) &&
    equal(method.appendices.map(a => a.path).sort(), ['stage-review', 'records', method.carrier].map(a => `skills/visual-development-lead/references/${a}.md`).sort()) &&
    method.appendices.every(a => hash(a.sha256)), 'VISUAL_B_METHOD_REQUIRED');
  requireTargetIdle(jobs, target);
  const selected = request.jobIds.map(id => jobs.find(j => j.id === id));
  need(selected.every(j => belongs(j, target) && j.status === 'queued' && Array.isArray(j.attempts) && j.attempts.length === 0 && j.binding && j.node), 'VISUAL_B_JOB_SET_INVALID');
  return structuredClone({request, target, snapshot, method, jobs: selected.map(j => ({id: j.id, purpose: j.purpose, node: j.node, binding: j.binding, target: j.target ?? null}))});
}

export function requireStepBoundary({ledger, request, target, snapshot, method, jobs, jobId, boundary = {kind: 'dispatch'}}) {
  need(equal(ledger.request, request), 'VISUAL_B_REQUEST_CHANGED');
  need(equal(ledger.target, target) && equal(ledger.snapshot, snapshot) && equal(ledger.method, method), 'VISUAL_B_STALE');
  const job = jobs.find(j => j.id === jobId), frozen = ledger.jobs.find(j => j.id === jobId);
  need(frozen && belongs(job, target) && equal(frozen, {id: job.id, purpose: job.purpose, node: job.node, binding: job.binding, target: job.target ?? null}), 'VISUAL_B_JOB_CHANGED');
  requireTargetIdle(jobs, target, boundary);
  if (boundary.kind === 'dispatch' || boundary.kind === 'actual_claim') {
    need(job.status === 'queued' && job.attempts.length === 0, 'VISUAL_B_NOT_FRESH_QUEUED');
  } else {
    need(ownBoundary(boundary) && boundary.jobId === jobId && job.status === 'running' &&
      job.attempts.at(-1)?.id === boundary.attemptId && equal(job.attempts.at(-1)?.executor, boundary.executor), 'VISUAL_B_OWN_ATTEMPT_REQUIRED');
  }
  return job;
}

export const capability = () => ({protocol: 'simple-visual-b-candidate-v1', executionAllowed: false, integrated: false, unknownRecoverySupported: false, semanticApproval: false});
