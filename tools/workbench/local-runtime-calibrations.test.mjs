import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeLocalCalibrations} from './local-acceptance-runtime.mjs';
test('shared strategy calibration is replaced once before dispatch, while distinct stage profiles remain',()=>{
  const a={protocolVersion:'v1',stage:'strategy',role:'strategy',providerId:'local-synthetic',model:'synthetic',evidenceHash:'original'},b={...a,evidenceHash:'selected'};
  const c={...a,stage:'copy',role:'brand'};
  const profiles=mergeLocalCalibrations([a],[b,c]);assert.equal(profiles.length,2);assert.equal(profiles[0],b);assert.equal(profiles[1],c);
  assert.throws(()=>mergeLocalCalibrations([{...a,providerId:undefined}]),{code:'LOCAL_CALIBRATION_IDENTITY_REQUIRED'});
});
