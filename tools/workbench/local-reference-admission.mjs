import {createHash,randomUUID} from 'node:crypto';
import {requestIdentityWire} from '../local-acceptance/request-identity.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code,status:409});};
const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const operations=['reference_upload','reference_material','reference_withdrawal'];
export function openReferenceAdmission(db,{nativeCommandExists}){
 need(typeof nativeCommandExists==='function','REFERENCE_NATIVE_PROOF_REQUIRED');
 const exists=(projectId,commandId)=>{const value=nativeCommandExists(projectId,commandId);need(typeof value==='boolean','REFERENCE_NATIVE_PROOF_NOT_BOOLEAN');return value;};
 db.exec('CREATE TABLE IF NOT EXISTS reference_admissions(case_id TEXT NOT NULL, command_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(case_id,command_id));');
 const get=(caseId,commandId)=>{const row=db.prepare('SELECT body FROM reference_admissions WHERE case_id=? AND command_id=?').get(caseId,commandId);return row?JSON.parse(row.body):null;};
 const save=r=>db.prepare('INSERT INTO reference_admissions VALUES(?,?,?) ON CONFLICT(case_id,command_id) DO UPDATE SET body=excluded.body').run(r.caseId,r.commandId,JSON.stringify(r));
 function transaction(work){need(!db.isTransaction,'REFERENCE_ADMISSION_TRANSACTION_ACTIVE');db.exec('BEGIN IMMEDIATE');try{const r=work();db.exec('COMMIT');return r;}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}}
 function checked(lease){const r=get(lease.caseId,lease.commandId);need(r&&r.owner===lease.owner&&r.projectId===lease.projectId&&r.operation===lease.operation&&r.requestDigest===lease.requestDigest,'REFERENCE_ADMISSION_LEASE_CHANGED');return r;}
 function reserve({caseId,projectId,operation,request}){
  need(valid(caseId)&&valid(projectId)&&valid(request?.commandId)&&operations.includes(operation),'REFERENCE_ADMISSION_IDENTITY_INVALID');
  const requestDigest=createHash('sha256').update(requestIdentityWire(request)).digest('hex');
  return transaction(()=>{
   const old=get(caseId,request.commandId);
   if(old){need(old.projectId===projectId&&old.operation===operation&&old.requestDigest===requestDigest,'REFERENCE_ADMISSION_COMMAND_REUSED');return {kind:old.state==='rejected'?'rejected':'reconcile_only'};}
   need(!exists(projectId,request.commandId),'REFERENCE_ADMISSION_EXISTING_NATIVE_COMMAND');
   const r={caseId,projectId,operation,commandId:request.commandId,requestDigest,owner:randomUUID(),state:'reserved'};save(r);return {kind:'reserved',lease:r};
  });
 }
 function dispatch(lease){return transaction(()=>{const r=checked(lease);need(r.state==='reserved','REFERENCE_ADMISSION_NOT_RESERVED');need(!exists(r.projectId,r.commandId),'REFERENCE_ADMISSION_NATIVE_CONFLICT');save({...r,state:'dispatch_started'});});}
 function assertDispatch(lease){const r=checked(lease);need(r.state==='dispatch_started','REFERENCE_ADMISSION_NOT_DISPATCHED');}
 function reject(lease,reason){
  need(typeof reason==='string'&&/^[A-Z0-9_]{1,160}$/.test(reason),'REFERENCE_ADMISSION_REASON_INVALID');
  return transaction(()=>{const r=checked(lease);if(r.state!=='reserved'||exists(r.projectId,r.commandId))return false;save({...r,state:'rejected',reason});return true;});
 }
 function receipt(caseId,commandId){
  const r=get(caseId,commandId);if(!r||r.state!=='rejected')return null;
  need(!exists(r.projectId,r.commandId),'REFERENCE_ADMISSION_REJECTION_CONFLICT');
  return {protocol:'local-reference-rejection-v1',caseId:r.caseId,projectId:r.projectId,commandId:r.commandId,operation:r.operation,requestDigest:r.requestDigest,state:'rejected_before_native_dispatch',reason:r.reason,nativeRegistration:'not_dispatched',managedFiles:r.operation==='reference_upload'?'may_exist':'not_written_by_operation',factualAuthority:false};
 }
 function execute(lease,work){
  dispatch(lease);let attempted=false,active=true;
  const invoke=fn=>{need(active&&!attempted,'REFERENCE_NATIVE_INVOCATION_INVALID');assertDispatch(lease);attempted=true;return fn();};
  try{const result=work(invoke);need(!result||typeof result.then!=='function','REFERENCE_NATIVE_FRAME_MUST_BE_SYNCHRONOUS');return result;}
  catch(error){
   if(!attempted&&Number.isInteger(error.status)&&error.status>=400&&error.status<500&&/^[A-Z0-9_]{1,160}$/.test(error.code??'')){
    transaction(()=>{const r=checked(lease);need(r.state==='dispatch_started','REFERENCE_ADMISSION_FRAME_CHANGED');if(!exists(r.projectId,r.commandId))save({...r,state:'rejected',reason:error.code});});
   }
   throw error;
  }finally{active=false;}
 }
 return {reserve,dispatch,assertDispatch,reject,receipt,execute};
}
