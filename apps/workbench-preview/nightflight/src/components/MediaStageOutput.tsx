import { VisualReview } from '../../../src/proposal/qingyu-visual/VisualReview';
import { useState } from 'react';
import { isDeckPreview, safeURL, type Artifact, type Project } from '../live';
import { RevisionStage, type Act } from './ChatPanel';
import { VisualImageGallery, type GalleryDirection } from '../../../src/proposal/qingyu-visual/VisualImageGallery';
import { DeckPreview } from './DeckPreview';
import { publishedSlogan } from './stageText';

type MediaStage = 'visual' | 'layout' | 'final';
const reviewLabels: Record<string,string> = {
  visual:'视觉', brand:'品牌', user:'用户', spread:'传播',
  quality:'表现质量', composition:'构图适用性', compatibility:'品牌兼容', translation:'主题转译',
  understanding:'可理解性', feasibility:'场景可行性', memory:'记忆机制', difference:'差异',
};

function visualDirection(p: Project, file: Artifact) {
  const ordinal = /^visual-(\d+)-[\da-f]+\.png$/i.exec(file.name);
  return file.visual?.direction || visualRecord(p, file)?.title || (ordinal && p.directions[Number(ordinal[1]) - 1]) || file.name;
}

export function visualCaption(p: Project, file: Artifact) {
  const direction = visualDirection(p, file);
  return publishedSlogan(p, direction) || direction;
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
  const images = p.artifacts.filter(file => file.stage === 'visual' && file.kind === 'image' && file.visual?.role !== 'comparison' && file.visual?.role !== 'reference');
  const refs = (p.attachments || []).filter(file => /\.(png|jpe?g|webp)$/i.test(file.name) && safeURL(file.url));
  const sourced = p.artifacts.filter(file => file.stage === 'visual' && file.visual?.role === 'reference');
  const referencesByDirection = new Map(p.directions.map(direction => {
    const handoff = images.find(file => file.visual?.direction === direction && file.visual.referenceHandoff)?.visual?.referenceHandoff;
    const bound = (handoff?.references ?? []).flatMap(ref => {
      const original = sourced.find(file => file.visual?.direction === direction && file.visual.sha256 === ref.sha256 && file.name === ref.name);
      const asset = original ?? refs.find(file => file.name === ref.name);
      const src = asset && safeURL(asset.url);
      return src ? [{ ...ref, src, title: original?.visual?.title || ref.borrow, pageUrl: original?.visual?.pageUrl }] : [];
    });
    return [direction, bound] as const;
  }));
  const reports = images.map(file => ({ file, record: visualRecord(p, file), title: visualDirection(p, file) }));
  const initial = reports.find(item => item.file.name === name)?.title ?? sourced.find(file => file.name === name)?.visual?.direction;
  const [selected, setSelected] = useState(initial || p.choice || p.directions[0]);
  const directions: GalleryDirection[] = [...new Set(p.directions)].map(title => {
    const group = reports.filter(item => item.title === title).sort((a,b)=>Number(!!b.file.visual?.recommended)-Number(!!a.file.visual?.recommended));
    const winner = group.find(item=>item.file.visual?.recommended)?.file.visual;
    const hasBatch = group.some(item=>item.file.visual?.candidate);
    const assignedReferences = (referencesByDirection.get(title) ?? []).filter(ref => ref.role !== 'sharedBrand');
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
    return { id: title, name: publishedSlogan(p, title) || title,
      batchSummary: hasBatch ? (winner ? '推荐第 '+winner.candidate+' 稿' : '本批暂无达标稿') : undefined,
      auxiliaryMissing: hasBatch && assignedReferences.length > 0 && !assignedReferences.some(ref => ref.role === 'auxiliary'),
      description: current?.record?.description?.split(/[。\n]/)[0], references: assignedReferences.map(ref => ({src: ref.src, title: ref.title, alt: ref.borrow})),
      format: metadata?.format, extensionLabel: metadata?.output === 'packaging' ? '包装延展' : metadata?.output === 'kv' ? 'KV 延展' : '延展图',
      sketch: pictures('sketch')[0], mains: pictures('main'), extensions: pictures('extension'), mockup: pictures('mockup')[0] };
  });
  const active = directions.find(item => item.id === selected) ?? directions[0];
  const current = reports.find(item => item.title === active?.id);
  const board = p.artifacts.find(a=>a.visual?.role==='comparison' && a.visual.direction===active?.id);
  const admission = current?.file.visual?.referenceHandoff?.admission;
  const candidates = reports.filter(item=>item.title===active?.id && item.file.visual?.candidate).map(({file})=>{
    const v = file.visual!;
    return {image:safeURL(file.url) || undefined,title:'第 '+v.candidate+' 稿 · '+v.mean+'/5',readings:v.blind?[v.blind]:[],scores:v.scores || [],reason:v.reason,edit:v.edit,research:v.research};
  });
  const selectedRefs = referencesByDirection.get(active?.id) ?? [];
  const assigned = new Set([...referencesByDirection.values()].flat().map(ref => ref.name));
  const remainingRefs = refs.filter(ref => !assigned.has(ref.name));
  const other = reports.filter(item => !directions.some(direction => direction.id === item.title));
  return <>
    {!!directions.length && active && <div data-artifact={current?.file.name}>
      <VisualImageGallery directions={directions} currentId={active.id} onDirectionChange={setSelected}
        details={(selectedRefs.length || candidates.length || current?.record?.description) ? <>
          {!!selectedRefs.length && <section><h4>参考依据</h4><ul className="plain-list">{selectedRefs.map(ref =>
            <li key={ref.sha256}><strong>{{main:'主参考',auxiliary:'辅助参考',sharedBrand:'品牌共用'}[ref.role]}</strong>
              <p>{ref.borrow}</p><p>{ref.apply}</p>
              {ref.why && <p>选图依据：{ref.why}</p>}{ref.avoid && <p>使用边界：{ref.avoid}</p>}
              {ref.pageUrl?.startsWith('https://') && <a href={ref.pageUrl} target="_blank" rel="noopener noreferrer">查看来源页</a>}
            </li>)}</ul></section>}
          {admission && <details><summary>查看参考图准入原票</summary>
            <p>{admission.ruling.reason}</p>
            {admission.votes.map(vote => <section key={vote.role}><h4>{reviewLabels[vote.role] ?? vote.role}</h4>
              <ul>{vote.items.map(item => <li key={item.dimension}>{reviewLabels[item.dimension] ?? item.dimension} · {item.score === null ? '待核' : item.score+'/5'}　{item.evidence}</li>)}</ul>
            </section>)}
          </details>}
          {candidates.length ? <VisualReview board={board && safeURL(board.url) || undefined}
            order={[...candidates.map(c=>c.title.split(' · ')[0]),...(board?.visual?.references || [])]} candidates={candidates} /> : current?.record?.description && <p>{current.record.description}</p>}
        </> : undefined} />
    </div>}
    {!active && !other.length && <p className="pending">主视觉稿尚未交回。</p>}
    {!!other.length && <section className="block"><h2>其他已存图稿</h2>
      {other.map(({ file, title }) => <a key={file.url} href={safeURL(file.url)} target="_blank" rel="noopener noreferrer">{title}</a>)}
    </section>}
    {!!remainingRefs.length && <details className="research-original"><summary>项目参考图（未分方向）</summary>
      <div className="ref-row">{remainingRefs.map(ref => <a href={safeURL(ref.url)} key={ref.url} target="_blank" rel="noopener noreferrer">
        <img className="ref-art media-reference" src={safeURL(ref.url)} alt={ref.name} /><span>{ref.name}</span>
      </a>)}</div>
    </details>}
  </>;
}

