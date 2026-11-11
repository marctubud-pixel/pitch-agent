import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkPackage, evaluateStage, loadEvidence } from '../scripts/check-stage.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const roles = ['visual', 'brand', 'user', 'spread'];
const dimensions = { visual: ['quality', 'composition'], brand: ['compatibility', 'translation'], user: ['understanding', 'feasibility'], spread: ['memory', 'difference'] };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO7sAAAAASUVORK5CYII=', 'base64');

async function fixture(t, stage = 'sketch_review') {
  const root = await mkdtemp(join(directory, '../verification/synthetic-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pointer = async (name, content) => {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(JSON.stringify(content));
    await writeFile(join(root, name), bytes);
    return { path: name, sha256: sha(bytes) };
  };
  const current = { taskId: 'synthetic-only', scopeVersion: 'scope-1', inputVersion: 'input-1', reviewTask: 'Synthetic evidence binding only', requiresNode: true, creatorIds: ['creator'] };
  const currentInput = await pointer('current.json', current);
  const artifact = await pointer('image.png', png);
  const input = {
    skillVersion: '1.0.0', task: { id: current.taskId, scopeVersion: current.scopeVersion, inputVersion: current.inputVersion, requiresNode: true, creatorIds: ['creator'] },
    currentInput, stage, action: 'advance', nextStage: stage === 'reference_review' ? 'sketch_review' : 'refine_review', revisionsUsed: 0, budgetSpent: 0, budgetUnit: 'synthetic-operations',
    object: { id: 'synthetic-image', version: 'image-1', kind: stage === 'reference_review' ? 'direction' : 'artwork', task: current.reviewTask, file: artifact,
      translation: 'Synthetic method to carrier to theme', comparison: 'Synthetic comparison', innovationHypothesis: 'Synthetic testable hypothesis' },
    referenceSet: { mainId: 'main', cards: [{ id: 'main', kind: 'direction', file: artifact, use: 'Synthetic composition', prohibited: 'Copying the whole image' }] }
  };
  const authorization = { ...current, currentInputSha256: currentInput.sha256, mode: 'automatic', humanNodes: [], allowedStages: ['reference_intake', 'reference_review', 'sketch_review', 'refine_review', 'overall_review', 'delivery'], revisionLimit: 3, budget: { status: 'known', limit: 10, unit: 'synthetic-operations' } };
  const base = { taskId: current.taskId, scopeVersion: current.scopeVersion, inputVersion: current.inputVersion, currentInputSha256: currentInput.sha256,
    skillVersion: input.skillVersion, stage, objectId: input.object.id, objectVersion: input.object.version, artifactSha256: artifact.sha256,
    objectSha256: sha(JSON.stringify(input.object)), referenceSetSha256: sha(JSON.stringify(input.referenceSet)), task: current.reviewTask, observation: 'Synthetic fixture location and visible observation; no aesthetic claim', unknowns: [], hardIssues: [] };
  const reviews = [
    ...roles.map(role => ({ ...structuredClone(base), kind: 'score', role, reviewerId: `score-${role}`, score: 4,
      dimensions: dimensions[role].map(name => ({ name, status: 'rated', score: 4, evidence: 'Synthetic visible relation and declared use' })) })),
    ...roles.map(role => ({ ...structuredClone(base), kind: 'challenge', role, reviewerId: `challenge-${role}`, findings: [] })),
    { ...structuredClone(base), kind: 'adjudication', reviewerId: 'independent-adjudicator', criticalChecks: Object.fromEntries(['theme', 'brand', 'node', 'comprehension'].map(key => [key, { status: 'supported', evidence: 'Synthetic image-bound observation only' }])),
      resolutions: [], bundleCoverage: 'Synthetic requirements mapped to source cards', styleCompatibility: 'Synthetic compatibility observation', referenceSetSha256: sha(JSON.stringify(input.referenceSet)) }
  ];
  let confirmation;
  const save = async () => {
    input.authorization = await pointer('authorization.json', authorization);
    input.reviews = await Promise.all(reviews.map((review, index) => pointer(`review-${index}.json`, review)));
    if (confirmation) input.confirmation = await pointer('confirmation.json', confirmation);
    await pointer('package.json', input);
    return join(root, 'package.json');
  };
  return { root, input, current, authorization, reviews, pointer, save,
    confirm: () => { confirmation = { taskId: current.taskId, scopeVersion: current.scopeVersion, inputVersion: current.inputVersion,
      currentInputSha256: currentInput.sha256, artifactSha256: artifact.sha256, objectVersion: input.object.version, stage,
      nextStage: input.nextStage, decision: 'confirm', humanId: 'synthetic-human', recordedAt: '2026-11-10T00:00:00Z' }; return confirmation; },
    check: async () => checkPackage(await save()) };
}

for (const [name, modify, decision] of [
  ['four independent overall scores permit a structural handoff', () => {}, 'eligible_for_requested_transition'],
  ['missing score never reduces the denominator', f => f.reviews.splice(0, 1), 'cannot_assess'],
  ['a high average cannot override a visible hard issue', f => f.reviews[4].hardIssues.push({ id: 'H1', rule: 'Theme contradicted', location: 'center', observation: 'Synthetic direct contradiction' }), 'reject'],
  ['critical missing evidence blocks handoff', f => f.reviews[5].unknowns.push({ id: 'U1', critical: true, missing: 'Necessary label is unavailable' }), 'cannot_assess'],
  ['noncritical uncertainty is retained without automatic rejection', f => f.reviews[5].unknowns.push({ id: 'U1', critical: false, missing: 'Optional future material detail' }), 'eligible_for_requested_transition'],
  ['a failed critical check cannot hide behind a high mean', f => { f.reviews[8].criticalChecks.theme.status = 'contradicted'; }, 'reject'],
  ['upstream input version invalidates old votes', f => { f.input.task.inputVersion = 'input-2'; }, 're_review'],
  ['changed scope requires renewed authorization and review', f => { f.authorization.scopeVersion = 'scope-2'; }, 're_review'],
  ['changed image version cannot inherit original scores', f => { f.input.object.version = 'image-2'; }, 're_review'],
  ['even a relabeled task cannot reuse image votes', f => { f.input.object.task = 'Different task'; }, 're_review'],
  ['production author cannot score own image', f => { f.reviews[0].reviewerId = 'creator'; }, 'reject'],
  ['separate roles cannot share one reviewer identity', f => { f.reviews[4].reviewerId = f.reviews[0].reviewerId; }, 'reject'],
  ['adversarial role has no score', f => { f.reviews[4].score = 5; }, 'reject'],
  ['four corresponding adversarial roles are required', f => f.reviews.splice(4, 1), 'cannot_assess'],
  ['adjudication cannot be skipped', f => f.reviews.pop(), 'cannot_assess'],
  ['adversarial findings require independent resolution', f => f.reviews[4].findings.push({ id: 'F1', rule: 'Hierarchy', location: 'top', observation: 'Two competing headlines', impact: 'Reading order uncertain', acceptance: 'Verify one primary headline' }), 'cannot_assess'],
  ['automatic mode stops at authorized endpoint', f => { f.authorization.allowedStages = ['sketch_review']; }, 'pause'],
  ['assisted configured node needs explicit human confirmation', f => { f.authorization.mode = 'assisted'; f.authorization.humanNodes = ['sketch_review']; }, 'awaiting_confirmation'],
  ['human checkpoints also apply in automatic mode', f => { f.authorization.humanNodes = ['sketch_review']; }, 'awaiting_confirmation'],
  ['explicit bound human decision permits handoff', f => { f.authorization.mode = 'assisted'; f.authorization.humanNodes = ['sketch_review']; f.confirm(); }, 'eligible_for_requested_transition'],
  ['stale human decision does not authorize changed image', f => { f.authorization.humanNodes = ['sketch_review']; f.confirm().artifactSha256 = '0'.repeat(64); }, 'awaiting_confirmation'],
  ['maximum three revisions pauses a fourth request', f => { f.input.action = 'revise'; f.input.nextStage = 'sketch_review'; f.input.revisionsUsed = 3; }, 'pause'],
  ['third completed revision can stop early with valid review', f => { f.input.revisionsUsed = 3; }, 'eligible_for_requested_transition'],
  ['legacy extra three rounds cannot be enabled by a larger limit', f => { f.authorization.revisionLimit = 6; }, 'cannot_assess'],
  ['known spend over budget pauses', f => { f.input.budgetSpent = 11; }, 'pause'],
  ['unknown budget is not fabricated as a number', f => { f.authorization.budget = { status: 'unknown' }; }, 'pause'],
  ['unrounded mean below four does not pass', f => { [4, 4, 4, 3].forEach((score, index) => { f.reviews[index].score = score; }); }, 'revise'],
  ['a low individual score is allowed when the four-vote mean is four', f => { [2, 4, 5, 5].forEach((score, index) => { f.reviews[index].score = score; }); }, 'eligible_for_requested_transition'],
  ['skipping the next stage is rejected', f => { f.input.nextStage = 'delivery'; }, 'reject'],
  ['passing booleans cannot replace original records', f => { f.reviews.splice(0, 9, { pass: true }); }, 're_review']
]) test(name, async t => { const f = await fixture(t); modify(f); assert.equal((await f.check()).decision, decision); });

test('reference dimensions must each pass and never average', async t => {
  const f = await fixture(t, 'reference_review');
  f.reviews[0].dimensions[0].score = 3;
  f.reviews[0].dimensions[1].score = 5;
  assert.equal((await f.check()).decision, 'revise');
});
test('a complete direction set can satisfy only the structural reference gate', async t => {
  const f = await fixture(t, 'reference_review');
  assert.equal((await f.check()).decision, 'eligible_for_requested_transition');
});
async function component(t) {
  const f = await fixture(t, 'reference_review');
  f.input.object.kind = 'component';
  f.input.object.componentUse = 'material';
  for (const review of f.reviews) review.objectSha256 = sha(JSON.stringify(f.input.object));
  for (const review of f.reviews.filter(review => review.kind === 'score')) {
    for (const dimension of review.dimensions) if (!['quality', 'compatibility', 'understanding'].includes(dimension.name)) Object.assign(dimension, { status: 'not_applicable', score: null });
    if (review.role === 'spread') Object.assign(review, { boundary: 'boundary_clear', boundaryEvidence: 'No whole-copy or effect/popularity claim' });
  }
  return f;
}
test('a component cannot advance a whole reference direction', async t => {
  const f = await component(t);
  assert.equal((await f.check()).decision, 'reject');
});
test('component approval is narrowly labeled and respects human checkpoint', async t => {
  const f = await component(t);
  f.input.action = 'record'; f.input.nextStage = 'reference_review';
  assert.equal((await f.check()).decision, 'component_use_only');
  f.authorization.humanNodes = ['reference_review'];
  assert.equal((await f.check()).decision, 'awaiting_confirmation');
});
test('all-component reference sets cannot satisfy a direction handoff', async t => {
  const f = await fixture(t, 'reference_review');
  f.input.referenceSet.cards[0].kind = 'component';
  assert.equal((await f.check()).decision, 'cannot_assess');
});
test('altering the source set invalidates bundle adjudication', async t => {
  const f = await fixture(t, 'reference_review');
  f.input.referenceSet.cards[0].use = 'Different proposed use';
  assert.equal((await f.check()).decision, 're_review');
});
test('unavailable and tampered actual images fail verification', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'image.png'), Buffer.from('changed image bytes'));
  assert.equal((await f.check()).decision, 'cannot_assess');
  await rm(join(f.root, 'image.png'));
  assert.equal((await f.check()).decision, 'cannot_assess');
});
test('renamed non-image file is rejected even with a matching hash', async t => {
  const f = await fixture(t);
  f.input.object.file = await f.pointer('fake.png', Buffer.from('not a visible image'));
  assert.equal((await f.check()).decision, 'cannot_assess');
});
test('actual new image bytes cannot inherit old votes', async t => {
  const f = await fixture(t);
  f.input.object.file = await f.pointer('new.png', Buffer.concat([png, Buffer.from('new-version')]));
  assert.equal((await f.check()).decision, 're_review');
});
test('raw vote tampering or disappearance is detected', async t => {
  const f = await fixture(t);
  const path = await f.save();
  await writeFile(join(f.root, 'review-0.json'), '{}');
  assert.equal((await checkPackage(path)).decision, 'cannot_assess');
  await rm(join(f.root, 'review-0.json'));
  assert.equal((await checkPackage(path)).decision, 'cannot_assess');
});
test('input bytes change invalidates old frozen authorization even if the label is reused', async t => {
  const f = await fixture(t);
  f.input.currentInput = await f.pointer('current-2.json', { ...f.current, additionalConstraint: 'new constraint' });
  assert.equal((await f.check()).decision, 're_review');
});
test('intake only records real evidence and does not manufacture a panel', async t => {
  const f = await fixture(t, 'reference_intake');
  f.input.object.kind = 'intake';
  f.input.object.file = await f.pointer('manifest.json', { collected: [], gaps: ['No reference selected'], status: 'unreviewed' });
  f.input.action = 'record'; f.input.nextStage = 'reference_intake'; f.reviews.splice(0);
  assert.equal((await f.check()).decision, 'record_only');
  f.authorization.humanNodes = ['reference_intake'];
  assert.equal((await f.check()).decision, 'awaiting_confirmation');
});
test('pure evaluator does not read files and matches the verified adapter', async t => {
  const f = await fixture(t);
  const path = await f.save();
  const evidence = await loadEvidence(f.input, f.root);
  const expected = evaluateStage(f.input, evidence);
  await rm(join(f.root, 'image.png'));
  assert.deepEqual(evaluateStage(f.input, evidence), expected);
  assert.equal((await checkPackage(path)).decision, 'cannot_assess');
});
test('CLI emits only decision/reasons and makes no fixture mutations', async t => {
  const f = await fixture(t);
  const path = await f.save();
  const before = await readFile(path, 'utf8');
  const child = spawnSync(process.execPath, [join(directory, '../scripts/check-stage.mjs'), path], { encoding: 'utf8' });
  assert.equal(child.status, 0);
  const output = JSON.parse(child.stdout);
  assert.deepEqual(Object.keys(output), ['decision', 'reasons']);
  assert.equal(output.decision, 'eligible_for_requested_transition');
  assert.equal(child.stderr, '');
  assert.equal(await readFile(path, 'utf8'), before);
});
test('unreadable package reports a bounded failure', async () => {
  assert.equal((await checkPackage(join(directory, 'does-not-exist.json'))).decision, 'cannot_assess');
});

