import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {ownerEdgeState, validatedResearchAssessment, researchAssessmentContext, researchWorkflowView, strategyBasisFor, releaseReadiness} from './project.mjs';

const fixtureBytes = gunzipSync(readFileSync(new URL('./fixtures/project-evaluation-synthetic.json.gz', import.meta.url)));
const fixture = () => JSON.parse(fixtureBytes);
const projectHash = 'ccbd5a29d6e069031a6634f4bd3b8883f83be57212f530ae83eeed2553327bb8';

test('captured synthetic pure-domain fixture retains the complete project and committed owner outcome', () => {
  assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), projectHash);
  const p = fixture();
  assert.equal(p.jobs.length, 15);
  assert.equal(p.artifacts.length, 3);
  assert.deepEqual(ownerEdgeState(p, p.ownerEdges[0]), {status: 'committed', jobId: p.ownerEdges[0].commit.jobId});
});

const mutations = [
  ['operator restrictions', p => p.researchHandoffDeclarations[0].prohibitedInferences.push('Additional synthetic restriction.')],
  ['producer handoff decision', p => { p.handoffReports[0].decision = 'blocked'; }],
  ['consumer handoff decision', p => { p.handoffReports[1].decision = 'blocked'; }],
  ['original handoff receipt', p => { p.handoffReports[0].executionReceipt.responseText += ' '; }],
  ['human declaration revocation', p => { p.researchHandoffDeclarations[1].decision = 'returned'; }],
  ['new selected human gate', p => { p.policies[0].humanGates = ['strategy']; }],
  ['removed creative decision', p => { p.decisions = []; }],
];
for (const [name, mutate] of mutations) test(`owner authority rechecks ${name} on the same object without a revision increment`, () => {
  const p = fixture(), originalObject = p, revision = p.revision, saved = structuredClone(p);
  const expected = ownerEdgeState(p, p.ownerEdges[0]);
  assert.equal(expected.status, 'committed');
  mutate(p);
  assert.equal(p.revision, revision);
  const rejected = ownerEdgeState(p, p.ownerEdges[0]);
  assert.notEqual(rejected.status, 'committed');
  assert.equal(typeof rejected.blockedReason, 'string');
  for (const key of Object.keys(p)) delete p[key];
  Object.assign(p, saved);
  assert.equal(p, originalObject);
  assert.equal(p.revision, revision);
  assert.deepEqual(ownerEdgeState(p, p.ownerEdges[0]), expected);
});

test('public assessment results remain mutable independent copies and a failed call can be repaired', () => {
  const p = fixture(), id = p.activeByStage.research, revision = p.revision;
  const first = validatedResearchAssessment(p, id), second = validatedResearchAssessment(p, id);
  assert.notEqual(first, second);
  assert.notEqual(first.rawReport, second.rawReport);
  assert.notEqual(first.input, second.input);
  assert.equal(Object.isFrozen(first), false);
  first.rawReport.limitations.push('Caller-only mutation.');
  assert.deepEqual(validatedResearchAssessment(p, id), second);
  p.readinessReports[0].rawReport.downstreamUse.prohibited.push('New stored restriction.');
  assert.throws(() => validatedResearchAssessment(p, id));
  p.readinessReports[0].rawReport.downstreamUse.prohibited.pop();
  assert.equal(p.revision, revision);
  assert.deepEqual(validatedResearchAssessment(p, id), second);
});

test('filtered assessment context excludes its own report but rejects new included manual history', () => {
  const p = fixture(), job = p.jobs.find(j => j.purpose === 'readiness');
  const read = () => researchAssessmentContext(p, p.activeByStage.research, job.binding, job.id);
  const expected = read();
  p.readinessReports[0].rawReport.downstreamUse.prohibited.push('Excluded assessment history.');
  assert.deepEqual(read(), expected);
  p.reviews.push({id: 'new-manual-history', artifactId: p.activeByStage.research, findings: []});
  assert.throws(read, {code: 'UNSUPPORTED_CORRECTION_SOURCE'});
  p.reviews.pop();
  assert.deepEqual(read(), expected);
});

test('dependency cycles remain ineligible and repairing the same project restores readiness', () => {
  const p = fixture(), a = p.artifacts.find(a => a.id === p.activeByStage.research), inputs = a.inputVersionIds;
  const expected = releaseReadiness(p, a.id);
  assert.equal(expected.eligible, true);
  a.inputVersionIds = [a.id];
  assert.equal(releaseReadiness(p, a.id).eligible, false);
  a.inputVersionIds = inputs;
  assert.deepEqual(releaseReadiness(p, a.id), expected);
});

test('malformed project arguments preserve the original property-access error', () => {
  for (const p of [null, undefined]) assert.throws(() => validatedResearchAssessment(p, 'missing'), error => error instanceof TypeError && /artifacts/.test(error.message));
});

test('public destructured options are read once before evaluation', () => {
  const workflowReads = [];
  researchWorkflowView(fixture(), {
    get bindings() { workflowReads.push('bindings'); return {}; },
    get providers() { workflowReads.push('providers'); return {}; },
  });
  assert.deepEqual(workflowReads, ['bindings', 'providers']);
  const basisReads = [];
  assert.throws(() => strategyBasisFor(fixture(), {}, {
    get sourceRecords() { basisReads.push('sourceRecords'); return []; },
    get visualCatalogue() { basisReads.push('visualCatalogue'); return []; },
  }), {code: 'INVALID_STRATEGY_BASIS'});
  assert.deepEqual(basisReads, ['sourceRecords', 'visualCatalogue']);
});
