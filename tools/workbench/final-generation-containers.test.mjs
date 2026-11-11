import assert from 'node:assert/strict';
import {sketchHash as hash,validateSketchPlan} from './sketch-authority.mjs';
import {validateFinalPlan,finalPanelNodes,finalBinding,finalTargets,finalImages,finalRequest,ingestFinalResponse,FINAL_CONDITIONS,finalPayload,FINAL_AGGREGATE_PARSER,reduceFinalVisualRevision} from './final-visual.mjs';
import {checkedOriginalResultFacts} from './final-selected-originals.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {closeSelectedGenerationContainers} from './final-generation-containers.mjs';
import {closeSelectedHistoryDuties} from './final-review-reader.mjs';

const binding={providerId:'synthetic',model:'synthetic',role:'visual-lead'},clone=structuredClone;
const project=()=>({id:'synthetic-container',revision:0,jobs:[],artifacts:[],taskCards:[],imageAssets:[],sketchGenerations:[],sketchReviewRuns:[],finalVisualRuns:[],audit:[],processedCommands:{}});
const witness=(p,c)=>{c=clone({...c,commandId:'c'+(p.revision+1)});p.revision++;p.audit.push({commandId:c.commandId,kind:c.kind,revision:p.revision});p.processedCommands[c.commandId]=JSON.stringify(c);return {command:c,audit:p.audit.at(-1)};};
function facts(p,originals,domain){
 const index=indexFinalHistoryRecords(p),node=index.nodes.find(n=>n.domain===domain),selected={nodeIdentities:[node.identity]};
 const checked={facts:originals.map(({checked,done})=>({kind:'job',id:checked.jobId,originalPointer:'/jobs/'+p.jobs.findIndex(j=>j.id===checked.jobId),revision:done.audit.revision,commandId:done.command.commandId,checked,...checkedOriginalResultFacts({kind:'job',checked,snapshot:p,planning:p,index})})),deferred:[],duties:{status:'checked'}};
 return {planning:p,index,selected,checked};
}
function sketchFixture(count=4){
 const p=project(),directions=['a','b','c'].map(id=>({id,title:id}));
 const body={protocol:'project-sketch-v1',projectId:p.id,dossierId:'dossier',directionIds:directions.map(d=>d.id),referenceSource:{source:{artifactId:'copy',content:{directions}}},selection:directions.map(d=>({directionId:d.id,main:{id:'use-'+d.id},complements:[],backups:[]})),images:[],reports:[]};
 const source={...body,sourceHash:hash(body)},g={id:'generation-'+source.sourceHash,source,bindings:{producer:binding,consumer:binding,image:binding},allowanceFamilyId:'family'};
 p.sketchGenerations.push(g);witness(p,{kind:'open-sketch-generation',generation:g,allowance:{id:'family'}});
 const rawPlan={protocol:'project-sketch-v1',kind:'plan',sourceHash:source.sourceHash,copy:directions,candidates:directions.flatMap(d=>Array.from({length:count},(_,i)=>({id:d.id+i,directionId:d.id,subject:'subject',arrangement:'arrangement '+i,visualMechanism:'mechanism '+i,themeConnection:'theme',siblingDistinction:'distinct',coverage:[{useId:'use-'+d.id,mode:'translated',translation:'translation',limitation:'synthetic'}],operation:{kind:'generate',prompt:'synthetic '+i,options:{}}})))};
 const originals=[];
 for(const key of ['producer','consumer','planner',...rawPlan.candidates.map(c=>c.id)]){
  const candidate=rawPlan.candidates.find(c=>c.id===key),id='sketch-'+hash([g.id,key]);
  if(!candidate)witness(p,{kind:'queue-sketch-node',generationId:g.id,nodeKey:key});
  const job={id,generationId:g.id,nodeKey:key,stage:'sketch',purpose:candidate?'image_candidate':key==='planner'?'sketch_plan':'sketch_owner',inputVersionIds:['copy'],binding,task:{id,parentId:g.id,owner:key,sourceHash:source.sourceHash},...(candidate?{candidate,allowanceFamilyId:'family'}:{}),status:'succeeded',attemptId:'a-'+key,attempts:[{id:'a-'+key,status:'succeeded',dispatchStarted:true,receipt:{synthetic:true,attempt:key}}]};p.jobs.push(job);
  witness(p,{kind:'claim-sketch-job',jobId:id,attemptId:job.attemptId});let done,checked;
  const dependencies=[{kind:'reference-dossier',dossierId:'dossier',source},...(candidate?['planner']:key==='planner'?['producer','consumer']:key==='consumer'?['producer']:[]).map(k=>({kind:'sketch-text',originalJobId:'sketch-'+hash([g.id,k]),outputVersionId:'sketch-'+hash([g.id,k])+':report'}))];
  if(candidate){
   const asset={id:'img-'+key,projectId:p.id,sha256:hash(key),provenance:{attemptId:job.attemptId}};p.imageAssets.push(asset);job.outputVersionIds=[asset.id];witness(p,{kind:'anchor-image-response',jobId:id,attemptId:job.attemptId,receipt:job.attempts[0].receipt});done=witness(p,{kind:'complete-image-candidate',jobId:id,attemptId:job.attemptId,asset});checked={kind:'sketch-image-original',projectId:p.id,generationId:g.id,sourceHash:source.sourceHash,jobId:id,attemptId:job.attemptId,outputVersionId:asset.id,sha256:asset.sha256,receiptHash:hash(job.attempts[0].receipt),dependencies};
  }else{
   const raw=key==='planner'?rawPlan:{decision:'accept',synthetic:true};job.report={raw,hash:hash(JSON.stringify(raw)),receipt:job.attempts[0].receipt};job.outputVersionIds=[id+':report'];done=witness(p,{kind:'complete-sketch-text',jobId:id,attemptId:job.attemptId,raw,receipt:job.attempts[0].receipt});if(key==='planner')g.plan=validateSketchPlan(raw,source);checked={kind:'sketch-text-original',projectId:p.id,generationId:g.id,sourceHash:source.sourceHash,jobId:id,attemptId:job.attemptId,nodeKey:key,outputVersionId:id+':report',reportHash:job.report.hash,receiptHash:hash(job.attempts[0].receipt),dependencies};
  }
  originals.push({checked,done});
 }
 return facts(p,originals,'sketch_generation');
}
function finalFixture(reviewed=false){
 const p=project(),directions=['a','b','c'].map(id=>({id,title:id})),selected=directions.map(d=>({directionId:d.id,candidateId:d.id+'0',imageId:'selected-'+d.id,sha256:hash(d.id)}));
 const body={protocol:'final-visual-v1',projectId:p.id,copyArtifactId:'copy',copyHash:hash('copy'),copy:{directions,claims:[]},sketchArtifact:{id:'sketch',contentHash:hash('sketch'),authority:{generationId:'g',reviewRunId:'review'}},selected,images:selected.map(s=>({imageId:s.imageId,sha256:s.sha256,mediaType:'image/png',byteLength:10,width:2,height:2})),task:{finalVisualRequirements:[]},handoffs:[],neutralReferences:{referenceBoundaries:[],referenceQualifications:[]}};
 const source={...body,sourceHash:hash(body)},assignments=Object.fromEntries(['planner','aggregate','image','director',...['visual','brand','user','communication'].flatMap(r=>['score_'+r,'opposition_'+r])].map(k=>[k,binding]));
 const run={id:'fv-'+source.sourceHash,protocol:'final-visual-v1',source,assignments,capabilities:{},allowance:{id:'final-family'}};p.finalVisualRuns.push(run);p.artifacts.push({id:'copy',contentHash:source.copyHash},{id:'sketch',contentHash:source.sketchArtifact.contentHash,sketchGeneration:source.sketchArtifact.authority});witness(p,{kind:'open-final-visual',run});run.reports=[];
 const rawPlan={protocol:'final-visual-v1',kind:'plan',sourceHash:source.sourceHash,copy:directions,workOrder:'Synthetic work order',specialistRequirements:[],directions:directions.map(d=>({directionId:d.id,selectedCandidateId:d.id+'0',selectedImageId:'selected-'+d.id,approvedCopy:d,explanation:'synthetic',presentationIntent:'synthetic',claims:[],limitations:['Synthetic unverified quality'],targets:[{id:'target-'+d.id,kind:'kv',use:'proposal',format:'landscape',requiredViews:['front'],typography:{copy:d,route:'generated_integrated',hierarchy:'clear',placement:'center',imageInteraction:'integrated'},operation:{kind:'edit',prompt:'synthetic',options:{},images:[{imageId:'selected-'+d.id,sha256:hash(d.id)}]}}]}))};
 const nodes=[{key:'planner',phase:'planner',role:'visual-lead',dependencies:[]},...rawPlan.directions.flatMap(d=>d.targets.map(t=>({key:'image:'+t.id,phase:'image',role:'visual-lead',dependencies:['planner']}))),...finalPanelNodes(),...(reviewed?[{key:'aggregate',phase:'aggregate',role:'visual-lead',dependencies:finalPanelNodes().map(n=>n.key)}]:[])],originals=[];
 populateFinalMembers(p,run,nodes,originals,{reviewed,rawPlan,directions,source,assignments});
 return facts(p,originals,'final_visual_run');
}
function populateFinalMembers(p,run,nodes,originals,{reviewed,rawPlan,directions,source,assignments}){
 for(const node of nodes){
  const target=node.phase==='image'?rawPlan.directions.flatMap(d=>d.targets).find(t=>'image:'+t.id===node.key):null,id='final-'+hash([run.id,node.key]),attemptId=run.id+':attempt-'+node.key;
  const existing=p.jobs.find(j=>j.id===id);if(!existing)witness(p,{kind:'queue-final-visual',runId:run.id,node});const job=existing??{id,finalVisualRunId:run.id,nodeKey:node.key,node,stage:'visual',purpose:target?'final_visual_image':node.phase==='planner'?'final_visual_plan':node.phase==='aggregate'?'final_visual_aggregate':'final_visual_review',binding:target?assignments.image:finalBinding(run,node),...(target?{target,allowanceFamilyId:'family'}:{}),finalAllowanceFamilyId:'final-family',inputVersionIds:['copy','sketch'],status:'succeeded',attemptId,attempts:[{id:attemptId,status:'succeeded',dispatchStarted:true,receipt:{synthetic:true,node:node.key}}]};if(existing)Object.assign(job,{status:'succeeded',attemptId,attempts:[{id:attemptId,status:'succeeded',dispatchStarted:true,receipt:{synthetic:true,node:node.key}}]});else p.jobs.push(job);witness(p,{kind:'claim-final-visual',jobId:id,attemptId});
  const dependencies=[{kind:'artifact',stage:'copy',artifactId:'copy',contentHash:source.copyHash},{kind:'sketch-review',artifactId:'sketch',contentHash:source.sketchArtifact.contentHash,generationId:'g',reviewRunId:'review'},...(run.parentRunId?[{kind:'final-visual-report',originalRunId:run.parentRunId,originalJobId:p.finalVisualRevisionRequests.find(q=>q.request.id===run.revisionRequestId).ownerEvidence.jobId,originalAttemptId:p.finalVisualRevisionRequests.find(q=>q.request.id===run.revisionRequestId).ownerEvidence.attemptId,reportId:p.finalVisualRevisionRequests.find(q=>q.request.id===run.revisionRequestId).ownerEvidence.reportId,reportHash:p.finalVisualRevisionRequests.find(q=>q.request.id===run.revisionRequestId).ownerEvidence.reportHash}]:[]),...node.dependencies.map(key=>{const j=p.jobs.find(j=>j.finalVisualRunId===run.id&&j.nodeKey===key),r=run.reports.find(r=>r.nodeKey===key);return {kind:'final-visual-report',originalRunId:run.id,originalJobId:j.id,originalAttemptId:j.attemptId,reportId:r.id,reportHash:hash(r)};})];let checked;
  if(target){const asset={id:run.id+':final-img-'+target.id,projectId:p.id,sha256:hash(target.id),mediaType:'image/png',byteLength:10,width:2,height:2,provenance:{attemptId}};p.imageAssets.push(asset);job.outputVersionIds=[asset.id];checked={kind:'final-visual-image-original',outputVersionId:asset.id,sha256:asset.sha256};}
  else{
   if(node.phase!=='planner'&&!run.reviewTargets){run.reviewTargets=finalTargets(p,run);run.reviewImages=finalImages(p,run);}
   const input=finalRequest(p,run,node).input,evidence=(ids=null)=>input.targets.filter(t=>!ids||ids.includes(t.directionId)).map(t=>({imageId:t.imageId,sha256:t.sha256,region:'center',observation:'Synthetic only'}));
   let raw={protocol:'final-visual-v1',envelopeHash:input.envelopeHash,nodeKey:node.key,findings:[]};
   if(node.phase==='planner')raw={...raw,...rawPlan};
   if(node.phase==='score')raw.entries=input.targets.map(t=>({targetId:t.targetId,imageId:t.imageId,sha256:t.sha256,firstReading:'synthetic',score:4,cannotAssess:false,evidence:[{imageId:t.imageId,sha256:t.sha256,region:'center',observation:'synthetic'}],findings:[]}));
   if(node.phase==='blind')raw.readings=input.targets.map(t=>({targetId:t.targetId,imageId:t.imageId,sha256:t.sha256,firstReading:'synthetic',evidence:[{imageId:t.imageId,sha256:t.sha256,region:'center',observation:'synthetic'}]}));
   if(node.phase==='challenge')Object.assign(raw,{preservedBlind:run.reports.find(r=>r.nodeKey==='blind:'+node.role).raw,challenges:[]});
   if(node.phase==='director')Object.assign(raw,{decision:reviewed?'accept':'return',dispositions:[],conditions:input.targets.flatMap(t=>FINAL_CONDITIONS.map(name=>({targetId:t.targetId,name,status:'pass',evidence:[{imageId:t.imageId,sha256:t.sha256,region:'center',observation:'synthetic'}]}))),packages:directions.map(d=>({directionId:d.id,complete:true,evidence:evidence([d.id])})),comparisons:[['a','b'],['a','c'],['b','c']].map(pair=>({pair,distinct:true,evidence:evidence(pair)}))});
   if(node.phase==='aggregate')Object.assign(raw,{kind:'aggregate',decision:'accept',understanding:'Synthetic aggregate',payload:finalPayload(p,run)});
   job.attempts[0].receipt.responseText=JSON.stringify(raw);const projection=ingestFinalResponse(input,job.attempts[0].receipt);assert.equal(projection.valid,true,node.key);
   const report={id:attemptId+':report',nodeKey:node.key,phase:node.phase,role:node.role,...(node.phase==='aggregate'?{aggregateParser:FINAL_AGGREGATE_PARSER}:{}),receipt:job.attempts[0].receipt,...projection};run.reports.push(report);job.outputVersionIds=[report.id];if(node.phase==='planner')run.plan=validateFinalPlan(raw,source);checked={kind:'final-visual-text-original',nodeKey:node.key,reportId:report.id,outputVersionId:report.id,reportHash:hash(report),raw:report.raw};
  }
  witness(p,{kind:'anchor-final-visual',jobId:id,attemptId,receipt:job.attempts[0].receipt});const done=witness(p,{kind:'complete-final-visual',jobId:id,attemptId,...(target?{asset:p.imageAssets.at(-1)}:{})});originals.push({done,checked:{...checked,projectId:p.id,runId:run.id,sourceHash:source.sourceHash,jobId:id,attemptId,receiptHash:hash(job.attempts[0].receipt),dependencies}});
 }
}
let checks=0;const run=x=>closeSelectedGenerationContainers(x);
for(const make of [sketchFixture,()=>sketchFixture(3),finalFixture,()=>finalFixture(true)]){const f=make(),r=run(f);assert.equal(r.blockers.length,0,JSON.stringify(r.blockers));assert.equal(r.closedNodeIdentities.length,1);assert.equal(r.containerProofs[0].members.length,f.checked.facts.length);assert.equal(closeSelectedHistoryDuties(f).status,'checked');checks+=4;}
const negatives=[
 ['missing checked original',f=>f.checked.facts.pop()],
 ['wrong checked command revision',f=>f.checked.facts[0].revision++],
 ['wrong checked source',f=>f.checked.facts[0].checked.sourceHash='foreign'],
 ['wrong receipt hash',f=>f.checked.facts[0].checked.receiptHash='foreign'],
 ['wrong checked output',f=>f.checked.facts[0].checked.outputVersionId='foreign'],
 ['wrong execution node proof',f=>f.checked.facts[0].closedNodeIdentities=[]],
 ['duplicate fact disagreeing',f=>{const c=clone(f.checked.facts[0]);c.checked.receiptHash='foreign';f.checked.facts.push(c);}],
 ['missing completion witness',f=>{delete f.planning.processedCommands[f.checked.facts[0].commandId];}],
 ['changed indexed container',f=>{f.planning[f.index.nodes.find(n=>n.identity===f.selected.nodeIdentities[0]).domain==='sketch_generation'?'sketchGenerations':'finalVisualRuns'][0].unknown=true;}],
 ['unknown attempt',f=>f.planning.jobs[0].attempts.push({id:'unknown',status:'unknown'})],
 ['foreign input',f=>f.planning.jobs[0].inputVersionIds=['foreign']],
 ['foreign domain scope',f=>f.planning.jobs[0].panelId='foreign'],
 ['wrong checked node key',f=>f.checked.facts[0].checked.nodeKey='foreign'],
 ['wrong claimed request',f=>{const e=f.planning.audit.find(e=>e.kind.startsWith('claim-'));const c=JSON.parse(f.planning.processedCommands[e.commandId]);c.requestHash='foreign';f.planning.processedCommands[e.commandId]=JSON.stringify(c);}],
 ['foreign source dependency',f=>f.checked.facts[0].checked.dependencies[0]={kind:'foreign'}],
 ['extra job',f=>f.planning.jobs.push({...clone(f.planning.jobs[0]),id:'foreign',nodeKey:'foreign'})],
 ['member reorder',f=>{[f.planning.jobs[0],f.planning.jobs[1]]=[f.planning.jobs[1],f.planning.jobs[0]];}],
 ['asset producer changed',f=>{f.planning.imageAssets[0].provenance.attemptId='foreign';}],
];
for(const make of [sketchFixture,finalFixture])for(const [name,change]of negatives){const f=make();change(f);const r=run(f);assert.ok(r.blockers.length,name);assert.equal(r.closedNodeIdentities.length,0,name);checks++;}
for(const [name,change]of [
 ['wrong raw anchor version',f=>{f.checked.facts.at(-1).checkedRawAnchors[0].version='foreign';}],
 ['missing report',f=>f.planning.finalVisualRuns[0].reports.pop()],
 ['duplicate report',f=>f.planning.finalVisualRuns[0].reports.push(clone(f.planning.finalVisualRuns[0].reports[0]))],
 ['wrong panel dependency',f=>f.planning.jobs.at(-1).node.dependencies=[]],
 ['report order',f=>f.planning.finalVisualRuns[0].reports.reverse()],
]){const f=finalFixture();change(f);f.index=indexFinalHistoryRecords(f.planning);assert.ok(run(f).blockers.length,name);checks++;}
for(const make of [sketchFixture,finalFixture]){const f=make(),c=f.planning.sketchGenerations[0]??f.planning.finalVisualRuns[0];witness(f.planning,f.planning.sketchGenerations.length?{kind:'queue-sketch-node',generationId:c.id,nodeKey:'foreign'}:{kind:'queue-final-visual',runId:c.id,node:{key:'foreign'}});assert.equal(run(f).blockers[0].code,'FINAL_CONTAINER_COMMAND_INVENTORY');checks++;}
const forgery=sketchFixture();forgery.checked.facts=[{originalPointer:'/sketchGenerations/0',checked:{},closedNodeIdentities:[forgery.selected.nodeIdentities[0]]}];const denied=closeSelectedHistoryDuties(forgery);assert.equal(denied.status,'unsettled');assert.ok(denied.uncovered.some(n=>n.identity===forgery.selected.nodeIdentities[0]));assert.ok(!denied.closedNodeIdentities.includes(forgery.selected.nodeIdentities[0]));checks+=3;
const descendant=finalFixture(),dp=descendant.planning,parent=dp.finalVisualRuns[0],director=parent.reports.at(-1),ctx={actorType:'agent'};
director.raw.conditions[0].status='fail';dp.finalVisualAllowance=clone(parent.allowance);dp.imageAllowance={id:'family'};
const returned=reduceFinalVisualRevision(dp,{kind:'record-final-visual-return',parentRunId:parent.id,reportId:director.id},ctx,parent.source);
reduceFinalVisualRevision(dp,{kind:'request-final-visual-revision',parentRunId:parent.id,returnId:returned.id,requestId:'synthetic-revision'},ctx,parent.source);
const response=clone(parent.reports[0].raw);response.requestId='synthetic-revision';response.owner='visual-lead';response.directions[0].targets[0].operation.prompt='A substantive changed image operation';
const committed=reduceFinalVisualRevision(dp,{kind:'accept-final-visual-revision-plan',requestId:'synthetic-revision',response},ctx,parent.source);assert.equal(committed.status,'committed');
const child=dp.finalVisualRuns.at(-1);assert.equal(child.runtimeStatus,'descendant_runtime_unsupported');assert.equal(dp.jobs.filter(j=>j.finalVisualRunId===child.id).length,1);
const di=indexFinalHistoryRecords(dp),dn=di.nodes.find(n=>n.recordId===child.id&&n.domain==='final_visual_run'),dr=run({planning:dp,index:di,selected:{nodeIdentities:[dn.identity]},checked:{facts:[]}});
assert.equal(dr.closedNodeIdentities.length,0);assert.equal(dr.blockers[0].code,'FINAL_CONTAINER_DESCENDANT_RUNTIME_UNSUPPORTED');assert.equal(dr.containerProofs[0].status,'blocked');checks+=6;

