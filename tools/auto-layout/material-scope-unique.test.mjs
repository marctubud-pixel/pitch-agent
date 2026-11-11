import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMaterialPlacements} from './layout.mjs';
function fixture(){
 const p={clauseId:'clause',blockId:'limit',affectedImageIds:['hero'],affectedBlockIds:[],pageIntentIds:['intent'],occurrenceScopeKeys:['scope-a','scope-b'],exactFragmentRanges:[{start:0,end:5}]};
 const ref={placementIndex:0,clauseId:'clause',occurrenceScopeKeys:['scope-a','scope-b'],fragments:[{fragmentIndex:0,sourceRange:{start:0,end:5},nativeRange:{start:0,end:5}}]};
 return {graph:{manuscriptVersion:'complete-manuscript-v2',clausePlacements:[p],clausesById:{clause:{fragments:['Limit'],location:{}}}},plan:{style:'editorial',slides:[{id:'slide',originId:'intent',elements:[{type:'image',assetId:'hero'},{type:'text',sourceText:'Limit',contentRefs:{materialPlacements:[ref]}}]}]},ref};
}
test('same-slide exact unique scope set is accepted in either order',()=>{const {graph,plan,ref}=fixture();assert.equal(validateMaterialPlacements(graph,plan),true);ref.occurrenceScopeKeys.reverse();assert.equal(validateMaterialPlacements(graph,plan),true);});
test('same-length duplicate valid key cannot conceal a missing required key',()=>{const {graph,plan,ref}=fixture();ref.occurrenceScopeKeys=['scope-a','scope-a'];assert.throws(()=>validateMaterialPlacements(graph,plan),e=>e.code==='SEMANTIC_MATERIAL_FRAGMENT_MISSING');});
test('extra key cannot conceal a missing required key',()=>{const {graph,plan,ref}=fixture();ref.occurrenceScopeKeys=['scope-a','other'];assert.throws(()=>validateMaterialPlacements(graph,plan),e=>e.code==='SEMANTIC_MATERIAL_FRAGMENT_MISSING');});
test('duplicated required keys are invalid as well',()=>{const {graph,plan,ref}=fixture();graph.clausePlacements[0].occurrenceScopeKeys=['scope-a','scope-a'];ref.occurrenceScopeKeys=['scope-a','scope-a'];assert.throws(()=>validateMaterialPlacements(graph,plan),e=>e.code==='SEMANTIC_MATERIAL_FRAGMENT_MISSING');});
