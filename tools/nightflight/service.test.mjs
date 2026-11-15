import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createNightflight } from './service.mjs';

test('a personal run waits for direction and current image adoption, saves user files and survives reopening', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nightflight-service-'));
  const id = 'isolated-project',
    base = '/api/projects';
  async function run({ stage, dir, project }) {
    assert.equal(await readFile(join(dir, 'brief.md'), 'utf8'), 'brief attachment');
    if (stage === 'layout') assert.equal(await readFile(join(dir, 'update.md'), 'utf8'), 'update');
    const kind = stage === 'layout' ? 'pptx' : stage === 'visual' ? 'image' : 'text';
    const name = 'output-' + stage + { pptx: '.pptx', image: '.png', text: '.md' }[kind];
    await writeFile(join(dir, name), 'isolated ' + stage);
    return { artifacts: [{ kind, name }], directions: stage === 'copy' ? ['A', 'B', 'C'] : undefined };
  }
  const options = { root, runStage: run, runLayout: run };
  let service = createNightflight(options);
  t.after(async () => {
    service.close();
    await rm(root, { recursive: true, force: true });
  });
  async function request(path, data, origin = 'http://localhost:4420') {
    const req = Readable.from(data ? [Buffer.from(JSON.stringify(data))] : []);
    Object.assign(req, {
      url: path,
      method: data ? 'POST' : 'GET',
      headers: { host: 'localhost:4420', origin, 'content-type': 'application/json' },
      socket: { remoteAddress: '127.0.0.1' },
    });
    const res = {
      writeHead(status) {
        this.status = status;
      },
      end(result) {
        this.data = JSON.parse(result);
      },
    };
    await service.handle(req, res);
    return res;
  }
  const project = async () => (await request(base + '/' + id)).data.project;
  const action = (data) => request(base + '/' + id + '/action', data);
  const wait = async (status) => {
    for (let i = 0; i < 300; i++) {
      const p = await project();
      if (p.status === status) return p;
      if (p.status === 'failed') assert.fail(p.error);
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail('timed out at ' + status);
  };
  const file = (name, body) => ({ name, data: Buffer.from(body).toString('base64') });
  const input = { id, brief: 'test', mode: 'collab', attachments: [file('brief.md', 'brief attachment')] };
  assert.equal((await request(base, input, 'http://foreign.invalid')).status, 403);
  assert.equal((await request(base, input)).status, 201);
  const copy = await wait('waiting');
  assert.equal(copy.stage, 'copy');
  assert.equal(
    (await action({ kind: 'choice', text: 'A', expectedRevision: copy.revision - 1 })).status,
    409,
  );
  await action({ kind: 'choice', text: 'A', expectedRevision: copy.revision });
  const visual = await wait('waiting');
  assert.equal(visual.stage, 'visual');
  await action({ kind: 'message', text: 'change', attachments: [file('update.md', 'update')] });
  const revised = await wait('waiting');
  assert.equal(revised.versions.length, 1);
  assert.equal((await action({ kind: 'adopt', expectedRevision: visual.revision })).status, 409);
  const adoption = { kind: 'adopt', expectedRevision: revised.revision, opId: 'my-choice' };
  assert.equal((await action(adoption)).status, 200);
  const finished = await wait('done');
  assert.equal(finished.artifacts.length, 7);
  assert.equal((await action(adoption)).status, 200);
  service.close();
  service = createNightflight(options);
  assert.deepEqual(await project(), finished);
});
