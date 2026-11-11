import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLocalVisualEvidence,verifyLocalContentEvidence,verifyLocalLayoutEvidence} from './local-native-module-evidence.mjs';
import {verifyAcceptanceModuleEvidence} from './local-acceptance-coordinator.mjs';
const complete={status:'complete',artifactId:'claimed',resultIds:['claimed'],jobIds:['claimed-job'],realQualityVerified:true,deliveryReady:true};
const empty=()=>({id:'p',activeByStage:{},artifacts:[],jobs:[]});
test('unwired native methods cannot accept visual/content/layout driver booleans',async()=>{
 for(const [module,code]of [['visual','ACCEPTANCE_VISUAL_NATIVE_READER_REQUIRED'],['content','ACCEPTANCE_CONTENT_NATIVE_READER_REQUIRED'],['layout','ACCEPTANCE_LAYOUT_NATIVE_READER_REQUIRED']])await assert.rejects(()=>verifyAcceptanceModuleEvidence(empty(),module,complete),{code});
});
test('previous or metadata-only final visual cannot invoke the actual native reader',async()=>{
 let calls=0;const executor={verifyFinalVisual:async()=>{calls++;}},p=empty();p.activeByStage.visual='current';p.artifacts=[{id:'old',stage:'visual',provenance:'reviewed_final_visual'}];
 await assert.rejects(()=>verifyLocalVisualEvidence(p,complete,{executor}),{code:'ACCEPTANCE_NATIVE_CURRENT_ARTIFACT_REQUIRED'});
 p.artifacts.push({id:'current',stage:'visual',provenance:'imported_metadata'});await assert.rejects(()=>verifyLocalVisualEvidence(p,complete,{executor}),{code:'ACCEPTANCE_VISUAL_AUTHORITY_REQUIRED'});assert.equal(calls,0);
});
test('visual self-declared artifacts or incomplete native reader output are rejected',async()=>{
 const p={...empty(),activeByStage:{visual:'current'},artifacts:[{id:'current',stage:'visual',provenance:'reviewed_final_visual',finalVisual:{protocol:'final-visual-v1'}}]},executor={verifyFinalVisual:async()=>({reviewed:true})};
 await assert.rejects(()=>verifyLocalVisualEvidence(p,complete,{executor}),{code:'ACCEPTANCE_NATIVE_RESULT_CHANGED'});
 await assert.rejects(()=>verifyLocalVisualEvidence(p,{...complete,artifactId:'current',resultIds:['current']},{executor}),{code:'ACCEPTANCE_VISUAL_ORIGINAL_REQUIRED'});
});
test('content requires both actual draft and native layout source reader; no metadata producer substitute',async()=>{
 const p={...empty(),activeByStage:{content_review:'current'},artifacts:[{id:'current',stage:'content_review',provenance:'reviewed_complete_content'}]};
 await assert.rejects(()=>verifyLocalContentEvidence(p,complete,{executor:{contentDraft:async()=>({artifactId:'current'})}}),{code:'ACCEPTANCE_CONTENT_NATIVE_READER_REQUIRED'});
 let calls=0;const executor={contentDraft:async()=>{calls++;return {artifactId:'current'};},contentLayoutInput:async()=>{calls++;return null;}};
 await assert.rejects(()=>verifyLocalContentEvidence(p,{...complete,artifactId:'current',resultIds:['current']},{executor}),{code:'ACCEPTANCE_CONTENT_ORIGINAL_CHANGED'});assert.equal(calls,2);
});
test('layout status must be actual technical_complete rather than boolean or an unknown original',async()=>{
 for(const status of [{status:'awaiting_reconciliation'},{status:'technical_complete',finalAuthorityAvailable:true},{status:'complete',technicalOnly:true}])await assert.rejects(()=>verifyLocalLayoutEvidence(empty(),complete,{executor:{layoutStatus:async()=>status}}),{code:'ACCEPTANCE_LAYOUT_NATIVE_INCOMPLETE'});
 await assert.rejects(()=>verifyLocalLayoutEvidence(empty(),complete,{executor:{layoutStatus:async()=>({status:'technical_complete',finalAuthorityAvailable:false})}}),{code:'ACCEPTANCE_LAYOUT_ROOT_CHANGED'});
});
test('layout cannot claim another current content/root, and does not depend on activeByStage.layout',async()=>{
 const p={...empty(),activeByStage:{content_review:'c'},jobs:[{id:'layout-root',purpose:'layout_export',task:{binding:{contentArtifactId:'old'},bindingHash:'invented'}}]};
 await assert.rejects(()=>verifyLocalLayoutEvidence(p,{...complete,rootJobId:'layout-root',bindingHash:'invented'},{executor:{layoutStatus:async()=>({status:'technical_complete',rootJobId:'layout-root',bindingHash:'invented',finalAuthorityAvailable:false})}}),{code:'ACCEPTANCE_LAYOUT_ROOT_CHANGED'});assert.equal(p.activeByStage.layout,undefined);
});
test('coordinator pending states retain reserved-field and later-final-review guards',async()=>{
 await assert.rejects(()=>verifyAcceptanceModuleEvidence(empty(),'layout',{...complete,module:'final_review'}),{code:'ACCEPTANCE_DRIVER_RESERVED_FIELD'});
 const pending={status:'pending',reason:'waiting native source'};assert.deepEqual(await verifyAcceptanceModuleEvidence(empty(),'visual',pending),pending);
 await assert.rejects(()=>verifyAcceptanceModuleEvidence(empty(),'final_review',complete),{code:'ACCEPTANCE_MODULE_ORIGINAL_VERIFIER_REQUIRED'});
});
