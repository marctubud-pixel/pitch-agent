import test from 'node:test';
import assert from 'node:assert/strict';
import {REFERENCE_DIMENSIONS,referenceReviewNodes,referenceReviewInput,buildReferenceReviewRequest,validateReferenceReviewOutput,referenceReviewIssues,referenceQualifiedUses,referenceParetoFrontier,referencePacketOutcome} from './reference-review.mjs';
import {referenceReviewFixturePacket,referenceReviewFixtureOutput,referenceReviewFixtureReports} from './reference-review-fixtures.mjs';

const clone=structuredClone;
const pixel=(input,index=0)=>({kind:'pixel',imageId:input.images[index].imageId,imageHash:input.images[index].sha256,region:[0,0,1,1],pointer:null,quote:null,observation:'Fixture image observation.'});
const pointer=(path,quote)=>({kind:'pointer',imageId:null,imageHash:null,region:null,pointer:path,quote,observation:'Fixture exact text observation.'});
const finding=(input,{category='use_card',id='issue_one'}={})=>({id,category,owner:'reference-lead',pointer:'/images/0',evidence:[pixel(input)],impact:'Fixture bounded impact.',acceptance:'Resolve the exact fixture issue.'});
function subject({phase='score',role='visual',packet=referenceReviewFixturePacket()}={}) {
  const reports=referenceReviewFixtureReports(packet),node=referenceReviewNodes(packet.id).find(node=>node.phase===phase&&node.role===role);
  const input=referenceReviewInput(packet,node,reports);
  return {packet,reports,node,input,raw:referenceReviewFixtureOutput(input)};
}
const invalid=(callback,pattern)=>assert.throws(callback,error=>error.code==='INVALID_REFERENCE_REVIEW'&&(!pattern||pattern.test(error.message)));

test('seventeen nodes isolate both first reads and each paired score',()=>{
  const packet=referenceReviewFixturePacket(),nodes=referenceReviewNodes(packet.id),reports=referenceReviewFixtureReports(packet);
  assert.equal(nodes.length,17);
  for(const role of Object.keys(REFERENCE_DIMENSIONS)) {
    for(const phase of ['first_read','opposition_first_read']) {
      const input=referenceReviewInput(packet,nodes.find(n=>n.role===role&&n.phase===phase),reports);
      assert.deepEqual(Object.keys(input),['protocolVersion','packetId','packetHash','phase','role','scope','images','minimalFacts']);
      assert.equal(input.images.length,2);
    }
    const score=referenceReviewInput(packet,nodes.find(n=>n.role===role&&n.phase==='score'),reports);
    assert.deepEqual(score.reports.map(r=>r.report.phase),['first_read']);
    const opposition=referenceReviewInput(packet,nodes.find(n=>n.role===role&&n.phase==='opposition'),reports);
    assert.deepEqual(opposition.reports.map(r=>r.report.phase),['opposition_first_read','score']);
    assert.ok(opposition.reports.every(r=>r.report.role===role));
  }
});

test('input snapshots retain immutable originals and hypotheses',()=>{
  const {packet,input}=subject();
  packet.uses[0].translation='Mutated after freezing';
  packet.images[0].sha256='f'.repeat(64);
  assert.notEqual(input.uses[0].translation,packet.uses[0].translation);
  assert.notEqual(input.images[0].sha256,packet.images[0].sha256);
});

test('frozen role dimensions cannot be changed in place',()=>{
  assert.throws(()=>REFERENCE_DIMENSIONS.visual.push('mean'));
});

test('unknown nodes, altered dependencies, stale or duplicate predecessor slots fail closed',()=>{
  const {packet,node,reports}=subject();
  invalid(()=>referenceReviewInput(packet,{...node,dependencies:[]},reports),/node/);
  invalid(()=>referenceReviewInput(packet,node,[...reports,reports[0]]),/Unique/);
  const stale=clone(reports);stale[0].rawReport.packetHash='f'.repeat(64);
  invalid(()=>referenceReviewInput(packet,node,stale),/predecessor/);
  invalid(()=>referenceReviewInput(packet,node,[]),/predecessor/);
});

test('first-read requests reject added creator hypotheses',()=>{
  const {input}=subject({phase:'first_read'});
  input.uses=[];
  invalid(()=>buildReferenceReviewRequest(input),/First reads/);
});

