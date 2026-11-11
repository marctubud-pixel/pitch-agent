import {isDeepStrictEqual as equal} from 'node:util';
const need=(v,code='STALE_SIMPLE_STRATEGY')=>{if(!v)throw Object.assign(Error(code),{code});};
export const simpleHttpSnapshot=p=>({card:p.taskCards.find(c=>c.id===p.activeTaskCardId),policy:p.policies.at(-1),researchId:p.activeByStage.research,questions:(p.researchQuestionRegistrations??[]).filter(q=>q.taskCardId===p.activeTaskCardId).at(-1),release:p.releases.filter(r=>r.artifactId===p.activeByStage.research).at(-1)});
export function reduceSimpleHttp(p,c,context){
 need(context.actorType==='agent','EXECUTOR_REQUIRED');need(['continue','verify','reconcile'].includes(c.operation),'INVALID_REQUEST');need(typeof c.request?.commandId==='string'&&p.jobs.some(j=>j.id===c.jobId),'INVALID_JOB');
 p.simpleStrategyHttpRequests??=[];need(!p.simpleStrategyHttpRequests.some(r=>r.request.commandId===c.request.commandId),'COMMAND_ID_REUSED');
 p.simpleStrategyHttpRequests.push({operation:c.operation,request:structuredClone(c.request),jobId:c.jobId,binding:structuredClone(p.jobs.find(j=>j.id===c.jobId).binding),snapshot:structuredClone(simpleHttpSnapshot(p))});
}
export function requireSimpleHttpJob(p,requestId,job){const row=(p.simpleStrategyHttpRequests??[]).find(r=>r.request.commandId===requestId);need(row&&row.jobId===job?.id&&row.operation!=='reconcile'&&equal(row.binding,job.binding)&&equal(row.snapshot,simpleHttpSnapshot(p)),'STALE_SIMPLE_STRATEGY');}
