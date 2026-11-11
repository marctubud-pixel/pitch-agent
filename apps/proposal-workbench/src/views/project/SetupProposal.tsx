import { useState } from 'react';
import { Megaphone, Package } from 'lucide-react';
import { useProposalAction } from '../../app/proposalQuery';
import { CHECKPOINT_STAGES, type CheckpointStage, type ProductionMode, type ProposalType } from '../../domain/proposal';
import { useT } from '../../i18n';
import { Action } from '../../ui/kit';
import { ModeFields } from '../stages/ModeFields';

/** A Workbench project that has no proposal workspace yet (for example one made before it existed). */
export function SetupProposal({ projectId, name, client }: { projectId: string; name: string; client: string }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const [type, setType] = useState<ProposalType>('kv');
  const [mode, setMode] = useState<ProductionMode>('assisted');
  const [checkpoints, setCheckpoints] = useState<CheckpointStage[]>([...CHECKPOINT_STAGES]);
  return (
    <div className="page pw-page">
      <h1 className="pw-h1">{t('pw.setup.title')}</h1>
      <p className="pw-lede">{t('pw.setup.lede')}</p>
      <div className="card stack">
        <fieldset className="pw-choice">
          <legend>{t('pw.setup.type')}</legend>
          {(['kv', 'packaging'] as const).map((k) => (
            <label key={k} className="pw-choice__opt">
              <input type="radio" name="ptype" checked={type === k} onChange={() => setType(k)} />
              {k === 'kv' ? <Megaphone size={18} aria-hidden="true" /> : <Package size={18} aria-hidden="true" />}
              <span>
                <strong>{t(`pw.type.${k}`)}</strong>
                <span className="small muted">{t(`pw.type.${k}.desc`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <ModeFields mode={mode} checkpoints={checkpoints} onMode={setMode} onCheckpoints={setCheckpoints} />
        <div className="form-actions">
          <Action
            label={t('pw.setup.create')}
            variant="primary"
            pending={pending === 'setup'}
            onClick={() => void run('setup', (s) => s.createProposal({ workbenchId: projectId, name, client, type, mode, checkpoints }), t('pw.setup.done'))}
          />
        </div>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
