import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need,validateSketchPlan} from './sketch-authority.mjs';
import {validateFinalPlan,finalPanelNodes,finalBinding,finalTargets,finalImages,finalOutcome,finalReviewRequirement,requireFinalRevisionOwner} from './final-visual.mjs';
import {selectedOriginalCommandIndex} from './final-selected-originals.mjs';
import {visibilityPointer} from './content-visibility.mjs';

const domains=new Set(['sketch_generation','final_visual_run']);
const one=(rows,test,code)=>{const found=(rows??[]).filter(test);need(found.length===1,code,'One exact registered container member required');return found[0];};
const same=(a,b,code)=>need(equal(a,b),code,'Exact constructor membership changed');
const digestSource=source=>{const {sourceHash,...body}=source;return hash(body)===sourceHash;};

export function closeSelectedGenerationContainers({planning,index,selected,checked}) {
 const closedNodeIdentities=[],containerProofs=[],blockers=[];
 const reached=(index.nodes??[]).filter(n=>domains.has(n.domain)&&(selected.nodeIdentities??[]).includes(n.identity));
 if(!reached.length)return {closedNodeIdentities,containerProofs,blockers};
 let entries;
 try {entries=selectedOriginalCommandIndex(planning).entries;}
 catch(error){return {closedNodeIdentities,containerProofs,blockers:reached.map(node=>({code:error.code??'FINAL_CONTAINER_COMMAND_REQUIRED',identity:node.identity,message:error.message}))};}
 const exact=(kind,test)=>one(entries,e=>e.command.kind===kind&&test(e.command),'FINAL_CONTAINER_COMMAND_REQUIRED');
 for(const node of reached) {
  const proof={identity:node.identity,version:node.version,domain:node.domain,recordId:node.recordId,originalPointer:node.originalPointer,recordHash:node.recordHash,members:[],commands:[],outsideInventory:[]};
  try {
   const container=visibilityPointer(planning,node.originalPointer);
   need(container?.id===node.recordId&&hash(JSON.stringify(container))===node.recordHash&&node.version===`derived-record-${node.recordHash}`,'FINAL_CONTAINER_RECORD_CHANGED','Exact indexed immutable container required');
   one(index.nodes,n=>n.domain===node.domain&&n.recordId===node.recordId,'FINAL_CONTAINER_DUPLICATE');
   need(container.source?.projectId===planning.id&&digestSource(container.source),'FINAL_CONTAINER_SOURCE_CHANGED','Exact project and self-hashed original source required');
   const recordCommand=e=>{proof.commands.push({commandId:e.command.commandId,kind:e.command.kind,revision:e.audit.revision,commandHash:hash(e.command)});return e;};
   const member=(job,{kind,scope,completion,queued,dependencies=[]})=>{
    need(job.status==='succeeded'&&job.attempts?.length===1&&job.attempts[0].status==='succeeded'&&job.attempts[0].dispatchStarted===true&&job.attemptId===job.attempts[0].id,'FINAL_CONTAINER_UNFINISHED_MEMBER','Every required original has one completed dispatched attempt');
    const attempt=job.attempts[0];
    one(planning.jobs,j=>j.id===job.id,'FINAL_CONTAINER_DUPLICATE');
    one(planning.jobs.flatMap(j=>j.attempts??[]),a=>a.id===attempt.id,'FINAL_CONTAINER_DUPLICATE');
    const claim=recordCommand(exact(scope==='generationId'?'claim-sketch-job':'claim-final-visual',c=>c.jobId===job.id&&c.attemptId===attempt.id));
    need((claim.command.requestHash??null)===(attempt.requestHash??null),'FINAL_CONTAINER_CLAIM_CHANGED','Exact original claimed request hash required');
    const done=recordCommand(exact(completion,c=>c.jobId===job.id&&c.attemptId===attempt.id));
    need(queued.audit.revision<claim.audit.revision&&claim.audit.revision<done.audit.revision,'FINAL_CONTAINER_COMMAND_ORDER','Queue, claim and original completion order required');
    const facts=(checked.facts??[]).filter(f=>f.checkedExecutionPairs?.some(p=>p.jobId===job.id&&p.attemptId===attempt.id)&&f.checked?.kind===kind&&f.checked.jobId===job.id&&f.checked.attemptId===attempt.id);
    need(facts.length>0,'FINAL_CONTAINER_CHECKED_ORIGINAL_REQUIRED','Required job needs its actual checked original result');
    const fact=facts[0],original=fact.checked;
    need(facts.every(f=>equal(f.checked,original))&&original.projectId===planning.id&&original[scope==='generationId'?'generationId':'runId']===container.id&&original.sourceHash===container.source.sourceHash&&original.receiptHash===hash(attempt.receipt)&&fact.revision===done.audit.revision&&fact.commandId===done.command.commandId,'FINAL_CONTAINER_CHECKED_ORIGINAL_CHANGED','Checked original, exact command revision and scope required');
    const jobPointer=`/jobs/${planning.jobs.indexOf(job)}`,attemptPointer=`${jobPointer}/attempts/0`;
    const executionNodes=[jobPointer,attemptPointer].map(pointer=>one(index.nodes,n=>n.originalPointer===pointer,'FINAL_CONTAINER_EXECUTION_NODE_REQUIRED'));
    for(const n of executionNodes)need(n.recordHash===hash(JSON.stringify(visibilityPointer(planning,n.originalPointer)))&&fact.closedNodeIdentities?.includes(n.identity),'FINAL_CONTAINER_EXECUTION_NODE_REQUIRED','Checked exact job and attempt index nodes required');
    for(const dependency of dependencies)need(original.dependencies?.some(d=>Object.entries(dependency).every(([k,v])=>equal(d[k],v))),'FINAL_CONTAINER_DEPENDENCY_CHANGED','Exact original predecessor dependency required');
    need(Array.isArray(job.outputVersionIds)&&job.outputVersionIds.length===1&&original.outputVersionId===job.outputVersionIds[0],'FINAL_CONTAINER_OUTPUT_CHANGED','Exact checked output membership required');
    let output;
    if(kind.endsWith('image-original')) {
     const asset=one(planning.imageAssets,a=>a.id===job.outputVersionIds[0],'FINAL_CONTAINER_ASSET_REQUIRED');
     need(asset.projectId===planning.id&&asset.sha256===original.sha256&&asset.provenance?.attemptId===attempt.id,'FINAL_CONTAINER_OUTPUT_CHANGED','Checked actual generated asset and producer required');
     same(done.command.asset,asset,'FINAL_CONTAINER_OUTPUT_CHANGED');
     const anchor=recordCommand(exact(scope==='generationId'?'anchor-image-response':'anchor-final-visual',c=>c.jobId===job.id&&c.attemptId===attempt.id&&equal(c.receipt,attempt.receipt)));
     need(claim.audit.revision<anchor.audit.revision&&anchor.audit.revision<done.audit.revision,'FINAL_CONTAINER_COMMAND_ORDER','Protected original image anchor order required');
     output={kind:'image',id:asset.id,sha256:asset.sha256,recordHash:hash(asset)};
    } else if(scope==='generationId') {
     need(original.nodeKey===job.nodeKey&&equal(job.report?.receipt,attempt.receipt),'FINAL_CONTAINER_OUTPUT_CHANGED','Original text node and receipt required');
     need(job.outputVersionIds[0]===`${job.id}:report`&&job.report?.hash===original.reportHash&&hash(JSON.stringify(job.report.raw))===original.reportHash,'FINAL_CONTAINER_OUTPUT_CHANGED','Exact original sketch text report required');
     same(done.command.raw,job.report.raw,'FINAL_CONTAINER_OUTPUT_CHANGED');same(done.command.receipt,attempt.receipt,'FINAL_CONTAINER_OUTPUT_CHANGED');
     output={kind:'sketch_text',id:job.outputVersionIds[0],reportHash:original.reportHash,raw:structuredClone(job.report.raw)};
    } else {
     need(original.nodeKey===job.nodeKey,'FINAL_CONTAINER_OUTPUT_CHANGED','Original final text node required');
     const report=one(container.reports,r=>r.id===job.outputVersionIds[0]&&r.nodeKey===job.nodeKey,'FINAL_CONTAINER_REPORT_REQUIRED');
     need(report.id===original.reportId&&hash(report)===original.reportHash&&equal(report.receipt,attempt.receipt)&&equal(report.raw,original.raw),'FINAL_CONTAINER_OUTPUT_CHANGED','Exact checked raw final report required');
     const pointer=`${node.originalPointer}/reports/${container.reports.indexOf(report)}`;
     const anchor=one(index.reportAnchors,a=>a.originalRecordPointer===pointer&&a.identity===report.id,'FINAL_CONTAINER_REPORT_REQUIRED');
     need(fact.checkedRawAnchors?.some(a=>equal(a,anchor)),'FINAL_CONTAINER_REPORT_REQUIRED','Exact checked raw anchor and immutable version required');
     const receipt=recordCommand(exact('anchor-final-visual',c=>c.jobId===job.id&&c.attemptId===attempt.id&&equal(c.receipt,attempt.receipt)));
     need(claim.audit.revision<receipt.audit.revision&&receipt.audit.revision<done.audit.revision,'FINAL_CONTAINER_COMMAND_ORDER','Protected text anchor order required');
     output={kind:'report',id:report.id,version:anchor.version,originalPointer:pointer,reportHash:original.reportHash,raw:structuredClone(original.raw)};
    }
    proof.members.push({jobId:job.id,nodeKey:job.nodeKey,attemptId:attempt.id,jobPointer,jobHash:hash(job),attemptHash:hash(attempt),checkedKind:kind,completion:{commandId:fact.commandId,revision:fact.revision},dependencies:structuredClone(original.dependencies),output});
    return done;
   };
   if(node.domain==='sketch_generation') {
    const open=recordCommand(exact('open-sketch-generation',c=>c.generation?.id===container.id));
    need(!open.command.generation.plan,'FINAL_CONTAINER_INITIAL_PLAN_UNSUPPORTED','Generation must begin with its actual unplanned constructor');
    const planner=one(planning.jobs,j=>j.generationId===container.id&&j.nodeKey==='planner'&&!j.reviewRunId,'FINAL_CONTAINER_PLAN_REQUIRED');
    const plan=validateSketchPlan(planner.report?.raw,container.source);
    same(container,{...open.command.generation,plan},'FINAL_CONTAINER_RECORD_CHANGED');
    need(container.allowanceFamilyId===open.command.allowance?.id,'FINAL_CONTAINER_ALLOWANCE_CHANGED','Original generation allowance family required');
    const keys=['producer','consumer','planner',...plan.candidates.map(c=>c.id)];
    const jobs=planning.jobs.filter(j=>j.generationId===container.id&&!j.reviewRunId);
    same(jobs.map(j=>j.nodeKey),keys,'FINAL_CONTAINER_MEMBER_ORDER');
    same(entries.filter(e=>e.command.kind==='queue-sketch-node'&&e.command.generationId===container.id).map(e=>e.command.nodeKey),['producer','consumer','planner'],'FINAL_CONTAINER_COMMAND_INVENTORY');
    for(const job of planning.jobs.filter(j=>j.generationId===container.id&&j.reviewRunId)){
     const run=one(planning.sketchReviewRuns,r=>r.id===job.reviewRunId&&r.generationId===container.id,'FINAL_CONTAINER_FOREIGN_MEMBER');
     need(['sketch_review_v2','sketch_refinement_handoff'].includes(job.purpose)&&run.nodes.some(n=>n.key===job.nodeKey),'FINAL_CONTAINER_FOREIGN_MEMBER','Only separately owned registered review descendants are outside generation inventory');
     proof.outsideInventory.push({jobId:job.id,reviewRunId:run.id,nodeKey:job.nodeKey,owner:'sketch_review_run'});
    }
    let prior=open,plannerDone;
    for(const job of jobs) {
     const candidate=plan.candidates.find(c=>c.id===job.nodeKey),id=`sketch-${hash([container.id,job.nodeKey])}`;
     same({id:job.id,stage:job.stage,purpose:job.purpose,inputVersionIds:job.inputVersionIds,binding:job.binding,task:job.task}, {id,stage:'sketch',purpose:candidate?'image_candidate':job.nodeKey==='planner'?'sketch_plan':'sketch_owner',inputVersionIds:[container.source.referenceSource.source.artifactId],binding:candidate?container.bindings.image:container.bindings[job.nodeKey==='producer'?'producer':'consumer'],task:{id,parentId:container.id,owner:job.nodeKey,sourceHash:container.source.sourceHash}},'FINAL_CONTAINER_CONSTRUCTOR_CHANGED');
     if(candidate){same(job.candidate,candidate,'FINAL_CONTAINER_PLAN_CHANGED');need(job.allowanceFamilyId===container.allowanceFamilyId,'FINAL_CONTAINER_ALLOWANCE_CHANGED','Original image family required');}
     const queued=candidate?plannerDone:recordCommand(exact('queue-sketch-node',c=>c.generationId===container.id&&c.nodeKey===job.nodeKey));
     need(queued&&open.audit.revision<queued.audit.revision&&(candidate||prior.audit.revision<queued.audit.revision),'FINAL_CONTAINER_COMMAND_ORDER','Actual owner gates and planner-generated candidates required');
     const dependencies=[{kind:'reference-dossier',dossierId:container.source.dossierId,source:container.source},...(candidate?['planner']:job.nodeKey==='planner'?['producer','consumer']:job.nodeKey==='consumer'?['producer']:[]).map(key=>({kind:'sketch-text',originalJobId:jobs.find(j=>j.nodeKey===key).id,outputVersionId:jobs.find(j=>j.nodeKey===key).id+':report'}))];
     const allowed=new Set(['id','generationId','nodeKey','stage','purpose','inputVersionIds','binding','task','status','attempts','attemptId','outputVersionIds',...(candidate?['candidate','allowanceFamilyId']:['report'])]);
     need(Object.keys(job).every(k=>allowed.has(k)),'FINAL_CONTAINER_CONSTRUCTOR_CHANGED','Unknown or foreign generation job fields are not constructor members');
     const done=member(job,{kind:candidate?'sketch-image-original':'sketch-text-original',scope:'generationId',completion:candidate?'complete-image-candidate':'complete-sketch-text',queued,dependencies});
     if(!candidate&&job.nodeKey!=='planner')need(job.report.raw.decision==='accept','FINAL_CONTAINER_HANDOFF_RETURNED','Original accepted owner handoff required before downstream construction');
     if(job.nodeKey==='planner')plannerDone=done;
     if(!candidate)prior=done;
    }
    proof.planHash=plan.planHash;proof.orderedCandidates=structuredClone(plan.candidates);
   } else {
    let birth,construction,owner;
    if(container.parentRunId){
     need(container.runtimeStatus==='production','FINAL_CONTAINER_DESCENDANT_RUNTIME_UNSUPPORTED','Actual original-backed descendant runtime required');
     owner=requireFinalRevisionOwner(planning,container);
     const facts=checked.facts.filter(f=>f.checked?.jobId===owner.job.id&&f.checked.descendantConstruction?.child.id===container.id);
     need(facts.length>0&&facts.every(f=>equal(f.checked.descendantConstruction,facts[0].checked.descendantConstruction)),'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_REQUIRED','Actual checked owner completion and replayed predecessor snapshot required');
     construction=facts[0].checked.descendantConstruction;
     birth=recordCommand(exact('complete-final-visual',c=>c.jobId===owner.job.id&&c.attemptId===owner.job.attempts[0].id));
     need(construction.commandId===birth.command.commandId&&construction.revision===birth.audit.revision,'FINAL_CONTAINER_DESCENDANT_CONSTRUCTOR_CHANGED','Exact original constructor command required');
     if(container.convergence){
      const adoption=one(checked.convergences,c=>c.runId===container.id,'FINAL_CONTAINER_CONVERGENCE_HISTORY_REQUIRED');
      const command=recordCommand(exact('converge-final-visual',c=>c.runId===container.id));
      same(adoption,{runId:container.id,commandId:command.command.commandId,revision:command.audit.revision,value:container.convergence},'FINAL_CONTAINER_CONVERGENCE_CHANGED');
      same(finalReviewRequirement(planning,container),container.convergence,'FINAL_CONTAINER_CONVERGENCE_CHANGED');
      need(containerProofs.some(p=>p.recordId===container.convergence.originalRunId&&p.status==='closed'),'FINAL_CONTAINER_ANCESTOR_CLOSURE_REQUIRED','Inherited original panel must close independently');
      need(!container.reports.length&&birth.audit.revision<adoption.revision,'FINAL_CONTAINER_CONVERGENCE_CHANGED','Convergence cannot add or replace original panel reports');
      proof.convergence=structuredClone(adoption);
     }
     proof.directionProducerSelections=container.plan.directions.map(direction=>{
      const selection=one(container.directionVersions,v=>v.directionId===direction.directionId,'FINAL_CONTAINER_DESCENDANT_VERSION_CHANGED');
      const version=one(construction.versions,v=>v.versionId===selection.versionId,'FINAL_CONTAINER_DESCENDANT_VERSION_CHANGED');
      same(version,one(planning.finalVisualLineage?.versions,v=>v.versionId===selection.versionId,'FINAL_CONTAINER_DESCENDANT_VERSION_CHANGED'),'FINAL_CONTAINER_DESCENDANT_VERSION_CHANGED');
      need(version.sourceHash===container.source.sourceHash&&version.directionId===direction.directionId&&equal(version.plan,direction),'FINAL_CONTAINER_DESCENDANT_VERSION_CHANGED','Exact immutable direction producer version required');
      if(version.productionRunId!==container.id)need(containerProofs.some(p=>p.recordId===version.productionRunId&&p.status==='closed'),'FINAL_CONTAINER_ANCESTOR_CLOSURE_REQUIRED','Every inherited producer container must close independently');
      return {directionId:direction.directionId,versionId:version.versionId,productionRunId:version.productionRunId,local:version.productionRunId===container.id,orderedTargetIds:direction.targets.map(t=>t.id)};
     });
     need(containerProofs.some(p=>p.recordId===container.parentRunId&&p.status==='closed'),'FINAL_CONTAINER_ANCESTOR_CLOSURE_REQUIRED','Exact parent container closure required');
    }
    const open=birth??recordCommand(exact('open-final-visual',c=>c.run?.id===container.id));
    if(!construction)need(!open.command.run.plan&&!open.command.run.reports,'FINAL_CONTAINER_INITIAL_PLAN_UNSUPPORTED','Root run must begin with the actual empty-report constructor');
    const jobs=planning.jobs.filter(j=>j.finalVisualRunId===container.id);
    const plan=construction?construction.child.plan:validateFinalPlan(one(container.reports,r=>r.nodeKey==='planner','FINAL_CONTAINER_PLAN_REQUIRED').raw,container.source);
    same(plan,container.plan,'FINAL_CONTAINER_PLAN_CHANGED');
    const copy=one(planning.artifacts,a=>a.id===container.source.copyArtifactId,'FINAL_CONTAINER_SOURCE_CHANGED'),sketch=one(planning.artifacts,a=>a.id===container.source.sketchArtifact.id,'FINAL_CONTAINER_SOURCE_CHANGED');
    need(copy.contentHash===container.source.copyHash&&sketch.contentHash===container.source.sketchArtifact.contentHash&&equal(sketch.sketchGeneration,container.source.sketchArtifact.authority),'FINAL_CONTAINER_SOURCE_CHANGED','Exact source copy and reviewed sketch registration required');
    const targets=finalTargets(planning,container),images=finalImages(planning,container),panel=finalPanelNodes();
    if(!container.convergence){same(container.reviewTargets,targets,'FINAL_CONTAINER_TARGETS_CHANGED');same(container.reviewImages,images,'FINAL_CONTAINER_TARGETS_CHANGED');}
    const revisionNodes=(planning.finalVisualRevisionRequests??[]).filter(q=>q.request.parentRunId===container.id).map(q=>({key:`revision:${q.request.id}`,phase:'revision',role:'visual-lead',dependencies:[],requestId:q.request.id}));
    const expected=[...(construction?construction.jobs.map(j=>j.node):[{key:'planner',phase:'planner',role:'visual-lead',dependencies:[]},...plan.directions.flatMap(d=>d.targets.map(t=>({key:`image:${t.id}`,phase:'image',role:'visual-lead',dependencies:['planner']})))]),...(container.convergence?[]:panel),...(finalOutcome(container).status==='reviewed'||jobs.some(j=>j.nodeKey==='aggregate')?[{key:'aggregate',phase:'aggregate',role:'visual-lead',dependencies:panel.map(n=>n.key)}]:[]),...revisionNodes];
    same([...jobs.map(j=>j.nodeKey)].sort(),expected.map(n=>n.key).sort(),'FINAL_CONTAINER_MEMBERS_CHANGED');
    const queues=jobs.map(job=>construction&&job.node.phase==='image'?birth:recordCommand(exact('queue-final-visual',c=>c.runId===container.id&&c.node?.key===job.nodeKey)));
    same(entries.filter(e=>e.command.kind==='queue-final-visual'&&e.command.runId===container.id).map(e=>e.command.node?.key),jobs.filter(j=>!construction||j.node.phase!=='image').map(j=>j.nodeKey),'FINAL_CONTAINER_COMMAND_INVENTORY');
    same(queues.map(e=>e.audit.revision),queues.map(e=>e.audit.revision).sort((a,b)=>a-b),'FINAL_CONTAINER_MEMBER_ORDER');
    same(jobs.filter(j=>j.node.phase==='image').map(j=>j.target),plan.directions.filter(d=>!construction||container.changedDirectionIds.includes(d.directionId)).flatMap(d=>d.targets),'FINAL_CONTAINER_MEMBER_ORDER');
    const doneByKey=new Map();
    for(const [i,job] of jobs.entries()) {
     const definition=one(expected,n=>n.key===job.nodeKey,'FINAL_CONTAINER_CONSTRUCTOR_CHANGED');same(job.node,definition,'FINAL_CONTAINER_CONSTRUCTOR_CHANGED');if(construction&&job.node.phase==='image'){const original=one(construction.jobs,j=>j.id===job.id,'FINAL_CONTAINER_CONSTRUCTOR_CHANGED');for(const [key,value] of Object.entries(original))if(!['status','attempts'].includes(key))same(job[key],value,'FINAL_CONTAINER_CONSTRUCTOR_CHANGED');}else same(queues[i].command.node,definition,'FINAL_CONTAINER_CONSTRUCTOR_CHANGED');
     need(construction&&job.node.phase==='image'?open.audit.revision===queues[i].audit.revision:open.audit.revision<queues[i].audit.revision,'FINAL_CONTAINER_COMMAND_ORDER','Original open must precede member queue');
     const target=definition.phase==='image'?plan.directions.flatMap(d=>d.targets).find(t=>`image:${t.id}`===definition.key):null;
     const purpose=target?'final_visual_image':definition.phase==='planner'?'final_visual_plan':definition.phase==='aggregate'?'final_visual_aggregate':definition.phase==='revision'?'final_visual_revision':'final_visual_review';
     same([job.id,job.stage,job.purpose,job.binding,job.inputVersionIds,job.finalAllowanceFamilyId],[`final-${hash([container.id,definition.key])}`,'visual',purpose,target?container.assignments.image:finalBinding(container,definition),[container.source.copyArtifactId,container.source.sketchArtifact.id],container.allowance.id],'FINAL_CONTAINER_CONSTRUCTOR_CHANGED');
     if(target)same(job.target,target,'FINAL_CONTAINER_PLAN_CHANGED');
     const allowed=new Set(['id','finalVisualRunId','nodeKey','node','stage','purpose','binding','inputVersionIds','status','attempts','attemptId','outputVersionIds','finalAllowanceFamilyId',...(target?['target','allowanceFamilyId']:[])]);
     need(Object.keys(job).every(k=>allowed.has(k)),'FINAL_CONTAINER_CONSTRUCTOR_CHANGED','Unknown or foreign final job fields are not constructor members');
     const dependencies=[{kind:'artifact',stage:'copy',artifactId:copy.id,contentHash:copy.contentHash},{kind:'sketch-review',artifactId:sketch.id,contentHash:sketch.contentHash,generationId:sketch.sketchGeneration.generationId,reviewRunId:sketch.sketchGeneration.reviewRunId},...container.source.handoffs.map(r=>({kind:'sketch-review-report',reviewRunId:sketch.sketchGeneration.reviewRunId,reportId:r.id,reportHash:hash(r)})),...(owner?[{kind:'final-visual-report',originalRunId:owner.parent.id,originalJobId:owner.job.id,originalAttemptId:owner.job.attempts[0].id,reportId:owner.report.id,reportHash:hash(owner.report)}]:[]),...definition.dependencies.map(key=>{
      const producer=one(jobs,j=>j.nodeKey===key,'FINAL_CONTAINER_DEPENDENCY_CHANGED'),report=one(container.reports,r=>r.nodeKey===key,'FINAL_CONTAINER_DEPENDENCY_CHANGED');
      need(report.valid&&doneByKey.get(key)?.audit.revision<queues[i].audit.revision,'FINAL_CONTAINER_COMMAND_ORDER','Valid completed predecessor must precede queue');
      return {kind:'final-visual-report',originalRunId:container.id,originalJobId:producer.id,originalAttemptId:producer.attempts[0].id,reportId:report.id,reportHash:hash(report)};
     })];
     const done=member(job,{kind:target?'final-visual-image-original':'final-visual-text-original',scope:'finalVisualRunId',completion:'complete-final-visual',queued:queues[i],dependencies});doneByKey.set(job.nodeKey,done);if(proof.convergence)need(done.audit.revision<proof.convergence.revision,'FINAL_CONTAINER_COMMAND_ORDER','Original pixels must precede convergence adoption');
    }
    const reportKeys=jobs.filter(j=>j.node.phase!=='image').sort((a,b)=>doneByKey.get(a.nodeKey).audit.revision-doneByKey.get(b.nodeKey).audit.revision).map(j=>j.nodeKey);
    same(container.reports.map(r=>r.nodeKey),reportKeys,'FINAL_CONTAINER_REPORT_ORDER');
    same(container,{...(construction?construction.child:open.command.run),reports:container.reports,plan,...(container.convergence?{convergence:container.convergence}:{reviewTargets:targets,reviewImages:images})},'FINAL_CONTAINER_RECORD_CHANGED');
    proof.planHash=plan.planHash;proof.orderedTargets=structuredClone(plan.directions.flatMap(d=>d.targets));proof.targets=targets;
   }
   proof.status='closed';closedNodeIdentities.push(node.identity);
  } catch(error){proof.status='blocked';blockers.push({code:error.code??'FINAL_CONTAINER_INVALID',identity:node.identity,domain:node.domain,recordId:node.recordId,originalPointer:node.originalPointer,message:error.message});}
  containerProofs.push(proof);
 }
 return {closedNodeIdentities,containerProofs,blockers};
}
