import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {copyDeliveryEnvelope} from './project.mjs';
import {FINAL_VISUAL_PROTOCOL,FINAL_CONDITIONS,finalVisualSource,selectFinalVisualRun,requireFinalVisual,finalOutcome,finalPayload} from './final-visual.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
const clone=structuredClone;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const limitation='Synthetic local engineering artwork and mechanical reviews only; no real fine-art quality, product accuracy, consumer preference or commercial permission verified.';
const roles=['visual','brand','user','communication'];
export function localFinalVisualConfiguration({providerId='local-synthetic',model='synthetic'}={}) {
 need(providerId==='local-synthetic'&&model==='synthetic','LOCAL_FINAL_SYNTHETIC_ONLY');
 const bindings={visual:{providerId,model,role:'visual-lead'},...Object.fromEntries([...roles.flatMap(r=>['score_'+r,'opposition_'+r]),'director'].map(key=>['final_visual_'+key,{providerId,model,role:'final-visual-'+key}]))};
 const cap={operation:FINAL_VISUAL_PROTOCOL,status:'synthetic_fixture',assignment:{providerId,model},origin:'local-acceptance',version:'1',limitations:[limitation],maxImages:64,maxBytes:32*1024*1024,maxPixels:128*1024*1024};
 return {bindings,finalVisualConfiguration:{origin:'local-acceptance',version:'1',maxImageCalls:12,maxReviewCalls:40,capabilities:Object.fromEntries(['owner','director',...roles.flatMap(r=>['score_'+r,'opposition_'+r])].map(key=>[key,clone(cap)]))}};
}
export function localFinalVisualPlan(input,{caseId}={}) {
 need(['m6','dexian'].includes(caseId),'LOCAL_FINAL_CASE_REQUIRED');
 const source=input.production?.source;need(source?.selected?.length===3&&source.copy?.directions?.length===3,'LOCAL_FINAL_SOURCE_REQUIRED');
 const requirements=source.task.finalVisualRequirements?.length?source.task.finalVisualRequirements:[{kind:caseId==='m6'?'kv':'packaging',views:['front']}];
 return {protocol:FINAL_VISUAL_PROTOCOL,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,kind:'plan',sourceHash:source.sourceHash,copy:clone(source.copy.directions),findings:[],workOrder:'Execute actual selected sketches through the replaceable edit provider; preserve approved copy and all source limitations. '+limitation,specialistRequirements:[],directions:source.selected.map((selected,index)=>{
  const copy=source.copy.directions.find(d=>d.id===selected.directionId);need(copy,'LOCAL_FINAL_COPY_REQUIRED');
  return {directionId:selected.directionId,selectedCandidateId:selected.candidateId,selectedImageId:selected.imageId,approvedCopy:clone(copy),explanation:'Local refinement wiring of approved direction; not a new creative approval.',presentationIntent:'Engineering sample for online edit and export only.',claims:clone(source.copy.claims??[]),limitations:[limitation,'Concept packaging only; manufacturing, material, print and die-line feasibility are unverified.'],targets:requirements.map((requirement,n)=>({id:'local-final-'+index+'-'+n,kind:requirement.kind,use:'Local acceptance proposal',format:'landscape',requiredViews:clone(requirement.views),typography:{copy:clone(copy),route:'generated_integrated',hierarchy:'Single approved headline then small supporting text',placement:'Part of image composition',imageInteraction:'Joint image and lettering, not a later overlay'},operation:{kind:'edit',options:{size:'1280x720',quality:'standard',output_format:'png',response_format:'b64_json'},images:[{imageId:selected.imageId,sha256:selected.sha256}],prompt:'SYNTHETIC_SKETCH_JSON\n'+JSON.stringify({phase:'final',selectedImage:{imageId:selected.imageId,sha256:selected.sha256},caseId,directionId:selected.directionId,variant:index,slogan:copy.slogan??copy.theme??copy.headline??copy.title??copy.id,supportingCopy:(copy.supportingCopy??'')+' 本地工程样图，非商业完稿。'+limitation})+'\nEND_SYNTHETIC_SKETCH_JSON'}}))};})};
}
export function localFinalVisualCaseIdentity(record,project){
 if(record?.caseId!==undefined){need(['m6','dexian'].includes(record.caseId),'LOCAL_FINAL_CASE_INVALID');return record.caseId;}
 const name=project?.name??'',m6=/梦之蓝|M6\+/.test(name),dexian=/得闲/.test(name);need(!(m6&&dexian),'LOCAL_FINAL_CASE_AMBIGUOUS');return m6?'m6':dexian?'dexian':null;
}
export function localFinalVisualResponse({job,request,packet,project,case:record}) {
 if(!job.purpose?.startsWith('final_visual_')||job.purpose==='final_visual_image')return undefined;
 const input=packet??JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
 if(input.protocol!==FINAL_VISUAL_PROTOCOL)return undefined;
 if(input.phase==='planner')return localFinalVisualPlan(input,{caseId:localFinalVisualCaseIdentity(record,project)});
 need(input.phase!=='revision','LOCAL_FINAL_REVISION_FIXTURE_UNIMPLEMENTED');
 const raw={protocol:FINAL_VISUAL_PROTOCOL,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,findings:[],limitations:[limitation]};
 const evidence=targets=>targets.map(t=>({imageId:t.imageId,sha256:t.sha256,region:'whole image',observation:limitation}));
 if(input.phase==='score')raw.entries=input.targets.map(t=>({targetId:t.targetId,imageId:t.imageId,sha256:t.sha256,firstReading:limitation,score:4,cannotAssess:false,evidence:evidence([t]),findings:[]}));
 if(input.phase==='blind')raw.readings=input.targets.map(t=>({targetId:t.targetId,imageId:t.imageId,sha256:t.sha256,firstReading:limitation,evidence:evidence([t])}));
 if(input.phase==='challenge')Object.assign(raw,{preservedBlind:clone(input.predecessors.find(p=>p.nodeKey.startsWith('blind:')).raw),challenges:[]});
 if(input.phase==='director'){
  const ids=[...new Set(input.targets.map(t=>t.directionId))];
  Object.assign(raw,{decision:'accept',dispositions:[],conditions:input.targets.flatMap(t=>FINAL_CONDITIONS.map(name=>({targetId:t.targetId,name,status:'pass',evidence:evidence([t])}))),packages:ids.map(id=>({directionId:id,complete:true,evidence:evidence(input.targets.filter(t=>t.directionId===id))})),comparisons:ids.flatMap((id,i)=>ids.slice(i+1).map(other=>({pair:[id,other],distinct:true,evidence:evidence(input.targets.filter(t=>[id,other].includes(t.directionId)))})))});
 }
 if(input.phase==='aggregate')Object.assign(raw,{kind:'aggregate',decision:'accept',understanding:limitation,payload:clone(input.production.expectedPayload)});
 return raw;
}
export function createLocalFinalVisualDriver({projectStore,executor,executionRoot,imageProvider,configuration}={}) {
 const idOf=ctx=>ctx.case?.projectId??ctx.project.id;
 const marked={syntheticOnly:true,realQualityVerified:false,contentAccepted:false};
 async function inspect(ctx) {
  try {
   need(configuration?.finalVisualConfiguration,'LOCAL_FINAL_CONFIGURATION_REQUIRED');
   const capability=imageProvider?.capability?.();need(capability?.invocationSupported,'LOCAL_FINAL_IMAGE_PROVIDER_REQUIRED');need(capability.operations?.edit===true,'LOCAL_FINAL_IMAGE_EDIT_UNAVAILABLE');
   const p=projectStore.read(idOf(ctx)),source=finalVisualSource(p,copyDeliveryEnvelope),run=selectFinalVisualRun(p,source.sourceHash);
   if(!run)return {status:'pending',nextOperation:'request',...marked};
   const jobs=p.jobs.filter(j=>j.finalVisualRunId===run.id),bad=jobs.find(j=>['failed','blocked','awaiting_reconciliation'].includes(j.status));
   if(bad)return {status:bad.status==='awaiting_reconciliation'?bad.status:'blocked',reason:bad.error?.code??'LOCAL_FINAL_JOB_BLOCKED',jobIds:[bad.id],...marked};
   const artifact=p.artifacts.find(a=>a.id===p.activeByStage.visual&&a.finalVisual?.runId===run.id);
   if(artifact){const expected=JSON.stringify(finalPayload(p,run)),limit=Buffer.byteLength(expected);need(limit>0&&limit<=64*1024*1024,'LOCAL_FINAL_ARTIFACT_INVALID');const bytes=await readManagedLayoutBytes(executionRoot,artifact.payloadRef,limit);need(bytes.toString('utf8')===expected&&createHash('sha256').update(bytes).digest('hex')===artifact.contentHash,'LOCAL_FINAL_ARTIFACT_INVALID');const verified=await executor.verifyFinalVisual(p.id,artifact);try{requireFinalVisual(p,artifact,copyDeliveryEnvelope);}catch(e){if(e.code==='HUMAN_GATE')return {status:'awaiting_user',reason:'HUMAN_GATE',artifactId:artifact.id,draftHash:artifact.contentHash,...marked};throw e;}need(verified?.payload?.protocol===FINAL_VISUAL_PROTOCOL&&JSON.stringify(verified.payload)===expected,'LOCAL_FINAL_ARTIFACT_INVALID');
    const release=p.releases.find(r=>r.artifactId===artifact.id&&r.policyVersion===p.policies.at(-1).version);if(release)return {status:'complete',deliveryReady:true,artifactId:artifact.id,resultIds:[artifact.id],jobIds:jobs.map(j=>j.id),runId:run.id,outcome:finalOutcome(run),...marked};}
   return {status:'pending',nextOperation:'advance',runId:run.id,...marked};
  } catch(e){return {status:e.code==='HUMAN_GATE'?'awaiting_user':'blocked',reason:e.code??'LOCAL_FINAL_INSPECTION_FAILED',...marked};}
 }
 async function advance(ctx){const state=await inspect(ctx);if(state.status!=='pending')return state;const id=idOf(ctx);const next=state.nextOperation==='request'?await executor.continueFinalVisual(id,{commandId:'local-final-'+hash([id,projectStore.read(id).activeByStage.sketch]),expectedRevision:projectStore.read(id).revision}):await executor.advanceFinalVisual(id);
  if(next.queuedJobIds?.length)await executor.execute(id,next.queuedJobIds[0]);
  else if(['blocked','failed','owner_returned'].includes(next.status))return {status:'blocked',reason:next.reason??next.status,...marked};
  else if(next.status==='awaiting_human_adoption')return {status:'awaiting_user',reason:'HUMAN_GATE',artifactId:next.artifactId,draftHash:next.draftHash,...marked};
  return inspect(ctx);
 }
 async function decide(ctx){const state=await inspect(ctx);need(state.status==='awaiting_user'&&state.reason==='HUMAN_GATE'&&ctx.request?.decision==='approve'&&ctx.request.contribution===undefined,'LOCAL_FINAL_EXPLICIT_ADOPTION_REQUIRED');const p=projectStore.read(idOf(ctx));await executor.verifyFinalVisual(p.id,p.artifacts.find(a=>a.id===state.artifactId));projectStore.command(p.id,{kind:'adopt-final-visual',artifactId:state.artifactId,draftHash:state.draftHash,reason:ctx.request.comment||'Explicit local acceptance user adoption; mechanical sample only, not commercial quality approval.',commandId:ctx.request.commandId,expectedRevision:projectStore.read(p.id).revision},{actorType:'human',actorId:'local-acceptance-user',runId:randomUUID(),contextId:randomUUID()});return {disposition:'adopted',artifactId:state.artifactId,draftHash:state.draftHash,...marked};}
 return {inspect,advance,decide};
}
