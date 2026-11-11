import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLocalAcceptanceAssetCatalogue,validatePosterCase} from './asset-catalogue.mjs';
test('source-linked catalogue preserves task use and refuses inferred approval',async()=>{
  const c=await loadLocalAcceptanceAssetCatalogue();
  assert.equal(c.m6.posters.filter(r=>r.role==='same-use-master-kv').length,5);
  assert.equal(c.m6.posters.find(r=>r.id==='BH07').role,'auxiliary-reference');
  assert.equal(c.m6.historicalAiArtApproved,false);assert.equal(c.dexian.realProductImageAvailable,false);
  assert.equal(c.dexian.packaging.length,4);assert(c.dexian.packaging.every(r=>/^[a-f0-9]{64}$/.test(r.sha256)&&r.sourceUrl));
  assert.equal(c.layout.userApprovedScope,'layout only');assert.equal(c.generatedMockup.realPlacement,false);
});
test('a scene photo or interactive summary cannot become same-use master KV',()=>{
  const source={id:'BH01',source_url:'https://example.test',visually_checked:true};
  for(const format of ['场景摄影','互动应用样本','活动实拍'])assert.throws(()=>validatePosterCase({...source,format},'BH01','same-use-master-kv'),{code:'LOCAL_REFERENCE_USE_MISMATCH'});
  assert.throws(()=>validatePosterCase({id:'BH07',format:'平台活动KV',source_url:'https://example.test',visually_checked:true},'BH07','same-use-master-kv'));
});
