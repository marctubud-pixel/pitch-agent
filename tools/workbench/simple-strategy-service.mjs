import {validateStageOutput} from './stage-content.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {SIMPLE_STRATEGY_VERSION} from './seven-stage-strategy.mjs';
import {strategyBasisFor,DomainError} from './project.mjs';
import {requireResearchWorkflow} from './seven-stage-workflow.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {verifyStageOriginal,readStageInvocationOriginal} from './stage-original.mjs';
import {reopenOrdinaryJob,ordinaryDomainReceipt,reopenOrdinaryCompletion} from './ordinary-model-project.mjs';
import {validateEvidenceReviewOutput} from './evidence-review.mjs';
import {reconcileStage} from './reconcile-stage.mjs';
import {verifyCurrentResearchReaders} from './research-reader-workflow.mjs';
import {requireSimpleHttpJob} from './simple-strategy-http.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(v,c,m=c)=>{if(!v)throw new DomainError(c,m);};
const actor=()=>({actorType:'agent',actorId:'simple-strategy-http',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
export function createSimpleStrategyService({store,rootDir,executor,executionAllowed,bindings={},providers={}}){
 const read=id=>{const p=store.read(id);requireResearchWorkflow(p);return p;};
 const capable=()=>{const configured=['strategy','verification'].every(role=>{const b=bindings[role],p=providers[b?.providerId];return b&&p?.model===b.model&&(p.adapter==='workbench-model-http-v1'||typeof p.execute==='function');});return {protocolVersion:SIMPLE_STRATEGY_VERSION,configured,executionAllowed:Boolean(executionAllowed),available:Boolean(configured&&executor&&executionAllowed),reason:!executionAllowed?'策略执行尚未启用。':!configured?'策略与独立全文核验尚未配置。':'只执行明确原任务；研究放行及当前版本门槛仍保留。'};};
 const producer=(p,a)=>p.jobs.find(j=>j.outputVersionIds?.includes(a?.id)&&j.task?.strategyContractVersion===SIMPLE_STRATEGY_VERSION);
 function current(p,j){need(j?.task?.strategyContractVersion===SIMPLE_STRATEGY_VERSION,'SIMPLE_STRATEGY_REQUIRED');need(equal(j.task.strategyBasis,strategyBasisFor(p,j.binding,j.task)),'STALE_SIMPLE_STRATEGY');}
 async function original(p,a){if(!a?.reconciliationId)return verifyStageOriginal(p,a,{executionRoot:rootDir});
  need(a.strategyContract?.version===SIMPLE_STRATEGY_VERSION,'SIMPLE_STRATEGY_REQUIRED');const j=producer(p,a),t=j?.attempts.at(-1),r=p.reconciliations?.find(r=>r.id===a.reconciliationId),commands=Object.values(p.processedCommands).map(x=>JSON.parse(x)).filter(c=>c.kind==='reconcile-stage'&&c.reconciliationId===r?.id);need(r&&j&&t&&commands.length===1,'SIMPLE_ORIGINAL_CHANGED');const c=commands[0],audits=p.audit.filter(x=>x.commandId===c.commandId);need(audits.length===1&&audits[0].kind==='reconcile-stage'&&audits[0].actorId===r.context.actorId&&['succeeded','succeeded_stale'].includes(j.status)&&t.status==='awaiting_reconciliation'&&j.outputVersionIds.length===1&&j.outputVersionIds[0]===a.id&&r.jobId===j.id&&r.attemptId===t.id&&r.artifactId===a.id&&equal(t.receipt,a.executionReceipt)&&equal(t.executor,a.author)&&c.jobId===j.id&&c.attemptId===t.id&&c.artifactId===a.id&&c.payloadRef===a.payloadRef&&c.contentHash===a.contentHash&&r.originalReceiptHash===hash(JSON.stringify(t.receipt))&&r.rawOutputHash===hash(t.receipt.responseText)&&r.inputPacketHash===t.receipt.inputPacketHash&&r.validatedOutputHash===a.contentHash,'SIMPLE_ORIGINAL_CHANGED');
  const saved=await readStageInvocationOriginal(p,j,t,{executionRoot:rootDir}),output=validateStageOutput('strategy',JSON.parse(saved.outputText),{strategyContractVersion:SIMPLE_STRATEGY_VERSION,strategyBasis:j.task.strategyBasis,sourceRecords:j.task.sourceRecords??[],visualCatalogue:j.task.visualCatalogue??[]}),loaded=await readArtifactContent(p,a.id,rootDir);need(loaded.contentText===JSON.stringify(output.content,null,2)&&a.strategyContract.basisHash===j.task.strategyBasis.basisHash&&a.strategyContract.contentHash===a.contentHash&&equal(a.claims,output.claims)&&equal(a.technicalReceipts,{sourceCatalogue:{version:1,records:j.task.sourceRecords??[]},visualCatalogue:j.task.visualCatalogue??[]}),'SIMPLE_ORIGINAL_CHANGED');
 }
 async function status(id){const p=read(id),artifacts=p.artifacts.filter(a=>a.strategyContract?.version===SIMPLE_STRATEGY_VERSION),j=p.jobs.filter(j=>j.task?.strategyContractVersion===SIMPLE_STRATEGY_VERSION).at(-1),a=artifacts.find(a=>a.id===p.activeByStage.strategy&&j?.outputVersionIds?.includes(a.id));let applicable=false,reason='尚无策略。',content=null,blockedOutput=null;
  if(j)try{current(p,j);applicable=true;reason='策略仍需独立全文核验和下游负责人接收。';}catch(error){reason=error.code??'历史策略';}
  if(a){await original(p,a);content=(await readArtifactContent(p,a.id,rootDir)).content;}
  const failure=j?.error?{code:j.error.code,message:j.error.message}:null;
  if(j?.status==='blocked'&&j.error?.code==='STAGE_INPUT_GAP'){
   const attempt=j.attempts.find(t=>t.id===j.attemptId),receipt=attempt?.receipt;
   need(attempt?.status==='blocked'&&receipt,'SIMPLE_BLOCKED_ORIGINAL_INVALID');
   const saved=await readStageInvocationOriginal(p,j,attempt,{executionRoot:rootDir});
   const output=validateStageOutput('strategy',JSON.parse(saved.outputText),{strategyContractVersion:SIMPLE_STRATEGY_VERSION,strategyBasis:j.task.strategyBasis,sourceRecords:j.task.sourceRecords??[],visualCatalogue:j.task.visualCatalogue??[]});
   const normalized=JSON.stringify(output.content,null,2),path=join(rootDir,attempt.id,'output.json');
   need(output.status==='blocked'&&receipt.validatedOutputPath===path&&receipt.validatedOutputHash===hash(normalized)
    &&(await readManagedLayoutBytes(rootDir,path)).toString('utf8')===normalized,'SIMPLE_BLOCKED_ORIGINAL_INVALID');
   blockedOutput={attemptId:attempt.id,contentHash:hash(normalized),content:output.content};
   if(applicable)reason='关键依据待补；保留已有结论，不是完成稿或可交接策略。';
  }
  const verification=p.verifications.filter(r=>r.artifactId===a?.id).at(-1)??null;if(verification)await verifyReviewOriginal(p,'verification',verification,{executionRoot:rootDir});
  need(read(id).revision===p.revision,'REVISION_CONFLICT');
  return {strategy:{protocolVersion:'simple-strategy-workspace-v1',taskCardId:p.activeTaskCardId,researchArtifactId:p.activeByStage.research??null,policyVersion:p.policies.at(-1).version,producerJobId:j?.id??null,producerStatus:j?.status??null,attemptCount:j?.attempts.length??0,artifactId:a?.id??null,contentHash:a?.contentHash??null,content,blockedOutput,failure,current:applicable,history:artifacts.filter(x=>x.id!==a?.id).map(x=>({artifactId:x.id,contentHash:x.contentHash})),verification,unknownJobs:p.jobs.filter(x=>x.status==='awaiting_reconciliation'&&(x.id===j?.id||x.purpose==='verification'&&x.targetArtifactId===a?.id)).map(x=>({jobId:x.id,purpose:x.purpose??'stage'})),reason},capability:capable(),revision:p.revision};
 }
 async function recoverVerification(id,jobId,request){let p=read(id),j=p.jobs.find(x=>x.id===jobId),t=j.attempts.at(-1);if(j.status==='succeeded')return;
  need(j.status==='awaiting_reconciliation'&&t?.httpAttemptLocator,'SIMPLE_ORIGINAL_UNAVAILABLE');
  if(!t.receipt){const raw=await reopenOrdinaryJob(p,j,t,{executionRoot:rootDir,attemptLocator:t.httpAttemptLocator}),receipt=ordinaryDomainReceipt(j,raw);store.command(id,{kind:'restore-ordinary-http-attempt',jobId,attemptId:t.id,receipt,commandId:`restore-${t.id}`,expectedRevision:p.revision},actor());p=read(id);j=p.jobs.find(x=>x.id===jobId);t=j.attempts.at(-1);}
  const original=await readStageInvocationOriginal(p,j,t,{executionRoot:rootDir}),raw=JSON.parse(original.outputText),validated=validateEvidenceReviewOutput(raw,j.task.verificationInput),text=JSON.stringify(validated,null,2),path=join(rootDir,t.id,'verification.json');await mkdir(join(rootDir,t.id),{recursive:true});try{await writeFile(path,text,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;need(await readFile(path,'utf8')===text,'SIMPLE_ORIGINAL_CHANGED');}
  const receipt={...t.receipt,validatedOutputPath:path,validatedOutputHash:hash(text)};await reopenOrdinaryCompletion(p,j,t,{executionRoot:rootDir,receipt,wrappers:[[path,text]]});
  store.command(id,{kind:'reconcile-simple-strategy-verification',jobId,attemptId:t.id,reportId:`simple-verification-${hash(request.commandId)}`,rawReport:raw,payloadRef:path,contentHash:hash(text),executionReceipt:receipt,commandId:`simple-recovery-${hash(request.commandId)}`,expectedRevision:p.revision},actor());
 }
 async function run(id,operation,request){let p=read(id);const extra={continue:['artifactId','policyVersion'],verify:['artifactId'],reconcile:['jobId']}[operation],keys=['commandId','expectedRevision',...extra];need(request&&typeof request==='object'&&Object.keys(request).length===keys.length&&keys.every(k=>Object.hasOwn(request,k))&&typeof request.commandId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(request.commandId)&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0&&extra.every(k=>k==='policyVersion'?Number.isSafeInteger(request[k])&&request[k]>0:typeof request[k]==='string'&&request[k].length>0&&request[k].length<=200),'INVALID_REQUEST');
  let row=(p.simpleStrategyHttpRequests??[]).find(r=>r.request.commandId===request.commandId),replayed=Boolean(row);if(row)need(row.operation===operation&&equal(row.request,request),'COMMAND_ID_REUSED');
  let jobId=row?.jobId;
  if(!row){
   if(operation!=='reconcile')need(capable().available,'SIMPLE_STRATEGY_UNAVAILABLE');
   if(operation==='continue')jobId=executor.continueOperatorResearch(id,request);
   else if(operation==='verify'){const prior=p.jobs.find(j=>j.purpose==='verification'&&j.task?.request?.commandId===request.commandId);if(!prior)need(!p.jobs.some(j=>j.purpose==='verification'&&j.targetArtifactId===request.artifactId&&['queued','running','awaiting_reconciliation'].includes(j.status)),'SIMPLE_VERIFICATION_UNKNOWN');const a=p.artifacts.find(x=>x.id===request.artifactId);current(p,producer(p,a));await original(p,a);jobId=await executor.enqueueVerification(id,request.artifactId,request);}
   else{need(p.revision===request.expectedRevision,'REVISION_CONFLICT');jobId=request.jobId;const j=p.jobs.find(x=>x.id===jobId),a=p.artifacts.find(x=>x.id===j?.targetArtifactId);current(p,j?.purpose==='verification'?producer(p,a):j);need(j.status==='awaiting_reconciliation','INVALID_JOB');}
   p=read(id);store.command(id,{kind:'simple-strategy-http-request',operation,request:structuredClone(request),jobId,commandId:`simple-http-${hash(JSON.stringify([id,request.commandId]))}`,expectedRevision:p.revision},actor());p=read(id);row=p.simpleStrategyHttpRequests.at(-1);
  }
  const job=p.jobs.find(j=>j.id===jobId);need(job,'INVALID_JOB');
  if(operation==='reconcile'&&job.status==='awaiting_reconciliation'){const a=p.artifacts.find(x=>x.id===job.targetArtifactId);current(p,job.purpose==='verification'?producer(p,a):job);if(job.purpose==='verification')await recoverVerification(id,jobId,request);else await reconcileStage({store,root:rootDir,projectId:id,jobId,commandId:`simple-recovery-${hash(request.commandId)}`,expectedRevision:p.revision,reason:'Read exact saved current simple strategy result without invocation'});}
  else if(operation!=='reconcile'&&job.status==='queued'&&!job.attempts.length){need(capable().available,'SIMPLE_STRATEGY_UNAVAILABLE');requireSimpleHttpJob(p,request.commandId,job);need(equal(job.binding,bindings[operation==='verify'?'verification':'strategy']),'SIMPLE_BINDING_CHANGED');const a=p.artifacts.find(x=>x.id===job.targetArtifactId);current(p,operation==='verify'?producer(p,a):job);const expectedRevision=p.revision;await verifyCurrentResearchReaders(p,{executionRoot:rootDir,artifactId:p.activeByStage.research});need(equal(job.binding,bindings[operation==='verify'?'verification':'strategy']),'SIMPLE_BINDING_CHANGED');await executor.execute(id,jobId,{simpleStrategyAdmission:{requestId:request.commandId,expectedRevision}});}
  return {...await status(id),receipt:{commandId:request.commandId,replayed,operation,jobId}};
 }
 return {capability:capable,status,continue:(id,r)=>run(id,'continue',r),verify:(id,r)=>run(id,'verify',r),reconcile:(id,r)=>run(id,'reconcile',r)};
}
