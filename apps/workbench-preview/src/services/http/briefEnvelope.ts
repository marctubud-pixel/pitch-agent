import type { AttachmentInput, BriefInput, BriefProvenance, CreateProjectInput, FieldOrigin, FieldProvenance, ProvenanceReason } from '../../domain/models';
import { TASK_FIELDS } from '../../domain/models';
import { ServiceError } from '../../domain/service';
import { isProposalType, type ProposalType } from '../../domain/proposalType';
import { object, records, strings, text } from './dto';

export interface ProjectMetadata {
  client: string; summary: string; researchOwner: string; strategyOwner: string; type?: ProposalType; presentationLocalTime?: string;
}
export interface BriefEnvelope {
  format: 'proposal-workbench-brief-v1'; savedAt: string; metadata: ProjectMetadata; fields: BriefInput;
}
const origins: FieldOrigin[] = ['provided', 'suggested', 'ambiguous', 'missing', 'accepted', 'edited'];
const reasons: ProvenanceReason[] = ['stated', 'heading', 'inferred', 'vague', 'conflict', 'not_stated', 'no_mapping'];
function origin(value: unknown): FieldOrigin { return origins.find((v) => v === value) ?? 'missing'; }
function reason(value: unknown): ProvenanceReason | null { return reasons.find((v) => v === value) ?? null; }
function provenance(value: unknown): BriefProvenance {
  const result: BriefProvenance = {};
  if (!value) return result;
  const source = object(value);
  for (const field of TASK_FIELDS) {
    if (!source[field]) continue;
    const entry = object(source[field]);
    const parsed: FieldProvenance = { origin: origin(entry.origin), reason: reason(entry.reason), spans: records(entry.spans).map((s) => {
      if (typeof s.start !== 'number' || typeof s.end !== 'number' || s.start < 0 || s.end < s.start) throw new ServiceError('validation', '简报原文来源区间无效。');
      return { attachmentId: text(s.attachmentId), start: s.start, end: s.end, quote: text(s.quote) };
    }) };
    result[field] = parsed;
  }
  return result;
}
function attachment(value: unknown): AttachmentInput | null {
  if (!value) return null;
  const a = object(value), e = object(a.extraction);
  const kind = a.kind === 'file' || a.kind === 'request' || a.kind === 'sample' ? a.kind : 'paste';
  const method = e.method === 'docx' || e.method === 'pdf' || e.method === 'plain_text' ? e.method : 'typed';
  return { id: text(a.id), kind, fileName: text(a.fileName) || null, mimeType: text(a.mimeType) || null, size: typeof a.size === 'number' ? a.size : 0,
    text: text(a.text), extraction: { method, pages: typeof e.pages === 'number' ? e.pages : null, warnings: strings(e.warnings) }, mapping: a.mapping === 'headings' || a.mapping === 'simulated_sample' ? a.mapping : 'none', sampleId: text(a.sampleId) || null, file: null };
}
export function readBrief(raw: string): BriefEnvelope {
  let candidate: unknown;
  try { candidate = JSON.parse(raw); } catch { candidate = null; }
  if (!candidate || typeof candidate !== 'object' || !('format' in candidate) || candidate.format !== 'proposal-workbench-brief-v1') {
    return { format: 'proposal-workbench-brief-v1', savedAt: '', metadata: { client: '', summary: '', researchOwner: '', strategyOwner: '', type: undefined }, fields: { background: raw, audience: '', objectives: [], deliverables: [], constraints: [], changeNote: '', provenance: {} } };
  }
  const envelope = object(candidate), f = object(envelope.fields), m = object(envelope.metadata);
  return { format: 'proposal-workbench-brief-v1', savedAt: text(envelope.savedAt), metadata: { client: text(m.client), summary: text(m.summary), researchOwner: text(m.researchOwner), strategyOwner: text(m.strategyOwner), type: isProposalType(f.proposalType) ? f.proposalType : isProposalType(m.type) ? m.type : undefined, ...(typeof m.presentationLocalTime === 'string' ? { presentationLocalTime: m.presentationLocalTime } : {}) }, fields: {
    ...(isProposalType(f.proposalType) ? {proposalType: f.proposalType} : isProposalType(m.type) ? {proposalType: m.type} : {}), background: text(f.background), audience: text(f.audience), objectives: strings(f.objectives), deliverables: strings(f.deliverables), constraints: strings(f.constraints), changeNote: text(f.changeNote), brand: text(f.brand), researchQuestions: strings(f.researchQuestions), deliverableType: text(f.deliverableType), timeline: text(f.timeline), budget: text(f.budget), references: strings(f.references), openQuestions: strings(f.openQuestions), provenance: provenance(f.provenance), attachment: attachment(f.attachment),
  } };
}
export function writeBrief(fields: BriefInput, metadata: ProjectMetadata, savedAt: string): string {
  const value: BriefEnvelope = { format: 'proposal-workbench-brief-v1', savedAt, metadata, fields: { ...fields, attachment: fields.attachment ? { ...fields.attachment, file: null } : null } };
  const raw = JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(object(item)).sort(([a], [b]) => a.localeCompare(b, 'en'))) : item);
  if (raw.length > 60000) throw new ServiceError('validation', '任务卡与原始文本合计超过后端 60,000 字符限制，请缩短后重试。未保存。');
  return raw;
}
export function metadataFor(input: CreateProjectInput): ProjectMetadata {
  return { client: input.client, summary: input.summary, researchOwner: input.researchOwner, strategyOwner: input.strategyOwner, type: input.brief?.proposalType, ...(input.presentationLocalTime ? {presentationLocalTime: input.presentationLocalTime} : {}) };
}
export const emptyBrief = (): BriefInput => ({ background: '', audience: '', objectives: [], deliverables: [], constraints: [], changeNote: '' });