test('changed purpose card cannot inherit votes on unchanged image bytes', async t => {
  const f = await fixture(t, 'reference_review');
  f.input.object.translation = 'A materially different translation';
  assert.equal((await f.check()).decision, 're_review');
});
test('reference fives require specified comparison evidence', async t => {
  const f = await fixture(t, 'reference_review');
  f.reviews[0].dimensions[0].score = 5;
  assert.equal((await f.check()).decision, 'cannot_assess');
});
test('single direction card can be recorded before choosing its bundle', async t => {
  const f = await fixture(t, 'reference_review');
  f.input.action = 'record'; f.input.nextStage = 'reference_review';
  delete f.input.referenceSet;
  assert.equal((await f.check()).decision, 'record_only');
});
test('unknown cost can be preserved while recording without authorizing future work', async t => {
  const f = await fixture(t);
  f.input.action = 'record'; f.input.nextStage = 'sketch_review';
  f.authorization.budget = { status: 'unknown' };
  assert.equal((await f.check()).decision, 'record_only');
});
test('budget units cannot silently mix amounts and operation counts', async t => {
  const f = await fixture(t);
  f.input.budgetUnit = 'money';
  assert.equal((await f.check()).decision, 'cannot_assess');
});
test('intake cannot contain a manufactured scoring panel', async t => {
  const f = await fixture(t, 'reference_intake');
  f.input.object.kind = 'intake';
  f.input.action = 'record'; f.input.nextStage = 'reference_intake';
  assert.equal((await f.check()).decision, 'reject');
});

