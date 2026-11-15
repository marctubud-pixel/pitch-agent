import type { Project } from '../live';
import { firstStatement, rowOf, sectionsOf } from './stageText';

type Finding = { conclusion: string; evidence?: string; source?: string; url?: string };
export type StrategyReading = { focus: string; findings: Finding[]; intersection: string[] };

export function StrategyReadingView({ reading, name }: { reading: StrategyReading; name?: string }) {
  return (
    <section className="block" data-artifact={name}>
      <h2>核心策略</h2>
      {reading.focus && <p className="statement">{reading.focus}</p>}
      <div className="two-col">
        <div>
          <h3>研究结论</h3>
          <ul className="strategy-findings">
            {reading.findings.map(({ conclusion, evidence, source, url }, i) => (
              <li key={i}>
                <p>{conclusion}</p>
                {(evidence || source) && <details><summary>查看依据</summary>
                  {evidence && <p>{evidence}</p>}
                  {source && (/^https?:\/\//i.test(url ?? '') ? <a href={url} target="_blank" rel="noreferrer">{source}</a> : <p>{source}</p>)}
                </details>}
              </li>
            ))}
          </ul>
        </div>
        <div className="strategy-intersection">
          <h3>方向交叉点</h3>
          {reading.intersection.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </div>
    </section>
  );
}

export function StrategyOutput({ p, text, name }: { p: Project; text: string; name?: string }) {
  if (p.research && !p.research.ready) return (
    <div className="block strategy-wait"><p>研究仍在补查，策略方向待定。</p>
      <a className="btn btn-sm" href={'#/p/' + encodeURIComponent(p.id) + '?stage=research'}>查看待查问题</a>
    </div>
  );
  if (!text) return <p className="pending">尚无策略稿。</p>;
  const sections = sectionsOf(text);
  const focus = sections.find((s) => /核心策略|策略发力点|策略主张/.test(s.heading));
  const lead = firstStatement(focus?.lines || []).replace(/^(?:发力点|核心策略|优先放大)[：:]\s*/, '');
  const research = sections.find((s) => /研究结论/.test(s.heading));
  const findings: Finding[] = [];
  for (const line of research?.lines || []) {
    const row = rowOf(line);
    if (row && /^(依据|对应依据|来源)$/.test(row.label)) {
      const last = findings.at(-1);
      if (last) {
        const key = row.label === '来源' ? 'source' : 'evidence';
        if (!last[key]?.includes(row.value)) last[key] = [last[key], row.value].filter(Boolean).join('　');
      }
    } else if (!line.startsWith('|')) {
      const conclusion = row?.label === '结论' ? row.value : line;
      const matched = p.research?.findings.find((f) => f.conclusion === conclusion);
      findings.push(matched ? { ...matched } : { conclusion });
    }
  }
  const intersection = sections.find((s) => /方向交叉点/.test(s.heading))?.lines || [];
  return <StrategyReadingView name={name} reading={{ focus: lead.match(/^[^。！？]*[。！？]?/)?.[0] || '', findings, intersection }} />;
}
