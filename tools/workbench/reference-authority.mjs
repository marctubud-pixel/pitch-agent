import {referenceHash as hash} from './reference-review.mjs';

const ordered=values=>[...new Map(values.map(value=>[hash(value),value])).entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,value])=>value);
const content=(value,metadata)=>Object.fromEntries(Object.entries(value??{}).filter(([key])=>!metadata.includes(key)));
const reportContent=report=>content(report,['protocolVersion','artifactId','artifactHash','taskCardId','policyVersion','ownerBinding','binding','runId','contextId','actorId','threadId','executionReceipt','envelopeHash','packetHash']);

export function referenceAuthorityKey(source){
 const upstream=Object.values(source.upstreamReviewConstraints??{}).map(constraint=>({restrictions:constraint.restrictions??[],reports:(constraint.reports??[]).map(r=>reportContent(r.rawReport)),readiness:(constraint.readiness??[]).map(r=>reportContent(r.rawReport))}));
 return hash({protocol:'reference-authority-v1',projectId:source.projectId??null,
  task:content(source.taskCard,['id','version','createdBy','createdAt','updatedAt','timestamp','context']),
  copy:{contentHash:source.source.contentHash??hash(source.source.content),content:source.source.content},
  upstreamVersions:ordered((source.sourceArtifacts??[]).filter(a=>a.id!==source.source.artifactId).map(a=>({id:a.id,stage:a.stage,contentHash:a.contentHash,inputVersionIds:[...(a.inputVersionIds??[])].sort()}))),
  sourceInputVersionIds:[...(source.sourceInputVersionIds??[])].sort(),sourceRecords:ordered(source.sourceRecords??[]),visualCatalogue:ordered(source.visualCatalogue??[]),
  restrictions:{research:source.researchRestrictionManifest??[],upstream:ordered(upstream),ownerReports:ordered((source.upstreamOwnerReports??[]).map(r=>reportContent(r.rawReport)))},
  feedback:ordered((source.feedback??[]).map(f=>({stage:f.stage,artifactHash:f.artifactHash,instructions:f.instructions,themes:f.themes,materials:ordered((f.materials??[]).map(m=>({sha256:m.sha256,intendedUse:m.intendedUse,borrowingNotes:m.borrowingNotes})))}))),
  manualReferences:ordered((source.manualReferences??[]).map(m=>({directionId:m.directionId,image:content(m.image,['imageId']),kind:m.kind,applicabilityProfile:m.applicabilityProfile,borrowingNote:m.borrowingNote})))
 });
}

export function referenceRevisionUsage(dossiers,source){
 const key=referenceAuthorityKey(source),prior=dossiers.filter(d=>d.envelope.source.source?.content&&referenceAuthorityKey(d.envelope.source)===key);
 return {key,used:Math.max(0,prior.length-1)+prior.reduce((n,d)=>n+(d.choiceEditions?.length??0),0),hasGeneration:prior.length>0};
}
