import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUncertaintyReturnRequest,validateUncertaintyReturnOutput,uncertaintyReturnInput,REFERENCE_UNCERTAINTY_PROTOCOL} from './reference-uncertainty.mjs';

const image={imageId:'img',sha256:'a'.repeat(64),mediaType:'image/png',byteLength:123};
const occurrence={id:'occurrence',kind:'original_occurrence',pointer:'/readings/0/uncertainties/0',origin:{packetHash:'b'.repeat(64),reportHash:'c'.repeat(64)},value:'Synthetic pixels have not been judged.',affected:{kind:'image',imageId:'img',useIds:['use-img']},severity:'unknown',applicability:{kind:'blocked'}};
const dossier={id:'d',envelope:{envelopeHash:'d'.repeat(64)}};
const review={id:'review',selectionHash:'e'.repeat(64),packet:{id:'packet',images:[image],uses:[{id:'use-img',imageId:'img'}]},occurrences:[occurrence],originalReports:[{reportHash:occurrence.origin.reportHash,nodeKey:'candidate-0:visual:first_read',rawReport:{readings:[{uncertainties:[occurrence.value]}]}}]};
const pixel={kind:'pixel',imageId:image.imageId,imageHash:image.sha256,region:[0,0,1,1],reportHash:null,pointer:null};
const pointer={kind:'report_pointer',imageId:null,imageHash:null,region:null,reportHash:occurrence.origin.reportHash,pointer:occurrence.pointer};
const output={protocolVersion:REFERENCE_UNCERTAINTY_PROTOCOL,dossierId:'d',envelopeHash:'d'.repeat(64),reviewId:'review',decisions:[{occurrenceId:'occurrence',disposition:'visual_evidence_required',reason:'The original pixels still require visual judgment.',evidence:[pixel,pointer]}],limitations:['Return diagnosis is not suitability approval.']};

test('owner return binds exact original occurrence, report, pixels, and leaves it blocked',()=>{
 const input=uncertaintyReturnInput(dossier,review),request=buildUncertaintyReturnRequest(input);
 assert.deepEqual(request.outputSchema.required,['protocolVersion','dossierId','envelopeHash','reviewId','decisions','limitations']);
 assert.equal(validateUncertaintyReturnOutput(output,input).decisions[0].disposition,'visual_evidence_required');
 assert.equal(input.occurrences[0].applicability.kind,'blocked');
 assert.deepEqual(review.originalReports[0].rawReport.readings[0].uncertainties,[occurrence.value]);
});

test('arbitrary approval, unsupported engineering scope, wrong image and wrong report fail',()=>{
 const input=uncertaintyReturnInput(dossier,review);
 for(const edit of [
  row=>row.disposition='approved',
  row=>row.disposition='engineering_test_scope',
  row=>row.occurrenceId='other',
  row=>row.evidence[0].imageHash='f'.repeat(64),
  row=>row.evidence[1].reportHash='f'.repeat(64),
  row=>row.evidence[0].region=[0,0,0,1],
 ]){const changed=structuredClone(output);edit(changed.decisions[0]);assert.throws(()=>validateUncertaintyReturnOutput(changed,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});}
});

test('explicit engineering provenance can classify test scope without granting visual approval',()=>{
 const typed=structuredClone(review);typed.occurrences[0].scopeProvenance={kind:'engineering_test',label:'mechanical fixture only'};
 const input=uncertaintyReturnInput(dossier,typed),changed=structuredClone(output);changed.decisions[0].disposition='engineering_test_scope';
 assert.equal(validateUncertaintyReturnOutput(changed,input).decisions[0].disposition,'engineering_test_scope');
 assert.equal(input.occurrences[0].applicability.kind,'blocked');
});

