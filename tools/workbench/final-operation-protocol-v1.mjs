import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {join,dirname} from 'node:path';
import {validatePhaseResult,phaseObligations} from './final-review-phase.mjs';
import {finalCallHash} from './final-review-call.mjs';
import {finalCodexResultSchema} from './final-review-codex-schema.mjs';
import {buildFinalCodexInvocation,FINAL_CODEX_PHASE_PROTOCOL,codexDescriptor} from './final-review-codex-original.mjs';
export const operationHash=x=>createHash('sha256').update(JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)).digest('hex');
const crc=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
const chunk=(type,b)=>{const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(b.length);c.writeUInt32BE(crc(Buffer.concat([t,b])));return Buffer.concat([n,t,b,c]);};
export function controlImage(index){const width=96,height=64,header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;const raw=Buffer.alloc((width*3+1)*height,255);for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const inside=index%2?((x-48)**2+(y-32)**2<400):(x>27&&x<68&&y>11&&y<52);if(inside){const at=y*(width*3+1)+1+x*3;raw[at]=index%2?0:255;raw[at+1]=0;raw[at+2]=index%2?255:0;}}}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const families=[['owner:layoutProducer','owner_before'],['owner:finalConsumer','owner_before'],['control:primary','primary'],['control:blind','blind'],['control:primary:synthesis','primary_synthesis'],['control:blind:synthesis','blind_synthesis'],['control:challenge','paired_challenge'],['director','director'],['owner:finalProducer','owner_after'],['owner:deliveryConsumer','owner_after']];
export function operationControls(configuration,adapterSourceIdentity,calls=[]){
 const rows=[];
 for(const profile of configuration.assignmentPolicy.profiles){
  const reached=calls.filter(c=>c.profile?.identity===profile.identity),shapes=reached.length?[...new Map(reached.map(c=>[`${c.id.startsWith('owner:')?c.id:c.phase}:${c.personalPixelInspection?2:0}`,c])).values()]:families.map(([id,phase])=>({id,phase,personalPixelInspection:false}));
  for(const call of shapes){const counts=call.personalPixelInspection?[2,3,4]:[0];for(const count of counts){if(count>(profile.transport?.maxImages??0))continue;const body={profile,call:{id:call.id,phase:call.phase,role:call.role??'content',originalReportInputs:call.originalReportInputs??[]},count,version:'harmless-control-v1',adapterSourceIdentity};const operationEnvelopeIdentity=operationHash(body),identity=operationHash({operationEnvelopeIdentity,providerId:profile.providerIdentity,model:profile.modelIdentity});rows.push({requirement:{identity,providerId:profile.providerIdentity,model:profile.modelIdentity,adapterProtocol:FINAL_CODEX_PHASE_PROTOCOL,adapterSourceIdentity,operationEnvelopeIdentity},...body});}}
  for(const count of [0,2,3,4])if(count<=(profile.transport?.maxImages??0)){const body={profile,call:{id:'control:primary',phase:'primary',role:'content',originalReportInputs:[]},count,version:'harmless-control-context-v1',adapterSourceIdentity};const operationEnvelopeIdentity=operationHash(body);rows.push({requirement:{identity:operationHash({operationEnvelopeIdentity,providerId:profile.providerIdentity,model:profile.modelIdentity}),providerId:profile.providerIdentity,model:profile.modelIdentity,adapterProtocol:FINAL_CODEX_PHASE_PROTOCOL,adapterSourceIdentity,operationEnvelopeIdentity},...body});}
 }
 return [...new Map(rows.map(r=>[r.requirement.identity,r])).values()];
}
export function controlPacket(control,{attemptId,originalRoot}){
 const attachments=Array.from({length:control.count},(_,i)=>{const bytes=controlImage(i===3?0:i);return {occurrenceId:`control-occurrence-${i+1}`,...codexDescriptor(bytes),mediaType:'image/png',dimensions:{width:96,height:64},originalPath:join(originalRoot,`image-${i+1}.png`)};});
 const originalSlots=control.call.originalReportInputs.length?control.call.originalReportInputs:(!['primary','blind'].includes(control.call.phase)&&control.call.id!=='owner:layoutProducer'?[{producerCallId:control.call.id==='owner:deliveryConsumer'?'owner:finalProducer':'control-prior',maxBytes:16384}]:[]);
 const slots=originalSlots.map((s,i)=>({...s,maxBytes:s.maxBytes??16384}));
 const predecessorOriginals=slots.map((slot,i)=>{const reportBytes=JSON.stringify({protocol:'controlled-predecessor-v1',resultId:`control-${i}`,value:`record-${i}-retained`,binding:{callId:slot.producerCallId},result:{kind:'observation',findings:[]}});return {slot,resultId:`control-${i}`,reportBytes,reportSha256:codexDescriptor(reportBytes).sha256,originalReceiptSha256:operationHash({i})};});
 const binding={attemptId,callId:control.call.id,reportSlot:{slotIdentity:'control-slot'},assignment:{providerIdentity:control.profile.providerIdentity,modelIdentity:control.profile.modelIdentity}};
 const call={...control.call,packetId:'control-packet',originalReportInputs:slots,profile:control.profile,personalPixelInspection:attachments.length>0};
 const packet={protocol:'final-call-packet-v2',operation:'final-review-v1',basis:{controlled:true},returnTargets:[{id:'control-target'}],qualification:{purpose:'final_operation_observation',envelope:'final-operation-observation-v1',instructions:'Harmless transport control only. Use the successful result kind for the call, with no findings, objections, conflicts or dispositions. Use controlled approval id control-approval, empty editionProofs, frozen basis hash in packet controlContract, original resultIds from predecessor rows, and every obligation listed in controlContract. Every check status is checked with targetId control-target. Place in statement, first checks or coverage evidence observation, or first paired comparison observation as appropriate, a JSON object with visible containing the ordered lowercase color and shape of every attached image, and predecessors containing the ordered value of every controlled predecessor. Use an empty array where none. Do not invent project completion.'},binding,call,predecessorOriginals,attachments};
 packet.controlContract={basisHash:finalCallHash(packet.basis),approvalId:'control-approval',obligations:controlObligations(call),successKind:controlKind(call),factLocation:factLocation(call)};
 const packetText=JSON.stringify(packet),built=buildFinalCodexInvocation({packetText});
 return {packetText,built,images:attachments.map((_,i)=>controlImage(i===3?0:i))};
}
const controlKind=call=>({'owner:layoutProducer':'layout_handoff','owner:finalConsumer':'intake_accept','owner:finalProducer':'final_handoff','owner:deliveryConsumer':'delivery_accept',director:'director_disposition'}[call.id]??(['primary','blind'].includes(call.phase)?'observation':['primary_synthesis','blind_synthesis'].includes(call.phase)?'lane_synthesis':'paired_challenge'));
const factLocation=call=>['layout_handoff','final_handoff'].includes(controlKind(call))?'statement':controlKind(call)==='paired_challenge'?'comparisons[0].observation':['intake_accept','delivery_accept'].includes(controlKind(call))?'checks[0].evidence[0].observation':'coverage[0].evidence[0].observation';
const controlPlan=call=>({calls:[{payload:{editions:[]}}],packetsByRole:{[call.role]:[{id:call.packetId,kind:'complete_source'}]}});
const controlObligations=call=>controlKind(call)==='intake_accept'?['producer_original','source','manuscript','editions','restrictions','routing']:controlKind(call)==='delivery_accept'?['producer_original','delivery_bytes','inventory','native','editable','import','render']:phaseObligations(call,controlPlan(call));
function matches(v,s){if(s.anyOf)return s.anyOf.some(x=>matches(v,x));if('const'in s&&operationHash(v)!==operationHash(s.const))return false;if(s.enum&&!s.enum.includes(v))return false;if(s.type==='string')return typeof v==='string'&&v.length>=(s.minLength??0);if(s.type==='array')return Array.isArray(v)&&v.length>=(s.minItems??0)&&v.every(x=>matches(x,s.items));if(s.type==='object')return v&&typeof v==='object'&&!Array.isArray(v)&&s.required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>s.properties[k]&&matches(v[k],s.properties[k]));return true;}
export function verifyControlAnswer(control,response,packetText){
 const packet=JSON.parse(packetText),r=response.result;const need=v=>{if(!v)throw Object.assign(Error('CONTROL_SEMANTICS_FAILED'),{code:'CONTROL_SEMANTICS_FAILED'});};
 const originalRoot=packet.attachments?.length?dirname(packet.attachments[0].originalPath):'/control-no-attachments';
 const expectedPacket=controlPacket(control,{attemptId:packet.binding?.attemptId,originalRoot}).packetText;
 need(packetText===expectedPacket);
 need(response.protocol==='final-phase-result-v2'&&operationHash(response.binding)===operationHash(packet.binding)&&response.packetHash===codexDescriptor(packetText).sha256&&r?.kind===controlKind(control.call)&&matches(r,finalCodexResultSchema(packet.call)));
 const predecessors=packet.predecessorOriginals.map(row=>({id:row.resultId,binding:JSON.parse(row.reportBytes).binding,report:JSON.parse(row.reportBytes)}));
 validatePhaseResult(r,{binding:packet.binding,basis:packet.basis,returnTargets:packet.returnTargets},packet.call,controlPlan(packet.call),predecessors,{localGates:[{}],approval:{id:'control-approval',decision:{rulings:[]}}});
 const factText=r.statement??r.checks?.[0]?.evidence?.[0]?.observation??r.coverage?.[0]?.evidence?.[0]?.observation??r.comparisons?.[0]?.observation;
 let fact;try{fact=JSON.parse(factText);}catch{need(false);}
 const expected={visible:Array.from({length:control.count},(_,i)=>(i===3?0:i)%2?'blue circle':'red square'),predecessors:packet.predecessorOriginals.map((_,i)=>`record-${i}-retained`)};
 need(operationHash(fact)===operationHash(expected));
 return {phase:control.call.phase,profileIdentity:control.profile.identity,occurrences:control.count,observedBranch:r.kind,inputBytes:Buffer.byteLength(packetText),visibleFactsVerified:true};
}
