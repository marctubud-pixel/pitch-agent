import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dimensions = {
  copy: ['主张成立','同组创意机制差异','中文表达与节奏','主副文协作'],
  brand: ['策略及产品关联','品牌语义联系','事实边界','品牌/产品归属清楚'],
  user: ['与设定选择情景的关联','利益或情绪的具体可理解性','直接理解','语言可信与不费解'],
  comms: ['同组三案辨识','核心记忆线索潜力','简洁复述','主文副文的信息分工'],
};
const roles = Object.keys(dimensions);
const ids = ['A','B','C'];
const duties = {continuity:'稳健延续',feature:'放大品牌或产品特征',emotion:'放大用户氛围或情绪'};
const str = {type:'string'};
const list = items => ({type:'array',items});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const choice = values => ({type:'string',enum:values});
const draftSchema = object({directions:list(object({
  id:choice(ids), duty:choice(Object.keys(duties)), basis:str,name:str,claim:str,mechanism:str,
  strategyLink:str,main:str,secondary:str,touchpoints:list(object({label:str,text:str})),risk:str,
}))});
const voteSchema = object({items:list(object({
  directionId:choice(ids),decision:choice(['pass','revise','hold','reject']),reason:str,hardRejects:list(str),blockers:list(str),
  scores:list(object({dimension:str,score:{type:['integer','null']},evidence:str,reason:str})),
}))});
const challengeSchema = object({items:list(object({directionId:choice(ids),dimension:str,objection:str,evidence:str,action:str}))});
const reviseSchema = object({draft:draftSchema,changes:list(str)});
const recommendationSchema = object({directionId:choice(ids),reason:str,tradeoff:str});
const adjudicateSchema = object({
  ready:{type:'boolean'},reason:str,recommendation:recommendationSchema,
  rulings:list(object({challengeId:str,verdict:choice(['resolved','rejected','pending']),reason:str})),
});
const hash = text => createHash('sha256').update(text).digest('hex');
const digest = object => hash(JSON.stringify(object));
function requireThat(ok, message) { if (!ok) throw Error(message); }
function nonempty(text) { return typeof text === 'string' && !!text.trim(); }
function exactly(values, expected) {
  return values.length === expected.length && expected.every(value=>values.includes(value));
}
// The Codex CLI adapter supplies parsed JSON but does not validate it against the requested schema.
function validate(value, schema, path) {
  if (schema.type === 'object') {
    requireThat(value && typeof value === 'object' && !Array.isArray(value) &&
      exactly(Object.keys(value),schema.required),path+' 字段不完整或包含额外字段');
    for (const [field,child] of Object.entries(schema.properties)) validate(value[field],child,path+'.'+field);
  } else if (schema.type === 'array') {
    requireThat(Array.isArray(value),path+' 须为列表');
    value.forEach((item,index)=>validate(item,schema.items,path+'['+index+']'));
  } else if (schema.type === 'string') {
    requireThat(nonempty(value) && (!schema.enum || schema.enum.includes(value)),path+' 的文字或枚举无效');
  } else if (schema.type === 'boolean') {
    requireThat(typeof value === 'boolean',path+' 须为布尔值');
  } else {
    requireThat(value === null || (Number.isInteger(value) && value >= 1 && value <= 5),path+' 须为1至5分或待核');
  }
}
function validateDraft(draft, materials) {
  const ds = draft.directions;
  requireThat(exactly(ds.map(d=>d.id),ids) && exactly(ds.map(d=>d.duty),Object.keys(duties)), '三案身份或创意职责不完整');
  requireThat(new Set(ds.map(d=>d.name.trim())).size === 3 && new Set(ds.map(d=>d.main.trim())).size === 3 &&
    new Set(ds.map(d=>d.mechanism.trim())).size === 3,'三案名称、主文或机制重复');
  for (const d of ds) {
    requireThat(d.name === d.name.trim() && d.name.length <= 100 && !/[\r\n]/.test(d.name),'方向名须为单行');
    requireThat(materials.some(t=>t.includes(d.basis)),'方向 '+d.id+' 的依据无法定位到当前上游原文');
    requireThat(d.touchpoints.length,'方向 '+d.id+' 没有本案触点文案');
    for (const text of [d.claim,d.mechanism,d.main,d.secondary,d.strategyLink,d.risk,...d.touchpoints.flatMap(p=>[p.label,p.text])]) {
      requireThat(!/[\r\n]/.test(text),'文案字段须逐项填写，不能嵌入其他段落');
    }
  }
}
function sourceQuotes(d) {
  return [d.name,d.basis,d.claim,d.mechanism,d.strategyLink,d.main,d.secondary,d.risk,...d.touchpoints.map(p=>p.text)];
}
function validateVote(items, role, draft) {
  requireThat(exactly(items.map(x=>x.directionId),ids),'岗位 '+role+' 原票缺少单案或重复');
  for (const item of items) {
    requireThat(exactly(item.scores.map(s=>s.dimension),dimensions[role]),role+' 的固定必评维度缺失或重复');
    const d=draft.directions.find(x=>x.id===item.directionId);
    for (const s of item.scores) requireThat(sourceQuotes(d).some(line=>line.includes(s.evidence)),
      role+' '+d.name+'「'+s.dimension+'」缺少可定位的稿件原文');
  }
}
function blocked(vote) {
  return vote.items.filter(i=>i.decision!=='pass' || i.hardRejects.length || i.blockers.length ||
    i.scores.some(s=>s.score === null || s.score < 4));
}
const craft = '三个职责各一次，分配给哪案由本案决定：稳健延续使用品牌可识别表达，缺品牌资料可使用有来源的行业/品类/媒介惯例；第二类放大具体品牌或产品特征；第三类放大用户氛围或情绪。依据 basis 逐字摘取一段当前输入，通用做法不能说成品牌资产。每案写独立的主张、机制、主副文、真实触点和风险。各字段写单行，名称不带排序号。提交稿件不附作者推荐、排名、分数或评语。';
const scoring = '先逐案后比较。仅用指定的每个必评维度逐项打1–5分，关键未知填 null。evidence 逐字摘取该案中的一处短语，reason解释何以支持本分与适用范围。缺证、硬退或阻断不能通过。四岗是独立模型会话，用户岗只模拟阅读。禁止计算平均分。';
function markdown(draft, rec) {
  const chosen=draft.directions.find(d=>d.id===rec.directionId);
  return ['推荐方向：'+chosen.name,'推荐依据：'+rec.reason,'推荐取舍：'+rec.tradeoff,
    ...draft.directions.flatMap(d=>['','## '+d.name,'方向职责：'+duties[d.duty],'依据：'+d.basis,
      '主张：'+d.claim,'创意机制：'+d.mechanism,'策略承接：'+d.strategyLink,'主文案：'+d.main,'副文案：'+d.secondary,
      ...d.touchpoints.map(t=>t.label+'示例：'+t.text),'误读风险：'+d.risk])].join('\n');
}

