import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyCommand, createProject, projectView} from './project.mjs';
import {buildResearchReadinessRequest} from './research-readiness.mjs';
import {buildEvidenceReviewRequest, evidenceClaimManifest} from './evidence-review.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const ctx = name => ({actorId: name, runId: `${name}-run`, contextId: `${name}-context`, actorType: name === 'human' ? 'human' : 'agent'});
function fixture({metadata = false, verification = true, handoff = true, humanGates = []} = {}) {
  let p = createProject({id: 'p', name: 'Synthetic readiness domain test', brief: 'Research the supplied blue package within its stated limits.', mode: 'auto', humanGates}, ctx('human'));
  let serial = 0;
  const send = (command, context = ctx('human')) => (p = applyCommand(p, {commandId: `command-${++serial}`, expectedRevision: p.revision, ...command}, context));
  send({kind: 'confirm-task-card', taskCardId: p.activeTaskCardId});
  const source = {id: 'source', url: 'https://example.test/source', text: 'The supplied package is blue.', verification: 'captured'};
  const claims = [{kind: 'fact', text: source.text, verification: 'pending', evidenceRefs: ['source']}];
  const content = {stage: 'research', outputKind: 'research_findings', status: 'complete', title: 'Research', summary: 'Bounded synthetic findings', sections: [{title: 'Findings', body: source.text, evidenceIds: ['source']}], claims};
  const contentText = JSON.stringify(content), contentHash = hash(contentText);
  const binding = {providerId: 'synthetic', model: 'synthetic-model', role: 'research'};
  send({kind: 'request-stage', stage: 'research', jobId: 'author-job', ...(metadata ? {} : {binding, task: {id: 'author-task', parentId: null, owner: 'author'}})});
  if (!metadata) send({kind: 'start-job', jobId: 'author-job', attemptId: 'author-attempt'}, ctx('author'));
  send({kind: 'complete-stage', jobId: 'author-job', artifactId: 'research', payloadRef: 'synthetic://research', contentHash, claims: metadata ? [] : claims,
    technicalReceipts: {sourceCatalogue: {records: [source]}}, ...(metadata ? {} : {attemptId: 'author-attempt', executionReceipt: {...binding, taskId: 'author-task', attemptId: 'author-attempt', threadId: 'author-thread'}})}, ctx('author'));
  if (handoff) {
    send({kind: 'acknowledge-handoff', artifactId: 'research', side: 'producer', nextStage: 'strategy'}, ctx('author'));
    send({kind: 'acknowledge-handoff', artifactId: 'research', side: 'consumer', nextStage: 'strategy'}, ctx('consumer'));
  }
  const input = {artifactId: 'research', contentHash, contentText, content, taskCard: p.taskCards[0], taskCardConfirmed: true, sourceRecords: [source]};
  const enums = schema => Object.fromEntries(Object.entries(schema.properties).filter(([, value]) => value.enum).map(([key, value]) => [key, value.enum[0]]));
  if (verification && !metadata) {
    const verificationInput = {...input}; delete verificationInput.contentText;
    send({kind: 'request-verification', jobId: 'verify', artifactId: 'research', binding: {...binding, role: 'verification'}, task: {id: 'verify-task', owner: 'verify', parentId: null, verificationInput}});
    send({kind: 'start-job', jobId: 'verify', attemptId: 'verify-attempt'}, ctx('verify'));
    const rawReport = {...enums(buildEvidenceReviewRequest(verificationInput).outputSchema), results: evidenceClaimManifest(content).map(item => ({claimKey: item.claimKey, outcome: 'supported_excerpt', rationale: 'Synthetic excerpt matches.', citations: [{sourceId: source.id, textHash: hash(source.text), quote: source.text}], requirementRefs: [], limitations: []})), wholeTextScan: {status: 'complete', creativeClaimKeys: [], omissions: [], mismatchedCreative: []}, limitations: []};
    send({kind: 'complete-verification', jobId: 'verify', attemptId: 'verify-attempt', reportId: 'verify-report', rawReport, payloadRef: 'synthetic://verification', contentHash: hash(JSON.stringify(rawReport)), executionReceipt: {...binding, role: 'verification', taskId: 'verify-task', attemptId: 'verify-attempt', threadId: 'verify-thread', inputPacketHash: hash('verification packet'), exitCode: 0}}, ctx('verify'));
  }
  function request(id = 'ready', value = input) {
    send({kind: 'request-readiness', jobId: id, artifactId: 'research', binding: {...binding, role: 'readiness'}, task: {id: `${id}-task`, owner: id, parentId: null, readinessInput: value}});
  }
  function report(verdict = 'ready') {
    const request = buildResearchReadinessRequest(input);
    return {...enums(request.outputSchema), verdict,
      coverage: request.packet.expectedCoverage.map(item => ({questionId: item.id, status: verdict === 'ready' ? 'ready' : 'gap', rationale: 'Synthetic reviewer judgment.', refs: [{location: '/content/sections/0/body', quote: source.text}], downstreamImpact: 'Use only the bounded supplied finding.', researchNeeded: verdict === 'ready' ? 'none' : 'Research missing task branches.'})),
      sourceAssessments: [{sourceId: source.id, textHash: hash(source.text), use: 'usable_with_limits', relevance: 'Supplied package.', provenance: 'Captured excerpt.', limitations: ['Not independently authenticated.'], refs: [{location: '/sourceRecords/0/text', quote: source.text}]}],
      findings: [], downstreamUse: {allowed: verdict === 'ready' ? ['Discuss the supplied package.'] : [], prohibited: ['Do not infer audience preferences.']}, limitations: ['Synthetic fixture does not prove real research sufficiency.']};
  }
  function receipt(id = 'ready', attemptId = `${id}-attempt`, overrides = {}) {
    return {...binding, role: 'readiness', taskId: `${id}-task`, attemptId, threadId: `${attemptId}-thread`, inputPacketHash: hash(`${id}-packet`), exitCode: 0, ...overrides};
  }
  function complete(id = 'ready', rawReport = report(), overrides = {}, attemptId = `${id}-attempt`, context = ctx(id)) {
    return send({kind: 'complete-readiness', jobId: id, attemptId, reportId: `${id}-report`, rawReport, payloadRef: `synthetic://${id}`, contentHash: hash(JSON.stringify(rawReport)), executionReceipt: receipt(id, attemptId, overrides)}, context);
  }
  return {get p() {return p;}, send, input, request, report, receipt, complete,
    start(id = 'ready', context = ctx(id)) { return send({kind: 'start-job', jobId: id, attemptId: `${id}-attempt`}, context); },
    release() { return send({kind: 'release-stage', artifactId: 'research'}); }};
}

