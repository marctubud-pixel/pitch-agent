import {taskKind} from './proposal-outline.mjs';

const string = {type:'string'};
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const list = (items, limits={}) => ({type:'array',items,...limits});
const exactlyThree = {minItems:3,maxItems:3};
const numbered = {type:'integer'};
const basis = object({text:string,findingNumbers:list(numbered)});
const touchpointSchema = object({kind:{type:'string',enum:['front','side','back','kv']},name:string,action:string});
const oldFrame = object({evidenceKind:{type:"string",enum:["品类表达","既有用途","用户理解"]},text:string,findingNumbers:list(numbered),evidenceReading:string,reasonToChange:string,newMeaning:string});
const selectionSchema = object({selection:{anyOf:[
  object({researchReturn:string}),
  object({candidates:list(oldFrame,{minItems:2,maxItems:3}),selected:numbered,tradeoff:string}),
]}});

const schema = object({outcome:{anyOf:[
  object({researchReturn:string}),
  object({
    coreStrategy:string,insight:string,brandRole:string,proposition:string,
    actions:list(string,exactlyThree),touchpoints:list(touchpointSchema),
    metrics:list(object({name:string,method:string}),exactlyThree),
    constraints:string,opportunity:basis,decision:basis,priority:basis,intersection:string,
  }),
]}});

