import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalImageOverlay} from './local-image-overlay.mjs';
import {localSketchConfiguration,localSketchResponse,createLocalSketchDriver} from './local-acceptance-sketch-driver.mjs';
import {validateSketchPlan} from './sketch-authority.mjs';
import {ingestReviewResponse,CONDITIONS,COMPOSITE_CONDITIONS} from './sketch-review-v2.mjs';
import {syntheticImagePrompt,parseSyntheticImagePrompt,localSyntheticImageConfig,createSyntheticImageServer} from '../local-acceptance/synthetic-image-server.mjs';
const binding={providerId:'local-synthetic',model:'synthetic',role:'references-lead'};
test('configuration keeps actual reference binding and explicitly synthetic bounded capacity',()=>{
 const c=localSketchConfiguration({referenceBinding:binding});assert.deepEqual(c.bindings.reference_lead,binding);assert.equal(c.sketchReviewConfiguration.capability.status,'synthetic_fixture');assert.equal(c.sketchReviewConfiguration.maxCalls,54);
 assert.throws(()=>localSketchConfiguration({referenceBinding:{...binding,model:'other'}}),/BINDING_REQUIRED/);
 assert.equal(localSyntheticImageConfig({baseUrl:'http://127.0.0.1:4399/v1'}).operations.edit,true);assert.throws(()=>localSyntheticImageConfig({baseUrl:'https://example.com/v1'}),/LOOPBACK/);
 const s=createSyntheticImageServer({token:'synthetic-local-only-test-token'});assert.equal(s.listening,false);assert.throws(()=>s.listen(4399,'0.0.0.0'),/LOOPBACK/);
});
test('planner preserves current exact copy, nine different compositions and all main/complement coverage',()=>{
 const copy=['steady','product','user'].map(id=>({id,title:id,slogan:'原定主题'+id,supportingCopy:'原定说明'+id}));
 const source={sourceHash:'a'.repeat(64),directionIds:copy.map(d=>d.id),referenceSource:{source:{content:{directions:copy}}},selection:copy.map(d=>({directionId:d.id,main:{id:d.id+'-main',imageId:d.id+'-image'},complements:[{id:d.id+'-comp',imageId:d.id+'-comp-image'}],backups:[]}))};
 const packet={protocol:'project-sketch-v1',kind:'plan',sourceHash:'a'.repeat(64),source};
 const raw=localSketchResponse({job:{purpose:'sketch_plan'},packet,project:{name:'得闲'}});
 assert.equal(raw.candidates.length,9);assert.deepEqual(raw.copy,copy);validateSketchPlan(raw,source);
 for(const c of raw.candidates){const spec=parseSyntheticImagePrompt(c.operation.prompt);assert.equal(spec.slogan,copy.find(d=>d.id===c.directionId).slogan);assert.equal(spec.caseId,'dexian');assert.equal(c.coverage.length,2);}
 assert.throws(()=>localSketchResponse({job:{purpose:'sketch_plan'},packet,project:{name:'得闲'},case:{caseId:'m6'}}),/CASE_MISMATCH/);
 const prompt=syntheticImagePrompt({caseId:'m6',directionId:'steady',variant:0,slogan:'新年',supportingCopy:'说明'});assert.equal(parseSyntheticImagePrompt(prompt).caseId,'m6');assert.throws(()=>parseSyntheticImagePrompt(prompt+'trailing'),/PROMPT_INVALID/);
});
test('synthetic score blind challenge director and handoff retain native protocol shapes without claiming real quality',()=>{
 const candidates=[0,1,2].map(n=>({candidateId:'c'+n,directionId:'steady',imageId:'i'+n,sha256:String(n).repeat(64)})),images=candidates.map(c=>({imageId:c.imageId,sha256:c.sha256}));
 const base={protocol:'sketch-review-v2',envelopeHash:'a'.repeat(64),nodeKey:'node',cohort:{candidates},images,predecessors:[]};
 for(const phase of ['score','blind','challenge','director','producer','consumer'])for(const qualitative of [false,true]){
  const input={...base,phase,qualitative,handoff:{completeCopy:[{id:'steady',slogan:'原定主题'}]}};
  const raw=localSketchResponse({job:{purpose:['producer','consumer'].includes(phase)?'sketch_refinement_handoff':'sketch_review_v2'},packet:input});
  const result=ingestReviewResponse(input,{responseText:JSON.stringify(raw)});assert.equal(result.valid,true,phase+' '+qualitative+' '+JSON.stringify(result.diagnostics));assert.match(raw.limitations[0],/predetermined mechanical/);
  if(phase==='director')assert.equal(raw.conditions.length,3*(qualitative?COMPOSITE_CONDITIONS:CONDITIONS).length);
 }
 assert.throws(()=>localSketchResponse({job:{purpose:'sketch_review_v2'},packet:{...base,phase:'challenge',predecessors:[{findings:[{id:'real-issue'}]}]}}),/UNEXPECTED_DISSENT/);
});
test('no references means no generation or registration and missing originals never pass',async()=>{
 let effects=0;const project={id:'p',name:'得闲',artifacts:[],activeByStage:{copy:'copy-1'},jobs:[]};
 const executor={referenceStatus:async()=>({status:'waiting_source'}),continueSketch:async()=>{effects++;}};
 const d=createLocalSketchDriver({projectStore:{read:()=>project},executor});assert.equal((await d.advance({project})).status,'blocked');assert.equal(effects,0);
 project.sketchGenerations=[{id:'g'}];project.activeByStage.sketch='s';project.artifacts=[{id:'s',sketchGeneration:{protocol:'sketch-review-v2'}}];executor.verifyReviewedSketch=async()=>{throw Object.assign(Error('changed'),{code:'REVIEW_IMAGE_CHANGED'});};
 assert.equal((await d.inspect({project})).reason,'REVIEW_IMAGE_CHANGED');
});
test('human gate only adopts after explicit decision of exact current authority; advance never signs',async()=>{
 const artifact={id:'s',sketchGeneration:{protocol:'sketch-review-v2',reviewRunId:'r',selected:['exact']}};
 const p={id:'p',revision:7,name:'得闲',activeByStage:{copy:'c',sketch:'s'},artifacts:[artifact],jobs:[],sketchGenerations:[{id:'g'}],sketchReviewRuns:[{id:'r',reports:[]}],policies:[{version:2,humanGates:['sketch']}],decisions:[]};
 const writes=[],executor={verifyReviewedSketch:async()=>{},referenceStatus:async()=>({status:'ready_for_sketch'})},store={read:()=>p,command:(id,c,who)=>writes.push({id,c,who})};
 const driver=createLocalSketchDriver({projectStore:store,executor}),ctx={project:structuredClone(p)};
 assert.equal((await driver.advance(ctx)).status,'awaiting_user');assert.equal(writes.length,0);
 await assert.rejects(driver.decide({...ctx,request:{decision:'approve',contribution:'new slogan',commandId:'no'}}),/CONTRIBUTION_HANDLER/);
 const stale=structuredClone(p);stale.artifacts[0].sketchGeneration.selected=['different'];await assert.rejects(driver.decide({project:stale,request:{decision:'approve',commandId:'stale'}}),/HUMAN_SOURCE_STALE/);assert.equal(writes.length,0);
 await driver.decide({...ctx,request:{decision:'approve',commandId:'explicit-human',comment:'Accept current local fixture'}});
 assert.equal(writes.length,1);assert.equal(writes[0].c.kind,'adopt-creative');assert.equal(writes[0].c.artifactId,'s');assert.equal(writes[0].c.expectedRevision,7);assert.equal(writes[0].who.actorType,'human');
});

test('image overlay routes exact inherited IDs without fallback and rejects ambiguous root ownership',async()=>{
 let freshReads=0;const old={read:async()=>{throw Error('changed old original');}},fresh={read:async()=>{freshReads++;return 'fresh';},ingestGenerated:async()=>{}};
 const overlay=createLocalImageOverlay({inherited:[{imageIds:['old-id'],store:old}],freshStore:fresh});
 await assert.rejects(overlay.read({imageId:'old-id'}),/changed old original/);assert.equal(freshReads,0);assert.equal(await overlay.read({imageId:'new-id'}),'fresh');
 assert.throws(()=>createLocalImageOverlay({inherited:[{imageIds:['same'],store:old},{imageIds:['same'],store:old}],freshStore:fresh}),/ID_COLLISION/);
});
