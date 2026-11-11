import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildImageObservationRequest} from './image-evidence.mjs';
import {buildImageObservationReviewRequest, validateImageObservationReviewOutput, buildAcceptedImageFeatureCatalogue} from './image-observation-review.mjs';

function fixture() {
  const images = [{imageId: 'img_one', sha256: 'a'.repeat(64), mediaType: 'image/png', byteLength: 80, path: '/private/ignored', provenance: {description: 'AUTHOR_CONTEXT_DO_NOT_SEND'}}];
  const {manifestHash} = buildImageObservationRequest({images});
  const rawReport = {manifestHash, observations: [{imageId: 'img_one', imageSha256: images[0].sha256,
    visibleFeatures: [{id: 'f1', description: 'Red square', region: 'center'}, {id: 'f2', description: 'Transparent glass', region: 'left'}],
    legibleText: [{id: 't1', transcription: 'ABC', region: 'bottom'}], uncertainties: [], limitations: ['Cannot prove authenticity or preferences.']}]};
  const {observationHash} = buildImageObservationReviewRequest({images, rawReport});
  const rawReview = {manifestHash, observationHash, findings: [{id: 'f1', status: 'supported', reason: 'Red quadrilateral in center'}, {id: 'f2', status: 'unsupported', reason: 'No transparent object visible'}, {id: 't1', status: 'uncertain', reason: 'Blurred text'}]};
  return {images, rawReport, rawReview};
}

test('neutral review request binds exact observer report and only ordered image manifest', () => {
  const input = fixture();
  const request = buildImageObservationReviewRequest(input);
  assert.equal(request.observationHash, createHash('sha256').update(JSON.stringify(input.rawReport)).digest('hex'));
  assert.ok(request.prompt.includes(JSON.stringify(input.rawReport)));
  assert.ok(!request.prompt.includes('AUTHOR_CONTEXT_DO_NOT_SEND'));
  assert.ok(!request.prompt.includes('/private/ignored'));
  assert.equal(request.outputSchema.properties.findings.minItems, 3);
});

test('accepted catalogue preserves original supported feature with all hashes without mutating input', () => {
  const input = fixture(); const before = structuredClone(input);
  const catalogue = buildAcceptedImageFeatureCatalogue(input);
  assert.deepEqual(input, before);
  assert.equal(catalogue.features.length, 1);
  assert.deepEqual(catalogue.features[0], {id: 'f1', description: 'Red square', region: 'center', kind: 'visibleFeature', imageId: 'img_one', imageSha256: 'a'.repeat(64), manifestHash: catalogue.manifestHash, observationHash: catalogue.observationHash, reviewHash: catalogue.reviewHash});
  input.rawReview.findings[2].status = 'supported';
  assert.equal(buildAcceptedImageFeatureCatalogue(input).features[1].transcription, 'ABC');
});

for (const [name, change] of Object.entries({
  missing: input => input.rawReview.findings.pop(),
  duplicate: input => { input.rawReview.findings[1].id = 'f1'; },
  unknown: input => { input.rawReview.findings[1].id = 'invented'; },
  status: input => { input.rawReview.findings[1].status = 'accepted'; },
  emptyReason: input => { input.rawReview.findings[1].reason = ' '; },
  rewrite: input => { input.rawReview.findings[1].description = 'new description'; },
  extraRoot: input => { input.rawReview.approved = true; },
  manifest: input => { input.rawReview.manifestHash = 'b'.repeat(64); },
  observation: input => { input.rawReport.observations[0].visibleFeatures[0].description = 'Blue square'; },
  image: input => { input.images[0].sha256 = 'b'.repeat(64); },
})) test(`rejects review with ${name}`, () => {
  const input = fixture(); change(input);
  assert.throws(() => validateImageObservationReviewOutput(input.rawReview, input.images, input.rawReport));
  assert.throws(() => buildAcceptedImageFeatureCatalogue(input));
});

test('coverage permits finding order changes and returns isolated copy', () => {
  const input = fixture(); input.rawReview.findings.reverse();
  const validated = validateImageObservationReviewOutput(input.rawReview, input.images, input.rawReport);
  validated.findings[0].reason = 'changed';
  assert.notEqual(validated.findings[0].reason, input.rawReview.findings[0].reason);
  const initial = buildAcceptedImageFeatureCatalogue(input).reviewHash;
  input.rawReview.findings[0].reason = 'revised reason';
  assert.notEqual(buildAcceptedImageFeatureCatalogue(input).reviewHash, initial);
});

test('empty observation claims require empty findings and yield no accepted features', () => {
  const input = fixture(); input.rawReport.observations[0].visibleFeatures = []; input.rawReport.observations[0].legibleText = [];
  input.rawReview.observationHash = buildImageObservationReviewRequest(input).observationHash;
  input.rawReview.findings = [];
  assert.deepEqual(buildAcceptedImageFeatureCatalogue(input).features, []);
});
