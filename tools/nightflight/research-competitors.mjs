import {supportsPoster} from './research-sources.mjs';
import {readPackaging} from './research-packaging.mjs';
import {isReadTransportFailure} from './desktop-text.mjs';
import {independentCalls} from './call-checkpoints.mjs';
import {link} from 'node:fs/promises';
import {basename, extname, join} from 'node:path';
import {searchVisualImages} from './public-visual-search.mjs';
import {capturePublicSource} from '../workbench/source-acquisition.mjs';

const string = {type:'string'};
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const observations = (sources,carrier) => object({
  samples:{type:'array',items:object({source:{type:'string',enum:sources}, title:string, observation:string, sameCategory:{type:'boolean'},
    ...(carrier==='kv' ? {assetType:{type:'string',enum:['宣传海报或主视觉','视频画面','商品照片','其他或未核实']},publicationRef:string} : {}), publishedPoster:{type:'boolean'}, publicationQuote:string, strategyGroup:string, creatorRationale:string, rationaleSourceUrl:string, rationaleQuote:string, takeaway:string})},
  conclusion:string, implication:string,
});
const publicPage = url => {
  try {return new URL(url).protocol === 'https:';} catch {return false;}
};

function quoteText(text) {
  return text.normalize('NFKC').replace(/\s+/gu,'');
}

function releaseExcerpts(passages) {
  const publication=/发布|推出|投放|展出|上线|亮相|联动|携手|专场|开展|开启|发起|海报|主视觉|宣传图|长图|\b(?:campaign|poster|key visual|launch|released?|published?|exhibit)\b/iu;
  const sentences=passages.flatMap(({text})=>text.split(/(?<=[。！？])|[\r\n]+/u).map(line=>line.trim()));
  return [...new Set(sentences.filter(line=>publication.test(line)))].slice(0,24).map((text,index)=>({id:'P'+(index+1),text}));
}

