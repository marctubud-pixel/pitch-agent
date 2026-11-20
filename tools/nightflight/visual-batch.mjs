import {independentCalls,invalidOutput} from './call-checkpoints.mjs';
import {visualElements} from './visual-references.mjs';
const roles = ['视觉', '品牌', '用户', '传播'];
const numeric = { type: 'integer' }, text = { type: 'string' };
const onPackIssues = {
  theme_printed: '提案主题印在包装本体，需改稿。',
  text_mismatch: '包装本体的字样与已确认的信息或用途不符。',
  unverified: '包装印字位置或内容待核实。',
};
const onPackStatuses = ['verified', ...Object.keys(onPackIssues)];
const sloganStatuses = ['readable', 'missing', 'unreadable'];
const sloganFields = {status:{...text,enum:sloganStatuses}, text, location:text};
const sloganSchema = {type:'object',additionalProperties:false,properties:sloganFields,required:Object.keys(sloganFields)};

function sloganParts(value) {
  const compact = value.trim().replace(/(?<=\p{Script=Han})\s+|\s+(?=\p{Script=Han})/gu, '');
  const spaces = new Map();
  let text = '';
  for (const part of compact.match(/\s+|\S+/gu) ?? []) {
    if (/^\s/u.test(part)) spaces.set(text.length, /[\r\n]/u.test(part));
    else text += part;
  }
  return {text, spaces};
}

function sameSlogan(expected, observed) {
  const a = sloganParts(expected);
  const b = sloganParts(observed);
  const matchesSpacing = (source, other) => [...source.spaces].every(([at, lineBreak])=>lineBreak || other.spaces.has(at));
  return a.text === b.text && matchesSpacing(a, b) && matchesSpacing(b, a);
}

function sloganIssue(expected, observed) {
  if (observed.status==='missing') return '成图缺少已选 slogan。'+observed.location;
  if (observed.status==='unreadable') return '成图的 slogan 尚无法读清。'+observed.location;
  if (!sameSlogan(expected, observed.text)) {
    return '成图文字与本案已选 slogan 不符。'+observed.location+'读到「'+observed.text+'」，本案定稿为「'+expected+'」。';
  }
  return '';
}

function schema(fields) {
  const properties = { candidate: numeric, reason: text, ...fields };
  return {type:'object', additionalProperties:false, required:['items'], properties:{
    items:{type:'array',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}
  }};
}

