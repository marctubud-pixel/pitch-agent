import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildResearchReadinessPacket, buildResearchReadinessRequest, validateResearchReadinessOutput} from './research-readiness.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
function fixture(scope = 'adopted-v1') {
  const content = {outputKind: 'research_findings', status: 'complete', title: 'Packaging', summary: 'Appearance only',
    sections: [{heading: 'Appearance', body: 'A blue package is visible.', evidenceIds: ['visual:1']}],
    claims: [{kind: 'fact', text: 'A blue package is visible.', evidenceRefs: ['visual:2'], limitations: ['No evidence of preference.']}],
    evidenceClassifications: [{sourceId: 's1', scopeRelation: 'background', reason: 'Captured example only.'}]};
  const contentText = JSON.stringify(content);
  const input = {artifactId: 'research-scope', content, contentText, contentHash: hash(contentText),
    taskCard: {id: 'task-scope', brief: 'Explore packaging strategy.'}, taskCardConfirmed: true,
    sourceRecords: [{id: 's1', url: 'https://example.org/source', text: 'A package is shown.', verification: 'captured', scopeRelation: 'background'}],
    visualCatalogue: Array.from({length: 31}, (_, i) => ({id: `visual:${i + 1}`, observationId: 'observation', reviewId: 'review', imageId: `image-${i + 1}`,
      imageSha256: 'a'.repeat(64), kind: 'visibleFeature', text: `Visible feature ${i + 1}`, region: 'whole image', manifestHash: 'b'.repeat(64),
      observationHash: 'c'.repeat(64), reviewHash: 'd'.repeat(64), limits: ['Visible appearance only.']})),
    ...(scope ? {visualAssessmentScope: scope} : {})};
  return {input, report: reportFor(input)};
}
function reportFor(input) {
  const {packet, outputSchema} = buildResearchReadinessRequest(input);
  const report = Object.fromEntries(Object.entries(outputSchema.properties).filter(([, value]) => value.enum?.length === 1).map(([key, value]) => [key, value.enum[0]]));
  return {...report, verdict: 'ready', coverage: packet.expectedCoverage.map(item => ({questionId: item.id, status: 'ready', rationale: 'Bounded exploratory use.',
    refs: [{location: '/content/sections/0/body', quote: input.content.sections[0].body}], downstreamImpact: 'Exploration only.', researchNeeded: 'none'})),
  sourceAssessments: packet.sourceRecords.map((source, index) => ({sourceId: source.id, textHash: source.textHash, use: 'not_used', relevance: 'Inventory only.',
    provenance: 'Captured excerpt.', limitations: ['Not independently verified.'], refs: [{location: `/sourceRecords/${index}/text`, quote: source.text}]})),
  ...(packet.visualCatalogue?.length ? {visualAssessments: packet.visualCatalogue.filter(entry => !packet.expectedVisualAssessmentIds || packet.expectedVisualAssessmentIds.includes(entry.id))
    .map(entry => ({visualId: entry.id, use: ['visual:1', 'visual:2'].includes(entry.id) ? 'usable_with_limits' : 'not_used', relevance: 'Appearance only.',
      limitations: entry.limits, refs: [{location: `/visualCatalogue/${packet.visualCatalogue.indexOf(entry)}/text`, quote: entry.text}]}))} : {}),
  findings: [], downstreamUse: {allowed: ['Exploratory strategy.'], prohibited: ['Consumer preference claims.']}, limitations: ['Visible appearance only.']};
}
function refresh(input) {
  input.contentText = JSON.stringify(input.content);
  input.contentHash = hash(input.contentText);
  return reportFor(input);
}
function rejects(input, report, pattern) {
  assert.throws(() => validateResearchReadinessOutput(report, input), pattern ?? {code: 'INVALID_RESEARCH_READINESS'});
}

