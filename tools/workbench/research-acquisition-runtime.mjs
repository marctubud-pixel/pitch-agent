import {invokeOrdinary,reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {isDeepStrictEqual as equal} from 'node:util';
import {createIntakeDocumentStore} from './intake-document-store.mjs';
import {createLocalPdfExtractor,PDF_LIMITS} from './intake-pdf.mjs';
import {capturePublicSource,httpsTransport} from './source-acquisition.mjs';
import {readManagedCapture} from './source-capture-store.mjs';
import {discoverResearch,researchSearchIdentity,verifyResearchDiscovery,retainResearchResponse} from './research-search.mjs';
import {acquisitionRoot,materialSource,createAcquisitionReadBudget,acquisitionOriginalBounds,saveAcquisitionManifest,saveAcquisitionToolOriginal,loadAcquisitionToolOriginal,verifyAcquisitionGeneration,verifyAcquisitionMaterials,verifyAcquisitionCapture} from './research-acquisition-original.mjs';
import {ACQUISITION_PROTOCOL,ACQUISITION_BRANCHES,acquisitionInput,ACQUISITION_PURPOSES,acquisitionHash as hash,acquisitionNeed as need,validateAcquisitionConfiguration,freezeAcquisition,acquisitionCurrent,resolveAcquisition,validateAcquisitionPlan,acquisitionPlanRequest,toolIdentity,acquisitionAdmission,acquisitionReference,acquisitionToolReservation} from './research-acquisition.mjs';
const context=()=>({actorType:'agent',actorId:'research-acquisition-runtime',runId:randomUUID(),contextId:randomUUID(),executorHost:hostname(),executorPid:process.pid});
export function createResearchAcquisitionRuntime({store,root,providers,bindings,searchProviders={},configuration=null,intake,intakeConfiguration=null,acquisitionDependencies={},caseCatalogue,enqueueProducer}){
 if(configuration)validateAcquisitionConfiguration(configuration);
 const pdfConfiguration=intakeConfiguration?{...intakeConfiguration,limits:{...intakeConfiguration.limits,textBytes:Math.min(intakeConfiguration.limits?.textBytes??PDF_LIMITS.textBytes,configuration?.limits?.extractionBytes??32768)}}:null;
 const pdf=createLocalPdfExtractor(pdfConfiguration),pdfAdapter=acquisitionDependencies.researchPdfExtractor??pdf;
 const now=()=>new Date().toISOString();
 const send=(projectId,c,ctx=context())=>store.command(projectId,{...c,commandId:randomUUID(),expectedRevision:store.read(projectId).revision},{...ctx,now:now()});
 const generation=(p,id)=>(p.researchAcquisitions??[]).find(g=>g.envelope.id===id)??(!id?(p.researchAcquisitions??[]).at(-1):null);
 const live=g=>{need(configuration&&equal(g.envelope.configuration,configuration),'ACQUISITION_CONFIGURATION_CHANGED','New authority requires frozen-compatible live acquisition configuration');const c=searchProviders[configuration.searchProviderId];need(c&&equal(g.envelope.searchIdentity,researchSearchIdentity(configuration.searchProviderId,c)),'ACQUISITION_CONFIGURATION_CHANGED','Search provider configuration changed');need(equal(bindings.research_planner,g.envelope.plannerBinding)&&equal(bindings.research,g.envelope.producerBinding),'ACQUISITION_CONFIGURATION_CHANGED','Planner or research producer binding changed');};
 const check=(p,g)=>{acquisitionCurrent(p,g);live(g);};
 const extractorCurrent=async g=>{if(g.branches.some(b=>b.tools.some(t=>t.outcome?.pdfOriginal))){const current=await pdfAdapter.capability();need(current.available&&equal(current.identity,g.envelope.extractorIdentity.identity)&&equal(current.limits,g.envelope.extractorIdentity.limits),'ACQUISITION_CONFIGURATION_CHANGED','Actual PDF extractor identity or limits changed');}};
 const fileStore=g=>createIntakeDocumentStore(acquisitionRoot(root,g.envelope.id));
 const remaining=e=>Math.max(1,Math.min(e.limits.timeoutMs,Date.parse(e.deadline)-Date.now()));
 const limits=e=>({...e.limits,timeoutMs:remaining(e)});
 async function knownTool(projectId,jobId,attemptId,ctx,g,branch,kind,argument,effect){
  const key=toolIdentity(g,branch.kind,kind,argument),prior=branch.tools.find(t=>t.key===key);if(prior){need(prior.state==='completed','ACQUISITION_OUTCOME_UNKNOWN','Dispatched tool cannot automatically repeat');return prior.outcome;}
  const reservation=acquisitionToolReservation(g.envelope,kind);
  send(projectId,{kind:'research-acquisition-tool-claim',generationId:g.envelope.id,jobId,attemptId,tool:{key,kind,argument,reservation}},ctx);
  const result=await effect();
  result.original=await fileStore(g).putResult(result.outcome);
  await saveAcquisitionToolOriginal(acquisitionRoot(root,g.envelope.id),key,{generationId:g.envelope.id,jobId,attemptId,key,kind,argument,...result});
  send(projectId,{kind:'research-acquisition-tool-result',generationId:g.envelope.id,jobId,attemptId,toolKey:key,...result},ctx);return result.outcome;
 }
 async function capture(g,url,edgeIds){
  const files=fileStore(g),base=acquisitionRoot(root,g.envelope.id);let saved,pdfOriginal=null,extractionIdentity=null;const responseOriginals=[];const transport=async request=>{const response=await (acquisitionDependencies.transport??httpsTransport)(request);responseOriginals.push(await retainResearchResponse(files,request,response));return response;};
  try{
   const extractor=async(bytes,{signal})=>{const extracted=await pdfAdapter.extract(bytes,{signal});need(Buffer.byteLength(extracted.text)<=g.envelope.limits.extractionBytes,'ACQUISITION_EXTRACTION_LIMIT','PDF complete text exceeds branch extraction cap');need(equal(extracted.limits,g.envelope.extractorIdentity.limits),'ACQUISITION_CONFIGURATION_CHANGED','PDF extractor bounds changed');extractionIdentity=extracted.identity;pdfOriginal=await files.putResult(extracted);return {method:'retained-pdf-extraction-v1',text:extracted.text,locators:extracted.pages.map(p=>({page:p.number,start:p.textStartUtf16,end:p.textEndUtf16}))};};
   saved=await capturePublicSource({url,storeRoot:join(base,'captures'),limits:{maxBytes:g.envelope.limits.captureBytes,timeoutMs:remaining(g.envelope),maxRedirects:0}},{...acquisitionDependencies,transport,pdfExtractor:g.envelope.extractorIdentity.available?extractor:undefined});
   const c=await readManagedCapture(join(base,'captures'),saved),r=c.record,e=r.extraction;
   let status='available',reason=null,source=null;
   if(r.httpStatus<200||r.httpStatus>=300)status='unavailable',reason=`HTTP_${r.httpStatus}`;
   else if(!e.text)status='unsupported',reason=e.reason??'No extracted text; scanned PDF and image interpretation unavailable';
   else if(Buffer.byteLength(e.text)>g.envelope.limits.extractionBytes||e.text.length>20000)status='limit_exceeded',reason='Complete extraction exceeds finite text cap; no truncation';
   else {
    const identity=r.mimeType==='application/pdf'?extractionIdentity:{adapter:e.method,charset:e.charset};
    source={id:`acquired-${hash([r.raw.sha256,identity,e.textHash,e.locator])}`,url:r.finalUrl,text:e.text,scopeRelation:'background',verification:'captured',reason:'Literal captured background only. Semantic scope, publisher authority, facts and consumer preferences require independent review.',scopeAssessment:{purpose:'unknown',object:'unknown',scenario:'unknown',time:'unknown',users:'unknown',materialType:{state:'known',mimeType:r.mimeType,captureRecordHash:c.recordHash},reason:'Only MIME is a parser fact. Literal query matches do not establish semantic scope.'},provenance:{kind:'research_acquisition_capture',generationId:g.envelope.id,captureRecordHash:c.recordHash,rawSha256:r.raw.sha256,textHash:e.textHash,extractionIdentity:identity,locator:e.locator,discoveryEdgeIds:edgeIds}};
   }
   const outcome={status,reason,requestedUrl:url,discoveryEdgeIds:edgeIds,capture:{recordHash:c.recordHash},mimeType:r.mimeType,pdfOriginal,extractionIdentity,responseOriginals,source};
   if(status!=='limit_exceeded')await verifyAcquisitionCapture(base,outcome,g.envelope);
   return {outcome,original:await files.putResult(outcome)};
  }catch(error){
   const outcome={status:'unavailable',reason:error.code??'CAPTURE_FAILED',requestedUrl:url,discoveryEdgeIds:edgeIds,capture:saved?{recordHash:saved.recordHash}:null,pdfOriginal,extractionIdentity,responseOriginals,source:null};
   return {outcome,original:await files.putResult(outcome)};
  }
 }
 const runtime={
  capability(){return {protocolVersion:ACQUISITION_PROTOCOL,configured:!!configuration,available:!!configuration&&!!searchProviders[configuration.searchProviderId]&&!!bindings.research_planner&&providers[bindings.research_planner.providerId]?.model===bindings.research_planner.model&&!!bindings.research&&providers[bindings.research.providerId]?.model===bindings.research.model,branchKinds:ACQUISITION_BRANCHES,reason:'Bounded discovery and capture only. Source authenticity and research adequacy are unverified.'};},
  status(projectId,generationId){const p=store.read(projectId),g=generation(p,generationId);if(!g)return {protocolVersion:'research-acquisition-status-v1',state:'not_started',capability:runtime.capability(),queuedJobIds:[]};let blocker=null;try{check(p,g);}catch(e){blocker=e.code;}const jobs=p.jobs.filter(j=>j.task?.generationId===g.envelope.id),running=jobs.filter(j=>j.purpose==='research_acquisition_branch'&&j.status==='running').length,eligible=jobs.filter(j=>j.status==='queued'&&j.purpose!=='research_acquisition_branch').concat(jobs.filter(j=>j.status==='queued'&&j.purpose==='research_acquisition_branch').slice(0,Math.max(0,g.envelope.limits.maxParallelBranches-running))),producer=p.jobs.find(j=>j.id===`job-${hash(JSON.stringify([projectId,`${g.envelope.id}:producer`]))}`);return {protocolVersion:'research-acquisition-status-v1',generationId:g.envelope.id,state:blocker?'blocked':jobs.some(j=>j.status==='awaiting_reconciliation')?'awaiting_reconciliation':jobs.some(j=>j.status==='blocked')?'blocked':g.state,envelopeHash:g.envelope.envelopeHash,planHash:g.plan?.planHash??null,catalogueHash:g.admission?.catalogueHash??null,deadline:g.envelope.deadline,branches:g.branches.map(b=>({kind:b.kind,status:b.result?.coverage.status??(b.tools.some(t=>t.state==='dispatched')?'awaiting_reconciliation':'pending'),coverage:b.result?.coverage??null,allocation:b.allocation,reserved:Object.fromEntries(Object.keys(b.allocation).map(k=>[k,b.tools.reduce((n,t)=>n+t.reservation[k],0)])),remaining:Object.fromEntries(Object.keys(b.allocation).map(k=>[k,b.allocation[k]-b.tools.reduce((n,t)=>n+t.reservation[k],0)]))})),blockers:[...(blocker?[blocker]:[]),...jobs.filter(j=>['blocked','awaiting_reconciliation','cancelled'].includes(j.status)).map(j=>j.error?.code??j.status)],queuedJobIds:(g.cancellation?[]:eligible.map(j=>j.id)).concat(producer?.status==='queued'?[producer.id]:[]),producerJobId:producer?.id??null,producerStatus:producer?.status??null,coverage:g.admission?.coverage??[],limitations:g.admission?.limitations??[],reconciliation:jobs.filter(j=>j.status==='awaiting_reconciliation').map(j=>({jobId:j.id,attemptId:j.attemptId,unknownTools:g.branches.find(b=>b.kind===j.task.branchKind)?.tools.filter(t=>t.state==='dispatched').map(t=>t.key)??[]}))};},
  async continue(projectId,request){
   let p=store.read(projectId),prior=(p.researchAcquisitions??[]).find(g=>g.envelope.request.commandId===request.commandId);
   if(prior){need(equal(prior.envelope.request,request),'COMMAND_ID_REUSED','Acquisition request identity belongs to another payload');return runtime.advance(projectId);}
   need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Project changed');need(runtime.capability().available,'ACQUISITION_UNAVAILABLE','Configure acquisition search, planner and producer providers explicitly');
   acquisitionInput(p,request);await intake.verifyCard(projectId);
   const materialSources=[];for(const id of request.materialIds??[]){const m=await intake.checkedDocument(projectId,id),s=materialSource(m.document,m.extraction,projectId);if(s)materialSources.push(s);}
   const extractorIdentity=await pdfAdapter.capability();
   const envelope=freezeAcquisition(p,request,{configuration,searchIdentity:researchSearchIdentity(configuration.searchProviderId,searchProviders[configuration.searchProviderId]),plannerBinding:bindings.research_planner,producerBinding:bindings.research,extractorIdentity,caseSources:caseCatalogue(p),materialSources,now:now()});
   await verifyAcquisitionMaterials(p,envelope,{executionRoot:root});const envelopeOriginal=await createIntakeDocumentStore(acquisitionRoot(root,envelope.id)).putResult(envelope);
   store.command(projectId,{kind:'research-acquisition-request',envelope,envelopeOriginal,commandId:request.commandId,expectedRevision:request.expectedRevision},{...context(),now:now()});return runtime.status(projectId);
  },
  async advance(projectId){
   let p=store.read(projectId),g=generation(p);if(!g)return runtime.status(projectId);
   const jobs=p.jobs.filter(j=>j.task?.generationId===g.envelope.id);
   if(g.cancellation||jobs.some(j=>j.status==='cancelled')){return {...runtime.status(projectId),state:'cancelled',queuedJobIds:[]};}
   if(!g.plan||!g.branches.every(b=>b.result)||g.branches.some(b=>b.tools.some(t=>t.state!=='completed')))return runtime.status(projectId);
   check(p,g);await extractorCurrent(g);
   if(!g.admission){
    const revision=p.revision,identity=hash({envelope:g.envelope,plan:g.plan,branches:g.branches});
    await verifyAcquisitionGeneration(p,g,{executionRoot:root,requireManifest:false});const admission=acquisitionAdmission(g),manifest=await saveAcquisitionManifest(acquisitionRoot(root,g.envelope.id),{identity,admission});
    check(store.read(projectId),g);store.command(projectId,{kind:'research-acquisition-seal',generationId:g.envelope.id,admission,manifest,identity,commandId:`${g.envelope.id}:seal`,expectedRevision:revision},{...context(),now:now()});
   }
   p=store.read(projectId);g=generation(p);check(p,g);await verifyAcquisitionGeneration(p,g,{executionRoot:root});
   if(!p.jobs.some(j=>j.id===`job-${hash(JSON.stringify([projectId,`${g.envelope.id}:producer`]))}`))await enqueueProducer(projectId,acquisitionReference(g),`${g.envelope.id}:producer`,p.revision);
   return runtime.status(projectId);
  },
  async execute(projectId,jobId,{retry=false,admission}={}){
   let p=store.read(projectId),job=p.jobs.find(j=>j.id===jobId),g=generation(p,job?.task.generationId);need(g&&ACQUISITION_PURPOSES.includes(job?.purpose),'INVALID_JOB','Acquisition job required');need(!retry,'UNSAFE_RETRY','Acquisition dispatch never automatically repeats');if(job.status!=='queued')return job;
   const ctx=context(),attemptId=ctx.runId;
   try{
    check(p,g);await verifyAcquisitionMaterials(p,g.envelope,{executionRoot:root});
    if(admission)store.command(projectId,{kind:'research-acquisition-start',generationId:g.envelope.id,jobId,attemptId,httpRequestId:admission.requestId,commandId:`acquisition-job-start-${hash([projectId,admission.requestId,jobId])}`,expectedRevision:admission.expectedRevision},{...ctx,now:now()});else send(projectId,{kind:'research-acquisition-start',generationId:g.envelope.id,jobId,attemptId},ctx);
    if(job.purpose==='research_acquisition_plan'){
     const request=acquisitionPlanRequest(g.envelope),files=fileStore(g),original=await files.putResult({projectId,jobId,attemptId,binding:job.binding,request});
     send(projectId,{kind:'research-acquisition-plan-dispatch',generationId:g.envelope.id,jobId,attemptId,original},ctx);
     const provider=providers[job.binding.providerId];need(provider?.model===job.binding.model,'ACQUISITION_PROVIDER_MISSING','Frozen planner provider unavailable');
     const controller=new AbortController(),duration=Math.max(1,Date.parse(g.envelope.deadline)-Date.now()),timer=setTimeout(()=>controller.abort(),duration);let abort;
     const invocation=Promise.resolve().then(()=>invokeOrdinary({executionRoot:root,provider,binding:job.binding,attemptId,request,runtimePacketBytes:Buffer.from(JSON.stringify({projectId,jobId,attemptId,binding:job.binding,request})),persistLocator:locator=>send(projectId,{kind:'anchor-model-http-attempt',jobId,attemptId,locator},ctx),timeoutMs:duration,maxOutputBytes:g.envelope.limits.planOutputBytes,signal:controller.signal})).then(async result=>{need(typeof result.responseText==='string'&&Buffer.byteLength(result.responseText)<=g.envelope.limits.planOutputBytes,'ACQUISITION_PLAN_LIMIT','Planner response exceeds finite envelope');const saved=await files.putResult(result);await saveAcquisitionToolOriginal(acquisitionRoot(root,g.envelope.id),hash(['plan-result',g.envelope.id,attemptId]),{generationId:g.envelope.id,jobId,attemptId,original:saved});return {result,saved};});
     let completed;try{completed=await Promise.race([invocation,new Promise((_,reject)=>{abort=()=>reject(Object.assign(new Error('Planner deadline expired; dispatched outcome remains unknown'),{code:'ACQUISITION_DEADLINE'}));controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();})]);}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);}
     const {result,saved}=completed;send(projectId,{kind:'research-acquisition-plan-result',generationId:g.envelope.id,jobId,attemptId,original:saved},ctx);
     const plan=validateAcquisitionPlan(JSON.parse(result.responseText),g.envelope);
     const snapshot=store.read(projectId),registered=generation(snapshot,g.envelope.id),attempt=snapshot.jobs.find(j=>j.id===jobId).attempts.at(-1),proof={...registered,plan:{value:plan,planHash:hash(plan),requestOriginal:attempt.requestOriginal,resultOriginal:attempt.resultOriginal}};
     await verifyAcquisitionGeneration(snapshot,proof,{executionRoot:root,requireManifest:false});
     store.command(projectId,{kind:'research-acquisition-plan-complete',generationId:g.envelope.id,jobId,attemptId,plan,commandId:randomUUID(),expectedRevision:snapshot.revision},{...ctx,now:now()});
    }else {
     const plan=g.plan.value.branches.find(b=>b.kind===job.task.branchKind),branch=g.branches.find(b=>b.kind===plan.kind),files=fileStore(g),gaps=[];
     if(plan.applicability==='active'){
      for(const [index,query]of plan.queries.entries()){
       if(generation(store.read(projectId),g.envelope.id).cancellation){gaps.push('Cancelled before undispatched query');break;}
       if(Date.now()>=Date.parse(g.envelope.deadline)){gaps.push('Persisted deadline exhausted before undispatched query');break;}
       await knownTool(projectId,jobId,attemptId,ctx,g,branch,'search',{index,query},async()=>{
        try{return await discoverResearch({query,storeRoot:join(acquisitionRoot(root,g.envelope.id),'search'),identity:g.envelope.searchIdentity,limits:limits(g.envelope)},acquisitionDependencies);}catch(error){const outcome={status:'unavailable',reason:error.code??'SEARCH_FAILED',query,identity:g.envelope.searchIdentity,limits:limits(g.envelope),capture:null,legacyAttempt:null,edges:[],window:{considered:0,unexamined:'Unavailable response',maxItems:50},parserIdentity:g.envelope.searchIdentity.adapterVersion};return {outcome,original:await files.putResult(outcome)};}
       });
       p=store.read(projectId);g=generation(p,g.envelope.id);
      }
      const edges=g.branches.find(b=>b.kind===branch.kind).tools.filter(t=>t.kind==='search').flatMap(t=>t.outcome?.edges??[]),urls=new Map();
      for(const edge of edges)if(edge.status==='selected'&&edge.canonicalUrl&&!urls.has(edge.canonicalUrl))urls.set(edge.canonicalUrl,[]);
      for(const edge of edges)if(urls.has(edge.canonicalUrl))urls.get(edge.canonicalUrl).push(edge.id);
      for(const [url,edgeIds]of urls){
       p=store.read(projectId);g=generation(p,g.envelope.id);const current=g.branches.find(b=>b.kind===branch.kind);
       if(generation(store.read(projectId),g.envelope.id).cancellation){gaps.push('Cancelled before undispatched query');break;}
       if(g.cancellation){gaps.push('Cancelled before undispatched capture');break;}
       if(Date.now()>=Date.parse(g.envelope.deadline)){gaps.push('Persisted deadline exhausted; remaining destinations unattempted');break;}
       try{await knownTool(projectId,jobId,attemptId,ctx,g,current,'capture',{url,edgeIds},()=>capture(g,url,edgeIds));}catch(error){if(error.code==='ACQUISITION_BUDGET'){gaps.push('Fixed branch capture, PDF, byte or extraction allowance exhausted; remaining destinations unattempted');break;}throw error;}
      }
     }else gaps.push(plan.reason);
     p=store.read(projectId);g=generation(p,g.envelope.id);const current=g.branches.find(b=>b.kind===branch.kind),available=current.tools.filter(t=>t.kind==='capture'&&t.outcome.source),result={coverage:{branchKind:branch.kind,status:plan.applicability!=='active'?plan.applicability:available.length?'partial':'empty',usableExcerpts:available.length,independentOrigins:new Set(available.map(t=>new URL(t.outcome.source.url).origin)).size,gaps,scope:g.envelope.scope,semanticApplicability:'unknown',unexaminedResults:'Parser and response byte windows are finite; search snippets are not source evidence'}};
     send(projectId,{kind:'research-acquisition-branch-complete',generationId:g.envelope.id,jobId,attemptId,result},ctx);
    }
   }catch(error){
    const current=store.read(projectId).jobs.find(j=>j.id===jobId);
    let failureOriginal=null;if(error.receipt)failureOriginal=await fileStore(g).putResult({error:{code:error.code??'ACQUISITION_FAILED'},receipt:error.receipt});
    if(['running','awaiting_reconciliation'].includes(current.status))send(projectId,{kind:'research-acquisition-fail',generationId:g.envelope.id,jobId,attemptId,error:{code:error.code??'ACQUISITION_FAILED',message:String(error.message).slice(0,512)},...(failureOriginal?{failureOriginal}:{})},ctx);
    else if(current.status==='queued'&&error.code!=='ACQUISITION_CONCURRENCY')send(projectId,{kind:'block-queued-job',jobId,error:{code:error.code??'ACQUISITION_FAILED',message:String(error.message).slice(0,512)},...(failureOriginal?{failureOriginal}:{})},ctx);
   }
   return store.read(projectId).jobs.find(j=>j.id===jobId);
  },
  async reconcile(projectId,jobId,request){
   let p=store.read(projectId),job=p.jobs.find(j=>j.id===jobId),g=generation(p,job?.task.generationId),attempt=job?.attempts.at(-1);const prior=request?.commandId&&Object.hasOwn(p.processedCommands,request.commandId)?p.processedCommands[request.commandId]:null;if(prior){const saved=JSON.parse(prior);need(saved.request&&equal(saved.request,request)&&saved.jobId===jobId,'COMMAND_ID_REUSED','Reconciliation ID belongs to another payload');return job;}need(g&&job.status==='awaiting_reconciliation','INVALID_JOB','Unresolved acquisition attempt required');acquisitionOriginalBounds(g);const readBudget=createAcquisitionReadBudget();let stale=null;try{check(p,g);}catch(error){stale=error;}need(request&&p.revision===request.expectedRevision,'REVISION_CONFLICT','Project changed before original reconciliation');
   if(job.purpose==='research_acquisition_plan'){
    if(!attempt.resultOriginal&&attempt.httpAttemptLocator){const expected=acquisitionPlanRequest(g.envelope),originalRequest=await fileStore(g).readResult(attempt.requestOriginal);need(equal(originalRequest,{projectId,jobId,attemptId:attempt.id,binding:job.binding,request:expected}),'ACQUISITION_ORIGINAL_INVALID','Frozen planner request changed');const result=await reopenOrdinary({executionRoot:root,binding:job.binding,attemptId:attempt.id,request:expected,runtimePacketBytes:Buffer.from(JSON.stringify(originalRequest)),attemptLocator:attempt.httpAttemptLocator});need(Buffer.byteLength(result.responseText)<=g.envelope.limits.planOutputBytes,'ACQUISITION_PLAN_LIMIT','Saved planner response exceeds frozen envelope');const original=await fileStore(g).putResult(result);await saveAcquisitionToolOriginal(acquisitionRoot(root,g.envelope.id),hash(['plan-result',g.envelope.id,attempt.id]),{generationId:g.envelope.id,jobId,attemptId:attempt.id,original});}
    if(!attempt.resultOriginal){const saved=await loadAcquisitionToolOriginal(acquisitionRoot(root,g.envelope.id),hash(['plan-result',g.envelope.id,attempt.id]));need(saved&&saved.generationId===g.envelope.id&&saved.jobId===job.id&&saved.attemptId===attempt.id,'ACQUISITION_OUTCOME_UNKNOWN','No exact saved planner response. Do not redispatch');send(projectId,{kind:'research-acquisition-plan-result',generationId:g.envelope.id,jobId,attemptId:attempt.id,original:saved.original,recover:true});p=store.read(projectId);job=p.jobs.find(j=>j.id===jobId);g=generation(p,g.envelope.id);attempt=job.attempts.at(-1);}
    const result=await fileStore(g).readResult(attempt.resultOriginal),plan=validateAcquisitionPlan(JSON.parse(result.responseText),g.envelope);
    const proof={...g,plan:{value:plan,planHash:hash(plan),requestOriginal:attempt.requestOriginal,resultOriginal:attempt.resultOriginal}};await verifyAcquisitionGeneration(p,proof,{executionRoot:root,historical:!!stale,requireManifest:false});if(stale){send(projectId,{kind:'research-acquisition-fail',generationId:g.envelope.id,jobId,attemptId:attempt.id,error:{code:stale.code,message:stale.message},recover:true});return store.read(projectId).jobs.find(j=>j.id===jobId);}store.command(projectId,{kind:'research-acquisition-plan-complete',generationId:g.envelope.id,jobId,attemptId:attempt.id,plan,recover:true,request,commandId:request.commandId,expectedRevision:p.revision},{...context(),now:now()});
   }else {
    const branch=g.branches.find(b=>b.kind===job.task.branchKind);for(const t of branch.tools.filter(t=>t.state==='dispatched')){
     const receipt=await loadAcquisitionToolOriginal(acquisitionRoot(root,g.envelope.id),t.key);need(receipt&&receipt.key===t.key&&receipt.generationId===g.envelope.id&&receipt.jobId===job.id&&receipt.attemptId===attempt.id&&equal(receipt.argument,t.argument)&&receipt.kind===t.kind,'ACQUISITION_OUTCOME_UNKNOWN','No exact saved original. Do not repeat dispatched search or capture');
     const original=await fileStore(g).readResult(receipt.original);need(equal(original,receipt.outcome),'ACQUISITION_ORIGINAL_INVALID','Saved outcome changed');if(t.kind==='search')await verifyResearchDiscovery(join(acquisitionRoot(root,g.envelope.id),'search'),original,{readBudget});else await verifyAcquisitionCapture(acquisitionRoot(root,g.envelope.id),original,g.envelope,{readBudget});
     send(projectId,{kind:'research-acquisition-tool-result',generationId:g.envelope.id,jobId,attemptId:attempt.id,toolKey:t.key,original:receipt.original,outcome:original,recover:true});
    }
    const recoveredBranch=generation(store.read(projectId),g.envelope.id).branches.find(b=>b.kind===branch.kind);
    need(recoveredBranch.tools.every(t=>t.state==='completed'),'ACQUISITION_OUTCOME_UNKNOWN','Exact tool originals remain unknown');
    if(stale){send(projectId,{kind:'research-acquisition-fail',generationId:g.envelope.id,jobId,attemptId:attempt.id,error:{code:stale.code,message:stale.message},recover:true});return store.read(projectId).jobs.find(j=>j.id===jobId);}
    const result={coverage:{branchKind:branch.kind,status:'partial',usableExcerpts:recoveredBranch.tools.filter(t=>t.outcome?.source).length,independentOrigins:0,gaps:['Interrupted branch closed from exact saved originals only. Undispatched planned tools remain unattempted.'],scope:g.envelope.scope,semanticApplicability:'unknown'}};
    store.command(projectId,{kind:'research-acquisition-branch-complete',generationId:g.envelope.id,jobId,attemptId:attempt.id,result,recover:true,request,commandId:request.commandId,expectedRevision:store.read(projectId).revision},{...context(),now:now()});
   }
   await runtime.advance(projectId);return store.read(projectId).jobs.find(j=>j.id===jobId);
  },
  cancel(projectId,request,humanContext){need(request&&Object.keys(request).every(k=>['generationId','commandId','expectedRevision','reason'].includes(k))&&typeof request.reason==='string'&&request.reason.trim()&&request.reason.length<=2000,'INVALID_REQUEST','Exact cancellation with reason required');const p=store.read(projectId),prior=Object.hasOwn(p.processedCommands,request.commandId)?p.processedCommands[request.commandId]:null;if(prior){const saved=JSON.parse(prior);need(saved.kind==='research-acquisition-cancel'&&equal(saved.request,request),'COMMAND_ID_REUSED','Cancellation ID belongs to another payload');return runtime.status(projectId);}store.command(projectId,{kind:'research-acquisition-cancel',request,commandId:request.commandId,expectedRevision:request.expectedRevision},humanContext);return runtime.status(projectId);},
  async verifyProducer(projectId,ref,{historical=false}={}){const p=store.read(projectId),g=resolveAcquisition(p,ref,{historical});if(!historical){check(p,g);await extractorCurrent(g);}return verifyAcquisitionGeneration(p,g,{executionRoot:root,historical});}
 };
 return runtime;
}
