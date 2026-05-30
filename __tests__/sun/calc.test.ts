// __tests__/sun/calc.test.ts
//
// hub-widget-excellence-15 — sun-calculator. Locks the pure sunrise
// equation against an Open-Meteo reference (Austin TX, 2026-05-30, UTC:
// sunrise 11:30, sunset 01:27 next day, daylight ≈13.94h) plus the
// polar-day/night edge cases.

import { describe, it, expect } from 'vitest';
import { computeSunTimes } from '@/lib/sun/calc';

const AUSTIN = { lat: 30.27, lng: -97.74 };
const minutesUtc = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

describe('computeSunTimes — Austin reference', () => {
  const r = computeSunTimes(AUSTIN.lat, AUSTIN.lng, new Date('2026-05-30T12:00:00Z'));

  it('sunrise lands within ~3 min of the Open-Meteo 11:30 UTC reference', () => {
    expect(r.sunrise).not.toBeNull();
    expect(Math.abs(minutesUtc(r.sunrise!) - (11 * 60 + 30))).toBeLessThanOrEqual(3);
  });

  it('sunset lands within ~3 min of the Open-Meteo 01:27(+1) UTC reference', () => {
    expect(r.sunset).not.toBeNull();
    // sunset rolls past midnight UTC → compare on the 01:27 mark.
    expect(Math.abs(minutesUtc(r.sunset!) - (1 * 60 + 27))).toBeLessThanOrEqual(3);
  });

  it('daylight is ~13.94h', () => {
    expect(Math.abs(r.daylightHours - 13.94)).toBeLessThan(0.15);
  });

  it('solar noon sits between sunrise and sunset', () => {
    expect(r.solarNoon.getTime()).toBeGreaterThan(r.sunrise!.getTime());
    expect(r.solarNoon.getTime()).toBeLessThan(r.sunset!.getTime());
  });
});

describe('computeSunTimes — polar edge cases', () => {
  it('polar night near the winter pole: no sunrise/sunset, 0 daylight', () => {
    // Northern high latitude near winter solstice.
    const r = computeSunTimes(80, 0, new Date('2025-12-21T12:00:00Z'));
    expect(r.sunrise).toBeNull();
    expect(r.sunset).toBeNull();
    expect(r.daylightHours).toBe(0);
  });

  it('polar day near the summer pole: no sunrise/sunset, 24h daylight', () => {
    const r = computeSunTimes(80, 0, new Date('2026-06-21T12:00:00Z'));
    expect(r.sunrise).toBeNull();
    expect(r.sunset).toBeNull();
    expect(r.daylightHours).toBe(24);
  });
});

describe('computeSunTimes — civil twilight', () => {
  it('civil dawn precedes sunrise and civil dusk follows sunset', () => {
    const day = new Date('2026-05-30T12:00:00Z');
    const sun = computeSunTimes(AUSTIN.lat, AUSTIN.lng, day);
    const twilight = computeSunTimes(AUSTIN.lat, AUSTIN.lng, day, -6);
    expect(twilight.sunrise!.getTime()).toBeLessThan(sun.sunrise!.getTime());
    expect(twilight.sunset!.getTime()).toBeGreaterThan(sun.sunset!.getTime());
  });
});
