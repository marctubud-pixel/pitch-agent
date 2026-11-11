import type {ReaderPlan,ReaderReport,ReaderState,ReaderExcerpt,ReaderDispositionAction} from '../../domain/researchReader';
import {ServiceError} from '../../domain/service';
import {object,records,text,integer,strings,type Snapshot} from './dto';
const bad=():never=>{throw new ServiceError('validation','独立读者记录身份或内容无效，请保留原件核对。');};
function required(v:unknown):string {return typeof v==='string'&&v.trim()?v:bad();}
function hash(v:unknown):string {return typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)?v:bad();}
export function readerPlan(raw:Record<string,unknown>):ReaderPlan {
 if(raw.readerCount!==1&&raw.readerCount!==2)return bad();
 const questions=records(raw.questions).map(q=>{if(typeof q.critical!=='boolean')return bad();return {id:required(q.id),question:required(q.question),critical:q.critical};});
 if(!questions.length||!questions.some(q=>q.critical)||new Set(questions.map(q=>q.id)).size!==questions.length)return bad();
 return {id:required(raw.id),taskCardId:required(raw.taskCardId),questions,readerCount:raw.readerCount,registrationHash:hash(raw.registrationHash)};
}
export function readerState(p:Snapshot,capability:Record<string,unknown>):ReaderState {
 const raw=(p.readerPlans??[]).filter(r=>r.taskCardId===p.activeTaskCardId).at(-1),plan=raw?readerPlan(raw):null;
 const artifact=p.artifacts.find(a=>a.id===p.stages.find(s=>s.stage==='research')?.activeArtifactId);
 const producer=artifact?p.jobs.find(j=>strings(j.outputVersionIds).includes(text(artifact.id))):null;
 const binding=producer?.task?object(producer.task):{};
 const research=capability.research?object(capability.research):{},reader=research.reader?object(research.reader):{};
 const configured=reader.configured===true;
 const revisionJobs=p.jobs.filter(j=>j.stage==='research'&&j.task&&object(j.task).revisionRequest&&object(j.task).taskCardId===p.activeTaskCardId).map(j=>({id:required(j.id),status:required(j.status),artifactId:required(object(object(j.task).revisionRequest).artifactId)}));
 const dispositions=(p.readerDispositions??[]).map(d=>({id:required(d.id),artifactId:required(d.artifactId),previousReportId:required(d.previousReportId),seat:integer(d.readerSeat),registrationId:required(d.registrationId),items:records(d.dispositions).map(x=>{const actions:ReaderDispositionAction[]=['revised','clarified','narrowed','withdrawn','unresolved'],action=actions.find(a=>a===x.action);if(!action)return bad();return {issueId:required(x.issueId),action,response:required(x.response),locations:records(x.locations).map(l=>({location:required(l.location),quote:required(l.quote)}))};})}));
 return {recheckAvailable:reader.recheckAvailable===true,revisionJobs,dispositions,projectId:p.id,revision:p.revision,confirmed:p.confirmations.some(c=>c.taskCardId===p.activeTaskCardId),plan,artifactId:artifact?text(artifact.id):null,configured,
 canRead:Boolean(configured&&p.confirmations.some(c=>c.taskCardId===p.activeTaskCardId)&&plan&&artifact&&binding.researchQuestionRegistrationId===plan.id&&binding.researchQuestionRegistrationHash===plan.registrationHash&&strings(artifact.inputVersionIds).includes(p.activeTaskCardId)&&p.stages.find(s=>s.stage==='research')?.status!=='stale'),
 jobs:p.jobs.filter(j=>j.purpose==='research_reader'&&j.registrationId===plan?.id&&j.targetArtifactId===artifact?.id).map(j=>({id:required(j.id),seat:integer(j.readerSeat),status:required(j.status),phase:object(object(j.task).readerInput).phase==='recheck'?'recheck':'first_read'})),
 reports:(p.readerReports??[]).map(r=>{const job=p.jobs.find(j=>j.id===r.jobId&&j.purpose==='research_reader'),task=job?object(job.task):null;
  if(r.phase==='recheck'&&(!task||job?.readerSeat!==r.readerSeat||job?.registrationId!==r.registrationId||job?.targetArtifactId!==r.artifactId))return bad();
  return {id:required(r.id),artifactId:required(r.artifactId),contentHash:hash(r.contentHash),reportHash:hash(r.reportHash),seat:integer(r.readerSeat),registrationId:text(r.registrationId),phase:r.phase==='recheck'?'recheck':'first_read',consumedDispositionId:r.phase==='recheck'&&task?required(task.readerDispositionId):null,consumedPreviousReportId:r.phase==='recheck'&&task?required(task.readerPreviousReportId):null};})};
}
const DIMENSIONS:Record<string,string>={market:'行业与市场',audience:'人群',competition:'竞争',product:'产品',carrier:'载体作用',synthesis:'综合结论'};
export async function readerReport(value:unknown,expected:ReaderState['reports'][number]):Promise<ReaderReport> {
 const envelope=object(value),r=object(envelope.report),proof=object(envelope.original);
 if(r.id!==expected.id||r.artifactId!==expected.artifactId||r.contentHash!==expected.contentHash||r.reportHash!==expected.reportHash||proof.reportId!==expected.id||proof.artifactId!==expected.artifactId||proof.contentHash!==expected.contentHash||proof.reportHash!==expected.reportHash||proof.scope!=='saved-report-prose'||typeof proof.current!=='boolean'||r.protocolVersion!=='research-reader-loop-v1')return bad();
 if(r.phase!=='first_read'&&r.phase!=='recheck')return bad();
 const raw=object(r.rawReport),bytes=new TextEncoder().encode(JSON.stringify(raw,null,2));
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==expected.reportHash||Object.entries(raw).some(([k,v])=>JSON.stringify(r[k])!==JSON.stringify(v))||proof.packetHash!==r.packetHash||JSON.stringify(r.eligibility)!==JSON.stringify(proof.eligibility))return bad();
 if(!records(r.answers).length||!records(r.connections).length)return bad();
 const eligibility=object(proof.eligibility);if(typeof eligibility.understandingComplete!=='boolean'||eligibility.humanApproval!==false||eligibility.factualSufficiencyVerified!==false||eligibility.consumerValidation!==false)return bad();
 const parts:ReaderReport['parts']=[];
 const add=(heading:string,entry:Record<string,unknown>,content:string)=>{const locations=records(entry.locations).map(l=>({location:required(l.location),quote:required(l.quote)}));if(!locations.length)bad();parts.push({heading,text:content,locations});};
 const retellings=records(r.retellings);if(retellings.length!==6||new Set(retellings.map(x=>x.dimension)).size!==6)return bad();
 for(const x of retellings){const heading=DIMENSIONS[text(x.dimension)];if(!heading)bad();add(heading,x,required(x.understanding));}
 for(const x of records(r.answers))add(`问题 ${required(x.questionId)}${x.status==='unresolved'?' · 未决':''}`,x,required(x.answer));
 for(const x of records(r.connections))add('跨维综合与策略约束',x,`${required(x.explanation)}\n策略约束：${required(x.strategyConstraint)}\n限制：${required(x.limitations)}`);
 for(const x of records(r.issues))add(`${x.severity==='major'?'主要问题':'问题'} · ${required(x.id)}`,x,required(x.detail));
 for(const x of records(r.rechecks))add(`复查 ${required(x.issueId)} · ${x.status==='resolved'?'已处理':'仍未解决'}`,x,required(x.explanation));
 return {phase:r.phase==='recheck'?'recheck':'first_read',issues:records(r.issues).map(i=>({id:required(i.id),detail:required(i.detail),severity:required(i.severity)})),id:expected.id,current:proof.current,understandingComplete:eligibility.understandingComplete,parts,limitations:strings(r.limitations)};
}

