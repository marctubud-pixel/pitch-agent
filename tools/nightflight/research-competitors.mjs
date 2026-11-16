import {link} from 'node:fs/promises';
import {basename, extname, join} from 'node:path';
import {searchVisualImages} from './public-visual-search.mjs';
import {capturePublicSource} from '../workbench/source-acquisition.mjs';

const string = {type:'string'};
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const observations = (sources) => object({
  samples:{type:'array',items:object({source:{type:'string',enum:sources}, title:string, observation:string})},
  conclusion:string, implication:string,
});
const publicPage = url => {
  try {return new URL(url).protocol === 'https:';} catch {return false;}
};

export async function researchCompetitors({call, dir, pages, previous = [], project, carrier, signal, dependencies, onEvent}) {
  const uniquePages = new Map();
  for (const page of pages ?? []) {
    if (page && publicPage(page.url) && !uniquePages.has(page.url)) uniquePages.set(page.url,page);
  }
  if (uniquePages.size || previous.length) await onEvent?.('正在打开竞品原图，核对图上可见的品类、品牌和信息层级');
  const capture = (options, defaults) => capturePublicSource(options,{...defaults,...dependencies});
  const groups = await Promise.all([...uniquePages.values()].slice(0,6).map(async page =>
    (await searchVisualImages({dir,signal,query:'竞品作品原图',pages:[page]}, {capture}))
      .filter(image => Math.min(image.width,image.height)>=140)));
  // First compare distinct pages. A second view is useful only if room remains.
  const pool = new Map();
  for (const image of [...previous, ...groups.map(g=>g[0]), ...groups.flat()].filter(Boolean)) {
    if (!pool.has(image.sha256)) pool.set(image.sha256,image);
  }
  const images = [...pool.values()].slice(0,4);
  if (!images.length) return null;
  const packet = {brief:project.brief, carrier, sources:images.map((i,index)=>({imageNumber:index+1,
    source:i.imageId,title:i.title,pageUrl:i.pageUrl,
  }))};
  const {parsedOutput: result}=await call('逐张观察所附原图。包装委托只选同类产品上清楚可见的实际包装正面，KV委托只选同类可辨认的主视觉或海报。剔除徽标、导航、场景空镜、不相干载体、同一包装的重复角度和无法识别的图。根据传入图片的顺序和 imageNumber 看图。每项只从枚举中选一个所见原图的 source，辨认不了的跳过。samples 每项给对应 source、中文图名（保留品牌名）、一条画面观察；留空表示没有适用原图。对所选样本共同写一条有边界的比较结论和对策略的具体用途。仅一张时限于这一个案例，无市场占比、因果或消费者反应推测。',images,observations(images.map(i=>i.imageId)),{
    rules:[],assignment:'竞品原图观察',context:JSON.stringify(packet),
  });
  if (!Array.isArray(result?.samples) || !result.conclusion?.trim() || !result.implication?.trim()) return null;
  const selected = [], seen = new Set();
  for (const row of result.samples) {
    const image = images.find(i=>i.imageId===row.source);
    if (!image || seen.has(row.source) || !row.title?.trim() || !row.observation?.trim()) continue;
    seen.add(row.source);
    selected.push({image,description:{name:'research-peer-'+image.sha256+extname(basename(image.name)),
      sha256:image.sha256,sourceUrl:image.sourceUrl,pageUrl:image.pageUrl,title:row.title.trim(),observation:row.observation.trim()}});
  }
  if (!selected.length) return null;
  const refs = selected.map(row=>row.description);
  const finding = {chapter:'竞争与同类传播',conclusion:result.conclusion.trim(),implication:result.implication.trim(),
    evidence:refs.map(r=>r.title+'：'+r.observation).join('\n'),url:refs[0].pageUrl,
    source:refs.map(r=>r.title).join('、'),images:refs};
  return {finding, images:selected.map(r=>r.image), async publish() {
    return Promise.all(selected.map(async ({image, description})=>{
      await link(image.path,join(dir,description.name));
      return {kind:'image',name:description.name};
    }));
  }};
}
