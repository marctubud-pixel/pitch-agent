import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject, applyCommand, projectView, releaseReadiness, STAGES, REVIEW_ROLES} from './project.mjs';
import {createHash} from 'node:crypto';
import {deriveSketchReviewOutcome, CONDITIONS} from './sketch-review-v2.mjs';
import {COPY_CONTRACT_VERSION, validateStageOutput} from './stage-content.mjs';
// All runs, evidence and receipts here are synthetic fixtures, never real provider calls.
const ctx = (actorId = 'human', actorType = 'human') => ({actorId, actorType, runId: `${actorId}-run`, contextId: `${actorId}-context`, modelId: 'synthetic', parentRunIds: [], ancestorActorIds: [], inputPacketHash: 'synthetic-packet', exposedReviewIds: [], authorRecommendations: [], priorScores: []});
function fixture(options = {}) {
  let p = createProject({id: 'p', name: 'Synthetic project', brief: 'Synthetic brief', mode: 'auto', ...options}, ctx());
  let serial = 0;
  return {get p() { return p; }, restoreLegacyNativeMetadata(stage) {
    // An explicitly imported old snapshot exercises refusal, never a new successful native execution.
    p = structuredClone(p);
    const artifact = {...structuredClone(p.artifacts[0]), id: `legacy-${stage}`, stage, technicalReceipts: structuredClone(receipts)};
    p.artifacts.push(artifact); p.activeByStage[stage] = artifact.id;
    return artifact.id;
  }, restoreLegacyInFlightJob(stage) {
    p = structuredClone(p);
    const job = {...structuredClone(p.jobs[0]), id: `legacy-job-${stage}`, stage, status: 'requested', outputVersionIds: []};
    p.jobs.push(job);
    return job.id;
  }, restoreValidatedCopySnapshot(id, raw) {
    const content = validateStageOutput('copy', raw, {copyContractVersion: COPY_CONTRACT_VERSION}).content;
    const contentHash = createHash('sha256').update(JSON.stringify(content, null, 2)).digest('hex');
    p = structuredClone(p);
    const artifact = p.artifacts.find(a => a.id === id);
    assert.equal(artifact.provenance, 'imported_metadata');
    Object.assign(artifact, {contentHash, payloadRef: `synthetic://validated-copy/${contentHash}`, copyContract: {version: COPY_CONTRACT_VERSION, status: 'complete', contentHash}});
  }, send(c, context = ctx()) { p = applyCommand(p, {commandId: `c${++serial}`, expectedRevision: p.revision, ...c}, context); return p; }};
}
function confirm(f) { f.send({kind: 'confirm-task-card', taskCardId: f.p.activeTaskCardId}); }
function produce(f, stage, extra = {}) {
  const id = `${stage}-${f.p.revision}`;
  f.send({kind: 'request-stage', stage, jobId: id});
  f.send({kind: 'complete-stage', jobId: id, artifactId: id, payloadRef: 'synthetic://artifact', contentHash: id, ...extra}, ctx(`${stage}-author`, 'agent'));
  return id;
}
function review(f, id, extra = {}, context) {
  const stage = f.p.artifacts.find(a => a.id === id).stage;
  if (!f.p.panels.some(panel => panel.artifactId === id)) f.send({kind: 'assign-panel', artifactId: id, seats: REVIEW_ROLES[stage].map(role => ({role, ...ctx(`seat-${id}-${role}`, 'agent')}))});
  for (const role of REVIEW_ROLES[stage]) {
    const reviewId = `review-${f.p.revision}`;
    f.send({kind: 'record-review', artifactId: id, reviewId, role, verdict: 'pass', findings: [], score: 4, referenceFit: {status: 'pass', criteriaRef: 'synthetic-fit', evidenceRefs: ['synthetic-evidence']}, ...extra}, context ?? ctx(`seat-${id}-${role}`, 'agent'));
    f.send({kind: 'record-review', artifactId: id, reviewId: `opposition-${reviewId}`, role, reviewType: 'opposition', pairedReviewId: reviewId, firstReadRef: 'synthetic-first-read', verdict: 'pass', findings: []}, ctx(`opponent-${reviewId}`, 'agent'));
  }
  f.send({kind: 'record-disposition', artifactId: id, outcome: 'reject', reason: 'Synthetic independent adjudication retains votes and finds no blocking opposition', evidenceRefs: ['synthetic-review-packet']}, ctx(`director-${f.p.revision}`, 'agent'));
}
function handoff(f, id, stage, onlyStage) {
  const consumers = onlyStage ? [onlyStage] : Object.keys(STAGES).filter(s => STAGES[s].includes(stage));
  for (const nextStage of consumers.length ? consumers : ['delivery']) {
    f.send({kind: 'acknowledge-handoff', artifactId: id, side: 'producer', nextStage}, ctx(`${stage}-author`, 'agent'));
    f.send({kind: 'acknowledge-handoff', artifactId: id, side: 'consumer', nextStage}, ctx(`${nextStage}-owner`, 'agent'));
  }
}
function release(f, stage, options = {}) {
  const id = produce(f, stage, options);
  if (stage === 'copy') f.restoreValidatedCopySnapshot(id, {outputKind: 'copy', status: 'draft', title: 'Synthetic full copy', summary: 'Synthetic complete message fixture', sections: [{heading: 'Copy', body: 'Synthetic public copy', evidenceIds: []}], claims: [], gaps: [], directions: ['steady', 'product', 'user'].map((direction, index) => ({id: direction, title: `Direction ${index}`, slogan: `Headline ${index}`, supportingCopy: `Supporting public message ${index}`, creativeExplanation: `Private mechanism explanation ${index}`, rationale: `Strategy rationale ${index}`, differentiation: `Difference ${index}`, evidenceIds: []}))});
  if (stage !== 'research') review(f, id);
  handoff(f, id, stage);
  f.send({kind: 'release-stage', artifactId: id});
  return id;
}
const receipts = Object.fromEntries(['package', 'layout', 'import', 'render'].map(key => [key, {status: 'pass', ref: `synthetic://${key}`} ]));
test('synthetic generic sequence requires scope and independent handoffs, stopping at dedicated sketch authority', () => {
  const f = fixture();
  assert.throws(() => produce(f, 'research'), {code: 'SCOPE_UNCONFIRMED'}); confirm(f);
  for (const stage of ['research', 'strategy', 'copy', 'references']) {
    const before = f.p; release(f, stage);
    assert.equal(before.revision < f.p.revision, true); assert.equal(Object.isFrozen(before), true);
    assert.equal(projectView(f.p).stages.find(s => s.stage === stage).status, 'released');
  }
  const before = f.p;
  assert.throws(() => produce(f, 'sketch'), {code: 'REVIEWED_SKETCH_REQUIRED'});
  assert.strictEqual(f.p, before); assert.equal(f.p.jobs.some(j => j.stage === 'sketch'), false);
  assert.equal(projectView(f.p).complete, false); assert.equal(f.p.audit.length, f.p.revision);
});

