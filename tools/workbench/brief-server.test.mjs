import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir, hostname} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createBriefServer} from './brief-server.mjs';
import {openStore} from './store.mjs';

const create = {name: '新项目', brief: '用户原Brief', commandId: 'create-one', mode: 'assisted', humanGates: ['strategy', 'final_review']};
const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-brief-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server = createBriefServer({dbPath, ...options});
  t.after(async () => { await close(server); await rm(directory, {recursive: true, force: true}); });
  return {
    dbPath,
    async reopen() { await close(server); server = createBriefServer({dbPath, ...options}); },
    async request(path, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
      const data = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body);
      const req = Readable.from([Buffer.from(data)]);
      Object.assign(req, {url: path, method, headers: {host: '127.0.0.1:4182', 'content-type': 'application/json', ...headers}});
      return new Promise(resolve => {
        const responseHeaders = {};
        const res = {setHeader(key, value) { responseHeaders[key] = value; }, writeHead(status, values) { this.status = status; Object.assign(responseHeaders, values); }, end(payload) {
          resolve({status: this.status, headers: responseHeaders, body: payload ? JSON.parse(String(payload)) : null});
        }};
        server.emit('request', req, res);
      });
    },
  };
}
test('create, immutable save, confirm and refresh persist with native identity and idempotency', async t => {
  const app = await fixture(t);
  const created = await app.request('/api/v1/projects', create);
  assert.equal(created.status, 201);
  const p = created.body.project, route = `/api/v1/projects/${p.id}`;
  assert.equal(p.taskCards[0].createdBy, 'local-operator');
  assert.equal(created.body.view.policy.authorizedThrough, 'research');
  assert.equal(created.body.view.policy.mode, create.mode);
  assert.deepEqual(created.body.view.policy.humanGates, create.humanGates);
  const edit = {kind: 'revise-task-card', commandId: 'edit', expectedRevision: 0, taskCardId: 'scope-two', brief: '更新原Brief'};
  const revised = await app.request(`${route}/commands`, edit);
  assert.equal(revised.status, 200);
  assert.deepEqual(revised.body.receipt, {commandId: 'edit', replayed: false});
  assert.equal(revised.body.project.revision, 1);
  assert.equal(revised.body.view.taskCard.brief, edit.brief);
  assert.equal(revised.body.view.taskCard.createdBy, 'local-operator');
  const replayedEdit = await app.request(`${route}/commands`, edit);
  assert.equal(replayedEdit.body.project.revision, 1);
  assert.deepEqual(replayedEdit.body.receipt, {commandId: 'edit', replayed: true});
  assert.equal((await app.request(`${route}/commands`, {...edit, brief: '重用不同内容'})).status, 409);
  assert.equal((await app.request(`${route}/commands`, {...edit, commandId: 'stale', taskCardId: 'scope-three'})).status, 409);
  const confirm = {kind: 'confirm-task-card', commandId: 'confirm', expectedRevision: 1, taskCardId: 'scope-two'};
  const firstConfirm = await app.request(`${route}/commands`, confirm);
  assert.equal(firstConfirm.body.project.revision, 2);
  assert.deepEqual(firstConfirm.body.receipt, {commandId: 'confirm', replayed: false});
  const replayedConfirm = await app.request(`${route}/commands`, confirm);
  assert.equal(replayedConfirm.body.project.revision, 2);
  assert.deepEqual(replayedConfirm.body.receipt, {commandId: 'confirm', replayed: true});
  await app.reopen();
  const saved = await app.request(route);
  assert.equal(saved.body.project.revision, 2);
  assert.deepEqual(saved.body.project.confirmations, [{taskCardId: 'scope-two', actorId: 'local-operator'}]);
  assert.equal(saved.body.project.audit.at(-1).actorId, 'local-operator');
  assert.equal(saved.body.project.jobs.length, 0);
  const refreshedReplay = await app.request(`${route}/commands`, edit);
  assert.deepEqual(refreshedReplay.body.receipt, {commandId: 'edit', replayed: true});
  assert.equal(refreshedReplay.body.project.revision, 2);
  const mismatchedReplay = await app.request(`${route}/commands`, {...edit, brief: 'Different content after refresh'});
  assert.equal(mismatchedReplay.status, 409);
  assert.equal(mismatchedReplay.body.error.code, 'COMMAND_ID_REUSED');
  assert.equal(Object.hasOwn(mismatchedReplay.body, 'receipt'), false);
  const initial = await app.request(`${route}?revision=0`);
  assert.equal(initial.body.view.taskCard.brief, create.brief);
  assert.equal(initial.body.project.confirmations.length, 0);
  assert.equal((await app.request('/api/v1/projects', create)).body.project.revision, 2);
  assert.equal((await app.request('/api/v1/projects', {...create, brief: '重用创建ID'})).status, 409);
  assert.equal((await app.request('/api/v1/projects', {...create, humanGates: []})).status, 409);
  assert.deepEqual((await app.request('/api/v1/projects')).body.projects, [{id: p.id, name: p.name, revision: 2}]);
});
test('restricted surface exposes no generic execution, policy or fabricated identity', async t => {
  const app = await fixture(t);
  const caps = await app.request('/api/v1/capabilities');
  assert.equal(caps.body.surface, 'brief-v1');
  assert.equal(caps.body.executionAvailable, false);
  const p = (await app.request('/api/v1/projects', create)).body.project;
  const route = `/api/v1/projects/${p.id}`;
  for (const suffix of ['/jobs', '/final-review-continuations', '/final-review-status', '/assistant', '/research-continuations', '/continuations']) assert.equal((await app.request(route + suffix, {})).status, 404, suffix);
  for (const kind of ['set-policy', 'request-stage', 'complete-stage', 'release-stage', 'assistant', 'adopt-creative', 'confirm-task-card-v1', '__proto__']) assert.equal((await app.request(`${route}/commands`, {kind, commandId: 'bad', expectedRevision: 0})).status, 403, kind);
  for (const extra of [{actorId: 'agent'}, {actorType: 'agent'}, {context: {actorId: 'agent'}}, {authorizedThrough: 'final_review'}, {executor: true}]) {
    assert.equal((await app.request('/api/v1/projects', {...create, ...extra})).status, 400);
    assert.equal((await app.request(`${route}/commands`, {kind: 'confirm-task-card', commandId: 'bad', expectedRevision: 0, taskCardId: p.activeTaskCardId, ...extra})).status, 400);
  }
  assert.equal((await app.request('/api/v1/projects', {...create, humanGates: ['content_review']})).status, 400);
  assert.equal((await app.request('/api/projects', create)).status, 404);
  assert.equal((await app.request('/api/v2/projects')).status, 404);
  assert.equal((await app.request(route)).body.project.revision, 0);
});
test('strict JSON, size, revision, string and query validation', async t => {
  const app = await fixture(t);
  const p = (await app.request('/api/v1/projects', create)).body.project;
  const route = `/api/v1/projects/${p.id}`;
  for (const body of ['{', '[]', 'null', '{}', {...create, name: ''}, {...create, brief: 'x'.repeat(60001)}, {...create, commandId: '__proto__'}]) assert.equal((await app.request('/api/v1/projects', body)).status, 400);
  assert.equal((await app.request('/api/v1/projects', create, {'content-type': 'text/plain'})).status, 415);
  assert.equal((await app.request('/api/v1/projects', 'x'.repeat(128 * 1024 + 1))).status, 413);
  assert.equal((await app.request('/api/v1/projects', create, {'content-length': String(128 * 1024 + 1)})).status, 413);
  for (const expectedRevision of [-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await app.request(`${route}/commands`, {kind: 'confirm-task-card', commandId: 'bad', expectedRevision, taskCardId: p.activeTaskCardId})).status, 400);
  for (const query of ['?revision=-1', '?revision=1.2', '?revision=0&revision=0', '?revision=9007199254740992', '?extra=1']) assert.equal((await app.request(route + query)).status, 400, query);
  assert.equal((await app.request('/api/v1/projects?extra=1')).status, 400);
  assert.equal((await app.request(`${route}/commands?revision=0`, {})).status, 400);
  assert.equal((await app.request('/api/v1/projects', undefined, {}, 'DELETE')).status, 405);
});
test('loopback host and explicit frontend origin gate CORS and preflight', async t => {
  const origin = 'http://127.0.0.1:4420', app = await fixture(t, {origin});
  for (const host of ['evil.test:4182', '127.0.0.1:4183', '127.0.0.1.evil.test:4182', 'localhost', '127.1:4182']) assert.equal((await app.request('/api/v1/projects', undefined, {host})).status, 403);
  for (const badOrigin of ['https://evil.test', 'null', 'http://127.0.0.1:4421']) assert.equal((await app.request('/api/v1/projects', create, {origin: badOrigin})).status, 403);
  assert.equal((await app.request('/api/v1/projects', create, {origin, 'sec-fetch-site': 'cross-site'})).status, 403);
  assert.equal((await app.request('http://evil.test/api/v1/projects')).status, 403);
  const allowed = await app.request('/api/v1/projects', create, {origin});
  assert.equal(allowed.status, 201);
  assert.equal(allowed.headers['Access-Control-Allow-Origin'], origin);
  const preflight = await app.request('/api/v1/projects', undefined, {origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type'}, 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], origin);
  assert.equal((await app.request('/api/v1/projects', undefined, {origin, 'access-control-request-method': 'DELETE'}, 'OPTIONS')).status, 400);
  assert.equal((await app.request('/api/v1/projects', undefined, {origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization'}, 'OPTIONS')).status, 400);
  const defaultApp = await fixture(t);
  assert.equal((await defaultApp.request('/api/v1/projects', undefined, {origin})).status, 403);
});
test('existing queued and interrupted jobs remain untouched across service startup, reads and Brief writes', async t => {
  const app = await fixture(t);
  const seed = openStore(app.dbPath);
  const context = {actorType: 'human', actorId: 'fixture-operator', runId: 'fixture-run', contextId: 'fixture-context'};
  let p = seed.create({id: 'existing', name: 'Existing', brief: 'Seed brief', mode: 'auto'}, context);
  p = seed.command(p.id, {kind: 'confirm-task-card', taskCardId: p.activeTaskCardId, commandId: 'seed-confirm', expectedRevision: 0}, context);
  p = seed.command(p.id, {kind: 'request-stage', stage: 'research', jobId: 'queued-job', commandId: 'seed-job', expectedRevision: 1}, context);
  const before = structuredClone(p);
  seed.close();
  // An imported legacy snapshot includes both executable-looking queued work and
  // a dead owner's running attempt. The service must never claim or recover either.
  const binding = {providerId: 'synthetic-unconfigured', model: 'fixture', role: 'research-owner'};
  Object.assign(before.jobs[0], {binding, task: {id: 'legacy-task', owner: binding.role, parentId: before.id}});
  before.jobs.push({...structuredClone(before.jobs[0]), id: 'running-job', status: 'running', attemptId: 'legacy-attempt', attempts: [{id: 'legacy-attempt', executor: {actorType: 'agent', actorId: 'legacy-executor', runId: 'legacy-run', contextId: 'legacy-context', executorHost: hostname(), executorPid: 2147483647}}]});
  const db = new DatabaseSync(app.dbPath);
  db.prepare('UPDATE revisions SET snapshot=? WHERE project_id=? AND revision=?').run(JSON.stringify(before), before.id, before.revision);
  db.close();
  await app.reopen();
  const route = `/api/v1/projects/${p.id}`;
  assert.deepEqual((await app.request(route)).body.project.jobs, before.jobs);
  assert.equal((await app.request(route)).body.project.revision, before.revision);
  const saved = await app.request(`${route}/commands`, {kind: 'revise-task-card', commandId: 'new-brief', expectedRevision: p.revision, taskCardId: 'new-scope', brief: 'Updated'});
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.project.jobs, before.jobs);
  await app.reopen();
  assert.deepEqual((await app.request(route)).body.project.jobs, before.jobs);
});
test('requires explicit database and loopback-only listening configuration', () => {
  assert.throws(() => createBriefServer(), /dbPath/);
  for (const origin of ['https://127.0.0.1:4420', 'http://evil.test:4420', 'http://localhost:4420/', 'http://localhost:4420/path']) assert.throws(() => createBriefServer({dbPath: ':memory:', origin}), /origin/);
  for (const port of [0, -1, 65536, '4182']) assert.throws(() => createBriefServer({dbPath: ':memory:', port}), /port/);
});

test('shutdown waits for an accepted body before closing SQLite and rejects later requests', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-brief-close-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const dbPath = join(directory, 'projects.sqlite');
  const server = createBriefServer({dbPath});
  const req = new Readable({read() {}});
  Object.assign(req, {url: '/api/v1/projects', method: 'POST', headers: {host: '127.0.0.1:4182', 'content-type': 'application/json'}});
  let closed = false;
  const response = new Promise(resolve => server.emit('request', req, {setHeader() {}, writeHead(status) {this.status = status;}, end(body) {resolve({status: this.status, body: JSON.parse(String(body))});}}));
  const completion = close(server).then(() => {closed = true;});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, false);
  req.push(JSON.stringify(create)); req.push(null);
  assert.equal((await response).status, 201);
  await completion;
  const store = openStore(dbPath);
  assert.equal(store.list().length, 1);
  store.close();
  const lateRequest = Readable.from([]);
  Object.assign(lateRequest, {url: '/api/v1/projects', method: 'GET', headers: {host: '127.0.0.1:4182'}});
  const late = await new Promise(resolve => server.emit('request', lateRequest, {setHeader() {}, writeHead(status) {this.status = status;}, end() {resolve(this.status);}}));
  assert.equal(late, 503);
});

test('browser historical reads allow preflight only for valid revision queries', async t => {
  const origin = 'http://127.0.0.1:4422', app = await fixture(t, {origin});
  const created = await app.request('/api/v1/projects', create);
  const route = `/api/v1/projects/${created.body.project.id}`;
  const headers = {origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'content-type'};
  assert.equal((await app.request(`${route}?revision=0`, undefined, headers, 'OPTIONS')).status, 204);
  assert.equal((await app.request(`${route}?revision=0`, undefined, {origin})).status, 200);
  for (const suffix of ['?revision=-1', '?revision=0&revision=1', '?unknown=0']) assert.equal((await app.request(route + suffix, undefined, headers, 'OPTIONS')).status, 400);
  assert.equal((await app.request(`${route}/commands?revision=0`, undefined, {...headers, 'access-control-request-method': 'POST'}, 'OPTIONS')).status, 400);
});

test('new projects persist seven-stage protocol and current r7 capability without enabling execution', async t => {
  const app=await fixture(t), created=await app.request('/api/v1/projects',create), p=created.body.project;
  assert.equal(p.workflow.version,'proposal-seven-v1');
  assert.deepEqual(p.workflow.stages,['brief','research','strategy','themes','visual','layout','delivery']);
  const caps=(await app.request('/api/v1/capabilities')).body;
  assert.equal(caps.research.executionAllowed,false); assert.equal(caps.research.configured,false);
  assert.equal(caps.research.method.version,'r7-20261109'); assert.match(caps.research.method.sha256,/^[a-f0-9]{64}$/);
  const workflow=(await app.request(`/api/v1/projects/${p.id}/research-workflow`)).body.workflow;
  assert.equal(workflow.artifactId,null);assert.equal(workflow.eligible,false);
  await app.reopen();assert.equal((await app.request(`/api/v1/projects/${p.id}`)).body.project.workflow.version,'proposal-seven-v1');
});
test('registered sources retain original task and unverified identity with exact replay',async t=>{
  const app=await fixture(t),p=(await app.request('/api/v1/projects',create)).body.project,route=`/api/v1/projects/${p.id}`;
  const input={title:'Synthetic supplied source',publisher:'Test author',url:'https://example.test/input',excerpt:'Test source excerpt, not actual market evidence.',intendedUse:'category',attachToClaimId:null};
  const request={input,commandId:'source-one',expectedRevision:0};
  const saved=await app.request(route+'/sources',request);assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal(saved.body.project.sourceEntries[0].verificationStatus,'unverified');assert.equal(saved.body.project.sourceEntries[0].taskCardId,p.activeTaskCardId);
  assert.equal((await app.request(route+'/sources',request)).body.receipt.replayed,true);
  assert.equal((await app.request(route+'/sources',{...request,input:{...input,excerpt:'changed'}})).status,409);
  assert.equal((await app.request(route+'/sources',{...request,actorId:'invented'})).status,400);
  assert.equal((await app.request(route)).body.project.sourceEntries.length,1);
});
test('unconfirmed and unconfigured research writes never create jobs or advance strategy',async t=>{
  const app=await fixture(t),p=(await app.request('/api/v1/projects',create)).body.project,route=`/api/v1/projects/${p.id}`;
  const body={sourceEntryIds:[],commandId:'research',expectedRevision:0};
  assert.equal((await app.request(route+'/research-jobs',body)).body.error.code,'SCOPE_UNCONFIRMED');
  await app.request(route+'/commands',{kind:'confirm-task-card',taskCardId:p.activeTaskCardId,commandId:'confirm',expectedRevision:0});
  const result=await app.request(route+'/research-jobs',{...body,expectedRevision:1});
  assert.equal(result.status,422);assert.equal(result.body.error.code,'RESEARCH_EXECUTION_UNAVAILABLE');
  const current=(await app.request(route)).body;
  assert.equal(current.project.jobs.length,0);assert.equal(current.view.proposalWorkflow.research.status,'not_started');
  assert.equal((await app.request(route+'/research-release',{artifactId:'missing',contentHash:'0'.repeat(64),basisHash:'0'.repeat(64),policyVersion:1,commandId:'release',expectedRevision:1})).status,422);
});
