// The zoomed-out map: one marker per job, named, searchable.
//
// Owner, 2026-09-19: "I wish it were that when we are zoomed out and it shows the single point with
// the number of points at that location, it showed the job name and the number of points at that
// location. I want it so that as we add jobs to the interactive map, we can see on the map where
// each job is. Then we can search the jobs, and the points with the job names will filter
// dynamically … If a job does not match our string, then its representitive point would disappear."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { clusterByJob, jobLabelOf, matchesJobSearch, CLUSTER_MAX_ZOOM } from '@/lib/jobs/map-world';

const read = (p: string) => readFileSync(p, 'utf8');

/** A point on a job, at a place. Salado and Thorndale are ~30 miles apart. */
const at = (id: string, jobId: string, lat: number, lng: number, jobName: string | null = null, jobNumber: string | null = null) =>
  ({ id, jobId, jobName, jobNumber, lat, lng });

const SALADO = { lat: 30.9489, lng: -97.5397 };
const THORNDALE = { lat: 30.6107, lng: -97.2050 };

describe('grouping the map by job', () => {
  it('draws one marker per job, carrying its name and its count', () => {
    const out = clusterByJob([
      at('a', 'j1', SALADO.lat, SALADO.lng, 'LANCE LANE PROPERTY'),
      at('b', 'j1', SALADO.lat + 0.0002, SALADO.lng, 'LANCE LANE PROPERTY'),
      at('c', 'j1', SALADO.lat, SALADO.lng + 0.0002, 'LANCE LANE PROPERTY'),
    ], 12);
    expect(out).toHaveLength(1);
    expect(out[0]!.jobLabel).toBe('LANCE LANE PROPERTY');
    expect(out[0]!.items).toHaveLength(3);
    expect(out[0]!.jobId).toBe('j1');
  });

  it('keeps two jobs apart even when they sit on top of each other', () => {
    // The case the owner asked about next: "when we get more points they might start to overlap
    // each other and it will be helpful to know which point we are hovering over before selecting
    // it to make sure we select the correct job." Merging them would make that impossible.
    const out = clusterByJob([
      at('a', 'j1', SALADO.lat, SALADO.lng, 'Job A'),
      at('b', 'j2', SALADO.lat + 0.00001, SALADO.lng, 'Job B'),
    ], 12);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.jobLabel).sort()).toEqual(['Job A', 'Job B']);
  });

  it('gives a job at two distant sites a marker at each', () => {
    // Averaging them would put one marker in a field thirty miles from either parcel.
    const out = clusterByJob([
      at('a', 'j1', SALADO.lat, SALADO.lng, 'Two Parcels'),
      at('b', 'j1', THORNDALE.lat, THORNDALE.lng, 'Two Parcels'),
    ], 12);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.jobLabel === 'Two Parcels')).toBe(true);
    for (const c of out) {
      // Each marker sits on its own points, not between them.
      const near = c.items[0]!;
      expect(Math.abs(c.lat - near.lat)).toBeLessThan(0.01);
    }
  });

  it('stops clustering once you are close enough to see the points', () => {
    const pts = [
      at('a', 'j1', SALADO.lat, SALADO.lng, 'Job A'),
      at('b', 'j1', SALADO.lat + 0.0001, SALADO.lng, 'Job A'),
    ];
    expect(clusterByJob(pts, CLUSTER_MAX_ZOOM)).toHaveLength(2);
    expect(clusterByJob(pts, CLUSTER_MAX_ZOOM - 1)).toHaveLength(1);
  });

  it('refuses to put a point with no real position on the map', () => {
    expect(clusterByJob([at('a', 'j1', 0, 0, 'Nowhere')], 12)).toEqual([]);
  });

  it('never shows an empty name', () => {
    expect(jobLabelOf({ jobName: 'LANCE LANE', jobNumber: '26143' })).toBe('LANCE LANE');
    expect(jobLabelOf({ jobName: null, jobNumber: '26143' }), 'the number when there is no name').toBe('26143');
    expect(jobLabelOf({ jobName: '   ', jobNumber: null }), 'blank is not a name').toBe('Job');
    expect(jobLabelOf({ jobName: null, jobNumber: null })).toBe('Job');
  });
});

describe('searching the jobs on the map', () => {
  const job = { jobName: 'LANCE LANE PROPERTY', jobNumber: '26143' };

  it('matches the name and the number, either way round', () => {
    expect(matchesJobSearch(job, 'lance')).toBe(true);
    expect(matchesJobSearch(job, 'LANE')).toBe(true);
    expect(matchesJobSearch(job, '26143')).toBe(true);
    expect(matchesJobSearch(job, '143'), 'a fragment of the number still finds it').toBe(true);
  });

  it('hides a job that does not match', () => {
    expect(matchesJobSearch(job, 'smith')).toBe(false);
    expect(matchesJobSearch({ jobName: null, jobNumber: null }, 'anything')).toBe(false);
  });

  it('an empty box shows everything, so clearing it brings the map back', () => {
    expect(matchesJobSearch(job, '')).toBe(true);
    expect(matchesJobSearch(job, '   ')).toBe(true);
    expect(matchesJobSearch({ jobName: null, jobNumber: null }, '')).toBe(true);
  });
});

describe('the map page wiring', () => {
  const page = read('app/admin/map/page.tsx');

  it('groups by job when browsing and by geography inside a job', () => {
    // Inside one job every point already belongs to it, so naming each cluster would be noise.
    expect(page).toContain('workMode ? clusterPoints(drawable, zoom) : clusterByJob(drawable, zoom)');
  });

  it('filters before clustering, so a hidden job stays hidden at every zoom', () => {
    // Filtering the clusters instead would let the map repopulate as you zoomed in — the behaviour
    // of a highlight, not of a filter.
    expect(page).toContain('.filter((p) => matchesJobSearch(p, jobSearch))');
  });

  it('the one search box filters as you type and still geocodes on Enter', () => {
    expect(page).toContain('onChange={(e) => setJobSearch(e.target.value)}');
    expect(page, 'Enter still looks the text up as a place').toContain('void goToQuery((e.target as HTMLInputElement).value)');
  });

  it('a cluster marker carries the job name beside its count', () => {
    expect(page).toContain("tag.className = 'gmap__cluster-name'");
    expect(page).toContain('tag.textContent = named;');
  });

  it('every marker glows under the cursor', () => {
    const glow = (page.match(/gmap__marker--hot/g) ?? []).length;
    expect(glow, 'both the single pin and the cluster').toBeGreaterThanOrEqual(4);
  });

  it('clicking a cluster frames the job rather than selecting a point', () => {
    expect(page).toContain('gmap.fitBounds(new google.maps.LatLngBounds');
  });

  it('is styled', () => {
    const css = read('app/admin/map/PropertyMap.css');
    expect(css).toContain('.gmap__cluster-name {');
    expect(css).toContain('.gmap__marker--hot {');
    expect(css, 'the glow must not resize the marker under the cursor').not.toMatch(/\.gmap__marker--hot[^{]*\{[^}]*transform:\s*scale/);
  });
});
