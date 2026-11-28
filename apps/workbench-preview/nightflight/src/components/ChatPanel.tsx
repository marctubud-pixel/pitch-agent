import { useEffect, useRef, useState } from 'react';
import {
  briefNeedsClarification,
  fileIssue,
  researchQuestion,
  safeURL,
  visualCandidateStatus,
  type Action,
  type Project,
  type Summary,
} from '../live';
import {
  buildExecutionStreams,
  deriveBotStatus,
  deriveChatMessages,
  headlineFromSections,
  publishedSlogan,
  sectionsOf,
} from './stageText';
import { STAGES } from '../data/project';
import type { StageId } from '../types';
import { BotFigure } from './Bot';
import { AttachButton, AttachmentChips } from './Attachments';

export type Act = (
  kind: Action,
  text: string,
  files?: File[],
  options?: {
    targetStage?: StageId;
    candidateIds?: string[];
    overrideReason?: string;
    draftOnly?: boolean;
    materialsOnly?: boolean;
  },
) => Promise<boolean>;

function AdoptVisual({ p, act, busy }: { p: Project; act: Act; busy: boolean }) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const groups = p.mode === 'collab' && p.choice ? [p.choice] : p.directions;
  const candidates = p.artifacts.filter((a) => a.stage === 'visual' && a.visual?.candidate);
  const selected = groups.map((direction) => {
    const batch = candidates.filter((a) => a.visual?.direction === direction);
    return batch.find((a) => a.url === picks[direction]) ?? batch.find((a) => a.visual?.recommended);
  });
  const override = selected.some((a) => a && !a.visual?.recommended);
  const canAdopt =
    !busy && (!candidates.length || selected.every(Boolean)) && (!override || Boolean(reason.trim()));
  function adopt(kind: 'draft' | 'materials' | 'layout') {
    return act(
      'adopt',
      {
        draft: '采用当前视觉稿并写逐页稿',
        materials: '采用当前视觉稿并整理编稿材料包',
        layout: '采用当前视觉稿做本地排版',
      }[kind],
      undefined,
      {
        ...(kind !== 'layout' ? { draftOnly: true } : {}),
        ...(kind === 'materials' ? { materialsOnly: true } : {}),
        ...(candidates.length
          ? {
              candidateIds: selected.map((a) => a!.url.split('/').at(-1)!),
              overrideReason: reason.trim(),
            }
          : {}),
      },
    );
  }
  return (
    <div className="adoption-fields">
      {candidates.length > 0 &&
        groups.map((direction, i) => {
          const slogan = publishedSlogan(p, direction);
          const letter = String.fromCharCode(65 + p.directions.indexOf(direction));
          const label = slogan ? '方向 ' + letter + ' · ' + slogan : direction;
          return (
            <label key={direction}>
              {label}
              <select
                aria-label={label + '的采用稿'}
                value={selected[i]?.url ?? ''}
                onChange={(e) => setPicks({ ...picks, [direction]: e.target.value })}
              >
                <option disabled value="">
                  选择采用稿
                </option>
                {candidates
                  .filter((a) => a.visual?.direction === direction)
                  .map((a) => {
                    const status = visualCandidateStatus(a.visual);
                    return (
                      <option key={a.url} value={a.url}>
                        第 {a.visual?.candidate} 稿{status ? ' · ' + status : ''}
                      </option>
                    );
                  })}
              </select>
            </label>
          );
        })}
      {override && (
        <label>
          采用理由
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="说明选这张稿的原因"
          />
        </label>
      )}
      {p.canWriteManuscript && (
        <button className="btn btn-dark" disabled={!canAdopt} onClick={() => adopt('draft')}>
          采用并写逐页稿
        </button>
      )}
      {p.canWriteManuscript && (
        <button className="btn" disabled={!canAdopt} onClick={() => adopt('materials')}>
          采用并整理材料包
        </button>
      )}
      <button
        className={p.canWriteManuscript ? 'btn' : 'btn btn-dark'}
        disabled={!canAdopt}
        onClick={() => adopt('layout')}
      >
        采用所选稿并排版
      </button>
    </div>
  );
}

