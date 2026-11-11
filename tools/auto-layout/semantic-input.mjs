import {normalizeManuscriptV2} from './semantic-input-v2.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';

export const SEMANTIC_SCHEMA='semantic-layout-v1';
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const validText=x=>typeof x==='string'&&x.trim().length>0;
const unique=xs=>new Set(xs).size===xs.length;
export function layoutIssue(code,location={},observation,measuredConstraint={}) {
  const issue={...(location.sourceLocation?{sourceLocation:location.sourceLocation}:{}),code,style:location.style??null,intentId:location.intentId??null,artifactId:location.artifactId??'layout-input',pointer:location.pointer??'/',responsibleOwner:location.owner??'layout-lead',originIds:location.originIds??[],blockIds:location.blockIds??[],imageIds:location.imageIds??[],contentHash:location.contentHash??null,relatedLocations:location.relatedLocations??[],observation,measuredConstraint};
  const error=new Error(`${code} ${issue.artifactId}${issue.pointer}: ${observation}`);
  error.code=code;error.status=422;error.issues=[issue];throw error;
}
const need=(ok,code,at,message,constraint)=>{if(!ok)layoutIssue(code,at,message,constraint);};
function array(value,at,nonempty=false) {need(Array.isArray(value)&&(!nonempty||value.length),'SEMANTIC_ARRAY_REQUIRED',at,'Expected an array');return value;}
function indexed(xs,key,at) {
  array(xs,at);need(xs.every(x=>validText(x?.[key]))&&unique(xs.map(x=>x[key])),'SEMANTIC_ID_INVALID',at,`Expected unique nonempty ${key}`);
  return Object.fromEntries(xs.map(x=>[x[key],x]));
}
export function obligationText(o) {
 if(o.proseProjection)return o.proseProjection.exactText;
  if(typeof o.value==='string')return o.value;
  if(o.kind==='direction')return ['title','slogan','supportingCopy','creativeExplanation','rationale','differentiation'].filter(k=>typeof o.value[k]==='string').map(k=>o.value[k]).join('\n');
  if(o.kind==='claim')return `${o.value.text}\n${o.value.kind}\n${(o.value.evidenceRefs??[]).join(', ')}\n${(o.value.limitations??[]).join('\n')}`;
  const lines=[];const visit=(v,path)=>{if(v===null||v===undefined)return;if(typeof v!=='object'){lines.push(`${path} ${v}`);return;}for(const [k,x]of Object.entries(v))visit(x,path?`${path} / ${k}`:k);};visit(o.value,'');return lines.join('\n');
}
export function normalizeManuscript(ledger,assets) {
  if(['semantic-layout-v2','semantic-layout-v3'].includes(ledger.schemaVersion))return normalizeManuscriptV2(ledger,assets);
  const {source,manuscript:m,contentBinding:binding}=ledger;
  const at={artifactId:binding?.artifactId??'content',pointer:'/manuscript',owner:'content-author',contentHash:binding?.manuscriptHash??null};
  need(source&&m&&binding,'SEMANTIC_ENVELOPE_REQUIRED',at,'Exact source, manuscript and content binding are required');
  need(binding.manuscriptHash===hash(m)&&binding.sourceHash===source.sourceHash,'SEMANTIC_BINDING_CHANGED',at,'Exact manuscript and source hashes are required');
  const {sourceHash,...sourceBody}=source;
  need(sourceHash===hash(sourceBody),'SEMANTIC_SOURCE_CHANGED',at,'Source bytes differ from their binding');
  const allowed=['title','narrativeBlocks','directions','claims','sources','visibleObligations','pageIntents','edits'];
  need(Object.keys(m).every(k=>allowed.includes(k)),'SEMANTIC_UNSUPPORTED_CONTENT',at,'Unknown manuscript fields cannot be silently omitted');
  const fields={narrativeBlocks:['id','kind','text','originIds'],visibleObligations:['originId','value','blockIds','imageIds','pageIntentIds'],edits:['originId','before','after','reason']};
  for(const [collection,keys]of Object.entries(fields))for(const [index,value]of array(m[collection],at).entries())need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key)),'SEMANTIC_UNSUPPORTED_CONTENT',{...at,pointer:`/${collection}/${index}`},'Unknown manuscript fields cannot be silently omitted');
  const origins=indexed(source.obligations,'originId',{...at,pointer:'/source/obligations'});
  for(const o of Object.values(origins))need(validText(o.artifactId)&&validText(o.pointer)&&validText(o.owner),'SEMANTIC_ORIGIN_REQUIRED',at,'Every origin needs the original artifact, pointer and owner');
  const blocks=indexed(m.narrativeBlocks,'id',at),sources=indexed(source.sources,'id',at),images=indexed(source.images,'imageId',at);
  const visible=indexed(m.visibleObligations,'originId',at),intents=indexed(m.pageIntents,'id',at);
  need(validText(m.title)&&Object.keys(blocks).length&&Object.keys(intents).length,'SEMANTIC_MANUSCRIPT_REQUIRED',at,'Complete readable manuscript required');
  need(equal(m.claims,source.claims)&&equal(m.sources,source.sources),'SEMANTIC_CLAIM_SOURCE_CHANGED',at,'Original claims and source records must remain exact');
  const map=array(source.directionMap,at),expected=(source.visual?.payload?.directions??[]).map(d=>({directionId:d.directionId,rendererDirectionId:map.find(x=>x.sourceDirectionId===d.directionId)?.rendererDirectionId,approvedCopy:d.approvedCopy,explanation:d.explanation,presentationIntent:d.presentationIntent,claims:d.claims,limitations:d.limitations,targets:d.targets}));
  need(map.length===3&&unique(map.map(x=>x.sourceDirectionId))&&equal([...map.map(x=>x.rendererDirectionId)].sort(),['A','B','C'])&&expected.length===3&&expected.every(d=>['A','B','C'].includes(d.rendererDirectionId))&&equal(m.directions,expected),'SEMANTIC_DIRECTION_MAPPING',at,'Three exact direction packages and the frozen A/B/C bijection are required');
  array(m.edits,at);
  need(unique(m.edits.map(e=>e.originId)),'SEMANTIC_EDIT_INVALID',at,'Only one approved edit per origin');
  for(const e of m.edits){const o=origins[e.originId];need(o&&typeof o.value==='string'&&e.before===o.value&&validText(e.after)&&validText(e.reason)&&e.before.replace(/[\p{P}\p{Z}\s]/gu,'')===e.after.replace(/[\p{P}\p{Z}\s]/gu,''),'SEMANTIC_UNAUTHORIZED_EDIT',o??at,'Substantive changes must return to their source owner');}
  need(equal(Object.keys(visible).sort(),Object.keys(origins).sort()),'SEMANTIC_OBLIGATION_COVERAGE',at,'Every exact original obligation needs its visible relation');
  const graph={title:m.title,blocksById:{},sourcesById:sources,imagesById:images,obligationsByOrigin:{},claimsByOrigin:{},directionsBySourceId:Object.fromEntries(m.directions.map(d=>[d.directionId,d])),contentBinding:binding,intents:[],authority:'standalone-technical-input-only'};
  for(const [id,b]of Object.entries(blocks)){
    const location={...at,pointer:`/narrativeBlocks/${m.narrativeBlocks.indexOf(b)}`,blockIds:[id],originIds:b.originIds};
    need(validText(b.text)&&['source','transition'].includes(b.kind)&&Array.isArray(b.originIds)&&unique(b.originIds)&&b.originIds.every(id=>origins[id]),'SEMANTIC_BLOCK_INVALID',location,'Exact readable block and known origin IDs required');
    graph.blocksById[id]={...b,location,claimOrigins:[],sourceIds:[]};
  }
  for(const [id,s]of Object.entries(sources))need(Object.values(origins).some(o=>o.kind==='source'&&equal(o.value,s)),'SEMANTIC_SOURCE_RELATION',{...at,pointer:`/sources/${id}`,owner:'copy-lead'},'Every source record needs its original visible obligation');
  const order=Object.keys(blocks);
  for(const [id,i]of Object.entries(intents)){
    const location={...at,pointer:`/pageIntents/${m.pageIntents.indexOf(i)}`,intentId:id};
    need(Object.keys(i).every(k=>['id','centralMessage','heroImageId','blockIds','imageIds','allowedSplitAfterBlockIds'].includes(k)),'SEMANTIC_UNSUPPORTED_INTENT',location,'Unknown intent fields cannot be silently omitted');
    need(validText(i.centralMessage),'SEMANTIC_CENTRAL_MESSAGE_REQUIRED',location,'Exact central message required');
    for(const field of ['blockIds','imageIds','allowedSplitAfterBlockIds']){array(i[field],location);need(unique(i[field]),'SEMANTIC_DUPLICATE_REFERENCE',location,`Duplicate ${field}`);}
    need(i.blockIds.every(id=>blocks[id])&&i.imageIds.every(id=>images[id]&&assets[id]),'SEMANTIC_MISSING_REFERENCE',location,'A block or original image is missing',{blockIds:i.blockIds,imageIds:i.imageIds});
    need(i.blockIds.every((id,n)=>n===0||order.indexOf(id)>order.indexOf(i.blockIds[n-1])),'SEMANTIC_BLOCK_ORDER',location,'Original narrative order must be preserved');
    need(i.heroImageId===null||i.imageIds.includes(i.heroImageId),'SEMANTIC_HERO_MISSING',location,'Hero must be an actual required image');
    need(i.allowedSplitAfterBlockIds.every(id=>i.blockIds.includes(id)),'SEMANTIC_SPLIT_REFERENCE',location,'Split boundary must name an actual block');
    graph.intents.push({...i,location,kind:'narrative',atomicGroups:[],localObligations:[]});
  }
  for(const [originId,o]of Object.entries(origins)){
    need(['text','limitation','claim','direction','restriction','qualification','source','image'].includes(o.kind),'SEMANTIC_UNSUPPORTED_OBLIGATION',o,'Unknown obligation composition requires its source owner');
    const v=visible[originId],edit=m.edits.find(e=>e.originId===originId),value=edit?.after??o.value,loc={...o,originIds:[originId],blockIds:v.blockIds,imageIds:v.imageIds};
    need(equal(v.value,value),'SEMANTIC_OBLIGATION_CHANGED',loc,'Exact approved obligation value required');
    for(const f of ['blockIds','imageIds','pageIntentIds'])array(v[f],loc);
    need(v.pageIntentIds.length&&v.pageIntentIds.every(id=>intents[id]&&v.blockIds.every(b=>intents[id].blockIds.includes(b))&&v.imageIds.every(x=>intents[id].imageIds.includes(x)))&&v.blockIds.every(id=>blocks[id])&&v.imageIds.every(id=>images[id]),'SEMANTIC_OBLIGATION_RELATION',loc,'Original obligation requires actual block, image and intent relations');
    const exact=obligationText({...o,value});
    if(o.kind==='image')need(v.imageIds.includes(o.value.imageId),'SEMANTIC_IMAGE_VIEW_MISSING',loc,'Original required target view must be visible');
    else need(v.blockIds.some(id=>blocks[id].originIds.includes(originId)&&blocks[id].text.includes(exact)),'SEMANTIC_VISIBLE_TEXT_MISSING',loc,'Exact obligation wording needs its approved readable block');
    const leg=[source.strategy,source.copy,source.visual].find(leg=>leg?.artifactId===o.artifactId);
    graph.obligationsByOrigin[originId]={...o,...v,contentHash:leg?.contentHash??null,sourceHash:binding.sourceHash,valueHash:hash(o.value),exactText:exact};
    for(const intent of graph.intents.filter(i=>v.pageIntentIds.includes(i.id))){intent.atomicGroups.push(v.blockIds);if(['limitation','restriction','qualification','source'].includes(o.kind))intent.localObligations.push(originId);}
    if(o.kind==='claim'){
      const claim=o.value;array(claim.evidenceRefs,loc);array(claim.limitations,loc);
      need(validText(claim.text)&&['fact','inference','creative'].includes(claim.kind),'SEMANTIC_CLAIM_INVALID',loc,'Claim kind and exact text required');
      need(claim.evidenceRefs.every(id=>sources[id]),'SEMANTIC_CITATION_MISSING',loc,'Original claim citation does not resolve',{sourceIds:claim.evidenceRefs});
      graph.claimsByOrigin[originId]={...claim,location:loc,blockIds:v.blockIds};
      for(const bid of v.blockIds){graph.blocksById[bid].claimOrigins.push(originId);graph.blocksById[bid].sourceIds.push(...claim.evidenceRefs);}
    }
  }
  for(const [i,c]of source.claims.entries())need(Object.values(graph.claimsByOrigin).some(o=>equal({text:o.text,kind:o.kind,evidenceRefs:o.evidenceRefs,limitations:o.limitations},c)),'SEMANTIC_CLAIM_ORIGIN_MISSING',{...at,pointer:`/source/claims/${i}`,owner:'copy-lead'},'A claim needs its exact original obligation location');
  for(const d of m.directions){
    const loc={artifactId:source.visual?.artifactId??binding.artifactId,pointer:`/directions/${d.directionId}`,owner:'visual-lead'};
    array(d.targets,loc);array(d.claims,loc);array(d.limitations,loc);
    for(const t of d.targets)need(assets[t.imageId]&&images[t.imageId]&&Object.values(graph.obligationsByOrigin).some(o=>o.kind==='image'&&equal(o.value,t))&&graph.intents.some(i=>i.imageIds.includes(t.imageId)),'SEMANTIC_IMAGE_VIEW_MISSING',{...loc,imageIds:[t.imageId]},'Every approved packaging or artwork view must remain visible');
    const copyOrigin=Object.values(graph.obligationsByOrigin).find(o=>o.kind==='direction'&&equal(o.value,d.approvedCopy));
    need(copyOrigin,'SEMANTIC_DIRECTION_COPY_RELATION',{...loc,owner:'copy-lead'},'Direction approved copy needs its original readable obligation relation');
    for(const key of ['explanation','presentationIntent'])need(Object.values(graph.obligationsByOrigin).some(o=>o.artifactId===source.visual.artifactId&&o.pointer===`/directions/${d.directionId}/${key}`&&o.value===d[key]&&o.blockIds.length),'SEMANTIC_DIRECTION_TEXT_RELATION',{...loc,pointer:`${loc.pointer}/${key}`},'Required direction wording needs an approved readable block');
    for(const c of d.claims)need(Object.values(graph.claimsByOrigin).some(o=>equal({text:o.text,kind:o.kind,evidenceRefs:o.evidenceRefs,limitations:o.limitations},c)),'SEMANTIC_CLAIM_ORIGIN_MISSING',loc,'Direction claim needs its original exact obligation');
    for(const limit of d.limitations)need(Object.values(graph.obligationsByOrigin).some(o=>o.value===limit&&o.imageIds.some(id=>d.targets.some(t=>t.imageId===id))),'SEMANTIC_IMAGE_LIMIT_RELATION',loc,'Visual limitation must attach to an affected actual image');
  }
  for(const [id,a]of Object.entries(assets))need(images[id]||(a.role==='mockup'&&Object.entries(assets).some(([key,x])=>images[key]&&x.application?.mockupId===id)),'SEMANTIC_UNDECLARED_IMAGE',{...at,pointer:`/assets/${id}`,owner:'visual-lead',imageIds:[id]},'Asset is neither an original required image nor an explicitly used mockup');
  for(const image of Object.values(images)){
    const a=assets[image.imageId],o=Object.values(origins).find(o=>o.kind==='image'&&o.value.imageId===image.imageId),loc=o??{...at,pointer:'/source/images',owner:'visual-lead',imageIds:[image.imageId]};
    need(a&&a.sha256===image.sha256&&a.width===image.width&&a.height===image.height&&a.byteLength===image.byteLength,'SEMANTIC_IMAGE_BYTES_CHANGED',loc,'Actual decoded original image bytes and dimensions must match');
    need(graph.intents.some(i=>i.imageIds.includes(image.imageId)),'SEMANTIC_IMAGE_ORPHAN',loc,'Every supplied required image needs an intent');
    if(a.application){const mock=assets[a.application.mockupId];need(mock?.role==='mockup'&&mock.purpose===a.application.purpose&&a.application.kind==='rectangular-aperture','SEMANTIC_MOCKUP_PURPOSE',loc,'Only an explicitly matched rectangular aperture application is supported');}
  }
  for(const b of Object.values(graph.blocksById))need(graph.intents.some(i=>i.blockIds.includes(b.id)),'SEMANTIC_BLOCK_ORPHAN',b.location,'Every readable block needs a page intent');
  return graph;
}

