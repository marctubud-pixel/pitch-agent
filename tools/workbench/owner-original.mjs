import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {join,resolve} from 'node:path';
import {validateStoredOwner,DomainError} from './project.mjs';
import {buildOwnerRequest,ownerHash} from './owner-edge.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {readArtifactContent} from './artifact-content.mjs';

const need=(value,message)=>{if(!value)throw new DomainError('OWNER_ORIGINAL_CHANGED',message);};
const member=(items,id)=>{const matches=items.filter(item=>item.id===id);need(matches.length===1,'Exactly one registered original required');return matches[0];};

export async function verifyOwnerOriginal(project,report,{executionRoot}) {
 need(equal(member(project.ownerReports,report.id),report),'Exact registered owner report required');
 const job=member(project.jobs,report.jobId),attempt=member(job.attempts,report.attemptId),edge=member(project.ownerEdges,report.edgeId);
 const projection=validateStoredOwner(project,report);
 need(edge.envelope.projectId===project.id,'Owner envelope project changed');
 const folder=join(executionRoot,attempt.id),output=join(folder,'owner-acceptance.json');
 need(resolve(report.payloadRef)===resolve(output)&&resolve(report.executionReceipt.validatedOutputPath)===resolve(output),'Exact executor owner output path required');
 const expected={projectId:project.id,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...buildOwnerRequest(job.task.ownerInput)};
 const packet=await readManagedLayoutBytes(executionRoot,join(folder,'packet.json'));
 if(isOrdinaryHttp(report.executionReceipt))need(packet.equals(Buffer.from(JSON.stringify(expected,null,2))),'Exact HTTP executor packet wrapper bytes required');
 need(equal(JSON.parse(packet.toString('utf8')),expected),'Original executor owner packet changed');
 if(isOrdinaryHttp(report.executionReceipt))await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,request:buildOwnerRequest(job.task.ownerInput),runtimePacketBytes:Buffer.from(JSON.stringify(expected,null,2)),receipt:report.executionReceipt});
 const bytes=await readManagedLayoutBytes(executionRoot,output);
 need(bytes.equals(Buffer.from(JSON.stringify(projection,null,2))),'Original normalized owner report changed');
 const envelope=edge.envelope,dependencies=[];
 need(equal(member(project.taskCards,envelope.taskCard.id),envelope.taskCard)&&ownerHash(envelope.taskCard)===envelope.taskCardHash,'Frozen owner task card changed');
 need(equal(member(envelope.sourceArtifacts,envelope.source.artifactId).inputVersionIds,envelope.sourceInputVersionIds),'Frozen owner source inputs changed');
 for(const frozen of envelope.sourceArtifacts){
  member(envelope.sourceArtifacts,frozen.id);
  for(const id of frozen.inputVersionIds)if(id!==envelope.taskCard.id)member(envelope.sourceArtifacts,id);
  const registered=member(project.artifacts,frozen.id);
  need(['contentHash','payloadRef','stage','provenance'].every(key=>equal(registered[key],frozen[key]))&&equal(registered.inputVersionIds,frozen.inputVersionIds),'Frozen owner source registration changed');
  const original=await readArtifactContent({artifacts:envelope.sourceArtifacts},frozen.id,executionRoot);
  const text=frozen.id===envelope.source.artifactId?envelope.source.contentText:member(edge.sourceContents.map(item=>({...item,id:item.artifactId})),frozen.id).contentText;
  need(original.contentText===text,'Frozen owner source bytes changed');
  const target=member(envelope.returnTargets.map(item=>({...item,id:item.artifactId})),frozen.id);
  need(equal(target.content,original.content),'Frozen owner return target changed');
  dependencies.push({artifactId:frozen.id,contentHash:frozen.contentHash,inputVersionIds:structuredClone(frozen.inputVersionIds),provenance:frozen.provenance});
 }
 need(dependencies.some(item=>item.artifactId===envelope.source.artifactId),'Frozen owner source ancestry missing');
 const producer=report.side==='consumer'?project.ownerReports.find(item=>item.edgeId===edge.id&&item.side==='producer'):null;
 return {edgeId:edge.id,reportId:report.id,reportHash:report.reportHash,jobId:job.id,attemptId:attempt.id,projection,dependencies,taskCardId:envelope.taskCard.id,producerReport:producer?{reportId:producer.id,reportHash:producer.reportHash,jobId:producer.jobId,attemptId:producer.attemptId}:null};
}
