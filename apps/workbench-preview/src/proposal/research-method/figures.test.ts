import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResearchFigureView } from './figures';
import { circleRadius, figureError, figureTable, type ResearchFigure } from './model';
import { engineeringFigures } from './samples';

const origin = { kind: 'sample', note: '独立工程示例' } satisfies ResearchFigure['origin'];
const bars = { id: 'test-bars', kind: 'bars', title: '测试柱形', description: '独立示例', origin, unit: '家门店', max: 4, rows: [{ label: '零值', metric: { kind: 'known', value: 0 } }, { label: '未知', metric: { kind: 'unknown', reason: '尚未取得' } }] } satisfies ResearchFigure;

describe('exhaustive chart boundary and accessible data', () => {
  it('renders all engineering kinds with explicit independent figure/table labels and no live actions', () => {
    expect(new Set(engineeringFigures.map(f => f.kind)).size).toBe(9);
    for (const figure of engineeringFigures) {
      expect(figureError(figure), figure.id).toBeNull();
      const html = renderToStaticMarkup(createElement(ResearchFigureView, { figure }));
      expect(html).toContain(`data-chart-kind="${figure.kind}"`);
      expect(html).toContain('data-origin="sample"');
      expect(html).toContain('<caption>独立工程示例');
      expect(html).toContain('role="img"');
      expect(html).not.toContain('data-claim-trigger');
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('Infinity');
    }
  });

  it('keeps zero distinct from unknown in tables and geometry', () => {
    expect(figureError(bars)).toBeNull();
    expect(figureTable(bars).rows).toEqual([['零值', '0'], ['未知', '未知：尚未取得']]);
    const html = renderToStaticMarkup(createElement(ResearchFigureView, { figure: bars }));
    expect(html).toContain('width="0"');
    expect(html).toContain('未知，未绘制');
    expect(circleRadius(0, 0, 100)).toBe(0);
  });

  it('uses area rather than radius to encode circle values', () => {
    expect(circleRadius(25, 100, 100)).toBe(50);
    expect(circleRadius(9, 100, 100) ** 2 / circleRadius(36, 100, 100) ** 2).toBeCloseTo(1 / 4);
  });

  it('rejects negative, nonfinite, out-of-scale, empty and invalid-unit bars without clamping', () => {
    for (const value of [-1, NaN, Infinity, 5]) expect(figureError({ ...bars, rows: [{ label: '非法数值', metric: { kind: 'known', value } }] })).not.toBeNull();
    expect(figureError({ ...bars, rows: [] })).not.toBeNull();
    expect(figureError({ ...bars, unit: '' })).not.toBeNull();
    expect(figureError({ ...bars, unit: '<invalid>' })).not.toBeNull();
    expect(figureError({ ...bars, max: 0 })).not.toBeNull();
    const html = renderToStaticMarkup(createElement(ResearchFigureView, { figure: { ...bars, max: 0 } }));
    expect(html).toContain('图表未绘制');
    expect(html).not.toContain('<svg');
  });

  it('rejects contradictory nesting and distinguishes zero total from unknown', () => {
    const figure = engineeringFigures.find(f => f.kind === 'scopes');
    if (!figure || figure.kind !== 'scopes') throw new Error('Scopes sample required');
    expect(figureError({ ...figure, scopes: [{ label: '总', value: 10 }, { label: '中', value: 20 }, { label: '小', value: 1 }] })).not.toBeNull();
    expect(figureError({ ...figure, scopes: [{ label: '总', value: 0 }, { label: '中', value: 0 }, { label: '小', value: 0 }] })).toContain('总量为零');
    expect(figureError({ ...figure, scopes: [{ label: '总', value: 10 }, { label: '中', value: 0 }, { label: '小', value: 0 }] })).toBeNull();
  });

  it('requires valid historical/forecast separation and distinct ordered years', () => {
    const trend = engineeringFigures.find(f => f.kind === 'trend');
    if (!trend || trend.kind !== 'trend') throw new Error('Trend sample required');
    expect(figureError({ ...trend, forecastFrom: 2020 })).not.toBeNull();
    expect(figureError({ ...trend, forecastFrom: 2030 })).not.toBeNull();
    expect(figureError({ ...trend, points: [{ year: 2026, value: 20 }, { year: 2026, value: 30 }] })).not.toBeNull();
    const html = renderToStaticMarkup(createElement(ResearchFigureView, { figure: trend }));
    expect(html).toContain('stroke-dasharray="7 5"');
    expect(figureTable(trend).rows.map(r => r[2])).toEqual(['历史示例', '历史示例', '历史示例', '预测示例', '预测示例']);
  });

  it('rejects unsafe colors, empty figures and mismatched matrix columns, preserves zero bubbles', () => {
    for (const figure of engineeringFigures) {
      switch (figure.kind) {
        case 'bubbles':
          expect(figureError({ ...figure, points: [{ label: '零人', x: 0, y: 0, size: 0 }] })).toBeNull();
          expect(renderToStaticMarkup(createElement(ResearchFigureView, { figure: { ...figure, points: [{ label: '零人', x: 0, y: 0, size: 0 }] } }))).not.toContain('NaN');
          expect(figureError({ ...figure, points: [{ label: '越界', x: 6, y: 0, size: 1 }] })).not.toBeNull();
          expect(figureError({ ...figure, points: [] })).not.toBeNull();
          break;
        case 'position':
        case 'risk': expect(figureError({ ...figure, points: [] })).not.toBeNull(); break;
        case 'matrix': expect(figureError({ ...figure, rows: [{ label: '少一列', cells: [] }] })).not.toBeNull(); break;
        case 'palette': expect(figureError({ ...figure, entries: [{ label: '危险颜色', colors: ['url(example)'], note: '' }] })).not.toBeNull(); expect(figureError({ ...figure, entries: [] })).not.toBeNull(); break;
        case 'chain': expect(figureError({ ...figure, steps: [] })).not.toBeNull(); break;
        default: break;
      }
    }
  });
});
