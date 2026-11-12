import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,applyCommand} from './project.mjs';
import {reduceVisualBStep,requireVisualBClaim} from './visual-b-http.mjs';
import {createVisualBService} from './visual-b-service.mjs';
import {visualMethod} from './visual-a-service.mjs';
import {finalRequest,validateFinalPlan,requireFinalRevisionOwner} from './final-visual.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';
const ctx={actorType:'agent',actorId:'metadata-only',runId:'local',contextId:'local'};
// Constructed metadata/legacy receipts exercise actual native validators. No
// files/provider/artwork/upstream approval or complete native business chain.
async function fixture(multi=false) {
 let p=structuredClone(createProject({id:'revision-seam-only',name:'Metadata boundary',brief:'No artwork',mode:'auto',humanGates:[],authorizedThrough:'visual',workflowVersion:'proposal-seven-v1'},ctx));
 p.taskCards[0].brief=JSON.stringify({format:'proposal-workbench-brief-v1',fields:{proposalType:'packaging'}});
 const sha='a'.repeat(64),ids=['d1','d2','d3'],copy={directions:ids.map(id=>({id,slogan:'fixture'})),claims:[]};
 const selected=ids.map((directionId,i)=>({directionId,candidateId:`c${i}`,imageId:`i${i}`,sha256:sha}));
 const source={sourceHash:sha,copy,selected,images:selected,task:{},sketchArtifact:{authority:{generationId:'g',reviewRunId:'v2'}},neutralReferences:{referenceBoundaries:[],referenceQualifications:[]}};
 const binding={providerId:'local',model:'none',role:'visual-lead'};
 const parent={id:'parent',source,reports:[],capabilities:{owner:{maxImages:9,maxBytes:99999,maxPixels:99999}},assignments:{planner:binding}};
 p.finalVisualRuns=[parent];p.finalVisualHeadRunId='parent';
 const job={id:'revision',finalVisualRunId:'parent',purpose:'final_visual_revision',node:{key:'revision:r',phase:'revision',role:'visual-lead',dependencies:[],requestId:'r'},binding,status:'queued',attempts:[]};
 p.jobs=[job];if(multi)p.jobs.push({...structuredClone(job),id:'remaining',purpose:'final_visual_review',node:{key:'score:visual',phase:'score'}});
 const request={commandId:'fixed',expectedRevision:0,phase:'final_visual',targetId:'parent',sourceHash:sha,jobIds:p.jobs.map(j=>j.id)};
 reduceVisualBStep(p,{request,method:await visualMethod(p)},ctx);
 const entry={request:{id:'r',parentRunId:'parent',sourceHash:sha,returnId:'return'},status:'requested'};p.finalVisualRevisionRequests=[entry];p.finalVisualReturns=[{id:'return'}];
 let executes=0,advances=0,commands=0;
 function commit() {
  const req=finalRequest(p,parent,job.node);
  const raw={protocol:'final-visual-v1',envelopeHash:req.input.envelopeHash,nodeKey:job.node.key,requestId:'r',sourceHash:sha,kind:'plan',copy:copy.directions,workOrder:'metadata fixture',specialistRequirements:[],directions:selected.map(s=>({directionId:s.directionId,selectedCandidateId:s.candidateId,selectedImageId:s.imageId,approvedCopy:copy.directions.find(d=>d.id===s.directionId),explanation:'fixture',presentationIntent:'fixture',claims:[],limitations:['Concept only; manufacturing and print unverified.'],targets:[{id:`t-${s.directionId}`,kind:'packaging',use:'fixture',format:'fixture',requiredViews:['front'],typography:{copy:copy.directions.find(d=>d.id===s.directionId),route:'generated_integrated',hierarchy:'fixture',placement:'fixture',imageInteraction:'fixture'},operation:{kind:'edit',prompt:'Never sent',options:{},images:[{imageId:s.imageId,sha256:sha}]}}]}))};
  const receipt={runId:'attempt',model:'none',requestedModel:'none',exitCode:0,threadId:'isolated-metadata',inputPacketHash:hash({runId:'attempt',model:'none',...req.request}),images:req.request.images,responseText:JSON.stringify(raw)};
  job.status='succeeded';job.attempts=[{id:'attempt',status:'succeeded',receipt,executor:{actorId:'metadata',runId:'attempt',contextId:'attempt'}}];
  const report={id:'report',valid:true,raw,receipt};parent.reports.push(report);
  Object.assign(entry,{status:'committed',response:raw,result:{status:'committed',runId:'child',changedDirectionIds:ids},ownerEvidence:{jobId:job.id,attemptId:'attempt',reportId:report.id,reportHash:hash(report)}});
  const child={id:'child',parentRunId:parent.id,revisionRequestId:'r',source:structuredClone(source),plan:validateFinalPlan(raw,source),runtimeStatus:'production'};p.finalVisualRuns.push(child);p.finalVisualHeadRunId='child';
  requireFinalRevisionOwner(p,child);
 }
 const store={read:()=>p,command:(_id,c,context)=>{commands++;p=structuredClone(applyCommand(p,c,context));}};
 const service=createVisualBService({store,executionAllowed:true,executor:{execute:async()=>{executes++;commit();},advanceFinalVisual:async()=>{advances++;}}});
 return {get p(){return p;},request,service,commit,counts:()=>({executes,advances,commands})};
}
for(const multi of [false,true])test(`revision persists terminal child receipt and exact readonly replay; remaining=${multi}`,async()=>{
 const f=await fixture(multi),result=await f.service.step(f.p.id,f.request);
 assert.equal(result.receipt.progress.status,'revision_committed');assert.equal(result.receipt.progress.runId,'child');assert.deepEqual(result.receipt.progress.unexecutedJobIds,multi?['remaining']:[]);
 const again=await f.service.step(f.p.id,f.request);assert.deepEqual(again.receipt.progress,result.receipt.progress);assert.deepEqual(f.counts(),{executes:1,advances:0,commands:1});
 await assert.rejects(f.service.step(f.p.id,{...f.request,sourceHash:'b'.repeat(64)}),{code:'COMMAND_ID_REUSED'});
 assert.throws(()=>requireVisualBClaim(f.p,'fixed',f.p.jobs[0]),{code:'VISUAL_B_STEP_COMPLETED'});
 if(multi)assert.equal(f.p.jobs[1].attempts.length,0);
 const childJob={...structuredClone(f.p.jobs[0]),id:'child-job',finalVisualRunId:'child',status:'queued',attempts:[]};f.p.jobs.push(childJob);
 assert.throws(()=>reduceVisualBStep(f.p,{request:{...f.request,commandId:'old-parent',jobIds:['child-job']},method:f.p.visualBHttpRequests[0].method},ctx),{code:'VISUAL_B_TARGET_REQUIRED'});
 reduceVisualBStep(f.p,{request:{...f.request,commandId:'new-child',targetId:'child',jobIds:['child-job']},method:f.p.visualBHttpRequests[0].method},ctx);assert.equal(f.p.visualBHttpRequests.at(-1).target.targetId,'child');
});
for(const change of ['head-only','missing-owner','changed-report','different-source','unrelated-child','unknown-parent','unknown-child','changed-ledger-job'])test(`unproven/unsafe revision transition refuses completion: ${change}`,async()=>{
 const f=await fixture(true);f.commit();
 if(change==='head-only')f.p.finalVisualRuns[1].revisionRequestId='invented';
 if(change==='missing-owner')delete f.p.finalVisualRevisionRequests[0].ownerEvidence;
 if(change==='changed-report')f.p.finalVisualRuns[0].reports[0].raw.workOrder='tampered';
 if(change==='different-source')f.p.finalVisualRuns[1].source.sourceHash='b'.repeat(64);
 if(change==='unrelated-child')f.p.finalVisualRuns[1].parentRunId='unrelated';
 if(change==='unknown-parent')f.p.jobs[1].status='unknown';
 if(change==='unknown-child')f.p.jobs.push({id:'unknown',finalVisualRunId:'child',purpose:'final_visual_image',status:'running',attempts:[]});
 if(change==='changed-ledger-job')f.p.jobs[1].binding.model='tampered';
 await assert.rejects(f.service.step(f.p.id,f.request));assert.deepEqual(f.counts(),{executes:0,advances:0,commands:0});assert.equal(f.p.visualBHttpRequests[0].revisionResult,undefined);
});
