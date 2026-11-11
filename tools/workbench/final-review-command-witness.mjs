import {FINAL_CODEX_FILES,finalCodexExecutionSpec,decodeCodexJSON} from './final-review-codex-original.mjs';
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
const need=v=>{if(!v)throw Object.assign(Error('Bounded final command original witness required'),{code:'FINAL_COMMAND_WITNESS_INVALID'});};
const names=['input','plan','packet','response','receipt','events'];
export function finalCommandWitness(command,rawFingerprint) {
 if(['mark-final-review-dispatched','settle-final-review-call','reconcile-final-review-call'].includes(command.kind)&&Object.hasOwn(command.originals??{},'providerRequest'))return codexWitness(command,rawFingerprint);
 if(!['mark-final-review-dispatched','settle-final-review-call'].includes(command.kind))return rawFingerprint;
 let packet;try{packet=JSON.parse(command.originals?.packet);}catch{return rawFingerprint;}
 if(packet?.protocol!=='final-call-packet-v2')return rawFingerprint;
 const {setupId,reservationId,callId,attemptId}=command;
 need(typeof attemptId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(attemptId));
 need([setupId,reservationId,callId,command.commandId].every(x=>typeof x==='string'&&x.length>0&&x.length<=256));
 const relationship={projectId:packet.binding.projectId,setupId,reservationId,planId:packet.binding.planId,inputId:packet.binding.inputId,callId,attemptId};
 const managedOriginals=names.filter(name=>Object.hasOwn(command.originals,name)).map(name=>{const raw=command.originals[name];need(typeof raw==='string');return {name,protocol:'final-call-original-file-v2',relativePath:`${attemptId}/${name}.json`,sha256:sha(raw),bytes:Buffer.byteLength(raw)};});
 const body={protocol:'final-command-witness-v2',representation:'original_command_digest',kind:command.kind,commandId:command.commandId,relationship,originalCommand:{algorithm:'sha256',sha256:sha(rawFingerprint),bytes:Buffer.byteLength(rawFingerprint)},managedOriginals};
 const serialized=JSON.stringify(body);need(Buffer.byteLength(serialized)<=16384);return serialized;
}
const exactKeys=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const byteCount=value=>Number.isSafeInteger(value)&&value>=0;
export function isFinalCommandWitness(value){
 if(value?.protocol==='final-command-witness-codex-text-v1')return isCodexWitness(value);
 if(!exactKeys(value,['protocol','representation','kind','commandId','relationship','originalCommand','managedOriginals'])||value.protocol!=='final-command-witness-v2'||value.representation!=='original_command_digest'||!identity(value.commandId))return false;
 const expected=value.kind==='mark-final-review-dispatched'?names.slice(0,3):value.kind==='settle-final-review-call'?names:null;
 if(!expected||!exactKeys(value.relationship,['projectId','setupId','reservationId','planId','inputId','callId','attemptId'])||!Object.values(value.relationship).every(identity)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.relationship.attemptId))return false;
 const original=value.originalCommand;
 if(!exactKeys(original,['algorithm','sha256','bytes'])||original.algorithm!=='sha256'||!digest(original.sha256)||!byteCount(original.bytes)||!Array.isArray(value.managedOriginals)||value.managedOriginals.length!==expected.length)return false;
 const seen=new Set();
 for(const descriptor of value.managedOriginals){
  if(!exactKeys(descriptor,['name','protocol','relativePath','sha256','bytes'])||!expected.includes(descriptor.name)||seen.has(descriptor.name)||descriptor.protocol!=='final-call-original-file-v2'||descriptor.relativePath!==`${value.relationship.attemptId}/${descriptor.name}.json`||!digest(descriptor.sha256)||!byteCount(descriptor.bytes))return false;
  seen.add(descriptor.name);
 }
 return Buffer.byteLength(JSON.stringify(value))<=16384;
}

