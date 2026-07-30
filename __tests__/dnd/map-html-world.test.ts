// __tests__/dnd/map-html-world.test.ts — generated maps for nodes with no art (M2-2).
//
// The owner asked to *"just use the 2d version with html to represent all of the worlds and stuff"*, and
// the property that makes that usable rather than a novelty is DETERMINISM: the same world has to look the
// same every time it is opened, on every device, for every player. A DM says "the big southern continent"
// and is understood; a screenshot in the campaign notes still matches the map a month later.
//
// So the assertions here are about the contract, not the aesthetics: same input → same output, different
// nodes → different pictures, re-tiering genuinely redraws, every shape lands inside the frame, and each
// tier reads as its own scale (a city that looks like a continent has failed even if it is pretty).
import { describe, it, expect } from 'vitest';
import { worldVisual, tierOf, MAP_TIERS, type MapTier } from '@/lib/dnd/maps/html-world';

const ID_A = '7c2f1a4e-0000-4000-8000-000000000001';
const ID_B = '7c2f1a4e-0000-4000-8000-000000000002';

describe('tierOf', () => {
  it('accepts every tier the schema stores', () => {
    for (const t of MAP_TIERS) expect(tierOf(t)).toBe(t);
  });

  it('is case- and whitespace-tolerant', () => {
    expect(tierOf('  City ')).toBe('city');
  });

  it('falls back to `site` — the smallest, least presumptuous scale', () => {
    // Better a plain floor plan than a starfield for something that turned out to be a tavern.
    expect(tierOf('wibble')).toBe('site');
    expect(tierOf(null)).toBe('site');
    expect(tierOf(undefined)).toBe('site');
    expect(tierOf('')).toBe('site');
  });
});

describe('worldVisual — determinism, which is the whole contract', () => {
  it('the same node renders identically every time', () => {
    expect(worldVisual(ID_A, 'world')).toEqual(worldVisual(ID_A, 'world'));
  });

  it('two nodes at the same tier look different', () => {
    // Otherwise every province in a campaign is the same picture, and the generated map stops carrying
    // any information at all.
    const a = worldVisual(ID_A, 'province');
    const b = worldVisual(ID_B, 'province');
    expect(JSON.stringify(a.features)).not.toBe(JSON.stringify(b.features));
  });

  it('re-tiering a node genuinely redraws it', () => {
    // A city promoted to a province must not keep the city's street plan under a province palette — which
    // is why the tier is folded into the seed rather than only selecting the vocabulary.
    const asCity = worldVisual(ID_A, 'city');
    const asProvince = worldVisual(ID_A, 'province');
    expect(asCity.features).not.toEqual(asProvince.features);
    expect(asCity.palette).not.toEqual(asProvince.palette);
  });

  it('reads nothing from the clock or Math.random', () => {
    const before = worldVisual(ID_A, 'space');
    const spy = Math.random;
    // If the generator touched Math.random this would change the output; if it touched Date it would
    // differ across the two calls anyway. Both are asserted by equality after tampering.
    (Math as unknown as { random: () => number }).random = () => 0.5;
    const after = worldVisual(ID_A, 'space');
    (Math as unknown as { random: () => number }).random = spy;
    expect(after).toEqual(before);
  });
});

describe('worldVisual — every tier is well-formed', () => {
  for (const tier of MAP_TIERS) {
    describe(tier, () => {
      const v = worldVisual(ID_A, tier);

      it('produces features', () => {
        expect(v.features.length).toBeGreaterThan(0);
      });

      it('has a palette every feature can index into', () => {
        expect(v.palette.length).toBeGreaterThan(1);
        for (const f of v.features) {
          expect(f.tone, `${tier}: tone ${f.tone} is outside the palette`).toBeGreaterThanOrEqual(0);
          expect(f.tone).toBeLessThan(v.palette.length);
        }
      });

      it('emits only finite numbers — a NaN reaches the DOM as a silently invisible shape', () => {
        for (const f of v.features) {
          for (const [k, n] of Object.entries(f)) {
            if (typeof n === 'number') {
              expect(Number.isFinite(n), `${tier}: ${f.kind}.${k} is ${n}`).toBe(true);
            }
          }
        }
      });

      it('keeps every shape within reach of the 0-100 frame', () => {
        for (const f of v.features) {
          expect(f.x, `${tier}: ${f.kind} x=${f.x}`).toBeGreaterThanOrEqual(-5);
          expect(f.x).toBeLessThanOrEqual(105);
          expect(f.y, `${tier}: ${f.kind} y=${f.y}`).toBeGreaterThanOrEqual(-5);
          expect(f.y).toBeLessThanOrEqual(105);
          expect(f.r, `${tier}: ${f.kind} has a non-positive radius`).toBeGreaterThan(0);
        }
      });

      it('keeps alpha renderable', () => {
        for (const f of v.features) {
          expect(f.alpha).toBeGreaterThan(0);
          expect(f.alpha).toBeLessThanOrEqual(1);
        }
      });

      it('carries an accessible label, so a generated map is not an unlabelled blob', () => {
        expect(v.label.length).toBeGreaterThan(4);
      });

      it('has rgb triples for a palette', () => {
        for (const c of v.palette) expect(c).toMatch(/^\d{1,3},\d{1,3},\d{1,3}$/);
      });
    });
  }
});

describe('worldVisual — each tier reads as its own scale', () => {
  const kindsOf = (t: MapTier) => new Set(worldVisual(ID_A, t).features.map((f) => f.kind));

  it('space is stars and nebulae, and nothing architectural', () => {
    const k = kindsOf('space');
    expect(k.has('star')).toBe(true);
    expect(k.has('nebula')).toBe(true);
    expect(k.has('road')).toBe(false);
    expect(k.has('room')).toBe(false);
  });

  it('a world is a disc with landmasses on it', () => {
    const v = worldVisual(ID_A, 'world');
    expect(v.features[0].kind, 'the ocean disc must be painted first, under everything else').toBe('disc');
    expect(v.features.some((f) => f.kind === 'landmass')).toBe(true);
  });

  it("a world's landmasses stay ON the planet", () => {
    // A continent hanging off the edge of the disc reads as a bug rather than as geography.
    const v = worldVisual(ID_A, 'world');
    const disc = v.features[0];
    for (const f of v.features.filter((x) => x.kind === 'landmass')) {
      const d = Math.hypot(f.x - disc.x, f.y - disc.y);
      expect(d, `landmass at ${d.toFixed(1)} from centre, disc r=${disc.r}`).toBeLessThan(disc.r);
    }
  });

  it('a city has the road lattice that makes it read as a city', () => {
    const k = kindsOf('city');
    expect(k.has('road')).toBe(true);
    expect(k.has('block')).toBe(true);
  });

  it('a site is rooms, not geography', () => {
    const k = kindsOf('site');
    expect(k.has('room')).toBe(true);
    expect(k.has('star')).toBe(false);
    expect(k.has('landmass')).toBe(false);
  });

  it('no two tiers share a palette, so scale is legible at a glance', () => {
    const seen = new Map<string, MapTier>();
    for (const t of MAP_TIERS) {
      const key = worldVisual(ID_A, t).palette.join('|');
      expect(seen.has(key), `${t} shares a palette with ${seen.get(key)}`).toBe(false);
      seen.set(key, t);
    }
  });
});
