import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp, rm, writeFile, readFile, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync,appendFileSync,openSync,fsyncSync,closeSync,mkdtempSync,realpathSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {createCodexProvider, parseCodexEvents, parseCodexRateLimit} from './codex-provider.mjs';

// Synthetic process fixtures; these tests never call a model or claim authentication.
const events = [
  {type: 'thread.started', thread_id: 'fixture-thread-id'},
  {type: 'item.completed', item: {type: 'agent_message', text: '{"ok":true}'}},
  {type: 'turn.completed', usage: {input_tokens: 42, cached_input_tokens: 10, output_tokens: 7}},
].map(event => JSON.stringify(event)).join('\n');
let ownedLedgerRoot;
after(() => { if (ownedLedgerRoot) rmSync(ownedLedgerRoot, {recursive: true, force: true}); });
function countFake() {
  let ledger = process.env.FINAL_FAKE_SPAWN_LEDGER;
  if (!ledger) {
    if (!ownedLedgerRoot) {
      ownedLedgerRoot = realpathSync(mkdtempSync(join(tmpdir(), 'final-fake-spawn-ledger-')));
      writeFileSync(join(ownedLedgerRoot, 'fake-spawns.jsonl'), '', {flag: 'wx', mode: 0o600});
    }
    ledger = join(ownedLedgerRoot, 'fake-spawns.jsonl');
  }
  const count = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).length;
  assert.ok(count < 64, 'cumulative fake subprocess cap');
  appendFileSync(ledger, JSON.stringify({fixture: 'synthetic_not_real_project', entry: count + 1}) + '\n');
  const fd = openSync(ledger, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function fakeSpawn({exitCode = 0, output = '{"ok":true}', hang = false, stdout = events, stderr = 'synthetic diagnostic'} = {}, calls = []) {
  return (binary, args, options) => {
    countFake();
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    let input = '';
    child.stdin.on('data', chunk => { input += chunk; });
    child.kill = signal => { queueMicrotask(() => child.emit('close', null, signal)); return true; };
    calls.push({binary, args, options, get input() { return input; }});
    child.stdin.on('finish', () => {
      child.stderr.write(stderr);
      if (hang) return;
      setImmediate(async () => {
        if (args[0] === '--version') child.stdout.write('codex-cli synthetic-test-version\n');
        else {
          child.stdout.write(stdout);
          if (output !== null) await writeFile(args[args.indexOf('-o') + 1], output);
        }
        child.emit('close', exitCode, null);
      });
    });
    return child;
  };
}
async function fixture(t, options = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'codex-provider-test-'));
  t.after(() => rm(rootDir, {recursive: true, force: true}));
  return createCodexProvider({rootDir, binary: process.execPath, model: 'configured-model', timeoutMs: 1000, ...options});
}

test('executes fresh isolated context, retains packet, usage and actual thread identity', async t => {
  const calls = [];
  const provider = await fixture(t, {spawn: fakeSpawn({}, calls)});
  const prompt = 'Do not execute $(touch /tmp/injected); `echo bad`';
  const result = await provider.execute({runId: '../../outside', prompt, outputSchema: {type: 'object'}});
  assert.equal(result.providerRequestId, 'fixture-thread-id');
  assert.deepEqual(result.usage, {input_tokens: 42, cached_input_tokens: 10, output_tokens: 7});
  assert.equal(result.cost, null);
  assert.equal(result.reportedModel, null);
  assert.equal(result.schemaValidated, false);
  assert.deepEqual(result.parsedOutput, {ok: true});
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].input, prompt);
  assert.equal(calls[0].args.at(-1), '-');
  for (const flag of ['--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--json']) assert.ok(calls[0].args.includes(flag));
  assert.equal(calls[0].args[0], 'exec');
  assert.equal(calls[0].args[calls[0].args.indexOf('-s') + 1], 'read-only');
  assert.ok(!calls[0].args.includes(prompt));
  assert.equal(JSON.parse(await readFile(result.paths.input, 'utf8')).prompt, prompt);
  assert.equal(JSON.parse(await readFile(result.paths.receipt, 'utf8')).threadId, result.threadId);
  const again = await provider.execute({runId: '../../outside', prompt});
  assert.notEqual(again.paths.runDir, result.paths.runDir);
});

