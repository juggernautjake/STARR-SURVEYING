// __tests__/weather/location-search.test.ts
//
// Owner, 2026-08-06: *"We have it set to central texas, but we need to have a search function for
// locations in the US. We need to be able to see the weather in any county or city in the USA."*
//
// The ranking is the feature here. "Any city" is a geocoder call; "any county" is not, because the
// geocoder answers county queries with parks, and a wrong answer that carries real coordinates
// forecasts happily for the wrong place.

import { describe, it, expect } from 'vitest';
import {
  cityHits,
  isZipQuery,
  mergeLocationResults,
  parseQuery,
  searchCounties,
} from '@/lib/weather/location-search';
import { US_COUNTIES } from '@/lib/weather/us-counties';

describe('the bundled county table', () => {
  it('covers the whole country, not just where the firm works', () => {
    expect(US_COUNTIES.length).toBeGreaterThan(3100);
  });

  it('carries every state plus DC and Puerto Rico', () => {
    const states = new Set(US_COUNTIES.map((c) => c[2]));
    expect(states.size).toBeGreaterThanOrEqual(51);
    expect(states.has('TX')).toBe(true);
    expect(states.has('AK')).toBe(true);
    expect(states.has('DC')).toBe(true);
    expect(states.has('PR')).toBe(true);
  });

  it('every row has plausible US coordinates', () => {
    // A transposed lat/lon or a zeroed row forecasts for the ocean without erroring, so the bounds
    // are asserted rather than assumed.
    //
    // Longitude is checked as "western hemisphere OR far-eastern Pacific" because three groups of
    // US territory legitimately sit at positive longitudes: Guam and the Northern Marianas at
    // ~145°E, and — the one that caught this test out first time — Aleutians West Census Area,
    // Alaska, whose interior point is 179.62°E because the county crosses the antimeridian.
    const bad = US_COUNTIES.filter(([, , , , lat, lon]) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;
      if (lat < 13 || lat > 72) return true;              // American Samoa ~14°S..., N. Alaska ~71°N
      const westernHemisphere = lon >= -180 && lon <= -64;
      const farPacific = lon >= 144 && lon <= 180;
      return !(westernHemisphere || farPacific);
    });
    expect(bad.map((r) => `${r[1]}, ${r[3]} (${r[4]}, ${r[5]})`)).toEqual([]);
  });
});

describe('parseQuery', () => {
  it('pulls a full state name off the end', () => {
    expect(parseQuery('bell county texas')).toMatchObject({ place: 'bell', stateCode: 'TX', saidCounty: true });
  });

  it('pulls a two-letter state code off the end', () => {
    expect(parseQuery('Travis County, TX')).toMatchObject({ place: 'travis', stateCode: 'TX' });
  });

  it('prefers the longest state name so "west virginia" is not read as "virginia"', () => {
    expect(parseQuery('marion county west virginia').stateCode).toBe('WV');
  });

  it('notices when no state was named', () => {
    expect(parseQuery('killeen')).toMatchObject({ place: 'killeen', stateCode: null, saidCounty: false });
  });
});

