import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from './server.mjs';

test('content revision endpoint validates public input before any execution', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'content-route-'));
  const server=createServer({dbPath:join(dir,'test.sqlite'),rootDir:join(dir,'executions'),imageProvider:null});
  const handler=server.listeners('request')[0];
  async function request(path,body,method='POST') {
    const req=Readable.from([JSON.stringify(body)]);
    Object.assign(req,{method,url:`/api/projects/p/${path}`,headers:{host:'127.0.0.1:4181','content-type':'application/json'}});
    let status,output;
    await handler(req,{setHeader(){},writeHead(value){status=value;},end(value){output=JSON.parse(value);}});
    return {status,output};
  }
  try {
    for(const path of ['content-continuations','content-revisions']) {
      for(const key of ['packetVersion','source','visibility','findings','capabilities','assignments','sourceContents','predecessorRootJobId','correction','rootJobId']) {
        const result=await request(path,{commandId:'test',expectedRevision:0,[key]:'forged'});
        assert.equal(result.status,400,`${path} rejected ${key}: ${JSON.stringify(result)}`);
        assert.equal(result.output.error.code,'INVALID_REQUEST');
      }
      const result=await request(path,{commandId:'test',expectedRevision:-1});
      assert.equal(result.status,400);
      assert.equal(result.output.error.code,'INVALID_REQUEST');
      assert.equal((await request(path,{},'GET')).status,404);
    }
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
