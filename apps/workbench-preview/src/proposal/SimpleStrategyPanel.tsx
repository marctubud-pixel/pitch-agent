import {useService} from '../app/services';
import {useServiceQuery} from '../app/query';
import {useCommand} from '../app/commands';
import {Action,CommandFeedback,QueryView,Skeleton} from '../ui/kit';
import type {SimpleStrategyService,SimpleStrategyWorkspace,StrategyPoint} from '../domain/simpleStrategy';
import '../styles/research-method.css';
const KINDS={fact:'资料事实',requirement:'任务要求',inference:'研究推论',assumption:'待验证假设'};
const STATUS:Record<string,string>={queued:'待执行',running:'执行中',awaiting_reconciliation:'原结果待核',succeeded:'已保存',succeeded_stale:'已保存为历史',blocked:'受阻',failed:'未完成'};
export function SimpleStrategyPanel({projectId}:{projectId:string}){
 const simple=useService().simpleStrategy;
 const query=useServiceQuery(`simple-strategy:${projectId}`,()=>simple?simple.get(projectId):Promise.resolve(null),{projectId});
 if(!simple)return null;
 return <QueryView query={query} skeleton={<Skeleton lines={4}/>}>{data=>data?<StrategyContents data={data} simple={simple}/>:null}</QueryView>;
}
function StrategyContents({data,simple}:{data:SimpleStrategyWorkspace;simple:SimpleStrategyService}){
 const command=useCommand(),pending=command.state.status==='pending',s=data.content??data.blockedOutput?.content,unknown=data.unknownJobs.length>0;
 const continueResearch=()=>{const artifactId=data.researchArtifactId;if(!artifactId)return;const input={artifactId,policyVersion:data.policyVersion};void command.run({label:'明确从研究继续策略',payload:input,expectedRevision:data.revision,execute:meta=>simple.continue(data.projectId,input,meta),success:'策略执行结果已返回，请核对正文、限制与待补项。'});};
 return <section className="research-method pw-strategy" aria-label="当前简洁策略">
  <header className="rm-header"><div><p className="rm-kicker">策略 · 依据与方向</p><h2>{s?.title??'从已放行研究继续策略'}</h2><p>{s?.summary??'将研究结论、产品真实特质与目标用户连接，说明优先放大什么及其依据。'}</p></div></header>
  <div className="rm-binding"><strong>{data.current?data.blockedOutput?'当前受阻策略结果':'当前任务对应策略':data.producerJobId?'历史或待核策略':'尚无策略原稿'}</strong><span>{data.producerStatus?STATUS[data.producerStatus]??'状态待核':'尚未执行'}</span></div>
  {!data.producerJobId&&<Action permission={{kind:'workflow'}} label="明确从研究继续策略" variant="primary" pending={pending} disabled={!data.canContinue} reason={!data.available?data.reason:data.continueReason} onClick={continueResearch}/>}
  <p className="rm-note">研究到策略须由人明确继续。策略稿保存不表示事实核验通过、双方负责人接收、文案执行或客户批准。</p>
  {data.blockedOutput&&<p className="rm-note">此结果因关键依据不足而停止，保留已有结论供补充资料；不是完成稿，不能核验放行或交接下游。</p>}
  {data.failure&&!data.blockedOutput&&<p className="rm-alert" role="alert">本次策略受阻：{data.failure.message}</p>}
  {s?<>
   <section className="rm-questions"><h3>研究结论</h3>{s.strategy.researchConclusions.length?s.strategy.researchConclusions.map(p=><Point key={p.id} point={p}/>):<p>尚无可登记的研究结论。</p>}</section>
   <section className="rm-questions"><h3>方向交叉点</h3><div className="pw-venn-grid">
    <figure><svg viewBox="0 0 340 270" role="img" aria-label="产品、人群与竞争的分析关系示意"><g fill="#dce7ee" fillOpacity="0.55" stroke="#637d91" strokeWidth="1.5"><circle cx="125" cy="105" r="84"/><circle cx="215" cy="105" r="84"/><circle cx="170" cy="182" r="84"/></g><g fill="#111827" fontSize="16" textAnchor="middle"><text x="98" y="85">产品</text><text x="242" y="85">人群</text><text x="170" y="230">竞争</text></g></svg><figcaption className="small muted">分析关系示意；不表示统计面积或已验证人群重合。</figcaption></figure>
    <div>{s.strategy.intersection?<Point point={s.strategy.intersection}/>:<p>关键依据待补，尚未提出方向交叉点。</p>}</div>
   </div></section>
   <section className="rm-questions"><h3>策略发力点</h3>{s.strategy.focus?<Point point={s.strategy.focus}/>:<p>尚无有据的优先发力方向。</p>}</section>
   {(s.gaps.length>0||s.limitations.length>0)&&<section className="rm-alert"><h3>{s.status==='blocked'?'关键依据待补':'方向的适用条件'}</h3><ul>{[...s.gaps,...s.limitations].map((limit,i)=><li key={i}>{limit}</li>)}</ul></section>}
  </>:<p className="rm-unanswered">当前没有已核SHA的策略正文。请保留研究与原任务的限制，勿把空态当成已完成策略。</p>}
  <details className="rm-questions"><summary>原稿、独立全文核验与原结果</summary>
   <p>生成、核验、负责人接收与后续文案分别记录。{unknown?'存在原结果未决，不能重新派发。':''}</p>
   {data.artifactId&&<Action permission={{kind:'workflow'}} label="核验当前策略全文" pending={pending} disabled={!data.current||!data.available||unknown||data.verification!==null} reason={!data.current?'历史策略不能作为当前核验对象。':unknown?'先核对原结果。':data.verification?'已有核验原报告，请先阅读。':data.reason} onClick={()=>{const artifactId=data.artifactId;if(!artifactId)return;const input={artifactId};void command.run({label:'核验策略全文',payload:input,expectedRevision:data.revision,execute:meta=>simple.verify(data.projectId,input,meta),success:'已保存全文核验原报告，不代替负责人接收。'});}}/>}
   {data.verification&&<details><summary>{data.verification.hasBlockingFindings?'全文核验存在阻断':'已保存全文核验报告'} · 查看原报告</summary><pre style={{whiteSpace:'pre-wrap'}}>{data.verification.report}</pre><p className="muted">摘录支持及模型全文判断，不认证网站真实性、消费者验证或交接批准。</p></details>}
   {data.unknownJobs.map(job=><Action key={job.jobId} permission={{kind:'workflow'}} label={job.purpose==='verification'?'核对原策略核验结果':'核对原策略生成结果'} variant="secondary" pending={pending} disabled={!data.current} reason="历史或输入变更后的未知结果仍待核；本入口不重调模型。" onClick={()=>{const input={jobId:job.jobId};void command.run({label:'核对原策略结果',payload:input,expectedRevision:data.revision,execute:meta=>simple.reconcile(data.projectId,input,meta),success:'仅核对原始保存结果，未重新派发。'});}}/>)}
   {s&&<details><summary>{data.blockedOutput?'受阻原结果与SHA':'当前展示原稿与SHA'}</summary><p>{data.blockedOutput?`原尝试 ${data.blockedOutput.attemptId}`:data.artifactId} · SHA256 {data.blockedOutput?.contentHash??data.contentHash}</p><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(s,null,2)}</pre></details>}
   {data.history.length>0&&<details><summary>历史策略身份 · {data.history.length}份</summary><ul>{data.history.map(a=><li key={a.artifactId}>{a.artifactId} · SHA256 {a.contentHash}（历史身份，不是当前推荐）</li>)}</ul></details>}
  </details><CommandFeedback command={command}/>
 </section>;
}
function Point({point}:{point:StrategyPoint}){return <article><p><span className="pw-label">{KINDS[point.kind]}</span> {point.text}</p>{point.limitations.length>0&&<ul className="muted">{point.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul>}<details><summary>引用原文与适用依据 · {point.refs.length}项</summary>{point.refs.map((ref,i)=><blockquote key={i}><p>{ref.quote}</p><small>{ref.sourceId} · {ref.location}</small></blockquote>)}</details></article>;}
