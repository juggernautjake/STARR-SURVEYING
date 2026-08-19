// __tests__/jobs/video-split.test.ts — the split plan, which decides how somebody's recording is cut.

import { describe, it, expect } from 'vitest';
import { planSplit, partName, describePlan, SPLIT_TARGET_RATIO } from '@/lib/jobs/video-split';

const MB = 1024 * 1024;
const CAP = 500 * MB;

describe('when a split is needed at all', () => {
  it('leaves a file under the cap alone', () => {
    const p = planSplit({ sizeBytes: 120 * MB, durationSec: 60, capBytes: CAP, name: 'clip.mp4' });
    expect(p.needed).toBe(false);
    expect(p.parts).toEqual([]);
  });

  it('leaves a file exactly at the cap alone — the limit is inclusive', () => {
    expect(planSplit({ sizeBytes: CAP, durationSec: 60, capBytes: CAP, name: 'clip.mp4' }).needed).toBe(false);
  });

  it('splits a file over the cap', () => {
    const p = planSplit({ sizeBytes: 780 * MB, durationSec: 300, capBytes: CAP, name: 'clip.mp4' });
    expect(p.needed).toBe(true);
    expect(p.parts.length).toBe(2);
  });
});

describe('the parts themselves', () => {
  const plan = planSplit({ sizeBytes: 1200 * MB, durationSec: 600, capBytes: CAP, name: 'field-walk.mp4' });

  it('makes enough parts that each one fits UNDER the cap', () => {
    // 1200 MB against a 450 MB target (90% of 500) → 3 parts, not 2. Aiming at the cap exactly
    // would produce parts that overshoot it on the keyframe and get refused.
    expect(plan.parts.length).toBe(3);
    expect(plan.approxPartBytes).toBeLessThan(CAP);
  });

  it('covers the whole recording with no gap between parts', () => {
    for (let i = 1; i < plan.parts.length; i += 1) {
      const prev = plan.parts[i - 1];
      expect(prev.startSec + prev.durationSec).toBeCloseTo(plan.parts[i].startSec, 2);
    }
  });

  it('runs the LAST part to the end, so no final seconds are lost to rounding', () => {
    const last = plan.parts[plan.parts.length - 1];
    expect(last.startSec + last.durationSec).toBeCloseTo(600, 2);
  });

  it('starts at zero', () => {
    expect(plan.parts[0].startSec).toBe(0);
  });

  it('names the parts so they read as one recording and sort together', () => {
    expect(plan.parts.map((p) => p.name)).toEqual([
      'field-walk (part 1 of 3).mp4',
      'field-walk (part 2 of 3).mp4',
      'field-walk (part 3 of 3).mp4',
    ]);
  });

  it('numbers each part with its total', () => {
    expect(plan.parts.every((p) => p.total === 3)).toBe(true);
    expect(plan.parts.map((p) => p.index)).toEqual([1, 2, 3]);
  });
});

describe('what it refuses to guess', () => {
  it('will not plan without a duration — a wrong one produces parts still over the limit', () => {
    const p = planSplit({ sizeBytes: 800 * MB, durationSec: null, capBytes: CAP, name: 'clip.mp4' });
    expect(p.needed).toBe(true);
    expect(p.parts).toEqual([]);
    expect(p.reason).toMatch(/length of this video could not be read/i);
  });

  it('will not plan from a zero or negative duration', () => {
    expect(planSplit({ sizeBytes: 800 * MB, durationSec: 0, capBytes: CAP, name: 'c.mp4' }).parts).toEqual([]);
    expect(planSplit({ sizeBytes: 800 * MB, durationSec: -5, capBytes: CAP, name: 'c.mp4' }).parts).toEqual([]);
  });

  it('refuses to cut a huge but very short clip into useless slivers', () => {
    // 4 GB in 6 seconds — a high-bitrate drone file. Sub-second parts would be worthless.
    const p = planSplit({ sizeBytes: 4096 * MB, durationSec: 6, capBytes: CAP, name: 'drone.mp4' });
    expect(p.parts).toEqual([]);
    expect(p.reason).toMatch(/lower resolution/i);
  });

  it('handles a nonsense size without producing NaN parts', () => {
    const p = planSplit({ sizeBytes: Number.NaN, durationSec: 60, capBytes: CAP, name: 'c.mp4' });
    expect(p.needed).toBe(false);
    expect(p.parts).toEqual([]);
  });
});

