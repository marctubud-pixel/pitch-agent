// Store the editable Markdown alongside verbatim evidence. The two display
// sections are written here, so the model cannot rename or duplicate them.
const labels=['提案任务','品牌','产品与品类','目标人群','价格','渠道','规格','时间','预算','其他项目条件','产品卖点与亮点','客户当前判断','硬性设计要求'];
const str={type:'string'};
const list=items=>({type:'array',items});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const carriers=['kv','packaging','tvc','activity'];
const statuses=['accepted','unclear','unsupported'];
export function validBriefScope(scope){
  return scope && statuses.includes(scope.status) && typeof scope.reason==='string' && scope.reason.trim() &&
    Array.isArray(scope.types) && scope.types.every(type=>carriers.includes(type)) &&
    new Set(scope.types).size===scope.types.length && (scope.status==='accepted' ? scope.types.length>0 : scope.types.length===0);
}
const schema=object({
  briefScope:object({status:{type:'string',enum:statuses},types:list({type:'string',enum:carriers}),reason:str}),
  facts:list(object({label:{type:'string',enum:labels},value:str,quote:str})),
  unknowns:list(object({issue:str,impact:str,assumption:str})),
});
const instruction='先从原话、附件和后续补充理解客户实际委托，最新明确的改述优先。仅承接 KV 主视觉（含海报、主画面）、包装设计、TVC 广告片（含品牌或产品短片）、活动策划四类提案，可组合。按客户要求交付的东西和使用场景判断，不要求术语；产品已有包装、举例、投放渠道、明确排除的载体不能误当委托。不要因泛称“宣传、推广、设计、提案”或系统默认选项猜测载体。能明确归入支持范围时 briefScope.status 为 accepted，types 列全对应英文值，reason 用中文简述依据。意图不清时为 unclear，明确委托范围外的交付时为 unsupported；若同时委托范围外的独立交付，请确认可承接的部分。退回时 types、facts、unknowns 为空数组。reason 最多两句简短口语，只问想交付什么，可举四类例子。不要追问品类、人群、目的、场景、预算或其他项目信息。受理后务必在提案任务中完整记录委托成果，再按输入整理任务卡。已明确的任务、人群、价格、渠道必须收齐。每项 value 简短，quote 逐字摘自原话、附件正文或用户反馈。只有图片的观察引用所附图片名，推测不作事实。所有产品特点、原料、产地、感受等同列产品卖点与亮点，逐项摘录，保留客户自述身份。客户说“主要卖点”“独特卖点”或表达个人倾向时，另列客户当前判断，value 仅概括客户看好的亮点，如“客户认为无糖是主要卖点”，quote 摘取最短完整判断；这不是市场已证实的差异，也不是设计指令。仅有明确的执行约束，如“正面必须突出”“不可使用”，才另列硬性设计要求，quote 仅摘录该项约束，保留否定与限定条件。没有相应表述就省略该类。其他品类及语言同理。未知项只收会改变下一步公开研究或比较的问题，写明影响及暂行处理；不重复询问已知人群，不提前索要打样或授权文件。单行中文字段，禁止自拟战略主次。';

export async function makeBriefCard(call,project,inputs){
  const sources=[project.brief,...inputs.texts.map(x=>x.text),...(project.feedback??[]).map(x=>x.text)].filter(Boolean);
  const line=v=>typeof v==='string' && v.trim() && !/[\r\n]/.test(v);
  let issue='';
  for(let pass=0;pass<2;pass++){
    try{
      const result=await call(instruction+issue,inputs.images,schema);
      const {briefScope:rawScope,facts,unknowns}=result.parsedOutput??{};
      if(!validBriefScope(rawScope)) throw Error('简报范围判断无效');
      const briefScope={status:rawScope.status,types:rawScope.types,reason:rawScope.reason.trim()};
      if(briefScope.status!=='accepted') return {briefScope};
      if(!Array.isArray(facts)||!Array.isArray(unknowns)||!facts.some(f=>f?.label==='提案任务')) throw Error('简报字段缺失');
      const groups=new Map();
      for(const f of facts){
        if(!labels.includes(f.label)||!line(f.value)||!line(f.quote)) throw Error('简报条目无效');
        const imageObservation=!['客户当前判断','硬性设计要求'].includes(f.label) && inputs.images.some(x=>x.name===f.quote);
        if(!imageObservation&&!sources.some(s=>s.includes(f.quote))) throw Error('原文中找不到引句：'+f.quote);
        const values=groups.get(f.label)??new Set();
        values.add(f.label==='硬性设计要求' ? f.quote : f.value);
        groups.set(f.label,values);
      }
      if(!unknowns.every(u=>[u.issue,u.impact,u.assumption].every(line))) throw Error('未知项缺少对研究的影响或暂行做法');
      const lines=['## 已掌握的项目信息',...labels.filter(k=>groups.has(k)).map(k=>k+'：'+[...groups.get(k)].join('；'))];
      if(unknowns.length) lines.push('','## 影响下一步的未知项',...unknowns.map(u=>u.issue+'：'+u.impact+'。暂按以下方式处理：'+u.assumption));
      lines.push('','## 原稿记录','任务卡格式：客户意向 v1',...facts.map(f=>f.label+'依据：'+f.quote));
      return {briefScope,body:lines.join('\n')};
    }catch(error){
      if(pass || (!error.message.startsWith('简报')&&!error.message.startsWith('原文中')&&!error.message.startsWith('未知项')&&error.code!=='INVALID_STAGE_OUTPUT'))throw error;
      issue=' 上次响应有误，请仅依据原文修正：'+error.message;
    }
  }
}
