import type { Project } from '../live';

export * from '../../../../../shared/stage-text.mjs';

export function publishedSlogan(p: Pick<Project, 'copyReview'>, direction: string) {
  const publication = p.copyReview;
  return publication?.status === 'ready'
    ? publication.draft.directions.find(entry => entry.name === direction)?.main
    : undefined;
}
