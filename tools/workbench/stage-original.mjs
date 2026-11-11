import {ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {verifyResearchAcquisitionOriginal} from './research-acquisition-original.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {loadSavedReadinessProof} from './readiness-evidence.mjs';
import {researchChartMetadata} from './research-chart-data.mjs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {DomainError,ownerCopyTask,validateStoredReview} from './project.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {parseCodexEvents} from './codex-provider.mjs';
import {imageManifest} from './image-evidence.mjs';
import {buildStageRequest,validateStageOutput} from './stage-content.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(value,message)=>{if(!value)throw new DomainError('STAGE_ORIGINAL_INVALID',message);};
const one=(items,id)=>{const matches=items.filter(item=>item.id===id);need(matches.length===1,'Exactly one registered original required');return matches[0];};
const text=async(root,path)=>(await readManagedLayoutBytes(root,path)).toString('utf8');

export async function readStageInvocationOriginal(project,job,attempt,{executionRoot}) {
 const receipt=attempt.receipt;
 need(ordinaryOriginMatches(receipt,attempt.httpAttemptLocator,attempt.id),'ORDINARY_ORIGIN_CHANGED','Retained attempt changed persisted HTTP origin');
 if(isOrdinaryHttp(receipt)){
  const {ordinaryJobInput}=await import('./ordinary-model-project.mjs');
  const rebuilt=await ordinaryJobInput(project,job,attempt,{executionRoot});
  const packetText=await text(executionRoot,join(executionRoot,attempt.id,'packet.json'));
  need(Buffer.from(packetText).equals(rebuilt.runtimePacketBytes),'Exact independently rebuilt frozen HTTP domain packet required');
  const result=await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,...rebuilt,images:receipt.images??[],receipt});
  const request=rebuilt.request,input={runId:attempt.id,model:job.binding.model,prompt:request.prompt,...(request.outputSchema===undefined?{}:{outputSchema:request.outputSchema}),...(receipt.images?.length?{images:imageManifest(receipt.images,request.imageEnvelope)}:{}),...(request.imageEnvelope?{imageEnvelope:request.imageEnvelope}:{})};
  return {packet:JSON.parse(packetText),input,inputText:JSON.stringify(input),diskReceipt:result.providerExecution,outputText:result.responseText};
 }
 need(receipt?.provider==='codex-cli','Provider disk receipt verifier not implemented');
 const inputText=await text(executionRoot,receipt.paths.input),input=JSON.parse(inputText);
 need(hash(inputText)===receipt.inputPacketHash&&input.runId===attempt.id&&input.model===job.binding.model,'Provider input does not match saved attempt');
 const packet=JSON.parse(await text(executionRoot,join(executionRoot,attempt.id,'packet.json')));
 need(packet.attemptId===attempt.id&&packet.jobId===job.id&&packet.projectId===project.id&&packet.prompt===input.prompt&&equal(packet.outputSchema,input.outputSchema)&&equal(packet.sourceRecords,job.task.sourceRecords??[])&&equal(packet.inputVersionIds,job.inputVersionIds),'Execution packet does not match provider input');
 const diskReceipt=JSON.parse(await text(executionRoot,receipt.paths.receipt));
 const {responseText,parsedOutput,schemaValidated,...originalDiskReceipt}=receipt.providerExecution??{};
 need(equal(diskReceipt,originalDiskReceipt),'Provider disk receipt changed');
 need(['runId','threadId','inputPacketHash','requestedModel','exitCode'].every(key=>Object.hasOwn(diskReceipt,key)),'Provider disk receipt is incomplete');
 const outputText=await text(executionRoot,receipt.paths.output);
 need(outputText===receipt.responseText,'Saved output bytes changed');
 const events=parseCodexEvents(await text(executionRoot,receipt.paths.stdout));
 need(events.completed&&!events.failed&&events.threadId===receipt.threadId,'Provider completion cannot be corroborated');
 return {packet,input,inputText,diskReceipt,outputText};
}

