import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyFinalCallOriginal,createFinalCallSettlement} from './final-review-call-original.mjs';

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject,applyCommand} from './project.mjs';
import {planFinalReview} from './final-review-input.mjs';
import {fixture} from './final-review-input-fixture.mjs';
import {layoutHash} from './layout-boundary.mjs';
import {finalReviewMetadataBasis,finalReviewCallAccounting,compactFinalReviewPlan} from './final-review-authority.mjs';
import {finalCallTargetCatalog,finalCallHash,decodeFinalCallJSON} from './final-review-call.mjs';
const ctx={actorType:'agent',actorId:'local-final-runtime',runId:'setup-run',contextId:'setup-context',now:'2026-10-28T00:00:00Z'};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clone=structuredClone;
const command=(p,kind,fields={},context=ctx)=>applyCommand(p,{commandId:`command-${p.revision}-${kind}`,expectedRevision:p.revision,kind,...fields},context);
function owned({selected=false,totalCalls=1000,reportBoundBytes=null}={}) {
  const p=clone(createProject({id:'project',name:'Owned metadata fixture',brief:'Owned proposal fixture',mode:selected?'assisted':'auto',humanGates:selected?['final_review']:[]},ctx));
  const f=fixture({policy:p.policies[0],taskIdentity:p.activeTaskCardId}),s=f.snapshot,c=s.content.trusted.contract;
  if(reportBoundBytes!==null)for(const profile of f.configuration.assignmentPolicy.profiles){profile.reportBoundBytes=reportBoundBytes;profile.context.maxOutputBytes=reportBoundBytes;}
  const ownerProfile=f.configuration.assignmentPolicy.profiles.find(x=>x.identity==='owners');ownerProfile.reportBoundBytes=16384;ownerProfile.context.maxOutputBytes=16384;
  const b=s.layout.exactBinding;
  Object.assign(b,{protocol:'project-layout-v1',taskCardId:p.activeTaskCardId});s.layout.bindingIdentity=layoutHash(b);
  s.project.observedRevision=p.revision;s.history.retained.originalAttempts=[];
  s.allowance.value={authorityIdentity:'owned-local-policy',totalCalls,reservedOtherCalls:0};s.humanFinalGate.value.selected=selected;
  p.activeByStage.content_review=c.artifactId;
  p.artifacts.push({id:c.artifactId,stage:'content_review',author:{actorId:'owned-content-creator'},contentHash:s.content.trusted.contentHash,completeContent:{rootJobId:c.rootJobId,manuscriptHash:c.manuscriptHash}});
  p.jobs.push({id:c.rootJobId,purpose:'complete_content_plan',status:'succeeded',attempts:[],task:{packetVersion:'content-packet-v3',source:s.content.trusted.source}});
  p.releases.push({artifactId:c.artifactId,policyVersion:p.policies[0].version,sourceHash:b.sourceHash});
  for(const [index,e] of s.editions.value.entries()) {
    const id=index===0?s.layout.rootJobId:e.originalExportJobId;e.originalExportJobId=id;
    const receipt={operation:'local-native-export',model:null,cost:null,costStatus:'unknown',attemptId:e.originalAttemptId,bindingHash:s.layout.bindingIdentity,style:e.style,anchorPath:e.anchor.originalPath,anchorHash:e.anchor.sha256};
    p.jobs.push({id,purpose:'layout_export',stage:'layout',status:'succeeded',attempts:[{id:e.originalAttemptId,status:'succeeded',receipt:clone(receipt)}],receipt,task:{bindingHash:s.layout.bindingIdentity,style:e.style,...(index===0?{binding:clone(b)}:{rootJobId:s.layout.rootJobId})}});
  }
  const proposal={protocol:'final-review-authority-v1',basedOnRevision:p.revision,basis:finalReviewMetadataBasis(p,s.layout.rootJobId),materials:s.materials.map(m=>({identity:m.identity,correspondenceHash:finalCallHash(m)})),roleMaterialScopes:clone(s.roleMaterialScopes),owners:Object.fromEntries(Object.entries(s.owners).map(([k,v])=>[k,clone(v.value)])),configuration:clone(f.configuration),allowance:{authorityIdentity:'owned-local-policy',totalCalls,provenance:'Owned local test allowance; no provider call'}};
  for(const scope of proposal.roleMaterialScopes)for(const cell of scope.applicability.value)cell.reason='Owned fixture evidence, not verified external facts';
  s.roleMaterialScopes=clone(proposal.roleMaterialScopes);
  const planned=planFinalReview(s,f.configuration);
  assert.equal(planned.kind,'planned',JSON.stringify(planned.blockers));
  return {p,proposal,plan:compactFinalReviewPlan(planned.plan),full:planned.plan,f};
}
const configure=o=>command(o.p,'set-final-review-authority',{authority:o.proposal});
const reserve=(p,plan)=>command(p,'reserve-final-review-plan',{setupId:p.finalReviewSetups.at(-1).id,plan});

export {owned,ctx,command,configure,reserve};
