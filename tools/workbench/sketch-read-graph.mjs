import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash,imageTask} from './sketch-authority.mjs';
import {requireReviewOriginal,buildReviewRequest,reviewNodeBinding} from './sketch-review-v2.mjs';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const need=v=>{if(!v)throw Object.assign(Error('Frozen unresolved sketch graph changed'),{code:'SKETCH_READ_GRAPH_CHANGED'});};
/** Frozen graph/read-state only. Caller must separately run native current-source guard; never dispatch/IO approval. */
export function readSketchUnresolvedGraph(p,g,run){
 const jobs=p.jobs.filter(j=>j.generationId===g.id||run&&j.reviewRunId===run.id),keys=['producer','consumer','planner',...(g.plan?.candidates.map(c=>c.id)??[])];
 need(jobs.length>0);if(run)requireReviewOriginal(p,run);
 for(const j of jobs){
  need(p.jobs.filter(x=>x.id===j.id).length===1&&['queued','succeeded','running','awaiting_reconciliation'].includes(j.status));
  let expected;
  if(j.reviewRunId){need(run&&j.reviewRunId===run.id);const node=run.nodes.find(n=>n.key===j.nodeKey),id=`sketch-review-${sketchHash([run.id,j.nodeKey])}`;need(node);expected={id,reviewRunId:run.id,generationId:g.id,nodeKey:node.key,stage:'sketch',purpose:['producer','consumer'].includes(node.phase)?'sketch_refinement_handoff':'sketch_review_v2',binding:reviewNodeBinding(run,node),inputVersionIds:[g.source.referenceSource.source.artifactId],task:{id,request:buildReviewRequest(run,node,run.reports).request}};
  }else{need(keys.includes(j.nodeKey));const c=g.plan?.candidates.find(c=>c.id===j.nodeKey),id=`sketch-${sketchHash([g.id,j.nodeKey])}`;expected={id,generationId:g.id,nodeKey:j.nodeKey,stage:'sketch',purpose:c?'image_candidate':j.nodeKey==='planner'?'sketch_plan':'sketch_owner',inputVersionIds:[g.source.referenceSource.source.artifactId],binding:c?g.bindings.image:g.bindings[j.nodeKey==='producer'?'producer':'consumer'],task:{id,parentId:g.id,owner:j.nodeKey,sourceHash:g.source.sourceHash},...(c?{candidate:c,allowanceFamilyId:g.allowanceFamilyId}:{})};}
  need(Object.entries(expected).every(([k,v])=>equal(j[k],v)));need(Object.keys(j).every(k=>Object.hasOwn(expected,k)||['status','attempts','attemptId','outputVersionIds','report','error'].includes(k)));
  need(Array.isArray(j.attempts));if(j.status==='queued')need(j.attempts.length===0);
  if(['running','awaiting_reconciliation'].includes(j.status)){const a=j.attempts[0];need(j.attempts.length===1&&a.id===j.attemptId&&a.status===j.status&&a.dispatchStarted===true&&a.executor?.actorType==='agent'&&['actorId','runId','contextId'].every(k=>typeof a.executor?.[k]==='string'&&a.executor[k]));if(j.purpose==='image_candidate')need(a.requestHash===sketchHash(stable(imageTask(p,g,j,a.id)))&&a.allowanceFamilyId===j.allowanceFamilyId);if(j.reviewRunId&&a.receipt)need(a.receipt.inputPacketHash===sketchHash({runId:a.id,model:j.binding.model,...expected.task.request}));}
 }
 const unresolved=jobs.filter(j=>['running','awaiting_reconciliation'].includes(j.status));need(unresolved.length>0);
 return {kind:'unresolved',generationId:g.id,runId:run?.id??null,jobsHash:sketchHash(jobs),attemptsHash:sketchHash(jobs.map(j=>({id:j.id,status:j.status,attemptId:j.attemptId??null,attempts:j.attempts}))),jobIds:jobs.map(j=>j.id),unresolved:unresolved.map(j=>({jobId:j.id,status:j.status,attemptId:j.attemptId})),physicalIOVerified:false,writeEligible:false};
}
