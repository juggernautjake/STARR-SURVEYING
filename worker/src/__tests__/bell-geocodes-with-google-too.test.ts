import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── B1 SHIPPED ON THE WRONG PATH ───────────────────────────────────────────────────────────────
//
// Plan B1 added Google as the third geocoder and was marked shipped against the 2026-09-03 run —
// the one where Census and Nominatim both returned nothing for "11780 FM 2484, Belton, TX 76513"
// and every aerial, FEMA and TxDOT lookup was skipped for want of coordinates.
//
// It was wired into `services/address-utils.ts`, which is the GENERIC pipeline's normaliser. That
// run was a Bell run. Bell geocodes in `counties/bell/orchestrator.ts` through its own private
// `geocodeAddress`, Census then Nominatim, and had never heard of the Google module. So the slice
// that was written for that outage would not have changed it by one line of log.
//
// Found by the 2026-09-03 platform audit (county-routing-bell and generic-pipeline readers, both
// independently). This guard reads the orchestrator's source rather than mocking three geocoders,
// because the defect was structural — the wrong file — and a text probe is the honest instrument
// for "does this file reach that module at all".

const REPO = path.resolve(process.cwd(), '..');
const ORCH = fs.readFileSync(path.join(REPO, 'worker/src/counties/bell/orchestrator.ts'), 'utf8');
const code = ORCH.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

describe('the Bell orchestrator geocodes with Google after the free providers', () => {
  it('CONTROL: the probe is reading the live orchestrator', () => {
    expect(code).toContain('async function geocodeAddress(');
    expect(code).toContain('geocoding.geo.census.gov');
    expect(code).toContain('nominatim.openstreetmap.org');
  });

  it('imports the Google geocoder — the module B1 built and Bell never reached', () => {
    expect(code).toMatch(/import \{ geocodeWithGoogle \} from '\.\.\/\.\.\/research\/google-geocode\.js'/);
  });

  it('calls it inside geocodeAddress, AFTER Nominatim, and returns its coordinates', () => {
    const fn = code.slice(code.indexOf('async function geocodeAddress('));
    const body = fn.slice(0, fn.indexOf('function resolveProperty('));
    const census = body.indexOf('geocoding.geo.census.gov');
    const nominatim = body.indexOf('nominatim.openstreetmap.org');
    const google = body.indexOf('geocodeWithGoogle(');
    expect(google).toBeGreaterThan(-1);
    // Order is the design: free first, billed last.
    expect(census).toBeLessThan(nominatim);
    expect(nominatim).toBeLessThan(google);
    expect(body).toContain("source: 'google'");
  });

  it('tells the run log which provider answered', () => {
    // A Google hit after two free misses is the signature of a rural address and a billed call;
    // both belong in the diary the operator reads, not only in the container's stdout.
    expect(code).toContain('Geocoded via ${geocodeResult.source}');
  });
});
