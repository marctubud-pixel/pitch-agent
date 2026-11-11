import {DatabaseSync} from 'node:sqlite';
import {bootstrapOwnerCopy} from './owner-edge-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {releaseReadiness} from './project.mjs';
import {COPY_CONTRACT_VERSION, buildStageRequest, validateStageOutput} from './stage-content.mjs';
import {CREATIVE_PROTOCOL, LEGACY_COPY_CREATIVE_PROTOCOL, COPY_CREATIVE_PROTOCOL, CREATIVE_ROLES, creativeHash as hash, creativePlan, creativeNodeInput, buildCreativeRequest, validateCreativeOutput, creativeDecision} from './creative-panel.mjs';

const context=(id,actorType='agent')=>({actorId:id,actorType,runId:id+'-run',contextId:id+'-context',parentRunIds:[],ancestorActorIds:[],inputPacketHash:'fixture',exposedReviewIds:[],authorRecommendations:[],priorScores:[]});
const human=context('human','human'), author=context('author'), reconciler=context('reconciler');
const legacyDraft=()=>({outputKind:'copy',status:'draft',title:'Copy draft',summary:'Synthetic draft',sections:[{heading:'Message',body:'Synthetic text',evidenceIds:[]}],claims:[],gaps:[],directions:['steady','product','user'].map((id,i)=>({id,title:['稳健品牌表达｜把名字说完整','产品识别表达｜让闲成为一扇门','用户社交表达｜一句话就能开场'][i],slogan:['一起得闲','随手有约','今晚慢慢聊'][i],rationale:'Private strategy rationale',differentiation:'Mechanism '+i,evidenceIds:[]}))});
const fullDraft=()=>{const draft=legacyDraft();draft.directions.forEach((d,i)=>Object.assign(d,{supportingCopy:['坐在一桌，把时间留给相聚。','以提手图形表达随手带上。','聊到尽兴，把片刻留给朋友。'][i],creativeExplanation:'Private author mechanism explanation '+i}));return draft;};
const version={copyContractVersion:COPY_CONTRACT_VERSION};
const quoted=prompt=>JSON.parse(prompt.slice(prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'copy-message-')),store=openStore(join(root,'db'));
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'p',name:'Synthetic copy contract',brief:'Legacy frozen brief',mode:'auto',humanGates:[]},human);
 const send=(c,ctx=human)=>store.command('p',{...c,commandId:c.commandId??randomUUID(),expectedRevision:store.read('p').revision},ctx);
 send({kind:'confirm-task-card',taskCardId:'p:scope:1'});
 for(const [stage,nextStage] of [['research','strategy']]){
  const path=join(root,stage+'.json'),raw=JSON.stringify({title:stage,sections:[],claims:[]},null,2);await writeFile(path,raw);
  send({kind:'request-stage',stage,jobId:stage});send({kind:'complete-stage',jobId:stage,artifactId:stage,payloadRef:path,contentHash:hash(raw)},context(stage+'-author'));
  if(stage==='strategy'){
   send({kind:'assign-panel',artifactId:stage,seats:[{role:'strategy',...context('strategy-score')}]});
   send({kind:'record-review',artifactId:stage,reviewId:'score',role:'strategy',verdict:'pass',findings:[]},context('strategy-score'));
   send({kind:'record-review',artifactId:stage,reviewId:'opposition',role:'strategy',reviewType:'opposition',pairedReviewId:'score',firstReadRef:'fixture',verdict:'pass',findings:[]},context('strategy-opposition'));
   send({kind:'record-disposition',artifactId:stage,outcome:'reject',reason:'Synthetic empty opposition',evidenceRefs:['fixture']},context('strategy-director'));
  }
  send({kind:'acknowledge-handoff',artifactId:stage,side:'producer',nextStage},context(stage+'-author'));send({kind:'acknowledge-handoff',artifactId:stage,side:'consumer',nextStage},context(nextStage+'-author'));send({kind:'release-stage',artifactId:stage});
 }
 const binding={providerId:'synthetic',model:'synthetic',role:'copy-lead'};
 const execute=async request=>{const input=quoted(request.prompt),output=fullDraft();if(input.revisionInput){output.directions[0].supportingCopy='把想说的话，留给同桌的朋友。';output.feedbackResponses=input.revisionInput.feedback.map(f=>({feedbackId:f.id,action:'applied',explanation:'Revised public body',outputLocations:[{location:'/directions/0/supportingCopy',quote:output.directions[0].supportingCopy}]}));}return {runId:request.runId,requestedModel:binding.model,model:binding.model,threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:binding.model,prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output};};
 const bindings={copy:binding},providers={synthetic:{model:binding.model,execute}},bootstrap=await bootstrapOwnerCopy({store,root,bindings,providers});
 const executor=createExecutor({store,rootDir:root,bindings,providers});
 const stageRequest=job=>{const p=store.read('p'),task=job.task,edge=p.ownerEdges.find(e=>e.id===task.ownerEdgeId);return buildStageRequest({stage:'copy',brief:task.brief,inputArtifacts:edge?[{id:edge.envelope.source.artifactId,stage:'strategy',content:edge.envelope.source.content,reviewConstraints:task.upstreamReviewConstraints[edge.envelope.source.artifactId]}]:[],sourceRecords:task.sourceRecords??[],visualCatalogue:task.visualCatalogue??[],copyContractVersion:task.copyContractVersion});};
 function start(copyContractVersion=COPY_CONTRACT_VERSION){
  const id=bootstrap.jobId;
  if(copyContractVersion===null){
   const snapshot=store.read('p'),job=snapshot.jobs.find(j=>j.id===id);
   delete job.task.copyContractVersion;delete job.task.ownerEdgeId;delete job.task.ownerEnvelopeHash;
   job.status='running';job.attemptId=id;job.attempts=[{id,executor:author,status:'running',startedAt:null}];
   snapshot.revision++;snapshot.audit.push({kind:'synthetic-historical-copy-attempt-fixture',revision:snapshot.revision});
   const db=new DatabaseSync(join(root,'db'));try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO revisions VALUES (?,?,?)').run('p',snapshot.revision,JSON.stringify(snapshot));db.prepare('UPDATE heads SET revision=? WHERE project_id=?').run(snapshot.revision,'p');db.exec('COMMIT');}finally{db.close();}
  }else send({kind:'start-job',jobId:id,attemptId:id},author);
  return {id,task:store.read('p').jobs.find(j=>j.id===id).task};
 }
 function receipt(job,output){return {...binding,runId:job.id,attemptId:job.id,taskId:job.id,requestedModel:binding.model,threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:job.id,model:binding.model,...stageRequest(job)})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output};}

 return {root,store,send,executor,binding,start,receipt,stageRequest,copyJobId:bootstrap.jobId};
}

