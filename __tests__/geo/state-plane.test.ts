// __tests__/geo/state-plane.test.ts — proving the projection is right, not merely consistent.
//
// ── WHY A ROUND-TRIP TEST IS NOT ENOUGH ─────────────────────────────────────────────────────────
//
// The obvious test — project a point out and back, assert you got the same numbers — passes
// happily against a projection with a completely wrong false origin. Every error cancels itself.
// It would confirm a module that puts every parcel two hundred miles from where it belongs.
//
// So the load-bearing test here projects the same coordinate through the METRIC EPSG definition of
// each zone (32139 and its siblings, whose false origins are round numbers nobody mistypes) and
// requires the foot-based definition to agree after converting units. The two definitions share no
// false-origin digits, so agreement is real evidence rather than a tautology.
//
// This matters more than usual because of what `lib/cad/geo/texas-state-plane.ts` records: EPSG:2277
// was once described as two different zones in two different modules, and a wrong zone "puts the
// parcel some thousands of feet from where it belongs, with no error message anywhere, because
// every number involved is individually plausible."

import { describe, it, expect } from 'vitest';
import proj4 from 'proj4';
import {
  gridToLatLng,
  latLngToGrid,
  looksLikeTexas,
  plausibleZones,
  ZONE_PROJ4_METRIC,
  US_SURVEY_FOOT_IN_METRES,
  WGS84,
  TEXAS_STATE_PLANE_ZONES,
  type TexasStatePlaneZone,
} from '@/lib/geo/state-plane';

/** A point comfortably inside each zone, for projecting back and forth. */
const IN_ZONE: Record<TexasStatePlaneZone['key'], { lat: number; lng: number; where: string }> = {
  NORTH:         { lat: 35.2220, lng: -101.8313, where: 'Amarillo' },
  NORTH_CENTRAL: { lat: 32.7555, lng:  -97.3308, where: 'Fort Worth' },
  CENTRAL:       { lat: 31.0982, lng:  -97.3428, where: 'Temple — Bell County, where this firm works' },
  SOUTH_CENTRAL: { lat: 29.4241, lng:  -98.4936, where: 'San Antonio' },
  SOUTH:         { lat: 26.2034, lng:  -98.2300, where: 'McAllen' },
};

describe('the projection parameters are correct, cross-checked against the metric EPSG', () => {
  // THE test. If a false origin is wrong in the foot definition, the two disagree by exactly that
  // error and this fails. Nothing else in this file can catch that.
  for (const zone of TEXAS_STATE_PLANE_ZONES) {
    it(`${zone.name} (EPSG:${zone.epsg}) agrees with its metric twin`, () => {
      const at = IN_ZONE[zone.key];
      const feet = latLngToGrid(at, zone.key);
      expect(feet, `${zone.key} failed to project`).not.toBeNull();

      const [mE, mN] = proj4(WGS84, ZONE_PROJ4_METRIC[zone.key], [at.lng, at.lat]) as [number, number];
      const expectedE = mE / US_SURVEY_FOOT_IN_METRES;
      const expectedN = mN / US_SURVEY_FOOT_IN_METRES;

      // A hundredth of a foot. Far tighter than any survey tolerance, and far looser than the
      // floating-point noise of two independent projections of the same maths.
      expect(feet!.easting).toBeCloseTo(expectedE, 2);
      expect(feet!.northing).toBeCloseTo(expectedN, 2);
    });
  }
});

describe('a point goes out and comes back', () => {
  for (const zone of TEXAS_STATE_PLANE_ZONES) {
    it(`${zone.name} — ${IN_ZONE[zone.key].where}`, () => {
      const at = IN_ZONE[zone.key];
      const grid = latLngToGrid(at, zone.key)!;
      const back = gridToLatLng(grid, zone.key)!;
      // Seven decimal places of latitude is about a centimetre.
      expect(back.lat).toBeCloseTo(at.lat, 7);
      expect(back.lng).toBeCloseTo(at.lng, 7);
    });
  }
});

describe('the zone is load-bearing, which is the whole reason it is required', () => {
  it('the same northing and easting land in a DIFFERENT PLACE in each zone', () => {
    // If this ever failed — if two zones gave the same answer — then asking for the zone would be
    // ceremony, and somebody would eventually remove the question.
    const grid = { northing: 10_250_000, easting: 3_100_000 };
    const seen = TEXAS_STATE_PLANE_ZONES
      .map((z) => gridToLatLng(grid, z.key))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    expect(seen.length).toBe(TEXAS_STATE_PLANE_ZONES.length);
    for (let i = 0; i < seen.length; i += 1) {
      for (let j = i + 1; j < seen.length; j += 1) {
        const apart = Math.hypot(seen[i]!.lat - seen[j]!.lat, seen[i]!.lng - seen[j]!.lng);
        // A tenth of a degree is roughly six miles. Any two zones must differ by far more.
        expect(apart, `zones ${i} and ${j} agree too closely`).toBeGreaterThan(0.1);
      }
    }
  });

  it('a Bell County point read as Texas NORTH lands nowhere near Bell County', () => {
    // The concrete version of the bug the zone module describes: right numbers, wrong zone, no
    // error anywhere. Temple is in Central.
    const temple = IN_ZONE.CENTRAL;
    const grid = latLngToGrid(temple, 'CENTRAL')!;
    const misread = gridToLatLng(grid, 'NORTH')!;

    const milesOff = Math.hypot(
      (misread.lat - temple.lat) * 69,
      (misread.lng - temple.lng) * 59.5,
    );
    expect(milesOff).toBeGreaterThan(100);
  });
});

