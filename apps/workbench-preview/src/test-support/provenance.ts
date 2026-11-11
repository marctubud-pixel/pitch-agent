import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import manifest from '../../test-fixtures/provenance/manifest.json';

/** Read the preserved original bytes using their historical identity. */
export function readProvenance(originalPath: string): Buffer {
  const entry = manifest.find(item => item.originalPath === originalPath);
  if (!entry) throw new Error(`Unregistered provenance source: ${originalPath}`);
  const bytes = readFileSync(new URL(`../../${entry.file}`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
    throw new Error(`Provenance bytes changed: ${originalPath}`);
  }
  return bytes;
}