test('legacy copy and strategy request/schema bytes remain exactly frozen without a version',()=>{
 const hashes={copy:['52b2f8c78acf761dfd45ec23405b7130b6452f476d3e6b039c5b2653c3b6ecb1','cca6f875cf9f59ed41ac9408a6098e49602546f59bc4493d6da3cdbac8f618b6'],strategy:['aaf5d8efaaea76a8b28341f0214614967423f38cf8d57e1deaaf17223f80cd3c','401ac0a160dcbfeba99ad4f67fcfefebb6bbff59b16e4f3bde210558bf0660ec']};
 for(const stage of Object.keys(hashes)){const request=buildStageRequest({stage,brief:'Legacy frozen brief'});assert.deepEqual([hash(request.prompt),hash(request.outputSchema)],hashes[stage]);}
 assert.doesNotThrow(()=>validateStageOutput('copy',legacyDraft()));assert.throws(()=>validateStageOutput('copy',fullDraft()),/not allowed/);
});

test('complete copy requires both new fields for each direction and rejects unknown contract versions',()=>{
 assert.doesNotThrow(()=>validateStageOutput('copy',fullDraft(),version));
 const request=buildStageRequest({stage:'copy',brief:'Complete message',...version});
 assert.match(request.prompt,/consumer-facing supporting text/);
 for(let i=0;i<3;i++)for(const key of ['supportingCopy','creativeExplanation'])for(const value of [undefined,' ']){const raw=fullDraft();if(value===undefined)delete raw.directions[i][key];else raw.directions[i][key]=value;assert.throws(()=>validateStageOutput('copy',raw,version),{code:'INVALID_STAGE_OUTPUT'});}
 assert.throws(()=>buildStageRequest({stage:'copy',brief:'x',copyContractVersion:'unknown'}),/Unsupported copy contract/);
});