export function RevisionStage({
  value,
  change,
}: {
  value: StageId;
  change: (stage: StageId) => void;
}) {
  return (
    <label className="revision-field">
      从哪一步修改{' '}
      <select value={value} onChange={(event) => change(event.target.value as StageId)}>
        {STAGES.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Decisions({ p, act, busy }: { p: Project; act: Act; busy: boolean }) {
  if (briefNeedsClarification(p)) return null;
  if (p.status === 'failed' || (p.status === 'waiting' && p.finalReturn))
    return (
      <div className="msg kind-error appear">
        <div className="msg-body">
          <p className="msg-flag">执行中断</p>
          <p>{p.finalReturn?.reason || p.error}</p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn" disabled={busy} onClick={() => act('retry', '')}>
              重试当前阶段
            </button>
          </div>
        </div>
      </div>
    );
  if (p.status !== 'waiting' || p.stage === 'research') return null;
  if (p.stage === 'final')
    return (
      <div className="msg kind-done appear">
        <div className="msg-body">{p.finalReview?.reason || '在终审与交付查看本版。'}</div>
      </div>
    );
  if (p.stage === 'layout' && p.layoutDraftOnly)
    return (
      <div className="msg kind-decision appear">
        <div className="msg-body">
          {p.layoutMaterialsOnly ? '编稿材料包已保存，打开版式下载。' : '逐页稿已保存，打开版式查看。'}
        </div>
      </div>
    );
  if (p.stage === 'brief')
    return (
      <div className="msg kind-decision appear">
        <div className="msg-body">
          <p className="msg-flag">需要你确认</p>
          <p>任务卡已整理完毕，确认后主理人开始研究阶段。</p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-dark"
              disabled={busy}
              onClick={() => act('confirm_brief', '')}
            >
              确认任务卡，开始研究
            </button>
          </div>
        </div>
      </div>
    );

  const copyText =
    p.stage === 'copy'
      ? sectionsOf(
          p.artifacts
            .filter((a) => a.stage === 'copy' && a.kind === 'text')
            .map((a) => a.text)
            .filter(Boolean)
            .join('\n\n'),
        )
      : [];
  const recDirId =
    p.copyReview?.status === 'ready' ? p.copyReview.recommendation?.directionId : undefined;
  const reviewDirs = p.copyReview?.status === 'ready' ? p.copyReview.draft.directions : [];

  return (
    <div className="msg kind-decision appear">
      <div className="msg-body">
        <p className="msg-flag">需要你决定</p>
        {p.stage === 'visual' ? (
          <AdoptVisual key={p.id + '-' + p.revision} p={p} act={act} busy={busy} />
        ) : (
          <div className="options">
            {p.directions.map((d, i) => {
              const letter = String.fromCharCode(65 + i);
              const meta = reviewDirs.find((entry) => entry.name === d);
              const isRec = Boolean(recDirId && meta?.id === recDirId);
              const isPicked = p.choice === d;
              const slogan =
                p.stage === 'copy'
                  ? publishedSlogan(p, d) || headlineFromSections(copyText, d, i) || d
                  : d;
              const refImg = p.artifacts.find(
                (a) => a.stage === 'visual' && a.visual?.direction === d && a.kind === 'image',
              );
              const refSrc = refImg ? safeURL(refImg.url) : undefined;
              return (
                <div
                  className={
                    'option' +
                    (refSrc ? '' : ' copy-choice') +
                    (isPicked ? ' is-picked' : p.choice ? ' is-dim' : '')
                  }
                  key={d}
                >
                  {refSrc && <img className="option-art" src={refSrc} alt={slogan} />}
                  <div className="option-text">
                    <strong>
                      {letter}　{slogan}
                      {isRec && <em>主理人建议</em>}
                    </strong>
                    {meta?.secondary && <span>{meta.secondary}</span>}
                    {meta?.claim && <span className="option-fit">{meta.claim}</span>}
                  </div>
                  {isPicked ? (
                    <span className="option-picked">已选定</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy || Boolean(p.choice)}
                      onClick={() => act('choice', d)}
                    >
                      选这个
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({
  p,
  projects,
  openResearch,
  openStage,
  close,
  act,
  busy,
  composerRef,
}: {
  p: Project;
  projects: Summary[];
  openResearch: () => void;
  openStage?: (stage: StageId, name?: string) => void;
  close: () => void;
  composerRef: React.RefObject<HTMLInputElement | null>;
  act: Act;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(''),
    scroll = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState('');
  const [targetStage, setTargetStage] = useState<StageId>('layout');
  const canAttach = p.status !== 'running';

  const { primary } = buildExecutionStreams(p);
  const bot = deriveBotStatus(p, primary);
  const messages = deriveChatMessages(p);
  const openLink = (stage: StageId, name?: string) => {
    if (openStage) openStage(stage, name);
    else if (stage === 'research') openResearch();
  };

  useEffect(() => {
    scroll.current?.scrollTo(0, scroll.current.scrollHeight);
  }, [messages.length, p.status, p.stage]);

  const send = async () => {
    const f = canAttach ? files : [];
    const issue = fileIssue(f);
    setError(issue);
    if (
      !issue &&
      canAttach &&
      !busy &&
      (draft.trim() || f.length) &&
      (await act(
        'message',
        draft.trim() || '请参考随附的资料。',
        f,
        p.status === 'done' ? { targetStage } : undefined,
      ))
    ) {
      setDraft('');
      setFiles([]);
    }
  };

  return (
    <aside className="chat" aria-label="与主理人的对话">
      <div className="chat-head">
        <BotFigure state={bot.state} size={36} />
        <div>
          <strong>主理人</strong>
          <span>{bot.label}</span>
        </div>
        <button type="button" className="chat-close" onClick={close} aria-label="关闭对话">
          ×
        </button>
      </div>
      <div className="chat-scroll" ref={scroll}>
        <p className="chat-note">主理人只在这里汇报关键进度、决策与交付；细项过程见上方黑屏。</p>
        {messages.map((m) => (
          <div key={m.id} className={`msg from-${m.from} kind-${m.kind} appear`}>
            <div className="msg-body">
              {m.kind === 'error' && <p className="msg-flag">执行中断</p>}
              {m.kind === 'decision' && <p className="msg-flag">需要你决定</p>}
              {m.kind === 'done' && <p className="msg-flag">提案已完成</p>}
              <p>{m.text}</p>
              {!!m.links?.length && (
                <div className="msg-links">
                  {m.links.map((link) => (
                    <button
                      type="button"
                      key={link.stage + '-' + link.label}
                      className="link-btn"
                      onClick={() => openLink(link.stage, link.name)}
                    >
                      {m.kind === 'decision' ? '细看：' : '打开：'}
                      {link.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {m.at && <span className="time">{m.at}</span>}
          </div>
        ))}
        {p.stage === 'research' && p.status === 'waiting' && (
          <div className="msg kind-decision appear">
            <div className="msg-body">
              <p className="msg-flag">需要你确认</p>
              <p>
                {p.research?.digestPending
                  ? '研究底稿已保存，摘要待核对。'
                  : p.research?.ready
                    ? '研究已完成，可以查看结论后进入策略。'
                    : researchQuestion(p)
                      ? '研究有一项影响方向的问题需要你判断。'
                      : p.canRequestStrategy
                        ? '已有研究可进入策略，也可以先补查。'
                        : '研究还需要补充依据。'}
              </p>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button type="button" className="btn" onClick={openResearch}>
                  {p.research?.ready ? '查看研究结果' : '查看研究与补查'}
                </button>
              </div>
            </div>
          </div>
        )}
        <Decisions
          p={p}
          busy={busy}
          act={async (kind, text, _unused, options) => {
            if (kind !== 'adopt') return act(kind, text);
            const issue = fileIssue(files);
            if (issue) {
              setError(issue);
              return false;
            }
            const ok = await act(kind, text, files, options);
            if (ok) setFiles([]);
            return ok;
          }}
        />
      </div>
      <div className="composer">
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <AttachmentChips items={files} remove={(i) => setFiles((fs) => fs.filter((_, n) => n !== i))} />
        {p.status === 'done' && <RevisionStage value={targetStage} change={setTargetStage} />}
        {(p.status === 'done' || (p.stage === 'visual' && p.status === 'waiting')) && (
          <p className="composer-hint">
            {p.status === 'done'
              ? '提交后会保留当前版本，从所选阶段修改。'
              : '点「采用所选稿并排版」可一并提交排版材料。发送修改意见会重新生成视觉稿。'}
          </p>
        )}
        <div className="chat-input">
          <AttachButton
            projects={projects}
            disabled={!canAttach || busy}
            disabledHint="当前阶段运行中，完成后可补充材料"
            inputId="chat-file"
            onAdd={(fs) => setFiles((prev) => [...prev, ...fs])}
          />
          <input
            ref={composerRef}
            aria-label="给主理人的消息"
            value={draft}
            placeholder={
              briefNeedsClarification(p)
                ? '补充你希望获得的提案…'
                : p.status === 'done'
                  ? '哪里要改？告诉主理人…'
                  : canAttach
                    ? '写下意见或补充说明…'
                    : '当前阶段运行中，完成后可提交意见'
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={!canAttach || busy || (!draft.trim() && !(canAttach && files.length))}
            onClick={send}
          >
            发送
          </button>
        </div>
      </div>
    </aside>
  );
}