describe('naming', () => {
  it('puts the part before the extension so the file still opens', () => {
    expect(partName('walk.mp4', 2, 3)).toBe('walk (part 2 of 3).mp4');
  });
  it('copes with a name that has no extension', () => {
    expect(partName('walk', 1, 2)).toBe('walk (part 1 of 2)');
  });
  it('uses the LAST dot, so a dotted name keeps its real extension', () => {
    expect(partName('2026-08-19.walk.mov', 1, 2)).toBe('2026-08-19.walk (part 1 of 2).mov');
  });
});

describe('what the person is told before it happens', () => {
  it('names the size, the limit, the count and that nothing is re-encoded', () => {
    const plan = planSplit({ sizeBytes: 780 * MB, durationSec: 300, capBytes: CAP, name: 'c.mp4' });
    const msg = describePlan(plan, 780 * MB, CAP);
    expect(msg).toContain('780 MB');
    expect(msg).toContain('500 MB');
    expect(msg).toContain('2 videos');
    expect(msg).toMatch(/quality is unchanged/i);
  });

  it('says nothing when no split is needed', () => {
    const plan = planSplit({ sizeBytes: 10 * MB, durationSec: 30, capBytes: CAP, name: 'c.mp4' });
    expect(describePlan(plan, 10 * MB, CAP)).toBe('');
  });

  it('surfaces the REASON when a split is needed but impossible', () => {
    const plan = planSplit({ sizeBytes: 800 * MB, durationSec: null, capBytes: CAP, name: 'c.mp4' });
    expect(describePlan(plan, 800 * MB, CAP)).toMatch(/could not be read/i);
  });
});

describe('the target ratio', () => {
  it('aims under the cap, because a keyframe cut overshoots', () => {
    expect(SPLIT_TARGET_RATIO).toBeLessThan(1);
    expect(SPLIT_TARGET_RATIO).toBeGreaterThan(0.5);
  });
});

describe('the owner’s actual failing file (2026-08-19)', () => {
  // "Right now I am trying to upload a 375MB video and it is failing." It failed because the app
  // believed in a 500 MB cap that storage never honoured — the real project ceiling is 50 MB,
  // probed by uploading real bytes. With the true cap the same file is split instead of refused.
  const CAP_50 = 50 * MB;

  it('splits a 375 MB, six-minute video into parts that all fit under 50 MB', () => {
    const plan = planSplit({ sizeBytes: 375 * MB, durationSec: 6 * 60, capBytes: CAP_50, name: 'field-walk.mp4' });
    expect(plan.needed).toBe(true);
    expect(plan.parts.length).toBeGreaterThanOrEqual(9);
    // The whole point: each piece must be comfortably under what storage accepts, with room for a
    // keyframe cut to overshoot.
    expect(plan.approxPartBytes).toBeLessThanOrEqual(CAP_50);
    expect(plan.parts[plan.parts.length - 1].startSec + plan.parts[plan.parts.length - 1].durationSec)
      .toBeCloseTo(360, 1);
  });

  it('gives parts long enough to be worth watching', () => {
    const plan = planSplit({ sizeBytes: 375 * MB, durationSec: 6 * 60, capBytes: CAP_50, name: 'f.mp4' });
    for (const p of plan.parts) expect(p.durationSec).toBeGreaterThan(2);
  });

  it('tells the person the real numbers', () => {
    const plan = planSplit({ sizeBytes: 375 * MB, durationSec: 6 * 60, capBytes: CAP_50, name: 'f.mp4' });
    const msg = describePlan(plan, 375 * MB, CAP_50);
    expect(msg).toContain('375 MB');
    expect(msg).toContain('50 MB');
  });
});
