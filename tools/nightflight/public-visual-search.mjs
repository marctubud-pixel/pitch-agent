import {pythonBinary} from './runtime-dependencies.mjs';
import {createHash} from 'node:crypto';
import {readFile, link} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {capturePublicSource,httpsTransport} from '../workbench/source-acquisition.mjs';
import {searchPublicReferences} from '../workbench/reference-http-search.mjs';
import {inspectImage, IMAGE_LIMITS} from '../workbench/image-evidence.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = ['image/jpeg','image/png'];

const run=promisify(execFile);

// Use the host TLS client for the fixed Commons hosts. Pin the already validated
// public address and leave every redirect to the capture layer.
async function visualTransport(args) {
  const {url,address,family,maxBytes,signal}=args;
  if (!['commons.wikimedia.org','upload.wikimedia.org'].includes(url.hostname)) return httpsTransport(args);
  const pinned=family===6 ? '['+address+']' : address;
  const {stdout}=await run('curl',['-q','--silent','--show-error','--globoff','--noproxy','*','--proto','=https',
    '--resolve',url.hostname+':443:'+pinned,'--max-time','9','--max-filesize',String(maxBytes),
    '--user-agent','ProposalWorkbenchSourceCapture/1.0','--write-out','\n%{http_code} %{content_type}',url.href],
    {signal,encoding:'buffer',maxBuffer:maxBytes+8192});
  const boundary=stdout.lastIndexOf(10);
  const [code,...type]=stdout.subarray(boundary+1).toString().split(' ');
  return {status:Number(code),headers:{'content-type':type.join(' ')},body:stdout.subarray(0,boundary)};
}

function socialPreview(bytes,base) {
  const {parse}=createRequire(new URL('../workbench/package.json',import.meta.url))('parse5');
  const head=parse(bytes.toString('utf8')).childNodes.find(n=>n.tagName==='html')?.childNodes.find(n=>n.tagName==='head');
  const urls=[];
  for (const tag of head?.childNodes ?? []) {
    if (tag.tagName!=='meta') continue;
    const attrs=Object.fromEntries(tag.attrs.map(a=>[a.name,a.value]));
    if (!['og:image','twitter:image'].includes(attrs.property ?? attrs.name) || !attrs.content) continue;
    try { urls.push({url:new URL(attrs.content,base).href}); } catch { /* malformed page hint */ }
  }
  return urls;
}

// Bind a candidate to its product card. A nearby unrelated image or a page-wide logo
// should not become the picture for a matching product elsewhere on the same page.
export function productCardImages(bytes, base, brand) {
  const {parse}=createRequire(new URL('../workbench/package.json',import.meta.url))('parse5');
  const root=parse(bytes.toString('utf8'));
  const compact=value=>value.replace(/\s+/gu,'').toLowerCase();
  const needle=compact(brand);
  const labels=new Map();
  const counts=new Map();
  const images=[];
  function visit(node) {
    if (['script','style','noscript','template'].includes(node.tagName)) return '';
    if (node.tagName==='img') images.push(node);
    const value=node.nodeName==='#text' ? node.value : (node.childNodes ?? []).map(visit).join(' ');
    const label=compact(value).slice(0,400);
    counts.set(node,node.tagName==='img' ? 1 : (node.childNodes ?? []).reduce((n,c)=>n+(counts.get(c) || 0),0));
    labels.set(node,label);
    return label;
  }
  visit(root);
  const result=new Map();
  for (const node of images) {
    const attr=Object.fromEntries(node.attrs.map(a=>[a.name,a.value]));
    let card=node.parentNode;
    const direct=compact([attr.alt,attr.title].filter(Boolean).join(' ')).includes(needle);
    if (!direct) {
      for (let depth=0;card && depth<5;depth++,card=card.parentNode) {
        const label=labels.get(card) || '';
        if (label.length>100 || counts.get(card)!==1) break;
        if (label.includes(needle)) break;
      }
      const label=labels.get(card) || '';
      if (!label.includes(needle) || label.length>100 || counts.get(card)!==1) continue;
    }
    for (const src of [attr['data-original'],attr['data-zoom-image'],attr['data-lazy-img'],attr['data-src'],attr.tsrc,attr.src]) {
      if (!src?.trim()) continue;
      try {
        const url=new URL(src.trim(),base);
        if (url.protocol==='https:') {
          const title=[attr.alt,attr.title].find(t=>t && compact(t).includes(needle)) || brand;
          if (!result.has(url.href)) result.set(url.href,{url:url.href,title:title.trim()});
          break;
        }
      } catch { /* Invalid declarations are not candidates. */ }
    }
  }
  return [...result.values()];
}

