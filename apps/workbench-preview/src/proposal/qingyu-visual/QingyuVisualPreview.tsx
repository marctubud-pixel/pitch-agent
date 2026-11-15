import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useServiceQuery } from '../../app/query';
import { useRouter } from '../../app/router';
import type { Proposal } from '../../domain/proposal';
import { resolveQingyuThemesPreview, type QingyuThemesResult } from '../qingyu-themes/preview';
import { resolvePackagingReferences, type PackagingReference } from './packaging-references';
import { resolveVisualIntake, type IntakeResult } from './workflow-intake';
import { resolveDirectionConcept, type ConceptImage } from './concept-images';
import { visualIntakeMetadata, visualIntakePacket } from './workflow-record';
import { displayReferences } from './display-references';
import { qingyuGalleryDirections } from './gallery-directions';
import { VisualImageGallery } from './VisualImageGallery';
import './visual-preview.css';

type AvailableResult = Exclude<QingyuThemesResult, { kind: 'unavailable' }>;
type ComparisonStage = 'reference' | 'sketch' | 'refined';
const ordinals = ['一', '二', '三'];
const comparisonStages: ReadonlyArray<{ id: ComparisonStage; label: string }> = [{ id: 'reference', label: '参考' }, { id: 'sketch', label: '草图' }, { id: 'refined', label: '精修' }];

export function QingyuVisualPreview({ proposal, collaboration }: { proposal: Proposal; collaboration?: ReactNode }) {
  const pid = proposal.workbenchId;
  const research = useServiceQuery(`research:${pid}`, service => service.getResearchWorkspace(pid), { projectId: pid });
  const briefs = useServiceQuery(`research-case-briefs:${pid}`, service => service.getBriefHistory(pid), { projectId: pid });
  const retry = () => { research.refetch(); briefs.refetch(); };
  if (research.status === 'error' || briefs.status === 'error') return <PreviewWorkspace collaboration={collaboration}><Unavailable message="研究或任务卡读取失败，暂不能核对视觉布局的文案依据。" retry={retry} /></PreviewWorkspace>;
  if (!research.data || !briefs.data) return <PreviewWorkspace collaboration={collaboration}><p className="qv-status" role="status">正在核对研究与任务卡依据…</p></PreviewWorkspace>;
  const result = resolveQingyuThemesPreview({ proposal, workspace: research.data, history: briefs.data });
  const refreshUnverified = research.refreshing || briefs.refreshing || Boolean(research.refreshError || briefs.refreshError);
  return <div className="qingyu-visual-preview">
    {(research.refreshing || briefs.refreshing) && <p className="qv-status" role="status">正在重新读取研究与任务卡，以下仍是上次成功读取的依据。</p>}
    {(research.refreshError || briefs.refreshError) && <p className="qv-status" role="alert">刷新失败，以下保留上次成功读取的依据，尚未重新核对。<button type="button" className="text-link" onClick={retry}>重试读取依据</button></p>}
    <QingyuVisualResultView result={result} retry={retry} collaboration={collaboration} refreshUnverified={refreshUnverified} />
  </div>;
}

function Unavailable({ message, retry }: { message: string; retry: () => void }) {
  return <section className="qv-status" data-visual-preview-status="unavailable" role="alert"><p>{message}</p><button type="button" className="btn btn--secondary btn--sm" onClick={retry}>重新核对依据</button></section>;
}

export function QingyuVisualResultView({ result, retry, collaboration, refreshUnverified = false }: { result: QingyuThemesResult; retry: () => void; collaboration?: ReactNode; refreshUnverified?: boolean }) {
  switch (result.kind) {
    case 'unavailable': return <PreviewWorkspace collaboration={collaboration}><Unavailable message={result.message} retry={retry} /></PreviewWorkspace>;
    case 'current':
    case 'historical': {
      const { bundle, basis, brief } = result.preview;
      const basisKey = [bundle.id, bundle.currentRound.id, result.kind, basis.research.contentSha256, basis.strategy.draftId, brief.basisVersion, brief.basisConfirmed, brief.latestVersion, brief.latestConfirmed].join(':');
      const intake = resolveVisualIntake({ bundle, intake: visualIntakePacket, metadata: visualIntakeMetadata, basis: refreshUnverified ? 'refresh-unverified' : result.kind });
      return <PreviewWorkspace result={result} intake={intake} collaboration={collaboration}>{control => <AvailableLayout key={basisKey} result={result} intake={intake} collaborationControl={control} />}</PreviewWorkspace>;
    }
    default: { const exhaustive: never = result; return exhaustive; }
  }
}

