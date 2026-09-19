// The four shapes, drawn on the earth, and the colours that tell sheets apart.
//
// Owner, 2026-09-19: "Need to be able to create a single point location, and also a point and its
// corresponding area around it, and a point with a drawn path to another point, and a point with
// field of view lines … Need to be able to assign colors to the different layers so we can tell what
// points are on each layer."
//
// The shapes existed on the image map, where a path was a squiggle and an area was a shape. What is
// new here is that they MEASURE — and measurements are the thing worth testing, because a length
// that is quietly wrong is worse than no length at all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fovRing, isDrawable, needsMore, measureShape, compass, aimFrom, shapePath, translateShape,
  clampFovFeet, FOV_DEFAULT_FEET, FOV_MIN_FEET, FOV_MAX_FEET,
} from '@/lib/jobs/map-shapes-world';
import { distanceFeet, bearingDeg } from '@/lib/jobs/map-world';
import { checkLayerColour, pointColour, LAYER_COLOURS } from '@/lib/jobs/property-map';

const read = (p: string) => readFileSync(p, 'utf8');
const AT = { lat: 30.9, lng: -97.4 };

describe('a camera cone', () => {
  it('opens from where the camera stood and closes back to it', () => {
    const ring = fovRing(AT, 90, 60, 200);
    expect(ring[0]).toEqual(AT);
    expect(ring[ring.length - 1]).toEqual(AT);
    expect(ring.length).toBeGreaterThan(4);
  });

  it('reaches the distance it was given', () => {
    const ring = fovRing(AT, 0, 60, 300);
    // The middle of the arc is straight ahead, at the full reach.
    const mid = ring[Math.floor(ring.length / 2)];
    expect(distanceFeet(AT, mid)).toBeGreaterThan(280);
    expect(distanceFeet(AT, mid)).toBeLessThan(320);
  });

  it('points where it was aimed', () => {
    const ring = fovRing(AT, 90, 40, 200);
    const mid = ring[Math.floor(ring.length / 2)];
    expect(bearingDeg(AT, mid)).toBeCloseTo(90, 0);
  });

  it('clamps a silly reach rather than drawing to the horizon', () => {
    expect(clampFovFeet(1)).toBe(FOV_MIN_FEET);
    expect(clampFovFeet(999_999)).toBe(FOV_MAX_FEET);
    expect(clampFovFeet(NaN)).toBe(FOV_DEFAULT_FEET);
    expect(clampFovFeet(null)).toBe(FOV_DEFAULT_FEET);
    expect(clampFovFeet(200)).toBe(200);
  });

  it('is aimed by where the second click landed', () => {
    const to = { lat: 30.9, lng: -97.399 };
    const aim = aimFrom(AT, to);
    expect(aim.bearing).toBeCloseTo(90, 0);
    expect(aim.feet).toBeGreaterThan(200);
  });
});

describe('when a shape is finished enough to keep', () => {
  it('a path needs somewhere to go; an area needs to enclose something', () => {
    expect(isDrawable('point', 0)).toBe(true);
    expect(isDrawable('fov', 0)).toBe(true);
    expect(isDrawable('path', 0)).toBe(false);
    expect(isDrawable('path', 1)).toBe(true);
    expect(isDrawable('area', 1)).toBe(false);
    expect(isDrawable('area', 2), 'anchor plus two corners is a triangle').toBe(true);
  });

  it('says what is still needed, rather than just refusing', () => {
    expect(needsMore('path', 0)).toBe('Click where the path goes next.');
    expect(needsMore('path', 1)).toBeNull();
    expect(needsMore('area', 0)).toBe('Click the second corner.');
    expect(needsMore('area', 1)).toBe('Click one more corner.');
    expect(needsMore('area', 2)).toBeNull();
  });
});

