import {ordinaryOriginMatches,ordinarySuccessfulStatus,ordinaryHasContext,ordinarySameContext,ordinaryExecutionIdentity,ordinaryIdentitySameContext,isOrdinaryHttp,validOrdinaryHttpLocator} from './ordinary-model-claims.mjs';
import {requireReviewedSketchV2} from './sketch-review-v2.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {referenceState} from './reference-dossier.mjs';

export const SKETCH_PROTOCOL = 'project-sketch-v1';
export const SKETCH_PURPOSES = ['sketch_owner', 'sketch_plan', 'image_candidate', 'sketch_review_v2', 'sketch_refinement_handoff'];
export const sketchHash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function sketchRequire(ok, code, message) {
  if (!ok) throw Object.assign(new Error(message), {code});
}
const need = sketchRequire;
const text = value => typeof value === 'string' && value.trim().length > 0;
const sameLineage = (a,b) => ['actorId','runId','contextId'].some(k=>a[k]===b[k]) || (a.parentRunIds??[]).includes(b.runId) || (b.parentRunIds??[]).includes(a.runId) || (a.ancestorActorIds??[]).includes(b.actorId) || (b.ancestorActorIds??[]).includes(a.actorId);
const clone = structuredClone;
const generation = (p, id) => p.sketchGenerations?.find(g => g.id === id);
const nodeJob = (p, g, node) => p.jobs.find(j => j.generationId === g.id && j.nodeKey === node);
const unresolved = j => j.purpose === 'image_candidate' && j.attempts.some(a => a.dispatchStarted && a.status !== 'succeeded');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,stable(value[k])])) : value;
const imageHash = value => sketchHash(stable(value));
export const imageAllowanceUsed = p => p.jobs.filter(j => ['image_candidate','final_visual_image'].includes(j.purpose)).reduce((n, j) => n + j.attempts.filter(a => a.dispatchStarted).length, 0);
export function requireConfiguredImageAllowanceAdjustment(adjustment) {
  need(adjustment && ['priorOrigin','used','appliedBy'].every(key => !Object.hasOwn(adjustment,key)), 'IMAGE_ALLOWANCE_ADJUSTMENT_INVALID', 'Configured adjustments cannot contain executor audit fields');
}

export function sketchSource(p, d, state) {
  need(state.status === 'ready_for_sketch', 'SKETCH_REFERENCE_REQUIRED', 'A current authorized reference selection is required');
  const source = {
    protocol: SKETCH_PROTOCOL, projectId: p.id, dossierId: d.id,
    envelopeHash: d.envelope.envelopeHash, referenceSource: clone(d.envelope.source),
    directionIds: clone(d.envelope.directionIds), selection: clone(state.selection), selectionHash: state.selectionHash,
    selectionAuthority: {calibration: state.calibration, adoption: clone(d.adoptions.filter(a => a.selectionHash === state.selectionHash || a.editionHash === state.selectionHash)), ...(state.authority ? {authority: clone(state.authority)} : {}), ...(state.reviewStatus ? {reviewStatus:state.reviewStatus} : {})},
    reports: clone(d.reports), dissent: clone(state.dissent ?? []),
    images: [...new Map(state.selection.flatMap(s => s.images).map(i => [i.imageId, clone(i)])).values()],
  };
  need(source.directionIds.length === 3 && new Set(source.directionIds).size === 3, 'SKETCH_DIRECTIONS_REQUIRED', 'Exactly three confirmed copy directions are required');
  const historyCoverage=state.historyCoverage??state.humanChoice?.activeEdition?.coverage;
  if(d.priorChoiceHistory?.length) {
    source.referenceHistory=clone(d.priorChoiceHistory);
    source.historyCoverage=clone(historyCoverage);
    source.dissent=[...new Map([...source.dissent,...(historyCoverage?.obligations??[]).filter(item=>item.kind==='original_occurrence')].map(item=>[sketchHash(item),item])).values()];
  }
  return {...source, sourceHash: sketchHash(source)};
}

