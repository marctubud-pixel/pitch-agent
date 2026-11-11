import {ResearchAcquisitionPanel} from '../ResearchAcquisitionPanel';
import {useServiceQuery} from '../../app/query';
import type {ResearchWorkspace} from '../../domain/models';
import {ArtifactDocument} from '../../views/shared';
import {reviewLabel} from './project';
import '../../styles/research-method.css';

const chapters = ['行业与市场', '人群', '竞品分析', '产品与品牌', '研究结论'];
export function R7ResearchView({workspace,onClaim,onOpenChecks}:{workspace:ResearchWorkspace;onClaim:(id:string)=>void;onOpenChecks:()=>void}) {
  const capability=useServiceQuery('research-capability',s=>s.getCapabilities());
  const {artifact,claims,sources}=workspace, method=capability.data?.research;
  return <section className="research-method" aria-label="当前研究与交接">
    <header className="rm-header"><div><p className="rm-kicker">研究 · 证据与判断</p><h2>{artifact?.title ?? '从当前简报开始研究'}</h2><p>行业、目标人群、竞争、产品与品牌分别取证，再形成研究结论。</p></div><button type="button" className="btn btn--secondary btn--sm" onClick={onOpenChecks}>打开研究工作区</button></header>
    <ResearchAcquisitionPanel projectId={workspace.project.id}/>
    <div className="rm-binding"><strong>{artifact ? `研究第${artifact.version}版` : '尚无研究报告'}</strong><span>固定方法 {method?.method.version ?? '正在读取'}</span><span>{artifact?.isCurrent ? '当前简报对应报告' : artifact ? '历史或待重核报告' : '等待实际研究产物'}</span></div>
    {method && !method.configured && <p className="rm-alert" role="status">{method.reason}</p>}
    <p className="rm-note">研究生成、证据核验、独立读者复核、负责人接收和正式放行分别记录。请分别核对独立读者记录与各项门禁，当前不会因采集完成标记研究交接通过。</p>
    <div className="rm-review-states"><span>证据核验：{reviewLabel(workspace.verification,artifact)}</span><span>充分性检查：{reviewLabel(workspace.readiness,artifact)}</span></div>
    {artifact ? <ArtifactDocument artifact={artifact} claims={claims} sources={sources} activeClaimId={null} onOpenClaim={onClaim}/> : <div className="rm-unanswered"><strong>先取得可追溯材料，再形成研究判断</strong><p>确认简报并预登记问题后，可由已配置的采集链取得资料，也可在资料库登记来源。缺少执行配置或有效材料时保留待研究状态。</p><ol>{chapters.map(chapter=><li key={chapter}>{chapter}：尚无已登记结论。</li>)}</ol></div>}
    <details className="rm-questions"><summary>来源与当前范围 · {sources.length}项</summary>{sources.length ? <ul>{sources.map(source=><li key={source.id}><strong>{source.title}</strong> · {source.publisher}<p>{source.excerpt}</p><p>来源核验：{source.verificationStatus==='verified'?'已核验':'尚未独立核实'} {source.url && <a href={source.url} target="_blank" rel="noreferrer">查看原出处</a>}</p></li>)}</ul> : <p>当前简报尚未登记来源。</p>}</details>
  </section>;
}
