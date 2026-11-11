import {buildImageObservationReviewRequest} from './image-observation-review.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject, applyCommand} from './project.mjs';
import {buildImageObservationRequest, imageManifest} from './image-evidence.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
const human = {actorType: 'human', actorId: 'human', runId: 'human-run', contextId: 'human-context'};
const agent = {actorType: 'agent', actorId: 'observer', runId: 'observer-run', contextId: 'observer-context'};
const asset = {id: 'img_one', projectId: 'project', sha256: 'a'.repeat(64), mediaType: 'image/png', byteLength: 100, width: 10, height: 10, uploadedAt: '2026-10-24', provenance: {representation: 'screenshot', originalFilename: 'example.png'}};
function fixture() {
  let p = createProject({id: 'project', name: 'Project', brief: 'Brief'}, human);
  let seq = 0;
  const send = (c, context = agent) => p = applyCommand(p, {...c, commandId: `command-${++seq}`, expectedRevision: p.revision}, context);
  send({kind: 'confirm-task-card', taskCardId: p.activeTaskCardId}, human);
  send({kind: 'register-image', asset});
  const images = imageManifest([asset]);
  const request = buildImageObservationRequest({images});
  const binding = {providerId: 'codex', model: 'model', role: 'image-observer'};
  const task = {id: 'task', owner: 'observer', parentId: null, observationInput: {taskCard: p.taskCards[0], images}, request};
  const queue = {kind: 'request-observation', jobId: 'job', binding, task};
  const rawReport = {manifestHash: request.manifestHash, observations: [{imageId: asset.id, imageSha256: asset.sha256, visibleFeatures: [{id: 'f1', description: 'A circle', region: 'center'}], legibleText: [], uncertainties: ['Text unreadable'], limitations: ['Screenshot does not establish physical properties']}]};
  const executionReceipt = {attemptId: 'attempt', runId: 'attempt', providerId: 'codex', model: 'model', requestedModel: 'model', role: 'image-observer', taskId: 'task', threadId: 'thread', exitCode: 0, images: images.map(i => ({...i, path: '/private/image.png'})), responseText: JSON.stringify(rawReport), inputPacketHash: digest(JSON.stringify({runId: 'attempt', model: 'model', prompt: request.prompt, outputSchema: request.outputSchema, images}))};
  const complete = {kind: 'complete-observation', jobId: 'job', attemptId: 'attempt', reportId: 'report', rawReport, payloadRef: 'payload.json', contentHash: digest(JSON.stringify(rawReport, null, 2)), executionReceipt};
  return {send, get: () => p, queue, complete};
}

