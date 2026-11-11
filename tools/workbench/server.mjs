import {initializeSemanticReview} from './semantic-startup.mjs';
import {handleFinalReviewHttp} from './final-review-http.mjs';
import {createAssistantRuntime} from './assistant-runtime.mjs';
import {handleAssistantHttp} from './assistant-http.mjs';
import {ACQUISITION_PURPOSES} from './research-acquisition.mjs';
import {handleIntakeHttp} from './intake-http.mjs';
import {registeredSources} from './research-sources.mjs';
import {finalPreparationQueueKey,shouldQueueFinalPreparation} from './final-review-continuation.mjs';
import {CONTENT_PURPOSES} from './complete-content.mjs';
import {FINAL_VISUAL_PURPOSES} from './final-visual.mjs';
import {loadImageProvider} from './image-api-provider.mjs';
import {createImageEvidenceStore, IMAGE_LIMITS} from './image-evidence.mjs';
import {isDeepStrictEqual} from 'node:util';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
import {createExecutor} from './executor.mjs';
import {startWorkbench} from './launch-workbench.mjs';
import {openStore} from './store.mjs';
import {layoutPublicProject} from './layout-boundary.mjs';
import {DomainError, projectView, researchWorkflowView, copyDeliveryEnvelope, STAGES, CORRECTION_REPORT_KINDS} from './project.mjs';
import {referenceState} from './reference-dossier.mjs';
import {recoverInterruptedJobs} from './recovery.mjs';
import {readArtifactContent} from './artifact-content.mjs';

