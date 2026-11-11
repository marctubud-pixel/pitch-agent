import {createHash,randomUUID} from 'node:crypto';
import {CONTENT_PROTOCOL,CONTENT_PURPOSES,contentNodes,obligationText,validateManuscript,requireCompleteContent} from './complete-content.mjs';
import {materialFragments,occurrenceScopes,affectedContentRelations} from './content-visibility.mjs';
import {contentSourceEnvelope,copyDeliveryEnvelope} from './project.mjs';
import {requireFinalVisual} from './final-visual.mjs';
const clone=structuredClone;
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const limitation='Local synthetic content continuity fixture only; no independent human brand approval, real consumer research or commercial quality was verified.';
export function localContentConfiguration({strategyBinding,copyBinding}={}){
 for(const [b,role]of [[strategyBinding,'strategy-lead'],[copyBinding,'copy-lead']])need(b?.providerId==='local-synthetic'&&b.model==='synthetic'&&b.role===role,'LOCAL_CONTENT_SOURCE_BINDING_REQUIRED');
 const bindings={strategy:clone(strategyBinding),copy:clone(copyBinding)},capabilities={};
 for(const n of contentNodes()){
  const key=n.key==='producer:strategy'?'strategy':n.key==='producer:copy'?'copy':`content_${n.key.replaceAll(':','_')}`;
  bindings[key]??={providerId:'local-synthetic',model:'synthetic',role:n.role};
  capabilities[n.key]={operation:CONTENT_PROTOCOL,packetVersion:'content-packet-v3',assignment:{providerId:bindings[key].providerId,model:bindings[key].model},status:'synthetic_fixture',origin:'local-acceptance',version:'1',limitations:[limitation],maxImages:64,maxBytes:64*1024*1024,maxPixels:128*1024*1024};
 }
 return {bindings,contentConfiguration:{packetVersion:'content-packet-v3',capabilities,allowance:{maxCalls:39,previousMaxCalls:13,origin:'local-acceptance',version:'1',reason:'One initial thirteen-node graph plus bounded revisions; synthetic mechanism only.'}}};
}
export function localContentManuscript(neutral){
 need(neutral.schemaVersion==='content-source-v2'&&neutral.visibility,'LOCAL_CONTENT_V3_SOURCE_REQUIRED');
 const source={...neutral,visual:{...neutral.visual,payload:{directions:neutral.visual.directions}}};
 need(!source.visibility.sourceReturns.length,'LOCAL_CONTENT_SOURCE_RETURN_REQUIRED');
 const clauses=source.visibility.clauses,ordinary=source.obligations.filter(o=>!clauses.some(c=>c.clauseId===o.originId));
 const narrativeBlocks=[],visibleObligations=[],pageIntents=[],clausePlacements=[];
 for(const [index,o]of ordinary.entries()){
  const id='body-'+index,pid='page-'+index,image=o.kind==='image'?o.value.imageId:null;
  const block=image?null:{id,kind:'source',text:obligationText(o),originIds:[o.originId]};if(block)narrativeBlocks.push(block);
  const intent={id:pid,central:image?{kind:'image',imageId:image}:{kind:'text',exactText:block.text.slice(0,100)},heroImageId:image,blockIds:block?[id]:[],imageIds:image?[image]:[],allowedSplitAfterBlockIds:block?[id]:[]};pageIntents.push(intent);
  visibleObligations.push({originId:o.originId,value:clone(o.value),blockIds:intent.blockIds.slice(),imageIds:intent.imageIds.slice(),pageIntentIds:[pid]});
 }
 const m={schemaVersion:'complete-manuscript-v2',title:'品牌提案｜从既定策略到三组创意表达（本地工程样本）',narrativeBlocks,directions:source.visual.directions.map(d=>({directionId:d.directionId,rendererDirectionId:source.directionMap.find(x=>x.sourceDirectionId===d.directionId).rendererDirectionId,approvedCopy:clone(d.approvedCopy),explanation:d.explanation,presentationIntent:d.presentationIntent,claims:clone(d.claims),limitations:clone(d.limitations),targets:clone(d.targets)})),claims:clone(source.claims),sources:clone(source.sources),visibleObligations,pageIntents,edits:[],clausePlacements};
 for(const [index,c]of clauses.entries()){
  const fragments=materialFragments(c.content),text=fragments.join('\n'),block={id:'clause-'+index,kind:'source',text,originIds:[c.clauseId]},ranges=[];let start=0;
  for(const fragment of fragments){ranges.push({start,end:start+fragment.length});start+=fragment.length+1;}
  narrativeBlocks.push(block);
  for(const occurrence of source.visibility.occurrences.filter(o=>o.clauseId===c.clauseId))for(const scope of occurrenceScopes(occurrence))for(const relation of affectedContentRelations(m,source,occurrence,scope)){
   const page=pageIntents.find(p=>p.id===relation.intentId);if(!page.blockIds.includes(block.id))page.blockIds.push(block.id);
   clausePlacements.push({clauseId:c.clauseId,occurrenceScopeKeys:[scope.key],exactFragmentRanges:clone(ranges),blockId:block.id,affectedBlockIds:relation.blockIds,affectedImageIds:relation.imageIds,pageIntentIds:[page.id]});
  }
 }
 validateManuscript(m,source);return m;
}
export function localContentResponse({job,request,packet}){
 if(!CONTENT_PURPOSES.includes(job.purpose))return undefined;
 const input=packet??JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
 need(input.protocol===CONTENT_PROTOCOL&&input.packetVersion==='content-packet-v3','LOCAL_CONTENT_PACKET_REQUIRED');
 const source=input.neutral;need(!source.visibility?.sourceReturns.length,'LOCAL_CONTENT_SOURCE_RETURN_REQUIRED');
 const raw={protocol:CONTENT_PROTOCOL,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,findings:[]},evidence=source.obligations.map(o=>({originId:o.originId,observation:limitation})),restrictions=source.obligations.filter(o=>['restriction','limitation','qualification'].includes(o.kind));
 if(input.phase==='plan'){const manifest=input.planningManifest;need(manifest,'LOCAL_CONTENT_PLANNING_MANIFEST_REQUIRED');return {...raw,workOrder:{objective:'以品牌策略立场梳理完整论证、三组既定创意与明确限制，不新增未经支持的事实。'+limitation,productionDirector:clone(manifest.productionDirector),moduleOwners:clone(manifest.moduleOwners),specialistRequirements:clone(manifest.requiredSpecialists),limits:clone(manifest.limits),returns:clone(manifest.returns)}};}
 if(input.phase==='producer'||input.phase.startsWith('layout_'))return {...raw,decision:'accept',understanding:limitation,acceptedOriginIds:source.obligations.map(o=>o.originId),restrictions:clone(restrictions),...(input.phase.startsWith('layout_')?{manuscriptHash:input.manuscriptHash,pageIntentIds:input.manuscript.pageIntents.map(i=>i.id),directionMap:clone(source.directionMap)}:{})};
 if(input.phase==='author')return {...raw,decision:'accept',acceptedLegs:['strategy','copy','visual'].map(stage=>({stage,artifactId:source[stage].artifactId,contentHash:source[stage].contentHash,accepted:true})),manuscript:localContentManuscript(source)};
 if(input.phase==='director'){
  need(input.findings.length===0,'LOCAL_CONTENT_DISSENT_REQUIRES_AUTHOR');return {...raw,decision:'accept',dispositions:[],criteria:['completeness','factual_boundaries','sources','visual_copy','page_intents','limitations'].map(name=>({name,status:'pass',evidence:clone(evidence)}))};
 }
 need(['first','blind','challenge'].includes(input.phase),'LOCAL_CONTENT_PHASE_UNSUPPORTED');
 if(input.phase==='challenge')need(input.predecessors.every(p=>p.findings.length===0),'LOCAL_CONTENT_DISSENT_REQUIRES_AUTHOR');
 return {...raw,verdict:'accept',reading:limitation,evidence,imageEvidence:input.images.map(i=>({...i,observation:limitation})),...(input.phase==='challenge'?{preservedBlind:clone(input.predecessors.find(p=>p.nodeKey.startsWith('blind:')).raw),challenges:[]}:{})};
}
export function createLocalContentDriver({projectStore,executor,configuration}={}){
 const idOf=ctx=>ctx.case?.projectId??ctx.project.id,marked={syntheticOnly:true,realQualityVerified:false};
 async function inspect(ctx){try{
  need(configuration?.contentConfiguration?.packetVersion==='content-packet-v3'&&executor.contentCapability().configured,'LOCAL_CONTENT_CONFIGURATION_REQUIRED');
  const p=projectStore.read(idOf(ctx)),visual=p.artifacts.find(a=>a.id===p.activeByStage.visual);need(visual,'LOCAL_CONTENT_VISUAL_REQUIRED');await executor.verifyFinalVisual(p.id,visual);requireFinalVisual(p,visual,copyDeliveryEnvelope);need(p.releases.some(r=>r.artifactId===visual.id&&r.policyVersion===p.policies.at(-1).version),'LOCAL_CONTENT_VISUAL_RELEASE_REQUIRED');
  const status=executor.contentStatus(p.id);
  if(status.status==='awaiting_selected_human')return {status:'awaiting_user',reason:'HUMAN_GATE',artifactId:status.artifactId,draftHash:status.draftHash,...marked};
  if(status.status==='blocked')return {status:'blocked',reason:status.reason??'LOCAL_CONTENT_GRAPH_BLOCKED',...marked};
  if(status.status==='ready_for_layout'){
   const draft=await executor.contentDraft(p.id),a=p.artifacts.find(a=>a.id===draft.artifactId);need(a?.id===p.activeByStage.content_review,'LOCAL_CONTENT_CURRENT_ARTIFACT_REQUIRED');requireCompleteContent(p,a,contentSourceEnvelope);
   const jobs=p.jobs.filter(j=>j.contentRootJobId===status.rootJobId);need(jobs.length===contentNodes().length&&jobs.every(j=>j.status==='succeeded'),'LOCAL_CONTENT_JOBS_INCOMPLETE');
   need(p.releases.some(r=>r.artifactId===a.id&&r.sourceHash===status.sourceHash&&r.policyVersion===p.policies.at(-1).version),'LOCAL_CONTENT_RELEASE_REQUIRED');
   return {status:'complete',deliveryReady:true,artifactId:a.id,resultIds:[a.id],rootJobId:status.rootJobId,jobIds:jobs.map(j=>j.id),...marked};
  }
  return {status:'pending',nextOperation:status.status==='not_requested'?'request':'advance',rootJobId:status.rootJobId,...marked};
 }catch(e){return {status:'blocked',reason:e.code??'LOCAL_CONTENT_INSPECTION_FAILED',...marked};}}
 async function advance(ctx){const state=await inspect(ctx);if(state.status!=='pending')return state;const id=idOf(ctx),p=projectStore.read(id),result=state.nextOperation==='request'?await executor.continueContent(id,{commandId:'local-content-'+hash([id,p.activeByStage.visual]),expectedRevision:p.revision}):await executor.advanceContent(id);if(result.queuedJobIds?.length)await executor.execute(id,result.queuedJobIds[0]);else if(result.status==='blocked')return {status:'blocked',reason:result.reason??'LOCAL_CONTENT_GRAPH_BLOCKED',...marked};return inspect(ctx);}
 async function decide(ctx){const state=await inspect(ctx);need(state.status==='awaiting_user'&&ctx.request?.decision==='approve'&&ctx.request.contribution===undefined,'LOCAL_CONTENT_EXPLICIT_ADOPTION_REQUIRED');await executor.contentDraft(idOf(ctx));const p=projectStore.read(idOf(ctx));projectStore.command(p.id,{kind:'adopt-complete-content',artifactId:state.artifactId,draftHash:state.draftHash,reason:ctx.request.comment||'Explicit adoption of local synthetic engineering manuscript only.',commandId:ctx.request.commandId,expectedRevision:p.revision},{actorType:'human',actorId:'local-acceptance-user',runId:randomUUID(),contextId:randomUUID()});return {disposition:'adopted',artifactId:state.artifactId,...marked};}
 return {inspect,advance,decide};
}
