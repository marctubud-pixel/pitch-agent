import {verifyEngineeringLibraryMaterials} from './local-engineering-library-originals.mjs';
import {closeGenericReviewHistory} from './final-generic-history-semantics.mjs';
import {closeVisualReviewHistory} from './final-visual-history-semantics.mjs';
import {collectCheckedReviewOccurrences} from './final-review-occurrences.mjs';
import {closesReferenceBoundaryWitness} from './final-reference-witness.mjs';
import {closeSelectedGenerationContainers} from './final-generation-containers.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {createHash} from 'node:crypto';
import {contentSourceEnvelope} from './project.mjs';
import {contentRoot,requireContentCurrent,contentSourceLocations,resolveContentSourceLocation} from './complete-content.mjs';
import {resolveContentReferenceContext,projectContentVisibility,occurrenceScopes,affectedContentRelations} from './content-visibility.mjs';
import {visibilityPointer} from './content-visibility.mjs';
import {finalReviewMetadataBasis,finalReviewCallAccounting} from './final-review-authority.mjs';
import {validateFinalAssignments} from './final-review-assignments.mjs';
import {createFinalEditionReader} from './final-edition-reader.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {verifyFinalOperationEvidence} from './final-review-operation-evidence.mjs';
import {closeOwnedContentHistory} from './final-owned-content-history.mjs';
import {verifySelectedOriginals} from './final-selected-originals.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {layoutHash,LAYOUT_STYLES} from './layout-boundary.mjs';
import {planFinalReview} from './final-review-input.mjs';
import {IMAGE_LIMITS} from './image-evidence.mjs';
import {createOperationCaptureStore} from './final-operation-basis.mjs';
import {operationAdapterIdentity} from './final-operation-original.mjs';

import {deriveFinalMaterialDuties} from './final-preparation-materials.mjs';
import {assertValidatedLaunchSettings} from './launch-config.mjs';
import {validateFinalReviewConfiguration} from './final-review-configuration.mjs';

const operationReaders=new WeakMap(), captureProposals=new WeakSet(), preparationFacts=new WeakSet();
const engineeringReadKey=Symbol('private-engineering-read'),engineeringFacts=new WeakMap(),engineeringCandidates=new WeakSet();
export function assertEngineeringFinalBasis(fact,{store}={}){const binding=engineeringFacts.get(fact);need(binding&&(!store||binding.store===store),'LOCAL_ENGINEERING_BASIS_REQUIRED','Actual complete engineering reader fact required');need(digest(binding.store.read(fact.projectId))===binding.projectHash,'LOCAL_ENGINEERING_BASIS_STALE','Project changed since the original closure read');return fact;}
export function assertFinalPreparation(value){need(preparationFacts.has(value),'FINAL_READER_PREPARATION_REQUIRED','Actual reader inspection required');return value;}
const immutable=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(immutable);Object.freeze(value);}return value;};
export function assertOperationCaptureProposal(proposal){need(captureProposals.has(proposal),'FINAL_OPERATION_CAPTURE_PROPOSAL_REQUIRED','Actual private reader proposal required');return proposal;}
export function assertOperationReader(reader,dependencies){const bound=operationReaders.get(reader);if(!bound||dependencies&&(bound.store!==dependencies.store||bound.launchConfiguration!==dependencies.launchConfiguration))throw Object.assign(Error('FINAL_OPERATION_READER_REQUIRED'),{code:'FINAL_OPERATION_READER_REQUIRED'});}
const flags={executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false};
const present=value=>({state:'present',value});
const missing=code=>({state:'missing',code});
const digest=value=>createHash('sha256').update(JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)).digest('hex');
const need=(ok,code,message)=>{if(!ok)throw Object.assign(Error(message),{code});};
const ROLES=['content','visual','brand','user','communication'];
const OWNERS=['layoutProducer','finalConsumer','finalProducer','deliveryConsumer'];
const LIMITS=Object.freeze({milliseconds:600000,sourceImages:512,sourceReadUpperBoundBytes:4*1024**3,artifactHosts:8192,artifactReadPolicyReservedBytes:512*1024**2});
const FINAL_READ_ALLOWANCE=Object.freeze({readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:16*1024**3,storedBytes:16*1024**3});
const admissionBlocked=code=>code?.startsWith('SNAPSHOT_READ_')&&code!=='SNAPSHOT_READ_FAILED';
const absence=new Set(['NOT_FOUND','ENOENT','FINAL_LAYOUT_REQUIRED','FINAL_CONTENT_REQUIRED','FINAL_CONTENT_RELEASE_REQUIRED','FINAL_SETUP_REQUIRED','FINAL_UNKNOWN_ATTEMPTS','FINAL_AMBIGUOUS_RESERVATION','FINAL_PLANNING_REVISION_REQUIRED','FINAL_READ_CHANGED','FINAL_READ_LIMIT','FINAL_ARTIFACT_BYTES_REQUIRED','CONTENT_LAYOUT_SOURCE_UNAVAILABLE','CONTENT_LAYOUT_RELEASE_REQUIRED','CONTENT_LAYOUT_HANDOFF_REQUIRED','CONTENT_SOURCE_BYTES_UNAVAILABLE','CONTENT_ORIGINAL_BYTES_UNAVAILABLE','CONTENT_SOURCE_REQUIRED','CONTENT_ROOT_REQUIRED','ARTIFACT_UNAVAILABLE','LAYOUT_CURRENT_AUTHORITY_UNAVAILABLE']);

function captured(store,projectId,originalRevision=null,preparationOnly=false) {
  const project=structuredClone(store.read(projectId));
  need(project.id===projectId,'FINAL_PROJECT_ID_CHANGED','Store returned a different project');
  const root=project.jobs?.filter(j=>j.purpose==='layout_export'&&j.task?.binding).at(-1);
  need(root,'FINAL_LAYOUT_REQUIRED','Registered original native layout required');
  const semantic=finalReviewMetadataBasis(project,root.id),setup=preparationOnly?null:project.finalReviewSetups?.at(-1)??null;
  if(setup){
    need(equal(setup.basis,semantic),'FINAL_STALE_SETUP','Current source/layout differs from the saved final setup');
    const {id,createdBy,validationLevel,executionAvailable,finalAuthorityAvailable,deliveryAvailable,...proposal}=setup;
    need(id===`final-setup-${digest(proposal)}`&&validationLevel==='project_metadata_only'&&executionAvailable===false&&finalAuthorityAvailable===false&&deliveryAvailable===false,'FINAL_SETUP_CHANGED','Original immutable setup record identity and metadata-only authority required');
  }
  const active=(project.finalReviewReservations??[]).filter(r=>r.status!=='released');
  need(active.length<=1,'FINAL_AMBIGUOUS_RESERVATION','Multiple active final plans require explicit runtime selection');
  const reservation=active[0]??null;
  if(reservation&&!preparationOnly)need(reservation.setupId===setup?.id,'FINAL_STALE_SETUP','Held original plan belongs to a different setup');
  const planningRevision=preparationOnly?project.revision:originalRevision??reservation?.basedOnRevision??project.revision;
  need(Number.isSafeInteger(planningRevision)&&planningRevision>=0&&planningRevision<=project.revision,'FINAL_PLANNING_REVISION_REQUIRED','Original pre-reservation planning revision required');
  const planning=planningRevision!==project.revision?structuredClone(store.read(projectId,planningRevision)):structuredClone(project);
  need(planning.id===projectId&&planning.revision===planningRevision&&equal(finalReviewMetadataBasis(planning,root.id),semantic),'FINAL_PLANNING_REVISION_CHANGED','Stored original planning revision must have the same semantic basis');
  if(reservation&&!preparationOnly)need(equal(planning.finalReviewSetups?.at(-1),setup),'FINAL_PLANNING_REVISION_CHANGED','Original plan must retain its exact setup');
  const accounting=finalReviewCallAccounting(project,{ownReservationId:reservation?.id??null});
  return {project,planning,root,semantic,setup,reservation,planningRevision,accounting,guard:digest(project)};
}

