import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readEngineeringIntentOriginal,engineeringReviewDisposition,validateEngineeringAdoption} from './local-engineering-panel.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const binding={reviewId:'engineering-review',sourceBindingHash:'current-source',evidenceHash:'actual-source-evidence',reviewEvidenceHash:'actual-call-receipts',gatesHash:'current-native-gates'};
const adoption=()=>({protocol:'local-engineering-adoption-v1',...binding,commandId:'explicit-human-approval',reason:'I confirm this local engineering draft, not production delivery.',actor:{actorType:'human',actorId:'local-user'},productionFinalAuthority:false});
test('real tiny journal intent survives reopen and missing or altered successful intent is rejected',async t=>{
 const root=await mkdtemp(join(tmpdir(),'engineering-intent-'));t.after(()=>rm(root,{recursive:true,force:true}));const text=JSON.stringify({callId:'primary:content',reviewId:'engineering-review'}),file=join(root,'intent.json');await writeFile(file,text);
 const request={root,folder:root,callId:'primary:content',reviewId:'engineering-review',expectedHash:sha(text)};
 assert.equal((await readEngineeringIntentOriginal(request)).sha256,sha(text));assert.equal((await readEngineeringIntentOriginal({...request})).byteLength,Buffer.byteLength(text));
 await writeFile(file,JSON.stringify({callId:'primary:content',reviewId:'changed'}));await assert.rejects(()=>readEngineeringIntentOriginal(request),{code:'LOCAL_ENGINEERING_INTENT_CHANGED'});
 await writeFile(file,text);await assert.rejects(()=>readEngineeringIntentOriginal({...request,expectedHash:'b'.repeat(64)}),{code:'LOCAL_ENGINEERING_INTENT_CHANGED'});
 await unlink(file);await assert.rejects(()=>readEngineeringIntentOriginal(request),{code:'LOCAL_ENGINEERING_INTENT_MISSING'});
});
test('all mechanical calls and director approval do not bypass the actual native human gate',()=>{
 const request={reviewDone:true,localGates:[{id:'human:final_review'}],binding};assert.equal(engineeringReviewDisposition(request).status,'awaiting_user');assert.equal(engineeringReviewDisposition({...request,adoption:adoption()}).status,'complete');assert.equal(engineeringReviewDisposition({...request,reviewDone:false,adoption:adoption()}).status,'pending');
});
test('human adoption binds current review/source/evidence and cannot be invented by an agent',()=>{
 for(const key of ['reviewId','sourceBindingHash','evidenceHash','reviewEvidenceHash','gatesHash']){const changed=adoption();changed[key]='old';assert.throws(()=>validateEngineeringAdoption(changed,binding),{code:'LOCAL_ENGINEERING_ADOPTION_STALE'});}
 const agent=adoption();agent.actor.actorType='agent';assert.throws(()=>validateEngineeringAdoption(agent,binding),{code:'LOCAL_ENGINEERING_EXPLICIT_HUMAN_REQUIRED'});
 assert.equal(engineeringReviewDisposition({reviewDone:true,localGates:[],binding}).status,'complete');assert.throws(()=>engineeringReviewDisposition({reviewDone:true,localGates:[],adoption:adoption(),binding}),{code:'LOCAL_ENGINEERING_NO_HUMAN_GATE'});
});
