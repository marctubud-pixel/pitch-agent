import {createHash} from 'node:crypto';
import {requestIdentityWire,normalizeDecisionWire,canonicalWireJson} from '../local-acceptance/request-identity.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code,status:409});};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
export const decisionRequestDigest=request=>createHash('sha256').update(requestIdentityWire(request)).digest('hex');
export const DECISION_ADMISSION_PROTOCOL='durable-intent-rejection-v1';
export function decisionWireIdentity(request,wireRequest){
 const wire=JSON.parse(JSON.stringify(wireRequest));
 need(canonicalWireJson(normalizeDecisionWire(wire))===canonicalWireJson(request),'ACCEPTANCE_DECISION_TRANSPORT_CHANGED');
 const hasStage=Object.hasOwn(wire,'stage'),hasModule=Object.hasOwn(wire,'module');need(hasStage||hasModule,'ACCEPTANCE_DECISION_TRANSPORT_CHANGED');
 return {protocol:'local-decision-wire-v1',form:hasStage?(hasModule?'both':'stage'):'module',digest:decisionRequestDigest(wire)};
}
export function validateDecisionWireIdentity(intent){
 if(intent.wireIdentity===undefined)return null;
 const identity=intent.wireIdentity;
 need(identity&&Object.keys(identity).sort().join(',')==='digest,form,protocol'&&identity.protocol==='local-decision-wire-v1'&&['module','stage','both'].includes(identity.form),'ACCEPTANCE_DECISION_WIRE_IDENTITY_CHANGED');
 const wire=structuredClone(intent.request);if(identity.form!=='module')wire.stage=wire.module;if(identity.form==='stage')delete wire.module;
 const checked=decisionWireIdentity(intent.request,wire);need(checked.form===identity.form&&checked.digest===identity.digest,'ACCEPTANCE_DECISION_WIRE_IDENTITY_CHANGED');return checked;
}
export function committedDecisionReceipt(caseId,intent){
 const identity=validateDecisionWireIdentity(intent);return identity?{protocol:'local-decision-commit-v1',caseId,commandId:intent.request.commandId,requestDigest:identity.digest,operation:'decision',state:'committed',factualAuthority:false}:null;
}
export function assertDecisionWireReplay(intent,request,wireRequest){
 const saved=validateDecisionWireIdentity(intent);if(!saved)return;
 const incoming=decisionWireIdentity(request,wireRequest);need(saved.form===incoming.form&&saved.digest===incoming.digest,'ACCEPTANCE_COMMAND_REUSED');
}
export function openDecisionRejections(db){
 db.exec('CREATE TABLE IF NOT EXISTS acceptance_decision_rejections(id TEXT NOT NULL,command_id TEXT NOT NULL,request_digest TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,command_id));');
 const row=(caseId,commandId)=>db.prepare('SELECT r.*,EXISTS(SELECT 1 FROM acceptance_decision_intents i WHERE i.id=r.id AND i.command_id=r.command_id) AS admitted,EXISTS(SELECT 1 FROM acceptance_decisions d WHERE d.id=r.id AND d.command_id=r.command_id) AS completed FROM acceptance_decision_rejections r WHERE r.id=? AND r.command_id=?').get(caseId,commandId);
 function checked(value){
  need(!value.admitted&&!value.completed,'ACCEPTANCE_DECISION_REJECTION_CONFLICT');
  const receipt=JSON.parse(value.body);
  need(Object.keys(receipt).sort().join(',')==='admitted,caseId,commandId,effects,operation,protocol,reason,requestDigest,state'&&receipt.protocol==='local-decision-rejection-v1'&&receipt.caseId===value.id&&receipt.commandId===value.command_id&&receipt.requestDigest===value.request_digest&&/^[a-f0-9]{64}$/.test(receipt.requestDigest)&&receipt.operation==='decision'&&receipt.state==='rejected_before_admission'&&receipt.reason==='ACCEPTANCE_DECISION_STALE'&&receipt.admitted===false&&receipt.effects==='not_dispatched','ACCEPTANCE_DECISION_REJECTION_CHANGED');
  return receipt;
 }
 function read(caseId,commandId){need(validId(caseId)&&validId(commandId),'ACCEPTANCE_DECISION_COMMAND_INVALID');const found=row(caseId,commandId);return found?checked(found):{protocol:'local-decision-command-status-v1',caseId,commandId,operation:'decision',state:'unknown'};}
 function rejectKnown(caseId,request,wireRequest){
  const found=row(caseId,request.commandId);if(!found)return;
  const receipt=checked(found);need(receipt.requestDigest===decisionRequestDigest(wireRequest),'ACCEPTANCE_COMMAND_REUSED');
  throw Object.assign(Error(receipt.reason),{code:receipt.reason,status:409,rejectionReceipt:receipt});
 }
 function admissionOpen(caseId,request,wireRequest){need(db.isTransaction===true,'ACCEPTANCE_DECISION_ADMISSION_TRANSACTION_REQUIRED');rejectKnown(caseId,request,wireRequest);}
 function recordStale(caseId,request,wireRequest){
  if(!validId(caseId)||!validId(request?.commandId))return null;
  need(db.isTransaction===false,'ACCEPTANCE_DECISION_REJECTION_TRANSACTION_ACTIVE');
  db.exec('BEGIN IMMEDIATE');
  try{
   const existing=row(caseId,request.commandId);if(existing){const receipt=checked(existing);need(receipt.requestDigest===decisionRequestDigest(wireRequest),'ACCEPTANCE_COMMAND_REUSED');db.exec('COMMIT');return receipt;}
   const admitted=db.prepare('SELECT 1 FROM acceptance_decision_intents WHERE id=? AND command_id=? UNION ALL SELECT 1 FROM acceptance_decisions WHERE id=? AND command_id=? LIMIT 1').get(caseId,request.commandId,caseId,request.commandId);
   if(admitted){db.exec('COMMIT');return null;}
   const receipt={protocol:'local-decision-rejection-v1',caseId,commandId:request.commandId,requestDigest:decisionRequestDigest(wireRequest),operation:'decision',state:'rejected_before_admission',reason:'ACCEPTANCE_DECISION_STALE',admitted:false,effects:'not_dispatched'};
   db.prepare('INSERT INTO acceptance_decision_rejections VALUES(?,?,?,?)').run(caseId,request.commandId,receipt.requestDigest,JSON.stringify(receipt));db.exec('COMMIT');return receipt;
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
 }
 return {read,rejectKnown,admissionOpen,recordStale};
}