function selectedHistory(index,c) {
  const selected=new Set(),p=c.planning,started=Date.now();
  const add=node=>{if(node)selected.add(node.identity);};
  for(const node of index.nodes)if(node.domain==='job'&&[c.semantic.contentRootJobId,...c.semantic.editions.map(e=>e.jobId)].includes(node.recordId)||node.domain==='artifact'&&node.recordId===c.semantic.contentArtifactId)add(node);
  let before=-1;
  while(before!==selected.size){
    before=selected.size;
    for(const edge of index.edges)if(selected.has(edge.from))selected.add(edge.to);
    const parents=index.nodes.filter(n=>selected.has(n.identity));
    for(const node of index.nodes){
      need(Date.now()-started<=60000,'FINAL_READ_LIMIT','Selected registered closure exceeded its finite indexing deadline');
      if(parents.some(parent=>node.originalPointer.startsWith(parent.originalPointer+'/')))add(node);
      if(node.domain==='job'){
        const job=visibilityPointer(p,node.originalPointer);
        if(parents.some(parent=>parent.domain==='job'&&job.contentRootJobId===parent.recordId))add(node);
        if(parents.some(parent=>parent.domain==='sketch_generation'&&job.generationId===parent.recordId||parent.domain==='final_visual_run'&&job.finalVisualRunId===parent.recordId))add(node);
      }
    }
    for(const target of index.targetOccurrences)if(parents.some(parent=>target.originalProjectPointer.startsWith(parent.originalPointer+'/'))&&typeof target.rawTarget?.artifactId==='string')for(const node of index.nodes)if(node.domain==='artifact'&&node.recordId===target.rawTarget.artifactId)add(node);
  }
  const pointers=index.nodes.filter(n=>selected.has(n.identity)).map(n=>n.originalPointer);
  const contains=pointer=>typeof pointer==='string'&&pointers.some(p=>pointer===p||pointer.startsWith(p+'/'));
  return {scope:'registered_selected_lineage',nodeIdentities:[...selected],contains,reportAnchors:index.reportAnchors.filter(r=>contains(r.originalRecordPointer)),artifactCandidates:index.artifactCandidates.filter(a=>contains(a.originalPointer)),targetOccurrences:index.targetOccurrences.filter(t=>contains(t.originalProjectPointer)),findingOccurrences:index.findingOccurrences.filter(f=>contains(f.originalProjectPointer)),externalWitnesses:index.externalWitnesses.filter(w=>contains(w.originalPointer)),missing:index.missing.filter(i=>!i.pointer&&!i.pointers||i.pointer?.startsWith('/selection/')||contains(i.pointer)),invalid:index.invalid.filter(i=>!i.pointer&&!i.pointers||contains(i.pointer)||i.pointers?.some(contains))};
}

function metadata(c) {
  const blockers=[];
  const setup=c.setup;
  if(!setup)blockers.push({code:'FINAL_SETUP_REQUIRED'});
  const assignments=validateFinalAssignments(setup?.configuration??null,setup?.owners??{});
  blockers.push(...assignments.issues);
  if(setup&&c.accounting.consumedCalls+c.accounting.reservedOtherCalls+c.accounting.ownHeldCalls>setup.allowance.totalCalls)blockers.push({code:'FINAL_CUMULATIVE_ALLOWANCE'});
  if(c.accounting.unknown.length)blockers.push({code:'FINAL_UNKNOWN_ATTEMPTS',originals:c.accounting.unknown});
  return {kind:assignments.kind==='invalid_basis'?'invalid_basis':blockers.length?'blocked':'ready',observedRevision:c.project.revision,planningRevision:c.planningRevision,basis:structuredClone(c.semantic),setup:setup?structuredClone(setup):null,reservation:c.reservation?structuredClone(c.reservation):null,accounting:structuredClone(c.accounting),blockers,validationLevel:'project_metadata_only',...flags};
}

export function isCheckedOriginalReportAnchor(report,checked) {
 return checked.facts.some(f=>(f.checkedRawAnchors??[]).some(anchor=>equal(anchor,report)));
}

