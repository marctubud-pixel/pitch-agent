import reviewedCopy from './reviewed-copy.json';
import { parseCopyBundle, type CopyBundle } from './content';
import type { BriefHistory, ResearchWorkspace } from '../../domain/models';
import type { Proposal } from '../../domain/proposal';
import { resolveQingyuStrategyPreview, type QingyuStrategyPreview, type StrategyPreviewResult } from '../qingyu-strategy/preview';
import { strategySummaryIdentity } from '../qingyu-strategy/summary';

export const qingyuCopyDraft = {
  id: 'qingyu-copy-owner-first-draft-20261110-v1',
  basedOnStrategyDraftId: 'qingyu-strategy-owner-summary-20261110-v1',
  strategy: '放大虎跑泉用水，让青屿的产品选择更具体。',
  directions: [
    { id: 'water-origin', label: '方向一', name: '水有来处', color: '#002FA7', slogan: '一瓶茶，水有来处。', subline: '青屿无糖茶，配方使用虎跑泉水。', rationale: '以“来处”引起对用水特点的兴趣，副文直接交代具体水源。', backup: '这瓶茶，也讲水的来处。' },
    { id: 'hupao-in-a-bottle', label: '方向二', name: '一瓶茶里的虎跑', color: '#587650', slogan: '虎跑泉水，\n在这一瓶青屿里。', subline: '青屿无糖茶 · 配方使用虎跑泉水。', rationale: '直接让虎跑泉用水与青屿同屏，明确产品事实与品牌的联系。', backup: '青屿这一瓶，配方使用虎跑泉水。' },
    { id: 'talk-about-water', label: '方向三', name: '也说说它的水', color: '#315F93', slogan: '说到这瓶茶，\n也说说它的水。', subline: '青屿无糖茶，配方使用虎跑泉水。', rationale: '以对话语气把注意从一般茶味引向用水，具体事实由副文说明。', backup: '选茶时，也看看水的来处。' },
  ],
};

type CopyPreview = { bundle: CopyBundle; basis: QingyuStrategyPreview['basis']; brief: QingyuStrategyPreview['brief'] };
export type QingyuThemesResult =
  | { kind: 'current'; preview: CopyPreview }
  | { kind: 'historical'; preview: CopyPreview; latestBriefVersion: number | null }
  | Extract<StrategyPreviewResult, { kind: 'unavailable' }>;

export function resolveQingyuThemesPreview(input: { proposal: Proposal; workspace: ResearchWorkspace; history: BriefHistory }): QingyuThemesResult {
  const { proposal } = input;
  if (proposal.id !== 'qingyu-pack' || proposal.workbenchId !== 'qingyu' || proposal.type !== 'packaging' || proposal.themes !== null) {
    return { kind: 'unavailable', reason: 'proposal-mismatch', message: '此文案初稿仅对应青屿包装案例的未开始文案与主题，不能套用到其他提案或正式文案。' };
  }
  if (qingyuCopyDraft.basedOnStrategyDraftId !== strategySummaryIdentity.draftId) return { kind: 'unavailable', reason: 'draft-invalid', message: '当前策略稿已更换，本篇文案尚未按新策略重写，暂不展示正文。' };
  const strategy = resolveQingyuStrategyPreview(input);
  if (strategy.kind === 'unavailable') return strategy;
  const parsed = parseCopyBundle(reviewedCopy, { strategyDraftId: strategySummaryIdentity.draftId, researchSha256: strategy.preview.basis.research.contentSha256 });
  if (parsed.kind === 'invalid') return { kind: 'unavailable', reason: 'draft-invalid', message: `文案封存记录暂不可用：${parsed.message}。` };
  const preview: CopyPreview = { bundle: parsed.bundle, basis: strategy.preview.basis, brief: strategy.preview.brief };
  return strategy.kind === 'current' ? { kind: 'current', preview } : { kind: 'historical', preview, latestBriefVersion: strategy.latestBriefVersion };
}
