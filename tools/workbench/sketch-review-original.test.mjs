import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,realpath,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {referenceFixturePng} from './reference-dossier-fixtures.mjs';
import {sketchHash as hash,sketchReviewOriginalPacket} from './sketch-authority.mjs';
import {REVIEW_ROLES,freezeReviewCohort,projectReviewNeutral,buildReviewRequest,ingestReviewResponse,requireReviewRun,requireReviewOriginal} from './sketch-review-v2.mjs';
import {independentVisualPanel} from './independent-panel.mjs';
import {verifySketchReviewOriginal} from './sketch-review-original.mjs';
import {verifySelectedOriginals} from './final-selected-originals.mjs';
import {copyDeliveryEnvelope} from './project.mjs';

async function fixture(valid=false) {
 const root=await realpath(await mkdtemp(join(tmpdir(),'review-original-owned-'))),imageStore=createImageEvidenceStore({rootDir:join(root,'images')});
 const asset=await imageStore.ingest({projectId:'p',bytes:referenceFixturePng(1),metadata:{representation:'supplied_image',description:'Constructed original prerequisite. No creative approval.'}}),loaded=await imageStore.read({projectId:'p',imageId:asset.id,expectedHash:asset.sha256});
 const directions=['a','b','c'].map(id=>({id,title:id,slogan:id,supportingCopy:id})),copy={id:'copy',technicalReceipts:{visualCatalogue:[]}},taskCard={id:'task'},source={dossierId:'dossier',sourceHash:'source',directionIds:directions.map(d=>d.id),images:[loaded.descriptor],reports:[],dissent:[],referenceSource:{taskCard,source:{artifactId:'copy',content:{directions,claims:[]}}},selection:directions.map(d=>({directionId:d.id,main:{id:'use-'+d.id,imageId:asset.id},complements:[],backups:[]}))};
 const candidates=directions.flatMap(d=>[0,1,2].map(i=>({id:d.id+i,directionId:d.id,coverage:[]}))),g={id:'generation',source,plan:{planHash:'plan',candidates}};
 const imageJobs=candidates.map(c=>({id:'image-'+c.id,generationId:g.id,nodeKey:c.id,outputVersionIds:[asset.id],attempts:[{id:'image-attempt-'+c.id,receipt:{synthetic:true}}]}));
 const p={id:'p',jobs:imageJobs,artifacts:[copy],taskCards:[taskCard],imageAssets:[asset],sketchGenerations:[g],sketchReviewRuns:[],activeByStage:{copy:'copy'},activeTaskCardId:'task'};
 const capability={operation:'sketch-review-v2',origin:'Owned constructed prerequisites',version:'v1',status:'synthetic_fixture',maxImages:100,maxBytes:1000000,maxPixels:1000000,assignment:{providerId:'owned',model:'synthetic'},limitations:['Constructed prerequisites. No consumer study.']};
 const assignments=Object.fromEntries([...REVIEW_ROLES.flatMap(r=>['score_'+r,'opposition_'+r]),'director','producer','consumer'].map(k=>[k,{providerId:'owned',model:'synthetic',role:k==='producer'?'sketch-lead':k==='consumer'?'visual-lead':k}]));
 const packet=sketchReviewOriginalPacket(p,g),cohorts=directions.map(d=>freezeReviewCohort(p,g,'direction-'+d.id,packet.candidates.filter(c=>c.directionId===d.id),capability));
 const run={id:'review-'+hash({generationId:g.id,sourceHash:packet.sourceHash,planHash:packet.planHash,packetHash:packet.packetHash}),protocol:'sketch-review-v2',generationId:g.id,sourceHash:packet.sourceHash,planHash:packet.planHash,packetHash:packet.packetHash,inventory:packet.candidates,production:{copy:directions,candidates,referenceRecords:{reports:[],dissent:[]}},capability,assignments,cohorts,nodes:cohorts.flatMap(c=>independentVisualPanel(c.id)),allowance:{id:'allowance',maxCalls:200,origin:'owned',version:'v1'},neutral:projectReviewNeutral(p,g),reports:[]};p.sketchReviewRuns.push(run);
 const node=run.nodes[0],request=buildReviewRequest(run,node,[]).request,attemptId=randomUUID(),receipt={runId:attemptId,requestedModel:'synthetic',model:'synthetic',exitCode:0,threadId:randomUUID(),inputPacketHash:hash({runId:attemptId,model:'synthetic',...request}),images:[loaded.descriptor],responseText:'{}'},attempt={id:attemptId,status:'succeeded',executor:{actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID()},receipt};
 if(valid){const input=buildReviewRequest(run,node,[]).input,evidence=[{imageId:asset.id,sha256:asset.sha256,region:'center',observation:'Owned geometry visible.'}];receipt.responseText=JSON.stringify({protocol:'sketch-review-v2',envelopeHash:input.envelopeHash,nodeKey:node.key,entries:input.cohort.candidates.map(c=>({...c,firstReading:'Owned local geometry.',score:4,cannotAssess:false,evidence,conditions:['exact_copy','required_reference_coverage','theme_connection','brand_role','no_hard_blocker'].map(name=>({name,status:'pass'})),findings:[]})),findings:[],comparisons:[]});}
 const report={id:attemptId+':report',nodeKey:node.key,phase:node.phase,role:node.role,receipt,...ingestReviewResponse(buildReviewRequest(run,node,[]).input,receipt)};
 run.reports.push(report);p.jobs.push({id:'sketch-review-'+hash([run.id,node.key]),stage:'sketch',purpose:'sketch_review_v2',inputVersionIds:['copy'],generationId:g.id,reviewRunId:run.id,nodeKey:node.key,binding:assignments.score_visual,task:{request},status:'succeeded',attempts:[attempt],outputVersionIds:[report.id]});
 const folder=join(root,attemptId);await mkdir(folder);await writeFile(join(folder,'packet.json'),JSON.stringify({runId:attemptId,model:'synthetic',...request}));await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt));await writeFile(join(folder,'response.txt'),receipt.responseText);
 return {p,run,root,imageStore,folder,loaded};
}
test('bounded original reads preserve invalid raw response and refuse changed originals with constructed prerequisites',async t=>{
 const f=await fixture(),read=()=>verifySketchReviewOriginal(f.p,f.run,{executionRoot:f.root,imageStore:f.imageStore});
 const checked=await read();assert.equal(checked.reports.length,1);assert.equal(checked.reports[0].valid,false);assert.ok(checked.dependencies.some(d=>d.kind==='sketch-generation'));assert.ok(checked.dependencies.some(d=>d.kind==='reference-dossier'));
 for(const name of ['packet.json','receipt.json','response.txt'])await t.test(name+' substitution',async()=>{const path=join(f.folder,name),bytes=await readFile(path);try{await writeFile(path,'tampered');await assert.rejects(read);}finally{await writeFile(path,bytes);}});
 for(const [label,change] of [['wrong report id',p=>p.sketchReviewRuns[0].reports[0].id='wrong'],['missing output',p=>p.jobs.at(-1).outputVersionIds=[]],['duplicate node job',p=>p.jobs.push(structuredClone(p.jobs.at(-1)))],['wrong context',p=>p.jobs.at(-1).attempts[0].executor.contextId=''],['reused thread',p=>p.jobs[0].attempts[0].receipt.threadId=p.jobs.at(-1).attempts[0].receipt.threadId],['legacy protocol',p=>p.sketchReviewRuns[0].protocol='sketch-review-v1']])await t.test(label,()=>{const p=structuredClone(f.p);change(p);assert.throws(()=>requireReviewOriginal(p,p.sketchReviewRuns[0]));});
 await t.test('actual managed image byte substitution',async()=>{const path=f.loaded.descriptor.path,bytes=await readFile(path);try{await chmod(path,0o600);await writeFile(path,Buffer.alloc(bytes.length));await assert.rejects(read);}finally{await writeFile(path,bytes);await chmod(path,0o400);}});
 await t.test('later current task changes do not rewrite original',async()=>{const p=structuredClone(f.p);p.activeTaskCardId='later';p.taskCards.push({id:'later'});assert.equal((await verifySketchReviewOriginal(p,p.sketchReviewRuns[0],{executionRoot:f.root,imageStore:f.imageStore})).reports.length,1);assert.throws(()=>requireReviewRun(p,p.sketchReviewRuns[0],copyDeliveryEnvelope));});
});

test('authoritative successful v2 original report with constructed prerequisites',async()=>{const f=await fixture(true),checked=await verifySketchReviewOriginal(f.p,f.run,{executionRoot:f.root,imageStore:f.imageStore});assert.equal(checked.reports[0].valid,true);assert.equal(checked.reports[0].slots.length,3);assert.equal(typeof verifySelectedOriginals,'function');});
