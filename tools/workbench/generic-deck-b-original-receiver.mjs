import {createHash,randomUUID} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import {assertStoreReadAdmission} from './store.mjs';
import {DomainError,copyDeliveryEnvelope} from './project.mjs';
import {readArtifactLineageContents,readArtifactContent} from './artifact-content.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {verifyOrdinaryProject,verifyOrdinaryReferenceProject} from './ordinary-model-project.mjs';
import {verifyStageOriginal} from './stage-original.mjs';
import {requireFinalVisual,requireFinalCurrent,requireFinalRevisionOwner,finalPayload,finalTargets,FINAL_VISUAL_PURPOSES} from './final-visual.mjs';
import {verifyFinalVisualOriginal} from './final-visual-original.mjs';
import {verifySketchOriginal} from './sketch-original.mjs';
import {verifyReviewedSketchOriginal} from './sketch-review-original.mjs';
import {requireCurrentSketchGeneration} from './sketch-authority.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {briefVisualRequirements} from './brief-visual-requirements.mjs';
import {visualMethod} from './visual-a-service.mjs';
import {requireVisualBNoPending,visualBSnapshot} from './visual-b-http.mjs';
import {semanticConfiguration} from './semantic-authority.mjs';
import {researchMethodIdentity} from './research-method.mjs';
import {requireLoadedImplementation,selectDeckDatabase,assertDeckDatabase} from './generic-deck-source-identity.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const need=(ok,code)=>{if(!ok)throw new DomainError(code,code);};
const keys=['projectId','expectedRevision','taskCardId','policyVersion','snapshotHash','visualArtifactId','visualContentHash'].sort();
const limits=Object.freeze({readAttempts:2,snapshotBytes:64*1024*1024,decodedBytes:128*1024*1024,storedBytes:128*1024*1024});
const proofs=new WeakMap();
function requestIdentity(value){need(value&&equal(Object.keys(value).sort(),keys),'B_ORIGINAL_REQUEST_INVALID');need(['projectId','taskCardId','visualArtifactId'].every(k=>typeof value[k]==='string'&&value[k].trim())&&['snapshotHash','visualContentHash'].every(k=>typeof value[k]==='string'&&/^[a-f0-9]{64}$/.test(value[k]))&&Number.isSafeInteger(value.expectedRevision)&&value.expectedRevision>=0&&Number.isSafeInteger(value.policyVersion)&&value.policyVersion>=1,'B_ORIGINAL_REQUEST_INVALID');return structuredClone(value);}
const semantic=p=>{const c=semanticConfiguration(p);return {epoch:c.epoch,configurationHash:c.configurationHash};};
const fact=r=>structuredClone({...r,kind:'originals_read',executionAllowed:false,semanticApproval:false,humanApproval:false,scope:'Current native B physical originals only; not layout or final delivery approval. Diagnostic JSON is not a capability.'});
export async function requireCurrentBOriginals(token,request){const p=proofs.get(token);need(p&&!p.state.closed,'B_ORIGINAL_TOKEN_REQUIRED');const expected=requestIdentity(request);need(equal(expected,p.request),'B_ORIGINAL_IDENTITY_CHANGED');const current=await p.inspect(expected);p.checkDatabase();need(equal(p.record,current),'B_ORIGINAL_SOURCE_CHANGED');return fact(current);}