function PreviewWorkspace({ children, result, intake, collaboration }: { children: ReactNode | ((control: ReactNode) => ReactNode); result?: AvailableResult; intake?: IntakeResult; collaboration?: ReactNode }) {
  const { params } = useRouter();
  const focus = params.get('focus');
  const [open, setOpen] = useState(focus === 'ideas' || focus === 'add-idea');
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (focus === 'ideas' || focus === 'add-idea') setOpen(true); }, [focus]);
  const closePanel = () => { toggleRef.current?.focus(); setOpen(false); };
  const control = <button ref={toggleRef} className="btn btn--secondary qv-owner-toggle" type="button" aria-expanded={open} aria-controls="qv-owner-content" onClick={() => {
    if (open) { closePanel(); return; }
    setOpen(true);
    requestAnimationFrame(() => closeRef.current?.focus());
  }}>{open ? '收起协作与记录' : '查看协作与记录'}</button>;
  return <div className="qv-workspace qingyu-visual-preview">
    <div className="qv-main">{typeof children === 'function' ? children(control) : <><div className="qv-workspace-toolbar">{control}</div>{children}</>}</div>
    <aside id="qv-owner-content" className="qv-owner" aria-label="视觉规范、版本与协作" data-open={open || undefined} hidden={!open} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closePanel(); } }}>
      <div className="qv-owner-content">
        <div className="qv-owner-heading"><strong>协作与记录</strong><button ref={closeRef} type="button" className="text-link" onClick={closePanel}>关闭</button></div>
        {collaboration}
        <details className="qv-owner-records"><summary>视觉规范与历史记录</summary><VisualOwnerInfo result={result} intake={intake} /></details>
      </div>
    </aside>
  </div>;
}

function VisualOwnerInfo({ result, intake }: { result?: AvailableResult; intake?: IntakeResult }) {
  const { params } = useRouter();
  const direction = result?.preview.bundle.currentRound.directions.find(item => item.id === params.get('dir')) ?? result?.preview.bundle.currentRound.directions[0];
  const task = intake?.kind === 'collected-unreviewed' ? intake.intake.directions.find(item => item.id === direction?.id) : undefined;
  return <>
    <section className="qv-owner-section" aria-labelledby="qv-owner-title">
      <p className="pw-kicker">视觉负责人</p><h3 id="qv-owner-title">{intake?.kind === 'collected-unreviewed' ? '规范 1.0 · 参考接续' : '参考接续 · 待核'}</h3>
      <p className="small">{intake?.kind === 'collected-unreviewed' ? `本轮：参考接续，待评审 · v${intake.intake.skill.version}` : '接续记录待核'}</p>
      <p className="small muted">负责输入核对、任务拆解、分派与版本交接；选优与修改须依据独立评审。后台自动调度尚未接通。</p>
      {intake?.kind === 'unverified' && <p className="small" role="status">{intake.message}</p>}
      {intake?.kind === 'collected-unreviewed' && <>
        <p className="small" data-intake-status={intake.basis}>{intake.basis === 'historical' ? '接续对应历史输入，最新依据待复核。' : intake.basis === 'refresh-unverified' ? '沿用上次读取的接续，刷新核对未完成。' : '接续记录已核对 · 参考已收集待评审。'}</p>
        <details><summary>查看执行记录</summary><p className="small">{intake.intake.id} · {intake.intake.performedAt}</p><p className="small">原接续范围：参考收集与接续。当时未进行参考适配评审，未选主辅参考，未生成草图或精修。本次设计试稿单独展示，不回填该历史记录。</p><p className="small muted">本页任务问题为原接续记录的展示摘要，原岗位问题与编辑依据保留在来源记录中。</p><dl className="qv-record-identities"><dt>规范摘要</dt><dd>{intake.intake.skill.manifestSha256}</dd><dt>文案摘要</dt><dd>{intake.intake.input.copySha256}</dd></dl><ul className="qv-record-identities">{intake.intake.sources.map(source => <li key={source.path}>{source.path}<br />{source.sha256}</li>)}</ul></details>
      </>}
    </section>
    <section className="qv-owner-section" aria-labelledby="qv-task-title"><h3 id="qv-task-title">{direction?.name ?? '当前方向'} · 任务与进度</h3>
      <p className="small">{intake?.kind === 'collected-unreviewed' ? '原接续已收集参考；本次设计试稿独立展示，尚无正式视觉评审或采用。' : '参考接续待核；尚无可确认的视觉进度。'}</p>
      <p className="small"><strong>待验证的视觉问题</strong> {task?.visualQuestion ?? '接续记录待核，暂不展示未核对的视觉任务。'}</p>
      {task && <details><summary>搜索摘要与关键限制</summary><p className="pw-label">主要表达</p><ul>{task.focus.map(item => <li key={item}>{item}</li>)}</ul><p className="pw-label">关键限制</p><ul>{task.limits.map(item => <li key={item}>{item}</li>)}</ul><p className="pw-label">待补缺口</p><ul>{task.gaps.map(item => <li key={item}>{item}</li>)}</ul></details>}
    </section>
    <section className="qv-owner-section" aria-labelledby="qv-input-title"><h3 id="qv-input-title">当前输入与历史</h3>
      {result ? <><p className="small">封存文案轮次 {result.preview.bundle.currentRound.id} · 任务卡第 {result.preview.brief.basisVersion} 版</p><p className="small muted">{result.kind === 'historical' ? '历史输入预览，不能继承为当前通过。' : intake?.kind === 'collected-unreviewed' && intake.basis === 'refresh-unverified' ? '当前输入尚未重新核对。' : '沿用当前封存文案，方向切换仅用于浏览。'}</p><details><summary>输入版本详情</summary><p className="small qv-record-identities">{result.preview.bundle.id}</p><p className="small">研究依据 {result.preview.basis.research.contentSha256}</p></details></> : <p className="small muted">依据读取未完成，不能确认当前输入与接续。</p>}
      <p className="small muted">本次设计试稿不是正式视觉稿版本。文案原评不作为视觉评分；输入变化后需重新核对受影响记录。</p>
    </section>
  </>;
}

