import assert from 'node:assert/strict';
import {referencePackets,referenceNodePlan,referenceNodeInput,referenceState,reduceReferenceCommand} from './reference-dossier.mjs';
import {referenceReviewFixtureOutput,referenceReviewFixturePacket} from './reference-review-fixtures.mjs';
import {referenceHash} from './reference-review.mjs';
import {uncertaintyReturnInput,validateUncertaintyReturnOutput,REFERENCE_UNCERTAINTY_PROTOCOL} from './reference-uncertainty.mjs';

const directions=['a','b','c'];
const d={id:'duplicate-demo',envelope:{envelopeHash:'a'.repeat(64),directionIds:directions,source:{taskCard:{brief:'Synthetic duplicate purpose review.'},source:{content:{directions:directions.map(id=>({id,slogan:id,supportingCopy:'Copy'}))}},sourceRecords:[],policy:{humanGates:['references'],authorizedThrough:'sketch'}},configuration:{budget:{maxModelCalls:129,maxSearchCalls:6},calibrations:[]},bindings:{reference_lead:{providerId:'synthetic',model:'synthetic',role:'reference-lead'}}},reports:[],candidates:[],tools:[],adoptions:[],previousReturns:[],paused:false};
directions.forEach((directionId,index)=>{
  const packet=referenceReviewFixturePacket();
  packet.uses.forEach((use,i)=>{use.id=`${directionId}-${i}`;use.directionId=directionId;use.imageId=`img-${index}-${i}`;packet.images[i].imageId=use.imageId;packet.images[i].sha256=String(index*2+i+1).repeat(64);d.candidates.push({directionId,image:packet.images[i]});});
  if(index===0)packet.uses.push({...structuredClone(packet.uses[0]),id:'a-extra-purpose',kind:'component',applicabilityProfile:'composition_component',translation:null,innovationHypothesis:null});
  d.reports.push({nodeKey:`collector-${index}`,rawReport:{kind:'collector',decision:'accept',uses:packet.uses},reportHash:'c'.repeat(64)},{nodeKey:`merge-${index}`,rawReport:{decision:'accept',acceptedUseIds:packet.uses.map(use=>use.id)},reportHash:'d'.repeat(64)});
});
for(let cycle=0;cycle<30;cycle++){
  let count=0;
  for(const node of referenceNodePlan(d).filter(node=>node.kind==='review'&&!d.reports.some(report=>report.nodeKey===node.key)&&node.dependencies.every(key=>d.reports.some(report=>report.nodeKey===key)))){
    const rawReport=referenceReviewFixtureOutput(referenceNodeInput(d,node));
    d.reports.push({nodeKey:node.key,rawReport,reportHash:referenceHash(JSON.stringify(rawReport,null,2))});count++;
  }
  if(!count)break;
}
const state=referenceState({jobs:[]},d),occurrences=state.historyCoverage?.obligations??[];
const byId=new Map();for(const item of occurrences){if(!byId.has(item.id))byId.set(item.id,[]);byId.get(item.id).push(item);}
const duplicate=[...byId.values()].find(items=>items.length>1&&items[0].affected?.kind==='image'&&new Set(items.map(item=>item.affected.useIds[0])).size>1);
assert.ok(duplicate,'Expected one first-read image occurrence to carry two distinct affected use rows with the same ID');
assert.ok(duplicate.every(item=>item.applicability.kind==='blocked'));
const p={referenceDossiers:[d],jobs:Array.from({length:129},(_,index)=>({id:`old-${index}`,purpose:'reference',dossierId:d.id,status:'succeeded',attempts:[{dispatchStarted:true}]}))};
d.envelope.configuration.budget.maxModelCalls=131;
const packet=referencePackets(d).find(item=>referenceHash(item)===duplicate[0].origin.packetHash);
const command={kind:'request-reference-uncertainty-review',dossierId:d.id,selectionHash:referenceState(p,d).originalAutomaticOutcome.selectionHash,packetId:packet.id,occurrenceIds:[duplicate[0].id],reason:'Diagnose this exact original.',commandId:'first-return'};
reduceReferenceCommand(p,command,{actorType:'human',actorId:'human'},undefined);
assert.deepEqual(d.uncertaintyReturns[0].occurrences[0].affected.useIds,duplicate.map(item=>item.affected.useIds[0]));
assert.equal(d.uncertaintyReturns[0].occurrences[0].id,duplicate[0].id);
assert.equal(d.uncertaintyReturns[0].occurrences[0].pointer,duplicate[0].pointer);
assert.equal(d.uncertaintyReturns[0].occurrences[0].origin.reportHash,duplicate[0].origin.reportHash);
const input=uncertaintyReturnInput(d,d.uncertaintyReturns[0]);
const occurrence=input.occurrences[0],image=packet.images.find(item=>item.imageId===occurrence.affected.imageId);
const pixel={kind:'pixel',imageId:image.imageId,imageHash:image.sha256,region:[0,0,1,1],reportHash:null,pointer:null};
const reportPointer={kind:'report_pointer',imageId:null,imageHash:null,region:null,reportHash:occurrence.origin.reportHash,pointer:occurrence.pointer};
const raw={protocolVersion:REFERENCE_UNCERTAINTY_PROTOCOL,dossierId:d.id,envelopeHash:d.envelope.envelopeHash,reviewId:input.reviewId,decisions:[{occurrenceId:occurrence.id,disposition:'visual_evidence_required',reason:'Both affected uses still need visual judgment.',evidence:[pixel,reportPointer]}],limitations:['Diagnosis does not approve either use.']};
assert.equal(validateUncertaintyReturnOutput(raw,input).decisions.length,1);
const wrong=structuredClone(raw);wrong.decisions[0].evidence[0].imageId=packet.images.find(item=>item.imageId!==image.imageId).imageId;
assert.throws(()=>validateUncertaintyReturnOutput(wrong,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
const missing=structuredClone(raw);missing.decisions[0].evidence=[pixel];
assert.throws(()=>validateUncertaintyReturnOutput(missing,input),{code:'INVALID_REFERENCE_UNCERTAINTY'});
const second={...command,commandId:'second-return'};
assert.throws(()=>reduceReferenceCommand(p,second,{actorType:'human',actorId:'human'},undefined),/already has an owner return/u);
assert.throws(()=>reduceReferenceCommand(p,{...command,occurrenceIds:['missing-occurrence'],commandId:'bad-id'},{actorType:'human',actorId:'human'},undefined),{code:'INVALID_REFERENCE_DOSSIER'});
const wrongPacket=referencePackets(d).find(item=>item.id!==packet.id);
assert.throws(()=>reduceReferenceCommand(p,{...command,packetId:wrongPacket.id,occurrenceIds:[duplicate[0].id],commandId:'bad-packet'},{actorType:'human',actorId:'human'},undefined),{code:'INVALID_REFERENCE_DOSSIER'});
assert.equal(referenceState(p,d).status,'choice_blocked');
const other=state.historyCoverage.obligations.find(item=>item.kind==='original_occurrence'&&item.applicability.kind==='blocked'&&item.id!==duplicate[0].id&&item.origin.packetHash===duplicate[0].origin.packetHash);
assert.ok(other);
const next={...command,occurrenceIds:[other.id],commandId:'different-return'};
d.envelope.configuration.budget.maxModelCalls=130;
assert.throws(()=>reduceReferenceCommand(p,next,{actorType:'human',actorId:'human'},undefined),{code:'REFERENCE_BUDGET_LIMIT'});
assert.equal(d.uncertaintyReturns.length,1);
const queued=p.jobs.at(-1);queued.status='running';queued.attempts=[{dispatchStarted:true}];
d.envelope.configuration.budget.maxModelCalls=131;
reduceReferenceCommand(p,next,{actorType:'human',actorId:'human'},undefined);
assert.equal(d.uncertaintyReturns.length,2,'Started first return spends one call but no longer reserves it twice');
console.log(JSON.stringify({status:state.status,reportCount:d.reports.length,duplicateId:duplicate[0].id,rows:duplicate.map(item=>({packetHash:item.origin.packetHash,reportHash:item.origin.reportHash,pointer:item.pointer,affected:item.affected,applicability:item.applicability.kind})),selectedUse:d.uncertaintyReturns[0].occurrences[0].affected.useIds[0],alsoReturnedUse:d.uncertaintyReturns[0].occurrences[0].affected.useIds[1],secondRequest:'rejected because complete image scope already returned',budget:'129 spent plus 1 queued blocks a distinct return at 130; after first dispatch, 131 permits the second without double counting'},null,2));
