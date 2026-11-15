import { VisualReview } from '../../../src/proposal/qingyu-visual/VisualReview';
import { useState } from 'react';
import { isDeckPreview, safeURL, type Artifact, type Project } from '../live';
import type { Act } from './ChatPanel';
import { VisualImageGallery, type GalleryDirection } from '../../../src/proposal/qingyu-visual/VisualImageGallery';
import { DeckPreview } from './DeckPreview';

type MediaStage = 'visual' | 'layout' | 'final';

export function visualCaption(p: Project, file: Artifact) {
  const ordinal = /^visual-(\d+)-[\da-f]+\.png$/i.exec(file.name);
  return file.visual?.direction || visualRecord(p, file)?.title || (ordinal && p.directions[Number(ordinal[1]) - 1]) || file.name;
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

function VisualOutput({ p, name }: { p: Project; name?: string }) {
  const images = p.artifacts.filter(file => file.stage === 'visual' && file.kind === 'image' && file.visual?.role !== 'comparison');
  const refs = (p.attachments || []).filter(file => /\.(png|jpe?g|webp)$/i.test(file.name) && safeURL(file.url));
  const reports = images.map(file => ({ file, record: visualRecord(p, file), title: visualCaption(p, file) }));
  const initial = reports.find(item => item.file.name === name)?.title;
  const [selected, setSelected] = useState(initial || p.choice || p.directions[0]);
  const directions: GalleryDirection[] = [...new Set(p.directions)].map(title => {
    const group = reports.filter(item => item.title === title).sort((a,b)=>Number(!!b.file.visual?.recommended)-Number(!!a.file.visual?.recommended));
    const winner = group.find(item=>item.file.visual?.recommended)?.file.visual;
    const current = group.find(item => !item.file.visual || item.file.visual.role === 'main');
    const metadata = current?.file.visual ?? group.find(item => item.file.visual)?.file.visual;
    function pictures(role: 'sketch' | 'main' | 'extension' | 'mockup') {
      const ordered = group.filter(item => (item.file.visual?.role ?? 'main') === role);
      if (role === 'main' && name) ordered.sort((a,b) => Number(b.file.name === name) - Number(a.file.name === name));
      return ordered
        .flatMap(({ file }) => {
          const src = safeURL(file.url);
          return src ? [{ src, title: file.visual?.candidate ? '第 '+file.visual.candidate+' 稿 · '+file.visual.mean+'/5' : file.name, alt: title + ' · ' + file.name }] : [];
        });
    }
    return { id: title, name: title,
      batchSummary: group.some(item=>item.file.visual?.candidate) ?
        (winner ? '推荐第 '+winner.candidate+' 稿 · '+winner.mean+'/5　'+winner.reason : '本批暂无达标稿，查看评审后修改。') : undefined,
      description: current?.record?.description?.split(/[。\n]/)[0], references: [],
      format: metadata?.format, extensionLabel: metadata?.output === 'packaging' ? '包装延展' : metadata?.output === 'kv' ? 'KV 延展' : '延展图',
      sketch: pictures('sketch')[0], mains: pictures('main'), extensions: pictures('extension'), mockup: pictures('mockup')[0] };
  });
  const active = directions.find(item => item.id === selected) ?? directions[0];
  const current = reports.find(item => item.title === active?.id);
  const board = p.artifacts.find(a=>a.visual?.role==='comparison' && a.visual.direction===active?.id);
  const candidates = reports.filter(item=>item.title===active?.id && item.file.visual?.candidate).map(({file})=>{
    const v = file.visual!;
    return {image:safeURL(file.url) || undefined,title:'第 '+v.candidate+' 稿 · '+v.mean+'/5',readings:v.blind?[v.blind]:[],scores:v.scores || [],reason:v.reason,edit:v.edit,research:v.research};
  });
  const other = reports.filter(item => !directions.some(direction => direction.id === item.title));
  return <>
    {!!directions.length && active && <div data-artifact={current?.file.name}>
      <VisualImageGallery directions={directions} currentId={active.id} onDirectionChange={setSelected}
        details={candidates.length ? <VisualReview board={board && safeURL(board.url) || undefined}
          order={[...candidates.map(c=>c.title.split(' · ')[0]),...(board?.visual?.references || [])]} candidates={candidates} /> : current?.record?.description && <p>{current.record.description}</p>} />
    </div>}
    {!active && !other.length && <p className="pending">主视觉稿尚未交回。</p>}
    {!!other.length && <section className="block"><h2>其他已存图稿</h2>
      {other.map(({ file, title }) => <a key={file.url} href={safeURL(file.url)} target="_blank" rel="noopener noreferrer">{title}</a>)}
    </section>}
    {!!refs.length && <details className="research-original"><summary>项目参考图（未分方向）</summary>
      <div className="ref-row">{refs.map(ref => <a href={safeURL(ref.url)} key={ref.url} target="_blank" rel="noopener noreferrer">
        <img className="ref-art media-reference" src={safeURL(ref.url)} alt={ref.name} /><span>{ref.name}</span>
      </a>)}</div>
    </details>}
  </>;
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
  name,
  act,
  busy,
}: {
  p: Project;
  id: MediaStage;
  name?: string;
  act: Act;
  busy: boolean;
}) {
  if (id === 'visual') return <VisualOutput key={JSON.stringify([p.id, name])} p={p} name={name} />;
  const deck = p.artifacts.find(isDeckPreview);
  const pptx = p.artifacts.filter((file) => file.stage === 'layout' && file.kind === 'pptx');
  if (id === 'layout') {
    if (!deck && !pptx.length) {
      const message = p.stage === 'layout'
        ? p.status === 'running' ? '正在排版。' : '本版排版稿尚未就绪。'
        : '等待视觉稿进入排版。';
      return <p className="pending">{message}</p>;
    }
    return (
      <section className="block" data-artifact={deck?.name}>
        <h2>提案预览</h2>
        {deck ? <DeckPreview key={deck.url} file={deck} foldIndex /> : <p>本版可下载 PPTX，在线预览尚未就绪。</p>}
        <DeckDownloads files={pptx} />
      </section>
    );
  }
  const reviews = p.artifacts.filter((file) => file.stage === 'final' && file.kind === 'text');
  if (!deck && !pptx.length && !reviews.length) {
    return <p className="pending">等待排版稿，随后进入终审。</p>;
  }
  return (
    <>
      {(deck || !!pptx.length) && (
        <section className="block" data-artifact={deck?.name}>
          <h2>本版提案</h2>
          {deck && <DeckPreview key={deck.url} file={deck} foldIndex />}
        </section>
      )}
      <section className="block">
        <h2>终审记录</h2>
        {reviews.length ? (
          <>
            <p className="demo-banner">本地审读演练 · 正式签收待人类比稿负责人确认</p>
            {reviews.map((review) => <ReviewRecord key={review.url} file={review} />)}
          </>
        ) : (
          <p className="pending">{p.stage === 'final' && p.status === 'running' ? '正在审读本版排版稿。' : '本版尚无终审记录。'}</p>
        )}
        <DeckDownloads files={pptx} />
      </section>
      {p.status === 'done' && <Feedback p={p} act={act} busy={busy} />}
    </>
  );
}

function DeckDownloads({ files }: { files: Artifact[] }) {
  if (!files.length) return null;
  return (
    <div className="deliver">
      {files.map((file) => (
        <a key={file.url} data-artifact={file.name} className="btn btn-dark" href={safeURL(file.url)} download={file.name}>
          {files.length === 1 ? '下载可编辑 PPTX' : '下载 ' + file.name}
        </a>
      ))}
    </div>
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
  const paragraphs = text.split(/\n\s*\n/);
  const summary = paragraphs.find((paragraph) => /^(?:本次|本轮|本地|终审|审读|审核|综合|结论|裁定|建议|待修|待核|需修)/.test(paragraph));
  return (
    <div data-artifact={file.name} className="media-review">
      {summary && <p>{inlineText(summary)}</p>}
      <details>
        <summary>查看完整审读记录</summary>
        {paragraphs.map((paragraph, i) => {
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
            <div key={i}>
              {lines.map((line, j) =>
                /^#{1,6} /.test(line) ? (
                  <h3 key={j}>{inlineText(line.replace(/^#{1,6} /, ''))}</h3>
                ) : (
                  <p key={j}>{inlineText(line)}</p>
                ),
              )}
            </div>
          );
        })}
      </details>
    </div>
  );
}
