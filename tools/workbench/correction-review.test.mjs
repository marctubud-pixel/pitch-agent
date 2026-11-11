import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildCorrectionReviewRequest,validateCorrectionReviewOutput} from './correction.mjs';

const saved=JSON.parse(readFileSync(new URL('./fixtures/correction-review-v1-r12.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const clone=()=>structuredClone(saved.input);
function inputFor(content){
 const input={...clone(),reviewProtocolVersion:'correction-handling-v2',content};
 input.contentHash=hash(JSON.stringify(content,null,2));
 input.responses.forEach(response=>response.outputLocations=[{location:'/summary',quote:content.summary}]);
 return input;
}
function reportFor(input,location='/summary',quote=input.content.summary){
 const report=structuredClone(saved.validReport);
 report.protocolVersion=input.reviewProtocolVersion??'correction-handling-v1';report.contentHash=input.contentHash;
 report.findings.forEach(finding=>finding.refs=[{location,quote}]);
 return report;
}
function locations(request){return request.outputSchema.properties.findings.items.properties.refs.items.properties.location.enum;}
const preservationLocations=request=>request.outputSchema.properties.preservationCheck.properties.violations.items.properties.refs.items.properties.location.enum;

test('saved actual R12 absent-selector v1 request and valid normalization keep pre-change independent provider hashes',()=>{
 const request=buildCorrectionReviewRequest(saved.input),expected=saved.expected;
 assert.equal(Object.hasOwn(saved.input,'reviewProtocolVersion'),false);
 assert.equal(hash(JSON.stringify(saved.input)),expected.inputHash);
 assert.equal(hash(JSON.stringify(request)),expected.requestHash);
 assert.equal(hash(request.prompt),expected.promptHash);
 assert.equal(hash(JSON.stringify(request.outputSchema)),expected.schemaHash);
 assert.deepEqual(request.manifest,expected.manifest);
 assert.equal(hash(JSON.stringify({runId:saved.provenance.runId,model:saved.provenance.model,prompt:request.prompt,outputSchema:request.outputSchema})),expected.packetHash);
 assert.equal(hash(JSON.stringify(validateCorrectionReviewOutput(saved.validReport,saved.input))),expected.normalizedHash);
 assert.throws(()=>validateCorrectionReviewOutput(saved.rawReport,saved.input),/Missing JSON Pointer/);
});

test('v2 enum contains every actual R12 content string leaf and both channels validate their exact quotes',()=>{
 const input={...clone(),reviewProtocolVersion:'correction-handling-v2'},request=buildCorrectionReviewRequest(input),expected=[];
 function leaves(value,path=''){
  if(typeof value==='string'&&value.length)expected.push([path,value]);
  else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))leaves(item,`${path}/${key.replaceAll('~','~0').replaceAll('/','~1')}`);
 }
 leaves(input.content);assert.equal(expected.length,203);
 assert.deepEqual(locations(request),expected.map(([path])=>path));
 assert.deepEqual(preservationLocations(request),locations(request));
 assert.match(request.prompt,/never prepend.*\/content/i);
 assert.equal(request.outputSchema.properties.protocolVersion.enum[0],'correction-handling-v2');
 for(const [path,quote]of expected){
  const report=reportFor(input,path,quote);
  report.preservationCheck.violations=[{constraintKey:input.correctionInput.sources.flatMap(s=>s.constraints)[0].key,kind:'contradiction',reason:'Synthetic exact-location check',refs:[{location:path,quote}]}];
  assert.equal(validateCorrectionReviewOutput(report,input).hasBlockingFindings,true,path);
 }
});

test('v2 escapes own keys, keeps genuine content key, and excludes empty and non-string leaves',()=>{
 const content={summary:'Changed summary',content:{summary:'Genuine content property'},'a/b':{'~x':'Escaped text','':'Empty key text'},items:['Array text',42,null,false,{},''],empty:''};
 const input=inputFor(content),request=buildCorrectionReviewRequest(input);
 assert.deepEqual(locations(request),['/summary','/content/summary','/a~1b/~0x','/a~1b/','/items/0']);
 for(const [path,quote]of [['/content/summary','Genuine content property'],['/a~1b/~0x','Escaped text'],['/a~1b/','Empty key text'],['/items/0','Array text']])assert.equal(validateCorrectionReviewOutput(reportFor(input,path,quote),input).hasBlockingFindings,false);
 const inherited=Object.assign(Object.create({ghost:'Ghost text'}),content),withInherited=inputFor(inherited);
 assert.equal(locations(buildCorrectionReviewRequest(withInherited)).includes('/ghost'),false);
});

test('v2 rejects missing, invalid, envelope, source and process references in either channel without repairing them',()=>{
 const input=inputFor({summary:'Changed summary',items:['Array text',12,null],empty:''}),constraintKey=input.correctionInput.sources.flatMap(s=>s.constraints)[0].key;
 for(const location of ['/content/summary','/responses/0/explanation','/correctionInput/baseContent/summary','/correctionInput/sources/0/rawReport/limitations/0','/items/00','/items/01','/items/-1','/items/1','/items/2','/items','/empty','/missing','/summ~2ary','summary','']){
  for(const channel of ['finding','preservation']){
   const report=reportFor(input);
   if(channel==='finding')report.findings[0].refs=[{location,quote:'Changed summary'}];
   else report.preservationCheck.violations=[{constraintKey,kind:'contradiction',reason:'Synthetic invalid location',refs:[{location,quote:'Changed summary'}]}];
   const before=structuredClone(report);assert.throws(()=>validateCorrectionReviewOutput(report,input),undefined,`${channel} ${location}`);assert.deepEqual(report,before);
  }
 }
 const wrongQuote=reportFor(input,'/summary',input.correctionInput.baseContent.summary);
 assert.throws(()=>validateCorrectionReviewOutput(wrongQuote,input),/Quote must occur/);
 input.responses[0].explanation='Text present only in producer process responses';
 for(const quote of [input.responses[0].explanation,input.correctionInput.baseContent.summary]){
  const report=reportFor(input,'/summary',quote);assert.throws(()=>validateCorrectionReviewOutput(report,input),/Quote must occur/);
  const preservation=reportFor(input);preservation.preservationCheck.violations=[{constraintKey,kind:'contradiction',reason:'Synthetic process-only quote',refs:[{location:'/summary',quote}]}];
  assert.throws(()=>validateCorrectionReviewOutput(preservation,input),/Quote must occur/);
 }
});

test('frozen version and content are validated at both request and output boundaries',()=>{
 const input=inputFor({summary:'Changed summary'}),report=reportFor(input);
 for(const version of ['correction-handling-v5','',null,2,undefined]){
  const changed={...input,reviewProtocolVersion:version};
  assert.throws(()=>buildCorrectionReviewRequest(changed),/Unknown correction review protocol/);
  assert.throws(()=>validateCorrectionReviewOutput(report,changed),/Unknown correction review protocol/);
 }
 const v1={...input,reviewProtocolVersion:'correction-handling-v1'};assert.throws(()=>validateCorrectionReviewOutput(report,v1),/invalid string/);
 assert.throws(()=>validateCorrectionReviewOutput({...report,protocolVersion:'correction-handling-v1'},input),/invalid string/);
 assert.throws(()=>buildCorrectionReviewRequest({...input,content:{summary:'Changed bytes'}}),/Exact corrected content/);
 const noLeaves={...input,content:{nothing:null,count:2,empty:''},responses:input.responses.map(r=>({...r,action:'disputed',outputLocations:[]}))};
 noLeaves.contentHash=hash(JSON.stringify(noLeaves.content,null,2));assert.throws(()=>buildCorrectionReviewRequest(noLeaves),/string leaf/);
});
