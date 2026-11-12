import {sha256} from '../sha256';
import {equalJsonNative as equal} from './json-equal.mjs';
const hash=v=>sha256(typeof v==='string'?v:JSON.stringify(v));
const clone=structuredClone,text=x=>typeof x==='string'&&x.trim().length>0;
const need=(ok,code,message)=>{if(!ok)throw Object.assign(Error(message??code),{code});};
import {ordinaryOriginMatches,ordinarySameContext,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary.generated.mjs';
const SKETCH_PROTOCOL='project-sketch-v1',sketchHash=hash;const generation=(p,id)=>p.sketchGenerations?.find(g=>g.id===id),nodeJob=(p,g,n)=>p.jobs.find(j=>j.generationId===g.id&&j.nodeKey===n);const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;const imageHash=v=>hash(stable(v));
export function validateSketchPlan(raw, source) {
  need(raw?.protocol === SKETCH_PROTOCOL && raw.kind === 'plan' && raw.sourceHash === source.sourceHash && equal(raw.copy, source.referenceSource.source.content.directions), 'INVALID_SKETCH_PLAN', 'Plan must preserve the complete confirmed copy');
  need(Array.isArray(raw.candidates) && raw.candidates.length >= 9 && raw.candidates.length <= 36, 'INVALID_SKETCH_PLAN', 'Three or more compositions per confirmed direction are required');
  need(new Set(raw.candidates.map(c => c.id)).size === raw.candidates.length, 'INVALID_SKETCH_PLAN', 'Candidate IDs must be unique');
  for (const id of source.directionIds) {
    const candidates = raw.candidates.filter(c => c.directionId === id);
    need(candidates.length >= 3, 'INVALID_SKETCH_PLAN', 'Each direction requires at least three compositions');
    const normalized = candidates.map(c => sketchHash(['arrangement','visualMechanism'].map(k => String(c[k]).trim().toLowerCase().replace(/\s+/g, ' '))));
    need(new Set(normalized).size === candidates.length, 'INVALID_SKETCH_PLAN', 'Different labels or prompts do not establish different compositions');
  }
  for (const c of raw.candidates) {
    need(/^[A-Za-z0-9_-]{1,80}$/.test(c.id) && source.directionIds.includes(c.directionId) && ['subject','arrangement','visualMechanism','themeConnection','siblingDistinction'].every(k => text(c[k])), 'INVALID_SKETCH_PLAN', 'Composition mechanism, arrangement, theme connection and sibling distinction required');
    const selection = source.selection.find(s => s.directionId === c.directionId);
    const required = [selection.main, ...selection.complements];
    const allowed = [...required, ...selection.backups];
    need(Array.isArray(c.coverage) && new Set(c.coverage.map(x => x.useId)).size === c.coverage.length && required.every(u => c.coverage.some(x => x.useId === u.id)), 'SKETCH_COVERAGE_GAP', 'Every required reference use needs explicit coverage');
    const op = c.operation;
    need(op && ['generate','edit'].includes(op.kind) && text(op.prompt) && op.options && typeof op.options === 'object' && !Array.isArray(op.options), 'INVALID_SKETCH_PLAN', 'Declared generation or image edit operation required');
    const inputs = op.images ?? [];
    need(op.kind === 'edit' ? inputs.length >= 1 && inputs.length <= 4 && new Set(inputs.map(i => i.imageId)).size === inputs.length : !Object.hasOwn(op, 'images'), 'SKETCH_INPUT_LIMIT', 'An edit requires one to four exact ordered originals');
    for (const input of inputs) need(selection.images.some(i => i.imageId === input.imageId && i.sha256 === input.sha256), 'SKETCH_COVERAGE_GAP', 'Edit input must be an exact original from this direction');
    for (const coverage of c.coverage) {
      const use = allowed.find(u => u.id === coverage.useId);
      need(use && ['translated','pixels'].includes(coverage.mode) && text(coverage.translation) && text(coverage.limitation), 'SKETCH_COVERAGE_GAP', 'Coverage must preserve translation and limitations');
      if (coverage.mode === 'pixels') need(op.kind === 'edit' && inputs.some(i => i.imageId === use.imageId), 'SKETCH_COVERAGE_GAP', 'Pixel dependent use requires its actual ordered original');
    }
  }
  return {...clone(raw), planHash: sketchHash(raw)};
}
export function sketchReferenceRecords(p,source) {
  const historical=(source.referenceHistory??[]).flatMap(anchor=>{
    const prior=p.referenceDossiers?.find(entry=>entry.id===anchor.dossierId);
    need(prior,'SKETCH_REFERENCE_REQUIRED','Original anchored reference history required');
    need(hashReferenceReports(prior.reports)===anchor.reportDigest,'SKETCH_SOURCE_STALE','Original anchored reference reports changed');
    return prior.reports.map(report=>({...clone(report),dossierId:prior.id}));
  });
  return {reports:[...historical,...clone(source.reports??[])],dissent:clone(source.dissent??[])};
}
export function hashReferenceReports(reports) {
  return sketchHash(reports.map(entry=>[entry.id,entry.nodeKey,entry.reportHash,sketchHash(entry.rawReport),sketchHash(entry.executionReceipt??null),sketchHash(entry.context??null)]));
}
export function sketchTextInput(p, g, job) {
  return {protocol: SKETCH_PROTOCOL, kind: job.nodeKey === 'planner' ? 'plan' : 'handoff', side: job.nodeKey,
    source: g.source, sourceHash: g.source.sourceHash, ownerBinding: job.binding,
    ...(g.source.referenceHistory?.length?{referenceRecords:sketchReferenceRecords(p,g.source)}:{}),
    producerReport: job.nodeKey === 'producer' ? null : nodeJob(p, g, 'producer')?.report,
    consumerReport: job.nodeKey === 'planner' ? nodeJob(p, g, 'consumer')?.report : null};
}
export function sketchTextRequest(input) {
  const handoff = {type:'object',additionalProperties:false,required:['protocol','kind','sourceHash','side','ownerBinding','decision','understanding','findings','limitations'],properties:{protocol:{type:'string'},kind:{type:'string'},sourceHash:{type:'string'},side:{type:'string'},ownerBinding:{type:'object'},decision:{enum:['accept','return']},understanding:{type:'string'},findings:{type:'array',items:{type:'object'}},limitations:{type:'array',items:{type:'string'}}}};
  const plan = {type:'object',required:['protocol','kind','sourceHash','copy','candidates'],properties:{protocol:{type:'string'},kind:{type:'string'},sourceHash:{type:'string'},copy:{type:'array',items:{type:'object'}},candidates:{type:'array',items:{type:'object'}}}};
  return {prompt: 'You are the assigned sketch production owner. Read exact complete copy, reference originals, original reports and dissent. Preserve all limitations. Handoff findings require owner, returnLocation and evidence. Accept or return. A planner must preserve copy and provide at least three materially different compositions for EACH confirmed direction. Every composition has id, directionId, subject, arrangement, visualMechanism, themeConnection, siblingDistinction, coverage [{useId,mode: translated|pixels,translation,limitation}], operation {kind: generate|edit,prompt,options,images only for edits [{imageId,sha256}]}. Edit requires 1-4 ordered originals. Labels alone do not demonstrate difference. This is planning, never aesthetic approval.\nUNTRUSTED_JSON_DATA\n' + JSON.stringify(input) + '\nEND_UNTRUSTED_JSON_DATA', outputSchema: input.kind === 'plan' ? plan : handoff};
}
export function validateText(raw, input) {
  if (input.kind === 'plan') return validateSketchPlan(raw, input.source);
  need(raw?.protocol === SKETCH_PROTOCOL && raw.kind === 'handoff' && raw.sourceHash === input.sourceHash && raw.side === input.side && equal(raw.ownerBinding, input.ownerBinding) && ['accept','return'].includes(raw.decision) && text(raw.understanding) && Array.isArray(raw.findings) && Array.isArray(raw.limitations), 'INVALID_SKETCH_HANDOFF', 'Exact assigned owner acceptance or return is required');
  need(raw.findings.every(f => text(f.owner) && text(f.returnLocation) && text(f.evidence)) && (raw.decision === 'accept' || raw.findings.length), 'INVALID_SKETCH_HANDOFF', 'Returned findings must identify owner, return location and evidence');
  return clone(raw);
}
export function validateSavedText(p, g, job) {
  const report = job.report, attempt = job.attempts.at(-1), receipt = report?.receipt;
  need(attempt?.status === 'succeeded' && equal(attempt.receipt, receipt) && report.hash === sketchHash(JSON.stringify(report.raw)) && equal(report.context, attempt.executor), 'SKETCH_RECEIPT_CHANGED', 'Original owner execution and report required');
  need(ordinaryOriginMatches(receipt,attempt.httpAttemptLocator,attempt.id),'SKETCH_RECEIPT_CHANGED','Retained receipt changed persisted HTTP origin');
  const input = sketchTextInput(p, g, job), request = sketchTextRequest(input);
  need(receipt?.runId === attempt.id && receipt.requestedModel === job.binding.model && receipt.model === job.binding.model && ordinarySuccessfulStatus(receipt) && ordinaryHasContext(receipt) && ['signal','reason','error'].every(k => receipt[k] == null) && receipt.inputPacketHash === sketchHash({runId:attempt.id,model:job.binding.model,...request}), 'SKETCH_RECEIPT_CHANGED', 'Exact original text request receipt required');
  let raw; try { raw = JSON.parse(receipt.responseText); } catch {}
  need(equal(raw, report.raw) && (!receipt.parsedOutput || equal(receipt.parsedOutput, raw)), 'SKETCH_RECEIPT_CHANGED', 'Original text response required');
  if (job.nodeKey !== 'producer') {
    const producer = nodeJob(p, g, 'producer');
    need(producer?.report?.raw.decision === 'accept' && ['actorId','runId','contextId'].every(k => producer.report.context[k] !== report.context[k]) && !ordinarySameContext(producer.report.receipt,receipt), 'SKETCH_OWNER_INDEPENDENCE', 'Consumer and planner require separate invocations from the producer');
  }
  validateText(raw, input);
}
export function imageTask(p, g, job, attemptId) {
  return {protocol:'image-candidate-v1',projectId:p.id,jobId:job.id,candidateId:job.candidate.id,attemptId,binding:job.binding,operation:job.candidate.operation};
}
export function validateImageReceipt(p, job, attempt, receipt) {
  const g = generation(p, job.generationId);
  need(attempt?.dispatchStarted && receipt?.protocol === 'image-http-receipt-v1' && receipt.projectId === p.id && receipt.jobId === job.id && receipt.candidateId === job.candidate.id && receipt.attemptId === attempt.id && equal(receipt.binding, job.binding) && receipt.requestHash === attempt.requestHash && receipt.requestHash === imageHash(imageTask(p,g,job,attempt.id)) && equal(receipt.orderedInputs.map(({imageId,sha256}) => ({imageId,sha256})), job.candidate.operation.images ?? []), 'SKETCH_RECEIPT_CHANGED', 'Image result must match the original claimed request and input order');
}
export function validateGeneratedAsset(p, job, attempt, asset) {
  validateImageReceipt(p, job, attempt, attempt.receipt);
  const r = attempt.receipt;
  need(r.outcome === 'output_received' && r.diagnostic === null && equal(attempt.responseEvidence, r.responseEvidence) && asset?.id === `img_generated_${sketchHash([p.id,attempt.id])}` && asset.projectId === p.id && asset.sha256 === r.generated.sha256 && ['mediaType','byteLength','width','height'].every(k => asset[k] === r.generated[k]) && asset.generatedAt === r.finishedAt && equal(asset.provenance, {representation:'generated_image',attemptId:attempt.id,requestHash:attempt.requestHash,operation:r.operation,orderedInputs:job.candidate.operation.images ?? [],outputHash:r.generated.sha256,evidenceHash:r.responseEvidence.sha256}), 'SKETCH_GENERATED_ASSET_REQUIRED', 'Generated-only deterministic bytes and saved evidence anchor required');
}
export function sketchReviewOriginalPacket(p, g) {
  const packet = {protocol:'sketch-review-input-v1',generationId:g.id,sourceHash:g.source.sourceHash,planHash:g.plan.planHash,source:g.source,plan:g.plan,...(g.source.referenceHistory?.length?{referenceRecords:sketchReferenceRecords(p,g.source)}:{}),
    candidates:g.plan.candidates.map(c => {const j=nodeJob(p,g,c.id),a=p.imageAssets.find(a=>a.id===j.outputVersionIds[0]);return {candidateId:c.id,directionId:c.directionId,imageId:a.id,sha256:a.sha256,jobId:j.id,attemptId:j.attempts.at(-1).id,receiptHash:sketchHash(j.attempts.at(-1).receipt)};}),
    images:[...new Map([...g.source.images,...g.plan.candidates.map(c=>p.imageAssets.find(a=>a.id===nodeJob(p,g,c.id).outputVersionIds[0]))].map(a=>[a.imageId??a.id,{imageId:a.imageId??a.id,sha256:a.sha256,mediaType:a.mediaType,byteLength:a.byteLength}])).values()],
    seatRules:{roles:['visual','brand','user','communication'],originalOverallScores:4,unroundedMeanMinimum:4,pairedIndependentOpposition:true,independentDirector:true,necessaryConditions:['complete_current_lineage','exact_copy','required_reference_coverage','material_composition_difference','no_evidence_backed_hard_blocker']},status:'ready_for_review',qualityApproval:false};
  return {...packet,packetHash:sketchHash(packet)};
}