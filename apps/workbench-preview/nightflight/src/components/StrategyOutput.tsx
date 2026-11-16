import { ResearchSource } from './ResearchSource';
import type { Project } from '../live';
import { firstStatement, rowOf, sectionsOf, type Section } from './stageText';

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

function onePager(sections: Section[], project: Project, name?: string) {
  const section = (heading: string) => sections.find(s => s.heading === heading);
  const lead = section('核心策略');
  const audience = section('人群洞察');
  const brand = section('品牌角色');
  const claim = section('核心主张');
  const touch = sections.find(s => /^视觉与.*触点$/.test(s.heading));
  const measures = section('衡量方式');
  if (!lead || !audience || !brand || !claim || !touch || !measures) return null;
  const references = (section('研究结论')?.lines ?? []).flatMap(line => {
    const match = line.match(/^研究\s+(\d+)[：:]\s*(.+)$/);
    if (!match) return [];
    const finding = project.research?.findings[Number(match[1]) - 1];
    return [{ label: match[2], finding }];
  });
  return <section className="block strategy-one-pager" data-artifact={name}>
    <h2>核心策略</h2>
    <p className="statement">{firstStatement(lead.lines)}</p>
    <div className="two-col">
      {[audience, brand, claim, touch, measures].map(item => <div key={item.heading}>
        <h3>{item.heading}</h3>
        {(item === audience || item === brand) ? item.lines.map((line, i) => <p key={i}>{line}</p>) : <>
          {item === claim && <p>{item.lines[0]}</p>}
          <ul className="plain-list">{(item === claim ? item.lines.slice(1) : item.lines).map((line, i) =>
            <li key={i}>{line}</li>
          )}</ul>
        </>}
      </div>)}
    </div>
    {!!references.length && <details>
      <summary>查看研究依据（{references.length}）</summary>
      <ul className="strategy-findings">{references.map(({ label, finding }, i) => <li key={i}>
        <p>{finding?.conclusion || label}</p>
        {finding && <><p>{finding.evidence}</p><ResearchSource finding={finding} attachments={project.attachments} /></>}
      </li>)}</ul>
    </details>}
  </section>;
}

export function StrategyOutput({ p, text, name }: { p: Project; text: string; name?: string }) {
  if (p.research && !p.research.ready) return (
    <div className="block strategy-wait"><p>研究仍在补查，策略方向待定。</p>
      <a className="btn btn-sm" href={'#/p/' + encodeURIComponent(p.id) + '?stage=research'}>查看待查问题</a>
    </div>
  );
  if (!text) return <p className="pending">尚无策略稿。</p>;
  const sections = sectionsOf(text);
  const sheet = onePager(sections, p, name);
  if (sheet) return sheet;
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
