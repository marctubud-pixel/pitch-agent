import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {finalCommandWitness,isFinalCommandWitness} from './final-review-command-witness.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const packet=JSON.stringify({protocol:'final-call-packet-v2',binding:{projectId:'p',planId:'plan',inputId:'input'}});
const command={kind:'settle-final-review-call',commandId:'settle-id',setupId:'setup',reservationId:'reservation',callId:'director',attemptId:'attempt',originals:{input:'{ "source": true }',plan:'{}',packet,response:'{}',receipt:'{}',events:'[]'}};
test('bounded typed witness hashes the whole original command and retains exact file descriptors',()=>{const raw=JSON.stringify(command),witness=JSON.parse(finalCommandWitness(command,raw));assert.equal(witness.representation,'original_command_digest');assert.equal(witness.originalCommand.sha256,sha(raw));assert.equal(witness.originalCommand.bytes,Buffer.byteLength(raw));assert.equal(witness.managedOriginals.length,6);for(const d of witness.managedOriginals){assert.equal(d.relativePath,`${command.attemptId}/${d.name}.json`);assert.equal(d.sha256,sha(command.originals[d.name]));assert.equal(d.bytes,Buffer.byteLength(command.originals[d.name]));}const changed={...command,originals:{...command.originals,input:command.originals.input+' '}};assert.notEqual(finalCommandWitness(changed,JSON.stringify(changed)),finalCommandWitness(command,raw));assert.ok(Buffer.byteLength(JSON.stringify(witness))<=16384);});
test('v1 original fingerprints and all newly integrated reference commands remain raw command JSON',()=>{const v1={...command,originals:{...command.originals,packet:JSON.stringify({protocol:'final-call-packet-v1'})}};const raw=JSON.stringify(v1);assert.equal(finalCommandWitness(v1,raw),raw);for(const kind of ['anchor-reference-result','anchor-reference-normalized','recover-reference-result','complete-owner','complete-sketch-text','release-stage','prepare-project-layout','reuse-readiness-generation','resume-creative-panel','register-image','request-sketch-review','request-final-visual','request-content-visibility-continuation']){const c={...command,kind},raw=JSON.stringify(c);assert.equal(finalCommandWitness(c,raw),raw);assert.deepEqual(JSON.parse(raw),c);}});

test('canonical serialized witness validator accepts both reducer command shapes and refuses malformed shapes',()=>{
 const settled=JSON.parse(finalCommandWitness(command,JSON.stringify(command)));
 const dispatched={...command,kind:'mark-final-review-dispatched',originals:Object.fromEntries(['input','plan','packet'].map(name=>[name,command.originals[name]]))};
 assert.equal(isFinalCommandWitness(settled),true);
 assert.equal(isFinalCommandWitness(JSON.parse(finalCommandWitness(dispatched,JSON.stringify(dispatched)))),true);
 const mutations=[
  w=>{w.extra=true;},w=>{w.relationship.extra=true;},w=>{delete w.relationship.projectId;},w=>{w.relationship.setupId=3;},
  w=>{w.relationship.attemptId='../attempt';},w=>{w.commandId='';},w=>{w.kind='complete-owner';},
  w=>{w.originalCommand.extra=true;},w=>{w.originalCommand.bytes=Number.MAX_SAFE_INTEGER+1;},
  w=>{w.managedOriginals[0].bytes=-1;},w=>{w.managedOriginals[0].sha256='bad';},w=>{w.managedOriginals[0].protocol='v1';},
  w=>{w.managedOriginals[0].relativePath='other/input.json';},w=>{w.managedOriginals[0].extra=true;},
  w=>{w.managedOriginals[0].name='unknown';},w=>{w.managedOriginals[1]=w.managedOriginals[0];},
  w=>{w.managedOriginals.pop();},w=>{w.kind='mark-final-review-dispatched';},
 ];
 for(const mutate of mutations){const w=structuredClone(settled);mutate(w);assert.equal(isFinalCommandWitness(w),false);}
 for(const w of [null,[],{},'final-command-witness-v2'])assert.equal(isFinalCommandWitness(w),false);
});

test('Codex precharge witness hashes Buffers without replacement decoding and uses exact execution suffixes',()=>{
 const original={...command,kind:'mark-final-review-dispatched',callId:'owner:layoutProducer',originals:{input:Buffer.from([0xff]),plan:Buffer.from('{}'),packet:Buffer.from(packet),providerRequest:Buffer.from('request'),providerSchema:Buffer.from('schema')}};
 const raw=JSON.stringify(original),w=JSON.parse(finalCommandWitness(original,raw));assert.equal(w.protocol,'final-command-witness-codex-text-v1');assert.equal(isFinalCommandWitness(w),true);assert.equal(w.managedOriginals[0].sha256,sha(Buffer.from([0xff])));assert.ok(w.managedOriginals.every(d=>d.root==='execution'));assert.equal(w.managedOriginals.find(d=>d.name==='providerRequest').relativePath,'attempt/provider-request.json');
 for(const mutate of [w=>w.managedOriginals[0].root='upstream',w=>w.managedOriginals[0].relativePath='../input.json',w=>w.managedOriginals.pop(),w=>w.managedOriginals[0].bytes=32*1024**2+1,w=>w.kind='reconcile-final-review-call']){const changed=structuredClone(w);mutate(changed);assert.equal(isFinalCommandWitness(changed),false);}
});
