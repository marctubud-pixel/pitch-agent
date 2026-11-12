import {requireCurrentSketchGeneration} from './sketch-authority.mjs';
import {readSketchUnresolvedGraph} from './sketch-read-graph.mjs';
import{createHash}from'node:crypto';import{AsyncLocalStorage}from'node:async_hooks';import{realpath}from'node:fs/promises';import{isDeepStrictEqual as equal}from'node:util';
import{isOrdinaryHttp}from'./ordinary-model-claims.mjs';
import{assertStoreReadAdmission}from'./store.mjs';import{createImageEvidenceStore}from'./image-evidence.mjs';import{createReferenceRuntime}from'./reference-runtime.mjs';import{createSketchRuntime}from'./sketch-runtime.mjs';import{copyDeliveryEnvelope}from'./project.mjs';import{visualMethod}from'./visual-a-service.mjs';import{withReadOnlyImageVerification}from'./model-http-authority.mjs';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const need=(v,code,message=code)=>{if(!v)throw Object.assign(Error(message),{code})};
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v};
export const SKETCH_SOURCE_READ_LIMITS=Object.freeze({readAttempts:32,snapshotBytes:256*1024*1024,decodedBytes:8*1024*1024*1024,storedBytes:8*1024*1024*1024});
function methodOrigin(p,g,method){const source=g.source,copy=source.referenceSource.source;
    const origins=(p.visualHttpIntents??[]).filter(r=>r.operation==='sketch-continuations'&&r.request.dossierId===source.dossierId&&r.request.selectionHash===source.selectionHash);
    need(origins.length===1,'SKETCH_READ_METHOD_ORIGIN_REQUIRED');const origin=origins[0];
    need(equal(origin.method,method)&&equal(origin.snapshot.card,source.referenceSource.taskCard)&&equal(origin.snapshot.policy,source.referenceSource.policy)&&origin.snapshot.copyArtifactId===copy.artifactId&&origin.snapshot.copyContentHash===copy.contentHash,'SKETCH_READ_METHOD_ORIGIN_CHANGED');
    const intent=JSON.parse(p.processedCommands[origin.request.commandId]),continuation=JSON.parse(p.processedCommands[origin.nativeRequest.commandId]);
    need(intent.kind==='visual-http-intent'&&equal(intent.request,origin.request)&&equal(intent.method,origin.method)&&equal(intent.nativeRequest,origin.nativeRequest)&&continuation.kind==='request-sketch-continuation'&&equal(continuation.request,origin.nativeRequest),'SKETCH_READ_METHOD_ORIGIN_CHANGED');
    need(p.audit.some(a=>a.commandId===origin.request.commandId&&a.kind==='visual-http-intent'&&a.revision===origin.request.expectedRevision+1)&&p.audit.some(a=>a.commandId===origin.nativeRequest.commandId&&a.kind==='request-sketch-continuation'&&a.revision===origin.nativeRequest.expectedRevision+1),'SKETCH_READ_METHOD_AUDIT_REQUIRED');
    return {commandId:origin.request.commandId,nativeCommandId:origin.nativeRequest.commandId,requestHash:hash(origin.request),methodHash:hash(origin.method)};
}
export function createSketchNativeReader({store,rootDir}){
 const scope=new AsyncLocalStorage(),disk=createImageEvidenceStore({rootDir:rootDir+'/images'});
 async function observedImage(identity,inspection){const result=await disk[inspection?'readWithInspection':'read'](identity);scope.getStore()?.push({imageId:result.asset.id,sha256:hash(result.bytes),mediaType:result.asset.mediaType,byteLength:result.bytes.length,width:result.asset.width,height:result.asset.height,verifier:'image-evidence checkedImageDescriptor'});return result;}
 const imageStore=Object.freeze({read:i=>observedImage(i,false),readWithInspection:i=>observedImage(i,true)});
 const references=createReferenceRuntime({store,root:rootDir,providers:{},bindings:{},imageStore,sourceEnvelope:copyDeliveryEnvelope});
 const sketches=createSketchRuntime({store,root:rootDir,references,providers:{},bindings:{},imageStore});
 async function inspect(id,request){
  need(request&&Object.keys(request).every(k=>['expectedRevision','generationId','runId'].includes(k))&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0&&typeof request.generationId==='string'&&request.generationId&&(request.runId===undefined||typeof request.runId==='string'&&request.runId),'SKETCH_READ_REQUEST_REQUIRED');
  let produced;
  const admission=await store.withReadAdmission(id,SKETCH_SOURCE_READ_LIMITS,()=>scope.run([],()=>withReadOnlyImageVerification(async()=>{
   assertStoreReadAdmission(store,id);const p=store.read(id),snapshotSha256=hash(p),semantic=store.semanticConfiguration(),images=scope.getStore();
   const dto={protocolVersion:'sketch-native-source-read-v2',kind:'unsupported',projectId:id,revision:p.revision,snapshotSha256,snapshotHashEncoding:'sha256(UTF8(JSON.stringify(nativeProject)))',expectedRevision:request.expectedRevision,identity:null,method:null,methodOrigin:null,semantic,coverage:{images,source:null},currentQualification:{status:'not_checked'},historyReadability:'not_established',reason:null,diagnostic:null,writeEligible:false,appCapabilityGranted:false,physicalIOVerified:false};
   try{
    need(await realpath(rootDir)===rootDir,'SKETCH_READ_ROOT_REQUIRED');need(p.revision===request.expectedRevision,'REVISION_CONFLICT');
    const generations=p.sketchGenerations?.filter(g=>g.id===request.generationId),g=generations?.[0];need(generations?.length===1,'SKETCH_GENERATION_REQUIRED');
    const runs=p.sketchReviewRuns?.filter(r=>r.generationId===g.id)??[];need(runs.length<=1,'REVIEW_RUN_REQUIRED');const run=request.runId?runs.find(r=>r.id===request.runId):runs[0];need(!request.runId||run,'REVIEW_RUN_REQUIRED');
    const source=g.source,copy=source.referenceSource.source,assignment=source.referenceSource.producerAssignment;
    const identity={taskCardId:source.referenceSource.taskCard.id,taskHash:hash(source.referenceSource.taskCard),policyHash:hash(source.referenceSource.policy),copyArtifactId:copy.artifactId,copyContentHash:copy.contentHash,copyProducer:{jobId:assignment?.jobId??null,attemptId:assignment?.attemptId??null,bindingHash:assignment?.binding?hash(assignment.binding):null,authorHash:assignment?.author?hash(assignment.author):null,receiptHash:assignment?.executionReceipt?hash(assignment.executionReceipt):null},dossierId:source.dossierId,envelopeHash:source.envelopeHash,selectionHash:source.selectionHash,generationId:g.id,sourceHash:source.sourceHash,planHash:g.plan?.planHash??null,runId:run?.id??null,packetHash:run?.packetHash??null,graphHash:run?hash({nodes:run.nodes,cohorts:run.cohorts,neutral:run.neutral}):null,bindingsHash:hash(g.bindings)};
    need(['taskCardId','taskHash','policyHash','copyArtifactId','copyContentHash','dossierId','envelopeHash','selectionHash','generationId','sourceHash','bindingsHash'].every(k=>typeof identity[k]==='string'&&identity[k]),'SKETCH_READ_IDENTITY_REQUIRED');dto.identity=identity;
    dto.method=await visualMethod(p);dto.coverage.source={verifier:'sketch-runtime.inspectSource -> original checked/checkedSelection/requireCurrentSketchGeneration',status:'started'};
    const result=await sketches.inspectSource(id,{generationId:g.id,runId:run?.id??null,complete:Boolean(run)});
    need(equal(result.source,g.source),'SKETCH_SOURCE_STALE');
    dto.methodOrigin=methodOrigin(p,g,dto.method);
    dto.coverage.source={...dto.coverage.source,status:'complete',sketchOriginalFacts:result.originalFacts.map(f=>({kind:f.kind,jobId:f.jobId,attemptId:f.attemptId,outputVersionId:f.outputVersionId,receiptHash:f.receiptHash,originalHash:f.sha256??f.reportHash,dependencyHash:hash(f.dependencies)})),reviewOriginalFacts:result.reviewFacts?{runId:result.reviewFacts.reviewRunId,reports:result.reviewFacts.reports.map(f=>({reportId:f.reportId,nodeKey:f.nodeKey,jobId:f.jobId,attemptId:f.attemptId,receiptHash:f.receiptHash,valid:f.valid,rawHash:hash(f.raw),inputHash:hash(f.frozenInput)})),dependenciesHash:hash(result.reviewFacts.dependencies),imageOccurrencesHash:hash(result.reviewFacts.imageOccurrences)}:null,ordinaryHTTPAttempts:p.jobs.flatMap(j=>(j.attempts??[]).filter(a=>isOrdinaryHttp(a.receipt)).map(a=>({jobId:j.id,attemptId:a.id,receiptHash:hash(a.receipt)}))),reviewPacketHash:result.packet?.packetHash??null,ordinaryScope:'original verifyOrdinaryProject retained HTTP originals; no per-file byte accounting',referenceScope:'original checkedSelection verifyHistory; exact reference dossier history',physicalAllFilesClaimed:false};
    dto.kind='native_source_qualified';dto.currentQualification={status:'passed_original_native_guards'};
   }catch(error){dto.reason=error.code??'SKETCH_READ_ORIGINAL_UNAVAILABLE';dto.diagnostic={code:dto.reason,message:String(error.message??dto.reason).slice(0,1000)};dto.currentQualification={status:'unsupported',reason:dto.reason};if(dto.coverage.source?.status==='started')dto.coverage.source.status='failed_partial';
    if(dto.reason==='SKETCH_UNRESOLVED'&&dto.identity&&dto.method){try{
     const g=p.sketchGenerations.find(g=>g.id===request.generationId),run=p.sketchReviewRuns?.find(r=>r.generationId===g.id);
     requireCurrentSketchGeneration(p,g,copyDeliveryEnvelope);const graph=readSketchUnresolvedGraph(p,g,run);
     dto.methodOrigin=methodOrigin(p,g,dto.method);dto.kind='unresolved';dto.unresolvedRead=graph;dto.currentQualification={status:'stopped_unresolved',reason:dto.reason};
    }catch(e){dto.unresolvedRead={kind:'unsupported',reason:e.code??'SKETCH_READ_GRAPH_CHANGED'};}}
   }
   const after=store.read(id),head=store.readHead(id);need(p.revision===after.revision&&head.revision===p.revision&&snapshotSha256===hash(after)&&snapshotSha256===hash(p),'SKETCH_READ_SNAPSHOT_CHANGED');need(equal(semantic,store.semanticConfiguration()),'SKETCH_READ_SEMANTIC_CHANGED');if(dto.method)need(equal(dto.method,await visualMethod(after)),'SKETCH_READ_METHOD_CHANGED');
   produced=freeze(dto);return produced;
  })));
  need(admission.kind==='complete'&&produced&&admission.value===produced,'SKETCH_READ_ADMISSION_FAILED',admission.code??'Read admission did not complete');
  need(admission.usage.snapshotHash===produced.snapshotSha256,'SKETCH_READ_SNAPSHOT_CHANGED');
  return freeze({...produced,admission:admission.usage});
 }
 async function envelope(project){
  let originalHead;const head=await store.withReadAdmission(project.id,{...SKETCH_SOURCE_READ_LIMITS,readAttempts:1},()=>{assertStoreReadAdmission(store,project.id);originalHead=store.readHead(project.id);return originalHead;});need(head.kind==='complete'&&originalHead&&head.value===originalHead,'SKETCH_READ_ADMISSION_FAILED');if(originalHead.revision!==project.revision)return null;
  const p=store.read(project.id),snapshotSha256=hash(p);need(equal(p,project),'SKETCH_READ_SNAPSHOT_CHANGED');
  const inspections=[];
  for(const g of p.sketchGenerations??[]){const read=await inspect(p.id,{expectedRevision:p.revision,generationId:g.id});need(read.snapshotSha256===snapshotSha256&&read.revision===p.revision,'SKETCH_READ_SNAPSHOT_CHANGED');inspections.push(read);}
  need(hash(store.read(p.id))===snapshotSha256,'SKETCH_READ_SNAPSHOT_CHANGED');
  return freeze({protocolVersion:'sketch-app-readback-v1',projectId:p.id,revision:p.revision,snapshotSha256,snapshotHashEncoding:'sha256(UTF8(JSON.stringify(nativeProject)))',inspections,appCapabilityGranted:false,writeEligible:false});
 }
 return Object.freeze({inspect,envelope});
}
