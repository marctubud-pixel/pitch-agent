import {buildStageRequest} from './stage-content.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const human = {actorType: 'human', actorId: 'human', runId: 'human', contextId: 'human'};
const author = {actorType: 'agent', actorId: 'author', runId: 'author-run', contextId: 'author-context'};
const sourceRecords = [{id: 'source', url: 'https://example.com/source', text: 'Synthetic evidence', verification: 'captured', scopeRelation: 'direct'}];
const output = {outputKind: 'research_findings', status: 'complete', title: 'Research', summary: 'Background', sections: [{heading: 'Evidence', body: 'Background detail', evidenceIds: ['source']}], claims: [{text: 'Background detail', kind: 'fact', evidenceRefs: ['source'], limitations: ['Excerpt only']}], gaps: [], evidenceClassifications: [{sourceId: 'source', scopeRelation: 'background', reason: 'Conservative interpretation'}]};

async function fixture(run) {
  const folder = await mkdtemp(join(tmpdir(), 'reconcile-runtime-'));
  const root = join(folder, 'runs');
  await mkdir(join(root, 'attempt'), {recursive: true});
  const store = openStore(join(folder, 'db'));
  let dispatches = 0;
  const executor = createExecutor({store, rootDir: root, bindings: {research: {providerId: 'codex', model: 'synthetic', role: 'researcher'}}, providers: {codex: {execute() {dispatches++; throw new Error('Recovery must not dispatch');}}}});
  try {
    store.create({id: 'p', name: 'Recovery', brief: 'Synthetic', mode: 'auto'}, human);
    const send = (command, context = human) => store.command('p', {...command, commandId: `setup-${store.read('p').revision}`, expectedRevision: store.read('p').revision}, context);
    send({kind: 'confirm-task-card', taskCardId: 'p:scope:1'});
    const jobId = executor.enqueue('p', 'research', {sourceRecords});
    send({kind: 'start-job', jobId, attemptId: 'attempt'}, author);
    const job = store.read('p').jobs[0];
    const paths = Object.fromEntries(['input', 'output', 'receipt', 'stdout'].map(name => [name, join(root, 'attempt', name + '.json')]));
    const stageRequest=buildStageRequest({stage:'research',brief:job.task.brief,sourceRecords,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis});
    const packet = {runId: 'attempt', model: 'synthetic', ...stageRequest};
    const production={...output,researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[]};
    const inputText = JSON.stringify(packet);
    const diskReceipt = {runId: 'attempt', provider: 'codex-cli', model: 'synthetic', requestedModel: 'synthetic', threadId: 'thread', inputPacketHash: hash(inputText), paths, exitCode: 0, signal: null, reason: null, error: null};
    const providerExecution = {...diskReceipt, responseText: JSON.stringify(production), parsedOutput: structuredClone(production), schemaValidated: false};
    const receipt = {...providerExecution, providerExecution, ...job.binding, attemptId: 'attempt', taskId: job.task.id};
    await writeFile(paths.input, inputText);
    await writeFile(paths.output, receipt.responseText);
    await writeFile(paths.receipt, JSON.stringify(diskReceipt));
    await writeFile(paths.stdout, '{"type":"thread.started","thread_id":"thread"}\n{"type":"turn.completed"}\n');
    await writeFile(join(root, 'attempt', 'packet.json'), JSON.stringify({projectId:'p',jobId,attemptId:'attempt',inputVersionIds:job.inputVersionIds,sourceRecords,...stageRequest}));
    send({kind: 'finish-job-error', jobId, attemptId: 'attempt', status: 'awaiting_reconciliation', error: {code: 'INVALID_STAGE_OUTPUT', message: 'Old validator'}, receipt}, author);
    const options = {commandId: 'recover', expectedRevision: store.read('p').revision, reason: 'Accept conservative source downgrade'};
    await run({folder, root, store, executor, jobId, paths, options, send, recover: (patch = {}) => executor.reconcile('p', jobId, {...options, ...patch})});
    assert.equal(dispatches, 0);
  } finally {store.close(); await rm(folder, {recursive: true, force: true});}
}

test('runtime recovery preserves frozen receipt and author and retries without files or new revisions', () => fixture(async f => {
  const before = f.store.read('p');
  const recovered = await f.recover();
  assert.equal(recovered.status, 'succeeded');
  const after = f.store.read('p');
  assert.deepEqual(recovered.attempts, before.jobs[0].attempts);
  assert.deepEqual(after.artifacts[0].author, author);
  assert.deepEqual(after.artifacts[0].executionReceipt, before.jobs[0].attempts[0].receipt);
  assert.deepEqual(after.artifacts[0].technicalReceipts.sourceCatalogue.records, sourceRecords);
  assert.equal(after.reconciliations.length, 1);
  assert.equal(after.artifacts.length, 1);
  assert.equal(after.releases.length, 0);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(hash(await readFile(after.artifacts[0].payloadRef, 'utf8')), after.artifacts[0].contentHash);
  await rm(f.paths.output);
  assert.deepEqual(await f.recover(), recovered);
  assert.deepEqual(f.store.read('p'), after);
  await assert.rejects(() => f.recover({reason: 'Changed request'}), {code: 'COMMAND_ID_REUSED'});
  assert.deepEqual(f.store.read('p', before.revision), before);
}));

