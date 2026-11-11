import {isLayoutCommandWitness,isFullLayoutRawCommand} from './layout-command-witness.mjs';
import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket} from './content-contract-versions.mjs';
import {reopenContentPlanningOriginal} from './content-planning-original.mjs';
import {completeFinalTextOriginal,adoptFinalReviewConvergence} from './final-visual.mjs';
import {assertStoreReadAdmission} from './store.mjs';
import {isFinalCommandWitness} from './final-review-command-witness.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchRequire as need,sketchHash} from './sketch-authority.mjs';
import {verifyStageOriginal} from './stage-original.mjs';
import {verifySketchOriginal} from './sketch-original.mjs';
import {verifyContentOriginal} from './content-original.mjs';
import {verifyOwnerOriginal} from './owner-original.mjs';
import {verifyReferenceOriginal} from './reference-original.mjs';
import {referenceOriginalReports} from './reference-dossier.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {verifySketchReviewOriginal,verifyReviewedSketchOriginal} from './sketch-review-original.mjs';
import {verifyFinalVisualOriginal} from './final-visual-original.mjs';
import {visibilityPointer} from './content-visibility.mjs';
import {ownerHash} from './owner-edge.mjs';
import {ownerCopyTask,applyCommand,reviewContextReport} from './project.mjs';

const REVIEW_COLLECTIONS={verification:'verifications',readiness:'readinessReports',handoff:'handoffReports',feedback_review:'feedbackReviews',creative_panel:'creativeReports',correction_review:'correctionReviews'};
const REVIEW_COMPLETIONS={verification:'complete-verification',readiness:'complete-readiness',handoff:'complete-handoff',feedback_review:'complete-feedback-review',creative_panel:'complete-creative-node',correction_review:'complete-correction-review'};


const LIMITS=Object.freeze({commands:8192,fingerprintBytes:8*1024**2,totalFingerprintBytes:64*1024**2,duties:8192});

export function selectedOriginalCommandIndex(project) {
 need(Array.isArray(project.audit)&&project.audit.length<=LIMITS.commands&&project.processedCommands&&typeof project.processedCommands==='object','FINAL_HISTORY_WITNESS_LIMIT','Bounded audit and fingerprint index required');
 const entries=[],digestWitnesses=[],seen=new Set();let bytes=0;
 for(const audit of project.audit) {
  need(typeof audit.commandId==='string'&&!seen.has(audit.commandId),'FINAL_HISTORY_WITNESS_CONFLICT','Unique exact command identity required');seen.add(audit.commandId);
  const raw=project.processedCommands[audit.commandId];
  if(raw===undefined)continue;
  need(typeof raw==='string'&&Buffer.byteLength(raw)<=LIMITS.fingerprintBytes,'FINAL_HISTORY_WITNESS_LIMIT','Bounded exact command fingerprint required');
  bytes+=Buffer.byteLength(raw);need(bytes<=LIMITS.totalFingerprintBytes,'FINAL_HISTORY_WITNESS_LIMIT','Command index byte allowance exhausted');
  let command;try{command=JSON.parse(raw);}catch{need(false,'FINAL_HISTORY_WITNESS_CONFLICT','Malformed supplied command fingerprint');}
  need(command.commandId===audit.commandId&&command.kind===audit.kind&&Number.isSafeInteger(audit.revision)&&audit.revision>0&&audit.revision<=project.revision&&!Object.hasOwn(command,'expectedRevision'),'FINAL_HISTORY_WITNESS_CONFLICT','Audit and reducer fingerprint identity must agree');
  if(command.protocol==='layout-command-digest-v1'&&!isFullLayoutRawCommand(command)){need(isLayoutCommandWitness(command),'FINAL_HISTORY_WITNESS_CONFLICT','Invalid layout digest witness');digestWitnesses.push({audit,witness:command,classification:'digest_only_not_raw_command'});continue;}
  if(['final-command-witness-v2','final-command-witness-codex-text-v1'].includes(command.protocol)){need(isFinalCommandWitness(command),'FINAL_HISTORY_WITNESS_CONFLICT','Recognized digest witness is not a raw command proof');digestWitnesses.push({audit,witness:command,classification:'digest_only_not_raw_command'});continue;}
  entries.push({audit,command});
 }
 return {entries,bytes,digestWitnesses};
}

export function replayFinalRevisionCompletion({before,snapshot,witness,checked}) {
 need(witness.command.kind==='complete-final-visual'&&checked.kind==='final-visual-text-original'&&checked.jobId===witness.command.jobId&&checked.attemptId===witness.command.attemptId&&before.revision+1===snapshot.revision&&snapshot.revision===witness.audit.revision,'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','Exact original completion and predecessor required');
 const replay=structuredClone(before),jobs=replay.jobs.filter(j=>j.id===checked.jobId),job=jobs[0],attempt=job?.attempts.at(-1),run=replay.finalVisualRuns.find(r=>r.id===job?.finalVisualRunId);
 need(jobs.length===1&&job.purpose==='final_visual_revision'&&['running','awaiting_reconciliation'].includes(job.status)&&attempt?.id===checked.attemptId&&attempt.receipt&&sketchHash(attempt.receipt)===checked.receiptHash&&run&&!run.reports.some(r=>r.id===checked.reportId),'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','Checked anchored original must precede its first completion');
 need(equal(job.binding,run.assignments.planner)&&checked.runId===run.id&&checked.sourceHash===run.source.sourceHash,'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','Exact assigned owner and original source required');
 completeFinalTextOriginal(replay,run,job,attempt,attempt.executor);
 need(equal(run.reports.at(-1),snapshot.finalVisualRuns.find(r=>r.id===run.id)?.reports.find(r=>r.id===checked.reportId)),'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','Original producing parser and constructor must reproduce the checked report');
 need(equal(replay.finalVisualRuns,snapshot.finalVisualRuns)&&equal(replay.finalVisualLineage,snapshot.finalVisualLineage)&&equal(replay.finalVisualRevisionRequests,snapshot.finalVisualRevisionRequests)&&equal(replay.jobs.filter(j=>j.finalVisualRunId!==run.id),snapshot.jobs.filter(j=>j.finalVisualRunId!==run.id)),'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','Exact produced child, queued members, lineage and request required');
 return replay;
}

