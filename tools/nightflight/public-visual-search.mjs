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
export function productCardImages(bytes, base, brand, relatedPages = []) {
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
  const baseHost=new URL(base).hostname.replace(/^www\./,'');
  for (const [node,label] of labels) {
    if (node.tagName!=='link' && node.tagName!=='a') continue;
    const attrs=Object.fromEntries(node.attrs.map(a=>[a.name,a.value]));
    const alternate=node.tagName==='link' && attrs.rel==='alternate' && /screen|width|mobile/i.test(attrs.media || '');
    if (!alternate && !(node.tagName==='a' && label.length<100 && label.includes(needle))) continue;
    try {
      const target=new URL(attrs.href,base);
      if (target.protocol==='https:' && target.hostname.replace(/^www\./,'')===baseHost && target.href!==base) relatedPages.push(target.href);
    } catch { /* Invalid link declaration. */ }
  }
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

// Some product galleries put the original in a data field or a text URL and
// let JavaScript create the image element later. Only read declared media URLs.
function galleryImages(bytes,base) {
  const {parse}=createRequire(new URL('../workbench/package.json',import.meta.url))('parse5');
  const declared=new Set();
  function add(value) {
    if (!value || !/^[^<>\s]+\.(?:png|jpe?g)(?:[?#][^<>\s]*)?$/iu.test(value.trim())) return;
    try {
      const u=new URL(value.trim(),base);
      if (u.protocol==='https:') declared.add(u.href);
    } catch { /* malformed asset reference */ }
  }
  function visit(node) {
    if (['script','style'].includes(node.tagName)) return;
    for (const attr of node.attrs ?? []) {
      if (/^data-(?:zoom-image|original|large|full|image|src)$/iu.test(attr.name)) add(attr.value);
    }
    if (node.nodeName==='#text' && node.parentNode?.attrs?.some(a=>
      ['class','id'].includes(a.name) && /(?:product|gallery|slide|image|photo)/iu.test(a.value))) add(node.value);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(bytes.toString('utf8')));
  return [...declared].map(url=>({url}));
}

// Follow links declared by the brand site. Product links in a category listing often
// say only “View product”; the surrounding card carries the actual item name.
export function catalogueLinks(bytes, base, terms) {
  const {parse}=createRequire(new URL('../workbench/package.json',import.meta.url))('parse5');
  const root=parse(bytes.toString('utf8')), links=new Map();
  const text=node=>node.nodeName==='#text' ? node.value : (node.childNodes ?? []).map(text).join(' ');
  const tokens=terms.filter(t=>typeof t==='string' && t.trim()).map(t=>t.toLowerCase());
  const score=value=>tokens.filter(t=>value.toLowerCase().includes(t)).length;
  function visit(node) {
    if (node.tagName==='a') {
      const href=node.attrs.find(a=>a.name==='href')?.value;
      if (!href || href.startsWith('#')) return;
      let target;
      try { target=new URL(href,base); } catch { return; }
      if (target.protocol!=='https:' || target.host!==new URL(base).host) return;
      target.hash='';
      if (target.href===base) return;
      const label=text(node).trim();
      const product=/products?|catalog|shop|商品|产品|系列|选购|查看详情/iu.test(label+' '+target.pathname);
      let card=node.parentNode;
      while(card && !['article','li'].includes(card.tagName)) card=card.parentNode;
      const cardText=card ? text(card).trim().slice(0,180) : '';
      const relevance=score(label+' '+target.pathname+' '+cardText);
      if (!product && !relevance) return;
      const rank=relevance*3+(product?2:0)+(product && cardText?1:0);
      if (rank>(links.get(target.href) ?? 0)) links.set(target.href,rank);
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(root);
  return [...links].sort((a,b)=>b[1]-a[1]).map(([url])=>url);
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
          const related=[];
          const directImages=productCardImages(bytes,record.finalUrl,item.brand,related);
          const catalogue=catalogueLinks(bytes,record.finalUrl,[item.category,...(item.catalogTerms ?? [])]);
          if (item.official && (catalogue.length || related.length)) {
            const terms=[item.category,...(item.catalogTerms ?? [])];
            const seenPages=new Set([record.finalUrl,item.url]);
            const readChildren=async (links,depth)=>{
              for (const url of [...new Set(links)].slice(0,4)) {
                if (found.size>=3 || seenPages.has(url) || seenPages.size>=11) continue;
                seenPages.add(url);
                try {
                  const {record:child}=await acquire(url,2*1024*1024);
                  if (child.mimeType!=='text/html' || new URL(child.finalUrl).host!==new URL(record.finalUrl).host) continue;
                  const html=await readFile(join(root,child.raw.file));
                  const children=catalogueLinks(html,child.finalUrl,terms);
                  if (depth===1 && children.some(u=>!seenPages.has(u))) await readChildren(children,2);
                  if (found.size>=3) return;
                  const images=productCardImages(html,child.finalUrl,item.brand);
                  if (depth===2 || /product[s]?\/.+|商品详情/iu.test(new URL(child.finalUrl).pathname)) {
                    const title=child.extraction.title || item.brand;
                    const galleryItems=galleryImages(html,child.finalUrl);
                    const declared=[...galleryItems,...images,...socialPreview(html,child.finalUrl),...(child.extraction.images ?? [])];
                    const merchandise=img=>/product|packshot|主图|封面|包装|商品|产品|全价|粮/iu.test(img.url+' '+(img.alt || ''));
                    const gallery=new Set(galleryItems.map(i=>i.url));
                    const candidates=declared.filter(i=>!/logo|(?:^|[/_-])ico(?:n|[-_.])|qrcode|二维码|banner|emblematic|1x1\./iu.test(i.url+' '+(i.alt || '')))
                      .sort((a,b)=>(Number(gallery.has(b.url))-Number(gallery.has(a.url)))*2 + Number(merchandise(b))-Number(merchandise(a)));
                    for (const i of candidates.slice(0,5)) await collect(i.url,child.finalUrl,title);
                  } else for (const i of images.slice(0,3)) await collect(i.url,child.finalUrl,i.title);
                } catch { signal?.throwIfAborted(); }
              }
            };
            await readChildren([...catalogue,...related],1);
          }
          if (!found.size) for (const product of directImages.slice(0,6)) await collect(product.url,record.finalUrl,product.title);
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
