import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildAcceptedImageFeatureCatalogue} from './image-observation-review.mjs';

export const VISUAL_EVIDENCE_LIMITS = Object.freeze([
  'Reviewed pixels support visible appearance or legible image text only; semantic support remains a reviewer judgment.',
  'Image observations do not authenticate sources or establish consumer preference, physical properties, production feasibility or research sufficiency.',
]);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reportHash = value => createHash('sha256').update(JSON.stringify(value, null, 2)).digest('hex');
const keys = ['id', 'observationId', 'reviewId', 'imageId', 'imageSha256', 'kind', 'text', 'region', 'manifestHash', 'observationHash', 'reviewHash', 'limits'];
function invalid(message) { throw Object.assign(new Error(message), {code: 'INVALID_VISUAL_CATALOGUE'}); }
export function validateVisualCatalogue(value = [], sourceRecords = []) {
  if (!Array.isArray(value) || value.length > 1000) invalid('Visual catalogue must be a bounded array');
  const seen = new Set(sourceRecords.map(source => source.id));
  for (const entry of value) {
    if (!entry || Object.keys(entry).sort().join() !== [...keys].sort().join()) invalid('Invalid visual catalogue fields');
    for (const key of keys.filter(key => key !== 'limits')) if (typeof entry[key] !== 'string' || !entry[key].trim() || entry[key].length > 4000) invalid('Invalid visual catalogue text');
    if (!entry.id.startsWith('visual:') || seen.has(entry.id)) invalid('Visual evidence IDs must be unique and namespaced');
    seen.add(entry.id);
    if (!['visibleFeature', 'legibleText'].includes(entry.kind) || ['imageSha256', 'manifestHash', 'observationHash', 'reviewHash'].some(key => !/^[a-f0-9]{64}$/.test(entry[key]))) invalid('Invalid visual kind or hash');
    if (!Array.isArray(entry.limits) || !entry.limits.length || entry.limits.some(item => typeof item !== 'string' || !item.trim() || item.length > 4000)) invalid('Visual limits required');
  }
  return structuredClone(value);
}
function registered(project, report, purpose) {
  const job = project.jobs?.find(item => item.id === report.jobId && item.purpose === purpose);
  const attempt = job?.attempts.find(item => item.id === report.attemptId);
  return job?.status === 'succeeded' && attempt?.status === 'succeeded' && job.outputVersionIds?.includes(report.id)
    && report.executionReceipt?.exitCode === 0 && isDeepStrictEqual(attempt.receipt, report.executionReceipt);
}
export function buildVisualCatalogue(project) {
  const entries = [];
  const card = project.taskCards?.find(item => item.id === project.activeTaskCardId);
  if (!card || !project.confirmations?.some(item => item.taskCardId === card.id)) return entries;
  for (const observation of project.imageObservations ?? []) {
    if (!isDeepStrictEqual(observation.taskCard, card) || !registered(project, observation, 'observation')) continue;
    const reviews = (project.observationReviews ?? []).filter(review => review.observationId === observation.id && isDeepStrictEqual(review.taskCard, card) && registered(project, review, 'observation_review'));
    if (!reviews.length) continue;
    if (reportHash(observation.rawReport) !== observation.reportHash) invalid('Changed registered observation report hash');
    const catalogues = reviews.map(review => {
      if (reportHash(review.rawReport) !== review.reportHash || review.observationContentHash !== observation.reportHash || !isDeepStrictEqual(review.images, observation.images) || hash(observation.rawReport) !== review.observationHash) invalid('Changed registered visual observation');
      const catalogue = buildAcceptedImageFeatureCatalogue({images: observation.images, rawReport: observation.rawReport, rawReview: review.rawReport});
      if (!isDeepStrictEqual(catalogue, review.acceptedCatalogue)) invalid('Changed accepted visual catalogue');
      return catalogue;
    });
    for (const feature of catalogues[0].features) {
      if (!catalogues.every(catalogue => catalogue.features.some(item => item.id === feature.id))) continue;
      const details = observation.rawReport.observations.find(item => item.imageId === feature.imageId);
      entries.push({id: `visual:${observation.id}:${feature.id}`, observationId: observation.id, reviewId: reviews[0].id,
        imageId: feature.imageId, imageSha256: feature.imageSha256, kind: feature.kind,
        text: feature.description ?? feature.transcription, region: feature.region,
        manifestHash: feature.manifestHash, observationHash: feature.observationHash, reviewHash: feature.reviewHash,
        limits: [...new Set([...details.limitations, ...details.uncertainties, ...VISUAL_EVIDENCE_LIMITS])]});
    }
  }
  return validateVisualCatalogue(entries);
}
export function visualCitation(entry) {
  return {kind: 'visual', visualId: entry.id, quote: entry.text, ...Object.fromEntries(['observationId', 'reviewId', 'imageId', 'imageSha256', 'manifestHash', 'observationHash', 'reviewHash'].map(key => [key, entry[key]]))};
}
export function validateVisualCitation(citation, catalogue) {
  const entry = catalogue.find(item => item.id === citation.visualId);
  if (!entry || !isDeepStrictEqual(citation, visualCitation(entry))) invalid('Visual citation must match the exact frozen catalogue reference');
  return entry;
}
