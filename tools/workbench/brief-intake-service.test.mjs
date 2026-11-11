import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, readFile, writeFile, chmod, rm, unlink, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from './store.mjs';
import {cardHash} from './intake-contract.mjs';
import {createBriefIntakeService} from './brief-intake-service.mjs';
import {createLocalPdfExtractor} from './intake-pdf.mjs';

const human = {actorType: 'human', actorId: 'local-operator', runId: 'ui', contextId: 'local'};
async function fixture(t, intakeConfiguration = null) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'brief-original-'))), db = join(directory, 'db.sqlite'), rootDir = join(directory, 'originals');
  let store = openStore(db);
  store.create({id: 'alpha', name: 'Originals', brief: '原始任务', workflowVersion: 'proposal-seven-v1'}, human);
  store.create({id: 'beta', name: 'Other', brief: '其他任务', workflowVersion: 'proposal-seven-v1'}, human);
  const service = () => createBriefIntakeService({store, rootDir, intakeConfiguration});
  t.after(async () => {store.close(); await rm(directory, {recursive: true, force: true});});
  const bytes = await readFile(new URL('./fixtures/intake/mixed.pdf', import.meta.url));
  return {bytes, rootDir, service, get store() {return store;},
    request(commandId = 'upload', extra = {}) {const p = store.read('alpha'), card = p.taskCards.find(c => c.id === p.activeTaskCardId); return {commandId, expectedRevision: p.revision, originalFilename: '原件.pdf', taskCardId: card.id, taskCardHash: cardHash(card), ...extra};},
    reopen() {store.close(); store = openStore(db);},
  };
}
const fails = code => error => error.code === code;

test('unconfirmed task stores actual PDF bytes without extraction or adoption and survives reopen', async t => {
  const f = await fixture(t), req = f.request('save', {metadata: {lastModified: 1234, note: '品牌原件，未核实', clientResourceId: 'selection-uuid', declaredMediaType: ''}});
  const uploaded = await f.service().upload('alpha', req, f.bytes);
  assert.equal(uploaded.receipt.replayed, false);
  assert.equal(uploaded.document.isCurrent, true);
  assert.deepEqual(uploaded.document.metadata, req.metadata);
  assert.equal(uploaded.document.mediaType, 'application/pdf');
  assert.equal(uploaded.document.byteLength, f.bytes.length);
  assert.equal(uploaded.document.localExtractionStatus, 'queued');
  assert.equal(uploaded.document.modelReading, 'not_verified');
  assert.equal(uploaded.document.humanAdoption, 'not_verified');
  assert.equal(f.store.read('alpha').confirmations.length, 0);
  assert.equal(f.store.read('alpha').jobs.length, 1);
  assert.equal(f.store.read('alpha').jobs[0].status, 'queued');
  assert.equal(f.store.read('alpha').jobs[0].attempts.length, 0);
  f.reopen();
  assert.deepEqual((await f.service().read('alpha', uploaded.documentId)).bytes, f.bytes);
  const listed = await f.service().list('alpha');
  assert.deepEqual(listed.documents, [uploaded.document]);
  assert.equal(JSON.stringify(listed).includes(f.rootDir), false);
  assert.deepEqual(f.service().capability().mediaTypes, ['application/pdf']);
  assert.equal(f.service().capability().modelExtractionAvailable, false);
});

test('lost response replay retains exact body and bytes, without another job or version', async t => {
  const f = await fixture(t), req = f.request();
  await f.service().upload('alpha', req, f.bytes);
  const saved = f.store.read('alpha');
  f.reopen();
  const replay = await f.service().upload('alpha', req, f.bytes);
  assert.deepEqual(replay.receipt, {commandId: req.commandId, replayed: true});
  assert.deepEqual(f.store.read('alpha'), saved);
  await assert.rejects(f.service().upload('alpha', {...req, originalFilename: '别的.pdf'}, f.bytes), fails('COMMAND_ID_REUSED'));
  await assert.rejects(f.service().upload('alpha', req, Buffer.concat([f.bytes, Buffer.from('changed')])), fails('COMMAND_ID_REUSED'));
  await assert.rejects(f.service().upload('alpha', {...req, metadata: {note: 'changed'}}, f.bytes), fails('COMMAND_ID_REUSED'));
});

