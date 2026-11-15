import { useEffect, useRef, useState } from 'react';
import { STAGES, STAGE_BY_ID } from '../data/project';
import { DeckPreview } from './DeckPreview';
import { isDeckPreview, clock, phase, safeURL, stageLabel, type Artifact, type Project } from '../live';
import type { StageId } from '../types';
import { Decisions, type Act } from './ChatPanel';

function sourceURL(raw: string) {
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function ResearchReview({ p, act, busy }: { p: Project; act: Act; busy: boolean }) {
  const [focus, setFocus] = useState('');
  const handoff = p.research;
  const isResearch = p.stage === 'research';
  const isChecking = isResearch && p.status === 'running';
  const canStart = p.status !== 'running' && p.artifacts.some((a) => a.stage === 'brief');
  if (p.stage === 'brief') return null;
  return (
    <div className="research-review">
      <section className="block">
        <h2>研究结论</h2>
        {isChecking ? (
          <p className="lead" role="status">
            正在取证，完成后会在这里显示结论和依据。
          </p>
        ) : handoff ? (
          <>
            <p className="research-state">{handoff.ready ? '可交给策略' : '待补查，暂缓交给策略'}</p>
            {!handoff.findings.length && <p>本轮尚无可供策略使用的研究结论。</p>}
            {handoff.findings.map((finding, i) => {
              const url = sourceURL(finding.url);
              return (
                <section className="research-finding" key={i}>
                  <h3>{finding.conclusion}</h3>
                  <dl className="kv">
                    <div>
                      <dt>依据</dt>
                      <dd>
                        {finding.evidence}
                        {finding.source && (
                          <small>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                {finding.source}
                              </a>
                            ) : (
                              finding.source
                            )}
                          </small>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>对策略的用处</dt>
                      <dd>{finding.implication}</dd>
                    </div>
                  </dl>
                </section>
              );
            })}
            {!!handoff.gaps.length && (
              <>
                <h3>仍需补查</h3>
                <ul className="plain-list">
                  {handoff.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </>
            )}
            {handoff.next && (
              <p className="research-next">
                <strong>{handoff.ready ? '交接建议' : '下一步'}</strong>　{handoff.next}
              </p>
            )}
          </>
        ) : (
          <p>
            {p.artifacts.some((a) => a.stage === 'research')
              ? '这份历史研究稿尚无逐条依据及策略交接记录，可查看原稿或从研究重新开始。'
              : '尚未取得本轮研究结论。'}
          </p>
        )}
        {isResearch && p.status === 'failed' && (
          <p className="notice" role="status">
            {p.error}
          </p>
        )}
      </section>
      {canStart && (
        <form
          className="research-action"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act('research_again', focus.trim())) setFocus('');
          }}
        >
          <label htmlFor="research-focus">补查重点（选填）</label>
          <input
            id="research-focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="例如，优先比较门店海报与社交媒体海报"
          />
          <p>
            {isResearch
              ? '可直接按现有简报和缺口继续取证。'
              : '本次将沿用原简报，保存现有研究及后续产物为历史版本，重新检索。'}
          </p>
          <button type="submit" className="btn btn-dark" disabled={busy}>
            {isResearch ? '开始补查' : '从研究重新开始'}
          </button>
        </form>
      )}
    </div>
  );
}
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
          {id === 'research' && <ResearchReview key={p.id} p={p} act={act} busy={busy} />}
          {id === 'brief' && (
            <section className="block">
              <h2>原始需求</h2>
              <blockquote className="quote">{p.brief}</blockquote>
            </section>
          )}
          {id === 'final' && (
            <p className="demo-banner">此处记录本地终审与交付。业务批准需要由负责人另行确认。</p>
          )}
          {id === 'research' && a.length > 0 && (
            <details key={name ?? 'research-report'} className="research-original" open={!!name || undefined}>
              <summary>研究原稿与下载</summary>
              {a.map((x) => (
                <FileView key={x.url} a={x} />
              ))}
            </details>
          )}
          {id !== 'research' &&
            a.map((x) =>
              isDeckPreview(x) ? (
                <section key={x.url} className="block" data-artifact={x.name}>
                  <h2>提案预览</h2>
                  <DeckPreview file={x} />
                </section>
              ) : (
                <FileView key={x.url} a={x} />
              ),
            )}
          {a.length === 0 && (id !== 'research' || p.stage === 'brief') && (
            <p className="pending">这个阶段还没有交付文件。</p>
          )}
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
          {id === p.stage && id !== 'research' && <Decisions p={p} act={act} busy={busy} />}
        </article>
      </div>
    </div>
  );
}
