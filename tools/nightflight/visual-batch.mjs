import {confirmsInnerPackets} from './packaging-quantity.mjs';
import {independentCalls,invalidOutput} from './call-checkpoints.mjs';
import {visualElements} from './visual-references.mjs';
import {createHash} from 'node:crypto';
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

const relations = ['same','different','unknown'];
const materialDifferences = ['layout','framing','focus','form'];
const differenceKinds = [...materialDifferences,'surface','same','unknown'];
const object = properties => ({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const list = items => ({type:'array',items});
const posterArtworkIssues={
  foreign_identity:'图上出现了未授权的其他品牌标识',
  reference_asset:'图上照搬了参考中的可识别素材',
  unconfirmed_claim:'图上写了本案未确认或已抵触的产品信息',
};
const posterArtworkSchema={...list(object({kind:{...text,enum:Object.keys(posterArtworkIssues)},observed:text,location:text})),maxItems:5};
const packetForms=['individually_wrapped','loose_in_outer_box','printed_illustration','not_shown','unclear'];
const innerPacketsSchema=object({form:{...text,enum:packetForms},evidence:text,location:text});
const innerPacketsRead='另单独核对外盒内容。指出在候选实际看见的容器位置和内容。只有真实开口或透窗内见到散粒直接装在外盒里时选 loose_in_outer_box；可辨完整独立袋选 individually_wrapped；清楚是印刷的食材图选 printed_illustration；不露出内装选 not_shown；区分不了透明开窗和印刷或看不清内容选 unclear。桌面、盘中及独立小袋内的配料都不算外盒散装。evidence 和 location 写可指认的像素特征及位置。';
const candidateKeys = ['candidate_1','candidate_2','candidate_3'];
const nonempty = value => typeof value==='string' && !!value.trim();
const hasHash = image => /^[a-f0-9]{64}$/.test(image?.sha256 ?? '');
const hasAxes = value => value && Object.keys(value).length===visualElements.length && visualElements.every(axis=>Object.hasOwn(value,axis));

function auditIdentity(result) {
  if (!nonempty(result?.model) || !nonempty(result.threadId)) throw invalidOutput('海报实图核对缺少模型身份或请求编号。');
  return {threadId:result.threadId,model:result.model,...(result.inputPacketHash ? {inputPacketHash:result.inputPacketHash} : {})};
}

function validSloganObservation(value) {
  return sloganStatuses.includes(value?.status) && typeof value.text==='string' && typeof value.location==='string' &&
    (value.status!=='readable' || (nonempty(value.text) && nonempty(value.location)));
}

function titleRegion(location) {
  if (/下半|下方|底部|下部|下角/u.test(location)) return [0,400,1000,1000];
  if (/中央|中间|中部|中段/u.test(location) && !/上半|上方|顶部/u.test(location)) return [0,200,1000,800];
  return [0,0,1000,580];
}

async function confirmPosterTitle(call, image, first, expected, cropTitle) {
  if (!sloganIssue(expected,first) || !cropTitle) return null;
  const box=titleRegion(first.location);
  const crop=await cropTitle(image,box);
  const result=await call('只看这张原图的无损局部。按阅读顺序逐字抄写可见海报主标题，保留标点、数字和实际换行。没有主标题填 missing，看不全填 unreadable，能读全填 readable。只抄实际看到的字，禁止补字；非标题的品牌、商品印字或装饰不要抄入。',
    [{...crop,imageId:'anonymous-title-crop'}],sloganSchema,
    {delegate:true,rules:[],assignment:'海报标题原图裁片复读',context:'附件只含本张海报的一块原图裁片。'});
  const observation=result.parsedOutput;
  if (!validSloganObservation(observation)) throw invalidOutput('海报标题裁片缺少逐字观察或可见位置。');
  return {...auditIdentity(result),sha256:image.sha256,cropSha256:crop.sha256,box,observation,confirmed:!sloganIssue(expected,observation)};
}

const ownFactPrefix=/^(?:本案|本品|本轮|我方|自有)(?:的)?\s*/u;
const posterProductSurface=/(?:杯|瓶|罐|盒|袋)(?:身|盖|面|体|装产品)|包装(?:本体|正面)|产品本体/u;
const nonOwnFactPrefix=/^(?:竞品|其他品牌|友商|同类(?:品牌|产品)|参考|参照|对标|示例|例如|假设|目标价|目标售价|拟售价)/u;
const nonFactQualifier=/^(?:(?:仅供参考|仅作参考|只供参考|仅作对比|只作对比|这是竞品|属于竞品|不是本案)|(?:该项|此项|价格|售价|品牌名)?(?:待确认|尚未确认|尚未确定|未定|暂定)$)/u;
const ownedPosterRequest=/^(?:请\s*)?(?:帮我\s*)?(?:为|给)\s*[「“『"']([^」”』"'\n]{1,32})[」”』"']\s*([^，。；\n]{0,32}?)(?:做|设计|制作)[^。；\n]{0,45}(?:海报|KV|包装)/iu;

function posterAuthorityClauses(brief) {
  return brief.split(/[。；;！？\r\n]/u).flatMap(sentence=>{
    const clauses=sentence.split(/[，,]/u).map(part=>part.trim());
    let otherScope=false;
    return clauses.flatMap((clause,index)=>{
      if (ownFactPrefix.test(clause)) otherScope=false;
      const statement=clause.replace(ownFactPrefix,'');
      if (nonOwnFactPrefix.test(statement)) otherScope=true;
      return otherScope || nonFactQualifier.test(clauses[index+1] ?? '') ? [] : [statement];
    });
  });
}

export function posterBrandFacts(brief) {
  const clauses=posterAuthorityClauses(brief);
  const names=clauses.flatMap(clause=>{
    const explicit=clause.match(/^品牌(?:名称|名)?\s*(?:为|是|叫|[:：])\s*(.+)$/u)?.[1];
    const name=(explicit?.replace(/^[「“『"']|[」”』"']$/gu,'') ?? clause.match(ownedPosterRequest)?.[1])?.trim();
    return name && /^[\p{L}\p{M}\p{N} &·._+-]{1,32}$/u.test(name) && !/待定|未定|待确认|未确认|另定/u.test(name) ? [name] : [];
  });
  return {allowedBrands:[...new Set(names)],logoPending:clauses.some(clause=>/^(?:正式)?(?:标志|标识|logo)\s*(?:为|仍|尚)?\s*(?:待定|未定|待确认|未确认|未确定)$/iu.test(clause))};
}

function locatedBlindBrands(blind, allowedBrands) {
  const marks=[];
  const brandKey=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,'');
  const allowed=new Set(allowedBrands.map(brandKey));
  if (!allowed.size) return marks;
  for (const sentence of blind.words.split(/[。；\n]/u)) {
    const brand=sentence.match(/(?:品牌|商标)(?:名|名称|字样)?\s*[「『“‘"']([^」』”’"']{1,32})[」』”’"'](?:\s*及其(?:中文名|英文名|别名)\s*[「『“‘"']([^」』”’"']{1,32})[」』”’"'])?\s*(?:位于|出现在|印在|写在)([^，,。；;]{2,25})/u);
    if (!brand || /未见|看不清|疑似|像是|可能|模糊|不像/u.test(sentence)) continue;
    const [,name,alias,location]=brand;
    const foreign=[name,alias].filter(mark=>mark && !allowed.has(brandKey(mark)));
    if (foreign.length) marks.push({kind:'foreign_identity',observed:foreign.join(' '),location:location.trim()});
  }
  return marks;
}

function confirmedPosterText(brief, title) {
  const clauses=posterAuthorityClauses(brief);
  const descriptions=clauses.flatMap(clause=>{
    const product=clause.match(ownedPosterRequest);
    return product?.[2].trim() ? [product[1]+product[2].trim()] : [];
  });
  const prices=[...new Set(clauses.flatMap(clause=>{
    const price=clause.match(/^(?:已确认|已定|最终)?\s*(?:零售|正式)?售价\s*(?:为|是|[:：])?\s*([0-9]+(?:\.[0-9]+)?\s*元\s*(?:一[杯瓶盒袋]|\/[杯瓶盒袋])?)$/u)?.[1];
    return price ? [price] : [];
  }))];
  return [title,...descriptions,...(prices.length===1 ? prices : [])].filter(nonempty);
}

function posterLiteral(text) {
  return text.normalize('NFKC').replace(/[\s"'「」『』“”‘’]/gu,'').replace(/[。!！]$/u,'');
}

function saysThereIsNoArtworkIssue({observed}) {
  const text=observed.trim();
  if (/但|却|然而|反而|仍(?:有|显示|出现)/u.test(text)) return false;
  if (/^(?:不存在|未发现|未见|没有|无)(?:任何)?(?:外来|第三方|未经授权的)?(?:品牌名[、和与或]|竞品字样|商标[、和与或]|照搬|复制|与客户.{0,12}冲突|违规|不一致)/u.test(text)) return true;
  return /(?:与(?:本案|客户)?简报(?:要求)?(?:相符|一致)|符合(?:原始|客户|本案)?简报)(?:[。；，][^但未不缺错]*)?$/u.test(text) &&
    !/不符|冲突|未经|未确认|缺失|不一致/u.test(text);
}

async function auditPosterArtwork(call, image, reading, productBrief, sourcePolicy, title, detail=false) {
  const facts=sourcePolicy.brandFacts ?? posterBrandFacts(productBrief);
  const confirmed=confirmedPosterText(productBrief,title);
  const result=await call([
    detail ? '只看实际海报下部的无损裁片。逐个抄读小字和图标说明，核对配料、工艺、功效、装饰英文和品牌拼音有没有本案依据。要注明实际字样和裁片内位置。' : '只检查这一张海报原图的合规事实，不打分。每项必须逐字抄录可辨原字，或写出可识别的专有图形特征，并标注可定位的位置。对匿名读图提供的品牌线索回原图核读。',
    'artworkIssues 数组只写确实存在的违规。没有违规时直接交空数组，不把干净位置或合规说明填成问题。',
    'foreign_identity：可辨识的外来品牌名、商标或联名标识。reference_asset：照搬参考中可识别的专有角色、标志形状或独特物件组合。通用杯形、普通图形、配色及虚化背景的不可辨纹理均不算。',
    'unconfirmed_claim：与客户确认资料冲突或未获确认的属性、配料、口味、工艺、功效、商品印字，以及擅自加的品牌拼音、译名或装饰英文。已确认的文字、正常单位、客户确认的品牌文字、正式标志未定时的空白或纯色占位都可用。画面文字区与商品本体分开核对，未采用品牌原件时，商品本体只按简报明确要求印出的原字来核。',
    '客户原始简报是事实授权依据；已确认品牌资料只列能从原话提取的名称，参考用途和排除项不授权任何第三方内容。',
  ].join('\n'),[image],object({artworkIssues:posterArtworkSchema}),{delegate:true,rules:[],assignment:detail ? '海报下部商品小字裁片核验' : '单图海报硬事实核验',
    context:JSON.stringify({客户原始简报:productBrief,已确认品牌资料:facts,已确认海报原文:confirmed,
      已采用品牌原件:sourcePolicy.hasBrandArtwork===true,允许借用的画面关系:sourcePolicy.approvedReferenceUse,
      参考排除项:sourcePolicy.mainReferenceExclusions,原图匿名首读:reading.words})});
  const observed=result.parsedOutput?.artworkIssues;
  if (!Array.isArray(observed) || observed.length>posterArtworkSchema.maxItems ||
      observed.some(issue=>!issue || !Object.hasOwn(posterArtworkIssues,issue.kind) || !nonempty(issue.observed) || !nonempty(issue.location))) {
    throw invalidOutput('海报合规须逐图记录实际看到的违规原字或可辨认图形及位置。');
  }
  const recalled=detail ? [] : locatedBlindBrands(reading,facts.allowedBrands ?? []);
  const allowed=new Set(confirmed.map(posterLiteral));
  const confirmedFalseAlarms=observed.filter(issue=>issue.kind==='unconfirmed_claim' &&
    allowed.has(posterLiteral(issue.observed)) && !posterProductSurface.test(issue.location));
  const dismissedAsNoIssue=observed.filter(saysThereIsNoArtworkIssue);
  const issues=observed.filter(issue=>!confirmedFalseAlarms.includes(issue) && !dismissedAsNoIssue.includes(issue));
  issues.push(...recalled.filter(issue=>!issues.some(other=>other.kind===issue.kind && other.observed.includes(issue.observed))));
  return {sha256:image.sha256,...auditIdentity(result),issues,...(recalled.length ? {blindBrandIssues:recalled} : {}),
    ...(confirmedFalseAlarms.length ? {confirmedFalseAlarms} : {}),
    ...(dismissedAsNoIssue.length ? {dismissedAsNoIssue} : {})};
}

async function confirmPosterArtworkDetail(call, image, reading, brief, policy, title, cropOriginal, artwork) {
  const notice=[reading.first,reading.words].join('。');
  if (!cropOriginal || !/(?:中下|下方|下部|底部)[^。；]{0,22}(?:图标|小字|卖点|说明|品牌|标志)/u.test(notice)) return artwork;
  const box=[0,550,1000,1000];
  const crop=await cropOriginal(image,box);
  const detail=await auditPosterArtwork(call,crop,reading,brief,policy,title,true);
  const issues=artwork.issues.concat(detail.issues.filter(issue=>!artwork.issues.some(original=>
    original.kind===issue.kind && posterLiteral(original.observed)===posterLiteral(issue.observed))));
  return {...artwork,issues,detail:{...detail,box}};
}

function reviewPreviewEvidence(originals,previews) {
  return originals.flatMap((frame,index)=>frame.sha256===previews[index].sha256 ? [] : [{
    originalSha256:frame.sha256,reviewSha256:previews[index].sha256,originalBytes:frame.byteLength,reviewBytes:previews[index].byteLength,
  }]);
}

export function selectPosterRedraw(candidates) {
  return candidates.toSorted((a,b)=>Number(b.mean>=4)-Number(a.mean>=4) ||
    a.repairDefects.length-b.repairDefects.length || b.mean-a.mean || a.priority-b.priority)[0];
}

async function reviewPosterTransfer(call, images, {reference,transfers}, makePreviews) {
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
  const output = object(Object.fromEntries(candidateKeys.map(key=>[key,checks])));
  const originals=[reference.image,...images];
  const frames=makePreviews ? await makePreviews(originals) : originals;
  const previewEvidence=reviewPreviewEvidence(originals,frames);
  const result = await call(
    '图1是主参考，图2、3、4依次填入固定对象 candidate_1、candidate_2、candidate_3，三个对象全部要填。每张候选都单独与图1对照配色、布局、景别、笔法、字体。每项填三个字段：referenceEvidence 只写图1实见的特征与位置，candidateEvidence 只写这一候选实见的特征与位置，relation 写两者的关系。三栏都要填写。每项只比较自己的特征：配色看主色、辅助色及对比；布局看标题、留白和各层主体的相对位置；景别看主体占画面的大小及环境范围；笔法看边缘、线条与材质；字体看字形和字重。字色变化在配色里判断，人物或物件替换本身不改变布局或景别。画面特征可见沿用填 same，出现清楚变化填 different，看不清或无法比对填 unknown，并在对应证据写明位置和原因。按画面独立作答。',
    frames,output,{delegate:true,rules:[],assignment:'海报借改逐项核对',context:'仅依据四张实际图件，包含原图或其完整阅览版。'});
  const identity = auditIdentity(result);
  const rows = result.parsedOutput;
  if (!rows || Object.keys(rows).length!==3 || !candidateKeys.every(key=>Object.hasOwn(rows,key))) {
    throw invalidOutput('海报借改核对须逐一覆盖三个候选。');
  }
  const items = images.map((image,index)=>{
    const candidate = index+1;
    const values = rows[candidateKeys[index]];
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
    referenceModel:reference.model,observations:reference.observations,items,...(previewEvidence.length ? {previewEvidence} : {})};
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

async function readOriginalPackaging(call,image,productBrief,theme,direction) {
  const status = {...text,enum:['verified','text_mismatch','unverified']};
  const mark={type:'object',additionalProperties:false,properties:{text,location:text},required:['text','location']};
  const outputSchema={type:'object',additionalProperties:false,properties:{status,printed:{type:'array',items:mark},reason:text},required:['status','printed','reason']};
  const result=await call(
    '独立核对这一张原图的包装印字。只读实际盒身、袋身、瓶身等包装本体，逐字记下文字及具体位置。海报标题、价签、道具和背景字样排除。看不清的字留作未核。'+
    '能核清并符合 Brief 已确认的产品信息时填 verified。实际印了抵触的文字时填 text_mismatch。包装本体或字样看不清时填 unverified。逐字记录读到的印字，reason 写核对依据。',
    [image],outputSchema,{delegate:true,rules:[],assignment:'独立核对包装本体原图',context:JSON.stringify({brief:productBrief})});
  const observation=result.parsedOutput;
  if (!status.enum.includes(observation?.status) || !nonempty(observation.reason) || !Array.isArray(observation.printed) ||
      !observation.printed.every(mark=>nonempty(mark?.text) && nonempty(mark.location)) ||
      (observation.status!=='unverified' && !observation.printed.length) || !nonempty(result.threadId) || !nonempty(result.model)) {
    throw invalidOutput('包装本体原图核对需返回原字、位置及回执。');
  }
  const expected=[theme, productBrief.includes(direction) ? '' : direction].filter(nonempty);
  const printedTheme=observation.printed.find(mark=>expected.some(value=>sameSlogan(value,mark.text)));
  return {...observation,sha256:image.sha256,threadId:result.threadId,model:result.model,
    ...(result.inputPacketHash ? {inputPacketHash:result.inputPacketHash} : {}),
    ...(printedTheme ? {status:'theme_printed',reason:'本体'+printedTheme.location+'读到「'+printedTheme.text+'」。'} : {})};
}

const weeklyHint=/一周|一星期|七天|星期|周[一二三四五六日天]|\bweekly\b/iu;
const weekdayNames=['一','二','三','四','五','六','日'];
const englishWeekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function weekdayKey(value) {
  const written=value.trim().normalize('NFKC').toLowerCase().replace(/\.$/u,'');
  const chinese=written.match(/^(?:周|星期|礼拜)([一二三四五六日天])$/u)?.[1];
  if (chinese) return weekdayNames.indexOf(chinese==='天'?'日':chinese);
  return englishWeekdays.findIndex(day=>day===written || day.slice(0,3)===written);
}

async function readWeeklyPackagingLabels(call,image) {
  const result=await call(
    '只检查包装本体是否实际印了逐日星期标签。先找盒身或袋身上明确可辨的星期原字。电商标题出现「一周」、普通分装图标、没有星期字样的格子均不算星期标签。没有任何可定位的实际星期原字时，labels 填空数组，location 留空，不猜测模糊图标是星期栏目。只有确认存在实际星期标签时，再按图示位置逐格逐字抄录，保留重复或缺字，不按常见日历补全。只把同一星期栏看不清的具体位置留空并写入 uncertain。',
    [image],object({labels:list(text),location:text,uncertain:text}),
    {delegate:true,rules:[],assignment:'独立核读包装日序',context:'仅这张候选原图。'});
  const observation=result.parsedOutput;
  if (!hasHash(image) || !nonempty(result.model) || !nonempty(result.threadId) ||
      !Array.isArray(observation?.labels) || !observation.labels.every(label=>typeof label==='string') ||
      typeof observation.location!=='string' || typeof observation.uncertain!=='string') {
    throw invalidOutput('包装日序须交回原图实际顺序、位置及回执。');
  }
  const printed=observation.labels.map(weekdayKey).filter(day=>day>=0);
  if (printed.length && !nonempty(observation.location)) throw invalidOutput('清楚读到星期标签时须标出包装本体的位置。');
  const issue=printed.length && (observation.labels.length!==7 || new Set(printed).size!==7 || nonempty(observation.uncertain)) ?
    '包装本体的完整一周图示有重复、缺漏或未核字样。'+observation.location+'按图顺序读到「'+
      observation.labels.map(label=>label || '未核实').join('、')+'」。'+observation.uncertain : '';
  return {...observation,sha256:image.sha256,threadId:result.threadId,model:result.model,
    ...(result.inputPacketHash ? {inputPacketHash:result.inputPacketHash} : {}),...(issue ? {issue} : {})};
}

export async function reviewVisualBatch({call, direction, images, context, packagingExpected, theme, posterSlogan, posterTransfer, sources = [], verifiedComparators = [], brandReferences = [], findComparators, makeBoard, makePreviews, cropTitle, productBrief, priorReview}) {
  if (images.length !== 3 || new Set(images.map(img => img.sha256)).size !== 3) throw invalidOutput('同方向需要三张不同的主视觉原图');
  const sourcePolicy=packagingExpected!==true && posterSlogan ? posterTransfer?.sourcePolicy : null;
  if (sourcePolicy && (!nonempty(productBrief) || typeof sourcePolicy.mainReferenceExclusions!=='string')) {
    throw Error('海报品牌事实核对需要客户原始简报和本方向参考排除项。');
  }
  const profile=posterTransfer?.reviewProfile;
  const readbackScope=sourcePolicy && profile?.base && profile?.model ?
    createHash('sha256').update(JSON.stringify([direction,productBrief,posterSlogan,sourcePolicy,
      posterTransfer.reference.image.sha256,posterTransfer.reference.threadId,[profile.base,profile.model],Boolean(cropTitle)])).digest('hex') : null;
  const prior=readbackScope && priorReview?.readbackScope===readbackScope
    ? new Map(priorReview.candidates.map(candidate=>[candidate.blind.sha256,candidate])) : new Map();
  const checksInnerPackets=packagingExpected===true && productBrief && confirmsInnerPackets(productBrief);
  const blindFields = ['first','action','words','alternative'];
  const properties = Object.fromEntries(blindFields.map(k=>[k,text]));
  if (posterSlogan) properties.slogan=sloganSchema;
  if (checksInnerPackets) properties.innerPackets=innerPacketsSchema;
  const blindInstruction = '只看这张原图。第一眼看到什么？画面里发生什么动作？哪些信息靠读字才知道？还有什么合理的读法？逐项用自己的话回答。';
  const transcribe = ' 另外单独填 slogan。按阅读顺序逐字抄写海报主标题，保留字词、数字、标点和实际换行，只抄实际看见的内容。把可见位置写入 location。区分海报主标题、画面里的包装印字、品牌标志和时间地点。标题行之外的独立装饰图标不抄进标题，确实代替标题里的文字或标点才抄入。能读完整填 readable；没有主标题填 missing，位置可以留空；有字看不清填 unreadable 并只抄看清的片段。';
  const blind = await independentCalls(images,async image=>{
    const former=prior.get(image.sha256);
    if (former?.posterArtworkCheck?.sha256===image.sha256) return former.blind;
    const quantity=image.visiblePackageUnits ? ' 单独核对图上实际可辨的同款独立包装，按从左到右逐个定位，把每件的位置分别写入 units.positions，盒上规格字和印出的图案不计为实物。仅当清楚看到完整内装或能看到从空位取出、对应的同款时，complete 填 true。看不清或有重叠遮挡就填 false。' : '';
    const blindSchema=object(quantity ? {...properties,units:object({positions:{type:'array',items:text},complete:{type:'boolean'}})} : properties);
    const result = await call(blindInstruction+(posterSlogan ? transcribe : '')+quantity+(checksInnerPackets ? ' '+innerPacketsRead : ''),
      [{...image,imageId:'anonymous'}],blindSchema,{delegate:true,rules:[],assignment:'独立读图者',context:'仅本张图片，保留图上文字。'});
    const words = result.parsedOutput;
    if (!blindFields.every(k=>typeof words?.[k]==='string' && words[k].trim())) throw invalidOutput('匿名盲读原话不完整');
    const observed = words.slogan;
    if (posterSlogan && !validSloganObservation(observed)) {
      throw invalidOutput('海报需要逐字记录看见的主标题和位置，缺失或无法读清时请如实标记。');
    }
    const structure=words.innerPackets;
    if (checksInnerPackets && (!packetForms.includes(structure?.form) || !nonempty(structure.evidence) || !nonempty(structure.location)))
      throw invalidOutput('独立分装需记录外盒内装或印刷图示的可见证据。');
    if (quantity && (!Array.isArray(words.units?.positions) || !words.units.positions.every(nonempty) ||
        new Set(words.units.positions).size!==words.units.positions.length || typeof words.units.complete!=='boolean'))
      throw invalidOutput('完整包装展示须逐项记录实际可见实物的位置。');
    return {...words,sha256:image.sha256,thread:result.threadId,...(result.model ? {model:result.model} : {})};
  });
  const posterChecks=sourcePolicy ? await independentCalls(images,async (image,index)=>{
    const reading=blind[index];
    const former=prior.get(image.sha256);
    if (former?.posterArtworkCheck?.sha256===image.sha256)
      return {artwork:former.posterArtworkCheck,title:former.posterTitleCheck,reused:true};
    const baseArtwork=await auditPosterArtwork(call,image,reading,productBrief,sourcePolicy,posterSlogan);
    const artwork=await confirmPosterArtworkDetail(call,image,reading,productBrief,sourcePolicy,posterSlogan,cropTitle,baseArtwork);
    const title=await confirmPosterTitle(call,image,reading.slogan,posterSlogan,cropTitle);
    return {artwork,title};
  }) : [];
  const verifiedTitles=posterChecks.flatMap(({title},index)=>title?.confirmed ? [{candidate:index+1,...title}] : []);
  const effectiveBlind=verifiedTitles.length ? blind.map((reading,index)=>{
    const title=posterChecks[index]?.title;
    return title?.confirmed ? {...reading,slogan:title.observation} : reading;
  }) : blind;
  const transferAudit = posterTransfer ? await reviewPosterTransfer(call,images,posterTransfer,makePreviews) : null;
  const references = [], selectionThreads = [];
  let packaging = packagingExpected ?? (posterSlogan ? false : undefined);
  const productOriginals = packaging === false ? [] : brandReferences.slice(0,3);
  // The API accepts eight images, including the three candidates and the comparison board.
  const comparatorLimit = 4 - productOriginals.length;
  const reusedResearch=[];
  if (packaging) {
    for (const ref of verifiedComparators) {
      if (references.length>=comparatorLimit) break;
      if (productOriginals.some(a=>a.sha256===ref.sha256) || references.some(a=>a.sha256===ref.sha256)) continue;
      references.push(ref);
      reusedResearch.push(ref.sha256);
    }
  }
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
  if (packaging !== false && !references.length) await assessSources(sources.filter(image=>!productOriginals.some(ref=>ref.sha256===image.sha256)));
  if (packaging && !references.length && findComparators) {
    const extra=await findComparators();
    if (extra.length) await assessSources(extra);
  }
  const missing = packaging && !references.length;
  const board = references.length ? await makeBoard(images,references) : null;
  const supplied = packaging ? productOriginals : [];
  const packet = [...images,...references,...(board?[board]:[]),...supplied];
  const reviewFrames=makePreviews ? await makePreviews(packet) : packet;
  const previewEvidence=reviewPreviewEvidence(packet,reviewFrames);
  const rules = ['输出三个固定对象 candidate_1、candidate_2、candidate_3，依次对应最前面的三张候选原图。其余附件是参照，只可在候选理由中引用。'];
  if (posterSlogan) rules.push('按海报或 KV 的传播场景查看画面与文字。');
  if (board) rules.push('候选之后为同类包装参考和一张同序等框缩图。逐对定位相似与不同，区分单图和并排可见性。比较按原件真实载体和规格成立，不要求两者相同。参考顺序为'+references.map(r=>r.name).join('、')+'。');
  else if (packaging) rules.push('本批没有可用同类包装，不得推断已完成同类对照。');
  if (previewEvidence.length) rules.push('并排附件包含原图的轻量阅览版。字样或位置看不清时按未核实处理。');
  if (supplied.length) rules.push('末尾 '+supplied.length+' 张是客户的品牌或产品原件，用来核对已确认的实物和字样。顺序为'+supplied.map(r=>r.name).join('、')+'。');
  async function read(assignment, instruction, fields, extra = '') {
    const item = object({reason:text,...fields});
    const output = object(Object.fromEntries(candidateKeys.map(key=>[key,item])));
    const result = await call(instruction, reviewFrames, output, {delegate:true,rules,
      assignment, comparison:packet.length>4 || !!board, context:context + '\n本批方向：' + direction + extra});
    const reports = result.parsedOutput;
    if (!reports || Object.keys(reports).length!==candidateKeys.length || !candidateKeys.every(key=>nonempty(reports[key]?.reason))) {
      throw invalidOutput('主视觉评审只收 candidate_1、candidate_2、candidate_3。每张候选须有依据，参照不可单独列项。');
    }
    const rows = candidateKeys.map((key,index)=>({...reports[key],candidate:index+1}));
    return {thread:result.threadId,items:rows,...(result.model ? {model:result.model} : {}),
      ...(result.inputPacketHash ? {inputPacketHash:result.inputPacketHash} : {})};
  }
  const duties = packaging ? {用户:'卖点动作、误读、哪些只能靠读字',传播:'同类并排辨识度及能否认回品牌',品牌:'逐张看实际包装本体的印字，引用可见原话与位置。核对品牌、品类、规格等产品信息的层级，以及方向名或主题 slogan 有无落在本体，区分盒身、价签和场景标题',视觉:'逐对核对原创转译、成套相似性与小尺寸完成度'} : {用户:'目标受众理解与可行性',传播:'传播场景、记忆及差异',品牌:'品牌匹配和主题表达',视觉:'美术、构图与视觉层级'};
  const votes = await independentCalls(roles,async role=>{
    const checksPackagingText = packaging && role === '品牌';
    const placement = checksPackagingText ? '。onPackStatus：可核实且符合简报及产品资料填 verified，印上方向名或主题句填 theme_printed，存在其他字样错误或把价签等触点文字误印在本体填 text_mismatch，盒身文字或位置看不清填 unverified。reason 要写可见字样及位置' : '';
    const fields = {score:numeric,...(checksPackagingText ? {onPackStatus:{...text,enum:onPackStatuses}} : {})};
    const reviewInput = checksPackagingText ? JSON.stringify({本案主题仅用于设计:theme}) : role==='用户' ? JSON.stringify(effectiveBlind) : '';
    const report = await read(role+'独立评分岗', '给前三张候选分别填 1–5 整数整体分，按本岗责任：'+duties[role]+placement+'。同分也要说明差异，写可定位的依据。',
      fields,reviewInput);
    if (!report.items.every(row => Number.isInteger(row.score) && row.score >= 1 && row.score <= 5)) throw invalidOutput('主视觉原票分数无效');
    if (checksPackagingText && !report.items.every(row=>onPackStatuses.includes(row.onPackStatus))) throw invalidOutput('品牌原票缺少包装文字核验。');
    return {role,...report};
  });
  const onPackAudits=new Map();
  if (packaging && productBrief) {
    const originals=votes.find(vote=>vote.role==='品牌').items.filter(row=>row.onPackStatus!=='verified');
    const checked=await independentCalls(originals,async row=>[row.candidate,
      await readOriginalPackaging(call,images[row.candidate-1],productBrief,theme,direction)]);
    for (const [candidate,observation] of checked) onPackAudits.set(candidate,observation);
  }
  const weeklyLabelChecks=new Map();
  if (packaging && productBrief) {
    const weekImages=images.map((image,index)=>({image,candidate:index+1})).filter(({candidate})=>weeklyHint.test(
      [direction,theme,blind[candidate-1].words].filter(nonempty).join('\n')));
    const checked=await independentCalls(weekImages,async ({image,candidate})=>[candidate,await readWeeklyPackagingLabels(call,image)]);
    for (const [candidate,observation] of checked) weeklyLabelChecks.set(candidate,observation);
  }
  const effectiveVotes=votes.map(vote=>vote.role!=='品牌' || !onPackAudits.size ? vote : {...vote,items:vote.items.map(row=>{
    const observed=onPackAudits.get(row.candidate);
    return observed ? {...row,onPackStatus:observed.status,reason:observed.reason} : row;
  })});
  const packagingEvidenceRule=onPackAudits.size ? '包装本体印字核对采用逐张原图的抄录和位置。区分本体、海报标题与价签。保留据原图成立的印字问题。' : '';
  const challenges = await independentCalls(roles,async role=>{
    const independent = await read(role+'独立对抗岗', '从本岗职责逐图独立找漏项：'+duties[role]+'。不评分。', {});
    const checked = await read(role+'对抗核查岗', '结合独立发现逐项核查对应原票，列证据及仍成立的问题，不评分。'+(role==='品牌' ? packagingEvidenceRule : ''), {},
      JSON.stringify({独立发现:independent.items,原票:votes.find(v=>v.role===role).items,
        ...(role==='品牌' && onPackAudits.size ? {包装本体原图复核:Object.fromEntries(onPackAudits)} : {})}));
    return {role,independent,...checked};
  });
  const titleEvidenceRule=verifiedTitles.length ? '已用同稿原图裁片逐字核实的标题，以裁片实见为准；其他意见若只根据首读漏字或不清误判，不能据此拦截。' : '';
  const ruling = await read('独立视觉总监', '逐图裁定原票及对抗意见。仍有成立硬伤或关键未知时 blocked 为 true；reason 写取舍理由、保留处和具体修改建议。为三张图给互不重复的优先次序 priority（1 最优），只用于合格同分时决胜。不得改分。edit 写具体部位与改法；research 写需补的实景、来源或产品资料。没有待办填无。素材不足须说明。'+packagingEvidenceRule+titleEvidenceRule,
    {blocked:{type:'boolean'},priority:numeric,edit:text,research:text}, JSON.stringify({votes:effectiveVotes,challenges,blind:effectiveBlind,
      ...(verifiedTitles.length ? {主标题原图裁片复核:verifiedTitles} : {}),
      ...(weeklyLabelChecks.size ? {包装日序实读:Object.fromEntries(weeklyLabelChecks)} : {}),
      ...(onPackAudits.size ? {包装本体印字以逐张原图核对为准:Object.fromEntries(onPackAudits)} : {})}));
  if (!ruling.items.every(row=>typeof row.blocked==='boolean' && row.edit?.trim() && row.research?.trim()) || ![1,2,3].every(n=>ruling.items.some(row=>row.priority===n))) throw invalidOutput('主视觉总监裁定不完整');
  const candidates = ruling.items.map(row => {
    const scores = effectiveVotes.map(v=>({role:v.role,...v.items.find(i=>i.candidate===row.candidate)}));
    const brand = scores.find(v=>v.role==='品牌');
    const printIssue = packaging ? onPackIssues[brand.onPackStatus] : undefined;
    const reading = blind[row.candidate-1];
    const posterTitleCheck=posterChecks[row.candidate-1]?.title;
    const checkedTitle=posterTitleCheck?.confirmed ? posterTitleCheck.observation : reading.slogan;
    const posterIssue = posterSlogan ? sloganIssue(posterSlogan,checkedTitle) : '';
    const contents=reading.innerPackets;
    const packageIssue=checksInnerPackets && contents.form==='loose_in_outer_box'
      ? '外盒应装独立小袋，'+contents.location+'可见散装内容：'+contents.evidence+'。' : '';
    const weeklyLabelCheck=weeklyLabelChecks.get(row.candidate);
    const weeklyIssue=weeklyLabelCheck?.issue;
    const posterArtworkCheck=posterChecks[row.candidate-1]?.artwork;
    const artworkIssue=posterArtworkCheck?.issues.map(({kind,observed,location})=>
      posterArtworkIssues[kind]+'。'+location+'可见「'+observed+'」。').join(' ');
    const promised=images[row.candidate-1].visiblePackageUnits;
    const quantityIssue=promised && (!reading.units?.complete || reading.units.positions.length!==promised) ?
      '完整展示约定 '+promised+' 件，原图可定位 '+(reading.units?.positions.length ?? 0)+' 件，完整盒内件数未核实。' : '';
    const audit = transferAudit?.items[row.candidate-1];
    const paper=posterTransfer?.paperAspect;
    const {width,height}=images[row.candidate-1];
    const paperIssue=paper && (!width || !height || Math.abs((width/height)/(paper.width/paper.height)-1)>0.015)
      ? '实图尺寸 '+(width && height ? width+'×'+height : '待核')+' 不能按 '+paper.name+' 比例交付。' : '';
    const otherBlocker = row.blocked || missing || !!printIssue || !!quantityIssue || !!packageIssue || !!weeklyIssue || !!artworkIssue || !!paperIssue || audit?.passed===false;
    const exactWords = posterSlogan?.replace(/\p{P}/gu,'');
    const punctuationOnly = posterIssue && !otherBlocker && checkedTitle.status==='readable' && nonempty(exactWords) &&
      sameSlogan(exactWords,checkedTitle.text.replace(/\p{P}/gu,''));
    let reason = [posterIssue,printIssue && printIssue+brand.reason,quantityIssue,packageIssue,weeklyIssue,artworkIssue,paperIssue].filter(Boolean).join(' ') || row.reason;
    let edit = posterIssue ? '在海报主标题位置清楚排入本轮原句「'+posterSlogan+'」，逐字核对。' :
      quantityIssue ? '调整实物摆放与遮挡，逐件核对客户要求展示的完整数量。' :
      packageIssue ? '外盒透窗或开口仅展示独立小袋；配料特写放在盒外或作清楚可辨的印刷插图。' :
      weeklyIssue ? '核对包装本体逐日标记，按原图顺序补齐缺项并去掉重复日期。' :
      paperIssue ? '在实际成图里按 '+paper.name+' 比例重排，保留完整图文。' : row.edit;
    if (artworkIssue) {
      const change='移除核查定位到的未授权标志、参考专有形象或无依据的产品表述，保留客户确认的品牌文字和商品信息。';
      edit=edit==='无' ? change : edit+' '+change;
    }
    if (audit && !audit.passed) {
      for (const [axis,check] of Object.entries(audit.checks)) {
        if (check.status==='matched') continue;
        const action = check.required==='borrow' ? '沿用' : '改变';
        reason += ' '+axis+'应'+action+(check.status==='unknown' ? '，尚未核实。' : '，实图与要求不符。')+'主参考可见「'+check.referenceEvidence+'」，成图可见「'+check.candidateEvidence+'」。';
        const correction = check.status==='unknown' ? '并排复核'+axis+'的可见依据。' : '参照原图的「'+check.referenceEvidence+'」，在成图中'+action+'这项'+axis+'特征。';
        edit = edit==='无' ? correction : edit+' '+correction;
      }
    }
    const repairDefects = sourcePolicy ? [
      ...Object.entries(audit?.checks ?? {}).filter(([,check])=>check.status!=='matched').map(([axis])=>axis),
      ...posterArtworkCheck.issues.map(issue=>issue.kind),
      ...[posterIssue && 'title',paperIssue && 'paper'].filter(Boolean),
    ] : undefined;
    if (repairDefects && row.blocked && !repairDefects.length) repairDefects.push('independent-ruling');
    return {...row,blocked:otherBlocker || !!posterIssue,...(repairDefects ? {repairDefects} : {}),
      ...(punctuationOnly ? {titlePunctuation:true} : {}),
      reason,edit,...(audit ? {transferAudit:audit} : {}),...(posterArtworkCheck ? {posterArtworkCheck} : {}),
      ...(weeklyLabelCheck ? {weeklyLabelCheck} : {}),...(posterTitleCheck ? {posterTitleCheck} : {}),
      research:missing?'补充同类包装正面原图。'+(row.research==='无'?'':row.research):row.research,blind:reading,scores,mean:scores.reduce((sum,v)=>sum+v.score,0)/roles.length};
  });
  const ranked = candidates.filter(c=>c.mean>=4).sort((a,b)=>b.mean-a.mean || a.priority-b.priority);
  const winner = ranked.find(c=>!c.blocked);
  const repair = !winner && ranked.find(c=>c.titlePunctuation);
  return {direction,packaging,...(posterSlogan ? {posterSlogan} : {}),...(transferAudit ? {transferAudit} : {}),
    board:board?.name,references:references.map(ref=>({name:ref.name,sha256:ref.sha256})),...(reusedResearch.length ? {reusedResearch} : {}),
    ...(previewEvidence.length ? {previewEvidence} : {}),...(onPackAudits.size ? {onPackAudits:Object.fromEntries(onPackAudits)} : {}),
    ...(readbackScope ? {readbackScope,reusedOriginalReads:images.filter((_,index)=>posterChecks[index]?.reused).map(image=>image.sha256)} : {}),
    selectionThread:selectionThreads[0],selectionThreads,blind,images:images.map(img=>img.sha256),votes,challenges,ruling,candidates,
    winner:winner?.candidate ?? null,...(repair ? {sloganRepair:{candidate:repair.candidate,observed:repair.blind.slogan}} : {})};
}