function codexWitness(command,rawFingerprint){
 const packet=decodeCodexJSON(command.originals.packet,32*1024**2),{setupId,reservationId,callId,attemptId}=command;
 need(packet.protocol==='final-call-packet-v2'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(attemptId));
 const relationship={projectId:packet.binding.projectId,setupId,reservationId,planId:packet.binding.planId,inputId:packet.binding.inputId,callId,attemptId};
 need(Object.values(relationship).every(identity)&&identity(command.commandId));
 const stage=command.kind==='mark-final-review-dispatched'?'mark':command.kind==='settle-final-review-call'?'settle':'reconcile';
 const managedOriginals=Object.entries(finalCodexExecutionSpec(stage)).map(([name,spec])=>{const raw=command.originals[name];need((Buffer.isBuffer(raw)||typeof raw==='string')&&Buffer.byteLength(raw)<=spec.limit);return {name,root:'execution',relativePath:`${attemptId}/${spec.suffix}`,sha256:sha(raw),bytes:Buffer.byteLength(raw)};});
 if(stage!=='mark'){
  const sidecar=decodeCodexJSON(command.originals.providerOriginals,1024**2);
  for(const [name,spec] of Object.entries(FINAL_CODEX_FILES)){const ref=sidecar.files[name],raw=command.originals.codex[name];if(name==='output'&&ref===null){need(raw===null||raw===undefined);continue;}need((Buffer.isBuffer(raw)||typeof raw==='string')&&Buffer.byteLength(raw)<=spec.limit);managedOriginals.push({name:`provider_${name}`,root:'provider',relativePath:ref.relativePath,sha256:sha(raw),bytes:Buffer.byteLength(raw)});}
 }
 const body={protocol:'final-command-witness-codex-text-v1',representation:'original_command_digest',kind:command.kind,commandId:command.commandId,relationship,originalCommand:{algorithm:'sha256',sha256:sha(rawFingerprint),bytes:Buffer.byteLength(rawFingerprint)},managedOriginals};need(isCodexWitness(body));return JSON.stringify(body);
}
function isCodexWitness(value){
 if(!exactKeys(value,['protocol','representation','kind','commandId','relationship','originalCommand','managedOriginals'])||value.protocol!=='final-command-witness-codex-text-v1'||value.representation!=='original_command_digest'||!identity(value.commandId))return false;
 const stage=value.kind==='mark-final-review-dispatched'?'mark':value.kind==='settle-final-review-call'?'settle':value.kind==='reconcile-final-review-call'?'reconcile':null;
 if(!stage||!exactKeys(value.relationship,['projectId','setupId','reservationId','planId','inputId','callId','attemptId'])||!Object.values(value.relationship).every(identity)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.relationship.attemptId))return false;
 const original=value.originalCommand;if(!exactKeys(original,['algorithm','sha256','bytes'])||original.algorithm!=='sha256'||!digest(original.sha256)||!byteCount(original.bytes)||!Array.isArray(value.managedOriginals))return false;
 const initial=finalCodexExecutionSpec(stage),seen=new Set();let run=null;
 for(const d of value.managedOriginals){
  if(!exactKeys(d,['name','root','relativePath','sha256','bytes'])||seen.has(d.name)||!digest(d.sha256)||!byteCount(d.bytes))return false;seen.add(d.name);
  if(d.root==='execution'){const spec=initial[d.name];if(!spec||d.relativePath!==`${value.relationship.attemptId}/${spec.suffix}`||d.bytes>spec.limit)return false;}
  else if(d.root==='provider'&&stage!=='mark'){const spec=FINAL_CODEX_FILES[d.name.slice(9)];if(!d.name.startsWith('provider_')||!spec||typeof d.relativePath!=='string'||!/^run-[A-Za-z0-9_-]+\//.test(d.relativePath)||d.relativePath.split('/').length!==2||d.relativePath.split('/')[1]!==spec.suffix||d.bytes>spec.limit)return false;const dir=d.relativePath.split('/')[0];if(run!==null&&run!==dir)return false;run=dir;}
  else return false;
 }
 if(!Object.keys(initial).every(k=>seen.has(k)))return false;
 if(stage==='mark'){if(value.managedOriginals.length!==Object.keys(initial).length)return false;}
 else{if(!Object.keys(FINAL_CODEX_FILES).filter(k=>k!=='output').every(k=>seen.has(`provider_${k}`)))return false;if(stage==='settle'&&!seen.has('provider_output'))return false;}
 return Buffer.byteLength(JSON.stringify(value))<=16384;
}