test('new runtime copy generation and revision freeze v2, retain complete public body and private explanation',async t=>{
 const f=await fixture(t),id=f.copyJobId;assert.equal(f.store.read('p').jobs.at(-1).task.copyContractVersion,COPY_CONTRACT_VERSION);
 assert.equal((await f.executor.execute('p',id)).status,'succeeded');let p=f.store.read('p'),a=p.artifacts.at(-1);
 assert.deepEqual(a.copyContract,{version:COPY_CONTRACT_VERSION,status:'complete',contentHash:a.contentHash});assert.equal(releaseReadiness(p,a.id).blockedReasons[0],'CREATIVE_PANEL_REQUIRED');
 f.send({kind:'submit-feedback',artifactId:a.id,feedbackId:'body-revision',instructions:'Change the supporting copy',themes:[],materials:[]});
 const revision=await f.executor.enqueueRevision('p',{artifactId:a.id,commandId:'revise-copy',expectedRevision:f.store.read('p').revision});
 const job=f.store.read('p').jobs.at(-1);assert.equal(job.task.copyContractVersion,COPY_CONTRACT_VERSION);assert.equal((await f.executor.execute('p',revision)).status,'succeeded');
 p=f.store.read('p');a=p.artifacts.at(-1);const content=JSON.parse(await readFile(a.payloadRef,'utf8'));assert.equal(content.directions[0].supportingCopy,'把想说的话，留给同桌的朋友。');assert.ok(content.directions.every(d=>d.creativeExplanation));assert.equal(Object.hasOwn(content,'feedbackResponses'),false);assert.equal(a.feedbackResponses[0].action,'applied');assert.equal(a.copyContract.contentHash,hash(JSON.stringify(content,null,2)));
});

test('completion validates full v2 response and hash before persisting server-derived completeness',async t=>{
 const f=await fixture(t),job=f.start(),raw=fullDraft(),content=validateStageOutput('copy',raw,version).content;
 const command={kind:'complete-stage',jobId:job.id,attemptId:job.id,artifactId:'copy',payloadRef:'synthetic://copy',contentHash:hash('wrong'),claims:[],technicalReceipts:{copyContract:{version:COPY_CONTRACT_VERSION,status:'complete'}},executionReceipt:f.receipt(job,raw)};
 assert.throws(()=>f.send(command,author),{code:'CONTENT_HASH_MISMATCH'});
 assert.throws(()=>f.send({...command,executionReceipt:f.receipt(job,legacyDraft())},author),{code:'INVALID_STAGE_OUTPUT'});
 f.send({...command,contentHash:hash(JSON.stringify(content,null,2))},author);const a=f.store.read('p').artifacts.at(-1);assert.equal(a.copyContract.contentHash,a.contentHash);assert.equal(a.copyContract.status,'complete');
 const changed=structuredClone(f.store.read('p'));changed.artifacts.at(-1).contentHash=hash('changed');assert.equal(releaseReadiness(changed,a.id).blockedReasons[0],'COPY_MESSAGE_INCOMPLETE');
});

