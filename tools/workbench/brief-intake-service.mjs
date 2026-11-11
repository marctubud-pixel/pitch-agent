import {createLocalPdfExtractor} from './intake-pdf.mjs';
import {createIntakeRuntime} from './intake-runtime.mjs';
import {cardHash} from './intake-contract.mjs';
import {digest, requireIntake as need, DOCUMENT_LIMITS} from './intake-document-store.mjs';
import {requireResearchWorkflow} from './seven-stage-workflow.mjs';
import {isDeepStrictEqual as equal} from 'node:util';

export const BRIEF_ORIGINAL_PROTOCOL = 'brief-original-v1';
const fields = ['commandId', 'expectedRevision', 'originalFilename', 'taskCardId', 'taskCardHash'];
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);

// Upload remains storage-only. Explicit local parsing claims only its selected registered PDF job.
export function createBriefIntakeService({store, rootDir, intakeConfiguration = null}) {
  need(store && typeof store.read === 'function' && typeof store.command === 'function', 'INVALID_REQUEST', 'A project store is required');
  need(typeof rootDir === 'string' && rootDir.trim(), 'INVALID_REQUEST', 'An explicit original storage root is required');
  const intake = createIntakeRuntime({store, root: rootDir, providers: {}, bindings: {}, configuration: intakeConfiguration});
  const parser = createLocalPdfExtractor(intakeConfiguration);
  let parserCapability = {available:false,configured:Boolean(intakeConfiguration),reason:'PDF_CAPABILITY_NOT_CHECKED'};
  const project = id => {const p = store.read(id); requireResearchWorkflow(p); return p;};
  const card = p => p.taskCards.find(item => item.id === p.activeTaskCardId);
  function operation(p, documentId) {
    const saved = (p.intakeOperations ?? []).find(item => item.kind === 'intake-register'
      && item.request?.bridgeProtocol === BRIEF_ORIGINAL_PROTOCOL && item.response?.documentId === documentId);
    need(saved, 'NOT_FOUND', 'Original is not registered by this project input service');
    return saved;
  }
  function metadata(p, document, saved) {
    need(document.projectId === p.id && document.origin?.kind === 'upload' && document.kind === 'pdf'
      && document.raw?.mediaType === 'application/pdf' && document.raw.sha256 === saved.request.sha256
      && document.raw.byteLength === saved.request.byteLength && document.origin.originalFilename === saved.request.originalFilename, 'DOCUMENT_CORRUPT', 'Project original identity changed');
    const binding = saved.request, active = card(p);
    return {
      id: document.id, projectId: p.id, originalFilename: document.origin.originalFilename,
      mediaType: document.raw.mediaType, sha256: document.raw.sha256, byteLength: document.raw.byteLength,
      taskCardId: binding.taskCardId, taskCardHash: binding.taskCardHash,
      metadata: binding.metadata ?? null,
      isCurrent: Boolean(active && active.id === binding.taskCardId && cardHash(active) === binding.taskCardHash),
      createdAt: document.createdAt, storage: 'original_saved',
      localExtractionStatus: document.extraction ? 'retained' : document.status,
      modelReading: 'not_verified', humanAdoption: 'not_verified',
    };
  }
  async function checked(projectId, documentId) {
    const before = project(projectId), saved = operation(before, documentId);
    const loaded = await intake.checkedDocument(projectId, documentId);
    const p = project(projectId), current = (p.intakeDocuments ?? []).find(item => item.id === documentId);
    need(current && equal(current, loaded.document) && equal(operation(p, documentId), saved), 'DOCUMENT_CORRUPT', 'Original registration changed during read');
    return {document: metadata(p, current, saved), bytes: loaded.bytes};
  }
  async function extraction(projectId, documentId) {
      const revision=project(projectId).revision;
      const original = await checked(projectId, documentId), loaded = await intake.checkedDocument(projectId, documentId);
      need(project(projectId).revision===revision,'REVISION_CONFLICT','Project changed while reading extraction');
      return {document: original.document, extraction: loaded.extraction, extractionRef: loaded.document.extraction ?? null,
        scope: 'local_pdf_extraction', modelReading:'not_verified', humanAdoption:'not_verified'};
  }
  return Object.freeze({
    capability: () => ({protocol: BRIEF_ORIGINAL_PROTOCOL, originalStorage: true,
      mediaTypes: ['application/pdf'], maxBytes: DOCUMENT_LIMITS.bytes, maxDocuments: DOCUMENT_LIMITS.documents,
      localExtractionAvailable: parserCapability.available, localExtraction: structuredClone(parserCapability), modelExtractionAvailable: false,
      imageUploadAvailable: false, imageUploadReason: 'Existing PNG/JPEG pixel validation is not configured on this restricted surface'}),
    async upload(projectId, request, bytes) {
      need(request && typeof request === 'object' && !Array.isArray(request)
        && Object.keys(request).every(key => [...fields, 'metadata'].includes(key)) && fields.every(key => Object.hasOwn(request, key)), 'INVALID_REQUEST', 'Exact original upload fields are required');
      need(validId(request.commandId) && validId(request.taskCardId) && /^[a-f0-9]{64}$/.test(request.taskCardHash)
        && Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 0,
      'INVALID_REQUEST', 'Command, revision and task identity are required');
      need(typeof request.originalFilename === 'string' && request.originalFilename.trim()
        && request.originalFilename.length <= 2000 && !/[\u0000-\u001f\u007f]/.test(request.originalFilename), 'INVALID_REQUEST', 'Bounded original filename without control characters required');
      if (request.metadata !== undefined) {
        const m = request.metadata;
        need(m && typeof m === 'object' && !Array.isArray(m) && Object.keys(m).every(key => ['lastModified', 'note', 'clientResourceId', 'declaredMediaType'].includes(key))
          && (m.lastModified === undefined || Number.isSafeInteger(m.lastModified) && m.lastModified >= 0)
          && (m.clientResourceId === undefined || typeof m.clientResourceId === 'string' && /^[\w-]{1,100}$/.test(m.clientResourceId))
          && (m.declaredMediaType === undefined || ['', 'application/pdf'].includes(m.declaredMediaType))
          && (m.note === undefined || typeof m.note === 'string' && m.note.length <= 20000), 'INVALID_REQUEST', 'Bounded optional file metadata required');
        if (m.clientResourceId !== undefined) {
          need(request.originalFilename.length <= 255 && !/[/\\]/.test(request.originalFilename)
            && request.originalFilename.toLowerCase().endsWith('.pdf') && (m.note === undefined || m.note.length <= 1000),
          'INVALID_REQUEST', 'Selected brand original requires a PDF filename of at most 255 characters and a note of at most 1000 characters');
        }
      }
      need(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= DOCUMENT_LIMITS.bytes, 'INPUT_TOO_LARGE', 'Original must be within the existing byte limit');
      const p = project(projectId), wrapped = {...request, bridgeProtocol: BRIEF_ORIGINAL_PROTOCOL};
      const prior = (p.intakeOperations ?? []).find(item => item.commandId === request.commandId);
      if (!prior) {
        need(!Object.hasOwn(p.processedCommands, request.commandId), 'COMMAND_ID_REUSED', 'Command ID is already registered');
        if (request.metadata?.clientResourceId) need(!(p.intakeOperations ?? []).some(item => item.request?.bridgeProtocol === BRIEF_ORIGINAL_PROTOCOL
          && item.request.metadata?.clientResourceId === request.metadata.clientResourceId), 'CLIENT_RESOURCE_ID_REUSED', 'This selection is already registered; replay its original command');
        need(p.revision === request.expectedRevision, 'REVISION_CONFLICT', 'Project revision changed');
        const active = card(p);
        need(active && active.id === request.taskCardId && cardHash(active) === request.taskCardHash, 'STALE_TASK_CARD', 'Exact current task card required');
        need((p.intakeDocuments ?? []).length < DOCUMENT_LIMITS.documents, 'INPUT_TOO_LARGE', 'Project document limit reached');
      } else {
        need(prior.kind === 'intake-register' && equal(prior.request, {...wrapped, sha256: digest(bytes), byteLength: bytes.length}),
          'COMMAND_ID_REUSED', 'Command ID belongs to another original upload');
      }
      need(bytes.subarray(0, 5).toString('ascii') === '%PDF-', 'INPUT_UNSUPPORTED', 'This surface currently stores PDF originals only; upload does not certify PDF parsing');
      const result = await intake.upload(projectId, wrapped, bytes);
      const loaded = await checked(projectId, result.documentId);
      need(loaded.document.sha256 === digest(bytes) && loaded.bytes.equals(bytes), 'DOCUMENT_CORRUPT', 'Retained original differs from the uploaded bytes');
      return {...result, document: loaded.document, revision: project(projectId).revision,
        receipt: {commandId: request.commandId, replayed: Boolean(prior)}};
    },
    async list(projectId) {
      const p = project(projectId), ids = (p.intakeOperations ?? []).filter(item => item.kind === 'intake-register'
        && item.request?.bridgeProtocol === BRIEF_ORIGINAL_PROTOCOL).map(item => item.response.documentId);
      const documents = [];
      for (const id of ids) documents.push((await checked(projectId, id)).document);
      need(project(projectId).revision === p.revision, 'REVISION_CONFLICT', 'Project changed while listing originals');
      return {projectId, revision: p.revision, documents};
    },
    async extractionCapability() {parserCapability = await parser.capability(); return structuredClone(parserCapability);},
    extraction,
    async extract(projectId, request, context) {
      const keys=['documentId','taskCardId','taskCardHash','commandId','expectedRevision','action'];
      need(request&&typeof request==='object'&&!Array.isArray(request)&&Object.keys(request).length===keys.length&&keys.every(k=>Object.hasOwn(request,k))
        &&validId(request.documentId)&&validId(request.commandId)&&validId(request.taskCardId)&&/^[a-f0-9]{64}$/.test(request.taskCardHash)
        &&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0&&['extract','retry_local'].includes(request.action),'INVALID_REQUEST','Exact bounded PDF extraction request required');
      let p=project(projectId);const saved=Object.hasOwn(p.processedCommands,request.commandId)?JSON.parse(p.processedCommands[request.commandId]):null;
      const registration=operation(p,request.documentId), job=p.jobs.find(j=>j.id===registration.response.jobId);
      need(job&&job.purpose==='intake_document'&&job.stage==='intake'&&job.task.kind==='pdf'&&job.documentId===request.documentId
        &&equal(job.binding,{providerId:'local-pdf',model:'pdf-extraction-v1',role:'document-parser'}),'DOCUMENT_CORRUPT','Exact registered local PDF job required');
      if(saved){
        need((saved.kind==='intake-start'&&saved.jobId===job.id&&equal(saved.request,request))
          ||(saved.kind==='intake-retry-local'&&saved.request.jobId===job.id&&equal(saved.request,{...request,jobId:job.id})),'COMMAND_ID_REUSED','Command ID belongs to another extraction request');
        if(saved.kind==='intake-retry-local'&&job.status==='queued'){
          const current=await checked(projectId,request.documentId);need(current.document.isCurrent,'STALE_TASK_CARD','Historical recovery cannot dispatch for a changed task');
          parserCapability=await parser.capability();need(parserCapability.available,'PDF_EXTRACTOR_UNAVAILABLE',parserCapability.reason??'Local parser unavailable');
          need(project(projectId).revision===p.revision,'REVISION_CONFLICT','Project changed during recovery preflight');
          await intake.execute(projectId,job.id,{localRequest:request,localAdmissionRevision:p.revision});p=project(projectId);
        }
        return {...await extraction(projectId,request.documentId),jobId:job.id,revision:p.revision,receipt:{commandId:request.commandId,replayed:true}};
      }
      need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Project changed');
      const loaded=await checked(projectId,request.documentId);
      need(loaded.document.isCurrent&&registration.request.taskCardId===request.taskCardId&&registration.request.taskCardHash===request.taskCardHash,'STALE_TASK_CARD','Only the current task original may be parsed');
      need(request.action==='extract'?job.status==='queued'&&job.attempts.length===0:['failed','blocked','awaiting_reconciliation'].includes(job.status),'LOCAL_EXTRACTION_STATE','Use the original command or explicit local recovery');
      parserCapability=await parser.capability();need(parserCapability.available,'PDF_EXTRACTOR_UNAVAILABLE',parserCapability.reason??'Local parser unavailable');
      p=project(projectId);need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Project changed during parser preflight');
      if(request.action==='retry_local'){
        need(context?.actorType==='human','HUMAN_REQUIRED','Explicit local recovery requires the actual operator');
        await intake.humanAction(projectId,'intake-retry-local',{...request,jobId:job.id},context);
        await intake.execute(projectId,job.id,{localRequest:request,localAdmissionRevision:request.expectedRevision+1});
      }else await intake.execute(projectId,job.id,{localRequest:request});
      return {...await extraction(projectId,request.documentId),jobId:job.id,revision:project(projectId).revision,receipt:{commandId:request.commandId,replayed:false}};
    },
    read: checked,
  });
}
