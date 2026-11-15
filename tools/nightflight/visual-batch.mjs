const roles = ['视觉', '品牌', '用户', '传播'];
const numeric = { type: 'integer' }, text = { type: 'string' };
function schema(fields) {
  const properties = { candidate: numeric, reason: text, ...fields };
  return {type:'object', additionalProperties:false, required:['items'], properties:{
    items:{type:'array',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}
  }};
}

export async function reviewVisualBatch({call, direction, images, context}) {
  if (images.length !== 3 || new Set(images.map(img => img.sha256)).size !== 3) throw Error('同方向需要三张不同的主视觉原图');
  const rules = ['仅看本次提供的三张真实图片，按传入顺序编号 1、2、3，不生成图片。每项说明图上可定位的依据。'];
  async function read(assignment, instruction, fields, extra = '') {
    const result = await call(instruction, images, schema(fields), {rules, assignment, context: context + '\n本批方向：' + direction + extra});
    const rows = result.parsedOutput?.items;
    if (rows?.length !== 3 || ![1,2,3].every(n => rows.some(row => row.candidate === n && row.reason?.trim()))) {
      throw Error('主视觉评审未逐张交回三份可核对意见');
    }
    return {thread: result.threadId, items: rows};
  }
  const votes = [], challenges = [];
  for (const role of roles) {
    const report = await read(role+'独立评分岗', '对每张图给一个 1–5 整数整体分，依据本职说明形式完成度、表达价值、创意贡献及最需修正的问题。列明硬伤与关键未知。', {score:numeric});
    if (!report.items.every(row => Number.isInteger(row.score) && row.score >= 1 && row.score <= 5)) throw Error('主视觉原票分数无效');
    votes.push({role,...report});
  }
  for (const role of roles) {
    const independent = await read(role+'独立对抗岗', '逐图独立找可能漏掉的问题，不评分。', {});
    const checked = await read(role+'对抗核查岗', '结合独立发现逐项核查对应原票，列证据及仍成立的问题，不评分。', {},
      JSON.stringify({独立发现:independent.items,原票:votes.find(v=>v.role===role).items}));
    challenges.push({role,independent,...checked});
  }
  const ruling = await read('独立视觉总监', '逐图裁定原票及对抗意见。仍有成立硬伤或关键未知时 blocked 为 true；reason 写取舍理由、保留处和具体修改建议。为三张图给互不重复的优先次序 priority（1 最优），只用于合格同分时决胜。不得改分。',
    {blocked:{type:'boolean'},priority:numeric}, JSON.stringify({votes,challenges}));
  if (!ruling.items.every(row=>typeof row.blocked==='boolean') || ![1,2,3].every(n=>ruling.items.some(row=>row.priority===n))) throw Error('主视觉总监裁定不完整');
  const candidates = ruling.items.map(row => {
    const scores = votes.map(v=>({role:v.role,...v.items.find(i=>i.candidate===row.candidate)}));
    return {...row,scores,mean:scores.reduce((sum,v)=>sum+v.score,0)/roles.length};
  });
  const winner = candidates.filter(c=>!c.blocked && c.mean>=4).sort((a,b)=>b.mean-a.mean || a.priority-b.priority)[0];
  return {direction,images:images.map(img=>img.sha256),votes,challenges,ruling,candidates,winner:winner?.candidate ?? null};
}
