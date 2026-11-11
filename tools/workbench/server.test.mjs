import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createServer} from './server.mjs';
import {createHash} from 'node:crypto';
import {diskReceipt} from './selected-stage-fixture.mjs';

async function fixture(t, runtime = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-http-'));
  const options = {dbPath: join(directory, 'projects.sqlite'), uiPath: join(directory, 'ui.html'), ...runtime};
  await writeFile(options.uiPath, '<h1>Local projects</h1>');
  let server = createServer(options);
  let closed = false;
  t.after(async () => { await server.drain(); if (!closed) server.emit('close'); await rm(directory, {recursive: true, force: true}); });
  return {
    drain() { return server.drain(); },
    close() { closed = true; server.emit('close'); },
    reopen() { if (!closed) server.emit('close'); server = createServer(options); closed = false; },
    async request(path, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
      const data = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body);
      const req = Readable.from([Buffer.from(data)]);
      Object.assign(req, {url: path, method, headers: {host: '127.0.0.1:4181', 'content-type': 'application/json', ...headers}});
      return new Promise(resolve => {
        const responseHeaders = {};
        const res = {setHeader(key, value) { responseHeaders[key] = value; }, writeHead(status, values) { this.status = status; Object.assign(responseHeaders, values); }, end(payload) {
          const text = String(payload);
          resolve({status: this.status, headers: responseHeaders, body: responseHeaders['Content-Type'].includes('application/json') ? JSON.parse(text) : text});
        }};
        server.emit('request', req, res);
      });
    },
  };
}
const create = {name: '新项目', brief: '包装设计 Brief', mode: 'assisted', humanGates: ['references'], commandId: 'create-one'};
test('project decisions and immutable history survive reopening; retries are idempotent', async t => {
  const app = await fixture(t);
  const created = await app.request('/api/projects', create);
  assert.equal(created.status, 201);
  const p = created.body.project;
  assert.equal(p.revision, 0);
  const route = `/api/projects/${p.id}`;
  const command = {kind: 'confirm-task-card', commandId: 'confirm-one', expectedRevision: 0, taskCardId: p.activeTaskCardId};
  assert.equal((await app.request(`${route}/commands`, command)).body.project.revision, 1);
  assert.equal((await app.request(`${route}/commands`, command)).body.project.revision, 1);
  assert.equal((await app.request(`${route}/commands`, {...command, commandId: 'conflict'})).status, 409);
  app.reopen();
  assert.equal((await app.request(route)).body.project.revision, 1);
  assert.equal((await app.request(`${route}?revision=0`)).body.project.confirmations.length, 0);
  assert.equal((await app.request('/api/projects', create)).body.project.revision, 1);
  assert.equal((await app.request('/api/projects', {...create, brief: 'different'})).status, 409);
  assert.deepEqual((await app.request('/api/projects')).body.projects, [{id: p.id, name: create.name, revision: 1}]);
  assert.equal((await app.request(`${route}/commands`, {kind: 'revise-task-card', commandId: 'revise', expectedRevision: 1, taskCardId: 'scope-two', brief: '新版任务'})).body.view.taskCard.brief, '新版任务');
  const policy = await app.request(`${route}/commands`, {kind: 'set-policy', commandId: 'policy', expectedRevision: 2, mode: 'auto', humanGates: [], authorizedThrough: 'sketch'});
  assert.equal(policy.body.view.policy.authorizedThrough, 'sketch');
  assert.equal(policy.body.project.audit.at(-1).actorId, 'local-operator');
});
test('HTTP boundary rejects fabricated execution, identity, review and unsafe inputs', async t => {
  const app = await fixture(t);
  const p = (await app.request('/api/projects', create)).body.project;
  const route = `/api/projects/${p.id}/commands`;
  for (const kind of ['request-stage', 'complete-stage', 'assign-panel', 'record-review', 'record-disposition', 'release-stage', 'acknowledge-handoff', '__proto__']) {
    assert.equal((await app.request(route, {kind, commandId: 'fake', expectedRevision: 0})).status, 403, kind);
  }
  const confirm = {kind: 'confirm-task-card', commandId: 'confirm', expectedRevision: 0, taskCardId: p.activeTaskCardId};
  for (const field of ['context', 'actorType', 'actorId', 'review', 'technicalReceipts']) {
    assert.equal((await app.request(route, {...confirm, [field]: 'forged'})).status, 400, field);
  }
  assert.equal((await app.request(route, confirm, {origin: 'https://evil.example'})).status, 403);
  assert.equal((await app.request(route, confirm, {host: 'evil.example:4181'})).status, 403);
  assert.equal((await app.request(route, confirm, {'sec-fetch-site': 'cross-site'})).status, 403);
  assert.equal((await app.request(route, confirm, {'content-type': 'text/plain'})).status, 415);
  assert.equal((await app.request(route, '{')).status, 400);
  assert.equal((await app.request(route, 'x'.repeat(128 * 1024 + 1))).status, 413);
  assert.equal((await app.request('/api/projects', {...create, humanGates: ['__proto__']})).status, 400);
  assert.equal((await app.request('/api/projects', {...create, brief: {text: 'object'}})).status, 400);
  assert.equal((await app.request(`/api/projects/${p.id}?revision=-1`)).status, 400);
  assert.equal((await app.request(`/api/projects/${p.id}?revision=0&revision=1`)).status, 400);
  assert.equal((await app.request(`/api/projects/${p.id}`)).body.project.revision, 0);
  assert.equal((await app.request(route, confirm, {origin: 'http://127.0.0.1:4181'})).status, 200);
});
test('only explicit resources are served and capabilities report missing integrations', async t => {
  const app = await fixture(t);
  assert.equal((await app.request('/')).body, '<h1>Local projects</h1>');
  for (const path of ['/server.mjs', '/projects.sqlite', '/../store.mjs', '/api/projects/unknown']) assert.equal((await app.request(path)).status, 404);
  const capabilities = (await app.request('/api/capabilities')).body;
  assert.equal(capabilities.stages.length, 9);
  assert.ok(capabilities.stages.every(stage => stage.available === false));
  assert.equal(capabilities.layout.protocol, 'project-layout-v1');
  assert.equal(capabilities.layout.boundaryIntegrated, true);
  assert.equal(capabilities.layout.configured, false);
  assert.equal(capabilities.layout.exportAvailable, false);
  assert.equal(capabilities.layout.finalAuthorityAvailable, false);
});