test('project ownership prevents reading another project original', async t => {
  const f = await fixture(t), saved = await f.service().upload('alpha', f.request(), f.bytes);
  assert.deepEqual((await f.service().list('beta')).documents, []);
  await assert.rejects(f.service().read('beta', saved.documentId), fails('NOT_FOUND'));
  await assert.rejects(f.service().upload('beta', f.request('foreign', {expectedRevision: 0}), f.bytes), fails('STALE_TASK_CARD'));
  assert.equal(f.store.read('beta').revision, 0);
});

test('task revision marks retained original stale; historical same-body replay remains safe', async t => {
  const f = await fixture(t), request = f.request(), saved = await f.service().upload('alpha', request, f.bytes);
  f.store.command('alpha', {kind: 'revise-task-card', commandId: 'revise', expectedRevision: 1, taskCardId: 'alpha-new', brief: '新任务'}, human);
  await assert.rejects(f.service().upload('alpha', {...request, commandId: 'new-old', expectedRevision: 2}, f.bytes), fails('STALE_TASK_CARD'));
  await assert.rejects(f.service().upload('alpha', {...f.request('stale-revision'), expectedRevision: 0}, f.bytes), fails('REVISION_CONFLICT'));
  const old = await f.service().read('alpha', saved.documentId);
  assert.equal(old.document.isCurrent, false);
  assert.deepEqual(old.bytes, f.bytes);
  const replayed = await f.service().upload('alpha', request, f.bytes);
  assert.equal(replayed.document.isCurrent, false);
  assert.equal(replayed.receipt.replayed, true);
  assert.equal(f.store.read('alpha').revision, 2);
});

test('corrupted saved bytes are rejected by read, list and replay without generating replacement', async t => {
  const f = await fixture(t), req = f.request(), result = await f.service().upload('alpha', req, f.bytes);
  const original = join(f.rootDir, 'intake', 'objects', result.document.sha256);
  await chmod(original, 0o600); const corrupt = Buffer.from(f.bytes); corrupt[8] ^= 1; await writeFile(original, corrupt);
  for (const call of [() => f.service().read('alpha', result.documentId), () => f.service().list('alpha'), () => f.service().upload('alpha', req, f.bytes)]) {
    await assert.rejects(call(), fails('DOCUMENT_CORRUPT'));
  }
  assert.equal(f.store.read('alpha').revision, 1);
  assert.equal(f.store.read('alpha').jobs[0].attempts.length, 0);
});

test('symlink substitution cannot replace a managed original', async t => {
  const f = await fixture(t), result = await f.service().upload('alpha', f.request(), f.bytes);
  const original = join(f.rootDir, 'intake', 'objects', result.document.sha256), replacement = join(f.rootDir, 'replacement.pdf');
  await writeFile(replacement, f.bytes); await unlink(original); await symlink(replacement, original);
  await assert.rejects(f.service().read('alpha', result.documentId), fails('DOCUMENT_CORRUPT'));
});

test('strict request boundary rejects unsupported MIME, spoofed fields and malformed metadata', async t => {
  const f = await fixture(t), req = f.request();
  await assert.rejects(f.service().upload('alpha', req, await readFile(new URL('./fixtures/intake/blue.png', import.meta.url))), fails('INPUT_UNSUPPORTED'));
  await assert.rejects(f.service().upload('alpha', {...req, mediaType: 'application/pdf'}, f.bytes), fails('INVALID_REQUEST'));
  await assert.rejects(f.service().upload('alpha', {...req, taskCardHash: 123}, f.bytes), fails('INVALID_REQUEST'));
  await assert.rejects(f.service().upload('alpha', {...req, metadata: {adopted: true}}, f.bytes), fails('INVALID_REQUEST'));
  await assert.rejects(f.service().upload('alpha', {...req, metadata: {lastModified: -1}}, f.bytes), fails('INVALID_REQUEST'));
  await assert.rejects(f.service().upload('alpha', {...req, originalFilename: 'bad\r\n.pdf'}, f.bytes), fails('INVALID_REQUEST'));
  assert.equal(f.store.read('alpha').revision, 0);
});