test('metadata-only copy cannot release through manual review or human adoption, even with forged completeness receipts', () => {
  const f = fixture(); confirm(f); release(f, 'research'); release(f, 'strategy');
  const forged = {version: COPY_CONTRACT_VERSION, status: 'complete', contentHash: 'forged'};
  const id = produce(f, 'copy', {copyContract: forged, technicalReceipts: {copyContract: forged}});
  review(f, id); handoff(f, id, 'copy');
  f.send({kind: 'adopt-creative', artifactId: id, reason: 'Synthetic human preference cannot supply missing copy'});
  const artifact = f.p.artifacts.find(a => a.id === id);
  assert.equal(artifact.provenance, 'imported_metadata');
  assert.equal(artifact.copyContract.status, 'missing_required_parts');
  assert.deepEqual(releaseReadiness(f.p, id), {eligible: false, blockedReasons: ['COPY_MESSAGE_INCOMPLETE']});
  assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'COPY_MESSAGE_INCOMPLETE'});
  assert.equal(f.p.releases.some(r => r.artifactId === id), false);
  assert.throws(() => produce(f, 'references'), {code: 'DEPENDENCY_BLOCKED'});
  const historical = structuredClone(f.p);
  historical.releases.push({artifactId: id, policyVersion: 1, marker: 'Synthetic historical release'});
  const releaseHistory = structuredClone(historical.releases);
  assert.equal(releaseReadiness(historical, id).eligible, false);
  assert.notEqual(projectView(historical).stages.find(stage => stage.stage === 'copy').status, 'released');
  assert.deepEqual(historical.releases, releaseHistory);
});
test('assisted selected gate remains paused after pass and requires human adoption', () => {
  const f = fixture({mode: 'assisted'}); confirm(f);
  ['research', 'strategy', 'copy'].forEach(s => release(f, s));
  const id = produce(f, 'references'); review(f, id); handoff(f, id, 'references');
  assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'HUMAN_GATE'});
  assert.throws(() => f.send({kind: 'adopt-creative', artifactId: id, reason: 'yes'}, ctx('agent', 'agent')), {code: 'HUMAN_REQUIRED'});
  const paused = f.p;
  assert.throws(() => produce(f, 'sketch'), {code: 'REVIEWED_SKETCH_REQUIRED'});
  assert.strictEqual(f.p, paused);
  f.send({kind: 'adopt-creative', artifactId: id, reason: 'Human selects this route'});
  f.send({kind: 'release-stage', artifactId: id});
  assert.equal(projectView(f.p).stages.find(stage => stage.stage === 'references').status, 'released');
  const released = f.p;
  assert.throws(() => produce(f, 'sketch'), {code: 'REVIEWED_SKETCH_REQUIRED'});
  assert.strictEqual(f.p, released);
});
test('creative disagreement can be adopted but factual unknown remains blocked with original review retained', () => {
  const f = fixture(); confirm(f); release(f, 'research');
  const id = produce(f, 'strategy', {claims: [{kind: 'fact', verification: 'pending', evidenceRefs: []}]});
  review(f, id, {verdict: 'reject', findings: [{category: 'creative_preference'}]});
  f.send({kind: 'adopt-creative', artifactId: id, reason: 'Prefer B'}); handoff(f, id, 'strategy');
  assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'HARD_BLOCKER'});
  assert.equal(f.p.reviews[0].verdict, 'reject');
});
test('independent review rejects author identity, run, ancestry and contaminated first reads', () => {
  const f = fixture(); confirm(f); release(f, 'research'); const id = produce(f, 'strategy');
  for (const context of [ctx('strategy-author', 'agent'), {...ctx('other', 'agent'), runId: 'strategy-author-run'}, {...ctx('other', 'agent'), parentRunIds: ['research-author-run']}]) {
    assert.throws(() => review(f, id, {}, context), {code: 'SELF_REVIEW'});
  }
  assert.throws(() => review(f, id, {}, {...ctx('r', 'agent'), priorScores: [99]}), {code: 'REVIEW_EXPOSURE'});
  assert.throws(() => review(f, id, {}, {actorId: 'r', runId: 'r', contextId: 'r'}), {code: 'REVIEW_CONTEXT_REQUIRED'});
  review(f, id);
});
test('scope edit invalidates descendants and old in-flight completion stays historical', () => {
  const f = fixture(); confirm(f); release(f, 'research'); release(f, 'strategy');
  f.send({kind: 'request-stage', stage: 'copy', jobId: 'in-flight'});
  f.send({kind: 'revise-task-card', taskCardId: 'scope2', brief: 'Changed scope'});
  f.send({kind: 'complete-stage', jobId: 'in-flight', artifactId: 'old-copy', payloadRef: 'synthetic://old', contentHash: 'old'}, ctx('copy-author', 'agent'));
  assert.equal(f.p.jobs.at(-1).status, 'succeeded_stale');
  assert.equal(f.p.activeByStage.copy, undefined);
  assert.equal(projectView(f.p).stages.find(s => s.stage === 'strategy').status, 'stale');
  assert.throws(() => produce(f, 'research'), {code: 'SCOPE_UNCONFIRMED'});
});
test('generic content and native stages reject exported-file flags and technical receipts before job creation', () => {
  const f = fixture(); confirm(f);
  ['research', 'strategy', 'copy', 'references'].forEach(s => release(f, s));
  for (const stage of ['content_review', 'layout', 'final_review']) {
    const before = f.p;
    assert.throws(() => f.send({kind: 'request-stage', stage, jobId: `forged-${stage}`, completed: true, technicalReceipts: receipts}), {code: stage === 'content_review' ? 'CONTENT_DEDICATED_ROUTE_REQUIRED' : 'LAYOUT_EXECUTION_UNAVAILABLE'});
    assert.strictEqual(f.p, before); assert.equal(f.p.jobs.some(j => j.stage === stage), false);
  }
  assert.equal(projectView(f.p).complete, false);
});

