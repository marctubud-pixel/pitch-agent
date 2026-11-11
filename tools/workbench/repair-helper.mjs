import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {owned,ctx} from './final-review-phase-fixture.mjs';
import {planFinalReview} from './final-review-input.mjs';
import {compactFinalReviewPlan,finalReviewCallAccounting} from './final-review-authority.mjs';
import {finalCallTargetCatalog,finalCallHash as hash} from './final-review-call.mjs';
import {phasePacket,phaseObligations,phaseItems,phaseResult,editionProofs,validatePhaseResult} from './final-review-phase.mjs';
import {createFinalCallSettlement,verifyFinalCallOriginal} from './final-review-call-original.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
function local(t,{selected=true}={}){
 const root=mkdtempSync(join(tmpdir(),'phase-protocol-')),file=join(root,'owned.sqlite'),o=owned({selected,totalCalls:1000});
 for(const profile of o.f.configuration.assignmentPolicy.profiles){profile.reportBoundBytes=65536;profile.context.maxOutputBytes=65536;profile.context.maxInputBytes=50000000;}
 o.proposal.configuration=structuredClone(o.f.configuration);const built=planFinalReview(o.f.snapshot,o.f.configuration);assert.equal(built.kind,'planned',JSON.stringify(built.blockers));o.full=built.plan;o.plan=compactFinalReviewPlan(o.full);
 let store=openStore(file);store.close();const db=new DatabaseSync(file);db.prepare('INSERT INTO revisions(project_id,revision,snapshot) VALUES(?,?,?)').run(o.p.id,o.p.revision,JSON.stringify(o.p));db.prepare('INSERT INTO heads(project_id,revision) VALUES(?,?)').run(o.p.id,o.p.revision);db.close();store=openStore(file);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 let current=store.read(o.p.id);const state=()=>current,command=(kind,fields={},context=ctx)=>(current=store.command(o.p.id,{kind,commandId:`phase-${state().revision}-${kind}`,expectedRevision:state().revision,...fields},context));
 command('set-final-review-authority',{authority:o.proposal});command('reserve-final-review-plan',{setupId:state().finalReviewSetups[0].id,plan:o.plan});
 const reservation=()=>state().finalReviewReservations.at(-1),setup=()=>state().finalReviewSetups.at(-1);
 const originals=new Map();
 function packetFor(call){const p=state(),r=reservation(),attemptId=`local-${state().finalReviewReservations.length}-attempt-${o.full.calls.findIndex(c=>c.id===call.id)}`,executor={...ctx,actorId:call.assignment.actorIdentity,runId:attemptId,contextId:`local-context-${attemptId}`};
  const predecessors=call.originalReportInputs.map(slot=>{const result=p.jobs.find(j=>j.task?.reservationId===r.id&&j.task?.id===slot.producerCallId).finalCallResult;return {slot,resultId:result.id,reportSha256:result.originals.response.sha256,reportBytes:originals.get(slot.producerCallId).response,originalReceiptSha256:result.originals.receipt.sha256};});
  const attachments=call.personalPixelInspection?o.full.packetsByRole[call.role].find(p=>p.id===call.packetId).originals.map(({occurrenceId,sha256,bytes,mediaType,dimensions,originalPath})=>({occurrenceId,sha256,bytes,mediaType,dimensions,originalPath})):[];
  const packet=phasePacket(p,setup(),r,call,attemptId,executor,o.f.snapshot,predecessors,attachments),raw={input:JSON.stringify(o.f.snapshot),plan:JSON.stringify(o.full),packet:JSON.stringify(packet)};
  return {call,packet,raw,executor,intent:{setupId:setup().id,reservationId:r.id,callId:call.id,attemptId}};
 }
 const checked=(ids,packet)=>ids.map(obligationId=>({obligationId,status:'checked',evidence:[{targetId:packet.returnTargets[0].id,observation:'Constructed local protocol evidence, no real native/source certification'}]}));
 function outcome(x,{negative=false}={}){const {call,packet}=x,predecessors=packet.predecessorOriginals.map(x=>state().jobs.find(j=>j.finalCallResult?.id===x.resultId).finalCallResult),ids=predecessors.map(x=>x.id),items=phaseItems(predecessors),r=reservation();
  if(call.id==='owner:layoutProducer')return {kind:'layout_handoff',basisHash:hash(packet.basis),statement:'Constructed basis acknowledged'};
  if(call.id==='owner:finalConsumer')return {kind:'intake_accept',producerResultId:ids[0],basisHash:hash(packet.basis),checks:checked(['producer_original','source','manuscript','editions','restrictions','routing'],packet)};
  if(['primary','blind'].includes(call.phase))return {kind:'observation',packetId:call.packetId,coverage:checked(phaseObligations(call,o.full),packet),findings:negative?[{id:`${call.reportSlot.slotIdentity}:taste`,category:negative==='hard'?'source':'aesthetic',duty:negative==='hard'?'source accuracy':'aesthetic choice',targetIds:[packet.returnTargets.find(t=>t.address.domain==='manuscript').id],evidence:negative==='hard'?[{targetId:packet.returnTargets.find(t=>t.address.domain==='manuscript').id,observation:'Mandatory source proof missing'}]:[],reason:'AI prefers a different visual tone',requestedChange:'Choose a calmer tone',effect:'must_fix'}]:[],limitations:['Constructed local basis and consumption only']};
  if(call.phase.endsWith('_synthesis'))return {kind:'lane_synthesis',lane:call.phase.split('_')[0],originalResultIds:ids,coverage:checked(phaseObligations(call,o.full),packet),findingRefs:items.map(x=>x.ref),conflicts:[],conclusion:items.length?'changes_required':'clear'};
  if(call.phase==='paired_challenge')return {kind:'paired_challenge',role:call.role,reviewedResultIds:ids,comparisons:ids.map(resultId=>({resultId,pointer:'/result',observation:'Original compared without personal pixel claim'})),objections:[],conclusion:items.length?'objections':'no_objection'};
  if(call.id==='director')return {kind:'director_disposition',reviewedResultIds:ids,coverage:checked(phaseObligations(call,o.full),packet),dispositions:items.map(x=>({itemRef:x.ref,decision:'uphold',evidence:[],reason:'Retain independent aesthetic dissent',targetIds:x.item.targetIds,duplicateOf:null})),outcome:{kind:items.length?'needs_human':'approve',itemRefs:items.map(x=>x.ref)}};
  if(call.id==='owner:finalProducer')return {kind:'final_handoff',approvalId:r.approval.id,basisHash:hash(packet.basis),editionProofs:editionProofs(o.f.snapshot.editions.value),statement:'Unchanged constructed delivery descriptors'};
  return {kind:'delivery_accept',producerResultId:predecessors.find(x=>x.binding.callId==='owner:finalProducer').id,approvalId:r.approval.id,editionProofs:editionProofs(o.f.snapshot.editions.value),checks:checked(['producer_original','delivery_bytes','inventory','native','editable','import','render'],packet)};
 }
 function completion(x,result=outcome(x)){const response=JSON.stringify({protocol:'final-phase-result-v2',binding:x.packet.binding,packetHash:sha(x.raw.packet),result}),threadId=`thread-${x.intent.attemptId}`,receipt={protocol:'local-final-call-test-v2',binding:x.packet.binding,packetHash:sha(x.raw.packet),responseHash:sha(response),responseBytes:Buffer.byteLength(response),threadId,terminal:'completed',exitCode:0,consumedAttachments:x.packet.attachments},events=[{kind:'started',threadId,contextIdentity:x.call.contextIdentity,attemptId:x.intent.attemptId},{kind:'completed',threadId,attemptId:x.intent.attemptId,responseHash:sha(response),exitCode:0}];return {...x.raw,response,receipt:JSON.stringify(receipt),events:JSON.stringify(events)};}
 function charge(x){command('mark-final-review-dispatched',{...x.intent,originals:x.raw},x.executor);}
 function settle(x,raw){command('settle-final-review-call',{...x.intent,originals:raw},x.executor);originals.set(x.call.id,{response:raw.response});}
 function execute(call,opts){if(process.env.PHASE_DIAGNOSTIC)console.log(call.id,Buffer.byteLength(JSON.stringify(state())));const x=packetFor(call);charge(x);const raw=completion(x,outcome(x,opts));settle(x,raw);return {x,raw};}
 function review(negative=false){for(const call of o.full.calls){if(call.phase==='owner_after')break;execute(call,{negative:call.id==='content:primary:0'?negative:false});}}
 function adopt(){const r=reservation(),items=phaseItems(state().jobs.filter(j=>j.finalCallResult).map(j=>j.finalCallResult));return {binding:{reservationId:r.id,setupId:r.setupId,planId:r.planId,inputId:r.inputId,policyVersion:state().policies.at(-1).version,directorResultId:r.humanPause.directorResultId},reason:'Human selects the current creative option',displayedDecision:'Adopt unchanged basis and retain AI dissent',rulings:items.filter(x=>x.item.category==='aesthetic').map(x=>({itemRef:x.ref,category:x.item.category,targetIds:x.item.targetIds,decision:'accept_subjective_risk',reason:'This aesthetic risk is acceptable'}))};}
 function seedRegenerated(p,s){store.close();const db=new DatabaseSync(file);db.prepare('UPDATE revisions SET snapshot=? WHERE project_id=? AND revision=?').run(JSON.stringify(p),p.id,p.revision);db.close();store=openStore(file);current=store.read(p.id);o.f.snapshot=s;const built=planFinalReview(s,o.f.configuration);assert.equal(built.kind,'planned',JSON.stringify(built.blockers));o.full=built.plan;o.plan=compactFinalReviewPlan(o.full);originals.clear();}
 return {seedRegenerated,o,state,command,reservation,packetFor,completion,outcome,charge,settle,execute,review,adopt,root,originals,reopen(){store.close();store=openStore(file);current=store.read(o.p.id);},gateway:()=>createFinalCallSettlement({store,executionRoot:join(root,'originals')})};
}
const human={...ctx,actorType:'human',actorId:'human-final-owner',runId:'human-reply',contextId:'human-context'};

export {local,human};