test('legacy frozen packet and schema retain exact prior hashes and all 31 assessments', () => {
  const {input, report} = fixture(null);
  const {packet, outputSchema, prompt} = buildResearchReadinessRequest(input);
  assert.equal(packet.packetHash, '4ed99da310466af09f3d9afc4549c2dfcd7e1aa3e5e19085208d8c51c36f9d88');
  assert.equal(hash(JSON.stringify(outputSchema)), '775cd26cc1da04f6d6e30c54dfe6047bbe4020e1c794f4d86569fc267dfdd11c');
  assert.equal(Object.hasOwn(packet, 'visualAssessmentScope'), false);
  assert.equal(Object.hasOwn(packet, 'expectedVisualAssessmentIds'), false);
  assert.match(prompt, /Read and assess every visualCatalogue entry separately/);
  assert.equal(validateResearchReadinessOutput(report, input).visualAssessments.length, 31);
  report.visualAssessments.pop();
  rejects(input, report, /Visuals requires exact unique coverage/);
});

test('adopted scope freezes all inventory but derives exact assessment IDs from both adoption locations', () => {
  const {input, report} = fixture();
  input.expectedVisualAssessmentIds = ['visual:31'];
  const {packet, outputSchema, prompt} = buildResearchReadinessRequest(input);
  assert.equal(packet.visualCatalogue.length, 31);
  assert.deepEqual(packet.expectedVisualAssessmentIds, ['visual:1', 'visual:2']);
  assert.deepEqual(outputSchema.properties.visualAssessments.items.properties.visualId.enum, ['visual:1', 'visual:2']);
  assert.equal(outputSchema.properties.visualAssessments.maxItems, 2);
  assert.match(prompt, /assess exactly expectedVisualAssessmentIds/);
  assert.equal(packet.visualAssessmentScope, 'adopted-v1');
  assert.equal(report.visualAssessmentScope, 'adopted-v1');
  assert.ok(Object.isFrozen(packet.expectedVisualAssessmentIds));
  assert.equal(validateResearchReadinessOutput(report, input).visualAssessments.length, 2);
  input.visualCatalogue[30].text = 'Changed unused inventory';
  rejects(input, report);
});

test('missing, duplicate, invented and unadopted visual assessments are rejected', () => {
  for (const mutate of [report => report.visualAssessments.pop(), report => report.visualAssessments[1] = structuredClone(report.visualAssessments[0]),
    report => report.visualAssessments[1].visualId = 'visual:31', report => report.visualAssessments[1].visualId = 'visual:invented']) {
    const {input, report} = fixture();
    mutate(report);
    rejects(input, report);
  }
});

test('no adopted visuals means an exact empty assessment array and unchanged full source assessments', () => {
  const {input} = fixture();
  input.content.sections[0].evidenceIds = [];
  input.content.claims[0].evidenceRefs = [];
  const report = refresh(input);
  const {packet, outputSchema} = buildResearchReadinessRequest(input);
  assert.equal(packet.visualCatalogue.length, 31);
  assert.deepEqual(packet.expectedVisualAssessmentIds, []);
  assert.equal(outputSchema.properties.visualAssessments.maxItems, 0);
  assert.equal(validateResearchReadinessOutput(report, input).visualAssessments.length, 0);
  assert.equal(report.sourceAssessments.length, 1);
  delete report.visualAssessments;
  rejects(input, report);
});

test('scope changes invalidate frozen reports and unknown versions fail closed', () => {
  const {input, report} = fixture();
  const legacy = structuredClone(input);
  delete legacy.visualAssessmentScope;
  assert.notEqual(buildResearchReadinessPacket(input).packetHash, buildResearchReadinessPacket(legacy).packetHash);
  rejects(legacy, report);
  const oldReport = reportFor(legacy);
  rejects(input, oldReport);
  input.visualAssessmentScope = 'adopted-v2';
  assert.throws(() => buildResearchReadinessPacket(input), /visualAssessmentScope/);
});

test('unused visuals cannot support ready coverage even when a substantive citation accompanies them', () => {
  const {input, report} = fixture();
  report.coverage[0].refs.push({location: '/visualCatalogue/30/text', quote: input.visualCatalogue[30].text});
  rejects(input, report, /unadopted visual/);
});