export async function searchVisualImages({query,dir,signal,pages}, {
  capture=capturePublicSource, search=searchPublicReferences,
}={}) {
  if (typeof query !== 'string' || !query.trim() || query.length>180 || /[\x00-\x1f]/.test(query)) throw Error('参考检索词为空、过长或含控制字符');
  const root=join(dir,'public-reference-sources');
  const found=new Map(), visited=new Set();
  async function acquire(url,maxBytes) {
    signal?.throwIfAborted();
    const result=await capture({url,storeRoot:root,limits:{maxBytes,timeoutMs:9000,maxRedirects:3}},{transport:visualTransport});
    signal?.throwIfAborted();
    if (result.record.httpStatus !== 200) throw Error('公开来源未返回可读原件');
    return result;
  }
  async function collect(url,pageUrl,title) {
    if (found.size>=3 || !url || visited.has(url)) return;
    visited.add(url);
    try {
      const {record,recordHash}=await acquire(url,IMAGE_LIMITS.bytes);
      if (!allowed.includes(record.mimeType) || found.has(record.raw.sha256)) return;
      const rawPath=join(root,record.raw.file), bytes=await readFile(rawPath);
      if (digest(bytes)!==record.raw.sha256) return;
      const image=await inspectImage(bytes,{pythonBinary:await pythonBinary()});
      if (image.mediaType!==record.mimeType) return;
      const name='public-ref-'+record.raw.sha256+'.'+(image.mediaType==='image/jpeg'?'jpg':'png');
      const path=join(dir,name);
      try { await link(rawPath,path); } catch(error) {
        if (error.code!=='EEXIST' || digest(await readFile(path))!==record.raw.sha256) throw error;
      }
      found.set(record.raw.sha256,{...image,imageId:'ref_'+record.raw.sha256,name,path,sha256:record.raw.sha256,
        byteLength:bytes.length,sourceUrl:record.finalUrl,pageUrl,title,query,captureSha256:recordHash});
    } catch { signal?.throwIfAborted(); }
  }
  try {
    const candidates = pages ?? (await search({query,storeRoot:root,limits:{maxResults:3}})).receipt.results;
    for (const item of candidates) {
      if (found.size>=3) break;
      try {
        const {record}=await acquire(item.url,1024*1024);
        if (record.mimeType!=='text/html') continue;
        const bytes=await readFile(join(root,record.raw.file));
        if (item.brand) {
          for (const product of productCardImages(bytes,record.finalUrl,item.brand).slice(0,6)) {
            await collect(product.url,record.finalUrl,product.title);
          }
          continue;
        }
        const previews=socialPreview(bytes,record.finalUrl);
        const images=record.extraction.images ?? [];
        const declared = [...previews,...images.filter(i=>i.discovery),...images.filter(i=>!i.discovery)];
        // A proposed image is a hint. Only acquire URLs actually declared by the public page.
        const ordered = [...new Set([...declared.filter(i=>i.url===item.imageUrl), ...declared].map(i=>i.url))];
        for (const url of ordered.slice(0,pages ? 8 : 2)) {
          await collect(url,record.finalUrl,record.extraction.title || item.title);
        }
      } catch { signal?.throwIfAborted(); }
    }
  } catch { signal?.throwIfAborted(); }
  if (pages || found.size>=3) return [...found.values()];
  const api=new URL('https://commons.wikimedia.org/w/api.php');
  api.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrnamespace:'6',gsrlimit:'8',
    gsrsearch:query,prop:'imageinfo',iiprop:'url|mime|size'});
  try {
    const {record}=await acquire(api.href,512*1024);
    const data=JSON.parse(await readFile(join(root,record.raw.file),'utf8'));
    const pages=Object.values(data.query?.pages ?? {}).sort((a,b)=>a.index-b.index);
    for (const page of pages.slice(0,8)) {
      const info=page.imageinfo?.[0];
      if (info && allowed.includes(info.mime) && info.size<=IMAGE_LIMITS.bytes && info.width*info.height<=IMAGE_LIMITS.pixels &&
          typeof info.descriptionurl==='string' && info.descriptionurl.startsWith('https://commons.wikimedia.org/')) {
        await collect(info.url,info.descriptionurl,page.title);
      }
      if (found.size>=3) break;
    }
  } catch { signal?.throwIfAborted(); }
  return [...found.values()];
}
