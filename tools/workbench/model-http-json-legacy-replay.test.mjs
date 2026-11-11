import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,writeFile,readdir,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import * as crypto from 'node:crypto';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const frozenBytes=await readFile(new URL('./fixtures/model-http-authority-v1-source.txt',import.meta.url));
const {default:ignoredDefault,...cryptoExports}=crypto;
mock.module('node:crypto',{namedExports:{...cryptoExports,randomUUID:()=> '11111111-1111-4111-8111-111111111111'}});
const legacySource=frozenBytes.toString().replace("'./image-evidence.mjs'",JSON.stringify(new URL('./image-evidence.mjs',import.meta.url).href));
const {createModelHttpAuthority:legacy}=await import('data:text/javascript;base64,'+Buffer.from(legacySource).toString('base64'));
const {createModelHttpAuthority:current}=await import('./model-http-authority.mjs');
const {ordinarySuccess,ordinaryHttpLocator}=await import('./ordinary-model-claims.mjs');
const json=x=>Buffer.from(JSON.stringify(x));
async function files(root,prefix=''){const out=[];for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name),name=join(prefix,entry.name);if(entry.isDirectory())out.push(...await files(path,name));else out.push({path:name,sha256:hash(await readFile(path))});}return out.sort((a,b)=>a.path.localeCompare(b.path));}
test('historical v1 frozen source and current reader preserve exact bytes, hashes, outcomes and deep/wide JSON',async t=>{
 const root=await realpath(await mkdtemp('/private/tmp/http-json-legacy-replay-')),requests=[];let output='{}',status=200;
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),q=JSON.parse(bytes);requests.push(bytes);res.statusCode=status;res.end(status===200?json({protocol:q.protocol,invocationId:q.invocationId,contextMode:q.contextMode,terminal:'completed',outputText:output,reportedModel:null,requestId:null,usage:{inputTokens:null,outputTokens:null}}):'historical plain rejection');});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const cfg={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:'legacy',serviceIdentity:'legacy-service',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:30000,maxRequestBytes:1048576,maxResponseBytes:8*1048576,maxOutputBytes:2*1048576,vision:false,envelopes:[]},records=[];
 for(const [name,text,httpStatus] of [['success','{}',200],['depth129','['.repeat(129)+'0'+']'.repeat(129),200],['structural200001','['+'0,'.repeat(199999)+'0]',200],['rejection','unused',429],['unknown','{',200]]){
  output=text;status=httpStatus;const c={attemptId:name,binding:{providerId:'legacy',model:'legacy',role:'worker'},request:{runId:name,prompt:'Frozen legacy input'},logicalInputBytes:json({runId:name,model:'legacy',prompt:'Frozen legacy input'}),runtimePacketBytes:Buffer.from('historical opaque runtime')};
  const oldRoot=join(root,name+'-legacy'),newRoot=join(root,name+'-current'),old=legacy({rootDir:oldRoot,operatorConfig:cfg}),now=current({rootDir:newRoot,operatorConfig:cfg}),a=await old.invoke(c),b=await now.invoke(c);assert.deepEqual(b,a);assert.deepEqual(requests.at(-1),requests.at(-2));assert.deepEqual(await files(newRoot),await files(oldRoot));
  if(a.savedExecution||a.savedFailure){const saved=a.savedExecution??a.savedFailure;assert.deepEqual(await current({rootDir:oldRoot}).reopen({...c,savedExecution:saved}),a);assert.deepEqual(await current({rootDir:oldRoot}).reopen({...c,attemptLocator:ordinaryHttpLocator(c.attemptId)}),a);if(a.savedExecution)assert.equal(ordinarySuccess(saved),true);}
  const calls=requests.length;assert.deepEqual(await now.invoke(c),name==='unknown'?{kind:'unknown',code:'existing-attempt'}:a);assert.equal(requests.length,calls);
  records.push({name,outcome:a.kind,files:await files(oldRoot),wireSha256:hash(requests.at(-1))});
 }
 const report={root,baselineSourceSha256:hash(frozenBytes),node:process.version,records};await writeFile(join(root,'legacy-byte-replay.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({legacyReplay:join(root,'legacy-byte-replay.json'),cases:records.length,sourceSha256:report.baselineSourceSha256}));
});
