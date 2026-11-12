import {reduceVisualBStep,reduceVisualBIntent,reduceVisualBAdvance,reduceVisualBRevisionCompleted,requireVisualBNoPending,requireVisualBClaim} from './visual-b-http.mjs';
import {reduceVisualStep,reduceVisualIntent,requireVisualClaim,reduceVisualAdvance,requireVisualNoPending} from './visual-a-http.mjs';
import {copyHttpJobs,reduceCopyHttp,requireCopyHttpJob,reduceCopyAdvance,requireCopyNativeAdmission} from './simple-copy-http.mjs';
import {reduceSimpleHttp,requireSimpleHttpJob} from './simple-strategy-http.mjs';
import {requireAcquisitionHttpJob} from './research-acquisition.mjs';
import {SIMPLE_STRATEGY_VERSION,createSimpleStrategyBasis} from './seven-stage-strategy.mjs';
import {researchReaderEvidence,validateStoredResearchReader} from './research-reader-state.mjs';
import {buildResearchReaderRequest,validateResearchReaderOutput} from './research-reader-loop.mjs';
import {RESEARCH_READER_COMMANDS,reduceResearchReaderCommand,researchReaderTarget,researchQuestionRegistration} from './research-reader-state.mjs';
export {researchReaderTarget,researchQuestionRegistration} from './research-reader-state.mjs';
import {createWorkflow, assertWorkflowStage, requireResearchWorkflow} from './seven-stage-workflow.mjs';
import {researchMethodIdentity, applyResearchMethod} from './research-method.mjs';
import {layoutCommandWitness,layoutWitnessMatches} from './layout-command-witness.mjs';
import {splitExecutionCommand,validateSplitExecution} from './readiness-split-runtime.mjs';
import {currentCapturedTextSources} from './captured-text-evidence.mjs';
import {validateTerminalFailureWitness,terminalFailureResolution,terminalDiagnosticPlan,validateTerminalDiagnostic} from './readiness-terminal-failure.mjs';
import {REGISTERED_EVIDENCE_ENRICHMENT,EVIDENCE_ENRICHMENT_MODE,validateEvidenceEnrichment} from './evidence-enrichment.mjs';
import {semanticConfiguration,transferSemanticReader,SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
import {buildSemanticInput,buildSemanticRequest,validateSemanticOutput,semanticBasis} from './research-semantic-review.mjs';
import {requireContentCommitAdmission} from './content-resource-policy.mjs';
import {ordinaryOriginMatches,ordinarySuccessfulStatus,ordinaryHasContext,ordinarySameContext,ordinaryExecutionIdentity,ordinaryIdentitySameContext,isOrdinaryHttp,validOrdinaryHttpLocator} from './ordinary-model-claims.mjs';
import {ACQUISITION_COMMANDS,ACQUISITION_PURPOSES,reduceAcquisition,resolveAcquisition} from './research-acquisition.mjs';
import {RESEARCH_DATA_VERSION,researchDataBasis,requireResearchDataBasis,validateResearchChartCandidate,researchChartMetadata} from './research-chart-data.mjs';
import {NUMERICAL_REVIEW_PROTOCOL,evidenceProtocolCapabilities} from './evidence-protocols.mjs';
import {INTAKE_COMMANDS,reduceIntake} from './intake-domain.mjs';
import {STRATEGY_CONTRACT_VERSION,requireStrategyInputs} from './strategy-contract.mjs';
import {registerSource} from './research-sources.mjs';
import {reduceFinalContinuation} from './final-review-continuation.mjs';
import {finalCommandWitness} from './final-review-command-witness.mjs';
import {NATIVE_COMMANDS,reduceNativeLayout} from './layout-native-domain.mjs';
import {FINAL_AUTHORITY_COMMANDS,reduceFinalAuthority,enforceFinalCallCeiling,finalReviewMetadataBasis} from './final-review-authority.mjs';
import {reduceLayoutPreparation,LAYOUT_PURPOSE,LATER_FINAL_RESPONSIBILITIES} from './layout-boundary.mjs';
import {reduceCompleteContent,requireCompleteContent,makeContentSource} from './complete-content.mjs';
import {reduceFinalVisual,requireFinalVisual,FINAL_VISUAL_PURPOSES} from './final-visual.mjs';
import {reduceSketchReview,requireSketchRefinement,requireReviewedSketchV2,REVIEW_PROTOCOL} from './sketch-review-v2.mjs';
import {reduceSketchCommand,requireReviewedSketch,SKETCH_PURPOSES} from './sketch-authority.mjs';
import {reduceReferenceCommand,referenceJobCurrent,referenceContext,referenceState,referenceCorrectionSources,referenceOwnersAccepted,REFERENCE_DOSSIER_PROTOCOL} from './reference-dossier.mjs';
import {validateSavedReadinessProof,savedReadinessReceipt} from './readiness-claims.mjs';
import {APPLICABILITY_PROTOCOL,APPLICABILITY_HANDLING,APPLICABILITY_GATE,applicabilityContext,applicabilityHash} from './research-applicability.mjs';
import {OWNER_EDGE_PROTOCOL,ownerHash,buildOwnerRequest,validateOwnerOutput,ownerRestrictions} from './owner-edge.mjs';
import {LATEST_CORRECTION_PROTOCOL,COMPLETE_CORRECTION_REVIEW_PROTOCOL,requireEvidenceProjection,evidenceHash,validateHandlingContext,evidenceRecords,evidenceVisualRecords} from './correction-evidence.mjs';
import {CORRECTION_PROTOCOL,CORRECTION_REVIEW_PROTOCOL,correctionHash,correctionSources,correctionConstraintManifest,correctionFeedback,correctionFindingCreative,requireCorrectionAction,validateCorrectionInput,validateRevisionResponses,buildCorrectionReviewRequest,validateCorrectionReviewOutput} from './correction.mjs';
import {STRATEGY_CREATIVE_PROTOCOL,COPY_CREATIVE_PROTOCOL,creativePlan,creativeHash,creativeNodeInput,buildCreativeRequest,validateCreativeOutput,creativeDecision,creativeIssues} from './creative-panel.mjs';
import {feedbackHash, validateRevisionInput, validateFeedbackResponses, buildFeedbackReviewRequest, validateFeedbackReviewOutput} from './human-feedback.mjs';
import {buildCaseIdentityRequest,validateCaseIdentityOutput,buildCaseEvidenceRecord} from './case-identity.mjs';
import {buildVisualCatalogue, validateVisualCatalogue} from './visual-catalogue.mjs';
import {buildImageObservationReviewRequest, validateImageObservationReviewOutput, buildAcceptedImageFeatureCatalogue} from './image-observation-review.mjs';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {buildEvidenceReviewRequest, validateEvidenceReviewOutput, evidenceReviewProtocol, validateCatalogueState, evidenceStateHash,evidenceClaimManifest} from './evidence-review.mjs';
import {buildResearchReadinessRequest, validateResearchReadinessOutput, RESEARCH_EVIDENCE_LINK_POLICY} from './research-readiness.mjs';
import {DECLARATION_HANDOFF_PROTOCOL,APPLICABILITY_HANDOFF_PROTOCOL,buildResearchHandoffRequest, validateResearchHandoffOutput} from './research-handoff.mjs';
import {buildImageObservationRequest, imageManifest, validateImageObservationOutput, IMAGE_LIMITS} from './image-evidence.mjs';
import {RESEARCH_REVISION_STAGE_PROTOCOL,COPY_CONTRACT_VERSION,buildStageRequest,validateStageOutput} from './stage-content.mjs';

/** Pure workflow metadata engine. A trusted runtime must issue contexts and authorize commands.
 * Lineage checks validate supplied metadata, never prove a real independent invocation.
 */
export const STAGES = Object.freeze({
  research: [], strategy: ['research'], copy: ['strategy'], references: ['copy'],
  sketch: ['references'], visual: ['sketch'], content_review: ['strategy', 'copy', 'visual'],
  layout: ['content_review', 'copy', 'visual'], final_review: ['layout', 'content_review'],
});
export const REVIEW_ROLES = Object.freeze({strategy: ['strategy'], copy: ['copy', 'brand', 'user', 'communication'], references: ['visual', 'brand', 'user', 'communication'], sketch: ['visual', 'brand', 'user', 'communication'], visual: ['visual', 'brand', 'user', 'communication'], content_review: ['content'], final_review: [...LATER_FINAL_RESPONSIBILITIES]});
export class DomainError extends Error {
  constructor(code, message) { super(message); this.name = 'DomainError'; this.code = code; }
}
const fail = (code, message) => { throw new DomainError(code, message); };
const requireValue = (value, code, message) => { if (!value) fail(code, message); };
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const sameExecutor = (a, b) => ['actorId', 'runId', 'contextId'].every(key => a[key] === b[key]);
const intersectsLineage = (a, b) => ['actorId', 'runId', 'contextId'].some(key => a[key] === b[key])
  || (a.parentRunIds ?? []).includes(b.runId) || (b.parentRunIds ?? []).includes(a.runId)
  || (a.ancestorActorIds ?? []).includes(b.actorId) || (b.ancestorActorIds ?? []).includes(a.actorId);
function runningAttempt(job, command, context) {
  requireValue(job?.status === 'running', 'INVALID_JOB', 'Running job required');
  const attempt = job.attempts.at(-1);
  requireValue(command.attemptId === attempt.id, 'ATTEMPT_MISMATCH', 'Current attempt required');
  requireValue(sameExecutor(attempt.executor, context), 'WRONG_EXECUTOR', 'Only the claiming executor may finish this attempt');
  return attempt;
}
function checkReceipt(job, attempt, receipt) {
  requireValue(ordinaryOriginMatches(receipt,attempt.httpAttemptLocator,attempt.id),'INVALID_EXECUTION_RECEIPT','Retained receipt changed persisted HTTP origin');
  requireValue(receipt && receipt.attemptId === attempt.id && receipt.providerId === job.binding.providerId && receipt.model === job.binding.model && receipt.role === job.binding.role && receipt.taskId === job.task.id, 'INVALID_EXECUTION_RECEIPT', 'Receipt must identify the bound provider, model, role, task and attempt');
}
const human = context => requireValue(context.actorType === 'human', 'HUMAN_REQUIRED', 'A human decision is required');
const identity = context => requireValue(context?.actorId && context?.runId && context?.contextId, 'CONTEXT_REQUIRED', 'Actor, run and context IDs are required');
function policy(mode = 'assisted', humanGates, version = 1, authorizedThrough = 'final_review') {
  requireValue(['auto', 'assisted'].includes(mode), 'INVALID_MODE', 'Mode must be auto or assisted');
  const gates = humanGates ?? (mode === 'assisted' ? ['references'] : []);
  requireValue(Array.isArray(gates) && gates.every(s => Object.hasOwn(STAGES, s)), 'INVALID_GATES', 'Unknown human gate');
  requireValue(Object.hasOwn(STAGES, authorizedThrough), 'INVALID_ENDPOINT', 'Known authorization endpoint required');
  return {version, mode, authorizedThrough, humanGates: [...new Set(gates)]};
}
export function createProject({id, name, brief, mode, humanGates, authorizedThrough, workflowVersion}, context) {
  identity(context);
  requireValue(id && name && brief, 'INVALID_PROJECT', 'ID, name and brief are required');
  if(workflowVersion!==undefined){createWorkflow(workflowVersion);requireValue(authorizedThrough===undefined||Object.hasOwn(STAGES,authorizedThrough),'SEVEN_STAGE_AUTHORIZATION_REQUIRED','Only research execution is currently supported');requireValue(humanGates===undefined||Array.isArray(humanGates)&&humanGates.every(stage=>['strategy','copy','visual','final_review'].includes(stage)),'INVALID_GATES','Current seven-stage manual gates required');}
  return freeze({id, name, ...(workflowVersion===undefined?{}:{workflow:createWorkflow(workflowVersion)}), revision: 0, taskCards: [{id: `${id}:scope:1`, brief, createdBy: context.actorId}],
    activeTaskCardId: `${id}:scope:1`, confirmations: [], visualAuthorizations: [], policies: [policy(mode, workflowVersion===undefined?humanGates:humanGates??[], 1, workflowVersion===undefined?authorizedThrough:authorizedThrough??'research')],
    jobs: [], humanFeedback: [], feedbackReviews: [], sourceCaptures: [], sourceEntries: [], caseIdentityReviews: [], imageAssets: [], imageObservations: [], observationReviews: [], artifacts: [], verifications: [], readinessReports: [], readinessResolutions: [], handoffReports: [], panels: [], reviews: [], decisions: [], acknowledgments: [], releases: [], activeByStage: {}, audit: [], processedCommands: {}});
}
const currentPolicy = p => p.policies.at(-1);
const artifact = (p, id) => p.artifacts.find(a => a.id === id);
function successfulEvaluation(evaluation, p, operation, key, compute) {
 if (p === null || (typeof p !== 'object' && typeof p !== 'function')) return compute();
 let project = evaluation.get(p);
 if (!project) {
  project = {validateStoredHandoff: new Map(), validatedResearchAssessment: new Map(), ownerEdgeCurrent: new Map(), creativeTarget: new Map()};
  evaluation.set(p, project);
 }
 const results = project[operation];
 if (results.has(key)) return results.get(key);
 const result = compute();
 results.set(key, result);
 return result;
}

function freshWithin(evaluation, p, id, seen = new Set()) {
  if (id === p.activeTaskCardId) return true;
  const a = artifact(p, id);
  if (!a || seen.has(id) || p.activeByStage[a.stage] !== id) return false;
  if(a.stage==='content_review'){try{requireCompleteContent(p,a,(p, contents, options) => contentSourceEnvelopeWithin(evaluation, p, contents, options),{phase:'currentness'});}catch{return false;}}
  if(a.stage==='visual'){try{requireFinalVisual(p,a,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding),{phase:'currentness'});}catch{return false;}}
  if(a.stage==='sketch'){try{requireReviewedSketch(p,a,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding),{phase:'currentness'});}catch{return false;}}
  seen.add(id);
  return a.inputVersionIds.every(input => freshWithin(evaluation, p, input, new Set(seen)));
}
function releasedWithin(evaluation, p, id) {
  if(['layout','final_review'].includes(artifact(p,id)?.stage))return false;
  if (!freshWithin(evaluation, p, id) || !p.releases.some(r => r.artifactId === id && r.policyVersion === currentPolicy(p).version)) return false;
  try { eligibleWithin(evaluation, p, artifact(p, id)); if(usesResearchOperatorWorkflow(p)&&artifact(p,id).stage==='research'&&artifact(p,id).provenance==='provider_execution')requireResearchOperatorReleaseWithin(evaluation, p,artifact(p,id)); return true; } catch { return false; }
}
function handoffReadyWithin(evaluation, p, id, nextStage) {
  const a = artifact(p, id);
  if (a?.stage === 'research' && a.provenance === 'provider_execution') {
    if (nextStage !== 'strategy') return false;
    try { requireResearchHandoffWithin(evaluation, p, a); return true; } catch { return false; }
  }
  if(a?.stage==='strategy'&&a.provenance==='provider_execution'){try{requireStrategyOwnersWithin(evaluation, p,a);return nextStage==='copy';}catch{return false;}}
  if(a?.stage==='copy'&&a.provenance==='provider_execution'){try{referenceOwnersAccepted(p,a,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding));return nextStage==='references';}catch{return false;}}
  return ['producer', 'consumer'].every(side => p.acknowledgments.some(a => a.artifactId === id && a.nextStage === nextStage && a.side === side));
}
function inputsForWithin(evaluation, p, stage, binding) {
  assertWorkflowStage(p,stage);
  requireValue(!['content_review','layout','final_review'].includes(stage),'CONTENT_DEDICATED_ROUTE_REQUIRED','Complete proposal and layout require dedicated immutable content contracts');
  requireValue(stage!=='sketch','REVIEWED_SKETCH_REQUIRED','Sketch requires the dedicated reviewed generation authority');
  requireValue(Object.keys(STAGES).indexOf(stage) <= Object.keys(STAGES).indexOf(currentPolicy(p).authorizedThrough), 'AUTHORIZATION_ENDPOINT', 'Stage exceeds authorized endpoint');
  if (stage === 'research') {
    requireValue(p.confirmations.some(c => c.taskCardId === p.activeTaskCardId), 'SCOPE_UNCONFIRMED', 'Confirm the active task card before research');
    return [p.activeTaskCardId];
  }
  if(stage==='copy'&&binding){const edge=requireStrategyOwnersWithin(evaluation, p,artifact(p,p.activeByStage.strategy));requireValue(isDeepStrictEqual(edge.envelope.consumerBinding,binding),'OWNER_BINDING_CHANGED','Copy owner binding changed');}
  const inputs = STAGES[stage].map(dependency => {
    const id = p.activeByStage[dependency];
    if (binding && dependency === 'copy') {
      const copy = artifact(p, id);
      requireValue(copy?.copyContract?.version === COPY_CONTRACT_VERSION && copy.copyContract.status === 'complete' && copy.copyContract.contentHash === copy.contentHash, 'COPY_MESSAGE_INCOMPLETE', 'Provider downstream production requires a validated complete copy message');
    }
    requireValue(id && releasedWithin(evaluation, p, id), 'DEPENDENCY_BLOCKED', `${dependency} needs current released output`);
    requireValue(handoffReadyWithin(evaluation, p, id, stage), 'HANDOFF_REQUIRED', 'Both owners must accept this consuming edge');
    if (stage === 'strategy' && binding && artifact(p, id)?.provenance === 'provider_execution') {
      const consumer = (p.handoffReports ?? []).filter(report => report.artifactId === id && report.side === 'consumer').at(-1);
      requireValue(isDeepStrictEqual(consumer?.rawReport?.ownerBinding, binding), 'HANDOFF_REQUIRED', 'Assigned strategy owner must accept the research');
      if(usesResearchOperatorWorkflow(p))requireValue(isDeepStrictEqual(requireResearchOperatorPairWithin(evaluation, p,artifact(p,id)).consumer.consumerBinding,binding),'MODEL_BINDING_MISMATCH','Accepted declaration owner must produce strategy');
    }
    return id;
  });
  if(stage==='references'&&binding)fail('REFERENCE_DOSSIER_REQUIRED','Reference production requires the dedicated authoritative dossier');
  if(stage==='visual'&&artifact(p,inputs[0])?.sketchGeneration?.protocol===REVIEW_PROTOCOL){try{requireSketchRefinement(p,artifact(p,inputs[0]),(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding));}catch(error){fail(error.code??'REVIEW_HANDOFF_REQUIRED',error.message);}}
  if (stage === 'visual' && currentPolicy(p).humanGates.includes('sketch')) requireValue(p.visualAuthorizations.some(a => a.sketchArtifactId === inputs[0]), 'VISUAL_AUTHORIZATION_REQUIRED', 'Human drawing authorization must match the current sketch');
  return inputs;
}
export function inputsFor(p,stage,binding) { return inputsForWithin(new WeakMap(),p,stage,binding); }
export function stageVisualCatalogue(p, stage, inputVersionIds = []) {
  if (stage === 'research') return buildVisualCatalogue(p);
  const entries = new Map();
  for (const id of inputVersionIds) for (const entry of artifact(p, id)?.technicalReceipts?.visualCatalogue ?? []) {
    requireValue(!entries.has(entry.id) || isDeepStrictEqual(entries.get(entry.id), entry), 'INVALID_VISUAL_CATALOGUE', 'Inherited visual references conflict');
    entries.set(entry.id, entry);
  }
  return validateVisualCatalogue([...entries.values()]);
}
function currentVisualCatalogue(p, entries = []) {
  validateVisualCatalogue(entries);
  if (!entries.length) return;
  let current;
  try { current = buildVisualCatalogue(p); } catch { fail('STALE_VISUAL_CATALOGUE', 'Registered visual evidence no longer validates'); }
  requireValue(entries.every(entry => current.some(candidate => isDeepStrictEqual(candidate, entry))),
    'STALE_VISUAL_CATALOGUE', 'Frozen visual evidence no longer has current independent support');
}
function artifactVisualCatalogue(p, a, supplied = a.technicalReceipts?.visualCatalogue ?? []) {
  const frozen = a.technicalReceipts?.visualCatalogue ?? [];
  requireValue(isDeepStrictEqual(supplied, frozen), 'INVALID_VISUAL_CATALOGUE', 'Visual catalogue must match the frozen artifact');
  currentVisualCatalogue(p, frozen);
}
function targetWithin(evaluation, p, id) {
  const a = artifact(p, id);
  requireValue(a && freshWithin(evaluation, p, id), 'STALE_ARTIFACT', 'Artifact is missing or stale');
  artifactVisualCatalogue(p, a);
  return a;
}
function creationLineage(p, a, seen = new Set()) {
  if (!a || seen.has(a.id)) return [];
  seen.add(a.id);
  return [a, ...[...a.inputVersionIds, ...(a.revision ? [a.revision.revisionOf.artifactId] : [])].flatMap(id => creationLineage(p, artifact(p, id), seen))];
}
function inputLineage(p, a, seen = new Set()) {
  if (!a || seen.has(a.id)) return [];
  seen.add(a.id);
  return [a, ...a.inputVersionIds.flatMap(id => inputLineage(p, artifact(p, id), seen))];
}
function independentVerifier(p, a, context) {
  requireValue(creationLineage(p, a).every(item => {
    const author = item.author;
    return !intersectsLineage(author, context);
  }), 'SELF_REVIEW', 'Verifier intersects creator lineage');
}
function stageFeedback(p, stage) {
  return (p.humanFeedback ?? []).filter(item => item.stage === stage && item.taskCardId === p.activeTaskCardId);
}
const correctionAdapters = Object.freeze({
  research_reader:{collection:'researchReaderReports',outputFilename:'research-reader.json',input:'readerInput',build:buildResearchReaderRequest,validate:validateResearchReaderOutput},
  coverage_challenge:{collection:'coverageChallenges',outputFilename:'coverage-challenge.json',input:'semanticInput',build:buildSemanticRequest,validate:validateSemanticOutput},
  verification: {collection:'verifications', outputFilename:'verification.json', input:'verificationInput', build:buildEvidenceReviewRequest, validate:validateEvidenceReviewOutput},
  readiness: {collection:'readinessReports', outputFilename:'readiness.json', input:'readinessInput', build:buildResearchReadinessRequest, validate:validateResearchReadinessOutput},
  handoff: {collection:'handoffReports', outputFilename:'handoff.json', input:'handoffInput', build:buildResearchHandoffRequest, validate:validateResearchHandoffOutput},
  feedback_review: {collection:'feedbackReviews', outputFilename:'feedback-review.json', input:'feedbackReviewInput', build:buildFeedbackReviewRequest, validate:validateFeedbackReviewOutput},
  creative_panel: {collection:'creativeReports', outputFilename:'creative-review.json', input:'creativeInput', build:buildCreativeRequest, validate:validateCreativeOutput},
  correction_review: {collection:'correctionReviews', outputFilename:'correction-review.json', input:'correctionReviewInput', build:buildCorrectionReviewRequest, validate:validateCorrectionReviewOutput},
});
export const CORRECTION_REPORT_KINDS=Object.freeze([...Object.keys(correctionAdapters),'owner_edge','reference']);
export function validateStoredReview(p,kind,report) { return validateStoredReviewWithin(new WeakMap(), ...arguments); }
function validateStoredReviewWithin(evaluation, p,kind,report) {
  const adapter=Object.hasOwn(correctionAdapters,kind)?correctionAdapters[kind]:null;
  requireValue(adapter,'UNSUPPORTED_CORRECTION_SOURCE','Imported/manual review has no supported immutable execution adapter');
  if(kind==='research_reader')validateStoredResearchReader(p,report);
  const a=artifact(p,report.artifactId);
  requireValue(a,'INVALID_CORRECTION_SOURCE','Registered correction parent required');
  const job=p.jobs.find(j=>j.id===report.jobId),attempt=job?.attempts.find(t=>t.id===report.attemptId),input=job?.task?.[adapter.input];
  if(kind==='readiness'&&input?.reviewProtocolVersion===APPLICABILITY_PROTOCOL){
    const {normalized}=readinessReportEvidence(p,report),receipt=report.executionReceipt;
    return {source:{kind,key:`${kind}:${report.id}`,targetArtifactId:a.id,targetContentHash:a.contentHash,protocolVersion:normalized.protocolVersion,reportId:report.id,reportHash:report.reportHash,rawReportHash:correctionHash(report.rawReport),jobId:job.id,attemptId:attempt.id,inputPacketHash:receipt.inputPacketHash,receiptHash:correctionHash(receipt),executionIdentity:ordinaryExecutionIdentity(report.context,receipt),rawReport:structuredClone(report.rawReport),validatedReport:normalized},request:adapter.build(input),input,collection:adapter.collection,outputFilename:adapter.outputFilename};
  }
  requireValue(job?.purpose===(kind==='creative_panel'?'creative_review':kind)&&job.status==='succeeded'&&attempt?.status==='succeeded'
    &&job.outputVersionIds?.includes(report.id)&&sameExecutor(attempt.executor,report.context)&&isDeepStrictEqual(report.resolutionId?savedReadinessReceipt(attempt,(p.readinessResolutions??[]).find(r=>r.id===report.resolutionId)?.proof):attempt.receipt,report.executionReceipt),
    'INVALID_CORRECTION_SOURCE','Every registered report requires its exact successful original execution');
  const panelPacket=kind==='creative_panel'?p.creativePanels?.find(x=>x.id===report.panelId)?.packet:undefined;
  const reportArtifact=input?.artifactId??panelPacket?.artifactId;
  const reportHash=input?.contentHash??panelPacket?.contentHash;
  requireValue(reportArtifact===a.id&&reportHash===a.contentHash&&isDeepStrictEqual(job.inputVersionIds,[a.id]),'INVALID_CORRECTION_SOURCE','Correction source targets another version');
  if(kind==='creative_panel'){
    const panel=p.creativePanels?.find(x=>x.id===report.panelId),node=panel?.nodes.find(n=>n.key===report.nodeKey);
    requireValue(panel&&node&&node.jobId===job.id&&isDeepStrictEqual(creativeNodeInput(panel,node,p.creativeReports),input),
      'INVALID_CORRECTION_SOURCE','Creative report requires original frozen panel phase and dependencies');
  }
  if(input.sourceRecords)requireValue(isDeepStrictEqual(input.sourceRecords,a.technicalReceipts?.sourceCatalogue?.records??[]),'INVALID_CORRECTION_SOURCE','Original report evidence catalogue changed');
  if(input.visualCatalogue)requireValue(isDeepStrictEqual(input.visualCatalogue,a.technicalReceipts?.visualCatalogue??[]),'INVALID_CORRECTION_SOURCE','Original report visual catalogue changed');
  const targetContent=input.content??panelPacket?.content;
  if(targetContent){const original=kind==='verification'&&a.strategyContract?.version===SIMPLE_STRATEGY_VERSION?(({claims,...raw})=>{requireValue(Array.isArray(claims)&&claims.length===0,'INVALID_CORRECTION_SOURCE','Exact simple verification projection required');return raw;})(targetContent):targetContent;requireValue(hash(JSON.stringify(original,null,2))===a.contentHash,'INVALID_CORRECTION_SOURCE','Original reviewed content changed');}
  if(kind==='correction_review'&&[COMPLETE_CORRECTION_REVIEW_PROTOCOL,APPLICABILITY_HANDLING].includes(input.reviewProtocolVersion))requireValue(isDeepStrictEqual(input.context,correctionHandlingContext(p,a.id)),'INVALID_CORRECTION_SOURCE','Original correction handling context changed');
  const request=adapter.build(input),validated=adapter.validate(report.rawReport,input),receipt=report.executionReceipt;
  if(kind!=='creative_panel')requireValue(Object.entries(validated).every(([k,v])=>isDeepStrictEqual(v,report[k])),
    'INVALID_CORRECTION_SOURCE','Registered normalized report fields changed');
  checkReceipt(job,attempt,receipt);independentVerifier(p,a,report.context);
  const packet=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema,...(request.manifest?.length?{images:request.manifest}:{})});
  requireValue(receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&ordinarySuccessfulStatus(receipt)
    &&['signal','reason','error'].every(k=>receipt[k]==null)&&ordinaryHasContext(receipt)&&receipt.inputPacketHash===hash(packet)
    &&isDeepStrictEqual(receipt.images?.length?imageManifest(receipt.images):[],request.manifest??[]),
    'INVALID_CORRECTION_SOURCE','Original report packet or actual image receipt changed');
  let parsed;try{parsed=JSON.parse(receipt.responseText);}catch{fail('INVALID_CORRECTION_SOURCE','Original raw report response required');}
  requireValue(isDeepStrictEqual(parsed,report.rawReport)&&(!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(parsed,receipt.parsedOutput))
    &&report.reportHash===hash(JSON.stringify(validated,null,2)),'INVALID_CORRECTION_SOURCE','Original report bytes or normalization changed');
  if(receipt.providerExecution)requireValue(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),
    'INVALID_CORRECTION_SOURCE','Original report execution changed');
  return {source:{kind,key:`${kind}:${report.id}`,targetArtifactId:a.id,targetContentHash:a.contentHash,
    protocolVersion:validated.protocolVersion??input.protocolVersion??panelPacket?.protocolVersion??'registered-report-v1',
    reportId:report.id,reportHash:report.reportHash,rawReportHash:correctionHash(report.rawReport),jobId:job.id,attemptId:attempt.id,
    inputPacketHash:receipt.inputPacketHash,receiptHash:correctionHash(receipt),executionIdentity:ordinaryExecutionIdentity(report.context,receipt),
    rawReport:structuredClone(report.rawReport),validatedReport:validated,
    ...(kind==='handoff'&&[APPLICABILITY_HANDOFF_PROTOCOL,DECLARATION_HANDOFF_PROTOCOL].includes(input.handoffProtocolVersion)?{handoffInput:structuredClone(input)}:{}),
    ...(kind==='correction_review'?{reviewedSources:structuredClone(input.correctionInput.sources)}:{}),
    ...(kind==='creative_panel'?{panelState:{panelId:report.panelId,phase:report.phase,nodeKey:report.nodeKey,stage:panelPacket.stage,
      complete:p.creativePanels.find(x=>x.id===report.panelId).nodes.every(n=>(p.creativeReports??[]).some(r=>r.panelId===report.panelId&&r.nodeKey===n.key))}}:{})},request,input,collection:adapter.collection,outputFilename:adapter.outputFilename};
}
export function revisionSources(p, artifactId) { return revisionSourcesWithin(new WeakMap(), ...arguments); }
function revisionSourcesWithin(evaluation, p, artifactId) {
  const a=artifact(p,artifactId);
  requireValue(a,'INVALID_CORRECTION_SOURCE','Registered correction parent required');
  const sources=[];
  for(const [kind,adapter] of Object.entries(correctionAdapters))for(const report of p[adapter.collection]??[]){
    if(report.artifactId!==a.id)continue;
    sources.push(validateStoredReviewWithin(evaluation, p,kind,report).source);
  }
  for(const job of p.jobs.filter(j=>j.purpose==='owner_acceptance'&&j.status==='succeeded')){const edge=(p.ownerEdges??[]).find(e=>e.id===job.edgeId);if(edge?.envelope.sourceArtifacts.some(x=>x.id===a.id))requireValue(job.outputVersionIds?.length===1&&(p.ownerReports??[]).some(r=>r.id===job.outputVersionIds[0]&&r.jobId===job.id),'INVALID_CORRECTION_SOURCE','Completed owner outcome cannot be omitted');}
  for(const report of p.ownerReports??[]){
    const edge=(p.ownerEdges??[]).find(e=>e.id===report.edgeId);
    if(!edge||report.artifactId!==a.id&&!report.unresolvedIssues.some(i=>i.returnTo.artifactId===a.id))continue;
    const validated=validateStoredOwnerWithin(evaluation, p,report),job=p.jobs.find(j=>j.id===report.jobId),attempt=job.attempts.find(t=>t.id===report.attemptId),receipt=report.executionReceipt;
    sources.push({kind:'owner_edge',key:`owner_edge:${report.id}`,targetArtifactId:a.id,targetContentHash:a.contentHash,protocolVersion:OWNER_EDGE_PROTOCOL,reportId:report.id,reportHash:report.reportHash,rawReportHash:correctionHash(report.rawReport),jobId:job.id,attemptId:attempt.id,inputPacketHash:receipt.inputPacketHash,receiptHash:correctionHash(receipt),executionIdentity:ordinaryExecutionIdentity(report.context,receipt),rawReport:structuredClone(report.rawReport),validatedReport:validated,ownerSource:{edgeId:edge.id,envelopeHash:edge.envelope.envelopeHash,packet:structuredClone(job.task.ownerInput),sourceArtifactId:edge.envelope.source.artifactId}});
  }
  sources.push(...referenceCorrectionSources(p,a));
  for(const report of p.reviews??[])if(report.artifactId===a.id&&!sources.some(source=>source.reportId===report.id))
    fail('UNSUPPORTED_CORRECTION_SOURCE','Imported/manual review has no supported immutable execution adapter');
  for(const job of p.jobs)if(!['owner_acceptance','reference'].includes(job.purpose)&&job.targetArtifactId===a.id&&job.status==='succeeded'&&job.outputVersionIds?.length
    ){
    requireValue(Object.values(correctionAdapters).some(adapter=>adapter.input&&job.task?.[adapter.input]),'UNSUPPORTED_CORRECTION_SOURCE',`Unsupported registered report purpose ${job.purpose}`);
    requireValue(job.outputVersionIds.every(id=>sources.some(source=>source.reportId===id&&source.jobId===job.id)), 'INVALID_CORRECTION_SOURCE','Completed report missing or target identity changed');
  }
  if(!sources.length)return [];
  for(const item of stageFeedback(p,a.stage))sources.push({kind:'human',key:`human:${item.id}`,feedback:structuredClone(item),feedbackHash:feedbackHash([item])});
  return correctionSources(sources);
}
export function revisionPlan(p, artifactId) { return revisionPlanWithin(new WeakMap(), ...arguments); }
function revisionPlanWithin(evaluation, p, artifactId) {
  const a = targetWithin(evaluation, p, artifactId), feedback = stageFeedback(p, a.stage);
  requireValue(['research', 'strategy', 'copy'].includes(a.stage), 'STAGE_NOT_IMPLEMENTED', 'Revision execution is implemented for text stages only');
  const sources=revisionSourcesWithin(evaluation, p,artifactId);
  if(sources.length){try{requireCorrectionAction(sources);}catch(error){fail(error.code,error.message);}return structuredClone({protocolVersion:CORRECTION_PROTOCOL,revisionOf:{artifactId:a.id,contentHash:a.contentHash},
    taskCardId:p.activeTaskCardId,policyVersion:currentPolicy(p).version,sources,sourceSetHash:correctionHash(sources),constraintManifestHash:correctionHash(correctionConstraintManifest(sources))});}
  requireValue(feedback.length, 'FEEDBACK_REQUIRED', 'Revision requires current-stage human feedback or registered machine reports');
  return structuredClone({revisionOf: {artifactId: a.id, contentHash: a.contentHash}, taskCardId: p.activeTaskCardId,
    policyVersion: currentPolicy(p).version, feedback, feedbackHash: feedbackHash(feedback)});
}
export function evidenceEnrichmentPlan(p,artifactId){return evidenceEnrichmentPlanWithin(new WeakMap(),p,artifactId);}
function evidenceEnrichmentPlanWithin(evaluation,p,artifactId,requireHead=true){
 const a=requireHead?targetWithin(evaluation,p,artifactId):artifact(p,artifactId);requireValue(a,'INVALID_EVIDENCE_ENRICHMENT','Registered parent required');requireValue(a.stage==='research','INVALID_EVIDENCE_ENRICHMENT','Registered enrichment is limited to research');
 const sources=revisionSourcesWithin(evaluation,p,artifactId);requireValue(sources.some(s=>s.kind!=='human'),'INVALID_EVIDENCE_ENRICHMENT','Actual machine review history required');
 const producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)&&j.binding);requireValue(producer,'INVALID_EVIDENCE_ENRICHMENT','Actual parent producer required');
 const retainedContext=researchAssessmentContextWithin(evaluation,p,a.id,producer.binding),lineage=new Set(creationLineage(p,a).map(item=>item.id));
 const unknownReviews=p.jobs.filter(j=>j.status==='awaiting_reconciliation'&&(lineage.has(j.targetArtifactId)||(j.inputVersionIds??[]).some(id=>lineage.has(id)))).map(j=>({jobId:j.id,attemptId:j.attempts.at(-1).id,status:j.status,receiptHash:correctionHash(j.attempts.at(-1).receipt??null)})).sort((a,b)=>a.jobId.localeCompare(b.jobId));
 return structuredClone({protocolVersion:CORRECTION_PROTOCOL,revisionOf:{artifactId:a.id,contentHash:a.contentHash},taskCardId:p.activeTaskCardId,policyVersion:currentPolicy(p).version,sources,sourceSetHash:correctionHash(sources),constraintManifestHash:correctionHash(correctionConstraintManifest(sources)),enrichment:{version:REGISTERED_EVIDENCE_ENRICHMENT,retainedContext,unknownReviews}});
}
function currentRevisionPlanWithin(evaluation,p,input){return input.enrichment?evidenceEnrichmentPlanWithin(evaluation,p,input.revisionOf.artifactId):revisionPlanWithin(evaluation,p,input.revisionOf.artifactId);}
function correctionGenerationCurrentWithin(evaluation, p,input){
 if(input?.enrichment){const {evidenceManifestHash,...trigger}=input.enrichment;return isDeepStrictEqual(trigger,evidenceEnrichmentPlanWithin(evaluation,p,input.revisionOf.artifactId,false).enrichment)&&input.taskCardId===p.activeTaskCardId&&input.policyVersion===currentPolicy(p).version&&isDeepStrictEqual(input.sources,revisionSourcesWithin(evaluation,p,input.revisionOf.artifactId));}
  return [CORRECTION_PROTOCOL,LATEST_CORRECTION_PROTOCOL].includes(input?.protocolVersion)&&input.taskCardId===p.activeTaskCardId&&input.policyVersion===currentPolicy(p).version
    &&isDeepStrictEqual(input.sources,revisionSourcesWithin(evaluation, p,input.revisionOf.artifactId));
}
function revisionGenerationCurrentWithin(evaluation, p, stage, input) {
  if([CORRECTION_PROTOCOL,LATEST_CORRECTION_PROTOCOL].includes(input?.protocolVersion))return correctionGenerationCurrentWithin(evaluation, p,input);
  return input?.taskCardId === p.activeTaskCardId && input.policyVersion === currentPolicy(p).version
    && isDeepStrictEqual(input.feedback, stageFeedback(p, stage)) && input.feedbackHash === feedbackHash(stageFeedback(p, stage));
}
function revisionMaterials(p, feedback) {
  const ids = [...new Set(feedback.flatMap(item => item.materials.map(material => material.imageId)))];
  return ids.length ? imageManifest(ids.map(id => {
    const asset = p.imageAssets.find(item => item.id === id);
    requireValue(asset, 'INVALID_HUMAN_FEEDBACK', 'Feedback material must be a registered image');
    return asset;
  })) : [];
}
function validateJobRevisionWithin(evaluation, p, job, requireHead = true) {
  const input = job.task?.correctionInput ?? job.task?.revisionInput, feedback = stageFeedback(p, job.stage);
  if (!input) {
    requireValue(!feedback.length, 'FEEDBACK_REVISION_REQUIRED', 'Human feedback requires a bound revision job');
    return;
  }
  requireValue(!(job.task.revisionInput&&job.task.correctionInput),'INVALID_REVISION_INPUT','Overlapping revision protocols');
  if(job.task.correctionInput)validateCorrectionInput(input);else validateRevisionInput(input);
  requireEvidenceProjection(input,job.task.sourceRecords??[],job.task.visualCatalogue??[]);
  requireValue(revisionGenerationCurrentWithin(evaluation, p, job.stage, input), 'STALE_FEEDBACK', 'Revision feedback, task card or policy changed');
  const base = artifact(p, input.revisionOf.artifactId);
  requireValue(base && base.stage === job.stage && base.contentHash === input.revisionOf.contentHash
    && hash(JSON.stringify(input.baseContent, null, 2)) === base.contentHash,
    'INVALID_REVISION_INPUT', 'Revision must retain exact parent content');
  requireValue(isDeepStrictEqual(input.materials, revisionMaterials(p, job.task.correctionInput?correctionFeedback(input):feedback)), 'INVALID_REVISION_INPUT', 'Revision materials must match registered assets');
  if(input.protocolVersion===LATEST_CORRECTION_PROTOCOL){
    requireValue(isDeepStrictEqual(input.evidence.base.sourceRecords,base.technicalReceipts?.sourceCatalogue?.records??[])&&isDeepStrictEqual(input.evidence.base.visualCatalogue,base.technicalReceipts?.visualCatalogue??[]),'INVALID_CORRECTION','Evidence must retain exact full parent catalogues');
    const card=p.taskCards.find(c=>c.id===input.taskCardId);
    requireValue(job.task.brief===card?.brief&&job.task.taskCardId===card?.id&&isDeepStrictEqual(input.taskCardSnapshot,card),'INVALID_CORRECTION','Correction must retain exact frozen task');
    currentVisualCatalogue(p,job.task.visualCatalogue??[]);currentCaseSources(p,job.task.sourceRecords??[]);
    requireRegisteredCorrectionSelection(job,input);
    for(const id of job.inputVersionIds){const upstream=artifact(p,id);for(const record of upstream?.technicalReceipts?.sourceCatalogue?.records??[])requireValue((job.task.sourceRecords??[]).some(s=>isDeepStrictEqual(s,record)),'INVALID_CORRECTION','Upstream source must be explicitly represented before freezing');}
  }
  const supplied = job.task.revisionInputArtifacts ?? [];
  const expected = job.inputVersionIds.filter(id => artifact(p, id));
  if(job.task.correctionInput)for(const id of expected){
    const edge=job.stage==='copy'?(p.ownerEdges??[]).find(e=>e.id===job.task.ownerEdgeId):null;
    const constraints=edge?ownerCopyTask(p,edge).upstreamReviewConstraints[id]:{...(usesResearchOperatorWorkflow(p)&&artifact(p,id)?.stage==='research'&&artifact(p,id)?.provenance==='provider_execution'?{operatorHandoff:researchOperatorConstraintsWithin(evaluation, p,id)}:{}),...((p.coverageChallenges??[]).some(r=>r.artifactId===id)?{semantic:(p.coverageChallenges??[]).filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(p,r)}))}:{}),readiness:(p.readinessReports??[]).filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(p,r)})),
      handoffs:(p.handoffReports??[]).filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(p,r)}))};
    requireValue(isDeepStrictEqual(job.task.upstreamReviewConstraints?.[id],constraints),'STALE_CORRECTION','Upstream handoff constraints changed');
  }
  requireValue(Array.isArray(supplied) && isDeepStrictEqual(supplied.map(item => item.id), expected)
    && supplied.every(item => { const source = artifact(p, item.id); return item.stage === source.stage
      && hash(JSON.stringify(item.content, null, 2)) === source.contentHash
      && isDeepStrictEqual(item.reviewConstraints, job.task.upstreamReviewConstraints?.[item.id]); }),
    'INVALID_REVISION_INPUT', 'Frozen revision upstream bodies and constraints must match exact inputs');

  if (requireHead&&job.task.researchRevision)requireValue(isDeepStrictEqual(job.task.researchRevision,researchRevisionAuthorityWithin(evaluation, p,input.revisionOf.artifactId)),'STALE_RESEARCH_ASSESSMENT','Research revision requires current actual independent interpretation');
  if (requireHead) {
    const {baseContent, materials, evidence, taskCardSnapshot, ...plan} = input;
    if(plan.protocolVersion===LATEST_CORRECTION_PROTOCOL)plan.protocolVersion=CORRECTION_PROTOCOL;
    if(plan.enrichment){const {evidenceManifestHash,...trigger}=plan.enrichment;plan.enrichment=trigger;}
    requireValue(isDeepStrictEqual(plan, currentRevisionPlanWithin(evaluation, p, input)), 'INVALID_REVISION_INPUT', 'Revision must consume the current retained head and all feedback');
  }
}
function requireResearchStrategyJobWithin(evaluation, p,job) {
  if(job.stage!=='strategy'||job.purpose&&job.purpose!=='stage'||!usesResearchOperatorWorkflow(p))return;
  const id=p.activeByStage.research,a=artifact(p,id);
  if(a?.provenance!=='provider_execution')return;
  const release=requireResearchOperatorReleaseWithin(evaluation, p,a);
  if(!job.task?.revisionInput&&!job.task?.correctionInput)requireValue((p.researchContinuationIntents??[]).some(i=>i.jobId===job.id&&i.releaseId===release.id&&isDeepStrictEqual(i.binding,job.binding)),'RESEARCH_CONTINUATION_REQUIRED','Explicit release does not authorize generic strategy execution; request continuation separately');
  requireValue(isDeepStrictEqual(job.task?.upstreamReviewConstraints?.[id],{...((p.coverageChallenges??[]).some(r=>r.artifactId===id)?{semantic:p.coverageChallenges.filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(p,r)}))}:{}),readiness:p.readinessReports.filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(p,r)})),handoffs:p.handoffReports.filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(p,r)})),operatorHandoff:researchOperatorConstraintsWithin(evaluation, p,id)}),'STALE_RESEARCH_DECLARATION','Strategy must retain exact human and model restrictions and explicit release');
}
export function hasResearchData(p,a){
 const producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id));
 if(a.researchData||producer?.task?.researchContractVersion!==undefined)return true;
 try{return JSON.parse(a.executionReceipt?.responseText).researchContractVersion!==undefined;}catch{return false;}
}
function requireResearchBasis(p,job){
 if(job?.task?.researchContractVersion===undefined)return;
 requireValue(job.stage==='research'&&job.task.researchContractVersion===RESEARCH_DATA_VERSION,'INVALID_RESEARCH_BASIS','Exact research protocol required');
 const card=p.taskCards.find(c=>c.id===p.activeTaskCardId);
 const acquisition=job.task.researchDataBasis?.acquisition;
 if(acquisition){const registered=resolveAcquisition(p,acquisition);if(!job.task.correctionInput&&!job.task.revisionInput)requireValue(isDeepStrictEqual(job.task.sourceRecords,registered.admission.sourceRecords),'ACQUISITION_SELECTOR_CONFLICT','Producer must use complete registered acquisition catalogue');}
 const expected=researchDataBasis({taskCard:card,confirmations:p.confirmations.filter(c=>c.taskCardId===card.id),sourceRecords:job.task.sourceRecords??[],...(acquisition?{acquisition}:{})});
 requireValue(isDeepStrictEqual(job.task.researchDataBasis,expected),'STALE_RESEARCH_BASIS','Full task card, confirmations and source binding must remain current');
}
function researchProductionReceipt(p,job,attempt,receipt){
 if(job.task?.researchContractVersion===undefined)return;
 requireResearchBasis(p,job);
 const inputArtifacts=job.task.revisionInputArtifacts??[];
 let request=buildStageRequest({stage:'research',brief:job.task.brief,inputArtifacts,sourceRecords:job.task.sourceRecords??[],visualCatalogue:job.task.visualCatalogue??[],revisionInput:job.task.revisionInput,correctionInput:job.task.correctionInput,researchRevision:job.task.researchRevision,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis});
 if(job.task.researchMethod)request=applyResearchMethod(request,job.task.researchMethod,job.task.researchQuestionRegistration);
 const materials=(job.task.correctionInput??job.task.revisionInput)?.materials;
 requireValue(receipt.inputPacketHash===hash(JSON.stringify({runId:attempt.id,model:job.binding.model,...request,...(materials?.length?{images:materials}:{})}))&&receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.model===job.binding.model&&ordinarySuccessfulStatus(receipt)&&ordinaryHasContext(receipt)&&['signal','reason','error'].every(k=>receipt[k]==null),'INVALID_EXECUTION_RECEIPT','Exact original numerical research invocation required');
 let parsed;try{parsed=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Original research response required');}
 requireValue((!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(parsed,receipt.parsedOutput))&&(!receipt.providerExecution||Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k]))),'INVALID_EXECUTION_RECEIPT','Research original response and execution disagree');
}
function requireResearchOriginal(p,a){
 const jobs=p.jobs.filter(j=>j.outputVersionIds?.includes(a.id)&&(!j.purpose||j.purpose==='stage')),job=jobs[0];
 requireValue(jobs.length===1&&a.provenance==='provider_execution'&&job.status==='succeeded'&&job.task?.researchContractVersion===RESEARCH_DATA_VERSION,'INVALID_RESEARCH_ORIGINAL','Actual successful research-data-v2 producer required');
 const recovery=a.reconciliationId?(p.reconciliations??[]).find(r=>r.id===a.reconciliationId&&r.jobId===job.id&&r.artifactId===a.id):null;
 const attempt=job.attempts.find(t=>t.id===job.attemptId&&(t.status==='succeeded'||recovery&&t.status==='awaiting_reconciliation'));
 if(recovery)requireValue(recovery.attemptId===attempt?.id&&recovery.originalReceiptHash===hash(JSON.stringify(a.executionReceipt))&&recovery.rawOutputHash===hash(a.executionReceipt.responseText)&&recovery.inputPacketHash===a.executionReceipt.inputPacketHash&&recovery.validatedOutputHash===a.contentHash,'INVALID_RESEARCH_ORIGINAL','Exact recovered original receipt and normalization required');
 requireValue(attempt&&isDeepStrictEqual(attempt.receipt,a.executionReceipt)&&sameExecutor(attempt.executor,a.author),'INVALID_RESEARCH_ORIGINAL','Original producer attempt and receipt required');
 researchProductionReceipt(p,job,attempt,a.executionReceipt);
 const output=validateStageOutput('research',a.executionReceipt.responseText,{sourceRecords:job.task.sourceRecords??[],visualCatalogue:job.task.visualCatalogue??[],revisionInput:job.task.revisionInput,correctionInput:job.task.correctionInput,researchRevision:job.task.researchRevision,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis});
 requireValue(output.status!=='blocked'&&output.outputKind==='research_findings'&&hash(JSON.stringify(output.content,null,2))===a.contentHash&&(recovery?recovery.validatedOutputHash:a.executionReceipt.validatedOutputHash)===a.contentHash&&isDeepStrictEqual(a.claims,output.claims)&&isDeepStrictEqual(a.researchData,researchChartMetadata(job,output,a.contentHash).researchData)&&isDeepStrictEqual(a.technicalReceipts.sourceCatalogue,{version:1,records:job.task.sourceRecords??[]}), 'INVALID_RESEARCH_ORIGINAL','Original normalized content, claims, metadata and sources must agree');
 return {job,attempt,output,candidate:validateResearchChartCandidate(output.content,job.task.researchDataBasis)};
}
export function requireResearchChartAdmission(p,artifactId,originals) { return requireResearchChartAdmissionWithin(new WeakMap(), ...arguments); }
function hasRecoveredReadinessOriginal(p,job){
 if(job.purpose!=='readiness'||job.status!=='awaiting_reconciliation')return false;
 const terminal=(p.readinessResolutions??[]).find(r=>r.kind==='local-terminal-failure-observed'&&r.jobId===job.id);
 if(terminal){terminalFailureResolution(p,terminal.id);return true;}
 const reports=(p.readinessReports??[]).filter(r=>r.jobId===job.id&&r.resolutionId);
 if(reports.length!==1)return false;
 const report=reports[0],resolutions=(p.readinessResolutions??[]).filter(r=>r.kind==='recovered-result'&&(r.jobId===job.id||r.reportId===report.id||r.id===report.resolutionId));
 if(resolutions.length!==1||report.attemptId!==job.attemptId)return false;
 uncertainReadiness(p,job.id,report.attemptId);
 readinessReportEvidence(p,report);
 return true;
}
function requireResearchChartAdmissionWithin(evaluation, p,artifactId,originals){
 const a=targetWithin(evaluation, p,artifactId),{job,attempt,output,candidate}=requireResearchOriginal(p,a);
 requireValue(freshWithin(evaluation, p,a.id)&&releasedWithin(evaluation, p,a.id),'RESEARCH_CHART_RELEASE_REQUIRED','Current readiness, both owners and actual release required');
 requireValue(!researchHandlingBlockedWithin(evaluation, p,a.id),'CORRECTION_REVIEW_REQUIRED','Current correction handling required');
 if(originals){const original=originals.find(r=>r.artifactId===a.id);requireValue(original&&original.contentText===JSON.stringify(output.content,null,2),'INVALID_RESEARCH_ORIGINAL','Actual downstream research bytes must match original normalization');}
 requireValue(!p.jobs.some(j=>j.targetArtifactId===a.id&&['verification','readiness','coverage_challenge','handoff'].includes(j.purpose)&&['queued','running','awaiting_reconciliation'].includes(j.status)&&!hasRecoveredReadinessOriginal(p,j)),'RESEARCH_EVIDENCE_UNSETTLED','Unsettled numerical evidence or owner calls cannot authorize downstream use');
 const reports=p.verifications.filter(r=>r.artifactId===a.id);
 requireValue(reports.length&&reports.every(r=>r.rawReport.protocolVersion===NUMERICAL_REVIEW_PROTOCOL),'NUMERICAL_REVIEW_REQUIRED','Every numerical review must use v4');
 const recordRef=record=>({id:record.id,jobId:record.jobId,attemptId:record.attemptId,reportHash:record.reportHash,rawReportHash:evidenceStateHash(record.rawReport),receiptHash:evidenceStateHash(record.executionReceipt)});
 const authority={verifications:reports.map(r=>({...recordRef(r),limitations:r.rawReport.limitations,resultLimitations:[...r.rawReport.results,...(r.rawReport.quantitativeResults??[])].map(result=>({limitations:result.limitations}))})),...((p.coverageChallenges??[]).some(r=>r.artifactId===a.id)?{semantic:(p.coverageChallenges??[]).filter(r=>r.artifactId===a.id).map(r=>({reportId:r.id,...reviewContextReport(p,r)}))}:{}),readiness:(p.readinessReports??[]).filter(r=>r.artifactId===a.id).map(r=>({...recordRef(r),downstreamUse:r.rawReport.downstreamUse,limitations:r.rawReport.limitations,sourceAssessments:r.sourceAssessments.map(s=>({sourceId:s.sourceId,limitations:s.limitations}))})),handoffs:(p.handoffReports??[]).filter(r=>r.artifactId===a.id).map(r=>({...recordRef(r),side:r.side,permittedUses:r.rawReport.permittedUses,prohibitedInferences:r.rawReport.prohibitedInferences,limitations:r.rawReport.limitations})),declarations:(p.researchHandoffDeclarations??[]).filter(r=>r.artifactId===a.id),releases:p.releases.filter(r=>r.artifactId===a.id)};
 const data={protocolVersion:'research-chart-admission-v1',artifactId:a.id,contentHash:a.contentHash,producer:{jobId:job.id,attemptId:attempt.id,requestHash:a.executionReceipt.inputPacketHash,responseHash:hash(a.executionReceipt.responseText),receiptHash:evidenceStateHash(a.executionReceipt)},basis:structuredClone(job.task.researchDataBasis),sourceBinding:structuredClone(job.task.researchDataBasis.sourceBinding),raw:structuredClone(output.content.chartData),quantitativeClaims:structuredClone(output.content.quantitativeClaims),catalogDigest:candidate?.validated.catalogDigest??null,sourcesDigest:candidate?.validated.sourcesDigest??null,charts:candidate?.validated.charts??[],quantitativeManifestHash:candidate?.manifestHash??null,authority:structuredClone(authority)};
 return {...data,admissionHash:evidenceStateHash(data)};
}
export function strategyBasisFor(p,binding,{sourceRecords=[],visualCatalogue=[]}={}) { return strategyBasisForWithin(new WeakMap(), p, binding, {sourceRecords, visualCatalogue}); }
function strategyBasisForWithin(evaluation, p,binding,{sourceRecords=[],visualCatalogue=[]}={}) {
 const taskCard=p.taskCards.find(c=>c.id===p.activeTaskCardId),a=artifact(p,p.activeByStage.research);
 requireValue(taskCard&&a,'STRATEGY_BASIS_REQUIRED','Confirmed task and research artifact required');
 const confirmations=p.confirmations.filter(c=>c.taskCardId===taskCard.id);
 const collections=['verifications','readinessReports','coverageChallenges','handoffReports','feedbackReviews','correctionReviews','reviews','decisions','releases','acknowledgments','researchHandoffDeclarations'];
 const authority=Object.fromEntries(collections.map(k=>[k,(p[k]??[]).filter(r=>r.artifactId===a.id)]));
 const producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id));
 const admitted=new Map([...(producer?.task?.sourceRecords??[]),...(a.technicalReceipts?.sourceCatalogue?.records??[])].map(r=>[r.id,r]));
 requireValue(sourceRecords.length===admitted.size&&sourceRecords.every(r=>isDeepStrictEqual(admitted.get(r.id),r)),'INVALID_STRATEGY_BASIS','Strategy must use the actual research source catalogue');
 const reviewConstraints={...((p.coverageChallenges??[]).some(r=>r.artifactId===a.id)?{semantic:(p.coverageChallenges??[]).filter(r=>r.artifactId===a.id).map(r=>({reportId:r.id,...reviewContextReport(p,r)}))}:{}),readiness:(p.readinessReports??[]).filter(r=>r.artifactId===a.id).map(r=>({reportId:r.id,...reviewContextReport(p,r)})),handoffs:(p.handoffReports??[]).filter(r=>r.artifactId===a.id).map(r=>({reportId:r.id,...reviewContextReport(p,r)})),...(usesResearchOperatorWorkflow(p)?{operatorHandoff:researchOperatorConstraintsWithin(evaluation, p,a.id)}:{})};
 const chartAdmission=hasResearchData(p,a)?requireResearchChartAdmissionWithin(evaluation, p,a.id):null;
 const data={...(chartAdmission?{researchChartAdmission:chartAdmission}:{}),version:STRATEGY_CONTRACT_VERSION,reviewConstraints,taskCard:structuredClone(taskCard),confirmations:structuredClone(confirmations),policy:structuredClone(currentPolicy(p)),binding:structuredClone(binding),research:[{artifactId:a.id,contentHash:a.contentHash,claimManifest:evidenceClaimManifest({claims:a.claims}),artifact:structuredClone(a),authority:structuredClone(authority)}],sourceRecords:structuredClone(sourceRecords),visualCatalogue:structuredClone(visualCatalogue)};
 if(p.workflow){
  const contentText=JSON.stringify(requireResearchOriginal(p,a).output.content,null,2);
  const handoff={...data,version:SIMPLE_STRATEGY_VERSION};
  const limitations=[...new Set((p.handoffReports??[]).filter(r=>r.artifactId===a.id).flatMap(r=>r.rawReport.limitations??[]))];
  return createSimpleStrategyBasis({projectId:p.id,taskCard,research:{artifactId:a.id,contentHash:a.contentHash,contentText},limitations,handoff});
 }
 return {...data,basisHash:evidenceStateHash(data)};
}
function requireStrategyBasisWithin(evaluation, p,job) {
 if(job.stage!=='strategy'||job.purpose&&job.purpose!=='stage'||job.task?.strategyContractVersion===undefined)return;
 requireValue(job.task.strategyContractVersion===(p.workflow?SIMPLE_STRATEGY_VERSION:STRATEGY_CONTRACT_VERSION)&&isDeepStrictEqual(job.task.strategyBasis,strategyBasisForWithin(evaluation, p,job.binding,job.task))&&isDeepStrictEqual(job.task.upstreamReviewConstraints?.[p.activeByStage.research],(job.task.strategyBasis.handoff??job.task.strategyBasis).reviewConstraints),'STALE_STRATEGY_BASIS','Strategy task, research evidence, authority or binding changed');
}
function strategyMetadata(job,output,contentHash){
 if(job.task?.strategyContractVersion===SIMPLE_STRATEGY_VERSION)return {strategyContract:{version:SIMPLE_STRATEGY_VERSION,basisHash:job.task.strategyBasis.basisHash,contentHash,status:output.status}};
 if(job.task?.strategyContractVersion!==STRATEGY_CONTRACT_VERSION)return {};
 requireValue(output,'INVALID_STAGE_OUTPUT','Validated actual strategy output required');
 return {strategyContract:{version:STRATEGY_CONTRACT_VERSION,basisHash:job.task.strategyBasis.basisHash,contentHash,status:output.strategy.answer.decision}};
}
function strategyProductionReceiptWithin(evaluation, p,job,attempt,receipt){
 if(![STRATEGY_CONTRACT_VERSION,SIMPLE_STRATEGY_VERSION].includes(job.task?.strategyContractVersion))return;
 requireStrategyBasisWithin(evaluation, p,job);
 const inputArtifacts=job.task.revisionInputArtifacts??job.task.strategyInputArtifacts;
 requireValue(inputArtifacts,'INVALID_EXECUTION_RECEIPT','Exact original strategy input required');
 const request=buildStageRequest({stage:'strategy',brief:job.task.brief,inputArtifacts,sourceRecords:job.task.sourceRecords??[],visualCatalogue:job.task.visualCatalogue??[],revisionInput:job.task.revisionInput,correctionInput:job.task.correctionInput,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis});
 const materials=(job.task.correctionInput??job.task.revisionInput)?.materials;
 const packet=JSON.stringify({runId:attempt.id,model:job.binding.model,...request,...(materials?.length?{images:materials}:{})});
 let raw;try{raw=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Original strategy response required');}
 requireValue((!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(raw,receipt.parsedOutput))&&(!receipt.providerExecution||Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k]))),'INVALID_EXECUTION_RECEIPT','Strategy original response and execution metadata disagree');
 requireValue(receipt.inputPacketHash===hash(packet)&&receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&ordinarySuccessfulStatus(receipt)&&ordinaryHasContext(receipt)&&['signal','reason','error'].every(k=>receipt[k]==null),'INVALID_EXECUTION_RECEIPT','Exact original strategy invocation required');
}
function stageJobCurrentWithin(evaluation, p, job) {
  try {
    requireValue(isDeepStrictEqual(inputsForWithin(evaluation, p, job.stage, job.binding), job.inputVersionIds), 'STALE_JOB', 'Current consumable inputs required');
    requireResearchBasis(p,job);requireStrategyBasisWithin(evaluation, p,job);requireResearchStrategyJobWithin(evaluation, p,job);requireOwnerCopyJobWithin(evaluation, p,job);validateJobRevisionWithin(evaluation, p, job);
    return true;
  } catch { return false; }
}
function requireRegisteredCorrectionSelection(job,input){
 if(input.enrichment){requireValue(job.task.revisionRequest?.revisionMode===EVIDENCE_ENRICHMENT_MODE,'INVALID_EVIDENCE_ENRICHMENT','Enrichment must be explicitly requested');validateEvidenceEnrichment(input);}
 if(!['correction-evidence-v2','correction-evidence-v3'].includes(input.evidence?.version))return;
 requireValue(job.stage==='research'&&isDeepStrictEqual(job.task.revisionRequest?.supplementalCaseSourceIds??[],input.evidence.registeredSourceDelta.map(s=>s.id))&&isDeepStrictEqual(job.task.revisionRequest?.supplementalVisualIds??[],input.evidence.visualDelta.map(s=>s.id))&&isDeepStrictEqual(job.task.revisionRequest?.supplementalCaptureIds??[],(input.evidence.capturedTextDelta??[]).map(s=>s.managedCapture.captureId)),'INVALID_CORRECTION','Registered evidence must match exact requested IDs');
}
function revisionProductionReceipt(p, job, attempt, receipt) {
  if (!job.task.revisionInput&&!job.task.correctionInput) return;
  const input = job.task.correctionInput??job.task.revisionInput;
  requireEvidenceProjection(input,job.task.sourceRecords??[],job.task.visualCatalogue??[]);
  if(['correction-evidence-v2','correction-evidence-v3'].includes(input.evidence?.version)){requireRegisteredCorrectionSelection(job,input);currentVisualCatalogue(p,job.task.visualCatalogue??[]);currentCaseSources(p,job.task.sourceRecords??[]);}
  let request = buildStageRequest({stage: job.stage, brief: job.task.brief,
    inputArtifacts: job.task.revisionInputArtifacts ?? [], sourceRecords: job.task.sourceRecords ?? [],
    visualCatalogue: job.task.visualCatalogue ?? [], ...(job.task.correctionInput?{correctionInput:input}:{revisionInput:input}), copyContractVersion: job.task.copyContractVersion,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis,researchRevision:job.task.researchRevision});
  if(job.stage==='research'&&job.task.researchMethod)request=applyResearchMethod(request,job.task.researchMethod,job.task.researchQuestionRegistration);
  const packet = JSON.stringify({runId: attempt.id, model: job.binding.model, prompt: request.prompt, outputSchema: request.outputSchema,
    ...(input.materials.length ? {images: input.materials} : {})});
  requireValue(receipt.runId === attempt.id && receipt.requestedModel === job.binding.model && ordinarySuccessfulStatus(receipt)
    && ['signal', 'reason', 'error'].every(key => receipt[key] == null)
    && receipt.inputPacketHash === hash(packet)
    && isDeepStrictEqual(receipt.images?.length ? imageManifest(receipt.images) : [], input.materials),
    'INVALID_EXECUTION_RECEIPT', 'Revision receipt must bind exact production request and material images');
  if(job.task.correctionInput){
    requireValue(input.sources.filter(s=>s.kind!=='human').every(source=>!ordinaryIdentitySameContext(source.executionIdentity,receipt))
      &&!p.jobs.some(other=>other.attempts.some(prior=>prior.id!==attempt.id&&ordinarySameContext(prior.receipt,receipt))),
      'SELF_REVIEW','Correction producer cannot reuse a consumed review or prior execution thread');
    let parsed;try{parsed=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Original correction response required');}
    requireValue(!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(parsed,receipt.parsedOutput),'INVALID_EXECUTION_RECEIPT','Original correction parsed output changed');
    if(receipt.providerExecution)requireValue(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),
      'INVALID_EXECUTION_RECEIPT','Original correction provider receipt changed');
  }
}
function revisionMetadata(job, responses) {
  const input = job.task?.correctionInput??job.task?.revisionInput;
  if (!input) return {};
  const {baseContent, ...revision} = input;
  return {revision: structuredClone(revision), ...(job.task.correctionInput?{revisionResponses:structuredClone(responses)}:{feedbackResponses: structuredClone(responses)})};
}
export function correctionHandlingContext(p,artifactId){
  const a=artifact(p,artifactId),producer=p.jobs.find(j=>j.outputVersionIds?.includes(artifactId)&&j.task?.correctionInput),input=producer?.task.correctionInput;
  requireValue(a&&producer&&['succeeded','succeeded_stale'].includes(producer.status)&&input.protocolVersion===LATEST_CORRECTION_PROTOCOL,'INVALID_CORRECTION','Successful registered v3 producer required');
  validateCorrectionInput(input);requireEvidenceProjection(input,producer.task.sourceRecords??[],producer.task.visualCatalogue??[]);
  requireValue(isDeepStrictEqual(a.technicalReceipts?.sourceCatalogue?.records??[],evidenceRecords(input.evidence))&&isDeepStrictEqual(a.technicalReceipts?.visualCatalogue??[],evidenceVisualRecords(input.evidence))&&isDeepStrictEqual(a.revision,revisionMetadata(producer,a.revisionResponses).revision),'INVALID_CORRECTION','Corrected artifact evidence provenance changed');
  const attempt=producer.attempts.find(t=>isDeepStrictEqual(t.receipt,a.executionReceipt));
  requireValue(attempt&&sameExecutor(attempt.executor,a.author),'INVALID_CORRECTION','Original successful producer attempt required');
  revisionProductionReceipt(p,producer,attempt,a.executionReceipt);
  let request=buildStageRequest({stage:producer.stage,brief:producer.task.brief,inputArtifacts:producer.task.revisionInputArtifacts??[],sourceRecords:producer.task.sourceRecords??[],visualCatalogue:producer.task.visualCatalogue??[],correctionInput:input,copyContractVersion:producer.task.copyContractVersion,strategyContractVersion:producer.task.strategyContractVersion,strategyBasis:producer.task.strategyBasis,researchContractVersion:producer.task.researchContractVersion,researchDataBasis:producer.task.researchDataBasis,researchRevision:producer.task.researchRevision});
  if(producer.stage==='research'&&producer.task.researchMethod)request=applyResearchMethod(request,producer.task.researchMethod,producer.task.researchQuestionRegistration);
  const producerInputPacket=JSON.stringify({runId:attempt.id,model:producer.binding.model,prompt:request.prompt,outputSchema:request.outputSchema,...(input.materials.length?{images:input.materials}:{})});
  const taskCard=input.taskCardSnapshot,upstreamArtifacts=structuredClone(producer.task.revisionInputArtifacts??[]);
  requireValue(taskCard&&taskCard.id===input.taskCardId&&taskCard.brief===producer.task.brief&&isDeepStrictEqual(taskCard,p.taskCards.find(c=>c.id===input.taskCardId)),'INVALID_CORRECTION','Original task snapshot required');
  const body={version:'correction-context-v1',evidenceManifestHash:input.evidence.manifestHash,producerJobId:producer.id,producerAttemptId:attempt.id,producerInputPacket,producerInputPacketHash:a.executionReceipt.inputPacketHash,producerReceiptHash:evidenceHash(a.executionReceipt),taskCard:structuredClone(taskCard),taskCardHash:evidenceHash(taskCard),upstreamArtifacts,upstreamSnapshotHash:evidenceHash(upstreamArtifacts),materialManifestHash:evidenceHash(input.materials),artifactId:a.id,contentHash:a.contentHash};
  return validateHandlingContext({...body,contextHash:evidenceHash(body)},{artifactId:a.id,contentHash:a.contentHash,correctionInput:input});
}
function correctionReviewTargetWithin(evaluation, p,job){
  const a=targetWithin(evaluation, p,job.targetArtifactId),producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)&&j.task?.correctionInput),input=job.task.correctionReviewInput;
  requireValue(producer&&[CORRECTION_PROTOCOL,LATEST_CORRECTION_PROTOCOL].includes(a.revision?.protocolVersion),'INVALID_CORRECTION','Typed corrected artifact required');
  validateJobRevisionWithin(evaluation, p,producer,false);
  requireValue(isDeepStrictEqual(job.inputVersionIds,[a.id])&&input?.artifactId===a.id&&input.contentHash===a.contentHash
    &&isDeepStrictEqual(input.correctionInput,producer.task.correctionInput)&&isDeepStrictEqual(input.responses,a.revisionResponses)
    &&isDeepStrictEqual(a.revision,revisionMetadata(producer,a.revisionResponses).revision),'INVALID_CORRECTION','Correction check must retain exact production provenance');
  if([COMPLETE_CORRECTION_REVIEW_PROTOCOL,APPLICABILITY_HANDLING].includes(input.reviewProtocolVersion))requireValue(isDeepStrictEqual(input.context,correctionHandlingContext(p,a.id)),'INVALID_CORRECTION','Correction check context must be derived from exact registered producer');
  if(producer.task.correctionInput.protocolVersion===LATEST_CORRECTION_PROTOCOL)requireValue([COMPLETE_CORRECTION_REVIEW_PROTOCOL,APPLICABILITY_HANDLING].includes(input.reviewProtocolVersion),'INVALID_CORRECTION','New correction requires complete handling context');
  if(input.reviewProtocolVersion===APPLICABILITY_HANDLING)requireValue(isDeepStrictEqual(input.assessment,validatedResearchAssessmentWithin(evaluation, p,a.id)),'STALE_RESEARCH_ASSESSMENT','Handling requires current actual independent assessment');
  return buildCorrectionReviewRequest(input);
}
function correctionReviewReceiptWithin(evaluation, p,job,attempt,receipt,raw,reportId){
  verificationReceipt(p,artifact(p,job.targetArtifactId),job,attempt,receipt,reportId);
  const request=correctionReviewTargetWithin(evaluation, p,job);
  if(job.task.correctionReviewInput.reviewProtocolVersion===APPLICABILITY_HANDLING)requireValue(receipt.model===job.binding.model,'INVALID_EXECUTION_RECEIPT','Handling-v4 requires actual assigned model');
  const packet=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema,...(request.manifest.length?{images:request.manifest}:{})});
  requireValue(receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.inputPacketHash===hash(packet)
    &&['signal','reason','error'].every(k=>receipt[k]==null)&&isDeepStrictEqual(receipt.images?.length?imageManifest(receipt.images):[],request.manifest),
    'INVALID_EXECUTION_RECEIPT','Correction check requires exact successful provider packet and materials');
  let parsed;try{parsed=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Original correction report required');}
  requireValue(isDeepStrictEqual(parsed,raw)&&(!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(parsed,receipt.parsedOutput)),
    'INVALID_EXECUTION_RECEIPT','Correction check raw report changed');
  if(receipt.providerExecution)requireValue(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),
    'INVALID_EXECUTION_RECEIPT','Correction original execution changed');
}
function requireCorrectionReviewWithin(evaluation, p,a){
  const producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)&&j.task?.correctionInput);
  requireValue(producer&&revisionGenerationCurrentWithin(evaluation, p,a.stage,producer.task.correctionInput),'STALE_CORRECTION','Correction sources or human generation changed');
  const reports=(p.correctionReviews??[]).filter(r=>r.artifactId===a.id);
  const applicability=(p.readinessReports??[]).some(r=>r.artifactId===a.id&&r.protocolVersion===APPLICABILITY_PROTOCOL)?validatedResearchAssessmentWithin(evaluation, p,a.id):null;
  const interpretation=applicability?validateResearchReadinessOutput(applicability.rawReport,applicability.input):null;
  if(applicability)requireValue(reports.some(r=>r.protocolVersion===APPLICABILITY_HANDLING&&r.assessmentId===applicability.id),'CORRECTION_REVIEW_REQUIRED','Current independently assessed handling-v4 required');
  requireValue(reports.length,'CORRECTION_REVIEW_REQUIRED','Independent correction-handling check required in addition to all ordinary gates');
  for(const report of reports){
    const job=p.jobs.find(j=>j.id===report.jobId),attempt=job?.attempts.find(t=>t.id===report.attemptId);
    requireValue(job?.purpose==='correction_review'&&job.status==='succeeded'&&attempt?.status==='succeeded'&&sameExecutor(attempt.executor,report.context)
      &&isDeepStrictEqual(attempt.receipt,report.executionReceipt),'INVALID_CORRECTION','Exact successful correction check required');
    independentVerifier(p,a,report.context);correctionReviewReceiptWithin(evaluation, p,job,attempt,report.executionReceipt,report.rawReport,report.id);
    const validated=validateCorrectionReviewOutput(report.rawReport,job.task.correctionReviewInput);
    requireValue(report.reportHash===hash(JSON.stringify(validated,null,2)),'INVALID_CORRECTION','Correction check changed');
    requireValue(!validated.preservationCheck.violations.length,'HARD_BLOCKER','Preservation violations cannot be waived');
    for(const finding of validated.findings.filter(f=>f.status==='unresolved')){
      if(interpretation){
        const original=interpretation.obligationAssessments.find(e=>e.originKey===finding.findingKey),wrapper=applicability.input.applicability.origins.find(o=>o.sourceKey===`correction_review:${report.id}`&&o.originalValue.findingKey===finding.findingKey),entry=wrapper?interpretation.obligationAssessments.find(e=>e.originKey===wrapper.key):original;
        if(original?.preservation.state==='retained'&&entry?.preservation.state==='retained'&&original.procurement.kind==='conditional_later'&&entry.procurement.kind==='conditional_later')continue;
      }
      requireValue(finding.category==='creative_preference'&&correctionFindingCreative(job.task.correctionReviewInput.correctionInput.sources,finding.findingKey),'HARD_BLOCKER','Factual, missing-material and remediation risks cannot be waived');
      requireValue(p.decisions.some(d=>d.kind==='adopt-creative'&&d.human&&d.artifactId===a.id&&d.policyVersion===currentPolicy(p).version&&d.correctionReviewIds?.includes(report.id)),
        'FEEDBACK_UNRESOLVED','Unresolved creative correction requires explicit current human adoption');
    }
  }
}
function feedbackReviewTargetWithin(evaluation, p, job) {
  const a = targetWithin(evaluation, p, job.targetArtifactId), input = job.task.feedbackReviewInput;
  const producer = p.jobs.find(item => item.outputVersionIds?.includes(a.id) && (!item.purpose || item.purpose === 'stage'));
  requireValue(a.revision && producer?.task?.revisionInput && revisionGenerationCurrentWithin(evaluation, p, a.stage, producer.task.revisionInput),
    'STALE_FEEDBACK', 'Feedback review requires a current revision generation');
  validateJobRevisionWithin(evaluation, p, producer, false);
  requireValue(isDeepStrictEqual(job.inputVersionIds, [a.id]) && input?.artifactId === a.id && input.contentHash === a.contentHash
    && hash(JSON.stringify(input.content, null, 2)) === a.contentHash
    && isDeepStrictEqual(input.revisionInput, producer.task.revisionInput)
    && isDeepStrictEqual(input.responses, a.feedbackResponses)
    && isDeepStrictEqual(revisionMetadata(producer, a.feedbackResponses).revision, a.revision),
    'INVALID_FEEDBACK_REVIEW', 'Feedback review must bind exact revision content, feedback and responses');
  return buildFeedbackReviewRequest(input);
}
function feedbackReviewReceiptWithin(evaluation, p, job, attempt, receipt, rawReport, reportId) {
  const a = artifact(p, job.targetArtifactId);
  verificationReceipt(p, a, job, attempt, receipt, reportId);
  const request = feedbackReviewTargetWithin(evaluation, p, job);
  requireValue(receipt.runId === attempt.id && receipt.requestedModel === job.binding.model
    && ['signal', 'reason', 'error'].every(key => receipt[key] == null)
    && isDeepStrictEqual((receipt.images?.length ? imageManifest(receipt.images) : []), request.manifest), 'INVALID_EXECUTION_RECEIPT', 'Original feedback invocation and material images required');
  const packet = JSON.stringify({runId: attempt.id, model: job.binding.model, prompt: request.prompt, outputSchema: request.outputSchema,
    ...(request.manifest.length ? {images: request.manifest} : {})});
  requireValue(receipt.inputPacketHash === hash(packet), 'INVALID_EXECUTION_RECEIPT', 'Feedback receipt must bind exact review packet');
  let parsed; try { parsed = JSON.parse(receipt.responseText); } catch { fail('INVALID_EXECUTION_RECEIPT', 'Original feedback response required'); }
  requireValue(isDeepStrictEqual(parsed, rawReport) && (!Object.hasOwn(receipt, 'parsedOutput') || isDeepStrictEqual(receipt.parsedOutput, parsed)),
    'INVALID_EXECUTION_RECEIPT', 'Feedback report must match original provider response');
  if (Object.hasOwn(receipt, 'providerExecution')) requireValue(receipt.providerExecution
    && Object.entries(receipt.providerExecution).every(([key, value]) => isDeepStrictEqual(value, receipt[key])),
    'INVALID_EXECUTION_RECEIPT', 'Original provider execution must agree with receipt');
}
function requireFeedbackReviewWithin(evaluation, p, a) {
  if([CORRECTION_PROTOCOL,LATEST_CORRECTION_PROTOCOL].includes(a.revision?.protocolVersion)){requireCorrectionReviewWithin(evaluation, p,a);return;}
  const feedback = stageFeedback(p, a.stage);
  if (!feedback.length) return;
  requireValue(a.revision && revisionGenerationCurrentWithin(evaluation, p, a.stage, a.revision), 'FEEDBACK_REVISION_REQUIRED', 'Current feedback has not been incorporated into a new revision');
  const reports = (p.feedbackReviews ?? []).filter(item => item.artifactId === a.id);
  requireValue(reports.length, 'FEEDBACK_REVIEW_REQUIRED', 'Independent feedback handling review required');
  for (const report of reports) {
    const job = p.jobs.find(item => item.id === report.jobId), attempt = job?.attempts.find(item => item.id === report.attemptId);
    requireValue(job?.purpose === 'feedback_review' && job.status === 'succeeded' && attempt?.status === 'succeeded'
      && sameExecutor(attempt.executor, report.context) && isDeepStrictEqual(attempt.receipt, report.executionReceipt),
      'INVALID_FEEDBACK_REVIEW', 'Feedback report requires its exact successful attempt');
    independentVerifier(p, a, report.context);
    feedbackReviewReceiptWithin(evaluation, p, job, attempt, report.executionReceipt, report.rawReport, report.id);
    const validated = validateFeedbackReviewOutput(report.rawReport, job.task.feedbackReviewInput);
    requireValue(report.reportHash === hash(JSON.stringify(validated, null, 2)), 'INVALID_FEEDBACK_REVIEW', 'Stored feedback review changed');
    for (const finding of validated.findings.filter(item => item.status === 'unresolved')) {
      requireValue(finding.category === 'creative_preference', 'HARD_BLOCKER', 'Factual risk or missing material cannot be waived');
      requireValue(p.decisions.some(item => item.kind === 'adopt-creative' && item.human && item.artifactId === a.id
        && item.policyVersion === currentPolicy(p).version && item.feedbackReviewIds?.includes(report.id)),
        'FEEDBACK_UNRESOLVED', 'Unresolved creative feedback requires explicit current human adoption');
    }
  }
}

