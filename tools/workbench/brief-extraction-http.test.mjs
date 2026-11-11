import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,readFile,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createBriefServer} from './brief-server.mjs';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createLocalPdfExtractor} from './intake-pdf.mjs';
import {cardHash} from './intake-contract.mjs';

const bytes=Buffer.from('%PDF-1.7\n% Storage-only fixture: parsing is not claimed.\n%%EOF');
const close=server=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
async function fixture(t,options={}){
  const root=await realpath(await mkdtemp(join(tmpdir(),'brief-original-http-'))),dbPath=join(root,'test.sqlite');
  let server=createBriefServer({dbPath,...options});
  t.after(async()=>{await close(server);await rm(root,{recursive:true,force:true});});
  return {dbPath,async reopen(nextOptions=options){await close(server);server=createBriefServer({dbPath,...nextOptions});},
    request(path,body,{method=body===undefined?'GET':'POST',headers={}}={}){
      const raw=body===undefined?'':JSON.stringify(body),req=Readable.from([Buffer.from(raw)]);
      Object.assign(req,{url:path,method,headers:{host:'127.0.0.1:4182','content-type':'application/json',...headers}});
      return new Promise(resolve=>{
        const result={headers:{}};
        server.emit('request',req,{setHeader(key,value){result.headers[key.toLowerCase()]=value;},writeHead(status,values){result.status=status;for(const [key,value]of Object.entries(values??{}))result.headers[key.toLowerCase()]=value;},end(value){result.bytes=Buffer.from(value??'');if(result.headers['content-type']?.startsWith('application/json'))result.body=JSON.parse(result.bytes.toString());resolve(result);}});
      });
    }};
}
async function project(app,key='one'){
  const response=await app.request('/api/v1/projects',{name:'原文件接入',brief:'用于工程原文件保存验证，未执行模型',commandId:`original-http-${key}`});
  assert.equal(response.status,201);return response.body.project;
}
const upload=p=>({commandId:'save-original',expectedRevision:p.revision,originalFilename:'品牌资料.pdf',taskCardId:p.activeTaskCardId,taskCardHash:cardHash(p.taskCards.find(c=>c.id===p.activeTaskCardId)),base64:bytes.toString('base64'),metadata:{clientResourceId:'brand-selected-1',declaredMediaType:'application/pdf',lastModified:123,note:'用户提供，尚未解析或采用'}});


