import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp, realpath, rm, readdir, readFile, writeFile, chmod, stat, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadImageProvider} from './image-api-provider.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {createServer} from './server.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');
const key = 'test-only-credential-742389ab';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const success = () => ({data: [{b64_json: png.toString('base64')}]});
const reference = (imageId, bytes = png, mediaType = 'image/png') => ({imageId, sha256: hash(bytes), byteLength: bytes.length, mediaType, bytes});
function configuration(baseUrl, overrides = {}) {
  return {providerId: 'fixture', adapter: 'openai-images-v1', baseUrl, model: 'fixture-model', credentialEnv: 'FIXTURE_IMAGE_CREDENTIAL', operations: {generate: true, edit: true}, supportedOptions: {generate: {size: ['1024x1024'], response_format: ['b64_json']}, edit: {quality: ['high']}}, timeoutMs: 2000, ...overrides};
}
function task(provider, overrides = {}) {
  return {protocol: 'image-candidate-v1', projectId: 'p1', jobId: 'j1', candidateId: 'c1', attemptId: 'a1', binding: provider.capability().binding, operation: {kind: 'generate', prompt: 'A fixture shape', options: {}}, ...overrides};
}
async function fixture(t, handler = (_req, res) => res.end(JSON.stringify(success())), overrides = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'image-api-test-')));
  let count = 0;
  const requests = [];
  const server = http.createServer(async (req, res) => {
    count++;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const record = {url: req.url, headers: req.headers, bytes: Buffer.concat(chunks)};
    requests.push(record);
    res.setHeader('Content-Type', 'application/json');
    handler(record, res);
  });
  t.after(async () => { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await rm(dir, {recursive: true, force: true}); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const config = configuration(`http://127.0.0.1:${server.address().port}/v1`, overrides);
  const provider = loadImageProvider({config, allowLoopbackHttp: true, resolveCredential: name => { assert.equal(name, 'FIXTURE_IMAGE_CREDENTIAL'); return key; }});
  return {dir, provider, server, config, requests, count: () => count};
}
async function run(f, overrides = {}, options = {}) {
  const input = task(f.provider, overrides);
  const prepared = await f.provider.prepare(input, options.inputs ?? []);
  assert.equal(prepared.kind, 'prepared');
  const result = await f.provider.execute(prepared, {evidenceDir: join(f.dir, 'evidence'), signal: options.signal});
  return {input, prepared, result};
}
async function savedFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const values = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) values.push(...await savedFiles(path));
    else values.push({path, bytes: await readFile(path)});
  }
  return values;
}

test('generation sends actual bounded JSON, keeps model facts distinct and recovers without network', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({...success(), model: 'reported-model', id: 'request-1', usage: {input_tokens: 12, output_tokens: 24, total_tokens: 36}})));
  const {input, prepared, result} = await run(f, {operation: {kind: 'generate', prompt: 'A fixture shape', options: {size: '1024x1024', response_format: 'b64_json'}}});
  assert.equal(result.kind, 'image'); assert.deepEqual(result.bytes, png);
  assert.equal(f.count(), 1);
  assert.equal(f.requests[0].url, '/v1/images/generations');
  assert.equal(f.requests[0].headers.authorization, `Bearer ${key}`);
  assert.deepEqual(JSON.parse(f.requests[0].bytes), {model: 'fixture-model', prompt: 'A fixture shape', n: 1, size: '1024x1024', response_format: 'b64_json'});
  assert.equal(result.receipt.binding.model, 'fixture-model'); assert.equal(result.receipt.reportedModel, 'reported-model'); assert.equal(result.receipt.cost, null);
  assert.equal(result.receipt.generated.sha256, hash(png));
  const files = await savedFiles(join(f.dir, 'evidence'));
  assert.equal(files.length, 5);
  for (const {path, bytes} of files) { assert.equal((await stat(path)).mode & 0o777, 0o400); assert.equal(bytes.includes(Buffer.from(key)), false); }
  assert.equal(f.provider.capability().liveVerification.generate, 'not_verified');
  assert.equal((await f.provider.execute(prepared, {evidenceDir: f.dir})).kind, 'refused');
  f.server.closeAllConnections(); await new Promise(resolve => f.server.close(resolve));
  const restarted = loadImageProvider();
  const recovered = await restarted.recover(input, input.attemptId, join(f.dir, 'evidence'), {expectedEvidence: result.receipt.responseEvidence});
  assert.equal(recovered.kind, 'image'); assert.deepEqual(recovered.receipt, result.receipt); assert.deepEqual(recovered.bytes, png);
  assert.equal((await restarted.recover(input, input.attemptId, join(f.dir, 'evidence'))).kind, 'unavailable');
  assert.equal(f.count(), 1);
});

