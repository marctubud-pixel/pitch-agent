import { describe, expect, it } from 'vitest';
import { parseSnapshot } from './dto';
import { mapImageRecords, mapProject } from './mappers';

function fixture() {
  return parseSnapshot({
    project: {
      id: 'p', name: 'Synthetic', revision: 1, activeTaskCardId: 'card',
      taskCards: [{ id: 'card', brief: 'Synthetic task', createdBy: 'operator' }],
      confirmations: [{ taskCardId: 'card', actorId: 'operator' }],
      jobs: [], artifacts: [], audit: [], processedCommands: {},
      imageAssets: [], imageObservations: [], observationReviews: [],
    },
    view: { policy: { mode: 'assisted', humanGates: [], authorizedThrough: 'final_review' }, stages: [], complete: false },
  });
}

function imageFixture() {
  const p = fixture();
  p.imageAssets = [
    { id: 'a', sha256: 'a'.repeat(64), width: 100, height: 100, provenance: {} },
    { id: 'b', sha256: 'b'.repeat(64), width: 100, height: 100, provenance: {} },
  ];
  p.imageObservations = [{
    id: 'obs', reportHash: 'c'.repeat(64), observations: [
      { imageId: 'a', imageSha256: 'a'.repeat(64), visibleFeatures: [{ id: 'fa', description: 'Synthetic A feature', region: 'centre' }], legibleText: [], uncertainties: [], limitations: ['Synthetic pixels only'] },
      { imageId: 'b', imageSha256: 'b'.repeat(64), visibleFeatures: [{ id: 'fb', description: 'Synthetic B feature', region: 'centre' }], legibleText: [], uncertainties: [], limitations: ['Synthetic pixels only'] },
    ],
  }];
  p.observationReviews = [{
    id: 'review', observationId: 'obs', observationContentHash: 'c'.repeat(64),
    images: [{ id: 'a', sha256: 'a'.repeat(64) }, { id: 'b', sha256: 'b'.repeat(64) }],
    findings: [{ id: 'fa', status: 'supported', reason: 'A visible' }, { id: 'fb', status: 'unsupported', reason: 'B not visible' }],
  }];
  return p;
}

describe('project state and per-image review boundaries', () => {
  it('keeps backend completion authoritative despite a retained failure', () => {
    const p = fixture();
    p.complete = true;
    p.jobs = [{ id: 'old-failure', purpose: 'stage', stage: 'research', status: 'blocked', attempts: [] }];
    expect(mapProject(p).status).toBe('ready');
  });

  it('uses the current backend stage rather than an old failed attempt', () => {
    const p = fixture();
    p.jobs = [{ id: 'old-failure', purpose: 'stage', stage: 'research', status: 'failed', attempts: [] }];
    p.stages = [{ stage: 'research', status: 'awaiting_release', activeArtifactId: 'research-current', blockedReasons: [] }];
    expect(mapProject(p).status).toBe('in_progress');
    p.stages[0].blockedReasons = ['RESEARCH_READINESS_REQUIRED'];
    expect(mapProject(p).status).toBe('blocked');
    p.stages[0].blockedReasons = [];
    p.stages[0].status = 'awaiting_reconciliation';
    expect(mapProject(p).status).toBe('blocked');
  });

  it('keeps one image separate from another image unsupported feature', () => {
    const items = mapImageRecords(imageFixture(), '/api');
    expect(items[0].observation?.reviewStatus).toBe('confirmed');
    expect(items[0].observation?.reviewNote).toBe('A visible');
    expect(items[1].observation?.reviewStatus).toBe('needs_revision');
    expect(items[1].observation?.reviewNote).toBe('B not visible');
  });

  it('does not confirm an image with missing feature or text findings', () => {
    const p = imageFixture();
    p.imageObservations = [{
      id: 'obs', reportHash: 'c'.repeat(64), observations: [{
        imageId: 'a', imageSha256: 'a'.repeat(64),
        visibleFeatures: [{ id: 'fa', description: 'Synthetic A feature' }],
        legibleText: [{ id: 'ta', transcription: 'Synthetic text' }],
        uncertainties: [], limitations: [],
      }],
    }];
    const item = mapImageRecords(p, '/api')[0];
    expect(item.observation?.reviewStatus).toBe('needs_revision');
    expect(item.observation?.reviewNote).toContain('复核结果不完整');
    expect(item.observation?.reviewNote).not.toContain('B not visible');
  });

  it('retains exact observation and image hash binding', () => {
    const p = imageFixture();
    p.observationReviews = [{
      id: 'wrong-review', observationId: 'obs', observationContentHash: 'wrong',
      images: [{ id: 'a', sha256: 'a'.repeat(64) }],
      findings: [{ id: 'fa', status: 'supported', reason: 'Wrong observation' }],
    }];
    expect(mapImageRecords(p, '/api')[0].observation?.reviewStatus).toBe('unreviewed');
    p.observationReviews[0].observationContentHash = 'c'.repeat(64);
    p.observationReviews[0].images = [{ id: 'a', sha256: 'wrong' }];
    expect(mapImageRecords(p, '/api')[0].observation?.reviewStatus).toBe('unreviewed');
  });
});
