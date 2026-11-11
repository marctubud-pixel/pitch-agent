import {readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {layoutHash} from './layout-boundary.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
const manifestUrl=new URL('../../renderer-source-manifest.json',import.meta.url);
export async function layoutRendererIdentity(){const bytes=await readFile(manifestUrl);return {identity:'semantic-layout-v3-frozen-source',closureHash:layoutHash(bytes)};}
export async function verifyLayoutRenderer(renderer){
 const bytes=await readFile(manifestUrl),manifest=JSON.parse(bytes);
 need(renderer?.identity==='semantic-layout-v3-frozen-source'&&renderer.closureHash===layoutHash(bytes),'LAYOUT_RENDERER_CHANGED','Exact frozen local semantic renderer source required');
 for(const entry of manifest){const url=new URL(`../../${entry.path}`,import.meta.url),info=await lstat(fileURLToPath(url));need(info.isFile()&&!info.isSymbolicLink()&&info.size===entry.bytes&&layoutHash(await readFile(url))===entry.sha256,'LAYOUT_RENDERER_CHANGED',`Frozen renderer dependency changed at ${entry.path}`);}
 return renderer;
}
