import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,realpath,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from './server.mjs';
import {cardHash} from './intake-contract.mjs';
const pythonBinary='/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
test('an actual terminated intake model owner reopens as unknown and never automatically redispatches',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'intake-death-'))),script=join(root,'child.mjs'),dbPath=join(root,'db');t.diagnostic(`Synthetic process-death evidence ${root}`);
 await writeFile(script,`import {createServer} from ${JSON.stringify(new URL('./server.mjs',import.meta.url).href)};const server=createServer({dbPath:${JSON.stringify(dbPath)},rootDir:${JSON.stringify(root)},port:0,imageProvider:null,intakeConfiguration:{pythonBinary:${JSON.stringify(pythonBinary)}},bindings:{intake:{providerId:'synthetic',model:'synthetic',role:'intake-lead'}},providers:{synthetic:{model:'synthetic',async execute(){console.log('DISPATCHED');return new Promise(()=>{});}}}});server.listen(0,'127.0.0.1',()=>console.log('PORT '+server.address().port));`);
 const child=spawn(process.execPath,[script],{stdio:['ignore','pipe','pipe']});let text='',errors='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>errors+=b);
 const exited=once(child,'exit');let dead=false;t.after(async()=>{if(!dead){child.kill('SIGKILL');await exited;}});
 const until=async predicate=>{const deadline=Date.now()+10000;while(!predicate()){assert.ok(Date.now()<deadline,errors);await new Promise(r=>setTimeout(r,10));}};await until(()=>/PORT (\d+)/.test(text));const port=Number(/PORT (\d+)/.exec(text)[1]);
 async function request(path,body){const r=await fetch(`http://127.0.0.1:${port}${path}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(r.status<300,await r.clone().text());return r.json();}
 let p=(await request('/api/projects',{name:'Synthetic death',brief:'Packaging\nExplore blue packaging\nAge 25',commandId:'create'})).project;const route=`/api/v1/projects/${p.id}`;
 const upload=await request(route+'/documents',{base64:(await readFile(new URL('./fixtures/intake/mixed.pdf',import.meta.url))).toString('base64'),originalFilename:'mixed.pdf',commandId:'upload',expectedRevision:p.revision});
 for(let i=0;i<100;i++){p=(await request(route)).project;if(p.jobs[0].status==='succeeded')break;await new Promise(r=>setTimeout(r,20));}assert.equal(p.jobs[0].status,'succeeded');
 const extraction=await request(route+'/task-card-extractions',{documentIds:[upload.documentId],baseTaskCardId:p.activeTaskCardId,baseTaskCardHash:cardHash(p.taskCards[0]),commandId:'extract',expectedRevision:p.revision});await until(()=>text.includes('DISPATCHED'));p=(await request(route)).project;assert.equal(p.jobs.at(-1).status,'running');assert.equal(p.jobs.at(-1).attempts[0].dispatchStarted,true);child.kill('SIGKILL');await exited;dead=true;
 let calls=0;const server=createServer({dbPath,rootDir:root,port:0,imageProvider:null,intakeConfiguration:{pythonBinary},bindings:{intake:{providerId:'synthetic',model:'synthetic',role:'intake-lead'}},providers:{synthetic:{model:'synthetic',async execute(){calls++;throw new Error('must not run');}}}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));await server.drain();const reopened=await fetch(`http://127.0.0.1:${server.address().port}${route}`).then(r=>r.json());const job=reopened.project.jobs.find(j=>j.id===extraction.jobId);assert.equal(job.status,'awaiting_reconciliation');assert.equal(job.attempts.length,1);assert.equal(job.error.code,'INTERRUPTED');assert.equal(calls,0);assert.equal(reopened.project.intakeDrafts.length,0);
});
