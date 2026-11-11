import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {REVIEW_PROTOCOL,CONDITIONS,COMPOSITE_CONDITIONS} from './sketch-review-v2.mjs';
import {SKETCH_PROTOCOL} from './sketch-authority.mjs';
import {syntheticImagePrompt} from '../local-acceptance/synthetic-image-server.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const limitation='SYNTHETIC local engineering fixture: predetermined mechanical scores and readings; no AI image creation, independent human aesthetic approval, consumer research, or real communication effect was tested.';
const label={steady:'concentric ceremonial frame',product:'contour as invitation gateway',user:'diagonal invitation ribbon'};
const arrangements=['centered circular front elevation','oblique nested frame with dominant negative space','asymmetric triangular perspective with foreground circle'];
export function localSketchConfiguration({referenceBinding,providerId='local-synthetic',model='synthetic',maxImageCalls=12}={}){
 need(referenceBinding?.role==='references-lead'&&referenceBinding.providerId===providerId&&referenceBinding.model===model,'LOCAL_SKETCH_REFERENCE_BINDING_REQUIRED');
 need(Number.isSafeInteger(maxImageCalls)&&maxImageCalls>=9&&maxImageCalls<=100,'LOCAL_SKETCH_IMAGE_LIMIT_INVALID');
 const keys=['sketch','visual',...['visual','brand','user','communication'].flatMap(r=>[`sketch_review_score_${r}`,`sketch_review_opposition_${r}`]),'sketch_review_director'];
 const bindings={reference_lead:structuredClone(referenceBinding),...Object.fromEntries(keys.map(k=>[k,{providerId,model,role:k==='sketch'?'sketch-lead':k==='visual'?'visual-lead':k}]))};
 return {bindings,sketchConfiguration:{maxCalls:maxImageCalls,origin:'local-synthetic-engineering',version:'local-sketch-v1'},sketchReviewConfiguration:{maxCalls:54,origin:'local-synthetic-engineering',version:'local-sketch-review-v1',capability:{operation:REVIEW_PROTOCOL,origin:'local-synthetic-engineering',version:'local-sketch-review-v1',status:'synthetic_fixture',maxImages:32,maxBytes:64*1024*1024,maxPixels:64*1024*1024,assignment:{providerId,model},limitations:[limitation]}}};
}
function caseIdentity(project,record){
 const explicit=record?.caseId;need(explicit===undefined||['m6','dexian'].includes(explicit),'LOCAL_SKETCH_CASE_INVALID');
 const name=project?.name??'',canonical=/得闲/.test(name)?'dexian':/梦之蓝|M6\+/.test(name)?'m6':null;
 need(!explicit||!canonical||explicit===canonical,'LOCAL_SKETCH_CASE_MISMATCH');need(explicit??canonical,'LOCAL_SKETCH_CASE_REQUIRED');return explicit??canonical;
}
function reviewResponse(input){
 const candidates=input.cohort.candidates;
 const evidence=items=>items.map(c=>({imageId:c.imageId,sha256:c.sha256,region:'full original canvas',observation:'Synthetic fixture original identity and deterministic fixture geometry; not an empirical aesthetic judgment.'}));
 const readings=candidates.map(c=>({...c,firstReading:'Known synthetic engineering composition, not audience inference.',evidence:evidence([c])}));
 const comparisons=candidates.flatMap((c,i)=>candidates.slice(i+1).map(d=>({pair:[c.candidateId,d.candidateId],distinct:true,evidence:evidence([c,d])})));
 const raw={protocol:REVIEW_PROTOCOL,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,readings,findings:[],comparisons,limitations:[limitation]};
 if(input.phase==='score'&&!input.qualitative)raw.entries=candidates.map(c=>({...c,firstReading:'Synthetic geometry rubric fixture.',score:4,cannotAssess:false,evidence:evidence([c]),conditions:CONDITIONS.map(name=>({name,status:'pass'})),findings:[]}));
 if(input.phase==='challenge'){
  need(input.predecessors.every(p=>(p.findings??[]).length===0),'LOCAL_SKETCH_UNEXPECTED_DISSENT');raw.challenges=[];
  const blind=input.predecessors.find(p=>p.raw?.readings)?.raw.readings;if(blind)raw.readings=structuredClone(blind);
 }
 if(input.phase==='director'){
  need(input.predecessors.every(p=>(p.findings??[]).length===0),'LOCAL_SKETCH_UNEXPECTED_DISSENT');raw.dispositions=[];
  raw.conditions=candidates.flatMap(c=>(input.qualitative?COMPOSITE_CONDITIONS:CONDITIONS).map(name=>({candidateId:c.candidateId,name,status:'pass',evidence:evidence(['cross_direction_proposition','copy_interchangeability'].includes(name)?candidates:[c])})));
  if(!input.qualitative)raw.ties=[{candidateIds:candidates.map(c=>c.candidateId),winnerId:candidates[0].candidateId,reason:'Deterministic engineering-only tie fixture: stable inventory order, not aesthetic superiority.',evidence:evidence(candidates)}];
  else raw.decision='accept';
 }
 if(['producer','consumer'].includes(input.phase))Object.assign(raw,{decision:'accept',understanding:limitation,preservedCopy:structuredClone(input.handoff.completeCopy),selected:structuredClone(candidates),refinementRequirements:[{owner:'visual-lead',requirement:'Preserve exact approved copy, selected original identities, holiday imagery where applicable, product unknowns and synthetic limitations.',evidence:evidence(candidates)}]});
 return raw;
}
export function localSketchResponse({job,packet,request,project,case:record}){
 if(['sketch_review_v2','sketch_refinement_handoff'].includes(job.purpose))return reviewResponse(packet);
 if(!['sketch_owner','sketch_plan'].includes(job.purpose))return undefined;
 const input=packet,source=input.source;need(input.protocol===SKETCH_PROTOCOL,'LOCAL_SKETCH_PACKET_INVALID');
 if(input.kind==='handoff')return {protocol:SKETCH_PROTOCOL,kind:'handoff',sourceHash:input.sourceHash,side:input.side,ownerBinding:input.ownerBinding,decision:'accept',understanding:limitation,findings:[],limitations:[limitation]};
 need(input.kind==='plan'&&source.directionIds.length===3,'LOCAL_SKETCH_PLAN_REQUIRED');
 const caseId=caseIdentity(project,record),copy=source.referenceSource.source.content.directions;
 need(copy.length===3&&copy.every(d=>label[d.id]),'LOCAL_SKETCH_DIRECTIONS_UNSUPPORTED');
 const candidates=copy.flatMap(d=>[0,1,2].map(variant=>{
  const selection=source.selection.find(s=>s.directionId===d.id);need(selection,'LOCAL_SKETCH_SELECTION_REQUIRED');
  return {id:`${d.id}-${variant+1}`,directionId:d.id,subject:d.title??d.slogan,arrangement:arrangements[variant],visualMechanism:`${label[d.id]} / ${arrangements[variant]}`,themeConnection:caseId==='m6'?'A visible single New Year lantern seal anchors the generic Spring Festival occasion.':'Relaxed social invitation only; alcohol strength, volume and structure remain unknown.',siblingDistinction:arrangements[variant],coverage:[selection.main,...selection.complements].map(u=>({useId:u.id,mode:'translated',translation:`Engineering translation only: ${u.allowedBorrowing??'composition boundary'} into ${arrangements[variant]}.`,limitation:`No reference pixels or style quality reproduced. ${u.limitation??''} ${limitation}`})),operation:{kind:'generate',prompt:syntheticImagePrompt({caseId,directionId:d.id,variant,slogan:d.slogan,supportingCopy:d.supportingCopy,phase:'sketch'}),options:{size:'1280x720',quality:'standard',output_format:'png',response_format:'b64_json'}}};
 }));
 return {protocol:SKETCH_PROTOCOL,kind:'plan',sourceHash:input.sourceHash,copy:structuredClone(copy),candidates};
}
export function createLocalSketchDriver({projectStore,executor}){
 need(projectStore&&executor,'LOCAL_SKETCH_CONFIGURATION_REQUIRED');
 const idOf=({project,case:record})=>record?.projectId??project.id;
 const related=p=>{const g=p.sketchGenerations?.at(-1);return g?p.jobs.filter(j=>j.generationId===g.id):[];};
 async function inspect(context){const id=idOf(context),p=projectStore.read(id);
  const bad=related(p).find(j=>['failed','blocked','awaiting_reconciliation'].includes(j.status));if(bad)return {status:bad.status==='awaiting_reconciliation'?'awaiting_reconciliation':'blocked',reason:bad.error?.code??'LOCAL_SKETCH_JOB_BLOCKED',jobId:bad.id,syntheticOnly:true};
  const artifact=p.artifacts.find(a=>a.id===p.activeByStage.sketch&&a.sketchGeneration?.protocol===REVIEW_PROTOCOL);
  if(artifact){try{await executor.verifyReviewedSketch(id,artifact);const run=p.sketchReviewRuns.find(r=>r.id===artifact.sketchGeneration.reviewRunId);
   const producer=run.reports.find(r=>r.phase==='producer'&&r.valid&&r.raw.decision==='accept'),consumer=run.reports.find(r=>r.phase==='consumer'&&r.valid&&r.raw.decision==='accept');
   if(p.policies.at(-1).humanGates.includes('sketch')&&!p.decisions.some(d=>d.human&&d.kind==='adopt-creative'&&d.artifactId===artifact.id&&d.policyVersion===p.policies.at(-1).version&&isDeepStrictEqual(d.sketchGeneration,artifact.sketchGeneration)))return {status:'awaiting_user',reason:'HUMAN_GATE',artifactId:artifact.id,reviewRunId:run.id,syntheticOnly:true};
   if(producer&&consumer)return {status:'complete',artifactId:artifact.id,resultIds:[artifact.id],generationId:run.generationId,reviewRunId:run.id,selected:structuredClone(artifact.sketchGeneration.selected),jobIds:related(p).map(j=>j.id),syntheticOnly:true,realQualityVerified:false};
  }catch(e){return {status:'blocked',reason:e.code??'LOCAL_SKETCH_ORIGINAL_INVALID',syntheticOnly:true};}}
  const reference=await executor.referenceStatus(id);return {status:reference.status==='ready_for_sketch'?'pending':'blocked',reason:reference.status==='ready_for_sketch'?'LOCAL_SKETCH_ADVANCE_REQUIRED':reference.reason??'SKETCH_REFERENCE_REQUIRED',syntheticOnly:true};
 }
 async function advance(context){const id=idOf(context);let state=await inspect(context);if(state.status!=='pending')return state;
  let p=projectStore.read(id),queued=related(p).find(j=>j.status==='queued');if(queued){await executor.execute(id,queued.id);return inspect(context);}
  let progress;if(!p.sketchIntents?.length)progress=await executor.continueSketch(id,{commandId:`local-sketch-${p.activeByStage.copy}`,expectedRevision:p.revision});else progress=await executor.advanceSketch(id);
  if(progress.status==='candidates_ready'){
   p=projectStore.read(id);progress=!p.sketchReviewIntents?.length?await executor.continueSketchReview(id,{commandId:`local-sketch-review-${p.sketchGenerations.at(-1).id}`,expectedRevision:p.revision}):await executor.advanceSketchReview(id);
  }
  if(progress.status==='awaiting_human_adoption')return {status:'awaiting_user',reason:'HUMAN_GATE',artifactId:progress.artifactId,syntheticOnly:true};
  if(['blocked','failed','awaiting_reconciliation','handoff_returned','revision_required','incomplete','returned'].includes(progress.status))return {status:progress.status==='awaiting_reconciliation'?'awaiting_reconciliation':'blocked',reason:progress.reason??progress.status,syntheticOnly:true};
  p=projectStore.read(id);queued=related(p).find(j=>j.status==='queued');if(queued)await executor.execute(id,queued.id);return inspect(context);
 }
 async function decide(context){
  need(context.request?.decision==='approve'&&context.request.contribution===undefined,'LOCAL_SKETCH_CONTRIBUTION_HANDLER_REQUIRED');
  const id=idOf(context),state=await inspect(context);need(state.status==='awaiting_user','LOCAL_SKETCH_NO_HUMAN_GATE');
  const p=projectStore.read(id),artifact=p.artifacts.find(a=>a.id===state.artifactId),prior=context.project;
  need(prior?.activeByStage.sketch===artifact.id&&prior.policies.at(-1).version===p.policies.at(-1).version&&isDeepStrictEqual(prior.artifacts.find(a=>a.id===artifact.id)?.sketchGeneration,artifact.sketchGeneration),'LOCAL_SKETCH_HUMAN_SOURCE_STALE');
  need(typeof context.request.commandId==='string'&&context.request.commandId.length>0,'LOCAL_SKETCH_HUMAN_COMMAND_REQUIRED');
  await executor.verifyReviewedSketch(id,artifact);
  projectStore.command(id,{kind:'adopt-creative',artifactId:artifact.id,reason:context.request.comment||'Explicit user adoption of the currently reviewed synthetic local sketch, not factual or aesthetic evidence.',commandId:context.request.commandId,expectedRevision:p.revision},{actorType:'human',actorId:'local-acceptance-user',runId:randomUUID(),contextId:randomUUID()});
  return {disposition:'adopted',artifactId:artifact.id,reviewRunId:state.reviewRunId,syntheticOnly:true};
 }
 return {inspect,advance,decide};
}
