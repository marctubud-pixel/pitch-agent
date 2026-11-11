import test from 'node:test';
import assert from 'node:assert/strict';
import {ordinaryExecutionIdentity,ordinaryIdentitySameContext,ordinarySuccess,ordinarySameContext,ordinaryOriginMatches,ordinaryHttpLocator,ORDINARY_HTTP_PROVIDER,ORDINARY_HTTP_PROTOCOL} from './ordinary-model-claims.mjs';

function syntacticHttpClaim(){
 const attemptId='pure-claim-attempt',wireRequestHash='a'.repeat(64),origin={serviceIdentity:'pure-claim-service',invocationId:'pure-claim-invocation',configurationHash:'b'.repeat(64)};
 return {provider:ORDINARY_HTTP_PROVIDER,protocol:ORDINARY_HTTP_PROTOCOL,attemptId,runId:'pure-claim-run',requestedModel:'pure-claim-model',reportedModel:null,inputPacketHash:'c'.repeat(64),runtimePacketHash:'d'.repeat(64),wireRequestHash,responseText:'{}',origin,original:{rootRelativePath:ordinaryHttpLocator(attemptId).rootRelativePath,manifestHash:'e'.repeat(64)},context:{kind:'isolated-http-call',namespace:origin.serviceIdentity,invocationId:origin.invocationId,requestHash:wireRequestHash,isolation:'stateless-v1'},usage:{inputTokens:null,outputTokens:null},cost:null};
}

test('legacy identity bytes and exact thread comparisons ignore arbitrary actor metadata',()=>{
 const receipt={provider:'codex-cli',threadId:'legacy-original-thread'},http=syntacticHttpClaim();
 for(const context of [{actorId:'old-agent',runId:'old-run',contextId:'old-context'},{actorId:'old-agent',version:'historical-actor-v2'},{actorId:'old-agent',modelContext:{description:'unrelated actor metadata'}},{actorId:'old-agent',version:'ordinary-http-source-identity-v1',modelContext:http.context},{actorId:'old-agent',threadId:'actor-metadata-thread',version:null,modelContext:null}]){
  const identity=ordinaryExecutionIdentity(context,receipt);
  assert.equal(JSON.stringify(identity),JSON.stringify({...context,threadId:receipt.threadId}));
  assert.equal(ordinaryIdentitySameContext(identity,receipt),true);
  assert.equal(ordinaryIdentitySameContext(identity,{threadId:receipt.threadId}),true);
  assert.equal(ordinaryIdentitySameContext(identity,{...receipt,threadId:'another-thread'}),false);
  assert.equal(ordinaryIdentitySameContext(identity,http),false);
  assert.equal(ordinaryIdentitySameContext(identity,{provider:'unrecognized',threadId:receipt.threadId}),false);
 }
});

test('HTTP identity has its explicit version and cannot inherit a CLI context from actor metadata',()=>{
 const receipt=syntacticHttpClaim();assert.equal(ordinarySuccess(receipt),true);
 const actor={actorId:'http-agent',runId:'actor-run',contextId:'actor-context',threadId:'legacy-original-thread',version:'actor-v2',modelContext:{metadata:true}};
 const identity=ordinaryExecutionIdentity(actor,receipt);
 assert.deepEqual(identity,{actorId:actor.actorId,runId:actor.runId,contextId:actor.contextId,version:'ordinary-http-source-identity-v1',modelContext:receipt.context});
 assert.equal(Object.hasOwn(identity,'threadId'),false);
 assert.equal(ordinaryIdentitySameContext(identity,receipt),true);
 assert.equal(ordinaryIdentitySameContext(identity,{provider:'codex-cli',threadId:actor.threadId}),false);
 assert.equal(ordinaryIdentitySameContext({...identity,threadId:actor.threadId},receipt),false);
 assert.equal(ordinaryIdentitySameContext({...identity,version:'actor-v2'},receipt),false);
 const untagged=structuredClone(identity);delete untagged.version;assert.equal(ordinaryIdentitySameContext(untagged,receipt),false);
 assert.equal(ordinaryIdentitySameContext({...identity,modelContext:{...receipt.context,invocationId:'another-invocation'}},receipt),false);
 assert.equal(ordinarySameContext(receipt,{provider:'codex-cli',threadId:actor.threadId}),false);
 assert.equal(ordinarySameContext({provider:'codex-cli',threadId:actor.threadId},receipt),false);
 assert.equal(actor.version,'actor-v2');assert.deepEqual(actor.modelContext,{metadata:true});
});

test('invalid success claims cannot match an HTTP source identity or downgrade through a locator',()=>{
 const receipt=syntacticHttpClaim(),identity=ordinaryExecutionIdentity({actorId:'http-agent'},receipt),locator=ordinaryHttpLocator(receipt.attemptId);
 assert.equal(ordinaryOriginMatches(receipt,locator,receipt.attemptId),true);
 for(const change of [r=>{delete r.original.manifestHash;},r=>{r.original.manifestHash=null;},r=>{r.original.manifestHash='invalid';},r=>{r.context.invocationId='another-invocation';},r=>{r.verified=true;},r=>{r.threadId='forged-cli';},r=>{r.exitCode=0;}]){
  const changed=structuredClone(receipt);change(changed);
  assert.equal(ordinarySuccess(changed),false);
  assert.equal(ordinaryIdentitySameContext(identity,changed),false);
  assert.equal(ordinaryOriginMatches(changed,locator,receipt.attemptId),false);
 }
 assert.equal(ordinaryOriginMatches({provider:'codex-cli',threadId:'forged-cli',exitCode:0},locator,receipt.attemptId),false);
});
