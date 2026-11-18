import {invalidOutput,independentCalls} from './call-checkpoints.mjs';
const string = {type:'string'};
const list = items => ({type:'array',items});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const use = object({source:string, borrow:string, apply:string});
const publicUse = object({...use.properties,why:string,avoid:string});
const planSchema = item => object({sharedBrand:list(item),directions:list(object({direction:string, main:list(item), auxiliary:list(item), gap:string}))});
const observationSchema = object({observations:list(object({source:string, visible:string}))});
const nonempty = s => typeof s === 'string' && s.trim().length > 0;

export async function selectVisualReferences({call, project, images, active}) {
  const names = project.directions;
  const catalog = new Map();
  for (const image of images) if (!catalog.has(image.sha256)) catalog.set(image.sha256,image);
  const sources = [...catalog.values()];
  const authors = project.copyReview?.draft?.directions ?? [];
  const directions = names.map(name => authors.find(d=>d.name===name) ?? {name});
  const previousOwners = new Map();
  for (const item of project.previousVisual ?? []) {
    for (const ref of item.visual?.referenceHandoff?.references ?? []) {
      previousOwners.set(ref.sha256, ref.role==='sharedBrand' ? 'sharedBrand' : item.visual.direction);
    }
  }
  const packet = {brief:project.brief,strategy:project.strategyText,directions,previousDrafts:[...new Set((project.previousVisual ?? []).map(p=>p.visual.direction))],feedback:project.feedback ?? [],sources:sources.map(s=>({
    source:s.imageId,name:s.name,pageUrl:s.pageUrl,title:s.title,searchDirection:s.direction ?? null,previousDirection:previousOwners.get(s.sha256) ?? null,
  }))};
  if (!sources.length) throw Object.assign(Error('视觉主参考缺失：'+active.join('、')+'。可在对话区补充原图后重试。'),{missing:active});

  // Inspect larger pools in groups that fit the real four-image model transport.
  if (sources.length > 4) {
    packet.observations = [];
    for (let i=0;i<sources.length;i+=4) {
      const group = sources.slice(i,i+4);
      const result = await call('逐张记录可见内容、载体、配色、布局、景别、笔法、字体和使用情境。用所附图片的 source 身份返回。',group,observationSchema,{
        assignment:'视觉参考原图登记',context:JSON.stringify(group.map(s=>({source:s.imageId,name:s.name}))),
      });
      const rows=result.parsedOutput?.observations;
      if (!Array.isArray(rows) || rows.length!==group.length || !group.every(s=>rows.some(r=>r.source===s.imageId && nonempty(r.visible)))) throw invalidOutput('视觉参考原图观察与输入不对应，请重试。');
      packet.observations.push(...rows);
    }
  }
  const selection = [
    '逐案按文案方向选一张主参考和至多两张作用不同的辅助图。先对照策略与该案创意，横向比较同用途原件。同一画面、同系列换角度或用途重复时选最清楚的一张。',
    '主参考须能转译方向创意。说明实际载体及画面整体风格，观察配色、布局、景别、笔法、字体，以及背景怎样衬托主体。在 borrow 写可借位置，在 apply 写本案怎样重画。辅助图用于动作、场景或材质的文字说明。',
    'searchDirection 标注的公开图及已有专用图只给其所属方向。稳健方向观察品类惯例，产品方向观察具体特征，用户方向观察使用情境和行为。销售判断需要销售来源。',
    '公开图在 why 说明任务关系和取舍，在 avoid 指明需要用本案内容重新设计的部分。无适用主参考时 main 留空并写 gap。sharedBrand 只列本案官方标志、VI 等实际约束。辅助按重要性排序。',
  ].join('\n');
  const result = await call(selection,sources.length<=4 ? sources : [],planSchema(sources.some(s=>s.sourceUrl)?publicUse:use),{
    assignment:'比稿负责人分配参考图',context:JSON.stringify(packet),
  });
  const rows=result.parsedOutput?.directions;
  if (!Array.isArray(rows) || rows.length!==names.length || !names.every(n=>rows.some(r=>r?.direction===n))) throw invalidOutput('参考图分派与三份文案方向不一致。');
  const shared = result.parsedOutput.sharedBrand;
  if (!Array.isArray(shared)) throw invalidOutput('请明确全案共用的品牌素材。');
  const assigned = new Map(), plans = new Map();
  function bind(entry, role, owner) {
    const image = sources.find(s=>s.imageId===entry?.source);
    if (!image || !nonempty(entry.borrow) || !nonempty(entry.apply)) throw invalidOutput('参考图身份或借鉴用途不完整。');
    if (image.sourceUrl && (!nonempty(entry.why) || !nonempty(entry.avoid))) throw invalidOutput('公开参考缺少采用理由或禁止照搬的边界。');
    if ((image.direction && image.direction!==owner) || assigned.has(image.sha256) || (previousOwners.has(image.sha256) && previousOwners.get(image.sha256)!==owner)) {
      throw invalidOutput('不同方向的专用参考图发生冲突，请核对参考图归属。');
    }
    assigned.set(image.sha256,owner);
    return {image,reference:{role,name:image.name,sha256:image.sha256,...(image.sourceUrl ? {pageUrl:image.pageUrl,sourceUrl:image.sourceUrl,query:image.query,why:entry.why.trim(),avoid:entry.avoid.trim()} : {}),borrow:entry.borrow.trim(),apply:entry.apply.trim()}};
  }
  const common = shared.map(e=>bind(e,'sharedBrand','sharedBrand'));
  for (const row of rows) {
    if (!Array.isArray(row.main) || row.main.length>1 || !Array.isArray(row.auxiliary) || row.auxiliary.length>2) throw invalidOutput('每方向最多一张主参考、两张辅助参考。');
    const primary = row.main.map(e=>bind(e,'main',row.direction));
    const auxiliary = row.auxiliary.map(e=>bind(e,'auxiliary',row.direction));
    const remaining = 4 - Number(packet.previousDrafts.includes(row.direction)) - common.length - primary.length;
    if (remaining<0 && active.includes(row.direction)) throw invalidOutput('「'+row.direction+'」的共享品牌图和主参考超出生图附件上限，请注明本轮必须保留的品牌图后重试。');
    const selected = [...primary,...common,...auxiliary.slice(0,Math.max(0,remaining))];
    const handoff = {direction:row.direction,selectionThread:result.threadId,references:selected.map(s=>s.reference),
      deferred:auxiliary.slice(Math.max(0,remaining)).map(s=>({...s.reference,reason:'本轮参考包优先保留主参考、品牌约束和最相关的文字借鉴线索。'}))};
    plans.set(row.direction,{images:selected.map(s=>s.image),handoff,missing:!primary.length,gap:row.gap});
  }
  const missing=active.filter(n=>plans.get(n).missing);
  if (missing.length) throw Object.assign(Error('视觉主参考待补：'+missing.map(n=>n+'（'+(plans.get(n).gap || '缺少能表达该方向的原图')+'）').join('、')+'。可在对话区补图后重试。'),{missing});
  return plans;
}

