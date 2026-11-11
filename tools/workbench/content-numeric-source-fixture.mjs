import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {numericFixture} from './research-numeric-fixture.mjs';
import {acceptedOperatorResearch,releaseRequest,continuationRequest,human} from './research-operator-fixture.mjs';
import {createExecutor} from './executor.mjs';
import {COPY_CREATIVE_PROTOCOL,CREATIVE_ROLES} from './creative-panel.mjs';
import {verifyResearchDataOriginal,verifyStageOriginal} from './stage-original.mjs';
import {requireResearchChartAdmission,strategyDeliveryEnvelope,copyDeliveryEnvelope,ownerEdgeState} from './project.mjs';
export async function actualNumericContentUpstream({retainRoot=false}={}){
 const f=await numericFixture({compact:true,retainRoot});
 try{
  for(const role of CREATIVE_ROLES.copy){
   for(const prefix of ['creative_score','creative_opposition'])f.bindings[`${prefix}_${role}`]={providerId:'numeric',model:'synthetic',role:`${role}-lead`};
   f.creativeCalibrations.push({protocolVersion:COPY_CREATIVE_PROTOCOL,stage:'copy',role,providerId:'numeric',model:'synthetic',evidenceRef:join(f.root,'calibration'),evidenceHash:f.creativeCalibrations[0].evidenceHash});
  }
  f.executor=createExecutor({store:f.store,rootDir:f.root,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations,imageProvider:null});
  const run=async id=>{const j=await f.executor.execute('p',await id);assert.equal(j.status,'succeeded',JSON.stringify(j.error));return j;};
  const state=()=>f.store.read('p'),command=artifactId=>({artifactId,commandId:randomUUID(),expectedRevision:state().revision});
  await run(f.executor.enqueue('p','research',{sourceRecords:[f.source]}));f.artifact=state().artifacts[0];
  await run(f.executor.enqueueVerification('p',f.artifact.id));await run(f.executor.enqueueReadiness('p',f.artifact.id,{protocolVersion:'research-readiness-v2'}));
  await acceptedOperatorResearch(f);await f.executor.releaseResearch('p',releaseRequest(f),human);
  await run(f.executor.continueResearch('p',continuationRequest(f)));
  const panel=async artifactId=>{
   await run(f.executor.enqueueVerification('p',artifactId));await f.executor.enqueueCreativePanel('p',command(artifactId));
   for(let i=0;i<10;i++){const ids=f.executor.advanceCreativePanels('p');if(!ids.length)break;for(const id of ids)await run(id);}
  };
  await panel(state().activeByStage.strategy);
  await f.executor.continueStrategy('p',command(state().activeByStage.strategy));
  for(let i=0;i<5;i++){const ids=await f.executor.advanceOwnerEdges('p');if(!ids.length)break;for(const id of ids)await run(id);}
  const edge=state().ownerEdges.at(-1);assert.equal(ownerEdgeState(state(),edge).status,'committed');
  const copyJob=state().jobs.find(j=>j.id===edge.commit.jobId);if(copyJob.status==='queued')await run(copyJob.id);
  assert.ok(state().activeByStage.copy);
  await panel(state().activeByStage.copy);
  const p=state(),contents=await Promise.all(p.artifacts.filter(a=>['research','strategy','copy'].includes(a.stage)).map(async a=>({artifactId:a.id,contentText:await readFile(a.payloadRef,'utf8')})));
  await verifyResearchDataOriginal(p,f.artifact,{executionRoot:f.root});
  for(const a of p.artifacts.filter(a=>['strategy','copy'].includes(a.stage)))await verifyStageOriginal(p,a,{executionRoot:f.root});
  const admission=requireResearchChartAdmission(p,f.artifact.id,contents),se=strategyDeliveryEnvelope(p,p.activeByStage.strategy,contents,{providerId:'content-source-reader',model:'historical-evidence',role:'copy-lead'}),ce=copyDeliveryEnvelope(p,p.activeByStage.copy,contents,{providerId:'content-source-reader',model:'historical-evidence',role:'references-lead'});
  assert.deepEqual(se.researchChartAdmissions,[admission]);assert.deepEqual(ce.researchChartAdmissions,[admission]);
  assert.equal(p.verifications.find(v=>v.artifactId===f.artifact.id).rawReport.protocolVersion,'excerpt-support-v4');assert.equal(admission.authority.handoffs.length,2);assert.equal(admission.authority.releases.length,1);
  return {...f,p,contents,admission,se,ce};
 }catch(error){await f.close();throw error;}
}