test('exact nested schema rejects invented scores, fields, nullable values, and malformed arrays',()=>{
  const {raw,input}=subject();
  const attacks=[r=>r.evaluations[0].dimensions[0].overall=5,r=>r.evaluations[0].dimensions[0].score=4.5,
    r=>r.evaluations[0].dimensions[0].score=Infinity,r=>r.evaluations[0].dimensions[0].reason=' ',
    r=>r.evaluations[0].dimensions[0].evidence=null,r=>r.evaluations[0].decision='approved',
    r=>r.evaluations[0].hardRejects={},r=>r.limitations=[],r=>r.limitations=[42],r=>r.evaluations=null];
  for(const attack of attacks){const changed=clone(raw);attack(changed);invalid(()=>validateReferenceReviewOutput(changed,input));}
});

test('every original must have one neutral pixel read with its own hash',()=>{
  const {raw,input}=subject({phase:'first_read'});
  raw.readings[1].evidence=[pixel(input,0)];
  invalid(()=>validateReferenceReviewOutput(raw,input),/its original/);
  raw.readings[1].evidence=[pixel(input,1)];raw.readings[1].evidence[0].imageHash='f'.repeat(64);
  invalid(()=>validateReferenceReviewOutput(raw,input),/attached original/);
});

test('ordered original binding rejects image swaps and foreign packet outputs',()=>{
  const {raw,input}=subject();
  raw.images.reverse();invalid(()=>validateReferenceReviewOutput(raw,input),/originals/);
  raw.images.reverse();raw.packetId='foreign';invalid(()=>validateReferenceReviewOutput(raw,input));
});

test('pixel regions and exact pointer quotes cannot be fabricated',()=>{
  const {raw,input}=subject();
  const evidence=raw.evaluations[0].dimensions[0].evidence;
  for(const region of [[0,0,0,1],[1,0,0,1],[0,0,1,2]]) {
    evidence[0]={...pixel(input),region};invalid(()=>validateReferenceReviewOutput(raw,input));
  }
  evidence[0]=pixel(input);
  evidence.push(pointer('/uses/0/translation','Words absent from the card'));
  invalid(()=>validateReferenceReviewOutput(raw,input),/Exact visible/);
  evidence[1]=pointer('/uses/0/__proto__/constructor','Object');
  invalid(()=>validateReferenceReviewOutput(raw,input),/Exact visible/);
});

test('components enforce only three applicable dimensions and communication boundary clearance',()=>{
  const packet=referenceReviewFixturePacket({scope:'combination',kinds:['direction','component']}),reports=referenceReviewFixtureReports(packet);
  for(const entry of reports.filter(entry=>entry.rawReport.phase==='score')) {
    const report=entry.rawReport,evaluation=report.evaluations[1];
    assert.equal(evaluation.decision,report.role==='communication'?'boundary_clear':'pass_component');
    assert.deepEqual(evaluation.dimensions.map(d=>d.score),report.role==='communication'?[null,null]:[4,null]);
  }
  assert.equal(referencePacketOutcome(packet,reports).status,'diagnostic');
  const {raw,input}=subject({packet,role:'communication'});
  raw.evaluations[1].dimensions[0].evidence=[pixel(input,1)];
  invalid(()=>validateReferenceReviewOutput(raw,input),/prohibited copying/);
});

test('not-applicable cannot hide a failed direction or invent component approval',()=>{
  const {raw,input}=subject();
  Object.assign(raw.evaluations[0].dimensions[0],{status:'not_applicable',score:null});
  invalid(()=>validateReferenceReviewOutput(raw,input),/Applicability/);
  const component=subject({packet:referenceReviewFixturePacket({scope:'combination',kinds:['direction','component']}),role:'communication'});
  Object.assign(component.raw.evaluations[1].dimensions[0],{status:'scored',score:4});
  invalid(()=>validateReferenceReviewOutput(component.raw,component.input),/Applicability/);
});

test('applicability profile cannot silently turn a composition component into material N/A',()=>{
  for(const profile of [undefined,'local_composition','direction']) {
    const packet=referenceReviewFixturePacket({scope:'combination',kinds:['direction','component']});
    packet.uses[1].applicabilityProfile=profile;
    invalid(()=>referenceReviewInput(packet,referenceReviewNodes(packet.id)[0],[]),/return card to reference-lead/);
  }
});

