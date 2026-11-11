import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {referencePackets,referenceNodePlan,referenceNodeInput,referenceState,REFERENCE_PLAN,referenceReadyNodes} from './reference-dossier.mjs';
import {referenceReviewFixtureOutput,referenceReviewFixturePacket} from './reference-review-fixtures.mjs';
import {referenceHash} from './reference-review.mjs';

function stateFixture({kinds}={}){
 const directions=['original-a','original-b','original-c'];
 const d={id:'synthetic-state-only',envelope:{envelopeHash:'a'.repeat(64),directionIds:directions,source:{taskCard:{brief:'Development state derivation only.'},source:{content:{directions:directions.map(id=>({id,slogan:id,supportingCopy:'Public body'}))}},sourceRecords:[],policy:{humanGates:['references'],authorizedThrough:'sketch'}},configuration:{budget:{maxModelCalls:129,maxSearchCalls:6},calibrations:[]},bindings:{reference_lead:{providerId:'synthetic',model:'synthetic',role:'reference-lead'},...Object.fromEntries(['visual','brand','user','communication'].map(role=>[`reference_score_${role}`,{providerId:'synthetic',model:'synthetic'}]))}},reports:[],candidates:[],tools:[],adoptions:[],previousReturns:[],paused:false};
 directions.forEach((directionId,index)=>{const packet=referenceReviewFixturePacket(kinds?{kinds}:{});packet.uses.forEach((u,i)=>{u.id=`${directionId}-${i}`;u.directionId=directionId;u.imageId=`img_${index}_${i}`;packet.images[i].imageId=u.imageId;packet.images[i].sha256=String(index*2+i+1).repeat(64);d.candidates.push({directionId,image:packet.images[i]});});d.reports.push({nodeKey:`collector-${index}`,rawReport:{kind:'collector',decision:'accept',uses:packet.uses},reportHash:'c'.repeat(64)},{nodeKey:`merge-${index}`,rawReport:{decision:'accept',acceptedUseIds:packet.uses.map(u=>u.id)},reportHash:'d'.repeat(64)});});
 return d;
}
function fillReview(d){for(let cycle=0;cycle<30;cycle++){let count=0;for(const node of referenceNodePlan(d).filter(n=>n.kind==='review'&&!d.reports.some(r=>r.nodeKey===n.key)&&n.dependencies.every(key=>d.reports.some(r=>r.nodeKey===key)))){const input=referenceNodeInput(d,node),rawReport=referenceReviewFixtureOutput(input);d.reports.push({nodeKey:node.key,rawReport,reportHash:referenceHash(JSON.stringify(rawReport,null,2))});count++;}if(!count)break;}return d;}

test('domain-only seven packets retain candidate, actual combination and three-direction comparison coverage without declaring calibration',()=>{
 const d=fillReview(stateFixture());assert.equal(d.reports.filter(r=>r.rawReport.protocolVersion==='reference-pixel-review-v1').length,119);
 const state=referenceState({jobs:[]},d);assert.equal(state.status,'choice_blocked');assert.equal(state.reason,'CURRENT_REFERENCE_UNCERTAINTY');assert.equal(state.historyCoverage.blocks.length,135);assert.equal(state.originalAutomaticOutcome.status,'diagnostic');assert.equal(state.originalAutomaticOutcome.coverage.length,7);assert.deepEqual(state.originalAutomaticOutcome.selection.map(s=>s.directionId),d.envelope.directionIds);assert.ok(state.originalAutomaticOutcome.selection.every(s=>s.main.kind==='direction'&&s.backups.length===1));
 const first=referenceNodePlan(d).find(n=>n.phase==='first_read'),input=referenceNodeInput(d,first);assert.equal(Object.hasOwn(input,'uses'),false);assert.equal(Object.hasOwn(input,'packageRoles'),false);
 const combination=referencePackets(d).find(p=>p.scope==='combination');assert.equal(combination.packageRoles.mainUseId,combination.uses[0].id);assert.deepEqual(combination.packageRoles.backupUseIds,[combination.uses[1].id]);
 d.adoptions.push({selectionHash:state.originalAutomaticOutcome.selectionHash,reason:'Synthetic state-only human choice'});assert.equal(referenceState({jobs:[]},d).status,'choice_blocked');
 d.envelope.source.policy.authorizedThrough='references';assert.equal(referenceState({jobs:[]},d).status,'choice_blocked');
});

