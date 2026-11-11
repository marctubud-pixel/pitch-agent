import { useState } from 'react';
import { useServiceQuery } from '../../app/query';
import type { Claim, ResearchWorkspace } from '../../domain/models';
import type { ResearchMethodNode } from '../../domain/researchMethod';
import { ResearchFigureView } from './figures';
import { projectResearch, reviewLabel, sourceLabels, supportLabels, type MethodProjection } from './project';
import { engineeringFigures } from './samples';
import '../../styles/research-method.css';

const lensLabels = { A: '一', B: '二', D: '三' };

export function ResearchMethodView({ workspace, onClaim, onOpenChecks }: { workspace: ResearchWorkspace; onClaim: (claimId: string) => void; onOpenChecks: () => void }) {
  const pid = workspace.project.id;
  const history = useServiceQuery(`research-method-briefs:${pid}`, s => s.getBriefHistory(pid), { projectId: pid });
  const method = projectResearch(workspace, history.data ?? null);
  const [gallery, setGallery] = useState({ identity: method.identity, open: false });
  const galleryOpen = gallery.identity === method.identity && gallery.open;
  const brief = method.brief;
  const inputs = method.nodes.filter(n => n.kind === 'input');
  const synthesis = method.nodes.find(n => n.kind === 'synthesis');
  return <section className="research-method" data-method-state={method.planState} data-artifact-id={workspace.artifact?.id ?? ''} aria-labelledby="rm-heading">
    <header className="rm-header"><div><p className="rm-kicker">研究方法 · 证据与机会</p><h2 id="rm-heading">先看清，再提出方向</h2><p>行业与人群、竞争与替代、产品与视觉三个视角并列梳理，再汇合为待验证的机会假设。</p></div><button type="button" className="btn btn--secondary btn--sm" onClick={onOpenChecks}>打开研究工作区</button></header>
    <div className="rm-binding"><strong>{method.artifactLabel}</strong><span>{workspace.artifact ? `依据简报第${workspace.artifact.basedOn.briefVersion}版` : brief ? `当前简报第${brief.version}版` : '简报版本尚未取得'}</span><span>{method.planState === 'recorded' ? '本版研究问题已记录' : method.planState === 'legacy' ? '既有报告 · 按方法整理的只读视图' : method.planState === 'mismatch' ? '研究问题计划与报告依据不一致' : workspace.artifact ? '尚未取得报告所用简报' : '问题框架 · 尚无研究发现'}</span></div>
    {workspace.artifact?.simulated && <p className="rm-note">当前为本地演示数据，资料与核验状态按本版报告显示。</p>}
    {history.status === 'loading' && <p role="status" className="rm-note">正在读取本报告对应的历史简报，暂不套用最新任务范围。</p>}
    {(history.status === 'error' || history.refreshError) && <p role="alert" className="rm-alert">简报读取失败{history.refreshError ? '，显示上次成功读取的版本' : '，研究范围未知'}。<button type="button" className="btn btn--secondary btn--sm" onClick={history.refetch}>重试读取简报</button></p>}
    {history.status === 'success' && workspace.artifact && !brief && <p className="rm-alert">未找到简报第{workspace.artifact.basedOn.briefVersion}版的历史记录。保留报告论点，产品与视觉条件不从新简报借用。</p>}
    {method.stale && <p className="rm-alert" data-method-stale="true">报告依据已需更新：本报告仍按简报第{workspace.artifact?.basedOn.briefVersion}版解读{method.latestBrief ? `，当前任务为简报第${method.latestBrief.version}版` : ''}。{workspace.artifact?.staleReason ?? '请在既有研究工作区重新生成并核验。'}</p>}
    {brief && <details className="rm-context" open={!workspace.artifact}><summary>品牌与任务条件 · {brief.brand || '品牌尚未记录'}</summary><dl><div><dt>解释范围</dt><dd>简报第{brief.version}版 · {brief.proposalType === 'packaging' ? '包装设计' : brief.proposalType === 'kv' ? '主视觉 KV' : '产品与视觉研究（提案类型未记录）'}</dd></div><div><dt>背景</dt><dd>{brief.background || '尚未记录'}</dd></div><div><dt>目标人群</dt><dd>{brief.audience || '尚未记录'}</dd></div><div><dt>交付内容</dt><dd>{brief.deliverables.join('；') || '尚未记录'}</dd></div><div><dt>限制条件</dt><dd>{brief.constraints.join('；') || '尚未记录，不能理解为没有限制'}</dd></div></dl></details>}
    <div className="rm-method-flow" aria-label="三个并列研究视角汇入机会假设">{inputs.map(n => <a key={n.id} href={`#rm-lens-${n.id}`} onClick={e => { e.preventDefault(); document.getElementById(`rm-lens-${n.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span className="rm-lens-id">{lensLabels[n.id]}</span><strong>{n.title}</strong><span>{n.questions[0]}</span></a>)}<div className="rm-converge"><span>三个研究视角 → 综合</span><strong>{synthesis?.title ?? '机会假设'}</strong><span>汇合观察、边界和待验证方向</span></div></div>
    <div className="rm-section-title"><div><p className="rm-kicker">当前报告可视化</p><h3>让依据与缺口一起可见</h3></div><span>{method.figures.length ? `${method.figures.length} 张依据图` : '数据尚未形成'}</span></div>
    {method.figures.length ? <div className="rm-figures">{method.figures.map(f => <div className="rm-figure-wrap" key={f.id}><ResearchFigureView figure={f} />{f.origin.kind === 'project' && <div className="rm-figure-links">{f.origin.claimIds.map((id, i) => <button type="button" key={id} className="rm-evidence-link" data-claim-trigger={id} onClick={() => onClaim(id)}>{f.id === 'store-observation' ? '查看演示走查记录（相关论点及来源）' : `查看论点 ${method.claims.findIndex(c => c.id === id) + 1 || i + 1} 及来源`} ↗</button>)}</div>}</div>)}</div> : <div className="rm-unanswered"><strong>{workspace.artifact ? '当前报告尚无可追溯论点' : '先回答真实问题，再形成图表'}</strong><p>行业规模、受众痛点、支付意愿及竞品位置仍未知。下方保留本项目研究问题；取得可追溯材料后再绘制相应图表。</p><button type="button" className="btn btn--secondary btn--sm" onClick={onOpenChecks}>打开研究工作区</button></div>}
    {method.attachmentReason && <p className="rm-note" data-numeric-attachment="unavailable">{method.attachmentReason}</p>}
    <div className="rm-lenses">{inputs.map(n => <Lens key={n.id} node={n} method={method} onClaim={onClaim} />)}</div>
    <section className="rm-synthesis" aria-labelledby="rm-synthesis-heading"><p className="rm-kicker">综合 · 汇合三个研究视角</p><h3 id="rm-synthesis-heading">{synthesis?.title ?? '机会假设'}仍需验证</h3><p>{method.observations.length ? '可以从已支持的观察提出方向候选；缺失、部分支持和未核验的依据必须随候选一起保留。最终定位、取舍与行动计划在策略阶段形成。' : method.claims.length ? '当前论点仍待核验，尚无引用完整且核验有效的观察可供汇合。先补证并核验，再提出机会假设。' : '尚无研究发现可供汇合。先补齐三类问题的可追溯依据，再提出机会假设。'}</p>{synthesis && <details className="rm-questions"><summary>综合问题与待补依据</summary><ul>{synthesis.questions.map(question => <li key={question}>{question}</li>)}</ul></details>}<div className="rm-review-states"><span>证据核验：{reviewLabel(workspace.verification, workspace.artifact)}</span><span>充分性评审：{reviewLabel(workspace.readiness, workspace.artifact)}</span></div></section>
    <section className="rm-gallery" aria-label="独立工程图表示例"><div><h3>探索更多图表形式</h3><p>市场范围、趋势、人群、竞争、视觉与风险。以下均为独立工程示例，不属于本项目研究。</p></div><button type="button" className="btn btn--secondary btn--sm" aria-expanded={galleryOpen} aria-controls="rm-gallery-content" onClick={() => setGallery({ identity: method.identity, open: !galleryOpen })}>{galleryOpen ? '收起图表示例' : '查看图表示例'}</button>{galleryOpen && <div id="rm-gallery-content" className="rm-gallery-content"><p className="rm-alert">独立工程示例 · 所有数值、颜色及对象均为虚构示例。不会进入当前证据、机会假设、评审或放行。</p><div className="rm-figures">{engineeringFigures.map(f => <ResearchFigureView key={f.id} figure={f} />)}</div></div>}</section>
  </section>;
}

function Lens({ node, method, onClaim }: { node: Extract<ResearchMethodNode, { kind: 'input' }>; method: MethodProjection; onClaim: (claimId: string) => void }) {
  const claims = method.claims.filter(c => node.topics.includes(c.topic));
  const supported = method.observations.filter(claim => node.topics.includes(claim.topic));
  return <section className="rm-lens" id={`rm-lens-${node.id}`} aria-labelledby={`rm-lens-title-${node.id}`}><header><span className="rm-lens-id">{lensLabels[node.id]}</span><div><h3 id={`rm-lens-title-${node.id}`}>{node.title}</h3><p>{claims.length ? `${supported.length} 条引用完整且核验有效的观察 · ${claims.length - supported.length} 条仍需核验或补证` : node.id === 'D' && method.brief ? '品牌与任务条件已记录 · 研究发现仍待补充' : '尚无研究发现'}</p></div></header><p className="rm-verdict"><strong>当前判断：</strong>{supported[0]?.text ?? (claims.length ? '现有判断仍缺乏充分支持，尚不能作为设计结论。' : '尚未形成有证据支持的研究判断。')}</p><details className="rm-questions"><summary>研究问题与待补依据</summary><ul>{node.questions.map(q => <li key={q}>{q}</li>)}</ul></details><p className="rm-implication"><strong>对设计的意义：</strong>{!supported.length ? '先取得完整依据并完成有效核验，暂不将现有问题或论点写成设计结论。' : supported.length === claims.length ? '可作为方向候选的依据，仍需保留研究范围并在策略阶段作出取舍。' : '可参考已支持的观察；其余判断应先补证，不能直接转为设计承诺。'}</p>{claims.map(claim => <ClaimFinding key={claim.id} claim={claim} method={method} onClaim={onClaim} />)}{!claims.length && <p className="rm-note">缺口：{node.id === 'D' && method.brief ? '简报中的产品条件不是已完成的产品或视觉研究，尚需材料与可追溯论点。' : '缺少能回答这些问题的论点与来源。'}</p>}</section>;
}

function ClaimFinding({ claim, method, onClaim }: { claim: Claim; method: MethodProjection; onClaim: (claimId: string) => void }) {
  return <details className="rm-claim" data-support={claim.supportStatus}><summary><span className="rm-status">{supportLabels[claim.supportStatus]}</span><span>{claim.text}</span></summary><div className="rm-claim-body"><p><strong>依据：</strong>{claim.sourceIds.length ? claim.sourceIds.map(id => { const source = method.sources.find(s => s.id === id); return source ? `${source.title}（${sourceLabels[source.verificationStatus]}${source.isSampleLink ? '，工程模拟来源' : ''}）` : '来源记录缺失'; }).join('；') : '没有引用来源'}</p><p><strong>限制与缺口：</strong>{claim.limitations.join('；') || '未额外记录限制；支持范围仍以来源摘录为准。'}{!method.observations.includes(claim) && ' 当前引用或有效核验尚未满足，不能作为已证实观察。'}</p><button type="button" className="rm-evidence-link" data-claim-trigger={claim.id} onClick={() => onClaim(claim.id)}>查看论点与来源原文 ↗</button></div></details>;
}
