import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject, applyCommand, revisionPlan, releaseReadiness, REVIEW_ROLES} from './project.mjs';
import {buildStageRequest, validateStageOutput} from './stage-content.mjs';
import {buildFeedbackReviewRequest, validateFeedbackReviewOutput} from './human-feedback.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const ctx = (id, actorType = 'agent') => ({actorId: id, actorType, runId: `${id}-run`, contextId: `${id}-ctx`, parentRunIds: [], ancestorActorIds: []});
const person = ctx('human', 'human'), author = ctx('original-author'), reviser = ctx('reviser'), reviewer = ctx('independent-reviewer');
const source = {id: 'source', url: 'https://example.org/report', text: 'Synthetic background only', verification: 'captured', scopeRelation: 'background'};
const binding = {providerId: 'synthetic', model: 'synthetic', role: 'research-lead'};
const raw = summary => ({outputKind: 'research_findings', status: 'draft', title: 'Synthetic draft', summary,
  sections: [{heading: 'Findings', body: summary, evidenceIds: ['source']}], claims: [{text: 'Synthetic background only', kind: 'fact', evidenceRefs: ['source'], limitations: ['Synthetic fixture']}], gaps: [],
  evidenceClassifications: [{sourceId: 'source', scopeRelation: 'background', reason: 'Synthetic background'}]});
