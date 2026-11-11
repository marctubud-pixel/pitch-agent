import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyFinalVisualOriginal} from './final-visual-original.mjs';
import {createFinalVisualRuntime} from './final-visual-runtime.mjs';
import {finalRequest,ingestFinalResponse,FINAL_VISUAL_PROTOCOL} from './final-visual.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'final-original-owned-')),binding={providerId:'local',model:'local',role:'visual-lead'};
 const attachment=Buffer.from('owned attachment bytes'),attachmentPath=join(root,'attachment.png');await writeFile(attachmentPath,attachment);
 const image={imageId:'original-image',sha256:createHash('sha256').update(attachment).digest('hex'),mediaType:'image/png',byteLength:attachment.length,width:2,height:2};
 const source={sourceHash:hash('constructed upstream only'),copyArtifactId:'copy',copyHash:hash('copy'),sketchArtifact:{id:'sketch',contentHash:hash('sketch'),authority:{generationId:'generation',reviewRunId:'review'}},images:[image],copy:{directions:[],claims:[]},task:{id:'task'},neutralReferences:{referenceBoundaries:[],referenceQualifications:[]},handoffs:[{id:'handoff:producer'},{id:'handoff:consumer'}],referenceSource:{dossierId:'dossier'},referenceRecords:{reports:[]}};
 const run={id:'final-run',source,assignments:{planner:binding},capabilities:{owner:{maxImages:1,maxBytes:1024,maxPixels:4}},reports:[]};
 const job={id:'planner-job',finalVisualRunId:run.id,nodeKey:'planner',node:{key:'planner',phase:'planner',role:'visual-lead',dependencies:[]},purpose:'final_visual_plan',binding,inputVersionIds:['copy','sketch'],status:'succeeded',attempts:[]};
 const p={id:'owned',finalVisualRuns:[run],jobs:[job],artifacts:[{id:'copy',contentHash:source.copyHash},{id:'sketch',contentHash:source.sketchArtifact.contentHash,sketchGeneration:source.sketchArtifact.authority}],imageAssets:[]};
 const request=finalRequest(p,run,job.node),packet={runId:'attempt',model:'local',...request.request},raw={protocol:FINAL_VISUAL_PROTOCOL,envelopeHash:request.input.envelopeHash,nodeKey:'planner',kind:'return',sourceHash:source.sourceHash,owner:'visual-lead',returnLocation:'copy',requirement:'Constructed local return',acceptance:'Exact copy correction'};
 const receipt={runId:'attempt',model:'local',requestedModel:'local',exitCode:0,threadId:'owned-thread',inputPacketHash:hash(packet),images:[{...image,path:attachmentPath}],responseText:JSON.stringify(raw)};
 const attempt={id:'attempt',status:'succeeded',dispatchStarted:true,executor:{actorId:'owned',runId:'attempt',contextId:'context'},receipt};job.attempts.push(attempt);
 const report={id:'attempt:report',nodeKey:'planner',phase:'planner',role:'visual-lead',receipt,...ingestFinalResponse(request.input,receipt)};run.reports.push(report);job.outputVersionIds=[report.id];
 const folder=join(root,'attempt');await mkdir(folder);for(const [file,bytes] of Object.entries({'packet.json':JSON.stringify(packet),'receipt.json':JSON.stringify(receipt),'response.txt':receipt.responseText}))await writeFile(join(folder,file),bytes);
 return {root,p,run,job,verify:()=>verifyFinalVisualOriginal(p,run,job,{executionRoot:root,imageStore:{read:async()=>({asset:{id:image.imageId,projectId:p.id,...image},descriptor:{...image,path:attachmentPath},bytes:await readFile(attachmentPath)})}})};
}

