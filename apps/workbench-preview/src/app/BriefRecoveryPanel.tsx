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
  const preserved = fields ? [text(body.name) && `项目：${text(body.name)}`, `类型：${fields.proposalType === 'packaging' ? '包装' : fields.proposalType === 'kv' ? '主视觉 / 海报' : '未记录'}`, `品牌或产品：${fields.brand ?? ''}`, `背景：${fields.background}`, `目标受众：${fields.audience}`, `交付内容：${fields.deliverables.join('、')}`, `限制条件：${fields.constraints.join('、')}`].filter(Boolean).join('\n\n') : '保留了对当时任务卡的确认请求。核对将沿用原始版本。';
  const permitted = can({kind: pending.label === '新建提案' ? 'manage' : pending.label === '保存简报' ? 'edit_brief' : 'workflow'});
  return <div className="page" style={{paddingBlock: 16}}><section className="card" role="status" aria-label="未决简报提交">
    <h2>上次{pending.label}待核对</h2>
    <p>原请求已保存在当前浏览器会话中。请先核对结果，再继续提交。</p>
    <details><summary>查看保留的提交内容</summary><pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{preserved}</pre></details>
    <div className="cluster">
      <button type="button" className="btn btn--primary" disabled={busy || !permitted} onClick={async () => {
        setBusy(true); setError('');
        try {const id = await recovery.retry(); reloadAll(); void navigate(projectPath(id, 'proposal', {stage: 'brief'}));}
        catch (cause) {setError(toServiceError(cause).message);} finally {setBusy(false);}
      }}>核对原提交</button>
      <button type="button" className="btn btn--secondary" disabled={busy || !permitted} onClick={() => {
        try {recovery.acknowledge(); setError('');} catch (cause) {setError(toServiceError(cause).message);}
      }}>已核对，结束此记录</button>
    </div>
    {error && <p className="field__error" role="alert">{error}</p>}
  </section></div>;
}
