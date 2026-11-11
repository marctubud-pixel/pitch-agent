import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildResearchReadinessPacket, buildResearchReadinessRequest, validateResearchReadinessOutput} from './research-readiness.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
function fixture(evidenceLinkPolicy) {
  const content = {outputKind: 'research_findings', title: '得闲包装种子稿', status: 'complete', summary: '四个案例采用蓝色。尚未研究品牌资产、购买者或社交场景。',
    sections: [{title: '案例摘要', body: '四个包装案例仅作为背景；不推断25岁用户偏好。', evidenceIds: ['s1']}],
    claims: [{kind: 'fact', text: '案例一采用蓝色。', evidenceRefs: ['s1']}, {kind: 'inference', text: '可探索蓝色方向。', evidenceRefs: [], limitations: ['不是用户偏好结论']}, {kind: 'creative', text: '先探索蓝色。', evidenceRefs: []}]};
  const contentText = JSON.stringify(content, null, 2);
  const input = {...(evidenceLinkPolicy ? {evidenceLinkPolicy} : {}), artifactId: 'research-1', content, contentText, contentHash: hash(contentText),
    taskCard: {id: 'task-1', brief: '得闲面向25岁年轻人的社交白酒包装，进入策略阶段。', scopeVersion: 'scope-2',
      deliverable: 'packaging', timeWindow: '2025–2026', confirmation: {actor: 'human', confirmedAt: '2026-10-24'}}, taskCardConfirmed: true,
    sourceRecords: [1, 2, 3, 4].map(id => ({id: `s${id}`, url: `https://example.org/${id}`, text: `案例${id}包装采用蓝色。`, verification: 'captured', scopeRelation: 'background'}))};
  const {packet, outputSchema} = buildResearchReadinessRequest(input);
  const report = Object.fromEntries(Object.entries(outputSchema.properties).filter(([, value]) => value.enum?.length === 1).map(([key, value]) => [key, value.enum[0]]));
  Object.assign(report, {verdict: 'needs_research',
    coverage: packet.expectedCoverage.map(item => ({questionId: item.id, status: 'gap', rationale: '当前只有种子结论，关键研究未完成。',
      refs: [{location: '/taskCard/brief', quote: input.taskCard.brief}], downstreamImpact: '无法形成有证据支持的包装策略。', researchNeeded: '补查品牌资产、购买角色及社交场景。'})),
    sourceAssessments: packet.sourceRecords.map((source, index) => ({sourceId: source.id, textHash: source.textHash, use: 'usable_with_limits',
      relevance: '包装案例背景。', provenance: '操作者提供摘录，未独立核实。', limitations: ['captured不可用作已核验直接比较'],
      refs: [{location: `/sourceRecords/${index}/text`, quote: source.text}]})),
    findings: [], downstreamUse: {allowed: ['规划补查'], prohibited: ['不得据案例颜色推断用户偏好']}, limitations: ['未建立品牌与用户研究基础']});
  return {input, report};
}
const rejects = (input, report) => assert.throws(() => validateResearchReadinessOutput(report, input), {code: 'INVALID_RESEARCH_READINESS'});

test('thin four-source seed packet is fully supplied with explicit substantive review contract', () => {
  const {input, report} = fixture();
  const request = buildResearchReadinessRequest(input);
  assert.match(request.prompt, /thin excerpt-only packet/);
  assert.match(request.prompt, /must receive needs_research/);
  assert.match(request.prompt, /absent information does NOT require an external citation/);
  assert.match(request.prompt, /independent research coverage/);
  assert.deepEqual(request.packet.taskCard, input.taskCard);
  assert.equal(request.packet.contentText, input.contentText);
  assert.deepEqual(request.packet.content, input.content);
  assert.equal(request.packet.sourceRecords.length, 4);
  const accepted = validateResearchReadinessOutput(JSON.stringify(report), input);
  assert.equal(accepted.verdict, 'needs_research');
  assert.equal(accepted.hasBlockingFindings, true);
  assert.equal(input.sourceRecords[0].verification, 'captured');
});

test('gap and blocker cannot accompany ready even with supported sources', () => {
  const {input, report} = fixture();
  report.verdict = 'ready';
  rejects(input, report);
  report.coverage.forEach(item => { item.status = 'ready'; item.refs = [{location: '/content/sections/0/body', quote: input.content.sections[0].body}]; });
  report.findings.push({severity: 'blocker', questionId: report.coverage[0].questionId, rationale: '关键问题缺失',
    refs: [{location: '/taskCard/brief', quote: input.taskCard.brief}], downstreamImpact: '无法回答策略问题', researchNeeded: '补查'});
  rejects(input, report);
});