test('recovery validates frozen version and normalized hash; historical v1 remains recoverable with an incomplete current delivery state',async t=>{
 for(const contract of [undefined,COPY_CONTRACT_VERSION]){
  const f=await fixture(t),job=f.start(contract??null),raw=contract?fullDraft():legacyDraft(),receipt=f.receipt(job,raw);
  f.send({kind:'finish-job-error',jobId:job.id,attemptId:job.id,status:'awaiting_reconciliation',error:{code:'INVALID_STAGE_OUTPUT',message:'Synthetic historic validator rejection'},receipt},author);
  const content=validateStageOutput('copy',raw,contract?version:{}).content;
  const command={kind:'reconcile-stage',jobId:job.id,attemptId:job.id,artifactId:'recovered',reconciliationId:'recovery',payloadRef:'synthetic://recovered',contentHash:hash(JSON.stringify(content,null,2)),receiptHash:hash(JSON.stringify(receipt)),reason:'Synthetic recovery',validatorVersion:'copy-message-v2'};
  assert.throws(()=>f.send({...command,contentHash:hash('wrong')},reconciler),{code:'CONTENT_HASH_MISMATCH'});
  f.send(command,reconciler);const p=f.store.read('p'),a=p.artifacts.at(-1);assert.equal(a.copyContract.status,contract?'complete':'missing_required_parts');assert.equal(a.copyContract.contentHash,a.contentHash);assert.equal(p.jobs.at(-1).attempts[0].status,'awaiting_reconciliation');
  if(!contract){const historical=structuredClone(p);historical.activeByStage.copy=a.id;assert.equal(releaseReadiness(historical,a.id).blockedReasons[0],'COPY_MESSAGE_INCOMPLETE');const adopted=structuredClone(historical);adopted.decisions.push({human:true,kind:'adopt-creative',artifactId:a.id,policyVersion:1,outcome:'adopt_creative',reviewIds:[]});assert.equal(releaseReadiness(adopted,a.id).blockedReasons[0],'COPY_MESSAGE_INCOMPLETE');}
 }
});

function panelFixture(contract=COPY_CONTRACT_VERSION){
 const content=contract?fullDraft():legacyDraft(),packet={artifactId:'copy',contentHash:hash(JSON.stringify(content,null,2)),stage:'copy',content,taskCard:{brief:'Synthetic brief'},sources:[],upstreamConstraints:[],...(contract?{copyContractVersion:contract}:{})};
 const bindings=Object.fromEntries(['creative_director',...CREATIVE_ROLES.copy.flatMap(r=>['creative_score_'+r,'creative_opposition_'+r])].map(key=>[key,{providerId:'synthetic',model:'synthetic',role:key}]));
 return {id:'panel',...creativePlan(packet,bindings)};
}
function firstReport(input){return {protocolVersion:input.protocolVersion,panelId:input.panelId,panelPacketHash:input.panelPacketHash,phase:input.phase,role:input.role,readings:input.subjects.map((s,i)=>({subjectId:s.id,meaning:s.slogan,uncertainty:'Synthetic',evidence:['slogan','supportingCopy'].filter(k=>s[k]).map(k=>({location:`/subjects/${i}/${k}`,quote:s[k]}))})),issues:[],limitations:['Synthetic review']};}
function scoreReport(input){const evidence=i=>['slogan','supportingCopy'].filter(k=>input.subjects[i][k]).map(k=>({location:`/subjects/${i}/${k}`,quote:input.subjects[i][k]}));return {protocolVersion:input.protocolVersion,panelId:input.panelId,panelPacketHash:input.panelPacketHash,phase:input.phase,role:input.role,items:input.subjects.map((s,i)=>({subjectId:s.id,dimensions:input.dimensions.map(d=>({dimension:d,score:4,status:'scored',required:true,claimId:s.id+d,reason:'Synthetic',evidence:evidence(i)})),verdict:'pass'})),groupComparisons:[['A','B'],['A','C'],['B','C']].map(pair=>({claimId:pair.join(''),pair,meaningDifference:'Synthetic meaning',expressionDifference:'Synthetic expression',verdict:'distinct',evidence:pair.flatMap(id=>evidence(input.subjects.findIndex(s=>s.id===id)))})),issues:[],limitations:['Synthetic review']};}

