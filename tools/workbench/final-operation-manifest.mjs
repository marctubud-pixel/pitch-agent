import encodeJPEG from './vendor/jpeg-js/encoder.mjs';
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
export function controlImage(index,width=96,height=64){need(width>0&&height>0&&width*height<=8*1024**2,'FINAL_OPERATION_IMAGE_UNSUPPORTED');const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;const raw=Buffer.alloc((width*3+1)*height,255);for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const inside=index%2?((x-width/2)**2+(y-height/2)**2<(Math.min(width,height)*0.3)**2):(x>width*0.28&&x<width*0.72&&y>height*0.18&&y<height*0.82);if(inside){const at=y*(width*3+1)+1+x*3;raw[at]=index%2?0:255;raw[at+1]=0;raw[at+2]=index%2?255:0;}}}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
export function controlJPEG(index,width=96,height=64){need(width>0&&height>0&&width*height<=8*1024**2,'FINAL_OPERATION_IMAGE_UNSUPPORTED');const data=Buffer.alloc(width*height*4,255);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const inside=index%2?((x-width/2)**2+(y-height/2)**2<(Math.min(width,height)*0.3)**2):(x>width*0.28&&x<width*0.72&&y>height*0.18&&y<height*0.82);if(inside){const at=(y*width+x)*4;data[at]=index%2?0:255;data[at+1]=0;data[at+2]=index%2?255:0;}}return Buffer.from(encodeJPEG({data,width,height},90).data);}
function shapedControlImage(control,i){
 const original=control.shape.attachments[i],t=control.profile.transport;
 need(original&&t&&control.count<=t.maxImages&&original.bytes<=t.maxImageBytes&&original.dimensions.width*original.dimensions.height<=t.maxImagePixels,'FINAL_OPERATION_IMAGE_UNSUPPORTED');
 need(['image/png','image/jpeg'].includes(original.mediaType),'FINAL_OPERATION_IMAGE_UNSUPPORTED');
 const b=original.mediaType==='image/jpeg'?controlJPEG(i===3?0:i,original.dimensions.width,original.dimensions.height):controlImage(i===3?0:i,original.dimensions.width,original.dimensions.height),extra=original.bytes-b.length;
 if(original.mediaType==='image/jpeg'){need(extra>=0&&original.bytes<=32*1024**2,'FINAL_OPERATION_IMAGE_UNSUPPORTED');return Buffer.concat([b.subarray(0,b.length-2),Buffer.alloc(extra,255),b.subarray(b.length-2)]);}
 need(extra===0||extra>=12,'FINAL_OPERATION_IMAGE_UNSUPPORTED');
 if(extra===0)return b;need(original.bytes<=32*1024**2,'FINAL_OPERATION_IMAGE_UNSUPPORTED');return Buffer.concat([b.subarray(0,b.length-12),chunk('npAD',Buffer.alloc(extra-12)),b.subarray(b.length-12)]);
}
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
export const OPERATION_MANIFEST_BYTES=4*1024**2;
export function compileOperationDuties(basis,launch){
 const plan=basis.planning?.plan;need(plan?.protocol==='final-review-plan-v2'&&plan.calls.length>0,'FINAL_OPERATION_ACTUAL_PLAN_REQUIRED');
 const rows=[],bindings=new Map();
 const add=(kind,call,shape,extra={})=>{const body={version:'actual-plan-control-v2',kind,captureIdentity:basis.identity,profile:call.profile,call:{id:call.id,phase:call.phase,role:call.role,originalReportInputs:call.originalReportInputs},count:shape.attachments.length,shape,adapterSourceIdentity:basis.sourceIdentity,...extra};const operationEnvelopeIdentity=operationHash(body);rows.push({requirement:{identity:operationHash({operationEnvelopeIdentity,providerId:call.profile.providerIdentity,model:call.profile.modelIdentity}),providerId:call.profile.providerIdentity,model:call.profile.modelIdentity,adapterProtocol:FINAL_CODEX_PHASE_PROTOCOL,adapterSourceIdentity:basis.sourceIdentity,operationEnvelopeIdentity},...body});};
 for(const call of plan.calls){
  const provider=launch.textProviders[call.profile.providerIdentity];need(provider?.adapter==='codex-cli'&&provider.model===call.profile.modelIdentity,'FINAL_OPERATION_PROVIDER_CHANGED');
  const packet=call.packetId===null?null:plan.packetsByRole[call.role]?.find(p=>p.id===call.packetId);need(call.packetId===null||packet,'FINAL_OPERATION_PACKET_REQUIRED');
  const attachments=call.personalPixelInspection?packet.originals.map(o=>structuredClone(o)):[];
  const shape={callId:call.id,contextIdentity:call.contextIdentity,assignment:call.assignment,profile:call.profile,provider,phase:call.phase,successKind:controlKind(call),packetId:call.packetId,packetIdentity:packet?operationHash(packet):null,originalReportInputs:call.originalReportInputs,attachments,attachmentBudget:call.attachmentBudget,textBudget:call.textBudget,reportSlot:call.reportSlot,callIdentity:operationHash({...call,dependencies:undefined}),hardResponseLimit:Math.min(call.reportSlot.maxBytes,call.textBudget.maxOutputBytes,call.profile.context.maxOutputBytes,call.profile.reportBoundBytes,2*1024**2),requiredWireBytes:Math.min(32*1024**2,call.profile.context.maxInputBytes),outputWitnessPolicy:'bounded_valid_phase_success'};
  add('call',call,shape);
  const binding=operationHash({profile:call.profile,provider});if(!bindings.has(binding))bindings.set(binding,[]);bindings.get(binding).push(rows.at(-1));
 }
 for(const [binding,reached]of bindings){
  const seed=reached[0],imageSeed=reached.find(r=>r.count>0)?.shape.attachments[0],seen=new Set(reached.map(r=>r.count));
  const supplement=(kind,count,ordinal)=>{const call={id:`operation-supplement-${binding}-${kind}-${count}-${ordinal}`,phase:'primary',role:'content',profile:seed.profile,originalReportInputs:[]};const shape={...seed.shape,callId:null,phase:'primary',successKind:'observation',packetId:null,packetIdentity:null,originalReportInputs:[],attachments:Array.from({length:count},(_,i)=>({occurrenceId:`supplement-${i}`,bytes:imageSeed?.bytes??controlImage(i).length,dimensions:imageSeed?.dimensions??{width:96,height:64},mediaType:'image/png'})),textBudget:{knownInputBytes:0,futureReportsReservedBytes:0,maxInputBytes:0,maxOutputBytes:seed.shape.hardResponseLimit},requiredWireBytes:0};add(kind,call,shape,{binding,ordinal});};
  for(let i=reached.length;i<2;i++)supplement('fresh_context',0,i+1);
  if(seed.profile.transport)for(const count of [2,3,4].filter(n=>n<=seed.profile.transport.maxImages))if(!seen.has(count))supplement('image_observation',count,1);
 }
 return rows;
}
export function partitionOperationDuties(rows,{captureIdentity,maxRequirements=128,maxBytes=OPERATION_MANIFEST_BYTES}={}){
 need(Number.isSafeInteger(maxRequirements)&&maxRequirements>0&&maxRequirements<=128&&Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=OPERATION_MANIFEST_BYTES,'FINAL_OPERATION_BATCH_LIMIT');
 const sorted=[...rows].sort((a,b)=>a.requirement.identity.localeCompare(b.requirement.identity));need(sorted.length>0&&new Set(sorted.map(r=>r.requirement.identity)).size===sorted.length,'FINAL_OPERATION_DUPLICATE_DUTY');
 const dutyRoot=operationHash(sorted.map(r=>r.requirement)),groups=[];let group=[];
 const envelope=(requirements,sequence,total)=>({protocol:'final-operation-manifest-v2',captureIdentity,dutyRoot,totalDuties:sorted.length,sequence,total,requirements});
 const fits=g=>Buffer.byteLength(JSON.stringify(envelope(g.map(r=>r.requirement),Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)))<=maxBytes;
 for(const row of sorted){need(fits([row]),'FINAL_OPERATION_REQUIREMENT_TOO_LARGE');if(group.length===maxRequirements||!fits([...group,row])){groups.push(group);group=[];}group.push(row);}if(group.length)groups.push(group);
 return groups.map((rows,i)=>({rows,manifest:envelope(rows.map(r=>r.requirement),i+1,groups.length)}));
}
export function assertObservedCallShape(duty,call,packet,providerRequest,providerSchema,observation){
 const shape=duty.shape;need(duty.kind==='call'&&operationHash({...call,dependencies:undefined})===observation.callIdentity,'FINAL_OPERATION_CALL_CHANGED');
 need(operationHash(packet.predecessorOriginals.map(p=>p.slot))===operationHash(shape.originalReportInputs),'FINAL_OPERATION_ORDERED_SLOTS_CHANGED');
 need(operationHash(packet.attachments)===operationHash(shape.attachments.map(({occurrenceId,sha256,bytes,mediaType,dimensions,originalPath})=>({occurrenceId,sha256,bytes,mediaType,dimensions,originalPath}))),'FINAL_OPERATION_ATTACHMENT_OCCURRENCES_CHANGED');
 need(Buffer.byteLength(providerRequest)+Buffer.byteLength(providerSchema)<=observation.wireBytes,'FINAL_OPERATION_OBSERVED_WIRE_EXCEEDED');
 need(packet.predecessorOriginals.every((p,i)=>Buffer.byteLength(p.reportBytes)<=observation.predecessorBytes[i]),'FINAL_OPERATION_OBSERVED_SLOT_EXCEEDED');
}
export function controlPacket(control,{attemptId,originalRoot}){
 const attachments=Array.from({length:control.count},(_,i)=>{const bytes=shapedControlImage(control,i);return {occurrenceId:`control-occurrence-${i+1}`,...codexDescriptor(bytes),mediaType:control.shape.attachments[i].mediaType,dimensions:{width:control.shape.attachments[i].dimensions.width,height:control.shape.attachments[i].dimensions.height},originalPath:join(originalRoot,`image-${i+1}.${control.shape.attachments[i].mediaType==='image/jpeg'?'jpg':'png'}`)};});
 const slots=control.call.originalReportInputs.map(s=>({...s}));
 const predecessorOriginals=slots.map((slot,i)=>{const report={protocol:'controlled-predecessor-v1',resultId:`control-${i}`,value:`record-${i}-retained`,binding:{callId:slot.producerCallId},result:{kind:'observation',findings:[]},padding:''};const base=Buffer.byteLength(JSON.stringify(report));need(base<=slot.maxBytes,'FINAL_OPERATION_SLOT_UNSUPPORTED');report.padding=' '.repeat(slot.maxBytes-base);const reportBytes=JSON.stringify(report);return {slot,resultId:`control-${i}`,reportBytes,reportSha256:codexDescriptor(reportBytes).sha256,originalReceiptSha256:operationHash({i})};});
 const binding={attemptId,callId:control.call.id,reportSlot:{slotIdentity:'control-slot'},assignment:{providerIdentity:control.profile.providerIdentity,modelIdentity:control.profile.modelIdentity}};
 const call={...control.call,packetId:'control-packet',originalReportInputs:slots,profile:control.profile,personalPixelInspection:attachments.length>0};
 const packet={protocol:'final-call-packet-v2',operation:'final-review-v1',basis:{controlled:true},returnTargets:[{id:'control-target'}],qualification:{purpose:'final_operation_observation',envelope:'final-operation-observation-v1',instructions:'Harmless transport control only. Use the successful result kind for the call, with no findings, objections, conflicts or dispositions. Use controlled approval id control-approval, empty editionProofs, frozen basis hash in packet controlContract, original resultIds from predecessor rows, and every obligation listed in controlContract. Every check status is checked with targetId control-target. Place in statement, first checks or coverage evidence observation, or first paired comparison observation as appropriate, a JSON object with visible containing the ordered lowercase color and shape of every attached image, and predecessors containing the ordered value of every controlled predecessor. Use an empty array where none. Do not invent project completion.'},binding,call,predecessorOriginals,attachments};
 packet.controlContract={basisHash:finalCallHash(packet.basis),approvalId:'control-approval',obligations:controlObligations(call),successKind:controlKind(call),factLocation:factLocation(call)};
 packet.controlPadding='';const bare=buildFinalCodexInvocation({packetText:JSON.stringify(packet)}),base=Buffer.byteLength(bare.inputText)+Buffer.byteLength(bare.schemaText),target=Math.max(base,control.shape.requiredWireBytes);need(target<=control.profile.context.maxInputBytes,'FINAL_OPERATION_WIRE_UNSUPPORTED');packet.controlPadding=' '.repeat(target-base);const packetText=JSON.stringify(packet),built=buildFinalCodexInvocation({packetText});need(Buffer.byteLength(built.inputText)+Buffer.byteLength(built.schemaText)===target,'FINAL_OPERATION_WIRE_UNSUPPORTED');
 const outputWitness=codexDescriptor(JSON.stringify(controlSuccessWitness(control,packetText)));need(outputWitness.bytes<=control.shape.hardResponseLimit,'FINAL_OPERATION_OUTPUT_WITNESS_UNSUPPORTED');return {packetText,built,outputWitness,hardResponseLimit:control.shape.hardResponseLimit,images:attachments.map((_,i)=>shapedControlImage(control,i))};
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
 const built=buildFinalCodexInvocation({packetText});return {phase:control.call.phase,profileIdentity:control.profile.identity,occurrences:control.count,observedBranch:r.kind,inputBytes:Buffer.byteLength(packetText),wireBytes:Buffer.byteLength(built.inputText)+Buffer.byteLength(built.schemaText),responseBytes:Buffer.byteLength(JSON.stringify(response)),hardResponseLimit:control.shape.hardResponseLimit,outputWitness:codexDescriptor(JSON.stringify(controlSuccessWitness(control,packetText))),predecessorBytes:packet.predecessorOriginals.map(p=>Buffer.byteLength(p.reportBytes)),attachmentOccurrences:packet.attachments.map(({originalPath,...a})=>a),callIdentity:control.shape.callIdentity??null,captureIdentity:control.captureIdentity,requirementIdentity:control.requirement.identity,visibleFactsVerified:true};
}

