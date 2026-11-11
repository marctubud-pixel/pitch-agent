import {isDeepStrictEqual as equal} from 'node:util';
import {resolve,dirname} from 'node:path';
import {LAYOUT_PURPOSE,LAYOUT_STYLES,layoutJobInput,layoutHash,unresolvedLayoutJobs} from './layout-boundary.mjs';
import {verifyNativeAnchorProjection} from './layout-native-proof.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {inspectImage,IMAGE_LIMITS} from './image-evidence.mjs';

const present=value=>({state:'present',value});
const flags={executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false};
const need=(ok,code,message)=>{if(!ok)throw Object.assign(Error(message),{code});};
const LIMITS=Object.freeze({milliseconds:600000,images:512,imageReadBytes:4*1024**3,nativeProofReadUpperBoundPerEdition:6*1024**3});

function capture(p,rootId) {
  const root=p.jobs.find(j=>j.id===rootId&&j.purpose===LAYOUT_PURPOSE&&j.task.binding);
  need(root&&root===p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task.binding).at(-1),'FINAL_NATIVE_ROOT_REQUIRED','Latest registered native layout root required');
  need(unresolvedLayoutJobs(p).length===0,'FINAL_NATIVE_UNKNOWN','Original unresolved native attempts remain');
  const binding=root.task.binding,input=layoutJobInput(p,root);
  need(layoutHash(binding)===root.task.bindingHash&&binding.projectId===p.id&&binding.taskCardId===p.activeTaskCardId&&equal(binding.policy,p.policies.at(-1)),'FINAL_NATIVE_BINDING_CHANGED','Exact current task and layout binding required');
  const tuple=LAYOUT_STYLES.map(style=>{
    const jobs=p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task.bindingHash===root.task.bindingHash&&j.task.style===style);
    need(jobs.length===1,'FINAL_NATIVE_TUPLE_REQUIRED','Exactly one original native job per style required');
    const job=jobs[0],attempt=job.attempts?.[0];
    need(job.status==='succeeded'&&job.attempts.length===1&&attempt.status==='succeeded'&&attempt.worker&&equal(job.receipt,attempt.receipt),'FINAL_NATIVE_RECEIPT_CHANGED','Exact successful job and attempt receipts required');
    return {job,attempt};
  });
  const identity=layoutHash({projectId:p.id,taskCardId:p.activeTaskCardId,policy:p.policies.at(-1),contentArtifactId:p.activeByStage.content_review,rootId:root.id,bindingHash:root.task.bindingHash,input,tuple:tuple.map(({job,attempt})=>({jobId:job.id,style:job.task.style,attemptId:attempt.id,directory:attempt.directory,worker:attempt.worker,receipt:job.receipt}))});
  return {root,binding,input,tuple,identity};
}

function placementFacts(manifest,attemptId,manifestHash) {
  const slides=manifest.slides,placements=manifest.placements;
  need(Array.isArray(slides)&&Array.isArray(placements)&&new Set(slides.map(s=>s.id)).size===slides.length,'FINAL_NATIVE_PLACEMENTS_CHANGED','Complete distinct original slides and placement rows required');
  const flattened=slides.flatMap(s=>{
    need(Array.isArray(s.elements),'FINAL_NATIVE_PLACEMENTS_CHANGED','Original slide element array required');
    return s.elements.filter(e=>e.contentRefs).map(e=>({intentId:s.originId,slideId:s.id,elementId:e.id,occurrenceId:e.occurrenceId,...e.contentRefs}));
  });
  need(equal(placements,flattened)&&new Set(placements.map(p=>p.occurrenceId)).size===placements.length,'FINAL_NATIVE_PLACEMENTS_CHANGED','Every original element occurrence must retain its exact references');
  return placements.map(raw=>{
    const slideIndex=slides.findIndex(s=>s.id===raw.slideId),slide=slides[slideIndex],elementIndex=slide.elements.findIndex(e=>e.id===raw.elementId);
    need(elementIndex>=0&&slide.elements[elementIndex].occurrenceId===raw.occurrenceId,'FINAL_NATIVE_PLACEMENTS_CHANGED','Exact original placement occurrence required');
    return {raw:structuredClone(raw),native:{editionAttemptId:attemptId,layoutManifestSha256:manifestHash,slideIndex,slideId:slide.id,elementIndex,elementId:raw.elementId,occurrenceId:raw.occurrenceId},provenance:[]};
  });
}

