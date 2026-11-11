import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {researchMethodIdentity} from './research-method.mjs';
import {ordinaryHasContext,ordinarySuccessfulStatus,ordinaryOriginMatches,ordinarySameContext} from './ordinary-model-claims.mjs';
import {semanticHash} from './semantic-authority.mjs';
import {projectResearchReaderReport,buildResearchReaderPacket,buildResearchReaderRequest,validateResearchReaderOutput,researchReaderEligibility} from './research-reader-loop.mjs';
export const RESEARCH_READER_COMMANDS=Object.freeze(['register-research-questions','record-research-reader-dispositions','request-research-reader','mark-research-reader-dispatched','complete-research-reader','recover-research-reader']);
const need=(x,code,message)=>{if(!x)throw Object.assign(Error(message),{code});};
const hash=x=>createHash('sha256').update(x).digest('hex');
const text=x=>typeof x==='string'&&x.trim()&&x.length<=100000;
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const overlap=(a,b)=>['actorId','runId','contextId'].some(k=>a?.[k]===b?.[k])||(a?.parentRunIds??[]).includes(b?.runId)||(b?.parentRunIds??[]).includes(a?.runId)||(a?.ancestorActorIds??[]).includes(b?.actorId)||(b?.ancestorActorIds??[]).includes(a?.actorId);
function workflow(p){need(p.workflow?.version==='proposal-seven-v1','SEVEN_STAGE_WORKFLOW_REQUIRED','Reader state belongs to current workflow');}
function registered(p,r){
  need(r && r.taskCardId===p.activeTaskCardId,'RESEARCH_QUESTIONS_REQUIRED','Current preregistered questions required');
  const core=Object.fromEntries(['id','taskCardId','taskCardHash','method','questions','readerCount'].map(k=>[k,r[k]]));
  need(equal(r.method,researchMethodIdentity()),'RESEARCH_METHOD_CHANGED','Question plan belongs to an older fixed method');
  need(r.taskCardHash===semanticHash(p.taskCards.find(c=>c.id===p.activeTaskCardId)),'RESEARCH_QUESTIONS_CHANGED','Confirmed task bytes changed');
  need(r.registrationHash===semanticHash(core),'RESEARCH_QUESTIONS_CHANGED','Question registration changed');return r;
}
export function researchQuestionRegistration(p){const r=(p.researchQuestionRegistrations??[]).filter(r=>r.taskCardId===p.activeTaskCardId).at(-1);return r?registered(p,r):null;}
export function researchReaderReport(p,reportId,seen=new Set()){
  need(!seen.has(reportId),'INVALID_READER_REPORT','Reader report ancestry is cyclic');seen.add(reportId);
  const reports=(p.researchReaderReports??[]).filter(r=>r.id===reportId);need(reports.length===1,'INVALID_READER_REPORT','Exactly one stored reader report required');
  const report=reports[0],job=p.jobs.find(j=>j.id===report.jobId),attempt=job?.attempts.find(a=>a.id===report.attemptId),packet=job?.task.readerInput,receipt=report.executionReceipt;
  need(job?.purpose==='research_reader'&&job.status==='succeeded'&&attempt?.status==='succeeded'&&attempt.dispatchStarted===true&&equal(job.outputVersionIds,[report.id])&&equal(attempt.receipt,receipt)&&equal(attempt.executor,report.context),'INVALID_READER_REPORT','Successful exact stored reader attempt required');
  const a=p.artifacts.find(a=>a.id===report.artifactId);need(a&&a.contentHash===report.contentHash&&packet.artifactId===a.id&&packet.contentHash===a.contentHash&&report.registrationId===job.registrationId&&report.readerSeat===job.readerSeat,'INVALID_READER_REPORT','Stored report source binding changed');
  need(hash(job.task.readerContentText)===a.contentHash&&equal(packet.visibleReport,projectResearchReaderReport(job.task.readerContentText)),'INVALID_READER_SOURCE','Stored report source bytes changed');
  const validated=validateResearchReaderOutput(report.rawReport,packet),request=buildResearchReaderRequest(packet);
  need(Object.keys(validated).every(k=>equal(validated[k],report[k]))&&equal(report.eligibility,researchReaderEligibility(packet,report.rawReport)),'INVALID_READER_REPORT','Stored projected report or eligibility changed');
  const r=(p.researchQuestionRegistrations??[]).find(r=>r.id===report.registrationId),card=p.taskCards.find(c=>c.id===r?.taskCardId),producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)&&(!j.purpose||j.purpose==='stage'));
  const core=r&&Object.fromEntries(['id','taskCardId','taskCardHash','method','questions','readerCount'].map(k=>[k,r[k]]));
  need(r&&card&&r.taskCardHash===semanticHash(card)&&r.registrationHash===semanticHash(core)&&equal(packet.taskCard,{id:card.id,purpose:card.brief})&&equal(packet.method,r.method)&&equal(packet.questionRegistration,{id:r.id,taskCardId:r.taskCardId,questions:r.questions})&&report.readerSeat>=0&&report.readerSeat<r.readerCount&&equal(producer?.task.researchQuestionRegistration,r)&&producer.task.researchQuestionRegistrationId===r.id&&producer.task.researchQuestionRegistrationHash===r.registrationHash&&equal(producer.task.researchMethod,r.method),'INVALID_READER_REPORT','Stored plan, producer and seat binding changed');
  const requested=p.audit.find(e=>{try{const c=JSON.parse(p.processedCommands[e.commandId]);return c.kind==='request-stage'&&c.jobId===producer.id;}catch{return false;}});
  need(requested?.revision>r.registeredRevision,'RESEARCH_QUESTIONS_NOT_PREREGISTERED','Stored plan did not precede producer');
  const authors=[],authorSeen=new Set(),visit=x=>{if(!x||authorSeen.has(x.id))return;authorSeen.add(x.id);authors.push(x.author);for(const id of [...x.inputVersionIds,x.revision?.revisionOf?.artifactId].filter(Boolean))visit(p.artifacts.find(a=>a.id===id));};visit(a);
  need(authors.every(author=>author&&!overlap(author,report.context))&&!p.jobs.some(j=>j.attempts.some(t=>t.id!==attempt.id&&(overlap(t.executor,report.context)&&j.purpose==='research_reader'||ordinarySameContext(t.receipt,receipt)))),'READER_CONTEXT_REUSED','Stored reader is not independent from author or other calls');
  need(report.reportHash===hash(JSON.stringify(validated,null,2))&&receipt.validatedOutputHash===report.reportHash&&receipt.validatedOutputPath===report.payloadRef,'INVALID_READER_REPORT','Stored normalized report changed');
  need(receipt.attemptId===attempt.id&&receipt.runId===attempt.id&&receipt.taskId===job.task.id&&receipt.providerId===job.binding.providerId&&receipt.model===job.binding.model&&receipt.requestedModel===job.binding.model&&receipt.role===job.binding.role&&ordinaryOriginMatches(receipt,attempt.httpAttemptLocator,attempt.id)&&ordinaryHasContext(receipt)&&ordinarySuccessfulStatus(receipt)&&['signal','reason','error'].every(k=>receipt[k]==null),'INVALID_READER_RECEIPT','Stored native receipt changed');
  need(receipt.inputPacketHash===hash(JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema})),'INVALID_READER_RECEIPT','Stored native request changed');
  let raw;try{raw=JSON.parse(receipt.responseText);}catch{need(false,'INVALID_READER_RECEIPT','Stored native response missing');}
  need(equal(raw,report.rawReport)&&(!Object.hasOwn(receipt,'parsedOutput')||equal(receipt.parsedOutput,raw))&&(!receipt.providerExecution||Object.entries(receipt.providerExecution).every(([k,v])=>equal(v,receipt[k]))),'INVALID_READER_RECEIPT','Stored raw response changed');
  if(packet.phase==='recheck'){
    const previousIndex=(p.researchReaderReports??[]).findIndex(x=>x.id===job.task.readerPreviousReportId),currentIndex=p.researchReaderReports.findIndex(x=>x.id===report.id);
    need(previousIndex>=0&&previousIndex<currentIndex,'INVALID_READER_REPORT','Previous reader original must precede this report');
    const previous=recheckPrevious(p,a,r,report.readerSeat,job.task.readerPreviousReportId,job.task.readerDispositionId,job.id,{historical:true,seen});
    const rebuilt=buildResearchReaderPacket({taskCard:packet.taskCard,artifactId:a.id,contentHash:a.contentHash,contentText:job.task.readerContentText,method:r.method,questionRegistration:packet.questionRegistration,visibleReport:packet.visibleReport,phase:'recheck',previous});
    need(equal(packet,rebuilt),'INVALID_READER_REPORT','Stored recheck original and dispositions changed');
  }
  return {report,job,packet,validated,eligibility:researchReaderEligibility(packet,report.rawReport)};
}
export function validateStoredResearchReader(p,report,{current=false}={}){const value=researchReaderReport(p,report.id);need(equal(value.report,report),'INVALID_READER_REPORT','Exact stored reader report required');if(current)researchReaderTarget(p,value.job);return value;}
function latestReport(p,registrationId,seat,excludeJobId){return (p.researchReaderReports??[]).filter(r=>r.registrationId===registrationId&&r.readerSeat===seat&&r.jobId!==excludeJobId).at(-1);}
function revisionAncestor(p,a,old){
  const seen=new Set();let current=a;
  while(current&&!seen.has(current.id)){
    if(current.id===old.id)return current.contentHash===old.contentHash;
    seen.add(current.id);const producer=p.jobs.find(j=>j.outputVersionIds?.includes(current.id)&&(!j.purpose||j.purpose==='stage'));
    const refs=[current.revision?.revisionOf,producer?.task.revisionInput?.revisionOf,producer?.task.correctionInput?.revisionOf].filter(Boolean);
    if(!refs.length||!refs.every(r=>equal(r,refs[0])))return false;
    const ref=refs[0],parent=p.artifacts.find(a=>a.id===ref.artifactId);if(!parent||parent.contentHash!==ref.contentHash)return false;current=parent;
  }
  return false;
}
function latestNeedsRecheck(p,r,seat,excludeJobId){const latest=latestReport(p,r.id,seat,excludeJobId);if(!latest)return false;const old=researchReaderReport(p,latest.id);return old.validated.issues.length>0||old.validated.rechecks.some(i=>i.status==='unresolved')||!old.eligibility.understandingComplete;}
function recheckPrevious(p,a,r,seat,previousReportId,dispositionId,excludeJobId,{historical=false,seen}={}){
  const old=researchReaderReport(p,previousReportId,seen),d=(p.researchReaderDispositions??[]).find(x=>x.id===dispositionId);
  need(old.report.registrationId===r.id&&old.report.readerSeat===seat&&(historical||latestReport(p,r.id,seat,excludeJobId)?.id===previousReportId),'STALE_READER_REPORT','Recheck must consume the latest same-plan same-seat report');
  need(a.id!==old.report.artifactId&&a.contentHash!==old.report.contentHash&&revisionAncestor(p,a,{id:old.report.artifactId,contentHash:old.report.contentHash}),'READER_REVISION_REQUIRED','New report must descend from the original research revision');
  const core=d&&Object.fromEntries(['id','registrationId','readerSeat','artifactId','contentHash','oldArtifactId','oldContentHash','previousReportId','previousReportHash','previousPacketHash','dispositions'].map(k=>[k,d[k]]));
  need(d&&d.dispositionHash===semanticHash(core)&&d.registrationId===r.id&&d.readerSeat===seat&&d.artifactId===a.id&&d.contentHash===a.contentHash&&d.oldArtifactId===old.report.artifactId&&d.oldContentHash===old.report.contentHash&&d.previousReportId===old.report.id&&d.previousReportHash===old.report.reportHash&&d.previousPacketHash===old.packet.packetHash,'STALE_READER_DISPOSITION','Exact original and revised disposition binding required');
  return {packet:old.packet,rawReport:old.report.rawReport,dispositions:d.dispositions};
}
export function researchReaderTarget(p,job){
  workflow(p);
  const a=p.artifacts.find(a=>a.id===job.targetArtifactId),packet=job.task?.readerInput,r=registered(p,researchQuestionRegistration(p));
  need(a?.stage==='research'&&a.provenance==='provider_execution'&&p.activeByStage.research===a.id&&a.inputVersionIds.includes(p.activeTaskCardId)&&equal(job.inputVersionIds,[a.id]),'STALE_RESEARCH_READER','Current research required');
  const card=p.taskCards.find(c=>c.id===p.activeTaskCardId),producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)&&(!j.purpose||j.purpose==='stage'));
  need(card&&p.confirmations.some(c=>c.taskCardId===card.id),'TASK_CARD_UNCONFIRMED','Confirmed reader task required');
  need(producer&&equal(producer.task?.researchMethod,r.method)&&equal(producer.task?.researchQuestionRegistration,r)&&producer.task?.researchQuestionRegistrationId===r.id&&producer.task?.researchQuestionRegistrationHash===r.registrationHash,'RESEARCH_QUESTIONS_NOT_PREREGISTERED','Producer must consume exact preregistered questions');
  const requested=p.audit.find(e=>{try {const c=JSON.parse(p.processedCommands[e.commandId]);return c.kind==='request-stage'&&c.jobId===producer.id;}catch{return false;}});
  need(requested?.revision>r.registeredRevision,'RESEARCH_QUESTIONS_NOT_PREREGISTERED','Questions must precede research generation');
  need(packet?.artifactId===a.id&&packet.contentHash===a.contentHash&&equal(packet.taskCard,{id:card.id,purpose:card.brief})&&equal(packet.method,r.method)&&equal(packet.questionRegistration,{id:r.id,taskCardId:r.taskCardId,questions:r.questions}),'STALE_RESEARCH_READER','Reader packet must match task, source and method');
  need(Number.isInteger(job.readerSeat)&&job.readerSeat>=0&&job.readerSeat<r.readerCount&&job.registrationId===r.id,'INVALID_RESEARCH_READER_SEAT','Seat was not preregistered');
  need(typeof job.task.readerContentText==='string'&&hash(job.task.readerContentText)===a.contentHash&&equal(packet.visibleReport,projectResearchReaderReport(job.task.readerContentText)),'INVALID_READER_SOURCE','Reader projection must preserve the actual source bytes');
  need(packet.visibleReport.renderings.length===0,'RESEARCH_READER_SCOPE_UNSUPPORTED','Pixel reader is not connected');
  let previous=null;
  if(packet.phase==='first_read'){need(!job.task.readerPreviousReportId&&!job.task.readerDispositionId&&!latestNeedsRecheck(p,r,job.readerSeat,job.id),'READER_RECHECK_REQUIRED','Prior reader questions cannot be hidden by a new first read');}
  else previous=recheckPrevious(p,a,r,job.readerSeat,job.task.readerPreviousReportId,job.task.readerDispositionId,job.id);
  const rebuilt=buildResearchReaderPacket({taskCard:packet.taskCard,artifactId:a.id,contentHash:a.contentHash,contentText:job.task.readerContentText,method:r.method,questionRegistration:packet.questionRegistration,visibleReport:projectResearchReaderReport(job.task.readerContentText),phase:packet.phase,previous});
  need(equal(packet,rebuilt),'INVALID_READER_SOURCE','Stored recheck packet differs from source and disposition originals');
  buildResearchReaderRequest(packet);return a;
}
export function reduceResearchReaderCommand(p,c,context,hooks){
  workflow(p);need(context.actorType==='agent'||context.actorType==='human','READER_CONTEXT_REQUIRED','Trusted context required');
  if(c.kind==='register-research-questions'){
    need(c.taskCardId===p.activeTaskCardId&&p.confirmations.some(x=>x.taskCardId===c.taskCardId),'TASK_CARD_UNCONFIRMED','Register current confirmed research scope');
    need(text(c.registrationId)&&equal(c.method,hooks.methodIdentity()),'RESEARCH_METHOD_CHANGED','Current fixed method required');
    need([1,2].includes(c.readerCount)&&Array.isArray(c.questions)&&c.questions.length>0&&c.questions.length<=100&&new Set(c.questions.map(q=>q.id)).size===c.questions.length&&c.questions.some(q=>q.critical===true),'INVALID_RESEARCH_QUESTIONS','One or two reader seats and unique brand questions required');
    need(c.questions.every(q=>fields(q,['id','question','critical'])&&text(q.id)&&text(q.question)&&typeof q.critical==='boolean'),'INVALID_RESEARCH_QUESTIONS','Exact question fields required');
    const core={id:c.registrationId,taskCardId:c.taskCardId,taskCardHash:semanticHash(p.taskCards.find(x=>x.id===c.taskCardId)),method:structuredClone(c.method),questions:structuredClone(c.questions),readerCount:c.readerCount};
    p.researchQuestionRegistrations??=[];need(!p.researchQuestionRegistrations.some(r=>r.id===c.registrationId),'RESEARCH_QUESTIONS_CHANGED','Registration identity is immutable');
    p.researchQuestionRegistrations.push({...core,registrationHash:semanticHash(core),registeredRevision:p.revision+1,registeredBy:structuredClone(context),createdAt:context.now??null});return;
  }
  need(context.actorType==='agent','EXECUTOR_REQUIRED','Only internal runtime can write reader jobs and reports');
  if(c.kind==='record-research-reader-dispositions'){
    const r=registered(p,researchQuestionRegistration(p)),old=researchReaderReport(p,c.previousReportId),a=hooks.target(p,c.artifactId);
    need(old.report.registrationId===r.id&&latestReport(p,r.id,old.report.readerSeat)?.id===old.report.id,'STALE_READER_REPORT','Use the latest same-plan report');
    need(a.id!==old.report.artifactId&&a.contentHash!==old.report.contentHash&&revisionAncestor(p,a,{id:old.report.artifactId,contentHash:old.report.contentHash}),'READER_REVISION_REQUIRED','Actual revision ancestry required');
    need(text(c.dispositionId)&&Array.isArray(c.dispositions)&&c.dispositions.length<=100&&c.dispositions.length===old.validated.issues.length&&new Set(c.dispositions.map(d=>d.issueId)).size===c.dispositions.length&&c.dispositions.every(d=>old.validated.issues.some(i=>i.id===d.issueId)&&fields(d,['issueId','action','response','locations'])&&['revised','clarified','narrowed','withdrawn','unresolved'].includes(d.action)&&text(d.response)&&Array.isArray(d.locations)&&d.locations.length>0&&d.locations.length<=100&&d.locations.every(l=>fields(l,['location','quote'])&&text(l.location)&&text(l.quote))),'INVALID_READER_DISPOSITION','Every original issue requires one located disposition');
    p.researchReaderDispositions??=[];need(!p.researchReaderDispositions.some(d=>d.id===c.dispositionId),'INVALID_READER_DISPOSITION','Disposition identity is immutable');
    const core={id:c.dispositionId,registrationId:r.id,readerSeat:old.report.readerSeat,artifactId:a.id,contentHash:a.contentHash,oldArtifactId:old.report.artifactId,oldContentHash:old.report.contentHash,previousReportId:old.report.id,previousReportHash:old.report.reportHash,previousPacketHash:old.packet.packetHash,dispositions:structuredClone(c.dispositions)};
    p.researchReaderDispositions.push({...core,dispositionHash:semanticHash(core),recordedBy:structuredClone(context),createdAt:context.now??null});return;
  }
  if(c.kind==='request-research-reader'){
    need(context.actorType==='agent','EXECUTOR_REQUIRED','Internal reader enqueue required');
    const job={id:c.jobId,purpose:'research_reader',stage:'research',targetArtifactId:c.artifactId,inputVersionIds:[c.artifactId],registrationId:c.registrationId,readerSeat:c.seat,status:'queued',requestedBy:context.actorId,binding:structuredClone(c.binding),task:structuredClone(c.task),attempts:[]};
    need(text(c.jobId)&&!p.jobs.some(j=>j.id===c.jobId)&&fields(c.binding,['providerId','model','role'])&&Object.values(c.binding).every(text),'INVALID_JOB','Unique bound reader job required');
    need(c.task?.id===c.jobId&&c.task.parentId===p.id&&c.task.owner===c.binding.role,'INVALID_TASK','Reader task identity required');
    const a=researchReaderTarget(p,job);hooks.target(p,a.id);
    need(!p.jobs.some(j=>j.purpose==='research_reader'&&j.registrationId===c.registrationId&&j.readerSeat===c.seat&&(['queued','running','awaiting_reconciliation'].includes(j.status)||j.targetArtifactId===a.id&&j.status==='succeeded')),'READER_OUTCOME_UNSETTLED','Do not repeat pending, unknown or successful reader seat');
    p.jobs.push(job);return;
  }
  const job=p.jobs.find(j=>j.id===c.jobId);need(job?.purpose==='research_reader','INVALID_JOB','Reader job required');
  const a=researchReaderTarget(p,job);hooks.target(p,a.id);
  const recovery=c.kind==='recover-research-reader';
  let attempt;
  if(recovery){attempt=job.attempts.at(-1);need(context.actorType==='agent'&&job.status==='awaiting_reconciliation'&&attempt?.status==='awaiting_reconciliation'&&attempt.id===c.attemptId&&attempt.receipt&&['validatedOutputPath','validatedOutputHash'].every(k=>!Object.hasOwn(attempt.receipt,k)||equal(attempt.receipt[k],c.executionReceipt?.[k]))&&equal(Object.fromEntries(Object.entries(attempt.receipt).filter(([k])=>!['validatedOutputPath','validatedOutputHash'].includes(k))),Object.fromEntries(Object.entries(c.executionReceipt??{}).filter(([k])=>!['validatedOutputPath','validatedOutputHash'].includes(k)))),'READER_RECOVERY_REQUIRED','Recover only an exact saved original attempt');}
  else attempt=hooks.running(job,c,context);
  if(c.kind==='mark-research-reader-dispatched'){need(context.actorType==='agent'&&attempt.dispatchStarted===false,'READER_ALREADY_DISPATCHED','Reader dispatch is claimed once');attempt.dispatchStarted=true;return;}
  need(['complete-research-reader','recover-research-reader'].includes(c.kind)&&attempt.dispatchStarted===true,'READER_DISPATCH_REQUIRED','Actual reader dispatch required');
  const readerContext=attempt.executor;hooks.independent(p,a,readerContext);
  need(!p.jobs.some(j=>j.id!==job.id&&j.purpose==='research_reader'&&j.attempts.some(t=>overlap(t.executor,readerContext))),'READER_CONTEXT_REUSED','Independent first reads require fresh reader contexts');
  const receipt=c.executionReceipt,request=buildResearchReaderRequest(job.task.readerInput);
  hooks.receipt(p,a,job,attempt,receipt,c.reportId,c.rawReport);
  need(receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.inputPacketHash===hash(JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema}))&&['signal','reason','error'].every(k=>receipt[k]==null),'INVALID_READER_RECEIPT','Exact successful native reader input required');
  let raw;try{raw=JSON.parse(receipt.responseText);}catch{need(false,'INVALID_READER_RECEIPT','Original response required');}
  need(equal(raw,c.rawReport)&&(!Object.hasOwn(receipt,'parsedOutput')||equal(receipt.parsedOutput,raw))&&(!receipt.providerExecution||Object.entries(receipt.providerExecution).every(([k,v])=>equal(v,receipt[k]))),'INVALID_READER_RECEIPT','Reader report differs from original provider result');
  const validated=validateResearchReaderOutput(c.rawReport,job.task.readerInput),eligibility=researchReaderEligibility(job.task.readerInput,c.rawReport);
  need(text(c.reportId)&&text(c.payloadRef)&&c.contentHash===hash(JSON.stringify(validated,null,2))&&receipt.validatedOutputPath===c.payloadRef&&receipt.validatedOutputHash===c.contentHash,'INVALID_READER_REPORT','Normalized original report required');
  for(const item of validated.rechecks.filter(r=>r.status==='unresolved')){const original=job.task.readerInput.previous.issues.find(i=>i.id===item.issueId);need(validated.issues.some(i=>i.id===original.id&&i.type===original.type&&i.severity===original.severity&&equal(i.questionIds,original.questionIds)),'READER_ISSUE_CARRY_REQUIRED','Unresolved original questions must remain in the new issue set');}
  p.researchReaderReports??=[];need(!p.researchReaderReports.some(r=>r.id===c.reportId),'INVALID_READER_REPORT','Unique reader report required');
  p.researchReaderReports.push({...validated,id:c.reportId,artifactId:a.id,contentHash:a.contentHash,registrationId:job.registrationId,readerSeat:job.readerSeat,jobId:job.id,attemptId:attempt.id,rawReport:structuredClone(c.rawReport),payloadRef:c.payloadRef,reportHash:c.contentHash,executionReceipt:structuredClone(receipt),context:structuredClone(readerContext),eligibility,createdAt:context.now??null});
  attempt.status='succeeded';attempt.receipt=structuredClone(receipt);attempt.finishedAt=context.now??null;job.status='succeeded';job.outputVersionIds=[c.reportId];
}

