import {finalContentTuple,finalNumericContentBasis,finalNumericLocationValue,requireFinalNumericEdition} from './final-content-contract.mjs';
import {readNativeManifest,NATIVE_MANIFEST_LIMITS} from '../auto-layout/native-manifest.mjs';
import {validateFinalAssignments} from './final-review-assignments.mjs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash} from './sketch-authority.mjs';
import {neutralContent, contentSourceLocations} from './complete-content.mjs';
import {visibilityPointer, materialFragments, occurrenceScopes, affectedContentRelations} from './content-visibility.mjs';
import {layoutHash} from './layout-boundary.mjs';

const ROLES = ['content', 'visual', 'brand', 'user', 'communication'];
const STYLES = ['editorial', 'stage', 'evidence'];
const OWNER_KEYS = ['layoutProducer', 'finalConsumer', 'finalProducer', 'deliveryConsumer'];
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const size = value => Buffer.byteLength(JSON.stringify(value));
const positive = n => Number.isSafeInteger(n) && n > 0;
const text = s => typeof s === 'string' && s.length > 0;
const pathModuleResolve = (resourcePath, file) => path.resolve(path.dirname(resourcePath), file);
const unique = values => new Set(values).size === values.length;
const flags = {executionAvailable: false, finalAuthorityAvailable: false, deliveryAvailable: false};

