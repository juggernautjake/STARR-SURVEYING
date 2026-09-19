// Turning a job's address into a place on the earth.
//
// Owner, 2026-09-18: "If a job has a specific address or latitude/longitude assigned to it, then
// that should show up when we go the interactive map from that job immediately."
//
// The map cannot fly anywhere without coordinates, and `jobs.latitude` has been an empty column
// since the baseline schema — the job form asked Google Places for an address and threw away the
// position that came back in the same response. Most of what follows is about the answers that look
// like coordinates and are not.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGeocodeQuery, isRealCoordinate, isUsablePrecision } from '@/lib/maps/geocode';

const read = (p: string) => readFileSync(p, 'utf8');

describe('what gets sent to the geocoder', () => {
  it('builds one line from the pieces a job carries', () => {
    expect(buildGeocodeQuery({ address: '1512 Chisholm Trail', city: 'Salado', state: 'TX', zip: '76571' }))
      .toBe('1512 Chisholm Trail, Salado, TX, 76571');
  });

  it('refuses a street with nothing to narrow it', () => {
    // "100 County Road 200" exists in most of the 254 counties. Google will still answer, and the
    // answer will be confident and in the wrong place — which is worse than no pin at all.
    expect(buildGeocodeQuery({ address: '100 County Road 200' })).toBeNull();
    expect(buildGeocodeQuery({ address: '100 County Road 200', state: 'TX' })).toBeNull();
  });

  it('takes a ZIP or a county when there is no city', () => {
    expect(buildGeocodeQuery({ address: '100 CR 200', zip: '76513' })).toBe('100 CR 200, TX, 76513');
    expect(buildGeocodeQuery({ address: '100 CR 200', county: 'Bell' })).toBe('100 CR 200, Bell, TX');
  });

  it('prefers the city over the county as the locality', () => {
    // Both together narrows LESS well — Google reads the county as a second locality token.
    expect(buildGeocodeQuery({ address: '819 W Clark St', city: 'Bartlett', county: 'Bell', state: 'TX' }))
      .toBe('819 W Clark St, Bartlett, TX');
  });

  it('assumes Texas, because every job this firm has taken is in it', () => {
    expect(buildGeocodeQuery({ address: '309 West Gibson', city: 'Thorndale' }))
      .toBe('309 West Gibson, Thorndale, TX');
  });

  it('has nothing to ask when there is no street', () => {
    expect(buildGeocodeQuery({ city: 'Salado', state: 'TX', zip: '76571' })).toBeNull();
    expect(buildGeocodeQuery({ address: '   ', city: 'Salado' })).toBeNull();
    expect(buildGeocodeQuery({})).toBeNull();
  });
});

describe('a coordinate that is actually on the earth', () => {
  it('takes a real Central Texas position', () => {
    expect(isRealCoordinate(30.958932, -97.525251)).toBe(true);
  });

  it('refuses 0,0 — the Gulf of Guinea is not a Texas survey', () => {
    // This is what a failed parse looks like far more often than it is a real answer.
    expect(isRealCoordinate(0, 0)).toBe(false);
  });

  it('refuses what is not a finite number, and what is off the globe', () => {
    expect(isRealCoordinate(NaN, 1)).toBe(false);
    expect(isRealCoordinate(Infinity, 1)).toBe(false);
    expect(isRealCoordinate('30.9', -97.5)).toBe(false);
    expect(isRealCoordinate(null, null)).toBe(false);
    expect(isRealCoordinate(undefined, undefined)).toBe(false);
    expect(isRealCoordinate(91, 0)).toBe(false);
    expect(isRealCoordinate(0, 181)).toBe(false);
  });

  it('keeps a real coordinate that happens to have a zero in it', () => {
    expect(isRealCoordinate(0, -97.5)).toBe(true);
    expect(isRealCoordinate(30.9, 0)).toBe(true);
  });
});

describe('how precisely it landed', () => {
  it('a building or a point along a street is good enough to fly to', () => {
    expect(isUsablePrecision('ROOFTOP')).toBe(true);
    expect(isUsablePrecision('RANGE_INTERPOLATED')).toBe(true);
  });

  it('the middle of a road or a whole town is not', () => {
    expect(isUsablePrecision('GEOMETRIC_CENTER')).toBe(false);
    expect(isUsablePrecision('APPROXIMATE')).toBe(false);
    expect(isUsablePrecision('UNKNOWN')).toBe(false);
  });
});

describe('the wiring around it', () => {
  it('uses the server key and never the browser one', () => {
    const src = read('lib/maps/geocode.ts');
    expect(src).toContain('resolveServerMapsKey');
    expect(src).not.toContain('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
  });

  it('refuses rather than throws, so a job with a bad address still lists', () => {
    const src = read('lib/maps/geocode.ts');
    expect(src).toContain('retryable');
    expect(src).toContain("error: 'Google does not recognise that address.'");
  });

  it('the address box keeps the position Google already sent', () => {
    // The whole bug: `geometry` rides along with the components in one lookup, and was not asked for.
    const src = read('app/admin/components/AddressAutocomplete.tsx');
    expect(src).toContain("'geometry.location'");
    expect(src).toContain('latitude: at ? at.lat() : null');
    const form = read('app/admin/jobs/new/page.tsx');
    expect(form).toContain('latitude: details.latitude ?? prev.latitude');
  });

  it('the backfill is a script you run, not something a page load pays for', () => {
    const src = read('scripts/backfill-job-coordinates.mjs');
    expect(src).toContain('--dry-run');
    expect(src, 'skips what is already placed unless told otherwise').toContain('AND (latitude IS NULL OR longitude IS NULL)');
    expect(src, 'and spaces the requests').toContain('PAUSE_MS');
  });
});
