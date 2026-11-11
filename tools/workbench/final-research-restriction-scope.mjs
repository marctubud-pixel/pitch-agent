import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {visibilityPointer} from './content-visibility.mjs';
import {correctionSources} from './correction.mjs';
import {obligationOrigins} from './research-applicability.mjs';
import {strategyDeliveryEnvelope,validatedResearchAssessment,validateStoredReview} from './project.mjs';

const one=(rows,predicate,code)=>{const matches=(rows??[]).filter(predicate);need(matches.length===1,code,'One exact research restriction owner required');return matches[0];};
const bare=source=>{const {findings,constraints,...rest}=source;return rest;};
export function researchRestrictionScope({planning,originals,entry,occurrence,trusted}){
 const {source}=entry.original;
 if(!['readiness','handoff'].includes(source.kind)||!entry.original.reviewedArtifacts.some(a=>a.artifactId===source.targetArtifactId&&a.stage==='research'))return null;
 const reviewed=one(entry.original.reviewedArtifacts,a=>a.artifactId===source.targetArtifactId&&a.contentHash===source.targetContentHash,'FINAL_RESEARCH_SOURCE_CHANGED');
 need(hash(JSON.stringify(reviewed.content,null,2))===source.targetContentHash,'FINAL_RESEARCH_SOURCE_CHANGED','Original reviewed research bytes must retain their exact hash');
 const root=one(planning.jobs,j=>j.id===trusted.contract.rootJobId,'FINAL_RESEARCH_CONTENT_ROOT_REQUIRED');
 need(equal(root.task?.source,trusted.source)&&Array.isArray(root.task.sourceContents),'FINAL_RESEARCH_CONTENT_ROOT_CHANGED','Exact current content root and original source bytes required');
 const current=trusted.source.strategy;
 need(current.artifactId===planning.activeByStage.strategy,'FINAL_RESEARCH_CURRENT_SOURCE_CHANGED','Selected current strategy required');
 const envelope=strategyDeliveryEnvelope(planning,current.artifactId,root.task.sourceContents,{providerId:'content-source-reader',model:'historical-evidence',role:'copy-lead'});
 need(envelope.source.contentHash===current.contentHash&&equal(envelope.source.content,current.content),'FINAL_RESEARCH_CURRENT_SOURCE_CHANGED','Current envelope must bind the exact selected strategy');
 const restriction=one(envelope.researchRestrictionManifest,r=>r.originKey===occurrence.domainFindingId&&r.sourceKey===source.key,'FINAL_RESEARCH_RESTRICTION_REQUIRED');
 const extracted=correctionSources([source]);
 const expectedOrigin=one(obligationOrigins(extracted),o=>o.key===occurrence.domainFindingId&&o.location===occurrence.normalizedPointer&&equal(o.originalValue,occurrence.normalizedValue),'FINAL_RESEARCH_ORIGIN_CHANGED');
 const checked=e=>{
  const record=visibilityPointer(planning,e.anchor.originalRecordPointer);
  need(hash(JSON.stringify(record))===e.anchor.recordHash&&equal(e.anchor.raw,e.original.source.rawReport),'FINAL_RESEARCH_ORIGINAL_CHANGED','Exact selected checked owner original required');
  const rebuilt=validateStoredReview(planning,e.original.source.kind,record);
  need(equal(rebuilt.source,e.original.source)&&equal(rebuilt.input,e.original.frozenInput),'FINAL_RESEARCH_ORIGINAL_CHANGED','Checked source and frozen input must retain the owning validator result');
  return e.original;
 };
 const researchArtifact=one(envelope.sourceArtifacts,a=>a.stage==='research'&&a.id===planning.activeByStage.research,'FINAL_RESEARCH_ASSESSMENT_REQUIRED');
 const assessment=validatedResearchAssessment(planning,researchArtifact.id);
 const candidate=one(originals,e=>e.original.source.kind==='readiness'&&e.original.source.protocolVersion==='research-readiness-v2'&&e.original.source.reportId===assessment.id,'FINAL_RESEARCH_ASSESSMENT_REQUIRED');
 const assessmentOriginal=checked(candidate),input=assessmentOriginal.frozenInput;
 need(equal(one(assessmentOriginal.source.validatedReport.applicabilityEvaluation.restrictions,r=>r.originKey===expectedOrigin.key,'FINAL_RESEARCH_ASSESSMENT_CHANGED'),restriction),'FINAL_RESEARCH_ASSESSMENT_CHANGED','Current independently evaluated restriction must equal the envelope manifest');
 need(assessment.id===assessmentOriginal.source.reportId&&equal(assessment.input,input)&&equal(assessment.rawReport,assessmentOriginal.source.rawReport),'FINAL_RESEARCH_ASSESSMENT_CHANGED','Actual current independently checked assessment required');
 need(equal(one(input.applicability.origins,o=>o.key===expectedOrigin.key,'FINAL_RESEARCH_ORIGIN_CHANGED'),expectedOrigin),'FINAL_RESEARCH_ORIGIN_CHANGED','Exact full original finding origin required');
 const sourceInventory=[];
 const visit=s=>{sourceInventory.push(s);for(const nested of s.reviewedSources??[])visit(nested);};
 input.applicability.sources.forEach(visit);
 need(sourceInventory.some(s=>equal(bare(s),source)),'FINAL_RESEARCH_SOURCE_CHANGED','Assessment must preserve the complete immutable original source');
 const judgment=one(assessmentOriginal.source.validatedReport.obligationAssessments,a=>a.originKey===expectedOrigin.key,'FINAL_RESEARCH_ASSESSMENT_CHANGED');
 need(judgment.preservation.state==='retained'&&judgment.procurement.kind==='conditional_later'&&judgment.procurement.state==='missing','FINAL_RESEARCH_ASSESSMENT_CHANGED','Missing conditional procurement remains missing');
 const requiredHandoffs=envelope.manifest.handoffReports.filter(r=>r.artifactId===researchArtifact.id&&r.assessmentId===assessment.id);
 need(['producer','consumer'].every(side=>requiredHandoffs.some(r=>r.side===side)),'FINAL_RESEARCH_HANDOFF_REQUIRED','Actual producer and consumer handoffs required');
 const handoffs=requiredHandoffs.map(stored=>{
  const e=one(originals,e=>e.original.source.kind==='handoff'&&e.original.source.reportId===stored.id,'FINAL_RESEARCH_HANDOFF_REQUIRED'),original=checked(e),frozen=original.frozenInput,report=original.source.validatedReport;
  need(equal(original.source.rawReport,stored.rawReport)&&equal(frozen.assessment,assessment)&&equal(original.source.handoffInput,frozen)&&report.decision==='accept'&&!report.hasBlockingFindings&&report.assessmentId===assessment.id&&report.restrictionManifestHash===assessmentOriginal.source.validatedReport.applicabilityEvaluation.restrictionManifestHash,'FINAL_RESEARCH_HANDOFF_CHANGED','Exact frozen independently assessed handoff required');
  const disposition=one(report.restrictionDispositions,d=>d.originKey===restriction.originKey,'FINAL_RESEARCH_HANDOFF_CHANGED');
  need(disposition.state==='retained'&&disposition.text===restriction.prohibitedUse||disposition.state==='narrowed'&&disposition.text.includes(restriction.prohibitedUse)&&disposition.text!==restriction.prohibitedUse,'FINAL_RESEARCH_HANDOFF_CHANGED','Original prohibition must remain operative');
  return {reportIdentity:e.anchor.identity,reportVersion:e.anchor.version,source:structuredClone(original.source),frozenInput:structuredClone(frozen),disposition:structuredClone(disposition)};
 });
 for(const consumer of handoffs.filter(h=>h.frozenInput.side==='consumer'))need(handoffs.some(producer=>producer.frozenInput.side==='producer'&&equal(consumer.frozenInput.producerReport,producer.source.rawReport)),'FINAL_RESEARCH_HANDOFF_CHANGED','Consumer must bind an exact checked producer');
 const expected={originId:restriction.originKey,artifactId:current.artifactId,pointer:'/researchRestrictionManifest',owner:'strategy-lead',kind:'restriction',value:restriction};
 const origin=one(trusted.source.obligations,o=>o.originId===restriction.originKey,'FINAL_RESEARCH_OBLIGATION_REQUIRED');
 need(equal(origin,expected),'FINAL_RESEARCH_OBLIGATION_CHANGED','Exact envelope restriction obligation required');
 const pointer=`/researchRestrictionManifest/${envelope.researchRestrictionManifest.indexOf(restriction)}`;
 return {current,reviewed:structuredClone(reviewed),origins:[origin],selectors:[pointer],sourceOriginalAddresses:[{domain:'delivery_envelope',sourceArtifactId:current.artifactId,sourceContentHash:current.contentHash,envelopeHash:envelope.envelopeHash,pointer,valueHash:hash(restriction)}],researchRestriction:{kind:'conditional_research_restriction',source:structuredClone(source),origin:expectedOrigin,assessment:{reportIdentity:candidate.anchor.identity,reportVersion:candidate.anchor.version,source:structuredClone(assessmentOriginal.source),input:structuredClone(input),judgment:structuredClone(judgment)},handoffs,envelopeHash:envelope.envelopeHash,restriction:structuredClone(restriction)}};
}
