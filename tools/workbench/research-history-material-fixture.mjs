import assert from 'node:assert/strict';
import {closeGenericReviewHistory} from './final-generic-history-semantics.mjs';
import {deriveFinalMaterialDuties} from './final-preparation-materials.mjs';
import {obligationsFor} from './complete-content.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';
export function researchMaterialCases(p,index,originals,occurrence,envelope,contents,{mutations=true}={}){
 const strategy={artifactId:envelope.source.artifactId,contentHash:envelope.source.contentHash,content:envelope.source.content};
 const restriction=envelope.researchRestrictionManifest.find(r=>r.originKey===occurrence.domainFindingId);
 const source={strategy,copy:{artifactId:'unrelated-copy'},images:['strategy-image','unrelated-image'].map((imageId,i)=>({imageId,sha256:String(i+1).repeat(64),byteLength:4,width:2,height:2})),obligations:[{originId:restriction.originKey,artifactId:strategy.artifactId,pointer:'/researchRestrictionManifest',owner:'strategy-lead',kind:'restriction',value:structuredClone(restriction)},{originId:'unrelated-copy',artifactId:'unrelated-copy',pointer:'/summary',owner:'copy-lead',kind:'text',value:'unrelated'}]};
 const manuscript={narrativeBlocks:[],visibleObligations:[],pageIntents:[],edits:[]};
 for(const [i,o]of source.obligations.entries()){
  const imageId=o.artifactId===strategy.artifactId?'strategy-image':'unrelated-image',blockId=`block-${i}`,pageId=`page-${i}`;
  manuscript.narrativeBlocks.push({id:blockId,text:JSON.stringify(o.value),originIds:[o.originId]});
  manuscript.visibleObligations.push({originId:o.originId,value:structuredClone(o.value),blockIds:[blockId],imageIds:[imageId],pageIntentIds:[pageId]});
  manuscript.pageIntents.push({id:pageId,blockIds:[blockId],imageIds:[imageId]});
 }
 source.sourceHash=hash(source);
 const materials=source.images.map(row=>({identity:row.imageId,kind:'source_image',sourceRow:row,file:{state:'present',value:{sha256:row.sha256,bytes:4,originalPath:`/synthetic/${row.imageId}.png`}},dimensions:{state:'present',value:{boundSha256:row.sha256,boundBytes:4,width:2,height:2}}}));
 const slides=manuscript.pageIntents.map((page,i)=>({id:`slide-${i}`,originId:page.id,elements:[{id:`image-${i}`,occurrenceId:`occurrence-${i}`,assetId:page.imageIds[0],contentRefs:{imageIds:page.imageIds,obligationOrigins:[source.obligations[i].originId]}}]}));
 const layout={slides,placements:slides.flatMap(s=>s.elements.map(e=>({intentId:s.originId,slideId:s.id,elementId:e.id,occurrenceId:e.occurrenceId,...e.contentRefs}))),imageResources:Object.fromEntries(source.images.map(i=>[i.imageId,{sha256:i.sha256,byteLength:4,width:2,height:2}]))};
 const native={editions:[{originalAttemptId:'synthetic-native-contract',layoutManifest:{sha256:hash(layout),raw:layout}}]};
 const trusted={source,contentHash:hash(manuscript),contract:{rootJobId:'synthetic-content-root',artifactId:'synthetic-manuscript',manuscript,manuscriptHash:hash(manuscript),sourceLocations:[]}},catalog={rows:[],entries:[]};
 const selected={reportAnchors:originals.flatMap(f=>f.checkedRawAnchors),findingOccurrences:index.findingOccurrences,targetOccurrences:index.targetOccurrences};
 p=structuredClone(p);p.jobs.push({id:trusted.contract.rootJobId,purpose:'content_root',attempts:[],inputVersionIds:[],outputVersionIds:[],task:{source:structuredClone(source),sourceContents:structuredClone(contents)}});
 const args={planning:p,checked:{facts:originals},selected,occurrences:[occurrence],trusted,catalog,native,materials,roleMaterialScopes:deriveFinalMaterialDuties({trusted,catalog,native,materials})};

 const actual=closeGenericReviewHistory(args);assert.deepEqual(actual.blockers,[]);assert.equal(actual.findings.length,1);
 const finding=actual.findings[0];assert(finding.applicableObligations.length===5&&finding.applicableObligations.every(o=>o.materialIdentity==='strategy-image'));
 assert.equal(finding.applicabilityProof.researchRestriction.assessment.judgment.procurement.state,'missing');
 assert.equal(finding.applicabilityProof.sourceOriginalAddresses[0].domain,'delivery_envelope');
 assert.equal(finding.applicabilityProof.reviewedArtifact.artifactId,originals.find(f=>f.checked.source.reportId===occurrence.reportIdentity).checked.source.targetArtifactId);
 assert.notEqual(finding.applicabilityProof.reviewedArtifact.artifactId,strategy.artifactId);
 assert.deepEqual(finding.exactOriginalPayload,occurrence.rawValue);assert.deepEqual(actual.dispositions,[]);
 let negative=0;
 if(mutations){
 const blocked=(edit)=>{const changed=structuredClone(args);edit(changed);const result=closeGenericReviewHistory(changed);assert(result.blockers.length,JSON.stringify(result));assert.equal(result.closedFindingKeys.length,0);negative++;};
 blocked(a=>a.checked.facts=a.checked.facts.filter(f=>f.checked.source.kind!=='handoff'));
 blocked(a=>a.checked.facts=a.checked.facts.filter(f=>f.checked.source.protocolVersion!=='research-readiness-v2'));
 blocked(a=>a.checked.facts.find(f=>f.checked.source.kind==='handoff').checked.frozenInput.assessment.id='crossbound');
 blocked(a=>a.checked.facts.find(f=>f.checked.source.kind==='handoff').checked.source.validatedReport.restrictionDispositions=[]);
 blocked(a=>a.checked.facts.find(f=>f.checked.source.protocolVersion==='research-readiness-v2').checked.frozenInput.applicability.sources=[]);
 blocked(a=>a.checked.facts.find(f=>f.checked.source.protocolVersion==='research-readiness-v2').checked.frozenInput.applicability.origins[0].originalValue.rationale='mutated');
 blocked(a=>a.trusted.source.obligations[0].value.prohibitedUse='widened');
 blocked(a=>{a.trusted.source.obligations=[];a.planning.jobs.at(-1).task.source=structuredClone(a.trusted.source);});
 blocked(a=>a.planning.jobs.at(-1).task.sourceContents[0].contentText+=' ');
 blocked(a=>a.planning.activeByStage.strategy='crossbound');
 blocked(a=>a.selected.reportAnchors=a.selected.reportAnchors.filter(x=>x.identity!==originals.find(f=>f.checked.source.kind==='handoff').checked.source.reportId));
 blocked(a=>{a.trusted.contract.manuscript.visibleObligations=[];a.trusted.contract.manuscriptHash=hash(a.trusted.contract.manuscript);a.roleMaterialScopes=deriveFinalMaterialDuties(a);});
 blocked(a=>a.checked.facts.find(f=>f.checked.source.protocolVersion==='research-readiness-v2').checked.source.validatedReport.obligationAssessments[0].reason='changed independent judgment');
 blocked(a=>{const handoff=a.checked.facts.find(f=>f.checked.source.kind==='handoff');handoff.checked.frozenInput.ownerBinding.model='crossbound';handoff.checked.source.handoffInput=structuredClone(handoff.checked.frozenInput);});
 blocked(a=>{a.planning.jobs.at(-1).task.sourceContents=a.planning.jobs.at(-1).task.sourceContents.filter(c=>c.artifactId!==a.planning.activeByStage.research);});
 blocked(a=>{const original=a.checked.facts.find(f=>f.checked.source.reportId===occurrence.reportIdentity);original.checked.source.rawReport.findings[0].rationale='mutated immutable original';});
 const originalSnapshot=structuredClone(args);closeGenericReviewHistory(args);assert.deepEqual(args,originalSnapshot,'Closure must not mutate checked originals or current content contracts');
 }
 return {finding:structuredClone(finding),positiveFindings:actual.findings.length,negativeCases:negative,conditionalEvidenceState:'missing',unrelatedMaterialExcluded:true,scope:'Actual research/assessment/handoff and current envelope producers with synthetic current content/native material contracts. No final capture.'};
}