/** Only a real native store and real native image store can establish this proof. No caller verifier. */
export function createBPhysicalOriginalReceiver(configuration){
 need(configuration&&equal(Object.keys(configuration).sort(),['dbPath','executionRoot','imageRoot','pin','store']),'B_ORIGINAL_CONFIGURATION_INVALID');
 const {store,executionRoot,imageRoot,dbPath,pin}=configuration;
 const selectedDatabase=selectDeckDatabase(store,dbPath,pin),database=()=>assertDeckDatabase(store,selectedDatabase);
 need(store&&typeof store.read==='function'&&typeof store.withReadAdmission==='function'&&[executionRoot,imageRoot].every(p=>typeof p==='string'&&p.trim()),'B_ORIGINAL_CONFIGURATION_INVALID');
 const imageStore=createImageEvidenceStore({rootDir:imageRoot}),owned=new WeakMap(),state={closed:false};
 async function inspect(request){
  need(!state.closed,'B_ORIGINAL_RECEIVER_CLOSED');database();const implementation=await requireLoadedImplementation();
  const root=await realpath(executionRoot);let record;
  database();const admitted=await store.withReadAdmission(request.projectId,limits,async()=>{
   database();assertStoreReadAdmission(store,request.projectId);
   const p=store.read(request.projectId);
   need(p.id===request.projectId&&p.revision===request.expectedRevision&&p.activeTaskCardId===request.taskCardId&&p.policies.at(-1)?.version===request.policyVersion&&hash(p)===request.snapshotHash,'B_ORIGINAL_CURRENT_CHANGED');
   need(p.activeByStage.visual===request.visualArtifactId,'B_ORIGINAL_CURRENT_CHANGED');
   const artifact=p.artifacts.find(a=>a.id===request.visualArtifactId);
   need(artifact?.contentHash===request.visualContentHash,'B_ORIGINAL_CURRENT_CHANGED');
   requireVisualBNoPending(p);
   const run=requireFinalVisual(p,artifact,copyDeliveryEnvelope,{phase:'release'});
   need(p.releases.some(r=>r.artifactId===artifact.id&&r.policyVersion===request.policyVersion),'B_ORIGINAL_RELEASE_REQUIRED');
   need(p.taskCards.filter(t=>t.id===request.taskCardId).length===1&&p.artifacts.filter(a=>a.id===artifact.id).length===1,'B_ORIGINAL_MEMBERSHIP_REQUIRED');
   const card=p.taskCards.find(t=>t.id===request.taskCardId),requirements=briefVisualRequirements(card);
   need(requirements.length>0,'B_ORIGINAL_TYPED_VIEWS_REQUIRED');
   const method=await visualMethod(p),researchMethod=researchMethodIdentity(),semanticIdentity=semantic(p),canonicalImageRoot=await realpath(imageRoot);
   need(canonicalImageRoot===imageRoot,'B_ORIGINAL_IMAGE_ROOT_CHANGED');
   const contents=await readArtifactLineageContents(p,run.source.copyArtifactId,root),upstream=[];
   for(const body of contents){const a=p.artifacts.find(a=>a.id===body.artifactId);need(['research','strategy','copy'].includes(a?.stage),'B_ORIGINAL_UPSTREAM_UNSUPPORTED');upstream.push(await verifyStageOriginal(p,a,{executionRoot:root}));}
   await verifyOrdinaryProject(p,{executionRoot:root});
   const runs=[],seen=new Set();
   function visit(r){need(r&&!seen.has(r.id)&&seen.size<32,'B_ORIGINAL_LINEAGE_INVALID');seen.add(r.id);if(r.parentRunId)visit(requireFinalRevisionOwner(p,r).parent);runs.push(r);}
   visit(run);
   const originals=[],sketches=[],imageFacts=new Map(),verifiedSketches=new Set();let totalBytes=0;
   async function image(original){
    need(original&&typeof original.imageId==='string','B_ORIGINAL_IMAGE_REQUIRED');
    const loaded=await imageStore.readWithInspection({projectId:p.id,imageId:original.imageId,expectedHash:original.sha256});
    need(loaded.asset.id===original.imageId&&loaded.asset.projectId===p.id&&loaded.asset.sha256===original.sha256&&hash(loaded.bytes)===original.sha256&&loaded.bytes.byteLength===original.byteLength&&loaded.asset.byteLength===original.byteLength&&loaded.asset.mediaType===original.mediaType&&loaded.inspection.width===loaded.asset.width&&loaded.inspection.height===loaded.asset.height,'B_ORIGINAL_IMAGE_CHANGED');
    if(original.width!==undefined)need(original.width===loaded.asset.width&&original.height===loaded.asset.height,'B_ORIGINAL_IMAGE_CHANGED');
    const registered=p.imageAssets.filter(a=>a.id===original.imageId);need(registered.length===1&&equal(registered[0],loaded.asset),'B_ORIGINAL_IMAGE_CHANGED');
    const found={imageId:original.imageId,sha256:original.sha256,bytes:loaded.bytes.byteLength,mediaType:loaded.asset.mediaType,width:loaded.asset.width,height:loaded.asset.height,locator:loaded.descriptor.path};
    const previous=imageFacts.get(original.imageId);need(!previous||equal(previous,found),'B_ORIGINAL_IMAGE_CHANGED');
    if(!previous){totalBytes+=found.bytes;need(imageFacts.size<512&&totalBytes<=256*1024*1024,'B_ORIGINAL_MEDIA_LIMIT');imageFacts.set(original.imageId,found);}
    return found;
   }
   for(const r of runs){
    requireFinalCurrent(p,r,copyDeliveryEnvelope);
    const sketch=p.artifacts.find(a=>a.id===r.source.sketchArtifact.id),generation=p.sketchGenerations?.find(g=>g.id===sketch?.sketchGeneration?.generationId);
    need(sketch&&generation,'B_ORIGINAL_SKETCH_REQUIRED');
    if(!verifiedSketches.has(sketch.id)){
    requireCurrentSketchGeneration(p,generation,copyDeliveryEnvelope,{complete:true});
    const dossier=p.referenceDossiers?.find(d=>d.id===generation.source.dossierId);need(dossier,'B_ORIGINAL_REFERENCE_REQUIRED');
    await verifyOrdinaryReferenceProject(p,dossier,{executionRoot:root,imageStore});
    for(const job of p.jobs.filter(j=>j.generationId===generation.id&&j.status==='succeeded'))sketches.push(await verifySketchOriginal(p,generation,job,{executionRoot:root,imageStore}));
    sketches.push(await verifyReviewedSketchOriginal(p,sketch,{executionRoot:root,imageStore}));
    const sketchBody=await readArtifactContent(p,sketch.id,root);need(equal(sketchBody.content,sketch.sketchGeneration),'B_ORIGINAL_SKETCH_CHANGED');verifiedSketches.add(sketch.id);
    }
    const jobs=p.jobs.filter(j=>j.finalVisualRunId===r.id&&FINAL_VISUAL_PURPOSES.includes(j.purpose));
    need(jobs.length>0&&!jobs.some(j=>['running','unknown','awaiting_reconciliation'].includes(j.status)),'B_ORIGINAL_OUTCOME_UNKNOWN');
    for(const job of jobs.filter(j=>j.status==='succeeded')){
     need(job.attempts?.at(-1)?.status==='succeeded'&&job.attempts.at(-1).receipt,'B_ORIGINAL_ATTEMPT_REQUIRED');
     // New B jobs must retain their actual method-bearing HTTP admission ledger.
     const ledgers=(p.visualBHttpRequests??[]).filter(row=>row.request.jobIds.includes(job.id));
     need(ledgers.length===1,'B_ORIGINAL_METHOD_LEDGER_REQUIRED');const ledger=ledgers[0];
     need(equal(ledger.method,method)&&equal(ledger.snapshot,visualBSnapshot(p))&&ledger.target.targetId===r.id&&ledger.target.sourceHash===r.source.sourceHash,'B_ORIGINAL_METHOD_CHANGED');
     const frozen=ledger.jobs.filter(j=>j.id===job.id);need(frozen.length===1&&equal(frozen[0],{id:job.id,purpose:job.purpose,node:job.node,binding:job.binding,target:job.target??null}),'B_ORIGINAL_LEDGER_CHANGED');
     const command=JSON.parse(p.processedCommands[ledger.request.commandId]??'null');
     need(command?.kind==='visual-b-http-step'&&equal(command.request,ledger.request)&&equal(command.method,method)&&p.audit.some(a=>a.commandId===ledger.request.commandId&&a.kind===command.kind),'B_ORIGINAL_METHOD_COMMAND_REQUIRED');
     originals.push(await verifyFinalVisualOriginal(p,r,job,{executionRoot:root,imageStore}));
     const ids=new Set([...(job.target?.operation.images??[]).map(i=>i.imageId),...(job.outputVersionIds??[]).filter(id=>p.imageAssets.some(a=>a.id===id)),...(job.attempts.at(-1)?.receipt?.images??[]).map(i=>i.imageId)]);
     for(const id of ids){const a=p.imageAssets.find(a=>a.id===id);need(a,'B_ORIGINAL_IMAGE_REQUIRED');await image({imageId:id,...a});}
    }
    for(const i of [...r.source.images,...r.reviewImages??[]])await image(i);
   }
   const payload=finalPayload(p,run),targets=finalTargets(p,run);
   need(requirements.every(r=>payload.directions.every(d=>d.targets.some(t=>t.kind===r.kind&&r.views.every(v=>t.requiredViews.includes(v))))),'B_ORIGINAL_TYPED_VIEWS_CHANGED');
   for(const target of targets)await image(target);
   const bytes=await readManagedLayoutBytes(root,artifact.payloadRef),text=bytes.toString('utf8');
   need(hash(bytes)===artifact.contentHash&&equal(JSON.parse(text),payload),'B_ORIGINAL_PAYLOAD_CHANGED');
   const final={identity:{...request,openedFileIdentity:selectedDatabase,executionRoot:root,imageRoot:canonicalImageRoot,semantic:semanticIdentity,researchMethod,visualMethod:method,implementation},source:{artifactId:artifact.id,sha256:artifact.contentHash,bytes:bytes.byteLength,originalText:text},typedViews:requirements,directionIds:payload.directions.map(d=>d.directionId),targets,images:[...imageFacts.values()],evidence:{upstream,sketches,originals,runIds:runs.map(r=>r.id)}};
   const afterContents=await readArtifactLineageContents(p,run.source.copyArtifactId,root);
   need(equal(contents,afterContents)&&equal(await visualMethod(p),method)&&equal(researchMethodIdentity(),researchMethod)&&equal(semantic(p),semanticIdentity)&&await realpath(executionRoot)===root&&await realpath(imageRoot)===canonicalImageRoot,'B_ORIGINAL_CURRENT_CHANGED');
   const afterBytes=await readManagedLayoutBytes(root,artifact.payloadRef);need(bytes.equals(afterBytes),'B_ORIGINAL_PAYLOAD_CHANGED');
   // Read managed images again after every original response/source has been checked.
   for(const i of [...imageFacts.values()])await image({imageId:i.imageId,sha256:i.sha256,byteLength:i.bytes,mediaType:i.mediaType,width:i.width,height:i.height});
   await requireLoadedImplementation();const after=store.read(p.id);
   need(hash(after)===request.snapshotHash&&equal(semantic(after),semanticIdentity),'B_ORIGINAL_CURRENT_CHANGED');
   requireFinalVisual(after,after.artifacts.find(a=>a.id===artifact.id),copyDeliveryEnvelope,{phase:'release'});
   database();record=final;return record;
  });
  database();need(!state.closed,'B_ORIGINAL_RECEIVER_CLOSED');
  need(admitted.kind==='complete',admitted.code??'B_ORIGINAL_READ_FAILED');need(record&&admitted.value===record,'B_ORIGINAL_NATIVE_CALLBACK_REQUIRED');
  return record;
 }
 return {
  async capture(value){const request=requestIdentity(value),record=await inspect(request),token=Object.freeze({protocol:'b-physical-originals-v1',id:randomUUID()});need(!state.closed,'B_ORIGINAL_RECEIVER_CLOSED');database();owned.set(token,record);proofs.set(token,{request,record,inspect,state,checkDatabase:database});return token;},
  read(token){database();need(!state.closed,'B_ORIGINAL_RECEIVER_CLOSED');const r=owned.get(token);need(r,'B_ORIGINAL_TOKEN_REQUIRED');return fact(r);},
  async assertCurrent(token){database();need(owned.has(token),'B_ORIGINAL_TOKEN_REQUIRED');return requireCurrentBOriginals(token,proofs.get(token).request);},
  close(){state.closed=true;},
  capability:Object.freeze({executionAllowed:false,acceptsCallerVerifier:false,physicalReaderImplemented:true,semanticApproval:false})
 };
}
