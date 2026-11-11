/**
 * Bundled sample briefs with a deterministic, simulated field mapping. The mapping is written
 * by hand for these exact texts and is labelled as simulated wherever it is shown. It is never
 * applied to any other material.
 *
 * Each field lists the passages it rests on; spans are located in the text at run time, so a
 * quote that is not in the text fails the unit test rather than pointing nowhere.
 */
import type { FieldOrigin, ProvenanceReason, TaskField } from '../../domain/models';
import type { SampleBrief } from '../../domain/intake';

interface SampleField {
  value: string | string[];
  origin: FieldOrigin;
  reason: ProvenanceReason;
  quotes: string[];
}

export interface SampleDefinition extends SampleBrief {
  text: string;
  fields: Partial<Record<TaskField, SampleField>>;
}

const KESTREL = `Kestrel Coffee Roasters — Spring range brief
Prepared by the Kestrel marketing team (fictional sample)

About us
Kestrel Coffee Roasters is an independent roaster with 14 cafés in the north of England. We are launching a spring range of three single-origin cold brews in cans, sold in our cafés and in two regional supermarket chains.

What we want to achieve
We want the range to be picked up by people who already buy cold coffee from the big chains, and to grow canned sales to 15% of café revenue within a year.

Who it is for
Office workers aged 25 to 40 who buy an iced coffee on the way to work at least twice a week.

What we need from you
A short research summary on how this audience chooses canned coffee, and two or three positioning routes we can take to our board. After the board has chosen a route, we would like design directions for the can.

Things to keep in mind
- Cans must use our existing logo and the kestrel illustration.
- No health claims about caffeine or "energy".
- Supermarket listings need final artwork by the end of February.

Timing
We'd like to see routes before the summer menu change.

References
- Our 2025 brand guidelines (sent separately)
- Photos of the current café counter display

Questions we have
We are not sure whether to lead with the origin stories or with the cold brew method.`;

const JUNIPER = `We need a pitch for Juniper Rail's new overnight service between Leeds and London, aimed at shift workers and early travellers. The proposal is due on 14 November. Keep it within the existing Juniper brand.`;

const miss = (reason: ProvenanceReason = 'not_stated'): SampleField => ({ value: '', origin: 'missing', reason, quotes: [] });
const missList = (): SampleField => ({ value: [], origin: 'missing', reason: 'not_stated', quotes: [] });

