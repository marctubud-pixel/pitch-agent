import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeProjectedContentSource,neutralContent,contentNodes,contentRootId,contentSourceLocations,contentRequest} from './complete-content.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/content-legacy-bytes.json',import.meta.url),'utf8'));
test('frozen pre-change v3/v2 source, locations and v2/v3 model packets replay exact bytes',()=>{
 const binding=role=>({role,providerId:'frozen-synthetic',model:'historical'}),project={jobs:[{id:'visual-job',binding:binding('visual-lead'),status:'queued',attempts:[]}],artifacts:[]};
 const projected=makeProjectedContentSource(project,fixture.basis);assert.equal(JSON.stringify(projected),JSON.stringify(fixture.projected));assert.equal(JSON.stringify(neutralContent(projected)),JSON.stringify(fixture.neutral));
 const assignments=Object.fromEntries(contentNodes().map(n=>[n.key,binding(n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role)]));
 for(const packetVersion of ['content-packet-v2','content-packet-v3']){
  const source=packetVersion==='content-packet-v3'?projected:fixture.basis,root={id:contentRootId(source.sourceHash,packetVersion),task:{packetVersion,source,assignments},node:contentNodes()[0]};
  assert.equal(JSON.stringify({rootId:root.id,locations:contentSourceLocations(root),...contentRequest(project,root,root.node)}),JSON.stringify(fixture.packets[packetVersion]));
 }
});
