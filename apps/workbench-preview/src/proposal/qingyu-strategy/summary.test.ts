import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '../deck-studio/engine';
import { buildStrategyIntersectionPage } from './intersection-page';
import { qingyuR4Report } from '../qingyu-report/bundle-r4';
import { prepareStrategySummary, strategySummaryBoards, strategySummaryIdentity } from './summary';

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ measureText: (char: string) => ({ width: /[ -~]/.test(char) ? 50 : 100 }) }) }) });
});
afterEach(() => vi.unstubAllGlobals());

describe('owner strategy visual summary', () => {
  it('compiles exactly three complete text boards through the real research Deck Studio engine', () => {
    const pages = prepareStrategySummary();
    expect(pages.map(page => page.id)).toEqual(strategySummaryBoards.map(board => board.id));
    expect(pages.map(page => page.template)).toEqual(['summary.list', 'strategy.venn', 'summary.statement']);
    expect(pages.map(page => page.chapter)).toEqual(['研究结论', '方向交叉点', '策略发力点']);
    for (const page of pages) {
      expect(page.nodes.length).toBeGreaterThan(0);
      expect(page.nodes.some(node => node.kind === 'text' && node.color.toUpperCase() === '#002FA7')).toBe(true);
      expect(page.nodes.every(node => node.kind !== 'image' && node.kind !== 'chart')).toBe(true);
      const text = page.nodes.flatMap(node => node.kind === 'text' ? [...node.lines, ...node.runs.map(run => run.text)] : []).join('');
      const board = strategySummaryBoards.find(item => item.id === page.id);
      if (!board) throw new Error('Authored board required');
      expect(text).toContain(board.template.kind === 'summary.statement' ? board.template.statement.replaceAll('\n', '') : page.title);
    }
    expect(strategySummaryIdentity.draftId).not.toBe('qingyu-strategy-r3-v2');
  });
  it('replaces only the middle page and preserves the other pages including vendor pagination', () => {
    const original = compile([...strategySummaryBoards], '青屿', { primary: '#002FA7', accent: '#A9C545', style: 'business', mode: 'light' });
    const pages = prepareStrategySummary();
    expect(pages[0]).toEqual(original[0]);
    expect(pages[2]).toEqual(original[2]);
    expect(pages[1]).toMatchObject({ id: strategySummaryBoards[1].id, title: strategySummaryBoards[1].title, chapter: strategySummaryBoards[1].chapter, notes: strategySummaryBoards[1].notes, caption: strategySummaryBoards[1].caption });
  });
  it('draws three equal overlapping native rings and links their shared intersection to the right callout', () => {
    const page = buildStrategyIntersectionPage(strategySummaryBoards[1]);
    const rings = page.nodes.flatMap(node => node.kind === 'ellipse' ? [node] : []);
    const connector = page.nodes.find(node => node.kind === 'line');
    if (!connector) throw new Error('Native connector required');
    expect(rings).toHaveLength(3);
    expect(new Set(rings.map(ring => ring.w))).toHaveLength(1);
    for (const ring of rings) {
      expect(ring.w).toBe(ring.h);
      expect(Math.hypot(connector.x1 - ring.x - ring.w / 2, connector.y1 - ring.y - ring.h / 2)).toBeLessThan(ring.w / 2);
      expect(ring.x + ring.w).toBeLessThan(connector.x2);
    }
    for (const a of rings) for (const b of rings) {
      if (a === b) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(a.w);
    }
    const board = strategySummaryBoards[1];
    if (board.template.kind !== 'summary.list') throw new Error('Four points required');
    const nativeText = page.nodes.flatMap(node => node.kind === 'text' ? node.lines : []).join('');
    for (const point of board.template.points) {
      expect(nativeText).toContain(point.k);
      expect(nativeText).toContain(point.d);
    }
    expect(nativeText).toContain('不表示统计比例或已验证的人群重合');
    for (const node of page.nodes) {
      if (node.kind !== 'text') continue;
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.w).toBeLessThanOrEqual(1280);
      expect(node.y + node.h).toBeLessThanOrEqual(720);
      expect(node.lines.length * node.size * node.lh).toBeLessThanOrEqual(node.h);
      if (node.x >= connector.x2 || node.x + node.w <= connector.x1) continue;
      expect(node.y > connector.y1 || node.y + node.lines.length * node.size * node.lh < connector.y1).toBe(true);
    }
    expect(page.nodes.every(node => ['ellipse', 'text', 'line', 'rect'].includes(node.kind))).toBe(true);
  });
  it('refuses changed point counts or wording instead of dropping text', () => {
    expect(() => buildStrategyIntersectionPage(strategySummaryBoards[0])).toThrow();
    const board = structuredClone(strategySummaryBoards[1]);
    if (board.template.kind !== 'summary.list') throw new Error('Four points required');
    const first = board.template.points[0];
    if (!first) throw new Error('Research point required');
    first.d += '新结论';
    expect(() => buildStrategyIntersectionPage(board)).toThrow();
  });
  it('quotes the actual sealed R4 historical packaging-need values with their scope', () => {
    if (qingyuR4Report.kind !== 'valid') throw new Error('Actual R4 required');
    const first = strategySummaryBoards[0];
    if (first.template.kind !== 'summary.list') throw new Error('Research summary required');
    for (const id of ['R4P18', 'R4P19', 'R4P20']) {
      const fact = qingyuR4Report.report.facts.find(item => item.id === id);
      if (!fact?.quantity) throw new Error('Actual quantity required');
      expect(fact.sourceIds).toEqual(['EO23']);
      expect(first.template.points.some(point => point.d.includes(`${fact.quantity?.value}%`))).toBe(true);
    }
    expect(first.caption).toContain('历史样本自报');
    expect(first.caption).toContain('非青屿目标人群实测');
    expect(strategySummaryBoards[1].caption).toContain('水源使用凭据待补');
    expect(strategySummaryBoards[2].caption).toContain('用户接受度待验证');
  });
});