test('selection identity cannot be reassigned to different bytes or metadata under a fresh command', async t => {
  const f = await fixture(t), metadata = {clientResourceId: 'choice-1', lastModified: 123, declaredMediaType: 'application/pdf', note: '来源'};
  await f.service().upload('alpha', f.request('original', {metadata}), f.bytes);
  await assert.rejects(f.service().upload('alpha', f.request('other-bytes', {metadata}), Buffer.concat([f.bytes, Buffer.from('x')])), fails('CLIENT_RESOURCE_ID_REUSED'));
  await assert.rejects(f.service().upload('alpha', f.request('other-note', {metadata: {...metadata, note: '换说明'}}), f.bytes), fails('CLIENT_RESOURCE_ID_REUSED'));
  assert.equal(f.store.read('alpha').revision, 1);
});

test('client selections reject metadata that the brand UI cannot represent before saving', async t => {
  const f = await fixture(t), metadata = {clientResourceId: 'choice-1', lastModified: 123, declaredMediaType: 'application/pdf', note: ''};
  for (const fields of [{metadata: {...metadata, note: '字'.repeat(1001)}}, {metadata, originalFilename: `${'x'.repeat(252)}.pdf`}, {metadata, originalFilename: 'folder/file.pdf'}, {metadata, originalFilename: 'not-a-pdf.txt'}]) {
    await assert.rejects(f.service().upload('alpha', f.request('invalid', fields), f.bytes), fails('INVALID_REQUEST'));
    assert.equal(f.store.read('alpha').revision, 0);
  }
  const ordinary = await f.service().upload('alpha', f.request('ordinary', {metadata: {note: '字'.repeat(1001)}}), f.bytes);
  assert.equal(ordinary.document.metadata.note.length, 1001);
  assert.equal(f.store.read('alpha').revision, 1);
});

