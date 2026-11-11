import type { HumanActor } from '../collaboration/types';
import type { Brief } from '../domain/models';
import type { TaskExtras } from '../domain/proposal';
import { isPresentationLocalTime } from '../domain/presentationTime';
import { adoptedObjectives, researchQuestions } from '../domain/briefRequirements';

type SummaryBrief = Pick<Brief, 'version' | 'confirmedAt' | 'objectives' | 'deliverables' | 'constraints' | 'audience' | 'brand' | 'timeline' | 'openQuestions' | 'background' | 'researchQuestions' | 'provenance'>;
type SummaryFields = { objectives: string[]; deliverables: string[]; constraints: string[]; audience: string; brand: string; timeline: string; openQuestions: string[]; background: string; researchQuestions: string[] };
export type ProjectBriefSummary = SummaryFields & (
  | { source: 'brief'; version: number; confirmed: boolean }
  | { source: 'proposal'; scope: string[] }
);

export function projectBriefSummary({ brief, task }: { brief: SummaryBrief | null; task: TaskExtras }): ProjectBriefSummary {
  if (brief) return {
    source: 'brief', version: brief.version, confirmed: Boolean(brief.confirmedAt),
    background: brief.background, researchQuestions: researchQuestions(brief),
    objectives: adoptedObjectives(brief), deliverables: [...brief.deliverables], constraints: [...brief.constraints],
    audience: brief.audience, brand: brief.brand, timeline: brief.timeline, openQuestions: [...brief.openQuestions],
  };
  return {
    source: 'proposal', background: task.assignment, researchQuestions: [], objectives: task.assignment ? [task.assignment] : [], deliverables: task.output ? [task.output] : [],
    constraints: [], scope: [...task.scope], audience: '', brand: '', timeline: '', openQuestions: [],
  };
}

export function confirmationOwner(members: readonly HumanActor[]): string {
  const owners = members.filter(member => member.role === 'pitch_owner');
  return owners.length === 1 ? `${owners[0].name} · 比稿负责人` : '比稿负责人';
}

export function presentationTimeLabel(value: string | undefined): string {
  if (!isPresentationLocalTime(value)) return '汇报时间待定';
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-');
  return `汇报时间 ${year}年${Number(month)}月${Number(day)}日 ${time}`;
}