test('owned final text originals preserve exact parser and return evidence with constructed upstream',async t=>{
 const f=await fixture(),fact=await f.verify();assert.equal(fact.kind,'final-visual-text-original');assert.equal(f.run.reports[0].valid,true);assert.equal(fact.reportId,'attempt:report');assert.equal(fact.dependencies.filter(d=>d.kind==='sketch-review-report').length,2);
 for(const file of ['packet.json','receipt.json','response.txt'])await t.test(`${file} substitution refused`,async()=>{const path=join(f.root,'attempt',file),bytes=await readFile(path);await writeFile(path,'{}');await assert.rejects(f.verify,{code:'FINAL_RECEIPT_CHANGED'});await writeFile(path,bytes);});
 await t.test('attachment tamper refused',async()=>{const path=f.job.attempts[0].receipt.images[0].path,bytes=await readFile(path);await writeFile(path,'tampered');await assert.rejects(f.verify,{code:'FINAL_ATTACHMENT_CHANGED'});await writeFile(path,bytes);});
 await t.test('unknown later attempt refused',async()=>{f.job.attempts.push({id:'unknown',status:'unknown',dispatchStarted:true});await assert.rejects(f.verify,{code:'FINAL_ORIGINAL_MEMBERSHIP_REQUIRED'});f.job.attempts.pop();});
 await t.test('ambiguous attempt host refused',async()=>{f.p.jobs.push({id:'other-job',attempts:[structuredClone(f.job.attempts[0])]});await assert.rejects(f.verify,{code:'FINAL_ORIGINAL_MEMBERSHIP_REQUIRED'});f.p.jobs.pop();});
 await t.test('ambiguous registered report refused',async()=>{f.run.reports.push(structuredClone(f.run.reports[0]));await assert.rejects(f.verify,{code:'FINAL_ORIGINAL_MEMBERSHIP_REQUIRED'});f.run.reports.pop();});
 await t.test('report projection tamper refused',async()=>{f.run.reports[0].valid=false;await assert.rejects(f.verify,{code:'FINAL_ORIGINAL_CHANGED'});f.run.reports[0].valid=true;});
 await t.test('changed request source refused',async()=>{f.run.source.task.brief='changed';await assert.rejects(f.verify,{code:'FINAL_RECEIPT_CHANGED'});delete f.run.source.task.brief;});
 await t.test('historical original survives current selection changes while live wrapper refuses',async()=>{f.p.activeByStage={sketch:'later-sketch'};assert.equal((await f.verify()).reportId,'attempt:report');const runtime=createFinalVisualRuntime({store:{read:()=>f.p},root:f.root,sketchReviews:{},providers:{},bindings:{},imageStore:{}});await assert.rejects(()=>runtime.verifyFinalVisual(f.p.id,{finalVisual:{runId:f.run.id}}),{code:'FINAL_SKETCH_REQUIRED'});});
 console.log(JSON.stringify({ownedRoot:f.root,originalReport:fact.reportId,authority:'constructed_upstream_and_registered_final_metadata_only',liveReducerCompletion:'not_established'}));
});

test('aggregate archive parser exception retains only the exact original diagnostic',async()=>{
 const f=await fixture(),{run,job,p}=f;run.plan={directions:[],planHash:'constructed-plan'};run.source.selected=[];run.assignments.aggregate=job.binding;job.nodeKey='aggregate';job.node={key:'aggregate',phase:'aggregate',role:'visual-lead',dependencies:[]};job.purpose='final_visual_aggregate';
 const request=finalRequest(p,run,job.node),receipt=job.attempts[0].receipt;
 receipt.responseText=JSON.stringify({protocol:FINAL_VISUAL_PROTOCOL,envelopeHash:request.input.envelopeHash,nodeKey:'aggregate',kind:'aggregate',decision:'accept',understanding:'Owned archive parser contract',findings:[],payload:{score:4}});
 const packet={runId:'attempt',model:'local',...request.request};receipt.inputPacketHash=hash(packet);
 const parsed=ingestFinalResponse(request.input,receipt);assert.equal(parsed.valid,true);
 run.reports[0]={id:'attempt:report',nodeKey:'aggregate',phase:'aggregate',role:'visual-lead',receipt,...parsed,valid:false,aggregateParser:'old-parser',diagnostics:['incomplete_or_invalid_original']};
 for(const [name,bytes] of Object.entries({'packet.json':JSON.stringify(packet),'receipt.json':JSON.stringify(receipt),'response.txt':receipt.responseText}))await writeFile(join(f.root,'attempt',name),bytes);
 assert.equal((await f.verify()).kind,'final-visual-text-original');
 run.reports[0].diagnostics=['different'];await assert.rejects(f.verify,{code:'FINAL_ORIGINAL_CHANGED'});
 run.reports[0].diagnostics=['incomplete_or_invalid_original'];run.reports[0].slots=[{changed:true}];await assert.rejects(f.verify,{code:'FINAL_ORIGINAL_CHANGED'});
});