export function checkedOriginalResultFacts({kind,checked,snapshot,planning,index}) {
 const executionPairs=[],rawReports=[];
 const pair=(jobId,attemptId)=>{need(typeof jobId==='string'&&typeof attemptId==='string','FINAL_HISTORY_RESULT_SHAPE_REQUIRED','Exact domain execution pair required');executionPairs.push({jobId,attemptId});};
 const recordPointer=(collection,id)=>{const rows=snapshot[collection],hits=rows?.filter(r=>r.id===id);need(hits?.length===1,'FINAL_HISTORY_RESULT_SHAPE_REQUIRED','Exact domain report host required');return `/${collection}/${rows.indexOf(hits[0])}`;};
 const raw=(pointer,reportId,value)=>{need(value!==undefined,'FINAL_HISTORY_RESULT_SHAPE_REQUIRED','Domain raw report is required without projection fallback');rawReports.push({pointer,reportId,raw:value});};
 switch(checked.kind??kind){
  case 'ordinary_stage_original':case 'sketch-text-original':case 'sketch-image-original':case 'final-visual-image-original':
   pair(checked.jobId,checked.attemptId);break;
  case 'owner':
   pair(checked.jobId,checked.attemptId);raw(recordPointer('ownerReports',checked.reportId),checked.reportId,checked.projection);break;
  case 'generic-review-original':
   pair(checked.identity.jobId,checked.identity.attemptId);
   need(REVIEW_COLLECTIONS[checked.identity.domain],'FINAL_HISTORY_RESULT_SHAPE_REQUIRED','Supported generic original domain required');
   raw(recordPointer(REVIEW_COLLECTIONS[checked.identity.domain],checked.identity.reportId),checked.identity.reportId,checked.source.rawReport);break;
  case 'reference':{
   const pointer=recordPointer('referenceDossiers',checked.dossier.id);
   for(const report of checked.reports){pair(report.job.id,report.attempt.id);const i=checked.dossier.reports.findIndex(r=>r.id===report.stored.id);need(i>=0,'FINAL_HISTORY_RESULT_SHAPE_REQUIRED','Registered reference report required');raw(`${pointer}/reports/${i}`,report.stored.id,report.stored.rawReport);}break;
  }
  case 'sketch-review-original':{
   const pointer=recordPointer('sketchReviewRuns',checked.reviewRunId),run=visibilityPointer(snapshot,pointer);
   for(const report of checked.reports){pair(report.jobId,report.attemptId);const i=run.reports.findIndex(r=>r.id===report.reportId);need(i>=0,'FINAL_HISTORY_RESULT_SHAPE_REQUIRED','Registered sketch review report required');raw(`${pointer}/reports/${i}`,report.reportId,report.raw);}break;
  }
  case 'final-visual-text-original':{
   pair(checked.jobId,checked.attemptId);const pointer=recordPointer('finalVisualRuns',checked.runId),run=visibilityPointer(snapshot,pointer),i=run.reports.findIndex(r=>r.id===checked.reportId);need(i>=0,'FINAL_HISTORY_RESULT_SHAPE_REQUIRED','Registered final visual report required');raw(`${pointer}/reports/${i}`,checked.reportId,checked.raw);break;
  }
  case 'content-original':
   pair(checked.jobId,checked.attemptId);raw(`${recordPointer('jobs',checked.jobId)}/contentReport`,checked.reportId,checked.raw);break;
  default:need(false,'FINAL_HISTORY_UNSUPPORTED_RESULT_SHAPE','Selected original result domain has no consumed contract');
 }
 const closedNodeIdentities=[];
 for(const identity of executionPairs){
  const originals=snapshot.jobs.filter(j=>j.id===identity.jobId),registered=planning.jobs.filter(j=>j.id===identity.jobId),original=originals[0];
  need(originals.length===1&&registered.length===1&&equal(original,registered[0])&&original.attempts.filter(a=>a.id===identity.attemptId).length===1,'FINAL_HISTORY_WITNESS_CONFLICT','Checked exact job and attempt registration required');
  const pointer=`/jobs/${planning.jobs.indexOf(registered[0])}`,attemptPointer=`${pointer}/attempts/${original.attempts.findIndex(a=>a.id===identity.attemptId)}`;
  for(const node of index.nodes)if((node.originalPointer===pointer&&node.recordId===identity.jobId)||(node.originalPointer===attemptPointer&&node.recordId===identity.attemptId)){
   need(sketchHash(JSON.stringify(visibilityPointer(planning,node.originalPointer)))===node.recordHash,'FINAL_HISTORY_HOST_CHANGED','Exact registered execution node changed');closedNodeIdentities.push(node.identity);
  }
 }
 const checkedRawAnchors=rawReports.map(report=>{
  const original=visibilityPointer(snapshot,report.pointer),registered=visibilityPointer(planning,report.pointer),anchors=index.reportAnchors.filter(a=>a.originalRecordPointer===report.pointer&&a.identity===report.reportId);
  need(equal(original,registered)&&anchors.length===1&&anchors[0].recordHash===sketchHash(JSON.stringify(registered))&&equal(anchors[0].raw,report.raw),'FINAL_HISTORY_REPORT_ORIGINAL_REQUIRED','Exact checked raw report, registered host and immutable version required');
  return structuredClone(anchors[0]);
 });
 return {checkedExecutionPairs:executionPairs,checkedRawAnchors,closedNodeIdentities};
}

