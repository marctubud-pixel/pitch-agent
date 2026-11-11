import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceInputCheckpoint,isReferenceInputCheckpoint} from './local-reference-input.mjs';
import {admittedDecisionPlan,validateLocalDecisionRequest} from './local-decision-plan.mjs';
function fixture(){
 const project={id:'synthetic-input-gate',revision:3,activeByStage:{copy:'copy-one'},activeTaskCardId:'task-one',taskCards:[{id:'task-one',brief:'Synthetic pre-review input only'}],policies:[{mode:'auto',authorizedThrough:'references'}],artifacts:[{id:'copy-one',stage:'copy',contentHash:'c'.repeat(64)}],referenceMaterials:[],referenceDossiers:[]};
 const record={mode:'assisted',checkpoints:['references'],decisions:[]},result={status:'pending',nextOperation:'import_library_material'};
 return {project,record,result};
}
function next(input){return {module:'references',status:'awaiting_user',underlyingStatus:'pending',reason:'SELECTED_REFERENCE_INPUT_CHECKPOINT',evidenceHash:input.basisHash,inputCheckpoint:input.checkpoint};}
test('a selected assisted input gate is pending and authorizes no-effect start only, not completed reference approval',()=>{
 const f=fixture(),input=referenceInputCheckpoint(f.project,f.record,f.result),state={nextAction:next(input)},request={commandId:'start-reference',module:'references',decision:'approve',expectedBasisHash:input.basisHash};
 assert.equal(isReferenceInputCheckpoint(state.nextAction),true);assert.equal(state.nextAction.underlyingStatus,'pending');assert.deepEqual(validateLocalDecisionRequest(request,state),{kind:'selected_checkpoint_no_effect'});
 const plan=admittedDecisionPlan({project:f.project,state,request,actor:{actorType:'human'},hasExternalEffect:false});assert.deepEqual(plan.steps,[{kind:'selected_checkpoint_no_effect'}]);
 for(const patch of [{decision:'revise'},{contribution:{kind:'reference_image'}}])assert.throws(()=>validateLocalDecisionRequest({...request,...patch},state));
 f.record.decisions.push({module:'references',decision:'approve',basisHash:input.basisHash});assert.equal(referenceInputCheckpoint(f.project,f.record,f.result).approved,true);
 assert.equal(isReferenceInputCheckpoint({...state.nextAction,underlyingStatus:'complete'}),false);
});
test('automatic imports and progress keep the human-input basis stable while human material and source changes invalidate it',()=>{
 const f=fixture(),first=referenceInputCheckpoint(f.project,f.record,f.result);f.record.decisions.push({module:'references',decision:'approve',basisHash:first.basisHash});
 f.project.referenceMaterials.push({id:'library',artifactId:'copy-one',provenance:{kind:'local_curated_library'}});f.project.revision++;f.project.imageAssets=[{id:'unassigned-upload'}];f.result.nextOperation='continue_copy';assert.equal(referenceInputCheckpoint(f.project,f.record,f.result).approved,true);
 f.project.referenceMaterials.push({id:'user',artifactId:'copy-one',copyContentHash:'c'.repeat(64),directionId:'steady',image:{imageId:'image-one',sha256:'a'.repeat(64)},kind:'direction',applicabilityProfile:'direction',borrowingNote:'Borrow empty space only',provenance:{kind:'manual_supplied',submittedBy:'human'}});
 const changed=referenceInputCheckpoint(f.project,f.record,f.result);assert.notEqual(changed.basisHash,first.basisHash);assert.equal(changed.approved,false);
 f.record.decisions.push({module:'references',decision:'approve',basisHash:changed.basisHash});f.project.referenceMaterials.reverse();assert.equal(referenceInputCheckpoint(f.project,f.record,f.result).approved,true);
 f.project.referenceMaterials.find(m=>m.id==='user').borrowingNote='Changed borrowing purpose';assert.equal(referenceInputCheckpoint(f.project,f.record,f.result).approved,false);
});
test('a protocol label cannot turn a missing or altered basis into a no-effect reference waiver',()=>{
 const f=fixture(),value=next(referenceInputCheckpoint(f.project,f.record,f.result));
 for(const patch of [{module:'copy'},{status:'pending'},{status:'awaiting_reconciliation'},{evidenceHash:'0'.repeat(64)},{inputCheckpoint:{...value.inputCheckpoint,copyContentHash:'f'.repeat(64)}}])assert.equal(isReferenceInputCheckpoint({...value,...patch}),false);
});
test('unselected, automatic, blocked and already-open native reference work cannot acquire the pre-input permission',()=>{
 const f=fixture();for(const record of [{...f.record,mode:'auto'},{...f.record,checkpoints:[]}])assert.equal(referenceInputCheckpoint(f.project,record,f.result),null);
 for(const status of ['complete','blocked','awaiting_reconciliation','awaiting_user'])assert.equal(referenceInputCheckpoint(f.project,f.record,{status}),null);
 f.project.referenceDossiers.push({envelope:{source:{source:{artifactId:'copy-one'}}}});assert.equal(referenceInputCheckpoint(f.project,f.record,f.result),null);
});