test('multipart edits contain exact ordered verified bytes and cannot silently discard references', async t => {
  const jpeg = execFileSync('python3', ['-c', "from PIL import Image; import sys; Image.new('RGB',(2,3),'red').save(sys.stdout.buffer,format='JPEG')"]);
  const f = await fixture(t);
  const inputs = [reference('img_jpeg', jpeg, 'image/jpeg'), reference('img_png')];
  const operation = {kind: 'edit', prompt: 'Respect both references', options: {quality: 'high'}, images: inputs.map(({imageId, sha256}) => ({imageId, sha256}))};
  const {result} = await run(f, {operation}, {inputs});
  assert.equal(result.kind, 'image');
  const {bytes, headers, url} = f.requests[0];
  assert.equal(url, '/v1/images/edits');
  const boundary = headers['content-type'].split('boundary=')[1];
  const parts = bytes.toString('latin1').split(`--${boundary}`).filter(part => part.includes('Content-Disposition'));
  const imageParts = parts.filter(part => part.includes('name="image[]"'));
  assert.equal(imageParts.length, 2);
  assert.deepEqual(Buffer.from(imageParts[0].split('\r\n\r\n')[1].slice(0, -2), 'latin1'), jpeg);
  assert.deepEqual(Buffer.from(imageParts[1].split('\r\n\r\n')[1].slice(0, -2), 'latin1'), png);
  assert.deepEqual(result.receipt.orderedInputs.map(item => item.imageId), ['img_jpeg', 'img_png']);
  assert.equal((await f.provider.prepare(task(f.provider, {operation}), [...inputs].reverse())).kind, 'refused');
  assert.equal((await f.provider.prepare(task(f.provider, {operation}), [])).kind, 'refused');
  assert.equal((await f.provider.prepare(task(f.provider, {operation: {...operation, kind: 'generate'}}), inputs)).kind, 'refused');
  assert.equal(f.count(), 1);
});

test('missing and invalid configuration, credential, binding and unsupported options make zero requests', async t => {
  const f = await fixture(t);
  const absent = loadImageProvider();
  assert.equal(absent.capability().configured, false);
  assert.equal((await absent.prepare({})).diagnostic, 'NOT_CONFIGURED');
  for (const config of [{...f.config, adapter: 'other'}, {...f.config, credentialEnv: undefined}, {...f.config, baseUrl: 'https://user:password@example.invalid'}, {...f.config, baseUrl: 'https://example.invalid/v1?secret=bad'}, {...f.config, baseUrl: 'https://example.invalid/v1/../secret'}, {...f.config, apiKey: key}, {...f.config, model: key}]) {
    const provider = loadImageProvider({config, allowLoopbackHttp: true, resolveCredential: () => key});
    assert.equal(provider.capability().invocationSupported, false); assert.equal((await provider.prepare({})).kind, 'refused');
    assert.equal(JSON.stringify(provider.capability()).includes(key), false);
  }
  const missing = loadImageProvider({config: f.config, allowLoopbackHttp: true, resolveCredential: () => undefined});
  assert.equal(missing.capability().configured, true); assert.equal(missing.capability().invocationSupported, false);
  assert.equal((await missing.prepare(task(f.provider))).kind, 'refused');
  for (const operation of [{kind: 'generate', prompt: 'x', options: {stream: true}}, {kind: 'generate', prompt: 'x', options: {size: 'invalid'}}, {kind: 'generate', prompt: key, options: {}}]) assert.equal((await f.provider.prepare(task(f.provider, {operation}))).kind, 'refused');
  assert.equal((await f.provider.prepare(task(f.provider, {binding: {...f.provider.capability().binding, model: 'another'}}))).kind, 'refused');
  const disabled = loadImageProvider({config: {...f.config, operations: {generate: true, edit: false}}, allowLoopbackHttp: true, resolveCredential: () => key});
  assert.equal((await disabled.prepare(task(disabled, {operation: {kind: 'edit', prompt: 'x', options: {}, images: [{imageId: 'i', sha256: hash(png)}]}}), [reference('i')])).diagnostic, 'UNSUPPORTED_OPERATION');
  assert.equal(f.count(), 0);
});

test('preflight snapshots request and image bytes and verifies full input decoding before dispatch', async t => {
  const f = await fixture(t);
  const input = reference('img_one'); input.bytes = Buffer.from(png);
  const request = task(f.provider, {operation: {kind: 'edit', prompt: 'original', options: {}, images: [{imageId: input.imageId, sha256: input.sha256}]}});
  const prepared = await f.provider.prepare(request, [input]);
  request.operation.prompt = 'mutated'; input.bytes.fill(0); prepared.request.operation.prompt = 'mutated public summary';
  assert.equal((await f.provider.execute(prepared, {evidenceDir: join(f.dir, 'evidence')})).kind, 'image');
  assert.ok(f.requests[0].bytes.includes(png)); assert.equal(f.requests[0].bytes.includes(Buffer.from('mutated')), false);
  const corrupt = Buffer.from(png); corrupt[44] ^= 255;
  const bad = reference('bad', corrupt);
  assert.equal((await f.provider.prepare(task(f.provider, {operation: {kind: 'edit', prompt: 'x', options: {}, images: [{imageId: bad.imageId, sha256: bad.sha256}]}}), [bad])).kind, 'refused');
  assert.equal(f.count(), 1);
});

for (const status of [301, 307, 401, 403, 429, 500, 503]) test(`HTTP ${status} does not retry, follow redirect, or retain secret-bearing errors`, async t => {
  const f = await fixture(t, (_req, res) => { res.writeHead(status, {Location: '/unexpected'}); res.end(key); });
  const {result} = await run(f);
  assert.equal(result.kind, status >= 400 && status < 500 ? 'rejected' : 'unknown');
  assert.equal(result.receipt.httpStatus, status); assert.equal(result.receipt.cost, null); assert.equal(f.count(), 1);
  assert.equal(JSON.stringify(result).includes(key), false); assert.equal((await readdir(f.dir)).length, 0);
});

