import {isFinalCodexProtocol} from './final-review-codex-original.mjs';
import {FINAL_CODEX_PROTOCOL,finalCodexExecutionSpec} from './final-review-codex-original.mjs';
import {phaseRequest,validatePhaseOriginal} from './final-review-phase.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {finalReviewCallAccounting,finalReviewAllowance,finalReviewOriginalMetadataBasis} from './final-review-authority.mjs';
import {planFinalReview} from './final-review-input.mjs';

export const finalCallHash=v=>createHash('sha256').update(JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x)).digest('hex');
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,code,message)=>{if(!v)throw Object.assign(Error(message),{code});};
const keys=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&equal(Object.keys(v).sort(),k.split(' ').sort());
const text=v=>typeof v==='string'&&v.trim().length>0;
export const FINAL_CALL_LIMITS=Object.freeze({input:32*1024**2,plan:32*1024**2,packet:32*1024**2,response:8*1024**2,receipt:1024**2,events:1024**2});

export function finalCallOriginalFileSpec(pin,stage){if(isFinalCodexProtocol(pin?.adapterProtocol))return finalCodexExecutionSpec(stage);const names=stage==='mark'?['input','plan','packet']:stage==='reconcile'?['receipt','events']:Object.keys(FINAL_CALL_LIMITS);return Object.fromEntries(names.map(name=>[name,{suffix:`${name}.json`,limit:FINAL_CALL_LIMITS[name]}]));}

export function decodeFinalCallJSON(value,limit) {
  need(typeof value==='string'||Buffer.isBuffer(value),'FINAL_ORIGINAL_REQUIRED','Original text or bytes required');
  const b=Buffer.isBuffer(value)?value:Buffer.from(value);
  need(b.length>0&&b.length<=limit,'FINAL_ORIGINAL_LIMIT','Original exceeds finite byte bound');
  let s;try{s=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);}catch{need(false,'FINAL_INVALID_JSON','Invalid UTF-8');}
  let i=0;
  const ws=()=>{while(/[\x20\t\r\n]/.test(s[i]??'x'))i++;};
  const string=()=>{const start=i++;while(i<s.length){if(s[i]==='\\'){i+=2;continue;}if(s[i++]==='"')return JSON.parse(s.slice(start,i));}throw Error('Unterminated string');};
  const valueAt=depth=>{
    if(depth>128)throw Error('JSON nesting limit');ws();const ch=s[i];
    if(ch==='"'){string();return;}
    if(ch==='{'||ch==='['){i++;ws();const end=ch==='{'?'}':']',seen=new Set();if(s[i]===end){i++;return;}
      while(i<s.length){if(ch==='{'){ws();if(s[i]!=='"')throw Error('Object key required');const k=string();if(seen.has(k))throw Error('Duplicate key');seen.add(k);ws();if(s[i++]!==':')throw Error('Colon required');}valueAt(depth+1);ws();if(s[i]===end){i++;return;}if(s[i++]!==',')throw Error('Comma required');}throw Error('Unclosed container');}
    const m=s.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!m)throw Error('Invalid value');i+=m[0].length;
  };
  try{valueAt(0);ws();if(i!==s.length)throw Error('Trailing data');return JSON.parse(s);}catch{need(false,'FINAL_INVALID_JSON','Strict JSON without duplicate keys required');}
}
const descriptor=v=>{const b=Buffer.isBuffer(v)?v:Buffer.from(v);return {sha256:sha(b),bytes:b.length};};
export function finalCallTargetCatalog(basis,payload) {
  const rows=[['task','proposal-director','/exactTask',payload.exactTask,{taskCardId:basis.taskCardId}],['policy','proposal-director','/exactPolicy',payload.exactPolicy,{policyHash:basis.policyHash}],['content','content-lead','/fullSource',payload.fullSource,{contentArtifactId:basis.contentArtifactId,contentRootJobId:basis.contentRootJobId,contentHash:basis.contentHash,sourceHash:basis.sourceHash,manuscriptHash:basis.manuscriptHash}],['layout','layout-lead','/layout',payload.layout,{layoutRootJobId:basis.layoutRootJobId,bindingHash:basis.bindingHash}],...basis.editions.map(e=>['edition','layout-lead',`/editions/${payload.editions.findIndex(x=>x.style===e.style)}`,payload.editions.find(x=>x.style===e.style),e])];
  return rows.map(([kind,owner,pointer,value,basisTuple])=>{need(value!==undefined,'FINAL_TARGET_UNBOUND','Return target absent from frozen payload');const entry={kind,owner,pointer,valueHash:finalCallHash(value),basisTuple};return {...entry,id:finalCallHash(entry)};});
}