export async function runCopyReview({call, project, inputs, rules, dir, onEvent}) {
  const attempt = {version:1,status:'working',calls:[],firstVotes:[],criticReads:[],challenges:[],finalVotes:[]};
  const filename='copy-review-attempt-'+randomUUID()+'.json';
  const threads=new Set(), runs=new Set();
  const materials=[project.brief,...inputs.texts.map(t=>t.text)].filter(nonempty);
  async function run(phase, instruction, schema, packet, author=false) {
    const result=await call(phase+'\n'+instruction,author?inputs.images:[],schema,{
      rules:author?rules:[],assignment:'只完成当前职责。',context:JSON.stringify(packet),
    });
    const receipt={runId:result.runId,threadId:result.threadId,model:result.model,inputPacketHash:result.inputPacketHash};
    requireThat(nonempty(receipt.runId) && nonempty(receipt.threadId) && !threads.has(receipt.threadId) && !runs.has(receipt.runId),
      '评审会话或调用身份缺失/复用，请重试');
    threads.add(receipt.threadId);runs.add(receipt.runId);
    attempt.calls.push({phase,role:packet.role,...receipt});
    validate(result.parsedOutput,schema,phase);
    return {output:result.parsedOutput,receipt};
  }
  // Only known upstream artifact names and the original brief enter the blind packets.
  // A submitted attachment enters as a located basis excerpt, never as an entire prior review.
  const upstream = (project.artifacts || []).filter(a=>['brief','research','strategy'].includes(a.stage));
  const reviewSources = {brief:project.brief,materials:inputs.texts.flatMap(t=>{
    const artifact=upstream.find(a=>a.name===t.name);
    return artifact && t.text ? [{stage:artifact.stage,name:t.name,text:t.text}] : [];
  })};
  function reviewPacket(draft) {
    return {
      upstream:reviewSources,
      basisSources:draft.directions.map(d=>({directionId:d.id,quote:d.basis,sources:[
        ...(project.brief?.includes(d.basis)?['原始简报']:[]),
        ...inputs.texts.filter(t=>t.text?.includes(d.basis)).map(t=>t.name),
      ]})),
      draftHash:digest(draft),
      draft:{directions:draft.directions.map(({risk,...candidate})=>candidate)},
    };
  }
  async function votes(phase,draft,out) {
    const previous=phase==='COPY_RECHECK';
    for (const role of roles) {
      const packet={role,dimensions:dimensions[role],...reviewPacket(draft),
        ...(previous?{initialDraft:reviewPacket(attempt.initialDraft).draft,originalVote:attempt.firstVotes.find(v=>v.role===role),objections:attempt.challenges.find(v=>v.role===role),changes:attempt.changes}:{})};
      const {output,receipt}=await run(phase,scoring+(previous?' 复核当前整份新稿，逐项查看本岗原问题与对应异议是否已解决。':''),voteSchema,packet);
      validateVote(output.items,role,draft);
      out.push({role,draftHash:digest(draft),...receipt,items:output.items});
    }
  }
  try {
    const source={brief:project.brief,materials:inputs.texts,feedback:project.feedback || []};
    await onEvent?.('文案负责人正在创作三个方向');
    const generated=await run('COPY_CREATE',craft,draftSchema,source,true);
    const first=generated.output;
    validateDraft(first,materials);
    attempt.initialDraft=first;
    await onEvent?.('四岗分别首读文案初稿');
    await votes('COPY_FIRST',first,attempt.firstVotes);
    await votes('COPY_CRITIC_BLIND',first,attempt.criticReads);
    for (const vote of attempt.firstVotes) {
      const blindRead=attempt.criticReads.find(read=>read.role===vote.role);
      const {output,receipt}=await run('COPY_CHALLENGE','你的 blindRead 是对抗岗先独立锁定的原读，保留原判断，再对照对应评分岗 vote。独立检查这一个岗位的对应原票。两份判断有必评低分、未知或硬退的分歧时，须逐项登记异议供裁定。逐案核对具体评分主张，实际有异议时填写所指维度、依据、影响与建议；无异议可为空。evidence 须是该案稿件中的逐字短语。',challengeSchema,{role:vote.role,...reviewPacket(first),blindRead,vote});
      const items=output.items.map((item,i)=>{
        const d=first.directions.find(d=>d.id===item.directionId);
        requireThat(dimensions[vote.role].includes(item.dimension) && sourceQuotes(d).some(s=>s.includes(item.evidence)),'异议未对应该案原文或原岗维度');
        return {...item,id:vote.role+'-'+(i+1)};
      });
      // A contrary blocking first read needs a traceable disposition; an empty response
      // cannot silently discard a hard rejection or unknown required evidence.
      for (const disputed of blocked(blindRead)) {
        const original=vote.items.find(i=>i.directionId===disputed.directionId);
        const contrary=disputed.scores.filter(s=>(s.score === null || s.score < 4) &&
          original.scores.some(prior=>prior.dimension===s.dimension && prior.score >= 4));
        for (const score of contrary) requireThat(items.some(i=>i.directionId===disputed.directionId && i.dimension===score.dimension),
          vote.role+' 异议岗首读的必评阻断没有对应异议：'+score.dimension);
        if (!blocked(vote).some(i=>i.directionId===disputed.directionId)) {
          requireThat(items.some(i=>i.directionId===disputed.directionId),vote.role+' 异议岗首读阻断没有对应处理');
        }
      }
      attempt.challenges.push({role:vote.role,draftHash:digest(first),blindReadRunId:blindRead.runId,voteRunId:vote.runId,...receipt,items});
    }
    await onEvent?.('文案负责人处理原评与异议，四岗复核同版文案');
    const revision=await run('COPY_REVISE',craft+' 根据实际原票与异议改稿，保留每案 id 与职责；changes逐条说明改前、改后和原因。没有需要改的内容时可原样提交并返回空列表。',reviseSchema,
      {...source,draft:first,firstVotes:attempt.firstVotes,challenges:attempt.challenges},true);
    const {draft,changes}=revision.output;
    validateDraft(draft,materials);
    for (const d of draft.directions) {
      const old=first.directions.find(x=>x.id===d.id);
      requireThat(d.duty === old.duty,'改稿改变了方向职责身份');
      const priorBlock=attempt.firstVotes.some(v=>blocked(v).some(x=>x.directionId===d.id));
      requireThat(!priorBlock || digest(d)!==digest(old),'原岗阻断仍在，方向 '+d.name+' 未修改');
    }
    requireThat(digest(first) === digest(draft) || changes.length,'改稿缺少修改对照');
    Object.assign(attempt,{draft,changes});
    await votes('COPY_RECHECK',draft,attempt.finalVotes);
    const outstanding=attempt.finalVotes.flatMap(v=>blocked(v).map(i=>v.role+' '+i.directionId+'：'+[
      ...i.hardRejects,...i.blockers,...i.scores.filter(s=>s.score===null || s.score<4).map(s=>s.dimension+' '+(s.score??'待核')+' '+s.reason),i.reason].join('；')));
    const verdict=await run('COPY_ADJUDICATE','独立总监检查三案差异、未解问题与各岗盲点。对每条带 id 异议按 challengeId 单独裁定。阻断/关键缺证/必评不足4须判未就绪，不得平均、改票或代替人类采用。推荐理由及取舍须指向当前稿。',adjudicateSchema,{
      upstream:reviewSources,initialDraft:first,draft,changes,challenges:attempt.challenges,criticReads:attempt.criticReads,firstVotes:attempt.firstVotes,finalVotes:attempt.finalVotes,
    });
    const adjudication=verdict.output;
    attempt.adjudication=adjudication;
    requireThat(exactly(adjudication.rulings.map(x=>x.challengeId),attempt.challenges.flatMap(c=>c.items.map(i=>i.id))),'有异议未得到逐条独立裁定');
    requireThat(!outstanding.length,'文案复核未通过：'+outstanding.join('；'));
    requireThat(adjudication.ready && !adjudication.rulings.some(r=>r.verdict==='pending'),'文案裁定未通过：'+adjudication.reason);
    const body=markdown(draft,adjudication.recommendation);
    Object.assign(attempt,{status:'ready',bodyHash:hash(body),recommendation:adjudication.recommendation});
    return {body,directions:draft.directions.map(x=>x.name),copyReview:attempt};
  } catch(error) {
    attempt.status='blocked';attempt.error=error.message;
    await writeFile(join(dir,filename),JSON.stringify(attempt,null,2),{flag:'wx',mode:0o600});
    throw Error('本次文案记录：'+filename+'。'+error.message,{cause:error});
  }
}
