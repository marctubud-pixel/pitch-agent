import {diskReceipt} from './selected-stage-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createServer} from './server.mjs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {buildResearchReadinessRequest} from './research-readiness.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const source = {id: 's1', url: 'https://example.test/blue', text: 'Synthetic blue package.', scopeRelation: 'background', verification: 'captured'};
const production = {researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[],outputKind: 'research_findings', status: 'draft', title: 'Synthetic research', summary: 'Only a packaging excerpt.', sections: [{heading: 'Case', body: source.text, evidenceIds: ['s1']}], claims: [{text: 'Supplied excerpt describes a blue package.', kind: 'fact', evidenceRefs: ['s1'], limitations: ['Supplied excerpt only.']}], gaps: ['Missing audience research.'], evidenceClassifications: [{sourceId: 's1', scopeRelation: 'background', reason: 'A bounded example.'}]};
const bindings = {research: {providerId: 'author', model: 'synthetic', role: 'research-lead'}, readiness: {providerId: 'reviewer', model: 'synthetic', role: 'readiness-reviewer'}};
const receipt = (output, threadId) => ({model: 'synthetic', threadId, responseText: JSON.stringify(output), parsedOutput: output});
function needsResearch(input) {
  const {packet, outputSchema} = buildResearchReadinessRequest(input);
  return {...Object.fromEntries(Object.entries(outputSchema.properties).filter(([, value]) => value.enum).map(([key, value]) => [key, value.enum[0]])), verdict: 'needs_research',
    coverage: packet.expectedCoverage.map(item => ({questionId: item.id, status: 'gap', rationale: 'One excerpt cannot establish coverage.', refs: [{location: '/taskCard/brief', quote: input.taskCard.brief}], downstreamImpact: 'Strategy remains unsupported.', researchNeeded: 'Research users and use cases.'})),
    sourceAssessments: [{sourceId: source.id, textHash: hash(source.text), use: 'usable_with_limits', relevance: 'Packaging example.', provenance: 'Supplied excerpt.', limitations: ['Not authenticated.'], refs: [{location: '/sourceRecords/0/text', quote: source.text}]}], findings: [], downstreamUse: {allowed: ['Plan further research.'], prohibited: ['Do not infer audience preference.']}, limitations: ['Synthetic fixture, no real research.']};
}
const persistedProviders=(providers,root)=>Object.fromEntries(Object.entries(providers).map(([id,provider])=>[id,{...provider,execute:async request=>diskReceipt(root,request,{...await provider.execute(request),runId:request.runId,model:provider.model})}]));
async function runtime(t, reviewer, revise) {
  const root = await mkdtemp(join(tmpdir(), 'readiness-runtime-'));
  const store = openStore(join(root, 'db'));
  const human = {actorId: 'human', actorType: 'human', runId: 'human', contextId: 'human'};
  store.create({id: 'p', name: 'Synthetic', brief: 'Research packaging users and use cases.', mode: 'auto'}, human);
  store.command('p', {kind: 'confirm-task-card', taskCardId: 'p:scope:1', commandId: 'confirm', expectedRevision: 0}, human);
  const executor = createExecutor({store, rootDir: root, bindings:{...bindings,correction_review:{providerId:'reviewer',model:'synthetic',role:'correction-reviewer'}}, providers: persistedProviders({author: {model: 'synthetic', execute: async request => revise&&request.outputSchema.properties.stageProtocolVersion?revise(request):receipt(production, 'author-thread')}, reviewer: {model: 'synthetic', execute: async request => reviewer(request, store)}},root)});
  t.after(async () => {store.close(); await rm(root, {recursive: true, force: true});});
  const produced = await executor.execute('p', executor.enqueue('p', 'research', {sourceRecords: [source]}));
  assert.equal(produced.status, 'succeeded', JSON.stringify(produced.error));
  return {root, store, executor};
}

