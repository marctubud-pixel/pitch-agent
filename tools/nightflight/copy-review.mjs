import {blindSlogans,buildSloganWorkbook,checkSloganChoices,fullSloganHash} from './slogan-workbook.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const headlineProtocol = 'dual-panel-headline-v4';
const roles = ['copy','brand','user','comms'];
const ids = ['A','B','C'];
const duties = {continuity:'稳健延续',feature:'品牌或产品特征放大',emotion:'用户氛围或情绪放大'};
const commonCriteria = ['事实准确，归属清楚','单句读得懂，念得顺','能接上本案策略'];
function criteria(duty) { return [...commonCriteria,duties[duty]]; }
export function validSingleReview(item, direction) {
  if (!direction || !Object.hasOwn(duties,direction.duty) || !Array.isArray(item?.checks)) return false;
  return exactly(item.checks.map(c=>c?.criterion),criteria(direction.duty)) &&
    item.checks.every(c=>typeof c.passed==='boolean' && nonempty(c.evidence) &&
      direction.main.includes(c.evidence) && nonempty(c.reason)) &&
    item.ready===item.checks.every(c=>c.passed);
}
const str = {type:'string'};
const list = items => ({type:'array',items});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const choice = values => ({type:'string',enum:values});
const draftSchema = object({directions:list(object({
  id:choice(ids), duty:choice(Object.keys(duties)), basis:str,name:str,claim:str,mechanism:str,
  strategyLink:str,main:str,risk:str,
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
  action:choice(['revise','recheck','none']),criterion:str,problem:str,reason:str,
}))});
const reviseSchema = object({baseHash:str,draft:draftSchema,changes:list(str)});
const repairSchema = object({baseHash:str,actions:list(object({
  issueId:str,directionId:choice(ids),action:choice(['revise','recheck','pause']),evidence:str,reason:str,
}))});
// A single user action may fund at most two additional repair decisions after the initial gate.
const maxFollowups = 2;
const recommendationSchema = object({directionId:choice(ids),reason:str,tradeoff:str,memory:str,retell:str,scene:str});
const adjudicateSchema = object({
  ready:{type:'boolean'},reason:str,recommendation:recommendationSchema,
  rulings:list(object({challengeId:str,verdict:choice(['resolved','rejected','pending']),reason:str})),
  single:list(object({directionId:choice(ids),ready:{type:'boolean'},reason:str,checks:list(object({criterion:str,passed:{type:'boolean'},evidence:str,reason:str}))})),
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
    for (const text of [d.claim,d.mechanism,d.main,d.strategyLink,d.risk]) {
      requireThat(!/[\r\n]/.test(text),'文案字段须逐项填写，不能嵌入其他段落');
    }
  }
}
function headlines(draft) {
  return {directions:draft.directions.map(({id,main})=>({id,main}))};
}
function validateVote(items, role, draft) {
  requireThat(exactly(items.map(x=>x.directionId),ids),'岗位 '+role+' 原票缺少单案或重复');
  for (const item of items) {
    const d=draft.directions.find(x=>x.id===item.directionId);
    const observed=item.scores.map(s=>s.dimension);
    requireThat(new Set(observed).size===observed.length && observed.every(label=>criteria(d.duty).includes(label)),
      role+' 的单案观察项重复或超出职责范围');
    for (const s of item.scores) requireThat(d.main.includes(s.evidence),
      role+' '+d.name+'「'+s.dimension+'」缺少可定位的稿件原文');
  }
}
function contestedObservations(vote) {
  return vote.items.filter(i=>i.decision!=='pass' || i.hardRejects.length || i.blockers.length ||
    i.scores.some(s=>s.score === null || s.score < 4));
}
const craft = '三个职责各一次，分配给哪案由本案决定：稳健延续使用品牌可识别表达，缺品牌资料可使用有来源的行业/品类/媒介惯例；第二类放大具体品牌或产品特征；第三类放大用户氛围或情绪。依据 basis 逐字摘取一段当前输入，通用做法不能说成品牌资产。每案只提交一条可独立阅读的主标题 main。创意机制、依据与风险仅用于内部记录。各字段写单行，名称不带排序号。提交稿件不附作者推荐、排名、分数或评语。';
const anchors = {
  1:'与任务冲突或表达无法成立',2:'需重做才能让读者理解并符合事实',
  3:'部分成立，但仍有具体歧义或关键衔接待解决',4:'在本案给定条件下有明确证据支持成立',
  5:'除达到4外，还能指出相较本组可比写法的具体优势',
};
const scope = '当前简报、产品事实及三案范围。品牌联系区分字面提及、语义关联与真实感知；传播仅评估复述潜力，不推断实测效果。两案互换、换品牌、换节点均为诊断，不据此单独扣分。';
const scoring = '先逐案后比较。criteriaByDirection 是每个方向可观察的范围，本岗只记录实际查到的项；一案可留零至四项，同项不重复。观察分1–5，关键未知填 null。不得为凑齐四项补分。evidence 仅逐字引用该案主标题里的短语。只评标题本身，不以附加文案或作者解释补足标题，reason说明本分与相邻锚点的区别；scope写明本维度就哪个对象、证据范围或哪组候选作比较。不得因缺促销CTA扣品牌主题分。分数、未知或岗位退修意见只作观察，由总监依单案四项证据裁定。推荐时再看记忆、复述与场景。四岗是独立模型会话，用户岗只模拟阅读。禁止计算平均分。';
export function headlineMarkdown(draft) {
  return draft.directions.map(d=>'## '+d.name+'\n主标题：'+d.main).join('\n\n');
}

