import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createServer} from './server.mjs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const source = {id: 's1', url: 'https://example.test/blue', text: 'Synthetic package is blue.', scopeRelation: 'background', verification: 'captured'};
const production = {outputKind: 'research_findings', status: 'complete', title: 'Synthetic research', summary: source.text, sections: [{heading: 'Finding', body: source.text, evidenceIds: ['s1']}], claims: [{text: source.text, kind: 'fact', evidenceRefs: ['s1'], limitations: ['Supplied excerpt only.']}], gaps: [], evidenceClassifications: [{sourceId: 's1', scopeRelation: 'background', reason: 'Bounded example.'}]};
const bindings = {research: {providerId: 'author', model: 'synthetic', role: 'research-lead'}, verification: {providerId: 'reviewer', model: 'synthetic', role: 'evidence-reviewer'}, readiness: {providerId: 'reviewer', model: 'synthetic', role: 'readiness-reviewer'}, strategy: {providerId: 'strategist', model: 'synthetic', role: 'strategy-lead'}};
const human = {actorId: 'human', actorType: 'human', runId: 'human', contextId: 'human'};
function output(request) {
  const p = request.packet ?? (request.outputSchema.properties.outputKind ? null : JSON.parse(request.prompt.split("UNTRUSTED_JSON_DATA\n")[1].split("\nEND_UNTRUSTED_JSON_DATA")[0]));
  const fixed = Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([, value]) => value.enum).map(([key, value]) => [key, value.enum[0]]));
  if (!p) {
    if (request.outputSchema.properties.outputKind.enum[0] === 'strategy') {
      if(request.outputSchema.properties.strategyContractVersion)return syntheticStrategyV2(JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'))));
      const {evidenceClassifications, ...strategy} = production;
      return {...strategy, outputKind: 'strategy'};
    }
    return production;
  }
  if (['research-handoff-v1','research-handoff-v2'].includes(p.protocolVersion)) return {...fixed,...(p.protocolVersion==='research-handoff-v2'?{restrictionDispositions:p.restrictionManifest.map(r=>({originKey:r.originKey,state:'retained',text:r.prohibitedUse}))}:{}), ownerBinding: p.ownerBinding, decision: 'accept', understoodFindings: [{finding: source.text, refs: [{location: '/content/sections/0/body', quote: source.text}]}], permittedUses: ['Explore the supplied blue example.'], prohibitedInferences: ['No consumer preference claim.'], unresolvedIssues: [], limitations: ['Synthetic test only.']};
  if (['research-readiness-v1','research-readiness-v2'].includes(p.protocolVersion)) return {...fixed,...(p.protocolVersion==='research-readiness-v2'?{obligationAssessments:[],useScan:{contentHash:p.contentHash,assessedOriginKeys:[],findings:[]}}:{}), verdict: 'ready', coverage: p.expectedCoverage.map(item => ({questionId: item.id, status: 'ready', rationale: 'Bounded synthetic task.', refs: [{location: '/content/sections/0/body', quote: source.text}], downstreamImpact: 'Explore blue.', researchNeeded: 'none'})), sourceAssessments: [{sourceId: source.id, textHash: hash(source.text), use: 'usable_with_limits', relevance: 'Supplied example.', provenance: 'Captured excerpt.', limitations: ['Not authenticated.'], refs: [{location: '/sourceRecords/0/text', quote: source.text}]}], findings: [], downstreamUse: {allowed: ['Explore blue.'], prohibited: ['No preference claim.']}, limitations: ['Synthetic test only.']};
  return {...fixed, results: p.claimManifest.filter(c=>c.claim.kind!=='creative').map(item => ({claimKey: item.claimKey, outcome: 'supported_excerpt', rationale: 'Exact supplied text.', citations: [{sourceId: source.id, textHash: hash(source.text), quote: source.text}], requirementRefs: [], limitations: []})), wholeTextScan: {status: 'complete', creativeClaimKeys: p.claimManifest.filter(c=>c.claim.kind==='creative').map(c=>c.claimKey), omissions: [], mismatchedCreative: [], ...(fixed.protocolVersion === 'excerpt-support-v3' ? {operationalAssertions: []} : {})}, limitations: []};
}
function providerSet(calls, transform = value => value) {
  return Object.fromEntries(['author', 'reviewer', 'strategist'].map(id => [id, {model: 'synthetic', execute: async request => {
    calls.push({id, request});
    const parsedOutput = output(request);
    return transform({runId: request.runId, requestedModel: 'synthetic', threadId: `${id}-${request.runId}`, inputPacketHash: hash(JSON.stringify((request.outputSchema.properties.protocolVersion?.enum[0] === 'excerpt-support-v3'||request.outputSchema.properties.strategyContractVersion) ? {runId: request.runId, model: 'synthetic', prompt: request.prompt, outputSchema: request.outputSchema} : request)), exitCode: 0, responseText: JSON.stringify(parsedOutput), parsedOutput}, request);
  }}]));
}
async function runtime(t, transform) {
  const root = await mkdtemp(join(tmpdir(), 'handoff-runtime-')), store = openStore(join(root, 'db')), calls = [];
  store.create({id: 'p', name: 'Synthetic', brief: 'Explore the supplied blue packaging example, without audience claims.', mode: 'auto', humanGates: []}, human);
  store.command('p', {kind: 'confirm-task-card', taskCardId: 'p:scope:1', commandId: 'confirm', expectedRevision: 0}, human);
  const executor = createExecutor({store, rootDir: root, bindings, providers: providerSet(calls, transform)});
  t.after(async () => {store.close(); await rm(root, {recursive: true, force: true});});
  const produced = await executor.execute('p', executor.enqueue('p', 'research', {sourceRecords: [source]}));
  assert.equal(produced.status, 'succeeded', JSON.stringify(produced.error));
  const artifact = store.read('p').artifacts[0];
  for (const enqueue of ['enqueueVerification', 'enqueueReadiness']) {
    const job = await executor.execute('p', await executor[enqueue]('p', artifact.id));
    assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  }
  return {root, store, executor, calls, artifact};
}

