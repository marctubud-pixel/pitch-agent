import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const run = promisify(execFile);
export async function makeComparison(dir, images, references, signal) {
  const files = [...images, ...references];
  const id = createHash('sha256').update(files.map(f=>f.sha256).join('/')).digest('hex').slice(0,16);
  const name = 'comparison-'+id+'.png';
  const path = join(dir,name);
  await run(process.env.NIGHTFLIGHT_PYTHON || 'python3', [
    fileURLToPath(new URL('./visual-comparison.py',import.meta.url)), path, ...files.map(f=>f.path),
  ], {signal,timeout:60000});
  const bytes = await readFile(path);
  return {name,path,imageId:'comparison',mediaType:'image/png',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