test('optimistic conflict, immutable input and idempotent command replay', () => {
  const f = fixture(); const initial = f.p;
  const command = {kind: 'confirm-task-card', taskCardId: initial.activeTaskCardId, commandId: 'fixed', expectedRevision: 0};
  const next = applyCommand(initial, command, ctx());
  assert.equal(initial.confirmations.length, 0);
  assert.strictEqual(applyCommand(next, command, ctx()), next);
  assert.throws(() => applyCommand(next, {...command, commandId: 'new'}, ctx()), {code: 'REVISION_CONFLICT'});
  assert.throws(() => applyCommand(next, {...command, taskCardId: 'other'}, ctx()), {code: 'COMMAND_ID_REUSED'});
});
test('human may adopt creative rejection without rewriting original independent verdict', () => {
  const f = fixture(); confirm(f); release(f, 'research'); const id = produce(f, 'strategy');
  review(f, id, {verdict: 'reject', findings: [{category: 'creative_preference', reason: 'Prefer A'}]});
  f.send({kind: 'adopt-creative', artifactId: id, reason: 'Choose B despite preference for A'}); handoff(f, id, 'strategy');
  f.send({kind: 'release-stage', artifactId: id});
  assert.equal(f.p.reviews.find(r => r.reviewType === 'score').verdict, 'reject');
  assert.equal(projectView(f.p).stages.find(s => s.stage === 'strategy').status, 'released');
});
test('updated copy invalidates released references and retains original artifacts and releases', () => {
  const f = fixture(); confirm(f);
  ['research', 'strategy', 'copy', 'references'].forEach(stage => release(f, stage));
  const oldCopy = f.p.activeByStage.copy, oldReference = f.p.activeByStage.references;
  release(f, 'copy'); assert.notEqual(f.p.activeByStage.copy, oldCopy);
  assert.equal(projectView(f.p).stages.find(s => s.stage === 'references').status, 'stale');
  assert.equal(projectView(f.p).complete, false);
  assert.equal(f.p.artifacts.some(a => a.id === oldReference), true);
  assert.equal(f.p.releases.some(r => r.artifactId === oldReference), true);
  assert.throws(() => f.send({kind: 'release-stage', artifactId: oldReference}), {code: 'STALE_ARTIFACT'});
});

