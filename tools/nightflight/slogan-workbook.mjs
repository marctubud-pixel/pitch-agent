// The author keeps the working papers. Blind readers only receive the lines.
import { createHash } from 'node:crypto';

const str={type:'string'};
const list=items=>({type:'array',items});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const plans=obj({directions:list(obj({id:str,coordinates:str,motive:str,connection:str,methods:str,
  candidates:list(obj({text:str,method:str}))}))});
const reading=obj({items:list(obj({text:str,observation:str,usable:{type:'boolean'}}))});
const family=obj({directions:list(obj({id:str,original:str,killed:list(obj({text:str,reason:str})),
  versions:list(obj({text:str,use:str,tradeoff:str})),sound:str,backup:str,edits:str,extensions:str,risks:str}))});
function insist(ok,message){if(!ok)throw Error(message)}
function same(actual,expected) {
  return actual.length===expected.length && new Set(actual).size===actual.length && expected.every(text=>actual.includes(text));
}
function passesBoth(text,reads) {
  return reads.every(read=>read.output.items.some(item=>item.text===text && item.usable));
}
export async function blindSlogans(run,lines) {
  insist(new Set(lines).size===lines.length,'候选或版本间存在重复主标题');
  const results=await Promise.all([
    '逐句以自己的话复述，核对朗读、推理步数、现实、视角、时效、替换三个无关品类、撞车及场合。没有比对材料的撞车注明待核。usable 表示能独立读懂。',
    '逐句回答是否愿意转述、经过时会否多看一眼，给具体理由。usable 表示有值得留意或转述的理由。'
  ].map((question,i)=>run(i?'SLOGAN_APPEAL':'SLOGAN_READING',question+' 每条原文 text 准确抄回，仅据句子。',reading,{lines})));
  for(const r of results)insist(same(r.output.items.map(i=>i.text),lines),'独立盲读漏句或改动原文');
  return results;
}

export async function buildSloganWorkbook(run, source) {
  const {output:plan,receipt}=await run('COPY_EXPLORE','按当前完整 slogan-engine 的01–05步，为三个既定职责各给一个独立连接。A/B/C 三案分别登记一种职责（稳健延续、产品特征、用户情绪各一次），卡位按本案安排。每案列出三种不同写法的真实候选，每案 coordinates 写场合、价位、视角和唯一任务，motive 写怕/想两面。品牌资料不足的稳健方向依据品类。只用已核事实。',plans,source,true);
  insist(same(plan.directions.map(d=>d.id),['A','B','C'])&&plan.directions.every(d=>d.candidates.length===3),'须交齐三方向各三句候选');
  const lines=plan.directions.flatMap(d=>d.candidates.map(c=>c.text));
  const first=await blindSlogans(run,lines);
  const discarded=[];
  for(let round=0;round<3;round++){
    const {output:polish,receipt:polishReceipt}=await run('COPY_POLISH','若有上一轮被退版本，逐案针对盲评指出的具体问题回到连接或重写表达，留下变化理由和原句。不能逐字复交整组被退版本；不把品牌名当创意。根据原始三案和两份独立盲读，为每案选一条 original 原样保留，另外两条逐条原文写入 killed 并记录淘汰理由。围绕选中连接产出含原句在内的三至四个不同版本，分别给适用位置与得失，记录声律版、备选、改前改后和具体改动理由，主张须可生长出战役、社媒和线下触点。版本保留足够独立的产品线索，不能依赖副文。',family,{...source,plan,reads:first.map(r=>r.output),previous:discarded.map(x=>({family:x.polish,blind:x.second.map(r=>r.output)}))},true);
    insist(same(polish.directions.map(d=>d.id),['A','B','C']),'版本族缺少方向');
    for(const d of polish.directions){
      const candidates=plan.directions.find(p=>p.id===d.id).candidates.map(c=>c.text);
      insist(same([d.original,...d.killed.map(c=>c.text)],candidates),'淘汰记录必须覆盖本案其余原句');
      insist(d.versions.length>=3&&d.versions.length<=4&&d.versions.some(v=>v.text===d.original),'版本族须含原句及其打磨稿');
    }
    const second=await blindSlogans(run,polish.directions.flatMap(d=>d.versions.map(v=>v.text)));
    const result={polish,second,polishRun:polishReceipt.runId};
    if(polish.directions.every(d=>d.versions.some(v=>passesBoth(v.text,second)))) {
      return {plan,first,...result,discarded,exploreRun:receipt.runId};
    }
    discarded.push(result);
  }
  throw Error('仍有方向没有同时通过可懂与转述盲读的版本。已保留本轮原稿与盲读回执。');
}
export function checkSloganChoices(draft,book) {
  for(const d of draft.directions){
    const f=book.polish.directions.find(x=>x.id===d.id);
    insist(f?.versions.some(v=>v.text===d.main)&&passesBoth(d.main,book.second),'选定主标题须来自同方向且两次独立判断均可用的版本族');
  }
}
export const fullSloganHash = text=>createHash('sha256').update(text).digest('hex');
