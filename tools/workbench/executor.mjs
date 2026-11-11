import {SIMPLE_STRATEGY_VERSION} from './seven-stage-strategy.mjs';
import {verifyCurrentResearchReaders} from './research-reader-workflow.mjs';
import {verifyResearchReaderOriginal} from './research-reader-original.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {buildResearchReaderPacket,buildResearchReaderRequest,projectResearchReaderReport,validateResearchReaderOutput} from './research-reader-loop.mjs';
import {researchQuestionRegistration,researchReaderTarget,researchReaderReport,researchReaderEvidence} from './research-reader-state.mjs';
import {assertWorkflowStage} from './seven-stage-workflow.mjs';
import {researchMethodIdentity, applyResearchMethod} from './research-method.mjs';
import {buildSplitPlan} from './research-readiness-split.mjs';
import {executeSplitReadiness,splitAllowance} from './readiness-split-runtime.mjs';
import {capturedTextRecord} from './captured-text-evidence.mjs';
import {loadTerminalFailureWitness,terminalFailureResolution,terminalDiagnosticPlan} from './readiness-terminal-failure.mjs';
import {EVIDENCE_ENRICHMENT_MODE} from './evidence-enrichment.mjs';
import {evidenceEnrichmentPlan} from './project.mjs';
import {reviewContextReport} from './project.mjs';
import {semanticChallengeInput,semanticChallengeCurrent} from './project.mjs';
import {buildSemanticRequest,validateSemanticOutput} from './research-semantic-review.mjs';
import {reopenOrdinaryCompletion,restoreOrdinaryJob} from './ordinary-model-project.mjs';
import {verifyOrdinaryProject} from './ordinary-model-project.mjs';
import {invokeOrdinary,reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {createResearchAcquisitionRuntime} from './research-acquisition-runtime.mjs';
import {ACQUISITION_PROTOCOL,ACQUISITION_PURPOSES,resolveAcquisition} from './research-acquisition.mjs';
import {verifyResearchDataOriginal} from './stage-original.mjs';
import {RESEARCH_DATA_VERSION,researchDataBasis} from './research-chart-data.mjs';
import {NUMERICAL_REVIEW_PROTOCOL,evidenceProtocolCapabilities} from './evidence-protocols.mjs';
import {createIntakeRuntime} from './intake-runtime.mjs';
import {INTAKE_PURPOSES} from './intake-domain.mjs';
import {STRATEGY_CONTRACT_VERSION} from './strategy-contract.mjs';
import {createFinalReviewRuntime,selectFinalBusinessAction} from './final-review-runtime.mjs';
import {createFinalPreparationRuntime} from './final-review-preparation.mjs';
import {createFinalReviewReader} from './final-review-reader.mjs';
import {createFinalOperationRuntime} from './final-operation-host.mjs';
import {createFinalContinuationRuntime} from './final-review-continuation.mjs';
import {createLayoutRuntime} from './layout-runtime.mjs';
import {LAYOUT_PURPOSE} from './layout-boundary.mjs';
import {createCompleteContentRuntime} from './complete-content-runtime.mjs';
import {CONTENT_PURPOSES} from './complete-content.mjs';
import {createFinalVisualRuntime} from './final-visual-runtime.mjs';
import {FINAL_VISUAL_PURPOSES} from './final-visual.mjs';
import {createSketchReviewRuntime} from './sketch-review-runtime.mjs';
import {REVIEW_PURPOSES} from './sketch-review-v2.mjs';
import {createSketchRuntime} from './sketch-runtime.mjs';
import {SKETCH_PURPOSES} from './sketch-authority.mjs';
import {createReferenceRuntime} from './reference-runtime.mjs';
import {loadSavedReadinessProof,persistRecoveredReadiness,validateSavedReadinessProof} from './readiness-evidence.mjs';
import {APPLICABILITY_PROTOCOL,APPLICABILITY_HANDLING} from './research-applicability.mjs';
import {buildOwnerRequest,validateOwnerOutput} from './owner-edge.mjs';
import {LATEST_CORRECTION_PROTOCOL,COMPLETE_CORRECTION_REVIEW_PROTOCOL,admitSupplementalSources,createCorrectionEvidence,evidenceRecords,evidenceVisualRecords} from './correction-evidence.mjs';
import {CORRECTION_PROTOCOL,LATEST_CORRECTION_REVIEW_PROTOCOL,correctionFeedback,buildCorrectionReviewRequest,validateCorrectionReviewOutput} from './correction.mjs';
import {creativeProtocolFor,creativePlan,creativeHash,creativeNodeInput,buildCreativeRequest,validateCreativeOutput} from './creative-panel.mjs';
import {feedbackHash} from './human-feedback.mjs';
import {buildFeedbackReviewRequest, validateFeedbackReviewOutput} from './human-feedback.mjs';
import {buildCaseIdentityRequest,validateCaseIdentityOutput} from './case-identity.mjs';
import {capturePublicSource} from './source-acquisition.mjs';
import {readManagedCapture} from './source-capture-store.mjs';
import {verifyRegisteredCorrectionOriginals} from './registered-correction-originals.mjs';
import {buildImageObservationReviewRequest, validateImageObservationReviewOutput} from './image-observation-review.mjs';
import {createImageEvidenceStore, imageManifest, buildImageObservationRequest, validateImageObservationOutput} from './image-evidence.mjs';
import {DECLARATION_HANDOFF_PROTOCOL,APPLICABILITY_HANDOFF_PROTOCOL,buildResearchHandoffRequest,validateResearchHandoffOutput} from './research-handoff.mjs';
import {buildResearchReadinessRequest,validateResearchReadinessOutput,RESEARCH_EVIDENCE_LINK_POLICY} from './research-readiness.mjs';
import {reconcileStage} from './reconcile-stage.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {hostname} from 'node:os';
import {inputsFor,hasResearchData,strategyBasisFor,validateResearchDeclarationInput,researchWorkflowView,researchOperatorConstraints,usesResearchOperatorWorkflow,STAGES,DomainError,releaseReadiness,stageVisualCatalogue,projectCaseEvidenceCatalogue,projectCatalogueState,revisionPlan,correctionHandlingContext,strategyDeliveryEnvelope,copyDeliveryEnvelope,ownerEdgeState,ownerCopyTask,researchAssessmentContext,readinessReplacementProposal,validatedResearchAssessment,researchHandlingBlocked,researchRevisionAuthority,researchReviewConstraints} from './project.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {buildEvidenceReviewRequest,validateEvidenceReviewOutput} from './evidence-review.mjs';
import {COPY_CONTRACT_VERSION,buildStageRequest,validateStageOutput} from './stage-content.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
function inheritedSources(project,stage,supplied) {
  const records=new Map(),visited=new Set();
  const add=source=>{
    if(records.has(source.id)&&!isDeepStrictEqual(records.get(source.id),source))
      throw Object.assign(new Error(`Source record changed for inherited ID: ${source.id}`),{code:'SOURCE_ID_CONFLICT'});
    if(!records.has(source.id))records.set(source.id,structuredClone(source));
  };
  const visit=id=>{
    if(visited.has(id))return;
    visited.add(id);
    const artifact=project.artifacts.find(item=>item.id===id);
    if(!artifact)return;
    artifact.inputVersionIds.forEach(visit);
    const job=project.jobs.find(item=>item.outputVersionIds?.includes(id));
    (job?.task?.sourceRecords??[]).forEach(add);
    (artifact.technicalReceipts?.sourceCatalogue?.records??[]).forEach(add);
  };
  (Object.hasOwn(STAGES,stage)?STAGES[stage]:[]).forEach(dependency=>visit(project.activeByStage[dependency]));
  supplied.forEach(add);
  return [...records.values()];
}
function upstreamConstraints(project,stage) {
  if(stage==='copy'){const edge=(project.ownerEdges??[]).filter(e=>e.envelope.source.artifactId===project.activeByStage.strategy&&e.commit).at(-1);if(edge)return structuredClone(ownerCopyTask(project,edge).upstreamReviewConstraints);}
  return Object.fromEntries((STAGES[stage]??[]).map(dependency=>project.activeByStage[dependency]).filter(Boolean).map(id=>[id,{...(stage==='strategy'&&usesResearchOperatorWorkflow(project)?{operatorHandoff:researchOperatorConstraints(project,id)}:{}),...((project.coverageChallenges??[]).some(r=>r.artifactId===id)?{semantic:(project.coverageChallenges??[]).filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(project,r)}))}:{}),readiness:(project.readinessReports??[]).filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(project,r)})),handoffs:(project.handoffReports??[]).filter(r=>r.artifactId===id).map(r=>({reportId:r.id,...reviewContextReport(project,r)}))}]));
}
export function createExecutor({store,rootDir,providers={},bindings={},imageStore=createImageEvidenceStore({rootDir:join(rootDir,'images')}),acquisitionDependencies={},creativeCalibrations=[],referenceConfiguration=null,imageProvider=null,sketchConfiguration=null,sketchReviewConfiguration=null,finalVisualConfiguration=null,contentConfiguration=null,layoutConfiguration=null,finalReviewConfiguration=null,launchConfiguration=null,intakeConfiguration=null,researchAcquisitionConfiguration=null,searchProviders={},semanticLease=null,readinessSplitConfiguration=null,referenceLibrary=null}) {
  const root=resolve(rootDir);
  const verifyRegistered=async(project,job)=>{try{await verifyRegisteredCorrectionOriginals(project,job,{executionRoot:root,imageStore});}catch(error){throw new DomainError('INVALID_CORRECTION_ORIGINAL',error.message);}};
  const diagnosticWitness=async(p,job)=>{
    if(!job.readinessFailureResolutionId)return undefined;
    const {resolution,job:origin,attempt}=terminalFailureResolution(p,job.readinessFailureResolutionId),w=await loadTerminalFailureWitness(root,p.id,origin,attempt);
    if(!isDeepStrictEqual(w,resolution.witness))throw new DomainError('INVALID_READINESS_TERMINAL_FAILURE','Failure original changed');
    if(!isDeepStrictEqual(bindings.readiness,job.binding)||providers[job.binding.providerId]?.reasoningEffort!=='low')throw new DomainError('DIAGNOSTIC_MITIGATION_REQUIRED','Diagnostic requires explicitly recorded low reasoning');
    return w;
  };
  const send=(id,command,context)=>store.command(id,{...command,expectedRevision:store.read(id).revision,commandId:randomUUID()}, {...context,now:new Date().toISOString()},semanticLease);
  async function verifyResearchOriginal(project,artifact){const producer=project.jobs.find(j=>j.outputVersionIds?.includes(artifact.id));if(producer?.task?.researchDataBasis?.acquisition)await acquisition.verifyProducer(project.id,producer.task.researchDataBasis.acquisition);const original=await verifyResearchDataOriginal(project,artifact,{executionRoot:root});if(producer)await verifyRegistered(project,producer);return original;}
  async function verifyAcquiredAncestry(project,ids){const seen=new Set();const visit=async id=>{if(seen.has(id))return;seen.add(id);const a=project.artifacts.find(a=>a.id===id);if(!a)return;if(a.stage==='research'&&hasResearchData(project,a))await verifyResearchOriginal(project,a);for(const parent of [...a.inputVersionIds,...(a.revision?[a.revision.revisionOf.artifactId]:[])])await visit(parent);};for(const id of ids)await visit(id);}
  async function inputs(project,job) {
    const result=[];
    for(const id of job.inputVersionIds) {
      const a=project.artifacts.find(item=>item.id===id);
      if(!a)continue;
      if(a.stage==='research'&&hasResearchData(project,a))await verifyResearchOriginal(project,a);
      const file=await realpath(a.payloadRef),base=await realpath(root);
      if(!file.startsWith(base+sep))throw new Error('Artifact outside executor storage');
      const raw=await readFile(file,'utf8');
      if(hash(raw)!==a.contentHash)throw new Error('Artifact content hash mismatch');
      result.push({id,stage:a.stage,content:JSON.parse(raw),...(job.task.upstreamReviewConstraints?.[id]?{reviewConstraints:job.task.upstreamReviewConstraints[id]}:{})});
    }
    return result;
  }
  const continuationIntents = project => Object.values(project.processedCommands).map(value => JSON.parse(value)).filter(command => command.kind === 'release-stage' && command.continuation?.purpose === 'research-to-strategy');
  const checkContinuation = (project, request, binding) => {
    if (project.policies.at(-1).version !== request.policyVersion) throw new DomainError('STALE_POLICY', 'Continuation policy changed');
    if (project.activeByStage.research !== request.artifactId) throw new DomainError('STALE_ARTIFACT', 'Continuation requires current research');
    if (project.policies.at(-1).authorizedThrough === 'research') throw new DomainError('AUTHORIZATION_ENDPOINT', 'Strategy exceeds the authorized endpoint');
    if (!binding || !isDeepStrictEqual(binding, bindings.strategy)) throw new DomainError('MODEL_BINDING_MISMATCH', 'Strategy configuration changed; the accepted owner must remain the same');
    if (!providers[binding.providerId] || providers[binding.providerId].model !== binding.model) throw new DomainError('PROVIDER_MISSING', 'Strategy provider is unavailable');
    const consumer = (project.handoffReports ?? []).filter(report => report.artifactId === request.artifactId && report.side === 'consumer').at(-1);
    if (!isDeepStrictEqual(consumer?.rawReport?.ownerBinding, binding)) throw new DomainError('HANDOFF_REQUIRED', 'Current strategy owner must accept the research');
    if(usesResearchOperatorWorkflow(project))researchOperatorConstraints(project,request.artifactId);
    const readiness = releaseReadiness(project, request.artifactId);
    if (!readiness.eligible) throw new DomainError(readiness.blockedReasons[0], 'Research release is blocked: ' + readiness.blockedReasons[0]);
  };
  const ownerSourceContents=async(project,artifactId)=>{
    const all=[],seen=new Set();
    const visit=async id=>{if(seen.has(id))return;seen.add(id);const a=project.artifacts.find(x=>x.id===id);if(!a)return;if(a.stage==='research'&&hasResearchData(project,a))await verifyResearchOriginal(project,a);const loaded=await readArtifactContent(project,id,root);all.push({artifactId:id,contentText:loaded.contentText});for(const upstream of [...a.inputVersionIds,...(a.revision?[a.revision.revisionOf.artifactId]:[])])await visit(upstream);};
    await visit(artifactId);return all;
  };
  const ownerRuntimeBinding=edge=>{
    if(!isDeepStrictEqual(edge.envelope.consumerBinding,bindings.copy))throw new DomainError('OWNER_BINDING_CHANGED','Configured copy owner changed; prepare a new edge generation');
    for(const binding of [edge.envelope.producerAssignment.binding,edge.envelope.consumerBinding])if(!providers[binding.providerId]||providers[binding.providerId].model!==binding.model)throw new DomainError('PROVIDER_MISSING','Frozen owner provider unavailable');
  };
  const references=createReferenceRuntime({store,root,providers,bindings,imageStore,acquisitionDependencies,configuration:referenceConfiguration,library:referenceLibrary,sourceEnvelope:copyDeliveryEnvelope});
  const sketches=createSketchRuntime({store,root,references,providers,bindings,imageStore,imageProvider,configuration:sketchConfiguration});
  const sketchReviews=createSketchReviewRuntime({store,root,sketches,providers,bindings,imageStore,configuration:sketchReviewConfiguration});
  const finalVisuals=createFinalVisualRuntime({store,root,sketchReviews,providers,bindings,imageStore,imageProvider,configuration:finalVisualConfiguration});
  const completeContent=createCompleteContentRuntime({store,root,providers,bindings,imageStore,finalVisuals,configuration:contentConfiguration});
  const layouts=createLayoutRuntime({store,root,content:completeContent,configuration:layoutConfiguration});
  const finalContinuations=createFinalContinuationRuntime({store,configuration:finalReviewConfiguration});
  const intake=createIntakeRuntime({store,root,providers,bindings,imageStore,acquisitionDependencies,configuration:intakeConfiguration});
  const acquisitionSelector=Symbol('internal-acquisition-selector');
  const acquisition=createResearchAcquisitionRuntime({store,root,providers,bindings,searchProviders,configuration:researchAcquisitionConfiguration,intake,intakeConfiguration,acquisitionDependencies,caseCatalogue:projectCaseEvidenceCatalogue,enqueueProducer:async(projectId,ref,commandId,expectedRevision)=>{await acquisition.verifyProducer(projectId,ref);return runtime.enqueue(projectId,'research',{[acquisitionSelector]:ref,commandId,expectedRevision});}});
  const finalReader=launchConfiguration?.moduleConfigs?.finalReview&&layoutConfiguration?.execution?.python?createFinalReviewReader({store,root,content:completeContent,imageStore,pythonBinary:layoutConfiguration.execution.python,providerRoot:join(root,'provider'),launchConfiguration}):null;
  const finalOperations=finalReader?createFinalOperationRuntime({store,launchConfiguration,finalReader}):null;
  const finalPreparation=finalReader?createFinalPreparationRuntime({store,reader:finalReader,continuations:finalContinuations,launchConfiguration}):null;
  const finalBusiness=finalReader?createFinalReviewRuntime({store,reader:finalReader,operations:finalOperations,launchConfiguration}):null;
  const requireFinalBusiness=()=>{if(!finalBusiness)throw new DomainError('FINAL_CONFIGURATION_REQUIRED','Final reader and configured execution required');return finalBusiness;};
  const runtime = {
    verifyOrdinaryOriginals:projectId=>verifyOrdinaryProject(store.read(projectId),{executionRoot:root}),
    finalOperationPendingWork:id=>finalOperations?finalOperations.pendingWork(id):Promise.resolve([{kind:'final-operation-blocked',projectId:id,blockers:[{code:'FINAL_OPERATION_READER_REQUIRED'}]}]),
    advanceFinalOperation:work=>{if(!finalOperations)throw new DomainError('FINAL_OPERATION_READER_REQUIRED','Actual final reader required');return finalOperations.advance(work);},
    markFinalReviewCall:(id,command,context)=>{if(!finalOperations)throw new DomainError('FINAL_OPERATION_READER_REQUIRED','Actual final reader required');return finalOperations.markFinalCall(id,command,context);},
    reconcileFinalOperation:(id,jobId)=>{if(!finalOperations)throw new DomainError('FINAL_OPERATION_READER_REQUIRED','Actual final reader required');return finalOperations.reconcile(id,jobId);},
    readFinalSnapshot:id=>finalReader?finalReader.readSnapshot(id):Promise.resolve({kind:'blocked',blockers:[{code:'FINAL_OPERATION_READER_REQUIRED'}]}),
    researchAcquisition:acquisition,researchStatus:acquisition.status,advanceResearch:acquisition.advance,
    intake,
    finalReviewStatus:id=>({...finalContinuations.status(id),implementation:{dispatch:true,selectedHumanDecision:true,ownedDelivery:true},configuration:{reader:!!finalReader,module:!!finalReviewConfiguration,dispatch:!!finalBusiness},business:selectFinalBusinessAction(store.read(id)),captureRetained:!!store.read(id).finalOperationCaptures?.length,lastInspection:finalPreparation?.lastInspection(id)??{kind:'not_checked_this_process'}}),continueFinalReview:finalContinuations.continue,finalReviewPendingWork:finalContinuations.pendingWork,
    ensureImplicitFinalReview:finalContinuations.ensureImplicit,
    finalDelivery:id=>requireFinalBusiness().delivery(id),
    downloadFinalDelivery:(id,deliveryId,style)=>requireFinalBusiness().download(id,deliveryId,style),
    decideFinalReview:(id,request,context)=>requireFinalBusiness().decide(id,request,context),
    releaseFinalDelivery:(id,request)=>requireFinalBusiness().release(id,request),
    async prepareFinalReview(work){
      if(!finalPreparation)return {kind:'blocked',blockers:[{code:'FINAL_OPERATION_READER_REQUIRED'}]};
      const action=selectFinalBusinessAction(store.read(work.projectId));
      if(['reconcile','reconcile_operation'].includes(action.kind))return finalBusiness.advance(work.projectId);
      const prepared=await finalPreparation.prepareFinalReview(work);
      if(prepared.kind!=='captured')return prepared;
      const outcome=await finalBusiness.advance(work.projectId);
      return {...outcome,lastInspection:{...prepared.lastInspection,settledProgressIdentity:work.observedProgressIdentity}};
    },
    layoutCapability:layouts.capability,layoutSemanticPlans:layouts.semanticPlans,layoutStatus:layouts.layoutStatus,continueLayout:layouts.continueLayout,reviseLayout:layouts.reviseLayout,advanceLayout:layouts.advanceLayout,
    reviseContent:completeContent.reviseContent,preflightContentRevision:completeContent.preflightContentRevision,continueContent:completeContent.continueContent,advanceContent:completeContent.advanceContent,contentStatus:completeContent.contentStatus,contentDraft:completeContent.contentDraft,contentLayoutInput:completeContent.contentLayoutInput,verifyLayoutPreparation:completeContent.verifyLayoutPreparation,contentCapability:completeContent.capability,
    adjustFinalVisualAllowance:finalVisuals.adjustFinalVisualAllowance,continueFinalVisual:finalVisuals.continueFinalVisual,advanceFinalVisual:finalVisuals.advanceFinalVisual,verifyFinalVisual:finalVisuals.verifyFinalVisual,finalVisualCapability:finalVisuals.capability,
    sketchReviewCapability:sketchReviews.capability,continueSketchReview:sketchReviews.continueSketchReview,advanceSketchReview:sketchReviews.advanceSketchReview,
    adjustImageAllowance:sketches.adjustImageAllowance,sketchCapability:sketches.capability,continueSketch:sketches.continueSketch,advanceSketch:sketches.advanceSketch,sketchReviewInput:sketches.sketchReviewInput,registerReviewedSketch:sketches.registerReviewedSketch,verifyReviewedSketch:(id,a)=>a.sketchGeneration?.protocol==='sketch-review-v2'?sketchReviews.verifyReviewedSketch(id,a):sketches.verifyReviewedSketch(id,a),
    referenceCapability:references.capability,continueCopy:references.continueCopy,submitReferenceMaterial:references.submitReferenceMaterial,submitReferenceLibraryMaterial:references.submitReferenceLibraryMaterial,reviseReferences:references.reviseReferences,advanceReferences:references.advanceReferences,referenceStatus:references.referenceStatus,referenceStates:references.referenceStates,adoptReferences:references.adoptReferences,chooseReferences:references.chooseReferences,
    async continueStrategy(projectId,request){
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const p=store.read(projectId),prior=(p.ownerIntents??[]).find(i=>i.id===request.commandId);
      if(prior&&!isDeepStrictEqual(prior.request,request))throw new DomainError('COMMAND_ID_REUSED','Continuation intent ID reused');
      if(!prior)store.command(projectId,{kind:'request-strategy-continuation',artifactId:request.artifactId,request:structuredClone(request),commandId:request.commandId,expectedRevision:request.expectedRevision},{actorType:'agent',actorId:'owner-edge-coordinator',runId:randomUUID(),contextId:randomUUID()});
      await runtime.advanceOwnerEdges(projectId,{explicitArtifactId:prior?undefined:request.artifactId,onlyArtifactId:request.artifactId});
      const current=store.read(projectId),edges=(current.ownerEdges??[]).filter(e=>e.envelope.source.artifactId===request.artifactId);
      return {artifactId:request.artifactId,edges:edges.map(e=>({edgeId:e.id,...ownerEdgeState(current,e)})),...(!edges.length?{status:'waiting_source',blockedReason:await runtime.ownerWaitingReason(projectId,request.artifactId)}:{})};
    },
    async ownerWaitingReason(projectId,artifactId){try{const p=store.read(projectId);strategyDeliveryEnvelope(p,artifactId,await ownerSourceContents(p,artifactId),bindings.copy);return null;}catch(error){return error.code??'SOURCE_NOT_READY';}},
    async advanceOwnerEdges(projectId,{explicitArtifactId,onlyArtifactId}={}){
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      let p=store.read(projectId);const queued=[];
      const sourceId=explicitArtifactId??onlyArtifactId??p.activeByStage.strategy;
      const requested=explicitArtifactId||(p.ownerIntents??[]).some(i=>i.artifactId===sourceId)||p.policies.at(-1).mode==='auto';
      if(sourceId&&requested){
        try{
          const sourceContents=await ownerSourceContents(p,sourceId),envelope=strategyDeliveryEnvelope(p,sourceId,sourceContents,bindings.copy),edgeId=`owner-${envelope.envelopeHash}`;
          const historical=(p.ownerEdges??[]).some(e=>e.envelope.source.artifactId===sourceId);
          if(!(p.ownerEdges??[]).some(e=>e.id===edgeId)&&(!historical||explicitArtifactId)){
            ownerRuntimeBinding({envelope});
            send(projectId,{kind:'request-owner-edge',artifactId:sourceId,sourceContents,consumerBinding:bindings.copy,edgeId},{actorType:'agent',actorId:'owner-edge-coordinator',runId:randomUUID(),contextId:randomUUID()});
          }
        }catch(error){if(!['OWNER_BLOCKED','HUMAN_GATE','HARD_BLOCKER','CREATIVE_PANEL_REQUIRED','CREATIVE_PANEL_INCOMPLETE','CREATIVE_PANEL_NOT_PASSED','OWNER_REQUIRED','DEPENDENCY_BLOCKED','AUTHORIZATION_ENDPOINT','PROVIDER_MISSING','INVALID_BINDING','FEEDBACK_REVIEW_REQUIRED','CORRECTION_REVIEW_REQUIRED','INVALID_OWNER_EDGE','STALE_ARTIFACT'].includes(error.code))throw error;}
      }
      for(const edge of (store.read(projectId).ownerEdges??[]).filter(e=>!onlyArtifactId||e.envelope.source.artifactId===onlyArtifactId)){
        p=store.read(projectId);const state=ownerEdgeState(p,edge);if(state.status==='blocked'&&['PROVIDER_MISSING','MODEL_BINDING_MISMATCH','OWNER_BINDING_CHANGED'].includes(state.blockedReason)){try{ownerRuntimeBinding(edge);send(projectId,{kind:'resume-owner-job',jobId:state.jobId},{actorType:'agent',actorId:'owner-edge-coordinator',runId:randomUUID(),contextId:randomUUID()});}catch{}}if(['stale','blocked','committed'].includes(state.status))continue;
        try{
          ownerRuntimeBinding(edge);
          if(state.status==='consumer_pending')send(projectId,{kind:'queue-owner-consumer',edgeId:edge.id},{actorType:'agent',actorId:'owner-edge-coordinator',runId:randomUUID(),contextId:randomUUID()});
          if(state.status==='ready_to_commit')send(projectId,{kind:'commit-owner-edge',edgeId:edge.id,task:ownerCopyTask(p,edge),binding:edge.envelope.consumerBinding},{actorType:'agent',actorId:'owner-edge-coordinator',runId:randomUUID(),contextId:randomUUID()});
        }catch(error){continue;}
      }
      p=store.read(projectId);for(const job of p.jobs)if(job.status==='queued'&&(job.purpose==='owner_acceptance'||job.task?.ownerEdgeId)&&(!onlyArtifactId||job.targetArtifactId===onlyArtifactId||job.inputVersionIds.includes(onlyArtifactId)))queued.push(job.id);return queued;
    },
    researchWorkflow(projectId) { return researchWorkflowView(store.read(projectId),{bindings,providers}); },
    async recordResearchHandoff(projectId,request,humanDecision) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      let p=store.read(projectId);
      const prior=(p.researchHandoffDeclarations??[]).find(d=>d.commandId===request.commandId);
      if(prior){if(!isDeepStrictEqual(prior.request,request))throw new DomainError('COMMAND_ID_REUSED','Declaration command ID belongs to another payload');return {handoffId:prior.id,jobId:p.jobs.find(j=>j.task?.handoffInput?.operatorDeclaration?.id===prior.id)?.id??null,replayed:true,revision:p.audit.find(a=>a.commandId===request.commandId).revision};}
      if(Object.hasOwn(p.processedCommands,request.commandId))throw new DomainError('COMMAND_ID_REUSED','Command ID already used');
      if(p.revision!==request.expectedRevision)throw new DomainError('REVISION_CONFLICT','Project changed');
      validateResearchDeclarationInput(request.input);
      const a=p.artifacts.find(a=>a.id===request.artifactId);
      if(!a)throw new DomainError('STALE_ARTIFACT','Research artifact missing');
      await verifyAcquiredAncestry(p,[a.id]);
      const loaded=await readArtifactContent(p,a.id,root),taskCard=p.taskCards.find(c=>c.id===p.activeTaskCardId),side=request.input.side==='research_owner'?'producer':'consumer';
      const author=p.jobs.find(j=>(!j.purpose||j.purpose==='stage')&&j.outputVersionIds?.includes(a.id)),binding=side==='producer'?author?.binding:bindings.strategy??(request.input.decision==='returned'?{providerId:'unconfigured',model:'unconfigured',role:'strategy-lead'}:null);
      if(!binding||request.input.decision!=='returned'&&providers[binding.providerId]?.model!==binding.model)throw new DomainError('PROVIDER_MISSING','Actual owner provider unavailable');
      if(p.workflow&&request.input.decision!=='returned')await verifyCurrentResearchReaders(p,{executionRoot:root,artifactId:a.id});
      const readerEvidence=p.workflow&&request.input.decision!=='returned'?researchReaderEvidence(p,a.id):null;
      const researchProducer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id));
      const frozenInput={...(readerEvidence?{readerEvidence}:{}),...(researchProducer?.task?.researchDataBasis?{researchDataBasis:structuredClone(researchProducer.task.researchDataBasis)}:{}),handoffProtocolVersion:DECLARATION_HANDOFF_PROTOCOL,artifactId:a.id,contentHash:a.contentHash,contentText:loaded.contentText,content:loaded.content,taskCard,taskCardConfirmed:p.confirmations.some(c=>c.taskCardId===taskCard.id),sourceRecords:a.technicalReceipts?.sourceCatalogue?.records??[],visualCatalogue:a.technicalReceipts?.visualCatalogue??[],side,targetStage:'strategy',ownerBinding:binding,verificationReports:p.verifications.filter(r=>r.artifactId===a.id).map(r=>r.rawReport),readinessReports:p.readinessReports.filter(r=>r.artifactId===a.id).map(r=>r.rawReport),assessment:validatedResearchAssessment(p,a.id),effectiveHandlingBlocked:researchHandlingBlocked(p,a.id),...(p.verifications.some(r=>r.artifactId===a.id&&evidenceProtocolCapabilities(r.rawReport.protocolVersion).catalogueState)?{catalogueState:projectCatalogueState(p,a)}:{})};
      store.command(projectId,{kind:'record-research-handoff',request:structuredClone(request),binding:structuredClone(binding),frozenInput,commandId:request.commandId,expectedRevision:request.expectedRevision},humanDecision);
      p=store.read(projectId);const declaration=p.researchHandoffDeclarations.find(d=>d.commandId===request.commandId);
      return {handoffId:declaration.id,jobId:p.jobs.find(j=>j.task?.handoffInput?.operatorDeclaration?.id===declaration.id)?.id??null,replayed:false,revision:p.revision};
    },
    async releaseResearch(projectId,request,humanDecision) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const p=store.read(projectId),prior=p.releases.find(r=>r.kind==='research-operator-release'&&r.commandId===request.commandId);
      if(prior){if(!isDeepStrictEqual(prior.request,request))throw new DomainError('COMMAND_ID_REUSED','Release command ID belongs to another payload');return {releaseId:prior.id,artifactId:prior.artifactId,replayed:true,revision:p.audit.find(a=>a.commandId===request.commandId).revision};}
      if(Object.hasOwn(p.processedCommands,request.commandId))throw new DomainError('COMMAND_ID_REUSED','Command ID already used');
      if(p.revision!==request.expectedRevision)throw new DomainError('REVISION_CONFLICT','Project changed');
      await readArtifactContent(p,request.artifactId,root);
      const research=p.artifacts.find(a=>a.id===request.artifactId);if(hasResearchData(p,research))await verifyResearchOriginal(p,research);
      if(p.workflow)await verifyCurrentResearchReaders(p,{executionRoot:root,artifactId:request.artifactId});
      store.command(projectId,{kind:'release-research',request:structuredClone(request),commandId:request.commandId,expectedRevision:request.expectedRevision},humanDecision);
      const next=store.read(projectId),release=next.releases.find(r=>r.commandId===request.commandId);return {releaseId:release.id,artifactId:release.artifactId,replayed:false,revision:next.revision};
    },
    continueOperatorResearch(projectId,request) {
      let p=store.read(projectId),prior=(p.researchContinuationIntents??[]).find(i=>i.id===request.commandId);
      if(prior&&!isDeepStrictEqual(prior.request,request))throw new DomainError('COMMAND_ID_REUSED','Continuation command ID belongs to another payload');
      if(prior&&p.jobs.some(j=>j.id===prior.jobId))return prior.jobId;
      if(!prior){
        if(Object.hasOwn(p.processedCommands,request.commandId))throw new DomainError('COMMAND_ID_REUSED','Command ID already used');
        if(p.revision!==request.expectedRevision)throw new DomainError('REVISION_CONFLICT','Project changed');
        checkContinuation(p,request,bindings.strategy);
        const release=researchOperatorConstraints(p,request.artifactId).release,existing=(p.researchContinuationIntents??[]).find(i=>i.releaseId===release.id);
        const jobId=existing?.jobId??`job-${hash(JSON.stringify([projectId,`research-continuation-${release.id}`]))}`;
        store.command(projectId,{kind:'request-research-continuation',request:structuredClone(request),binding:structuredClone(bindings.strategy),jobId,commandId:request.commandId,expectedRevision:request.expectedRevision},{actorType:'agent',actorId:'proposal-director',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
        p=store.read(projectId);prior=p.researchContinuationIntents.find(i=>i.id===request.commandId);
      }
      const existing=p.jobs.find(j=>j.id===prior.jobId);if(existing)return existing.id;
      checkContinuation(p,prior.request,prior.binding);
      const release=researchOperatorConstraints(p,prior.artifactId).release;
      if(release.id!==prior.releaseId)throw new DomainError('STALE_RESEARCH_DECLARATION','Continuation explicit release changed');
      return runtime.enqueue(projectId,'strategy',{commandId:`research-continuation-${release.id}`,expectedRevision:p.revision});
    },
    continueResearch(projectId, request) {
      if(request.protocolVersion===ACQUISITION_PROTOCOL)return acquisition.continue(projectId,request);
      const historical=continuationIntents(store.read(projectId)).find(c=>c.continuation.request.commandId===request.commandId);
      if(historical){
        if(!isDeepStrictEqual(historical.continuation.request,request))throw new DomainError('COMMAND_ID_REUSED','Continuation request ID belongs to another payload');
        const key=hash(JSON.stringify([projectId,historical.artifactId,historical.continuation.request.policyVersion,'research-to-strategy'])),id=`job-${hash(JSON.stringify([projectId,`continuation-job-${key}`]))}`;
        if(store.read(projectId).jobs.some(j=>j.id===id))return id;
      }
      if(usesResearchOperatorWorkflow(store.read(projectId)))return runtime.continueOperatorResearch(projectId,request);
      const project = store.read(projectId);
      const intents = continuationIntents(project);
      const reused = intents.find(command => command.continuation.request.commandId === request.commandId);
      if (reused && !isDeepStrictEqual(reused.continuation.request, request)) throw new DomainError('COMMAND_ID_REUSED', 'Continuation request ID belongs to another payload');
      const existing = intents.find(command => command.artifactId === request.artifactId && command.continuation.request.policyVersion === request.policyVersion);
      if (!reused && project.revision !== request.expectedRevision) throw new DomainError('REVISION_CONFLICT', 'Project revision changed');
      const binding = existing?.continuation.binding ?? bindings.strategy;
      checkContinuation(project, request, binding);
      const key = hash(JSON.stringify([projectId, request.artifactId, request.policyVersion, 'research-to-strategy']));
      if (!existing) {
        store.command(projectId, {kind: 'release-stage', artifactId: request.artifactId, commandId: `continuation-release-${key}`, expectedRevision: request.expectedRevision,
          continuation: {purpose: 'research-to-strategy', request: structuredClone(request), binding: structuredClone(binding)}},
        {actorId: 'proposal-director', actorType: 'agent', runId: randomUUID(), contextId: randomUUID(), now: new Date().toISOString()});
      }
      const released = store.read(projectId);
      const release = continuationIntents(released).find(command => command.commandId === `continuation-release-${key}`);
      const jobId = `job-${hash(JSON.stringify([projectId, `continuation-job-${key}`]))}`;
      const job = released.jobs.find(item => item.id === jobId);
      if (job) return jobId;
      checkContinuation(released, release.continuation.request, release.continuation.binding);
      return runtime.enqueue(projectId, 'strategy', {commandId: `continuation-job-${key}`, expectedRevision: released.revision});
    },
    recoverContinuations(projectId) {
      const project=store.read(projectId);
      const intents=[...(project.researchContinuationIntents??[]).map(intent=>({...intent,operator:true})),
        ...continuationIntents(project).map(command=>({artifactId:command.artifactId,...command.continuation}))];
      return intents.map(intent=>{
        try {
          const jobId=intent.operator?runtime.continueOperatorResearch(projectId,intent.request):runtime.continueResearch(projectId,intent.request);
          const current=store.read(projectId),job=current.jobs.find(item=>item.id===jobId);
          if(job?.status==='queued') {
            checkContinuation(current,intent.request,intent.binding);
            if(!isDeepStrictEqual(job.binding,intent.binding))throw new DomainError('MODEL_BINDING_MISMATCH','Queued job does not match its continuation owner');
            if(intent.operator&&researchOperatorConstraints(current,intent.artifactId).release.id!==intent.releaseId)throw new DomainError('STALE_RESEARCH_DECLARATION','Continuation explicit release changed');
          }
          return {jobId};
        } catch(error) {return {artifactId:intent.artifactId,blockedReason:error.code??'CONTINUATION_FAILED'};}
      });
    },
    async observeReadinessTerminalFailure(projectId,request){
      const p=store.read(projectId),job=p.jobs.find(j=>j.id===request.jobId),attempt=job?.attempts.find(a=>a.id===request.attemptId);
      const witness=await loadTerminalFailureWitness(root,projectId,job,attempt);
      const prior=(p.readinessResolutions??[]).find(r=>r.kind==='local-terminal-failure-observed'&&r.jobId===job.id);
      if(prior){if(!isDeepStrictEqual(prior.witness,witness))throw new DomainError('INVALID_READINESS_TERMINAL_FAILURE','Failure original changed');return {resolutionId:prior.id,additionalCalls:0};}
      store.command(projectId,{kind:'observe-readiness-terminal-failure',jobId:job.id,attemptId:attempt.id,failureWitness:witness,request,commandId:request.commandId,expectedRevision:request.expectedRevision},{actorType:'agent',actorId:'local-failure-observer',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
      const resolution=store.read(projectId).readinessResolutions.find(r=>r.kind==='local-terminal-failure-observed'&&r.jobId===job.id);
      return {resolutionId:resolution.id,additionalCalls:0};
    },
    async enqueueReadinessDiagnostic(projectId,resolutionId,{commandId,expectedRevision}={}){
      const p=store.read(projectId),plan=terminalDiagnosticPlan(p,resolutionId),{resolution,job,attempt}=terminalFailureResolution(p,resolutionId);
      const witness=await loadTerminalFailureWitness(root,projectId,job,attempt);
      if(!isDeepStrictEqual(witness,resolution.witness))throw new DomainError('INVALID_READINESS_TERMINAL_FAILURE','Failure original changed');
      if(!isDeepStrictEqual(bindings.readiness,plan.binding)||providers[plan.binding.providerId]?.reasoningEffort!=='low')throw new DomainError('DIAGNOSTIC_MITIGATION_REQUIRED','Current matching provider must explicitly use low reasoning');
      const existing=p.jobs.find(j=>j.id===plan.jobId);if(existing)return existing.id;
      await verifyOrdinaryProject(p,{executionRoot:root});await verifyAcquiredAncestry(p,[plan.artifactId]);await readArtifactContent(p,plan.artifactId,root);
      store.command(projectId,{kind:'request-readiness-diagnostic',resolutionId,failureWitness:witness,request:{resolutionId,commandId,expectedRevision},commandId:commandId??randomUUID(),expectedRevision:expectedRevision??p.revision},{actorType:'agent',actorId:'readiness-diagnostic-director',runId:randomUUID(),contextId:randomUUID()});return plan.jobId;
    },
    async readinessResolutionView(projectId,jobId,attemptId){
      const project=store.read(projectId),job=project.jobs.find(j=>j.id===jobId),attempt=job?.attempts.find(t=>t.id===attemptId);
      if(job?.purpose!=='readiness'||job.task.readinessInput.reviewProtocolVersion!==APPLICABILITY_PROTOCOL||job.status!=='awaiting_reconciliation'||attempt?.status!=='awaiting_reconciliation'||job.attempts.at(-1).id!==attemptId)throw new DomainError('INVALID_READINESS_RESOLUTION','Original uncertain V2 attempt required');
      const resolutions=(project.readinessResolutions??[]).filter(r=>r.jobId===jobId),recovered=resolutions.find(r=>r.kind==='recovered-result');
      const proof=await loadSavedReadinessProof(root,projectId,job,attempt);
      const choices=[...new Map(Object.values(bindings).filter(b=>b?.providerId&&b.model&&providers[b.providerId]?.model===b.model).map(b=>{const binding={providerId:b.providerId,model:b.model,role:bindings.readiness?.role??'readiness-lead'};return [JSON.stringify(binding),binding];})).values()];
      const proposals=[];
      if(!proof)for(const binding of choices){try{proposals.push(readinessReplacementProposal(project,jobId,attemptId,binding));}catch(error){if(!['READINESS_RESOLUTION_EXISTS','READINESS_CALL_LIMIT','STALE_ARTIFACT','STALE_RESEARCH_ASSESSMENT','INVALID_READINESS_INPUT'].includes(error.code))throw error;}}
      return {jobId,attemptId,revision:project.revision,targetArtifactId:job.targetArtifactId,targetContentHash:job.task.readinessInput.contentHash,binding:job.binding,originalReceipt:attempt.receipt??null,originalOutcome:'unknown',originalCost:attempt.receipt?.cost??null,savedEvidence:recovered?'recovered':proof?'available':'still_unknown',providerLookup:'unsupported',proposals,resolutions:resolutions.map(({proof,...r})=>r),trustBoundary:'Trusted local-human UI action; no host attestation. Agents must not submit permission for a human.'};
    },
    async resolveReadiness(projectId,request,humanDecision){
      const project=store.read(projectId),existing=(project.readinessResolutions??[]).find(r=>r.request?.commandId===request.commandId);
      if(existing){if(!isDeepStrictEqual(existing.request,request))throw new DomainError('COMMAND_ID_REUSED','Resolution command reused');if(existing.kind==='recovered-result'){const job=project.jobs.find(j=>j.id===existing.jobId),attempt=job?.attempts.find(a=>a.id===existing.attemptId);if(isOrdinaryHttp(existing.proof?.executionReceipt))await loadSavedReadinessProof(root,projectId,job,attempt);}return {kind:existing.kind==='recovered-result'?'recovered':'replacement-queued',resolutionId:existing.id,...(existing.reportId?{reportId:existing.reportId}:{jobId:existing.replacementJobId})};}
      if(Object.hasOwn(project.processedCommands,request.commandId))throw new DomainError('COMMAND_ID_REUSED','Command already used');
      if(project.revision!==request.expectedRevision)throw new DomainError('REVISION_CONFLICT','Project changed before resolution');
      const view=await runtime.readinessResolutionView(projectId,request.jobId,request.attemptId),job=project.jobs.find(j=>j.id===request.jobId),attempt=job.attempts.find(t=>t.id===request.attemptId);
      const context={actorId:'readiness-result-resolver',actorType:'agent',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()};
      if(request.action==='recover-saved'){
        const prior=(project.readinessResolutions??[]).find(r=>r.kind==='recovered-result'&&r.jobId===job.id);
        if(prior)return {kind:'recovered',resolutionId:prior.id,reportId:prior.reportId};
        const proof=await loadSavedReadinessProof(root,projectId,job,attempt);
        if(!proof)return {kind:'still_unknown',reason:'No corroborated completed saved response. Provider lookup is unsupported.',additionalCalls:0};
        const id=`readiness-recovery-${hash(JSON.stringify([projectId,job.id,attempt.id]))}`,reportId=`report-${id}`;
        const {normalized}=validateSavedReadinessProof(projectId,job,attempt,proof),payloadRef=await persistRecoveredReadiness(root,id,normalized);
        store.command(projectId,{kind:'recover-readiness',jobId:job.id,attemptId:attempt.id,resolutionId:id,reportId,payloadRef,proof,request,commandId:request.commandId,expectedRevision:request.expectedRevision},context);
        return {kind:'recovered',resolutionId:id,reportId};
      }
      if(request.action!=='authorize-one-replacement')throw new DomainError('INVALID_READINESS_RESOLUTION','Unknown resolution action');
      if(humanDecision?.actorType!=='human')throw new DomainError('HUMAN_REQUIRED','Direct trusted local-human action required');
      if(view.savedEvidence!=='still_unknown')throw new DomainError('READINESS_RESULT_AVAILABLE','Recover saved evidence before considering replacement');
      const proposal=view.proposals.find(p=>p.proposalId===request.proposalId);
      if(!proposal)throw new DomainError('STALE_READINESS_PROPOSAL','Redisplay exact configured proposal');
      store.command(projectId,{kind:'authorize-readiness-replacement',request,binding:proposal.binding,commandId:request.commandId,expectedRevision:request.expectedRevision},humanDecision);
      const resolution=store.read(projectId).readinessResolutions.find(r=>r.request?.commandId===request.commandId);
      return {kind:'replacement-queued',resolutionId:resolution.id,jobId:resolution.replacementJobId};
    },
    reconcile(projectId,jobId,options) {
      if(ACQUISITION_PURPOSES.includes(store.read(projectId).jobs.find(j=>j.id===jobId)?.purpose))return acquisition.reconcile(projectId,jobId,options);
      if(store.read(projectId).jobs.find(j=>j.id===jobId)?.purpose==='reference')return references.recoverReferenceResult(projectId,jobId,options);
      return reconcileStage({store,root,projectId,jobId,...options});
    },
    enqueue(projectId,stage,{sourceRecords=[],sourceEntryIds,commandId,expectedRevision,revisionInput,correctionInput,revisionRequest,revisionInputArtifacts,researchRevision,[acquisitionSelector]:acquisitionRef}={}) {
      const project=store.read(projectId);
      assertWorkflowStage(project,stage);
      const request=commandId===undefined?null:{commandId,expectedRevision,stage,sourceRecords:structuredClone(sourceRecords),...(sourceEntryIds?{sourceEntryIds:structuredClone(sourceEntryIds)}:{}),...(revisionInput?{revisionInput:structuredClone(revisionInput)}:{}),...(correctionInput?{correctionInput:structuredClone(correctionInput)}:{}),...(revisionRequest?{revisionRequest:structuredClone(revisionRequest)}:{}),...(researchRevision?{researchRevision:structuredClone(researchRevision)}:{}),...(revisionInputArtifacts?{revisionInputArtifacts:structuredClone(revisionInputArtifacts)}:{})};
      const jobId=request?`job-${hash(JSON.stringify([projectId,commandId]))}`:randomUUID();
      if(request) {
        const existing=project.jobs.find(job=>job.id===jobId);
        if(existing) {
          if(!isDeepStrictEqual(existing.task.request,request))throw new DomainError('COMMAND_ID_REUSED','Execution command ID belongs to another payload');
          return jobId;
        }
      }
      if(stage==='research')inputsFor(project,stage);
      if(acquisitionRef){if(stage!=='research'||sourceRecords.length||sourceEntryIds||revisionInput||correctionInput||researchRevision)throw new DomainError('ACQUISITION_SELECTOR_CONFLICT','Internal admission cannot mix caller catalogues or revisions');sourceRecords=structuredClone(resolveAcquisition(project,acquisitionRef).admission.sourceRecords);}
      const ancestralAcquisition=acquisitionRef??(stage==='research'&&(correctionInput||revisionInput)?project.jobs.find(j=>j.outputVersionIds?.includes((correctionInput??revisionInput).revisionOf?.artifactId??(correctionInput??revisionInput).baseArtifactId))?.task.researchDataBasis?.acquisition:null);
      const frozen=correctionInput?.protocolVersion===LATEST_CORRECTION_PROTOCOL;
      sourceRecords=acquisitionRef?sourceRecords:frozen?evidenceRecords(correctionInput.evidence):sourceEntryIds?structuredClone(sourceRecords):inheritedSources(project,stage,[...sourceRecords,...(stage==='research'?projectCaseEvidenceCatalogue(project):[])]);
      const visualCatalogue=frozen?evidenceVisualRecords(correctionInput.evidence):stageVisualCatalogue(project,stage,(STAGES[stage]??[]).map(dependency=>project.activeByStage[dependency]));
      const binding=bindings[stage]??{providerId:'unconfigured',model:'unconfigured',role:`${stage}-lead`};
      const context={actorId:'proposal-director',actorType:'agent',runId:randomUUID(),contextId:randomUUID()};
      const taskCard=project.taskCards?.find(card=>card.id===project.activeTaskCardId);
      const upstreamReviewConstraints=upstreamConstraints(project,stage);
      const acceptedCopyEdge=stage==='copy'&&(revisionInput||correctionInput)?(project.ownerEdges??[]).filter(e=>e.commit&&e.envelope.source.artifactId===project.activeByStage.strategy).at(-1):null;
      const questionRegistration=stage==='research'&&project.workflow?researchQuestionRegistration(project):null;
      const command={kind:'request-stage',stage,jobId,binding,task:{id:jobId,owner:binding.role,parentId:projectId,...(providers[binding.providerId]?.testOnly===true?{execution:{testOnly:true,scope:'synthetic-local-engineering'}}:{}),...(acceptedCopyEdge?{ownerEdgeId:acceptedCopyEdge.id,ownerEnvelopeHash:acceptedCopyEdge.envelope.envelopeHash}:{}),...(stage==='research'?{...(project.workflow?.version==='proposal-seven-v1'?{researchMethod:researchMethodIdentity(),...(questionRegistration?{researchQuestionRegistration:structuredClone(questionRegistration),researchQuestionRegistrationId:questionRegistration.id,researchQuestionRegistrationHash:questionRegistration.registrationHash}:{})}:{}),researchContractVersion:RESEARCH_DATA_VERSION,researchDataBasis:researchDataBasis({taskCard,confirmations:project.confirmations.filter(c=>c.taskCardId===taskCard.id),sourceRecords,...(ancestralAcquisition?{acquisition:ancestralAcquisition}:{})})}:{}),...(stage==='copy'?{copyContractVersion:COPY_CONTRACT_VERSION}:{}),...(stage==='strategy'?{strategyContractVersion:project.workflow?SIMPLE_STRATEGY_VERSION:STRATEGY_CONTRACT_VERSION,strategyBasis:strategyBasisFor(project,binding,{sourceRecords,visualCatalogue})}:{}),sourceRecords,visualCatalogue,upstreamReviewConstraints,...(revisionInput?{revisionInput:structuredClone(revisionInput)}:{}),...(correctionInput?{correctionInput:structuredClone(correctionInput)}:{}),...(revisionRequest?{revisionRequest:structuredClone(revisionRequest)}:{}),...(researchRevision?{researchRevision:structuredClone(researchRevision)}:{}),...(revisionInputArtifacts?{revisionInputArtifacts:structuredClone(revisionInputArtifacts)}:{}),...(taskCard?{taskCardId:taskCard.id,brief:taskCard.brief}:{}),...(request?{request}:{})}};
      if(request)store.command(projectId,{...command,commandId,expectedRevision},{...context,now:new Date().toISOString()});
      else send(projectId,command,context);
      return jobId;
    },
    async enqueueRevision(projectId,{artifactId,commandId,expectedRevision,supplementalSourceRecords,supplementalCaseSourceIds=[],supplementalVisualIds=[],supplementalCaptureIds=[],revisionMode}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),delta=admitSupplementalSources(supplementalSourceRecords??[]),normalized=delta.map(({verification,...source})=>source);
      for(const ids of [supplementalCaseSourceIds,supplementalVisualIds,supplementalCaptureIds])if(!Array.isArray(ids)||ids.length>200||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw new DomainError('INVALID_CORRECTION','Unique bounded registered evidence IDs required');
      if(revisionMode!==undefined&&revisionMode!==EVIDENCE_ENRICHMENT_MODE)throw new DomainError('INVALID_EVIDENCE_ENRICHMENT','Unknown evidence revision mode');
      const request={artifactId,commandId,expectedRevision,...(revisionMode?{revisionMode}:{}),...(normalized.length?{supplementalSourceRecords:normalized}:{}),...(supplementalCaseSourceIds.length?{supplementalCaseSourceIds}:{}),...(supplementalVisualIds.length?{supplementalVisualIds}:{}),...(supplementalCaptureIds.length?{supplementalCaptureIds}:{})};
      const existing=project.jobs.find(item=>item.id===`job-${hash(JSON.stringify([projectId,commandId]))}`);
      if(existing){if(!isDeepStrictEqual(existing.task.revisionRequest,request))throw new DomainError('COMMAND_ID_REUSED','Revision request ID reused');return existing.id;}
      const a=project.artifacts.find(item=>item.id===artifactId);
      if(!a||!['research','strategy','copy'].includes(a.stage))throw new DomainError('UNSUPPORTED_REVISION_STAGE','Text revisions support research, strategy and copy only');
      await verifyAcquiredAncestry(project,[artifactId]);
      const plan=revisionMode===EVIDENCE_ENRICHMENT_MODE?evidenceEnrichmentPlan(project,artifactId):revisionPlan(project,artifactId),base=await readArtifactContent(project,artifactId,root);
      const images=[];
      for(const imageId of [...new Set((plan.protocolVersion===CORRECTION_PROTOCOL?correctionFeedback(plan):plan.feedback).flatMap(item=>item.materials.map(material=>material.imageId)))]) {
        const asset=project.imageAssets.find(item=>item.id===imageId);
        images.push((await imageStore.read({projectId,imageId,expectedHash:asset.sha256})).descriptor);
      }
      if(plan.protocolVersion!==CORRECTION_PROTOCOL&&delta.length)throw new DomainError('INVALID_CORRECTION','Supplemental sources require an actionable machine-backed correction');
      const registered={sourceRecords:[],visualCatalogue:[],capturedText:[]};
      if(supplementalCaptureIds.length){
       if(a.stage!=='research'||plan.protocolVersion!==CORRECTION_PROTOCOL)throw new DomainError('INVALID_CORRECTION','Managed text additions require a typed research correction');
       for(const id of supplementalCaptureIds){const entry=capturedTextRecord(project,id);if((a.technicalReceipts?.sourceCatalogue?.records??[]).some(s=>s.id===entry.id))throw new DomainError('INVALID_CORRECTION','Captured text must be new to parent');registered.capturedText.push(entry);}
      }
      if(supplementalCaseSourceIds.length||supplementalVisualIds.length){
       if(a.stage!=='research'||plan.protocolVersion!==CORRECTION_PROTOCOL)throw new DomainError('INVALID_CORRECTION','Registered evidence additions require a typed research correction');
       for(const [ids,catalogue,base,key]of [[supplementalCaseSourceIds,projectCaseEvidenceCatalogue(project),a.technicalReceipts?.sourceCatalogue?.records??[],'sourceRecords'],[supplementalVisualIds,stageVisualCatalogue(project,'research'),a.technicalReceipts?.visualCatalogue??[],'visualCatalogue']])for(const id of ids){const entry=catalogue.find(item=>item.id===id);if(!entry||base.some(item=>item.id===id))throw new DomainError('INVALID_CORRECTION','Registered evidence must be current and new to the parent');registered[key].push(structuredClone(entry));}
      }
      const revisionInput={...plan,...(plan.protocolVersion===CORRECTION_PROTOCOL?{protocolVersion:LATEST_CORRECTION_PROTOCOL,taskCardSnapshot:structuredClone(project.taskCards.find(c=>c.id===plan.taskCardId)),evidence:createCorrectionEvidence(plan.revisionOf,a.technicalReceipts?.sourceCatalogue?.records??[],a.technicalReceipts?.visualCatalogue??[],delta,registered)}:{}),baseContent:base.content,materials:images.length?imageManifest(images):[]};
      if(plan.enrichment)revisionInput.enrichment={...plan.enrichment,evidenceManifestHash:revisionInput.evidence.manifestHash};
      await verifyRegistered(project,{task:{correctionInput:revisionInput}});
      const revisionInputArtifacts=await inputs(project,{inputVersionIds:(STAGES[a.stage]??[]).map(stage=>project.activeByStage[stage]),task:{upstreamReviewConstraints:upstreamConstraints(project,a.stage)}});
      const researchRevision=a.stage==='research'&&(project.readinessReports??[]).some(r=>r.artifactId===a.id&&r.protocolVersion===APPLICABILITY_PROTOCOL)?researchRevisionAuthority(project,a.id):undefined;
      return runtime.enqueue(projectId,a.stage,{researchRevision,sourceRecords:a.technicalReceipts?.sourceCatalogue?.records??[],commandId,expectedRevision,...(plan.protocolVersion===CORRECTION_PROTOCOL?{correctionInput:revisionInput}:{revisionInput}),revisionInputArtifacts,revisionRequest:request});
    },
    async enqueueCreativePanel(projectId,{artifactId,commandId,expectedRevision}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),request={artifactId,commandId,expectedRevision};
      const id=`creative-${hash(JSON.stringify([projectId,commandId]))}`;
      const priorCommand=project.processedCommands[commandId];if(priorCommand){const saved=JSON.parse(priorCommand);if(saved.kind==='resume-creative-panel'){if(!isDeepStrictEqual(saved.enqueueRequest,request))throw new DomainError('COMMAND_ID_REUSED','Resume request reused');return saved.panelId;}}
      const reused=(project.creativePanels??[]).find(p=>p.id===id);
      if(reused){if(!isDeepStrictEqual(reused.request,request))throw new DomainError('COMMAND_ID_REUSED','Panel command ID reused');return id;}
      if(project.revision!==expectedRevision)throw new DomainError('REVISION_CONFLICT','Project revision changed');
      const a=project.artifacts.find(x=>x.id===artifactId);
      if(!a||!['strategy','copy'].includes(a.stage))throw new DomainError('INVALID_CREATIVE_PANEL','Only strategy and copy text panels supported');
      const feedback=(project.humanFeedback??[]).filter(x=>x.stage===a.stage&&x.taskCardId===project.activeTaskCardId);
      const generation=(project.creativePanels??[]).find(p=>p.packet.artifactId===a.id&&p.packet.policyVersion===project.policies.at(-1).version&&p.packet.feedbackHash===feedbackHash(feedback)&&p.packet.protocolVersion===creativeProtocolFor(a.stage,a.copyContract?.version===COPY_CONTRACT_VERSION?COPY_CONTRACT_VERSION:undefined,a.strategyContract?.version));
      if(generation){const assignments=project.jobs.filter(j=>j.panelId===generation.id&&['failed','blocked'].includes(j.status)&&j.attempts.at(-1)?.dispatchStarted===false&&['PROVIDER_MISSING','MODEL_BINDING_MISMATCH'].includes(j.error?.code)).map(j=>({jobId:j.id,context:{...j.assignedContexts.at(-1),runId:randomUUID(),contextId:randomUUID()}}));
        store.command(projectId,{kind:'resume-creative-panel',panelId:generation.id,assignments,enqueueRequest:request,commandId,expectedRevision},{actorType:'agent',actorId:'creative-panel-coordinator',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});return generation.id;} 
      const {content}=await readArtifactContent(project,artifactId,root);
      const calibrations=[];
      for(const item of creativeCalibrations){
        if(!item||typeof item.evidenceRef!=='string'||!item.evidenceHash)throw new DomainError('INVALID_CALIBRATION','Calibration needs an actual evidence file');
        const path=await realpath(item.evidenceRef),base=await realpath(root);
        if(!path.startsWith(base+sep)||hash(await readFile(path))!==item.evidenceHash)throw new DomainError('INVALID_CALIBRATION','Calibration evidence hash/path mismatch');
        calibrations.push({...structuredClone(item),status:'verified'});
      }
      const packet={artifactId:a.id,contentHash:a.contentHash,stage:a.stage,...(a.strategyContract?{strategyContractVersion:a.strategyContract.version}:{}),...(a.copyContract?.version===COPY_CONTRACT_VERSION?{copyContractVersion:COPY_CONTRACT_VERSION}:{}),content,taskCard:structuredClone(project.taskCards.find(x=>x.id===project.activeTaskCardId)),policyVersion:project.policies.at(-1).version,feedbackHash:feedbackHash(feedback),sources:structuredClone(a.technicalReceipts?.sourceCatalogue?.records??[]),upstreamConstraints:upstreamConstraints(project,a.stage),independentEvidenceReviews:(project.verifications??[]).filter(r=>r.artifactId===a.id).map(r=>({id:r.id,...reviewContextReport(project,r),hasBlockingFindings:r.hasBlockingFindings}))};
      const plan=creativePlan(packet,bindings,calibrations);
      const panel={id,request,...plan,nodes:plan.nodes.map(node=>({...node,jobId:`creative-job-${hash(JSON.stringify([id,node.key]))}`,context:{actorType:'agent',actorId:`creative-worker:${randomUUID()}`,runId:randomUUID(),contextId:randomUUID(),parentRunIds:[],ancestorActorIds:[]}}))};
      store.command(projectId,{kind:'request-creative-panel',artifactId,panel,bindings:structuredClone(bindings),commandId,expectedRevision},
        {actorType:'agent',actorId:'creative-panel-coordinator',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
      return id;
    },
    advanceCreativePanels(projectId,{artifactId}={}) {
      const queued=[];
      for(const panel of (store.read(projectId).creativePanels??[]).filter(p=>!artifactId||p.packet.artifactId===artifactId))for(const node of panel.nodes){
        const p=store.read(projectId),existing=p.jobs.find(j=>j.id===node.jobId);
        if(existing){if(existing.status==='queued')queued.push(existing.id);continue;}
        if(!node.dependencies.every(key=>(p.creativeReports??[]).some(r=>r.panelId===panel.id&&r.nodeKey===key)))continue;
        try {send(projectId,{kind:'request-creative-node',panelId:panel.id,nodeKey:node.key},{actorType:'agent',actorId:'creative-panel-coordinator',runId:randomUUID(),contextId:randomUUID()});queued.push(node.jobId);}
        catch(error){if(!['STALE_CREATIVE_PANEL','STALE_ARTIFACT','DEPENDENCY_BLOCKED','AUTHORIZATION_ENDPOINT'].includes(error.code))throw error;}
      }
      return queued;
    },
    async enqueueCorrectionReview(projectId,{artifactId,commandId,expectedRevision,protocolVersion}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),request={artifactId,commandId,expectedRevision,...(protocolVersion?{protocolVersion}:{})};
      if(protocolVersion&&protocolVersion!==APPLICABILITY_HANDLING)throw new DomainError('INVALID_CORRECTION','Unknown handling protocol');
      const jobId=`job-${hash(JSON.stringify([projectId,commandId]))}`,existing=project.jobs.find(j=>j.id===jobId);
      if(existing){if(!isDeepStrictEqual(existing.task.enqueueRequest,request))throw new DomainError('COMMAND_ID_REUSED','Correction check request reused');return jobId;}
      const a=project.artifacts.find(x=>x.id===artifactId),producer=project.jobs.find(j=>j.outputVersionIds?.includes(artifactId)&&j.task?.correctionInput);
      if(!producer||!a?.revision)throw new DomainError('INVALID_CORRECTION','Typed revision required');
      const {content}=await readArtifactContent(project,artifactId,root);
      const complete=producer.task.correctionInput.protocolVersion===LATEST_CORRECTION_PROTOCOL;
      const input={reviewProtocolVersion:complete?COMPLETE_CORRECTION_REVIEW_PROTOCOL:LATEST_CORRECTION_REVIEW_PROTOCOL,artifactId,contentHash:a.contentHash,content,correctionInput:structuredClone(producer.task.correctionInput),responses:structuredClone(a.revisionResponses),...(complete?{context:correctionHandlingContext(project,a.id)}:{})};
      if(protocolVersion===APPLICABILITY_HANDLING)Object.assign(input,{reviewProtocolVersion:APPLICABILITY_HANDLING,assessment:validatedResearchAssessment(project,artifactId)});
      buildCorrectionReviewRequest(input);
      const binding=bindings.correction_review??bindings.feedback_review??{providerId:'unconfigured',model:'unconfigured',role:'correction-reviewer'};
      store.command(projectId,{kind:'request-correction-review',artifactId,jobId,binding,task:{id:jobId,parentId:projectId,owner:binding.role,correctionReviewInput:input,enqueueRequest:request},commandId,expectedRevision},
        {actorType:'agent',actorId:'correction-review-director',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});return jobId;
    },
    async enqueueFeedbackReview(projectId,{artifactId,commandId,expectedRevision}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),request={artifactId,commandId,expectedRevision};
      const jobId=`job-${hash(JSON.stringify([projectId,commandId]))}`,existing=project.jobs.find(item=>item.id===jobId);
      if(existing){if(!isDeepStrictEqual(existing.task.enqueueRequest,request))throw new DomainError('COMMAND_ID_REUSED','Feedback review request ID reused');return jobId;}
      if(project.artifacts.find(a=>a.id===artifactId)?.revision&&[CORRECTION_PROTOCOL,LATEST_CORRECTION_PROTOCOL].includes(project.artifacts.find(a=>a.id===artifactId).revision.protocolVersion))return runtime.enqueueCorrectionReview(projectId,request);
      const a=project.artifacts.find(item=>item.id===artifactId),producer=project.jobs.find(item=>item.outputVersionIds?.includes(artifactId)&&item.task?.revisionInput);
      if(!a?.revision||!producer)throw new DomainError('INVALID_FEEDBACK_REVIEW','A generated revision is required');
      const {content}=await readArtifactContent(project,artifactId,root);
      const input={artifactId,contentHash:a.contentHash,content,revisionInput:structuredClone(producer.task.revisionInput),responses:structuredClone(a.feedbackResponses)};
      buildFeedbackReviewRequest(input);
      const binding=bindings.feedback_review??{providerId:'unconfigured',model:'unconfigured',role:'feedback-reviewer'};
      store.command(projectId,{kind:'request-feedback-review',artifactId,jobId,binding,task:{id:jobId,parentId:projectId,owner:binding.role,feedbackReviewInput:input,enqueueRequest:request},commandId,expectedRevision},
        {actorType:'agent',actorId:'feedback-review-director',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
      return jobId;
    },
    async enqueueCaseIdentity(projectId,{captureId,sourceImageUrl,referenceImageId,commandId,expectedRevision}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),request={captureId,sourceImageUrl,referenceImageId,commandId,expectedRevision};
      const jobId=`job-${hash(JSON.stringify([projectId,commandId]))}`,existing=project.jobs.find(job=>job.id===jobId);
      if(existing){if(!isDeepStrictEqual(existing.task.enqueueRequest,request))throw new DomainError('COMMAND_ID_REUSED','Identity request ID reused');return jobId;}
      if(!project.confirmations.some(item=>item.taskCardId===project.activeTaskCardId))throw new DomainError('INVALID_CASE_IDENTITY','Confirm the current task card before identity review');
      const page=project.sourceCaptures?.find(item=>item.id===captureId),reference=project.imageAssets?.find(item=>item.id===referenceImageId);
      if(!page||!reference||!page.record.extraction.images.some(image=>image.url===sourceImageUrl))throw new DomainError('INVALID_CASE_IDENTITY','Select a registered capture, exact embedded image URL and project reference image');
      const checkedPage=await readManagedCapture(join(root,'source-captures'),page);
      const captureCommandId=`${commandId}-source-image`;
      const prior=project.jobs.find(job=>job.task.enqueueRequest?.commandId===captureCommandId);
      if(!prior&&project.revision!==expectedRevision)throw new DomainError('REVISION_CONFLICT','Project revision changed');
      const captureJobId=prior?.id??runtime.enqueueSourceCapture(projectId,{url:sourceImageUrl,commandId:captureCommandId,expectedRevision});
      if(store.read(projectId).jobs.find(job=>job.id===captureJobId).status!=='succeeded')await runtime.execute(projectId,captureJobId,{retry:!!prior});
      const capturedJob=store.read(projectId).jobs.find(job=>job.id===captureJobId);
      if(capturedJob.status!=='succeeded')throw new DomainError('SOURCE_IMAGE_CAPTURE_FAILED','Selected image could not be acquired as a supported public PNG/JPEG');
      const sourceCapture=store.read(projectId).sourceCaptures.find(item=>item.id===capturedJob.outputVersionIds[0]);
      const checkedImage=await readManagedCapture(join(root,'source-captures'),sourceCapture);
      if(!['image/png','image/jpeg'].includes(checkedImage.record.mimeType))throw new DomainError('INVALID_CASE_IDENTITY','Only captured PNG/JPEG images are supported');
      let asset;
      try { asset=await imageStore.ingest({projectId,bytes:checkedImage.raw,metadata:{representation:'supplied_image',sourcePageUrl:checkedPage.record.finalUrl,sourceImageUrl,capturedAt:checkedImage.record.retrievedAt}}); }
      catch { throw new DomainError('INVALID_CASE_IDENTITY','Selected embedded image is not a supported complete PNG/JPEG within image limits'); }
      const context={actorType:'agent',actorId:'case-identity-director',runId:randomUUID(),contextId:randomUUID()};
      send(projectId,{kind:'register-image',asset},context);
      const referenceImage=(await imageStore.read({projectId,imageId:reference.id,expectedHash:reference.sha256})).descriptor;
      const sourceImage={...(await imageStore.read({projectId,imageId:asset.id,expectedHash:asset.sha256})).descriptor,sourceImageUrl};
      const current=store.read(projectId),taskCard=current.taskCards.find(card=>card.id===current.activeTaskCardId);
      const input={taskCard,pageCapture:{record:checkedPage.record,recordHash:checkedPage.recordHash},sourceImageCapture:{record:checkedImage.record,recordHash:checkedImage.recordHash},referenceImage,sourceImage};
      buildCaseIdentityRequest(input);
      const binding=bindings.case_identity??{providerId:'unconfigured',model:'unconfigured',role:'case-identity-reviewer'};
      send(projectId,{kind:'request-case-identity',jobId,binding,task:{id:jobId,parentId:projectId,owner:binding.role,caseIdentityInput:input,enqueueRequest:request}},context);
      return jobId;
    },
    enqueueSourceCapture(projectId,{url,commandId,expectedRevision}) {
      const project=store.read(projectId),request={url,commandId,expectedRevision};
      const jobId=`job-${hash(JSON.stringify([projectId,commandId]))}`,existing=project.jobs.find(job=>job.id===jobId);
      if(existing){if(!isDeepStrictEqual(existing.task.enqueueRequest,request))throw new DomainError('COMMAND_ID_REUSED','Capture request ID reused');return jobId;}
      store.command(projectId,{kind:'request-source-capture',jobId,task:{id:jobId,parentId:projectId,owner:'source-acquisition',url,enqueueRequest:request},commandId,expectedRevision},
        {actorType:'agent',actorId:'source-acquisition-director',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
      return jobId;
    },
    async enqueueObservation(projectId,{imageIds,commandId,expectedRevision}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),request={purpose:'observation',imageIds:structuredClone(imageIds),commandId,expectedRevision};
      const jobId=`job-${hash(JSON.stringify([projectId,commandId]))}`;
      const existing=project.jobs.find(job=>job.id===jobId);
      if(existing){if(!isDeepStrictEqual(existing.task.enqueueRequest,request))throw new DomainError('COMMAND_ID_REUSED','Observation request ID reused');return jobId;}
      const images=[];
      for(const imageId of imageIds){
        const asset=(project.imageAssets??[]).find(item=>item.id===imageId);
        if(!asset)throw new DomainError('INVALID_OBSERVATION_INPUT','Image is not registered in this project');
        images.push((await imageStore.read({projectId,imageId,expectedHash:asset.sha256})).descriptor);
      }
      const manifest=imageManifest(images),taskCard=project.taskCards.find(card=>card.id===project.activeTaskCardId);
      const binding=bindings.observation??{providerId:'unconfigured',model:'unconfigured',role:'image-observer'};
      store.command(projectId,{kind:'request-observation',jobId,binding,task:{id:jobId,parentId:projectId,owner:binding.role,brief:taskCard.brief,observationInput:{taskCard,images:manifest},enqueueRequest:request},commandId,expectedRevision},
        {actorId:'proposal-director',actorType:'agent',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
      return jobId;
    },
    async enqueueObservationReview(projectId,{observationId,commandId,expectedRevision}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),request={purpose:'observation_review',observationId,commandId,expectedRevision};
      const jobId=`job-${hash(JSON.stringify([projectId,commandId]))}`,existing=project.jobs.find(job=>job.id===jobId);
      if(existing){if(!isDeepStrictEqual(existing.task.enqueueRequest,request))throw new DomainError('COMMAND_ID_REUSED','Observation review request ID reused');return jobId;}
      const observation=(project.imageObservations??[]).find(item=>item.id===observationId);
      if(!observation)throw new DomainError('INVALID_OBSERVATION_INPUT','Registered project observation required');
      for(const image of observation.images)await imageStore.read({projectId,imageId:image.imageId,expectedHash:image.sha256});
      const input={observationId,contentHash:observation.reportHash,taskCard:observation.taskCard,images:observation.images,rawReport:observation.rawReport};
      const binding=bindings.observation_review??{providerId:'unconfigured',model:'unconfigured',role:'image-observation-reviewer'};
      store.command(projectId,{kind:'request-observation-review',observationId,jobId,binding,task:{id:jobId,parentId:projectId,owner:binding.role,
        observationReviewInput:input,enqueueRequest:request},commandId,expectedRevision},
        {actorId:'proposal-director',actorType:'agent',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
      return jobId;
    },
    async enqueueVerification(projectId,artifactId,{commandId,expectedRevision}={}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),request={purpose:'verification',artifactId,commandId,expectedRevision};
      const jobId=commandId?`job-${hash(JSON.stringify([projectId,commandId]))}`:randomUUID();
      const existing=project.jobs.find(job=>job.id===jobId);
      if(existing){if(!isDeepStrictEqual(existing.task.request,request))throw new DomainError('COMMAND_ID_REUSED','Verification request ID reused');return jobId;}
      await verifyAcquiredAncestry(project,[artifactId]);
      const loaded=await readArtifactContent(project,artifactId,root);
      const artifact=project.artifacts.find(a=>a.id===artifactId),taskCard=project.taskCards.find(c=>c.id===project.activeTaskCardId);
      const ownerProducer=project.jobs.find(j=>j.outputVersionIds?.includes(artifactId)&&(j.task?.ownerEdgeId||researchReviewConstraints(j.task)));
      const researchProducer=project.jobs.find(j=>j.outputVersionIds?.includes(artifactId));
      const verificationInput={...(researchProducer?.task?.researchDataBasis?{researchDataBasis:structuredClone(researchProducer.task.researchDataBasis)}:{}),...(ownerProducer?{ownerConstraints:structuredClone(ownerProducer.task.upstreamReviewConstraints)}:{}),reviewProtocolVersion:NUMERICAL_REVIEW_PROTOCOL,catalogueState:projectCatalogueState(project,artifact),artifactId,contentHash:artifact.contentHash,content:artifact.strategyContract?.version===SIMPLE_STRATEGY_VERSION?{...loaded.content,claims:[]}:loaded.content,taskCard,taskCardConfirmed:project.confirmations.some(c=>c.taskCardId===taskCard.id),sourceRecords:artifact.technicalReceipts?.sourceCatalogue?.records??[],visualCatalogue:artifact.technicalReceipts?.visualCatalogue??[]};
      const binding=bindings.verification??{providerId:'unconfigured',model:'unconfigured',role:'evidence-reviewer'};
      const context={actorId:'proposal-director',actorType:'agent',runId:randomUUID(),contextId:randomUUID()};
      store.command(projectId,{kind:'request-verification',artifactId,jobId,binding,task:{id:jobId,owner:binding.role,parentId:projectId,verificationInput,request},commandId:commandId??randomUUID(),expectedRevision:expectedRevision??project.revision},context);
      return jobId;
    },
    async enqueueResearchReader(projectId,artifactId,{registrationId,seat=0,previousReportId,dispositionId,commandId,expectedRevision}={}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const p=store.read(projectId),request={artifactId,registrationId,seat,...(previousReportId?{previousReportId}:{}),...(dispositionId?{dispositionId}:{}),commandId,expectedRevision};
      const jobId=`reader-${hash(JSON.stringify([projectId,commandId]))}`,existing=p.jobs.find(j=>j.id===jobId);
      if(existing){if(existing.purpose!=='research_reader'||!isDeepStrictEqual(existing.task.request,request))throw new DomainError('COMMAND_ID_REUSED','Reader request identity changed');return jobId;}
      const registration=researchQuestionRegistration(p);
      if(!registration||registration.id!==registrationId)throw new DomainError('RESEARCH_QUESTIONS_REQUIRED','Use the current preregistered question plan');
      await verifyAcquiredAncestry(p,[artifactId]);
      const loaded=await readArtifactContent(p,artifactId,root),a=p.artifacts.find(a=>a.id===artifactId),card=p.taskCards.find(c=>c.id===p.activeTaskCardId);
      let previous=null;
      if(previousReportId||dispositionId){
        if(!previousReportId||!dispositionId)throw new DomainError('READER_RECHECK_REQUIRED','Recheck needs both original report and saved dispositions');
        const old=researchReaderReport(p,previousReportId),disposition=(p.researchReaderDispositions??[]).find(d=>d.id===dispositionId);
        if(!disposition)throw new DomainError('STALE_READER_DISPOSITION','Saved reader dispositions required');
        await verifyResearchReaderOriginal(p,old.report,{executionRoot:root});
        previous={packet:old.packet,rawReport:old.report.rawReport,dispositions:disposition.dispositions};
      }
      const readerInput=buildResearchReaderPacket({taskCard:{id:card.id,purpose:card.brief},artifactId,contentHash:a.contentHash,contentText:loaded.contentText,method:registration.method,questionRegistration:{id:registration.id,taskCardId:registration.taskCardId,questions:registration.questions},visibleReport:projectResearchReaderReport(loaded.contentText),phase:previous?'recheck':'first_read',previous});
      const binding=bindings.reader;
      if(!binding||providers[binding.providerId]?.model!==binding.model)throw new DomainError('RESEARCH_READER_UNCONFIGURED','Configure the independent reader before enqueueing');
      store.command(projectId,{kind:'request-research-reader',artifactId,registrationId,seat,jobId,binding,task:{id:jobId,owner:binding.role,parentId:projectId,...(providers[binding.providerId]?.testOnly===true?{execution:{testOnly:true,scope:'synthetic-local-engineering'}}:{}),readerInput,readerContentText:loaded.contentText,...(previousReportId?{readerPreviousReportId:previousReportId,readerDispositionId:dispositionId}:{}),request},commandId,expectedRevision},{actorType:'agent',actorId:'proposal-director',runId:randomUUID(),contextId:randomUUID()});
      return jobId;
    },
    async recordResearchReaderDispositions(projectId,request,requester) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const p=store.read(projectId);
      if(Object.hasOwn(p.processedCommands,request.commandId)){
        const prior=JSON.parse(p.processedCommands[request.commandId]);
        if(prior.kind!=='record-research-reader-dispositions'||!isDeepStrictEqual(prior.request,request))throw new DomainError('COMMAND_ID_REUSED','Reader disposition request changed');
        return {dispositionId:prior.dispositionId};
      }
      const old=researchReaderReport(p,request.previousReportId);await verifyResearchReaderOriginal(p,old.report,{executionRoot:root});
      const current=p.artifacts.find(a=>a.id===request.artifactId);
      if(!current)throw new DomainError('NOT_FOUND','Revised research required');
      const loaded=await readArtifactContent(p,current.id,root);await verifyResearchOriginal(p,current);
      const registration=researchQuestionRegistration(p),card=p.taskCards.find(c=>c.id===p.activeTaskCardId);
      if(!registration)throw new DomainError('RESEARCH_QUESTIONS_REQUIRED','Current question plan required');
      try{buildResearchReaderPacket({taskCard:{id:card.id,purpose:card.brief},artifactId:current.id,contentHash:current.contentHash,contentText:loaded.contentText,method:registration.method,questionRegistration:{id:registration.id,taskCardId:registration.taskCardId,questions:registration.questions},visibleReport:projectResearchReaderReport(loaded.contentText),phase:'recheck',previous:{packet:old.packet,rawReport:old.report.rawReport,dispositions:request.dispositions}});}catch(error){throw new DomainError('INVALID_READER_DISPOSITION',error.message);}

      const dispositionId=`reader-dispositions-${hash(JSON.stringify([projectId,request.commandId]))}`;
      store.command(projectId,{kind:'record-research-reader-dispositions',artifactId:request.artifactId,previousReportId:request.previousReportId,dispositionId,dispositions:request.dispositions,request:structuredClone(request),requester:structuredClone(requester),commandId:request.commandId,expectedRevision:request.expectedRevision},{actorType:'agent',actorId:'research-owner-disposition-recorder',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
      return {dispositionId};
    },
    async reconcileResearchReader(projectId,jobId,{commandId,expectedRevision}={}) {
      let p=store.read(projectId),job=p.jobs.find(j=>j.id===jobId),attempt=job?.attempts.at(-1);
      if(job?.purpose!=='research_reader')throw new DomainError('RESEARCH_READER_REQUIRED','Reader job required');
      const recoveryRequest={jobId,commandId,expectedRevision};
      if(Object.hasOwn(p.processedCommands,commandId)){const prior=JSON.parse(p.processedCommands[commandId]);if(prior.kind!=='recover-research-reader'||!isDeepStrictEqual(prior.recoveryRequest,recoveryRequest))throw new DomainError('COMMAND_ID_REUSED','Reader recovery request changed');await verifyOrdinaryProject(p,{executionRoot:root});return job;}
      if(p.revision!==expectedRevision)throw new DomainError('REVISION_CONFLICT','Project changed before reader reconciliation');
      const artifact=researchReaderTarget(p,job,{historical:true});
      await verifyResearchDataOriginal(p,artifact,{executionRoot:root});
      const loaded=await readArtifactContent(p,artifact.id,root);
      if(loaded.contentText!==job.task.readerContentText)throw new DomainError('INVALID_READER_SOURCE','Saved reader source bytes changed');
      if(job.task.readerPreviousReportId)await verifyResearchReaderOriginal(p,researchReaderReport(p,job.task.readerPreviousReportId).report,{executionRoot:root});
      if(job.status!=='awaiting_reconciliation'||!attempt?.httpAttemptLocator)throw new DomainError('READER_RECOVERY_REQUIRED','Reconcile an original saved HTTP attempt; never dispatch a replacement');
      const receipt=await restoreOrdinaryJob(store,root,projectId,jobId,{imageStore});
      p=store.read(projectId);job=p.jobs.find(j=>j.id===jobId);attempt=job.attempts.at(-1);
      const parsed=JSON.parse(receipt.responseText),report=validateResearchReaderOutput(parsed,job.task.readerInput),raw=JSON.stringify(report,null,2),file=join(root,attempt.id,'research-reader.json');
      try{await writeFile(file,raw,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(!(await readManagedLayoutBytes(root,file,1024*1024)).equals(Buffer.from(raw)))throw new DomainError('INVALID_READER_REPORT','Saved normalized reader result changed');}
      const completion={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
      await reopenOrdinaryCompletion(p,job,attempt,{executionRoot:root,receipt:completion,wrappers:[[file,raw]]});
      store.command(projectId,{kind:'recover-research-reader',jobId,attemptId:attempt.id,reportId:`reader-report-${attempt.id}`,rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:completion,recoveryRequest,commandId,expectedRevision:p.revision}, {...attempt.executor,now:new Date().toISOString()});
      return store.read(projectId).jobs.find(j=>j.id===jobId);
    },
    async enqueueSemanticChallenge(projectId,artifactId,{commandId,expectedRevision}={}) {
      store.requireSemanticLease(semanticLease);
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId);await verifyAcquiredAncestry(project,[artifactId]);await readArtifactContent(project,artifactId,root);
      const input=semanticChallengeInput(project,artifactId),binding=input.configuration.challengeBinding;
      if(!isDeepStrictEqual(bindings.readiness,input.configuration.readinessBinding)||!isDeepStrictEqual(bindings.semantic,binding))throw new DomainError('SEMANTIC_CONFIGURATION_CHANGED','Executor reviewer configuration differs');
      const request={artifactId,commandId,expectedRevision},jobId=commandId?`semantic-${hash(JSON.stringify([projectId,commandId]))}`:randomUUID();
      const existing=project.jobs.find(j=>j.id===jobId);if(existing){if(!isDeepStrictEqual(existing.task.request,request))throw new DomainError('COMMAND_ID_REUSED','Semantic request changed');return jobId;}
      store.command(projectId,{kind:'request-coverage-challenge',artifactId,jobId,binding,task:{id:jobId,owner:binding.role,parentId:projectId,semanticInput:input,request},commandId:commandId??randomUUID(),expectedRevision:expectedRevision??project.revision},{actorId:'proposal-director',actorType:'agent',runId:randomUUID(),contextId:randomUUID()},semanticLease);
      return jobId;
    },
    async enqueueReadiness(projectId,artifactId,{commandId,expectedRevision,protocolVersion}={}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const splitReadiness=readinessSplitConfiguration?{version:'split-readiness-execution-v1',allowance:splitAllowance(readinessSplitConfiguration)}:undefined;
      const project=store.read(projectId),request={purpose:'readiness',artifactId,commandId,expectedRevision,...(protocolVersion?{protocolVersion}:{}),...(splitReadiness?{splitReadiness}:{})};
      if(protocolVersion&&protocolVersion!==APPLICABILITY_PROTOCOL)throw new DomainError('INVALID_RESEARCH_APPLICABILITY','Unknown readiness protocol');
      let jobId=commandId?`job-${hash(JSON.stringify([projectId,commandId]))}`:randomUUID();
      const alias=Object.values(project.processedCommands).map(value=>JSON.parse(value)).find(c=>c.kind==='reuse-readiness-generation'&&c.commandId===commandId);
      if(alias){if(!isDeepStrictEqual(alias.request,request))throw new DomainError('COMMAND_ID_REUSED','Readiness request ID reused');return alias.jobId;}
      const existing=project.jobs.find(job=>job.id===jobId||commandId&&job.task?.request?.commandId===commandId);
      if(existing){if(!isDeepStrictEqual(existing.task.request,request))throw new DomainError('COMMAND_ID_REUSED','Readiness request ID reused');return existing.id;}
      await verifyAcquiredAncestry(project,[artifactId]);
      const loaded=await readArtifactContent(project,artifactId,root);
      const artifact=project.artifacts.find(a=>a.id===artifactId),taskCard=project.taskCards.find(c=>c.id===project.activeTaskCardId);
      const contentText=loaded.contentText;
      const researchProducer=project.jobs.find(j=>j.outputVersionIds?.includes(artifactId));
      const readinessInput={...(providers[bindings.readiness?.providerId]?.evidenceSelectionProtocol?{evidenceSelectionProtocol:providers[bindings.readiness.providerId].evidenceSelectionProtocol}:{}),evidenceLinkPolicy:RESEARCH_EVIDENCE_LINK_POLICY,...(researchProducer?.task?.researchDataBasis?.acquisition?{researchDataBasis:structuredClone(researchProducer.task.researchDataBasis)}:{}),visualAssessmentScope:'adopted-v1',artifactId,contentHash:artifact.contentHash,contentText,content:loaded.content,taskCard,taskCardConfirmed:project.confirmations.some(c=>c.taskCardId===taskCard.id),sourceRecords:artifact.technicalReceipts?.sourceCatalogue?.records??[],visualCatalogue:artifact.technicalReceipts?.visualCatalogue??[]};
      const assessmentBinding=bindings.readiness??{providerId:'unconfigured',model:'unconfigured',role:'research-readiness-reviewer'};
      if(protocolVersion===APPLICABILITY_PROTOCOL)Object.assign(readinessInput,{reviewProtocolVersion:APPLICABILITY_PROTOCOL,applicability:researchAssessmentContext(project,artifactId,assessmentBinding)});
      buildResearchReadinessRequest(readinessInput);if(splitReadiness)buildSplitPlan(readinessInput);
      if(protocolVersion===APPLICABILITY_PROTOCOL){
        jobId=`research-assessment-${hash(JSON.stringify([projectId,artifactId,artifact.contentHash,readinessInput.applicability.generationHash,RESEARCH_EVIDENCE_LINK_POLICY,...(splitReadiness?[splitReadiness]:[]),...(readinessInput.evidenceSelectionProtocol?[readinessInput.evidenceSelectionProtocol]:[])]))}`;
        if(project.jobs.some(j=>j.id===jobId)){store.command(projectId,{kind:'reuse-readiness-generation',jobId,request,commandId,expectedRevision},{actorType:'agent',actorId:'proposal-director',runId:randomUUID(),contextId:randomUUID()});return jobId;}
      }
      const binding=bindings.readiness??{providerId:'unconfigured',model:'unconfigured',role:'research-readiness-reviewer'};
      const context={actorId:'proposal-director',actorType:'agent',runId:randomUUID(),contextId:randomUUID()};
      store.command(projectId,{kind:'request-readiness',artifactId,jobId,binding,task:{id:jobId,owner:binding.role,parentId:projectId,readinessInput,request,...(splitReadiness?{splitReadiness}:{})},commandId:commandId??randomUUID(),expectedRevision:expectedRevision??project.revision},context);
      return jobId;
    },
    async enqueueHandoff(projectId,artifactId,side,{commandId,expectedRevision,protocolVersion}={}) {
      await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
      const project=store.read(projectId),request={purpose:'handoff',artifactId,side,commandId,expectedRevision,...(protocolVersion?{protocolVersion}:{})};
      if(protocolVersion&&protocolVersion!==APPLICABILITY_HANDOFF_PROTOCOL)throw new DomainError('INVALID_RESEARCH_HANDOFF','Unknown handoff protocol');
      const jobId=commandId?`job-${hash(JSON.stringify([projectId,commandId]))}`:randomUUID();
      const existing=project.jobs.find(job=>job.id===jobId);
      if(existing){if(!isDeepStrictEqual(existing.task.request,request))throw new DomainError('COMMAND_ID_REUSED','Handoff request ID reused');return jobId;}
      await verifyAcquiredAncestry(project,[artifactId]);
      const loaded=await readArtifactContent(project,artifactId,root);
      const artifact=project.artifacts.find(a=>a.id===artifactId),taskCard=project.taskCards.find(c=>c.id===project.activeTaskCardId);
      const producerJob=project.jobs.find(j=>j.outputVersionIds?.includes(artifactId)&&(!j.purpose||j.purpose==='stage'));
      const binding=side==='producer'?producerJob?.binding:bindings.strategy;
      if(!binding)throw new DomainError('PROVIDER_MISSING','Handoff owner has no configured provider');
      const producerReport=side==='consumer'?(project.handoffReports??[]).filter(r=>r.artifactId===artifactId&&r.side==='producer'&&r.decision==='accept').at(-1)?.rawReport:null;
      const handoffInput={...(producerJob?.task?.researchDataBasis?{researchDataBasis:structuredClone(producerJob.task.researchDataBasis)}:{}),...(project.verifications.some(r=>r.artifactId===artifactId&&evidenceProtocolCapabilities(r.rawReport.protocolVersion).catalogueState)?{catalogueState:projectCatalogueState(project,artifact)}:{}),artifactId,contentHash:artifact.contentHash,contentText:loaded.contentText,content:loaded.content,taskCard,taskCardConfirmed:project.confirmations.some(c=>c.taskCardId===taskCard.id),sourceRecords:artifact.technicalReceipts?.sourceCatalogue?.records??[],visualCatalogue:artifact.technicalReceipts?.visualCatalogue??[],side,targetStage:'strategy',ownerBinding:binding,verificationReports:project.verifications.filter(r=>r.artifactId===artifactId).map(r=>r.rawReport),readinessReports:(project.readinessReports??[]).filter(r=>r.artifactId===artifactId).map(r=>r.rawReport),producerReport};
      if(protocolVersion===APPLICABILITY_HANDOFF_PROTOCOL)Object.assign(handoffInput,{handoffProtocolVersion:APPLICABILITY_HANDOFF_PROTOCOL,assessment:validatedResearchAssessment(project,artifactId),effectiveHandlingBlocked:researchHandlingBlocked(project,artifactId)});
      if(project.workflow){await verifyCurrentResearchReaders(project,{executionRoot:root,artifactId});handoffInput.readerEvidence=researchReaderEvidence(project,artifactId);}
      buildResearchHandoffRequest(handoffInput);
      const context={actorId:'proposal-director',actorType:'agent',runId:randomUUID(),contextId:randomUUID()};
      store.command(projectId,{kind:'request-handoff',artifactId,side,jobId,binding,task:{id:jobId,owner:binding.role,parentId:projectId,handoffInput,request},commandId:commandId??randomUUID(),expectedRevision:expectedRevision??project.revision},context);
      return jobId;
    },
    async execute(projectId,jobId,{retry=false,acquisitionAdmission,simpleStrategyAdmission,copyHttpAdmission}={}) {
      const admission=store.read(projectId),isReference=admission.jobs.find(j=>j.id===jobId)?.purpose==='reference';
      if(!isReference)await verifyOrdinaryProject(admission,{executionRoot:root});
      const project=isReference?admission:store.read(projectId),job=project.jobs.find(item=>item.id===jobId);
      if(!job)throw new Error('Job not found');
      if(job.purpose==='research_reader'&&retry)throw new DomainError('RESEARCH_READER_RETRY_CLOSED','Reconcile the saved reader attempt; never retry an unknown call');
      if(ACQUISITION_PURPOSES.includes(job.purpose))return acquisition.execute(projectId,jobId,{retry,admission:acquisitionAdmission});
      if(job.task?.researchDataBasis?.acquisition){try{await acquisition.verifyProducer(projectId,job.task.researchDataBasis.acquisition);}catch(error){if(job.status!=='queued')throw error;send(projectId,{kind:'block-queued-job',jobId,error:{code:error.code??'ACQUISITION_ORIGINAL_INVALID',message:error.message}},{actorType:'agent',actorId:'research-acquisition-original-admission',runId:randomUUID(),contextId:randomUUID()});return store.read(projectId).jobs.find(j=>j.id===jobId);}}
      if(INTAKE_PURPOSES.includes(job.purpose))return intake.execute(projectId,jobId,{retry});
      try{await intake.verifyCard(projectId);}catch(error){if(job.status!=='queued')throw error;send(projectId,{kind:'block-queued-job',jobId,error:{code:error.code??'DOCUMENT_CORRUPT',message:error.message}},{actorType:'agent',actorId:'intake-original-admission',runId:randomUUID(),contextId:randomUUID()});return store.read(projectId).jobs.find(j=>j.id===jobId);}
      if(job.purpose===LAYOUT_PURPOSE){if(retry)throw new DomainError('LAYOUT_RETRY_CLOSED','Native attempts cannot use generic retry');return layouts.execute(projectId,jobId);}
      if(job.purpose==='final_review_call'){if(retry)throw new DomainError('FINAL_RETRY_CLOSED','Unknown final calls reconcile their original attempt');return requireFinalBusiness().reconcile(projectId,jobId);}
      if(job.stage==='final_review')throw new DomainError('FINAL_CONTINUATION_REQUIRED','Use final-review continuation to execute the owned final graph');
      if(job.stage==='layout')throw new DomainError('LAYOUT_EXECUTION_UNAVAILABLE','Dedicated native layout execution required');
      if(CONTENT_PURPOSES.includes(job.purpose))return completeContent.execute(projectId,jobId);
      if(FINAL_VISUAL_PURPOSES.includes(job.purpose))return finalVisuals.execute(projectId,jobId);
      if(REVIEW_PURPOSES.includes(job.purpose))return sketchReviews.execute(projectId,jobId);
      if(SKETCH_PURPOSES.includes(job.purpose))return sketches.execute(projectId,jobId);
      if(job.purpose==='reference')return references.execute(projectId,jobId,{retry});
      if(job.purpose==='readiness'&&job.task.splitReadiness)return executeSplitReadiness({store,projectId,jobId,root,providers,send,checkCurrent:async current=>{await inputs(store.read(projectId),current);await verifyRegistered(store.read(projectId),current);}});
      const sourceRecords=job.task.sourceRecords??[];
      const planned=job.purpose==='creative_review'?(job.assignedContexts?.at(-1)??project.creativePanels.find(p=>p.id===job.panelId)?.nodes.find(n=>n.key===job.nodeKey)?.context):null;
      const attemptId=planned?.runId??randomUUID(),context={...(planned??{actorId:`worker:${attemptId}`,actorType:'agent',runId:attemptId,contextId:randomUUID()}),executorHost:hostname(),executorPid:process.pid};
      try {
        if (retry ? ['failed', 'blocked'].includes(job.status) : job.status === 'queued') {
          const intent = continuationIntents(project).find(command => {
            const key = hash(JSON.stringify([projectId, command.artifactId, command.continuation.request.policyVersion, 'research-to-strategy']));
            return jobId === `job-${hash(JSON.stringify([projectId, `continuation-job-${key}`]))}`;
          });
          if (intent) {
            checkContinuation(project, intent.continuation.request, intent.continuation.binding);
            if (!isDeepStrictEqual(job.binding, intent.continuation.binding)) throw new DomainError('MODEL_BINDING_MISMATCH', 'Queued job does not match its continuation owner');
          }
        }
        if(job.stage==='strategy'&&(!job.purpose||job.purpose==='stage')&&usesResearchOperatorWorkflow(project))checkContinuation(project,{artifactId:project.activeByStage.research,policyVersion:project.policies.at(-1).version},job.binding);
        if(job.edgeId||job.task.ownerEdgeId){const edge=project.ownerEdges.find(e=>e.id===(job.edgeId??job.task.ownerEdgeId));ownerRuntimeBinding(edge);await ownerSourceContents(project,edge.envelope.source.artifactId);}
        if(job.purpose==='coverage_challenge'){store.requireSemanticLease(semanticLease);semanticChallengeCurrent(store.read(projectId),job);}
        if(job.purpose==='research_reader')researchReaderTarget(store.read(projectId),job);
        if(job.purpose==='handoff'&&project.workflow)await verifyCurrentResearchReaders(store.read(projectId),{executionRoot:root,artifactId:job.targetArtifactId});
        await verifyRegistered(store.read(projectId),job);
        const failureWitness=await diagnosticWitness(store.read(projectId),job);
        if(copyHttpAdmission)store.command(projectId,{kind:'start-job',jobId,attemptId,copyHttpRequestId:copyHttpAdmission.requestId,commandId:`copy-http-start-${hash(JSON.stringify([projectId,copyHttpAdmission.requestId,jobId]))}`,expectedRevision:copyHttpAdmission.expectedRevision},{...context,now:new Date().toISOString()});else if(simpleStrategyAdmission)store.command(projectId,{kind:'start-job',jobId,attemptId,simpleStrategyHttpRequestId:simpleStrategyAdmission.requestId,commandId:`simple-job-start-${hash(JSON.stringify([projectId,simpleStrategyAdmission.requestId,jobId]))}`,expectedRevision:simpleStrategyAdmission.expectedRevision},{...context,now:new Date().toISOString()});else if(acquisitionAdmission)store.command(projectId,{kind:'start-job',jobId,attemptId,acquisitionHttpRequestId:acquisitionAdmission.requestId,commandId:`acquisition-job-start-${hash(JSON.stringify([projectId,acquisitionAdmission.requestId,jobId]))}`,expectedRevision:acquisitionAdmission.expectedRevision},{...context,now:new Date().toISOString()});else send(projectId,{kind:retry?'retry-job':'start-job',jobId,attemptId,...(failureWitness?{failureWitness}:{})},context);
      }
      catch(error) {
        if(!(error instanceof DomainError)||store.read(projectId).jobs.find(j=>j.id===jobId)?.status!=='queued')throw error;
        send(projectId,{kind:'block-queued-job',jobId,error:{code:error.code,message:error.message}},context);
        return store.read(projectId).jobs.find(j=>j.id===jobId);
      }
      let receipt=null,dispatched=false;
      const enrich=value=>({...value,providerExecution:structuredClone(value.providerExecution??value),providerId:job.binding.providerId,model:job.binding.model,role:job.binding.role,taskId:job.task.id,attemptId});
      const freshCompletion=async(receipt,file,raw)=>{if(isOrdinaryHttp(receipt)){const p=store.read(projectId),j=p.jobs.find(j=>j.id===jobId);await reopenOrdinaryCompletion(p,j,j.attempts.at(-1),{executionRoot:root,receipt,wrappers:[[file,raw]]});}};
      try {
        if(job.purpose==='source_capture') {
          const captured=await capturePublicSource({url:job.task.url,storeRoot:join(root,'source-captures')},acquisitionDependencies);
          const checked=await readManagedCapture(join(root,'source-captures'),captured);
          const capture={id:`capture_${checked.recordHash}`,projectId,recordHash:checked.recordHash,recordPath:checked.recordPath,record:checked.record};
          send(projectId,{kind:'complete-source-capture',jobId,attemptId,capture},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        await verifyAcquiredAncestry(store.read(projectId),job.inputVersionIds);
        const provider=providers[job.binding.providerId];
        if(!provider)throw Object.assign(new Error('该岗位尚未配置执行提供方'),{code:'PROVIDER_MISSING',status:'blocked'});
        if(provider.model!==job.binding.model)throw Object.assign(new Error('Provider configuration does not match frozen model binding'),{code:'MODEL_BINDING_MISMATCH',status:'blocked'});
        const brief=job.task.brief??project.taskCards.find(card=>card.id===project.activeTaskCardId).brief;
        const isOwner=job.purpose==='owner_acceptance',isCreative=job.purpose==='creative_review',isCaseIdentity=job.purpose==='case_identity',isFeedbackReview=job.purpose==='feedback_review',isCorrectionReview=job.purpose==='correction_review';
        const isReader=job.purpose==='research_reader',isSemantic=job.purpose==='coverage_challenge',isObservationReview=job.purpose==='observation_review',isObservation=job.purpose==='observation',isVerification=job.purpose==='verification',isReadiness=job.purpose==='readiness',isHandoff=job.purpose==='handoff';
        const inputArtifacts=await inputs(project,job);
        if([STRATEGY_CONTRACT_VERSION,SIMPLE_STRATEGY_VERSION].includes(job.task.strategyContractVersion))send(projectId,{kind:'freeze-strategy-inputs',jobId,attemptId,inputArtifacts},context);
        if((job.task.revisionInput||job.task.correctionInput)&&!isDeepStrictEqual(inputArtifacts,job.task.revisionInputArtifacts))throw new Error('Frozen revision upstream content changed');
        if(isVerification&&!isDeepStrictEqual(project.artifacts.find(a=>a.id===job.targetArtifactId)?.strategyContract?.version===SIMPLE_STRATEGY_VERSION?{...inputArtifacts[0]?.content,claims:[]}:inputArtifacts[0]?.content,job.task.verificationInput.content))throw new Error('Verification target changed after enqueue');
        if(isReadiness&&!isDeepStrictEqual(inputArtifacts[0]?.content,job.task.readinessInput.content))throw new Error('Readiness target changed after enqueue');
        if(isHandoff&&!isDeepStrictEqual(inputArtifacts[0]?.content,job.task.handoffInput.content))throw new Error('Handoff target changed after enqueue');
        if(isCorrectionReview&&!isDeepStrictEqual(inputArtifacts[0]?.content,job.task.correctionReviewInput.content))throw new Error('Correction target changed after enqueue');
        if(isFeedbackReview&&!isDeepStrictEqual(inputArtifacts[0]?.content,job.task.feedbackReviewInput.content))throw new Error('Feedback target changed after enqueue');
        if(job.task.revisionInput||job.task.correctionInput){const frozen=job.task.correctionInput??job.task.revisionInput;const base=await readArtifactContent(project,frozen.revisionOf.artifactId,root);if(!isDeepStrictEqual(base.content,frozen.baseContent))throw new Error('Revision base content changed');}
        const images=[];
        if(isCaseIdentity){for(const capture of [job.task.caseIdentityInput.pageCapture,job.task.caseIdentityInput.sourceImageCapture])await readManagedCapture(join(root,'source-captures'),capture);for(const image of [job.task.caseIdentityInput.referenceImage,job.task.caseIdentityInput.sourceImage])images.push((await imageStore.read({projectId,imageId:image.imageId,expectedHash:image.sha256})).descriptor);}
        if(isObservation||isObservationReview)for(const image of (isObservationReview?job.task.observationReviewInput:job.task.observationInput).images)images.push((await imageStore.read({projectId,imageId:image.imageId,expectedHash:image.sha256})).descriptor);
        if(isFeedbackReview||isCorrectionReview||job.task.revisionInput||job.task.correctionInput)for(const image of (isCorrectionReview?job.task.correctionReviewInput.correctionInput:isFeedbackReview?job.task.feedbackReviewInput.revisionInput:job.task.correctionInput??job.task.revisionInput).materials)images.push((await imageStore.read({projectId,imageId:image.imageId,expectedHash:image.sha256})).descriptor);
        if(isCreative&&!isDeepStrictEqual(inputArtifacts[0]?.content,project.creativePanels.find(p=>p.id===job.panelId)?.packet.content))throw new DomainError('INVALID_CREATIVE_PANEL','Frozen creative target bytes changed');
        let request=isReader?buildResearchReaderRequest(job.task.readerInput):isSemantic?buildSemanticRequest(job.task.semanticInput):isOwner?buildOwnerRequest(job.task.ownerInput):isCorrectionReview?buildCorrectionReviewRequest(job.task.correctionReviewInput):isCreative?buildCreativeRequest(job.task.creativeInput):isFeedbackReview?buildFeedbackReviewRequest(job.task.feedbackReviewInput):isCaseIdentity?buildCaseIdentityRequest(job.task.caseIdentityInput):isObservationReview?buildImageObservationReviewRequest(job.task.observationReviewInput):isObservation?buildImageObservationRequest({images}):isHandoff?buildResearchHandoffRequest(job.task.handoffInput):isReadiness?buildResearchReadinessRequest(job.task.readinessInput):isVerification?buildEvidenceReviewRequest(job.task.verificationInput):buildStageRequest({stage:job.stage,brief,inputArtifacts,sourceRecords,visualCatalogue:job.task.visualCatalogue??[],revisionInput:job.task.revisionInput,correctionInput:job.task.correctionInput,copyContractVersion:job.task.copyContractVersion,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis,researchRevision:job.task.researchRevision});
        if (job.stage==='research' && (!job.purpose || job.purpose==='stage') && job.task.researchMethod) request=applyResearchMethod(request,job.task.researchMethod,job.task.researchQuestionRegistration);
        await mkdir(root,{recursive:true});
        const folder=join(root,attemptId);await mkdir(folder);
        const packet={projectId,jobId,attemptId,inputVersionIds:job.inputVersionIds,sourceRecords,...request};
        await writeFile(join(folder,'packet.json'),JSON.stringify(packet,null,2),{flag:'wx'});
        if(isCreative||isOwner)send(projectId,{kind:isOwner?'mark-owner-dispatched':'mark-creative-dispatched',jobId,attemptId},context);
        if(isReader)send(projectId,{kind:'mark-research-reader-dispatched',jobId,attemptId},context);
        if(isSemantic){store.requireSemanticLease(semanticLease);send(projectId,{kind:'claim-coverage-dispatch',jobId,attemptId},context);dispatched=true;store.requireSemanticLease(semanticLease);}
        dispatched=true;
        const result=await invokeOrdinary({executionRoot:root,provider,binding:job.binding,attemptId,request,images,runtimePacketBytes:Buffer.from(JSON.stringify(packet,null,2)),persistLocator:locator=>send(projectId,{kind:'anchor-model-http-attempt',jobId,attemptId,locator},context)});
        receipt=enrich(result);
        await verifyAcquiredAncestry(store.read(projectId),job.inputVersionIds);
        if(job.task.researchDataBasis?.acquisition)await acquisition.verifyProducer(projectId,job.task.researchDataBasis.acquisition);
        if(result.requestedModel!==job.binding.model)throw new Error('Provider model does not match frozen task binding');
        if(!ordinaryHasContext(result)||!result.inputPacketHash||!ordinarySuccessfulStatus(result)||result.signal!=null||result.reason!=null||result.error!=null||(result.runId!==undefined&&result.runId!==attemptId))throw new Error('Provider returned no successful invocation receipt');
        if(result.responseText!==undefined&&result.parsedOutput!==undefined&&!isDeepStrictEqual(JSON.parse(result.responseText),result.parsedOutput))throw new Error('Provider parsed output differs from saved response');
        const parsed=result.parsedOutput??JSON.parse(result.responseText);
        if(isHandoff||isReadiness||isVerification||job.stage==='research'||job.stage==='strategy'&&(!job.purpose||job.purpose==='stage')){const latest=store.read(projectId);await inputs(latest,job);if(job.stage==='strategy'&&(!job.purpose||job.purpose==='stage')&&usesResearchOperatorWorkflow(latest))checkContinuation(latest,{artifactId:latest.activeByStage.research,policyVersion:latest.policies.at(-1).version},job.binding);}
        if(isHandoff&&project.workflow)await verifyCurrentResearchReaders(store.read(projectId),{executionRoot:root,artifactId:job.targetArtifactId});
        if(isOwner||job.task.ownerEdgeId){const latest=store.read(projectId),edge=latest.ownerEdges.find(e=>e.id===(job.edgeId??job.task.ownerEdgeId));ownerRuntimeBinding(edge);await ownerSourceContents(latest,edge.envelope.source.artifactId);}
        if(isReader){
          researchReaderTarget(store.read(projectId),job);
          const report=validateResearchReaderOutput(parsed,job.task.readerInput),raw=JSON.stringify(report,null,2),file=join(folder,'research-reader.json');
          await writeFile(file,raw,{flag:'wx'});receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-research-reader',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(j=>j.id===jobId);
        }
        if(isSemantic){
          const report=validateSemanticOutput(parsed,job.task.semanticInput),raw=JSON.stringify(report,null,2),file=join(folder,'coverage-challenge.json');
          await writeFile(file,raw,{flag:'wx'});receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-coverage-challenge',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(j=>j.id===jobId);
        }
        if(isOwner){
          const report=validateOwnerOutput(parsed,job.task.ownerInput),raw=JSON.stringify(report,null,2),file=join(folder,'owner-acceptance.json');
          await writeFile(file,raw,{flag:'wx'});receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-owner',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(j=>j.id===jobId);
        }
        if(isCreative){
          const report=validateCreativeOutput(parsed,job.task.creativeInput),raw=JSON.stringify(report,null,2),file=join(folder,'creative-review.json');
          await writeFile(file,raw,{flag:'wx'});receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-creative-node',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        if(isCorrectionReview){
          const report=validateCorrectionReviewOutput(parsed,job.task.correctionReviewInput),raw=JSON.stringify(report,null,2),file=join(folder,'correction-review.json');
          await writeFile(file,raw,{flag:'wx'});receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-correction-review',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);return store.read(projectId).jobs.find(j=>j.id===jobId);
        }
        if(isFeedbackReview){
          const report=validateFeedbackReviewOutput(parsed,job.task.feedbackReviewInput),raw=JSON.stringify(report,null,2),file=join(folder,'feedback-review.json');
          await writeFile(file,raw,{flag:'wx'});receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-feedback-review',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        if(isCaseIdentity){
          const report=validateCaseIdentityOutput(parsed,job.task.caseIdentityInput,images),raw=JSON.stringify(report,null,2),file=join(folder,'case-identity.json');
          await writeFile(file,raw,{flag:'wx'}); receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-case-identity',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        if(isObservationReview){
          const input=job.task.observationReviewInput;
          const report=validateImageObservationReviewOutput(parsed,input.images,input.rawReport),raw=JSON.stringify(report,null,2),file=join(folder,'observation-review.json');
          await writeFile(file,raw,{flag:'wx'});
          receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-observation-review',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        if(isObservation){
          const report=validateImageObservationOutput(parsed,job.task.observationInput.images),raw=JSON.stringify(report,null,2),file=join(folder,'observation.json');
          await writeFile(file,raw,{flag:'wx'});
          receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-observation',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        if(isHandoff){
          const report=validateResearchHandoffOutput(parsed,job.task.handoffInput),raw=JSON.stringify(report,null,2),file=join(folder,'handoff.json');
          await writeFile(file,raw,{flag:'wx'});
          receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-handoff',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        if(isReadiness){
          const report=validateResearchReadinessOutput(parsed,job.task.readinessInput),raw=JSON.stringify(report,null,2),file=join(folder,'readiness.json');
          await writeFile(file,raw,{flag:'wx'});
          receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-readiness',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt,...(job.readinessFailureResolutionId?{failureWitness:await diagnosticWitness(store.read(projectId),job)}:{})},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        if(isVerification){
          const report=validateEvidenceReviewOutput(parsed,job.task.verificationInput),raw=JSON.stringify(report,null,2),file=join(folder,'verification.json');
          await writeFile(file,raw,{flag:'wx'});
          receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
          await freshCompletion(receipt,file,raw);
          send(projectId,{kind:'complete-verification',jobId,attemptId,reportId:randomUUID(),rawReport:parsed,payloadRef:file,contentHash:hash(raw),executionReceipt:receipt},context);
          return store.read(projectId).jobs.find(item=>item.id===jobId);
        }
        if(job.task.researchDataBasis?.acquisition)await acquisition.verifyProducer(projectId,job.task.researchDataBasis.acquisition);
        await verifyRegistered(store.read(projectId),job);
        const output=validateStageOutput(job.stage,parsed,{sourceRecords,visualCatalogue:job.task.visualCatalogue??[],revisionInput:job.task.revisionInput,correctionInput:job.task.correctionInput,copyContractVersion:job.task.copyContractVersion,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis,researchRevision:job.task.researchRevision});
        const raw=JSON.stringify(output.content,null,2),file=join(folder,'output.json');
        await writeFile(file,raw,{flag:'wx'});
        receipt={...receipt,validatedOutputPath:file,validatedOutputHash:hash(raw)};
        if(output.status==='blocked'||output.outputKind==='research_plan')throw Object.assign(new Error(output.gaps.join('；')||'阶段缺少必需输入'),{code:'STAGE_INPUT_GAP',status:'blocked'});
        await freshCompletion(receipt,file,raw);
        send(projectId,{kind:'complete-stage',jobId,attemptId,artifactId:randomUUID(),payloadRef:file,contentHash:hash(raw),claims:output.claims,...(job.task.correctionInput?{revisionResponses:output.revisionResponses}:{}),...(job.task.revisionInput?{feedbackResponses:output.feedbackResponses}:{}),technicalReceipts:{sourceCatalogue:{version:1,records:sourceRecords},visualCatalogue:job.task.visualCatalogue??[]},executionReceipt:receipt},context);
      } catch(error) {
        if(error.receipt)receipt=enrich(error.receipt);
        send(projectId,{kind:'finish-job-error',jobId,attemptId,status:['creative_review','owner_acceptance','coverage_challenge','research_reader'].includes(job.purpose)&&dispatched?'awaiting_reconciliation':['blocked','awaiting_reconciliation'].includes(error.status)?error.status:dispatched?'awaiting_reconciliation':'failed',error:{code:error.code??'EXECUTION_FAILED',message:error.message},...(['creative_review','owner_acceptance','coverage_challenge','research_reader'].includes(job.purpose)?{dispatchStarted:dispatched}:{}),...(receipt?{receipt}:{})},context);
      }
      return store.read(projectId).jobs.find(item=>item.id===jobId);
    },
  };
  return runtime;
}
