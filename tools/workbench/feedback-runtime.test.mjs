import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {createImageEvidenceStore,imageManifest} from './image-evidence.mjs';
import {releaseReadiness} from './project.mjs';

const human={actorType:'human',actorId:'test-human',runId:'h',contextId:'h'};
const sha=s=>createHash('sha256').update(s).digest('hex');
const source={id:'s1',url:'https://example.org/primary',text:'标签应显示品类信息。',verification:'captured',scopeRelation:'background'};
const draft=body=>({outputKind:'research_findings',status:'draft',title:'研究稿',summary:body,sections:[{heading:'信息任务',body,evidenceIds:['s1']}],claims:[{text:'标签应显示品类信息。',kind:'fact',evidenceRefs:['s1'],limitations:['仅所供摘录，待独立核验']}],gaps:['未形成用户偏好结论'],evidenceClassifications:[{sourceId:'s1',scopeRelation:'background',reason:'有界背景'}]});
const quoted=prompt=>JSON.parse(prompt.slice(prompt.indexOf('UNTRUSTED_JSON_DATA\n')+'UNTRUSTED_JSON_DATA\n'.length,prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
function receipt(request,output){const images=request.images?.length?imageManifest(request.images):[];return {runId:request.runId,requestedModel:'synthetic',model:'synthetic',threadId:randomUUID(),inputPacketHash:sha(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema,...(images.length?{images}:{})})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output,...(images.length?{images}:{}),usage:{input_tokens:1},cost:null};}
async function fixture(t,handler){const root=await realpath(await mkdtemp(join(tmpdir(),'feedback-runtime-'))),store=openStore(join(root,'db')),calls=[];t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});store.create({id:'p',name:'Synthetic feedback integration',brief:'包装研究，仅测试',mode:'assisted',humanGates:['research']},human);const send=c=>store.command('p',{commandId:randomUUID(),expectedRevision:store.read('p').revision,...c},human);send({kind:'confirm-task-card',taskCardId:'p:scope:1'});const imageStore=createImageEvidenceStore({rootDir:join(root,'images')});const providers={synthetic:{model:'synthetic',execute:async request=>{calls.push(request);return receipt(request,await handler(request));}}};const bindings=Object.fromEntries(['research','feedback_review'].map(stage=>[stage,{providerId:'synthetic',model:'synthetic',role:stage+'-lead'}]));const executor=createExecutor({store,rootDir:root,providers,bindings,imageStore});const jobId=executor.enqueue('p','research',{sourceRecords:[source]});const initial=await executor.execute('p',jobId);assert.equal(initial.status,'succeeded',JSON.stringify(initial.error));return {root,store,executor,imageStore,calls,send,artifactId:store.read('p').activeByStage.research};}
function output(request){const data=quoted(request.prompt);if(data.revisionInput&&data.content){return {protocolVersion:'human-feedback-v1',artifactId:data.artifactId,contentHash:data.contentHash,feedbackHash:data.revisionInput.feedbackHash,findings:data.revisionInput.feedback.map(f=>({feedbackId:f.id,status:'addressed',category:'creative_preference',reason:'在新版实际文本找到要求',refs:[{location:'/summary',quote:'先识别品类，再看图形'}]})),limitations:['不是审美通过']};}if(data.revisionInput){return {...draft('先识别品类，再看图形'),feedbackResponses:data.revisionInput.feedback.map(f=>({feedbackId:f.id,action:'applied',explanation:'改为明确的信息阅读顺序',outputLocations:[{location:'/summary',quote:'先识别品类，再看图形'}]}))};}return draft('初稿信息任务');}

