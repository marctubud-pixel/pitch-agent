import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {capturePublicSource} from '../workbench/source-acquisition.mjs';
import {searchVisualImages} from './public-visual-search.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQqTUBAAFuAMYhEMypAAAAAElFTkSuQmCC','base64');
test('captures decoded original with page, query and hash, discards corrupt and duplicate results',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'visual-search-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const page='https://commons.wikimedia.org/wiki/File:Tea';
  const api={query:{pages:Object.fromEntries(['broken','ok','duplicate'].map((name,index)=>[index,{index,title:name,
    imageinfo:[{mime:'image/png',url:'https://upload.wikimedia.org/'+name,descriptionurl:page,size:png.length,width:1,height:1}]}]))}};
  const capture=options=>capturePublicSource(options,{
    lookup:async()=>[{address:'93.184.216.34',family:4}],
    transport:async({url})=>url.hostname==='commons.wikimedia.org'
      ? {status:200,headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify(api))}
      : {status:200,headers:{'content-type':'image/png'},body:url.pathname==='/broken'?Buffer.from('broken'):png},
  });
  const images=await searchVisualImages({dir,query:'tea'},{capture,search:async()=>({receipt:{results:[]}})});
  assert.equal(images.length,1);
  const [ref]=images;
  assert.deepEqual(await readFile(ref.path),png);
  assert.equal(ref.sha256,createHash('sha256').update(png).digest('hex'));
  assert.equal(ref.pageUrl,page);
  assert.equal(ref.sourceUrl,'https://upload.wikimedia.org/ok');
  assert.equal(ref.query,'tea');
  assert.match(ref.captureSha256,/^[0-9a-f]{64}$/);
});
test('unavailable search and an aborted request cannot emit candidates',async()=>{
  const request={dir:tmpdir(),query:'tea'};
  const unavailable=async()=>{throw Error('network unavailable')};
  const deps={capture:unavailable,search:unavailable};
  assert.deepEqual(await searchVisualImages(request,deps),[]);
  await assert.rejects(searchVisualImages({...request,signal:AbortSignal.abort()},deps));
});
test('web discovery uses a public page and its captured image when the Commons request fails',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'visual-search-web-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const page='https://tea.brand.org/design';
  const capture=options=>capturePublicSource(options,{
    lookup:async()=>[{address:'93.184.216.34',family:4}],
    transport:async({url})=>{
      if(url.hostname==='commons.wikimedia.org') throw Error('unavailable');
      if(url.href===page) return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<html><head><meta property="og:image" content="https://tea.brand.org/pack.png"></head></html>')};
      return {status:200,headers:{'content-type':'image/png'},body:png};
    },
  });
  const images=await searchVisualImages({dir,query:'tea'},{capture,search:async()=>({receipt:{results:[{url:page,title:'Tea'}]}})});
  assert.equal(images[0]?.sourceUrl,'https://tea.brand.org/pack.png');
  assert.equal(images[0].pageUrl,page);
});
