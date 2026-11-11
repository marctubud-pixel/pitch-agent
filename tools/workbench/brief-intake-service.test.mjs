import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, readFile, writeFile, chmod, rm, unlink, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from './store.mjs';
import {cardHash} from './intake-contract.mjs';
import {createBriefIntakeService} from './brief-intake-service.mjs';

const human = {actorType: 'human', actorId: 'local-operator', runId: 'ui', contextId: 'local'};
async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'brief-original-'))), db = join(directory, 'db.sqlite'), rootDir = join(directory, 'originals');
  let store = openStore(db);
  store.create({id: 'alpha', name: 'Originals', brief: '原始任务', workflowVersion: 'proposal-seven-v1'}, human);
  store.create({id: 'beta', name: 'Other', brief: '其他任务', workflowVersion: 'proposal-seven-v1'}, human);
  const service = () => createBriefIntakeService({store, rootDir});
  t.after(async () => {store.close(); await rm(directory, {recursive: true, force: true});});
  const bytes = await readFile(new URL('./fixtures/intake/mixed.pdf', import.meta.url));
  return {bytes, rootDir, service, get store() {return store;},
    request(commandId = 'upload', extra = {}) {const p = store.read('alpha'), card = p.taskCards.find(c => c.id === p.activeTaskCardId); return {commandId, expectedRevision: p.revision, originalFilename: '原件.pdf', taskCardId: card.id, taskCardHash: cardHash(card), ...extra};},
    reopen() {store.close(); store = openStore(db);},
  };
}
const fails = code => error => error.code === code;

test('unconfirmed task stores actual PDF bytes without extraction or adoption and survives reopen', async t => {
  const f = await fixture(t), req = f.request('save', {metadata: {lastModified: 1234, note: '品牌原件，未核实', clientResourceId: 'selection-uuid', declaredMediaType: ''}});
  const uploaded = await f.service().upload('alpha', req, f.bytes);
  assert.equal(uploaded.receipt.replayed, false);
  assert.equal(uploaded.document.isCurrent, true);
  assert.deepEqual(uploaded.document.metadata, req.metadata);
  assert.equal(uploaded.document.mediaType, 'application/pdf');
  assert.equal(uploaded.document.byteLength, f.bytes.length);
  assert.equal(uploaded.document.localExtractionStatus, 'queued');
  assert.equal(uploaded.document.modelReading, 'not_verified');
  assert.equal(uploaded.document.humanAdoption, 'not_verified');
  assert.equal(f.store.read('alpha').confirmations.length, 0);
  assert.equal(f.store.read('alpha').jobs.length, 1);
  assert.equal(f.store.read('alpha').jobs[0].status, 'queued');
  assert.equal(f.store.read('alpha').jobs[0].attempts.length, 0);
  f.reopen();
  assert.deepEqual((await f.service().read('alpha', uploaded.documentId)).bytes, f.bytes);
  const listed = await f.service().list('alpha');
  assert.deepEqual(listed.documents, [uploaded.document]);
  assert.equal(JSON.stringify(listed).includes(f.rootDir), false);
  assert.deepEqual(f.service().capability().mediaTypes, ['application/pdf']);
  assert.equal(f.service().capability().modelExtractionAvailable, false);
});

test('lost response replay retains exact body and bytes, without another job or version', async t => {
  const f = await fixture(t), req = f.request();
  await f.service().upload('alpha', req, f.bytes);
  const saved = f.store.read('alpha');
  f.reopen();
  const replay = await f.service().upload('alpha', req, f.bytes);
  assert.deepEqual(replay.receipt, {commandId: req.commandId, replayed: true});
  assert.deepEqual(f.store.read('alpha'), saved);
  await assert.rejects(f.service().upload('alpha', {...req, originalFilename: '别的.pdf'}, f.bytes), fails('COMMAND_ID_REUSED'));
  await assert.rejects(f.service().upload('alpha', req, Buffer.concat([f.bytes, Buffer.from('changed')])), fails('COMMAND_ID_REUSED'));
  await assert.rejects(f.service().upload('alpha', {...req, metadata: {note: 'changed'}}, f.bytes), fails('COMMAND_ID_REUSED'));
});

test('project ownership prevents reading another project original', async t => {
  const f = await fixture(t), saved = await f.service().upload('alpha', f.request(), f.bytes);
  assert.deepEqual((await f.service().list('beta')).documents, []);
  await assert.rejects(f.service().read('beta', saved.documentId), fails('NOT_FOUND'));
  await assert.rejects(f.service().upload('beta', f.request('foreign', {expectedRevision: 0}), f.bytes), fails('STALE_TASK_CARD'));
  assert.equal(f.store.read('beta').revision, 0);
});