test('generic content review and unreviewed sketch cannot skip dedicated authority', () => {
  const f = fixture(); confirm(f);
  ['research', 'strategy', 'copy', 'references'].forEach(s => release(f, s));
  assert.equal(f.p.visualAuthorizations.length, 0);
  assert.throws(() => produce(f, 'sketch'), {code: 'REVIEWED_SKETCH_REQUIRED'});
  assert.throws(() => produce(f, 'visual'), {code: 'DEPENDENCY_BLOCKED'});
  assert.throws(() => produce(f, 'content_review'), {code: 'CONTENT_DEDICATED_ROUTE_REQUIRED'});
  assert.throws(() => f.send({kind: 'authorize-visual', sketchArtifactId: f.p.activeByStage.references, reason: 'Reference is not a sketch'}), {code: 'INVALID_AUTHORIZATION'});
  assert.equal(f.p.visualAuthorizations.length, 0);
});

test('new blocking rejection revokes current release and downstream use transitively', () => {
  const f = fixture(); confirm(f);
  ['research', 'strategy', 'copy', 'references'].forEach(stage => release(f, stage));
  const id = f.p.activeByStage.strategy, originals = structuredClone(f.p.reviews);
  f.send({kind: 'record-review', artifactId: id, reviewId: 'late-hard', role: 'strategy', reviewType: 'opposition', pairedReviewId: f.p.reviews.find(r => r.artifactId === id && r.reviewType === 'score').id, firstReadRef: 'late-first-read', verdict: 'reject', findings: [{category: 'factual', blocking: true, severity: 'major', evidenceRefs: ['source'], requirement: 'Correct contradicted assertion'}]}, ctx('late-reviewer', 'agent'));
  assert.equal(projectView(f.p).complete, false);
  assert.equal(projectView(f.p).stages.find(s => s.stage === 'strategy').status, 'awaiting_release');
  assert.equal(releaseReadiness(f.p, id).eligible, false);
  assert.throws(() => produce(f, 'copy'), {code: 'DEPENDENCY_BLOCKED'});
  assert.throws(() => produce(f, 'references'), {code: 'DEPENDENCY_BLOCKED'});
  assert.deepEqual(f.p.reviews.slice(0, originals.length), originals);
});