test('budget reserves every actual panel seat before first call and accounts for previous generation spending',()=>{
 const d=stateFixture();d.envelope.configuration.budget.maxModelCalls=128;assert.equal(referenceState({jobs:[]},d).status,'budget_limit');assert.deepEqual(referenceReadyNodes(d),[]);assert.equal(REFERENCE_PLAN.reviewPackets*REFERENCE_PLAN.callsPerPacket+REFERENCE_PLAN.productionCalls,129);
 d.envelope.configuration.budget.maxModelCalls=129;d.priorUsage={modelCalls:1,searchCalls:0};assert.equal(referenceState({jobs:[]},d).required.modelCalls,130);
});

test('role/profile calibration cannot be borrowed across different declared component uses',()=>{
 const d=fillReview(stateFixture());d.envelope.configuration.calibrations=['visual','brand','user','communication'].map(role=>({status:'verified',role,applicabilityProfile:'material_color_component',protocolVersion:'reference-pixel-review-v1',providerId:'synthetic',model:'synthetic',evidenceRef:'synthetic-only',evidenceHash:'e'.repeat(64)}));assert.equal(referenceState({jobs:[]},d).status,'choice_blocked');assert.equal(referenceState({jobs:[]},d).originalAutomaticOutcome.status,'diagnostic');
 d.envelope.configuration.calibrations.forEach(c=>c.applicabilityProfile='direction');assert.equal(referenceState({jobs:[]},d).status,'choice_blocked');assert.equal(referenceState({jobs:[]},d).originalAutomaticOutcome.status,'waiting_human');
});

test('changed authoritative input editions preserve old generations while unchanged inputs require a bounded typed revision',async()=>{
 const {freezeReferenceEnvelope,reduceReferenceCommand}=await import('./reference-dossier.mjs');
 const roles=['reference_director','reference_lead','reference_collector','reference_review_director',...['visual','brand','user','communication'].flatMap(role=>[`reference_score_${role}`,`reference_opposition_${role}`])];
 const bindings=Object.fromEntries(roles.map(role=>[role,{role,model:'synthetic',providerId:'synthetic'}]));
 const source={kind:'copy-to-references',source:{artifactId:'copy',content:{directions:['a','b','c'].map(id=>({id}))}}},configuration={capability:{transport:'experimental_public_http',status:'available',evidenceRef:'synthetic-only'},budget:{maxModelCalls:516,maxSearchCalls:24}};
 const p={jobs:[]},context={actorType:'agent'},sourceEnvelope=()=>source;
 function open(previousDossierId,cycle=0){const envelope=freezeReferenceEnvelope(source,configuration,bindings);reduceReferenceCommand(p,{kind:'open-reference-dossier',artifactId:'copy',sourceContents:[],bindings,configuration,cycle,previousDossierId,dossierId:`reference-${envelope.envelopeHash.slice(0,32)}-${cycle}`},context,sourceEnvelope);}
 open();const first=p.referenceDossiers[0],firstEnvelope=structuredClone(first.envelope);assert.throws(()=>open(first.id,1),/typed revision/u);
 first.revisionRequest={findings:[{id:'synthetic'}]};open(first.id,1);const second=p.referenceDossiers[1];assert.equal(second.cycle,1);
 for(let cycle=2;cycle<=3;cycle++){p.referenceDossiers.at(-1).revisionRequest={findings:[{id:'synthetic'}]};open(p.referenceDossiers.at(-1).id,cycle);}p.referenceDossiers.at(-1).revisionRequest={findings:[{id:'synthetic'}]};assert.throws(()=>open(p.referenceDossiers.at(-1).id,4),/Maximum three/u);
 configuration.budget.maxModelCalls=515;const exhausted=structuredClone(p);assert.throws(()=>open(p.referenceDossiers.at(-1).id),/Maximum three bounded revision cycles shared/u);assert.deepEqual(p,exhausted);assert.equal(p.referenceDossiers.length,4);
 source.source.content.directions[0].slogan='A revised creative message';open(p.referenceDossiers.at(-1).id);assert.equal(p.referenceDossiers.length,5);assert.equal(p.referenceDossiers.at(-1).cycle,0);assert.equal(p.referenceDossiers.at(-1).envelope.source.source.content.directions[0].slogan,'A revised creative message');assert.deepEqual(first.envelope,firstEnvelope);assert.equal(first.envelope.configuration.budget.maxModelCalls,516);
 const current=p.referenceDossiers.at(-1);current.paused=true;configuration.budget.maxModelCalls=514;assert.throws(()=>open(current.id),/typed revision/u);current.paused=false;p.jobs.push({purpose:'reference',dossierId:current.id,status:'awaiting_reconciliation'});assert.throws(()=>open(current.id),/unknown outcomes/u);
});

