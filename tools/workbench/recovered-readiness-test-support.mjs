import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function recoverReadinessTerminal(f,id){
 const job=f.store.read('p').jobs.find(j=>j.id===id),provider=f.providers[job.binding.providerId],execute=provider.execute;
 let calls=0;
 provider.execute=async request=>{
  calls++;const original=await execute(request),paths={...original.paths,schema:join(f.root,`schema-${request.runId}.json`)};
  const disk={provider:'codex-cli',runId:request.runId,requestedModel:job.binding.model,model:job.binding.model,providerRequestId:original.threadId,threadId:original.threadId,inputPacketHash:original.inputPacketHash,exitCode:0,signal:null,reason:null,usage:null,cost:null,paths};
  await writeFile(paths.schema,JSON.stringify(request.outputSchema));await writeFile(paths.receipt,JSON.stringify(disk,null,2));
  await writeFile(paths.stdout,[{type:'thread.started',thread_id:disk.threadId},{type:'turn.started'},{type:'item.completed',item:{id:'result',type:'agent_message',text:original.responseText}},{type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
  throw Object.assign(new Error('Owned saved terminal return loss'),{code:'SYNTHETIC_RETURN_LOSS',status:'awaiting_reconciliation',receipt:{...disk,responseText:original.responseText,parsedOutput:original.parsedOutput}});
 };
 try{
  const unknown=await f.executor.execute('p',id);assert.equal(unknown.status,'awaiting_reconciliation');assert.equal(calls,1);
  const result=await f.executor.resolveReadiness('p',{action:'recover-saved',jobId:id,attemptId:unknown.attemptId,commandId:'recover-material-assessment',expectedRevision:f.store.read('p').revision});
  assert.equal(result.kind,'recovered');assert.equal(calls,1);assert.deepEqual(f.store.read('p').jobs.find(j=>j.id===id),unknown);
  console.log(JSON.stringify({recoveredMaterialAssessment:result.reportId,originalUnknownPreserved:true,additionalCalls:0}));
 }finally{provider.execute=execute;}
}
