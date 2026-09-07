// One circuit per host PER TRANSPORT (plan PLATS_FIRST_AND_VIEWER 3.2). Bell CAD refuses the worker's
// IP but answers through Browserbase; on 2026-09-07 the direct fetch's trip skipped every browser
// capture of that host for the rest of the run.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostCircuit, resetHostCircuits, tripHost } from '../infra/host-circuit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');
const CAD = 'https://esearch.bellcad.org/Property/View/64567';

describe('a direct trip leaves the browser route open', () => {
  beforeEach(() => resetHostCircuits());
  it('trips only the transport that failed', () => {
    expect(tripHost(CAD, new Error('fetch failed'), 1000)).toBe(true);
    expect(hostCircuit(CAD, 2000).down).toBe(true);                       // direct (default)
    expect(hostCircuit(CAD, 2000, 'direct').down).toBe(true);
    expect(hostCircuit(CAD, 2000, 'browser').down).toBe(false);           // Browserbase still allowed
  });
  it('and a browser trip leaves the direct route open', () => {
    // Playwright's navigation timeout is a TimeoutError — the name is what the circuit recognises.
    tripHost('https://gis.bisclient.com/bellcad/', Object.assign(new Error('page.goto: Timeout 60000ms exceeded'), { name: 'TimeoutError' }), 1000, 'browser');
    expect(hostCircuit('https://gis.bisclient.com/bellcad/', 2000, 'browser').down).toBe(true);
    expect(hostCircuit('https://gis.bisclient.com/bellcad/', 2000).down).toBe(false);
  });
  it('non-connection failures still trip nothing on either transport', () => {
    expect(tripHost(CAD, new Error('HTTP 403'), 1000, 'browser')).toBe(false);
    expect(hostCircuit(CAD, 2000, 'browser').down).toBe(false);
  });
});

describe('the callers name their transport (check the CALLER)', () => {
  it('Playwright and the capture scrapers check/trip the browser circuit; the HTTP layers the direct one', () => {
    const cad = read('services/bis-cad.ts');
    expect(cad).toContain("const pwCircuit = hostCircuit(baseUrl, undefined, 'browser');");
    expect(cad).toContain('const httpCircuit = hostCircuit(baseUrl);');
    for (const f of ['counties/bell/scrapers/gis-viewer-capture.ts', 'counties/bell/scrapers/map-screenshot-capture.ts', 'counties/bell/scrapers/screenshot-collector.ts']) {
      const src = read(f);
      expect(src, f).toMatch(/hostCircuit\([^)]*, undefined, 'browser'\)/);
      expect(src, f).toMatch(/tripHost\([^)]*, err, undefined, 'browser'\)/);
    }
  });
});