test('provider research still requires owner handoff after excerpt verification and readiness', () => {
  const f = fixture();
  assert.throws(() => f.release(), {code: 'RESEARCH_READINESS_REQUIRED'});
  f.request(); f.start(); f.complete();
  assert.equal(f.p.readinessReports[0].verdict, 'ready');
  assert.throws(() => f.release(), {code: 'HANDOFF_REQUIRED'});
  assert.throws(() => f.send({kind: 'request-stage', stage: 'strategy', jobId: 'strategy'}), {code: 'DEPENDENCY_BLOCKED'});
  const unsupported = fixture({verification: false});
  unsupported.request(); unsupported.start(); unsupported.complete();
  assert.throws(() => unsupported.release(), {code: 'HARD_BLOCKER'});
});

test('negative readiness cannot be replaced with a later ready report or human adoption', () => {
  const f = fixture(); f.request(); f.start(); f.complete('ready', f.report('needs_research'));
  f.request('second'); f.start('second'); f.complete('second');
  f.send({kind: 'adopt-creative', artifactId: 'research', reason: 'Choose creative route'});
  assert.equal(f.p.readinessReports.length, 2);
  assert.throws(() => f.release(), {code: 'RESEARCH_READINESS_BLOCKED'});
  assert.throws(() => f.send({kind: 'request-stage', stage: 'strategy', jobId: 'strategy'}), {code: 'DEPENDENCY_BLOCKED'});
});

test('readiness binds original bytes, full card, claims and catalogue', () => {
  for (const mutate of [input => input.contentText += ' ', input => input.content.sections[0].body = 'changed', input => input.taskCard.createdBy = 'other', input => input.content.claims[0].text = 'changed', input => input.sourceRecords[0].verification = 'verified']) {
    const f = fixture(); const input = structuredClone(f.input); mutate(input);
    assert.throws(() => f.request('ready', input));
    assert.equal(f.p.jobs.some(job => job.purpose === 'readiness'), false);
  }
});

