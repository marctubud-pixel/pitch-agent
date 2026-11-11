import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket,NUMERIC_CONTENT_CONTRACT,PLANNING_CONTENT_CONTRACT,numericContentPacket} from './content-contract-versions.mjs';
import {makeProjectedContentSource} from './content-visibility.mjs';
import {freezeContentPlanningAuthority,contentNodes,contentRootId,contentCalls,contentAllowance,CONTENT_PROTOCOL,CONTENT_PURPOSES} from './complete-content.mjs';
import {finalEnvelope} from './final-visual.mjs';
const clone=structuredClone;
export function reduceNumericContentRevision(p,c,context,sourceBuilder){
 need(context.actorType==='agent','CONTENT_TRUSTED_RUNTIME_REQUIRED','Trusted numeric content coordinator required');
 need(c.packetVersion===undefined||planningContentPacket(c.packetVersion),'CONTENT_CONTRACT_INVALID','Only explicit v5 target or exact historical v4 continuation is admitted');
 const contract=c.packetVersion===MODEL_VIEW_CONTENT_CONTRACT.packet?MODEL_VIEW_CONTENT_CONTRACT:planningContentPacket(c.packetVersion)?PLANNING_CONTENT_CONTRACT:NUMERIC_CONTENT_CONTRACT;
 const predecessor=p.jobs.filter(j=>j.purpose==='complete_content_plan').at(-1);
 need((planningContentPacket(contract.packet)?numericContentPacket(predecessor?.task.packetVersion):predecessor?.task.packetVersion===NUMERIC_CONTENT_CONTRACT.packet)&&predecessor.id===c.predecessorRootJobId,'CONTENT_NUMERIC_PREDECESSOR_STALE','Exact latest numeric predecessor required');
 need(!p.jobs.some(j=>CONTENT_PURPOSES.includes(j.purpose)&&j.attempts.some(a=>a.dispatchStarted&&a.status!=='succeeded')),'CONTENT_UNKNOWN_BLOCKS','Unknown dispatched calls must reconcile before revision');
 const source=makeProjectedContentSource(p,sourceBuilder(p,c.sourceContents,{contract}));
 need(c.source===undefined&&source.sourceHash===c.sourceHash,'CONTENT_SOURCE_STALE','Exact current numeric source required');
 const originalReports=p.jobs.filter(j=>j.contentRootJobId===predecessor.id&&j.contentReport).map(j=>({jobId:j.id,reportId:j.contentReport.id,reportHash:hash(j.contentReport)}));
 need(originalReports.length>0,'CONTENT_REVISION_EVIDENCE_REQUIRED','An executed original is required before revision');
 for(const n of contentNodes()){
  const binding=c.assignments?.[n.key],cap=c.capabilities?.[n.key],role=n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role;
  need(binding?.role===role&&cap?.operation===CONTENT_PROTOCOL&&cap.packetVersion===contract.packet&&(!planningContentPacket(contract.packet)||cap.resourceProfile==='bounded-json-v1')&&equal(cap.assignment,{providerId:binding.providerId,model:binding.model}),'CONTENT_CAPABILITY_REQUIRED','Every prospective node must retain exact role and bounded v4 capability');
  finalEnvelope(source.images,{...cap,operation:'final-visual-v1'},binding);
 }
 if(c.kind==='request-content-numeric-continuation'){
  const rootJobId=contentRootId(source.sourceHash,contract.packet,predecessor.id),intent={id:c.commandId,...(planningContentPacket(contract.packet)?{packetVersion:contract.packet}:{}),rootJobId,predecessorRootJobId:predecessor.id,source:clone(source),sourceContents:clone(c.sourceContents),assignments:clone(c.assignments),capabilities:clone(c.capabilities),originalReports};
  need(!p.contentNumericRevisionIntents?.some(i=>i.rootJobId===rootJobId),'CONTENT_EXISTS','One revision per exact source and predecessor');
  p.contentNumericRevisionIntents??=[];p.contentNumericRevisionIntents.push(intent);return;
 }
 const intent=p.contentNumericRevisionIntents?.find(i=>i.id===c.intentId);
 need(intent&&(intent.packetVersion??NUMERIC_CONTENT_CONTRACT.packet)===contract.packet&&equal(intent.originalReports,originalReports)&&equal(intent.source,source)&&equal(intent.assignments,c.assignments)&&equal(intent.capabilities,c.capabilities),'CONTENT_REVISION_INTENT_REQUIRED','Exact persisted numeric revision and unchanged original reports required');
 need(!p.jobs.some(j=>j.id===intent.rootJobId),'CONTENT_EXISTS','Numeric revision already opened');
 need(contentCalls(p)+contentNodes().length<=contentAllowance(p).maxCalls,'CONTENT_ALLOWANCE_EXHAUSTED','Full new thirteen-node graph requires remaining allowance');
 const correction={kind:'numeric_content_revision',predecessorRootJobId:predecessor.id,revisionIntentId:intent.id,originalReports:clone(originalReports),priorFindings:p.jobs.filter(j=>j.contentRootJobId===predecessor.id).flatMap(j=>(j.contentReport?.raw?.findings??[]).map(f=>({...f,originId:`${j.id}#${f.id}`}))),affectedNodeKeys:contentNodes().map(n=>n.key)};
 const id=intent.rootJobId,node=contentNodes()[0];
 p.jobs.push(freezeContentPlanningAuthority(p,{id,contentRootJobId:id,nodeKey:node.key,node,stage:'content_review',purpose:'complete_content_plan',binding:clone(c.assignments.plan),inputVersionIds:[source.strategy.artifactId,source.copy.artifactId,source.visual.artifactId],task:{packetVersion:contract.packet,source:clone(source),sourceContents:clone(c.sourceContents),assignments:clone(c.assignments),capabilities:clone(c.capabilities),correction},status:'queued',attempts:[]}));
}
