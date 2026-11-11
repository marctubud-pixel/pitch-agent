import {verifyPoolContinuation} from './local-reference-pool-intent.mjs';
import {LOCAL_REFERENCE_ENGINEERING_CONTRACT} from './local-reference-engineering-contract.mjs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {prepareLocalAcceptanceRuntime} from './local-acceptance-runtime.mjs';
import {createLocalReferencePoolDriver} from './local-acceptance-reference-pool-driver.mjs';
import {createImageEvidenceStore} from './image-evidence-atomic.mjs';
import {loadLocalAcceptanceAssetCatalogue} from '../local-acceptance/asset-catalogue.mjs';
import {freezeReferenceLibrary} from './reference-library.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {LOCAL_REFERENCE_POOL_RUNTIME} from './local-reference-runtime-profile.mjs';
export {LOCAL_REFERENCE_POOL_RUNTIME} from './local-reference-runtime-profile.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
function requireV2History(project,store){
 const intents=project.referenceIntents??[],known=new Set(intents.map(i=>i.artifactId));
 need(intents.every(i=>i.request?.referencePoolPlan?.protocol==='local-reference-pool-plan-v2'),'LOCAL_POOL_RUNTIME_LEGACY_HISTORY');
 need(known.size===intents.length,'LOCAL_POOL_RUNTIME_MIXED_HISTORY');
 for(const intent of intents){const plan=intent.request.referencePoolPlan,copy=project.artifacts.find(a=>a.id===intent.artifactId);need(intent.request.artifactId===intent.artifactId&&plan.projectId===project.id&&plan.artifactId===intent.artifactId&&copy?.stage==='copy'&&copy.contentHash===plan.copyContentHash,'LOCAL_POOL_RUNTIME_SOURCE_IDENTITY_CHANGED');verifyPoolContinuation(project,plan,revision=>store.read(project.id,revision));}
 need((project.referenceDossiers??[]).every(d=>known.has(d.envelope?.source?.source?.artifactId))&&project.jobs.filter(j=>j.purpose==='reference').every(j=>known.has(j.targetArtifactId)),'LOCAL_POOL_RUNTIME_UNREGISTERED_HISTORY');
}
export async function prepareLocalReferencePoolRuntime(options){
 need(options?.includeReferences===true&&typeof options.projectStore?.list==='function'&&typeof options.projectStore?.read==='function','LOCAL_POOL_RUNTIME_EXPLICIT_REFERENCES_REQUIRED');
 need(options.referenceResponseContract?.version===LOCAL_REFERENCE_ENGINEERING_CONTRACT,'LOCAL_POOL_RUNTIME_ENGINEERING_CONTRACT_REQUIRED');
 for(const row of options.projectStore.list())requireV2History(options.projectStore.read(row.id),options.projectStore);
 const base=await prepareLocalAcceptanceRuntime(options),catalogue=await loadLocalAcceptanceAssetCatalogue(),library=freezeReferenceLibrary(catalogue),descriptor=base.referenceLibraries[library.catalogueDigest];
 need(descriptor?.protocol==='local-reference-library-snapshot-v1'&&descriptor.path===join(options.executionRoot,'reference-libraries',library.catalogueDigest+'.json')&&descriptor.catalogueDigest===library.catalogueDigest&&descriptor.origin==='local-curated-configuration-not-network-capture'&&Number.isSafeInteger(descriptor.byteLength)&&descriptor.byteLength>0,'LOCAL_POOL_RUNTIME_LIBRARY_REQUIRED');
 const bytes=await readManagedLayoutBytes(options.executionRoot,descriptor.path,8*1024*1024);
 need(bytes.length===descriptor.byteLength&&createHash('sha256').update(bytes).digest('hex')===descriptor.sha256&&equal(JSON.parse(bytes.toString('utf8')),library),'LOCAL_POOL_RUNTIME_LIBRARY_CHANGED');
 const imageStore=createImageEvidenceStore({rootDir:join(options.executionRoot,'images')}),references=createLocalReferencePoolDriver({projectStore:options.projectStore,executor:base.executor,imageStore,executionRoot:options.executionRoot,assetCatalogue:catalogue,configuration:{referenceLibrary:library}});
 return {...base,imageStore,drivers:{...base.drivers,references},referenceRuntimeProfile:LOCAL_REFERENCE_POOL_RUNTIME,imageStoreProfile:'atomic-supplied-originals-v1',syntheticOnly:true,realQualityVerified:false,wholeReferenceGraphVerified:false};
}