test('readiness adapter freezes exact bytes and persists independent needs_research without release', async t => {
  let calls = 0;
  const {root, store, executor} = await runtime(t, async (request, store) => {
    calls++;
    const input = store.read('p').jobs.find(job => job.purpose === 'readiness').task.readinessInput;
    assert.equal(request.packet.contentText, await readFile(store.read('p').artifacts[0].payloadRef, 'utf8'));
    assert.equal(hash(request.packet.contentText), input.contentHash);
    return receipt(needsResearch(input), 'readiness-thread');
  });
  const before = store.read('p'), artifact = before.artifacts[0];
  const request = {commandId: 'readiness-request', expectedRevision: before.revision};
  const id = await executor.enqueueReadiness('p', artifact.id, request);
  assert.equal(await executor.enqueueReadiness('p', artifact.id, request), id);
  const job = await executor.execute('p', id);
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  const after = store.read('p'), report = after.readinessReports[0];
  assert.equal(report.verdict, 'needs_research');
  assert.equal(report.hasBlockingFindings, true);
  assert.deepEqual(after.artifacts, before.artifacts);
  assert.equal(after.releases.length, 0);
  assert.equal(after.activeByStage.research, artifact.id);
  for (const key of ['actorId', 'runId', 'contextId']) assert.notEqual(report.context[key], artifact.author[key]);
  assert.notEqual(report.executionReceipt.threadId, artifact.executionReceipt.threadId);
  const packet = JSON.parse(await readFile(join(root, job.attemptId, 'packet.json'), 'utf8'));
  assert.equal(packet.packet.contentText, await readFile(artifact.payloadRef, 'utf8'));
  assert.equal(hash(await readFile(report.payloadRef)), report.reportHash);
  assert.equal(await executor.enqueueReadiness('p', artifact.id, request), id);
  await assert.rejects(() => executor.execute('p', id));
  assert.equal(calls, 1);
});

test('changed artifact bytes prevent readiness dispatch even when parsed JSON is identical', async t => {
  let calls = 0;
  const {store, executor} = await runtime(t, async () => {calls++; throw new Error('Unexpected dispatch');});
  const artifact = store.read('p').artifacts[0];
  const id = await executor.enqueueReadiness('p', artifact.id);
  await writeFile(artifact.payloadRef, (await readFile(artifact.payloadRef, 'utf8')) + '\n');
  assert.equal((await executor.execute('p', id)).status, 'failed');
  assert.equal(calls, 0);
  assert.equal(store.read('p').readinessReports.length, 0);
});

test('provider reuse of author thread rejects readiness report and prevents silent retry', async t => {
  let calls = 0;
  const {store, executor} = await runtime(t, async (_request, store) => {calls++; return receipt(needsResearch(store.read('p').jobs.find(job => job.purpose === 'readiness').task.readinessInput), 'author-thread');});
  const id = await executor.enqueueReadiness('p', store.read('p').artifacts[0].id);
  const job = await executor.execute('p', id);
  assert.equal(job.status, 'awaiting_reconciliation');
  assert.equal(job.error.code, 'REVIEW_THREAD_REUSED');
  assert.equal(store.read('p').readinessReports.length, 0);
  await assert.rejects(() => executor.execute('p', id, {retry: true}));
  assert.equal(calls, 1);
});

async function httpFixture(t, options) {
  const root = await mkdtemp(join(tmpdir(), 'readiness-http-'));
  const config = {dbPath: join(root, 'db'), rootDir: root, ...options,providers:persistedProviders(options.providers,root)};
  let server = createServer(config);
  t.after(async () => {await server.drain(); server.emit('close'); await rm(root, {recursive: true, force: true});});
  return {drain: () => server.drain(), async reopen() {await server.drain(); server.emit('close'); server = createServer(config);}, async request(path, body) {
    const req = Readable.from([Buffer.from(body === undefined ? '' : JSON.stringify(body))]);
    Object.assign(req, {url: path, method: body === undefined ? 'GET' : 'POST', headers: {host: '127.0.0.1:4181', 'content-type': 'application/json'}});
    return new Promise(resolve => server.emit('request', req, {setHeader() {}, writeHead(status) {this.status = status;}, end(payload) {resolve({status: this.status, body: JSON.parse(String(payload))});}}));
  }};
}

test('HTTP readiness rejects forged reports and duplicate requests invoke once across restart', async t => {
  let calls = 0, release;
  const waiting = new Promise(resolve => {release = resolve;});
  t.after(() => release());
  let input;
  const app = await httpFixture(t, {bindings, providers: {author: {model: 'synthetic', execute: async request => receipt(production, 'author-thread')}, reviewer: {model: 'synthetic', execute: async request => {calls++; await waiting; return receipt(needsResearch(input), 'readiness-thread');}}}});
  const created = await app.request('/api/projects', {name: 'Synthetic', brief: 'Research packaging users and use cases.', mode: 'auto', commandId: 'create'});
  const route = `/api/projects/${created.body.project.id}`;
  await app.request(`${route}/commands`, {kind: 'confirm-task-card', taskCardId: created.body.project.activeTaskCardId, expectedRevision: 0, commandId: 'confirm'});
  const {verification, ...captured} = source;
  await app.request(`${route}/jobs`, {stage: 'research', sourceRecords: [captured], commandId: 'produce', expectedRevision: 1});
  await app.drain();
  const before = (await app.request(route)).body.project;
  const command = {artifactId: before.activeByStage.research, commandId: 'readiness', expectedRevision: before.revision};
  for (const field of ['rawReport', 'executionReceipt', 'readinessInput', 'context', 'actorId']) assert.equal((await app.request(`${route}/readiness`, {...command, [field]: {verdict: 'ready'}})).status, 400, field);
  for (const kind of ['request-readiness', 'complete-readiness']) assert.equal((await app.request(`${route}/commands`, {...command, kind})).status, 403);
  const queued = await app.request(`${route}/readiness`, command);
  assert.equal(queued.status, 202, JSON.stringify(queued.body));
  input = queued.body.project.jobs.find(job => job.purpose === 'readiness').task.readinessInput;
  assert.equal((await app.request(`${route}/readiness`, command)).body.jobId, queued.body.jobId);
  release(); await app.drain();
  const after = (await app.request(route)).body.project;
  assert.equal(after.readinessReports.length, 1);
  assert.equal(after.readinessReports[0].verdict, 'needs_research');
  assert.equal(after.releases.length, 0);
  assert.equal(calls, 1);
  await app.reopen();
  assert.equal((await app.request(`${route}/readiness`, command)).body.jobId, queued.body.jobId);
  await app.drain();
  assert.equal(calls, 1);
  assert.equal((await app.request(`${route}/readiness`, {...command, artifactId: 'different'})).status, 409);
});

