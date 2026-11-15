import { useState, type ReactNode } from 'react';
import type { CopyDuty, Project, ReviewedDirection } from '../live';
import { CopyReviewPanel } from './CopyReviewPanel';
import { StrategyOutput } from './StrategyOutput';
import { briefCard } from './briefCard';
import { directionBody, rowOf, sectionsOf, type Row } from './stageText';

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

export function ResearchFindings({ report }: { report: NonNullable<Project['research']> }) {
  return (
    <ol className="findings">
      {report.findings.map((finding, i) => (
        <li key={i}>
          <span className="finding-no">{i + 1}</span>
          <div>
            <h3>{finding.conclusion}</h3>
            <p>{finding.implication}</p>
            <details>
              <summary>依据与来源</summary>
              <p>{finding.evidence}</p>
              <ul className="sources">
                <li>
                  {/^https?:\/\//i.test(finding.url) ? (
                    <a href={finding.url} target="_blank" rel="noopener noreferrer">
                      {finding.source || finding.url}
                    </a>
                  ) : (
                    finding.source
                  )}
                </li>
              </ul>
            </details>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Research({ p, name }: { p: Project; name?: string }) {
  const report = p.research;
  if (report && !report.ready) return null;
  if (!report && p.stage === 'research' && p.status === 'running') return null;
  return (
    <section className="block" data-artifact={name}>
      <h2>关键发现</h2>
      {report?.findings.length ? (
        <ResearchFindings report={report} />
      ) : (
        <Pending>
          {p.artifacts.some((a) => a.stage === 'research')
            ? '旧版原稿尚无逐条核对的发现，可在下方查看原稿。'
            : '尚无研究发现。'}
        </Pending>
      )}
    </section>
  );
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
  publishedDirections?: ReviewedDirection[];
}) {
  const [browsing, browse] = useState('');
  if (!p.directions.length)
    return <Pending>{text ? '已有文案原稿，尚未登记候选方向。' : '尚无创意方向。'}</Pending>;
  const sections = sectionsOf(text);
  const rows = sections.flatMap((s) => s.lines.map(rowOf)).filter((r): r is Row => !!r);
  const ticket = p.copyReview?.version === 1 && p.copyReview.status === 'ready' ? p.copyReview : undefined;
  const recommended = ticket
    ? ticket.draft.directions.find((d) => d.id === ticket.recommendation.directionId)?.name
    : rows.find((r) => r.label === '推荐方向' && p.directions.includes(r.value))?.value;
  const recommendationSection = sections.find((s) => !p.directions.some((d) => s.heading.includes(d))
    && s.lines.some((line) => {
      const row = rowOf(line);
      return row?.label === '推荐方向' && row.value === recommended;
    }));
  const recommendationNotes = (recommendationSection?.lines || []).map(rowOf)
    .filter((r): r is Row => !!r && /^(推荐理由|推荐取舍|取舍)$/.test(r.label));
  const directions = p.directions.map((name, i) => {
    const signed = ticket?.draft.directions.find((entry) => entry.name === name);
    const copy = signed ?? publishedDirections?.find((entry) => entry.name === name);
    const body = directionBody(sections, name, i);
    const fields = (body?.lines || []).map(rowOf).filter((r): r is Row => !!r);
    const value = (pattern: RegExp) => fields.find((r) => pattern.test(r.label))?.value;
    const main = value(/^(主文案?|主标题|广告语|标语|口号|主题文案|slogan)$/i);
    const secondary = value(/^(副文案?|副标题|副标)$/);
    const idea = value(/^(?:创意机制|表达机制|机制|创意主张|主张|创意概念|概念|创意说明|创意切口)$/)
      || value(/^(?:策略承接|策略依据|承接策略|策略衔接|与策略的关系)$/)
      || main;
    const review = fields.filter((r) => /^(推荐理由|推荐取舍|取舍|值得选|误读风险)$/.test(r.label));
    if (name === recommended) {
      for (const note of recommendationNotes) {
        if (!review.some((r) => r.value === note.value)) review.push(note);
      }
    }
    const scenes = new Map<string, string[]>();
    const sceneRows = copy
      ? copy.touchpoints.map((point) => ({ label: point.label, value: point.text }))
      : fields.filter((row) => /场景文案|示例|样例|短句/.test(row.label));
    for (const row of sceneRows) {
      const label = row.label.replace(/(?:示例|样例)$/, '') || row.label;
      const lines = scenes.get(label) || [];
      if (!lines.includes(row.value)) lines.push(row.value);
      scenes.set(label, lines);
    }
    return {
      name, main: copy?.main ?? main, secondary: copy?.secondary ?? secondary,
      idea: copy?.mechanism ?? idea, review, scenes, signed,
    };
  });
  const current = directions.find((d) => d.name === browsing)
    || directions.find((d) => d.name === p.choice)
    || directions.find((d) => d.name === recommended)
    || directions[0];
  return (
    <>
      <section className="block copy-compare" data-artifact={name}>
        <h2>{directions.length === 3 ? '三个创意方向' : '创意方向'}</h2>
        <div className="dir-grid">
          {directions.map((d, index) => (
            <article key={d.name} className={'dir' + (d === current ? ' is-picked' : '')}>
              <p className="mono-label">
                {d.signed ? copyDuties[d.signed.duty] : '方向 ' + String.fromCharCode(65 + index)}
                {d.name === recommended && ' · ' + (recommendationLabel ?? (ticket ? '推荐' : '原稿推荐'))}
                {d.name === p.choice && ' · 已选定'}
              </p>
              <h3>
                <button type="button" className="copy-browse" aria-pressed={d === current}
                  onClick={() => browse(d.name)}>{d.name}</button>
              </h3>
              {d.idea && <p className="dir-line">{d.idea}</p>}
            </article>
          ))}
        </div>
      </section>
      <section className="block copy-theme" key={current.name}>
        <h2>主题文案 · {current.name}</h2>
        {current.main && <p className="statement">{current.main}</p>}
        {current.secondary && <p className="lead">{current.secondary}</p>}
        {current.signed?.basis && <p><strong>方向依据　</strong>{current.signed.basis}</p>}
        {current.scenes.size > 0 && (
          <div className="copy-scenes">
            <h3>场景文案</h3>
            <dl className="kv">
              {Array.from(current.scenes, ([label, lines]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <p style={{whiteSpace: 'pre-line'}}>{lines[0]}</p>
                    {lines.length > 1 && (
                      <details>
                        <summary>同场景备选（{lines.length - 1}）</summary>
                        <ul className="plain-list">{lines.slice(1).map((line) => <li key={line}>{line}</li>)}</ul>
                      </details>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {current.signed && ticket ? <CopyReviewPanel review={ticket} direction={current.signed} />
          : renderReview ? renderReview(current.name) : current.review.length > 0 && (
          <div className="copy-review">
            <h3>推荐与取舍</h3>
            <Rows rows={current.review} />
          </div>
        )}
        {!ticket && !renderReview && <p className="hint">本版未登记四岗评审票，可在原稿中查看创作记录。</p>}
        {p.stage === 'copy' && p.status === 'waiting' && p.mode === 'collab' && onChoose && (
          <button type="button" className="btn btn-dark" disabled={busy}
            onClick={() => onChoose(current.name)}>采用「{current.name}」</button>
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
      return <Research p={p} name={name} />;
    case 'strategy':
      return <StrategyOutput p={p} text={text} name={name} />;
    case 'copy':
      return <CopyOutput key={JSON.stringify([p.id, files.map((f) => f.url), text])} p={p} name={name} text={text} onChoose={onChoose} busy={busy} />;
  }
}
