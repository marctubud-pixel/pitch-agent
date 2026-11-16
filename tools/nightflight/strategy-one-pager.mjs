import {taskKind} from './proposal-outline.mjs';

const string = {type:'string'};
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const list = (items, limits={}) => ({type:'array',items,...limits});
const exactlyThree = {minItems:3,maxItems:3};
const numbered = {type:'integer'};
const basis = object({text:string,findingNumbers:list(numbered)});
const touchpointSchema = object({kind:{type:'string',enum:['front','side','back','kv','contact']},name:string,action:string});
const schema = object({outcome:object({
    coreStrategy:string,insight:string,brandRole:string,proposition:string,
    actions:list(string,exactlyThree),touchpoints:list(touchpointSchema),
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

function renderStrategy(out, findings, eligible, carrier) {
  if (![out.coreStrategy,out.insight,out.brandRole,out.proposition,out.constraints,out.intersection].every(singleLine))
    throw Error('策略正文或事实边界不完整');
  if (!Array.isArray(out.actions) || out.actions.length!==3 || !out.actions.every(singleLine) || !distinct(out.actions))
    throw Error('核心主张需要三项不同的可执行动作');
  const touchpoints = out.touchpoints;
  if (!Array.isArray(touchpoints) || !touchpoints.length || !touchpoints.every(t=>singleLine(t.name) && singleLine(t.action)))
    throw Error('缺少载体触点与任务');
  const kinds = touchpoints.map(t=>t.kind);
  const packaging = ['packaging','packaging+kv'].includes(carrier), kv = ['kv','packaging+kv'].includes(carrier);
  if (['front','side','back'].some(k=>kinds.filter(i=>i===k).length!==(packaging?1:0)) ||
      kinds.includes('kv')!==kv || !kinds.every(k=>carrier==='general' ? k==='contact' : ['front','side','back','kv'].includes(k)) ||
      !distinct(touchpoints.map(t=>t.name))) throw Error('触点未覆盖本案的包装面或实际 KV 媒介');
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

export async function makeStrategyOnePager({call,project,inputs,carrier,rules}) {
  const findings=project.research?.findings ?? [];
  const rows=findings.flatMap((f,i)=>f && !f.visualOnly && [f.conclusion,f.source,f.evidence,f.implication].every(v=>typeof v==='string' && v.trim())
    ? [{...f,findingNumber:i+1}] : []);
  const eligible=new Set(rows.map(f=>f.findingNumber));
  if (!rows.length) throw Error('当前策略输入缺少可引用的研究记录');
  const instruction='按本次载体完成夜航一页策略。general 表示载体未指定或其他提案，触点 kind 填 contact，按简报写传播任务。渠道未定时写条件性应用，不默认承诺包装或KV。核心策略只留一个简短、能读出选购场景和优先任务的句子；其余四节用客户听得懂的短句。行业上新数量支持设计取舍，不能推出消费者注意或记忆时长。不要将浏览量推成审美偏好或购买原因。约束回到简报和任务卡，明确价格、渠道、配料或功能、禁用与待核声称。机会、用户决策及触点优先级各引用对应研究的一基 findingNumber。给出一个有条件可验证的机会、替代解释/推翻条件和优先级取舍。以本案语言写具体的人、地点、动作、顾虑、真实品牌利益。洞察可描述选购时要解决的问题；未测的动机、关注顺序、是否看配料只作为设计要回答的问题，避免断言该人群已有某一行为。各触点分别承担辨认、确认用法或核对资料等不同任务，同一套信息仅在需要时重复。直接从本案简报、已核研究、产品事实和人群场景推导一句核心策略，说清优先放大什么、对用户有什么用。自由成句。每项视觉动作写元素、位置和阅读任务。包装用 front/side/back 三项，KV 每一项用 kv 并以真实媒介命名，联动同时覆盖且说明延续关系。三项指标逐项写测量场景、方法和计量口径。指标均待测，不生成测试成绩、实际因果、虚构阈值或客户批准。仅有依据证明的产品属性可作真实卖点，资料估计、品牌自述、推论与待测假设各自说明身份。禁止从无创作者原文的图倒推品牌意图。先检验本轮研究提出的条件性方向；渠道、执行细节和待测数据缺失，写入约束。直接提出本轮研究可以支撑的策略发力点。对客做减法：每个模块一到两句，核心策略优先一句；每个动作、触点和指标尽量一句一行，一项只讲一次。客户栏只呈现事实和设计取舍，不写内部编号、脚注、模拟设定、材料身份复述或待测前后缀。把产品假设和声称边界集中写在 constraints，未经核实的利益不得转写成事实。指标直接命名并说明测量口径；程序统一在每项标注一次待测。一页策略各字段只写单行内容，标题由程序生成。';
  const advice=(project.research.strategyAdvice ?? []).flatMap(a=>{
    if (!Array.isArray(a.findingIndices) || !a.findingIndices.length) return [];
    const findingNumbers=a.findingIndices.map(i=>i+1);
    return findingNumbers.every(n=>eligible.has(n)) ? [{recommendation:a.recommendation,findingNumbers}] : [];
  });
  const context=JSON.stringify({carrier,brief:project.brief,materials:inputs.texts,findings:rows,
    handoffScope:project.research?.conditional ? project.research.next : undefined,researchAdvice:advice,gaps:project.research?.gaps ?? [],feedback:project.feedback ?? []});
  let correction='';
  for (let attempt=0;attempt<2;attempt++) {
    const response=await call(instruction+correction,inputs.images,schema,{rules,context,assignment:'依据本案简报和已核研究制定夜航一页策略。'});
    try { return renderStrategy(response.parsedOutput?.outcome ?? {},findings,eligible,carrier); }
    catch(error) {
      if (attempt===1) throw error;
      correction='上次输出需修正：'+error.message;
    }
  }
}