const retryLine = (delay = '303.999936791s', timestamp = '2026-10-25T14:52:08.143251Z') => `${timestamp}  WARN codex_core::responses_retry: stream disconnected - retrying sampling request (1/5 in ${delay})... turn_id=01a1738c-1594-7480-b053-5f6022575a5d retries=1 max_retries=5 sampling_error=exceeded retry limit, last status: 429 Too Many Requests`;

test('recognized CLI rate-limit observations retain bounded delay and line hash without log contents', () => {
  const line = retryLine();
  assert.deepEqual(parseCodexRateLimit(line), {status: 429, retryAfterMs: 304000, source: 'codex_cli_stderr', evidenceHash: createHash('sha256').update(line).digest('hex'), observedAt: '2026-10-25T14:52:08.143Z'});
  assert.equal(parseCodexRateLimit(retryLine('12.5ms')).retryAfterMs, 13);
  assert.equal(parseCodexRateLimit(retryLine('86400s')).retryAfterMs, 86400000);
  assert.equal(parseCodexRateLimit(`${line}\n${retryLine('124.999901417s')}`).retryAfterMs, 125000);
  for (const timestamp of ['unknown', '2026-02-30T14:52:08Z', '2026-10-25T25:00:00Z']) {
    const observation = parseCodexRateLimit(retryLine('1s', timestamp));
    assert.equal(observation.status, 429);
    assert.equal('observedAt' in observation, false);
  }
});

test('malformed and unrelated logs cannot invent a rate-limit status', () => {
  for (const text of [
    '429 Too Many Requests', 'WARN model list refresh failed, status 429',
    retryLine().replace('responses_retry', 'unrelated'),
    retryLine().replace('429 Too Many Requests', '500 Internal Server Error'),
    retryLine().replace('max_retries=5', 'max_retries=6'),
    retryLine().slice(0, -1), retryLine() + ' secret suffix',
    retryLine('1s', 'x'.repeat(4096)),
    ...['NaNs', 'Infinitys', '-1s', '0s', '1e3s', '86400.001s', '9'.repeat(400) + 's', '.5s'].map(delay => retryLine(delay)),
  ]) assert.equal(parseCodexRateLimit(text), undefined, text.slice(0, 120));
});

test('429 before the process deadline remains one uncertain invocation with unchanged input bytes', async t => {
  const calls = [];
  const line = retryLine();
  const provider = await fixture(t, {timeoutMs: 15, spawn: fakeSpawn({hang: true, stderr: `${line}\n`}, calls)});
  const prompt = 'Exact prompt bytes\n';
  const outputSchema = {type: 'object'};
  let error;
  await assert.rejects(provider.execute({runId: 'rate-limited-timeout', prompt, outputSchema}), caught => { error = caught; return true; });
  assert.equal(error.code, 'INVOCATION_UNCERTAIN');
  assert.equal(error.status, 'awaiting_reconciliation');
  assert.equal(error.receipt.reason, 'timeout');
  assert.equal(error.receipt.signal, 'SIGKILL');
  assert.deepEqual(error.receipt.rateLimit, parseCodexRateLimit(line));
  const packet = JSON.stringify({runId: 'rate-limited-timeout', model: 'configured-model', prompt, outputSchema});
  assert.equal(await readFile(error.receipt.paths.input, 'utf8'), packet);
  assert.equal(await readFile(error.receipt.paths.schema, 'utf8'), JSON.stringify(outputSchema));
  assert.equal(error.receipt.inputPacketHash, createHash('sha256').update(packet).digest('hex'));
  assert.deepEqual(JSON.parse(await readFile(error.receipt.paths.receipt, 'utf8')), error.receipt);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, prompt);
});