function documentPassages(documents, url, relatedUrls = []) {
  const passages = [];
  for (const document of documents) {
    // Filenames come from uploaded artifacts. A URL in a different case cannot authenticate a quote.
    for (const paragraph of document.text.split(/\n\s*\n/u)) {
      const urls = paragraph.match(/https:\/\/[^\s<>"，。；）)\]]+/gu) ?? [];
      if (urls.includes(url) && urls.every(other=>other===url || relatedUrls.includes(other))) {
        passages.push({text:paragraph,attachment:document.name});
      }
    }
  }
  return passages;
}

const pageKey = page=>[page.url,page.brand || ''].join('\n');

async function captionPoster(call, candidate) {
  const {image,description}=candidate;
  const result=await call('只观察这一张海报原图，写一句可定位的画面观察。看画面里的主体、布局、色彩或清晰读到的字样。只在品牌或名称字样在实际图上清晰可辨时才写该原字。图没有显露的参与品牌、活动规模、投放渠道和人群效果都不属于这条观察。细小或模糊处留作未核实。',[image],
    object({observation:string}),{rules:[],assignment:'海报原图内容核读',context:JSON.stringify({原图指纹:image.sha256})});
  const observation=result.parsedOutput?.observation?.trim();
  return observation ? {image,description:{...description,observation}} : null;
}

export async function researchCompetitors({call, dir, pages, acquiredByPage = new Map(), previous = [], project, category, broadCategory, carrier, signal, dependencies, onEvent, readSource, documents = [], uploadedImages = []}) {
  const uniquePages = new Map();
  const legacyPosters=carrier==='kv' ? previous.filter(i=>!i.publicationPlacement || !i.assetType).map(i=>({url:i.pageUrl,title:i.title,imageUrl:i.sourceUrl,carrier})) : [];
  for (const page of [...(pages ?? []),...legacyPosters]) {
    if (page && publicPage(page.url) && !uniquePages.has(pageKey(page))) uniquePages.set(pageKey(page),page);
  }
  if (uniquePages.size || previous.length) await onEvent?.('正在打开竞品原图，核对图上可见的品类、品牌和信息层级');
  const capture = (options, defaults) => capturePublicSource(options,{...defaults,...dependencies});
  const groups = await Promise.all([...uniquePages.values()].slice(0,6).map(async page =>
    (acquiredByPage.get(page) ?? await searchVisualImages({dir,signal,query:'竞品作品原图',pages:[{...page,carrier}]}, {capture}))
      .filter(image => Math.min(image.width,image.height)>=140)
      .map(image=>({...image,casePage:page}))));
  // A locally supplied case image must be identifiable against the user's provenance material.
  const uploads = [];
  for (const page of uniquePages.values()) {
    if (!publicPage(page.imageUrl)) continue;
    const passages = documentPassages(documents,page.url,[page.imageUrl,page.rationaleSourceUrl]);
    for (const image of uploadedImages) {
      const source = passages.find(p=>p.text.includes(image.name) && p.text.includes(image.sha256) && p.text.includes(page.imageUrl));
      if (!source) continue;
      uploads.push({...image,imageId:'ref_'+image.sha256,sourceUrl:page.imageUrl,pageUrl:page.url,title:page.title,
        casePage:page,imageAttachment:image.name,imageProvenanceAttachment:source.attachment});
    }
  }
  // First compare distinct pages. A second view is useful only if room remains.
  const pool = new Map();
  const preferred = [...uniquePages.values()].slice(0,6).map((page,index)=>
    uploads.find(i=>i.pageUrl===page.url) || groups[index]?.[0]);
  const reusable=carrier==='kv' ? previous.filter(i=>['article','attachment'].includes(i.publicationPlacement)) : previous;
  for (const image of [...preferred,...reusable,...groups.flat()].filter(Boolean)) {
    if (!pool.has(image.sha256)) pool.set(image.sha256,image);
  }
  const images = [...pool.values()].slice(0,4);
  if (!images.length) return null;
  const isNamedProduct=image=>carrier==='packaging' && Boolean(image.casePage?.brand) && !image.imageAttachment;
  const blindPackaging=images.some(isNamedProduct);
  const caseSources = await Promise.all(images.map(async image => {
    if (isNamedProduct(image)) return {sourceUrl:'',passages:[]};
    const candidate = image.casePage ?? [...uniquePages.values()].find(page=>page.url===image.pageUrl);
    const sourceUrl = carrier==='kv' ? image.pageUrl : candidate?.rationaleSourceUrl || image.rationaleSourceUrl || image.pageUrl;
    if (!publicPage(sourceUrl)) return {sourceUrl:'',passages:[]};
    if (carrier==='kv') {
      if (image.imageProvenanceAttachment) {
        const passages=documentPassages(documents,sourceUrl,[image.sourceUrl,candidate?.rationaleSourceUrl]).filter(p=>
          p.attachment===image.imageProvenanceAttachment && p.text.includes(image.imageAttachment) && p.text.includes(image.sha256) && p.text.includes(image.sourceUrl));
        if (passages.length) return {sourceUrl,passages};
      }
      const text=image.articleText || (['article','attachment'].includes(image.publicationPlacement) ? image.publicationQuote : '');
      return {sourceUrl,passages:text ? [{text}] : []};
    }
    const original = await readSource?.(sourceUrl);
    const passages = documentPassages(documents,sourceUrl,[image.pageUrl,image.sourceUrl]);
    if (original?.text) {
      const hint = candidate?.rationaleQuote || image.rationaleQuote;
      const offset = hint ? original.text.indexOf(hint) : -1;
      const start = Math.max(0,offset-600);
      passages.unshift({text:original.text.slice(start,start+8000)});
    }
    return {sourceUrl,passages};
  }));
  const released=carrier==='kv' ? caseSources.map(({passages})=>releaseExcerpts(passages)) : [];
  const markUnread=async (error,image)=>{
    signal?.throwIfAborted();
    if (!isReadTransportFailure(error)) throw error;
    await onEvent?.('单张竞品'+(carrier==='kv'?'海报':'包装')+'读图未完成，原图暂未核实 · '+image.pageUrl+' · '+image.sha256.slice(0,12));
    return null;
  };
  const packet = {brief:project.brief,category,broadCategory,carrier, sources:images.map((image,index)=>({
    imageNumber:index+1,source:image.imageId,title:image.title,pageUrl:image.pageUrl,
    rationaleSourceUrl:caseSources[index].sourceUrl,sourcePassages:caseSources[index].passages.map(p=>p.text),
    ...(carrier==='kv' ? {publicationChoices:released[index]} : {}),
  }))};
  // Read the original before source commentary, and retain the earliest answer across follow-ups.
  const packagingReads=new Map();
  if (carrier==='packaging') {
    await independentCalls(images,async image=>{
      const read=await readPackaging({call,dir,image,brief:project.brief,category,broadCategory,signal,
        previous:previous.find(ref=>ref.sha256===image.sha256)}).catch(error=>markUnread(error,image));
      if (read) packagingReads.set(image.imageId,read);
    });
  }
  let result;
  if (blindPackaging) {
    const reads=images.filter(isNamedProduct).map(image=>{
      const read=packagingReads.get(image.imageId);
      return read && {source:image.imageId,title:image.title,observation:read.observation,sameCategory:read.categoryMatch==='同类'};
    });
    const samples=reads.filter(Boolean);
    result={samples,conclusion:samples.map(s=>s.title+'：'+s.observation).join('；'),implication:'将上述已核包装当作同货架参照，比较本案商品名、品类和识别图案的位置。'};
  }
  const remaining=images.filter(image=>!isNamedProduct(image) && (carrier!=='packaging' || packagingReads.has(image.imageId)));
  const implications=new Map();
  if (remaining.length) {
    const groups=carrier==='kv' ? remaining.map(image=>[image]) : [remaining];
    const responses=await Promise.all(groups.map(async group=>{
      const ids=group.map(image=>image.imageId);
      const sources=group.map((image,index)=>({...packet.sources[images.indexOf(image)],imageNumber:index+1}));
      const response=await call('逐张观察所附原图。包装委托选能识别商品的实际包装；观察仅限图上可见部分。KV委托选同类品牌实际采用的海报、电商宣传图或主视觉。规格、渠道、首屏位置只在描述具体投放位置时核对。剔除徽标、导航、场景空镜、不相干载体、同一包装的重复角度和无法识别的图。海报必须同时满足两项：图本身可辨认是完成的宣传海报或投放主视觉；该图来源页明确记载对应作品由谁发布、投放或展出。满足时 publishedPoster=true，并在 publicationRef 填本张图的 publicationChoices 中能支持发布的一条原文编号，例如 P2。选了编号时 publicationQuote 留空，由程序取保留的原句。没有对应编号但原文有直接发布证据时，publicationRef 留空，publicationQuote 逐字摘录一处连续原句。纯商品照片、平台标志、视频剧照、行业报告封面或调研图表、无实际传播发布记录的效果图均不符合。其他载体 publishedPoster 填 false，引文留空。根据传入图片的顺序和 imageNumber 看图。KV 先按单张图片实际物料填 assetType。视频标题卡、广告片截图和剧照全归视频画面；正文只说推出某部影片，不能证明这帧单独作为平面广告发布。品牌活动正文直接展示的独立促销长图可归宣传海报或主视觉。每项只从枚举中选一个所见原图的 source，辨认不了的跳过。samples 每项给对应 source、中文图名（保留品牌名）、一条画面观察；留空表示没有适用原图。同类商品的原图可以支持可见外观比较；创作者用意必须另有出处。对同品类案例共同写一条有边界的比较结论和对策略的具体用途。先按品类选可比作品；不同品牌、地区、价格、规格和销售或投放渠道的同品类作品可以比较，匹配本案条件时再细化。按 broadCategory 所指通用品类和作品载体判断，细分品类 category 与投放条件只在可核实时补充，同品类标 sameCategory=true，邻近或不确定标 false，只作补充。strategyGroup 概括创作策略，同一策略用同一组名，没有可核创作说明留空。对每张图先写可见事实，再读该图绑定的 sourcePassages。只有明确是本项目品牌、设计方或奖项所载创作者说明时，creatorRationale 才概括其意图，rationaleQuote 逐字复制一段支持该意图的原语原文，rationaleSourceUrl 逐字用该图给定地址。仅有商品页、图片或第三方猜测，三个字段全部留空。takeaway 写本案能借的一项动作及不适用边界。意图、实看与效果分开。仅一张时限于这一个案例，无市场占比、因果或消费者反应推测。',group,observations(ids,carrier),{
        rules:[],assignment:'竞品原图观察',context:JSON.stringify({...packet,sources}),
      });
      const other=response.parsedOutput;
      if (!Array.isArray(other?.samples) || !other.conclusion?.trim() || !other.implication?.trim()) return null;
      const samples=other.samples.filter(row=>ids.includes(row.source));
      for (const row of samples) implications.set(row.source,other.implication.trim());
      return {...other,samples};
    }));
    for (const other of responses.filter(r=>r?.samples.length)) {
      if (!result?.samples.length) result=other;
      else result={samples:[...result.samples,...other.samples],conclusion:[result.conclusion,other.conclusion].join('；'),implication:result.implication};
    }
  }
  if (!Array.isArray(result?.samples) || !result.conclusion?.trim() || !result.implication?.trim()) return null;
  let selected = [];
  const seen = new Set();
  for (const row of result.samples) {
    const image = images.find(i=>i.imageId===row.source);
    if (!image || seen.has(row.source) || !row.title?.trim() || !row.observation?.trim()) continue;
    const read=packagingReads.get(row.source);
    if (carrier==='packaging' && !read) continue;
    seen.add(row.source);
    const sourceIndex=images.indexOf(image);
    const source = caseSources[sourceIndex];
    const ref=typeof row.publicationRef==='string' && row.publicationRef.trim();
    const publicationQuote=ref ? released[sourceIndex]?.find(excerpt=>excerpt.id===ref)?.text :
      (typeof row.publicationQuote==='string' ? row.publicationQuote.trim() : '');
    const placement=image.articleText ? 'article' : image.imageProvenanceAttachment ? 'attachment' : image.publicationPlacement;
    if (carrier==='kv' && (!['article','attachment'].includes(placement) || !row.sameCategory || row.publishedPoster!==true || !supportsPoster(row,publicationQuote) ||
      source.sourceUrl!==image.pageUrl || !source.passages.some(p=>quoteText(p.text).includes(quoteText(publicationQuote))))) continue;
    const quote = row.rationaleQuote?.trim();
    const matched = quote && !/https?:\/\//iu.test(quote) && row.creatorRationale?.trim() && source.sourceUrl===row.rationaleSourceUrl &&
      source.passages.find(p=>quoteText(p.text).includes(quoteText(quote)));
    const rationale = matched ? {strategyGroup:row.strategyGroup?.trim() || '',creatorRationale:row.creatorRationale.trim(),rationaleSourceUrl:source.sourceUrl,rationaleQuote:quote,
      ...(matched.attachment ? {rationaleAttachment:matched.attachment} : {})} : {strategyGroup:'',creatorRationale:'',rationaleSourceUrl:'',rationaleQuote:''};
    selected.push({image,description:{name:'research-peer-'+image.sha256+extname(basename(image.name)),
      sha256:image.sha256,sourceUrl:image.sourceUrl,pageUrl:image.pageUrl,carrier,...(carrier==='kv' ? {assetType:row.assetType,publicationQuote,publicationPlacement:placement} : {}),sameCategory:row.sameCategory===true,...(image.imageAttachment ? {imageAttachment:image.imageAttachment,imageProvenanceAttachment:image.imageProvenanceAttachment} : {}),title:row.title.trim(),observation:read?.observation ?? row.observation.trim(),...(read ? {firstRead:read.firstRead,detailRegions:read.regions,categoryMatch:read.categoryMatch,visibleProduct:read.visibleProduct,actualPackaging:read.actualPackaging} : {}),takeaway:matched ? row.takeaway?.trim() || '' : '',...rationale}});
  }
  if (carrier==='kv') selected=(await independentCalls(selected,candidate=>captionPoster(call,candidate)
    .catch(error=>markUnread(error,candidate.image)))).filter(Boolean);
  if (!selected.length) return null;
  const refs = selected.map(row=>row.description);
  const grounded = refs.filter(ref=>ref.creatorRationale || ref.sameCategory);
  const visualOnly = grounded.length===0;
  const finding = {
    chapter:'竞争与同类传播', visualOnly,
    conclusion:visualOnly ? '已核实同类作品图像，创作者意图待核。' : grounded.map(r=>r.title+'：'+r.observation).join('；'),
    implication:visualOnly ? '仅供查看公开作品的画面。' : carrier==='kv' ? implications.get(selected[0].image.imageId) : result.implication.trim(),
    evidence:(visualOnly?refs:grounded).map(r=>r.title+'：'+r.observation+(r.publicationQuote?'；发布记录：'+r.publicationQuote:'')+
      (r.creatorRationale?'；创作者说明：'+r.creatorRationale+'（原文：'+r.rationaleQuote+'）':'')).join('\n'),
    url:(grounded[0] ?? refs[0]).pageUrl, source:(visualOnly?refs:grounded).map(r=>r.title).join('、'), images:refs,
  };
  return {finding, images:selected.map(r=>r.image), async publish(published = new Set()) {
    const unique = selected.filter(({description})=>{
      if (published.has(description.name)) return false;
      published.add(description.name);
      return true;
    });
    return Promise.all(unique.map(async ({image, description})=>{
      await link(image.path,join(dir,description.name));
      return {kind:'image',name:description.name};
    }));
  }};
}
