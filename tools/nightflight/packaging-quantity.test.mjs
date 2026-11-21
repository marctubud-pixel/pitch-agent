import assert from 'node:assert/strict';
import test from 'node:test';
import {fullPackageArrangement,promisedPackageUnits,specifiedPackageArrangement,unsupportedOpeningClaims} from './packaging-quantity.mjs';
import {makeStrategyOnePager} from './strategy-one-pager.mjs';

test('only directions arranging physical items count as all-item presentation',()=>{
  assert.equal(specifiedPackageArrangement('正面中央摆放七袋小袋实物，露出坚果与冻干草莓。'),7);
  assert.equal(specifiedPackageArrangement('外盒正面展示12袋实物。'),12);
  assert.equal(specifiedPackageArrangement('必须让七袋全部清楚可数。'),7);
  assert.equal(promisedPackageUnits('七袋全部清楚可数。'),7);
  assert.equal(fullPackageArrangement('摆出两袋独立小袋','盒内七袋'),0);
  assert.equal(fullPackageArrangement('摆出七袋独立小袋','盒内七袋'),7);
  assert.equal(fullPackageArrangement('外盒正面中央拟摆七袋小袋实物，露出坚果与冻干草莓。','盒内7袋'),7);
  for(const line of ['盒内七袋，25克/袋。','展示七袋独立包装规格。','在盒面标出七袋装量。',
    '不要摆放七袋小袋实物。','不要求七袋全部清楚可数。','展示一袋实物。','制作七袋装外盒正面。']) {
    assert.equal(specifiedPackageArrangement(line),0,line);
  }
});

test('nightflight strategy keeps original box quantity and corrects an uncommissioned multi-unit arrangement',async()=>{
  const brief='做混合坚果包装正面和电商KV。每袋25克，盒内七袋。';
  const fact={conclusion:'受访者会在办公室加餐',evidence:'办公室里吃零食',source:'样本研究',implication:'安排办公场景'};
  const rationale={text:'按加餐情境安排信息。',findingNumbers:[1]};
  const validAction='正面用25克×7袋标注分装。';
  const invalidAction='正面中央摆放七袋小袋实物，露出坚果与冻干草莓。';
  const draft={coreStrategy:'办公下午加餐，先看清分装。',insight:'独立包装够不够拿取方便？',
    brandRole:'让办公加餐容易分次。',proposition:'每次取一袋。',actions:[invalidAction,'左上留品牌位。','首屏突出取用。'],
    touchpoints:[{kind:'front',name:'外盒正面',action:'先认品类和装量。'},{kind:'kv',name:'电商首屏',action:'先看单袋和整盒。'}],
    metrics:[{name:'规格识别',method:'展示外盒后复述袋数。'},{name:'配料识别',method:'看过正面后复述配料。'},
      {name:'动作理解',method:'根据手机画面复述如何取用。'}],
    constraints:'每袋25克、每盒七袋。',intersection:'两处保持分装信息一致。',
    opportunity:rationale,decision:rationale,priority:rationale,
  };
  async function run(input) {
    const calls=[];
    const result=await makeStrategyOnePager({
      project:{brief:input,research:{findings:[fact]}},inputs:{images:[],texts:[]},carrier:'packaging+kv',
      rules:[],call:async(instruction,_images,_schema,task)=>{
        if(task.delegate) return {parsedOutput:{issues:[]}};
        calls.push({instruction,context:task.context});
        return {parsedOutput:{outcome:calls.length===1?draft:{...draft,actions:[validAction,...draft.actions.slice(1)]}}};
      },
    });
    return {...result,calls};
  }
  const unrequested=await run(brief);
  assert.equal(unrequested.calls.length,2);
  assert.equal(unrequested.calls[0].context,unrequested.calls[1].context);
  assert.match(unrequested.calls[1].instruction,/原 Brief 未确认要排列这些实物件数/u);
  assert.ok(unrequested.body.includes(validAction) && !unrequested.body.includes(invalidAction));
  const requested=await run(brief+'请在外盒正面摆放七袋小袋实物。');
  assert.equal(requested.calls.length,1);
  assert.ok(requested.body.includes(invalidAction));
});


test('strategy requires confirmed structure to promise how a packaged product opens',async()=>{
  const brief='做混合坚果包装正面和电商 KV。每袋 25 克，七袋独立分装。';
  const core='办公室下午想加餐，先放大七袋独立分装：一次一袋，不用整盒开封。';
  assert.equal(unsupportedOpeningClaims(core,brief),true);
  assert.equal(unsupportedOpeningClaims(core,'开启结构未确认能否不用整盒开封。'),true);
  assert.equal(unsupportedOpeningClaims(core,brief+'本品有侧开取用口，无需打开外盒即可取袋。'),false);
  assert.equal(unsupportedOpeningClaims('取用口还未确认能否单手打开。',brief),false);
  assert.equal(unsupportedOpeningClaims('开盖方式未确认，一次取一袋。',brief),false);
  assert.equal(unsupportedOpeningClaims('开盖方式未确认，不用整盒开封。',brief),true);
  const finding={conclusion:'办公加餐情境',source:'调查',evidence:'办公室加餐',implication:'检验购买时的读序'};
  const rationale={text:'在办公场景检验。',findingNumbers:[1]};
  const draft={coreStrategy:core,insight:'下午加餐时怎么判断分装份量？',brandRole:'让办公加餐可分次取用。',
    proposition:'一次取一袋。',actions:['正面写明七袋。','画出一袋实物。','手机首屏保留品类名。'],
    touchpoints:[{kind:'front',name:'外盒正面',action:'保持配料字样可读。'},{kind:'kv',name:'电商首屏',action:'靠画面交代办公地点。'}],
    metrics:[{name:'袋数',method:'展示后问数量。'},{name:'配料',method:'请观者逐个指认。'},{name:'场景',method:'问此时在什么地方。'}],
    constraints:'分装已定，开启方式未确认。',intersection:'在两个触点表明分装。',opportunity:rationale,decision:rationale,priority:rationale,
  };
  const fixed='办公室下午加餐，先让人看懂一次取一袋。';
  const calls=[];
  const result=await makeStrategyOnePager({project:{brief,research:{findings:[finding]}},inputs:{texts:[],images:[]},
    carrier:'packaging+kv',rules:[],call:async(instruction,_images,_schema,task)=>{
      if(task.delegate) return {parsedOutput:{issues:[]}};
      calls.push(instruction);
      return {parsedOutput:{outcome:calls.length===1?draft:{...draft,coreStrategy:fixed}}};
    }});
  assert.equal(calls.length,2);
  assert.match(calls[1],/原始 Brief 未确认具体开启能力/u);
  assert.equal(result.strategy.focus,fixed);
  assert.ok(!result.body.includes('不用整盒开封'));
});
