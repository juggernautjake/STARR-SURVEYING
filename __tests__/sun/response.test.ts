// __tests__/sun/response.test.ts
//
// hub-widget-excellence-15 — sun-calculator endpoint shaping: coordinate
// resolution (pinned vs Central-Texas default) + the ISO payload.

import { describe, it, expect } from 'vitest';
import { resolveSunPoint, buildSunResponse, DEFAULT_SUN_LOCATION } from '@/lib/sun/response';

describe('resolveSunPoint', () => {
  it('uses pinned coordinates with a rounded label', () => {
    expect(resolveSunPoint('30.2711', '-97.7437')).toEqual({
      latitude: 30.2711,
      longitude: -97.7437,
      label: '30.2711, -97.7437',
    });
  });

  it('falls back to Central Texas when a coord is missing or invalid', () => {
    expect(resolveSunPoint(null, null)).toEqual(DEFAULT_SUN_LOCATION);
    expect(resolveSunPoint('30.27', '')).toEqual(DEFAULT_SUN_LOCATION);
    expect(resolveSunPoint('not-a-number', '-97.7')).toEqual(DEFAULT_SUN_LOCATION);
  });

  it('rejects out-of-range coordinates', () => {
    expect(resolveSunPoint('120', '-97.7')).toEqual(DEFAULT_SUN_LOCATION); // lat > 90
    expect(resolveSunPoint('30', '-400')).toEqual(DEFAULT_SUN_LOCATION); // lng < -180
  });
});

describe('buildSunResponse', () => {
  it('returns ISO-8601 UTC times + numeric daylight + label', () => {
    const r = buildSunResponse(
      { latitude: 30.27, longitude: -97.74, label: 'Austin' },
      new Date('2026-05-30T12:00:00Z'),
    );
    expect(r.location_label).toBe('Austin');
    expect(r.sunrise).toMatch(/^2026-05-30T\d{2}:\d{2}/);
    expect(r.sunset).toMatch(/^2026-05-3[01]T\d{2}:\d{2}/);
    expect(r.daylight_hours).toBeGreaterThan(13);
    expect(r.daylight_hours).toBeLessThan(15);
  });

  it('returns null times + 24h daylight on a polar day', () => {
    const r = buildSunResponse(
      { latitude: 80, longitude: 0, label: 'North' },
      new Date('2026-06-21T12:00:00Z'),
    );
    expect(r.sunrise).toBeNull();
    expect(r.sunset).toBeNull();
    expect(r.daylight_hours).toBe(24);
  });
});