test('review is bound to all task-card fields, exact bytes, complete content and source metadata', () => {
  for (const change of [input => input.taskCard.timeWindow = '2020', input => input.taskCard.confirmation.actor = 'other',
    input => input.sourceRecords[0].verification = 'verified', input => input.sourceRecords[0].url += '/changed',
    input => { input.content.sections[0].body += '新结论'; input.contentText = JSON.stringify(input.content); input.contentHash = hash(input.contentText); },
    input => { input.contentText += '\n'; input.contentHash = hash(input.contentText); }]) {
    const {input, report} = fixture(); change(input); rejects(input, report);
  }
});

test('frozen packet rejects changed or inconsistent content bytes', () => {
  const {input} = fixture();
  input.contentText += ' ';
  assert.throws(() => buildResearchReadinessPacket(input), /contentHash/);
  input.contentHash = hash(input.contentText); input.content.summary = 'changed';
  assert.throws(() => buildResearchReadinessPacket(input), /Full content/);
});

test('missing, repeated and invented coverage or source assessments are rejected', () => {
  for (const change of [report => report.coverage.pop(), report => report.coverage.push(report.coverage[0]),
    report => report.coverage[0].questionId = 'invented', report => report.sourceAssessments.pop(),
    report => report.sourceAssessments[0].sourceId = 'invented', report => report.findings.push({severity: 'blocker', questionId: 'invented', rationale: 'missing',
      refs: [{location: '/taskCard/brief', quote: '得闲'}], downstreamImpact: 'missing', researchNeeded: 'research'})]) {
    const {input, report} = fixture(); change(report); rejects(input, report);
  }
});

test('references must locate exact text in the frozen packet and actual source', () => {
  for (const change of [report => report.coverage[0].refs[0].quote = 'not present',
    report => report.coverage[0].refs[0].location = '/taskCard/missing', report => report.coverage[0].refs = [],
    report => report.sourceAssessments[0].textHash = hash('different'),
    report => report.sourceAssessments[0].refs = [{location: '/sourceRecords/1/text', quote: '案例2包装采用蓝色。'}]]) {
    const {input, report} = fixture(); change(report); rejects(input, report);
  }
});

test('a structurally valid ready judgment remains explicitly advisory and cannot contain only not-applicable questions', () => {
  const {input, report} = fixture();
  report.verdict = 'ready';
  report.coverage.forEach(item => { item.status = 'ready'; item.refs = [{location: '/content/sections/0/body', quote: input.content.sections[0].body}]; });
  const result = validateResearchReadinessOutput(report, input);
  assert.equal(result.hasBlockingFindings, false);
  assert.match(result.limitations.join(' '), /not facts proved by structural validation/);
  assert.match(result.limitations.join(' '), /authorize release/);
  report.coverage.forEach(item => { item.status = 'not_applicable'; item.refs = [{location: '/taskCard/brief', quote: input.taskCard.brief}]; });
  rejects(input, report);
});

test('strict output rejects unknown properties, missing use constraints and contradictory needs_research', () => {
  for (const change of [report => report.approved = true, report => report.rating = 5, report => report.downstreamUse.prohibited = [],
    report => report.limitations = [], report => report.coverage.forEach(item => { item.status = 'ready'; item.refs = [{location: '/content/title', quote: '得闲包装种子稿'}]; })]) {
    const {input, report} = fixture(); change(report); rejects(input, report);
  }
});

test('custom task-specific expected questions bind requirements and freeze independently of caller mutations', () => {
  const {input, report} = fixture();
  input.expectedCoverage = [{id: 'packaging-role', question: '谁购买社交场合使用的包装产品？', requirementRefs: ['/brief']}];
  const packet = buildResearchReadinessPacket(input);
  rejects(input, report);
  input.expectedCoverage[0].question = 'mutated';
  assert.equal(packet.expectedCoverage[0].question, '谁购买社交场合使用的包装产品？');
  assert.ok(Object.isFrozen(packet.sourceRecords[0]));
  input.expectedCoverage[0].requirementRefs = ['/missing'];
  assert.throws(() => buildResearchReadinessPacket(input), /Unknown packet reference/);
});

