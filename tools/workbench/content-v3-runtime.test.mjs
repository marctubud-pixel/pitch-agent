import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompleteContentRuntime} from './complete-content-runtime.mjs';
import {contentNodes} from './complete-content.mjs';
const capabilities=Object.fromEntries(contentNodes().map(n=>[n.key,{packetVersion:'content-packet-v3'}]));
test('incomplete v3 capability does not claim a usable runtime contract',()=>{
 const runtime=createCompleteContentRuntime({store:{},root:'/private/tmp',configuration:{packetVersion:'content-packet-v3',capabilities},bindings:{}});
 assert.equal(runtime.capability().configured,false);
 assert.equal(runtime.capability().packetVersion,'content-packet-v3');
});

test('unknown dispatched original execution returns without replay or a new attempt',async()=>{
 let calls=0,commands=0;const job={id:'unknown-v3',status:'awaiting_reconciliation',attempts:[{id:'original',dispatchStarted:true,status:'awaiting_reconciliation'}]};
 const runtime=createCompleteContentRuntime({store:{read:()=>({jobs:[job]}),command(){commands++;}},root:'/private/tmp',providers:{configured:{execute(){calls++;}}},configuration:{packetVersion:'content-packet-v3',capabilities},bindings:{}});
 assert.equal(await runtime.execute('p',job.id),job);assert.equal(job.attempts.length,1);assert.equal(calls,0);assert.equal(commands,0);
});
