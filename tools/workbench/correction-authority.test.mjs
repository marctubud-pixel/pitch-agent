import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionSources,correctionHash,correctionFindingCreative} from './correction.mjs';
const source=(kind,protocolVersion,validatedReport,extra={})=>({kind,key:kind+':original',protocolVersion,validatedReport,...extra});
function eligibility(s,extra=[]){const sources=correctionSources([s,...extra]);return sources.flatMap(s=>s.findings.map(f=>({location:f.location,creative:correctionFindingCreative(sources,f.key)})));}

test('source-domain authority rejects evidence, readiness and handoff findings regardless of wording',()=>{
 const verification=source('verification','excerpt-support-v3',{results:[{outcome:'unsupported',category:'creative_preference'}],wholeTextScan:{omissions:[{reason:'looks creative'}],mismatchedCreative:[{reason:'creative label hides market claim'}]}});
 const readiness=source('readiness','research-readiness-v1',{findings:[{category:'creative_preference'}],coverage:[],sourceAssessments:[],visualAssessments:[],downstreamUse:{allowed:[],prohibited:[]}});
 const handoff=source('handoff','research-handoff-v1',{unresolvedIssues:[{reason:'missing material'}],understoodFindings:[],permittedUses:[],prohibitedInferences:[],decision:'blocked'});
 for(const s of [verification,readiness,handoff]){const found=eligibility(s);assert.ok(found.length);assert.ok(found.every(f=>!f.creative));}
});

test('original feedback and creative-panel categories govern waiver eligibility rather than later reviewer preference',()=>{
 const feedback=source('feedback_review','human-feedback-v1',{findings:[{status:'unresolved',category:'factual_risk'},{status:'unresolved',category:'missing_material'},{status:'unresolved',category:'creative_preference'}]});
 assert.deepEqual(eligibility(feedback).map(f=>f.creative),[false,false,true]);
 const creative=source('creative_panel','creative-copy-message-v3',{issues:[{id:'fact',category:'factual_risk'},{id:'scope',category:'scope'},{id:'style',category:'creative'}],challenges:[{id:'missing',issue:{category:'scope'}}],items:[],groupComparisons:[]},{panelState:{panelId:'p',phase:'score',nodeKey:'brand:score',stage:'copy',complete:true}});
 assert.deepEqual(eligibility(creative).map(f=>f.creative),[false,false,true,false]);
 const scores=source('creative_panel','creative-copy-message-v3',{issues:[],challenges:[],items:[{subjectId:'one',verdict:'revise',dimensions:[{required:true,status:'unknown',claimId:'missing',score:null},{required:true,status:'scored',claimId:'weak',score:2}]}],groupComparisons:[]},{panelState:{panelId:'p',phase:'score',nodeKey:'brand:score',stage:'copy',complete:true}});
 assert.deepEqual(eligibility(scores).map(f=>f.creative),[false,true]);
});

test('prior correction recursively retains nonwaivable source authority even if a prior output called it creative',()=>{
 const originals=correctionSources([source('verification','excerpt-support-v2',{results:[{outcome:'unsupported'}],wholeTextScan:{omissions:[],mismatchedCreative:[]}})]);
 const wrap=original=>correctionSources([source('correction_review','correction-handling-v1',{sourceSetHash:correctionHash(original),findings:original.flatMap(s=>s.findings.map(f=>({findingKey:f.key,status:'unresolved',category:'creative_preference'}))),preservationCheck:{status:'complete',violations:[]}},{reviewedSources:original})]);
 const once=wrap(originals),twice=wrap(once);assert.equal(correctionFindingCreative(once,once[0].findings[0].key),false);assert.equal(correctionFindingCreative(twice,twice[0].findings[0].key),false);
 const human=correctionSources([{kind:'human',key:'human:h',feedback:{id:'h',instructions:'口语主题'}}]);const creative=wrap(human);assert.equal(correctionFindingCreative(creative,creative[0].findings[0].key),true);
 const bad=structuredClone(once);delete bad[0].reviewedSources;assert.throws(()=>correctionFindingCreative(bad,bad[0].findings[0].key),/exact reviewed source authority/);
});

test('mixed v1, v2 and v3 recursive correction sources preserve factual authority and human creative authority',()=>{
 const wrap=(original,protocolVersion)=>correctionSources([source('correction_review',protocolVersion,{sourceSetHash:correctionHash(original),findings:original.flatMap(s=>s.findings.map(f=>({findingKey:f.key,status:'unresolved',category:'creative_preference'}))),preservationCheck:{status:'complete',violations:[{kind:'omission',reason:'Preserve original qualification'}]}},{reviewedSources:original})]);
 for(const versions of [['correction-handling-v1','correction-handling-v2'],['correction-handling-v2','correction-handling-v1'],['correction-handling-v2','correction-handling-v2'],['correction-handling-v1','correction-handling-v3'],['correction-handling-v3','correction-handling-v2'],['correction-handling-v3','correction-handling-v3']]){
  for(const [original,eligible]of [[correctionSources([source('verification','excerpt-support-v3',{results:[{outcome:'unsupported'}],wholeTextScan:{omissions:[],mismatchedCreative:[]}})]),false],[correctionSources([{kind:'human',key:'human:h',feedback:{id:'h',instructions:'Conversational creative direction'}}]),true]]){
   const once=wrap(original,versions[0]),twice=wrap(once,versions[1]);
   assert.equal(correctionFindingCreative(twice,twice[0].findings[0].key),eligible);
   assert.equal(correctionFindingCreative(twice,twice[0].findings.at(-1).key),false);
   assert.ok(twice[0].constraints.some(c=>c.location==='/preservationCheck'));
  }
 }
});