for (const [name, handler, overrides, expected] of [
  ['deadline through body', (_req, res) => { res.write('{'); }, {timeoutMs: 80}, 'DEADLINE_EXCEEDED'],
  ['reset', (_req, res) => { res.socket.destroy(); }, {}, 'TRANSPORT_INTERRUPTED'],
  ['truncated response', (_req, res) => { res.writeHead(200, {'Content-Length': 9999}); res.end(JSON.stringify(success())); }, {timeoutMs: 120}, null],
  ['actual chunk byte limit', (_req, res) => { res.write('x'.repeat(80)); res.end('x'.repeat(80)); }, {maxResponseBytes: 100}, 'RESPONSE_TOO_LARGE'],
  ['content encoding', (_req, res) => { res.setHeader('Content-Encoding', 'gzip'); res.end(JSON.stringify(success())); }, {}, 'INVALID_RESPONSE_HEADERS'],
  ['extra outputs', (_req, res) => res.end(JSON.stringify({data: [success().data[0], success().data[0]]})), {}, 'OUTPUT_NOT_VERIFIED'],
  ['URL output', (_req, res) => res.end(JSON.stringify({data: [{url: 'https://example.invalid/image'}]})), {}, 'OUTPUT_NOT_VERIFIED'],
  ['noncanonical base64', (_req, res) => res.end(JSON.stringify({data: [{b64_json: png.toString('base64') + '\n'}]})), {}, 'OUTPUT_NOT_VERIFIED'],
  ['invalid image', (_req, res) => res.end(JSON.stringify({data: [{b64_json: Buffer.from('not an image').toString('base64')}]})), {}, 'OUTPUT_NOT_VERIFIED'],
  ['invalid UTF8', (_req, res) => res.end(Buffer.from([0xff, 0xfe])), {}, 'OUTPUT_NOT_VERIFIED'],
  ['invalid JSON', (_req, res) => res.end('{'), {}, 'OUTPUT_NOT_VERIFIED'],
]) test(`${name} leaves a single unknown attempt with no saved success`, async t => {
  const f = await fixture(t, handler, overrides);
  const {result} = await run(f);
  assert.equal(result.kind, 'unknown'); if (expected) assert.equal(result.receipt.diagnostic, expected);
  assert.equal(result.receipt.generated, null); assert.equal(f.count(), 1); assert.equal((await readdir(f.dir)).length, 0);
});

test('request limit and pre-dispatch abort refuse locally; dispatched abort is unknown', async t => {
  const f = await fixture(t, () => {});
  const tiny = loadImageProvider({config: {...f.config, maxRequestBytes: 5}, allowLoopbackHttp: true, resolveCredential: () => key});
  assert.equal((await tiny.prepare(task(tiny))).diagnostic, 'REQUEST_TOO_LARGE');
  const controller = new AbortController(); controller.abort();
  const early = await f.provider.prepare(task(f.provider));
  assert.equal((await f.provider.execute(early, {evidenceDir: f.dir, signal: controller.signal})).kind, 'refused');
  assert.equal(f.count(), 0);
  const active = new AbortController();
  const request = run(f, {}, {signal: active.signal});
  while (!f.count()) await new Promise(resolve => setTimeout(resolve, 5));
  active.abort(); const {result} = await request;
  assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'ABORTED'); assert.equal(f.count(), 1);
});

for (const echo of [key, Buffer.from(key).toString('base64'), key.replace(/./g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)]) test('safe canonical extraction preserves exact pixels but never secret-bearing raw evidence', async t => {
  const body = JSON.stringify({data: [{b64_json: png.toString('base64'), revised_prompt: echo}]}).replaceAll('\\\\u', '\\u');
  const f = await fixture(t, (_req, res) => res.end(body));
  const {input, result} = await run(f);
  assert.equal(result.kind, 'image'); assert.equal(result.receipt.rawResponseRetained, false);
  const files = await savedFiles(join(f.dir, 'evidence'));
  for (const {bytes} of files) { assert.equal(bytes.includes(Buffer.from(key)), false); assert.equal(bytes.includes(Buffer.from(hash(body))), false); }
  const raw = files.find(file => file.path.endsWith('response.json')).bytes;
  assert.deepEqual(JSON.parse(raw), success());
  assert.equal((await f.provider.recover(input, input.attemptId, join(f.dir, 'evidence'), {expectedEvidence: result.receipt.responseEvidence})).kind, 'image');
});

test('tainted allowlisted metadata or decoded image cannot be retained or hashed', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({...success(), id: key})));
  const {result} = await run(f); assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'SECRET_ECHO_REJECTED'); assert.deepEqual(await readdir(f.dir), []);
  const g = await fixture(t, (_req, res) => res.end(JSON.stringify({data: [{b64_json: Buffer.concat([png, Buffer.from(key)]).toString('base64')}]})));
  const other = await run(g); assert.equal(other.result.kind, 'unknown'); assert.equal(other.result.receipt.diagnostic, 'SECRET_ECHO_REJECTED'); assert.deepEqual(await readdir(g.dir), []);
});

