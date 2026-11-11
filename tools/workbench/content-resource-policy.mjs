import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket} from './content-contract-versions.mjs';
import {HTTP_JSON_PROFILE,precheckHttpJSON} from './model-http-json-profile.mjs';
import {sketchRequire as need,sketchHash as hash} from './sketch-authority.mjs';
const MiB=1024*1024;
export const CONTENT_RESOURCE_PROFILE=Object.freeze({version:'content-resource-profile-v1',httpResourceProfile:'bounded-json-v1',sourceFileBytes:8*MiB,sourceTotalBytes:16*MiB,manifestBytes:8*MiB,logicalBytes:40*MiB,runtimeBytes:40*MiB,wireBytes:64*MiB,outputBytes:2*MiB,encodedOutputBytes:12*MiB+2,bodyBytes:16*MiB,transportManifestBytes:16*MiB,receiptBytes:6*MiB,reportBytes:10*MiB,witnessBytes:8*MiB,totalWitnessBytes:64*MiB,manuscriptBytes:8*MiB,originalFileBytes:64*MiB,attemptOriginalBytes:256*MiB,graphOriginalBytes:4*1024*MiB,projectOriginalBytes:16*1024*MiB,snapshotBytes:256*MiB,graphSnapshotBytes:72*MiB,maximumGraphs:3,terminalReserveBytes:64*1024,jsonDepth:HTTP_JSON_PROFILE.depth,jsonStructuralCharacters:HTTP_JSON_PROFILE.structuralCharacters,secretResponseBytes:HTTP_JSON_PROFILE.responseInspectionBytes,secretInputBytes:HTTP_JSON_PROFILE.inputInspectionBytes,secretEntries:HTTP_JSON_PROFILE.inspectionEntries,secretGenerations:HTTP_JSON_PROFILE.decodingGenerations});
export const contentByteLength=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;
export function requireContentBytes(kind,value){const length=typeof value==='number'?value:contentByteLength(value),limit=CONTENT_RESOURCE_PROFILE[kind];need(Number.isSafeInteger(length)&&length>=0&&Number.isSafeInteger(limit)&&length<=limit,'CONTENT_RESOURCE_LIMIT',`Content ${kind} exceeds its pinned finite resource ceiling`);return length;}
export function scanContentJSON(text,{maxBytes=CONTENT_RESOURCE_PROFILE.outputBytes}={}){
 need(typeof text==='string'&&contentByteLength(text)<=maxBytes,'CONTENT_RESOURCE_LIMIT','JSON exceeds the finite byte ceiling');
 try{return precheckHttpJSON(text);}catch{need(false,'CONTENT_JSON_LIMIT','JSON exceeds the frozen HTTP structural profile');}
}
export function freezeContentResourceAdmission(project){
 return {version:CONTENT_RESOURCE_PROFILE.version,profileHash:hash(CONTENT_RESOURCE_PROFILE),snapshotBaseBytes:contentByteLength(project)};
}
export function requireContentResourceProfile(root){const a=root.task.resourceAdmission;need(a?.version===CONTENT_RESOURCE_PROFILE.version&&a.profileHash===hash(CONTENT_RESOURCE_PROFILE)&&Number.isSafeInteger(a.snapshotBaseBytes),'CONTENT_RESOURCE_PROFILE_CHANGED','Exact frozen content resource admission required');return a;}
export function admitContentDispatch(project,root){
 const admission=requireContentResourceProfile(root),roots=project.jobs.filter(j=>j.purpose==='complete_content_plan'&&planningContentPacket(j.task.packetVersion));
 need(roots.length<=CONTENT_RESOURCE_PROFILE.maximumGraphs,'CONTENT_RESOURCE_LIMIT','Finite three retained content graph profile exhausted');
 const snapshot=contentByteLength(project),growth=snapshot-admission.snapshotBaseBytes;
 need(growth+CONTENT_RESOURCE_PROFILE.terminalReserveBytes<=CONTENT_RESOURCE_PROFILE.graphSnapshotBytes,'CONTENT_RESOURCE_LIMIT','Current graph must retain terminal recording space');
 const remainingGraphs=CONTENT_RESOURCE_PROFILE.maximumGraphs-roots.length;
 need(snapshot+Math.max(0,CONTENT_RESOURCE_PROFILE.graphSnapshotBytes-growth)+remainingGraphs*CONTENT_RESOURCE_PROFILE.graphSnapshotBytes+CONTENT_RESOURCE_PROFILE.terminalReserveBytes<=CONTENT_RESOURCE_PROFILE.snapshotBytes,'CONTENT_RESOURCE_LIMIT','Current snapshot cannot reserve all supported retained rounds');
}
export function requireContentCommitAdmission(project,command,fingerprint){
 const roots=project.jobs.filter(j=>j.purpose==='complete_content_plan'&&planningContentPacket(j.task.packetVersion));if(!roots.length)return;
 const root=roots.at(-1);requireContentResourceProfile(root);
 requireContentBytes('snapshotBytes',project);
 requireContentBytes('witnessBytes',fingerprint);
 let total=0;for(const witness of Object.values(project.processedCommands??{})){requireContentBytes('witnessBytes',witness);total+=contentByteLength(witness);}requireContentBytes('totalWitnessBytes',total);
 if(command.kind==='anchor-complete-content'||command.kind==='reconcile-numeric-content'){requireContentBytes('receiptBytes',command.receipt);const reservation=project.jobs.find(j=>j.id===command.jobId)?.attempts.at(-1)?.outputReservation;if(reservation)need(contentByteLength(JSON.stringify(command.receipt.responseText))<=reservation.mandatoryEncodedOutputBytes+reservation.freeEncodedBytes,'CONTENT_RESOURCE_LIMIT','Actual original exceeds its exact reserved encoded output');}
 if(command.kind==='complete-complete-content'){const report=project.jobs.find(j=>j.id===command.jobId)?.contentReport;if(report){requireContentBytes('reportBytes',report);if(report.raw?.manuscript)requireContentBytes('manuscriptBytes',report.raw.manuscript);}}
 const snapshot=contentByteLength(project),growth=snapshot-root.task.resourceAdmission.snapshotBaseBytes;
 need(growth<=CONTENT_RESOURCE_PROFILE.graphSnapshotBytes,'CONTENT_RESOURCE_LIMIT','Graph exceeds its retained snapshot budget');
 const remainingGraphs=CONTENT_RESOURCE_PROFILE.maximumGraphs-roots.length;
 need(remainingGraphs>=0&&snapshot+Math.max(0,CONTENT_RESOURCE_PROFILE.graphSnapshotBytes-growth)+remainingGraphs*CONTENT_RESOURCE_PROFILE.graphSnapshotBytes+CONTENT_RESOURCE_PROFILE.terminalReserveBytes<=CONTENT_RESOURCE_PROFILE.snapshotBytes,'CONTENT_RESOURCE_LIMIT','Current snapshot cannot reserve all supported retained rounds');
}
