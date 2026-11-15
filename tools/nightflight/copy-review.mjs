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
  scores:list(object({dimension:str,score:{type:['integer','null']},evidence:str,reason:str,scope:str})),
}))});
const optionalText = {type:'string',minLength:0};
const anonymousSchema = object({items:list(object({directionId:choice(ids),reading:str,uncertainty:optionalText}))});
const criticSchema = object({items:list(object({directionId:choice(ids),risk:optionalText,evidence:optionalText}))});
const challengeSchema = object({
  items:list(object({directionId:choice(ids),dimension:str,objection:str,evidence:str,action:str,blocking:{type:'boolean'}})),
  coverage:list(object({readId:str,directionId:choice(ids),dimension:str,reason:str})),
});
const planSchema = object({rulings:list(object({
  challengeId:str,verdict:choice(['accepted_now','accepted_later','rejected','pending']),
  action:choice(['revise','recheck','none']),reason:str,
}))});
const reviseSchema = object({draft:draftSchema,changes:list(str)});
const recommendationSchema = object({directionId:choice(ids),reason:str,tradeoff:str});
const adjudicateSchema = object({
  ready:{type:'boolean'},reason:str,recommendation:recommendationSchema,
  rulings:list(object({challengeId:str,verdict:choice(['resolved','rejected','pending']),reason:str})),
  single:list(object({directionId:choice(ids),ready:{type:'boolean'},reason:str})),
  pairs:list(object({pair:choice(['AB','AC','BC']),distinct:{type:'boolean'},reason:str})),
  set:object({ready:{type:'boolean'},reason:str}),
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
    requireThat((schema.minLength === 0 ? typeof value === 'string' : nonempty(value)) && (!schema.enum || schema.enum.includes(value)),path+' 的文字或枚举无效');
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
  return [d.name,d.basis,d.claim,d.mechanism,d.strategyLink,d.main,d.secondary,...d.touchpoints.map(p=>p.text)];
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
const anchors = {
  1:'与任务冲突或表达无法成立',2:'需重做才能让读者理解并符合事实',
  3:'部分成立，但仍有具体歧义或关键衔接待解决',4:'在本案给定条件下有明确证据支持成立',
  5:'除达到4外，还能指出相较本组可比写法的具体优势',
};
const scope = '当前简报、产品事实及三案范围。品牌联系区分字面提及、语义关联与真实感知；传播仅评估复述潜力，不推断实测效果。两案互换、换品牌、换节点均为诊断，不据此单独扣分。';
const scoring = '先逐案后比较。仅用指定的每个必评维度逐项打1–5分，关键未知填 null。evidence 逐字摘取该案中的一处短语，reason说明本分与相邻锚点的区别；scope写明本维度就哪个对象、证据范围或哪组候选作比较。不得因缺促销CTA扣品牌主题分。缺证、硬退或阻断不能通过。四岗是独立模型会话，用户岗只模拟阅读。禁止计算平均分。';
function markdown(draft, adjudication) {
  const rec=adjudication.recommendation;
  const chosen=draft.directions.find(d=>d.id===rec.directionId);
  return ['推荐方向：'+chosen.name,'推荐依据：'+rec.reason,'推荐取舍：'+rec.tradeoff,
    ...draft.directions.flatMap(d=>['','## '+d.name,'方向职责：'+duties[d.duty],'依据：'+d.basis,
      '主张：'+d.claim,'创意机制：'+d.mechanism,'策略承接：'+d.strategyLink,'主文案：'+d.main,'副文案：'+d.secondary,
      ...d.touchpoints.map(t=>t.label+'示例：'+t.text),'误读风险：'+d.risk]),
    '', '## 单案判断',...adjudication.single.map(s=>s.directionId+'：'+s.reason),
    '', '## 逐对差异',...adjudication.pairs.map(p=>p.pair+'：'+p.reason),
    '', '## 整组判断',adjudication.set.reason,
  ].join('\n');
}

export async function runCopyReview({call, project, inputs, rules, dir, onEvent}) {
  const attempt = {version:1,protocol:'dual-panel-v2',status:'working',calls:[],anonymousReads:[],firstVotes:[],criticReads:[],challenges:[],finalVotes:[]};
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
  async function anonymousReads(draft) {
    const reads=[];
    const candidates=draft.directions.map(({id,main,secondary})=>({directionId:id,main,secondary}));
    for (const role of roles) {
      const {output,receipt}=await run('COPY_ANONYMOUS','仅凭匿名主副文，逐案记下自然理解：谁在说什么、会读到什么、哪里不确定。不可自行补背景，不评分。',anonymousSchema,{role,candidates});
      requireThat(exactly(output.items.map(i=>i.directionId),ids),'匿名首读未覆盖三案');
      reads.push({role,draftHash:digest(draft),...receipt,items:output.items});
    }
    return reads;
  }
  async function score(phase,role,draft,reads,extra={}) {
    const anonymousRead=reads.find(r=>r.role===role);
    const packet={role,dimensions:dimensions[role],anchors,scope,...reviewPacket(draft),anonymousRead,...extra};
    const {output,receipt}=await run(phase,scoring+(phase==='COPY_RECHECK'?' 核对裁定、旧问题和当前同版，保留原分；仅按真实证据判断是否维持或改判。':' 对照本岗已锁定的匿名阅读再独立评分。'),voteSchema,packet);
    validateVote(output.items,role,draft);
    return {role,draftHash:digest(draft),anonymousReadRunId:anonymousRead.runId,...receipt,items:output.items};
  }
  try {
    const source={brief:project.brief,materials:inputs.texts,feedback:project.feedback || []};
    await onEvent?.('文案负责人正在创作三个方向');
    const generated=await run('COPY_CREATE',craft,draftSchema,source,true);
    const first=generated.output;
    validateDraft(first,materials);
    attempt.initialDraft=first;
    await onEvent?.('四岗分别首读文案初稿');
    attempt.anonymousReads=await anonymousReads(first);
    for (const role of roles) attempt.firstVotes.push(await score('COPY_FIRST',role,first,attempt.anonymousReads));

    for (const role of roles) {
      const {output,receipt}=await run('COPY_CRITIC_BLIND',
        '独立找本岗可能遗漏的事实、表达或同组三案风险。先不看原票、不打分。逐案列出所有独立风险，一条对应一个风险；某案确无发现时仅写一条 risk 和 evidence 均为空的记录。提出风险必须引当前该案逐字证据。',
        criticSchema,{role,...reviewPacket(first)});
      for (const id of ids) {
        const reads=output.items.filter(i=>i.directionId===id);
        requireThat(reads.length,'异议岗独立阅读未覆盖方向 '+id);
        requireThat(reads.length===1 || reads.every(i=>nonempty(i.risk)),'同案存在风险时不得混入无风险记录');
      }
      for (const item of output.items) {
        const d=first.directions.find(d=>d.id===item.directionId);
        requireThat(!item.risk.trim() && !item.evidence.trim() || nonempty(item.risk) && nonempty(item.evidence) &&
          sourceQuotes(d).some(s=>s.includes(item.evidence)),role+' 漏项缺该案证据');
      }
      const items=output.items.map((item,index)=>({...item,readId:role+'-'+receipt.runId+'-'+(index+1)}));
      attempt.criticReads.push({role,draftHash:digest(first),...receipt,items});
    }
    for (const vote of attempt.firstVotes) {
      const blindRead=attempt.criticReads.find(r=>r.role===vote.role);
      const {output,receipt}=await run('COPY_CHALLENGE',
        '保留本岗独立漏项阅读，核原票的具体肯定、证据是否已经覆盖。coverage逐条引用 blindRead.items 的 readId 与 directionId，每条恰好一次，包括无风险记录。指向原票维度并具体说明漏项是否已处理、为何保留或质疑原判。items只列确有依据的异议，区分反证、缺证、偏好、已覆盖与阶段外；action说明影响和建议。个人偏好不阻断，未见新增漏项允许空列表。不得打分。',
        challengeSchema,{role:vote.role,...reviewPacket(first),blindRead,vote});
      const readsById=new Map(blindRead.items.map(i=>[i.readId,i]));
      requireThat(exactly(output.coverage.map(c=>c.readId),[...readsById.keys()]) &&
        output.coverage.every(c=>readsById.get(c.readId)?.directionId===c.directionId && dimensions[vote.role].includes(c.dimension)),
        '对应异议未逐条覆盖同案首读记录或所指原票有误');
      const items=output.items.map((item,i)=>{
        const d=first.directions.find(d=>d.id===item.directionId);
        requireThat(dimensions[vote.role].includes(item.dimension) && sourceQuotes(d).some(s=>s.includes(item.evidence)),'异议未对应该案原文或原岗维度');
        return {...item,id:vote.role+'-'+(i+1)};
      });
      const coverage=output.coverage.map(c=>{
        const item=vote.items.find(i=>i.directionId===c.directionId);
        const score=item.scores.find(s=>s.dimension===c.dimension);
        return {...c,originalClaim:score.reason,originalEvidence:score.evidence,
          independentRead:readsById.get(c.readId)};
      });
      attempt.challenges.push({role:vote.role,draftHash:digest(first),blindReadRunId:blindRead.runId,voteRunId:vote.runId,...receipt,items,coverage});
    }
    const issues=[
      ...attempt.firstVotes.flatMap(v=>blocked(v).flatMap(item=>{
        const grounds=[
          ...item.hardRejects.map(reason=>({kind:'hard_reject',reason})),
          ...item.blockers.map(reason=>({kind:'blocker',reason})),
          ...item.scores.filter(s=>s.score===null || s.score<4).map(s=>({kind:'score',...s})),
        ];
        if (!grounds.length) grounds.push({kind:'decision',reason:item.reason});
        return grounds.map((ground,index)=>({
          id:['score',v.role,item.directionId,index+1].join('-'),role:v.role,directionId:item.directionId,
          blocking:true,origin:'score',...ground,item,
        }));
      })),
      ...attempt.challenges.flatMap(c=>c.items.map(i=>({...i,role:c.role,origin:'challenge'}))),
    ];
    attempt.issues=issues;
    const references={initialDraft:first,anonymousReads:attempt.anonymousReads,firstVotes:attempt.firstVotes,
      criticReads:attempt.criticReads,challenges:attempt.challenges,issues};
    const plan=await run('COPY_PLAN',
      '在创作者改稿前独立逐条裁定 issues；每个id必须决定采纳当前/后续、驳回或待核及理由。作品确需修改时 action=revise，评分原判有误或证据需要复核时 action=recheck 且保持原稿，非阻断范围外事项可延后。不得代评分岗改分。没有问题可为空。',
      planSchema,{upstream:reviewSources,...references});
    const decisionPlan={...plan.output,...plan.receipt};
    attempt.decisionPlan=decisionPlan;
    requireThat(exactly(decisionPlan.rulings.map(r=>r.challengeId),issues.map(i=>i.id)),'改稿前的独立裁定缺项');
    const actions=decisionPlan.rulings.map(r=>({...r,issue:issues.find(i=>i.id===r.challengeId)}));
    for (const r of actions) {
      requireThat(r.action !== 'revise' || r.verdict === 'accepted_now','未采纳当前的事项不能要求改稿');
      requireThat(!['accepted_later','pending'].includes(r.verdict) || r.action==='none','待核或延后事项不能当作已就绪的改稿任务');
      requireThat(!(r.issue.blocking && ['pending','accepted_later'].includes(r.verdict)),'阻断未裁清：'+r.reason);
      requireThat(!(r.issue.origin==='score' && r.action==='none'),'原评阻断需修改或原岗复核：'+r.reason);
      requireThat(!(r.issue.blocking && r.verdict==='accepted_now' && r.action==='none'),'采纳的阻断缺处理动作：'+r.reason);
    }
    // A disputed original judgment is reconsidered on exactly its original text,
    // including when another decision also sends an execution problem back to the author.
    attempt.sameDraftRechecks=[];
    for (const originalVote of attempt.firstVotes) {
      const role=originalVote.role;
      if (!actions.some(r=>r.issue.role===role && r.action==='recheck')) continue;
      const extra={initialDraft:reviewPacket(first).draft,originalVote,changes:[],
        objections:attempt.challenges.find(c=>c.role===role),decisionPlan};
      attempt.sameDraftRechecks.push(await score('COPY_RECHECK',role,first,attempt.anonymousReads,extra));
    }
    let draft=first, changes=[];
    const edits=actions.filter(r=>r.action==='revise');
    if (edits.length) {
      await onEvent?.('创作者正在处理总监裁定的改稿项');
      const revision=await run('COPY_REVISE',craft+' 仅处理裁定要求修改的作品问题，保留每案 id 和职责；changes逐条说明修改前后和原因。',
        reviseSchema,{...source,...references,decisionPlan,sameDraftRechecks:attempt.sameDraftRechecks,draft:first},true);
      ({draft,changes}=revision.output);
      validateDraft(draft,materials);
      for (const d of draft.directions) {
        const old=first.directions.find(x=>x.id===d.id);
        requireThat(d.duty===old.duty,'改稿改变了方向职责身份');
        if (edits.some(r=>r.issue.directionId===d.id)) requireThat(digest(d)!==digest(old),'作品问题尚未改稿：'+d.name);
      }
      requireThat(changes.length,'改稿缺少修改对照');
    }
    Object.assign(attempt,{draft,changes});
    const revised=edits.length>0;
    attempt.finalAnonymousReads=revised ? await anonymousReads(draft) : attempt.anonymousReads;
    for (const vote of attempt.firstVotes) {
      const sameDraftRecheck=attempt.sameDraftRechecks.find(v=>v.role===vote.role);
      if (!revised) {
        attempt.finalVotes.push(sameDraftRecheck || {...vote,reused:true});
        continue;
      }
      const extra={initialDraft:reviewPacket(first).draft,originalVote:vote,sameDraftRecheck,changes,
        objections:attempt.challenges.find(c=>c.role===vote.role),decisionPlan};
      attempt.finalVotes.push(await score('COPY_RECHECK',vote.role,draft,attempt.finalAnonymousReads,extra));
    }
    const outstanding=attempt.finalVotes.flatMap(v=>blocked(v).map(i=>v.role+' '+i.directionId+'：'+[
      ...i.hardRejects,...i.blockers,...i.scores.filter(s=>s.score===null || s.score<4).map(s=>s.dimension+' '+(s.score??'待核')+' '+s.reason),i.reason].join('；')));
    const verdict=await run('COPY_ADJUDICATE','独立总监按当前稿分别给A/B/C单案准入、AB/AC/BC逐对差异及整组是否成立。逐对比较主张、情绪、品牌语义桥梁与视觉载体假设，不把换词换色当创意差别。再就各 issues 的id核实最终处置。阻断/关键缺证/必评不足4不得放行。独立说明推荐谁、为什么、牺牲什么；不平均、改票或代替人类采用。',adjudicateSchema,{
      upstream:reviewSources,...references,decisionPlan,sameDraftRechecks:attempt.sameDraftRechecks,draft,changes,finalVotes:attempt.finalVotes,
    });
    const adjudication=verdict.output;
    attempt.adjudication=adjudication;
    requireThat(exactly(adjudication.rulings.map(x=>x.challengeId),issues.map(i=>i.id)),'有异议未得到逐条独立裁定');
    requireThat(!outstanding.length,'文案复核未通过：'+outstanding.join('；'));
    const unresolved=adjudication.rulings.some(r=>{
      if (r.verdict!=='pending') return false;
      const prior=actions.find(a=>a.challengeId===r.challengeId);
      return prior.issue.blocking || prior.verdict!=='accepted_later';
    });
    requireThat(adjudication.ready && !unresolved,'文案裁定未通过：'+adjudication.reason);
    requireThat(exactly(adjudication.single.map(i=>i.directionId),ids) && adjudication.single.every(i=>i.ready),'单案准入未完成');
    requireThat(exactly(adjudication.pairs.map(i=>i.pair),['AB','AC','BC']) && adjudication.pairs.every(i=>i.distinct),'三案逐对差异未成立');
    requireThat(adjudication.set.ready,'三案整组未通过：'+adjudication.set.reason);
    const body=markdown(draft,adjudication);
    Object.assign(attempt,{status:'ready',bodyHash:hash(body),recommendation:adjudication.recommendation});
    return {body,directions:draft.directions.map(x=>x.name),copyReview:attempt};
  } catch(error) {
    attempt.status='blocked';attempt.error=error.message;
    await writeFile(join(dir,filename),JSON.stringify(attempt,null,2),{flag:'wx',mode:0o600});
    throw Error('本次文案记录：'+filename+'。'+error.message,{cause:error});
  }
}