const extractionRequest=(p,documentId,commandId='extract',action='extract')=>({documentId,taskCardId:p.activeTaskCardId,taskCardHash:cardHash(p.taskCards.find(c=>c.id===p.activeTaskCardId)),commandId,expectedRevision:p.revision,action});
test('extraction routes read the saved current original and default to no parser or dispatch',async t=>{
 const app=await fixture(t),p=await project(app),route=`/api/v1/projects/${p.id}/documents`,saved=await app.request(route,upload(p)),documentId=saved.body.receipt.documentId,path=`${route}/${documentId}/extraction`;
 const read=await app.request(path);assert.equal(read.status,200,JSON.stringify(read.body));assert.equal(read.body.extraction,null);assert.equal(read.body.scope,'local_pdf_extraction');assert.equal(read.body.project.revision,read.body.revision);assert.equal(read.body.view.revision,read.body.revision);
 const post=await app.request(path,extractionRequest(saved.body.project,documentId));assert.equal(post.status,422);assert.equal(post.body.error.code,'PDF_EXTRACTOR_UNAVAILABLE');
 const state=(await app.request(`/api/v1/projects/${p.id}`)).body.project;assert.equal(state.jobs[0].attempts.length,0);assert.equal(state.jobs[0].status,'queued');
});
test('extraction request boundaries reject wrong paths, fields, methods, origins, queries and oversized bodies before dispatch',async t=>{
 const app=await fixture(t),p=await project(app),route=`/api/v1/projects/${p.id}/documents`,saved=await app.request(route,upload(p)),id=saved.body.receipt.documentId,path=`${route}/${id}/extraction`,body=extractionRequest(saved.body.project,id);
 for(const suffix of ['?revision=1','?x=y'])assert.equal((await app.request(path+suffix)).status,400);
 for(const method of ['PUT','DELETE'])assert.equal((await app.request(path,body,{method})).status,405);
 for(const headers of [{host:'evil.example'},{origin:'https://outside.example'},{'sec-fetch-site':'cross-site'}])assert.equal((await app.request(path,body,{headers})).status,403);
 assert.equal((await app.request(path,{...body,documentId:'different'})).status,400);
 assert.equal((await app.request(path,{...body,model:'unwanted'})).status,400);
 assert.equal((await app.request(path,{...body,action:'adopt'})).status,422);
 assert.equal((await app.request(path,body,{headers:{'content-length':String(128*1024+1)}})).status,413);
 assert.equal((await app.request(path,{...body,commandId:'x'.repeat(128*1024)})).status,413);
 assert.equal((await app.request(path,body,{headers:{'content-type':'text/plain'}})).status,415);
 const other=await project(app,'other');assert.equal((await app.request(`/api/v1/projects/${other.id}/documents/${id}/extraction`)).status,404);
 const state=(await app.request(`/api/v1/projects/${p.id}`)).body.project;assert.equal(state.revision,saved.body.project.revision);assert.equal(state.jobs[0].attempts.length,0);
});
test('missing configured Python reports actual unavailable capability without running any job',async t=>{
 const app=await fixture(t,{intakeConfiguration:{pythonBinary:'/not-installed/pdf-python'}}),p=await project(app),route=`/api/v1/projects/${p.id}/documents`,saved=await app.request(route,upload(p)),id=saved.body.receipt.documentId;
 const cap=(await app.request('/api/v1/capabilities')).body;assert.equal(cap.originals.localExtractionAvailable,false);assert.equal(cap.originals.localExtraction.configured,true);assert.equal(cap.originals.modelExtractionAvailable,false);assert.equal(cap.executionAvailable,false);
 const response=await app.request(`${route}/${id}/extraction`,extractionRequest(saved.body.project,id));assert.equal(response.body.error.code,'PDF_EXTRACTOR_UNAVAILABLE');
 assert.equal((await app.request(`/api/v1/projects/${p.id}`)).body.project.jobs[0].attempts.length,0);
});

