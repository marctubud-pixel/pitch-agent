import {useRef,useState} from 'react';
import {useService} from '../app/services';
import {useServiceQuery} from '../app/query';
import {useCommand} from '../app/commands';
import {useTeam} from '../collaboration/context';
import {Action,CommandFeedback,QueryView,Skeleton} from '../ui/kit';
import type {AcquisitionState,ResearchAcquisitionService} from '../domain/researchAcquisition';
const BRANCH_LABELS={professional_reports:'行业与专业报告',brand_product:'品牌与产品',same_purpose_competitors:'同任务竞品',users_scenes:'人群与接触情景'};
const STATUS:Record<string,string>={not_started:'尚未开始',planning:'制定资料计划',collecting:'采集资料',sealed:'原件已封口',blocked:'受阻',awaiting_reconciliation:'原结果待核对',succeeded:'已保存',queued:'待执行',running:'执行中',pending:'待执行',complete:'本轮采集完成',partial:'部分覆盖',empty:'未取得资料',unknown:'结果未知',failed:'未完成'};
export function ResearchAcquisitionPanel({projectId}:{projectId:string}){
 const service=useService(),acquisition=service.researchAcquisition;
 const query=useServiceQuery(`research-acquisition:${projectId}`,()=>acquisition?acquisition.get(projectId):Promise.resolve(null),{projectId});
 if(!acquisition)return null;
 return <QueryView query={query} skeleton={<Skeleton lines={2}/>}>{data=>data?<AcquisitionControls key={projectId} data={data} acquisition={acquisition}/>:null}</QueryView>;
}
function AcquisitionControls({data,acquisition}:{data:AcquisitionState;acquisition:ResearchAcquisitionService}){
 const command=useCommand(),service=useService(),{can}=useTeam(),busy=useRef(false),[selectedSources,setSources]=useState<string[]>([]),[selectedMaterials,setMaterials]=useState<string[]>([]);
 const capability=useServiceQuery('research-capability',s=>s.getCapabilities());
 const permission=can({kind:'workflow'}),pending=command.state.status==='pending';
 const canContinue=data.current&&data.queuedJobIds.length>0;
 const selectionLocked=Boolean(data.generationId&&data.current),shownSources=selectionLocked?data.frozenSourceIds:selectedSources,shownMaterials=selectionLocked?data.frozenMaterialIds:selectedMaterials;
 const blocked=data.current?(data.originalsVerified===false||data.reconciliation.length>0||['blocked','awaiting_reconciliation','cancelling','cancelled'].includes(data.state)||data.jobs.some(j=>['running','awaiting_reconciliation','failed','blocked'].includes(j.status))):data.jobs.some(j=>['queued','running','awaiting_reconciliation'].includes(j.status));
 const reason=!data.confirmed?'请先确认当前简报。':!data.registered?'请先在“研究问题与独立读者”登记本轮关键问题。':!data.available?data.reason:service.briefRecovery?.getPending()?'请先核对页面上方保留的原提交。':blocked?'当前采集受阻或原结果未知，请核对原记录。':data.current&&data.producerStatus==='succeeded'?'本次研究报告已保存；请继续核验与独立阅读。':null;
 const start=async()=>{
  if(busy.current||!permission||reason)return;busy.current=true;
  try{
   let state=data;
   if(!canContinue){
    const input={taskCardId:data.taskCardId,taskCardHash:data.taskCardHash,sourceEntryIds:selectedSources,materialIds:selectedMaterials};
    const result=await command.run({label:'采集并生成研究',payload:input,expectedRevision:data.revision,execute:meta=>acquisition.start(data.projectId,input,meta),success:null});if(!result)return;state=result.data;
   }
   // One explicit action authorizes at most planner, four branch slices and producer.
   for(let n=0;n<6;n++){
    const generationId=state.generationId,jobIds=state.queuedJobIds.slice(0,4);
    if(!generationId||!state.current||state.originalsVerified!==true||!jobIds.length||state.reconciliation.length||['blocked','awaiting_reconciliation'].includes(state.state))break;
    const input={taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,generationId,jobIds};
    const result=await command.run({label:'继续本次研究',payload:input,expectedRevision:state.revision,execute:meta=>acquisition.step(data.projectId,input,meta),success:null});
    if(!result)return;state=result.data;
    if(jobIds.some(id=>!state.jobs.some(j=>j.id===id&&j.status==='succeeded')))break;
   }
  }finally{busy.current=false;}
 };
 const toggle=(id:string,values:string[],set:(values:string[])=>void)=>set(values.includes(id)?values.filter(v=>v!==id):[...values,id]);
 return <div className="stack-sm" style={{marginBlock:16}}>
  <div className="toolbar"><Action permission={{kind:'workflow'}} label={canContinue?'继续本次研究':'采集并生成研究'} variant="primary" onClick={()=>void start()} disabled={Boolean(reason)} reason={reason??undefined} pending={pending}/><span className="muted">{STATUS[data.state]??'状态待核'}{data.generationId&&!data.current?' · 历史采集':''}</span></div>

  <CommandFeedback command={command}/>
  <details className="rm-questions"><summary>资料选择、四分支状态与原结果</summary><fieldset disabled={pending||!permission||selectionLocked} style={{border:0,padding:0}}>
   <p className="muted">可不手填来源，由已配置的搜索与四分支取证。仅选入当前任务卡、原件与抽取结果已核对的 PDF；采集及解析不代表事实核验或人类采用。</p>
   {!data.materialsRootShared&&<p className="muted">PDF原件与研究执行尚未配置共用存储，不能选入PDF；自动搜索和来源登记仍按各自能力判断。</p>}
   {data.sources.map(source=><label key={source.id} style={{display:'block'}}><input type="checkbox" checked={shownSources.includes(source.id)} onChange={()=>toggle(source.id,selectedSources,setSources)}/> {source.title}</label>)}
   {data.materials.map(material=><label key={material.id} style={{display:'block'}}><input type="checkbox" disabled={!material.eligible} checked={shownMaterials.includes(material.id)} onChange={()=>toggle(material.id,selectedMaterials,setMaterials)}/> {material.title} · {material.reason}</label>)}
  </fieldset>
  {data.branches.length>0?<ul>{data.branches.map(b=><li key={b.kind}><strong>{BRANCH_LABELS[b.kind]}</strong> · {STATUS[b.status]??b.status}<details><summary>本分支覆盖与限制</summary>{b.coverageSummary?<><p>可用摘录 {b.coverageSummary.usableExcerpts} 条 · 原记录来源站点 {b.coverageSummary.independentOrigins} 个。</p><p className="muted">覆盖与适用性仍须核验；搜索和抓取有范围限制，记录数量不代表研究充分。</p><details><summary>原始覆盖记录（含完整范围）</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:320,overflowY:'auto'}}>{b.coverage}</pre></details></>:<p>尚无已保存的覆盖结果。</p>}</details></li>)}</ul>:<p>四分支尚未执行，无覆盖结论。</p>}
  <p>研究生产者：{data.producerStatus?STATUS[data.producerStatus]??data.producerStatus:'尚未生成'}；原件：{data.originalsVerified===true?'已核对':data.originalsVerified===false?'核对失败':'尚无采集原件'}。</p>
  <ul>{data.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul>
  {data.reconciliation.map(row=>{const generationId=data.generationId;if(!generationId)return null;const target=data.generationTarget??data,input={taskCardId:target.taskCardId,taskCardHash:target.taskCardHash,generationId,jobId:row.jobId};return <Action key={row.jobId} disabled={row.jobId===data.producerJobId&&!data.current} reason={row.jobId===data.producerJobId&&!data.current?'历史研究生产者原结果仍待核，当前入口不能恢复历史研究稿。':undefined} permission={{kind:'workflow'}} label={row.jobId===data.producerJobId?'核对原研究生成结果':'核对原采集结果'} variant="secondary" pending={pending} onClick={()=>void command.run({label:'核对原采集结果',payload:input,expectedRevision:data.revision,execute:meta=>acquisition.reconcile(data.projectId,input,meta),success:'仅核对原保存结果，未重新搜索。'})}/>;})}
  {!data.available&&<Action permission={{kind:'workflow'}} label="使用已登记来源生成研究稿" variant="secondary" pending={pending} disabled={!data.confirmed||!data.registered||!data.sources.length||capability.data?.research?.executionAllowed!==true} reason={capability.data?.research?.reason??'请先确认简报、登记问题与来源，并配置研究生成。'} onClick={()=>void command.run({label:'使用已登记来源生成研究稿',payload:{projectId:data.projectId},expectedRevision:data.revision,execute:meta=>service.generateResearch(data.projectId,meta)})}/>}
  <p className="muted">刷新不会自动续跑。原结果未知时保留原请求；研究报告保存后仍需事实核验、独立读者、负责人交接与人工放行。</p>
  </details>
 </div>;
}
