import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {readStageInvocationOriginal,verifyResearchDataOriginal} from './stage-original.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {buildResearchReaderRequest,projectResearchReaderReport,validateResearchReaderOutput,researchReaderEligibility} from './research-reader-loop.mjs';
import {researchReaderTarget,validateStoredResearchReader} from './research-reader-state.mjs';
import {semanticHash} from './semantic-authority.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(value,message)=>{if(!value)throw Object.assign(Error(message),{code:'RESEARCH_READER_ORIGINAL_CHANGED',status:422});};
const one=(items,id)=>{const all=(items??[]).filter(x=>x.id===id);need(all.length===1,'Exactly one registered reader original required');return all[0];};
export async function verifyResearchReaderOriginal(project,report,{executionRoot,current=false,visited=new Set()}){
 need(!visited.has(report.id),'Reader original dependency cycle');visited.add(report.id);
 try{validateStoredResearchReader(project,report);}catch(error){need(false,error.message);}

 need(equal(one(project.researchReaderReports,report.id),report),'Exact registered reader report required');
 const job=one(project.jobs,report.jobId),attempt=one(job.attempts,report.attemptId),artifact=one(project.artifacts,report.artifactId),packet=job.task.readerInput;
 if(job.task.readerPreviousReportId)await verifyResearchReaderOriginal(project,one(project.researchReaderReports,job.task.readerPreviousReportId),{executionRoot,visited});
 need(job.purpose==='research_reader'&&job.status==='succeeded'&&attempt.status==='succeeded'&&attempt.dispatchStarted===true&&equal(job.outputVersionIds,[report.id])&&equal(job.inputVersionIds,[artifact.id]),'Exact successful dispatched reader attempt required');
 need(equal(attempt.executor,report.context)&&equal(attempt.receipt,report.executionReceipt),'Reader report changed original executor or receipt');
 const registration=one(project.researchQuestionRegistrations,report.registrationId),card=one(project.taskCards,registration.taskCardId);
 const core=Object.fromEntries(['id','taskCardId','taskCardHash','method','questions','readerCount'].map(k=>[k,registration[k]]));
 const producers=project.jobs.filter(j=>(!j.purpose||j.purpose==='stage')&&j.outputVersionIds?.includes(artifact.id));
 need(registration.registrationHash===semanticHash(core)&&producers.length===1&&equal(producers[0].task.researchQuestionRegistration,registration)&&producers[0].task.researchQuestionRegistrationHash===registration.registrationHash,'Original producer question plan changed');
 await verifyResearchDataOriginal(project,artifact,{executionRoot});
 need(equal(job.task.readerInput.questionRegistration,{id:registration.id,taskCardId:registration.taskCardId,questions:registration.questions})&&registration.taskCardHash===semanticHash(card)&&equal(packet.taskCard,{id:card.id,purpose:card.brief})&&equal(packet.method,registration.method)&&report.readerSeat===job.readerSeat&&job.registrationId===registration.id,'Reader question, seat, card or method identity changed');
 need(report.contentHash===artifact.contentHash&&packet.artifactId===artifact.id&&packet.contentHash===artifact.contentHash&&job.targetArtifactId===artifact.id,'Reader source identity changed');
 const loaded=await readArtifactContent(project,artifact.id,executionRoot);
 need(job.task.readerContentText===loaded.contentText&&equal(packet.visibleReport,projectResearchReaderReport(loaded.contentText)),'Actual reader source or complete visible prose changed');
 const request=buildResearchReaderRequest(packet),original=await readStageInvocationOriginal(project,job,attempt,{executionRoot}),receipt=report.executionReceipt;
 need(equal(original.packet,{projectId:project.id,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...request}),'Saved reader runtime packet differs from frozen request');
 need(equal(original.input,{runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema}),'Saved reader provider request changed');
 need(receipt.attemptId===attempt.id&&receipt.providerId===job.binding.providerId&&receipt.model===job.binding.model&&receipt.role===job.binding.role&&receipt.taskId===job.task.id,'Reader receipt binding changed');
 let raw;try{raw=JSON.parse(original.outputText);}catch{need(false,'Reader response is not JSON');}
 const validated=validateResearchReaderOutput(raw,packet),eligibility=researchReaderEligibility(packet,raw);
 need(equal(raw,report.rawReport)&&Object.entries(validated).every(([k,v])=>equal(report[k],v))&&equal(report.eligibility,eligibility),'Saved reader content or eligibility differs from original response');
 const expected=JSON.stringify(validated,null,2),path=join(executionRoot,attempt.id,'research-reader.json');
 need(resolve(report.payloadRef)===resolve(path)&&resolve(receipt.validatedOutputPath)===resolve(path)&&report.reportHash===hash(expected)&&receipt.validatedOutputHash===report.reportHash,'Normalized reader report identity changed');
 need((await readManagedLayoutBytes(executionRoot,path,1024*1024)).equals(Buffer.from(expected)),'Normalized reader original bytes changed');
 let isCurrent=false;try{researchReaderTarget(project,job);isCurrent=true;}catch(error){if(current)throw error;}
 if(current)need(isCurrent,'Current reader report required');
 return {reportId:report.id,jobId:job.id,attemptId:attempt.id,artifactId:artifact.id,contentHash:artifact.contentHash,packetHash:packet.packetHash,reportHash:report.reportHash,registrationId:registration.id,registrationHash:registration.registrationHash,method:registration.method,rawResponseHash:hash(original.outputText),readerSeat:job.readerSeat,current:isCurrent,scope:'saved-report-prose',eligibility};
}
