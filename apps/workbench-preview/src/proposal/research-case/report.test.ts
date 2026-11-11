import { describe, expect, it } from 'vitest';
import rawReport from './luma-report.json';
import { authoredLumaCase, datumFor, findingFor, parseCaseReport, sourceIdsFor } from './report';
import { scatterGeometry, signedBarGeometry } from './charts';

describe('Luma public-research case content', () => {
  it('preserves the researched units, dated evidence and measured values', () => {
    expect(authoredLumaCase.kind).toBe('valid');
    if (authoredLumaCase.kind !== 'valid') throw new Error(authoredLumaCase.message);
    const report = authoredLumaCase.report;
    expect(report.id).toBe('case-report:luma-uk-20261109-v1');
    expect(datumFor(report, 'growth-rtd')).toMatchObject({ value: 2, unit: '销量同比%', period: '2023对2022', geography: '英国', sourceId: 'S1' });
    expect(datumFor(report, 'growth-spirits').value).toBe(-5);
    expect(datumFor(report, 'launch-2021')).toMatchObject({ value: 53, unit: '%新品数' });
    expect(datumFor(report, 'launch-2024')).toMatchObject({ value: 72, unit: '%新品数', population: '英国当年新上市RTD产品' });
    expect(datumFor(report, 'same-day-young')).toMatchObject({ value: 32, unit: '%该年龄饮酒者', label: '18–34岁', sourceId: 'S3' });
    expect(datumFor(report, 'same-day-older').value).toBe(14);
    expect(datumFor(report, 'budget-young')).toMatchObject({ value: 44, unit: '%该年龄节制饮酒者', sourceId: 'S3' });
    expect(datumFor(report, 'budget-young').population).toContain('已采取至少一种');
    expect(findingFor(report, 'market-update-2025').text).toContain('2025');
    expect(report.sections[0].summary).toContain('2024');
    expect(report.products.map(product => datumFor(report, product.datumIds.price).value)).toEqual([4, 2.45, 2.4, 2.4, 1.25]);
    expect(report.products.map(product => datumFor(report, product.datumIds.abv).value)).toEqual([14.9, 5, 5, 4.5, 0]);
    expect(report.products.filter(product => product.availability.includes('缺货')).map(product => product.id)).toEqual(['whiteclaw', 'gordons-zero']);
  });

  it('derives unit prices from the same ledger and keeps unknown Luma metrics absent', () => {
    if (authoredLumaCase.kind !== 'valid') throw new Error(authoredLumaCase.message);
    const report = authoredLumaCase.report;
    for (const product of report.products) {
      const price = datumFor(report, product.datumIds.price);
      const volume = datumFor(report, product.datumIds.volume);
      const unitPrice = datumFor(report, product.datumIds['unit-price']);
      expect(unitPrice).toMatchObject({ basis: 'calculated', formula: '单罐标价 ÷ 容量ml × 100', inputDatumIds: [price.id, volume.id] });
      expect(unitPrice.value).toBeCloseTo(price.value / volume.value * 100, 10);
    }
    expect(report.datums.some(datum => datum.id.startsWith('luma-'))).toBe(false);
    expect(report.products.some(product => product.id === 'luma')).toBe(false);
    expect(report.assumptions.find(item => item.id === 'brief-product')?.text).toContain('酒精度与售价尚未确定');
    expect(datumFor(report, 'gordons-zero-abv').value).toBe(0);
  });

  it('rejects a valid calculation borrowed from another SKU', () => {
    const raw = structuredClone(rawReport);
    raw.products[0].datumIds['unit-price'] = 'funkin-unit-price';
    expect(parseCaseReport(raw)).toMatchObject({ kind: 'invalid' });
  });

  it.each(['foreign-price-input', 'foreign-volume-input', 'reported-unit-price', 'foreign-reported-source'])('rejects a product calculation with %s', mutation => {
    const raw = structuredClone(rawReport);
    const unitPrice = raw.datums.find(item => item.id === 'moth-unit-price');
    const price = raw.datums.find(item => item.id === 'moth-price');
    if (!unitPrice || !price) throw new Error('MOTH datum fixture required');
    if (mutation === 'foreign-price-input') { unitPrice.inputDatumIds = ['funkin-price', 'moth-volume']; unitPrice.value = 2.45 / 125 * 100; }
    if (mutation === 'foreign-volume-input') { unitPrice.inputDatumIds = ['moth-price', 'funkin-volume']; unitPrice.value = 4 / 200 * 100; }
    if (mutation === 'reported-unit-price') Object.assign(unitPrice, { basis: 'reported', sourceId: 'P1', locator: 'unreported unit price' });
    if (mutation === 'foreign-reported-source') price.sourceId = 'P2';
    expect(parseCaseReport(raw)).toMatchObject({ kind: 'invalid' });
  });

  it('traces authored opportunities through explicit premises and real image observations', () => {
    if (authoredLumaCase.kind !== 'valid') throw new Error(authoredLumaCase.message);
    const report = authoredLumaCase.report;
    expect(findingFor(report, 'opportunity-conclusion')).toMatchObject({ kind: 'analysis', premiseIds: ['market-conclusion', 'segments-conclusion', 'competition-conclusion', 'packaging-conclusion'] });
    expect(sourceIdsFor(report, ['opportunity-conclusion'])).toEqual(expect.arrayContaining(['S1', 'S2', 'S3', 'S5', 'S6', 'S7', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']));
    for (const product of report.products) expect(findingFor(report, product.observationId)).toMatchObject({ kind: 'public-fact', sourceIds: [product.sourceId], context: { kind: 'inspected-image', image: product.image } });
    expect(report.products.find(product => product.id === 'funkin')?.image).toMatch(/funkin-passionfruit-pack\.jpg$/);
    expect(JSON.stringify(report.products)).not.toContain('funkin-passionfruit.png');
  });

  it.each(['not-an-object', 'nonfinite-value', 'bad-derived-price', 'missing-source', 'missing-premise', 'cyclic-premise', 'duplicate-datum', 'mixed-units', 'clipped-chart', 'wrong-photo', 'changed-anchor', 'missing-chapter'])('rejects %s at the bundle boundary', mutation => {
    const raw = structuredClone(rawReport);
    if (mutation === 'not-an-object') { expect(parseCaseReport(null).kind).toBe('invalid'); return; }
    if (mutation === 'nonfinite-value') raw.datums[0].value = Number.NaN;
    if (mutation === 'bad-derived-price') raw.datums.forEach(item => { if (item.id === 'moth-unit-price') item.value = 32; });
    if (mutation === 'missing-source') raw.sources = raw.sources.filter(item => item.id !== 'P1');
    if (mutation === 'missing-premise') raw.findings.forEach(item => { if (item.id === 'opp-flavour') item.premiseIds = ['absent']; });
    if (mutation === 'cyclic-premise') raw.findings.forEach(item => { if (item.id === 'opp-flavour') item.premiseIds = ['opp-flavour']; });
    if (mutation === 'duplicate-datum') raw.datums.push(structuredClone(raw.datums[0]));
    if (mutation === 'mixed-units') raw.datums.forEach(item => { if (item.id === 'growth-rtd') item.unit = 'GBP/罐'; });
    if (mutation === 'clipped-chart') raw.datums.forEach(item => { if (item.id === 'growth-rtd') item.value = 10; });
    if (mutation === 'wrong-photo') raw.products[0].image = raw.products[1].image;
    if (mutation === 'changed-anchor') raw.binding.expectedHead.version += 1;
    if (mutation === 'missing-chapter') raw.sections.pop();
    expect(parseCaseReport(raw).kind).toBe('invalid');
  });
});

describe('business chart geometry', () => {
  it('draws negative growth to the left of zero and positive growth to the right', () => {
    const geometry = signedBarGeometry({ values: [2, -5, -4, -2], min: -6, max: 3 });
    expect(geometry.bars[0].x).toBe(geometry.zero);
    expect(geometry.bars[0].end).toBeGreaterThan(geometry.zero);
    expect(geometry.bars[1].x).toBeLessThan(geometry.zero);
    expect(geometry.bars[1].x + geometry.bars[1].width).toBeCloseTo(geometry.zero, 10);
    expect(geometry.bars[1].width / geometry.bars[0].width).toBeCloseTo(2.5, 10);
    const percentage = signedBarGeometry({ values: [53, 72], min: 0, max: 100 });
    expect(percentage.bars[1].width / 424).toBeCloseTo(.72, 10);
  });

  it('uses actual per-can price and marked ABV, preserving the zero-alcohol alternative', () => {
    const points = scatterGeometry({ points: [{ id: 'moth', label: 'MOTH', price: 4, abv: 14.9 }, { id: 'zero', label: '0.0', price: 1.25, abv: 0 }], maxPrice: 5, maxAbv: 16 });
    expect(points[0].x).toBeCloseTo(78 + 4 / 5 * 475, 10);
    expect(points[0].y).toBeCloseTo(312 - 14.9 / 16 * 245, 10);
    expect(points[1].y).toBe(312);
  });
});
