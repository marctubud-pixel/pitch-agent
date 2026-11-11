import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyCommand, createProject, projectView} from './project.mjs';
import {buildResearchReadinessRequest} from './research-readiness.mjs';
import {buildEvidenceReviewRequest, evidenceClaimManifest, validateEvidenceReviewOutput} from './evidence-review.mjs';

// Synthetic provider receipts exercise domain transitions without a remote call.
const hash = value => createHash('sha256').update(value).digest('hex');
const ctx = name => ({actorId: name, runId: `${name}-run`, contextId: `${name}-context`, actorType: name === 'human' ? 'human' : 'agent'});
const source = {id: 'source', url: 'https://example.test/brief', text: 'The supplied product is blue.', verification: 'captured'};
function fixture({claims = [{kind: 'fact', text: 'The supplied excerpt says the product is blue.', verification: 'pending', evidenceRefs: ['source']}], humanGates = []} = {}) {
  let p = createProject({id: 'p', name: 'Synthetic verification', brief: 'Create a blue package.', mode: 'auto', humanGates}, ctx('human'));
  let serial = 0;
  const send = (command, context = ctx('human')) => (p = applyCommand(p, {commandId: `c-${++serial}`, expectedRevision: p.revision, ...command}, context));
  send({kind: 'confirm-task-card', taskCardId: p.activeTaskCardId});
  const content = {stage: 'research', outputKind: 'research_findings', status: 'complete', title: 'Research', summary: 'Supplied material', sections: [{title: 'Source', body: source.text, evidenceIds: ['source']}], claims};
  const contentHash = hash(JSON.stringify(content));
  const binding = {providerId: 'synthetic', model: 'synthetic-model', role: 'research'};
  send({kind: 'request-stage', stage: 'research', jobId: 'author-job', binding, task: {id: 'author-task', owner: 'author', parentId: null}});
  send({kind: 'start-job', jobId: 'author-job', attemptId: 'author-attempt'}, ctx('author'));
  send({kind: 'complete-stage', jobId: 'author-job', attemptId: 'author-attempt', artifactId: 'research', payloadRef: 'synthetic://content', contentHash, claims,
    technicalReceipts: {sourceCatalogue: {records: [source]}}, executionReceipt: {...binding, taskId: 'author-task', attemptId: 'author-attempt', threadId: 'author-thread'}}, ctx('author'));
  send({kind: 'acknowledge-handoff', artifactId: 'research', side: 'producer', nextStage: 'strategy'}, ctx('author'));
  send({kind: 'acknowledge-handoff', artifactId: 'research', side: 'consumer', nextStage: 'strategy'}, ctx('consumer'));
  const input = {artifactId: 'research', contentHash, taskCard: p.taskCards[0], taskCardConfirmed: true, content, sourceRecords: [source]};
  const readinessInput = {...input, contentText: JSON.stringify(content)};
  const readiness = buildResearchReadinessRequest(readinessInput);
  const readinessReport = {
    ...Object.fromEntries(Object.entries(readiness.outputSchema.properties).filter(([, prop]) => prop.enum).map(([key, prop]) => [key, prop.enum[0]])),
    verdict: 'ready', coverage: readiness.packet.expectedCoverage.map(item => ({questionId: item.id, status: 'ready', rationale: 'Synthetic prerequisite for excerpt review tests.', refs: [{location: '/content/sections/0/body', quote: source.text}], downstreamImpact: 'Bounded supplied example.', researchNeeded: 'none'})),
    sourceAssessments: [{sourceId: source.id, textHash: hash(source.text), use: 'usable_with_limits', relevance: 'Synthetic example.', provenance: 'Captured excerpt.', limitations: ['Not authenticated.'], refs: [{location: '/sourceRecords/0/text', quote: source.text}]}],
    findings: [], downstreamUse: {allowed: ['Discuss this supplied example.'], prohibited: ['No consumer extrapolation.']}, limitations: ['Synthetic domain fixture only.'],
  };
  send({kind: 'request-readiness', artifactId: 'research', jobId: 'readiness', binding: {...binding, role: 'readiness'}, task: {id: 'readiness-task', owner: 'readiness', parentId: null, readinessInput}});
  send({kind: 'start-job', jobId: 'readiness', attemptId: 'readiness-attempt'}, ctx('readiness'));
  send({kind: 'complete-readiness', jobId: 'readiness', attemptId: 'readiness-attempt', reportId: 'readiness-report', rawReport: readinessReport, payloadRef: 'synthetic://readiness', contentHash: hash(JSON.stringify(readinessReport)), executionReceipt: {...binding, role: 'readiness', taskId: 'readiness-task', attemptId: 'readiness-attempt', threadId: 'readiness-thread', inputPacketHash: hash('readiness-packet'), exitCode: 0}}, ctx('readiness'));
  function request(id = 'verify', value = input) {
    send({kind: 'request-verification', artifactId: 'research', jobId: id, binding: {...binding, role: 'verification'},
      task: {id: `${id}-task`, owner: 'reviewer', parentId: null, verificationInput: value}});
  }
  function report() {
    const properties = buildEvidenceReviewRequest(input).outputSchema.properties;
    const output = Object.fromEntries(Object.entries(properties).filter(([, prop]) => prop.enum).map(([key, prop]) => [key, prop.enum[0]]));
    return {...output, results: evidenceClaimManifest(content).filter(item => item.claim.kind !== 'creative').map(item => ({claimKey: item.claimKey, outcome: 'supported_excerpt', rationale: 'Source-relative text support', citations: [{sourceId: source.id, textHash: hash(source.text), quote: source.text}], requirementRefs: [], limitations: []})),
      wholeTextScan: {status: 'complete', creativeClaimKeys: evidenceClaimManifest(content).filter(item => item.claim.kind === 'creative').map(item => item.claimKey), omissions: [], mismatchedCreative: []}, limitations: []};
  }
  function complete(id = 'verify', rawReport = report(), receipt = {}) {
    const job = p.jobs.find(item => item.id === id);
    return send({kind: 'complete-verification', jobId: id, attemptId: `${id}-attempt`, reportId: `${id}-report`, rawReport,
      payloadRef: `synthetic://${id}-report`, contentHash: hash(input.reviewProtocolVersion === 'excerpt-support-v3' ? JSON.stringify(validateEvidenceReviewOutput(rawReport, input), null, 2) : JSON.stringify(rawReport)),
      executionReceipt: {...job.binding, taskId: job.task.id, attemptId: `${id}-attempt`, threadId: `${id}-thread`, inputPacketHash: hash('packet'), exitCode: 0, ...receipt}}, ctx(id));
  }
  return {get p() { return p; }, input, send, request, report, complete,
    start(id = 'verify', context = ctx(id)) { send({kind: 'start-job', jobId: id, attemptId: `${id}-attempt`}, context); },
    release() { send({kind: 'release-stage', artifactId: 'research'}); }};
}

