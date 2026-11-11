import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '../auto-layout/node_modules/@napi-rs/canvas/index.js';
import {numericManuscript} from './content-numeric-runtime-fixture.mjs';
import {makeProjectedContentSource,contentSourceLocations} from './complete-content.mjs';
import {freezeLayoutInput,layoutHash as hash} from './layout-boundary.mjs';
import {createSemanticLayoutRuntime} from './layout-semantic-runtime.mjs';
import {layoutRendererIdentity} from './layout-renderer.mjs';
const clone=structuredClone;
// This is an explicitly standalone geometry/resource adapter. It grants no content, visual, or human authority.
export async function exerciseNumericSemanticResources(p,originalSource,root){
 await mkdir(root,{recursive:true});
 const basis=clone(originalSource.immutableBasis),images=new Map(),resources=[];
 const save=async(id,kind,path,bytes)=>{await writeFile(path,bytes);resources.push({id,kind,path,sha256:hash(bytes),byteLength:bytes.length});};
 for(const [index,original]of basis.images.entries()){
  const canvas=createCanvas(64,64),ctx=canvas.getContext('2d');ctx.fillStyle=['#3355aa','#55aa77','#aa7733'][index%3];ctx.fillRect(0,0,64,64);
  const bytes=canvas.toBuffer('image/png'),path=join(root,`pure-${index}.png`),image={...original,sha256:hash(bytes),byteLength:bytes.length,width:64,height:64};
  images.set(original.imageId,{descriptor:image,path});await save(original.imageId,'image',path,bytes);
 }
 const update=value=>{if(!value||typeof value!=='object')return;const image=images.get(value.imageId);if(image)for(const key of ['sha256','byteLength','width','height','mediaType'])value[key]=image.descriptor[key];for(const child of Object.values(value))update(child);};
 update(basis);basis.visual.contentHash=hash(basis.visual.payload);basis.visualLeg.payloadHash=hash(basis.visual.payload);
 basis.processHash=hash({strategy:basis.processArchive.strategy,copy:basis.processArchive.copy,visual:basis.processArchive.visual,feedback:[]});delete basis.sourceHash;basis.sourceHash=hash(basis);
 const source=makeProjectedContentSource(p,basis),manuscript=numericManuscript(source),rootJobId='pure-standalone-numeric-resource-root',artifactId='pure-standalone-numeric-resource-artifact';
 const ownerReports={producer:{raw:{decision:'accept',fixture:'Standalone content boundary adapter only.'}},consumer:{raw:{decision:'accept',fixture:'Standalone layout boundary adapter only.'}}};
 const contract={artifactId,rootJobId,packetVersion:'content-packet-v4',sourceHash:source.sourceHash,manuscriptHash:hash(manuscript),projectionHash:source.visibility.projectionHash,manuscript,sourceLocationVersion:'content-source-location-v2',sourceLocations:contentSourceLocations({id:rootJobId,task:{packetVersion:'content-packet-v4',source}}),requiredImageIds:source.images.map(i=>i.imageId),layoutAcceptance:ownerReports.consumer};
 const fontPaths=[];
 for(const face of ['Regular','Semibold']){
  const name=`PingFangSC-${face}.ttf`,path=join(root,name),origin=fileURLToPath(new URL(`../../output/ppt/m6-integrated-v5/build/${name}`,import.meta.url));
  await copyFile(origin,path);const bytes=await readFile(path);resources.push({id:`font-${face}`,kind:'font',path,sha256:hash(bytes),byteLength:bytes.length});fontPaths.push(path);
 }
 const brand={name:'Standalone numeric resource fixture',colors:{paper:'#ffffff',ink:'#111111',primary:'#112233',muted:'#444444',accent:'#bb9900'},font:{family:'PingFang SC',files:fontPaths},minBodySize:22};
 const assets={assets:Object.fromEntries([...images].map(([id,{path}])=>[id,{file:path,role:'art',source:{type:'synthetic engineering fixture',description:'Solid local PNG. No visual production or quality approval.'}}]))};
 await save('brand','brand',join(root,'brand.json'),Buffer.from(JSON.stringify(brand)));await save('assets','assets',join(root,'assets.json'),Buffer.from(JSON.stringify(assets)));
 const renderer=await layoutRendererIdentity(),trusted={contract,source,manuscriptText:JSON.stringify(manuscript),contentHash:hash(JSON.stringify(manuscript)),ownerReports,resources};
 const prepared=freezeLayoutInput(p,trusted,{version:'project-layout-boundary-v1',semanticVersion:'semantic-layout-v3',renderer});
 const state={id:p.id,revision:1,jobs:[{id:'pure-semantic-layout-job',purpose:'layout_export',task:{binding:prepared.binding,input:prepared}}]};
 let checks=0;
 const run=createSemanticLayoutRuntime({store:{read:()=>state},root,content:{async verifyLayoutPreparation(id,input){assert.equal(id,p.id);assert.deepEqual(input,prepared);checks++;}}});
 const first=await run(p.id);assert.equal(first.status,'semantic_plans_ready');assert.equal(first.exportAvailable,false);assert.equal(first.finalAuthorityAvailable,false);assert.equal(first.plans.length,3);
 for(const edition of first.plans){assert.equal(edition.chartOccurrences,source.chartContent.charts.length);assert.ok(edition.plan.slides.some(s=>s.elements.some(e=>e.type==='chart')));}
 const again=await run(p.id);assert.deepEqual(again.plans.map(p=>p.sha256),first.plans.map(p=>p.sha256));assert.equal(checks,4);
 const bytes=await readFile(first.plans[0].path);try{await writeFile(first.plans[0].path,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(()=>run(p.id),{code:'LAYOUT_SEMANTIC_PLAN_CHANGED'});}finally{await writeFile(first.plans[0].path,bytes);}
 const image=resources.find(r=>r.kind==='image'),original=await readFile(image.path);try{await writeFile(image.path,Buffer.concat([original,Buffer.from(' ')]));await assert.rejects(()=>run(p.id),{code:'LAYOUT_RESOURCE_BYTES_CHANGED'});}finally{await writeFile(image.path,original);}
 assert.throws(()=>freezeLayoutInput(p,trusted,{version:'project-layout-boundary-v1',semanticVersion:'semantic-layout-v3',renderer,execution:{}}),{code:'LAYOUT_NATIVE_CONFIGURATION_REQUIRED'});
 return {scope:'standalone content authority adapter only; actual managed resources, image decode, font inspection and three plans',styles:first.plans.map(p=>({style:p.style,sha256:p.sha256,slides:p.slides,chartOccurrences:p.chartOccurrences})),nativeExport:false};
}
