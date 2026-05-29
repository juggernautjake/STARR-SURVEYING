import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket } from '@/lib/hub/widgets/maintenance-due';

describe('maintenance-due', () => {
  it('registers in equipment category', () => {
    expect(getWidget('maintenance-due')?.category).toBe('equipment');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
});
