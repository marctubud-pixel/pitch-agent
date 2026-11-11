import assert from 'node:assert/strict';
import {parseChartEvidence,textDigest} from './chart-data.mjs';
import {engineeringFixture} from './chart-fixture.mjs';
function title(text) {
 const f=engineeringFixture();const old=f.raw.charts[0].title;const start=f.sources[0].text.length;
 f.sources[0].text+=text;f.sources[0].sha256=textDigest(f.sources[0].text);
 function rebind(x){if(x&&typeof x==='object'){if('sourceHash' in x)x.sourceHash=f.sources[0].sha256;Object.values(x).forEach(rebind);}}
 rebind(f.raw);f.raw.charts[0].title={text,evidence:{...old.evidence,sourceHash:f.sources[0].sha256,start,end:start+text.length,text}};
 return parseChartEvidence(f.raw,f.sources);
}
const cases=[...['\u0000','\u000b','\ufffe','\uffff','\ud800','\udfff'].map(x=>['reject '+JSON.stringify(x),()=>assert.throws(()=>title('bad'+x),e=>e.code==='CHART_TEXT')]),...['中文😀𐀀','valid\tline\nreturn\r','\ud7ff\ue000\ufffd','\u{10ffff}'].map(x=>['preserve '+JSON.stringify(x),()=>assert.equal(title(x).charts[0].title,x)])];
let passed=0;for(const [name,fn] of cases){try{fn();passed++;console.log('PASS '+name);}catch(e){console.log('FAIL '+name+' '+e.message);}}
console.log(JSON.stringify({passed,total:cases.length}));process.exitCode=passed===cases.length?0:1;
