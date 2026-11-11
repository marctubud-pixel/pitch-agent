import {researchReaderCoverage} from './research-reader-state.mjs';
import {verifyResearchReaderOriginal} from './research-reader-original.mjs';
const fail=()=>{throw Object.assign(Error('当前独立读者原件尚未完整核对，不能交接或放行。'),{code:'RESEARCH_R7_READER_ORIGINAL_REQUIRED',status:422});};
export async function verifyCurrentResearchReaders(project,{executionRoot,artifactId=project.activeByStage.research}={}){
 try{
  const coverage=researchReaderCoverage(project);
  if(!artifactId||project.activeByStage.research!==artifactId||coverage.artifactId!==artifactId||!coverage.understandingComplete)fail();
  const originals=[];
  for(const seat of coverage.seats){
   const reports=(project.researchReaderReports??[]).filter(r=>r.id===seat.reportId);
   if(reports.length!==1)fail();
   originals.push(await verifyResearchReaderOriginal(project,reports[0],{executionRoot,current:true}));
  }
  return {artifactId,registrationId:coverage.registrationId,originals,factualSufficiencyVerified:false,consumerValidation:false,humanApproval:false};
 }catch{fail();}
}
export async function researchWorkflowWithReaderOriginals(project,workflow,{executionRoot}){
 if(!project.workflow||!workflow.checks?.find(c=>c.id==='reader_loop')?.passed)return workflow;
 try{return {...workflow,readerOriginals:await verifyCurrentResearchReaders(project,{executionRoot})};}
 catch(error){const reason='独立读者原件未完成核对，研究交接与放行仍待核。';return {...workflow,checks:workflow.checks.map(c=>c.id==='reader_loop'?{...c,passed:false,detail:reason,fix:null}:c),canDeliver:{allowed:false,reason},canAccept:{allowed:false,reason},canRelease:{allowed:false,reason},eligible:false,summary:reason,readerOriginals:{error:error.code}};}
}