test('handoff runtime uses original producer and configured strategy, freezes exact inputs and never releases', async t => {
  const {root, store, executor, calls, artifact} = await runtime(t);
  const original = store.read('p');
  const changedConfiguration = createExecutor({store, rootDir: root, bindings: {...bindings, research: {providerId: 'replacement', model: 'new-model', role: 'replacement-author'}}, providers: providerSet(calls)});
  for (const side of ['producer', 'consumer']) {
    const command = {commandId: side, expectedRevision: store.read('p').revision};
    const id = await changedConfiguration.enqueueHandoff('p', artifact.id, side, command);
    assert.equal(await executor.enqueueHandoff('p', artifact.id, side, command), id);
    const job = await changedConfiguration.execute('p', id);
    assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
    assert.deepEqual(job.binding, side === 'producer' ? bindings.research : bindings.strategy);
    const packet = JSON.parse(await readFile(join(root, job.attemptId, 'packet.json'), 'utf8')).packet;
    assert.equal(packet.contentText, await readFile(artifact.payloadRef, 'utf8'));
    assert.deepEqual(packet.verificationReports, original.verifications.map(item => item.rawReport));
    assert.deepEqual(packet.readinessReports, original.readinessReports.map(item => item.rawReport));
    if (side === 'consumer') assert.deepEqual(packet.producerReport.packetHash, store.read('p').handoffReports[0].packetHash);
    const report = store.read('p').handoffReports.at(-1);
    assert.equal(hash(await readFile(report.payloadRef)), report.reportHash);
    assert.equal(await executor.enqueueHandoff('p', artifact.id, side, command), id);
    await assert.rejects(() => executor.execute('p', id));
  }
  const p = store.read('p');
  assert.equal(p.releases.length, 0);
  assert.equal(p.handoffReports.length, 2);
  assert.equal(calls.filter(item => item.request.packet?.protocolVersion === 'research-handoff-v1').length, 2);
  for (const key of ['actorId', 'runId', 'contextId']) assert.equal(new Set(p.jobs.flatMap(job => job.attempts.map(attempt => attempt.executor[key]))).size, 5);
  assert.equal(new Set(p.jobs.flatMap(job => job.attempts.map(attempt => attempt.receipt.threadId))).size, 5);
  store.command('p', {kind: 'release-stage', artifactId: artifact.id, commandId: 'release', expectedRevision: p.revision}, human);
  const strategyId = executor.enqueue('p', 'strategy');
  assert.deepEqual(store.read('p').jobs.find(job => job.id === strategyId).inputVersionIds, [artifact.id]);
});

