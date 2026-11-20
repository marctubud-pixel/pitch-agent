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

const inspectionTopics=[
  [/规格|净含量|容量|盒内|每袋|每盒|克|毫升|\d\s*(?:kg|ml|g)\b/iu,'画面上可见的容器形状，规格或净含量原字'],
  [/配料|原料|成分|口味|混合|冻干/u,'包装上可辨的配料或口味原字'],
  [/开袋|袋口|开盖|瓶盖|封口|密封|回封|复封|收好|拉链|开合|易撕/u,'开口及开合、回封标识的位置与原字'],
  [/开窗|透明|材料|环保|工艺/u,'图上能分辨的开窗、材质或工艺标识'],
];

export async function readPackaging({call,dir,image,brief,category,broadCategory,previous,signal}) {
  const root=join(dir,'.research-evidence','packaging-reads');
  await mkdir(root,{recursive:true});
  const folder=await mkdtemp(join(root,image.sha256+'-'));
  const questions=['商品是什么，包装主面的信息怎么摆放',
    ...inspectionTopics.filter(([pattern])=>pattern.test(brief ?? '')).map(([,question])=>question)];
  let firstRead=previous?.firstRead;
  if (!firstRead) {
    const response=await call('只看这件包装原图，按 questions 观察。front 写你第一次实际看见的内容，包括可辨的文字、标识及其位置。看不清写“未核实”。brand 写可辨品牌。regions 选一至三个需放大的区域。透窗只见部分时，描述所见容器，不推算整盒数量。',[image],firstSchema,
      {rules:[],assignment:'单张包装读图',context:JSON.stringify({questions})});
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
  const review=await call('第一张是原图，接着是同一原图的真实局部放大，顺序见 regions。visibleProduct 写图上可辨的商品名或品类，省略口号、规格和成分。独立核对图上商品与 targetCategory 的通用品类。actualPackaging 只在原图有实际销售商品的包装和可辨标识时为 true。散装食材、图标和空盒模板须排除。同类、异类和品类不清分别写“同类”“其他品类”“未核实”。比较 comparisonCategory 的细分时，以图上实见为准。verifiedFront 只记录可辨的正面，侧背面可留空。checks 先写能识别商品的图文或布局，再按 questions 记录具体位置及可辨原字或图形。数字、净含量、配料和盒内总数只抄图上有明确标签、且能准确辨认的字样。若透窗只露出部分，描述可见罐、袋或其他容器，盒内总数写未核实。无法辨认或不能从本图核对的都写未核实。图上标识只说明印了什么，实际使用效果另需实测。',[image,...details],detailSchema,
    {rules:[],assignment:'单张包装核图',context:JSON.stringify({questions,targetCategory:broadCategory || category,comparisonCategory:category,regions})});
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
