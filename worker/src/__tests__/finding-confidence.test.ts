// How sure are we of THIS number, not of this document.
//
// The owner asked for confidence per finding, rolling up to the document. The important half is the
// roll-up rule: an average hides the one call that is wrong, and the one call that is wrong is the
// whole story, because a traverse with one bad course does not close.

import { describe, it, expect } from 'vitest';
import {
  scoreFinding, scoreDocument, bandFor, type Finding,
} from '../services/finding-confidence.js';

const f = (signals: Finding['signals'], kind: Finding['kind'] = 'bearing'): Finding =>
  ({ kind, raw: 'N 45°30\'00" E', signals });

describe('a clear, recent, legible survey scores high', () => {
  it('rates a legible, agreeing, self-checking value high', () => {
    // The owner's own example: "a survey that is clear and recent and the analysis can clearly read
    // the results" — every bearing and distance should come out high.
    const s = scoreFinding(f({ legibility: 'good', agreeingSources: 3, passedSelfCheck: true }));
    expect(s.band).toBe('high');
  });

  it('does not call an ordinary single reading "high"', () => {
    // Read once, off a legible page, checked by nothing. That is ordinary, not verified — and
    // starting everything at 100 would make the common case look confirmed.
    expect(scoreFinding(f({ legibility: 'good', agreeingSources: 1 })).band).toBe('medium');
  });
});

describe('the signals that should lower a finding', () => {
  it('drops a marginal capture, because OCR guesses rather than failing', () => {
    const s = scoreFinding(f({ legibility: 'marginal', agreeingSources: 1 }));
    expect(s.band).toBe('low');
    expect(s.reasons.join(' ')).toContain('it guesses');
  });

  it('makes an unreadable capture unusable', () => {
    const s = scoreFinding(f({ legibility: 'unreadable' }));
    expect(s.band).toBe('unusable');
    expect(s.reasons.join(' ')).toContain('invention');
  });

  it('penalises a value that fails its own geometry', () => {
    const s = scoreFinding(f({ legibility: 'good', failedSelfCheck: true }));
    expect(s.score).toBeLessThan(scoreFinding(f({ legibility: 'good' })).score);
    expect(s.reasons.join(' ')).toContain('the document disagrees with itself');
  });

  it('marks a value WE computed as weaker than one we read', () => {
    const read = scoreFinding(f({ legibility: 'good' }));
    const derived = scoreFinding(f({ legibility: 'good', derived: true }));
    expect(derived.score).toBeLessThan(read.score);
    expect(derived.reasons.join(' ')).toContain('nothing else flags it');
  });

  it('rates a dittoed value slightly below a read one, and says why', () => {
    // Exactly as reliable as the value it repeats, and no more — which is the link between this
    // module and plat-notation.
    const s = scoreFinding(f({ legibility: 'good', fromDitto: true }));
    expect(s.reasons.join(' ')).toContain('as reliable as the value it repeats');
    expect(s.score).toBeLessThan(scoreFinding(f({ legibility: 'good' })).score);
  });

  it('treats an unattributed number as barely usable even when the digits are perfect', () => {
    // The owner's "not so certain … what they go to". A distance whose OWNER is unknown cannot be
    // placed on a boundary however cleanly it was read.
    const s = scoreFinding(f({ legibility: 'good', agreeingSources: 3, unattributed: true }));
    expect(s.reasons.join(' ')).toContain('may be right and still unusable');
    expect(s.band).not.toBe('high');
  });

  it('penalises a contradiction more than never having checked', () => {
    const unchecked = scoreFinding(f({ legibility: 'good', agreeingSources: 1 }));
    const contradicted = scoreFinding(f({ legibility: 'good', agreeingSources: 2, contradicted: true }));
    expect(contradicted.score).toBeLessThan(unchecked.score);
  });
});

describe('the document score is derived, and derived pessimistically', () => {
  const good = f({ legibility: 'good', agreeingSources: 3, passedSelfCheck: true });

  it('is high when every finding is', () => {
    const d = scoreDocument([good, good, good]);
    expect(d.band).toBe('high');
    expect(d.statement).toContain('Every finding is high-confidence');
  });

  it('one unusable finding holds the whole document down', () => {
    // Twenty good bearings and one unusable one average to "high". The unusable one is the story.
    const d = scoreDocument([...Array(20).fill(good), f({ legibility: 'unreadable' })]);
    expect(d.band).not.toBe('high');
    expect(d.statement).toContain('only as good as its weakest call');
  });

  it('counts each band rather than reporting only a mean', () => {
    const d = scoreDocument([good, f({ legibility: 'marginal' })]);
    expect(d.counts.high).toBe(1);
    expect(d.counts.high + d.counts.medium + d.counts.low + d.counts.unusable).toBe(2);
  });

  it('says nothing was extracted rather than scoring an empty document zero', () => {
    // A zero would read as "we looked and it is bad". Nothing was read at all.
    const d = scoreDocument([]);
    expect(d.statement).toContain('not a finding that the document is empty');
  });

  it('bands are ordered and cover the range', () => {
    expect(bandFor(100)).toBe('high');
    expect(bandFor(70)).toBe('medium');
    expect(bandFor(50)).toBe('low');
    expect(bandFor(0)).toBe('unusable');
  });
});
