// A bearing the drawing could not read used to be drawn due north.
//
// This is the third duplicate-rule defect in three slices, and the pattern is now clear enough to
// state: the reachability check catches modules nothing calls, but nothing catches one RULE with
// several implementations. Both files are wired; they simply disagree.
//
//   closure thresholds   three sets, one calling itself the single source of truth
//   the Texas vara       six constants, two of them labelled "exact" and not
//   bearing parsing      this
//
// `svg-renderer.ts` had its own bearing regex that `return 0`'d on failure. Zero is DUE NORTH, so an
// unreadable call was drawn as a real line heading north at its stated distance — and because a
// traverse is cumulative, that one call rotated every corner after it. The figure looked like a
// boundary. This is the report a surveyor takes to the field.
//
// The regex also required minutes, so `N 45° E` never matched at all.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseBearing } from '../services/survey-geometry.js';

const src = fs.readFileSync(
  path.join(process.cwd(), 'src/reports/svg-renderer.ts'), 'utf8');

describe('the renderer no longer has its own bearing grammar', () => {
  it('delegates to the platform\'s single parser', () => {
    expect(src).toContain("import { parseBearing } from '../services/survey-geometry.js'");
    expect(src).toContain('parseBearing(bearing)?.azimuthDeg ?? null');
  });

  it('has no local bearing regex left', () => {
    // The specific shape that rejected `N 45° E`: a required minutes group.
    expect(src).not.toMatch(/\[NS\]\)\\s\*\(\\d\+\)\[°\]/);
  });

  it('returns null rather than 0, so due north and unreadable stop being the same value', () => {
    expect(src).toContain('function bearingToAzimuth(bearing: string): number | null');
    expect(src).not.toMatch(/if \(!m\) return 0;/);
  });
});

describe('an unreadable call does not move the pen', () => {
  it('skips the corner on the perimeter walk', () => {
    // Advancing by a defaulted azimuth places this corner AND every corner after it.
    expect(src).toContain('if (az === null) {');
    expect(src).toContain('unplaced.push(corners.length)');
  });

  it('skips it on lot lines too', () => {
    expect(src).toContain('if (az === null) continue;');
  });

  it('collects the misses through an out-parameter, not module state', () => {
    expect(src).toContain('unplaced: number[] = []');
    expect(src).toContain('computeCorners(model, 0, 0, unplacedCalls)');
  });
});

describe('the drawing says it is incomplete, on its face', () => {
  it('prints a warning when calls were dropped', () => {
    // Whoever reads this in a truck is not reading a log.
    expect(src).toContain('INCOMPLETE —');
    expect(src).toContain('could not be read and are NOT drawn');
  });

  it('says the outline is not the boundary, rather than only counting', () => {
    expect(src).toContain('This outline is not the full boundary');
  });

  it('prints nothing when every call was placed', () => {
    expect(src).toContain('if (unplacedCalls.length > 0)');
  });
});

describe('the forms the old regex silently turned into due north', () => {
  // These are the inputs that made the defect real rather than theoretical.
  it('reads a degrees-only bearing, which needed minutes before', () => {
    const b = parseBearing('N 45° E');
    expect(b).not.toBeNull();
    expect(b!.azimuthDeg).toBeCloseTo(45, 6);
  });

  it('reads a plain azimuth', () => {
    expect(parseBearing('123.7585')!.azimuthDeg).toBeCloseTo(123.7585, 4);
  });

  it('still refuses genuine nonsense instead of defaulting it', () => {
    expect(parseBearing('illegible')).toBeNull();
    expect(parseBearing('')).toBeNull();
    expect(parseBearing(null)).toBeNull();
  });

  it('refuses a quadrant bearing over 90°, which is not a bearing', () => {
    expect(parseBearing('N 120°00\'00" E')).toBeNull();
  });

  it('keeps due north as a REAL value, distinct from unreadable', () => {
    // The whole point of returning null: 0 has to mean north and only north.
    expect(parseBearing('N 0°00\'00" E')!.azimuthDeg).toBe(0);
  });
});