const pythonBinary=process.env.PITCH_PDF_TEST_PYTHON??'/nonexistent/pitch-pdf-test-python';
const testPdfCapability=await createLocalPdfExtractor(process.env.PITCH_PDF_TEST_PYTHON?{pythonBinary}:null).capability();
const localPdfTest=(name,run)=>test(name,{skip:process.env.PITCH_PDF_TEST_PYTHON?false:'Set PITCH_PDF_TEST_PYTHON to an available configured local PDF runtime'},run);
const extractRequest=(f,id,commandId='extract',action='extract')=>{const {originalFilename,...request}=f.request(commandId);return {...request,documentId:id,action};};
localPdfTest('actual configured local extraction before confirmation retains pages and command across reopen without a second attempt',async t=>{
 const f=await fixture(t,{pythonBinary}),service=f.service(),upload=await service.upload('alpha',f.request(),f.bytes);
 assert.equal(service.capability().localExtractionAvailable,false);const cap=await service.extractionCapability();assert.equal(cap.available,true,JSON.stringify(cap));assert.equal(cap.identity.pypdf,testPdfCapability.identity.pypdf);
 const request=extractRequest(f,upload.documentId),first=await service.extract('alpha',request),saved=f.store.read('alpha');
 assert.equal(first.receipt.replayed,false);assert.equal(first.extraction.status,'partial');assert.equal(first.extraction.pages.length,2);assert.equal(first.extraction.pages[1].status,'no_text');assert.equal(first.extraction.rawHash,upload.document.sha256);assert.ok(first.extractionRef.sha256);assert.equal(first.modelReading,'not_verified');assert.equal(first.humanAdoption,'not_verified');assert.equal(saved.confirmations.length,0);assert.equal(saved.jobs[0].attempts.length,1);assert.deepEqual(JSON.parse(saved.processedCommands[request.commandId]).request,request);
 f.reopen();const replay=await f.service().extract('alpha',request);assert.equal(replay.receipt.replayed,true);assert.deepEqual(replay.extraction,first.extraction);assert.deepEqual(f.store.read('alpha'),saved);
 await assert.rejects(f.service().extract('alpha',{...request,expectedRevision:request.expectedRevision+1}),fails('COMMAND_ID_REUSED'));
 await assert.rejects(f.service().extract('alpha',extractRequest(f,upload.documentId,'fresh')),fails('LOCAL_EXTRACTION_STATE'));
 assert.deepEqual((await f.service().read('alpha',upload.documentId)).bytes,f.bytes);
});
test('default or missing parser preserves queued zero-attempt work with a truthful capability',async t=>{
 for(const config of [null,{pythonBinary:'/nonexistent/python'}]){const f=await fixture(t,config),service=f.service(),upload=await service.upload('alpha',f.request(),f.bytes);assert.equal((await service.extractionCapability()).available,false);await assert.rejects(service.extract('alpha',extractRequest(f,upload.documentId)),fails('PDF_EXTRACTOR_UNAVAILABLE'));assert.equal(f.store.read('alpha').jobs[0].attempts.length,0);assert.equal(f.store.read('alpha').jobs[0].status,'queued');}
});
test('old-card originals stay downloadable but a new extraction cannot use stale task identity',async t=>{
 const f=await fixture(t,{pythonBinary}),upload=await f.service().upload('alpha',f.request(),f.bytes),old=extractRequest(f,upload.documentId);
 f.store.command('alpha',{kind:'revise-task-card',commandId:'next',expectedRevision:f.store.read('alpha').revision,taskCardId:'alpha-next',brief:'另一任务'},human);
 await assert.rejects(f.service().extract('alpha',{...old,expectedRevision:f.store.read('alpha').revision}),fails('STALE_TASK_CARD'));
 await assert.rejects(f.service().extract('beta',{...old,expectedRevision:0}),fails('NOT_FOUND'));
 assert.equal((await f.service().extraction('alpha',upload.documentId)).document.isCurrent,false);assert.deepEqual((await f.service().read('alpha',upload.documentId)).bytes,f.bytes);assert.equal(f.store.read('alpha').jobs[0].attempts.length,0);
});
localPdfTest('actual encrypted, invalid and bounded PDF outcomes are retained without calling them readable text',async t=>{
 for(const [filename,expected,limits]of [['encrypted.pdf','password_required',{}],['invalid.pdf','invalid',{}],['mixed.pdf','limit_exceeded',{pages:1}],['emoji.pdf','text_extracted',{}]]){
  const f=await fixture(t,{pythonBinary,limits}),bytes=await readFile(new URL('./fixtures/intake/'+filename,import.meta.url)),upload=await f.service().upload('alpha',f.request('upload',{originalFilename:filename}),bytes);
  const result=await f.service().extract('alpha',extractRequest(f,upload.documentId));assert.equal(result.extraction.status,expected);assert.equal(f.store.read('alpha').intakeDocuments[0].status,'ready');assert.equal(result.modelReading,'not_verified');
  if(expected==='text_extracted'){assert.equal(result.extraction.text,'😀 Age 25');assert.equal(result.extraction.pages[0].textEndUtf16,9);}else assert.equal(result.extraction.text,'');
 }
});
localPdfTest('explicit local recovery keeps original job and failed attempt; replay never auto-retries',async t=>{
 const f=await fixture(t,{pythonBinary}),upload=await f.service().upload('alpha',f.request(),f.bytes),command=f.store.command.bind(f.store);let fail=true;
 const service=createBriefIntakeService({rootDir:f.rootDir,intakeConfiguration:{pythonBinary},store:{...f.store,command(id,c,ctx){if(c.kind==='intake-complete'&&fail){fail=false;throw Error('Synthetic local completion failure');}return command(id,c,ctx);}}});
 const request=extractRequest(f,upload.documentId),first=await service.extract('alpha',request);assert.equal(f.store.read('alpha').jobs[0].status,'failed');assert.equal(first.extraction,null);
 await service.extract('alpha',request);assert.equal(f.store.read('alpha').jobs[0].attempts.length,1);
 const retry=extractRequest(f,upload.documentId,'retry','retry_local');await assert.rejects(service.extract('alpha',retry),fails('HUMAN_REQUIRED'));const recovered=await service.extract('alpha',retry,human);assert.equal(recovered.extraction.status,'partial');assert.equal(recovered.jobId,first.jobId);assert.equal(f.store.read('alpha').jobs[0].attempts.length,2);assert.equal(f.store.read('alpha').jobs[0].attempts[0].status,'failed');
 const before=f.store.read('alpha');assert.equal((await service.extract('alpha',retry,human)).receipt.replayed,true);assert.deepEqual(f.store.read('alpha'),before);
});
localPdfTest('tampered extraction bytes refuse read and replay without another attempt',async t=>{
 const f=await fixture(t,{pythonBinary}),service=f.service(),upload=await service.upload('alpha',f.request(),f.bytes),request=extractRequest(f,upload.documentId),result=await service.extract('alpha',request);
 const path=join(f.rootDir,'intake','results',result.extractionRef.sha256);await chmod(path,0o600);await writeFile(path,'{}');for(const call of [()=>service.extraction('alpha',upload.documentId),()=>service.extract('alpha',request)])await assert.rejects(call(),fails('DOCUMENT_CORRUPT'));assert.equal(f.store.read('alpha').jobs[0].attempts.length,1);
});

