import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {realpath,open,lstat} from 'node:fs/promises';
import {constants,openSync,closeSync,fstatSync,readFileSync,realpathSync,lstatSync} from 'node:fs';
import {join,sep,dirname} from 'node:path';
import {buildResearchReadinessRequest} from './research-readiness.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const observed=new WeakMap();
const message='Incomplete response returned, reason: max_output_tokens';
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_READINESS_TERMINAL_FAILURE'});};
const same=(a,b)=>isDeepStrictEqual(a,b);
export function trustedTerminalFailureWitness(value){
 const originals=observed.get(value);if(!originals)return false;
 try{
  try{lstatSync(originals.output);return false;}catch(e){if(e.code!=='ENOENT')return false;}
  const base=realpathSync(originals.root);
  for(const [path,digest] of originals.files){
   if(lstatSync(path).isSymbolicLink()||!realpathSync(path).startsWith(base+sep))return false;
   const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>8*1024*1024||hash(readFileSync(fd))!==digest)return false;}finally{closeSync(fd);}
  }
  return true;
 }catch{return false;}
}
function original(job,attempt){
 const r=attempt?.receipt;
 if(job?.purpose!=='readiness'||job.task?.readinessInput?.reviewProtocolVersion!=='research-readiness-v2'||job.status!=='awaiting_reconciliation'||attempt?.status!=='awaiting_reconciliation'||job.attempts.at(-1).id!==attempt.id||job.readinessFailureResolutionId||job.readinessResolutionId||job.outputVersionIds?.length)fail('Original uncertain non-continuation readiness required');
 if(r?.provider!=='codex-cli'||r.runId!==attempt.id||r.attemptId!==attempt.id||r.model!==job.binding.model||r.requestedModel!==job.binding.model||r.exitCode!==1||r.signal!=null||r.reason!=null||r.error!=null||!r.threadId||r.threadId!==r.providerRequestId||!r.paths||!r.providerExecution||!Object.entries(r.providerExecution).every(([k,v])=>same(v,r[k])))fail('Exact recorded terminal CLI receipt required');
 return r;
}
export function validateTerminalFailureWitness(projectId,job,attempt,w){
 const r=original(job,attempt),request=buildResearchReadinessRequest(job.task.readinessInput);
 const input=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema});
 const packet=JSON.stringify({projectId,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...request},null,2);
 if(!w||Object.keys(w).sort().join('|')!==['version','jobId','attemptId','artifactId','contentHash','binding','inputHash','schemaHash','packetHash','receiptHash','diskReceiptHash','stdoutText','stdoutHash','witnessHash'].sort().join('|')||w.version!=='local-codex-terminal-failure-v1'||w.jobId!==job.id||w.attemptId!==attempt.id||w.artifactId!==job.targetArtifactId||w.contentHash!==job.task.readinessInput.contentHash||!same(w.binding,job.binding)||w.inputHash!==hash(input)||r.inputPacketHash!==hash(input)||r.contextHash!==hash(input)||w.schemaHash!==hash(JSON.stringify(request.outputSchema))||w.packetHash!==hash(packet)||w.receiptHash!==hash(JSON.stringify(r))||w.diskReceiptHash!==hash(JSON.stringify(r.providerExecution,null,2))||w.stdoutHash!==hash(w.stdoutText))fail('Failure witness does not bind original task and receipt');
 let events;try{events=w.stdoutText.split('\n').filter(s=>s.trim()).map(s=>JSON.parse(s));}catch{fail('Invalid failure event stream');}
 if(!same(events,[{type:'thread.started',thread_id:r.threadId},{type:'turn.started'},{type:'error',message},{type:'turn.failed',error:{message}}]))fail('Only the complete specific terminal failure stream is accepted');
 const {witnessHash,...body}=w;if(witnessHash!==hash(JSON.stringify(body)))fail('Failure witness changed');
 return w;
}
async function bytes(root,path){
 const stat=await lstat(path);if(stat.isSymbolicLink())fail('Symlink failure original is not accepted');
 const base=await realpath(root),file=await realpath(path);if(!file.startsWith(base+sep))fail('Failure original outside managed execution storage');
 const f=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=await f.stat();if(!stat.isFile()||stat.size>8*1024*1024)fail('Invalid failure original size');return new TextDecoder('utf-8',{fatal:true}).decode(await f.readFile());}finally{await f.close();}
}
export async function loadTerminalFailureWitness(root,projectId,job,attempt){
 const r=original(job,attempt);
 const base=await realpath(root),outputParent=await realpath(dirname(r.paths.output));if(!outputParent.startsWith(base+sep))fail('Output path outside managed execution storage');
 try{await lstat(r.paths.output);fail('An output exists; terminal no-output failure is not established');}catch(e){if(e.code!=='ENOENT')throw e;}
 const [input,schema,packet,receipt,stdout]=await Promise.all([bytes(root,r.paths.input),bytes(root,r.paths.schema),bytes(root,join(root,attempt.id,'packet.json')),bytes(root,r.paths.receipt),bytes(root,r.paths.stdout)]);
 if(!same(JSON.parse(receipt),r.providerExecution))fail('Disk receipt and retained invocation differ');
 const body={version:'local-codex-terminal-failure-v1',jobId:job.id,attemptId:attempt.id,artifactId:job.targetArtifactId,contentHash:job.task.readinessInput.contentHash,binding:structuredClone(job.binding),inputHash:hash(input),schemaHash:hash(schema),packetHash:hash(packet),receiptHash:hash(JSON.stringify(r)),diskReceiptHash:hash(receipt),stdoutText:stdout,stdoutHash:hash(stdout)};
 const w={...body,witnessHash:hash(JSON.stringify(body))};validateTerminalFailureWitness(projectId,job,attempt,w);Object.freeze(w.binding);Object.freeze(w);observed.set(w,{root,output:r.paths.output,files:[[r.paths.input,w.inputHash],[r.paths.schema,w.schemaHash],[join(root,attempt.id,'packet.json'),w.packetHash],[r.paths.receipt,w.diskReceiptHash],[r.paths.stdout,w.stdoutHash]]});return w;
}