test('two-image return rejects sibling pixels and requires the readable original report pointer',()=>{
 const other={imageId:'other',sha256:'f'.repeat(64),mediaType:'image/png',byteLength:321};
 const two=structuredClone(review);two.packet.images.push(other);two.packet.uses.push({id:'use-other',imageId:'other'});
 const input=uncertaintyReturnInput(dossier,two);
 const wrong=structuredClone(output);wrong.decisions[0].evidence[0]={...pixel,imageId:'other',imageHash:other.sha256};
 assert.throws(()=>validateUncertaintyReturnOutput(wrong,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 const missing=structuredClone(output);missing.decisions[0].evidence=[pixel];
 assert.throws(()=>validateUncertaintyReturnOutput(missing,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 assert.equal(validateUncertaintyReturnOutput(output,input).decisions[0].evidence.length,2);
 const badOrigin=structuredClone(input);badOrigin.originalReports=[];
 assert.throws(()=>validateUncertaintyReturnOutput(output,badOrigin),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 const ambiguousOrigin=structuredClone(input);ambiguousOrigin.originalReports.push(structuredClone(ambiguousOrigin.originalReports[0]));
 assert.throws(()=>validateUncertaintyReturnOutput(output,ambiguousOrigin),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 const unreadableOrigin=structuredClone(input);unreadableOrigin.originalReports[0].rawReport.readings=[];
 assert.throws(()=>validateUncertaintyReturnOutput(output,unreadableOrigin),{code:'INVALID_REFERENCE_UNCERTAINTY'});
});

test('use, relation, and packet-wide occurrences bind to their actual images',()=>{
 const other={imageId:'other',sha256:'f'.repeat(64),mediaType:'image/png',byteLength:321};
 const two=structuredClone(review);two.packet.images.push(other);two.packet.uses.push({id:'use-other',imageId:'other'});
 const secondPixel={...pixel,imageId:'other',imageHash:other.sha256};
 const input=uncertaintyReturnInput(dossier,two);
 const decision=structuredClone(output);
 input.occurrences[0].affected={kind:'use',useIds:['use-other']};decision.decisions[0].evidence=[secondPixel,pointer];
 assert.equal(validateUncertaintyReturnOutput(decision,input).decisions[0].evidence[0].imageId,'other');
 decision.decisions[0].evidence=[pixel,pointer];assert.throws(()=>validateUncertaintyReturnOutput(decision,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 input.occurrences[0].affected={kind:'relation',useIds:['use-img','use-other']};decision.decisions[0].evidence=[pixel,secondPixel,pointer];
 assert.equal(validateUncertaintyReturnOutput(decision,input).decisions[0].evidence.length,3);
 decision.decisions[0].evidence=[pixel,pointer];assert.throws(()=>validateUncertaintyReturnOutput(decision,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 input.occurrences[0].affected={kind:'task',useIds:[]};
 assert.equal(validateUncertaintyReturnOutput(decision,input).decisions[0].evidence.length,2);
 input.occurrences[0].affected={kind:'unresolved',useIds:[]};assert.throws(()=>validateUncertaintyReturnOutput(decision,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 input.occurrences[0].affected={kind:'use',useIds:['missing']};assert.throws(()=>validateUncertaintyReturnOutput(decision,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 input.occurrences[0].affected={kind:'image',imageId:'other',useIds:['use-img']};assert.throws(()=>validateUncertaintyReturnOutput(decision,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 const duplicate=uncertaintyReturnInput(dossier,two);duplicate.images.push({...other});
 assert.throws(()=>validateUncertaintyReturnOutput(output,duplicate),{code:'INVALID_REFERENCE_UNCERTAINTY'});
 const packetOrigin=uncertaintyReturnInput(dossier,two);packetOrigin.occurrences[0].origin.reportHash=null;packetOrigin.occurrences[0].affected={kind:'use',useIds:['use-img']};
 const packetDecision=structuredClone(output);packetDecision.decisions[0].evidence=[pixel];
 assert.equal(validateUncertaintyReturnOutput(packetDecision,packetOrigin).decisions[0].evidence.length,1);
});