export function requireCurrentSketchGeneration(p, g, sourceEnvelope, {complete = false} = {}) {
  need(g, 'SKETCH_GENERATION_REQUIRED', 'Registered sketch generation required');
  const d = p.referenceDossiers?.find(d => d.id === g.source.dossierId);
  need(d, 'SKETCH_SOURCE_STALE', 'Reference dossier is missing');
  need(d===p.referenceDossiers.filter(x=>x.envelope.source.source?.artifactId===p.activeByStage.copy).at(-1),'SKETCH_SOURCE_STALE','Only the current copy latest reference dossier may supply sketch authority');
  const state = referenceState(p, d, {sourceEnvelope});
  need(state.status === 'ready_for_sketch' && equal(sketchSource(p, d, state), g.source), 'SKETCH_SOURCE_STALE', 'Task, complete copy, policy, reference evidence or adoption changed');
  need(p.activeByStage.copy === g.source.referenceSource.source.artifactId, 'SKETCH_SOURCE_STALE', 'Current complete copy required');
  need(['sketch','visual','content_review','layout','final_review'].includes(p.policies.at(-1).authorizedThrough), 'AUTHORIZATION_ENDPOINT', 'Sketch exceeds the authorized endpoint');
  for (const key of ['producer','consumer','planner']) {
    const job = nodeJob(p, g, key);
    if (!job) continue;
    need(equal(job.binding, g.bindings[key === 'producer' ? 'producer' : 'consumer']) && job.task.sourceHash === g.source.sourceHash, 'SKETCH_BINDING_CHANGED', 'Original owner assignment changed');
    if (job.status === 'succeeded') validateSavedText(p, g, job);
  }
  if (g.plan) {
    const planner = nodeJob(p, g, 'planner');
    need(planner?.status === 'succeeded' && equal(g.plan, validateSketchPlan(planner.report.raw, g.source)), 'SKETCH_PLAN_CHANGED', 'Plan must match the original successful planner');
    for (const candidate of g.plan.candidates) {
      const job = nodeJob(p, g, candidate.id);
      need(job && job.purpose === 'image_candidate' && equal(job.candidate, candidate) && equal(job.binding, g.bindings.image) && job.allowanceFamilyId === p.imageAllowance?.id, 'SKETCH_LINEAGE_CHANGED', 'Every planned candidate requires its original project job');
      if (job.status === 'succeeded') validateGeneratedAsset(p, job, job.attempts.at(-1), p.imageAssets.find(a => a.id === job.outputVersionIds[0]));
      if (complete) need(job.status === 'succeeded', 'SKETCH_INCOMPLETE', 'Every planned candidate must complete before review');
    }
  }
  if (complete) need(g.plan && !p.jobs.some(unresolved), 'SKETCH_UNRESOLVED', 'Unresolved image attempts prevent reviewed sketch authority');
  return g;
}

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
function hashReferenceReports(reports) {
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
function validateText(raw, input) {
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

export function sketchReviewPacket(p, g, sourceEnvelope) {
  requireCurrentSketchGeneration(p, g, sourceEnvelope, {complete:true});
  return sketchReviewOriginalPacket(p, g);
}
export function sketchReviewOriginalPacket(p, g) {
  const packet = {protocol:'sketch-review-input-v1',generationId:g.id,sourceHash:g.source.sourceHash,planHash:g.plan.planHash,source:g.source,plan:g.plan,...(g.source.referenceHistory?.length?{referenceRecords:sketchReferenceRecords(p,g.source)}:{}),
    candidates:g.plan.candidates.map(c => {const j=nodeJob(p,g,c.id),a=p.imageAssets.find(a=>a.id===j.outputVersionIds[0]);return {candidateId:c.id,directionId:c.directionId,imageId:a.id,sha256:a.sha256,jobId:j.id,attemptId:j.attempts.at(-1).id,receiptHash:sketchHash(j.attempts.at(-1).receipt)};}),
    images:[...new Map([...g.source.images,...g.plan.candidates.map(c=>p.imageAssets.find(a=>a.id===nodeJob(p,g,c.id).outputVersionIds[0]))].map(a=>[a.imageId??a.id,{imageId:a.imageId??a.id,sha256:a.sha256,mediaType:a.mediaType,byteLength:a.byteLength}])).values()],
    seatRules:{roles:['visual','brand','user','communication'],originalOverallScores:4,unroundedMeanMinimum:4,pairedIndependentOpposition:true,independentDirector:true,necessaryConditions:['complete_current_lineage','exact_copy','required_reference_coverage','material_composition_difference','no_evidence_backed_hard_blocker']},status:'ready_for_review',qualityApproval:false};
  return {...packet,packetHash:sketchHash(packet)};
}
export function sketchPanelRequest(packet, selected, record, reviews) {
  const phase=record.reviewType??'director',role=record.role??'director';
  const priorReports=phase==='score'?[]:phase==='opposition'?reviews.filter(r=>r.id===record.pairedReviewId):reviews.filter(r=>record.reviewIds.includes(r.id));
  const input={protocol:'sketch-panel-input-v1',packet,selected,phase,role,priorReports:priorReports.map(r=>({id:r.id,role:r.role,phase:r.reviewType,rawReport:r.rawReport}))};
  const request={images:packet.images,prompt:'Independently review the exact complete sketch candidate packet and selected originals. Preserve exact copy, reference limitations, original overall score, findings and necessary conditions. Do not treat synthetic fixtures as real quality or customer approval.\nUNTRUSTED_JSON_DATA\n'+JSON.stringify(input)+'\nEND_UNTRUSTED_JSON_DATA',outputSchema:{type:'object',required:['packetHash','selected','necessaryConditions'],properties:{packetHash:{type:'string'},selected:{type:'array'},necessaryConditions:{type:'array'},score:{type:'number'},verdict:{type:'string'},findings:{type:'array'},pairedReviewId:{type:'string'},decision:{type:'string'},outcome:{type:'string'},reviewIds:{type:'array'}}}};
  return {input,request};
}

export function requireReviewedSketch(p, artifact, sourceEnvelope, {phase = 'release'} = {}) {
  need(['registration','currentness','release'].includes(phase),'INVALID_SKETCH_PHASE','Explicit reviewed draft or release phase required');
  need(artifact?.stage === 'sketch' && artifact.provenance === 'reviewed_sketch_generation', 'REVIEWED_SKETCH_REQUIRED', 'Only a genuinely reviewed generation may supply a sketch');
  if(artifact.sketchGeneration?.protocol==='sketch-review-v2')return requireReviewedSketchV2(p,artifact,sourceEnvelope,{phase});
  const authority = artifact.sketchGeneration, g=generation(p,authority?.generationId), packet=sketchReviewPacket(p,g,sourceEnvelope);
  need(authority.sourceHash === packet.sourceHash && authority.planHash === packet.planHash && authority.packetHash === packet.packetHash && equal(artifact.inputVersionIds,[g.source.referenceSource.source.artifactId]), 'SKETCH_REVIEW_CHANGED', 'Reviewed sketch must bind the current source, plan and complete candidate packet');
  need(Array.isArray(authority.selected) && authority.selected.length===3 && new Set(authority.selected.map(s=>s.directionId)).size===3 && g.source.directionIds.every(d=>authority.selected.some(s=>s.directionId===d)) && authority.selected.every(s=>packet.candidates.some(c=>equal(c,s))), 'SKETCH_REVIEW_CHANGED', 'Exactly one original candidate per confirmed direction is required');
  const panel=p.panels.find(x=>x.id===authority.panelId && x.artifactId===artifact.id && x.generationId===g.id && x.packetHash===packet.packetHash);
  need(panel, 'SKETCH_REVIEW_REQUIRED', 'Original generation review panel required');
  const reviews=p.reviews.filter(r=>r.artifactId===artifact.id), scores=packet.seatRules.roles.map(role=>reviews.find(r=>r.role===role&&r.reviewType==='score'));
  const originals=[...scores,...scores.map(s=>reviews.find(r=>r.reviewType==='opposition'&&r.pairedReviewId===s?.id))];
  need(originals.every(Boolean) && scores.every(s=>Number.isFinite(s.score)&&s.score>=1&&s.score<=5) && scores.reduce((n,s)=>n+s.score,0)/4>=4, 'SKETCH_REVIEW_REQUIRED', 'Four original scores and independent paired opposition are required');
  const dispositions=p.decisions.filter(d=>authority.dispositionIds?.includes(d.id));
  need(dispositions.length===authority.dispositionIds?.length && dispositions.length>0 && originals.every(r=>dispositions.some(d=>d.reviewIds.includes(r.id))), 'SKETCH_REVIEW_REQUIRED', 'Original director dispositions must cover every review');
  const identities=[];
  for(const record of [...originals,...dispositions]) {
    const job=p.jobs.find(j=>j.id===record.jobId), attempt=job?.attempts.find(a=>a.id===record.attemptId), receipt=record.executionReceipt;
    const canonical=sketchPanelRequest(packet,authority.selected,record,reviews);
    need(job?.purpose==='sketch_review' && job.status==='succeeded' && attempt?.status==='succeeded' && equal(attempt.receipt,receipt) && equal(job.task.reviewInput,canonical.input)&&equal(job.task.request,canonical.request)&&equal(receipt.images,canonical.request.images)&&equal(record.context,attempt.executor)&&['actorId','runId','contextId'].every(k=>text(attempt.executor[k])) && job.outputVersionIds?.includes(record.id) && ordinaryHasContext(receipt) && ordinarySuccessfulStatus(receipt) && ['signal','reason','error'].every(k=>receipt[k]==null) && receipt.runId===attempt.id && receipt.model===job.binding.model && receipt.requestedModel===job.binding.model && receipt.inputPacketHash===sketchHash({runId:attempt.id,model:job.binding.model,...job.task.request}), 'SKETCH_REVIEW_REQUIRED', 'Review metadata cannot substitute for actual bound review executions');
    need(!identities.some(i=>sameLineage(i.context,attempt.executor)||ordinarySameContext(i.receipt,receipt)) && !p.jobs.filter(j=>j.generationId===g.id&&SKETCH_PURPOSES.includes(j.purpose)).some(j=>j.attempts.some(a=>sameLineage(a.executor,attempt.executor)||ordinarySameContext(a.receipt,receipt))), 'SKETCH_OWNER_INDEPENDENCE', 'Review and director executions must be independent from each other and production');
    const context=attempt.executor,allowedExposure=record.reviewType==='opposition'?[record.pairedReviewId]:record.reviewType==='score'?[]:record.reviewIds;
    need(context.inputPacketHash===receipt.inputPacketHash&&['parentRunIds','ancestorActorIds','exposedReviewIds','authorRecommendations','priorScores'].every(k=>Array.isArray(context[k]))&&context.exposedReviewIds.every(id=>allowedExposure.includes(id))&&!context.authorRecommendations.length&&!context.priorScores.length,'SKETCH_REVIEW_EXPOSURE','Captured independent review lineage and phase-specific exposure are required');
    let raw;try{raw=JSON.parse(receipt.responseText);}catch{}
    need(equal(raw,record.rawReport) && (!receipt.parsedOutput||equal(receipt.parsedOutput,raw)) && raw?.packetHash===packet.packetHash && equal(raw.selected,authority.selected) && raw.necessaryConditions?.every(c=>c.status==='pass') && packet.seatRules.necessaryConditions.every(k=>raw.necessaryConditions?.some(c=>c.name===k&&c.status==='pass')), 'SKETCH_REVIEW_REQUIRED', 'Actual original review response and necessary conditions required');
    if(record.reviewType)need(equal(raw.findings,record.findings)&&raw.verdict===record.verdict,'SKETCH_REVIEW_REQUIRED','Original findings and verdict must remain intact');
    if(record.reviewType==='score')need(raw.score===record.score&&raw.verdict===record.verdict&&panel.seats?.some(s=>s.role===record.role&&['actorId','runId','contextId'].every(k=>s[k]===attempt.executor[k])),'SKETCH_REVIEW_REQUIRED','Original assigned overall score and verdict cannot change');
    if(record.reviewType==='opposition')need(raw.pairedReviewId===record.pairedReviewId,'SKETCH_REVIEW_REQUIRED','Original paired opposition cannot change');
    if(record.outcome)need(raw.decision==='accept'&&raw.outcome===record.outcome&&equal(raw.reviewIds,record.reviewIds),'SKETCH_REVIEW_REQUIRED','Original director disposition cannot change');
    identities.push({context:attempt.executor,receipt});
  }
  if(phase==='release'&&p.policies.at(-1).humanGates.includes('sketch'))need(p.decisions.some(d=>d.human&&d.artifactId===artifact.id&&d.kind==='adopt-creative'&&d.outcome==='adopt_creative'&&d.policyVersion===p.policies.at(-1).version&&equal(d.sketchGeneration,authority)), 'HUMAN_GATE', 'Exact selected sketch human gate is required');
  return g;
}

function addSketchJob(p,g,nodeKey,candidate) {
    const id=`sketch-${sketchHash([g.id,nodeKey])}`;
    p.jobs.push({id,generationId:g.id,nodeKey:nodeKey,stage:'sketch',purpose:candidate?'image_candidate':nodeKey==='planner'?'sketch_plan':'sketch_owner',inputVersionIds:[g.source.referenceSource.source.artifactId],binding:clone(candidate?g.bindings.image:g.bindings[nodeKey==='producer'?'producer':'consumer']),task:{id,parentId:g.id,owner:nodeKey,sourceHash:g.source.sourceHash},...(candidate?{candidate:clone(candidate),allowanceFamilyId:g.allowanceFamilyId}:{}),status:'queued',attempts:[]});
}

export function reduceSketchCommand(p, c, context, sourceEnvelope) {
  need(context.actorType === 'agent', 'SKETCH_TRUSTED_RUNTIME_REQUIRED', 'Sketch transitions require the trusted executor');
  if(c.kind==='adjust-project-image-allowance') {
    const a=c.adjustment,current=p.imageAllowance;
    requireConfiguredImageAllowanceAdjustment(a);
    need(current&&text(a?.id)&&a.familyId===current.id&&text(a.authority)&&text(a.reason)&&text(a.origin)&&text(a.configurationVersion),'IMAGE_ALLOWANCE_ADJUSTMENT_INVALID','Explicit trusted local family, authority, reason and configuration required');
    need(equal(a.before,{maxCalls:current.maxCalls,configurationVersion:current.configurationVersion})&&Number.isSafeInteger(a.maxCalls)&&a.maxCalls>current.maxCalls&&a.configurationVersion!==current.configurationVersion,'IMAGE_ALLOWANCE_ADJUSTMENT_STALE','Exact prior version and a finite larger new limit required');
    need(!(current.adjustments??[]).some(x=>x.id===a.id),'IMAGE_ALLOWANCE_ADJUSTMENT_EXISTS','Adjustment identity cannot be reused');
    current.adjustments??=[];current.adjustments.push({...clone(a),priorOrigin:current.origin,used:imageAllowanceUsed(p),appliedBy:clone(context)});
    current.maxCalls=a.maxCalls;current.configurationVersion=a.configurationVersion;current.origin=a.origin;return;
  }
  p.sketchGenerations ??= []; p.sketchIntents ??= [];
  if(c.kind==='request-sketch-continuation') {p.sketchIntents.push({id:c.commandId,request:clone(c.request)});return;}
  if(c.kind==='open-sketch-generation') {
    const g=clone(c.generation);
    requireCurrentSketchGeneration(p,g,sourceEnvelope);
    need(!p.sketchGenerations.some(x=>x.id===g.id||x.source.sourceHash===g.source.sourceHash) && !p.jobs.some(unresolved), 'SKETCH_UNRESOLVED', 'An unresolved image call or existing source cannot be replaced by a new generation');
    need(c.allowance && Number.isSafeInteger(c.allowance.maxCalls)&&c.allowance.maxCalls>0&&text(c.allowance.origin)&&text(c.allowance.configurationVersion), 'IMAGE_ALLOWANCE_UNAVAILABLE', 'Finite trusted invocation configuration required');
    p.imageAllowance ??= clone(c.allowance);
    need(equal(g.allowanceFamilyId,p.imageAllowance.id),'IMAGE_ALLOWANCE_CHANGED','Every generation must retain the original project allowance family');
    p.sketchGenerations.push(g);return;
  }
  const g=generation(p,c.generationId??p.jobs.find(j=>j.id===c.jobId)?.generationId);
  if(c.kind==='register-reviewed-sketch') {
    requireReviewedSketch(p,c.artifact,sourceEnvelope,{phase:'registration'});
    need(!p.artifacts.some(a=>a.id===c.artifact.id), 'SKETCH_REVIEW_CHANGED', 'Reviewed artifact identity already exists');
    p.artifacts.push(clone(c.artifact));p.activeByStage.sketch=c.artifact.id;return;
  }
  if(c.kind==='queue-sketch-node') {
    requireCurrentSketchGeneration(p,g,sourceEnvelope);
    need(!nodeJob(p,g,c.nodeKey),'SKETCH_JOB_EXISTS','Each frozen node has one original job');
    const candidate=g.plan?.candidates.find(x=>x.id===c.nodeKey);
    need(['producer','consumer','planner'].includes(c.nodeKey)||candidate,'INVALID_SKETCH_NODE','Known sketch node required');
    if(c.nodeKey!=='producer')need(nodeJob(p,g,'producer')?.report?.raw.decision==='accept','SKETCH_HANDOFF_REQUIRED','Producer must accept first');
    if(c.nodeKey==='planner'||candidate)need(nodeJob(p,g,'consumer')?.report?.raw.decision==='accept','SKETCH_HANDOFF_REQUIRED','Consumer must accept before planning');
    addSketchJob(p,g,c.nodeKey,candidate);return;
  }
  const job=p.jobs.find(j=>j.id===c.jobId),attempt=job?.attempts.at(-1);
  need(job && SKETCH_PURPOSES.includes(job.purpose), 'INVALID_SKETCH_JOB', 'Original sketch job required');
  if(c.kind==='claim-sketch-job') {
    requireCurrentSketchGeneration(p,g,sourceEnvelope);
    need(text(c.attemptId)&&!p.jobs.some(j=>j.attempts.some(a=>a.id===c.attemptId)),'SKETCH_ATTEMPT_REQUIRED','Each execution requires a globally unique project attempt');
    need(job.status==='queued'&&job.attempts.length===0,'SKETCH_ALREADY_CLAIMED','One execution per frozen job is allowed');
    if(job.purpose==='image_candidate') {
      need(c.requestHash===imageHash(imageTask(p,g,job,c.attemptId)), 'SKETCH_RECEIPT_CHANGED','Prepared request must match original candidate');
      need(imageAllowanceUsed(p)<p.imageAllowance.maxCalls,'IMAGE_ALLOWANCE_EXHAUSTED','Cumulative project invocation allowance exhausted');
    }
    job.attempts.push({id:c.attemptId,executor:clone(context),status:'running',dispatchStarted:true,...(job.purpose==='image_candidate'?{requestHash:c.requestHash,allowanceFamilyId:p.imageAllowance.id}:{}),startedAt:context.now??null});job.status='running';job.attemptId=c.attemptId;return;
  }
  need(attempt?.id===c.attemptId,'SKETCH_ATTEMPT_REQUIRED','Original attempt required');
  if(c.kind==='complete-image-candidate'&&job.status==='succeeded'){validateGeneratedAsset(p,job,attempt,c.asset);need(equal(p.imageAssets.find(a=>a.id===c.asset.id),c.asset),'SKETCH_GENERATED_ASSET_REQUIRED','Completed generated asset changed');return;}
  const recovering=c.kind==='complete-image-candidate'&&attempt.responseEvidence||c.kind==='complete-sketch-text'&&isOrdinaryHttp(attempt.receipt)&&equal(attempt.receipt,c.receipt);
  need((job.status==='running'||recovering&&job.status==='awaiting_reconciliation')&&(recovering||equal(attempt.executor,context)), 'SKETCH_ALREADY_CLAIMED','Only the original claiming executor may finish');
  if(c.kind==='finish-sketch-error') {attempt.status='awaiting_reconciliation';job.status=attempt.status;job.error=clone(c.error);attempt.error=clone(c.error);if(c.receipt)attempt.receipt=clone(c.receipt);return;}
  if(c.kind==='complete-sketch-text') {
    requireCurrentSketchGeneration(p,g,sourceEnvelope);
    validateText(c.raw,sketchTextInput(p,g,job));
    job.report={raw:clone(c.raw),hash:sketchHash(JSON.stringify(c.raw)),payloadRef:c.payloadRef,receipt:clone(c.receipt),context:clone(recovering?attempt.executor:context)};attempt.receipt=clone(c.receipt);attempt.status='succeeded';job.status='succeeded';job.outputVersionIds=[`${job.id}:report`];validateSavedText(p,g,job);
    if(job.nodeKey==='planner') {
      g.plan=validateSketchPlan(c.raw,g.source);
      for(const candidate of g.plan.candidates)addSketchJob(p,g,candidate.id,candidate);
    }
    return;
  }
  if(c.kind==='anchor-image-response') {
    validateImageReceipt(p,job,attempt,c.receipt);
    need(c.receipt.outcome==='output_received' && c.receipt.responseEvidence?.protocol==='image-http-v1' && /^[a-f0-9]{64}$/.test(c.receipt.responseEvidence.sha256), 'SKETCH_ANCHOR_REQUIRED','Verified provider success anchor required before ingestion');
    need(!attempt.responseEvidence || equal(attempt.receipt,c.receipt),'SKETCH_ANCHOR_CHANGED','Saved anchor is immutable');
    attempt.receipt=clone(c.receipt);attempt.responseEvidence=clone(c.receipt.responseEvidence);return;
  }
  need(c.kind==='complete-image-candidate','INVALID_SKETCH_COMMAND','Known sketch transition required');
  validateGeneratedAsset(p,job,attempt,c.asset);
  const old=p.imageAssets.find(a=>a.id===c.asset.id);need(!old||equal(old,c.asset),'SKETCH_GENERATED_ASSET_REQUIRED','Generated asset identity cannot change');
  if(!old)p.imageAssets.push(clone(c.asset));
  attempt.status='succeeded';job.status='succeeded';job.outputVersionIds=[c.asset.id];delete job.error;
}