function Feedback({ p, act, busy }: { p: Project; act: Act; busy: boolean }) {
  const [text, setText] = useState('');
  const [targetStage,setTargetStage]=useState<import('../types').StageId>('layout');
  const revisions = (p.feedback || []).filter((item) => 'stage' in item && item.stage === 'final');
  return (
    <section className="block">
      <h2>你的反馈</h2>
      <form
        className="feedback"
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim() && (await act('message', text.trim(),undefined,p.status==='done' ? {targetStage} : undefined))) setText('');
        }}
      >
        {p.status==='done' && <RevisionStage value={targetStage} change={setTargetStage}/>}
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
      <p className="hint">提交后会保存本版提案，从所选阶段修改。</p>
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
  if (id === 'layout' && p.layoutDraftOnly) {
    const saved = p.artifacts.filter(file=>file.stage==='layout' && file.kind==='text');
    const draft = saved.findLast(file=>file.name.startsWith('逐页稿-') && file.name.endsWith('.md'));
    const material = saved.findLast(file=>file.name.startsWith('逐页材料包-'));
    const result = p.layoutMaterialsOnly ? material : draft;
    if (!result) return <p className="pending">{p.status==='running' ?
      (p.layoutMaterialsOnly ? '正在核对材料和读图。' : '正在核对材料、读图并编写逐页稿。') :
      p.error || (p.layoutMaterialsOnly ? '编稿材料包尚未就绪。' : '逐页稿尚未交回。')}</p>;
    const downloads = [
      ['逐页稿-', '下载完整逐页稿'],
      ['逐页材料包-', '下载编稿材料包'],
      ['DeepSeek实际请求-', '查看 DeepSeek 实际请求'],
      ['采用原图读图-', '查看采用原图读图回执'],
    ].flatMap(([prefix,label])=>{
      const file = prefix==='逐页稿-' ? draft : saved.findLast(item=>item.name.startsWith(prefix));
      return file ? [{file,label}] : [];
    });
    return <section className="block" data-artifact={result.name}>
      <h2>{p.layoutMaterialsOnly ? '编稿材料包' : '逐页稿'}</h2>
      {p.canRenderManuscript && <button type="button" className="btn btn-dark" disabled={busy}
        onClick={()=>act('render_manuscript','确认逐页稿并排版')}>按逐页稿排版</button>}
      <ul className="plain-list">
        {downloads.map(({file,label})=><li key={file.url}><a href={safeURL(file.url)} download={file.name}>{label}</a></li>)}
      </ul>
      {draft?.text && <div className="live-text">{draft.text}</div>}
    </section>;
  }
  const deck = p.artifacts.find(isDeckPreview);
  const outlineId = deck?.name.match(/([0-9a-f-]{36})\.deck\.json$/i)?.[1];
  const outline = outlineId ? p.artifacts.find(file => file.stage === 'layout' && file.kind === 'text' &&
    file.name.endsWith(outlineId + '.outline.json')) : undefined;
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
        {deck ? <DeckPreview key={deck.url} file={deck} foldIndex outline={outline} /> : <p>本版可下载 PPTX，在线预览尚未就绪。</p>}
        <DeckDownloads files={pptx} />
      </section>
    );
  }
  const currentReviews = p.artifacts.filter((file) => file.stage === 'final' && file.kind === 'text');
  const priorFinal = p.finalReturn ? p.versions?.findLast(v=>v.stage==='final') : undefined;
  const reviews = priorFinal ? priorFinal.artifacts.filter(file=>file.stage==='final' && file.kind==='text') : currentReviews;
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
            <p className="demo-banner">{priorFinal ? '上一版退回意见' : '本地审读记录'} · 正式签收待人类比稿负责人确认</p>
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
  const summary = paragraphs.find((paragraph) => /^(?:第 \d+|已对照|本次|本轮|本地|终审|审读|审核|综合|结论|裁定|建议|待修|待核|需修)/.test(paragraph));
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