test('known missing translation is discovered, scores 3 where relevant and outranks external unknown',()=>{
  const packet=referenceReviewFixturePacket();packet.uses[0].translation='';
  const nodes=referenceReviewNodes(packet.id),prior=[];
  for(const node of nodes.filter(node=>node.phase.endsWith('first_read'))) {
    const input=referenceReviewInput(packet,node,prior);
    prior.push({nodeKey:node.key,rawReport:validateReferenceReviewOutput(referenceReviewFixtureOutput(input),input)});
  }
  const input=referenceReviewInput(packet,nodes.find(n=>n.role==='brand'&&n.phase==='score'),prior),raw=referenceReviewFixtureOutput(input);
  invalid(()=>validateReferenceReviewOutput(raw,input),/missing card/);
  raw.evaluations[0].missingFields=['translation'];raw.evaluations[0].decision='revise_card';
  invalid(()=>validateReferenceReviewOutput(raw,input),/require 3/);
  raw.evaluations[0].dimensions[1].score=3;
  Object.assign(raw.evaluations[0].dimensions[0],{status:'unknown',score:null,reason:'External brand evidence unavailable.'});
  assert.equal(validateReferenceReviewOutput(raw,input).evaluations[0].decision,'revise_card');
});

test('external unknown remains cannot_assess and never becomes N/A or a fabricated score',()=>{
  const {raw,input}=subject();
  Object.assign(raw.evaluations[0].dimensions[0],{status:'unknown',score:null,reason:'External detail unavailable.'});
  raw.evaluations[0].decision='cannot_assess';
  assert.equal(validateReferenceReviewOutput(raw,input).evaluations[0].decision,'cannot_assess');
  raw.evaluations[0].dimensions[0].score=4;invalid(()=>validateReferenceReviewOutput(raw,input),/no score/);
});

test('H1 and H2 override missing-card repair without degrading unrelated visual quality',()=>{
  for(const rule of ['H1','H2']) {
    const {raw,input}=subject();
    input.uses[0].translation='';raw.evaluations[0].missingFields=['translation'];
    raw.evaluations[0].hardRejects=[{...finding(input,{category:'hard_reject'}),rule,evidence:[pixel(input),pointer('/uses/0/comparisonScope',input.uses[0].comparisonScope)]}];
    raw.evaluations[0].decision='revise_card';invalid(()=>validateReferenceReviewOutput(raw,input),/precedence/);
    raw.evaluations[0].decision='reject_use';
    assert.equal(validateReferenceReviewOutput(raw,input).evaluations[0].dimensions[0].score,4);
  }
});

test('score five requires an explicit declared comparator',()=>{
  const {raw,input}=subject();raw.evaluations[0].dimensions[0].score=5;
  invalid(()=>validateReferenceReviewOutput(raw,input),/comparator/);
  raw.evaluations[0].dimensions[0].evidence.push(pointer('/uses/0/comparisonScope',input.uses[0].comparisonScope));
  invalid(()=>validateReferenceReviewOutput(raw,input),/original pixels/);
  raw.evaluations[0].dimensions[0].evidence.push(pixel(input,1));
  assert.equal(validateReferenceReviewOutput(raw,input).evaluations[0].dimensions[0].score,5);
});

test('report-wide issue IDs cannot repeat in both issues and hard rejection',()=>{
  const {raw,input}=subject(),issue=finding(input,{category:'hard_reject'});
  raw.issues=[issue];raw.evaluations[0].hardRejects=[{...issue,rule:'other'}];raw.evaluations[0].decision='reject_use';
  invalid(()=>validateReferenceReviewOutput(raw,input),/Unique issue/);
});

test('findings require existing pointers and their actual responsible owner',()=>{
  const {raw,input}=subject();raw.issues=[finding(input)];raw.issues[0].pointer='/invented';
  invalid(()=>validateReferenceReviewOutput(raw,input),/pointer/);
  raw.issues[0].pointer='/uses/0';raw.issues[0].owner='research-lead';
  invalid(()=>validateReferenceReviewOutput(raw,input),/responsible owner/);
});

test('complete combination and three-direction overview inspect all original pairs',()=>{
  for(const scope of ['combination','overview']) {
    const packet=referenceReviewFixturePacket({scope,kinds:['direction','direction','direction']}),{raw,input}=subject({packet});
    assert.equal(raw.comparisons.length,3);
    assert.equal(referencePacketOutcome(packet,referenceReviewFixtureReports(packet)).status,'diagnostic');
    raw.comparisons[2]=clone(raw.comparisons[0]);invalid(()=>validateReferenceReviewOutput(raw,input),/pair coverage/);
  }
});

