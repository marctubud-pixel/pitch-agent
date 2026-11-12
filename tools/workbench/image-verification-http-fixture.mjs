import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, realpath, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as authority from './model-http-authority.mjs';
import {imageManifest} from './image-evidence.mjs';

export const withScope = authority.withReadOnlyImageVerification ?? (async fn => fn());
const json = value => Buffer.from(JSON.stringify(value));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function fixture(t, imageCount = 3) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'portable-image-original-')));
  let server, requests = 0, ready = false;
  // Success cleans only this fixture; failure retains originals and prints path.
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    if (t.passed && (!ready || requests === 1)) await rm(root, {recursive: true, force: true});
    else process.stderr.write(`RETAINED failed fixture: ${root}\n`);
    if (ready) assert.equal(requests, 1, 'reopen/refused invoke never redispatches HTTP');
  });
  let generated;
  try {
    generated = JSON.parse(execFileSync('python3', ['-c', `from PIL import Image
import io,json,base64
out=[]
for fmt in ['PNG','JPEG']:
 b=io.BytesIO();Image.new('RGB',(3,2),'red').save(b,format=fmt)
 out.append(base64.b64encode(b.getvalue()).decode('ascii'))
print(json.dumps(out))`], {encoding: 'utf8'}));
  } catch (cause) {
    throw new Error('UNVERIFIED: python3 on PATH must provide Pillow; prepend the existing PDF-test venv bin directory to PATH.', {cause});
  }
  server = http.createServer(async (req, res) => {
    requests++;
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks));
    res.end(json({protocol: 'workbench-stateless-model-json-v1', invocationId: request.invocationId,
      contextMode: 'stateless-v1', terminal: 'completed', outputText: '{"ok":true}',
      reportedModel: 'reported-other', requestId: 'metadata', usage: {inputTokens: null, outputTokens: 2}}));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const cfg = {adapter: 'workbench-model-http-v1', endpoint: `http://127.0.0.1:${server.address().port}/model`,
    model: 'synthetic-model', serviceIdentity: 'synthetic-service', authentication: {kind: 'none'},
    allowLoopbackHttp: true, timeoutMs: 10000, maxRequestBytes: 2*1024*1024,
    maxResponseBytes: 1024*1024, maxOutputBytes: 16384, vision: true, envelopes: ['complete-content-v1']};
  const images = [];
  for (let i = 0; i < imageCount; i++) {
    const bytes = Buffer.from(generated[i % 2], 'base64'), path = join(root, `input-${i}`);
    await writeFile(path, bytes);
    images.push({imageId: `img_${i}`, sha256: hash(bytes), mediaType: i % 2 ? 'image/jpeg' : 'image/png', byteLength: bytes.length, path});
  }
  const imageEnvelope = {operation: 'complete-content-v1', limits: {maxImages: 3, maxBytes: 10000, maxPixels: 18}};
  const request = {runId: 'run-one', prompt: 'Synthetic prompt', outputSchema: {type: 'object'}, imageEnvelope};
  const call = {attemptId: 'attempt-one', binding: {providerId: 'synthetic', model: cfg.model, role: 'worker'},
    request, images, logicalInputBytes: json({runId: request.runId, model: cfg.model, prompt: request.prompt,
      outputSchema: request.outputSchema, images: imageManifest(images, imageEnvelope), imageEnvelope}),
    runtimePacketBytes: json({attemptId: 'attempt-one', task: 'synthetic', request})};
  const rootDir = join(root, 'originals');
  const result = await authority.createModelHttpAuthority({rootDir, operatorConfig: cfg}).invoke(call);
  assert.equal(result.kind, 'verified', `fixture physical invoke: ${JSON.stringify(result)}`);
  assert.equal(requests, 1);
  const owner = authority.createModelHttpAuthority({rootDir, environment: {}});
  const args = {...call, savedExecution: result.savedExecution};
  ready = true;
  return {root, args, owner, reopen: () => owner.reopen(args)};
}