test('actual strategy generation receives accepted handoff consumption constraints', async t => {
  const {store, executor, calls, artifact} = await runtime(t);
  for (const side of ['producer', 'consumer']) assert.equal((await executor.execute('p', await executor.enqueueHandoff('p', artifact.id, side))).status, 'succeeded');
  store.command('p', {kind: 'release-stage', artifactId: artifact.id, commandId: 'release', expectedRevision: store.read('p').revision}, human);
  const strategy = await executor.execute('p', executor.enqueue('p', 'strategy'));
  assert.equal(strategy.status, 'succeeded', JSON.stringify(strategy.error));
  const request = calls.at(-1).request;
  assert.equal(calls.at(-1).id, 'strategist');
  assert.ok(request.prompt.includes('No consumer preference claim.'), 'Strategy must receive the prohibition signed by both owners.');
  const delivered = JSON.parse(request.prompt.split('\nUNTRUSTED_JSON_DATA\n')[1].split('\nEND_UNTRUSTED_JSON_DATA')[0]);
  const project = store.read('p');
  assert.deepEqual(delivered.inputArtifacts[0].reviewConstraints, {
    readiness: project.readinessReports.map(report => ({reportId: report.id, rawReport: report.rawReport})),
    handoffs: project.handoffReports.map(report => ({reportId: report.id, rawReport: report.rawReport})),
  });
});

test('handoff refuses changed original bytes before provider dispatch', async t => {
  const {store, executor, calls, artifact} = await runtime(t);
  const id = await executor.enqueueHandoff('p', artifact.id, 'producer');
  await writeFile(artifact.payloadRef, (await readFile(artifact.payloadRef, 'utf8')) + '\n');
  assert.equal((await executor.execute('p', id)).status, 'failed');
  assert.equal(calls.length, 3);
  assert.equal(store.read('p').handoffReports.length, 0);
});

test('new readiness report invalidates an already queued handoff before provider dispatch', async t => {
  const {store, executor, calls, artifact} = await runtime(t);
  const id = await executor.enqueueHandoff('p', artifact.id, 'producer');
  await executor.execute('p', await executor.enqueueReadiness('p', artifact.id));
  assert.equal((await executor.execute('p', id)).status, 'blocked');
  assert.equal(calls.length, 4);
  assert.equal(store.read('p').handoffReports.length, 0);
});

test('a readiness report arriving during owner execution prevents late acceptance', async t => {
  let current;
  const fixture = await runtime(t, async (receipt, request) => {
    if (request.packet?.protocolVersion === 'research-handoff-v1') {
      const later = await current.executor.enqueueReadiness('p', current.artifact.id);
      assert.equal((await current.executor.execute('p', later)).status, 'succeeded');
    }
    return receipt;
  });
  current = fixture;
  const job = await fixture.executor.execute('p', await fixture.executor.enqueueHandoff('p', fixture.artifact.id, 'producer'));
  assert.equal(job.status, 'awaiting_reconciliation');
  assert.equal(fixture.store.read('p').handoffReports.length, 0);
});

for (const [name, corrupt] of Object.entries({wrongRun: receipt => ({...receipt, runId: 'different-run'}), contradictoryRawResponse: receipt => ({...receipt, responseText: '{}'}), signalled: receipt => ({...receipt, signal: 'SIGTERM'})})) {
  test(`handoff rejects invalid provider receipt ${name}`, async t => {
    const {store, executor, artifact} = await runtime(t, (receipt, request) => request.packet?.protocolVersion === 'research-handoff-v1' ? corrupt(receipt) : receipt);
    const job = await executor.execute('p', await executor.enqueueHandoff('p', artifact.id, 'producer'));
    assert.equal(job.status, 'awaiting_reconciliation');
    assert.equal(store.read('p').handoffReports.length, 0);
  });
}

async function httpFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'handoff-http-')), calls = [], options = {dbPath: join(root, 'db'), rootDir: root, bindings, providers: providerSet(calls)};
  let server = createServer(options);
  t.after(async () => {await server.drain(); server.emit('close'); await rm(root, {recursive: true, force: true});});
  return {calls, drain: () => server.drain(), async reopen() {await server.drain(); server.emit('close'); server = createServer(options);}, async request(path, body) {
    const req = Readable.from([Buffer.from(body === undefined ? '' : JSON.stringify(body))]);
    Object.assign(req, {url: path, method: body === undefined ? 'GET' : 'POST', headers: {host: '127.0.0.1:4181', 'content-type': 'application/json'}});
    return new Promise(resolve => server.emit('request', req, {setHeader() {}, writeHead(status) {this.status = status;}, end(payload) {resolve({status: this.status, body: JSON.parse(String(payload))});}}));
  }};
}

