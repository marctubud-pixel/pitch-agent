import {readAcceptanceCaseRegistration} from './local-acceptance-coordinator.mjs';
import {mkdir,realpath,writeFile,readFile} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {localReferenceResponse} from './local-acceptance-reference-driver.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
export const LOCAL_REFERENCE_ENGINEERING_CONTRACT='local-reference-engineering-positive-v1';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
const sha=value=>createHash('sha256').update(value).digest('hex');
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const flags={syntheticOnly:true,realQualityVerified:false,realConsumerValidation:false,productionFinalAuthority:false};
export function localReferenceEngineeringResponse(context){
 if(context.job.purpose!=='reference')return undefined;
 need(context.job.binding?.providerId==='local-synthetic'&&context.job.binding?.model==='synthetic','LOCAL_REFERENCE_ENGINEERING_BINDING_REQUIRED');
 // Only our own freshly constructed fixture is used. No stored or external report is accepted.
 const raw=localReferenceResponse(context);
 if(!raw)return raw;
 if(raw.kind==='collector'){
  need(raw.uses.every(u=>equal(u.uncertainties,['Synthetic fixture; no aesthetic validation.','这是本地预置方法说明，未证明参考审美适配或真实用户共鸣。'])),'LOCAL_REFERENCE_ENGINEERING_FIXTURE_CHANGED');
  raw.uses=raw.uses.map(use=>({...use,uncertainties:[]}));
 }
 if(raw.phase?.endsWith('first_read')){
  need(raw.readings.every(r=>equal(r.uncertainties,['Synthetic pixels have not been judged.'])),'LOCAL_REFERENCE_ENGINEERING_FIXTURE_CHANGED');
  raw.readings=raw.readings.map(reading=>({...reading,uncertainties:[]}));
 }
 return raw;
}
async function contractIdentity({includeCoordinator=false}={}){
 const files=['local-reference-engineering-contract.mjs','local-acceptance-reference-driver.mjs','reference-review-fixtures.mjs','reference-dossier-fixtures.mjs'];
 if(includeCoordinator)files.push('local-acceptance-coordinator.mjs');
 const sources=[];for(const file of files)sources.push({file,sha256:sha(await readFile(fileURLToPath(new URL(file,import.meta.url))))});
 return {version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,scope:'local_engineering_schema_and_lifecycle_only',binding:{providerId:'local-synthetic',model:'synthetic'},sources,...flags};
}
function projectIfPresent(store,id){return store.list().some(p=>p.id===id)?store.read(id):null;}
function referenceStarted(project){return project&&((project.referenceDossiers?.length??0)>0||(project.referenceIntents?.length??0)>0||project.jobs.some(j=>j.purpose==='reference'));}
export async function prepareLocalReferenceResponseContract({projectStore,executionRoot,attemptRoot=executionRoot,selection}={}){
 need(typeof executionRoot==='string'&&typeof attemptRoot==='string'&&!relative(executionRoot,attemptRoot).startsWith('..')&&!isAbsolute(relative(executionRoot,attemptRoot)),'LOCAL_REFERENCE_ENGINEERING_ATTEMPT_ROOT_REQUIRED');
 if(selection===undefined)return {response:async context=>{
  if(context.job.purpose==='reference'){try{await readManagedLayoutBytes(executionRoot,join(attemptRoot,'reference-response-contracts',sha(context.project.id)+'.json'),1024*1024);throw Object.assign(Error('LOCAL_REFERENCE_ENGINEERING_SELECTION_REQUIRED'),{code:'LOCAL_REFERENCE_ENGINEERING_SELECTION_REQUIRED'});}catch(e){if(e.code!=='ENOENT')throw e;}}
  return localReferenceResponse(context);
 },descriptor:null};
 const dynamic=selection?.registrationMode==='acceptance-case-initializer';
 need(object(selection,dynamic?['version','projectIds','registrationMode']:['version','projectIds'])&&selection.version===LOCAL_REFERENCE_ENGINEERING_CONTRACT&&Array.isArray(selection.projectIds)&&(dynamic?selection.projectIds.length===0:selection.projectIds.length>0)&&selection.projectIds.length<=100&&selection.projectIds.every(id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(id))&&new Set(selection.projectIds).size===selection.projectIds.length,'LOCAL_REFERENCE_ENGINEERING_SELECTION_REQUIRED');
 need(await realpath(executionRoot)===executionRoot&&await realpath(attemptRoot)===attemptRoot,'LOCAL_REFERENCE_ENGINEERING_CANONICAL_ROOT_REQUIRED');
 const identity=await contractIdentity({includeCoordinator:dynamic}),identityHash=sha(JSON.stringify(identity)),directory=join(attemptRoot,'reference-response-contracts'),allowed=new Map();
 await mkdir(directory,{recursive:true,mode:0o700});need(await realpath(directory)===directory,'LOCAL_REFERENCE_ENGINEERING_CANONICAL_ROOT_REQUIRED');
 function recordFor(projectId,grant){return {protocol:'local-reference-response-registration-v1',projectId,nativeExecutionRoot:executionRoot,attemptRoot,identity,identityHash,...(grant?{grant}:{})};}
 async function register(projectId,grant){
  const record=recordFor(projectId,grant),bytes=Buffer.from(JSON.stringify(record)),path=join(directory,sha(projectId)+'.json');
  let existing;try{existing=await readManagedLayoutBytes(executionRoot,path,1024*1024);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing)need(existing.equals(bytes),'LOCAL_REFERENCE_ENGINEERING_CONTRACT_CHANGED');
  else{
   need(!referenceStarted(projectIfPresent(projectStore,projectId)),'LOCAL_REFERENCE_ENGINEERING_RETROFIT_FORBIDDEN');
   try{await writeFile(path,bytes,{flag:'wx',mode:0o400});}catch(e){if(e.code!=='EEXIST')throw e;}
   need((await readManagedLayoutBytes(executionRoot,path,1024*1024)).equals(bytes),'LOCAL_REFERENCE_ENGINEERING_CONTRACT_CHANGED');
  }
  const descriptor={projectId,path,sha256:sha(bytes),byteLength:bytes.length};allowed.set(projectId,descriptor);return structuredClone(descriptor);
 }
 for(const projectId of [...selection.projectIds].sort())await register(projectId);
 async function registerProject(registration){
  need(dynamic,'LOCAL_REFERENCE_ENGINEERING_DYNAMIC_REGISTRATION_DISABLED');
  const grant=readAcceptanceCaseRegistration(registration),p=projectIfPresent(projectStore,grant.projectId);
  need(['m6','dexian'].includes(grant.caseId)&&p&&p.id===grant.projectId&&p.taskCards[0]?.id===grant.initialTaskCardId&&sha(JSON.stringify(p.taskCards[0].brief))===grant.initialBriefHash,'LOCAL_REFERENCE_ENGINEERING_CASE_GRANT_CHANGED');
  return register(grant.projectId,grant);
 }
 async function registrationForProject(projectId){
  const path=join(directory,sha(projectId)+'.json'),bytes=await readManagedLayoutBytes(executionRoot,path,1024*1024),record=JSON.parse(bytes.toString());
  const grant=record.grant,p=dynamic?projectIfPresent(projectStore,projectId):null;
  need(equal(record,recordFor(projectId,grant))&&(!dynamic||object(grant,['protocol','id','projectId','caseId','creationCommandId','creationRequestHash','initialTaskCardId','initialBriefHash'])&&grant.protocol==='local-acceptance-case-registration-v1'&&grant.projectId===projectId&&grant.id===projectId&&['m6','dexian'].includes(grant.caseId)&&p?.taskCards[0]?.id===grant.initialTaskCardId&&sha(JSON.stringify(p.taskCards[0].brief))===grant.initialBriefHash),'LOCAL_REFERENCE_ENGINEERING_CONTRACT_CHANGED');
  const known=allowed.get(projectId);if(known)need(bytes.length===known.byteLength&&sha(bytes)===known.sha256,'LOCAL_REFERENCE_ENGINEERING_CONTRACT_CHANGED');
  const descriptor={projectId,path,sha256:sha(bytes),byteLength:bytes.length};allowed.set(projectId,descriptor);return structuredClone(descriptor);
 }
 async function response(context){
  if(context.job.purpose!=='reference')return localReferenceResponse(context);
  if(dynamic){try{await registrationForProject(context.project.id);}catch(e){if(e.code==='ENOENT')throw Object.assign(Error('LOCAL_REFERENCE_ENGINEERING_CASE_REGISTRATION_REQUIRED'),{code:'LOCAL_REFERENCE_ENGINEERING_CASE_REGISTRATION_REQUIRED'});throw e;}}
  else if(!allowed.has(context.project.id)){try{await readManagedLayoutBytes(executionRoot,join(directory,sha(context.project.id)+'.json'),1024*1024);throw Object.assign(Error('LOCAL_REFERENCE_ENGINEERING_SELECTION_REQUIRED'),{code:'LOCAL_REFERENCE_ENGINEERING_SELECTION_REQUIRED'});}catch(e){if(e.code!=='ENOENT')throw e;}return localReferenceResponse(context);}
  await registrationForProject(context.project.id);return localReferenceEngineeringResponse(context);
 }
 return {response,registerProject:dynamic?registerProject:undefined,registrationForProject,descriptor:structuredClone({...identity,identityHash,nativeExecutionRoot:executionRoot,attemptRoot,registrationMode:dynamic?'acceptance-case-initializer':'explicit-project-list',registrations:[...allowed.values()]})};
}
