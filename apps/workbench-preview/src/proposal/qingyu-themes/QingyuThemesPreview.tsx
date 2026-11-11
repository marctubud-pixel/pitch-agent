import type { CSSProperties } from 'react';
import { useServiceQuery } from '../../app/query';
import type { Proposal } from '../../domain/proposal';
import { inkOn } from '../color';
import { qingyuCopyDraft, resolveQingyuThemesPreview, type QingyuThemesResult } from './preview';
import { readingMean, roleNames, type CopyRound, type CopyScale, type Evidence, type Rating, type ReviewItem } from './content';
import '../qingyu-strategy/strategy.css';
import './themes.css';

export function QingyuThemesPreview({ proposal }: { proposal: Proposal }) {
  const pid = proposal.workbenchId;
  const ws = useServiceQuery(`research:${pid}`, service => service.getResearchWorkspace(pid), { projectId: pid });
  const briefs = useServiceQuery(`research-case-briefs:${pid}`, service => service.getBriefHistory(pid), { projectId: pid });
  const retry = () => { ws.refetch(); briefs.refetch(); };
  if (ws.status === 'error' || briefs.status === 'error') return <Unavailable message="研究或任务卡读取失败，暂不能核对文案依据。" retry={retry} />;
  if (!ws.data || !briefs.data) return <p className="qs-status" role="status">正在核对研究与任务卡依据…</p>;
  const result = resolveQingyuThemesPreview({ proposal, workspace: ws.data, history: briefs.data });
  return <>
    {(ws.refreshing || briefs.refreshing) && <p className="qs-status" role="status">正在重新读取研究与任务卡，以下仍是上次成功读取的依据。</p>}
    {(ws.refreshError || briefs.refreshError) && <p className="qs-status" role="alert">刷新失败，以下保留上次成功读取的依据，尚未重新核对。<button type="button" className="text-link" onClick={retry}>重试读取依据</button></p>}
    <QingyuThemesResultView result={result} retry={retry} />
  </>;
}

function Unavailable({ message, retry }: { message: string; retry: () => void }) {
  return <section className="qs-status" data-copy-status="unavailable" role="alert"><p>{message}</p><button type="button" className="btn btn--secondary btn--sm" onClick={retry}>重新核对依据</button></section>;
}

