import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildResearchReadinessRequest,validateResearchReadinessOutput} from './research-readiness.mjs';
import {buildCorrectionReviewRequest,validateCorrectionReviewOutput} from './correction.mjs';
import {buildEvidenceReviewRequest,validateEvidenceReviewOutput} from './evidence-review.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
for(const [kind,field,build,validate] of [['readiness','readinessInput',buildResearchReadinessRequest,validateResearchReadinessOutput],['handling','correctionReviewInput',buildCorrectionReviewRequest,validateCorrectionReviewOutput],['facts','verificationInput',buildEvidenceReviewRequest,validateEvidenceReviewOutput]])test(`actual R13 ${kind} retains exact original prompt/schema/normalization/receipt bytes`,async()=>{
 const data=JSON.parse(await readFile(new URL(`../../.scratch/workbench-v1/correction-context-r13-${kind}-result.json`,import.meta.url)));
 const job=data.job,report=data.reports[0],attempt=job.attempts.find(a=>a.id===report.attemptId),receipt=report.executionReceipt;
 const input=job.task[field],request=build(input),packet=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema,...(request.manifest?.length?{images:request.manifest}:{})});
 assert.equal(hash(packet),receipt.inputPacketHash);
 const normalized=validate(report.rawReport,input);
 assert.equal(hash(JSON.stringify(normalized,null,2)),report.reportHash);
 for(const [key,value]of Object.entries(normalized))assert.deepEqual(report[key],value);
 assert.deepEqual(JSON.parse(receipt.responseText),report.rawReport);
 if(kind==='handling')assert.equal(normalized.hasBlockingFindings,true);
 if(kind==='readiness'){assert.equal(normalized.verdict,'needs_research');assert.equal(normalized.hasBlockingFindings,true);}
});

test('actual R13 negative inventory keeps current preference/contact gaps after synthetic classification of the original 三酉 promotion',async()=>{
 const {correctionSources,correctionHash}=await import('./correction.mjs');
 const {applicabilityContext,evaluateResearchApplicability}=await import('./research-applicability.mjs');
 const handling=JSON.parse(await readFile(new URL('../../.scratch/workbench-v1/correction-context-r13-handling-result.json',import.meta.url))),ready=JSON.parse(await readFile(new URL('../../.scratch/workbench-v1/correction-context-r13-readiness-result.json',import.meta.url)));
 function source(kind,data){const r=data.reports[0];return {kind,key:`${kind}:${r.id}`,targetArtifactId:r.artifactId,targetContentHash:r.contentHash,protocolVersion:r.protocolVersion,reportId:r.id,reportHash:r.reportHash,rawReportHash:correctionHash(r.rawReport),jobId:r.jobId,attemptId:r.attemptId,inputPacketHash:r.executionReceipt.inputPacketHash,receiptHash:correctionHash(r.executionReceipt),executionIdentity:{...r.context,threadId:r.executionReceipt.threadId},rawReport:r.rawReport,validatedReport:Object.fromEntries(Object.entries(r).filter(([k])=>!['id','jobId','attemptId','rawReport','payloadRef','reportHash','executionReceipt','context','createdAt','simulationLabel'].includes(k))),...(kind==='correction_review'?{reviewedSources:data.job.task.correctionReviewInput.correctionInput.sources}:{})};}
 const sources=correctionSources([...handling.job.task.correctionReviewInput.correctionInput.sources,source('readiness',ready),source('correction_review',handling)]),input=ready.job.task.readinessInput;
 const packet={...input,applicability:applicabilityContext({sources,taskCard:input.taskCard,policy:{version:1},assignment:ready.job.binding,history:[{reportId:ready.reports[0].id},{reportId:handling.reports[0].id}],decision:{targetStage:'strategy',description:'Bounded original confirmed strategy decision.'}})};
 const trien=packet.applicability.origins.find(o=>o.key.startsWith('16529a48'));assert.ok(trien);
 const chain=new Set([trien.key]);let changed=true;while(changed){changed=false;for(const origin of packet.applicability.origins)if(chain.has(origin.derivedFrom)&&!chain.has(origin.key)){chain.add(origin.key);changed=true;}}
 assert.ok(chain.size>1,'Actual original limitation has a derived handling negative.');
 const refs=[{location:'/taskCard/brief',quote:input.taskCard.brief}],preserveRefs=[{location:'/content/sections/1/body',quote:input.content.sections[1].body}];
 const assessments=packet.applicability.origins.map(o=>({originKey:o.key,preservation:{state:'retained',reason:'Synthetic structural classification fixture only.',refs:preserveRefs},procurement:chain.has(o.key)?{kind:'conditional_later',state:'missing',material:'三酉 visual/time/edition material.',reason:'Original report expressly conditions this on later appearance or chronology comparison.',refs,permittedUse:'Attributed combination exploration.',prohibitedUse:'Appearance ranking or chronology comparison.',activationCondition:'Actual later selection of appearance or chronology comparison.',returnStage:'research'}:{kind:'required_now',state:'missing',material:'Original retained research duty.',reason:'Conservative fixture preserves every other obligation.',refs,decisionDependency:'Original confirmed task.'},requirementRefs:refs,replacement:chain.has(o.key)?{originKeys:[...chain],reason:'Explicit classification of original promotion and every handling wrapper.',refs}: {originKeys:[],reason:'none',refs:[]},reason:'Not a production assessment or sufficiency verdict.'}));
 const result=evaluateResearchApplicability(packet,assessments);
 assert.equal(result.hasBlockingFindings,true);
 assert.equal(result.restrictions.length,chain.size);
 const currentNegative=packet.applicability.origins.filter(o=>o.sourceKey===`readiness:${ready.reports[0].id}`&&(o.originalValue.severity==='blocker'||o.originalValue.status==='gap'));
 assert.ok(currentNegative.length>=2);assert.ok(currentNegative.every(o=>result.blockers.includes(o.key)));
 const assessmentInput={...input,reviewProtocolVersion:'research-readiness-v2',applicability:packet.applicability},newPacket=buildResearchReadinessRequest(assessmentInput).packet;
 const assessmentRaw={...structuredClone(ready.reports[0].rawReport),protocolVersion:'research-readiness-v2',packetHash:newPacket.packetHash,generationHash:packet.applicability.generationHash,obligationAssessments:assessments,useScan:{contentHash:input.contentHash,assessedOriginKeys:assessments.filter(a=>a.procurement.kind==='conditional_later').map(a=>a.originKey),findings:[]}};
 const assessmentReport=validateResearchReadinessOutput(assessmentRaw,assessmentInput),assessment={id:'synthetic-r13-classification',input:assessmentInput,rawReport:assessmentRaw,reportHash:hash(JSON.stringify(assessmentReport,null,2))};
 const handlingInput={...handling.job.task.correctionReviewInput,reviewProtocolVersion:'correction-handling-v4',assessment};
 const handlingRaw={...structuredClone(handling.reports[0].rawReport),protocolVersion:'correction-handling-v4',assessmentId:assessment.id,generationHash:assessmentReport.generationHash};
 const reclassified=validateCorrectionReviewOutput(handlingRaw,handlingInput),conditional=reclassified.findings.find(f=>f.findingKey===trien.key);
 assert.ok(conditional);assert.equal(conditional.status,'unresolved');assert.equal(conditional.effectiveDuty,'conditional_later');assert.equal(conditional.materialState,'missing');
 assert.equal(reclassified.hasBlockingFindings,true);
 assert.equal(handling.reports[0].hasBlockingFindings,true);
 assert.equal(ready.reports[0].verdict,'needs_research');
});
