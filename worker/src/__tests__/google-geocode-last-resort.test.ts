import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { geocodeWithGoogle, SERVER_MAPS_KEY_VARS } from '../research/google-geocode.js';

// ── THE RUN THAT LOST ITS IMAGERY TO A MISSING COORDINATE ───────────────────────────────────────
//
// 2026-09-03, Bell County, 11780 FM 2484:
//
//     geocode → Nominatim (192ms) fail — No results
//     geocode → Census   (553ms) fail — No matches
//     [1377s] Direct map screenshots skipped — no property ID or coordinates
//
// The aerial, satellite and GIS captures the owner wants FIRST in the run order are all gated on a
// location, and the run never got one. Verified independently: Nominatim really does return `[]`
// for that address; Google returns "11780 FM2484, Salado, TX 76571 @ 30.9971703, -97.626234"
// immediately. Rural Texas is where the free geocoders are weakest and what this business surveys.

const OK_BODY = {
  status: 'OK',
  results: [
    {
      formatted_address: '11780 FM2484, Salado, TX 76571, USA',
      geometry: { location: { lat: 30.9971703, lng: -97.626234 }, location_type: 'ROOFTOP' },
      address_components: [
        { long_name: 'Salado', short_name: 'Salado', types: ['locality', 'political'] },
        { long_name: 'Bell County', short_name: 'Bell County', types: ['administrative_area_level_2'] },
        { long_name: '76571', short_name: '76571', types: ['postal_code'] },
      ],
    },
  ],
};

const fakeFetch = (body: unknown, ok = true, status = 200) =>
  (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

const KEYED = { GOOGLE_MAPS_SERVER_KEY: 'test-key' } as NodeJS.ProcessEnv;

describe('the last-resort geocoder', () => {
  it('resolves the address the free providers missed', async () => {
    const out = await geocodeWithGoogle('11780 FM 2484, Belton, TX 76513', { env: KEYED, fetchImpl: fakeFetch(OK_BODY) });
    expect(out.result?.lat).toBeCloseTo(30.99717, 4);
    expect(out.result?.lon).toBeCloseTo(-97.626234, 4);
    expect(out.attempted).toBe(true);
  });

  it('strips "County" so the value matches our county routing', () => {
    // Routing matches on "Bell", not "Bell County". Passing the long name through would look right
    // and route nowhere.
    return geocodeWithGoogle('x', { env: KEYED, fetchImpl: fakeFetch(OK_BODY) }).then((out) => {
      expect(out.result?.county).toBe('Bell');
    });
  });

  it('surfaces the city and ZIP Google actually has', async () => {
    // The operator typed Belton 76513; the parcel is in Salado 76571. Worth carrying so the
    // mismatch is visible rather than inferred.
    const out = await geocodeWithGoogle('x', { env: KEYED, fetchImpl: fakeFetch(OK_BODY) });
    expect(out.result?.city).toBe('Salado');
    expect(out.result?.zip).toBe('76571');
  });

  it('NEVER uses the browser key', async () => {
    // The public key is referrer-restricted; a server sends no referrer, and Google refuses it with
    // a message that reads like a Google problem. Falling back to it would turn a clear
    // "not configured" into a confusing permission error, and put a billed API behind a key that
    // ships in the page source.
    const out = await geocodeWithGoogle('x', {
      env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'browser-key' } as NodeJS.ProcessEnv,
      fetchImpl: fakeFetch(OK_BODY),
    });
    expect(out.attempted).toBe(false);
    expect(out.statement).toMatch(/no server maps key is configured/);
    expect(out.statement).toMatch(/sends no referrer/);
    expect(SERVER_MAPS_KEY_VARS).not.toContain('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
  });

  it('tells a finding about the ADDRESS apart from one about US', async () => {
    // The distinction this codebase keeps having to relearn. ZERO_RESULTS means the address is not
    // findable; REQUEST_DENIED means our key is wrong — and reporting both as "geocoding failed" is
    // how a misconfiguration hides behind a plausible story about a rural address.
    const zero = await geocodeWithGoogle('nowhere', { env: KEYED, fetchImpl: fakeFetch({ status: 'ZERO_RESULTS' }) });
    expect(zero.statement).toMatch(/no match for/);
    expect(zero.statement).not.toMatch(/problem with our key/);

    const denied = await geocodeWithGoogle('x', {
      env: KEYED,
      fetchImpl: fakeFetch({ status: 'REQUEST_DENIED', error_message: 'API key not authorized' }),
    });
    expect(denied.statement).toMatch(/problem with our key or project, NOT with the address/);
  });

  it('never throws when the network fails', async () => {
    const out = await geocodeWithGoogle('x', {
      env: KEYED,
      fetchImpl: (async () => { throw new Error('socket hang up'); }) as unknown as typeof fetch,
    });
    expect(out.result).toBeNull();
    expect(out.statement).toContain('socket hang up');
  });

  it('CONTROL: an empty address is not sent anywhere', async () => {
    let called = false;
    const out = await geocodeWithGoogle('   ', {
      env: KEYED,
      fetchImpl: (async () => { called = true; return { ok: true, status: 200, json: async () => OK_BODY }; }) as unknown as typeof fetch,
    });
    expect(called, 'a blank address was sent to a billed API').toBe(false);
    expect(out.attempted).toBe(false);
  });
});

describe('it is wired as the THIRD layer — assert the CALLER', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'services', 'address-utils.ts'), 'utf8');
  const code = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

  it('CONTROL: stripping kept the code and dropped the prose', () => {
    expect(code).toContain('geocodeWithGoogle');
    expect(code).not.toContain('Rural Texas is');
  });

  it('runs only when the free providers found nothing', () => {
    // Google bills per call. First would spend money on every run to fix a minority of addresses.
    expect(code).toMatch(/if \(!result\.geocoded\) \{[\s\S]{0,200}geocodeWithGoogle/);
  });

  it('sets the coordinates that gate imagery', () => {
    expect(code).toContain('result.lat = g.result.lat');
    expect(code).toContain('result.lon = g.result.lon');
  });

  it('does NOT overwrite the parsed street parts', () => {
    // The operator's own fields (seed 624) beat any geocoder's guess at a street name — that is the
    // whole point of storing them separately.
    expect(code, 'Google is overwriting the parsed address').not.toMatch(/result\.parsed = g\.result/);
  });

  it('and says what it did, either way', () => {
    expect(code).toContain("logger.info('Stage0C', g.statement)");
  });
});
