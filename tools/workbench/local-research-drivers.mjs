import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {output as fixtureOutput,source as syntheticSource} from './research-operator-fixture.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {panelFixtureOutput} from './owner-edge-fixtures.mjs';
import {SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
import {STRATEGY_CREATIVE_PROTOCOL} from './creative-panel.mjs';
import {releaseReadiness,strategyDeliveryEnvelope} from './project.mjs';
import {readArtifactLineageContents} from './artifact-content.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const roles={research:'research-lead',verification:'evidence-reviewer',readiness:'research-readiness-reviewer',semantic:'semantic-challenger',strategy:'strategy-lead',copy:'copy-lead',creative_score_strategy:'strategy-score',creative_opposition_strategy:'strategy-opposition',creative_director:'creative-director'};
export const localResearchBindings=Object.fromEntries(Object.entries(roles).map(([key,role])=>[key,{providerId:'local-synthetic',model:'synthetic',role}]));
export const localResearchSources=[structuredClone(syntheticSource)];
const quoted=request=>request.packet??JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
export function createLocalSyntheticProviders({projectStore,executionRoot,calls=[],handlers=[]}){
 const provider={model:'synthetic',testOnly:true,execute:async request=>{
  const projects=projectStore.list().map(({id})=>projectStore.read(id));
  const matches=projects.flatMap(project=>project.jobs.filter(job=>job.attempts?.some(attempt=>attempt.id===request.runId)).map(job=>({project,job})));
  if(matches.length!==1)throw Object.assign(Error('LOCAL_SYNTHETIC_CURRENT_JOB_REQUIRED'),{code:'LOCAL_SYNTHETIC_CURRENT_JOB_REQUIRED'});
  const {project,job}=matches[0],packet=quoted(request),context={project,job,request,packet};
  let raw;for(const handler of handlers){raw=await handler(context);if(raw!==undefined)break;}
  if(raw===undefined)raw=job.purpose==='creative_review'?panelFixtureOutput(packet):fixtureOutput(request);
  const output=structuredClone(raw);
  if(job.stage==='research'&&(!job.purpose||job.purpose==='stage')){output.title='本地合成调研 · 非真实市场资料';output.summary=syntheticSource.text;}
  calls.push({projectId:project.id,jobId:job.id,attemptId:request.runId,purpose:job.purpose??'stage',stage:job.stage,syntheticOnly:true});
  return diskReceipt(executionRoot,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:`local-synthetic-${request.runId}`,exitCode:0,responseText:JSON.stringify(output),parsedOutput:output,cost:null,usage:{inputTokens:null,outputTokens:null}});
 }};
 return {'local-synthetic':provider};
}
export async function prepareLocalResearchConfiguration({projectStore,executionRoot}){
 await mkdir(executionRoot,{recursive:true});
 const configuration={readinessBinding:localResearchBindings.readiness,challengeBinding:localResearchBindings.semantic,rubricVersion:SEMANTIC_PROTOCOL};
 const current=projectStore.semanticConfiguration(),semanticLease=current?projectStore.attachSemanticConfiguration(configuration):projectStore.registerSemanticConfiguration(configuration,{expectedEpoch:0});
 const content='Local synthetic strategy calibration for engineering lifecycle only; no aesthetic or model-quality approval.';
 const evidenceRef=join(executionRoot,'local-strategy-calibration.txt');await writeFile(evidenceRef,content);
 return {bindings:structuredClone(localResearchBindings),semanticLease,creativeCalibrations:[{protocolVersion:STRATEGY_CREATIVE_PROTOCOL,stage:'strategy',role:'strategy',providerId:'local-synthetic',model:'synthetic',evidenceRef,evidenceHash:createHash('sha256').update(content).digest('hex')}]};
}
const artifact=(p,stage)=>p.artifacts.find(a=>a.id===p.activeByStage[stage]&&a.stage===stage);
const successful=(p,stage,id)=>p.jobs.filter(j=>j.stage===stage&&j.status==='succeeded'&&(j.targetArtifactId===id||j.outputVersionIds?.includes(id))).map(j=>j.id);
const pending=(p,stage,id)=>p.jobs.find(j=>j.stage===stage&&j.status!=='succeeded'&&(id?j.targetArtifactId===id||j.inputVersionIds?.includes(id)||j.outputVersionIds?.includes(id):true));
function stopped(job){return job&&job.status!=='queued'?{status:job.status==='awaiting_reconciliation'?'awaiting_reconciliation':'blocked',reason:job.error?.code??`LOCAL_JOB_${job.status.toUpperCase()}`,jobIds:[job.id],resultIds:[]}:null;}
const stable=(project,part)=>`local-${part}-${digest({id:project.id,card:project.activeTaskCardId,artifact:project.activeByStage.research,policy:project.policies.at(-1).version}).slice(0,48)}`;
export function createLocalResearchDrivers({projectStore,executor,executionRoot,sourceRecords=localResearchSources,copyBinding=localResearchBindings.copy}){
 const read=id=>projectStore.read(id);
 async function run(projectId,id){const result=await executor.execute(projectId,id);return {jobId:result.id,status:result.status};}
 function researchInspect({project}){
  if(!project.confirmations.some(c=>c.taskCardId===project.activeTaskCardId))return {status:'blocked',reason:'TASK_CARD_CONFIRMATION_REQUIRED',jobIds:[],resultIds:[]};
  const a=artifact(project,'research');
  if(a&&releaseReadiness(project,a.id).eligible)return {status:'complete',jobIds:successful(project,'research',a.id),resultIds:[a.id],syntheticOnly:true};
  const job=pending(project,'research',a?.id);const stop=stopped(job);if(stop)return stop;
  return {status:job?'running':'pending',reason:a?releaseReadiness(project,a.id).blockedReasons[0]:'RESEARCH_NOT_STARTED',jobIds:job?[job.id]:[],resultIds:[]};
 }
 async function researchAdvance({project}){
  let p=read(project.id);const inspection=researchInspect({project:p});if(['complete','blocked','awaiting_reconciliation'].includes(inspection.status))return inspection;
  const a=artifact(p,'research');const queued=pending(p,'research',a?.id);if(queued)return run(p.id,queued.id);
  let id;
  if(!a)id=executor.enqueue(p.id,'research',{sourceRecords:structuredClone(sourceRecords),commandId:stable(p,'research'),expectedRevision:p.revision});
  else if(!p.verifications.some(r=>r.artifactId===a.id)){id=await executor.enqueueVerification(p.id,a.id,{commandId:stable(p,'verification'),expectedRevision:p.revision});}
  else if(p.verifications.filter(r=>r.artifactId===a.id).some(r=>r.hasBlockingFindings))return {status:'blocked',reason:'RESEARCH_VERIFICATION_BLOCKED',jobIds:[],resultIds:[]};
  else if(!(p.readinessReports??[]).some(r=>r.artifactId===a.id)){id=await executor.enqueueReadiness(p.id,a.id,{protocolVersion:'research-readiness-v2',commandId:stable(p,'readiness'),expectedRevision:p.revision});}
  else if(!(p.coverageChallenges??[]).some(r=>r.artifactId===a.id)){id=await executor.enqueueSemanticChallenge(p.id,a.id,{commandId:stable(p,'semantic'),expectedRevision:p.revision});}
  else if(!(p.handoffReports??[]).some(r=>r.artifactId===a.id&&r.side==='producer')){id=await executor.enqueueHandoff(p.id,a.id,'producer',{protocolVersion:'research-handoff-v2',commandId:stable(p,'producer'),expectedRevision:p.revision});}
  else if(!(p.handoffReports??[]).some(r=>r.artifactId===a.id&&r.side==='consumer')){id=await executor.enqueueHandoff(p.id,a.id,'consumer',{protocolVersion:'research-handoff-v2',commandId:stable(p,'consumer'),expectedRevision:p.revision});}
  else return {status:'blocked',reason:releaseReadiness(p,a.id).blockedReasons[0]??'LOCAL_RESEARCH_CURRENT_GATE_REQUIRED',jobIds:[],resultIds:[]};
  return run(p.id,id);
 }
 async function strategyInspect({project}){
  const a=artifact(project,'strategy');let deliveryReason=null;
  if(a){
   try{
    const contents=await readArtifactLineageContents(project,a.id,executionRoot);
    const envelope=strategyDeliveryEnvelope(project,a.id,contents,copyBinding);
    return {status:'complete',jobIds:successful(project,'strategy',a.id),resultIds:[a.id],deliveryEnvelopeHash:envelope.envelopeHash,syntheticOnly:true};
   }catch(error){deliveryReason=error.code??'LOCAL_STRATEGY_DELIVERY_INVALID';}
  }
  const job=pending(project,'strategy',a?.id);const stop=stopped(job);if(stop)return stop;
  return {status:job?'running':'pending',reason:a?deliveryReason:'STRATEGY_NOT_STARTED',jobIds:job?[job.id]:[],resultIds:[]};
 }
 async function strategyAdvance({project}){
  let p=read(project.id);const inspection=await strategyInspect({project:p});if(['complete','blocked','awaiting_reconciliation'].includes(inspection.status))return inspection;
  const a=artifact(p,'strategy'),queued=pending(p,'strategy',a?.id);if(queued)return run(p.id,queued.id);
  if(!a){const research=artifact(p,'research');if(!research||!releaseReadiness(p,research.id).eligible)return {status:'blocked',reason:'RESEARCH_RELEASE_BLOCKED',jobIds:[],resultIds:[]};const id=executor.continueResearch(p.id,{artifactId:research.id,policyVersion:p.policies.at(-1).version,commandId:stable(p,'strategy'),expectedRevision:p.revision});return run(p.id,id);}
  if(!p.verifications.some(r=>r.artifactId===a.id))return run(p.id,await executor.enqueueVerification(p.id,a.id,{commandId:`${a.id}-verification`,expectedRevision:p.revision}));
  if(p.verifications.some(r=>r.artifactId===a.id&&r.hasBlockingFindings))return {status:'blocked',reason:'STRATEGY_VERIFICATION_BLOCKED',jobIds:[],resultIds:[]};
  const panel=(p.creativePanels??[]).findLast(x=>x.packet.artifactId===a.id&&x.packet.policyVersion===p.policies.at(-1).version);
  if(!panel){await executor.enqueueCreativePanel(p.id,{artifactId:a.id,commandId:`${a.id}-creative-panel`,expectedRevision:p.revision});return {status:'running',reason:'STRATEGY_CREATIVE_PANEL_ENQUEUED'};}
  const ids=executor.advanceCreativePanels(p.id);if(ids.length)return run(p.id,ids[0]);
  const current=await strategyInspect({project:read(p.id)});return current.status==='complete'?current:{...current,status:'blocked',reason:current.reason??'STRATEGY_CREATIVE_PANEL_NOT_PASSED'};
 }
 return {research:{inspect:researchInspect,advance:researchAdvance},strategy:{inspect:strategyInspect,advance:strategyAdvance}};
}
