import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReferenceProductionOutput,referenceProductionInput,referencePackets} from './reference-dossier.mjs';
import {referenceProductionFixture} from './reference-dossier-fixtures.mjs';
import {referenceReviewFixturePacket,referenceReviewFixtureOutput} from './reference-review-fixtures.mjs';
import {referenceReviewInput,referenceReviewNodes} from './reference-review.mjs';

test('manual purposes sharing original and profile retain separate exact notes through collector, lead, and panel',()=>{
 const images=referenceReviewFixturePacket().images;
 const manualMaterials=[
  {id:'m-one',kind:'component',applicabilityProfile:'style_component',image:images[0],borrowingNote:'Borrow quiet typography only'},
  {id:'m-two',kind:'component',applicabilityProfile:'style_component',image:images[0],borrowingNote:'Borrow high contrast illustration only'},
  {id:'m-three',kind:'direction',applicabilityProfile:'direction',image:images[1],borrowingNote:'Borrow the second full direction only'},
  {id:'m-returned',kind:'component',applicabilityProfile:'style_component',image:images[0],borrowingNote:'Unsupported proposed color claim'},
 ].map(material=>({...material,directionId:'d'}));
 const input={protocolVersion:'reference-dossier-v1',dossierId:'synthetic-repair',envelopeHash:'a'.repeat(64),nodeKey:'collector-0',kind:'collector',directionId:'d',images,manualMaterials,acquisition:images.map(image=>({image}))};
 const output=referenceProductionFixture(input);
 output.uses.pop();Object.assign(output.materialDecisions.at(-1),{disposition:'return',useIds:[],reason:'Synthetic explicit return of unsupported proposal.'});
 const validated=validateReferenceProductionOutput(output,input);
 assert.equal(validated.uses.length,3);assert.equal(new Set(validated.uses.map(u=>u.imageId)).size,2);
 const collapsed=structuredClone(output);collapsed.uses.splice(1,1);collapsed.materialDecisions[1].useIds=[collapsed.materialDecisions[0].useIds[0]];
 assert.throws(()=>validateReferenceProductionOutput(collapsed,input));
 const rewritten=structuredClone(output);rewritten.uses[1].borrowingNote=rewritten.uses[0].borrowingNote;
 assert.throws(()=>validateReferenceProductionOutput(rewritten,input));
 const d={id:input.dossierId,envelope:{envelopeHash:input.envelopeHash,directionIds:['d'],configuration:{discoveryMode:'manual_supplied'},source:{taskCard:{brief:'Synthetic boundary repair only'},source:{content:{directions:[{id:'d'}]}},manualReferences:manualMaterials,sourceRecords:[]}},candidates:images.map(image=>({directionId:'d',image,provenance:manualMaterials.filter(m=>m.image.imageId===image.imageId).map(m=>({kind:'manual_supplied',materialId:m.id}))})),reports:[{nodeKey:'collector-0',rawReport:validated}],tools:[]};
 const leadInput=referenceProductionInput(d,{key:'merge-0',kind:'merge',directionId:'d',index:0});
 assert.deepEqual(leadInput.collectorReport.materialDecisions,output.materialDecisions);
 const lead=validateReferenceProductionOutput(referenceProductionFixture(leadInput),leadInput);d.reports.push({nodeKey:'merge-0',rawReport:lead});
 assert.deepEqual(lead.acceptedUseIds,output.uses.map(u=>u.id));
 const packet=referencePackets(d)[0],reports=[],scoreRoles=[];
 for(const node of referenceReviewNodes(packet.id)){
  const panelInput=referenceReviewInput(packet,node,reports);
  if(node.phase==='score'){
   assert.deepEqual(panelInput.uses.map(u=>[u.materialId,u.borrowingNote]),manualMaterials.slice(0,3).map(m=>[m.id,m.borrowingNote]));
   assert.equal(panelInput.images.length,2);
   scoreRoles.push(node.role);
  }
  reports.push({nodeKey:node.key,rawReport:referenceReviewFixtureOutput(panelInput)});
 }
 assert.deepEqual(scoreRoles,['visual','brand','user','communication']);
});