describe('searchCounties', () => {
  it('finds a county by its bare name', () => {
    const hits = searchCounties('bell county texas');
    expect(hits[0]).toMatchObject({ kind: 'county', name: 'Bell County', state: 'Texas' });
    expect(hits[0].label).toBe('Bell County, Texas');
  });

  it('ranks the exact name above a longer one containing it', () => {
    // The whole reason the scorer subtracts for extra length: a short exact match must not be beaten
    // by a longer name that merely contains it.
    //
    // Asserted as "first result", NOT as `indexOf(a) < indexOf(b)` — `indexOf` returns -1 when the
    // needle is absent, so that shape passes hardest at the moment the thing it guards disappears.
    // See __tests__/ordering-assertion-ratchet.test.ts.
    const names = searchCounties('bell', 10).map((h) => h.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names[0]).toBe('Bell County');
  });

  it('narrows to the named state', () => {
    // Washington County exists in ~30 states; naming one must pick that one.
    const hits = searchCounties('washington county oregon');
    expect(hits[0]).toMatchObject({ name: 'Washington County', state: 'Oregon' });
  });

  it('handles Louisiana parishes and Alaska boroughs, not just "County"', () => {
    expect(searchCounties('orleans parish louisiana')[0]).toMatchObject({ name: 'Orleans Parish', state: 'Louisiana' });
    expect(searchCounties('nome census area alaska')[0].state).toBe('Alaska');
  });

  it('the division type the user typed outranks the same name elsewhere', () => {
    // Found by probing the live endpoint 2026-08-06: "orleans parish" returned Orleans County, New
    // York and Orleans County, Vermont ABOVE Orleans Parish, Louisiana. All three score identically
    // on the name "orleans", and the alphabetical tiebreak puts "County" before "Parish". Only
    // Louisiana has parishes, so the word is nearly as strong a signal as naming the state.
    expect(searchCounties('orleans parish')[0]).toMatchObject({
      name: 'Orleans Parish', state: 'Louisiana',
    });
  });

  it('scores a whole-word suffix without a state as well as it scores boroughs', () => {
    expect(searchCounties('juneau borough')[0].state).toBe('Alaska');
  });

  it('gives real coordinates, not a placeholder', () => {
    const bell = searchCounties('bell county texas')[0];
    expect(bell.latitude).toBeGreaterThan(30);
    expect(bell.latitude).toBeLessThan(32);
    expect(bell.longitude).toBeLessThan(-97);
  });

  it('says nothing for a one-character query rather than scanning the country', () => {
    expect(searchCounties('b')).toEqual([]);
  });
});

describe('cityHits', () => {
  const payload = {
    results: [
      { id: 1, name: 'Killeen', latitude: 31.1, longitude: -97.7, country_code: 'US', admin1: 'Texas', admin2: 'Bell', feature_code: 'PPL' },
      { id: 2, name: 'Killeen', latitude: 53.4, longitude: -7.9, country_code: 'IE', admin1: 'Connacht', feature_code: 'PPL' },
    ],
  };

  it('keeps US places and drops everything else', () => {
    // `&country=US` was never a real Open-Meteo parameter; this is the filter that actually works.
    const hits = cityHits(payload);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'city', name: 'Killeen', state: 'Texas', county: 'Bell' });
  });

  it('drops non-populated features like the parks a county query returns', () => {
    const parks = { results: [{ id: 9, name: 'Bell County Expo Center', latitude: 31, longitude: -97, country_code: 'US', admin1: 'Texas', feature_code: 'PRK' }] };
    expect(cityHits(parks)).toEqual([]);
  });

  it('labels a ZIP search with the ZIP the user typed', () => {
    const hits = cityHits(payload, { zip: '76541' });
    expect(hits[0].kind).toBe('zip');
    expect(hits[0].label).toBe('Killeen, Texas 76541');
  });
});

describe('mergeLocationResults', () => {
  const county = searchCounties('bell county texas').slice(0, 1);
  const city = cityHits({
    results: [{ id: 1, name: 'Bellmead', latitude: 31.6, longitude: -97.1, country_code: 'US', admin1: 'Texas', feature_code: 'PPL' }],
  });

  it('leads with counties when the user said "county"', () => {
    expect(mergeLocationResults(county, city, 'bell county texas')[0].kind).toBe('county');
  });

  it('leads with cities otherwise — "austin" means the city', () => {
    expect(mergeLocationResults(county, city, 'bell')[0].kind).toBe('city');
  });

  it('returns both kinds either way, so neither is unreachable', () => {
    const kinds = new Set(mergeLocationResults(county, city, 'bell').map((h) => h.kind));
    expect(kinds).toEqual(new Set(['city', 'county']));
  });
});

describe('isZipQuery', () => {
  it('accepts 5-digit and ZIP+4', () => {
    expect(isZipQuery('78701')).toBe(true);
    expect(isZipQuery('78701-1234')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isZipQuery('Austin')).toBe(false);
    expect(isZipQuery('7870')).toBe(false);
  });
});