test('v2 actual independent needs_research assessment is usable without making research ready',async t=>{
 const {validatedResearchAssessment}=await import('./project.mjs');
 const {APPLICABILITY_PROTOCOL}=await import('./research-applicability.mjs');
 let calls=0;
 const {store,executor}=await runtime(t,async(request,store)=>{
  calls++;
  const input=store.read('p').jobs.find(j=>j.purpose==='readiness').task.readinessInput;
  const output={...needsResearch(input),generationHash:request.packet.applicability.generationHash,obligationAssessments:[],useScan:{contentHash:input.contentHash,assessedOriginKeys:[],findings:[]}};
  return {...receipt(output,'v2-independent-thread'),model:'synthetic',runId:request.runId,inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),responseText:JSON.stringify(output)};
 });
 const artifact=store.read('p').artifacts[0];
 const request={commandId:'v2-check',expectedRevision:store.read('p').revision,protocolVersion:APPLICABILITY_PROTOCOL};
 const id=await executor.enqueueReadiness('p',artifact.id,request);
 const alias={...request,commandId:'same-generation-command',expectedRevision:store.read('p').revision};
 assert.equal(await executor.enqueueReadiness('p',artifact.id,alias),id);
 assert.equal(await executor.enqueueReadiness('p',artifact.id,alias),id);
 await assert.rejects(()=>executor.enqueueReadiness('p',artifact.id,{...alias,expectedRevision:alias.expectedRevision+1}),error=>error.code==='COMMAND_ID_REUSED');
 assert.equal((await executor.execute('p',id)).status,'succeeded',JSON.stringify(store.read('p').jobs.find(j=>j.id===id).error));
 const assessment=validatedResearchAssessment(store.read('p'),artifact.id);
 assert.equal(assessment.rawReport.verdict,'needs_research');
 assert.equal(store.read('p').releases.length,0);
 assert.equal(await executor.enqueueReadiness('p',artifact.id,request),id);
 assert.equal(calls,1);
 const forged=store.read('p');forged.readinessReports[0].executionReceipt.inputPacketHash='0'.repeat(64);
 assert.throws(()=>validatedResearchAssessment(forged,artifact.id));
});

