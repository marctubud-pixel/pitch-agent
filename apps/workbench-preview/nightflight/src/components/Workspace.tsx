import { useState } from 'react';
import type { ExecutionEvent, StageId } from '../types';
import { STAGES, STAGE_BY_ID } from '../data/project';
import { visualCaption } from './MediaStageOutput';
import { DeckPreview } from './DeckPreview';
import {
  buildExecutionStreams,
  deriveBotStatus,
  deriveWorkspaceTasks,
  isPrimaryReadableDoc,
  stageDocumentBlurb,
  stageDocumentTitle,
} from './stageText';
import {
  clock,
  isDeckPreview,
  phase,
  safeURL,
  stageLabel,
  researchQuestion,
  type Project,
  type Artifact,
} from '../live';
import { BotCard } from './Bot';
import { Icon } from './Icon';

interface StageDeliverableEntry {
  key: string;
  label: string;
  stage: StageId;
  name?: string;
  at?: string;
}

function stageDeliverables(p: Project, stageId: StageId): StageDeliverableEntry[] {
  const stageTime = (s: StageId) => {
    const hit = (p.events || []).findLast((e) => e.stage === s);
    return hit ? clock(hit.at) : undefined;
  };
  if (stageId === 'visual') {
    const refs = p.artifacts.filter((a) => a.stage === 'visual' && a.visual?.role === 'reference');
    const mains = p.artifacts.filter(
      (a) => a.stage === 'visual' && a.kind === 'image' && a.visual?.role !== 'reference' && a.visual?.role !== 'comparison',
    );
    const items: StageDeliverableEntry[] = [];
    if (refs.length) {
      items.push({
        key: 'vis-refs',
        label: `视觉参考（${refs.length} 张）`,
        stage: 'visual',
        name: refs[0].name,
        at: stageTime('visual'),
      });
    }
    if (mains.length) {
      const winner = mains.find((a) => a.visual?.recommended) || mains[0];
      items.push({
        key: 'vis-mains',
        label: `主视觉稿（${mains.length} 张）`,
        stage: 'visual',
        name: winner.name,
        at: stageTime('visual'),
      });
    }
    return items;
  }

  const files = p.artifacts.filter(
    (f) => f.stage === stageId && !(f.stage === 'research' && f.kind === 'image'),
  );
  if (!files.length) return [];

  const hasLayoutDraft =
    stageId === 'layout' &&
    files.some((f) => f.kind === 'text' && f.name.startsWith('逐页稿') && !f.name.endsWith('.json'));
  const seen = new Set<string>();
  const entries: StageDeliverableEntry[] = [];
  for (const f of files) {
    if (f.kind === 'image') continue;
    if (f.kind === 'text' && f.name.endsWith('.json') && !isDeckPreview(f)) continue;
    if (stageId === 'layout' && f.name.startsWith('逐页材料包') && hasLayoutDraft) continue;
    const label = stageDocumentTitle(f);
    if (seen.has(label)) continue;
    seen.add(label);
    entries.push({
      key: f.url,
      label,
      stage: stageId,
      name: f.name,
      at: stageTime(stageId),
    });
  }
  return entries;
}

function pickWorkspaceVisuals(p: Project): {
  mains: { file: Artifact; label: string }[];
  refs: { file: Artifact; label: string }[];
} {
  const allMains = p.artifacts.filter(
    (a) =>
      a.kind === 'image' &&
      a.stage === 'visual' &&
      a.visual?.role !== 'comparison' &&
      a.visual?.role !== 'reference',
  );
  const allRefs = p.artifacts.filter((a) => a.stage === 'visual' && a.visual?.role === 'reference');
  const dirs = p.directions.length
    ? p.directions
    : [...new Set(allMains.map((a) => a.visual?.direction).filter((d): d is string => Boolean(d)))];

  const mains: { file: Artifact; label: string }[] = [];
  const refs: { file: Artifact; label: string }[] = [];
  dirs.slice(0, 3).forEach((dir, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const group = allMains.filter((a) => a.visual?.direction === dir);
    const pickMain = group.find((a) => a.visual?.recommended) || group[0];
    if (pickMain) mains.push({ file: pickMain, label: `主视觉 ${letter}` });
    const pickRef = allRefs.find((a) => a.visual?.direction === dir);
    if (pickRef) refs.push({ file: pickRef, label: `参考 ${letter}` });
  });

  if (!mains.length && allMains.length) {
    allMains.slice(0, 3).forEach((file, idx) => {
      mains.push({ file, label: `主视觉 ${idx + 1}` });
    });
  }
  return { mains, refs };
}

