import {taskKind} from './proposal-outline.mjs';

const string = {type:'string'};
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const list = (items, limits={}) => ({type:'array',items,...limits});
const exactlyThree = {minItems:3,maxItems:3};
const numbered = {type:'integer'};
const faces={front:/正面|正标|\bfront(?: panel| label)?\b/iu,side:/侧面|侧标|\bside(?: panel| label)?\b/iu,back:/背面|背标|\bback(?: panel| label)?\b/iu};
const basis = object({text:string,findingNumbers:list(numbered)});
const touchpointSchema = object({kind:{type:'string',enum:['front','side','back','kv','contact']},name:string,action:string});
const publicFields = {
  coreStrategy:string,insight:string,brandRole:string,proposition:string,
  actions:list(string,exactlyThree),touchpoints:list(touchpointSchema),
};
const schema = object({outcome:object({
    ...publicFields,
    metrics:list(object({name:string,method:string}),exactlyThree),
    constraints:string,opportunity:basis,decision:basis,priority:basis,intersection:string,
  })});

export function strategyCarrier(project, inputs) {
  const kinds={'包装':'packaging','KV':'kv','包装与KV':'packaging+kv'};
  const report = (project.artifacts ?? []).filter(a=>a.stage==='research' && a.kind==='text').at(-1);
  const body = inputs.texts.find(t=>t.name===report?.name)?.text ?? '';
  const recorded = body.match(/^## 检索前锚点\s+研究载体：(包装与KV|包装|KV|待明确)\s*$/mu)?.[1];
  const explicit = project.proposalKind;
  if (explicit==='packaging+kv') return explicit;
  if (explicit==='packaging' || explicit==='kv') return explicit;
  if (kinds[recorded]) return kinds[recorded];
  const brief = project.brief ?? '';
  const single = taskKind(brief,false);
  if (single) return single;
  const packaging = taskKind(brief.replace(/\bKV\b|主视觉|海报/giu,''),false);
  const kv = taskKind(brief.replace(/包装|瓶标|盒型|礼盒设计/gu,''),false);
  return packaging==='packaging' && kv==='kv' ? 'packaging+kv' : null;
}

const singleLine = value => typeof value==='string' && !!value.trim() && !/[\r\n]/u.test(value);
const distinct = values => new Set(values.map(s=>s.trim())).size===values.length;
const referenceList = (group,eligible) => {
  const numbers = group?.findingNumbers;
  if (!singleLine(group?.text) || !Array.isArray(numbers) || !numbers.length ||
      !numbers.every(n=>Number.isInteger(n) && eligible.has(n)) || new Set(numbers).size!==numbers.length)
    throw Error('推导依据须逐项引用本版已核研究的有效编号');
  return numbers;
};

// Strip only isolated reference markers; preserve source qualifiers that belong to the claim.
function customerText(value) {
  const clean=value.trim().replace(/[（(【\[]\s*(?:(?:研究(?:发现)?|发现|依据)\s*(?:#?\d+)(?:\s*[、,，/及和或至–—-]\s*(?:发现|研究)?\s*#?\d+)*)\s*[）)】\]]/gu,'').trim();
  if (!clean || /(?:模拟设定|项目设定|简报设定|未经核实|研究发现\s*#?\d+|发现\s*#?\d+|findingNumbers)/iu.test(clean))
    throw Error('客户栏只写可落地的内容，研究编号及模拟设定放在后台约束；不把未核实的利益改写为已证实');
  return clean;
}

function measurementText(value) {
  return customerText(value.replace(/^\s*(?:待测(?:指标|方法|口径)?|待验证)\s*[：:]\s*/u,'')
    .replace(/[（(](?:待测|待验证)[）)]\s*[。.]?$/u,'').trim());
}

// Editorial targets trigger a rewrite of the public fields, never a cut in the middle of a claim.
function compactnessIssue(out) {
  const lead = customerText(out.coreStrategy);
  const touchCopy = out.touchpoints.map(t => t.action);
  const body = [out.insight, out.brandRole, out.proposition, ...out.actions, ...touchCopy].map(customerText);
  const units = text => (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{Script=Latin}\p{N}]+|\p{L}/gu) || []).length;
  const normalized = text => text.replace(/[\p{P}\s]/gu,'').toLowerCase();
  if (units(lead)>36 || /[。！？!?].+\S/u.test(lead))
    return '大字句仍在铺陈，请只留下一个取舍及其用处，移走执行细节。';
  if (body.some(line=>units(line)>40))
    return '首页有过长的说明，请把每栏改成能一口气读完的短句。';
  if (!distinct([lead,...body].map(normalized)))
    return '首页重复了相同表述，请把动作与触点各自解决的问题分开。';
  return '';
}

export function strategyPackagingFaces(brief) {
  const all=Object.keys(faces);
  const text=brief ?? '';
  if (/全套包装|完整包装|包装全套|完整盒身|所有包装面|\ball (?:package )?panels\b/iu.test(text)) return all;
  const requested=text.split(/[。；;！？!?，,\n]/u).filter(clause=>
    /包装|外盒|礼盒|瓶标|标签|背标|packag(?:e|ing)|label|box/iu.test(clause) &&
    /做|设计|交付|改版|只|仅|限于|\b(?:design|deliver|only)\b/iu.test(clause) &&
    !/不做|不设计|不交付|不要/u.test(clause));
  const named=all.filter(face=>requested.some(clause=>faces[face].test(clause)));
  return named.length ? named : all;
}

function renderStrategy(out, findings, eligible, carrier, requiredFaces) {
  if (![out.coreStrategy,out.insight,out.brandRole,out.proposition,out.constraints,out.intersection].every(singleLine))
    throw Error('策略正文或事实边界不完整');
  if (!Array.isArray(out.actions) || out.actions.length!==3 || !out.actions.every(singleLine) || !distinct(out.actions))
    throw Error('核心主张需要三项不同的可执行动作');
  const touchpoints = out.touchpoints;
  if (!Array.isArray(touchpoints) || !touchpoints.length || !touchpoints.every(t=>singleLine(t.name) && singleLine(t.action)))
    throw Error('缺少载体触点与任务');
  const kinds = touchpoints.map(t=>t.kind);
  const kv = ['kv','packaging+kv'].includes(carrier);
  if (Object.keys(faces).some(k=>kinds.filter(i=>i===k).length!==(requiredFaces.includes(k)?1:0)) ||
      kinds.includes('kv')!==kv || !kinds.every(k=>carrier==='general' ? k==='contact' : Object.hasOwn(faces,k) || k==='kv') ||
      !distinct(touchpoints.map(t=>t.name))) throw Error('触点须覆盖'+[...requiredFaces,...(kv?['kv']:[]),...(carrier==='general'?['contact']:[])].join('、')+' 所指的委托版面或媒介');
  const metrics=out.metrics;
  if (!Array.isArray(metrics) || metrics.length!==3 || !metrics.every(m=>singleLine(m.name) && singleLine(m.method)) ||
      !distinct(metrics.map(m=>m.name)) || metrics.some(m=>/实测(?:显示|结果)|验证表明|测得|已(?:经)?(?:达到|提升|证实)/u.test(m.name+m.method)))
    throw Error('需给三项不同的待测指标与测量方法，不能填写实测结果');
  const groups=[out.opportunity,out.decision,out.priority];
  const findingNumbers=[...new Set(groups.flatMap(g=>referenceList(g,eligible)))];
  const sections=[
    '# 策略一页纸','## 核心策略',customerText(out.coreStrategy),'## 人群洞察',customerText(out.insight),'## 品牌角色',customerText(out.brandRole),
    '## 核心主张',customerText(out.proposition),out.actions.map(a=>'- '+customerText(a)).join('\n'),
    '## '+({general:'视觉与传播触点',packaging:'视觉与包装触点',kv:'视觉与 KV 触点','packaging+kv':'视觉与包装／KV 触点'}[carrier]),
    touchpoints.map(t=>'- '+customerText(t.name)+'：'+customerText(t.action)).join('\n'),'## 衡量方式',
    metrics.map(m=>'- '+measurementText(m.name)+'：'+measurementText(m.method)+'（待测）').join('\n'),'## 研究结论',
    findingNumbers.map(n=>{
      const f=findings[n-1];
      return '- 研究 '+n+'：'+f.conclusion.replace(/\s+/gu,' ').trim()+'（'+f.source.replace(/\s+/gu,' ').trim()+'）';
    }).join('\n'),
    '## 方向交叉点',out.intersection,'## 推导依据','- 产品与任务约束：'+out.constraints+'\n'+
      groups.map((g,i)=>'- '+['竞品资源与空隙','人群与决策链','触点优先级与取舍'][i]+'：'+g.text+'（研究 '+g.findingNumbers.join('、')+'）').join('\n'),
  ];
  return {body:sections.join('\n\n'),strategy:{findingNumbers,intersection:out.intersection,focus:customerText(out.coreStrategy)}};
}

export async function makeStrategyOnePager({call,project,inputs,carrier,rules,onEvent,signal}) {
  const findings=project.research?.findings ?? [];
  const rows=findings.flatMap((f,i)=>f && !f.visualOnly && [f.conclusion,f.source,f.evidence,f.implication].every(v=>typeof v==='string' && v.trim())
    ? [{...f,findingNumber:i+1}] : []);
  const eligible=new Set(rows.map(f=>f.findingNumber));
  if (!rows.length) throw Error('当前策略输入缺少可引用的研究记录');
  const requiredFaces=['packaging','packaging+kv'].includes(carrier) ? strategyPackagingFaces(project.brief) : [];
  const instruction='按本次载体完成夜航一页策略。general 表示载体未指定或其他提案，触点 kind 填 contact，按简报写传播任务。渠道未定时写条件性应用，不默认承诺包装或KV。核心策略只留一个简短、能读出选购场景和优先任务的句子；其余四节用客户听得懂的短句。行业上新数量支持设计取舍，不能推出消费者注意或记忆时长。不要将浏览量推成审美偏好或购买原因。约束回到简报和任务卡，明确价格、渠道、配料或功能、禁用与待核声称。机会、用户决策及触点优先级各引用对应研究的一基 findingNumber。给出一个有条件可验证的机会、替代解释/推翻条件和优先级取舍。以本案语言写具体的人、地点、动作、顾虑、真实品牌利益。洞察可描述选购时要解决的问题；未测的动机、关注顺序、是否看配料只作为设计要回答的问题，避免断言该人群已有某一行为。各触点分别承担辨认、确认用法或核对资料等不同任务，同一套信息仅在需要时重复。直接从本案简报、已核研究、产品事实和人群场景推导一句核心策略，说清优先放大什么、对用户有什么用。自由成句。每项视觉动作写元素、位置和阅读任务。包装只按 requiredFaces 填每个委托包装面一次，front 对应正面、side 对应侧面、back 对应背面。KV 每一项用 kv 并以真实媒介命名，联动同时覆盖且说明延续关系。三项指标逐项写测量场景、方法和计量口径。指标均待测，不生成测试成绩、实际因果、虚构阈值或客户批准。仅有依据证明的产品属性可作真实卖点，资料估计、品牌自述、推论与待测假设各自说明身份。禁止从无创作者原文的图倒推品牌意图。先检验本轮研究提出的条件性方向；渠道、执行细节和待测数据缺失，写入约束。直接提出本轮研究可以支撑的策略发力点。对客交稿前先提炼：核心策略一句只写本案最重要的取舍及对人的用处，以约30字为写作目标。移走与这项选择无关的条件清单。洞察只讲顾客的一个难题；角色只讲品牌能兑现什么；主张只讲一个产品理由。三个动作各用短句写一个可指认的变化。触点按实际媒介或包装面列，只补该处的阅读条件或任务。一个屏幕或一支短片只算一个媒介，开头、中段、结尾属于动作，勿在触点重写一遍。其他栏目每项一到两句，优先一句；每个事实只在它最有用的一处展开，保留必要限定。属性要紧跟它修饰的具体产品或原料，避免省词后变成另一种产品。未验证的用户顾虑用问题表达。详细指标、依据与推导写入原稿。客户栏只呈现事实和设计取舍，不写内部编号、脚注、模拟设定、材料身份复述或待测前后缀。把产品假设和声称边界集中写在 constraints，未经核实的利益不得转写成事实。指标直接命名并说明测量口径；程序统一在每项标注一次待测。一页策略各字段只写单行内容，标题由程序生成。';
  const productJudgments = project.research.sections?.filter(row=>row.chapter==='产品与品牌')
    .map(row=>({recommendation:row.conclusion+' '+row.explanation,findingIndices:row.evidenceIndices}));
  const advice=(productJudgments ?? project.research.strategyAdvice ?? []).flatMap(a=>{
    if (!Array.isArray(a.findingIndices) || !a.findingIndices.length) return [];
    const findingNumbers=a.findingIndices.map(i=>i+1);
    return findingNumbers.every(n=>eligible.has(n)) ? [{recommendation:a.recommendation,findingNumbers}] : [];
  });
  const context=JSON.stringify({carrier,requiredFaces,brief:project.brief,materials:inputs.texts,findings:rows,
    handoffScope:project.research?.conditional ? project.research.next : undefined,researchAdvice:advice,gaps:project.research?.gaps ?? [],feedback:project.feedback ?? []});
  let correction='';
  const render = draft => renderStrategy(draft,findings,eligible,carrier,requiredFaces);
  let out;
  for (let attempt=0;attempt<2;attempt++) {
    const response=await call(instruction+correction,inputs.images,schema,{rules,context,assignment:'依据本案简报和已核研究制定夜航一页策略。'});
    try {
      out=response.parsedOutput?.outcome ?? {};
      render(out);
      break;
    }
    catch(error) {
      if (attempt===1) throw error;
      correction='上次输出需修正：'+error.message;
    }
  }
  out=await compactStrategy(out,{call,project,carrier,render,onEvent,signal});
  return readStrategyPage(out,{call,render,onEvent,signal,brief:project.brief});
}

async function compactStrategy(out,{call,project,carrier,render,onEvent,signal}) {
  const issue=compactnessIssue(out);
  if (!issue) return out;
  await onEvent?.('比稿负责人正在精简策略页标题、动作和触点');
  const draft=Object.fromEntries(Object.keys(publicFields).map(key=>[key,out[key]]));
  try {
    const edit=await call('请作为同一负责人精简这份策略首页。'+issue+
      '保留原有策略取舍和事实限定，精简每个首页字段：核心策略约20–30字；洞察、角色、主张各一句；三个动作每条约15–25字，只保留画面中最重要的一处改变。'+
      '触点的 name 写原媒介或包装面，kind 须沿用原枚举；action 只补现场的一个阅读条件，一句约15–25字。把任何重复的镜头顺序从触点里删去。'+
      '保留已经选定给观众看的商业信息及其出现位置，例如标价或规格。每个属性须保留它修饰的对象，不把原来分属不同原料的属性拼成一个新词。尚未实测的购买动机要写成问题。来源、机位、字号等可留给底稿。输出 copy，字段结构见 schema。',
      [],object({copy:object(publicFields)}),{editorial:true,rules:[],assignment:'修改既有策略文稿的客户可见文字。',context:JSON.stringify({carrier,brief:project.brief,draft,constraints:out.constraints})});
    const copy=edit.parsedOutput?.copy;
    if (copy && Object.keys(publicFields).every(key=>Object.hasOwn(copy,key))) {
      const edited={...out,...Object.fromEntries(Object.keys(publicFields).map(key=>[key,copy[key]]))};
      render(edited);
      if (!compactnessIssue(edited)) return edited;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    await onEvent?.('策略精简未完成：'+error.message);
  }
  await onEvent?.('保留精简前已核对的策略稿');
  // A failed editorial edit cannot replace the validated original or its research handoff.
  return out;
}

// Only these strings are visible on the strategy sheet. Keep references, metrics and decisions
// outside the reader packet and outside the set of fields the owner can edit here.
async function readStrategyPage(out,{call,render,onEvent,signal,brief}) {
  const draft={...out,actions:[...out.actions],touchpoints:out.touchpoints.map(t=>({...t}))};
  const fields=[
    ['核心策略',draft,'coreStrategy'],['人群洞察',draft,'insight'],
    ['品牌角色',draft,'brandRole'],['核心主张',draft,'proposition'],
    ...draft.actions.map((_,i)=>['执行动作',draft.actions,i]),
    ...draft.touchpoints.flatMap(t=>[['触点名称',t,'name'],['触点说明',t,'action']]),
  ];
  const page=fields.map(([section,holder,key],i)=>({line:i+1,section,text:customerText(holder[key])}));
  const kinds=['拗口','歧义','不直观'];
  const issue=object({line:numbered,quote:string,kind:{type:'string',enum:kinds},difficulty:string});
  await onEvent?.('独立读者只看策略首页，检查哪些话拗口、容易误读或难以想象');
  const read=await call('第一次读这张策略页，按正常阅读顺序读。只标出真实的表达障碍：哪里念不顺，哪个词指代不清，或哪句话读完仍想象不出它描述的事。'+
    '每处填行号、该行连续原话、问题类型和你读到这里具体卡在哪；通顺就留空。不要评判策略、证据或优先级，不索要补充研究，不写新方案，也不打分。',
    [],object({issues:list(issue)}),{delegate:true,editorial:true,rules:[],assignment:'你是独立读者，只负责策略首页的表达盲读。',context:JSON.stringify({page})});
  const reported=read.parsedOutput?.issues;
  if (!Array.isArray(reported)) throw Error('表达盲读没有返回意见列表，请重试策略');
  const issues=reported.filter(i=>i && Number.isInteger(i.line) && singleLine(i.quote) &&
    page[i.line-1]?.text.includes(i.quote) && kinds.includes(i.kind) && singleLine(i.difficulty));
  if (issues.length<reported.length) await onEvent?.('已略过无法对应首页原句或阅读问题类型的意见');
  if (!issues.length) {
    if (!reported.length) await onEvent?.('独立读者未发现需要改措辞的地方');
    return render(out);
  }
  for (const i of issues) await onEvent?.('表达盲读 · '+page[i.line-1].section+' · “'+i.quote+'”｜'+i.difficulty);
  const changes=await reviseFlaggedLines(page,issues,{brief,constraints:out.constraints},call);
  for (const {line,after} of changes) {
    const [,holder,key]=fields[line-1];
    holder[key]=after;
  }
  signal?.throwIfAborted();
  let result;
  try {
    result=render(draft);
  } catch (error) {
    await onEvent?.('措辞修改与原稿要求不符，保留原稿：'+error.message);
    return render(out);
  }
  for (const {before,after} of changes) await onEvent?.('负责人修改措辞 · “'+before+'” → “'+after+'”');
  if (!changes.length) await onEvent?.('负责人核对盲读意见后保留原措辞');
  return result;
}

export async function reviseFlaggedLines(page,issues,boundaries,call) {
  const edit=object({line:numbered,operation:{type:'string',enum:['改说法','删片段']},original:string,replacement:string});
  const owner=await call('只处理独立读者指出的表达问题。原意明确就用日常语言说直白；讲清楚必须猜时，直接删去含糊的半句，留下原句中明确的判断。'+
    '读者的疑问只用来定位卡点。不要选取疑问里的某种解释当答案，也不要替顾客补动机、产品工艺、执行细节或新卖点。'+
    '先看客户原话和全页已经明确的取舍。仅是术语拗口或动作说得太省的，写成具体的日常动作；已明确的客户要求和信息先后顺序都要保住。只有无法确定原意的部分才删。'+
    '把客户明确要解决的问题与尚未确定的实现方式分开：只要问题本身已写在简报里，就把它照客户原话说清楚。无需选定具体机制，也不能把整个问题当作猜测删除。'+
    '同一个疑问若也出现在其他被指出的行，读整句时一并处理。只要被指出的同一行还有这类无据延伸，就可改整行，保留已有信息。'+
    '逐行返回最小可读修改。改说法：original 为原文中唯一可定位的连续片段，replacement 只改措辞，含义必须能从原句本身读出。'+
    '删片段：original 为应删的连续原文（连同多余的连接词或标点），replacement 必须为空。保留已给条件、数字、否定和待核限定。'+
    '读一遍修改后的整句，确认剩下的话完整自然。每行最多一项；没有合适改法就略过。',
    [],object({edits:list(edit)}),{editorial:true,rules:[],assignment:'你是原比稿负责人，决定哪些措辞值得修改。',
      context:JSON.stringify({page,issues,boundaries})});
  const edits=owner.parsedOutput?.edits;
  if (!Array.isArray(edits)) throw Error('负责人未返回表达修改结果，请重试策略');
  const flagged=new Set(issues.map(i=>i.line));
  const numbers=text=>(text.normalize('NFKC').match(/\d+(?:\.\d+)?/gu) ?? []).sort().join('|');
  const changes=[];
  for (const e of edits) {
    if (!e || !flagged.has(e.line) || !singleLine(e.original)) continue;
    const before=page[e.line-1].text;
    const start=before.indexOf(e.original);
    if (start<0 || before.indexOf(e.original,start+1)>=0) continue;
    const deleting=e.operation==='删片段' && e.replacement==='';
    const rewriting=e.operation==='改说法' && singleLine(e.replacement);
    if (!deleting && !rewriting) continue;
    const after=(before.slice(0,start)+e.replacement+before.slice(start+e.original.length)).trim();
    if (!/[\p{L}\p{N}]/u.test(after) || before===after || numbers(before)!==numbers(after)) continue;
    changes.push({line:e.line,before,after});
    flagged.delete(e.line);
  }
  return changes;
}
