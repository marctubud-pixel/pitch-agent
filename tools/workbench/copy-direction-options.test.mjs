import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyDirectionOptions,planCopyDirectionTarget} from './copy-direction-target.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
function fixture(){const content={directions:[{id:'steady',title:'延续',slogan:'新春团圆'},{id:'product',title:'品牌特征',slogan:'以蓝为梦'},{id:'user',title:'使用氛围',slogan:'把心意带回家'}]},contentText=JSON.stringify(content);return {artifact:{id:'copy-current',stage:'copy',contentHash:hash(contentText)},contentText};}
test('current original copy yields only actual stable direction IDs and labels without inferring approval',()=>{
 const f=fixture(),before=structuredClone(f),options=copyDirectionOptions(f);
 assert.deepEqual(options,{artifactId:f.artifact.id,contentHash:f.artifact.contentHash,directions:JSON.parse(f.contentText).directions});assert.deepEqual(f,before);
 assert.equal(options.approved,undefined);assert.equal(options.semanticReviewVerified,undefined);
 const target=planCopyDirectionTarget({...f,contribution:{kind:'copy_theme',directionId:options.directions[1].id,text:'新的品牌主题',intendedUse:'只修改明确选中的方向'}});assert.equal(target.directionId,'product');
});
test('changed bytes, duplicate IDs, missing labels or wrong stage cannot offer guessed direction choices',()=>{
 for(const change of [f=>f.contentText+=' ',f=>f.artifact.stage='strategy',f=>{const c=JSON.parse(f.contentText);c.directions[1].id=c.directions[0].id;f.contentText=JSON.stringify(c);f.artifact.contentHash=hash(f.contentText);},f=>{const c=JSON.parse(f.contentText);c.directions[0].title='';f.contentText=JSON.stringify(c);f.artifact.contentHash=hash(f.contentText);}]){const f=fixture();change(f);assert.throws(()=>copyDirectionOptions(f));}
});