const source = {id: 'source-1', url: 'https://example.org/case', text: 'Synthetic captured excerpt.', scopeRelation: 'background'};
const binding = {research: {providerId: 'synthetic', model: 'synthetic', role: 'research-lead'}};
async function confirmed(app) {
  const p = (await app.request('/api/projects', create)).body.project;
  const route = `/api/projects/${p.id}`;
  await app.request(`${route}/commands`, {kind: 'confirm-task-card', commandId: 'confirm', expectedRevision: 0, taskCardId: p.activeTaskCardId});
  return route;
}
test('HTTP execution durably queues once, freezes captured sources, and replays across restart without dispatch', async t => {
  let calls = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  const app = await fixture(t, {bindings: binding, providers: {synthetic: {model: 'synthetic', async execute() {
    calls++;
    await wait;
    throw Object.assign(new Error('Synthetic uncertain invocation'), {status: 'awaiting_reconciliation'});
  }}}});
  const route = await confirmed(app);
  const command = {stage: 'research', commandId: 'run-one', expectedRevision: 1, sourceRecords: [source]};
  const queued = await app.request(`${route}/jobs`, command);
  assert.equal(queued.status, 202);
  assert.equal(queued.body.project.jobs[0].status, 'queued');
  assert.equal(queued.body.project.jobs[0].task.sourceRecords[0].verification, 'captured');
  assert.equal((await app.request(`${route}/jobs`, command)).body.jobId, queued.body.jobId);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await app.request(`${route}/jobs`, {...command, sourceRecords: [{...source, text: 'Changed'}]})).status, 409);
  release();
  await app.drain();
  assert.equal(calls, 1);
  const finished = (await app.request(route)).body.project;
  assert.equal(finished.jobs[0].status, 'awaiting_reconciliation');
  assert.equal(finished.artifacts.length, 0);
  app.reopen();
  assert.equal((await app.request(`${route}/jobs`, command)).body.jobId, queued.body.jobId);
  await app.drain();
  assert.equal(calls, 1);
  assert.equal((await app.request(`${route}/jobs`, {...command, commandId: 'stale'})).status, 409);
});
test('HTTP source ingestion rejects verification/review forgery and requires confirmed scope', async t => {
  const app = await fixture(t);
  const p = (await app.request('/api/projects', create)).body.project;
  const route = `/api/projects/${p.id}`;
  const command = {stage: 'research', commandId: 'run', expectedRevision: 0, sourceRecords: [source]};
  const unconfirmed = await app.request(`${route}/jobs`, command);
  assert.equal(unconfirmed.status, 422);
  assert.equal(unconfirmed.body.error.code, 'SCOPE_UNCONFIRMED');
  for (const field of ['verification', 'verified', 'review', 'executionReceipt']) {
    assert.equal((await app.request(`${route}/jobs`, {...command, sourceRecords: [{...source, [field]: true}]})).status, 400);
    assert.equal((await app.request(`${route}/jobs`, {...command, [field]: true})).status, 400);
  }
  for (const bad of [{...source, url: 'file:///tmp/private'}, {...source, scopeRelation: 'trusted'}, {...source, id: '__proto__'}]) {
    assert.equal((await app.request(`${route}/jobs`, {...command, sourceRecords: [bad]})).status, 400);
  }
  assert.equal((await app.request(route)).body.project.jobs.length, 0);
});
test('missing providers persist honest blocked jobs and configured text capabilities never imply search or image', async t => {
  const app = await fixture(t, {bindings: binding});
  const route = await confirmed(app);
  const queued = await app.request(`${route}/jobs`, {stage: 'research', commandId: 'missing', expectedRevision: 1});
  assert.equal(queued.status, 202);
  await app.drain();
  const project = (await app.request(route)).body.project;
  assert.equal(project.jobs[0].status, 'blocked');
  assert.equal(project.jobs[0].error.code, 'PROVIDER_MISSING');
  assert.equal(project.artifacts.length, 0);
  const configured = await fixture(t, {bindings: binding, providers: {synthetic: {model: 'synthetic', execute() { throw new Error('must not invoke'); }}}});
  const capabilities = (await configured.request('/api/capabilities')).body;
  assert.equal(capabilities.stages.find(s => s.stage === 'research').invocationSupported, true);
  assert.equal(capabilities.search.available, false);
  assert.equal(capabilities.image.available, false);
});