const pythonBinary=process.env.PITCH_PDF_TEST_PYTHON;
const pdfOnly={skip:pythonBinary?false:'Set PITCH_PDF_TEST_PYTHON to an installed PDF runtime; real parser not verified'};
async function requirePython(){const cap=await createLocalPdfExtractor({pythonBinary}).capability();assert.equal(cap.available,true,JSON.stringify(cap));return cap;}
async function savedPdf(app,filename='mixed.pdf'){
 const p=await project(app),route=`/api/v1/projects/${p.id}/documents`,bytes=await readFile(new URL('./fixtures/intake/'+filename,import.meta.url)),saved=await app.request(route,{...upload(p),originalFilename:filename,base64:bytes.toString('base64')});assert.equal(saved.status,200,JSON.stringify(saved.body));
 const documentId=saved.body.receipt.documentId;return {p:saved.body.project,documentId,path:`${route}/${documentId}/extraction`,route,bytes};
}
test('actual local PDF parsing and historical same-body readback survive SQLite reopen without another attempt',pdfOnly,async t=>{
 await requirePython();const app=await fixture(t,{intakeConfiguration:{pythonBinary}}),f=await savedPdf(app),body=extractionRequest(f.p,f.documentId),caps=(await app.request('/api/v1/capabilities')).body;
 assert.equal(caps.originals.localExtractionAvailable,true);assert.equal(caps.executionAvailable,false);assert.equal(caps.originals.modelExtractionAvailable,false);
 const response=await app.request(f.path,body);assert.equal(response.status,200,JSON.stringify(response.body));const first=response.body;
 assert.equal(first.receipt.replayed,false);assert.equal(first.extraction.status,'partial');assert.equal(first.extraction.pages.length,2);assert.equal(first.extraction.pages[1].status,'no_text');assert.equal(first.extraction.rawHash,createHash('sha256').update(f.bytes).digest('hex'));assert.equal(first.modelReading,'not_verified');assert.equal(first.humanAdoption,'not_verified');assert.equal(first.project.confirmations.length,0);
 assert.equal(first.project.jobs[0].attempts.length,1);assert.equal(first.project.jobs[0].purpose,'intake_document');assert.equal(first.project.revision,first.revision);assert.equal(first.view.revision,first.revision);
 const json=await readFile(`${app.dbPath}.originals/intake/results/${first.extractionRef.sha256}`);assert.equal(createHash('sha256').update(json).digest('hex'),first.extractionRef.sha256);assert.equal(json.length,first.extractionRef.byteLength);assert.deepEqual(JSON.parse(json),first.extraction);
 await app.reopen({});const replay=await app.request(f.path,body);assert.equal(replay.status,200);assert.equal(replay.body.receipt.replayed,true);assert.deepEqual(replay.body.extraction,first.extraction);assert.equal(replay.body.project.jobs[0].attempts.length,1);
 assert.equal((await app.request(f.path,{...body,expectedRevision:body.expectedRevision+1})).status,409);
 const changed=await app.request(`/api/v1/projects/${f.p.id}/commands`,{kind:'revise-task-card',commandId:'next',expectedRevision:first.revision,taskCardId:'new-scope',brief:'Next task'});assert.equal(changed.status,200);
 const old=await app.request(f.path,body);assert.equal(old.status,200);assert.equal(old.body.document.isCurrent,false);assert.deepEqual(old.body.extraction,first.extraction);assert.equal(old.body.project.jobs[0].attempts.length,1);
 const uploadReplay=await app.request(f.route,{...upload((await app.request(`/api/v1/projects/${f.p.id}?revision=0`)).body.project),originalFilename:'mixed.pdf',base64:f.bytes.toString('base64')});assert.equal(uploadReplay.status,200);assert.equal(uploadReplay.body.receipt.replayed,true);
 await chmod(`${app.dbPath}.originals/intake/results/${first.extractionRef.sha256}`,0o600);await writeFile(`${app.dbPath}.originals/intake/results/${first.extractionRef.sha256}`,'{}');assert.equal((await app.request(f.path)).body.error.code,'DOCUMENT_CORRUPT');assert.equal((await app.request(f.path,body)).body.error.code,'DOCUMENT_CORRUPT');
});
for(const [filename,status,limits]of [['emoji.pdf','text_extracted',{}],['encrypted.pdf','password_required',{}],['invalid.pdf','invalid',{}],['mixed.pdf','limit_exceeded',{pages:1}]])test(`actual HTTP PDF result retains ${status} without claiming model reading`,pdfOnly,async t=>{
 await requirePython();const app=await fixture(t,{intakeConfiguration:{pythonBinary,limits}}),f=await savedPdf(app,filename),response=await app.request(f.path,extractionRequest(f.p,f.documentId));assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.extraction.status,status);assert.equal(response.body.project.intakeDocuments[0].status,'ready');assert.equal(response.body.modelReading,'not_verified');assert.equal(response.body.humanAdoption,'not_verified');if(filename==='emoji.pdf'){assert.equal(response.body.extraction.text,'😀 Age 25');assert.equal(response.body.extraction.pages[0].textEndUtf16,9);}else assert.equal(response.body.extraction.text,'');
});
const worker={actorType:'agent',actorId:'synthetic-local-parser',runId:'local-attempt',contextId:'isolated-local'};
function seedAttempt(app,p,body,{failed=false}={}){
 const store=openStore(app.dbPath);try{
  const job=store.read(p.id).jobs[0];store.command(p.id,{kind:'intake-start',jobId:job.id,attemptId:'local-attempt',request:body,commandId:body.commandId,expectedRevision:body.expectedRevision},worker);
  if(failed)store.command(p.id,{kind:'intake-fail',jobId:job.id,attemptId:'local-attempt',error:{code:'SYNTHETIC_LOCAL_FAILURE',message:'Synthetic local parser interruption'},commandId:'seed-failure',expectedRevision:store.read(p.id).revision},worker);
 }finally{store.close();}
}
test('a durable unknown local claim reopens with original body and no implicit retry',async t=>{
 const app=await fixture(t),p=await project(app),route=`/api/v1/projects/${p.id}/documents`,saved=await app.request(route,upload(p)),id=saved.body.receipt.documentId,path=`${route}/${id}/extraction`,body=extractionRequest(saved.body.project,id);seedAttempt(app,p,body);await app.reopen();
 const response=await app.request(path,body);assert.equal(response.status,200);assert.equal(response.body.receipt.replayed,true);assert.equal(response.body.extraction,null);assert.equal(response.body.project.jobs[0].status,'running');assert.equal(response.body.project.jobs[0].attempts.length,1);
 const retry=await app.request(path,extractionRequest(response.body.project,id,'retry','retry_local'));assert.equal(retry.body.error.code,'LOCAL_EXTRACTION_STATE');assert.equal((await app.request(`/api/v1/projects/${p.id}`)).body.project.jobs[0].attempts.length,1);
});
test('revision changes during extraction read return conflict instead of combining an old file with a new project',async t=>{
 const app=await fixture(t),p=await project(app),route=`/api/v1/projects/${p.id}/documents`,saved=await app.request(route,upload(p)),id=saved.body.receipt.documentId;
 const read=app.request(`${route}/${id}/extraction`),store=openStore(app.dbPath);try{store.command(p.id,{kind:'revise-task-card',commandId:'concurrent-edit',expectedRevision:saved.body.project.revision,taskCardId:'next-scope',brief:'Concurrent edit'}, {actorType:'human',actorId:'local-operator',runId:'other-window',contextId:'other-window'});}finally{store.close();}
 const response=await read;assert.equal(response.status,409,JSON.stringify(response.body));assert.equal(response.body.error.code,'REVISION_CONFLICT');assert.equal(Object.hasOwn(response.body,'project'),false);
});
test('failed local work requires explicit HTTP retry, preserving the first attempt and actual local human authority',pdfOnly,async t=>{
 await requirePython();const app=await fixture(t,{intakeConfiguration:{pythonBinary}}),f=await savedPdf(app),body=extractionRequest(f.p,f.documentId);seedAttempt(app,f.p,body,{failed:true});await app.reopen();
 const failed=await app.request(f.path,body);assert.equal(failed.status,200);assert.equal(failed.body.project.jobs[0].status,'failed');assert.equal(failed.body.project.jobs[0].attempts.length,1);
 const retry=extractionRequest(failed.body.project,f.documentId,'retry','retry_local'),response=await app.request(f.path,retry);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.extraction.status,'partial');assert.equal(response.body.project.jobs[0].attempts.length,2);assert.equal(response.body.project.jobs[0].attempts[0].status,'failed');assert.equal(response.body.project.audit.find(a=>a.commandId==='retry').actorId,'local-operator');
 const replay=await app.request(f.path,retry);assert.equal(replay.status,200);assert.equal(replay.body.receipt.replayed,true);assert.equal(replay.body.project.jobs[0].attempts.length,2);assert.deepEqual(replay.body.extraction,response.body.extraction);
});

