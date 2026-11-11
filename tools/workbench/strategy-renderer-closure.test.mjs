import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {layoutRendererIdentity,verifyLayoutRenderer} from './layout-renderer.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('strategy-v2 content dependency closure verifies and historical renderer identity cannot approve new bytes',async()=>{
 const identity=await layoutRendererIdentity();assert.deepEqual(await verifyLayoutRenderer(identity),identity);
 const historical={identity:'semantic-layout-v2-frozen-source',closureHash:'8bb1bf3907135de740bc04432400e6c7a29bde14357ab8f536e473130268e584'};
 assert.notEqual(identity.closureHash,historical.closureHash);await assert.rejects(()=>verifyLayoutRenderer(historical),{code:'LAYOUT_RENDERER_CHANGED'});
 const manifest=JSON.parse(await readFile(new URL('../../renderer-source-manifest.json',import.meta.url)));
 for(const name of ['strategy-contract','complete-content','evidence-review','visual-catalogue','image-observation-review','reference-dossier','reference-library']){const path=`tools/workbench/${name}.mjs`,entry=manifest.find(e=>e.path===path),bytes=await readFile(new URL(`../../${path}`,import.meta.url));assert.ok(entry);assert.equal(entry.sha256,hash(bytes));assert.equal(entry.bytes,bytes.length);}
});