test('server close drains an in-flight provider before closing its database', async t => {
  let release, invoked;
  const started = new Promise(resolve => { invoked = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const app = await fixture(t, {bindings: binding, providers: {synthetic: {model: 'synthetic', async execute() {
    invoked(); await waiting;
    throw Object.assign(new Error('Synthetic blocked'), {status: 'blocked', code: 'SYNTHETIC_BLOCK'});
  }}}});
  const route = await confirmed(app);
  await app.request(`${route}/jobs`, {stage: 'research', commandId: 'run', expectedRevision: 1});
  await started;
  app.close();
  assert.equal((await app.request(route)).status, 503);
  release();
  await app.drain();
  app.reopen();
  assert.equal((await app.request(route)).body.project.jobs[0].error.code, 'SYNTHETIC_BLOCK');
});

test('startup dispatches persisted queued request once; stale queue records blocker without invoking',async t=>{
 const {openStore}=await import('./store.mjs'),{createExecutor}=await import('./executor.mjs');
 for(const stale of [false,true]) {
  const directory=await mkdtemp(join(tmpdir(),'queued-recovery-')),dbPath=join(directory,'db');
  const store=openStore(dbPath),actor={actorId:'synthetic-human',actorType:'human',runId:'h',contextId:'h'};
  store.create({id:'p',name:'Queued recovery',brief:'Synthetic',mode:'auto'},actor);
  store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},actor);
  const executor=createExecutor({store,rootDir:directory,bindings:binding});
  executor.enqueue('p','research',{commandId:'queued',expectedRevision:1});
  if(stale)store.command('p',{kind:'revise-task-card',taskCardId:'new',brief:'changed',commandId:'change',expectedRevision:2},actor);
  store.close();let calls=0;
  const server=createServer({dbPath,rootDir:directory,bindings:binding,providers:{synthetic:{model:'synthetic',async execute(){calls++;throw Object.assign(new Error('Synthetic stop'),{status:'blocked'});}}}});
  await server.drain();server.emit('close');
  const read=openStore(dbPath);
  assert.equal(read.read('p').jobs[0].status,'blocked');
  assert.equal(calls,stale?0:1);
  if(stale)assert.equal(read.read('p').jobs[0].error.code,'SCOPE_UNCONFIRMED');
  read.close();await rm(directory,{recursive:true,force:true});
 }
});

