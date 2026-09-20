// When each piece of a lesson arrives on screen.
//
// Owner, 2026-09-20: "I want really smooth animations/transitions for failures/successes and for
// problems and slides that introduce new elements and effects at different times when triggered."
//
// Staggering works by telling the eye what order to read in. It stops working the moment the delays
// are long enough to read as a wait instead of as one movement — so nearly all of this is about the
// cap.
import { describe, it, expect } from 'vitest';
import {
  stagger, revealStyle, OUTCOME_MOTION, REVEAL_BUDGET_MS, REVEAL_STEP_MS,
} from '@/lib/learn/reveal';

describe('the sequence', () => {
  it('starts the first item immediately', () => {
    expect(stagger(0)).toBe(0);
    expect(stagger(0, { total: 12 })).toBe(0);
  });

  it('spaces a short list at the comfortable step', () => {
    expect(stagger(1, { total: 4 })).toBe(REVEAL_STEP_MS);
    expect(stagger(3, { total: 4 })).toBe(REVEAL_STEP_MS * 3);
  });

  it('lands the whole thing inside the budget', () => {
    for (const total of [2, 4, 8, 20, 60]) {
      const last = stagger(total - 1, { total });
      expect(last, `${total} items took ${last}ms`).toBeLessThanOrEqual(REVEAL_BUDGET_MS);
    }
  });

  it('compresses rather than letting a long list drift', () => {
    // The whole design. A naive index * step makes twenty items take 1.4 seconds, and that only
    // shows up on the longest list — usually the one nobody tested.
    const naive = REVEAL_STEP_MS * 19;
    expect(stagger(19, { total: 20 })).toBeLessThan(naive / 3);
  });

  it('still staggers when it compresses', () => {
    // Compressed to nothing would be the same as no stagger at all, which loses the ordering cue
    // that is the entire reason for doing this.
    const a = stagger(1, { total: 30 });
    const b = stagger(2, { total: 30 });
    expect(b).toBeGreaterThan(a);
  });

  it('keeps items in order at every size', () => {
    for (const total of [3, 9, 25]) {
      const delays = Array.from({ length: total }, (_, i) => stagger(i, { total }));
      const sorted = [...delays].sort((x, y) => x - y);
      expect(delays).toEqual(sorted);
    }
  });

  it('offsets a group that follows something else', () => {
    expect(stagger(0, { base: 200 })).toBe(200);
    expect(stagger(2, { total: 3, base: 200 })).toBeGreaterThan(200);
  });

  it('does not compress when the count is unknown', () => {
    // Correct for a handful of fixed elements — a heading, a body, a footer — where the count
    // cannot run away.
    expect(stagger(2)).toBe(REVEAL_STEP_MS * 2);
  });

  it('hands back a style a component can use directly', () => {
    expect(revealStyle(1, { total: 4 })).toEqual({ animationDelay: `${REVEAL_STEP_MS}ms` });
  });

  it('never returns a negative delay', () => {
    expect(stagger(-3, { total: 5 })).toBe(0);
    expect(stagger(2, { total: 4, base: -100 })).toBeGreaterThanOrEqual(0);
  });
});

describe('marking an answer', () => {
  it('treats right and wrong differently, because they are', () => {
    // A correct answer is an acknowledgement of something you already know. A wrong one has to
    // catch the eye, because the useful part is the explanation that just appeared underneath.
    expect(OUTCOME_MOTION.right.className).not.toBe(OUTCOME_MOTION.wrong.className);
  });

  it('keeps both short enough not to be sat through', () => {
    // An animation that outlasts the information it carries becomes something people learn to
    // ignore.
    for (const key of ['right', 'wrong', 'carried'] as const) {
      expect(OUTCOME_MOTION[key].durationMs, key).toBeLessThanOrEqual(320);
    }
  });

  it('neither celebrates nor scolds a carried step', () => {
    // It earned its mark, so celebrating overstates the outcome; nudging it would say the method
    // was wrong when it was right.
    expect(OUTCOME_MOTION.carried.className).not.toBe(OUTCOME_MOTION.right.className);
    expect(OUTCOME_MOTION.carried.className).not.toBe(OUTCOME_MOTION.wrong.className);
  });

  it('says out loud what the motion shows', () => {
    // Motion is not information unless it is also announced.
    for (const key of ['right', 'wrong', 'carried'] as const) {
      expect(OUTCOME_MOTION[key].announce.length, key).toBeGreaterThan(4);
    }
    expect(OUTCOME_MOTION.wrong.announce).toContain('explanation');
  });

  it('has a way of saying nothing happened', () => {
    expect(OUTCOME_MOTION.neutral.className).toBe('');
    expect(OUTCOME_MOTION.neutral.durationMs).toBe(0);
  });
});
