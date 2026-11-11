import {assertObservedCallShape} from './final-operation-manifest.mjs';
import {isFinalCodexProtocol} from './final-review-codex-original.mjs';
import {buildFinalCodexInvocation,validateFinalCodexOriginal,FINAL_CODEX_PROTOCOL,decodeCodexJSON} from './final-review-codex-original.mjs';
import {sketchHash} from './sketch-authority.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {finalCallHash as hash,decodeFinalCallJSON as decode,FINAL_CALL_LIMITS,finalRequestBasis,validateFinalCallOriginal} from './final-review-call.mjs';
const need=(v,code='FINAL_RESULT_INVALID')=>{if(!v)throw Object.assign(Error(code),{code});};
const text=v=>typeof v==='string'&&v.trim().length>0;
const keys=(v,n)=>v&&typeof v==='object'&&!Array.isArray(v)&&equal(Object.keys(v).sort(),n.split(' ').sort());
const sha=v=>createHash('sha256').update(v).digest('hex');
const descriptor=v=>({sha256:sha(v),bytes:Buffer.byteLength(v)});
const unique=v=>Array.isArray(v)&&new Set(v.map(x=>hash(x))).size===v.length;
const exact=(a,b)=>unique(a)&&equal([...a].sort(),[...b].sort());
const ptr=(v,p)=>{need(typeof p==='string'&&(p===''||p.startsWith('/')),'FINAL_TARGET_UNBOUND');for(const k of p.split('/').slice(1)){v=v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')];}need(v!==undefined,'FINAL_TARGET_UNBOUND');return v;};
export const SUBJECTIVE_CATEGORIES=Object.freeze(['creative','aesthetic','strategy']);
export const HARD_CATEGORIES=Object.freeze(['factual','source','mandatory_task','native_proof','mixed']);
const categories=[...SUBJECTIVE_CATEGORIES,...HARD_CATEGORIES];
const walk=(v,fn)=>{if(v&&typeof v==='object'){fn(v);for(const x of Object.values(v))walk(x,fn);}};

export function phaseTargetCatalog(input,call) {
 const out=[],seen=new Set(),basisTuple={inputId:input.inputId??null,contentHash:input.content.trusted.contentHash,manuscriptHash:input.content.trusted.contract.manuscriptHash,sourceHash:input.content.trusted.source.sourceHash,bindingHash:input.layout.bindingIdentity};
 const add=(address,value,owner)=>{need(text(owner),'FINAL_TARGET_UNBOUND');const body={inputId:call.reportSlot.inputId,owner,address,valueHash:hash(value),basisTuple};const id=hash(body);if(!seen.has(id)){seen.add(id);out.push({...body,id});}};
 const c=input.content.trusted.contract;
 const resolve=a=>{
  if(a.domain==='content_location'){const hit=input.content.locations.entries.filter(e=>equal(e.location,a.location));need(hit.length===1,'FINAL_TARGET_UNBOUND');return [hit[0].value,'content-lead'];}
  if(a.domain==='manuscript'){need(a.artifactId===c.artifactId&&a.contentHash===input.content.trusted.contentHash&&a.manuscriptHash===c.manuscriptHash,'FINAL_TARGET_UNBOUND');let v=ptr(c.manuscript,a.pointer);if(a.range){const r=a.range;need(typeof v==='string'&&keys(r,'unit start end')&&r.unit==='utf16_code_unit'&&Number.isSafeInteger(r.start)&&Number.isSafeInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=v.length,'FINAL_TARGET_UNBOUND');v=v.slice(r.start,r.end);}return [v,'content-lead'];}
  if(a.domain==='effective_source_member'){const source=input.content.trusted.source,v=source[a.collection]?.[a.memberIndex],key={sources:'id',claims:null,obligations:'originId',images:'imageId'}[a.collection];need(Object.hasOwn({sources:1,claims:1,obligations:1,images:1},a.collection)&&a.rootJobId===c.rootJobId&&a.sourceHash===source.sourceHash&&Number.isSafeInteger(a.memberIndex)&&v&&a.pointer===`/${a.collection}/${a.memberIndex}`&&a.memberId===(key?v[key]:sketchHash(v)),'FINAL_TARGET_UNBOUND');return [v,'content-lead'];}
  if(a.domain==='native_manifest'){const e=input.editions.value.find(e=>e.originalAttemptId===a.editionAttemptId),n=a.element;need(e&&a.manifestSha256===e.layoutManifest.sha256&&n,'FINAL_TARGET_UNBOUND');const slide=e.layoutManifest.raw.slides[n.slideIndex],el=slide?.elements[n.elementIndex];need(n.editionAttemptId===e.originalAttemptId&&n.layoutManifestSha256===e.layoutManifest.sha256&&slide?.id===n.slideId&&el?.id===n.elementId&&el?.occurrenceId===n.occurrenceId&&a.pointer===`/slides/${n.slideIndex}/elements/${n.elementIndex}`,'FINAL_TARGET_UNBOUND');return [ptr(e.layoutManifest.raw,a.pointer),'layout-lead'];}
  if(a.domain==='legacy_artifact'){const h=input.history.retained.hosts.filter(h=>h.artifactId===a.artifactId&&h.contentHash===a.contentHash&&h.version===a.version);need(h.length===1,'FINAL_TARGET_UNBOUND');const selector=a.selector;let value;if(selector?.kind==='json_pointer'){need(a.originalLocator===selector.pointer,'FINAL_TARGET_UNBOUND');value=ptr(h[0].raw,selector.pointer);}else if(selector?.kind==='domain_member'&&['sources','directions','targets'].includes(selector.collection)){const key={sources:'id',directions:'directionId',targets:'targetId'}[selector.collection],rows=selector.collection==='targets'?h[0].raw.directions?.flatMap(d=>d.targets):h[0].raw[selector.collection],hits=rows?.filter(row=>row[key]===selector.id)??[];need(hits.length===1&&a.originalLocator===`/${selector.collection}/${selector.id}${selector.field??''}`,'FINAL_TARGET_UNBOUND');value=ptr(hits[0],selector.field??'');}else need(false,'FINAL_TARGET_PROTOCOL_UNSUPPORTED');return [value,'content-lead'];}
  if(a.domain==='visual_asset'){const m=input.materials.find(m=>m.identity===a.imageId);need(m?.file?.value?.sha256===a.sha256&&m.file.value.originalPath===a.originalPath,'FINAL_TARGET_UNBOUND');const visual=input.content.trusted.source.visual;const targets=visual?.payload?.directions?.flatMap(d=>d.targets??[]).filter(t=>t.imageId===a.imageId)??[];need(m.kind==='source_image'&&input.content.trusted.source.images.some(row=>equal(row,m.sourceRow))&&targets.length===1&&text(visual.artifactId),'FINAL_TARGET_UNBOUND');return [m.sourceRow,'visual-lead'];}
  need(false,'FINAL_TARGET_PROTOCOL_UNSUPPORTED');
 };
 const payload=call.payload;
 if(payload.exactTask)add({domain:'task',identity:input.task.identity},payload.exactTask,'proposal-director');
 if(payload.exactPolicy)add({domain:'policy',identity:input.policy.identity},payload.exactPolicy,'proposal-director');
 walk(payload,v=>{if(['content_location','manuscript','effective_source_member','native_manifest','legacy_artifact','visual_asset'].includes(v.domain)){const [value,owner]=resolve(v);add(v,value,owner);}});
 for(const collection of ['sources','claims','obligations','images'])for(const [memberIndex,value] of input.content.trusted.source[collection].entries()){if(!payload.fullSource&&!equal(payload.neutral?.[collection]?.[memberIndex],value))continue;const key={sources:'id',claims:null,obligations:'originId',images:'imageId'}[collection],address={domain:'effective_source_member',rootJobId:c.rootJobId,sourceHash:input.content.trusted.source.sourceHash,collection,memberIndex,memberId:key?value[key]:sketchHash(value),pointer:`/${collection}/${memberIndex}`};add(address,value,'content-lead');}
 for(const e of [...(payload.fullSource?input.content.locations.entries:[]),...(payload.restrictions?.applicableOriginals??[])])add({domain:'content_location',location:e.location},e.value,'content-lead');
 for(const e of payload.effectiveCatalog??[])add({domain:'content_location',location:e.location},e.value,'content-lead');
 if(payload.manuscriptText===input.content.trusted.manuscriptText||payload.fullSource){for(const [i,b] of c.manuscript.narrativeBlocks.entries())if(typeof b.text==='string'&&b.text.length)add({domain:'manuscript',artifactId:c.artifactId,contentHash:input.content.trusted.contentHash,manuscriptHash:c.manuscriptHash,pointer:`/narrativeBlocks/${i}/text`,range:{unit:'utf16_code_unit',start:0,end:b.text.length}},b.text,'content-lead');}
 const exposedEditions=payload.editions??[];
 for(const e of exposedEditions){need(input.editions.value.some(x=>equal(x,e)),'FINAL_TARGET_UNBOUND');for(const p of e.placements){const n=p.native,a={domain:'native_manifest',editionAttemptId:e.originalAttemptId,manifestSha256:e.layoutManifest.sha256,pointer:`/slides/${n.slideIndex}/elements/${n.elementIndex}`,element:n};const [v,owner]=resolve(a);add(a,v,owner);}for(const p of e.pages)add({domain:'native_page',editionAttemptId:e.originalAttemptId,manifestSha256:e.layoutManifest.sha256,pageId:hash({root:input.layout.rootJobId,binding:input.layout.bindingIdentity,style:e.style,job:e.originalExportJobId,attempt:e.originalAttemptId,worker:e.originalWorker,execution:e.historicalExecution,anchor:e.anchor,deck:e.deliveryDeck,nativeInputDeck:e.nativeInputDeck,pdf:e.pdf,layoutManifest:e.layoutManifest,reviewManifest:e.reviewManifest,number:p.pageNumber,slideId:p.slideId,render:p.originalRender}),pageNumber:p.pageNumber,slideId:p.slideId,render:p.originalRender},p.rawReviewPage,'layout-lead');}
 return out;
}

export function phasePredecessors(p,reservation,call,originals) {
 need(Array.isArray(originals)&&originals.length===call.originalReportInputs.length,'FINAL_PREDECESSOR_REQUIRED');
 for(const [i,row] of originals.entries()){
  need(keys(row,'slot resultId reportSha256 reportBytes originalReceiptSha256')&&equal(row.slot,call.originalReportInputs[i]),'FINAL_PREDECESSOR_REQUIRED');
  const job=p.jobs.find(j=>j.purpose==='final_review_call'&&j.task.reservationId===reservation.id&&j.task.id===row.slot.producerCallId),result=job?.finalCallResult;
  if(result){const {id,receipt,...body}=result;need(hash(body)===id&&equal(result.binding,job.task.originalRequest.binding)&&result.report.packetHash===job.task.originalRequest.originals.packet.sha256&&equal(result.report.binding,result.binding)&&reservation.calls.some(c=>c.id===job.task.id&&c.status==='succeeded'&&c.resultId===id),'FINAL_PREDECESSOR_REQUIRED');}
  need(result&&job.status==='succeeded'&&result.id===row.resultId&&typeof row.reportBytes==='string'&&sha(row.reportBytes)===row.reportSha256&&row.reportSha256===result.originals.response.sha256&&Buffer.byteLength(row.reportBytes)===result.originals.response.bytes&&row.originalReceiptSha256===result.originals.receipt.sha256,'FINAL_PREDECESSOR_REQUIRED');
  need(equal(decode(row.reportBytes,row.slot.maxBytes),result.report),'FINAL_PREDECESSOR_REQUIRED');
  need(job.task.originalRequest.binding.attemptId===job.attempts[0].id&&equal(job.receipt,job.attempts[0].receipt)&&job.receipt.originalReceiptHash===row.originalReceiptSha256,'FINAL_PREDECESSOR_REQUIRED');
 }
 return originals;
}
export function phasePacket(p,setup,r,call,attemptId,executor,input,predecessorOriginals,attachments=[]) {
 const binding={projectId:p.id,setupId:setup.id,reservationId:r.id,planId:r.planId,inputId:r.inputId,callId:call.id,attemptId,executor,contextIdentity:call.contextIdentity,assignment:call.assignment,profile:call.profile,reportSlot:call.reportSlot};
 return {protocol:'final-call-packet-v2',operation:'final-review-v1',binding,call,basis:setup.basis,returnTargets:phaseTargetCatalog(input,call),predecessorOriginals,attachments};
}
export function phaseRequest(p,setup,r,attemptId,executor,originals) {
 const {input,plan}=finalRequestBasis(p,setup,r,originals),actual=decode(originals.packet,FINAL_CALL_LIMITS.packet),call=plan.calls.find(c=>c.id===actual.binding?.callId);
 need(call,'FINAL_INVALID_CALL');phasePredecessors(p,r,call,actual.predecessorOriginals);
 need(Array.isArray(actual.attachments),'FINAL_ATTACHMENT_REQUIRED');
 if(!call.personalPixelInspection)need(actual.attachments.length===0,'FINAL_PIXEL_RECEIPT_REQUIRED');
 else {
  const packet=plan.packetsByRole[call.role].find(x=>x.id===call.packetId);
  need(actual.attachments.length===packet.originals.length,'FINAL_ATTACHMENT_REQUIRED');
  for(const [i,a] of actual.attachments.entries()){const o=packet.originals[i];need(keys(a,'occurrenceId sha256 bytes mediaType dimensions originalPath')&&a.occurrenceId===o.occurrenceId&&a.sha256===o.sha256&&a.bytes===o.bytes&&equal(a.dimensions,o.dimensions)&&a.originalPath===o.originalPath&&a.mediaType===o.mediaType,'FINAL_ATTACHMENT_REQUIRED');}
 }
 if(r.operationCaptureIdentity){
  const job=p.jobs.find(j=>j.purpose==='final_operation_observation'&&j.status==='succeeded'&&j.observationResult?.duties?.captureIdentity===r.operationCaptureIdentity&&j.observationResult?.duties?.plannedShape?.callId===call.id);
  need(job,'FINAL_OPERATION_EXACT_CALL_OBSERVATION_REQUIRED');const observation=job.observationResult.duties;
  need(originals.providerRequest&&originals.providerSchema,'FINAL_OPERATION_EXACT_WIRE_REQUIRED');
  assertObservedCallShape({kind:'call',shape:observation.plannedShape},call,actual,originals.providerRequest,originals.providerSchema,observation);
 }
 const expected=phasePacket(p,setup,r,call,attemptId,executor,input,actual.predecessorOriginals,actual.attachments);
 need(equal(actual,expected),'FINAL_REQUEST_CHANGED');
 need(Buffer.byteLength(originals.packet)<=call.profile.context.maxInputBytes,'FINAL_CONTEXT_CAPACITY_EXCEEDED');
 const codex=Object.hasOwn(originals,'providerRequest')||Object.hasOwn(originals,'providerSchema');
 if(codex){need(Object.hasOwn(originals,'providerRequest')&&Object.hasOwn(originals,'providerSchema'),'FINAL_REQUEST_CHANGED');const built=buildFinalCodexInvocation({packetText:originals.packet,adapterProtocol:decodeCodexJSON(originals.providerRequest,32*1024**2).adapterProtocol??FINAL_CODEX_PROTOCOL});need(Buffer.from(originals.providerRequest).equals(Buffer.from(built.inputText))&&Buffer.from(originals.providerSchema).equals(Buffer.from(built.schemaText)),'FINAL_REQUEST_CHANGED');need(Buffer.byteLength(built.inputText)+Buffer.byteLength(built.schemaText)<=call.profile.context.maxInputBytes,'FINAL_CONTEXT_CAPACITY_EXCEEDED');}
 const pin={protocol:'final-call-request-pin-v2',binding:expected.binding,basis:setup.basis,returnTargets:expected.returnTargets,predecessorOriginals:expected.predecessorOriginals,attachments:expected.attachments,schema:'final-phase-result-v2',adapterProtocol:'local-final-call-test-v2',responseLimit:Math.min(call.reportSlot.maxBytes,call.textBudget.maxOutputBytes,call.profile.context.maxOutputBytes,call.profile.reportBoundBytes,FINAL_CALL_LIMITS.response),originals:Object.fromEntries(['input','plan','packet'].map(k=>[k,descriptor(originals[k])]))};
 if(codex){const built=buildFinalCodexInvocation({packetText:originals.packet,adapterProtocol:decodeCodexJSON(originals.providerRequest,32*1024**2).adapterProtocol??FINAL_CODEX_PROTOCOL});Object.assign(pin,{adapterProtocol:built.request.adapterProtocol??FINAL_CODEX_PROTOCOL,operation:'final-review-v1',providerDescriptors:built.descriptors,responseLimit:Math.min(pin.responseLimit,2*1024**2)});Object.assign(pin.originals,{providerRequest:descriptor(originals.providerRequest),providerSchema:descriptor(originals.providerSchema)});}
 return pin;
}
export function phaseObligations(call,plan) {
 if(call.phase==='primary'||call.phase==='blind'){const packet=plan.packetsByRole[call.role].find(p=>p.id===call.packetId);return packet.kind==='complete_source'?['task','policy','manuscript','source','qualifications','duty']:packet.obligations.map(o=>o.id);}
 return call.originalReportInputs.map(s=>s.producerCallId);
}
export const phaseResult=(r)=>r?.report?.result??r?.report?.outcome;
export function phaseItems(results) {
 const rows=[];
 for(const original of results){const r=phaseResult(original);for(const [field,items] of [['findings',r?.findings],['objections',r?.objections]])for(const [i,item] of (items??[]).entries())rows.push({ref:`${original.id}#/result/${field}/${i}`,item,resultId:original.id,pointer:`/result/${field}/${i}`});}
 return rows;
}
function coverage(v,expected,pin){need(Array.isArray(v)&&exact(v.map(x=>x.obligationId),expected));for(const x of v){need(keys(x,'obligationId status evidence')&&['checked','unknown'].includes(x.status));evidence(x.evidence,pin,x.status==='checked');}}
function evidence(v,pin,required=true){need(Array.isArray(v)&&(!required||v.length>0));for(const e of v)need(keys(e,'targetId observation')&&pin.returnTargets.some(t=>t.id===e.targetId)&&text(e.observation),'FINAL_EVIDENCE_REQUIRED');}
function finding(f,pin,allowRuling=false){need((keys(f,'id category duty targetIds evidence reason requestedChange effect')||allowRuling&&keys(f,'id category duty targetIds evidence reason requestedChange effect rulingRef'))&&text(f.id)&&f.id.startsWith(`${pin.binding.reportSlot.slotIdentity}:`)&&categories.includes(f.category)&&text(f.duty)&&unique(f.targetIds)&&f.targetIds.length>0&&f.targetIds.every(id=>pin.returnTargets.some(t=>t.id===id))&&text(f.reason)&&text(f.requestedChange)&&['must_fix','advisory','unknown'].includes(f.effect));evidence(f.evidence,pin,!SUBJECTIVE_CATEGORIES.includes(f.category));}
export function validatePhaseResult(result,pin,call,plan,predecessors,r) {
 const ids=predecessors.map(x=>x.id),items=phaseItems(predecessors),refs=items.map(x=>x.ref);
 if(result?.kind==='return'){const ownerAfter=call.phase==='owner_after'&&r.approval,ownerBefore=call.phase==='owner_before'&&r.localGates.length===1;need((keys(result,'kind findings')||ownerBefore&&keys(result,'kind findings basisHash checks')||ownerAfter&&keys(result,'kind findings approvalId editionProofs checks'))&&Array.isArray(result.findings)&&result.findings.length>0&&unique(result.findings.map(f=>f.id)));for(const f of result.findings)finding(f,pin,ownerAfter);
  if(ownerBefore&&result.findings.every(f=>SUBJECTIVE_CATEGORIES.includes(f.category))){need(result.basisHash===hash(pin.basis),'FINAL_HARD_PROOF_REQUIRED');coverage(result.checks,call.id==='owner:layoutProducer'?['frozen_basis']:['producer_original','source','manuscript','editions','restrictions','routing'],pin);need(result.checks.every(c=>c.status==='checked'),'FINAL_HARD_PROOF_REQUIRED');}
  if(ownerAfter&&result.findings.every(f=>SUBJECTIVE_CATEGORIES.includes(f.category))){
   need(result.approvalId===r.approval.id&&equal(result.editionProofs,editionProofs(plan.calls[0].payload.editions)),'FINAL_HARD_PROOF_REQUIRED');coverage(result.checks,['producer_original','delivery_bytes','inventory','native','editable','import','render'],pin);need(result.checks.every(c=>c.status==='checked'),'FINAL_HARD_PROOF_REQUIRED');
   for(const f of result.findings){const ruling=r.approval.decision.rulings.find(x=>x.itemRef===f.rulingRef&&x.decision==='accept_subjective_risk'),original=items.find(x=>x.ref===f.rulingRef)?.item;const {id,rulingRef,...body}=f;const {id:originalId,...originalBody}=original??{};need(ruling&&original&&equal(body,originalBody),'FINAL_SUBJECTIVE_RULING_REQUIRED');}
  }
  return;}
 const accepted={ 'owner:layoutProducer':'layout_handoff','owner:finalConsumer':'intake_accept','owner:finalProducer':'final_handoff','owner:deliveryConsumer':'delivery_accept',director:'director_disposition'};
 const kind=accepted[call.id]??(['primary','blind'].includes(call.phase)?'observation':['primary_synthesis','blind_synthesis'].includes(call.phase)?'lane_synthesis':'paired_challenge');need(result?.kind===kind);
 if(kind==='layout_handoff'){need(keys(result,'kind basisHash statement')&&result.basisHash===hash(pin.basis)&&text(result.statement));return;}
 if(kind==='observation'){need(keys(result,'kind packetId coverage findings limitations')&&result.packetId===call.packetId&&Array.isArray(result.findings)&&unique(result.findings.map(f=>f.id))&&Array.isArray(result.limitations)&&result.limitations.every(text));coverage(result.coverage,phaseObligations(call,plan),pin);for(const f of result.findings)finding(f,pin);return;}
 if(kind==='lane_synthesis'){need(keys(result,'kind lane originalResultIds coverage findingRefs conflicts conclusion')&&result.lane===call.phase.split('_')[0]&&exact(result.originalResultIds,ids)&&exact(result.findingRefs,refs)&&Array.isArray(result.conflicts)&&['clear','changes_required','inconclusive'].includes(result.conclusion));coverage(result.coverage,phaseObligations(call,plan),pin);for(const c of result.conflicts)need(keys(c,'findingRefs reason')&&Array.isArray(c.findingRefs)&&c.findingRefs.length>0&&c.findingRefs.every(x=>refs.includes(x))&&text(c.reason));return;}
 if(kind==='paired_challenge'){need(keys(result,'kind role reviewedResultIds comparisons objections conclusion')&&result.role===call.role&&exact(result.reviewedResultIds,ids)&&Array.isArray(result.comparisons)&&exact(result.comparisons.map(x=>x.resultId),ids)&&Array.isArray(result.objections)&&['no_objection','objections','inconclusive'].includes(result.conclusion));for(const c of result.comparisons)need(keys(c,'resultId pointer observation')&&c.pointer==='/result'&&text(c.observation));for(const o of result.objections){need(keys(o,'id category findingRefs targetIds evidence reason proposedDisposition')&&categories.includes(o.category)&&text(o.id)&&o.id.startsWith(`${pin.binding.reportSlot.slotIdentity}:`)&&unique(o.findingRefs)&&o.findingRefs.every(x=>refs.includes(x))&&unique(o.targetIds)&&o.targetIds.length>0&&o.targetIds.every(x=>pin.returnTargets.some(t=>t.id===x))&&text(o.reason)&&['uphold','dismiss','needs_evidence'].includes(o.proposedDisposition));evidence(o.evidence,pin,!SUBJECTIVE_CATEGORIES.includes(o.category));}return;}
 if(kind==='director_disposition'){need(keys(result,'kind reviewedResultIds dispositions coverage outcome')&&exact(result.reviewedResultIds,ids)&&Array.isArray(result.dispositions)&&exact(result.dispositions.map(d=>d.itemRef),refs)&&keys(result.outcome,'kind itemRefs')&&['approve','return','needs_evidence','needs_human'].includes(result.outcome.kind)&&unique(result.outcome.itemRefs)&&result.outcome.itemRefs.every(x=>refs.includes(x)));coverage(result.coverage,phaseObligations(call,plan),pin);for(const d of result.dispositions){need(keys(d,'itemRef decision evidence reason targetIds duplicateOf')&&['uphold','dismiss','duplicate','unresolved'].includes(d.decision)&&text(d.reason)&&unique(d.targetIds)&&d.targetIds.every(id=>pin.returnTargets.some(t=>t.id===id)));evidence(d.evidence,pin,d.decision==='dismiss');need(d.decision==='duplicate'?refs.includes(d.duplicateOf)&&d.duplicateOf!==d.itemRef:d.duplicateOf===null);if(d.decision==='dismiss'){const item=items.find(i=>i.ref===d.itemRef).item;if(HARD_CATEGORIES.includes(item.category))need(d.evidence.length>0,'FINAL_HARD_PROOF_REQUIRED');}}
 for(const d of result.dispositions)if(d.decision==='duplicate'){const source=items.find(x=>x.ref===d.itemRef).item,target=items.find(x=>x.ref===d.duplicateOf).item,retained=result.dispositions.find(x=>x.itemRef===d.duplicateOf);need(retained.decision!=='duplicate'&&(!HARD_CATEGORIES.includes(source.category)||target.category===source.category&&equal(source.targetIds,target.targetIds)),'FINAL_HARD_PROOF_REQUIRED');}
 if(result.outcome.kind==='approve')need(!result.dispositions.some(d=>['uphold','unresolved'].includes(d.decision)&&HARD_CATEGORIES.includes(items.find(i=>i.ref===d.itemRef).item.category)),'FINAL_HARD_PROOF_REQUIRED');
 if(result.outcome.kind==='approve')need(result.coverage.every(x=>x.status==='checked')&&result.dispositions.every(d=>d.decision==='dismiss'||d.decision==='duplicate'||d.decision==='uphold'&&items.find(i=>i.ref===d.itemRef).item.effect==='advisory'),'FINAL_APPROVAL_BLOCKED');return;}
 if(kind==='intake_accept'){need(keys(result,'kind producerResultId basisHash checks')&&result.producerResultId===ids[0]&&result.basisHash===hash(pin.basis));coverage(result.checks,['producer_original','source','manuscript','editions','restrictions','routing'],pin);need(result.checks.every(x=>x.status==='checked'),'FINAL_HARD_PROOF_REQUIRED');return;}
 need(r.approval&&result.approvalId===r.approval.id,'FINAL_APPROVAL_REQUIRED');
 const proofs=editionProofs(plan.calls[0].payload.editions);
 if(kind==='final_handoff')need(keys(result,'kind approvalId basisHash editionProofs statement')&&result.basisHash===hash(pin.basis)&&equal(result.editionProofs,proofs)&&text(result.statement),'FINAL_HARD_PROOF_REQUIRED');
 else {need(keys(result,'kind producerResultId approvalId editionProofs checks')&&result.producerResultId===predecessors.find(x=>x.binding.callId==='owner:finalProducer')?.id&&equal(result.editionProofs,proofs),'FINAL_HARD_PROOF_REQUIRED');coverage(result.checks,['producer_original','delivery_bytes','inventory','native','editable','import','render'],pin);need(result.checks.every(x=>x.status==='checked'),'FINAL_HARD_PROOF_REQUIRED');}
}
export function editionProofs(editions){return editions.map(e=>({style:e.style,attemptId:e.originalAttemptId,anchor:e.anchor.sha256,manifest:e.layoutManifest.sha256,nativeInput:e.nativeInputDeck.sha256,delivery:e.deliveryDeck.sha256,pdf:e.pdf.sha256,renders:e.pages.map(p=>p.originalRender.sha256)}));}
export function validatePhaseOriginal(p,job,originals){
 const registered=p.jobs.filter(j=>j.id===job.id),pin=job.task.originalRequest,r=p.finalReviewReservations.find(r=>r.id===job.task.reservationId),setup=p.finalReviewSetups.find(s=>s.id===job.task.setupId),attempt=job.attempts[0],call=r?.calls.find(c=>c.id===job.task.id);
 need(registered.length===1&&equal(registered[0],job)&&r&&setup&&call&&job.attempts.length===1&&p.jobs.flatMap(j=>j.attempts??[]).filter(a=>a.id===attempt.id).length===1&&call.attemptId===attempt.id&&['charged','succeeded'].includes(call.status),'FINAL_CALL_UNREGISTERED');
 need(equal(phaseRequest(p,setup,r,attempt.id,attempt.executor,originals),pin),'FINAL_REQUEST_CHANGED');
 need(job.task.id===call.id&&job.task.setupId===setup.id&&job.task.planId===r.planId&&job.task.inputId===r.inputId&&pin.binding.callId===call.id&&pin.binding.reservationId===r.id&&pin.binding.setupId===setup.id&&pin.binding.planId===r.planId&&pin.binding.inputId===r.inputId&&equal(pin.binding.assignment,call.assignment)&&pin.binding.contextIdentity===call.contextIdentity&&equal(pin.binding.executor,attempt.executor)&&pin.binding.assignment.actorIdentity===attempt.executor.actorId,'FINAL_CALL_BINDING_CHANGED');
 need(job.binding.providerId===pin.binding.assignment.providerIdentity&&job.binding.model===pin.binding.assignment.modelIdentity&&attempt.dispatchStarted===true&&equal(job.task.contextIdentity,pin.binding.contextIdentity),'FINAL_CALL_BINDING_CHANGED');
 const codex=isFinalCodexProtocol(pin.adapterProtocol),transport=codex?validateFinalCodexOriginal({pin,originals}):null;
 if(codex)need(transport.outcome==='completed','FINAL_TERMINAL_INVALID');
 const response=(codex?decodeCodexJSON:decode)(originals.response,pin.responseLimit),receipt=codex?{protocol:pin.adapterProtocol,threadId:transport.threadId}:decode(originals.receipt,FINAL_CALL_LIMITS.receipt),events=codex?null:decode(originals.events,FINAL_CALL_LIMITS.events),plan=decode(originals.plan,FINAL_CALL_LIMITS.plan),packet=decode(originals.packet,FINAL_CALL_LIMITS.packet);

 need(keys(response,'protocol binding packetHash result')&&response.protocol==='final-phase-result-v2'&&equal(response.binding,pin.binding)&&response.packetHash===pin.originals.packet.sha256);
 need(codex||receipt.protocol==='local-final-call-test-v2','FINAL_ADAPTER_OPERATION_EVIDENCE_REQUIRED');
 const predecessors=packet.predecessorOriginals.map(x=>p.jobs.find(j=>j.finalCallResult?.id===x.resultId).finalCallResult);
 validatePhaseResult(response.result,pin,packet.call,plan,predecessors,r);
 const descriptors=codex?transport.descriptors:Object.fromEntries(Object.keys(FINAL_CALL_LIMITS).map(k=>[k,descriptor(originals[k])]));
 if(!codex){
 need(keys(receipt,'protocol binding packetHash responseHash responseBytes threadId terminal exitCode consumedAttachments')&&receipt.protocol==='local-final-call-test-v2'&&equal(receipt.binding,pin.binding)&&receipt.packetHash===pin.originals.packet.sha256&&receipt.responseHash===descriptors.response.sha256&&receipt.responseBytes===descriptors.response.bytes&&text(receipt.threadId)&&receipt.terminal==='completed'&&receipt.exitCode===0&&equal(receipt.consumedAttachments,pin.attachments),'FINAL_RECEIPT_INVALID');
 need(equal(events,[{kind:'started',threadId:receipt.threadId,contextIdentity:pin.binding.contextIdentity,attemptId:attempt.id},{kind:'completed',threadId:receipt.threadId,attemptId:attempt.id,responseHash:receipt.responseHash,exitCode:0}]),'FINAL_TERMINAL_INVALID');
 }
 assertFreshThread(p,job,attempt,receipt.threadId);
 const body={protocol:'final-call-settlement-v2',binding:pin.binding,originals:descriptors,report:response,semanticOutcome:response.result.kind,threadId:receipt.threadId,validationLevel:codex?'codex_original_bytes_verified':'constructed_local_protocol_only',...(codex?{requestedModel:transport.requestedModel,reportedModel:transport.reportedModel,eventVariant:transport.variant}:{})};
 const result={...body,id:hash(body),receipt:{providerId:job.binding.providerId,model:job.binding.model,role:job.binding.role,attemptId:attempt.id,protocol:receipt.protocol,originalReceiptHash:descriptors.receipt.sha256,threadId:receipt.threadId}};
 if(job.finalCallResult)need(equal(result,job.finalCallResult)&&call.status==='succeeded'&&call.resultId===result.id&&job.status==='succeeded'&&attempt.status==='succeeded'&&equal(job.receipt,result.receipt)&&equal(attempt.receipt,result.receipt),'FINAL_RESULT_CONFLICT');
 else need(call.status==='charged'&&job.status==='awaiting_reconciliation'&&attempt.status==='awaiting_reconciliation','FINAL_CALL_BINDING_CHANGED');
 return result;
}
export function assertFreshThread(p,job,attempt,threadId){need(!p.jobs.some(j=>j.id!==job.id&&[j.finalCallResult?.threadId,j.receipt?.threadId,j.receipt?.providerExecution?.threadId,j.finalCallFailure?.threadId].includes(threadId)||(j.attempts??[]).some(a=>a.id!==attempt.id&&[a.receipt?.threadId,a.receipt?.providerExecution?.threadId,a.observedThreadId].includes(threadId))),'FINAL_THREAD_REUSED');}
