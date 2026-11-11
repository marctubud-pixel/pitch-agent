import test from 'node:test';
import assert from 'node:assert/strict';
import {finalContentTuple,finalNumericContentBasis} from './final-content-contract.mjs';
import {VISIBILITY_CONTENT_CONTRACT,NUMERIC_CONTENT_CONTRACT,PLANNING_CONTENT_CONTRACT,MODEL_VIEW_CONTENT_CONTRACT} from './content-contract-versions.mjs';
import {fixture} from './final-review-input-fixture.mjs';
import {planFinalReview} from './final-review-input.mjs';
for(const tuple of [VISIBILITY_CONTENT_CONTRACT,NUMERIC_CONTENT_CONTRACT,PLANNING_CONTENT_CONTRACT,MODEL_VIEW_CONTENT_CONTRACT])test('final boundary selects exact '+tuple.packet,()=>{
 const c={packetVersion:tuple.packet,sourceLocationVersion:tuple.location,manuscript:{schemaVersion:tuple.manuscript}};
 const source={schemaVersion:tuple.source,...(tuple===VISIBILITY_CONTENT_CONTRACT?{}:{contentContract:{...tuple}})};
 assert.deepEqual(finalContentTuple(c,source),tuple);
 for(const field of ['schemaVersion','contentContract']){
  const mixed=structuredClone(source);mixed[field]=field==='schemaVersion'?'content-source-v99':{...tuple,extra:true};assert.throws(()=>finalContentTuple(c,mixed));
 }
 assert.throws(()=>finalContentTuple({...c,sourceLocationVersion:'content-source-location-v99'},source));
 assert.throws(()=>finalContentTuple({...c,manuscript:{schemaVersion:'complete-manuscript-v99'}},source));
});
test('legacy v3 remains planned and numeric basis is absent',()=>{
 const f=fixture();assert.equal(finalNumericContentBasis(f.snapshot.content.trusted.contract,f.snapshot.content.trusted.source,f.snapshot.layout.ledgerText,f.snapshot.content.trusted.contentHash),null);
 assert.equal(planFinalReview(f.snapshot,f.configuration).kind,'planned');
});
test('input consumer rejects packet-only numeric allowlisting',()=>{
 const f=fixture();f.snapshot.content.trusted.contract.packetVersion='content-packet-v6';const result=planFinalReview(f.snapshot,f.configuration);assert.equal(result.kind,'invalid_basis');assert.ok(result.blockers.some(b=>b.code==='INVALID_CONTENT_VERSION'));
});
