import { useEffect, useRef, useState } from 'react';
import { STAGES, STAGE_BY_ID } from '../data/project';
import { DeckPreview } from './DeckPreview';
import { isDeckPreview, clock, phase, safeURL, stageLabel, type Artifact, type Project } from '../live';
import type { StageId } from '../types';
import { Decisions, type Act } from './ChatPanel';

function FileView({ a }: { a: Artifact }) {
  const [text, show] = useState(a.text || ''),
    [err, setErr] = useState('');
  const url = safeURL(a.url);
  useEffect(() => {
    show(a.text || '');
    setErr('');
    if (a.kind !== 'text' || a.text || !url) return;
    const c = new AbortController();
    fetch(url, { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw new Error('读取失败');
        return r.text();
      })
      .then((v) => {
        if (!c.signal.aborted) show(v);
      })
      .catch(() => {
        if (!c.signal.aborted) setErr('暂时无法预览，仍可下载原文件。');
      });
    return () => c.abort();
  }, [a.text, a.kind, url]);
  return (
    <section className="block" data-artifact={a.name}>
      <h2>{a.name}</h2>
      {a.kind === 'image' && <img className="live-art" src={url} alt={a.name} />}{' '}
      {a.kind === 'text' && <p className="live-text">{err || text || '正在读取…'}</p>}
      <a className="btn btn-sm" href={url} download={a.name}>
        下载{a.kind === 'pptx' ? '可编辑 PPTX' : '原文件'} ↓
      </a>
    </section>
  );
}
export function DetailSheet({
  p,
  id,
  name,
  close,
  nav,
  act,
  busy,
}: {
  p: Project;
  id: StageId;
  name?: string;
  close: () => void;
  nav: (s: StageId) => void;
  act: Act;
  busy: boolean;
}) {
  const stage = STAGE_BY_ID[id],
    scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const target = Array.from(el?.querySelectorAll<HTMLElement>('[data-artifact]') || []).find(
      (x) => x.dataset.artifact === name,
    );
    if (target) target.scrollIntoView({ block: 'start' });
    else el?.scrollTo(0, 0);
  }, [id, name]);
  const a = p.artifacts.filter((x) => x.stage === id),
    e = p.events.filter((x) => x.stage === id);
  return (
    <div className="sheet">
      <div className="sheet-bar">
        <button className="back-link" onClick={close}>
          ← 回到工作区
        </button>
        <nav className="sheet-tabs" aria-label="提案阶段">
          {STAGES.map((s) => (
            <button
              key={s.id}
              className={(s.id === id ? 'is-on ' : '') + 'st-' + phase(p, s.id)}
              onClick={() => nav(s.id)}
              aria-current={s.id === id}
            >
              <span>{s.index}</span>
              {s.name}
            </button>
          ))}
        </nav>
      </div>
      <div className="sheet-scroll" ref={scroller}>
        <article className="sheet-doc">
          <header className="sheet-head">
            <p className="mono-label">
              阶段 {stage.index} / 7　·　{stageLabel(p, id)}
            </p>
            <h1>{stage.name}</h1>
          </header>
          {id === 'brief' && (
            <section className="block">
              <h2>原始需求</h2>
              <blockquote className="quote">{p.brief}</blockquote>
            </section>
          )}
          {id === 'final' && (
            <p className="demo-banner">此处记录本地终审与交付。业务批准需要由负责人另行确认。</p>
          )}
          {a.map((x) =>
            isDeckPreview(x) ? (
              <section key={x.url} className="block" data-artifact={x.name}>
                <h2>提案预览</h2>
                <DeckPreview file={x} />
              </section>
            ) : (
              <FileView key={x.url} a={x} />
            ),
          )}
          {a.length === 0 && <p className="pending">这个阶段还没有交付文件。</p>}
          {e.length > 0 && (
            <section className="block">
              <h2>执行记录</h2>
              <ul className="plain-list">
                {e.map((v, i) => (
                  <li key={i}>
                    <span className="time">{clock(v.at)}　</span>
                    {v.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {id === p.stage && <Decisions p={p} act={act} busy={busy} />}
        </article>
      </div>
    </div>
  );
}
