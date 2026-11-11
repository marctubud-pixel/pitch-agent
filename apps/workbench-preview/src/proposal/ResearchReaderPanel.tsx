import {ResearchReaderRecheck} from './ResearchReaderRecheck';
import {useState} from 'react';
import {useService} from '../app/services';
import {useServiceQuery} from '../app/query';
import {useCommand} from '../app/commands';
import type {ResearchReaderService,ReaderState} from '../domain/researchReader';
import {CommandFeedback,QueryView,Skeleton,TextArea} from '../ui/kit';
const STATUS:Record<string,string>={queued:'待执行',running:'执行中',awaiting_reconciliation:'原调用结果待核对',succeeded:'已保存',failed:'未完成',blocked:'受阻'};
export function ResearchReaderPanel({projectId}:{projectId:string}){
 const service=useService();return service.researchReader?<ReaderPanel projectId={projectId} reader={service.researchReader}/>:null;
}
function ReaderPanel({projectId,reader}:{projectId:string;reader:ResearchReaderService}){
 const query=useServiceQuery(`research-reader:${projectId}`,()=>reader.get(projectId),{projectId});
 return <details className="panel" style={{marginBlock:24}}><summary>研究问题与独立读者</summary><div style={{paddingBlock:16}}><p className="muted">先登记研究需要回答的问题，再生产报告。此处记录 AI 独立正文阅读与修订复查；事实核验、修订复查与负责人交接分别保留。</p><QueryView query={query} skeleton={<Skeleton lines={3}/>} >{data=><ReaderControls key={projectId} data={data} reader={reader}/>}</QueryView></div></details>;
}
function ReaderControls({data,reader}:{data:ReaderState;reader:ResearchReaderService}){
 const command=useCommand(),[questions,setQuestions]=useState(''),[readerCount,setReaderCount]=useState<1|2>(1),[opened,setOpened]=useState<string|null>(null);
 const pending=command.state.status==='pending';
 const input={questions:questions.split('\n').map(x=>x.trim()).filter(Boolean).map((question,i)=>({id:`q${i+1}`,question,critical:true})),readerCount};
 const register=()=>command.run({label:'登记研究问题',payload:input,expectedRevision:data.revision,execute:meta=>reader.register(data.projectId,input,meta),success:'问题已登记，适用于此后生成的研究稿。'});
 return <div className="stack">
  {data.plan&&<div><h3>本版预登记问题</h3><ol>{data.plan.questions.map(q=><li key={q.id}>{q.question}{q.critical?'（关键）':''}</li>)}</ol><p className="muted">计划 {data.plan.readerCount} 位独立读者；问题修改后须重新生成研究稿。</p></div>}
  <details open={!data.plan}><summary>{data.plan?'登记新的研究问题':'登记研究问题'}</summary><fieldset disabled={pending||!data.confirmed} style={{border:0,padding:0}}><TextArea label="本轮关键问题（每行一题）" value={questions} onChange={e=>setQuestions(e.target.value)} rows={3} style={{resize:'none'}}/><label>独立读者数量 <select value={readerCount} onChange={e=>setReaderCount(e.target.value==='2'?2:1)}><option value="1">1 位</option><option value="2">2 位</option></select></label><div className="toolbar" style={{marginTop:12}}><button className="btn btn--secondary" disabled={!input.questions.length||input.questions.length>100} onClick={()=>void register()}>保存问题计划</button></div></fieldset>{!data.confirmed&&<p className="muted">请先确认当前简报，再登记研究问题。</p>}</details>
  {data.plan&&<div><h3>独立正文阅读</h3>{!data.artifactId?<p className="muted">尚无研究稿，请先按计划生成。</p>:!data.configured?<p className="muted">独立读者未配置，本次不会启动调用。</p>:!data.canRead?<p className="muted">当前研究稿尚未绑定这份预登记问题，请按新计划生成研究稿。</p>:null}
   {Array.from({length:data.plan.readerCount},(_,seat)=>{const prior=data.reports.filter(r=>r.seat===seat&&r.registrationId===data.plan?.id).at(-1),job=data.jobs.find(j=>j.seat===seat),plan=data.plan,artifactId=data.artifactId;return <div className="toolbar" key={seat} style={{marginBlock:10}}><span>读者 {seat+1} · {job?`${job.phase==='recheck'?'复查 · ':'首读 · '}${STATUS[job.status]??'状态待核'}`:prior?'请查看原报告，处理问题后复查':'未开始'}</span>{!job&&!prior&&plan&&artifactId&&<button className="btn btn--secondary" disabled={pending||!data.canRead} onClick={()=>{const input={artifactId,registrationId:plan.id,seat};void command.run({label:`开始读者 ${seat+1} 首读`,payload:input,expectedRevision:data.revision,execute:meta=>reader.start(data.projectId,input,meta),success:'首读执行结果已保存，请查看报告状态。'});}}>开始首读</button>}{job?.status==='awaiting_reconciliation'&&<button className="btn btn--secondary" disabled={pending} onClick={()=>void command.run({label:'核对原读者结果',payload:{jobId:job.id},expectedRevision:data.revision,execute:meta=>reader.reconcile(data.projectId,job.id,meta),success:'已核对原始调用结果。'})}>核对原调用结果</button>}</div>;})}
   <p className="muted">阅读或回应保存不代表研究完成。各席位须核对当前稿，事实核验与正式放行分别判断。</p></div>}
  <CommandFeedback command={command}/>
  {data.reports.length>0&&<div><h3>已保存的读者报告</h3>{data.reports.map(r=><div key={r.id}><button className="btn btn--secondary" onClick={()=>setOpened(opened===r.id?null:r.id)} aria-expanded={opened===r.id}>读者 {r.seat+1} · 查看报告{r.artifactId!==data.artifactId?'（历史稿）':''}</button>{opened===r.id&&<ReaderReport projectId={data.projectId} reportId={r.id} reader={reader} data={data}/>}</div>)}</div>}
 </div>;
}
function ReaderReport({projectId,reportId,reader,data}:{projectId:string;reportId:string;reader:ResearchReaderService;data:ReaderState}){
 const query=useServiceQuery(`reader-report:${projectId}:${reportId}`,()=>reader.report(projectId,reportId),{projectId});
 return <QueryView query={query} skeleton={<Skeleton lines={3}/>} >{report=><article><p>{report.current?'当前稿正文':'历史稿正文'} · {report.phase==='recheck'?'修订复查':'首读'} · {report.understandingComplete?'理解检查无阻断':'仍有未决问题'}</p>{report.parts.map((part,i)=><section key={i}><h4>{part.heading}</h4><p style={{whiteSpace:'pre-wrap'}}>{part.text}</p><details><summary>正文依据</summary>{part.locations.map((l,n)=><blockquote key={n}><p>{l.quote}</p><small>{l.location}</small></blockquote>)}</details></section>)}<ResearchReaderRecheck data={data} report={report} reader={reader}/><h4>保留限制</h4><ul>{report.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul></article>}</QueryView>;
}