export function strategyCarrier(project, inputs) {
  const kinds={'包装':'packaging','KV':'kv','包装与KV':'packaging+kv'};
  const report = (project.artifacts ?? []).filter(a=>a.stage==='research' && a.kind==='text').at(-1);
  const body = inputs.texts.find(t=>t.name===report?.name)?.text ?? '';
  const recorded = body.match(/^## 检索前锚点\s+研究载体：(包装与KV|包装|KV|待明确)\s*$/mu)?.[1];
  const explicit = project.proposalKind;
  if (recorded==='包装与KV' || explicit==='packaging+kv') return 'packaging+kv';
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

async function selectOldFrame(call,task,eligible) {
  const instruction='先比较A面，不写一页纸。从不同的实物、传播语境、真实用法或用户观察中找2–3种实质不同、有研究支撑的旧认知。逐项选择 evidenceKind。给 A 面注明证据身份。竞品物料或设计师说明支持「品类表达」，写清包装或传播在强调什么。单个案例只代表该案例，多案反复出现才可称常见。用途资料支持「既有用途」。只有直接调查或访谈记录了用户如何理解，才可写「用户理解」，且限定研究人群。B 面要连起产品事实、现场可见线索和接下来的选择：这个人在赶时间或其他真实约束下，能据此决定什么、少做哪一步？把这个用途写进核心句。尚未实测的行为收益作为设计目标，避免许诺节省时间或提升购买。每项text用可放进核心句的简短表述，findingNumbers引用外部发现，evidenceReading说明原证据实际显示什么；reasonToChange写清沿用这个认知会令谁在何时错过什么、为什么值得改变，若是判断请用条件句；newMeaning写产品条件在该场景让人感受到什么。用途、品类名称、字号、销量本身都不构成改变理由。选择前比较各案针对的问题、证据强弱和能否兑现，selected为候选的一基序号，tradeoff解释为何选它及其余各案为何暂缓。若项目给定了核心句，所选text用该句中从和变成之间的短语。资料不足以支持两个不同候选时，researchReturn写窄缺口，不凑近义词。';
  let correction='';
  for (let attempt=0;attempt<2;attempt++) {
    const response=await call(instruction+correction,[],selectionSchema,task);
    const slate=response.parsedOutput?.selection;
    if (singleLine(slate?.researchReturn)) return slate;
    try {
      if (!Array.isArray(slate?.candidates) || slate.candidates.length<2 || slate.candidates.length>3 ||
          !Number.isInteger(slate.selected) || !slate.candidates[slate.selected-1] || !singleLine(slate.tradeoff))
        throw Error('需要2–3个候选、有效选择序号和取舍理由');
      for (const frame of slate.candidates) {
        referenceList(frame,eligible);
        if (!["品类表达","既有用途","用户理解"].includes(frame.evidenceKind)) throw Error("请标明 A 面的证据身份");
        if (![frame.evidenceReading,frame.reasonToChange,frame.newMeaning].every(singleLine))
          throw Error('每项须交代证据范围、改变理由和用户可感的新意义');
      }
      if (!distinct(slate.candidates.map(c=>c.text))) throw Error('候选旧认知重复');
      return slate;
    } catch(error) {
      if (attempt===1) throw error;
      correction='请修复：'+error.message;
    }
  }
}

function renderStrategy(out, findings, eligible, carrier, slate) {
  if (Object.hasOwn(out,'researchReturn')) {
    if (!singleLine(out.researchReturn)) throw Error('退回研究时需写明具体补查问题');
    return {body:'# 策略待补\n\n'+out.researchReturn,researchReturn:out.researchReturn};
  }
  if (![out.coreStrategy,out.insight,out.brandRole,out.proposition,out.constraints,out.intersection].every(singleLine))
    throw Error('策略正文或事实边界不完整');
  const focus=customerText(out.coreStrategy);
  if (!/^把[^。！？]+?从[^。！？]+?[，,]?变成[^。！？]+[。！]?$/u.test(focus))
    throw Error('核心策略要用一句话把品类从具体旧认知变成特定场景里的新意义');
  const chosen=slate.candidates[slate.selected-1];
  const normalizeFrame=v=>v.replace(/[「」“”‘’『』，,\s]/gu,'');
  const frame=focus.slice(focus.indexOf('从')+1,focus.indexOf('变成'));
  if (normalizeFrame(frame)!==normalizeFrame(chosen.text)) throw Error('核心句 A 面须对应已选候选的原短语');
  if (!Array.isArray(out.actions) || out.actions.length!==3 || !out.actions.every(singleLine) || !distinct(out.actions))
    throw Error('核心主张需要三项不同的可执行动作');
  const touchpoints = out.touchpoints;
  if (!Array.isArray(touchpoints) || !touchpoints.length || !touchpoints.every(t=>singleLine(t.name) && singleLine(t.action)))
    throw Error('缺少载体触点与任务');
  const kinds = touchpoints.map(t=>t.kind);
  const packaging = carrier!=='kv', kv = carrier!=='packaging';
  if (['front','side','back'].some(k=>kinds.filter(i=>i===k).length!==(packaging?1:0)) ||
      kinds.includes('kv')!==kv || !kinds.every(k=>['front','side','back','kv'].includes(k)) ||
      !distinct(touchpoints.map(t=>t.name))) throw Error('触点未覆盖本案的包装面或实际 KV 媒介');
  const metrics=out.metrics;
  if (!Array.isArray(metrics) || metrics.length!==3 || !metrics.every(m=>singleLine(m.name) && singleLine(m.method)) ||
      !distinct(metrics.map(m=>m.name)) || metrics.some(m=>/实测(?:显示|结果)|验证表明|测得|已(?:经)?(?:达到|提升|证实)/u.test(m.name+m.method)))
    throw Error('需给三项不同的待测指标与测量方法，不能填写实测结果');
  const groups=[out.opportunity,out.decision,out.priority];
  const findingNumbers=[...new Set([...chosen.findingNumbers,...groups.flatMap(g=>referenceList(g,eligible))])];
  const sections=[
    '# 策略一页纸','## 核心策略',focus,'## 人群洞察',customerText(out.insight),'## 品牌角色',customerText(out.brandRole),
    '## 核心主张',customerText(out.proposition),out.actions.map(a=>'- '+customerText(a)).join('\n'),
    '## '+({packaging:'视觉与包装触点',kv:'视觉与 KV 触点','packaging+kv':'视觉与包装／KV 触点'}[carrier]),
    touchpoints.map(t=>'- '+customerText(t.name)+'：'+customerText(t.action)).join('\n'),'## 衡量方式',
    metrics.map(m=>'- '+measurementText(m.name)+'：'+measurementText(m.method)+'（待测）').join('\n'),'## 研究结论',
    findingNumbers.map(n=>{
      const f=findings[n-1];
      return '- 研究 '+n+'：'+f.conclusion.replace(/\s+/gu,' ').trim()+'（'+f.source.replace(/\s+/gu,' ').trim()+'）';
    }).join('\n'),
    '## A 面候选与取舍',...slate.candidates.map((c,i)=>
      (i+1)+'. '+c.text+'（'+c.evidenceKind+'，研究 '+c.findingNumbers.join('、')+'）\n依据：'+c.evidenceReading+'\n为什么值得改变：'+c.reasonToChange+'\n用户能感受到什么：'+c.newMeaning),
    '选中第 '+slate.selected+' 项。'+slate.tradeoff,
    '## 方向交叉点',out.intersection,'## 推导依据','- 产品与任务约束：'+out.constraints+'\n'+
      groups.map((g,i)=>'- '+['竞品资源与空隙','人群与决策链','触点优先级与取舍'][i]+'：'+g.text+'（研究 '+g.findingNumbers.join('、')+'）').join('\n'),
  ];
  return {body:sections.join('\n\n'),researchReturn:'',strategy:{findingNumbers,intersection:out.intersection,focus}};
}

export async function makeStrategyOnePager({call,project,inputs,carrier,rules}) {
  const findings=project.research?.findings ?? [];
  const rows=findings.flatMap((f,i)=>f && !f.visualOnly && [f.conclusion,f.source,f.evidence,f.implication].every(v=>typeof v==='string' && v.trim())
    ? [{...f,findingNumber:i+1}] : []);
  const eligible=new Set(rows.map(f=>f.findingNumber));
  if (project.research?.ready!==true || !rows.length) {
    const gap=project.research?.next || '请补查目标人群在实际接触场景中的选择依据，交回一条能与产品条件对应的已核发现。';
    return {body:'# 策略待补\n\n'+gap,researchReturn:gap};
  }
  const instruction='按本次载体完成一页策略及后台依据。约束回到简报和任务卡，明确价格、渠道、配料或功能、禁用与待核声称。机会、用户决策及触点优先级各引用对应研究的一基 findingNumber。给出一个有条件可验证的机会、替代解释/推翻条件和优先级取舍。以本案语言写具体的人、地点、动作、顾虑、真实品牌利益。洞察可描述选购时要解决的问题；未测的动机、关注顺序、是否看配料只作为设计要回答的问题，避免断言该人群已有某一行为。各触点分别承担辨认、确认用法或核对资料等不同任务，同一套信息仅在需要时重复。核心策略固定为一句「把[品类]从[旧认知]，变成[真实场景中的新意义]」。从已核传播或用户给定定位中找A面，不虚构消费者厌烦或竞品动机；从产品真相、场景与日常感受中找B面。打磨掉产品说明书和抽象形容词。有用户给定定稿时沿用原句。逐栏核对：洞察写这个具体的人为什么需要新意义；角色说明品牌如何兑现；主张把承诺转成三个可见动作；第一接触面必须能当场兑现首要承诺。四栏各自写不同的信息，读起来像给客户讲方案。每项视觉动作写元素、位置和阅读任务。包装用 front/side/back 三项，KV 每一项用 kv 并以真实媒介命名，联动同时覆盖且说明延续关系。三项指标逐项写测量场景、方法和计量口径。指标均待测，不生成测试成绩、实际因果、虚构阈值或客户批准。仅有依据证明的产品属性可作真实卖点，资料估计、品牌自述、推论与待测假设各自说明身份。禁止从无创作者原文的图倒推品牌意图。只在没有依据作核心取舍时返回 researchReturn，其中说明影响取舍的窄问题。对客做减法：每个模块一到两句，核心策略优先一句；每个动作、触点和指标尽量一句一行，一项只讲一次。客户栏只呈现事实和设计取舍，不写内部编号、脚注、模拟设定、材料身份复述或待测前后缀。把产品假设和声称边界集中写在 constraints，未经核实的利益不得转写成事实。指标直接命名并说明测量口径；程序统一在每项标注一次待测。一页策略各字段只写单行内容，标题由程序生成。';
  const advice=(project.research.strategyAdvice ?? []).flatMap(a=>{
    if (!Array.isArray(a.findingIndices) || !a.findingIndices.length) return [];
    const findingNumbers=a.findingIndices.map(i=>i+1);
    return findingNumbers.every(n=>eligible.has(n)) ? [{recommendation:a.recommendation,findingNumbers}] : [];
  });
  const packet={carrier,brief:project.brief,materials:inputs.texts,findings:rows,
    researchAdvice:advice,gaps:project.research?.gaps ?? [],feedback:project.feedback ?? []};
  const external=new Set(rows.filter(r=>r.chapter!=='产品与品牌').map(r=>r.findingNumber));
  const slate=await selectOldFrame(call,{rules,assignment:'策略负责人：先比较旧认知',context:JSON.stringify(packet)},external);
  if (slate.researchReturn) return {body:'# 策略待补\n\n'+slate.researchReturn,researchReturn:slate.researchReturn};
  const context=JSON.stringify({...packet,oldFrameSelection:slate});
  let correction='';
  for (let attempt=0;attempt<2;attempt++) {
    const response=await call(instruction+'核心句从和变成之间沿用oldFrameSelection选中项的text原短语，保留选中项的证据身份；B面用一句日常话落在具体选择或省下的动作，看见或知道信息只是中间一步。'+correction,inputs.images,schema,{rules,context,assignment:'依据同版已核研究制定本案包装或 KV 的一页策略。'});
    try { return renderStrategy(response.parsedOutput?.outcome ?? {},findings,eligible,carrier,slate); }
    catch(error) {
      if (attempt===1) throw error;
      correction='上次输出需修正：'+error.message;
    }
  }
}