export function researchReviewConstraints(task){return Object.values(task?.upstreamReviewConstraints??{}).some(c=>(c.readiness??[]).some(r=>r.rawReport.protocolVersion===APPLICABILITY_PROTOCOL))?task.upstreamReviewConstraints:null;}
function verificationTargetWithin(evaluation, p, job) {
  const a = targetWithin(evaluation, p, job.targetArtifactId);
  const input = job.task.verificationInput;
  const card = p.taskCards.find(item => item.id === p.activeTaskCardId);
  requireValue(isDeepStrictEqual(job.inputVersionIds, [a.id]) && input?.artifactId === a.id && input.contentHash === a.contentHash,
    'INVALID_VERIFICATION_INPUT', 'Verification must bind the exact artifact and hash');
  requireValue(input.taskCardConfirmed === true && input.taskCard?.id === card.id && input.taskCard?.brief === card.brief
    && p.confirmations.some(item => item.taskCardId === card.id), 'INVALID_VERIFICATION_INPUT', 'Verification requires the actual confirmed task card');
  requireValue(isDeepStrictEqual(input.content?.claims, a.claims) && isDeepStrictEqual(input.sourceRecords ?? [], a.technicalReceipts.sourceCatalogue?.records ?? []),
    'INVALID_VERIFICATION_INPUT', 'Claim manifest and sources must match the frozen artifact');
  if(a.strategyContract?.version===SIMPLE_STRATEGY_VERSION){const {claims,...original}=input.content;requireValue(Array.isArray(claims)&&claims.length===0&&hash(JSON.stringify(original,null,2))===a.contentHash,'INVALID_VERIFICATION_INPUT','Simple strategy verification must read exact original three-block content');}
  if(evidenceProtocolCapabilities(evidenceReviewProtocol(input)).fullTaskCard)requireValue(isDeepStrictEqual(input.taskCard,card),'INVALID_VERIFICATION_INPUT','Full current task card required');
  if(a.stage==='research'&&hasResearchData(p,a)){const producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id));requireValue(evidenceReviewProtocol(input)===NUMERICAL_REVIEW_PROTOCOL&&isDeepStrictEqual(input.researchDataBasis,producer.task.researchDataBasis)&&hash(JSON.stringify(input.content,null,2))===a.contentHash,'INVALID_VERIFICATION_INPUT','Numerical review requires original complete research and basis');}
  artifactVisualCatalogue(p, a, input.visualCatalogue ?? []);
  const producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)&&(j.task?.ownerEdgeId||researchReviewConstraints(j.task)));
  if(producer)requireValue(isDeepStrictEqual(input.ownerConstraints,producer.task.upstreamReviewConstraints),'INVALID_VERIFICATION_INPUT','Copy review must read exact frozen owner constraints');
  if (evidenceProtocolCapabilities(evidenceReviewProtocol(input)).catalogueState) requireValue(isDeepStrictEqual(input.catalogueState, projectCatalogueState(p, a)),
    'INVALID_VERIFICATION_INPUT', 'Verification must freeze current trusted catalogue state');
  buildEvidenceReviewRequest(input);
  return a;
}
function verificationReceipt(p, a, job, attempt, receipt, reportId, rawReport) {
  checkReceipt(job, attempt, receipt);
  requireValue(ordinaryHasContext(receipt) && nonempty(receipt.inputPacketHash) && ordinarySuccessfulStatus(receipt),
    'INVALID_EXECUTION_RECEIPT', 'Verification requires a successful actual provider invocation and packet hash');
  if (job.purpose === 'verification' && evidenceProtocolCapabilities(evidenceReviewProtocol(job.task.verificationInput)).catalogueState) {
    const request = buildEvidenceReviewRequest(job.task.verificationInput);
    const packet = JSON.stringify({runId: attempt.id, model: job.binding.model, prompt: request.prompt, outputSchema: request.outputSchema});
    requireValue(receipt.runId === attempt.id && receipt.requestedModel === job.binding.model && receipt.model === job.binding.model
      && ['signal', 'reason', 'error'].every(key => receipt[key] == null) && receipt.inputPacketHash === hash(packet),
      'INVALID_EXECUTION_RECEIPT', 'V3 verification requires exact original provider packet and model binding');
    let parsed; try { parsed = JSON.parse(receipt.responseText); } catch { fail('INVALID_EXECUTION_RECEIPT', 'Original verification response required'); }
    requireValue(isDeepStrictEqual(parsed, rawReport) && (!Object.hasOwn(receipt, 'parsedOutput') || isDeepStrictEqual(receipt.parsedOutput, parsed)),
      'INVALID_EXECUTION_RECEIPT', 'Verification report must match original provider response');
    if (Object.hasOwn(receipt, 'providerExecution')) requireValue(receipt.providerExecution
      && Object.entries(receipt.providerExecution).every(([key, value]) => isDeepStrictEqual(value, receipt[key])),
      'INVALID_EXECUTION_RECEIPT', 'Original provider execution must agree with receipt');
  }
  requireValue(!p.artifacts.some(item => ordinarySameContext(item.executionReceipt,receipt))
    && !p.jobs.some(item => item.attempts.some(prior => prior.id !== attempt.id && ordinarySameContext(prior.receipt,receipt)))
    && !(p.verifications ?? []).some(report => report.id !== reportId && ordinarySameContext(report.executionReceipt,receipt))
    && !(p.readinessReports ?? []).some(report => report.id !== reportId && ordinarySameContext(report.executionReceipt,receipt))
    && !(p.correctionReviews ?? []).some(report => report.id !== reportId && ordinarySameContext(report.executionReceipt,receipt))
    && !(p.feedbackReviews ?? []).some(report => report.id !== reportId && ordinarySameContext(report.executionReceipt,receipt)),
    'REVIEW_THREAD_REUSED', 'Verification provider thread must be independent of authors and earlier verifications');
}
export function projectCaseEvidenceCatalogue(p) {
  const checked = (p.caseIdentityReviews ?? []).filter(report => report.taskCard.id === p.activeTaskCardId).map(report => {
    const job = p.jobs.find(item => item.id === report.jobId), attempt = job?.attempts.find(item => item.id === report.attemptId);
    requireValue(job?.purpose === 'case_identity' && job.status === 'succeeded' && attempt?.status === 'succeeded'
      && sameExecutor(attempt.executor, report.context) && isDeepStrictEqual(attempt.receipt, report.executionReceipt),
      'INVALID_CASE_IDENTITY', 'Successful independent identity job and exact receipt required');
    observationReviewExecutor(p, job, report.context);
    observationReceipt(p, job, attempt, report.executionReceipt, report.rawReport);
    const input = job.task.caseIdentityInput;
    const validated = validateCaseIdentityOutput(report.rawReport, input, [input.referenceImage, input.sourceImage]);
    requireValue(report.reportHash === hash(JSON.stringify(validated, null, 2)), 'INVALID_CASE_IDENTITY', 'Stored identity report changed');
    const key = JSON.stringify([input.taskCard.id, input.taskCard.brief, input.pageCapture.record.raw.sha256,
      input.sourceImageCapture.record.raw.sha256, input.referenceImage.sha256, input.sourceImage.sourceImageUrl ?? input.sourceImage.provenance?.sourceImageUrl]);
    return {report, input, validated, key};
  });
  const blocked = new Set(checked.filter(item => item.validated.verdict !== 'usable').map(item => item.key));
  return checked.filter(item => item.validated.verdict === 'usable' && !blocked.has(item.key)).map(({report, input}) => {
    const evidence = buildCaseEvidenceRecord({input, rawReport: report.rawReport, actualImages: [input.referenceImage, input.sourceImage], id: `case_${report.id}`});
    requireValue(isDeepStrictEqual(evidence, report.caseEvidence), 'INVALID_CASE_IDENTITY', 'Case evidence must exactly match immutable successful report');
    return evidence;
  });
}

