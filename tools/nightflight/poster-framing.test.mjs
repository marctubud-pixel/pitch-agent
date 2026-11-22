import assert from 'node:assert/strict';
import test from 'node:test';
import {oppositePosterOrientation,paperAspect,posterFraming} from './visual-references.mjs';

test('the borrowed framing of a real public poster retains geometry without copying its subjects',()=>{
  const actual='画面展现较小环境比例，主体近景为主，背景含简单月亮和飞蝙蝠。';
  assert.equal(posterFraming(actual),'近景，环境范围小');
  assert.equal(posterFraming('画面主体占画面70%，环境范围较窄。'),'主体约占画面 70%，环境范围窄');
  assert.match(posterFraming('不具名的背景图形'),/主体占画面的大小/u);
});

test('paper aspect is bound only to a known client paper format and explicit orientation',()=>{
  assert.deepEqual(paperAspect('便利店冷柜旁的 A3 竖版海报'),{name:'A3竖版',width:297,height:420});
  assert.deepEqual(paperAspect('A4 横幅'),{name:'A4横版',width:297,height:210});
  const poster=paperAspect('A3 竖版海报');
  assert.equal(oppositePosterOrientation({width:1620,height:1080},poster),true);
  assert.equal(oppositePosterOrientation({width:1080,height:1439},poster),false);
  assert.equal(oppositePosterOrientation({},poster),false);
  assert.equal(paperAspect('便利店冷柜旁的竖版海报'),null);
  assert.equal(paperAspect('A3 海报'),null);
});
