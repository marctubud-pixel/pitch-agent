import type { BriefHistory, ResearchWorkspace } from '../../domain/models';
import type { Proposal, StageId } from '../../domain/proposal';
import { resolveQingyuThemesPreview } from '../qingyu-themes/preview';
import { conceptImages } from '../qingyu-visual/concept-images';
import type { ReadingDocument, ReadingIssue } from '../content-review/model';
import ownerReading from './owner-reading.json';
import directorReading from './director-reading.json';
import ownerRaw from './owner-reading.json?raw';
import ownerBasis from './basis-owner.txt?raw';
import strategyRaw from '../qingyu-strategy/summary.ts?raw';
import intersectionRaw from '../qingyu-strategy/intersection-page.ts?raw';
import copyRaw from '../qingyu-themes/reviewed-copy.json?raw';
import visualRaw from '../qingyu-visual/concept-images.ts?raw';
import strategyBasis from './basis-strategy.txt?raw';
import intersectionBasis from './basis-intersection.txt?raw';
import copyBasis from './basis-copy.txt?raw';
import visualBasis from './basis-visual.txt?raw';

export type ContentReadingResult =
  | { kind: 'current'; reading: ReadingDocument; briefVersion: number }
  | { kind: 'historical'; reading: ReadingDocument; briefVersion: number; latestBriefVersion: number | null }
  | { kind: 'unavailable'; message: string };

export function isQingyuContentReading(proposal: Proposal): boolean {
  return proposal.id === 'qingyu-pack' && proposal.workbenchId === 'qingyu' && proposal.type === 'packaging' && proposal.contentReview === null && proposal.stages.content_review.status === 'not_started';
}

function issueStages(category: string): StageId[] {
  switch (category) {
    case 'text-image-handoff': return ['visual', 'themes'];
    case 'product-evidence': return ['strategy', 'research'];
    case 'research-evidence': return ['research'];
    default: throw new Error('未知审阅问题类型');
  }
}
function readingStage(value: string): StageId {
  switch (value) {
    case 'brief': case 'research': case 'strategy': case 'themes': case 'visual': return value;
    default: throw new Error('未知审阅来源阶段');
  }
}

