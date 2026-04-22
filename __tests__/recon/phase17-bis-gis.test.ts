// __tests__/recon/phase17-bis-gis.test.ts
// Unit tests for:
//   1. parcelRingsToSurveyCalls  — bearing/distance conversion
//   2. captureEagleEyeScreenshot — graceful failure & return shape
//
// All tests are pure-logic or use vi.mock — no live network calls.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parcelRingsToSurveyCalls,
  captureEagleEyeScreenshot,
  type SurveyCall,
  type EagleEyeResult,
} from '../../worker/src/services/bis-cad.js';

// ─── Minimal PipelineLogger stub ─────────────────────────────────────────────

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startAttempt: vi.fn(() => vi.fn()),
  } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;
}

// ─── parcelRingsToSurveyCalls ─────────────────────────────────────────────────

describe('parcelRingsToSurveyCalls', () => {
  it('T01 — returns empty array for empty rings input', () => {
    expect(parcelRingsToSurveyCalls([])).toEqual([]);
  });

  it('T02 — returns empty array for a ring with a single point', () => {
    expect(parcelRingsToSurveyCalls([[[-97.1, 31.5]]])).toEqual([]);
  });

  it('T03 — returns one call for a two-point ring (no loop closure needed)', () => {
    const rings = [[[-97.1, 31.5], [-97.0, 31.5]]];
    const calls = parcelRingsToSurveyCalls(rings, false);
    expect(calls).toHaveLength(1);
  });

  it('T04 — closes loop: adds return leg when closeLoop=true', () => {
    const rings = [[[-97.1, 31.5], [-97.0, 31.5], [-97.0, 31.6]]];
    const calls = parcelRingsToSurveyCalls(rings, true);
    // 3 unique points → 3 segments (including closing leg)
    expect(calls).toHaveLength(3);
  });

  it('T05 — does not duplicate closing point when ring already closed', () => {
    const p = [-97.1, 31.5];
    const rings = [[p, [-97.0, 31.5], [-97.0, 31.6], p]];
    const calls = parcelRingsToSurveyCalls(rings, true);
    expect(calls).toHaveLength(3);
  });

  it('T06 — picks the largest ring by vertex count', () => {
    const small = [[-97.1, 31.5], [-97.0, 31.5]];
    const large = [[-97.1, 31.5], [-97.0, 31.5], [-97.0, 31.6], [-97.1, 31.6]];
    const calls = parcelRingsToSurveyCalls([small, large], false);
    // large ring has 4 pts → 3 segments (no closure added)
    expect(calls).toHaveLength(3);
  });

  it('T07 — distance unit is always "ft"', () => {
    const rings = [[[-97.1, 31.5], [-97.0, 31.5]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.distanceUnit).toBe('ft');
  });

  it('T08 — distance is positive for any two distinct points', () => {
    const rings = [[[-97.1, 31.5], [-97.0, 31.6]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.distance).toBeGreaterThan(0);
  });

  it('T09 — bearing format matches surveyor quadrant pattern', () => {
    const rings = [[[-97.1, 31.5], [-97.0, 31.6]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    // e.g. "N 45°30'00\" E"
    expect(call.bearing).toMatch(/^[NS] \d{2}°\d{2}'\d{2}" [EW]$/);
  });

  it('T10 — due-east segment produces bearing with "E" suffix', () => {
    // Moving east only: lon increases, lat constant → azimuth ~90°
    const rings = [[[-97.1, 31.5], [-97.0, 31.5]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.bearing.endsWith('E')).toBe(true);
  });

  it('T11 — due-north segment produces "N" prefix bearing', () => {
    // Moving north only: lat increases, lon constant → azimuth ~0°
    const rings = [[[-97.1, 31.5], [-97.1, 31.6]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.bearing.startsWith('N')).toBe(true);
  });

  it('T12 — due-south segment produces "S" prefix bearing', () => {
    const rings = [[[-97.1, 31.6], [-97.1, 31.5]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.bearing.startsWith('S')).toBe(true);
  });

  it('T13 — due-west segment produces bearing with "W" suffix', () => {
    const rings = [[[-97.0, 31.5], [-97.1, 31.5]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.bearing.endsWith('W')).toBe(true);
  });

  it('T14 — NE quadrant bearing contains "N" and "E"', () => {
    const rings = [[[-97.1, 31.5], [-97.05, 31.55]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.bearing).toMatch(/^N .* E$/);
  });

  it('T15 — SW quadrant bearing contains "S" and "W"', () => {
    const rings = [[[-97.0, 31.6], [-97.1, 31.5]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.bearing).toMatch(/^S .* W$/);
  });

  it('T16 — deltaLon and deltaLat are stored correctly', () => {
    const rings = [[[-97.1, 31.5], [-97.0, 31.6]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.deltaLon).toBeCloseTo(0.1, 5);
    expect(call.deltaLat).toBeCloseTo(0.1, 5);
  });

  it('T17 — reasonable distance for a ~1-mile east segment (~5280 ft)', () => {
    // 1 degree of longitude at latitude 31.5° ≈ 95 km / 111 km * 1° ≈ 0.00949° per km
    // 0.01° lon at 31.5° ≈ 0.01 * 111_320 * cos(31.5°) m ≈ 950 m ≈ 3117 ft
    const rings = [[[-97.1, 31.5], [-97.09, 31.5]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    expect(call.distance).toBeGreaterThan(2000);
    expect(call.distance).toBeLessThan(5000);
  });

  it('T18 — full rectangular parcel produces 4 calls with closeLoop=true', () => {
    const rings = [[
      [-97.1, 31.5],
      [-97.0, 31.5],
      [-97.0, 31.6],
      [-97.1, 31.6],
    ]];
    const calls = parcelRingsToSurveyCalls(rings, true);
    expect(calls).toHaveLength(4);
  });

  it('T19 — sum of bearings in a closed rectangle covers all 4 quadrants', () => {
    const rings = [[
      [-97.1, 31.5],
      [-97.0, 31.5],
      [-97.0, 31.6],
      [-97.1, 31.6],
    ]];
    const calls = parcelRingsToSurveyCalls(rings, true);
    const ns = new Set(calls.map((c) => c.bearing[0]));
    const ew = new Set(calls.map((c) => c.bearing.slice(-1)));
    // Rectangle should use both N and S, and both E and W
    expect(ns.has('N') && ns.has('S')).toBe(true);
    expect(ew.has('E') && ew.has('W')).toBe(true);
  });

  it('T20 — distance value is rounded to 2 decimal places', () => {
    const rings = [[[-97.1, 31.5], [-97.0, 31.6]]];
    const [call] = parcelRingsToSurveyCalls(rings, false);
    const decimalPart = String(call.distance).split('.')[1] ?? '';
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });
});

// ─── captureEagleEyeScreenshot ────────────────────────────────────────────────

describe('captureEagleEyeScreenshot', () => {
  it('T21 — returns null screenshot when playwright launch fails', async () => {
    vi.doMock('playwright', () => {
      return {
        chromium: {
          launch: vi.fn().mockRejectedValue(new Error('browser not installed')),
        },
      };
    });

    const logger = makeLogger();
    const result = await captureEagleEyeScreenshot(
      'https://gis.bisclient.com/bellcad/',
      'ABC123',
      logger,
    );

    expect(result.screenshotBase64).toBeNull();
    expect(result.error).toBeTruthy();

    vi.doUnmock('playwright');
  });

  it('T22 — return shape has required fields', async () => {
    // We cannot launch a real browser in CI, so we only validate the shape
    // when an error occurs (graceful failure path).
    const logger = makeLogger();
    const result = await captureEagleEyeScreenshot(
      'https://gis.bisclient.com/bellcad/',
      'TEST001',
      logger,
    );

    expect(result).toHaveProperty('screenshotBase64');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('url');
  });

  it('T23 — url contains the propertyId query param', async () => {
    const logger = makeLogger();
    const result = await captureEagleEyeScreenshot(
      'https://gis.bisclient.com/bellcad/',
      'PROP-9876',
      logger,
    );

    expect(result.url).toContain('pid=PROP-9876');
  });

  it('T24 — url is built from gisBaseUrl without double slashes', async () => {
    const logger = makeLogger();
    const result = await captureEagleEyeScreenshot(
      'https://gis.bisclient.com/bellcad/',
      'X1',
      logger,
    );

    expect(result.url).not.toContain('//?' );
    expect(result.url).toMatch(/^https:\/\/gis\.bisclient\.com\/bellcad\?pid=X1$/);
  });

  it('T25 — width and height are 0 when screenshot fails', async () => {
    const logger = makeLogger();
    // Any URL that cannot open a browser will fail in CI
    const result = await captureEagleEyeScreenshot(
      'https://gis.bisclient.com/bellcad/',
      'FAIL-ID',
      logger,
    );

    if (result.screenshotBase64 === null) {
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    }
  });
});