describe('bad input produces null, never NaN', () => {
  // A NaN latitude stored in job_map_points.lat draws a pin off the coast of Africa and is a
  // nuisance to find afterwards.
  it.each([
    ['both missing', { northing: NaN, easting: NaN }],
    ['northing only', { northing: NaN, easting: 3_100_000 }],
    ['infinite', { northing: Infinity, easting: 3_100_000 }],
    ['strings', { northing: '10250000' as unknown as number, easting: 3_100_000 }],
    ['null point', null as unknown as { northing: number; easting: number }],
  ])('%s → null', (_label, grid) => {
    expect(gridToLatLng(grid, 'CENTRAL')).toBeNull();
  });

  it('an unknown zone key is null rather than a silent default', () => {
    // If this fell back to Central, a typo in a stored zone key would quietly project a whole file
    // into the wrong zone — exactly the failure this module exists to prevent.
    expect(gridToLatLng({ northing: 10_250_000, easting: 3_100_000 }, 'MIDDLE' as never)).toBeNull();
  });

  it('latLngToGrid refuses bad input too', () => {
    expect(latLngToGrid({ lat: NaN, lng: -97 }, 'CENTRAL')).toBeNull();
    expect(latLngToGrid(null as unknown as { lat: number; lng: number }, 'CENTRAL')).toBeNull();
  });
});

describe('looksLikeTexas catches the mistakes that do not throw', () => {
  it('accepts a real point in each zone', () => {
    for (const zone of TEXAS_STATE_PLANE_ZONES) {
      expect(looksLikeTexas(IN_ZONE[zone.key]), zone.key).toBe(true);
    }
  });

  it('rejects northing and easting swapped', () => {
    // The classic CSV column-order mistake. It does not throw; it just lands somewhere impossible.
    const temple = IN_ZONE.CENTRAL;
    const grid = latLngToGrid(temple, 'CENTRAL')!;
    const swapped = gridToLatLng({ northing: grid.easting, easting: grid.northing }, 'CENTRAL');
    expect(looksLikeTexas(swapped)).toBe(false);
  });

  it('rejects a file that was actually in metres', () => {
    // Feet read as metres, or the reverse — roughly a factor of 3.28 out.
    const grid = latLngToGrid(IN_ZONE.CENTRAL, 'CENTRAL')!;
    const asMetres = gridToLatLng(
      { northing: grid.northing * US_SURVEY_FOOT_IN_METRES, easting: grid.easting * US_SURVEY_FOOT_IN_METRES },
      'CENTRAL',
    );
    expect(looksLikeTexas(asMetres)).toBe(false);
  });

  it('rejects null and nonsense', () => {
    expect(looksLikeTexas(null)).toBe(false);
    expect(looksLikeTexas(undefined)).toBe(false);
    expect(looksLikeTexas({ lat: NaN, lng: NaN })).toBe(false);
    expect(looksLikeTexas({ lat: 51.5, lng: -0.12 })).toBe(false); // London
  });
});

describe('plausibleZones is a hint, and says so by returning every candidate', () => {
  it('finds the right zone for a Central point', () => {
    const grid = latLngToGrid(IN_ZONE.CENTRAL, 'CENTRAL')!;
    const guesses = plausibleZones(grid);
    expect(guesses.map((g) => g.zone.key)).toContain('CENTRAL');
  });

  it('returns nothing at all for coordinates that are not Texas in any zone', () => {
    // Which is the useful signal: not "I could not decide" but "none of these work, look again".
    expect(plausibleZones({ northing: 99_000_000, easting: 99_000_000 })).toEqual([]);
  });

  it('a DEGENERATE input can still squeak through one zone — so this is not validation', () => {
    // Found by this test suite, and kept because it is a real limit rather than a curiosity.
    //
    // Northing 1, easting 1 is obviously not a survey coordinate. Projected in Texas North it comes
    // out at roughly 25.02°N, 103.45°W — which is in Coahuila, Mexico, and which TEXAS_BOUNDS
    // accepts because the box is a rectangle and a rectangle around Texas necessarily contains a
    // corner of Mexico.
    //
    // The lesson for callers: `plausibleZones` returning a result means "this zone puts the point
    // inside the box", NOT "this file is fine". The import path must still show somebody the
    // projected position before it writes 247 rows.
    const guesses = plausibleZones({ northing: 1, easting: 1 });
    expect(guesses.length).toBeLessThanOrEqual(1);
    if (guesses.length) expect(guesses[0]!.zone.key).toBe('NORTH');
  });

  it('never returns a zone whose projection falls outside the box', () => {
    const grid = latLngToGrid(IN_ZONE.SOUTH, 'SOUTH')!;
    for (const guess of plausibleZones(grid)) {
      expect(looksLikeTexas(guess.at), `${guess.zone.key} was offered but is not in Texas`).toBe(true);
    }
  });
});

describe('the unit constant is the US survey foot, not the international foot', () => {
  it('is 1200/3937', () => {
    // 0.3048 exactly is the INTERNATIONAL foot. The two differ by ~2ppm, which is about 1.6 ft
    // across the width of a Texas zone — small enough to look like noise and big enough to fail a
    // boundary check.
    expect(US_SURVEY_FOOT_IN_METRES).toBeCloseTo(0.30480060960121924, 15);
    expect(US_SURVEY_FOOT_IN_METRES).not.toBe(0.3048);
  });
});