test('material components need not independently carry the whole theme or holiday', async t => {
  const f = await component(t);
  f.input.action = 'record'; f.input.nextStage = 'reference_review';
  for (const key of ['theme', 'node']) f.reviews[8].criticalChecks[key] = { status: 'not_applicable', evidence: 'This use borrows only a surface material, not the whole direction' };
  assert.equal((await f.check()).decision, 'component_use_only');
});
test('repeated reference identities cannot obscure the actual main card', async t => {
  const f = await fixture(t, 'reference_review');
  f.input.referenceSet.cards.push(structuredClone(f.input.referenceSet.cards[0]));
  assert.equal((await f.check()).decision, 'cannot_assess');
});

test('changed main reference cannot reuse eight old votes by updating adjudication alone', async t => {
  const f = await fixture(t, 'reference_review');
  f.input.referenceSet.cards[0].file = await f.pointer('different-main.png', Buffer.concat([png, Buffer.from('different-synthetic-reference')]));
  f.reviews[8].referenceSetSha256 = sha(JSON.stringify(f.input.referenceSet));
  assert.equal((await f.check()).decision, 're_review');
});
test('changing a reference use requires all group votes to be renewed', async t => {
  const f = await fixture(t, 'reference_review');
  f.input.referenceSet.cards[0].use = 'Different group use';
  f.reviews[8].referenceSetSha256 = sha(JSON.stringify(f.input.referenceSet));
  assert.equal((await f.check()).decision, 're_review');
});
