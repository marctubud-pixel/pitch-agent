import {canonicalWireJson as wire,requestIdentityWire} from './request-identity.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
export const REFERENCE_UPLOAD_REQUEST_MAX_BYTES=4*Math.ceil(8*1024*1024/3)+65536;
const requestKeys=['module','decision','expectedBasisHash','comment','contribution'];
export function pendingPath(path){need(typeof path==='string'&&/^\/api\/(cases(?:\/[A-Za-z0-9_-]{1,100}\/(?:continue|advance|reference-uploads|reference-materials|reference-withdrawals))?|documents\/[A-Za-z0-9_-]{1,100}\/(?:save|restore|export))$/.test(path),'LOCAL_PENDING_PATH_INVALID');return path;}
const resource=path=>path==='/api/cases'?'create-case':path.split('/').slice(0,4).join('/');
export function createBrowserPending({origin,storage,crypto,withLock}={}){
 need(typeof origin==='string'&&new URL(origin).origin===origin&&['http:','https:'].includes(new URL(origin).protocol),'LOCAL_PENDING_ORIGIN_INVALID');
 need(storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function'&&crypto?.subtle,'LOCAL_PENDING_STORAGE_REQUIRED');
 const key='proposal-local-pending-v1:'+origin,lockName=key;
 const digest=async body=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(requestIdentityWire(body))))].map(b=>b.toString(16).padStart(2,'0')).join('');
 function read(){const raw=storage.getItem(key);if(raw===null)return [];let rows;try{rows=JSON.parse(raw);}catch{throw Object.assign(Error('LOCAL_PENDING_STORAGE_CORRUPT'),{code:'LOCAL_PENDING_STORAGE_CORRUPT'});}need(Array.isArray(rows)&&rows.length<=32,'LOCAL_PENDING_STORAGE_CORRUPT');for(const r of rows)need(r&&Object.keys(r).sort().join(',')==='commandId,origin,path,requestDigest,state'&&r.origin===origin&&pendingPath(r.path)&&id(r.commandId)&&/^[a-f0-9]{64}$/.test(r.requestDigest)&&['prepared','unknown'].includes(r.state),'LOCAL_PENDING_STORAGE_CORRUPT');need(new Set(rows.map(r=>r.path+'\0'+r.requestDigest)).size===rows.length,'LOCAL_PENDING_STORAGE_CORRUPT');return rows;}
 function write(rows){const raw=JSON.stringify(rows);storage.setItem(key,raw);need(storage.getItem(key)===raw,'LOCAL_PENDING_STORAGE_WRITE_FAILED');}
 async function locked(work){need(typeof withLock==='function','LOCAL_PENDING_LOCK_UNAVAILABLE');return withLock(lockName,work);}
 async function prepare(path,body){pendingPath(path);need(body&&id(body.commandId),'LOCAL_PENDING_COMMAND_REQUIRED');need(new TextEncoder().encode(wire(body)).byteLength<=(path.endsWith('/reference-uploads')?REFERENCE_UPLOAD_REQUEST_MAX_BYTES:2*1024*1024),'LOCAL_PENDING_REQUEST_TOO_LARGE');const requestDigest=await digest(body);return locked(()=>{const rows=read(),old=rows.find(r=>r.path===path&&r.requestDigest===requestDigest);if(old)return structuredClone(old);need(!rows.some(r=>resource(r.path)===resource(path)),'LOCAL_PENDING_DIFFERENT_REQUEST');need(rows.length<32,'LOCAL_PENDING_LIMIT');const record={origin,path,requestDigest,commandId:body.commandId,state:'prepared'};write([...rows,record]);return structuredClone(record);});}
 async function unknown(record){return locked(()=>{const rows=read(),r=rows.find(r=>r.path===record.path&&r.requestDigest===record.requestDigest&&r.commandId===record.commandId);need(r,'LOCAL_PENDING_RECORD_CHANGED');r.state='unknown';write(rows);});}
 async function clear(record){return locked(()=>{const rows=read(),index=rows.findIndex(r=>r.path===record.path&&r.requestDigest===record.requestDigest&&r.commandId===record.commandId);if(index<0)return;rows.splice(index,1);write(rows);});}
 async function acknowledged(record,value){
  if(record.path==='/api/cases')return typeof value?.id==='string'&&id(value.id);
  if(record.path.startsWith('/api/documents/'))return value?.id===record.path.split('/')[3]&&Number.isSafeInteger(value.revision)&&value.revision>=1||record.path.endsWith('/export')&&typeof value?.downloadUrl==='string'&&value?.receipt?.id===record.path.split('/')[3];
  const reference=/^\/api\/cases\/([A-Za-z0-9_-]+)\/(reference-uploads|reference-materials|reference-withdrawals)$/.exec(record.path);
  if(reference){const receipt=value?.commandReceipt,identity=receipt?.identity,operation=reference[2]==='reference-uploads'?'reference_upload':reference[2]==='reference-materials'?'reference_material':'reference_withdrawal';return receipt?.protocol==='local-reference-command-receipt-v1'&&receipt.caseId===reference[1]&&id(receipt.projectId)&&receipt.commandId===record.commandId&&receipt.operation===operation&&receipt.state==='committed'&&receipt.requestDigest===record.requestDigest&&Number.isSafeInteger(receipt.committedRevision)&&receipt.committedRevision>=1&&Number.isSafeInteger(receipt.observedRevision)&&receipt.observedRevision>=receipt.committedRevision&&/^[a-f0-9]{64}$/.test(receipt.nativeCommandHash??'')&&/^[a-f0-9]{64}$/.test(receipt.auditHash??'')&&receipt.factualAuthority===false&&receipt.referenceAdoptionVerified===false&&id(identity?.imageId)&&/^[a-f0-9]{64}$/.test(identity?.imageSha256??'')&&(operation==='reference_upload'||(operation==='reference_material'?identity?.materialId===record.commandId:id(identity?.materialId)&&identity?.removed===true&&receipt.pixelsVerified===false&&receipt.proofScope==='native_material_withdrawal_history_only')&&typeof identity?.artifactId==='string'&&identity?.artifactId.length>0&&identity?.artifactId.length<=1000&&/^[a-f0-9]{64}$/.test(identity?.copyContentHash??''));}
  if(value?.advanceCommand?.commandId===record.commandId)return value.advanceCommand.state==='completed';
  const decision=value?.decisions?.find(d=>d.commandId===record.commandId);if(!decision)return false;
  if(Object.hasOwn(decision,'commandReceipt')){const receipt=decision.commandReceipt;return receipt?.protocol==='local-decision-commit-v1'&&receipt.caseId===record.path.split('/')[3]&&receipt.commandId===record.commandId&&receipt.requestDigest===record.requestDigest&&receipt.operation==='decision'&&receipt.state==='committed'&&receipt.factualAuthority===false;}
  const body={};for(const k of requestKeys)if(Object.hasOwn(decision,k))body[k]=decision[k];return await digest(body)===record.requestDigest;
 }
 async function acknowledge(record,value){if(await acknowledged(record,value)){await clear(record);return true;}await unknown(record);return false;}
 async function reconcile({readCase,replayAdvance,readDocumentCommand,readDecisionCommand,readReferenceCommand}={}){
  for(const record of read()){
   const reference=/^\/api\/cases\/([A-Za-z0-9_-]+)\/(reference-uploads|reference-materials|reference-withdrawals)$/.exec(record.path);
   if(reference){try{if(typeof readReferenceCommand!=='function')throw Error('LOCAL_REFERENCE_RECEIPT_UNAVAILABLE');const receipt=await readReferenceCommand(reference[1],record.commandId);
    const operation=reference[2]==='reference-uploads'?'reference_upload':reference[2]==='reference-materials'?'reference_material':'reference_withdrawal';
    if(receipt?.protocol==='local-reference-rejection-v1'&&receipt.caseId===reference[1]&&id(receipt.projectId)&&receipt.commandId===record.commandId&&receipt.operation===operation&&receipt.requestDigest===record.requestDigest&&receipt.state==='rejected_before_native_dispatch'&&receipt.nativeRegistration==='not_dispatched'&&receipt.managedFiles===(operation==='reference_upload'?'may_exist':'not_written_by_operation')&&receipt.factualAuthority===false&&/^[A-Z0-9_]{1,160}$/.test(receipt.reason??'')){await clear(record);continue;}
    await acknowledge(record,{commandReceipt:receipt});}catch{await unknown(record);}continue;}
   const document=/^\/api\/documents\/([A-Za-z0-9_-]+)\/(save|restore)$/.exec(record.path);
   if(document){try{const receipt=await readDocumentCommand(document[1],record.commandId);if(receipt?.protocol==='editable-command-receipt-v1'&&receipt.status==='committed'&&receipt.id===document[1]&&receipt.commandId===record.commandId&&receipt.operation===document[2]&&receipt.requestDigest===record.requestDigest&&/^[a-f0-9]{64}$/.test(receipt.documentHash)&&Number.isSafeInteger(receipt.revision)&&receipt.revision>=2)await clear(record);else await unknown(record);}catch{await unknown(record);}continue;}
   const match=/^\/api\/cases\/([A-Za-z0-9_-]+)\/(continue|advance)$/.exec(record.path);if(!match)continue;
   if(record.requestDigest!==await digest({})&&typeof readDecisionCommand==='function'){
    let receipt;try{receipt=await readDecisionCommand(match[1],record.commandId);}catch{}
    if(receipt?.protocol==='local-decision-rejection-v1'&&receipt.caseId===match[1]&&receipt.commandId===record.commandId&&receipt.requestDigest===record.requestDigest&&receipt.operation==='decision'&&receipt.state==='rejected_before_admission'&&receipt.reason==='ACCEPTANCE_DECISION_STALE'&&receipt.admitted===false&&receipt.effects==='not_dispatched'){await clear(record);continue;}
   }
   try{const current=await readCase(match[1]);if(await acknowledged(record,current)){await clear(record);continue;}
    if(record.requestDigest===await digest({})){const result=await replayAdvance(record.path,{commandId:record.commandId});await acknowledge(record,result);}else await unknown(record);
   }catch{await unknown(record);}
  }
  return read();
 }
 return {prepare,unknown,acknowledge,reconcile,list:()=>structuredClone(read()),digest};
}
export function createPendingApi({journal,request,onPending=()=>{}}){
 const publish=()=>onPending(journal.list()),flights=new Map();let recovery=null;
 async function api(path,body){
  if(!body?.commandId)return request(path,body);need(!recovery,'LOCAL_PENDING_RECONCILIATION_ACTIVE');
  // This comparison lives only while the original request body is in memory; it is never persisted.
  const {commandId,...data}=body,key=path+'\0'+wire(data);if(flights.has(key))return flights.get(key);need(!flights.size,'LOCAL_PENDING_REQUEST_ACTIVE');
  const promise=(async()=>{const record=await journal.prepare(path,body);publish();try{const value=await request(path,{...body,commandId:record.commandId});await journal.acknowledge(record,value);publish();return value;}catch(e){await journal.unknown(record);publish();throw e;}})();
  flights.set(key,promise);try{return await promise;}finally{flights.delete(key);}
 }

 function reconcile(){if(recovery)return recovery;need(!flights.size,'LOCAL_PENDING_REQUEST_ACTIVE');recovery=(async()=>{const rows=await journal.reconcile({readCase:id=>request('/api/cases/'+encodeURIComponent(id)),replayAdvance:(path,body)=>request(path,body),readDocumentCommand:(id,commandId)=>request('/api/documents/'+encodeURIComponent(id)+'/commands/'+encodeURIComponent(commandId)),readDecisionCommand:(id,commandId)=>request('/api/cases/'+encodeURIComponent(id)+'/decisions/'+encodeURIComponent(commandId)),readReferenceCommand:(id,commandId)=>request('/api/cases/'+encodeURIComponent(id)+'/reference-commands/'+encodeURIComponent(commandId))});publish();return rows;})();return recovery.finally(()=>{recovery=null;});}
 return {api,reconcile,pending:()=>journal.list()};
}
