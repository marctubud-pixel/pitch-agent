import { useState, type ReactNode } from 'react';
import { headlineReviewProtocol, type CopyDuty, type Project } from '../live';
import { CopyReviewPanel } from './CopyReviewPanel';
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
      return <Research p={p} name={name} />;
    case 'strategy':
      return <StrategyOutput p={p} text={text} name={name} />;
    case 'copy':
      return <CopyOutput key={JSON.stringify([p.id, files.map((f) => f.url), text])} p={p} name={name} text={text} onChoose={onChoose} busy={busy} />;
  }
}
