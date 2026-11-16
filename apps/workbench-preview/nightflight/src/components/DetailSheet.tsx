import { useEffect, useRef, useState } from 'react';
import { STAGES, STAGE_BY_ID } from '../data/project';
import { researchDisplay } from './researchDisplay';
import { MediaStageOutput } from './MediaStageOutput';
import { ResearchDigest, ResearchImageGallery, ResearchSource, TextStageOutput } from './TextStageOutput';
import { clock, phase, researchQuestion, safeURL, stageLabel, type Artifact, type Project } from '../live';
import type { StageId } from '../types';
import { Decisions, type Act } from './ChatPanel';

function ResearchReview({ p, act, busy }: { p: Project; act: Act; busy: boolean }) {
  const [focus, setFocus] = useState('');
  const handoff = p.research;
  const { questions, clues } = researchDisplay(handoff?.gaps || []);
  const clueCount = clues.length + (handoff && !handoff.ready ? handoff.digest?.length ?? 0 : 0);
  const isResearch = p.stage === 'research';
  const isChecking = isResearch && p.status === 'running';
  const question = researchQuestion(p);
  const returned = handoff?.next && p.events.some((event) => event.text === '策略退回研究：' + handoff.next);
  const submitResearch = async (text: string) => {
    if (await act('research_again', text)) setFocus('');
  };
  const canStart = !handoff?.digestPending && p.status !== 'running' && p.artifacts.some((a) => a.stage === 'brief');
  if (p.stage === 'brief') return null;
  return (
    <div className="research-review">
      <section className="block">
        {isChecking && (
          <p role="status">{handoff?.ready ? '正在编辑研究摘要。' : p.researchFollowup ? '正在按本轮缺口补查。' : '正在查找与简报相关的来源。'}</p>
        )}
        {handoff?.ready && isResearch && p.status === 'waiting' && !handoff.digest?.length && (
          <>
            {handoff.digestPending && <p role="status">{p.error || '研究底稿已保存，摘要待编辑。'}</p>}
            <button className="btn btn-dark" disabled={busy} onClick={() => act('research_digest', '')}>{handoff.digestPending ? '重新编辑摘要' : '从现有底稿编辑摘要'}</button>
          </>
        )}
        {handoff?.ready && !handoff.digestPending && !isChecking && (
          isResearch && p.status === 'waiting'
            ? <button className="btn btn-dark" disabled={busy} onClick={() => act('research_continue', '')}>进入策略</button>
            : <p className="research-state">可交给策略</p>
        )}
        {!!handoff && !handoff.ready && (
          <>
            <h2>影响策略的待查问题</h2>
            {returned && <p>策略退回原因　{handoff.next}</p>}
            {questions.length ? (
              <ol className="findings">
                {questions.map((item, i) => (
                  <li key={item.question}>
                    <span className="finding-no">{i + 1}</span>
                    <div>
                      <h3>{item.question}</h3>
                      <p>{item.reason}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p>现有依据仍不足以交给策略，具体缺口见研究原稿。</p>
            )}
          </>
        )}
        {!!clueCount && (
          <details className="research-original">
            <summary>已有线索（{clueCount}）</summary>
            {handoff && !handoff.ready && !!handoff.digest?.length && <ResearchDigest report={handoff} artifacts={p.artifacts} attachments={p.attachments} />}
            <ul className="plain-list">{clues.map((clue) => <li key={clue}>{clue}</li>)}</ul>
          </details>
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
            if (!question || focus.trim()) await submitResearch(focus.trim());
          }}
        >
          <label htmlFor="research-focus">{question || '补查重点（选填）'}</label>
          <input
            id="research-focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            required={!!question}
            placeholder={question ? '写下你的判断或使用条件' : '例如，优先比较门店海报与社交媒体海报'}
          />
          {!isResearch && <p>沿用原简报重新研究，历史版本可继续查看。</p>}
          <div className="btn-row">
            <button type="submit" className="btn btn-dark" disabled={busy || (!!question && !focus.trim())}>
              {question ? '按此回答补查' : isResearch ? '开始补查' : '从研究重新开始'}
            </button>
            {question && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => submitResearch('暂不确定，请比较不同条件，标明各自的适用范围。')}
              >
                暂不确定，按条件继续
              </button>
            )}
          </div>
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
    if (target) {
      const disclosure = target.closest('details');
      if (disclosure) disclosure.open = true;
      target.scrollIntoView({ block: 'start' });
    } else el?.scrollTo(0, 0);
  }, [id, name]);
  const findings = id === 'research' ? p.research?.findings ?? [] : [];
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
              {id === 'research' && (p.mode === 'auto' ? '　·　自动调研' : '　·　协作调研')}
            </p>
            <h1>{stage.name}</h1>
          </header>
          {id === 'visual' || id === 'layout' || id === 'final' ? (
            <MediaStageOutput p={p} id={id} name={name} act={act} busy={busy} />
          ) : (
            <TextStageOutput p={p} id={id} busy={busy} onChoose={(value) => act('choice', value)} />
          )}
          {id === 'research' && <ResearchReview key={p.id} p={p} act={act} busy={busy} />}
          {id === p.stage && (p.status === 'failed' || id === 'visual') && id !== 'research' && (
            <Decisions p={p} act={act} busy={busy} />
          )}
          {id !== 'copy' && (a.length > 0 || findings.length > 0) && (
            <details key={id + '-originals'} className="research-original">
              <summary>{id === 'research' ? '研究底稿与原图' : `原始文件与下载（${a.length}）`}</summary>
              {findings.map((finding, i) => (
                <section className="block" key={i}>
                  <h3>{finding.conclusion}</h3>
                  <p>{finding.evidence}</p>
                  {finding.source && <p><ResearchSource finding={finding} attachments={p.attachments} /></p>}
                  {finding.implication && <p>{finding.implication}</p>}
                  {!!finding.images?.length && <ResearchImageGallery images={finding.images} artifacts={a} attachments={p.attachments} />}
                </section>
              ))}
              {a.map((x) =>
                x.kind === 'text' && !x.name.endsWith('.deck.json') ? (
                  <FileView key={x.url} a={x} />
                ) : (
                  <p key={x.url} data-artifact={x.name}>
                    <a href={safeURL(x.url)} download={x.name}>
                      {x.name} ↓
                    </a>
                  </p>
                ),
              )}
            </details>
          )}
          {id !== 'copy' && e.length > 0 && (
            <details key={id + '-events'} className="research-original">
              <summary>执行记录（{e.length}）</summary>
              <ul className="plain-list">
                {e.map((v, i) => (
                  <li key={i}>
                    <span className="time">{clock(v.at)}　</span>
                    {v.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      </div>
    </div>
  );
}
