import {invalidOutput} from './call-checkpoints.mjs';
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

export async function reviewVisualBatch({call, direction, images, context, packagingExpected, theme, posterSlogan, sources = [], brandReferences = [], findComparators, makeBoard}) {
  if (images.length !== 3 || new Set(images.map(img => img.sha256)).size !== 3) throw invalidOutput('同方向需要三张不同的主视觉原图');
  const blindFields = ['first','action','words','alternative'];
  const properties = Object.fromEntries(blindFields.map(k=>[k,text]));
  if (posterSlogan) properties.slogan=sloganSchema;
  const blindSchema = {type:'object',additionalProperties:false,properties,required:Object.keys(properties)};
  const blindInstruction = '只看这张原图。第一眼看到什么？画面里发生什么动作？哪些信息靠读字才知道？还有什么合理的读法？逐项用自己的话回答。';
  const transcribe = ' 另外单独填 slogan。按阅读顺序逐字抄写海报主标题，保留字词、数字、标点和实际换行，只抄实际看见的内容。把可见位置写入 location。区分海报主标题、画面里的包装印字、品牌标志和时间地点。能读完整填 readable；没有主标题填 missing，位置可以留空；有字看不清填 unreadable 并只抄看清的片段。';
  const blind = [];
  for (const image of images) {
    const result = await call(blindInstruction+(posterSlogan ? transcribe : ''),
      [{...image,imageId:'anonymous'}],blindSchema,{delegate:true,rules:[],assignment:'独立读图者',context:'仅本张图片，保留图上文字。'});
    const words = result.parsedOutput;
    if (!blindFields.every(k=>typeof words?.[k]==='string' && words[k].trim())) throw invalidOutput('匿名盲读原话不完整');
    const observed = words.slogan;
    if (posterSlogan && (!sloganStatuses.includes(observed?.status) || typeof observed.text!=='string' || typeof observed.location!=='string' ||
      (observed.status==='readable' && (!observed.text.trim() || !observed.location.trim())))) {
      throw invalidOutput('海报需要逐字记录看见的主标题和位置，缺失或无法读清时请如实标记。');
    }
    blind.push({...words,sha256:image.sha256,thread:result.threadId,...(result.model ? {model:result.model} : {})});
  }
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
  const votes = [], challenges = [];
  const duties = packaging ? {用户:'卖点动作、误读、哪些只能靠读字',传播:'同类并排辨识度及能否认回品牌',品牌:'逐张看实际包装本体的印字，引用可见原话与位置。核对品牌、品类、规格等产品信息的层级，以及方向名或主题 slogan 有无落在本体，区分盒身、价签和场景标题',视觉:'逐对核对原创转译、成套相似性与小尺寸完成度'} : {用户:'目标受众理解与可行性',传播:'传播场景、记忆及差异',品牌:'品牌匹配和主题表达',视觉:'美术、构图与视觉层级'};
  for (const role of roles) {
    const checksPackagingText = packaging && role === '品牌';
    const placement = checksPackagingText ? '。onPackStatus：可核实且符合简报及产品资料填 verified，印上方向名或主题句填 theme_printed，存在其他字样错误或把价签等触点文字误印在本体填 text_mismatch，盒身文字或位置看不清填 unverified。reason 要写可见字样及位置' : '';
    const fields = {score:numeric,...(checksPackagingText ? {onPackStatus:{...text,enum:onPackStatuses}} : {})};
    const reviewInput = checksPackagingText ? JSON.stringify({本案主题仅用于设计:theme}) : role==='用户' ? JSON.stringify(blind) : '';
    const report = await read(role+'独立评分岗', '对每张图给一个 1–5 整数整体分，按本岗责任：'+duties[role]+placement+'。同分也要说明差异，写可定位的依据。', fields, reviewInput);
    if (!report.items.every(row => Number.isInteger(row.score) && row.score >= 1 && row.score <= 5)) throw invalidOutput('主视觉原票分数无效');
    if (checksPackagingText && !report.items.every(row=>onPackStatuses.includes(row.onPackStatus))) throw invalidOutput('品牌原票缺少包装文字核验。');
    votes.push({role,...report});
  }
  for (const role of roles) {
    const independent = await read(role+'独立对抗岗', '从本岗职责逐图独立找漏项：'+duties[role]+'。不评分。', {});
    const checked = await read(role+'对抗核查岗', '结合独立发现逐项核查对应原票，列证据及仍成立的问题，不评分。', {},
      JSON.stringify({独立发现:independent.items,原票:votes.find(v=>v.role===role).items}));
    challenges.push({role,independent,...checked});
  }
  const ruling = await read('独立视觉总监', '逐图裁定原票及对抗意见。仍有成立硬伤或关键未知时 blocked 为 true；reason 写取舍理由、保留处和具体修改建议。为三张图给互不重复的优先次序 priority（1 最优），只用于合格同分时决胜。不得改分。edit 写具体部位与改法；research 写需补的实景、来源或产品资料。没有待办填无。素材不足须说明。',
    {blocked:{type:'boolean'},priority:numeric,edit:text,research:text}, JSON.stringify({votes,challenges,blind}));
  if (!ruling.items.every(row=>typeof row.blocked==='boolean' && row.edit?.trim() && row.research?.trim()) || ![1,2,3].every(n=>ruling.items.some(row=>row.priority===n))) throw invalidOutput('主视觉总监裁定不完整');
  const candidates = ruling.items.map(row => {
    const scores = votes.map(v=>({role:v.role,...v.items.find(i=>i.candidate===row.candidate)}));
    const brand = scores.find(v=>v.role==='品牌');
    const printIssue = packaging ? onPackIssues[brand.onPackStatus] : undefined;
    const reading = blind[row.candidate-1];
    const posterIssue = posterSlogan ? sloganIssue(posterSlogan, reading.slogan) : '';
    return {...row,blocked:row.blocked || missing || !!printIssue || !!posterIssue,
      reason:posterIssue || (printIssue ? printIssue+brand.reason : row.reason),
      edit:posterIssue ? '在海报主标题位置清楚排入本轮原句「'+posterSlogan+'」，逐字核对。' : row.edit,
      research:missing?'补充同类包装正面原图。'+(row.research==='无'?'':row.research):row.research,blind:reading,scores,mean:scores.reduce((sum,v)=>sum+v.score,0)/roles.length};
  });
  const winner = candidates.filter(c=>!c.blocked && c.mean>=4).sort((a,b)=>b.mean-a.mean || a.priority-b.priority)[0];
  return {direction,packaging,...(posterSlogan ? {posterSlogan} : {}),board:board?.name,references:references.map(ref=>({name:ref.name,sha256:ref.sha256})),selectionThread:selectionThreads[0],selectionThreads,blind,images:images.map(img=>img.sha256),votes,challenges,ruling,candidates,winner:winner?.candidate ?? null};
}
