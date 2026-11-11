import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyCommand, createProject, projectView} from './project.mjs';
import {buildResearchHandoffRequest} from './research-handoff.mjs';
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

function handoffFixture() {
  const f = fixture(); f.request(); f.start(); f.complete();
  const binding = side => ({providerId: 'synthetic', model: 'synthetic-model', role: side === 'producer' ? 'research' : 'strategy-lead'});
  function input(side) {
    return {...f.input, side, targetStage: 'strategy', ownerBinding: binding(side),
      verificationReports: f.p.verifications.map(item => item.rawReport), readinessReports: f.p.readinessReports.map(item => item.rawReport),
      producerReport: side === 'consumer' ? f.p.handoffReports.find(item => item.side === 'producer')?.rawReport : null};
  }
  function request(side = 'producer', id = side, value = input(side), assigned = binding(side)) {
    return f.send({kind: 'request-handoff', artifactId: 'research', jobId: id, side, binding: assigned,
      task: {id: `${id}-task`, parentId: null, owner: side, handoffInput: value}});
  }
  function raw(id, decision = 'accept') {
    const packet = buildResearchHandoffRequest(f.p.jobs.find(item => item.id === id).task.handoffInput).packet;
    return {protocolVersion: packet.protocolVersion, packetHash: packet.packetHash, artifactId: packet.artifactId, contentHash: packet.contentHash,
      side: packet.side, targetStage: packet.targetStage, ownerBinding: packet.ownerBinding, decision,
      understoodFindings: [{finding: 'Supplied package is blue.', refs: [{location: '/content/sections/0/body', quote: 'blue'}]}],
      permittedUses: ['Explore a bounded visual direction.'], prohibitedInferences: ['No consumer preference claims.'],
      unresolvedIssues: decision === 'blocked' ? [{blocking: true, reason: 'Additional task evidence needed.', refs: [{location: '/taskCard/brief', quote: 'Research'}]}] : [],
      limitations: ['Synthetic owner judgment; not consumer evidence.']};
  }
  function complete(id = 'producer', decision = 'accept', receipt = {}, context = ctx(id)) {
    const job = f.p.jobs.find(item => item.id === id), rawReport = raw(id, decision);
    return f.send({kind: 'complete-handoff', jobId: id, attemptId: job.attemptId, reportId: `${id}-report`, rawReport,
      payloadRef: `synthetic://${id}`, contentHash: hash(JSON.stringify(rawReport)), executionReceipt: {...job.binding, taskId: job.task.id,
        attemptId: job.attemptId, threadId: `${id}-thread`, inputPacketHash: hash(`${id}-packet`), exitCode: 0, ...receipt}}, context);
  }
  function accept(side) { request(side); f.start(side); complete(side); }
  return {...f, get p() {return f.p;}, requestHandoff: request, handoffInput: input, completeHandoff: complete, accept, raw};
}

test('legacy acknowledgments cannot release provider research; actual owners unlock explicit release and strategy', () => {
  const f = handoffFixture();
  assert.throws(() => f.release(), {code: 'HANDOFF_REQUIRED'});
  f.accept('producer'); assert.throws(() => f.release(), {code: 'HANDOFF_REQUIRED'});
  f.accept('consumer'); assert.equal(f.p.releases.length, 0);
  assert.equal(projectView(f.p).stages[0].latestJobId, 'author-job');
  f.release(); f.send({kind: 'request-stage', stage: 'strategy', jobId: 'strategy'});
  assert.deepEqual(f.p.jobs.at(-1).inputVersionIds, ['research']);
  assert.equal(f.p.handoffReports.length, 2);
  assert.notEqual(f.p.handoffReports[0].context.actorId, f.p.artifacts[0].author.actorId);
});

test('owner assignments, current reports, producer acceptance and original research bytes are mandatory', () => {
  const f = handoffFixture();
  assert.throws(() => f.requestHandoff('consumer'));
  for (const mutate of [input => input.contentText += ' ', input => input.taskCard.createdBy = 'spoof', input => input.verificationReports = [], input => input.readinessReports = []]) {
    const input = structuredClone(f.handoffInput('producer')); mutate(input);
    assert.throws(() => f.requestHandoff('producer', 'producer', input));
  }
  const spoof = {...f.handoffInput('producer').ownerBinding, role: 'impostor'};
  assert.throws(() => f.requestHandoff('producer', 'producer', {...f.handoffInput('producer'), ownerBinding: spoof}, spoof), {code: 'WRONG_OWNER'});
  f.accept('producer');
  const badConsumer = {...spoof, role: 'other-owner'};
  assert.throws(() => f.requestHandoff('consumer', 'consumer', {...f.handoffInput('consumer'), ownerBinding: badConsumer}, badConsumer), {code: 'WRONG_OWNER'});
});