test('HTTP handoff rejects forged reports and owner bindings, replay invokes each owner once across restart', async t => {
  const app = await httpFixture(t);
  const created = await app.request('/api/projects', {name: 'Synthetic', brief: 'Explore the blue example.', mode: 'auto', commandId: 'create'});
  const route = `/api/projects/${created.body.project.id}`;
  await app.request(`${route}/commands`, {kind: 'confirm-task-card', taskCardId: created.body.project.activeTaskCardId, expectedRevision: 0, commandId: 'confirm'});
  const {verification, ...captured} = source;
  await app.request(`${route}/jobs`, {stage: 'research', sourceRecords: [captured], commandId: 'produce', expectedRevision: 1}); await app.drain();
  for (const endpoint of ['verifications', 'readiness']) {
    const p = (await app.request(route)).body.project;
    assert.equal((await app.request(`${route}/${endpoint}`, {artifactId: p.activeByStage.research, commandId: endpoint, expectedRevision: p.revision})).status, 202);
    await app.drain();
  }
  for (const side of ['producer', 'consumer']) {
    const p = (await app.request(route)).body.project;
    const command = {artifactId: p.activeByStage.research, side, commandId: side, expectedRevision: p.revision};
    for (const field of ['binding', 'ownerBinding', 'rawReport', 'executionReceipt', 'handoffInput', 'context', 'actorId']) assert.equal((await app.request(`${route}/handoffs`, {...command, [field]: {decision: 'accept'}})).status, 400, field);
    for (const kind of ['request-handoff', 'complete-handoff', 'acknowledge-handoff']) assert.equal((await app.request(`${route}/commands`, {...command, kind})).status, 403);
    const queued = await app.request(`${route}/handoffs`, command);
    assert.equal(queued.status, 202, JSON.stringify(queued.body));
    assert.equal((await app.request(`${route}/handoffs`, command)).body.jobId, queued.body.jobId);
    await app.drain(); await app.reopen();
    assert.equal((await app.request(`${route}/handoffs`, command)).body.jobId, queued.body.jobId);
    await app.drain();
  }
  const p = (await app.request(route)).body.project;
  assert.equal(p.handoffReports.length, 2);
  assert.equal(p.releases.length, 0);
  assert.equal(app.calls.filter(call => call.request.packet?.protocolVersion === 'research-handoff-v1').length, 2);
});

test('current ready v2 assessment uses handoff-v2 and ordinary continuation creates one strategy job',async t=>{
 const {store,executor,artifact}=await runtime(t,(receipt,request)=>request.packet?.protocolVersion?{...receipt,model:'synthetic',inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema}))}:receipt);
 const id=await executor.enqueueReadiness('p',artifact.id,{commandId:'v2',expectedRevision:store.read('p').revision,protocolVersion:'research-readiness-v2'});
 const check=await executor.execute('p',id);assert.equal(check.status,'succeeded',JSON.stringify(check.error));
 for(const side of ['producer','consumer']){
  const jobId=await executor.enqueueHandoff('p',artifact.id,side,{commandId:'v2-'+side,expectedRevision:store.read('p').revision,protocolVersion:'research-handoff-v2'});
  const handoff=await executor.execute('p',jobId);assert.equal(handoff.status,'succeeded',JSON.stringify(handoff.error));
 }
 const before=store.read('p'),request={artifactId:artifact.id,policyVersion:before.policies.at(-1).version,commandId:'ordinary-v2-continuation',expectedRevision:before.revision};
 const strategy=executor.continueResearch('p',request);
 assert.equal(executor.continueResearch('p',request),strategy);
 const after=store.read('p');assert.equal(after.handoffReports.filter(r=>r.protocolVersion==='research-handoff-v2').length,2);assert.equal(after.jobs.filter(j=>j.stage==='strategy').length,1);
 const generated=await executor.execute('p',strategy);assert.equal(generated.status,'succeeded',JSON.stringify(generated.error));
 const factual=await executor.enqueueVerification('p',generated.outputVersionIds[0],{commandId:'strategy-restrictions',expectedRevision:store.read('p').revision});
 const frozen=store.read('p').jobs.find(j=>j.id===factual).task.verificationInput;
 assert.ok(frozen.ownerConstraints[artifact.id].readiness.some(r=>r.rawReport.protocolVersion==='research-readiness-v2'));
 assert.equal(after.releases.length,1);
});
