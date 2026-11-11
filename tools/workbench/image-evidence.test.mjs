import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, rm, symlink, writeFile, chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createImageEvidenceStore, inspectImage, readImageDescriptor, buildImageObservationRequest, validateImageObservationOutput, IMAGE_LIMITS} from './image-evidence.mjs';

export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');
const metadata = {originalFilename: '../untrusted-name.png', representation: 'screenshot', sourcePageUrl: 'https://example.com/source'};
async function fixture(t) {
  const rootDir = await realpath(await mkdtemp(join(tmpdir(), 'image-evidence-')));
  t.after(() => rm(rootDir, {recursive: true, force: true}));
  return {rootDir, store: createImageEvidenceStore({rootDir})};
}

test('byte upload survives restart, isolates provenance and project identities', async t => {
  const {rootDir, store} = await fixture(t);
  const first = await store.ingest({projectId: 'p1', bytes: png, metadata});
  const second = await store.ingest({projectId: 'p1', bytes: png, metadata: {...metadata, description: 'another capture declaration'}});
  assert.notEqual(first.id, second.id);
  assert.equal(first.sha256, second.sha256);
  const restarted = createImageEvidenceStore({rootDir});
  const loaded = await restarted.read({projectId: 'p1', imageId: first.id, expectedHash: first.sha256});
  assert.deepEqual(loaded.bytes, png);
  assert.deepEqual(loaded.asset.provenance, metadata);
  await assert.rejects(restarted.read({projectId: 'p2', imageId: first.id}), /identity/);
  await assert.rejects(restarted.read({projectId: 'p1', imageId: '../../outside'}), /identity/);
  await assert.rejects(store.ingest({projectId: 'p1', bytes: png, metadata: {...metadata, path: '/etc/passwd'}}), /metadata/);
  await assert.rejects(store.ingest({projectId: 'p1', bytes: '/etc/passwd', metadata}), /bytes/);
});

test('decoder rejects corrupt, truncated, oversized, mismatched MIME and linked images', async t => {
  const {rootDir, store} = await fixture(t);
  await assert.rejects(inspectImage(Buffer.alloc(IMAGE_LIMITS.bytes + 1)), /8 MiB/);
  await assert.rejects(inspectImage(png.subarray(0, 35)), /decoding/);
  await assert.rejects(inspectImage(png.subarray(0, -1)), /decoding/);
  const corrupt = Buffer.from(png); corrupt[44] ^= 255;
  await assert.rejects(inspectImage(corrupt), /decoding/);
  const asset = await store.ingest({projectId: 'p1', bytes: png, metadata});
  const {descriptor} = await store.read({projectId: 'p1', imageId: asset.id});
  await assert.rejects(readImageDescriptor({...descriptor, mediaType: 'image/jpeg'}), /MIME/);
  const link = join(rootDir, 'link');
  await symlink(descriptor.path, link);
  await assert.rejects(readImageDescriptor({...descriptor, path: link}));
  await symlink(join(rootDir, 'objects'), join(rootDir, 'linked-dir'));
  await assert.rejects(readImageDescriptor({...descriptor, path: join(rootDir, 'linked-dir', asset.sha256)}), /symlink/);
  await chmod(descriptor.path, 0o600);
  await writeFile(descriptor.path, Buffer.from('tampered'));
  await assert.rejects(store.read({projectId: 'p1', imageId: asset.id}), /hash or length/);
});

test('observation freezes ordered neutral manifest and validates complete exact coverage', () => {
  const descriptor = {imageId: 'img_a', sha256: createHash('sha256').update(png).digest('hex'), mediaType: 'image/png', byteLength: png.length};
  const images = [descriptor, {...descriptor, imageId: 'img_b'}];
  const request = buildImageObservationRequest({images});
  assert.notEqual(request.manifestHash, buildImageObservationRequest({images: [...images].reverse()}).manifestHash);
  assert.match(request.prompt, /消费者偏好/);
  assert.doesNotMatch(request.prompt, /untrusted-name/);
  const output = {manifestHash: request.manifestHash, observations: images.map((image, index) => ({imageId: image.imageId, imageSha256: image.sha256, visibleFeatures: [{id: `feature_${index}`, description: '白色区域', region: '中心'}], legibleText: [], uncertainties: [], limitations: ['不能证明真实性、消费者偏好或物理性能']}))};
  assert.deepEqual(validateImageObservationOutput(output, images), output);
  assert.throws(() => validateImageObservationOutput({...output, observations: [...output.observations].reverse()}, images), /order/);
  const duplicate = structuredClone(output); duplicate.observations[1].visibleFeatures[0].id = 'feature_0';
  assert.throws(() => validateImageObservationOutput(duplicate, images), /duplicate/);
  const extra = structuredClone(output); extra.observations[0].authenticity = 'verified';
  assert.throws(() => validateImageObservationOutput(extra, images));
  const noLimit = structuredClone(output); noLimit.observations[0].limitations = [];
  assert.throws(() => validateImageObservationOutput(noLimit, images), /limitations/);
  assert.throws(() => buildImageObservationRequest({images: Array(5).fill(descriptor)}), /four/);
});


test('decoder accepts complete JPEG and rejects pixel bombs before decompression', async () => {
  const jpeg = execFileSync('python3', ['-c', "from PIL import Image; import sys; Image.new('RGB',(2,3),'red').save(sys.stdout.buffer,format='JPEG')"]);
  assert.deepEqual(await inspectImage(jpeg), {mediaType: 'image/jpeg', width: 2, height: 3});
  await assert.rejects(inspectImage(jpeg.subarray(0, -2)), /decoding/);
  const oversizedHeader = execFileSync('python3', ['-c', "import struct,zlib,sys; d=b'IHDR'+struct.pack('>IIBBBBB',5000,5000,8,2,0,0,0); sys.stdout.buffer.write(bytes.fromhex('89504e470d0a1a0a')+struct.pack('>I',13)+d+struct.pack('>I',zlib.crc32(d)))"]);
  await assert.rejects(inspectImage(oversizedHeader), /decoding/);
});
