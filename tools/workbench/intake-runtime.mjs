import {ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {invokeOrdinary,reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {createIntakeDocumentStore,digest,requireIntake,intakeError,DOCUMENT_LIMITS} from './intake-document-store.mjs';
import {createLocalPdfExtractor,validatePdfExtraction} from './intake-pdf.mjs';
import {buildIntakeRequest,validateTaskCardDraft,cardHash} from './intake-contract.mjs';
import {intakeCurrent,INTAKE_PURPOSES} from './intake-domain.mjs';
import {capturePublicSource} from './source-acquisition.mjs';
import {readManagedCapture} from './source-capture-store.mjs';
import {imageManifest,IMAGE_LIMITS} from './image-evidence.mjs';

const need=requireIntake;
const kindOf=bytes=>bytes.subarray(0,5).toString()==='%PDF-'?'pdf':bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||bytes[0]===255&&bytes[1]===216?'image':null;
const localContext=()=>({actorType:'agent',actorId:'intake-runtime',runId:randomUUID(),contextId:randomUUID(),executorHost:hostname(),executorPid:process.pid});
export function createIntakeRuntime({store,root,providers,bindings,imageStore,acquisitionDependencies={},configuration=null}){
 const files=createIntakeDocumentStore(join(root,'intake')),pdf=createLocalPdfExtractor(configuration);
 const send=(id,c,context)=>store.command(id,{...c,expectedRevision:store.read(id).revision,commandId:randomUUID()},{...context,now:new Date().toISOString()});
 const modelBinding=()=>{const b=bindings.intake;need(b&&providers[b.providerId]?.model===b.model,'INTAKE_PROVIDER_MISSING','Configure an intake binding and matching text/vision provider');return structuredClone(b);};
 function prior(projectId,kind,request){
  need(typeof request.commandId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(request.commandId)&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0,'INVALID_REQUEST','Valid commandId and expectedRevision required');
  const p=store.read(projectId),saved=(p.intakeOperations??[]).find(o=>o.commandId===request.commandId);
  if(saved){need(saved.kind===kind&&equal(saved.request,request),'COMMAND_ID_REUSED','Command ID belongs to another intake payload');return saved.response;}
  need(!Object.hasOwn(p.processedCommands,request.commandId),'COMMAND_ID_REUSED','Command ID already used');need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Project revision changed');return null;
 }
 const document=(p,id)=>{const d=(p.intakeDocuments??[]).find(d=>d.id===id);need(d,'NOT_FOUND','Document not registered in this project');return d;};
 async function checkedDocument(projectId,id){
  try{
  const p=store.read(projectId),d=document(p,id);need(d.raw,'DOCUMENT_PENDING','Document has no captured original yet');let bytes,descriptor=null,verifiedCapture=null;
  if(d.origin.kind==='url_capture'){
   const registered=p.sourceCaptures.find(c=>c.id===d.captureId);need(registered?.recordHash===d.origin.recordHash,'DOCUMENT_CORRUPT','Registered capture changed');
   const capture=await readManagedCapture(join(root,'source-captures'),registered);verifiedCapture=capture;bytes=capture.raw;need(d.raw.sha256===capture.record.raw.sha256&&d.raw.byteLength===bytes.length,'DOCUMENT_CORRUPT','Capture raw identity changed');
  }else if(d.kind==='image'){
   const saved=p.imageAssets.find(i=>i.id===d.imageId);need(saved&&saved.sha256===d.raw.sha256,'DOCUMENT_CORRUPT','Registered image changed');const loaded=await imageStore.read({projectId,imageId:d.imageId,expectedHash:d.raw.sha256});bytes=loaded.bytes;descriptor=loaded.descriptor;
  }else bytes=await files.readOriginal(d.raw);
  need(digest(bytes)===d.raw.sha256&&bytes.length===d.raw.byteLength,'DOCUMENT_CORRUPT','Original bytes changed');
  let extraction=null;
  if(d.extraction){extraction=await files.readResult(d.extraction);need(extraction.rawHash===d.raw.sha256,'DOCUMENT_CORRUPT','Extraction belongs to another original');if(d.kind==='pdf')validatePdfExtraction(extraction);}
  if(d.kind==='image'&&!descriptor){const loaded=await imageStore.read({projectId,imageId:d.imageId,expectedHash:d.raw.sha256});descriptor=loaded.descriptor;}
  return {document:d,bytes,extraction,descriptor,verifiedCapture};
  }catch(error){if(error.status)throw error;throw intakeError('DOCUMENT_CORRUPT','Registered original or extraction could not be verified');}
 }
 async function material(projectId,id){
  const loaded=await checkedDocument(projectId,id),d=loaded.document;need(d.status==='ready','DOCUMENT_TEXT_UNAVAILABLE','Document extraction is not ready');
  need(d.kind==='image'||loaded.extraction,'DOCUMENT_TEXT_UNAVAILABLE','Text document requires its retained extraction result');
  let image=null;if(d.kind==='image')image=store.read(projectId).imageAssets.find(i=>i.id===d.imageId);
  const m={id:d.id,kind:d.kind,documentHash:digest(d),origin:d.origin,raw:d.raw,text:loaded.extraction?.text??'',extraction:loaded.extraction,extractionHash:d.extraction?.sha256??null,...(image?{image}:{}),...(d.captureId?{capture:{id:d.captureId,recordHash:d.origin.recordHash}}:{})};return m;
 }
 async function verifyInput(projectId,input){
  let total=0;
  for(const m of input.materials.filter(m=>m.kind!=='human')){const current=await material(projectId,m.id);need(equal(m,current),'DOCUMENT_CORRUPT','Frozen input differs from registered original');total+=current.kind==='image'?current.image.width*current.image.height:0;}
  need(total<=IMAGE_LIMITS.pixels*IMAGE_LIMITS.count,'INPUT_TOO_LARGE','Aggregate image pixels exceed intake policy');
 }
 async function verifyCard(projectId,card=store.read(projectId).taskCards.find(c=>c.id===store.read(projectId).activeTaskCardId)){
  if(card?.protocol!=='task-card-v1')return;
  const p=store.read(projectId),draft=p.intakeDrafts.find(d=>d.id===card.draftId),job=p.jobs.find(j=>j.id===card.extractionJobId);need(draft&&job&&job.status==='succeeded','DOCUMENT_CORRUPT','Task draft provenance missing');
  await verifyInput(projectId,draft.input);await savedOutput(projectId,job);
  need(equal(card.inputDocumentRefs,draft.input.materials.filter(m=>m.kind!=='human').map(m=>({id:m.id,documentHash:m.documentHash,rawHash:m.raw.sha256,extractionHash:m.extractionHash??null}))),'DOCUMENT_CORRUPT','Task document manifest changed');
 }
 async function savedOutput(projectId,job){
  const attempt=job.attempts.at(-1);need(attempt?.requestEvidence&&(attempt.resultEvidence||attempt.httpAttemptLocator),'INTAKE_RESULT_UNAVAILABLE','No saved invocation result is available; do not retry an unknown model call');
  const request=await files.readResult(attempt.requestEvidence),expected=buildIntakeRequest(job.task.input);let result=attempt.resultEvidence?await files.readResult(attempt.resultEvidence):null;
  need(request.projectId===projectId&&request.jobId===job.id&&request.attemptId===attempt.id&&equal(request.binding,job.binding)&&equal(request.request,expected),'INVALID_EXECUTION_RECEIPT','Original request differs from frozen job');
  const images=[];for(const m of job.task.input.materials.filter(m=>m.kind==='image'))images.push((await checkedDocument(projectId,m.id)).descriptor);
  if(!result){const revision=store.read(projectId).revision;result=await reopenOrdinary({executionRoot:root,binding:job.binding,attemptId:attempt.id,request:expected,images,runtimePacketBytes:Buffer.from(JSON.stringify({projectId,jobId:job.id,attemptId:attempt.id,binding:job.binding,request:expected})),attemptLocator:attempt.httpAttemptLocator});need(store.read(projectId).revision===revision,'REVISION_CONFLICT','Project changed during saved original recovery');const resultEvidence=await files.putResult(result);need(store.read(projectId).revision===revision,'REVISION_CONFLICT','Project changed during saved result retention');send(projectId,{kind:'intake-save-result',jobId:job.id,attemptId:attempt.id,resultEvidence,recover:true},localContext());}
  need(ordinaryOriginMatches(result,attempt.httpAttemptLocator,attempt.id),'INVALID_EXECUTION_RECEIPT','Retained intake result changed persisted HTTP origin');
  const manifest=images.length?imageManifest(images):[];
  const expectedHash=digest(JSON.stringify({runId:attempt.id,model:job.binding.model,...expected,...(manifest.length?{images:manifest}:{})}));
  need(result.runId===attempt.id&&result.requestedModel===job.binding.model&&ordinaryHasContext(result)&&result.inputPacketHash===expectedHash&&ordinarySuccessfulStatus(result)&&['signal','reason','error'].every(k=>result[k]==null)&&typeof result.responseText==='string','INVALID_EXECUTION_RECEIPT','Successful actual original response and exact request hash required');
  if(isOrdinaryHttp(result))await reopenOrdinary({executionRoot:root,binding:job.binding,attemptId:attempt.id,request:expected,images,runtimePacketBytes:Buffer.from(JSON.stringify({projectId,jobId:job.id,attemptId:attempt.id,binding:job.binding,request:expected})),receipt:result});
  let parsed;try{parsed=JSON.parse(result.responseText);}catch{throw intakeError('INVALID_TASK_CARD','Original response is not JSON');}
  need(result.parsedOutput===undefined||equal(result.parsedOutput,parsed),'INVALID_EXECUTION_RECEIPT','Parsed output differs from original response');
  return validateTaskCardDraft(parsed,job.task.input);
 }
 const runtime={
  async capability(){return {protocol:'intake-v1',pdf:await pdf.capability(),model:{configured:!!bindings.intake,available:!!bindings.intake&&providers[bindings.intake.providerId]?.model===bindings.intake.model,binding:bindings.intake??null},limits:{...DOCUMENT_LIMITS,images:IMAGE_LIMITS},sourceAuthenticity:'not_verified',ocrAvailable:false};},
  verifyCard,checkedDocument,
  async upload(projectId,request,bytes){
   const fingerprint={...request,sha256:digest(bytes),byteLength:bytes.length};const old=prior(projectId,'intake-register',fingerprint);if(old)return old;
   need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=DOCUMENT_LIMITS.bytes,'INPUT_TOO_LARGE','Upload must be within 12 MiB');
   const kind=kindOf(bytes);need(kind,'INPUT_UNSUPPORTED','Upload actual PDF, PNG or JPEG bytes');need(request.originalFilename.length<=2000,'INVALID_REQUEST','Filename too long');
   const id=`document-${digest([projectId,request.commandId])}`,origin={kind:'upload',originalFilename:request.originalFilename,uploadedBy:'local-operator'},createdAt=new Date().toISOString();let raw,imageAsset,job;
   if(kind==='image'){imageAsset=await imageStore.ingest({projectId,bytes,metadata:{originalFilename:request.originalFilename,representation:'supplied_image'}});raw={sha256:imageAsset.sha256,byteLength:imageAsset.byteLength,mediaType:imageAsset.mediaType};}
   else{raw={...await files.putOriginal(bytes),mediaType:'application/pdf'};job={id:`intake-${digest([projectId,request.commandId])}`,purpose:'intake_document',stage:'intake',documentId:id,status:'queued',binding:{providerId:'local-pdf',model:'pdf-extraction-v1',role:'document-parser'},task:{id,kind:'pdf'},inputVersionIds:[],attempts:[]};}
   const d={protocol:'intake-document-v1',id,projectId,origin,kind,raw,...(imageAsset?{imageId:imageAsset.id}:{}),status:kind==='image'?'ready':'queued',createdAt};
   const raced=prior(projectId,'intake-register',fingerprint);if(raced)return raced;
   store.command(projectId,{kind:'intake-register',document:d,...(imageAsset?{imageAsset}:{}),...(job?{job}:{}),request:fingerprint,commandId:request.commandId,expectedRevision:request.expectedRevision},localContext());return {documentId:id,jobId:job?.id??null};
  },
  async capture(projectId,request){
   const old=prior(projectId,'intake-register',request);if(old)return old;
   let url;try{url=new URL(request.url);}catch{throw intakeError('INVALID_REQUEST','Valid HTTPS URL required');}need(url.protocol==='https:'&&!url.username&&!url.password,'INVALID_REQUEST','Public HTTPS URL without credentials required');
   const id=`document-${digest([projectId,request.commandId])}`,job={id:`intake-${digest([projectId,request.commandId])}`,purpose:'intake_document',stage:'intake',documentId:id,status:'queued',binding:{providerId:'public-https',model:'capture-v1',role:'document-parser'},task:{id,kind:'url',url:request.url},inputVersionIds:[],attempts:[]},d={protocol:'intake-document-v1',id,projectId,origin:{kind:'url_request',requestedUrl:request.url},kind:'pending',status:'queued',createdAt:new Date().toISOString()};
   store.command(projectId,{kind:'intake-register',document:d,job,request,commandId:request.commandId,expectedRevision:request.expectedRevision},localContext());return {documentId:id,jobId:job.id};
  },
  async requestExtraction(projectId,request){
   const old=prior(projectId,'intake-request',request);if(old)return old;const binding=modelBinding(),p=store.read(projectId),base=p.taskCards.find(c=>c.id===p.activeTaskCardId);
   need(request.baseTaskCardId===base.id&&request.baseTaskCardHash===cardHash(base),'STALE_TASK_CARD','Exact active base card required');need(Array.isArray(request.documentIds)&&request.documentIds.length>0&&request.documentIds.length<=DOCUMENT_LIMITS.documents&&new Set(request.documentIds).size===request.documentIds.length,'INVALID_REQUEST','Unique input document IDs required');
   const materials=[];for(const id of request.documentIds)materials.push(await material(projectId,id));
   need(materials.filter(m=>m.kind==='image').length<=IMAGE_LIMITS.count,'INPUT_TOO_LARGE','At most four actual image inputs per extraction');
   if(base.protocol==='task-card-v1'){
    const original=p.intakeDrafts.find(d=>d.id===base.draftId);need(original,'DOCUMENT_CORRUPT','Structured base lacks its retained extraction');
    const humanMaterials=new Map(original.input.materials.filter(m=>m.kind==='human').map(m=>[m.id,structuredClone(m)]));
    for(const s of base.humanStatements)humanMaterials.set(s.id,{id:s.id,kind:'human',text:s.text,textHash:s.textHash,actorId:s.actorId});materials.push(...humanMaterials.values());
   }else materials.push({id:`brief-${base.id}`,kind:'human',text:base.brief,textHash:digest(base.brief),actorId:base.createdBy});
   const input={protocol:'intake-input-v1',baseTaskCardId:base.id,baseTaskCardHash:cardHash(base),baseTaskCard:structuredClone(base),materials};need(Buffer.byteLength(JSON.stringify(input))<=DOCUMENT_LIMITS.packetBytes,'INPUT_TOO_LARGE','Frozen input exceeds 2 MiB');
   const job={id:`intake-${digest([projectId,request.commandId])}`,purpose:'intake_taskcard',stage:'intake',status:'queued',binding,task:{id:`task-${digest([projectId,request.commandId])}`,input},inputVersionIds:[base.id],attempts:[]};
   store.command(projectId,{kind:'intake-request',job,request,commandId:request.commandId,expectedRevision:request.expectedRevision},localContext());return {jobId:job.id};
  },
  async humanAction(projectId,kind,request,context){
   const old=prior(projectId,kind,request);if(old)return old;const p=store.read(projectId);
   if(kind==='intake-adopt'){const d=p.intakeDrafts?.find(d=>d.id===request.draftId);need(d,'NOT_FOUND','Draft not found');await verifyInput(projectId,d.input);await savedOutput(projectId,p.jobs.find(j=>j.id===d.jobId));}
   if(['intake-confirm','intake-decide'].includes(kind))await verifyCard(projectId);
   const updated=store.command(projectId,{kind,request,commandId:request.commandId,expectedRevision:request.expectedRevision},context);return updated.intakeOperations.find(o=>o.commandId===request.commandId).response;
  },
  async reconcile(projectId,request,context){
   need(context.actorType==='human','HUMAN_REQUIRED','Human recovery request required');const old=prior(projectId,'intake-reconcile',request);if(old){const job=store.read(projectId).jobs.find(j=>j.id===request.jobId);await savedOutput(projectId,job);return old;}
   const p=store.read(projectId),job=p.jobs.find(j=>j.id===request.jobId);need(job?.purpose==='intake_taskcard'&&job.status==='awaiting_reconciliation'&&job.attempts.at(-1)?.id===request.attemptId,'INVALID_JOB','Exact unresolved model attempt required');intakeCurrent(p,job);await verifyInput(projectId,job.task.input);const missingResult=!job.attempts.at(-1).resultEvidence,output=await savedOutput(projectId,job),current=store.read(projectId),savedAttempt=current.jobs.find(j=>j.id===job.id).attempts.at(-1);need(current.revision===p.revision+(missingResult?1:0),'REVISION_CONFLICT','Project changed during intake original recovery');
   store.command(projectId,{kind:'intake-complete',jobId:job.id,attemptId:request.attemptId,output,resultEvidence:savedAttempt.resultEvidence,recover:true,request,commandId:request.commandId,expectedRevision:current.revision},localContext());return {jobId:job.id};
  },
  async execute(projectId,jobId,{retry=false,localRequest,localAdmissionRevision}={}){
   let p=store.read(projectId),job=p.jobs.find(j=>j.id===jobId);need(INTAKE_PURPOSES.includes(job?.purpose),'INVALID_JOB','Intake job required');need(!retry,'UNSAFE_RETRY','Use explicit local retry or saved-result recovery');if(job.status!=='queued')return job;
   let localStartId,localStartRevision;
   if(localRequest){
    const retryRequest=localRequest.action==='retry_local';
    need(job.purpose==='intake_document'&&job.task.kind==='pdf'&&job.documentId===localRequest.documentId&&['extract','retry_local'].includes(localRequest.action),'INVALID_REQUEST','Frozen request only supports the selected local PDF parser');
    if(retryRequest){
     const prior=Object.hasOwn(p.processedCommands,localRequest.commandId)?JSON.parse(p.processedCommands[localRequest.commandId]):null;
     need(prior?.kind==='intake-retry-local'&&equal(prior.request,{...localRequest,jobId}),'COMMAND_ID_REUSED','Original human local retry request required');
     need(Number.isSafeInteger(localAdmissionRevision)&&localAdmissionRevision>=0,'INVALID_REQUEST','Explicit local retry admission revision required');
     localStartId=`local-start-${digest([projectId,jobId,localRequest.commandId])}`;localStartRevision=localAdmissionRevision;
    }else{
     need(localAdmissionRevision===undefined,'INVALID_REQUEST','Initial extraction uses its original revision');localStartId=localRequest.commandId;localStartRevision=localRequest.expectedRevision;
    }
    need(p.revision===localStartRevision,'REVISION_CONFLICT','Project changed before local parsing');
    const card=p.taskCards.find(c=>c.id===p.activeTaskCardId);need(card?.id===localRequest.taskCardId&&cardHash(card)===localRequest.taskCardHash,'STALE_TASK_CARD','Exact task card required before local parsing');
   }
   const attemptId=randomUUID(),context=localContext();context.runId=attemptId;
   try{if(localRequest)store.command(projectId,{kind:'intake-start',jobId,attemptId,request:structuredClone(localRequest),commandId:localStartId,expectedRevision:localStartRevision},{...context,now:new Date().toISOString()});else send(projectId,{kind:'intake-start',jobId,attemptId},context);}catch(error){if(localRequest)throw error;send(projectId,{kind:'block-queued-job',jobId,error:{code:error.code??'INTAKE_BLOCKED',message:error.message}},context);return store.read(projectId).jobs.find(j=>j.id===jobId);}
   try{
    if(job.purpose==='intake_document'){
     let d=document(store.read(projectId),job.documentId),bytes,capture,imageAsset,verifiedCapture;
     if(job.task.kind==='url'&&!d.raw){
      const captured=await capturePublicSource({url:job.task.url,storeRoot:join(root,'source-captures'),limits:{maxBytes:DOCUMENT_LIMITS.bytes}},{...acquisitionDependencies,pdfExtractor:undefined});
      const checked=await readManagedCapture(join(root,'source-captures'),captured);verifiedCapture=checked;need(checked.record.httpStatus>=200&&checked.record.httpStatus<300,'DOCUMENT_CAPTURE_FAILED','URL did not return a successful response');bytes=checked.raw;
      capture={id:`capture_${checked.recordHash}`,projectId,recordHash:checked.recordHash,recordPath:checked.recordPath,record:checked.record};
      const kind=kindOf(bytes)??(['text/html','application/xhtml+xml'].includes(checked.record.mimeType)?'web':null);need(kind,'INPUT_UNSUPPORTED','Captured URL is not HTML, PDF or PNG/JPEG');
      d={...d,kind,origin:{kind:'url_capture',requestedUrl:job.task.url,finalUrl:checked.record.finalUrl,recordHash:checked.recordHash},captureId:capture.id,raw:{sha256:digest(bytes),byteLength:bytes.length,mediaType:kind==='pdf'?'application/pdf':checked.record.mimeType}};
      if(kind==='image'){imageAsset=await imageStore.ingest({projectId,bytes,metadata:{representation:'supplied_image',sourcePageUrl:checked.record.finalUrl}});d.imageId=imageAsset.id;d.raw.mediaType=imageAsset.mediaType;}
      send(projectId,{kind:'intake-document-original',jobId,attemptId,document:d,capture,...(imageAsset?{imageAsset}:{})},context);
     }else{const loaded=await checkedDocument(projectId,d.id);bytes=loaded.bytes;verifiedCapture=loaded.verifiedCapture;}
     if(d.kind==='web'){
      const extracted=verifiedCapture.record.extraction,x={protocol:'web-extraction-v1',rawHash:d.raw.sha256,text:extracted.text,textHash:extracted.textHash,status:extracted.text?'text_extracted':'no_text',method:extracted.method};d={...d,extraction:await files.putResult(x)};
     }
     if(d.kind==='pdf')d={...d,extraction:await files.putResult(await pdf.extract(bytes))};
     d={...d,status:'ready'};send(projectId,{kind:'intake-complete',jobId,attemptId,document:d,...(capture?{capture}:{}),...(imageAsset?{imageAsset}:{})},context);
    }else{
     need(equal(modelBinding(),job.binding),'MODEL_BINDING_MISMATCH','Intake provider binding changed');intakeCurrent(store.read(projectId),job);await verifyInput(projectId,job.task.input);
     const request=buildIntakeRequest(job.task.input),images=[];for(const m of job.task.input.materials.filter(m=>m.kind==='image'))images.push((await checkedDocument(projectId,m.id)).descriptor);
     const requestEvidence=await files.putResult({projectId,jobId,attemptId,binding:job.binding,request});send(projectId,{kind:'intake-dispatch',jobId,attemptId,requestEvidence},context);
     const result=await invokeOrdinary({executionRoot:root,provider:providers[job.binding.providerId],binding:job.binding,attemptId,request,images,runtimePacketBytes:Buffer.from(JSON.stringify({projectId,jobId,attemptId,binding:job.binding,request})),persistLocator:locator=>send(projectId,{kind:'anchor-model-http-attempt',jobId,attemptId,locator},context)});
     const resultEvidence=await files.putResult(result);send(projectId,{kind:'intake-save-result',jobId,attemptId,resultEvidence},context);
     job=store.read(projectId).jobs.find(j=>j.id===jobId);await verifyInput(projectId,job.task.input);const output=await savedOutput(projectId,job);send(projectId,{kind:'intake-complete',jobId,attemptId,output,resultEvidence},context);
    }
   }catch(error){if(error.receipt){const current=store.read(projectId).jobs.find(j=>j.id===jobId).attempts.at(-1);if(current.dispatchStarted&&!current.resultEvidence){const resultEvidence=await files.putResult(error.receipt);send(projectId,{kind:'intake-save-result',jobId,attemptId,resultEvidence},context);}}send(projectId,{kind:'intake-fail',jobId,attemptId,blocked:['PDF_EXTRACTOR_UNAVAILABLE','INTAKE_PROVIDER_MISSING','MODEL_BINDING_MISMATCH'].includes(error.code),error:{code:error.code??'INTAKE_EXECUTION_FAILED',message:String(error.message).slice(0,2000)}},context);}
   return store.read(projectId).jobs.find(j=>j.id===jobId);
  },
 };
 return runtime;
}
