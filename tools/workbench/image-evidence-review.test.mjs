import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, rm, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createCodexProvider} from './codex-provider.mjs';

test('caller mutation during image reads cannot change bytes under a frozen manifest', async t => {
  const rootDir = await realpath(await mkdtemp(join(tmpdir(), 'image-review-')));
  t.after(() => rm(rootDir, {recursive: true, force: true}));
  const descriptors = [];
  for (const color of ['red', 'blue']) {
    const bytes = execFileSync('python3', ['-c', `from PIL import Image; import sys; Image.new('RGB',(2,2),'${color}').save(sys.stdout.buffer,format='PNG')`]);
    const path = join(rootDir, `${color}.png`);
    await writeFile(path, bytes);
    descriptors.push({imageId: color, path, sha256: createHash('sha256').update(bytes).digest('hex'), mediaType: 'image/png', byteLength: bytes.length});
  }
  const spawn = (_binary, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.stdin.resume();
    child.stdin.on('finish', () => setImmediate(async () => {
      await writeFile(args[args.indexOf('-o') + 1], '{}');
      child.stdout.write('{"type":"thread.started","thread_id":"synthetic-image-review"}\n{"type":"turn.completed"}\n');
      child.emit('close', 0, null);
    }));
    return child;
  };
  const provider = createCodexProvider({rootDir: join(rootDir, 'runs'), binary: process.execPath, model: 'synthetic', spawn});
  const images = [{...descriptors[0]}, {...descriptors[0], imageId: 'second'}];
  const executing = provider.execute({runId: 'mutation', prompt: 'observe', images});
  Object.assign(images[1], descriptors[1], {imageId: 'second'});
  const result = await executing;
  for (const attachment of result.images) {
    assert.equal(createHash('sha256').update(await readFile(attachment.path)).digest('hex'), attachment.sha256);
  }
});
