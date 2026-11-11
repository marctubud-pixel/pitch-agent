import {SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
export const source = {id: 's1', url: 'https://example.test/blue', text: 'Synthetic package is blue.', scopeRelation: 'background', verification: 'captured'};
export const production = {outputKind: 'research_findings', status: 'complete', title: 'Synthetic research', summary: source.text, sections: [{heading: 'Finding', body: source.text, evidenceIds: ['s1']}], claims: [{text: source.text, kind: 'fact', evidenceRefs: ['s1'], limitations: ['Supplied excerpt only.']}], gaps: [], evidenceClassifications: [{sourceId: 's1', scopeRelation: 'background', reason: 'Bounded example.'}]};
export const bindings = {research: {providerId: 'author', model: 'synthetic', role: 'research-lead'}, verification: {providerId: 'reviewer', model: 'synthetic', role: 'evidence-reviewer'}, readiness: {providerId: 'reviewer', model: 'synthetic', role: 'readiness-reviewer'}, semantic:{providerId:'reviewer',model:'synthetic',role:'semantic-challenger'}, strategy: {providerId: 'strategist', model: 'synthetic', role: 'strategy-lead'}};
export const human = {actorId: 'human', actorType: 'human', runId: 'human', contextId: 'human'};
export function output(request) {
  const p = request.packet ?? (request.outputSchema.properties.outputKind ? null : JSON.parse(request.prompt.split("UNTRUSTED_JSON_DATA\n")[1].split("\nEND_UNTRUSTED_JSON_DATA")[0]));
  const fixed = Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([, value]) => value.enum).map(([key, value]) => [key, value.enum[0]]));
  if (!p) {
    if (request.outputSchema.properties.outputKind.enum[0] === 'strategy') {
      if(request.outputSchema.properties.strategyContractVersion)return syntheticStrategyV2(JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'))));
      const {evidenceClassifications, ...strategy} = production;
      return {...strategy, outputKind: 'strategy'};
    }
    return request.outputSchema.properties.researchContractVersion?{...production,researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[]}:production;
  }
  if(p.protocolVersion===SEMANTIC_PROTOCOL)return {...fixed,relations:p.questions.map(q=>({questionId:q.id,outcome:q.primaryApplicability==='not_applicable'?'not_applicable':'supported',explanation:'Synthetic relationship only, not semantic accuracy.',refs:q.refs})),limitations:['Synthetic lifecycle evidence only.']};
  if (['research-handoff-v1','research-handoff-v2','research-handoff-v3'].includes(p.protocolVersion)) return {...fixed,...(p.protocolVersion!=='research-handoff-v1'?{restrictionDispositions:p.restrictionManifest.map(r=>({originKey:r.originKey,state:'retained',text:r.prohibitedUse}))}:{}), ownerBinding: p.ownerBinding, decision: 'accept', understoodFindings: [{finding: source.text, refs: [{location: '/content/sections/0/body', quote: source.text}]}], permittedUses: p.operatorDeclaration?.permittedUses ?? ['Explore blue.'], prohibitedInferences: [...new Set(['No preference claim.',...(p.operatorDeclaration?.prohibitedInferences??[]),...(p.producerReport?.prohibitedInferences??[])])], unresolvedIssues: (p.operatorDeclaration?.unresolvedIssues??[]).map(reason=>({blocking:false,reason,refs:[{location:'/content/sections/0/body',quote:source.text}]})), limitations: ['Synthetic test only.']};
  if (['research-readiness-v1','research-readiness-v2'].includes(p.protocolVersion)) return {...fixed,...(p.protocolVersion==='research-readiness-v2'?{obligationAssessments:[],useScan:{contentHash:p.contentHash,assessedOriginKeys:[],findings:[]}}:{}), verdict: 'ready', coverage: p.expectedCoverage.map(item => ({questionId: item.id, status: 'ready', rationale: 'Bounded synthetic task.', refs: [{location: '/content/sections/0/body', quote: source.text}, ...(p.evidenceLinkPolicy ? [{location: '/sourceRecords/0/text', quote: source.text}] : [])], downstreamImpact: 'Explore blue.', researchNeeded: 'none'})), sourceAssessments: [{sourceId: source.id, textHash: hash(source.text), use: 'usable_with_limits', relevance: 'Supplied example.', provenance: 'Captured excerpt.', limitations: ['Not authenticated.'], refs: [{location: '/sourceRecords/0/text', quote: source.text}]}], findings: [], downstreamUse: {allowed: ['Explore blue.'], prohibited: ['No preference claim.']}, limitations: ['Synthetic test only.']};
  return {...fixed,...(p.quantitativeManifest?{quantitativeResults:p.quantitativeManifest.map(a=>({assertionKey:a.assertionKey,outcome:'supported_association',rationale:'Synthetic original contextual association.',citations:[{sourceId:a.sourceId,textHash:a.textHash,quote:p.sourceRecords.find(s=>s.id===a.sourceId).text}],limitations:[]}))}:{}), results: p.claimManifest.filter(c=>c.claim.kind!=='creative').map(item => ({claimKey: item.claimKey, outcome: 'supported_excerpt', rationale: 'Exact supplied text.', citations: [{sourceId: source.id, textHash: hash(source.text), quote: source.text}], requirementRefs: [], limitations: []})), wholeTextScan: {status: 'complete', creativeClaimKeys: p.claimManifest.filter(c=>c.claim.kind==='creative').map(c=>c.claimKey), omissions: [], mismatchedCreative: [], ...(['excerpt-support-v3','excerpt-support-v4'].includes(fixed.protocolVersion) ? {operationalAssertions: []} : {})}, limitations: []};
}
export function providerSet(calls, transform = value => value, root) {
  return Object.fromEntries(['author', 'reviewer', 'strategist'].map(id => [id, {model: 'synthetic', execute: async request => {
    calls.push({id, request});
    const parsedOutput = output(request);
    const result=await transform({runId: request.runId, model:'synthetic', requestedModel: 'synthetic', threadId: `${id}-${request.runId}`, inputPacketHash: hash(JSON.stringify((request.packet||request.outputSchema.properties.researchContractVersion||request.outputSchema.properties.outputKind?.enum[0]==='strategy'||['excerpt-support-v3','excerpt-support-v4'].includes(request.outputSchema.properties.protocolVersion?.enum[0])) ? {runId: request.runId, model: 'synthetic', prompt: request.prompt, outputSchema: request.outputSchema} : request)), exitCode: 0, responseText: JSON.stringify(parsedOutput), parsedOutput}, request);
    if(!root)return result;const persisted=await diskReceipt(root,request,result);return {...persisted,...result,provider:persisted.provider,paths:persisted.paths};
  }}]));
}

