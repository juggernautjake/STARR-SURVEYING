// __tests__/hub/widgets-responsive-210.test.ts
//
// Slice 210 of hub-grid-8x8-square-cells-2026-05-29.md. Locks the
// bucket-aware behavior added to the three widgets visible in the
// canvas screenshot the user shared:
//   - pending-receipts: tiny counter mode + row cap by bucket
//   - monthly-revenue:  compact dollar format + font-size by bucket
//   - team-status:      tiny counter mode + lowered minSize to 1×1
//
// The render-shape tests (which button label appears) live in each
// widget's own test file; this one locks the pure helpers.

import { describe, it, expect } from 'vitest';
import { sizeBucket } from '@/lib/hub/size-bucket';
import { capForBucket as receiptsCap } from '@/lib/hub/widgets/pending-receipts';
import { formatCompact, amountStyleForBucket } from '@/lib/hub/widgets/monthly-revenue';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';

describe('pending-receipts — capForBucket', () => {
  it('returns 0 at tiny (counter mode replaces the list)', () => {
    expect(receiptsCap('tiny')).toBe(0);
  });
  it('grows monotonically across buckets', () => {
    expect(receiptsCap('small')).toBeGreaterThan(receiptsCap('tiny'));
    expect(receiptsCap('medium')).toBeGreaterThan(receiptsCap('small'));
    expect(receiptsCap('large')).toBeGreaterThan(receiptsCap('medium'));
    expect(receiptsCap('xlarge')).toBeGreaterThan(receiptsCap('large'));
  });
  it('fits the bucket — small ≤ 4 rows, xlarge ≤ 30 rows', () => {
    expect(receiptsCap('small')).toBeLessThanOrEqual(4);
    expect(receiptsCap('xlarge')).toBeLessThanOrEqual(30);
  });
});

describe('monthly-revenue — formatCompact', () => {
  it('renders small values verbatim', () => {
    expect(formatCompact(0)).toBe('$0');
    expect(formatCompact(42)).toBe('$42');
    expect(formatCompact(999)).toBe('$999');
  });
  it('abbreviates thousands as K with one decimal', () => {
    expect(formatCompact(1000)).toBe('$1.0K');
    expect(formatCompact(12_500)).toBe('$12.5K');
    expect(formatCompact(999_999)).toBe('$1000.0K');
  });
  it('abbreviates millions as M with one decimal', () => {
    expect(formatCompact(1_000_000)).toBe('$1.0M');
    expect(formatCompact(3_750_000)).toBe('$3.8M');
  });
});

describe('monthly-revenue — amountStyleForBucket', () => {
  it('returns a CSS object with fontSize tuned per bucket', () => {
    const tiny = amountStyleForBucket('tiny');
    const small = amountStyleForBucket('small');
    const xl = amountStyleForBucket('xlarge');
    expect(tiny.fontSize).toBeDefined();
    expect(small.fontSize).toBeDefined();
    expect(xl.fontSize).toBeDefined();
    // Different buckets produce different font sizes — locks the
    // "fixed font for every size" regression the slice fixes.
    expect(tiny.fontSize).not.toBe(small.fontSize);
    expect(small.fontSize).not.toBe(xl.fontSize);
  });
  it('always returns the success color so the metric reads as positive', () => {
    for (const bucket of ['tiny', 'small', 'medium', 'large', 'xlarge'] as const) {
      expect(amountStyleForBucket(bucket).color).toContain('success');
    }
  });
});

describe('team-status — minSize lowered to allow the tiny bucket', () => {
  it('team-status minSize is 1×1 so users can pick a tiny cell', () => {
    const def = getWidget('team-status');
    expect(def?.minSize).toEqual({ w: 1, h: 1 });
  });
  it('a 1×1 team-status lands in the tiny bucket', () => {
    expect(sizeBucket(1, 1)).toBe('tiny');
  });
});

describe('Slice 210 widgets allow the tiny bucket', () => {
  it('pending-receipts minSize lowered to 1×1', () => {
    expect(getWidget('pending-receipts')?.minSize).toEqual({ w: 1, h: 1 });
  });
  it('monthly-revenue minSize lowered to 1×1', () => {
    expect(getWidget('monthly-revenue')?.minSize).toEqual({ w: 1, h: 1 });
  });
});
