/**
 * Brief intake: turning a request, pasted text or an uploaded file into a draft task card.
 *
 * Two separate operations, so either can be replaced by a real service:
 *  1. extractText: get the words out of the material (a parser's job).
 *  2. mapToTaskCard: decide which words belong in which task-card field (a model's job).
 * Neither saves anything or confirms the brief. That stays a person's decision.
 */
import type { BriefAttachment, ExtractionSummary, FieldProvenance, ID, MappingMode, TaskField } from './models';
export type { ProvenanceReason } from './models';

export type IntakeSource =
  | { kind: 'file'; file: File }
  | { kind: 'paste'; text: string }
  | { kind: 'request'; text: string }
  | { kind: 'sample'; sampleId: string };

export interface SampleBrief {
  id: string;
  title: string;
  description: string;
  fileName: string;
  /** How the sample is presented: an uploaded document or a short typed request. */
  presentAs: 'file' | 'request';
}

export interface ExtractedDocument {
  /** Becomes the attachment id once the brief is saved. */
  id: ID;
  kind: BriefAttachment['kind'];
  fileName: string | null;
  mimeType: string | null;
  size: number;
  text: string;
  extraction: ExtractionSummary;
  sampleId: string | null;
  /** The original file, kept so it can be previewed or downloaded. */
  file: Blob | null;
}

export type DraftFieldProvenance = FieldProvenance;

export interface TaskCardDraftField {
  value: string | string[];
  provenance: DraftFieldProvenance;
}

export type TaskCardDraft = Record<TaskField, TaskCardDraftField>;

export interface TaskCardMapping {
  mode: MappingMode;
  /** True when the field values come from the demo simulator rather than real analysis. */
  simulated: boolean;
  fields: TaskCardDraft;
  /** Headings found in the text, for the 'headings' mode. */
  matchedHeadings: string[];
}

export type IntakeProgress = { stage: 'reading' | 'extracting' | 'mapping'; ratio?: number };

export type IntakeErrorCode = 'unsupported_type' | 'legacy_doc' | 'too_large' | 'empty' | 'no_text' | 'encrypted' | 'corrupt' | 'unavailable';

export class IntakeError extends Error {
  readonly code: IntakeErrorCode;
  constructor(code: IntakeErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

export interface BriefIntakeService {
  /** True when mapping results are simulated (the demo). */
  readonly simulated: boolean;
  listSamples(): Promise<SampleBrief[]>;
  /** The sample's text, offered as a download so people can see exactly what was mapped. */
  getSampleFile(sampleId: string): Promise<File>;
  extractText(source: IntakeSource, onProgress?: (p: IntakeProgress) => void): Promise<ExtractedDocument>;
  mapToTaskCard(doc: ExtractedDocument): Promise<TaskCardMapping>;
}

export const MAX_BRIEF_BYTES = 10 * 1024 * 1024;
