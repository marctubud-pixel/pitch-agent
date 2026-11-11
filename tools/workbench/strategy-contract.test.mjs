import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildStageRequest,validateStageOutput} from './stage-content.mjs';
import {STRATEGY_CONTRACT_VERSION,strategyTextLeaves} from './strategy-contract.mjs';
import {evidenceStateHash,evidenceClaimManifest} from './evidence-review.mjs';
import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import {obligationsFor} from './complete-content.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v,null,2)).digest('hex');
const sources=[{id:'source-a',url:'https://example.test/source',text:'Package A has a handle. Product B uses blue. The scene shows a shared table.',verification:'captured',scopeRelation:'background'}];
const research={title:'Actual synthetic research',claims:['Package A has a handle.','Product B uses blue.','The scene shows a shared table.'].map(text=>({text,kind:'inference',evidenceRefs:['source-a'],limitations:['Captured synthetic excerpt, not consumer validation.'],verification:'pending'}))};
const inputArtifacts=[{id:'research-a',stage:'research',content:research}];
const data={version:STRATEGY_CONTRACT_VERSION,taskCard:{id:'task-a',brief:'Create packaging for the selected brand.',requirements:{deliverable:'Packaging'}},confirmations:[{taskCardId:'task-a'}],research:[{artifactId:'research-a',contentHash:hash(research),claimManifest:evidenceClaimManifest(research)}],sourceRecords:sources,visualCatalogue:[]};
const basis={...data,basisHash:evidenceStateHash(data)},options={strategyContractVersion:STRATEGY_CONTRACT_VERSION,strategyBasis:basis,sourceRecords:sources};
const fixture=opts=>syntheticStrategyV2({strategyBasis:basis},opts);
for(const form of ['chain','total_parts_total'])test(`closed strategy-v2 supports actual research references and ${form}`,()=>{
 const raw=fixture({grounded:true,form}),out=validateStageOutput('strategy',raw,options);
 assert.equal(out.strategy.answer.decision,'grounded_proposal');assert.equal(out.content.strategyContractVersion,undefined);assert.equal(out.content.sections,undefined);assert.ok(out.claims.every(c=>c.verification==='pending'));
 const req=buildStageRequest({stage:'strategy',brief:data.taskCard.brief,inputArtifacts,...options});assert.equal(req.outputSchema.properties.strategyContractVersion.enum[0],STRATEGY_CONTRACT_VERSION);assert.equal(req.outputSchema.properties.sections,undefined);assert.match(req.prompt,/single authoritative strategy/);
});
test('missing evidence stays conditional with one cut, or blocked with no manufactured candidate',()=>{
 const raw=fixture();assert.equal(raw.strategy.candidateCuts.length,1);assert.equal(validateStageOutput('strategy',raw,options).strategy.answer.decision,'conditional_exploration');
 raw.status='blocked';raw.strategy.answer.decision='blocked';raw.strategy.answer.recommendedCutId='';raw.strategy.candidateCuts=[];raw.strategy.reasoning.steps.at(-1).candidateIds=[];assert.equal(validateStageOutput('strategy',raw,options).status,'blocked');
});
test('confirmed structured task string leaves are cited exactly without external evidence',()=>{
 const raw=fixture();const claim=raw.claims[0];claim.kind='fact';claim.basisKind='project_requirement';const f=raw.strategy.circles.industryCompetitor.findings[0];f.requirementRefs=[{taskCardId:'task-a',pointer:'/requirements/deliverable',quote:'Packaging'}];assert.equal(validateStageOutput('strategy',raw,options).claims[0].verification,'pending');
 f.requirementRefs[0].quote='Age 25';assert.throws(()=>validateStageOutput('strategy',raw,options),/Requirement quote/);
});
const attacks={
 'extra body field':r=>r.strategy.extra='forged',
 'missing circle':r=>delete r.strategy.circles.userUsage,
 'invented research':r=>r.strategy.circles.industryCompetitor.findings[0].researchRefs[0].claimKey='invented',
 'wrong basis':r=>r.strategyBasisHash='0'.repeat(64),
 'unsupported version':r=>r.strategyContractVersion='strategy-v3',
 'unknown claim':r=>r.strategy.intersection.claimIds.push('invented'),
 'same finding in two circles':r=>r.strategy.circles.userUsage.findings[0].id='finding-0',
 'missing intersection circle':r=>r.strategy.intersection.findingIds.pop(),
 'candidate outside intersection':r=>r.strategy.candidateCuts[0].findingIds=['unknown'],
 'duplicate cuts':r=>r.strategy.candidateCuts[1].proposition=r.strategy.candidateCuts[0].proposition,
 'reasoning cycle':r=>r.strategy.reasoning.steps[0].priorStepIds=['step-final'],
 'unlinked chain':r=>r.strategy.reasoning.steps[1].priorStepIds=[],
 'wrong final answer':r=>r.strategy.answer.stepIds=['step-start'],
 'blocked recommendation':r=>r.strategy.candidateCuts[0].disposition='blocked',
 'silent hypothesis fact':r=>r.claims[0].basisKind='hypothesis',
 'generic duplicate body':r=>r.sections=[{heading:'Duplicate',body:'Other strategy',evidenceIds:[]}],
 'missing bounded use':r=>r.strategy.candidateCuts[0].prohibitedInferences=[],
};
for(const [name,mutate] of Object.entries(attacks))test(`strategy rejects ${name}`,()=>{const raw=fixture({grounded:true});if(name==='silent hypothesis fact')raw.claims[0].kind='fact';mutate(raw);assert.throws(()=>validateStageOutput('strategy',raw,options),{code:'INVALID_STAGE_OUTPUT'});});
test('unknown selected version and changed original research fail before provider dispatch',()=>{
 assert.throws(()=>buildStageRequest({stage:'strategy',brief:'x',inputArtifacts,...options,strategyContractVersion:'strategy-v3'}));
 const inputs=structuredClone(inputArtifacts);inputs[0].content.title='mutated';assert.throws(()=>buildStageRequest({stage:'strategy',brief:'x',inputArtifacts:inputs,...options}),/original research/);
});
test('one canonical text-leaf walk creates true v2 full-content obligations and excludes graph metadata',()=>{
 const c=validateStageOutput('strategy',fixture({grounded:true}),options).content,leaves=strategyTextLeaves(c),obligations=obligationsFor('strategy-a',c,'strategy-lead');
 for(const p of ['/strategy/coreQuestion/text','/strategy/circles/industryCompetitor/summary','/strategy/circles/brandProduct/summary','/strategy/circles/userUsage/summary','/strategy/intersection/text','/strategy/candidateCuts/0/proposition','/strategy/reasoning/steps/1/text','/strategy/answer/text','/strategy/answer/limitations/0'])assert.ok(obligations.some(o=>o.pointer===p));
 assert.ok(leaves.every(l=>!l.pointer.endsWith('/id')));assert.equal(new Set(obligations.map(o=>o.originId)).size,obligations.length);assert.equal(obligations.find(o=>o.pointer==='/strategy/answer/limitations/0').kind,'limitation');
});

