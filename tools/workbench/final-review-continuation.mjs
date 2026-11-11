import {requireCompleteContent} from './complete-content.mjs';
import {contentSourceEnvelope} from './project.mjs';
import {finalReviewMetadataBasis} from './final-review-authority.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
const need=(value,code,message)=>{if(!value)throw Object.assign(new Error(message),{code,status:code==='AUTHORIZATION_ENDPOINT'?403:422});};
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=200&&!value.includes('\0');
export function finalContinuationIntent(request){
 need(request&&typeof request==='object'&&!Array.isArray(request)&&Object.keys(request).length===3&&Object.keys(request).every(k=>['commandId','expectedRevision','layoutRootJobId'].includes(k)), 'INVALID_FINAL_INTENT','Only command identity, revision and layout root accepted');
 need(text(request.commandId)&&request.commandId!=='__proto__'&&text(request.layoutRootJobId)&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0,'INVALID_FINAL_INTENT','Valid continuation identity and revision required');
}
export function reduceFinalContinuation(p,c,context,metadataBasis){
 const {kind,...request}=c;finalContinuationIntent(request);
 need(context.actorType==='human'||context.actorType==='agent','HUMAN_REQUIRED','Human or internal agent intention required');
 if(context.actorType==='agent')requireImplicitFinalContinuation(p,c.layoutRootJobId);
 need(p.policies.at(-1).authorizedThrough==='final_review','AUTHORIZATION_ENDPOINT','Final review exceeds authorized endpoint');
 const basis=metadataBasis(p,c.layoutRootJobId);
 p.finalReviewContinuations??=[];
 const current=p.finalReviewContinuations.at(-1);
 const admission={commandId:c.commandId,acceptedRevision:p.revision+1,origin:context.actorType};
 if(current&&equal(current.basis,basis)){(current.requests??=[]).push(admission);return;}
 const id='final-intent-'+createHash('sha256').update(JSON.stringify([p.id,c.commandId,basis])).digest('hex');
 p.finalReviewContinuations.push({id,commandId:c.commandId,requests:[admission],basis:structuredClone(basis),acceptedRevision:p.revision+1,createdAt:context.now??null,origin:context.actorType});
}
export function requireImplicitFinalContinuation(p,layoutRootJobId){
 const policy=p.policies.at(-1);
 need(['auto','assisted'].includes(policy.mode)&&policy.authorizedThrough==='final_review'&&p.confirmations.some(c=>c.taskCardId===p.activeTaskCardId),'FINAL_IMPLICIT_NOT_AUTHORIZED','Confirmed active task and final endpoint required');
 const basis=finalReviewMetadataBasis(p,layoutRootJobId);
 requireCompleteContent(p,p.artifacts.find(a=>a.id===basis.contentArtifactId),contentSourceEnvelope);
 return basis;
}
export function finalContinuationStatus(p,configurationIdentity=null){
 const intention=p.finalReviewContinuations?.at(-1);
 const base={revision:p.revision,configurationIdentity,executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false,delivery:null};
 if(!intention)return {...base,status:'not_requested',continuationId:null,blockers:[]};
 let current=false;
 try{current=equal(intention.basis,finalReviewMetadataBasis(p,intention.basis.layoutRootJobId));}
 catch(error){if(!['FINAL_LAYOUT_REQUIRED','FINAL_CONTENT_REQUIRED','FINAL_CONTENT_RELEASE_REQUIRED','FINAL_STALE_BASIS'].includes(error.code))throw error;}
 const blockers=!current?['FINAL_STALE_BASIS']:p.policies.at(-1).authorizedThrough!=='final_review'?['AUTHORIZATION_ENDPOINT']:!configurationIdentity?['FINAL_CONFIGURATION_REQUIRED']:[p.finalOperationCaptures?.length?'FINAL_VERIFIED_INSPECTION_REQUIRED':'FINAL_PREPARATION_REQUIRED'];
 return {...base,status:current?'eligible':'stale',continuationId:intention.id,layoutRootJobId:intention.basis.layoutRootJobId,acceptedRevision:intention.acceptedRevision,basis:structuredClone(intention.basis),blockers};
}
export function createFinalContinuationRuntime({store,configuration=null}){
 const configurationIdentity=configuration?createHash('sha256').update(JSON.stringify(configuration)).digest('hex'):null;
 return {
  status:id=>finalContinuationStatus(store.read(id),configurationIdentity),
  continue(id,request){
   finalContinuationIntent(request);
   const current=store.read(id);
   need(current.policies.at(-1).authorizedThrough==='final_review','AUTHORIZATION_ENDPOINT','Final review exceeds authorized endpoint');
   const basis=finalReviewMetadataBasis(current,request.layoutRootJobId);
   const command={kind:'request-final-review-continuation',...request};
   const retained=current.finalReviewContinuations?.find(intention=>intention.requests?.some(admission=>admission.commandId===request.commandId));
   const fingerprint=JSON.stringify(Object.fromEntries(Object.entries(command).filter(([key])=>key!=='expectedRevision')));
   need(retained||current.processedCommands?.[request.commandId]!==fingerprint,'FINAL_ADMISSION_BINDING_REQUIRED','Processed continuation requires its retained admission binding');
   need(!retained||retained.basis.layoutRootJobId!==request.layoutRootJobId||equal(retained.basis,basis),'FINAL_STALE_BASIS','Retained continuation requires its exact current metadata basis');
   store.command(id,command,{actorType:'human',actorId:'local-operator',runId:'final-continuation:'+request.commandId,contextId:'local-final-intention',now:new Date().toISOString()});
   return finalContinuationStatus(store.read(id),configurationIdentity);
  },
  ensureImplicit(id){
   const p=store.read(id),root=p.jobs.filter(j=>j.purpose==='layout_export'&&j.task?.binding).at(-1);if(!root)return false;
   let basis;try{basis=requireImplicitFinalContinuation(p,root.id);}catch{return false;}
   if(equal(p.finalReviewContinuations?.at(-1)?.basis,basis))return false;
   const commandId='final-agent-intent:'+createHash('sha256').update(JSON.stringify([p.id,basis])).digest('hex');
   store.command(id,{kind:'request-final-review-continuation',commandId,expectedRevision:p.revision,layoutRootJobId:root.id},{actorType:'agent',actorId:'local-final-preparation',runId:commandId,contextId:commandId,now:new Date().toISOString()});return true;
  },
  pendingWork(id){const status=finalContinuationStatus(store.read(id),configurationIdentity);return status.continuationId&&status.status==='eligible'&&configurationIdentity?[{kind:'final-project-step',projectId:id,continuationId:status.continuationId,observedProgressIdentity:createHash('sha256').update(JSON.stringify([status.revision,status.basis,configurationIdentity])).digest('hex')}]:[];},
 };
}

export function finalPreparationQueueKey(work){return JSON.stringify(['final-project-step',work.projectId,work.continuationId]);}
export function shouldQueueFinalPreparation(work,scheduled,lastInspected){return work.kind==='final-project-step'&&!scheduled.has(finalPreparationQueueKey(work))&&lastInspected!==work.observedProgressIdentity;}
