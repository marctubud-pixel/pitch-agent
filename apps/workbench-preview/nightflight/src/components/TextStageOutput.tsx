import type { ReactNode } from 'react';
import type { Project } from '../live';
import { briefCard } from './briefCard';
import { directionBody, firstStatement, rowOf, sectionsOf, type Row } from './stageText';

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

function Research({ p, name }: { p: Project; name?: string }) {
  const report = p.research;
  return (
    <section className="block" data-artifact={name}>
      <h2>关键发现</h2>
      {report?.findings.length ? (
        <>
          <p className="demo-banner">
            {report.ready ? '本轮已有可交给策略的发现。' : '以下为本轮已核发现，研究仍待补查。'}
          </p>
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
        </>
      ) : (
        <Pending>
          {report
            ? '本轮尚无可供策略使用的研究结论。'
            : p.artifacts.some((a) => a.stage === 'research')
              ? '旧版原稿尚无逐条核对的发现，可在下方查看原稿。'
              : '尚无研究发现。'}
        </Pending>
      )}
    </section>
  );
}

function Strategy({ text, name }: { text: string; name?: string }) {
  if (!text) return <Pending>尚无策略稿。</Pending>;
  const sections = sectionsOf(text).filter((s) => s.lines.length);
  const core = sections.find((s) => /核心策略|策略发力点|策略主张/.test(s.heading)) || sections[0];
  const lead = core && firstStatement(core.lines);
  const headline = lead?.split(/(?<=[。！？])|(?<=[.!?])\s+/u, 1)[0];
  return (
    <section className="block" data-artifact={name}>
      <h2>核心策略</h2>
      {headline && <p className="statement">{headline}</p>}
      <div className="two-col">
        {sections.map((section, i) => {
          const lines =
            section === core && headline
              ? section.lines
                  .map((line) => (line === lead ? line.slice(headline.length).trim() : line))
                  .filter(Boolean)
              : section.lines;
          if (!lines.length) return null;
          return (
            <div key={i}>
              {section.heading && <h3>{section.heading}</h3>}
              {lines.map((line, j) => (
                <p key={j}>{line}</p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Copy({
  name,
  p,
  text,
  onChoose,
  busy,
}: {
  p: Project;
  text: string;
  name?: string;
  onChoose?: (name: string) => void;
  busy?: boolean;
}) {
  if (!p.directions.length)
    return <Pending>{text ? '已有文案原稿，尚未登记候选方向。' : '尚无创意方向。'}</Pending>;
  const sections = sectionsOf(text);
  const directions = p.directions.map((name, i) => {
    const body = directionBody(sections, name, i);
    const rows = (body?.lines || []).map(rowOf).filter((r): r is Row => !!r);
    const main = rows.find((r) => /^(主文案?|主标题|广告语|标语|口号|主题文案|slogan)$/i.test(r.label));
    const concept = rows.find((r) => /^(主张|创意概念|概念|创意说明)$/.test(r.label));
    const secondary = rows.find((r) => /^(副文案?|副标题|副标)$/.test(r.label));
    const samples = rows.filter((r) => /示例|样例|短句/.test(r.label));
    const other = rows.filter((r) => r !== main && r !== concept && r !== secondary && !samples.includes(r));
    return { name, main, concept, secondary, samples, other, body };
  });
  const chosen = directions.find((d) => d.name === p.choice);
  const themes = chosen ? [chosen] : p.mode === 'auto' ? directions : [];
  return (
    <>
      <section className="block" data-artifact={name}>
        <h2>三个创意方向</h2>
        <div className="dir-grid">
          {directions.map((d, i) => (
            <article key={d.name} className={'dir' + (d === chosen ? ' is-picked' : '')}>
              <p className="mono-label">
                方向 {String.fromCharCode(65 + i)}
                {d === chosen && <span className="picked-tag">已选定</span>}
              </p>
              <h3>{d.name}</h3>
              {d.main && <p className="dir-line">{d.main.value}</p>}
              {d.concept && <p>{d.concept.value}</p>}
              <Rows rows={d.other} mini />
              {(d.secondary || d.samples.length > 0) && (
                <ul className="samples">
                  {[...(d.secondary ? [d.secondary] : []), ...d.samples].map((r, j) => (
                    <li key={j}>{r.value}</li>
                  ))}
                </ul>
              )}
              {d.body?.lines
                .filter((line) => !rowOf(line))
                .map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
              {p.stage === 'copy' && p.status === 'waiting' && p.mode === 'collab' && onChoose && (
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={busy}
                  onClick={() => onChoose(d.name)}
                >
                  选方向 {String.fromCharCode(65 + i)}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
      {themes.map(
        (d) =>
          d.main && (
            <section className="block" key={d.name}>
              <h2>主题文案 · {d.name}</h2>
              <p className="statement">{d.main.value}</p>
              {d.secondary && <p className="lead">{d.secondary.value}</p>}
              <Rows rows={d.samples} />
            </section>
          ),
      )}
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
      return <Strategy text={text} name={name} />;
    case 'copy':
      return <Copy p={p} name={name} text={text} onChoose={onChoose} busy={busy} />;
  }
}
