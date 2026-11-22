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

// Short Latin category names such as “cat” must not match navigation words such as “catalogue”.
function categoryHits(value, terms) {
  const lower=value.toLowerCase();
  return terms.filter(term=>/^[a-z0-9 ]+$/iu.test(term)
    ? (' '+lower.replace(/[^a-z0-9]+/gu,' ')+' ').includes(' '+term.toLowerCase()+' ')
    : lower.includes(term.toLowerCase())).length;
}

function peripheral(node, packaging=false) {
  if (['aside','nav','header','footer','script','style','template','noscript'].includes(node.tagName)) return true;
  return (node.attrs ?? []).some(a=>['class','id'].includes(a.name) &&
    (packaging && /(?:^|[ _-])banner(?:$|[ _-])/iu.test(a.value) || /(?:^|[ _-])(?:sidebar|related|recommend(?:ed|ation)?|avatar|breadcrumb|share)(?:$|[ _-])/iu.test(a.value)));
}

function isProductDetail(url) {
  return /(?:detail|display|sku|\/products?\/[^/]+|\/item\/|商品详情)/iu.test(new URL(url).pathname);
}

// Bind a candidate to its product card. A nearby unrelated image or a page-wide logo
// should not become the picture for a matching product elsewhere on the same page.
export function productCardImages(bytes, base, brand, relatedPages = [], terms = []) {
  const {parse}=createRequire(new URL('../workbench/package.json',import.meta.url))('parse5');
  const root=parse(bytes.toString('utf8'));
  const compact=value=>value.replace(/\s+/gu,'').toLowerCase();
  const matches=value=>terms.length ? categoryHits(value,terms)>0 : compact(value).includes(compact(brand));
  const labels=new Map();
  const counts=new Map();
  const images=[];
  function visit(node) {
    if (peripheral(node,true)) return '';
    if (node.tagName==='img') images.push(node);
    const value=node.nodeName==='#text' ? node.value : (node.childNodes ?? []).map(visit).join(' ');
    const label=value.replace(/\s+/gu,' ').trim().slice(0,400);
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
    if (!alternate && !(node.tagName==='a' && label.length<100 && matches(label))) continue;
    try {
      const target=new URL(attrs.href,base);
      if (target.protocol==='https:' && target.hostname.replace(/^www\./,'')===baseHost && target.href!==base) relatedPages.push(target.href);
    } catch { /* Invalid link declaration. */ }
  }
  const result=new Map();
  for (const node of images) {
    const attr=Object.fromEntries(node.attrs.map(a=>[a.name,a.value]));
    let card=node.parentNode;
    const direct=matches([attr.alt,attr.title].filter(Boolean).join(' '));
    if (!direct) {
      for (let depth=0;card && depth<5;depth++,card=card.parentNode) {
        const label=labels.get(card) || '';
        if (label.length>100 || counts.get(card)!==1) break;
        if (matches(label)) break;
      }
      const label=labels.get(card) || '';
      if (!matches(label) || label.length>100 || counts.get(card)!==1) continue;
    }
    for (const src of [attr['data-original'],attr['data-zoom-image'],attr['data-lazy-img'],attr['data-src'],attr.tsrc,attr.src]) {
      if (!src?.trim() || /(?:^|[\/_-])(?:logo|ico(?:n)?|qrcode)(?:[_.-]|$)|二维码/iu.test(src)) continue;
      try {
        const url=new URL(src.trim(),base);
        if (url.protocol==='https:') {
          const title=[attr.alt,attr.title].find(t=>t && matches(t)) || (card && matches(labels.get(card) || '') ? labels.get(card) : brand);
          if (!result.has(url.href)) {
            let anchor=node.parentNode;
            while (anchor && anchor.tagName!=='a') anchor=anchor.parentNode;
            const href=anchor?.attrs?.find(a=>a.name==='href')?.value;
            const product=terms.length && href ? new URL(href,base) : null;
            result.set(url.href,{url:url.href,title:title.trim(),...(product?.protocol==='https:' && product.host===new URL(base).host ? {cardUrl:product.href} : {})});
          }
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
  function visit(node, inGallery=false) {
    if (peripheral(node,true)) return;
    const attrs=Object.fromEntries((node.attrs ?? []).map(a=>[a.name,a.value]));
    if (node.tagName==='a' && attrs.href && !attrs.href.startsWith('#') && !/\.(?:png|jpe?g)(?:[?#].*)?$/iu.test(attrs.href)) return;
    const scope=inGallery || /gallery|product[s_-]*(?:image|photo|media)|productGallery/iu.test((attrs.class || '')+' '+(attrs.id || ''));
    if (scope) {
      if (node.tagName==='img') {
        const first=attrs['data-zoom-image'] || attrs['data-original'] || attrs['data-large'] || attrs['data-full'] || attrs['data-src'] || attrs.src;
        add(first);
      } else if (node.nodeName==='#text') add(node.value);
      else for (const key of ['data-zoom-image','data-original','data-large','data-full','data-image','data-src','href']) add(attrs[key]);
    }
    for (const child of node.childNodes ?? []) visit(child,scope);
  }
  visit(parse(bytes.toString('utf8')));
  return [...declared].map(url=>({url}));
}

// Follow links declared by the brand site. Product links in a category listing often
// say only “View product”; the surrounding card carries the actual item name.
export function catalogueLinks(bytes, base, terms, packagingTerm) {
  const {parse}=createRequire(new URL('../workbench/package.json',import.meta.url))('parse5');
  const root=parse(bytes.toString('utf8')), links=new Map();
  const text=node=>node.nodeName==='#text' ? node.value : (node.childNodes ?? []).map(text).join(' ');
  const tokens=terms.filter(t=>typeof t==='string' && t.trim()).map(t=>t.toLowerCase());
  const score=value=>categoryHits(value,tokens);
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
      const direct=score(label);
      const nearby=score(cardText+' '+target.pathname);
      const preferred=label.length<=48 && ((packagingTerm==='包装盒' && /盒|礼装|礼赠|礼$|gift.?box/iu.test(label)) || (packagingTerm==='包装袋' && /袋|pouch/iu.test(label)));
      if (!product && !direct && !nearby && !preferred) return;
      const rank=(preferred?12:0)+(direct+nearby)*3+(direct?4:0)+(isProductDetail(target.href)?3:0)+(product?2:0);
      if (rank>(links.get(target.href) ?? 0)) links.set(target.href,rank);
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(root);
  return [...links].sort((a,b)=>b[1]-a[1]).map(([url])=>url);
}

// On a campaign article, the publisher's illustrations belong to the body. Navigation,
// author avatars and other campaigns in the sidebar are separate works.
function campaignBodyImages(bytes, base) {
  const {parse}=createRequire(new URL('../workbench/package.json',import.meta.url))('parse5');
  const urls=new Set();
  const paragraphs=[];
  function visit(node,inBody=false) {
    if (peripheral(node)) return;
    const attrs=Object.fromEntries((node.attrs ?? []).map(a=>[a.name,a.value]));
    const classes=(attrs.class || '').split(/\s+/u);
    const isBody=['article','main'].includes(node.tagName) || ['main','article'].includes(attrs.role) || attrs.itemprop==='articleBody' ||
      classes.some(c=>['article-body','article-content','post-content','entry-content','detail-content','cont_cam'].includes(c));
    if (inBody && node.nodeName==='#text' && node.value.trim()) paragraphs.push(node.value.trim());
    if ((inBody || isBody) && node.tagName==='img') {
      const src=attrs['data-original'] || attrs['data-src'] || attrs.src;
      if (src) try { const url=new URL(src,base); if (url.protocol==='https:') urls.add(url.href); } catch { /* malformed publisher link */ }
    }
    for (const child of node.childNodes ?? []) visit(child,inBody || isBody);
  }
  visit(parse(bytes.toString('utf8')));
  return {urls:[...urls],text:paragraphs.join('\n').slice(0,16000)};
}

export async function searchVisualImages({query,dir,signal,pages,creativeFallback=false,allowStockFallback=true}, {
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
  async function collect(url,pageUrl,title,minSide=0,articleText='') {
    if (found.size>=3 || !url || visited.has(url)) return;
    visited.add(url);
    try {
      const {record,recordHash}=await acquire(url,IMAGE_LIMITS.bytes);
      if (!allowed.includes(record.mimeType) || found.has(record.raw.sha256)) return;
      const rawPath=join(root,record.raw.file), bytes=await readFile(rawPath);
      if (digest(bytes)!==record.raw.sha256) return;
      const image=await inspectImage(bytes,{pythonBinary:await pythonBinary()});
      if (image.mediaType!==record.mimeType || Math.min(image.width,image.height)<minSide) return;
      const name='public-ref-'+record.raw.sha256+'.'+(image.mediaType==='image/jpeg'?'jpg':'png');
      const path=join(dir,name);
      try { await link(rawPath,path); } catch(error) {
        if (error.code!=='EEXIST' || digest(await readFile(path))!==record.raw.sha256) throw error;
      }
      found.set(record.raw.sha256,{...image,imageId:'ref_'+record.raw.sha256,name,path,sha256:record.raw.sha256,
        byteLength:bytes.length,sourceUrl:record.finalUrl,pageUrl,title,query,captureSha256:recordHash,...(articleText ? {articleText}: {})});
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
          const minSide=item.carrier==='packaging' ? 140 : 0;
          const terms=[...new Set([item.category,...(item.catalogTerms ?? [])].filter(t=>typeof t==='string' && t.trim()))];
          const directImages=productCardImages(bytes,record.finalUrl,item.brand,related,terms);
          const catalogue=catalogueLinks(bytes,record.finalUrl,terms,item.packagingTerm);
          if (item.official && (catalogue.length || related.length)) {
            const seenPages=new Set([record.finalUrl,item.url]);
            const readChildren=async (links,depth,labels=new Map())=>{
              for (const url of [...new Set(links)].slice(0,4)) {
                if (found.size>=3 || seenPages.has(url) || seenPages.size>=11) continue;
                seenPages.add(url);
                try {
                  const {record:child}=await acquire(url,2*1024*1024);
                  if (child.mimeType!=='text/html' || new URL(child.finalUrl).host!==new URL(record.finalUrl).host) continue;
                  const html=await readFile(join(root,child.raw.file));
                  const title=child.extraction.title || item.brand;
                  const fromCard=labels.get(url);
                  const matched=productCardImages(html,child.finalUrl,item.brand,[],terms);
                  const gallery=galleryImages(html,child.finalUrl);
                  const namedLanding=fromCard && title.toLowerCase().includes(fromCard.toLowerCase()) &&
                    (gallery.length || matched.some(i=>(!i.cardUrl || i.cardUrl===child.finalUrl) && i.title.toLowerCase().includes(fromCard.toLowerCase())));
                  const detail=isProductDetail(child.finalUrl) || namedLanding;
                  if (!detail) {
                    const linked=new Map(matched.filter(m=>m.cardUrl && m.cardUrl!==child.finalUrl).map(m=>[m.cardUrl,m.title]));
                    const productLinks=catalogueLinks(html,child.finalUrl,terms,item.packagingTerm).filter(isProductDetail);
                    const products=[...new Set([...productLinks.filter(u=>linked.has(u)),...linked.keys()])];
                    if (depth<3 && products.length) await readChildren(products,depth+1,linked);
                    if (depth===1 && found.size<3) await readChildren(catalogueLinks(html,child.finalUrl,terms,item.packagingTerm),2);
                    continue;
                  }
                  if (terms.length && !categoryHits(title,terms) && !matched.some(i=>!i.cardUrl || i.cardUrl===child.finalUrl)) continue;
                  // Only this SKU's picture can inherit its title. Linked siblings and category icons cannot.
                  const local=matched.filter(i=>!i.cardUrl || i.cardUrl===child.finalUrl);
                  for (const candidate of local) await collect(candidate.url,child.finalUrl,candidate.title,minSide);
                  if (!local.length && (!terms.length || categoryHits(title,terms))) {
                    const originals=gallery.length ? gallery : socialPreview(html,child.finalUrl);
                    for (const candidate of originals.slice(0,5)) await collect(candidate.url,child.finalUrl,title,minSide);
                  }
                } catch { signal?.throwIfAborted(); }
              }
            };
            const labels=new Map(directImages.filter(p=>p.cardUrl).map(p=>[p.cardUrl,p.title]));
            await readChildren([...catalogue,...labels.keys(),...related],1,labels);
          }
          if (!found.size) {
            const specific=directImages.filter(p=>!p.cardUrl || isProductDetail(p.cardUrl));
            const cards=specific.length || !isProductDetail(record.finalUrl) ? specific : productCardImages(bytes,record.finalUrl,item.brand);
            for (const product of cards.slice(0,6)) await collect(product.url,record.finalUrl,product.title,minSide);
          }
          continue;
        }
        const previews=socialPreview(bytes,record.finalUrl);
        const images=record.extraction.images ?? [];
        const declared = [...previews,...images.filter(i=>i.discovery),...images.filter(i=>!i.discovery)];
        // A proposed image is a hint. Only acquire URLs actually declared by the public page.
        const body=item.carrier==='kv' ? campaignBodyImages(bytes,record.finalUrl) : null;
        const ordered=body ? body.urls : [...new Set([...declared.filter(i=>i.url===item.imageUrl), ...declared].map(i=>i.url))];
        for (const url of ordered.slice(0,pages ? 8 : 2)) {
          await collect(url,record.finalUrl,record.extraction.title || item.title,0,body?.text);
        }
      } catch { signal?.throwIfAborted(); }
    }
  } catch { signal?.throwIfAborted(); }
  if (pages || found.size>=3 || !allowStockFallback) return [...found.values()];
  if (creativeFallback) {
    const index=new URL('https://api.openverse.org/v1/images/');
    index.search=new URLSearchParams({q:query,page_size:'5'});
    try {
      const {record}=await acquire(index.href,512*1024);
      const data=JSON.parse(await readFile(join(root,record.raw.file),'utf8'));
      for (const image of (Array.isArray(data.results) ? data.results : []).slice(0,5)) {
        if (typeof image?.url==='string' && image.url.startsWith('https://') &&
            typeof image.foreign_landing_url==='string' && image.foreign_landing_url.startsWith('https://')) {
          await collect(image.url,image.foreign_landing_url,image.title || 'Openverse 公开艺术参考');
        }
        if (found.size>=3) return [...found.values()];
      }
    } catch { signal?.throwIfAborted(); }
  }
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