export function projectCatalogueState(p, artifact) {
  const sourceRecords = artifact.technicalReceipts?.sourceCatalogue?.records ?? [];
  const catalogue = projectCaseEvidenceCatalogue(p);
  const state = sourceRecords.filter(source => catalogue.some(record => isDeepStrictEqual(record, source))).map(source => {
    const report = p.caseIdentityReviews.find(item => isDeepStrictEqual(item.caseEvidence, source));
    return {sourceId: source.id, sourceRecordHash: evidenceStateHash(source), taskCardId: p.activeTaskCardId,
      caseReviewId: report.id, caseReviewHash: report.reportHash, casePacketHash: source.caseIdentity.packetHash,
      identityStatus: 'identity_checked', taskFit: 'same_use', sourceVerification: 'captured'};
  });
  return validateCatalogueState(state, {sourceRecords, taskCard: p.taskCards.find(item => item.id === p.activeTaskCardId)});
}

function currentCaseSources(p, sources) {
  currentCapturedTextSources(p,sources);
  const claimed=sources.filter(source=>source.identityStatus!==undefined || source.caseIdentity!==undefined);
  if(!claimed.length)return;
  const catalogue=projectCaseEvidenceCatalogue(p);
  requireValue(claimed.every(source=>catalogue.some(item=>isDeepStrictEqual(item,source))), 'INVALID_CASE_IDENTITY', 'Identity-checked sources require exact successful project case report');
}
function caseIdentityTarget(p, job) {
  const input = job.task.caseIdentityInput, card = p.taskCards.find(item => item.id === p.activeTaskCardId);
  requireValue(isDeepStrictEqual(input?.taskCard, card) && p.confirmations.some(item => item.taskCardId === card.id), 'INVALID_CASE_IDENTITY', 'Identity requires current confirmed task card');
  for (const capsule of [input.pageCapture, input.sourceImageCapture]) requireValue(p.sourceCaptures.some(item => item.recordHash === capsule.recordHash && isDeepStrictEqual(item.record, capsule.record)), 'INVALID_CASE_IDENTITY', 'Registered captures required');
  for (const image of [input.referenceImage, input.sourceImage]) requireValue(p.imageAssets.some(asset => isDeepStrictEqual(imageManifest([asset]), imageManifest([image]))), 'INVALID_CASE_IDENTITY', 'Registered immutable images required');
  return buildCaseIdentityRequest(input);
}
function observationTarget(p, job) {
  const input = job.task.observationInput;
  const card = p.taskCards.find(item => item.id === p.activeTaskCardId);
  requireValue(isDeepStrictEqual(input?.taskCard, card) && isDeepStrictEqual(job.inputVersionIds, [card.id])
    && p.confirmations.some(item => item.taskCardId === card.id), 'INVALID_OBSERVATION_INPUT', 'Observation requires the current confirmed task card');
  const manifest = imageManifest(input.images);
  requireValue(isDeepStrictEqual(input.images, manifest) && manifest.every(image => {
    const asset = p.imageAssets.find(item => item.id === image.imageId);
    return asset && isDeepStrictEqual(imageManifest([asset])[0], image);
  }), 'INVALID_OBSERVATION_INPUT', 'Observation images must match registered immutable assets in order');
  return buildImageObservationRequest({images: manifest});
}
function observationReviewTarget(p, job) {
  const input = job.task.observationReviewInput;
  const observation = p.imageObservations.find(item => item.id === job.targetObservationId);
  const card = p.taskCards.find(item => item.id === p.activeTaskCardId);
  requireValue(observation && isDeepStrictEqual(input, {observationId: observation.id, contentHash: observation.reportHash,
    taskCard: observation.taskCard, images: observation.images, rawReport: observation.rawReport})
    && isDeepStrictEqual(input.taskCard, card) && p.confirmations.some(item => item.taskCardId === card.id)
    && isDeepStrictEqual(job.inputVersionIds, [observation.id]), 'INVALID_OBSERVATION_INPUT', 'Review requires the exact registered observation and current confirmed task card');
  observationTarget(p, {task: {observationInput: input}, inputVersionIds: [card.id]});
  return buildImageObservationReviewRequest(input);
}
function observationReviewExecutor(p, job, context) {
  observationExecutor(p, job, context);
  requireValue(!p.jobs.some(item => item.id !== job.id && item.attempts.some(attempt => {
    const author = attempt.executor;
    return intersectsLineage(author, context);
  })), 'SELF_REVIEW', 'Observation reviewer must be independent of observers and research authors');
}
function observationExecutor(p, job, context) {
  requireValue(context.actorType === 'agent', 'EXECUTOR_REQUIRED', 'Observation requires a trusted executor');
  for (const a of p.artifacts) independentVerifier(p, a, context);
  requireValue(!p.jobs.some(item => item.id !== job.id && item.purpose !== 'observation' && item.attempts.some(attempt =>
    ['actorId', 'runId', 'contextId'].some(key => attempt.executor[key] === context[key]))),
  'SELF_REVIEW', 'Observation executor must be separate from research and review execution');
}
function observationReceipt(p, job, attempt, receipt, rawReport) {
  verificationReceipt(p, null, job, attempt, receipt);
  const request = job.purpose === 'case_identity' ? caseIdentityTarget(p, job) : job.purpose === 'observation_review' ? observationReviewTarget(p, job) : observationTarget(p, job);
  requireValue(receipt.runId === attempt.id && receipt.requestedModel === job.binding.model
    && ['signal', 'reason', 'error'].every(key => receipt[key] == null)
    && isDeepStrictEqual(imageManifest(receipt.images), request.manifest),
    'INVALID_EXECUTION_RECEIPT', 'Successful original image invocation required');
  const packet = JSON.stringify({runId: attempt.id, model: job.binding.model, prompt: request.prompt, outputSchema: request.outputSchema, images: request.manifest});
  requireValue(receipt.inputPacketHash === hash(packet), 'INVALID_EXECUTION_RECEIPT', 'Receipt must bind the exact observation request and images');
  let parsed;
  try { parsed = JSON.parse(receipt.responseText); } catch { fail('INVALID_EXECUTION_RECEIPT', 'Original observation response required'); }
  requireValue(isDeepStrictEqual(parsed, rawReport) && (!Object.hasOwn(receipt, 'parsedOutput') || isDeepStrictEqual(receipt.parsedOutput, parsed)),
    'INVALID_EXECUTION_RECEIPT', 'Report must match the original provider response');
  if (Object.hasOwn(receipt, 'providerExecution')) requireValue(receipt.providerExecution
    && Object.entries(receipt.providerExecution).every(([key, value]) => isDeepStrictEqual(value, receipt[key])),
    'INVALID_EXECUTION_RECEIPT', 'Retained provider execution must match the receipt');
}
function assessmentView(p,excludedJobId){
 const excluded=new Set([excludedJobId]);
 const assessmentId=(p.readinessReports??[]).find(r=>r.jobId===excludedJobId)?.id??p.jobs.find(j=>j.id===excludedJobId)?.outputVersionIds?.[0];
 if(assessmentId)for(const job of p.jobs)if(job.task?.correctionReviewInput?.assessment?.id===assessmentId||job.task?.handoffInput?.assessment?.id===assessmentId)excluded.add(job.id);
 const view=transferSemanticReader(p,{...p,jobs:p.jobs.filter(j=>!excluded.has(j.id)&&!(j.purpose==='coverage_challenge'&&j.targetArtifactId===p.jobs.find(x=>x.id===excludedJobId)?.targetArtifactId))});
 for(const field of ['verifications','readinessReports','handoffReports','feedbackReviews','correctionReviews','creativeReports'])view[field]=(p[field]??[]).filter(r=>!excluded.has(r.jobId));
 return view;
}
export function researchRevisionAuthority(p,artifactId) { return researchRevisionAuthorityWithin(new WeakMap(), ...arguments); }
function researchRevisionAuthorityWithin(evaluation, p,artifactId){
 const assessment=validatedResearchAssessmentWithin(evaluation, p,artifactId),report=validateResearchReadinessOutput(assessment.rawReport,assessment.input);
 return {protocolVersion:RESEARCH_REVISION_STAGE_PROTOCOL,assessmentId:assessment.id,assessmentSourceKey:`readiness:${assessment.id}`,assessmentReportHash:assessment.reportHash,generationHash:report.generationHash,restrictionManifestHash:report.applicabilityEvaluation.restrictionManifestHash};
}
export function researchAssessmentContext(p,artifactId,assignment,excludedJobId) { return researchAssessmentContextWithin(new WeakMap(), ...arguments); }
function researchAssessmentContextWithin(evaluation, p,artifactId,assignment,excludedJobId){
 const a=artifact(p,artifactId),view=assessmentView(p,excludedJobId),lineage=creationLineage(view,a),sources=new Map();
 for(const item of lineage){
  const producer=view.jobs.find(j=>j.outputVersionIds?.includes(item.id)&&j.task?.correctionInput);
  for(const source of [...(producer?.task.correctionInput.enrichment?.retainedContext.sources??[]),...(producer?.task.correctionInput.sources??[]),...revisionSourcesWithin(evaluation, transferSemanticReader(view,{...view,coverageChallenges:(view.coverageChallenges??[]).filter(r=>item.id!==a.id||r.artifactId!==a.id),jobs:view.jobs.filter(j=>item.id!==a.id||j.purpose!=='coverage_challenge'||j.targetArtifactId!==a.id)}),item.id)]){
   if(sources.has(source.key))requireValue(isDeepStrictEqual(sources.get(source.key),source),'INVALID_RESEARCH_APPLICABILITY','Conflicting immutable source ancestry');else sources.set(source.key,source);
  }
 }
 const ids=new Set(lineage.map(item=>item.id)),collections=['verifications','readinessReports','handoffReports','feedbackReviews','correctionReviews','creativeReports','reviews','decisions'];
 const history=collections.flatMap(kind=>(view[kind]??[]).filter(r=>ids.has(r.artifactId)).map(record=>({kind,id:record.id??null,artifactId:record.artifactId,jobId:record.jobId??null,recordHash:applicabilityHash(record)})));
 const taskCard=p.taskCards.find(c=>c.id===p.activeTaskCardId),policy=currentPolicy(p);
 return applicabilityContext({sources:[...sources.values()].sort((a,b)=>a.key.localeCompare(b.key)),taskCard,policy,assignment,history,upstreams:lineage.filter(item=>item.id!==a.id).map(item=>({artifactId:item.id,contentHash:item.contentHash,taskCardId:item.taskCardId})),decision:{targetStage:'strategy',description:'Develop bounded exploratory strategy for the confirmed static creative proposal.',requirement:taskCard.brief}});
}
function researchAssessmentReceipt(p,job,attempt,receipt,raw,reportId){
 if(job.task.splitReadiness){validateSplitExecution(p,job,attempt,receipt,raw);return;}

 verificationReceipt(p,artifact(p,job.targetArtifactId),job,attempt,receipt,reportId);
 const request=buildResearchReadinessRequest(job.task.readinessInput),packet=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema});
 requireValue(receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.model===job.binding.model&&ordinarySuccessfulStatus(receipt)&&receipt.inputPacketHash===hash(packet)&&['signal','reason','error'].every(k=>receipt[k]==null),'INVALID_EXECUTION_RECEIPT','Assessment requires exact actual independent invocation');
 let parsed;try{parsed=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Actual assessment response required');}
 requireValue(isDeepStrictEqual(parsed,raw)&&(!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(parsed,receipt.parsedOutput)),'INVALID_EXECUTION_RECEIPT','Assessment raw response changed');
 if(receipt.providerExecution)requireValue(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),'INVALID_EXECUTION_RECEIPT','Assessment provider receipt changed');
}
function readinessReportEvidence(p,report){
 const job=p.jobs.find(j=>j.id===report.jobId),attempt=job?.attempts.find(t=>t.id===report.attemptId),a=artifact(p,report.artifactId);
 requireValue(job?.purpose==='readiness'&&attempt&&a&&job.targetArtifactId===a.id&&job.task.readinessInput.contentHash===a.contentHash&&sameExecutor(attempt.executor,report.context)&&isDeepStrictEqual(report.resolutionId?savedReadinessReceipt(attempt,(p.readinessResolutions??[]).find(r=>r.id===report.resolutionId)?.proof):attempt.receipt,report.executionReceipt),'INVALID_RESEARCH_APPLICABILITY','Exact original assessment identity required');
 independentVerifier(p,a,report.context);independentVerifier(p,a,attempt.executor);
 const input=job.task.readinessInput;
 requireValue(isDeepStrictEqual(job.inputVersionIds,[a.id])&&isDeepStrictEqual(input.sourceRecords??[],a.technicalReceipts?.sourceCatalogue?.records??[])&&isDeepStrictEqual(input.visualCatalogue??[],a.technicalReceipts?.visualCatalogue??[])&&hash(JSON.stringify(input.content,null,2))===a.contentHash,'INVALID_RESEARCH_APPLICABILITY','Original reviewed artifact and catalogues changed');
 let normalized;
 if(report.resolutionId){
  const resolution=(p.readinessResolutions??[]).find(r=>r.id===report.resolutionId&&r.kind==='recovered-result');
  requireValue(resolution&&resolution.jobId===job.id&&resolution.attemptId===attempt.id&&resolution.reportId===report.id&&resolution.proofHash===hash(JSON.stringify(resolution.proof)),'INVALID_RESEARCH_APPLICABILITY','Registered recovery proof required');
  const evidence=validateSavedReadinessProof(p.id,job,attempt,resolution.proof);
  requireValue(isDeepStrictEqual(evidence.raw,report.rawReport),'INVALID_RESEARCH_APPLICABILITY','Recovered raw report changed');
  const recoveredReceipt=savedReadinessReceipt(attempt,resolution.proof);checkReceipt(job,attempt,recoveredReceipt);
  requireValue(!p.artifacts.some(a=>ordinarySameContext(a.executionReceipt,recoveredReceipt))&&!p.jobs.some(j=>j.attempts.some(t=>t.id!==attempt.id&&ordinarySameContext(t.receipt,recoveredReceipt))),'REVIEW_THREAD_REUSED','Recovery thread reused');
  for(const field of ['verifications','readinessReports','handoffReports','correctionReviews','feedbackReviews','creativeReports'])requireValue(!(p[field]??[]).some(r=>r.id!==report.id&&ordinarySameContext(r.executionReceipt,recoveredReceipt)),'REVIEW_THREAD_REUSED','Recovery report thread reused');
  normalized=evidence.normalized;
 }else{
  requireValue(job.status==='succeeded'&&attempt.status==='succeeded'&&job.outputVersionIds?.includes(report.id),'INVALID_RESEARCH_APPLICABILITY','Successful assessment execution required');
  researchAssessmentReceipt(p,job,attempt,report.executionReceipt,report.rawReport,report.id);
  normalized=validateResearchReadinessOutput(report.rawReport,job.task.readinessInput);
 }
 requireValue(report.reportHash===hash(JSON.stringify(normalized,null,2))&&Object.entries(normalized).every(([k,v])=>isDeepStrictEqual(v,report[k])),'INVALID_RESEARCH_APPLICABILITY','Assessment normalization changed');
 return {job,attempt,normalized};
}
function uncertainReadiness(p,jobId,attemptId){
 const job=p.jobs.find(j=>j.id===jobId),attempt=job?.attempts.find(t=>t.id===attemptId);
 requireValue(job?.purpose==='readiness'&&job.task.readinessInput.reviewProtocolVersion===APPLICABILITY_PROTOCOL&&job.status==='awaiting_reconciliation'&&attempt?.status==='awaiting_reconciliation'&&job.attempts.at(-1).id===attemptId,'INVALID_READINESS_RESOLUTION','Original uncertain V2 attempt required');
 return {job,attempt};
}
function unresolvedReadiness(p,artifactId){return p.jobs.filter(j=>j.purpose==='readiness'&&j.targetArtifactId===artifactId&&j.status==='awaiting_reconciliation'&&!(p.readinessResolutions??[]).some(r=>r.kind==='recovered-result'&&r.jobId===j.id));}
export function readinessReplacementProposal(p,jobId,attemptId,binding) { return readinessReplacementProposalWithin(new WeakMap(), ...arguments); }
function readinessReplacementProposalWithin(evaluation, p,jobId,attemptId,binding){
 const {job,attempt}=uncertainReadiness(p,jobId,attemptId);
 requireValue(!(p.readinessResolutions??[]).some(r=>r.jobId===jobId&&['recovered-result','replacement-authorized','local-terminal-failure-observed'].includes(r.kind)),'READINESS_RESOLUTION_EXISTS','Origin already resolved or replacement granted');
 requireValue(!job.readinessResolutionId&&!job.readinessFailureResolutionId,'READINESS_CALL_LIMIT','A replacement cannot grant another replacement');
 requireValue(binding&&['providerId','model','role'].every(k=>nonempty(binding[k])),'INVALID_BINDING','Configured replacement binding required');
 const input={...structuredClone(job.task.readinessInput),applicability:researchAssessmentContextWithin(evaluation, p,job.targetArtifactId,binding)};
 const candidate={...job,binding,task:{...job.task,readinessInput:input}};readinessTargetWithin(evaluation, p,candidate);
 const proposal={jobId,attemptId,revision:p.revision,targetArtifactId:job.targetArtifactId,targetContentHash:input.contentHash,originalReceiptHash:hash(JSON.stringify(attempt.receipt)),binding:structuredClone(binding),readinessInput:input,additionalCalls:1,originalOutcome:'unknown',originalCost:attempt.receipt?.cost??null,replacementCost:null};
 return {...proposal,proposalId:hash(JSON.stringify(proposal))};
}
export function validatedResearchAssessment(p,artifactId) { return validatedResearchAssessmentWithin(new WeakMap(), ...arguments); }
function validatedResearchAssessmentWithin(evaluation, p,artifactId){
 return successfulEvaluation(evaluation, p, 'validatedResearchAssessment', artifactId, () => {
 const a=artifact(p,artifactId),reports=(p.readinessReports??[]).filter(r=>r.artifactId===artifactId&&r.protocolVersion===APPLICABILITY_PROTOCOL),valid=[];
 for(const report of reports){
  const {job}=readinessReportEvidence(p,report);
  if(freshWithin(evaluation, p,a.id)&&isDeepStrictEqual(job.task.readinessInput.applicability,researchAssessmentContextWithin(evaluation, p,a.id,job.binding,job.id)))valid.push({id:report.id,input:structuredClone(job.task.readinessInput),rawReport:structuredClone(report.rawReport),reportHash:report.reportHash,executionReceipt:structuredClone(report.executionReceipt),context:structuredClone(report.context)});
 }
 requireValue(valid.length===1,'RESEARCH_ASSESSMENT_REQUIRED','Exactly one current validated assessment required');return valid[0];
 });
}
export function semanticChallengeInput(p,artifactId){
 const primary=validatedResearchAssessment(p,artifactId),config=semanticConfiguration(p),job=p.jobs.find(j=>j.id===p.readinessReports.find(r=>r.id===primary.id)?.jobId);
 requireValue(primary.input.evidenceLinkPolicy===RESEARCH_EVIDENCE_LINK_POLICY&&isDeepStrictEqual(job?.binding,config.readinessBinding),'SEMANTIC_PRIMARY_CHANGED','Current primary reviewer and evidence policy required');
 requireValue(!validateResearchReadinessOutput(primary.rawReport,primary.input).hasBlockingFindings,'RESEARCH_READINESS_BLOCKED','Primary must be ready');
 return buildSemanticInput(primary,config);
}
export function semanticChallengeCurrent(p,job){
 requireValue(job?.purpose==='coverage_challenge'&&isDeepStrictEqual(job.task.semanticInput,semanticChallengeInput(p,job.targetArtifactId))&&isDeepStrictEqual(job.binding,semanticConfiguration(p).challengeBinding),'SEMANTIC_REVIEW_STALE','Semantic source, primary or configuration changed');
 return artifact(p,job.targetArtifactId);
}
export function requireSemanticCoverage(p,artifactId){
 const input=semanticChallengeInput(p,artifactId),reports=(p.coverageChallenges??[]).filter(r=>r.artifactId===artifactId);
 let matched=false;
 for(const r of reports){
  const verified=validateStoredReview(p,'coverage_challenge',r).source.validatedReport;
  requireValue(!(verified.basisHash===input.basisHash&&verified.hasBlockingFindings),'SEMANTIC_REVIEW_BLOCKED','A negative semantic judgment remains unresolved on this evidence basis');
  const job=p.jobs.find(j=>j.id===r.jobId);
  if(!verified.hasBlockingFindings&&isDeepStrictEqual(job.task.semanticInput,input))matched=true;
 }
 requireValue(!p.jobs.some(j=>j.purpose==='coverage_challenge'&&j.targetArtifactId===artifactId&&['queued','running','awaiting_reconciliation'].includes(j.status)),'SEMANTIC_REVIEW_UNSETTLED','Semantic review must reach a known terminal state');
 requireValue(matched,'SEMANTIC_REVIEW_REQUIRED','Independent semantic review required');
 return input;
}
function readinessTargetWithin(evaluation, p, job) {
  const a = targetWithin(evaluation, p, job.targetArtifactId);
  const input = job.task.readinessInput;
  const card = p.taskCards.find(item => item.id === p.activeTaskCardId);
  requireValue(a.stage === 'research' && isDeepStrictEqual(job.inputVersionIds, [a.id])
    && input?.artifactId === a.id && input.contentHash === a.contentHash,
    'INVALID_READINESS_INPUT', 'Readiness must bind the exact research artifact and hash');
  requireValue(input.taskCardConfirmed === true && isDeepStrictEqual(input.taskCard, card)
    && p.confirmations.some(item => item.taskCardId === card.id),
    'INVALID_READINESS_INPUT', 'Readiness requires the complete confirmed task card');
  requireValue(isDeepStrictEqual(input.content?.claims, a.claims)
    && isDeepStrictEqual(input.sourceRecords ?? [], a.technicalReceipts.sourceCatalogue?.records ?? []),
    'INVALID_READINESS_INPUT', 'Readiness claims and catalogue must match the frozen artifact');
  artifactVisualCatalogue(p, a, input.visualCatalogue ?? []);
  if(input.reviewProtocolVersion===APPLICABILITY_PROTOCOL)requireValue(isDeepStrictEqual(input.applicability,researchAssessmentContextWithin(evaluation, p,a.id,job.binding,job.id)),'STALE_RESEARCH_ASSESSMENT','Task, evidence, history, policy or reviewer assignment changed');
  buildResearchReadinessRequest(input);
  return a;
}
function handoffTargetWithin(evaluation, p, job) {
  const input = job.task.handoffInput;
  if(p.workflow)requireValue(isDeepStrictEqual(input.readerEvidence,requiredReaderEvidence(p,job.targetArtifactId)),'INVALID_READER_EVIDENCE','Handoff must consume all exact current reader originals');
  requireValue(job.status==='succeeded'||!usesResearchOperatorWorkflow(p)||input.handoffProtocolVersion===DECLARATION_HANDOFF_PROTOCOL,'OPERATOR_HANDOFF_ROUTE_REQUIRED','Operator workflow cannot dispatch a legacy unbound owner request');
  const a = readinessTargetWithin(evaluation, p, {...job, task: {...job.task, readinessInput: input}});
  requireValue(a.provenance === 'provider_execution' && input.side === job.side && input.targetStage === 'strategy'
    && isDeepStrictEqual(input.ownerBinding, job.binding), 'INVALID_HANDOFF_INPUT', 'Handoff must bind actual research and the assigned owner');
  const authorJob = p.jobs.find(item => (!item.purpose || item.purpose === 'stage') && item.outputVersionIds?.includes(a.id));
  requireValue(job.side === 'producer' ? isDeepStrictEqual(job.binding, authorJob?.binding) : job.side === 'consumer' && job.binding.role === 'strategy-lead',
    'WRONG_OWNER', 'Producer must retain the research assignment; consumer must be the strategy lead');
  requireValue(isDeepStrictEqual(input.verificationReports, (p.verifications ?? []).filter(item => item.artifactId === a.id).map(item => item.rawReport))
    && isDeepStrictEqual(input.readinessReports, (p.readinessReports ?? []).filter(item => item.artifactId === a.id).map(item => item.rawReport)),
    'INVALID_HANDOFF_INPUT', 'Handoff must include every current original review report');
  if (input.verificationReports.some(report => evidenceProtocolCapabilities(report.protocolVersion).catalogueState)) requireValue(isDeepStrictEqual(input.catalogueState, projectCatalogueState(p, a)),
    'INVALID_HANDOFF_INPUT', 'Handoff catalogue state must match current exact case evidence');
  if (job.side === 'consumer') {
    const producer = (p.handoffReports ?? []).find(item => item.artifactId === a.id && item.side === 'producer' && isDeepStrictEqual(item.rawReport, input.producerReport));
    requireValue(producer && validateStoredHandoffWithin(evaluation, p, producer).decision === 'accept', 'INVALID_HANDOFF_INPUT', 'Consumer must bind an actual accepted producer report');
  }
  if([APPLICABILITY_HANDOFF_PROTOCOL,DECLARATION_HANDOFF_PROTOCOL].includes(input.handoffProtocolVersion)){requireValue(isDeepStrictEqual(input.assessment,validatedResearchAssessmentWithin(evaluation, p,a.id)),'STALE_RESEARCH_ASSESSMENT','Handoff requires actual current assessment');requireValue(input.effectiveHandlingBlocked===researchHandlingBlockedWithin(evaluation, p,a.id),'INVALID_RESEARCH_HANDOFF','Handoff must retain actual handling eligibility');}
  if(input.handoffProtocolVersion===DECLARATION_HANDOFF_PROTOCOL){
    const state=currentResearchDeclarationsWithin(evaluation, p,a),declaration=(p.researchHandoffDeclarations??[]).find(d=>d.id===input.operatorDeclaration?.id);
    requireValue(declaration&&isDeepStrictEqual(declaration,input.operatorDeclaration)&&declaration.basisHash===state.basisHash,'STALE_RESEARCH_DECLARATION','Exact persisted current declaration required');
    requireValue(job.status==='succeeded'||declaration.id===(job.side==='producer'?state.producer?.id:state.consumer?.id),'STALE_RESEARCH_DECLARATION','Superseded declaration cannot execute');
    if(job.side==='consumer'){const producerDeclaration=p.researchHandoffDeclarations.find(d=>d.id===declaration.producerDeclarationId),producer=declarationReportWithin(evaluation, p,producerDeclaration);requireValue(input.producerReportId===producer.id&&isDeepStrictEqual(input.producerDeclaration,producerDeclaration),'STALE_RESEARCH_DECLARATION','Exact current producer declaration and report required');}
  }
  buildResearchHandoffRequest(input);
  return a;
}
function handoffExecutor(p, a, context, attemptId) {
  const contexts = [...creationLineage(p, a).map(item => item.author),
    ...p.jobs.flatMap(item => item.attempts.filter(attempt => attempt.id !== attemptId).map(attempt => attempt.executor)),
    ...p.reviews.map(item => item.context)];
  requireValue(contexts.every(other => ['actorId', 'runId', 'contextId'].every(key => other[key] !== context[key])),
    'HANDOFF_CONTEXT_REUSED', 'Owner acceptance requires a new execution identity and context');
}
function researchHandoffReceipt(p,job,attempt,receipt,raw,reportId){
 if(![APPLICABILITY_HANDOFF_PROTOCOL,DECLARATION_HANDOFF_PROTOCOL].includes(job.task.handoffInput.handoffProtocolVersion))return;
 verificationReceipt(p,artifact(p,job.targetArtifactId),job,attempt,receipt,reportId);
 const request=buildResearchHandoffRequest(job.task.handoffInput),packet=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema});
 requireValue(receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.model===job.binding.model&&receipt.inputPacketHash===hash(packet)&&ordinarySuccessfulStatus(receipt)&&['signal','reason','error'].every(k=>receipt[k]==null),'INVALID_EXECUTION_RECEIPT','V2 research handoff binds actual exact owner invocation');
 let parsed;try{parsed=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Actual owner response required');}
 requireValue(isDeepStrictEqual(parsed,raw)&&(!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(parsed,receipt.parsedOutput)),'INVALID_EXECUTION_RECEIPT','Original handoff response changed');
 if(receipt.providerExecution)requireValue(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),'INVALID_EXECUTION_RECEIPT','Original handoff provider receipt changed');
}
function validateStoredHandoffWithin(evaluation, p, report) {
 return successfulEvaluation(evaluation, p, 'validateStoredHandoff', report, () => {
  const job = p.jobs.find(item => item.id === report.jobId && item.purpose === 'handoff');
  requireValue(job?.status === 'succeeded' && job.targetArtifactId === report.artifactId, 'INVALID_RESEARCH_HANDOFF', 'Completed handoff job required');
  const a = handoffTargetWithin(evaluation, p, job);
  const attempt = job.attempts.find(item => item.id === report.attemptId && item.status === 'succeeded');
  requireValue(attempt && sameExecutor(attempt.executor, report.context) && isDeepStrictEqual(attempt.receipt, report.executionReceipt),
    'INVALID_RESEARCH_HANDOFF', 'Handoff receipt must match its actual attempt');
  handoffExecutor(p, a, report.context, attempt.id);
  verificationReceipt(p, a, job, attempt, report.executionReceipt, report.id);
  researchHandoffReceipt(p,job,attempt,report.executionReceipt,report.rawReport,report.id);
  const validated = validateResearchHandoffOutput(report.rawReport, job.task.handoffInput);
  if([APPLICABILITY_HANDOFF_PROTOCOL,DECLARATION_HANDOFF_PROTOCOL].includes(job.task.handoffInput.handoffProtocolVersion))requireValue(report.reportHash===hash(JSON.stringify(validated,null,2))&&Object.entries(validated).every(([k,v])=>isDeepStrictEqual(v,report[k])),'INVALID_RESEARCH_HANDOFF','Stored V2 handoff normalization changed');
  requireValue(validated.side === report.side && validated.artifactId === report.artifactId, 'INVALID_RESEARCH_HANDOFF', 'Stored handoff identity must match its report');
  return validated;
 });
}
function requireResearchHandoffWithin(evaluation, p, a, {requirePair=true}={}) {
  const reports = (p.handoffReports ?? []).filter(item => item.artifactId === a.id);
  const accepted = new Set();
  for (const report of reports) {
    try {
      const validated = validateStoredHandoffWithin(evaluation, p, report);
      requireValue(validated.decision === 'accept', 'HANDOFF_BLOCKED', 'A blocked handoff requires a corrected research version');
      accepted.add(validated.side);
    } catch { fail('HANDOFF_BLOCKED', 'Invalid or blocked owner acceptance requires correction'); }
  }
  if(requirePair)requireValue(accepted.has('producer') && accepted.has('consumer'), 'HANDOFF_REQUIRED', 'Research requires real producer and strategy owner acceptance');
}
export function usesResearchOperatorWorkflow(p) { return (p.researchHandoffDeclarations??[]).length>0; }
function requiredReaderEvidence(p,id){try{return researchReaderEvidence(p,id);}catch(error){fail(error.code??'RESEARCH_R7_READER_REQUIRED',error.message);}}
function readerBasisHash(p,id){try{return requiredReaderEvidence(p,id).evidenceHash;}catch(error){return 'unavailable:'+hash(JSON.stringify({reason:error.code??'RESEARCH_R7_READER_REQUIRED',method:researchMethodIdentity(),registrations:p.researchQuestionRegistrations??[],reports:p.researchReaderReports??[],readerJobs:p.jobs.filter(j=>j.purpose==='research_reader').map(j=>({id:j.id,status:j.status,input:j.task.readerInput?.packetHash,attempts:j.attempts,outputVersionIds:j.outputVersionIds??[]}))}));}}
function researchOperatorBasisWithin(evaluation, p, a) {
  requireValue(a?.stage==='research'&&a.provenance==='provider_execution'&&freshWithin(evaluation, p,a.id),'STALE_ARTIFACT','Current provider research required');
  const assessment=validatedResearchAssessmentWithin(evaluation, p,a.id),producer=p.jobs.find(j=>(!j.purpose||j.purpose==='stage')&&j.outputVersionIds?.includes(a.id));
  return {...(p.workflow?{readerEvidenceHash:readerBasisHash(p,a.id)}:{}),artifactId:a.id,contentHash:a.contentHash,taskCardId:p.activeTaskCardId,policyVersion:currentPolicy(p).version,assessmentId:assessment.id,
    assessmentHash:assessment.reportHash,producerBinding:producer.binding,evidenceHash:hash(JSON.stringify({taskCard:p.taskCards.find(t=>t.id===p.activeTaskCardId),policy:currentPolicy(p),sources:a.technicalReceipts,verifications:p.verifications.filter(r=>r.artifactId===a.id),readiness:p.readinessReports.filter(r=>r.artifactId===a.id)}))};
}
function currentResearchDeclarationsWithin(evaluation, p,a) {
  const basis=researchOperatorBasisWithin(evaluation, p,a),basisHash=hash(JSON.stringify(basis));
  const declarations=(p.researchHandoffDeclarations??[]).filter(d=>d.artifactId===a.id&&d.basisHash===basisHash);
  const producer=declarations.filter(d=>d.side==='research_owner').at(-1)??null;
  const consumer=declarations.filter(d=>d.side==='strategy_owner'&&d.producerDeclarationId===producer?.id).at(-1)??null;
  return {basis,basisHash,producer,consumer};
}
function declarationReportWithin(evaluation, p,declaration) {
  if(!declaration||declaration.decision==='returned')fail('OPERATOR_DECLARATION_REQUIRED','A positive current operator role declaration is required');
  const reports=(p.handoffReports??[]).filter(r=>p.jobs.find(j=>j.id===r.jobId)?.task.handoffInput?.operatorDeclaration?.id===declaration.id);
  requireValue(reports.length===1,'HANDOFF_REQUIRED','The exact declaration needs actual owner acceptance');
  const report=reports[0];requireValue(validateStoredHandoffWithin(evaluation, p,report).decision==='accept','HANDOFF_BLOCKED','Owner blocked this research');return report;
}
function requireResearchOperatorPairWithin(evaluation, p,a) {
  const state=currentResearchDeclarationsWithin(evaluation, p,a);
  requireValue(state.producer?.decision==='delivered','OPERATOR_DECLARATION_REQUIRED','Record research delivery first');
  const producerReport=declarationReportWithin(evaluation, p,state.producer);
  requireValue(['accepted','accepted_with_conditions'].includes(state.consumer?.decision)&&state.consumer.producerReportId===producerReport.id,'OPERATOR_DECLARATION_REQUIRED','Record strategy acceptance of the exact delivery');
  const consumerReport=declarationReportWithin(evaluation, p,state.consumer);
  requireValue(isDeepStrictEqual(state.consumer.consumerBinding,consumerReport.ownerBinding),'WRONG_OWNER','Exact assigned consumer required');
  return {...state,producerReport,consumerReport};
}
function requireResearchOperatorReleaseWithin(evaluation, p,a) {
  const state=requireResearchOperatorPairWithin(evaluation, p,a),release=(p.releases??[]).find(r=>r.kind==='research-operator-release'&&r.artifactId===a.id&&r.basisHash===state.basisHash&&r.producerDeclarationId===state.producer.id&&r.consumerDeclarationId===state.consumer.id&&r.producerReportId===state.producerReport.id&&r.consumerReportId===state.consumerReport.id);
  requireValue(release,'HUMAN_RESEARCH_RELEASE_REQUIRED','Explicit local operator release required');return release;
}
export function researchOperatorConstraints(p,artifactId) { return researchOperatorConstraintsWithin(new WeakMap(), ...arguments); }
function researchOperatorConstraintsWithin(evaluation, p,artifactId) {
  const a=artifact(p,artifactId),pair=requireResearchOperatorPairWithin(evaluation, p,a),release=requireResearchOperatorReleaseWithin(evaluation, p,a);
  return {declarations:[structuredClone(pair.producer),structuredClone(pair.consumer)],release:structuredClone(release)};
}
export function validateResearchDeclarationInput(input) {
  const keys=['side','decision','permittedUses','prohibitedInferences','unresolvedIssues','note'];
  requireValue(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===keys.length&&keys.every(k=>Object.hasOwn(input,k)),'INVALID_RESEARCH_DECLARATION','Exact operator declaration fields required');
  requireValue(['research_owner','strategy_owner'].includes(input.side)&&(input.side==='research_owner'?input.decision==='delivered':['accepted','accepted_with_conditions','returned'].includes(input.decision)),'INVALID_RESEARCH_DECLARATION','Invalid role decision');
  for(const key of ['permittedUses','prohibitedInferences','unresolvedIssues'])requireValue(Array.isArray(input[key])&&input[key].length<=1000&&input[key].every(v=>typeof v==='string'&&v.trim().length&&v.length<=100000),'INVALID_RESEARCH_DECLARATION','Bounded exact text lists required');
  requireValue(typeof input.note==='string'&&input.note.length<=100000&&(input.decision!=='returned'||input.note.trim().length),'INVALID_RESEARCH_DECLARATION','A return needs an explanatory note');
  requireValue(input.decision==='returned'||input.permittedUses.length,'INVALID_RESEARCH_DECLARATION','Positive declarations require requested bounded uses');
}
function researchOwnerPending(p,a) { return p.jobs.some(j=>j.purpose==='handoff'&&j.targetArtifactId===a.id&&['queued','running','awaiting_reconciliation'].includes(j.status)); }
export function researchWorkflowView(p,{bindings={},providers={}}={}) {
 const current=researchWorkflowViewWithin(new WeakMap(), p, {bindings, providers});
 if(!p.workflow)return current;
 let reader;try{const evidence=requiredReaderEvidence(p,p.activeByStage.research);reader={id:'reader_loop',label:'独立读者回环',passed:true,detail:'当前同版预定读者报告已完成理解检查；原件需运行层另核。',fix:null,evidenceHash:evidence.evidenceHash};}catch(error){reader={id:'reader_loop',label:'独立读者回环',passed:false,detail:error.code??'RESEARCH_R7_READER_REQUIRED',fix:null};}
 return {...current,checks:[...current.checks,reader]};
}
function researchWorkflowViewWithin(evaluation, p,{bindings={},providers={}}={}) {
  const a=artifact(p,p.activeByStage.research),check=(id,run)=>{try{run();return {id,label:id,passed:true,detail:'Current backend validation passed',fix:null};}catch(e){return {id,label:id,passed:false,detail:e.code??'RESEARCH_REQUIRED',fix:null};}};
  const current=()=>{requireValue(a&&freshWithin(evaluation, p,a.id),'STALE_ARTIFACT','Current research required');return a;};
  const operatorWorkflow=usesResearchOperatorWorkflow(p);
  const ownerAccepted=side=>{const reports=(p.handoffReports??[]).filter(r=>r.artifactId===current().id&&r.side===side);requireValue(reports.length&&reports.every(r=>validateStoredHandoffWithin(evaluation, p,r).decision==='accept'),'HANDOFF_REQUIRED','Actual owner acceptance required');};
  const checks=[check('verification',()=>{current();requireValue(!blockersWithin(evaluation, p,a).length,'HARD_BLOCKER','Current factual support required');}),check('readiness',()=>{current();requireResearchReadinessWithin(evaluation, p,a);requireValue(!researchHandlingBlockedWithin(evaluation, p,a.id),'CORRECTION_REVIEW_REQUIRED','Correction handling blocked');}),check('delivery',()=>{if(!operatorWorkflow){ownerAccepted('producer');return;}const s=currentResearchDeclarationsWithin(evaluation, p,current());requireValue(s.producer?.decision==='delivered','OPERATOR_DECLARATION_REQUIRED','Delivery required');declarationReportWithin(evaluation, p,s.producer);}),check('acceptance',()=>{if(operatorWorkflow)requireResearchOperatorPairWithin(evaluation, p,current());else requireResearchHandoffWithin(evaluation, p,current());}),check('release',()=>{eligibleWithin(evaluation, p,current());if(operatorWorkflow)requireResearchOperatorReleaseWithin(evaluation, p,a);else requireValue(releasedWithin(evaluation, p,a.id),'RELEASE_REQUIRED','Current release required');})];
  const permission=run=>{try{run();return {allowed:true,reason:''};}catch(e){return {allowed:false,reason:e.code??'RESEARCH_REQUIRED'};}};
  const state=(()=>{try{return currentResearchDeclarationsWithin(evaluation, p,current());}catch{return null;}})();
  const provider=b=>requireValue(b&&providers[b.providerId]?.model===b.model,'PROVIDER_MISSING','Actual configured owner provider required');
  const pre=()=>{current();requireSourceDeliveryPrerequisitesWithin(evaluation, p,a,{skipResearchHumanGate:true});requireValue(!researchOwnerPending(p,a),'HANDOFF_PENDING','Owner work is pending or unknown');};
  const canDeliver=permission(()=>{pre();provider(state.basis.producerBinding);requireValue(!state.producer||state.consumer?.decision==='returned','HANDOFF_ALREADY_DECLARED','Delivery already declared');if((p.handoffReports??[]).some(r=>r.artifactId===a.id))requireResearchHandoffWithin(evaluation, p,a,{requirePair:false});});
  const canAccept=permission(()=>{pre();declarationReportWithin(evaluation, p,state?.producer);provider(bindings.strategy);requireValue(!state.consumer,'HANDOFF_ALREADY_DECLARED','Strategy already declared');});
  const canRelease=permission(()=>{pre();requireResearchHandoffWithin(evaluation, p,a);requireResearchOperatorPairWithin(evaluation, p,a);requireValue(!checks.find(c=>c.id==='release').passed,'ALREADY_RELEASED','Already released');});
  const intents=(p.researchContinuationIntents??[]).filter(i=>{try{return i.releaseId===requireResearchOperatorReleaseWithin(evaluation, p,a).id;}catch{return false;}}),alreadyContinued=intents.length>0||(!operatorWorkflow&&Object.values(p.processedCommands).some(value=>{try{const c=JSON.parse(value);return c.kind==='release-stage'&&c.artifactId===a?.id&&c.continuation?.purpose==='research-to-strategy'&&c.continuation.request.policyVersion===currentPolicy(p).version;}catch{return false;}}));
  const continuation=permission(()=>{eligibleWithin(evaluation, p,current());if(operatorWorkflow)requireResearchOperatorReleaseWithin(evaluation, p,a);requireValue(currentPolicy(p).authorizedThrough!=='research','AUTHORIZATION_ENDPOINT','Strategy not authorized');const consumerBinding=operatorWorkflow?requireResearchOperatorPairWithin(evaluation, p,a).consumer.consumerBinding:(p.handoffReports??[]).filter(r=>r.artifactId===a.id&&r.side==='consumer').at(-1)?.ownerBinding;requireValue(isDeepStrictEqual(consumerBinding,bindings.strategy),'MODEL_BINDING_MISMATCH','Strategy owner configuration changed');provider(bindings.strategy);requireValue(!researchOwnerPending(p,a),'HANDOFF_PENDING','Unknown owner work');requireValue(!alreadyContinued,'ALREADY_CONTINUED','Continuation already requested');});
  let suggested={permittedUses:[],prohibitedInferences:[],unresolvedIssues:[]};
  try{const assessment=validatedResearchAssessmentWithin(evaluation, p,a.id),report=validateResearchReadinessOutput(assessment.rawReport,assessment.input);suggested={permittedUses:report.downstreamUse.allowed,prohibitedInferences:[...new Set([...report.downstreamUse.prohibited,...report.applicabilityEvaluation.restrictions.map(r=>r.prohibitedUse)])],unresolvedIssues:report.findings.filter(f=>!f.blocking).map(f=>f.reason??f.message).filter(Boolean)};}catch{}
  const ownerStatus=(side,declaration)=>{
    const job=operatorWorkflow?p.jobs.find(j=>j.task?.handoffInput?.operatorDeclaration?.id===declaration?.id):p.jobs.filter(j=>j.purpose==='handoff'&&j.targetArtifactId===a?.id&&j.side===side).at(-1);
    const report=(p.handoffReports??[]).find(r=>r.jobId===job?.id);
    return {declarationId:declaration?.id??null,jobId:job?.id??null,reportId:report?.id??null,status:job?.status??'not_requested',decision:report?.decision??null};
  };
  const currentRelease=checks.find(c=>c.id==='release').passed?(operatorWorkflow?requireResearchOperatorReleaseWithin(evaluation, p,a):(p.releases??[]).filter(r=>r.artifactId===a.id&&r.policyVersion===currentPolicy(p).version).at(-1)):null;
  const canReturn=permission(()=>{pre();declarationReportWithin(evaluation, p,state?.producer);requireValue(state?.consumer?.decision!=='returned','ALREADY_RETURNED','Delivery already returned');});
  return {protocolVersion:DECLARATION_HANDOFF_PROTOCOL,ownerReports:{producer:ownerStatus('producer',state?.producer),consumer:ownerStatus('consumer',state?.consumer)},currentReleaseId:currentRelease?.id??null,verificationReportIds:(p.verifications??[]).filter(r=>r.artifactId===a?.id).map(r=>r.id),canReturn,authorizationPath:operatorWorkflow?'operator-declarations':currentPolicy(p).humanGates.includes('research')?'legacy-human-gate':'model-owners',artifactId:a?.id??null,basisHash:state?.basisHash??null,producerDeclarationId:state?.producer?.id??null,consumerDeclarationId:state?.consumer?.id??null,currentDeclarationIds:[state?.producer?.id,state?.consumer?.id].filter(Boolean),assessmentId:state?.basis.assessmentId??null,checks,canDeliver,canAccept,canRelease,suggested,alreadyContinued,eligible:continuation.allowed,summary:continuation.reason||'Current explicit release can continue to strategy'};
}

