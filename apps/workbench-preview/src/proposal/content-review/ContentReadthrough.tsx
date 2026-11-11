import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CircleAlert, FileCheck2, Maximize2 } from 'lucide-react';
import { Link, projectPath } from '../../app/router';
import { Modal } from '../../ui/Modal';
import { readingStages, type ReadingDocument, type ReadingImage, type ReadingIssue } from './model';
import './content-review.css';

type Filter = 'all' | ReadingIssue['kind'];
const chainStages = ['research', 'strategy', 'themes', 'visual'] satisfies Array<keyof typeof readingStages>;
const filters: readonly { id: Filter; label: string }[] = [{ id: 'all', label: '全部' }, { id: 'revision', label: '需修改' }, { id: 'evidence', label: '待补依据' }];

export function ContentReadthrough({ document: reading, projectId }: { document: ReadingDocument; projectId: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [image, setImage] = useState<ReadingImage | null>(null);
  const story = useRef<HTMLDetailsElement>(null);
  const shown = reading.issues.filter(issue => filter === 'all' || issue.kind === filter);
  const revised = reading.issues.filter(issue => issue.kind === 'revision').length;
  const toSection = (stage: string) => {
    const section = reading.sections.find(item => item.stage === stage);
    if (!section) return;
    if (story.current) story.current.open = true;
    requestAnimationFrame(() => {
      const target = document.getElementById(`reading-${section.id}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  };
  return <div className="cr-reading" data-reading-id={reading.id}>
    <section className="cr-summary" aria-labelledby="reading-summary-title">
      <div className="cr-summary__top"><span className="cr-eyebrow"><FileCheck2 size={15} aria-hidden="true" /> 本轮审读</span><span className="cr-status"><CircleAlert size={14} aria-hidden="true" /> {reading.issues.length}项待处理</span></div>
      <h2 id="reading-summary-title">{reading.title}</h2>
      <p>{reading.summary}</p>
      <div className="cr-summary__foot"><span>{revised}项需修改 · {reading.issues.length - revised}项待补依据</span><span>内容尚未冻结</span><Link className="text-link" to={projectPath(projectId, 'proposal', { stage: 'content_review', focus: 'ideas' })}>协作与记录<ArrowUpRight size={13} aria-hidden="true" /></Link></div>
    </section>

    <nav className="cr-chain" aria-label="整案承接">
      {chainStages.map((stage, index) => <div key={stage}>
        <button type="button" onClick={() => toSection(stage)}>{readingStages[stage]}</button>
        {index < 3 && <ArrowRight size={14} aria-hidden="true" />}
      </div>)}
      <details className="cr-chain__details"><summary>查看衔接判断</summary><ol>{reading.connections.map(connection => <li key={connection.id}><strong>{readingStages[connection.from]} → {readingStages[connection.to]} · {connection.label}</strong><p>{connection.text}</p></li>)}</ol></details>
    </nav>

    <section aria-labelledby="reading-issues-title" className="cr-issues">
      <div className="cr-section-head"><h2 id="reading-issues-title">待处理问题</h2><div className="cr-filters" role="group" aria-label="筛选审阅问题">{filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{item.id === 'all' ? reading.issues.length : reading.issues.filter(issue => issue.kind === item.id).length}</span></button>)}</div></div>
      <p className="sr-only" role="status">显示{shown.length}项问题</p>
      {shown.length ? <ol className="cr-issue-list">{shown.map(issue => <li key={issue.id} className="cr-issue" data-issue-kind={issue.kind}>
        <div className="cr-issue__meta"><span className="cr-issue__status">{issue.status}</span><span>{issue.owner}</span></div>
        <h3>{issue.title}</h3><p className="cr-issue__impact">{issue.impact}</p>
        <div className="cr-issue__actions"><details><summary>依据与处理建议</summary><div className="cr-issue__detail"><p className="cr-label">{issue.location}</p><p>{issue.observation}</p><div className="cr-suggestion"><strong>建议处理</strong><p>{issue.suggestion}</p></div><p className="cr-note">尚未回写上游，修改后由内容审阅负责人复核。</p><details><summary>原审与统筹复核记录</summary>{issue.notes.map(note => <section key={note.label} className="cr-review-note"><strong>{note.label}</strong><p>{note.text}</p></section>)}</details><details><summary>引用记录</summary><ul className="cr-source-refs">{issue.evidence.map(ref => <li key={ref}>{ref}</li>)}</ul></details></div></details><div className="cr-source-links">{issue.stages.map(stage => <Link key={stage} to={projectPath(projectId, 'proposal', { stage })} className="text-link">查看{readingStages[stage] ?? stage}<ArrowUpRight size={13} aria-hidden="true" /></Link>)}</div></div>
      </li>)}</ol> : <div className="cr-empty">此筛选下没有问题。<button type="button" className="text-link" onClick={() => setFilter('all')}>查看全部</button></div>}
    </section>

    <details className="cr-panel" ref={story}><summary><span>整案叙事</span><span className="cr-note">建议整理稿，未替换上游原稿</span></summary><ol className="cr-story">{reading.sections.map((section, index) => <li key={section.id} id={`reading-${section.id}`} tabIndex={-1}><span className="cr-story__number">{String(index + 1).padStart(2, '0')}</span><div><h3>{section.title}</h3><p>{section.text}</p><Link className="text-link" to={projectPath(projectId, 'proposal', { stage: section.stage })}>查看{readingStages[section.stage]}原稿<ArrowUpRight size={13} aria-hidden="true" /></Link></div></li>)}</ol></details>

    {reading.images.length > 0 && <details className="cr-panel">
      <summary><span>图文对照</span><span className="cr-note">方向主图与样机</span></summary>
      <p className="cr-note">以下为设计试稿。已审文字与图片分别呈现，包装及传播触点上的落位仍需核对。</p>
      {reading.reviewedCopy.map(copy => <section className="cr-comparison" key={copy.directionId} data-direction-id={copy.directionId} aria-labelledby={`reading-copy-${copy.directionId}`}>
        <h3 id={`reading-copy-${copy.directionId}`}>{copy.direction}</h3>
        <div className="cr-comparison__copy"><p className="cr-label">已审文字，尚未确认在图中落位</p><dl><div><dt>主文</dt><dd>{copy.slogan}</dd></div><div><dt>副文</dt><dd>{copy.subline}</dd></div></dl></div>
        <div className="cr-images">{reading.images.filter(item => item.directionId === copy.directionId).map(item => <figure key={item.id}><button type="button" onClick={() => setImage(item)} aria-label={`放大${item.direction}${item.label}`}><img src={item.url} alt={item.alt} loading="lazy" /><Maximize2 size={15} aria-hidden="true" /></button><figcaption><strong>{item.label}</strong><span>{item.observation}</span></figcaption></figure>)}</div>
      </section>)}
    </details>}

    {reading.changes.length > 0 && <details className="cr-panel"><summary>已记录的修改对照</summary>{reading.changes.map(change => <section className="cr-change" key={change.id}><h3>{change.title}</h3><p><span className="cr-label">原文</span><s>{change.before}</s></p><p><span className="cr-label">修改后</span>{change.after}</p><p>{change.reason}</p></section>)}</details>}

    <details className="cr-panel"><summary><span>负责人结论与版本记录</span></summary><div className="cr-roles"><section><h3>{reading.owner}</h3><p>{reading.ownerSummary}</p></section><section><h3>比稿智能体 · 衔接核对</h3>{reading.coordinator.kind === 'pending' ? <p>尚未完成独立统筹核对。</p> : <><p>{reading.coordinator.summary}</p><ul>{reading.coordinator.details.map(detail => <li key={detail}>{detail}</li>)}</ul></>}</section></div><dl className="cr-records">{reading.records.map(record => <div key={record.label}><dt>{record.label}</dt><dd>{record.text}</dd></div>)}</dl></details>
    <Modal open={image !== null} onClose={() => setImage(null)} title={image ? `${image.direction} · ${image.label}` : '查看设计试稿'} size="lg" description="生成的设计试稿，仅供本轮图文审读。"><>{image && <><img className="cr-lightbox" src={image.url} alt={image.alt} /><p className="cr-note">{image.observation}</p></>}</></Modal>
  </div>;
}