test('production returns retain exact existing evidence pointers and the responsible upstream owner',async()=>{
 const {validateReferenceProductionOutput}=await import('./reference-dossier.mjs'),{referenceProductionFixture}=await import('./reference-dossier-fixtures.mjs');
 const input={protocolVersion:'reference-dossier-v1',dossierId:'synthetic',envelopeHash:'a'.repeat(64),nodeKey:'assignment',kind:'assignment',envelope:{directionIds:['a','b','c'],source:{source:{content:{message:'Original bounded message'}}}}};
 const output=referenceProductionFixture(input);output.decision='return';output.findings=[{id:'message-return',category:'message',owner:'copy-lead',pointer:'/envelope/source/source/content/message',evidence:['/envelope/source/source/content/message'],impact:'Synthetic message ambiguity.',acceptance:'Have the actual copy owner resolve the exact original ambiguity.'}];
 assert.equal(validateReferenceProductionOutput(output,input).findings[0].owner,'copy-lead');
 const forged=structuredClone(output);forged.findings[0].evidence=['invented'];assert.throws(()=>validateReferenceProductionOutput(forged,input),/resolvable input evidence/u);
 forged.findings[0].evidence=output.findings[0].evidence;forged.findings[0].owner='reference-lead';assert.throws(()=>validateReferenceProductionOutput(forged,input),/actual owner/u);
});

test('collector permits separate purpose records on one original while counting distinct image bytes only once',async()=>{
 const {validateReferenceProductionOutput}=await import('./reference-dossier.mjs'),{referenceProductionFixture}=await import('./reference-dossier-fixtures.mjs'),packet=referenceReviewFixturePacket();
 const input={protocolVersion:'reference-dossier-v1',dossierId:'synthetic',envelopeHash:'a'.repeat(64),nodeKey:'collector-0',kind:'collector',directionId:'d',images:packet.images};
 const raw=referenceProductionFixture(input),component={...raw.uses[0],id:'separate-composition-purpose',kind:'component',applicabilityProfile:'composition_component',translation:null,innovationHypothesis:null};raw.uses.push(component);
 assert.equal(validateReferenceProductionOutput(raw,input).uses.length,3);assert.equal(new Set(raw.uses.map(u=>u.imageId)).size,2);
 const duplicated=structuredClone(raw);duplicated.uses.forEach(u=>u.imageId=input.images[0].imageId);assert.throws(()=>validateReferenceProductionOutput(duplicated,input),/actual original images/u);
});

test('domain-only manual main-plus-component packages retain all seven panels and zero automatic-search credit',()=>{
 const d=stateFixture({kinds:['direction','component']});d.envelope.configuration.discoveryMode='manual_supplied';d.envelope.expandedPlan={...REFERENCE_PLAN,searchCalls:0};d.envelope.configuration.budget.maxSearchCalls=0;fillReview(d);
 const state=referenceState({jobs:[]},d);assert.equal(state.status,'choice_blocked');assert.equal(state.historyCoverage.blocks.length,135);assert.equal(state.originalAutomaticOutcome.coverage.length,7);assert.equal(state.originalAutomaticOutcome.discovery.automaticSearchCredit,false);assert.equal(state.originalAutomaticOutcome.discovery.mode,'manual_supplied');assert.equal(d.reports.filter(r=>r.rawReport.protocolVersion==='reference-pixel-review-v1').length,119);assert.ok(state.originalAutomaticOutcome.selection.every(s=>s.main.kind==='direction'&&s.complements.length===1&&s.backups.length===0));
});