test('anchored recovery rejects changed requests, missing files, corrupted and forged receipts', async t => {
  const f = await fixture(t);
  const {input, result} = await run(f);
  const opts = {expectedEvidence: result.receipt.responseEvidence};
  assert.equal((await f.provider.recover({...input, candidateId: 'changed'}, input.attemptId, join(f.dir, 'evidence'), opts)).kind, 'unavailable');
  const files = await savedFiles(join(f.dir, 'evidence'));
  const receiptFile = files.find(file => file.path.endsWith('receipt.json'));
  await chmod(receiptFile.path, 0o600);
  await writeFile(receiptFile.path, JSON.stringify({...JSON.parse(receiptFile.bytes), outcome: 'unknown'})); await chmod(receiptFile.path, 0o400);
  assert.equal((await f.provider.recover(input, input.attemptId, join(f.dir, 'evidence'), opts)).kind, 'unavailable');
  const manifestFile = files.find(file => file.path.endsWith('manifest.json'));
  const manifest = JSON.parse(manifestFile.bytes); const forged = await readFile(receiptFile.path);
  manifest.files['receipt.json'] = {sha256: hash(forged), byteLength: forged.length};
  await chmod(manifestFile.path, 0o600); await writeFile(manifestFile.path, JSON.stringify(manifest)); await chmod(manifestFile.path, 0o400);
  assert.equal((await f.provider.recover(input, input.attemptId, join(f.dir, 'evidence'), opts)).kind, 'unavailable');
  await rm(receiptFile.path);
  assert.equal((await f.provider.recover(input, input.attemptId, join(f.dir, 'evidence'), opts)).kind, 'unavailable'); assert.equal(f.count(), 1);
});

test('symlink evidence directories fail closed with safe diagnostics', async t => {
  const f = await fixture(t);
  await symlink(f.dir, join(f.dir, 'linked'));
  const prepared = await f.provider.prepare(task(f.provider));
  const result = await f.provider.execute(prepared, {evidenceDir: join(f.dir, 'linked')});
  assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'OUTPUT_NOT_VERIFIED'); assert.equal(f.count(), 1);
});

test('generated ingestion is deterministic, project-bound and conflicts on altered output or provenance', async t => {
  const f = await fixture(t);
  const {result} = await run(f);
  const store = createImageEvidenceStore({rootDir: join(f.dir, 'images')});
  const first = await store.ingestGenerated({projectId: 'p1', result});
  const restarted = createImageEvidenceStore({rootDir: join(f.dir, 'images')});
  const second = await restarted.ingestGenerated({projectId: 'p1', result});
  assert.deepEqual(second, first); assert.equal(first.provenance.representation, 'generated_image'); assert.equal(first.uploadedAt, undefined);
  assert.deepEqual((await restarted.read({projectId: 'p1', imageId: first.id})).bytes, png);
  await assert.rejects(store.ingestGenerated({projectId: 'p2', result}), /receipt/);
  await assert.rejects(store.ingest({projectId: 'p1', bytes: png, metadata: {representation: 'generated_image'}}), /representation/);
  const changed = structuredClone(result); changed.receipt.requestHash = 'f'.repeat(64);
  await assert.rejects(store.ingestGenerated({projectId: 'p1', result: changed}), /identity conflict/);
  const alternate = execFileSync('python3', ['-c', "from PIL import Image; import sys; Image.new('RGB',(2,2),'blue').save(sys.stdout.buffer,format='PNG')"]);
  const changedBytes = {...result, bytes: alternate, receipt: {...result.receipt, generated: {...result.receipt.generated, byteLength: alternate.length, sha256: hash(alternate)}}};
  await assert.rejects(store.ingestGenerated({projectId: 'p1', result: changedBytes}), /identity conflict/);
});

test('actual isolated server exposes safe configured capability, no live verification or image stage route', async t => {
  const f = await fixture(t);
  const app = createServer({dbPath: join(f.dir, 'small.sqlite'), rootDir: join(f.dir, 'executions'), imageProvider: f.provider});
  t.after(async () => { if (app.listening) await new Promise(resolve => app.close(resolve)); });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  const response = await fetch(`${base}/api/capabilities`); assert.equal(response.status, 200);
  const capabilities = await response.json();
  assert.equal(capabilities.image.configured, true); assert.equal(capabilities.image.invocationSupported, true); assert.equal(capabilities.image.stageIntegrated, false); assert.equal(capabilities.image.available, false);
  assert.equal(capabilities.image.liveVerification.generate, 'not_verified');
  assert.equal(JSON.stringify(capabilities).includes(key), false); assert.equal(JSON.stringify(capabilities).includes('FIXTURE_IMAGE_CREDENTIAL'), false);
  assert.equal((await fetch(`${base}/api/projects/p1/image-jobs`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})).status, 404);
  assert.equal(f.count(), 0);
});

test('configured backend file resolves only its named credential and never treats setup as verification', async t => {
  const f = await fixture(t);
  const configPath = join(f.dir, 'local-image-config.json');
  await writeFile(configPath, JSON.stringify({...f.config, baseUrl: 'https://fixture.invalid/v1'}));
  const names = [];
  const provider = loadImageProvider({configPath, resolveCredential: name => { names.push(name); return key; }});
  assert.deepEqual(names, ['FIXTURE_IMAGE_CREDENTIAL']);
  assert.equal(provider.capability().configured, true); assert.equal(provider.capability().invocationSupported, true);
  assert.equal(provider.capability().stageIntegrated, false); assert.equal(provider.capability().liveVerification.edit, 'not_verified');
  assert.equal(f.count(), 0);
  await writeFile(configPath, '{');
  assert.equal(loadImageProvider({configPath}).capability().reason, 'INVALID_CONFIG');
  assert.equal(loadImageProvider({configPath: join(f.dir, 'absent')}).capability().reason, 'INVALID_CONFIG');
});