export async function runCopyReview({call, project, inputs, rules, dir, onEvent}) {
  const attempt = {version:3,protocol:headlineProtocol,status:'working',calls:[],anonymousReads:[],firstVotes:[],criticReads:[],challenges:[],finalVotes:[]};
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
  function reviewPacket(draft) {
    // Ground each review in the brief and verbatim upstream excerpts. Keep the
    // author's interpretation and the association with a particular title private.
    const facts = [...new Set(draft.directions.map(d=>d.basis))].map(quote=>({
      quote,sources:[...(project.brief?.includes(quote)?['原始简报']:[]),
        ...inputs.texts.filter(t=>t.text?.includes(quote)).map(t=>t.name)],
    }));
    return {upstream:{brief:project.brief,facts},criteriaByDirection:Object.fromEntries(draft.directions.map(d=>[d.id,criteria(d.duty)])),draftHash:digest(draft),draft:headlines(draft)};
  }
  async function anonymousReads(draft) {
    const reads=[];
    const candidates=draft.directions.map(({id,main})=>({directionId:id,main}));
    for (const role of roles) {
      const {output,receipt}=await run('COPY_ANONYMOUS','仅凭匿名主标题，逐案记下自然理解：谁在说什么、会读到什么、哪里不确定。不可自行补背景，不评分。',anonymousSchema,{role,candidates});
      requireThat(exactly(output.items.map(i=>i.directionId),ids),'匿名首读未覆盖三案');
      reads.push({role,draftHash:digest(draft),...receipt,items:output.items});
    }
    return reads;
  }
  async function score(phase,role,draft,reads,extra={}) {
    const anonymousRead=reads.find(r=>r.role===role);
    const packet={role,anchors,scope,...reviewPacket(draft),anonymousRead,...extra};
    const {output,receipt}=await run(phase,scoring+(phase==='COPY_RECHECK'?' 核对裁定、旧问题和当前同版，保留原分；仅按真实证据判断是否维持或改判。':' 对照本岗已锁定的匿名阅读再独立评分。'),voteSchema,packet);
    validateVote(output.items,role,draft);
    return {role,draftHash:digest(draft),anonymousReadRunId:anonymousRead.runId,...receipt,items:output.items};
  }
  async function revise(base, targets, packet) {
    const baseHash=digest(base);
    const {output}=await run('COPY_REVISE',craft+' 使用生成规范中的 slogan-engine 定向打磨。每个 editRequests 汇总的岗位证据只处理一次。只修改 targets 内裁定确有作品问题的方向；逐字保留其余方向、顺序及每案身份。baseHash 原样返回，changes逐条写清改前、改后及原因。',
      reviseSchema,{...packet,baseHash,draft:base,targets:[...targets]},true);
    requireThat(output.baseHash===baseHash,'改稿与冻结原稿身份不符');
    validateDraft(output.draft,materials);
    for (const [index,d] of output.draft.directions.entries()) {
      const old=base.directions[index];
      requireThat(d.id===old.id && d.duty===old.duty,'改稿改变了方向身份或顺序');
      if (targets.has(d.id)) requireThat(d.main.trim()!==old.main.trim(),'作品问题尚未改稿：'+d.name);
      else requireThat(isDeepStrictEqual(d,old),'改稿改动了冻结方向：'+old.name);
    }
    const edited=output.draft.directions.filter(d=>targets.has(d.id));
    const reads=await blindSlogans(run,edited.map(d=>d.main));
    (attempt.sloganRevisions??=[]).push({baseHash,changes:output.changes,
      before:base.directions.filter(d=>targets.has(d.id)),after:edited,reads});
    requireThat(reads.every(r=>r.output.items.every(i=>i.usable)),'改稿的主标题未通过复闸，原稿、修改和两份盲读已存入工作底稿');
    requireThat(output.changes.length,'改稿缺少修改对照');
    return output;
  }
  async function evaluatePanel(draft,votes,reads) {
    const draftHash=digest(draft);
    const prefix=attempt.panelHistory.length ? draftHash+'-' : '';
    requireThat(votes.every(v=>v.draftHash===draftHash) && reads.every(r=>r.draftHash===draftHash),'双团评审收到其他版本的票或首读');
    const panel={draftHash,draft,votes,anonymousReads:reads,criticReads:[],challenges:[]};
    attempt.panelHistory.push(panel);
    for (const role of roles) {
      const {output,receipt}=await run('COPY_CRITIC_BLIND',
        '独立找本岗可能遗漏的事实、表达或同组三案风险。先不看原票、不打分。逐案列出所有独立风险，一条对应一个风险；某案确无发现时仅写一条 risk 和 evidence 均为空的记录。提出风险必须引当前该案逐字证据。',
        criticSchema,{role,...reviewPacket(draft)});
      for (const id of ids) {
        const reads=output.items.filter(i=>i.directionId===id);
        requireThat(reads.length,'异议岗独立阅读未覆盖方向 '+id);
        requireThat(reads.length===1 || reads.every(i=>nonempty(i.risk)),'同案存在风险时不得混入无风险记录');
      }
      for (const item of output.items) {
        const d=draft.directions.find(d=>d.id===item.directionId);
        requireThat(!item.risk.trim() && !item.evidence.trim() || nonempty(item.risk) && nonempty(item.evidence) &&
          d.main.includes(item.evidence),role+' 漏项缺该案证据');
      }
      const items=output.items.map((item,index)=>({...item,readId:role+'-'+receipt.runId+'-'+(index+1)}));
      panel.criticReads.push({role,draftHash:draftHash,...receipt,items});
    }
    for (const vote of votes) {
      const blindRead=panel.criticReads.find(r=>r.role===vote.role);
      const {output,receipt}=await run('COPY_CHALLENGE',
        '保留本岗独立漏项阅读，核原票的具体肯定、证据是否已经覆盖。coverage逐条引用 blindRead.items 的 readId 与 directionId，每条恰好一次，包括无风险记录。指向该案四项内的相关维度并具体说明原票是否观察过这一项，以及漏项是否已处理、为何保留或质疑原判。items只列确有依据的异议，区分反证、缺证、偏好、已覆盖与阶段外；action说明影响和建议。个人偏好不阻断，未见新增漏项允许空列表。不得打分。',
        challengeSchema,{role:vote.role,...reviewPacket(draft),blindRead,vote});
      const readsById=new Map(blindRead.items.map(i=>[i.readId,i]));
      requireThat(exactly(output.coverage.map(c=>c.readId),[...readsById.keys()]) &&
        output.coverage.every(c=>readsById.get(c.readId)?.directionId===c.directionId && criteria(draft.directions.find(d=>d.id===c.directionId).duty).includes(c.dimension)),
        '对应异议未逐条覆盖同案首读记录或所指原票有误');
      const items=output.items.map((item,i)=>{
        const d=draft.directions.find(d=>d.id===item.directionId);
        requireThat(criteria(d.duty).includes(item.dimension) && d.main.includes(item.evidence),'异议未对应该案原文或原岗维度');
        return {...item,id:prefix+vote.role+'-'+(i+1)};
      });
      const coverage=output.coverage.map(c=>{
        const item=vote.items.find(i=>i.directionId===c.directionId);
        const score=item.scores.find(s=>s.dimension===c.dimension);
        return {...c,originalClaim:score?.reason ?? item.reason,originalEvidence:score?.evidence ?? null,originalObserved:!!score,
          independentRead:readsById.get(c.readId)};
      });
      panel.challenges.push({role:vote.role,draftHash:draftHash,blindReadRunId:blindRead.runId,voteRunId:vote.runId,...receipt,items,coverage});
    }
    const issues=[
      ...votes.flatMap(v=>contestedObservations(v).flatMap(item=>{
        const grounds=[
          ...item.hardRejects.map(reason=>({kind:'hard_reject',reason})),
          ...item.blockers.map(reason=>({kind:'blocker',reason})),
          ...item.scores.filter(s=>s.score===null || s.score<4).map(s=>({kind:'score',...s})),
        ];
        if (!grounds.length) grounds.push({kind:'decision',reason:item.reason});
        return grounds.map((ground,index)=>({
          id:prefix+['score',v.role,item.directionId,index+1].join('-'),role:v.role,directionId:item.directionId,
          blocking:false,origin:'score',...ground,item,
        }));
      })),
      ...panel.challenges.flatMap(c=>c.items.map(i=>({...i,role:c.role,origin:'challenge'}))),
    ];
    panel.issues=issues;
    const references={initialDraft:headlines(draft),anonymousReads:reads,firstVotes:votes,
      criticReads:panel.criticReads,challenges:panel.challenges,issues};
    const plan=await run('COPY_PLAN',
      '在创作者改稿前独立逐条裁定 issues；每个id必须决定采纳当前/后续、驳回或待核及理由。每条给 criterion，选该方向对应四项之一、“逐对差异”或“推荐观察”。problem 是这条具体问题的短描述；不同岗位或不同维度指出同一处实质缺陷时复用同一句 problem，彼此独立的问题用不同描述。保留各岗原句证据。只对单案四项中成立的作品缺陷要求改稿。逐对差异在整组裁定处理，推荐观察仅比较记忆、复述、适用场景，二者在此 action=none。低分、待核和岗位意见本身不阻断。作品确需修改时 action=revise，评分原判有误或证据需要复核时 action=recheck 且保持原稿，非阻断范围外事项可延后。不得代评分岗改分。没有问题可为空。',
      planSchema,{...reviewPacket(draft),...references});
    const decisionPlan={...plan.output,...plan.receipt,draftHash};
    panel.decisionPlan=decisionPlan;
    requireThat(exactly(decisionPlan.rulings.map(r=>r.challengeId),issues.map(i=>i.id)),'改稿前的独立裁定缺项');
    const actions=decisionPlan.rulings.map(r=>({...r,issue:issues.find(i=>i.id===r.challengeId)}));
    for (const r of actions) {
      requireThat(r.action !== 'revise' || r.verdict === 'accepted_now','未采纳当前的事项不能要求改稿');
      requireThat(!['accepted_later','pending'].includes(r.verdict) || r.action==='none','待核或延后事项不能当作已就绪的改稿任务');
      const d=draft.directions.find(d=>d.id===r.issue.directionId);
      requireThat(!(r.action==='none' && r.verdict==='accepted_now' && criteria(d.duty).includes(r.criterion)),'已采纳的单案问题必须改稿或同稿复核');
      requireThat(criteria(d.duty).includes(r.criterion) ||
        (['逐对差异','推荐观察'].includes(r.criterion) && r.action==='none'),'裁定须对齐单案四项、逐对差异或推荐观察');
    }
    // Preserve individual rulings while dispatching one edit for each concrete defect.
    const requests=new Map();
    for (const a of actions.filter(a=>a.action==='revise')) {
      const key=a.issue.directionId+'-'+a.problem.trim();
      if (!requests.has(key)) requests.set(key,{directionId:a.issue.directionId,problem:a.problem.trim(),observations:[]});
      requests.get(key).observations.push({id:a.challengeId,role:a.issue.role,criterion:a.criterion,reason:a.reason,
        evidence:a.issue.evidence || a.issue.item?.scores.find(s=>s.dimension===a.criterion)?.evidence});
    }
    decisionPlan.editRequests=[...requests.values()];
    return {panel,references,actions};
  }
  try {
    const source={brief:project.brief,materials:inputs.texts,feedback:project.feedback || []};
    await onEvent?.('文案负责人正在创作三个方向');
    const skill=rules.find(rule=>rule.includes('name: slogan-engine'));
    requireThat(skill,'缺少完整版 slogan-engine');
    const workbook=await buildSloganWorkbook(run,source);
    attempt.sloganWorkbook={...workbook,skillHash:fullSloganHash(skill)};
    const generated=await run('COPY_CREATE',craft+' 从本案版本族中选经两位独立读者均判断 usable 的一句作为各案 main，逐字保留，保持职责及连接。仅归档工作稿另附。',draftSchema,{...source,workbook},true);
    const first=generated.output;
    validateDraft(first,materials);
    checkSloganChoices(first,workbook);
    attempt.initialDraft=first;
    await onEvent?.('四岗分别首读文案初稿');
    attempt.anonymousReads=await anonymousReads(first);
    for (const role of roles) attempt.firstVotes.push(await score('COPY_FIRST',role,first,attempt.anonymousReads));

    attempt.panelHistory=[];
    let activePanel=await evaluatePanel(first,attempt.firstVotes,attempt.anonymousReads);
    const {references,actions}=activePanel;
    const {decisionPlan,issues,criticReads,challenges}=activePanel.panel;
    Object.assign(attempt,{decisionPlan,issues,criticReads,challenges});
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
      ({draft,changes}=await revise(first,new Set(edits.map(r=>r.issue.directionId)),
        {...source,...references,decisionPlan,sameDraftRechecks:attempt.sameDraftRechecks}));
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
      const extra={initialDraft:reviewPacket(first).draft,originalVote:vote,sameDraftRecheck,
        objections:attempt.challenges.find(c=>c.role===vote.role),decisionPlan};
      attempt.finalVotes.push(await score('COPY_RECHECK',vote.role,draft,attempt.finalAnonymousReads,extra));
    }
    attempt.polishRounds=[];
    // Material changes invalidate both panels. Same-text score corrections retain
    // the original paired challenge and disclose the corrected vote to the director.
    const completedRechecks=new Set();
    const allActions=[...actions];
    for (let round=0; ; round++) {
      if (digest(draft)!==activePanel.panel.draftHash) {
        activePanel=await evaluatePanel(draft,attempt.finalVotes,attempt.finalAnonymousReads);
        allActions.push(...activePanel.actions);
      }
      const current=activePanel.panel;
      const priorPlans=attempt.panelHistory.slice(0,-1).map(p=>({
        draftHash:p.draftHash,issues:p.issues,decisionPlan:p.decisionPlan,
      }));
      const requiredRulingIds=allActions.map(r=>r.challengeId);
      const verdict=await run('COPY_ADJUDICATE','独立总监按当前稿分别给A/B/C单案准入、AB/AC/BC逐对差异及整组是否成立。逐对比较主张、情绪、品牌语义桥梁与文字可唤起的不同画面，限标题可读到的线索，不要求提交视觉或场景文案。按 requiredRulingIds 逐条核实本版与前版遗留裁定是否在当前稿解决。若本版决定需改稿或同稿复核且尚无执行证据，不得视为已解决。按 criteriaByDirection 每案只裁四项 checks，各引同案标题原句。逐项判断通过与否，四项全过则该案 ready。岗位分数和意见只作证据观察。不得因逐对雷同或推荐不足改判单案。逐对不成立只影响整组。推荐另写 memory、retell、scene。set.ready 仅表示三对都成立。独立说明推荐谁、为什么、牺牲什么；不平均、改票或代替人类采用。',adjudicateSchema,{
        ...reviewPacket(draft),...activePanel.references,decisionPlan:current.decisionPlan,priorPlans,requiredRulingIds,
        sameDraftRechecks:attempt.sameDraftRechecks,draft:headlines(draft),finalVotes:attempt.finalVotes,previousRepair:attempt.polishRounds.at(-1)?.repair,
      });
      const adjudication=verdict.output;
      attempt.adjudication=adjudication;
      (current.verdicts??=[]).push({adjudication,runId:verdict.receipt.runId,voteRunIds:attempt.finalVotes.map(v=>v.runId)});
      requireThat(exactly(adjudication.rulings.map(x=>x.challengeId),requiredRulingIds),'有异议未得到逐条独立裁定');
      requireThat(exactly(adjudication.single.map(i=>i.directionId),ids),'单案准入记录不完整');
      requireThat(exactly(adjudication.pairs.map(i=>i.pair),['AB','AC','BC']),'三案逐对差异记录不完整');
      for (const item of adjudication.single) requireThat(validSingleReview(item,draft.directions.find(d=>d.id===item.directionId)),'单案四项裁定、原句证据或准入结论不一致');
      const untouchedActions=current.draftHash===digest(first) ? [] : activePanel.actions.filter(a=>
        a.action!=='none' && !completedRechecks.has(a.challengeId));
      const failures=[];
      for (const item of adjudication.single.filter(i=>!i.ready)) {
        const unassigned=item.checks.filter(c=>!c.passed && !untouchedActions.some(a=>
          a.issue.directionId===item.directionId && a.criterion===c.criterion));
        if (unassigned.length) failures.push({id:'single-'+item.directionId,eligible:[item.directionId],
          reason:'单案待改：'+item.reason,checks:unassigned});
      }
      for (const item of adjudication.pairs.filter(i=>!i.distinct))
        failures.push({id:'pair-'+item.pair,eligible:[...item.pair],reason:'逐对差异未成立：'+item.reason});
      for (const ruling of adjudication.rulings.filter(r=>r.verdict==='pending')) {
        const prior=allActions.find(a=>a.challengeId===ruling.challengeId);
        if (prior.action!=='none' && !untouchedActions.some(a=>a.challengeId===prior.challengeId)) failures.push({
          id:'ruling-'+ruling.challengeId,role:prior.issue.role,eligible:[prior.issue.directionId],reason:ruling.reason,
        });
      }
      for (const request of current.decisionPlan.editRequests) {
        const pending=request.observations.filter(o=>untouchedActions.some(a=>a.challengeId===o.id));
        if (pending.length) failures.push({id:'current-'+pending[0].id,eligible:[request.directionId],
          requiredAction:'revise',reason:'单案待改：'+request.problem,observations:pending});
      }
      for (const a of untouchedActions.filter(a=>a.action==='recheck')) {
        failures.push({id:'current-'+a.challengeId,role:a.issue.role,eligible:[a.issue.directionId],
          requiredAction:'recheck',challengeId:a.challengeId,reason:a.reason});
      }
      requireThat(adjudication.set.ready===adjudication.pairs.every(p=>p.distinct),'整组差异结论与逐对判断不一致');
      if (!failures.length) requireThat(adjudication.ready,'文案准入总裁定与单案及整组通过记录不一致');
      if (!failures.length) {
        const body=headlineMarkdown(draft);
        Object.assign(attempt,{status:'ready',bodyHash:hash(body),recommendation:adjudication.recommendation});
        return {body,directions:draft.directions.map(x=>x.name),copyReview:attempt};
      }

      const reasons=failures.map(f=>f.reason).join('；');
      requireThat(round<maxFollowups,'文案达到本次打磨上限：'+reasons);
      const baseHash=digest(draft);
      const priorVotes=attempt.finalVotes;
      const history={round:round+1,baseHash,draft,anonymousReads:attempt.finalAnonymousReads,votes:priorVotes,
        adjudication,adjudicationRunId:verdict.receipt.runId,failures};
      attempt.polishRounds.push(history);
      await onEvent?.('文案门禁退回，正在定位待改原句或需同稿复核的原判');
      const triage=await run('COPY_REPAIR_PLAN',
        '逐条核对本版 failures；退回可落实的作品问题才 revise。每项给出 affected directionId（必须在 eligible 内），evidence 逐字引用该案。作品无误、原判与依据不符时要求 recheck；缺真实上游资料、外部授权或没有可执行的修复时 pause。保住已通过的案；两案相似必须解释只动哪一案以及理由。不得降低门槛，原样回传 baseHash。已有 requiredAction 的具体裁定必须执行；不能用复核替代已裁定的作品改稿。',
        repairSchema,{baseHash,...reviewPacket(draft),votes:priorVotes,adjudication,failures,currentDecision:current.decisionPlan});
      const repair={...triage.output,...triage.receipt};
      history.repair=repair;
      requireThat(repair.baseHash===baseHash && exactly(repair.actions.map(a=>a.issueId),failures.map(f=>f.id)),
        '退回事项或稿件身份未对齐');
      const targets=new Set(), recheckRoles=new Set();
      for (const action of repair.actions) {
        const failure=failures.find(f=>f.id===action.issueId);
        const d=draft.directions.find(d=>d.id===action.directionId);
        requireThat(failure.eligible.includes(d.id) && d.main.includes(action.evidence),
          '打磨裁定与退回方向或原文不符');
        requireThat(action.action!=='pause',failure.reason+'；暂停打磨：'+action.reason);
        requireThat(!failure.requiredAction || action.action===failure.requiredAction,'打磨动作与本版独立裁定不符：'+failure.reason);
        if (action.action==='recheck' && failure.challengeId) completedRechecks.add(failure.challengeId);
        if (action.action==='revise') targets.add(d.id);
        else if (failure.role) recheckRoles.add(failure.role);
      }
      const corrected=[];
      for (const role of recheckRoles) {
        const originalVote=priorVotes.find(v=>v.role===role);
        corrected.push(await score('COPY_RECHECK',role,draft,attempt.finalAnonymousReads,
          {originalVote,decisionPlan:repair,currentPlan:current.decisionPlan,
            objections:current.challenges.find(c=>c.role===role),changes:[],priorAdjudication:adjudication}));
      }
      history.sameDraftRechecks=corrected;
      attempt.sameDraftRechecks.push(...corrected);
      if (targets.size) {
        const result=await revise(draft,targets,{...source,decisionPlan:repair,currentPlan:current.decisionPlan,
          objections:current.challenges,failures,priorVotes,sameDraftRechecks:corrected});
        const revisedHeadlines=headlines(result.draft);
        requireThat(![attempt.initialDraft,...attempt.polishRounds.map(r=>r.draft)].some(previous=>
          isDeepStrictEqual(headlines(previous),revisedHeadlines)),'文案打磨重复已退回的主标题：'+reasons);
        draft=result.draft;
        changes=[...changes,...result.changes];
        Object.assign(history,{changes:result.changes,revisedHash:digest(draft)});
        attempt.draft=draft;
        attempt.changes=changes;
        attempt.finalAnonymousReads=await anonymousReads(draft);
        attempt.finalVotes=[];
        for (const role of roles) {
          const originalVote=corrected.find(v=>v.role===role) || priorVotes.find(v=>v.role===role);
          attempt.finalVotes.push(await score('COPY_RECHECK',role,draft,attempt.finalAnonymousReads,{
            originalVote,initialDraft:reviewPacket(history.draft).draft,decisionPlan:repair,
          }));
        }
      } else {
        attempt.finalVotes=priorVotes.map(v=>corrected.find(c=>c.role===v.role) || v);
      }
    }
  } catch(error) {
    attempt.status='blocked';attempt.error=error.message;
    await writeFile(join(dir,filename),JSON.stringify(attempt,null,2),{flag:'wx',mode:0o600});
    throw Error('本次文案记录：'+filename+'。'+error.message,{cause:error});
  }
}
