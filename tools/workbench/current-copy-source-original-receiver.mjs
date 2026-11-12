import {createHash,randomUUID} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import {assertStoreReadAdmission} from './store.mjs';
import {verifyOrdinaryProject} from './ordinary-model-project.mjs';
import {verifyStageOriginal} from './stage-original.mjs';
import {readArtifactLineageContents} from './artifact-content.mjs';
import {copyDeliveryEnvelope,DomainError} from './project.mjs';
import {requireResearchWorkflow} from './seven-stage-workflow.mjs';
import {SIMPLE_STRATEGY_VERSION} from './seven-stage-strategy.mjs';
import {COPY_CONTRACT_VERSION} from './stage-content.mjs';
import {researchMethodIdentity} from './research-method.mjs';
import {semanticConfiguration} from './semantic-authority.mjs';
import {isOrdinaryHttp} from './ordinary-model-claims.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>hash(JSON.stringify(value));
const need=(value,code)=>{if(!value)throw new DomainError(code,code);};
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=512;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const limits=Object.freeze({readAttempts:2,snapshotBytes:32*1024*1024,decodedBytes:64*1024*1024,storedBytes:64*1024*1024});
const requestKeys=['projectId','expectedRevision','taskCardId','policyVersion','copyArtifactId','copyContentHash','sourceHash'].sort();
const physicalProofs=new WeakMap();
const proofRequest=record=>Object.fromEntries(requestKeys.map(k=>[k,record.identity[k]]));
const diagnostic=record=>structuredClone({...record,physicalOriginalsVerified:true,executionAllowed:false,semanticApproval:false,currentness:'This diagnostic copy is not a reusable currentness authority.',scope:'Copy original bytes and same-version domain only; no business/human approval or execution authority.'});
export async function requireCurrentCopySourceOriginals(token,expectedIdentity){
 const proof=physicalProofs.get(token);need(proof&&!proof.state.closed,'COPY_PHYSICAL_TOKEN_REQUIRED');
 const request=requestIdentity(expectedIdentity);
 need(equal(proofRequest(proof.record),request),'COPY_ORIGINAL_CURRENT_CHANGED');
 const after=await proof.inspect(request);
 need(equal(proof.record.identity,after.identity)&&equal(proof.record.source,after.source),'COPY_ORIGINAL_SOURCE_CHANGED');
 return diagnostic(after);
}
function requestIdentity(request){
 need(request&&equal(Object.keys(request).sort(),requestKeys),'COPY_ORIGINAL_REQUEST_INVALID');
 need(['projectId','taskCardId','copyArtifactId'].every(k=>text(request[k]))&&['copyContentHash','sourceHash'].every(k=>hex(request[k]))&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0&&Number.isSafeInteger(request.policyVersion)&&request.policyVersion>=1,'COPY_ORIGINAL_REQUEST_INVALID');
 return structuredClone(request);
}
function current(project,request){
 requireResearchWorkflow(project);
 need(project.id===request.projectId&&project.revision===request.expectedRevision&&project.activeTaskCardId===request.taskCardId&&project.policies.at(-1)?.version===request.policyVersion,'COPY_ORIGINAL_CURRENT_CHANGED');
 need(project.activeByStage.copy===request.copyArtifactId,'COPY_ORIGINAL_COPY_CHANGED');
 const copy=project.artifacts.find(a=>a.id===request.copyArtifactId),strategy=project.artifacts.find(a=>a.id===project.activeByStage.strategy);
 need(copy?.stage==='copy'&&copy.contentHash===request.copyContentHash&&copy.copyContract?.version===COPY_CONTRACT_VERSION&&copy.copyContract.status==='complete'&&strategy?.strategyContract?.version===SIMPLE_STRATEGY_VERSION,'COPY_ORIGINAL_CONTRACT_REQUIRED');
 return copy;
}
const semanticIdentity=project=>{const c=semanticConfiguration(project);return {epoch:c.epoch,configurationHash:c.configurationHash};};

