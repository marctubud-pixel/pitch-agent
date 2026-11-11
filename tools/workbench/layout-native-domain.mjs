import {isDeepStrictEqual as equal} from 'node:util';
import {LAYOUT_PURPOSE,LAYOUT_STYLES,layoutHash,unresolvedLayoutJobs} from './layout-boundary.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
export const NATIVE_COMMANDS=Object.freeze(['queue-layout-export','claim-layout-export','record-layout-worker','anchor-layout-export','interrupt-layout-export','register-layout-technical']);
export function layoutRoot(p,job){return p.jobs.find(j=>j.id===(job?.task?.rootJobId??job?.id)&&j.purpose===LAYOUT_PURPOSE);}
export function layoutTuple(p,root){return LAYOUT_STYLES.map(style=>p.jobs.find(j=>j.purpose===LAYOUT_PURPOSE&&j.task.bindingHash===root.task.bindingHash&&j.task.style===style));}
export function reduceNativeLayout(p,c,context){
 need(context.actorType==='agent','LAYOUT_TRUSTED_RUNTIME_REQUIRED','Trusted native runtime required');
 const job=p.jobs.find(j=>j.id===c.jobId),root=layoutRoot(p,job);
 need(root&&layoutHash(root.task.binding)===root.task.bindingHash,'LAYOUT_JOB_REQUIRED','Exact original native job required');
 const tuple=layoutTuple(p,root),index=LAYOUT_STYLES.indexOf(job.task.style);
 need(index>=0&&tuple[index]===job,'LAYOUT_STYLE_CONFLICT','Only the original exact style tuple may execute');
 if(c.kind==='queue-layout-export'){
  need(job===root&&root.status==='blocked'&&root.error?.code==='LAYOUT_EXPORT_UNAVAILABLE'&&root.attempts.length===0&&root.task.binding.execution,'LAYOUT_QUEUE_REFUSED','Only explicitly prepared unstarted native input can queue');
  need(!unresolvedLayoutJobs(p).length,'LAYOUT_UNKNOWN_BLOCKS','Unresolved original layout attempts must be reconciled before queueing');
  root.status='queued';delete root.error;return;
 }
 if(c.kind==='register-layout-technical'){
  need(job===root&&tuple.every(j=>j?.status==='succeeded'&&j.attempts.length===1&&j.receipt?.bindingHash===root.task.bindingHash&&j.receipt.style===j.task.style),'LAYOUT_TUPLE_INCOMPLETE','Exact three completed native editions required');
  need(!unresolvedLayoutJobs(p).length,'LAYOUT_UNKNOWN_BLOCKS','Unresolved original layout attempts cannot grant technical completion');
  const id=`layout-technical-${root.task.bindingHash}`;
  if(p.artifacts.some(a=>a.id===id))return;
  p.artifacts.push({id,stage:'layout',provenance:'native-layout-technical-only',inputVersionIds:[root.task.binding.contentArtifactId],author:structuredClone(context),layoutTechnical:{protocol:'project-native-layout-v1',rootJobId:root.id,bindingHash:root.task.bindingHash,editions:tuple.map(j=>({jobId:j.id,style:j.task.style,receipt:structuredClone(j.receipt)})),finalAuthorityAvailable:false},contentHash:layoutHash(tuple.map(j=>j.receipt)),payloadRef:tuple[0].receipt.anchorPath});for(const edition of tuple)edition.outputVersionIds=[id];return;
 }
 if(c.kind==='claim-layout-export'){
  need(job.status==='queued'&&job.attempts.length===0&&tuple.slice(0,index).every(j=>j?.status==='succeeded')&&!unresolvedLayoutJobs(p).length,'LAYOUT_CLAIM_REFUSED','One serial original native attempt required');
  need(c.attemptId&&c.directory&&context.executorPid>0&&context.executorHost,'LAYOUT_ATTEMPT_REQUIRED','Durable native attempt identity required');
  job.status='running';job.attempts.push({id:c.attemptId,status:'running',directory:c.directory,executor:structuredClone(context),worker:null});return;
 }
 const attempt=job.attempts.at(-1);
 need(attempt?.id===c.attemptId&&['running','awaiting_reconciliation'].includes(job.status),'LAYOUT_ATTEMPT_REQUIRED','Original unresolved attempt required');
 if(c.kind==='record-layout-worker'){
  need(job.status==='running'&&!attempt.worker&&Number.isSafeInteger(c.worker?.pid)&&c.worker.pid>0&&c.worker.host===context.executorHost&&c.worker.token===attempt.id,'LAYOUT_WORKER_IDENTITY_REQUIRED','Worker must be durably identified before effects');
  attempt.worker=structuredClone(c.worker);return;
 }
 if(c.kind==='interrupt-layout-export'){job.status=attempt.status='awaiting_reconciliation';job.error=structuredClone(c.error);return;}
 need(c.kind==='anchor-layout-export'&&attempt.worker&&c.receipt?.attemptId===attempt.id&&c.receipt.bindingHash===root.task.bindingHash&&c.receipt.style===job.task.style&&c.receipt.operation==='local-native-export'&&c.receipt.model===null&&c.receipt.cost===null&&c.receipt.costStatus==='unknown'&&/^[a-f0-9]{64}$/.test(c.receipt.anchorHash),'LAYOUT_RECEIPT_REQUIRED','Exact verified local native receipt required');
 job.status=attempt.status='succeeded';job.receipt=structuredClone(c.receipt);attempt.receipt=structuredClone(c.receipt);delete job.error;
 if(index<LAYOUT_STYLES.length-1){
  const style=LAYOUT_STYLES[index+1];need(!tuple[index+1],'LAYOUT_STYLE_CONFLICT','No duplicate edition may be appended');
  p.jobs.push({id:`${root.id}-${style}`,stage:'layout',purpose:LAYOUT_PURPOSE,status:'queued',attempts:[],inputVersionIds:[root.task.binding.contentArtifactId],outputVersionIds:[],task:{rootJobId:root.id,bindingHash:root.task.bindingHash,style}});
 }
}
