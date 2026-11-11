/**
 * Task-card editing state shared by the intake flow and the brief page. Pure functions only:
 * no service calls, no storage, no parsing.
 *
 * List fields are edited as one item per line. Each field keeps its provenance so the interface
 * can say whether a value came from the brief, is a suggestion, is unclear, or is missing, and a
 * person's edit or acceptance is recorded instead of silently replacing the origin.
 */
import type { ExtractedDocument, TaskCardDraft } from '../domain/intake';
import { legacyBriefFields } from '../domain/briefRequirements';
import {
  LIST_FIELDS,
  ACTIVE_TASK_FIELDS,
  REQUIRED_FIELDS,
  TASK_FIELDS,
  type AttachmentInput,
  type Brief,
  type BriefInput,
  type BriefProvenance,
  type FieldProvenance,
  type MappingMode,
  type TaskField,
} from '../domain/models';

export interface CardField {
  text: string;
  provenance: FieldProvenance;
  /** The value before any edit in this session, to detect a real change. */
  initial: string;
}

export type TaskCardState = Record<TaskField, CardField>;

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export const toText = (value: string | string[]) => (Array.isArray(value) ? value.join('\n') : value);

export const isFilled = (f: CardField) => f.text.trim() !== '';

const MISSING: FieldProvenance = { origin: 'missing', reason: 'not_stated', spans: [] };

export function fromDraft(draft: TaskCardDraft): TaskCardState {
  return Object.fromEntries(
    TASK_FIELDS.map((f) => {
      const text = toText(draft[f].value);
      return [f, { text, initial: text, provenance: draft[f].provenance }];
    }),
  ) as unknown as TaskCardState;
}

/** A saved brief as a card. Fields saved before provenance existed count as provided by a person. */
export function fromBrief(brief: Brief | null, projectName: string): TaskCardState {
  const value = (f: TaskField): string | string[] => {
    if (f === 'projectName') return projectName;
    if (!brief) return LIST_FIELDS.has(f) ? [] : '';
    return brief[f] as string | string[];
  };
  return Object.fromEntries(
    TASK_FIELDS.map((f) => {
      const text = toText(value(f));
      const stored = brief?.provenance?.[f];
      const provenance: FieldProvenance = stored ?? (text.trim() ? { origin: 'accepted', reason: 'stated', spans: [] } : MISSING);
      return [f, { text, initial: text, provenance }];
    }),
  ) as unknown as TaskCardState;
}

/**
 * For an update: start from the current brief and take every field the new material actually
 * filled. Fields the new material did not address keep their current values.
 */
export function mergeForUpdate(current: TaskCardState, mapped: TaskCardDraft): TaskCardState {
  const out = { ...current };
  for (const f of ACTIVE_TASK_FIELDS) {
    if (f === 'projectName') continue;
    const next = mapped[f];
    const text = toText(next.value);
    if (next.provenance.origin === 'missing' && !text.trim()) continue;
    out[f] = { text, initial: text, provenance: next.provenance };
  }
  return out;
}

/** A person typed in the field. The origin becomes "edited" once the value really differs. */
export function editField(state: TaskCardState, f: TaskField, text: string): TaskCardState {
  const prev = state[f];
  const changed = text.trim() !== prev.initial.trim();
  let provenance = prev.provenance;
  if (changed && prev.provenance.origin !== 'edited') provenance = { ...prev.provenance, origin: text.trim() ? 'edited' : 'missing', reason: text.trim() ? prev.provenance.reason : 'not_stated' };
  return { ...state, [f]: { ...prev, text, provenance } };
}

/** A person agreed with a suggestion or an unclear reading as it stands. */
export function acceptField(state: TaskCardState, f: TaskField): TaskCardState {
  const prev = state[f];
  return { ...state, [f]: { ...prev, provenance: { ...prev.provenance, origin: 'accepted' } } };
}

export function pendingSuggestions(state: TaskCardState): TaskField[] {
  return ACTIVE_TASK_FIELDS.filter((f) => state[f].provenance.origin === 'suggested');
}

export function unclear(state: TaskCardState): TaskField[] {
  return ACTIVE_TASK_FIELDS.filter((f) => state[f].provenance.origin === 'ambiguous');
}

/** Required to confirm (and so to start research). Saving a draft never requires them. */
export function missingRequired(state: TaskCardState): TaskField[] {
  return REQUIRED_FIELDS.filter((f) => !isFilled(state[f]));
}

export function provenanceOf(state: TaskCardState): BriefProvenance {
  const out: BriefProvenance = {};
  for (const f of TASK_FIELDS) {
    if (f === 'projectName') continue;
    const p = state[f].provenance;
    out[f] = { ...p, origin: !isFilled(state[f]) && p.origin !== 'ambiguous' ? 'missing' : p.origin };
  }
  return out;
}

export function attachmentFrom(doc: ExtractedDocument, mapping: MappingMode): AttachmentInput {
  return {
    id: doc.id,
    kind: doc.kind,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    size: doc.size,
    text: doc.text,
    extraction: doc.extraction,
    mapping,
    sampleId: doc.sampleId,
    file: doc.file,
  };
}

export function toBriefInput(state: TaskCardState, attachment: AttachmentInput | null, changeNote = ''): BriefInput {
  const list = (f: TaskField) => lines(state[f].text);
  const one = (f: TaskField) => state[f].text.trim();
  return {
    background: one('background'),
    audience: one('audience'),
    objectives: list('objectives'),
    deliverables: list('deliverables'),
    constraints: list('constraints'),
    brand: one('brand'),
    researchQuestions: list('researchQuestions'),
    deliverableType: one('deliverableType'),
    timeline: one('timeline'),
    budget: one('budget'),
    references: list('references'),
    openQuestions: list('openQuestions'),
    changeNote,
    provenance: provenanceOf(state),
    attachment,
  };
}

export interface FieldChange {
  field: TaskField | 'proposalType';
  before: string;
  after: string;
}

export function preserveHiddenFields(input: BriefInput, base: Brief): BriefInput {
  const provenance: BriefProvenance = { ...base.provenance };
  for (const field of ACTIVE_TASK_FIELDS) {
    if (field === 'projectName') continue;
    const next = input.provenance?.[field];
    if (!next) continue;
    const inferredLegacy = !base.provenance[field] && (next.origin === 'accepted' || next.origin === 'missing') && next.spans.length === 0 && JSON.stringify(input[field]) === JSON.stringify(base[field]);
    if (!inferredLegacy) provenance[field] = next;
  }
  return { ...input, ...legacyBriefFields(base), provenance };
}

const norm = (f: TaskField, text: string) => (LIST_FIELDS.has(f) ? lines(text).join('\n') : text.trim());

/** Field-by-field differences between two cards (project name excluded: it is not part of the brief). */
export function diffCards(before: TaskCardState, after: TaskCardState): FieldChange[] {
  return TASK_FIELDS.filter((f) => f !== 'projectName' && norm(f, before[f].text) !== norm(f, after[f].text)).map((f) => ({
    field: f,
    before: norm(f, before[f].text),
    after: norm(f, after[f].text),
  }));
}

/** Origins that a person is responsible for, for display. */
export type OriginTone = 'ok' | 'info' | 'warn' | 'neutral';
export const ORIGIN_TONE: Record<FieldProvenance['origin'], OriginTone> = {
  provided: 'ok',
  accepted: 'ok',
  edited: 'ok',
  suggested: 'info',
  ambiguous: 'warn',
  missing: 'neutral',
};