test('each consuming edge needs its own two-owner handoff', () => {
  const f = fixture(); confirm(f); release(f, 'research');
  const id = produce(f, 'strategy'); review(f, id);
  handoff(f, id, 'strategy', 'content_review'); f.send({kind: 'release-stage', artifactId: id});
  assert.throws(() => produce(f, 'copy'), {code: 'HANDOFF_REQUIRED'});
  f.send({kind: 'acknowledge-handoff', artifactId: id, side: 'producer', nextStage: 'copy'}, ctx('strategy-author', 'agent'));
  assert.throws(() => produce(f, 'copy'), {code: 'HANDOFF_REQUIRED'});
  f.send({kind: 'acknowledge-handoff', artifactId: id, side: 'consumer', nextStage: 'copy'}, ctx('copy-owner', 'agent'));
  produce(f, 'copy');
});

test('older same-input completion is historical after newer request', () => {
  const f = fixture(); confirm(f);
  for (const jobId of ['old', 'new']) f.send({kind: 'request-stage', stage: 'research', jobId});
  for (const jobId of ['new', 'old']) f.send({kind: 'complete-stage', jobId, artifactId: jobId, payloadRef: 'synthetic://result', contentHash: jobId}, ctx('research-author', 'agent'));
  assert.equal(f.p.activeByStage.research, 'new'); assert.equal(f.p.jobs[0].status, 'succeeded_stale');
});
test('panel cannot collapse seats or waive new dissent with an earlier decision', () => {
  const f = fixture(); confirm(f); release(f, 'research'); const id = produce(f, 'strategy'); review(f, id); handoff(f, id, 'strategy');
  const first = f.p.reviews[0];
  assert.throws(() => f.send({kind: 'record-review', artifactId: id, reviewId: 'repeat', role: 'strategy', verdict: 'pass', findings: []}, first.context), {code: 'REVIEW_SEAT_REUSED'});
  f.send({kind: 'record-review', artifactId: id, reviewId: 'late-preference', role: 'strategy', reviewType: 'opposition', pairedReviewId: first.id, firstReadRef: 'late-first-read', verdict: 'reject', findings: [{category: 'creative_preference'}]}, ctx('dissent', 'agent'));
  assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'DISPOSITION_REQUIRED'});
  f.send({kind: 'record-disposition', artifactId: id, outcome: 'reject', reason: 'Retain original preference while accepting the direction', evidenceRefs: ['packet']}, ctx('independent-director', 'agent'));
  f.send({kind: 'release-stage', artifactId: id});
  assert.equal(f.p.reviews.find(r => r.id === 'late-preference').verdict, 'reject');
});
test('endpoint limits generic authorization and selected gates require current human adoption', () => {
  const f = fixture({authorizedThrough: 'references'}); confirm(f);
  ['research', 'strategy', 'copy', 'references'].forEach(s => release(f, s));
  assert.throws(() => produce(f, 'visual'), {code: 'AUTHORIZATION_ENDPOINT'});
  const g = fixture({humanGates: ['references']}); confirm(g);
  ['research', 'strategy', 'copy'].forEach(s => release(g, s));
  const id = produce(g, 'references'); review(g, id); handoff(g, id, 'references');
  assert.throws(() => g.send({kind: 'release-stage', artifactId: id}), {code: 'HUMAN_GATE'});
  g.send({kind: 'adopt-creative', artifactId: id, reason: 'Selected synthetic reference gate'}); g.send({kind: 'release-stage', artifactId: id});
  assert.equal(projectView(g.p).stages.find(s => s.stage === 'references').status, 'released');
  assert.throws(() => produce(g, 'sketch'), {code: 'REVIEWED_SKETCH_REQUIRED'});
});

test('reference fit uses separate criteria even with four high original scores', () => {
  const f = fixture(); confirm(f); ['research', 'strategy', 'copy'].forEach(s => release(f, s));
  const ref = produce(f, 'references'); review(f, ref, {score: 5, referenceFit: undefined}); handoff(f, ref, 'references');
  assert.throws(() => f.send({kind: 'release-stage', artifactId: ref}), {code: 'REFERENCE_FIT_REQUIRED'});
  assert.deepEqual(f.p.reviews.filter(r => r.artifactId === ref && r.reviewType === 'score').map(r => r.score), [5, 5, 5, 5]);
});

