import {COPY_HTTP_FIELDS} from './simple-copy-http.mjs';
import {WORKFLOW_VERSION, workflowView, requireResearchWorkflow} from './seven-stage-workflow.mjs';
import {createResearchService} from './research-service.mjs';
import {createBriefIntakeService} from './brief-intake-service.mjs';
import http from 'node:http';
import {randomUUID, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {openStore} from './store.mjs';
import {layoutPublicProject} from './layout-boundary.mjs';
import {DomainError, projectView, STAGES} from './project.mjs';

const MAX_BODY_BYTES = 128 * 1024;
const commandFields = {'revise-task-card': ['taskCardId', 'brief'], 'confirm-task-card': ['taskCardId']};
class HttpError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, {status, code}); }
}
function invalid(message) { throw new HttpError(400, 'INVALID_REQUEST', message); }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('JSON object required');
  for (const key of Object.keys(body)) if (!allowed.includes(key)) invalid(`Unexpected field: ${key}`);
}
function string(body, key, required = true) {
  if (body[key] === undefined && !required) return;
  if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 60000) invalid(`${key} must be a nonempty string of at most 60000 characters`);
}
function readerBody(resource, body) {
  if (resource === '/research-questions') {
    if (![1, 2].includes(body.readerCount) || !Array.isArray(body.questions) || !body.questions.length || body.questions.length > 100) invalid('One or two readers and bounded questions required');
    for (const question of body.questions) {
      fields(question, ['id', 'question', 'critical']);string(question, 'id');string(question, 'question');
      if (typeof question.critical !== 'boolean') invalid('Question critical must be boolean');
    }
  }
  if (['/research-revisions', '/research-readers', '/research-reader-dispositions'].includes(resource)) string(body, 'artifactId');
  if (resource === '/research-readers') {
    string(body, 'registrationId');
    if (![0, 1].includes(body.seat)) invalid('A preregistered reader seat is required');
    for (const key of ['previousReportId', 'dispositionId']) if (Object.hasOwn(body, key)) string(body, key);
    if (Object.hasOwn(body, 'previousReportId') !== Object.hasOwn(body, 'dispositionId')) invalid('Recheck needs its original report and saved dispositions');
  }
  if (resource === '/research-reader-reconciliations') string(body, 'jobId');
  if (resource === '/research-reader-dispositions') {
    string(body, 'previousReportId');
    if (!Array.isArray(body.dispositions) || body.dispositions.length > 100) invalid('Bounded reader dispositions required');
    for (const disposition of body.dispositions) {
      fields(disposition, ['issueId', 'action', 'response', 'locations']);
      for (const key of ['issueId', 'action', 'response']) string(disposition, key);
      if (!Array.isArray(disposition.locations) || !disposition.locations.length || disposition.locations.length > 100) invalid('Located revised report evidence required');
      for (const location of disposition.locations) {fields(location, ['location', 'quote']);string(location, 'location');string(location, 'quote');}
    }
  }
}
async function jsonBody(req, maxBytes = MAX_BODY_BYTES) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'JSON_REQUIRED', 'Use application/json');
  if (Number(req.headers['content-length']) > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE', 'JSON body exceeds permitted size');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE', 'JSON body exceeds permitted size');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { invalid('Malformed JSON'); }
}
function response(res, status, body) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}
const humanContext = () => ({actorType: 'human', actorId: 'local-operator', runId: `human:${randomUUID()}`, contextId: `local-ui:${randomUUID()}`, now: new Date().toISOString()});

