import {link} from 'node:fs/promises';
import {basename, extname, join} from 'node:path';
import {searchVisualImages} from './public-visual-search.mjs';
import {capturePublicSource} from '../workbench/source-acquisition.mjs';

const string = {type:'string'};
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const observations = (sources) => object({
  samples:{type:'array',items:object({source:{type:'string',enum:sources}, title:string, observation:string, sameCategory:{type:'boolean'}, strategyGroup:string, creatorRationale:string, rationaleSourceUrl:string, rationaleQuote:string, takeaway:string})},
  conclusion:string, implication:string,
});
const publicPage = url => {
  try {return new URL(url).protocol === 'https:';} catch {return false;}
};

function quoteText(text) {
  return text.normalize('NFKC').replace(/\s+/gu,'');
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

export async function researchCompetitors({call, dir, pages, acquiredByPage = new Map(), previous = [], project, carrier, signal, dependencies, onEvent, readSource, documents = [], uploadedImages = []}) {
  const uniquePages = new Map();
  for (const page of pages ?? []) {
    if (page && publicPage(page.url) && !uniquePages.has(page.url)) uniquePages.set(page.url,page);
  }
  if (uniquePages.size || previous.length) await onEvent?.('正在打开竞品原图，核对图上可见的品类、品牌和信息层级');
  const capture = (options, defaults) => capturePublicSource(options,{...defaults,...dependencies});
  const groups = await Promise.all([...uniquePages.values()].slice(0,6).map(async page =>
    (acquiredByPage.get(page.url) ?? await searchVisualImages({dir,signal,query:'竞品作品原图',pages:[page]}, {capture}))
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
  for (const image of [...preferred, ...previous, ...groups.flat()].filter(Boolean)) {
    if (!pool.has(image.sha256)) pool.set(image.sha256,image);
  }
  const images = [...pool.values()].slice(0,4);
  if (!images.length) return null;
  const caseSources = await Promise.all(images.map(async image => {
    const candidate = image.casePage ?? uniquePages.get(image.pageUrl);
    const sourceUrl = candidate?.rationaleSourceUrl || image.rationaleSourceUrl || image.pageUrl;
    if (!publicPage(sourceUrl)) return {sourceUrl:'',passages:[]};
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
  const packet = {brief:project.brief, carrier, sources:images.map((image,index)=>({
    imageNumber:index+1,source:image.imageId,title:image.title,pageUrl:image.pageUrl,
    rationaleSourceUrl:caseSources[index].sourceUrl,sourcePassages:caseSources[index].passages.map(p=>p.text),
  }))};
  const {parsedOutput: result}=await call('逐张观察所附原图。包装委托只选同类产品上清楚可见的实际包装正面，KV委托只选同类可辨认的主视觉或海报。剔除徽标、导航、场景空镜、不相干载体、同一包装的重复角度和无法识别的图。根据传入图片的顺序和 imageNumber 看图。每项只从枚举中选一个所见原图的 source，辨认不了的跳过。samples 每项给对应 source、中文图名（保留品牌名）、一条画面观察；留空表示没有适用原图。同类商品的原图可以支持可见外观比较；创作者用意必须另有出处。对同品类案例共同写一条有边界的比较结论和对策略的具体用途。优先同品类、同渠道的可比项目；同品类标 sameCategory=true，邻近或不确定标 false，只作补充。strategyGroup 概括创作策略，同一策略用同一组名，没有可核创作说明留空。对每张图先写可见事实，再读该图绑定的 sourcePassages。只有明确是本项目品牌、设计方或奖项所载创作者说明时，creatorRationale 才概括其意图，rationaleQuote 逐字复制一段支持该意图的原语原文，rationaleSourceUrl 逐字用该图给定地址。仅有商品页、图片或第三方猜测，三个字段全部留空。takeaway 写本案能借的一项动作及不适用边界。意图、实看与效果分开。仅一张时限于这一个案例，无市场占比、因果或消费者反应推测。',images,observations(images.map(i=>i.imageId)),{
    rules:[],assignment:'竞品原图观察',context:JSON.stringify(packet),
  });
  if (!Array.isArray(result?.samples) || !result.conclusion?.trim() || !result.implication?.trim()) return null;
  const selected = [], seen = new Set();
  for (const row of result.samples) {
    const image = images.find(i=>i.imageId===row.source);
    if (!image || seen.has(row.source) || !row.title?.trim() || !row.observation?.trim()) continue;
    seen.add(row.source);
    const source = caseSources[images.indexOf(image)];
    const quote = row.rationaleQuote?.trim();
    const matched = quote && !/https?:\/\//iu.test(quote) && row.creatorRationale?.trim() && source.sourceUrl===row.rationaleSourceUrl &&
      source.passages.find(p=>quoteText(p.text).includes(quoteText(quote)));
    const rationale = matched ? {strategyGroup:row.strategyGroup?.trim() || '',creatorRationale:row.creatorRationale.trim(),rationaleSourceUrl:source.sourceUrl,rationaleQuote:quote,
      ...(matched.attachment ? {rationaleAttachment:matched.attachment} : {})} : {strategyGroup:'',creatorRationale:'',rationaleSourceUrl:'',rationaleQuote:''};
    selected.push({image,description:{name:'research-peer-'+image.sha256+extname(basename(image.name)),
      sha256:image.sha256,sourceUrl:image.sourceUrl,pageUrl:image.pageUrl,carrier,sameCategory:row.sameCategory===true,...(image.imageAttachment ? {imageAttachment:image.imageAttachment,imageProvenanceAttachment:image.imageProvenanceAttachment} : {}),title:row.title.trim(),observation:row.observation.trim(),takeaway:matched ? row.takeaway?.trim() || '' : '',...rationale}});
  }
  if (!selected.length) return null;
  const refs = selected.map(row=>row.description);
  const grounded = refs.filter(ref=>ref.creatorRationale || ref.sameCategory);
  const visualOnly = grounded.length===0;
  const finding = {
    chapter:'竞争与同类传播', visualOnly,
    conclusion:visualOnly ? '已核实同类作品图像，创作者意图待核。' : result.conclusion.trim(),
    implication:visualOnly ? '仅供查看公开作品的画面。' : result.implication.trim(),
    evidence:(visualOnly?refs:grounded).map(r=>r.title+'：'+r.observation+
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
