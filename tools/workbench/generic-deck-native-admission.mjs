import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {assertStoreReadAdmission} from './store.mjs';
import {DomainError,copyDeliveryEnvelope} from './project.mjs';
import {readArtifactLineageContents} from './artifact-content.mjs';
import {briefVisualRequirements} from './brief-visual-requirements.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {createCurrentCopySourceOriginalReceiver} from './current-copy-source-original-receiver.mjs';
import {createBPhysicalOriginalReceiver} from './generic-deck-b-original-receiver.mjs';
import {requireLoadedImplementation,selectDeckDatabase,assertDeckDatabase} from './generic-deck-source-identity.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const need=(ok,code)=>{if(!ok)throw new DomainError(code,code);};
const keys=['projectId','expectedRevision','taskCardId','policyVersion','copyArtifactId','copyContentHash','sourceHash','visualArtifactId','visualContentHash'].sort();
const limits=Object.freeze({readAttempts:2,snapshotBytes:64*1024*1024,decodedBytes:128*1024*1024,storedBytes:128*1024*1024});
/** Native source qualification only; no builder/renderer, prelayout or final approval. */
export function createGenericDeckNativeAdmission(configuration){
 need(configuration&&equal(Object.keys(configuration).sort(),['consumerBinding','dbPath','executionRoot','imageRoot','pin','store']),'DECK_ADMISSION_CONFIGURATION_INVALID');
 const {store,executionRoot,imageRoot,consumerBinding,dbPath,pin}=configuration;
 const selectedDatabase=selectDeckDatabase(store,dbPath,pin),database=()=>assertDeckDatabase(store,selectedDatabase);
 const copyReceiver=createCurrentCopySourceOriginalReceiver({store,executionRoot,consumerBinding});
 const bReceiver=createBPhysicalOriginalReceiver({store,executionRoot,imageRoot,dbPath,pin:selectedDatabasePin()});
 function selectedDatabasePin(){return {dev:selectedDatabase.dev,ino:selectedDatabase.ino};}
 const imageStore=createImageEvidenceStore({rootDir:imageRoot}),owned=new WeakMap();let closed=false;
 function requestIdentity(request){need(request&&equal(Object.keys(request).sort(),keys),'DECK_ADMISSION_REQUEST_INVALID');need((request.visualArtifactId===null&&request.visualContentHash===null)||(typeof request.visualArtifactId==='string'&&request.visualArtifactId.trim()&&typeof request.visualContentHash==='string'&&/^[a-f0-9]{64}$/.test(request.visualContentHash)),'DECK_ADMISSION_REQUEST_INVALID');return structuredClone(request);}
 async function inspect(request){
  need(!closed,'DECK_ADMISSION_CLOSED');database();await requireLoadedImplementation();
  const {visualArtifactId,visualContentHash,...copyRequest}=request;
  database();const token=await copyReceiver.capture(copyRequest);database();const proof=await copyReceiver.assertCurrent(token);database();
  let prefix;
  database();const admitted=await store.withReadAdmission(request.projectId,limits,async()=>{
   database();assertStoreReadAdmission(store,request.projectId);const p=store.read(request.projectId);
   need(hash(p)===proof.identity.snapshotHash&&p.revision===request.expectedRevision,'DECK_ADMISSION_SNAPSHOT_CHANGED');
   need((p.activeByStage.visual??null)===visualArtifactId,'DECK_ADMISSION_VISUAL_CHANGED');
   const contents=await readArtifactLineageContents(p,request.copyArtifactId,proof.identity.executionRoot),source=copyDeliveryEnvelope(p,request.copyArtifactId,contents,consumerBinding);
   need(equal(source,proof.source),'DECK_ADMISSION_SOURCE_CHANGED');
   const task=p.taskCards.find(t=>t.id===request.taskCardId),sources={task:{kind:'native_snapshot_task',taskCardId:task.id,sha256:hash(task),originalText:JSON.stringify(task)},research:null,simple:null,copy:null,visual:null};
   for(const [slot,stage] of [['research','research'],['simple','strategy'],['copy','copy']]){const a=p.artifacts.find(a=>a.id===p.activeByStage[stage]),body=contents.find(c=>c.artifactId===a?.id);need(a&&body&&hash(body.contentText)===a.contentHash,'DECK_ADMISSION_LINEAGE_REQUIRED');sources[slot]={artifactId:a.id,stage,taskCardId:task.id,sha256:a.contentHash,bytes:Buffer.byteLength(body.contentText),originalText:body.contentText};}
   const afterContents=await readArtifactLineageContents(p,request.copyArtifactId,proof.identity.executionRoot),after=store.read(p.id);
   need(hash(after)===proof.identity.snapshotHash&&equal(contents,afterContents),'DECK_ADMISSION_SNAPSHOT_CHANGED');
   database();prefix={identity:{...proof.identity,openedFileIdentity:selectedDatabase},sources,typedViews:briefVisualRequirements(task),originalEvidence:proof.evidence};return prefix;
  });
  database();need(admitted.kind==='complete',admitted.code??'DECK_ADMISSION_READ_FAILED');need(prefix&&admitted.value===prefix,'DECK_ADMISSION_NATIVE_CALLBACK_REQUIRED');need(!closed,'DECK_ADMISSION_CLOSED');
  async function finalSnapshot(){
   database();let checked=false;const end=await store.withReadAdmission(request.projectId,{...limits,readAttempts:1},()=>{database();assertStoreReadAdmission(store,request.projectId);need(hash(store.read(request.projectId))===proof.identity.snapshotHash,'DECK_ADMISSION_SNAPSHOT_CHANGED');database();checked=true;return true;});database();need(checked&&end.kind==='complete'&&end.value===true,'DECK_ADMISSION_SNAPSHOT_CHANGED');need(!closed,'DECK_ADMISSION_CLOSED');
  }
  const common={protocol:'native-deck-sources-v3',executionAllowed:false,semanticApproval:false,humanApproval:false,layoutAdmission:'prelayout_not_checked',scope:'Native physical sources only; not layout completion or final delivery approval. Diagnostic JSON is not reusable authority.'};
  if(visualArtifactId===null){database();await copyReceiver.assertCurrent(token);database();await finalSnapshot();return {diagnostic:{...common,kind:'rejected',input:null,blockers:[{code:'DECK_B_FINAL_REQUIRED',scope:'visual'}],verifiedPrefix:prefix,physicalOriginalsVerified:false},bToken:null};}
  const bRequest={projectId:request.projectId,expectedRevision:request.expectedRevision,taskCardId:request.taskCardId,policyVersion:request.policyVersion,snapshotHash:proof.identity.snapshotHash,visualArtifactId,visualContentHash};
  const bToken=await bReceiver.capture(bRequest),b=bReceiver.read(bToken);
  need(b.identity.snapshotHash===prefix.identity.snapshotHash&&equal(b.typedViews,prefix.typedViews)&&equal(b.identity.researchMethod,prefix.identity.method),'DECK_ADMISSION_SOURCE_CHANGED');
  database();await copyReceiver.assertCurrent(token);database();await bReceiver.assertCurrent(bToken);database();await requireLoadedImplementation();await finalSnapshot();
  const sources={...prefix.sources,visual:b.source};
  const diagnostic={...common,kind:'sources_read',physicalOriginalsVerified:true,identity:{...prefix.identity,b:b.identity},sources,typedViews:b.typedViews,directionIds:b.directionIds,targets:b.targets,images:b.images,originalEvidence:{prefix:prefix.originalEvidence,b:b.evidence}};
  return {diagnostic,bToken};
 }
 async function recheck(token){const prior=saved(token),current=await inspect(prior.request);database();need(equal(prior.diagnostic,current.diagnostic),'DECK_ADMISSION_SOURCE_CHANGED');return structuredClone(current.diagnostic);}
 function saved(token){database();need(!closed,'DECK_ADMISSION_CLOSED');const p=owned.get(token);need(p,'DECK_ADMISSION_TOKEN_REQUIRED');return p;}
 return {
  async inspect(value){const r=await inspect(requestIdentity(value));database();return structuredClone(r.diagnostic);},
  async capture(value){const request=requestIdentity(value),record=await inspect(request);database();if(record.diagnostic.kind==='rejected')return structuredClone(record.diagnostic);const token=Object.freeze({protocol:'native-deck-sources-capability-v3',id:randomUUID()});need(!closed,'DECK_ADMISSION_CLOSED');database();owned.set(token,{request,...record});return {kind:'sources_read',token};},
  read(token){return structuredClone(saved(token).diagnostic);},
  async assertCurrent(token){return recheck(token);},
  async readImage(token,imageId){const prior=saved(token);await recheck(token);need(!closed,'DECK_ADMISSION_CLOSED');const image=prior.diagnostic.images.find(i=>i.imageId===imageId);need(image,'DECK_ADMISSION_IMAGE_REQUIRED');const loaded=await imageStore.readWithInspection({projectId:prior.request.projectId,imageId,expectedHash:image.sha256});need(hash(loaded.bytes)===image.sha256&&loaded.bytes.byteLength===image.bytes&&loaded.inspection.width===image.width&&loaded.inspection.height===image.height,'DECK_ADMISSION_IMAGE_CHANGED');database();let checked=false;const end=await store.withReadAdmission(prior.request.projectId,{...limits,readAttempts:1},()=>{database();assertStoreReadAdmission(store,prior.request.projectId);need(hash(store.read(prior.request.projectId))===prior.diagnostic.identity.snapshotHash,'DECK_ADMISSION_SNAPSHOT_CHANGED');database();checked=true;return true;});database();need(checked&&end.kind==='complete'&&end.value===true&&!closed,'DECK_ADMISSION_SNAPSHOT_CHANGED');database();return {identity:structuredClone(image),bytes:Uint8Array.from(loaded.bytes)};},
  close(){closed=true;copyReceiver.close();bReceiver.close();},
  capability:Object.freeze({executionAllowed:false,physicalSourceReaderImplemented:true,acceptsCallerValidity:false,semanticApproval:false,humanApproval:false})
 };
}