export function researchHandlingBlocked(p,artifactId) { return researchHandlingBlockedWithin(new WeakMap(), ...arguments); }
function researchHandlingBlockedWithin(evaluation, p,artifactId){const a=artifact(p,artifactId);if(!a.revision)return false;try{requireCorrectionReviewWithin(evaluation, p,a);return false;}catch{return true;}}
function requireResearchReadinessWithin(evaluation,p,a){requirePrimaryReadinessWithin(evaluation,p,a);requireSemanticCoverage(p,a.id);}
function requirePrimaryReadinessWithin(evaluation, p, a) {
  if((p.readinessReports??[]).some(r=>r.artifactId===a.id&&r.protocolVersion===APPLICABILITY_PROTOCOL)){const assessment=validatedResearchAssessmentWithin(evaluation, p,a.id),report=validateResearchReadinessOutput(assessment.rawReport,assessment.input);requireValue(assessment.input.evidenceLinkPolicy===RESEARCH_EVIDENCE_LINK_POLICY,'RESEARCH_READINESS_UPGRADE_REQUIRED','A new evidence-linked readiness review is required; historical reports remain readable');requireValue(report.verdict==='ready'&&!report.hasBlockingFindings,'RESEARCH_READINESS_BLOCKED','Current assessed research gaps remain blocking');return;}
  const reports = (p.readinessReports ?? []).filter(report => report.artifactId === a.id);
  let ready = false;
  for (const report of reports) {
    try {
      const job = p.jobs.find(item => item.id === report.jobId && item.purpose === 'readiness');
      requireValue(job?.status === 'succeeded' && job.targetArtifactId === a.id, 'INVALID_RESEARCH_READINESS', 'Completed readiness job required');
      readinessTargetWithin(evaluation, p, job);
      const attempt = job.attempts.find(item => item.id === report.attemptId && item.status === 'succeeded');
      requireValue(attempt && sameExecutor(attempt.executor, report.context) && isDeepStrictEqual(attempt.receipt, report.executionReceipt),
        'INVALID_RESEARCH_READINESS', 'Readiness receipt must match its completed attempt');
      independentVerifier(p, a, report.context);
      verificationReceipt(p, a, job, attempt, report.executionReceipt, report.id);
      const validated = validateResearchReadinessOutput(report.rawReport, job.task.readinessInput);
      requireValue(validated.verdict === 'ready', 'RESEARCH_READINESS_BLOCKED', 'Research gaps require a new corrected artifact');
      if (job.task.readinessInput.evidenceLinkPolicy === RESEARCH_EVIDENCE_LINK_POLICY) ready = true;
    } catch { fail('RESEARCH_READINESS_BLOCKED', 'Invalid or negative readiness review requires correction'); }
  }
  requireValue(ready, 'RESEARCH_READINESS_REQUIRED', 'Provider research requires independent research readiness review');
}
function blockersWithin(evaluation, p, a) {
  const reports = (p.verifications ?? []).filter(report => report.artifactId === a.id);
  const verificationFindings = [];
  let supported = false;
  for (const report of reports) {
    try {
      const job = p.jobs.find(item => item.id === report.jobId && item.purpose === 'verification');
      requireValue(job?.status === 'succeeded' && job.targetArtifactId === a.id, 'INVALID_VERIFICATION', 'Completed verification job required');
      verificationTargetWithin(evaluation, p, job);
      const attempt = job.attempts.find(item => item.id === report.attemptId && item.status === 'succeeded');
      requireValue(attempt && sameExecutor(attempt.executor, report.context) && isDeepStrictEqual(attempt.receipt, report.executionReceipt), 'INVALID_VERIFICATION', 'Verification receipt must match its completed attempt');
      independentVerifier(p, a, report.context);
      verificationReceipt(p, a, job, attempt, report.executionReceipt, report.id, report.rawReport);
      const validated = validateEvidenceReviewOutput(report.rawReport, job.task.verificationInput);
      if (evidenceProtocolCapabilities(evidenceReviewProtocol(job.task.verificationInput)).catalogueState) requireValue(report.reportHash === hash(JSON.stringify(validated, null, 2)),
        'INVALID_VERIFICATION', 'V3 verification report hash changed');
      if (validated.hasBlockingFindings) verificationFindings.push(report);
      else supported = true;
    } catch { verificationFindings.push(report); }
  }
  const claims = supported && !verificationFindings.length ? [] : (a.claims ?? []).filter(c => c.kind !== 'creative' && c.verification !== 'verified');
  if (a.provenance === 'provider_execution' && !supported) verificationFindings.push({category: 'verification_required'});
  return claims.concat(verificationFindings, p.reviews.filter(r => r.artifactId === a.id&&!r.creativePanelId).flatMap(r => r.findings.filter(f => f.blocking && f.category !== 'creative_preference')));
}
function creativeTargetWithin(evaluation, p,panel) {
 return successfulEvaluation(evaluation, p, 'creativeTarget', panel, () => {
  const a=targetWithin(evaluation, p,panel.packet.artifactId),card=p.taskCards.find(x=>x.id===p.activeTaskCardId);
  requireValue(JSON.stringify(inputsForWithin(evaluation, p,a.stage))===JSON.stringify(a.inputVersionIds),'STALE_CREATIVE_PANEL','Current upstream releases and feedback must still be accepted');
  requireValue(a.contentHash===panel.packet.contentHash && card.id===panel.packet.taskCard.id && isDeepStrictEqual(card,panel.packet.taskCard)
    && currentPolicy(p).version===panel.packet.policyVersion && feedbackHash(stageFeedback(p,a.stage))===panel.packet.feedbackHash,
    'STALE_CREATIVE_PANEL','Creative panel task, policy, artifact or human feedback changed');
  requireValue(!stageFeedback(p,a.stage).length||a.revision&&revisionGenerationCurrentWithin(evaluation, p,a.stage,a.revision),'FEEDBACK_REVISION_REQUIRED','New feedback requires an actual current revised artifact before creative review');
  if(a.strategyContract){const producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id));requireStrategyBasisWithin(evaluation, p,producer);requireValue(panel.packet.strategyContractVersion===STRATEGY_CONTRACT_VERSION&&panel.packet.protocolVersion===STRATEGY_CREATIVE_PROTOCOL,'INVALID_CREATIVE_PANEL','Strategy-v2 requires its full-body independent review');}
  if (a.copyContract?.version === COPY_CONTRACT_VERSION) requireValue(panel.packet.copyContractVersion === COPY_CONTRACT_VERSION, 'INVALID_CREATIVE_PANEL', 'Complete copy requires its own review protocol');
  requireValue(isDeepStrictEqual(a.technicalReceipts?.sourceCatalogue?.records??[],panel.packet.sources),'INVALID_CREATIVE_PANEL','Frozen sources changed');
  requireValue(creativeHash(panel.packet)===panel.packetHash,'INVALID_CREATIVE_PANEL','Panel packet mutated');
  return a;
 });
}
function creativeJobTargetWithin(evaluation, p,job) {
  const panel=p.creativePanels.find(x=>x.id===job.panelId),node=panel?.nodes.find(x=>x.key===job.nodeKey);
  requireValue(panel&&node,'INVALID_CREATIVE_PANEL','Frozen panel node required');
  const a=creativeTargetWithin(evaluation, p,panel),input=creativeNodeInput(panel,node,p.creativeReports);
  requireValue(isDeepStrictEqual(job.task.creativeInput,input)&&isDeepStrictEqual(job.binding,node.binding)&&job.id===node.jobId,
    'INVALID_CREATIVE_PANEL','Bound node differs from frozen plan');
  for(const key of node.dependencies)requireValue(p.creativeReports.some(r=>r.panelId===panel.id&&r.nodeKey===key),'CREATIVE_DEPENDENCY','Predecessor report required');
  return {panel,node,a,input};
}
function creativeContextWithin(evaluation, p,job,context) {
 const {a,node}=creativeJobTargetWithin(evaluation, p,job),assigned=job.assignedContexts?.at(-1)??node.context;
 requireValue(context.actorId===node.context.actorId&&['actorId','runId','contextId'].every(k=>context[k]===assigned[k]),'UNASSIGNED_REVIEWER','Frozen review execution identity required');
 independentVerifier(p,a,context);
 const other=p.jobs.flatMap(j=>j.id===job.id?[]:j.attempts.map(x=>x.executor));
 requireValue(other.every(x=>!intersectsLineage(x,context)),'SELF_REVIEW','Creative roles require distinct contexts and lineage');
}
function creativeReceiptWithin(evaluation, p,job,attempt,receipt,raw) {
 const {input}=creativeJobTargetWithin(evaluation, p,job);checkReceipt(job,attempt,receipt);
 const request=buildCreativeRequest(input),expected=hash(JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema}));
 requireValue(receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.model===job.binding.model
   && ordinaryHasContext(receipt)&&receipt.inputPacketHash===expected&&ordinarySuccessfulStatus(receipt)
   && ['signal','reason','error'].every(k=>receipt[k]==null)&&nonempty(receipt.responseText),'INVALID_EXECUTION_RECEIPT','Exact actual invocation packet and successful response required');
 requireValue(!p.jobs.some(j=>j.attempts.some(x=>x.id!==attempt.id&&ordinarySameContext(x.receipt,receipt)))
   && !p.artifacts.some(x=>ordinarySameContext(x.executionReceipt,receipt)),'REVIEW_THREAD_REUSED','Creative provider thread must be fresh');
 let parsed;try{parsed=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Original JSON response required');}
 requireValue(isDeepStrictEqual(parsed,raw)&&(!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(parsed,receipt.parsedOutput)),
   'INVALID_EXECUTION_RECEIPT','Raw report must equal original provider response');
 if(receipt.providerExecution)requireValue(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),
   'INVALID_EXECUTION_RECEIPT','Original execution mismatch');
 return validateCreativeOutput(raw,input);
}
function requireCreativePanelWithin(evaluation, p,a) {
 if(a.strategyContract?.version===SIMPLE_STRATEGY_VERSION)return;
 if(a.provenance!=='provider_execution'||!['strategy','copy'].includes(a.stage))return;
 const panels=(p.creativePanels??[]).filter(x=>x.packet.artifactId===a.id);
 const panel=panels.at(-1);requireValue(panel,'CREATIVE_PANEL_REQUIRED','Actual independent creative panel required');creativeTargetWithin(evaluation, p,panel);
 if(a.stage==='copy')requireValue(panel.packet.protocolVersion===COPY_CREATIVE_PROTOCOL,'CREATIVE_PANEL_PROTOCOL_OBSOLETE','Current copy delivery requires a fresh public-message-only anonymous panel');
 const reports=(p.creativeReports??[]).filter(r=>r.panelId===panel.id);
 requireValue(reports.length===panel.nodes.length,'CREATIVE_PANEL_INCOMPLETE','All frozen phases must complete');
 for(const r of reports){const job=p.jobs.find(j=>j.id===r.jobId),attempt=job?.attempts.find(x=>x.id===r.attemptId);
   requireValue(job?.status==='succeeded'&&attempt?.status==='succeeded','INVALID_CREATIVE_PANEL','Successful original review job required');
   creativeReceiptWithin(evaluation, p,job,attempt,r.executionReceipt,r.rawReport);}
 const outcome=creativeDecision(panel,reports),human=p.decisions.some(d=>d.human&&d.kind==='adopt-creative'&&d.artifactId===a.id&&d.policyVersion===currentPolicy(p).version&&d.creativePanelId===panel.id&&reports.filter(r=>['score','opposition'].includes(r.phase)).every(r=>d.reviewIds.includes(r.id)));
 const director=reports.find(r=>r.phase==='director');
 requireValue(!creativeIssues(panel,reports).some(i=>i.issue.category!=='creative'&&director.rawReport.adjudications.find(a=>a.challengeId===i.key)?.disposition!=='rejected'),'HARD_BLOCKER','Unresolved factual and scope criticism requires correction, not creative adoption');
 requireValue(outcome.status==='pass'||human,'CREATIVE_PANEL_NOT_PASSED','Diagnostic, low score or unresolved creative dissent requires explicit human adoption');
}
function copyContractMetadata(job, output, contentHash) {
  if (job.stage !== 'copy') return {};
  return {copyContract: {version: job.task?.copyContractVersion ?? 'copy-message-v1', status: job.task?.copyContractVersion === COPY_CONTRACT_VERSION && output ? 'complete' : 'missing_required_parts', contentHash}};
}
function requireSourceDeliveryPrerequisitesWithin(evaluation, p, a, {skipResearchHumanGate=false,skipReader=false}={}) {
  if(p.workflow&&a.stage==='research'&&!skipReader)requiredReaderEvidence(p,a.id);
  if(a.stage==='research'&&hasResearchData(p,a)){try{requireResearchOriginal(p,a);}catch(error){fail(error.code??'INVALID_RESEARCH_ORIGINAL',error.message);}}
  requireValue(!['layout','final_review'].includes(a.stage),'LAYOUT_FINAL_AUTHORITY_UNAVAILABLE','Dedicated native layout and final delivery authority are not implemented');
  if(a.stage==='content_review'){try{requireCompleteContent(p,a,(p, contents, options) => contentSourceEnvelopeWithin(evaluation, p, contents, options));return;}catch(e){fail(e.code??'CONTENT_AUTHORITY_REQUIRED',e.message);}}
  if (a.stage === 'copy') requireValue(a.copyContract?.version === COPY_CONTRACT_VERSION && a.copyContract.status === 'complete' && a.copyContract.contentHash === a.contentHash, 'COPY_MESSAGE_INCOMPLETE', 'Complete headline, supporting copy and creative explanation required for current copy delivery');
  if(p.jobs.some(j=>j.outputVersionIds?.includes(a.id)&&j.task?.strategyContractVersion)){const job=p.jobs.find(j=>j.outputVersionIds?.includes(a.id));requireStrategyBasisWithin(evaluation, p,job);requireValue(a.strategyContract?.version===job.task.strategyContractVersion&&a.strategyContract.basisHash===job.task.strategyBasis.basisHash&&a.strategyContract.contentHash===a.contentHash&&a.strategyContract.status!=='blocked','STRATEGY_INCOMPLETE','Actual complete strategy contract required');}
  artifactVisualCatalogue(p, a);
  requireFeedbackReviewWithin(evaluation, p, a);
  requireCreativePanelWithin(evaluation, p,a);
  if(a.stage==='visual'){try{requireFinalVisual(p,a,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding));return;}catch(error){fail(error.code??'FINAL_AUTHORITY_REQUIRED',error.message);}}
  if(a.stage==='sketch'){try{requireReviewedSketch(p,a,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding));}catch(error){fail(error.code??'REVIEWED_SKETCH_REQUIRED',error.message);}}
  else requireValue(JSON.stringify(inputsForWithin(evaluation, p, a.stage)) === JSON.stringify(a.inputVersionIds), 'STALE_ARTIFACT', 'Release must consume current inputs');
  requireValue(!blockersWithin(evaluation, p, a).length, 'HARD_BLOCKER', 'Unresolved evidence-backed blocking problems require correction');
  const reviews = p.reviews.filter(r => r.artifactId === a.id);
  const actualTextPanel=a.provenance==='provider_execution'&&['strategy','copy'].includes(a.stage);
  const scores = reviews.filter(r => r.reviewType === 'score');
  const roles = REVIEW_ROLES[a.stage] ?? [];
  const actualSketchPanel=a.stage==='sketch'&&a.provenance==='reviewed_sketch_generation'&&a.sketchGeneration?.protocol===REVIEW_PROTOCOL;
  if(!actualTextPanel&&!actualSketchPanel){
  requireValue(roles.every(role => scores.some(r => r.role === role)), 'REVIEW_REQUIRED', 'Complete independent role panel required');
  for (const score of scores) {
    requireValue(reviews.some(r => r.reviewType === 'opposition' && r.pairedReviewId === score.id && r.role === score.role), 'OPPOSITION_REQUIRED', 'Each original vote needs a mirrored opposition record');
  }
  const needsDisposition = reviews.filter(r => r.reviewType === 'opposition' || r.verdict === 'reject' || r.findings.length);
  requireValue(needsDisposition.every(r => p.decisions.some(d => d.artifactId === a.id && d.policyVersion === currentPolicy(p).version && d.reviewIds.includes(r.id) && ['reject', 'adopt_creative'].includes(d.outcome))), 'DISPOSITION_REQUIRED', 'Every dissent and opposition needs an evidenced disposition');
  requireValue(scores.every(r => r.verdict === 'pass' || (r.findings.length && r.findings.every(f => f.category === 'creative_preference'))), 'REVIEW_REQUIRED', 'Empty or noncreative rejection cannot be waived');
  if (['sketch', 'visual'].includes(a.stage)) {
    const panel = roles.map(role => scores.find(r => r.role === role));
    requireValue(panel.every(r => Number.isFinite(r.score)) && panel.reduce((sum, r) => sum + r.score, 0) / 4 >= 4, 'SCORE_THRESHOLD', 'Four original visual scores must average at least four');
  }
  if (a.stage === 'references') requireValue(scores.every(r => r.referenceFit?.status === 'pass' && r.referenceFit.criteriaRef && r.referenceFit.evidenceRefs?.length), 'REFERENCE_FIT_REQUIRED', 'Reference applicability requires separate criteria and evidence');
  }
  requireValue((a.stage==='research'&&(skipResearchHumanGate||(p.releases??[]).some(r=>{if(r.kind!=='research-operator-release'||r.artifactId!==a.id)return false;try{return r.id===requireResearchOperatorReleaseWithin(evaluation, p,a).id;}catch{return false;}})))||!currentPolicy(p).humanGates.includes(a.stage) || p.decisions.some(d => d.artifactId === a.id && d.human && d.kind === 'adopt-creative' && d.outcome === 'adopt_creative' && d.policyVersion === currentPolicy(p).version && reviews.every(r => d.reviewIds.includes(r.id))), 'HUMAN_GATE', 'Selected gate awaits human adoption');
  if (a.stage === 'research' && a.provenance === 'provider_execution') requireResearchReadinessWithin(evaluation, p, a);
}
function eligibleWithin(evaluation, p,a) {
  requireSourceDeliveryPrerequisitesWithin(evaluation, p,a);
  if(a.stage==='research'&&a.provenance==='provider_execution'){requireResearchHandoffWithin(evaluation, p,a);if(usesResearchOperatorWorkflow(p))requireResearchOperatorPairWithin(evaluation, p,a);}
  else if(a.stage==='strategy'&&a.provenance==='provider_execution')requireStrategyOwnersWithin(evaluation, p,a);
  else if(a.stage==='copy'&&a.provenance==='provider_execution'){try{referenceOwnersAccepted(p,a,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding));}catch(error){fail(error.code,error.message);}}
  else if(a.stage==='content_review'&&a.provenance==='reviewed_complete_content'){}
  else if(a.stage==='visual'&&a.provenance==='reviewed_final_visual'){}
  else if(a.stage==='sketch'&&a.provenance==='reviewed_sketch_generation'&&a.sketchGeneration?.protocol===REVIEW_PROTOCOL){}
  else requireValue(p.acknowledgments.some(ack=>ack.artifactId===a.id&&handoffReadyWithin(evaluation, p,a.id,ack.nextStage)), 'HANDOFF_REQUIRED','Both owners must acknowledge a handoff');
  if(a.stage==='layout')requireValue(['package','layout','import','render'].every(key=>a.technicalReceipts[key]?.status==='pass'&&a.technicalReceipts[key]?.ref),'TECHNICAL_RECEIPTS_REQUIRED','Package, layout, import and actual render receipts required');
}