test('minor actionable observations do not become hard blockers', () => {
  const f = fixture(); confirm(f); release(f, 'research'); const id = produce(f, 'strategy');
  review(f, id, {findings: [{category: 'structure', severity: 'minor', blocking: false, requirement: 'Consider shortening heading'}]}); handoff(f, id, 'strategy');
  f.send({kind: 'release-stage', artifactId: id});
  assert.equal(projectView(f.p).stages.find(s => s.stage === 'strategy').status, 'released');
});
test('empty rejection stays unresolved and a single visual role cannot fill the panel', () => {
  const f = fixture(); confirm(f); release(f, 'research'); const id = produce(f, 'strategy');
  review(f, id, {verdict: 'reject'}); handoff(f, id, 'strategy');
  assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'REVIEW_REQUIRED'});
  const g = fixture(); confirm(g); ['research', 'strategy', 'copy'].forEach(s => release(g, s));
  const reference = produce(g, 'references'); handoff(g, reference, 'references');
  const shared = ctx('shared-execution', 'agent');
  g.send({kind: 'assign-panel', artifactId: reference, seats: REVIEW_ROLES.references.map(role => ({role, ...(role === 'visual' ? shared : ctx(`assigned-${role}`, 'agent'))}))});
  g.send({kind: 'record-review', artifactId: reference, reviewId: 'visual-seat', role: 'visual', verdict: 'pass', findings: [], score: 5}, shared);
  assert.throws(() => g.send({kind: 'record-review', artifactId: reference, reviewId: 'brand-seat', role: 'brand', verdict: 'pass', findings: [], score: 5}, shared), {code: 'REVIEW_SEAT_REUSED'});
  assert.throws(() => g.send({kind: 'release-stage', artifactId: reference}), {code: 'REVIEW_REQUIRED'});
});
test('four-role panel is frozen before scores and original low scores cannot be replaced', () => {
  const f = fixture(); confirm(f); ['research', 'strategy', 'copy'].forEach(s => release(f, s));
  const id = produce(f, 'references');
  const seats = REVIEW_ROLES.references.map(role => ({role, ...ctx(`seat-${id}-${role}`, 'agent')}));
  const scoreCommand = {kind: 'record-review', artifactId: id, reviewId: 'premature', role: 'visual', verdict: 'pass', findings: [], score: 5};
  assert.throws(() => f.send(scoreCommand, seats[0]), {code: 'PANEL_REQUIRED'});
  assert.throws(() => f.send({kind: 'assign-panel', artifactId: id, seats: seats.map(seat => seat.role === 'visual' ? {...seat, ...ctx('references-author', 'agent')} : seat)}), {code: 'SELF_REVIEW'});
  assert.throws(() => f.send({kind: 'assign-panel', artifactId: id, seats: seats.map(seat => ({...seat, actorId: 'same'}))}), {code: 'REVIEW_SEAT_REUSED'});
  f.send({kind: 'assign-panel', artifactId: id, seats});
  assert.throws(() => f.send(scoreCommand, ctx('unassigned', 'agent')), {code: 'UNASSIGNED_REVIEWER'});
  assert.throws(() => f.send({kind: 'assign-panel', artifactId: id, seats: seats.map(seat => ({...seat, actorId: `replacement-${seat.role}`}))}), {code: 'PANEL_FROZEN'});
  review(f, id, {score: 3}); handoff(f, id, 'references');
  for (const role of REVIEW_ROLES.references) assert.throws(() => f.send({...scoreCommand, reviewId: `replacement-${role}`, role}, ctx(`replacement-${role}`, 'agent')), {code: 'SCORE_ALREADY_RECORDED'});
  // Reference applicability is separate from sketch score thresholds.
  f.send({kind: 'release-stage', artifactId: id});
  assert.deepEqual(f.p.reviews.filter(r => r.artifactId === id && r.reviewType === 'score').map(r => r.score), [3, 3, 3, 3]);
});
test('human disposition outcomes never satisfy a selected gate and adoption binds current reviews', () => {
  const f = fixture({humanGates: ['strategy']}); confirm(f); release(f, 'research');
  const id = produce(f, 'strategy'); review(f, id); handoff(f, id, 'strategy');
  for (const outcome of ['pending', 'defer', 'reject', 'adopt']) {
    f.send({kind: 'record-disposition', artifactId: id, outcome, reason: 'Human disposition only', evidenceRefs: ['packet']});
    assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'HUMAN_GATE'});
  }
  f.send({kind: 'adopt-creative', artifactId: id, outcome: 'pending', reason: 'Explicitly adopt current artifact'});
  assert.equal(f.p.decisions.at(-1).kind, 'adopt-creative');
  assert.equal(f.p.decisions.at(-1).outcome, 'adopt_creative');
  f.send({kind: 'release-stage', artifactId: id});
  f.send({kind: 'record-review', artifactId: id, reviewId: 'late-opposition', role: 'strategy', reviewType: 'opposition', pairedReviewId: f.p.reviews[0].id, firstReadRef: 'late-first-read', verdict: 'pass', findings: []}, ctx('late-opponent', 'agent'));
  f.send({kind: 'record-disposition', artifactId: id, outcome: 'reject', reason: 'Criticism rejected with rationale', evidenceRefs: ['packet']}, ctx('new-director', 'agent'));
  assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'HUMAN_GATE'});
  f.send({kind: 'adopt-creative', artifactId: id, reason: 'Adopt after reading new opposition'});
  f.send({kind: 'release-stage', artifactId: id});
});
test('pending or deferred criticism cannot resolve a rejection and hard findings cannot be waived', () => {
  const f = fixture(); confirm(f); release(f, 'research');
  const id = produce(f, 'strategy'); const seat = ctx('assigned-strategy', 'agent');
  f.send({kind: 'assign-panel', artifactId: id, seats: [{role: 'strategy', ...seat}]});
  f.send({kind: 'record-review', artifactId: id, reviewId: 'original', role: 'strategy', verdict: 'reject', findings: [{category: 'creative_preference'}]}, seat);
  f.send({kind: 'record-review', artifactId: id, reviewId: 'opposition', role: 'strategy', reviewType: 'opposition', pairedReviewId: 'original', firstReadRef: 'first-read', verdict: 'pass', findings: []}, ctx('opponent', 'agent'));
  handoff(f, id, 'strategy');
  for (const outcome of ['pending', 'defer', 'adopt']) {
    f.send({kind: 'record-disposition', artifactId: id, outcome, reason: 'Not yet resolved', evidenceRefs: ['packet']}, ctx('director', 'agent'));
    assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'DISPOSITION_REQUIRED'});
  }
  f.send({kind: 'record-disposition', artifactId: id, outcome: 'reject', reason: 'Reject criticism because direction satisfies brief', evidenceRefs: ['brief']}, ctx('director', 'agent'));
  f.send({kind: 'release-stage', artifactId: id});
  f.send({kind: 'record-review', artifactId: id, reviewId: 'hard-opposition', role: 'strategy', reviewType: 'opposition', pairedReviewId: 'original', firstReadRef: 'hard-first-read', verdict: 'reject', findings: [{category: 'factual', blocking: true, severity: 'major', evidenceRefs: ['source'], requirement: 'Correct false assertion'}]}, ctx('hard-opponent', 'agent'));
  f.send({kind: 'record-disposition', artifactId: id, outcome: 'reject', reason: 'Attempt to dismiss blocker', evidenceRefs: ['packet']}, ctx('director', 'agent'));
  assert.throws(() => f.send({kind: 'release-stage', artifactId: id}), {code: 'HARD_BLOCKER'});
});

