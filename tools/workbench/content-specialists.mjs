import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket} from './content-contract-versions.mjs';
import {planningSelectedProject} from './content-planning-authority.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
const clone=structuredClone;
const text=x=>typeof x==='string'&&x.trim().length>0;
const requireWork=(value,message)=>need(value,'CONTENT_SPECIALIST_MISSING',message);

export function contentSpecialistWork(p,source,root) {
 if(planningContentPacket(root?.task.packetVersion))p=planningSelectedProject(p,root);
 const owners=['strategy','copy','visual'].map(module=>({module,job:planningContentPacket(root?.task.packetVersion)&&module==='visual'?p.jobs.find(j=>j.id===source.visualLeg.jobId):p.jobs.find(j=>j.outputVersionIds?.includes(source[module].artifactId))}));
 const aggregate=p.jobs.find(j=>j.id===source.visualLeg.jobId);
 const available=owners.map(({module,job})=>job?.status==='succeeded'?{jobId:job.id,ownerModule:module,binding:clone(job.binding),outputVersionIds:clone(job.outputVersionIds)}:null).filter(Boolean);
 if(aggregate?.status==='succeeded'&&!available.some(j=>j.jobId===aggregate.id))available.push({jobId:aggregate.id,ownerModule:'visual',binding:clone(aggregate.binding),outputVersionIds:clone(aggregate.outputVersionIds)});
 const required=[];
 let run;
 requireWork(source.visual.payload.protocol!=='final-visual-v1'||text(aggregate?.finalVisualRunId),'Typed final visual source requires its exact saved production run');
 if(aggregate?.finalVisualRunId) {
  run=p.finalVisualRuns?.find(r=>r.id===aggregate.finalVisualRunId);
  const report=run?.reports.find(r=>r.id===source.visualLeg.reportId&&r.nodeKey==='aggregate');
  const ownerAttempt=aggregate.attempts?.find(a=>a.id===aggregate.attemptId);
  requireWork(aggregate.purpose==='final_visual_aggregate'&&aggregate.node?.phase==='aggregate'&&aggregate.status==='succeeded'&&run?.plan&&report?.valid&&report.raw?.decision==='accept'&&text(report.raw.understanding)&&hash(report.raw.payload)===source.visualLeg.payloadHash&&equal(report.raw.payload,source.visual.payload)&&aggregate.outputVersionIds?.includes(report.id)&&ownerAttempt?.status==='succeeded'&&equal(ownerAttempt.receipt,report.receipt),'Selected visual owner must retain actual accepted aggregate payload and successful receipt');
  const {planHash,...rawPlan}=run.plan;
  requireWork(hash(rawPlan)===planHash&&report.raw.payload.planHash===planHash,'Typed production targets and declared specialist obligations must retain their original plan hash');
  let ownerRaw;try{ownerRaw=JSON.parse(report.receipt.responseText);}catch{}
  requireWork(equal(ownerRaw,report.raw),'Owner aggregation must match original successful response');
  for(const direction of run.plan.directions)for(const target of direction.targets) {
   const matches=p.jobs.filter(j=>j.finalVisualRunId===run.id&&j.nodeKey===`image:${target.id}`);
   const job=matches[0],attempt=job?.attempts?.find(a=>a.id===job.attemptId),receipt=attempt?.receipt;
   const asset=p.imageAssets?.find(i=>i.id===job?.outputVersionIds?.[0]);
   const accepted=report.raw.payload.directions.find(d=>d.directionId===direction.directionId)?.targets.filter(t=>t.targetId===target.id)??[];
   requireWork(matches.length===1&&job.purpose==='final_visual_image'&&job.node?.phase==='image'&&job.status==='succeeded'&&job.target?.id===target.id&&equal(job.target,target)&&job.outputVersionIds?.length===1&&attempt?.status==='succeeded'&&attempt.dispatchStarted&&receipt?.protocol==='image-http-receipt-v1'&&receipt.outcome==='output_received'&&receipt.projectId===p.id&&receipt.jobId===job.id&&receipt.attemptId===attempt.id&&receipt.candidateId===target.id&&receipt.requestHash===attempt.requestHash&&equal(receipt.binding,job.binding)&&['providerId','model','configHash'].every(k=>text(job.binding[k]))&&asset&&receipt.generated?.sha256===asset.sha256&&['byteLength','mediaType','width','height'].every(k=>receipt.generated[k]===asset[k])&&report.receipt.images?.some(i=>i.imageId===asset.id&&i.sha256===asset.sha256)&&asset.provenance?.attemptId===attempt.id&&asset.provenance?.requestHash===attempt.requestHash&&asset.provenance?.outputHash===asset.sha256&&accepted.length===1&&accepted[0].imageId===asset.id&&accepted[0].sha256===asset.sha256,'Every planned final target requires its exact successful creator receipt, managed output and substantive owner aggregation');
   const work={ownerModule:'visual',owner:aggregate.binding.role,requirement:`Produce and aggregate final target ${target.id}.`,evidenceJobId:job.id,binding:clone(job.binding),targetId:target.id,directionId:direction.directionId,outputVersionIds:clone(job.outputVersionIds),outputHashes:[{imageId:asset.id,sha256:asset.sha256}],receiptHash:hash(receipt),aggregation:{jobId:aggregate.id,binding:clone(aggregate.binding),reportId:report.id,receiptHash:hash(report.receipt),payloadHash:source.visualLeg.payloadHash,artifactId:source.visual.artifactId,contentHash:source.visual.contentHash}};
   required.push(work);available.push({jobId:job.id,...clone(work)});
  }
 }
 const declarations=[...(source.task.requiredSpecialists??[]),...(run?.plan.specialistRequirements??[]),...(run?.source.task.requiredSpecialists??[]),...owners.flatMap(({module,job})=>[...(job?.task?.requiredSpecialists??[]),...(job?.task?.specialistRequirements??[]),...(source[module].content?.workOrder?.specialistRequirements??[])])];
 for(const declaration of declarations) {
  requireWork(text(declaration.owner)&&text(declaration.requirement)&&text(declaration.evidenceJobId),'Declared specialist must preserve its owner and substantive requirement');
  const matches=required.filter(r=>r.owner===declaration.owner&&r.evidenceJobId===declaration.evidenceJobId&&(!declaration.targetId||r.targetId===declaration.targetId));
  requireWork(matches.length>0,'Declared specialist must resolve to actual applicable production work and owner aggregation');
  for(const work of matches)if(!required.some(r=>r.evidenceJobId===work.evidenceJobId&&r.requirement===declaration.requirement))required.push({...clone(work),requirement:declaration.requirement});
 }
 return {availableSavedWork:available,requiredSpecialists:required};
}