function rebind(input, report) {
  input.contentText = JSON.stringify(input.content);
  input.contentHash = hash(input.contentText);
  const {outputSchema} = buildResearchReadinessRequest(input);
  for (const [key, value] of Object.entries(outputSchema.properties)) if (value.enum?.length === 1) report[key] = value.enum[0];
}
function markReady(input, report) {
  report.verdict = 'ready';
  report.coverage.forEach(item => { item.status = 'ready'; item.refs = [{location: '/content/sections/0/body', quote: input.content.sections[0].body}]; });
}

test('blocked plans retain needs_research diagnostics but cannot become ready', () => {
  for (const [outputKind, status] of [['research_plan', 'blocked'], ['research_plan', 'complete'], ['research_findings', 'blocked']]) {
    const {input, report} = fixture();
    Object.assign(input.content, {outputKind, status});
    rebind(input, report);
    assert.equal(validateResearchReadinessOutput(report, input).verdict, 'needs_research');
    markReady(input, report);
    assert.throws(() => validateResearchReadinessOutput(report, input), /Only non-blocked research findings/);
  }
});

test('adopted unusable evidence requires a corresponding gap or blocker and cannot support ready coverage', () => {
  const {input, report} = fixture();
  report.sourceAssessments[0].use = 'unusable_for_requested_use';
  assert.throws(() => validateResearchReadinessOutput(report, input), /corresponding gap or blocker/);
  report.coverage[0].refs.push({location: '/content/claims/0/text', quote: input.content.claims[0].text});
  assert.equal(validateResearchReadinessOutput(report, input).hasBlockingFindings, true);
  markReady(input, report);
  assert.throws(() => validateResearchReadinessOutput(report, input), /Ready coverage depends on an unusable source/);
});

test('unused inventory source marked unusable does not block other ready coverage', () => {
  const {input, report} = fixture();
  markReady(input, report);
  report.sourceAssessments[1].use = 'unusable_for_requested_use';
  assert.equal(validateResearchReadinessOutput(report, input).verdict, 'ready');
  report.coverage[0].refs.push({location: '/sourceRecords/1/text', quote: input.sourceRecords[1].text});
  assert.throws(() => validateResearchReadinessOutput(report, input), /Ready coverage depends on an unusable source/);
});

test('claim-only adopted source cannot hide behind unrelated coverage or a not_used assessment', () => {
  const {input, report} = fixture();
  input.content.sections[0].evidenceIds = [];
  rebind(input, report);
  markReady(input, report);
  report.sourceAssessments[0].use = 'unusable_for_requested_use';
  assert.throws(() => validateResearchReadinessOutput(report, input), /corresponding gap or blocker/);
  report.sourceAssessments[0].use = 'not_used';
  assert.throws(() => validateResearchReadinessOutput(report, input), /adopted source cannot be marked not_used/);
});

test('ready coverage cannot use metadata or summary as its sole substantive reference', () => {
  for (const key of ['title', 'status', 'summary']) {
    const {input, report} = fixture();
    markReady(input, report);
    report.coverage[0].refs = [{location: `/content/${key}`, quote: input.content[key]}];
    assert.throws(() => validateResearchReadinessOutput(report, input), /substantive section body or claim text/);
  }
});


test('references reject serialized object snippets and require exact string-leaf values', () => {
  const {input, report} = fixture();
  input.content.evidenceClassifications = [{sourceId: 's1', scopeRelation: 'background', reason: '仅供包装背景参考'}];
  rebind(input, report);
  report.coverage[0].refs = [{location: '/content/evidenceClassifications/0', quote: '\"scopeRelation\":\"background\"'}];
  assert.throws(() => validateResearchReadinessOutput(report, input), /must target a string leaf/);
  report.coverage[0].refs = [{location: '/content/evidenceClassifications/0/scopeRelation', quote: 'background'}];
  assert.equal(validateResearchReadinessOutput(report, input).verdict, 'needs_research');
  report.coverage[0].refs[0].quote = '\"scopeRelation\":\"background\"';
  assert.throws(() => validateResearchReadinessOutput(report, input), /Quote is absent/);
  assert.match(buildResearchReadinessRequest(input).prompt, /Never reference an object or array/);
});

function markLinkedReady(input, report) {
  markReady(input, report);
  for (const item of report.coverage) item.refs.push({location: '/sourceRecords/0/text', quote: input.sourceRecords[0].text});
}