export function contentSourceEnvelope(p,contents,options={}) { return contentSourceEnvelopeWithin(new WeakMap(),p,contents,options); }
function contentSourceEnvelopeWithin(evaluation, p,contents,options={}) {
 const strategy=p.artifacts.find(a=>a.id===p.activeByStage.strategy),copy=p.artifacts.find(a=>a.id===p.activeByStage.copy);
 const se=strategyDeliveryEnvelopeWithin(evaluation, p,strategy?.id,contents,{providerId:'content-source-reader',model:'historical-evidence',role:'copy-lead'}),ce=copyDeliveryEnvelopeWithin(evaluation, p,copy?.id,contents,{providerId:'content-source-reader',model:'historical-evidence',role:'references-lead'});
 return makeContentSource(p,contents,se,ce,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding),options);
}
export function strategyDeliveryEnvelope(p,artifactId,sourceContents,consumerBinding) { return strategyDeliveryEnvelopeWithin(new WeakMap(), ...arguments); }
function strategyDeliveryEnvelopeWithin(evaluation, p,artifactId,sourceContents,consumerBinding){return deliveryEnvelopeWithin(evaluation, p,artifactId,sourceContents,consumerBinding,'strategy');}
export function copyDeliveryEnvelope(p,artifactId,sourceContents,consumerBinding) { return copyDeliveryEnvelopeWithin(new WeakMap(), ...arguments); }
function copyDeliveryEnvelopeWithin(evaluation, p,artifactId,sourceContents,consumerBinding){return deliveryEnvelopeWithin(evaluation, p,artifactId,sourceContents,consumerBinding,'copy');}
function deliveryEnvelopeWithin(evaluation, p,artifactId,sourceContents,consumerBinding,sourceStage){
 const nextStage=sourceStage==='copy'?'references':'copy';
 const a=targetWithin(evaluation, p,artifactId);requireValue(a.stage===sourceStage&&a.provenance==='provider_execution','INVALID_OWNER_EDGE','Actual strategy production required');
 requireSourceDeliveryPrerequisitesWithin(evaluation, p,a);
 if(sourceStage==='copy')requireOwnerCopyJobWithin(evaluation, p,p.jobs.find(j=>j.outputVersionIds?.includes(a.id)));
 requireValue(Object.keys(STAGES).indexOf(currentPolicy(p).authorizedThrough)>=Object.keys(STAGES).indexOf(nextStage),'AUTHORIZATION_ENDPOINT','Copy exceeds authorization');
 requireValue(consumerBinding?.role===`${nextStage}-lead`&&['providerId','model'].every(k=>nonempty(consumerBinding[k])),'INVALID_BINDING','Configured copy owner required');
 const lineage=creationLineage(p,a),ids=new Set(lineage.map(x=>x.id)),researchInputs=inputLineage(p,a).filter(item=>item.stage==='research');
 const loaded=id=>{const item=sourceContents.find(x=>x.artifactId===id),ref=artifact(p,id);requireValue(item&&hash(item.contentText)===ref.contentHash,'CONTENT_HASH_MISMATCH','Original source bytes required');let parsed;try{parsed=JSON.parse(item.contentText);}catch{fail('INVALID_OWNER_EDGE','Original source JSON required');}requireValue((parsed.strategyContractVersion===SIMPLE_STRATEGY_VERSION&&ref.claims.length===0&&parsed.claims===undefined)||isDeepStrictEqual(parsed.claims,ref.claims.map(({verification,...c})=>c))||isDeepStrictEqual(parsed.claims,ref.claims),'CONTENT_HASH_MISMATCH','Original source claims changed');return {artifactId:id,contentText:item.contentText,content:parsed,contentHash:ref.contentHash};};
 const source=loaded(a.id),original=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)&&(!j.purpose||j.purpose==='stage'));
 const recovered=a.strategyContract?.version===SIMPLE_STRATEGY_VERSION&&a.reconciliationId?(p.reconciliations??[]).find(r=>r.id===a.reconciliationId&&r.artifactId===a.id&&r.jobId===original?.id&&r.validatedOutputHash===a.contentHash&&r.originalReceiptHash===hash(JSON.stringify(a.executionReceipt))&&r.rawOutputHash===hash(a.executionReceipt.responseText)&&r.inputPacketHash===a.executionReceipt.inputPacketHash):null;
 if(a.reconciliationId){requireValue(recovered,'INVALID_OWNER_EDGE','Exact SIMPLE original recovery required');const commands=Object.values(p.processedCommands).map(raw=>JSON.parse(raw)).filter(c=>c.kind==='reconcile-stage'&&c.reconciliationId===recovered.id);requireValue(commands.length===1&&commands[0].artifactId===a.id&&commands[0].jobId===original.id&&commands[0].attemptId===recovered.attemptId&&commands[0].contentHash===a.contentHash&&commands[0].payloadRef===a.payloadRef&&p.audit.some(x=>x.commandId===commands[0].commandId&&x.kind==='reconcile-stage'&&x.actorId===recovered.context.actorId),'INVALID_OWNER_EDGE','Original recovery command and audit required');}
 const attempt=original?.attempts.find(t=>(t.status==='succeeded'||recovered&&t.status==='awaiting_reconciliation'&&t.id===recovered.attemptId)&&isDeepStrictEqual(t.receipt,a.executionReceipt));
 requireValue(original?.status==='succeeded'&&attempt&&sameExecutor(attempt.executor,a.author)&&isDeepStrictEqual(original.inputVersionIds,a.inputVersionIds),'INVALID_OWNER_EDGE','Exact successful author attempt and input dependencies required');
 checkReceipt(original,attempt,a.executionReceipt);
 const originalInputs=original.inputVersionIds.map(id=>({id,stage:artifact(p,id).stage,content:loaded(id).content,...(original.task.upstreamReviewConstraints?.[id]?{reviewConstraints:original.task.upstreamReviewConstraints[id]}:{})}));
 const originalRequest=buildStageRequest({stage:sourceStage,brief:original.task.brief,inputArtifacts:originalInputs,sourceRecords:original.task.sourceRecords??[],visualCatalogue:original.task.visualCatalogue??[],revisionInput:original.task.revisionInput,correctionInput:original.task.correctionInput,copyContractVersion:original.task.copyContractVersion,strategyContractVersion:original.task.strategyContractVersion,strategyBasis:original.task.strategyBasis,researchContractVersion:original.task.researchContractVersion,researchDataBasis:original.task.researchDataBasis});
 const originalPacket=JSON.stringify({runId:attempt.id,model:original.binding.model,prompt:originalRequest.prompt,outputSchema:originalRequest.outputSchema,...((original.task.correctionInput??original.task.revisionInput)?.materials?.length?{images:(original.task.correctionInput??original.task.revisionInput).materials}:{})});
 const receipt=a.executionReceipt;
 requireValue(receipt.runId===attempt.id&&receipt.requestedModel===original.binding.model&&receipt.inputPacketHash===hash(originalPacket)&&ordinarySuccessfulStatus(receipt)&&ordinaryHasContext(receipt)&&['signal','reason','error'].every(k=>receipt[k]==null),'INVALID_EXECUTION_RECEIPT','Exact original strategy production packet required');
 let originalRaw;try{originalRaw=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Original strategy response required');}
 const normalized=validateStageOutput(sourceStage,originalRaw,{sourceRecords:original.task.sourceRecords??[],visualCatalogue:original.task.visualCatalogue??[],revisionInput:original.task.revisionInput,correctionInput:original.task.correctionInput,copyContractVersion:original.task.copyContractVersion,strategyContractVersion:original.task.strategyContractVersion,strategyBasis:original.task.strategyBasis,researchContractVersion:original.task.researchContractVersion,researchDataBasis:original.task.researchDataBasis});
 if(original.task.strategyContractVersion)requireValue(isDeepStrictEqual(a.strategyContract,strategyMetadata(original,normalized,a.contentHash).strategyContract),'STRATEGY_INCOMPLETE','Strategy metadata must match actual response');
 requireValue(isDeepStrictEqual(normalized.content,source.content),'CONTENT_HASH_MISMATCH','Exact original strategy output required');
 if(receipt.providerExecution)requireValue(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),'INVALID_EXECUTION_RECEIPT','Strategy provider receipt changed');

 const sources=new Map();for(const item of lineage)for(const r of [...(p.jobs.find(j=>j.outputVersionIds?.includes(item.id))?.task?.sourceRecords??[]),...(item.technicalReceipts?.sourceCatalogue?.records??[])]){requireValue(!sources.has(r.id)||isDeepStrictEqual(sources.get(r.id),r),'SOURCE_ID_CONFLICT','Conflicting inherited source IDs');sources.set(r.id,r);}
 const recordCollections=['verifications','readinessReports','handoffReports','feedbackReviews','correctionReviews','creativeReports','creativePanels','reviews','decisions'];
 const manifest=Object.fromEntries(recordCollections.map(k=>[k,(p[k]??[]).filter(r=>ids.has(r.artifactId??r.packet?.artifactId))]));
 const inheritedRestrictions=lineage.filter(item=>item.stage==='research').flatMap(item=>(p.handoffReports??[]).filter(r=>r.artifactId===item.id&&[APPLICABILITY_HANDOFF_PROTOCOL,DECLARATION_HANDOFF_PROTOCOL].includes(r.protocolVersion)).flatMap(r=>p.jobs.find(j=>j.id===r.jobId)?.task.handoffInput.assessment?validateResearchReadinessOutput(p.jobs.find(j=>j.id===r.jobId).task.handoffInput.assessment.rawReport,p.jobs.find(j=>j.id===r.jobId).task.handoffInput.assessment.input).applicabilityEvaluation.restrictions:[]));
 const restrictionManifest=[...new Map(inheritedRestrictions.map(r=>[r.originKey,r])).values()];
 const operatorConstraints=researchInputs.filter(item=>(p.handoffReports??[]).some(r=>r.artifactId===item.id&&r.protocolVersion===DECLARATION_HANDOFF_PROTOCOL)).map(item=>{
  const pair=requireResearchOperatorPairWithin(evaluation, p,item),authority=researchOperatorConstraintsWithin(evaluation, p,item.id);
  const inheritedAuthority=sourceStage==='strategy'?original.task.upstreamReviewConstraints?.[item.id]?.operatorHandoff:Object.values(original.task.upstreamReviewConstraints??{}).flatMap(c=>c.envelope?.researchOperatorConstraints??[]).find(c=>c.artifactId===item.id)?.authority;
  requireValue(isDeepStrictEqual(inheritedAuthority,authority),'STALE_RESEARCH_DECLARATION','Downstream delivery must retain original current operator authority');
  const reports=[pair.producerReport,pair.consumerReport],assessment=validatedResearchAssessmentWithin(evaluation, p,item.id),assessmentReport=validateResearchReadinessOutput(assessment.rawReport,assessment.input);
  const origins=[...authority.declarations.map(d=>({kind:'declaration',id:d.id,value:d})),...reports.map(r=>({kind:'report',id:r.id,value:r.rawReport}))];
  const permittedUses=assessmentReport.downstreamUse.allowed.filter(text=>origins.every(o=>o.value.permittedUses.includes(text)));
  const restrictions=origins.flatMap(o=>['prohibitedInferences',...(o.kind==='report'?['limitations']:[])].flatMap(kind=>o.value[kind].map((text,index)=>({id:`research:${item.id}:${o.kind}:${o.id}:${kind}:${index}`,kind,text,origin:{artifactId:item.id,kind:o.kind,id:o.id,field:kind,index}}))));
  return {protocolVersion:'research-operator-constraints-v1',artifactId:item.id,authority,reports:structuredClone(reports),assessment:structuredClone(assessment),permittedUses,restrictions};
 });
 const copyUpstream=sourceStage==='copy'?{manualReferences:structuredClone((p.referenceMaterials??[]).filter(m=>!m.removed&&m.artifactId===a.id&&m.copyContentHash===a.contentHash)),upstreamReviewConstraints:structuredClone(original.task.upstreamReviewConstraints??{}),upstreamOwnerEdges:structuredClone((p.ownerEdges??[]).filter(e=>ids.has(e.envelope.source.artifactId))),upstreamOwnerReports:structuredClone((p.ownerReports??[]).filter(r=>ids.has(r.artifactId)))}:{};
 for(const item of lineage.filter(item=>item.stage==='research'&&hasResearchData(p,item)&&!researchInputs.some(input=>input.id===item.id))){
  const historical=requireResearchOriginal(p,item);
  requireValue(loaded(item.id).contentText===JSON.stringify(historical.output.content,null,2),'INVALID_RESEARCH_ORIGINAL','Historical research bytes must match their original producer');
 }
 const chartAdmissions=researchInputs.filter(item=>hasResearchData(p,item)).map(item=>requireResearchChartAdmissionWithin(evaluation, p,item.id,sourceContents));
 if(sourceStage==='strategy'&&(chartAdmissions.length||(original.task.strategyBasis?.handoff??original.task.strategyBasis)?.researchChartAdmission)){
  const admission=(original.task.strategyBasis?.handoff??original.task.strategyBasis)?.researchChartAdmission;
  requireValue(chartAdmissions.length===1&&original.inputVersionIds.includes(admission?.artifactId)&&isDeepStrictEqual(admission,chartAdmissions.find(item=>item.artifactId===admission?.artifactId)),'STALE_RESEARCH_CHART_ADMISSION','Strategy must consume the exact admission for its bound research input');
 }
 if(sourceStage==='copy'){const inherited=Object.values(original.task.upstreamReviewConstraints??{}).flatMap(c=>c.envelope?.researchChartAdmissions??[]);requireValue(isDeepStrictEqual(inherited,chartAdmissions),'STALE_RESEARCH_CHART_ADMISSION','Copy must consume exact numerical lineage and restrictions');}
 const data={...(chartAdmissions.length?{researchChartAdmissions:chartAdmissions}:{}),...copyUpstream,...(operatorConstraints.length?{researchOperatorConstraints:operatorConstraints}:{}),...(restrictionManifest.length?{researchRestrictionManifest:restrictionManifest,researchRestrictionManifestHash:applicabilityHash(restrictionManifest)}:{}),protocolVersion:OWNER_EDGE_PROTOCOL,kind:`${sourceStage}-to-${nextStage}`,projectId:p.id,sourceStage,targetStage:nextStage,taskCard:structuredClone(p.taskCards.find(c=>c.id===p.activeTaskCardId)),taskCardHash:ownerHash(p.taskCards.find(c=>c.id===p.activeTaskCardId)),targetContractHash:sourceStage==='copy'?hash(REFERENCE_DOSSIER_PROTOCOL):ownerHash(buildStageRequest({stage:'copy',brief:'owner-edge-contract-v1',copyContractVersion:COPY_CONTRACT_VERSION,inputArtifacts:[{reviewConstraints:{ownerEdgeId:'contract-sentinel'}}]})),confirmations:p.confirmations.filter(c=>c.taskCardId===p.activeTaskCardId),policy:structuredClone(currentPolicy(p)),source,sourceInputVersionIds:a.inputVersionIds,sourceArtifacts:lineage,producerAssignment:{jobId:original.id,attemptId:attempt.id,binding:original.binding,author:a.author,executionReceipt:a.executionReceipt},consumerBinding,copyContractVersion:COPY_CONTRACT_VERSION,sourceRecords:[...sources.values()],visualCatalogue:a.technicalReceipts?.visualCatalogue??[],manifest,feedback:(p.humanFeedback??[]).filter(f=>f.taskCardId===p.activeTaskCardId&&lineage.some(a=>a.stage===f.stage)),returnTargets:[{artifactId:p.activeTaskCardId,responsibleRole:'proposal-director',content:p.taskCards.find(c=>c.id===p.activeTaskCardId)},...lineage.map(item=>({artifactId:item.id,responsibleRole:`${item.stage}-lead`,content:loaded(item.id).content}))]};
 return structuredClone({...data,envelopeHash:ownerHash(data)});
}
function ownerEdgeCurrentWithin(evaluation, p,edge){
 return successfulEvaluation(evaluation, p, 'ownerEdgeCurrent', edge, () => {
 const contents=edge.envelope.returnTargets.filter(t=>artifact(p,t.artifactId)).map(t=>{const a=edge.envelope.sourceArtifacts.find(x=>x.id===t.artifactId);return {artifactId:t.artifactId,contentText:t.artifactId===edge.envelope.source.artifactId?edge.envelope.source.contentText:edge.sourceContents.find(x=>x.artifactId===t.artifactId)?.contentText};});
 requireValue(isDeepStrictEqual(strategyDeliveryEnvelopeWithin(evaluation, p,edge.envelope.source.artifactId,contents,edge.envelope.consumerBinding),edge.envelope),'STALE_OWNER_EDGE','Task, source, inputs, policy, feedback or reviews changed');
 });
}
function ownerJobBindingWithin(evaluation, p,job){
 const edge=(p.ownerEdges??[]).find(e=>e.id===job.edgeId);
 requireValue(edge?.protocolVersion===OWNER_EDGE_PROTOCOL&&edge.kind==='strategy-to-copy'&&edge.id===`owner-${edge.envelope.envelopeHash}`&&['producer','consumer'].includes(job.side),'INVALID_OWNER_EDGE','Registered owner edge and side required');
 const producers=(p.ownerReports??[]).filter(r=>r.edgeId===edge.id&&r.side==='producer');
 const producer=producers[0];
 if(job.side==='consumer')requireValue(producers.length===1&&validateStoredOwnerWithin(evaluation, p,producer).decision==='accept','OWNER_BLOCKED','Exact accepted authentic producer required');
 const expected={envelope:edge.envelope,side:job.side,producerReport:job.side==='consumer'?producer.rawReport:null};
 const binding=job.side==='producer'?edge.envelope.producerAssignment.binding:edge.envelope.consumerBinding;
 const jobId=job.side==='producer'?`${edge.id}-producer`:`${edge.id}-consumer-${producer.reportHash}`;
 requireValue(job.id===jobId&&job.stage==='strategy'&&job.targetArtifactId===edge.envelope.source.artifactId&&isDeepStrictEqual(job.task,{id:jobId,parentId:p.id,owner:binding.role,ownerInput:expected})&&isDeepStrictEqual(job.binding,binding)&&isDeepStrictEqual(job.inputVersionIds,[edge.envelope.source.artifactId]),'INVALID_OWNER_EDGE','Exact immutable owner assignment and request required');
 buildOwnerRequest(expected);return edge;
}
function ownerJobTargetWithin(evaluation, p,job){
 const edge=ownerJobBindingWithin(evaluation, p,job);ownerEdgeCurrentWithin(evaluation, p,edge);return edge;
}
function ownerContext(p,job,context){
 requireValue(context.actorType==='agent'&&!p.jobs.some(j=>j.id!==job.id&&j.attempts.some(t=>intersectsLineage(t.executor,context))),'OWNER_CONTEXT_REUSED','Fresh owner actor, run and context required');
}
function ownerReceiptWithin(evaluation, p,job,attempt,receipt,raw){
 ownerJobBindingWithin(evaluation, p,job);checkReceipt(job,attempt,receipt);ownerContext(p,job,attempt.executor);
 const request=buildOwnerRequest(job.task.ownerInput),packet=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema});
 requireValue(receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.inputPacketHash===hash(packet)&&ordinarySuccessfulStatus(receipt)&&['signal','reason','error'].every(k=>receipt[k]==null)&&ordinaryHasContext(receipt),'INVALID_EXECUTION_RECEIPT','Exact successful owner invocation required');
 requireValue(!p.jobs.some(j=>j.attempts.some(t=>t.id!==attempt.id&&ordinarySameContext(t.receipt,receipt)))&&!p.artifacts.some(a=>ordinarySameContext(a.executionReceipt,receipt)),'OWNER_THREAD_REUSED','Fresh owner provider thread required');
 let parsed;try{parsed=JSON.parse(receipt.responseText);}catch{fail('INVALID_EXECUTION_RECEIPT','Original owner response required');}
 requireValue(isDeepStrictEqual(parsed,raw)&&(!Object.hasOwn(receipt,'parsedOutput')||isDeepStrictEqual(parsed,receipt.parsedOutput)),'INVALID_EXECUTION_RECEIPT','Owner raw response changed');
 if(receipt.providerExecution)requireValue(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),'INVALID_EXECUTION_RECEIPT','Original provider receipt changed');
 const validated=validateOwnerOutput(raw,job.task.ownerInput);if(Object.hasOwn(receipt,'validatedOutputHash'))requireValue(receipt.validatedOutputHash===hash(JSON.stringify(validated,null,2)),'INVALID_EXECUTION_RECEIPT','Owner normalized output hash changed');return validated;
}
export function validateStoredOwner(p,report) { return validateStoredOwnerWithin(new WeakMap(), ...arguments); }
function validateStoredOwnerWithin(evaluation, p,report){
 requireValue(report,'OWNER_REQUIRED','Owner report required');const job=p.jobs.find(j=>j.id===report.jobId&&j.purpose==='owner_acceptance'),attempt=job?.attempts.find(t=>t.id===report.attemptId);
 requireValue(job?.status==='succeeded'&&attempt?.status==='succeeded'&&job.outputVersionIds.includes(report.id)&&sameExecutor(attempt.executor,report.context)&&isDeepStrictEqual(report.resolutionId?savedReadinessReceipt(attempt,(p.readinessResolutions??[]).find(r=>r.id===report.resolutionId)?.proof):attempt.receipt,report.executionReceipt),'INVALID_OWNER_EDGE','Original successful owner attempt required');
 requireValue(report.edgeId===job.edgeId&&report.side===job.side&&report.artifactId===job.targetArtifactId,'INVALID_OWNER_EDGE','Stored report must identify its registered owner assignment');
 const validated=ownerReceiptWithin(evaluation, p,job,attempt,report.executionReceipt,report.rawReport);
 requireValue(report.reportHash===hash(JSON.stringify(validated,null,2))&&Object.entries(validated).every(([k,v])=>isDeepStrictEqual(report[k],v)),'INVALID_OWNER_EDGE','Stored owner report changed');return validated;
}
function requireStrategyOwnersWithin(evaluation, p,a){
 requireValue(a?.stage==='strategy'&&a.provenance==='provider_execution','OWNER_REQUIRED','Actual strategy required');
 const edges=(p.ownerEdges??[]).filter(e=>e.envelope.source.artifactId===a.id);
 for(const job of p.jobs.filter(j=>j.purpose==='owner_acceptance'&&j.targetArtifactId===a.id&&j.status==='succeeded'))requireValue(job.outputVersionIds?.length===1&&(p.ownerReports??[]).some(r=>r.id===job.outputVersionIds[0]&&r.jobId===job.id),'INVALID_OWNER_EDGE','Completed owner outcome cannot be omitted');
 for(const edge of edges)for(const r of(p.ownerReports??[]).filter(r=>r.edgeId===edge.id))requireValue(validateStoredOwnerWithin(evaluation, p,r).decision==='accept','OWNER_BLOCKED','Blocked same-version owner report requires correction');
 for(const edge of [...edges].reverse()){try{ownerEdgeCurrentWithin(evaluation, p,edge);const reports=(p.ownerReports??[]).filter(r=>r.edgeId===edge.id);if(['producer','consumer'].every(side=>reports.some(r=>r.side===side&&validateStoredOwnerWithin(evaluation, p,r).decision==='accept')))return edge;}catch(error){if(error.code==='OWNER_BLOCKED')throw error;}}
 fail('OWNER_REQUIRED','Actual current bilateral strategy-to-copy owner acceptance required');
}
export function ownerEdgeState(p,edge) { return ownerEdgeStateWithin(new WeakMap(), ...arguments); }
function ownerEdgeStateWithin(evaluation, p,edge){
 try{ownerEdgeCurrentWithin(evaluation, p,edge);}catch(error){return {status:'stale',blockedReason:error.code};}
 const reports=(p.ownerReports??[]).filter(r=>r.edgeId===edge.id);
 try{for(const r of reports)if(validateStoredOwnerWithin(evaluation, p,r).decision==='blocked')return {status:'blocked',findings:reports.flatMap(r=>r.unresolvedIssues)};}catch(error){return {status:'blocked',blockedReason:error.code};}
 if(edge.commit)return {status:'committed',jobId:edge.commit.jobId};
 const failed=p.jobs.find(j=>j.edgeId===edge.id&&['blocked','failed','awaiting_reconciliation'].includes(j.status));if(failed)return {status:'blocked',blockedReason:failed.error?.code??failed.status,jobId:failed.id};
 return {status:reports.some(r=>r.side==='consumer')?'ready_to_commit':reports.some(r=>r.side==='producer')?'consumer_pending':'producer_pending'};
}
export function ownerCopyTask(p,edge){
 const reports=(p.ownerReports??[]).filter(r=>r.edgeId===edge.id),source=edge.envelope.source,card=edge.envelope.taskCard;
 return {id:`copy-${edge.id}`,owner:edge.envelope.consumerBinding.role,parentId:p.id,taskCardId:card.id,brief:card.brief,copyContractVersion:COPY_CONTRACT_VERSION,sourceRecords:structuredClone(edge.envelope.sourceRecords),visualCatalogue:structuredClone(edge.envelope.visualCatalogue),ownerEdgeId:edge.id,ownerEnvelopeHash:edge.envelope.envelopeHash,upstreamReviewConstraints:{[source.artifactId]:{...(source.content.strategy?{strategySelection:{artifactId:source.artifactId,contentHash:source.contentHash,contract:structuredClone(edge.envelope.sourceArtifacts.find(a=>a.id===source.artifactId).strategyContract)}}:{}),envelope:structuredClone(edge.envelope),ownerEdgeId:edge.id,envelopeHash:edge.envelope.envelopeHash,reports:reports.map(r=>({reportId:r.id,...reviewContextReport(p,r),reportHash:r.reportHash})),restrictions:reports.flatMap(r=>ownerRestrictions(r.rawReport))}}};
}
function requireOwnerCopyJobWithin(evaluation, p,job){
 if(job.stage!=='copy'||!job.binding||job.purpose&&job.purpose!=='stage')return;
 const edge=(p.ownerEdges??[]).find(e=>e.id===job.task.ownerEdgeId),revision=job.task.correctionInput??job.task.revisionInput;
 requireValue(edge?.commit&&(edge.commit.jobId===job.id||revision),'OWNER_REQUIRED','Only atomically committed copy or its validated revision may execute');
 ownerEdgeCurrentWithin(evaluation, p,edge);const expected=ownerCopyTask(p,edge);
 requireValue(requireStrategyOwnersWithin(evaluation, p,artifact(p,edge.envelope.source.artifactId)).id===edge.id&&isDeepStrictEqual(job.binding,edge.envelope.consumerBinding),'STALE_OWNER_EDGE','Copy must use accepted owner binding');
 if(!revision)requireValue(isDeepStrictEqual(job.task,expected),'STALE_OWNER_EDGE','Copy must use exact frozen production specification');
 else {
  requireValue(['ownerEdgeId','ownerEnvelopeHash','brief','taskCardId','copyContractVersion','upstreamReviewConstraints'].every(k=>isDeepStrictEqual(job.task[k],expected[k])),'STALE_OWNER_EDGE','Copy revision must preserve accepted strategy limits');
  const parent=artifact(p,revision.revisionOf.artifactId),producer=p.jobs.find(j=>j.outputVersionIds?.includes(parent?.id));
  requireValue(producer?.task.ownerEdgeId===edge.id,'OWNER_REQUIRED','Correction parent must originate from accepted strategy edge');
  validateJobRevisionWithin(evaluation, p,job);
 }
}
function ownerCopyReceipt(p,job,attempt,receipt){
 if(job.stage!=='copy'||!job.task.ownerEdgeId||job.task.correctionInput||job.task.revisionInput)return;
 const edge=p.ownerEdges.find(e=>e.id===job.task.ownerEdgeId),task=job.task;
 const request=buildStageRequest({stage:'copy',brief:task.brief,inputArtifacts:[{id:edge.envelope.source.artifactId,stage:'strategy',content:edge.envelope.source.content,reviewConstraints:task.upstreamReviewConstraints[edge.envelope.source.artifactId]}],sourceRecords:task.sourceRecords,visualCatalogue:task.visualCatalogue,copyContractVersion:task.copyContractVersion});
 requireValue(receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.inputPacketHash===hash(JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema}))&&ordinarySuccessfulStatus(receipt)&&['signal','reason','error'].every(k=>receipt[k]==null),'INVALID_EXECUTION_RECEIPT','Exact frozen copy invocation required');
}


/** Commands require commandId and expectedRevision. Records append; heads alone select versions.
 * register-image {asset} records trusted immutable upload metadata.
 * request-observation {jobId,binding,task:{id,parentId,owner,observationInput:{taskCard,images}}} freezes image inputs.
 * complete-observation {jobId,attemptId,reportId,rawReport,payloadRef,contentHash,executionReceipt} appends visual evidence only.
 * request-stage {stage,jobId,binding?:{providerId,model,role},task?:{id,parentId,owner}}.
 * start-job / retry-job {jobId,attemptId}; finish-job-error {jobId,attemptId,status,error,receipt?}.
 * mark-interrupted {jobId,attemptId} retains uncertain outcomes; attested undispatched reference attempts become blocked.
 * complete-stage {jobId,attemptId?,executionReceipt?,artifactId,payloadRef,contentHash,claims?,technicalReceipts?}.
 * Bound jobs require a running attempt and matching receipt; unbound queued jobs are metadata imports.
 * request-verification {artifactId,jobId,binding,task:{id,parentId,owner,verificationInput}} freezes the full review input.
 * complete-verification {jobId,attemptId,reportId,rawReport,payloadRef,contentHash,executionReceipt} appends excerpt support.
 * request-readiness {artifactId,jobId,binding,task:{id,parentId,owner,readinessInput,request?}} freezes exact research bytes.
 * complete-readiness {jobId,attemptId,reportId,rawReport,payloadRef,contentHash,executionReceipt} appends readiness evidence.
 * request-handoff {artifactId,jobId,side,binding,task:{id,parentId,owner,handoffInput,request?}} freezes owner acceptance.
 * complete-handoff {jobId,attemptId,reportId,rawReport,payloadRef,contentHash,executionReceipt} appends owner evidence.
 * assign-panel {artifactId,seats:[{role,actorId,runId,contextId}]} freezes all scoring seats.
 * record-review {artifactId,reviewId,role,reviewType?,verdict:'pass'|'reject',findings:[],score?,referenceFit?}.
 * Opposition additionally needs pairedReviewId and firstReadRef.
 * record-disposition {artifactId,outcome,reason,evidenceRefs} records independent adjudication.
 * adopt-creative {artifactId,reason}; acknowledge-handoff {artifactId,side:'producer'|'consumer',nextStage};
 * release-stage {artifactId}. Human gates require adopt-creative even if independent review passes.
 */
