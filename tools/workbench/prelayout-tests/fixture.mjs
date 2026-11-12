import {createHash} from 'node:crypto';
import {referenceFixturePng} from '../reference-dossier-fixtures.mjs';
import {readFile} from 'node:fs/promises';
import {componentFixture} from './component-fixture.mjs';
import {inspectProposalDeckInput} from '../../../apps/workbench-preview/src/proposal/generic-deck/input.ts';
import {derivePrelayoutBasis,prelayoutHash} from '../proposal-prelayout-contract.mjs';
import {createProject} from '../project.mjs';
export const human={actorType:'human',actorId:'component-human',runId:'component-only',contextId:'component-only',now:'2026-11-12T00:00:00.000Z'};
/** Explicit synthetic schema/reducer data. Never a native five-source qualification or model approval. */
export async function fixture({projectId='prelayout-component',count=3}={}){
 const f=await componentFixture(),input=f.mapped.input;input.projectId=projectId;input.taskCardId=projectId+':scope:1';
 for(const [stage,s] of Object.entries(input.sources)){s.projectId=projectId;s.taskCardId=input.taskCardId;if(stage==='brief')s.artifactId=input.taskCardId;}
 const p=structuredClone(createProject({id:projectId,name:'COMPONENT ONLY: no native source authority',brief:input.sources.brief.original.originalText,mode:'auto',humanGates:[],authorizedThrough:'final_review',workflowVersion:'proposal-seven-v1'},human));
 f.mapped.taskContainer={identity:input.taskCardId,originalText:JSON.stringify(p.taskCards[0]),sha256:prelayoutHash(p.taskCards[0]),bytes:Buffer.byteLength(JSON.stringify(p.taskCards[0]))};input.sources.brief.original.identity=input.taskCardId+'#/brief@'+f.mapped.taskContainer.sha256;
 while(input.images.length<count){const n=input.images.length,copy={...structuredClone(input.images[n%3]),imageId:'component-image-'+n,targetId:'component-target-'+n};input.images.push(copy);f.media[copy.imageId]=f.media[Object.keys(f.media)[0]];}
 for(const [n,i] of input.images.entries()){const bytes=referenceFixturePng(n);f.media[i.imageId]=[...bytes];Object.assign(i,{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,width:24,height:24});}
 const visual=JSON.parse(input.sources.visual.original.originalText);visual.sourceHash=prelayoutHash('component-only-source');visual.planHash=prelayoutHash('component-only-plan');for(const d of visual.directions)d.targets=input.images.filter(i=>i.directionId===d.directionId).map(i=>({targetId:i.targetId,directionId:i.directionId,kind:i.kind,requiredViews:i.requiredViews,imageId:i.imageId,sha256:i.sha256,mediaType:i.mediaType,byteLength:i.bytes,width:i.width,height:i.height,plan:{componentOnly:true}}));const visualText=JSON.stringify(visual);Object.assign(input.sources.visual.original,{originalText:visualText,sha256:prelayoutHash(visualText),bytes:Buffer.byteLength(visualText)});for(const i of input.images)i.visualContentHash=input.sources.visual.original.sha256;
 f.mapped.input=(await inspectProposalDeckInput(input,input.researchMethod)).input;f.mapped.sourceIdentity={...f.mapped.sourceIdentity,projectId,taskCardId:input.taskCardId,semantic:{epoch:0,configurationHash:prelayoutHash('component-semantic')},sourceHash:prelayoutHash('component-copy-envelope')};
 const originalText=await readFile(new URL('../../../docs/agents/proposal-director.md',import.meta.url),'utf8'),directorMethod={path:'docs/agents/proposal-director.md',version:'1.0.1',sha256:prelayoutHash(originalText),originalText};
 const basis=derivePrelayoutBasis({mapped:f.mapped,policy:p.policies.at(-1),databaseBindingHash:'d'.repeat(64),directorMethod});
 for(const [stage,s] of Object.entries(basis.sourceTuple.sources)){p.artifacts.push({id:s.artifactId,stage,contentHash:s.sha256,inputVersionIds:[p.activeTaskCardId],author:human});p.activeByStage[stage]=s.artifactId;}
 const nativeRequest={projectId:p.id,expectedRevision:0,taskCardId:p.activeTaskCardId,policyVersion:p.policies.at(-1).version,copyArtifactId:p.activeByStage.copy,copyContentHash:basis.sourceTuple.sources.copy.sha256,sourceHash:basis.sourceTuple.copyEnvelopeHash,visualArtifactId:p.activeByStage.visual,visualContentHash:basis.sourceTuple.sources.visual.sha256};
 return {...f,project:p,basis,nativeRequest,binding:{providerId:'component-provider',model:'component-model',role:'proposal-director'}};
}
export const clear=input=>({protocol:'proposal-prelayout-v1',sourceTupleHash:input.sourceTupleHash,baseInputSha256:input.baseInputSha256,decision:'clear',summary:'Component-only response; no new blocker in this bounded synthetic input.',newIssues:[],carriedLimitationsHash:input.carriedLimitationsHash});