export function createCurrentCopySourceOriginalReceiver({store,executionRoot,consumerBinding}){
 need(store&&typeof store.withReadAdmission==='function'&&typeof store.read==='function'&&text(executionRoot),'COPY_ORIGINAL_CONFIGURATION_REQUIRED');
 need(consumerBinding&&equal(Object.keys(consumerBinding).sort(),['model','providerId','role'])&&consumerBinding.role==='references-lead'&&text(consumerBinding.providerId)&&text(consumerBinding.model),'COPY_ORIGINAL_BINDING_REQUIRED');
 const binding=structuredClone(consumerBinding),tokens=new WeakMap(),state={closed:false};
 async function inspect(request){
  need(!state.closed,'COPY_ORIGINAL_RECEIVER_CLOSED');
  const root=await realpath(executionRoot);
  let verified;
  const admitted=await store.withReadAdmission(request.projectId,limits,async()=>{
   // An arbitrary object with read()/withReadAdmission() cannot impersonate a native store.
   assertStoreReadAdmission(store,request.projectId);
   const project=store.read(request.projectId),copy=current(project,request),snapshotHash=digest(project),semantic=semanticIdentity(project),method=researchMethodIdentity();
   const contents=await readArtifactLineageContents(project,copy.id,root);
   const lineageIds=new Set(contents.map(c=>c.artifactId));
   const sourceJobs=project.jobs.filter(j=>['research','strategy','copy'].includes(j.stage)&&[j.targetArtifactId,...(j.inputVersionIds??[]),...(j.outputVersionIds??[])].some(id=>lineageIds.has(id)));
   need(sourceJobs.every(j=>(j.attempts??[]).every(a=>!a.receipt||isOrdinaryHttp(a.receipt))),'COPY_ORIGINAL_RECEIPT_FORMAT_UNSUPPORTED');
   const source=copyDeliveryEnvelope(project,copy.id,contents,binding);
   need(source.envelopeHash===request.sourceHash,'COPY_ORIGINAL_SOURCE_CHANGED');
   await verifyOrdinaryProject(project,{executionRoot:root});
   const stages=[];
   for(const item of contents){
    const artifact=project.artifacts.find(a=>a.id===item.artifactId);
    need(!artifact?.reconciliationId,'COPY_ORIGINAL_RECOVERY_UNSUPPORTED');
    stages.push(await verifyStageOriginal(project,artifact,{executionRoot:root}));
   }
   const afterContents=await readArtifactLineageContents(project,copy.id,root),after=store.read(request.projectId);
   current(after,request);
   need(digest(after)===snapshotHash&&equal(semanticIdentity(after),semantic)&&equal(researchMethodIdentity(),method)&&await realpath(executionRoot)===root,'COPY_ORIGINAL_CURRENT_CHANGED');
   const afterSource=copyDeliveryEnvelope(after,copy.id,afterContents,binding);
   need(equal(contents,afterContents)&&equal(source,afterSource),'COPY_ORIGINAL_SOURCE_CHANGED');
   verified={source,identity:{...request,executionRoot:root,consumerBinding:binding,snapshotHash,semantic,method},evidence:{ordinaryProject:'verified_by_native',stages,sourceBodies:contents.map(c=>({artifactId:c.artifactId,sha256:hash(c.contentText),byteLength:Buffer.byteLength(c.contentText)}))}};
   return verified;
  });
  need(!state.closed,'COPY_ORIGINAL_RECEIVER_CLOSED');
  if(admitted.kind!=='complete')throw new DomainError(admitted.code??'COPY_ORIGINAL_READ_FAILED',admitted.message??'Original read admission failed');
  need(verified&&admitted.value===verified,'COPY_ORIGINAL_NATIVE_ADMISSION_REQUIRED');
  return {...admitted.value,readUsage:admitted.usage};
 }
 function owned(token){need(!state.closed,'COPY_ORIGINAL_RECEIVER_CLOSED');const record=tokens.get(token);need(record,'COPY_PHYSICAL_TOKEN_REQUIRED');return record;}
 return {
  async capture(request){const frozen=requestIdentity(request),record=await inspect(frozen);const token=Object.freeze({protocol:'current-copy-physical-originals-v1',id:randomUUID(),physicalOriginalsVerified:true,executionAllowed:false,semanticApproval:false});const saved=structuredClone(record);tokens.set(token,saved);physicalProofs.set(token,{record:saved,inspect,state});return token;},
  read(token){return diagnostic(owned(token));},
  async assertCurrent(token){return requireCurrentCopySourceOriginals(token,proofRequest(owned(token)));},
  close(){state.closed=true;},
  capability:Object.freeze({executionAllowed:false,semanticApproval:false,acceptsMetadataProof:false,restorationSupported:false,sourceReceiptFormat:'ordinary_http_only'})
 };
}