localPdfTest('a committed local retry resumes its queued work once after its return is lost',async t=>{
 const f=await fixture(t,{pythonBinary}),upload=await f.service().upload('alpha',f.request(),f.bytes),command=f.store.command.bind(f.store);let failCompletion=true,loseRetry=true;
 const service=createBriefIntakeService({rootDir:f.rootDir,intakeConfiguration:{pythonBinary},store:{...f.store,command(id,c,ctx){if(c.kind==='intake-complete'&&failCompletion){failCompletion=false;throw Error('Synthetic failed local completion');}const result=command(id,c,ctx);if(c.kind==='intake-retry-local'&&loseRetry){loseRetry=false;throw Error('Synthetic retry return lost');}return result;}}});
 await service.extract('alpha',extractRequest(f,upload.documentId));const retry=extractRequest(f,upload.documentId,'retry','retry_local');await assert.rejects(service.extract('alpha',retry,human),/retry return lost/);assert.equal(f.store.read('alpha').jobs[0].status,'queued');
 const result=await f.service().extract('alpha',retry);assert.equal(result.receipt.replayed,true);assert.equal(result.extraction.status,'partial');assert.equal(f.store.read('alpha').jobs[0].attempts.length,2);await f.service().extract('alpha',retry);assert.equal(f.store.read('alpha').jobs[0].attempts.length,2);
});
async function failedLocalFixture(t){
 const f=await fixture(t,{pythonBinary}),upload=await f.service().upload('alpha',f.request(),f.bytes),initial=extractRequest(f,upload.documentId,'initial'),agent={actorType:'agent',actorId:'synthetic-parser',runId:'seed',contextId:'isolated'};
 f.store.command('alpha',{kind:'intake-start',jobId:upload.jobId,attemptId:'seed',request:initial,commandId:initial.commandId,expectedRevision:initial.expectedRevision},agent);
 f.store.command('alpha',{kind:'intake-fail',jobId:upload.jobId,attemptId:'seed',error:{code:'SYNTHETIC',message:'Local failure before retry'},commandId:'seed-fail',expectedRevision:f.store.read('alpha').revision},agent);
 return {f,upload,retry:extractRequest(f,upload.documentId,'retry','retry_local')};
}
for(const path of ['fresh','queued-replay'])for(const change of ['task-card','unrelated-revision'])for(const checkpoint of ['admission','commit'])localPdfTest(`${path} retry refuses an asynchronous ${change} at ${checkpoint}`,async t=>{
 const {f,upload,retry}=await failedLocalFixture(t),command=f.store.command.bind(f.store);let changed=false;
 const mutate=()=>{changed=true;const p=f.store.read('alpha');command('alpha',change==='task-card'?{kind:'revise-task-card',taskCardId:'next',brief:'Another card before actual parser start',commandId:'concurrent-change',expectedRevision:p.revision}:{kind:'confirm-task-card',taskCardId:p.activeTaskCardId,commandId:'concurrent-change',expectedRevision:p.revision},human);};
 if(path==='queued-replay')command('alpha',{kind:'intake-retry-local',request:{...retry,jobId:upload.jobId},commandId:retry.commandId,expectedRevision:retry.expectedRevision},human);
 const service=createBriefIntakeService({rootDir:f.rootDir,intakeConfiguration:{pythonBinary},store:{...f.store,read(id){if(checkpoint==='admission'&&path==='queued-replay'&&!changed&&new Error().stack.includes('Object.execute'))mutate();return f.store.read(id);},command(id,c,ctx){if(checkpoint==='commit'&&!changed&&c.kind==='intake-start')mutate();const result=command(id,c,ctx);if(checkpoint==='admission'&&path==='fresh'&&c.kind==='intake-retry-local')queueMicrotask(mutate);return result;}}});
 await assert.rejects(service.extract('alpha',retry,human),error=>['REVISION_CONFLICT','STALE_TASK_CARD'].includes(error.code));
 assert.equal(changed,true);const p=f.store.read('alpha');assert.equal(p.jobs[0].attempts.length,1);assert.equal(p.jobs[0].status,'queued');assert.equal(p.intakeDocuments[0].extraction,undefined);assert.equal(p.jobs[0].attempts[0].status,'failed');assert.equal(JSON.parse(p.processedCommands.retry).kind,'intake-retry-local');
});