function AvailableLayout({ result, intake, collaborationControl }: { result: AvailableResult; intake: IntakeResult; collaborationControl: ReactNode }) {
  const { params, setParams } = useRouter();
  const { bundle, brief } = result.preview;
  const directions = bundle.currentRound.directions;
  const requestedDirection = params.get('dir');
  const matched = directions.find(direction => direction.id === requestedDirection);
  const current = matched ?? directions[0];
  const requestedPart = params.get('part');
  const compare = requestedPart === 'compare';
  const references = resolvePackagingReferences({ bundle, directionId: current?.id ?? '' });
  const concept = current && resolveDirectionConcept(bundle, current.id);
  const gallery = references.kind === 'ready' && concept ? qingyuGalleryDirections() : [];
  return <article className="pw-visual qingyu-visual-preview" data-visual-preview={bundle.id} data-visual-context={result.kind} aria-label="青屿视觉布局预览">
    {result.kind === 'historical' && <aside className="qv-status qv-history" role="status"><strong>历史依据预览</strong><p>文案依据为任务卡第 {brief.basisVersion} 版。{result.latestBriefVersion === null ? '当前任务卡缺失。' : `最新任务卡为第 ${result.latestBriefVersion} 版。`}尚未按最新依据重写，请勿作为当前任务结论。</p></aside>}
    {intake.kind === 'unverified' && <p className="qv-status" role="status">{intake.message}</p>}
    {requestedDirection !== null && !matched && <p className="qv-status" role="status">未找到链接指定的文案方向；当前浏览第一个封存方向。</p>}
    {requestedPart !== null && !['process','current','compare'].includes(requestedPart) && <p className="qv-status" role="status">未找到链接指定的视图，当前显示方向参考与图稿。</p>}
    {params.has('version') && <p className="qv-status" role="status">没有可核对的视觉稿版本。</p>}
    {references.kind !== 'ready' ? <p className="qv-status" role="status">{references.message}</p>
      : compare ? <Comparison bundle={bundle} /> : current && concept && <VisualImageGallery
        directions={gallery} currentId={current.id} onDirectionChange={id => setParams({ dir: id, version: null })}
        details={<>
          <p>本次为设计试稿，尚无独立视觉评分或正式采用。</p>
          <h4>文案依据</h4><p>{current.slogan}</p>
          <h4>设计说明</h4><p>{concept.description}</p><ul>{concept.notes.map(note => <li key={note}>{note}</li>)}</ul>
          <p>500毫升透明瓶，青色与山形。茶种及完整配料未确定；瓶型、材质与印刷均为模拟。</p>
          <h4>参考来源与借鉴</h4>
          {displayReferences(current.id).map(reference => <div key={reference.id} className="qv-source">
            <strong>{reference.title}</strong><p>{reference.borrow}</p><p>{reference.limits}</p>
            <p>{reference.form} · {reference.scope}</p>
            <a href={reference.sourceUrl} target="_blank" rel="noreferrer">{reference.sourceName}</a>{' · '}
            <a href={reference.imageUrl} target="_blank" rel="noreferrer">来源原图</a>
            {reference.fullImage && <> · <a href={reference.fullImage} target="_blank" rel="noreferrer">完整系列图</a></>}
          </div>)}
          <p>参考图用于方法借鉴，浏览不产生采用记录。原六张参考的接续记录保存在协作与记录中。</p>
        </>} />}
    <div className="qv-workspace-toolbar">
      <button type="button" className="text-link" onClick={() => setParams({ part: compare ? null : 'compare' })}>
        {compare ? '返回方向图稿' : '三方向同阶段对照'}
      </button>{collaborationControl}
    </div>
  </article>;
}