test('v3 anonymous subjects expose complete public message and forbid private author evidence in every phase',()=>{
 const panel=panelFixture();assert.equal(panel.packet.protocolVersion,COPY_CREATIVE_PROTOCOL);const first=creativeNodeInput(panel,panel.nodes[0],[]);assert.equal(first.protocolVersion,COPY_CREATIVE_PROTOCOL);assert.equal(JSON.stringify(first).includes('Private author'),false);assert.equal(JSON.stringify(first).includes('Private strategy'),false);assert.equal(Object.hasOwn(first,'taskCard'),false);assert.deepEqual(Object.keys(first.subjects[0]),['id','slogan','supportingCopy']);assert.equal(JSON.stringify(first).includes('稳健品牌表达'),false);
 const report=firstReport(first);assert.doesNotThrow(()=>validateCreativeOutput(report,first));for(const key of ['slogan','supportingCopy']){const bad=structuredClone(report);bad.readings[0].evidence=bad.readings[0].evidence.filter(e=>!e.location.endsWith('/'+key));assert.throws(()=>validateCreativeOutput(bad,first),/first read/);}
 for(const key of ['title','rationale','creativeExplanation']){const bad=structuredClone(report);bad.readings[0].evidence.push({location:'/subjects/0/'+key,quote:'Private'});assert.throws(()=>validateCreativeOutput(bad,first),/exact subjects/);}
 const node=panel.nodes.find(n=>n.phase==='score'),input=creativeNodeInput(panel,node,[{panelId:panel.id,nodeKey:'copy:score_first_read',rawReport:report}]),score=scoreReport(input);
 const prompt=buildCreativeRequest(input).prompt;assert.match(prompt,/Copy requires its own \/subjects\/N\/slogan or \/subjects\/N\/supportingCopy\./);assert.equal(prompt.includes('title'),false);
 score.items[0].dimensions[0].evidence=score.items[0].dimensions[0].evidence.filter(e=>e.location.endsWith('/supportingCopy'));assert.doesNotThrow(()=>validateCreativeOutput(score,input));
 const headlinesOnly=structuredClone(score);headlinesOnly.groupComparisons.forEach(pair=>pair.evidence=pair.evidence.filter(e=>e.location.endsWith('/slogan')));assert.doesNotThrow(()=>validateCreativeOutput(headlinesOnly,input));
 const missingHeadline=structuredClone(score);missingHeadline.groupComparisons[0].evidence=missingHeadline.groupComparisons[0].evidence.filter(e=>e.location!=='/subjects/0/slogan');assert.throws(()=>validateCreativeOutput(missingHeadline,input),/Pair evidence/);
 for(const leaf of ['title','creativeExplanation','rationale']){const privateEvidence=structuredClone(score);privateEvidence.items[0].dimensions[0].evidence=[{location:'/subjects/0/'+leaf,quote:'Private'}];assert.throws(()=>validateCreativeOutput(privateEvidence,input),/exact subjects/);}
 const crossSubject=structuredClone(score);crossSubject.items[0].dimensions[0].evidence=[{location:'/subjects/1/supportingCopy',quote:input.subjects[1].supportingCopy}];assert.throws(()=>validateCreativeOutput(crossSubject,input),/own subject/);
});

test('legacy frozen creative schemas and prompts stay exact for copy and strategy',()=>{
 const hashes={copy:['a758c65d0931f8b4de2fe7e089fca841c39990cac6f71b8bfd4ea8f3832e534f','8e7b497ff40940311551e8388c1244a26f8aae33ea359185640a73b40650adc4'],strategy:['a96c7773fee16e58f8c0adc33982e1073cfcb4fbd7edba9ac2cade089d3f4d69','d3ecd08b77ceb813fd774d7ec2d517ef1bfc10598a5f9afd5e3a10a11f5430a1']};
 for(const stage of ['copy','strategy']){const input={protocolVersion:CREATIVE_PROTOCOL,panelId:'legacy-panel',panelPacketHash:'0'.repeat(64),phase:'score_first_read',role:stage,stage,subjects:stage==='copy'?[{id:'A',title:'Title',slogan:'Headline'}]:[{id:'A',title:'Title',sections:[],claims:[]}]};const request=buildCreativeRequest(input);assert.deepEqual([hash(request.prompt),hash(request.outputSchema)],hashes[stage]);}
 const panel=panelFixture(null);assert.equal(panel.packet.protocolVersion,CREATIVE_PROTOCOL);assert.equal(Object.hasOwn(panel.packet.subjects[0],'supportingCopy'),false);
});

