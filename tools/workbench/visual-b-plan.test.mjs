import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFinalPlan, finalPanelNodes} from './final-visual.mjs';

// Pure calls into the original native validators. No project, ticket, image or DB is created.
function planFixture(kind = 'packaging') {
  const sha = 'c'.repeat(64), ids = ['fixture-d1', 'fixture-d2', 'fixture-d3'];
  const copy = {directions: ids.map(id => ({id, slogan: 'fixture only'})), claims: []};
  const selected = ids.map((directionId, i) => ({directionId, candidateId: `fixture-c${i}`, imageId: `fixture-i${i}`, sha256: sha}));
  const views = kind === 'packaging' ? ['front', 'three-quarter', 'bottle-box-combination'] : ['main-kv'];
  const source = {sourceHash: sha, copy, selected, images: selected, task: {finalVisualRequirements: [{kind, views}]}};
  const raw = {protocol: 'final-visual-v1', sourceHash: sha, kind: 'plan', copy: copy.directions, workOrder: 'Pure validator fixture only', specialistRequirements: [], directions: selected.map((s, i) => ({directionId: s.directionId, selectedCandidateId: s.candidateId, selectedImageId: s.imageId, approvedCopy: copy.directions[i], explanation: 'fixture explanation', presentationIntent: 'validator fixture', claims: [], limitations: ['Concept only; manufacturing and print unverified.'], targets: [{id: `fixture-t${i}`, kind, use: 'validator fixture', format: 'fixture-format', requiredViews: [...views], typography: {copy: copy.directions[i], route: 'generated_integrated', hierarchy: 'fixture', placement: 'fixture', imageInteraction: 'fixture'}, operation: {kind: 'edit', prompt: 'Never sent to provider', options: {}, images: [{imageId: s.imageId, sha256: s.sha256}]}}]}))};
  return {source, raw};
}
test('native planner preserves explicitly required packaging views in every direction', () => {
  const {source, raw} = planFixture();
  assert.match(validateFinalPlan(raw, source).planHash, /^[a-f0-9]{64}$/);
  raw.directions[1].targets[0].requiredViews = ['front'];
  assert.throws(() => validateFinalPlan(raw, source), {code: 'FINAL_REQUIRED_OUTPUT_MISSING'});
});
test('native KV targets use current task view requirements', () => {
  const {source, raw} = planFixture('kv');
  assert.equal(validateFinalPlan(raw, source).directions[0].targets[0].kind, 'kv');
});
test('native packaging limitations and exact approved lettering cannot be omitted', () => {
  const {source, raw} = planFixture(); raw.directions[0].limitations = ['Aesthetic only'];
  assert.throws(() => validateFinalPlan(raw, source), {code: 'FINAL_PACKAGING_LIMIT_REQUIRED'});
  const separate = planFixture();
  separate.raw.directions[0].approvedCopy = {...separate.raw.directions[0].approvedCopy, slogan: 'changed'};
  assert.throws(() => validateFinalPlan(separate.raw, separate.source), {code: 'FINAL_COPY_CHANGED'});
});
test('native refinement must edit the exact selected original', () => {
  const {source, raw} = planFixture(); raw.directions[0].targets[0].operation.images[0].sha256 = 'd'.repeat(64);
  assert.throws(() => validateFinalPlan(raw, source), {code: 'FINAL_EDIT_INPUT_REQUIRED'});
});
test('original four roles, blind readings, challenges and independent director stay native', () => {
  const nodes = finalPanelNodes();
  assert.equal(nodes.length, 13);
  for (const phase of ['score', 'blind', 'challenge']) assert.deepEqual(nodes.filter(n => n.phase === phase).map(n => n.role), ['visual', 'brand', 'user', 'communication']);
  assert.equal(nodes.at(-1).phase, 'director');
});
