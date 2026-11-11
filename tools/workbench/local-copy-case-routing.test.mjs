import test from 'node:test';
import assert from 'node:assert/strict';
import {localCopyResponse} from './local-acceptance-copy-driver.mjs';
const job={stage:'copy'},request={};
test('explicit case identity outranks competitor mentions in the brief',()=>{
  const result=localCopyResponse({job,request,case:{caseId:'dexian'},project:{name:'得闲 社交型白酒包装',activeTaskCardId:'card',taskCards:[{id:'card',brief:'得闲面向25岁，竞品参考梦之蓝M6+，度数未定。'}]}});
  assert.match(result.title,/得闲/);assert(result.directions.some(d=>d.slogan.includes('得闲')));
  const named=localCopyResponse({job,request,project:{name:'得闲 社交型白酒包装',activeTaskCardId:'card',taskCards:[{id:'card',brief:'参考梦之蓝M6+'}]}});assert.match(named.title,/得闲/);
});
test('explicit M6 identity is retained and unknown cases reject',()=>{
  const result=localCopyResponse({job,request,case:{caseId:'m6'},project:{name:'任意命名'}});
  assert.match(result.title,/梦之蓝/);assert.deepEqual(result.directions.map(d=>d.id),['steady','product','user']);
  assert(result.directions.every(d=>/梦/.test(d.slogan)&&/新年|新梦/.test(d.slogan)));
  assert.throws(()=>localCopyResponse({job,request,case:{caseId:'other'}}),{code:'LOCAL_COPY_CASE_INVALID'});
});
