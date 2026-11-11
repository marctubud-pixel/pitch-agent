import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompleteContentRuntime} from './complete-content-runtime.mjs';
import {contentNodes,CONTENT_PROTOCOL} from './complete-content.mjs';
function options(){
 const bindings={},capabilities={};
 for(const node of contentNodes()){
  const role=node.key==='producer:strategy'?'strategy-lead':node.key==='producer:copy'?'copy-lead':node.role;
  const binding={providerId:'owned-local',model:'owned-local',role};
  bindings[node.key==='producer:strategy'?'strategy':node.key==='producer:copy'?'copy':`content_${node.key.replaceAll(':','_')}`]=binding;
  capabilities[node.key]={operation:CONTENT_PROTOCOL,packetVersion:'content-packet-v3',assignment:{providerId:binding.providerId,model:binding.model},status:'synthetic_fixture',origin:'Owned',version:'owned-v1',limitations:['Synthetic only'],maxImages:4,maxBytes:1024,maxPixels:1024};
 }
 return {store:{},root:'/private/tmp',providers:{},bindings,configuration:{packetVersion:'content-packet-v3',capabilities,allowance:{maxCalls:13,previousMaxCalls:13,origin:'Owned',version:'owned-v1',reason:'Owned bounded test'}}};
}
for(const blank of ['',' ','\t\n']){
 for(const field of ['origin','version'])test(`configuration rejects blank capability ${field} ${JSON.stringify(blank)}`,()=>{const c=options();c.configuration.capabilities.plan[field]=blank;assert.equal(createCompleteContentRuntime(c).capability().configured,false);});
 for(const field of ['origin','version','reason'])test(`configuration rejects blank allowance ${field} ${JSON.stringify(blank)}`,()=>{const c=options();c.configuration.allowance[field]=blank;assert.equal(createCompleteContentRuntime(c).capability().configured,false);});
 test(`configuration rejects blank experiment evidence path ${JSON.stringify(blank)}`,()=>{const c=options();Object.assign(c.configuration.capabilities.plan,{status:'experiment_verified',evidence:[{path:blank,sha256:'a'.repeat(64)}]});assert.equal(createCompleteContentRuntime(c).capability().configured,false);});
}
test('configuration rejects a negative allowance predecessor',()=>{const c=options();c.configuration.allowance.previousMaxCalls=-1;assert.equal(createCompleteContentRuntime(c).capability().configured,false);});
test('valid configured status preserves v2 and v3 without pretending image bounds were tested',()=>{for(const version of ['content-packet-v2','content-packet-v3']){const c=options();c.configuration.packetVersion=version;assert.equal(createCompleteContentRuntime(c).capability().configured,true);assert.equal(createCompleteContentRuntime(c).capability().realQualityVerified,false);}});
test('valid pinned experiment metadata and nonnegative predecessor remain structurally usable',()=>{const c=options();Object.assign(c.configuration.capabilities.plan,{status:'experiment_verified',origin:' Owned ',version:' v1 ',evidence:[{path:' /private/tmp/owned-proof.json ',sha256:'a'.repeat(64)}]});c.configuration.allowance.previousMaxCalls=0;assert.equal(createCompleteContentRuntime(c).capability().configured,true);});
test('v5 requires an actual bounded HTTP adapter and every capability before new effects',()=>{
 const c=options();c.configuration.packetVersion='content-packet-v5';for(const cap of Object.values(c.configuration.capabilities)){cap.packetVersion='content-packet-v5';cap.resourceProfile='bounded-json-v1';}
 c.providers['owned-local']={adapter:'workbench-model-http-v1',model:'owned-local',operatorConfig:{adapter:'workbench-model-http-v1',resourceProfile:'bounded-json-v1'}};
 assert.equal(createCompleteContentRuntime(c).capability().configured,true);
 for(const changed of [x=>{delete x.providers['owned-local'].adapter;},x=>{x.providers['owned-local'].adapter='codex-cli';},x=>{delete x.providers['owned-local'].operatorConfig.adapter;},x=>{delete x.providers['owned-local'].operatorConfig.resourceProfile;},x=>{delete x.configuration.capabilities.plan.resourceProfile;}]){const copy=structuredClone(c);changed(copy);assert.equal(createCompleteContentRuntime(copy).capability().configured,false);}
});
