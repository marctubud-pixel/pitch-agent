import test from 'node:test';
import assert from 'node:assert/strict';
import {localFinalVisualCaseIdentity,localFinalVisualConfiguration,localFinalVisualPlan,localFinalVisualResponse,createLocalFinalVisualDriver} from './local-acceptance-final-visual-driver.mjs';
import {validateFinalPlan,ingestFinalResponse} from './final-visual.mjs';
const source=()=>({sourceHash:'s',copy:{directions:['steady','product','user'].map(id=>({id,slogan:id+' slogan',supportingCopy:'Approved support'})),claims:[]},selected:['steady','product','user'].map(id=>({directionId:id,candidateId:id+'-sketch',imageId:id+'-image',sha256:'a'.repeat(64)})),images:['steady','product','user'].map(id=>({imageId:id+'-image',sha256:'a'.repeat(64)})),task:{finalVisualRequirements:[]}});
test('local final configuration is finite explicitly synthetic and refuses real provider labels',()=>{
 const c=localFinalVisualConfiguration();assert.equal(c.bindings.visual.role,'visual-lead');assert.equal(c.finalVisualConfiguration.capabilities.owner.status,'synthetic_fixture');assert.throws(()=>localFinalVisualConfiguration({providerId:'real-provider'}),{code:'LOCAL_FINAL_SYNTHETIC_ONLY'});
});
test('plan preserves approved three directions, selected original edit inputs, copy and required packaging views',()=>{
 const s=source();s.task.finalVisualRequirements=[{kind:'packaging',views:['front','back','side']}];const input={production:{source:s},nodeKey:'planner'};const p=localFinalVisualPlan(input,{caseId:'dexian'});assert.ok(validateFinalPlan(p,s));
 for(const d of p.directions){const t=d.targets[0];assert.deepEqual(t.requiredViews,['front','back','side']);assert.equal(t.operation.kind,'edit');assert.deepEqual(t.operation.options,{size:'1280x720',quality:'standard',output_format:'png',response_format:'b64_json'});assert.equal(t.operation.images[0].imageId,d.selectedImageId);assert.deepEqual(d.approvedCopy,s.copy.directions.find(c=>c.id===d.directionId));assert.ok(t.operation.prompt.includes(d.approvedCopy.slogan));}
 const bad=structuredClone(p);bad.directions[0].targets[0].operation.images=[];assert.throws(()=>validateFinalPlan(bad,s));assert.throws(()=>localFinalVisualPlan(input,{}),{code:'LOCAL_FINAL_CASE_REQUIRED'});
});
test('mechanical scoring and blind opposition remain separate native reports',()=>{
 const input={protocol:'final-visual-v1',nodeKey:'score:visual',phase:'score',targets:[{targetId:'t',directionId:'steady',imageId:'i',sha256:'a'.repeat(64)}],images:[{imageId:'i',sha256:'a'.repeat(64)}]};
 const args={job:{purpose:'final_visual_review'},packet:input};const raw=localFinalVisualResponse(args);assert.equal(ingestFinalResponse(input,{responseText:JSON.stringify(raw)}).valid,true);assert.equal(raw.entries[0].score,4);
 input.phase='blind';input.nodeKey='blind:visual';const blind=localFinalVisualResponse(args);assert.equal(ingestFinalResponse(input,{responseText:JSON.stringify(blind)}).valid,true);assert.equal('entries' in blind,false);
 assert.equal(localFinalVisualResponse({job:{purpose:'verification'}}),undefined);
});
test('missing edit provider and absent actual reviewed sketch fail closed without creating artifacts',async()=>{
 const configuration=localFinalVisualConfiguration();let commands=0;const projectStore={read:()=>({id:'p',artifacts:[],activeByStage:{}}),command:()=>commands++};const ctx={project:{id:'p'},case:{caseId:'dexian'}};
 const absent=createLocalFinalVisualDriver({projectStore,configuration});assert.equal((await absent.inspect(ctx)).reason,'LOCAL_FINAL_IMAGE_PROVIDER_REQUIRED');
 const generateOnly=createLocalFinalVisualDriver({projectStore,configuration,imageProvider:{capability:()=>({invocationSupported:true,operations:{edit:false}})}});assert.equal((await generateOnly.advance(ctx)).reason,'LOCAL_FINAL_IMAGE_EDIT_UNAVAILABLE');
 const editing=createLocalFinalVisualDriver({projectStore,configuration,imageProvider:{capability:()=>({invocationSupported:true,operations:{edit:true}})}});assert.equal((await editing.inspect(ctx)).reason,'FINAL_SKETCH_REQUIRED');assert.equal(commands,0);
});

test('response routes explicit identity or project name without competitor mentions in brief',()=>{
 assert.equal(localFinalVisualCaseIdentity(undefined,{name:'得闲',brief:'参考梦之蓝M6+'}),'dexian');assert.equal(localFinalVisualCaseIdentity({caseId:'m6'},{name:'得闲'}),'m6');assert.throws(()=>localFinalVisualCaseIdentity({caseId:'unknown'},{}),{code:'LOCAL_FINAL_CASE_INVALID'});
 const packet={protocol:'final-visual-v1',phase:'planner',nodeKey:'planner',production:{source:source()}};const raw=localFinalVisualResponse({job:{purpose:'final_visual_plan'},packet,project:{name:'得闲'}});assert.equal(raw.directions[0].targets[0].kind,'packaging');const spec=JSON.parse(raw.directions[0].targets[0].operation.prompt.split('\n')[1]);assert.equal(spec.selectedImage.imageId,'steady-image');
});