test('CLI accepts the PDF option only as explicit absolute parser configuration',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'brief-extraction-cli-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('./brief-server.mjs',import.meta.url)),'--db',join(root,'db.sqlite'),'--pdf-python','relative-python'],{encoding:'utf8',timeout:5000});
 assert.equal(run.status,1);assert.match(run.stderr,/Absolute Python binary required/);assert.doesNotMatch(run.stdout,/Brief service available/);
});
test('actual blank PDF retains no_text even though the local job finished',pdfOnly,async t=>{
 await requirePython();const generated=spawnSync(pythonBinary,['-I','-B','-c','import sys,io; from pypdf import PdfWriter; w=PdfWriter(); w.add_blank_page(width=200,height=200); b=io.BytesIO(); w.write(b); sys.stdout.buffer.write(b.getvalue())'],{timeout:5000});assert.equal(generated.status,0,String(generated.stderr));
 const app=await fixture(t,{intakeConfiguration:{pythonBinary}}),p=await project(app),route=`/api/v1/projects/${p.id}/documents`,saved=await app.request(route,{...upload(p),base64:generated.stdout.toString('base64')}),id=saved.body.receipt.documentId;
 const response=await app.request(`${route}/${id}/extraction`,extractionRequest(saved.body.project,id));assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.extraction.status,'no_text');assert.equal(response.body.extraction.text,'');assert.equal(response.body.extraction.pages.length,1);assert.equal(response.body.extraction.pages[0].status,'no_text');assert.equal(response.body.project.jobs[0].status,'succeeded');assert.equal(response.body.modelReading,'not_verified');assert.equal(response.body.humanAdoption,'not_verified');
});
