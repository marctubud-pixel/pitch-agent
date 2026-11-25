import { useEffect, useRef, useState } from 'react';
import { STAGES, STAGE_BY_ID } from '../data/project';
import { researchDisplay } from './researchDisplay';
import { MediaStageOutput } from './MediaStageOutput';
import { TextStageOutput } from './TextStageOutput';
import { phase, researchQuestion, stageLabel, type Project } from '../live';
import type { StageId } from '../types';
import { Decisions, type Act } from './ChatPanel';

function ResearchReview({ p, act, busy }: { p: Project; act: Act; busy: boolean }) {
  const [focus, setFocus] = useState('');
  const handoff = p.research;
  const gaps = researchDisplay((handoff?.gaps || []).filter(gap=>!handoff?.sections || typeof gap==='string' || !gap.chapter));
  const isResearch = p.stage === 'research';
  const isChecking = isResearch && p.status === 'running';
  const question = researchQuestion(p);
  const returned = handoff?.next && p.events.some((event) => event.text === '策略退回研究：' + handoff.next);
  const submitResearch = async (text: string) => {
    if (await act('research_again', text)) setFocus('');
  };
  const canStart = isResearch && !(handoff?.ready) && !handoff?.digestPending && p.status !== 'running' && p.artifacts.some((a) => a.stage === 'brief');
  if (p.stage === 'brief') return null;
  const hasVisibleBlock =
    isChecking ||
    (handoff?.ready && isResearch && p.status === 'waiting') ||
    (Boolean(handoff) && !handoff?.ready) ||
    (isResearch && p.status === 'failed');
  if (!hasVisibleBlock && !canStart) return null;
  return (
    <div className="research-review">
      {hasVisibleBlock && (
        <section className="block">
          {isChecking && (
            <p role="status">{handoff?.ready ? '正在编辑研究摘要。' : p.researchFollowup ? '正在按本轮缺口补查。' : '正在查找与简报相关的来源。'}</p>
          )}
          {handoff?.ready && isResearch && p.status === 'waiting' && !handoff.sections && !handoff.digest?.length && (
            <>
              {handoff.digestPending && <p role="status">{p.error || '研究底稿已保存，摘要待编辑。'}</p>}
              <button className="btn btn-dark" disabled={busy} onClick={() => act('research_digest', '')}>{handoff.digestPending ? '重新编辑摘要' : '从现有底稿编辑摘要'}</button>
            </>
          )}
          {handoff?.ready && !handoff.digestPending && !isChecking && isResearch && p.status === 'waiting' && (
            <button className="btn btn-dark" disabled={busy} onClick={() => act('research_continue', '')}>进入策略</button>
          )}
          {!!handoff && !handoff.ready && (
            <>
              <h2>{p.canRequestStrategy ? '策略交接 · 可进入策略' : handoff.conditional ? '策略交接 · 已附研究限制' : '策略交接 · 待补查'}</h2>
              {p.canRequestStrategy && <><p>已核发现可用于策略，仍缺的依据随稿保留。</p>
                <button className="btn btn-dark" disabled={busy} onClick={() => act('research_continue', '')}>用现有研究进入策略</button></>}
              {returned && <p>历史退回记录　{handoff.next}</p>}
              {gaps.length ? <ul className="findings research-gaps">{gaps.map((gap,i)=><li key={i}>
                <div><span className="mono-label">{gap.label}</span><p>{gap.message}</p></div>
              </li>)}</ul> : <p>{handoff.next}</p>}
            </>
          )}
          {isResearch && p.status === 'failed' && (
            <p className="notice" role="status">
              {p.error}
            </p>
          )}
        </section>
      )}
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
          <div className="btn-row">
            <button type="submit" className="btn btn-dark" disabled={busy || (!!question && !focus.trim())}>
              {question ? '按此回答补查' : '开始补查'}
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
export function DetailSheet({
  p,
  id,
  name,
  close,
  nav,
  correct,
  act,
  busy,
}: {
  p: Project;
  id: StageId;
  name?: string;
  close: () => void;
  nav: (s: StageId) => void;
  correct: () => void;
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
            <TextStageOutput correct={correct} p={p} id={id} busy={busy} onChoose={(value) => act('choice', value)} />
          )}
          {id === 'research' && <ResearchReview key={p.id} p={p} act={act} busy={busy} />}
          {id === p.stage && (p.status === 'failed' || p.finalReturn || id === 'visual' || id==='brief') && (id !== 'research' || p.finalReturn) && (
            <Decisions p={p} act={act} busy={busy} />
          )}
        </article>
      </div>
    </div>
  );
}
