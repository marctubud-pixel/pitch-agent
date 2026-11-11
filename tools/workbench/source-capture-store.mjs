import {extractHtml} from './source-acquisition.mjs';
import {open, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Acquisition admits at most five times its 12 MiB default plus one byte.
// Record admission is separate because optional PDF extraction has no protocol size bound.
export const CAPTURE_READ_LIMITS = Object.freeze({recordBytes: 64 * 1024 * 1024, rawBytes: 60 * 1024 * 1024 + 1});
async function captureBytes(path, limit, length, accounting) {
  if (await realpath(path) !== path) throw new Error('Capture must be a managed regular file');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size < 0 || info.size > limit || length !== undefined && info.size !== length) throw new Error('Capture file exceeds its declared finite size');
    if (accounting) { accounting.reservedBytes += info.size + 1; accounting.descriptorReads++; }
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const {bytesRead} = await handle.read(bytes, offset, Math.min(64 * 1024, bytes.length - offset), offset);
      if (accounting) accounting.actualBytes += bytesRead;
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const probe = await handle.read(Buffer.alloc(1), 0, 1, info.size);
    if (accounting) accounting.actualBytes += probe.bytesRead;
    if (offset !== info.size || probe.bytesRead !== 0) throw new Error('Capture file changed while reading');
    return bytes;
  } finally { await handle.close(); }
}
export async function readManagedCapture(rootDir, capture, accounting) {
  if (!capture || !/^[a-f0-9]{64}$/.test(capture.recordHash)) throw new Error('Invalid capture identity');
  const root = resolve(rootDir);
  const recordPath = join(root, 'captures', `${capture.recordHash}.json`);
  const bytes = await captureBytes(recordPath, CAPTURE_READ_LIMITS.recordBytes, undefined, accounting);
  if (hash(bytes) !== capture.recordHash) throw new Error('Capture record hash mismatch');
  const record = JSON.parse(bytes);
  if (accounting) accounting.jsonParses=(accounting.jsonParses??0)+1;
  if (!/^[a-f0-9]{64}$/.test(record.raw?.sha256) || record.raw.file !== `raw/${record.raw.sha256}.bin`) throw new Error('Invalid capture raw reference');
  const rawPath = join(root, record.raw.file);
  if (!Number.isSafeInteger(record.raw.byteLength) || record.raw.byteLength < 0 || record.raw.byteLength > CAPTURE_READ_LIMITS.rawBytes || !Number.isSafeInteger(record.limits?.maxBytes) || record.limits.maxBytes < 1 || record.limits.maxBytes > CAPTURE_READ_LIMITS.rawBytes || record.raw.byteLength > record.limits.maxBytes) throw new Error('Invalid capture declared raw limit');
  const raw = await captureBytes(rawPath, record.limits.maxBytes, record.raw.byteLength, accounting);
  if (raw.length !== record.raw.byteLength || hash(raw) !== record.raw.sha256 || hash(record.extraction?.text ?? '') !== record.extraction?.textHash) throw new Error('Capture bytes or extracted text changed');
  const declared = record.extraction.images?.filter(image => image.discovery?.kind === 'script-declared' || image.locator?.kind === 'html_utf16_literal') ?? [];
  if (declared.length) {
    if (!['text/html', 'application/xhtml+xml'].includes(record.mimeType)) throw new Error('Declared image requires HTML raw capture');
    const html = new TextDecoder(record.extraction.charset || 'utf-8').decode(raw);
    const actual = extractHtml(html, record.finalUrl).images.filter(image => image.discovery?.kind === 'script-declared');
    if (JSON.stringify(declared) !== JSON.stringify(actual)) throw new Error('Declared image locator or declaration differs from raw capture');
  }
  return {record, recordHash: capture.recordHash, recordPath, raw};
}