export const SAMPLES: SampleDefinition[] = [
  {
    id: 'kestrel',
    title: 'Kestrel Coffee — spring range brief',
    description: 'A full written brief. Has a deliberately missing budget and timings that do not line up.',
    fileName: 'kestrel-coffee-spring-brief.txt',
    presentAs: 'file',
    text: KESTREL,
    fields: {
      projectName: { value: 'Kestrel spring cold brew range', origin: 'suggested', reason: 'inferred', quotes: ['Kestrel Coffee Roasters — Spring range brief'] },
      brand: { value: 'Kestrel Coffee Roasters — spring range of single-origin canned cold brews', origin: 'provided', reason: 'stated', quotes: ['Kestrel Coffee Roasters is an independent roaster', 'a spring range of three single-origin cold brews in cans'] },
      background: {
        value:
          'Kestrel Coffee Roasters is an independent roaster with 14 cafés in the north of England. We are launching a spring range of three single-origin cold brews in cans, sold in our cafés and in two regional supermarket chains.',
        origin: 'provided',
        reason: 'stated',
        quotes: ['Kestrel Coffee Roasters is an independent roaster with 14 cafés in the north of England. We are launching a spring range of three single-origin cold brews in cans, sold in our cafés and in two regional supermarket chains.'],
      },
      objectives: {
        value: ['Get the range picked up by people who already buy cold coffee from the big chains.', 'Grow canned sales to 15% of café revenue within a year.'],
        origin: 'provided',
        reason: 'stated',
        quotes: ['We want the range to be picked up by people who already buy cold coffee from the big chains', 'grow canned sales to 15% of café revenue within a year'],
      },
      researchQuestions: {
        value: ['How does this audience choose canned coffee?', 'Which lead is more persuasive for them: origin stories or the cold brew method?'],
        origin: 'suggested',
        reason: 'inferred',
        quotes: ['how this audience chooses canned coffee', 'We are not sure whether to lead with the origin stories or with the cold brew method.'],
      },
      audience: {
        value: 'Office workers aged 25 to 40 who buy an iced coffee on the way to work at least twice a week.',
        origin: 'provided',
        reason: 'stated',
        quotes: ['Office workers aged 25 to 40 who buy an iced coffee on the way to work at least twice a week.'],
      },
      deliverableType: { value: 'Positioning proposal for the client’s board', origin: 'suggested', reason: 'inferred', quotes: ['two or three positioning routes we can take to our board'] },
      deliverables: {
        value: ['A short research summary on how this audience chooses canned coffee', 'Two or three positioning routes', 'Design directions for the can, after the board has chosen a route'],
        origin: 'provided',
        reason: 'stated',
        quotes: ['A short research summary on how this audience chooses canned coffee', 'two or three positioning routes', 'we would like design directions for the can'],
      },
      constraints: {
        value: ['Cans must use the existing logo and the kestrel illustration.', 'No health claims about caffeine or "energy".', 'Supermarket listings need final artwork by the end of February.'],
        origin: 'provided',
        reason: 'stated',
        quotes: ['Cans must use our existing logo and the kestrel illustration.', 'No health claims about caffeine or "energy".', 'Supermarket listings need final artwork by the end of February.'],
      },
      timeline: {
        value: 'Routes before the summer menu change; supermarket artwork by the end of February.',
        origin: 'ambiguous',
        reason: 'conflict',
        quotes: ["We'd like to see routes before the summer menu change.", 'Supermarket listings need final artwork by the end of February.'],
      },
      budget: miss(),
      references: {
        value: ['2025 brand guidelines (sent separately)', 'Photos of the current café counter display'],
        origin: 'provided',
        reason: 'stated',
        quotes: ['Our 2025 brand guidelines (sent separately)', 'Photos of the current café counter display'],
      },
      openQuestions: {
        value: ['Lead with the origin stories or with the cold brew method?'],
        origin: 'provided',
        reason: 'stated',
        quotes: ['We are not sure whether to lead with the origin stories or with the cold brew method.'],
      },
    },
  },
  {
    id: 'juniper',
    title: 'Juniper Rail — one-line request',
    description: 'A short typed request. Most of the task card stays open and is flagged as missing.',
    fileName: 'juniper-rail-request.txt',
    presentAs: 'request',
    text: JUNIPER,
    fields: {
      projectName: { value: 'Juniper Rail overnight service pitch', origin: 'suggested', reason: 'inferred', quotes: ["a pitch for Juniper Rail's new overnight service"] },
      brand: { value: "Juniper Rail's new overnight service between Leeds and London", origin: 'provided', reason: 'stated', quotes: ["Juniper Rail's new overnight service between Leeds and London"] },
      background: miss(),
      objectives: missList(),
      researchQuestions: missList(),
      audience: { value: 'Shift workers and early travellers', origin: 'provided', reason: 'stated', quotes: ['aimed at shift workers and early travellers'] },
      deliverableType: { value: 'Pitch', origin: 'provided', reason: 'stated', quotes: ['We need a pitch'] },
      deliverables: { value: ['A proposal (format not stated)'], origin: 'ambiguous', reason: 'vague', quotes: ['The proposal is due on 14 November.'] },
      constraints: { value: ['Keep it within the existing Juniper brand.'], origin: 'provided', reason: 'stated', quotes: ['Keep it within the existing Juniper brand.'] },
      timeline: { value: 'Proposal due on 14 November', origin: 'provided', reason: 'stated', quotes: ['The proposal is due on 14 November.'] },
      budget: miss(),
      references: missList(),
      openQuestions: missList(),
    },
  },
];