test('successful completion after 429 retains only a historical observation and does not retry', async t => {
  const calls = [];
  const provider = await fixture(t, {spawn: fakeSpawn({stderr: retryLine('124.999901417s')}, calls)});
  const result = await provider.execute({runId: 'successful-after-429', prompt: 'x'});
  assert.equal(result.reason, null);
  assert.equal(result.exitCode, 0);
  assert.equal(result.responseText, '{"ok":true}');
  assert.equal(result.rateLimit.retryAfterMs, 125000);
  assert.equal('cooldownUntil' in result, false);
  assert.equal(calls.length, 1);
  const plain = await (await fixture(t, {spawn: fakeSpawn()})).execute({runId: 'plain', prompt: 'x'});
  assert.equal('rateLimit' in plain, false);
  assert.equal('rateLimit' in JSON.parse(await readFile(plain.paths.receipt, 'utf8')), false);
});

test('offline actual CLI corpus distinguishes five uncertain calls from two successful historical 429s without rewriting evidence', {skip: !process.env.WORKBENCH_RATE_LIMIT_CORPUS}, async t => {
  const resultPath = process.env.WORKBENCH_RATE_LIMIT_CORPUS;
  const resultBytes = await readFile(resultPath);
  const result = JSON.parse(resultBytes);
  const attempts = result.project.jobs.flatMap(job => job.attempts).filter(attempt => attempt.executor.actorId.startsWith('creative-worker:'));
  assert.equal(attempts.length, 14);
  const before = new Map([[resultPath, resultBytes]]);
  const signals = [];
  for (const attempt of attempts) {
    for (const [key, path] of Object.entries(attempt.receipt.paths)) {
      if (key === 'runDir' || path === null) continue;
      try { before.set(path, await readFile(path)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; before.set(path, null); }
    }
    const observation = parseCodexRateLimit(before.get(attempt.receipt.paths.stderr).toString('utf8'));
    if (observation) signals.push({attempt, observation});
  }
  const unknown = signals.filter(({attempt}) => attempt.status === 'awaiting_reconciliation');
  const successful = signals.filter(({attempt}) => attempt.status === 'succeeded');
  assert.equal(signals.length, 7);
  assert.equal(unknown.length, 5);
  assert.equal(successful.length, 2);
  for (const {attempt, observation} of unknown) {
    assert.equal(attempt.receipt.reason, 'timeout');
    assert.ok(observation.retryAfterMs > 180000);
  }
  assert.deepEqual(successful.map(({observation}) => observation.retryAfterMs).sort((a, b) => a - b), [124000, 125000]);
  for (const [path, bytes] of before) {
    if (bytes === null) await assert.rejects(readFile(path), {code: 'ENOENT'});
    else assert.deepEqual(await readFile(path), bytes);
  }
  t.diagnostic(`Read-only corpus verified 14 attempts, 5 uncertain 429s above 180000 ms, 2 successful historical 429s at 124000/125000 ms, and ${before.size} unchanged evidence paths.`);
});

test('availability checks executable and version without claiming authenticated access', async t => {
  const provider = await fixture(t, {spawn: fakeSpawn()});
  const result = await provider.availability();
  assert.equal(result.available, true);
  assert.equal(result.authenticationVerified, false);
  assert.equal(result.authenticated, false);
  const missing = await fixture(t, {binary: '/nonexistent/codex'});
  assert.equal((await missing.availability()).available, false);
  await assert.rejects(missing.execute({runId: 'r', prompt: 'x'}), {code: 'BINARY_UNAVAILABLE', status: 'blocked'});
});

test('nonzero exit retains diagnostic receipt and cannot succeed', async t => {
  const provider = await fixture(t, {spawn: fakeSpawn({exitCode: 1})});
  await assert.rejects(provider.execute({runId: 'r', prompt: 'x'}), error => {
    assert.equal(error.code, 'PROVIDER_FAILED');
    assert.equal(error.receipt.exitCode, 1);
    return true;
  });
});

test('timeout is uncertain and never retries', async t => {
  const calls = [];
  const provider = await fixture(t, {timeoutMs: 10, spawn: fakeSpawn({hang: true}, calls)});
  await assert.rejects(provider.execute({runId: 'r', prompt: 'x'}), {code: 'INVOCATION_UNCERTAIN', status: 'awaiting_reconciliation'});
  assert.equal(calls.length, 1);
});

test('absent output and malformed JSON fail validation', async t => {
  for (const output of [null, '', 'not JSON']) {
    const provider = await fixture(t, {spawn: fakeSpawn({output})});
    await assert.rejects(provider.execute({runId: 'r', prompt: 'x', outputSchema: {type: 'object'}}), {code: 'INVALID_OUTPUT'});
  }
});

test('missing completion, explicit error, and bounded capture cannot become success', async t => {
  for (const [stdout, code] of [
    ['{"type":"thread.started","thread_id":"x"}', 'INVOCATION_UNCERTAIN'],
    [events + '\n{"type":"turn.failed"}', 'PROVIDER_FAILED'],
    ['x'.repeat(4 * 1024 * 1024 + 1), 'INVOCATION_UNCERTAIN'],
  ]) {
    const provider = await fixture(t, {spawn: fakeSpawn({stdout})});
    await assert.rejects(provider.execute({runId: 'r', prompt: 'x'}), {code});
  }
});

test('JSONL parser extracts actual CLI event shape and rejects invented usage', () => {
  assert.deepEqual(parseCodexEvents('diagnostic\n' + events), {threadId: 'fixture-thread-id', usage: {input_tokens: 42, cached_input_tokens: 10, output_tokens: 7}, completed: true, failed: false});
  assert.deepEqual(parseCodexEvents('{"type":"turn.completed","usage":{"input_tokens":-1,"output_tokens":"7","cost":0}}').usage, {});
});

test('ordered real attachment bytes bind packet and receipt; mismatch fails before spawn', async t => {
  const rootDir = await realpath(await mkdtemp(join(tmpdir(), 'codex-images-test-')));
  t.after(() => rm(rootDir, {recursive: true, force: true}));
  const store = createImageEvidenceStore({rootDir: join(rootDir, 'assets')});
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');
  const images = [];
  for (let index = 0; index < 2; index++) {
    const asset = await store.ingest({projectId: 'p', bytes, metadata: {representation: 'screenshot', originalFilename: `ignored-${index}.png`}});
    images.push((await store.read({projectId: 'p', imageId: asset.id})).descriptor);
  }
  const calls = [];
  const provider = await fixture(t, {spawn: fakeSpawn({}, calls)});
  await assert.rejects(provider.execute({runId: 'bad', prompt: 'observe', images: [{...images[0], sha256: '0'.repeat(64)}]}), /hash/);
  assert.equal(calls.length, 0);
  const result = await provider.execute({runId: 'images', prompt: 'observe', images});
  assert.equal(result.images.length, 2);
  const args = calls[0].args;
  assert.deepEqual(args.filter((arg, index) => index > 0 && args[index - 1] === '--image'), result.images.map(image => image.path));
  for (const [index, attachment] of result.images.entries()) {
    assert.equal(attachment.imageId, images[index].imageId);
    assert.notEqual(attachment.path, images[index].path);
    assert.deepEqual(await readFile(attachment.path), bytes);
  }
  const packet = await readFile(result.paths.input, 'utf8');
  assert.equal(result.inputPacketHash, createHash('sha256').update(packet).digest('hex'));
  assert.deepEqual(JSON.parse(packet).images.map(image => image.imageId), images.map(image => image.imageId));
  assert.deepEqual(JSON.parse(await readFile(result.paths.receipt, 'utf8')).images, result.images);
  const reversed = await provider.execute({runId: 'images', prompt: 'observe', images: [...images].reverse()});
  assert.notEqual(reversed.inputPacketHash, result.inputPacketHash);
  const plain = await provider.execute({runId: 'plain', prompt: 'text'});
  assert.equal('images' in plain, false);
  assert.deepEqual(JSON.parse(await readFile(plain.paths.input, 'utf8')), {runId: 'plain', model: 'configured-model', prompt: 'text'});
});

test('final text operation captures invocation before fake effect and retains exact invalid UTF-8 output', async t=>{
 const calls=[],provider=await fixture(t,{spawn:fakeSpawn({},calls)});
 await assert.rejects(provider.execute({runId:'f',operation:'final-review-v1',prompt:'x'}),/schema/);
 await assert.rejects(provider.execute({runId:'f',operation:'other',prompt:'x',outputSchema:{type:'object'}}),/operation/);
 assert.equal(calls.length,0);
 const output=Buffer.from([0xff,0x7b,0x7d]),bad=await fixture(t,{spawn:fakeSpawn({output},calls)});let receipt;
 await assert.rejects(bad.execute({runId:'f',operation:'final-review-v1',prompt:'unchanged',outputSchema:{type:'object'}}),e=>{receipt=e.receipt;return e.code==='INVALID_OUTPUT';});
 assert.deepEqual(await readFile(receipt.paths.output),output);const invocation=JSON.parse(await readFile(receipt.paths.invocation));assert.deepEqual(invocation.argv,calls[0].args);assert.equal(invocation.stdin.sha256,createHash('sha256').update('unchanged').digest('hex'));assert.equal(receipt.operation,'final-review-v1');assert.equal(JSON.parse(await readFile(receipt.paths.input)).operation,'final-review-v1');
});


test('optional reasoning effort reaches CLI and receipts without changing the evidence packet', async t => {
  const calls = [];
  const provider = await fixture(t, {reasoningEffort: 'medium', spawn: fakeSpawn({}, calls)});
  assert.equal(provider.reasoningEffort, 'medium');
  assert.throws(() => { provider.reasoningEffort = 'high'; }, TypeError);
  assert.equal(provider.reasoningEffort, 'medium');
  const request = {runId: 'effort-test', prompt: 'Frozen evidence', outputSchema: {type: 'object'}};
  const result = await provider.execute(request);
  assert.equal(calls[0].args[calls[0].args.indexOf('--config') + 1], 'model_reasoning_effort="medium"');
  assert.equal(result.requestedReasoningEffort, 'medium');
  const persisted = JSON.parse(await readFile(result.paths.receipt, 'utf8'));
  assert.equal(persisted.requestedReasoningEffort, 'medium');
  const packet = JSON.stringify({runId: request.runId, model: 'configured-model', prompt: request.prompt, outputSchema: request.outputSchema});
  assert.equal(await readFile(result.paths.input, 'utf8'), packet);
  assert.equal(result.inputPacketHash, createHash('sha256').update(packet).digest('hex'));
  assert.equal(result.reportedModel, null);
});

test('omitted reasoning effort keeps old arguments and receipt shape', async t => {
  const calls = [];
  const provider = await fixture(t, {spawn: fakeSpawn({}, calls)});
  const result = await provider.execute({runId: 'default-effort', prompt: 'Frozen evidence'});
  assert.equal(Object.hasOwn(provider, 'reasoningEffort'), false);
  assert.equal(calls[0].args.includes('--config'), false);
  assert.equal(Object.hasOwn(result, 'requestedReasoningEffort'), false);
  assert.equal(Object.hasOwn(JSON.parse(await readFile(result.paths.receipt, 'utf8')), 'requestedReasoningEffort'), false);
});

test('reasoning effort validates before starting an invocation and is retained on provider failure', async t => {
  const calls = [];
  for (const reasoningEffort of [null, '', 'none', 'minimal', 'ultra', 'medium --image private.png', 1, {}, []]) {
    assert.throws(() => createCodexProvider({rootDir: '/tmp/unused', model: 'configured-model', reasoningEffort, spawn: fakeSpawn({}, calls)}), /Unsupported reasoningEffort/);
  }
  assert.equal(calls.length, 0);
  const provider = await fixture(t, {reasoningEffort: 'medium', spawn: fakeSpawn({exitCode: 1, output: null, stdout: ''}, calls)});
  let error;
  await assert.rejects(provider.execute({runId: 'failed-effort', prompt: 'Frozen evidence'}), e => { error = e; return e.code === 'PROVIDER_FAILED'; });
  assert.equal(error.receipt.requestedReasoningEffort, 'medium');
  assert.equal(JSON.parse(await readFile(error.receipt.paths.receipt, 'utf8')).requestedReasoningEffort, 'medium');
});