const relations = ['same','different','unknown'];
const materialDifferences = ['layout','framing','focus','form'];
const differenceKinds = [...materialDifferences,'surface','same','unknown'];
const object = properties => ({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const list = items => ({type:'array',items});
const nonempty = value => typeof value==='string' && !!value.trim();
const hasHash = image => /^[a-f0-9]{64}$/.test(image?.sha256 ?? '');
const hasAxes = value => value && Object.keys(value).length===visualElements.length && visualElements.every(axis=>Object.hasOwn(value,axis));

function auditIdentity(result) {
  if (!nonempty(result?.model) || !nonempty(result.threadId)) throw invalidOutput('海报实图核对缺少模型身份或请求编号。');
  return {threadId:result.threadId,model:result.model,...(result.inputPacketHash ? {inputPacketHash:result.inputPacketHash} : {})};
}

async function reviewPosterTransfer(call, images, {reference,transfers}) {
  if (!hasHash(reference?.image) || !images.every(hasHash) || !nonempty(reference.threadId) || !nonempty(reference.model) ||
      !hasAxes(reference.observations) || !visualElements.every(axis=>nonempty(reference.observations[axis]))) {
    throw Error('海报借改核对需要本方向主参考原图、五项观察及其模型回执。');
  }
  if (!Array.isArray(transfers) || transfers.length!==3 || !transfers.every(plan=>{
    if (!Array.isArray(plan?.borrow) || !Array.isArray(plan.change) || plan.borrow.length!==3 || plan.change.length!==2) return false;
    const axes = new Set([...plan.borrow,...plan.change]);
    return visualElements.every(axis=>axes.has(axis));
  })) throw Error('海报每张稿的借三改二项目须完整对应五项。');

  const comparison = object({relation:{...text,enum:relations},referenceEvidence:text,candidateEvidence:text});
  const checks = object(Object.fromEntries(visualElements.map(axis=>[axis,comparison])));
  const output = object({items:list(object({candidate:numeric,checks}))});
  const result = await call(
    '图1是主参考原图，图2、3、4分别是候选1、2、3。每张候选都与图1对照配色、布局、景别、笔法、字体。每项各用一句话定位主参考和成图中实际可见的特征，判断关系。布局看标题、留白、前后景的相对位置。景别看主体占画面的大小及环境范围。笔法看边缘、线条与材质。字体看字形和字重。可见关系沿用填 same，出现清楚变化填 different，看不清或无法比对填 unknown，并在对应证据写明位置和原因。按画面独立作答。',
    [reference.image,...images],output,{delegate:true,rules:[],assignment:'海报借改逐项核对',context:'仅依据四张实际图片。'});
  const identity = auditIdentity(result);
  const rows = result.parsedOutput?.items;
  if (!Array.isArray(rows) || rows.length!==3) throw invalidOutput('海报借改核对须逐一覆盖三个候选。');
  const items = images.map((image,index)=>{
    const candidate = index+1;
    const values = rows.find(row=>row?.candidate===candidate)?.checks;
    if (!hasAxes(values)) throw invalidOutput('海报借改核对缺少候选 '+candidate+' 对应的五项记录。');
    const checks = {};
    for (const axis of visualElements) {
      const value = values[axis];
      if (!relations.includes(value?.relation) || !nonempty(value.referenceEvidence) || !nonempty(value.candidateEvidence)) {
        throw invalidOutput('海报候选 '+candidate+' 的'+axis+'缺少判断或原图、成图的可见依据。');
      }
      const required = transfers[index].borrow.includes(axis) ? 'borrow' : 'change';
      let relation = value.relation;
      const unknown = [reference.observations[axis],value.referenceEvidence,value.candidateEvidence].some(evidence=>evidence.trim()==='未核实');
      if (unknown || (relation==='different' && value.referenceEvidence.trim()===value.candidateEvidence.trim())) relation='unknown';
      else if (relation!=='unknown' && image.sha256===reference.image.sha256) relation='same';
      const expected = required==='borrow' ? 'same' : 'different';
      checks[axis] = {required,relation,status:relation==='unknown' ? 'unknown' : relation===expected ? 'matched' : 'mismatch',
        referenceEvidence:value.referenceEvidence,candidateEvidence:value.candidateEvidence};
    }
    return {candidate,sha256:image.sha256,referenceSha256:reference.image.sha256,...identity,checks,
      passed:visualElements.every(axis=>checks[axis].status==='matched')};
  });
  return {...identity,referenceSha256:reference.image.sha256,referenceThreadId:reference.threadId,
    referenceModel:reference.model,observations:reference.observations,items};
}

export async function reviewPosterDirections({call, entries}) {
  if (!Array.isArray(entries) || entries.length!==3 || !entries.every(entry=>nonempty(entry?.direction) && hasHash(entry.image)) ||
      new Set(entries.map(entry=>entry.direction)).size!==3) throw Error('三方向对照需要三个不同方向各一张实际海报。');
  const pair = object({first:numeric,second:numeric,structure:{...text,enum:relations},basis:{...text,enum:differenceKinds},firstEvidence:text,secondEvidence:text,reason:text});
  const result = await call(
    [
      '并排看三张海报，逐对比较图1和2、1和3、2和3。先把每张当成缩略图，忽略题字含义、配色、字形、线条、材质和人物小动作。对照主标题、留白和主画面的相对位置，主体的大小和环境范围，以及第一眼由谁或什么吸引、动作把视线引到哪里。',
      '先判断构图骨架，填 structure。主要空间组织、景别和视觉焦点关系仍相同填 same。比如两张都是左侧文字、右侧人物以相同方式围看同类主体，即便一张画成卡通、一张写实，或手势和人物数量变化，仍填 same。左右镜像、局部姿势和造型变化也算原结构。清楚可见的布局、景别或主体关系重组填 different；看不清填 unknown。',
      '在 firstEvidence 和 secondEvidence 各写本图的标题区、主画面和视觉焦点关系。reason 说清两图的构图骨架是否拉开。basis 填比较中最明显的差别：layout 为空间组织，framing 为主体大小与环境范围，focus 为视觉焦点或动作关系，form 为表现形式，surface 为局部处理，same 为相同，unknown 为未核实。first、second 填各自图号。',
    ].join('\n'),
    entries.map((entry,index)=>({...entry.image,imageId:'direction_'+(index+1)})),
    object({pairs:list(pair)}),{delegate:true,rules:[],assignment:'海报三方向实图区分',context:'只看三张实际图片。'});
  const identity = auditIdentity(result);
  const rows = result.parsedOutput?.pairs;
  if (!Array.isArray(rows) || rows.length!==3) throw invalidOutput('海报三方向对照须覆盖全部三个配对。');
  const pairs = [[1,2],[1,3],[2,3]].map(([first,second])=>{
    const row = rows.find(row=>row && ((row.first===first && row.second===second) || (row.first===second && row.second===first)));
    if (!row || !relations.includes(row.structure) || !differenceKinds.includes(row.basis) ||
        ![row.firstEvidence,row.secondEvidence,row.reason].every(nonempty)) {
      throw invalidOutput('海报三方向对照缺少图'+first+'和图'+second+'的判断或两图可见依据。');
    }
    const a = entries[first-1], b = entries[second-1];
    const [firstEvidence,secondEvidence] = row.first===first ? [row.firstEvidence,row.secondEvidence] : [row.secondEvidence,row.firstEvidence];
    let {structure,basis,reason} = row;
    if (a.image.sha256===b.image.sha256) {
      structure='same';
      basis='same';
      reason='两张稿的文件哈希相同。';
    } else if ([firstEvidence,secondEvidence].some(evidence=>evidence.trim()==='未核实') ||
        (structure==='different' && firstEvidence.trim()===secondEvidence.trim())) {
      structure='unknown';
      basis='unknown';
      reason='两份实图证据尚未指明可核实的方向差异。';
    }
    return {directions:[a.direction,b.direction],sha256:[a.image.sha256,b.image.sha256],structure,basis,
      distinct:structure==='different' && materialDifferences.includes(basis),firstEvidence,secondEvidence,reason};
  });
  return {...identity,pairs};
}

export function holdSimilarPosterDirections(comparison, representatives) {
  for (const pair of comparison.pairs.filter(item=>!item.distinct)) {
    for (const entry of representatives.filter(item=>pair.directions.includes(item.direction))) {
      const pairName = '「'+pair.directions.join('」与「')+'」';
      for (const draft of entry.drafts) {
        const visual = draft.visual;
        if (draft===entry.draft) {
          visual.reason += ' 三方向并排时'+pairName+'未拉开。'+pair.reason;
          visual.edit = '调整本案画面焦点、构图、景别或表现方式。'+(visual.edit==='无' ? '' : visual.edit);
        } else if (!visual.blocked && visual.mean>=4) {
          visual.reason += ' 该稿单稿达标。'+pairName+'的代表稿未拉开，采用本稿前须重新对照三案。';
          visual.edit = (visual.edit==='无' ? '' : visual.edit+' ')+'将本稿与另两案实际成图重新并排核对。';
        } else continue;
        visual.recommended = false;
        visual.blocked = true;
      }
    }
  }
}

export async function reviewVisualBatch({call, direction, images, context, packagingExpected, theme, posterSlogan, posterTransfer, sources = [], brandReferences = [], findComparators, makeBoard}) {
  if (images.length !== 3 || new Set(images.map(img => img.sha256)).size !== 3) throw invalidOutput('同方向需要三张不同的主视觉原图');
  const blindFields = ['first','action','words','alternative'];
  const properties = Object.fromEntries(blindFields.map(k=>[k,text]));
  if (posterSlogan) properties.slogan=sloganSchema;
  const blindSchema = {type:'object',additionalProperties:false,properties,required:Object.keys(properties)};
  const blindInstruction = '只看这张原图。第一眼看到什么？画面里发生什么动作？哪些信息靠读字才知道？还有什么合理的读法？逐项用自己的话回答。';
  const transcribe = ' 另外单独填 slogan。按阅读顺序逐字抄写海报主标题，保留字词、数字、标点和实际换行，只抄实际看见的内容。把可见位置写入 location。区分海报主标题、画面里的包装印字、品牌标志和时间地点。能读完整填 readable；没有主标题填 missing，位置可以留空；有字看不清填 unreadable 并只抄看清的片段。';
  const blind = await independentCalls(images,async image=>{
    const result = await call(blindInstruction+(posterSlogan ? transcribe : ''),
      [{...image,imageId:'anonymous'}],blindSchema,{delegate:true,rules:[],assignment:'独立读图者',context:'仅本张图片，保留图上文字。'});
    const words = result.parsedOutput;
    if (!blindFields.every(k=>typeof words?.[k]==='string' && words[k].trim())) throw invalidOutput('匿名盲读原话不完整');
    const observed = words.slogan;
    if (posterSlogan && (!sloganStatuses.includes(observed?.status) || typeof observed.text!=='string' || typeof observed.location!=='string' ||
      (observed.status==='readable' && (!observed.text.trim() || !observed.location.trim())))) {
      throw invalidOutput('海报需要逐字记录看见的主标题和位置，缺失或无法读清时请如实标记。');
    }
    return {...words,sha256:image.sha256,thread:result.threadId,...(result.model ? {model:result.model} : {})};
  });
  const transferAudit = posterTransfer ? await reviewPosterTransfer(call,images,posterTransfer) : null;
  const references = [], selectionThreads = [];
  let packaging = packagingExpected ?? (posterSlogan ? false : undefined);
  const productOriginals = packaging === false ? [] : brandReferences.slice(0,3);
  // The API accepts eight images, including the three candidates and the comparison board.
  const comparatorLimit = 4 - productOriginals.length;
  async function assessSources(pool) {
    for (let offset=0; offset<Math.max(pool.length,1) && references.length<comparatorLimit; offset+=4) {
      const group=pool.slice(offset,offset+4);
      const selection = await call((packagingExpected ? '本案明确交付包装，packaging 为 true。' : '根据本案载体和图片内容判定是否为包装任务。')+'仅选择与本方向同品类、可见包装正面的独立商品参考；排除本案原稿、标志、跨行业技法与非商品图。按适用性排序，用从1开始的原图序号返回，无合适图时返回空数组。',
        group,{type:'object',additionalProperties:false,properties:{packaging:{type:'boolean'},indices:{type:'array',items:numeric}},required:['packaging','indices']},
        {delegate:true,rules:[],assignment:'核对同类参考',context:context+' 当前方向：'+direction+' 输入图片按序：'+JSON.stringify(group.map(s=>s.name))});
      const result = selection.parsedOutput;
      if (typeof result?.packaging!=='boolean' || (packaging!==undefined && packaging!==result.packaging) || !Array.isArray(result.indices) ||
        !result.indices.every(i=>Number.isInteger(i)&&i>0&&i<=group.length) || new Set(result.indices).size!==result.indices.length) throw invalidOutput('同类参考指向无效');
      packaging=result.packaging;
      selectionThreads.push(selection.threadId);
      for (const i of result.indices) {
        if (references.length<comparatorLimit && !references.some(s=>s.sha256===group[i-1].sha256)) references.push(group[i-1]);
      }
    }
  }
  if (packaging !== false) await assessSources(sources.filter(image=>!productOriginals.some(ref=>ref.sha256===image.sha256)));
  if (packaging && !references.length && findComparators) {
    const extra=await findComparators();
    if (extra.length) await assessSources(extra);
  }
  const missing = packaging && !references.length;
  const board = references.length ? await makeBoard(images,references) : null;
  const supplied = packaging ? productOriginals : [];
  const packet = [...images,...references,...(board?[board]:[]),...supplied];
  const rules = ['候选为第1至3张，仅给候选评分。'];
  if (posterSlogan) rules.push('按海报或 KV 的传播场景查看画面与文字。');
  if (board) rules.push('候选之后为同类原图和一张同序等框缩图。逐对定位相似与不同，区分单图和并排可见性。参考顺序为'+references.map(r=>r.name).join('、')+'。');
  else if (packaging) rules.push('本批没有可用同类包装，不得推断已完成同类对照。');
  if (supplied.length) rules.push('末尾 '+supplied.length+' 张是客户的品牌或产品原件，用来核对已确认的实物和字样。顺序为'+supplied.map(r=>r.name).join('、')+'。');
  async function read(assignment, instruction, fields, extra = '') {
    const result = await call(instruction, packet, schema(fields), {delegate:true,rules, assignment, comparison:packet.length>4 || !!board, context: context + '\n本批方向：' + direction + extra});
    const rows = result.parsedOutput?.items;
    if (rows?.length !== 3 || ![1,2,3].every(n => rows.some(row => row.candidate === n && row.reason?.trim()))) {
      throw invalidOutput('主视觉评审未逐张交回三份可核对意见');
    }
    return {thread: result.threadId, items: rows,...(result.model ? {model:result.model} : {})};
  }
  const duties = packaging ? {用户:'卖点动作、误读、哪些只能靠读字',传播:'同类并排辨识度及能否认回品牌',品牌:'逐张看实际包装本体的印字，引用可见原话与位置。核对品牌、品类、规格等产品信息的层级，以及方向名或主题 slogan 有无落在本体，区分盒身、价签和场景标题',视觉:'逐对核对原创转译、成套相似性与小尺寸完成度'} : {用户:'目标受众理解与可行性',传播:'传播场景、记忆及差异',品牌:'品牌匹配和主题表达',视觉:'美术、构图与视觉层级'};
  const votes = await independentCalls(roles,async role=>{
    const checksPackagingText = packaging && role === '品牌';
    const placement = checksPackagingText ? '。onPackStatus：可核实且符合简报及产品资料填 verified，印上方向名或主题句填 theme_printed，存在其他字样错误或把价签等触点文字误印在本体填 text_mismatch，盒身文字或位置看不清填 unverified。reason 要写可见字样及位置' : '';
    const fields = {score:numeric,...(checksPackagingText ? {onPackStatus:{...text,enum:onPackStatuses}} : {})};
    const reviewInput = checksPackagingText ? JSON.stringify({本案主题仅用于设计:theme}) : role==='用户' ? JSON.stringify(blind) : '';
    const report = await read(role+'独立评分岗', '对每张图给一个 1–5 整数整体分，按本岗责任：'+duties[role]+placement+'。同分也要说明差异，写可定位的依据。', fields, reviewInput);
    if (!report.items.every(row => Number.isInteger(row.score) && row.score >= 1 && row.score <= 5)) throw invalidOutput('主视觉原票分数无效');
    if (checksPackagingText && !report.items.every(row=>onPackStatuses.includes(row.onPackStatus))) throw invalidOutput('品牌原票缺少包装文字核验。');
    return {role,...report};
  });
  const challenges = await independentCalls(roles,async role=>{
    const independent = await read(role+'独立对抗岗', '从本岗职责逐图独立找漏项：'+duties[role]+'。不评分。', {});
    const checked = await read(role+'对抗核查岗', '结合独立发现逐项核查对应原票，列证据及仍成立的问题，不评分。', {},
      JSON.stringify({独立发现:independent.items,原票:votes.find(v=>v.role===role).items}));
    return {role,independent,...checked};
  });
  const ruling = await read('独立视觉总监', '逐图裁定原票及对抗意见。仍有成立硬伤或关键未知时 blocked 为 true；reason 写取舍理由、保留处和具体修改建议。为三张图给互不重复的优先次序 priority（1 最优），只用于合格同分时决胜。不得改分。edit 写具体部位与改法；research 写需补的实景、来源或产品资料。没有待办填无。素材不足须说明。',
    {blocked:{type:'boolean'},priority:numeric,edit:text,research:text}, JSON.stringify({votes,challenges,blind}));
  if (!ruling.items.every(row=>typeof row.blocked==='boolean' && row.edit?.trim() && row.research?.trim()) || ![1,2,3].every(n=>ruling.items.some(row=>row.priority===n))) throw invalidOutput('主视觉总监裁定不完整');
  const candidates = ruling.items.map(row => {
    const scores = votes.map(v=>({role:v.role,...v.items.find(i=>i.candidate===row.candidate)}));
    const brand = scores.find(v=>v.role==='品牌');
    const printIssue = packaging ? onPackIssues[brand.onPackStatus] : undefined;
    const reading = blind[row.candidate-1];
    const posterIssue = posterSlogan ? sloganIssue(posterSlogan, reading.slogan) : '';
    const audit = transferAudit?.items[row.candidate-1];
    let reason = posterIssue || (printIssue ? printIssue+brand.reason : row.reason);
    let edit = posterIssue ? '在海报主标题位置清楚排入本轮原句「'+posterSlogan+'」，逐字核对。' : row.edit;
    if (audit && !audit.passed) {
      if (posterIssue && printIssue) reason += ' '+printIssue+brand.reason;
      for (const [axis,check] of Object.entries(audit.checks)) {
        if (check.status==='matched') continue;
        const action = check.required==='borrow' ? '沿用' : '改变';
        reason += ' '+axis+'应'+action+(check.status==='unknown' ? '，尚未核实。' : '，实图与要求不符。')+'主参考可见「'+check.referenceEvidence+'」，成图可见「'+check.candidateEvidence+'」。';
        const correction = check.status==='unknown' ? '并排复核'+axis+'的可见依据。' : '参照原图的「'+check.referenceEvidence+'」，在成图中'+action+'这项'+axis+'特征。';
        edit = edit==='无' ? correction : edit+' '+correction;
      }
    }
    return {...row,blocked:row.blocked || missing || !!printIssue || !!posterIssue || audit?.passed===false,
      reason,edit,...(audit ? {transferAudit:audit} : {}),
      research:missing?'补充同类包装正面原图。'+(row.research==='无'?'':row.research):row.research,blind:reading,scores,mean:scores.reduce((sum,v)=>sum+v.score,0)/roles.length};
  });
  const winner = candidates.filter(c=>!c.blocked && c.mean>=4).sort((a,b)=>b.mean-a.mean || a.priority-b.priority)[0];
  return {direction,packaging,...(posterSlogan ? {posterSlogan} : {}),...(transferAudit ? {transferAudit} : {}),
    board:board?.name,references:references.map(ref=>({name:ref.name,sha256:ref.sha256})),selectionThread:selectionThreads[0],selectionThreads,blind,images:images.map(img=>img.sha256),votes,challenges,ruling,candidates,winner:winner?.candidate ?? null};
}