test('historical absent-version request and normalized response remain byte-for-byte unchanged',async()=>{
 const {readFile}=await import('node:fs/promises');const f=JSON.parse(await readFile(new URL('./fixtures/strategy-v1-originals.json',import.meta.url),'utf8'));
 assert.equal(JSON.stringify(buildStageRequest(f.options)),JSON.stringify(f.request));assert.equal(JSON.stringify(validateStageOutput('strategy',f.output)),JSON.stringify(f.normalized));assert.equal(f.normalized.content.strategy,undefined);
});
test('actual complete-content manuscript validation rejects omission of each v2 source obligation',async()=>{
 const {validateManuscript,obligationText}=await import('./complete-content.mjs');const content=validateStageOutput('strategy',fixture(),options).content;
 const obligations=obligationsFor('actual-strategy',content,'strategy-lead'),source={obligations,visual:{payload:{directions:[]}},directionMap:[],images:[],claims:[],sources:[]};
 const m={title:'Complete strategy narrative',narrativeBlocks:obligations.map((o,i)=>({id:`block-${i}`,kind:'source',text:obligationText(o),originIds:[o.originId]})),directions:[],claims:[],sources:[],visibleObligations:obligations.map((o,i)=>({originId:o.originId,value:o.value,blockIds:[`block-${i}`],imageIds:[],pageIntentIds:['page-1']})),pageIntents:[{id:'page-1',centralMessage:'A complete strategy with explicit limits.',heroImageId:null,blockIds:obligations.map((_,i)=>`block-${i}`),imageIds:[],allowedSplitAfterBlockIds:[]}],edits:[]};
 assert.deepEqual(validateManuscript(m,source),m);
 for(const o of obligations.filter(o=>o.pointer.startsWith('/strategy'))){const missing=structuredClone(m);missing.visibleObligations=missing.visibleObligations.filter(v=>v.originId!==o.originId);assert.throws(()=>validateManuscript(missing,source),{code:'CONTENT_COVERAGE_MISSING'});}
});

test('independent complete-text review accepts a real v2 omission pointer and preserves its blocking finding',async()=>{
 const {buildEvidenceReviewRequest,validateEvidenceReviewOutput}=await import('./evidence-review.mjs');const content=validateStageOutput('strategy',fixture(),options).content;
 content.strategy.answer.text='Unlisted external claim that all consumers prefer this design.';
 const input={artifactId:'strategy-v2-review',contentHash:hash(content),content,taskCard:basis.taskCard,taskCardConfirmed:true,sourceRecords:sources};const request=buildEvidenceReviewRequest(input);
 const fixed=Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([,v])=>v.enum).map(([k,v])=>[k,v.enum[0]]));
 const raw={...fixed,results:[],wholeTextScan:{status:'complete',creativeClaimKeys:evidenceClaimManifest(content).map(c=>c.claimKey),omissions:[{location:'/strategy/answer/text',quote:content.strategy.answer.text,reason:'This factual consumer promise is absent from the creative claims and has no supporting evidence.'}],mismatchedCreative:[]},limitations:['Synthetic independent omission test.']};
 const result=validateEvidenceReviewOutput(raw,input);assert.equal(result.hasBlockingFindings,true);assert.equal(result.wholeTextScan.omissions[0].location,'/strategy/answer/text');
 raw.wholeTextScan.omissions[0].location='/strategy/nonexistent/text';assert.throws(()=>validateEvidenceReviewOutput(raw,input),/Unknown omission location/);
});