localPdfTest('retry start has a distinct stable command and its committed unknown cannot dispatch again after reopen',async t=>{
 const {f,retry}=await failedLocalFixture(t),command=f.store.command.bind(f.store);let lost=false,startAdmission;
 const service=createBriefIntakeService({rootDir:f.rootDir,intakeConfiguration:{pythonBinary},store:{...f.store,command(id,c,ctx){const result=command(id,c,ctx);if(c.kind==='intake-start'&&c.request?.action==='retry_local'){startAdmission=c.expectedRevision;lost=true;throw Error('Synthetic stop after durable retry start');}return result;}}});
 await assert.rejects(service.extract('alpha',retry,human),/durable retry start/);assert.equal(lost,true);const p=f.store.read('alpha'),original=JSON.parse(p.processedCommands.retry),starts=Object.values(p.processedCommands).map(x=>JSON.parse(x)).filter(c=>c.kind==='intake-start'&&c.request?.action==='retry_local');
 assert.equal(original.kind,'intake-retry-local');assert.deepEqual(original.request,{...retry,jobId:p.jobs[0].id});assert.equal(starts.length,1);assert.match(starts[0].commandId,/^local-start-[a-f0-9]{64}$/);assert.notEqual(starts[0].commandId,retry.commandId);assert.deepEqual(starts[0].request,retry);assert.equal(startAdmission,retry.expectedRevision+1);assert.equal(p.audit.find(a=>a.commandId===starts[0].commandId).revision,startAdmission+1);assert.equal(p.jobs[0].status,'running');assert.equal(p.jobs[0].attempts.length,2);
 f.reopen();const before=f.store.read('alpha'),disabled=createBriefIntakeService({store:f.store,rootDir:f.rootDir});const replay=await disabled.extract('alpha',retry);assert.equal(replay.receipt.replayed,true);assert.equal(replay.extraction,null);assert.deepEqual(f.store.read('alpha'),before);
});
