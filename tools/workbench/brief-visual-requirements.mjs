import {DomainError} from './project.mjs';
const need=(condition,code,message)=>{if(!condition)throw new DomainError(code,message);};
export function briefVisualRequirements(task) {
 let envelope;try{envelope=JSON.parse(task.brief);}catch{return [];}
 if(envelope?.format!=='proposal-workbench-brief-v1')return [];
 const value=envelope.fields?.visualRequirements;if(value===undefined)return [];
 const code='FINAL_BRIEF_VISUAL_REQUIREMENTS_INVALID',seen=new Set();
 need(Array.isArray(value)&&value.length<=3,code,'Bounded explicit visual requirements required');
 return value.map(r=>{
  need(r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).sort().join(',')==='kind,views'&&['packaging','kv','adaptation'].includes(r.kind)&&!seen.has(r.kind)&&Array.isArray(r.views)&&r.views.length<=12&&r.views.every(v=>typeof v==='string'),code,'Valid explicit visual kind and bounded views required');seen.add(r.kind);
  const views=r.views.map(v=>v.trim()).filter(Boolean);
  need(views.length>0&&views.every(v=>v.length<=120)&&new Set(views).size===views.length,code,'Nonempty unique explicit views required');
  return {kind:r.kind,views};
 });
}
