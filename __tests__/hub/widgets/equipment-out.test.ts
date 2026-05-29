import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket } from '@/lib/hub/widgets/equipment-out';

describe('equipment-out', () => {
  it('registers in equipment category', () => {
    expect(getWidget('equipment-out-today')?.category).toBe('equipment');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
});