test('fresh owner context and provider thread reject author, reviewer, earlier owner and retry reuse', () => {
  const f = handoffFixture(); f.requestHandoff();
  for (const name of ['author', 'verify', 'ready']) assert.throws(() => f.start('producer', ctx(name)), {code: 'HANDOFF_CONTEXT_REUSED'});
  f.start('producer');
  for (const threadId of ['author-thread', 'verify-thread', 'ready-attempt-thread']) assert.throws(() => f.completeHandoff('producer', 'accept', {threadId}), {code: 'REVIEW_THREAD_REUSED'});
  assert.throws(() => f.completeHandoff('producer', 'accept', {role: 'impostor'}), {code: 'INVALID_EXECUTION_RECEIPT'});
  f.completeHandoff(); f.requestHandoff('consumer');
  assert.throws(() => f.start('consumer', ctx('producer')), {code: 'HANDOFF_CONTEXT_REUSED'});
  f.start('consumer');
  assert.throws(() => f.completeHandoff('consumer', 'accept', {threadId: 'producer-thread'}), {code: 'REVIEW_THREAD_REUSED'});
});

test('later accepted owners cannot override a blocked handoff on the same artifact', () => {
  const f = handoffFixture(); f.requestHandoff(); f.start('producer'); f.completeHandoff('producer', 'blocked');
  f.requestHandoff('producer', 'replacement'); f.start('replacement'); f.completeHandoff('replacement');
  assert.throws(() => f.release(), {code: 'HANDOFF_BLOCKED'});
  assert.equal(f.p.handoffReports.length, 2);
});

test('scope changes and new review evidence invalidate pending and already released handoffs', () => {
  const f = handoffFixture(); f.accept('producer'); f.accept('consumer'); f.release();
  f.request('later'); f.start('later'); f.complete('later');
  assert.equal(projectView(f.p).stages[0].status, 'awaiting_release');
  assert.throws(() => f.send({kind: 'request-stage', stage: 'strategy', jobId: 'strategy'}), {code: 'DEPENDENCY_BLOCKED'});
  const pending = handoffFixture(); pending.requestHandoff(); pending.start('producer');
  pending.send({kind: 'revise-task-card', taskCardId: 'new', brief: 'A new scope'});
  assert.throws(() => pending.completeHandoff(), {code: 'STALE_ARTIFACT'});
  assert.equal(pending.p.handoffReports.length, 0);
});

test('handoff completion is append-only and command replay is idempotent', () => {
  const f = handoffFixture(); f.requestHandoff(); f.start('producer');
  assert.throws(() => f.send({kind: 'complete-stage', jobId: 'producer'}), {code: 'INVALID_JOB'});
  const rawReport = f.raw('producer');
  const command = {kind: 'complete-handoff', commandId: 'replay', expectedRevision: f.p.revision, jobId: 'producer', attemptId: 'producer-attempt',
    reportId: 'producer-report', rawReport, payloadRef: 'synthetic://producer', contentHash: hash(JSON.stringify(rawReport)),
    executionReceipt: {providerId: 'synthetic', model: 'synthetic-model', role: 'research', taskId: 'producer-task', attemptId: 'producer-attempt', threadId: 'producer-thread', inputPacketHash: hash('packet'), exitCode: 0}};
  const p = applyCommand(f.p, command, ctx('producer'));
  assert.equal(applyCommand(p, command, ctx('producer')), p);
  assert.equal(p.handoffReports.length, 1);
});

test('failed handoff retry preserves receipt history and rejects previous provider threads', () => {
  const f = handoffFixture(); f.requestHandoff(); f.start('producer');
  const receipt = {providerId: 'synthetic', model: 'synthetic-model', role: 'research', taskId: 'producer-task', attemptId: 'producer-attempt', threadId: 'failed-owner-thread'};
  f.send({kind: 'finish-job-error', jobId: 'producer', attemptId: 'producer-attempt', status: 'failed', error: {code: 'INVALID_OUTPUT', message: 'Malformed provider response'}, receipt}, ctx('producer'));
  assert.throws(() => f.send({kind: 'retry-job', jobId: 'producer', attemptId: 'retry'}, ctx('producer')), {code: 'HANDOFF_CONTEXT_REUSED'});
  f.send({kind: 'retry-job', jobId: 'producer', attemptId: 'retry'}, ctx('retry'));
  assert.throws(() => f.completeHandoff('producer', 'accept', {threadId: 'failed-owner-thread'}, ctx('retry')), {code: 'REVIEW_THREAD_REUSED'});
  f.completeHandoff('producer', 'accept', {}, ctx('retry'));
  assert.equal(f.p.jobs.find(item => item.id === 'producer').attempts[0].receipt.threadId, 'failed-owner-thread');
});

test('corrupt stored acceptance never satisfies a previously released handoff', () => {
  const f = handoffFixture(); f.accept('producer'); f.accept('consumer'); f.release();
  const changed = structuredClone(f.p); changed.handoffReports[0].rawReport.packetHash = hash('wrong');
  assert.equal(projectView(changed).stages[0].status, 'awaiting_release');
  assert.throws(() => applyCommand(changed, {kind: 'release-stage', artifactId: 'research', commandId: 'new-release', expectedRevision: changed.revision}, ctx('human')), {code: 'HANDOFF_BLOCKED'});
});
