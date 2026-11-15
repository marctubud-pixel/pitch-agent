import { useRef, useState } from 'react';
import type { Mode } from '../types';
import { ACCEPT, fileIssue, type Summary } from '../live';
import { AttachButton, AttachmentChips } from './Attachments';
import { EXAMPLE_BRIEF } from '../data/project';
import { BotFigure } from './Bot';
import { Icon } from './Icon';

/** A. 起始页：一个大输入框 + 上传 Brief（模拟） */
export function StartScreen({
  initialBrief,
  initialFiles,
  projects,
  onSubmit,
}: {
  initialBrief: string;
  initialFiles: File[];
  projects: Summary[];
  onSubmit: (brief: string, files: File[]) => void;
}) {
  const [brief, setBrief] = useState(initialBrief);
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const add = (items: File[]) => {
    setFiles((prev) => [...prev, ...items]);
    setError('');
  };
  const submit = () => {
    const issue = fileIssue(files);
    if (issue) {
      setError(issue);
      return;
    }
    if (!brief.trim() && !files.length) {
      setError('先写下项目需求，或上传一份 Brief。');
      return;
    }
    onSubmit(brief.trim() || '请根据随附的 Brief 制作提案。', files);
  };
  return (
    <main className="entry">
      <div className="entry-box">
        <p className="eyebrow">交给主理人 · 它在你睡觉时继续做</p>
        <h1 className="entry-title">这次要提什么案？</h1>
        <label className="sr-only" htmlFor="brief-input">
          项目需求
        </label>
        <textarea
          id="brief-input"
          className="entry-input"
          placeholder={EXAMPLE_BRIEF}
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            setError('');
          }}
          rows={6}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="entry-tools">
          <input
            ref={file}
            id="brief-file"
            type="file"
            className="sr-only"
            accept={ACCEPT}
            multiple
            onChange={(e) => {
              add(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            <Icon name="upload" />
            上传 Brief
          </button>
          <AttachButton projects={projects} inputId="start-refs" label="参考资料" drop="down" onAdd={add} />
          <button type="button" className="link-btn" onClick={() => setBrief(EXAMPLE_BRIEF)}>
            填入示例
          </button>
        </div>
        <AttachmentChips items={files} remove={(i) => setFiles((fs) => fs.filter((_, n) => n !== i))} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-dark btn-xl" onClick={submit}>
          继续 →
        </button>
        <p className="entry-foot">下一步选择合作方式。点击开始后，才会调用这台电脑已登录的 Codex。</p>
      </div>
    </main>
  );
}

const MODES: { id: Mode; en: string; name: string; lead: string; points: string[]; cta: string }[] = [
  {
    id: 'auto',
    en: 'SURPRISE ME',
    name: '全自动模式',
    lead: '交代完就可以去睡。主理人从研究一路做到终审，在视觉稿交给排版时等你确认。',
    points: [
      '保留三个创意方向，分别生成视觉稿',
      '全部完成后在对话里通知你',
      '完成后可以提意见、要求修改',
      '原始资料在开始前随需求提交',
    ],
    cta: '全自动开始',
  },
  {
    id: 'collab',
    en: 'IDEA',
    name: '协作模式',
    lead: '常规工作它自己推进，到了该由人拿主意的地方会停下来问你。',
    points: [
      '主理人先根据需求拟定创意方向',
      '由你从备选方向中选定一个',
      '你决定之后它继续往下做',
      '视觉稿完成后由你决定是否采用',
    ],
    cta: '协作开始',
  },
];

/** B. 选择工作方式 */
export function ModeScreen({
  brief,
  fileName,
  attachments,
  busy,
  onBack,
  onStart,
}: {
  brief: string;
  fileName: string | null;
  attachments: File[];
  busy: boolean;
  onBack: () => void;
  onStart: (m: Mode) => void;
}) {
  return (
    <main className="entry">
      <div className="mode-box">
        <button type="button" className="back-link" onClick={onBack}>
          ← 返回修改需求
        </button>
        <h1 className="entry-title">想怎么合作？</h1>
        <div className="mode-brief">
          <BotFigure state="idle" size={56} />
          <p>
            <span className="mono-label">你的需求</span>
            {brief}
            {fileName && <span className="mode-file">Brief 文件：{fileName}</span>}
            {attachments.length > 0 && (
              <span className="mode-file">
                参考资料 {attachments.length} 份：{attachments.map((a) => a.name).join('、')}
              </span>
            )}
          </p>
        </div>
        <div className="mode-grid">
          {MODES.map((m) => (
            <section className="mode-col" key={m.id}>
              <p className="mono-label">{m.en}</p>
              <h2>{m.name}</h2>
              <p className="mode-lead">{m.lead}</p>
              <ul>
                {m.points.map((pt) => (
                  <li key={pt}>{pt}</li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-dark btn-xl"
                disabled={busy}
                onClick={() => onStart(m.id)}
              >
                {m.cta} →
              </button>
            </section>
          ))}
        </div>
        <p className="entry-foot">
          两种模式共用同一个工作区、主理人、交付物和执行记录。运行开始后不能切换模式。
        </p>
      </div>
    </main>
  );
}
