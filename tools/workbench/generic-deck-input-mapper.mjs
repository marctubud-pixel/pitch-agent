import {createProposalPrelayoutNative} from './proposal-prelayout-native.mjs';
import {prelayoutHash} from './proposal-prelayout-contract.mjs';
import {randomUUID} from 'node:crypto';
import {createGenericDeckNativeAdmission} from './generic-deck-native-admission.mjs';
import {mapNativeSources} from '../../apps/workbench-preview/src/proposal/generic-deck/mapper.mjs';
import {inspectProposalDeckInput,verifyImageByteIdentity} from '../../apps/workbench-preview/src/proposal/generic-deck/input.ts';
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
/** Program-only native factory. No injected receiver, verifier or source DTO can mint qualification. */
export function createQualifiedInputMapper(configuration){
 const receiver=createGenericDeckNativeAdmission(configuration),prelayout=createProposalPrelayoutNative(configuration),mapped=new WeakMap();let closed=false;
 async function read(nativeToken){
  need(!closed,'MAPPER_CLOSED');const before=await receiver.assertCurrent(nativeToken),baseResult=await mapNativeSources(before);let result=baseResult;
  need(result.kind==='mapped','MAPPER_FIVE_SOURCES_REQUIRED');const bytes=new Map();
  for(const image of result.input.images){const loaded=await receiver.readImage(nativeToken,image.imageId);await verifyImageByteIdentity(image,loaded.bytes);bytes.set(image.imageId,Uint8Array.from(loaded.bytes));}
  const identity=before.identity,nativeRequest={projectId:identity.projectId,expectedRevision:identity.expectedRevision,taskCardId:identity.taskCardId,policyVersion:identity.policyVersion,copyArtifactId:identity.copyArtifactId,copyContentHash:identity.copyContentHash,sourceHash:identity.sourceHash,visualArtifactId:before.sources.visual.artifactId,visualContentHash:before.sources.visual.sha256};
  const check=await prelayout.captureCheck(nativeRequest);
  if(check.kind==='ready'){
   const current=await prelayout.consumeCheck(check.token);need(current.baseInputSha256===baseResult.inputSha256&&current.baseProjectionSha256===prelayoutHash(baseResult.projection)&&current.observedSnapshot.revision===identity.expectedRevision&&current.observedSnapshot.snapshotHash===identity.snapshotHash,'MAPPER_PRELAYOUT_SOURCE_CHANGED');
   const input=structuredClone(baseResult.input);input.prelayoutCheck=current.prelayoutCheck;const checked=await inspectProposalDeckInput(input,input.researchMethod);need(checked.kind==='descriptors_checked','MAPPER_PRELAYOUT_SOURCE_CHANGED');
   result={...baseResult,input:checked.input,inputSha256:checked.inputSha256,mappingSha256:prelayoutHash({inputSha256:checked.inputSha256,sourceIdentity:baseResult.sourceIdentity,projection:baseResult.projection}),blockers:checked.gaps,prelayout:{status:'clear',sourceTuple:current.sourceTuple,original:current.original}};
  }else result={...baseResult,prelayout:{status:check.status}};
  const after=await receiver.assertCurrent(nativeToken);need(JSON.stringify(before)===JSON.stringify(after)&&!closed,'MAPPER_SOURCE_CHANGED');
  return {result,bytes};
 }
 return {
  async capture(request){need(!closed,'MAPPER_CLOSED');const source=await receiver.capture(request);if(source.kind==='rejected')return {...source,mapping:await mapNativeSources(source)};const nativeToken=source.token,{result}=await read(nativeToken);const token=Object.freeze({protocol:'qualified-deck-input-v1',id:randomUUID()});need(!closed,'MAPPER_CLOSED');mapped.set(token,{nativeToken,inputSha256:result.inputSha256,mappingSha256:result.mappingSha256});return {kind:'mapped',token,diagnostic:structuredClone(result)};},
  async consume(token){need(!closed,'MAPPER_CLOSED');const saved=mapped.get(token);need(saved,'MAPPER_QUALIFIED_TOKEN_REQUIRED');const {result,bytes}=await read(saved.nativeToken);need(result.inputSha256===saved.inputSha256&&result.mappingSha256===saved.mappingSha256,'MAPPER_SOURCE_CHANGED');return {...result,bytes,qualification:{physicalOriginalsVerified:true,layoutAdmission:result.input.prelayoutCheck?'prelayout_original_checked':'prelayout_not_checked',semanticApproval:false,humanApproval:false,customerApproval:false,scope:'This returned value is a current read result, not a reusable capability.'}};},
  close(){closed=true;receiver.close();prelayout.close();}
 };
}