test('comparison cannot cite only one original or omit a real pair',()=>{
  const {raw,input}=subject({packet:referenceReviewFixturePacket({scope:'combination'})});
  raw.comparisons[0].evidence=[pixel(input)];invalid(()=>validateReferenceReviewOutput(raw,input),/both originals/);
  raw.comparisons=[];invalid(()=>validateReferenceReviewOutput(raw,input),/pair coverage/);
});

test('opposition targets only omissions or its paired score assertions',()=>{
  const {raw,input}=subject({phase:'opposition'});raw.challenges=[{...finding(input),target:'other_role/use'}];
  invalid(()=>validateReferenceReviewOutput(raw,input),/paired score/);
  raw.challenges[0].target='use_0/expression_quality';
  assert.equal(validateReferenceReviewOutput(raw,input).challenges.length,1);
});

test('director must adjudicate every finding with exact ownership, acceptance and prior evidence',()=>{
  const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet,{mutateReport(raw,input){if(input.phase==='first_read'&&input.role==='visual')raw.issues=[finding(input)];}});
  const node=referenceReviewNodes(packet.id).at(-1),input=referenceReviewInput(packet,node,reports),raw=referenceReviewFixtureOutput(input);
  assert.equal(referenceReviewIssues(input.reports).length,1);
  for(const attack of [r=>r.adjudications=[],r=>r.adjudications[0].owner='strategy-lead',r=>r.adjudications[0].acceptance='weakened',r=>r.adjudications[0].evidence=[pixel(input)],r=>r.adjudications[0].evidence=r.adjudications[0].evidence.filter(e=>e.kind==='pointer')]) {
    const changed=clone(raw);attack(changed);invalid(()=>validateReferenceReviewOutput(changed,input));
  }
});

test('director schema preserves more than one hundred findings across separate reports',()=>{
  const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet,{mutateReport(raw,input){
    if(input.role==='visual'&&input.phase.endsWith('first_read'))raw.issues=Array.from({length:60},(_,index)=>finding(input,{id:`issue_${index}`}));
  }});
  assert.equal(reports.at(-1).rawReport.adjudications.length,120);
  assert.equal(referencePacketOutcome(packet,reports).findings.length,120);
});

test('unresolved substantive findings block while sustained creative preference remains visible dissent',()=>{
  for(const category of ['use_card','creative_preference']) {
    const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet,{mutateReport(raw,input){
      if(input.phase==='first_read'&&input.role==='visual')raw.issues=[finding(input,{category})];
      if(input.phase==='director') {raw.adjudications[0].disposition='sustained';if(category==='use_card')raw.packageDecision='blocked';}
    }}),outcome=referencePacketOutcome(packet,reports);
    assert.equal(outcome.status,category==='use_card'?'returned':'diagnostic');assert.equal(outcome.findings.length,1);
  }
});

test('a sustained H1 on a rejected alternative stays visible without forcing false dismissal',()=>{
  const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet,{mutateReport(raw,input){
    if(input.phase==='score'&&input.role==='visual') {
      raw.evaluations[1].hardRejects=[{...finding(input,{category:'hard_reject'}),rule:'H1',pointer:'/uses/1',evidence:[pixel(input,1),pixel(input,0),pointer('/uses/1/comparisonScope',input.uses[1].comparisonScope)]}];
      raw.evaluations[1].decision='reject_use';
    }
    if(input.phase==='director')raw.adjudications[0].disposition='sustained';
  }}),outcome=referencePacketOutcome(packet,reports);
  assert.equal(outcome.status,'diagnostic');assert.equal(outcome.selection,'use_0');assert.equal(outcome.findings[0].finding.category,'hard_reject');
  const node=referenceReviewNodes(packet.id).at(-1),changedInput=referenceReviewInput(packet,node,reports);
  const changedRaw=referenceReviewFixtureOutput(changedInput);changedRaw.selection='use_1';
  invalid(()=>validateReferenceReviewOutput(changedRaw,changedInput),/undominated/);
});

test('candidate-local exception never hides source issues or selected-original contradictions',()=>{
  for(const category of ['source','use_card']) {
    const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet,{mutateReport(raw,input){
      if(input.phase==='first_read'&&input.role==='visual') {
        raw.issues=[{...finding(input,{category}),owner:category==='source'?'research-lead':'reference-lead',pointer:'/images/1',evidence:[pixel(input,category==='source'?1:0)]}];
      }
    }}),node=referenceReviewNodes(packet.id).at(-1),input=referenceReviewInput(packet,node,reports),raw=referenceReviewFixtureOutput(input);
    raw.adjudications[0].disposition='sustained';
    invalid(()=>validateReferenceReviewOutput(raw,input),/substantive criticism/);
  }
});

