import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflow} from './seven-stage-workflow.mjs';
import {reduceCopyHttp} from './simple-copy-http.mjs';
import {createSimpleCopyService} from './simple-copy-service.mjs';

// Service scheduling only; the retained native claim counterexample is independently checked.
function fixture({firstUnknown=true,existingStatus=null,otherEdge=false,noEdge=false}={}){
 const binding={providerId:'synthetic',model:'synthetic',role:'worker'};
 const p={id:'synthetic-copy-stop',revision:1,workflow:createWorkflow(),activeTaskCardId:'card',taskCards:[{id:'card',brief:'Synthetic service scheduling'}],activeByStage:{strategy:'strategy'},policies:[{version:1,humanGates:[]}],releases:[],decisions:[],artifacts:[],verifications:[],ownerReports:[],creativePanels:[],creativeReports:[],ownerEdges:noEdge?[]:[{id:'edge',envelope:{source:{artifactId:'strategy'}}}],jobs:Array.from({length:4},(_,i)=>({id:`job-${i}`,edgeId:'edge',status:'queued',attempts:[],binding}))};
 if(existingStatus)p.jobs.push({id:'prior',edgeId:otherEdge?'different-edge':'edge',status:existingStatus,attempts:[{status:existingStatus}],binding});
 if(noEdge)p.jobs.push({id:'research-unknown',status:'awaiting_reconciliation',attempts:[{}],binding});
 const calls=[];
 const store={read:()=>structuredClone(p),command:(_id,c,context)=>{reduceCopyHttp(p,c,context);p.revision++;}};
 const executor={execute:async(_id,id)=>{calls.push(id);const j=p.jobs.find(j=>j.id===id);j.status=firstUnknown&&calls.length===1?'awaiting_reconciliation':'succeeded';j.attempts.push({status:j.status});p.revision++;return j;},advanceOwnerEdges:async()=>{},advanceCreativePanels:()=>{}};
 const roles=['strategy','copy','verification','creative_director',...['copy','brand','user','communication'].flatMap(r=>['creative_score_'+r,'creative_opposition_'+r])];
 const service=createSimpleCopyService({store,rootDir:'.',executor,executionAllowed:true,bindings:Object.fromEntries(roles.map(r=>[r,binding])),providers:{synthetic:{model:'synthetic'}},simple:{status:async()=>({strategy:{current:true}})}});
 const request={commandId:'original-four',expectedRevision:1,edgeId:'edge',jobIds:p.jobs.slice(0,4).map(j=>j.id)};
 return {p,calls,service,request};
}

test('a fixed four-job step stops at its first unknown and exact replay does not dispatch the remainder',async()=>{
 const f=fixture(),first=await f.service.run(f.p.id,'step',f.request);
 assert.deepEqual(f.calls,['job-0']);assert.equal(first.copyWorkflow.unknownJobs.length,1);
 assert.equal(f.p.jobs.filter(j=>j.status==='queued').length,3);
 const revision=f.p.revision,replay=await f.service.run(f.p.id,'step',f.request);
 assert.equal(replay.receipt.replayed,true);assert.equal(f.p.revision,revision);assert.equal(f.p.copyHttpRequests.length,1);assert.deepEqual(f.calls,['job-0']);
 await assert.rejects(()=>f.service.run(f.p.id,'step',{...f.request,commandId:'replacement',expectedRevision:revision,jobIds:['job-1']}),{code:'COPY_OUTCOME_UNKNOWN'});
 assert.equal(f.p.revision,revision);assert.equal(f.p.copyHttpRequests.length,1);assert.deepEqual(f.calls,['job-0']);
});
for(const existingStatus of ['running','awaiting_reconciliation'])test(`a prior ${existingStatus} on the same edge refuses a new step before its ledger entry`,async()=>{
 const f=fixture({existingStatus});await assert.rejects(()=>f.service.run(f.p.id,'step',f.request),{code:'COPY_OUTCOME_UNKNOWN'});
 assert.equal(f.p.revision,1);assert.equal(f.p.copyHttpRequests,undefined);assert.deepEqual(f.calls,[]);
});
test('an unsettled job on another edge does not block this fixed group',async()=>{
 const f=fixture({firstUnknown:false,existingStatus:'awaiting_reconciliation',otherEdge:true});await f.service.run(f.p.id,'step',f.request);assert.deepEqual(f.calls,f.request.jobIds);
});
test('a workspace without an owner edge never presents unrelated research jobs as copy jobs',async()=>{
 const f=fixture({noEdge:true}),state=await f.service.status(f.p.id);assert.deepEqual(state.copyWorkflow.queuedJobIds,[]);assert.deepEqual(state.copyWorkflow.unknownJobs,[]);
});