test('one returned JPEG remains byte-identical and absent response facts stay unknown', async t => {
  const jpeg = execFileSync('python3', ['-c', "from PIL import Image; import sys; Image.new('RGB',(2,3),'red').save(sys.stdout.buffer,format='JPEG')"]);
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({data: [{b64_json: jpeg.toString('base64')}]})));
  const {result} = await run(f);
  assert.equal(result.kind, 'image'); assert.deepEqual(result.bytes, jpeg);
  assert.deepEqual(result.receipt.generated, {sha256: hash(jpeg), byteLength: jpeg.length, mediaType: 'image/jpeg', width: 2, height: 3});
  for (const field of ['providerRequestId', 'reportedModel', 'usage', 'cost']) assert.equal(result.receipt[field], null);
});

test('concurrent identical generated imports converge and corrupt evidence files never recover', async t => {
  const f = await fixture(t);
  const {input, result} = await run(f);
  const store = createImageEvidenceStore({rootDir: join(f.dir, 'images')});
  const assets = await Promise.all([store.ingestGenerated({projectId: 'p1', result}), store.ingestGenerated({projectId: 'p1', result})]);
  assert.deepEqual(assets[0], assets[1]);
  const files = await savedFiles(join(f.dir, 'evidence'));
  const image = files.find(file => file.path.endsWith('image.bin'));
  await chmod(image.path, 0o600); await writeFile(image.path, Buffer.from('corrupt')); await chmod(image.path, 0o400);
  assert.equal((await f.provider.recover(input, input.attemptId, join(f.dir, 'evidence'), {expectedEvidence: result.receipt.responseEvidence})).kind, 'unavailable');
  assert.equal(f.count(), 1);
});

test('safe response header request IDs survive local recovery and echoed credentials are discarded', async t => {
  const f = await fixture(t, (_req, res) => { res.setHeader('x-request-id', 'header-request-1'); res.end(JSON.stringify(success())); });
  const {input, result} = await run(f);
  assert.equal(result.receipt.providerRequestId, 'header-request-1');
  assert.equal((await f.provider.recover(input, input.attemptId, join(f.dir, 'evidence'), {expectedEvidence: result.receipt.responseEvidence})).receipt.providerRequestId, 'header-request-1');
  const g = await fixture(t, (_req, res) => { res.setHeader('x-request-id', key); res.writeHead(401); res.end(key); });
  const rejected = (await run(g)).result;
  assert.equal(rejected.kind, 'rejected'); assert.equal(rejected.receipt.providerRequestId, null); assert.equal(JSON.stringify(rejected).includes(key), false);
});

test('arbitrary response metadata is discarded even when repeated escaping hides a known credential', async t => {
  const unicode = value => [...value].map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const encodings = [key, unicode(key), unicode(unicode(key)), JSON.stringify(unicode(key)).slice(1, -1), Buffer.from(key).toString('base64'), Buffer.from(key).toString('hex'), [...Buffer.from(key)].map(byte => `%${byte.toString(16).padStart(2, '0')}`).join('')];
  for (const [index, echo] of encodings.entries()) {
    const body = JSON.stringify({data: [{b64_json: png.toString('base64'), revised_prompt: echo}], created: echo, id: 'actual-response-id', model: 'actual-model', usage: {total_tokens: 17}});
    const f = await fixture(t, (_req, res) => res.end(body));
    const {input, result} = await run(f, {attemptId: `echo-${index}`});
    assert.equal(result.kind, 'image'); assert.equal(result.receipt.rawResponseRetained, false); assert.deepEqual(result.bytes, png);
    const files = await savedFiles(join(f.dir, 'evidence'));
    const response = files.find(file => file.path.endsWith('response.json'));
    assert.deepEqual(JSON.parse(response.bytes), {...success(), id: 'actual-response-id', model: 'actual-model', usage: {total_tokens: 17}});
    const manifest = JSON.parse(files.find(file => file.path.endsWith('manifest.json')).bytes);
    assert.equal(manifest.files['response.json'].sha256, hash(response.bytes));
    assert.notEqual(manifest.files['response.json'].sha256, hash(body));
    for (const {bytes} of files) {
      assert.equal(bytes.includes(Buffer.from(echo)), false);
      assert.equal(bytes.includes(Buffer.from(hash(body))), false);
    }
    assert.equal((await f.provider.recover(input, input.attemptId, join(f.dir, 'evidence'), {expectedEvidence: result.receipt.responseEvidence})).kind, 'image');
    assert.equal(f.count(), 1);
  }
});

test('common credential representations in decoded image bytes are rejected without evidence', async t => {
  const unicode = value => [...value].map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const encodings = [key, Buffer.from(key).toString('base64'), Buffer.from(key).toString('base64url'), Buffer.from(key).toString('hex'), Buffer.from(key).toString('hex').toUpperCase(), [...Buffer.from(key)].map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''), [...Buffer.from(key)].map(byte => `%${byte.toString(16).padStart(2, '0').toUpperCase()}`).join(''), unicode(key), unicode(unicode(key)), JSON.stringify(unicode(key)).slice(1, -1), [...key].map(char => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')];
  for (const echo of encodings) {
    const bytes = Buffer.concat([png, Buffer.from(echo)]);
    const f = await fixture(t, (_req, res) => res.end(JSON.stringify({data: [{b64_json: bytes.toString('base64')}]})));
    const {result} = await run(f);
    assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'SECRET_ECHO_REJECTED');
    assert.deepEqual(await readdir(f.dir), []);
    assert.equal(JSON.stringify(result).includes(hash(bytes)), false);
  }
});

