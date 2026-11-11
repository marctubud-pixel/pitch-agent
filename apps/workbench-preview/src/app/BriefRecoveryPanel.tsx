import {pendingWriteAction} from '../collaboration/types';
import {readBrief} from '../services/http/briefEnvelope';
import {object, text, records} from '../services/http/dto';
import {useState, useSyncExternalStore} from 'react';
import {useServiceContext} from './services';
import {useRouter, projectPath} from './router';
import {useTeam} from '../collaboration/context';
import {toServiceError} from '../domain/service';

export function BriefRecoveryPanel() {
  const {service, reloadAll} = useServiceContext(), {navigate} = useRouter(), {can} = useTeam();
  const recovery = service.briefRecovery;
  const pending = useSyncExternalStore(listener => service.subscribe(() => listener()), () => {
    try {return recovery?.getPending() ?? null;} catch {return null;}
  }, () => null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [historical,setHistorical]=useState<{message:string;content:string;projectId:string}|null>(null);
  if(!pending||!recovery)return historical?<div className="page" style={{paddingBlock:16}}><section className="card" role="status" aria-label="已核对的历史提交"><h2>原提交已核对</h2><p>{historical.message}</p><details><summary>查看原提交内容</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{historical.content}</pre></details><div className="cluster"><button className="btn btn--primary" onClick={()=>void navigate(projectPath(historical.projectId,'proposal',{stage:'research'}))}>查看当前研究</button><button className="btn btn--secondary" onClick={()=>setHistorical(null)}>关闭提示</button></div></section></div>:null;
  const body = object(JSON.parse(pending.body));
  const fields = typeof body.brief === 'string' ? readBrief(body.brief).fields : null;
  const preserved = fields ? [text(body.name) && `项目：${text(body.name)}`, `类型：${fields.proposalType === 'packaging' ? '包装' : fields.proposalType === 'kv' ? '主视觉 / 海报' : '未记录'}`, `品牌或产品：${fields.brand ?? ''}`, `背景：${fields.background}`, `目标受众：${fields.audience}`, `交付内容：${fields.deliverables.join('、')}`, `限制条件：${fields.constraints.join('、')}`].filter(Boolean).join('\n\n') : pending.kind === 'upload_original' ? `文件：${text(body.originalFilename)}\n\n核对原件保存结果，不代表资料已被解析、读取或采用。` : pending.kind === 'dispose_reader' ? `保留的逐项处理：\n\n${records(body.dispositions).map(item=>`${text(item.issueId)}：${text(item.response)}\n新稿依据：${records(item.locations).map(l=>text(l.quote)).join('\n')}`).join('\n\n')}\n\n核对只恢复原提交，不代表独立复查通过。` : pending.kind === 'register_research_questions' ? `研究问题：\n${Array.isArray(body.questions) ? body.questions.map(q => text(object(q).question)).join('\n') : ''}\n\n核对将保留原问题、读者数量和提交时的版本。` : pending.kind === 'add_source' ? `来源：${text(object(body.input).title)}\n\n${text(object(body.input).excerpt)}` : pending.kind === 'record_handoff' ? `交接说明：${text(object(body.input).note)}\n\n核对将沿用提交时的研究版本与限制。` : '已保留原始版本和当时请求。核对不会改用当前稿件替代原输入。';
  const permitted = can(pendingWriteAction(pending.kind));
  return <div className="page" style={{paddingBlock: 16}}><section className="card" role="status" aria-label="未决简报提交">
    <h2>上次{pending.label}待核对</h2>
    <p>原请求已保存在当前浏览器会话中。请先核对结果，再继续提交。</p>
    <details><summary>查看保留的提交内容</summary><pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{preserved}</pre></details>
    <div className="cluster">
      <button type="button" className="btn btn--primary" disabled={busy || !permitted} onClick={async () => {
        setBusy(true); setError('');setHistorical(null);
        try {const id = await recovery.retry(); reloadAll(); void navigate(projectPath(id, 'proposal', {stage: ['create_project','save_brief','confirm_brief','upload_original'].includes(pending.kind) ? 'brief' : 'research'}));}
        catch (cause) {const failure=toServiceError(cause);if(['register_research_questions','read_research','reconcile_reader','dispose_reader','revise_research'].includes(pending.kind)&&failure.kind==='conflict'&&!failure.outcomeUnknown&&!recovery.getPending()){setHistorical({message:failure.message,content:preserved,projectId:pending.path.split('/')[2]});reloadAll();}else setError(failure.message);} finally {setBusy(false);}
      }}>核对原提交</button>
      <button type="button" className="btn btn--secondary" disabled={busy || !permitted} onClick={() => {
        try {recovery.acknowledge(); setError('');} catch (cause) {setError(toServiceError(cause).message);}
      }}>已核对，结束此记录</button>
    </div>
    {error && <p className="field__error" role="alert">{error}</p>}
  </section></div>;
}
