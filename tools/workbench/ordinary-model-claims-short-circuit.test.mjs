import test from 'node:test';
import assert from 'node:assert/strict';
import {ordinarySameContext,ordinarySuccess,ordinaryHttpLocator,ORDINARY_HTTP_PROVIDER,ORDINARY_HTTP_PROTOCOL} from './ordinary-model-claims.mjs';

function syntacticClaim(invocationId='invocation-a'){
 const attemptId='pure-context-claim',wireRequestHash='a'.repeat(64),origin={serviceIdentity:'pure-context-service',invocationId,configurationHash:'b'.repeat(64)};
 return {provider:ORDINARY_HTTP_PROVIDER,protocol:ORDINARY_HTTP_PROTOCOL,attemptId,runId:'pure-context-run',requestedModel:'pure-context-model',reportedModel:null,inputPacketHash:'c'.repeat(64),runtimePacketHash:'d'.repeat(64),wireRequestHash,responseText:'{}',origin,original:{rootRelativePath:ordinaryHttpLocator(attemptId).rootRelativePath,manifestHash:'e'.repeat(64)},context:{kind:'isolated-http-call',namespace:origin.serviceIdentity,invocationId,requestHash:wireRequestHash,isolation:'stateless-v1'},usage:{inputTokens:null,outputTokens:null},cost:null};
}
function countedJSONParse(action){
 const parse=JSON.parse;let calls=0;
 JSON.parse=function(...args){calls++;return parse.apply(this,args);};
 try{return {value:action(),calls};}finally{JSON.parse=parse;}
}
test('different valid HTTP contexts skip parsing both response bodies',()=>{
 const a=syntacticClaim(),b=syntacticClaim('invocation-b');assert.equal(ordinarySuccess(a),true);assert.equal(ordinarySuccess(b),true);
 assert.deepEqual(countedJSONParse(()=>ordinarySameContext(a,b)),{value:false,calls:0});
 assert.deepEqual(countedJSONParse(()=>ordinarySameContext(b,a)),{value:false,calls:0});
});
test('matching valid HTTP contexts fully parse both receipts',()=>{
 const a=syntacticClaim(),b=structuredClone(a);
 assert.deepEqual(countedJSONParse(()=>ordinarySameContext(a,b)),{value:true,calls:2});
});
test('matching context cannot turn malformed JSON into a successful claim',()=>{
 const a=syntacticClaim();a.responseText='{';
 assert.deepEqual(countedJSONParse(()=>ordinarySameContext(a,a)),{value:false,calls:1});
});
test('missing or malformed context and null inputs remain false without throwing',()=>{
 for(const context of [undefined,null,{},[],42,'context']){
  const a=syntacticClaim();a.context=context;
  assert.equal(ordinarySameContext(a,a),false);assert.equal(ordinarySameContext(a,syntacticClaim()),false);assert.equal(ordinarySameContext(syntacticClaim(),a),false);
 }
 for(const value of [null,undefined,false,0,'']){assert.equal(ordinarySameContext(value,syntacticClaim()),false);assert.equal(ordinarySameContext(syntacticClaim(),value),false);}
});
test('legacy thread comparison and mixed HTTP/legacy behavior are preserved',()=>{
 const a={provider:'codex-cli',threadId:'legacy-a'},b={provider:'codex-cli',threadId:'legacy-b'};
 assert.equal(ordinarySameContext(a,{...a}),true);assert.equal(ordinarySameContext(a,b),false);
 assert.equal(ordinarySameContext(a,syntacticClaim()),false);assert.equal(ordinarySameContext(syntacticClaim(),a),false);
});

test('bounded matching claims still enforce JSON grammar while disjoint claims avoid parsing',()=>{
 const bounded=invocation=>{const r=syntacticClaim(invocation),locator=ordinaryHttpLocator(r.attemptId,{resourceProfile:'bounded-json-v1'});r.protocol=locator.protocol;r.original.rootRelativePath=locator.rootRelativePath;return r;};
 const a=bounded('bounded-a'),b=bounded('bounded-b');assert.equal(ordinarySuccess(a),true);assert.equal(ordinarySuccess(b),true);
 assert.deepEqual(countedJSONParse(()=>ordinarySameContext(a,b)),{value:false,calls:0});
 assert.equal(ordinarySameContext(a,structuredClone(a)),true);
 const bad=structuredClone(a);bad.responseText='['.repeat(129)+'0'+']'.repeat(129);assert.equal(ordinarySuccess(bad),false);assert.equal(ordinarySameContext(a,bad),false);
});