test('v2 needs_research guides an admitted captured delta and material research revision through explicit stage protocol',async t=>{
 const {validatedResearchAssessment}=await import('./project.mjs');
 const {APPLICABILITY_PROTOCOL}=await import('./research-applicability.mjs');
 const exactReceipt=(request,output,threadId)=>({...receipt(output,threadId),model:'synthetic',runId:request.runId,inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),responseText:JSON.stringify(output)});
 const {store,executor}=await runtime(t,async(request,store)=>{
  const job=store.read('p').jobs.find(j=>j.attempts.some(a=>a.id===request.runId));
  if(job.purpose==='correction_review'){
   const input=job.task.correctionReviewInput,output={...Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([,v])=>v.enum).map(([k,v])=>[k,v.enum[0]])),findings:input.correctionInput.sources.flatMap(s=>s.findings).map(f=>({findingKey:f.key,status:'unresolved',category:'missing_material',reason:'Preference evidence remains absent.',refs:[{location:'/summary',quote:'preference evidence still missing.'}]})),preservationCheck:{status:'complete',constraintManifestHash:input.correctionInput.constraintManifestHash,violations:[]},limitations:['Synthetic handling, no human acceptance.']};
   return exactReceipt(request,output,'actual-v4-handling-thread');
  }
  const input=job.task.readinessInput,refs=[{location:'/content/sections/0/body',quote:source.text}],obligationAssessments=request.packet.applicability.origins.map(origin=>({originKey:origin.key,preservation:{state:'retained',reason:'Original material limits retained.',refs},procurement:{kind:'required_now',state:'missing',material:'Preference evidence.',reason:'Present task research still incomplete.',refs,decisionDependency:'Ground strategy.'},requirementRefs:[{location:'/taskCard/brief',quote:input.taskCard.brief}],replacement:{originKeys:[],reason:'none',refs:[]},reason:'Actual action supplement does not establish preference.'}));
  const output={...needsResearch(input),sourceAssessments:input.sourceRecords.map((s,index)=>({sourceId:s.id,textHash:hash(s.text),use:'usable_with_limits',relevance:'Bounded supplied evidence.',provenance:'Captured excerpt.',limitations:['No authenticity or preference proof.'],refs:[{location:`/sourceRecords/${index}/text`,quote:s.text}]})),generationHash:request.packet.applicability.generationHash,obligationAssessments,useScan:{contentHash:input.contentHash,assessedOriginKeys:[],findings:[]}};
  return exactReceipt(request,output,'assessment-for-revision-'+input.artifactId);
 },async request=>{
  const job=store.read('p').jobs.find(j=>j.task.researchRevision),input=job.task.correctionInput;
  assert.equal(input.evidence.delta[0].verification,'captured');
  assert.equal(job.task.researchRevision.protocolVersion,'research-applicability-revision-v1');
  const output={...structuredClone(production),summary:'A source-attributed action finding now informs packaging observation, with preference evidence still missing.',sections:[...production.sections,{heading:'Task action',body:'A participant handed a glass to a friend.',evidenceIds:['action']}],claims:[...production.claims,{text:'The supplied participant excerpt describes handing a glass to a friend.',kind:'fact',evidenceRefs:['action'],limitations:['Single supplied action, no preference or convenience proof.']}],evidenceClassifications:[...production.evidenceClassifications,{sourceId:'action',scopeRelation:'background',reason:'Bounded task action.'}],stageProtocolVersion:job.task.researchRevision.protocolVersion,assessmentGenerationHash:job.task.researchRevision.generationHash,revisionResponses:input.sources.flatMap(s=>s.findings).map(f=>({findingKey:f.key,action:'partly_applied',explanation:'Added attributed task action; preference evidence remains missing.',outputLocations:[{location:'/summary',quote:'preference evidence still missing.'}]}))};
  return exactReceipt(request,output,'material-revision-thread');
 });
 const artifact=store.read('p').artifacts[0];
 const check=await executor.enqueueReadiness('p',artifact.id,{commandId:'assess',expectedRevision:store.read('p').revision,protocolVersion:APPLICABILITY_PROTOCOL});
 assert.equal((await executor.execute('p',check)).status,'succeeded');
 assert.equal(validatedResearchAssessment(store.read('p'),artifact.id).rawReport.verdict,'needs_research');
 const id=await executor.enqueueRevision('p',{artifactId:artifact.id,commandId:'real-delta-revision',expectedRevision:store.read('p').revision,supplementalSourceRecords:[{id:'action',url:'https://example.test/action',text:'A participant handed a glass to a friend.',scopeRelation:'background',reason:'Bounded supplied action.'}]});
 const result=await executor.execute('p',id);assert.equal(result.status,'succeeded',JSON.stringify(result.error));
 const after=store.read('p'),revised=after.artifacts.find(a=>a.id===result.outputVersionIds[0]);
 assert.notEqual(revised.contentHash,artifact.contentHash);
 assert.equal(revised.revision.revisionOf.artifactId,artifact.id);
 assert.equal(revised.technicalReceipts.sourceCatalogue.records[1].verification,'captured');
 assert.equal(after.releases.length,0);
 assert.equal(after.readinessReports[0].verdict,'needs_research');
 const recheck=await executor.enqueueReadiness('p',revised.id,{commandId:'assess-material-revision',expectedRevision:store.read('p').revision,protocolVersion:APPLICABILITY_PROTOCOL});
 const reassessed=await executor.execute('p',recheck);assert.equal(reassessed.status,'succeeded',JSON.stringify(reassessed.error));
 const handling=await executor.enqueueCorrectionReview('p',{artifactId:revised.id,commandId:'handling-v4',expectedRevision:store.read('p').revision,protocolVersion:'correction-handling-v4'});
 const handled=await executor.execute('p',handling);assert.equal(handled.status,'succeeded',JSON.stringify(handled.error));
 assert.equal(store.read('p').correctionReviews[0].protocolVersion,'correction-handling-v4');
 assert.equal(store.read('p').correctionReviews[0].hasBlockingFindings,true);
 assert.equal(validatedResearchAssessment(store.read('p'),revised.id).rawReport.verdict,'needs_research');
 assert.equal(store.read('p').releases.length,0);
});
