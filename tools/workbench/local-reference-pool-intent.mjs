import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function poolContinuationRequest(project,plan){
 need(plan?.protocol==='local-reference-pool-plan-v2'&&plan.projectId===project.id&&plan.artifactId===project.activeByStage.copy&&plan.status==='ready'&&plan.dispatchAuthorized===false&&plan.directions.length===3&&plan.directions.every(d=>d.imports.length===0),'LOCAL_POOL_FINAL_PLAN_REQUIRED');
 return {artifactId:plan.artifactId,discoveryMode:'manual_supplied',referencePoolPlan:structuredClone(plan),commandId:'pool-continuation-v2-'+hash([project.id,plan.artifactId,plan.copyContentHash,plan.sourceHash,plan.planHash]),expectedRevision:project.revision};
}
export function verifyPoolContinuation(project,plan,readRevision){
 const intents=(project.referenceIntents??[]).filter(i=>i.artifactId===plan.artifactId);
 if(!intents.length)return null;
 need(intents.length===1,'LOCAL_POOL_CONTINUATION_VERSION_CONFLICT');const intent=intents[0],request=intent.request;
 need(request?.referencePoolPlan?.protocol==='local-reference-pool-plan-v2'&&equal(request.referencePoolPlan,plan),'LOCAL_POOL_SEALED_SOURCE_CHANGED');
 const audits=(project.audit??[]).filter(a=>a.commandId===intent.id),encoded=project.processedCommands?.[intent.id];
 need(audits.length===1&&audits[0].kind==='request-copy-continuation'&&typeof encoded==='string','LOCAL_POOL_INTENT_RECEIPT_REQUIRED');
 need(Number.isSafeInteger(audits[0].revision)&&audits[0].revision>=1&&audits[0].revision<=project.revision,'LOCAL_POOL_INTENT_RECEIPT_CHANGED');
 const before=readRevision(audits[0].revision-1);need(before.id===project.id&&before.revision===audits[0].revision-1,'LOCAL_POOL_INTENT_HISTORY_CHANGED');need(!Object.hasOwn(before.processedCommands??{},intent.id)&&!(before.audit??[]).some(a=>a.commandId===intent.id)&&!(before.referenceIntents??[]).some(i=>i.id===intent.id||i.artifactId===plan.artifactId),'LOCAL_POOL_INTENT_HISTORY_CHANGED');need(!(before.referenceDossiers??[]).some(d=>d.envelope?.source?.source?.artifactId===plan.artifactId)&&!(before.jobs??[]).some(j=>j.purpose==='reference'&&(j.targetArtifactId===plan.artifactId||j.inputVersionIds?.includes(plan.artifactId))),'LOCAL_POOL_INTENT_HISTORY_CHANGED');const expected=poolContinuationRequest(before,plan);
 need(expected.commandId===intent.id&&equal(expected,request)&&equal(JSON.parse(encoded),{kind:'request-copy-continuation',artifactId:plan.artifactId,request,commandId:intent.id}),'LOCAL_POOL_INTENT_RECEIPT_CHANGED');
 const snapshot=readRevision(audits[0].revision);need(snapshot.id===project.id&&snapshot.revision===audits[0].revision,'LOCAL_POOL_INTENT_HISTORY_CHANGED');need(snapshot.processedCommands?.[intent.id]===encoded&&equal((snapshot.audit??[]).filter(a=>a.commandId===intent.id),audits),'LOCAL_POOL_INTENT_HISTORY_CHANGED');const committed=snapshot.referenceIntents?.filter(i=>i.id===intent.id);
 need(committed?.length===1&&equal(committed[0],intent),'LOCAL_POOL_INTENT_HISTORY_CHANGED');
 return {commandId:intent.id,creationRevision:audits[0].revision,originalRequest:structuredClone(request),sealedPlan:structuredClone(plan),providerDispatchAuthorized:false};
}