test('readiness rejects creator identity and reused threads across author, verification and failed attempts', () => {
  const f = fixture(); f.request();
  assert.throws(() => f.start('ready', ctx('author')), {code: 'SELF_REVIEW'});
  f.start();
  for (const threadId of ['author-thread', 'verify-thread']) assert.throws(() => f.complete('ready', f.report(), {threadId}), {code: 'REVIEW_THREAD_REUSED'});
  f.send({kind: 'finish-job-error', jobId: 'ready', attemptId: 'ready-attempt', status: 'failed', error: {code: 'INVALID_OUTPUT', message: 'Synthetic failure'}, receipt: f.receipt()}, ctx('ready'));
  f.send({kind: 'retry-job', jobId: 'ready', attemptId: 'retry'}, ctx('retry'));
  assert.throws(() => f.complete('ready', f.report(), {threadId: 'ready-attempt-thread'}, 'retry', ctx('retry')), {code: 'REVIEW_THREAD_REUSED'});
  f.complete('ready', f.report(), {}, 'retry', ctx('retry'));
  assert.throws(() => f.release(), {code: 'HANDOFF_REQUIRED'});
});

test('readiness job cannot complete as production and does not supersede production status', () => {
  const f = fixture(); f.request(); f.start();
  assert.equal(projectView(f.p).stages[0].latestJobId, 'author-job');
  assert.throws(() => f.send({kind: 'complete-stage', jobId: 'ready'}), {code: 'INVALID_JOB'});
  f.complete(); assert.equal(f.p.activeByStage.research, 'research');
  assert.equal(projectView(f.p).stages[0].status, 'awaiting_release');
});

test('scope and artifact revisions invalidate queued and late readiness', () => {
  for (const phase of ['queued', 'running', 'failed']) {
    const f = fixture(); f.request();
    if (phase !== 'queued') f.start();
    if (phase === 'failed') f.send({kind: 'finish-job-error', jobId: 'ready', attemptId: 'ready-attempt', status: 'failed', error: {code: 'FAILURE', message: 'Synthetic failure'}}, ctx('ready'));
    f.send({kind: 'revise-task-card', taskCardId: 'new-scope', brief: 'New task'});
    assert.throws(phase === 'queued' ? () => f.start() : phase === 'running' ? () => f.complete() : () => f.send({kind: 'retry-job', jobId: 'ready', attemptId: 'retry'}, ctx('retry')), {code: 'STALE_ARTIFACT'});
  }
  const f = fixture(); f.request(); f.start();
  f.send({kind: 'request-stage', stage: 'research', jobId: 'new-production'});
  f.send({kind: 'complete-stage', jobId: 'new-production', artifactId: 'new-research', payloadRef: 'synthetic://new', contentHash: hash('new')}, ctx('new-author'));
  assert.throws(() => f.complete(), {code: 'STALE_ARTIFACT'});
  assert.equal(f.p.activeByStage.research, 'new-research');
});

test('readiness preserves human and handoff gates and leaves metadata-only imports unchanged', () => {
  const noHandoff = fixture({handoff: false}); noHandoff.request(); noHandoff.start(); noHandoff.complete();
  assert.throws(() => noHandoff.release(), {code: 'HANDOFF_REQUIRED'});
  const human = fixture({humanGates: ['research']}); human.request(); human.start(); human.complete();
  assert.throws(() => human.release(), {code: 'HUMAN_GATE'});
  human.send({kind: 'adopt-creative', artifactId: 'research', reason: 'Adopt route'}); assert.throws(() => human.release(), {code: 'HANDOFF_REQUIRED'});
  const metadata = fixture({metadata: true}); metadata.release();
  assert.equal(projectView(metadata.p).stages[0].status, 'released');
});

test('malformed reports append nothing and command replay stays idempotent', () => {
  const f = fixture(); f.request(); f.start();
  assert.throws(() => f.complete('ready', {...f.report(), coverage: []}), {code: 'INVALID_RESEARCH_READINESS'});
  assert.equal(f.p.readinessReports.length, 0);
  const rawReport = f.report(), command = {kind: 'complete-readiness', commandId: 'replay', expectedRevision: f.p.revision, jobId: 'ready', attemptId: 'ready-attempt', reportId: 'ready-report', rawReport, payloadRef: 'synthetic://ready', contentHash: hash(JSON.stringify(rawReport)), executionReceipt: f.receipt()};
  const result = applyCommand(f.p, command, ctx('ready'));
  assert.equal(applyCommand(result, command, ctx('ready')), result);
  const legacy = structuredClone(f.p); delete legacy.readinessReports;
  assert.equal(applyCommand(legacy, command, ctx('ready')).readinessReports.length, 1);
});