export async function syntheticResearch({humanGates=[],mode='auto',transform,initialReadinessProtocol='research-readiness-v2',semanticReview=true}={}) {
  const root=await mkdtemp(join(tmpdir(),'research-operator-')),store=openStore(join(root,'db')),calls=[],providers=providerSet(calls,transform,root);
  store.create({id:'p',name:'Synthetic',brief:'Explore the supplied blue packaging example, without audience claims.',mode,humanGates},human);
  store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
  const semanticConfiguration={readinessBinding:bindings.readiness,challengeBinding:bindings.semantic,rubricVersion:SEMANTIC_PROTOCOL},semanticLease=store.registerSemanticConfiguration(semanticConfiguration,{expectedEpoch:0});
  const executor=createExecutor({store,rootDir:root,bindings,providers,imageProvider:null,semanticLease});
  const job=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[source]}));
  assert.equal(job.status,'succeeded',JSON.stringify(job.error));const artifact=store.read('p').artifacts[0];
  for(const [method,options] of [['enqueueVerification',{}],['enqueueReadiness',{commandId:'assessment',expectedRevision:store.read('p').revision,...(initialReadinessProtocol==='research-readiness-v1'?{}:{protocolVersion:initialReadinessProtocol})}]]){
    if(options.commandId)options.expectedRevision=store.read('p').revision;
    const job=await executor.execute('p',await executor[method]('p',artifact.id,options));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
  }
  if(semanticReview&&initialReadinessProtocol==='research-readiness-v2'){const id=await executor.enqueueSemanticChallenge('p',artifact.id);const job=await executor.execute('p',id);assert.equal(job.status,'succeeded',JSON.stringify(job.error));}
  return {root,store,executor,calls,providers,artifact,semanticLease,semanticConfiguration,close:async()=>{store.close();await rm(root,{recursive:true,force:true});}};
}
export function declarationRequest(f,side='research_owner',extra={}){
  const p=f.store.read('p'),view=f.executor.researchWorkflow('p');
  return {artifactId:f.artifact.id,contentHash:f.artifact.contentHash,basisHash:view.basisHash,commandId:`declaration-${side}-${p.revision}`,expectedRevision:p.revision,input:{side,decision:side==='research_owner'?'delivered':'accepted',permittedUses:['Explore blue.'],prohibitedInferences:['No preference claim.','No manufactured approval.'],unresolvedIssues:[],note:'Synthetic local operator role declaration.',...extra}};
}
export async function acceptedOperatorResearch(f){
  for(const side of ['research_owner','strategy_owner']){
    const request=declarationRequest(f,side),receipt=await f.executor.recordResearchHandoff('p',request,human);
    assert.equal((await f.executor.execute('p',receipt.jobId)).status,'succeeded',JSON.stringify(f.store.read('p').jobs.at(-1).error));
  }
  return f;
}
export function releaseRequest(f){const p=f.store.read('p');return {artifactId:f.artifact.id,contentHash:f.artifact.contentHash,basisHash:f.executor.researchWorkflow('p').basisHash,policyVersion:p.policies.at(-1).version,commandId:`release-${p.revision}`,expectedRevision:p.revision};}
export function continuationRequest(f){const p=f.store.read('p');return {artifactId:f.artifact.id,policyVersion:p.policies.at(-1).version,commandId:`continue-${p.revision}`,expectedRevision:p.revision};}