const palette = ['#002FA7', '#587650', '#315F93'];
const verdictNames: Record<ReviewItem['decision'], string> = { pass: '岗位范围内达到本轮要求', revise: '需修改', hold: '待核', reject_use: '不建议使用' };
const fieldNames: Record<string, string> = {
  oldQuote: '修改前', newQuote: '修改后', sourceRole: '提出角色', r1Disposition: '前轮处置', entries: '修改对应', respondsTo: '回应原版', swapReadings: '互换核验', proposition: '方向主张', mechanism: '创意机制', strategyLink: '策略关联', audienceHypothesis: '用户情景假设', brandBridge: '品牌联系', extensions: '延展表达', risk: '风险', whyDistinct: '区别所在', setDifference: '三案比较', evidenceRefs: '依据引用', factualScope: '事实范围', issues: '具体异议', set_issues: '整组异议', hard_rejects: '硬退项', positive_claims: '具体肯定', evidence: '文字依据', quotes: '引用', reason: '理由', suggested_action: '修改建议', requested_action: '请求原岗核查', blocking: '当前阻断', severity: '严重度', scope: '适用范围', scope_limit: '适用边界', limits: '边界', limitations: '边界说明', boundaries: '范围边界', pairwise: '逐对比较', pairwise_check: '逐对核验', set_decision: '整组原评结论', set_reason: '整组理由', unresolved: '未决问题', decision: '岗位结论', first_read: '封存首读', text: '内容', label: '位置', comparison_ids: '比较方向', distinction: '差别', swap_ab: '主副文互换后的第一种组合', swap_ba: '主副文互换后的另一种组合', response: '回应', original: '原评记录', current_independent_judgment: '原岗当前独立判断', score: '分数', scores: '评分项', status: '状态', issue_status: '异议状态', dimension: '评分维度', dimension_id: '评分维度', required: '必评项', group: '评分组', items: '逐案记录', previous_issues: '前轮问题对应', challenges: '配对异议', retained_claims: '核验后保留的肯定', coverage: '覆盖核验', observations: '独立观察', independent_risks: '独立风险', claim_text: '被核验的肯定', verification: '核验理由', assessment: '核验判断', impact: '影响', objection: '异议理由', consequence: '可能后果', counterevidence_and_limits: '反证与限制', classification: '异议性质', target_type: '核查对象', target_score: '对应原分', target_dimension_id: '对应维度', paired_report_assertion: '配对原评的主张', paired_coverage: '原评覆盖情况', detail: '具体说明', note: '说明', new_valid_blocker: '是否新增有效阻断', new_valid_blockers: '新增有效阻断', new_blocker: '是否新增阻断', new_issue: '是否新增问题', stage: '阶段', role: '岗位', model_id: '模型名称', calibration: '尺度校准', quality_scale: '质量尺度', interpretation: '尺度解释', scale: '评分尺度', fact_check: '事实核验', first_read_preservation: '首读保留说明', review_independence: '评审独立性', independence: '独立性说明', factual_scope: '事实范围', literal_comprehension: '直接理解', choice_context: '选茶情景', set_check: '整组核验', three_mechanisms: '三种机制', swap_diagnostic: '互换诊断', brand_swap_diagnostic: '换品牌诊断', finding: '发现', currentBlocking: '当前阻断', current: '当前记录', accepted: '采纳', rejected: '未采纳', deferred: '延后', revisions: '修改记录', changes: '修改对应', action: '处理方式', resolution: '处理结论', disposition: '处置', recommendation: '建议', reasons: '理由', tradeoffs: '取舍', conclusions: '结论', conditions: '适用条件', next_step: '下一步', next_steps: '下一步', name: '方向名称', slogan: '主文案', subline: '副文案', rationale: '创作理由', backup: '备选短句', strategy: '承接策略', directions: '三方向', min: '最低分', max: '最高分', comparison_scope: '比较范围', result: '核验结果', first_risk_mapping: '首查风险对应', scope_observation_mapping: '范围观察对应', first_observation: '首查观察', preferences: '偏好说明', scope_clarifications: '范围澄清', new_evidence_backed: '新增有据问题', first_risk: '首查风险', retained_count: '保留条数', challenged_count: '异议条数', positive_claim_count: '具体肯定条数', positive_claims_total: '具体肯定总数', independent_risks_count: '独立风险条数', new_valid_blockers_count: '新增有效阻断条数', first_item: '首查对象', paired_report: '配对报告', limitation: '限制', source_boundary: '来源边界', factualScopeNote: '事实范围说明', purpose: '目的', meaning: '含义', test: '核查方法', outcome: '结果', before: '修改前', after: '修改后', why: '修改理由', author_response: '作者回应', remaining_risks: '保留风险', unresolved_items: '未决项', summary: '说明', target: '对应对象', source: '来源', raw: '原始记录', draft: '稿件', responseSource: '裁决与改稿来源', firstRead: '独立首读', firstReadSource: '首读来源', draftSource: '稿件来源', sourceRecords: '封存来源清单', directorSource: '总监来源', roundSources: '逐轮来源', currentDraft: '当前原稿', score_report: '原评报告', input_scope: '输入范围', evidence_scope: '证据范围', acceptance: '采纳情况', rejected_alternatives: '未采纳方案', follow_up: '原岗复核', followUps: '原岗复核说明', rationale_change: '理由调整', final_decision: '最终裁决', disputed: '争议', retained: '保留', resolved: '已处理', new_blockers: '新增阻断', target_issue: '对应异议', issue: '异议', position: '位置', wording: '具体措辞', brand: '品牌', product: '产品', understood: '理解内容', uncertainty: '不确定处', misunderstanding: '可能误读', pair: '比较组合', title: '标题', conclusion: '结论', used_materials: '已用材料', not_claimed: '未签发事项', approval_scope: '裁决范围', adopted: '已采纳', pending: '待核', valid: '有效', invalid: '无效', count: '条数', sentence: '原句', quote: '引用', copy: '文案', direction: '方向', value: '原值', explanation: '解释', expected_effect: '预期假设', user_hypothesis: '用户假设'
};
const enumNames: Record<string, string> = {
  ...verdictNames, accepted_now: '采纳并立即处理', accepted_later: '采纳，延后处理', addressed_in_draft: '已在稿件中回应', 'qingyu-copy-reviewed-r1': '第一轮文案原稿', scored: '已评分', unknown: '待核', not_applicable: '不适用', blocker: '阻断项', major: '主要问题', minor: '次要问题', same_set: '本次同组三案', retained: '保留', covered: '已覆盖', partially_explicit: '部分已明确', already_covered: '原评已覆盖', scope_clarification: '范围澄清', accept: '接受异议', reject: '不采纳', defer: '延后处理', unresolved: '未决', withdraw_blocker: '撤回阻断', pass_within_user_role: '用户岗位范围内达到本轮要求', existing_blocker_scope_dispute: '既有阻断的范围争议', covered_but_blocking_scope_challenged: '已覆盖，但阻断范围被提出异议', covered_within_user_role: '用户岗位范围内已覆盖', blocking_issue_and_dimension_rationale: '阻断理由与维度依据', direction: '方向', copy: '文案', brand: '品牌', user: '用户模拟', comms: '传播', slogan: '文案与主题', benefit_emotion: '利益或情绪的具体可理解性', selection_context: '与设定选择情景的关联', direct_understanding: '直接理解', credible_language: '语言可信与不费解', independent_risks_before_score: '阅分前独立漏项首查', first_missed_risk: '独立漏项首查', independent_missed_risks_first: '独立漏项首查', accepted: '已采纳', rejected: '未采纳', deferred: '已延后', resolved: '已处理', pending: '待核', not_reviewed: '尚未评', unavailable: '暂不可用', approve: '按所列范围采纳', conditional: '附条件意见', keep: '保留', revise_and_recheck: '修改后复核'
};
const technicalField = /(?:^id$|(?:_|^)(?:sha256|hash|path|version|model|report_id|run_id|input_root|candidate_id|item_id|claim_id|issue_id|challenge_id)$|(?:Id|Source|Records)$|^schema|^input_hashes$|^inputsSeen$|^reference|^source$|^sourceRecords$)/;
const proseFields = new Set(['text', 'evidence', 'quotes', 'quote', 'reason', 'note', 'detail', 'limits', 'limitations', 'scope', 'scope_limit', 'objection', 'suggested_action', 'requested_action', 'proposition', 'mechanism', 'strategyLink', 'audienceHypothesis', 'brandBridge', 'risk', 'whyDistinct', 'distinction', 'finding', 'impact', 'consequence', 'verification', 'assessment']);
function RecordText({ value, field = '', technical = false }: { value: Evidence; field?: string; technical?: boolean }) {
  if (value === null) return <span>未记录</span>;
  if (Array.isArray(value)) return value.length ? <ul className="qy-record-list">{value.map((item, index) => <li key={index}><RecordText value={item} field={field} technical={technical} /></li>)}</ul> : <span>无</span>;
  if (typeof value === 'object') return <dl className="qy-record">{Object.entries(value).filter(([key]) => technical || !technicalField.test(key)).map(([key, item]) => <div key={key}><dt>{technical ? key : fieldNames[key] ?? '补充说明'}</dt><dd><RecordText value={item} field={key} technical={technical} /></dd></div>)}</dl>;
  if (typeof value === 'boolean') return <span>{value ? '是' : '否'}</span>;
  if (typeof value === 'number' || technical) return <span>{String(value)}</span>;
  const displayed = enumNames[value] ?? (!proseFields.has(field) && /^[a-z][a-z0-9_-]*$/i.test(value) ? '原始标记（详见技术记录）' : value);
  return <span>{displayed}</span>;
}

