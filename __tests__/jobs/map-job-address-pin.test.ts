// "Pin the job's address and zoom to it at the lowest viewing level possible" (owner, 2026-11-11).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { addressZoom, ADDRESS_FALLBACK_ZOOM, JOB_ZOOM, MAP_MAX_ZOOM } from '@/lib/jobs/map-world';

describe('addressZoom', () => {
  it('goes as deep as the imagery does', () => {
    expect(addressZoom(21)).toBe(21);
    expect(addressZoom(19)).toBe(19);
  });
  it('never past the map ceiling, never shallower than a fence-line view', () => {
    expect(addressZoom(23)).toBe(MAP_MAX_ZOOM);
    expect(addressZoom(12)).toBe(JOB_ZOOM);
  });
  it('falls back when Google cannot say', () => {
    expect(addressZoom(null)).toBe(ADDRESS_FALLBACK_ZOOM);
    expect(addressZoom(undefined)).toBe(ADDRESS_FALLBACK_ZOOM);
    expect(addressZoom(Number.NaN)).toBe(ADDRESS_FALLBACK_ZOOM);
  });
});

describe('the map page', () => {
  const src = readFileSync(join(process.cwd(), 'app/admin/map/page.tsx'), 'utf8');
  it('has a Job address button in work mode that pins and zooms', () => {
    expect(src).toContain('data-testid="gmap-job-address"');
    expect(src).toContain('onClick={() => void pinJobAddress()}');
    expect(src).toContain('new google.maps.MaxZoomService().getMaxZoomAtLatLng(at)');
    expect(src).toContain('flyTo(at, addressZoom(deepest))');
  });
  it('prefers the stored coordinates, geocodes the address otherwise, and writes nothing back', () => {
    const fn = src.slice(src.indexOf('const pinJobAddress = useCallback'), src.indexOf('// ── address search'));
    expect(fn).toContain('job.lat !== null && job.lng !== null ? { lat: job.lat, lng: job.lng } : null');
    expect(fn).toContain('new google.maps.Geocoder().geocode');
    expect(fn).not.toMatch(/fetch\(/);
  });
});
