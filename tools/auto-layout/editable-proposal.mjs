import {createUserChart,hydrateEditableCharts,validateEditableChart,refreshEditableChartState,writeEditableChart,materializeEditableChartWorkbooks} from './editable-charts.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const fail = (code, status = 422) => { throw Object.assign(new Error(code), {code, status}); };
const need = (condition, code, status) => { if (!condition) fail(code, status); };
const geometry = ['x', 'y', 'w', 'h'];
const editableFields = {
  text:new Set([...geometry, 'text', 'size', 'color', 'bold', 'align', 'lineSpacing']),
  image:new Set([...geometry, 'fit', 'alt']),
  line:new Set([...geometry, 'color', 'width']),
  ellipse:new Set([...geometry, 'color', 'width', 'fill']),
  chart:new Set([...geometry, 'chartData']),
};
const provenanceFields = new Set(['id','type','sourceText','wrapBreaks','role','contentRefs','imageId','occurrenceId','centralImageIntentId']);
const json = value => JSON.parse(JSON.stringify(value));
function validatePlan(plan) {
  need(plan && Number.isFinite(plan.width) && Number.isFinite(plan.height) && plan.width > 0 && plan.height > 0 && plan.width <= 4000 && plan.height <= 4000, 'DRAFT_SIZE_INVALID');
  need(Array.isArray(plan.slides) && plan.slides.length > 0 && plan.slides.length <= 100, 'DRAFT_SLIDES_INVALID');
  const ids = new Set();
  for (const slide of plan.slides) {
    need(typeof slide.id === 'string' && slide.id.length > 0 && !ids.has(slide.id), 'DRAFT_SLIDE_ID_INVALID'); ids.add(slide.id);
    need(/^#[a-f0-9]{6}$/i.test(slide.background), 'DRAFT_BACKGROUND_INVALID');
    need(Array.isArray(slide.elements) && slide.elements.length > 0 && slide.elements.length <= 200, 'DRAFT_ELEMENTS_INVALID');
    need(slide.notes === undefined || typeof slide.notes === 'string' || (Array.isArray(slide.notes) && slide.notes.every(n => typeof n === 'string')), 'DRAFT_NOTES_INVALID');
    const elements = new Set();
    for (const element of slide.elements) {
      need(Object.hasOwn(editableFields, element.type), 'DRAFT_ELEMENT_UNSUPPORTED');
      need(Object.keys(element).every(key => editableFields[element.type].has(key) || provenanceFields.has(key) || (element.type === 'image' && key === 'assetId') || (element.type === 'chart' && ['chartRef','chartSourceId','chartSource','chartDataState','metadataOrigins','minimumLabelSize'].includes(key))), 'DRAFT_ELEMENT_FIELD_UNSUPPORTED');
      need(typeof element.id === 'string' && element.id.length > 0 && !elements.has(element.id), 'DRAFT_ELEMENT_ID_INVALID'); elements.add(element.id);
      need(['x','y','w','h'].every(k => Number.isFinite(element[k]) && element[k] >= 0) && element.x + element.w <= plan.width && element.y + element.h <= plan.height && element.w > 0 && (element.type === 'line' || element.h > 0), 'DRAFT_GEOMETRY_INVALID');
      if (element.type === 'chart') validateEditableChart(element);
      if (element.lineSpacing !== undefined) need(Number.isFinite(element.lineSpacing) && element.lineSpacing > 0 && element.lineSpacing <= 5, 'DRAFT_LINE_SPACING_INVALID');
      if (element.alt !== undefined) need(typeof element.alt === 'string' && element.alt.length <= 2000, 'DRAFT_ALT_INVALID');
      if (element.type === 'image') need(element.fit === undefined || ['contain','cover'].includes(element.fit), 'DRAFT_IMAGE_FIT_UNSUPPORTED');
      if (element.type === 'text') {
        need(typeof element.text === 'string' && element.text.trim() && element.text.length <= 20000, 'DRAFT_TEXT_INVALID');
        need(Number.isFinite(element.size) && element.size >= 8 && element.size <= 200, 'DRAFT_FONT_SIZE_INVALID');
        need(element.align === undefined || ['left','center','right'].includes(element.align), 'DRAFT_ALIGN_INVALID');
        need(element.bold === undefined || typeof element.bold === 'boolean', 'DRAFT_BOLD_INVALID');
      }
      if (element.type === 'image') need(typeof element.assetId === 'string' && element.assetId.length > 0 && !['__proto__','prototype','constructor'].includes(element.assetId), 'DRAFT_IMAGE_INVALID');
      for (const k of ['color','fill']) if (element[k] !== undefined) need(element[k] === 'none' || /^#[a-f0-9]{6}$/i.test(element[k]), 'DRAFT_COLOR_INVALID');
      if (element.width !== undefined) need(Number.isFinite(element.width) && element.width >= 0 && element.width <= 30, 'DRAFT_STROKE_INVALID');
    }
  }
  need(Buffer.byteLength(JSON.stringify(plan)) <= 8 * 1024 * 1024, 'DRAFT_TOO_LARGE');
}

export async function openEditableProposalStore({databasePath, resourceRoot}) {
  await fs.mkdir(path.dirname(databasePath), {recursive:true});
  await fs.mkdir(resourceRoot, {recursive:true});
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS editable_documents (id TEXT PRIMARY KEY, head INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS editable_revisions (id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(id, revision)); CREATE TABLE IF NOT EXISTS editable_commands (id TEXT NOT NULL, command_id TEXT NOT NULL, request_hash TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(id, command_id));');
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function read(id, revision) {
    const head = db.prepare('SELECT head FROM editable_documents WHERE id=?').get(id);
    need(head, 'DRAFT_NOT_FOUND', 404);
    const row = db.prepare('SELECT body, hash FROM editable_revisions WHERE id=? AND revision=?').get(id, revision ?? head.head);
    need(row, 'DRAFT_REVISION_NOT_FOUND', 404);
    need(digest(row.body) === row.hash, 'DRAFT_STORAGE_CHANGED', 409);
    return {...JSON.parse(row.body), documentHash:row.hash};
  }
  function insert(document) {
    const body = JSON.stringify(document), hash = digest(body);
    db.prepare('INSERT INTO editable_revisions(id, revision, body, hash) VALUES (?, ?, ?, ?)').run(document.id, document.revision, body, hash);
    return {...json(document), documentHash:hash};
  }
  async function snapshotResource(file) {
    const bytes = await fs.readFile(file);
    need(bytes.length > 0 && bytes.length <= 64 * 1024 * 1024, 'DRAFT_RESOURCE_SIZE');
    const sha256 = digest(bytes), extension = path.extname(file).toLowerCase();
    need(['.ttf','.otf','.png','.jpg','.jpeg','.webp'].includes(extension), 'DRAFT_RESOURCE_FORMAT');
    const destination = path.join(resourceRoot, sha256 + extension);
    try { await fs.writeFile(destination, bytes, {flag:'wx'}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    need(digest(await fs.readFile(destination)) === sha256, 'DRAFT_RESOURCE_CHANGED', 409);
    return {file:destination, sha256, byteLength:bytes.length};
  }
  async function create({id, plan, input, sourceBinding}) {
    need(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id), 'DRAFT_ID_INVALID');
    const frozen = structuredClone({plan, input, sourceBinding}); hydrateEditableCharts(frozen.plan,frozen.input); validatePlan(frozen.plan);
    need(frozen.sourceBinding && typeof frozen.sourceBinding === 'object' && !Array.isArray(frozen.sourceBinding), 'DRAFT_SOURCE_BINDING_REQUIRED');
    need(typeof frozen.input?.brand?.font?.family === 'string' && frozen.input.brand.font.family.trim() && Array.isArray(frozen.input.brand.font.files) && frozen.input.brand.font.files.length > 0, 'DRAFT_FONT_REQUIRED');
    const fonts = [];
    for (const font of frozen.input.brand.font.files) fonts.push(await snapshotResource(typeof font === 'string' ? font : font.file || font.path));
    const assets = {};
    for (const slide of frozen.plan.slides) for (const element of slide.elements) if (element.type === 'image' && !assets[element.assetId]) {
      const asset = frozen.input.assets?.[element.assetId]; need(asset?.file, 'DRAFT_ASSET_REQUIRED');
      assets[element.assetId] = {...asset, ...await snapshotResource(asset.file)};
    }
    const document = {schemaVersion:'editable-proposal-v1',id,revision:1,status:'draft_requires_review',finalAuthority:false,sourceBinding:frozen.sourceBinding,plan:frozen.plan,input:{brand:{font:{family:frozen.input.brand.font.family,files:fonts}},assets},createdAt:new Date().toISOString()};
    return transaction(() => {
      need(!db.prepare('SELECT id FROM editable_documents WHERE id=?').get(id), 'DRAFT_EXISTS', 409);
      db.prepare('INSERT INTO editable_documents(id,head) VALUES (?,1)').run(id);
      return insert(document);
    });
  }
  function writeRequest(commandId, expectedRevision) {
    need(typeof commandId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(commandId), 'DRAFT_COMMAND_ID_REQUIRED');
    need(Number.isSafeInteger(expectedRevision) && expectedRevision > 0, 'DRAFT_CHANGES_INVALID');
  }
  function commit(id, {commandId, expectedRevision}, requestHash, apply) {
    writeRequest(commandId, expectedRevision);
    return transaction(() => {
      const old = db.prepare('SELECT request_hash, revision FROM editable_commands WHERE id=? AND command_id=?').get(id,commandId);
      if (old) {need(old.request_hash === requestHash, 'DRAFT_COMMAND_ID_REUSED', 409); return read(id,old.revision);}
      const before = read(id); need(before.revision === expectedRevision, 'DRAFT_REVISION_CONFLICT', 409);
      const document = json(before); delete document.documentHash;
      apply(document);
      for (const slide of document.plan.slides) for (const element of slide.elements) {
        if (element.type === 'image') need(document.input.assets[element.assetId], 'DRAFT_ASSET_REQUIRED');
        refreshEditableChartState(element);
      }
      validatePlan(document.plan);
      document.revision = before.revision + 1; document.parentHash = before.documentHash;
      document.status = 'draft_requires_review'; document.finalAuthority = false; document.createdAt = new Date().toISOString();
      db.prepare('UPDATE editable_documents SET head=? WHERE id=?').run(document.revision,id);
      const result=insert(document);
      db.prepare('INSERT INTO editable_commands VALUES (?,?,?,?)').run(id,commandId,requestHash,document.revision);
      return result;
    });
  }
  const commandFields = {
    'add-chart':['kind','slideId','elementId','geometry','data'],
    'add-slide':['kind','slide','index'], 'delete-slide':['kind','slideId'],
    'duplicate-slide':['kind','slideId','newSlideId','index'], 'reorder-slides':['kind','slideIds'],
    'replace-image':['kind','slideId','elementId','assetId'],
  };
  function position(value, length) {need(Number.isSafeInteger(value) && value >= 0 && value <= length, 'DRAFT_SLIDE_INDEX_INVALID'); return value;}
  function applyChange(document, change, context) {
    need(change && typeof change === 'object' && !Array.isArray(change), 'DRAFT_CHANGE_INVALID');
    const slides = document.plan.slides;
    if (change.kind !== undefined) {
      need(Object.hasOwn(commandFields,change.kind) && Object.keys(change).every(k => commandFields[change.kind].includes(k)), 'DRAFT_CHANGE_INVALID');
      if (change.kind === 'add-chart') {
        const slide=slides.find(s=>s.id === change.slideId); need(slide, 'DRAFT_SLIDE_NOT_FOUND');
        slide.elements.push(createUserChart(change,context)); return;
      }
      if (change.kind === 'reorder-slides') {
        need(Array.isArray(change.slideIds) && change.slideIds.length === slides.length && new Set(change.slideIds).size === slides.length && change.slideIds.every(id => slides.some(s => s.id === id)), 'DRAFT_SLIDE_ORDER_INVALID');
        document.plan.slides = change.slideIds.map(id => slides.find(s => s.id === id)); return;
      }
      if (change.kind === 'add-slide') {
        need(change.slide && typeof change.slide === 'object' && !Array.isArray(change.slide) && Object.keys(change.slide).every(k => ['id','background','elements','notes'].includes(k)), 'DRAFT_SLIDE_INVALID');
        need(Array.isArray(change.slide.elements) && change.slide.elements.every(e => e?.type !== 'chart'), 'DRAFT_CHART_TYPED_INSERT_REQUIRED');
        slides.splice(position(change.index,slides.length),0,structuredClone(change.slide)); return;
      }
      const index = slides.findIndex(s => s.id === change.slideId); need(index >= 0, 'DRAFT_SLIDE_NOT_FOUND');
      if (change.kind === 'delete-slide') {need(slides.length > 1, 'DRAFT_LAST_SLIDE'); slides.splice(index,1); return;}
      if (change.kind === 'duplicate-slide') {
        need(typeof change.newSlideId === 'string' && change.newSlideId.trim() && !slides.some(s => s.id === change.newSlideId), 'DRAFT_SLIDE_ID_INVALID');
        const copy=json(slides[index]);copy.id=change.newSlideId;slides.splice(position(change.index,slides.length),0,copy);return;
      }
      const element=slides[index].elements.find(e => e.id === change.elementId);
      need(element?.type === 'image', 'DRAFT_IMAGE_NOT_FOUND');
      need(typeof change.assetId === 'string' && Object.hasOwn(document.input.assets,change.assetId), 'DRAFT_ASSET_REQUIRED');
      element.assetId=change.assetId; return;
    }
    need(Object.keys(change).every(k => ['slideId','elementId','values'].includes(k)), 'DRAFT_CHANGE_INVALID');
    const element = slides.find(s => s.id === change.slideId)?.elements.find(e => e.id === change.elementId);
    need(element, 'DRAFT_ELEMENT_NOT_FOUND');
    need(change.values && typeof change.values === 'object' && !Array.isArray(change.values) && Object.keys(change.values).length > 0, 'DRAFT_CHANGE_INVALID');
    for (const [key, value] of Object.entries(change.values)) {
      need(editableFields[element.type].has(key), 'DRAFT_FIELD_NOT_EDITABLE'); element[key] = structuredClone(value);
    }
  }
  function save(id, request) {
    need(request && typeof request === 'object' && !Array.isArray(request) && Object.keys(request).length === 3 && ['commandId','expectedRevision','changes'].every(k=>Object.hasOwn(request,k)), 'DRAFT_CHANGES_INVALID');
    const {commandId, expectedRevision, changes}=request;
    writeRequest(commandId,expectedRevision);
    need(Array.isArray(changes) && changes.length > 0 && changes.length <= 1000, 'DRAFT_CHANGES_INVALID');
    return commit(id,request,digest({expectedRevision,changes}),document => {
      for (const [changeIndex,change] of changes.entries()) applyChange(document,change,{documentId:id,commandId,changeIndex});
      document.changes=json(changes);delete document.restoredFromRevision;
    });
  }
  function history(id) {
    read(id);
    return db.prepare('SELECT revision FROM editable_revisions WHERE id=? ORDER BY revision DESC').all(id).map(row => {
      const d=read(id,row.revision);
      return {revision:d.revision,documentHash:d.documentHash,parentHash:d.parentHash??null,createdAt:d.createdAt,status:d.status,slideCount:d.plan.slides.length,restoredFromRevision:d.restoredFromRevision??null};
    });
  }
  function restore(id, request) {
    const {revision}=request;need(Number.isSafeInteger(revision) && revision > 0,'DRAFT_EXACT_REVISION_REQUIRED');
    return commit(id,request,digest({operation:'restore',expectedRevision:request.expectedRevision,revision}),document => {
      const prior=read(id,revision);
      need(JSON.stringify(prior.sourceBinding) === JSON.stringify(document.sourceBinding),'DRAFT_SOURCE_BINDING_CHANGED',409);
      document.plan=json(prior.plan);document.input=json(prior.input);document.restoredFromRevision=revision;
      document.changes=[{kind:'restore',revision}];
    });
  }
  async function importAsset(id, request) {
    const {commandId,expectedRevision,assetId,asset}=request;writeRequest(commandId,expectedRevision);
    need(typeof assetId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(assetId) && !['__proto__','prototype','constructor'].includes(assetId) && asset && typeof asset.file === 'string','DRAFT_ASSET_REQUIRED');
    need(['.png','.jpg','.jpeg','.webp'].includes(path.extname(asset.file).toLowerCase()),'DRAFT_IMAGE_FORMAT');
    const requestHash=digest({operation:'import-asset',expectedRevision,assetId,asset});
    const old=db.prepare('SELECT request_hash, revision FROM editable_commands WHERE id=? AND command_id=?').get(id,commandId);
    if (old) {need(old.request_hash === requestHash,'DRAFT_COMMAND_ID_REUSED',409);return read(id,old.revision);}
    const before=read(id);need(before.revision === expectedRevision,'DRAFT_REVISION_CONFLICT',409);
    need(!Object.hasOwn(before.input.assets,assetId),'DRAFT_ASSET_EXISTS',409);
    const resource={...json(asset),...await snapshotResource(asset.file)};
    return commit(id,request,requestHash,document => {
      need(!Object.hasOwn(document.input.assets,assetId),'DRAFT_ASSET_EXISTS',409);
      document.input.assets[assetId]=resource;document.changes=[{kind:'import-asset',assetId}];delete document.restoredFromRevision;
    });
  }

  function commandReceipt(id,commandId) {
    need(typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)&&typeof commandId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(commandId),'DRAFT_COMMAND_ID_REQUIRED');
    read(id);
    const row=db.prepare('SELECT request_hash, revision FROM editable_commands WHERE id=? AND command_id=?').get(id,commandId);
    const base={protocol:'editable-command-receipt-v1',id,commandId};
    if(!row)return {...base,status:'unknown'};
    need(Number.isSafeInteger(row.revision)&&row.revision>=2,'DRAFT_COMMAND_RECEIPT_CHANGED',409);
    const after=read(id,row.revision),before=read(id,row.revision-1),expectedRevision=row.revision-1;
    need(after.parentHash===before.documentHash,'DRAFT_COMMAND_RECEIPT_CHANGED',409);
    const changes=after.changes;
    need(Array.isArray(changes)&&changes.length>0&&changes.length<=1000,'DRAFT_COMMAND_RECEIPT_CHANGED',409);
    let operation,request,nativeRequest;
    if(changes.length===1&&changes[0]?.kind==='import-asset')return {...base,status:'unsupported',operation:'import-asset',revision:row.revision,documentHash:after.documentHash};
    if(changes.length===1&&changes[0]?.kind==='restore'){
      const revision=changes[0].revision;
      need(Object.keys(changes[0]).sort().join(',')==='kind,revision'&&Number.isSafeInteger(revision)&&revision>0&&revision<=expectedRevision&&after.restoredFromRevision===revision,'DRAFT_COMMAND_RECEIPT_CHANGED',409);
      read(id,revision);operation='restore';request={expectedRevision,revision};nativeRequest={operation:'restore',expectedRevision,revision};
    }else{
      need(after.restoredFromRevision===undefined,'DRAFT_COMMAND_RECEIPT_CHANGED',409);
      operation='save';request={expectedRevision,changes};nativeRequest=request;
    }
    need(digest(nativeRequest)===row.request_hash,'DRAFT_COMMAND_RECEIPT_CHANGED',409);
    const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
    const requestDigest=digest(JSON.stringify(canonical(JSON.parse(JSON.stringify(request)))));
    return {...base,status:'committed',operation,revision:row.revision,requestDigest,documentHash:after.documentHash};
  }

  return {create,read,save,history,restore,importAsset,commandReceipt,close:()=>db.close()};
}

export async function exportEditableProposal({store, id, revision, outputRoot, format = 'pptx'}) {
  need(format === 'pptx', 'DRAFT_EXPORT_FORMAT_UNSUPPORTED');
  need(Number.isSafeInteger(revision) && revision > 0, 'DRAFT_EXACT_REVISION_REQUIRED');
  const document = store.read(id, revision);
  validatePlan(document.plan);
  const resources = [...document.input.brand.font.files,...Object.values(document.input.assets)];
  const bytesByFile = new Map();
  for (const resource of resources) {
    const bytes = await fs.readFile(resource.file);
    need(bytes.length === resource.byteLength && digest(bytes) === resource.sha256, 'DRAFT_RESOURCE_CHANGED', 409);
    bytesByFile.set(resource.file,bytes);
  }
  const output = path.join(outputRoot,`${id}-r${revision}-${randomUUID()}`);
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'document.json'),JSON.stringify(document,null,2));
  try {
    const {Presentation,PresentationFile} = await import('@oai/artifact-tool');
    const {GlobalFonts} = await import('@napi-rs/canvas');
    for (const font of document.input.brand.font.files) need(GlobalFonts.register(bytesByFile.get(font.file),document.input.brand.font.family), 'DRAFT_FONT_INVALID');
    const p = Presentation.create({slideSize:{width:document.plan.width,height:document.plan.height}});
    for (const page of document.plan.slides) {
      const slide = p.slides.add(); slide.background.fill = page.background;
      slide.speakerNotes.text = [Array.isArray(page.notes) ? page.notes.join('\n\n') : page.notes || '', `UNREVIEWED WORKING DRAFT. Document ${id}, revision ${revision}, hash ${document.documentHash}. Source provenance retained in document.json. No factual or client approval. Chart data is an unverified draft; retained source snapshots do not verify edited values.`].filter(Boolean).join('\n\n');
      for (const e of page.elements) {
        const position = {left:e.x,top:e.y,width:e.w,height:e.h};
        if (e.type === 'image') {
          const asset = document.input.assets[e.assetId], bytes = bytesByFile.get(asset.file);
          const ext = path.extname(asset.file).toLowerCase(), contentType = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'})[ext];
          need(contentType,'DRAFT_IMAGE_FORMAT');
          const image = slide.images.add({blob:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),contentType,position,fit:e.fit??'contain',alt:e.alt??e.assetId}); image.name=e.id;
        } else if (e.type === 'chart') {
          writeEditableChart(slide,e,document.input.brand.font.family);
        } else {
          const shape = slide.shapes.add({geometry:e.type === 'text'?'textbox':e.type,name:e.id,position,fill:e.type==='text'?'none':e.fill||'none',line:{fill:e.type==='text'?'none':e.color||'#000000',width:e.type==='text'?0:e.width??1}});
          if (e.type==='text') {shape.text=e.text;shape.text.style={typeface:document.input.brand.font.family,fontSize:e.size,color:e.color||'#000000',bold:e.bold||false,alignment:e.align||'left',insets:0,wrap:'none',autoFit:'none',...(e.lineSpacing === undefined ? {} : {lineSpacing:e.lineSpacing})};}
        }
      }
    }
    const candidatePath=path.join(output,'draft.pptx');
    await (await PresentationFile.exportPptx(p)).save(candidatePath);
    const chartExport=await materializeEditableChartWorkbooks(candidatePath,output,document.plan);
    const deckPath=chartExport.deckPath;
    const receipt={schemaVersion:'editable-proposal-export-v1',status:'exported_draft',finalAuthority:false,id,revision,documentHash:document.documentHash,deckPath,sha256:digest(await fs.readFile(deckPath)),editableTypes:['text','image','line','ellipse','chart'],charts:chartExport.charts,chartWorkbookSnapshot:chartExport.chartWorkbookSnapshot??null,chartProof:chartExport.chartProof??null,chartHeaderLinks:chartExport.headerLinks??null,nativeKeynoteSupported:false};
    await fs.writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));
    return receipt;
  } catch (error) {
    await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({status:'failed',code:error.code??'DRAFT_EXPORT_FAILED',message:error.message}));
    throw error;
  }
}
