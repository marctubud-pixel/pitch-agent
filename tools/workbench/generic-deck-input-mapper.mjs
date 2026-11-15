import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {createProposalPrelayoutNative} from './proposal-prelayout-native.mjs';
import {prelayoutHash} from './proposal-prelayout-contract.mjs';
import {mapNativeSources} from '../../apps/workbench-preview/src/proposal/generic-deck/mapper.mjs';
import {inspectProposalDeckInput,verifyImageByteIdentity} from '../../apps/workbench-preview/src/proposal/generic-deck/input.ts';

const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const configurationKeys=['consumerBinding','dbPath','executionRoot','imageRoot','pin','store'];

/** Every public capture/consume reopens this exact request including native originals. */
export function createQualifiedInputMapper(configuration){
 need(configuration&&equal(Object.keys(configuration).sort(),configurationKeys),'DECK_ADMISSION_CONFIGURATION_INVALID');
 const prelayout=createProposalPrelayoutNative(configuration),mapped=new WeakMap();
 let closed=false;

 async function read(request){
  need(!closed,'MAPPER_CLOSED');
  const state=await prelayout.readForMapping(request);
  if(state.kind==='rejected')return {...state.diagnostic,mapping:await mapNativeSources(state.diagnostic)};
  const base=state.mapped,bytes=new Map();
  for(const image of base.input.images){
   const loaded=state.images.find(item=>item.identity.imageId===image.imageId);
   need(loaded,'MAPPER_SOURCE_CHANGED');
   await verifyImageByteIdentity(image,loaded.bytes);
   bytes.set(image.imageId,Uint8Array.from(loaded.bytes));
  }
  const current=state.check;
  let result={...base,prelayout:{status:state.status}};
  if(current){
   need(current.baseInputSha256===base.inputSha256&&current.baseProjectionSha256===prelayoutHash(base.projection)&&current.observedSnapshot.revision===state.identity.expectedRevision&&current.observedSnapshot.snapshotHash===state.identity.snapshotHash,'MAPPER_PRELAYOUT_SOURCE_CHANGED');
   const input=structuredClone(base.input);
   input.prelayoutCheck=current.prelayoutCheck;
   const checked=await inspectProposalDeckInput(input,input.researchMethod);
   need(checked.kind==='descriptors_checked','MAPPER_PRELAYOUT_SOURCE_CHANGED');
   result={...base,input:checked.input,inputSha256:checked.inputSha256,mappingSha256:prelayoutHash({inputSha256:checked.inputSha256,sourceIdentity:base.sourceIdentity,projection:base.projection}),blockers:checked.gaps,prelayout:{status:'clear',sourceTuple:current.sourceTuple,original:current.original}};
  }
  await state.verifyCurrent();
  need(!closed,'MAPPER_CLOSED');
  return {kind:'read',result,bytes,nativeSha256:state.nativeSha256};
 }

 function qualified(state){
  return {...state.result,bytes:state.bytes,qualification:{physicalOriginalsVerified:true,layoutAdmission:state.result.input.prelayoutCheck?'prelayout_original_checked':'prelayout_not_checked',semanticApproval:false,humanApproval:false,customerApproval:false,scope:'This returned value is a current read result, not a reusable capability.'}};
 }

 async function capture(request,forRender){
   const snapshot=structuredClone(request),state=await read(snapshot);
   if(state.kind==='rejected')return state;
   const token=Object.freeze({protocol:'qualified-deck-input-v1',id:randomUUID()});
   mapped.set(token,{request:snapshot,nativeSha256:state.nativeSha256,inputSha256:state.result.inputSha256,mappingSha256:state.result.mappingSha256});
   if(forRender)return {kind:'mapped',token,current:qualified(state)};
   return {kind:'mapped',token,diagnostic:structuredClone(state.result)};
 }

 return {
  capture(request){return capture(request,false);},
  captureForRender(request){return capture(request,true);},
  async consume(token){
   need(!closed,'MAPPER_CLOSED');
   const saved=mapped.get(token);
   need(saved,'MAPPER_QUALIFIED_TOKEN_REQUIRED');
   const state=await read(saved.request);
   need(state.kind==='read'&&saved.nativeSha256===state.nativeSha256&&state.result.inputSha256===saved.inputSha256&&state.result.mappingSha256===saved.mappingSha256,'MAPPER_SOURCE_CHANGED');
   return qualified(state);
  },
  close(){closed=true;prelayout.close();}
 };
}
