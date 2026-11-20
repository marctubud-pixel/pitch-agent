import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pythonBinary} from './runtime-dependencies.mjs';

const execute=promisify(execFile);
const zones=['左上','右上','左下','右下','中央'];
const string={type:'string'};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const firstSchema=object({brand:string,front:string,regions:{type:'array',items:{type:'string',enum:zones}}});
const detailSchema=object({actualPackaging:{type:'boolean'},visibleProduct:string,categoryMatch:{type:'string',enum:['同类','其他品类','未核实']},verifiedFront:string,checks:{type:'array',items:object({
  question:string,location:string,marking:string,status:{type:'string',enum:['看清','未核实']},
})}});

export async function readPackaging({call,dir,image,brief,category,broadCategory,previous,signal}) {
  const root=join(dir,'.research-evidence','packaging-reads');
  await mkdir(root,{recursive:true});
  const folder=await mkdtemp(join(root,image.sha256+'-'));
  let firstRead=previous?.firstRead;
  if (!firstRead) {
    const response=await call('只看这件包装原图。按客户 Brief 实际关心的问题观察，Brief 描述的是客户自己的产品。front 写你第一次实际看见的内容，包括与问题有关的文字、标识及其位置；看不清的写“未核实”。看不到文字不能断言包装没有该功能。brand 写可辨品牌。regions 按重要性选一至三个需要放大检查的区域，可包含横跨左右的区域，不猜答案。',[image],firstSchema,
      {rules:[],assignment:'单张包装读图',context:JSON.stringify({brief})});
    const answer=response.parsedOutput;
    firstRead={...answer,raw:response.responseText || JSON.stringify(answer),model:response.model,requestId:response.threadId};
  }
  await writeFile(join(folder,'first.json'),JSON.stringify({sha256:image.sha256,pageUrl:image.pageUrl,firstRead}),{mode:0o600});
  const selected=[...new Set(firstRead.regions ?? [])].filter(z=>zones.includes(z));
  const regions=(selected.length ? selected : ['中央','左上','右下']).slice(0,3);
  await execute(await pythonBinary(),['-I',fileURLToPath(new URL('./packaging-crops.py',import.meta.url)),image.path,folder,...regions],{signal,timeout:30000});
  const details=await Promise.all(regions.map(async (zone,i)=>{
    const path=join(folder,i+'.png');
    const bytes=await readFile(path);
    return {name:zone+'.png',imageId:'detail_'+i,mediaType:'image/png',path,byteLength:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex')};
  }));
  const review=await call('第一张是原图，接着是同一原图的真实局部放大，顺序见 regions。先用图上可辨的简短商品名或品类写 visibleProduct，只需足以区别商品，省略细小口号、成分和重量，先与 targetCategory 所列通用品类（空时按 Brief）比较，再看是否属于 comparisonCategory 的细分。细分规格或包装形态只在图上看清时写。actualPackaging 只在原图显示这件商品真实使用的有品牌或商品标识的包装时为 true；散装食材、图标、空盒批发样板和其他商品的包装不能证明该商品有包装。商品确属同一类时 categoryMatch=同类；不同品类或无法确认分别写其他品类或未核实。品牌、网页标题、同一官网与拍摄角度均不能证明品类相同。图上手提盒、侧面或袋装可以提供所见范围内的包装参考；需要描述正面时才要求看清正面。核对品牌和客户问题。verifiedFront 仅记录可辨的正面，只有侧面或背面时可以留空。checks 第一项写实际可见面的商品识别或布局，随后按所见位置核对，再逐项回答客户关心的细节。看清时报告具体位置、逐字抄下可辨的标注或准确描述可辨图形；不能辨认或这张图无法验证，就选未核实。图上有标注只支持标注本身，不能证明实际体验。不得从客户自己的规格、商品名或第一眼的遗漏推断竞品没有某项。',[image,...details],detailSchema,
    {rules:[],assignment:'单张包装核图',context:JSON.stringify({brief,targetCategory:broadCategory || category,comparisonCategory:category,product:image.title,firstObservation:firstRead.front,regions})});
  const {actualPackaging,visibleProduct,categoryMatch,checks=[]}=review.parsedOutput;
  await writeFile(join(folder,'category.json'),JSON.stringify({sha256:image.sha256,targetCategory:broadCategory || category,comparisonCategory:category,actualPackaging,visibleProduct,categoryMatch}),{mode:0o600});
  if (actualPackaging!==true || categoryMatch!=='同类' || !visibleProduct?.trim()) return null;
  if (!checks.some(c=>c.status==='看清' && c.location?.trim() && c.marking?.trim())) return null;
  const lines=checks.filter(c=>c.question?.trim()).map(c=>c.status==='看清' && c.location?.trim() && c.marking?.trim()
    ? c.question+'：'+c.location+'，'+c.marking : c.question+'：未核实。');
  // Only located observations and explicit unknowns are evidence for the research writer.
  const observation=lines.join('\n');
  await writeFile(join(folder,'detail.json'),JSON.stringify({sha256:image.sha256,regions,checks,observation}),{mode:0o600});
  return {firstRead,regions,observation,actualPackaging,visibleProduct,categoryMatch};
}

// r28 stores the located crop checks as one line per question, also in archived projects.
export function locatedPackagingMarks(findings) {
  const marks=[];
  for (const [findingIndex,finding] of findings.entries()) {
    for (const image of finding.images ?? []) {
      if (image.carrier!=='packaging' || !image.sameCategory || !image.detailRegions?.length ||
          !image.sha256 || !image.pageUrl || !image.sourceUrl || typeof image.observation!=='string') continue;
      for (const line of image.observation.split('\n')) {
        const match=line.match(/^(.+?)：([^，]+)，(.+)$/u);
        if (!match) continue;
        const [,question,location,marking]=match;
        marks.push({id:marks.length,findingIndex,title:image.title,question,location,marking});
      }
    }
  }
  return marks;
}

export function prioritizePackagingRows(rows,highlights,marks,brief) {
  const chapter='竞争与同类传播';
  const priority=[],concerns=new Set(),used=new Set();
  for (const h of highlights ?? []) {
    const mark=marks[h.markId], concern=h.briefQuote?.trim(), quote=h.visibleQuote?.trim();
    if (!mark || !concern || !brief?.includes(concern) || !quote || !mark.marking.includes(quote) ||
        !h.conclusion?.trim() || concerns.has(concern) || used.has(mark.id)) continue;
    const limit=h.untestedEffect?.trim();
    priority.push({chapter,conclusion:h.conclusion.trim(),
      explanation:`原图已核实，${mark.location}可见“${quote}”。`+(limit ? limit+'未核实。' : ''),
      sourceDetail:'',evidenceIndices:[mark.findingIndex]});
    used.add(mark.id);
    concerns.add(concern);
  }
  if (!priority.length) return rows;
  const covered=new Set(priority.flatMap(row=>row.evidenceIndices));
  // A board can cite multiple pictures. Its generic summary must not take a second slot
  // for the same evidence; the full board is still visible under the priority conclusion.
  const rest=rows.filter(row=>row.chapter!==chapter || !row.evidenceIndices.every(i=>covered.has(i)));
  const first=rest.findIndex(row=>row.chapter!=='行业与市场');
  rest.splice(first<0 ? rest.length : first,0,...priority);
  return rest;
}