const requestEntry=dp.finalVisualRevisionRequests[0],node={key:'revision:synthetic-revision',phase:'revision',role:'visual-lead',dependencies:[],requestId:'synthetic-revision'},ownerId='final-'+hash([parent.id,node.key]),attemptId='owner-revision-attempt';
witness(dp,{kind:'queue-final-visual',runId:parent.id,node});
const ownerJob={id:ownerId,finalVisualRunId:parent.id,nodeKey:node.key,node,stage:'visual',purpose:'final_visual_revision',binding:parent.assignments.planner,inputVersionIds:[parent.source.copyArtifactId,parent.source.sketchArtifact.id],finalAllowanceFamilyId:parent.allowance.id,status:'succeeded',attemptId,attempts:[{id:attemptId,status:'succeeded',dispatchStarted:true,executor:{actorType:'agent',actorId:'revision-owner',runId:attemptId,contextId:attemptId}}]};dp.jobs.push(ownerJob);
witness(dp,{kind:'claim-final-visual',jobId:ownerId,attemptId});
const request=finalRequest(dp,parent,node),raw={...response,protocol:'final-visual-v1',nodeKey:node.key,envelopeHash:request.input.envelopeHash};
requestEntry.response=clone(raw);child.plan=validateFinalPlan(raw,child.source);for(const direction of child.plan.directions){const selection=child.directionVersions.find(v=>v.directionId===direction.directionId);const version=dp.finalVisualLineage.versions.find(v=>v.versionId===selection.versionId);version.plan=clone(direction);}
const receipt={runId:attemptId,model:binding.model,requestedModel:binding.model,exitCode:0,threadId:'revision-thread',inputPacketHash:hash({runId:attemptId,model:binding.model,...request.request}),images:request.request.images,responseText:JSON.stringify(raw)};
ownerJob.attempts[0].receipt=receipt;
const ownerReport={id:attemptId+':report',nodeKey:node.key,phase:'revision',role:node.role,receipt,...ingestFinalResponse(request.input,receipt)};assert(ownerReport.valid);parent.reports.push(ownerReport);ownerJob.outputVersionIds=[ownerReport.id];
requestEntry.ownerEvidence={jobId:ownerId,attemptId,reportId:ownerReport.id,reportHash:hash(ownerReport)};child.runtimeStatus='production';
witness(dp,{kind:'anchor-final-visual',jobId:ownerId,attemptId,receipt});const birth=witness(dp,{kind:'complete-final-visual',jobId:ownerId,attemptId});
const construction={commandId:birth.command.commandId,revision:birth.audit.revision,child:clone(child),jobs:clone(dp.jobs.filter(j=>j.finalVisualRunId===child.id)),versions:clone(dp.finalVisualLineage.versions)};
const originals=descendant.checked.facts.map(f=>({checked:clone(f.checked),done:{command:JSON.parse(dp.processedCommands[f.commandId]),audit:dp.audit.find(a=>a.commandId===f.commandId)}}));
for(const original of originals){const j=dp.jobs.find(j=>j.id===original.checked.jobId),report=parent.reports.find(r=>r.id===original.checked.reportId);if(report){original.checked.raw=clone(report.raw);original.checked.reportHash=hash(report);}original.checked.receiptHash=hash(j.attempts[0].receipt);}
originals.push({done:birth,checked:{kind:'final-visual-text-original',projectId:dp.id,runId:parent.id,sourceHash:parent.source.sourceHash,jobId:ownerId,attemptId,nodeKey:node.key,reportId:ownerReport.id,outputVersionId:ownerReport.id,reportHash:hash(ownerReport),receiptHash:hash(receipt),raw:clone(raw),dependencies:[{kind:'artifact',stage:'copy',artifactId:'copy',contentHash:parent.source.copyHash},{kind:'sketch-review',artifactId:'sketch',contentHash:parent.source.sketchArtifact.contentHash,generationId:'g',reviewRunId:'review'}],descendantConstruction:construction}});
const childNodes=[...construction.jobs.map(j=>j.node),...finalPanelNodes()];
populateFinalMembers(dp,child,childNodes,originals,{reviewed:false,rawPlan:child.plan,directions:child.source.copy.directions,source:child.source,assignments:child.assignments});
const positive=facts(dp,originals,'final_visual_run');positive.selected.nodeIdentities=positive.index.nodes.filter(n=>n.domain==='final_visual_run').map(n=>n.identity);
const closed=run(positive);assert.deepEqual(closed.blockers,[],JSON.stringify(closed.blockers));assert.equal(closed.closedNodeIdentities.length,2);assert.deepEqual(closed.containerProofs[1].directionProducerSelections.map(v=>v.local),[true,false,false]);checks+=3;
for(const [name,mutate] of [
 ['missing constructor',f=>{delete f.checked.facts.find(f=>f.checked.descendantConstruction).checked.descendantConstruction;}],
 ['changed constructor',f=>{f.checked.facts.find(f=>f.checked.descendantConstruction).checked.descendantConstruction.child.changedDirectionIds=['b'];}],
 ['missing inherited producer original',f=>{f.checked.facts=f.checked.facts.filter(f=>f.checked.jobId!==dp.jobs.find(j=>j.finalVisualRunId===parent.id&&j.nodeKey==='image:target-b').id);}]
]){const f=clone(positive);mutate(f);const result=run(f);assert(result.blockers.length,name);assert(!result.closedNodeIdentities.includes(positive.selected.nodeIdentities[1]),name);checks++;}
const convergence=clone(positive),convergedRun=convergence.planning.finalVisualRuns[1];
const removedJobs=convergence.planning.jobs.filter(j=>j.finalVisualRunId===convergedRun.id&&j.node.phase!=='image').map(j=>j.id);
convergence.planning.jobs=convergence.planning.jobs.filter(j=>!removedJobs.includes(j.id));
convergedRun.reports=[];delete convergedRun.reviewTargets;delete convergedRun.reviewImages;
for(const audit of [...convergence.planning.audit]){const command=JSON.parse(convergence.planning.processedCommands[audit.commandId]);if(removedJobs.includes(command.jobId)||(command.kind==='queue-final-visual'&&command.runId===convergedRun.id&&command.node.phase!=='image')){convergence.planning.audit=convergence.planning.audit.filter(a=>a.commandId!==audit.commandId);delete convergence.planning.processedCommands[audit.commandId];}}
const {adoptFinalReviewConvergence}=await import('./final-visual.mjs');adoptFinalReviewConvergence(convergence.planning,convergedRun);
const adoption=witness(convergence.planning,{kind:'converge-final-visual',runId:convergedRun.id});
convergence.checked.facts=convergence.checked.facts.filter(f=>!removedJobs.includes(f.checked.jobId));
convergence.checked.convergences=[{runId:convergedRun.id,commandId:adoption.command.commandId,revision:adoption.audit.revision,value:clone(convergedRun.convergence)}];
convergence.index=indexFinalHistoryRecords(convergence.planning);convergence.selected.nodeIdentities=convergence.index.nodes.filter(n=>n.domain==='final_visual_run').map(n=>n.identity);
for(const fact of convergence.checked.facts)Object.assign(fact,checkedOriginalResultFacts({kind:'job',checked:fact.checked,snapshot:convergence.planning,planning:convergence.planning,index:convergence.index}));
const converged=run(convergence);assert.deepEqual(converged.blockers,[]);assert.equal(converged.containerProofs[1].convergence.value.outcome.status,'revision_required');checks+=2;
for(const [name,change]of [['missing adoption',f=>f.checked.convergences=[]],['changed adoption',f=>f.checked.convergences[0].value.outcome.status='reviewed'],['missing inherited panel',f=>f.checked.facts=f.checked.facts.filter(x=>x.checked.nodeKey!=='score:visual')]]){const f=clone(convergence);change(f);assert(run(f).blockers.length,name);checks++;}
console.log(JSON.stringify({checks,status:'passed',fixtures:'synthetic checked-result contracts using actual plan/parser/index/shape adapters',actualOriginalFileValidation:false,fullReaderApproval:false,nativeExports:0,modelCalls:0}));