export async function verifySelectedOriginals({store,planning,index,selected,executionRoot,imageStore,current}) {
 try {assertStoreReadAdmission(store,planning.id);} catch(error) {
  return {facts:[],blockers:[{code:error.code??'SNAPSHOT_READ_ADMISSION_REQUIRED',message:error.message}],settledOutputs:[],accounting:{allocationAdmission:'store_read_admission_required',physicalIo:'unmeasured'},digestWitnesses:[]};
 }
 const {entries,bytes,digestWitnesses}=selectedOriginalCommandIndex(planning),queue=[],facts=[],blockers=[],settledOutputs=[],seen=new Set();
 const edges=[],terminals=[],deferred=[],originalChecks=new Map(),referenceWitnesses=new Map();
 const accounting={historicalSnapshotReads:0,retainedHistoricalSnapshots:0,peakRetainedHistoricalSnapshots:0,retentionStrategy:'sequential_snapshot_metadata_reuse',originalChecks:0,originalCheckReuses:0,fingerprintBytes:bytes,allocationAdmission:'outer_store_read_admission',physicalIo:'unmeasured'};
 const enqueue=(kind,id,occurrence,host=null)=>{
  const collection=kind==='job'?'jobs':kind==='artifact'?'artifacts':kind==='owner'?'ownerReports':kind==='review_run'?'sketchReviewRuns':REVIEW_COLLECTIONS[kind]??'referenceDossiers';
  const records=planning[collection]??[],matches=records.filter(record=>record.id===id),record=matches.length===1?matches[0]:null;
  const registered=index.nodes.filter(node=>node.recordId===id&&node.originalPointer?.startsWith('/'+collection+'/')&&node.originalPointer.split('/').length===3);
  const originalPointer=`/${collection}/${records.indexOf(record)}`;
  const version=registered.length===1?registered[0].version??registered[0].recordHash:record?`derived-record-${sketchHash(JSON.stringify(record))}`:null;
  queue.push({kind,id,occurrence,host:host??{domain:collection,id,originalPointer},originalPointer,version,attemptId:record?.attemptId??record?.attempts?.at(-1)?.id??null});
 };
 for(const [occurrence,node] of index.nodes.entries())if(selected.nodeIdentities.includes(node.identity)){
  const registered=visibilityPointer(planning,node.originalPointer);
  need(registered!==undefined&&(!node.recordId||registered.id===node.recordId)&&sketchHash(JSON.stringify(registered))===node.recordHash,'FINAL_HISTORY_HOST_CHANGED','Selected node must address its exact original registered host');
  if(node.domain==='job')enqueue('job',node.recordId,occurrence,{domain:node.domain,id:node.recordId,originalPointer:node.originalPointer??null,version:node.version??null});
  else if(node.domain==='artifact')enqueue('artifact',node.recordId,occurrence,{domain:node.domain,id:node.recordId,originalPointer:node.originalPointer??null,version:node.version??null});
  else if(node.domain==='reference_dossier')enqueue('reference',node.recordId,occurrence);
  else if(node.originalPointer?.startsWith('/ownerReports/')&&node.originalPointer.split('/').length===3)enqueue('owner',node.recordId,occurrence);
  else if(node.domain==='sketch_review_run')enqueue('review_run',node.recordId,occurrence);
  else if(Object.values(REVIEW_COLLECTIONS).some(collection=>node.originalPointer?.startsWith('/'+collection+'/')&&node.originalPointer.split('/').length===3))enqueue(Object.keys(REVIEW_COLLECTIONS).find(kind=>node.originalPointer.startsWith('/'+REVIEW_COLLECTIONS[kind]+'/')),node.recordId,occurrence);
  else if(node.domain==='sketch_generation')for(const [i,job] of planning.jobs.entries())if(job.generationId===node.recordId)enqueue('job',job.id,i);
 }
 const exact=(kind,test)=>{const matches=entries.filter(entry=>entry.command.kind===kind&&test(entry.command));need(matches.length===1,'FINAL_HISTORY_COMMAND_WITNESS_REQUIRED','One exact reducer completion witness required');return matches[0];};
 for(let cursor=0;cursor<queue.length;cursor++) {
  need(queue.length<=LIMITS.duties,'FINAL_HISTORY_WITNESS_LIMIT','Selected original obligation allowance exhausted');
  current();const duty=queue[cursor],key=JSON.stringify([planning.id,duty.kind,duty.host,duty.id,duty.attemptId,duty.version,duty.occurrence]);if(seen.has(key))continue;seen.add(key);
  try {
   let witness,job,report,artifact;
   if(duty.kind==='job'){
    const selectedJob=planning.jobs.find(j=>j.id===duty.id);
    const owner=planning.ownerReports?.find(r=>r.jobId===duty.id);
    const generic=Object.entries(REVIEW_COLLECTIONS).flatMap(([kind,collection])=>(planning[collection]??[]).filter(r=>r.jobId===duty.id).map(report=>({kind,report})));
    const reference=planning.referenceDossiers?.find(d=>d.id===selectedJob?.dossierId);
    if(owner){edges.push({parent:duty,dependency:{kind:'owner',reportId:owner.id}});enqueue('owner',owner.id,duty.occurrence,duty.host);continue;}
    if(generic.length){need(generic.length===1,'FINAL_HISTORY_WITNESS_CONFLICT','Exact job review ownership required');enqueue(generic[0].kind,generic[0].report.id,duty.occurrence,duty.host);continue;}
    if(reference){enqueue('reference',reference.id,duty.occurrence,duty.host);continue;}
   }
   if(duty.kind==='artifact'){
    const artifacts=planning.artifacts.filter(item=>item.id===duty.id);need(artifacts.length===1,'FINAL_HISTORY_WITNESS_CONFLICT','One exact registered artifact required');artifact=artifacts[0];
    if(artifact.provenance==='imported_metadata'){blockers.push({code:'FINAL_HISTORY_IMPORTED_ARTIFACT_ORIGINAL_REQUIRED',...duty,provenance:artifact.provenance,contentHash:artifact.contentHash});continue;}
    if(artifact.stage==='sketch'&&artifact.sketchGeneration?.reviewRunId){duty.kind='reviewed_sketch';}
    else if(artifact.provenance==='native-layout-technical-only'&&artifact.layoutTechnical){const registration=exact('register-layout-technical',c=>c.jobId===artifact.layoutTechnical.rootJobId);need(registration.audit.revision<=planning.revision,'FINAL_HISTORY_WITNESS_CONFLICT','Exact native artifact registration required');deferred.push({...duty,authority:'native_artifact',artifactId:artifact.id,contentHash:artifact.contentHash,rootJobId:artifact.layoutTechnical.rootJobId,bindingHash:artifact.layoutTechnical.bindingHash});continue;}
    else if(artifact.finalVisual){deferred.push({...duty,authority:'final_visual',artifactId:artifact.id,contentHash:artifact.contentHash,runId:artifact.finalVisual.runId});continue;}
    else if(artifact.completeContent){deferred.push({...duty,authority:'content',artifactId:artifact.id,contentHash:artifact.contentHash});continue;}
    else if(artifact.provenance!=='provider_execution'){blockers.push({code:'FINAL_HISTORY_IMPORTED_ARTIFACT_ORIGINAL_REQUIRED',...duty,provenance:artifact.provenance,contentHash:artifact.contentHash});continue;}
    if(duty.kind==='reviewed_sketch'){const run=planning.sketchReviewRuns.find(r=>r.id===artifact.sketchGeneration.reviewRunId);need(run,'FINAL_HISTORY_WITNESS_CONFLICT','Registered reviewed run required');witness=exact('register-reviewed-sketch',c=>c.artifact?.id===artifact.id);}
    const producers=planning.jobs.filter(item=>item.outputVersionIds?.includes(artifact.id));need(duty.kind==='reviewed_sketch'||producers.length===1,'FINAL_HISTORY_WITNESS_CONFLICT','One exact registered artifact producer required');job=producers[0];
   }
   const ordinary=item=>['research','strategy','copy'].includes(item?.stage)&&(!item.purpose||item.purpose==='stage');
   if(duty.kind==='artifact'&&!ordinary(job)){blockers.push({code:'FINAL_HISTORY_UNSUPPORTED_ARTIFACT_ORIGINAL',...duty,jobId:job.id,purpose:job.purpose});continue;}
   if(duty.kind==='job'||duty.kind==='artifact') {
    if(!job){const matches=planning.jobs.filter(item=>item.id===duty.id);need(matches.length===1,'FINAL_HISTORY_WITNESS_CONFLICT','One exact registered job required');job=matches[0];}
    if(job?.purpose==='layout_export'){deferred.push({...duty,authority:'native',jobId:job.id,attemptId:job.attempts?.[0]?.id,bindingHash:job.task?.bindingHash});continue;}
    if(!job||!['succeeded','succeeded_stale'].includes(job.status)){blockers.push({code:'FINAL_HISTORY_UNFINISHED_ORIGINAL',...duty});continue;}
    if(ordinary(job)){
     need(job.outputVersionIds?.length===1,'FINAL_HISTORY_WITNESS_CONFLICT','One ordinary output required');
     const outputs=planning.artifacts.filter(item=>item.id===job.outputVersionIds[0]);need(outputs.length===1,'FINAL_HISTORY_WITNESS_CONFLICT','One exact registered ordinary output required');artifact=outputs[0];
     if(artifact.provenance!=='provider_execution'){blockers.push({code:'FINAL_HISTORY_IMPORTED_ARTIFACT_ORIGINAL_REQUIRED',...duty,artifactId:artifact.id,provenance:artifact.provenance,contentHash:artifact.contentHash});continue;}
    }
    const attempt=ordinary(job)?job.attempts.find(item=>item.id===job.attemptId):job.attempts.at(-1);
    const completion=ordinary(job)?'complete-stage':['sketch_owner','sketch_plan'].includes(job.purpose)?'complete-sketch-text':job.purpose==='image_candidate'?'complete-image-candidate':job.reviewRunId?'complete-sketch-review':job.finalVisualRunId?'complete-final-visual':job.contentReport?'complete-complete-content':null;
    if(!completion){blockers.push({code:'FINAL_HISTORY_UNSUPPORTED_JOB_ORIGINAL',...duty,purpose:job.purpose,attemptId:attempt?.id});continue;}
    witness=exact(completion,c=>c.jobId===job.id&&c.attemptId===attempt.id);
    if(ordinary(job)){
     need(witness.command.artifactId===artifact.id,'FINAL_HISTORY_WITNESS_CONFLICT','Completion must name exact ordinary artifact');
    }
    if(job.generationId){
     const g=planning.sketchGenerations.find(item=>item.id===job.generationId);
     const open=exact('open-sketch-generation',c=>c.generation?.id===g.id&&c.generation.source.sourceHash===g.source.sourceHash);
     const claim=exact('claim-sketch-job',c=>c.jobId===job.id&&c.attemptId===attempt.id);
     need(open.audit.revision<claim.audit.revision&&claim.audit.revision<witness.audit.revision,'FINAL_HISTORY_WITNESS_CONFLICT','Original open, claim and completion order changed');
     if(['producer','consumer','planner'].includes(job.nodeKey)){const queued=exact('queue-sketch-node',c=>c.generationId===g.id&&c.nodeKey===job.nodeKey);need(open.audit.revision<queued.audit.revision&&queued.audit.revision<claim.audit.revision,'FINAL_HISTORY_WITNESS_CONFLICT','Original sketch queue order changed');}
     if(job.purpose==='image_candidate'){const anchor=exact('anchor-image-response',c=>c.jobId===job.id&&c.attemptId===attempt.id&&equal(c.receipt,attempt.receipt));need(claim.command.requestHash===attempt.requestHash&&claim.audit.revision<anchor.audit.revision&&anchor.audit.revision<witness.audit.revision,'FINAL_HISTORY_WITNESS_CONFLICT','Exact claimed and anchored image result required');}
    }
   }else if(REVIEW_COLLECTIONS[duty.kind]){
    report=planning[REVIEW_COLLECTIONS[duty.kind]].find(r=>r.id===duty.id);need(report,'FINAL_HISTORY_WITNESS_CONFLICT','Registered exact review required');
    const recovered=duty.kind==='readiness'&&report.resolutionId;
    witness=exact(recovered?'recover-readiness':REVIEW_COMPLETIONS[duty.kind],c=>c.reportId===report.id&&c.jobId===report.jobId&&c.attemptId===report.attemptId);
    if(recovered){
     const resolutions=(planning.readinessResolutions??[]).filter(r=>r.kind==='recovered-result'&&(r.id===report.resolutionId||r.jobId===report.jobId||r.reportId===report.id));
     const resolution=resolutions[0],command=witness.command;
     need(resolutions.length===1&&resolution.id===report.resolutionId&&resolution.jobId===report.jobId&&resolution.attemptId===report.attemptId&&resolution.reportId===report.id,'FINAL_HISTORY_RECOVERY_WITNESS_REQUIRED','One exact registered recovery resolution required');
     need(command.resolutionId===resolution.id&&command.payloadRef===report.payloadRef&&equal(command.proof,resolution.proof)&&equal(command.request,resolution.request)&&resolution.proofHash===sketchHash(JSON.stringify(resolution.proof)),'FINAL_HISTORY_RECOVERY_WITNESS_REQUIRED','Exact recovery command proof, request and payload required');
     need(command.request?.action==='recover-saved'&&command.request.jobId===report.jobId&&command.request.attemptId===report.attemptId&&command.request.commandId===command.commandId&&command.request.expectedRevision===witness.audit.revision-1,'FINAL_HISTORY_RECOVERY_WITNESS_REQUIRED','Recovery must address its original command revision');
    }
   }else if(duty.kind==='review_run'){
    const run=planning.sketchReviewRuns.find(r=>r.id===duty.id);need(run?.reports?.length,'FINAL_HISTORY_WITNESS_CONFLICT','Completed review run required');
    const completions=run.reports.map(report=>exact('complete-sketch-review',c=>c.jobId===planning.jobs.find(j=>j.reviewRunId===run.id&&j.nodeKey===report.nodeKey)?.id&&c.attemptId===planning.jobs.find(j=>j.reviewRunId===run.id&&j.nodeKey===report.nodeKey)?.attempts?.[0]?.id));
    witness=completions.reduce((a,b)=>a.audit.revision>b.audit.revision?a:b);
   }else if(duty.kind==='reviewed_sketch'){
   }else if(duty.kind==='owner') {
    report=planning.ownerReports.find(item=>item.id===duty.id);witness=exact('complete-owner',c=>c.reportId===report.id&&c.jobId===report.jobId&&c.attemptId===report.attemptId);
   }else {
    const dossier=planning.referenceDossiers.find(item=>item.id===duty.id);
    if(!dossier.reports?.length){blockers.push({code:'FINAL_HISTORY_REFERENCE_COMPLETION_REQUIRED',...duty});continue;}
    if(!referenceWitnesses.has(dossier.id)){
     const completions=referenceOriginalReports(planning,dossier).map(({stored,job,attempt})=>exact('complete-reference-node',c=>c.reportId===stored.id&&c.jobId===job.id&&c.attemptId===attempt.id));
     referenceWitnesses.set(dossier.id,completions.reduce((a,b)=>a.audit.revision>b.audit.revision?a:b));
    }
    witness=referenceWitnesses.get(dossier.id);
   }
   const checkKey=JSON.stringify([planning.id,artifact?'artifact':duty.kind,artifact?.id??duty.id,artifact?sketchHash(JSON.stringify(artifact)):duty.version,witness.audit.revision]);
   let snapshot,checked,closureContext,closedNodeIdentities,checkedExecutionPairs,checkedRawAnchors;
   const reused=originalChecks.get(checkKey);
   if(reused){({checked,closureContext,closedNodeIdentities,checkedExecutionPairs,checkedRawAnchors}=reused);accounting.originalCheckReuses++;}
   else {
   snapshot=store.read(planning.id,witness.audit.revision);accounting.historicalSnapshotReads++;
   accounting.retainedHistoricalSnapshots=1;accounting.peakRetainedHistoricalSnapshots=Math.max(accounting.peakRetainedHistoricalSnapshots,1);
   need(snapshot.id===planning.id&&snapshot.revision===witness.audit.revision,'FINAL_HISTORY_WITNESS_CONFLICT','Exact command-addressed stored revision required');
   if(duty.kind==='reviewed_sketch'){const original=snapshot.artifacts.find(a=>a.id===artifact.id);need(equal(original,artifact),'FINAL_HISTORY_WITNESS_CONFLICT','Exact reviewed artifact changed');checked=await verifyReviewedSketchOriginal(snapshot,original,{executionRoot,imageStore});}
   else if(duty.kind==='review_run'){const original=snapshot.sketchReviewRuns.find(r=>r.id===duty.id);need(equal(original,planning.sketchReviewRuns.find(r=>r.id===duty.id)),'FINAL_HISTORY_WITNESS_CONFLICT','Original review run changed');checked=await verifySketchReviewOriginal(snapshot,original,{executionRoot,imageStore});}
   else if(REVIEW_COLLECTIONS[duty.kind]){const original=snapshot[REVIEW_COLLECTIONS[duty.kind]].find(r=>r.id===report.id);need(equal(original,report),'FINAL_HISTORY_WITNESS_CONFLICT','Original review changed');
    if(report.resolutionId){
     const historical=selectedOriginalCommandIndex(snapshot).entries.filter(e=>e.command.kind==='recover-readiness'&&e.command.jobId===report.jobId);
     need(historical.length===1&&equal(historical[0],witness)&&equal(snapshot.readinessResolutions.filter(r=>r.id===report.resolutionId),planning.readinessResolutions.filter(r=>r.id===report.resolutionId)),'FINAL_HISTORY_RECOVERY_WITNESS_REQUIRED','Original recovery revision and planning witness must remain identical');
    }
    checked={kind:'generic-review-original',...await verifyReviewOriginal(snapshot,duty.kind,original,{executionRoot,imageStore})};}
   else if(artifact){
    const originals=snapshot.artifacts.filter(item=>item.id===artifact.id),jobs=snapshot.jobs.filter(item=>item.id===job.id);
    need(originals.length===1&&jobs.length===1&&equal(originals[0],artifact)&&equal(jobs[0],job),'FINAL_HISTORY_WITNESS_CONFLICT','Original artifact and producer changed between completion and planning');
    checked=await verifyStageOriginal(snapshot,originals[0],{executionRoot});
    const stageWitness=entry=>['request-stage','start-job','retry-job','complete-stage'].includes(entry.command.kind)&&entry.command.jobId===job.id||entry.command.kind==='commit-owner-edge'&&entry.command.edgeId===job.task.ownerEdgeId;
    const originalWitnesses=selectedOriginalCommandIndex(snapshot).entries.filter(stageWitness),planningWitnesses=entries.filter(stageWitness);
    need(equal(originalWitnesses,planningWitnesses),'FINAL_HISTORY_WITNESS_CONFLICT','Ordinary registration, claim and completion witnesses changed between completion and planning');
   }
   else if(duty.kind==='owner') {const original=snapshot.ownerReports.find(item=>item.id===report.id);need(equal(original,report),'FINAL_HISTORY_WITNESS_CONFLICT','Original owner changed between completion and planning');checked=await verifyOwnerOriginal(snapshot,original,{executionRoot});}
   else if(duty.kind==='reference') {const original=snapshot.referenceDossiers.find(item=>item.id===duty.id);need(equal(original.envelope,planning.referenceDossiers.find(item=>item.id===duty.id).envelope)&&equal(original.reports,planning.referenceDossiers.find(item=>item.id===duty.id).reports),'FINAL_HISTORY_WITNESS_CONFLICT','Original reference envelope changed');checked=await verifyReferenceOriginal(snapshot,original,{executionRoot,imageStore});}
   else {
    const original=snapshot.jobs.find(item=>item.id===job.id);need(equal(original,job),'FINAL_HISTORY_WITNESS_CONFLICT','Original job changed between completion and planning');
    if(job.reviewRunId){const run=snapshot.sketchReviewRuns.find(r=>r.id===job.reviewRunId);checked=await verifySketchReviewOriginal(snapshot,run,{executionRoot,imageStore});}
    else if(job.finalVisualRunId)checked=await verifyFinalVisualOriginal(snapshot,snapshot.finalVisualRuns.find(r=>r.id===job.finalVisualRunId),original,{executionRoot,imageStore});
    else if(job.generationId)checked=await verifySketchOriginal(snapshot,snapshot.sketchGenerations.find(item=>item.id===job.generationId),original,{executionRoot,imageStore});
    else {const root=snapshot.jobs.find(item=>item.id===job.contentRootJobId);checked=await verifyContentOriginal(snapshot,root,original,{executionRoot,retainInvalidPlan:original.node?.phase==='plan'&&!original.contentReport.valid});}
   }
   if(job?.purpose==='final_visual_revision'&&checked.kind==='final-visual-text-original'){
    const children=snapshot.finalVisualRuns.filter(run=>run.parentRunId===job.finalVisualRunId&&run.revisionRequestId===job.node.requestId);
    if(children.length){
     need(children.length===1,'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','One exact descendant from an original owner completion required');
     const before=store.read(planning.id,witness.audit.revision-1);accounting.historicalSnapshotReads++;
     accounting.peakRetainedHistoricalSnapshots=Math.max(accounting.peakRetainedHistoricalSnapshots,2);
     need(before.id===planning.id&&before.revision===witness.audit.revision-1,'FINAL_HISTORY_WITNESS_CONFLICT','Exact predecessor snapshot required');
     const replay=replayFinalRevisionCompletion({before,snapshot,witness,checked});
     const fullReplay=applyCommand(before,{...witness.command,expectedRevision:before.revision},job.attempts[0].executor);
     need(equal(replay.finalVisualRuns,fullReplay.finalVisualRuns)&&equal(replay.finalVisualLineage,fullReplay.finalVisualLineage)&&equal(replay.finalVisualRevisionRequests,fullReplay.finalVisualRevisionRequests),'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','Focused constructor must agree with the full original reducer');
     const child=children[0],replayed=replay.finalVisualRuns.find(run=>run.id===child.id),jobs=snapshot.jobs.filter(j=>j.finalVisualRunId===child.id);
     need(equal(replayed,child)&&equal(replay.jobs.filter(j=>j.finalVisualRunId===child.id),jobs)&&equal(replay.finalVisualLineage,snapshot.finalVisualLineage)&&equal(replay.finalVisualRevisionRequests,snapshot.finalVisualRevisionRequests),'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','Original reducer completion must reconstruct the exact child, lineage and queued members');
     checked={...checked,descendantConstruction:{commandId:witness.command.commandId,revision:witness.audit.revision,child:structuredClone(child),jobs:structuredClone(jobs),versions:structuredClone(snapshot.finalVisualLineage.versions)}};
    }
   }
   ({closedNodeIdentities,checkedExecutionPairs,checkedRawAnchors}=checkedOriginalResultFacts({kind:duty.kind,checked,snapshot,planning,index}));
   const dependencies=checked.dependencies??[],cards=dependencies.filter(d=>['task_card','task-card'].includes(d.domain??d.kind)).map(d=>d.taskCardId);
   if(duty.kind==='owner')cards.push(checked.taskCardId);
   closureContext={taskCards:structuredClone(snapshot.taskCards.filter(c=>cards.includes(c.id))),ownerConstraints:[],upstreamReports:[],unresolved:[]};
   for(const d of dependencies.filter(d=>(d.domain??d.kind)==='upstream_review_constraints')){
    if(d.constraints.ownerEdgeId){const edge=snapshot.ownerEdges?.find(e=>e.id===d.constraints.ownerEdgeId);closureContext.ownerConstraints.push({artifactId:d.artifactId,edgeId:d.constraints.ownerEdgeId,value:edge?structuredClone(ownerCopyTask(snapshot,edge).upstreamReviewConstraints?.[d.artifactId]):null});}
    else for(const collection of ['readinessReports','handoffReports'])closureContext.upstreamReports.push({collection,artifactId:d.artifactId,reports:structuredClone((snapshot[collection]??[]).filter(r=>r.artifactId===d.artifactId).map(r=>({reportId:r.id,...reviewContextReport(snapshot,r)})))});
   }
   for(const unresolved of checked.unresolvedDependencies??[])for(const original of Array.isArray(unresolved.original)?unresolved.original:[unresolved.original]){
    const candidates=Object.entries(REVIEW_COLLECTIONS).flatMap(([kind,collection])=>(snapshot[collection]??[]).filter(report=>{const id=original.reportId??original.id;return id?report.id===id&&(!original.rawReport||equal(report.rawReport,original.rawReport)):equal(report.rawReport,original.report??original);}).map(report=>({kind,report:{id:report.id}})));
    closureContext.unresolved.push({field:unresolved.field,original:structuredClone(original),candidates});
   }
   originalChecks.set(checkKey,{checked,closureContext,closedNodeIdentities,checkedExecutionPairs,checkedRawAnchors});accounting.originalChecks++;
   snapshot=null;accounting.retainedHistoricalSnapshots=0;
   }
   if(checked.kind==='content-original'&&checked.valid===false)blockers.push({code:'CONTENT_PLAN_ASSIGNMENT_INVALID',jobId:checked.jobId,reportId:checked.reportId,diagnostics:checked.projection?.diagnostics??[]});
   facts.push({...duty,revision:witness.audit.revision,commandId:witness.command.commandId,closedNodeIdentities,checkedExecutionPairs,checkedRawAnchors,checked});
   if(checked.outputVersionId)settledOutputs.push({jobId:checked.jobId,outputVersionId:checked.outputVersionId,reportHash:checked.reportHash});
   const dependencies=[...(checked.dependencies??[])];
   if(duty.kind==='owner'){
    dependencies.push({kind:'task_card',taskCardId:checked.taskCardId});
    if(checked.producerReport)dependencies.push({kind:'owner',reportId:checked.producerReport.reportId});
   }
   for(const dependency of dependencies) {
    const type=dependency.domain??dependency.kind??(duty.kind==='owner'?'artifact':null),occurrence=dependency.occurrenceIndex??dependency.inputIndex??dependency.index??0;
    const host={domain:checked.kind,id:duty.id,originalPointer:duty.originalPointer,version:duty.version,attemptId:checked.attemptId??duty.attemptId};
    edges.push({parent:host,parentOccurrence:duty.occurrence,occurrence,dependency});
    if(type==='artifact'){
     const sources=planning.artifacts.filter(item=>item.id===dependency.artifactId);
     need(sources.length===1&&sources[0].contentHash===dependency.contentHash&&(!Object.hasOwn(dependency,'provenance')||sources[0].provenance===dependency.provenance),'FINAL_HISTORY_WITNESS_CONFLICT','Exact upstream artifact version and provenance required');
     enqueue('artifact',dependency.artifactId,occurrence,host);
    }else if(['task_card','task-card'].includes(type)){
     const cards=planning.taskCards.filter(c=>c.id===dependency.taskCardId),original=closureContext.taskCards.find(c=>c.id===dependency.taskCardId);
     need(cards.length===1&&equal(cards[0],original),'FINAL_HISTORY_TASK_CARD_CHANGED','Exact historical frozen task card required');
     if(dependency.taskCardHash)need(ownerHash(original)===dependency.taskCardHash,'FINAL_HISTORY_TASK_CARD_CHANGED','Frozen card hash changed');
     const confirms=entries.filter(e=>e.command.kind==='confirm-task-card'&&e.command.taskCardId===original.id&&e.audit.revision<=witness.audit.revision);
     need(confirms.length>0,'FINAL_HISTORY_TASK_CARD_CONFIRMATION_REQUIRED','Original card confirmation witness required');
     terminals.push({parent:host,occurrence,kind:type,taskCard:original,commands:confirms.map(e=>e.command.commandId)});
    }else if(type==='upstream_review_constraints'){
     const frozen=dependency.constraints;
     if(frozen.ownerEdgeId){
      const original=closureContext.ownerConstraints.find(c=>c.edgeId===frozen.ownerEdgeId&&c.artifactId===dependency.artifactId);
      need(original&&equal(original.value,frozen),'FINAL_HISTORY_CONSTRAINT_ORIGINAL_REQUIRED','Exact checked owner input constraints required');
      for(const report of frozen.reports??[])enqueue('owner',report.reportId,occurrence,host);
     }else{
      need(equal(Object.keys(frozen).sort(),['handoffs','readiness']),'FINAL_HISTORY_CONSTRAINT_ORIGINAL_REQUIRED','Supported exact upstream constraint shape required');
      for(const [field,kind,collection] of [['readiness','readiness','readinessReports'],['handoffs','handoff','handoffReports']]){
       const originals=closureContext.upstreamReports.find(r=>r.collection===collection&&r.artifactId===dependency.artifactId)?.reports;
       need(equal(frozen[field],originals),'FINAL_HISTORY_CONSTRAINT_ORIGINAL_REQUIRED','Exact original upstream report list required');
       for(const report of originals)enqueue(kind,report.reportId,occurrence,host);
      }
     }
     terminals.push({parent:host,occurrence,kind:type,artifactId:dependency.artifactId});
    }else if(type==='content-planning-authority'){const root=snapshot.jobs.find(j=>j.id===dependency.rootJobId);need(planningContentPacket(root?.task.packetVersion)&&equal(root.task.planningManifestRef,dependency.descriptor),'FINAL_HISTORY_WITNESS_CONFLICT','Exact historical server planning descriptor required');const authority=await reopenContentPlanningOriginal(snapshot,root,{executionRoot});need(equal(authority.ref,dependency.descriptor),'FINAL_HISTORY_WITNESS_CONFLICT','Fresh canonical planning original required');terminals.push({parent:host,occurrence,kind:type,descriptor:structuredClone(authority.ref)});
    }else if(type==='content-job')enqueue('job',dependency.jobId,occurrence,host);
    else if(type==='owner')enqueue('owner',dependency.reportId,occurrence,host);
    else if(type==='sketch-text'||type==='final-visual-report')enqueue('job',dependency.originalJobId,occurrence,host);
    else if(type==='reference-dossier')enqueue('reference',dependency.dossierId??dependency.original?.dossierId,occurrence,host);
    else if(type==='sketch-generation'){
     const jobs=planning.jobs.filter(j=>j.generationId===dependency.generationId);need(jobs.length>0,'FINAL_HISTORY_GENERATION_REQUIRED','Original generation jobs required');
     for(const job of jobs)enqueue('job',job.id,occurrence,host);
    }else if(type==='sketch-review')enqueue('artifact',dependency.artifactId,occurrence,host);
    else if(type==='sketch-review-report')enqueue('review_run',dependency.reviewRunId??checked.reviewRunId,occurrence,host);
    else if(type==='review'||type==='creative_panel')enqueue(type==='creative_panel'?'creative_panel':dependency.kind,dependency.reportId,occurrence,host);
    else if(type==='reference-report'&&checked.reports?.some(r=>r.stored?.id===dependency.reportId&&r.job.id===dependency.jobId&&r.attempt.id===dependency.attemptId))terminals.push({parent:host,occurrence,kind:type,reportId:dependency.reportId});
    else if(type==='reference-tool'&&dependency.state!=='completed')blockers.push({code:'FINAL_HISTORY_REFERENCE_TOOL_UNFINISHED',parent:host,occurrence,toolId:dependency.toolId,state:dependency.state});
    else if(['calibration','capture','reference-tool'].includes(type)&&duty.kind==='reference')terminals.push({parent:host,occurrence,kind:type,original:dependency});
    else if(type==='image'&&checked.imageOccurrences?.some(image=>image.imageId===dependency.imageId&&image.sha256===dependency.sha256))terminals.push({parent:host,occurrence,kind:type,original:dependency});
    else if(type==='image'&&duty.kind==='reference')terminals.push({parent:host,occurrence,kind:type,original:dependency});
    else blockers.push({code:'FINAL_HISTORY_DEPENDENCY_VALIDATION_REQUIRED',parent:host,occurrence,dependency});
   }
   for(const unresolved of checked.unresolvedDependencies??[]){
    const originals=Array.isArray(unresolved.original)?unresolved.original:[unresolved.original];
    if(!originals.length){terminals.push({parent:duty.id,kind:'frozen-empty-review-input',field:unresolved.field});continue;}
    for(const [occurrence,original] of originals.entries()){
     const candidates=closureContext.unresolved.find(c=>c.field===unresolved.field&&equal(c.original,original))?.candidates??[];
     if(candidates.length===1){enqueue(candidates[0].kind,candidates[0].report.id,occurrence,{domain:'frozen-review-input',id:duty.id,field:unresolved.field});edges.push({parent:duty.id,field:unresolved.field,occurrence,reportId:candidates[0].report.id});}
     else blockers.push({code:'FINAL_HISTORY_FROZEN_INPUT_DEPENDENCY_REQUIRED',parent:duty.id,field:unresolved.field,occurrence});
    }
   }

  }catch(error){accounting.retainedHistoricalSnapshots=0;blockers.push({code:error.code??'FINAL_HISTORY_ORIGINAL_FAILED',...duty,message:error.message});}
  current();
 }
 const convergences=[];
 for(const node of index.nodes.filter(n=>n.domain==='final_visual_run'&&selected.nodeIdentities.includes(n.identity))) {
  current();const run=visibilityPointer(planning,node.originalPointer);if(!run.convergence)continue;
  try {
   const witness=exact('converge-final-visual',c=>c.runId===run.id);
   const before=store.read(planning.id,witness.audit.revision-1),after=store.read(planning.id,witness.audit.revision);accounting.historicalSnapshotReads+=2;accounting.peakRetainedHistoricalSnapshots=Math.max(accounting.peakRetainedHistoricalSnapshots,2);
   need(before.revision+1===after.revision&&after.revision===witness.audit.revision,'FINAL_CONTAINER_CONVERGENCE_HISTORY_REQUIRED','Exact convergence revisions required');
   const replay=structuredClone(before),target=replay.finalVisualRuns.find(r=>r.id===run.id);
   need(target&&target.runtimeStatus==='production'&&!target.convergence,'FINAL_CONTAINER_CONVERGENCE_HISTORY_REQUIRED','First original convergence adoption required');
   adoptFinalReviewConvergence(replay,target);
   need(typeof witness.audit.actorId==='string'&&witness.audit.actorId.length>0,'FINAL_CONTAINER_CONVERGENCE_HISTORY_REQUIRED','Original reducer audit actor required');
   const fullReplay=applyCommand(before,{...witness.command,expectedRevision:before.revision},{actorType:'agent',actorId:witness.audit.actorId,runId:`replay-${witness.command.commandId}`,contextId:`replay-${witness.command.commandId}`});
   need(equal(fullReplay.finalVisualRuns.find(r=>r.id===run.id),target),'FINAL_CONTAINER_CONVERGENCE_CHANGED','Original full reducer must reproduce the exact adoption');
   need(equal(target,after.finalVisualRuns.find(r=>r.id===run.id))&&equal(target.convergence,run.convergence),'FINAL_CONTAINER_CONVERGENCE_CHANGED','Exact owner convergence adoption required');
   convergences.push({runId:run.id,commandId:witness.command.commandId,revision:witness.audit.revision,value:structuredClone(target.convergence)});
  }catch(error){blockers.push({code:error.code??'FINAL_CONTAINER_CONVERGENCE_HISTORY_REQUIRED',recordId:run.id,message:error.message});}
  current();
 }
 return {facts,blockers,settledOutputs,edges,terminals,deferred,convergences,duties:{status:blockers.length?'unsettled':'checked',unsettled:blockers.map(b=>({status:'unsettled',...b}))},accounting,digestWitnesses};
}
