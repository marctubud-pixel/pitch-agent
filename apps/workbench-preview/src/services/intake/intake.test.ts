import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { IntakeError } from '../../domain/intake';
import { TASK_FIELDS } from '../../domain/models';
import { docxText } from './extract';
import { LocalIntakeService } from './LocalIntakeService';
import { SAMPLES } from './samples';

const intake = new LocalIntakeService({ latency: 0 });

describe('LocalIntakeService', () => {
  it('maps a bundled sample with spans that point at real passages', async () => {
    for (const sample of SAMPLES) {
      const doc = await intake.extractText({ kind: 'sample', sampleId: sample.id });
      const mapping = await intake.mapToTaskCard(doc);
      expect(mapping.mode).toBe('simulated_sample');
      expect(mapping.simulated).toBe(true);
      for (const f of TASK_FIELDS) {
        for (const span of mapping.fields[f].provenance.spans) expect(doc.text.slice(span.start, span.end)).toBe(span.quote);
      }
    }
  });

  it('never invents a budget for the Kestrel sample', async () => {
    const doc = await intake.extractText({ kind: 'sample', sampleId: 'kestrel' });
    const { fields } = await intake.mapToTaskCard(doc);
    expect(fields.budget.value).toBe('');
    expect(fields.budget.provenance.origin).toBe('missing');
    expect(fields.timeline.provenance.origin).toBe('ambiguous');
  });

  it('gives arbitrary text no interpretation', async () => {
    const doc = await intake.extractText({ kind: 'paste', text: 'We chatted about a winter campaign. Money is unclear. Call me.' });
    const mapping = await intake.mapToTaskCard(doc);
    expect(mapping.mode).toBe('none');
    for (const f of TASK_FIELDS) {
      expect(mapping.fields[f].provenance.origin).toBe('missing');
      expect(mapping.fields[f].provenance.reason).toBe('no_mapping');
    }
  });

  it('does not apply the sample mapping to an edited copy of the sample text', async () => {
    const doc = await intake.extractText({ kind: 'sample', sampleId: 'kestrel' });
    const mapping = await intake.mapToTaskCard({ ...doc, text: `${doc.text}\nBudget: £10,000` });
    expect(mapping.mode).not.toBe('simulated_sample');
    expect(mapping.fields.budget.value).toBe('£10,000');
    expect(mapping.fields.budget.provenance.reason).toBe('heading');
  });

  it('copies text under headings word for word', async () => {
    const doc = await intake.extractText({ kind: 'paste', text: 'Audience\nStudents in Leeds\n\nBudget: £40,000' });
    const mapping = await intake.mapToTaskCard(doc);
    expect(mapping.mode).toBe('headings');
    expect(mapping.fields.audience.value).toBe('Students in Leeds');
    expect(mapping.fields.budget.value).toBe('£40,000');
    expect(mapping.fields.background.value).toBe('');
  });

  it('rejects empty text and unsupported files with specific codes', async () => {
    await expect(intake.extractText({ kind: 'paste', text: '   ' })).rejects.toMatchObject({ code: 'empty' });
    const legacy = new File(['x'], 'old.doc', { type: 'application/msword' });
    await expect(intake.extractText({ kind: 'file', file: legacy })).rejects.toBeInstanceOf(IntakeError);
  });
});

describe('docxText', () => {
  it('reads paragraphs, tabs and line breaks from word/document.xml', () => {
    const xml =
      '<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Budget:</w:t><w:tab/><w:t xml:space="preserve"> £5k</w:t></w:r></w:p><w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p></w:body></w:document>';
    const text = docxText(zipSync({ 'word/document.xml': strToU8(xml) }));
    expect(text).toContain('Budget:');
    expect(text).toContain('£5k');
    expect(text).toContain('Line one\nLine two');
  });
});
