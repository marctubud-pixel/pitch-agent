import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {acquisitionFixture,planAcquisition,finishAcquisition} from './research-acquisition-fixture.mjs';
import {acquisitionHash as hash,acquisitionReference} from './research-acquisition.mjs';
import {acquisitionRoot,verifyResearchAcquisitionOriginal} from './research-acquisition-original.mjs';
import {human} from './research-operator-fixture.mjs';

const selected='https://sources.acquisition.org/allowed';
const excluded='https://sources.acquisition.org/excluded';
const response=rows=>({status:200,headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({results:rows.map(([url,title])=>({url,title}))}))});
const pages=f=>f.tools.filter(t=>t.kind==='http'&&new URL(t.url).hostname==='sources.acquisition.org');
const request=f=>({commandId:crypto.randomUUID(),expectedRevision:f.store.read('p').revision});

test('explicit fresh generation preserves the previous envelope and originals with its actual parent ID',async t=>{
 const f=await acquisitionFixture();t.after(()=>f.close());
 await planAcquisition(f);await finishAcquisition(f);
 const before=f.store.read('p'),old=before.researchAcquisitions[0],ref=acquisitionReference(old),root=acquisitionRoot(f.root,old.envelope.id);
 const envelopeBytes=await readFile(join(root,'results',old.envelopeOriginal.sha256)),manifestBytes=await readFile(join(root,'tool-results',old.manifest.sha256));
 const fresh=f.request();await planAcquisition(f,fresh);
 const generations=f.store.read('p').researchAcquisitions;
 assert.equal(generations[1].envelope.parentGenerationId,old.envelope.id);
 assert.notEqual(generations[1].envelope.id,old.envelope.id);
 assert.deepEqual(generations[1].envelope.request,fresh);
 assert.deepEqual(generations[0],old);
 assert.deepEqual(generations[1].envelope.policy,old.envelope.policy);
 await finishAcquisition(f);
 const after=f.store.read('p');assert.deepEqual(after.researchAcquisitions[0],old);
 assert.deepEqual(await readFile(join(root,'results',old.envelopeOriginal.sha256)),envelopeBytes);
 assert.deepEqual(await readFile(join(root,'tool-results',old.manifest.sha256)),manifestBytes);
 await verifyResearchAcquisitionOriginal(after,ref,{executionRoot:f.root,historical:false});
});

test('new generation registration rejects forged ancestry even with a rehashed envelope',async t=>{
 const f=await acquisitionFixture();t.after(()=>f.close());await planAcquisition(f);await finishAcquisition(f);
 const old=f.store.command.bind(f.store),before=f.store.read('p');
 f.store.command=(id,c,context)=>{
  if(c.kind==='research-acquisition-request'){
   const envelope={...c.envelope,parentGenerationId:'acquisition-unregistered'};delete envelope.envelopeHash;envelope.envelopeHash=hash(envelope);
   return old(id,{...c,envelope},context);
  }
  return old(id,c,context);
 };
 await assert.rejects(()=>f.executor.continueResearch('p',f.request()),e=>e.code==='ACQUISITION_ORIGINAL_INVALID');
 assert.deepEqual(f.store.read('p'),before);
 assert.equal(f.calls.length,2);
});

