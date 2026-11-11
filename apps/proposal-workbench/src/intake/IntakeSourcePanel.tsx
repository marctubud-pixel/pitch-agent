import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ClipboardPaste, Download, FileText, FileUp, MessageSquareText, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useIntake } from '../app/services';
import { MAX_BRIEF_BYTES, type IntakeSource, type SampleBrief } from '../domain/intake';
import { useT } from '../i18n';
import { Spinner } from '../ui/kit';
import type { IntakeRunState } from './useIntakeRun';

export type SourceTab = 'file' | 'paste' | 'request' | 'sample';
const TABS: SourceTab[] = ['file', 'paste', 'request', 'sample'];
const ICONS = { file: FileUp, paste: ClipboardPaste, request: MessageSquareText, sample: Sparkles } as const;
const ACCEPT = '.pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Where the brief comes from: a file, pasted text, a short request, or a bundled sample. */
export function IntakeSourcePanel({
  state,
  onRun,
  onCancel,
  initialTab = 'file',
}: {
  state: IntakeRunState;
  onRun: (source: IntakeSource) => void;
  onCancel: () => void;
  initialTab?: SourceTab;
}) {
  const t = useT();
  const [tab, setTab] = useState<SourceTab>(initialTab);
  const [paste, setPaste] = useState('');
  const [request, setRequest] = useState('');
  const base = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(tab);
    const next = event.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : event.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  if (state.status === 'working') return <IntakeProgressCard state={state} onCancel={onCancel} />;

  return (
    <section className="intake-source card" aria-labelledby={`${base}-title`}>
      <h2 id={`${base}-title`} className="card__title">
        {t('intake.sourceTitle')}
      </h2>
      <div className="intake-tabs" role="tablist" aria-label={t('intake.sourceTitle')}>
        {TABS.map((id) => {
          const Icon = ICONS[id];
          return (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${id}`}
              aria-controls={`${base}-panel-${id}`}
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              className="intake-tab"
              onClick={() => setTab(id)}
              onKeyDown={onTabKey}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{t(`intake.tab.${id}`)}</span>
            </button>
          );
        })}
      </div>

      {state.status === 'error' && (
        <IntakeErrorCard
          state={state}
          onPaste={() => {
            setTab('paste');
            requestAnimationFrame(() => document.getElementById(`${base}-paste`)?.focus());
          }}
        />
      )}

      <div role="tabpanel" id={`${base}-panel-${tab}`} aria-labelledby={`${base}-tab-${tab}`} className="intake-panel">
        {tab === 'file' && <DropZone onFile={(file) => onRun({ kind: 'file', file })} />}
        {tab === 'paste' && (
          <form
            className="stack-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (paste.trim()) onRun({ kind: 'paste', text: paste });
            }}
          >
            <label htmlFor={`${base}-paste`} className="field__label">
              {t('intake.pasteLabel')}
            </label>
            <textarea id={`${base}-paste`} className="intake-text" rows={10} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t('intake.pastePlaceholder')} />
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" aria-disabled={!paste.trim() || undefined}>
                <FileText size={16} aria-hidden="true" /> {t('intake.readText')}
              </button>
            </div>
          </form>
        )}
        {tab === 'request' && (
          <form
            className="stack-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (request.trim()) onRun({ kind: 'request', text: request });
            }}
          >
            <label htmlFor={`${base}-request`} className="field__label">
              {t('intake.requestLabel')}
            </label>
            <textarea id={`${base}-request`} className="intake-text" rows={4} value={request} onChange={(e) => setRequest(e.target.value)} placeholder={t('intake.requestPlaceholder')} />
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" aria-disabled={!request.trim() || undefined}>
                <MessageSquareText size={16} aria-hidden="true" /> {t('intake.useRequest')}
              </button>
            </div>
          </form>
        )}
        {tab === 'sample' && <SampleList onPick={(sampleId) => onRun({ kind: 'sample', sampleId })} />}
      </div>
      <p className="intake-honesty small">{t('intake.honesty')}</p>
    </section>
  );
}

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  return (
    <div
      className="dropzone"
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <FileUp size={28} aria-hidden="true" />
      <p className="dropzone__title">{t('intake.dropTitle')}</p>
      <button type="button" className="btn btn--primary" onClick={() => input.current?.click()}>
        {t('intake.choose')}
      </button>
      <p className="small muted">{t('intake.formats', { mb: Math.round(MAX_BRIEF_BYTES / 1024 / 1024) })}</p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={t('intake.choose')}
        data-testid="brief-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

function SampleList({ onPick }: { onPick: (id: string) => void }) {
  const t = useT();
  const intake = useIntake();
  const [samples, setSamples] = useState<SampleBrief[] | null>(null);
  useEffect(() => {
    let alive = true;
    void intake.listSamples().then((s) => alive && setSamples(s));
    return () => {
      alive = false;
    };
  }, [intake]);
  const download = async (sample: SampleBrief) => {
    const file = await intake.getSampleFile(sample.id);
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = sample.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!samples) return <Spinner />;
  if (!samples.length) return <p className="muted">{t('intake.noSamples')}</p>;
  return (
    <>
      <p className="small">{t('intake.sampleNote')}</p>
      <ul className="sample-list">
        {samples.map((s) => (
          <li key={s.id} className="sample">
            <div className="sample__text">
              <p className="sample__title">{s.title}</p>
              <p className="small muted">{s.description}</p>
              <span className="sim-label">{t('intake.simulatedMapping')}</span>
            </div>
            <div className="sample__actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => onPick(s.id)} aria-label={`${t('intake.useSample')}: ${s.title}`}>
                {t('intake.useSample')}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void download(s)} aria-label={`${t('intake.downloadSample')}: ${s.fileName}`}>
                <Download size={14} aria-hidden="true" /> {t('intake.downloadSample')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const STAGES = ['reading', 'extracting', 'mapping'] as const;

function IntakeProgressCard({ state, onCancel }: { state: Extract<IntakeRunState, { status: 'working' }>; onCancel: () => void }) {
  const t = useT();
  const at = STAGES.indexOf(state.progress.stage);
  return (
    <section className="intake-progress card" aria-live="polite" aria-busy="true">
      <div className="intake-progress__head">
        <Spinner size={20} />
        <div>
          <p className="intake-progress__title">{state.label ? t('intake.processingFile', { name: state.label }) : t('intake.processingText')}</p>
          <p className="small muted">{t(`intake.stage.${state.progress.stage}`)}</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          <X size={14} aria-hidden="true" /> {t('common.cancel')}
        </button>
      </div>
      <ol className="intake-stages">
        {STAGES.map((s, i) => (
          <li key={s} data-state={i < at ? 'done' : i === at ? 'active' : 'todo'}>
            <span>{t(`intake.stageShort.${s}`)}</span>
            {i === at && state.progress.ratio !== undefined && <progress max={1} value={state.progress.ratio} aria-label={t(`intake.stage.${s}`)} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function IntakeErrorCard({ state, onPaste }: { state: Extract<IntakeRunState, { status: 'error' }>; onPaste: () => void }) {
  const t = useT();
  return (
    <div className="banner banner--row intake-error" data-tone="bad" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <div className="stack-sm">
        <p>
          <strong>{state.label ? t('intake.errorFile', { name: state.label }) : t('intake.errorText')}</strong> {t(`intake.err.${state.code}`)}
        </p>
        {state.detail && state.code === 'unavailable' && <p className="small">{state.detail}</p>}
        {state.source.kind === 'file' && (
          <div className="cluster">
            <button type="button" className="btn btn--secondary btn--sm" onClick={onPaste}>
              <ClipboardPaste size={14} aria-hidden="true" /> {t('intake.pasteInstead')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
