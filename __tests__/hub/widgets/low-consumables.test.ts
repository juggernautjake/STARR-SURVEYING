import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket } from '@/lib/hub/widgets/low-consumables';

describe('low-consumables', () => {
  it('registers in equipment category', () => {
    expect(getWidget('low-consumables')?.category).toBe('equipment');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
});
