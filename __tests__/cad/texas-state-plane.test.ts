// CAD_AUDIT Slice S16 — the zone stamped into a delivered file must be the zone the data is in.
//
// EPSG:2277 was hardcoded in five places and DESCRIBED DIFFERENTLY in two of them:
// `lib/research/bell-cad-arcgis.service.ts` called WKID 2277 "NAD83 Texas North Central", while the
// CAD writers called it "Texas Central". The CAD writers are right — 2277 is Central, 2276 is North
// Central — and the disagreement is the reason this module exists.
//
// The consequence of getting it wrong is silent: a receiving system that trusts the label
// re-projects from the wrong zone and puts the parcel thousands of feet away, with no error
// anywhere, because every number involved is individually plausible.

import { describe, it, expect } from 'vitest';
import {
  TEXAS_STATE_PLANE_ZONES, zoneByKey, zoneByEpsg, crsUrn, DEFAULT_TEXAS_ZONE_KEY,
} from '@/lib/cad/geo/texas-state-plane';

describe('the zone table is correct', () => {
  it('maps 2277 to Central, not North Central', () => {
    // The exact confusion found in the codebase, pinned.
    expect(zoneByEpsg(2277)!.name).toBe('Texas Central');
    expect(zoneByEpsg(2276)!.name).toBe('Texas North Central');
  });

  it('pairs every EPSG code with its SPCS zone number', () => {
    // Instrument firmware and NGS publications use the FIPS/SPCS number (4201-4205); EPSG uses
    // 2275-2279. Transposing the two pairs is the other easy way to mislabel a file.
    expect(TEXAS_STATE_PLANE_ZONES.map((z) => [z.epsg, z.fipsZone])).toEqual([
      [2275, 4201], [2276, 4202], [2277, 4203], [2278, 4204], [2279, 4205],
    ]);
  });

  it('covers all five Texas zones with unique codes', () => {
    expect(TEXAS_STATE_PLANE_ZONES).toHaveLength(5);
    expect(new Set(TEXAS_STATE_PLANE_ZONES.map((z) => z.epsg)).size).toBe(5);
    expect(new Set(TEXAS_STATE_PLANE_ZONES.map((z) => z.key)).size).toBe(5);
  });

  it('states the units in every label, because Texas ships both ft and metre variants', () => {
    for (const z of TEXAS_STATE_PLANE_ZONES) {
      expect(z.label, z.name).toContain('US ft');
      expect(z.label, z.name).toContain('NAD83');
    }
  });
});

describe('lookups fail honestly', () => {
  it('returns null for an EPSG code that is not a Texas zone', () => {
    // Defaulting an unknown code to Central is precisely how the original mislabel would recur.
    expect(zoneByEpsg(4326)).toBeNull();
    expect(zoneByEpsg(32037)).toBeNull(); // NAD27 Texas North — a different datum, not converted here
    expect(zoneByEpsg(null)).toBeNull();
  });

  it('falls back to the declared default for an unknown KEY', () => {
    // Unlike EPSG lookup, a missing key means "the drawing did not say", which has a right answer.
    expect(zoneByKey(undefined).key).toBe(DEFAULT_TEXAS_ZONE_KEY);
    expect(zoneByKey('NOT_A_ZONE').key).toBe(DEFAULT_TEXAS_ZONE_KEY);
  });

  it('keeps Central as the default so consolidating the constant relabels nothing', () => {
    // Every existing export already stamped 2277. Changing the effective default while tidying it
    // up would silently relabel files that were previously correct.
    expect(zoneByKey(null).epsg).toBe(2277);
  });
});

describe('the GeoJSON CRS urn', () => {
  it('matches the form the writer already emits', () => {
    expect(crsUrn(zoneByEpsg(2277)!)).toBe('urn:ogc:def:crs:EPSG::2277');
  });
});
