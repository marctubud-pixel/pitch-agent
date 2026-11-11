import { ACTIVE_TASK_FIELDS, type Brief, type TaskField } from '../domain/models';

type VersionDescription = { kind: 'note'; text: string } | { kind: 'created' } | { kind: 'changes'; fields: Array<TaskField | 'proposalType'> } | { kind: 'materials' } | { kind: 'saved' };

export function briefVersionDescription(brief: Brief, previous: Brief | undefined): VersionDescription {
  if (brief.changeNote?.trim()) return { kind: 'note', text: brief.changeNote };
  if (brief.version === 1 && !previous) return { kind: 'created' };
  if (!previous) return { kind: 'saved' };
  const fields: Array<TaskField | 'proposalType'> = ACTIVE_TASK_FIELDS.filter(field => field !== 'projectName' && JSON.stringify(brief[field]) !== JSON.stringify(previous[field]));
  if (brief.proposalType !== previous.proposalType) fields.push('proposalType');
  if (fields.length) return { kind: 'changes', fields };
  if (JSON.stringify(brief.attachmentIds) !== JSON.stringify(previous.attachmentIds)) return { kind: 'materials' };
  return { kind: 'saved' };
}
