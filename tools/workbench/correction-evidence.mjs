import {validateCapturedTextShape} from './captured-text-evidence.mjs';
import {isIP,BlockList} from 'node:net';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateVisualCatalogue} from './visual-catalogue.mjs';
export const LATEST_CORRECTION_PROTOCOL='typed-revision-v3';
export const CORRECTION_EVIDENCE_VERSION='correction-evidence-v1';
export const COMPLETE_CORRECTION_REVIEW_PROTOCOL='correction-handling-v3';
const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID_CORRECTION'});};
const reserved=new BlockList();
for(const [ip,bits]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])reserved.addSubnet(ip,bits);
const ipv6Global=new BlockList();ipv6Global.addSubnet('2000::',3,'ipv6');
const ipv6Reserved=new BlockList();for(const [ip,bits]of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])ipv6Reserved.addSubnet(ip,bits,'ipv6');
function publicHost(host){host=host.replace(/^\[|\]$/g,'');const family=isIP(host);return family===4?!reserved.check(host):family===6?ipv6Global.check(host,'ipv6')&&!ipv6Reserved.check(host,'ipv6'):host.includes('.')&&!host.endsWith('.local')&&!host.endsWith('.localhost');}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const evidenceHash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export function admitSupplementalSources(records=[]){
 if(!Array.isArray(records)||records.length>200)fail('Supplemental sources must be a bounded array');
 const ids=new Set();
 return records.map(source=>{
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(k=>!['id','url','text','scopeRelation','reason'].includes(k)))fail('Supplemental source authority fields forbidden');
  for(const k of ['id','url','text','scopeRelation'])if(typeof source[k]!=='string'||!source[k].trim()||source[k].length>20000)fail('Invalid supplemental source field');
  if(source.reason!==undefined&&(typeof source.reason!=='string'||!source.reason.trim()||source.reason.length>20000))fail('Invalid supplemental source reason');
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(source.id)||ids.has(source.id))fail('Duplicate or invalid supplemental source ID');ids.add(source.id);
  let url;try{url=new URL(source.url);}catch{fail('Invalid supplemental source URL');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!publicHost(url.hostname))fail('Supplemental source requires public HTTP(S) URL');
  if(!['background','unverified'].includes(source.scopeRelation))fail('Supplemental source must be background or unverified');
  return {id:source.id,url:source.url,text:source.text,scopeRelation:source.scopeRelation,...(source.reason===undefined?{}:{reason:source.reason}),verification:'captured'};
 });
}
export function evidenceRecords(evidence){return [...structuredClone(evidence.base.sourceRecords),...structuredClone(evidence.delta),...structuredClone(evidence.registeredSourceDelta??[]),...structuredClone(evidence.capturedTextDelta??[])];}
export function evidenceVisualRecords(evidence){return [...structuredClone(evidence.base.visualCatalogue),...structuredClone(evidence.visualDelta??[])];}
export function createCorrectionEvidence(revisionOf,sourceRecords,visualCatalogue,delta=[],registered={}){
 const value={version:CORRECTION_EVIDENCE_VERSION,canonicalization:'sorted-object-keys-json-v1',base:{...structuredClone(revisionOf),sourceRecords:structuredClone(sourceRecords),visualCatalogue:structuredClone(visualCatalogue)},delta:structuredClone(delta)};
 if((registered.sourceRecords??[]).length||(registered.visualCatalogue??[]).length){value.version='correction-evidence-v2';value.registeredSourceDelta=structuredClone(registered.sourceRecords??[]);value.visualDelta=structuredClone(registered.visualCatalogue??[]);}
 if((registered.capturedText??[]).length){value.version='correction-evidence-v3';value.registeredSourceDelta??=[];value.visualDelta??=[];value.capturedTextDelta=structuredClone(registered.capturedText);}
 return validateCorrectionEvidence({...value,manifestHash:evidenceHash(value)},revisionOf);
}
export function validateCorrectionEvidence(value,revisionOf){
 const textDelta=value?.version==='correction-evidence-v3',registered=textDelta||value?.version==='correction-evidence-v2';
 if(!exact(value,['version','canonicalization','base','delta','manifestHash',...(registered?['registeredSourceDelta','visualDelta']:[]),...(textDelta?['capturedTextDelta']:[])])||(!registered&&value.version!==CORRECTION_EVIDENCE_VERSION)||value.canonicalization!=='sorted-object-keys-json-v1'||!exact(value.base,['artifactId','contentHash','sourceRecords','visualCatalogue'])||!isDeepStrictEqual({artifactId:value.base.artifactId,contentHash:value.base.contentHash},revisionOf)||!Array.isArray(value.base.sourceRecords)||!Array.isArray(value.base.visualCatalogue))fail('Invalid correction evidence base');
 if(!Array.isArray(value.delta)||value.delta.some(s=>s.verification!=='captured'))fail('Invalid captured evidence delta');
 const admitted=admitSupplementalSources(value.delta.map(({verification,...source})=>source));
 if(!isDeepStrictEqual(admitted,value.delta))fail('Correction delta changed');
 if(textDelta){if(!Array.isArray(value.capturedTextDelta)||!value.capturedTextDelta.length)fail('Captured text delta required');value.capturedTextDelta.forEach(validateCapturedTextShape);}
 if(registered){
  if(!Array.isArray(value.registeredSourceDelta)||!Array.isArray(value.visualDelta)||!(value.registeredSourceDelta.length||value.visualDelta.length||(textDelta&&value.capturedTextDelta?.length)))fail('Registered evidence delta required');
  if(value.registeredSourceDelta.some(s=>!s||s.verification!=='captured'||s.scopeRelation!=='direct'||s.identityStatus!=='identity_checked'||!s.caseIdentity||typeof s.text!=='string'))fail('Registered case delta must retain captured identity evidence');
  validateVisualCatalogue(evidenceVisualRecords(value),evidenceRecords(value));
 }
 const records=evidenceRecords(value),ids=new Set(records.map(s=>s.id));
 if(ids.size!==records.length||records.length>200||records.some(s=>typeof s.text!=='string'||s.text.length>20000)||records.reduce((n,s)=>n+s.text.length,0)>1000000||Buffer.byteLength(JSON.stringify(value))>2*1024*1024)fail('Correction evidence duplicate ID or combined size limit');
 const {manifestHash,...body}=value;if(evidenceHash(body)!==manifestHash)fail('Correction evidence manifest changed');
 return structuredClone(value);
}
export function requireEvidenceProjection(input,sourceRecords,visualCatalogue){
 if(input?.protocolVersion!==LATEST_CORRECTION_PROTOCOL)return;
 validateCorrectionEvidence(input.evidence,input.revisionOf);
 if(!isDeepStrictEqual(sourceRecords,evidenceRecords(input.evidence))||!isDeepStrictEqual(visualCatalogue,evidenceVisualRecords(input.evidence)))fail('Correction evidence projection changed');
}
export function validateHandlingContext(context,input){
 if(!exact(context,['version','evidenceManifestHash','producerJobId','producerAttemptId','producerInputPacket','producerInputPacketHash','producerReceiptHash','taskCard','taskCardHash','upstreamArtifacts','upstreamSnapshotHash','materialManifestHash','artifactId','contentHash','contextHash'])||context.version!=='correction-context-v1')fail('Complete correction handling context required');
 const {contextHash,...body}=context;
 if(evidenceHash(body)!==contextHash||context.evidenceManifestHash!==input.correctionInput.evidence?.manifestHash||context.artifactId!==input.artifactId||context.contentHash!==input.contentHash||evidenceHash(context.taskCard)!==context.taskCardHash||evidenceHash(context.upstreamArtifacts)!==context.upstreamSnapshotHash||evidenceHash(input.correctionInput.materials)!==context.materialManifestHash||createHash('sha256').update(context.producerInputPacket).digest('hex')!==context.producerInputPacketHash)fail('Correction handling context commitment changed');
 return structuredClone(context);
}