test('ready question must join its content citation to the adopted source text', () => {
  const {input, report} = fixture('adopted-source-text-v1');
  markLinkedReady(input, report);
  assert.equal(validateResearchReadinessOutput(report, input).verdict, 'ready');
  report.coverage[0].refs[1] = {location: '/sourceRecords/1/text', quote: input.sourceRecords[1].text};
  assert.throws(() => validateResearchReadinessOutput(report, input), /adopted evidence text/);
  report.coverage[0].refs.pop();
  assert.throws(() => validateResearchReadinessOutput(report, input), /adopted evidence text/);
});

test('one valid claim cannot cover another cited section with missing source linkage', () => {
  const {input, report} = fixture('adopted-source-text-v1');
  input.content.sections.push({title: '用户', body: '访谈使用情境。', evidenceIds: ['s2']});
  rebind(input, report); markLinkedReady(input, report);
  report.coverage[0].refs.push({location: '/content/sections/1/body', quote: '访谈使用情境。'});
  assert.throws(() => validateResearchReadinessOutput(report, input), /adopted evidence text/);
  report.coverage[0].refs.push({location: '/sourceRecords/1/text', quote: input.sourceRecords[1].text});
  assert.equal(validateResearchReadinessOutput(report, input).verdict, 'ready');
});

test('source metadata is not source text and stale evidence cannot be reused', () => {
  const {input, report} = fixture('adopted-source-text-v1'); markLinkedReady(input, report);
  report.coverage[0].refs[1] = {location: '/sourceRecords/0/scopeRelation', quote: 'background'};
  assert.throws(() => validateResearchReadinessOutput(report, input), /adopted evidence text/);
  markLinkedReady(input, report);
  input.sourceRecords[0].text = '修改后的来源内容。';
  assert.throws(() => validateResearchReadinessOutput(report, input), {code: 'INVALID_RESEARCH_READINESS'});
});

test('applicability-only question may cite source limitations without invented factual evidence', () => {
  const {input, report} = fixture('adopted-source-text-v1'); input.visualAssessmentScope = 'adopted-v1';
  input.sourceRecords[0].limitations = ['案例不能证明用户偏好'];
  rebind(input, report); markLinkedReady(input, report);
  const item = report.coverage.find(item => item.questionId === 'source_applicability');
  item.refs = [{location: '/sourceRecords/0/limitations/0', quote: '案例不能证明用户偏好'}];
  assert.equal(validateResearchReadinessOutput(report, input).verdict, 'ready');
});

test('valid evidence joins do not prove semantic relevance to the question', () => {
  const {input, report} = fixture('adopted-source-text-v1'); markLinkedReady(input, report);
  const item = report.coverage.find(item => item.questionId === 'users_scenarios');
  item.rationale = '错误模拟判断：蓝色案例证明用户偏好蓝色。';
  assert.equal(validateResearchReadinessOutput(report, input).verdict, 'ready');
});

test('source applicability cannot bypass evidence linking when it cites a substantive claim', () => {
  const {input, report} = fixture('adopted-source-text-v1'); input.visualAssessmentScope = 'adopted-v1';
  rebind(input, report); markLinkedReady(input, report);
  const item = report.coverage.find(item => item.questionId === 'source_applicability');
  item.refs = [{location: '/content/claims/0/text', quote: input.content.claims[0].text}];
  assert.throws(() => validateResearchReadinessOutput(report, input), /adopted evidence text/);
});

test('legacy full request bytes retain the pre-rollout fingerprint while new policy changes the binding', () => {
  const content={outputKind:'research_findings',status:'complete',sections:[{body:'Blue package.',evidenceIds:['s']}],claims:[{kind:'fact',text:'Blue package.',evidenceRefs:['s']}]};
  const contentText=JSON.stringify(content),input={artifactId:'a',content,contentText,contentHash:hash(contentText),taskCard:{id:'t',brief:'Explore blue packaging only.'},taskCardConfirmed:true,sourceRecords:[{id:'s',url:'https://example.test/blue',text:'Blue package.'}]};
  const legacy=buildResearchReadinessRequest(input);
  assert.equal(hash(JSON.stringify(legacy)),'f73b0a634a0cce48859bd745e199db55f89debf4f7d3b9a874265764b5322aae');
  const current=buildResearchReadinessRequest({...input,evidenceLinkPolicy:'adopted-source-text-v1'});
  assert.notEqual(current.packet.packetHash,legacy.packet.packetHash);
  assert.throws(()=>buildResearchReadinessRequest({...input,evidenceLinkPolicy:'unknown'}),/Unknown evidence link policy/);
});