export function applyCommand(project, command, context) {
  identity(context);
  requireValue(command?.commandId && Number.isInteger(command.expectedRevision), 'INVALID_COMMAND', 'Command ID and revision are required');
  let fingerprint = JSON.stringify(Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'expectedRevision')));
  fingerprint=finalCommandWitness(command,fingerprint);
  if (Object.hasOwn(project.processedCommands, command.commandId)) {
    let prior;try{prior=JSON.parse(project.processedCommands[command.commandId]);}catch{}
    requireValue(project.processedCommands[command.commandId] === fingerprint || layoutWitnessMatches(prior,command,fingerprint), 'COMMAND_ID_REUSED', 'Command ID belongs to another payload');
    return project;
  }
  requireValue(command.expectedRevision === project.revision, 'REVISION_CONFLICT', 'Project revision changed');
  const p = transferSemanticReader(project,structuredClone(project));
  p.imageAssets ??= [];
  p.imageObservations ??= [];
  p.observationReviews ??= [];
  p.sourceCaptures ??= [];
  p.caseIdentityReviews ??= [];
  p.humanFeedback ??= [];
  p.feedbackReviews ??= [];
  p.correctionReviews ??= [];
  p.creativePanels ??= []; p.creativeReports ??= [];
  p.ownerEdges??=[];p.ownerReports??=[];p.ownerIntents??=[];
  const c = command;
  if(NATIVE_COMMANDS.includes(c.kind)){try{reduceNativeLayout(p,c,context);}catch(e){fail(e.code??'LAYOUT_NATIVE_INVALID',e.message);}}
  if(FINAL_AUTHORITY_COMMANDS.includes(c.kind)){try{reduceFinalAuthority(p,c,context);}catch(e){fail(e.code??'FINAL_AUTHORITY_INVALID',e.message);}}
  if(ACQUISITION_COMMANDS.includes(c.kind)){try{reduceAcquisition(p,c,context);}catch(e){fail(e.code??'ACQUISITION_INVALID',e.message);}}
  if(INTAKE_COMMANDS.includes(c.kind)){try{reduceIntake(p,c,context);}catch(e){fail(e.code??'INTAKE_INVALID',e.message);}}
  if(RESEARCH_READER_COMMANDS.includes(c.kind)){try{reduceResearchReaderCommand(p,c,context,{target:(p,id)=>targetWithin(new WeakMap(),p,id),independent:independentVerifier,running:runningAttempt,receipt:verificationReceipt,methodIdentity:researchMethodIdentity});}catch(error){fail(error.code??'INVALID_RESEARCH_READER',error.message);}}
  if(['start-job','mark-reference-dispatched','claim-sketch-job','claim-sketch-review'].includes(c.kind)&&p.jobs.some(j=>j.id===c.jobId&&['reference','sketch_owner','sketch_plan','image_candidate','sketch_review_v2','sketch_refinement_handoff'].includes(j.purpose)))requireVisualNoPending(p);
  if(c.visualHttpRequestId){requireValue(['start-job','mark-reference-dispatched','claim-sketch-job','claim-sketch-review'].includes(c.kind),'VISUAL_CLAIM_REQUIRED','Original visual claim transition required');requireVisualClaim(p,c.visualHttpRequestId,p.jobs.find(j=>j.id===c.jobId));}
  if(p.workflow?.version==='proposal-seven-v1'&&c.kind==='adopt-final-visual')requireVisualBNoPending(p);
  if(p.workflow?.version==='proposal-seven-v1'&&['claim-final-visual','anchor-final-visual','complete-final-visual'].includes(c.kind)) {
    const job=p.jobs.find(j=>j.id===c.jobId),requestId=c.visualBHttpRequestId??job?.visualBHttpRequestId;
    requireValue(requestId,'VISUAL_B_LEDGER_REQUIRED','Current visual B requires its fixed HTTP admission');
    requireVisualBClaim(p,requestId,job,c.kind==='claim-final-visual'?{kind:'actual_claim'}:{kind:'anchor_own_result',jobId:c.jobId,attemptId:c.attemptId,executor:context});
    if(c.kind==='claim-final-visual')job.visualBHttpRequestId=requestId;
  }
  switch (c.kind) {
    case 'record-research-handoff': {
      if(p.workflow&&c.request?.input?.decision!=='returned')requiredReaderEvidence(p,c.request?.artifactId);
      human(context);const a=targetWithin(new WeakMap(), p,c.request.artifactId);validateResearchDeclarationInput(c.request.input);
      requireValue(c.request.contentHash===a.contentHash,'STALE_ARTIFACT','Observed research bytes changed');
      requireSourceDeliveryPrerequisitesWithin(new WeakMap(), p,a,{skipResearchHumanGate:true,skipReader:c.request.input.decision==='returned'});
      requireValue(!researchOwnerPending(p,a),'HANDOFF_PENDING','Resolve existing or unknown owner work first');
      const state=currentResearchDeclarationsWithin(new WeakMap(), p,a),input=c.request.input;
      requireValue(c.request.basisHash===state.basisHash,'STALE_RESEARCH_DECLARATION','Observed evidence basis changed');
      let producerReport=null;
      if(input.side==='research_owner'){
        requireValue(!state.producer||state.consumer?.decision==='returned','HANDOFF_ALREADY_DECLARED','Delivery already recorded');
        requireResearchHandoffWithin(new WeakMap(), p,a,{requirePair:false});
      }else{
        producerReport=declarationReportWithin(new WeakMap(), p,state.producer);
        requireValue(input.decision!=='accepted'||!input.unresolvedIssues.length&&!producerReport.unresolvedIssues.length,'CONDITIONAL_ACCEPTANCE_REQUIRED','Remaining conditions require accepted_with_conditions');
        requireValue(!state.consumer||input.decision==='returned','HANDOFF_ALREADY_DECLARED','Acceptance already recorded');
        requireValue(isDeepStrictEqual(c.binding,c.frozenInput.ownerBinding),'WRONG_OWNER','Exact consumer binding required');
      }
      const id=`research-declaration-${hash(JSON.stringify([p.id,c.commandId]))}`;
      const declaration={...structuredClone(input),id,artifactId:a.id,contentHash:a.contentHash,taskCardId:p.activeTaskCardId,policyVersion:currentPolicy(p).version,assessmentId:state.basis.assessmentId,basisHash:state.basisHash,
        declaredRole:c.binding.role,recordedBy:{actorType:'human',actorId:context.actorId},createdAt:context.now??null,producerDeclarationId:input.side==='strategy_owner'?state.producer.id:null,producerReportId:producerReport?.id??null,
        consumerBinding:input.side==='strategy_owner'?structuredClone(c.binding):null,commandId:c.commandId,request:structuredClone(c.request)};
      p.researchHandoffDeclarations??=[];p.researchHandoffDeclarations.push(declaration);
      if(input.decision!=='returned'){
        const jobId=`job-owner-${id}`,handoffInput={...structuredClone(c.frozenInput),handoffProtocolVersion:DECLARATION_HANDOFF_PROTOCOL,operatorDeclaration:structuredClone(declaration),producerDeclaration:input.side==='strategy_owner'?structuredClone(state.producer):null,producerReportId:producerReport?.id??null,producerReport:producerReport?.rawReport??null};
        const job={id:jobId,purpose:'handoff',side:input.side==='research_owner'?'producer':'consumer',stage:'research',targetArtifactId:a.id,inputVersionIds:[a.id],status:'queued',requestedBy:context.actorId,binding:structuredClone(c.binding),task:{id:jobId,owner:c.binding.role,parentId:p.id,handoffInput,request:structuredClone(c.request)},attempts:[]};
        handoffTargetWithin(new WeakMap(), p,job);p.jobs.push(job);
      }
      break;
    }
    case 'release-research': {
      if(p.workflow)requiredReaderEvidence(p,c.request?.artifactId);
      human(context);const a=targetWithin(new WeakMap(), p,c.request.artifactId);
      requireValue(a.contentHash===c.request.contentHash&&currentPolicy(p).version===c.request.policyVersion,'STALE_ARTIFACT','Observed research or policy changed');
      requireSourceDeliveryPrerequisitesWithin(new WeakMap(), p,a,{skipResearchHumanGate:true});requireResearchHandoffWithin(new WeakMap(), p,a);const state=requireResearchOperatorPairWithin(new WeakMap(), p,a);
      requireValue(state.basisHash===c.request.basisHash,'STALE_RESEARCH_DECLARATION','Observed declaration basis changed');
      requireValue(!researchOwnerPending(p,a),'HANDOFF_PENDING','Unknown owner work prevents release');
      requireValue(!(p.releases??[]).some(r=>r.kind==='research-operator-release'&&r.basisHash===state.basisHash&&r.producerDeclarationId===state.producer.id&&r.consumerDeclarationId===state.consumer.id),'ALREADY_RELEASED','Already explicitly released');
      p.releases.push({id:`research-release-${hash(JSON.stringify([p.id,c.commandId]))}`,kind:'research-operator-release',artifactId:a.id,contentHash:a.contentHash,basisHash:state.basisHash,policyVersion:currentPolicy(p).version,producerDeclarationId:state.producer.id,consumerDeclarationId:state.consumer.id,producerReportId:state.producerReport.id,consumerReportId:state.consumerReport.id,actorId:context.actorId,actorType:'human',createdAt:context.now??null,commandId:c.commandId,request:structuredClone(c.request)});
      eligibleWithin(new WeakMap(), p,a);break;
    }
    case 'request-research-continuation': {
      const a=targetWithin(new WeakMap(), p,c.request.artifactId);eligibleWithin(new WeakMap(), p,a);const release=requireResearchOperatorReleaseWithin(new WeakMap(), p,a);
      requireValue(c.request.policyVersion===currentPolicy(p).version,'STALE_POLICY','Policy changed');
      requireValue(isDeepStrictEqual(requireResearchOperatorPairWithin(new WeakMap(), p,a).consumer.consumerBinding,c.binding),'MODEL_BINDING_MISMATCH','Accepted strategy owner required');
      requireValue(currentPolicy(p).authorizedThrough!=='research','AUTHORIZATION_ENDPOINT','Strategy is not authorized');
      requireValue(!researchOwnerPending(p,a),'HANDOFF_PENDING','Owner outcome is unknown');
      requireValue(c.jobId===`job-${hash(JSON.stringify([p.id,`research-continuation-${release.id}`]))}`,'INVALID_RESEARCH_CONTINUATION','Deterministic release-bound strategy job required');
      p.researchContinuationIntents??=[];p.researchContinuationIntents.push({id:c.commandId,releaseId:release.id,artifactId:a.id,jobId:c.jobId,request:structuredClone(c.request),binding:structuredClone(c.binding)});break;
    }
    case 'request-final-review-continuation':
      try{reduceFinalContinuation(p,c,context,finalReviewMetadataBasis);}catch(e){fail(e.code??'INVALID_FINAL_INTENT',e.message);}break;
    case 'retain-final-operation-capture':
    case 'bind-final-operation-authorization': case 'mark-final-operation-dispatched': case 'settle-final-operation-observation': case 'reconcile-final-operation-observation':
    case 'set-final-review-authority': case 'reserve-final-review-plan': case 'release-final-review-reservation': case 'mark-final-review-dispatched': case 'settle-final-review-call': case 'reconcile-final-review-call': case 'close-final-review-reservation': case 'adopt-final-review': case 'return-final-review': case 'accept-final-review-delivery': case 'resolve-final-review-return': break;
    case 'queue-layout-export': case 'claim-layout-export': case 'record-layout-worker': case 'anchor-layout-export': case 'interrupt-layout-export': case 'register-layout-technical': break;
    case 'prepare-project-layout':
      try{reduceLayoutPreparation(p,c,context,(p, contents, options) => contentSourceEnvelopeWithin(new WeakMap(), p, contents, options));}catch(e){fail(e.code??'LAYOUT_PREPARATION_INVALID',e.message);}break;
    case 'request-content-visibility-continuation':
    case 'request-content-visibility-revision':
    case 'open-content-visibility-revision':
    case 'request-complete-content':
    case 'adjust-complete-content-allowance':
    case 'open-initial-content-v3':
    case 'open-initial-content-v4':
    case 'open-initial-content-v5':
    case 'open-initial-content-v6':
    case 'request-content-numeric-continuation':
    case 'open-content-numeric-revision':
    case 'open-complete-content':
    case 'queue-complete-content':
    case 'resume-complete-content':
    case 'claim-complete-content':
    case 'anchor-complete-content':
    case 'reconcile-numeric-content':
    case 'complete-complete-content':
    case 'fail-complete-content':
    case 'register-complete-content':
    case 'release-complete-content':
    case 'adopt-complete-content':
      try{reduceCompleteContent(p,c,context,(p, contents, options) => contentSourceEnvelopeWithin(new WeakMap(), p, contents, options));}catch(e){fail(e.code??'INVALID_CONTENT',e.message);}break;
    case 'record-final-visual-return':
    case 'request-final-visual-revision':
    case 'accept-final-visual-revision-plan':
    case 'refuse-final-visual-revision':
    case 'adjust-final-visual-review-allowance':
    case 'request-final-visual':
    case 'open-final-visual':
    case 'reextract-final-aggregate':
    case 'queue-final-visual':
    case 'claim-final-visual':
    case 'anchor-final-visual':
    case 'converge-final-visual':
    case 'complete-final-visual':
    case 'fail-final-visual':
    case 'register-final-visual':
    case 'release-final-visual':
    case 'adopt-final-visual':
      try{reduceFinalVisual(p,c,context,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(new WeakMap(), p, artifactId, sourceContents, consumerBinding));}catch(e){fail(e.code??'INVALID_FINAL_VISUAL',e.message);}break;
    case 'request-sketch-review':
      requireValue(context.actorType==='agent','REVIEW_TRUSTED_RUNTIME_REQUIRED','Runtime continuation only');p.sketchReviewIntents??=[];p.sketchReviewIntents.push({id:c.commandId});break;
    case 'open-sketch-review':
    case 'extend-sketch-review':
    case 'queue-sketch-review':
    case 'claim-sketch-review':
    case 'anchor-sketch-review':
    case 'complete-sketch-review':
    case 'fail-sketch-review':
    case 'open-sketch-refinement':
      try{reduceSketchReview(p,c,context,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(new WeakMap(), p, artifactId, sourceContents, consumerBinding));}catch(e){fail(e.code??'INVALID_SKETCH_REVIEW',e.message);}break;
    case 'request-sketch-continuation':
    case 'adjust-project-image-allowance':
    case 'open-sketch-generation':
    case 'queue-sketch-node':
    case 'claim-sketch-job':
    case 'complete-sketch-text':
    case 'anchor-image-response':
    case 'complete-image-candidate':
    case 'finish-sketch-error':
    case 'register-reviewed-sketch':
      reduceSketchCommand(p,c,context,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(new WeakMap(), p, artifactId, sourceContents, consumerBinding));break;
    case 'request-copy-continuation':
    case 'record-reference-material':
    case 'record-reference-library-material':
    case 'remove-reference-material':
    case 'open-reference-dossier':
    case 'queue-reference-node':
    case 'mark-reference-dispatched':
    case 'anchor-reference-result':
    case 'anchor-reference-normalized':
    case 'recover-reference-result':
    case 'complete-reference-node':
    case 'claim-reference-tool':
    case 'complete-reference-tool':
    case 'record-reference-acquisition-failure':
    case 'record-reference-coverage-gap':
    case 'register-reference-manual-candidate':
    case 'register-reference-candidate':
    case 'set-reference-pause':
    case 'choose-references':
    case 'adopt-reference-selection':
    case 'request-reference-uncertainty-review':
    case 'request-reference-revision': {try{reduceReferenceCommand(p,c,context,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(new WeakMap(), p, artifactId, sourceContents, consumerBinding));}catch(error){if(error.code)fail(error.code,error.message);throw error;}break;}


    case 'request-strategy-continuation': {
      requireValue(context.actorType==='agent','EXECUTOR_REQUIRED','Trusted scheduler required');
      requireValue(targetWithin(new WeakMap(), p,c.artifactId).stage==='strategy','INVALID_OWNER_EDGE','Strategy source required');
      p.ownerIntents.push({id:c.commandId,request:structuredClone(c.request),artifactId:c.artifactId,requestedBy:context.actorId});break;
    }
    case 'request-owner-edge': {
      requireValue(context.actorType==='agent','EXECUTOR_REQUIRED','Trusted scheduler required');
      for(const report of p.ownerReports.filter(r=>r.artifactId===c.artifactId))requireValue(validateStoredOwnerWithin(new WeakMap(), p,report).decision==='accept','OWNER_BLOCKED','A substantive same-version owner blocker requires a corrected source version');
      const envelope=strategyDeliveryEnvelopeWithin(new WeakMap(), p,c.artifactId,c.sourceContents,c.consumerBinding),id=`owner-${envelope.envelopeHash}`;
      requireValue(c.edgeId===id,'INVALID_OWNER_EDGE','Deterministic edge ID required');
      if(p.ownerEdges.some(e=>e.id===id))break;
      const edge={id,protocolVersion:OWNER_EDGE_PROTOCOL,kind:'strategy-to-copy',envelope,sourceContents:structuredClone(c.sourceContents)};
      p.ownerEdges.push(edge);
      const jobId=`${id}-producer`;
      p.jobs.push({id:jobId,edgeId:id,purpose:'owner_acceptance',side:'producer',stage:'strategy',targetArtifactId:c.artifactId,inputVersionIds:[c.artifactId],status:'queued',binding:structuredClone(envelope.producerAssignment.binding),task:{id:jobId,parentId:p.id,owner:envelope.producerAssignment.binding.role,ownerInput:{envelope,side:'producer',producerReport:null}},attempts:[],requestedBy:context.actorId});break;
    }
    case 'queue-owner-consumer': {
      const edge=p.ownerEdges.find(e=>e.id===c.edgeId);requireValue(edge&&context.actorType==='agent','INVALID_OWNER_EDGE','Trusted registered edge required');ownerEdgeCurrentWithin(new WeakMap(), p,edge);
      const reports=p.ownerReports.filter(r=>r.edgeId===edge.id);requireValue(reports.every(r=>validateStoredOwnerWithin(new WeakMap(), p,r).decision==='accept'),'OWNER_BLOCKED','Owner blocker requires correction');
      const producer=reports.find(r=>r.side==='producer');requireValue(producer,'OWNER_REQUIRED','Producer acceptance required');
      const jobId=`${edge.id}-consumer-${producer.reportHash}`;if(p.jobs.some(j=>j.id===jobId))break;
      p.jobs.push({id:jobId,edgeId:edge.id,purpose:'owner_acceptance',side:'consumer',stage:'strategy',targetArtifactId:edge.envelope.source.artifactId,inputVersionIds:[edge.envelope.source.artifactId],status:'queued',binding:structuredClone(edge.envelope.consumerBinding),task:{id:jobId,parentId:p.id,owner:edge.envelope.consumerBinding.role,ownerInput:{envelope:edge.envelope,side:'consumer',producerReport:producer.rawReport}},attempts:[],requestedBy:context.actorId});break;
    }
    case 'complete-owner': {
      const job=p.jobs.find(j=>j.id===c.jobId);requireValue(job?.purpose==='owner_acceptance','INVALID_JOB','Owner job required');const attempt=runningAttempt(job,c,context),edge=p.ownerEdges.find(e=>e.id===job.edgeId);
      const validated=ownerReceiptWithin(new WeakMap(), p,job,attempt,c.executionReceipt,c.rawReport);
      requireValue(nonempty(c.reportId)&&!p.ownerReports.some(r=>r.id===c.reportId)&&nonempty(c.payloadRef)&&c.contentHash===hash(JSON.stringify(validated,null,2)),'INVALID_OWNER_EDGE','Exact persisted owner report required');
      let staleReason;try{ownerJobTargetWithin(new WeakMap(), p,job);}catch(error){staleReason=error.code;}
      p.ownerReports.push({...validated,id:c.reportId,edgeId:edge.id,artifactId:edge.envelope.source.artifactId,jobId:job.id,attemptId:attempt.id,context:structuredClone(context),rawReport:structuredClone(c.rawReport),reportHash:c.contentHash,payloadRef:c.payloadRef,executionReceipt:structuredClone(c.executionReceipt),...(staleReason?{staleReason}:{}),simulationLabel:'production owner acceptance; not independent review or customer approval'});
      attempt.status='succeeded';attempt.receipt=structuredClone(c.executionReceipt);job.status='succeeded';job.outputVersionIds=[c.reportId];break;
    }
    case 'commit-owner-edge': {
      const edge=p.ownerEdges.find(e=>e.id===c.edgeId);requireValue(edge&&context.actorType==='agent','INVALID_OWNER_EDGE','Trusted registered edge required');if(edge.commit)break;
      ownerEdgeCurrentWithin(new WeakMap(), p,edge);const a=targetWithin(new WeakMap(), p,edge.envelope.source.artifactId);eligibleWithin(new WeakMap(), p,a);requireValue(requireStrategyOwnersWithin(new WeakMap(), p,a).id===edge.id,'STALE_OWNER_EDGE','Exact accepted generation required');
      if(p.workflow)requireValue(a.strategyContract?.version===SIMPLE_STRATEGY_VERSION&&Object.keys(STAGES).indexOf(currentPolicy(p).authorizedThrough)>=Object.keys(STAGES).indexOf('copy'),'SIMPLE_COPY_AUTHORIZATION_REQUIRED','Only current explicitly authorized SIMPLE owner commit may queue copy');
      const jobId=`copy-${edge.id}`,task=ownerCopyTask(p,edge),binding=structuredClone(edge.envelope.consumerBinding);
      requireValue(isDeepStrictEqual(c.task,task)&&isDeepStrictEqual(c.binding,binding),'INVALID_OWNER_EDGE','Exact frozen copy job specification required');
      buildStageRequest({stage:'copy',brief:task.brief,inputArtifacts:[{id:a.id,stage:'strategy',content:edge.envelope.source.content,reviewConstraints:task.upstreamReviewConstraints[a.id]}],sourceRecords:task.sourceRecords,visualCatalogue:task.visualCatalogue,copyContractVersion:COPY_CONTRACT_VERSION});
      if(!p.releases.some(r=>r.artifactId===a.id&&r.policyVersion===currentPolicy(p).version))p.releases.push({artifactId:a.id,policyVersion:currentPolicy(p).version,actorId:context.actorId});
      requireValue(!p.jobs.some(j=>j.id===jobId),'INVALID_JOB','Unique downstream job required');
      p.jobs.push({id:jobId,stage:'copy',inputVersionIds:[a.id],status:'queued',binding,task,attempts:[],requestedBy:context.actorId});edge.commit={jobId,commandId:c.commandId};break;
    }

    case 'register-research-source':
      human(context);
      p.sourceEntries ??= [];
      p.sourceEntries.push(registerSource(p, c, context)); break;
    case 'revise-task-card':
      human(context);
      requireValue(c.taskCardId && c.brief && !p.taskCards.some(t => t.id === c.taskCardId), 'INVALID_SCOPE', 'New scope ID and brief are required');
      const revisedTask={id:c.taskCardId,brief:c.brief,createdBy:context.actorId};
      if(c.finalReturnId){const returned=p.finalReviewReturns?.find(x=>x.id===c.finalReturnId&&x.status==='open');requireValue(returned&&returned.target.owner==='proposal-director'&&returned.target.address.domain==='task'&&returned.target.address.identity===p.activeTaskCardId,'FINAL_CORRECTION_REQUIRED','Exact open current task return required');revisedTask.finalReturnCorrection={protocol:'final-return-task-correction-v1',returnId:returned.id,commandId:c.commandId,previousTaskCardId:p.activeTaskCardId};}
      p.taskCards.push(revisedTask); p.activeTaskCardId = c.taskCardId; break;
    case 'confirm-task-card':
      human(context);
      requireValue(p.taskCards.find(t=>t.id===c.taskCardId)?.protocol!=='task-card-v1','TASK_CARD_EXACT_CONFIRMATION_REQUIRED','Structured task cards require versioned exact-field confirmation');
      requireValue(c.taskCardId === p.activeTaskCardId, 'STALE_SCOPE', 'Only active scope can be confirmed');
      p.confirmations.push({taskCardId: c.taskCardId, actorId: context.actorId}); break;
    case 'authorize-visual':
      human(context);
      requireValue(targetWithin(new WeakMap(), p, c.sketchArtifactId).stage === 'sketch' && c.reason, 'INVALID_AUTHORIZATION', 'Exact sketch and authorization reason required');
      p.visualAuthorizations.push({sketchArtifactId: c.sketchArtifactId, actorId: context.actorId, reason: c.reason}); break;
    case 'set-policy':
      requireValue(!p.workflow,'SEVEN_STAGE_ROUTE_REQUIRED','Current protocol policy updates require their own authorized route');
      human(context); p.policies.push(policy(c.mode, c.humanGates, currentPolicy(p).version + 1, c.authorizedThrough ?? currentPolicy(p).authorizedThrough)); break;
    case 'request-case-identity': {
      requireValue(context.actorType === 'agent' && nonempty(c.jobId) && !p.jobs.some(job => job.id === c.jobId), 'INVALID_JOB', 'Trusted unique identity job required');
      requireValue(c.binding && ['providerId','model','role'].every(key => nonempty(c.binding[key])), 'INVALID_BINDING', 'Identity reviewer binding required');
      const job = {id:c.jobId,purpose:'case_identity',stage:'case_identity',inputVersionIds:[],status:'queued',binding:structuredClone(c.binding),task:structuredClone(c.task),requestedBy:context.actorId,attempts:[]};
      caseIdentityTarget(p,job); p.jobs.push(job); break;
    }
    case 'complete-case-identity': {
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.purpose === 'case_identity', 'INVALID_JOB', 'Identity job required');
      const attempt=runningAttempt(job,c,context); observationReviewExecutor(p,job,context);
      observationReceipt(p,job,attempt,c.executionReceipt,c.rawReport);
      const input=job.task.caseIdentityInput, images=[input.referenceImage,input.sourceImage];
      const validated=validateCaseIdentityOutput(c.rawReport,input,images);
      requireValue(nonempty(c.reportId) && !p.caseIdentityReviews.some(item=>item.id===c.reportId) && nonempty(c.payloadRef) && c.contentHash===hash(JSON.stringify(validated,null,2)), 'INVALID_CASE_IDENTITY', 'Exact saved identity report required');
      p.caseIdentityReviews.push({id:c.reportId,jobId:job.id,attemptId:attempt.id,taskCard:structuredClone(input.taskCard),rawReport:structuredClone(c.rawReport),report:validated,
        ...(validated.verdict==='usable'?{caseEvidence:buildCaseEvidenceRecord({input,rawReport:c.rawReport,actualImages:images,id:`case_${c.reportId}`})}:{}),
        payloadRef:c.payloadRef,reportHash:c.contentHash,executionReceipt:structuredClone(c.executionReceipt),context:structuredClone(context),createdAt:context.now??null});
      attempt.status='succeeded';attempt.receipt=structuredClone(c.executionReceipt);attempt.finishedAt=context.now??null;job.status='succeeded';job.outputVersionIds=[c.reportId];break;
    }
    case 'request-source-capture': {
      requireValue(context.actorType === 'agent' && nonempty(c.jobId) && !p.jobs.some(job => job.id === c.jobId), 'INVALID_JOB', 'Trusted unique capture job required');
      let url; try { url = new URL(c.task?.url); } catch { fail('INVALID_CAPTURE', 'Public HTTPS URL required'); }
      requireValue(url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 4000, 'INVALID_CAPTURE', 'Public HTTPS URL required');
      p.jobs.push({id: c.jobId, purpose: 'source_capture', stage: 'source_capture', inputVersionIds: [], status: 'queued', binding: {providerId: 'public-https', model: 'bounded-acquisition-v1', role: 'source-acquisition'}, task: structuredClone(c.task), requestedBy: context.actorId, attempts: []});
      break;
    }
    case 'complete-source-capture': {
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.purpose === 'source_capture', 'INVALID_JOB', 'Capture job required');
      const attempt = runningAttempt(job, c, context), capture = c.capture;
      requireValue(capture && capture.projectId === p.id && capture.id === `capture_${capture.recordHash}` && /^[a-f0-9]{64}$/.test(capture.recordHash)
        && capture.record?.requestedUrl === job.task.url && capture.record.raw?.sha256 && nonempty(capture.recordPath), 'INVALID_CAPTURE', 'Exact captured source and immutable record required');
      const existing = p.sourceCaptures.find(item => item.id === capture.id);
      requireValue(!existing || isDeepStrictEqual(existing, capture), 'INVALID_CAPTURE', 'Capture identity cannot change');
      if (!existing) p.sourceCaptures.push(structuredClone(capture));
      attempt.status = 'succeeded'; attempt.finishedAt = context.now ?? null;
      attempt.acquisitionReceipt = {recordHash: capture.recordHash, recordPath: capture.recordPath, rawHash: capture.record.raw.sha256};
      job.status = 'succeeded'; job.outputVersionIds = [capture.id]; break;
    }
    case 'register-image': {
      requireValue(context.actorType === 'agent', 'EXECUTOR_REQUIRED', 'Only trusted ingestion may register image metadata');
      const a = c.asset;
      requireValue(a && Object.keys(a).every(key => ['id', 'projectId', 'sha256', 'mediaType', 'byteLength', 'width', 'height', 'uploadedAt', 'provenance'].includes(key))
        && a.projectId === p.id && !p.imageAssets.some(item => item.id === a.id)
        && Number.isSafeInteger(a.width) && a.width > 0 && Number.isSafeInteger(a.height) && a.height > 0
        && a.width * a.height <= IMAGE_LIMITS.pixels && nonempty(a.uploadedAt)
        && a.provenance && ['screenshot','supplied_image'].includes(a.provenance.representation), 'INVALID_IMAGE_ASSET', 'Unique project-bound image metadata required');
      imageManifest([a]);
      p.imageAssets.push(structuredClone(a));
      break;
    }
    case 'request-observation': {
      requireValue(nonempty(c.jobId) && !p.jobs.some(job => job.id === c.jobId), 'INVALID_JOB', 'Unique observation job required');
      requireValue(c.binding && ['providerId', 'model', 'role'].every(key => nonempty(c.binding[key])), 'INVALID_BINDING', 'Provider, model and role are required');
      requireValue(c.task && nonempty(c.task.id) && nonempty(c.task.owner) && (c.task.parentId === null || nonempty(c.task.parentId)), 'INVALID_TASK', 'Task identity required');
      const job = {id: c.jobId, purpose: 'observation', stage: 'observation', inputVersionIds: [p.activeTaskCardId], status: 'queued',
        requestedBy: context.actorId, binding: structuredClone(c.binding), task: structuredClone(c.task), attempts: []};
      observationTarget(p, job);
      p.jobs.push(job);
      break;
    }
    case 'complete-observation': {
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.purpose === 'observation', 'INVALID_JOB', 'Observation job required');
      const attempt = runningAttempt(job, c, context);
      observationExecutor(p, job, context);
      observationReceipt(p, job, attempt, c.executionReceipt, c.rawReport);
      const validated = validateImageObservationOutput(c.rawReport, job.task.observationInput.images);
      requireValue(nonempty(c.reportId) && !p.imageObservations.some(item => item.id === c.reportId) && nonempty(c.payloadRef)
        && c.contentHash === hash(JSON.stringify(validated, null, 2)), 'INVALID_OBSERVATION', 'Unique report ID and exact saved report hash required');
      p.imageObservations.push({...validated, id: c.reportId, protocolVersion: 'visual-observation-v1', jobId: job.id, attemptId: attempt.id,
        images: structuredClone(job.task.observationInput.images), taskCard: structuredClone(job.task.observationInput.taskCard), rawReport: structuredClone(c.rawReport),
        payloadRef: c.payloadRef, reportHash: c.contentHash, executionReceipt: structuredClone(c.executionReceipt), context: structuredClone(context), createdAt: context.now ?? null});
      attempt.status = 'succeeded'; attempt.receipt = structuredClone(c.executionReceipt); attempt.finishedAt = context.now ?? null;
      job.status = 'succeeded'; job.outputVersionIds = [c.reportId];
      break;
    }
    case 'request-observation-review': {
      requireValue(nonempty(c.jobId) && !p.jobs.some(job => job.id === c.jobId), 'INVALID_JOB', 'Unique observation review job required');
      requireValue(c.binding && ['providerId', 'model', 'role'].every(key => nonempty(c.binding[key])), 'INVALID_BINDING', 'Provider, model and role are required');
      requireValue(c.task && nonempty(c.task.id) && nonempty(c.task.owner) && (c.task.parentId === null || nonempty(c.task.parentId)), 'INVALID_TASK', 'Task identity required');
      const job = {id: c.jobId, purpose: 'observation_review', stage: 'observation_review', targetObservationId: c.observationId,
        inputVersionIds: [c.observationId], status: 'queued', requestedBy: context.actorId,
        binding: structuredClone(c.binding), task: structuredClone(c.task), attempts: []};
      observationReviewTarget(p, job); p.jobs.push(job); break;
    }
    case 'complete-observation-review': {
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.purpose === 'observation_review', 'INVALID_JOB', 'Observation review job required');
      const attempt = runningAttempt(job, c, context);
      observationReviewExecutor(p, job, context);
      observationReceipt(p, job, attempt, c.executionReceipt, c.rawReport);
      const input = job.task.observationReviewInput;
      const validated = validateImageObservationReviewOutput(c.rawReport, input.images, input.rawReport);
      requireValue(nonempty(c.reportId) && !p.observationReviews.some(item => item.id === c.reportId) && nonempty(c.payloadRef)
        && c.contentHash === hash(JSON.stringify(validated, null, 2)), 'INVALID_OBSERVATION', 'Unique report ID and exact saved report hash required');
      p.observationReviews.push({...validated, id: c.reportId, protocolVersion: 'visual-observation-review-v1', jobId: job.id, attemptId: attempt.id,
        observationId: input.observationId, observationContentHash: input.contentHash, images: structuredClone(input.images), taskCard: structuredClone(input.taskCard),
        acceptedCatalogue: buildAcceptedImageFeatureCatalogue({images: input.images, rawReport: input.rawReport, rawReview: c.rawReport}),
        rawReport: structuredClone(c.rawReport), payloadRef: c.payloadRef, reportHash: c.contentHash,
        executionReceipt: structuredClone(c.executionReceipt), context: structuredClone(context), createdAt: context.now ?? null});
      attempt.status = 'succeeded'; attempt.receipt = structuredClone(c.executionReceipt); attempt.finishedAt = context.now ?? null;
      job.status = 'succeeded'; job.outputVersionIds = [c.reportId]; break;
    }
    case 'submit-feedback': {
      human(context);
      const fields = ['kind', 'artifactId', 'feedbackId', 'instructions', 'themes', 'materials', 'commandId', 'expectedRevision'];
      requireValue(Object.keys(c).every(key => fields.includes(key)), 'INVALID_HUMAN_FEEDBACK', 'Feedback accepts creative directions and registered materials only');
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      requireValue(nonempty(c.feedbackId) && c.feedbackId.length <= 20000 && !p.humanFeedback.some(item => item.id === c.feedbackId), 'INVALID_HUMAN_FEEDBACK', 'Unique feedback ID required');
      const instructions = c.instructions ?? '', themes = c.themes ?? [], materials = c.materials ?? [];
      requireValue(typeof instructions === 'string' && instructions.length <= 20000 && Array.isArray(themes) && themes.length <= 200
        && themes.every(item => item && Object.keys(item).every(key => ['text', 'intendedUse'].includes(key)) && nonempty(item.text) && item.text.length <= 20000 && nonempty(item.intendedUse) && item.intendedUse.length <= 20000)
        && Array.isArray(materials) && materials.length <= 4, 'INVALID_HUMAN_FEEDBACK', 'Bounded instructions, themes and materials required');
      const normalized = materials.map(material => {
        requireValue(material && Object.keys(material).every(key => ['imageId', 'intendedUse', 'borrowingNotes'].includes(key))
          && nonempty(material.imageId) && nonempty(material.intendedUse) && material.intendedUse.length <= 20000
          && nonempty(material.borrowingNotes) && material.borrowingNotes.length <= 20000, 'INVALID_HUMAN_FEEDBACK', 'Material requires image ID, purpose and borrowing notes');
        const asset = p.imageAssets.find(item => item.id === material.imageId);
        requireValue(asset, 'INVALID_HUMAN_FEEDBACK', 'Register feedback material before submitting');
        return {...material, sha256: imageManifest([asset])[0].sha256};
      });
      requireValue(instructions.trim() || themes.length || materials.length, 'INVALID_HUMAN_FEEDBACK', 'Empty feedback is not a revision request');
      const item = {id: c.feedbackId, artifactId: a.id, artifactHash: a.contentHash, stage: a.stage,
        taskCardId: p.activeTaskCardId, policyVersion: currentPolicy(p).version, instructions, themes: structuredClone(themes), materials: normalized,
        createdBy: context.actorId, context: structuredClone(context), createdAt: context.now ?? null};
      const combined = [...stageFeedback(p, a.stage), item];
      requireValue(combined.length <= 200, 'INVALID_HUMAN_FEEDBACK', 'At most 200 feedback records per stage and task card');
      requireValue(new Set(combined.flatMap(entry => entry.materials.map(material => material.imageId))).size <= 4,
        'INVALID_HUMAN_FEEDBACK', 'At most four distinct material images per stage feedback set');
      p.humanFeedback.push(item);
      break;
    }
    case 'request-creative-panel': {
      const a=targetWithin(new WeakMap(), p,c.artifactId);
      requireValue(context.actorType==='agent'&&['strategy','copy'].includes(a.stage),'INVALID_CREATIVE_PANEL','Trusted text panel coordinator required');
      requireValue(nonempty(c.panel?.id)&&!p.creativePanels.some(x=>x.id===c.panel.id),'INVALID_CREATIVE_PANEL','Unique panel ID required');
      const plan=creativePlan(c.panel.packet,c.bindings,c.panel.packet.calibrations);
      requireValue(isDeepStrictEqual(plan.packet,c.panel.packet)&&plan.packetHash===c.panel.packetHash,'INVALID_CREATIVE_PANEL','Plan packet mismatch');
      requireValue(c.panel.nodes.length===plan.nodes.length&&c.panel.nodes.every((n,i)=>isDeepStrictEqual({...n,jobId:undefined,context:undefined},{...plan.nodes[i],jobId:undefined,context:undefined})),'INVALID_CREATIVE_PANEL','Exact protocol node graph required');
      requireValue(!p.creativePanels.some(x=>x.packet.artifactId===a.id&&x.packet.feedbackHash===c.panel.packet.feedbackHash&&x.packet.policyVersion===currentPolicy(p).version&&x.packet.protocolVersion===c.panel.packet.protocolVersion),'PANEL_FROZEN','Panel generation already exists');
      requireValue(hash(JSON.stringify(c.panel.packet.content,null,2))===a.contentHash,'INVALID_CREATIVE_PANEL','Frozen artifact bytes required');
      creativeTargetWithin(new WeakMap(), p,c.panel);
      const contexts=c.panel.nodes.map(n=>n.context);
      for(const n of c.panel.nodes){identity(n.context);requireValue(nonempty(n.jobId)&&contexts.filter(x=>intersectsLineage(x,n.context)).length===1,'REVIEW_SEAT_REUSED','Distinct planned identities required');independentVerifier(p,a,n.context);}
      p.creativePanels.push(structuredClone(c.panel));
      p.panels.push({artifactId:a.id,creativePanelId:c.panel.id,assignmentPolicy:'assigned_actor_with_durable_attempts',seats:c.panel.nodes.filter(n=>n.phase==='score').map(n=>({role:n.role,jobId:n.jobId,...n.context})),assignedBy:structuredClone(context)});break;
    }
    case 'request-creative-node': {
      const panel=p.creativePanels.find(x=>x.id===c.panelId),node=panel?.nodes.find(x=>x.key===c.nodeKey);
      requireValue(context.actorType==='agent'&&node&&!p.jobs.some(j=>j.id===node.jobId),'INVALID_CREATIVE_PANEL','Unscheduled trusted node required');
      const input=creativeNodeInput(panel,node,p.creativeReports),job={id:node.jobId,purpose:'creative_review',panelId:panel.id,nodeKey:node.key,stage:panel.packet.stage,
        targetArtifactId:panel.packet.artifactId,inputVersionIds:[panel.packet.artifactId],status:'queued',binding:structuredClone(node.binding),task:{id:node.jobId,parentId:panel.id,owner:node.binding.role,creativeInput:input},requestedBy:context.actorId,attempts:[],assignedContexts:[structuredClone(node.context)]};
      creativeJobTargetWithin(new WeakMap(), p,job);p.jobs.push(job);break;
    }
    case 'resume-creative-panel': {
      const panel=p.creativePanels.find(x=>x.id===c.panelId);
      requireValue(context.actorType==='agent'&&panel&&Array.isArray(c.assignments),'INVALID_CREATIVE_PANEL','Trusted resume plan required');creativeTargetWithin(new WeakMap(), p,panel);
      requireValue(new Set(c.assignments.map(x=>x.jobId)).size===c.assignments.length,'INVALID_CREATIVE_PANEL','Unique retry jobs required');
      for(const assignment of c.assignments){
        const job=p.jobs.find(j=>j.id===assignment.jobId),node=panel.nodes.find(n=>n.jobId===assignment.jobId),prior=job?.attempts.at(-1);
        requireValue(node&&job?.panelId===panel.id&&['failed','blocked'].includes(job.status)&&prior?.dispatchStarted===false
          && ['PROVIDER_MISSING','MODEL_BINDING_MISMATCH'].includes(job.error?.code),'UNSAFE_RETRY','Only explicitly undispatched provider configuration failures may retry');
        identity(assignment.context);requireValue(assignment.context.actorId===node.context.actorId&&assignment.context.runId!==prior.executor.runId&&assignment.context.contextId!==prior.executor.contextId,
          'INVALID_CREATIVE_PANEL','Retry keeps assigned role actor and adds a fresh durable run and context');
        requireValue(p.jobs.every(j=>j.attempts.every(a=>a.id!==assignment.context.runId&&a.executor.contextId!==assignment.context.contextId)),'REVIEW_SEAT_REUSED','Retry identities must be fresh');
        job.assignedContexts.push(structuredClone(assignment.context));job.status='queued';delete job.error;
      }
      break;
    }
    case 'resume-owner-job': {
      const job=p.jobs.find(j=>j.id===c.jobId);requireValue(context.actorType==='agent'&&job?.purpose==='owner_acceptance'&&['blocked','failed'].includes(job.status)&&!job.attempts.some(t=>t.dispatchStarted===true)&&['PROVIDER_MISSING','MODEL_BINDING_MISMATCH','OWNER_BINDING_CHANGED'].includes(job.error?.code),'UNSAFE_RETRY','Only proven undispatched owner configuration failure can resume');ownerJobTargetWithin(new WeakMap(), p,job);job.status='queued';delete job.error;break;
    }
    case 'mark-owner-dispatched': {
      const job=p.jobs.find(j=>j.id===c.jobId);requireValue(job?.purpose==='owner_acceptance','INVALID_JOB','Owner job required');const attempt=runningAttempt(job,c,context);ownerJobTargetWithin(new WeakMap(), p,job);ownerContext(p,job,context);requireValue(attempt.dispatchStarted===false,'INVALID_ATTEMPT','Dispatch may start once');attempt.dispatchStarted=true;break;
    }
    case 'mark-creative-dispatched': {
      const job=p.jobs.find(j=>j.id===c.jobId);requireValue(job?.purpose==='creative_review','INVALID_JOB','Creative job required');
      const attempt=runningAttempt(job,c,context);creativeContextWithin(new WeakMap(), p,job,context);
      requireValue(attempt.dispatchStarted===false,'INVALID_ATTEMPT','Dispatch may start once');attempt.dispatchStarted=true;break;
    }
    case 'complete-creative-node': {
      const job=p.jobs.find(j=>j.id===c.jobId);requireValue(job?.purpose==='creative_review','INVALID_JOB','Creative node job required');
      const attempt=runningAttempt(job,c,context);creativeContextWithin(new WeakMap(), p,job,context);
      const {panel,node,a}=creativeJobTargetWithin(new WeakMap(), p,job),report=creativeReceiptWithin(new WeakMap(), p,job,attempt,c.executionReceipt,c.rawReport);
      requireValue(nonempty(c.reportId)&&!p.creativeReports.some(r=>r.id===c.reportId||r.panelId===panel.id&&r.nodeKey===node.key)&&c.contentHash===hash(JSON.stringify(report,null,2))&&nonempty(c.payloadRef),'INVALID_CREATIVE_PANEL','Unique saved exact report required');
      const entry={id:c.reportId,panelId:panel.id,nodeKey:node.key,phase:node.phase,role:node.role,artifactId:a.id,jobId:job.id,attemptId:attempt.id,rawReport:structuredClone(c.rawReport),reportHash:c.contentHash,payloadRef:c.payloadRef,executionReceipt:structuredClone(c.executionReceipt),context:structuredClone(context),createdAt:context.now??null};
      p.creativeReports.push(entry);attempt.status='succeeded';attempt.receipt=structuredClone(c.executionReceipt);attempt.finishedAt=context.now??null;job.status='succeeded';job.outputVersionIds=[entry.id];
      const all=p.creativeReports.filter(r=>r.panelId===panel.id);
      const issueFinding=i=>({category:i.category==='creative'?'creative_preference':i.category==='scope'?'scope':'factual',severity:i.severity,blocking:i.severity!=='minor'||i.category!=='creative',requirement:i.finding,evidenceRefs:i.evidence.length?i.evidence:[{absence:i.materialAbsence}],reason:i.impact});
      if(node.phase==='score'){
        const calibrated=panel.packet.calibrations.some(k=>k.status==='verified'&&k.protocolVersion===panel.packet.protocolVersion&&k.stage===a.stage&&k.role===node.role&&k.providerId===job.binding.providerId&&k.model===job.binding.model&&nonempty(k.evidenceRef)&&/^[a-f0-9]{64}$/.test(k.evidenceHash??''));
        p.reviews.push({id:entry.id,artifactId:a.id,reviewType:'score',role:node.role,verdict:calibrated&&report.items.every(i=>i.verdict==='pass')&&report.groupComparisons.every(g=>g.verdict==='distinct')?'pass':'reject',findings:[...report.issues.map(issueFinding),...(!calibrated?[{category:'creative_preference',severity:'major',blocking:false,reason:'Uncalibrated diagnostic score, not approval'}]:[])],context:structuredClone(context),creativePanelId:panel.id,executionReceipt:structuredClone(c.executionReceipt),protocolVersion:panel.packet.protocolVersion,calibration:calibrated?'verified':'uncalibrated',dimensions:report.items,groupComparisons:report.groupComparisons,simulationLabel:'actual independent model judgment; not human approval'});
      }else if(node.phase==='opposition'){
        const paired=all.find(r=>r.nodeKey===`${node.role}:score`),first=all.find(r=>r.nodeKey===`${node.role}:opposition_first_read`);
        p.reviews.push({id:entry.id,artifactId:a.id,reviewType:'opposition',role:node.role,verdict:report.challenges.length?'reject':'pass',findings:report.challenges.map(c=>issueFinding(c.issue)),context:structuredClone(context),pairedReviewId:paired.id,firstReadRef:first.id,creativePanelId:panel.id,executionReceipt:structuredClone(c.executionReceipt),simulationLabel:'actual independent model opposition; no score'});
      }else if(node.phase==='director'){
        const outcome=creativeDecision(panel,all);
        p.decisions.push({kind:'creative-director',human:false,outcome:outcome.status==='pass'?'reject':'pending',creativeStatus:outcome.status,creativePanelId:panel.id,evidenceRefs:report.adjudications.flatMap(a=>a.evidence),artifactId:a.id,actorId:context.actorId,reason:report.reason,policyVersion:currentPolicy(p).version,reviewIds:p.reviews.filter(r=>r.creativePanelId===panel.id).map(r=>r.id),adjudications:report.adjudications,groupVerdict:report.groupVerdict});
      }
      break;
    }
    case 'request-correction-review': {
      requireValue(context.actorType==='agent'&&nonempty(c.jobId)&&!p.jobs.some(j=>j.id===c.jobId),'INVALID_JOB','Trusted unique correction check required');
      requireValue(c.binding&&['providerId','model','role'].every(k=>nonempty(c.binding[k])),'INVALID_BINDING','Correction reviewer binding required');
      const job={id:c.jobId,purpose:'correction_review',stage:targetWithin(new WeakMap(), p,c.artifactId).stage,targetArtifactId:c.artifactId,inputVersionIds:[c.artifactId],status:'queued',binding:structuredClone(c.binding),task:structuredClone(c.task),requestedBy:context.actorId,attempts:[]};
      correctionReviewTargetWithin(new WeakMap(), p,job);p.jobs.push(job);break;
    }
    case 'complete-correction-review': {
      const job=p.jobs.find(j=>j.id===c.jobId);requireValue(job?.purpose==='correction_review','INVALID_JOB','Correction check job required');
      const attempt=runningAttempt(job,c,context),a=targetWithin(new WeakMap(), p,job.targetArtifactId);independentVerifier(p,a,context);
      correctionReviewReceiptWithin(new WeakMap(), p,job,attempt,c.executionReceipt,c.rawReport,c.reportId);
      const validated=validateCorrectionReviewOutput(c.rawReport,job.task.correctionReviewInput);
      requireValue(nonempty(c.reportId)&&!p.correctionReviews.some(r=>r.id===c.reportId)&&nonempty(c.payloadRef)&&c.contentHash===hash(JSON.stringify(validated,null,2)),
        'INVALID_CORRECTION','Unique exact saved correction check required');
      p.correctionReviews.push({...validated,id:c.reportId,jobId:job.id,attemptId:attempt.id,rawReport:structuredClone(c.rawReport),payloadRef:c.payloadRef,reportHash:c.contentHash,executionReceipt:structuredClone(c.executionReceipt),context:structuredClone(context),createdAt:context.now??null});
      attempt.status='succeeded';attempt.receipt=structuredClone(c.executionReceipt);attempt.finishedAt=context.now??null;job.status='succeeded';job.outputVersionIds=[c.reportId];break;
    }
    case 'request-feedback-review': {
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      requireValue(nonempty(c.jobId) && !p.jobs.some(item => item.id === c.jobId), 'INVALID_JOB', 'Unique feedback review job required');
      requireValue(c.binding && ['providerId', 'model', 'role'].every(key => nonempty(c.binding[key])), 'INVALID_BINDING', 'Reviewer model binding required');
      requireValue(c.task && nonempty(c.task.id) && nonempty(c.task.owner) && (c.task.parentId === null || nonempty(c.task.parentId)), 'INVALID_TASK', 'Reviewer task required');
      const job = {id: c.jobId, purpose: 'feedback_review', stage: a.stage, targetArtifactId: a.id, inputVersionIds: [a.id], status: 'queued',
        requestedBy: context.actorId, binding: structuredClone(c.binding), task: structuredClone(c.task), attempts: []};
      feedbackReviewTargetWithin(new WeakMap(), p, job); p.jobs.push(job); break;
    }
    case 'complete-feedback-review': {
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.purpose === 'feedback_review', 'INVALID_JOB', 'Feedback review job required');
      const attempt = runningAttempt(job, c, context), a = targetWithin(new WeakMap(), p, job.targetArtifactId);
      independentVerifier(p, a, context);
      feedbackReviewReceiptWithin(new WeakMap(), p, job, attempt, c.executionReceipt, c.rawReport);
      const validated = validateFeedbackReviewOutput(c.rawReport, job.task.feedbackReviewInput);
      requireValue(nonempty(c.reportId) && !p.feedbackReviews.some(item => item.id === c.reportId) && nonempty(c.payloadRef)
        && c.contentHash === hash(JSON.stringify(validated, null, 2)), 'INVALID_FEEDBACK_REVIEW', 'Unique saved feedback report and exact hash required');
      p.feedbackReviews.push({...validated, id: c.reportId, jobId: job.id, attemptId: attempt.id, artifactId: a.id,
        rawReport: structuredClone(c.rawReport), payloadRef: c.payloadRef, reportHash: c.contentHash, executionReceipt: structuredClone(c.executionReceipt),
        context: structuredClone(context), createdAt: context.now ?? null, simulationLabel: 'independent model feedback handling review; not aesthetic approval or human acceptance'});
      attempt.status = 'succeeded'; attempt.receipt = structuredClone(c.executionReceipt); attempt.finishedAt = context.now ?? null;
      job.status = 'succeeded'; job.outputVersionIds = [c.reportId]; break;
    }
    case 'request-stage': {
      if(c.stage==='research'&&c.task?.researchQuestionRegistration){const r=researchQuestionRegistration(p);requireValue(r&&isDeepStrictEqual(c.task.researchQuestionRegistration,r)&&c.task.researchQuestionRegistrationId===r.id&&c.task.researchQuestionRegistrationHash===r.registrationHash,'RESEARCH_QUESTIONS_CHANGED','Producer must freeze actual current question registration');}
      if(p.workflow){requireResearchWorkflow(p);assertWorkflowStage(p,c.stage);if(c.stage==='research')requireValue(isDeepStrictEqual(c.task?.researchMethod,researchMethodIdentity()),'RESEARCH_METHOD_REQUIRED','Current fixed research method required');}
      requireValue(!['layout','final_review'].includes(c.stage),'LAYOUT_EXECUTION_UNAVAILABLE','Project layout and final stages require the dedicated unavailable runtime');
      requireValue(Object.hasOwn(STAGES, c.stage) && nonempty(c.jobId) && !p.jobs.some(j => j.id === c.jobId), 'INVALID_JOB', 'Unique job and known stage required');
      const inputVersionIds = inputsForWithin(new WeakMap(), p, c.stage, c.binding);
      currentCaseSources(p,c.task?.sourceRecords??[]);
      if (c.binding !== undefined) requireValue(c.binding && ['providerId', 'model', 'role'].every(key => nonempty(c.binding[key])), 'INVALID_BINDING', 'Provider, model and role are required');
      if (c.task !== undefined) requireValue(c.task && nonempty(c.task.id) && nonempty(c.task.owner) && (c.task.parentId === null || nonempty(c.task.parentId)), 'INVALID_TASK', 'Task ID, owner and nullable parent ID are required');
      requireValue((c.binding === undefined) === (c.task === undefined), 'INVALID_JOB', 'Execution binding and task must be supplied together');
      if (c.task&&c.task.correctionInput?.protocolVersion!==LATEST_CORRECTION_PROTOCOL) requireValue(isDeepStrictEqual(c.task.visualCatalogue ?? [], stageVisualCatalogue(p, c.stage, inputVersionIds)), 'INVALID_VISUAL_CATALOGUE', 'Stage must freeze current reviewed visual catalogue or inherit exact upstream entries');
      const job = {id: c.jobId, stage: c.stage, inputVersionIds, status: 'queued', requestedBy: context.actorId,
        ...(c.binding ? {binding: structuredClone(c.binding), task: structuredClone(c.task)} : {}), attempts: []};
      if(c.stage==='research'&&c.binding)requireValue(c.task.researchContractVersion===RESEARCH_DATA_VERSION,'RESEARCH_V2_REQUIRED','New research requires research-data-v2');
      requireResearchBasis(p,job);
      if(c.stage==='strategy'&&c.binding)requireValue(c.task.strategyContractVersion===(p.workflow?SIMPLE_STRATEGY_VERSION:STRATEGY_CONTRACT_VERSION),'STRATEGY_V2_REQUIRED','New strategy production requires strategy-v2');
      requireStrategyBasisWithin(new WeakMap(), p,job);requireResearchStrategyJobWithin(new WeakMap(), p,job);requireOwnerCopyJobWithin(new WeakMap(), p,job);validateJobRevisionWithin(new WeakMap(), p, job); p.jobs.push(job); break;
    }
    case 'freeze-strategy-inputs': {
      const job=p.jobs.find(j=>j.id===c.jobId);
      requireValue([STRATEGY_CONTRACT_VERSION,SIMPLE_STRATEGY_VERSION].includes(job?.task?.strategyContractVersion)&&job.status==='running','INVALID_JOB','Running strategy-v2 required');
      runningAttempt(job,c,context);requireStrategyBasisWithin(new WeakMap(), p,job);if(job.task.strategyContractVersion===STRATEGY_CONTRACT_VERSION)requireStrategyInputs(job.task.strategyBasis,c.inputArtifacts);else requireValue(c.inputArtifacts.length===1&&hash(JSON.stringify(c.inputArtifacts[0].content,null,2))===job.task.strategyBasis.sources[1].contentHash,'INVALID_STRATEGY_INPUT','Exact simple research original required');
      requireValue(isDeepStrictEqual(c.inputArtifacts.map(x=>x.id),job.inputVersionIds)&&c.inputArtifacts.every(x=>isDeepStrictEqual(x.reviewConstraints,job.task.upstreamReviewConstraints?.[x.id])),'INVALID_STRATEGY_INPUT','Original input identity and restrictions required');
      requireValue(!job.task.strategyInputArtifacts||isDeepStrictEqual(job.task.strategyInputArtifacts,c.inputArtifacts),'INVALID_STRATEGY_INPUT','Frozen strategy inputs cannot change');
      job.task.strategyInputArtifacts=structuredClone(c.inputArtifacts);break;
    }
    case 'request-verification': {
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      requireValue(nonempty(c.jobId) && !p.jobs.some(job => job.id === c.jobId), 'INVALID_JOB', 'Unique verification job required');
      requireValue(c.binding && ['providerId', 'model', 'role'].every(key => nonempty(c.binding[key])), 'INVALID_BINDING', 'Provider, model and role are required');
      requireValue(c.task && nonempty(c.task.id) && nonempty(c.task.owner) && (c.task.parentId === null || nonempty(c.task.parentId)), 'INVALID_TASK', 'Task ID, owner and nullable parent ID are required');
      const job = {id: c.jobId, purpose: 'verification', stage: a.stage, targetArtifactId: a.id, inputVersionIds: [a.id], status: 'queued',
        requestedBy: context.actorId, binding: structuredClone(c.binding), task: structuredClone(c.task), attempts: []};
      verificationTargetWithin(new WeakMap(), p, job);
      p.jobs.push(job);
      break;
    }
    case 'reconcile-simple-strategy-verification':
    case 'complete-verification': {
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.purpose === 'verification', 'INVALID_JOB', 'Verification job required');
      const recovering=c.kind==='reconcile-simple-strategy-verification',originalAttempt=job.attempts.at(-1);
      if(recovering){const artifact=p.artifacts.find(a=>a.id===job.targetArtifactId);requireValue(artifact?.strategyContract?.version===SIMPLE_STRATEGY_VERSION&&job.status==='awaiting_reconciliation'&&originalAttempt?.status==='awaiting_reconciliation'&&originalAttempt.id===c.attemptId&&isOrdinaryHttp(originalAttempt.receipt)&&context.actorType==='agent'&&!sameExecutor(originalAttempt.executor,context),'INVALID_RECONCILIATION','Current simple verification original required');const producer=p.jobs.find(j=>j.outputVersionIds?.includes(artifact.id)&&j.task?.strategyContractVersion===SIMPLE_STRATEGY_VERSION);requireStrategyBasisWithin(new WeakMap(),p,producer);requireValue(isDeepStrictEqual(c.executionReceipt,{...originalAttempt.receipt,validatedOutputPath:c.payloadRef,validatedOutputHash:c.contentHash}),'INVALID_RECONCILIATION','Exact original verification receipt required');}
      const attempt = recovering?originalAttempt:runningAttempt(job, c, context),reviewContext=recovering?attempt.executor:context;
      const a = verificationTargetWithin(new WeakMap(), p, job);
      independentVerifier(p, a, reviewContext);
      verificationReceipt(p, a, job, attempt, c.executionReceipt, undefined, c.rawReport);
      p.verifications ??= [];
      requireValue(nonempty(c.reportId) && !p.verifications.some(report => report.id === c.reportId) && nonempty(c.payloadRef) && /^[a-f0-9]{64}$/.test(c.contentHash),
        'INVALID_VERIFICATION', 'Unique report ID, saved payload and SHA256 required');
      const validated = validateEvidenceReviewOutput(c.rawReport, job.task.verificationInput);
      if (evidenceProtocolCapabilities(evidenceReviewProtocol(job.task.verificationInput)).catalogueState) requireValue(c.contentHash === hash(JSON.stringify(validated, null, 2)),
        'INVALID_VERIFICATION', 'V3 verification saved report must bind normalized bytes');
      p.verifications.push({...validated, id: c.reportId, jobId: job.id, attemptId: attempt.id, rawReport: structuredClone(c.rawReport),
        payloadRef: c.payloadRef, reportHash: c.contentHash, executionReceipt: structuredClone(c.executionReceipt), context: structuredClone(reviewContext), ...(recovering?{recoveredBy:structuredClone(context)}:{}),
        createdAt: context.now ?? null, simulationLabel: 'independent model excerpt-support review; not website truth or consumer research'});
      attempt.status = 'succeeded'; attempt.receipt = structuredClone(c.executionReceipt); attempt.finishedAt = context.now ?? null;
      job.status = 'succeeded'; job.outputVersionIds = [c.reportId];
      break;
    }
    case 'observe-readiness-terminal-failure': {
      requireValue(context.actorType==='agent','EXECUTOR_REQUIRED','Trusted local failure observer required');
      const {job,attempt}=uncertainReadiness(p,c.jobId,c.attemptId);
      validateTerminalFailureWitness(p.id,job,attempt,c.failureWitness);
      requireValue(!(p.readinessResolutions??[]).some(r=>r.jobId===job.id),'READINESS_RESOLUTION_EXISTS','Original already has a resolution');
      const id=`terminal-failure-${hash(JSON.stringify([p.id,job.id,attempt.id]))}`;
      p.readinessResolutions??=[];
      p.readinessResolutions.push({kind:'local-terminal-failure-observed',id,jobId:job.id,attemptId:attempt.id,witness:structuredClone(c.failureWitness),originalOutcome:'locally_observed_terminal_failure',originalCost:null,additionalCalls:0,recordedBy:structuredClone(context),request:structuredClone(c.request)});
      break;
    }
    case 'request-readiness-diagnostic': {
      requireValue(context.actorType==='agent','EXECUTOR_REQUIRED','Explicit trusted diagnostic request required');
      const plan=terminalDiagnosticPlan(p,c.resolutionId),{resolution}=terminalFailureResolution(p,c.resolutionId);
      requireValue(isDeepStrictEqual(c.failureWitness,resolution.witness),'INVALID_READINESS_TERMINAL_FAILURE','Current witness changed');
      requireValue(!p.jobs.some(j=>j.id===plan.jobId),'READINESS_CALL_LIMIT','Only one diagnostic task is allowed');
      requireValue(unresolvedReadiness(p,plan.artifactId).every(j=>j.id===plan.originalJobId),'READINESS_OUTCOME_UNKNOWN','Another uncertain call remains');
      const job={id:plan.jobId,purpose:'readiness',stage:'research',targetArtifactId:plan.artifactId,inputVersionIds:[plan.artifactId],status:'queued',requestedBy:context.actorId,binding:plan.binding,task:{id:plan.jobId,parentId:p.id,owner:plan.binding.role,readinessInput:plan.readinessInput,terminalFailureDiagnostic:plan,request:structuredClone(c.request)},attempts:[],readinessFailureResolutionId:resolution.id};
      readinessTargetWithin(new WeakMap(),p,job);validateTerminalDiagnostic(p,job,c.failureWitness);p.jobs.push(job);break;
    }
    case 'recover-readiness': {
      requireValue(context.actorType==='agent','EXECUTOR_REQUIRED','Trusted evidence resolver required');
      const {job,attempt}=uncertainReadiness(p,c.jobId,c.attemptId);
      p.readinessResolutions??=[];
      requireValue(!p.readinessResolutions.some(r=>r.kind==='recovered-result'&&r.jobId===job.id),'READINESS_RESOLUTION_EXISTS','Original result already recovered');
      const {raw,normalized}=validateSavedReadinessProof(p.id,job,attempt,c.proof);
      requireValue(nonempty(c.resolutionId)&&nonempty(c.reportId)&&nonempty(c.payloadRef)&&!p.readinessReports.some(r=>r.id===c.reportId)&&!p.readinessResolutions.some(r=>r.id===c.resolutionId),'INVALID_READINESS_RESOLUTION','Unique recovery identity required');
      const report={...normalized,id:c.reportId,jobId:job.id,attemptId:attempt.id,rawReport:raw,payloadRef:c.payloadRef,reportHash:c.proof.normalizedReportHash,executionReceipt:structuredClone(savedReadinessReceipt(attempt,c.proof)),context:structuredClone(attempt.executor),resolutionId:c.resolutionId,createdAt:context.now??null,simulationLabel:'independent model research readiness judgment; not owner acceptance or consumer research'};
      p.readinessResolutions.push({kind:'recovered-result',id:c.resolutionId,jobId:job.id,attemptId:attempt.id,reportId:c.reportId,proof:structuredClone(c.proof),proofHash:hash(JSON.stringify(c.proof)),recordedBy:structuredClone(context),request:structuredClone(c.request)});
      p.readinessReports.push(report);readinessReportEvidence(p,report);break;
    }
    case 'authorize-readiness-replacement': {
      human(context);
      requireValue(c.request?.acknowledgement===true,'READINESS_ACKNOWLEDGEMENT_REQUIRED','Unknown outcome, unknown cost and possible duplicate charge must be accepted');
      const proposal=readinessReplacementProposalWithin(new WeakMap(), p,c.request.jobId,c.request.attemptId,c.binding);
      requireValue(proposal.proposalId===c.request.proposalId,'STALE_READINESS_PROPOSAL','Exact displayed proposal required');
      const id=`readiness-resolution-${hash(JSON.stringify([p.id,c.request.jobId,c.request.attemptId]))}`,jobId=`replacement-${id}`;
      requireValue(!p.jobs.some(j=>j.id===jobId),'READINESS_RESOLUTION_EXISTS','Replacement already exists');
      p.readinessResolutions??=[];
      p.readinessResolutions.push({kind:'replacement-authorized',id,jobId:c.request.jobId,attemptId:c.request.attemptId,replacementJobId:jobId,proposal,request:structuredClone(c.request),recordedBy:structuredClone(context)});
      p.jobs.push({id:jobId,purpose:'readiness',stage:'research',targetArtifactId:proposal.targetArtifactId,inputVersionIds:[proposal.targetArtifactId],status:'queued',requestedBy:context.actorId,binding:structuredClone(proposal.binding),task:{id:jobId,parentId:p.id,owner:proposal.binding.role,readinessInput:proposal.readinessInput},attempts:[],readinessResolutionId:id});break;
    }
    case 'reuse-readiness-generation': {
      const job=p.jobs.find(j=>j.id===c.jobId);requireValue(job?.purpose==='readiness'&&job.task.readinessInput.reviewProtocolVersion===APPLICABILITY_PROTOCOL&&c.request?.artifactId===job.targetArtifactId,'INVALID_RESEARCH_APPLICABILITY','Registered current assessment generation required');readinessTargetWithin(new WeakMap(), p,job);break;
    }
    case 'request-coverage-challenge': {
      const input=semanticChallengeInput(p,c.artifactId);
      requireValue(isDeepStrictEqual(input,c.task?.semanticInput)&&isDeepStrictEqual(c.binding,input.configuration.challengeBinding),'SEMANTIC_REVIEW_STALE','Current server-built semantic input required');
      requireValue(nonempty(c.jobId)&&!p.jobs.some(j=>j.id===c.jobId),'INVALID_JOB','Unique semantic job required');
      requireValue(!p.jobs.some(j=>j.purpose==='coverage_challenge'&&j.targetArtifactId===c.artifactId&&['queued','running','awaiting_reconciliation'].includes(j.status)),'SEMANTIC_REVIEW_UNSETTLED','Do not repeat an unresolved semantic invocation');
      p.jobs.push({id:c.jobId,purpose:'coverage_challenge',stage:'research',targetArtifactId:c.artifactId,inputVersionIds:[c.artifactId],status:'queued',requestedBy:context.actorId,binding:structuredClone(c.binding),task:structuredClone(c.task),attempts:[]});break;
    }
    case 'claim-coverage-dispatch': {
      const job=p.jobs.find(j=>j.id===c.jobId),attempt=runningAttempt(job,c,context);semanticChallengeCurrent(p,job);
      requireValue(!attempt.dispatchStarted,'SEMANTIC_ALREADY_DISPATCHED','Semantic attempt is sent once');attempt.dispatchStarted=true;break;
    }
    case 'complete-coverage-challenge': {
      const job=p.jobs.find(j=>j.id===c.jobId),attempt=runningAttempt(job,c,context),a=semanticChallengeCurrent(p,job);
      requireValue(attempt.dispatchStarted,'SEMANTIC_DISPATCH_REQUIRED','Original dispatch claim required');
      independentVerifier(p,a,context);verificationReceipt(p,a,job,attempt,c.executionReceipt);
      const validated=validateSemanticOutput(c.rawReport,job.task.semanticInput);
      requireValue(nonempty(c.reportId)&&nonempty(c.payloadRef)&&c.contentHash===hash(JSON.stringify(validated,null,2)),'INVALID_SEMANTIC_REVIEW','Original normalized result required');
      p.coverageChallenges??=[];requireValue(!p.coverageChallenges.some(r=>r.id===c.reportId),'INVALID_SEMANTIC_REVIEW','Unique result required');
      const report={...validated,id:c.reportId,jobId:job.id,attemptId:attempt.id,rawReport:structuredClone(c.rawReport),payloadRef:c.payloadRef,reportHash:c.contentHash,executionReceipt:structuredClone(c.executionReceipt),context:structuredClone(context),createdAt:context.now??null};
      attempt.status='succeeded';attempt.receipt=structuredClone(c.executionReceipt);job.status='succeeded';job.outputVersionIds=[report.id];p.coverageChallenges.push(report);
      validateStoredReview(p,'coverage_challenge',report);break;
    }
    case 'request-readiness': {
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      requireValue(unresolvedReadiness(p,a.id).length===0,'READINESS_OUTCOME_UNKNOWN','Resolve the uncertain review family before requesting another review');
      requireValue(nonempty(c.jobId) && !p.jobs.some(job => job.id === c.jobId), 'INVALID_JOB', 'Unique readiness job required');
      requireValue(c.binding && ['providerId', 'model', 'role'].every(key => nonempty(c.binding[key])), 'INVALID_BINDING', 'Provider, model and role are required');
      requireValue(c.task && nonempty(c.task.id) && nonempty(c.task.owner) && (c.task.parentId === null || nonempty(c.task.parentId)), 'INVALID_TASK', 'Task ID, owner and nullable parent ID are required');
      const job = {id: c.jobId, purpose: 'readiness', stage: a.stage, targetArtifactId: a.id, inputVersionIds: [a.id], status: 'queued',
        requestedBy: context.actorId, binding: structuredClone(c.binding), task: structuredClone(c.task), attempts: []};
      readinessTargetWithin(new WeakMap(), p, job);
      p.jobs.push(job);
      break;
    }
    case 'claim-readiness-part': case 'settle-readiness-part': case 'fail-readiness-part': {
      const job=p.jobs.find(j=>j.id===c.jobId),attempt=runningAttempt(job,c,context);
      requireValue(job?.purpose==='readiness'&&job.task.splitReadiness,'INVALID_JOB','Split readiness required');readinessTargetWithin(new WeakMap(),p,job);
      splitExecutionCommand(p,c,job,attempt);break;
    }
    case 'complete-readiness': {
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.purpose === 'readiness', 'INVALID_JOB', 'Readiness job required');
      const attempt = runningAttempt(job, c, context);
      if(job.readinessFailureResolutionId){validateTerminalDiagnostic(p,job,c.failureWitness);readinessTargetWithin(new WeakMap(),p,job);requireValue(c.executionReceipt?.provider==='codex-cli'&&c.executionReceipt.requestedReasoningEffort==='low','DIAGNOSTIC_MITIGATION_REQUIRED','Actual invocation must retain requested low reasoning');}
      const a = job.task.readinessInput.reviewProtocolVersion===APPLICABILITY_PROTOCOL?artifact(p,job.targetArtifactId):readinessTargetWithin(new WeakMap(), p, job);
      independentVerifier(p, a, context);
      if(job.task.splitReadiness)validateSplitExecution(p,job,attempt,c.executionReceipt,c.rawReport);else verificationReceipt(p, a, job, attempt, c.executionReceipt);
      if(!job.task.splitReadiness&&job.task.readinessInput.reviewProtocolVersion===APPLICABILITY_PROTOCOL)researchAssessmentReceipt(p,job,attempt,c.executionReceipt,c.rawReport);
      p.readinessReports ??= [];
      requireValue(nonempty(c.reportId) && !p.readinessReports.some(report => report.id === c.reportId) && nonempty(c.payloadRef) && /^[a-f0-9]{64}$/.test(c.contentHash),
        'INVALID_RESEARCH_READINESS', 'Unique report ID, saved payload and SHA256 required');
      const validated = validateResearchReadinessOutput(c.rawReport, job.task.readinessInput);
      if (job.task.readinessInput.reviewProtocolVersion === APPLICABILITY_PROTOCOL) requireValue(c.contentHash === hash(JSON.stringify(validated, null, 2)),
        'INVALID_RESEARCH_READINESS', 'V2 readiness saved report must bind normalized bytes');
      p.readinessReports.push({...validated, id: c.reportId, jobId: job.id, attemptId: attempt.id, rawReport: structuredClone(c.rawReport),
        payloadRef: c.payloadRef, reportHash: c.contentHash, executionReceipt: structuredClone(c.executionReceipt), context: structuredClone(context),
        createdAt: context.now ?? null, simulationLabel: 'independent model research readiness judgment; not owner acceptance or consumer research'});
      attempt.status = 'succeeded'; attempt.receipt = structuredClone(c.executionReceipt); attempt.finishedAt = context.now ?? null;
      job.status = 'succeeded'; job.outputVersionIds = [c.reportId];
      break;
    }
    case 'request-handoff': {
      requireValue(!usesResearchOperatorWorkflow(p),'OPERATOR_HANDOFF_ROUTE_REQUIRED','Use the atomic operator declaration command for this workflow');
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      requireValue(nonempty(c.jobId) && !p.jobs.some(job => job.id === c.jobId), 'INVALID_JOB', 'Unique handoff job required');
      requireValue(c.binding && ['providerId', 'model', 'role'].every(key => nonempty(c.binding[key])), 'INVALID_BINDING', 'Provider, model and role are required');
      requireValue(c.task && nonempty(c.task.id) && nonempty(c.task.owner) && (c.task.parentId === null || nonempty(c.task.parentId)), 'INVALID_TASK', 'Task ID, owner and nullable parent ID are required');
      const job = {id: c.jobId, purpose: 'handoff', side: c.side, stage: a.stage, targetArtifactId: a.id, inputVersionIds: [a.id], status: 'queued',
        requestedBy: context.actorId, binding: structuredClone(c.binding), task: structuredClone(c.task), attempts: []};
      handoffTargetWithin(new WeakMap(), p, job);
      p.jobs.push(job);
      break;
    }
    case 'complete-handoff': {
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.purpose === 'handoff', 'INVALID_JOB', 'Handoff job required');
      const attempt = runningAttempt(job, c, context);
      const a = handoffTargetWithin(new WeakMap(), p, job);
      handoffExecutor(p, a, context, attempt.id);
      verificationReceipt(p, a, job, attempt, c.executionReceipt);
      p.handoffReports ??= [];
      requireValue(nonempty(c.reportId) && !p.handoffReports.some(report => report.id === c.reportId) && nonempty(c.payloadRef) && /^[a-f0-9]{64}$/.test(c.contentHash),
        'INVALID_RESEARCH_HANDOFF', 'Unique report ID, saved payload and SHA256 required');
      researchHandoffReceipt(p,job,attempt,c.executionReceipt,c.rawReport);
      const validated = validateResearchHandoffOutput(c.rawReport, job.task.handoffInput);
      if (job.task.handoffInput.handoffProtocolVersion === APPLICABILITY_HANDOFF_PROTOCOL) requireValue(c.contentHash === hash(JSON.stringify(validated, null, 2)),
        'INVALID_RESEARCH_HANDOFF', 'V2 handoff saved report must bind normalized bytes');
      p.handoffReports.push({...validated, id: c.reportId, jobId: job.id, attemptId: attempt.id, rawReport: structuredClone(c.rawReport),
        payloadRef: c.payloadRef, reportHash: c.contentHash, executionReceipt: structuredClone(c.executionReceipt), context: structuredClone(context),
        createdAt: context.now ?? null, simulationLabel: 'model owner acceptance; not independent review or release authorization'});
      attempt.status = 'succeeded'; attempt.receipt = structuredClone(c.executionReceipt); attempt.finishedAt = context.now ?? null;
      job.status = 'succeeded'; job.outputVersionIds = [c.reportId];
      break;
    }
    case 'block-queued-job': {
      const job=p.jobs.find(j=>j.id===c.jobId);
      requireValue(job?.status==='queued'&&context.actorType==='agent','INVALID_JOB','Only queued jobs may be blocked before dispatch');
      requireValue(c.error&&nonempty(c.error.code)&&nonempty(c.error.message),'INVALID_JOB_ERROR','Error required');
      job.status='blocked';job.error=structuredClone(c.error);break;
    }
    case 'restore-ordinary-http-attempt': {
      const job=p.jobs.find(j=>j.id===c.jobId),attempt=job?.attempts.at(-1);
      requireValue(context.actorType==='agent'&&['running','awaiting_reconciliation'].includes(job?.status)&&attempt?.id===c.attemptId&&!attempt.receipt&&validOrdinaryHttpLocator(attempt.httpAttemptLocator,attempt.id)&&ordinaryOriginMatches(c.receipt,attempt.httpAttemptLocator,attempt.id)&&isOrdinaryHttp(c.receipt)&&ordinarySuccessfulStatus(c.receipt)&&c.receipt.runId===attempt.id&&c.receipt.attemptId===attempt.id&&c.receipt.requestedModel===job.binding.model&&c.receipt.model===job.binding.model,'INVALID_HTTP_RESTORE','Exact committed HTTP saved claim and original locator required');
      attempt.receipt=structuredClone(c.receipt);break;
    }
    case 'anchor-model-http-attempt': {
      const job=p.jobs.find(j=>j.id===c.jobId),attempt=runningAttempt(job,c,context);
      requireValue(context.actorType==='agent'&&!['layout','final_review'].includes(job.stage)&&validOrdinaryHttpLocator(c.locator,attempt.id)&&!attempt.httpAttemptLocator,'INVALID_HTTP_LOCATOR','Exact unique internal HTTP attempt locator required');
      attempt.httpAttemptLocator=structuredClone(c.locator);break;
    }
    case 'visual-http-advance-started':
    case 'visual-http-advance-completed': reduceVisualAdvance(p,c,context);break;
    case 'visual-http-intent': reduceVisualIntent(p,c,context);break;
    case 'visual-http-step': reduceVisualStep(p,c,context);break;
    case 'visual-b-http-revision-completed': reduceVisualBRevisionCompleted(p,c,context);break;
    case 'visual-b-http-advance':
    case 'visual-b-http-completed': reduceVisualBAdvance(p,c,context);break;
    case 'visual-b-http-step': reduceVisualBStep(p,c,context);break;
    case 'visual-b-http-intent': reduceVisualBIntent(p,c,context);break;
    case 'release-reviewed-sketch-v2': {requireValue(p.workflow&&context.actorType==='agent','REVIEW_TRUSTED_RUNTIME_REQUIRED','Current v2 runtime release only');const a=targetWithin(new WeakMap(),p,c.artifactId);requireReviewedSketchV2(p,a,(p,id,contents,binding)=>copyDeliveryEnvelopeWithin(new WeakMap(),p,id,contents,binding));if(!p.releases.some(r=>r.artifactId===a.id&&r.policyVersion===currentPolicy(p).version))p.releases.push({artifactId:a.id,policyVersion:currentPolicy(p).version,actorId:context.actorId,kind:'reviewed-sketch-v2-release',contentHash:a.contentHash});break;}
    case 'copy-http-advance-started':
    case 'copy-http-advance-completed': reduceCopyAdvance(p,c,context);break;
    case 'copy-http-request': reduceCopyHttp(p,c,context);break;
    case 'simple-strategy-http-request': reduceSimpleHttp(p,c,context);break;
    case 'start-job':
    case 'retry-job': {
      const job = p.jobs.find(j => j.id === c.jobId);
      requireCopyNativeAdmission(p,job,c.copyHttpRequestId);
      if(c.copyHttpRequestId){const edgeId=requireCopyHttpJob(p,c.copyHttpRequestId,job);requireValue(!copyHttpJobs(p,edgeId).some(j=>['running','awaiting_reconciliation'].includes(j.status)),'COPY_OUTCOME_UNKNOWN','The original copy edge has an unsettled result');}
      if(c.simpleStrategyHttpRequestId)requireSimpleHttpJob(p,c.simpleStrategyHttpRequestId,job);
      if(c.acquisitionHttpRequestId)requireAcquisitionHttpJob(p,c.acquisitionHttpRequestId,job);
      requireValue(job?.purpose!==LAYOUT_PURPOSE&&!['layout','final_review'].includes(job?.stage),'LAYOUT_EXECUTION_UNAVAILABLE','Dedicated native executor is not implemented; generic dispatch cannot replace it');
      requireValue(job && (c.kind === 'start-job' ? job.status === 'queued' : ['failed', 'blocked'].includes(job.status)), 'INVALID_JOB', 'Job is not eligible for this transition');
      requireValue(!['research_acquisition_plan','research_acquisition_branch'].includes(job.purpose),'UNSAFE_RETRY','Acquisition requires its dedicated non-repeating executor');
      requireValue(!SKETCH_PURPOSES.includes(job.purpose)&&!FINAL_VISUAL_PURPOSES.includes(job.purpose),'SKETCH_ALREADY_CLAIMED','Sketch jobs require their original dedicated claim and cannot retry');
      requireValue(job.binding && job.task, 'EXECUTION_BINDING_REQUIRED', 'Execution requires a frozen binding and task');
      if(job.readinessFailureResolutionId){
        const plan=validateTerminalDiagnostic(p,job,c.failureWitness);
        requireValue(c.kind==='start-job'&&job.attempts.length===0&&!unresolvedReadiness(p,job.targetArtifactId).some(j=>![job.id,plan.originalJobId].includes(j.id)),'READINESS_CALL_LIMIT','Diagnostic attempt cannot retry or bypass other unknowns');
      }else if(job.readinessResolutionId){
        const grant=(p.readinessResolutions??[]).find(r=>r.id===job.readinessResolutionId&&r.kind==='replacement-authorized');
        requireValue(c.kind==='start-job'&&job.attempts.length===0&&grant?.replacementJobId===job.id&&grant.proposal.additionalCalls===1&&!p.readinessResolutions.some(r=>r.kind==='replacement-dispatch-claimed'&&r.authorizationId===grant.id)&&isDeepStrictEqual(job.binding,grant.proposal.binding)&&isDeepStrictEqual(job.task.readinessInput,grant.proposal.readinessInput),'READINESS_CALL_LIMIT','Replacement permission allows one durable claim only');
        requireValue(!p.readinessResolutions.some(r=>r.kind==='recovered-result'&&r.jobId===grant.jobId),'READINESS_RESULT_RECOVERED','Original evidence arrived before dispatch');
        p.readinessResolutions.push({kind:'replacement-dispatch-claimed',id:`claim-${grant.id}`,authorizationId:grant.id,jobId:job.id,attemptId:c.attemptId,recordedBy:structuredClone(context)});
      }else if(job.purpose==='readiness')requireValue(!unresolvedReadiness(p,job.targetArtifactId).some(j=>j.id!==job.id),'READINESS_OUTCOME_UNKNOWN','Cannot bypass an uncertain review family');

      requireValue(nonempty(c.attemptId) && !p.jobs.some(j => j.attempts?.some(a => a.id === c.attemptId)), 'INVALID_ATTEMPT', 'A new unique attempt ID is required');
      if (!job.purpose || job.purpose === 'stage') { currentVisualCatalogue(p, job.task?.visualCatalogue ?? []); currentCaseSources(p,job.task?.sourceRecords??[]); }
      if (job.purpose === 'case_identity') { caseIdentityTarget(p, job); observationReviewExecutor(p, job, context); }
      else if (job.purpose === 'observation_review') { observationReviewTarget(p, job); observationReviewExecutor(p, job, context); }
      else if (job.purpose === 'observation') { observationTarget(p, job); observationExecutor(p, job, context); }
      else if (job.purpose === 'source_capture') requireValue(context.actorType === 'agent', 'EXECUTOR_REQUIRED', 'Trusted acquisition executor required');
      else if (job.purpose === 'creative_review') { creativeContextWithin(new WeakMap(), p,job,context); }
      else if (job.purpose === 'correction_review') { correctionReviewTargetWithin(new WeakMap(), p,job); independentVerifier(p,targetWithin(new WeakMap(), p,job.targetArtifactId),context); }
      else if (job.purpose === 'feedback_review') { feedbackReviewTargetWithin(new WeakMap(), p, job); independentVerifier(p, targetWithin(new WeakMap(), p, job.targetArtifactId), context); }
      else if (job.purpose === 'verification') independentVerifier(p, verificationTargetWithin(new WeakMap(), p, job), context);
      else if(job.purpose==='research_reader'){requireValue(c.kind==='start-job'&&!job.attempts.length,'UNSAFE_RETRY','Reader attempts cannot automatically retry');independentVerifier(p,researchReaderTarget(p,job),context);requireValue(!p.jobs.some(j=>j.id!==job.id&&j.purpose==='research_reader'&&j.attempts.some(t=>intersectsLineage(t.executor,context))),'READER_CONTEXT_REUSED','Fresh independent reader context required');}
      else if (job.purpose === 'coverage_challenge') {requireValue(c.kind==='start-job'&&!job.attempts.length,'UNSAFE_RETRY','Semantic attempts cannot automatically retry');independentVerifier(p,semanticChallengeCurrent(p,job),context);}
      else if (job.purpose === 'readiness') independentVerifier(p, readinessTargetWithin(new WeakMap(), p, job), context);
      else if (job.purpose === 'reference') {
        referenceJobCurrent(p,job,(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(new WeakMap(), p, artifactId, sourceContents, consumerBinding));referenceContext(p,job,context);
        if(c.kind==='retry-job')requireValue(job.attempts.length>0&&job.attempts.every(prior=>prior.dispatchStarted===false&&!prior.receipt&&!prior.referenceResult&&['actorId','runId','contextId'].every(key=>prior.executor[key]!==context[key])),'UNSAFE_RETRY','Reference retry requires undispatched attempts and fresh execution identity');
      }
      else if (job.purpose === 'owner_acceptance') {ownerJobTargetWithin(new WeakMap(), p,job);ownerContext(p,job,context);}
      else if (job.purpose === 'handoff') handoffExecutor(p, handoffTargetWithin(new WeakMap(), p, job), context);
      else { requireValue(JSON.stringify(inputsForWithin(new WeakMap(), p, job.stage, job.binding)) === JSON.stringify(job.inputVersionIds), 'STALE_JOB', 'Job must consume current released inputs'); validateJobRevisionWithin(new WeakMap(), p, job); }
      requireStrategyBasisWithin(new WeakMap(), p,job);requireResearchStrategyJobWithin(new WeakMap(), p,job);requireOwnerCopyJobWithin(new WeakMap(), p,job);
      if (!['observation', 'observation_review', 'case_identity'].includes(job.purpose)) requireValue(!p.jobs
        .filter(item => ['observation', 'observation_review', 'case_identity'].includes(item.purpose))
        .some(item => item.attempts.some(prior => {
          const author = prior.executor;
          return intersectsLineage(author, context);
        })), 'SELF_REVIEW', 'Observation executor cannot author or review research');
      if(job.task?.correctionInput)requireValue(job.task.correctionInput.sources.filter(source=>source.kind!=='human').every(source=>!intersectsLineage(source.executionIdentity,context)),
        'SELF_REVIEW','Correction producer must be independent from consumed reviewer actors, runs and contexts');
      job.attempts.push({id: c.attemptId, executor: structuredClone(context), status: 'running', ...(['creative_review','owner_acceptance','reference','coverage_challenge','research_reader'].includes(job.purpose)?{dispatchStarted:false}:{}), startedAt: context.now ?? null});
      job.attemptId = c.attemptId; job.status = 'running'; delete job.error;
      break;
    }
    case 'finish-job-error':
    case 'mark-interrupted': {
      const job = p.jobs.find(j => j.id === c.jobId);
      requireValue(!(SKETCH_PURPOSES.includes(job?.purpose)||FINAL_VISUAL_PURPOSES.includes(job?.purpose))||c.kind==='mark-interrupted','SKETCH_ALREADY_CLAIMED','Sketch failures require their dedicated transition');
      const attempt = runningAttempt(job, c, context);
      if(['creative_review','owner_acceptance','reference','coverage_challenge','research_reader'].includes(job.purpose)&&c.kind==='finish-job-error')requireValue(typeof c.dispatchStarted==='boolean'&&c.dispatchStarted===attempt.dispatchStarted,'INVALID_ATTEMPT','Persisted dispatch state must match runtime failure');
      const recovery=context.recoveredBy,owner=attempt.executor;
      const undispatchedReference=c.kind==='mark-interrupted'&&job.purpose==='reference'&&attempt.dispatchStarted===false&&!attempt.receipt&&!attempt.referenceResult&&c.receipt==null
        &&recovery?.ownerState==='dead'&&recovery.host===owner.executorHost&&recovery.ownerHost===owner.executorHost&&recovery.ownerPid===owner.executorPid&&recovery.attemptId===attempt.id
        &&Number.isSafeInteger(recovery.pid)&&recovery.pid>0&&Number.isSafeInteger(owner.executorPid)&&owner.executorPid>0
        &&!(p.referenceDossiers.find(d=>d.id===job.dossierId)?.tools??[]).some(tool=>tool.nodeKey===job.nodeKey&&tool.state==='dispatched');
      const undispatchedAcquisition=c.kind==='mark-interrupted'&&ACQUISITION_PURPOSES.includes(job.purpose)&&attempt.dispatchStarted===false&&!attempt.resultOriginal&&!attempt.failureOriginal
        &&!(p.researchAcquisitions?.find(g=>g.envelope.id===job.task.generationId)?.branches.find(b=>b.kind===job.task.branchKind)?.tools??[]).length
        &&recovery?.ownerState==='dead'&&recovery.host===owner.executorHost&&recovery.ownerHost===owner.executorHost&&recovery.ownerPid===owner.executorPid&&recovery.attemptId===attempt.id
        &&Number.isSafeInteger(recovery.pid)&&recovery.pid>0&&Number.isSafeInteger(owner.executorPid)&&owner.executorPid>0;
      const status = c.kind === 'mark-interrupted' ? undispatchedReference||undispatchedAcquisition?'blocked':'awaiting_reconciliation' : c.status;
      if(['creative_review','owner_acceptance','reference','coverage_challenge','research_reader'].includes(job.purpose)&&attempt.dispatchStarted===true)requireValue(status==='awaiting_reconciliation','UNSAFE_RETRY','A dispatched unsuccessful creative call requires reconciliation');
      requireValue(['failed', 'blocked', 'awaiting_reconciliation'].includes(status), 'INVALID_JOB_STATUS', 'Unknown failure state');
      const error = c.kind === 'mark-interrupted' ? undispatchedReference?{code:'INTERRUPTED_BEFORE_DISPATCH',message:'Stopped local owner did not dispatch; explicit retry required'}:{code: 'INTERRUPTED', message: 'Execution interrupted; outcome requires reconciliation'} : c.error;
      if(undispatchedReference)attempt.interruptionRecovery=structuredClone(recovery);
      requireValue(error && nonempty(error.code) && nonempty(error.message), 'INVALID_JOB_ERROR', 'Error code and message required');
      if (c.receipt != null) { checkReceipt(job, attempt, c.receipt); attempt.receipt = structuredClone(c.receipt); }
      attempt.status = status; attempt.error = structuredClone(error); attempt.finishedAt = context.now ?? null;
      job.status = status; job.error = structuredClone(error);
      break;
    }
    case 'reconcile-stage': {
      const fields = ['kind', 'jobId', 'attemptId', 'artifactId', 'reconciliationId', 'payloadRef', 'contentHash', 'receiptHash', 'reason', 'validatorVersion', 'commandId', 'expectedRevision'];
      requireValue(Object.keys(c).every(key => fields.includes(key)), 'INVALID_RECONCILIATION', 'Recovery accepts identifiers and validation metadata only');
      const job = p.jobs.find(item => item.id === c.jobId);
      requireValue(job?.stage!=='sketch','REVIEWED_SKETCH_REQUIRED','Generic reconciliation cannot create a sketch');
      requireValue(job && (!job.purpose || job.purpose === 'stage') && job.binding && job.task && job.status === 'awaiting_reconciliation',
        'INVALID_JOB', 'A bound stage awaiting reconciliation is required');
      const attempt = job.attempts.at(-1);
      requireValue(attempt && c.attemptId === attempt.id && job.attemptId === attempt.id && attempt.status === 'awaiting_reconciliation',
        'ATTEMPT_MISMATCH', 'Current unresolved attempt required');
      requireValue(attempt.error?.code === 'INVALID_STAGE_OUTPUT'||isOrdinaryHttp(attempt.receipt)&&validOrdinaryHttpLocator(attempt.httpAttemptLocator,attempt.id), 'INVALID_RECONCILIATION', 'Only rejected stage output can be recovered');
      const receipt = attempt.receipt;
      checkReceipt(job, attempt, receipt);
      requireValue(receipt.runId === attempt.id && receipt.requestedModel === job.binding.model
        && ordinaryHasContext(receipt) && nonempty(receipt.inputPacketHash) && ordinarySuccessfulStatus(receipt)
        && ['signal', 'reason', 'error'].every(key => receipt[key] == null) && nonempty(receipt.responseText),
        'INVALID_EXECUTION_RECEIPT', 'Recovery requires the successful original provider response');
      requireValue(c.receiptHash === hash(JSON.stringify(receipt)), 'RECEIPT_HASH_MISMATCH', 'Saved receipt does not match the expected hash');
      let parsed;
      try { parsed = JSON.parse(receipt.responseText); } catch { fail('INVALID_STAGE_OUTPUT', 'Saved response must be valid JSON'); }
      requireValue(!Object.hasOwn(receipt, 'parsedOutput') || isDeepStrictEqual(receipt.parsedOutput, parsed),
        'INVALID_EXECUTION_RECEIPT', 'Saved parsed output must match the original response');
      if (Object.hasOwn(receipt, 'providerExecution')) {
        const execution = receipt.providerExecution;
        requireValue(execution && typeof execution === 'object' && !Array.isArray(execution)
          && (isOrdinaryHttp(receipt)?ordinarySuccessfulStatus(receipt):['runId', 'model', 'requestedModel', 'threadId', 'inputPacketHash', 'exitCode', 'responseText'].every(key => Object.hasOwn(execution, key)))
          && Object.entries(execution).every(([key, value]) => isDeepStrictEqual(value, receipt[key])),
          'INVALID_EXECUTION_RECEIPT', 'Original provider execution must agree with the saved receipt');
      }
      researchProductionReceipt(p,job,attempt,receipt);strategyProductionReceiptWithin(new WeakMap(), p,job,attempt,receipt);revisionProductionReceipt(p, job, attempt, receipt);ownerCopyReceipt(p,job,attempt,receipt);
      const sourceRecords = job.task.sourceRecords ?? [];
      if(job.task.correctionInput?.protocolVersion!==LATEST_CORRECTION_PROTOCOL)currentVisualCatalogue(p, job.task.visualCatalogue ?? []);
      const output = validateStageOutput(job.stage, parsed, {sourceRecords, visualCatalogue: job.task.visualCatalogue ?? [], revisionInput: job.task.revisionInput, correctionInput:job.task.correctionInput, copyContractVersion: job.task.copyContractVersion,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis,researchRevision:job.task.researchRevision});
      requireValue(output.status !== 'blocked' && output.outputKind !== 'research_plan', 'STAGE_INPUT_GAP', 'Incomplete research cannot be recovered as an artifact');
      requireValue(c.contentHash === hash(JSON.stringify(output.content, null, 2)), 'CONTENT_HASH_MISMATCH', 'Recovered content must match local validation');
      requireValue(nonempty(c.artifactId) && !artifact(p, c.artifactId) && nonempty(c.payloadRef), 'INVALID_ARTIFACT', 'Unique artifact ID and saved payload required');
      p.reconciliations ??= [];
      requireValue(nonempty(c.reconciliationId) && !p.reconciliations.some(record => record.id === c.reconciliationId)
        && nonempty(c.reason) && nonempty(c.validatorVersion), 'INVALID_RECONCILIATION', 'Unique recovery ID, reason and validator version required');
      requireValue(['actorId', 'runId', 'contextId'].every(key => context[key] !== attempt.executor[key]),
        'INVALID_RECONCILIATION', 'Recovery must have its own actor, run and context');
      const a = {id: c.artifactId, stage: job.stage, inputVersionIds: job.inputVersionIds, payloadRef: c.payloadRef,
        contentHash: c.contentHash, claims: output.claims, technicalReceipts: {sourceCatalogue: {version: 1, records: structuredClone(sourceRecords)}, visualCatalogue: structuredClone(job.task.visualCatalogue ?? [])},
        author: structuredClone(attempt.executor), provenance: 'provider_execution', executionReceipt: structuredClone(receipt), reconciliationId: c.reconciliationId, ...revisionMetadata(job, output.revisionResponses??output.feedbackResponses), ...copyContractMetadata(job, output, c.contentHash), ...strategyMetadata(job,output,c.contentHash),...researchChartMetadata(job,output,c.contentHash)};
      p.artifacts.push(a);
      p.reconciliations.push({id: c.reconciliationId, jobId: job.id, attemptId: attempt.id, artifactId: a.id,
        context: structuredClone(context), createdAt: context.now ?? null, reason: c.reason, originalReceiptHash: c.receiptHash,
        rawOutputHash: hash(receipt.responseText), inputPacketHash: receipt.inputPacketHash, validatedOutputHash: c.contentHash, validatorVersion: c.validatorVersion});
      job.status = 'succeeded'; job.outputVersionIds = [a.id]; delete job.error;
      if (p.jobs.filter(item => item.stage === job.stage && (!item.purpose || item.purpose === 'stage')).at(-1).id === job.id
        && stageJobCurrentWithin(new WeakMap(), p, job)) p.activeByStage[a.stage] = a.id;
      else job.status = 'succeeded_stale';
      break;
    }
    case 'complete-stage': {
      const job = p.jobs.find(j => j.id === c.jobId);
      requireValue(!['layout','final_review'].includes(job?.stage),'LAYOUT_FINAL_AUTHORITY_UNAVAILABLE','Generic completion cannot manufacture native layout or delivery artifacts');
      requireValue(job?.stage!=='sketch','REVIEWED_SKETCH_REQUIRED','Manual or generic completion cannot create a sketch');
      requireValue(job && (!job.purpose || job.purpose === 'stage') && ['queued', 'running'].includes(job.status), 'INVALID_JOB', 'Queued import or running job required');
      let attempt, validatedOutput;
      if (job.status === 'running') {
        attempt = runningAttempt(job, c, context);
        checkReceipt(job, attempt, c.executionReceipt);
        researchProductionReceipt(p,job,attempt,c.executionReceipt);strategyProductionReceiptWithin(new WeakMap(), p,job,attempt,c.executionReceipt);revisionProductionReceipt(p, job, attempt, c.executionReceipt);ownerCopyReceipt(p,job,attempt,c.executionReceipt);
        requireValue(![...p.imageObservations, ...p.observationReviews].some(report => ordinarySameContext(report.executionReceipt,c.executionReceipt)), 'REVIEW_THREAD_REUSED', 'Research must use a separate observation thread');
      } else requireValue(!job.binding && !job.task && !c.executionReceipt && !c.attemptId, 'EXECUTION_REQUIRED', 'Bound jobs require a claimed execution attempt');
      requireValue(c.artifactId && !artifact(p, c.artifactId) && c.payloadRef && c.contentHash, 'INVALID_ARTIFACT', 'Unique artifact ID, payload and hash required');
      requireValue(!c.claims || c.claims.every(claim => ['fact', 'inference', 'creative'].includes(claim.kind) && (claim.kind === 'creative' || (claim.verification === 'verified' && claim.evidenceRefs?.length) || claim.verification !== 'verified')), 'INVALID_CLAIMS', 'Verified factual claims require evidence references');
      if (attempt) {
        requireValue(isDeepStrictEqual(c.technicalReceipts?.visualCatalogue ?? [], job.task.visualCatalogue ?? []), 'INVALID_VISUAL_CATALOGUE', 'Output must retain the exact job visual catalogue');
        if(job.task.correctionInput?.protocolVersion!==LATEST_CORRECTION_PROTOCOL)currentVisualCatalogue(p, job.task.visualCatalogue ?? []);
        if(job.task.correctionInput||job.task.researchContractVersion===RESEARCH_DATA_VERSION)requireValue(c.technicalReceipts?.sourceCatalogue?.version===1
          &&isDeepStrictEqual(c.technicalReceipts.sourceCatalogue.records,job.task.sourceRecords??[]),
          'INVALID_REVISION_OUTPUT','Correction must retain its exact frozen source catalogue');
        if (job.task.researchContractVersion===RESEARCH_DATA_VERSION || job.task.visualCatalogue?.length || job.task.revisionInput || job.task.correctionInput || job.task.copyContractVersion === COPY_CONTRACT_VERSION || [STRATEGY_CONTRACT_VERSION,SIMPLE_STRATEGY_VERSION].includes(job.task.strategyContractVersion)) {
          let raw; try { raw = JSON.parse(c.executionReceipt.responseText); } catch { fail('INVALID_STAGE_OUTPUT', 'Original stage response required'); }
          const output = validateStageOutput(job.stage, raw, {sourceRecords: job.task.sourceRecords ?? [], visualCatalogue: job.task.visualCatalogue ?? [], revisionInput: job.task.revisionInput, correctionInput:job.task.correctionInput, copyContractVersion: job.task.copyContractVersion,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis,researchRevision:job.task.researchRevision});
          validatedOutput = output;
          if([STRATEGY_CONTRACT_VERSION,SIMPLE_STRATEGY_VERSION].includes(job.task.strategyContractVersion))requireValue(output.status!=='blocked','STAGE_INPUT_GAP','Blocked strategy cannot complete as an artifact');
          if (job.task.researchContractVersion===RESEARCH_DATA_VERSION || job.task.copyContractVersion === COPY_CONTRACT_VERSION || [STRATEGY_CONTRACT_VERSION,SIMPLE_STRATEGY_VERSION].includes(job.task.strategyContractVersion)) requireValue(c.contentHash === hash(JSON.stringify(output.content, null, 2)), 'CONTENT_HASH_MISMATCH', 'Complete copy content must match validated provider response');
          requireValue(isDeepStrictEqual(c.claims ?? [], output.claims), 'INVALID_CLAIMS', 'Output claims must match validated provider response');
          if(job.task.correctionInput)requireValue(c.contentHash===hash(JSON.stringify(output.content,null,2))&&isDeepStrictEqual(c.revisionResponses,output.revisionResponses),
            'INVALID_REVISION_OUTPUT','Correction content and responses require exact original output');
          if (job.task.revisionInput) {
            requireValue(c.contentHash === hash(JSON.stringify(output.content, null, 2)) && isDeepStrictEqual(c.feedbackResponses, output.feedbackResponses),
              'INVALID_REVISION_OUTPUT', 'Revision content and feedback responses must match the original provider response');
            validateFeedbackResponses(c.feedbackResponses, job.task.revisionInput, output.content);
          }
        }
      }
      const a = {id: c.artifactId, stage: job.stage, inputVersionIds: job.inputVersionIds, payloadRef: c.payloadRef, contentHash: c.contentHash, claims: c.claims ?? [], technicalReceipts: c.technicalReceipts ?? {}, author: structuredClone(context), provenance: attempt ? 'provider_execution' : 'imported_metadata', ...(attempt ? {executionReceipt: structuredClone(c.executionReceipt)} : {}), ...revisionMetadata(job, c.revisionResponses??c.feedbackResponses), ...copyContractMetadata(job, validatedOutput, c.contentHash), ...strategyMetadata(job,validatedOutput,c.contentHash),...researchChartMetadata(job,validatedOutput,c.contentHash)};
      if (attempt) { attempt.status = 'succeeded'; attempt.receipt = structuredClone(c.executionReceipt); attempt.finishedAt = context.now ?? null; }
      p.artifacts.push(a); job.status = 'succeeded'; job.outputVersionIds = [a.id];
      if (p.jobs.filter(j => j.stage === job.stage && (!j.purpose || j.purpose === 'stage')).at(-1).id === job.id && stageJobCurrentWithin(new WeakMap(), p, job)) p.activeByStage[a.stage] = a.id;
      else job.status = 'succeeded_stale';
      break;
    }
    case 'assign-panel': {
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      requireValue(!p.panels.some(panel => panel.artifactId === a.id), 'PANEL_FROZEN', 'Panel assignment is immutable for this artifact');
      const roles = REVIEW_ROLES[a.stage] ?? [];
      requireValue(roles.length && Array.isArray(c.seats) && c.seats.length === roles.length && roles.every(role => c.seats.filter(seat => seat.role === role).length === 1), 'INVALID_PANEL', 'Assign every stage role exactly once');
      const creators = creationLineage(p, a).map(item => item.author);
      for (const seat of c.seats) {
        identity(seat);
        requireValue(creators.every(author => !intersectsLineage(author, seat)), 'SELF_REVIEW', 'Panel member intersects creator lineage');
        requireValue(c.seats.every(other => other === seat || ['actorId', 'runId', 'contextId'].every(key => other[key] !== seat[key])), 'REVIEW_SEAT_REUSED', 'Panel seats require distinct actors, runs and contexts');
      }
      p.panels.push({artifactId: a.id, seats: structuredClone(c.seats), assignedBy: structuredClone(context)});
      break;
    }
    case 'record-review': {
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      requireValue(c.reviewId && !p.reviews.some(r => r.id === c.reviewId) && ['pass', 'reject'].includes(c.verdict) && Array.isArray(c.findings), 'INVALID_REVIEW', 'Unique review, verdict and findings required');
      requireValue(context.inputPacketHash && Array.isArray(context.parentRunIds) && Array.isArray(context.ancestorActorIds) && Array.isArray(context.exposedReviewIds) && Array.isArray(context.authorRecommendations) && Array.isArray(context.priorScores), 'REVIEW_CONTEXT_REQUIRED', 'Captured packet and lineage metadata required');
      const authors = creationLineage(p, a).map(item => item.author);
      requireValue(authors.every(author => !intersectsLineage(author, context)), 'SELF_REVIEW', 'Reviewer intersects creator lineage');
      requireValue((c.reviewType === 'opposition' ? context.exposedReviewIds.every(id => id === c.pairedReviewId) : !context.exposedReviewIds.length) && !context.authorRecommendations.length && !context.priorScores.length, 'REVIEW_EXPOSURE', 'Independent first read excludes recommendations and prior verdicts');
      requireValue(c.findings.every(f => ['factual', 'scope', 'structure', 'creative_preference', 'production'].includes(f.category)), 'INVALID_FINDING', 'Unknown finding category');
      const reviewType = c.reviewType ?? 'score';
      requireValue(['score', 'opposition'].includes(reviewType) && REVIEW_ROLES[a.stage]?.includes(c.role), 'INVALID_ROLE', 'Known stage review role required');
      requireValue(!p.reviews.some(r => r.artifactId === a.id && (r.context.actorId === context.actorId || r.context.runId === context.runId || r.context.contextId === context.contextId)), 'REVIEW_SEAT_REUSED', 'Independent seats require distinct actors, executions and contexts');
      const panel = p.panels.find(panel => panel.artifactId === a.id);
      requireValue(panel, 'PANEL_REQUIRED', 'Freeze named scoring seats before any review');
      if (reviewType === 'score') {
        requireValue(!p.reviews.some(r => r.artifactId === a.id && r.reviewType === 'score' && r.role === c.role), 'SCORE_ALREADY_RECORDED', 'Original vote is immutable; additional criticism uses opposition');
        requireValue(panel.seats.some(seat => seat.role === c.role && ['actorId', 'runId', 'contextId'].every(key => seat[key] === context[key])), 'UNASSIGNED_REVIEWER', 'Score must come from its assigned seat');
      } else requireValue(!panel.seats.some(seat => ['actorId', 'runId', 'contextId'].some(key => seat[key] === context[key])), 'REVIEW_SEAT_REUSED', 'Opposition must be independent of all scoring seats');
      if (reviewType === 'opposition') requireValue(p.reviews.some(r => r.id === c.pairedReviewId && r.artifactId === a.id && r.reviewType === 'score' && r.role === c.role) && c.firstReadRef, 'INVALID_OPPOSITION', 'Matching vote and saved independent first read required');
      if (c.score !== undefined) requireValue(reviewType === 'score' && c.score >= 1 && c.score <= 5, 'INVALID_SCORE', 'Original score must be 1–5');
      requireValue(c.findings.every(f => !f.blocking || (['critical', 'major'].includes(f.severity) && f.evidenceRefs?.length && f.requirement)), 'INVALID_FINDING', 'Blocking findings require severity, evidence and actionable requirement');
      p.reviews.push({reviewType, role: c.role, score: c.score, referenceFit: c.referenceFit, pairedReviewId: c.pairedReviewId, firstReadRef: c.firstReadRef, id: c.reviewId, artifactId: a.id, verdict: c.verdict, findings: c.findings, context: structuredClone(context), simulationLabel: 'metadata-validated simulation; not consumer research'}); break;
    }
    case 'record-disposition':
    case 'adopt-creative':
      if (c.kind === 'adopt-creative') human(context); targetWithin(new WeakMap(), p, c.artifactId); requireValue(c.reason, 'REASON_REQUIRED', 'Adoption must retain a reason');
      requireValue(c.kind === 'adopt-creative' || (c.evidenceRefs?.length && ['adopt', 'defer', 'reject', 'pending'].includes(c.outcome)), 'INVALID_DISPOSITION', 'Disposition needs evidence and outcome');
      requireValue(!p.reviews.some(r => r.artifactId === c.artifactId && (r.context.actorId === context.actorId || r.context.runId === context.runId)), 'SELF_ADJUDICATION', 'Adjudicator must be independent of reviewers');
      const subject = artifact(p, c.artifactId);
      const creatorRuns = creationLineage(p, subject).map(item => item.author);
      requireValue(creatorRuns.every(author => !intersectsLineage(author, context)), 'SELF_ADJUDICATION', 'Adjudicator must be independent of creation lineage');
      p.decisions.push({...(subject.stage==='sketch'?{sketchGeneration:structuredClone(subject.sketchGeneration)}:{}),kind: c.kind, human: context.actorType === 'human', outcome: c.kind === 'adopt-creative' ? 'adopt_creative' : c.outcome, evidenceRefs: c.evidenceRefs ?? [], artifactId: c.artifactId, actorId: context.actorId, reason: c.reason, policyVersion: currentPolicy(p).version, reviewIds: p.reviews.filter(r => r.artifactId === c.artifactId).map(r => r.id), creativePanelId:(p.creativePanels??[]).filter(x=>x.packet.artifactId===c.artifactId&&x.packet.policyVersion===currentPolicy(p).version&&x.packet.feedbackHash===feedbackHash(stageFeedback(p,subject.stage))).at(-1)?.id, correctionReviewIds:(p.correctionReviews??[]).filter(r=>r.artifactId===c.artifactId).map(r=>r.id), feedbackReviewIds: (p.feedbackReviews ?? []).filter(r => r.artifactId === c.artifactId).map(r => r.id)}); break;
    case 'acknowledge-handoff': {
      requireValue(!p.workflow,'SEVEN_STAGE_ROUTE_REQUIRED','Current workflow requires actual versioned owner reception');
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      requireValue(!['layout','final_review'].includes(a.stage),'LAYOUT_FINAL_AUTHORITY_UNAVAILABLE','Metadata acknowledgments cannot grant layout or delivery authority');
      requireValue(a.sketchGeneration?.protocol!==REVIEW_PROTOCOL,'REVIEW_HANDOFF_REQUIRED','Actual refinement producer and consumer required');
      requireValue(!(a.stage==='copy'&&a.provenance==='provider_execution'),'REFERENCE_OWNERS_REQUIRED','Metadata acknowledgments cannot replace actual copy/reference reports');
      requireValue(['producer', 'consumer'].includes(c.side) && (c.nextStage === 'delivery' ? a.stage === 'final_review' : STAGES[c.nextStage]?.includes(a.stage)), 'INVALID_HANDOFF', 'Acknowledgment must name an actual downstream owner');
      requireValue(c.side !== 'producer' || context.actorId === a.author.actorId, 'WRONG_OWNER', 'Producer acknowledgment requires artifact author');
      requireValue(c.side !== 'consumer' || context.actorId !== a.author.actorId, 'WRONG_OWNER', 'Next owner must differ from producer');
      p.acknowledgments.push({artifactId: a.id, side: c.side, nextStage: c.nextStage, actorId: context.actorId}); break;
    }
    case 'release-stage': {
      requireValue(!p.workflow,'RESEARCH_R7_READER_REQUIRED','Current workflow cannot use legacy generic release');
      const a = targetWithin(new WeakMap(), p, c.artifactId);
      eligibleWithin(new WeakMap(), p, a);
      if(usesResearchOperatorWorkflow(p)&&a.stage==='research'&&a.provenance==='provider_execution')requireResearchOperatorReleaseWithin(new WeakMap(), p,a);
      if(a.stage!=='strategy'||a.provenance!=='provider_execution'||!p.releases.some(r=>r.artifactId===a.id&&r.policyVersion===currentPolicy(p).version))p.releases.push({artifactId: a.id, policyVersion: currentPolicy(p).version, actorId: context.actorId}); break;
    }
    default: if(!RESEARCH_READER_COMMANDS.includes(c.kind)&&!INTAKE_COMMANDS.includes(c.kind)&&!ACQUISITION_COMMANDS.includes(c.kind))fail('UNKNOWN_COMMAND', 'Unknown command kind');
  }
  try{enforceFinalCallCeiling(p);}catch(e){fail(e.code??'FINAL_AUTHORITY_INVALID',e.message);}
  p.revision++;
  p.processedCommands[c.commandId] = c.kind==='prepare-project-layout'&&c.prepared&&!c.numericPreparation?layoutCommandWitness(c,fingerprint):fingerprint;
  p.audit.push({commandId: c.commandId, kind: c.kind, actorId: context.actorId, revision: p.revision, at: context.now ?? null});
  requireContentCommitAdmission(p,c,p.processedCommands[c.commandId]);
  return freeze(p);
}
export function releaseReadiness(p, artifactId) { return releaseReadinessWithin(new WeakMap(), ...arguments); }
function releaseReadinessWithin(evaluation, p, artifactId) {
  try { eligibleWithin(evaluation, p, targetWithin(evaluation, p, artifactId)); return {eligible: true, blockedReasons: []}; }
  catch (error) { if (!(error instanceof DomainError)) throw error; return {eligible: false, blockedReasons: [error.code]}; }
}
export function researchAssessmentState(p,artifactId) { return researchAssessmentStateWithin(new WeakMap(), ...arguments); }
function researchAssessmentStateWithin(evaluation, p,artifactId){
 try{const assessment=validatedResearchAssessmentWithin(evaluation, p,artifactId),report=validateResearchReadinessOutput(assessment.rawReport,assessment.input);requireValue(assessment.input.evidenceLinkPolicy===RESEARCH_EVIDENCE_LINK_POLICY,'RESEARCH_READINESS_UPGRADE_REQUIRED','A new evidence-linked readiness review is required');requireSemanticCoverage(p,artifactId);return {current:true,ready:report.verdict==='ready'&&!report.hasBlockingFindings,assessmentId:assessment.id,handlingBlocked:researchHandlingBlockedWithin(evaluation, p,artifactId),...report.applicabilityEvaluation};}
 catch(error){return {current:false,ready:false,blockedReason:error.code??'INVALID_RESEARCH_APPLICABILITY'};}
}
export function projectView(p) { return projectViewWithin(new WeakMap(), ...arguments); }
function projectViewWithin(evaluation, p) {
  return freeze({id: p.id, name: p.name, revision: p.revision, references:(p.referenceDossiers??[]).map(d=>({dossierId:d.id,artifactId:d.envelope.source.source?.artifactId??null,...referenceState(p,d,{sourceEnvelope:(p, artifactId, sourceContents, consumerBinding) => copyDeliveryEnvelopeWithin(evaluation, p, artifactId, sourceContents, consumerBinding)})})), ownerEdges:(p.ownerEdges??[]).map(e=>({edgeId:e.id,artifactId:e.envelope.source.artifactId,...ownerEdgeStateWithin(evaluation, p,e)})), ownerIntents:(p.ownerIntents??[]).map(i=>({id:i.id,artifactId:i.artifactId})), taskCard: p.taskCards.find(t => t.id === p.activeTaskCardId), policy: currentPolicy(p), jobs: structuredClone(p.jobs), stages: Object.keys(STAGES).map(stage => {
    const id = p.activeByStage[stage];
    let blockedReasons = [];
    try { inputsForWithin(evaluation, p, stage); } catch (error) { blockedReasons = [error.code]; }
    if (id) blockedReasons = releaseReadinessWithin(evaluation, p, id).blockedReasons;
    const latestJob = p.jobs.filter(job => job.stage === stage && (!job.purpose || job.purpose === 'stage')).at(-1);
    const jobStatus = latestJob && ['queued', 'running', 'failed', 'blocked', 'awaiting_reconciliation'].includes(latestJob.status) ? latestJob.status : null;
    let correctionAvailability=null;
    if(id&&['research','strategy','copy'].includes(stage)){try{revisionPlanWithin(evaluation, p,id);correctionAvailability={available:true,reason:null};}catch(error){if(!(error instanceof DomainError)&&!error.code)throw error;correctionAvailability={available:false,reason:error.code};}}
    return {...(stage==='research'&&(p.readinessReports??[]).some(r=>r.artifactId===id&&r.protocolVersion===APPLICABILITY_PROTOCOL)?{researchAssessment:researchAssessmentStateWithin(evaluation, p,id)}:{}),stage, correctionAvailability, activeArtifactId: id ?? null, latestJobId: latestJob?.id ?? null, status: jobStatus ?? ( id ? releasedWithin(evaluation, p, id) ? 'released' : freshWithin(evaluation, p, id) ? 'awaiting_release' : 'stale' : blockedReasons.length ? 'blocked' : 'ready'), blockedReasons};
  }), complete: releasedWithin(evaluation, p, p.activeByStage.final_review)});
}

export function reviewContextReport(p,r){
 if(!r.rawReport?.selectionProtocol)return {rawReport:r.rawReport};
 const job=p.jobs.find(j=>j.id===r.jobId);
 const normalizedReport=job?.purpose==='readiness'?validateResearchReadinessOutput(r.rawReport,job.task.readinessInput):job?.purpose==='coverage_challenge'?validateSemanticOutput(r.rawReport,job.task.semanticInput):null;
 requireValue(normalizedReport,'INVALID_EVIDENCE_SELECTION','Selection report requires original review task');
 return {rawReport:r.rawReport,normalizedReport};
}