test('HTTP verification requests invoke an independent provider and reject forged reports', async t => {
  const rootDir = await mkdtemp(join(tmpdir(), 'verification-originals-'));
  const hash = text => createHash('sha256').update(text).digest('hex');
  let authorCalls = 0, reviewCalls = 0, reviewInput;
  const receipts = [];
  const produced = {researchContractVersion: 'research-data-v2', chartData: null, quantitativeClaims: [], outputKind: 'research_findings', status: 'draft', title: 'Synthetic source review', summary: '仅资料整理', sections: [{heading: '内容', body: source.text, evidenceIds: [source.id]}], claims: [{text: '所供摘录为Synthetic captured excerpt.', kind: 'fact', evidenceRefs: [source.id], limitations: ['摘录支持，未认证真实性']}], gaps: [], evidenceClassifications: [{sourceId: source.id, scopeRelation: 'background', reason: 'Synthetic'}]};
  async function receipt(request, output, threadId) {
    const saved = await diskReceipt(rootDir, request, {runId: request.runId, model: 'synthetic', threadId, responseText: JSON.stringify(output), parsedOutput: output});
    receipts.push(saved);
    return saved;
  }
  const app = await fixture(t, {
    rootDir,
    bindings: {...binding, verification: {providerId: 'reviewer', model: 'synthetic', role: 'evidence-reviewer'}},
    providers: {
      synthetic: {model: 'synthetic', execute: async request => {
        authorCalls++;
        return receipt(request, produced, 'author-thread');
      }},
      reviewer: {model: 'synthetic', execute: async request => {
        reviewCalls++;
        reviewInput = JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n') + 20, request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
        assert.equal(reviewInput.content.title, produced.title);
        assert.equal(reviewInput.content.researchContractVersion, 'research-data-v2');
        assert.deepEqual(reviewInput.sourceRecords, [{...source, verification: 'captured', textHash: hash(source.text)}]);
        assert.equal(reviewInput.claimManifest.length, 1);
        assert.deepEqual(reviewInput.quantitativeManifest, []);
        const fixed = Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([, value]) => value.enum).map(([key, value]) => [key, value.enum[0]]));
        const output = {...fixed, results: [{claimKey: reviewInput.claimManifest[0].claimKey, outcome: 'supported_excerpt', rationale: 'Exact supplied excerpt only; not authenticated.', citations: [{sourceId: source.id, textHash: hash(source.text), quote: source.text}], requirementRefs: [], limitations: ['Not authenticated.']}], quantitativeResults: [], wholeTextScan: {status: 'complete', creativeClaimKeys: [], omissions: [], mismatchedCreative: [], operationalAssertions: []}, limitations: ['Synthetic excerpt support only.']};
        return receipt(request, output, 'review-thread');
      }},
    },
  });
  t.after(() => rm(rootDir, {recursive: true, force: true}));
  const route = await confirmed(app);
  assert.equal((await app.request(`${route}/jobs`, {stage: 'research', commandId: 'production', expectedRevision: 1, sourceRecords: [source]})).status, 202);
  await app.drain();
  const p = (await app.request(route)).body.project, artifactId = p.activeByStage.research;
  assert.equal(p.jobs[0].status, 'succeeded', JSON.stringify(p.jobs[0].error));
  assert.equal(authorCalls, 1);
  const artifact = p.artifacts.find(item => item.id === artifactId);
  assert.equal(artifact.provenance, 'provider_execution');
  assert.deepEqual(artifact.technicalReceipts.sourceCatalogue.records, [{...source, verification: 'captured'}]);
  const original = await readFile(artifact.payloadRef, 'utf8');
  assert.equal(hash(original), artifact.contentHash);
  assert.equal(JSON.parse(original).title, produced.title);
  const command = {artifactId, commandId: 'review', expectedRevision: p.revision};
  assert.equal((await app.request(`${route}/verifications`, {...command, rawReport: {approved: true}})).status, 400);
  assert.equal(reviewCalls, 0);
  const queuedReview = await app.request(`${route}/verifications`, command);
  assert.equal(queuedReview.status, 202, JSON.stringify(queuedReview.body));
  await app.drain();
  const result = (await app.request(route)).body.project;
  assert.equal(result.jobs.at(-1).status, 'succeeded', JSON.stringify(result.jobs.at(-1).error));
  assert.equal(result.verifications.length, 1);
  assert.equal(result.verifications[0].hasBlockingFindings, false);
  assert.equal(result.verifications[0].rawReport.results[0].outcome, 'supported_excerpt');
  assert.equal(result.releases.length, 0);
  assert.deepEqual(result.artifacts.find(item => item.id === artifactId).technicalReceipts.sourceCatalogue.records, [{...source, verification: 'captured'}]);
  assert.notEqual(result.jobs[0].binding.providerId, result.jobs.at(-1).binding.providerId);
  assert.notEqual(result.jobs[0].attempts[0].executor.contextId, result.jobs.at(-1).attempts[0].executor.contextId);
  assert.notEqual(result.jobs[0].attempts[0].executor.runId, result.jobs.at(-1).attempts[0].executor.runId);
  assert.equal((await app.request(`${route}/verifications`, command)).status, 202);
  await app.drain();
  assert.equal(reviewCalls, 1);
  assert.equal(receipts.length, 2);
  for (const saved of receipts) {
    const input = await readFile(saved.paths.input, 'utf8');
    assert.equal(hash(input), saved.inputPacketHash);
    assert.equal(JSON.parse(await readFile(saved.paths.receipt, 'utf8')).inputPacketHash, hash(input));
    assert.deepEqual(JSON.parse(await readFile(saved.paths.output, 'utf8')), saved.parsedOutput);
  }
  assert.equal(reviewInput.contentHash, artifact.contentHash);
  const content = await app.request(`${route}/artifacts/${artifactId}/content`);
  assert.equal(content.status, 200);
  assert.equal(content.body.content.title, 'Synthetic source review');
  assert.equal(content.body.contentText, original);
  assert.equal(content.body.contentHash, hash(original));
  try {
    await writeFile(artifact.payloadRef, JSON.stringify({...JSON.parse(original), title: 'Substituted title'}));
    const corrupted = await app.request(`${route}/artifacts/${artifactId}/content`);
    assert.equal(corrupted.status, 422);
    assert.equal(corrupted.body.error.code, 'ARTIFACT_INTEGRITY');
  } finally {
    await writeFile(artifact.payloadRef, original);
  }
  assert.equal((await app.request(`${route}/artifacts/${artifactId}/content`)).body.contentText, original);
});

