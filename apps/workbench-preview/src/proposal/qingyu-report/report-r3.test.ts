import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blockFactIds, blockSourceIds, parseQingyuR3, r3ById, r3Quantity } from './report-r3';
import { r3TestFixture } from './r3.test-fixture';
import { QingyuR3View } from './QingyuR3View';
import { qingyuR3Report } from './bundle-r3';

describe('R3 canonical research boundary', () => {
  it.each(['unknown-evidence', 'unimplemented-brief-derived', 'public-without-url', 'brief-with-public-url', 'published-from-brief', 'observation-from-brief', 'brand-from-brief', 'brief-from-public', 'mixed-brief-public', 'brief-with-number', 'brief-with-derivation', 'public-derived-from-brief', 'generated-as-original', 'product-from-brief'])('rejects an actual report clone with %s', mutation => {
    if (qingyuR3Report.kind !== 'valid') throw new Error(qingyuR3Report.message);
    const report = structuredClone(qingyuR3Report.report), growth = r3ById(report.facts, 'M-GROW'), condition = r3ById(report.facts, 'D-SPEC');
    if (mutation === 'unknown-evidence') Object.assign(growth, { evidenceType: 'typo-or-generated' });
    if (mutation === 'unimplemented-brief-derived') Object.assign(condition, { evidenceType: 'brief-derived', quantity: { value: 1, unit: '元', basis: '题设换算' } });
    if (mutation === 'public-without-url') r3ById(report.sources, 'M-S03').url = null;
    if (mutation === 'brief-with-public-url') r3ById(report.sources, 'BRIEF').url = 'https://example.com/public';
    if (mutation === 'published-from-brief') growth.sourceIds = ['BRIEF'];
    if (mutation === 'observation-from-brief') r3ById(report.facts, 'C-RANG-OBS').sourceIds = ['BRIEF'];
    if (mutation === 'brand-from-brief') r3ById(report.facts, 'C-RANG-REASON').sourceIds = ['BRIEF'];
    if (mutation === 'brief-from-public') condition.sourceIds = ['M-S03'];
    if (mutation === 'mixed-brief-public') condition.sourceIds = ['BRIEF', 'M-S03'];
    if (mutation === 'brief-with-number') condition.quantity = { value: 1, unit: '元', basis: '题设条件' };
    if (mutation === 'brief-with-derivation') condition.derivedFrom = [growth.id];
    if (mutation === 'public-derived-from-brief') growth.derivedFrom = [condition.id];
    if (mutation === 'generated-as-original') Object.assign(r3ById(report.media, 'C-A01'), { role: 'generated-illustration' });
    if (mutation === 'product-from-brief') r3ById(report.media, 'C-A01').sourceId = 'BRIEF';
    expect(parseQingyuR3(report).kind).toBe('invalid');
  });
  it('resolves finding facts and their derivation parents into the same details and source set', () => {
    if (qingyuR3Report.kind !== 'valid') throw new Error(qingyuR3Report.message);
    const report = structuredClone(qingyuR3Report.report), block = r3ById(r3ById(report.chapters, 'competition').blocks, 'C01');
    const parent = { ...r3ById(report.facts, 'C-RANG-OBS'), id: 'C-RANG-PARENT-FIXTURE', text: '测试用推导父记录，不进入正式报告', derivedFrom: [] };
    report.facts.push(parent); r3ById(report.facts, 'C-RANG-REASON').derivedFrom = [parent.id];
    r3ById(report.findings, 'FC-DIFFERENCE').sourceIds = [];
    expect(parseQingyuR3(report).kind).toBe('valid');
    const facts = blockFactIds(report, block);
    expect(facts).toEqual(expect.arrayContaining(['C-RANG-REASON', 'C-INIKIN-REASON', 'C-CHUN-REASON', parent.id]));
    expect(blockSourceIds(report, block)).toContain('C-S01');
    const html = renderToStaticMarkup(createElement(QingyuR3View, { report, historical: false, latestBriefVersion: 1 }));
    const section = html.slice(html.indexOf('data-block="C01"'), html.indexOf('data-block="C02"'));
    for (const id of ['C-RANG-REASON', 'C-INIKIN-REASON', 'C-CHUN-REASON', parent.id]) {
      const fact = r3ById(report.facts, id);
      expect(section).toContain(fact.text); expect(section).toContain(fact.locator);
    }
    expect(section).toContain('品牌自述'); expect(section).not.toContain('brand-self-description');
  });
  it('keeps full image limits in collapsed details while the product caption stays brief', () => {
    if (qingyuR3Report.kind !== 'valid') throw new Error(qingyuR3Report.message);
    const report = qingyuR3Report.report, html = renderToStaticMarkup(createElement(QingyuR3View, { report, historical: false, latestBriefVersion: 1 }));
    for (const media of report.media) {
      const caption = html.slice(html.indexOf(`data-product-media="${media.id}"`), html.indexOf('</figure>', html.indexOf(`data-product-media="${media.id}"`)));
      expect(caption).toContain(media.identity); expect(caption).not.toContain(media.limits);
      expect(html).toContain(`data-media-details="${media.id}"`); expect(html).toContain(media.limits);
    }
  });
  it('keeps the new-product title qualitative when the canonical count changes', () => {
    if (qingyuR3Report.kind !== 'valid') throw new Error(qingyuR3Report.message);
    const report = structuredClone(qingyuR3Report.report), fact = r3ById(report.facts, 'M-NEW-2025');
    if (!fact.quantity) throw new Error('Canonical new-product count required'); fact.quantity.value = 52;
    expect(parseQingyuR3(report).kind).toBe('valid');
    const block = r3ById(r3ById(report.chapters, 'market').blocks, 'M03');
    expect(block.title).not.toMatch(/\d/);
    const html = renderToStaticMarkup(createElement(QingyuR3View, { report, historical: false, latestBriefVersion: 1 }));
    const module = html.slice(html.indexOf('data-block="M03"'), html.indexOf('data-block="M04"'));
    expect(module).toContain('52'); expect(module).not.toContain('新品从51款降至11款');
  });
  it('reads all numbers from the canonical quantity and supports multiple blocks per chapter', () => {
    const report = r3TestFixture(); const fact = report.facts[0]; if (!fact?.quantity) throw new Error('Fixture quantity required'); fact.quantity.value = 43.25;
    const parsed = parseQingyuR3(report); expect(parsed.kind).toBe('valid');
    const html = renderToStaticMarkup(createElement(QingyuR3View, { report, historical: false, latestBriefVersion: 1 }));
    expect(r3Quantity(report, 'fact-fixture-a').value).toBe(43.25);
    expect(html).toContain('43.25'); expect(html).not.toContain('12.5');
    expect((html.match(/data-chapter=/g) ?? [])).toHaveLength(5);
    expect((html.match(/data-block=/g) ?? [])).toHaveLength(6);
    expect((html.match(/>下载调研报告<\/button>/g) ?? [])).toHaveLength(1);
    expect(html.indexOf('data-report-download=')).toBeGreaterThan(html.indexOf('id="qy-r3-conclusion"'));
    expect(html).not.toMatch(/下载PNG|下载SVG|<details[^>]*\bopen(?:=|>)/);
    expect(html).toContain('单位 %'); expect(html).toContain('同口径测试期'); expect(html).toContain('测试缺口');
  });
  it.each(['schema', 'binding', 'skill', 'adoption', 'cyclic-derivation', 'duplicate', 'source', 'fact', 'quantity', 'unit', 'basis', 'brief-number', 'finding', 'gap', 'chapter-order', 'cached-chart-number'])('rejects %s rather than hiding damage or changing gaps', mutation => {
    const wire = r3TestFixture(), fact = wire.facts[0], second = wire.chapters[1], chart = wire.chapters[0]?.blocks[1];
    if (!fact?.quantity || !second || chart?.kind !== 'chart' || !chart.rows[0]) throw new Error('Fixture must have references');
    if (mutation === 'schema') Object.assign(wire, { schemaVersion: 2 });
    if (mutation === 'binding') Object.assign(wire.binding, { briefVersion: 2 });
    if (mutation === 'skill') Object.assign(wire.origin, { skillRevision: 'r4' });
    if (mutation === 'adoption') wire.origin.adoptionSha256 = 'f'.repeat(64);
    if (mutation === 'cyclic-derivation') { const other = wire.facts[1]; if (!other) throw new Error('second fixture fact'); fact.derivedFrom = [other.id]; other.derivedFrom = [fact.id]; }
    if (mutation === 'duplicate') wire.facts.push(fact);
    if (mutation === 'source') fact.sourceIds = ['missing'];
    if (mutation === 'fact') chart.rows[0].factId = 'missing';
    if (mutation === 'quantity') fact.quantity = null;
    if (mutation === 'unit' && fact.quantity) fact.quantity.unit = '元';
    if (mutation === 'basis' && fact.quantity) fact.quantity.basis = '另一个分母';
    if (mutation === 'brief-number') fact.evidenceType = 'brief-condition';
    if (mutation === 'finding') second.findingIds = ['missing'];
    if (mutation === 'gap') second.gapIds = ['missing'];
    if (mutation === 'chapter-order') wire.chapters.reverse();
    if (mutation === 'cached-chart-number') Object.assign(chart.rows[0], { value: 12 });
    expect(parseQingyuR3(wire).kind).toBe('invalid');
  });
});
