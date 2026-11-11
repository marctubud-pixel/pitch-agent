import {createHash} from 'node:crypto';
import {join,dirname,basename} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
const version='local-reference-engineering-positive-v1';
const names=['local-reference-engineering-contract.mjs','local-acceptance-reference-driver.mjs','reference-review-fixtures.mjs','reference-dossier-fixtures.mjs'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const flags={syntheticOnly:true,realQualityVerified:false,realConsumerValidation:false,productionFinalAuthority:false};
async function physical(root,d){
 need(d&&typeof d.path==='string'&&/^[a-f0-9]{64}$/.test(d.sha256)&&Number.isSafeInteger(d.byteLength)&&d.byteLength>0&&d.byteLength<=4*1024*1024,'LOCAL_LINKED_DESCRIPTOR_REQUIRED');
 const bytes=await readManagedLayoutBytes(root,d.path,4*1024*1024);need(bytes.length===d.byteLength&&sha(bytes)===d.sha256,'LOCAL_LINKED_ORIGINAL_CHANGED');return bytes;
}
async function data(root,d){return JSON.parse((await physical(root,d)).toString('utf8'));}
export async function readLinkedReferenceProvenance({referenceMeta:meta,referenceResult:result,project,executionRoot,attemptRoot,nativeModuleRoot}={}){
 if(!meta?.linkedAttempt&&!result?.linkedAttempt&&!meta?.referenceResponseContract&&!result?.referenceResponseContract)return null;
 const linked=meta?.linkedAttempt,contract=meta?.referenceResponseContract;
 need(linked&&contract&&equal(linked,result?.linkedAttempt)&&equal(contract,result?.referenceResponseContract),'LOCAL_LINKED_META_RESULT_MISMATCH');
 need(meta.projectId===project.id&&result.projectId===project.id&&meta.caseId===result.caseId&&meta.executionRoot===executionRoot&&result.executionRoot===executionRoot&&meta.workRoot===attemptRoot&&result.workRoot===attemptRoot&&meta.databasePath===join(attemptRoot,'projects.sqlite')&&result.databasePath===meta.databasePath&&meta.imageRoot===join(attemptRoot,'images')&&result.imageRoot===meta.imageRoot,'LOCAL_LINKED_RUNTIME_IDENTITY_CHANGED');
 need(linked.contractVersion===version&&/^[a-f0-9]{64}$/.test(linked.initialDatabaseHash)&&linked.newReferenceCeiling===129&&linked.ordinaryCreativeQuality==='unverified'&&linked.freshBriefToWholeChainProven===false,'LOCAL_LINKED_ENGINEERING_BOUNDARY_REQUIRED');
 for(const [key,name]of [['planFile','LINKED-PLAN.json'],['auditFile','PRESERVED-PREDECESSORS.json'],['frozenFile','LINKED-RUNTIME.json']])need(linked[key]?.path===join(attemptRoot,name),'LOCAL_LINKED_PATH_CHANGED');
 const [plan,audits,frozen]=await Promise.all([data(attemptRoot,linked.planFile),data(attemptRoot,linked.auditFile),data(attemptRoot,linked.frozenFile)]);
 const {planHash,...body}=plan;need(planHash===sha(JSON.stringify(body))&&plan.version==='linked-local-reference-attempt-plan-v1'&&plan.contractVersion===version&&plan.acceptanceAttemptId===linked.acceptanceAttemptId&&plan.caseId===meta.caseId&&plan.nativeProjectId===project.id,'LOCAL_LINKED_PLAN_CHANGED');
 const artifact=project.artifacts.find(a=>a.id===project.activeByStage.copy);
 need(artifact?.stage==='copy'&&artifact.id===meta.copyArtifactId&&artifact.id===result.originalCopyArtifactId&&plan.parent?.copyArtifactId===artifact.id&&plan.parent.copyContentHash===artifact.contentHash&&plan.parent.nativeProjectId===project.id&&plan.parent.executionRoot===executionRoot&&plan.parent.databasePath===join(executionRoot,'projects.sqlite')&&plan.parent.databaseHash===linked.initialDatabaseHash&&[plan.parent.referenceJobCount,plan.parent.referenceDossierCount,plan.parent.referenceIntentCount].every(v=>v===0),'LOCAL_LINKED_COPY_IDENTITY_CHANGED');
 need(equal(plan.predecessor,audits[meta.caseId])&&plan.predecessor.nativeProjectId===project.id&&plan.predecessor.copyArtifactId===artifact.id&&plan.predecessor.modelCalls===linked.priorConsumedReferenceCalls&&plan.predecessor.originalsPreserved===true&&plan.approvalTransferred===false&&plan.oldUnknownsWaived===false&&plan.freshBriefToWholeChainProven===false&&plan.realQualityVerified===false&&plan.allowance?.maxModelCalls===129&&plan.allowance.maxSearchCalls===0&&plan.allowance.priorBudgetReset===false,'LOCAL_LINKED_PREDECESSOR_CHANGED');
 // Audit records remain original engineering observations; reading them does not approve their ordinary-quality findings.
 const auditPins=[];
 for(const [caseId,a]of Object.entries(audits)){
  need(['m6','dexian'].includes(caseId)&&typeof a.auditPath==='string'&&/^[a-f0-9]{64}$/.test(a.auditHash)&&dirname(a.auditPath)===dirname(a.databasePath)&&a.originalsPreserved===true,'LOCAL_LINKED_AUDIT_REQUIRED');
  const bytes=await readManagedLayoutBytes(dirname(a.auditPath),a.auditPath,4*1024*1024);need(sha(bytes)===a.auditHash,'LOCAL_LINKED_AUDIT_CHANGED');auditPins.push({caseId,path:a.auditPath,sha256:a.auditHash,byteLength:bytes.length});
 }
 need(auditPins.length===2&&frozen.protocol==='linked-reference-runtime-freeze-v1'&&frozen.acceptanceAttemptId===linked.acceptanceAttemptId&&equal(frozen.planFile,linked.planFile)&&equal(frozen.auditFile,linked.auditFile)&&frozen.planHash===planHash&&frozen.initialDatabaseHash===linked.initialDatabaseHash&&frozen.nativeProjectId===project.id&&frozen.sourceCopyArtifactId===artifact.id&&frozen.sourceCopyContentHash===artifact.contentHash&&frozen.nativeExecutionRoot===executionRoot&&frozen.attemptRoot===attemptRoot&&equal(frozen.responseContract,contract)&&frozen.settingsHash===meta.settingsHash&&frozen.newReferenceCeiling===129&&frozen.priorConsumedReferenceCalls===Object.values(audits).reduce((n,a)=>n+a.modelCalls,0)&&frozen.ordinaryCreativeQuality==='unverified'&&frozen.freshBriefToWholeChainProven===false,'LOCAL_LINKED_FROZEN_IDENTITY_CHANGED');
 const settings=await readManagedLayoutBytes(attemptRoot,join(attemptRoot,'runtime-settings.json'),4*1024*1024);need(sha(settings)===frozen.settingsHash,'LOCAL_LINKED_SETTINGS_CHANGED');
 const {identityHash,nativeExecutionRoot,attemptRoot:registeredRoot,registrationMode,registrations,...identity}=contract;
 need(identity.version===version&&identity.scope==='local_engineering_schema_and_lifecycle_only'&&equal(identity.binding,{providerId:'local-synthetic',model:'synthetic'})&&Object.entries(flags).every(([k,v])=>identity[k]===v)&&identityHash===sha(JSON.stringify(identity))&&nativeExecutionRoot===executionRoot&&registeredRoot===attemptRoot&&registrationMode==='explicit-project-list'&&Array.isArray(registrations)&&registrations.length===1&&registrations[0].projectId===project.id,'LOCAL_LINKED_REGISTRY_IDENTITY_CHANGED');
 need(Array.isArray(identity.sources)&&identity.sources.length===4&&new Set(identity.sources.map(s=>s.file)).size===4&&names.every(n=>identity.sources.some(s=>s.file===n)),'LOCAL_LINKED_FOUR_SOURCES_REQUIRED');
 for(const source of identity.sources){const bytes=await readManagedLayoutBytes(nativeModuleRoot,join(nativeModuleRoot,source.file),4*1024*1024);need(sha(bytes)===source.sha256,'LOCAL_LINKED_CONTRACT_SOURCE_CHANGED');}
 const registration=registrations[0];need(registration.path===join(attemptRoot,'reference-response-contracts',sha(project.id)+'.json'),'LOCAL_LINKED_REGISTRY_PATH_CHANGED');
 const bytes=await physical(attemptRoot,registration),expected={protocol:'local-reference-response-registration-v1',projectId:project.id,nativeExecutionRoot:executionRoot,attemptRoot,identity,identityHash};need(bytes.equals(Buffer.from(JSON.stringify(expected))),'LOCAL_LINKED_REGISTRY_BYTES_CHANGED');
 need(Array.isArray(frozen.codeIdentity)&&frozen.codeIdentity.length===4&&new Set(frozen.codeIdentity.map(c=>c.path)).size===4&&['linked-reference-runner.mjs','reference-runner-core.mjs','linked-reference-attempt.mjs'].every((name,i)=>basename(frozen.codeIdentity[i].path)===name&&dirname(frozen.codeIdentity[i].path)===dirname(frozen.codeIdentity[0].path))&&frozen.codeIdentity[3].path===join(nativeModuleRoot,'local-reference-engineering-contract.mjs'),'LOCAL_LINKED_CODE_IDENTITY_REQUIRED');
 for(const c of frozen.codeIdentity){const bytes=await readManagedLayoutBytes(dirname(c.path),c.path,4*1024*1024);need(sha(bytes)===c.sha256,'LOCAL_LINKED_RUNNER_SOURCE_CHANGED');}
 return {protocol:'linked-reference-provenance-readback-v1',acceptanceAttemptId:linked.acceptanceAttemptId,projectId:project.id,copyArtifactId:artifact.id,copyContentHash:artifact.contentHash,executionRoot,attemptRoot,linkedAttempt:structuredClone(linked),referenceResponseContract:structuredClone(contract),auditPins,codeIdentity:structuredClone(frozen.codeIdentity),sourceIdentities:structuredClone(identity.sources),settingsHash:frozen.settingsHash,claimsQuality:false,productionAuthority:false};
}
