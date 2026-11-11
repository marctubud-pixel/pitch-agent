import { describe, expect, it } from 'vitest';
import { wrap } from './geometry';

describe('artwork headline wrapping', () => {
  it('breaks Chinese headlines without losing any characters', () => {
    const text = '熟悉的路线，多了寒意。';
    const lines = wrap(text, 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(text);
    expect(lines.every((line) => Array.from(line).length <= 6)).toBe(true);
  });
  it('keeps closing punctuation with the preceding Chinese text', () => {
    expect(wrap('每一道山脊，都有层次。', 11)).toEqual(['每一道山脊，', '都有层次。']);
    expect(wrap('同一条路，“重新出发”', 10).every((line) => !/^[”’]/u.test(line) && !/[“‘]$/u.test(line))).toBe(true);
    expect(wrap('在（熟悉的路线）同行。', 8).every((line) => !/^[，。！？、）】》]/u.test(line) && !/[（【《]$/u.test(line))).toBe(true);
  });
  it('retains spacing in an original English headline supplied by a user', () => {
    expect(wrap('A familiar path in cold air', 15)).toEqual(['A familiar path', 'in cold air']);
  });
});
