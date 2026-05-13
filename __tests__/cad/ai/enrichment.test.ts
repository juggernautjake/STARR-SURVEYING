// __tests__/cad/ai/enrichment.test.ts
//
// Phase 6 §27 — Online Data Enrichment.
// Covers acceptance items from
// `docs/planning/in-progress/STARR_CAD/STARR_CAD_PHASE_6_AI_ENGINE.md`:
//
//   §3080 — PLSS data (township, range, section, abstract) returned
//   §3081 — FEMA flood zone data returned with panel number
//   §3083 — All enrichment sources failing gracefully (non-blocking)
//
// Uses `vi.spyOn(global, 'fetch')` to stub the upstream ArcGIS
// services so the test doesn't need network access. The endpoint
// URLs are forwarded through the `FetchOptions` overrides so the
// real DEFAULT_* endpoints are never hit.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchEnrichmentData } from '@/lib/cad/ai-engine/enrichment';

const FAKE_FEMA = 'http://fake/fema';
const FAKE_PLSS = 'http://fake/plss';
const FAKE_ELEV = 'http://fake/elev';

// Bell County, TX-ish lat/lon — the real PLSS service would
// return null here (Texas is largely off the PLSS grid), but
// the test mocks the response so the lat/lon is incidental.
const TEST_LAT = 31.0;
const TEST_LON = -97.3;

beforeEach(() => {
  // Ensure ENRICHMENT_DISABLED is off so the fetchers run.
  delete process.env.ENRICHMENT_DISABLED;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a Response stub that returns the given JSON object. */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Phase 6 §27 — enrichment fetchers', () => {
  it('§3081 — FEMA flood zone returns "<zone> (panel <id>)"', async () => {
    const spy = vi.spyOn(global, 'fetch').mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith(FAKE_FEMA)) {
          return jsonResponse({
            features: [
              {
                attributes: { FLD_ZONE: 'AE', FIRM_PAN: '48027C0455F' },
              },
            ],
          });
        }
        if (url.startsWith(FAKE_PLSS)) {
          return jsonResponse({ features: [] });
        }
        if (url.startsWith(FAKE_ELEV)) {
          return jsonResponse({ value: 521.5 });
        }
        return new Response('not found', { status: 404 });
      },
    );

    const result = await fetchEnrichmentData({
      latLon: { lat: TEST_LAT, lon: TEST_LON },
      elevationEndpoint: FAKE_ELEV,
      femaEndpoint: FAKE_FEMA,
      plssEndpoint: FAKE_PLSS,
    });
    expect(result.femaFloodZone).toBe('AE (panel 48027C0455F)');
    expect(result.elevationFt).toBe(521.5);
    expect(result.source).toContain('fema_nfhl');
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('§3081 — FEMA zone with no panel id returns just the zone', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse({ features: [{ attributes: { FLD_ZONE: 'X' } }] }),
    );
    const result = await fetchEnrichmentData({
      latLon: { lat: TEST_LAT, lon: TEST_LON },
      elevationEndpoint: FAKE_ELEV,
      femaEndpoint: FAKE_FEMA,
      plssEndpoint: FAKE_PLSS,
    });
    expect(result.femaFloodZone).toBe('X');
  });

  it('§3081 — empty FEMA features array returns null', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse({ features: [] }),
    );
    const result = await fetchEnrichmentData({
      latLon: { lat: TEST_LAT, lon: TEST_LON },
      elevationEndpoint: FAKE_ELEV,
      femaEndpoint: FAKE_FEMA,
      plssEndpoint: FAKE_PLSS,
    });
    expect(result.femaFloodZone).toBe(null);
    expect(result.source).toContain('fema_nfhl_empty');
  });

  it('§3080 — PLSS township/range/section parsed from TWNSHPLAB', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith(FAKE_PLSS)) {
          return jsonResponse({
            features: [
              {
                attributes: {
                  TWNSHPLAB: 'T2N R6W',
                  SECTION_ID: 12,
                  STEWARDID: 'NM',
                },
              },
            ],
          });
        }
        return jsonResponse({ features: [] });
      },
    );
    const result = await fetchEnrichmentData({
      latLon: { lat: TEST_LAT, lon: TEST_LON },
      elevationEndpoint: FAKE_ELEV,
      femaEndpoint: FAKE_FEMA,
      plssEndpoint: FAKE_PLSS,
    });
    expect(result.plssTownship).toBe('T2N');
    expect(result.plssRange).toBe('R6W');
    expect(result.plssSection).toBe('12');
    expect(result.source).toContain('blm_plss');
  });

  it('§3083 — FEMA 500 + PLSS network fail produce no-crash result with error tags', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith(FAKE_FEMA)) {
          return new Response('upstream broken', { status: 500 });
        }
        if (url.startsWith(FAKE_PLSS)) {
          throw new Error('network');
        }
        if (url.startsWith(FAKE_ELEV)) {
          return jsonResponse({ value: 100 });
        }
        return new Response('not found', { status: 404 });
      },
    );
    const result = await fetchEnrichmentData({
      latLon: { lat: TEST_LAT, lon: TEST_LON },
      elevationEndpoint: FAKE_ELEV,
      femaEndpoint: FAKE_FEMA,
      plssEndpoint: FAKE_PLSS,
    });
    // No crash; elevation still succeeds.
    expect(result.elevationFt).toBe(100);
    expect(result.femaFloodZone).toBe(null);
    expect(result.plssSection).toBe(null);
    expect(result.source).toContain('usgs_3dep');
    expect(result.source).toContain('fema_nfhl_error');
    expect(result.source).toContain('blm_plss_error');
  });

  it('§3083 — ENRICHMENT_DISABLED=1 short-circuits without hitting fetch', async () => {
    process.env.ENRICHMENT_DISABLED = '1';
    const spy = vi.spyOn(global, 'fetch');
    const result = await fetchEnrichmentData({
      latLon: { lat: TEST_LAT, lon: TEST_LON },
      elevationEndpoint: FAKE_ELEV,
      femaEndpoint: FAKE_FEMA,
      plssEndpoint: FAKE_PLSS,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result.elevationFt).toBe(null);
    expect(result.femaFloodZone).toBe(null);
    expect(result.source).toContain('disabled_via_env');
  });
});