const roles = {visual:['quality','composition'],brand:['compatibility','translation'],user:['understanding','feasibility'],spread:['memory','difference']};
const voteSchema = object({items:list(object({dimension:string, score:{type:['integer','null']}, evidence:string})), hardReject:string});
const challengeSchema = object({issue:string, evidence:string});
const rulingSchema = object({decisions:list(object({role:string,accepted:{type:'boolean'},reason:string})), compatible:{type:'boolean'}, reason:string});

export async function reviewReferencePlan({call, project, direction, images, handoff, otherDirections}) {
  const packet = {brief:project.brief,strategy:project.strategyText, directions:project.copyReview?.draft?.directions ?? project.directions, direction, references:handoff.references,otherDirections};
  const instruction='本次审整组 direction 而非独立材质 component。两项维度均须判断。证据说明画面位置、所见、影响与本案转译。1事实抵触，2机制不成立，3连接或执行条件缺失，4有图卡依据，5另需具体对照优势。关键未知填 null。没有销售依据不能断言销量。只换品牌文案或配色而整体复制参考结构等有证硬退写入 hardReject，无则留空。';
  const votes=await independentCalls(Object.entries(roles),async ([role,dimensions])=>{
    const result=await call(instruction,images,voteSchema,{delegate:true,rules:[],assignment:'公开参考包独立评分',context:JSON.stringify({...packet,role,dimensions})});
    const vote=result.parsedOutput;
    if (!Array.isArray(vote?.items) || vote.items.length!==2 || !dimensions.every(key=>vote.items.some(i=>i.dimension===key && nonempty(i.evidence) &&
        (i.score===null || (Number.isInteger(i.score) && i.score>=1 && i.score<=5)))) || typeof vote.hardReject!=='string') throw invalidOutput('公开参考包缺少完整的本岗原票及图证。');
    return {role,threadId:result.threadId,...vote};
  });
  const challenges=await independentCalls(votes,async vote=>{
    const ctx={...packet,role:vote.role};
    const task={delegate:true,rules:[],assignment:'公开参考包对抗',context:JSON.stringify(ctx)};
    const first=await call('先独立检查本岗两维有无遗漏或过度推断，写明可见依据。不另打分，无异议填空 issue。',images,challengeSchema,task);
    if(typeof first.parsedOutput?.issue!=='string' || !nonempty(first.parsedOutput.evidence)) throw invalidOutput('公开参考对抗缺少核对依据。');
    const checked=await call('结合独立发现核对原票，写出仍成立的问题与依据，不另打分。',images,challengeSchema,{...task,context:JSON.stringify({...ctx,findings:first.parsedOutput,vote})});
    if(typeof checked.parsedOutput?.issue!=='string' || !nonempty(checked.parsedOutput.evidence)) throw invalidOutput('公开参考对抗缺少核对依据。');
    return {role:vote.role,independent:{threadId:first.threadId,...first.parsedOutput},threadId:checked.threadId,...checked.parsedOutput};
  });
  const result=await call('按岗逐条裁定对抗意见，accepted 表示仍有成立阻断问题，reason 给出依据；另核主参考机制、辅助互补性、跨方向重复和禁止整体照搬边界，compatible 表示整组相容。不可改原分。',images,rulingSchema,{delegate:true,rules:[],assignment:'公开参考包独立裁定',context:JSON.stringify({...packet,votes,challenges})});
  const ruling=result.parsedOutput;
  if (typeof ruling?.compatible!=='boolean' || !nonempty(ruling.reason) || ruling.decisions?.length!==4 ||
      !Object.keys(roles).every(role=>ruling.decisions.some(d=>d.role===role && typeof d.accepted==='boolean' && nonempty(d.reason)))) throw invalidOutput('公开参考包裁定不完整。');
  const blockers=[];
  for (const vote of votes) {
    for (const item of vote.items) if (item.score===null || item.score<4) blockers.push(vote.role+'.'+item.dimension+'：'+item.evidence);
    if (vote.hardReject.trim()) blockers.push(vote.hardReject);
  }
  for (const d of ruling.decisions) if(d.accepted) blockers.push(d.reason);
  if (!ruling.compatible) blockers.push(ruling.reason);
  const threads=[handoff.selectionThread,...votes.map(v=>v.threadId),...challenges.flatMap(c=>[c.independent.threadId,c.threadId]),result.threadId];
  if(threads.some(t=>!nonempty(t)) || new Set(threads).size!==threads.length) throw invalidOutput('公开参考包复核会话未独立。');
  return {scope:'direction',direction,references:handoff.references,hashes:images.map(i=>i.sha256),votes,challenges,ruling:{threadId:result.threadId,...ruling},passed:!blockers.length,blockers};
}
