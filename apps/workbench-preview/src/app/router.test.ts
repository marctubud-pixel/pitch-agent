import { describe, expect, it } from 'vitest';
import { changesPage } from './router';

describe('unsaved work navigation', () => {
  const brief = '/p/luma/proposal/brief';
  it('protects a different project or stage without requiring query configuration', () => {
    expect(changesPage(brief, '/p/luma/proposal/research')).toBe(true);
    expect(changesPage(brief, '/p/another/proposal/brief')).toBe(true);
  });
  it('protects history selection and browser-back to a different brief version', () => {
    expect(changesPage(brief, `${brief}?version=1`, ['version'])).toBe(true);
    expect(changesPage(`${brief}?version=1`, brief, ['version'])).toBe(true);
    expect(changesPage(`${brief}?version=1`, `${brief}?version=2`, ['version'])).toBe(true);
  });
  it('keeps focus and source-inspection navigation within the same editor', () => {
    expect(changesPage(brief, `${brief}?focus=unknowns`, ['version'])).toBe(false);
    expect(changesPage(`${brief}?version=2`, `${brief}?field=background&version=2`, ['version'])).toBe(false);
  });
  it('preserves the existing path-only rule for other editors', () => {
    expect(changesPage(brief, `${brief}?version=1`)).toBe(false);
    expect(changesPage('/new', '/new?field=objectives')).toBe(false);
  });
  it('protects entering an update editor without blocking ordinary field focus', () => {
    expect(changesPage(brief, `${brief}?intake=1`, ['version', 'intake'])).toBe(true);
    expect(changesPage(`${brief}?intake=1`, `${brief}?version=1`, ['version', 'intake'])).toBe(true);
    expect(changesPage(`${brief}?intake=1`, `${brief}?intake=1&field=objectives`, ['version', 'intake'])).toBe(false);
  });
});