test('parsed allowlisted model, ID, numeric usage and header metadata cannot retain credential echoes', async t => {
  for (const field of ['model', 'id', 'usage']) {
    const numericKey = '84917653';
    const body = {...success(), [field]: field === 'usage' ? {total_tokens: Number(numericKey)} : numericKey};
    const f = await fixture(t, (_req, res) => res.end(JSON.stringify(body)));
    f.provider = loadImageProvider({config: f.config, allowLoopbackHttp: true, resolveCredential: () => numericKey});
    const {result} = await run(f);
    assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'SECRET_ECHO_REJECTED'); assert.deepEqual(await readdir(f.dir), []);
  }
  for (const field of ['model', 'id']) {
    for (const echo of [key, Buffer.from(key).toString('hex'), Buffer.from(key).toString('base64url')]) {
      const f = await fixture(t, (_req, res) => res.end(JSON.stringify({...success(), [field]: echo})));
      const {result} = await run(f);
      assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'SECRET_ECHO_REJECTED'); assert.deepEqual(await readdir(f.dir), []);
    }
  }
  const escapedKey = [...key].map(char => String.fromCharCode(92) + 'u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  const escapedBody = JSON.stringify({...success(), id: 'PLACEHOLDER'}).replace('PLACEHOLDER', escapedKey);
  const escapedFixture = await fixture(t, (_req, res) => res.end(escapedBody));
  const escapedResult = await run(escapedFixture);
  assert.equal(escapedResult.result.kind, 'unknown'); assert.equal(escapedResult.result.receipt.diagnostic, 'SECRET_ECHO_REJECTED'); assert.deepEqual(await readdir(escapedFixture.dir), []);
  const f = await fixture(t, (_req, res) => { res.setHeader('x-request-id', Buffer.from(key).toString('hex')); res.end(JSON.stringify(success())); });
  const {result} = await run(f);
  assert.equal(result.kind, 'image'); assert.equal(result.receipt.responseHeaderRequestId, null);
});

test('capability and preparation observe the current named credential without dispatch', async t => {
  const f = await fixture(t);
  let credential;
  const provider = loadImageProvider({config: f.config, allowLoopbackHttp: true, resolveCredential: name => { assert.equal(name, 'FIXTURE_IMAGE_CREDENTIAL'); return credential; }});
  assert.equal(provider.capability().invocationSupported, false);
  assert.equal((await provider.prepare(task(provider))).diagnostic, 'CREDENTIAL_UNAVAILABLE');
  credential = key;
  assert.equal(provider.capability().invocationSupported, true);
  credential = 'fixture-rotated-key';
  const prepared = await provider.prepare(task(provider));
  assert.equal(prepared.kind, 'prepared');
  const result = await provider.execute(prepared, {evidenceDir: join(f.dir, 'evidence')});
  assert.equal(result.kind, 'image'); assert.equal(f.requests[0].headers.authorization, `Bearer ${credential}`);
  credential = undefined;
  assert.equal(provider.capability().invocationSupported, false);
  assert.equal(provider.capability().reason, 'CREDENTIAL_UNAVAILABLE');
  assert.equal((await provider.prepare(task(provider))).diagnostic, 'CREDENTIAL_UNAVAILABLE');
  assert.equal(f.count(), 1);
});

test('removal or rotation after preparation refuses before HTTP and a new prepare uses the current key', async t => {
  for (const changed of [undefined, 'fixture-rotated-key']) {
    const f = await fixture(t);
    let credential = key;
    const provider = loadImageProvider({config: f.config, allowLoopbackHttp: true, resolveCredential: () => credential});
    const input = task(provider);
    const prepared = await provider.prepare(input);
    credential = changed;
    assert.equal(provider.capability().invocationSupported, !!changed);
    const result = await provider.execute(prepared, {evidenceDir: join(f.dir, 'evidence')});
    assert.deepEqual(result, {kind: 'refused', dispatch: 'not_started', diagnostic: changed ? 'CREDENTIAL_CHANGED' : 'CREDENTIAL_UNAVAILABLE'});
    assert.equal(f.count(), 0); assert.deepEqual(await readdir(f.dir), []);
    assert.equal((await provider.execute(prepared, {evidenceDir: f.dir})).diagnostic, 'INVALID_PREPARED_CALL');
    credential = 'fixture-current-key';
    const retry = await provider.prepare(input);
    const next = await provider.execute(retry, {evidenceDir: join(f.dir, 'evidence')});
    assert.equal(next.kind, 'image'); assert.equal(f.count(), 1); assert.equal(f.requests[0].headers.authorization, `Bearer ${credential}`);
    for (const {bytes} of await savedFiles(join(f.dir, 'evidence'))) {
      assert.equal(bytes.includes(Buffer.from(key)), false); assert.equal(bytes.includes(Buffer.from(credential)), false);
    }
    credential = undefined;
    assert.equal((await provider.recover(input, input.attemptId, join(f.dir, 'evidence'), {expectedEvidence: next.receipt.responseEvidence})).kind, 'image');
    assert.equal(f.count(), 1);
  }
});

