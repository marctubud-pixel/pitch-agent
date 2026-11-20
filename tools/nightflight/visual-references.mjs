import {invalidOutput,independentCalls} from './call-checkpoints.mjs';
const string = {type:'string'};
const list = items => ({type:'array',items});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const use = object({source:string, borrow:string, apply:string});
const publicUse = object({...use.properties,why:string,avoid:string});
const observationSchema = object({observations:list(object({source:string, visible:string}))});
const imagePromptSchema = object({prompt:string});
const nonempty = s => typeof s === 'string' && s.trim().length > 0;

export const visualElements = ['配色', '布局', '景别', '笔法', '字体'];

export function posterStrategyPurpose(strategy) {
  const sections = strategy.split(/^##\s+/m).slice(1);
  return sections.flatMap(section => {
    const [title,...lines] = section.trim().split('\n');
    if (!['核心策略','人群洞察','品牌角色','核心主张'].includes(title.trim())) return [];
    const statement = lines.find(line => line.trim() && !/^\s*[-*]/.test(line));
    return statement ? [statement.trim()] : [];
  }).join('\n');
}

export async function readPosterReference({call, image}) {
  const result = await call(
    '只描述这一张主参考原图实际可见的五项。布局写标题、留白和画面主体分别在哪里及占比。景别写看见多大范围，笔法写线条、切边或摄影质感，字体写字形和字重，配色写主要色和对比。' +
    '逐项用简短一句话记录。不评价本案，不把后续改法写成原图特征。看不清的一项填「未核实」，原图确实没有文字也照实写。',
    [image], object(Object.fromEntries(visualElements.map(element=>[element,string]))),
    {delegate:true,rules:[],assignment:'海报主参考原图核读',context:'附件只有本方向主参考原图。'},
  );
  const observations = result.parsedOutput;
  if (!observations || Object.keys(observations).length!==visualElements.length ||
      !visualElements.every(element=>nonempty(observations[element])) || !nonempty(result.model) || !nonempty(result.threadId)) {
    throw invalidOutput('海报主参考缺少实际原图的五项观察或读图回执。');
  }
  return {image,observations,model:result.model,threadId:result.threadId};
}

async function writePosterPrompt({call, images, context, posterReference, posterSlogan}) {
  const {transfer, ...directionInput} = context;
  const {image,observations} = posterReference;
  const at = images.findIndex(input=>input.sha256===image.sha256);
  if (at<0) throw Error('本张海报生图没有附上已核读的主参考原图。');
  const schema = object({
    format:string, subject:string, background:string, lettering:list(string),
    changes:object(Object.fromEntries(transfer.change.map(element=>[element,string]))),
  });
  const result = await call([
    '为这个海报方向写制图内容。把创意落到可见的主体、动作和背景，先从本案方向找到观众应先看到的事。',
    'format 写简报给定的载体、横竖和其他硬性尺寸。subject 写主体和动作。background 写背景里实际有哪些东西。三个字段只描述画面内容，不加配色、构图、景别、笔法或字体指令。',
    'changes 只写两项重新设计的内容。每项给可落图的目标，要看得出与原图观察的差异。改布局时说清主标题、主要画面主体及留白的新位置关系。改景别时说清画面现在看见的范围。',
    '三项沿用内容由原图观察给出，直接沿用观察到的画面关系和表现方式。这三项不在其他字段重新指定。硬性设计位置仅来自客户本轮简报和任务卡。',
    'lettering 只列需要印在画面中的简报信息或本案副标，逐条写实际文字。主标题已定稿。价格、型号或时段已在主标题中讲清时，避免重复列。未确认字样省略。',
  ].join('\n'),[],schema,{
    assignment:'夜航海报生图提示词写作',rules:[],context:JSON.stringify({
      ...directionInput, posterSlogan, mainReference:{imageNumber:at+1,observations}, transfer,
    }),
  });
  const plan = result.parsedOutput;
  const normalize = value=>value.normalize('NFKC').replace(/[\s\p{P}]/gu,'');
  if (!plan || !['format','subject','background'].every(field=>nonempty(plan[field]) && plan[field].length<=600) ||
      !Array.isArray(plan.lettering) || plan.lettering.length>8 ||
      !plan.lettering.every(value=>nonempty(value) && value.length<=120) ||
      !plan.changes || Object.keys(plan.changes).length!==transfer.change.length ||
      !transfer.change.every(element=>nonempty(plan.changes[element]) && plan.changes[element].length<=450 &&
        normalize(plan.changes[element])!==normalize(observations[element])) ||
      !nonempty(result.model) || !nonempty(result.threadId)) {
    throw invalidOutput('海报生图文字须按借改项目写出两项明确的新画法和本方向的画面内容。');
  }
  const prompt = [
    '生成一张完整海报／KV。' + plan.format,
    '实际第 '+(at+1)+' 张附件是本方向已核读的主参考原图。人物、地景、图形和文字用本案内容重画。',
    ...transfer.borrow.map(element=>'沿用主参考的'+element+'。'+observations[element]),
    ...transfer.change.map(element=>'重新设计'+element+'。原图可见 '+observations[element]+'。本张改为 '+plan.changes[element]),
    '构图和景别遵照以上逐项借改安排。画面内容按下述主体和背景重画。',
    '画面主体和动作。'+plan.subject,
    '背景。'+plan.background,
    directionInput.auxiliaryNotes?.length ? '辅助参考的文字线索。'+directionInput.auxiliaryNotes.map(note=>note.apply).join(' ') : '',
    '完整主标题「'+posterSlogan+'」须逐字排进画面。允许合理换行，保留原句和标点。',
    plan.lettering.length ? '其它需印在画面的文字。'+plan.lettering.map(line=>'「'+line+'」').join('、') : '',
    '保持文字清晰可读。采用附件里的品牌原件或返修稿时，以本张借改要求为准。',
  ].filter(Boolean).join('\n');
  return {model:result.model,threadId:result.threadId,prompt,plan};
}

export async function generateVisualWithDesktopModels({call, images, context, drawingBrief, posterSlogan, packaging, posterReference}) {
  if (posterReference) {
    const promptWriting = await writePosterPrompt({call,images,context,posterReference,posterSlogan});
    const result = await call(promptWriting.prompt,images,null,{exactImagePrompt:true});
    return {result,promptWriting};
  }
  const instruction = [
    '为夜航这个方向写一段可以直接交给生图模型的提示词。用简报、文案、借改项目和图片用途来写。',
    '写清画面、背景和前景的关系，明确要借的三项、重新设计的两项，以及每张实际附件怎样使用。按制图要求写清载体上的文字。',
    posterSlogan && '海报或 KV 要把本方向已选 slogan 的完整原句排成画面主标题。提示词中逐字列出原句，明确文字放在画面上。',
    packaging && '包装画面的设计主题转化成画面关系，包装本体只列确认可印的实际文字。',
    '返回一个 prompt 字段，内容是完整的生图提示词。',
  ].filter(Boolean).join('\n');
  const written = await call(instruction,[],imagePromptSchema,{
    assignment:'夜航生图提示词写作',rules:[],context:JSON.stringify({...context,drawingBrief}),
  });
  const prompt = written.parsedOutput?.prompt;
  if (!nonempty(prompt) || prompt.length>32000 || !nonempty(written.model) || !nonempty(written.threadId)) {
    throw invalidOutput('文字服务未交回可用的生图提示词与模型回执。');
  }
  if (posterSlogan && !prompt.includes(posterSlogan)) {
    throw invalidOutput('海报生图提示词缺少该方向已选 slogan 的原句，请按制图要求完整写入。');
  }
  const result = await call(prompt,images,null,{exactImagePrompt:true});
  return {result,promptWriting:{model:written.model,threadId:written.threadId,prompt}};
}

export async function selectVisualReferences({call, project, images, active, observations=new Map(), priorAdmissions=[]}) {
  const names = project.directions;
  const directionIds = ['A','B','C'];
  const catalog = new Map();
  for (const image of images) if (!catalog.has(image.sha256)) catalog.set(image.sha256,image);
  const sources = [...catalog.values()].map((image,index)=>image.sourceUrl ? {...image,imageId:'R'+(index+1)} : image);
  const authors = project.copyReview?.draft?.directions ?? [];
  const directions = names.map((name,index)=>({...authors.find(d=>d.name===name),name,id:directionIds[index]}));
  const previousOwners = new Map();
  for (const item of project.previousVisual ?? []) {
    for (const ref of item.visual?.referenceHandoff?.references ?? []) {
      previousOwners.set(ref.sha256, ref.role==='sharedBrand' ? 'sharedBrand' : item.visual.direction);
    }
  }
  const packet = {brief:project.brief,strategy:project.strategyText,directions,previousDrafts:[...new Set((project.previousVisual ?? []).map(p=>p.visual.direction))],feedback:project.feedback ?? [],sources:sources.map(s=>({
    source:s.imageId,...(s.sourceUrl ? {} : {name:s.name}),pageUrl:s.pageUrl,title:s.title,carrier:s.carrier,searchDirection:s.direction ?? null,previousDirection:previousOwners.get(s.sha256) ?? null,
  })),priorAdmissions};
  if (!sources.length) throw Object.assign(Error('视觉主参考缺失：'+active.join('、')+'。可在对话区补充原图后重试。'),{missing:active});

  const readSeparately=sources.length>4 || sources.some(image=>image.sourceUrl);
  if (readSeparately) {
    const unread=sources.filter(image=>!observations.has(image.sha256));
    for (let i=0;i<unread.length;i+=4) {
      const group = unread.slice(i,i+4);
      const result = await call('按附件顺序逐张只读原图，记录真实载体、主体、颜色、布局、景别、笔法、字体和使用情境。包装写清可见的袋、罐或盒及位置。数量和印字看不清就写未核实。用所附图号返回。',group,observationSchema,{
        assignment:'视觉参考原图登记',context:JSON.stringify(group.map(s=>({source:s.imageId}))),
      });
      const rows=result.parsedOutput?.observations;
      if (!Array.isArray(rows) || rows.length!==group.length || !group.every(s=>rows.some(r=>r.source===s.imageId && nonempty(r.visible)))) throw invalidOutput('视觉参考原图观察与输入不对应，请重试。');
      for (const image of group) observations.set(image.sha256,{visible:rows.find(row=>row.source===image.imageId).visible,threadId:result.threadId});
    }
    packet.observations=sources.map(image=>({source:image.imageId,visible:observations.get(image.sha256).visible}));
  }
  const selection = [
    '先为各方向分配互不重复的主参考，再按需选至多两张作用不同的辅助图。source 只填图册给出的图号，例如 R1。每张原图只分给一个用途。main 必须是一个对象，找不到时为 null 并写 gap。',
    '主参考须能转译方向创意。说明实际载体及画面整体风格，观察配色、布局、景别、笔法、字体，以及背景怎样衬托主体。在 borrow 写可借位置，在 apply 写本案怎样重画。辅助图用于动作、场景或材质的文字说明。',
    '按 observations 里的可见原图写 borrow。Brief 的规格、品名、动作和新画法只写入 apply，原图看不到的细节不补写为原图事实。',
    '有 priorAdmissions 时，按各案的具体问题调整借法或换图。原图适合而借法有问题时，明确能借的画面位置与必须重新画的物件。主图和辅助图各有具体作用。',
    'searchDirection 标注的公开图及已有专用图只给其所属方向。稳健方向观察品类惯例，产品方向观察具体特征，用户方向观察使用情境和行为。销售判断需要销售来源。',
    '公开图在 why 说明任务关系和取舍，在 avoid 指明需要用本案内容重新设计的部分。sharedBrand 只列本案上传的官方标志、VI 等实际约束。辅助按重要性排序。',
    'directions 按 A、B、C 三个键返回对象。每键填写对应 main、auxiliary 和 gap。填写图册给出的 source 编号。',
  ].join('\n');
  const fields = sources.some(s=>s.sourceUrl) ? publicUse.properties : use.properties;
  const itemSchema = object({...fields,source:{...string,enum:sources.map(s=>s.imageId)}});
  const directionFields = {main:{anyOf:[itemSchema,{type:'null'}]},auxiliary:{...list(itemSchema),maxItems:2},gap:string};
  const directionSchema = object(directionFields);
  const outputSchema = object({sharedBrand:list(itemSchema),directions:object(Object.fromEntries(directionIds.map(id=>[id,directionSchema])))});
  const result = await call(selection,readSeparately ? [] : sources,outputSchema,{
    assignment:'比稿负责人分配参考图',context:JSON.stringify(packet),
  });
  const byDirection=result.parsedOutput?.directions;
  if (!byDirection || Object.keys(byDirection).length!==directionIds.length ||
      !directionIds.every(id=>Object.hasOwn(byDirection,id) && byDirection[id] && typeof byDirection[id]==='object')) {
    throw invalidOutput('参考图需按文案 A、B、C 三个固定方向交接。');
  }
  const rows=directionIds.map((id,index)=>({...byDirection[id],direction:names[index]}));
  const shared = result.parsedOutput.sharedBrand;
  if (!Array.isArray(shared)) throw invalidOutput('请明确全案共用的品牌素材。');
  const assigned = new Map(), plans = new Map();
  function bind(entry, role, owner) {
    const image = sources.find(s=>s.imageId===entry?.source);
    if (!image || !nonempty(entry.borrow) || !nonempty(entry.apply)) throw invalidOutput('参考图身份或借鉴用途不完整。');
    if (image.sourceUrl && (!nonempty(entry.why) || !nonempty(entry.avoid))) throw invalidOutput('公开参考缺少采用理由或禁止照搬的边界。');
    if (image.sourceUrl && role==='sharedBrand') throw invalidOutput('公开竞品只能供方向借鉴，不能作为本案共用品牌资产。');
    if ((image.direction && image.direction!==owner) || assigned.has(image.sha256) || (previousOwners.has(image.sha256) && previousOwners.get(image.sha256)!==owner)) {
      throw invalidOutput('不同方向的专用参考图发生冲突，请核对参考图归属。');
    }
    assigned.set(image.sha256,owner);
    return {image,reference:{role,name:image.name,sha256:image.sha256,...(image.sourceUrl ? {pageUrl:image.pageUrl,sourceUrl:image.sourceUrl,query:image.query,why:entry.why.trim(),avoid:entry.avoid.trim()} : {}),
      ...(observations.has(image.sha256) ? {observation:observations.get(image.sha256)} : {}),borrow:entry.borrow.trim(),apply:entry.apply.trim()}};
  }
  const common = shared.map(e=>bind(e,'sharedBrand','sharedBrand'));
  const primaries = new Map();
  for (const row of rows) {
    if (row.main!==null && (typeof row.main!=='object' || Array.isArray(row.main)) ||
        !Array.isArray(row.auxiliary) || row.auxiliary.length>2) throw invalidOutput('每方向最多一张主参考、两张辅助参考。');
    const empty = row.main && row.main.source===null && !nonempty(row.main.borrow) && !nonempty(row.main.apply) && nonempty(row.gap);
    primaries.set(row.direction,row.main && !empty ? [bind(row.main,'main',row.direction)] : []);
  }
  for (const row of rows) {
    const primary = primaries.get(row.direction);
    const auxiliary = row.auxiliary.flatMap(entry=>{
      const image=sources.find(source=>source.imageId===entry?.source);
      if (image && assigned.has(image.sha256)) return [];
      return [bind(entry,'auxiliary',row.direction)];
    });
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
const voteSchema = dimensions=>object({
  items:{...list(object({dimension:{...string,enum:dimensions},score:{enum:[1,2,3,4,5,null]},evidence:string})),minItems:2,maxItems:2},
  hardReject:string,
});
const challengeSchema = object({issue:string, evidence:string});
const rulingFields = Object.fromEntries(Object.keys(roles).map(role=>[role,object({status:{...string,enum:['通过','阻断']},reason:string})]));
const rulingSchema = object({decisions:object(rulingFields),compatible:{type:'boolean'},reason:string});

export async function reviewReferencePlan({call, project, direction, images, handoff, otherDirections}) {
  const references=handoff.references.map((ref,index)=>({...ref,imageNumber:index+1}));
  const packet = {brief:project.brief,strategy:project.strategyText, directions:project.copyReview?.draft?.directions ?? project.directions, direction,references,otherDirections};
  const scope='附件依图号对应公开参考原图或本案上传的参考素材，目前尚未生成本案稿件。审核对象是这一方向的借鉴方案，区分原图可见特征与 apply、avoid 约定的新画法。原参考的品牌、规格和场景与本案不同，只在借法必须依赖这项且无法转译时影响评分。硬退须引用具体借法及图上依据，证明照搬风险或关键要求冲突。本案成稿的印字、规格、相似度和设计完成度将在出图后另审。';
  const instruction=scope+' 两项维度均须判断。证据简述图号、实际位置、可见特征及转译用途。对比没有项目上下文时的原图观察，读不清就标明。总分尺度为 1 至 5。1事实抵触，2机制不成立，3连接或执行条件缺失，4有图卡依据，5另需具体对照优势。仅在有关键未核事实时填 null。没有销售依据不能断言销量。借法只换品牌文案或配色且复制整体结构时写入 hardReject，无成立硬伤留空。';
  const votes=await independentCalls(Object.entries(roles),async ([role,dimensions])=>{
    const result=await call(instruction,images,voteSchema(dimensions),{delegate:true,rules:[],assignment:'公开参考包独立评分',context:JSON.stringify({...packet,role,dimensions})});
    const vote=result.parsedOutput;
    if (!Array.isArray(vote?.items) || vote.items.length!==2 || !dimensions.every(key=>vote.items.some(i=>i.dimension===key && nonempty(i.evidence) &&
        (i.score===null || (Number.isInteger(i.score) && i.score>=1 && i.score<=5)))) || typeof vote.hardReject!=='string') throw invalidOutput('公开参考包缺少完整的本岗原票及图证。');
    return {role,threadId:result.threadId,...vote};
  });
  const challenges=await independentCalls(votes,async vote=>{
    const ctx={...packet,role:vote.role};
    const task={delegate:true,rules:[],assignment:'公开参考包对抗',context:JSON.stringify(ctx)};
    const first=await call(scope+' 先独立检查本岗两维有无遗漏或过度推断，写明可见依据。不另打分，无异议填空 issue。',images,challengeSchema,task);
    if(typeof first.parsedOutput?.issue!=='string' || !nonempty(first.parsedOutput.evidence)) throw invalidOutput('公开参考对抗缺少核对依据。');
    const checked=await call(scope+' 结合独立发现核对原票。只保留仍成立且有证的问题，缺少问题就留空 issue。不另打分。',images,challengeSchema,{...task,context:JSON.stringify({...ctx,findings:first.parsedOutput,vote})});
    if(typeof checked.parsedOutput?.issue!=='string' || !nonempty(checked.parsedOutput.evidence)) throw invalidOutput('公开参考对抗缺少核对依据。');
    return {role:vote.role,independent:{threadId:first.threadId,...first.parsedOutput},threadId:checked.threadId,...checked.parsedOutput};
  });
  const result=await call(scope+' 按岗逐条裁定对抗意见。decisions 按 visual、brand、user、spread 四个岗的固定键填写。找得到该岗 issue 中仍成立且足以阻断的具体问题时填「阻断」，reason 引用问题并指出图或拟采用的做法。无具体阻断问题填「通过」。另核主参考机制、辅助互补性、跨方向重复和整体照搬风险，compatible 表示借鉴方案相容。不可改原分。',images,rulingSchema,{delegate:true,rules:[],assignment:'公开参考包独立裁定',context:JSON.stringify({...packet,votes,challenges})});
  const ruling=result.parsedOutput;
  if (typeof ruling?.compatible!=='boolean' || !nonempty(ruling.reason) || Object.keys(ruling.decisions ?? {}).length!==4 ||
      !challenges.every(challenge=>{
        const decision=ruling.decisions[challenge.role];
        return ['通过','阻断'].includes(decision?.status) && nonempty(decision.reason) &&
          (decision.status==='通过' || nonempty(challenge.issue));
      })) throw invalidOutput('公开参考包裁定须按四岗分别填写通过或具体阻断。');
  const decisions=Object.keys(roles).map(role=>({role,...ruling.decisions[role],accepted:ruling.decisions[role].status==='阻断'}));
  const blockers=[];
  for (const vote of votes) {
    for (const item of vote.items) if (item.score===null || item.score<4) blockers.push(vote.role+'.'+item.dimension+'：'+item.evidence);
    if (vote.hardReject.trim()) blockers.push(vote.hardReject);
  }
  for (const d of decisions) if(d.accepted) blockers.push(d.reason);
  if (!ruling.compatible) blockers.push(ruling.reason);
  const threads=[handoff.selectionThread,...votes.map(v=>v.threadId),...challenges.flatMap(c=>[c.independent.threadId,c.threadId]),result.threadId];
  if(threads.some(t=>!nonempty(t)) || new Set(threads).size!==threads.length) throw invalidOutput('公开参考包复核会话未独立。');
  return {scope:'direction',direction,references:handoff.references,hashes:images.map(i=>i.sha256),votes,challenges,ruling:{threadId:result.threadId,...ruling,decisions},passed:!blockers.length,blockers};
}
