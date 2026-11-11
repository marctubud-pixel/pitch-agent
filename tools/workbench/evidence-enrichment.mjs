import {isDeepStrictEqual} from 'node:util';
import {validateApplicabilityContext} from './research-applicability.mjs';
import {validateCorrectionEvidence,evidenceHash} from './correction-evidence.mjs';
export const REGISTERED_EVIDENCE_ENRICHMENT='registered-evidence-enrichment-v1';
export const EVIDENCE_ENRICHMENT_MODE='registered-evidence-enrichment';
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_EVIDENCE_ENRICHMENT'});};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function imageHashes(value,out=new Set()){if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){if(k==='imageSha256'&&sha(v))out.add(v);else imageHashes(v,out);}return [...out].sort();}
function sourceIdentity(source){return evidenceHash({text:source.text,scopeRelation:source.scopeRelation,verification:source.verification,identityStatus:source.identityStatus??null,imageHashes:imageHashes(source.caseIdentity)});}
export function requireNovelRegisteredEvidence(evidence,revisionOf){
 validateCorrectionEvidence(evidence,revisionOf);
 if(!['correction-evidence-v2','correction-evidence-v3'].includes(evidence.version)||evidence.delta.length)fail('Enrichment requires registered evidence only');
 const sourceIds=new Set(evidence.base.sourceRecords.map(sourceIdentity)),imageIds=new Set(evidence.base.visualCatalogue.map(v=>v.imageSha256));
 if(!evidence.registeredSourceDelta.length&&!evidence.visualDelta.length&&!evidence.capturedTextDelta?.length)fail('New registered material required');
 const seenText=new Set(evidence.base.sourceRecords.map(s=>s.text)),seenRaw=new Set(evidence.base.sourceRecords.flatMap(s=>s.managedCapture?[s.managedCapture.rawHash]:[]));
 for(const source of evidence.capturedTextDelta??[]){if(seenText.has(source.text)||seenRaw.has(source.managedCapture.rawHash))fail('Captured bytes or text already present in parent or delta');seenText.add(source.text);seenRaw.add(source.managedCapture.rawHash);}
 for(const source of evidence.registeredSourceDelta)if(sourceIds.has(sourceIdentity(source)))fail('Re-registering identical source evidence is not enrichment');
 for(const visual of evidence.visualDelta)if(!sha(visual.imageSha256)||imageIds.has(visual.imageSha256))fail('Re-registering the same reviewed image is not new evidence');
 return evidence;
}
export function validateEvidenceEnrichment(input){
 const value=input.enrichment;
 if(!exact(value,['version','retainedContext','unknownReviews','evidenceManifestHash'])||value.version!==REGISTERED_EVIDENCE_ENRICHMENT)fail('Explicit registered evidence trigger required');
 requireNovelRegisteredEvidence(input.evidence,input.revisionOf);
 if(value.evidenceManifestHash!==input.evidence.manifestHash)fail('Enrichment trigger and actual evidence differ');
 const context=validateApplicabilityContext(value.retainedContext);
 if(!isDeepStrictEqual(context.taskCard,input.taskCardSnapshot)||context.policy.version!==input.policyVersion)fail('Enrichment must preserve actual task and policy');
 if(!Array.isArray(value.unknownReviews)||value.unknownReviews.length>1000||value.unknownReviews.some(r=>!exact(r,['jobId','attemptId','status','receiptHash'])||!r.jobId||!r.attemptId||r.status!=='awaiting_reconciliation'||!sha(r.receiptHash))||new Set(value.unknownReviews.map(r=>r.jobId)).size!==value.unknownReviews.length)fail('Retained unknown outcomes changed');
 return value;
}
export function requireEnrichmentAdoption(input,content){
 if(!input.enrichment)return;
 validateEvidenceEnrichment(input);
 const used=new Set([...(content.sections??[]).flatMap(s=>s.evidenceIds??[]),...(content.claims??[]).flatMap(c=>c.evidenceRefs??[])]);
 for(const delta of [input.evidence.registeredSourceDelta,input.evidence.visualDelta,input.evidence.capturedTextDelta??[]])if(delta.length&&!delta.some(r=>used.has(r.id)))fail('Revised research must substantively adopt the new registered evidence');
}
