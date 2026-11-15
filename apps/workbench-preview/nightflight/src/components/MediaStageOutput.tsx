import { useState } from 'react';
import { isDeckPreview, safeURL, type Artifact, type Project } from '../live';
import type { Act } from './ChatPanel';
import { DeckPreview } from './DeckPreview';

type MediaStage = 'visual' | 'layout' | 'final';

export function visualCaption(p: Project, file: Artifact) {
  const ordinal = /^visual-(\d+)-[\da-f]+\.png$/i.exec(file.name);
  return visualRecord(p, file)?.title || (ordinal && p.directions[Number(ordinal[1]) - 1]) || file.name;
}

function visualRecord(p: Project, image: Artifact) {
  for (const report of p.artifacts.filter((a) => a.stage === 'visual' && a.kind === 'text')) {
    for (const section of (report.text || '').split(/^## /m)) {
      const lines = section.trim().split(/\r?\n/);
      const at = lines.findIndex((line) => line.startsWith('图片：' + image.name + '（'));
      if (at > 0) return { title: lines[0], description: lines.slice(1, at).join('\n').trim() };
    }
  }
  return undefined;
}

function VisualOutput({ p }: { p: Project }) {
  const refs = (p.attachments || []).filter((file) => /\.(png|jpe?g)$/i.test(file.name));
  const images = p.artifacts.filter((file) => file.stage === 'visual' && file.kind === 'image');
  const report = p.artifacts.find((file) => file.stage === 'visual' && file.kind === 'text');
  return (
    <>
      {refs.length > 0 && (
        <section className="block">
          <h2>视觉参考</h2>
          <div className="ref-row">
            <div className="ref-head">
              <h3>项目参考图</h3>
            </div>
            {refs.map((ref) => (
              <a href={safeURL(ref.url)} key={ref.url} download={ref.name}>
                <img className="ref-art media-reference" src={safeURL(ref.url)} alt={ref.name} />
                <span className="hint">{ref.name}</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <section className="block" data-artifact={report?.name}>
        <h2>草图与主视觉</h2>
        {images.length ? (
          <div className="kv-row media-concepts">
            {images.map((image) => {
              const record = visualRecord(p, image);
              const caption = record?.title || visualCaption(p, image);
              return (
                <figure key={image.url} data-artifact={image.name}>
                  <a href={safeURL(image.url)} target="_blank" rel="noopener noreferrer">
                    <img
                      loading="lazy"
                      src={safeURL(image.url)}
                      alt={caption + ' · 视觉概念稿'}
                    />
                  </a>
                  <figcaption>{caption} · 视觉概念稿</figcaption>
                  {record?.description && (
                    <details className="research-original">
                      <summary>图稿说明</summary>
                      <p>{record.description}</p>
                    </details>
                  )}
                </figure>
              );
            })}
          </div>
        ) : (
          <p className="pending">草图与主视觉稿尚未交回。</p>
        )}
      </section>
    </>
  );
}

function Feedback({ p, act, busy }: { p: Project; act: Act; busy: boolean }) {
  const [text, setText] = useState('');
  const revisions = (p.feedback || []).filter((item) => 'stage' in item && item.stage === 'final');
  return (
    <section className="block">
      <h2>你的反馈</h2>
      <form
        className="feedback"
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim() && (await act('message', text.trim()))) setText('');
        }}
      >
        <label className="sr-only" htmlFor="final-feedback">
          修改意见
        </label>
        <textarea
          id="final-feedback"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="写下页码和修改意见"
        />
        <button className="btn btn-dark" disabled={!text.trim() || busy}>
          发给主理人
        </button>
      </form>
      <p className="hint">发送后保存本版提案，并从简报开始生成修订版。</p>
      {!!revisions.length && (
        <ul className="plain-list">
          {revisions.map((r, i) => (
            <li key={i}>{r.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MediaStageOutput({
  p,
  id,
  act,
  busy,
}: {
  p: Project;
  id: MediaStage;
  act: Act;
  busy: boolean;
}) {
  if (id === 'visual') return <VisualOutput p={p} />;
  const deck = p.artifacts.find(isDeckPreview);
  const pptx = p.artifacts.filter((file) => file.stage === 'layout' && file.kind === 'pptx');
  const reviews = p.artifacts.filter((file) => file.stage === 'final' && file.kind === 'text');
  return (
    <>
      <section className="block" data-artifact={deck?.name}>
        <h2>{id === 'layout' ? '提案预览' : p.status === 'done' ? '终稿提案' : '待审提案'}</h2>
        {deck ? <DeckPreview file={deck} /> : <p className="pending">尚无排版预览。</p>}
        {!!pptx.length && (
          <div className="deliver">
            {pptx.map((file) => (
              <a
                key={file.url}
                data-artifact={file.name}
                className="btn btn-dark"
                href={safeURL(file.url)}
                download={file.name}
              >
                下载可编辑 PPTX
              </a>
            ))}
          </div>
        )}
      </section>
      {id === 'final' && (
        <>
          <section className="block">
            <h2>终审记录</h2>
            {!!reviews.length && (
              <p className="demo-banner">本地终审演练记录，正式业务签收由人类比稿负责人确认。</p>
            )}
            {reviews.length ? (
              reviews.map((review) => <ReviewRecord key={review.url} file={review} />)
            ) : (
              <p className="pending">尚无本版终审记录。</p>
            )}
          </section>
          {p.status === 'done' && <Feedback p={p} act={act} busy={busy} />}
        </>
      )}
    </>
  );
}

function inlineText(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : part.startsWith('`') && part.endsWith('`') ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

function ReviewRecord({ file }: { file: Artifact }) {
  const text = file.text?.replace(/^# [^\n]*\n/, '').trim();
  if (!text)
    return (
      <a data-artifact={file.name} href={safeURL(file.url)} download={file.name}>
        查看审读原件
      </a>
    );
  return (
    <div data-artifact={file.name} className="media-review">
      {text.split(/\n\s*\n/).map((paragraph, i) => {
        const lines = paragraph.split(/\r?\n/);
        const cells = (line: string) =>
          line
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((cell) => cell.trim());
        if (
          lines.length > 1 &&
          lines[0].startsWith('|') &&
          cells(lines[1]).every((cell) => /^:?-+:?$/.test(cell))
        ) {
          const headers = cells(lines[0]);
          return (
            <div key={i} className="media-table-scroll">
              <table>
                <thead>
                  <tr>
                    {headers.map((h, j) => (
                      <th key={j}>{inlineText(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.slice(2).map((row, k) => (
                    <tr key={k}>
                      {cells(row).map((cell, j) => (
                        <td key={j}>{inlineText(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <ul className="review" key={i}>
            <li>
              <span className="review-mark">审读记录</span>
              <div>
                {lines.map((line, j) =>
                  /^#{1,6} /.test(line) ? (
                    <h3 key={j}>{inlineText(line.replace(/^#{1,6} /, ''))}</h3>
                  ) : (
                    <p key={j}>{inlineText(line)}</p>
                  ),
                )}
              </div>
            </li>
          </ul>
        );
      })}
    </div>
  );
}
