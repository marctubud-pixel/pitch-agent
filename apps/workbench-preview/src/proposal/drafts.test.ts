import { beforeEach, describe, expect, it } from 'vitest';
import { clearIfUnchanged, draftKey, pendingDrafts, readDraft, resetDrafts, snapshotDraft, writeDraft } from './drafts';

describe('idea drafts', () => {
  beforeEach(() => resetDrafts());

  it('keeps one draft per project and stage', () => {
    writeDraft(draftKey('p1', 'visual'), { open: true, kind: 'reference', text: 'Frost', borrow: 'scale' });
    expect(readDraft(draftKey('p1', 'strategy')).text).toBe('');
    expect(readDraft(draftKey('p2', 'visual')).text).toBe('');
    expect(readDraft(draftKey('p1', 'visual'))).toEqual({ open: true, kind: 'reference', text: 'Frost', borrow: 'scale' });
  });

  it('lists the stages of one project that hold unsent text', () => {
    writeDraft(draftKey('p1', 'visual'), { open: true, kind: 'comment', text: 'a', borrow: '' });
    writeDraft(draftKey('p1', 'themes'), { open: true, kind: 'comment', text: '', borrow: '' });
    writeDraft(draftKey('p2', 'strategy'), { open: true, kind: 'comment', text: 'b', borrow: '' });
    expect(pendingDrafts('p1')).toEqual(['visual']);
  });

  it('forgets a draft only when it is cleared', () => {
    const k = draftKey('p1', 'visual');
    writeDraft(k, { open: true, kind: 'comment', text: 'keep me', borrow: '' });
    expect(readDraft(k).text).toBe('keep me');
    writeDraft(k, null);
    expect(readDraft(k).text).toBe('');
  });
});

describe('clearing after a successful submission', () => {
  beforeEach(() => resetDrafts());
  const k = draftKey('p1', 'visual');

  it('clears the draft when nothing changed after submitting', () => {
    writeDraft(k, { open: true, kind: 'comment', text: 'A', borrow: '' });
    const sent = snapshotDraft(k);
    expect(clearIfUnchanged(k, sent)).toBe(true);
    expect(readDraft(k).text).toBe('');
  });

  it('keeps newer text typed while the request was in flight', () => {
    writeDraft(k, { open: true, kind: 'comment', text: 'A', borrow: '' });
    const sent = snapshotDraft(k);
    writeDraft(k, { ...readDraft(k), text: 'B' });
    expect(clearIfUnchanged(k, sent)).toBe(false);
    expect(readDraft(k)).toEqual({ open: true, kind: 'comment', text: 'B', borrow: '' });
  });

  it('keeps a changed idea type or borrowing note', () => {
    writeDraft(k, { open: true, kind: 'reference', text: 'A', borrow: 'scale' });
    const sent = snapshotDraft(k);
    writeDraft(k, { ...readDraft(k), kind: 'theme' });
    expect(clearIfUnchanged(k, sent)).toBe(false);
    expect(readDraft(k).kind).toBe('theme');
    writeDraft(k, { open: true, kind: 'reference', text: 'A', borrow: 'scale' });
    const sent2 = snapshotDraft(k);
    writeDraft(k, { ...readDraft(k), borrow: 'scale and light' });
    expect(clearIfUnchanged(k, sent2)).toBe(false);
    expect(readDraft(k).borrow).toBe('scale and light');
  });

  it('only touches its own project and stage', () => {
    const other = draftKey('p1', 'strategy');
    writeDraft(k, { open: true, kind: 'comment', text: 'A', borrow: '' });
    writeDraft(other, { open: true, kind: 'comment', text: 'A', borrow: '' });
    clearIfUnchanged(k, snapshotDraft(k));
    expect(readDraft(other).text).toBe('A');
  });

  it('does not reopen a draft discarded while the request was in flight', () => {
    writeDraft(k, { open: true, kind: 'comment', text: 'A', borrow: '' });
    const sent = snapshotDraft(k);
    writeDraft(k, null);
    expect(clearIfUnchanged(k, sent)).toBe(false);
    expect(readDraft(k).open).toBe(false);
  });
});

describe('actor isolation and binding snapshots', () => {
  beforeEach(() => resetDrafts());

  it('keeps current and historical drafts when identity changes', () => {
    const legacy = draftKey('p1', 'visual');
    const designer = draftKey('p1', 'visual', 'designer');
    const owner = draftKey('p1', 'visual', 'owner');
    writeDraft(legacy, { open: true, kind: 'comment', text: 'Historic unassigned draft', borrow: '' });
    writeDraft(designer, { open: true, kind: 'comment', text: 'Designer draft', borrow: '' });
    expect(readDraft(owner).text).toBe('');
    writeDraft(owner, { open: true, kind: 'comment', text: 'Owner draft', borrow: '' });
    expect(readDraft(designer).text).toBe('Designer draft');
    expect(readDraft(legacy).text).toBe('Historic unassigned draft');
    expect(pendingDrafts('p1', 'owner')).toEqual(['visual']);
  });

  it('does not clear a draft rebound to another artwork during submission', () => {
    const key = draftKey('p1', 'visual', 'designer');
    writeDraft(key, { open: true, kind: 'comment', text: 'Same text', borrow: '', target: { kind: 'visual', stage: 'visual', directionId: 'A', version: 1 } });
    const sent = snapshotDraft(key);
    writeDraft(key, { ...readDraft(key), target: { kind: 'visual', stage: 'visual', directionId: 'B', version: 2 } });
    expect(clearIfUnchanged(key, sent)).toBe(false);
    expect(readDraft(key).target).toMatchObject({ directionId: 'B', version: 2 });
  });
});
