import { ResearchSource } from './ResearchSource';
import type { Project } from '../live';
import { firstStatement, sectionsOf, type Section } from './stageText';

function onePager(sections: Section[], project: Project, name?: string) {
  const section = (heading: string) => sections.find(s => s.heading === heading);
  const lead = section('核心策略');
  const audience = section('人群洞察');
  const brand = section('品牌角色');
  const claim = section('核心主张');
  const touch = sections.find(s => /^视觉与.*触点$/.test(s.heading));
  if (!lead || !audience || !brand || !claim || !touch) return null;
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
      {[audience, brand, claim, touch].map(item => <div key={item.heading}>
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
  if (p.research && !p.research.ready && !p.research.conditional) return (
    <div className="block strategy-wait"><p>{p.canRequestStrategy ? '已有研究依据，可在研究页交给策略负责人撰写。' : '研究仍在补查，策略方向待定。'}</p>
      <a className="btn btn-sm" href={'#/p/' + encodeURIComponent(p.id) + '?stage=research'}>{p.canRequestStrategy ? '查看研究并进入策略' : '查看待查问题'}</a>
    </div>
  );
  if (!text) return <p className="pending">尚无策略稿。</p>;
  const sections = sectionsOf(text);
  const sheet = onePager(sections, p, name);
  return sheet ?? <details className="research-original"><summary>查看历史策略原稿</summary><div className="live-text">{text}</div></details>;
}
