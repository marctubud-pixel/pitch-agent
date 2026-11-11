import { readProvenance } from '../../test-support/provenance';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCopyBundle } from '../qingyu-themes/content';
import reviewedCopy from '../qingyu-themes/reviewed-copy.json';
import { visualIntakeMetadata, visualIntakePacket } from './workflow-record';
import { packagingReferenceSet } from './packaging-references';
import { resolveVisualIntake, type IntakeMetadata, type VisualIntake } from './workflow-intake';

const copySha256 = createHash('sha256').update(readFileSync(new URL('../qingyu-themes/reviewed-copy.json', import.meta.url))).digest('hex');
const parsed = parseCopyBundle(reviewedCopy, { strategyDraftId: 'qingyu-strategy-owner-summary-20261110-v1', researchSha256: 'f784b423d412484e8323e7bb12033ab18198ff3e59634c34b86d1c2e67cbea8d' });
if (parsed.kind !== 'ready') throw new Error(parsed.message);
const bundle = parsed.bundle;
const metadata: IntakeMetadata = { copySha256, manifestSha256: 'a'.repeat(64) };
function fixture(): VisualIntake {
  return { schemaVersion: 1, id: 'unit-only-intake', skill: { name: 'visual-development-lead', version: '1.0.0', manifestSha256: metadata.manifestSha256 }, input: { referenceSetId: packagingReferenceSet.id, bundleId: bundle.id, roundId: bundle.currentRound.id, directionIds: bundle.currentRound.directions.map(direction => direction.id), copySha256, researchSha256: bundle.researchSha256 }, authorization: { through: 'reference_intake' }, result: { kind: 'collected_unreviewed', reviewCount: 0, artworkCount: 0 }, directions: bundle.currentRound.directions.map(direction => ({ id: direction.id, visualQuestion: `待验证：${direction.name}`, focus: ['测试表达'], limits: ['测试限制'], gaps: ['测试缺口'], referenceIds: packagingReferenceSet.references.filter(reference => reference.directionId === direction.id).map(reference => reference.id) })), sources: [{ path: 'unit-fixture-only.json', sha256: 'b'.repeat(64) }], performedAt: '2026-11-10T10:00:00Z' };
}
function resolve(intake: unknown, basis: 'current' | 'historical' | 'refresh-unverified' = 'current') { return resolveVisualIntake({ bundle, intake, metadata, basis }); }

describe('read-only reference intake boundary', () => {
  it('binds the sealed display projection to the actual copy, skill and source bytes', () => {
    const bytes = readFileSync(new URL('./workflow-intake-record.json', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('db010e2a2f5e046f29904bc6170e62f94b45a21eec6a0f92eabd06a7336637ba');
    expect(visualIntakeMetadata.copySha256).toBe(copySha256);
    const result = resolveVisualIntake({ bundle, intake: visualIntakePacket, metadata: visualIntakeMetadata, basis: 'current' });
    expect(result.kind, JSON.stringify(result)).toBe('collected-unreviewed');
    if (result.kind !== 'collected-unreviewed') throw new Error(result.message);
    expect(result.intake.result).toEqual({ kind: 'collected_unreviewed', reviewCount: 0, artworkCount: 0 });
    expect(result.intake.skill.manifestSha256).toBe('2c197d5a8a8d7716700a1ef11fafd5388158a39e4d5354d8b257c47fd8fe3e00');
    for (const source of result.intake.sources) expect(createHash('sha256').update(readProvenance(source.path)).digest('hex')).toBe(source.sha256);
  });
  it('has no approval state and carries historical or refresh uncertainty', () => {
    for (const basis of ['current', 'historical', 'refresh-unverified'] as const) {
      const packet = fixture(), before = JSON.stringify(packet);
      const result = resolve(packet, basis);
      expect(result.kind).toBe('collected-unreviewed');
      if (result.kind !== 'collected-unreviewed') throw new Error(result.message);
      expect(result.basis).toBe(basis);
      expect(result.intake.result).toEqual({ kind: 'collected_unreviewed', reviewCount: 0, artworkCount: 0 });
      expect(JSON.stringify(packet)).toBe(before);
    }
  });
  it('treats absent packet or expected identity as unverified', () => {
    expect(resolve(null).kind).toBe('unverified');
    expect(resolveVisualIntake({ bundle, intake: fixture(), metadata: null, basis: 'current' }).kind).toBe('unverified');
  });
  it.each([
    { input: { ...fixture().input, bundleId: 'old-copy' } },
    { input: { ...fixture().input, roundId: 'r1' } },
    { input: { ...fixture().input, directionIds: ['n7', 'n7', 'v2'] } },
    { input: { ...fixture().input, directionIds: ['n7', 'k4', 'other'] } },
    { input: { ...fixture().input, referenceSetId: 'other-reference-set' } },
    { input: { ...fixture().input, copySha256: 'c'.repeat(64) } },
    { input: { ...fixture().input, researchSha256: 'd'.repeat(64) } },
    { skill: { ...fixture().skill, version: '2.0.0' } },
    { skill: { ...fixture().skill, manifestSha256: 'e'.repeat(64) } },
    { authorization: { through: 'refine' } },
    { result: { kind: 'passed', reviewCount: 0, artworkCount: 0 } },
    { result: { kind: 'collected_unreviewed', reviewCount: 1, artworkCount: 0 } },
    { result: { kind: 'collected_unreviewed', reviewCount: 0, artworkCount: 1 } },
    { sources: [] },
    { performedAt: 'not-a-date' },
    { directions: [fixture().directions[0], fixture().directions[0], fixture().directions[2]] },
    { directions: fixture().directions.map(direction => ({ ...direction, referenceIds: ['fabricated'] })) },
  ])('rejects version mismatch, unauthorized work or broken evidence %#', patch => {
    expect(resolve({ ...fixture(), ...patch }).kind).toBe('unverified');
  });
  it.each([undefined, [], {}, 'passed', { schemaVersion: 1 }])('rejects malformed records without throwing %#', packet => {
    expect(resolve(packet).kind).toBe('unverified');
  });
});