export function closeSelectedHistoryDuties({planning,index,selected,checked,native,trusted,artifactHosts=[]}) {
 const closedDeferred=[],containerIds=new Set(index.nodes.filter(n=>['sketch_generation','final_visual_run'].includes(n.domain)).map(n=>n.identity)),closedNodeIdentities=new Set(checked.facts.flatMap(f=>f.closedNodeIdentities??[]).filter(id=>!containerIds.has(id))),blockers=[];
 const containers=closeSelectedGenerationContainers({planning,index,selected,checked});
 for(const identity of containers.closedNodeIdentities)closedNodeIdentities.add(identity);
 blockers.push(...containers.blockers);
 const nativeTupleChecked=native?.originalJobs.length===LAYOUT_STYLES.length&&equal(native.originalJobs.map(j=>j.task.style),LAYOUT_STYLES)&&native.originalAttempts.length===LAYOUT_STYLES.length;
 const exactNode=pointer=>index.nodes.find(n=>n.originalPointer===pointer&&sketchRecordHash(visibilityPointer(planning,pointer))===n.recordHash);
 for(const duty of checked.deferred??[]){
  let closed=false;
  if(duty.authority==='native'){
   const position=native?.originalJobs.findIndex(job=>job.id===duty.jobId&&job.task.bindingHash===duty.bindingHash&&native.originalAttempts[native.originalJobs.indexOf(job)]?.id===duty.attemptId&&equal(job,planning.jobs.find(j=>j.id===duty.jobId)));
   closed=!!nativeTupleChecked&&position!==undefined&&position>=0&&equal(native.originalJobs[position].attempts,[native.originalAttempts[position]])&&native.bindingIdentity===duty.bindingHash;
   if(closed){const jobIndex=planning.jobs.findIndex(j=>j.id===duty.jobId),nodes=[`/jobs/${jobIndex}`,`/jobs/${jobIndex}/attempts/0`].map(exactNode);closed=nodes.every(Boolean);if(closed)for(const node of nodes)closedNodeIdentities.add(node.identity);}
  }else if(duty.authority==='native_artifact'){
   const artifact=planning.artifacts.find(a=>a.id===duty.artifactId),tuple=native?.originalJobs;
   const expected=tuple&&{protocol:'project-native-layout-v1',rootJobId:native.layoutRootJobId,bindingHash:native.bindingIdentity,editions:tuple.map(job=>({jobId:job.id,style:job.task.style,receipt:job.receipt})),finalAuthorityAvailable:false};
   closed=!!nativeTupleChecked&&!!artifact&&artifact.provenance==='native-layout-technical-only'&&native?.layoutRootJobId===duty.rootJobId&&native.bindingIdentity===duty.bindingHash&&equal(artifact.layoutTechnical,expected)&&tuple.every((job,i)=>equal(job,planning.jobs.find(j=>j.id===job.id))&&job.outputVersionIds.length===1&&job.outputVersionIds[0]===artifact.id&&equal(job.attempts,[native.originalAttempts[i]])&&equal(job.receipt,native.originalAttempts[i].receipt))&&artifact.contentHash===duty.contentHash&&artifact.contentHash===layoutHash(tuple.map(job=>job.receipt))&&artifact.payloadRef===tuple[0].receipt.anchorPath;
   if(closed){const node=exactNode(duty.originalPointer);closed=!!node;if(node)closedNodeIdentities.add(node.identity);}
  }else closed=duty.authority==='content'&&trusted?.contract.artifactId===duty.artifactId&&trusted.contentHash===duty.contentHash||duty.authority==='final_visual'&&trusted?.source.visual.artifactId===duty.artifactId&&trusted.source.visual.contentHash===duty.contentHash&&artifactHosts.some(h=>h.artifactId===duty.artifactId&&h.contentHash===duty.contentHash&&equal(h.raw,trusted.source.visual.payload))&&checked.facts.some(f=>f.checked.runId===duty.runId&&f.checked.jobId===trusted.source.visualLeg.jobId);
  if(closed)closedDeferred.push(duty);
  else blockers.push({code:duty.authority.startsWith('native')?'FINAL_HISTORY_NATIVE_TUPLE_REQUIRED':'FINAL_HISTORY_CONTENT_ORIGINAL_REQUIRED',status:'unsettled',duty});
 }
 const uncovered=selected.nodeIdentities.map(id=>index.nodes.find(n=>n.identity===id)).filter(node=>{
  if(!node)return true;
  if(['sketch_generation','final_visual_run'].includes(node.domain))return !containers.closedNodeIdentities.includes(node.identity);
  if(closedNodeIdentities.has(node.identity))return false;
  if(node.domain==='job'||node.domain.startsWith('attempt:'))return true;
  if(checked.facts.some(f=>node.originalPointer===f.originalPointer||node.originalPointer.startsWith(f.originalPointer+'/')))return false;
  if(closedDeferred.some(d=>!d.authority.startsWith('native')&&node.originalPointer===d.originalPointer))return false;
  if(node.domain==='task_card'&&checked.terminals?.some(t=>t.taskCard?.id===node.recordId))return false;
  if(node.domain==='owner_edge'&&checked.facts.some(f=>f.checked.edgeId===node.recordId))return false;
  return true;
 });
 for(const node of uncovered)blockers.push({code:'FINAL_HISTORY_SELECTED_DOMAIN_REQUIRED',status:'unsettled',domain:node?.domain,recordId:node?.recordId,originalPointer:node?.originalPointer});
 return {closedDeferred,closedNodeIdentities:[...closedNodeIdentities],containerProofs:containers.containerProofs,uncovered,blockers,status:checked.duties?.status==='checked'&&!blockers.length?'checked':'unsettled'};
}
const sketchRecordHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createFinalReviewReader({store,root,content,imageStore,pythonBinary,providerRoot,launchConfiguration=null,referenceLibraries={}}) {
  const captures=launchConfiguration?createOperationCaptureStore({store,launchConfiguration}):null;
  need(typeof store?.withReadAdmission==='function'&&typeof store?.read==='function'&&typeof store?.list==='function'&&typeof root==='string'&&typeof content?.contentLayoutInput==='function'&&typeof content?.verifyLayoutPreparation==='function'&&typeof imageStore?.readWithInspection==='function'&&typeof pythonBinary==='string','FINAL_READER_DEPENDENCY_REQUIRED','Internal store, actual content authority, managed root, same-byte image reader and explicit decoder required');
  const editions=createFinalEditionReader({store,root,content,pythonBinary});
  const inspectBasisWithinAdmission=projectId=>{
    try{return metadata(captured(store,projectId));}
    catch(error){return {kind:absence.has(error.code)||admissionBlocked(error.code)?'blocked':'invalid_basis',observedRevision:null,retained:{},blockers:[{code:error.code??'FINAL_BASIS_FAILED',message:error.message}],...flags};}
  };
  async function readSnapshotWithinAdmission(projectId,operationOnly=false,preparationOnly=false,engineeringRequest=null) {
    const engineering=engineeringRequest?.key===engineeringReadKey;let engineeringScopes=null,engineeringLibraryProofs=null;
    const started=Date.now(),retained={materials:[],artifactHosts:[],returnBindings:[]},blockers=[],invalid=[];
    const accounting={sourceImages:0,sourceReadUpperBoundBytes:0,artifactHosts:0,artifactReadPolicyReservedBytes:0,physicalIo:'unmeasured',contentBoundaryIo:'existing_boundary_not_aggregated',artifactReadIo:'finite_descriptor_reads_with_growth_probe_not_aggregated'};
    let c,observedRevision=null;
    const issue=(error,phase)=>{
      const record={code:error.code??'FINAL_READ_FAILED',phase,message:error.message,...(error.issues?{issues:error.issues}:{})};
      (absence.has(error.code)||admissionBlocked(error.code)?blockers:invalid).push(record);
    };
    const current=()=>{
      need(Date.now()-started<=LIMITS.milliseconds,'FINAL_READ_LIMIT','Final read exceeded its finite acceptance deadline');
      need(store.list().find(x=>x.id===projectId)?.revision===observedRevision,'FINAL_READ_CHANGED','Project head changed during final inspection');
    };
    const phase=async(name,run)=>{
      current();try{await run();}catch(error){issue(error,name);}current();
    };
    try {
      const sourceIdentity=captures&&!engineering?await operationAdapterIdentity():null;
      let operationBasis=captures&&!preparationOnly&&!engineering?await captures.read(store.read(projectId),sourceIdentity):null;
      c=captured(store,projectId,operationBasis?.originalRevision??null,preparationOnly||engineering);observedRevision=c.project.revision;
      if(engineering)need(observedRevision===engineeringRequest.expectedRevision&&c.root.id===engineeringRequest.layoutRootJobId,'LOCAL_ENGINEERING_REQUEST_STALE','Exact current requested project/layout basis required');
      c.frozenAccounting=finalReviewCallAccounting(c.planning);
      retained.basis=metadata(c);retained.planningRevision=c.planningRevision;
      retained.authority={owners:Object.fromEntries(OWNERS.map(k=>[k,missing('FINAL_OWNER_ASSIGNMENT_REQUIRED')])),roleMaterialScopes:ROLES.map(role=>({role,applicability:missing('FINAL_MATERIAL_SCOPE_REQUIRED')})),configuration:null,allowance:missing('FINAL_CUMULATIVE_ALLOWANCE_REQUIRED'),liveAccounting:structuredClone(c.accounting)};
      const policy=c.project.policies.at(-1);
      retained.humanFinalGate=present({selected:policy.humanGates.includes('final_review'),policyIdentity:digest(policy),gate:'final_review'});
      retained.registeredProject=structuredClone(c.project);
      if(preparationOnly&&c.accounting.unknown.length)blockers.push({code:'FINAL_UNKNOWN_ATTEMPTS',originals:c.accounting.unknown});
      let trusted=null,catalog=null,native=null,referenceVisibility=null;
      await phase('content',async()=>{
        const value=await content.contentLayoutInput(projectId);current();
        const artifact=c.project.artifacts.find(a=>a.id===c.semantic.contentArtifactId),originalRoot=contentRoot(c.planning,artifact);
        need(equal(value.source,originalRoot.task.source)&&value.contract.rootJobId===originalRoot.id&&value.contract.artifactId===artifact.id&&value.contentHash===artifact.contentHash,'FINAL_CONTENT_CHANGED','Actual content read must match the immutable original source and manuscript');
        trusted=structuredClone(value);retained.content={trusted};
        requireContentCurrent(c.planning,originalRoot,contentSourceEnvelope);
        const rows=contentSourceLocations(originalRoot);
        need(equal(rows,value.contract.sourceLocations),'FINAL_SOURCE_CATALOG_CHANGED','Actual contract must retain every registered source location');
        const entries=[];
        retained.content.locations={version:value.contract.sourceLocationVersion,rows:structuredClone(rows),entries};
        for(const row of rows)for(const location of [row.derived,...row.originals]){
          current();entries.push(resolveContentSourceLocation(c.planning,location,contentSourceEnvelope));current();
        }
        catalog=retained.content.locations;
        const context=resolveContentReferenceContext(c.planning,value.source.immutableBasis),projection=projectContentVisibility(value.source.immutableBasis,context);
        need(equal(projection,value.source.visibility),'FINAL_REFERENCE_VISIBILITY_CHANGED','Actual reference scope and disposition projection changed');
        referenceVisibility={context,projection};
        retained.referenceVisibility={contextDigest:context.digest,projectionHash:projection.projectionHash};
      });
      await phase('native',async()=>{
        const result=await editions.read(projectId);current();retained.native=result;
        if(result.kind!=='ready'){
          (result.kind==='invalid_basis'?invalid:blockers).push(...result.blockers);return;
        }
        need(result.observedRevision===observedRevision&&result.layoutRootJobId===c.semantic.layoutRootJobId&&result.bindingIdentity===c.semantic.bindingHash,'FINAL_NATIVE_CHANGED','Native reader returned a different operation basis');
        native=result;
      });
      const source=trusted?.source??c.planning.jobs.find(j=>j.id===c.semantic.contentRootJobId)?.task.source;
      if(Array.isArray(source?.images))for(const row of source.images){
        const material={identity:row.imageId,kind:'source_image',sourceRow:structuredClone(row),file:missing('FINAL_SOURCE_IMAGE_BYTES_REQUIRED'),dimensions:missing('FINAL_SOURCE_IMAGE_DECODE_REQUIRED'),sourceValidation:trusted&&catalog?'checked_content':'registered_source_only'};
        retained.materials.push(material);
        await phase('source_material',async()=>{
        accounting.sourceImages++;accounting.sourceReadUpperBoundBytes+=IMAGE_LIMITS.bytes+16384+2;
        need(accounting.sourceImages<=LIMITS.sourceImages&&accounting.sourceReadUpperBoundBytes<=LIMITS.sourceReadUpperBoundBytes,'FINAL_READ_LIMIT','Full original source inventory exceeds the finite read allowance');
        const result=await imageStore.readWithInspection({projectId,imageId:row.imageId,expectedHash:row.sha256});current();
        const d=result.descriptor,measured=result.inspection;
        need(result.asset.id===row.imageId&&result.asset.projectId===projectId&&d.imageId===row.imageId&&result.bytes.length===row.byteLength&&layoutHash(result.bytes)===row.sha256&&d.sha256===row.sha256&&d.byteLength===row.byteLength&&d.mediaType===row.mediaType&&measured.mediaType===row.mediaType,'FINAL_MATERIAL_CHANGED','Exact original source image bytes and decoded media required');
        const file={identity:row.imageId,originalPath:d.path,sha256:d.sha256,bytes:d.byteLength,mediaType:measured.mediaType};
        const dimensions=present({width:measured.width,height:measured.height,boundSha256:file.sha256,boundBytes:file.bytes,evidenceIdentity:`original-decoder-${digest({file,measured})}`});
        material.file=present(file);material.dimensions=dimensions;
        });
      }
      if(native)for(const [assetId,member] of Object.entries(native.assetsResource.value.parsed.assets))if(member.role==='mockup'){
        const observations=native.assetObservations.filter(a=>a.assetId===assetId),first=observations[0];
        if(!first){retained.materials.push({identity:assetId,kind:'native_mockup',file:missing('FINAL_MOCKUP_ORIGINAL_REQUIRED'),dimensions:missing('FINAL_MOCKUP_DECODE_REQUIRED'),resourceMember:structuredClone(member),nativeAssets:[]});blockers.push({code:'FINAL_MOCKUP_ORIGINAL_REQUIRED',assetId,resourceMember:structuredClone(member)});continue;}
        need(observations.every(a=>equal(a.file.sha256,first.file.sha256)&&equal(a.dimensions.value.width,first.dimensions.value.width)&&equal(a.dimensions.value.height,first.dimensions.value.height)),'FINAL_MOCKUP_CHANGED','Native mockup observations must describe the same original');
        retained.materials.push({identity:assetId,kind:'native_mockup',file:present({...first.file,identity:assetId}),dimensions:structuredClone(first.dimensions),applications:Object.entries(native.assetsResource.value.parsed.assets).filter(([,resource])=>resource.application?.mockupId===assetId).map(([applicationId,resourceMember])=>({applicationId,resourceMember:structuredClone(resourceMember),observations:native.assetObservations.filter(a=>a.assetId===applicationId).map(a=>structuredClone(a))})),nativeAssets:observations.map(a=>({editionAttemptId:a.editionAttemptId,assetId,descriptor:structuredClone(a.descriptor),resourceMember:structuredClone(a.resourceMember)}))});
      }
      if(engineering){
        need(trusted&&catalog&&native&&!blockers.length&&!invalid.length,'LOCAL_ENGINEERING_SOURCE_CLOSURE_REQUIRED','Actual content/native/material originals must close before local review');
        need(!c.accounting.unknown.length,'FINAL_UNKNOWN_ATTEMPTS','Unknown original calls cannot be silently ignored');
        engineeringScopes=deriveFinalMaterialDuties({trusted,catalog,native,materials:retained.materials.map(({sourceValidation,...m})=>m)});
      }
      if(preparationOnly){
        if(!trusted||!catalog||!native||blockers.length||invalid.length)return {kind:invalid.length?'invalid_basis':'blocked',observedRevision,retained,accounting,blockers:[...blockers,...invalid],...flags};
        assertValidatedLaunchSettings(launchConfiguration);
        const runtime=launchConfiguration.moduleConfigs.finalReview;
        validateFinalReviewConfiguration(runtime);
        const materialBodies=retained.materials.map(({sourceValidation,...m})=>m);
        const roleMaterialScopes=deriveFinalMaterialDuties({trusted,catalog,native,materials:materialBodies});
        const proposal={protocol:'final-review-authority-v1',basedOnRevision:observedRevision,basis:c.semantic,materials:materialBodies.map(m=>({identity:m.identity,correspondenceHash:digest(m)})),roleMaterialScopes,owners:structuredClone(runtime.owners),configuration:structuredClone(runtime.configuration),allowance:structuredClone(runtime.allowance)};
        current();need(digest(store.read(projectId))===c.guard,'FINAL_READ_CHANGED','Inspection head changed');
        const value=immutable({kind:'inspected',projectId,observedRevision,basis:c.semantic,sourceIdentity,configurationIdentity:digest(launchConfiguration),proposal,accounting,blockers:[],...flags});preparationFacts.add(value);return value;
      }
      if(!engineering)(retained.basis.kind==='invalid_basis'?invalid:blockers).push(...retained.basis.blockers);
      const index=indexFinalHistoryRecords(c.planning,{contentRootJobId:c.semantic.contentRootJobId,layoutRootJobId:c.semantic.layoutRootJobId});
      retained.historyIndex=index;
      const selected=selectedHistory(index,c);retained.historySelection={scope:selected.scope,nodeIdentities:selected.nodeIdentities};
      invalid.push(...selected.invalid);
      await phase('selected-originals',async()=>{
        retained.checkedOriginals=await verifySelectedOriginals({store,planning:c.planning,index,selected,executionRoot:root,imageStore,current});
        blockers.push(...retained.checkedOriginals.blockers);
      });
      const settled=retained.checkedOriginals?.settledOutputs??[];
      blockers.push(...selected.missing.filter(issue=>!settled.some(output=>issue.code==='FINAL_HISTORY_MISSING_REFERENCE'&&issue.domain==='output'&&issue.targetId===output.outputVersionId&&issue.pointer===`/jobs/${c.planning.jobs.findIndex(job=>job.id===output.jobId)}/outputVersionIds/0`)));
      if(engineering)await phase('local-library-originals',async()=>{
        const ids=index.nodes.filter(n=>n.domain==='reference_dossier'&&selected.nodeIdentities.includes(n.identity)).map(n=>n.recordId);
        const visual=c.planning.artifacts.find(a=>a.id===trusted.source.visual.artifactId),run=c.planning.finalVisualRuns.find(r=>r.id===visual?.finalVisual?.runId),used=run?.source.referenceSource.dossierId;
        need(typeof used==='string','LOCAL_ENGINEERING_LIBRARY_SOURCE_DOSSIER_REQUIRED');if(!ids.includes(used))ids.push(used);
        engineeringLibraryProofs=await verifyEngineeringLibraryMaterials({store,project:c.planning,selectedDossierIds:ids,executionRoot:root,referenceLibraries,current});
      });
      for(const candidate of selected.artifactCandidates)await phase('artifact_host',async()=>{
        accounting.artifactHosts++;accounting.artifactReadPolicyReservedBytes+=1024**2+1;
        need(accounting.artifactHosts<=LIMITS.artifactHosts&&accounting.artifactReadPolicyReservedBytes<=LIMITS.artifactReadPolicyReservedBytes,'FINAL_READ_LIMIT','Registered artifact closure exceeds bounded host reads');
        need(typeof candidate.payloadRef==='string','FINAL_ARTIFACT_BYTES_REQUIRED','Selected original artifact bytes are unavailable');
        const value=await readArtifactContent(c.planning,candidate.artifactId,root);current();
        retained.artifactHosts.push({artifactId:value.artifactId,contentHash:value.contentHash,version:candidate.registeredVersion,versionOrigin:'registered_record_hash',raw:value.content,contentText:present(value.contentText)});
      });
      const classifiedFindings=[],classifiedDispositions=[],findingProofs=[];
      if(referenceVisibility){
        const {context,projection}=referenceVisibility;
        const reportIds=new Set(context.records.map(r=>r.reportId));
        selected.findingOccurrences=selected.findingOccurrences.filter(f=>!reportIds.has(f.originalReportIdentity));
        for(const occurrence of [...projection.occurrences,...projection.archivedOccurrences]){
          const report=selected.reportAnchors.find(r=>r.identity===occurrence.originalContainerId&&r.sha256===occurrence.originalContainerHash);
          if(!report)continue;
          const payload=visibilityPointer(report.raw,occurrence.originalPointer);
          need(payload!==undefined,'FINAL_FINDING_ORIGINAL_CHANGED','Classified reference finding pointer must address exact raw bytes');
          const originId=`${report.identity}@${report.version}#${occurrence.originalPointer}`;
          const targets=selected.targetOccurrences.filter(t=>t.findingIdentity===originId).sort((a,b)=>a.targetIndex-b.targetIndex).map(t=>t.rawTarget);
          const scopes=occurrenceScopes(occurrence),relations=scopes.flatMap(scope=>affectedContentRelations(trusted.contract.manuscript,trusted.source,occurrence,scope));
          const images=[...new Set(relations.flatMap(r=>r.imageIds))],applicableObligations=[];
          for(const imageId of images){
            const material=retained.materials.find(m=>m.identity===imageId),file=material?.file?.value;
            if(!file){blockers.push({code:'FINAL_FINDING_MATERIAL_ORIGINAL_REQUIRED',findingIdentity:originId,imageId});continue;}
            for(const role of ROLES){
              const decision=(engineering?engineeringScopes:c.setup?.roleMaterialScopes)?.find(s=>s.role===role)?.applicability?.value.find(cell=>cell.materialIdentity===imageId)?.decision;
              if(decision?.state!=='present'){blockers.push({code:'FINAL_FINDING_SCOPE_DECISION_REQUIRED',findingIdentity:originId,role,imageId});continue;}
              if(decision.value.required)applicableObligations.push({role,materialIdentity:imageId,addresses:[{domain:'visual_asset',imageId,sha256:file.sha256,originalPath:file.originalPath}]});
            }
          }
          classifiedFindings.push({originId,originalReportIdentity:report.identity,originalReportVersion:report.version,originalFindingPointer:occurrence.originalPointer,exactOriginalPayload:payload,returnTargets:targets,applicableObligations});
          classifiedDispositions.push({findingIdentity:originId,status:occurrence.disposition,originalProof:occurrence.dispositionProof});
          findingProofs.push({originId,scopeProof:occurrence.scopeProof,scopes,relations,archived:occurrence.disposition==='rejected',...(images.length?{}:{materialExclusion:{reason:'No image relation in exact manuscript scope',relations}})});
        }
        retained.referenceFieldCoverage=projection.fieldCoverage;
      }
      retained.findingDutyProofs=findingProofs;
      for(const target of selected.targetOccurrences){
        const report=index.reportAnchors.find(r=>r.identity===target.reportIdentity&&r.version===target.reportVersion&&target.originalProjectPointer.startsWith(r.originalRecordPointer+'/'));
        need(report&&equal(visibilityPointer(report.raw,target.originalReportPointer),target.rawTarget),'FINAL_ORIGINAL_TARGET_CHANGED','Exact original report pointer and target occurrence required');
        let resolution=missing('FINAL_TARGET_AUTHORITY_REQUIRED');
        const raw=target.rawTarget;
        if(raw?.location&&catalog){
          const entry=catalog.entries.find(e=>equal(e.location,raw.location));
          if(entry&&(!raw.ancestryAnchor||equal(raw.ancestryAnchor,entry.ancestryAnchor)))resolution=present([{domain:'content_location',location:structuredClone(entry.location)}]);
          else invalid.push({code:'FINAL_TARGET_LOCATION_CHANGED',targetIdentity:target.identity});
        }else if(raw?.domain==='native_manifest'||raw?.kind==='native_manifest'){
          const edition=native?.editions.find(e=>e.originalAttemptId===raw.editionAttemptId);
          if(edition){
            const element=raw.element,slide=element&&edition.layoutManifest.raw.slides[element.slideIndex],original=slide?.elements[element.elementIndex];
            if(raw.manifestSha256!==edition.layoutManifest.sha256||visibilityPointer(edition.layoutManifest.raw,raw.pointer)===undefined||element&&(!equal(element,{editionAttemptId:edition.originalAttemptId,layoutManifestSha256:edition.layoutManifest.sha256,slideIndex:element.slideIndex,slideId:slide?.id,elementIndex:element.elementIndex,elementId:original?.id,occurrenceId:original?.occurrenceId})))invalid.push({code:'FINAL_TARGET_NATIVE_CHANGED',targetIdentity:target.identity});
            else resolution=present([{domain:'native_manifest',editionAttemptId:raw.editionAttemptId,manifestSha256:raw.manifestSha256,pointer:raw.pointer,...(element?{element:structuredClone(element)}:{})}]);
          }
        }else if(typeof raw?.imageId==='string'&&typeof raw.sha256==='string'){
          const material=retained.materials.find(m=>m.identity===raw.imageId),file=material?.file?.value;
          if(file){
            if(raw.sha256!==file.sha256||raw.originalPath!==undefined&&raw.originalPath!==file.originalPath)invalid.push({code:'FINAL_TARGET_IMAGE_CHANGED',targetIdentity:target.identity});
            else resolution=present([{domain:'visual_asset',imageId:raw.imageId,sha256:file.sha256,originalPath:file.originalPath}]);
          }
        }else if(typeof raw?.artifactId==='string'&&typeof raw.pointer==='string'){
          const all=retained.artifactHosts.filter(h=>h.artifactId===raw.artifactId),hosts=all.filter(h=>(raw.contentHash===undefined||raw.contentHash===h.contentHash)&&(raw.version===undefined||raw.version===h.version));
          if(all.length&&!hosts.length)invalid.push({code:'FINAL_TARGET_ARTIFACT_CHANGED',targetIdentity:target.identity});
          if(hosts.length===1){
            const host=hosts[0];
            if(raw.artifactId===trusted?.contract.artifactId&&raw.version===undefined){
              const value=visibilityPointer(host.raw,raw.pointer),range=raw.range;
              if(value===undefined||range&&(range.unit!=='utf16_code_unit'||typeof value!=='string'||!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<=range.start||range.end>value.length))invalid.push({code:'FINAL_TARGET_MANUSCRIPT_CHANGED',targetIdentity:target.identity});
              else resolution=present([{domain:'manuscript',artifactId:host.artifactId,contentHash:host.contentHash,manuscriptHash:trusted.contract.manuscriptHash,pointer:raw.pointer,...(range?{range:structuredClone(range)}:{})}]);
            }else if(raw.artifactId!==trusted?.contract.artifactId){
              let selector;
              if(visibilityPointer(host.raw,raw.pointer)!==undefined)selector={kind:'json_pointer',pointer:raw.pointer};
              else {
                const parts=raw.pointer.match(/^\/(sources|directions|targets)\/([^/]+)(.*)$/);
                if(parts){const [,collection,id,field]=parts,key={sources:'id',directions:'directionId',targets:'targetId'}[collection],members=collection==='targets'?host.raw.directions?.flatMap(d=>d.targets):host.raw[collection],hits=members?.filter(v=>v[key]===id)??[];
                  if(hits.length===1&&visibilityPointer(hits[0],field)!==undefined)selector={kind:'domain_member',collection,id,...(field?{field}:{})};
                }
              }
              if(selector)resolution=present([{domain:'legacy_artifact',artifactId:host.artifactId,contentHash:host.contentHash,version:host.version,originalLocator:raw.pointer,selector}]);
            }
          }
        }
        retained.returnBindings.push({...structuredClone(target),reportHost:structuredClone(report.host),resolution,reportValidation:missing('FINAL_HISTORY_DOMAIN_VALIDATION_REQUIRED')});
        if(resolution.state==='missing')blockers.push({code:resolution.code,targetIdentity:target.identity});
      }
      const checked=retained.checkedOriginals??{facts:[],deferred:[]};
      const checkedReports=[];
      for(const report of selected.reportAnchors){
        const exact=isCheckedOriginalReportAnchor(report,checked);
        if(exact)checkedReports.push(report);
        else blockers.push({code:'FINAL_HISTORY_REPORT_ORIGINAL_REQUIRED',reportIdentity:report.identity,reportVersion:report.version,host:report.host,originalRecordPointer:report.originalRecordPointer});
      }
      retained.checkedReportAnchors=checkedReports;
      for(const binding of retained.returnBindings)if(checkedReports.some(r=>r.identity===binding.reportIdentity&&r.version===binding.reportVersion&&equal(r.host,binding.reportHost)))binding.reportValidation=present({reportIdentity:binding.reportIdentity,reportVersion:binding.reportVersion,host:binding.reportHost});
      const closure=closeSelectedHistoryDuties({planning:c.planning,index,selected,checked,native,trusted,artifactHosts:retained.artifactHosts});
      retained.closedDeferred=closure.closedDeferred;retained.selectedDutyClosure=closure;
      blockers.push(...closure.blockers);
      const ownedContent=closeOwnedContentHistory({selected,checked,trusted,catalog,materials:retained.materials,roleMaterialScopes:(engineering?engineeringScopes:c.setup?.roleMaterialScopes)??[],dispositions:index.dispositions.filter(d=>selected.contains(d.originalProjectPointer))});
      retained.ownedContentHistory=ownedContent;
      classifiedFindings.push(...ownedContent.findings);classifiedDispositions.push(...ownedContent.dispositions);
      const semantics=collectCheckedReviewOccurrences({planning:c.planning,checked,selected});
      retained.reviewOccurrences=semantics.occurrences;blockers.push(...semantics.blockers);
      const visualHistory=closeVisualReviewHistory({planning:c.planning,checked,selected,occurrences:semantics.occurrences,trusted,catalog,native,materials:retained.materials,roleMaterialScopes:(engineering?engineeringScopes:c.setup?.roleMaterialScopes)??[]});
      retained.visualHistory=visualHistory;blockers.push(...visualHistory.blockers);
      classifiedFindings.push(...visualHistory.findings);classifiedDispositions.push(...visualHistory.dispositions);
      for(const resolved of visualHistory.returnResolutions){
        const binding=retained.returnBindings.find(b=>b.identity===resolved.identity);
        if(binding?.resolution.state==='missing'&&binding.reportValidation.state==='present'){
          binding.resolution=present(structuredClone(resolved.addresses));binding.domainResolutionProof=structuredClone(resolved.proof);
          for(let i=blockers.length-1;i>=0;i--)if(blockers[i].code==='FINAL_TARGET_AUTHORITY_REQUIRED'&&blockers[i].targetIdentity===resolved.identity)blockers.splice(i,1);
        }
      }
      const genericHistory=closeGenericReviewHistory({planning:c.planning,checked,selected,occurrences:semantics.occurrences,trusted,catalog,native,materials:retained.materials,roleMaterialScopes:(engineering?engineeringScopes:c.setup?.roleMaterialScopes)??[]});
      retained.genericHistory=genericHistory;blockers.push(...genericHistory.blockers);
      classifiedFindings.push(...genericHistory.findings);classifiedDispositions.push(...genericHistory.dispositions);
      const closedOwnedFinding=(identity,version,pointer)=>[...visualHistory.closedFindingKeys,...genericHistory.closedFindingKeys].includes(JSON.stringify([identity,version,pointer]));
      const typedOccurrence=f=>semantics.occurrences.find(o=>o.reportIdentity===f.originalReportIdentity&&o.reportVersion===f.originalReportVersion&&o.rawPointer===f.originalFindingPointer&&equal(o.rawValue,f.exactOriginalPayload));
      const unresolvedFindings=selected.findingOccurrences.filter(f=>!ownedContent.closedFindingIdentities.includes(f.identity)&&!closedOwnedFinding(f.originalReportIdentity,f.originalReportVersion,f.originalFindingPointer)&&(!typedOccurrence(f)||['finding','unresolved_domain_semantics'].includes(typedOccurrence(f).semantic)));
      for(const occurrence of semantics.occurrences.filter(o=>o.semantic==='finding'&&!closedOwnedFinding(o.reportIdentity,o.reportVersion,o.rawPointer)&&!selected.findingOccurrences.some(f=>f.originalReportIdentity===o.reportIdentity&&f.originalReportVersion===o.reportVersion&&f.originalFindingPointer===o.rawPointer)))blockers.push({code:'FINAL_FINDING_DUTY_AUTHORITY_REQUIRED',reportIdentity:occurrence.reportIdentity,reportVersion:occurrence.reportVersion,originalFindingPointer:occurrence.rawPointer,domainFindingId:occurrence.domainFindingId});
      retained.findingOccurrences=unresolvedFindings.map(f=>({...structuredClone(f),applicableObligations:missing('FINAL_FINDING_DUTY_AUTHORITY_REQUIRED')}));
      for(const finding of unresolvedFindings)blockers.push({code:'FINAL_FINDING_DUTY_AUTHORITY_REQUIRED',findingIdentity:finding.identity,reportIdentity:finding.originalReportIdentity,reportVersion:finding.originalReportVersion,originalFindingPointer:finding.originalFindingPointer});
      if(selected.externalWitnesses.length)for(const witness of selected.externalWitnesses.filter(witness=>!closesReferenceBoundaryWitness({planning:c.planning,witness,trusted,catalog})))blockers.push({code:'FINAL_HISTORY_EXTERNAL_WITNESS_REQUIRED',witness});
      const dispositions=index.dispositions.filter(d=>selected.contains(d.originalProjectPointer));
      if(dispositions.length)for(const disposition of dispositions.filter(d=>!ownedContent.closedDispositionPointers.includes(d.originalProjectPointer)&&!visualHistory.closedDispositionPointers.includes(d.originalProjectPointer)&&!referenceVisibility?.context.records.some(r=>r.reportId===d.originalReportIdentity)))blockers.push({code:'FINAL_FINDING_DISPOSITION_AUTHORITY_REQUIRED',reportIdentity:disposition.originalReportIdentity,reportVersion:disposition.originalReportVersion,originalReportPointer:disposition.originalReportPointer});
      retained.history={completeness:missing('FINAL_HISTORY_DOMAIN_VALIDATION_REQUIRED'),retained:{originalReports:checkedReports.map(({identity,version,raw,sha256})=>({identity,version,raw,sha256})),originalFindings:classifiedFindings,originalAttempts:c.frozenAccounting.originals.map(row=>{
        const job=c.planning.jobs.find(j=>j.id===row.jobId),attempt=job?.attempts?.find(a=>a.id===row.attemptId);
        return {id:row.attemptId,status:row.chargedCalls===0?'failed':['succeeded','failed'].includes(row.status)?row.status:'unknown',chargedCalls:row.chargedCalls,raw:structuredClone(attempt),accountingEvidence:structuredClone(row)};
      }),dispositions:classifiedDispositions,predecessorInputIds:ownedContent.predecessorInputIds,predecessorInputs:ownedContent.predecessorInputs,hosts:retained.artifactHosts}};
      retained.unclassifiedDispositions=dispositions.filter(d=>!ownedContent.closedDispositionPointers.includes(d.originalProjectPointer)&&!visualHistory.closedDispositionPointers.includes(d.originalProjectPointer)&&!referenceVisibility?.context.records.some(r=>r.reportId===d.originalReportIdentity));
      const materialBodies=retained.materials.map(({sourceValidation,...m})=>m);
      retained.materialCorrespondences=materialBodies.map(m=>({identity:m.identity,...(m.file.state==='present'&&m.dimensions.state==='present'?{correspondenceHash:digest(m)}:{missing:'FINAL_MATERIAL_CORRESPONDENCE_REQUIRED'})}));
      const historyDuties=blockers.map(b=>({status:'unsettled',...b}));
      if(c.setup&&!engineering){
        const declared=c.setup.materials;
        const actual=retained.materialCorrespondences;
        for(const material of actual)if(material.correspondenceHash&&!declared.some(d=>equal(d,material)))invalid.push({code:'FINAL_SETUP_MATERIALS_CHANGED',material});
        if(trusted&&catalog&&native&&!equal(declared.map(m=>m.identity).sort(),actual.map(m=>m.identity).sort()))invalid.push({code:'FINAL_SETUP_MATERIAL_INVENTORY_CHANGED'});
        retained.authority={owners:Object.fromEntries(OWNERS.map(k=>[k,present(structuredClone(c.setup.owners[k]))])),roleMaterialScopes:structuredClone(c.setup.roleMaterialScopes),configuration:structuredClone(c.setup.configuration),allowance:present({authorityIdentity:c.setup.allowance.authorityIdentity,totalCalls:c.setup.allowance.totalCalls,reservedOtherCalls:c.frozenAccounting.reservedOtherCalls}),liveAccounting:structuredClone(c.accounting)};
        for(const role of ROLES)if(!c.setup.roleMaterialScopes.some(s=>s.role===role))invalid.push({code:'FINAL_SETUP_SCOPE_CHANGED',role});

      }
      const unsettledDuties=[...historyDuties,...(checked.duties?.unsettled??[])];
      retained.history.duties={status:closure.status==='checked'&&!unsettledDuties.length?'checked':'unsettled',unsettled:unsettledDuties};
      if(trusted&&catalog&&native&&!c.accounting.unknown.length&&!invalid.length&&retained.history.duties.status==='checked')retained.history.completeness=present(true);
      if(engineering){
        need(trusted&&catalog&&native&&!blockers.length&&!invalid.length&&retained.history.completeness.state==='present'&&retained.history.completeness.value===true&&retained.history.duties.status==='checked','LOCAL_ENGINEERING_ORIGINAL_CLOSURE_REQUIRED','Every actual selected original and domain/history duty must close');
        current();need(digest(store.read(projectId))===c.guard,'FINAL_READ_CHANGED','Engineering closure changed under read admission');
        const snapshot={schemaVersion:'local-engineering-final-input-v1',project:{id:projectId,observedRevision},task:{identity:c.semantic.taskCardId,exactTask:trusted.source.task},policy:{identity:digest(trusted.source.policy),exactPolicy:trusted.source.policy},content:retained.content,layout:{rootJobId:native.layoutRootJobId,bindingIdentity:native.bindingIdentity,exactBinding:native.exactBinding,ledgerText:native.ledgerText,originalOwnerReports:native.originalOwnerReports,originalJobs:native.originalJobs,originalAttempts:native.originalAttempts,originalReceipts:native.originalReceipts,assetsResource:native.assetsResource},editions:present(native.editions),materials:retained.materials.map(({sourceValidation,...m})=>m),roleMaterialScopes:engineeringScopes,history:retained.history,returnBindings:retained.returnBindings};
        const fact={kind:'engineering_ready',protocol:'local-engineering-basis-v1',projectId,observedRevision,sourceBinding:structuredClone(c.semantic),sourceBindingHash:digest(c.semantic),snapshot,libraryMaterialOriginals:engineeringLibraryProofs,evidenceHash:digest({snapshot,libraryMaterialOriginals:engineeringLibraryProofs}),accounting,blockers:[],productionFinalAuthority:false,realQualityVerified:false,browserVerified:false};immutable(fact);engineeringCandidates.add(fact);return fact;
      }
      let snapshot=null,planned=null;
      if(trusted&&catalog&&native&&c.setup){
        snapshot={schemaVersion:'final-review-input-v2',project:{id:projectId,observedRevision:c.planningRevision},task:{identity:c.semantic.taskCardId,exactTask:trusted.source.task},policy:{identity:digest(trusted.source.policy),exactPolicy:trusted.source.policy},content:retained.content,layout:{rootJobId:native.layoutRootJobId,bindingIdentity:native.bindingIdentity,exactBinding:native.exactBinding,ledgerText:native.ledgerText,originalOwnerReports:native.originalOwnerReports,originalJobs:native.originalJobs,originalAttempts:native.originalAttempts,originalReceipts:native.originalReceipts,assetsResource:native.assetsResource},editions:present(native.editions),materials:materialBodies,owners:retained.authority.owners,roleMaterialScopes:retained.authority.roleMaterialScopes,allowance:retained.authority.allowance,humanFinalGate:retained.humanFinalGate,history:retained.history,returnBindings:retained.returnBindings};
        if(operationBasis)need(digest(snapshot)===digest(operationBasis.snapshot),'FINAL_OPERATION_CAPTURE_FACTS_CHANGED','Current original facts differ from the immutable capture');
        planned=planFinalReview(snapshot,c.setup.configuration);
        retained.snapshot=snapshot;retained.planning=planned;
      }
      if(!invalid.length&&!blockers.length&&planned?.kind==='planned'&&captures){
        if(operationBasis)retained.operationBasis=operationBasis;
        else {const proposal=immutable({kind:'capture_proposal',projectId,observedRevision,project:c.project,snapshot,planning:planned,sourceIdentity,configurationIdentity:digest(launchConfiguration)});captureProposals.add(proposal);preparationFacts.add(proposal);retained.captureProposal=proposal;}
        if(!operationOnly&&operationBasis)await phase('operation-evidence',async()=>{
          retained.operationEvidence=await verifyFinalOperationEvidence({project:c.project,planning:planned,basis:operationBasis,launchConfiguration,store,executionRoot:root,providerRoot,current});
          (retained.operationEvidence.kind==='invalid'?invalid:blockers).push(...retained.operationEvidence.blockers);
        });
      }else if(!operationOnly)blockers.push({code:'FINAL_OPERATION_ACTUAL_PLAN_AND_LAUNCH_REQUIRED'});
      if(!operationOnly&&!operationBasis)blockers.push({code:'FINAL_OPERATION_CAPTURE_REQUIRED'});
      current();need(digest(store.read(projectId))===c.guard,'FINAL_READ_CHANGED','Project semantic records changed under the observed revision');
      if(!invalid.length&&!blockers.length&&planned?.kind==='planned')return {kind:'ready',observedRevision,snapshot,input:planned.input,plan:planned.plan,retained,accounting,blockers:planned.blockers,...flags};
      return {kind:invalid.length?'invalid_basis':'blocked',observedRevision,retained,accounting,blockers:[...blockers,...invalid,...(planned?.blockers??[])],limitations:['An assembled candidate is authoritative only when every reader duty closes and planning succeeds.','Registered history identity does not prove original domain validity or finding applicability.','Final adapter capability remains distinct from setup declarations.','File and decoder checks are bounded observations; future effects must revalidate.'],...flags};
    }catch(error){issue(error,'operation');return {kind:invalid.length?'invalid_basis':'blocked',observedRevision,retained,accounting,blockers:[...blockers,...invalid],...flags};}
  }
  const observed=outcome=>{
    const value=outcome.value??{kind:'blocked',observedRevision:null,retained:{},blockers:[],...flags};
    const accounting={...value.accounting,snapshotReads:outcome.usage};
    if (outcome.kind==='complete') return {...value,accounting};
    const blocker={code:outcome.code,message:outcome.message,phase:'snapshot-read-admission'};
    const kind=admissionBlocked(outcome.code)||absence.has(outcome.code)?'blocked':'invalid_basis';
    return {...value,kind,admission:{kind:outcome.kind,code:outcome.code,retainedResultKind:value.kind},accounting,blockers:[...(value.blockers??[]),blocker],...(outcome.error?{operationFailure:{code:outcome.error.code??'FINAL_READ_FAILED',message:outcome.error.message}}:{})};
  };
  const inspectBasis=projectId=>observed(store.withReadAdmission(projectId,FINAL_READ_ALLOWANCE,()=>inspectBasisWithinAdmission(projectId)));
  const readSnapshot=async projectId=>observed(await store.withReadAdmission(projectId,FINAL_READ_ALLOWANCE,()=>readSnapshotWithinAdmission(projectId)));
  const inspectPreparation=async projectId=>{const result=observed(await store.withReadAdmission(projectId,FINAL_READ_ALLOWANCE,()=>readSnapshotWithinAdmission(projectId,true,true)));if(result.kind==='inspected'){preparationFacts.add(result);immutable(result);}return result;};
  const acquireOperationCapture=async projectId=>observed(await store.withReadAdmission(projectId,FINAL_READ_ALLOWANCE,()=>readSnapshotWithinAdmission(projectId,true)));
  const readOperationBasis=async projectId=>{const result=await acquireOperationCapture(projectId);return result.kind==='ready'&&result.retained.operationBasis?{kind:'captured',observedRevision:result.observedRevision,basis:result.retained.operationBasis,liveAccounting:result.retained.authority.liveAccounting}:{kind:result.kind==='ready'?'blocked':result.kind,observedRevision:result.observedRevision,blockers:[...result.blockers,...(result.kind==='ready'?[{code:'FINAL_OPERATION_CAPTURE_REQUIRED'}]:[])]};};
  const readEngineeringSnapshot=async(projectId,request)=>{
    need(request&&Object.keys(request).sort().join(',')==='expectedRevision,layoutRootJobId'&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0&&typeof request.layoutRootJobId==='string'&&request.layoutRootJobId.length>0,'LOCAL_ENGINEERING_REQUEST_REQUIRED','Only exact current revision and layout identity accepted');
    const admission=await store.withReadAdmission(projectId,FINAL_READ_ALLOWANCE,async()=>immutable(await readSnapshotWithinAdmission(projectId,true,false,{...request,key:engineeringReadKey})));
    const result=observed(admission);
    if(result.kind==='engineering_ready'){
      need(engineeringCandidates.has(admission.value)&&admission.kind==='complete'&&result.blockers.length===0&&!result.admission,'LOCAL_ENGINEERING_ADMISSION_REQUIRED','Actual complete read admission required');
      const projectHash=digest(store.read(projectId));need(store.read(projectId).revision===result.observedRevision,'FINAL_READ_CHANGED','Project changed after read admission');
      engineeringFacts.set(result,{store,projectHash});immutable(result);
    }
    return result;
  };
  const reader=Object.freeze({inspectBasis,inspectPreparation,readSnapshot,readOperationBasis,acquireOperationCapture,readEngineeringSnapshot});operationReaders.set(reader,{store,launchConfiguration});return reader;
}