function fixture() {
  let p = createProject({id: 'p', name: 'Synthetic', brief: 'Test fixture only', mode: 'auto'}, person), serial = 0;
  const f = {get p() { return p; }, send(command, context = person) { p = applyCommand(p, {commandId: `command-${++serial}`, expectedRevision: p.revision, ...command}, context); return p; }};
  f.send({kind: 'confirm-task-card', taskCardId: p.activeTaskCardId});
  f.base = validateStageOutput('research', raw('Original text'), {sourceRecords: [source]}).content;
  f.send({kind: 'request-stage', stage: 'research', jobId: 'original'});
  f.send({kind: 'complete-stage', jobId: 'original', artifactId: 'base', payloadRef: 'synthetic://base', contentHash: sha(JSON.stringify(f.base, null, 2)), technicalReceipts: {sourceCatalogue: {records: [source]}}}, author);
  return f;
}
function feedback(f, id = 'feedback-1', extra = {}) { f.send({kind: 'submit-feedback', artifactId: f.p.activeByStage.research, feedbackId: id, instructions: 'Make the finding concise.', themes: [], materials: [], ...extra}); }
function revisionInput(f) { return {...revisionPlan(f.p, f.p.activeByStage.research), baseContent: f.base, materials: []}; }
function enqueue(f, input = revisionInput(f), id = 'revision') {
  f.send({kind: 'request-stage', stage: 'research', jobId: id, binding,
    task: {id: `task-${id}`, parentId: null, owner: 'research-owner', brief: f.p.taskCards.find(item => item.id === f.p.activeTaskCardId).brief, sourceRecords: [source], visualCatalogue: [], revisionInputArtifacts: [], revisionInput: input}});
  return input;
}
function productionReceipt(job, attemptId, value) {
  const request = buildStageRequest({stage: job.stage, brief: job.task.brief,
    inputArtifacts: job.task.revisionInputArtifacts ?? [], sourceRecords: job.task.sourceRecords ?? [],
    visualCatalogue: job.task.visualCatalogue ?? [], revisionInput: job.task.revisionInput});
  const images = job.task.revisionInput.materials;
  return {attemptId, taskId: job.task.id, ...job.binding, runId: attemptId, requestedModel: job.binding.model,
    threadId: `thread-${job.id}`, exitCode: 0, responseText: JSON.stringify(value), ...(images.length ? {images} : {}),
    inputPacketHash: sha(JSON.stringify({runId: attemptId, model: job.binding.model, prompt: request.prompt,
      outputSchema: request.outputSchema, ...(images.length ? {images} : {})}))};
}
function complete(f, id = 'revision', summary = 'Concise finding') {
  const job = f.p.jobs.find(item => item.id === id), input = job.task.revisionInput, attemptId = `${id}-attempt`;
  if (job.status === 'queued') f.send({kind: 'start-job', jobId: id, attemptId}, reviser);
  const responses = [{feedbackId: 'feedback-1', action: 'applied', explanation: 'Condensed the finding.', outputLocations: [{location: '/summary', quote: summary}]}];
  const value = {...raw(summary), feedbackResponses: responses};
  const output = validateStageOutput('research', value, {sourceRecords: [source], revisionInput: input});
  f.send({kind: 'complete-stage', jobId: id, attemptId, artifactId: `artifact-${id}`, payloadRef: `synthetic://${id}`, contentHash: sha(JSON.stringify(output.content, null, 2)),
    claims: output.claims, technicalReceipts: {sourceCatalogue: {records: [source]}, visualCatalogue: []}, feedbackResponses: responses,
    executionReceipt: productionReceipt(job, attemptId, value)}, reviser);
  return output;
}
function setupReview(f, output, id = 'review') {
  const a = f.p.artifacts.at(-1), producer = f.p.jobs.find(item => item.outputVersionIds?.includes(a.id));
  const input = {artifactId: a.id, contentHash: a.contentHash, content: output.content, revisionInput: producer.task.revisionInput, responses: a.feedbackResponses};
  const reviewBinding = {...binding, role: 'feedback-reviewer'};
  f.send({kind: 'request-feedback-review', artifactId: a.id, jobId: id, binding: reviewBinding, task: {id: `task-${id}`, parentId: null, owner: 'independent', feedbackReviewInput: input}});
  return {a, input, binding: reviewBinding};
}
function finishReview(f, setup, {id = 'review', status = 'addressed', category = 'creative_preference', context = reviewer} = {}) {
  const attemptId = `${id}-attempt`;
  f.send({kind: 'start-job', jobId: id, attemptId}, context);
  const report = {protocolVersion: 'human-feedback-v1', artifactId: setup.a.id, contentHash: setup.a.contentHash,
    feedbackHash: setup.input.revisionInput.feedbackHash, findings: [{feedbackId: 'feedback-1', status, category, reason: 'Independent comparison of complete texts.', refs: [{location: '/summary', quote: setup.input.content.summary}]}], limitations: ['Synthetic invocation fixture only.']};
  const request = buildFeedbackReviewRequest(setup.input);
  const receipt = {attemptId, taskId: `task-${id}`, ...setup.binding, runId: attemptId, requestedModel: setup.binding.model,
    threadId: `thread-${id}`, exitCode: 0, responseText: JSON.stringify(report),
    inputPacketHash: sha(JSON.stringify({runId: attemptId, model: setup.binding.model, prompt: request.prompt, outputSchema: request.outputSchema}))};
  f.send({kind: 'complete-feedback-review', jobId: id, attemptId, reportId: `report-${id}`, rawReport: report, payloadRef: `synthetic://${id}`,
    contentHash: sha(JSON.stringify(validateFeedbackReviewOutput(report, setup.input), null, 2)), executionReceipt: receipt}, context);
}
test('human feedback retains head and immutable original while blocking release and ordinary regeneration', () => {
  const f = fixture(), before = f.p;
  feedback(f);
  assert.equal(f.p.activeByStage.research, 'base');
  assert.equal(before.humanFeedback.length, 0);
  assert.equal(f.p.humanFeedback[0].artifactHash, f.p.artifacts[0].contentHash);
  assert.equal(releaseReadiness(f.p, 'base').blockedReasons[0], 'FEEDBACK_REVISION_REQUIRED');
  assert.throws(() => f.send({kind: 'request-stage', stage: 'research', jobId: 'bypass'}), {code: 'FEEDBACK_REVISION_REQUIRED'});
  assert.throws(() => f.send({kind: 'submit-feedback', artifactId: 'base', feedbackId: 'agent', instructions: 'x'}, reviser), {code: 'HUMAN_REQUIRED'});
});
test('feedback rejects evidence promotion, empty payloads and unregistered materials', () => {
  const f = fixture();
  for (const extra of [{instructions: '', themes: [], materials: []}, {verification: 'verified'}, {materials: [{imageId: 'absent', intendedUse: 'reference', borrowingNotes: 'composition'}]}])
    assert.throws(() => feedback(f, 'invalid', extra), {code: 'INVALID_HUMAN_FEEDBACK'});
  assert.equal(f.p.humanFeedback.length, 0);
});
test('revision freezes every feedback item and rejects parent substitution and altered feedback subsets', () => {
  const f = fixture(); feedback(f); feedback(f, 'feedback-2');
  const input = revisionInput(f);
  assert.equal(input.feedback.length, 2);
  assert.throws(() => enqueue(f, {...input, baseContent: {...input.baseContent, summary: 'Changed'}}), {code: 'INVALID_REVISION_INPUT'});
  assert.throws(() => enqueue(f, {...input, feedback: input.feedback.slice(1), feedbackHash: sha(JSON.stringify(input.feedback.slice(1)))}), {code: 'STALE_FEEDBACK'});
});
test('new feedback blocks queued revision and retry before provider dispatch', () => {
  for (const retry of [false, true]) {
    const f = fixture(); feedback(f); enqueue(f);
    if (retry) {
      f.send({kind: 'start-job', jobId: 'revision', attemptId: 'first'}, reviser);
      f.send({kind: 'finish-job-error', jobId: 'revision', attemptId: 'first', status: 'failed', error: {code: 'PRE_DISPATCH', message: 'Synthetic failure'}}, reviser);
    }
    feedback(f, 'feedback-2');
    assert.throws(() => f.send({kind: retry ? 'retry-job' : 'start-job', jobId: 'revision', attemptId: 'second'}, reviser), {code: 'STALE_FEEDBACK'});
  }
});
test('revision replaces retained head without including revisionOf in freshness ancestry', () => {
  const f = fixture(); feedback(f); enqueue(f); complete(f);
  const a = f.p.artifacts.at(-1);
  assert.equal(f.p.activeByStage.research, a.id);
  assert.deepEqual(a.inputVersionIds, ['p:scope:1']);
  assert.equal(a.revision.revisionOf.artifactId, 'base');
  assert.equal(Object.hasOwn(a.revision, 'baseContent'), false);
  assert.equal(a.feedbackResponses[0].action, 'applied');
  assert.equal(releaseReadiness(f.p, a.id).blockedReasons[0], 'FEEDBACK_REVIEW_REQUIRED');
});
test('new feedback during generation preserves stale successful output without adopting it', () => {
  const f = fixture(); feedback(f); enqueue(f);
  f.send({kind: 'start-job', jobId: 'revision', attemptId: 'revision-attempt'}, reviser);
  feedback(f, 'feedback-2'); complete(f);
  assert.equal(f.p.jobs.at(-1).status, 'succeeded_stale');
  assert.equal(f.p.activeByStage.research, 'base');
  assert.equal(f.p.artifacts.at(-1).revision.feedback.length, 1);
});
test('feedback revokes an already released input and downstream in-flight completion remains historical', () => {
  const f = fixture();
  for (const [side, context] of [['producer', author], ['consumer', ctx('strategy-owner')]]) f.send({kind: 'acknowledge-handoff', artifactId: 'base', side, nextStage: 'strategy'}, context);
  f.send({kind: 'release-stage', artifactId: 'base'});
  f.send({kind: 'request-stage', stage: 'strategy', jobId: 'downstream'});
  feedback(f);
  f.send({kind: 'complete-stage', jobId: 'downstream', artifactId: 'old-strategy', payloadRef: 'synthetic://old', contentHash: 'synthetic'}, ctx('strategy-author'));
  assert.equal(f.p.jobs.at(-1).status, 'succeeded_stale');
  assert.equal(f.p.activeByStage.strategy, undefined);
  assert.throws(() => f.send({kind: 'request-stage', stage: 'strategy', jobId: 'blocked-new'}), {code: 'DEPENDENCY_BLOCKED'});
});
test('original draft author cannot review revision and base revision lineage remains excluded from fresh inputs', () => {
  const f = fixture(); feedback(f); enqueue(f); const output = complete(f), setup = setupReview(f, output);
  assert.throws(() => f.send({kind: 'start-job', jobId: 'review', attemptId: 'bad'}, author), {code: 'SELF_REVIEW'});
  assert.throws(() => f.send({kind: 'start-job', jobId: 'review', attemptId: 'bad'}, {...reviewer, ancestorActorIds: [author.actorId]}), {code: 'SELF_REVIEW'});
  assert.throws(() => f.send({kind: 'request-feedback-review', artifactId: setup.a.id, jobId: 'mutated', binding: setup.binding,
    task: {id: 'mutated', parentId: null, owner: 'reviewer', feedbackReviewInput: {...setup.input, responses: []}}}), {code: 'INVALID_FEEDBACK_REVIEW'});
});
test('independent feedback report is retained but does not replace original factual checks', () => {
  const f = fixture(); feedback(f); enqueue(f); const setup = setupReview(f, complete(f));
  finishReview(f, setup);
  assert.equal(f.p.feedbackReviews.length, 1);
  assert.equal(f.p.feedbackReviews[0].hasBlockingFindings, false);
  assert.equal(releaseReadiness(f.p, setup.a.id).blockedReasons[0], 'HARD_BLOCKER');
  assert.equal(f.p.releases.length, 0);
});
test('creative dissent requires human adoption after the report and factual risk cannot be waived', () => {
  for (const category of ['creative_preference', 'factual_risk', 'missing_material']) {
    const f = fixture(); feedback(f); enqueue(f); const setup = setupReview(f, complete(f));
    f.send({kind: 'adopt-creative', artifactId: setup.a.id, reason: 'Premature adoption'});
    finishReview(f, setup, {status: 'unresolved', category});
    assert.equal(releaseReadiness(f.p, setup.a.id).blockedReasons[0], category === 'creative_preference' ? 'FEEDBACK_UNRESOLVED' : 'HARD_BLOCKER');
    f.send({kind: 'adopt-creative', artifactId: setup.a.id, reason: 'Current human preference despite retained AI dissent'});
    assert.equal(releaseReadiness(f.p, setup.a.id).blockedReasons[0], 'HARD_BLOCKER');
    assert.equal(f.p.feedbackReviews[0].findings[0].status, 'unresolved');
  }
});
test('new feedback prevents completed feedback reports from legitimizing an older revision', () => {
  const f = fixture(); feedback(f); enqueue(f); const setup = setupReview(f, complete(f)); finishReview(f, setup);
  feedback(f, 'feedback-2');
  assert.equal(releaseReadiness(f.p, setup.a.id).blockedReasons[0], 'FEEDBACK_REVISION_REQUIRED');
  const plan = revisionPlan(f.p, setup.a.id);
  assert.equal(plan.protocolVersion, 'typed-revision-v2');
  assert.equal(plan.sources.filter(source=>source.kind==='human').length,2);
  assert.equal(plan.sources.filter(source=>source.kind==='feedback_review').length,1);
  assert.equal(plan.revisionOf.artifactId, setup.a.id);
});
test('feedback material hashes are derived from assets and four-image bound spans all feedback', () => {
  const f = fixture();
  for (let i = 1; i <= 5; i++) f.send({kind: 'register-image', asset: {id: `image-${i}`, projectId: 'p', sha256: String(i).repeat(64), mediaType: 'image/png', byteLength: 100,
    width: 10, height: 10, uploadedAt: '2026-10-25T00:00:00Z', provenance: {representation: 'supplied_image'}}}, ctx('ingestion'));
  const material = i => ({imageId: `image-${i}`, intendedUse: 'Human reference', borrowingNotes: 'Use broad composition only.'});
  feedback(f, 'feedback-1', {instructions: '', materials: [material(1), material(2)]});
  feedback(f, 'feedback-2', {materials: [material(2), material(3), material(4)]});
  assert.equal(f.p.humanFeedback[0].materials[0].sha256, '1'.repeat(64));
  assert.throws(() => feedback(f, 'feedback-3', {materials: [material(5)]}), {code: 'INVALID_HUMAN_FEEDBACK'});
  assert.throws(() => feedback(f, 'forged-sha', {materials: [{...material(1), sha256: 'f'.repeat(64)}]}), {code: 'INVALID_HUMAN_FEEDBACK'});
  const plan = revisionPlan(f.p, 'base');
  const manifest = [1, 2, 3, 4].map(i => ({imageId: `image-${i}`, sha256: String(i).repeat(64), mediaType: 'image/png', byteLength: 100}));
  enqueue(f, {...plan, baseContent: f.base, materials: manifest});
  assert.equal(f.p.jobs.at(-1).task.revisionInput.materials.length, 4);
  assert.throws(() => enqueue(f, {...plan, baseContent: f.base, materials: [...manifest].reverse()}, 'wrong-order'), {code: 'INVALID_HUMAN_FEEDBACK'});
});
test('policy and scope changes prevent a frozen revision from starting', () => {
  for (const change of [{kind: 'set-policy', mode: 'assisted', humanGates: ['strategy']}, {kind: 'revise-task-card', taskCardId: 'new-scope', brief: 'New scope'}]) {
    const f = fixture(); feedback(f); enqueue(f); f.send(change);
    if (change.kind === 'revise-task-card') f.send({kind: 'confirm-task-card', taskCardId: 'new-scope'});
    assert.throws(() => f.send({kind: 'start-job', jobId: 'revision', attemptId: 'stale'}, reviser), error => ['STALE_JOB', 'STALE_FEEDBACK'].includes(error.code));
  }
});
test('recovery validates frozen feedback responses but retains revoked successful output as history', () => {
  const f = fixture(); feedback(f); enqueue(f);
  f.send({kind: 'start-job', jobId: 'revision', attemptId: 'revision-attempt'}, reviser);
  const input = f.p.jobs.at(-1).task.revisionInput;
  const responses = [{feedbackId: 'feedback-1', action: 'applied', explanation: 'Condensed.', outputLocations: [{location: '/summary', quote: 'Concise finding'}]}];
  const value = {...raw('Concise finding'), feedbackResponses: responses};
  const output = validateStageOutput('research', value, {sourceRecords: [source], revisionInput: input});
  const receipt = productionReceipt(f.p.jobs.at(-1), 'revision-attempt', value);
  f.send({kind: 'finish-job-error', jobId: 'revision', attemptId: 'revision-attempt', status: 'awaiting_reconciliation', error: {code: 'INVALID_STAGE_OUTPUT', message: 'Synthetic schema rejection'}, receipt}, reviser);
  feedback(f, 'feedback-2');
  f.send({kind: 'reconcile-stage', jobId: 'revision', attemptId: 'revision-attempt', artifactId: 'recovered', reconciliationId: 'recovery', payloadRef: 'synthetic://recovered',
    contentHash: sha(JSON.stringify(output.content, null, 2)), receiptHash: sha(JSON.stringify(receipt)), reason: 'Saved response validated locally.', validatorVersion: 'synthetic'}, ctx('reconciler'));
  assert.equal(f.p.jobs.at(-1).status, 'succeeded_stale');
  assert.equal(f.p.activeByStage.research, 'base');
  assert.deepEqual(f.p.artifacts.at(-1).feedbackResponses, responses);
});
function rejectTamperedProduction(tamper, recover) {
  const f = fixture();
  f.send({kind: 'register-image', asset: {id: 'image-1', projectId: 'p', sha256: '1'.repeat(64), mediaType: 'image/png', byteLength: 100,
    width: 10, height: 10, uploadedAt: '2026-10-25T00:00:00Z', provenance: {representation: 'supplied_image'}}}, ctx('ingestion'));
  feedback(f, 'feedback-1', {materials: [{imageId: 'image-1', intendedUse: 'Human reference', borrowingNotes: 'Use broad composition only.'}]});
  const materials = [{imageId: 'image-1', sha256: '1'.repeat(64), mediaType: 'image/png', byteLength: 100}];
  const input = {...revisionPlan(f.p, 'base'), baseContent: f.base, materials};
  enqueue(f, input);
  f.send({kind: 'start-job', jobId: 'revision', attemptId: 'revision-attempt'}, reviser);
  const responses = [{feedbackId: 'feedback-1', action: 'applied', explanation: 'Condensed.', outputLocations: [{location: '/summary', quote: 'Concise finding'}]}];
  const value = {...raw('Concise finding'), feedbackResponses: responses};
  const output = validateStageOutput('research', value, {sourceRecords: [source], revisionInput: input});
  const receipt = productionReceipt(f.p.jobs.at(-1), 'revision-attempt', value);
  tamper(receipt);
  if (recover) {
    f.send({kind: 'finish-job-error', jobId: 'revision', attemptId: 'revision-attempt', status: 'awaiting_reconciliation',
      error: {code: 'INVALID_STAGE_OUTPUT', message: 'Synthetic schema rejection'}, receipt}, reviser);
    assert.throws(() => f.send({kind: 'reconcile-stage', jobId: 'revision', attemptId: 'revision-attempt', artifactId: 'recovered', reconciliationId: 'recovery',
      payloadRef: 'synthetic://recovered', contentHash: sha(JSON.stringify(output.content, null, 2)), receiptHash: sha(JSON.stringify(receipt)),
      reason: 'Saved response validation.', validatorVersion: 'synthetic'}, ctx('reconciler')), {code: 'INVALID_EXECUTION_RECEIPT'});
  } else {
    assert.throws(() => f.send({kind: 'complete-stage', jobId: 'revision', attemptId: 'revision-attempt', artifactId: 'artifact-revision', payloadRef: 'synthetic://revision',
      contentHash: sha(JSON.stringify(output.content, null, 2)), claims: output.claims, feedbackResponses: responses,
      technicalReceipts: {sourceCatalogue: {records: [source]}, visualCatalogue: []}, executionReceipt: receipt}, reviser), {code: 'INVALID_EXECUTION_RECEIPT'});
  }
  assert.equal(f.p.artifacts.length, 1);
  assert.equal(f.p.activeByStage.research, 'base');
}
test('revision production rejects omitted material images on completion and recovery', () => {
  for (const recover of [false, true]) rejectTamperedProduction(receipt => { delete receipt.images; }, recover);
});
test('revision production rejects a different packet hash on completion and recovery', () => {
  for (const recover of [false, true]) rejectTamperedProduction(receipt => { receipt.inputPacketHash = sha('different production packet'); }, recover);
});