function readingDocument(): ReadingDocument {
  if (ownerReading.id !== 'qingyu-content-review-owner-r1-20261110' || ownerReading.scope.kind !== 'local-preview-content-review' || ownerReading.scope.formalStageApproval || ownerReading.scope.sourceMutation || ownerReading.summary.contentFreezeGranted || ownerReading.issues.some(issue => issue.upstreamModified || issue.resolutionEvidence !== null || issue.status !== 'open')) throw new Error('审阅范围已变化');
  if (directorReading.ownerReview.id !== ownerReading.id || directorReading.scope.kind !== 'local-preview-coordination-review' || directorReading.scope.formalStageApproval || directorReading.scope.contentFreezeGranted || directorReading.scope.sourceMutation || directorReading.scope.issueClosureGranted || directorReading.narrativeDecision.adopted || ownerRaw !== ownerBasis) throw new Error('统筹复核范围已变化');
  const issues: ReadingIssue[] = ownerReading.issues.map(issue => {
    const decision = directorReading.issueDecisions.find(item => item.issueId === issue.id);
    if (!decision || decision.status !== 'open') throw new Error('缺少同一问题的统筹意见');
    return {
      id: issue.id, title: decision.displayTitle, kind: issue.category === 'text-image-handoff' ? 'revision' : 'evidence', status: decision.statusLabel,
      owner: decision.owner, location: issue.location, impact: issue.impact,
      observation: issue.category === 'text-image-handoff'
        ? '当前视觉页图片旁已显示完整文案，三组包装也已有不同结构的转译。原文案包含瓶侧、电商短句、茶歇提醒与随茶留言的分工，不要求所有主副文都印在瓶身。尚需明确品牌、品类、用水身份与创意语句在各交付触点的位置，并按实际观看条件核对理解是否完整。'
        : decision.reason,
      suggestion: decision.nextStep,
      notes: [{ label: '内容审阅负责人原意见', text: `${issue.title}。${issue.observation} 建议：${issue.suggestion}` }, { label: '比稿智能体复核', text: `${decision.reason} ${decision.notAClaim}` }],
      evidence: [...new Set([...issue.evidenceRefs, ...decision.evidenceRefs])], stages: issueStages(issue.category),
    };
  });
  const images = ownerReading.images.map(image => {
    const concept = conceptImages.find(item => item.directionId === image.directionId);
    if (!concept) throw new Error('审读图片无对应方向');
    const source = image.view === 'main' ? concept.main : image.view === 'mockups' ? concept.mockups : null;
    if (!source || !image.path.endsWith(`${image.id}.png`) || !source.url.endsWith(`${image.id}.png`)) throw new Error('审读图片身份不一致');
    return { id: image.id, directionId: image.directionId, direction: image.directionName, label: image.view === 'main' ? '主图' : '样机', url: source.url, alt: source.alt, observation: image.observation };
  });
  const reviewedCopy = ownerReading.reviewedCopy.map(copy => ({ directionId: copy.directionId, direction: copy.name, slogan: copy.slogan, subline: copy.subline }));
  if (new Set(reviewedCopy.map(copy => copy.directionId)).size !== reviewedCopy.length || images.some(image => !reviewedCopy.some(copy => copy.directionId === image.directionId))) throw new Error('已审文案与图像方向不匹配');
  return {
    id: ownerReading.id, title: directorReading.summary.title, summary: directorReading.summary.text, owner: '内容审阅负责人', ownerSummary: ownerReading.summary.text, coordinator: { kind: 'reviewed', summary: directorReading.handoffSummary.text, details: [directorReading.narrativeDecision.reason, ...directorReading.limits] },
    issues, connections: directorReading.handoffSummary.links.map(item => ({ ...item, from: readingStage(item.from), to: readingStage(item.to) })),
    sections: directorReading.narrativeDecision.sections.map(section => ({ ...section, stage: readingStage(section.stage) })), images, reviewedCopy, changes: [],
    records: [
      { label: '审读范围', text: '当前预览内容及六件主图、样机整板；未签发正式阶段通过或内容冻结。' },
      { label: '输入版本', text: '任务卡第1版 · 研究修订4（待补）· 策略三板块 · 文案第二轮 · 视觉设计试稿。' },
      { label: '原稿处理', text: '本轮未回写上游。建议整理稿、问题与原件分别保留。' },
      { label: '内容原审', text: ownerReading.summary.text },
      { label: '验证边界', text: '本轮已查看三个方向的主图与样机整板；草图、真实触点与效果尚未验证。模拟角色审读不代表真实客户批准或消费者测试。' },
    ],
  };
}

export function resolveQingyuContentReading(input: { proposal: Proposal; workspace: ResearchWorkspace; history: BriefHistory }): ContentReadingResult {
  if (!isQingyuContentReading(input.proposal)) return { kind: 'unavailable', message: '这份审读仅对应青屿当前未启动的内容审阅预览，不套用到其他提案或正式审阅。' };
  const themes = resolveQingyuThemesPreview(input);
  if (themes.kind === 'unavailable') return { kind: 'unavailable', message: themes.message };
  if (strategyRaw !== strategyBasis || intersectionRaw !== intersectionBasis || copyRaw !== copyBasis || visualRaw !== visualBasis) return { kind: 'unavailable', message: '策略、文案或视觉输入已改变，本轮审读不再对应当前稿。请先重新审读。' };
  const basis = ownerReading.basis;
  if (themes.preview.basis.research.contentSha256 !== basis.researchSha256 || themes.preview.bundle.id !== basis.copyBundleId || themes.preview.bundle.currentRound.id !== basis.copyRoundId || themes.preview.brief.basisVersion !== basis.briefVersion) return { kind: 'unavailable', message: '当前资料版本与审读记录不匹配，暂不展示审阅结论。' };
  try {
    const reading = readingDocument();
    return themes.kind === 'current' ? { kind: 'current', reading, briefVersion: basis.briefVersion } : { kind: 'historical', reading, briefVersion: basis.briefVersion, latestBriefVersion: themes.latestBriefVersion };
  } catch {
    return { kind: 'unavailable', message: '审读问题或稿件引用不完整，暂不能展示，请核对原审读记录。' };
  }
}