test('credential rotation while asynchronous image preparation is running refuses locally', async t => {
  const f = await fixture(t);
  let credential = key;
  const provider = loadImageProvider({config: f.config, allowLoopbackHttp: true, resolveCredential: () => credential});
  const input = reference('input1');
  const pending = provider.prepare(task(provider, {operation: {kind: 'edit', prompt: 'fixture', options: {}, images: [{imageId: input.imageId, sha256: input.sha256}]}}), [input]);
  credential = 'fixture-rotated-key';
  assert.deepEqual(await pending, {kind: 'refused', diagnostic: 'CREDENTIAL_CHANGED'});
  assert.equal(f.count(), 0); assert.deepEqual(await readdir(f.dir), []);
});

test('official generate and edit response shapes retain exact image bytes and numeric usage details', async t => {
  const usage = {input_tokens: 4, input_tokens_details: {image_tokens: 2, text_tokens: 2}, output_tokens: 1, total_tokens: 5, output_tokens_details: {image_tokens: 1, text_tokens: 0}};
  for (const kind of ['generate', 'edit']) {
    const f = await fixture(t, (_req, res) => res.end(JSON.stringify({created: 0, background: 'transparent', data: [{...success().data[0], revised_prompt: 'fixture', url: 'https://unused.example/image'}], output_format: 'png', quality: 'low', safety_identifier: null, size: '2x2', usage})));
    const inputs = kind === 'edit' ? [reference('input')] : [];
    const operation = {kind, prompt: 'Local fixture only', options: {}, ...(kind === 'edit' ? {images: inputs.map(({imageId, sha256}) => ({imageId, sha256}))} : {})};
    const {input, result} = await run(f, {operation}, {inputs});
    assert.equal(result.kind, 'image'); assert.deepEqual(result.bytes, png);
    assert.deepEqual(result.receipt.usage, usage); assert.equal(result.receipt.rawResponseRetained, false);
    assert.equal(result.receipt.cost, null); assert.equal(result.receipt.generated.mediaType, 'image/png');
    assert.equal(f.requests[0].url, kind === 'generate' ? '/v1/images/generations' : '/v1/images/edits');
    const response = (await savedFiles(join(f.dir, 'evidence'))).find(file => file.path.endsWith('/response.json'));
    assert.deepEqual(JSON.parse(response.bytes), {...success(), usage});
    const recovered = await loadImageProvider().recover(input, input.attemptId, join(f.dir, 'evidence'), {expectedEvidence: result.receipt.responseEvidence});
    assert.equal(recovered.kind, 'image'); assert.deepEqual(recovered.bytes, png); assert.deepEqual(recovered.receipt.usage, usage);
    assert.equal(f.count(), 1); assert.equal(f.provider.capability().stageIntegrated, false);
  }
});

test('unknown additive metadata is discarded before canonical evidence without downloading result URLs', async t => {
  const f = await fixture(t, (req, res) => res.end(JSON.stringify({
    ...success(), approved: true, cost: 0, future: {nested: ['unused']},
    data: [{...success().data[0], url: `http://${req.headers.host}/must-not-download`, future: {images: ['unused']}}],
    usage: {total_tokens: 5, future: {cost: 0}, input_tokens_details: {text_tokens: 2, future: ['unused']}}
  })));
  const {result} = await run(f);
  assert.equal(result.kind, 'image'); assert.equal(result.receipt.cost, null); assert.equal(f.count(), 1);
  assert.deepEqual(result.receipt.usage, {total_tokens: 5, input_tokens_details: {text_tokens: 2}});
  const response = (await savedFiles(join(f.dir, 'evidence'))).find(file => file.path.endsWith('/response.json'));
  assert.deepEqual(JSON.parse(response.bytes), {...success(), usage: {total_tokens: 5, input_tokens_details: {text_tokens: 2}}});
  assert.equal(result.receipt.rawResponseRetained, false);
});

test('discarded additive secret metadata never changes canonical response bytes or hash', async t => {
  const echo = JSON.stringify(JSON.stringify(key));
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({
    ...success(), background: echo, output_format: echo, quality: echo, safety_identifier: echo, size: echo, future: {secret: echo},
    data: [{...success().data[0], url: echo, future: {secret: echo}}],
    usage: {total_tokens: 5, future: echo, input_tokens_details: {text_tokens: 2, future: echo}, output_tokens_details: {image_tokens: 1, future: echo}}
  })));
  const {result} = await run(f);
  assert.equal(result.kind, 'image'); assert.deepEqual(result.bytes, png);
  const expected = Buffer.from(JSON.stringify({...success(), usage: {total_tokens: 5, input_tokens_details: {text_tokens: 2}, output_tokens_details: {image_tokens: 1}}}));
  const files = await savedFiles(join(f.dir, 'evidence'));
  const response = files.find(file => file.path.endsWith('/response.json'));
  assert.deepEqual(response.bytes, expected); assert.equal(hash(response.bytes), hash(expected));
  for (const {bytes} of files) assert.equal(bytes.includes(Buffer.from(key)), false);
  assert.equal(result.receipt.rawResponseRetained, false); assert.equal(f.count(), 1);
});

