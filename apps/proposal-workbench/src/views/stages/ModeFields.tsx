import { Bot, Hand } from 'lucide-react';
import { CHECKPOINT_STAGES, type CheckpointStage, type ProductionMode } from '../../domain/proposal';
import { useT } from '../../i18n';

/** Automatic or assisted production, and which checkpoints pause for a person. */
export function ModeFields({
  mode,
  checkpoints,
  onMode,
  onCheckpoints,
  disabled = false,
}: {
  mode: ProductionMode;
  checkpoints: CheckpointStage[];
  onMode: (m: ProductionMode) => void;
  onCheckpoints: (c: CheckpointStage[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="pw-modefields">
      <fieldset className="pw-choice" disabled={disabled}>
        <legend>{t('pw.modeQ')}</legend>
        {(['automatic', 'assisted'] as const).map((m) => (
          <label key={m} className="pw-choice__opt">
            <input type="radio" name="pmode" checked={mode === m} onChange={() => onMode(m)} />
            {m === 'automatic' ? <Bot size={18} aria-hidden="true" /> : <Hand size={18} aria-hidden="true" />}
            <span>
              <strong>{t(`pw.mode.${m}`)}</strong>
              <span className="small muted">{t(`pw.mode.${m}.desc`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {mode === 'assisted' && (
        <fieldset className="pw-checkpoints" disabled={disabled}>
          <legend>{t('pw.checkpointsQ')}</legend>
          <p className="small muted">{t('pw.checkpointsHint')}</p>
          <div className="pw-checkpoints__list">
            {CHECKPOINT_STAGES.map((c) => (
              <label key={c} className="pw-check">
                <input
                  type="checkbox"
                  checked={checkpoints.includes(c)}
                  onChange={(e) => onCheckpoints(e.target.checked ? [...checkpoints, c] : checkpoints.filter((x) => x !== c))}
                />
                <span>{t(`pw.stage.${c}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
