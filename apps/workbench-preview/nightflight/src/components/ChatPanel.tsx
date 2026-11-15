import { useEffect, useRef, useState } from 'react';
import { clock, fileIssue, projectStatus, type Action, type Project, type Summary } from '../live';
import { BotFigure } from './Bot';
import { AttachButton, AttachmentChips } from './Attachments';
export type Act = (kind: Action, text: string, files?: File[]) => Promise<boolean>;
export function Decisions({ p, act, busy }: { p: Project; act: Act; busy: boolean }) {
  if (p.status === 'failed')
    return (
      <div className="msg-body">
        <p>{p.error}</p>
        <button className="btn" disabled={busy} onClick={() => act('retry', '')}>
          重试当前阶段
        </button>
      </div>
    );
  if (p.status !== 'waiting' || p.stage === 'research') return null;
  return (
    <div className="msg-body">
      <p className="msg-flag">需要你决定</p>
      {p.stage === 'visual' ? (
        <>
          <p>请先打开视觉稿。确认采用当前版本后，主理人再开始排版。</p>
          <button
            className="btn btn-dark"
            disabled={busy}
            onClick={() => act('adopt', '采用当前视觉稿做本地排版')}
          >
            采用这版做本地排版
          </button>
        </>
      ) : (
        <div className="options">
          {p.directions.map((d, i) => (
            <div className="option" key={i}>
              <div className="option-text">
                <strong>{d}</strong>
              </div>
              <button className="btn btn-sm" disabled={busy} onClick={() => act('choice', d)}>
                选这个
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function ChatPanel({
  p,
  projects,
  openResearch,
  close,
  act,
  busy,
}: {
  p: Project;
  projects: Summary[];
  openResearch: () => void;
  close: () => void;
  act: Act;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(''),
    scroll = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState('');
  const canAttach = p.mode === 'collab' || p.status !== 'running';
  const rows = [
    ...p.events.map((e) => ({ ...e, user: false })),
    ...(p.feedback || []).map((e) => ({ ...e, user: true })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  useEffect(() => {
    scroll.current?.scrollTo(0, scroll.current.scrollHeight);
  }, [rows.length]);
  const send = async () => {
    const f = canAttach ? files : [];
    const issue = fileIssue(f);
    setError(issue);
    if (
      !issue &&
      !busy &&
      (draft.trim() || f.length) &&
      (await act('message', draft.trim() || '请参考随附的资料。', f))
    ) {
      setDraft('');
      setFiles([]);
    }
  };
  return (
    <aside className="chat" aria-label="与主理人的对话">
      <div className="chat-head">
        <BotFigure state={p.status === 'running' ? 'working' : 'idle'} size={38} />
        <div>
          <strong>主理人</strong>
          <span>{projectStatus(p)}</span>
        </div>
        <button className="chat-close" onClick={close} aria-label="关闭对话">
          ×
        </button>
      </div>
      <div className="chat-scroll" ref={scroll}>
        <p className="chat-note">本项目的执行记录、决定和反馈会保存在这里。</p>
        {rows.map((r, i) => (
          <div key={i} className={'msg from-' + (r.user ? 'user' : 'bot')}>
            <div className="msg-body">
              <p>{r.text}</p>
            </div>
            <span className="time">{clock(r.at)}</span>
          </div>
        ))}
        {p.stage === 'research' && p.status === 'waiting' && (
          <div className="msg-body">
            <p>研究还需要补充依据。</p>
            <button className="btn" onClick={openResearch}>
              查看研究与补查
            </button>
          </div>
        )}
        <Decisions p={p} act={act} busy={busy} />
      </div>
      <div className="composer">
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <AttachmentChips items={files} remove={(i) => setFiles((fs) => fs.filter((_, n) => n !== i))} />
        {(p.status === 'done' || (p.stage === 'visual' && p.status === 'waiting')) && (
          <p className="composer-hint">
            {p.status === 'done'
              ? '发送修改意见会保存当前版本，并从简报重新生成。'
              : '发送修改意见会保存本版并重新生成视觉稿。'}
          </p>
        )}
        <div className="chat-input">
          <AttachButton
            projects={projects}
            disabled={!canAttach || busy}
            disabledHint="全自动运行中不接收新文件"
            inputId="chat-file"
            onAdd={(fs) => setFiles((prev) => [...prev, ...fs])}
          />
          <input
            aria-label="给主理人的消息"
            value={draft}
            placeholder="写下意见或补充说明…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
            }}
          />
          <button
            className="btn"
            disabled={busy || (!draft.trim() && !(canAttach && files.length))}
            onClick={send}
          >
            发送
          </button>
        </div>
      </div>
    </aside>
  );
}