export async function readerExcerpts(value:unknown,artifact:Record<string,unknown>):Promise<ReaderExcerpt[]> {
 const envelope=object(value);if(envelope.artifactId!==artifact.id||envelope.contentHash!==artifact.contentHash||typeof envelope.contentText!=='string')return bad();
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(envelope.contentText)))].map(b=>b.toString(16).padStart(2,'0')).join('');if(digest!==artifact.contentHash)return bad();
 const content=object(JSON.parse(envelope.contentText));if(JSON.stringify(content)!==JSON.stringify(envelope.content))return bad();
 const result:ReaderExcerpt[]=[],add=(location:string,label:string,quote:unknown)=>{if(typeof quote==='string'&&quote.trim())result.push({location,label,quote});};
 add('/title','报告标题',content.title);add('/summary','研究摘要',content.summary);
 records(content.sections).forEach((section,i)=>{const title=text(section.heading)||text(section.title)||`章节 ${i+1}`;for(const key of ['heading','title','body'])add(`/sections/${i}/${key}`,title,section[key]);});
 records(content.claims).forEach((claim,i)=>{add(`/claims/${i}/text`,`结论 ${i+1}`,claim.text);add(`/claims/${i}/kind`,`结论 ${i+1} 的性质`,claim.kind);strings(claim.limitations).forEach((q,n)=>add(`/claims/${i}/limitations/${n}`,`结论 ${i+1} 的限制`,q));});strings(content.gaps).forEach((q,i)=>add(`/gaps/${i}`,`研究缺口 ${i+1}`,q));return result;
}
