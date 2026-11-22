import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkCodex, pythonBinary} from './runtime-dependencies.mjs';
import {strategyCarrier} from './strategy-one-pager.mjs';

test('explicit carrier takes precedence over a dual-carrier research suggestion', () => {
  const inputs = {texts:[{name:'report',text:'## 检索前锚点\n研究载体：包装与KV'}]};
  const project = {artifacts:[{name:'report',stage:'research',kind:'text'}]};
  for (const proposalKind of ['packaging','kv']) assert.equal(strategyCarrier({...project,proposalKind},inputs),proposalKind);
  assert.equal(strategyCarrier(project,inputs),'packaging+kv');
});

test('explicit interpreter and CLI version are checked before model work', async t => {
  const old = process.env.NIGHTFLIGHT_PYTHON;
  t.after(()=>{if(old===undefined) delete process.env.NIGHTFLIGHT_PYTHON; else process.env.NIGHTFLIGHT_PYTHON=old;});
  process.env.NIGHTFLIGHT_PYTHON='relative';
  await assert.rejects(pythonBinary(), /绝对路径/);
  process.env.NIGHTFLIGHT_PYTHON='/work/venv/bin/python';
  assert.equal(await pythonBinary(),process.env.NIGHTFLIGHT_PYTHON);
  await assert.rejects(checkCodex(process.execPath), /Codex CLI/);
});
