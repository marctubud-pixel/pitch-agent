import { useState } from 'react';
import type { StageId } from '../types';
import { STAGES, STAGE_BY_ID } from '../data/project';
import { visualCaption } from './MediaStageOutput';
import { DeckPreview } from './DeckPreview';
import {
  isDeckPreview,
  phase,
  safeURL,
  stageLabel,
  researchQuestion,
  projectStatus,
  type Project,
  type Artifact,
} from '../live';
import { BotCard } from './Bot';
import { Icon } from './Icon';
function documentTitle(p: Project, file: Artifact) {
  if (isDeckPreview(file)) return '提案预览';
  if (file.kind === 'pptx') return '可编辑提案';
  if (file.visual?.role === 'reference') return visualCaption(p, file) + ' · 参考原图';
  if (file.kind === 'image') return visualCaption(p, file) + ' · 概念稿';
  return file.text?.match(/^# (.+)$/m)?.[1] || STAGE_BY_ID[file.stage].name + '原稿';
}

export function Workspace({
  p,
  open,
  log,
  chat,
  library,
  celebrate,
}: {
  p: Project;
  open: (s: StageId, name?: string) => void;
  log: () => void;
  chat: () => void;
  library: () => void;
  celebrate: () => void;
}) {
  const [show, setShow] = useState<boolean | null>(null),
    st = STAGE_BY_ID[p.stage],
    done = STAGES.filter((s) => phase(p, s.id) === 'done');
  const pending = STAGES.filter((s) => phase(p, s.id) !== 'done'),
    latest = p.events.at(-1)?.text;
  const images = p.artifacts.filter((a) => a.kind === 'image' && a.stage !== 'research' && a.visual?.role !== 'comparison' && a.visual?.role !== 'reference'),
    docs = p.artifacts.filter((a) => a.kind === 'text' && !isDeckPreview(a)),
    decks = p.artifacts.filter((a) => a.kind === 'pptx');
  const preview = p.artifacts.find(isDeckPreview);
  const researchPaused = p.stage === 'research' && p.status === 'waiting' && !p.research?.ready && !p.canRequestStrategy && !researchQuestion(p);
  const revisions = (p.feedback || []).filter(
    (item) => 'stage' in item && (item.stage === 'visual' || item.stage === 'final'),
  );
  const next =
    p.status === 'failed'
      ? '查看中断原因，确认后重新尝试。'
      : p.status === 'waiting'
        ? p.stage === 'research'
          ? researchQuestion(p)
            ? '查看研究发现，回答影响方向的问题。'
            : p.research?.digestPending ? '打开研究，重新编辑摘要。' : p.research?.ready ? '查看研究结果，准备好后进入策略。' : p.canRequestStrategy ? '查看已核结论，可带着缺口进入策略。' : '查看研究缺口，补查后再交给策略。'
          : p.stage === 'visual'
            ? '打开视觉稿，选定要采用的图稿。'
            : p.stage === 'layout' && p.layoutDraftOnly
              ? p.layoutMaterialsOnly ? '打开版式，下载本版编稿材料包。' : '打开版式，查看逐页稿和本次交给模型的材料。'
            : '在对话里查看备选方向，选定后继续。'
        : p.status === 'done'
          ? '查看终审记录，下载可编辑提案。'
          : st.summary;
  return (
    <div className="ws-grid">
      <section className="col">
        <h2 className="col-title">主理人</h2>
        <BotCard
          bot={{
            label: projectStatus(p),
            detail: st.name,
            state: researchPaused
              ? 'idle'
              : ({ waiting: 'waiting', done: 'done', failed: 'blocked', running: 'working' } as const)[
                  p.status
                ],
          }}
          onPoke={p.status === 'done' ? celebrate : undefined}
        />
        <p className="mode-line">{p.mode === 'auto' ? '全自动 · SURPRISE ME' : '协作 · IDEA'}</p>
        <div className={'now-box ' + (p.status === 'failed' ? 'is-blocked' : '')}>
          <p>
            {researchPaused
              ? '本轮研究暂停：现有依据不足以交给策略。无需作选择。'
              : p.canRequestStrategy ? '已核发现可用于撰写策略，未决问题随稿保留。' : p.error || latest || '项目已建立。'}
          </p>
          {p.status === 'running' && <span className="block-cursor" />}
        </div>
        <div className="btn-row">
          <button className="btn" onClick={log}>
            <Icon name="log" />
            执行记录
          </button>
          <button
            className="btn"
            onClick={p.stage === 'research' && p.status === 'waiting' ? () => open('research') : chat}
          >
            <Icon name="chat" />
            {p.status === 'waiting' ? (p.stage === 'research' ? '查看研究' : '去做决定') : '和主理人说话'}
          </button>
        </div>
        <h2 className="col-title col-title-gap">接下来</h2>
        <p className="next-text">{next}</p>
        <h2 className="col-title col-title-gap">项目</h2>
        <p className="project-name">{p.title}</p>
        <p className="project-brief">{p.brief}</p>
        <dl className="stats">
          <div>
            <dt>阶段</dt>
            <dd>{done.length} / 7</dd>
          </div>
          <div>
            <dt>交付物</dt>
            <dd>{p.artifacts.length}</dd>
          </div>
        </dl>
      </section>
      <section className="col">
        <h2 className="col-title">任务</h2>
        {pending.slice(0, 4).map((s) => (
          <button
            key={s.id}
            className={'task ' + (p.stage === s.id ? 'is-active' : '')}
            onClick={() => open(s.id)}
          >
            <span className="task-title">{s.name}</span>
            <span className="task-detail">{s.summary}</span>
            <span className="task-foot">
              <span className="chip">{s.id === 'brief' ? '主理人' : s.name + '负责人'}</span>
              <span className="task-state">{stageLabel(p, s.id)}</span>
            </span>
          </button>
        ))}
        {pending.length > 4 && <p className="more">+ 还有 {pending.length - 4} 个待处理任务</p>}
        {!!revisions.length && (
          <>
            <h3 className="sub-title">修订请求</h3>
            {revisions.map((r, i) => (
              <div className="task is-revision" key={i}>
                <span className="task-detail is-full">{r.text}</span>
                <span className="task-foot">
                  <span className="chip">你的意见</span>
                  <span className="task-state">已记录</span>
                </span>
              </div>
            ))}
          </>
        )}
        {done.length > 0 && (
          <>
            <button
              className="done-toggle"
              aria-expanded={show ?? !pending.length}
              onClick={() => setShow(!(show ?? !pending.length))}
            >
              已完成 {done.length} 项 {(show ?? !pending.length) ? '▴' : '▾'}
            </button>
            {(show ?? !pending.length) && (
              <ul className="done-list">
                {done.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => open(s.id)}>✓ {s.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <section className="col">
        <h2 className="col-title">提案阶段</h2>
        <ol className="stages">
          {STAGES.map((s) => (
            <li key={s.id} className={'stage is-' + phase(p, s.id)}>
              <button className="stage-head" onClick={() => open(s.id)}>
                <span className="stage-no">{s.index}</span>
                <span className="stage-name">{s.name}</span>
                <span className="stage-status">{stageLabel(p, s.id)}</span>
              </button>
              {!p.artifacts.some((a) => a.stage === s.id) && phase(p, s.id) !== 'done' && (
                <p className="stage-summary">{s.summary}</p>
              )}
              {p.artifacts
                .filter((f) => f.stage === s.id && !(f.stage === 'research' && f.kind === 'image'))
                .map((f) => (
                  <button key={f.url} className="stage-item" onClick={() => open(s.id, f.name)}>
                    {documentTitle(p, f)}
                  </button>
                ))}
            </li>
          ))}
        </ol>
      </section>
      <section className="col">
        <h2 className="col-title">文档</h2>
        {!docs.length && <p className="empty">研究报告、策略和文案会随着工作推进出现在这里。</p>}
        <ul className="docs">
          {docs.map((d) => (
            <li key={d.url}>
              <button onClick={() => open(d.stage, d.name)}>
                <Icon name="doc" className="doc-ico" />
                <span className="doc-text">
                  <span className="doc-title">{documentTitle(p, d)}</span>
                  <span className="doc-blurb">{STAGE_BY_ID[d.stage].summary}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <h2 className="col-title col-title-gap">视觉</h2>
        {!images.length && <p className="empty">生成的视觉稿会出现在这里。</p>}
        <div className="thumbs">
          {images.map((f) => (
            <button key={f.url} className="thumb is-tall appear" onClick={() => open(f.stage, f.name)}>
              <img loading="lazy" src={safeURL(f.url)} alt={visualCaption(p, f)} />
              <span>{visualCaption(p, f)} · 概念稿</span>
            </button>
          ))}
        </div>
        <h2 className="col-title col-title-gap">提案预览</h2>
        {preview && (
          <DeckPreview
            file={preview}
            open={() => open(p.status === 'done' ? 'final' : 'layout', preview.name)}
          />
        )}
        {!decks.length && <p className="empty">版式完成后，可在这里下载可编辑的 PPTX。</p>}
        {decks.map((f) => (
          <a className="btn lib-entry" key={f.url} href={safeURL(f.url)} download={f.name}>
            下载可编辑 PPTX ↓
          </a>
        ))}
        <h2 className="col-title col-title-gap">过往资料</h2>
        {p.attachments?.length ? (
          <ul className="linked">
            {p.attachments.map((f) => (
              <li key={f.url}>
                <a className="linked-open" href={safeURL(f.url)} download={f.name}>
                  <span className="doc-title">{f.name}</span>
                  <span className="doc-blurb">项目附件 · 下载原件</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">这个项目没有附带参考资料。</p>
        )}
        <button className="btn lib-entry" onClick={library}>
          <Icon name="library" />
          打开比稿资料库
        </button>
      </section>
    </div>
  );
}
