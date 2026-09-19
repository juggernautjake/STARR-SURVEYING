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

// ── ARRIVING AT A JOB (owner, 2026-09-19) ───────────────────────────────────────────────────────
//
// "If I refresh the interactive map page it should still have the property address loaded in and be
// zoomed in on it."
//
// It did not, for a narrow reason: the camera only moved for a job with STORED coordinates, and
// `jobs.latitude` is only filled in when somebody picks a Google suggestion in the Property panel
// and saves. A hand-typed address is a real address with no coordinates, and those jobs opened over
// the office on every single refresh.
describe('the map page arrives where the job is', () => {
  const page = read('app/admin/map/page.tsx');

  it('falls back to geocoding the job address when there are no coordinates', () => {
    expect(page, 'the fallback exists at all').toContain('const line = addressLine(job);');
    expect(page).toContain("new google.maps.Geocoder().geocode({ address: line");
    // Order matters: points frame the parcel, stored coordinates beat a guess, and the address is
    // the last resort rather than the first thing tried.
    const atPoints = page.indexOf('map.fitBounds(new google.maps.LatLngBounds');
    const atStored = page.indexOf('if (job.lat !== null && job.lng !== null) { go({ lat: job.lat, lng: job.lng }); return; }');
    const atAddress = page.indexOf('const line = addressLine(job);');
    expect(atPoints).toBeGreaterThan(-1);
    expect(atStored).toBeGreaterThan(atPoints);
    expect(atAddress).toBeGreaterThan(atStored);
  });

  it('does not yank the camera if the geocode lands late', () => {
    // It resolves after a network round trip. By then somebody may have panned somewhere else or
    // opened another job, and moving the map under them is worse than not moving it at all.
    expect(page).toContain('if (!live || !at) return;');
  });

  it('never writes the guess back onto the job', () => {
    // A geocode is Google's opinion about a mailing address; `jobs.latitude` is something a person
    // entered on purpose. Promoting one to the other during a page load makes a record nobody
    // remembers creating — and the backfill script below is where that decision belongs.
    const fly = page.slice(page.indexOf('const flownToRef'), page.indexOf('const fetchWorld'));
    expect(fly).not.toMatch(/method:\s*'(POST|PATCH|PUT)'/);
    // A write would have to name the column as a key. The word itself appears in the comment that
    // explains why this is not done, so the assertion looks for the assignment, not the mention.
    expect(fly).not.toMatch(/\blatitude\s*:/);
    expect(fly).not.toMatch(/\blongitude\s*:/);
  });

  it('puts the address in the search box, without fighting the autocomplete', () => {
    expect(page, 'through the ref, because Places owns this input').toContain('box.value = line;');
    expect(page, 'and only when it is empty, so a half-typed search survives').toContain("if (box.value.trim()) return;");
  });

  it('stops claiming a job with an address has no location', () => {
    expect(page).toContain('if (data.job.lat === null && !addressLine(data.job)) {');
  });

  it('the address line is pinned to Texas so a bare street is not ambiguous', () => {
    expect(page).toContain("return [j.address, j.city, j.county, 'TX'].filter(Boolean).join(', ');");
    expect(page, 'and says so when there is nothing to look up').toContain("if (!j.address && !j.city) return '';");
  });
});

// ── DRAWING AND RESHAPING (owner, 2026-09-19) ───────────────────────────────────────────────────
describe('placing the corners of a shape', () => {
  const page = read('app/admin/map/page.tsx');
  const css = read('app/admin/map/PropertyMap.css');

  it('the rubber band cannot eat the click that places the next corner', () => {
    // The reported bug: "I can place the initial point and then I can see the dashed line ... but it
    // won't let me actually anchor it." A Polyline is clickable by DEFAULT and this one ends at the
    // cursor, so it was permanently the topmost overlay under the pointer and the map never saw a
    // click. Nothing else about the band matters as much as this one property.
    const band = page.slice(page.indexOf('rubberRef.current = new google.maps.Polyline'));
    expect(band.slice(0, band.indexOf('});'))).toContain('clickable: false');
  });

  it('nothing else on the map takes a click while a shape is being drawn', () => {
    // Every click is a corner, so pins, their labels, the wrapper Google positions, and clusters all
    // stand aside. A transparent wrapper is still a hit target over its whole box.
    const rule = css.slice(css.indexOf('.gmap__canvas--drawing :where('));
    const block = rule.slice(0, rule.indexOf('}') + 1);
    for (const cls of ['.gmap__marker', '.gmap__pin', '.gmap__pin-label', '.gmap__cluster']) {
      expect(block, `${cls} must not swallow a corner`).toContain(cls);
    }
    expect(block).toContain('pointer-events: none');
    // And saved shapes, which are clickable on purpose so they select their point.
    expect(page).toContain('clickable: !drawKind,');
  });

  it('a selected path or area can have its corners grabbed', () => {
    expect(page, "Google's own handles, not a second set of markers")
      .toContain("editable: Boolean(editing) && !drawKind && p.id === selectedId");
    // All three ways a corner changes: dragged, inserted from a midpoint ghost, right-click deleted.
    expect(page).toContain("for (const ev of ['set_at', 'insert_at', 'remove_at'] as const) line.addListener(ev, save);");
  });

  it('one gesture is one save', () => {
    // Dragging a midpoint inserts the corner and then reports it moving, so an uncoalesced listener
    // sends a PATCH per frame.
    const shapes = page.slice(page.indexOf('const line = shape.getPath();'));
    expect(shapes.slice(0, 1200)).toContain('window.clearTimeout(pending)');
    expect(page, 'and a torn-down shape cannot fire one afterwards').toContain('for (const cancel of shapeTimersRef.current) cancel();');
  });

  it('a reshape refuses to save a shape with too few corners', () => {
    expect(page).toContain("const least = point.geometry === 'area' ? 3 : 2;");
    expect(page, 'and puts the corner back rather than keeping a degenerate shape')
      .toContain('if (clean.length < least) {');
  });

  it('a cone is not reshaped by dragging, because its shape is computed', () => {
    // An FOV ring comes from a bearing and a reach; dragging one arc corner would describe something
    // the model cannot store.
    expect(page).toContain("if (p.geometry === 'path' || p.geometry === 'area') {");
  });
});

describe('finishing a shape', () => {
  const page = read('app/admin/map/page.tsx');

  it('keeping it puts the tool down', () => {
    // It used to clear `draw` (the shape being built) but leave `drawKind` (the armed tool), so the
    // next click on the map silently began another path. Cancel and Escape both did this already;
    // Keep it was the one exit that did not.
    const from = page.indexOf('const finishDraw');
    expect(from, 'finishDraw still exists').toBeGreaterThan(-1);
    const finish = page.slice(from, page.indexOf('// ── THE SHAPES THEMSELVES', from));
    expect(finish).toContain('setDraw(null);');
    expect(finish, 'the tool is disarmed too').toContain('setDrawKind(null);');
  });

  it('every other exit from drawing disarms it too', () => {
    expect(page, 'Escape').toContain('if (drawKind) { setDraw(null); setDrawKind(null); return; }');
    expect(page, 'Cancel').toContain("data-testid=\"gmap-draw-cancel\" onClick={() => { setDraw(null); setDrawKind(null); }}");
  });
});
