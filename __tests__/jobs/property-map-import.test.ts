// __tests__/jobs/property-map-import.test.ts — a point file becoming a layer.
//
// The parsing is tested in point-file.test.ts and the projection in geo/state-plane.test.ts. What
// is left, and what this file asserts, is the part where a wrong answer costs money: the route must
// never choose a coordinate zone on somebody's behalf.
//
// A point file carries no zone. Projected in the wrong one, 247 points come out looking completely
// ordinary and sitting in the wrong county — no error, no warning, every number individually
// plausible. `lib/cad/geo/texas-state-plane.ts` records the same failure happening once already,
// when EPSG:2277 was described as two different zones in two different modules.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parsePointFile, looksLikeDegrees } from '@/lib/jobs/point-file';
import { gridToLatLng, latLngToGrid, looksLikeTexas, plausibleZones } from '@/lib/geo/state-plane';

const source = fs.readFileSync(
  path.join(process.cwd(), 'app/api/admin/jobs/[id]/property-map/import/route.ts'),
  'utf8',
);

/**
 * The route with its comments removed.
 *
 * This codebase writes its reasoning in comments, and that reasoning NAMES the things it decided
 * against — this route's header explains at length why `DEFAULT_TEXAS_ZONE_KEY` must not be used
 * here. A source assertion that reads the comments flags the explanation as the violation, which
 * is a ratchet that cries wolf and then gets deleted. The keyframe ratchet needed this same
 * correction on 2026-09-20 and the map-label one on 2026-09-21.
 */
const route = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

describe('the route refuses to pick a zone', () => {
  it('has no default zone anywhere in it', () => {
    // DEFAULT_TEXAS_ZONE_KEY exists for LABELLING a drawing that did not declare one. Using it to
    // place points would silently put a whole file somewhere, which is the one thing this feature
    // must not do.
    expect(route).not.toContain('DEFAULT_TEXAS_ZONE_KEY');
  });

  it('rejects a grid file with no zone, with a 400 and not a guess', () => {
    expect(route).toMatch(/!plan\.degrees && !plan\.zone/);
    expect(route).toMatch(/needs a coordinate zone/i);
  });

  it('offers candidate zones instead of choosing one', () => {
    expect(route).toContain('plausibleZones');
    expect(route).toContain('hints');
  });
});

