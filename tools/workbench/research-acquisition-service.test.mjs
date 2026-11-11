import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchService} from './research-service.mjs';
import {acquisitionFixture} from './research-acquisition-fixture.mjs';
test('default current research service exposes read-only acquisition status without dispatch',async t=>{
 const f=await acquisitionFixture();t.after(()=>f.close());
 f.store.create({id:'new',name:'Current',brief:'New current project',workflowVersion:'proposal-seven-v1'},{actorType:'human',actorId:'local',runId:'local',contextId:'local'});
 const service=createResearchService({store:f.store,rootDir:f.root});
 assert.equal(typeof service.acquisitionStatus,'function');
 assert.equal((await service.acquisitionStatus('new')).acquisition.state,'not_started');assert.equal(f.calls.length,0);assert.equal(f.tools.length,0);
});
import {human} from './research-operator-fixture.mjs';
import {cardHash} from './intake-contract.mjs';
async function currentFixture(t,options={}){
 const f=await acquisitionFixture(options);t.after(()=>f.close());f.store.create({id:'new',name:'Current acquisition',brief:'Read synthetic blue packaging only, no preference claims.',workflowVersion:'proposal-seven-v1'},human);f.store.command('new',{kind:'confirm-task-card',taskCardId:'new:scope:1',commandId:'confirm',expectedRevision:0},human);
 const service=createResearchService({...f.options,originalsRoot:f.root,executionAllowed:true});service.registerQuestions('new',{questions:[{id:'q1',question:'What does the source actually say?',critical:true}],readerCount:1,commandId:'questions',expectedRevision:1},human);
 const body=extra=>{const p=f.store.read('new'),card=p.taskCards.find(c=>c.id===p.activeTaskCardId);return {commandId:'operation-'+p.revision,expectedRevision:p.revision,taskCardId:card.id,taskCardHash:cardHash(card),...extra};};
 return {...f,service,body};
}
test('explicit bounded original job sets produce four branches, a sealed catalogue and one r7 producer',async t=>{
 const f=await currentFixture(t),request=f.body({sourceEntryIds:[],materialIds:[]}),started=await f.service.acquisitionStart('new',request);assert.equal(f.calls.length,0);assert.equal(started.acquisition.state,'planning');
 const first=f.body({generationId:started.receipt.generationId,jobIds:started.acquisition.queuedJobIds}),planned=await f.service.acquisitionStep('new',first);assert.equal(f.calls.length,1);assert.equal(planned.acquisition.branches.length,4);
 await f.service.acquisitionStep('new',first);assert.equal(f.calls.length,1);assert.equal(f.tools.length,0,'Replaying plan step must never substitute newly queued branches');
 const branches=f.body({generationId:started.receipt.generationId,jobIds:planned.acquisition.queuedJobIds}),sealed=await f.service.acquisitionStep('new',branches);assert.equal(sealed.acquisition.state,'sealed');assert.ok(sealed.acquisition.producerJobId);
 await f.service.acquisitionStep('new',branches);assert.equal(f.calls.length,1,'Old branch step must not execute the new producer');
 const produced=await f.service.acquisitionStep('new',f.body({generationId:started.receipt.generationId,jobIds:[sealed.acquisition.producerJobId]}));assert.equal(produced.acquisition.producerStatus,'succeeded',JSON.stringify(f.store.read('new').jobs.at(-1).error));assert.equal(f.calls.length,2);assert.equal(f.store.read('new').artifacts.length,1);assert.ok(f.store.read('new').jobs.at(-1).task.researchQuestionRegistration);assert.equal(f.store.read('new').releases.length,0);
});
test('step ledger survives a committed lost response and rejects different bodies without selecting later jobs',async t=>{
 const f=await currentFixture(t),start=await f.service.acquisitionStart('new',f.body({sourceEntryIds:[],materialIds:[]})),body=f.body({generationId:start.receipt.generationId,jobIds:start.acquisition.queuedJobIds}),command=f.store.command.bind(f.store);let lost=false;
 const service=createResearchService({...f.options,originalsRoot:f.root,executionAllowed:true,store:{...f.store,command(id,c,ctx){const result=command(id,c,ctx);if(!lost&&c.kind==='research-acquisition-http-request'&&c.operation==='step'){lost=true;throw Error('Synthetic lost step return after commit');}return result;}}});
 await assert.rejects(service.acquisitionStep('new',body),/lost step/);assert.equal(f.calls.length,0);
 const replay=await f.service.acquisitionStep('new',body);assert.equal(replay.receipt.replayed,true);assert.equal(f.calls.length,1);assert.equal(f.tools.length,0);
 await assert.rejects(f.service.acquisitionStep('new',{...body,jobIds:replay.acquisition.queuedJobIds}),{code:'COMMAND_ID_REUSED'});await f.service.acquisitionStep('new',body);assert.equal(f.tools.length,0);
});
for(const phase of ['plan','producer'])test(`${phase} actual claim blocks a concurrent question-plan change without a model dispatch`,async t=>{
 const f=await currentFixture(t),start=await f.service.acquisitionStart('new',f.body({sourceEntryIds:[],materialIds:[]}));let status=start;
 if(phase==='producer'){status=await f.service.acquisitionStep('new',f.body({generationId:start.receipt.generationId,jobIds:status.acquisition.queuedJobIds}));status=await f.service.acquisitionStep('new',f.body({generationId:start.receipt.generationId,jobIds:status.acquisition.queuedJobIds}));}
 const command=f.store.command.bind(f.store),before=f.calls.length;let changed=false;
 const service=createResearchService({...f.options,originalsRoot:f.root,executionAllowed:true,store:{...f.store,command(id,c,ctx){if(!changed&&['start-job','research-acquisition-start'].includes(c.kind)){changed=true;f.service.registerQuestions('new',{questions:[{id:'new-question',question:'Different preregistered question',critical:true}],readerCount:1,commandId:'replace-questions',expectedRevision:f.store.read('new').revision},human);}return command(id,c,ctx);}}});
 await service.acquisitionStep('new',f.body({generationId:start.receipt.generationId,jobIds:phase==='producer'?[status.acquisition.producerJobId]:status.acquisition.queuedJobIds}));assert.equal(changed,true);assert.equal(f.calls.length,before);assert.equal(f.store.read('new').artifacts.length,0);
});
test('an unknown branch never retries and exact saved tool originals reconcile as history with no providers',async t=>{
 const f=await currentFixture(t),start=await f.service.acquisitionStart('new',f.body({sourceEntryIds:[],materialIds:[]})),plan=await f.service.acquisitionStep('new',f.body({generationId:start.receipt.generationId,jobIds:start.acquisition.queuedJobIds})),jobId=plan.acquisition.queuedJobIds[0],command=f.store.command.bind(f.store);let stopped=false;
 const service=createResearchService({...f.options,originalsRoot:f.root,executionAllowed:true,store:{...f.store,command(id,c,ctx){if(!stopped&&c.kind==='research-acquisition-tool-result'){stopped=true;throw Error('Synthetic saved tool return lost');}return command(id,c,ctx);}}});
 const body=f.body({generationId:start.receipt.generationId,jobIds:[jobId]}),unknown=await service.acquisitionStep('new',body);assert.equal(unknown.acquisition.state,'awaiting_reconciliation');const calls=f.calls.length,tools=f.tools.length;await f.service.acquisitionStep('new',body);assert.equal(f.tools.length,tools);
 f.store.command('new',{kind:'revise-task-card',taskCardId:'new-card',brief:'Changed current task',commandId:'change',expectedRevision:f.store.read('new').revision},human);
 const disabled=createResearchService({store:f.store,rootDir:f.root,originalsRoot:f.root}),reconcile={...body,jobId,commandId:'reconcile',expectedRevision:f.store.read('new').revision};delete reconcile.jobIds;
 const historical=await disabled.acquisitionReconcile('new',reconcile);assert.equal(historical.acquisition.current,false);assert.notEqual(f.store.read('new').jobs.find(j=>j.id===jobId).status,'awaiting_reconciliation');assert.equal(f.calls.length,calls);assert.equal(f.tools.length,tools);await disabled.acquisitionReconcile('new',reconcile);assert.equal(f.tools.length,tools);
});
import {createBriefIntakeService} from './brief-intake-service.mjs';
import {readFile,chmod,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const pythonBinary=process.env.PITCH_PDF_TEST_PYTHON;
test('actual parsed current PDF and registered source enter the sealed r7 producer; mismatched roots and corrupt originals refuse dispatch',{skip:pythonBinary?false:'Set PITCH_PDF_TEST_PYTHON to verify actual PDF acquisition input'},async t=>{
 const f=await currentFixture(t),originals=createBriefIntakeService({store:f.store,rootDir:f.root,intakeConfiguration:{pythonBinary}});assert.equal((await originals.extractionCapability()).available,true);
 let p=f.store.read('new');f.store.command('new',{kind:'register-research-source',source:{title:'Synthetic blue source',publisher:'Engineering only',url:'https://fixture.example/blue',excerpt:'The supplied packaging is blue.',intendedUse:'category',attachToClaimId:null},commandId:'source',expectedRevision:p.revision},human);
 const sourceId=f.store.read('new').sourceEntries[0].id,uploadBody=f.body({originalFilename:'mixed.pdf'}),uploaded=await originals.upload('new',uploadBody,await readFile(new URL('./fixtures/intake/mixed.pdf',import.meta.url)));await originals.extract('new',f.body({documentId:uploaded.documentId,action:'extract'}));
 const request=f.body({sourceEntryIds:[sourceId],materialIds:[uploaded.documentId]}),mismatched=createResearchService({...f.options,originalsRoot:join(f.root,'different-originals'),executionAllowed:true});await assert.rejects(mismatched.acquisitionStart('new',request),{code:'ACQUISITION_ORIGINAL_ROOT_MISMATCH'});assert.equal(f.calls.length,0);
 const started=await f.service.acquisitionStart('new',request);for(let i=0;i<3;i++){const status=await f.service.acquisitionStatus('new');await f.service.acquisitionStep('new',f.body({generationId:started.receipt.generationId,jobIds:status.acquisition.queuedJobIds}));}
 p=f.store.read('new');const producer=p.jobs.find(j=>j.task?.researchDataBasis?.acquisition);assert.equal(producer.status,'succeeded',JSON.stringify(producer.error));const material=producer.task.sourceRecords.find(s=>s.provenance?.kind==='registered_intake_material');assert.equal(material.provenance.rawHash,uploaded.document.sha256);assert.equal(material.verification,'captured');assert.equal(material.scopeRelation,'background');assert.equal(producer.task.researchQuestionRegistration.questions[0].id,'q1');assert.equal(p.releases.length,0);
 const file=join(f.root,'intake','objects',uploaded.document.sha256);await chmod(file,0o600);await writeFile(file,'tampered');const read=await f.service.acquisitionStatus('new');assert.equal(read.acquisition.originals.verified,false);assert.equal(f.calls.length,2);
});
test('known old step receipts remain historical after a card replacement and never dispatch new work',async t=>{
 const f=await currentFixture(t),start=await f.service.acquisitionStart('new',f.body({sourceEntryIds:[],materialIds:[]})),body=f.body({generationId:start.receipt.generationId,jobIds:start.acquisition.queuedJobIds});await f.service.acquisitionStep('new',body);const calls=f.calls.length;
 f.store.command('new',{kind:'revise-task-card',taskCardId:'next',brief:'Replacement task',commandId:'next',expectedRevision:f.store.read('new').revision},human);
 const response=await f.service.acquisitionStep('new',body);assert.equal(response.receipt.replayed,true);assert.equal(response.acquisition.generationId,start.receipt.generationId);assert.equal(response.acquisition.current,false);assert.equal(f.calls.length,calls);assert.equal(f.tools.length,0);
});
for(const change of ['card','unrelated-revision'])test(`actual step claim uses captured revision after ${change} changes`,async t=>{
 const f=await currentFixture(t),start=await f.service.acquisitionStart('new',f.body({sourceEntryIds:[],materialIds:[]})),command=f.store.command.bind(f.store);let changed=false;
 const service=createResearchService({...f.options,originalsRoot:f.root,executionAllowed:true,store:{...f.store,command(id,c,ctx){if(c.kind==='research-acquisition-start'&&!changed){changed=true;const p=f.store.read(id);command(id,change==='card'?{kind:'revise-task-card',commandId:'concurrent',taskCardId:'changed',brief:'Changed task',expectedRevision:p.revision}:{kind:'register-research-source',source:{title:'Unselected new source',publisher:'Synthetic',url:'',excerpt:'Unselected',intendedUse:'unclassified',attachToClaimId:null},commandId:'concurrent',expectedRevision:p.revision},human);}return command(id,c,ctx);}}});
 const result=await service.acquisitionStep('new',f.body({generationId:start.receipt.generationId,jobIds:start.acquisition.queuedJobIds}));assert.equal(changed,true);assert.equal(f.calls.length,0);assert.equal(f.tools.length,0);assert.equal(f.store.read('new').jobs.at(-1).attempts.length,0);assert.equal(result.acquisition.state,'blocked');
});
test('default disabled replay never executes a queued selected job',async t=>{
 const f=await currentFixture(t),start=await f.service.acquisitionStart('new',f.body({sourceEntryIds:[],materialIds:[]})),body=f.body({generationId:start.receipt.generationId,jobIds:start.acquisition.queuedJobIds}),command=f.store.command.bind(f.store);let lost=false;
 const service=createResearchService({...f.options,originalsRoot:f.root,executionAllowed:true,store:{...f.store,command(id,c,ctx){const result=command(id,c,ctx);if(c.kind==='research-acquisition-http-request'&&c.operation==='step'&&!lost){lost=true;throw Error('lost');}return result;}}});await assert.rejects(service.acquisitionStep('new',body),/lost/);
 const disabled=createResearchService({store:f.store,rootDir:f.root});await assert.rejects(disabled.acquisitionStep('new',body),{code:'ACQUISITION_UNAVAILABLE'});assert.equal(f.calls.length,0);assert.equal(f.store.read('new').jobs.at(-1).attempts.length,0);
});
test('capability checks actual search and model adapter shapes; missing question registration cannot be supplemented after start',async t=>{
 const f=await currentFixture(t);assert.equal(f.service.capability().acquisition.materialsRootShared,true);assert.equal(createResearchService({...f.options,originalsRoot:join(f.root,'unshared'),executionAllowed:true}).capability().acquisition.materialsRootShared,false);for(const options of [{searchProviders:{search:{adapter:'unknown'}}},{providers:{...f.providers,planner:{model:'synthetic'}}}]){const s=createResearchService({...f.options,...options,executionAllowed:true});assert.equal((await s.acquisitionStatus('new')).capability.available,false);}
 f.store.create({id:'no-plan',name:'No questions',brief:'No preregistration yet',workflowVersion:'proposal-seven-v1'},human);f.store.command('no-plan',{kind:'confirm-task-card',taskCardId:'no-plan:scope:1',commandId:'confirm',expectedRevision:0},human);const p=f.store.read('no-plan'),card=p.taskCards[0];await assert.rejects(f.service.acquisitionStart('no-plan',{taskCardId:card.id,taskCardHash:cardHash(card),commandId:'attempt',expectedRevision:p.revision,sourceEntryIds:[],materialIds:[]}),{code:'STALE_ACQUISITION'});assert.equal(f.store.read('no-plan').researchAcquisitions?.length??0,0);assert.equal(f.calls.length,0);
});
import http from 'node:http';
for(const historical of [false,true])test(`saved synthetic HTTP producer ${historical?'history remains pending':'reconciles on its original current version'} without a new invocation`,async t=>{
 const f=await currentFixture(t),synthetic=f.providers.author;
 const model=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const wire=JSON.parse(Buffer.concat(chunks)),raw=await synthetic.execute({...wire,runId:wire.invocationId});res.end(JSON.stringify({protocol:wire.protocol,invocationId:wire.invocationId,contextMode:wire.contextMode,terminal:'completed',outputText:raw.responseText,reportedModel:'synthetic',requestId:null,usage:{inputTokens:null,outputTokens:null}}));}catch(error){res.destroy(error);}});await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));t.after(async()=>{model.closeAllConnections();await new Promise(resolve=>model.close(resolve));});
 const config={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${model.address().port}/model`,model:'synthetic',serviceIdentity:'synthetic-acquisition-http',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:2000,maxRequestBytes:8*1024*1024,maxResponseBytes:400000,maxOutputBytes:65536,vision:false,envelopes:[],resourceProfile:'bounded-json-v1'};
 const providers={...f.providers,planner:{model:'synthetic',adapter:config.adapter,operatorConfig:config},author:{model:'synthetic',adapter:config.adapter,operatorConfig:config,failpoint:name=>{if(name==='manifest-synced')throw Error('Synthetic producer return lost after durable model result');}}};
 const service=createResearchService({...f.options,providers,originalsRoot:f.root,executionAllowed:true}),request=f.body({sourceEntryIds:[],materialIds:[]}),start=await service.acquisitionStart('new',request);let status=start;
 for(let i=0;i<3;i++)status=await service.acquisitionStep('new',f.body({generationId:start.receipt.generationId,jobIds:status.acquisition.queuedJobIds}));
 const producerId=status.acquisition.producerJobId;assert.equal(f.store.read('new').jobs.find(j=>j.id===producerId).status,'awaiting_reconciliation');assert.equal(f.calls.length,2);const tools=f.tools.length;
 if(historical)f.store.command('new',{kind:'revise-task-card',taskCardId:'other-task',brief:'New task',commandId:'new-task',expectedRevision:f.store.read('new').revision},human);
 const disabled=createResearchService({store:f.store,rootDir:f.root,originalsRoot:f.root}),reconcile={commandId:'recover-producer',expectedRevision:f.store.read('new').revision,taskCardId:request.taskCardId,taskCardHash:request.taskCardHash,generationId:start.receipt.generationId,jobId:producerId};
 if(historical){await assert.rejects(disabled.acquisitionReconcile('new',reconcile),{code:'ACQUISITION_PRODUCER_HISTORY_UNSUPPORTED'});assert.equal(f.store.read('new').artifacts.length,0);assert.equal(f.store.read('new').jobs.find(j=>j.id===producerId).status,'awaiting_reconciliation');}
 else {const recovered=await disabled.acquisitionReconcile('new',reconcile);assert.equal(recovered.acquisition.producerStatus,'succeeded');assert.equal(f.store.read('new').artifacts.length,1);assert.equal(f.store.read('new').releases.length,0);assert.ok(f.store.read('new').jobs.find(j=>j.id===producerId).task.researchQuestionRegistration);await disabled.acquisitionReconcile('new',reconcile);}
 assert.equal(f.calls.length,2);assert.equal(f.tools.length,tools);
});
