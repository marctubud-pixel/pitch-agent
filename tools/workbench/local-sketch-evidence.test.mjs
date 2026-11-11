import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLocalSketchEvidence} from './local-sketch-evidence.mjs';
const resources={executionRoot:'/tmp/isolated-test',imageStore:{read(){throw Error('Unregistered image must not be read');}}};
test('metadata-only or previous sketch cannot complete current sketch',async()=>{
 await assert.rejects(()=>verifyLocalSketchEvidence({activeByStage:{sketch:'current'},artifacts:[{id:'previous',stage:'sketch'}]},{resultIds:['previous']},resources),{code:'ACCEPTANCE_CURRENT_SKETCH_REQUIRED'});
 await assert.rejects(()=>verifyLocalSketchEvidence({activeByStage:{sketch:'current'},artifacts:[{id:'current',stage:'sketch',provenance:'imported_metadata'}]},{resultIds:['current']},resources),{code:'ACCEPTANCE_REVIEWED_SKETCH_REQUIRED'});
});
test('sketch completion requires its own image reader and exact actual result',async()=>{
 await assert.rejects(()=>verifyLocalSketchEvidence({},{}),{code:'ACCEPTANCE_SKETCH_RESOURCES_REQUIRED'});
 const p={activeByStage:{sketch:'current'},artifacts:[{id:'current',stage:'sketch',provenance:'reviewed_sketch_generation',sketchGeneration:{protocol:'sketch-review-v2'}}]};
 await assert.rejects(()=>verifyLocalSketchEvidence(p,{artifactId:'other',resultIds:['current']},resources),{code:'ACCEPTANCE_SKETCH_RESULT_CHANGED'});
});