test('v3 cannot inherit historical calibration and keeps required score threshold and cannot-assess rules',()=>{
 const panel=panelFixture(),reports=[];
 for(const role of CREATIVE_ROLES.copy){const node=panel.nodes.find(n=>n.role===role&&n.phase==='score'),first=creativeNodeInput(panel,panel.nodes.find(n=>n.role===role&&n.phase==='score_first_read'),[]),input=creativeNodeInput(panel,node,[{panelId:panel.id,nodeKey:role+':score_first_read',rawReport:firstReport(first)}]);reports.push({panelId:panel.id,nodeKey:node.key,phase:'score',role,rawReport:scoreReport(input)});}
 reports.push({panelId:panel.id,nodeKey:'director',phase:'director',rawReport:{adjudications:[],groupVerdict:'pass'}});
 panel.packet.calibrations=CREATIVE_ROLES.copy.map(role=>({protocolVersion:CREATIVE_PROTOCOL,stage:'copy',role,providerId:'synthetic',model:'synthetic',status:'verified',evidenceHash:'0'.repeat(64),evidenceRef:'synthetic-calibration'}));assert.equal(creativeDecision(panel,reports).status,'cannot_assess');
 panel.packet.calibrations.forEach(c=>c.protocolVersion=LEGACY_COPY_CREATIVE_PROTOCOL);assert.equal(creativeDecision(panel,reports).status,'cannot_assess');
 panel.packet.calibrations.forEach(c=>c.protocolVersion=COPY_CREATIVE_PROTOCOL);assert.equal(creativeDecision(panel,reports).status,'pass');reports[0].rawReport.items[0].dimensions[0].score=3;assert.equal(creativeDecision(panel,reports).status,'revise');reports[0].rawReport.items[0].dimensions[0].status='unknown';reports[0].rawReport.items[0].dimensions[0].score=null;assert.equal(creativeDecision(panel,reports).status,'cannot_assess');
});