function buildFinalReview(snapshot, configurationOrNull) {
  const blockers = [{code: 'EXECUTION_UNIMPLEMENTED', path: 'execution'}], errors = [];
  const invalid = (code, path) => errors.push({code, path});
  const missing = (code, path) => blockers.push({code, path});
  const finish = (kind, input = null, plan = null) => ({kind, input, plan, blockers: [...blockers, ...errors], ...flags});
  const fact = (f, path) => {
    if (f === undefined || f?.state === 'missing') {
      missing(f?.code ?? 'MISSING_FACT', path); return undefined;
    }
    if (f?.state !== 'present' || !Object.hasOwn(f, 'value')) { invalid('INVALID_FACT', path); return undefined; }
    return f.value;
  };
  const same = (a, b, path, code = 'CONTRADICTORY_FACT') => { if (!equal(a, b)) invalid(code, path); };
  const pointer = (host, p, path) => {
    try { const v = visibilityPointer(host, p); if (v === undefined) invalid('UNKNOWN_POINTER', path); return v; }
    catch { invalid('INVALID_POINTER', path); return undefined; }
  };
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) { invalid('INVALID_SNAPSHOT', 'snapshot'); return finish('invalid_basis'); }
  let input;
  try { input = structuredClone(snapshot); JSON.stringify(input); } catch { invalid('NON_DATA_SNAPSHOT', 'snapshot'); return finish('invalid_basis'); }
  if (input.schemaVersion !== 'final-review-input-v2') invalid('INVALID_SCHEMA', 'schemaVersion');
  for (const k of ['project', 'task', 'policy', 'content', 'layout', 'history']) if (!input[k] || typeof input[k] !== 'object') invalid('REQUIRED_RETAINED_RECORD', k);
  if (errors.length) return finish('invalid_basis');
  const {trusted, locations: catalog} = input.content;
  if (!trusted?.contract || !trusted.source || !catalog || !input.history.retained) { invalid('REQUIRED_RETAINED_RECORD', 'content_or_history'); return finish('invalid_basis'); }
  const {contract: c, source, manuscriptText} = trusted, m = c.manuscript, history = input.history.retained;
  let contentTuple;
  try { contentTuple=finalContentTuple(c,source); } catch { invalid('INVALID_CONTENT_VERSION','content.trusted'); return finish('invalid_basis'); }
  const numeric=contentTuple.source==='content-source-v3';
  if (!m || !source.visibility || !Array.isArray(source.images) || !Array.isArray(source.obligations)) { invalid('MALFORMED_CONTENT', 'content.trusted'); return finish('invalid_basis'); }
  for (const [path, value] of Object.entries({project: input.project.id, task: input.task.identity, policy: input.policy.identity,
    artifact: c.artifactId, root: c.rootJobId, layout: input.layout.rootJobId})) if (!text(value)) invalid('MISSING_IDENTITY', path);
  if (!Number.isSafeInteger(input.project.observedRevision) || input.project.observedRevision < 0) invalid('INVALID_REVISION', 'project');
  same(input.task.exactTask, source.task, 'task'); same(input.policy.exactPolicy, source.policy, 'policy');
  const {sourceHash, ...sourceBody} = source;
  same(sketchHash(sourceBody), sourceHash, 'content.sourceHash', 'BAD_PROTOCOL_HASH');
  same(c.sourceHash, sourceHash, 'contract.sourceHash');
  same(c.projectionHash, source.visibility.projectionHash, 'contract.projectionHash');
  const {projectionHash, ...projectionBody} = source.visibility;
  same(sketchHash(projectionBody), projectionHash, 'visibility.projectionHash', 'BAD_PROTOCOL_HASH');
  same(layoutHash(m), c.manuscriptHash, 'contract.manuscriptHash', 'BAD_PROTOCOL_HASH');
  if (!text(manuscriptText)) invalid('LITERAL_MANUSCRIPT_REQUIRED', 'content');
  else { same(layoutHash(manuscriptText), trusted.contentHash, 'contentHash', 'BAD_PROTOCOL_HASH'); same(JSON.parse(manuscriptText), m, 'manuscriptText'); }
  same(c.images, source.images, 'contract.images'); same(c.obligations, source.obligations, 'contract.obligations');
  same(c.visibility, source.visibility, 'contract.visibility');
  const rows = contentSourceLocations({id: c.rootJobId, task: {packetVersion: c.packetVersion, source}});
  same(c.sourceLocations, rows, 'contract.sourceLocations'); same(catalog.rows, rows, 'catalog.rows');
  if (catalog.version !== c.sourceLocationVersion || !Array.isArray(catalog.entries)) invalid('INVALID_CATALOG', 'content.locations');
  const expected = rows.flatMap(r => [r.derived, ...r.originals]);
  const expectedByKey = new Map(expected.map(l => [canonical(l), l])), locations = new Map();
  if (expectedByKey.size !== expected.length) invalid('DUPLICATE_EXPECTED_LOCATION', 'content');
  for (const e of catalog.entries ?? []) {
    const key = canonical(e.location), row = rows.find(r => r.originId === (e.location?.originId??e.location?.clauseId));
    if (!expectedByKey.has(key) || locations.has(key)) invalid('INVALID_CATALOG_ENTRY', key);
    if (e.value === undefined || sketchHash(e.value) !== e.location?.valueHash) invalid('BAD_PROTOCOL_HASH', key);
    same(e.ancestryAnchor, row?.ancestryAnchor, key);
    if (e.location?.kind === 'effective_source_clause') same(e.value, pointer(source, e.location.pointer, key), key);
    if(numeric&&e.location?.kind!=='original_occurrence') same(e.value,finalNumericLocationValue(source,e.location),key,'FINAL_NUMERIC_LOCATION_CHANGED');
    locations.set(key, {address: {domain: 'content_location', location: e.location}, value: e.value});
  }
  if (locations.size !== expected.length || expected.some(l => !locations.has(canonical(l)))) invalid('INCOMPLETE_CATALOG', 'content.locations');
  for (const k of ['originalReports', 'originalFindings', 'originalAttempts', 'dispositions', 'predecessorInputIds', 'hosts']) if (!Array.isArray(history[k])) invalid('HISTORY_REQUIRED', `history.${k}`);
  const completeHistory = fact(input.history.completeness, 'history.completeness');
  if (input.history.completeness?.state === 'present' && completeHistory !== true) invalid('INVALID_HISTORY_COMPLETENESS', 'history.completeness');
  const editions = fact(input.editions, 'editions');
  if (editions !== undefined && (!Array.isArray(editions) || !unique(editions.map(e => e.style)) || editions.some(e => !STYLES.includes(e.style)))) invalid('INVALID_EDITIONS', 'editions');
  const editionList = Array.isArray(editions) ? editions : [];
  for (const style of STYLES) if (!editionList.some(e => e.style === style)) missing('MISSING_EDITION', `editions.${style}`);
  const owners = {};
  for (const k of OWNER_KEYS) {
    owners[k] = fact(input.owners?.[k], `owners.${k}`);
    if (owners[k] && !['actorIdentity', 'assignmentIdentity', 'providerIdentity', 'modelIdentity'].every(p => text(owners[k][p]))) invalid('INVALID_OWNER_ASSIGNMENT', k);
  }
  for (const [a,b] of [['layoutProducer','finalConsumer'], ['finalProducer','deliveryConsumer']]) if (owners[a] && owners[b] && owners[a].actorIdentity === owners[b].actorIdentity) invalid('OWNER_HANDOFF_SELF_ACCEPTANCE', b);
  const allowance = fact(input.allowance, 'allowance'), humanFinalGate = fact(input.humanFinalGate, 'humanFinalGate');
  if (humanFinalGate) {
    if (typeof humanFinalGate.selected !== 'boolean' || humanFinalGate.policyIdentity !== input.policy.identity || humanFinalGate.gate !== 'final_review') invalid('INVALID_HUMAN_GATE', 'humanFinalGate');
    same(humanFinalGate.selected, input.policy.exactPolicy.humanGates.includes('final_review'), 'humanFinalGate.selected');
  }
  const binding = input.layout.exactBinding;
  if (!binding || !text(input.layout.ledgerText)) invalid('EXACT_LAYOUT_REQUIRED', 'layout');
  else {
    same(layoutHash(binding), input.layout.bindingIdentity, 'layout.bindingIdentity', 'BAD_PROTOCOL_HASH');
    const ledger = JSON.parse(input.layout.ledgerText);
    same(ledger.source, source, 'ledger.source'); same(ledger.manuscript, m, 'ledger.manuscript');
    same(ledger.sourceLocations, rows, 'ledger.sourceLocations');
    if(numeric) { try { finalNumericContentBasis(c,source,input.layout.ledgerText,trusted.contentHash); } catch(error) { invalid(error.code??'FINAL_NUMERIC_CONTENT_INVALID','content.trusted'); } }
    for (const [k,v] of Object.entries({projectId: input.project.id, policy: input.policy.exactPolicy, contentArtifactId: c.artifactId,
      contentRootJobId: c.rootJobId, contentHash: trusted.contentHash, manuscriptHash: c.manuscriptHash, sourceHash,
      projectionHash: c.projectionHash, ledgerHash: layoutHash(input.layout.ledgerText), ownerReportsHash: layoutHash(trusted.ownerReports), imageInventory: source.images})) same(binding[k], v, `binding.${k}`);
    same(input.layout.originalOwnerReports, trusted.ownerReports, 'layout.originalOwnerReports');
    for (const k of ['originalJobs','originalAttempts','originalReceipts']) if (!Array.isArray(input.layout[k])) invalid('ORIGINAL_LAYOUT_HISTORY_REQUIRED', k);
  }
  const assetsResource = fact(input.layout.assetsResource, 'layout.assetsResource');
  let resourceAssets;
  if (assetsResource !== undefined) {
    const descriptors = binding?.resources?.filter(r => r.kind === 'assets') ?? [];
    if (descriptors.length !== 1) invalid('EXACT_ASSETS_RESOURCE_REQUIRED', 'layout.exactBinding.resources');
    same(assetsResource.resource, descriptors[0], 'layout.assetsResource.resource');
    const {resource, contentText, parsed} = assetsResource;
    if (!resource || !path.isAbsolute(resource.path ?? '') || typeof contentText !== 'string') invalid('INVALID_ASSETS_RESOURCE', 'layout.assetsResource');
    else {
      same(Buffer.byteLength(contentText, 'utf8'), resource.byteLength, 'layout.assetsResource.byteLength');
      same(layoutHash(contentText), resource.sha256, 'layout.assetsResource.sha256', 'BAD_PROTOCOL_HASH');
      same(JSON.parse(contentText), parsed, 'layout.assetsResource.parsed');
      if (!parsed?.assets || typeof parsed.assets !== 'object' || Array.isArray(parsed.assets)) invalid('INVALID_ASSETS_MAP', 'layout.assetsResource.parsed');
      else resourceAssets = parsed.assets;
    }
  }
  const materials = new Map(), originals = new Map(), pages = [], pageMap = new Map(), placements = [], intents = new Map();
  const checkFile = (f, path) => { if (!f || !['identity','originalPath','sha256','mediaType'].every(k => text(f[k])) || !positive(f.bytes)) invalid('ORIGINAL_FILE_REQUIRED', path); };
  const dimensions = (f, d, path) => {
    const value = fact(d, path);
    if (value && (!positive(value.width) || !positive(value.height) || f && (value.boundSha256 !== f.sha256 || value.boundBytes !== f.bytes) || !text(value.evidenceIdentity))) invalid('INVALID_DIMENSION_BINDING', path);
    return value;
  };
  if (!Array.isArray(input.materials)) invalid('MATERIAL_INVENTORY_REQUIRED', 'materials');
  for (const material of input.materials ?? []) {
    if (!text(material.identity) || materials.has(material.identity)) invalid('DUPLICATE_MATERIAL', material.identity);
    if (material.kind === 'source_image') {
      const original = source.images.find(i => i.imageId === material.identity);
      same(material.sourceRow, original, `material.${material.identity}`); if (!original) invalid('UNKNOWN_SOURCE_IMAGE', material.identity);
    } else if (material.kind !== 'native_mockup') invalid('INVALID_MATERIAL_KIND', material.identity);
    const f = fact(material.file, `materials.${material.identity}.file`);
    if (f) { checkFile(f, material.identity); if (material.sourceRow) for (const [key, v] of Object.entries({sha256:material.sourceRow.sha256,bytes:material.sourceRow.byteLength,mediaType:material.sourceRow.mediaType})) same(f[key],v,`material.${material.identity}.${key}`); }
    const dim = dimensions(f, material.dimensions, `materials.${material.identity}.dimensions`);
    const normalized = {...material, ...(f ?? {}), dimensions: dim}; materials.set(material.identity, normalized);
    if (f && dim) originals.set(`material:${material.identity}`, {...f, dimensions: dim, occurrenceId:`material:${material.identity}`});
  }
  for (const row of source.images) if (!materials.has(row.imageId)) invalid('OMITTED_SOURCE_IMAGE', row.imageId);
  for (const k of ['images','sources','claims','obligations']) {
    const id = k === 'images' ? 'imageId' : k === 'obligations' ? 'originId' : k === 'claims' ? null : 'id';
    if (!Array.isArray(source[k]) || id && !unique(source[k].map(v => v[id]))) invalid('INVALID_SOURCE_COLLECTION', k);
  }
  if (errors.length) return finish('invalid_basis');
  const hosts = history.hosts;
  for (const host of hosts) {
    if (!text(host.artifactId) || !text(host.contentHash) || !text(host.version) || host.raw === undefined) invalid('INVALID_RETAINED_HOST', 'history.hosts');
    else {
      const originalText=fact(host.contentText,`host.${host.artifactId}.contentText`);
      if(originalText!==undefined){
        if(typeof originalText!=='string')invalid('INVALID_HOST_TEXT',host.artifactId);
        else {same(JSON.parse(originalText),host.raw,host.artifactId);same(sketchHash(originalText),host.contentHash,host.artifactId,'BAD_PROTOCOL_HASH');}
      }
    }
  }
  if (!unique(hosts.map(h => canonical([h.artifactId,h.contentHash,h.version])))) invalid('DUPLICATE_HOST', 'history.hosts');
  const addressValue = (a, path) => {
    if (!a || typeof a !== 'object') { invalid('INVALID_ADDRESS', path); return; }
    if (a.domain === 'content_location') {
      const hit = locations.get(canonical(a.location));
      if (!hit) invalid('UNREGISTERED_LOCATION', path); return hit?.value;
    }
    if (a.domain === 'manuscript') {
      if (a.artifactId !== c.artifactId || a.contentHash !== trusted.contentHash || a.manuscriptHash !== c.manuscriptHash) invalid('WRONG_MANUSCRIPT_HOST', path);
      const v = pointer(m, a.pointer, path);
      if (!a.range) return v;
      const r = a.range;
      if (typeof v !== 'string' || r.unit !== 'utf16_code_unit' || !Number.isSafeInteger(r.start) || !Number.isSafeInteger(r.end) || r.start < 0 || r.end <= r.start || r.end > v.length) { invalid('INVALID_FRAGMENT_RANGE',path); return; }
      return v.slice(r.start,r.end);
    }
    if (a.domain === 'effective_source_member') {
      const keys = {sources:'id',claims:null,obligations:'originId',images:'imageId'}, key = keys[a.collection];
      if (!Object.hasOwn(keys,a.collection) || a.rootJobId !== c.rootJobId || a.sourceHash !== sourceHash || !Number.isSafeInteger(a.memberIndex)) { invalid('WRONG_SOURCE_MEMBER_HOST',path); return; }
      const v = source[a.collection][a.memberIndex];
      if (!v || a.pointer !== `/${a.collection}/${a.memberIndex}` || a.memberId !== (key ? v[key] : sketchHash(v))) invalid('WRONG_SOURCE_MEMBER',path);
      return v;
    }
    if (a.domain === 'legacy_artifact') {
      const host = hosts.find(h => h.artifactId === a.artifactId && h.contentHash === a.contentHash && h.version === a.version);
      if (!host) {
        if (hosts.some(h => h.artifactId === a.artifactId)) invalid('WRONG_LEGACY_HOST',path); else missing('MISSING_LEGACY_HOST',path);
        return;
      }
      const s = a.selector;
      if (s?.kind === 'json_pointer') { same(a.originalLocator, s.pointer, path); return pointer(host.raw,s.pointer,path); }
      if (s?.kind === 'domain_member' && ['sources','directions','targets'].includes(s.collection)) {
        const key = {sources:'id',directions:'directionId',targets:'targetId'}[s.collection];
        const values = s.collection === 'targets' ? host.raw.directions?.flatMap(d => d.targets) : host.raw[s.collection];
        const hits = values?.filter(v => v[key] === s.id) ?? [];
        if (hits.length !== 1) { invalid('INVALID_DOMAIN_MEMBER',path); return; }
        same(a.originalLocator,`/${s.collection}/${s.id}${s.field ?? ''}`,path);
        return pointer(hits[0],s.field ?? '',path);
      }
      missing('UNSUPPORTED_LEGACY_SELECTOR',path); return;
    }
    if (a.domain === 'native_manifest') {
      const edition = editionList.find(e => e.originalAttemptId === a.editionAttemptId);
      if (!edition) { missing('MISSING_NATIVE_HOST',path); return; }
      if (a.manifestSha256 !== edition.layoutManifest.sha256) invalid('WRONG_NATIVE_HOST',path);
      if (a.element) {
        const n = a.element, slide = edition.layoutManifest.raw.slides[n.slideIndex], e = slide?.elements[n.elementIndex];
        if (n.editionAttemptId !== edition.originalAttemptId || n.layoutManifestSha256 !== edition.layoutManifest.sha256 || slide?.id !== n.slideId || e?.id !== n.elementId || e?.occurrenceId !== n.occurrenceId) invalid('WRONG_NATIVE_ELEMENT',path);
      }
      return pointer(edition.layoutManifest.raw,a.pointer,path);
    }
    if (a.domain === 'visual_asset') {
      const material = materials.get(a.imageId);
      if (!material || !material.sha256) { missing('MISSING_MATERIAL_HOST',path); return; }
      if (a.sha256 !== material.sha256 || a.originalPath !== material.originalPath) invalid('WRONG_MATERIAL_HOST',path);
      return material.kind === 'source_image' ? material.sourceRow : material.nativeAssets;
    }
    invalid('UNSUPPORTED_ADDRESS_DOMAIN',path);
  };
  const locationIds = (addresses, path) => {
    if (!Array.isArray(addresses)) { invalid('EXACT_ADDRESSES_REQUIRED',path); return []; }
    return addresses.map(a => { const value = addressValue(a,path), key = canonical(a); locations.set(key,{address:a,value}); return key; });
  };
  const manuscriptAddress = pointer => ({domain:'manuscript',artifactId:c.artifactId,contentHash:trusted.contentHash,manuscriptHash:c.manuscriptHash,pointer});
  const memberAddress = (collection, index) => ({domain:'effective_source_member',rootJobId:c.rootJobId,sourceHash,collection,memberId:source[collection][index][{sources:'id',images:'imageId',obligations:'originId'}[collection]] ?? sketchHash(source[collection][index]),memberIndex:index,pointer:`/${collection}/${index}`});
  const checkMaterialAsset = (id, edition, path) => {
    const material = materials.get(id), asset = edition.layoutManifest.raw.imageResources?.[id];
    if (!material) { missing('MISSING_MOCKUP_DESCRIPTOR',path); return; }
    if (!asset) { invalid('MISSING_NATIVE_ASSET',path); return; }
    const member = resourceAssets?.[id];
    if (resourceAssets && !member) { missing('MISSING_ASSETS_RESOURCE_MEMBER',path); return; }
    if (member) {
      if (typeof member.file !== 'string') invalid('INVALID_RESOURCE_FILE',path);
      else {
        const file = pathModuleResolve(assetsResource.resource.path,member.file);
        if (material.originalPath) same(file,material.originalPath,path,'NATIVE_ASSET_CHANGED');
        if (material.sha256 && material.dimensions) same(asset,{file,sha256:material.sha256,byteLength:material.bytes,width:material.dimensions.width,height:material.dimensions.height},path,'NATIVE_ASSET_CHANGED');
      }
    }
    if (material.sha256 && (asset.sha256 !== material.sha256 || asset.byteLength !== material.bytes)) invalid('NATIVE_ASSET_CHANGED',path);
    if (material.kind === 'native_mockup') {
      const relation = material.nativeAssets?.find(b => b.editionAttemptId === edition.originalAttemptId && b.assetId === id);
      if (!relation || !Object.hasOwn(relation,'resourceMember')) missing('MISSING_MOCKUP_RELATION',path);
      else {
        same(relation.descriptor,asset,path); if (member) same(relation.resourceMember,member,path);
        if (member && member.role !== 'mockup') invalid('INVALID_MOCKUP_RELATION',path);
        const applications = Object.values(resourceAssets ?? {}).filter(a => a.application);
        if (!applications.length) missing('MISSING_MOCKUP_APPLICATION',path);
        else {
          const related = applications.filter(a => a.application.mockupId === id);
          if (!related.length || related.some(a => a.application.kind !== 'rectangular-aperture' || a.application.purpose !== member?.purpose)) invalid('INVALID_MOCKUP_RELATION',path);
        }
        if (member && !member.aperture) missing('MISSING_MOCKUP_APERTURE',path);
        else if (member) {
          const {x,y,w,h} = member.aperture;
          if (![x,y,w,h].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || w === 0 || h === 0 || x+w > 1 || y+h > 1) invalid('INVALID_MOCKUP_APERTURE',path);
        }
      }
    }
  };
  for (const edition of editionList) {
    const style = edition.style;
    for (const k of ['originalExportJobId','originalAttemptId']) if (!text(edition[k])) invalid('EDITION_IDENTITY_REQUIRED',`${style}.${k}`);
    for (const k of ['originalWorker','historicalExecution','anchor']) if (edition[k] === undefined) invalid('ORIGINAL_EDITION_FACT_REQUIRED',`${style}.${k}`);
    for (const k of ['deliveryDeck','nativeInputDeck','pdf']) checkFile(edition[k],`${style}.${k}`);
    for (const k of ['layoutManifest','reviewManifest']) {
      const record = edition[k];
      if (!record || !record.raw || !text(record.originalPath) || !text(record.sha256) || !positive(record.bytes)) invalid('ORIGINAL_MANIFEST_REQUIRED',`${style}.${k}`);
    }
    if (!edition.layoutManifest?.raw || !edition.reviewManifest?.raw) continue;
    const record=edition.layoutManifest;
    if(record.schemaVersion==='native-original-record-v2'){
      if(edition.anchor?.raw?.protocol!=='project-native-proof-v2')invalid('INVALID_NATIVE_RECORD_VERSION',style);
      try{if(typeof record.contentText!=='string'||Buffer.byteLength(record.contentText,'utf8')>NATIVE_MANIFEST_LIMITS.encodedBytes)throw new Error('NATIVE_MANIFEST_LIMIT');const checked=readNativeManifest(Buffer.from(record.contentText,'utf8'),{sha256:record.sha256,bytes:record.bytes});if(!checked.transportVersion)throw new Error('NATIVE_MANIFEST_VERSION');same(checked.transportVersion,record.transportVersion,`${style}.transportVersion`);same(checked.original,record.original,`${style}.original`);same(checked.manifest,record.raw,`${style}.decodedManifest`);}catch{invalid('INVALID_NATIVE_TRANSPORT',style);}
    }else if(edition.anchor?.raw?.protocol==='project-native-proof-v2'||record.schemaVersion!==undefined||record.transportVersion!==undefined||record.original!==undefined)invalid('INVALID_NATIVE_RECORD_VERSION',style);
    const lm = edition.layoutManifest.raw, rm = edition.reviewManifest.raw;
    if (assetsResource) same(lm.inputHashes?.assets, assetsResource.resource.sha256, `${style}.inputHashes.assets`);
    same(lm.style,style,`${style}.style`); same(lm.semanticContent?.source,source,`${style}.source`); same(lm.semanticContent?.manuscript,m,`${style}.manuscript`);
    if(numeric) { try { requireFinalNumericEdition(edition,input.layout.ledgerText,input.layout.bindingIdentity,{receipts:input.layout.originalReceipts,assets:resourceAssets}); } catch(error) { invalid(error.code??'FINAL_NUMERIC_NATIVE_INVALID',style); } }
    const slides = lm.slides, rawPlacements = lm.placements;
    if (!Array.isArray(slides) || !Array.isArray(rawPlacements) || !Array.isArray(edition.pages) || !Array.isArray(edition.placements) || !Array.isArray(rm.pages)) { invalid('EXACT_PAGE_SET_REQUIRED',style); continue; }
    if (!positive(rm.pageCount) || slides.length !== rm.pageCount || rm.pages.length !== rm.pageCount || edition.pages.length !== rm.pageCount) invalid('EXACT_PAGE_SET_REQUIRED',style);
    if (!unique(slides.map(s=>s.id)) || !unique(edition.pages.map(p=>p.originalRender?.originalPath))) invalid('DUPLICATE_PAGE',style);
    const flattened = slides.flatMap(s => s.elements.filter(e => e.contentRefs).map(e => ({intentId:s.originId,slideId:s.id,elementId:e.id,occurrenceId:e.occurrenceId,...e.contentRefs})));
    same(rawPlacements,flattened,`${style}.placements`,'RAW_PLACEMENT_REFS_CHANGED');
    same(edition.placements.map(p=>p.raw),rawPlacements,`${style}.boundPlacements`,'RAW_PLACEMENT_REFS_CHANGED');
    if (!unique(rawPlacements.map(p=>p.occurrenceId))) invalid('DUPLICATE_PLACEMENT',style);
    edition.pages.forEach((page,index) => {
      same(page.pageNumber,index+1,`${style}.pageNumber`); same(page.slideId,slides[index]?.id,`${style}.slideId`);
      same(page.rawSlide,slides[index],`${style}.rawSlide`); same(page.rawReviewPage,rm.pages[index],`${style}.rawReviewPage`);
      same(rm.pages[index]?.page,index+1,`${style}.reviewPage`);
      checkFile(page.originalRender,`${style}.${index}`);
      const rawImage = rm.pages[index]?.image;
      if (rawImage) for (const [k,v] of Object.entries({originalPath:rawImage.path,sha256:rawImage.sha256,bytes:rawImage.bytes})) same(page.originalRender[k],v,`${style}.render.${k}`);
      else invalid('REVIEW_PAGE_IMAGE_REQUIRED',style);
      const dim = dimensions(page.originalRender,page.dimensions,`${style}.${index}.dimensions`);
      if (dim) same(rm.pages[index].dimensions,[dim.width,dim.height],`${style}.reviewDimensions`);
      const pageId = hash({root:input.layout.rootJobId,binding:input.layout.bindingIdentity,style,job:edition.originalExportJobId,attempt:edition.originalAttemptId,
        worker:edition.originalWorker,execution:edition.historicalExecution,anchor:edition.anchor,deck:edition.deliveryDeck,nativeInputDeck:edition.nativeInputDeck,pdf:edition.pdf,
        layoutManifest:edition.layoutManifest,reviewManifest:edition.reviewManifest,number:page.pageNumber,slideId:page.slideId,render:page.originalRender});
      const row = {...page,id:pageId,style,original:`page:${pageId}`,placements:[]}; pages.push(row); pageMap.set(pageId,row);
      if (dim) originals.set(row.original,{...page.originalRender,dimensions:dim,occurrenceId:row.original});
      for (const bound of edition.placements.filter(p=>p.raw.slideId===page.slideId)) {
        const p = bound.raw, n = bound.native, slide = slides[index], ei = slide.elements.findIndex(e=>e.id===p.elementId), element = slide.elements[ei];
        same(n,{editionAttemptId:edition.originalAttemptId,layoutManifestSha256:edition.layoutManifest.sha256,slideIndex:index,slideId:page.slideId,elementIndex:ei,elementId:p.elementId,occurrenceId:p.occurrenceId},`${style}.${p.occurrenceId}.native`);
        const intentIndex = m.pageIntents.findIndex(i=>i.id===p.intentId), intent = m.pageIntents[intentIndex], addresses = [];
        const ma = ptr => { const a=manuscriptAddress(ptr);addresses.push(a);return addressValue(a,p.occurrenceId); };
        const sa = (collection,id,key) => { const idx=source[collection].findIndex(v=>v[key]===id); if(idx<0){invalid('UNKNOWN_PLACEMENT_REFERENCE',id);return;} const a=memberAddress(collection,idx);addresses.push(a);return source[collection][idx]; };
        if (!intent || slide.originId !== p.intentId || !element || !Array.isArray(p.blockIds) || !Array.isArray(p.imageIds)) { invalid('PLACEMENT_ALIGNMENT_REQUIRED',p.occurrenceId); continue; }
        ma(`/pageIntents/${intentIndex}`);
        if (p.manuscriptTitle) same(element.sourceText,ma('/title'),p.occurrenceId);
        if (p.centralMessageIntentId) {
          same(p.centralMessageIntentId,p.intentId,p.occurrenceId);
          const central = intent.central?.kind==='text' ? ma(`/pageIntents/${intentIndex}/central/exactText`) : ma(`/pageIntents/${intentIndex}/centralMessage`);
          same(element.sourceText,central,p.occurrenceId);
        }
        if (p.centralImageIntentId) { same(p.centralImageIntentId,p.intentId,p.occurrenceId);same(element.assetId,intent.central?.imageId,p.occurrenceId);ma(`/pageIntents/${intentIndex}/central`); }
        for (const id of p.blockIds) {
          const bi=m.narrativeBlocks.findIndex(b=>b.id===id); if(bi<0||!intent.blockIds.includes(id)){invalid('UNKNOWN_PLACEMENT_BLOCK',id);continue;}
          const block=ma(`/narrativeBlocks/${bi}`);same(element.sourceText,block.text,p.occurrenceId);
        }
        for (const id of p.sourceIds ?? []) sa('sources',id,'id');
        for (const id of [...new Set([...(p.claimOrigins??[]),...(p.obligationOrigins??[])])]) {
          const oi=source.obligations.findIndex(o=>o.originId===id);
          if (oi<0) {invalid('UNKNOWN_PLACEMENT_ORIGIN',id);continue;}
          const o=sa('obligations',id,'originId'),clause=rows.find(r=>r.originId===id);
          if(clause) addresses.push({domain:'content_location',location:clause.derived});
          else {
            const host=hosts.find(h=>h.artifactId===o.artifactId);
            if(!host)missing('MISSING_LEGACY_HOST',o.artifactId);
            else {let selector={kind:'json_pointer',pointer:o.pointer};
              for(const [collection,key,values]of [['sources','id',host.raw.sources],['directions','directionId',host.raw.directions],['targets','targetId',host.raw.directions?.flatMap(d=>d.targets)]]){
                const member=(values??[]).find(v=>o.pointer===`/${collection}/${v[key]}`||o.pointer.startsWith(`/${collection}/${v[key]}/`));
                if(member){selector={kind:'domain_member',collection,id:member[key],field:o.pointer.slice(`/${collection}/${member[key]}`.length)};break;}
              }
              const a={domain:'legacy_artifact',artifactId:host.artifactId,contentHash:host.contentHash,version:host.version,originalLocator:o.pointer,selector};addresses.push(a);same(addressValue(a,id),o.value,id);}
          }
          if((p.claimOrigins??[]).includes(id)) {if(o.kind!=='claim')invalid('INVALID_CLAIM_ORIGIN',id);for(const ref of o.value.evidenceRefs??[])sa('sources',ref,'id');}
        }
        for (const id of p.imageIds) {
          checkMaterialAsset(id,edition,p.occurrenceId);
          const material=materials.get(id);
          if(material?.kind==='source_image')sa('images',id,'imageId');
          if(material?.sha256)addresses.push({domain:'visual_asset',imageId:id,sha256:material.sha256,originalPath:material.originalPath});
          if(element.type==='image')same(element.assetId,id,p.occurrenceId);
        }
        for (const ref of p.materialPlacements ?? []) {
          const cp=m.clausePlacements?.[ref.placementIndex],clause=source.visibility.clauses.find(c=>c.clauseId===ref.clauseId);
          if(!cp||!clause){invalid('UNKNOWN_MATERIAL_PLACEMENT',p.occurrenceId);continue;}
          same(cp.clauseId,ref.clauseId,p.occurrenceId);same(cp.occurrenceScopeKeys,ref.occurrenceScopeKeys,p.occurrenceId);
          ma(`/clausePlacements/${ref.placementIndex}`);
          const blockIndex=m.narrativeBlocks.findIndex(b=>b.id===cp.blockId), block=m.narrativeBlocks[blockIndex], fragments=materialFragments(clause.content);
          if(!block||!cp.pageIntentIds.includes(p.intentId))invalid('MATERIAL_PLACEMENT_ALIGNMENT',p.occurrenceId);
          for (const f of ref.fragments ?? []) {
            same(f.sourceRange,cp.exactFragmentRanges[f.fragmentIndex],p.occurrenceId);
            const range={unit:'utf16_code_unit',...f.sourceRange}, a={...manuscriptAddress(`/narrativeBlocks/${blockIndex}/text`),range};addresses.push(a);
            const fragment=addressValue(a,p.occurrenceId), nr=f.nativeRange;
            if(!nr||!Number.isSafeInteger(nr.start)||!Number.isSafeInteger(nr.end)||nr.start<0||nr.end<=nr.start||nr.end>element.sourceText?.length)invalid('INVALID_NATIVE_FRAGMENT',p.occurrenceId);
            else same(element.sourceText.slice(nr.start,nr.end),fragment,p.occurrenceId);
            same(fragment,fragments[f.fragmentIndex],p.occurrenceId);
          }
          if(!ref.fragments?.length)invalid('MISSING_MATERIAL_FRAGMENTS',p.occurrenceId);
          for(const key of cp.occurrenceScopeKeys){
            const occurrence=source.visibility.occurrences.find(o=>occurrenceScopes(o).some(s=>s.key===key)),scope=occurrence&&occurrenceScopes(occurrence).find(s=>s.key===key);
            if(!scope)invalid('UNKNOWN_OCCURRENCE_SCOPE',key);
            else {
              const relations=affectedContentRelations(m,source,occurrence,scope).filter(r=>r.intentId===p.intentId);
              if(!relations.length||!relations.some(r=>r.imageIds.some(id=>row.rawSlide.elements.some(e=>e.contentRefs?.imageIds?.includes(id)))||r.blockIds.some(id=>row.rawSlide.elements.some(e=>e.contentRefs?.blockIds?.includes(id)))))invalid('MATERIAL_SCOPE_NOT_COVISIBLE',key);
            }
          }
        }
        if(p.repeatedMaterial && !p.materialPlacements?.length)invalid('REPEATED_MATERIAL_BINDING_REQUIRED',p.occurrenceId);
        if(p.repeatedQualification){
          if(!(p.obligationOrigins?.length&&p.imageIds.length))invalid('REPEATED_QUALIFICATION_BINDING_REQUIRED',p.occurrenceId);
          for(const id of p.obligationOrigins??[]){
            const nativeObligation=lm.semanticContent.obligationsByOrigin?.[id],original=source.obligations.find(o=>o.originId===id);
            if(!nativeObligation)missing('MISSING_NATIVE_OBLIGATION_BINDING',id);
            else {same(nativeObligation.valueHash,sketchHash(original.value),id);same(element.sourceText,nativeObligation.exactText,id);}
            const visible=m.visibleObligations?.find(o=>o.originId===id);
            if(!visible)missing('MISSING_VISIBLE_OBLIGATION_BINDING',id);
            else if(!p.imageIds.every(id=>visible.imageIds.includes(id))||!visible.pageIntentIds.includes(p.intentId))invalid('REPEATED_QUALIFICATION_SCOPE_CHANGED',p.occurrenceId);
          }
        }
        if(!addresses.length)missing('MISSING_PLACEMENT_PROVENANCE',p.occurrenceId);
        for(const edge of bound.provenance ?? [])same(addressValue(edge.address,p.occurrenceId),edge.exactValue,p.occurrenceId);
        const ids=locationIds(addresses,p.occurrenceId), normalized={...p,raw:p,native:n,provenance:addresses.map((address,i)=>({address,exactValue:locations.get(ids[i])?.value})),sourceLocationIds:ids,pageNumber:page.pageNumber,pageId,style};
        row.placements.push(normalized);placements.push(normalized);
        if(!intents.has(p.intentId))intents.set(p.intentId,[]);if(!intents.get(p.intentId).includes(row))intents.get(p.intentId).push(row);
      }
    });
  }
  for(const material of materials.values())material.sourceLocationIds=material.kind==='source_image' ? locationIds([memberAddress('images',source.images.findIndex(i=>i.imageId===material.identity))],material.identity) : [];
  const scopes=new Map();
  if(!Array.isArray(input.roleMaterialScopes))missing('MISSING_ROLE_SCOPES','roleMaterialScopes');
  for(const role of ROLES){
    const rowsForRole=(input.roleMaterialScopes??[]).filter(s=>s.role===role);
    if(rowsForRole.length>1)invalid('DUPLICATE_ROLE_SCOPE',role);
    const scope=rowsForRole[0],applicability=scope&&fact(scope.applicability,`scopes.${role}`),required=[];
    if(!scope)missing('MISSING_ROLE_SCOPE',role);
    if(applicability!==undefined&&!Array.isArray(applicability))invalid('INVALID_ROLE_SCOPE',role);
    if(Array.isArray(applicability)){
      if(!unique(applicability.map(a=>a.materialIdentity))||applicability.some(a=>!materials.has(a.materialIdentity)))invalid('INVALID_APPLICABILITY',role);
      for(const material of materials.values()){
        const f=applicability.find(a=>a.materialIdentity===material.identity),decision=f&&fact(f.decision,`scopes.${role}.${material.identity}`);
        if(!f)missing('MISSING_APPLICABILITY',`${role}.${material.identity}`);
        if(decision){
          if(typeof decision.required!=='boolean'||!Array.isArray(decision.evidence)||!decision.evidence.length)invalid('APPLICABILITY_EVIDENCE_REQUIRED',role);
          locationIds(decision.evidence,role);if(decision.required)required.push(material.identity);
        }
      }
    }
    if(['visual','brand'].includes(role))for(const id of new Set(placements.flatMap(p=>p.imageIds))){
      const decision=applicability?.find(a=>a.materialIdentity===id)?.decision;
      if(decision?.state==='present'&&decision.value.required===false)invalid('DISPLAYED_ORIGINAL_EXCLUDED',`${role}.${id}`);
      if(!required.includes(id))required.push(id);
    }
    scopes.set(role,required);
  }
  const reportMap=new Map();
  for(const report of history.originalReports){
    const key=canonical([report.identity,report.version]);
    if(reportMap.has(key)||!text(report.identity)||!text(report.version)||report.raw===undefined||sketchHash(report.raw)!==report.sha256)invalid('INVALID_ORIGINAL_REPORT',key);
    reportMap.set(key,report);
  }
  const targetCorresponds = (target, address, where) => {
    const mismatch = () => invalid('RETURN_TARGET_ADDRESS_MISMATCH',where);
    if (!target || typeof target !== 'object' || Array.isArray(target)) { missing('UNSUPPORTED_RETURN_TARGET',where); return; }
    if (target.location) {
      if (address.domain !== 'content_location' || !equal(target.location,address.location)) mismatch();
      const row = rows.find(r => r.originId === target.location.clauseId);
      if (Object.hasOwn(target,'ancestryAnchor')) same(target.ancestryAnchor,row?.ancestryAnchor,where);
      return;
    }
    if (target.domain === 'native_manifest' || target.kind === 'native_manifest') {
      if (address.domain !== 'native_manifest' || target.editionAttemptId !== address.editionAttemptId || target.manifestSha256 !== address.manifestSha256 || target.pointer !== address.pointer || target.element && !equal(target.element,address.element)) mismatch();
      return;
    }
    if (text(target.imageId) && text(target.sha256)) {
      if (address.domain !== 'visual_asset' || target.imageId !== address.imageId || target.sha256 !== address.sha256 || target.originalPath !== undefined && target.originalPath !== address.originalPath) mismatch();
      return;
    }
    if (text(target.artifactId) && typeof target.pointer === 'string') {
      if (target.artifactId === c.artifactId) {
        if (target.version !== undefined) missing('UNAVAILABLE_MANUSCRIPT_VERSION',where);
        if (address.domain !== 'manuscript' || address.artifactId !== target.artifactId || address.pointer !== target.pointer || !equal(address.range,target.range) || target.contentHash !== undefined && target.contentHash !== trusted.contentHash) mismatch();
        return;
      }
      const candidates = hosts.filter(h => h.artifactId === target.artifactId && (target.contentHash === undefined || h.contentHash === target.contentHash) && (target.version === undefined || h.version === target.version));
      if (address.domain !== 'legacy_artifact' || address.artifactId !== target.artifactId || address.originalLocator !== target.pointer || target.contentHash !== undefined && target.contentHash !== address.contentHash || target.version !== undefined && target.version !== address.version) mismatch();
      if (candidates.length !== 1) {
        if (candidates.length > 1) missing('AMBIGUOUS_LEGACY_HOST',where);
        else if (hosts.some(h => h.artifactId === target.artifactId)) invalid('WRONG_LEGACY_HOST',where);
        else missing('MISSING_LEGACY_HOST',where);
      } else if (address.contentHash !== candidates[0].contentHash || address.version !== candidates[0].version) mismatch();
      return;
    }
    missing('UNSUPPORTED_RETURN_TARGET',where);
  };
  const bindings=new Map(), originalTargetOccurrences=new Set();
  if(!Array.isArray(input.returnBindings))invalid('RETURN_BINDINGS_REQUIRED','returnBindings');
  for(const b of input.returnBindings??[]){
    const key=canonical([b.findingIdentity,b.targetIndex]);
    if(bindings.has(key)||!text(b.findingIdentity)||!Number.isSafeInteger(b.targetIndex)||b.targetIndex<0)invalid('INVALID_RETURN_BINDING',key);
    bindings.set(key,b);
    const occurrenceKey=canonical([b.reportIdentity,b.reportVersion,b.findingIdentity,b.originalReportPointer]);
    if(originalTargetOccurrences.has(occurrenceKey))invalid('DUPLICATE_TARGET_OCCURRENCE',key);
    originalTargetOccurrences.add(occurrenceKey);
    const report=reportMap.get(canonical([b.reportIdentity,b.reportVersion]));
    if(!report){missing('MISSING_ORIGINAL_REPORT_HOST',key);continue;}
    same(pointer(report.raw,b.originalReportPointer,key),b.rawTarget,key,'ORIGINAL_TARGET_CHANGED');
    const resolved=fact(b.resolution,`returnBindings.${key}`);
    if(resolved!==undefined){if(!Array.isArray(resolved)||!resolved.length)invalid('NONEMPTY_TARGET_RESOLUTION_REQUIRED',key);else { for (const address of resolved) targetCorresponds(b.rawTarget,address,key); locationIds(resolved,key); }}
  }
  if(!unique(history.originalFindings.map(f=>f.originId)))invalid('DUPLICATE_FINDING','history');
  for(const f of history.originalFindings){
    if(!text(f.originId)||!text(f.originalReportIdentity)||!text(f.originalReportVersion)||typeof f.originalFindingPointer!=='string'||f.exactOriginalPayload===undefined||!Array.isArray(f.returnTargets)||!Array.isArray(f.applicableObligations))invalid('ORIGINAL_FINDING_REQUIRED','history');
    const originalReport=reportMap.get(canonical([f.originalReportIdentity,f.originalReportVersion]));
    if(originalReport)same(pointer(originalReport.raw,f.originalFindingPointer,f.originId),f.exactOriginalPayload,f.originId,'ORIGINAL_FINDING_CHANGED');
    else missing('MISSING_ORIGINAL_REPORT_HOST',f.originId);
    for(const [i,t]of (f.returnTargets??[]).entries()){
      const b=bindings.get(canonical([f.originId,i]));
      if(!b){missing('MISSING_RETURN_BINDING',`${f.originId}.${i}`);continue;}
      if(typeof f.originalFindingPointer==='string'&&b.originalReportPointer!==f.originalFindingPointer&&!b.originalReportPointer.startsWith(`${f.originalFindingPointer}/`))invalid('TARGET_OUTSIDE_ORIGINAL_FINDING',f.originId);
      same(b.reportIdentity,f.originalReportIdentity,f.originId);same(b.reportVersion,f.originalReportVersion,f.originId);same(b.rawTarget,t,f.originId,'ORIGINAL_TARGET_CHANGED');
    }
    for(const o of f.applicableObligations??[]){if(!ROLES.includes(o.role)||!materials.has(o.materialIdentity)||!scopes.get(o.role)?.includes(o.materialIdentity))invalid('FINDING_OBLIGATION_OMITTED',f.originId);locationIds(o.addresses,f.originId);}
  }
  for(const b of bindings.values())if(!history.originalFindings.some(f=>f.originId===b.findingIdentity&&b.targetIndex<f.returnTargets.length))invalid('ORPHAN_RETURN_BINDING',b.findingIdentity);
  let consumedCalls=0;const unknownAttemptIds=[];
  const attempts=history.originalAttempts;
  if(!unique(attempts.map(a=>a.id)))invalid('DUPLICATE_ORIGINAL_ATTEMPT','history');
  for(const a of attempts){
    if(!text(a.id)||!['succeeded','failed','unknown','running'].includes(a.status)||!Number.isSafeInteger(a.chargedCalls)||a.chargedCalls<0||(['unknown','running'].includes(a.status)&&a.chargedCalls<1))invalid('ATTEMPT_CHARGE_REQUIRED',a.id);
    if(Number.isSafeInteger(a.chargedCalls)&&a.chargedCalls>=0)consumedCalls+=a.chargedCalls;
    if(['unknown','running'].includes(a.status))unknownAttemptIds.push(a.id);
  }
  if(!Number.isSafeInteger(consumedCalls))invalid('ATTEMPT_CHARGE_REQUIRED','history');
  if(unknownAttemptIds.length)missing('UNRESOLVED_ORIGINAL_ATTEMPT',unknownAttemptIds.join(','));
  if(allowance&&(!text(allowance.authorityIdentity)||!Number.isSafeInteger(allowance.totalCalls)||allowance.totalCalls<0||!Number.isSafeInteger(allowance.reservedOtherCalls)||allowance.reservedOtherCalls<0))invalid('INVALID_ALLOWANCE','allowance');
  if(errors.length)return finish('invalid_basis');
  const {observedRevision,...projectSemantic}=input.project;
  const inputId=hash({...input,project:projectSemantic});
  const boundInput={id:inputId,observedRevision,facts:input,pages,accounting:{...(allowance??{}),consumedCalls,unknownAttemptIds}};
  const assignments=validateFinalAssignments(configurationOrNull,owners);
  for(const issue of assignments.issues)(assignments.kind==='invalid_basis'?invalid:missing)(issue.code,issue.path);
  if(errors.length)return finish('invalid_basis',boundInput);
  if(blockers.length>1)return finish('blocked',boundInput);
  const {config,profileMap,seatMap,pixelProfiles}=assignments,policy=config.assignmentPolicy;
  const limits=Object.fromEntries(['maxImages','maxBytes','maxPixels','maxImageBytes','maxImagePixels'].map(k=>
    [k,Math.min(...pixelProfiles.map(p=>p.transport[k]))]));
  const obligations = [];
  const add = (kind, images, details) => {
    const body = {kind, images: [...new Set(images)], ...details};
    const o = {...body, id: hash(body)}; obligations.push(o); return o;
  };
  for (const page of pages) add('native_page', [page.original], {pageIds: [page.id], sourceLocationIds: page.placements.flatMap(p => p.sourceLocationIds)});
  for (const style of STYLES) {
    const rows = pages.filter(p => p.style === style);
    for (let i = 1; i < rows.length; i++) add('page_transition', [rows[i - 1].original, rows[i].original], {pageIds: [rows[i - 1].id, rows[i].id], sourceLocationIds: [...new Set([...rows[i - 1].placements, ...rows[i].placements].flatMap(p => p.sourceLocationIds))]});
  }
  const witnessEdges = new Map();
  for (const [intentId, rows] of [...intents.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const groups = STYLES.map(style => rows.filter(p => p.style === style)).filter(g => g.length);
    if (groups.length < 2) continue;
    const edge = (left, right) => {
      const key = [left.id, right.id].sort().join(':');
      if (!witnessEdges.has(key)) witnessEdges.set(key, {left, right, intentIds: []});
      const e = witnessEdges.get(key); if (!e.intentIds.includes(intentId)) e.intentIds.push(intentId);
    };
    for (const group of groups.slice(1)) for (const page of group) edge(groups[0][0], page);
    for (const page of groups[0].slice(1)) edge(page, groups[1][0]);
    for (let i = 1; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) edge(groups[i][0], groups[j][0]);
  }
  for (const {left, right, intentIds} of witnessEdges.values()) add('cross_style_intent', [left.original, right.original], {
    pageIds: [left.id, right.id], intentIds, occurrences: placements.filter(p => intentIds.includes(p.intentId) && [left.id, right.id].includes(p.pageId)),
    sourceLocationIds: [...new Set([...left.placements, ...right.placements].flatMap(p => p.sourceLocationIds))]});
  const common = [...obligations];
  const packetsByRole = {}, roleObligations = {};
  const budget = ids => ({imageCount: ids.length, imageBytes: ids.reduce((s, id) => s + originals.get(id).bytes, 0),
    imagePixels: ids.reduce((s, id) => s + originals.get(id).dimensions.width * originals.get(id).dimensions.height, 0)});
  const fits = ids => {
    const b = budget(ids);
    return b.imageCount <= limits.maxImages && b.imageBytes <= limits.maxBytes && b.imagePixels <= limits.maxPixels && ids.every(id => {
      const o = originals.get(id); return o.bytes <= limits.maxImageBytes && o.dimensions.width * o.dimensions.height <= limits.maxImagePixels;
    });
  };
  for (const role of ROLES) {
    const roleRows = [...common];
    for (const id of scopes.get(role)) roleRows.push(add('source_material', [`material:${id}`], {role, materialIdentity: id, sourceLocationIds: materials.get(id).sourceLocationIds}));
    if (['visual', 'brand'].includes(role)) {
      for (const page of pages) for (const id of [...new Set(page.placements.flatMap(p => p.imageIds))]) roleRows.push(add('placed_original', [page.original, `material:${id}`], {
        role, pageIds: [page.id], materialIdentity: id, placements: page.placements.filter(p => p.imageIds.includes(id)), sourceLocationIds: materials.get(id).sourceLocationIds}));
    }
    roleObligations[role] = roleRows;
    const packed = [];
    for (const o of roleRows) {
      if (!fits(o.images)) { missing('COMPARISON_TRANSPORT_BLOCKED', o.id); continue; }
      let target = packed.find(p => fits([...new Set([...p.originalImageOccurrences, ...o.images])]));
      if (!target) { target = {originalImageOccurrences: [], obligations: []}; packed.push(target); }
      target.originalImageOccurrences = [...new Set([...target.originalImageOccurrences, ...o.images])]; target.obligations.push(o);
    }
    const restrictionOrigins = new Set(source.obligations.filter(o => ['restriction','limitation','qualification'].includes(o.kind)).map(o => o.originId));
    const applicableOriginals = catalog.entries.filter(e => e.location.kind === 'original_occurrence' && restrictionOrigins.has(e.location.clauseId));
    const restrictions = {taskPolicy:{task:input.task,policy:input.policy},
      operativeObligations:source.obligations.filter(o => ['restriction','limitation','qualification'].includes(o.kind)),
      visibilityScopes:source.visibility.occurrences,
      manuscriptRelations:m.clausePlacements, applicableOriginals};
    const commonBusiness = {neutral:neutralContent(source),manuscriptText,exactTask:input.task,exactPolicy:input.policy,
      sourceLocationRows:rows,effectiveCatalog:catalog.entries.filter(e => e.location.kind === 'effective_source_clause')};
    const commonSource = {...commonBusiness,restrictions};
    packetsByRole[role] = [{kind:'complete_source',id:hash({inputId,role,source:true}),originals:[],obligations:[],payload:commonSource,...budget([])},
      ...packed.map((p,index) => ({kind:'pixels',id:hash({inputId,role,index,...p}),originals:p.originalImageOccurrences.map(id=>originals.get(id)),
        obligations:p.obligations,payload:{...commonSource,
          localPlacements:placements.filter(q=>p.obligations.some(o=>o.pageIds?.includes(q.pageId))),
          sourceFacts:[...new Set(p.obligations.flatMap(o=>o.sourceLocationIds))].map(id=>locations.get(id)),
          attachedOriginals:p.originalImageOccurrences.map(id=>originals.get(id)),
          narrativeIndex:pages.map(p=>({pageId:p.id,style:p.style,pageNumber:p.pageNumber,intentIds:p.placements.map(q=>q.intentId)}))},...budget(p.originalImageOccurrences)}))];
  }
  const commonBusiness = packetsByRole[ROLES[0]][0].payload;
  const restrictions = commonBusiness.restrictions;

  const calls = [], byId = new Map();
  const addCall = (id, phase, role, dependencies, exposure, payload, packet = null, assignment = null, reportDependencies = dependencies) => {
    const seatKey=role ? `${role}:${phase==='primary_synthesis'?'primarySynthesis':phase==='blind_synthesis'?'blindSynthesis':phase==='paired_challenge'?'challenge':phase}` : phase==='director'?'director':null;
    const selected=seatKey?seatMap.get(seatKey):null;
    const profile=profileMap.get(seatKey?selected?.profileIdentity:policy.ownerProfiles[id.slice('owner:'.length)]);
    const exactAssignment=seatKey?{...selected,providerIdentity:profile.providerIdentity,modelIdentity:profile.modelIdentity}:
      {...assignment,profileIdentity:profile.identity};
    const originalReportInputs = reportDependencies.filter(id => byId.has(id)).map(id => ({
      ...byId.get(id).reportSlot, completeness: 'complete_original', requiredDigest: 'sha256_of_original_bytes',
    }));
    const dependencyReserve = originalReportInputs.reduce((s, slot) => s + slot.maxBytes, 0);
    const knownInputBytes = size({inputId, phase, role, exposure, payload, packet, assignment:exactAssignment, profile, originalReportInputs, restrictions});
    const contextIdentity = hash({inputId, assignment:exactAssignment, profile, id});
    const reportSlot = {slotIdentity: hash({inputId, contextIdentity, assignment:exactAssignment, profile, producerCallId: id}), inputId, producerCallId: id, contextIdentity,
      maxBytes: profile.reportBoundBytes};
    const call = {id, phase, role, contextIdentity, dependencies, originalReportInputs, reportSlot, exposure, payload, packetId: packet?.id ?? null,
      assignment:exactAssignment, profile, authority: 'none', personalPixelInspection: phase === 'primary' || phase === 'blind' ? packet?.kind === 'pixels' : false,
      unresolvedPixelDispute: 'unknown_requires_revised_counted_plan', attachmentBudget: packet ? {imageCount: packet.imageCount, imageBytes: packet.imageBytes, imagePixels: packet.imagePixels} : budget([]),
      textBudget: {knownInputBytes, futureReportsReservedBytes: dependencyReserve, maxInputBytes: knownInputBytes + dependencyReserve, maxOutputBytes: profile.reportBoundBytes}};
    if (call.textBudget.maxInputBytes > profile.context.maxInputBytes) missing('CONTEXT_CAPACITY_EXCEEDED', id);
    if(packet?.kind==='pixels'){
      const t=profile.transport;
      if(!t||packet.imageCount>t.maxImages||packet.imageBytes>t.maxBytes||packet.imagePixels>t.maxPixels||packet.originals.some(o=>o.bytes>t.maxImageBytes||o.dimensions.width*o.dimensions.height>t.maxImagePixels))
        missing('ASSIGNED_PIXEL_CAPACITY_EXCEEDED',id);
    }
    calls.push(call); byId.set(id, call); return id;
  };
  const frozen = {inputId, exactTask: input.task, exactPolicy: input.policy, layout: input.layout, editions: editionList,
    fullSource: input.content, materialInventory: input.materials, originalHistory: input.history, owners,
    returnLocationBindings: input.returnBindings};
  const layoutProducer = addCall('owner:layoutProducer', 'owner_before', null, [], 'frozen_restrictions_before_independent_reads', frozen, null, owners.layoutProducer);
  const finalConsumer = addCall('owner:finalConsumer', 'owner_before', null, [layoutProducer], 'complete_original_producer_handoff',
    {...frozen, originalReportIds: [layoutProducer]}, null, owners.finalConsumer);
  const beforeOwners = [layoutProducer, finalConsumer];
  const challenges = [];
  for (const role of ROLES) {
    const syntheses = [], originalsByPhase = {};
    for (const phase of ['primary', 'blind']) {
      const reads = packetsByRole[role].map((packet, i) => addCall(`${role}:${phase}:${i}`, phase, role, beforeOwners, 'neutral_source_no_peer_reports', packet.payload, packet, null, []));
      originalsByPhase[phase] = reads;
      syntheses.push(addCall(`${role}:${phase}:synthesis`, `${phase}_synthesis`, role, reads, `${phase}_originals_only_no_peer`, {...commonBusiness, originalReportIds: reads}));
    }
    challenges.push(addCall(`${role}:challenge`, 'paired_challenge', role, [...originalsByPhase.primary, ...originalsByPhase.blind, ...syntheses],
      'complete_primary_and_blind_originals', {...commonBusiness, originalReportIds: [...originalsByPhase.primary, ...originalsByPhase.blind], synthesisIds: syntheses}));
  }
  const specialistOriginals = calls.filter(c => ROLES.includes(c.role)).map(c => c.id);
  const director = addCall('director', 'director', null, specialistOriginals, 'all_complete_original_specialist_evidence', {...frozen, challengeIds: challenges, originalReportIds: specialistOriginals});
  const localGates = humanFinalGate.selected ? [{id: 'human:final_review', phase: 'human_wait', dependencies: [director], inputId, providerCalls: 0, policyIdentity: input.policy.identity}] : [];
  const afterDependencies = [director, ...specialistOriginals, ...localGates.map(g => g.id)];
  const finalProducer = addCall('owner:finalProducer', 'owner_after', null, afterDependencies,
    'accepted_generation_and_complete_original_evidence', frozen, null, owners.finalProducer);
  addCall('owner:deliveryConsumer', 'owner_after', null, [...afterDependencies, finalProducer], 'complete_original_producer_handoff',
    {...frozen, originalReportIds: [...specialistOriginals, director, finalProducer]}, null, owners.deliveryConsumer);
  const Krole = Object.fromEntries(ROLES.map(role => [role, packetsByRole[role].length]));
  const expectedCalls = 2 * Object.values(Krole).reduce((a, b) => a + b, 0) + 20;
  if (calls.length !== expectedCalls) throw new Error('Prospective call accounting mismatch');
  if (consumedCalls + allowance.reservedOtherCalls + calls.length > allowance.totalCalls) missing('CUMULATIVE_ALLOWANCE_EXCEEDED', 'allowance');
  const body = {protocol: 'final-review-plan-v2', inputId, configuration: config, obligations, roleObligations, packetsByRole, calls, localGates,
    Krole, providerCalls: calls.length, formula: '2 * sum(Krole) + 20', allowance: {...allowance, consumedCalls, prospectiveCalls: calls.length, unknownAttemptIds},
    limitations: ['Profile capability and evidence identities are caller declarations, not verified adapter support.', 'Text-only syntheses, challenge, director and owners have no personal pixel authority.', 'Caller-owned facts do not establish native verification; a trusted production snapshot reader is required.', 'No numeric deck threshold; image-specific score rules are not final-review rules.']};
  return blockers.length === 1 ? finish('planned', boundInput, {...body, id: hash(body)}) : finish('blocked', boundInput);
}

export function planFinalReview(snapshot, configurationOrNull) {
  try {
    return buildFinalReview(snapshot, configurationOrNull);
  } catch (error) {
    if (!(error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError || error.code?.startsWith('VISIBILITY_'))) throw error;
    return {kind: 'invalid_basis', input: null, plan: null, blockers: [
      {code: 'EXECUTION_UNIMPLEMENTED', path: 'execution'},
      {code: 'MALFORMED_DOMAIN_FACT', path: 'snapshot_or_configuration'},
    ], ...flags};
  }
}
