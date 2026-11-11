import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';

function processState(pid) {
  try { process.kill(pid,0); return 'alive'; }
  catch(error) { return error.code==='ESRCH'?'dead':'unknown'; }
}

export function recoverInterruptedJobs(store,{host=hostname(),inspectProcess=processState}={}) {
  const results=[];
  for(const {id} of store.list()) {
    for(const job of store.read(id).jobs.filter(item=>item.status==='running')) {
      const attempt=job.attempts.at(-1),owner=attempt?.executor;
      if(job.purpose==='layout_export'){results.push({projectId:id,jobId:job.id,action:'unchanged',ownerState:'unknown',reason:'LAYOUT_NATIVE_OWNERSHIP_UNIMPLEMENTED'});continue;}
      const local=owner?.executorHost===host&&Number.isSafeInteger(owner.executorPid)&&owner.executorPid>0;
      const state=local?inspectProcess(owner.executorPid):'unknown';
      if(state!=='dead') {
        results.push({projectId:id,jobId:job.id,action:'unchanged',ownerState:state});
        continue;
      }
      store.command(id,{kind:'mark-interrupted',jobId:job.id,attemptId:attempt.id,
        commandId:randomUUID(),expectedRevision:store.read(id).revision},
      {...owner,now:new Date().toISOString(),recoveredBy:{host,pid:process.pid,ownerState:'dead',ownerHost:owner.executorHost,ownerPid:owner.executorPid,attemptId:attempt.id}});
      const recovered=store.read(id).jobs.find(item=>item.id===job.id);
      results.push({projectId:id,jobId:job.id,action:recovered.status==='blocked'?'blocked_predispatch':'awaiting_reconciliation',ownerState:'dead'});
    }
  }
  return results;
}