describe('what a shape measures on the ground', () => {
  it('a path adds up its legs, in feet', () => {
    const m = measureShape('path', AT, [{ lat: 30.901, lng: -97.4 }, { lat: 30.902, lng: -97.4 }]);
    expect(m?.feet).toBe(728); // two legs of 364 ft
    expect(m?.label).toBe('2 legs · 728 ft');
  });

  it('one leg is singular', () => {
    expect(measureShape('path', AT, [{ lat: 30.901, lng: -97.4 }])?.label).toBe('1 leg · 364 ft');
  });

  it('a path with nowhere to go measures nothing', () => {
    expect(measureShape('path', AT, [])).toBeNull();
  });

  it('an area gives square feet and acres', () => {
    // A square about 500 ft on a side — a shade under 5.75 acres.
    const d = 500 / 364_000;
    const k = 1 / Math.cos((30.9 * Math.PI) / 180);
    const m = measureShape('area', AT, [
      { lat: 30.9 + d, lng: -97.4 },
      { lat: 30.9 + d, lng: -97.4 + d * k },
      { lat: 30.9, lng: -97.4 + d * k },
    ]);
    expect(m?.acres).toBeGreaterThan(5.4);
    expect(m?.acres).toBeLessThan(6.0);
    expect(m?.label).toMatch(/acres/);
  });

  it('a sliver reports square feet rather than "0 acres"', () => {
    const d = 20 / 364_000;
    const m = measureShape('area', AT, [{ lat: 30.9 + d, lng: -97.4 }, { lat: 30.9, lng: -97.4 + d }]);
    expect(m?.label).toMatch(/sq ft$/);
    expect(m?.label).not.toMatch(/0 acres/);
  });

  it('an unclosed area measures nothing', () => {
    expect(measureShape('area', AT, [{ lat: 30.901, lng: -97.4 }])).toBeNull();
  });

  it('a cone reports its spread, its reach and its bearing', () => {
    const m = measureShape('fov', AT, [], { bearing: 45, spreadDeg: 68, feet: 200 });
    expect(m?.label).toContain('68°');
    expect(m?.label).toContain('200');
    expect(m?.label).toContain('NE');
  });
});

describe('a compass point, because a surveyor reads one faster than three digits', () => {
  it('names the direction', () => {
    expect(compass(0)).toBe('N 0°');
    expect(compass(90)).toBe('E 90°');
    expect(compass(180)).toBe('S 180°');
    expect(compass(270)).toBe('W 270°');
    expect(compass(45)).toBe('NE 45°');
  });

  it('wraps rather than producing "N 400°"', () => {
    expect(compass(360)).toBe('N 0°');
    expect(compass(-90)).toBe('W 270°');
  });
});

describe('the path handed to the map', () => {
  it('starts at the anchor for a path and an area', () => {
    expect(shapePath('path', AT, [{ lat: 30.901, lng: -97.4 }])[0]).toEqual(AT);
    expect(shapePath('area', AT, [{ lat: 30.901, lng: -97.4 }])[0]).toEqual(AT);
  });

  it('a plain point is just itself — nothing to stroke', () => {
    expect(shapePath('point', AT, [])).toEqual([AT]);
  });
});

