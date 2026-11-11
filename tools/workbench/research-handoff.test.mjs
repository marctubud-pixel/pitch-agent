import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildEvidenceReviewRequest, validateEvidenceReviewOutput} from './evidence-review.mjs';
import {buildResearchReadinessRequest, validateResearchReadinessOutput} from './research-readiness.mjs';
import {buildResearchHandoffPacket, buildResearchHandoffRequest, validateResearchHandoffOutput} from './research-handoff.mjs';

const bindings = request => Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([, item]) => item.enum?.length === 1).map(([key, item]) => [key, item.enum[0]]));
function fixture() {
  const body = 'Explore a blue packaging concept without inferring customer preference.';
  const content = {outputKind: 'research_findings', status: 'complete', sections: [{body, evidenceIds: []}], claims: []};
  const contentText = JSON.stringify(content);
  const input = {artifactId: 'research-test', content, contentText, contentHash: createHash('sha256').update(contentText).digest('hex'),
    taskCard: {id: 'task-test', brief: 'Explore a packaging concept.'}, taskCardConfirmed: true, sourceRecords: [],
    side: 'producer', targetStage: 'strategy', ownerBinding: {providerId: 'test-provider', model: 'test-model', role: 'research'}, verificationReports: [], readinessReports: []};
  const evidence = {...bindings(buildEvidenceReviewRequest(input)), results: [], wholeTextScan: {status: 'complete', creativeClaimKeys: [], omissions: [], mismatchedCreative: []}, limitations: ['Synthetic fixture, not actual approval.']};
  input.verificationReports = [validateEvidenceReviewOutput(evidence, input)];
  const readinessRequest = buildResearchReadinessRequest(input);
  const readiness = {...bindings(readinessRequest), verdict: 'ready',
    coverage: readinessRequest.packet.expectedCoverage.map(item => ({questionId: item.id, status: 'ready', rationale: 'Synthetic judgment.', refs: [{location: '/content/sections/0/body', quote: body}], downstreamImpact: 'Explore only.', researchNeeded: 'none'})),
    sourceAssessments: [], findings: [], downstreamUse: {allowed: ['Explore only.'], prohibited: ['No consumer preference claims.']}, limitations: ['Synthetic fixture, not actual approval.']};
  input.readinessReports = [validateResearchReadinessOutput(readiness, input)];
  return input;
}
function output(input, decision = 'accept') {
  return {...bindings(buildResearchHandoffRequest(input)), ownerBinding: structuredClone(input.ownerBinding), decision,
    understoodFindings: [{finding: 'Only a bounded exploration.', refs: [{location: '/content/sections/0/body', quote: input.content.sections[0].body}]}],
    permittedUses: ['Explore a packaging concept.'], prohibitedInferences: ['Do not infer consumer preference.'],
    unresolvedIssues: decision === 'blocked' ? [{blocking: true, reason: 'Required support missing.', refs: [{location: '/taskCard/brief', quote: input.taskCard.brief}]}] : [],
    limitations: ['Synthetic fixture, no real acceptance.']};
}
test('producer and consumer bind full frozen research and producer acceptance', () => {
  const input = fixture();
  const producer = validateResearchHandoffOutput(output(input), input);
  const consumer = {...input, side: 'consumer', ownerBinding: {...input.ownerBinding, role: 'strategy'}, producerReport: producer};
  const packet = buildResearchHandoffPacket(consumer);
  assert.equal(packet.contentText, input.contentText);
  assert.ok(Object.isFrozen(packet.readinessReports[0].coverage));
  assert.equal(validateResearchHandoffOutput(output(consumer), consumer).decision, 'accept');
  assert.match(producer.limitations.join(' '), /not independent review/);
  assert.match(buildResearchHandoffRequest(consumer).prompt, /manufacturing readiness/);
});
test('missing prerequisites allow a blocked judgment but forbid acceptance', () => {
  for (const key of ['verificationReports', 'readinessReports']) {
    const input = fixture(); input[key] = [];
    assert.throws(() => validateResearchHandoffOutput(output(input), input), /prerequisite/);
    assert.equal(validateResearchHandoffOutput(output(input, 'blocked'), input).decision, 'blocked');
  }
});
test('later passing review cannot erase an earlier blocker', () => {
  const input = fixture();
  const blocker = structuredClone(input.readinessReports[0]);
  blocker.verdict = 'needs_research'; blocker.coverage[0].status = 'gap'; blocker.hasBlockingFindings = true;
  input.readinessReports.unshift(blocker);
  assert.throws(() => validateResearchHandoffOutput(output(input), input), /prerequisite/);
});
test('every report, role and source revision invalidates prior handoff bindings', () => {
  for (const mutate of [input => input.verificationReports[0].limitations.push('Added limitation.'),
    input => input.readinessReports[0].limitations.push('Added limitation.'), input => input.ownerBinding.model = 'other-model',
    input => input.taskCard.extraRequirement = 'new requirement']) {
    const input = fixture(), report = output(input); mutate(input);
    assert.throws(() => validateResearchHandoffOutput(report, input));
  }
});
test('consumer requires a producer accepted on the identical research and reports', () => {
  const input = fixture(), producerReport = validateResearchHandoffOutput(output(input), input);
  const consumer = {...input, side: 'consumer', producerReport};
  assert.throws(() => buildResearchHandoffPacket({...consumer, producerReport: null}), /requires/);
  consumer.verificationReports[0].limitations.push('Changed after signing.');
  assert.throws(() => buildResearchHandoffPacket(consumer), /packetHash/);
});
test('unresolved blocking issues and exact leaf references are enforced', () => {
  for (const mutate of [report => report.unresolvedIssues.push({blocking: true, reason: 'gap', refs: report.understoodFindings[0].refs}),
    report => report.decision = 'blocked', report => report.understoodFindings[0].refs[0].location = '/content/sections/0',
    report => report.understoodFindings[0].refs[0].quote = 'invented', report => report.prohibitedInferences = [],
    report => report.unresolvedIssues.push({blocking: 'false', reason: 'gap', refs: report.understoodFindings[0].refs}),
    report => report.understoodFindings = []]) {
    const input = fixture(), report = output(input); mutate(report);
    assert.throws(() => validateResearchHandoffOutput(report, input), {code: 'INVALID_RESEARCH_HANDOFF'});
  }
});
test('exact original bytes are mandatory and inputs remain unchanged', () => {
  const input = fixture(), snapshot = structuredClone(input);
  buildResearchHandoffRequest(input);
  assert.deepEqual(input, snapshot);
  input.contentText += ' ';
  assert.throws(() => buildResearchHandoffPacket(input), /contentHash/);
});