export function normalizeLegacy(pages,cases,audience,assets) {
  const blocksById={},intents=[];
  for(const [index,p]of pages.entries()){
    const slots=[];
    const add=(value,pointer)=>{if(typeof value!=='string'||!value)return;const id=`legacy:${p.id}${pointer}`;blocksById[id]={id,text:value,kind:'source',originIds:[id],location:{artifactId:'legacy-ledger',pointer:`/pages/${index}${pointer}`,owner:'content-author'},claimOrigins:[],sourceIds:[]};slots.push(id);};
    for(const f of ['title','sub','takeaway','note'])add(p[f],`/${f}`);
    p.items?.forEach((row,i)=>row.forEach((v,j)=>add(v,`/items/${i}/${j}`)));
    const hint={...p};for(const f of ['title','sub','takeaway','note','items'])delete hint[f];
    intents.push({...hint,slots,slotFields:{...Object.fromEntries(['title','sub','takeaway','note'].filter(f=>p[f]).map(f=>[f,`legacy:${p.id}/${f}`])),...(p.items?{items:p.items.map((r,i)=>r.map((v,j)=>`legacy:${p.id}/items/${i}/${j}`))}:{})},centralMessage:p.title,blockIds:slots,imageIds:[],allowedSplitAfterBlockIds:[]});
  }
  return {blocksById,intents,sourcesById:Object.fromEntries(audience.findings.map(f=>[f.id,f])),claimsByOrigin:{},obligationsByOrigin:{},imagesById:assets,casesById:cases,directionsBySourceId:{},contentBinding:null,authority:'standalone-technical-input-only'};
}
export function resolveIntent(input,intent){
  const page={...intent};
  for(const [field,ref]of Object.entries(intent.slotFields??{}))page[field]=field==='items'?ref.map(row=>row.map(id=>input.semantic.blocksById[id].text)):input.semantic.blocksById[ref].text;
  return page;
}