test('independent report resolves excerpt support without changing claims or source truth', () => {
  const f = fixture();
  const before = structuredClone(f.p.artifacts[0]);
  assert.throws(() => f.release(), {code: 'HARD_BLOCKER'});
  f.request(); f.start(); f.complete(); assert.throws(() => f.release(), {code: 'HANDOFF_REQUIRED'});
  assert.deepEqual(f.p.artifacts[0], before);
  assert.equal(f.p.verifications[0].checkedFactMeaning, 'source_relative_excerpt_support_not_website_truth');
  assert.equal(f.p.verifications[0].hasBlockingFindings, false);
  assert.equal(projectView(f.p).stages[0].status, 'awaiting_release');
});

test('empty author claim lists still require whole-text verification and omissions block', () => {
  const f = fixture({claims: []});
  assert.throws(() => f.release(), {code: 'HARD_BLOCKER'});
  f.request(); f.start();
  const report = f.report();
  report.wholeTextScan.omissions.push({location: '/sections/0/body', quote: source.text, reason: 'Unlisted external assertion'});
  f.complete('verify', report);
  assert.equal(f.p.verifications[0].hasBlockingFindings, true);
  assert.throws(() => f.release(), {code: 'HARD_BLOCKER'});
});

test('verification input rejects changed claims, artifact hash, task card and source text', () => {
  for (const mutate of [input => input.content.claims[0].text = 'tampered', input => input.contentHash = hash('changed'), input => input.taskCard.brief = 'changed', input => input.taskCardConfirmed = false, input => input.sourceRecords[0].text = 'changed']) {
    const f = fixture(); const input = structuredClone(f.input); mutate(input);
    assert.throws(() => f.request('verify', input), {code: 'INVALID_VERIFICATION_INPUT'});
  }
});

