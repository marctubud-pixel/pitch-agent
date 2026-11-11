import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {releaseReadiness,copyDeliveryEnvelope} from './project.mjs';
import {readArtifactLineageContents} from './artifact-content.mjs';
import {readStageInvocationOriginal} from './stage-original.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {COPY_CREATIVE_PROTOCOL,STRATEGY_CREATIVE_PROTOCOL,CREATIVE_ROLES} from './creative-panel.mjs';
import {syntheticOwnerOutput,panelFixtureOutput} from './owner-edge-fixtures.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=x=>createHash('sha256').update(x).digest('hex');
const data=request=>JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
const unsupported='Synthetic local execution only; no real creative quality, audience preference or product effect was verified.';
export async function localCopyConfiguration({executionRoot,providerId='local-synthetic',model='synthetic'}){
 const roles=['copy','creative_director',...[...new Set([...CREATIVE_ROLES.copy,...CREATIVE_ROLES.strategy])].flatMap(role=>[`creative_score_${role}`,`creative_opposition_${role}`])];
 const bindings=Object.fromEntries(roles.map(role=>[role,{providerId,model,role:role==='copy'?'copy-lead':role}]));
 const evidenceRef=join(executionRoot,'local-copy-calibration.json'),bytes=JSON.stringify({syntheticOnly:true,qualityVerified:false,purpose:'Local pipeline mechanical rubric fixture, not human aesthetic calibration.'});await writeFile(evidenceRef,bytes);
 const creativeCalibrations=[...['strategy','copy'].flatMap(stage=>CREATIVE_ROLES[stage].map(role=>({protocolVersion:stage==='copy'?COPY_CREATIVE_PROTOCOL:STRATEGY_CREATIVE_PROTOCOL,stage,role,providerId,model,evidenceRef,evidenceHash:hash(bytes)})))];
 return {bindings,creativeCalibrations,configuration:{referenceBinding:{providerId,model,role:'references-lead'}}};
}
export function localCopyResponse({job,request,project,case:record}){
 if(job.purpose==='owner_acceptance')return syntheticOwnerOutput(data(request));
 if(job.purpose==='creative_review')return panelFixtureOutput(data(request));
 if(job.stage!=='copy'||job.purpose&&job.purpose!=='stage')return undefined;
 need(record?.caseId===undefined||['m6','dexian'].includes(record.caseId),'LOCAL_COPY_CASE_INVALID');
 const caseId=record?.caseId??(/得闲/.test(project?.name??'')?'dexian':/梦之蓝|M6\+/.test(project?.name??'')?'m6':'dexian');
 const m6=caseId==='m6';
 const directions=(m6?[
 ['steady','万家灯火，同圆新梦','新春灯火点亮万家，也照亮每一份对新年的期许。','稳健延续蓝金品牌质感，以春节灯彩的礼仪圆环和由远及近的万家灯火组织主KV，主角是新春祝愿形成的整体意象，不用桌前单瓶场景。'],
 ['product','以梦为门，开启新年','让梦之蓝的轮廓，成为通向新一年的光。','放大产品轮廓作为春节启新之门，以蓝金光和一处简洁的新春纹理表达新的开始；把品牌的梦与开启新年的动作相扣，不增加功效宣称。'],
 ['user','把新年的梦，郑重相赠','把对来年的祝愿，交到在意的人手中。','放大春节赠礼的情绪，以一枚蓝金礼封和跨越画面的祝愿光带作为视觉载体；借新春封签表达礼意，构成品牌主KV，不用家庭人物或餐桌子海报，也不宣称真实传播效果。']
 ]:[
 ['steady','得闲，坐一桌','有空一起坐坐，把话慢慢聊开。','稳健延续轻松社交表达，以桌面圆形组织包装阅读顺序。'],
 ['product','提起得闲，就有约','把邀请变成一个可以带走的形状。','探索可携带的包装轮廓与邀请卡结构，结构及容量均为待验证概念。'],
 ['user','今晚，不赶场','给相处留一点空，让聊天多一点时间。','放大朋友相处的松弛氛围，以时间留白作为排版和互动开口。']
 ]).map(([id,slogan,supportingCopy,creativeExplanation])=>({id,title:slogan,slogan,supportingCopy,creativeExplanation,rationale:'从已确认的创意任务出发提出有边界的表达假设。',differentiation:creativeExplanation,evidenceIds:[]}));
 return {outputKind:'copy',status:'complete',title:m6?'梦之蓝春节主题文案·本地测试稿':'得闲包装主题文案·本地测试稿',summary:'三个不同机制的主题草案，仅用于本地工程验收。',sections:[{heading:'创意边界',body:unsupported,evidenceIds:[]}],claims:[],gaps:[unsupported,...(!m6?['度数、容量、价格及结构可行性未确认。']:[])],directions};
}
export function createLocalCopyDriver({projectStore,executor,executionRoot,configuration={}}){
 need(projectStore&&executor&&typeof executionRoot==='string','LOCAL_COPY_CONFIGURATION_REQUIRED');
 need(configuration.referenceBinding?.role==='references-lead'&&['providerId','model'].every(k=>typeof configuration.referenceBinding[k]==='string'&&configuration.referenceBinding[k].trim()),'LOCAL_COPY_REFERENCE_BINDING_REQUIRED');
 const projectId=({project,case:record})=>record?.projectId??project.id;
 const relevantJobs=p=>{const current=new Set([p.activeByStage.strategy,p.activeByStage.copy].filter(Boolean));return p.jobs.filter(j=>['owner_acceptance','verification','creative_review'].includes(j.purpose)?current.has(j.targetArtifactId):j.stage==='copy'&&(!j.purpose||j.purpose==='stage')&&(p.activeByStage.copy?j.outputVersionIds?.includes(p.activeByStage.copy):j.inputVersionIds?.includes(p.activeByStage.strategy)));};
 const complete=async p=>{const a=p.artifacts.find(a=>a.id===p.activeByStage.copy&&a.stage==='copy');if(!a)return null;
  const contents=await readArtifactLineageContents(p,a.id,executionRoot);
  const consumerBinding=configuration.referenceBinding;let envelope;try{envelope=copyDeliveryEnvelope(p,a.id,contents,consumerBinding);}catch(e){if(['CREATIVE_PANEL_REQUIRED','CREATIVE_PANEL_INCOMPLETE','HARD_BLOCKER','FEEDBACK_REVIEW_REQUIRED','CORRECTION_REVIEW_REQUIRED'].includes(e.code))return null;throw e;}
  const job=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)),attempt=job.attempts.findLast(x=>x.status==='succeeded');await readStageInvocationOriginal(p,job,attempt,{executionRoot});
  for(const report of p.verifications.filter(r=>r.artifactId===a.id))await verifyReviewOriginal(p,'verification',report,{executionRoot});
  for(const report of p.creativeReports.filter(r=>r.artifactId===a.id))await verifyReviewOriginal(p,'creative_panel',report,{executionRoot});
  return {status:'complete',deliveryReady:true,releaseEligible:releaseReadiness(p,a.id).eligible,deliveryEnvelopeHash:envelope.envelopeHash,consumerBinding,jobIds:[job.id],resultIds:[a.id],syntheticOnly:true,realQualityVerified:false};};
 async function inspect(context){const p=projectStore.read(projectId(context));
  const current=new Set([p.activeByStage.strategy,p.activeByStage.copy].filter(Boolean)),negative=p.verifications.find(r=>current.has(r.artifactId)&&r.hasBlockingFindings);
  if(negative)return {status:'blocked',reason:'LOCAL_COPY_EVIDENCE_REJECTED',reportId:negative.id,syntheticOnly:true};
  const relevant=relevantJobs(p),bad=relevant.find(j=>['failed','blocked','awaiting_reconciliation'].includes(j.status));if(bad)return {status:bad.status==='awaiting_reconciliation'?'awaiting_reconciliation':'blocked',reason:bad.error?.code??'LOCAL_COPY_JOB_BLOCKED',jobId:bad.id,syntheticOnly:true};
  try{const done=await complete(p);if(done)return done;}catch(e){return {status:'blocked',reason:e.code??'LOCAL_COPY_ORIGINAL_INVALID',syntheticOnly:true};}
  return {status:p.activeByStage.strategy?'pending':'blocked',reason:p.activeByStage.strategy?'LOCAL_COPY_ADVANCE_REQUIRED':'STRATEGY_REQUIRED',syntheticOnly:true};}
 async function advance(context){const id=projectId(context);let p=projectStore.read(id);const state=await inspect(context);if(['complete','blocked','awaiting_reconciliation'].includes(state.status))return state;
  const queued=relevantJobs(p).find(j=>j.status==='queued');
  if(queued){await executor.execute(id,queued.id);return inspect(context);}
  const stage=p.activeByStage.copy?'copy':'strategy',artifactId=p.activeByStage[stage],artifact=p.artifacts.find(a=>a.id===artifactId);need(artifact,'STRATEGY_REQUIRED');
  const verification=p.verifications.findLast(r=>r.artifactId===artifactId);if(!verification){const jobId=await executor.enqueueVerification(id,artifactId,{commandId:`local-copy-verify-${artifactId}`,expectedRevision:p.revision});await executor.execute(id,jobId);return inspect(context);}
  if(p.verifications.some(r=>r.artifactId===artifactId&&r.hasBlockingFindings))return {status:'blocked',reason:'LOCAL_COPY_EVIDENCE_REJECTED',syntheticOnly:true};
  const panel=p.creativePanels.findLast(x=>x.packet.artifactId===artifactId);if(!panel){await executor.enqueueCreativePanel(id,{artifactId,commandId:`local-copy-panel-${artifactId}`,expectedRevision:p.revision});return inspect(context);}
  const nodes=executor.advanceCreativePanels(id);if(nodes.length){await executor.execute(id,nodes[0]);return inspect(context);}
  p=projectStore.read(id);if(stage==='copy')return inspect(context);
  if(!(p.ownerIntents??[]).some(i=>i.artifactId===artifactId))await executor.continueStrategy(id,{artifactId,commandId:`local-copy-owner-${artifactId}`,expectedRevision:p.revision});
  else await executor.advanceOwnerEdges(id);
  return inspect(context);
 }
 return {inspect,advance};
}
