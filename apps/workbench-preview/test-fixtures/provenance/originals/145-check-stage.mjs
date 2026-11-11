import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const stages = ['reference_intake', 'reference_review', 'sketch_review', 'refine_review', 'overall_review', 'delivery'];
const roles = ['visual', 'brand', 'user', 'spread'];
const dimensions = { visual: ['quality', 'composition'], brand: ['compatibility', 'translation'], user: ['understanding', 'feasibility'], spread: ['memory', 'difference'] };
const componentDimensions = ['quality', 'compatibility', 'understanding'];
const isText = value => typeof value === 'string' && value.trim().length > 0;
const list = value => Array.isArray(value) ? value : [];
const result = (decision, ...reasons) => ({ decision, reasons: reasons.flat() });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const isImage = bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  || bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  || ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())
  || (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');

// File verification is separate from the pure decision. A signature is not proof of rendering or identity.
export async function loadEvidence(input, baseDirectory) {
  const evidence = { documents: new Map(), artifacts: new Map(), errors: [] };
  async function load(pointer, label, image = false, json = false) {
    if (!pointer || !isText(pointer.path) || !/^[a-f0-9]{64}$/.test(pointer.sha256 ?? '')) {
      evidence.errors.push(`${label}: missing file path or SHA-256`);
      return;
    }
    try {
      const bytes = await readFile(resolve(baseDirectory, pointer.path));
      if (digest(bytes) !== pointer.sha256) throw new Error('SHA-256 mismatch');
      if (image && !isImage(bytes)) throw new Error('unsupported or unrecognizable image bytes');
      if (json) evidence.documents.set(pointer.sha256, JSON.parse(bytes.toString('utf8')));
      else evidence.artifacts.set(pointer.sha256, { image });
    } catch (error) {
      evidence.errors.push(`${label}: ${error.message}`);
    }
  }
  await load(input?.currentInput, 'current input', false, true);
  await load(input?.authorization, 'authorization', false, true);
  await load(input?.object?.file, 'actual object', input?.stage !== 'reference_intake');
  for (const [index, pointer] of list(input?.reviews).entries()) await load(pointer, `original review ${index + 1}`, false, true);
  if (input?.confirmation) await load(input.confirmation, 'human confirmation', false, true);
  for (const card of list(input?.referenceSet?.cards)) await load(card?.file, `reference ${card?.id}`, true);
  return evidence;
}

export function evaluateStage(input, evidence) {
  if (!input || typeof input !== 'object' || !evidence?.documents || !evidence?.artifacts) return result('cannot_assess', 'Missing work package or verified evidence');
  if (list(evidence.errors).length) return result('cannot_assess', evidence.errors);
  const task = input.task ?? {};
  const object = input.object ?? {};
  const current = evidence.documents.get(input.currentInput?.sha256);
  const authorization = evidence.documents.get(input.authorization?.sha256);
  const stageIndex = stages.indexOf(input.stage);
  if (input.skillVersion !== '1.0.0' || stageIndex < 0 || input.stage === 'delivery'
    || !['record', 'advance', 'revise'].includes(input.action)
    || !isText(task.id) || !isText(task.scopeVersion) || !isText(task.inputVersion)
    || typeof task.requiresNode !== 'boolean' || !list(task.creatorIds).length || task.creatorIds.some(id => !isText(id))
    || !isText(object.id) || !isText(object.version) || !isText(object.task)
    || !evidence.artifacts.has(object.file?.sha256)) return result('cannot_assess', 'Invalid identity, stage, action, task, or actual artifact');
  if (!current || !authorization) return result('cannot_assess', 'Verified current input and authorization are required');
  for (const source of [current, authorization]) {
    if (source.taskId !== task.id || source.scopeVersion !== task.scopeVersion || source.inputVersion !== task.inputVersion) {
      return result('re_review', 'Current input, scope, or authorization version differs; previous approval cannot be inherited');
    }
  }
  if (current.reviewTask !== object.task || current.requiresNode !== task.requiresNode
    || JSON.stringify(current.creatorIds) !== JSON.stringify(task.creatorIds) || authorization.currentInputSha256 !== input.currentInput.sha256) return result('re_review', 'Actual input content or declared review task differs from the frozen authorization');
  const expectedNext = input.action === 'advance' ? stages[stageIndex + 1] : input.stage;
  if (input.nextStage !== expectedNext) return result('reject', 'Stage transition skips or misstates the requested action');
  if (!Array.isArray(authorization.allowedStages) || !authorization.allowedStages.includes(input.stage)
    || !authorization.allowedStages.includes(input.nextStage)) return result('pause', 'Requested stage exceeds the recorded authorization endpoint');
  if (!['automatic', 'assisted'].includes(authorization.mode) || !Array.isArray(authorization.humanNodes)) return result('cannot_assess', 'Mode and human checkpoints are required');
  const used = input.revisionsUsed;
  const limit = authorization.revisionLimit;
  if (!Number.isInteger(used) || used < 0 || !Number.isInteger(limit) || limit < 0 || limit > 3) return result('cannot_assess', 'Revision count and limit must be explicit; maximum limit is three');
  if (used > limit || (input.action === 'revise' && used >= limit)) return result('pause', 'Revision budget exhausted; preserve best existing artifact and unresolved issues');
  const budget = authorization.budget;
  if (!budget || !['known', 'unknown'].includes(budget.status)) return result('cannot_assess', 'Budget must be explicitly known or unknown');
  if ((!budget || budget.status !== 'known') && input.action !== 'record') return result('pause', 'Budget unknown; record an explicit bounded budget before further work');
  if (budget?.status === 'known' && (!Number.isFinite(budget.limit) || !Number.isFinite(input.budgetSpent)
    || budget.limit < 0 || input.budgetSpent < 0 || !isText(budget.unit) || input.budgetUnit !== budget.unit)) return result('cannot_assess', 'Known budget needs a bounded limit, spend, and matching unit');
  if (budget?.status === 'known' && (input.budgetSpent > budget.limit || (input.action === 'revise' && input.budgetSpent >= budget.limit))) return result('pause', 'Task budget exhausted');
  const confirmationIssue = () => {
    if (!authorization.humanNodes.includes(input.stage)) return null;
    const confirmation = evidence.documents.get(input.confirmation?.sha256);
    if (!confirmation || confirmation.taskId !== task.id || confirmation.scopeVersion !== task.scopeVersion
      || confirmation.inputVersion !== task.inputVersion || confirmation.currentInputSha256 !== input.currentInput.sha256
      || confirmation.artifactSha256 !== object.file.sha256 || confirmation.objectVersion !== object.version
      || confirmation.stage !== input.stage || confirmation.nextStage !== input.nextStage || confirmation.decision !== 'confirm'
      || !isText(confirmation.humanId) || !isText(confirmation.recordedAt)) return result('awaiting_confirmation', 'An explicit human decision bound to this input, image, and transition is required; timeout is not consent');
    return null;
  };
  if (input.stage === 'reference_intake') {
    if (object.kind !== 'intake' || list(input.reviews).length) return result('reject', 'Intake must be labeled intake and cannot contain fabricated scoring records');
    if (input.action !== 'record') return result('pause', 'Intake can record collected references and gaps only; review needs a separate work package');
    if (confirmationIssue()) return confirmationIssue();
    return result('record_only', 'Intake evidence is bound to the recorded input and authorization; no aesthetic approval');
  }
  if (!['component', 'direction', 'artwork'].includes(object.kind)
    || (object.kind === 'component' && !['material', 'color'].includes(object.componentUse))
    || (input.stage === 'reference_review' ? object.kind === 'artwork' : object.kind !== 'artwork')) return result('cannot_assess', 'Object kind does not match the review stage');
  const original = list(input.reviews).map(pointer => evidence.documents.get(pointer.sha256));
  if (original.some(review => !review)) return result('cannot_assess', 'An original review is unavailable');
  const ids = new Set(task.creatorIds);
  for (const review of original) {
    if (review.taskId !== task.id || review.scopeVersion !== task.scopeVersion || review.inputVersion !== task.inputVersion
      || review.currentInputSha256 !== input.currentInput.sha256 || review.skillVersion !== input.skillVersion || review.stage !== input.stage || review.objectId !== object.id
      || review.objectVersion !== object.version || review.artifactSha256 !== object.file.sha256
      || review.objectSha256 !== digest(JSON.stringify(object))) return result('re_review', 'Review refers to a different task, input, Skill, stage, or image version');
    if (!isText(review.reviewerId) || ids.has(review.reviewerId)) return result('reject', 'Creation, scoring, challenge, and adjudication identities must be separate');
    ids.add(review.reviewerId);
    if (!isText(review.task) || review.task !== object.task || !isText(review.observation)
      || !Array.isArray(review.unknowns) || !Array.isArray(review.hardIssues)) return result('cannot_assess', 'Original review must identify its actual task, observation, unknowns, and hard issues');
    if (review.unknowns.some(issue => !isText(issue?.id) || !isText(issue.missing) || typeof issue.critical !== 'boolean')
      || review.hardIssues.some(issue => !isText(issue?.id) || !isText(issue.rule) || !isText(issue.location) || !isText(issue.observation))) return result('cannot_assess', 'Issue lacks concrete missing evidence or rule, location, and visible observation');
    if (review.kind === 'challenge' && (!Array.isArray(review.findings) || review.findings.some(issue => !isText(issue?.id)
      || !isText(issue.rule) || !isText(issue.location) || !isText(issue.observation) || !isText(issue.impact) || !isText(issue.acceptance)))) return result('cannot_assess', 'Adversarial findings need a rule, image location, effect, and acceptance condition');
    if (review.kind === 'challenge' && Object.hasOwn(review, 'score')) return result('reject', 'Adversarial reviewers do not score');
  }
  for (const kind of ['score', 'challenge']) {
    if (original.filter(review => review.kind === kind).length !== 4
      || roles.some(role => original.filter(review => review.kind === kind && review.role === role).length !== 1)) return result('cannot_assess', `Exactly four original ${kind} records, one per role, are required`);
  }
  const rulings = original.filter(review => review.kind === 'adjudication');
  if (rulings.length !== 1 || original.length !== 9) return result('cannot_assess', 'One independent adjudication and eight original panel records are required');
  const adjudication = rulings[0];
  const hard = original.flatMap(review => review.hardIssues);
  if (hard.length) return result('reject', hard.map(issue => `${issue.id}: ${issue.rule} at ${issue.location}; ${issue.observation}`));
  if (input.stage === 'reference_review' && object.kind === 'direction'
    && (!isText(object.translation) || !isText(object.comparison) || !isText(object.innovationHypothesis))) return result('revise', 'Direction card needs translation, comparison, and a testable innovation hypothesis');
  const contradicted = Object.entries(adjudication.criticalChecks ?? {}).filter(([, check]) => check?.status === 'contradicted' && isText(check.evidence));
  if (contradicted.length) return result('reject', contradicted.map(([key, check]) => `${key}: ${check.evidence}`));
  const unknowns = original.flatMap(review => review.unknowns).filter(issue => issue.critical);
  if (unknowns.length) return result('cannot_assess', unknowns.map(issue => `${issue.id}: ${issue.missing}`));
  const criticalKeys = ['theme', 'brand', 'node', 'comprehension'];
  if (criticalKeys.some(key => {
    const check = adjudication.criticalChecks?.[key];
    const outsideUse = (key === 'node' && !task.requiresNode)
      || (input.stage === 'reference_review' && object.kind === 'component' && ['theme', 'node'].includes(key));
    return !check || !isText(check.evidence) || (outsideUse
      ? !['supported', 'not_applicable'].includes(check.status) : check.status !== 'supported');
  })) return result('cannot_assess', 'Independent critical checks need current image evidence, with N/A limited to the declared component use or a task without a node');
  if (!Array.isArray(adjudication.resolutions) || list(adjudication.resolutions).some(item => !isText(item?.issueId)
    || !['accept', 'reject'].includes(item.ruling) || !isText(item.evidence) || !isText(item.acceptance))) return result('cannot_assess', 'Adjudication needs preserved issue resolutions and acceptance evidence');
  const findings = original.filter(review => review.kind === 'challenge').flatMap(review => review.findings);
  if (findings.some(finding => adjudication.resolutions.filter(item => item.issueId === finding.id).length !== 1)) return result('cannot_assess', 'Every adversarial finding requires one preserved independent resolution');
  if (input.stage === 'reference_review') {
    for (const review of original.filter(item => item.kind === 'score')) {
      if (!Array.isArray(review.dimensions) || review.dimensions.length !== 2) return result('cannot_assess', 'Each reference role needs its two fixed dimensions');
      for (const name of dimensions[review.role]) {
        const matching = review.dimensions.filter(dimension => dimension?.name === name);
        if (matching.length !== 1) return result('cannot_assess', `Missing or repeated reference dimension ${review.role}.${name}`);
        const dimension = matching[0];
        const applicable = object.kind === 'direction' || componentDimensions.includes(name);
        if (!isText(dimension.evidence)) return result('cannot_assess', `Reference dimension ${name} has no image or purpose-card evidence`);
        if (!applicable) {
          if (dimension.status !== 'not_applicable' || dimension.score !== null) return result('cannot_assess', `${name} is outside this component use; retain a reason rather than invent a score`);
        } else if (dimension.status === 'unknown') return result('cannot_assess', `Required reference dimension ${name} is unknown`);
        else if (dimension.status !== 'rated' || !Number.isInteger(dimension.score) || dimension.score < 1 || dimension.score > 5) return result('cannot_assess', `Invalid required reference score ${name}`);
        else if (dimension.score === 5 && !isText(dimension.comparisonEvidence)) return result('cannot_assess', 'A reference five needs specified same-class comparison evidence');
        else if (dimension.score < 4) return result('revise', `Reference ${review.role}.${name} is below four; reference scores are never averaged`);
      }
      if (object.kind === 'component' && review.role === 'spread'
        && (review.boundary !== 'boundary_clear' || !isText(review.boundaryEvidence))) return result('cannot_assess', 'Component spread review must preserve the no-copy and no-effect-claim boundary');
    }
    if (object.kind === 'component') {
      if (input.action === 'advance') return result('reject', 'A component approval cannot approve a direction or advance the reference bundle');
      if (confirmationIssue()) return confirmationIssue();
      return result('component_use_only', 'Only the declared component use is eligible; whole-direction review remains required');
    }
    if (input.action === 'advance') {
      const cards = list(input.referenceSet?.cards);
      const main = cards.find(card => card?.id === input.referenceSet?.mainId);
      if (!main || main.kind !== 'direction' || new Set(cards.map(card => card?.id)).size !== cards.length || !cards.every(card => isText(card?.id) && ['component', 'direction'].includes(card.kind)
        && evidence.artifacts.has(card.file?.sha256) && isText(card.use) && isText(card.prohibited))) return result('cannot_assess', 'Frozen reference set needs an actual direction main and viewable, bounded source cards; all-component bundles cannot advance');
      if (adjudication.referenceSetSha256 !== digest(JSON.stringify(input.referenceSet))) return result('re_review', 'Frozen reference set differs from the independently reviewed set');
      if (original.some(review => review.referenceSetSha256 !== adjudication.referenceSetSha256)) return result('re_review', 'Every original group review must bind the same frozen reference set; changing a main, source, or use requires new panel records');
      if (!isText(adjudication.bundleCoverage) || !isText(adjudication.styleCompatibility)) return result('cannot_assess', 'Whole-bundle requirement coverage and style compatibility need independent evidence');
    }
  } else {
    const votes = original.filter(review => review.kind === 'score');
    if (votes.some(review => !Number.isInteger(review.score) || review.score < 1 || review.score > 5)) return result('cannot_assess', 'Each original overall score must be an integer from one to five');
    if (votes.reduce((sum, vote) => sum + vote.score, 0) / 4 < 4) return result('revise', 'Unrounded overall mean of the four designated roles is below four');
  }
  if (input.action === 'revise') return result('revise', 'Revision remains within the recorded budget; create a new image version and obtain new independent records');
  if (confirmationIssue()) return confirmationIssue();
  if (input.action === 'record') return result('record_only', 'Current evidence can be recorded; no subsequent production stage is authorized by this result');
  return result('eligible_for_requested_transition', 'Current evidence satisfies the structural gate within authorization; this does not establish aesthetic validity');
}

export async function checkPackage(packagePath) {
  try {
    const input = JSON.parse(await readFile(packagePath, 'utf8'));
    return evaluateStage(input, await loadEvidence(input, dirname(resolve(packagePath))));
  } catch (error) {
    return result('cannot_assess', `Work package unreadable: ${error.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv.length === 3 ? await checkPackage(process.argv[2]) : result('cannot_assess', 'Usage: node check-stage.mjs <work-package.json>');
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = ['eligible_for_requested_transition', 'component_use_only', 'record_only'].includes(output.decision) ? 0 : 1;
}
