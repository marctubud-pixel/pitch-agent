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
const frontLayout='商品是什么，包装主面的信息怎么摆放';
const distribution='画面上可见的内包装、分装或固定结构';
const ingredientLabels='包装上可辨的配料或口味原字';

const inspectionTopics=[
  [/规格|净含量|容量|盒内|每袋|每盒|克|毫升|\d\s*(?:kg|ml|g)\b/iu,'画面上可见的容器形状，规格或净含量原字'],
  [/分装|小袋|开盒|内托|固定|夹层|隔层/u,distribution],
  [/配料|原料|成分|口味|混合|冻干/u,ingredientLabels],
  [/开袋|袋口|开盖|瓶盖|封口|密封|回封|复封|收好|拉链|开合|易撕/u,'开口及开合、回封标识的位置与原字'],
  [/开窗|透明|材料|环保|工艺/u,'图上能分辨的开窗、材质或工艺标识'],
  [/追溯|二维码|认证|产地|保质期|过期|生产日期/u,'包装上可辨的溯源、认证、产地或日期标识及对应位置'],
  [/字体|易读|识别|字大|字号/u,'具体文字的位置、与底色的对比和辨认难度'],
];

const compact=value=>value.normalize('NFKC').replace(/\s/gu,'');
const literal=value=>compact(value).replace(/[“”「」"'‘’]/gu,'').toLowerCase();

function frontPosition(location,marking,firstRead) {
  const zone=zones.find(value=>location.includes(value));
  const label=literal(marking).split(/[,、。；;]/u)[0];
  const clauses=literal(firstRead.front ?? '').split(/[,。；;]/u);
  return zone && label.length>=2 && clauses.some(clause=>clause.includes(zone) && clause.includes(label) &&
    !zones.some(other=>other!==zone && clause.includes(other))) ? location : '正面';
}

function visibleDistribution(marking) {
  const structure=marking.split(/[，,；;。]\s*(?:(?:依次|分别)(?:为|标注|标有|写有)|(?:各|每)(?:瓶|罐|袋|包|盒)(?:身)?(?:的)?(?:标注|标签)|(?:配料|口味)(?:为|标注|标签))/u)[0];
  return structure.replace(/([\d０-９]+|[一二两三四五六七八九十百]+)(?:个(?=[^：:，,、。；;\r\n]{0,16}(?:[瓶罐袋包杯盒]|容器))|(?=[瓶罐袋包杯盒]))/gu,(matched,count,index,text)=>{
    const phrase=text.slice(0,index).split(/[，,。；;\r\n]/u).at(-1);
    const printed=/(?:印有|标(?:有|注|明|示)|写(?:有|着)|印字|原字)[：:「“"\s]*(?:盒内|每盒|内含|内装)?\s*$/u.test(phrase);
    const nominal=compact(count);
    if (printed || ['一','1'].includes(nominal)) return matched;
    return nominal==='0' ? '数量未核实' : matched.replace(count,'多');
  });
}

function observationLine({question,location,marking,status},firstRead,visibleProduct) {
  if (status!=='看清' || !location?.trim() || !marking?.trim()) return question+'：未核实。';
  if (question===frontLayout || question===ingredientLabels) {
    const certain=literal(firstRead.front ?? '').split(/[,。；;!?！？]/u).filter(part=>
      !/未核实|没看清|未看清|看不清|不确定|疑似|像是|可能|并非|不是/u.test(part));
    const agrees=value=>literal(value).length>=2 && certain.some(part=>part.includes(literal(value)));
    if (question===frontLayout) {
      const same=agrees(marking);
      const label=same?marking:[firstRead.brand,visibleProduct].filter(value=>typeof value==='string' && agrees(value) &&
        literal(marking).includes(literal(value))).filter((value,index,all)=>!all.slice(index+1).some(other=>literal(other).includes(literal(value)))).join(' ');
      if (!label) return question+'：未核实。';
      return question+'：'+frontPosition(location,label,firstRead)+'，'+label+(same?'':'\n其余包装标注：未核实。');
    }
    const candidates=marking.replace(/^[^：:]{0,24}(?:标注|印有|分别为|依次为)[^：:]{0,8}[：:]\s*/u,'')
      .replace(/\s*[（(][^（）()]{0,20}(?:标签|罐身|袋身)[^（）()]{0,8}[）)]\s*$/u,'')
      .split(/[、，,；;。]+|(?<=\p{Script=Han})\s+(?=\p{Script=Han})/u).map(value=>value.trim()).filter(Boolean);
    const labels=[...new Set(candidates.filter(agrees))];
    if (!labels.length) return question+'：未核实。';
    const position=labels.length===1?frontPosition(location,labels[0],firstRead):'正面';
    return question+'：'+position+'，'+labels.join('、')+(candidates.every(value=>labels.includes(value))?'':'\n其余配料或口味原字：未核实。');
  }
  const seen=question===distribution?visibleDistribution(marking):marking;
  return question+'：'+location+'，'+seen;
}

export async function readPackaging({call,dir,image,brief,category,broadCategory,previous,signal}) {
  const root=join(dir,'.research-evidence','packaging-reads');
  await mkdir(root,{recursive:true});
  const folder=await mkdtemp(join(root,image.sha256+'-'));
  const questions=[frontLayout,
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
  const review=await call('第一张是原图，接着是同一原图的真实局部放大，顺序见 regions。location 一律以第一张原图为坐标；局部图中央不等于包装正面中央。visibleProduct 写图上可辨的商品名或品类，省略口号、规格和成分。独立核对图上商品与 targetCategory 的通用品类。actualPackaging 只在原图有实际销售商品的包装和可辨标识时为 true。散装食材、图标和空盒模板须排除。同类、异类和品类不清分别写“同类”“其他品类”“未核实”。比较 comparisonCategory 的细分时，以图上实见为准。verifiedFront 只记录可辨的正面，侧背面可留空。checks 先写能识别商品的图文或布局，再按 questions 记录具体位置及可辨原字或图形。数字、净含量、配料和盒内总数只抄图上有明确标签、且能准确辨认的字样，标明“印有”并抄原字。若透窗只露出部分，描述可见罐、袋或其他容器，盒内总数写未核实。无法辨认或不能从本图核对的都写未核实。图上标识只说明印了什么，实际使用效果另需实测。',[image,...details],detailSchema,
    {rules:[],assignment:'单张包装核图',context:JSON.stringify({questions,targetCategory:broadCategory || category,comparisonCategory:category,regions})});
  const {actualPackaging,visibleProduct,categoryMatch,checks=[]}=review.parsedOutput;
  await writeFile(join(folder,'category.json'),JSON.stringify({sha256:image.sha256,targetCategory:broadCategory || category,comparisonCategory:category,actualPackaging,visibleProduct,categoryMatch}),{mode:0o600});
  if (actualPackaging!==true || categoryMatch!=='同类' || !visibleProduct?.trim()) return null;
  if (!checks.some(c=>c.status==='看清' && c.location?.trim() && c.marking?.trim())) return null;
  const lines=checks.filter(c=>c.question?.trim()).map(check=>observationLine(check,firstRead,visibleProduct));
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
