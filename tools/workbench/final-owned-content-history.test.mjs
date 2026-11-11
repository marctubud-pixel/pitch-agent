import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ingestContent} from './complete-content.mjs';
import {contentHistorySemantics} from './content-original.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {closeOwnedContentHistory} from './final-owned-content-history.mjs';

function fixture(){
 const obligation={originId:'source/title',artifactId:'source',pointer:'/title',owner:'copy-lead',kind:'text',value:'Synthetic title'};
 const evidence=[{originId:obligation.originId,observation:'Synthetic observation'}];
 const payload={id:'f',category:'fact',blocking:true,description:'Synthetic finding',artifactId:'source',pointer:'/title',owner:'copy-lead',acceptance:'Correct original',evidence};
 const manuscript={visibleObligations:[{originId:obligation.originId,value:obligation.value,blockIds:['b'],imageIds:['related'],pageIntentIds:['page']}],pageIntents:[{id:'page',blockIds:['b'],imageIds:['related','adjacent']}],narrativeBlocks:[{id:'b',text:'Synthetic title',originIds:[obligation.originId]}]};
 const base={protocol:'complete-content-v1',sourceHash:'source-hash',neutral:{visual:{artifactId:'visual'},obligations:[obligation]},images:[],manuscript};
 const firstInput={...base,nodeKey:'first:content',phase:'first',envelopeHash:'first-envelope',predecessors:[]};
 const first={protocol:base.protocol,nodeKey:firstInput.nodeKey,envelopeHash:firstInput.envelopeHash,findings:[payload],verdict:'return',reading:'Synthetic reading',evidence,imageEvidence:[]};
 const directorInput={...base,nodeKey:'director',phase:'director',envelopeHash:'director-envelope',findings:[{...payload,originId:'job-first#f'}],predecessors:[{jobId:'job-first',nodeKey:firstInput.nodeKey,raw:first,findings:[{...payload,originId:'job-first#f'}]},{jobId:'job-first',nodeKey:firstInput.nodeKey,raw:first,findings:[{...payload,originId:'job-first#f'}]}]};
 const director={protocol:base.protocol,nodeKey:'director',envelopeHash:directorInput.envelopeHash,findings:[],decision:'return',dispositions:[{findingOriginId:'job-first#f',outcome:'sustained',reason:'Synthetic reason',evidence}],criteria:['completeness','factual_boundaries','sources','visual_copy','page_intents','limitations'].map(name=>({name,status:'fail',evidence}))};
 const jobs=[['job-first','report-first',firstInput,first],['job-director','report-director',directorInput,director]].map(([id,reportId,input,raw])=>{
  const parsed=ingestContent(input,{responseText:JSON.stringify(raw)});assert.equal(parsed.valid,true,JSON.stringify(parsed.diagnostics));
  return {id,purpose:'complete_content_review',attempts:[],inputVersionIds:[],contentReport:{id:reportId,raw:parsed.raw},semantics:contentHistorySemantics(input,parsed,id)};
 });
 const project={id:'synthetic-project',revision:1,artifacts:[],taskCards:[],jobs:jobs.map(({semantics,...j})=>j)};
 const index=indexFinalHistoryRecords(project),selected={reportAnchors:index.reportAnchors,findingOccurrences:index.findingOccurrences,targetOccurrences:index.targetOccurrences};
 const checked={facts:jobs.map(j=>({checked:{kind:'content-original',jobId:j.id,reportId:j.contentReport.id,raw:j.contentReport.raw,historySemantics:j.semantics},checkedRawAnchors:index.reportAnchors.filter(a=>a.identity===j.contentReport.id)}))};
 return {selected,checked,dispositions:index.dispositions,trusted:{source:{sourceHash:base.sourceHash,obligations:[obligation]},contract:{manuscript}},materials:['related','adjacent','unrelated'].map(identity=>({identity,file:{state:'present',value:{sha256:identity,originalPath:`/synthetic/${identity}`}}})),roleMaterialScopes:['content','visual','brand','user','communication'].map(role=>({role,applicability:{state:'present',value:['related','adjacent','unrelated'].map(materialIdentity=>({materialIdentity,decision:{state:'present',value:{required:role==='content'}}}))}}))};
}

test('real content parser and producer feed selected indexed occurrences with exact placement applicability',()=>{
 const f=fixture(),result=closeOwnedContentHistory(f);
 assert.deepEqual(result.closedFindingIdentities,f.selected.findingOccurrences.map(o=>o.identity));
 assert.deepEqual(result.findings[0].applicableObligations.map(o=>o.materialIdentity),['related','adjacent']);
 assert.equal(result.dispositions[0].findingIdentity,f.selected.findingOccurrences[0].identity);
 assert.equal(result.dispositions[0].originalProof.reportVersion,f.dispositions[0].originalReportVersion);
 assert.equal(result.predecessorInputs.length,2);
 assert.deepEqual(result.predecessorInputs.map(p=>p.inputPointer),['/predecessors/0','/predecessors/1']);
 assert.equal(result.predecessorInputs[0].predecessorReportVersion,f.selected.reportAnchors[0].version);
});
for(const mutation of ['payload','version','host','scope','placement','source','duplicate'])test(`content closure retains ${mutation} mismatch as unresolved`,()=>{
 const f=fixture();
 if(mutation==='payload')f.selected.findingOccurrences[0].exactOriginalPayload.description='changed';
 if(mutation==='version')f.selected.findingOccurrences[0].originalReportVersion='changed';
 if(mutation==='host')f.checked.facts[0].checkedRawAnchors[0].host.id='changed';
 if(mutation==='scope')f.roleMaterialScopes[0].applicability.value[0].decision={state:'missing'};
 if(mutation==='placement')delete f.trusted.contract.manuscript.visibleObligations;
 if(mutation==='source')f.trusted.source.sourceHash='changed';
 if(mutation==='duplicate')f.checked.facts.push(structuredClone(f.checked.facts[0]));
 const result=closeOwnedContentHistory(f);assert.deepEqual(result.closedFindingIdentities,[]);assert.deepEqual(result.closedDispositionPointers,[]);
});
test('unselected and altered disposition occurrences never close',()=>{
 const f=fixture();f.dispositions[0].value.reason='changed';assert.deepEqual(closeOwnedContentHistory(f).closedDispositionPointers,[]);
 const g=fixture();g.selected.reportAnchors=g.selected.reportAnchors.slice(0,1);assert.deepEqual(closeOwnedContentHistory(g).closedDispositionPointers,[]);
});
test('invalid real content parse cannot produce history semantics',()=>{
 const f=fixture(),input={phase:'first',neutral:{visual:{},obligations:[]},images:[]};
 const parsed=ingestContent(input,{responseText:'{"findings":[]}'});assert.equal(parsed.valid,false);assert.equal(contentHistorySemantics(input,parsed,'synthetic-job'),null);
});
