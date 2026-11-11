const need=(value,message)=>{if(!value)throw Error(message);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');

const label=value=>typeof value==='string'&&value.trim()&&value.length<=2000&&value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);

export function createChartInsertion({uuid}){
 let target=null;
 function available(context){
  need(context.document&&context.document.revision===context.head,'历史版本只读，请先打开最新稿。');
  need(!context.busy&&!context.pending,'正在处理或存在未决操作，请先完成对账。');
 }
 function open(context){
  available(context);
  if(target){need(target.documentId===context.document.id,'已有图表输入仍绑定原文档，请回到该文档完成保存。');return structuredClone(target);}
  need(context.document.plan.slides.some(s=>s.id===context.slideId),'请先选择目标页面。');
  const {width,height}=context.document.plan;
  target={documentId:context.document.id,slideId:context.slideId,elementId:'chart-'+uuid(),geometry:{x:width*.1,y:height*.15,w:width*.8,h:height*.7}};
  return structuredClone(target);
 }
 function prepare(context,input){
  available(context);
  need(target&&target.documentId===context.document.id,'请回到打开表单时的文档。');
  need(context.document.plan.slides.some(s=>s.id===target.slideId),'原目标页面已删除，请重新打开原页面所在版本。');
  need(!context.document.plan.slides.some(s=>s.elements.some(e=>e.id===target.elementId)),'该图表已经存在，请重新打开已保存版本。');
  need(typeof input==='string'&&input.trim(),'请填写你提供的图表数据。');
  let data;try{data=JSON.parse(input);}catch{throw Error('图表 JSON 格式错误，输入已保留。');}
  need(exact(data,['type','direction','title','unit','numberFormat','categories','series']),'仅填写图表数据字段，不接受来源或核实状态字段。');
  need(['bar','line','pie'].includes(data.type)&&['column','bar'].includes(data.direction)&&(data.type==='bar'||data.direction==='column'),'请检查图表类型及方向。');
  need(label(data.title)&&label(data.unit),'请填写标题和单位。');
  need(['0','0.0','0.00','0.000','0%','0.0%','0.00%'].includes(data.numberFormat),'请选择支持的数字格式。');
  need(Array.isArray(data.categories)&&data.categories.length>0&&data.categories.length<=100&&data.categories.every(label),'请填写 1—100 个分类名称。');
  need(Array.isArray(data.series)&&data.series.length>0&&data.series.length<=16&&data.series.every(s=>exact(s,['name','values'])&&label(s.name)&&Array.isArray(s.values)&&s.values.length===data.categories.length&&s.values.every(v=>Number.isFinite(v)&&!Object.is(v,-0)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER&&!/[eE]/.test(String(v)))),'请检查系列名称、完整数值矩阵及数字精度。');
  if(data.type==='pie')need(data.series.length===1&&data.series[0].values.every(v=>v>=0)&&data.series[0].values.reduce((a,b)=>a+b,0)>0,'饼图需要单组非负数值且总值大于零。');
  return {kind:'add-chart',slideId:target.slideId,elementId:target.elementId,geometry:structuredClone(target.geometry),data};
 }
 function discard(context){need(!context.busy&&!context.pending,'存在进行中或未决操作，不能放弃原请求。');target=null;}
 function saved(){target=null;}
 function reconciled(document){
  if(!target||document?.id!==target.documentId)return false;
  const chart=document.plan.slides.find(s=>s.id===target.slideId)?.elements.find(e=>e.id===target.elementId);
  if(chart?.type!=='chart')return false;
  saved();return true;
 }
 return {open,prepare,saved,reconciled,discard};
}