function frontendOrigin(value) {
  if (value === undefined) return;
  let url;
  try { url = new URL(value); } catch { throw new Error('origin must be an explicit HTTP loopback origin'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || url.origin !== value) throw new Error('origin must be an explicit HTTP loopback origin');
  return value;
}

export function createBriefServer({dbPath, port = 4182, origin, researchOptions, intakeConfiguration = null, creationAuthorizedThrough = 'research'} = {}) {
  if (typeof dbPath !== 'string' || !dbPath.trim()) throw new Error('An explicit dbPath is required');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be between 1 and 65535');
  if(typeof creationAuthorizedThrough!=='string'||!Object.hasOwn(STAGES,creationAuthorizedThrough))throw new Error('Invalid creation authorization endpoint');
  const allowedOrigin = frontendOrigin(origin);
  const store = openStore(dbPath);
  let research, intake;
  try {
    research = createResearchService({rootDir: resolve(`${dbPath}.research`), ...researchOptions, originalsRoot:resolve(`${dbPath}.originals`), store});
    intake = createBriefIntakeService({store, rootDir: resolve(`${dbPath}.originals`), intakeConfiguration});
  } catch(error) {store.close();throw error;}
  const result = async project => {
    const native = projectView(project), rw = project.workflow ? await research.workflowSnapshot(project) : null;
    const publicProject=layoutPublicProject(project);
    // One existing project object, never a second raw snapshot or a hash of a cropped layout view.
    const sketchSourceReadback=publicProject===project&&project.sketchGenerations?.length?await research.visualReadbackEnvelope(project):null;
    return {project:publicProject,...(sketchSourceReadback?{sketchSourceReadback}:{}),view:{...native,proposalWorkflow:workflowView(project,{researchWorkflow:rw}),researchWorkflow:rw}};
  };
  const extractionResult = async (id, documentId, receipt = {}) => {
    const p = store.read(id);
    if (receipt.revision !== undefined && receipt.revision !== p.revision) throw new HttpError(409, 'REVISION_CONFLICT', 'Project changed after local extraction');
    const extracted = await intake.extraction(id, documentId), snapshot = await result(p);
    if (store.read(id).revision !== p.revision) throw new HttpError(409, 'REVISION_CONFLICT', 'Project changed while reading local extraction');
    return {...snapshot, ...receipt, ...extracted, revision:p.revision};
  };
  const requests = new Set();
  let closing = false, shutdown, closeResult;
  const drain = async () => { while (requests.size) await Promise.allSettled([...requests]); };
  const finishClose = () => {
    closing = true;
    shutdown ??= drain().then(() => store.close());
    return shutdown;
  };
  const handle = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (closing) throw new HttpError(503, 'SERVER_CLOSING', 'Brief service is shutting down');
      const activePort = server.address()?.port ?? port;
      if (![ `127.0.0.1:${activePort}`, `localhost:${activePort}` ].includes(req.headers.host)) throw new HttpError(403, 'INVALID_HOST', 'Use the local service address');
      const localOrigin = `http://${req.headers.host}`;
      const url = new URL(req.url, localOrigin);
      if (url.origin !== localOrigin) throw new HttpError(403, 'INVALID_HOST', 'Request target must use the local origin');
      if ((req.headers.origin && req.headers.origin !== localOrigin && req.headers.origin !== allowedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'CROSS_ORIGIN', 'Only the configured local frontend is allowed');
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
      }
      const projectMatch = /^\/api\/v1\/projects\/([A-Za-z0-9-]+)(\/(?:commands|sources|research-workflow|research-jobs|research-verification|research-readiness|research-handoffs|research-release|research-questions|research-readers|research-reader-reconciliations|research-reader-dispositions|research-revisions)|\/artifacts\/([A-Za-z0-9:._%-]+)\/content)?$/.exec(url.pathname);
      const documentMatch = /^\/api\/v1\/projects\/([A-Za-z0-9-]+)\/documents(?:\/([A-Za-z0-9-]+)\/(original|extraction))?$/.exec(url.pathname);
      const visualBMatch=/^\/api\/v1\/projects\/([A-Za-z0-9-]+)\/(final-visual-workflow(?:\/(step))?|final-visual-continuations|final-visual-adoptions|final-visual-release)$/.exec(url.pathname);
      const visualMatch=/^\/api\/v1\/projects\/([A-Za-z0-9-]+)\/(visual-workflow(?:\/(step))?|visual-image-uploads|visual-images\/([A-Za-z0-9_-]{1,100})|reference-materials|copy-continuations|sketch-continuations|sketch-review-continuations|reference-choices|reference-adoptions|sketch-adoptions)$/.exec(url.pathname);
      const copyMatch=/^\/api\/v1\/projects\/([A-Za-z0-9-]+)\/(strategy-continuations|copy-workflow(?:\/(step|verify|review))?|simple-strategy\/confirm)$/.exec(url.pathname);
      const simpleMatch=/^\/api\/v1\/projects\/([A-Za-z0-9-]+)\/simple-strategy(?:\/(continue|verify|reconcile))?$/.exec(url.pathname);
      const acquisitionMatch=/^\/api\/v1\/projects\/([A-Za-z0-9-]+)\/research-acquisition(?:\/(start|step|reconcile))?$/.exec(url.pathname);
      const readerMatch=/^\/api\/v1\/projects\/([A-Za-z0-9-]+)\/research-reader-reports\/([A-Za-z0-9-]+)$/.exec(url.pathname);
      const resource = projectMatch?.[2];
      const methods = visualBMatch ? [visualBMatch[2]==='final-visual-workflow'?'GET':'POST'] : visualMatch ? [visualMatch[2]==='visual-workflow'||visualMatch[4]?'GET':'POST'] : copyMatch ? [copyMatch[2]==='copy-workflow'?'GET':'POST'] : simpleMatch ? [simpleMatch[2]?'POST':'GET'] : acquisitionMatch ? [acquisitionMatch[2]?'POST':'GET'] : readerMatch ? ['GET'] : documentMatch ? documentMatch[3] === 'original' ? ['GET'] : ['GET','POST'] : url.pathname === '/api/v1/capabilities' ? ['GET'] : url.pathname === '/api/v1/projects' ? ['GET', 'POST'] : projectMatch ? [!resource || resource === '/research-workflow' || projectMatch[3] ? 'GET' : 'POST'] : [];
      if (!methods.length) throw new HttpError(404, 'NOT_FOUND', 'Route not found');
      const revision = url.searchParams.get('revision');
      const targetMethod = req.method === 'OPTIONS' ? req.headers['access-control-request-method'] : req.method;
      if (url.search && !(projectMatch && !projectMatch[2] && targetMethod === 'GET' && [...url.searchParams.keys()].every(k => k === 'revision') && url.searchParams.getAll('revision').length === 1 && /^\d+$/.test(revision) && Number.isSafeInteger(Number(revision)))) invalid('Only a nonnegative revision query is supported on project reads');
      if (req.method === 'OPTIONS') {
        if (!req.headers.origin || !methods.includes(req.headers['access-control-request-method']) || (req.headers['access-control-request-headers'] ?? '').split(',').some(h => h.trim() && !['content-type',...(visualMatch?.[2]==='visual-image-uploads'?['x-workbench-image-meta']:[])].includes(h.trim().toLowerCase()))) invalid('Invalid preflight');
        res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
        res.setHeader('Access-Control-Allow-Headers', visualMatch?.[2]==='visual-image-uploads'?'Content-Type, X-Workbench-Image-Meta':'Content-Type');
        res.writeHead(204); res.end(); return;
      }
      if (!methods.includes(req.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
      if (url.pathname === '/api/v1/capabilities') {
        await intake.extractionCapability();
        response(res, 200, {apiVersion: 'v1', surface: research.capability().executionAllowed ? 'research-v1' : 'brief-v1', workflowVersion:WORKFLOW_VERSION, executionAvailable: research.capability().executionAllowed, research:research.capability(), originals:intake.capability(), commands: Object.keys(commandFields)}); return;
      }
      if(visualBMatch){const id=visualBMatch[1],resource=visualBMatch[2];let payload;
        if(resource==='final-visual-workflow')payload=await research.visualBStatus(id);
        else if(['final-visual-adoptions','final-visual-release'].includes(resource)){const body=await jsonBody(req),keys=['commandId','expectedRevision','artifactId','runId','sourceHash','draftHash',...(resource==='final-visual-adoptions'?['reason']:[])];fields(body,keys);for(const key of keys.filter(k=>k!=='expectedRevision'))string(body,key);if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||!['sourceHash','draftHash'].every(k=>/^[a-f0-9]{64}$/.test(body[k])))invalid('Exact current final identity required');payload=resource==='final-visual-adoptions'?await research.visualBAdopt(id,body,humanContext()):await research.visualBRelease(id,body);}
        else {const body=await jsonBody(req),keys=['commandId','expectedRevision',...(resource==='final-visual-continuations'?['sketchArtifactId','sketchContentHash','sourceHash']:['phase','targetId','sourceHash','jobIds'])];fields(body,keys);if(!keys.every(k=>Object.hasOwn(body,k)))invalid('Required final visual fields missing');string(body,'commandId');if(body.commandId==='__proto__')invalid('Invalid command identity');if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Revision required');for(const key of resource==='final-visual-continuations'?['sketchArtifactId','sketchContentHash','sourceHash']:['phase','targetId','sourceHash'])string(body,key);if(!/^[a-f0-9]{64}$/.test(body.sourceHash)||resource==='final-visual-continuations'&&!/^[a-f0-9]{64}$/.test(body.sketchContentHash))invalid('Exact SHA required');if(resource!=='final-visual-continuations'&&(body.phase!=='final_visual'||!Array.isArray(body.jobIds)||body.jobIds.length<1||body.jobIds.length>4||new Set(body.jobIds).size!==body.jobIds.length||body.jobIds.some(j=>typeof j!=='string'||!j.trim())))invalid('Fixed final visual phase and job set required');payload=resource==='final-visual-continuations'?await research.visualBContinue(id,body):await research.visualBStep(id,body);}
        const p=store.read(id);if(p.revision!==payload.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed');const snapshot=await result(p);if(store.read(id).revision!==p.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed');response(res,200,{...snapshot,...payload});return;
      }
      if(visualMatch){const id=visualMatch[1],resource=visualMatch[2];if(visualMatch[4]){const original=await research.visualImage(id,visualMatch[4]);res.writeHead(200,{'Content-Type':original.asset.mediaType,'Content-Length':original.bytes.length,'Content-Disposition':'inline'});res.end(original.bytes);return;}
        let payload;if(resource==='visual-workflow')payload=await research.visualStatus(id);
        else if(resource==='visual-image-uploads'){const raw=req.headers['x-workbench-image-meta'];if(typeof raw!=='string'||raw.length>2048||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))invalid('Bounded canonical upload metadata required');let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(raw,'base64')));}catch{invalid('Invalid upload metadata');}fields(body,['commandId','expectedRevision','originalFilename','description','sha256']);for(const k of ['commandId','originalFilename','description','sha256'])string(body,k);if(!/^[a-f0-9]{64}$/.test(body.sha256)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Exact image hash and revision required');if(!['image/png','image/jpeg'].includes(req.headers['content-type']))throw new HttpError(415,'IMAGE_TYPE_REQUIRED','PNG/JPEG bytes required');const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>8*1024*1024)throw new HttpError(413,'IMAGE_TOO_LARGE','Image exceeds 8MiB');chunks.push(Buffer.from(chunk));}payload=await research.uploadVisualImage(id,body,Buffer.concat(chunks),humanContext());}
        else{const body=await jsonBody(req),common=['commandId','expectedRevision'],extra={'visual-workflow/step':['phase','targetId','sourceHash','jobIds'],'reference-materials':['artifactId','imageId','directionId','kind','applicabilityProfile','borrowingNote'],'copy-continuations':['artifactId','discoveryMode'],'sketch-continuations':['dossierId','selectionHash'],'sketch-review-continuations':['generationId','sourceHash'],'reference-adoptions':['dossierId','selectionHash','reason'],'reference-choices':body.action==='adopt'?['dossierId','action','editionHash','reason']:['dossierId','action','catalogHash','selection','reason'],'sketch-adoptions':['artifactId','contentHash','runId','reason']}[resource];fields(body,[...common,...extra]);if(![...common,...extra].every(k=>Object.hasOwn(body,k)))invalid('Required visual fields missing');string(body,'commandId');if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Revision required');payload=resource==='visual-workflow/step'?await research.visualStep(id,body):await research.visualCommand(id,resource,body,humanContext());}
        const p=store.read(id);if(p.revision!==payload.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed');const snapshot=await result(p);if(store.read(id).revision!==p.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed');response(res,200,{...snapshot,...payload});return;
      }
      if(copyMatch){const id=copyMatch[1],operation=copyMatch[2]==='strategy-continuations'?'continue':copyMatch[2]==='simple-strategy/confirm'?'confirm':copyMatch[3];let payload;if(!operation)payload=await research.copyStatus(id);else{const body=await jsonBody(req);fields(body,['commandId','expectedRevision',...COPY_HTTP_FIELDS[operation]]);payload=await research.copyCommand(id,operation,body,humanContext());}const p=store.read(id);if(p.revision!==payload.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed');const snapshot=await result(p);if(store.read(id).revision!==p.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed');response(res,200,{...snapshot,...payload});return;}
      if(simpleMatch){const id=simpleMatch[1],operation=simpleMatch[2];let payload;if(!operation)payload=await research.simpleStrategyStatus(id);else{const body=await jsonBody(req);fields(body,['commandId','expectedRevision',...({continue:['artifactId','policyVersion'],verify:['artifactId'],reconcile:['jobId']}[operation])]);payload=await research[{continue:'simpleStrategyContinue',verify:'simpleStrategyVerify',reconcile:'simpleStrategyReconcile'}[operation]](id,body);}const p=store.read(id);if(p.revision!==payload.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed');const snapshot=await result(p);if(store.read(id).revision!==p.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed');response(res,200,{...snapshot,...payload});return;}
      if(acquisitionMatch){
        const id=acquisitionMatch[1],operation=acquisitionMatch[2];let payload;
        if(!operation)payload=await research.acquisitionStatus(id);
        else {
          const body=await jsonBody(req),common=['commandId','expectedRevision','taskCardId','taskCardHash'],extra={start:['sourceEntryIds','materialIds'],step:['generationId','jobIds'],reconcile:['generationId','jobId']}[operation];
          fields(body,[...common,...extra]);payload=await research[{start:'acquisitionStart',step:'acquisitionStep',reconcile:'acquisitionReconcile'}[operation]](id,body,humanContext());
        }
        const p=store.read(id);if(p.revision!==payload.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed during acquisition response');const snapshot=await result(p);if(store.read(id).revision!==p.revision)throw new HttpError(409,'REVISION_CONFLICT','Project changed during acquisition response');
        response(res,200,{...snapshot,...payload});return;
      }
      if(readerMatch){response(res,200,await research.readerReport(readerMatch[1],readerMatch[2]));return;}
      if (documentMatch) {
        const id = documentMatch[1];
        if (documentMatch[3] === 'extraction') {
          const documentId = documentMatch[2];
          if (req.method === 'GET') {response(res,200,await extractionResult(id,documentId));return;}
          const body = await jsonBody(req);
          fields(body,['documentId','taskCardId','taskCardHash','commandId','expectedRevision','action']);
          if (body.documentId !== documentId) invalid('Document ID must match the extraction route');
          const receipt = await intake.extract(id,body,humanContext());
          response(res,200,await extractionResult(id,documentId,receipt));return;
        }
        if (req.method === 'GET' && !documentMatch[2]) {response(res,200,await intake.list(id));return;}
        if (req.method === 'GET') {
          const {document,bytes} = await intake.read(id,documentMatch[2]);
          res.writeHead(200,{'Content-Type':document.mediaType,'Content-Length':bytes.length,'Content-Disposition':'attachment','ETag':`"${document.sha256}"`});
          res.end(bytes);return;
        }
        const body=await jsonBody(req,4*Math.ceil(intake.capability().maxBytes/3)+16384);
        fields(body,['base64','commandId','expectedRevision','originalFilename','taskCardId','taskCardHash','metadata']);
        if(typeof body.base64!=='string'||body.base64.length>4*Math.ceil(intake.capability().maxBytes/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64))invalid('Bounded canonical base64 required');
        const bytes=Buffer.from(body.base64,'base64');
        if(bytes.toString('base64')!==body.base64)invalid('Canonical base64 required');
        const {base64,...request}=body, receipt=await intake.upload(id,request,bytes);
        response(res,200,{...(await result(store.read(id))),document:receipt.document,receipt:{documentId:receipt.documentId,commandId:body.commandId,replayed:receipt.receipt.replayed}});return;
      }
      if (url.pathname === '/api/v1/projects' && req.method === 'GET') {
        response(res, 200, {projects: store.list().map(({id}) => { const p = store.read(id); return {id, name: p.name, revision: p.revision}; })}); return;
      }
      if (url.pathname === '/api/v1/projects') {
        const body = await jsonBody(req);
        fields(body, ['name', 'brief', 'mode', 'humanGates', 'commandId']);
        if (body.mode !== undefined && !['auto', 'assisted'].includes(body.mode)) invalid('mode must be auto or assisted');
        if (body.humanGates !== undefined && (!Array.isArray(body.humanGates) || !body.humanGates.every(stage => ['strategy', 'copy', 'visual', 'final_review'].includes(stage)))) invalid('humanGates must contain current manual stages');
        string(body, 'name'); string(body, 'brief'); string(body, 'commandId', false);
        if (body.commandId === '__proto__') invalid('Reserved commandId');
        const id = body.commandId ? `project-${createHash('sha256').update(body.commandId).digest('hex')}` : randomUUID();
        const input = {id, name: body.name.trim(), brief: body.brief, mode: body.mode ?? 'assisted', humanGates: body.humanGates ?? [], authorizedThrough: creationAuthorizedThrough, workflowVersion:WORKFLOW_VERSION};
        try { response(res, 201, await result(store.create(input, humanContext()))); }
        catch (error) {
          if (error.code !== 'PROJECT_EXISTS' || !body.commandId) throw error;
          const initial = store.read(id, 0), policy = initial.policies[0];
          if (initial.name !== input.name || initial.taskCards[0].brief !== input.brief || policy.mode !== input.mode || policy.authorizedThrough !== input.authorizedThrough || JSON.stringify(policy.humanGates) !== JSON.stringify([...new Set(input.humanGates)])) throw new HttpError(409, 'COMMAND_ID_REUSED', 'Creation command ID belongs to another payload');
          response(res, 200, await result(store.read(id)));
        }
        return;
      }
      if (!projectMatch[2]) { response(res, 200, await result(store.read(projectMatch[1], revision === null ? undefined : Number(revision)))); return; }
      if (resource !== '/commands') {
        const id = projectMatch[1], p = store.read(id); requireResearchWorkflow(p);
        if (resource === '/research-workflow') {response(res,200,{workflow:await research.workflowSnapshot(p), capability:research.capability()}); return;}
        if (projectMatch[3]) {response(res,200,await research.content(id,decodeURIComponent(projectMatch[3])));return;}
        const body = await jsonBody(req), common = ['commandId','expectedRevision'];
        const extra = {'/sources':['input'], '/research-jobs':['sourceEntryIds'], '/research-verification':['artifactId'], '/research-readiness':['artifactId'], '/research-handoffs':['artifactId','contentHash','basisHash','input'], '/research-release':['artifactId','contentHash','basisHash','policyVersion'], '/research-revisions':['artifactId'], '/research-questions':['questions','readerCount'], '/research-readers':['artifactId','registrationId','seat','previousReportId','dispositionId'], '/research-reader-reconciliations':['jobId'], '/research-reader-dispositions':['artifactId','previousReportId','dispositions']}[resource];
        fields(body,[...common,...extra]); string(body,'commandId');
        if (body.commandId==='__proto__' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision<0) invalid('Valid command ID and revision required');
        readerBody(resource,body);
        let receipt, replayed=Object.hasOwn(p.processedCommands,body.commandId);
        if(resource==='/sources') {
          const after=store.command(id,{kind:'register-research-source',source:body.input,...Object.fromEntries(common.map(k=>[k,body[k]]))},humanContext());
          const source=after.sourceEntries.find(x=>x.id===`source-${createHash('sha256').update(JSON.stringify([id,body.commandId])).digest('hex')}`);
          receipt={sourceId:source.id};
        } else {
          const method={'/research-jobs':'generate','/research-verification':'verify','/research-readiness':'assess','/research-handoffs':'handoff','/research-release':'release','/research-revisions':'revise','/research-questions':'registerQuestions','/research-readers':'readReport','/research-reader-reconciliations':'reconcileReader','/research-reader-dispositions':'disposeReader'}[resource];
          receipt=await research[method](id,body,humanContext());
        }
        response(res,200,{...(await result(store.read(id))),receipt:{...receipt,commandId:body.commandId,replayed}});return;
      }
      const body = await jsonBody(req);
      if (!body || typeof body.kind !== 'string' || !Object.hasOwn(commandFields, body.kind)) throw new HttpError(403, 'COMMAND_FORBIDDEN', 'Only Brief revisions and confirmations are supported');
      fields(body, ['kind', 'commandId', 'expectedRevision', ...commandFields[body.kind]]);
      for (const key of ['commandId', ...commandFields[body.kind]]) string(body, key);
      if (body.commandId === '__proto__' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) invalid('Valid command ID and nonnegative revision required');
      const replayed = Object.hasOwn(store.read(projectMatch[1]).processedCommands, body.commandId);
      const project = store.command(projectMatch[1], body, humanContext());
      response(res, 200, {...(await result(project)), receipt: {commandId: body.commandId, replayed}});
    } catch (error) {
      const status = error.status ?? (error.code==='SOURCE_ENTRY_INVALID' ? 422 : error instanceof DomainError ? error.code === 'NOT_FOUND' ? 404 : ['REVISION_CONFLICT', 'COMMAND_ID_REUSED', 'PROJECT_EXISTS'].includes(error.code) ? 409 : 422 : 500);
      response(res, status, {error: {code: status === 500 ? 'INTERNAL_ERROR' : error.code, message: status === 500 ? 'Brief service could not complete the request' : error.message}});
    }
  };
  const server = http.createServer((req, res) => {
    const request = handle(req, res);
    requests.add(request);
    request.finally(() => requests.delete(request)).catch(() => {});
  });
  const listen = server.listen.bind(server);
  server.listen = (callback) => {
    if (callback !== undefined && typeof callback !== 'function') throw new Error('Brief service only listens on its configured loopback address');
    return listen(port, '127.0.0.1', callback);
  };
  server.drain = drain;
  server.once('close', () => { finishClose().catch(error => server.emit('error', error)); });
  const close = server.close.bind(server);
  server.close = callback => {
    closing = true;
    closeResult ??= new Promise(resolve => close(error => {
      finishClose().then(() => resolve(error?.code === 'ERR_SERVER_NOT_RUNNING' ? undefined : error), resolve);
    }));
    if (typeof callback === 'function') closeResult.then(callback);
    return server;
  };
  return server;
}

async function main() {
  try {
    const options = {}, args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      if (!['--db', '--port', '--origin', '--research-config', '--research-execution', '--pdf-python'].includes(args[i]) || args[i + 1] === undefined || Object.hasOwn(options, args[i])) throw new Error('Use --db PATH [--port PORT] [--origin HTTP_LOOPBACK_ORIGIN] [--pdf-python ABS_PATH]');
      options[args[i]] = args[i + 1];
    }
    let researchOptions,creationAuthorizedThrough='research';
    if(options['--research-execution']!==undefined && !['enabled','disabled'].includes(options['--research-execution'])) throw new Error('Use --research-execution enabled or disabled');
    if(options['--research-execution']==='enabled'&&!options['--research-config'])throw new Error('Explicit research configuration required');
    if(options['--research-config']){
      const {loadLaunchSettings,buildLaunchOptions}=await import('./launch-config.mjs');
      const configured=buildLaunchOptions(await loadLaunchSettings({configPath:options['--research-config']}));
      if(resolve(configured.dbPath)!==resolve(options['--db']))throw new Error('Research configuration must name the same explicit isolated database');
      creationAuthorizedThrough=configured.creationAuthorizedThrough??'research';
      researchOptions={...configured,executionAllowed:options['--research-execution']==='enabled'};
    }
    const intakeConfiguration=options['--pdf-python']===undefined?null:{pythonBinary:options['--pdf-python']};
    const server = createBriefServer({researchOptions,intakeConfiguration,creationAuthorizedThrough,dbPath: options['--db'], port: options['--port'] === undefined ? 4182 : Number(options['--port']), origin: options['--origin']});
    server.once('error', error => { console.error(error.message); server.close(() => { process.exitCode = 1; }); });
    server.listen(() => console.log(`Brief service available at http://127.0.0.1:${server.address().port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(error => { if (error) process.exitCode = 1; }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
