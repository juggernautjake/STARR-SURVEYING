// Where a feature actually is, vs where we drew it (research plan R19).
//
// `geometry.engine.ts` placed easements like this, and said so in its own comment:
//
//     "Since easements rarely have explicit traversal coordinates, we render them
//      as labeled horizontal lines spaced below the centroid, inside the property."
//
// So a 20-foot utility easement running along the north line was drawn as a horizontal line through
// the middle of the tract, at a spacing chosen for legibility — carrying a confidence score taken
// from the extraction, which is confidence in the TEXT, not in the position. Nothing marked the
// position as invented. Same failure class as reading dimensions off a superseded plat: not a stale
// answer, a wrong location on a drawing a surveyor takes to the field.
//
// Monuments had a quieter version: placed at `points[sequence_order]`, and silently DROPPED when
// that index did not exist. A called-for monument that vanishes is one nobody goes looking for.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  locateEasement,
  locateMonument,
  parseEasementCall,
  placement,
  sideSegment,
  summariseLocations,
} from '@/lib/research/feature-location';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** A 300 × 200 rectangle. Survey space: +y north, +x east. */
const RECT = [
  { x: 0, y: 0 },      // SW
  { x: 300, y: 0 },    // SE
  { x: 300, y: 200 },  // NE
  { x: 0, y: 200 },    // NW
];

describe('reading a location out of the call', () => {
  it('finds the side when it is attached to a line', () => {
    const c = parseEasementCall('a 20 foot utility easement along the North line of said tract');
    expect(c.side).toBe('north');
    expect(c.widthFt).toBe(20);
    expect(c.purpose).toBe('utility');
  });

  it('does NOT read a bearing as a location', () => {
    // "THENCE North 45 degrees East" is a bearing in a metes-and-bounds recital, not a side of the
    // tract. A speculative parser is worse than none: a null becomes `schematic` and is labelled
    // diagrammatic, while a wrong guess becomes `derived_from_call` and is believed.
    expect(parseEasementCall('THENCE North 45 degrees 12 minutes East, 210.5 feet').side).toBeNull();
  });

  it('reads the forms instruments actually use', () => {
    expect(parseEasementCall('along the westerly boundary').side).toBe('west');
    expect(parseEasementCall('over the Southern property line').side).toBe('south');
    expect(parseEasementCall("a 15' drainage easement").widthFt).toBe(15);
    expect(parseEasementCall('an easement of a width of 30 feet').widthFt).toBe(30);
  });

  it('notices a centreline width, which halves the offset', () => {
    // Getting this backwards doubles the encumbered strip.
    expect(parseEasementCall('20 feet each side of the centerline of said pipeline').centred).toBe(true);
    expect(parseEasementCall('a 20 foot easement along the North line').centred).toBe(false);
  });
});