export function Workspace({
  p,
  primaryEvents,
  open,
  log,
  chat,
  library,
  celebrate,
}: {
  p: Project;
  primaryEvents?: ExecutionEvent[];
  open: (s: StageId, name?: string) => void;
  log: () => void;
  chat: () => void;
  library: () => void;
  celebrate: () => void;
}) {
  const [showDone, setShowDone] = useState<boolean | null>(null);
  const events = primaryEvents ?? buildExecutionStreams(p).primary;
  const bot = deriveBotStatus(p, events);
  const tasks = deriveWorkspaceTasks(p, events);
  const activeTasks = tasks.filter(
    (t) => t.status === 'active' || t.status === 'waiting' || t.status === 'failed',
  );
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const doneTasks = tasks.filter((t) => t.status === 'done');

  const doneStages = STAGES.filter((s) => phase(p, s.id) === 'done');
  const latestBusiness = events.at(-1)?.text;
  const hasLayoutDraft = p.artifacts.some(
    (a) => a.stage === 'layout' && a.kind === 'text' && a.name.startsWith('逐页稿') && !a.name.endsWith('.json'),
  );
  const docs: Artifact[] = [];
  const seenDocKey = new Set<string>();
  for (const a of [...p.artifacts].reverse()) {
    if (!isPrimaryReadableDoc(a, hasLayoutDraft)) continue;
    const key = `${a.stage}:${stageDocumentTitle(a)}`;
    if (seenDocKey.has(key)) continue;
    seenDocKey.add(key);
    docs.push(a);
  }
  const decks = p.artifacts.filter((a) => a.kind === 'pptx');
  const preview = p.artifacts.find(isDeckPreview);
  const { mains: visualMains, refs: visualRefs } = pickWorkspaceVisuals(p);
  const stageEntriesCount = STAGES.reduce((sum, s) => sum + stageDeliverables(p, s.id).length, 0);

  const researchPaused =
    p.stage === 'research' &&
    p.status === 'waiting' &&
    !p.research?.ready &&
    !p.canRequestStrategy &&
    !researchQuestion(p);
  const revisions = (p.feedback || []).filter(
    (item) => 'stage' in item && (item.stage === 'visual' || item.stage === 'final'),
  );

  const activeStage = STAGES.find((s) => phase(p, s.id) === 'active');
  const nextPendingStage = STAGES.find((s) => phase(p, s.id) === 'pending');
  const next =
    p.status === 'failed'
      ? '查看中断原因，补充信息或点击重试继续。'
      : p.status === 'waiting'
        ? p.stage === 'research'
          ? researchQuestion(p)
            ? '查看研究发现，回答影响方向的问题。'
            : p.research?.digestPending
              ? '打开研究，核对摘要后进入策略。'
              : p.research?.ready
                ? '查看研究结论，确认后进入策略。'
                : p.canRequestStrategy
                  ? '查看已核结论，可带着缺口进入策略。'
                  : '查看研究缺口，补查后再交给策略。'
          : p.stage === 'visual'
            ? '打开视觉稿，选定各方向采用稿进入排版。'
            : p.stage === 'layout' && p.layoutDraftOnly
              ? p.layoutMaterialsOnly
                ? '打开版式，下载本版编稿材料包。'
                : '打开版式，查看逐页稿并生成 PPTX。'
              : '在右侧对话里查看备选方向，选定后继续。'
        : p.status === 'done'
          ? '打开终稿看一遍，有要改的直接在右侧对话里说。'
          : activeStage && nextPendingStage
            ? `「${activeStage.name}」完成后，进入「${nextPendingStage.name}」。`
            : activeStage
              ? `「${activeStage.name}」完成后，整份提案交付。`
              : STAGE_BY_ID[p.stage].summary;

  const showDoneList = showDone ?? (activeTasks.length === 0 && pendingTasks.length === 0);

  return (
    <div className="ws-grid">
      <section className="col">
        <h2 className="col-title">主理人</h2>
        <BotCard bot={bot} onPoke={p.status === 'done' ? celebrate : undefined} />
        <p className="mode-line">
          <span>{p.mode === 'auto' ? '全自动 · SURPRISE ME' : '协作 · IDEA'}</span>
          <span className="mute">
            {p.status === 'done'
              ? '本次运行已结束'
              : p.status === 'failed'
                ? '中断待处理'
                : '运行中不可切换'}
          </span>
        </p>
        <div className={'now-box ' + (p.status === 'failed' ? 'is-blocked' : '')}>
          <p>
            {researchPaused
              ? '本轮研究暂停：现有依据不足以交给策略。'
              : p.canRequestStrategy
                ? '已核发现可用于撰写策略，未决问题随稿保留。'
                : p.status === 'failed'
                  ? '执行在「' + STAGE_BY_ID[p.stage].name + '」中断。'
                  : latestBusiness || '准备开始读取你的需求。'}
          </p>
          {p.status === 'failed' && p.error && <p className="now-reason">原因：{p.error}</p>}
          {p.status === 'running' && <span className="block-cursor" aria-hidden="true" />}
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={log}>
            <Icon name="log" />
            执行记录
          </button>
          <button
            type="button"
            className="btn"
            onClick={p.stage === 'research' && p.status === 'waiting' ? () => open('research') : chat}
          >
            <Icon name="chat" />
            {p.status === 'waiting'
              ? p.stage === 'research'
                ? '查看研究'
                : '去做决定'
              : p.status === 'failed'
                ? '查看中断'
                : '和主理人说话'}
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
            <dd>{doneStages.length} / 7</dd>
          </div>
          <div>
            <dt>交付物</dt>
            <dd>{stageEntriesCount || p.artifacts.length}</dd>
          </div>
        </dl>
      </section>

      <section className="col">
        <h2 className="col-title">任务</h2>
        {activeTasks.map((t) => (
          <button
            type="button"
            key={t.id}
            className="task is-active"
            onClick={() => open(t.stageId)}
          >
            <span className="task-title">{t.title}</span>
            <span className="task-detail">{t.detail}</span>
            <span className="task-foot">
              <span className="chip">{t.role}</span>
              <span className="task-state">
                <span className={t.status === 'failed' ? 'dot' : 'dot dot-live'} />
                {t.status === 'failed' ? '已中断' : t.status === 'waiting' ? '等你决定' : '进行中'}
              </span>
            </span>
          </button>
        ))}
        {pendingTasks.slice(0, 3).map((t) => (
          <button type="button" key={t.id} className="task" onClick={() => open(t.stageId)}>
            <span className="task-title">{t.title}</span>
            <span className="task-detail">{t.detail}</span>
            <span className="task-foot">
              <span className="chip">{t.role}</span>
              <span className="task-state">待处理</span>
            </span>
          </button>
        ))}
        {pendingTasks.length > 3 && (
          <p className="more">+ 还有 {pendingTasks.length - 3} 个待处理任务</p>
        )}
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
        {doneTasks.length > 0 && (
          <>
            <button
              type="button"
              className="done-toggle"
              aria-expanded={showDoneList}
              onClick={() => setShowDone(!showDoneList)}
            >
              已完成 {doneTasks.length} 项{' '}
              {activeTasks.length + pendingTasks.length === 0 ? '' : showDoneList ? '▴' : '▾'}
            </button>
            {showDoneList && (
              <ul className="done-list">
                {doneTasks.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => open(t.stageId)}>
                      <span>✓</span>
                      {t.title}
                    </button>
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
          {STAGES.map((s) => {
            const ph = phase(p, s.id);
            const entries = stageDeliverables(p, s.id);
            return (
              <li key={s.id} className={'stage is-' + ph}>
                <button type="button" className="stage-head" onClick={() => open(s.id)}>
                  <span className="stage-no">{s.index}</span>
                  <span className="stage-name">{s.name}</span>
                  <span className="stage-status">
                    {(ph === 'active' || ph === 'waiting') && <span className="dot dot-live" />}
                    {stageLabel(p, s.id)}
                  </span>
                </button>
                {entries.length === 0 && ph !== 'done' && (
                  <p className="stage-summary">{s.summary}</p>
                )}
                {entries.map((entry) => (
                  <button
                    type="button"
                    key={entry.key}
                    className="stage-item"
                    onClick={() => open(entry.stage, entry.name)}
                  >
                    <span>{entry.label}</span>
                    {entry.at && <span className="time">{entry.at}</span>}
                  </button>
                ))}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="col">
        <h2 className="col-title">文档</h2>
        {!docs.length && <p className="empty">研究报告、策略和文案会随着工作推进出现在这里。</p>}
        <ul className="docs">
          {docs.map((d) => {
            const stageHit = (p.events || []).findLast((e) => e.stage === d.stage);
            return (
              <li key={d.url} className="appear">
                <button type="button" onClick={() => open(d.stage, d.name)}>
                  <Icon name="doc" className="doc-ico" />
                  <span className="doc-text">
                    <span className="doc-title">{stageDocumentTitle(d)}</span>
                    <span className="doc-blurb">{stageDocumentBlurb(p, d)}</span>
                  </span>
                  {stageHit && <span className="time">{clock(stageHit.at)}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <h2 className="col-title col-title-gap">视觉</h2>
        {!visualMains.length && !visualRefs.length && (
          <p className="empty">视觉参考和主视觉稿会随着进度出现在这里。</p>
        )}
        <div className="thumbs">
          {visualMains.map(({ file, label }) => (
            <button
              type="button"
              key={file.url}
              className="thumb is-tall appear"
              title={visualCaption(p, file)}
              onClick={() => open('visual', file.name)}
            >
              <img loading="lazy" src={safeURL(file.url)} alt={visualCaption(p, file)} />
              <span>{label}</span>
            </button>
          ))}
          {visualRefs.map(({ file, label }) => (
            <button
              type="button"
              key={file.url}
              className="thumb is-ref appear"
              title={file.visual?.title || label}
              onClick={() => open('visual', file.name)}
            >
              <img loading="lazy" src={safeURL(file.url)} alt={file.visual?.title || label} />
              <span>{label}</span>
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
        {!decks.length && !preview && (
          <p className="empty">版式完成后，可在这里翻看预览并下载可编辑 PPTX。</p>
        )}
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
        <button type="button" className="btn lib-entry" onClick={library}>
          <Icon name="library" />
          打开比稿资料库
        </button>
      </section>
    </div>
  );
}
