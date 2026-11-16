import { useState, type ReactNode } from 'react';
import { headlineReviewProtocol, safeURL, type Artifact, type Asset, type CopyDuty, type Project, type ResearchImage } from '../live';
import { CopyReviewPanel } from './CopyReviewPanel';
import { ResearchSource } from './ResearchSource';
export { ResearchSource } from './ResearchSource';
import { StrategyOutput } from './StrategyOutput';
import { briefCard } from './briefCard';
import { headlineFromSections, rowOf, sectionsOf, type Row } from './stageText';

type TextStage = 'brief' | 'research' | 'strategy' | 'copy';

function Rows({ rows, mini = false }: { rows: Row[]; mini?: boolean }) {
  if (!rows.length) return null;
  return (
    <dl className={mini ? 'mini' : 'kv'}>
      {rows.map(({ label, value }, i) => (
        <div key={i}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Pending({ children }: { children: ReactNode }) {
  return <p className="pending">{children}</p>;
}

function Brief({ p, text, name }: { p: Project; text: string; name?: string }) {
  const { rows, assumptions } = briefCard(text);
  return (
    <>
      {text ? (
        <section className="block" data-artifact={name}>
          <h2>项目任务卡</h2>
          {rows.length ? <Rows rows={rows} /> : <p>尚无可单列的已知项目信息，可展开原始需求或原稿核对。</p>}
          {!!assumptions.length && (
            <>
              <h3>你没有提到、主理人先按假设处理的部分</h3>
              <ul className="plain-list">
                {assumptions.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <Pending>尚无任务卡。</Pending>
      )}
      <details className="research-original">
        <summary>你的原始需求</summary>
        {p.brief && <blockquote className="quote">{p.brief}</blockquote>}
        {!!p.attachments?.length && (
          <ul className="plain-list">
            {p.attachments.map((file) => (
              <li key={file.url}>{file.name}</li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}

export function ResearchImageGallery({ images, artifacts, attachments }: { images: ResearchImage[]; artifacts: Artifact[]; attachments?: Asset[] }) {
  return (
    <div className="research-image-gallery">
      {images.map((image) => {
        const original = artifacts.find((a) => a.stage === 'research' && a.kind === 'image' && a.name === image.name);
        const url = original && safeURL(original.url);
        return (
          <figure key={image.sha256}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`放大查看${image.title}`}>
                <img src={url} alt={image.title} loading="lazy" />
              </a>
            ) : <p className="pending">本版原图暂不可用</p>}
            <figcaption>
              <strong>{image.title}</strong>
              <p>{image.observation}</p>
              {/^https?:\/\//i.test(image.pageUrl) && (
                <a href={image.pageUrl} target="_blank" rel="noopener noreferrer" aria-label={`查看${image.title}的出处`}>查看出处 ↗</a>
              )}
              {image.creatorRationale && image.rationaleQuote && /^https?:\/\//i.test(image.rationaleSourceUrl || '') && (
                <div className="research-case-note">
                  <h4>创作者说明</h4>
                  <p>{image.creatorRationale}</p>
                  <details>
                    <summary>核对原话</summary>
                    <blockquote>{image.rationaleQuote}</blockquote>
                    {image.rationaleAttachment && <p>核对材料　<ResearchSource finding={{ source: image.rationaleAttachment, url: '' }} attachments={attachments} /></p>}
                    <a href={image.rationaleSourceUrl} target="_blank" rel="noopener noreferrer">查看说明出处 ↗</a>
                  </details>
                </div>
              )}
              {image.takeaway && <div className="research-case-note"><h4>对本案的启发</h4><p>{image.takeaway}</p></div>}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

type ResearchReport = NonNullable<Project['research']>;
const digestChapters = [
  ['行业与市场', '行业'],
  ['竞争与同类传播', '竞品'],
  ['人群与接触情境', '用户'],
] as const;

function ResearchGaps({ gaps }: { gaps: string[] }) {
  if (!gaps.length) return null;
  return <details className="research-original">
    <summary>尚缺哪些依据（{gaps.length}）</summary>
    <ul className="plain-list">{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
  </details>;
}

export function ResearchDigest({ report, artifacts, attachments }: { report: ResearchReport; artifacts: Artifact[]; attachments?: Asset[] }) {
  const gaps = report.ready ? report.gaps.map(g=>typeof g==='string' ? {chapter:'',message:g} : g) : [];
  return (
    <>
      {digestChapters.map(([chapter, label]) => {
        const rows = report.digest?.filter(item => item.chapter === chapter && report.findings[item.findingIndex]);
        const chapterGaps = gaps.filter(gap => gap.chapter===chapter).map(gap=>gap.message);
        if (!rows?.length && !chapterGaps.length) return null;
        return (
          <section className="block research-digest" key={chapter}>
            <h2>{label}</h2>
            <ol className="findings">
              {rows?.map(({ title, detail, findingIndex }, index) => {
                const finding = report.findings[findingIndex];
                return (
                  <li id={'research-finding-'+findingIndex} key={findingIndex + '-' + index}>
                    <span className="finding-no">{index + 1}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{detail}</p>
                      <details>
                        <summary>{finding.images?.length ? `查看竞品原图与依据（${finding.images.length}）` : '依据与来源'}</summary>
                        {finding.images?.length ? (
                          <ResearchImageGallery images={finding.images} artifacts={artifacts} attachments={attachments} />
                        ) : (
                          <>
                            <p>{finding.evidence}</p>
                            <ul className="sources"><li>
                              <ResearchSource finding={finding} attachments={attachments} />
                            </li></ul>
                          </>
                        )}
                      </details>
                    </div>
                  </li>
                );
              })}
            </ol>
            <ResearchGaps gaps={chapterGaps} />
          </section>
        );
      })}
      <ResearchGaps gaps={gaps.filter(gap => !digestChapters.some(([chapter]) => gap.chapter===chapter)).map(gap=>gap.message)} />
      {report.ready && !!report.strategyAdvice?.length && (
        <section className="block research-advice">
          <h2>给策略的建议</h2>
          <ol className="findings">
            {report.strategyAdvice.map(({ recommendation, findingIndices }, index) => {
              const evidence = [...new Set(findingIndices)].map(i => report.findings[i]).filter(Boolean);
              if (!evidence.length) return null;
              return <li key={index}>
                <span className="finding-no">{index + 1}</span>
                <div>
                  <h3>{recommendation}</h3>
                  <details>
                    <summary>查看研究依据（{evidence.length}）</summary>
                    {[...new Set(findingIndices)].map(i=>{
                      const finding=report.findings[i];
                      if (!finding) return null;
                      const visible=report.digest?.find(row=>row.findingIndex===i);
                      if (!visible) return <div key={i}><p>{finding.evidence}</p><ResearchSource finding={finding} attachments={attachments}/>
                        {finding.images?.length ? <ResearchImageGallery images={finding.images} artifacts={artifacts} attachments={attachments}/> : null}
                      </div>;
                      return <button type="button" className="link-btn" key={i} onClick={()=>{
                        const row=document.getElementById('research-finding-'+i);
                        row?.querySelector('details')?.setAttribute('open','');
                        row?.scrollIntoView({block:'center'});
                      }}>{visible.title}</button>;
                    })}
                  </details>
                </div>
              </li>;
            })}
          </ol>
        </section>
      )}
    </>
  );
}

function Research({ p }: { p: Project }) {
  const archived = p.stage==='research' && p.status==='running' && p.researchFollowup
    ? [...(p.versions ?? [])].reverse().find(v=>v.research?.findings.length) : undefined;
  const report = p.research ?? archived?.research;
  const files = [...p.artifacts,...(p.versions ?? []).flatMap(v=>v.artifacts)];
  if (report && !report.digest?.length && report.findings.length) {
    const chapterNames: Record<string,string> = Object.fromEntries(digestChapters);
    const groups = [...new Set(report.findings.map(f=>f.chapter || '已核实的发现'))];
    return <>{groups.map(group=><section className="block" key={group}>
      <h2>{chapterNames[group] || group}</h2>
      <ol className="findings">{report.findings.filter(f=>(f.chapter || '已核实的发现')===group).map((f,i)=>
        <li key={i}><span className="finding-no">{i+1}</span><div><h3>{f.conclusion}</h3><p>{f.implication}</p>
          <details><summary>依据与来源</summary><p>{f.evidence}</p><ResearchSource finding={f} attachments={p.attachments}/>
            {!!f.images?.length && <ResearchImageGallery images={f.images} artifacts={files} attachments={p.attachments}/>}
          </details></div></li>)}</ol>
    </section>)}</>;
  }
  if (report && !report.ready && !report.findings.length) {
    const scope = report.searchScope;
    const lastLog = [...p.events].reverse().find(e=>e.stage==='research' && e.text.startsWith('公开检索取得 '));
    const excluded = scope?.pages.find(page=>page.reason);
    const reason = excluded ? excluded.title + '：' + excluded.reason : undefined;
    return <section className="block"><h2>这轮查到了什么</h2>
      <p>{scope ? `检索取得 ${scope.urls.length} 个候选链接，读到 ${scope.readable} 份原文。` : lastLog?.text}</p>
      <p>本轮没有核实出可用于本案的结论。</p>
      {reason && <p>{reason}</p>}
    </section>;
  }
  if (!report && p.stage === 'research' && p.status === 'running') return null;
  if (report?.digest?.length) return <ResearchDigest report={report} artifacts={files} attachments={p.attachments} />;
  if (p.artifacts.some(a => a.stage === 'research')) {
    return <p className="research-archive-note">这版研究可在下方的研究底稿中查看。</p>;
  }
  return <Pending>尚无研究发现。</Pending>;
}

const copyDuties: Record<CopyDuty, string> = {
  continuity: '稳健延续',
  feature: '放大品牌或产品特征',
  emotion: '放大用户氛围或情绪',
};

export function CopyOutput({
  name,
  p,
  text,
  onChoose,
  busy,
  renderReview,
  recommendationLabel,
  publishedDirections,
}: {
  p: Pick<Project, 'id' | 'directions' | 'mode' | 'stage' | 'status' | 'artifacts' | 'choice' | 'copyReview'>;
  text: string;
  name?: string;
  onChoose?: (name: string) => void;
  busy?: boolean;
  renderReview?: (directionName: string) => ReactNode;
  recommendationLabel?: string;
  publishedDirections?: { name: string; main: string }[];
}) {
  const [browsing, browse] = useState('');
  if (!p.directions.length)
    return <Pending>{text ? '已有文案原稿，尚未登记候选方向。' : '尚无创意方向。'}</Pending>;
  const sections = sectionsOf(text);
  const rows = sections.flatMap((s) => s.lines.map(rowOf)).filter((r): r is Row => !!r);
  const ticket = p.copyReview?.status === 'ready' ? p.copyReview : undefined;
  const headlineReview = headlineReviewProtocol(ticket);
  const recommended = ticket
    ? ticket.draft.directions.find((d) => d.id === ticket.recommendation.directionId)?.name
    : rows.find((r) => r.label === '推荐方向' && p.directions.includes(r.value))?.value;
  const directions = p.directions.map((name, i) => {
    const signed = ticket?.draft.directions.find((entry) => entry.name === name);
    const copy = signed ?? publishedDirections?.find((entry) => entry.name === name);
    const main = copy?.main ?? headlineFromSections(sections, name, i);
    return { name, main, signed };
  });
  const current = directions.find((d) => d.name === browsing)
    || directions.find((d) => d.name === p.choice)
    || directions.find((d) => d.name === recommended)
    || directions[0];
  const workbook = ticket?.sloganWorkbook;
  const workingDraft = workbook?.polish.directions.find(d => d.id === current.signed?.id);
  const candidates = workbook?.plan.directions.find(d => d.id === current.signed?.id)?.candidates;
  return (
    <>
      <section className="block copy-compare" data-artifact={name}>
        <h2>{directions.length === 3 ? '三个创意方向' : '创意方向'}</h2>
        <div className="dir-grid">
          {directions.map((d, index) => (
            <article key={d.name} className={'dir' + (d === current ? ' is-picked' : '')}>
              <p className="mono-label">
                {'方向 ' + String.fromCharCode(65 + index)}
                {d.signed?.duty && ' · ' + copyDuties[d.signed.duty]}
                {d.name === recommended && ' · ' + (recommendationLabel ?? (headlineReview ? '本版推荐' : '旧版推荐'))}
                {d.name === p.choice && ' · 已选定'}
              </p>
              <h3>
                <button type="button" className="copy-browse" aria-pressed={d === current}
                  onClick={() => browse(d.name)}>{d.main || '主标题待补'}</button>
              </h3>
            </article>
          ))}
        </div>
      </section>
      <section className="block copy-theme" key={current.name}>
        {renderReview ? renderReview(current.name) : current.signed && headlineReview && ticket ? (
          <details className="research-original">
            <summary>本标题的评审与推荐</summary>
            <CopyReviewPanel review={ticket} direction={current.signed} />
          </details>
        ) : (
          <details className="research-original">
            <summary>评审记录</summary>
            <p>{ticket ? '旧版按主副文合读评审。单标题暂无独立通过记录。' : '本版未登记单标题评审。'}</p>
          </details>
        )}
        {workingDraft && candidates && (
          <details className="research-original">
            <summary>查看本案创作底稿</summary>
            <h3>候选与取舍</h3>
            {candidates.map(c => <p key={c.text}><strong>{c.text}</strong>　{workingDraft.killed.find(k => k.text === c.text)?.reason ?? '保留进入打磨'}</p>)}
            <h3>打磨记录</h3>
            {workingDraft.versions.map(v => <p key={v.text}><strong>{v.text}</strong>　{v.use} · {v.tradeoff}</p>)}
            <p>{workingDraft.edits}</p>
            {ticket?.sloganRevisions?.filter(r => r.after.some(d => d.id === current.signed?.id)).map(r => {
              const before = r.before.find(d => d.id === current.signed?.id)?.main;
              const after = r.after.find(d => d.id === current.signed?.id)?.main;
              return <p key={before + '→' + after}>{before} → {after}　{r.changes.join('；')}</p>;
            })}
          </details>
        )}
        {p.stage === 'copy' && p.status === 'waiting' && p.mode === 'collab' && onChoose && (
          <button type="button" className="btn btn-dark" disabled={busy}
            onClick={() => onChoose(current.name)}>采用此方向</button>
        )}
      </section>
    </>
  );
}

export function TextStageOutput({
  p,
  id,
  onChoose,
  busy,
}: {
  p: Project;
  id: TextStage;
  onChoose?: (name: string) => void;
  busy?: boolean;
}) {
  const files = p.artifacts.filter((a) => a.stage === id && a.kind === 'text');
  const name = files[0]?.name;
  const text = files
    .map((a) => a.text)
    .filter(Boolean)
    .join('\n\n');
  switch (id) {
    case 'brief':
      return <Brief p={p} text={text} name={name} />;
    case 'research':
      return <Research p={p} />;
    case 'strategy':
      return <StrategyOutput p={p} text={text} name={name} />;
    case 'copy':
      return <CopyOutput key={JSON.stringify([p.id, files.map((f) => f.url), text])} p={p} name={name} text={text} onChoose={onChoose} busy={busy} />;
  }
}
