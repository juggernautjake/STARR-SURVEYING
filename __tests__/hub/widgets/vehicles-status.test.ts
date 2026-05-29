import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, vehicleColor } from '@/lib/hub/widgets/vehicles-status';

describe('vehicles-status', () => {
  it('registers in equipment category', () => {
    expect(getWidget('vehicles-status')?.category).toBe('equipment');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
  it('color per status', () => {
    expect(vehicleColor('available')).toBe('var(--theme-success)');
    expect(vehicleColor('in-use')).toBe('var(--theme-accent)');
    expect(vehicleColor('maintenance')).toBe('var(--theme-warning)');
    expect(vehicleColor('offline')).toBe('var(--theme-fg-muted)');
  });
});
