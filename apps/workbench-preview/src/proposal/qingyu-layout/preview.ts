import type { BriefHistory, ResearchWorkspace } from '../../domain/models';
import type { Proposal } from '../../domain/proposal';
import { resolveQingyuThemesPreview, type QingyuThemesResult } from '../qingyu-themes/preview';
import { qingyuR4Report } from '../qingyu-report/bundle-r4';
import { qingyuR2Report } from '../qingyu-report/bundle-r2';
import type { ResearchInput } from '../deck-studio/research';
import { conceptImages } from '../qingyu-visual/concept-images';
import { strategySummaryBoards, prepareStrategySummary } from '../qingyu-strategy/summary';
import liveStrategy from '../qingyu-strategy/summary.ts?raw';
import liveIntersection from '../qingyu-strategy/intersection-page.ts?raw';
import livePrices from '../qingyu-report/content-r2.json?raw';
import sealedPrices from './basis-prices.txt?raw';
import liveCopy from '../qingyu-themes/reviewed-copy.json?raw';
import liveConcept from '../qingyu-visual/concept-images.ts?raw';
import sealedStrategy from './basis-strategy.txt?raw';
import sealedIntersection from './basis-intersection.txt?raw';
import sealedCopy from './basis-copy.txt?raw';
import sealedConcept from './basis-concept.txt?raw';
import manifest from './manifest.json';

export type LayoutSource = { proposal: Proposal; workspace: ResearchWorkspace; history: BriefHistory };
type Themes = Exclude<QingyuThemesResult, { kind: 'unavailable' }>;
export type QingyuLayoutInput = { themes: Themes; research: ResearchInput; brief: BriefHistory['versions'][number]; context: string };
export type QingyuLayoutResult =
  | { kind: 'current'; input: QingyuLayoutInput; context: string }
  | { kind: 'historical'; input: QingyuLayoutInput; context: string; latestBriefVersion: number | null }
  | { kind: 'unavailable'; message: string };
export function isQingyuLayoutProposal(proposal: Proposal) {
  return proposal.id === 'qingyu-pack' && proposal.workbenchId === 'qingyu' && proposal.type === 'packaging' && proposal.layout === null;
}
export function resolveQingyuLayout(source: LayoutSource): QingyuLayoutResult {
  if (!isQingyuLayoutProposal(source.proposal)) return { kind: 'unavailable', message: '此排版预览仅对应青屿包装案例，不能替换正式排版。' };
  if (livePrices !== sealedPrices || liveStrategy !== sealedStrategy || liveIntersection !== sealedIntersection || liveCopy !== sealedCopy || liveConcept !== sealedConcept) return { kind: 'unavailable', message: '策略、文案或图像登记已不同于封存输入，请重新核对排版依据。' };
  const themes = resolveQingyuThemesPreview(source);
  if (themes.kind === 'unavailable') return { kind: 'unavailable', message: themes.message };
  if (qingyuR4Report.kind !== 'valid' || qingyuR2Report.kind !== 'valid') return { kind: 'unavailable', message: '原研究材料不完整，不能准备排版。' };
  const brief = source.history.versions.find(item => item.version === themes.preview.brief.basisVersion);
  if (!brief) return { kind: 'unavailable', message: '原任务卡缺失，不能准备排版。' };
  const research: ResearchInput = { report: qingyuR4Report.report, prices: qingyuR2Report.report, historical: themes.kind === 'historical', latestBriefVersion: themes.preview.brief.latestVersion };
  const context = JSON.stringify({ source, themes, research, strategySummaryBoards, conceptImages, manifest });
  const input: QingyuLayoutInput = { themes, research, brief, context };
  return themes.kind === 'current' ? { kind: 'current', input, context } : { kind: 'historical', input, context, latestBriefVersion: themes.latestBriefVersion };
}
export { prepareStrategySummary };