test('legacy native metadata cannot release or gain authority even with all technical receipts', () => {
  const f = fixture(); confirm(f); release(f, 'research');
  for (const stage of ['layout', 'final_review']) {
    const id = f.restoreLegacyNativeMetadata(stage), before = f.p;
    assert.deepEqual(releaseReadiness(f.p, id), {eligible: false, blockedReasons: ['LAYOUT_FINAL_AUTHORITY_UNAVAILABLE']});
    assert.throws(() => f.send({kind: 'release-stage', artifactId: id, completed: true}), {code: 'LAYOUT_FINAL_AUTHORITY_UNAVAILABLE'});
    assert.throws(() => f.send({kind: 'acknowledge-handoff', artifactId: id, side: 'producer', nextStage: 'delivery'}), {code: 'LAYOUT_FINAL_AUTHORITY_UNAVAILABLE'});
    assert.strictEqual(f.p, before); assert.equal(projectView(f.p).complete, false);
    assert.equal(f.p.releases.some(r => r.artifactId === id), false);
  }
});

// This is the current review outcome algorithm's report seam. These constructed reports
// carry no provider originals or authority and are never registered as project artifacts.
function scoreOutcome(scores) {
  const cohorts = ['a', 'b', 'c'].map(id => ({id, candidates: [{candidateId: id, directionId: id, imageId: `image-${id}`, sha256: `hash-${id}`}], images: [{imageId: `image-${id}`, sha256: `hash-${id}`}]}));
  const nodes = cohorts.flatMap(c => [...REVIEW_ROLES.sketch.map(role => ({key: `${c.id}-score-${role}`, cohortId: c.id, phase: 'score', role})), {key: `${c.id}-director`, cohortId: c.id, phase: 'director'}]);
  const reports = nodes.map(node => {
    const c = cohorts.find(c => c.id === node.cohortId), candidate = c.candidates[0];
    const evidence = [{imageId: candidate.imageId, sha256: candidate.sha256, region: 'whole synthetic image', observation: 'Constructed report algorithm fixture only'}];
    return {id: node.key, nodeKey: node.key, phase: node.phase, valid: true,
      slots: node.phase === 'score' ? [{candidateId: candidate.candidateId, status: 'valid', entry: {score: scores[REVIEW_ROLES.sketch.indexOf(node.role)], findings: []}}] : [],
      raw: {findings: [], dispositions: [], comparisons: [], conditions: CONDITIONS.map(name => ({candidateId: candidate.candidateId, name, status: 'pass', evidence}))}};
  });
  return {cohorts, nodes, reports};
}
test('current sketch algorithm preserves four original scores and rejects an unrounded mean below four', () => {
  for (const scores of [[4, 4, 4, 4], [5, 3, 4, 4], [4, 4, 4, 3.996]]) {
    const run = scoreOutcome(scores), before = structuredClone(run), result = deriveSketchReviewOutcome({}, run);
    const mean = scores.reduce((sum, score) => sum + score, 0) / 4;
    assert.equal(result.status, mean >= 4 ? 'selection_ready' : 'blocked');
    for (const direction of result.directions) {
      assert.equal(direction.outcomes[0].mean, mean);
      assert.deepEqual(direction.outcomes[0].votes.map(v => v.score), scores);
      assert.equal(direction.outcomes[0].eligible, mean >= 4);
    }
    assert.deepEqual(run, before);
  }
});
test('current sketch algorithm requires all original votes and keeps unknown necessary conditions blocked', () => {
  const missing = scoreOutcome([5, 5, 5, 5]); missing.reports[0].slots[0].status = 'invalid';
  const incomplete = deriveSketchReviewOutcome({}, missing);
  assert.equal(incomplete.status, 'blocked'); assert.equal(incomplete.directions[0].reason, 'original_vote_missing');
  const unknown = scoreOutcome([5, 5, 5, 5]); unknown.reports.find(r => r.phase === 'director').raw.conditions[0].status = 'unknown';
  const blocked = deriveSketchReviewOutcome({}, unknown);
  assert.equal(blocked.status, 'blocked'); assert.equal(blocked.directions[0].outcomes[0].eligible, false);
});

test('generic completion cannot convert old in-flight sketch or native jobs into current authority', () => {
  const f = fixture(); confirm(f); release(f, 'research');
  for (const stage of ['sketch', 'layout', 'final_review']) {
    const jobId = f.restoreLegacyInFlightJob(stage), before = f.p;
    assert.throws(() => f.send({kind: 'complete-stage', jobId, artifactId: `forged-${stage}`, payloadRef: 'synthetic://exported-file', contentHash: 'forged', completed: true, technicalReceipts: receipts}, ctx(`${stage}-author`, 'agent')),
      {code: stage === 'sketch' ? 'REVIEWED_SKETCH_REQUIRED' : 'LAYOUT_FINAL_AUTHORITY_UNAVAILABLE'});
    assert.strictEqual(f.p, before);
    assert.equal(f.p.artifacts.some(a => a.id === `forged-${stage}`), false);
    assert.equal(f.p.jobs.find(j => j.id === jobId).status, 'requested');
  }
});
