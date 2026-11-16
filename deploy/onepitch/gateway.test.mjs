import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {randomBytes,scryptSync} from 'node:crypto';
import {createPortal} from './gateway.mjs';

test('private gateway authenticates downloads and revokes the active cookie',async t=>{
  const upstream=http.createServer((req,res)=>res.end('private file'));
  const bind=async server=>{
    server.listen(0,'127.0.0.1');await once(server,'listening');
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    return server.address().port;
  };
  const upstreamPort=await bind(upstream);
  const password=randomBytes(24).toString('hex'),salt=randomBytes(16);
  const origin='https://onepitch.cn';
  const gateway=createPortal({origin,account:'owner',upstreamPort,salt:salt.toString('hex'),
    verifier:scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex')});
  const port=await bind(gateway);
  const send=(path,method='GET',headers={},body)=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{host:'onepitch.cn',...headers}},res=>{
      res.resume();res.on('end',()=>resolve(res));
    });
    req.on('error',reject);req.end(body);
  });
  const path='/api/projects/123/files/test';
  assert.equal((await send(path)).statusCode,401);
  assert.equal((await send('/private.png')).headers.location,'/login');
  const form={origin,'content-type':'application/x-www-form-urlencoded'};
  assert.equal((await send('/login','POST',form,'account=owner&password=wrong')).statusCode,401);
  const login=await send('/login','POST',form,'account=owner&password='+password);
  assert.equal(login.statusCode,303);
  const header=login.headers['set-cookie'][0];assert.match(header,/HttpOnly/);assert.match(header,/Secure/);
  const cookie=header.split(';')[0];assert.equal((await send(path,'GET',{cookie})).statusCode,200);
  assert.equal((await send('/logout','POST',{cookie,origin:'https://example.org'})).statusCode,403);
  assert.equal((await send('/logout','POST',{cookie,origin})).statusCode,303);
  assert.equal((await send(path,'GET',{cookie})).statusCode,401);
});
