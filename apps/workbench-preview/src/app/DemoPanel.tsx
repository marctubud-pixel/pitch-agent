import { useId, useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { useT } from '../i18n';
import { SCENARIOS } from '../services/demo';
import { Modal } from '../ui/Modal';
import { useConfirm } from './confirm';
import { useFeedback } from './feedback';
import { Link, useRouter } from './router';
import { useServiceContext } from './services';

/**
 * Persistent "demo data" label in the header. Demo controls are a development tool, so the label
 * only links to the developer area instead of opening them in the product.
 */
export function DemoIndicator() {
  const { demo, demoState, service } = useServiceContext();
  const t = useT();
  if (!demo || !demoState) {
    return <span className="env-pill">{service.environment.kind === 'live' ? t('demo.live') : service.environment.label}</span>;
  }
  return (
    <Link to="/dev" className="demo-pill" title={t('pw.dev.title')}>
      <FlaskConical size={15} aria-hidden="true" />
      <span>{t('demo.pill')}</span>
      {demoState.scenario !== 'normal' && <span className="demo-pill__scenario">{t(`demo.scenario.${demoState.scenario}`)}</span>}
    </Link>
  );
}

/** The demo controls themselves, used from the developer area. */
export function DemoControls() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <FlaskConical size={16} aria-hidden="true" /> {t('pw.dev.open')}
      </button>
      <DemoPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function DemoPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { demo, demoState } = useServiceContext();
  const confirm = useConfirm();
  const { notify } = useFeedback();
  const { navigate } = useRouter();
  const groupId = useId();
  const t = useT();
  if (!demo || !demoState) return null;

  const reset = async () => {
    const ok = await confirm({
      title: t('demo.resetTitle'),
      body: t('demo.resetBody'),
      confirmLabel: t('demo.reset'),
      tone: 'danger',
    });
    if (!ok) return;
    await demo.resetDemoData();
    onClose();
    void navigate('/');
    notify({ tone: 'success', message: t('demo.resetDone') });
  };

  return (
    <Modal open={open} onClose={onClose} title={t('demo.title')} description={t('demo.description')} size="md">
      <div className="stack">
        <fieldset className="radio-group">
          <legend id={groupId}>{t('demo.scenario')}</legend>
          {SCENARIOS.map((s) => (
            <label key={s.id} className="radio-card">
              <input
                type="radio"
                name="demo-scenario"
                value={s.id}
                checked={demoState.scenario === s.id}
                onChange={() => {
                  demo.setScenario(s.id);
                  notify({ tone: 'info', message: t('demo.scenarioSet', { name: t(`demo.scenario.${s.id}`) }) });
                }}
              />
              <span>
                <strong>{t(`demo.scenario.${s.id}`)}</strong>
                <span className="small muted">{t(`demo.scenario.${s.id}.desc`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {demoState.scenario === 'conflict' && (
          <div className="panel">
            <p>
              {demoState.conflictArmed
                ? t('demo.conflictArmed')
                : t('demo.conflictUsed')}
            </p>
            {!demoState.conflictArmed && (
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => demo.armConflict()}>
                {t('demo.armConflict')}
              </button>
            )}
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={demoState.dropNextResponse} onChange={(e) => demo.setDropNextResponse(e.target.checked)} />
          <span>
            <strong>{t('demo.drop')}</strong>
            <span className="small muted">{t('demo.dropDesc')}</span>
          </span>
        </label>

        <div className="panel small">
          <p>
            {demoState.persistence === 'local'
              ? t('demo.persistLocal')
              : t('demo.persistMemory')}
          </p>
          {demoState.storageWarning && <p className="text-warn">{demoState.storageWarning}</p>}
          <p className="muted">{t('demo.fictional')}</p>
        </div>

        <div>
          <button type="button" className="btn btn--danger" onClick={reset}>
            <RotateCcw size={16} aria-hidden="true" /> {t('demo.reset')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
