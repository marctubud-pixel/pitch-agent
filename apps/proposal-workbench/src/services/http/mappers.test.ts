import { describe, expect, it } from 'vitest';
import { readBrief, writeBrief } from './briefEnvelope';
import { parseSnapshot } from './dto';
import { mapAttachments, mapBrief, mapProject } from './mappers';
import type { BriefInput } from '../../domain/models';
import type { ProjectMetadata } from './briefEnvelope';

const fields: BriefInput = {
  background: '轻松社交新品', audience: '25 岁人群', objectives: ['表达轻松'], deliverables: ['品牌提案'], constraints: ['度数未定'], changeNote: '保留未知', brand: '得闲', researchQuestions: ['如何表达轻松'], deliverableType: '包装', timeline: '待定', budget: '未确定', references: ['原始参考'], openQuestions: ['度数'],
  provenance: { audience: { origin: 'provided', reason: 'heading', spans: [{ attachmentId: 'original', start: 0, end: 6, quote: '25 岁人群' }] } },
  attachment: { id: 'original', kind: 'paste', fileName: null, mimeType: null, size: 6, text: '25 岁人群\n原始完整材料', extraction: { method: 'typed', pages: null, warnings: [] }, mapping: 'headings', sampleId: null, file: null },
};
const metadata: ProjectMetadata = { client: '客户', summary: '', researchOwner: '', strategyOwner: '', type: 'packaging' };
function snapshot() {
  const first = writeBrief(fields, metadata, '2026-10-30T01:00:00.000Z');
  const second = writeBrief({ ...fields, audience: '25 岁以上' }, metadata, '2026-10-30T01:02:00.000Z');
  return parseSnapshot({ project: { id: 'project-one', name: '得闲', revision: 2, activeTaskCardId: 'card-two', taskCards: [{ id: 'card-one', brief: first, createdBy: 'operator' }, { id: 'card-two', brief: second, createdBy: 'operator' }], confirmations: [{ taskCardId: 'card-one', actorId: 'operator' }], jobs: [], artifacts: [], audit: [{ commandId: 'confirm-one', kind: 'confirm-task-card', actorId: 'operator', revision: 1, at: '2026-10-30T01:01:00.000Z' }], processedCommands: { 'confirm-one': JSON.stringify({ kind: 'confirm-task-card', taskCardId: 'card-one' }) } }, view: { policy: { mode: 'assisted', humanGates: ['copy'], authorizedThrough: 'final_review' }, stages: [], complete: false } });
}
describe('live task-card persistence boundary', () => {
  it('retains every field, original text and quoted provenance without converting them to verification', () => {
    const value = readBrief(writeBrief(fields, metadata, '2026-10-30T01:00:00.000Z'));
    expect(value.fields).toEqual(fields);
    expect(value.metadata.type).toBe('packaging');
    expect(value.fields.provenance?.audience?.origin).toBe('provided');
  });
  it('keeps confirmation on the exact historical version after a new draft is saved', () => {
    const p = snapshot();
    expect(mapBrief(p, p.cards[0]).confirmedAt).toBe('2026-10-30T01:01:00.000Z');
    expect(mapBrief(p, p.cards[1]).confirmedAt).toBeNull();
    expect(mapProject(p).status).toBe('draft');
    expect(mapAttachments(p)).toHaveLength(1);
    expect(mapAttachments(p)[0].fileAvailable).toBe(false);
  });
  it('keeps a legacy text brief verbatim and leaves unsupported fields unknown', () => {
    const result = readBrief('不是结构化字段的原始简报。');
    expect(result.fields.background).toBe('不是结构化字段的原始简报。');
    expect(result.fields.audience).toBe('');
    expect(result.fields.objectives).toEqual([]);
    expect(result.fields.provenance).toEqual({});
  });
});
