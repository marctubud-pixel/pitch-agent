import {configFields,configNeed,configText} from './configuration-values.mjs';
import {validateFinalAssignments} from './final-review-assignments.mjs';
export function validateFinalReviewConfiguration(c){
 configFields(c,['schemaVersion','configuration','owners','allowance']);
 configNeed(c.schemaVersion==='final-review-runtime-v1','/schemaVersion');
 configFields(c.owners,['layoutProducer','finalConsumer','finalProducer','deliveryConsumer'],'/owners');
 for(const key of ['layoutProducer','finalConsumer','finalProducer','deliveryConsumer']){
  const owner=c.owners[key];configFields(owner,['actorIdentity','assignmentIdentity','providerIdentity','modelIdentity'],`/owners/${key}`);
  configNeed(['actorIdentity','assignmentIdentity','providerIdentity','modelIdentity'].every(k=>configText(owner[k])),`/owners/${key}`);
 }
 for(const [a,b] of [['layoutProducer','finalConsumer'],['finalProducer','deliveryConsumer']])configNeed(c.owners[a].actorIdentity!==c.owners[b].actorIdentity,'/owners','FINAL_OWNER_SELF_ACCEPTANCE');
 configFields(c.allowance,['authorityIdentity','totalCalls','provenance'],'/allowance');
 configNeed(configText(c.allowance.authorityIdentity)&&configText(c.allowance.provenance)&&Number.isSafeInteger(c.allowance.totalCalls)&&c.allowance.totalCalls>=0,'/allowance');
 configFields(c.configuration,['schemaVersion','assignmentPolicy'],'/configuration');
 const p=c.configuration.assignmentPolicy;
 configFields(p,['profiles','roles','director','ownerProfiles'],'/configuration/assignmentPolicy');
 configNeed(Array.isArray(p.profiles),'/configuration/assignmentPolicy/profiles');
 for(const profile of p.profiles){
  configFields(profile,['identity','providerIdentity','modelIdentity','adapterEvidenceIdentity','contextEvidenceIdentity','transportEvidenceIdentity','independentContextEvidenceIdentity','operation','context','reportBoundBytes','transport'],'/profiles');
  configFields(profile.context,['maxInputBytes','maxOutputBytes'],'/profiles/context');
  if(profile.transport!==null)configFields(profile.transport,['maxImages','maxBytes','maxPixels','maxImageBytes','maxImagePixels'],'/profiles/transport');
 }
 const seat=s=>configFields(s,['assignmentIdentity','actorIdentity','profileIdentity'],'/assignment');
 configFields(p.roles,['content','visual','brand','user','communication'],'/roles');
 for(const role of ['content','visual','brand','user','communication']){configFields(p.roles[role],['primary','blind','primarySynthesis','blindSynthesis','challenge'],'/roles/'+role);for(const s of Object.values(p.roles[role]))seat(s);}
 seat(p.director);configFields(p.ownerProfiles,['layoutProducer','finalConsumer','finalProducer','deliveryConsumer'],'/ownerProfiles');
 const result=validateFinalAssignments(c.configuration,c.owners);configNeed(result.kind==='valid','/configuration','FINAL_INVALID_ASSIGNMENTS');
 return [];
}
