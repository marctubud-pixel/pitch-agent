import {pendingWriteAction} from '../collaboration/types';
import {readBrief} from '../services/http/briefEnvelope';
import {object, text} from '../services/http/dto';
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
  if (!pending || !recovery) return null;
  const body = object(JSON.parse(pending.body));
  const fields = typeof body.brief === 'string' ? readBrief(body.brief).fields : null;
  const preserved = fields ? [text(body.name) && `项目：${text(body.name)}`, `类型：${fields.proposalType === 'packaging' ? '包装' : fields.proposalType === 'kv' ? '主视觉 / 海报' : '未记录'}`, `品牌或产品：${fields.brand ?? ''}`, `背景：${fields.background}`, `目标受众：${fields.audience}`, `交付内容：${fields.deliverables.join('、')}`, `限制条件：${fields.constraints.join('、')}`].filter(Boolean).join('\n\n') : pending.kind === 'upload_original' ? `文件：${text(body.originalFilename)}\n\n核对原件保存结果，不代表资料已被解析、读取或采用。` : pending.kind === 'add_source' ? `来源：${text(object(body.input).title)}\n\n${text(object(body.input).excerpt)}` : pending.kind === 'record_handoff' ? `交接说明：${text(object(body.input).note)}\n\n核对将沿用提交时的研究版本与限制。` : '已保留原始版本和当时请求。核对不会改用当前稿件替代原输入。';
  const permitted = can(pendingWriteAction(pending.kind));
  return <div className="page" style={{paddingBlock: 16}}><section className="card" role="status" aria-label="未决简报提交">
    <h2>上次{pending.label}待核对</h2>
    <p>原请求已保存在当前浏览器会话中。请先核对结果，再继续提交。</p>
    <details><summary>查看保留的提交内容</summary><pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{preserved}</pre></details>
    <div className="cluster">
      <button type="button" className="btn btn--primary" disabled={busy || !permitted} onClick={async () => {
        setBusy(true); setError('');
        try {const id = await recovery.retry(); reloadAll(); void navigate(projectPath(id, 'proposal', {stage: ['create_project','save_brief','confirm_brief','upload_original'].includes(pending.kind) ? 'brief' : 'research'}));}
        catch (cause) {setError(toServiceError(cause).message);} finally {setBusy(false);}
      }}>核对原提交</button>
      <button type="button" className="btn btn--secondary" disabled={busy || !permitted} onClick={() => {
        try {recovery.acknowledge(); setError('');} catch (cause) {setError(toServiceError(cause).message);}
      }}>已核对，结束此记录</button>
    </div>
    {error && <p className="field__error" role="alert">{error}</p>}
  </section></div>;
}