test('absent or null response facts stay unknown and known usage counters are retained without estimates', async t => {
  for (const [usage, expected] of [
    [null, null], [{}, {}], [{future: 3}, {}],
    [{input_tokens: null, output_tokens: 0, total_tokens: Number.MAX_SAFE_INTEGER, input_tokens_details: null, output_tokens_details: {image_tokens: null, text_tokens: 0}}, {input_tokens: null, output_tokens: 0, total_tokens: Number.MAX_SAFE_INTEGER, input_tokens_details: null, output_tokens_details: {image_tokens: null, text_tokens: 0}}],
    [{input_tokens_details: {future: 1}}, {input_tokens_details: null}]
  ]) {
    const f = await fixture(t, (_req, res) => res.end(JSON.stringify({...success(), model: null, id: null, usage})));
    const {input, result} = await run(f);
    assert.equal(result.kind, 'image'); assert.deepEqual(result.receipt.usage, expected);
    for (const field of ['reportedModel', 'providerRequestId', 'cost']) assert.equal(result.receipt[field], null);
    const recovered = await loadImageProvider().recover(input, input.attemptId, join(f.dir, 'evidence'), {expectedEvidence: result.receipt.responseEvidence});
    assert.equal(recovered.kind, 'image'); assert.deepEqual(recovered.receipt.usage, expected); assert.equal(f.count(), 1);
  }
});

test('malformed known usage fields and detail objects leave unknown attempts without evidence', async t => {
  const invalidCounts = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', true, [], {}];
  const usages = [false, 2, 'unknown', [], {input_tokens_details: []}, {input_tokens_details: 'unknown'}, {output_tokens_details: true}];
  for (const value of invalidCounts) {
    for (const field of ['input_tokens', 'output_tokens', 'total_tokens']) usages.push({[field]: value});
    for (const detail of ['input_tokens_details', 'output_tokens_details']) {
      for (const field of ['image_tokens', 'text_tokens']) usages.push({[detail]: {[field]: value}});
    }
  }
  const bodies = usages.map(usage => JSON.stringify({...success(), usage}));
  for (const value of ['NaN', '1e400']) bodies.push(JSON.stringify({...success(), usage: {output_tokens_details: {image_tokens: 'INVALID_NUMBER'}}}).replace('"INVALID_NUMBER"', value));
  for (const body of bodies) {
    const f = await fixture(t, (_req, res) => res.end(body));
    const {result} = await run(f);
    assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'OUTPUT_NOT_VERIFIED');
    assert.equal(result.receipt.usage, null); assert.equal(result.receipt.generated, null); assert.equal(f.count(), 1);
    assert.deepEqual(await readdir(f.dir), []);
  }
});

test('known numeric credential echoes in both usage details are rejected before evidence or output hashes', async t => {
  const numericKey = '84917653';
  for (const detail of ['input_tokens_details', 'output_tokens_details']) {
    for (const field of ['image_tokens', 'text_tokens']) {
      const f = await fixture(t, (_req, res) => res.end(JSON.stringify({...success(), usage: {[detail]: {[field]: Number(numericKey)}}})));
      f.provider = loadImageProvider({config: f.config, allowLoopbackHttp: true, resolveCredential: () => numericKey});
      const {result} = await run(f);
      assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'SECRET_ECHO_REJECTED');
      assert.equal(result.receipt.generated, null); assert.equal(JSON.stringify(result).includes(numericKey), false);
      assert.deepEqual(await readdir(f.dir), []); assert.equal(f.count(), 1);
    }
  }
});

test('additive metadata does not relax the required single object and canonical base64 response shape', async t => {
  for (const body of [null, [], 'image', {}, {data: null}, {data: {}}, {data: []}, {data: [null]}, {data: [[]]}, {data: ['image']}, {data: [{url: 'https://unused.example/image'}]}, {data: [{b64_json: null}]}, {data: [{b64_json: 1}]}, {data: [{b64_json: png.toString('base64') + '\n'}]}, {data: [success().data[0], success().data[0]]}]) {
    const f = await fixture(t, (_req, res) => res.end(JSON.stringify(body)));
    const {result} = await run(f);
    assert.equal(result.kind, 'unknown'); assert.equal(result.receipt.diagnostic, 'OUTPUT_NOT_VERIFIED');
    assert.equal(result.receipt.generated, null); assert.deepEqual(await readdir(f.dir), []); assert.equal(f.count(), 1);
  }
});

test('decoded image bytes determine media type and dimensions despite contradictory unused metadata', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({...success(), output_format: 'webp', size: '999x999', quality: 'high'})));
  const {result} = await run(f);
  assert.equal(result.kind, 'image'); assert.deepEqual(result.bytes, png);
  assert.equal(result.receipt.generated.mediaType, 'image/png'); assert.equal(result.receipt.generated.width, 2); assert.equal(result.receipt.generated.height, 2);
  const webp = execFileSync('python3', ['-c', "from PIL import Image; import sys; Image.new('RGB',(2,2),'red').save(sys.stdout.buffer,format='WEBP')"]);
  const unsupported = await fixture(t, (_req, res) => res.end(JSON.stringify({data: [{b64_json: webp.toString('base64')}], output_format: 'png'})));
  const invalid = await run(unsupported);
  assert.equal(invalid.result.kind, 'unknown'); assert.equal(invalid.result.receipt.diagnostic, 'OUTPUT_NOT_VERIFIED');
  assert.deepEqual(await readdir(unsupported.dir), []);
});