test('qualification uses all original dimensions with no compensating average',()=>{
  const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet,{mutateReport(raw,input){
    if(input.phase==='score'&&input.role==='brand'){raw.evaluations[0].dimensions[0].score=3;raw.evaluations[0].decision='revise_card';}
  }});
  assert.deepEqual(referenceQualifiedUses(packet.uses,reports),['use_1']);
  const forged=clone(reports);forged.find(r=>r.rawReport.phase==='score'&&r.rawReport.role==='brand').rawReport.evaluations[0].decision='advance_sketch';
  assert.deepEqual(referenceQualifiedUses(packet.uses,forged),['use_1']);
  invalid(()=>referencePacketOutcome(packet,forged),/precedence/);
});

test('Pareto ranking preserves traded dimensions and forbids selecting a dominated main',()=>{
  const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet,{mutateReport(raw,input){
    if(input.phase==='score'&&input.role==='visual')for(const dimension of raw.evaluations[1].dimensions) {
      dimension.score=5;dimension.evidence.push(pointer('/uses/1/comparisonScope',input.uses[1].comparisonScope),pixel(input,0));
    }
  }});
  assert.deepEqual(referenceParetoFrontier(['use_0','use_1'],reports),['use_1']);
  const node=referenceReviewNodes(packet.id).at(-1),input=referenceReviewInput(packet,node,reports),raw=referenceReviewFixtureOutput(input);
  raw.selection='use_0';invalid(()=>validateReferenceReviewOutput(raw,input),/undominated/);
  const tradeoffs=clone(reports),brand=tradeoffs.find(r=>r.rawReport.phase==='score'&&r.rawReport.role==='brand').rawReport;
  brand.evaluations[0].dimensions[0].score=5;
  assert.deepEqual(referenceParetoFrontier(['use_0','use_1'],tradeoffs),['use_0','use_1']);
  for(const entry of tradeoffs)if(entry.rawReport.phase==='score')entry.rawReport.evaluations.forEach(e=>e.dimensions.reverse());
  assert.deepEqual(referenceParetoFrontier(['use_0','use_1'],tradeoffs),['use_0','use_1']);
});

test('task-fit rationale cannot omit an undominated alternative image',()=>{
  const {raw,input}=subject({phase:'director',role:'director'});raw.evidence=[pixel(input)];
  invalid(()=>validateReferenceReviewOutput(raw,input),/undominated alternative/);
});

test('outcome detects missing and duplicated nodes and revalidates saved originals',()=>{
  const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet);
  assert.equal(referencePacketOutcome(packet,reports.slice(1)).missing.length,1);
  invalid(()=>referencePacketOutcome(packet,[...reports.slice(1),reports[1]]),/Duplicate/);
  reports[2].rawReport.images[0].sha256='f'.repeat(64);invalid(()=>referencePacketOutcome(packet,reports));
});

test('component-only combinations and incomplete overviews cannot authorize a direction',()=>{
  const components=referenceReviewFixturePacket({scope:'combination',kinds:['component','component']});
  assert.equal(referencePacketOutcome(components,referenceReviewFixtureReports(components)).reason,'COMPONENT_ONLY_DIRECTION');
  const overview=referenceReviewFixturePacket({scope:'overview'});
  assert.equal(referencePacketOutcome(overview,referenceReviewFixtureReports(overview)).reason,'INCOMPLETE_DIRECTION_OVERVIEW');
});

test('duplicate image bytes fail and one candidate cannot satisfy multiple alternatives',()=>{
  const packet=referenceReviewFixturePacket();packet.images[1].sha256=packet.images[0].sha256;
  invalid(()=>referenceReviewInput(packet,referenceReviewNodes(packet.id)[0],[]),/Repeated original/);
  const single=referenceReviewFixturePacket({kinds:['direction']});
  assert.equal(referencePacketOutcome(single,referenceReviewFixtureReports(single)).reason,'INSUFFICIENT_DISTINCT_CANDIDATES');
});