export function finalRequestBasis(p,setup,reservation,originals) {
  const input=decodeFinalCallJSON(originals.input,FINAL_CALL_LIMITS.input),plan=decodeFinalCallJSON(originals.plan,FINAL_CALL_LIMITS.plan);
  const built=planFinalReview(input,setup.configuration);
  const live=finalReviewCallAccounting(p,{ownReservationId:reservation.id}),allowance=finalReviewAllowance(p);
  need(live.unknown.every(a=>p.jobs.some(j=>j.purpose==='final_review_call'&&j.task.reservationId===reservation.id&&j.attempts.some(x=>x.id===a.attemptId))),'FINAL_UNKNOWN_BLOCKS','Live unknown originals require reconciliation');
  need(allowance&&live.consumedCalls+live.reservedOtherCalls+live.ownHeldCalls<=allowance.totalCalls,'FINAL_CUMULATIVE_ALLOWANCE','Live accounting remains spending authority');
  need(built.kind==='planned'&&finalCallHash(built.plan)===finalCallHash(plan)&&plan.id===reservation.planId&&plan.inputId===reservation.inputId,'FINAL_PLAN_CHANGED','Exact frozen input and unchanged planner output required');
  need(p.finalReviewSetups.filter(s=>s.id===setup.id).length===1&&equal(p.finalReviewSetups.find(s=>s.id===setup.id),setup)&&p.finalReviewReservations.filter(r=>r.id===reservation.id).length===1&&equal(p.finalReviewReservations.find(r=>r.id===reservation.id),reservation)&&reservation.setupId===setup.id&&equal(setup.basis,finalReviewOriginalMetadataBasis(p,setup.basis.layoutRootJobId)),'FINAL_CALL_BINDING_CHANGED','Exact registered setup, reservation and original basis required');
  need(input.project.id===p.id&&input.task.identity===setup.basis.taskCardId&&finalCallHash(input.policy.exactPolicy)===setup.basis.policyHash&&input.layout.bindingIdentity===setup.basis.bindingHash&&input.layout.rootJobId===setup.basis.layoutRootJobId,'FINAL_STALE_BASIS','Frozen input must match registered basis');
  for(const e of setup.basis.editions){
    const actual=input.editions.value.find(x=>x.style===e.style),job=p.jobs.find(j=>j.id===e.jobId);
    need(actual?.originalExportJobId===e.jobId&&actual.originalAttemptId===e.attemptId&&actual.anchor.sha256===job.receipt.anchorHash&&actual.anchor.originalPath===job.receipt.anchorPath,'FINAL_STALE_BASIS','Exact frozen edition and registered anchor receipt required');
  }
  const materials=input.materials.map(({sourceValidation,...m})=>({identity:m.identity,correspondenceHash:finalCallHash(m)}));
  need(equal(materials,setup.materials)&&equal(input.roleMaterialScopes,setup.roleMaterialScopes),'FINAL_SETUP_MATERIALS_CHANGED','Exact registered correspondence and material duty maps required');
  need(equal(plan.configuration,setup.configuration)&&equal(plan.Krole,reservation.Krole)&&equal(plan.localGates,reservation.localGates)&&equal(plan.calls.map(({id,phase,role,dependencies,contextIdentity,assignment})=>({id,phase,role,dependencies,contextIdentity,assignment})),reservation.calls.map(({id,phase,role,dependencies,contextIdentity,assignment})=>({id,phase,role,dependencies,contextIdentity,assignment}))),'FINAL_PLAN_CHANGED','Full plan must match reservation');
  return {input,plan};
}