function controlSuccessWitness(control,packetText){const packet=JSON.parse(packetText),ids=packet.predecessorOriginals.map(x=>x.resultId),facts=JSON.stringify({visible:Array.from({length:control.count},(_,n)=>(n===3?0:n)%2?'blue circle':'red square'),predecessors:packet.predecessorOriginals.map((_,n)=>`record-${n}-retained`)}),evidence=[{targetId:'control-target',observation:facts}],covered=packet.controlContract.obligations.map((obligationId,i)=>({obligationId,status:'checked',evidence:i===0?evidence:[{targetId:'control-target',observation:'controlled evidence'}]})),kind=packet.controlContract.successKind;let result;
 if(kind==='layout_handoff')result={kind,basisHash:packet.controlContract.basisHash,statement:facts};
 if(kind==='intake_accept')result={kind,producerResultId:ids[0],basisHash:packet.controlContract.basisHash,checks:covered};
 if(kind==='observation')result={kind,packetId:packet.call.packetId,coverage:covered,findings:[],limitations:[]};
 if(kind==='lane_synthesis')result={kind,lane:packet.call.phase.split('_')[0],originalResultIds:ids,coverage:covered,findingRefs:[],conflicts:[],conclusion:'clear'};
 if(kind==='paired_challenge')result={kind,role:packet.call.role,reviewedResultIds:ids,comparisons:ids.map((resultId,i)=>({resultId,pointer:'/result',observation:i===0?facts:'controlled comparison'})),objections:[],conclusion:'no_objection'};
 if(kind==='director_disposition')result={kind,reviewedResultIds:ids,dispositions:[],coverage:covered,outcome:{kind:'approve',itemRefs:[]}};
 if(kind==='final_handoff')result={kind,approvalId:'control-approval',basisHash:packet.controlContract.basisHash,editionProofs:[],statement:facts};
 if(kind==='delivery_accept')result={kind,producerResultId:packet.predecessorOriginals.find(x=>x.slot.producerCallId==='owner:finalProducer')?.resultId,approvalId:'control-approval',editionProofs:[],checks:covered};
 return {protocol:'final-phase-result-v2',binding:packet.binding,packetHash:codexDescriptor(packetText).sha256,result};}
