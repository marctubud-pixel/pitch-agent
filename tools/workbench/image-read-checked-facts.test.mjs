import {monitor} from './image-read-monitor.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, rm, mkdir, writeFile, symlink, lstat, readdir, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createImageEvidenceStore, readImageDescriptor} from './image-evidence.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const methods = ['read', 'readWithInspection'];
async function area(t) {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'image-read-unit-')));
  t.after(() => rm(path, {recursive: true, force: true}));
  return path;
}
async function snapshot(root) {
  const rows = [];
  async function walk(path, name) {
    const stat = await lstat(path, {bigint: true});
    rows.push([name, String(stat.mode), String(stat.mtimeNs), stat.isFile() ? hash(await readFile(path)) : null]);
    if (stat.isDirectory()) for (const child of (await readdir(path)).sort()) await walk(join(path, child), name + '/' + child);
  }
  await walk(root, '');
  return rows;
}
async function populated(t, bytes = png, mediaType = 'image/png') {
  const base = await area(t); const rootDir = join(base, 'store');
  await mkdir(join(rootDir, 'objects'), {recursive: true}); await mkdir(join(rootDir, 'records'));
  const asset = {id: 'img_test', projectId: 'p1', sha256: hash(bytes), mediaType, byteLength: bytes.length, width: 999, height: 777, provenance: {representation: 'supplied_image'}};
  const objectPath = join(rootDir, 'objects', asset.sha256); const recordPath = join(rootDir, 'records', asset.id + '.json');
  await writeFile(objectPath, bytes); await writeFile(recordPath, JSON.stringify(asset));
  return {base, rootDir, objectPath, recordPath, asset, bytes, store: createImageEvidenceStore({rootDir})};
}
const identity = {projectId: 'p1', imageId: 'img_test'};
async function oneDecode(action) {
  const before = monitor.children.length;
  const result = await action();
  const added = monitor.children.slice(before);
  assert.equal(added.length, 1);
  assert.equal(added[0].terminal, true);
  assert.strictEqual(added[0].bytes, result.bytes ?? result);
  return result;
}
test('both reads leave absent roots and absent child directories absent', async t => {
  for (const mode of ['absent', 'objects', 'records']) {
    const base = await area(t); const rootDir = join(base, 'store');
    if (mode !== 'absent') { await mkdir(rootDir); await mkdir(join(rootDir, mode)); }
    const before = await snapshot(base); const count = monitor.children.length;
    const store = createImageEvidenceStore({rootDir});
    for (const method of methods) await assert.rejects(store[method](identity));
    assert.deepEqual(await snapshot(base), before); assert.equal(monitor.children.length, count);
  }
});
test('old read exact order and bytes; inspection keeps declared dimensions separate', async t => {
  const f = await populated(t); const before = await snapshot(f.rootDir);
  const old = await oneDecode(() => f.store.read({...identity, expectedHash: f.asset.sha256}));
  assert.deepEqual(Object.keys(old), ['asset', 'bytes', 'descriptor']);
  assert.deepEqual(old.asset, f.asset); assert.deepEqual(old.bytes, png);
  assert.deepEqual(Object.keys(old.descriptor), ['imageId', 'sha256', 'mediaType', 'byteLength', 'path']);
  assert.deepEqual(old.descriptor, {imageId: f.asset.id, sha256: f.asset.sha256, mediaType: f.asset.mediaType, byteLength: png.length, path: f.objectPath});
  const checked = await oneDecode(() => f.store.readWithInspection(identity));
  assert.deepEqual(Object.keys(checked), ['asset', 'bytes', 'descriptor', 'inspection']);
  assert.deepEqual(checked.inspection, {mediaType: 'image/png', width: 2, height: 2});
  assert.deepEqual(checked.asset, f.asset); assert.deepEqual(checked.bytes, png);
  const descriptorBytes = await oneDecode(() => readImageDescriptor(old.descriptor));
  assert(Buffer.isBuffer(descriptorBytes)); assert.deepEqual(descriptorBytes, png);
  assert.deepEqual(await snapshot(f.rootDir), before);
});
test('JPEG inspection and legacy missing dimensions remain accepted', async t => {
  const jpeg = execFileSync('python3', ['-c', "from PIL import Image; import sys; Image.new('RGB',(2,3),'red').save(sys.stdout.buffer,format='JPEG')"]);
  const f = await populated(t, jpeg, 'image/jpeg'); delete f.asset.width; delete f.asset.height;
  await writeFile(f.recordPath, JSON.stringify(f.asset)); const before = await snapshot(f.rootDir);
  const checked = await oneDecode(() => f.store.readWithInspection(identity));
  assert.deepEqual(checked.inspection, {mediaType: 'image/jpeg', width: 2, height: 3}); assert.deepEqual(checked.asset, f.asset);
  assert.deepEqual((await oneDecode(() => f.store.read(identity))).bytes, jpeg);
  assert.deepEqual(await snapshot(f.rootDir), before);
});
test('identity, expected hash, record identity/hash, descriptor and byte tampering reject without writes', async t => {
  const f = await populated(t);
  const cases = [
    {args: {...identity, projectId: '../bad'}}, {args: {...identity, imageId: '../bad'}},
    {args: {...identity, projectId: 'p2'}}, {args: {...identity, expectedHash: '0'.repeat(64)}},
    {record: {...f.asset, id: 'wrong'}}, {record: {...f.asset, projectId: 'p2'}},
    {record: {...f.asset, sha256: '../bad'}}, {record: {...f.asset, mediaType: 'image/gif'}},
    {record: {...f.asset, byteLength: 0}}, {record: {...f.asset, byteLength: png.length + 1}},
    {object: Buffer.from('tampered')}, {object: Buffer.alloc(png.length, 1)},
  ];
  for (const item of cases) {
    await writeFile(f.recordPath, JSON.stringify(item.record ?? f.asset)); await writeFile(f.objectPath, item.object ?? png);
    const before = await snapshot(f.rootDir); const children = monitor.children.length;
    for (const method of methods) await assert.rejects(f.store[method](item.args ?? identity));
    assert.deepEqual(await snapshot(f.rootDir), before); assert.equal(monitor.children.length, children);
  }
});
test('valid hash corrupt bytes and mismatched MIME fail after one terminal decoder per read', async t => {
  for (const [bytes, mediaType] of [[Buffer.from('not an image'), 'image/png'], [png, 'image/jpeg']]) {
    const f = await populated(t, bytes, mediaType); const before = await snapshot(f.rootDir);
    for (const method of methods) {
      const children = monitor.children.length;
      await assert.rejects(f.store[method](identity), /decoding|MIME/);
      assert.equal(monitor.children.length, children + 1); assert.equal(monitor.children.at(-1).terminal, true);
    }
    assert.deepEqual(await snapshot(f.rootDir), before);
  }
});
test('linked roots, child directories, records, objects and ancestors reject without writes or decoders', async t => {
  for (const kind of ['root', 'objects', 'records', 'record', 'object', 'ancestor']) {
    const f = await populated(t); let rootDir = f.rootDir;
    if (kind === 'root') { rootDir = join(f.base, 'linked-root'); await symlink(f.rootDir, rootDir); }
    else if (kind === 'ancestor') { const alias = join(f.base, 'alias'); await symlink(f.base, alias); rootDir = join(alias, 'store'); }
    else {
      const path = kind === 'object' ? f.objectPath : kind === 'record' ? f.recordPath : join(f.rootDir, kind);
      const target = join(f.base, 'saved-' + kind);
      const {rename} = await import('node:fs/promises'); await rename(path, target); await symlink(target, path);
    }
    const before = await snapshot(f.base); const children = monitor.children.length;
    const store = createImageEvidenceStore({rootDir});
    for (const method of methods) await assert.rejects(store[method](identity));
    assert.deepEqual(await snapshot(f.base), before); assert.equal(monitor.children.length, children);
  }
});
