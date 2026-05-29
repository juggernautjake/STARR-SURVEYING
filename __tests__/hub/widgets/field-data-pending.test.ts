import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, iconForType, labelForType } from '@/lib/hub/widgets/field-data-pending';

describe('field-data-pending', () => {
  it('registers in work category', () => {
    expect(getWidget('field-data-pending')?.category).toBe('work');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
  it('icons + labels for each type', () => {
    expect(iconForType('photos')).toBe('📷');
    expect(iconForType('gps')).toBe('📍');
    expect(labelForType('measurements')).toBe('Measurements');
  });
});