test('uncalibrated reviews remain diagnostic and no report can self-declare calibration',()=>{
  const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet);
  assert.equal(referencePacketOutcome(packet,reports).status,'diagnostic');
  assert.equal(referencePacketOutcome(packet,reports,{calibrated:true}).status,'qualified');
  reports.at(-1).rawReport.calibrated=true;invalid(()=>referencePacketOutcome(packet,reports),/extra fields/);
});

test('composition, style, viewpoint and carrier components review their local scope without demanding a complete theme',()=>{
 for(const profile of ['composition_component','style_component','viewpoint_scene_component','carrier_component']){
  const packet=referenceReviewFixturePacket({scope:'combination',kinds:['direction','component']});packet.uses[1].applicabilityProfile=profile;packet.uses[1].innovationHypothesis=null;
  if(['composition_component','style_component'].includes(profile))packet.uses[1].translation=null;
  const reports=referenceReviewFixtureReports(packet),scores=reports.filter(r=>r.rawReport.phase==='score');
  assert.ok(scores.every(r=>['pass_component','boundary_clear'].includes(r.rawReport.evaluations[1].decision)));
  const visual=scores.find(r=>r.rawReport.role==='visual').rawReport.evaluations[1];
  assert.equal(visual.dimensions.find(d=>d.dimension==='borrowed_composition').status,['composition_component','viewpoint_scene_component'].includes(profile)?'scored':'not_applicable');
  const user=scores.find(r=>r.rawReport.role==='user').rawReport.evaluations[1];
  assert.equal(user.dimensions.find(d=>d.dimension==='occasion_translation').status,['viewpoint_scene_component','carrier_component'].includes(profile)?'scored':'not_applicable');
  assert.equal(referencePacketOutcome(packet,reports).status,'diagnostic');
 }
});

test('qualification failures produce exact typed machine returns even when model reports omitted issue lists',()=>{
 const packet=referenceReviewFixturePacket(),reports=referenceReviewFixtureReports(packet,{mutateReport(raw){if(raw.phase==='score'&&raw.role==='visual')for(const evaluation of raw.evaluations){evaluation.dimensions[0].score=3;evaluation.decision='revise_card';}}});
 const result=referencePacketOutcome(packet,reports);assert.equal(result.status,'returned');assert.equal(result.findings.length,2);
 for(const item of result.findings){assert.equal(item.origin,'machine_protocol_check');assert.equal(item.finding.owner,'reference-lead');assert.match(item.finding.pointer,/evaluations\/\d+\/dimensions\/0$/u);assert.equal(item.finding.evidence[0].imageHash,packet.images.find(i=>i.imageId===item.finding.evidence[0].imageId).sha256);assert.match(item.finding.acceptance,/Preserve the original score/u);}
 assert.equal(reports.find(r=>r.rawReport.phase==='score'&&r.rawReport.role==='visual').rawReport.evaluations[0].dimensions[0].score,3);
});

test('a qualified direction and distinct scoped component are real candidates without relabeling the component as a whole direction',()=>{
 const packet=referenceReviewFixturePacket({kinds:['direction','component']}),reports=referenceReviewFixtureReports(packet),outcome=referencePacketOutcome(packet,reports);
 assert.equal(outcome.status,'diagnostic');assert.deepEqual(outcome.qualified,['use_0']);assert.deepEqual(outcome.eligible,['use_0','use_1']);assert.equal(outcome.selection,'use_0');
 const duplicated=clone(packet);duplicated.uses[1].imageId=duplicated.uses[0].imageId;duplicated.images.pop();assert.equal(referencePacketOutcome(duplicated,referenceReviewFixtureReports(duplicated)).reason,'INSUFFICIENT_DISTINCT_CANDIDATES');
});

test('sustained component criticism excludes that use from a later combination even when its original scores are four',()=>{
 const packet=referenceReviewFixturePacket({kinds:['direction','component']}),reports=referenceReviewFixtureReports(packet,{mutateReport(raw,input){
   if(input.phase==='score'&&input.role==='visual')raw.issues=[{...finding(input),pointer:'/uses/1',evidence:[pixel(input,1)]}];
   if(input.phase==='director')raw.adjudications[0].disposition='sustained';
 }}),outcome=referencePacketOutcome(packet,reports);
 assert.equal(outcome.status,'diagnostic');assert.deepEqual(outcome.eligible,['use_0']);assert.equal(outcome.findings.length,1);
 const mutable=referencePacketOutcome(packet,reports);mutable.eligible.push('forged');assert.deepEqual(referencePacketOutcome(packet,reports).eligible,['use_0']);
});
