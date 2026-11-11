import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {parseSnapshot, object} from './dto';
import {mapProject} from './briefModels';
import {claimIdentity, readResearchArtifact, projectResearchWorkspace, projectHandoff, mapSources, mapClaims, type ResearchSnapshot} from './researchProjection';
import type {ResearchWorkspace} from '../../domain/models';

function fixture() {
  const content = {title: '实际输入的合成研究', summary: '用于投影合同验收，不是市场研究。', sections: [{heading: '行业与市场', body: '保留原始研究正文。'}], claims: [{text: '测试论点', topic: 'category', evidenceRefs: ['source-1'], limitations: []}], gaps: ['缺本地人群证据']};
  const contentText = JSON.stringify(content), contentHash = createHash('sha256').update(contentText).digest('hex');
  const p: ResearchSnapshot = {...parseSnapshot({project: {id: 'p', name: '合成项目', revision: 2, activeTaskCardId: 'scope-1', taskCards: [{id: 'scope-1', brief: '合成简报', createdBy: 'local-operator'}], confirmations: [{taskCardId: 'scope-1', actorId: 'local-operator'}], artifacts: [{id: 'research-1', stage: 'research', contentHash, inputVersionIds: ['scope-1'], createdAt: '2026-11-11T00:00:00Z'}], audit: [{commandId: 'confirm', kind: 'confirm-task-card', actorId: 'local-operator', revision: 1, at: '2026-11-11T00:00:00Z'}], processedCommands: {confirm: JSON.stringify({kind: 'confirm-task-card', taskCardId: 'scope-1'})}}, view: {policy: {mode: 'assisted', version: 1, humanGates: [], authorizedThrough: 'research'}, stages: [{stage: 'research', status: 'awaiting_release', activeArtifactId: 'research-1', blockedReasons: []}]}}), workflowVersion: 'proposal-seven-v1', researchWorkflow: null};
  const load = async () => ({artifactId: 'research-1', contentHash, contentText, content});
  return {p, content, contentText, contentHash, load};
}
function empty(p: ResearchSnapshot): ResearchSnapshot {return {...p, jobs: [], artifacts: [], stages: p.stages.map(s => ({...s, activeArtifactId: null}))};}

