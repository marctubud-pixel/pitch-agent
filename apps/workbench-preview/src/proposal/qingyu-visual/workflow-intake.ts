import type { CopyBundle } from '../qingyu-themes/content';
import { packagingReferenceSet } from './packaging-references';

export type VisualIntake = {
  schemaVersion: 1;
  id: string;
  skill: { name: 'visual-development-lead'; version: '1.0.0'; manifestSha256: string };
  input: { referenceSetId: string; bundleId: string; roundId: string; directionIds: string[]; copySha256: string; researchSha256: string };
  authorization: { through: 'reference_intake' };
  result: { kind: 'collected_unreviewed'; reviewCount: 0; artworkCount: 0 };
  directions: { id: string; visualQuestion: string; focus: string[]; limits: string[]; gaps: string[]; referenceIds: string[] }[];
  sources: { path: string; sha256: string }[];
  performedAt: string;
};
export type IntakeMetadata = { copySha256: string; manifestSha256: string };
export type IntakeResult =
  | { kind: 'collected-unreviewed'; intake: VisualIntake; basis: 'current' | 'historical' | 'refresh-unverified' }
  | { kind: 'unverified'; message: string };

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('接续记录结构不完整');
  return value;
}
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw new Error('接续记录必要文字缺失'); return value; }
function digest(value: unknown): string { const result = text(value); if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('接续记录摘要无效'); return result; }
function list(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('接续记录列表缺失'); return value; }
function strings(value: unknown): string[] { return list(value).map(text); }
function sameIds(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === left.length && left.every(id => right.includes(id)); }

export function resolveVisualIntake({ bundle, intake, metadata, basis }: { bundle: CopyBundle; intake: unknown; metadata: IntakeMetadata | null; basis: 'current' | 'historical' | 'refresh-unverified' }): IntakeResult {
  if (intake === null || metadata === null) return { kind: 'unverified', message: '接续记录待核：尚无可核对的参考收集工作包。' };
  try {
    const raw = object(intake), skill = object(raw.skill), input = object(raw.input), authorization = object(raw.authorization), result = object(raw.result);
    if (raw.schemaVersion !== 1 || skill.name !== 'visual-development-lead' || skill.version !== '1.0.0' || digest(skill.manifestSha256) !== metadata.manifestSha256) throw new Error('规范版本或摘要未匹配');
    if (authorization.through !== 'reference_intake' || result.kind !== 'collected_unreviewed' || result.reviewCount !== 0 || result.artworkCount !== 0) throw new Error('本轮仅授权参考收集，不能声明评审或制作完成');
    const directionIds = strings(input.directionIds);
    if (input.referenceSetId !== packagingReferenceSet.id || input.bundleId !== bundle.id || input.bundleId !== packagingReferenceSet.bundleId || input.roundId !== bundle.currentRound.id || input.roundId !== packagingReferenceSet.roundId || !sameIds(directionIds, bundle.currentRound.directions.map(direction => direction.id)) || digest(input.copySha256) !== metadata.copySha256 || digest(input.researchSha256) !== bundle.researchSha256) throw new Error('接续输入与当前文案、研究或参考集不匹配');
    const directions = list(raw.directions).map(value => {
      const item = object(value), id = text(item.id), referenceIds = strings(item.referenceIds);
      if (!sameIds(referenceIds, packagingReferenceSet.references.filter(reference => reference.directionId === id).map(reference => reference.id)) || referenceIds.length === 0) throw new Error('方向参考关联不匹配');
      return { id, visualQuestion: text(item.visualQuestion), focus: strings(item.focus), limits: strings(item.limits), gaps: strings(item.gaps), referenceIds };
    });
    if (!sameIds(directions.map(direction => direction.id), directionIds)) throw new Error('方向接续缺失或重复');
    const sources = list(raw.sources).map(value => { const item = object(value); return { path: text(item.path), sha256: digest(item.sha256) }; });
    if (sources.length === 0 || new Set(sources.map(source => source.path)).size !== sources.length) throw new Error('接续来源缺失或重复');
    const performedAt = text(raw.performedAt);
    if (!Number.isFinite(Date.parse(performedAt))) throw new Error('接续时间无效');
    const packet: VisualIntake = { schemaVersion: 1, id: text(raw.id), skill: { name: 'visual-development-lead', version: '1.0.0', manifestSha256: digest(skill.manifestSha256) }, input: { referenceSetId: text(input.referenceSetId), bundleId: text(input.bundleId), roundId: text(input.roundId), directionIds, copySha256: digest(input.copySha256), researchSha256: digest(input.researchSha256) }, authorization: { through: 'reference_intake' }, result: { kind: 'collected_unreviewed', reviewCount: 0, artworkCount: 0 }, directions, sources, performedAt };
    return { kind: 'collected-unreviewed', intake: packet, basis };
  } catch (error) { return { kind: 'unverified', message: `接续记录待核：${error instanceof Error ? error.message : '记录不可用'}。` }; }
}
