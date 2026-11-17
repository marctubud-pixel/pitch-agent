import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {capturePublicSource} from '../workbench/source-acquisition.mjs';
import {searchVisualImages,productCardImages} from './public-visual-search.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQqTUBAAFuAMYhEMypAAAAAElFTkSuQmCC','base64');
test('matches the named product card and its declared lazy image, ignoring neighbouring products and placeholders',()=>{
  const html=Buffer.from('<link rel="alternate" media="screen and (max-width: 640px)" href="/mobile/"><section><div><img tsrc="/other.png"><p>别的茶</p></div>'+
    '<div><img src="data:image/gif;base64,AA" tsrc="/tea.png"><p>测试茶</p></div></section>'+
    '<a><img src="/blank.gif" data-lazy-img=" //images.example.org/sku.jpg " alt="测试茶 500ml"></a>');
  const related=[];
  assert.deepEqual(productCardImages(html,'https://brand.example.org/products','测试茶',related),
    [{url:'https://brand.example.org/tea.png',title:'测试茶'},{url:'https://images.example.org/sku.jpg',title:'测试茶 500ml'}]);
  assert.deepEqual(related,['https://brand.example.org/mobile/']);
});

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

test('competitor board binds a read image to its declaring page, disregards invented URLs and preserves the accepted bytes',async t=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const dir=await mkdtemp(join(tmpdir(),'research-competitors-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const sample=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAKAAAADwCAAAAACiKjAGAAAAPElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBpbwAAHEOZGbAAAAAElFTkSuQmCC','base64');
  const page='https://brand.example/products/original', product='https://brand.example/pack.png';
  const requests=[];
  const dependencies={lookup:async()=>[{address:'93.184.216.34',family:4}],
    transport:async({url})=>{
      requests.push(url.href);
      if(url.href===page)return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<title>Example</title><img src="/pack.png">')};
      if(url.href===product)return {status:200,headers:{'content-type':'image/png'},body:sample};
      throw Error('Unexpected URL');
    }};
  const call=async(_prompt,images,schema)=> schema.properties.front ? {parsedOutput:{front:'乳白色盒身',regions:['左上']}} :
    schema.properties.verifiedFront ? {parsedOutput:{verifiedFront:'包装正面品类名置顶。',checks:[]}} : ({parsedOutput:{samples:[
    {source:images[0].imageId,title:'同类原味纸盒',sameCategory:true,observation:'包装正面品类名置顶。'},
    {source:'invented',title:'无原图案例',observation:'无依据'}],
    conclusion:'所示单品把品类信息放在正面上部。',implication:'可比较正面品类名与品牌名的层级。'}});
  const board=await researchCompetitors({call,dir,project:{brief:'燕麦饮包装设计'},carrier:'packaging',dependencies,
    pages:[{title:'燕麦饮纸盒',url:page,imageUrl:'https://unrelated.example/unverified.png'}]});
  assert.deepEqual(requests,[page,product]);
  const [ref]=board.finding.images;
  assert.equal(board.finding.images.length,1);
  assert.equal(board.finding.visualOnly,false);
  assert.equal(ref.creatorRationale,'');
  assert.equal(ref.pageUrl,page);
  assert.equal(ref.sourceUrl,product);
  assert.equal(ref.sha256,createHash('sha256').update(sample).digest('hex'));
  assert.deepEqual(await board.publish(),[{name:ref.name,kind:'image'}]);
  assert.deepEqual(await readFile(join(dir,ref.name)),sample);
});


