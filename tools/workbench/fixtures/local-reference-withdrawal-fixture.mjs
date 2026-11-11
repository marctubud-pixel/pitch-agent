import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {createProject,applyCommand} from '../project.mjs';
import {createImageEvidenceStore} from '../image-evidence.mjs';
import {referenceFixturePng} from '../reference-dossier-fixtures.mjs';
import {referenceInputClosure} from '../reference-input-seal.mjs';
import {requestIdentityWire} from '../../local-acceptance/request-identity.mjs';
import {assertReferenceWithdrawalAdmission} from '../local-reference-removal.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const actor={actorType:'human',actorId:'local-acceptance-user',runId:'r',contextId:'c'};
export async function withdrawalFixture(t){const root=await realpath(await mkdtemp(join(tmpdir(),'reference-withdrawal-unit-')));t.after(()=>rm(root,{recursive:true,force:true}));const images=createImageEvidenceStore({rootDir:join(root,'images')}),asset=await images.ingest({projectId:'p',bytes:referenceFixturePng(1),metadata:{representation:'supplied_image',description:'Synthetic constructed native reducer fixture; not full upstream release'}});
 let project=structuredClone(createProject({id:'p',name:'Constructed reference withdrawal',brief:'Synthetic fixture'},actor));const contentText=JSON.stringify({directions:[{id:'steady',title:'synthetic'}]}),artifact={id:'copy',stage:'copy',contentHash:sha(contentText),payloadRef:join(root,'copy.json')};await writeFile(artifact.payloadRef,contentText);project.artifacts.push(artifact);project.activeByStage.copy=artifact.id;project.imageAssets.push(asset);
 const native={artifactId:'copy',imageId:asset.id,directionId:'steady',kind:'component',applicabilityProfile:'composition_component',borrowingNote:'Borrow layout only',commandId:'material',expectedRevision:project.revision};const materialBefore=structuredClone(project);project=structuredClone(applyCommand(project,{kind:'record-reference-material',request:native,copyContents:contentText,commandId:'material',expectedRevision:project.revision},actor));const history=new Map([[materialBefore.revision,materialBefore],[project.revision,structuredClone(project)]]);let records=0;
 const store={read:(_id,rev)=>structuredClone(rev===undefined?project:history.get(rev))};
 const record={id:'case-one',projectId:'p',referenceRuntimeProfile:'local-reference-pool-v2',mode:'assisted',checkpoints:['references'],initializationState:'ready',nextAction:{module:'references',status:'awaiting_user',reason:'SELECTED_REFERENCE_INPUT_CHECKPOINT'}};
 const register=({command,actor,sourcePins})=>{assertReferenceWithdrawalAdmission(project,record,command,sourcePins);project=structuredClone(applyCommand(project,command,actor));history.set(project.revision,structuredClone(project));records++;};
 const options={projectStore:store,imageStore:images,readCase:async id=>({...record,id}),executionRoot:root,register};
 return {root,images,asset,artifact,history,record,options,request:{commandId:'withdraw',expectedRevision:project.revision,artifactId:'copy',copyContentHash:artifact.contentHash,materialId:'material',reason:'Only borrow composition; withdraw the mistaken style use'},get project(){return project;},set project(v){project=v;},get records(){return records;}};
}
