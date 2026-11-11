import {useService} from '../app/services';
import {useServiceQuery} from '../app/query';
import {useCommand} from '../app/commands';
import {useTeam} from '../collaboration/context';
import {QueryView,CommandFeedback} from '../ui/kit';
import type {OriginalDocumentsService,OriginalDocumentState,PdfTextStatus} from '../domain/originalDocuments';
const LABELS:Record<PdfTextStatus,string>={text_extracted:'已抽取文字',partial:'部分文字已抽取，仍有缺口',no_text:'未发现可抽取文字',password_required:'文件加密，需要可读取的原件',invalid:'PDF结构无效',limit_exceeded:'超过本地解析限制',failed:'本次未取得文字结果，已保留诊断'};
export function OriginalDocumentPanel({projectId,resourceId}:{projectId:string;resourceId:string}){
 const service=useService();return service.originalDocuments?<DocumentQuery projectId={projectId} resourceId={resourceId} documents={service.originalDocuments}/>:null;
}
function DocumentQuery({projectId,resourceId,documents}:{projectId:string;resourceId:string;documents:OriginalDocumentsService}){
 const query=useServiceQuery(`original-extraction:${projectId}:${resourceId}`,()=>documents.get(projectId,resourceId),{projectId});
 return <div style={{marginTop:12}}><QueryView query={query}>{state=><DocumentControls state={state} documents={documents}/>}</QueryView></div>;
}
function DocumentControls({state,documents}:{state:OriginalDocumentState;documents:OriginalDocumentsService}){
 const command=useCommand(),{can}=useTeam(),busy=command.pending;
 const failed=['failed','blocked','awaiting_reconciliation'].includes(state.jobStatus),pending=state.jobStatus==='running',canStart=state.jobStatus==='queued';
 const act=(action:'extract'|'retry_local')=>{const input={documentId:state.documentId,taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,action};return command.run({label:action==='extract'?'解析PDF原件':'重试本地解析',payload:input,expectedRevision:state.revision,execute:meta=>documents.extract(state.projectId,input,meta),success:'本地解析结果已保存，请核对正文与限制。'});};
 return <div className="stack"><p className="small">本地PDF解析 · {state.result?LABELS[state.result.status]:pending?'原解析仍在进行或结果待核对':failed?'本地解析失败':canStart?'尚未解析':'状态待核对'}{!state.current?' · 历史任务卡原件（只读）':''}</p>

  {!state.available&&<p className="small muted">{state.unavailableReason} 已保存的正文仍可查阅。</p>}
  {state.capabilityDiagnostic&&<details><summary>本地能力诊断</summary><p className="small muted">{state.capabilityDiagnostic}</p></details>}
  {state.current&&(canStart||failed)&&<button className="btn btn--secondary btn--sm" disabled={busy||!state.available||!can({kind:'manage'})} onClick={()=>void act(failed?'retry_local':'extract')}>{failed?'显式重试本地解析':'解析这份PDF'}</button>}
  {pending&&<p className="small muted">请通过原提交核对结果；不会自动启动另一轮解析。</p>}
  {state.result&&<details><summary>{state.result.pages.length?`查看已保存正文 · ${state.result.pages.length} 页`:'查看解析结果与诊断'}</summary>{!state.result.pages.length&&<p className="small muted">本次未保存可阅读的页面文字，请检查文件与上述解析状态。</p>}{state.result.pages.map(page=><section key={page.number}><h4>第 {page.number} 页</h4><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:320,overflowY:'auto'}}>{page.text||'本页没有可抽取文字。'}</p></section>)}<details><summary>解析工具与原始诊断</summary><p className="small muted">此记录仅说明本地工具与抽取范围。</p><ul>{state.result.diagnostics.map((d,i)=><li key={i}>{d}</li>)}</ul><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{state.result.identity}</pre></details></details>}
  <CommandFeedback command={command}/>
 </div>;
}
