import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {closeSelectedHistoryDuties} from './final-review-reader.mjs';
import {layoutHash} from './layout-boundary.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('contract tuple fixture closes exact native jobs attempts and technical artifact without exports',()=>{
 const jobs=['editorial','stage','evidence'].map((style,i)=>{
  const receipt={attemptId:`a${i}`,bindingHash:'binding',style,anchorPath:`/owned/${i}`},attempt={id:`a${i}`,status:'succeeded',receipt};
  return {id:`j${i}`,purpose:'layout_export',status:'succeeded',task:{bindingHash:'binding',style},attempts:[attempt],receipt,outputVersionIds:['technical']};
 });
 const technical={protocol:'project-native-layout-v1',rootJobId:'j0',bindingHash:'binding',editions:jobs.map(job=>({jobId:job.id,style:job.task.style,receipt:job.receipt})),finalAuthorityAvailable:false};
 const artifact={id:'technical',provenance:'native-layout-technical-only',layoutTechnical:technical,contentHash:layoutHash(jobs.map(j=>j.receipt)),payloadRef:jobs[0].receipt.anchorPath};
 const planning={jobs,artifacts:[artifact]},nodes=[];
 const add=(domain,record,pointer)=>nodes.push({identity:`node-${nodes.length}`,domain,recordId:record.id,originalPointer:pointer,recordHash:hash(record)});
 jobs.forEach((j,i)=>{add('job',j,`/jobs/${i}`);add(`attempt:${j.id}`,j.attempts[0],`/jobs/${i}/attempts/0`);});add('artifact',artifact,'/artifacts/0');
 const index={nodes},selected={nodeIdentities:nodes.map(n=>n.identity)},checked={facts:[],duties:{status:'checked',unsettled:[]},deferred:[...jobs.map((j,i)=>({authority:'native',jobId:j.id,attemptId:j.attempts[0].id,bindingHash:'binding',originalPointer:`/jobs/${i}`})),{authority:'native_artifact',artifactId:artifact.id,contentHash:artifact.contentHash,rootJobId:'j0',bindingHash:'binding',originalPointer:'/artifacts/0'}]};
 const native={layoutRootJobId:'j0',bindingIdentity:'binding',originalJobs:structuredClone(jobs),originalAttempts:jobs.map(j=>structuredClone(j.attempts[0]))};
 const run=(n=native,c=checked)=>closeSelectedHistoryDuties({planning,index,selected,checked:c,native:n});
 const good=run();assert.equal(good.uncovered.length,0);assert.equal(good.closedNodeIdentities.length,7);assert.equal(good.status,'checked');
 for(const field of ['attempt','binding','artifact','job']){
  const n=structuredClone(native),c=structuredClone(checked);
  if(field==='attempt')n.originalAttempts[0].id='equal-at-other-host';
  if(field==='binding')n.bindingIdentity='wrong';
  if(field==='artifact')c.deferred.at(-1).artifactId='wrong';
  if(field==='job')n.originalJobs[0].id='wrong';
  assert.ok(run(n,c).uncovered.length>0,field);
 }
 const pending=run(native,{...checked,duties:{status:'unsettled',unsettled:[{code:'STAGE_ORIGINAL_INVALID',status:'unsettled'}]}});assert.equal(pending.uncovered.length,0);assert.equal(pending.status,'unsettled');
 const extra={id:'unproved',status:'unknown'};planning.jobs[0].attempts.push(extra);add('attempt:j0',extra,'/jobs/0/attempts/1');selected.nodeIdentities.push(nodes.at(-1).identity);
 assert.ok(run().uncovered.some(n=>n.recordId==='unproved'));
 console.log(JSON.stringify({label:'native contract tuple fixture only',nativeExports:0,decoders:0,exactClosedNodes:good.closedNodeIdentities.length}));
});