describe('real-byte research projection', () => {
  it('reads original text, computes hash and preserves report gaps without simulated approval', async () => {
    const f = fixture(), detail = await readResearchArtifact(f.p, 'research-1', f.load);
    expect(detail.artifact).toMatchObject({title: f.content.title, isCurrent: true, basedOn: {briefVersion: 1}, release: null, simulated: false});
    expect(detail.artifact.sections[1]).toMatchObject({heading: '保留的研究缺口'});
    expect(detail.claims[0]).toMatchObject({text: '测试论点', supportStatus: 'unverified'});
  });
  it('rejects different artifact, missing original bytes, changed bytes and divergent parsed objects', async () => {
    const f = fixture(), original = await f.load();
    for (const changed of [{...original, artifactId: 'another'}, {...original, contentText: undefined}, {...original, contentText: original.contentText + ' '}, {...original, content: {...f.content, summary: 'changed'}}]) await expect(readResearchArtifact(f.p, 'research-1', async () => changed)).rejects.toMatchObject({kind: 'validation'});
  });
  it('keeps a previous Brief report as stale and removes its release even if its stage remains active', async () => {
    const f = fixture(); f.p.activeTaskCardId = 'scope-2'; f.p.cards.push({id: 'scope-2', brief: '新简报', createdBy: 'local-operator'}); f.p.confirmations.push({taskCardId: 'scope-2', actorId: 'local-operator'}); f.p.releases.push({artifactId: 'research-1', policyVersion: 1, actorId: 'operator'});
    const detail = await readResearchArtifact(f.p, 'research-1', f.load);
    expect(detail.artifact).toMatchObject({status: 'stale', isCurrent: false, release: null});
  });
  it('uses a real matching report for support and lets an unsupported vote dominate', async () => {
    const f = fixture(), key = await claimIdentity(0, f.content.claims[0]);
    f.p.textReports.verification.push({id: 'verified', artifactId: 'research-1', contentHash: f.contentHash, hasBlockingFindings: false, results: [{claimKey: key, outcome: 'supported_excerpt'}]});
    expect((await readResearchArtifact(f.p, 'research-1', f.load)).claims[0].supportStatus).toBe('supported');
    f.p.textReports.verification.push({id: 'rejected', artifactId: 'research-1', contentHash: f.contentHash, hasBlockingFindings: true, results: [{claimKey: key, outcome: 'unsupported', rationale: '原文不支持'}]});
    expect((await readResearchArtifact(f.p, 'research-1', f.load)).claims[0].supportStatus).toBe('unsupported');
  });
  it('does not rename missing topic or user text as verified evidence', () => {
    const f = fixture();
    f.p.sourceEntries.push({id: 'source-1', taskCardId: 'scope-1', intendedUse: 'category', title: '人工登记', publisher: '原文提交者', excerpt: '只是提交的摘录', verificationStatus: 'verified', provenance: 'user_provided'});
    f.p.sourceEntries.push({id: 'old-card', taskCardId: 'old-card', intendedUse: 'audience', excerpt: '旧卡资料'});
    const result = mapSources(f.p);
    expect(result.items).toHaveLength(1); expect(result.items[0].verificationStatus).toBe('unverified');
  });
  it('returns an empty workspace without fetching or fabricating a report; rejects legacy protocol', async () => {
    const f = fixture(), p = empty(f.p); let called = false;
    const workspace = await projectResearchWorkspace(p, async () => {called = true; return {};});
    expect(called).toBe(false); expect(workspace).toMatchObject({artifact: null, claims: [], verification: null, readiness: null, activeJobs: []});
    await expect(projectResearchWorkspace({...p, workflowVersion: null}, f.load)).rejects.toMatchObject({kind: 'unavailable'});
  });
  it('does not turn an operator declaration into actual owner acceptance', async () => {
    const f = fixture(), detail = await readResearchArtifact(f.p, 'research-1', f.load);
    const workspace: ResearchWorkspace = {project: mapProject(empty(f.p)), artifact: detail.artifact, claims: detail.claims, sources: [], verification: null, readiness: null, gaps: [], activeJobs: [], versions: []};
    f.p.researchWorkflow = {checks: [{id: 'acceptance', passed: false}], consumerDeclarationId: 'operator-request'};
    expect(projectHandoff(f.p, workspace)).toMatchObject({strategySide: null, release: null, eligibility: {eligible: false}});
    f.p.textReports.handoff.push({id: 'report-1', artifactId: 'research-1', contentHash: f.contentHash, side: 'consumer', decision: 'accept', ownerBinding: {role: 'strategy-owner'}});
    expect(projectHandoff(f.p, workspace).strategySide).toBeNull();
    f.p.researchWorkflow = {checks: [{id: 'acceptance', passed: true}], ownerReports: {consumer: {reportId: 'report-1'}}};
    expect(projectHandoff(f.p, workspace).strategySide).toMatchObject({id: 'report-1', decision: 'accepted_with_conditions', outdated: false});
  });
});

it('retains every claim from the actual producer schema without inventing topic classifications',async()=>{
 const module:unknown=createRequire(import.meta.url)(fileURLToPath(new URL('../../../../../tools/workbench/stage-content.mjs',import.meta.url)));
 if(!module||typeof module!=='object'||!('validateStageOutput' in module)||typeof module.validateStageOutput!=='function')throw new Error('Missing actual validator');
 const source={id:'native-source',url:'https://example.test/source',text:'Synthetic package is blue.',scopeRelation:'background',verification:'captured'};
 const production={outputKind:'research_findings',status:'complete',title:'Synthetic schema test',summary:source.text,sections:[{heading:'Finding',body:source.text,evidenceIds:[source.id]}],claims:[{text:source.text,kind:'fact',evidenceRefs:[source.id],limitations:['Supplied excerpt only.']}],gaps:[],evidenceClassifications:[{sourceId:source.id,scopeRelation:'background',reason:'Synthetic bounded example.'}]};
 const validated:unknown=module.validateStageOutput('research',production,{sourceRecords:[source]});
 if(!validated||typeof validated!=='object'||!('content' in validated)||!validated.content||typeof validated.content!=='object')throw new Error('Missing actual validated content');
 const f=fixture(), projected=await mapClaims(f.p,{id:'native',contentHash:'hash'},object(validated.content));
 expect(projected.items).toHaveLength(1);expect(projected.items[0]).toMatchObject({topic:'unclassified',text:source.text,sourceIds:[source.id]});expect(projected.unclassified).toBe(1);
});
