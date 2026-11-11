import { CircleDashed } from 'lucide-react';
import { ACTIVE_STAGES, activeStage, type Proposal, type StageId } from '../../domain/proposal';
import { useT } from '../../i18n';
import { Backed } from '../../proposal/ui';
import { stageOwnerLabel } from '../../proposal/stageOwners';

/** A stage with nothing to show yet: what it will produce, who does it and what it waits for. */
export function StageEmpty({ proposal: p, stage }: { proposal: Proposal; stage: StageId }) {
  const t = useT();
  const state = p.stages[stage];
  const before = ACTIVE_STAGES[ACTIVE_STAGES.indexOf(activeStage(stage)) - 1];
  const waitingOn = before && p.stages[before].status !== 'done' ? before : null;
  const scripted = state.status !== 'not_started';
  return (
    <div className="pw-empty">
      <CircleDashed size={28} aria-hidden="true" />
      <p className="pw-h3">{waitingOn ? t('pw.empty.waits', { stage: t(`pw.stage.${waitingOn}`) }) : scripted ? t('pw.empty.noScript') : t('pw.empty.notStarted')}</p>
      <p className="small">{t(`pw.produces.${stage}`)}</p>
      <p className="small muted">
        {t('pw.empty.lead', { lead: stageOwnerLabel(stage, state.lead) })}
        {p.mode === 'assisted' && (p.checkpoints as StageId[]).includes(stage) ? ` ${t('pw.empty.checkpoint')}` : ''}
      </p>
      {scripted && <Backed as="prototype" note={t('pw.empty.noScriptHint')} />}
    </div>
  );
}
