import { LIST_FIELDS, TASK_FIELDS } from '../domain/models';
import type { TaskCardDraft } from '../domain/intake';
import { fromDraft, type TaskCardState } from './taskCard';

/** A blank card for starting without any brief material. */
export function emptyCard(): TaskCardState {
  const draft = Object.fromEntries(TASK_FIELDS.map((f) => [f, { value: LIST_FIELDS.has(f) ? [] : '', provenance: { origin: 'missing', reason: 'not_stated', spans: [] } }]));
  return fromDraft(draft as unknown as TaskCardDraft);
}