function without(value: { [key: string]: Evidence }, keys: string[]) { return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))); }

function ratingText(rating: Rating): string {
  switch (rating.status) {
    case 'scored': return String(rating.score);
    case 'unknown': return '待核';
    case 'not_applicable': return '不适用';
    default: { const exhaustive: never = rating; return exhaustive; }
  }
}

function RoundReviews({ round, scale }: { round: CopyRound; scale: CopyScale | null }) {
  return <div className="qy-review-round" data-review-round={round.id}>
    <p className="qy-review-note">1 至 5 分为本轮模型内部尺度。方向与文案分别列出原始必评项。原评展示均分只便于阅读，不代替逐项要求、当前阻断、独立总监意见或用户选择。</p>
    {round.reviews.map(review => <section className="qy-role" key={review.role} data-review-role={review.role}>
      <h3>{roleNames[review.role]}独立评分 · 原评记录</h3><p className="pw-label">模型 {review.model}</p>
      {review.items.map(item => <section className="qy-role-direction" key={item.id}>
        <h4>{round.directions.find(direction => direction.id === item.id)?.name} <span>· {verdictNames[item.decision]}</span></h4>
        {(['direction', 'copy'] satisfies Array<'direction' | 'copy'>).map(group => <div className="qy-score-group" key={group}>
          <h5>{group === 'direction' ? '方向评分' : '文案评分'}</h5><p className="qy-mean">{readingMean(item.scores, group, scale)}</p>
          <ul className="qy-score-list">{item.scores.filter(score => score.group === group).map(score => <li key={score.dimension}>
            <div className="qy-score-title"><strong>{score.dimension}</strong><span data-score-status={score.status}>{ratingText(score)}{score.status === 'scored' ? ' / 5' : ''} · 必评项</span></div>
            <RecordText value={score.evidence} />
          </li>)}</ul>
        </div>)}
        <RecordText value={without(item.raw, ['id', 'scores'])} />
      </section>)}
      {review.followUps.map((followUp, index) => <aside className="qy-follow-up" data-review-follow-up={review.role} key={index}>
          <h4>原岗复核说明</h4>
          <p className="qy-follow-up-change">「{followUp.presentation.directionName}」 · {followUp.presentation.dimensionName}：原分 {ratingText(followUp.presentation.original)} → 原岗复核 {ratingText(followUp.presentation.current)}</p>
          <p>这是原评分岗位的独立复核，未改写原评表和原始判定，不是总控调分。生效范围以独立总监裁决为准；本页原评展示均分仍只使用原分。</p>
          <RecordText value={followUp.raw} />
          <details className="qy-source"><summary>原岗复核原始字段与来源 · 技术记录</summary><RecordText technical value={{ raw: followUp.raw, source: followUp.source }} /></details>
        </aside>)}
      <details className="qy-source"><summary>原评整组判断与报告记录</summary><RecordText value={review.raw} /><details><summary>原评原始字段与来源 · 技术记录</summary><RecordText technical value={{ raw: review.raw, source: review.source }} /></details></details>
    </section>)}
    <h3>四角色独立对抗</h3>
    {round.critics.map(critic => <section className="qy-role" key={critic.role} data-critic-role={critic.role}><h4>{roleNames[critic.role]}配对对抗</h4><details><summary>封存的独立首读</summary><RecordText value={critic.firstRead} /></details><RecordText value={critic.raw} /><details className="qy-source"><summary>对抗原始字段与来源 · 技术记录</summary><RecordText technical value={{ raw: critic.raw, firstRead: critic.firstRead, source: critic.source, firstReadSource: critic.firstReadSource }} /></details></section>)}
  </div>;
}