export function researchReaderCoverage(p){
  const r=researchQuestionRegistration(p),artifactId=p.activeByStage.research??null;
  if(!r)return {artifactId,registrationId:null,seats:[],understandingComplete:false};
  const seats=Array.from({length:r.readerCount},(_,seat)=>{
    const report=(p.researchReaderReports??[]).filter(x=>x.registrationId===r.id&&x.readerSeat===seat&&x.artifactId===artifactId).at(-1);
    if(p.jobs.some(j=>j.purpose==='research_reader'&&j.registrationId===r.id&&j.readerSeat===seat&&['queued','running','awaiting_reconciliation'].includes(j.status)))return {seat,reportId:report?.id??null,status:'unsettled'};
    if(!report)return {seat,reportId:null,status:'needs_reading'};
    try {const current=validateStoredResearchReader(p,report,{current:true});return {seat,reportId:report.id,status:current.eligibility.understandingComplete?'understood':'needs_revision'};}
    catch(error){return {seat,reportId:report.id,status:'stale',reason:error.code??'INVALID_READER_REPORT'};}
  });
  return {artifactId,registrationId:r.id,seats,understandingComplete:seats.every(s=>s.status==='understood')};
}

export function validateResearchReaderEvidence(value,{artifactId,contentHash,taskCard}={}){
  need(fields(value,['protocolVersion','artifactId','contentHash','taskCardId','taskCardHash','method','registrationId','registrationHash','readerCount','reports','factualSufficiencyVerified','consumerValidation','humanApproval','evidenceHash'])&&value.protocolVersion==='research-reader-evidence-v1'&&[1,2].includes(value.readerCount)&&value.factualSufficiencyVerified===false&&value.consumerValidation===false&&value.humanApproval===false,'INVALID_READER_EVIDENCE','Exact bounded reader evidence required');
  const {evidenceHash,...body}=value;need(evidenceHash===semanticHash(body)&&[value.contentHash,value.taskCardHash,value.registrationHash,evidenceHash].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)),'INVALID_READER_EVIDENCE','Reader evidence hashes changed');
  need((artifactId===undefined||value.artifactId===artifactId)&&(contentHash===undefined||value.contentHash===contentHash)&&(!taskCard||value.taskCardId===taskCard.id&&value.taskCardHash===semanticHash(taskCard)),'INVALID_READER_EVIDENCE','Reader evidence belongs to another research or task');
  need(Array.isArray(value.reports)&&value.reports.length===value.readerCount&&new Set(value.reports.map(r=>r.seat)).size===value.readerCount,'INVALID_READER_EVIDENCE','All planned reader seats required');
  for(const r of value.reports){
    need(fields(r,['seat','id','jobId','attemptId','packetHash','reportHash','packet','rawReport'])&&Number.isInteger(r.seat)&&r.seat>=0&&r.seat<value.readerCount&&[r.id,r.jobId,r.attemptId].every(text),'INVALID_READER_EVIDENCE','Exact reader report identity required');
    const checked=validateResearchReaderOutput(r.rawReport,r.packet),eligibility=researchReaderEligibility(r.packet,r.rawReport);
    need(r.packetHash===r.packet.packetHash&&r.reportHash===hash(JSON.stringify(checked,null,2))&&r.packet.artifactId===value.artifactId&&r.packet.contentHash===value.contentHash&&r.packet.taskCard.id===value.taskCardId&&equal(r.packet.method,value.method)&&r.packet.questionRegistration.id===value.registrationId&&eligibility.understandingComplete,'INVALID_READER_EVIDENCE','Reader report is incomplete, negative or mismatched');
  }
  return value;
}
export function researchReaderEvidence(p,artifactId){
  workflow(p);const a=p.artifacts.find(a=>a.id===artifactId),r=researchQuestionRegistration(p);
  need(r&&a?.stage==='research'&&p.activeByStage.research===a.id,'RESEARCH_R7_READER_REQUIRED','Current research and question plan required');
  need(!p.jobs.some(j=>j.purpose==='research_reader'&&j.registrationId===r.id&&['queued','running','awaiting_reconciliation'].includes(j.status)),'RESEARCH_R7_READER_REQUIRED','Pending or unknown readers cannot authorize handoff');
  const reports=Array.from({length:r.readerCount},(_,seat)=>{
    const latest=latestReport(p,r.id,seat);need(latest?.artifactId===a.id,'RESEARCH_R7_READER_REQUIRED','Each planned reader needs this exact revision');
    need(p.researchReaderReports.filter(x=>x.artifactId===a.id&&x.registrationId===r.id&&x.readerSeat===seat).length===1,'RESEARCH_R7_READER_REQUIRED','Reader seat is missing or ambiguous');
    const value=validateStoredResearchReader(p,latest,{current:true});need(value.eligibility.understandingComplete,'RESEARCH_R7_READER_REQUIRED','Latest reader report has unresolved problems');
    return {seat,id:latest.id,jobId:value.job.id,attemptId:latest.attemptId,packetHash:value.packet.packetHash,reportHash:latest.reportHash,packet:structuredClone(value.packet),rawReport:structuredClone(latest.rawReport)};
  });
  const body={protocolVersion:'research-reader-evidence-v1',artifactId:a.id,contentHash:a.contentHash,taskCardId:r.taskCardId,taskCardHash:r.taskCardHash,method:structuredClone(r.method),registrationId:r.id,registrationHash:r.registrationHash,readerCount:r.readerCount,reports,factualSufficiencyVerified:false,consumerValidation:false,humanApproval:false};
  return validateResearchReaderEvidence({...body,evidenceHash:semanticHash(body)},{artifactId:a.id,contentHash:a.contentHash,taskCard:p.taskCards.find(c=>c.id===p.activeTaskCardId)});
}
