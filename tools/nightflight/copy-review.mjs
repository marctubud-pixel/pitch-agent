import {invalidOutput} from './call-checkpoints.mjs';
import {blindSlogans,buildSloganWorkbook,checkSloganChoices,fullSloganHash} from './slogan-workbook.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { headlineFromSections, sectionsOf } from '../../shared/stage-text.mts';

export const headlineProtocol = 'dual-panel-headline-v4';
export const engineCopyProtocol = 'director-engine-selection-v2';
export const isEngineCopyProtocol = protocol=>protocol===engineCopyProtocol || protocol==='director-engine-selection-v1';
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

export function readPublishedCopy(project, body) {
  const review = project.copyReview;
  if (review) {
    // On disk the published markdown can end in a newline added by addText.
    const linked = review.status === 'ready' && body &&
      [body, body.replace(/\r?\n$/u, '')].some(text => hash(text) === review.bodyHash);
    const directions = linked ? review.draft?.directions ?? [] : [];
    return {drafts:new Map(directions.map(direction=>[direction.name, direction])), recommendation:linked ? review.recommendation : null};
  }
  const sections = sectionsOf(body);
  const drafts = new Map();
  for (const [index, name] of (project.directions ?? []).entries()) {
    const main = headlineFromSections(sections, name, index);
    if (main) drafts.set(name, {name, main});
  }
  return {drafts, recommendation:null};
}
function requireThat(ok, message) { if (!ok) throw invalidOutput(message); }
function nonempty(text) { return typeof text === 'string' && !!text.trim(); }
function exactly(values, expected) {
  return values.length === expected.length && expected.every(value=>values.includes(value));
}
// The Codex CLI adapter supplies parsed JSON but does not validate it against the requested schema.
function validate(value, schema, path) {
  if (schema.type === 'object') {
    requireThat(value && typeof value === 'object' && !Array.isArray(value),path+' 须为对象');
    const missing = schema.required.filter(field=>!Object.hasOwn(value,field));
    const extra = Object.keys(value).filter(field=>!Object.hasOwn(schema.properties,field));
    requireThat(!missing.length && !extra.length,path+' 字段不完整或包含额外字段'+
      (missing.length ? '。缺少 '+missing.join('、') : '')+
      (extra.length ? '。只允许 '+schema.required.join('、') : ''));
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
const scope = '稳健延续按有据的品牌线索或品类惯例判断。以标题所承担的方向为准。当前简报、产品事实及三案范围。品牌联系区分字面提及、语义关联与真实感知；传播仅评估复述潜力，不推断实测效果。两案互换、换品牌、换节点均为诊断，不据此单独扣分。';
const scoring = '先逐案后比较。criteriaByDirection 是每个方向可观察的范围，本岗只记录实际查到的项；一案可留零至四项，同项不重复。观察分1–5，关键未知填 null。不得为凑齐四项补分。evidence 仅逐字引用该案主标题里的短语。只评标题本身，不以附加文案或作者解释补足标题，reason说明本分与相邻锚点的区别；scope写明本维度就哪个对象、证据范围或哪组候选作比较。不得因缺促销CTA扣品牌主题分。分数、未知或岗位退修意见只作观察，由总监依单案四项证据裁定。推荐时再看记忆、复述与场景。四岗是独立模型会话，用户岗只模拟阅读。禁止计算平均分。';
export function headlineMarkdown(draft) {
  return draft.directions.map(d=>'## '+d.name+'\n主标题：'+d.main).join('\n\n');
}

const enginePhases = ['COPY_ENGINE_WRITE', 'COPY_ENGINE_RECOMMEND'];
const engineRepairPhases = ['COPY_ENGINE_GROUND', 'COPY_ENGINE_PICK'];
const engineDirections = list(object({
  id:choice(ids), name:str, basis:str, claim:str, mechanism:str, strategyLink:str, secondary:str,
  candidates:list(object({text:str, use:str})),
}));
const engineDraftSchema = object({directions:engineDirections});
const enginePicks = object(Object.fromEntries(ids.map(id=>[id,choice([1,2,3,4].map(n=>id+n))])));
const enginePairs = ['AB','AC','BC'];
const engineAuthorCheck = object({
  selections:list(object({directionId:choice(ids),phrase:str,takeaway:str,sloganReady:{type:'boolean'}})),
  pairs:list(object({pair:choice(enginePairs),distinct:{type:'boolean'},reason:str})),
});
const engineWriterSchema = object({directions:engineDirections,picks:enginePicks,authorCheck:engineAuthorCheck});
const engineRecommendation = object({directionId:choice(ids),reason:str});
const engineFactInstruction='作者交稿前核对每一条候选、每案副标和用于选句的事实。已确认组成、归类、规格、计量单位与适用对象以本版原始 Brief 为准；品类名称不代表每项配料都属于该品类，说明种数时按对应类别计算。确认含某配料不等于确认每袋或每次的颗数、配比和口感强度；这些未给时只写已知组成，避开定量承诺。未确认包装结构、开启方式或使用性能时，场景可以帮助想象，勿把具体开启能力写成产品保证。逐字依据存在也要逐句核对主张是否由它支持。按原版 slogan-engine 保留三个独立创意方向、每案原候选与作者自选。';

function validateEngineDraft(draft, materials) {
  validate(draft,engineDraftSchema,'创作底稿');
  const directions = draft.directions;
  requireThat(exactly(directions.map(d=>d.id),ids),'需要 A、B、C 三个方向');
  const normalize = text=>text.normalize('NFKC').replace(/[\p{P}\s]/gu,'').toLowerCase();
  for (const field of ['name','claim','mechanism']) {
    const values = directions.map(d=>normalize(d[field]));
    requireThat(values.every(Boolean) && new Set(values).size===3,'三案的名称、主张和创意机制必须各自不同');
  }
  for (const d of directions) {
    requireThat(d.name===d.name.trim() && d.name.length<=100 &&
      [d.name,d.claim,d.mechanism,d.strategyLink,d.secondary,...d.candidates.map(c=>c.text)].every(text=>!/[\r\n]/.test(text)),
      '方向名、文案和文案说明须分别为单行');
    requireThat(d.candidates.length>=3 && d.candidates.length<=4 &&
      new Set(d.candidates.map(c=>normalize(c.text))).size===d.candidates.length &&
      d.candidates.every(c=>normalize(c.text)), '每个方向需要三到四条不同的原候选');
    requireThat(!materials || materials.some(text=>text.includes(d.basis)),'方向 '+d.id+' 的依据无法定位到当前上游原文');
  }
}

function validatePackagedCopyFacts(directions, source) {
  const brief=source.normalize('NFKC').replace(/\s/gu,'');
  const description=brief.match(/(?:配料[：:]|配料为|包含|内含|含有)([^。；;！？!?]{2,90})/u)?.[1] ?? '';
  const recipe=description.split(/[，,](?=(?:面向|适合|用于|主要|每袋|每盒|售价|价格|包装|电商|品牌))/u)[0];
  const ingredients=[...new Set(recipe.split(/[、，,和及与]/u).filter(Boolean))];
  const nuts=/^(?:巴旦木|杏仁|扁桃仁|腰果|核桃(?:仁)?|榛子|开心果|碧根果|夏威夷果|松子|花生|板栗|栗子)$/u;
  const fruits=/^(?:冻干)?(?:草莓|蓝莓|蔓越莓|苹果|芒果|香蕉|葡萄|桑葚|桃|菠萝)(?:干|片|粒)?$/u;
  const fruitIngredients=ingredients.filter(item=>fruits.test(item));
  const nutCount=ingredients.filter(item=>nuts.test(item)).length;
  const mixed=nutCount>0 && fruitIngredients.length>0 && nutCount+fruitIngredients.length===ingredients.length;
  const types=/(\d+|[一二两三四五六七八九十])(?:种|类|款|样)坚果/gu;
  const count=value=>Number(value) || (value==='两'?2:'一二三四五六七八九十'.indexOf(value)+1);
  const groupCounts=text=>[...text.matchAll(types)].filter(match=>
    !/(?:并非|不是|并不是|不写成|不得写成|避免说成)$/u.test(text.slice(Math.max(0,match.index-6),match.index))).map(match=>count(match[1]));
  const namedCounts=groupCounts(brief);
  const oneHand=/(?:单手|一只手|一手)(?:就能|也能|即可|能|可|轻松|轻轻|直接)?(?:撕开|打开|拆开|开启|开袋)|(?:撕开|打开|拆开|开启|开袋).{0,5}(?:只需|只要|仅需)(?:单手|一只手|一手)/u;
  const canUseOneHand=brief.split(/[。；;，,！!？?]/u).some(clause=>oneHand.test(clause) && !/不能|不可|未确认|未经验证|未知|无法/u.test(clause));
  const quantityPattern=fruitIngredients.length ? new RegExp('(?:每袋(?:仅有|只有|有|含有?|装有?)?|加(?:了)?|含有?|内有)(?<count>[一二两三四五六七八九十]|\\d+)(?<unit>颗|粒|片|块)(?<item>'+fruitIngredients.map(RegExp.escape).join('|')+')','gu') : null;
  const knownQuantity=quantityPattern ? [...brief.matchAll(quantityPattern)].map(({groups})=>[count(groups.count),groups.unit,groups.item].join('|')) : [];
  const findings=[];
  for (const direction of directions) {
    const lines=[direction.name,direction.claim,direction.mechanism,direction.strategyLink,direction.secondary,...direction.candidates.map(candidate=>candidate.text)];
    for (const line of new Set(lines)) {
      const compact=line.normalize('NFKC').replace(/\s/gu,'');
      const wrongGroup=mixed && groupCounts(compact).some(value=>value!==nutCount && !namedCounts.includes(value));
      const inventedAmount=quantityPattern && [...compact.matchAll(quantityPattern)].some(({groups})=>
        !knownQuantity.includes([count(groups.count),groups.unit,groups.item].join('|')));
      const promisedOpening=!canUseOneHand && oneHand.test(compact) && !/没有证实|未确认|未承诺|未验证|无法|不能/u.test(compact);
      if (wrongGroup || inventedAmount || promisedOpening) findings.push(direction.id+'案「'+line.slice(0,58)+'」');
    }
  }
  requireThat(!findings.length,'文案事实须与 Brief 一致，核对配料类别、单袋颗数与开启能力：'+findings.slice(0,5).join('；')+'。请原作者保留各案创意连接，只纠正无依据的事实。');
}

function resolveEnginePicks(workbook, picks) {
  validate(picks,enginePicks,'案内选句');
  const directions = workbook.directions.map(({candidates,...direction})=>{
    const code = picks[direction.id];
    const picked = candidates[Number(code.slice(1))-1];
    requireThat(picked,'只能从该方向已写出的候选中选句：'+code);
    return {...direction,main:picked.text};
  });
  const titles = directions.map(d=>d.main.normalize('NFKC').replace(/[\p{P}\s]/gu,'').toLowerCase());
  requireThat(new Set(titles).size===3,'三案主标题必须不同');
  return {directions};
}

function validateEngineAuthorCheck({selections,pairs}, draft) {
  requireThat(exactly(selections.map(check=>check.directionId),ids),'案内自检需要 A、B、C 各一项');
  requireThat(exactly(pairs.map(check=>check.pair),enginePairs),'需要 AB、AC、BC 各一项创意差异自检');
  for (const {directionId,phrase,sloganReady} of selections) {
    const {main}=draft.directions.find(d=>d.id===directionId);
    requireThat(sloganReady,'方向 '+directionId+' 的自选句只传达公告信息或读不出创意连接，重写该案');
    requireThat(/[\p{L}\p{N}]/u.test(phrase) && main.includes(phrase),'方向 '+directionId+' 的创意措辞须逐字引用自选主标题原文');
  }
  for (const {pair,distinct} of pairs) {
    requireThat(distinct,'方向 '+pair+' 的自选句未体现创意差异，重新寻找不同的连接');
  }
}

function engineCopyMarkdown(draft) {
  return draft.directions.map(d=>'## '+d.name+'\n主标题：'+d.main+'\n副标：'+d.secondary).join('\n\n');
}

function engineReceipt(receipt, phase) {
  return receipt?.phase===phase && nonempty(receipt.runId) && nonempty(receipt.threadId) &&
    /^deepseek(?:[-_/]|$)/i.test(receipt.model ?? '') && /^[a-f0-9]{64}$/.test(receipt.inputPacketHash ?? '');
}

function repairableQuantityClaims(direction, brief, basis) {
  const quantities=text=>(text ?? '').normalize('NFKC').replace(/\s/gu,'').toLowerCase()
    .match(/\d+(?:\.\d+)?(?:千克|毫克|公斤|克|毫升|分钟|小时|元|%|kg|ml|g\b)/giu) ?? [];
  const sourced=new Set([...quantities(brief),...quantities(basis)]);
  const visible=[direction.claim,direction.secondary,...direction.candidates.map(c=>c.text)];
  return visible.every(text=>quantities(text).every(value=>sourced.has(value)));
}

export function engineCopyHandoffReady(review, names, text) {
  try {
    if (!isEngineCopyProtocol(review?.protocol) || review.version!==1 || review.status!=='ready' ||
        !/^[a-f0-9]{64}$/.test(review.skillHash ?? '') || !nonempty(text) || review.bodyHash!==hash(text) ||
        review.calls?.length!==2 || !engineReceipt(review.calls[0],enginePhases[0]) ||
        !engineReceipt(review.calls[1],review.protocol===engineCopyProtocol ? enginePhases[1] : 'COPY_ENGINE_SELECT') ||
        review.calls[0].runId===review.calls[1].runId || review.calls[0].threadId===review.calls[1].threadId) return false;
    if (review.repairs!==undefined) {
      if (!Array.isArray(review.repairs) || !review.repairs.every(r=>engineRepairPhases.includes(r?.phase) && engineReceipt(r,r.phase)) ||
          new Set(review.repairs.map(r=>r.phase)).size!==review.repairs.length) return false;
      const receipts=[...review.calls,...review.repairs];
      if (new Set(receipts.map(r=>r.threadId)).size!==receipts.length) return false;
    }
    validateEngineDraft(review.workbook);
    validate(review.recommendation,engineRecommendation,'负责人推荐');
    const draft=resolveEnginePicks(review.workbook,review.picks);
    if (review.authorCheck!==undefined) {
      validate(review.authorCheck,engineAuthorCheck,'作者自检');
      validateEngineAuthorCheck(review.authorCheck,draft);
    }
    return isDeepStrictEqual(review.draft,draft) && isDeepStrictEqual(names,draft.directions.map(d=>d.name)) &&
      text===engineCopyMarkdown(draft);
  } catch(error) {
    if (error.code==='INVALID_STAGE_OUTPUT') return false;
    throw error;
  }
}

async function runEngineCopy({call, project, inputs, rules, onEvent}) {
  const skill=rules.find(rule=>/^name: slogan-engine$/m.test(rule));
  requireThat(skill,'缺少原版 slogan-engine');
  const materials=inputs.texts.filter(item=>nonempty(item.text));
  const source={
    brief:project.brief, proposalKind:project.proposalKind, materials,
    strategy:project.strategyHandoff, feedback:(project.feedback ?? []).filter(entry=>entry.stage==='copy'),
  };
  async function run(phase, instruction, schema, packet, promptRules=[]) {
    const result=await call(phase+'\n'+instruction,[],schema,{
      rules:promptRules, assignment:'只完成本次文案任务。', context:JSON.stringify(packet),
    });
    const {runId,threadId,model,inputPacketHash}=result;
    const receipt={phase,runId,threadId,model,inputPacketHash};
    requireThat(engineReceipt(receipt,phase),'文案缺少本次 DeepSeek 调用回执');
    return {receipt,output:result.parsedOutput};
  }

  await onEvent?.('DeepSeek 写作 Agent 正在起稿并从每案自选一句');
  const {output:writing,receipt:written}=await run(enginePhases[0],
    [
      '你是本次写作 Agent。沿用当前 Brief、研究与策略，使用原版 slogan-engine 定位物料和受众。从本案有依据的事实与读者此刻的动作、关系、情境或感受之间，找到三个不同的创意连接，自拟各案名称和角度。每案的主标要用具体措辞让这个连接成立。把三个方向当作三个可展开的创意主题。',
      '主标给读者一个能记住、能转述的动作、画面或意思。直接列品牌型号、价格、场次、时段、预约或试穿条件，只完成了告知。把这类事实放在副标、信息栏或简报指定位置。事实参与创意连接时，允许按本案需要写入主标。事实性表述须有本案材料依据，遵守简报的品类与触点限制。',
      '依据 basis 从当前材料逐字摘取一处简短的连续原文，保留原来的字、空格和标点。claim 写本案主张，mechanism 写哪两个具体事物怎样相连，strategyLink 写如何承接策略。按 A、B、C 返回 directions。每案保留围绕同一连接的三到四条不同候选和各自用法，另写同案通用的简洁支撑副标 secondary。使用原件对场合、长短、声律的判断。候选按 A1、A2 等编号。作为创作者从每案原候选自选一句，把编号填入 picks。整组推荐交给负责人。',
      '仍由你在本次交稿前核对三条自选句。authorCheck.selections 按案逐字摘出承载创意连接的主标措辞 phrase，takeaway 写读者单看这句能记住什么或看到什么画面。只有标题本身表达了本案连接且超出直接告知时才填 sloganReady=true。authorCheck.pairs 对 AB、AC、BC 逐对写 reason，说清两句唤起的连接怎么不同。只换价格、时段、行动信息、语气或信息顺序时填 distinct=false。只看标题就分不出创意时，回到连接重新构思再自选。文案字段逐项、单行填写，略过独立盲读和回写。',
      engineFactInstruction,
      '按系统给出的 JSON Schema 交稿。顶层的三个字段 directions、picks、authorCheck 并列。三案各填规定字段。authorCheck 中只有 selections 和 pairs。',
    ].join('\n'),
    engineWriterSchema,source,[skill,'包装方向的 slogan 用于命名和呈现提案主题。候选用途写提案页或明确委托的其他传播触点。包装本体的印字以简报确认的产品信息为准。']);
  requireThat(writing && Object.keys(writing).every(key=>Object.hasOwn(engineWriterSchema.properties,key)),'写作 Agent 交稿包含意外字段');
  validateEngineDraft({directions:writing.directions});
  if (project.briefScope?.types?.includes('packaging') || /包装|外盒|小袋|瓶标|手撕/u.test(project.brief)) {
    validatePackagedCopyFacts(writing.directions,[project.brief,...source.feedback.map(entry=>entry.text)].filter(nonempty).join('\n'));
  }
  const workbook={directions:writing.directions.map(direction=>({...direction}))};
  const originals=[project.brief,...materials.map(item=>item.text)].filter(nonempty);
  const unsupported=workbook.directions.filter(d=>!originals.some(text=>text.includes(d.basis)));
  const repairs=[];
  if (unsupported.length) {
    await onEvent?.('原作者正在核对无法定位的文案依据，保留本版候选');
    const required=unsupported.map(d=>d.id);
    const schema=object({citations:list(object({id:choice(required),supported:{type:'boolean'},basis:optionalText}))});
    const {output,receipt}=await run(engineRepairPhases[0],
      '核对 listedDirections 的主张、候选和副标。只为原件确实支持的一案找连续短引，逐字复制，填 supported=true。材料与卖点、规格、数字或答案不相符时填 supported=false，basis 留空。保留原作者候选和自选。',
      schema,{listedDirections:unsupported,sourceText:originals});
    validate(output,schema,'文案依据核对');
    requireThat(exactly(output.citations.map(c=>c.id),required),'文案依据需要覆盖每个待核方向');
    for (const {id,basis,supported} of output.citations) {
      const direction=workbook.directions.find(d=>d.id===id);
      requireThat(supported && basis.trim() && repairableQuantityClaims(direction,project.brief,basis),
        '方向 '+id+' 的文案主张缺少与原件一致的依据');
      direction.basis=basis;
    }
    repairs.push(receipt);
  }
  validateEngineDraft(workbook,originals);
  let {picks,authorCheck}=writing;
  const selectionSchema=object({picks:enginePicks,authorCheck:engineAuthorCheck});
  const fixedPicks=Object.fromEntries(workbook.directions.flatMap(d=>{
    const code=picks?.[d.id];
    return d.candidates.some((_,index)=>code===d.id+(index+1)) ? [[d.id,code]] : [];
  }));
  try {
    validate({picks,authorCheck},selectionSchema,'作者选句');
    requireThat(Object.keys(fixedPicks).length===ids.length && exactly(authorCheck.pairs.map(p=>p.pair),enginePairs) &&
      exactly(authorCheck.selections.map(s=>s.directionId),ids),'作者选句缺少有效编号或必要自检');
  }
  catch(error) {
    if (error.code!=='INVALID_STAGE_OUTPUT') throw error;
    await onEvent?.('原作者按本版已写候选补齐选句编号和自检');
    const {output,receipt}=await run(engineRepairPhases[1],
      '你是写出本案三组原候选的作者。保持 fixedPicks 中已有效的编号。只给缺少有效编号的方向补选。返回 A、B、C 对应的完整 picks 和 authorCheck。三案候选原文保持一致。selections 引用选句中承载创意的原字，pairs 写清各案想起的画面区别。',
      selectionSchema,{workbook,brief:project.brief,fixedPicks,existingAuthorCheck:authorCheck},[skill]);
    validate(output,selectionSchema,'作者选句');
    requireThat(Object.entries(fixedPicks).every(([id,code])=>output.picks[id]===code),'已有效的作者选句需要保留');
    ({picks,authorCheck}=output);
    repairs.push(receipt);
  }
  const draft=resolveEnginePicks(workbook,picks);
  validateEngineAuthorCheck(authorCheck,draft);

  await onEvent?.('比稿负责人正在从作者自选的三句中推荐一案');
  const directions=draft.directions.map(({id,name,main})=>({id,name,main}));
  const {output:recommendation,receipt:recommended}=await run(enginePhases[1],
    '你是比稿负责人。三个方向的主标题已经由作者选定，请仅从这三句推荐一案，返回对应 directionId 和一句具体推荐理由。对照 Brief 与策略判断哪句最值得记住。保持三句原文，选择理由聚焦这句的作用，避免批评和修改意见。',
    engineRecommendation,{...source,directions});
  validate(recommendation,engineRecommendation,'负责人推荐');
  requireThat(written.runId!==recommended.runId && written.threadId!==recommended.threadId,'写作与推荐需要分别记录实际调用');
  const body=engineCopyMarkdown(draft);
  const copyReview={protocol:engineCopyProtocol,version:1,status:'ready',bodyHash:hash(body),
    draft,workbook,skillHash:fullSloganHash(skill),picks,authorCheck,recommendation,calls:[written,recommended],
    ...(repairs.length ? {repairs} : {})};
  await onEvent?.('已保存作者自选的三句及负责人推荐');
  return {body,directions:draft.directions.map(d=>d.name),copyReview};
}

export async function runCopyReview({call, project, inputs, rules, dir, onEvent, singleOwner=false}) {
  if (singleOwner) return runEngineCopy({call,project,inputs,rules,onEvent});
  const attempt = {version:3,protocol:headlineProtocol,status:'working',calls:[],anonymousReads:[],firstVotes:[],criticReads:[],challenges:[],finalVotes:[]};
  const filename='copy-review-attempt-'+randomUUID()+'.json';
  const threads=new Set(), runs=new Set();
  const materials=[project.brief,...inputs.texts.map(t=>t.text)].filter(nonempty);
  async function run(phase, instruction, schema, packet, author=false, outputSchema=schema) {
    const result=await call(phase+'\n'+instruction,author?inputs.images:[],outputSchema,{
      delegate:!author,rules:author?rules:[],assignment:'只完成当前职责。',context:JSON.stringify(packet),
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
      const quoteByDirection=draft.directions.map(d=>object({
        ...criticSchema.properties.items.items.properties,
        directionId:choice([d.id]),evidence:choice(['',d.main]),
      }));
      const {output,receipt}=await run('COPY_CRITIC_BLIND',
        '独立找本岗可能遗漏的事实、表达或同组三案风险。先不看原票、不打分。逐案列出所有独立风险，一条对应一个风险；某案确无发现时仅写一条 risk 和 evidence 均为空的记录。提出风险必须引当前该案逐字证据。',
        criticSchema,{role,...reviewPacket(draft)},false,object({items:list({anyOf:quoteByDirection})}));
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
      const concerns=draft.directions.map(d=>object({
        ...challengeSchema.properties.items.items.properties,
        directionId:choice([d.id]),dimension:choice(criteria(d.duty)),evidence:choice([d.main]),
      }));
      const {output,receipt}=await run('COPY_CHALLENGE',
        '保留本岗独立漏项阅读，核原票的具体肯定、证据是否已经覆盖。coverage逐条引用 blindRead.items 的 readId 与 directionId，每条恰好一次，包括无风险记录。指向该案四项内的相关维度并具体说明原票是否观察过这一项，以及漏项是否已处理、为何保留或质疑原判。items只列确有依据的异议，区分反证、缺证、偏好、已覆盖与阶段外；action说明影响和建议。个人偏好不阻断，未见新增漏项允许空列表。不得打分。',
        challengeSchema,{role:vote.role,...reviewPacket(draft),blindRead,vote},false,
        object({...challengeSchema.properties,items:list({anyOf:concerns})}));
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
      '在创作者改稿前独立逐条裁定 issues；每个id必须决定采纳当前/后续、驳回或待核及理由。每条给 criterion，选该方向对应四项之一、“逐对差异”或“推荐观察”。problem 是这条具体问题的短描述；不同岗位或不同维度指出同一处实质缺陷时复用同一句 problem，彼此独立的问题用不同描述。保留各岗原句证据。只对单案四项中成立的作品缺陷要求改稿。逐对差异在整组裁定处理，推荐观察仅比较记忆、复述、适用场景，二者在此 action=none。低分、待核和岗位意见本身不阻断。作品确需修改时 action=revise，评分原判有误或证据需要复核时 action=recheck 且保持原稿，非阻断范围外事项可延后。逐项检查动作与状态成对：待核 pending 或延后 accepted_later 的 action 必须是 none；revise 必须 accepted_now。已采纳的单案四项问题必须明确 revise 或 recheck。不得代评分岗改分。没有问题可为空。',
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
    await onEvent?.('比稿负责人正在创作三个方向');
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
      if (round>=maxFollowups) throw Error('文案达到本次打磨上限：'+reasons);
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
        if (action.action==='pause') throw Error(failure.reason+'；暂停打磨：'+action.reason);
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
