import {referenceFixturePng} from './reference-dossier-fixtures.mjs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyFinalVisualOriginal} from './final-visual-original.mjs';
import {createFinalVisualRuntime} from './final-visual-runtime.mjs';
import {finalRequest,ingestFinalResponse,FINAL_VISUAL_PROTOCOL} from './final-visual.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';

export async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'final-original-owned-')),binding={providerId:'local',model:'local',role:'visual-lead'};
 const attachment=referenceFixturePng(7),attachmentPath=join(root,'attachment.png');await writeFile(attachmentPath,attachment);
 const image={imageId:'original-image',sha256:createHash('sha256').update(attachment).digest('hex'),mediaType:'image/png',byteLength:attachment.length,width:24,height:24};
 const source={sourceHash:hash('constructed upstream only'),copyArtifactId:'copy',copyHash:hash('copy'),sketchArtifact:{id:'sketch',contentHash:hash('sketch'),authority:{generationId:'generation',reviewRunId:'review'}},images:[image],copy:{directions:[],claims:[]},task:{id:'task'},neutralReferences:{referenceBoundaries:[],referenceQualifications:[]},handoffs:[{id:'handoff:producer'},{id:'handoff:consumer'}],referenceSource:{dossierId:'dossier'},referenceRecords:{reports:[]}};
 const run={id:'final-run',source,assignments:{planner:binding},capabilities:{owner:{maxImages:1,maxBytes:1048576,maxPixels:576}},reports:[]};
 const job={id:'planner-job',finalVisualRunId:run.id,nodeKey:'planner',node:{key:'planner',phase:'planner',role:'visual-lead',dependencies:[]},purpose:'final_visual_plan',binding,inputVersionIds:['copy','sketch'],status:'succeeded',attempts:[]};
 const p={id:'owned',finalVisualRuns:[run],jobs:[job],artifacts:[{id:'copy',contentHash:source.copyHash},{id:'sketch',contentHash:source.sketchArtifact.contentHash,sketchGeneration:source.sketchArtifact.authority}],imageAssets:[]};
 const request=finalRequest(p,run,job.node),packet={runId:'attempt',model:'local',...request.request},raw={protocol:FINAL_VISUAL_PROTOCOL,envelopeHash:request.input.envelopeHash,nodeKey:'planner',kind:'return',sourceHash:source.sourceHash,owner:'visual-lead',returnLocation:'copy',requirement:'Constructed local return',acceptance:'Exact copy correction'};
 const receipt={runId:'attempt',model:'local',requestedModel:'local',exitCode:0,threadId:'owned-thread',inputPacketHash:hash(packet),images:[{...image,path:attachmentPath}],responseText:JSON.stringify(raw)};
 const attempt={id:'attempt',status:'succeeded',dispatchStarted:true,executor:{actorId:'owned',runId:'attempt',contextId:'context'},receipt};job.attempts.push(attempt);
 const report={id:'attempt:report',nodeKey:'planner',phase:'planner',role:'visual-lead',receipt,...ingestFinalResponse(request.input,receipt)};run.reports.push(report);job.outputVersionIds=[report.id];
 const folder=join(root,'attempt');await mkdir(folder);for(const [file,bytes] of Object.entries({'packet.json':JSON.stringify(packet),'receipt.json':JSON.stringify(receipt),'response.txt':receipt.responseText}))await writeFile(join(folder,file),bytes);
 return {root,p,run,job,verify:()=>verifyFinalVisualOriginal(p,run,job,{executionRoot:root,imageStore:{read:async()=>({asset:{id:image.imageId,projectId:p.id,...image},descriptor:{...image,path:attachmentPath},bytes:await readFile(attachmentPath)})}})};
}
