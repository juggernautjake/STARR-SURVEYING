import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, iconForType, labelForType, formatAge } from '@/lib/hub/widgets/field-data-pending';

describe('field-data-pending', () => {
  it('registers in work category', () => {
    expect(getWidget('field-data-pending')?.category).toBe('work');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
  it('icons + labels for the legacy + real data types (free-form, with fallback)', () => {
    expect(iconForType('photos')).toBe('📷');
    expect(iconForType('gps')).toBe('📍');
    expect(labelForType('measurements')).toBe('Measurements');
    // R1: the real API data_type is 'point'-style + free-form.
    expect(iconForType('point')).toBe('📍');
    expect(labelForType('point')).toBe('Survey points');
    expect(labelForType('custom_kind')).toBe('Custom_kind'); // title-cased fallback
    expect(iconForType('whatever')).toBe('📍'); // survey-point default
  });
  it('formatAge renders a short relative age', () => {
    const NOW = Date.parse('2026-05-30T12:00:00Z');
    expect(formatAge('2026-05-30T11:30:00Z', NOW)).toBe('30m');
    expect(formatAge('2026-05-30T09:00:00Z', NOW)).toBe('3h');
    expect(formatAge('2026-05-28T12:00:00Z', NOW)).toBe('2d');
    expect(formatAge('2026-05-30T11:59:59Z', NOW)).toBe('just now');
  });
});
