import type { Brief } from './models';

export function legacyBriefFields(brief: Brief) {
  return { objectives: [...brief.objectives], deliverableType: brief.deliverableType,
    timeline: brief.timeline, budget: brief.budget, references: [...brief.references], openQuestions: [...brief.openQuestions] };
}

export function adoptedObjectives(brief: Pick<Brief, 'objectives' | 'provenance'> | null): string[] {
  if (!brief) return [];
  const origin = brief.provenance.objectives?.origin;
  return origin === 'suggested' || origin === 'ambiguous' || origin === 'missing' ? [] : [...brief.objectives];
}

export function researchQuestions(brief: Pick<Brief, 'researchQuestions' | 'provenance'> | null): string[] {
  if (!brief) return [];
  const origin = brief.provenance.researchQuestions?.origin;
  return origin === 'suggested' || origin === 'ambiguous' || origin === 'missing' ? [] : [...brief.researchQuestions];
}