export function createFinalEditionReader({store,root,content,pythonBinary}) {
  need(typeof store?.read==='function'&&typeof store?.list==='function'&&typeof content?.verifyLayoutPreparation==='function'&&typeof root==='string'&&typeof pythonBinary==='string','FINAL_NATIVE_READER_DEPENDENCY_REQUIRED','Trusted store, current-content reader, managed root and explicit decoder required');
  return {async read(projectId) {
    const started=Date.now(),retained={editions:[],assetObservations:[]};
    const accounting={imageReads:0,imageReadUpperBoundBytes:0,nativeProofReadUpperBoundBytes:0,physicalIo:'unmeasured',currentContentReadIo:'separate_existing_boundary'};
    let observedRevision=null,initial;
    const time=()=>need(Date.now()-started<=LIMITS.milliseconds,'FINAL_NATIVE_READ_DEADLINE','Final native read exceeded its finite acceptance deadline');
    const current=()=>{
      time();
      const head=store.list().find(p=>p.id===projectId);
      need(head?.revision===observedRevision,'FINAL_NATIVE_PROJECT_CHANGED','Project revision changed during native inspection');
    };
    const inspected=async(file,identity)=>{
      current();
      need(Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=IMAGE_LIMITS.bytes,'FINAL_NATIVE_IMAGE_LIMIT','Original image exceeds decoder byte limit');
      accounting.imageReads++;accounting.imageReadUpperBoundBytes+=file.bytes+1;
      need(accounting.imageReads<=LIMITS.images&&accounting.imageReadUpperBoundBytes<=LIMITS.imageReadBytes,'FINAL_NATIVE_IMAGE_LIMIT','Original image read allowance exceeded');
      const bytes=await readManagedLayoutBytes(root,file.originalPath,file.bytes);current();
      need(bytes.length===file.bytes&&layoutHash(bytes)===file.sha256,'FINAL_NATIVE_IMAGE_CHANGED','Original image bytes no longer match the checked native descriptor');
      let dimensions;
      try {dimensions=await inspectImage(bytes,{pythonBinary});}catch(cause){throw Object.assign(Error('Original native image cannot be fully decoded',{cause}),{code:'FINAL_NATIVE_DECODE_FAILED'});}
      current();
      const measured={identity,originalPath:file.originalPath,sha256:file.sha256,bytes:file.bytes,mediaType:dimensions.mediaType};
      return {file:measured,dimensions:present({width:dimensions.width,height:dimensions.height,boundSha256:file.sha256,boundBytes:file.bytes,evidenceIdentity:`original-decoder-${layoutHash({file:measured,dimensions,pythonBinary})}`})};
    };
    try {
      const p=store.read(projectId);observedRevision=p.revision;
      const chosen=p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task.binding).at(-1);
      need(chosen,'FINAL_NATIVE_ROOT_REQUIRED','No registered native root exists');
      initial=capture(p,chosen.id);current();
      await content.verifyLayoutPreparation(projectId,initial.input);current();
      let assetsResource=null,brandResource=null;
      for(const {job,attempt} of initial.tuple) {
        current();accounting.nativeProofReadUpperBoundBytes+=LIMITS.nativeProofReadUpperBoundPerEdition;
        const expected={bindingHash:initial.root.task.bindingHash,attemptId:attempt.id,style:job.task.style,executionHash:layoutHash(initial.binding.execution),worker:attempt.worker,ledgerHash:initial.binding.ledgerHash,resources:initial.binding.resources};
        const {receipt,projection}=await verifyNativeAnchorProjection(root,attempt.directory,expected);current();
        need(equal(receipt,job.receipt)&&equal(receipt,attempt.receipt),'FINAL_NATIVE_RECEIPT_CHANGED','Saved job and attempt receipts must equal the independently checked native receipt');
        need(projection.ledger.raw===initial.input.ledgerText&&equal(projection.ledger.parsed.source,projection.layoutManifest.parsed.semanticContent.source)&&equal(projection.ledger.parsed.manuscript,projection.layoutManifest.parsed.semanticContent.manuscript),'FINAL_NATIVE_SOURCE_CHANGED','Original literal ledger and semantic source must remain exact');
        const resource={resource:projection.assetsResource.descriptor,contentText:projection.assetsResource.contentText,parsed:projection.assetsResource.parsed};
        const brand={resource:projection.brandResource.descriptor,contentText:projection.brandResource.contentText,parsed:projection.brandResource.parsed};
        if(assetsResource===null){assetsResource=resource;brandResource=brand;}
        else need(equal(assetsResource,resource)&&equal(brandResource,brand),'FINAL_NATIVE_RESOURCE_CHANGED','All three editions must share exact original brand and assets envelopes');
        const manifest=projection.layoutManifest.parsed,review=projection.reviewManifest.parsed;
        const placements=placementFacts(manifest,attempt.id,projection.layoutManifest.sha256);
        const pages=[];
        need(manifest.slides.length===projection.pageRenders.length,'FINAL_NATIVE_PAGE_CHANGED','Exact original page set required');
        need(accounting.imageReads+projection.pageRenders.length+Object.keys(manifest.imageResources).length<=LIMITS.images,'FINAL_NATIVE_IMAGE_LIMIT','Full native image set exceeds the finite read count');
        for(const [index,row] of projection.pageRenders.entries()) {
          need(equal(row.page,review.pages[index])&&row.page.page===index+1,'FINAL_NATIVE_PAGE_CHANGED','Native pages must remain in original order');
          const observation=await inspected(row.image,`${attempt.id}:page:${index+1}`),dim=observation.dimensions.value;
          need(equal(row.page.dimensions,[dim.width,dim.height]),'FINAL_NATIVE_DECLARED_DIMENSIONS_CHANGED','Native page dimensions must match the full original decode');
          pages.push({pageNumber:index+1,slideId:manifest.slides[index].id,rawSlide:structuredClone(manifest.slides[index]),rawReviewPage:structuredClone(row.page),originalRender:observation.file,dimensions:observation.dimensions});
        }
        for(const [assetId,descriptor] of Object.entries(manifest.imageResources)) {
          const member=assetsResource.parsed.assets[assetId],path=resolve(dirname(assetsResource.resource.path),member.file);
          need(descriptor.file===path,'FINAL_NATIVE_RESOURCE_CHANGED','Original asset member must resolve to its measured native path');
          const observation=await inspected({originalPath:path,sha256:descriptor.sha256,bytes:descriptor.byteLength},`${attempt.id}:asset:${assetId}`),dim=observation.dimensions.value;
          need(equal({file:path,sha256:observation.file.sha256,byteLength:observation.file.bytes,width:dim.width,height:dim.height},descriptor),'FINAL_NATIVE_DECLARED_DIMENSIONS_CHANGED','All exported asset measurements must match original bytes and full decode');
          retained.assetObservations.push({assetId,editionAttemptId:attempt.id,resourceMember:structuredClone(member),descriptor:structuredClone(descriptor),...observation});
        }
        const host=h=>({originalPath:h.originalPath,sha256:h.sha256,bytes:h.bytes,raw:structuredClone(h.parsed),contentText:h.raw,...(h.transportVersion?{schemaVersion:'native-original-record-v2',transportVersion:h.transportVersion,original:h.original}:{})});
        const binary=(value,kind)=>({...structuredClone(value),identity:`${attempt.id}:${kind}`,mediaType:'application/octet-stream'});
        retained.editions.push({style:job.task.style,originalExportJobId:job.id,originalAttemptId:attempt.id,originalWorker:structuredClone(attempt.worker),historicalExecution:structuredClone(initial.binding.execution),anchor:host(projection.anchor),layoutManifest:host(projection.layoutManifest),reviewManifest:host(projection.reviewManifest),deliveryDeck:binary(projection.deliveryDeck,'delivery-deck'),nativeInputDeck:binary(projection.nativeInputDeck,'native-input-deck'),pdf:binary(projection.pdf,'pdf'),...(manifest.semanticContent.source.schemaVersion==='content-source-v3'?{numericProof:{ledger:host(projection.ledger),coverage:host(projection.coverage),nativeVerification:host(projection.nativeVerification),chartEvidence:host(projection.chartEvidence)}}:{}),pages,placements});
      }
      await content.verifyLayoutPreparation(projectId,initial.input);current();
      const latest=store.read(projectId);need(latest.revision===observedRevision&&capture(latest,initial.root.id).identity===initial.identity,'FINAL_NATIVE_PROJECT_CHANGED','Original semantic basis changed during native inspection');
      return {kind:'ready',observedRevision,layoutRootJobId:initial.root.id,bindingIdentity:initial.root.task.bindingHash,exactBinding:structuredClone(initial.binding),ledgerText:initial.input.ledgerText,originalOwnerReports:structuredClone(initial.input.ownerReports),originalJobs:initial.tuple.map(x=>structuredClone(x.job)),originalAttempts:initial.tuple.map(x=>structuredClone(x.attempt)),originalReceipts:initial.tuple.map(x=>structuredClone(x.job.receipt)),assetsResource:present(assetsResource),brandResource:present(brandResource),...retained,accounting,limitations:['Native proofs and image reads are finite observations, not an atomic filesystem snapshot.','Current content validation uses its existing trusted boundary; its aggregate I/O is not measured here.','This is only the native-edition input component, not a complete final-review snapshot or execution authority.'],...flags};
    } catch(error) {
      const blocked=error.code?.startsWith('SNAPSHOT_READ_')&&error.code!=='SNAPSHOT_READ_FAILED'||['ENOENT','FINAL_NATIVE_ROOT_REQUIRED','FINAL_NATIVE_TUPLE_REQUIRED','FINAL_NATIVE_UNKNOWN','FINAL_NATIVE_PROJECT_CHANGED','FINAL_NATIVE_READ_DEADLINE','FINAL_NATIVE_IMAGE_LIMIT','LAYOUT_CURRENT_AUTHORITY_UNAVAILABLE','LAYOUT_STATUS_CHANGED'].includes(error.code)||Array.isArray(error.issues);
      return {kind:blocked?'blocked':'invalid_basis',observedRevision,retained,accounting,blockers:[{code:error.code??'FINAL_NATIVE_READ_FAILED',message:error.message,...(error.issues?{issues:error.issues}:{})}],...flags};
    }
  }};
}