describe('finding the named side of the tract', () => {
  it('picks the boundary that IS that side', () => {
    const n = sideSegment(RECT, 'north')!;
    expect((n.start.y + n.end.y) / 2).toBe(200);
    const w = sideSegment(RECT, 'west')!;
    expect((w.start.x + w.end.x) / 2).toBe(0);
  });

  it('requires the segment to run in the right direction', () => {
    // A north boundary runs east-west. A "north" segment that runs north-south is not the north
    // side of anything, and a wrong side is a wrong easement.
    const s = sideSegment(RECT, 'north')!;
    expect(Math.abs(s.end.x - s.start.x)).toBeGreaterThan(Math.abs(s.end.y - s.start.y));
  });

  it('refuses a shape with no distinct sides', () => {
    expect(sideSegment([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'north')).toBeNull();
  });
});

describe('placing the easement, or admitting we cannot', () => {
  it('puts a north-line easement on the north line', () => {
    const c = parseEasementCall('a 20 foot utility easement along the North line');
    const l = locateEasement(c, RECT);
    expect(l.placement.basis).toBe('derived_from_call');
    expect(l.placement.isReal).toBe(true);
    // Inside the tract, near the north boundary — not through the middle.
    const midY = (l.segment!.start.y + l.segment!.end.y) / 2;
    expect(midY).toBeLessThan(200);
    expect(midY).toBeGreaterThan(150);
  });

  it('offsets INTO the tract, not out of it', () => {
    const l = locateEasement(parseEasementCall('20 foot easement along the South line'), RECT);
    const midY = (l.segment!.start.y + l.segment!.end.y) / 2;
    expect(midY).toBeGreaterThan(0);
    expect(midY).toBeLessThan(50);
  });

  it('marks an unlocatable easement DIAGRAMMATIC rather than drawing it as found', () => {
    const l = locateEasement(parseEasementCall('a utility easement as shown on the plat'), RECT);
    expect(l.placement.basis).toBe('schematic');
    expect(l.placement.isReal).toBe(false);
    expect(l.placement.note).toContain('DIAGRAMMATIC ONLY');
    expect(l.placement.note).toContain('does not say which boundary');
  });

  it('says the width and side are from text, not from a survey', () => {
    const l = locateEasement(parseEasementCall('a 20 foot easement along the North line'), RECT);
    expect(l.placement.note).toContain('was not surveyed');
  });

  it('lists rather than draws when the named side is not in the traverse', () => {
    const l = locateEasement(parseEasementCall('along the North line'), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(l.placement.basis).toBe('unlocated');
    expect(l.segment).toBeNull();
  });
});

describe('a monument that could not be tied to a corner', () => {
  it('places one that can', () => {
    const m = locateMonument(2, RECT, '1/2 inch iron rod');
    expect(m.position).toEqual({ x: 300, y: 200 });
    expect(m.placement.basis).toBe('traverse_vertex');
  });

  it('keeps one that cannot, instead of dropping it', () => {
    // Finding called-for monuments is most of what a field crew is sent to do.
    const m = locateMonument(99, RECT, '1/2 inch iron rod');
    expect(m.position).toBeNull();
    expect(m.placement.basis).toBe('unlocated');
    expect(m.placement.note).toContain('1/2 inch iron rod');
    expect(m.placement.note).toContain('will not be found by looking at the plat');
  });

  it('handles a missing or nonsense sequence order', () => {
    expect(locateMonument(null, RECT).position).toBeNull();
    expect(locateMonument(-1, RECT).position).toBeNull();
    expect(locateMonument(1.5, RECT).position).toBeNull();
  });
});

describe('the sentence that stops twelve features reading as twelve findings', () => {
  it('leads with what is not located', () => {
    const s = summariseLocations([
      placement('traverse_vertex'), placement('derived_from_call'),
      placement('schematic'), placement('unlocated'),
    ]);
    expect(s.located).toBe(2);
    expect(s.schematic).toBe(1);
    expect(s.unlocated).toBe(1);
    expect(s.headline).toContain('1 drawn diagrammatically');
    expect(s.headline).toContain('1 that could not be placed at all');
    expect(s.headline).toContain('Do not scale off');
  });

  it('says so plainly when everything is placed', () => {
    expect(summariseLocations([placement('traverse_vertex')]).headline).toContain('every one at a computed');
  });
});

describe('the wiring', () => {
  const src = read('lib/research/geometry.engine.ts');

  it('no longer stacks every easement below the centroid', () => {
    expect(src).toContain('locateEasement(call, points)');
    expect(src).toContain('location_basis');
  });

  it('marks a diagrammatic easement on the FACE of the drawing', () => {
    // Whoever reads the plat in the field is not reading the attribute bag.
    expect(src).toContain('(diagrammatic)');
  });

  it('puts the label on the placed line, not at the old centroid offset', () => {
    expect(src).toContain('const labelMid = {');
  });

  it('collects unlocated monuments instead of dropping them', () => {
    expect(src).toContain('unlocatedFeatures.push({');
    expect(src).toContain("kind: 'monument'");
  });

  it('reports locations through an out-parameter, not module state', () => {
    // This repo has been bitten by module-level singletons before.
    expect(src).toContain('locations?: FeatureLocationReport');
    expect(src).not.toMatch(/^let\s+lastFeatureLocation/m);
  });
});
