import type { BriefHistory, ResearchWorkspace } from '../../domain/models';
import type { Proposal } from '../../domain/proposal';
import { resolveQingyuCase, type QingyuResolution } from '../qingyu-report/binding';
import liveR4 from '../qingyu-report/content-r4.json?raw';
import { parseQingyuR4, r4EvidenceClosure, type QingyuR4Report, type R4EvidenceClosure } from '../qingyu-report/report-r4';
import sealedR4 from './basis-r4.txt?raw';
import { parseStrategyDocument, parseStrategyIdentity, strategyResearchRefs, strategyDocumentRaw, strategyIdentity, type StrategyClaim, type StrategyDocument, type StrategyIdentity, type StrategySupplement } from './content';

export type StrategyInference = StrategyClaim & { research: R4EvidenceClosure; supplements: StrategySupplement[] };
export type QingyuStrategyPreview = {
  basis: { research: Pick<QingyuR4Report, 'id' | 'binding' | 'origin'> & { contentSha256: string }; strategy: StrategyIdentity };
  brief: { basisVersion: number; basisConfirmed: boolean; latestVersion: number | null; latestConfirmed: boolean };
  document: StrategyDocument;
  claims: StrategyInference[];
};

type ExistingRefusal = Extract<QingyuResolution, { kind: 'unavailable' }>;
export type StrategyPreviewResult =
  | { kind: 'current'; preview: QingyuStrategyPreview }
  | { kind: 'historical'; preview: QingyuStrategyPreview; latestBriefVersion: number | null }
  | ExistingRefusal
  | { kind: 'unavailable'; reason: 'proposal-mismatch' | 'r4-mismatch' | 'draft-invalid'; message: string };

export function resolveQingyuStrategyPreview({ proposal, workspace, history }: {
  proposal: Proposal;
  workspace: ResearchWorkspace;
  history: BriefHistory;
}): StrategyPreviewResult {
  if (proposal.id !== 'qingyu-pack' || proposal.workbenchId !== 'qingyu' || proposal.type !== 'packaging' || proposal.strategy !== null) {
    return { kind: 'unavailable', reason: 'proposal-mismatch', message: '此推演仅对应青屿包装案例的未开始策略，不能套用到其他提案或正式策略。' };
  }
  const resolution = resolveQingyuCase({ requestedProjectId: proposal.workbenchId, workspace, history });
  if (resolution.kind === 'unavailable') return resolution;
  if (liveR4 !== sealedR4) return { kind: 'unavailable', reason: 'r4-mismatch', message: '研究R4的内容已不同于本稿封存依据，请先重新审校策略推演。' };
  try {
    const parsed = parseQingyuR4(JSON.parse(liveR4));
    if (parsed.kind === 'invalid') return { kind: 'unavailable', reason: 'r4-mismatch', message: '研究R4未通过完整性检查，暂不展示策略推演。' };
    const report = parsed.report, document = parseStrategyDocument(JSON.parse(strategyDocumentRaw), report);
    const reviewedIdentity = parseStrategyIdentity(strategyIdentity, document, report);
    const claims = document.ledger.claims.map((claim): StrategyInference => ({
      ...claim, research: r4EvidenceClosure(report, strategyResearchRefs(claim, report)),
      supplements: document.supplements.filter(source => claim.supplementalSourceIds.includes(source.id) || claim.checkedEvidenceIds.includes(source.id)),
    }));
    const preview: QingyuStrategyPreview = {
      basis: { research: { id: report.id, binding: report.binding, origin: report.origin, contentSha256: document.ledger.basis.researchSha256 }, strategy: reviewedIdentity },
      brief: { basisVersion: resolution.brief.version, basisConfirmed: resolution.brief.confirmedAt !== null, latestVersion: history.current?.version ?? null, latestConfirmed: history.current?.confirmedAt != null },
      document, claims,
    };
    return resolution.currency === 'current' ? { kind: 'current', preview } : { kind: 'historical', preview, latestBriefVersion: resolution.latestBriefVersion };
  } catch {
    return { kind: 'unavailable', reason: 'draft-invalid', message: '策略推演的记录或证据引用不完整，暂不展示正文，请先核对原稿。' };
  }
}