const commandFields = {
  'confirm-task-card': ['taskCardId'],
  'revise-task-card': ['taskCardId', 'brief'],
  'set-policy': ['mode', 'humanGates', 'authorizedThrough'],
  'adopt-complete-content': ['artifactId','draftHash','reason'],
  'adopt-final-visual': ['artifactId','draftHash','reason'],
  'adopt-creative': ['artifactId', 'reason'],
  'authorize-visual': ['sketchArtifactId', 'reason'],
};
const versionedProjectRoutes = new Set([
  '/sources','/commands','/jobs','/verifications','/reconciliations','/readiness-resolutions','/readiness',
  '/handoffs','/research-handoffs','/research-release','/research-continuations','/research-status',
  '/research-cancellations','/continuations','/observations','/observation-reviews','/source-captures',
  '/case-identities','/feedback','/revisions','/feedback-reviews','/correction-reviews','/creative-panels',
  '/strategy-continuations','/copy-continuations','/reference-materials','/reference-actions',
  '/reference-choices','/sketch-continuations','/sketch-review-input','/sketch-review-continuations',
  '/final-visual-continuations','/content-continuations','/content-revisions','/content-status',
  '/content-draft','/layout-continuations','/layout-revisions','/layout-status','/layout-semantic-plans',
  '/images',
]);
const versionedGetRoutes = new Set([
  '/research-status','/readiness-resolutions','/sketch-review-input',
  '/content-status','/content-draft','/layout-status','/layout-semantic-plans','/final-review-status',
]);
function legacyEquivalentForVersionedPath(path) {
  if (path === '/api/v1/capabilities' || path === '/api/v1/projects') return path.replace('/api/v1/', '/api/');
  const match = /^\/api\/v1\/projects\/([A-Za-z0-9-]+)(\/.*)?$/.exec(path);
  if (!match) return path;
  const suffix = match[2] ?? '';
  if (versionedProjectRoutes.has(suffix) || /^\/sources\/[A-Za-z0-9-]+\/content$/.test(suffix) || /^\/images\/img_[A-Za-z0-9_-]+$/.test(suffix) || /^\/artifacts\/[A-Za-z0-9-]+\/content$/.test(suffix)) return `/api/projects/${match[1]}${suffix}`;
  return path;
}
function allowedVersionedQuery(path, method) {
  if (method === 'GET' && /^\/api\/v1\/projects\/[A-Za-z0-9-]+$/.test(path)) return ['revision'];
  if (method === 'GET' && /^\/api\/v1\/projects\/[A-Za-z0-9-]+\/readiness-resolutions$/.test(path)) return ['jobId', 'attemptId'];
  if (method === 'GET' && /^\/api\/v1\/projects\/[A-Za-z0-9-]+\/sketch-review-input$/.test(path)) return ['generationId'];
  return [];
}
function versionedRouteMethodSupported(path,method) {
  if(path==='/api/v1/capabilities')return method==='GET';
  if(path==='/api/v1/projects')return method==='GET'||method==='POST';
  const match=/^\/api\/v1\/projects\/[A-Za-z0-9-]+(\/.*)?$/.exec(path);
  if(!match)return false;
  const suffix=match[1]??'';
  if(method==='GET')return !suffix||versionedGetRoutes.has(suffix)||/^\/sources\/[A-Za-z0-9-]+\/content$/.test(suffix)||/^\/images\/img_[A-Za-z0-9_-]+$/.test(suffix)||/^\/artifacts\/[A-Za-z0-9-]+\/content$/.test(suffix);
  if(method==='POST')return versionedProjectRoutes.has(suffix)&&(!versionedGetRoutes.has(suffix)||suffix==='/readiness-resolutions');
  return false;
}
function validateVersionedQuery(url, method) {
  if (!url.pathname.startsWith('/api/v1/') || !url.search) return;
  const allowed = allowedVersionedQuery(url.pathname, method);
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key)) throw new HttpError(422, 'INVALID_QUERY', `Unexpected query field: ${key}`);
  }
}
function historicalReferenceStates(project) {
  return (project.referenceDossiers??[]).map(d=>{
    const identity={dossierId:d.id,artifactId:d.envelope.source.source?.artifactId};
    try { return {...identity,...referenceState(project,d,{sourceEnvelope:copyDeliveryEnvelope})}; }
    catch(error) { return {...identity,status:'blocked',reason:error.code??'REFERENCE_CAPTURE_CHANGED'}; }
  });
}
const limit = 128 * 1024;
class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
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
function policy(body) {
  if (body.mode !== undefined && !['auto', 'assisted'].includes(body.mode)) invalid('mode must be auto or assisted');
  if (body.humanGates !== undefined && (!Array.isArray(body.humanGates) || !body.humanGates.every(stage => typeof stage === 'string' && Object.hasOwn(STAGES, stage)))) invalid('humanGates must contain known stages');
  if (body.authorizedThrough !== undefined && (typeof body.authorizedThrough !== 'string' || !Object.hasOwn(STAGES, body.authorizedThrough))) invalid('authorizedThrough must be a known stage');
}
function normalizeSources(records) {
  if (!Array.isArray(records) || records.length > 200) invalid('sourceRecords must be an array of at most 200 sources');
  const ids = new Set();
  return records.map(source => {
    fields(source, ['id', 'url', 'text', 'scopeRelation', 'reason']);
    for (const key of ['id', 'url', 'text', 'scopeRelation']) string(source, key);
    string(source, 'reason', false);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(source.id) || ids.has(source.id)) invalid('Source IDs must be unique stable identifiers');
    ids.add(source.id);
    if (source.text.length > 20000 || source.url.length > 20000 || (source.reason?.length ?? 0) > 20000) invalid('Source fields exceed 20000 characters');
    let url;
    try { url = new URL(source.url); } catch { invalid('Source URL is invalid'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) invalid('Source URL must use HTTP(S) without credentials');
    if (!['direct', 'background', 'visual', 'unverified'].includes(source.scopeRelation)) invalid('Unknown source scopeRelation');
    return {id: source.id, url: source.url, text: source.text, scopeRelation: source.scopeRelation, ...(source.reason === undefined ? {} : {reason: source.reason}), verification: 'captured'};
  });
}
async function jsonBody(req, maxBytes = limit) {
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

export function createServer({dbPath = fileURLToPath(new URL('../../.data/workbench.sqlite', import.meta.url)), port = 4181, uiPath = fileURLToPath(new URL('./ui.html', import.meta.url)), rootDir = join(dirname(dbPath), 'executions'), providers = {}, bindings = {}, semanticReview = null, acquisitionDependencies = {}, creativeCalibrations = [], referenceConfiguration = null, sketchConfiguration = null, sketchReviewConfiguration = null, finalVisualConfiguration = null, contentConfiguration = null, layoutConfiguration = null, finalReviewConfiguration = null, launchConfiguration = null, intakeConfiguration = null, researchAcquisitionConfiguration = null, searchProviders = {}, imageProvider = loadImageProvider(), maxConcurrentJobs = 2, assistantReadAuthorization = () => true} = {}) {
  if (!Number.isInteger(maxConcurrentJobs) || maxConcurrentJobs < 1 || maxConcurrentJobs > 8) throw new Error('maxConcurrentJobs must be an integer between 1 and 8');
  const store = openStore(dbPath);
  let semanticLease;
  try {semanticLease=initializeSemanticReview(store,semanticReview,bindings);}catch(error){store.close();throw error;}
  recoverInterruptedJobs(store);
  const imageStore = createImageEvidenceStore({rootDir: join(rootDir, 'images')});
  const executor = createExecutor({store, rootDir, providers, bindings, semanticLease, imageStore, acquisitionDependencies, creativeCalibrations, referenceConfiguration, imageProvider, sketchConfiguration, sketchReviewConfiguration, finalVisualConfiguration, contentConfiguration, layoutConfiguration, finalReviewConfiguration, launchConfiguration, intakeConfiguration, researchAcquisitionConfiguration, searchProviders});
  const assistant = createAssistantRuntime({store,rootDir:join(rootDir,'assistant'),providers,bindings,authorizeProject:assistantReadAuthorization,maxConcurrentRequests:maxConcurrentJobs});
  const result = async (project,{historical=false}={}) => ({
    project:layoutPublicProject(project),
    view:{
      ...projectView(project),
      researchWorkflow:researchWorkflowView(project,{bindings,providers}),
      references:historical
        ? historicalReferenceStates(project)
        : await executor.referenceStates(project),
    },
  });
  const requests = new Set();
  const pending = new Set(), scheduled = new Set(), waiting = [], inspectedFinal = new Map();
  let closing = false, pumpScheduled = false, shutdown;
  const drain = async () => {
    while (pending.size || (!closing && waiting.length)) {
      if (pending.size) await Promise.allSettled([...pending]);
      else await new Promise(resolve => setImmediate(resolve));
    }
  };
  const pump = () => {
    pumpScheduled = false;
    while (!closing && pending.size < maxConcurrentJobs && waiting.length) {
      const work=waiting.shift(),{projectId,jobId,key}=work;
      const task = (work.kind==='final-project-step'?executor.prepareFinalReview(work):executor.execute(projectId,jobId)).then(async outcome=>{
        if(work.kind==='final-project-step'){inspectedFinal.set(projectId,outcome.lastInspection?.settledProgressIdentity??work.observedProgressIdentity);return;}
        if(!closing)scheduleFinal(projectId);
        if(!closing&&ACQUISITION_PURPOSES.includes(store.read(projectId).jobs.find(j=>j.id===jobId)?.purpose)){for(const id of (await executor.advanceResearch(projectId)).queuedJobIds)schedule(projectId,id);return;}
        if(!closing&&store.read(projectId).jobs.find(j=>j.id===jobId)?.purpose==='layout_export'){for(const id of (await executor.advanceLayout(projectId)).queuedJobIds)schedule(projectId,id);scheduleFinal(projectId);return;}
        if(!closing&&CONTENT_PURPOSES.includes(store.read(projectId).jobs.find(j=>j.id===jobId)?.purpose)){for(const id of (await executor.advanceContent(projectId)).queuedJobIds)schedule(projectId,id);for(const id of (await executor.advanceLayout(projectId)).queuedJobIds)schedule(projectId,id);scheduleFinal(projectId);return;}
        if(!closing&&FINAL_VISUAL_PURPOSES.includes(store.read(projectId).jobs.find(j=>j.id===jobId)?.purpose)){for(const id of (await executor.advanceFinalVisual(projectId)).queuedJobIds)schedule(projectId,id);for(const id of (await executor.advanceContent(projectId)).queuedJobIds)schedule(projectId,id);for(const id of (await executor.advanceLayout(projectId)).queuedJobIds)schedule(projectId,id);scheduleFinal(projectId);return;}
        if(!closing){try{for(const id of executor.advanceCreativePanels(projectId))schedule(projectId,id);for(const id of await executor.advanceOwnerEdges(projectId))schedule(projectId,id);for(const id of await executor.advanceReferences(projectId))schedule(projectId,id);for(const id of (await executor.advanceSketch(projectId)).queuedJobIds)schedule(projectId,id);for(const id of (await executor.advanceSketchReview(projectId)).queuedJobIds)schedule(projectId,id);for(const id of (await executor.advanceFinalVisual(projectId)).queuedJobIds)schedule(projectId,id);}catch(error){server.emit('executionError',error,{projectId,jobId});}}
      },error=>{if(work.kind==='final-project-step')inspectedFinal.set(projectId,work.observedProgressIdentity);server.emit('executionError',error,{projectId,jobId});}).finally(()=>{pending.delete(task);scheduled.delete(key);if(work.kind==='final-project-step'&&!closing)scheduleFinal(projectId);requestPump();});
      pending.add(task);
    }
  };
  const requestPump = () => {
    if (closing || pumpScheduled || !waiting.length) return;
    pumpScheduled = true;
    setImmediate(pump);
  };
  const schedule = (projectId, jobId) => {
    const key = JSON.stringify([projectId, jobId]);
    if (closing || scheduled.has(key)) return;
    scheduled.add(key);
    waiting.push({kind:'ordinary-job',projectId, jobId, key});
    requestPump();
  };
  const scheduleFinal = projectId => {
    if(closing)return;
    executor.ensureImplicitFinalReview(projectId);
    for(const work of executor.finalReviewPendingWork(projectId)){
      const key=finalPreparationQueueKey(work);
      if(!shouldQueueFinalPreparation(work,scheduled,inspectedFinal.get(projectId)))continue;
      scheduled.add(key);waiting.push({...work,key});requestPump();
    }
  };
  const finishClose = () => {
    closing = true;
    shutdown ??= Promise.all([drain(),assistant.close(),(async () => {
      while (requests.size) await Promise.allSettled([...requests]);
    })()]).then(() => {store.close();});
    return shutdown;
  };
  const handleRequest = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (closing) throw new HttpError(503, 'SERVER_CLOSING', 'Workbench is shutting down');
      const activePort = server.address()?.port ?? port;
      const hosts = [`127.0.0.1:${activePort}`, `localhost:${activePort}`];
      if (!hosts.includes(req.headers.host)) throw new HttpError(403, 'INVALID_HOST', 'Use the local workbench address');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.origin !== `http://${req.headers.host}`) throw new HttpError(403, 'INVALID_HOST', 'Request target must use the local origin');
      if (req.method !== 'GET') {
        if ((req.headers.origin && req.headers.origin !== url.origin) || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'CROSS_ORIGIN', 'Changes must come from the same local origin');
      }
      if(await handleAssistantHttp({req,res,url,assistant,jsonBody,response}))return;
      if (closing) throw new HttpError(503, 'SERVER_CLOSING', 'Workbench is shutting down');
      if(await handleFinalReviewHttp({req,res,url,executor,scheduleFinal,jsonBody,response,humanContext}))return;
      const acquisitionRoute=/^\/api\/v1\/projects\/[A-Za-z0-9-]+\/research-(?:continuations|status|cancellations)$/.test(url.pathname);
      if(!acquisitionRoute&&await handleIntakeHttp({req,res,url,store,intake:executor.intake,schedule,jsonBody,response,fields,humanContext,projectResponse:result}))return;
      const routePath=legacyEquivalentForVersionedPath(url.pathname);
      if(routePath!==url.pathname&&versionedRouteMethodSupported(url.pathname,req.method))validateVersionedQuery(url,req.method);
      if (req.method === 'GET' && url.pathname === '/' && !url.search) {
        const html = await readFile(uiPath);
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); return;
      }
      if (req.method === 'GET' && routePath === '/api/capabilities') {
        response(res, 200, {
          assistant: assistant.capability(),
          stages: Object.keys(STAGES).map(stage => {
            const binding = bindings[stage], provider = binding && providers[binding.providerId];
            const available = ['research', 'strategy', 'copy'].includes(stage) && !!provider && provider.model === binding.model;
            const configured = available || !!({references: referenceConfiguration, sketch: sketchConfiguration, visual: finalVisualConfiguration, content_review: contentConfiguration, layout: layoutConfiguration}[stage]);
            return {stage, configured, available, invocationSupported: available, ...(binding ? {binding} : {}), reason: available ? '已配置文本调用；认证和实际调用结果以运行记录为准。调研仅处理提交的来源摘录。' : configured ? '模块配置已加载；具体调用能力、人工节点、原始评审和待解决限制以模块状态为准。' : stage === 'final_review' ? '最终交付审核执行尚未完成接入。' : '此阶段尚未配置可用的执行提供方。'};
          }),
          continuation: {supportedEdges: ['research:strategy','strategy:copy','copy:references','references:sketch','sketch:visual','visual:content_review','content_review:layout'], available: !!bindings.strategy && providers[bindings.strategy.providerId]?.model === bindings.strategy.model, reason: '各模块分别检查已确认输入、实际配置、人工节点和原始评审；最终交付审核尚未完成接入。'},
          ownerEdge: {available:!!bindings.copy&&providers[bindings.copy.providerId]?.model===bindings.copy.model,supportedEdges:['strategy-to-copy']},
          handoff: {available: !!bindings.strategy && providers[bindings.strategy.providerId]?.model === bindings.strategy.model, reason: '研究与策略负责人分别读取同版内容签收，不自动放行。'},
          readiness: {available: !!bindings.readiness && providers[bindings.readiness.providerId]?.model === bindings.readiness.model, reason: '独立研究适用性审查，不能代替来源核验或负责人交接。'},
          references: executor.referenceCapability(),
          creativePanels: {supportedStages:['strategy','copy'],calibration:'trusted runtime configuration only; uncalibrated by default',simulationLabel:'Independent model judgment, not real clients or consumers'},
          correction: {protocol:'typed-revision-v2', reportKinds:CORRECTION_REPORT_KINDS, reviewAvailable:!!(bindings.correction_review??bindings.feedback_review) && providers[(bindings.correction_review??bindings.feedback_review).providerId]?.model === (bindings.correction_review??bindings.feedback_review).model},
          feedback: {supportedStages:['research','strategy','copy'], reviewAvailable:!!bindings.feedback_review && providers[bindings.feedback_review.providerId]?.model === bindings.feedback_review.model, reason:'人类意见触发真实改稿与独立落实检查；不替代审美评分、事实核验或人工采用。'},
          verification: {available: !!bindings.verification && providers[bindings.verification.providerId]?.model === bindings.verification.model, reason: '独立摘录支持核验，不认证网站真实性，不自动放行。'},
          researchAcquisition: executor.researchAcquisition.capability(),
          sourceCapture: {available:true,reason:'采集公开 HTTPS 原文与图片引用；不认证来源真实性。'},
          caseIdentity: {available:!!bindings.case_identity && providers[bindings.case_identity.providerId]?.model === bindings.case_identity.model},
          search: {available: false, configured: referenceConfiguration?.discoveryMode==='automatic', reason: '公开检索为实验性能力；实际采集、核验和可用性以项目记录为准。'},
          imageObservationReview: {available: !!bindings.observation_review && providers[bindings.observation_review.providerId]?.model === bindings.observation_review.model},
          imageObservation: {available: !!bindings.observation && providers[bindings.observation.providerId]?.model === bindings.observation.model, reason: '对上传的 PNG/JPEG 实际图片进行独立观察；不认证来源、消费者偏好或物理性能。'},
          image: imageProvider?.capability()??{available:false},
          sketchProduction: executor.sketchCapability(),
          sketchReview: executor.sketchReviewCapability(),
          finalVisual: executor.finalVisualCapability(),
          completeContent: executor.contentCapability(),
          layout: executor.layoutCapability(),
          finalReview: {continuationSupported:true,passiveStatus:true,configured:!!finalReviewConfiguration,implementation:{businessDispatch:true,selectedHumanDecision:true,ownedPptDelivery:true},apiVersion:'v1',projectEligibilityRequired:true,executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false},
        }); return;
      }
      if (routePath === '/api/projects' && req.method === 'GET') {
        response(res, 200, {projects: store.list().map(({id}) => { const p = store.read(id); return {id, name: p.name, revision: p.revision}; })}); return;
      }
      if (routePath === '/api/projects' && req.method === 'POST') {
        const body = await jsonBody(req);
        fields(body, ['name', 'brief', 'mode', 'humanGates', 'authorizedThrough', 'commandId']);
        string(body, 'name'); string(body, 'brief'); string(body, 'commandId', false); policy(body);
        const id = body.commandId ? `project-${createHash('sha256').update(body.commandId).digest('hex')}` : randomUUID();
        const input = {id, name: body.name, brief: body.brief, mode: body.mode ?? 'assisted', humanGates: body.humanGates ?? (body.mode === 'auto' ? [] : ['references']), authorizedThrough: body.authorizedThrough ?? 'final_review'};
        try { response(res, 201, await result(store.create(input, humanContext()))); }
        catch (error) {
          if (error.code !== 'PROJECT_EXISTS' || !body.commandId) throw error;
          const initial = store.read(id, 0);
          const p = initial.policies[0];
          if (initial.name !== input.name || initial.taskCards[0].brief !== input.brief || p.mode !== input.mode || p.authorizedThrough !== input.authorizedThrough || JSON.stringify(p.humanGates) !== JSON.stringify([...new Set(input.humanGates)])) throw new HttpError(409, 'COMMAND_ID_REUSED', 'Creation command ID belongs to another payload');
          response(res, 200, await result(store.read(id)));
        }
        return;
      }
      const imageMatch=/^\/api\/projects\/([A-Za-z0-9-]+)\/images(?:\/(img_[A-Za-z0-9_-]+))?$/.exec(routePath);
      if(imageMatch&&req.method==='GET'&&imageMatch[2]) {
        const project=store.read(imageMatch[1]),asset=(project.imageAssets??[]).find(item=>item.id===imageMatch[2]);
        if(!asset)throw new HttpError(404,'NOT_FOUND','Image not registered in this project');
        const {bytes}=await imageStore.read({projectId:project.id,imageId:asset.id,expectedHash:asset.sha256});
        res.writeHead(200,{'Content-Type':asset.mediaType,'Content-Length':bytes.length,'ETag':`"${asset.sha256}"`});res.end(bytes);return;
      }
      if(imageMatch&&req.method==='POST'&&!imageMatch[2]) {
        const body=await jsonBody(req,4*Math.ceil(IMAGE_LIMITS.bytes/3)+16384);
        fields(body,['base64','metadata','commandId','expectedRevision']);string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        if(typeof body.base64!=='string'||!body.base64.length||body.base64.length>4*Math.ceil(IMAGE_LIMITS.bytes/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64))invalid('Canonical bounded base64 required');
        const bytes=Buffer.from(body.base64,'base64');
        if(bytes.length>IMAGE_LIMITS.bytes||bytes.toString('base64')!==body.base64)invalid('Invalid image bytes');
        const project=store.read(imageMatch[1]);
        const uploadRequest={sha256:createHash('sha256').update(bytes).digest('hex'),metadata:body.metadata,expectedRevision:body.expectedRevision};
        const prior=Object.hasOwn(project.processedCommands,body.commandId)?project.processedCommands[body.commandId]:undefined;
        if(prior){
          const saved=JSON.parse(prior);
          if(saved.kind!=='register-image'||!isDeepStrictEqual(saved.uploadRequest,uploadRequest))throw new HttpError(409,'COMMAND_ID_REUSED','Upload command ID reused');
          response(res,200,{asset:saved.asset,...await result(project)});return;
        }
        if(project.revision!==body.expectedRevision)throw new HttpError(409,'REVISION_CONFLICT','Project revision changed');
        let asset;
        try{asset=await imageStore.ingest({projectId:project.id,bytes,metadata:body.metadata});}
        catch(error){throw new HttpError(422,'INVALID_IMAGE',error.message);}
        const updated=store.command(project.id,{kind:'register-image',asset,uploadRequest,commandId:body.commandId,expectedRevision:body.expectedRevision},
          {...humanContext(),actorType:'agent',actorId:'image-ingestion'});
        response(res,201,{asset,...await result(updated)});return;
      }
      const contentMatch=/^\/api\/projects\/([A-Za-z0-9-]+)\/artifacts\/([A-Za-z0-9-]+)\/content$/.exec(routePath);
      if(contentMatch&&req.method==='GET') {
        response(res,200,await readArtifactContent(store.read(contentMatch[1]),contentMatch[2],rootDir));return;
      }
      const match = /^\/api\/projects\/([A-Za-z0-9-]+)(\/sources(?:\/[A-Za-z0-9-]+\/content)?|\/commands|\/jobs|\/verifications|\/reconciliations|\/readiness-resolutions|\/readiness|\/handoffs|\/research-handoffs|\/research-release|\/research-continuations|\/research-status|\/research-cancellations|\/continuations|\/observations|\/observation-reviews|\/source-captures|\/case-identities|\/feedback|\/revisions|\/feedback-reviews|\/correction-reviews|\/creative-panels|\/strategy-continuations|\/copy-continuations|\/reference-materials|\/reference-actions|\/reference-choices|\/sketch-continuations|\/sketch-review-input|\/sketch-review-continuations|\/final-visual-continuations|\/content-continuations|\/content-revisions|\/content-status|\/content-draft|\/layout-continuations|\/layout-revisions|\/layout-status|\/layout-semantic-plans|\/final-review-continuations|\/final-review-status)?$/.exec(routePath);
      if (match && !match[2] && req.method === 'GET') {
        const revision = url.searchParams.get('revision');
        if ([...url.searchParams.keys()].some(key => key !== 'revision') || url.searchParams.getAll('revision').length > 1 || (revision !== null && (!/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision))))) invalid('revision must be a nonnegative integer');
        response(res, 200, await result(store.read(match[1], revision === null ? undefined : Number(revision)),{historical:revision!==null})); return;
      }
      if(match?.[2]==='/final-review-status'&&req.method==='GET'){
        if(url.search)invalid('Final status does not accept query fields');
        response(res,200,executor.finalReviewStatus(match[1]));return;
      }
      if(match?.[2]==='/final-review-continuations'&&req.method==='POST'){
        if(url.search)invalid('Final continuation does not accept query fields');
        const body=await jsonBody(req);fields(body,['commandId','expectedRevision','layoutRootJobId']);
        const status=executor.continueFinalReview(match[1],body);scheduleFinal(match[1]);response(res,202,status);return;
      }
      if(match?.[2]==='/layout-semantic-plans'&&req.method==='GET'){response(res,200,await executor.layoutSemanticPlans(match[1]));return;}
      if(match?.[2]==='/layout-status'&&req.method==='GET'){response(res,200,await executor.layoutStatus(match[1]));return;}
      if(['/layout-continuations','/layout-revisions'].includes(match?.[2])&&req.method==='POST'){
        const body=await jsonBody(req);fields(body,['commandId','expectedRevision']);string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command identity and revision required');
        const continuation=await (match[2]==='/layout-revisions'?executor.reviseLayout:executor.continueLayout)(match[1],body);
        for(const id of continuation.queuedJobIds)schedule(match[1],id);
        response(res,202,{continuation,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/content-status'&&req.method==='GET'){response(res,200,executor.contentStatus(match[1]));return;}
      if(match?.[2]==='/content-draft'&&req.method==='GET'){response(res,200,await executor.contentDraft(match[1]));return;}
      if(['/content-continuations','/content-revisions'].includes(match?.[2])&&req.method==='POST'){
        const body=await jsonBody(req);fields(body,['commandId','expectedRevision']);string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command identity and revision required');
        const continuation=await (match[2]==='/content-revisions'?executor.reviseContent:executor.continueContent)(match[1],body);for(const id of continuation.queuedJobIds)schedule(match[1],id);response(res,202,{continuation,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/final-visual-continuations'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['commandId','expectedRevision']);string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        const continuation=await executor.continueFinalVisual(match[1],body);for(const id of continuation.queuedJobIds)schedule(match[1],id);response(res,202,{continuation,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/sketch-review-continuations'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['commandId','expectedRevision']);string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command identity and revision required');
        const continuation=await executor.continueSketchReview(match[1],body);for(const id of continuation.queuedJobIds)schedule(match[1],id);response(res,202,{continuation,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/sketch-continuations'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['commandId','expectedRevision']);string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command identity and revision required');
        const continuation=await executor.continueSketch(match[1],body);
        for(const id of continuation.queuedJobIds)schedule(match[1],id);
        response(res,202,{continuation,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/sketch-review-input'&&req.method==='GET') {
        if([...url.searchParams.keys()].some(k=>k!=='generationId')||url.searchParams.getAll('generationId').length!==1)invalid('Exact generation required');
        response(res,200,await executor.sketchReviewInput(match[1],url.searchParams.get('generationId')));return;
      }
      if(match?.[2]==='/copy-continuations'&&req.method==='POST'){
        const body=await jsonBody(req);fields(body,['artifactId','discoveryMode','commandId','expectedRevision']);string(body,'artifactId');string(body,'commandId');
        if(!Number.isInteger(body.expectedRevision)||body.discoveryMode!==undefined&&!['automatic','manual_supplied'].includes(body.discoveryMode))invalid('Valid revision and discovery mode required');
        const continuation=await executor.continueCopy(match[1],body);for(const id of await executor.advanceReferences(match[1]))schedule(match[1],id);
        response(res,202,{continuation,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/reference-materials'&&req.method==='POST'){
        const body=await jsonBody(req);string(body,'action');string(body,'commandId');if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid revision required');
        if(body.action==='attach'){fields(body,['action','artifactId','directionId','imageId','kind','applicabilityProfile','borrowingNote','commandId','expectedRevision']);for(const key of ['artifactId','directionId','imageId','kind','applicabilityProfile','borrowingNote'])string(body,key);const {action,...request}=body;await executor.submitReferenceMaterial(match[1],request,humanContext());}
        else if(body.action==='remove'){fields(body,['action','materialId','reason','commandId','expectedRevision']);string(body,'materialId');string(body,'reason');store.command(match[1],{kind:'remove-reference-material',materialId:body.materialId,reason:body.reason,commandId:body.commandId,expectedRevision:body.expectedRevision},humanContext());}
        else invalid('Unknown manual material action');
        response(res,200,await result(store.read(match[1])));return;
      }
      if(match?.[2]==='/reference-choices'&&req.method==='POST'){
        const body=await jsonBody(req);
        fields(body,body?.action==='propose'?['action','dossierId','catalogHash','selection','reason','commandId','expectedRevision']:['action','dossierId','editionHash','reason','commandId','expectedRevision']);
        for(const key of ['action','dossierId','reason','commandId'])string(body,key);
        if(!['propose','adopt'].includes(body.action)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Exact choice action and revision required');
        if(body.action==='propose'){string(body,'catalogHash');if(!Array.isArray(body.selection))invalid('Exact selected catalog uses required');}else string(body,'editionHash');
        const choice=await executor.chooseReferences(match[1],body,humanContext());
        for(const id of await executor.advanceReferences(match[1]))schedule(match[1],id);
        response(res,200,{choice,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/reference-actions'&&req.method==='POST'){
        const body=await jsonBody(req);fields(body,['action','dossierId','selectionHash','reason','commandId','expectedRevision',...(body?.action==='return-to-owner'?['packetId','occurrenceIds']:[])]);string(body,'action');string(body,'dossierId');string(body,'commandId');
        if(!Number.isInteger(body.expectedRevision))invalid('expectedRevision required');
        if(!['pause','resume','adopt','revise','return-to-owner'].includes(body.action))invalid('Unknown reference action');
        if(body.action==='return-to-owner'){
          for(const key of ['selectionHash','packetId','reason'])string(body,key);
          if(!Array.isArray(body.occurrenceIds)||!body.occurrenceIds.every(id=>typeof id==='string'&&id.length>0))invalid('Exact original occurrence IDs required');
          const job=await executor.returnReferenceUncertainty(match[1],body,humanContext());schedule(match[1],job.id);
          response(res,202,{jobId:job.id,...await result(store.read(match[1]))});return;
        }
        if(body.action==='revise'){for(const id of await executor.reviseReferences(match[1],{dossierId:body.dossierId,commandId:body.commandId,expectedRevision:body.expectedRevision}))schedule(match[1],id);response(res,202,await result(store.read(match[1])));return;}
        const command={kind:body.action==='adopt'?'adopt-reference-selection':'set-reference-pause',dossierId:body.dossierId,commandId:body.commandId,expectedRevision:body.expectedRevision};
        if(body.action==='adopt'){string(body,'selectionHash');string(body,'reason');Object.assign(command,{selectionHash:body.selectionHash,reason:body.reason});}else command.paused=body.action==='pause';
        if(body.action==='adopt')await executor.adoptReferences(match[1],command,humanContext());else store.command(match[1],command,humanContext());for(const id of await executor.advanceReferences(match[1]))schedule(match[1],id);
        response(res,200,await result(store.read(match[1])));return;
      }
      if(match?.[2]==='/strategy-continuations'&&req.method==='POST'){
        const body=await jsonBody(req);fields(body,['artifactId','commandId','expectedRevision']);for(const key of ['artifactId','commandId'])string(body,key);
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        const continuation=await executor.continueStrategy(match[1],body);for(const id of await executor.advanceOwnerEdges(match[1]))schedule(match[1],id);
        response(res,202,{continuation,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/creative-panels'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['artifactId','commandId','expectedRevision']);for(const key of ['artifactId','commandId'])string(body,key);
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        const panelId=await executor.enqueueCreativePanel(match[1],body);
        for(const id of executor.advanceCreativePanels(match[1]))schedule(match[1],id);
        response(res,202,{panelId,...await result(store.read(match[1]))});return;
      }
      if(['/source-captures','/case-identities'].includes(match?.[2])&&req.method==='POST') {
        const body=await jsonBody(req),capture=match[2]==='/source-captures';
        fields(body,capture?['url','commandId','expectedRevision']:['captureId','sourceImageUrl','referenceImageId','commandId','expectedRevision']);
        for(const key of capture?['url','commandId']:['captureId','sourceImageUrl','referenceImageId','commandId'])string(body,key);
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        if(capture){let target;try{target=new URL(body.url);}catch{invalid('Public HTTPS URL required');}if(target.protocol!=='https:'||target.username||target.password||body.url.length>4000)invalid('Public HTTPS URL required');}
        const jobId=capture?executor.enqueueSourceCapture(match[1],body):await executor.enqueueCaseIdentity(match[1],body);
        const project=store.read(match[1]);if(project.jobs.find(job=>job.id===jobId)?.status==='queued')schedule(match[1],jobId);
        response(res,202,{jobId,...await result(project)});return;
      }
      if(match?.[2]==='/observation-reviews'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['observationId','commandId','expectedRevision']);string(body,'observationId');string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        const jobId=await executor.enqueueObservationReview(match[1],body);
        const project=store.read(match[1]);if(project.jobs.find(job=>job.id===jobId)?.status==='queued')schedule(match[1],jobId);
        response(res,202,{jobId,...await result(project)});return;
      }
      if(match?.[2]==='/observations'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['imageIds','commandId','expectedRevision']);string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        if(!Array.isArray(body.imageIds)||body.imageIds.length<1||body.imageIds.length>IMAGE_LIMITS.count||new Set(body.imageIds).size!==body.imageIds.length||body.imageIds.some(id=>typeof id!=='string'||!/^img_[A-Za-z0-9_-]{1,96}$/.test(id)))invalid('Select one to four unique registered images');
        const jobId=await executor.enqueueObservation(match[1],body);
        const project=store.read(match[1]);if(project.jobs.find(job=>job.id===jobId)?.status==='queued')schedule(match[1],jobId);
        response(res,202,{jobId,...await result(project)});return;
      }
      if(['/research-handoffs','/research-release'].includes(match?.[2])&&req.method==='POST') {
        if(url.search)invalid('Research workflow commands do not accept query fields');
        const body=await jsonBody(req),declaration=match[2]==='/research-handoffs';
        fields(body,['artifactId','contentHash','basisHash','commandId','expectedRevision',...(declaration?['input']:['policyVersion'])]);
        for(const key of ['artifactId','contentHash','basisHash','commandId'])string(body,key);
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||!/^[a-f0-9]{64}$/.test(body.contentHash)||!/^[a-f0-9]{64}$/.test(body.basisHash))invalid('Valid command ID, exact target hash and revision required');
        if(declaration){fields(body.input,['side','decision','permittedUses','prohibitedInferences','unresolvedIssues','note']);}
        else if(!Number.isSafeInteger(body.policyVersion)||body.policyVersion<1)invalid('Valid policy version required');
        const receipt=declaration?await executor.recordResearchHandoff(match[1],body,humanContext()):await executor.releaseResearch(match[1],body,humanContext());
        const project=store.read(match[1]);if(receipt.jobId&&project.jobs.find(j=>j.id===receipt.jobId)?.status==='queued')schedule(match[1],receipt.jobId);
        response(res,200,{receipt,...await result(project)});return;
      }
      if(match?.[2]==='/research-cancellations'&&req.method==='POST'){const body=await jsonBody(req);fields(body,['generationId','commandId','expectedRevision','reason']);response(res,200,executor.researchAcquisition.cancel(match[1],body,humanContext()));return;}
      if(match?.[2]==='/research-status'&&req.method==='GET'){response(res,200,executor.researchStatus(match[1]));return;}
      if(match?.[2]==='/research-continuations'&&req.method==='POST'){
        const body=await jsonBody(req);fields(body,['protocolVersion','commandId','expectedRevision','sourceEntryIds','materialIds']);
        const continuation=await executor.continueResearch(match[1],body);for(const id of continuation.queuedJobIds)schedule(match[1],id);
        response(res,202,{continuation,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/continuations'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['artifactId','policyVersion','commandId','expectedRevision']);
        string(body,'artifactId');string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||!Number.isSafeInteger(body.policyVersion)||body.policyVersion<1)invalid('Valid command ID, policy version and revision required');
        const jobId=executor.continueResearch(match[1],body);
        const project=store.read(match[1]);if(project.jobs.find(job=>job.id===jobId)?.status==='queued')schedule(match[1],jobId);
        response(res,202,{jobId,...await result(project)});return;
      }
      if(match?.[2]==='/reconciliations'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['jobId','commandId','expectedRevision','reason']);
        for(const key of ['jobId','commandId','reason'])string(body,key);
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        const job=await executor.reconcile(match[1],body.jobId,body);
        response(res,200,{jobId:job.id,...await result(store.read(match[1]))});return;
      }
      if(match?.[2]==='/handoffs'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['artifactId','side','commandId','expectedRevision','protocolVersion']);
        string(body,'artifactId');string(body,'commandId');
        if(!['producer','consumer'].includes(body.side)||body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid side, command ID and revision required');
        const jobId=await executor.enqueueHandoff(match[1],body.artifactId,body.side,{commandId:body.commandId,expectedRevision:body.expectedRevision,...(body.protocolVersion?{protocolVersion:body.protocolVersion}:{})});
        const project=store.read(match[1]);if(project.jobs.find(job=>job.id===jobId)?.status==='queued')schedule(match[1],jobId);
        response(res,202,{jobId,...await result(project)});return;
      }
      if(match?.[2]==='/readiness-resolutions'&&req.method==='GET'){
        if([...url.searchParams.keys()].some(k=>!['jobId','attemptId'].includes(k))||['jobId','attemptId'].some(k=>url.searchParams.getAll(k).length!==1||!url.searchParams.get(k)))invalid('Exact job and attempt required');
        response(res,200,await executor.readinessResolutionView(match[1],url.searchParams.get('jobId'),url.searchParams.get('attemptId')));return;
      }
      if(match?.[2]==='/readiness-resolutions'&&req.method==='POST'){
        const body=await jsonBody(req);fields(body,['action','jobId','attemptId','commandId','expectedRevision',...(body.action==='authorize-one-replacement'?['proposalId','acknowledgement']:[])]);
        for(const key of ['action','jobId','attemptId','commandId'])string(body,key);
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||!['recover-saved','authorize-one-replacement'].includes(body.action))invalid('Valid resolution command and revision required');
        if(body.action==='authorize-one-replacement'){string(body,'proposalId');if(body.acknowledgement!==true)invalid('Explicit duplicate-charge acknowledgment required');}
        const resolution=await executor.resolveReadiness(match[1],body,body.action==='authorize-one-replacement'?humanContext():undefined);
        const project=store.read(match[1]);if(resolution.jobId&&project.jobs.find(j=>j.id===resolution.jobId)?.status==='queued')schedule(match[1],resolution.jobId);
        response(res,200,{resolution,...await result(project)});return;
      }
      if(match?.[2]==='/readiness'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['artifactId','commandId','expectedRevision','protocolVersion']);
        string(body,'artifactId');string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        const jobId=await executor.enqueueReadiness(match[1],body.artifactId,{commandId:body.commandId,expectedRevision:body.expectedRevision,...(body.protocolVersion?{protocolVersion:body.protocolVersion}:{})});
        const project=store.read(match[1]);if(project.jobs.find(job=>job.id===jobId)?.status==='queued')schedule(match[1],jobId);
        response(res,202,{jobId,...await result(project)});return;
      }
      if(match?.[2]==='/feedback'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['artifactId','feedbackId','instructions','themes','materials','commandId','expectedRevision']);
        for(const key of ['artifactId','feedbackId','commandId'])string(body,key);
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        response(res,200,await result(store.command(match[1],{...body,kind:'submit-feedback'},humanContext())));return;
      }
      if(['/revisions','/feedback-reviews','/correction-reviews'].includes(match?.[2])&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['artifactId','commandId','expectedRevision',...(match[2]==='/revisions'?['supplementalSourceRecords']:match[2]==='/correction-reviews'?['protocolVersion']:[])]);
        string(body,'artifactId');string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        const jobId=match[2]==='/revisions'?await executor.enqueueRevision(match[1],body):match[2]==='/correction-reviews'?await executor.enqueueCorrectionReview(match[1],body):await executor.enqueueFeedbackReview(match[1],body);
        const project=store.read(match[1]);if(project.jobs.find(job=>job.id===jobId)?.status==='queued')schedule(match[1],jobId);
        response(res,202,{jobId,...await result(project)});return;
      }
      if(match?.[2]==='/verifications'&&req.method==='POST') {
        const body=await jsonBody(req);fields(body,['artifactId','commandId','expectedRevision']);
        string(body,'artifactId');string(body,'commandId');
        if(body.commandId==='__proto__'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)invalid('Valid command ID and revision required');
        const jobId=await executor.enqueueVerification(match[1],body.artifactId,{commandId:body.commandId,expectedRevision:body.expectedRevision});
        const project=store.read(match[1]);if(project.jobs.find(job=>job.id===jobId)?.status==='queued')schedule(match[1],jobId);
        response(res,202,{jobId,...await result(project)});return;
      }
      if (match?.[2] === '/sources' && req.method === 'POST') {
        const body = await jsonBody(req);
        fields(body, ['title','publisher','url','excerpt','intendedUse','attachToClaimId','commandId','expectedRevision']);
        string(body, 'commandId');
        if (body.commandId === '__proto__' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) invalid('Valid command ID and revision required');
        const {commandId, expectedRevision, ...source} = body;
        const project = store.command(match[1], {kind:'register-research-source', source, commandId, expectedRevision}, humanContext());
        const sourceId = project.sourceEntries.find(entry => entry.id === `source-${createHash('sha256').update(JSON.stringify([match[1],commandId])).digest('hex')}`).id;
        response(res, 200, {sourceId,...await result(project)}); return;
      }
      const sourceContent = /^\/sources\/([^/]+)\/content$/.exec(match?.[2] ?? '');
      if (sourceContent && req.method === 'GET') {
        const entry = (store.read(match[1]).sourceEntries ?? []).find(item => item.id === decodeURIComponent(sourceContent[1]));
        if (!entry) throw new HttpError(404, 'NOT_FOUND', 'Source not found');
        res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}); res.end(entry.excerpt); return;
      }
      if (match?.[2] === '/jobs' && req.method === 'POST') {
        const body = await jsonBody(req);
                fields(body, ['stage', 'commandId', 'expectedRevision', 'sourceRecords', 'sourceEntryIds']);
        string(body, 'commandId');
        if (body.commandId === '__proto__') invalid('Reserved commandId');
        if (!['research', 'strategy', 'copy'].includes(body.stage)) invalid('Only research, strategy and copy text execution is supported');
        if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) invalid('expectedRevision must be a nonnegative integer');
        if (body.sourceEntryIds !== undefined && (body.stage !== 'research' || body.sourceRecords !== undefined)) invalid('Registered source selection is research-only and cannot be mixed with supplied records');
        let sourceRecords;
        if (body.sourceEntryIds !== undefined) {
          const project = store.read(match[1]);
          const prior = project.jobs.find(job => job.task?.request?.commandId === body.commandId)?.task.request;
          if (prior) {
            if (prior.stage !== body.stage || prior.expectedRevision !== body.expectedRevision || !isDeepStrictEqual(prior.sourceEntryIds, body.sourceEntryIds)) throw new HttpError(409, 'COMMAND_ID_REUSED', 'Execution command ID belongs to another payload');
            sourceRecords = prior.sourceRecords;
          } else sourceRecords = registeredSources(project, body.sourceEntryIds, `http://127.0.0.1:${server.address()?.port ?? port}`);
        } else sourceRecords = normalizeSources(body.sourceRecords ?? []);
        const jobId = executor.enqueue(match[1], body.stage, {sourceRecords, ...(body.sourceEntryIds === undefined ? {} : {sourceEntryIds: body.sourceEntryIds}), commandId: body.commandId, expectedRevision: body.expectedRevision});
        const project = store.read(match[1]);
        if (project.jobs.find(job => job.id === jobId)?.status==='queued') schedule(match[1], jobId);
        response(res, 202, {jobId, ...await result(project)}); return;
      }
      if (match?.[2] === '/commands' && req.method === 'POST') {
        const body = await jsonBody(req);
        if (!body || !Object.hasOwn(commandFields, body.kind)) throw new HttpError(403, 'COMMAND_FORBIDDEN', 'Only supported human decisions are accepted; provider execution and review records cannot be submitted');
        fields(body, ['kind', 'commandId', 'expectedRevision', ...commandFields[body.kind]]);
        string(body, 'commandId');
        if (body.commandId === '__proto__') invalid('Reserved commandId');
        if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) invalid('expectedRevision must be a nonnegative integer');
        if (body.kind === 'set-policy') { string(body, 'mode'); policy(body); }
        else for (const key of commandFields[body.kind]) string(body, key);
        if(['adopt-creative','authorize-visual'].includes(body.kind)) {
          const artifact=store.read(match[1]).artifacts.find(a=>a.id===(body.artifactId??body.sketchArtifactId));
          if(artifact?.provenance==='reviewed_sketch_generation')await executor.verifyReviewedSketch(match[1],artifact);
        }
        if(body.kind==='adopt-complete-content')await executor.contentDraft(match[1]);
        if(body.kind==='adopt-final-visual')await executor.verifyFinalVisual(match[1],store.read(match[1]).artifacts.find(a=>a.id===body.artifactId));
        if(body.kind==='release-stage'){const project=store.read(match[1]),artifact=project.artifacts.find(a=>a.id===body.artifactId),producer=project.jobs.find(j=>j.outputVersionIds?.includes(artifact?.id));if(producer?.task.researchDataBasis?.acquisition)await executor.researchAcquisition.verifyProducer(match[1],producer.task.researchDataBasis.acquisition);}
        await executor.verifyOrdinaryOriginals(match[1]);
        store.command(match[1], body, humanContext());scheduleFinal(match[1]);if(body.kind==='adopt-complete-content'){for(const id of (await executor.advanceContent(match[1])).queuedJobIds)schedule(match[1],id);for(const id of (await executor.advanceLayout(match[1])).queuedJobIds)schedule(match[1],id);response(res,200,await result(store.read(match[1])));return;}if(body.kind==='adopt-final-visual'){for(const id of (await executor.advanceFinalVisual(match[1])).queuedJobIds)schedule(match[1],id);response(res,200,await result(store.read(match[1])));return;}for(const id of await executor.advanceOwnerEdges(match[1]))schedule(match[1],id);for(const id of await executor.advanceReferences(match[1]))schedule(match[1],id);response(res,200,await result(store.read(match[1])));return;
      }
      if (/^\/api\/v\d+(?:\/|$)/.test(url.pathname) && !url.pathname.startsWith('/api/v1/')) throw new HttpError(404, 'UNSUPPORTED_API_VERSION', 'Only /api/v1 is supported');
      throw new HttpError(404, 'NOT_FOUND', 'Route not found');
    } catch (error) {
      const status = error.status ?? ((['INVALID_RESEARCH_CHART_DATA','SOURCE_ID_CONFLICT','INVALID_CORRECTION','INVALID_REFERENCE_DOSSIER','INVALID_REFERENCE_REVIEW'].includes(error.code)||error.code?.startsWith('SOURCE_ENTRY_')||error.code?.startsWith('REFERENCE_')||error.code?.startsWith('REVIEW_')||error.code?.startsWith('FINAL_')||error.code?.startsWith('LAYOUT_')||error.code?.startsWith('CONTENT_')||error.code?.startsWith('SKETCH_')||error.code?.startsWith('IMAGE_')||error.code?.startsWith('INVALID_SKETCH')) ? 422 : error instanceof DomainError ? (error.code === 'NOT_FOUND' ? 404 : ['REVISION_CONFLICT', 'COMMAND_ID_REUSED', 'PROJECT_EXISTS'].includes(error.code) ? 409 : 422) : 500);
      response(res, status, {error: {code: error.code && status !== 500 ? error.code : 'INTERNAL_ERROR', message: status === 500 ? 'Local workbench could not complete the request' : error.message,...(status!==500&&Array.isArray(error.issues)?{issues:error.issues}:{})}});
    }
  };
  const server = http.createServer((req, res) => {
    const request = handleRequest(req, res);
    requests.add(request);
    const settled = () => {requests.delete(request);};
    request.then(settled, settled);
  });
  for(const {id} of store.list()){executor.recoverContinuations(id);executor.advanceCreativePanels(id);const recovery=Promise.all([executor.advanceOwnerEdges(id),executor.advanceReferences(id),executor.advanceSketch(id).then(s=>s.queuedJobIds),executor.advanceSketchReview(id).then(s=>s.queuedJobIds)]).then(groups=>groups.flat());pending.add(recovery);recovery.then(jobs=>{for(const jobId of jobs)schedule(id,jobId);},error=>server.emit('executionError',error,{projectId:id})).finally(()=>{pending.delete(recovery);requestPump();});}
  for(const {id} of store.list()){const recovery=executor.advanceFinalVisual(id);pending.add(recovery);recovery.then(s=>{for(const jobId of s.queuedJobIds)schedule(id,jobId);scheduleFinal(id);},error=>server.emit('executionError',error,{projectId:id})).finally(()=>{pending.delete(recovery);requestPump();});}
  for(const {id} of store.list()){const recovery=executor.advanceContent(id);pending.add(recovery);recovery.then(s=>{for(const jobId of s.queuedJobIds)schedule(id,jobId);scheduleFinal(id);},error=>server.emit('executionError',error,{projectId:id})).finally(()=>{pending.delete(recovery);requestPump();});}
  for(const {id} of store.list()){const recovery=executor.advanceLayout(id);pending.add(recovery);recovery.then(s=>{for(const jobId of s.queuedJobIds)schedule(id,jobId);scheduleFinal(id);},error=>server.emit('executionError',error,{projectId:id})).finally(()=>{pending.delete(recovery);requestPump();});}
  for(const {id} of store.list()){const recovery=executor.advanceResearch(id);pending.add(recovery);recovery.then(s=>{for(const jobId of s.queuedJobIds)schedule(id,jobId);scheduleFinal(id);},error=>server.emit('executionError',error,{projectId:id})).finally(()=>{pending.delete(recovery);requestPump();});}
  for(const {id} of store.list())scheduleFinal(id);
  for(const {id} of store.list())for(const job of store.read(id).jobs)if(job.status==='queued'&&job.binding&&!['layout','final_review'].includes(job.stage))schedule(id,job.id);
  server.drain = drain;
  server.once('close', () => {finishClose().catch(error => server.emit('executionError',error,{phase:'shutdown'}));});
  const close = server.close.bind(server);
  let closeResult;
  server.close = callback => {
    closing = true;
    assistant.drain();
    closeResult ??= new Promise(resolve => close(error => {
      finishClose().then(() => resolve(error), resolve);
    }));
    if (typeof callback === 'function') closeResult.then(error => callback(error));
    return server;
  };
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await startWorkbench({createServer,onListening:port=>console.log(`Workbench available at http://127.0.0.1:${port}`)}); }
  catch (error) { console.error(error?.code ? `Workbench startup refused (${error.code}) at ${error.pointer??'/'}` : 'Workbench startup failed.'); process.exitCode=1; }
}
