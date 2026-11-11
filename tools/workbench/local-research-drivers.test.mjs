import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';
import {createLocalSyntheticProviders,prepareLocalResearchConfiguration,createLocalResearchDrivers} from './local-research-drivers.mjs';
import {releaseReadiness} from './project.mjs';

for(const caseId of ['m6','dexian'])test(`${caseId}: actual newly created coordinator project reaches verified strategy with restart and idempotent replay`,async t=>{
 const root=await mkdtemp(join(tmpdir(),'local-research-driver-'));let store,coordinator,executor,drivers;const calls=[];
 const boot=async()=>{store=openStore(join(root,'project.sqlite'));const config=await prepareLocalResearchConfiguration({projectStore:store,executionRoot:root});const providers=createLocalSyntheticProviders({projectStore:store,executionRoot:root,calls});executor=createExecutor({store,rootDir:root,providers,...config});drivers=createLocalResearchDrivers({projectStore:store,executor,executionRoot:root});coordinator=openLocalAcceptanceCoordinator({databasePath:join(root,'cases.sqlite'),projectStore:store,executor,drivers,executionRoot:root,deliveryBindings:{strategy:config.bindings.copy}});};
 await boot();t.after(async()=>{coordinator.close();store.close();await rm(root,{recursive:true,force:true});});
 const brief=caseId==='m6'?'梦之蓝 M6+ 通用春节品牌 KV，30—50岁送礼者和家庭聚餐购买者，不绑定年份与生肖。工程测试，不是真实调研。':'得闲白酒包装，25岁年轻人的轻松社交使用；轻负担是品牌表达，度数未定。工程测试，不是真实调研。';
 const initial=await coordinator.create({caseId,brief,mode:'auto',checkpoints:[],commandId:'create-'+caseId});assert.notEqual(initial.projectId,'p');assert.equal(store.list().length,1);assert.equal(initial.nextAction.module,'brief');await coordinator.advance(initial.id);assert.equal(calls.length,0);
 await coordinator.decide(initial.id,{module:'brief',decision:'approve',comment:'本地测试任务卡确认',commandId:'confirm-'+caseId,expectedBasisHash:initial.nextAction.evidenceHash});
 await Promise.all([coordinator.advance(initial.id),coordinator.advance(initial.id)]);assert.equal(calls.length,1);
 let state;for(let i=0;i<20;i++){state=await coordinator.read(initial.id);if(state.nextAction.module!=='research')break;assert.notEqual(state.nextAction.status,'blocked',JSON.stringify(state.nextAction));await coordinator.advance(initial.id);}
 state=await coordinator.read(initial.id);assert.equal(state.nextAction.module,'strategy',JSON.stringify(state.nextAction));assert.equal(state.states.find(s=>s.module==='research').status,'complete');
 const researchId=store.read(initial.projectId).activeByStage.research;const beforeRestart=calls.length;coordinator.close();store.close();await boot();assert.equal(calls.length,beforeRestart);assert.equal(store.read(initial.projectId).activeByStage.research,researchId);
 for(let i=0;i<40;i++){state=await coordinator.read(initial.id);if(state.nextAction.module!=='strategy')break;assert.notEqual(state.nextAction.status,'blocked',JSON.stringify(state.nextAction));await coordinator.advance(initial.id);}
 state=await coordinator.read(initial.id);assert.equal(state.states.find(s=>s.module==='strategy').status,'complete',JSON.stringify(state.nextAction));assert.equal(state.nextAction.module,'copy');assert.equal(state.nextAction.status,'blocked');assert.equal(state.complete,false);const p=store.read(initial.projectId);assert.equal(p.taskCards[0].brief,brief);assert.equal(releaseReadiness(p,p.activeByStage.strategy).eligible,false);assert(releaseReadiness(p,p.activeByStage.strategy).blockedReasons.includes('OWNER_REQUIRED'));assert.equal(p.ownerReports?.length??0,0);const delivery=await drivers.strategy.inspect({project:p});assert.equal(delivery.status,'complete');assert.match(delivery.deliveryEnvelopeHash,/^[a-f0-9]{64}$/);assert(p.creativeReports.length>0);assert.equal(p.handoffReports.length,2);assert.equal(store.list().length,1);assert(calls.every(c=>c.projectId===initial.projectId&&c.syntheticOnly));
 const n=calls.length;await drivers.strategy.advance({project:p});await coordinator.advance(initial.id);assert.equal(calls.length,n);assert.equal(store.read(initial.projectId).artifacts.filter(a=>a.stage==='strategy').length,1);
});