describe('layer colours', () => {
  it('takes a hex colour and normalises it', () => {
    expect(checkLayerColour('#f59e0b')).toEqual({ ok: true, value: '#F59E0B' });
  });

  it('treats empty as "no opinion", which is a real state', () => {
    // Null means "colour these by point type" — the state every map was in before this existed, and
    // the one a truthiness check would make impossible to go back to.
    expect(checkLayerColour(null)).toEqual({ ok: true, value: null });
    expect(checkLayerColour('')).toEqual({ ok: true, value: null });
    expect(checkLayerColour(undefined)).toEqual({ ok: true, value: null });
  });

  it('refuses anything that is not #RRGGBB', () => {
    expect(checkLayerColour('red').ok).toBe(false);
    expect(checkLayerColour('#fff').ok).toBe(false);
    expect(checkLayerColour('#12345').ok).toBe(false);
    expect(checkLayerColour('var(--x)').ok).toBe(false);
    expect(checkLayerColour(0x123456).ok).toBe(false);
  });

  it('the palette offers "by point type" first, and real hexes after', () => {
    expect(LAYER_COLOURS[0].hex).toBe('');
    expect(LAYER_COLOURS.slice(1).every((c) => /^#[0-9A-F]{6}$/i.test(c.hex))).toBe(true);
  });

  it('the layer wins when it has a colour, the point type when it does not', () => {
    const byType = (t: string) => `type:${t}`;
    const base = { id: 'base', isDefault: true, colour: null as string | null };
    const orange = { id: 'utils', isDefault: false, colour: '#F97316' };
    expect(pointColour({ pointType: 'utility', layerId: 'utils' }, [base, orange], byType as never)).toBe('#F97316');
    expect(pointColour({ pointType: 'utility', layerId: 'base' }, [base, orange], byType as never)).toBe('type:utility');
    // A point on no sheet reads as the default one, which here has no colour.
    expect(pointColour({ pointType: 'fence', layerId: null }, [base, orange], byType as never)).toBe('type:fence');
  });
});

describe('the wiring', () => {
  it('the database will only take a hex colour', () => {
    const seed = read('seeds/648_job_map_layer_colours.sql');
    expect(seed).toContain("colour ~ '^#[0-9A-Fa-f]{6}$'");
  });

  it('the route lets a colour be cleared, not only set', () => {
    const route = read('app/api/admin/jobs/[id]/property-map/layers/route.ts');
    expect(route).toContain("if ('colour' in body)");
    expect(route).toContain('checkLayerColour(body.colour)');
  });

  it('vertices are places now, and anything else is dropped', () => {
    const route = read('app/api/admin/jobs/[id]/property-map/points/route.ts');
    expect(route).toContain('if (isLatLng(v)) out.push(roundLatLng(');
    const server = read('lib/jobs/property-map-server.ts');
    expect(server).toContain('if (isLatLng(p)) out.push(roundLatLng(');
  });

  it('the old image map is gone, and its URL redirects rather than 404s', () => {
    const legacy = read('app/admin/jobs/[id]/map/page.tsx');
    expect(legacy).toContain('redirect(`/admin/map?job=');
    expect(legacy.length, 'it is a redirect, not the old 5,000-line page').toBeLessThan(2000);
  });
});

describe('moving a point moves what is attached to it', () => {
  // Owner, 2026-09-19: "I need to be able to grab existing points and move them around."
  //
  // Vertices are absolute positions, not offsets from the anchor. Move only the anchor and a walked
  // path stays exactly where it was with its first corner torn off and dropped somewhere else.
  const from = { lat: 30.9, lng: -97.4 };
  const to = { lat: 30.91, lng: -97.39 };

  it('shifts every vertex by the same delta the anchor moved', () => {
    const moved = translateShape(from, to, [
      { lat: 30.901, lng: -97.4 },
      { lat: 30.902, lng: -97.399 },
    ]);
    expect(moved[0].lat).toBeCloseTo(30.911, 6);
    expect(moved[0].lng).toBeCloseTo(-97.39, 6);
    expect(moved[1].lat).toBeCloseTo(30.912, 6);
    expect(moved[1].lng).toBeCloseTo(-97.389, 6);
  });

  it('keeps the shape the same shape', () => {
    const shape = [{ lat: 30.901, lng: -97.4 }, { lat: 30.902, lng: -97.399 }];
    const before = measureShape('path', from, shape)!;
    const after = measureShape('path', to, translateShape(from, to, shape))!;
    // A path that changes length when you slide it across the map is not the same path.
    expect(after.feet).toBe(before.feet);
  });

  it('keeps an area the same size', () => {
    const ring = [
      { lat: 30.901, lng: -97.4 },
      { lat: 30.901, lng: -97.399 },
      { lat: 30.9, lng: -97.399 },
    ];
    const before = measureShape('area', from, ring)!;
    const after = measureShape('area', to, translateShape(from, to, ring))!;
    // Not exactly equal: a degree of longitude is shorter further north, so a hundredth of a degree
    // of latitude genuinely changes the ground area a little. It must not change MUCH.
    expect(after.squareFeet! / before.squareFeet!).toBeGreaterThan(0.999);
    expect(after.squareFeet! / before.squareFeet!).toBeLessThan(1.001);
  });

  it('has nothing to do for a plain point or a cone', () => {
    // A cone's bearing and reach are relative to the anchor already, so it simply points the same
    // way from the new place.
    expect(translateShape(from, to, [])).toEqual([]);
  });

  it('a move to where it already is changes nothing', () => {
    const shape = [{ lat: 30.901, lng: -97.4 }];
    expect(translateShape(from, from, shape)).toEqual(shape);
  });
});
