export class StudioIssue extends Error {
  constructor(readonly code: 'not-ready' | 'style' | 'content', message: string) {
    super(message);
  }
}