export function QingyuThemesResultView({ result, retry }: { result: QingyuThemesResult; retry: () => void }) {
  if (result.kind === 'unavailable') return <Unavailable message={result.message} retry={retry} />;
  const { bundle, brief } = result.preview;
  const round = bundle.currentRound;
  const recommended = round.directions.find(direction => direction.id === bundle.recommendation.directionId);
  return <article className="pw-themes tx qy-copy" data-copy-preview={bundle.id} data-copy-context={result.kind} data-copy-status="model-reviewed" aria-labelledby="qy-copy-title">
    <header><p className="pw-label">青屿 · 文案与主题</p><h2 id="qy-copy-title">三种方向，三种说法</h2><p className="qy-simulation">四角色独立 AI 模拟评审 · 文字概念阶段。未经真实消费者验证，不代表客户批准；当前尚未获选。</p></header>
    {result.kind === 'historical' && <aside className="qs-history" role="status"><strong>历史依据预览</strong><p>本稿基于任务卡第 {brief.basisVersion} 版。{result.latestBriefVersion === null ? '当前任务卡缺失。' : `最新任务卡为第 ${result.latestBriefVersion} 版。`}尚未按最新依据重写，请勿作为当前任务结论。</p></aside>}
    <ul className="tx-cards">
      {round.directions.map((direction, index) => {
        const color = palette[index] ?? '#002FA7';
        const style: CSSProperties & { '--dir': string; '--dir-ink': string } = { '--dir': color, '--dir-ink': inkOn(color) };
        return <li key={direction.id} className="tx-card" data-copy-direction={direction.id} style={style}>
          <div className="tx-card__top"><span className="tx-chip">方向{['一', '二', '三'][index]}</span><h3 className="tx-card__name">{direction.name}</h3></div>
          <div className="tx-card__panel"><p className="tx-card__slogan">{direction.slogan}</p><p className="tx-card__sub">{direction.subline}</p></div>
        </li>;
      })}
    </ul>
    <aside className="qy-recommendation" data-director-recommendation={bundle.recommendation.directionId}><p className="pw-label">独立总监建议 · 可讨论意见</p><h3>建议优先讨论「{recommended?.name}」</h3><ul>{bundle.recommendation.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></aside>
    <details className="qs-evidence" data-copy-section="derivation"><summary>推导与三案比较</summary>
      {round.directions.map(direction => <section key={direction.id}><h3>{direction.name}</h3><RecordText value={without(direction.raw, ['id', 'name', 'slogan', 'subline'])} /></section>)}
      <RecordText value={without(round.draft, ['directions', 'schemaVersion', 'draftId', 'basedOnStrategyDraftId'])} />
      <h3>总监建议的取舍与范围</h3><RecordText value={bundle.recommendation.tradeoffs} /><p>{bundle.recommendation.scope}</p>
      <details><summary>独立总监原始结论</summary><RecordText value={bundle.recommendation.rawDirector} /></details>
    </details>
    <details className="qs-evidence" data-copy-section="reviews"><summary>四角色具体评分、异议与配对对抗</summary><RoundReviews round={round} scale={bundle.scale} /></details>
    <details className="qs-evidence" data-copy-section="history"><summary>版本与修改记录</summary>
      <p>每轮评分仅对应该轮封存稿，不继承为新版通过。当前显示 {round.id}。单岗位结论和阅读均分均不代表总体批准。</p>
      {bundle.rounds.map(item => <section className="qy-history-round" key={item.id}><h3>{item.id}{item.id === round.id ? ' · 当前稿' : ' · 历史稿'}</h3><h4>裁决与改稿记录</h4><RecordText value={item.response} />{item.id !== round.id && <><details><summary>该轮原稿</summary><RecordText value={item.draft} /></details><details><summary>该轮评分与配对对抗</summary><RoundReviews round={item} scale={bundle.scale} /></details></>}</section>)}
      <details><summary>最早第一稿原件 · 未套用本轮评审</summary><RecordText value={qingyuCopyDraft} /></details>
      <details className="qy-source"><summary>依据与封存身份记录</summary>
        <p>虚构青屿案例，配方使用虎跑泉水为用户设定。待补具体茶种、完整配料与水源使用凭据。研究依据 R4，任务卡第 {brief.basisVersion} 版{brief.basisConfirmed ? '（已确认）' : '（未确认）'}。正式文案与主题阶段未开始，业务状态未变更。</p>
        <p>{bundle.identity.scope}</p><p>来源对应关系由本地构建核验；本页面只读取封存包，不会重新运行评审或读取本地源文件进行密码学核验。</p>
        <RecordText technical value={{ bundleId: bundle.id, strategyDraftId: bundle.basedOnStrategyDraftId, researchSha256: bundle.researchSha256, sourceRecords: bundle.identity.sourceRecords, directorSource: bundle.recommendation.source, scale: bundle.scale, roundSources: bundle.rounds.map(item => ({ id: item.id, draftSource: item.draftSource, responseSource: item.responseSource })), currentDraft: round.draft, rawDirector: bundle.recommendation.rawDirector, roundResponses: bundle.rounds.map(item => ({ id: item.id, response: item.response })), earliestDraft: qingyuCopyDraft }} />
      </details>
    </details>
  </article>;
}