test('creator identities and actual reused provider threads are excluded', () => {
  const f = fixture(); f.request();
  assert.throws(() => f.start('verify', ctx('author')), {code: 'SELF_REVIEW'});
  f.start();
  assert.throws(() => f.complete('verify', f.report(), {threadId: 'author-thread'}), {code: 'REVIEW_THREAD_REUSED'});
  assert.throws(() => f.complete('verify', f.report(), {inputPacketHash: ''}), {code: 'INVALID_EXECUTION_RECEIPT'});
  assert.throws(() => f.complete('verify', f.report(), {model: 'other'}), {code: 'INVALID_EXECUTION_RECEIPT'});
  f.complete(); f.request('second'); f.start('second');
  assert.throws(() => f.complete('second', f.report(), {threadId: 'verify-thread'}), {code: 'REVIEW_THREAD_REUSED'});
});

test('failed findings survive a passing rerun and human adoption', () => {
  const f = fixture(); f.request(); f.start();
  const failed = f.report(); failed.results[0].outcome = 'unsupported'; failed.results[0].limitations = ['Insufficient support'];
  f.complete('verify', failed); f.request('second'); f.start('second'); f.complete('second');
  f.send({kind: 'adopt-creative', artifactId: 'research', reason: 'Choose this creative route'});
  assert.equal(f.p.verifications.length, 2);
  assert.throws(() => f.release(), {code: 'HARD_BLOCKER'});
});

test('malformed reports never append, and completed reports cannot waive human gates', () => {
  const f = fixture({humanGates: ['research']}); f.request(); f.start();
  const partial = f.report(); partial.results = [];
  assert.throws(() => f.complete('verify', partial), {code: 'INVALID_EVIDENCE_REVIEW'});
  assert.equal(f.p.verifications.length, 0);
  f.complete(); assert.throws(() => f.release(), {code: 'HUMAN_GATE'});
  f.send({kind: 'adopt-creative', artifactId: 'research', reason: 'Choose this route'}); assert.throws(() => f.release(), {code: 'HANDOFF_REQUIRED'});
});

test('verification jobs do not replace stage status or active production artifacts', () => {
  const f = fixture(); f.request(); f.start();
  assert.equal(projectView(f.p).stages[0].status, 'awaiting_release');
  assert.equal(projectView(f.p).stages[0].latestJobId, 'author-job');
  assert.throws(() => f.send({kind: 'complete-stage', jobId: 'verify'}), {code: 'INVALID_JOB'});
  f.complete(); assert.equal(f.p.activeByStage.research, 'research');
  assert.throws(() => f.release(), {code: 'HANDOFF_REQUIRED'});
  assert.throws(() => f.send({kind: 'request-stage', stage: 'strategy', jobId: 'strategy'}), {code: 'DEPENDENCY_BLOCKED'});
});

test('scope revisions reject queued, retrying and in-flight verification targets', () => {
  for (const phase of ['queued', 'running', 'failed']) {
    const f = fixture(); f.request();
    if (phase !== 'queued') f.start();
    if (phase === 'failed') f.send({kind: 'finish-job-error', jobId: 'verify', attemptId: 'verify-attempt', status: 'failed', error: {code: 'transport', message: 'Synthetic failure'}}, ctx('verify'));
    f.send({kind: 'revise-task-card', taskCardId: 'scope2', brief: 'Changed scope'});
    const action = phase === 'queued' ? () => f.start() : phase === 'running' ? () => f.complete() : () => f.send({kind: 'retry-job', jobId: 'verify', attemptId: 'retry'}, ctx('retry'));
    assert.throws(action, {code: 'STALE_ARTIFACT'});
  }
});

test('legacy project snapshots initialize append-only verification history', () => {
  const f = fixture(); f.request(); f.start();
  const legacy = structuredClone(f.p); delete legacy.verifications;
  const job = legacy.jobs.at(-1);
  const result = applyCommand(legacy, {kind: 'complete-verification', commandId: 'legacy-complete', expectedRevision: legacy.revision, jobId: job.id, attemptId: 'verify-attempt', reportId: 'report', rawReport: f.report(), payloadRef: 'synthetic://report', contentHash: hash('report'), executionReceipt: {...job.binding, taskId: job.task.id, attemptId: 'verify-attempt', threadId: 'verify-thread', inputPacketHash: hash('packet'), exitCode: 0}}, ctx('verify'));
  assert.equal(result.verifications.length, 1);
});