test('frozen human theme, complete base and actual image reach revision and independent review; history and gates remain',async t=>{
 const f=await fixture(t,output),old=f.store.read('p').artifacts[0];
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64');
 const asset=await f.imageStore.ingest({projectId:'p',bytes:png,metadata:{representation:'supplied_image',description:'synthetic material'}});f.store.command('p',{kind:'register-image',asset,commandId:randomUUID(),expectedRevision:f.store.read('p').revision},{actorType:'agent',actorId:'image-ingest',runId:'ingest',contextId:'ingest'});
 f.send({kind:'submit-feedback',artifactId:old.id,feedbackId:'f1',instructions:'请明确阅读顺序',themes:[{text:'先识别品类，再看图形',intendedUse:'研究表达候选'}],materials:[{imageId:asset.id,intendedUse:'版面借鉴',borrowingNotes:'只看主次层级'}]});
 assert.throws(()=>f.executor.enqueue('p','research',{sourceRecords:[source]}),{code:'FEEDBACK_REVISION_REQUIRED'});
 const request={artifactId:old.id,commandId:'rev1',expectedRevision:f.store.read('p').revision},jobId=await f.executor.enqueueRevision('p',request);
 assert.equal(await f.executor.enqueueRevision('p',request),jobId);
 assert.equal((await f.executor.execute('p',jobId)).status,'succeeded');
 const p=f.store.read('p'),a=p.artifacts.at(-1),sent=quoted(f.calls[1].prompt);
 assert.equal(sent.revisionInput.baseContent.summary,'初稿信息任务');assert.equal(sent.revisionInput.feedback[0].themes[0].text,'先识别品类，再看图形');
 assert.equal(f.calls[1].images[0].sha256,asset.sha256);assert.deepEqual(await readFile(f.calls[1].images[0].path),png);
 assert.deepEqual(a.inputVersionIds,['p:scope:1']);assert.equal(a.revision.revisionOf.artifactId,old.id);assert.deepEqual(p.artifacts[0],old);
 const content=JSON.parse(await readFile(a.payloadRef,'utf8'));assert.equal(content.summary,'先识别品类，再看图形');assert.equal(Object.hasOwn(content,'feedbackResponses'),false);
 assert.equal(a.claims[0].verification,'pending');assert.equal(p.releases.length,0);
 const reviewId=await f.executor.enqueueFeedbackReview('p',{artifactId:a.id,commandId:'check1',expectedRevision:p.revision});
 assert.equal((await f.executor.execute('p',reviewId)).status,'succeeded');
 const checked=f.store.read('p');assert.equal(checked.feedbackReviews.length,1);assert.equal(checked.feedbackReviews[0].hasBlockingFindings,false);
 assert.notEqual(checked.feedbackReviews[0].executionReceipt.threadId,a.executionReceipt.threadId);assert.equal(f.calls[2].images[0].sha256,asset.sha256);
 assert.equal(checked.decisions.length,0);assert.equal(checked.releases.length,0);assert.equal(releaseReadiness(checked,a.id).eligible,false);
});

test('new feedback during real provider wait retains old revision output as stale without replacing head',async t=>{
 let release,arrived;const started=new Promise(r=>arrived=r),waiting=new Promise(r=>release=r);
 const f=await fixture(t,async req=>{if(quoted(req.prompt).revisionInput){arrived();await waiting;}return output(req);});
 f.send({kind:'submit-feedback',artifactId:f.artifactId,feedbackId:'f1',instructions:'明确阅读顺序',themes:[],materials:[]});
 const id=await f.executor.enqueueRevision('p',{artifactId:f.artifactId,commandId:'revision',expectedRevision:f.store.read('p').revision});
 const running=f.executor.execute('p',id);await started;
 f.send({kind:'submit-feedback',artifactId:f.artifactId,feedbackId:'f2',instructions:'增加限制说明',themes:[],materials:[]});release();
 assert.equal((await running).status,'succeeded_stale');assert.equal(f.store.read('p').activeByStage.research,f.artifactId);assert.equal(f.store.read('p').artifacts.length,2);
});

test('unknown revision invocation never retries or invents a revised artifact',async t=>{
 const f=await fixture(t,req=>{if(quoted(req.prompt).revisionInput)throw Object.assign(new Error('uncertain remote result'),{status:'awaiting_reconciliation'});return output(req);});
 f.send({kind:'submit-feedback',artifactId:f.artifactId,feedbackId:'f1',instructions:'明确阅读顺序',themes:[],materials:[]});
 const id=await f.executor.enqueueRevision('p',{artifactId:f.artifactId,commandId:'revision',expectedRevision:f.store.read('p').revision});
 assert.equal((await f.executor.execute('p',id)).status,'awaiting_reconciliation');await assert.rejects(()=>f.executor.execute('p',id,{retry:true}));assert.equal(f.calls.length,2);assert.equal(f.store.read('p').artifacts.length,1);
});
