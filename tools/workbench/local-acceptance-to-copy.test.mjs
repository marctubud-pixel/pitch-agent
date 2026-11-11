import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';
import {prepareLocalAcceptanceRuntime} from './local-acceptance-runtime.mjs';

const selected=process.env.LOCAL_ACCEPTANCE_CASE;
if(selected&&!['m6','dexian'].includes(selected))throw Error('LOCAL_ACCEPTANCE_CASE must be m6 or dexian');
for(const caseId of selected?[selected]:['m6','dexian'])test(`${caseId}: new input reaches actual reviewed copy in the composed local runtime`,async t=>{
  const root=await mkdtemp(join(tmpdir(),'acceptance-to-copy-'));let projectStore,coordinator;const calls=[];
  t.after(async()=>{coordinator?.close();projectStore?.close();if(process.env.LOCAL_ACCEPTANCE_KEEP!=='1')await rm(root,{recursive:true,force:true});});
  const boot=async()=>{
    projectStore=openStore(join(root,'projects.sqlite'));
    const runtime=await prepareLocalAcceptanceRuntime({projectStore,executionRoot:root,calls});
    coordinator=openLocalAcceptanceCoordinator({databasePath:join(root,'workflow.sqlite'),projectStore,executionRoot:root,...runtime});
    return runtime;
  };
  let runtime=await boot();
  const brief=caseId==='m6'?'梦之蓝M6+通用春节品牌KV，30—50岁送礼者和家庭聚餐购买者，不绑定年份与生肖。本地工程测试，非真实调研。':'得闲白酒包装，25岁年轻人轻松社交使用；轻负担为品牌表达，度数未定。竞品中可参考梦之蓝M6+，本地工程测试，非真实调研。';
  const input={commandId:'create-'+caseId,caseId,brief,mode:caseId==='dexian'?'assisted':'auto',checkpoints:caseId==='dexian'?['strategy','copy']:[]};
  let state=await coordinator.create(input);const id=state.id,projectId=state.projectId;
  assert.notEqual(projectId,'p');assert.equal((await coordinator.create(input)).id,id);
  await coordinator.decide(id,{commandId:'confirm-brief',module:'brief',decision:'approve',expectedBasisHash:state.nextAction.evidenceHash,comment:'Synthetic test user confirms task card; no real client approval.'});
  let restarted=false;
  for(let step=0;step<180;step++){
    state=await coordinator.read(id);
    if(state.nextAction.module==='references')break;
    assert(!['blocked','awaiting_reconciliation'].includes(state.nextAction.status),JSON.stringify(state.nextAction));
    if(!restarted&&state.nextAction.module==='copy'){
      const count=calls.length;coordinator.close();projectStore.close();runtime=await boot();assert.equal(calls.length,count);restarted=true;continue;
    }
    if(state.nextAction.status==='awaiting_user'){
      const count=calls.length;await coordinator.advance(id);assert.equal(calls.length,count);
      await coordinator.decide(id,{commandId:'approve-'+state.nextAction.module+'-'+state.nextAction.evidenceHash.slice(0,16),module:state.nextAction.module,decision:'approve',expectedBasisHash:state.nextAction.evidenceHash,comment:'Synthetic assisted test user action; not an actual customer approval.'});
    }else await coordinator.advance(id);
  }
  state=await coordinator.read(id);assert.equal(state.nextAction.module,'references',JSON.stringify(state.nextAction));assert.equal(state.nextAction.reason,'LOCAL_DRIVER_NOT_CONFIGURED');
  assert.equal(state.complete,false);assert.equal(state.editorDocumentId,null);assert(restarted);
  const p=projectStore.read(projectId),copy=p.artifacts.find(a=>a.id===p.activeByStage.copy);
  assert(copy);const checked=await runtime.drivers.copy.inspect({project:p});assert.equal(checked.status,'complete');assert.equal(checked.deliveryReady,true);assert.equal(checked.releaseEligible,false);
  const {readArtifactContent}=await import('./artifact-content.mjs');const content=(await readArtifactContent(p,copy.id,root)).content;
  assert.equal(content.directions.length,3);assert.match(content.title,caseId==='m6'?/梦之蓝/:/得闲/);assert.equal(p.taskCards[0].brief,brief);
  assert(p.ownerEdges.some(e=>e.commit));assert(p.creativeReports.length>0);assert(calls.every(c=>c.projectId===projectId&&c.syntheticOnly));
  if(caseId==='dexian'){assert.equal(state.decisions.filter(d=>d.module==='strategy'&&d.decision==='approve').length,1,'unchanged strategy approval survives downstream owner progress');assert.equal(state.decisions.filter(d=>d.module==='copy'&&d.decision==='approve').length,1);}
  const count=calls.length;await coordinator.advance(id);assert.equal(calls.length,count);
  await writeFile(join(root,'RESULT.json'),JSON.stringify({syntheticOnly:true,browserVerified:false,caseId,projectId,brief,calls:calls.length,jobs:p.jobs.length,copyArtifactId:copy.id,states:state.states,decisions:state.decisions,root,restarted,complete:false,nextModule:'references'},null,2));
  console.log('LOCAL_COPY_CASE_RESULT '+join(root,'RESULT.json'));
});