test('review cannot reuse thread from unsuccessful production attempt',()=>{
 const f=fixture(),binding={providerId:'synthetic',model:'synthetic-model',role:'research'};
 f.send({kind:'request-stage',stage:'research',jobId:'failed-author',binding,task:{id:'failed-task',owner:'author2',parentId:null}});
 f.send({kind:'start-job',jobId:'failed-author',attemptId:'failed-attempt'},ctx('author2'));
 f.send({kind:'finish-job-error',jobId:'failed-author',attemptId:'failed-attempt',status:'awaiting_reconciliation',error:{code:'LOST_RESPONSE',message:'Synthetic'},receipt:{...binding,taskId:'failed-task',attemptId:'failed-attempt',threadId:'failed-production-thread'}},ctx('author2'));
 f.request();f.start();assert.throws(()=>f.complete('verify',f.report(),{threadId:'failed-production-thread'}),{code:'REVIEW_THREAD_REUSED'});
});

function v3Fixture() {
  const f = fixture();
  f.input.reviewProtocolVersion = 'excerpt-support-v3'; f.input.catalogueState = [];
  const report = f.report(); report.wholeTextScan.operationalAssertions = [];
  return {f, report};
}
function v3Receipt(f, report, id = 'verify') {
  const request = buildEvidenceReviewRequest(f.input);
  return {runId: `${id}-attempt`, requestedModel: 'synthetic-model', responseText: JSON.stringify(report),
    inputPacketHash: hash(JSON.stringify({runId: `${id}-attempt`, model: 'synthetic-model', prompt: request.prompt, outputSchema: request.outputSchema}))};
}
test('v3 exact original provider request and response are required before accepting evidence', () => {
  for (const patch of [
    {runId: 'wrong'}, {requestedModel: 'wrong'}, {inputPacketHash: hash('other request')}, {responseText: '{}'},
    {parsedOutput: {}}, {reason: 'timeout'}, {error: 'failure'}, {signal: 'SIGTERM'},
    {providerExecution: {requestedModel: 'wrong'}},
  ]) {
    const {f, report} = v3Fixture(); f.request(); f.start();
    assert.throws(() => f.complete('verify', report, {...v3Receipt(f, report), ...patch}), {code: 'INVALID_EXECUTION_RECEIPT'});
    assert.equal(f.p.verifications.length, 0);
  }
  const {f, report} = v3Fixture(); f.request(); f.start(); f.complete('verify', report, v3Receipt(f, report));
  assert.equal(f.p.verifications[0].hasBlockingFindings, false);
  assert.equal(f.p.verifications[0].protocolVersion, 'excerpt-support-v3');
});
test('v3 cannot erase a genuine earlier negative report on the same artifact', () => {
  const f = fixture(); f.request(); f.start();
  const negative = f.report(); negative.wholeTextScan.omissions = [{location: '/summary', quote: f.input.content.summary, reason: 'Retained external factual omission.'}];
  f.complete('verify', negative);
  f.input.reviewProtocolVersion = 'excerpt-support-v3'; f.input.catalogueState = [];
  const positive = f.report(); positive.wholeTextScan.operationalAssertions = [];
  f.request('v3'); f.start('v3'); f.complete('v3', positive, v3Receipt(f, positive, 'v3'));
  assert.equal(f.p.verifications.length, 2);
  assert.equal(f.p.verifications[0].hasBlockingFindings, true);
  assert.throws(() => f.release(), {code: 'HARD_BLOCKER'});
});
test('v3 forged catalogue authority cannot enter a frozen verification job', () => {
  const {f} = v3Fixture();
  f.input.catalogueState = [{sourceId: 'source', sourceRecordHash: hash('forged'), taskCardId: f.input.taskCard.id,
    caseReviewId: 'invented', caseReviewHash: hash('invented'), casePacketHash: hash('invented'),
    identityStatus: 'identity_checked', taskFit: 'same_use', sourceVerification: 'captured'}];
  assert.throws(() => f.request(), {code: 'INVALID_VERIFICATION_INPUT'});
});