export function terminalFailureResolution(p,id){
 const resolution=(p.readinessResolutions??[]).find(r=>r.id===id&&r.kind==='local-terminal-failure-observed');
 if(!resolution)fail('Recorded local terminal failure required');
 const job=p.jobs.find(j=>j.id===resolution.jobId),attempt=job?.attempts.find(a=>a.id===resolution.attemptId);
 validateTerminalFailureWitness(p.id,job,attempt,resolution.witness);
 if(resolution.id!==`terminal-failure-${hash(JSON.stringify([p.id,job.id,attempt.id]))}`||resolution.originalOutcome!=='locally_observed_terminal_failure'||resolution.originalCost!==null||resolution.additionalCalls!==0)fail('Failure resolution changed');
 return {resolution,job,attempt};
}
export function terminalDiagnosticPlan(p,resolutionId){
 const {resolution,job,attempt}=terminalFailureResolution(p,resolutionId);
 if((p.readinessResolutions??[]).some(r=>r.jobId===job.id&&r.id!==resolution.id))fail('Another resolution exists for the original call');
 return {resolutionId,jobId:`diagnostic-${resolutionId}`,originalJobId:job.id,originalAttemptId:attempt.id,artifactId:job.targetArtifactId,binding:structuredClone(job.binding),readinessInput:structuredClone(job.task.readinessInput),mitigation:{reasoningEffort:'low',singleDiagnosticAttempt:true}};
}
export function validateTerminalDiagnostic(p,job,witness){
 const plan=terminalDiagnosticPlan(p,job.readinessFailureResolutionId),{resolution}=terminalFailureResolution(p,plan.resolutionId);
 if(job.id!==plan.jobId||job.targetArtifactId!==plan.artifactId||!same(job.binding,plan.binding)||!same(job.task.readinessInput,plan.readinessInput)||!same(job.task.terminalFailureDiagnostic,plan)||!same(witness,resolution.witness))fail('Diagnostic continuation changed');
 return plan;
}
