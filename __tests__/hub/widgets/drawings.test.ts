// __tests__/hub/widgets/drawings.test.ts
//
// consolidation Slice 4 (2026-05-30) — locks the unified Drawings
// widget's pure `capForBucket` helper. The two legacy widgets each had
// their own copy of this; the consolidation gives them one source of
// truth.

import { describe, it, expect } from 'vitest';
import { capForBucket } from '@/lib/hub/widgets/drawings';

describe('drawings — capForBucket', () => {
  it('caps rows per bucket per the shared simple-list rubric', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('small')).toBe(4);
    expect(capForBucket('medium')).toBe(6);
    expect(capForBucket('large')).toBe(12);
    expect(capForBucket('xlarge')).toBe(24);
  });
});
