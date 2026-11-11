import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChartEvidence,decimalNumber,digest,textDigest} from './chart-data.mjs';
import {engineeringFixture} from './chart-fixture.mjs';
const reject=(change,code)=>{const f=engineeringFixture();change(f);assert.throws(()=>parseChartEvidence(f.raw,f.sources),e=>e.code===code,code);};
test('literal complete matrix, order, precision and explicit percent conversion survive',()=>{
 const f=engineeringFixture(),v=parseChartEvidence(f.raw,f.sources);assert.equal(v.charts.length,3);assert.deepEqual(v.charts[0].categories.map(x=>x.label),['2024','001','中文 类别']);assert.deepEqual(v.charts[0].series[0].values,[.31,-.04,0]);assert.deepEqual(v.charts[1].series[0].decimals,['-2.50','0','3.25']);assert(Object.isFrozen(v.charts[0].series[0].values));assert.equal(v.catalogDigest,digest(f.raw));assert.equal(v.sources[0].kind,'synthetic-engineering-fixture');
});
test('precision policy permits exact decimal serialization and refuses loss',()=>{
 assert.equal(decimalNumber('0.000001'),.000001);assert.equal(decimalNumber('1.2300'),1.23);for(const s of ['-0','NaN','Infinity','1e2','01','9007199254740992','0.1234567890123456789'])assert.throws(()=>decimalNumber(s));
});
for(const [name,code,change] of [
 ['missing cell','CHART_SHAPE',f=>f.raw.charts[0].series[0].values.pop()],
 ['null cell','CHART_SHAPE',f=>f.raw.charts[0].series[0].values[0]=null],
 ['declared counts','CHART_MATRIX',f=>f.raw.charts[0].categoryCount++],
 ['duplicate category IDs','CHART_DUPLICATE_ID',f=>f.raw.charts[0].categories[1].categoryId='category-0'],
 ['duplicate series IDs','CHART_DUPLICATE_ID',f=>f.raw.charts[0].series[1].seriesId='series-0'],
 ['unsupported type','CHART_UNSUPPORTED_TYPE',f=>f.raw.charts[0].type='scatter'],
 ['mixed unit','CHART_UNIT',f=>f.raw.charts[0].unit.kind='mixed'],
 ['wrong format','CHART_FORMAT',f=>f.raw.charts[0].numberFormat='0.00'],
 ['unknown transform','CHART_CONVERSION',f=>f.raw.charts[0].series[0].values[0].conversion='guess'],
 ['hidden percent conversion','CHART_CONVERSION',f=>f.raw.charts[0].series[0].values[0].decimal='31'],
 ['wrong original text hash','CHART_SOURCE_HASH',f=>f.sources[0].text+='x'],
 ['stale source binding','CHART_SOURCE_HASH',f=>f.raw.charts[0].title.evidence.sourceHash='0'.repeat(64)],
 ['unknown source','CHART_SOURCE_HASH',f=>f.raw.charts[0].title.evidence.sourceId='missing'],
 ['out of bounds locator','CHART_LOCATOR',f=>f.raw.charts[0].title.evidence.end=999999],
 ['byte instead of UTF16','CHART_LOCATOR',f=>f.raw.charts[0].title.evidence.indexing='utf8'],
 ['excerpt changed','CHART_LOCATOR',f=>f.raw.charts[0].title.evidence.text='wrong'],
 ['literal label changed','CHART_LOCATOR',f=>f.raw.charts[0].categories[0].label.text='2025'],
 ['value differs from original','CHART_CONVERSION',f=>f.raw.charts[0].series[0].values[1].decimal='0'],
 ['invalid surrogate source','CHART_TEXT',f=>{f.sources[0].text+='\ud800';f.sources[0].sha256=textDigest(f.sources[0].text);}],
 ['unknown field','CHART_SHAPE',f=>f.raw.charts[0].formula='=SUM(A1)'],
])test(name,()=>reject(change,code));
test('UTF16 offsets reject ranges splitting emoji and every raw source change invalidates digest',()=>{
 reject(f=>{const e=f.raw.charts[0].title.evidence; e.start=f.sources[0].text.indexOf('😀')+1; e.end=e.start+1;},'CHART_LOCATOR');
 const f=engineeringFixture(),first=parseChartEvidence(f.raw,f.sources);f.raw.charts[0].categories.reverse();const second=parseChartEvidence(f.raw,f.sources);assert.notEqual(first.catalogDigest,second.catalogDigest);
 // Reordering a complete source catalog is valid new content, with a different digest.
 assert.equal(textDigest(f.sources[0].text),f.sources[0].sha256);
});
