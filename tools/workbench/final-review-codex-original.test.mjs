import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinalCodexTextInvocation,decodeCodexJSON,serializeFinalCodexInput,finalCodexExecutionSpec} from './final-review-codex-original.mjs';
const packet={protocol:'final-call-packet-v2',operation:'final-review-v1',binding:{attemptId:'test-attempt',callId:'owner:layoutProducer',assignment:{modelIdentity:'explicit-model'}},call:{id:'owner:layoutProducer',phase:'owner_before',personalPixelInspection:false},basis:{frozen:true},predecessorOriginals:[],attachments:[]};
test('first text builder preserves complete packet bytes and explicit request serialization',()=>{
 const packetText=JSON.stringify(packet,null,2)+'\n',built=buildFinalCodexTextInvocation({packetText});
 assert.ok(built.request.prompt.endsWith(packetText));assert.equal(built.request.operation,'final-review-v1');assert.equal(built.request.runId,packet.binding.attemptId);
 assert.equal(built.inputText,serializeFinalCodexInput({...built.request,model:'explicit-model'}));assert.equal(built.schemaText,JSON.stringify(built.request.outputSchema));assert.equal(built.request.outputSchema.properties.result.anyOf.length,3);
 assert.deepEqual(Object.values(finalCodexExecutionSpec('mark')).map(x=>x.suffix),['input.json','plan.json','packet.json','provider-request.json','provider-schema.json']);
});
test('strict boundary refuses duplicate keys nonfinite malformed depth and invalid UTF-8',()=>{
 for(const bytes of ['{"a":1,"a":2}','{"a":1e999}','{"a":','[1,]','['.repeat(130)+'0'+']'.repeat(130),Buffer.from([0xc3,0x28])])assert.throws(()=>decodeCodexJSON(bytes,1048576),e=>e.code==='FINAL_INVALID_JSON');
 assert.deepEqual(decodeCodexJSON('{"a":1}',100),{a:1});
});
test('builder limits first owner operation and attachment-free call',()=>{
 for(const mutation of [p=>p.call.phase='primary',p=>p.binding.callId='owner:finalConsumer',p=>p.attachments.push({}),p=>p.predecessorOriginals.push({}),p=>p.operation='other']){const p=structuredClone(packet);mutation(p);assert.throws(()=>buildFinalCodexTextInvocation({packetText:JSON.stringify(p)}),e=>e.code==='FINAL_PHASE_UNSUPPORTED');}
});
