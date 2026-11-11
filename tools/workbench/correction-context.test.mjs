import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildStageRequest} from './stage-content.mjs';
import {buildCorrectionReviewRequest,validateCorrectionReviewOutput} from './correction.mjs';
import {admitSupplementalSources,createCorrectionEvidence,evidenceRecords,requireEvidenceProjection} from './correction-evidence.mjs';
const historical=JSON.parse(readFileSync(new URL('./fixtures/correction-context-historical-r12.json',import.meta.url)));
const sha=v=>createHash('sha256').update(v).digest('hex');
for(const f of historical.fixtures)test(`actual R12 ${f.kind} reconstructs original provider bytes and historical normalization`,()=>{
 const r=f.kind==='handling'?buildCorrectionReviewRequest(f.input):buildStageRequest(f.input);
 assert.equal(sha(JSON.stringify(r)),f.expected.requestHash);assert.equal(sha(r.prompt),f.expected.promptHash);assert.equal(sha(JSON.stringify(r.outputSchema)),f.expected.schemaHash);
 assert.equal(sha(JSON.stringify({runId:f.expected.runId,model:f.expected.model,prompt:r.prompt,outputSchema:r.outputSchema,...(r.manifest?.length?{images:r.manifest}:{})})),f.expected.providerPacketHash);
 if(f.kind==='handling'){const normalized=validateCorrectionReviewOutput(f.rawReport,f.input);assert.equal(sha(JSON.stringify(normalized)),f.expected.normalizedHash);assert.equal(normalized.hasBlockingFindings,true);assert.ok(normalized.preservationCheck.violations.length);}
});
const captured={id:'new-source',url:'https://example.org/social-use',text:'One bounded published description.',scopeRelation:'background',reason:'No representative Chinese sample.'};
test('single evidence envelope preserves exact actual eight-record prefix and full 31-entry visual catalogue',()=>{
 const original=historical.fixtures.find(f=>f.kind==='production').input,delta=admitSupplementalSources([captured]),e=createCorrectionEvidence(original.correctionInput.revisionOf,original.sourceRecords,original.visualCatalogue,delta),records=evidenceRecords(e);
 assert.equal(original.sourceRecords.length,8);assert.equal(original.visualCatalogue.length,31);assert.deepEqual(records.slice(0,8),original.sourceRecords);assert.deepEqual(records.slice(8),delta);
 const tencent=records.find(r=>r.id==='tencent-baijiu-user-primary-r6');assert.match(tencent.text,/平台线上/);assert.match(tencent.text,/覆盖全国一至五线城市/);
 requireEvidenceProjection({protocolVersion:'typed-revision-v3',revisionOf:original.correctionInput.revisionOf,evidence:e},records,original.visualCatalogue);
 for(const changed of [records.slice(1),[...records].reverse(),[...records,{...delta[0],id:'implicit-global'}]])assert.throws(()=>requireEvidenceProjection({protocolVersion:'typed-revision-v3',revisionOf:original.correctionInput.revisionOf,evidence:e},changed,original.visualCatalogue));
 assert.throws(()=>createCorrectionEvidence(original.correctionInput.revisionOf,original.sourceRecords,original.visualCatalogue,[{...delta[0],id:original.sourceRecords[0].id}]),/duplicate/i);
});
test('captured-only admission refuses authority, direct cases, duplicates, invalid/public URL and bounded-size failures',()=>{
 for(const field of ['verification','caseIdentity','identityStatus','receipt','textHash','reportId'])assert.throws(()=>admitSupplementalSources([{...captured,[field]:'forged'}]));
 for(const scopeRelation of ['direct','visual'])assert.throws(()=>admitSupplementalSources([{...captured,scopeRelation}]));
 for(const url of ['file:///tmp/a','http://localhost/a','http://127.0.0.1/a','https://user:pass@example.org'])assert.throws(()=>admitSupplementalSources([{...captured,url}]));
 assert.throws(()=>admitSupplementalSources([captured,captured]));assert.throws(()=>admitSupplementalSources([{...captured,text:'x'.repeat(20001)}]));
 const parent=historical.fixtures[0].input.correctionInput.revisionOf;
 assert.throws(()=>createCorrectionEvidence(parent,[],[],admitSupplementalSources(Array.from({length:51},(_,i)=>({...captured,id:'s'+i,text:'x'.repeat(20000)})))),/size limit/);
});
