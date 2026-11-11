/**
 * Demo intake service. Text extraction is real and local; field mapping is either the
 * simulated mapping of a bundled sample, word-for-word copying under matching headings, or
 * nothing at all. It never produces a task card for material it has not actually read.
 */
import {
  IntakeError,
  type BriefIntakeService,
  type ExtractedDocument,
  type IntakeProgress,
  type IntakeSource,
  type SampleBrief,
  type TaskCardDraft,
  type TaskCardMapping,
} from '../../domain/intake';
import { LIST_FIELDS, TASK_FIELDS, type SourceSpan } from '../../domain/models';
import { extractFile } from './extract';
import { matchHeadings } from './headings';
import { SAMPLES } from './samples';

const newId = () => `att-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const pause = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Every field, empty and marked as not looked for. */
export function emptyDraft(reason: 'no_mapping' | 'not_stated' = 'no_mapping'): TaskCardDraft {
  return Object.fromEntries(
    TASK_FIELDS.map((f) => [f, { value: LIST_FIELDS.has(f) ? [] : '', provenance: { origin: 'missing', reason, spans: [] } }]),
  ) as unknown as TaskCardDraft;
}

/** Locates a quote in the text. Throws if it is not there, so a sample cannot cite a passage it lacks. */
export function locate(text: string, quote: string, attachmentId: string): SourceSpan {
  const start = text.indexOf(quote);
  if (start < 0) throw new Error(`Sample quote not found in text: ${quote}`);
  return { attachmentId, start, end: start + quote.length, quote };
}

export class LocalIntakeService implements BriefIntakeService {
  readonly simulated: boolean = true;
  constructor(private readonly options: { latency?: number; samples?: boolean } = {}) {}

  private get latency() {
    return this.options.latency ?? 450;
  }

  async listSamples(): Promise<SampleBrief[]> {
    return (this.options.samples === false ? [] : SAMPLES).map(({ id, title, description, fileName, presentAs }) => ({ id, title, description, fileName, presentAs }));
  }

  async getSampleFile(sampleId: string): Promise<File> {
    const sample = SAMPLES.find((s) => s.id === sampleId);
    if (!sample) throw new IntakeError('unavailable');
    return new File([sample.text], sample.fileName, { type: 'text/plain' });
  }

  async extractText(source: IntakeSource, onProgress?: (p: IntakeProgress) => void): Promise<ExtractedDocument> {
    const id = newId();
    if (source.kind === 'paste' || source.kind === 'request') {
      const text = source.text.replace(/\r\n?/g, '\n').trim();
      if (!text) throw new IntakeError('empty');
      return { id, kind: source.kind, fileName: null, mimeType: null, size: new Blob([text]).size, text, extraction: { method: 'typed', pages: null, warnings: [] }, sampleId: null, file: null };
    }
    if (source.kind === 'sample') {
      const sample = SAMPLES.find((s) => s.id === source.sampleId);
      if (!sample) throw new IntakeError('unavailable');
      onProgress?.({ stage: 'reading' });
      await pause(this.latency / 2);
      const file = await this.getSampleFile(sample.id);
      const { text, extraction } = await extractFile(file, onProgress);
      return { id, kind: 'sample', fileName: sample.fileName, mimeType: 'text/plain', size: file.size, text, extraction, sampleId: sample.id, file };
    }
    const { file } = source;
    const { text, extraction } = await extractFile(file, onProgress);
    await pause(this.latency / 3);
    return { id, kind: 'file', fileName: file.name, mimeType: file.type || null, size: file.size, text, extraction, sampleId: null, file };
  }

  async mapToTaskCard(doc: ExtractedDocument): Promise<TaskCardMapping> {
    await pause(this.latency);
    const sample = this.options.samples !== false && doc.sampleId ? SAMPLES.find((s) => s.id === doc.sampleId) : undefined;
    // The simulated mapping applies only to the unchanged sample text.
    if (sample && sample.text === doc.text) {
      const fields = emptyDraft('not_stated');
      for (const f of TASK_FIELDS) {
        const spec = sample.fields[f];
        if (!spec) continue;
        fields[f] = {
          value: Array.isArray(spec.value) ? [...spec.value] : spec.value,
          provenance: { origin: spec.origin, reason: spec.reason, spans: spec.quotes.map((q) => locate(doc.text, q, doc.id)) },
        };
      }
      return { mode: 'simulated_sample', simulated: true, fields, matchedHeadings: [] };
    }
    const matches = matchHeadings(doc.text);
    const fields = emptyDraft('no_mapping');
    for (const match of matches) {
      fields[match.field] = {
        value: match.value,
        provenance: { origin: 'provided', reason: 'heading', spans: match.spans.map((s) => ({ ...s, attachmentId: doc.id })) },
      };
    }
    return { mode: matches.length ? 'headings' : 'none', simulated: false, fields, matchedHeadings: matches.map((m) => m.heading) };
  }
}