test('public reference routes cannot inject scores, trusted receipts, paths, execution identities or ready flags',async t=>{
 const app=await fixture(t),p=(await app.request('/api/projects',create)).body.project,route=`/api/projects/${p.id}`;
 for(const field of ['score','scores','receipt','executionReceipt','context','path','ready','readyForSketch','images','envelope','bindings','configuration']){
   assert.equal((await app.request(`${route}/reference-materials`,{action:'attach',artifactId:'copy',directionId:'direction',imageId:'img_fake',kind:'component',applicabilityProfile:'composition_component',borrowingNote:'Proposed borrowing',commandId:'material',expectedRevision:0,[field]:'forged'})).status,400,field);
   assert.equal((await app.request(`${route}/copy-continuations`,{artifactId:'copy',commandId:'continuation',expectedRevision:0,[field]:'forged'})).status,400,field);
   assert.equal((await app.request(`${route}/reference-actions`,{action:'adopt',dossierId:'dossier',selectionHash:'hash',reason:'human choice',commandId:'adopt',expectedRevision:0,[field]:'forged'})).status,400,field);
 }
 for(const kind of ['open-reference-dossier','queue-reference-node','complete-reference-node','claim-reference-tool','complete-reference-tool','register-reference-candidate','request-reference-revision'])assert.equal((await app.request(`${route}/commands`,{kind,commandId:'forged',expectedRevision:0})).status,403,kind);
 assert.equal((await app.request(route)).body.project.revision,0);
});
