import {syntheticStrategyV2} from './strategy-fixtures.mjs';

// Explicit, opt-in engineering fixture. It is not research or brand approval.
const cases={
 m6:{identity:/梦之蓝|M6\+/i,title:'梦之蓝 M6+ 春节品牌 KV 策略 · 本地合成示例',question:'如何以通用春节品牌 KV 表达梦之蓝 M6+ 的新年祝愿，并兼顾赠礼与家庭聚餐场景？',
 circles:['春节品牌传播与竞品的真实表达尚需调研；先以团圆祝愿作为待验证的创意起点。','以 M6+ 产品轮廓和“梦”的品牌语言探索新年开启，具体品牌资产使用须核对。','面向任务所述的 30–50 岁送礼者与家庭聚餐购买者，探索祝愿和相聚的表达，并不推定偏好。'],
 gaps:['缺少春节品牌传播和竞品的真实调研。','缺少已核验品牌资产及产品呈现规范。','缺少目标人群对祝愿、赠礼和聚餐表达的真实反馈。'],
 cuts:[['万家灯火，同圆新梦','以万家灯火和圆形关系组织团圆祝愿，形成稳健的春节品牌画面。','用灯火汇聚的视觉秩序承载祝愿，不要求以桌前单瓶作为唯一主体。'],['以梦为门，开启新年','以 M6+ 产品轮廓构成通向新年的门，突出品牌和产品特征。','让产品轮廓成为启新之门，连接品牌的“梦”与新年开启。'],['把新年的梦，郑重相赠','以赠礼动作和祝愿的递送表达郑重的情绪。','用礼物与祝愿之间的关系表现心意，不依赖家庭人物或餐桌海报。']],
 answer:'建议先探索“万家灯火，同圆新梦”：让灯火汇聚成团圆的视觉关系，将 M6+ 放入春节祝愿语境；产品启新之门与郑重赠礼作为两条不同机制的备选。三案均为条件性创意，实际人群反应与品牌资产须另行验证。'},
 dexian:{identity:/得闲/,title:'得闲社交包装策略 · 本地合成示例',question:'如何以包装表达得闲面向 25 岁社交使用的轻松相聚，同时保留产品规格待定的边界？',
 circles:['社交包装市场和竞品的实际表现尚需调研；先探索邀请与相聚的表达。','将“得闲”作为发出邀请的品牌语言，包装结构和产品规格仍须确认。','围绕任务所述的 25 岁社交使用，探索轻松坐下与不赶场的氛围，不推定真实偏好。'],
 gaps:['缺少社交包装市场和竞品的真实调研。','度数、容量、价格及包装结构可行性尚未确认。','缺少使用场景和用户反应的真实调研。'],
 cuts:[['得闲，坐一桌','以共同落座的桌面秩序表达轻松社交，作为稳健方向。','用圆桌式阅读顺序将包装信息聚合，邀请大家坐下交流。'],['提起得闲，就有约','以可携带的轮廓和邀请卡关系探索品牌特征。','将提起包装与发出邀约相连，提携结构仅为待验证概念。'],['今晚，不赶场','以舒展留白和从容节奏表达社交氛围。','通过文字节奏与空间关系呈现不赶场的情绪，不作产品功效暗示。']],
 answer:'建议先探索“得闲，坐一桌”：用桌面秩序组织包装信息，把轻松坐下聊天转为可见的邀请；可携带邀约与不赶场氛围作为不同机制的备选。三案均为条件性创意，规格、结构与用户反应须另行验证。'}
};
const acceptedBriefs={m6:['梦之蓝 M6+ 通用春节品牌 KV，面向 30–50 岁送礼者及家庭聚餐购买者，不使用年生肖。','梦之蓝 M6+ 通用春节品牌 KV，面向 30—50 岁送礼者与家庭聚餐购买者，不绑定年份或生肖。','梦之蓝M6+通用春节品牌KV，30—50岁送礼者和家庭聚餐购买者，不绑定年份与生肖。本地工程测试，非真实调研。'],dexian:['得闲包装，25 岁社交使用，轻松社交和轻负担为品牌表达。度数、容量、价格及购买者未定。','得闲社交型白酒包装，面向 25 岁年轻人的社交使用。“轻型”指轻松社交、轻负担的品牌表达，度数等未确认信息保持未定。','得闲白酒包装，25岁年轻人轻松社交使用；轻负担为品牌表达，度数未定。竞品中可参考梦之蓝M6+，本地工程测试，非真实调研。']};
export function isAcceptedLocalCaseTask(profile,task){
 return typeof profile==='string'&&Object.hasOwn(acceptedBriefs,profile)&&typeof task?.id==='string'&&task.id.length>0&&acceptedBriefs[profile].includes(task.brief);
}
export function createLocalCaseStrategyHandler(profile){
 const selected=Object.hasOwn(cases,profile)?cases[profile]:undefined;

 return ({job,packet})=>{
  const basis=packet?.strategyBasis;
  if(!selected||job?.stage!=='strategy'||(job.purpose&&job.purpose!=='stage')||job.task?.revisionInput||!isAcceptedLocalCaseTask(profile,basis?.taskCard)||!basis.confirmations?.some(c=>c.taskCardId===basis.taskCard.id))return undefined;
  const out=syntheticStrategyV2(packet),s=out.strategy;
  const limit='本地合成创意假设，非真实研究、消费者验证或品牌批准；不得推断用户偏好、行业趋势或产品功效。';
  const keys=['industryCompetitor','brandProduct','userUsage'];
  out.title=selected.title;out.summary='基于确认任务组织三条表达机制；证据缺口保留，供本地工程验收。';out.gaps=selected.gaps;
  s.coreQuestion.text=selected.question;s.coreQuestion.decisionNeeded='选择优先探索的表达机制，并明确后续验证范围。';s.coreQuestion.scopeLimits=[limit];
  keys.forEach((key,i)=>{out.claims[i].text=selected.circles[i];out.claims[i].limitations=[limit];s.circles[key].summary=selected.circles[i];s.circles[key].gaps=[{description:selected.gaps[i],effect:'conditional',trigger:'取得与本任务相关的原始资料或明确确认后再核验。',prohibitedUse:limit}];});
  s.intersection.text='从确认任务出发，把行业与用户证据缺口、品牌表达和使用场景放在一起，提出三条互不相同且待验证的创意机制。';s.intersection.limitations=[limit];
  const findingIds=keys.map((_,i)=>`finding-${i}`),claimIds=keys.map((_,i)=>`claim-${i}`);
  s.candidateCuts=selected.cuts.map(([title,proposition,mechanism],i)=>({id:`cut-${i}`,title,proposition,mechanism,findingIds,claimIds,permittedUse:['仅用于本地概念探索与后续验证。'],prohibitedInferences:[limit],limitations:[limit],disposition:'conditional'}));
  const cutIds=s.candidateCuts.map(c=>c.id);
  s.reasoning.steps=[{id:'step-start',role:'premise',text:'先读取已确认任务，并将未验证的行业、品牌与用户问题保留为缺口。',findingIds,claimIds,candidateIds:[],priorStepIds:[],limitations:[limit]},{id:'step-final',role:'synthesis',text:'比较稳健表达、品牌或产品特征、用户氛围三种机制，优先探索第一条，其余作为备选。',findingIds,claimIds,candidateIds:cutIds,priorStepIds:['step-start'],limitations:[limit]}];
  s.answer={questionId:'core-question',text:selected.answer,recommendedCutId:'cut-0',claimIds,stepIds:['step-final'],limitations:[limit],decision:'conditional_exploration'};
  return out;
 };
}
