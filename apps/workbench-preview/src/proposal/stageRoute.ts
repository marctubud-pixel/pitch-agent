import { activeStage, STAGES } from '../domain/proposal';

export function resolveStageRoute(raw: string | null, params: URLSearchParams) {
  const stored = STAGES.find((stage) => stage === raw);
  if (!stored) return null;
  const query = new URLSearchParams(params);
  if (stored === 'content_review') {
    query.delete('stage');
    query.delete('focus');
    query.delete('version');
  }
  return { stage: activeStage(stored), redirect: stored === 'content_review', params: Object.fromEntries(query) };
}
