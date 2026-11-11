import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceEditorBinding,verifyAcceptanceModuleEvidence} from './local-acceptance-coordinator.mjs';
import {readVerifiedEngineeringFinal,engineeringFinalProjection} from './local-engineering-panel.mjs';
import {assertEditorSourceBindingFields,engineeringEditorDocumentId} from './local-engineering-editor-bridge.mjs';
const project={id:'p',revision:1,activeByStage:{content_review:'content'},artifacts:[{id:'content',contentHash:'actual-content',completeContent:{rootJobId:'content-root'}}],jobs:[]},record={caseId:'dexian',projectId:'p'};
test('plain complete final driver or panel status cannot mint coordinator final evidence',async()=>{
 const result={status:'complete',reviewId:'invented',localReviewEvidenceHash:'a'.repeat(64)};
 await assert.rejects(()=>verifyAcceptanceModuleEvidence(project,'final_review',result,{caseRecord:record}),{code:'ACCEPTANCE_ENGINEERING_PANEL_REQUIRED'});
 await assert.rejects(()=>verifyAcceptanceModuleEvidence(project,'final_review',result,{caseRecord:record,engineeringPanel:{status:async()=>result}}),{code:'LOCAL_ENGINEERING_PANEL_REQUIRED'});
});
test('no credential-free v1 editor binding remains and a public projection cannot mint an opaque witness',()=>{
 for(const value of [undefined,{status:'complete',localReviewEvidenceHash:'a'.repeat(64)},engineeringFinalProjection({projectId:'p'}, {})]){
  assert.throws(()=>acceptanceEditorBinding(project,record,value),{code:'LOCAL_ENGINEERING_VERIFIED_FINAL_REQUIRED'});
  assert.throws(()=>readVerifiedEngineeringFinal(value),{code:'LOCAL_ENGINEERING_VERIFIED_FINAL_REQUIRED'});
 }
});
test('a fake final complete cannot replace actual pending/human journal state',async()=>{
 for(const status of ['pending','awaiting_user','awaiting_reconciliation'])await assert.rejects(()=>verifyAcceptanceModuleEvidence(project,'final_review',{status:'complete'},{caseRecord:record,engineeringPanel:{status:async()=>({status,reason:'Actual journal not complete'})}}),{code:'ACCEPTANCE_ENGINEERING_DRIVER_CHANGED'});
});
test('fake final debug metadata cannot promote a pending journal or overwrite module routing',async()=>{
 const panel={status:async()=>({status:'pending',reviewId:'r',evidenceHash:'source',sourceBindingHash:'binding',verifiedFinal:{notPublic:true},fact:{notPublic:true},snapshot:{notPublic:true},productionFinalAuthority:true})};
 const result=await verifyAcceptanceModuleEvidence(project,'final_review',{status:'complete'},{engineeringPanel:panel,caseRecord:record}).catch(e=>e);assert.equal(result.code,'ACCEPTANCE_ENGINEERING_DRIVER_CHANGED');
 await assert.rejects(()=>verifyAcceptanceModuleEvidence(project,'final_review',{status:'complete',module:'editor'},{engineeringPanel:panel}),{code:'ACCEPTANCE_DRIVER_RESERVED_FIELD'});
});
test('actual current source fields stay independently bound and distinct reviews retain separate drafts',()=>{
 const jobs=['editorial','stage','evidence'].map((style,n)=>({id:'j'+n,status:'succeeded',purpose:'layout_export',task:{style,bindingHash:'binding'},receipt:{style,bindingHash:'binding',attemptId:'a'+n}}));
 const p={...structuredClone(project),jobs};
 const binding={schemaVersion:'local-acceptance-editor-binding-v2',projectId:'p',projectRevision:0,artifacts:[],content:{artifactId:'content'},layout:{rootJobId:'j0',editions:[]},acceptanceKind:'local_engineering_acceptance',productionFinalAuthority:false};
 assert.throws(()=>assertEditorSourceBindingFields(binding,p),{code:'LOCAL_EDITOR_SOURCE_CHANGED'});
 assert.notEqual(engineeringEditorDocumentId(binding),engineeringEditorDocumentId({...binding,projectRevision:1}));
});