export async function verifyStageOriginal(project,artifact,{executionRoot}) {
 need(equal(one(project.artifacts,artifact.id),artifact),'Exact registered stage artifact required');
 need(artifact.provenance==='provider_execution','Imported metadata is not executed production');
 need(!artifact.reconciliationId,'Recovered stage production requires its dedicated original adapter');
 const producers=project.jobs.filter(job=>job.outputVersionIds?.includes(artifact.id));
 need(producers.length===1,'Exactly one registered producer required');
 const job=producers[0];
 need(['research','strategy','copy'].includes(job.stage)&&(!job.purpose||job.purpose==='stage')&&['succeeded','succeeded_stale'].includes(job.status)&&equal(job.outputVersionIds,[artifact.id]),'Successful ordinary stage producer required');
 need(!job.task.revisionInput&&!job.task.correctionInput&&!job.task.researchRevision,'Revision production requires its exact revision original adapter');
 need(!job.task.visualCatalogue?.length,'Visual catalogue production requires exact observation original dependencies');
 need(job.stage===artifact.stage&&equal(job.inputVersionIds,artifact.inputVersionIds),'Stage producer inputs changed');
 const attempt=one(job.attempts,job.attemptId),receipt=artifact.executionReceipt;
 need(attempt.status==='succeeded'&&equal(receipt,attempt.receipt)&&equal(Object.fromEntries(Object.entries(artifact.author).filter(([key])=>key!=='now')),Object.fromEntries(Object.entries(attempt.executor).filter(([key])=>key!=='now'))),'Successful original claiming executor required');
 need(receipt.attemptId===attempt.id&&receipt.runId===attempt.id&&receipt.providerId===job.binding.providerId&&receipt.model===job.binding.model&&receipt.requestedModel===job.binding.model&&receipt.role===job.binding.role&&receipt.taskId===job.task.id,'Frozen provider binding changed');
 need(ordinaryHasContext(receipt)&&ordinarySuccessfulStatus(receipt)&&['signal','reason','error'].every(key=>receipt[key]==null),'Successful original provider invocation required');
 need(receipt.providerExecution&&Object.entries(receipt.providerExecution).every(([key,value])=>equal(receipt[key],value)),'Provider original and enriched receipt disagree');
 if(job.task.researchDataBasis?.acquisition)await verifyResearchAcquisitionOriginal(project,job.task.researchDataBasis.acquisition,{executionRoot,historical:true});
 const original=await readStageInvocationOriginal(project,job,attempt,{executionRoot});
 const parsed=JSON.parse(original.outputText);
 need(!Object.hasOwn(receipt,'parsedOutput')||equal(receipt.parsedOutput,parsed),'Original parsed response changed');
 const card=one(project.taskCards,job.task.taskCardId);
 need(card.brief===job.task.brief,'Frozen task brief changed');
 if(job.task.researchContractVersion)need(equal(card,job.task.researchDataBasis.taskCard)&&job.task.researchDataBasis.confirmations.every(c=>project.confirmations.some(actual=>equal(actual,c))),'Full original task card or confirmations changed');
 const dependencies=[{kind:'task_card',taskCardId:card.id}],inputArtifacts=[];
 for(const [index,id] of job.inputVersionIds.entries()){
  const cards=project.taskCards.filter(card=>card.id===id);
  if(cards.length){const card=one(project.taskCards,id);need(card.brief===job.task.brief,'Frozen task brief changed');dependencies.push({kind:'task_card',taskCardId:id,inputIndex:index});continue;}
  const source=one(project.artifacts,id),loaded=await readArtifactContent(project,id,executionRoot);
  inputArtifacts.push({id,stage:source.stage,content:loaded.content,...(job.task.upstreamReviewConstraints?.[id]?{reviewConstraints:job.task.upstreamReviewConstraints[id]}:{})});
  dependencies.push({kind:'artifact',artifactId:id,contentHash:source.contentHash,provenance:source.provenance,inputIndex:index});
 }
 for(const [artifactId,constraints] of Object.entries(job.task.upstreamReviewConstraints??{}))dependencies.push({kind:'upstream_review_constraints',artifactId,constraints:structuredClone(constraints)});
 const request=buildStageRequest({stage:job.stage,brief:job.task.brief,inputArtifacts,sourceRecords:job.task.sourceRecords??[],visualCatalogue:[],copyContractVersion:job.task.copyContractVersion,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis});
 need(equal(original.packet,{projectId:project.id,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...request}),'Original stage request changed');
 need(equal(original.input,{runId:attempt.id,model:job.binding.model,...request}),'Original provider input has unsupported fields or changed request');
 const output=validateStageOutput(job.stage,parsed,{sourceRecords:job.task.sourceRecords??[],visualCatalogue:[],copyContractVersion:job.task.copyContractVersion,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis});
 need(output.status!=='blocked'&&output.outputKind!=='research_plan','Blocked output is not completed stage production');
 const raw=JSON.stringify(output.content,null,2),file=join(executionRoot,attempt.id,'output.json');
 need(resolve(artifact.payloadRef)===resolve(file)&&resolve(receipt.validatedOutputPath)===resolve(file)&&artifact.contentHash===hash(raw)&&receipt.validatedOutputHash===artifact.contentHash,'Original normalized artifact identity changed');
 need(await text(executionRoot,file)===raw&&equal(artifact.claims,output.claims),'Original normalized artifact or claims changed');
 need(equal(artifact.technicalReceipts,{sourceCatalogue:{version:1,records:job.task.sourceRecords??[]},visualCatalogue:[]}),'Original source catalogue provenance changed');
 if(job.task.researchContractVersion)need(equal(artifact.researchData,researchChartMetadata(job,output,artifact.contentHash).researchData),'Original research data metadata changed');
 if(job.task.strategyContractVersion)need(equal(artifact.strategyContract,{version:job.task.strategyContractVersion,basisHash:job.task.strategyBasis.basisHash,contentHash:artifact.contentHash,status:output.strategy.answer.decision}),'Original strategy contract changed');
 if(job.stage==='copy')need(equal(artifact.copyContract,{version:job.task.copyContractVersion??'copy-message-v1',status:job.task.copyContractVersion==='copy-message-v2'?'complete':'missing_required_parts',contentHash:artifact.contentHash}),'Original copy contract changed');
 const completions=[],registrations=[],claims=[];let commandBytes=0;
 need(Number.isSafeInteger(project.revision)&&project.revision>=1,'Valid project revision required');
 const witness=(id,command,actorId)=>{
  need(id===command.commandId,'Original command identity changed');
  const audits=project.audit.filter(item=>item.commandId===id),audit=audits[0];
  need(audits.length===1&&audit.kind===command.kind&&typeof actorId==='string'&&actorId.length>0&&audit.actorId===actorId,'Exact original command audit witness required');
  need(Number.isSafeInteger(audit.revision)&&audit.revision>=1&&audit.revision<=project.revision&&project.audit.filter(item=>item.revision===audit.revision).length===1,'Unique historical command revision required');
  return {id,revision:audit.revision};
 };
 need(Object.keys(project.processedCommands).length<=8192,'Command count allowance exhausted');
 for(const [id,fingerprint] of Object.entries(project.processedCommands)){
  need(typeof fingerprint==='string'&&Buffer.byteLength(fingerprint)<=8*1024*1024,'Bounded original command fingerprint required');
  commandBytes+=Buffer.byteLength(fingerprint);need(commandBytes<=64*1024*1024,'Command byte allowance exhausted');
  const command=JSON.parse(fingerprint);
  if(command.kind==='commit-owner-edge'&&command.edgeId===job.task.ownerEdgeId){
   const edge=one(project.ownerEdges,command.edgeId);
   need(job.stage==='copy'&&edge.commit?.jobId===job.id&&edge.commit.commandId===id&&equal(command.task,job.task)&&equal(command.binding,job.binding)&&equal(ownerCopyTask(project,edge),job.task)&&equal(job.inputVersionIds,[edge.envelope.source.artifactId]),'Original committed copy registration changed');
   registrations.push(witness(id,command,job.requestedBy));
  }
  if(command.jobId!==job.id)continue;
  if(command.kind==='request-stage'){need(command.stage===job.stage&&equal(command.task,Object.fromEntries(Object.entries(job.task).filter(([k])=>k!=='strategyInputArtifacts')))&&equal(command.binding,job.binding),'Original registered production task changed');registrations.push(witness(id,command,job.requestedBy));}
  if(['start-job','retry-job'].includes(command.kind)&&command.attemptId===attempt.id){claims.push(witness(id,command,attempt.executor.actorId));}
  if(command.kind!=='complete-stage')continue;
  need(id===command.commandId&&command.attemptId===attempt.id&&command.artifactId===artifact.id&&command.payloadRef===artifact.payloadRef&&command.contentHash===artifact.contentHash&&equal(command.executionReceipt,receipt)&&equal(command.claims,artifact.claims)&&equal(command.technicalReceipts,artifact.technicalReceipts),'Original completion command changed');
  completions.push(witness(id,command,artifact.author.actorId));
 }
 need(registrations.length===1&&claims.length===1,'Exactly one task registration and successful attempt claim required');
 need(completions.length===1,'Exactly one original completion witness required');
 need(registrations[0].revision<claims[0].revision&&claims[0].revision<completions[0].revision,'Registration, claim and completion history must be ordered');
 return {kind:'ordinary_stage_original',artifactId:artifact.id,contentHash:artifact.contentHash,stage:job.stage,jobId:job.id,attemptId:attempt.id,provenance:artifact.provenance,projection:output.content,dependencies,commandId:completions[0].id};
}

