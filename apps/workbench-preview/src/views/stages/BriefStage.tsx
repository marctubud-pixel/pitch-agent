import { useEffect, useState } from 'react';
import { ArrowUpRight, FileText, Image as ImageIcon, Link2, Save } from 'lucide-react';
import { useProposalAction } from '../../app/proposalQuery';
import { Link, projectPath } from '../../app/router';
import type { CheckpointStage, ProductionMode, Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { useTeam } from '../../collaboration/context';
import { PermissionNotice } from '../../collaboration/TeamTools';
import { BrandResourceList } from '../../proposal/BrandResources';
import { ArtFrame } from '../../ui/art/ArtFrame';
import { Action, Embedded } from '../../ui/kit';
import { BriefView } from '../BriefView';
import { ModeChoices } from './ModeFields';

export function BriefStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const { can, snapshot } = useTeam();
  const [draft, setDraft] = useState<{ mode: ProductionMode; checkpoints: CheckpointStage[]; revision: number; status: 'editing' | 'saved' } | null>(null);
  const mode = draft?.mode ?? p.mode;
  const checkpoints = draft?.checkpoints ?? p.checkpoints;
  const allowed = can({ kind: 'manage' });
  const dirty = draft?.status === 'editing';
  const awaitingSync = draft?.status === 'saved' && p.revision < draft.revision;
  useEffect(() => {
    if (draft?.status === 'saved' && !awaitingSync) setDraft(null);
  }, [draft, awaitingSync]);
  const disabled = !allowed || pending !== null || awaitingSync;
  const settings = <div className="brief-mode-row pw-workmode">
    <ModeChoices compact mode={mode} disabled={disabled}
      onMode={(next) => setDraft({ mode: next, checkpoints, revision: draft?.revision ?? p.revision, status: 'editing' })} />
      <PermissionNotice action={{ kind: 'manage' }} />
      {dirty && draft.revision !== p.revision && <p className="pw-note" role="status">其他窗口已更新方案。当前设置草稿仍保留；请先核对新版再重新填写。</p>}
      {dirty && (
        <div className="cluster">
          <Action permission={{ kind: 'manage' }} label={t('pw.brief.saveMode')} variant="primary" icon={<Save size={16} aria-hidden="true" />} pending={pending === 'mode'} onClick={() => void run('mode', async (service) => { const saved = await service.setMode(p.id, mode, checkpoints, { expectedRevision: draft.revision, actor: snapshot.actor }); setDraft({ mode: saved.mode, checkpoints: saved.checkpoints, revision: saved.revision, status: 'saved' }); }, t('pw.brief.modeSaved'))} />
          <button type="button" className="btn btn--ghost" disabled={pending !== null} onClick={() => setDraft(null)}>{t('brief.discard')}</button>
        </div>
      )}
    {error && <p className="field__error" role="alert">{error}</p>}
  </div>;
  const supportingContent = <>
      {(p.task.inputs.length > 0 || Boolean(p.brandResources?.length)) && <details className="card project-disclosure project-materials">
        <summary><span>品牌与参考资料 · {p.task.inputs.length + (p.brandResources?.length ?? 0)}</span><span className="small muted">查看资料</span></summary>
        <div className="project-disclosure__body">
          <BrandResourceList proposal={p} />
          {p.task.inputs.length > 0 && <ul className="bf-inputs">
            {p.task.inputs.map(input => <li key={input.id} className="bf-input">
              <div className="bf-input__thumb">{input.art ? <ArtFrame spec={input.art} title={input.title} fill /> : input.kind === 'link' ? <Link2 size={24} aria-hidden="true" /> : input.kind === 'image' ? <ImageIcon size={24} aria-hidden="true" /> : <FileText size={24} aria-hidden="true" />}</div>
              <p className="bf-input__title">{input.title}</p><p className="small muted">{input.note}</p><span className="bf-chip">{t(`pw.inputKind.${input.kind}`)}</span>
            </li>)}
          </ul>}
          <Link className="text-link small" to={projectPath(p.workbenchId, 'library')}>{t('pw.brief.inLibrary')} <ArrowUpRight size={13} aria-hidden="true" /></Link>
        </div>
      </details>}
  </>;
  return <div className="pw-brief pw-brief--focused">
    <section className="project-taskcard" aria-label="任务卡">
      <Embedded><BriefView projectId={p.workbenchId} fallbackProposalType={p.type} settings={settings} supportingContent={supportingContent} /></Embedded>
    </section>
  </div>;
}
