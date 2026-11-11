import {createHash} from 'node:crypto';
import {makeProjectedContentSource} from './content-visibility.mjs';
import {contentNodes,contentCalls,contentAllowance,contentRootId} from './complete-content.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
function need(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
export function requestContentVisibilityRevision(project,command,actor) {
 need(actor.actorType==='agent','CONTENT_TRUSTED_RUNTIME_REQUIRED');
 need(nonempty(command.commandId)&&nonempty(command.reason)&&command.finding?.code==='CONTENT_RAW_QUALIFICATION_PROJECTION'&&nonempty(command.finding.evidenceHash),'CONTENT_PROJECTION_FINDING_REQUIRED');
 const existing=project.contentVisibilityRevisionIntents?.find(i=>i.commandId===command.commandId);
 if(existing){need(existing.commandHash===hash(command),'CONTENT_REVISION_COMMAND_CHANGED');return structuredClone(existing);}
 const predecessor=project.jobs.find(j=>j.id===command.predecessorRootJobId),roots=project.jobs.filter(j=>j.purpose==='complete_content_plan');
 need(predecessor&&roots.at(-1)?.id===predecessor.id&&predecessor.task.source.sourceHash===command.basisSourceHash,'CONTENT_PROJECTION_PREDECESSOR_STALE');
 const history=project.jobs.filter(j=>j.contentRootJobId===predecessor.id);
 need(history.length===contentNodes().length&&history.every(j=>j.status==='succeeded'&&j.contentReport&&j.attempts.every(a=>a.status==='succeeded')),'CONTENT_UNKNOWN_BLOCKS');
 need(!project.jobs.some(j=>j.contentRootJobId&&j.attempts.some(a=>a.dispatchStarted&&a.status!=='succeeded')),'CONTENT_UNKNOWN_BLOCKS');
 const author=history.find(j=>j.nodeKey==='author'),qualifications=predecessor.task.source.obligations.filter(o=>o.kind==='qualification');
 need(qualifications.length===1&&author.contentReport.raw.manuscript.narrativeBlocks.some(b=>b.originIds.includes(qualifications[0].originId))&&command.finding.evidenceHash===hash({sourceHash:predecessor.task.source.sourceHash,qualification:qualifications[0],manuscriptHash:hash(author.contentReport.raw.manuscript)}),'CONTENT_PROJECTION_FINDING_CHANGED');
 const source=makeProjectedContentSource(project,predecessor.task.source),nodes=contentNodes(),assignments=command.assignments??predecessor.task.assignments;
 need(nodes.every(n=>assignments[n.key]&&['providerId','model','role'].every(k=>nonempty(assignments[n.key][k]))),'CONTENT_ASSIGNMENT_REQUIRED');
 const used=contentCalls(project),allowance=contentAllowance(project),id=`content-visibility-revision-${hash({predecessorRootJobId:predecessor.id,sourceHash:source.sourceHash,projectionHash:source.visibility.projectionHash})}`;
 const prior=project.contentVisibilityRevisionIntents?.find(i=>i.id===id);
 if(prior)return structuredClone(prior);
 const intent={id,rootJobId:contentRootId(source.sourceHash,'content-packet-v3',predecessor.id),commandId:command.commandId,commandHash:hash(command),predecessorRootJobId:predecessor.id,correctionFinding:structuredClone(command.finding),basisSourceHash:source.basisSourceHash,sourceHash:source.sourceHash,projectionHash:source.visibility.projectionHash,packetVersion:'content-packet-v3',manuscriptVersion:'complete-manuscript-v2',source,assignments:structuredClone(assignments),...(command.capabilities?{capabilities:structuredClone(command.capabilities)}:{}),requiredNodeKeys:nodes.map(n=>n.key),prospectiveCalls:nodes.length,consumedCalls:used,allowance:allowance.maxCalls,requiredCumulativeCeiling:used+nodes.length,state:used+nodes.length>allowance.maxCalls?'allowance_blocked':'local_preview_only',dispatchAllowed:false,workOrderRequired:true,renewedSourceLegs:['producer:strategy','producer:copy'],reusedVisualLeg:structuredClone(source.visualLeg),originalReports:project.jobs.filter(j=>j.contentRootJobId&&j.contentReport).map(j=>({jobId:j.id,reportId:j.contentReport.id,reportHash:hash(j.contentReport)})),acceptances:{human:null,review:null,layout:null},createdBy:structuredClone(actor)};
 project.contentVisibilityRevisionIntents??=[];project.contentVisibilityRevisionIntents.push(intent);return structuredClone(intent);
}
export function visibilityAcceptanceCurrent(intent,acceptance,manuscriptHash) {
 return Boolean(acceptance&&acceptance.packetVersion===intent.packetVersion&&acceptance.sourceHash===intent.sourceHash&&acceptance.projectionHash===intent.projectionHash&&acceptance.manuscriptHash===manuscriptHash&&nonempty(manuscriptHash)&&acceptance.rootJobId===intent.rootJobId);
}
