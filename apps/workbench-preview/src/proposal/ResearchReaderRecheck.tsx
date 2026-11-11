import {readerDispositionHistory} from '../domain/researchReader';
import {ReaderDispositionHistory} from './ReaderDispositionHistory';
import {useState} from 'react';
import {useCommand} from '../app/commands';
import {useServiceQuery} from '../app/query';
import type {ReaderDisposition,ReaderDispositionAction,ReaderExcerpt,ReaderReport,ReaderState,ResearchReaderService} from '../domain/researchReader';
import {CommandFeedback,QueryView,Skeleton,TextArea} from '../ui/kit';
const ACTIONS:Array<{value:ReaderDispositionAction;label:string}>=[{value:'revised',label:'已修订'},{value:'clarified',label:'已补充说明'},{value:'narrowed',label:'已缩小结论'},{value:'withdrawn',label:'已撤回主张'},{value:'unresolved',label:'仍未解决'}];
export function ResearchReaderRecheck({data,report,reader}:{data:ReaderState;report:ReaderReport;reader:ResearchReaderService}){
 const command=useCommand(),summary=data.reports.find(r=>r.id===report.id);
 const history=<ReaderDispositionHistory entries={readerDispositionHistory(data,report.id)}/>;
 if(!summary||!data.plan||summary.registrationId!==data.plan.id)return history;
 const latest=data.reports.filter(r=>r.seat===summary.seat&&r.registrationId===data.plan?.id).at(-1);
 if(latest?.id!==summary.id)return <>{history}<p className="muted">本席位已有较新的读者报告；此记录保留为历史，仅供查阅。</p></>;
 if(summary.artifactId===data.artifactId&&report.understandingComplete&&!report.issues.length)return <>{history}<p className="muted">本版理解检查未发现需处理的问题；事实核验与负责人交接仍分别判断。</p></>;
 const busy=command.pending,revision=data.revisionJobs.filter(j=>j.artifactId===summary.artifactId).at(-1);
 return <section style={{marginBlock:20}}>{history}<h4>问题处理与独立复查</h4>
  {summary.artifactId===data.artifactId?<><p>先将必要解释和处理写入研究新版，再由独立读者核查。</p><button className="btn btn--secondary" disabled={busy||!data.configured||Boolean(revision)} onClick={()=>void command.run({label:'按读者问题修订研究',payload:{artifactId:summary.artifactId},expectedRevision:data.revision,execute:meta=>reader.revise(data.projectId,summary.artifactId,meta),success:'已保存修订任务，请核对真实执行状态与新稿。'})}>按读者问题生成修订稿</button>{revision&&<p className="muted">修订任务：{revision.status==='awaiting_reconciliation'?'原调用结果待核对，不重复生成':revision.status==='failed'||revision.status==='blocked'?'修订未完成，当前仍保留原稿':revision.status==='running'||revision.status==='queued'?'正在生成，尚无新版':'已保存执行结果，请核对当前研究稿'}。</p>}</>:data.artifactId?<DispositionSource key={`${data.artifactId}:${report.id}`} data={data} report={report} reader={reader}/>:null}
  <CommandFeedback command={command}/>
 </section>;
}
function DispositionSource({data,report,reader}:{data:ReaderState;report:ReaderReport;reader:ResearchReaderService}){
 const artifactId=data.artifactId??'';
 const query=useServiceQuery(`reader-new-prose:${data.projectId}:${artifactId}`,()=>reader.excerpts(data.projectId,artifactId),{projectId:data.projectId});
 return <QueryView query={query} skeleton={<Skeleton lines={3}/>} >{excerpts=><DispositionForm data={data} report={report} reader={reader} excerpts={excerpts}/>}</QueryView>;
}
function DispositionForm({data,report,reader,excerpts}:{data:ReaderState;report:ReaderReport;reader:ResearchReaderService;excerpts:ReaderExcerpt[]}){
 const command=useCommand(),[drafts,setDrafts]=useState<Record<string,{action:ReaderDispositionAction;response:string;excerpt:number}>>({});
 const saved=data.dispositions.filter(d=>d.artifactId===data.artifactId&&d.previousReportId===report.id).at(-1),summary=data.reports.find(r=>r.id===report.id),job=data.jobs.find(j=>j.seat===summary?.seat);
 const dispositions:ReaderDisposition[]=report.issues.map(issue=>{const draft=drafts[issue.id],excerpt=draft?excerpts[draft.excerpt]:undefined;return {issueId:issue.id,action:draft?.action??'unresolved',response:draft?.response??'',locations:excerpt?[{location:excerpt.location,quote:excerpt.quote}]:[]};});
 const valid=dispositions.every(d=>d.response.trim()&&d.locations.length),busy=command.pending;
 return <div><p>当前已是另一版研究稿。逐项记录负责人处理，并选择新稿实际原段落；保存回应不会代替读者复查。</p>
  {!saved&&report.issues.map(issue=>{const draft=drafts[issue.id]??{action:'unresolved',response:'',excerpt:-1},selected=excerpts[draft.excerpt];const update=(change:Partial<typeof draft>)=>setDrafts(v=>({...v,[issue.id]:{...draft,...change}}));return <fieldset key={issue.id} disabled={busy||Boolean(saved)} style={{border:0,padding:0,marginBlock:16}}><legend>{issue.detail}</legend><label>实际处理 <select value={draft.action} onChange={e=>update({action:ACTIONS.find(a=>a.value===e.target.value)?.value??'unresolved'})}>{ACTIONS.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}</select></label><TextArea label="负责人回应与处理依据" rows={3} style={{resize:'none'}} value={draft.response} onChange={e=>update({response:e.target.value})}/><label>新稿依据 <select value={draft.excerpt} onChange={e=>update({excerpt:Number(e.target.value)})}><option value={-1}>选择已核原文的章节或结论</option>{excerpts.map((x,i)=><option key={x.location} value={i}>{x.label} · {x.quote.slice(0,52)}</option>)}</select></label>{selected&&<blockquote style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{selected.quote}</blockquote>}</fieldset>;})}
  {!report.issues.length&&<p className="muted">原报告没有单列问题项；仍将保留原问答、范围与实际新稿供复查。</p>}
  {!saved&&data.artifactId&&<button className="btn btn--secondary" disabled={busy||!valid} onClick={()=>{const input={artifactId:data.artifactId??'',previousReportId:report.id,dispositions};void command.run({label:'保存逐项处理',payload:input,expectedRevision:data.revision,execute:meta=>reader.dispose(data.projectId,input,meta),success:'处理已保存，尚待独立读者复查。'});}}>保存逐项处理</button>}
  {saved&&<><p className="muted">本版处理已保存；仍未签复查或研究放行。</p><button className="btn btn--secondary" disabled={busy||!data.recheckAvailable||!data.canRead||Boolean(job)||!data.plan} onClick={()=>{if(!data.plan||!data.artifactId||!summary)return;const input={artifactId:data.artifactId,registrationId:data.plan.id,seat:summary.seat,previousReportId:report.id,dispositionId:saved.id};void command.run({label:'发起独立复查',payload:input,expectedRevision:data.revision,execute:meta=>reader.start(data.projectId,input,meta),success:'已保存独立复查执行结果，请查看报告。'});}}>发起独立复查</button>{!data.recheckAvailable&&<p className="muted">独立复查未配置，本次不会启动。</p>}{job&&<p className="muted">此席位已有当前稿任务，请核对上方状态与报告。</p>}</>}
  <CommandFeedback command={command}/>
 </div>;
}
