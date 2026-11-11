import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createBrowserPending,createPendingApi,REFERENCE_UPLOAD_REQUEST_MAX_BYTES} from './browser-pending.mjs';
const storage=()=>{const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
const journal=s=>createBrowserPending({origin:'http://127.0.0.1:4450',storage:s,crypto:webcrypto,withLock:(_key,work)=>work()});
const upload={commandId:'upload-original',expectedRevision:3,base64:'cHJpdmF0ZS1waWN0dXJl',metadata:{representation:'supplied_image',description:'private-description'}};
function receipt(record,operation='reference_upload'){return {protocol:'local-reference-command-receipt-v1',caseId:'p',projectId:'project-p',commandId:record.commandId,operation,state:'committed',requestDigest:record.requestDigest,committedRevision:4,observedRevision:4,nativeCommandHash:'c'.repeat(64),auditHash:'d'.repeat(64),identity:{imageId:'img-original',imageSha256:'a'.repeat(64),...(operation==='reference_material'?{materialId:'material-original',artifactId:'copy-original',copyContentHash:'b'.repeat(64)}:{})},factualAuthority:false,referenceAdoptionVerified:false};}
test('refresh recovers an exact upload commit by GET only without persisting image or description',async()=>{
 const s=storage(),j=journal(s);const record=await j.prepare('/api/cases/p/reference-uploads',upload);await j.unknown(record);const stored=JSON.stringify([...s.values]);assert(!stored.includes(upload.base64));assert(!stored.includes(upload.metadata.description));const calls=[];
 const reopened=createPendingApi({journal:journal(s),request:async(path,body)=>{calls.push([path,body]);return receipt(record);}});await reopened.reconcile();assert.deepEqual(calls,[['/api/cases/p/reference-commands/upload-original',undefined]]);assert.equal(reopened.pending().length,0);
});
test('invalid receipts remain unknown and never fall back to legacy decision or advance acknowledgment',async()=>{
 const j=journal(storage()),record=await j.prepare('/api/cases/p/reference-uploads',upload);
 for(const change of [r=>r.caseId='other',r=>r.commandId='other',r=>r.requestDigest='f'.repeat(64),r=>r.operation='reference_material',r=>r.state='rejected',r=>r.factualAuthority=true,r=>r.referenceAdoptionVerified=true,r=>delete r.identity.imageSha256,r=>r.protocol='legacy',r=>r.observedRevision=0,r=>delete r.auditHash]){const r=receipt(record);change(r);assert.equal(await j.acknowledge(record,{commandReceipt:r,advanceCommand:{commandId:record.commandId,state:'completed'}}),false);assert.equal(j.list()[0].state,'unknown');}
 assert.equal(await j.acknowledge(record,{commandReceipt:receipt(record)}),true);assert.equal(j.list().length,0);
});
test('404 and network uncertainty never resend uploads or permit a different mutation on the same case',async()=>{
 const s=storage(),j=journal(s),record=await j.prepare('/api/cases/p/reference-uploads',upload);await j.unknown(record);let posts=0;const api=createPendingApi({journal:journal(s),request:async(_path,body)=>{if(body)posts++;throw Object.assign(Error('not found'),{status:404});}});await api.reconcile();assert.equal(posts,0);assert.equal(api.pending().length,1);await assert.rejects(()=>api.api('/api/cases/p/continue',{commandId:'different'}),{code:'LOCAL_PENDING_DIFFERENT_REQUEST'});assert.equal(posts,0);
});
test('removed or historical material commits recover registration only with all source identities',async()=>{
 const j=journal(storage()),record=await j.prepare('/api/cases/p/reference-materials',{commandId:'material-original',expectedRevision:4,borrowingNote:'private-purpose'}),r=receipt(record,'reference_material');delete r.identity.copyContentHash;assert.equal(await j.acknowledge(record,{commandReceipt:r}),false);const unrelated=receipt(record,'reference_material');unrelated.identity.materialId='unrelated-material';assert.equal(await j.acknowledge(record,{commandReceipt:unrelated}),false);const complete={...receipt(record,'reference_material'),disposition:'removed',removed:true};assert.equal(await j.acknowledge(record,{commandReceipt:complete}),true);assert.equal(complete.referenceAdoptionVerified,false);
});
test('only the exact upload path gains the bounded large request allowance',async()=>{
 const big='A'.repeat(2*1024*1024+10);const j=journal(storage());await j.prepare('/api/cases/p/reference-uploads',{...upload,base64:big});assert.equal(j.list().length,1);
 for(const path of ['/api/cases/p/reference-materials','/api/cases/p/continue'])await assert.rejects(()=>journal(storage()).prepare(path,{...upload,base64:big}),{code:'LOCAL_PENDING_REQUEST_TOO_LARGE'});
 await assert.rejects(()=>journal(storage()).prepare('/api/cases/p/reference-uploads',{...upload,base64:'A'.repeat(REFERENCE_UPLOAD_REQUEST_MAX_BYTES)}),{code:'LOCAL_PENDING_REQUEST_TOO_LARGE'});
});