export function finalCallRequest(p,setup,reservation,attemptId,executor,originals) {
  const suppliedPacket=decodeFinalCallJSON(originals.packet,FINAL_CALL_LIMITS.packet);
  if(suppliedPacket.protocol==='final-call-packet-v2')return phaseRequest(p,setup,reservation,attemptId,executor,originals);
  const {plan}=finalRequestBasis(p,setup,reservation,originals);
  const call=plan.calls[0];
  need(call.id==='owner:layoutProducer'&&call.originalReportInputs.length===0&&call.packetId===null&&!call.personalPixelInspection,'FINAL_PHASE_UNSUPPORTED','Only first layout producer supported');
  const binding={projectId:p.id,setupId:setup.id,reservationId:reservation.id,planId:plan.id,inputId:plan.inputId,callId:call.id,attemptId,executor,contextIdentity:call.contextIdentity,assignment:call.assignment,profile:call.profile,reportSlot:call.reportSlot};
  const packet={protocol:'final-call-packet-v1',operation:'final-review-v1',binding,call,basis:setup.basis,returnTargets:finalCallTargetCatalog(setup.basis,call.payload)};
  const actual=decodeFinalCallJSON(originals.packet,FINAL_CALL_LIMITS.packet);
  need(equal(packet,actual),'FINAL_REQUEST_CHANGED','Exact first-call packet required');
  return {protocol:'final-call-request-pin-v1',binding,basis:setup.basis,returnTargets:packet.returnTargets,responseLimit:Math.min(call.reportSlot.maxBytes,call.textBudget.maxOutputBytes,call.profile.reportBoundBytes,FINAL_CALL_LIMITS.response),originals:Object.fromEntries(['input','plan','packet'].map(k=>[k,descriptor(originals[k])]))};
}

