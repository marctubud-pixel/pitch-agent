import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
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

test('creative fallback keeps the publisher page and the actual indexed image, only when opted in',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'visual-search-index-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const page='https://photos.example.org/author/135', original='https://images.example.org/135.png';
  const attempts=[];
  const capture=options=>capturePublicSource(options,{
    lookup:async()=>[{address:'93.184.216.34',family:4}],
    transport:async({url})=>{
      attempts.push(url.href);
      if (url.hostname==='api.openverse.org') return {status:200,headers:{'content-type':'application/json'},
        body:Buffer.from(JSON.stringify({results:[{url:original,foreign_landing_url:page,title:'微距切面',thumbnail:'https://thumb.example.org/135'}]}))};
      if (url.href===original) return {status:200,headers:{'content-type':'image/png'},body:png};
      throw Error('unavailable');
    },
  });
  const deps={capture,search:async()=>({receipt:{results:[]}})};
  assert.deepEqual(await searchVisualImages({dir,query:'fruit macro'},deps),[]);
  assert.ok(attempts.every(url=>!url.includes('openverse.org')));
  const [photo]=await searchVisualImages({dir,query:'fruit macro',creativeFallback:true},deps);
  assert.deepEqual(await readFile(photo.path),png);
  assert.equal(photo.sourceUrl,original);
  assert.equal(photo.pageUrl,page);
  assert.ok(attempts.every(url=>!url.includes('thumb.example.org')));
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
    schema.properties.verifiedFront ? {parsedOutput:{actualPackaging:true,categoryMatch:'同类',visibleProduct:'原味燕麦饮',verifiedFront:'包装正面品类名置顶。',checks:[{question:'品类',location:'顶部',marking:'原味',status:'看清'}]}} : ({parsedOutput:{samples:[
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
    if (_schema.properties.verifiedFront) return {parsedOutput:{actualPackaging:true,categoryMatch:'同类',visibleProduct:'原味燕麦饮',verifiedFront:'正面上方有品类名称',checks:[{question:'品类',location:'顶部',marking:'原味',status:'看清'}]}};
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

test('publication evidence uses the original sentence for the image and still rejects film-only proof',async t=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const dir=await mkdtemp(join(tmpdir(),'research-poster-excerpts-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const page={url:'https://public.example.org/case',title:'果园新品专场',carrier:'kv'};
  const release='果园品牌携手便利店开启秋季专场，为顾客提供当季产品。';
  const film='同期推出了介绍果园产地的宣传片。';
  const image={path:join(dir,'image.png'),imageId:'ref_1',pageUrl:page.url,sourceUrl:page.url+'/image.png',
    title:page.title,name:'image.png',sha256:createHash('sha256').update(png).digest('hex'),width:300,height:480,articleText:release+film};
  await writeFile(image.path,png);
  const args={dir,carrier:'kv',pages:[page],acquiredByPage:new Map([[page,[image]]]),project:{brief:'秋季果园海报'}};
  const result=option=>researchCompetitors({...args,call:async(_prompt,[image],_schema,task)=>{
    const [entry]=JSON.parse(task.context).sources;
    assert.deepEqual(entry.publicationChoices,[{id:'P1',text:release},{id:'P2',text:film}]);
    return {parsedOutput:{conclusion:'同类用当季产品作主视觉',implication:'首屏突出当季产品',samples:[{
      source:image.imageId,title:page.title,observation:'画面展示当季产品和活动名',sameCategory:true,
      assetType:'宣传海报或主视觉',publishedPoster:true,publicationRef:option,publicationQuote:'开启秋季专场，同期推出了宣传片。',
    }]}};
  }});
  const board=await result('P1');
  assert.equal(board.finding.images[0].publicationQuote,release);
  assert.equal(board.finding.images[0].pageUrl,page.url);
  for (const option of ['','P2','P3']) assert.equal(await result(option),null);
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
  const brief='为自家500毫升瓶装茶做包装，想要开盖方便。';
  let firstCount=0;
  const args={dir,carrier:'packaging',pages,acquiredByPage,project:{brief},
    call:async (_instruction,[image,...details],schema,task)=>{
      const {questions}=JSON.parse(task.context);
      assert.ok(questions.some(q=>q.includes('开合')));
      assert.ok(questions.some(q=>q.includes('净含量')));
      assert.doesNotMatch(task.context,/500|自家/);
      if (schema.properties.front) {
        firstCount++;
        return {parsedOutput:{brand:image.title,front:image.title+'第一次观察',regions:['左上']},responseText:'原始回复 '+image.title};
      }
      assert.equal(details.length,1);
      const crop=await readFile(details[0].path);
      assert.equal(crop.readUInt32BE(16),1280);
      return {parsedOutput:{actualPackaging:true,categoryMatch:'同类',visibleProduct:image.title,verifiedFront:'白色标签居中。未见开盖提示。',checks:[{question:'标签',location:'正面中间',marking:'白色标签',status:'看清'},{question:'是否方便开盖',status:'未核实',location:'',marking:'编造的字'}]}};
    }};
  const board=await researchCompetitors(args);
  const refs=board.finding.images;
  assert.deepEqual(refs.map(i=>[i.title,i.sourceUrl]),[['茶甲',url+'/0.png'],['茶乙',url+'/1.png']]);
  assert.deepEqual(refs.map(r=>r.firstRead.raw),['原始回复 茶甲','原始回复 茶乙']);
  assert.match(refs[0].observation,/未核实/);
  assert.doesNotMatch(refs[0].observation,/编造|未见开盖提示/);
  const next=await researchCompetitors({...args,previous:refs});
  assert.equal(firstCount,2);
  assert.deepEqual(next.finding.images.map(r=>r.firstRead),refs.map(r=>r.firstRead));
});

test('package read transport failure keeps verified siblings and excludes failed originals from generic review',async t=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const dir=await mkdtemp(join(tmpdir(),'packaging-transport-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const page={url:'https://socialbeta.com/campaign/10042',title:'坚果活动案例'};
  const images=[];
  for (let index=0;index<3;index++) {
    const name=index+'.png',path=join(dir,name);
    const bytes=Buffer.concat([png,Buffer.from([index])]);
    await writeFile(path,bytes);
    images.push({name,path,width:300,height:400,title:'样本'+index,pageUrl:page.url,sourceUrl:page.url+'/'+name,
      imageId:'ref_'+index,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const args={dir,project:{brief:'坚果礼盒包装正面'},pages:[page],acquiredByPage:new Map([[page,images]]),
    carrier:'packaging',category:'混合坚果礼盒',broadCategory:'坚果'};
  const transport=Object.assign(Error('The network connection was lost.'),{code:'READ_CONNECTION_LOST'});
  const exhausted=Error('视觉理解 API 调用失败：'+transport.message,{cause:transport});
  const quota=Error('视觉理解 API 调用失败：视觉理解接口 HTTP 429',{cause:Error('视觉理解接口 HTTP 429')});
  const checked={question:'标签',location:'正面',marking:'混合坚果',status:'看清'};
  async function inspect({hasVerified,events,observed=[],failure=exhausted}) {
    return researchCompetitors({...args,onEvent:message=>events.push(message),call:async(_instruction,attachments,schema)=>{
      const image=attachments[0];
      if (schema.properties.front) {
        return {parsedOutput:{brand:'',front:'包装初读',regions:['中央']}};
      }
      if (schema.properties.actualPackaging) {
        if (image.imageId==='ref_2') throw failure;
        return {parsedOutput:{actualPackaging:hasVerified && image.imageId==='ref_0',categoryMatch:'同类',
          visibleProduct:'混合坚果礼盒',verifiedFront:'包装正面',checks:[checked]}};
      }
      observed.push(...attachments.map(item=>item.imageId));
      return {parsedOutput:{samples:attachments.map(item=>({source:item.imageId,title:item.title,observation:'画面可见坚果',sameCategory:true})),
        conclusion:'外观观察',implication:'仅作信息层级比较'}};
    }});
  }
  await t.test('a completed same-category package remains available, unlike the failed and unqualified items',async()=>{
    const observed=[],events=[];
    const board=await inspect({hasVerified:true,observed,events});
    assert.deepEqual(board.finding.images.map(image=>image.sha256),[images[0].sha256]);
    assert(!observed.includes('ref_2'));
    assert.equal(events.filter(line=>line.includes(page.url)).length,1);
  });
  await t.test('one broken read and two non-packages produce no evidence board',async()=>{
    const observed=[],events=[];
    assert.equal(await inspect({hasVerified:false,observed,events}),null);
    assert(!observed.includes('ref_2'));
    assert.equal(events.filter(line=>line.includes(page.url)).length,1);
  });
  await t.test('a quota or other untyped error still stops the operation',async()=>{
    const events=[];
    await assert.rejects(inspect({hasVerified:true,events,failure:quota}),err=>err===quota);
    assert(!events.some(line=>line.includes(page.url)));
  });
});

test('packaging evidence preserves printed specifications but does not publish conflicting crop positions or unprinted window counts',async t=>{
  const {readPackaging}=await import('./research-packaging.mjs');
  const dir=await mkdtemp(join(tmpdir(),'packaging-precision-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'pack.png');
  await writeFile(path,png);
  const image={path,mediaType:'image/png',sha256:createHash('sha256').update(png).digest('hex'),pageUrl:'https://brand.example.org/item'};
  const first={brand:'洽洽',front:'左上印有“洽洽 坚果礼”。右侧透窗可见6瓶装。净含量1.565kg。盒内规格印有“盒内7袋”。',regions:['中央','左上','右上']};
  const packCheck='画面上可见的内包装、分装或固定结构';
  const layout='商品是什么，包装主面的信息怎么摆放';
  const weight='画面上可见的容器形状，规格或净含量原字';
  const checked=(question,location,marking)=>({question,location,marking,status:'看清'});
  const observed=[checked(layout,'中央','洽洽 坚果礼'),checked(layout,'左上','洽洽 坚果礼'),
    checked(packCheck,'中央','5个透明塑料瓶，顶部为金色瓶盖'),
    checked(packCheck,'右侧','六个不同口味的透明罐子'),
    checked(packCheck,'正面','印有“盒内7袋”'),checked(weight,'底部','净含量：1.565kg'),
    checked('开口及开合、回封标识的位置与原字','右上','easyopen & zipsystem')];
  const result=await readPackaging({image,dir,brief:'混合坚果包装独立小袋，规格与开合结构',category:'坚果礼盒',
    call:async (_prompt,_images,schema)=>schema.properties.front ? {parsedOutput:first,responseText:'原始首次实答'} :
      {parsedOutput:{actualPackaging:true,visibleProduct:'洽洽坚果礼',categoryMatch:'同类',verifiedFront:'正面',checks:observed}}});
  assert.equal(result.firstRead.raw,'原始首次实答');
  assert.match(result.observation,/正面，洽洽 坚果礼/u);
  assert.match(result.observation,/左上，洽洽 坚果礼/u);
  assert.doesNotMatch(result.observation,/中央，洽洽 坚果礼|5个透明塑料瓶|六个不同口味/u);
  assert.match(result.observation,/多个透明塑料瓶，顶部为金色瓶盖/u);
  assert.match(result.observation,/印有“盒内7袋”/u);
  assert.match(result.observation,/净含量：1.565kg/u);
  assert.match(result.observation,/右上，easyopen & zipsystem/u);
  const evidence=join(dir,'.research-evidence','packaging-reads');
  const [folder]=await readdir(evidence);
  const detail=JSON.parse(await readFile(join(evidence,folder,'detail.json'),'utf8'));
  assert.deepEqual(detail.checks,observed);
  assert.equal(detail.observation,result.observation);
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

test('a gift-box menu leads to its named SKU, whose own gallery wins over category icons and recommendations',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'gift-box-original-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const site='https://brand.example.cn';
  const pages=new Map([
    ['/','<a href="/nuts">坚果类</a><a href="/boxes">礼盒</a>'],
    ['/boxes','<nav><img src="/icon.png" alt="坚果分类"></nav><article><a href="/p/781.html"><img src="/card.png" alt="什锦坚果礼盒">什锦坚果礼盒</a></article>'],
    ['/p/781.html','<title>什锦坚果礼盒</title><div class="banner"><div class="swiper-slide"><img src="/banner.jpg" alt="乙系列坚果礼盒促销横幅"></div></div><main><h1>什锦坚果礼盒</h1><figure class="product-gallery"><img src="/original.jpg"></figure></main>'+
      '<aside><a href="/p/782.html"><img data-src="/other.jpg" alt="坚果新品"></a></aside>'],
    ['/nuts','<nav><img src="/icon.png" alt="坚果类"></nav>'],
  ]);
  const sample=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAKAAAADwCAAAAACiKjAGAAAAPElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBpbwAAHEOZGbAAAAAElFTkSuQmCC','base64');
  const visited=[];
  const capture=o=>capturePublicSource(o,{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async({url})=>{
    visited.push(url.pathname);
    if (url.pathname.endsWith('.jpg')) return {status:200,headers:{'content-type':'image/png'},body:sample};
    return {status:pages.has(url.pathname)?200:404,headers:{'content-type':'text/html'},body:Buffer.from(pages.get(url.pathname)||'')};
  }});
  const image=await searchVisualImages({dir,query:'坚果 包装盒',pages:[{url:site+'/',brand:'品牌',official:true,
    category:'混合坚果',catalogTerms:['坚果'],packagingTerm:'包装盒',carrier:'packaging'}]},{capture});
  assert.deepEqual(image.map(i=>[i.pageUrl,i.sourceUrl]),[[site+'/p/781.html',site+'/original.jpg']]);
  assert.ok(visited.indexOf('/boxes')<visited.indexOf('/nuts'));
  assert.ok(!visited.includes('/other.jpg') && !visited.includes('/icon.png') && !visited.includes('/banner.jpg'));
});

test('campaign searches return the publisher’s body image and its text on the same capture',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'campaign-body-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const site='https://publisher.example.org';
  const article='<head><meta property="og:image" content="/preview.png"></head><article>甲品牌发布了坚果海报。<img data-src="/ad.png">'+
    '<aside>乙发布了海报。<img src="/other.png"></aside></article>';
  const unknown='<head><meta property="og:image" content="/preview.png"></head><div>推荐<img src="/other.png"></div>';
  const seen=[];
  const capture=o=>capturePublicSource(o,{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async({url})=>{
    seen.push(url.pathname);
    if (url.pathname.endsWith('.png')) return {status:200,headers:{'content-type':'image/png'},body:png};
    return {status:200,headers:{'content-type':'text/html'},body:Buffer.from(url.pathname==='/case'?article:unknown)};
  }});
  const images=await searchVisualImages({query:'坚果 海报',dir,pages:[{url:site+'/unknown',carrier:'kv'},{url:site+'/case',carrier:'kv'}]},{capture});
  assert.deepEqual(images.map(i=>[i.sourceUrl,i.articleText]),[[site+'/ad.png','甲品牌发布了坚果海报。']]);
  assert.ok(!seen.includes('/preview.png') && !seen.includes('/other.png'));
});

test('word boundaries distinguish English product names from navigation labels',()=>{
  const html=Buffer.from('<section><article><img src="/nut.png">Mixed Nuts</article><article><img src="/nav.png">Catalogue</article></section>');
  const site='https://brand.example.org';
  assert.deepEqual(productCardImages(html,site,'Acme',[],['mixed nuts']).map(i=>i.url),[site+'/nut.png']);
  assert.deepEqual(productCardImages(html,site,'Acme',[],['cat']),[]);
});

test('only a real same-category package passes, including a legible side view',async t=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const dir=await mkdtemp(join(tmpdir(),'package-kind-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const objects=[['散装核桃仁',false,'同类'],['魔芋袋',true,'其他品类'],['空盒样板',false,'未核实'],['混合坚果礼盒侧面',true,'同类']];
  const pages=[],acquiredByPage=new Map();
  for (const [i,[title]] of objects.entries()) {
    const bytes=Buffer.concat([png,Buffer.from([i])]),file=i+'.png',path=join(dir,file);
    const url='https://brand.example.org/products/'+i,page={url,title,brand:'同一品牌'};
    await writeFile(path,bytes);pages.push(page);
    acquiredByPage.set(page,[{name:file,path,width:300,height:400,title,pageUrl:url,sourceUrl:url+'/large.png',
      imageId:'ref_'+i,sha256:createHash('sha256').update(bytes).digest('hex')}]);
  }
  const call=async(_prompt,[image],schema,task)=>{
    if (schema.properties.front) return {parsedOutput:{brand:'同一品牌',front:'实物',regions:['中央']}};
    const query=JSON.parse(task.context);
    assert.equal(query.targetCategory,'坚果');
    assert.equal(query.comparisonCategory,'小袋混合坚果');
    const [title,actualPackaging,categoryMatch]=objects[Number(image.imageId.slice(4))];
    return {parsedOutput:{actualPackaging,categoryMatch,visibleProduct:title,verifiedFront:'',
      checks:[{question:'可见标志',location:'侧面中央',marking:title,status:'看清'}]}};
  };
  const board=await researchCompetitors({dir,project:{brief:'坚果盒'},pages,acquiredByPage,carrier:'packaging',category:'小袋混合坚果',broadCategory:'坚果',call});
  assert.deepEqual(board.finding.images.map(i=>[i.title,i.actualPackaging,i.categoryMatch]),[['混合坚果礼盒侧面',true,'同类']]);
});
