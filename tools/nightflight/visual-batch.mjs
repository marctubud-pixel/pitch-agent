import {invalidOutput} from './call-checkpoints.mjs';
const roles = ['视觉', '品牌', '用户', '传播'];
const numeric = { type: 'integer' }, text = { type: 'string' };
function schema(fields) {
  const properties = { candidate: numeric, reason: text, ...fields };
  return {type:'object', additionalProperties:false, required:['items'], properties:{
    items:{type:'array',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}
  }};
}

export async function reviewVisualBatch({call, direction, images, context, sources = [], findComparators, makeBoard}) {
  if (images.length !== 3 || new Set(images.map(img => img.sha256)).size !== 3) throw invalidOutput('同方向需要三张不同的主视觉原图');
  const blindFields = ['first','action','words','alternative'];
  const blindSchema = {type:'object',additionalProperties:false,properties:Object.fromEntries(blindFields.map(k=>[k,text])),required:blindFields};
  const blind = [];
  for (const image of images) {
    const result = await call('只看这张原图。第一眼看到什么？画面里发生什么动作？哪些信息靠读字才知道？还有什么合理的读法？逐项用自己的话回答。',
      [{...image,imageId:'anonymous'}],blindSchema,{delegate:true,rules:[],assignment:'独立读图者',context:'仅本张图片，保留图上文字。'});
    const words = result.parsedOutput;
    if (!blindFields.every(k=>typeof words?.[k]==='string' && words[k].trim())) throw invalidOutput('匿名盲读原话不完整');
    blind.push({sha256:image.sha256,thread:result.threadId,...words});
  }
  const references = [], selectionThreads = [];
  let packaging;
  // Three candidates and one comparison board leave four places for original comparators.
  async function assessSources(pool) {
    for (let offset=0; offset<Math.max(pool.length,1) && references.length<4; offset+=4) {
      const group=pool.slice(offset,offset+4);
      const selection = await call('根据本案载体和图片内容判定是否为包装任务。仅选择与本方向同品类、可见包装正面的独立商品参考；排除本案原稿、标志、跨行业技法与非商品图。按适用性排序，用从1开始的原图序号返回，无合适图时返回空数组。',
        group,{type:'object',additionalProperties:false,properties:{packaging:{type:'boolean'},indices:{type:'array',items:numeric}},required:['packaging','indices']},
        {delegate:true,rules:[],assignment:'核对同类参考',context:context+' 当前方向：'+direction+' 输入图片按序：'+JSON.stringify(group.map(s=>s.name))});
      const result = selection.parsedOutput;
      if (typeof result?.packaging!=='boolean' || (packaging!==undefined && packaging!==result.packaging) || !Array.isArray(result.indices) ||
        !result.indices.every(i=>Number.isInteger(i)&&i>0&&i<=group.length) || new Set(result.indices).size!==result.indices.length) throw invalidOutput('同类参考指向无效');
      packaging=result.packaging;
      selectionThreads.push(selection.threadId);
      for (const i of result.indices) {
        if (references.length<4 && !references.some(s=>s.sha256===group[i-1].sha256)) references.push(group[i-1]);
      }
    }
  }
  await assessSources(sources);
  if (packaging && !references.length && findComparators) {
    const extra=await findComparators();
    if (extra.length) await assessSources(extra);
  }
  const missing = packaging && !references.length;
  const board = references.length ? await makeBoard(images,references) : null;
  const packet = [...images,...references,...(board?[board]:[])];
  const rules = ['候选为第1至3张，仅给候选评分。'+(board?'其后是同类原图，最后一张是同序等框缩图。逐对定位相似与不同，区分单图和并排可见性。参考顺序：'+references.map(r=>r.name).join('、')+'。':'本批没有可用同类包装，不得推断已完成同类对照。')];
  async function read(assignment, instruction, fields, extra = '') {
    const result = await call(instruction, packet, schema(fields), {delegate:true,rules, assignment, comparison:!!board, context: context + '\n本批方向：' + direction + extra});
    const rows = result.parsedOutput?.items;
    if (rows?.length !== 3 || ![1,2,3].every(n => rows.some(row => row.candidate === n && row.reason?.trim()))) {
      throw invalidOutput('主视觉评审未逐张交回三份可核对意见');
    }
    return {thread: result.threadId, items: rows};
  }
  const votes = [], challenges = [];
  const duties = packaging ? {用户:'卖点动作、误读、哪些只能靠读字',传播:'同类并排辨识度及能否认回品牌',品牌:'品牌、品类、水源等产品信息主次，提案方向名不可自动印上包装',视觉:'逐对核对原创转译、成套相似性与小尺寸完成度'} : {用户:'目标受众理解与可行性',传播:'传播场景、记忆及差异',品牌:'品牌匹配和主题表达',视觉:'美术、构图与视觉层级'};
  for (const role of roles) {
    const report = await read(role+'独立评分岗', '对每张图给一个 1–5 整数整体分，按本岗责任：'+duties[role]+'。同分也要说明差异，写可定位的依据。', {score:numeric},role==='用户'?JSON.stringify(blind):'');
    if (!report.items.every(row => Number.isInteger(row.score) && row.score >= 1 && row.score <= 5)) throw invalidOutput('主视觉原票分数无效');
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
    return {...row,blocked:row.blocked || missing,research:missing?'补充同类包装正面原图。'+(row.research==='无'?'':row.research):row.research,blind:blind[row.candidate-1],scores,mean:scores.reduce((sum,v)=>sum+v.score,0)/roles.length};
  });
  const winner = candidates.filter(c=>!c.blocked && c.mean>=4).sort((a,b)=>b.mean-a.mean || a.priority-b.priority)[0];
  return {direction,packaging,board:board?.name,references:references.map(ref=>({name:ref.name,sha256:ref.sha256})),selectionThread:selectionThreads[0],selectionThreads,blind,images:images.map(img=>img.sha256),votes,challenges,ruling,candidates,winner:winner?.candidate ?? null};
}