for (const [name, tamper] of [
  ['changed output', f => writeFile(f.paths.output, '{}')],
  ['changed input', f => writeFile(f.paths.input, '{}')],
  ['changed provider receipt', f => writeFile(f.paths.receipt, '{"runId":"other"}')],
  ['failed completion', f => writeFile(f.paths.stdout, '{"type":"turn.failed"}')],
  ['changed frozen packet', f => writeFile(join(f.root, 'attempt', 'packet.json'), '{}')],
  ['missing output', f => rm(f.paths.output)],
  ['oversized output', f => writeFile(f.paths.output, 'x'.repeat(8 * 1024 * 1024 + 1))],
  ['nonregular output', async f => {await rm(f.paths.output); await mkdir(f.paths.output);}],
  ['symlink outside root', async f => {const outside = join(f.folder, 'outside.json'); await writeFile(outside, JSON.stringify(output)); await rm(f.paths.output); await symlink(outside, f.paths.output);}],
]) test(`runtime rejects ${name} without project mutation`, () => fixture(async f => {
  const before = f.store.read('p');
  await tamper(f);
  await assert.rejects(() => f.recover());
  assert.deepEqual(f.store.read('p'), before);
}));

test('runtime refuses stale revision without changing project', () => fixture(async f => {
  const before = f.store.read('p');
  await assert.rejects(() => f.recover({expectedRevision: before.revision - 1}), {code: 'REVISION_CONFLICT'});
  assert.deepEqual(f.store.read('p'), before);
}));

test('runtime rejects a recovery destination symlink outside execution root', () => fixture(async f => {
  const before = f.store.read('p');
  const outside = join(f.folder, 'outside-recovery');
  await mkdir(outside);
  const recoveryId = `recovery-${hash(JSON.stringify(['p', f.options.commandId]))}`;
  await symlink(outside, join(f.root, recoveryId));
  await assert.rejects(() => f.recover());
  assert.deepEqual(f.store.read('p'), before);
}));

test('runtime rejects deletion of saved provider receipt fields', () => fixture(async f => {
  const before = f.store.read('p');
  const receipt = JSON.parse(await readFile(f.paths.receipt, 'utf8'));
  delete receipt.provider;
  await writeFile(f.paths.receipt, JSON.stringify(receipt));
  await assert.rejects(() => f.recover());
  assert.deepEqual(f.store.read('p'), before);
}));

test('HTTP reconciliation accepts only recovery identifiers and rejects caller substitutions', async () => {
  const {createServer} = await import('./server.mjs');
  const {Readable} = await import('node:stream');
  const folder = await mkdtemp(join(tmpdir(), 'reconcile-http-'));
  const server = createServer({dbPath: join(folder, 'db'), rootDir: join(folder, 'runs'), uiPath: join(folder, 'ui.html')});
  async function request(path, body) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, {url: path, method: 'POST', headers: {host: '127.0.0.1:4181', 'content-type': 'application/json'}});
    return await new Promise(resolve => {
      const res = {setHeader() {}, writeHead(status) {this.status = status;}, end(payload) {resolve({status: this.status, body: JSON.parse(String(payload))});}};
      server.emit('request', req, res);
    });
  }
  try {
    const created = await request('/api/projects', {name: 'Boundary', brief: 'Synthetic', mode: 'auto'});
    const route = `/api/projects/${created.body.project.id}/reconciliations`;
    const base = {jobId: 'missing', commandId: 'recover', expectedRevision: 0, reason: 'Validate saved output'};
    for (const field of ['responseText', 'sourceRecords', 'claims', 'author', 'context', 'root', 'store', 'projectId', 'receiptHash', 'payloadRef']) {
      assert.equal((await request(route, {...base, [field]: 'forged'})).status, 400, field);
    }
    for (const patch of [{reason: ''}, {jobId: ''}, {commandId: '__proto__'}, {expectedRevision: -1}, {expectedRevision: 0.5}]) {
      assert.equal((await request(route, {...base, ...patch})).status, 400);
    }
  } finally {await server.drain(); server.emit('close'); await rm(folder, {recursive: true, force: true});}
});
