import {validateModelHttpConfiguration} from './model-http-authority.mjs';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {readFile,mkdir,open,realpath} from 'node:fs/promises';
import {join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGenericDeckNativeAdmission} from './generic-deck-native-admission.mjs';
import {selectDeckDatabase,assertDeckDatabase} from './generic-deck-source-identity.mjs';
import {assertStoreReadAdmission} from './store.mjs';
import {mapNativeSources} from '../../apps/workbench-preview/src/proposal/generic-deck/mapper.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {invokeOrdinary,reopenOrdinary,ordinarySuccess} from './ordinary-model.mjs';
import {ordinaryDomainReceipt,reopenOrdinaryJob} from './ordinary-model-project.mjs';
import {PRELAYOUT_PROTOCOL,PRELAYOUT_PURPOSE,prelayoutHash,derivePrelayoutBasis,buildPrelayoutDirectorRequest,prelayoutRuntimePacket,validatePrelayoutReport,assertPrelayoutProviderEnvelope} from './proposal-prelayout-contract.mjs';
import {prelayoutJobId,prelayoutUnknown,requirePrelayoutReceipt} from './proposal-prelayout-domain.mjs';
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const safe=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(v);
const actor=()=>({actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
const baseKeys=['store','dbPath','pin','executionRoot','imageRoot','consumerBinding'];
async function directorMethod(){const root=new URL('../../',import.meta.resolve('./store.mjs')),originalText=await readFile(new URL('docs/agents/proposal-director.md',root),'utf8'),version=/规范版本：([^\s。]+)/u.exec(originalText)?.[1];need(version,'PRELAYOUT_METHOD_REQUIRED');return {path:'docs/agents/proposal-director.md',version,sha256:prelayoutHash(originalText),originalText};}
async function retain(root,path,bytes){need(await realpath(root)===root&&path.startsWith(root+sep)&&await realpath(dirname(path))===dirname(path),'PRELAYOUT_ORIGINAL_PATH_INVALID');try{const f=await open(path,'wx',0o400);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}catch(e){if(e.code!=='EEXIST')throw e;need((await readManagedLayoutBytes(root,path,64*1024*1024)).equals(Buffer.from(bytes)),'PRELAYOUT_ORIGINAL_BYTES_CHANGED');}for(const directory of [dirname(path),root]){const f=await open(directory,'r');try{await f.sync();}finally{await f.close();}}}
/** Reads an original invocation only; this partial fact never grants five-source/current/layout authority. */
export async function verifyProposalPrelayoutReportOriginal(project,job,{executionRoot,imageStore}){
 need(job?.purpose===PRELAYOUT_PURPOSE&&job.attempts.length===1&&job.prelayoutReport&&['succeeded','succeeded_stale'].includes(job.status),'PRELAYOUT_REPORT_REQUIRED');
 const a=job.attempts[0],r=job.prelayoutReport;need(job.id===prelayoutJobId(job.task.prelayoutInput)&&job.task.id===job.id&&job.binding.role==='proposal-director'&&a.status===job.status,'PRELAYOUT_ORIGINAL_JOB_CHANGED');
 const execution=a.executionRequest,claim=execution&&project.processedCommands?.[execution.commandId];let command;try{command=JSON.parse(claim);}catch{}need(command?.kind==='claim-proposal-prelayout'&&command.jobId===job.id&&command.attemptId===a.id&&command.requestHash===a.requestHash&&equal(command.executionRequest,execution)&&project.audit?.some(x=>x.commandId===execution.commandId&&x.kind==='claim-proposal-prelayout'&&x.actorId===a.executor.actorId&&x.at===a.executor.now&&x.revision===execution.expectedRevision+1),'PRELAYOUT_ORIGINAL_CLAIM_REQUIRED');
 requirePrelayoutReceipt(job,a,a.receipt);await reopenOrdinaryJob(project,job,a,{executionRoot,imageStore});
 const path=join(executionRoot,a.id,'director-report.json');need(path===r.payloadRef,'PRELAYOUT_REPORT_PATH_CHANGED');const bytes=await readManagedLayoutBytes(executionRoot,path,1024*1024),originalText=bytes.toString('utf8');need(Buffer.from(originalText).equals(bytes)&&originalText===a.receipt.responseText&&prelayoutHash(originalText)===r.contentHash,'PRELAYOUT_REPORT_BYTES_CHANGED');
 const artifact=project.artifacts.find(x=>x.id===r.id);need(artifact?.id==='prelayout-report-'+prelayoutHash([project.id,job.id,a.id])&&artifact.stage==='layout'&&equal(artifact.inputVersionIds,job.inputVersionIds)&&equal(artifact.claims,[])&&equal(artifact.technicalReceipts,{})&&r.sourceTupleHash===job.task.prelayoutInput.sourceTupleHash&&r.baseInputSha256===job.task.prelayoutInput.baseInputSha256&&artifact.provenance==='proposal-prelayout-director-report-v1'&&artifact.contentHash===r.contentHash&&artifact.payloadRef===path&&equal(artifact.author,a.executor)&&equal(artifact.executionReceipt,a.receipt)&&equal(artifact.proposalPrelayout,{protocol:PRELAYOUT_PROTOCOL,jobId:job.id,attemptId:a.id,sourceTupleHash:job.task.prelayoutInput.sourceTupleHash,baseInputSha256:job.task.prelayoutInput.baseInputSha256,requestHash:a.requestHash}),'PRELAYOUT_ARTIFACT_CHANGED');
 const report=validatePrelayoutReport(JSON.parse(originalText),job.task.prelayoutInput);return {authority:'none',kind:'report_original_read',report,descriptor:{identity:r.id,originalText,sha256:r.contentHash,bytes:bytes.length},jobId:job.id,attemptId:a.id,requestHash:a.requestHash,receiptHash:prelayoutHash(a.receipt)};
}
/** Program-only composition. No caller receiver, verifier, pass flag or ordinary execute callback. */
export function createProposalPrelayoutNative(configuration){
 need(configuration&&Object.keys(configuration).every(k=>[...baseKeys,'binding','provider','executionAllowed','prelayoutExecutionAllowed'].includes(k))&&baseKeys.every(k=>Object.hasOwn(configuration,k)),'PRELAYOUT_CONFIGURATION_INVALID');
 if(configuration.provider)need(Object.keys(configuration.provider).every(k=>['adapter','model','operatorConfig','environment'].includes(k)),'PRELAYOUT_CONFIGURATION_INVALID');
 const options={binding:configuration.binding?structuredClone(configuration.binding):null,provider:configuration.provider?structuredClone(configuration.provider):null,executionAllowed:configuration.executionAllowed===true,prelayoutExecutionAllowed:configuration.prelayoutExecutionAllowed===true};
 const base=Object.fromEntries(baseKeys.map(k=>[k,configuration[k]])),{store,executionRoot,imageRoot}=base,selected=selectDeckDatabase(store,base.dbPath,base.pin),database=()=>assertDeckDatabase(store,selected),reader=createGenericDeckNativeAdmission(base),imageStore=createImageEvidenceStore({rootDir:imageRoot}),owned=new WeakMap();let closed=false;
 const check=()=>{need(!closed,'PRELAYOUT_CLOSED');database();};
 const capability=()=>{let configured=false;try{const cfg=validateModelHttpConfiguration(options.provider?.operatorConfig),env=options.provider?.environment??process.env;configured=Boolean(options.binding?.role==='proposal-director'&&options.provider?.adapter==='workbench-model-http-v1'&&options.provider.model===options.binding.model&&cfg.model===options.binding.model&&cfg.vision&&cfg.envelopes.includes(PRELAYOUT_PROTOCOL)&&(cfg.authentication.kind==='none'||typeof env[cfg.authentication.name]==='string'&&env[cfg.authentication.name].length>0));}catch{/* Unconfigured remains unavailable; no claim or effects. */}return {executionAllowed:options.executionAllowed&&options.prelayoutExecutionAllowed,configured,semanticApproval:false,humanApproval:false,customerApproval:false};};
 async function sources(request){
  check();const capture=await reader.capture(request);check();if(capture.kind==='rejected')return {kind:'awaiting_sources',diagnostic:capture};
  const native=await reader.assertCurrent(capture.token),mapped=await mapNativeSources(native);need(mapped.kind==='mapped','PRELAYOUT_FIVE_SOURCES_REQUIRED');const method=await directorMethod();let policy;
  const admitted=await store.withReadAdmission(request.projectId,{readAttempts:1,snapshotBytes:64*1024*1024,decodedBytes:128*1024*1024,storedBytes:128*1024*1024},()=>{check();assertStoreReadAdmission(store,request.projectId);const p=store.read(request.projectId);need(prelayoutHash(p)===native.identity.snapshotHash,'PRELAYOUT_SOURCE_CHANGED');policy=structuredClone(p.policies.at(-1));return policy;});
  need(admitted.kind==='complete'&&policy&&admitted.value===policy,'PRELAYOUT_NATIVE_READ_REQUIRED');
  const input=derivePrelayoutBasis({mapped,policy,databaseBindingHash:prelayoutHash(selected),directorMethod:method}),images=[];
  for(const image of input.images){const loaded=await reader.readImage(capture.token,image.imageId);images.push(loaded);}
  const after=await reader.assertCurrent(capture.token);need(equal(native,after)&&equal(method,await directorMethod()),'PRELAYOUT_SOURCE_CHANGED');check();
  return {kind:'qualified_sources',input,mapped,images,native,observedSnapshot:{revision:native.identity.expectedRevision,snapshotHash:native.identity.snapshotHash}};
 }
 const requestNow=(request,p)=>({...request,expectedRevision:p.revision});
 async function currentReport(request){
  const source=await sources(request);if(source.kind!=='qualified_sources')return {kind:'blocked',status:'awaiting_sources',source};
  const p=store.read(request.projectId);need(p.revision===request.expectedRevision,'REVISION_CONFLICT');const pending=prelayoutUnknown(p);if(pending.length)return {kind:'blocked',status:'awaiting_reconciliation',jobIds:pending.map(j=>j.id),source};
  const j=p.jobs.find(j=>j.id===prelayoutJobId(source.input));if(!j?.prelayoutReport)return {kind:'blocked',status:j?.status??(p.jobs.some(j=>j.purpose===PRELAYOUT_PURPOSE&&j.prelayoutReport)?'stale':'awaiting_prelayout'),source};
  let read;try{read=await verifyProposalPrelayoutReportOriginal(p,j,{executionRoot,imageStore});}catch(e){if(e instanceof SyntaxError||['PRELAYOUT_REPORT_INVALID','PRELAYOUT_KNOWN_LIMITATION_DUPLICATED','PRELAYOUT_ISSUE_REFERENCE_INVALID'].includes(e.code))return {kind:'blocked',status:'invalid_report',source};throw e;}need(equal(j.task.prelayoutInput,source.input),'PRELAYOUT_SOURCE_CHANGED');
  const after=await sources(request);need(after.kind==='qualified_sources'&&equal(source.input,after.input)&&equal(source.observedSnapshot,after.observedSnapshot),'PRELAYOUT_SOURCE_CHANGED');
  if(read.report.decision!=='clear')return {kind:'blocked',status:read.report.decision==='return'?'returned':'unresolved',read,source};
  return {kind:'ready',read,source};
 }
 async function saveResponse(p,j,a,receipt){
  need(ordinarySuccess(receipt),'PRELAYOUT_ORIGINAL_RECEIPT_REQUIRED');const folder=join(executionRoot,a.id);await mkdir(folder,{recursive:true});
  for(const [name,bytes] of [['receipt.json',JSON.stringify(receipt)],['response.txt',receipt.responseText],['director-report.json',receipt.responseText]])await retain(executionRoot,join(folder,name),bytes);
  check();p=store.read(p.id);j=p.jobs.find(x=>x.id===j.id);a=j.attempts[0];
  if(!a.receipt){store.command(p.id,{kind:'anchor-proposal-prelayout',jobId:j.id,attemptId:a.id,receipt,commandId:'prelayout-anchor-'+a.id,expectedRevision:p.revision},a.executor);p=store.read(p.id);j=p.jobs.find(x=>x.id===j.id);a=j.attempts[0];}
  let sourceFailure;try{const current=await sources(requestNow(j.task.nativeRequest,store.read(p.id)));need(current.kind==='qualified_sources'&&equal(current.input,j.task.prelayoutInput),'PRELAYOUT_SOURCE_CHANGED');}catch(e){sourceFailure={code:String(e.code??'PRELAYOUT_ORIGINAL_SOURCE_UNAVAILABLE').slice(0,200)};}
  p=store.read(p.id);j=p.jobs.find(x=>x.id===j.id);a=j.attempts[0];
  if(!j.prelayoutReport)store.command(p.id,{kind:'finish-proposal-prelayout',jobId:j.id,attemptId:a.id,originalText:receipt.responseText,payloadRef:join(folder,'director-report.json'),contentHash:prelayoutHash(receipt.responseText),...(sourceFailure?{sourceFailure}:{}),commandId:'prelayout-finish-'+a.id,expectedRevision:p.revision},a.executor);
  return structuredClone(store.read(p.id).jobs.find(x=>x.id===j.id).prelayoutReport);
 }
 return {
  capability,
  async inspect(request){const r=await currentReport(request);return {kind:r.kind,status:r.kind==='ready'?'clear':r.status,sourceTupleHash:r.source?.input?.sourceTupleHash??null,observedSnapshot:r.source?.observedSnapshot??null,...(r.read?{originalReport:r.read.descriptor,report:r.read.report}:{}),authority:'none',semanticApproval:false,humanApproval:false,customerApproval:false};},
  async captureCheck(request){const r=await currentReport(request);if(r.kind!=='ready')return {kind:'blocked',status:r.status,authority:'none'};const token=Object.freeze({protocol:'proposal-prelayout-current-check-v1',id:randomUUID()});owned.set(token,{request:structuredClone(request),sourceTupleHash:r.source.input.sourceTupleHash,reportHash:r.read.descriptor.sha256});return {kind:'ready',token};},
  async consumeCheck(token){check();const prior=owned.get(token);need(prior,'PRELAYOUT_PRIVATE_TOKEN_REQUIRED');const r=await currentReport(prior.request);need(r.kind==='ready'&&r.source.input.sourceTupleHash===prior.sourceTupleHash&&r.read.descriptor.sha256===prior.reportHash,'PRELAYOUT_CURRENT_CHECK_CHANGED');return {prelayoutCheck:structuredClone(r.read.descriptor),sourceTuple:structuredClone(r.source.input.sourceTuple),baseInputSha256:r.source.input.baseInputSha256,baseProjectionSha256:r.source.input.baseProjectionSha256,observedSnapshot:r.source.observedSnapshot,original:{jobId:r.read.jobId,attemptId:r.read.attemptId,requestHash:r.read.requestHash,receiptHash:r.read.receiptHash},semanticApproval:false,humanApproval:false,customerApproval:false};},
  async prepare(request){
   check();need(request&&equal(Object.keys(request).sort(),['commandId','nativeRequest']),'PRELAYOUT_REQUEST_INVALID');const {commandId,nativeRequest}=request;need(nativeRequest&&typeof nativeRequest.projectId==='string','PRELAYOUT_REQUEST_INVALID');need(safe(commandId),'PRELAYOUT_COMMAND_REQUIRED');const p=store.read(nativeRequest.projectId),prior=p.processedCommands[commandId];
   if(prior){const c=JSON.parse(prior);need(c.kind==='queue-proposal-prelayout'&&equal(c.nativeRequest,nativeRequest),'COMMAND_ID_REUSED');return {jobId:prelayoutJobId(c.input),replayed:true};}
   const cap=capability();need(cap.executionAllowed&&cap.configured,'PRELAYOUT_EXECUTION_DISABLED');const source=await sources(nativeRequest);if(source.kind!=='qualified_sources')return {status:'awaiting_sources',authority:'none'};
   const jobId=prelayoutJobId(source.input);store.command(p.id,{kind:'queue-proposal-prelayout',input:source.input,nativeRequest:structuredClone(nativeRequest),binding:structuredClone(options.binding),commandId,expectedRevision:nativeRequest.expectedRevision},actor());return {jobId,replayed:false};
  },
  async execute(request){
   check();need(request&&equal(Object.keys(request).sort(),['commandId','expectedRevision','jobId','projectId'])&&safe(request.commandId)&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0,'PRELAYOUT_EXECUTION_REQUEST_INVALID');let p=store.read(request.projectId),j=p.jobs.find(j=>j.id===request.jobId);need(j?.purpose===PRELAYOUT_PURPOSE,'PRELAYOUT_JOB_REQUIRED');
   if(j.attempts.length){need(j.attempts[0].executionRequest?.commandId!==request.commandId||equal(j.attempts[0].executionRequest,request),'COMMAND_ID_REUSED');return {status:j.status,attemptId:j.attempts[0].id,report:structuredClone(j.prelayoutReport??null),replayed:true};}
   const cap=capability();need(cap.executionAllowed&&cap.configured,'PRELAYOUT_EXECUTION_DISABLED');need(equal(j.binding,options.binding),'PRELAYOUT_BINDING_CHANGED');need(p.revision===request.expectedRevision,'REVISION_CONFLICT');const source=await sources(requestNow(j.task.nativeRequest,p));need(source.kind==='qualified_sources'&&equal(source.input,j.task.prelayoutInput),'PRELAYOUT_SOURCE_CHANGED');
   assertPrelayoutProviderEnvelope(source.input,source.images,options.provider);
   const id=randomUUID(),owner=actor(),packet=prelayoutRuntimePacket(j,{id}),folder=join(executionRoot,id),req=buildPrelayoutDirectorRequest(j.task.prelayoutInput);await mkdir(folder,{recursive:true});await retain(executionRoot,join(folder,'packet.json'),packet);
   store.command(p.id,{kind:'claim-proposal-prelayout',jobId:j.id,attemptId:id,requestHash:prelayoutHash(req),executionRequest:structuredClone(request),commandId:request.commandId,expectedRevision:p.revision},owner);
   try{const receipt=ordinaryDomainReceipt(j,await invokeOrdinary({executionRoot,provider:options.provider,binding:j.binding,attemptId:id,request:req,images:source.images.map((x,n)=>({...source.input.images[n],path:x.identity.locator})),runtimePacketBytes:packet,maxOutputBytes:1024*1024,persistLocator:async locator=>{check();store.command(p.id,{kind:'anchor-model-http-attempt',jobId:j.id,attemptId:id,locator,commandId:'prelayout-locator-'+id,expectedRevision:store.read(p.id).revision},owner);}}));
    const report=await saveResponse(store.read(p.id),store.read(p.id).jobs.find(x=>x.id===j.id),{id},receipt);return {status:store.read(p.id).jobs.find(x=>x.id===j.id).status,attemptId:id,report};
   }catch(error){p=store.read(p.id);j=p.jobs.find(x=>x.id===j.id);if(j.status==='running')store.command(p.id,{kind:'interrupt-proposal-prelayout',jobId:j.id,attemptId:id,error:{code:error.code??'PRELAYOUT_OUTCOME_UNKNOWN',message:String(error.message??error).slice(0,1500)},commandId:'prelayout-interrupt-'+id,expectedRevision:p.revision},owner);throw error;}
  },
  async reconcileOriginal(request){
   check();need(request&&equal(Object.keys(request).sort(),['attemptId','commandId','expectedRevision','jobId','projectId']),'PRELAYOUT_REQUEST_INVALID');const {projectId,jobId,attemptId,commandId,expectedRevision}=request;need(safe(commandId),'PRELAYOUT_COMMAND_REQUIRED');const p=store.read(projectId),j=p.jobs.find(x=>x.id===jobId),a=j?.attempts?.[0];need(j?.purpose===PRELAYOUT_PURPOSE&&a?.id===attemptId,'PRELAYOUT_ORIGINAL_ATTEMPT_REQUIRED');
   if(j.prelayoutReport)return {report:structuredClone(j.prelayoutReport),replayed:true};need(p.revision===expectedRevision,'REVISION_CONFLICT');need(['running','awaiting_reconciliation'].includes(j.status)&&a.httpAttemptLocator,'PRELAYOUT_ORIGINAL_UNAVAILABLE');
   const originalRequest=buildPrelayoutDirectorRequest(j.task.prelayoutInput),runtimePacketBytes=prelayoutRuntimePacket(j,a),images=a.receipt?.images?structuredClone(a.receipt.images):[];
   if(!a.receipt)for(const image of originalRequest.images)images.push((await imageStore.read({projectId,imageId:image.imageId,expectedHash:image.sha256})).descriptor);
   const raw=await reopenOrdinary({executionRoot,binding:j.binding,attemptId:a.id,request:originalRequest,images,runtimePacketBytes,...(a.receipt?{receipt:a.receipt}:{attemptLocator:a.httpAttemptLocator})});
   // Restore derived domain wrappers only after the immutable HTTP original proves these exact packet/response bytes.
   const folder=join(executionRoot,a.id);await mkdir(folder,{recursive:true});await retain(executionRoot,join(folder,'packet.json'),runtimePacketBytes);const receipt=ordinaryDomainReceipt(j,raw);return {report:await saveResponse(p,j,a,receipt),replayed:false};
  },
  close(){closed=true;reader.close();}
 };
}
