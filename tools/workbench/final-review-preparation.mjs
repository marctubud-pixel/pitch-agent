import {isDeepStrictEqual as equal} from 'node:util';
import {assertOperationReader,assertFinalPreparation} from './final-review-reader.mjs';
import {createOperationCaptureStore} from './final-operation-basis.mjs';
import {operationHash} from './final-operation-manifest.mjs';
import {operationAdapterIdentity} from './final-operation-original.mjs';
import {finalReviewMetadataBasis} from './final-review-authority.mjs';
import {assertValidatedLaunchSettings} from './launch-config.mjs';
const flags={executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false};
const substantive=proposal=>Object.fromEntries(Object.entries(proposal).filter(([key])=>!['id','basedOnRevision','createdBy','validationLevel',...Object.keys(flags)].includes(key)));
export function sameFinalSetup(setup,proposal){return !!setup&&equal(substantive(setup),substantive(proposal));}
export function createFinalPreparationRuntime({store,reader,continuations,launchConfiguration}){
 assertOperationReader(reader,{store,launchConfiguration});assertValidatedLaunchSettings(launchConfiguration);
 const captures=createOperationCaptureStore({store,launchConfiguration}),inspections=new Map();
 const context=id=>({actorType:'agent',actorId:'local-final-preparation',runId:id,contextId:id,now:new Date().toISOString()});
 const fresh=(result,project)=>project.revision===result.observedRevision&&equal(finalReviewMetadataBasis(project,result.basis?.layoutRootJobId??result.project.finalReviewSetups.at(-1).basis.layoutRootJobId),result.basis??result.project.finalReviewSetups.at(-1).basis);
 async function prepareFinalReview(work){
  const initial=continuations.pendingWork(work.projectId).find(w=>w.continuationId===work.continuationId&&w.observedProgressIdentity===work.observedProgressIdentity);
  if(!initial)return {kind:'stale',blockers:[{code:'FINAL_PREPARATION_WORK_STALE'}],...flags};
  let result;
  for(let retry=0;retry<2;retry++){
   try{
    const inspected=await reader.inspectPreparation(work.projectId);
    if(inspected.kind!=='inspected'){result=inspected;break;}
    assertFinalPreparation(inspected);
    let project=store.read(work.projectId);
    if(!fresh(inspected,project)||inspected.sourceIdentity!==await operationAdapterIdentity())throw Object.assign(Error('FINAL_READ_CHANGED'),{code:'FINAL_READ_CHANGED'});
    if(!sameFinalSetup(project.finalReviewSetups?.at(-1),inspected.proposal)){
     const commandId='final-setup:'+operationHash(inspected.proposal);
     store.command(project.id,{kind:'set-final-review-authority',commandId,expectedRevision:project.revision,authority:inspected.proposal},{...context(commandId),finalPreparationLaunch:launchConfiguration});
    }
    const acquired=await reader.acquireOperationCapture(work.projectId);
    if(acquired.kind!=='ready'){result=acquired;break;}
    if(!acquired.retained.operationBasis){
     const proposal=assertFinalPreparation(acquired.retained.captureProposal);project=store.read(work.projectId);
     if(!fresh(proposal,project)||proposal.sourceIdentity!==await operationAdapterIdentity())throw Object.assign(Error('FINAL_READ_CHANGED'),{code:'FINAL_READ_CHANGED'});
     const basis=await captures.retain(project,proposal.snapshot,proposal.planning,proposal.sourceIdentity);
     if(store.read(project.id).revision!==project.revision||proposal.sourceIdentity!==await operationAdapterIdentity())throw Object.assign(Error('FINAL_READ_CHANGED'),{code:'FINAL_READ_CHANGED'});
     const commandId='final-capture:'+basis.identity;
     store.command(project.id,{kind:'retain-final-operation-capture',commandId,expectedRevision:project.revision,capture:basis.record},{...context(commandId),finalOperationCapture:basis});
    }
    result=await reader.readOperationBasis(work.projectId);break;
   }catch(error){
    const stale=['REVISION_CONFLICT','FINAL_READ_CHANGED'].includes(error.code);
    if(stale&&retry===0)continue;
    result={kind:stale?'stale':'invalid_basis',blockers:[{code:error.code??'FINAL_PREPARATION_FAILED',message:error.message}],...flags};break;
   }
  }
  const current=store.read(work.projectId),lastInspection={checkedAt:new Date().toISOString(),kind:result.kind,observedRevision:result.observedRevision??(result.kind==='captured'?current.revision:null),configurationIdentity:operationHash(launchConfiguration),sourceIdentity:await operationAdapterIdentity(),continuationId:work.continuationId,observedProgressIdentity:work.observedProgressIdentity,blockers:structuredClone(result.blockers??[])};
  const pending=continuations.pendingWork(work.projectId);
  lastInspection.settledProgressIdentity=result.observedRevision===current.revision?pending.find(next=>next.continuationId===work.continuationId)?.observedProgressIdentity??work.observedProgressIdentity:work.observedProgressIdentity;
  inspections.set(work.projectId,lastInspection);
  return {...result,lastInspection,...flags};
 }
 return Object.freeze({prepareFinalReview,lastInspection:id=>structuredClone(inspections.get(id)??{kind:'not_checked_this_process'})});
}
