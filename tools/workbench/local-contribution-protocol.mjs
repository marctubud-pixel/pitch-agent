import {validateCorrectionInput,correctionFeedback} from './correction.mjs';
import {LATEST_CORRECTION_PROTOCOL} from './correction-evidence.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
export function contributionInput(task){
 need(task&&!(task.revisionInput&&task.correctionInput),'LOCAL_CONTRIBUTION_INPUT_PROTOCOL_AMBIGUOUS');
 if(task.correctionInput){
  need(task.correctionInput.protocolVersion===LATEST_CORRECTION_PROTOCOL,'LOCAL_CONTRIBUTION_TYPED_VERSION_UNSUPPORTED');
  const input=validateCorrectionInput(task.correctionInput);
  return {kind:'typed',input,feedback:correctionFeedback(input),responseField:'revisionResponses'};
 }
 need(task.revisionInput,'LOCAL_CONTRIBUTION_REVISION_INPUT_REQUIRED');
 return {kind:'legacy',input:task.revisionInput,feedback:task.revisionInput.feedback,responseField:'feedbackResponses'};
}
export function soleTypedHumanFinding(protocol){
 need(protocol.kind==='typed','LOCAL_CONTRIBUTION_TYPED_INPUT_REQUIRED');
 const findings=protocol.input.sources.flatMap(source=>source.findings.map(finding=>({source,finding})));
 need(findings.length===1&&findings[0].source.kind==='human'&&protocol.feedback.length===1,'LOCAL_CONTRIBUTION_ADDITIONAL_TYPED_FINDINGS_UNSUPPORTED');
 need(findings[0].source.feedback.id===protocol.feedback[0].id,'LOCAL_CONTRIBUTION_HUMAN_SOURCE_CHANGED');
 return findings[0].finding;
}
export function authoredContributionContent(content,outputSchema){
 const output=structuredClone(content);
 if(!outputSchema)return output;
 const claimFields=outputSchema.properties?.claims?.items?.properties;
 need(claimFields&&Array.isArray(output.claims),'LOCAL_CONTRIBUTION_AUTHOR_SCHEMA_REQUIRED');
 output.claims=output.claims.map(claim=>Object.fromEntries(Object.entries(claim).filter(([key])=>{
  if(Object.hasOwn(claimFields,key))return true;
  need(['verification','id'].includes(key),'LOCAL_CONTRIBUTION_UNKNOWN_CLAIM_FIELD');return false;
 })));
 for(const [key,schema]of Object.entries(outputSchema.properties))if(!Object.hasOwn(output,key)&&schema.enum?.length===1)output[key]=structuredClone(schema.enum[0]);
 return output;
}