export function validateFinalCallOriginal(p,job,originals) {
  if(job.task?.originalRequest?.protocol==='final-call-request-pin-v2')return validatePhaseOriginal(p,job,originals);
  const matches=p.jobs.filter(j=>j.id===job.id);
  need(matches.length===1&&equal(matches[0],job)&&p.jobs.filter(j=>j.purpose==='final_review_call'&&j.task.reservationId===job.task.reservationId&&j.task.id===job.task.id).length===1,'FINAL_CALL_UNREGISTERED','Exact registered job required');
  job=matches[0];
  const pin=job.task.originalRequest;
  need(pin?.protocol==='final-call-request-pin-v1','FINAL_REQUEST_UNREGISTERED','Pre-effect request pin required');
  const setup=p.finalReviewSetups.find(s=>s.id===job.task.setupId),r=p.finalReviewReservations.find(r=>r.id===job.task.reservationId),attempt=job.attempts[0];
  const calls=r?.calls.filter(c=>c.id===job.task.id)??[],call=calls[0];
  need(setup&&r&&calls.length===1&&job.attempts.length===1&&p.jobs.flatMap(j=>j.attempts??[]).filter(a=>a.id===attempt.id).length===1&&call.attemptId===attempt.id&&r.planId===job.task.planId&&r.inputId===job.task.inputId&&r.setupId===setup.id&&['charged','succeeded'].includes(call.status),'FINAL_CALL_BINDING_CHANGED','Exact registered reservation, call and unique attempt required');
  if(job.finalCallResult)need(call.status==='succeeded'&&call.resultId===job.finalCallResult.id&&call.semanticOutcome===job.finalCallResult.semanticOutcome&&job.status==='succeeded'&&attempt.status==='succeeded'&&equal(job.receipt,job.finalCallResult.receipt)&&equal(attempt.receipt,job.receipt),'FINAL_RESULT_CONFLICT','Registered result and accounting membership required');
  else need(call.status==='charged'&&call.resultId===undefined&&job.status==='awaiting_reconciliation'&&attempt.status==='awaiting_reconciliation','FINAL_CALL_BINDING_CHANGED','Registered unresolved call required');
  const rebuilt=finalCallRequest(p,setup,r,attempt.id,attempt.executor,originals);
  need(equal(pin,rebuilt),'FINAL_REQUEST_CHANGED','Pinned original bytes changed');
  need(job.purpose==='final_review_call'&&job.task.id===pin.binding.callId&&job.task.planId===pin.binding.planId&&job.task.inputId===pin.binding.inputId&&job.task.contextIdentity===pin.binding.contextIdentity&&job.binding.providerId===pin.binding.assignment.providerIdentity&&job.binding.model===pin.binding.assignment.modelIdentity&&attempt.dispatchStarted===true,'FINAL_CALL_BINDING_CHANGED','Registered call membership changed');
  const response=decodeFinalCallJSON(originals.response,pin.responseLimit),receipt=decodeFinalCallJSON(originals.receipt,FINAL_CALL_LIMITS.receipt),events=decodeFinalCallJSON(originals.events,FINAL_CALL_LIMITS.events);
  need(keys(response,'protocol binding packetHash outcome')&&response.protocol==='final-layout-producer-result-v1'&&equal(response.binding,pin.binding)&&response.packetHash===pin.originals.packet.sha256,'FINAL_RESULT_INVALID','Exact bound result envelope required');
  const o=response.outcome;
  if(o?.kind==='handoff')need(keys(o,'kind basisHash statement')&&o.basisHash===finalCallHash(pin.basis)&&text(o.statement),'FINAL_RESULT_INVALID','Handoff must acknowledge frozen basis');
  else {
    need(keys(o,'kind findings')&&o.kind==='return'&&Array.isArray(o.findings)&&o.findings.length>0&&o.findings.length<=pin.returnTargets.length,'FINAL_RESULT_INVALID','Nonempty actionable return required');
    const seen=new Set();for(const f of o.findings){need(keys(f,'targetId reason requestedChange')&&pin.returnTargets.some(t=>t.id===f.targetId)&&!seen.has(f.targetId)&&text(f.reason)&&text(f.requestedChange),'FINAL_TARGET_INVALID','Unique exact catalog target and actionable change required');seen.add(f.targetId);}
  }
  const descriptors=Object.fromEntries(Object.keys(FINAL_CALL_LIMITS).map(k=>[k,descriptor(originals[k])]));
  need(keys(receipt,'protocol binding packetHash responseHash responseBytes threadId terminal exitCode')&&receipt.protocol==='local-final-call-test-v1'&&equal(receipt.binding,pin.binding)&&receipt.packetHash===pin.originals.packet.sha256&&receipt.responseHash===descriptors.response.sha256&&receipt.responseBytes===descriptors.response.bytes&&text(receipt.threadId)&&receipt.terminal==='completed'&&receipt.exitCode===0,'FINAL_RECEIPT_INVALID','Matching local terminal receipt required');
  need(Array.isArray(events)&&events.length===2&&equal(events,[{kind:'started',threadId:receipt.threadId,contextIdentity:pin.binding.contextIdentity,attemptId:attempt.id},{kind:'completed',threadId:receipt.threadId,attemptId:attempt.id,responseHash:receipt.responseHash,exitCode:0}]),'FINAL_TERMINAL_INVALID','Exact original start and terminal event required');
  need(!p.jobs.some(j=>(j.id!==job.id&&[j.finalCallResult?.threadId,j.receipt?.threadId,j.receipt?.providerExecution?.threadId].includes(receipt.threadId))||(j.attempts??[]).some(a=>a.id!==attempt.id&&[a.receipt?.threadId,a.receipt?.providerExecution?.threadId].includes(receipt.threadId))),'FINAL_THREAD_REUSED','Independent unused thread required');
  const body={protocol:'final-call-settlement-v1',binding:pin.binding,originals:descriptors,report:response,semanticOutcome:o.kind,threadId:receipt.threadId};
  const result={...body,id:finalCallHash(body),receipt:{providerId:job.binding.providerId,model:job.binding.model,role:job.binding.role,attemptId:attempt.id,protocol:receipt.protocol,originalReceiptHash:descriptors.receipt.sha256,threadId:receipt.threadId}};
  need(!job.finalCallResult||equal(job.finalCallResult,result),'FINAL_RESULT_CONFLICT','Exact registered immutable result required');
  return result;
}