describe('preview before commit', () => {
  it('exposes a PUT that plans and a POST that writes', () => {
    expect(route).toMatch(/export const PUT/);
    expect(route).toMatch(/export const POST/);
  });

  it('the PUT never inserts anything', () => {
    // The whole safety of the flow: somebody sees the projected position before the rows exist,
    // which is the only moment a wrong zone is cheap to fix.
    const put = route.slice(route.indexOf('export const PUT'), route.indexOf('export const POST'));
    expect(put).not.toMatch(/\.insert\(/);
    expect(put).not.toMatch(/\.upsert\(/);
    expect(put).not.toMatch(/\.delete\(/);
  });
});

describe('both verbs are gated and scoped to the job', () => {
  it('checks admin', () => {
    expect(route).toContain('isAdmin(session.user.roles)');
  });

  it('checks the map belongs to the job in the URL', () => {
    // Without this, a map_id in a request body reaches any map in the database.
    expect((route.match(/mapOfJob\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('caps the upload', () => {
    expect(route).toContain('MAX_TEXT_BYTES');
    expect(route).toContain('MAX_POINTS');
  });
});

describe('the points it writes', () => {
  it('are the imported-point type, so the legend can hide them in one click', () => {
    expect(route).toContain("point_type: 'csv_point'");
  });

  it('assign ordinals in one pass rather than per row', () => {
    // nextOrdinal reads the table. Calling it per row would be 247 round trips and a
    // unique-violation race with anybody placing a pin at the same time.
    expect(route).toContain('let ordinal = nextOrdinal');
    expect(route).toContain('ordinal: ordinal++');
  });

  it('write lat/lng and leave the legacy image fractions null', () => {
    expect(route).toMatch(/x: null/);
    expect(route).toMatch(/y: null/);
  });
});

// ── THE BEHAVIOUR, END TO END, WITHOUT THE DATABASE ─────────────────────────────────────────────
//
// The route's planning step is parse → project → classify. Each half is tested elsewhere; this
// exercises the join on the shape of file a collector actually exports.

/** A real-looking P,N,E,Z,D file for a small tract in Bell County, Texas Central. */
function bellCountyFile(): string {
  const here = { lat: 31.0982, lng: -97.3428 };
  const corners = [0, 1, 2, 3].map((i) => ({
    lat: here.lat + (i < 2 ? 0 : 0.0006),
    lng: here.lng + (i % 3 === 0 ? 0 : 0.0007),
  }));
  return corners
    .map((c, i) => {
      const g = latLngToGrid(c, 'CENTRAL')!;
      return `${i + 1},${g.northing.toFixed(2)},${g.easting.toFixed(2)},712.4${i},FND 1/2" IR`;
    })
    .join('\n');
}

describe('a Texas Central point file', () => {
  const parsed = parsePointFile(bellCountyFile());

  it('parses as grid, not degrees', () => {
    expect(parsed.points).toHaveLength(4);
    expect(looksLikeDegrees(parsed.points)).toBe(false);
  });

  it('projects back into Bell County when the right zone is chosen', () => {
    for (const p of parsed.points) {
      const at = gridToLatLng({ northing: p.northing, easting: p.easting }, 'CENTRAL')!;
      expect(looksLikeTexas(at)).toBe(true);
      expect(at.lat).toBeCloseTo(31.098, 2);
      expect(at.lng).toBeCloseTo(-97.342, 2);
    }
  });

  it('lands somewhere else entirely in the wrong zone — and still looks fine', () => {
    // The point of the whole design. Nothing here throws; the coordinates are simply wrong.
    const p = parsed.points[0]!;
    const wrong = gridToLatLng({ northing: p.northing, easting: p.easting }, 'SOUTH')!;
    expect(Number.isFinite(wrong.lat)).toBe(true);
    const milesOff = Math.hypot((wrong.lat - 31.0982) * 69, (wrong.lng + 97.3428) * 59.5);
    expect(milesOff).toBeGreaterThan(50);
  });

  it('suggests Central among the plausible zones', () => {
    const p = parsed.points[0]!;
    const keys = plausibleZones({ northing: p.northing, easting: p.easting }).map((g) => g.zone.key);
    expect(keys).toContain('CENTRAL');
  });
});

describe('a lat/long file needs no zone at all', () => {
  const text = [
    '1,31.0982,-97.3428,712.4,FND IR',
    '2,31.0988,-97.3421,713.1,SET IR',
  ].join('\n');

  it('is recognised as degrees', () => {
    const parsed = parsePointFile(text);
    expect(looksLikeDegrees(parsed.points)).toBe(true);
  });

  it('maps northing→lat and easting→lng in that order', () => {
    // The P,N,E column order means the SECOND field is the latitude. Reading them the other way
    // round would put a Texas file in the Indian Ocean.
    const parsed = parsePointFile(text);
    const at = { lat: parsed.points[0]!.northing, lng: parsed.points[0]!.easting };
    expect(looksLikeTexas(at)).toBe(true);
  });
});

describe('a file that is nearly all rubbish still reports usefully', () => {
  it('names the lines it could not read', () => {
    const text = [
      'Job 26143 point export',
      '1,10241883.21,3122904.77,712.44,IR',
      'page 1 of 2',
      '2,BAD,3122888.10,711.98,IR',
    ].join('\n');
    const parsed = parsePointFile(text);
    expect(parsed.points).toHaveLength(1);
    expect(parsed.skipped.map((s) => s.line)).toEqual([1, 3, 4]);
    expect(parsed.skipped[2]!.why).toMatch(/northing/);
  });
});