for(const selectedDuplicate of [false,true])test(`result cap excludes duplicate destinations and selected duplicates retain provenance, selected duplicate ${selectedDuplicate}`,async t=>{
 const rows=[[selected,'Selected'],...(selectedDuplicate?[[selected+'#same','Selected duplicate']]:[]),[excluded,'Outside selection'],[excluded+'#same','Excluded duplicate']];
 const f=await acquisitionFixture({configuration:{searchProviderId:'search',limits:{resultsPerQuery:1}},transportHook:async r=>r.url.hostname==='search.acquisition.org'?response(rows):undefined});t.after(()=>f.close());
 await planAcquisition(f);await finishAcquisition(f);
 assert.equal(pages(f).length,4,'one selected page effect per branch');
 assert.deepEqual(pages(f).map(t=>t.url),Array(4).fill(selected));
 const p=f.store.read('p'),g=p.researchAcquisitions[0];assert.equal(g.admission.edges.length,rows.length*4);
 for(const b of g.branches){
  const search=b.tools.find(t=>t.kind==='search'),captures=b.tools.filter(t=>t.kind==='capture'),edges=search.outcome.edges;
  assert.deepEqual(edges.map(e=>e.status),selectedDuplicate?['selected','duplicate','result_limit','duplicate']:['selected','result_limit','duplicate']);
  assert.equal(edges.at(-1).duplicateOf,edges.at(-2).id);
  assert.equal(edges.at(-1).canonicalUrl,excluded);
  assert.equal(captures.length,1);assert.deepEqual(captures[0].argument.edgeIds,edges.filter(e=>e.canonicalUrl===selected).map(e=>e.id));
  assert.equal(b.result.coverage.status,'partial');assert.equal(b.result.coverage.usableExcerpts,1);
  for(const edge of edges){assert.match(edge.rawSha256,/^[a-f0-9]{64}$/);assert.match(edge.captureRecordHash,/^[a-f0-9]{64}$/);}
 }
 assert.ok(g.admission.sourceRecords.every(s=>s.url===selected));
 await verifyResearchAcquisitionOriginal(p,acquisitionReference(g),{executionRoot:f.root,historical:false});
});

test('another query may select an earlier excluded destination while all matching edges remain attached',async t=>{
 const f=await acquisitionFixture({configuration:{searchProviderId:'search',limits:{resultsPerQuery:1}},handler:(value,input)=>{if(input.envelope)for(const b of value.branches)b.queries.push(b.kind+' second');return value;},transportHook:async r=>r.url.hostname==='search.acquisition.org'?response(r.url.searchParams.get('q').endsWith('second')?[[excluded,'Selected by second query'],[excluded+'#again','Selected duplicate']]:[[selected,'Selected'],[excluded,'Outside first query'],[excluded+'#dup','Excluded duplicate']]):undefined});t.after(()=>f.close());
 await planAcquisition(f);await finishAcquisition(f);assert.equal(pages(f).length,8);
 const p=f.store.read('p'),g=p.researchAcquisitions[0];assert.equal(g.admission.edges.length,20);
 for(const b of g.branches){
  const edges=b.tools.filter(t=>t.kind==='search').flatMap(t=>t.outcome.edges),captures=b.tools.filter(t=>t.kind==='capture');
  assert.deepEqual(captures.map(t=>t.argument.url),[selected,excluded]);
  assert.deepEqual(captures[1].argument.edgeIds,edges.filter(e=>e.canonicalUrl===excluded).map(e=>e.id));
  assert.deepEqual(edges.filter(e=>e.canonicalUrl===excluded).map(e=>e.status),['result_limit','duplicate','selected','duplicate']);
 }
 await verifyResearchAcquisitionOriginal(p,acquisitionReference(g),{executionRoot:f.root,historical:false});
});

test('out-of-scope branches do not spend effects while remaining branches keep partial coverage and selection caps',async t=>{
 const f=await acquisitionFixture({configuration:{searchProviderId:'search',limits:{resultsPerQuery:1}},handler:(value,input)=>{if(input.envelope){value.branches[3].applicability='out_of_scope';value.branches[3].queries=[];}return value;},transportHook:async r=>r.url.hostname==='search.acquisition.org'?response([[selected,'Selected'],[excluded,'Outside selection'],[excluded+'#same','Excluded duplicate']]):undefined});t.after(()=>f.close());
 await planAcquisition(f);await finishAcquisition(f);assert.equal(pages(f).length,3);
 const g=f.store.read('p').researchAcquisitions[0];assert.deepEqual(g.branches.map(b=>b.result.coverage.status),['partial','partial','partial','out_of_scope']);assert.equal(g.branches[3].tools.length,0);assert.equal(g.admission.edges.length,9);
 f.store.command('p',{kind:'set-policy',mode:'assisted',humanGates:['research'],authorizedThrough:'strategy',...request(f)},human);
 const calls=f.calls.length,tools=f.tools.length;
 await assert.rejects(()=>f.executor.researchAcquisition.verifyProducer('p',acquisitionReference(g)),e=>e.code==='STALE_ACQUISITION');
 assert.equal(f.calls.length,calls);assert.equal(f.tools.length,tools);
});
