// The map shows every job; the open one is larger and red; double-click zooms as deep as the imagery
// goes; a job with no place is found by its address, or by an address Claude works out (2026-11-11).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: {} }));
vi.mock('@/lib/ai/client', () => ({ callAi: vi.fn(), aiConfigured: () => false }));

import { addressZoom, ADDRESS_FALLBACK_ZOOM, JOB_ZOOM, MAP_MAX_ZOOM } from '@/lib/jobs/map-world';
import {
  locateRecord, parseAiAddress, addressQueryFor, describeForAi, isInTexas, isPlaceablePrecision,
  type LocateRecord,
} from '@/lib/jobs/locate-jobs';
import type { GeocodeResult } from '@/lib/maps/geocode';

const hit = (lat: number, lng: number, precision = 'ROOFTOP', formatted = 'somewhere'): GeocodeResult =>
  ({ ok: true, hit: { latitude: lat, longitude: lng, precision, formatted } });

// The Westwood job as it really reads: the address is the job NAME, the town is in the project.
const westwood: LocateRecord = {
  id: 'j1', job_number: '26142', name: '1100 WESTWOOD DRIVE', address: null, city: null, county: null, state: 'TX', zip: null,
  client_company: null, client_name: 'Ebby Green',
  project: { name: 'Round Rock Housing Authority', address: null, city: null, state: 'TX', zip: null, client_company: 'Round Rock Housing Authority' },
};

describe('addressZoom', () => {
  it('goes as deep as the imagery does, within 18–22, and falls back to 20', () => {
    expect(addressZoom(21)).toBe(21);
    expect(addressZoom(23)).toBe(MAP_MAX_ZOOM);
    expect(addressZoom(12)).toBe(JOB_ZOOM);
    expect(addressZoom(null)).toBe(ADDRESS_FALLBACK_ZOOM);
    expect(addressZoom(Number.NaN)).toBe(ADDRESS_FALLBACK_ZOOM);
  });
});

describe('locating a job', () => {
  it('uses its own address when Google can place it', async () => {
    const r: LocateRecord = { ...westwood, address: '1100 Westwood Dr', city: 'Round Rock' };
    const askAi = vi.fn();
    const out = await locateRecord(r, { geocode: async () => hit(30.51, -97.68), askAi });
    expect(out).toMatchObject({ ok: true, source: 'address', lat: 30.51 });
    expect(askAi).not.toHaveBeenCalled();
  });

  it('asks the AI when the record has no usable address, and Google places its answer', async () => {
    const geocode = vi.fn(async (q: string) => (q.includes('Round Rock') ? hit(30.52, -97.69) : hit(0, 0)));
    const askAi = vi.fn(async () => '1100 Westwood Dr, Round Rock, TX');
    const out = await locateRecord(westwood, { geocode, askAi });
    expect(askAi).toHaveBeenCalledOnce();
    expect(out).toMatchObject({ ok: true, source: 'ai', query: '1100 Westwood Dr, Round Rock, TX' });
  });

  it('refuses a town-level match and anything outside Texas', async () => {
    const r: LocateRecord = { ...westwood, address: '1100 Westwood Dr', city: 'Round Rock' };
    const vague = await locateRecord(r, { geocode: async () => hit(30.5, -97.6, 'APPROXIMATE'), askAi: async () => null });
    expect(vague.ok).toBe(false);
    const ohio = await locateRecord(r, { geocode: async () => hit(40.0, -83.0), askAi: async () => null });
    expect(ohio.ok).toBe(false);
  });

  it('a Google outage is retryable, so it is not marked as "not found"', async () => {
    const r: LocateRecord = { ...westwood, address: '1100 Westwood Dr', city: 'Round Rock' };
    const out = await locateRecord(r, { geocode: async () => ({ ok: false, error: 'down', retryable: true }), askAi: async () => null });
    expect(out).toEqual(expect.objectContaining({ ok: false, retryable: true }));
  });

  it('builds queries and AI context from every field that says where', () => {
    expect(addressQueryFor({ ...westwood, address: '1100 Westwood Dr', project: { ...westwood.project!, city: 'Round Rock' } }))
      .toBe('1100 Westwood Dr, Round Rock, TX');
    const ctx = describeForAi(westwood);
    expect(ctx).toContain('Job name: 1100 WESTWOOD DRIVE');
    expect(ctx).toContain('Project name: Round Rock Housing Authority');
  });

  it('reads the model answer even with prose around it', () => {
    expect(parseAiAddress('Sure: {"address": "1100 Westwood Dr, Round Rock, TX", "confidence": "high"}'))
      .toEqual({ address: '1100 Westwood Dr, Round Rock, TX', confidence: 'high' });
    expect(parseAiAddress('{"address": null}')).toBeNull();
    expect(parseAiAddress('no idea')).toBeNull();
  });

  it('Texas and precision checks', () => {
    expect(isInTexas(31.0, -97.4)).toBe(true);
    expect(isInTexas(40, -83)).toBe(false);
    expect(isPlaceablePrecision('GEOMETRIC_CENTER')).toBe(true);
    expect(isPlaceablePrecision('APPROXIMATE')).toBe(false);
  });
});

describe('the map page', () => {
  const src = readFileSync(join(process.cwd(), 'app/admin/map/page.tsx'), 'utf8');
  const css = readFileSync(join(process.cwd(), 'app/admin/map/PropertyMap.css'), 'utf8');

  it('draws a dot for every located job, the open one larger and red', () => {
    expect(src).toContain("el.className = e.open ? 'gmap__jobdot gmap__jobdot--open' : 'gmap__jobdot'");
    expect(css).toContain('.gmap__jobdot {');
    expect(css).toContain('.gmap__jobdot--open {');
  });

  it('double-click zooms as deep as the imagery goes, without the map also zooming', () => {
    expect(src).toContain("el.addEventListener('dblclick', (ev) => { ev.stopPropagation(); ev.preventDefault(); void zoomAllTheWayTo(e.at); });");
    expect(src).toContain('new google.maps.MaxZoomService().getMaxZoomAtLatLng(at)');
    expect(src).toContain('flyTo(at, addressZoom(deepest))');
  });

  it('the Job address button finds the job (server lookup with AI) and zooms in', () => {
    expect(src).toContain('data-testid="gmap-job-address"');
    expect(src).toContain("body: JSON.stringify({ jobId: job.jobId })");
  });

  it('fills in more jobs in the background on every visit', () => {
    expect(src).toContain("fetch('/api/admin/map/locate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skip }) })");
  });

  it('the migration that remembers how and when a job was located', () => {
    const sql = readFileSync(join(process.cwd(), 'seeds/683_jobs_location_lookup.sql'), 'utf8');
    for (const c of ['location_source', 'location_checked_at', 'location_formatted']) expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
  });
});