test('adopted unusable or not_used visual cannot bypass readiness gates', () => {
  const {input, report} = fixture();
  report.visualAssessments[0].use = 'not_used';
  rejects(input, report, /adopted source cannot be marked not_used/);
  report.visualAssessments[0].use = 'unusable_for_requested_use';
  rejects(input, report, /Ready coverage depends on an unusable source/);
  report.coverage.forEach(item => {item.status = 'gap'; item.refs = [{location: '/taskCard/brief', quote: input.taskCard.brief}];});
  report.verdict = 'needs_research';
  rejects(input, report, /corresponding gap or blocker/);
  report.coverage[0].refs.push({location: '/content/sections/0/body', quote: input.content.sections[0].body});
  assert.equal(validateResearchReadinessOutput(report, input).hasBlockingFindings, true);
});

test('source_applicability alone can use explicit limitations and applicability metadata in adopted scope', () => {
  for (const [location, quote] of [['/content/claims/0/limitations/0', 'No evidence of preference.'],
    ['/content/evidenceClassifications/0/reason', 'Captured example only.'], ['/sourceRecords/0/verification', 'captured'],
    ['/visualCatalogue/0/limits/0', 'Visible appearance only.']]) {
    const {input, report} = fixture();
    report.sourceAssessments[0].use = 'usable_with_limits';
    const applicability = report.coverage.find(item => item.questionId === 'source_applicability');
    applicability.refs = [{location, quote}];
    assert.equal(validateResearchReadinessOutput(report, input).verdict, 'ready');
    report.coverage[0].refs = [{location, quote}];
    rejects(input, report, /substantive section body or claim text/);
  }
});

test('legacy source_applicability still requires substantive research text', () => {
  const {input, report} = fixture(null);
  report.coverage.find(item => item.questionId === 'source_applicability').refs = [{location: '/content/claims/0/limitations/0', quote: 'No evidence of preference.'}];
  rejects(input, report, /substantive section body or claim text/);
});

test('metadata applicability alone cannot establish overall readiness', () => {
  const {input} = fixture();
  input.expectedCoverage = [{id: 'source_applicability', question: 'Are evidence limits explicit?', requirementRefs: ['/brief']}];
  const report = reportFor(input);
  report.coverage[0].refs = [{location: '/content/claims/0/limitations/0', quote: 'No evidence of preference.'}];
  rejects(input, report, /substantive applicable coverage/);
});

test('new scope cannot treat title, status, summary, gaps or task obligations as ready applicability', () => {
  for (const location of ['/content/title', '/content/status', '/content/summary', '/content/gaps/0', '/taskCard/brief']) {
    const {input} = fixture();
    input.content.gaps = ['Missing user research.'];
    const report = refresh(input);
    const value = location === '/taskCard/brief' ? input.taskCard.brief : location === '/content/gaps/0' ? input.content.gaps[0] : input.content[location.split('/').at(-1)];
    report.coverage.find(item => item.questionId === 'source_applicability').refs = [{location, quote: value}];
    rejects(input, report, /substantive section body or claim text/);
  }
});

test('new scope still rejects ready plans, blocked artifacts, coverage gaps and blockers', () => {
  for (const mutate of [input => {input.content.outputKind = 'research_plan';}, input => {input.content.status = 'blocked';}]) {
    const {input} = fixture(); mutate(input);
    rejects(input, refresh(input), /Only non-blocked research findings/);
  }
  const {input, report} = fixture();
  report.coverage[0].status = 'gap';
  rejects(input, report, /Verdict contradicts/);
  report.coverage[0].status = 'ready';
  report.findings.push({severity: 'blocker', questionId: 'core_question', rationale: 'Missing research.', refs: [{location: '/taskCard/brief', quote: input.taskCard.brief}], downstreamImpact: 'Blocked.', researchNeeded: 'Research users.'});
  rejects(input, report, /Verdict contradicts/);
});
