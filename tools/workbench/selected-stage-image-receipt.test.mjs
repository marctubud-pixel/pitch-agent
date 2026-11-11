import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {imageManifest} from './image-evidence.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
for(const withImages of [false,true])test(`synthetic disk receipt retains exact ${withImages?'ordered image':'text-only'} input`,async t=>{
 const root=await mkdtemp(join(tmpdir(),'synthetic-receipt-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const image=n=>({imageId:'img_'+n,sha256:String(n).repeat(64),mediaType:'image/png',byteLength:10,path:join(root,'image-'+n+'.png')});
 const request={runId:'local-test',prompt:'Explicit synthetic response only',outputSchema:{type:'object'},...(withImages?{images:[image(2),image(1)]}: {})};
 const raw={runId:request.runId,model:'synthetic',threadId:'synthetic-thread',responseText:'{}',parsedOutput:{}};
 const result=await diskReceipt(root,request,raw),text=await readFile(result.paths.input,'utf8');
 const expected={runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema,...(withImages?{images:imageManifest(request.images)}:{})};
 assert.equal(text,JSON.stringify(expected));assert.equal(result.inputPacketHash,hash(text));
 assert.deepEqual(JSON.parse(await readFile(result.paths.receipt,'utf8')).images,result.images);
 if(withImages){assert.deepEqual(result.images,request.images);assert.notEqual(result.inputPacketHash,hash(JSON.stringify({...expected,images:expected.images.toReversed()})));request.images[0].path='changed';assert.notEqual(result.images[0].path,'changed');}
 else assert.equal(Object.hasOwn(result,'images'),false);
});
test('synthetic receipt binds the review envelope and enforces its image limits',async t=>{
 const root=await mkdtemp(join(tmpdir(),'synthetic-envelope-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const images=[{imageId:'img_review',sha256:'a'.repeat(64),mediaType:'image/png',byteLength:10,path:join(root,'synthetic.png')}];
 const imageEnvelope={operation:'sketch-review-v2',limits:{maxImages:1,maxBytes:10,maxPixels:100}};
 const request={runId:'local-envelope',prompt:'Synthetic review',outputSchema:{type:'object'},images,imageEnvelope};
 const raw={runId:request.runId,model:'synthetic',threadId:'synthetic-thread',responseText:'{}',parsedOutput:{}};
 const result=await diskReceipt(root,request,raw),input=await readFile(result.paths.input,'utf8');
 assert.deepEqual(JSON.parse(input).imageEnvelope,imageEnvelope);assert.equal(result.inputPacketHash,hash(input));
 await assert.rejects(()=>diskReceipt(root,{...request,runId:'over-limit',imageEnvelope:{...imageEnvelope,limits:{...imageEnvelope.limits,maxBytes:9}}},{...raw,runId:'over-limit'}),/Review aggregate byte bound exceeded/);
});