test('task revision marks retained original stale; historical same-body replay remains safe', async t => {
  const f = await fixture(t), request = f.request(), saved = await f.service().upload('alpha', request, f.bytes);
  f.store.command('alpha', {kind: 'revise-task-card', commandId: 'revise', expectedRevision: 1, taskCardId: 'alpha-new', brief: '新任务'}, human);
  await assert.rejects(f.service().upload('alpha', {...request, commandId: 'new-old', expectedRevision: 2}, f.bytes), fails('STALE_TASK_CARD'));
  await assert.rejects(f.service().upload('alpha', {...f.request('stale-revision'), expectedRevision: 0}, f.bytes), fails('REVISION_CONFLICT'));
  const old = await f.service().read('alpha', saved.documentId);
  assert.equal(old.document.isCurrent, false);
  assert.deepEqual(old.bytes, f.bytes);
  const replayed = await f.service().upload('alpha', request, f.bytes);
  assert.equal(replayed.document.isCurrent, false);
  assert.equal(replayed.receipt.replayed, true);
  assert.equal(f.store.read('alpha').revision, 2);
});

test('corrupted saved bytes are rejected by read, list and replay without generating replacement', async t => {
  const f = await fixture(t), req = f.request(), result = await f.service().upload('alpha', req, f.bytes);
  const original = join(f.rootDir, 'intake', 'objects', result.document.sha256);
  await chmod(original, 0o600); const corrupt = Buffer.from(f.bytes); corrupt[8] ^= 1; await writeFile(original, corrupt);
  for (const call of [() => f.service().read('alpha', result.documentId), () => f.service().list('alpha'), () => f.service().upload('alpha', req, f.bytes)]) {
    await assert.rejects(call(), fails('DOCUMENT_CORRUPT'));
  }
  assert.equal(f.store.read('alpha').revision, 1);
  assert.equal(f.store.read('alpha').jobs[0].attempts.length, 0);
});

test('symlink substitution cannot replace a managed original', async t => {
  const f = await fixture(t), result = await f.service().upload('alpha', f.request(), f.bytes);
  const original = join(f.rootDir, 'intake', 'objects', result.document.sha256), replacement = join(f.rootDir, 'replacement.pdf');
  await writeFile(replacement, f.bytes); await unlink(original); await symlink(replacement, original);
  await assert.rejects(f.service().read('alpha', result.documentId), fails('DOCUMENT_CORRUPT'));
});

test('strict request boundary rejects unsupported MIME, spoofed fields and malformed metadata', async t => {
  const f = await fixture(t), req = f.request();
  await assert.rejects(f.service().upload('alpha', req, await readFile(new URL('./fixtures/intake/blue.png', import.meta.url))), fails('INPUT_UNSUPPORTED'));
  await assert.rejects(f.service().upload('alpha', {...req, mediaType: 'application/pdf'}, f.bytes), fails('INVALID_REQUEST'));
  await assert.rejects(f.service().upload('alpha', {...req, taskCardHash: 123}, f.bytes), fails('INVALID_REQUEST'));
  await assert.rejects(f.service().upload('alpha', {...req, metadata: {adopted: true}}, f.bytes), fails('INVALID_REQUEST'));
  await assert.rejects(f.service().upload('alpha', {...req, metadata: {lastModified: -1}}, f.bytes), fails('INVALID_REQUEST'));
  await assert.rejects(f.service().upload('alpha', {...req, originalFilename: 'bad\r\n.pdf'}, f.bytes), fails('INVALID_REQUEST'));
  assert.equal(f.store.read('alpha').revision, 0);
});

test('selection identity cannot be reassigned to different bytes or metadata under a fresh command', async t => {
  const f = await fixture(t), metadata = {clientResourceId: 'choice-1', lastModified: 123, declaredMediaType: 'application/pdf', note: '来源'};
  await f.service().upload('alpha', f.request('original', {metadata}), f.bytes);
  await assert.rejects(f.service().upload('alpha', f.request('other-bytes', {metadata}), Buffer.concat([f.bytes, Buffer.from('x')])), fails('CLIENT_RESOURCE_ID_REUSED'));
  await assert.rejects(f.service().upload('alpha', f.request('other-note', {metadata: {...metadata, note: '换说明'}}), f.bytes), fails('CLIENT_RESOURCE_ID_REUSED'));
  assert.equal(f.store.read('alpha').revision, 1);
});

test('client selections reject metadata that the brand UI cannot represent before saving', async t => {
  const f = await fixture(t), metadata = {clientResourceId: 'choice-1', lastModified: 123, declaredMediaType: 'application/pdf', note: ''};
  for (const fields of [{metadata: {...metadata, note: '字'.repeat(1001)}}, {metadata, originalFilename: `${'x'.repeat(252)}.pdf`}, {metadata, originalFilename: 'folder/file.pdf'}, {metadata, originalFilename: 'not-a-pdf.txt'}]) {
    await assert.rejects(f.service().upload('alpha', f.request('invalid', fields), f.bytes), fails('INVALID_REQUEST'));
    assert.equal(f.store.read('alpha').revision, 0);
  }
  const ordinary = await f.service().upload('alpha', f.request('ordinary', {metadata: {note: '字'.repeat(1001)}}), f.bytes);
  assert.equal(ordinary.document.metadata.note.length, 1001);
  assert.equal(f.store.read('alpha').revision, 1);
});
