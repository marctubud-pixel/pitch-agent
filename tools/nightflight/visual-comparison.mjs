import {pythonBinary} from './runtime-dependencies.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const run = promisify(execFile);
const script = fileURLToPath(new URL('./visual-comparison.py',import.meta.url));
export async function makeComparison(dir, images, references, signal) {
  const files = [...images, ...references];
  const id = createHash('sha256').update(files.map(f=>f.sha256).join('/')).digest('hex').slice(0,16);
  const name = 'comparison-'+id+'.png';
  const path = join(dir,name);
  await run(await pythonBinary(), [
    script, path, ...files.map(f=>f.path),
  ], {signal,timeout:60000});
  const bytes = await readFile(path);
  return {name,path,imageId:'comparison',mediaType:'image/png',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export async function makeReviewPreviews(dir,images,signal) {
  const large=images.filter(image=>image.imageId!=='comparison' && image.byteLength>=250_000);
  if (!large.length) return images;
  const targets=new Map(large.map(image=>[image.sha256,{image,path:join(dir,'review-view-'+image.sha256+'.jpg')}]));
  try {
    await run(await pythonBinary(),[script,'--review-previews',...[...targets.values()].flatMap(({image,path})=>[image.path,path])],{signal,timeout:30000});
    const previews=new Map(await Promise.all([...targets].map(async ([originalSha256,{image,path}])=>{
      const bytes=await readFile(path);
      return [originalSha256,bytes.length>=image.byteLength ? image : {
        ...image,path,mediaType:'image/jpeg',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
      }];
    })));
    return images.map(image=>previews.get(image.sha256) ?? image);
  } catch {
    signal?.throwIfAborted();
    return images;
  }
}
