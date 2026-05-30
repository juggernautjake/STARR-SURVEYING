// __tests__/hub/widgets/activity.test.ts
//
// consolidation Slice 5 (2026-05-30) — locks the unified Activity
// widget's pure `capForBucket` helper. Both legacy widgets shipped
// their own bucket caps; the consolidation centralizes them.

import { describe, it, expect } from 'vitest';
import { capForBucket } from '@/lib/hub/widgets/activity';

describe('activity — capForBucket', () => {
  it('tiny renders the counter only (cap 0); small/medium/large/xlarge unlock the list', () => {
    expect(capForBucket('tiny')).toBe(0);
    expect(capForBucket('small')).toBe(3);
    expect(capForBucket('medium')).toBe(6);
    expect(capForBucket('large')).toBe(12);
    expect(capForBucket('xlarge')).toBe(24);
  });
});