test('completed blocked dossier returns one exact original occurrence to a bounded owner job without replay',async()=>{
 const {reduceReferenceCommand}=await import('./reference-dossier.mjs');
 const d=fillReview(stateFixture()),p={referenceDossiers:[d],jobs:Array.from({length:129},(_,index)=>({id:`original-${index}`,purpose:'reference',dossierId:d.id,status:'succeeded',attempts:[{dispatchStarted:true}]}))};
 d.envelope.configuration.budget.maxModelCalls=130;
 const before=structuredClone(d.reports),state=referenceState(p,d),target=state.historyCoverage.obligations.find(item=>item.origin.reportHash&&item.applicability.kind==='blocked');
 assert.ok(target);const packet=referencePackets(d).find(item=>referenceHash(item)===target.origin.packetHash);
 const command={kind:'request-reference-uncertainty-review',dossierId:d.id,selectionHash:state.originalAutomaticOutcome.selectionHash,packetId:packet.id,occurrenceIds:[target.id],reason:'Review the original visual uncertainty.',commandId:'return-one'};
 reduceReferenceCommand(p,command,{actorType:'human',actorId:'user'},undefined);
 const owner=p.jobs.at(-1);assert.equal(owner.status,'queued');assert.equal(owner.task.returnContract.protocolVersion,'reference-uncertainty-return-v1');assert.deepEqual(owner.binding,d.envelope.bindings.reference_lead);
 assert.equal(referenceNodeInput(d,referenceNodePlan(d,p).find(node=>node.key===owner.nodeKey),p).occurrences[0].id,target.id);
 assert.deepEqual(d.reports,before);assert.equal(p.jobs.filter(job=>job.purpose==='reference'&&job.status==='queued').length,1);
 assert.equal(referenceState(p,d).status,'choice_blocked');assert.equal(referenceState(p,d).historyCoverage.blocks.length,135);
 assert.throws(()=>reduceReferenceCommand(p,command,{actorType:'human',actorId:'user'},undefined),/already has an owner return/u);
});

test('owner return rejects stale selection, mismatched packet, role and exhausted call budget',async()=>{
 const {reduceReferenceCommand}=await import('./reference-dossier.mjs');
 const make=()=>{const d=fillReview(stateFixture()),p={referenceDossiers:[d],jobs:Array.from({length:129},(_,index)=>({id:`original-${index}`,purpose:'reference',dossierId:d.id,status:'succeeded',attempts:[{dispatchStarted:true}]}))},state=referenceState(p,d),target=state.historyCoverage.obligations.find(item=>item.origin.reportHash&&item.applicability.kind==='blocked'),packet=referencePackets(d).find(item=>referenceHash(item)===target.origin.packetHash),command={kind:'request-reference-uncertainty-review',dossierId:d.id,selectionHash:state.originalAutomaticOutcome.selectionHash,packetId:packet.id,occurrenceIds:[target.id],reason:'Review exact uncertainty.',commandId:'return-one'};return {d,p,command};};
 for(const mutation of [x=>x.command.selectionHash='stale',x=>x.command.packetId='other',x=>x.context={actorType:'agent',actorId:'fake'},x=>x.d.envelope.configuration.budget.maxModelCalls=129]){
  const x=make();x.d.envelope.configuration.budget.maxModelCalls=130;x.context={actorType:'human',actorId:'user'};mutation(x);const before=structuredClone(x.d.reports);assert.throws(()=>reduceReferenceCommand(x.p,x.command,x.context,undefined));assert.deepEqual(x.d.reports,before);assert.equal(x.p.jobs.length,129);
 }
});

test('pending owner return reserves the last model call before another return can queue',async()=>{
 const {reduceReferenceCommand}=await import('./reference-dossier.mjs');
 const d=fillReview(stateFixture()),p={referenceDossiers:[d],jobs:Array.from({length:129},(_,index)=>({id:`original-${index}`,purpose:'reference',dossierId:d.id,status:'succeeded',attempts:[{dispatchStarted:true}]}))};
 d.envelope.configuration.budget.maxModelCalls=130;
 const state=referenceState(p,d),targets=state.historyCoverage.obligations.filter(item=>item.origin?.reportHash&&item.applicability.kind==='blocked');
 const packet=referencePackets(d).find(item=>referenceHash(item)===targets[0].origin.packetHash),samePacket=targets.filter(item=>item.origin.packetHash===targets[0].origin.packetHash);
 assert.ok(samePacket.length>=2);
 const command=id=>({kind:'request-reference-uncertainty-review',dossierId:d.id,selectionHash:state.originalAutomaticOutcome.selectionHash,packetId:packet.id,occurrenceIds:[samePacket[id].id],reason:'Review exact uncertainty.',commandId:`return-${id}`});
 reduceReferenceCommand(p,command(0),{actorType:'human',actorId:'user'},undefined);
 assert.throws(()=>reduceReferenceCommand(p,command(1),{actorType:'human',actorId:'user'},undefined),{code:'REFERENCE_BUDGET_LIMIT'});
 assert.equal(p.jobs.filter(job=>job.status==='queued').length,1);
 assert.equal(d.uncertaintyReturns.length,1);
});
