import {object,records,text,type Snapshot} from './dto';
import {sha256} from './sha256';
import {sameAcquisitionValue as same} from './researchAcquisitionProjection';
import {inspectSketchGenerationMetadata,inspectReviewedArtifactMetadata,inspectSketchUnresolvedMetadata} from './sketch-contracts/inspect.mjs';
const hash=(v:unknown)=>sha256(JSON.stringify(v));
export interface SketchReadScope {jobs:Set<Record<string,unknown>>;artifacts:Set<Record<string,unknown>>;states:Array<{generationId:string;kind:'unsupported'|'native_source_qualified'|'unresolved';reason:string|null;artifact:'absent'|'metadata_only'|'unsupported'}>;writeEligible:false}
const empty=():SketchReadScope=>({jobs:new Set(),artifacts:new Set(),states:[],writeEligible:false});
/** Same-response read scope only. Native qualification stays on the server; U2 verifies frozen display metadata. */
export function sketchReadScope(p:Snapshot):SketchReadScope{
 const scope=empty();if(p.sketchSourceReadback===undefined)return scope;
 try{
  const dto=object(p.sketchSourceReadback),raw=p.native;
  if(!raw||dto.protocolVersion!=='sketch-app-readback-v1'||dto.projectId!==p.id||dto.revision!==p.revision||dto.snapshotSha256!==hash(raw)||dto.snapshotHashEncoding!=='sha256(UTF8(JSON.stringify(nativeProject)))'||dto.writeEligible!==false||dto.appCapabilityGranted!==false)return scope;
  const generations=records(raw.sketchGenerations),inspections=records(dto.inspections);
  if(inspections.length!==generations.length||new Set(generations.map(g=>g.id)).size!==generations.length)return scope;
  for(const g of generations){
   const matches=inspections.filter(i=>object(i.identity??{}).generationId===g.id),r=matches[0];
   if(matches.length!==1||!r||r.protocolVersion!=='sketch-native-source-read-v2'||r.projectId!==p.id||r.revision!==p.revision||r.expectedRevision!==p.revision||r.snapshotSha256!==dto.snapshotSha256||r.snapshotHashEncoding!==dto.snapshotHashEncoding||r.writeEligible!==false||r.appCapabilityGranted!==false||r.physicalIOVerified!==false||object(r.admission).snapshotHash!==dto.snapshotSha256)return empty();
   const state:SketchReadScope['states'][number]={generationId:text(g.id),kind:'unsupported',reason:text(r.reason)||'NATIVE_READBACK_UNSUPPORTED',artifact:'absent'};scope.states.push(state);
   if(r.kind!=='native_source_qualified'&&r.kind!=='unresolved')continue;const stopped=r.kind==='unresolved';
   const source=object(g.source),reference=object(source.referenceSource),copy=object(reference.source),producer=object(reference.producerAssignment??{}),id=object(r.identity),run=records(raw.sketchReviewRuns).find(x=>x.generationId===g.id),method=object(r.method),origin=object(r.methodOrigin),coverage=object(r.coverage),covered=object(coverage.source),current=object(r.currentQualification);
   const expected={taskCardId:object(reference.taskCard).id,taskHash:hash(reference.taskCard),policyHash:hash(reference.policy),copyArtifactId:copy.artifactId,copyContentHash:copy.contentHash,copyProducer:{jobId:producer.jobId??null,attemptId:producer.attemptId??null,bindingHash:producer.binding?hash(producer.binding):null,authorHash:producer.author?hash(producer.author):null,receiptHash:producer.executionReceipt?hash(producer.executionReceipt):null},dossierId:source.dossierId,envelopeHash:source.envelopeHash,selectionHash:source.selectionHash,generationId:g.id,sourceHash:source.sourceHash,planHash:g.plan?object(g.plan).planHash:null,runId:run?.id??null,packetHash:run?.packetHash??null,graphHash:run?hash({nodes:run.nodes,cohorts:run.cohorts,neutral:run.neutral}):null,bindingsHash:hash(g.bindings)};
   if(!same(id,expected)||(!stopped&&(r.reason!==null||current.status!=='passed_original_native_guards'||covered.status!=='complete'||covered.physicalAllFilesClaimed!==false))||(stopped&&(r.reason!=='SKETCH_UNRESOLVED'||current.status!=='stopped_unresolved'))||method.path!=='skills/visual-development-lead/SKILL.md'||method.version!=='1.0.0'||origin.methodHash!==hash(method))continue;
   if(!/^[a-f0-9]{64}$/.test(text(method.sha256))||!['packaging','kv'].includes(text(method.carrier)))continue;
   const appendices=records(method.appendices),paths=['stage-review',text(method.carrier)==='packaging'?'packaging':'kv','records'].map(n=>`skills/visual-development-lead/references/${n}.md`);
   if(appendices.length!==3||!paths.every(path=>appendices.filter(a=>a.path===path&&/^[a-f0-9]{64}$/.test(text(a.sha256))).length===1))continue;
   const intents=records(raw.visualHttpIntents).filter(i=>object(i.request).commandId===origin.commandId),intent=intents[0];
   if(intents.length!==1||!intent||intent.operation!=='sketch-continuations'||object(intent.nativeRequest).commandId!==origin.nativeCommandId||origin.requestHash!==hash(intent.request)||!same(intent.method,method))continue;
   if(records(coverage.images).some(i=>!p.imageAssets.some(a=>a.id===i.imageId&&a.sha256===i.sha256&&a.byteLength===i.byteLength&&a.mediaType===i.mediaType&&a.width===i.width&&a.height===i.height)))continue;
   const jobs=p.jobs.filter(j=>j.generationId===g.id||run&&j.reviewRunId===run.id);
   if(p.activeTaskCardId!==object(reference.taskCard).id||!same(p.cards.find(c=>c.id===p.activeTaskCardId)?.original,reference.taskCard)||!same(records(raw.policies).at(-1),reference.policy))continue;
   if(stopped){const graph=object(r.unresolvedRead);if(graph.kind!=='unresolved'||graph.generationId!==g.id||graph.runId!==(run?.id??null)||graph.jobsHash!==hash(jobs)||graph.attemptsHash!==hash(jobs.map(j=>({id:j.id,status:j.status,attemptId:j.attemptId??null,attempts:j.attempts})))||!same(graph.jobIds,jobs.map(j=>j.id))||graph.physicalIOVerified!==false||graph.writeEligible!==false)continue;}
   const metadata=object(stopped?inspectSketchUnresolvedMetadata(raw,text(g.id)):inspectSketchGenerationMetadata(raw,text(g.id),Boolean(run)));if(metadata.kind!=='metadata_verified'||!stopped&&metadata.currentInput!==true)continue;
   state.kind=stopped?'unresolved':'native_source_qualified';state.reason=stopped?'SKETCH_UNRESOLVED':null;
   for(const j of jobs)scope.jobs.add(j);if(stopped)continue;
   for(const a of p.artifacts.filter(a=>a.stage==='sketch'&&object(a.sketchGeneration??{}).generationId===g.id)){
    const artifact=object(inspectReviewedArtifactMetadata(raw,text(a.id)));state.artifact='unsupported';
    if(artifact.kind==='metadata_verified'){scope.artifacts.add(a);state.artifact='metadata_only';}
   }
  }
  return scope;
 }catch{return empty();}
}