test('disk-backed v2 reconciliation checks required message parts without rerunning a provider',async t=>{
 for(const complete of [true,false]){
  const f=await fixture(t),job=f.start(),raw=complete?fullDraft():legacyDraft(),folder=join(f.root,job.id);await mkdir(folder);
  const paths=Object.fromEntries(['input','output','receipt','stdout'].map(key=>[key,join(folder,key+'.json')]));
  const request=f.stageRequest(job),inputText=JSON.stringify({runId:job.id,model:f.binding.model,...request});
  const disk={runId:job.id,provider:'codex-cli',model:f.binding.model,requestedModel:f.binding.model,threadId:randomUUID(),inputPacketHash:hash(inputText),exitCode:0,paths};
  const providerExecution={...disk,responseText:JSON.stringify(raw),parsedOutput:raw,schemaValidated:false},receipt={...providerExecution,providerExecution,...f.binding,attemptId:job.id,taskId:job.id};
  const saved=f.store.read('p').jobs.at(-1);
  await writeFile(paths.input,inputText);await writeFile(paths.output,receipt.responseText);await writeFile(paths.receipt,JSON.stringify(disk));await writeFile(paths.stdout,JSON.stringify({type:'thread.started',thread_id:disk.threadId})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');
  await writeFile(join(folder,'packet.json'),JSON.stringify({projectId:'p',jobId:job.id,attemptId:job.id,inputVersionIds:saved.inputVersionIds,sourceRecords:[],...request}));
  f.send({kind:'finish-job-error',jobId:job.id,attemptId:job.id,status:'awaiting_reconciliation',error:{code:'INVALID_STAGE_OUTPUT',message:'Synthetic validator failure'},receipt},author);
  const options={commandId:'disk-recovery',expectedRevision:f.store.read('p').revision,reason:'Revalidate frozen full copy message'};
  if(complete){assert.equal((await f.executor.reconcile('p',job.id,options)).status,'succeeded');const a=f.store.read('p').artifacts.at(-1);assert.equal(a.copyContract.status,'complete');assert.equal(hash(await readFile(a.payloadRef,'utf8')),a.copyContract.contentHash);}
  else{await assert.rejects(()=>f.executor.reconcile('p',job.id,options),{code:'INVALID_STAGE_OUTPUT'});assert.equal(f.store.read('p').artifacts.length,2);}
 }
});

test('caller-supplied completeness cannot upgrade v1 provider output for current release or real downstream production',async t=>{
 const f=await fixture(t),job=f.start(null),raw=legacyDraft();
 f.send({kind:'complete-stage',jobId:job.id,attemptId:job.id,artifactId:'legacy-copy',payloadRef:'synthetic://copy',contentHash:hash(JSON.stringify(raw,null,2)),claims:[],copyContract:{version:COPY_CONTRACT_VERSION,status:'complete'},technicalReceipts:{copyContract:{version:COPY_CONTRACT_VERSION,status:'complete'}},executionReceipt:f.receipt(job,raw)},author);
 assert.equal(f.store.read('p').artifacts.at(-1).copyContract.status,'missing_required_parts');const historical=f.store.read('p');historical.activeByStage.copy='legacy-copy';assert.equal(releaseReadiness(historical,'legacy-copy').blockedReasons[0],'COPY_MESSAGE_INCOMPLETE');
 assert.throws(()=>f.executor.enqueue('p','references'),{code:'COPY_MESSAGE_INCOMPLETE'});
});

test('dispatched v2 request bytes and every historical phase remain frozen',async()=>{
 for(const name of ['creative-copy-v2-frozen.json','creative-historical-phase-hashes.json']){
  const fixtures=JSON.parse(await readFile(new URL('./fixtures/'+name,import.meta.url),'utf8'));
  for(const f of fixtures){const request=buildCreativeRequest(f.input);assert.equal(hash(request.prompt),f.promptHash);assert.equal(hash(request.outputSchema),f.schemaHash);}
 }
 const {bindings,plan}=JSON.parse(await readFile(new URL('./fixtures/creative-copy-v2-plan.json',import.meta.url),'utf8'));
 assert.deepEqual(creativePlan(plan.packet,bindings,plan.packet.calibrations),plan);
 assert.equal(plan.packet.subjects[0].title,'稳健品牌表达｜把名字说完整');
 const panel={id:'historical-v2',...plan},first=creativeNodeInput(panel,panel.nodes[0],[]),report=firstReport(first);
 report.readings[0].evidence.push({location:'/subjects/0/title',quote:first.subjects[0].title});assert.doesNotThrow(()=>validateCreativeOutput(report,first));
 report.readings[0].evidence=report.readings[0].evidence.filter(e=>!e.location.endsWith('/supportingCopy'));assert.throws(()=>validateCreativeOutput(report,first),/supporting copy/);
 panel.packet.calibrations=CREATIVE_ROLES.copy.map(role=>({protocolVersion:LEGACY_COPY_CREATIVE_PROTOCOL,stage:'copy',role,providerId:'synthetic',model:'synthetic',status:'verified',evidenceHash:'0'.repeat(64),evidenceRef:'synthetic-calibration'}));
 const reports=CREATIVE_ROLES.copy.map(role=>({panelId:panel.id,nodeKey:role+':score',phase:'score',role,rawReport:scoreReport({...first,phase:'score',role,dimensions:panel.packet.dimensions[role]})}));reports.push({panelId:panel.id,nodeKey:'director',phase:'director',rawReport:{adjudications:[],groupVerdict:'pass'}});
 assert.equal(creativeDecision(panel,reports).status,'cannot_assess');assert.deepEqual(creativeDecision(panel,reports).reasons,['obsolete_anonymous_protocol']);
});

test('protocol registry rejects incompatible stage, contract and protocol combinations',()=>{
 const panel=panelFixture(),bindings=Object.fromEntries(panel.nodes.map(n=>[n.phase==='director'?'creative_director':`creative_${n.phase.startsWith('opposition')?'opposition':'score'}_${n.role}`,n.binding]));
 for(const override of [{protocolVersion:'unknown'},{protocolVersion:null},{protocolVersion:CREATIVE_PROTOCOL},{copyContractVersion:undefined},{stage:'strategy'},{stage:'strategy',copyContractVersion:undefined},{protocolVersion:LEGACY_COPY_CREATIVE_PROTOCOL,stage:'strategy',copyContractVersion:undefined}])assert.throws(()=>creativePlan({...panel.packet,...override},bindings),{code:'INVALID_CREATIVE_PANEL'});
 const input=creativeNodeInput(panel,panel.nodes[0],[]);input.subjects[0].title='稳健品牌表达';assert.throws(()=>buildCreativeRequest(input),/only id, slogan and supportingCopy/);
});
