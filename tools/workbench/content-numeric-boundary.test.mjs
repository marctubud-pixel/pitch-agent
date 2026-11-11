import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {numericFixture} from './research-numeric-fixture.mjs';
import {acceptedOperatorResearch,releaseRequest,human,output} from './research-operator-fixture.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {requireResearchChartAdmission} from './project.mjs';
import {evidenceStateHash} from './evidence-review.mjs';
import {makeContentSource,makeProjectedContentSource,neutralContent} from './complete-content.mjs';
import {makeProjectedContentSource as directProjection} from './content-visibility.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const blocked={code:'NUMERIC_CONTENT_CONTRACT_REQUIRED'};
function basis(){
 const qualifications={referenceBoundaries:[],referenceQualifications:[]};
 const source={task:{id:'isolated-constructor-only'},strategy:{artifactId:'constructed-strategy',content:{}},copy:{artifactId:'constructed-copy',content:{}},visual:{artifactId:'constructed-visual',payload:{directions:[]}},directionMap:[],images:[],claims:[],sources:[],qualifications,obligations:[{originId:'qualification',kind:'qualification',value:qualifications}]};
 return {...source,sourceHash:hash(source)};
}
async function admitted(t,{noChart=false}={}){
 const f=await numericFixture({compact:true});t.after(()=>f.close());
 if(noChart){
  const provider=f.providers.author,execute=provider.execute;
  provider.execute=async request=>{
   if(!request.outputSchema.properties.researchContractVersion)return execute(request);
   const parsedOutput=output(request);
   return diskReceipt(f.root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(parsedOutput),parsedOutput,cost:null});
  };
 }
 const produced=await f.executor.execute('p',f.executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(produced.status,'succeeded',JSON.stringify(produced.error));
 f.artifact=f.store.read('p').artifacts[0];
 assert.equal((await f.executor.execute('p',await f.executor.enqueueVerification('p',f.artifact.id))).status,'succeeded');
 assert.equal((await f.executor.execute('p',await f.executor.enqueueReadiness('p',f.artifact.id,{protocolVersion:'research-readiness-v2'}))).status,'succeeded');
 await acceptedOperatorResearch(f);await f.executor.releaseResearch('p',releaseRequest(f),human);
 const admission=requireResearchChartAdmission(f.store.read('p'),f.artifact.id);
 assert.deepEqual(admission.raw,JSON.parse(await readFile(f.artifact.payloadRef,'utf8')).chartData);
 return admission;
}
function refuses(admissions){
 const {sourceHash,...data}=basis(),source={...data,researchChartAdmissions:admissions};source.sourceHash=hash(source);
 for(const project of [makeProjectedContentSource,directProjection])assert.throws(()=>project({},source),blocked);
 assert.throws(()=>neutralContent(source),blocked);
 for(const side of ['strategy','copy']){
  const envelopes={strategy:{},copy:{}};envelopes[side].researchChartAdmissions=admissions;
  assert.throws(()=>makeContentSource({},[],envelopes.strategy,envelopes.copy,()=>{}),blocked,`${side} envelope must block before old source construction`);
 }
}
test('real released numeric admission cannot enter legacy constructor, direct projection or neutral packet',async t=>{
 const admission=await admitted(t);assert.ok(admission.raw.charts.length);
 refuses([admission]);
 const empty={...structuredClone(admission),raw:null,charts:[],quantitativeClaims:[],catalogDigest:null,sourcesDigest:null,quantitativeManifestHash:null};
 const {admissionHash,...unsigned}=empty;empty.admissionHash=evidenceStateHash(unsigned);
 refuses([empty,admission]);refuses([admission,empty]);
 for(const authority of [null,{}, {verifications:[],readiness:[],handoffs:[],releases:[]}])refuses([{...structuredClone(admission),authority}]);
 for(const changes of [{raw:null},{charts:[]},{raw:null,charts:[]},{raw:undefined},{raw:{charts:[]}},{raw:null,charts:[],quantitativeClaims:[]}])refuses([{...structuredClone(admission),...changes}]);
 const nested={...basis(),immutableBasis:{researchChartAdmissions:[admission]}};
 assert.throws(()=>directProjection({},nested),blocked);assert.throws(()=>neutralContent(nested),blocked);
});
test('malformed numerical inventory fails closed at every legacy boundary',()=>{
 for(const value of [null,{},'numeric',[null],[{}],[{raw:null}],[{raw:false}],[{raw:{charts:[]}}]])refuses(value);
});
test('genuine new raw-null admission and missing historical field preserve exact legacy bytes and hashes',async t=>{
 const admission=await admitted(t,{noChart:true});assert.equal(admission.raw,null);assert.deepEqual(admission.charts,[]);assert.deepEqual(admission.quantitativeClaims,[]);
 const legacy=basis(),projected=directProjection({},legacy);
 assert.equal(hash(JSON.stringify(projected)),'681c2e0d5eae96830f58bc4f551c7267797c4f54c10552105581ac00d23e6c6e');
 assert.equal(hash(JSON.stringify(neutralContent(legacy))),'d1a34bf10643077b3a4023872a826a7f095ea9c9474229359409c872a35afeda');
 assert.deepEqual(makeProjectedContentSource({},legacy),projected);
 for(const inventory of [[],[admission]]){
  const {sourceHash,...data}=legacy,source={...data,researchChartAdmissions:inventory};source.sourceHash=hash(source);
  const result=directProjection({},source);
  assert.deepEqual(result.immutableBasis,source);
  assert.deepEqual(neutralContent(source),neutralContent(legacy));
 }
});