const reviewer={actorType:'agent',actorId:'reviewer',runId:'review-run',contextId:'review-context'};
function reviewedFixture(){
 const f=fixture();f.send(f.queue);f.send({kind:'start-job',jobId:'job',attemptId:'attempt'});f.send(f.complete);
 const observation=f.get().imageObservations[0],input={observationId:observation.id,contentHash:observation.reportHash,taskCard:observation.taskCard,images:observation.images,rawReport:observation.rawReport};
 const request=buildImageObservationReviewRequest(input),binding={providerId:'codex',model:'model',role:'reviewer'};
 const queue={kind:'request-observation-review',observationId:observation.id,jobId:'review-job',binding,task:{id:'review-task',owner:'reviewer',parentId:null,observationReviewInput:input}};
 const rawReport={manifestHash:request.manifestHash,observationHash:request.observationHash,findings:[{id:'f1',status:'unsupported',reason:'Shape not supported by pixels'}]};
 const executionReceipt={...f.complete.executionReceipt,attemptId:'review-attempt',runId:'review-attempt',role:'reviewer',taskId:'review-task',threadId:'review-thread',responseText:JSON.stringify(rawReport),inputPacketHash:digest(JSON.stringify({runId:'review-attempt',model:'model',prompt:request.prompt,outputSchema:request.outputSchema,images:input.images}))};
 const complete={kind:'complete-observation-review',jobId:'review-job',attemptId:'review-attempt',reportId:'review-report',rawReport,payloadRef:'review.json',contentHash:digest(JSON.stringify(rawReport,null,2)),executionReceipt};
 return {...f,queue,complete};
}
test('review rejects forged input, reused observer identity and inherited observer context',()=>{
 const f=reviewedFixture();
 for(const mutate of [c=>c.task.observationReviewInput.contentHash='x',c=>c.task.observationReviewInput.rawReport.observations[0].visibleFeatures[0].description='forged',c=>c.task.observationReviewInput.images[0].sha256='b'.repeat(64)]){
  const bad=structuredClone(f.queue);mutate(bad);assert.throws(()=>f.send(bad),/exact registered/);
 }
 f.send(f.queue);
 for(const context of [agent,{...reviewer,parentRunIds:[agent.runId]},{...reviewer,ancestorActorIds:[agent.actorId]}])assert.throws(()=>f.send({kind:'start-job',jobId:'review-job',attemptId:'review-attempt'},context),/independent/);
 f.send({kind:'start-job',jobId:'review-job',attemptId:'review-attempt'},reviewer);
 for(const mutate of [c=>c.executionReceipt.threadId='thread',c=>c.executionReceipt.images[0].sha256='b'.repeat(64),c=>c.executionReceipt.inputPacketHash='bad',c=>c.rawReport.findings[0].status='supported']){
  const bad=structuredClone(f.complete);mutate(bad);assert.throws(()=>f.send(bad,reviewer));
 }
 f.send(f.complete,reviewer);assert.equal(f.get().observationReviews.length,1);assert.deepEqual(f.get().observationReviews[0].acceptedCatalogue.features,[]);
 assert.ok(Object.isFrozen(f.get().observationReviews[0]));assert.throws(()=>f.send(f.complete,reviewer),/Running/);
});
test('reviewer cannot author later research, failed review retries with a fresh attempt and preserves original failure',()=>{
 const f=reviewedFixture();f.send(f.queue);f.send({kind:'start-job',jobId:'review-job',attemptId:'review-attempt'},reviewer);
 f.send({kind:'finish-job-error',jobId:'review-job',attemptId:'review-attempt',status:'failed',error:{code:'FAILED',message:'failed'}},reviewer);
 f.send({kind:'retry-job',jobId:'review-job',attemptId:'review-retry'},reviewer);
 const complete=structuredClone(f.complete);complete.attemptId='review-retry';complete.executionReceipt.attemptId='review-retry';complete.executionReceipt.runId='review-retry';
 const request=buildImageObservationReviewRequest(f.queue.task.observationReviewInput);
 complete.executionReceipt.inputPacketHash=digest(JSON.stringify({runId:'review-retry',model:'model',prompt:request.prompt,outputSchema:request.outputSchema,images:f.queue.task.observationReviewInput.images}));
 f.send(complete,reviewer);assert.deepEqual(f.get().jobs.at(-1).attempts.map(a=>a.status),['failed','succeeded']);
 f.send({kind:'request-stage',stage:'research',jobId:'research-job',binding:f.queue.binding,task:{id:'research-task',owner:'researcher',parentId:null}});
 assert.throws(()=>f.send({kind:'start-job',jobId:'research-job',attemptId:'research-attempt'},reviewer),/cannot author/);
});

test('failed observation reviewer cannot reuse its context to author research',()=>{
 const f=reviewedFixture();f.send(f.queue);f.send({kind:'start-job',jobId:'review-job',attemptId:'review-attempt'},reviewer);
 f.send({kind:'finish-job-error',jobId:'review-job',attemptId:'review-attempt',status:'failed',error:{code:'FAILED',message:'failed after seeing observation input'}},reviewer);
 f.send({kind:'request-stage',stage:'research',jobId:'research-job',binding:f.queue.binding,task:{id:'research-task',owner:'researcher',parentId:null}});
 assert.throws(()=>f.send({kind:'start-job',jobId:'research-job',attemptId:'research-attempt'},reviewer),/cannot author|independent|SELF_REVIEW/);
});

test('research executor cannot inherit successful image reviewer context',()=>{
 const f=reviewedFixture();f.send(f.queue);f.send({kind:'start-job',jobId:'review-job',attemptId:'review-attempt'},reviewer);f.send(f.complete,reviewer);
 f.send({kind:'request-stage',stage:'research',jobId:'research-job',binding:f.queue.binding,task:{id:'research-task',owner:'researcher',parentId:null}});
 const inherited={actorType:'agent',actorId:'researcher-new',runId:'research-new-run',contextId:'research-new-context',parentRunIds:[reviewer.runId],ancestorActorIds:[reviewer.actorId]};
 assert.throws(()=>f.send({kind:'start-job',jobId:'research-job',attemptId:'research-attempt'},inherited),/cannot author|independent|SELF_REVIEW/);
});
