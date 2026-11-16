import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {serialize,deserialize} from 'node:v8';

const branch=new AsyncLocalStorage();

// Keep the role and its validator together when teammates run in parallel. Drain
// every branch before replay, so a sibling never races its own persisted receipt.
export async function independentCalls(items, work) {
  const results=await Promise.allSettled(items.map((item,i)=>branch.run({},()=>work(item,i))));
  const failed=results.find(result=>result.status==='rejected');
  if(failed) throw failed.reason;
  return results.map(result=>result.value);
}

export function invalidOutput(message) {
  return Object.assign(Error(message),{code:'INVALID_STAGE_OUTPUT',checkpoint:branch.getStore()?.file});
}

function invalidReason(error) {
  for(let current=error;current;current=current.cause) {
    if (['INVALID_STAGE_OUTPUT','INVALID_OUTPUT'].includes(current.code)) return current;
  }
}

// Rebuild local orchestration from immutable model receipts. A business rejection,
// network error or cancellation keeps every completed call and does not spend a retry.
export async function runCheckpointed(dir, operation, onEvent) {
  await mkdir(dir,{recursive:true,mode:0o700});
  const corrections=new Map();
  for (;;) {
    let currentFile;
    const counts=new Map();
    async function cached(identity,execute) {
      const hash=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
      const ordinal=counts.get(hash) || 0;
      counts.set(hash,ordinal+1);
      const file=join(dir,hash+'-'+ordinal+'.v8');
      currentFile=file;
      if(branch.getStore()) branch.getStore().file=file;
      try {return deserialize(await readFile(file));}
      catch(error){if(error.code!=='ENOENT') throw error;}
      let result;
      try {result=await execute(corrections.get(file) ?? '');}
      catch(error) {
        const invalid=invalidReason(error);
        if(invalid) invalid.checkpoint=file;
        throw error;
      }
      const temp=file+'.'+randomUUID();
      await writeFile(temp,serialize(result),{mode:0o600,flag:'wx'});
      await rename(temp,file);
      return result;
    }
    try {return await operation(cached);}
    catch(error) {
      const invalid=invalidReason(error);
      const file=invalid?.checkpoint ?? currentFile;
      if (!invalid || !file) throw error;
      await rm(file,{force:true});
      if (corrections.has(file)) throw error;
      const reason=invalid.message;
      corrections.set(file,reason);
      await onEvent?.('单次输出未通过校验，沿用已完成回执，只重问该项：'+reason.slice(0,160));
    }
  }
}