test('an uploaded case only binds its image and author quote through their own supplied provenance',async t=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const dir=await mkdtemp(join(tmpdir(),'research-upload-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const page='https://brand.example/case', imageUrl='https://brand.example/pack.png';
  const name='案例.png', path=join(dir,name), sha256=createHash('sha256').update(png).digest('hex');
  await writeFile(path,png);
  const quote='我们把品类名放在显眼的位置。';
  const supplied=[page,imageUrl,name,sha256,quote].join('\n');
  const args={dir,project:{brief:'燕麦饮包装'},carrier:'packaging',pages:[{url:page,imageUrl,title:'原味纸盒'}],
    dependencies:{lookup:async()=>{throw Error('fixture: source not reachable');}},readSource:async()=>null,
    documents:[{name:'品牌摘录.md',text:supplied}],uploadedImages:[{name,path,sha256}]};
  const caseCall=(rationaleQuote,rationaleSourceUrl)=>async(_prompt,images,_schema,task)=>{
    if (_schema.properties.front) return {parsedOutput:{front:'正面上方有字',regions:['中央']}};
    if (_schema.properties.verifiedFront) return {parsedOutput:{verifiedFront:'正面上方有品类名称',checks:[]}};
    const entry=JSON.parse(task.context).sources[0];
    assert.ok(entry.sourcePassages.some(s=>s.includes(quote)));
    return {parsedOutput:{samples:[{source:images[0].imageId,title:'原味纸盒',observation:'正面上方有品类名称',
      creatorRationale:'让品类名显眼',rationaleSourceUrl,rationaleQuote,takeaway:'在正面测试清楚的品类名，货架效果需验证'}],
      conclusion:'样本把品类信息放在显眼位置',implication:'先试品类名的位置'}};
  };
  const good=await researchCompetitors({...args,call:caseCall(quote,page)});
  const [ref]=good.finding.images;
  assert.equal(ref.rationaleQuote,quote);
  assert.equal(ref.rationaleSourceUrl,page);
  assert.equal(ref.rationaleAttachment,'品牌摘录.md');
  assert.equal(ref.imageAttachment,name);
  assert.equal(ref.sha256,sha256);
  assert.match(ref.takeaway,/货架效果需验证/);
  for (const [citation,url] of [['没有这句的转述',page],[quote,'https://other.example/case']]) {
    const result=await researchCompetitors({...args,call:caseCall(citation,url)});
    assert.equal(result.finding.visualOnly,true);
    assert.equal(result.finding.images[0].creatorRationale,'');
    assert.equal(result.finding.images[0].rationaleSourceUrl,'');
    assert.equal(result.finding.images[0].rationaleQuote,'');
    assert.doesNotMatch(result.finding.evidence,/让品类名显眼/);
  }
  const unrelated=await researchCompetitors({...args,documents:[{name:'品牌摘录.md',text:supplied.replace(sha256,'无对应原图')}],
    call:()=>assert.fail('unmatched upload must not reach a reviewer')});
  assert.equal(unrelated,null);
});

test('named packages retain the first read by image across follow-ups and inspect real crops for the brief',async t=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const dir=await mkdtemp(join(tmpdir(),'research-detail-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const url='https://brand.example.org/products';
  const pages=['茶甲','茶乙'].map(brand=>({url,brand}));
  const acquiredByPage=new Map();
  for (const [i,page] of pages.entries()) {
    const path=join(dir,'case-'+i+'.png');
    // Separate source bytes even though both fixtures have identical visible pixels.
    const bytes=Buffer.concat([png,Buffer.from([i])]);
    await writeFile(path,bytes);
    acquiredByPage.set(page,[{path,pageUrl:url,sourceUrl:url+'/'+i+'.png',title:page.brand,
      name:'case-'+i+'.png',imageId:'ref_'+i,sha256:createHash('sha256').update(bytes).digest('hex'),width:300,height:480}]);
  }
  const brief='瓶装茶包装，希望开盖方便。';
  let firstCount=0;
  const args={dir,carrier:'packaging',pages,acquiredByPage,project:{brief},
    call:async (_instruction,[image,...details],schema,task)=>{
      assert.equal(JSON.parse(task.context).brief,brief);
      if (schema.properties.front) {
        firstCount++;
        return {parsedOutput:{brand:image.title,front:image.title+'第一次观察',regions:['左上']},responseText:'原始回复 '+image.title};
      }
      assert.equal(details.length,1);
      const crop=await readFile(details[0].path);
      assert.equal(crop.readUInt32BE(16),1280);
      return {parsedOutput:{verifiedFront:'白色标签居中',checks:[{question:'是否方便开盖',status:'未核实',location:'',marking:'编造的字'}]}};
    }};
  const board=await researchCompetitors(args);
  const refs=board.finding.images;
  assert.deepEqual(refs.map(i=>[i.title,i.sourceUrl]),[['茶甲',url+'/0.png'],['茶乙',url+'/1.png']]);
  assert.deepEqual(refs.map(r=>r.firstRead.raw),['原始回复 茶甲','原始回复 茶乙']);
  assert.match(refs[0].observation,/未核实/);
  assert.doesNotMatch(refs[0].observation,/编造/);
  const next=await researchCompetitors({...args,previous:refs});
  assert.equal(firstCount,2);
  assert.deepEqual(next.finding.images.map(r=>r.firstRead),refs.map(r=>r.firstRead));
});

test('a regional brand homepage leads through its category to the original in the product gallery',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'brand-catalogue-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const site='https://brand.example.cn';
  const pages=new Map([
    ['/', '<a href="/cats/products">猫系列</a><img src="/logo.png" alt="品牌">'],
    ['/cats/products','<article>成年猫粮<a href="/cats/products/12">浏览产品</a></article>'],
    ['/cats/products/12','<title>成猫粮</title><div class="products-image-url">/original.png</div><img src="/ico-weibo.png">'],
  ]);
  const visited=[];
  const capture=(o,defaults)=>capturePublicSource(o,{...defaults,lookup:async()=>[{address:'93.184.216.34',family:4}],
    transport:async({url})=>{
      visited.push(url.pathname);
      if (url.pathname==='/original.png') return {status:200,headers:{'content-type':'image/png'},body:png};
      return {status:pages.has(url.pathname)?200:404,headers:{'content-type':'text/html'},body:Buffer.from(pages.get(url.pathname)||'')};
    }});
  const result=await searchVisualImages({dir,query:'成猫粮',pages:[{url:site+'/',brand:'品牌',category:'猫粮',catalogTerms:['cat','猫'],official:true}]},{capture});
  assert.deepEqual(visited,['/','/cats/products','/cats/products/12','/original.png']);
  assert.equal(result[0].sourceUrl,site+'/original.png');
  assert.equal(result[0].pageUrl,site+'/cats/products/12');
});