function ConceptPicture({ image }: { image: ConceptImage }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="qv-image-failure" role="status">图片暂未载入，请稍后重试。</span> : <img className="qv-concept-image" src={image.url} alt={image.alt} data-generation-type={image.generationType} onError={() => setFailed(true)} />;
}

function Comparison({ bundle }: { bundle: AvailableResult['preview']['bundle'] }) {
  const { params, setParams } = useRouter();
  const requested = params.get('compareStage');
  const stage = comparisonStages.find(item => item.id === requested)?.id ?? 'reference';
  return <section className="qv-comparison" aria-labelledby="qv-compare-title"><h3 id="qv-compare-title">三方向 · 同阶段对照</h3>
    <div className="visual-view-controls" role="group" aria-label="对照阶段">{comparisonStages.map(item => <button type="button" key={item.id} aria-pressed={stage === item.id} onClick={() => setParams({ compareStage: item.id })}>{item.label}</button>)}</div>
    {requested !== null && !comparisonStages.some(item => item.id === requested) && <p className="small" role="status">未找到指定的对照阶段，当前按参考比较。</p>}
    <details><summary>对照说明</summary><p className="small muted">同一阶段分别对照。未进行相似度评审。</p></details>
    <div className="pw-sim"><div className="pw-sim__row">{bundle.currentRound.directions.map((direction, index) => {
      const refs = resolvePackagingReferences({ bundle, directionId: direction.id });
      const concept = resolveDirectionConcept(bundle, direction.id);
      return <figure key={direction.id} data-visual-comparison={direction.id} data-comparison-stage={stage}><figcaption><span className="qv-direction-label">方向{ordinals[index]}</span><strong>{direction.name}</strong><button type="button" className="text-link" onClick={() => setParams({ dir: direction.id, part: stage === 'refined' ? 'current' : 'process', version: null })}>查看此方向 <ArrowLeftRight size={12} aria-hidden="true" /></button></figcaption>{stage === 'reference' ? refs.kind === 'ready' ? <div className="qv-comparison-references">{displayReferences(direction.id).map(reference => <a key={reference.id} href={reference.image} target="_blank" rel="noreferrer" aria-label={`放大查看${reference.title}原图`}><ReferenceImage reference={reference} /><span>{reference.title}</span></a>)}</div> : <p role="status" className="small">{refs.message}</p> : <div className="qv-comparison-art">{concept ? (stage === 'sketch' ? concept.sketches : [concept.main]).map(image => <a key={image.url} href={image.url} target="_blank" rel="noreferrer" aria-label={`放大${image.alt}`}><ConceptPicture image={image} /></a>) : <p className="qv-comparison-empty">设计试稿未匹配当前输入。</p>}</div>}</figure>;
    })}</div></div>
  </section>;
}

export function ReferenceImage({ reference }: { reference: PackagingReference }) {
  const [failed, setFailed] = useState(false);
  return <span className="qv-reference-image">{failed ? <span className="qv-image-failure" role="status">图片暂未载入<br />{reference.title}<br />可通过参考详情的来源链接查看原图。</span> : <img src={reference.image} alt={reference.alt} width={reference.width} height={reference.height} onError={() => setFailed(true)} />}</span>;
}
