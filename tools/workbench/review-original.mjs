import {verifyResearchReaderOriginal} from './research-reader-original.mjs';
import {verifySplitProjectOriginals,validateSplitExecution} from './readiness-split-runtime.mjs';
import {createHash} from 'node:crypto';
import {loadSavedReadinessProof} from './readiness-evidence.mjs';
import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {join,resolve} from 'node:path';
import {validateStoredReview,DomainError} from './project.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {mapValidatedReviewSemantics} from './review-semantic-mapping.mjs';
import {readArtifactContent} from './artifact-content.mjs';

const need=(value,message)=>{if(!value)throw new DomainError('REVIEW_ORIGINAL_CHANGED',message);};
const member=(items,id)=>{need(Array.isArray(items),'Registered collection required');const matches=items.filter(item=>item.id===id);need(matches.length===1,'Exactly one registered original required');return matches[0];};

export async function verifyReviewOriginal(project,kind,report,{executionRoot,imageStore}) {
 const checked=validateStoredReview(project,kind,report),{source,request,input,collection,outputFilename}=checked;
 need(equal(member(project[collection],report.id),report),'Exact registered report required');
 const job=member(project.jobs,report.jobId),attempt=member(job.attempts,report.attemptId),artifact=member(project.artifacts,report.artifactId);
 if(kind==='research_reader'){
  await verifyResearchReaderOriginal(project,report,{executionRoot});
 }else if(report.resolutionId){
  need(kind==='readiness','Only readiness has a recovered original owner');
  const resolution=member(project.readinessResolutions,report.resolutionId);
  need(resolution.kind==='recovered-result'&&resolution.jobId===job.id&&resolution.attemptId===attempt.id&&resolution.reportId===report.id,'Exact registered readiness recovery required');
  need(job.status==='awaiting_reconciliation'&&attempt.status==='awaiting_reconciliation'&&job.attempts.at(-1).id===attempt.id,'Original unknown execution must remain unchanged');
  const proof=await loadSavedReadinessProof(executionRoot,project.id,job,attempt);
  need(proof&&equal(proof,resolution.proof),'Exact retained physical readiness recovery proof required');
  const output=join(executionRoot,resolution.id,'readiness.json');
  need(resolve(report.payloadRef)===resolve(output),'Exact recovered normalized output path required');
  const bytes=await readManagedLayoutBytes(executionRoot,output);
  need(bytes.equals(Buffer.from(JSON.stringify(source.validatedReport,null,2)))&&proof.normalizedReportHash===report.reportHash,'Recovered normalized report bytes changed');
 }else if(report.executionReceipt?.provider==='split-readiness-composite-v1'){
  need(kind==='readiness'&&job.task.splitReadiness,'Composite original only supports explicit split readiness');
  await verifySplitProjectOriginals(project,{executionRoot});
  const assembled=validateSplitExecution(project,job,attempt,report.executionReceipt,report.rawReport),output=join(executionRoot,attempt.id,'readiness.json');
  need(equal(attempt.receipt,report.executionReceipt)&&resolve(report.payloadRef)===resolve(output),'Exact registered composite completion required');
  const bytes=await readManagedLayoutBytes(executionRoot,output);
  need(bytes.equals(Buffer.from(JSON.stringify(assembled.report,null,2)))&&createHash('sha256').update(bytes).digest('hex')===report.reportHash&&equal(assembled.report,source.validatedReport),'Composite normalized bytes changed');
 }else{
 const folder=join(executionRoot,attempt.id),output=join(folder,outputFilename),receipt=report.executionReceipt;
 need(resolve(report.payloadRef)===resolve(output)&&resolve(receipt.validatedOutputPath)===resolve(output),'Exact executor output path required');
 const expected={projectId:project.id,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...request};
 const packet=await readManagedLayoutBytes(executionRoot,join(folder,'packet.json'));
 if(isOrdinaryHttp(receipt))need(packet.equals(Buffer.from(JSON.stringify(expected,null,2))),'Exact HTTP executor packet wrapper bytes required');
 need(equal(JSON.parse(packet.toString('utf8')),expected),'Original executor packet changed');
 if(isOrdinaryHttp(receipt))await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,request,images:receipt.images??[],runtimePacketBytes:Buffer.from(JSON.stringify(expected,null,2)),receipt});
 const bytes=await readManagedLayoutBytes(executionRoot,output);
 need(bytes.equals(Buffer.from(JSON.stringify(source.validatedReport,null,2)))&&receipt.validatedOutputHash===report.reportHash,'Original normalized report changed');
 }
 const receipt=report.executionReceipt;
 const content=await readArtifactContent(project,artifact.id,executionRoot);
 const panel=kind==='creative_panel'?member(project.creativePanels,report.panelId):null;
 need(kind==='research_reader'?content.contentText===job.task.readerContentText:equal(content.content,input.content??panel?.packet.content),'Original reviewed content bytes changed');
 const attachments=[];
 for(const [occurrenceIndex,image] of (receipt.images??[]).entries()){
  need(imageStore&&typeof imageStore.read==='function','Managed image store required');
  const loaded=await imageStore.read({projectId:project.id,imageId:image.imageId,expectedHash:image.sha256});
  need(loaded.descriptor.byteLength===image.byteLength&&loaded.descriptor.mediaType===image.mediaType,'Original attachment bytes changed');
  attachments.push({domain:'image',projectId:project.id,hostId:report.id,occurrenceIndex,imageId:image.imageId,sha256:image.sha256});
 }
 const dependencies=[{domain:'artifact',projectId:project.id,hostId:job.id,occurrenceIndex:0,artifactId:artifact.id,contentHash:artifact.contentHash}];
 for(const [occurrenceIndex,original] of (source.reviewedSources??[]).entries())dependencies.push({domain:'review',projectId:project.id,hostId:report.id,occurrenceIndex,kind:original.kind,reportId:original.reportId,jobId:original.jobId,attemptId:original.attemptId,reportHash:original.reportHash,original:structuredClone(original)});
 if(panel){
  const node=panel.nodes.find(n=>n.key===report.nodeKey);
  const references=[...(input.firstRead?[{nodeKey:`${node.role}:${node.phase==='score'?'score_first_read':'opposition_first_read'}`,report:input.firstRead,location:'/firstRead'}]:[]),...(input.pairedScore?[{nodeKey:`${node.role}:score`,report:input.pairedScore,location:'/pairedScore'}]:[]),...(input.reports??[]).map((r,i)=>({...r,location:`/reports/${i}`}))];
  for(const [occurrenceIndex,reference] of references.entries()){
   const matches=project.creativeReports.filter(r=>r.panelId===panel.id&&r.nodeKey===reference.nodeKey);
   need(matches.length===1&&equal(matches[0].rawReport,reference.report),'Exact original creative dependency required');
   const original=matches[0];
   dependencies.push({domain:'creative_panel',projectId:project.id,hostId:panel.id,occurrenceIndex,location:reference.location,reportId:original.id,jobId:original.jobId,attemptId:original.attemptId,reportHash:original.reportHash});
  }
 }
 const correctionTargets=(source.reviewedSources??[]).flatMap((original,sourceIndex)=>(original.findings??[]).map((finding,occurrenceIndex)=>({sourceIndex,occurrenceIndex,sourceKey:original.key,reportId:original.reportId,targetArtifactId:original.targetArtifactId,targetContentHash:original.targetContentHash,finding:structuredClone(finding)})));
 const reportOccurrences=['findings','issues','challenges','adjudications','unresolvedIssues'].flatMap(field=>(source.validatedReport[field]??[]).map((value,occurrenceIndex)=>({field,occurrenceIndex,value:structuredClone(value)})));
 const unresolvedDependencies=['verificationReports','readinessReports','producerReport','independentEvidenceReviews'].filter(field=>input[field]!=null).map(field=>({field,original:structuredClone(input[field])}));
 return {identity:{domain:kind,projectId:project.id,hostId:artifact.id,reportId:report.id,jobId:job.id,attemptId:attempt.id,reportHash:report.reportHash},source,reviewedArtifacts:[{artifactId:artifact.id,contentHash:artifact.contentHash,stage:artifact.stage,content:structuredClone(content.content)}],dependencies,attachments,correctionTargets,reportOccurrences,semanticMapping:mapValidatedReviewSemantics(source),unresolvedDependencies,frozenInput:structuredClone(input)};
}
