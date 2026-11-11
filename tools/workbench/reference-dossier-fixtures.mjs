import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {openStore} from './store.mjs';
import {prepareStrategy,panelFixtureOutput} from './owner-edge-fixtures.mjs';
import {COPY_CREATIVE_PROTOCOL} from './creative-panel.mjs';
import {createExecutor} from './executor.mjs';
import {imageManifest} from './image-evidence.mjs';
import {referenceHash as hash} from './reference-review.mjs';
import {REFERENCE_DOSSIER_PROTOCOL,referenceRestrictions} from './reference-dossier.mjs';

export function referenceProductionFixture(input){
 const common={protocolVersion:REFERENCE_DOSSIER_PROTOCOL,dossierId:input.dossierId,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,kind:input.kind,decision:'accept',findings:[],limitations:['Synthetic development response; no business or aesthetic acceptance.']};
 if(input.kind==='assignment')return {...common,assignment:{lead:'reference-lead',directions:input.envelope.directionIds,objective:'Explore bounded visual borrowing for the confirmed copy.',acceptance:'Multiple originals, full independent scope review and exact source limits.'}};
 if(['copy-owner','reference-owner'].includes(input.kind))return {...common,copyUnderstanding:input.envelope.source.source.content.directions.map(d=>({directionId:d.id,headline:d.slogan,supportingCopy:d.supportingCopy,explanation:d.creativeExplanation,deliveryMeaning:'Retain the exact public text as a bounded creative hypothesis.'})),understanding:'Read complete current copy, original negatives and evidence; keep public copy separate from explanation.',permittedUses:['Visual inspiration only'],prohibitedInferences:['No consumer preference or effect claims'],retainedRestrictions:referenceRestrictions(input.envelope.source)};
 if(input.kind==='plan')return {...common,cards:input.envelope.directionIds.map((directionId,i)=>({directionId,category:['steady_continuation','product_characteristic','user_atmosphere'][i],categoryMappingReason:'Preserves provided copy semantics as a hypothesis.',headlinePointer:`/source/content/directions/${i}/slogan`,supportingCopyPointer:`/source/content/directions/${i}/supportingCopy`,explanationPointer:`/source/content/directions/${i}/creativeExplanation`,coreClaim:input.envelope.source.source.content.directions[i].slogan,brandExpression:'Proposed calm visual expression',occasionBasis:'Occasion remains a creative hypothesis, no verified audience finding.',protagonist:'Product on a shared table',visualProblem:'Carry exact original copy',mechanism:'Mechanism '+i,siblingDifferences:'Different mechanism '+i,queries:input.envelope.configuration.discoveryMode==='manual_supplied'?[]:[`direction ${i} composition`,`direction ${i} material`],exclusions:['No direct copying'],allowedBorrowing:'Only declared composition and material methods'}))};
 if(input.kind==='collector'){let uses=input.images.map((image,i)=>({id:`${input.directionId}-use-${i}`,imageId:image.imageId,directionId:input.directionId,kind:'direction',applicabilityProfile:'direction',visibleRegion:'Central region',mechanism:`Visible geometry ${input.directionId} ${i}`,targetCarrier:'Packaging proposal',translation:'Use visible spacing on the target packaging to express the confirmed social invitation.',comparisonScope:'Only the two captured candidates in this direction',innovationHypothesis:`Test geometry ${input.directionId} ${i} against the declared sibling candidate`,prohibitedCopying:'Do not copy original brand, artwork, logo or complete structure.',uncertainties:['Synthetic fixture; no aesthetic validation.']}));
 const materials=input.manualMaterials??[];if(materials.length)uses=materials.map(m=>{const base=uses.find(u=>input.images.find(i=>i.imageId===u.imageId)?.sha256===m.image.sha256);return {...base,id:`manual-use-${m.id}`,materialId:m.id,borrowingNote:m.borrowingNote,kind:m.kind,applicabilityProfile:m.applicabilityProfile};});
 return {...common,images:input.images,uses,materialDecisions:materials.map(m=>({materialId:m.id,disposition:'adopt',useIds:[`manual-use-${m.id}`],reason:'Synthetic development lead proposal accounting only.'}))};}
 return {...common,acceptedUseIds:input.collectorReport.uses.map(u=>u.id),returnedUseIds:[],mechanismComparison:'Each captured original supports a different proposed mechanism.',images:input.images};
}
export function referenceFixturePng(index){const crc=bytes=>{let x=0xffffffff;for(const b of bytes){x^=b;for(let j=0;j<8;j++)x=(x>>>1)^((x&1)?0xedb88320:0);}return (x^0xffffffff)>>>0;};const chunk=(name,body)=>{const type=Buffer.from(name),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(body.length);sum.writeUInt32BE(crc(Buffer.concat([type,body])));return Buffer.concat([length,type,body,sum]);};const header=Buffer.alloc(13);header.writeUInt32BE(24,0);header.writeUInt32BE(24,4);header[8]=8;header[9]=2;const pixels=Buffer.alloc(24*(1+24*3));for(let y=0;y<24;y++)for(let x=0;x<24;x++){const n=y*73+1+x*3;pixels[n]=(index*31+x*7)%256;pixels[n+1]=(y*9+index*47)%256;pixels[n+2]=(x+y+index*67)%256;}return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);}
export async function referenceFixture(t,{gates=[],budget,providerHandler,reviewOutput,duplicateImages=false,retainRoot=false}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'reference-dossier-test-'))),store=openStore(join(root,'db'));
 t.after(async()=>{store.close();if(!retainRoot)await rm(root,{recursive:true,force:true});});
 const initialBindings=Object.fromEntries(['copy','brand','user','communication'].flatMap(role=>[`creative_score_${role}`,`creative_opposition_${role}`]).map(role=>[role,{providerId:'synthetic',model:'synthetic',role:role+'-lead'}]));
 const f=await prepareStrategy({store,root,gates,initialBindings});
 await f.executor.continueStrategy('p',f.request());for(let i=0;i<5;i++)for(const id of await f.executor.advanceOwnerEdges('p')){const j=store.read('p').jobs.find(j=>j.id===id);const done=await f.executor.execute('p',j.id);if(done.status!=='succeeded')throw new Error(JSON.stringify(done.error));}
 const copyId=store.read('p').activeByStage.copy;
 const evidenceRef=join(root,'copy-calibration.json');await writeFile(evidenceRef,'synthetic development calibration');
 f.creativeCalibrations.push(...['copy','brand','user','communication'].map(role=>({protocolVersion:COPY_CREATIVE_PROTOCOL,stage:'copy',role,providerId:'synthetic',model:'synthetic',evidenceRef,evidenceHash:hash('synthetic development calibration')})));
 let executor=createExecutor({store,rootDir:root,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations});
 const verified=await executor.execute('p',await executor.enqueueVerification('p',copyId));if(verified.status!=='succeeded')throw new Error(JSON.stringify(verified.error));
 await executor.enqueueCreativePanel('p',{artifactId:copyId,commandId:randomUUID(),expectedRevision:store.read('p').revision});
 for(let n=0;n<6;n++)for(const id of executor.advanceCreativePanels('p')){const result=await executor.execute('p',id);if(result.status!=='succeeded')throw new Error(JSON.stringify(result.error));}
 const calls=[],transportCalls=[],bindingNames=['reference_director','reference_lead','reference_collector','reference_review_director',...['visual','brand','user','communication'].flatMap(r=>[`reference_score_${r}`,`reference_opposition_${r}`])];
 for(const role of bindingNames)f.bindings[role]={providerId:'reference-synthetic',model:'synthetic',role:role==='reference_lead'?'references-lead':role};
 const configuration={capability:{transport:'experimental_public_http',status:'available',evidenceRef:'offline-development-fixture'},budget:budget??{maxModelCalls:129,maxSearchCalls:6},calibrations:[]};
 const inputOf=request=>JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
 const original=f.providers.synthetic.execute;
 const referenceExecute=async request=>{const input=inputOf(request);if(input.protocolVersion!==REFERENCE_DOSSIER_PROTOCOL&&input.protocolVersion!=='reference-pixel-review-v1')return original(request);
   const call={input,request,started:performance.now()};calls.push(call);
   let output=input.protocolVersion===REFERENCE_DOSSIER_PROTOCOL?referenceProductionFixture(input):reviewOutput(input);
   if(providerHandler)output=await providerHandler(input,request,output);call.ended=performance.now();
   return {...(request.images?.length?{images:request.images}:{}),runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema,...(request.images?.length?{images:imageManifest(request.images)}:{})})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output,cost:null};
 };
 f.providers.synthetic={model:'synthetic',execute:referenceExecute};f.providers['reference-synthetic']={model:'synthetic',execute:referenceExecute};
 const acquisitionDependencies={lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async({url})=>{transportCalls.push(url.href);let body,contentType='text/html; charset=utf-8';if(url.hostname==='lite.duckduckgo.com'){const index=Number(url.searchParams.get('q').match(/direction (\d)/)[1]);body=`<a class="result-link" href="https://design.example.org/direction-${index}">Original source ${index}</a>`;}else if(url.pathname.startsWith('/direction-')){const index=Number(url.pathname.at(-1));body=[0,1].map(n=>`<img src="https://design.example.org/image-${index*2+n}.png" alt="Synthetic geometry ${n}">`).join('');}else{contentType='image/png';body=referenceFixturePng(duplicateImages?0:Number(url.pathname.match(/image-(\d)/)[1]));}return {status:200,headers:{'content-type':contentType},body:Buffer.isBuffer(body)?body:Buffer.from(body)};}};
 const makeExecutor=()=>createExecutor({store,rootDir:root,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations,referenceConfiguration:configuration,acquisitionDependencies});executor=makeExecutor();
 return {...f,copyId,executor,makeExecutor,configuration,acquisitionDependencies,calls,transportCalls,request:()=>({artifactId:copyId,commandId:randomUUID(),expectedRevision:store.read('p').revision})};
}