export async function verifyResearchDataOriginal(project,artifact,{executionRoot}){
 need(equal(one(project.artifacts,artifact.id),artifact)&&artifact.provenance==='provider_execution','Registered numerical research original required');
 const producers=project.jobs.filter(job=>job.outputVersionIds?.includes(artifact.id));need(producers.length===1,'Unique numerical producer required');
 const job=producers[0],attempt=one(job.attempts,job.attemptId);
 need(job.stage==='research'&&job.task?.researchContractVersion==='research-data-v2'&&job.task.researchDataBasis&&equal(attempt.receipt,artifact.executionReceipt),'Exact numerical producer and saved receipt required');
 if(job.task.researchDataBasis?.acquisition)await verifyResearchAcquisitionOriginal(project,job.task.researchDataBasis.acquisition,{executionRoot,historical:true});
 const original=await readStageInvocationOriginal(project,job,attempt,{executionRoot});
 const options={sourceRecords:job.task.sourceRecords??[],visualCatalogue:job.task.visualCatalogue??[],revisionInput:job.task.revisionInput,correctionInput:job.task.correctionInput,researchRevision:job.task.researchRevision,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis};
 const request=buildStageRequest({stage:'research',brief:job.task.brief,inputArtifacts:job.task.revisionInputArtifacts??[],...options});
 const materials=(job.task.correctionInput??job.task.revisionInput)?.materials;
 need(equal(original.packet,{projectId:project.id,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...request})&&equal(original.input,{runId:attempt.id,model:job.binding.model,...request,...(materials?.length?{images:materials}:{})}),'Original numerical request changed');
 const output=validateStageOutput('research',original.outputText,options),loaded=await readArtifactContent(project,artifact.id,executionRoot);
 need(loaded.contentText===JSON.stringify(output.content,null,2)&&equal(artifact.claims,output.claims)&&equal(artifact.researchData,researchChartMetadata(job,output,artifact.contentHash).researchData),'Actual numerical normalized bytes or metadata changed');
 need(equal(one(project.taskCards,job.task.taskCardId),job.task.researchDataBasis.taskCard),'Original full task card changed');
 for(const [kind,collection] of [['verification','verifications'],['readiness','readinessReports'],['handoff','handoffReports']])for(const report of project[collection]??[]){
  if(report.artifactId!==artifact.id)continue;
  const reviewJob=one(project.jobs,report.jobId),reviewAttempt=one(reviewJob.attempts,report.attemptId);
  if(kind==='readiness'&&report.resolutionId){
   const proof=await loadSavedReadinessProof(executionRoot,project.id,reviewJob,reviewAttempt),resolution=one(project.readinessResolutions??[],report.resolutionId);
   need(resolution.kind==='recovered-result'&&resolution.jobId===reviewJob.id&&resolution.attemptId===reviewAttempt.id&&equal(resolution.proof,proof),'Recovered numerical readiness proof changed');
   validateStoredReview(project,kind,report);
   need(proof&&proof.normalizedReportHash===report.reportHash&&hash(await text(executionRoot,report.payloadRef))===report.reportHash,'Recovered numerical readiness original changed');
  }else{
   await verifyReviewOriginal(project,kind,report,{executionRoot});
   if(report.executionReceipt?.provider!=='split-readiness-composite-v1')await readStageInvocationOriginal(project,reviewJob,reviewAttempt,{executionRoot});
  }
 }
 return {artifactId:artifact.id,contentHash:artifact.contentHash,responseHash:hash(original.outputText),requestHash:artifact.executionReceipt.inputPacketHash};
}
