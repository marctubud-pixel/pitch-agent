import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {readVerifiedEngineeringFinal} from './local-engineering-panel.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {materializeTypedEditorResource,readPinnedEditorResource} from './local-editor-typed-resources.mjs';
import {readNativeManifest} from '../auto-layout/native-manifest.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const clone=structuredClone;
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const fields={text:['text','size','color','bold','align','lineSpacing'],image:['assetId','fit','alt'],line:['color','width'],ellipse:['color','width','fill'],chart:['chartRef','chartSourceId','metadataOrigins','minimumLabelSize']};
const common=['id','type','x','y','w','h','sourceText','wrapBreaks','role','contentRefs','imageId','occurrenceId','centralImageIntentId'];
export function normalizeNativeEditorPlan(manifest,{style='editorial'}={}){
 need(style==='editorial'&&manifest.style===style,'LOCAL_EDITOR_STYLE_UNSUPPORTED');
 need(Number.isFinite(manifest.width)&&Number.isFinite(manifest.height)&&Array.isArray(manifest.slides)&&manifest.slides.length>0,'LOCAL_EDITOR_NATIVE_PLAN_REQUIRED');
 return {width:manifest.width,height:manifest.height,slides:manifest.slides.map((slide,index)=>({...clone(slide),elements:slide.elements.map((element,n)=>{
  need(fields[element.type]&&Object.keys(element).every(k=>common.includes(k)||fields[element.type].includes(k)),'LOCAL_EDITOR_NATIVE_ELEMENT_UNSUPPORTED');
  return {...clone(element),id:element.id??`native-${index}-${n}`};
 })}))};
}
export function buildEngineeringEditorBinding(project,record,verifiedFinal,{style='editorial'}={}){
 need(style==='editorial','LOCAL_EDITOR_STYLE_UNSUPPORTED');const proof=readVerifiedEngineeringFinal(verifiedFinal,{project}),v=proof.value;
 need(record?.caseId===v.caseId&&record.projectId===project.id&&v.projectId===project.id&&v.projectRevision===project.revision,'LOCAL_EDITOR_CASE_CHANGED');
 return {schemaVersion:'local-acceptance-editor-binding-v2',caseId:v.caseId,projectId:project.id,projectRevision:project.revision,artifacts:Object.entries(project.activeByStage).sort(([a],[b])=>a.localeCompare(b)).map(([stage,id])=>{const a=project.artifacts.find(a=>a.id===id);need(a,'LOCAL_EDITOR_ACTIVE_ARTIFACT_REQUIRED');return {stage,id,contentHash:a.contentHash};}),style,content:clone(v.content),layout:clone(v.layout),sourceBindingHash:v.sourceBindingHash,sourceEvidenceHash:v.sourceEvidenceHash,localReviewEvidenceHash:v.localReviewEvidenceHash,acceptanceKind:'local_engineering_acceptance',productionFinalAuthority:false};
}
export function assertEditorSourceBindingFields(binding,project){
 need(binding?.schemaVersion==='local-acceptance-editor-binding-v2'&&binding.projectId===project.id&&binding.projectRevision===project.revision,'LOCAL_EDITOR_SOURCE_CHANGED');
 const actual=Object.entries(project.activeByStage).sort(([a],[b])=>a.localeCompare(b)).map(([stage,id])=>{const a=project.artifacts.find(a=>a.id===id);return {stage,id,contentHash:a?.contentHash};});need(equal(binding.artifacts,actual),'LOCAL_EDITOR_SOURCE_CHANGED');
 const content=project.artifacts.find(a=>a.id===project.activeByStage.content_review),root=project.jobs.find(j=>j.id===binding.layout?.rootJobId);
 need(content?.id===binding.content?.artifactId&&content.contentHash===binding.content.contentHash&&content.completeContent?.rootJobId===binding.content.rootJobId&&root?.purpose==='layout_export'&&root.task.bindingHash===binding.layout.bindingHash,'LOCAL_EDITOR_SOURCE_CHANGED');
 need(binding.layout.editions.length===3&&new Set(binding.layout.editions.map(e=>e.style)).size===3&&['editorial','stage','evidence'].every(style=>binding.layout.editions.some(e=>e.style===style)),'LOCAL_EDITOR_SOURCE_CHANGED');
 for(const edition of binding.layout.editions){const job=project.jobs.find(j=>j.id===edition.jobId);need(job?.status==='succeeded'&&job.task.style===edition.style&&job.receipt?.bindingHash===binding.layout.bindingHash&&sha(job.receipt)===edition.receiptHash,'LOCAL_EDITOR_SOURCE_CHANGED');}
 return binding;
}
export function engineeringEditorDocumentId(binding){need(binding?.schemaVersion==='local-acceptance-editor-binding-v2'&&binding.acceptanceKind==='local_engineering_acceptance'&&binding.productionFinalAuthority===false,'LOCAL_EDITOR_BINDING_REQUIRED');return 'engineering-'+sha(binding);}
async function exactBytes(root,descriptor){need(descriptor&&typeof descriptor.path==='string'&&Number.isSafeInteger(descriptor.byteLength)&&descriptor.byteLength>0&&/^[a-f0-9]{64}$/.test(descriptor.sha256),'LOCAL_EDITOR_RESOURCE_DESCRIPTOR_REQUIRED');const bytes=await readManagedLayoutBytes(root,descriptor.path,descriptor.byteLength);need(bytes.length===descriptor.byteLength&&sha(bytes)===descriptor.sha256,'LOCAL_EDITOR_RESOURCE_CHANGED');return bytes;}
export function createEngineeringEditorBridge({editableStore,executionRoot,editableResourceRoot,pythonBinary='python3'}={}){
 need(typeof editableStore?.create==='function'&&typeof editableStore?.read==='function'&&typeof executionRoot==='string'&&typeof editableResourceRoot==='string','LOCAL_EDITOR_BRIDGE_DEPENDENCIES_REQUIRED');
 return async function bridge({project,case:record,verifiedFinal,sourceBinding,style='editorial'}){
  const binding=buildEngineeringEditorBinding(project,record,verifiedFinal,{style});need(equal(sourceBinding,binding),'LOCAL_EDITOR_BINDING_CHANGED');assertEditorSourceBindingFields(binding,project);const proof=readVerifiedEngineeringFinal(verifiedFinal,{project}),snapshot=proof.fact.snapshot,edition=snapshot.editions.value.find(e=>e.style===style);need(edition,'LOCAL_EDITOR_NATIVE_EDITION_REQUIRED');
  const manifestBytes=await exactBytes(executionRoot,{path:edition.layoutManifest.originalPath,sha256:edition.layoutManifest.sha256,byteLength:edition.layoutManifest.bytes}),decoded=readNativeManifest(manifestBytes,{sha256:edition.layoutManifest.sha256,bytes:edition.layoutManifest.bytes}),manifest=decoded.manifest;need(manifest.imageResources&&manifest.semanticContent?.source&&manifest.inputHashes?.fonts,'LOCAL_EDITOR_NATIVE_MANIFEST_REQUIRED');const plan=normalizeNativeEditorPlan(manifest,{style});
  const resources=snapshot.layout.exactBinding.resources,brandDescriptor=resources.find(r=>r.kind==='brand'),assetsDescriptor=resources.find(r=>r.kind==='assets');need(brandDescriptor&&assetsDescriptor,'LOCAL_EDITOR_NATIVE_RESOURCES_REQUIRED');
  const brandOriginal=await readPinnedEditorResource({executionRoot,pin:brandDescriptor}),assetsOriginal=await readPinnedEditorResource({executionRoot,pin:assetsDescriptor}),brand=JSON.parse(brandOriginal.bytes),assets=JSON.parse(assetsOriginal.bytes),expectedMetadata=[brandOriginal.descriptor,assetsOriginal.descriptor],expectedFonts=[],expectedAssets={},typedFonts=[];need(typeof brand.font?.family==='string'&&Array.isArray(brand.font.files)&&brand.font.files.length>0&&assets.assets&&typeof assets.assets==='object','LOCAL_EDITOR_NATIVE_RESOURCES_REQUIRED');
  const fontFiles=brand.font.files.map(file=>resolve(dirname(brandDescriptor.path),typeof file==='string'?file:file.path??file.file));
  for(const path of fontFiles){const record=resources.find(r=>r.kind==='font'&&r.path===path);need(record&&manifest.inputHashes.fonts[path]===record.sha256,'LOCAL_EDITOR_FONT_IDENTITY_CHANGED');const measured=await readPinnedEditorResource({executionRoot,pin:record}),typed=await materializeTypedEditorResource({executionRoot,descriptor:measured.descriptor,kind:'font',pythonBinary});typedFonts.push(typed.path);expectedFonts.push(measured.descriptor);}
  const inputAssets={};
  for(const slide of plan.slides)for(const element of slide.elements)if(element.type==='image'&&!inputAssets[element.assetId]){
   const asset=assets.assets[element.assetId],original=manifest.imageResources[element.assetId];need(asset&&original,'LOCAL_EDITOR_IMAGE_IDENTITY_REQUIRED');const path=resolve(dirname(assetsDescriptor.path),asset.file);need(path===original.file,'LOCAL_EDITOR_IMAGE_PATH_CHANGED');
   const expected={path,sha256:original.sha256,byteLength:original.byteLength};await exactBytes(executionRoot,expected);const typed=await materializeTypedEditorResource({executionRoot,descriptor:{...expected,width:original.width,height:original.height},kind:'image',pythonBinary});expectedAssets[element.assetId]=expected;inputAssets[element.assetId]={...clone(asset),file:typed.path};
  }
  const input={brand:{...clone(brand),font:{...clone(brand.font),files:typedFonts}},assets:inputAssets,semantic:clone(manifest.semanticContent)};
  const id=engineeringEditorDocumentId(binding);
  async function validateSaved(){const initial=editableStore.read(id,1),head=editableStore.read(id),basePlan=clone(initial.plan);for(const slide of basePlan.slides)for(const element of slide.elements)if(element.type==='chart'){delete element.chartSource;delete element.chartData;delete element.chartDataState;}need(equal(basePlan,plan),'LOCAL_EDITOR_IMPORTED_PLAN_CHANGED');need(equal(initial.sourceBinding,binding)&&equal(head.sourceBinding,binding)&&head.finalAuthority===false&&head.status==='draft_requires_review','LOCAL_EDITOR_SAVED_BINDING_CHANGED');
   need(initial.input.brand.font.files.length===expectedFonts.length,'LOCAL_EDITOR_SAVED_FONT_CHANGED');
   for(const [n,font]of initial.input.brand.font.files.entries()){const expected=expectedFonts[n];need(font.sha256===expected.sha256&&font.byteLength===expected.byteLength,'LOCAL_EDITOR_SAVED_FONT_CHANGED');await exactBytes(editableResourceRoot,{path:font.file,sha256:expected.sha256,byteLength:expected.byteLength});}
   for(const [assetId,expected]of Object.entries(expectedAssets)){const saved=initial.input.assets[assetId];need(saved?.sha256===expected.sha256&&saved.byteLength===expected.byteLength,'LOCAL_EDITOR_SAVED_IMAGE_CHANGED');await exactBytes(editableResourceRoot,{path:saved.file,sha256:expected.sha256,byteLength:expected.byteLength});}
   for(const original of [...expectedMetadata,...expectedFonts,...Object.values(expectedAssets)])await exactBytes(executionRoot,original);readVerifiedEngineeringFinal(verifiedFinal,{project});assertEditorSourceBindingFields(binding,project);return head;}
  try{editableStore.read(id);const head=await validateSaved();return {documentId:id,revision:head.revision,reused:true,status:head.status,finalAuthority:false};}catch(e){if(e.code!=='DRAFT_NOT_FOUND')throw e;}
  readVerifiedEngineeringFinal(verifiedFinal,{project});
  try{await editableStore.create({id,plan,input,sourceBinding:binding});}catch(e){if(e.code!=='DRAFT_EXISTS')throw e;}
  const head=await validateSaved();for(const expected of [...expectedFonts,...Object.values(expectedAssets)])await exactBytes(executionRoot,expected);readVerifiedEngineeringFinal(verifiedFinal,{project});
  return {documentId:id,revision:head.revision,reused:false,status:head.status,finalAuthority:false};
 };
}
