// __tests__/dnd/map-templates.test.ts — spell areas, parsed from the sheet and drawn on the grid. M5-3.
//
// The parser is tested against the REAL catalogue strings, not invented ones: the point of M5-3 is that
// the map and the sheet cannot disagree about a spell's size, and a parser tested on fixtures I wrote
// would prove agreement with my fixtures rather than with the game.
import { describe, it, expect } from 'vitest';
import {
  CONE_ANGLE_5E, CONE_ANGLE_PF2, coneAngleFor, describeArea, parseArea, parseAreas, templateCells,
} from '@/lib/dnd/maps/templates';
import type { MapGrid } from '@/lib/dnd/maps/grid';
import { SPELLS_2024 } from '@/lib/dnd/spells/dnd5e-2024';

const grid = (over: Partial<MapGrid> = {}): MapGrid => ({
  kind: 'square', size: 5, unitFt: 5, offsetX: 0, offsetY: 0, opacity: 0.3, colour: '#fff', snap: true,
  ...over,
} as MapGrid);

/** Origin on a cell CENTRE, which is where a token stands. */
const O = { x: 2.5, y: 2.5 };

describe('parsing the areas the catalogues already state', () => {
  it('reads 5e’s "Self (15-foot cone)"', () => {
    expect(parseArea('Self (15-foot cone)')).toMatchObject({ shape: 'cone', sizeFt: 15 });
  });

  it('reads every shape 5e writes', () => {
    expect(parseArea('Self (60-foot line)')).toMatchObject({ shape: 'line', sizeFt: 60 });
    expect(parseArea('Self (15-foot cube)')).toMatchObject({ shape: 'cube', sizeFt: 15 });
    expect(parseArea('Self (10-foot radius)')).toMatchObject({ shape: 'radius', sizeFt: 10 });
    expect(parseArea('Self (10-foot emanation)')).toMatchObject({ shape: 'emanation', sizeFt: 10 });
    expect(parseArea('Self (10-foot dome)')).toMatchObject({ shape: 'dome', sizeFt: 10 });
  });

  it('reads 2014’s hyphenated "10-foot-radius sphere"', () => {
    // The 2014 catalogue writes it differently from 2024. A parser that handled only one would silently
    // return nothing for a whole edition.
    expect(parseArea('Self (10-foot-radius sphere)')).toMatchObject({ shape: 'radius', sizeFt: 10 });
  });

  it('reads PF2’s own vocabulary', () => {
    expect(parseArea('20-foot burst')).toMatchObject({ shape: 'burst', sizeFt: 20 });
    expect(parseArea('30-foot emanation')).toMatchObject({ shape: 'emanation', sizeFt: 30 });
    expect(parseArea('60-foot line')).toMatchObject({ shape: 'line', sizeFt: 60 });
  });

  it('returns BOTH areas when PF2 states two', () => {
    // '15-foot cone (1 action) or 30-foot cone (2 actions)' is a real string in the PF2 data. Taking the
    // first silently would make the two-action version cover half the ground it should.
    const areas = parseAreas('15-foot cone (1 action) or 30-foot cone (2 actions)');
    expect(areas).toHaveLength(2);
    expect(areas.map((a) => a.sizeFt)).toEqual([15, 30]);
    expect(areas.every((a) => a.shape === 'cone')).toBe(true);
  });

  it('finds nothing in a plain range, and that is correct', () => {
    // '120 feet' is how far you can cast it, not how big it is. Inventing a 120-foot template here would
    // be the worst failure this file can have.
    for (const text of ['120 feet', 'Touch', 'Self', 'Sight', 'Special', '', null, undefined]) {
      expect(parseArea(text)).toBeNull();
    }
  });

  it('ignores miles — a 5-mile radius is a sensing range, not a template', () => {
    expect(parseArea('Self (5-mile radius)')).toBeNull();
  });

  it('keeps the source words so a surprising template can be traced', () => {
    expect(parseArea('Self (60-foot cone)')!.source).toMatch(/60-foot cone/);
  });
});

describe('against the REAL 2024 catalogue', () => {
  // The parser's whole job is agreeing with data someone else wrote. Running it over the shipped
  // catalogue is the only test that can show it does.
  // Feet only. `Control Weather`'s `Self (5-mile radius)` states an area in MILES, which the parser
  // deliberately ignores — it is a weather system's reach, not a template anyone puts on a battle map.
  const withParens = SPELLS_2024.filter((s) => /\(\d+[-\s]?(?:foot|feet|ft)/i.test(s.range));

  it('finds an area for every spell whose range states one', () => {
    expect(withParens.length).toBeGreaterThan(10);
    const missed = withParens.filter((s) => parseArea(s.range) === null);
    expect(missed.map((s) => `${s.name}: ${s.range}`)).toEqual([]);
  });

  it('never invents an area for a spell that only states a distance', () => {
    // The dangerous direction. A false positive here puts a template on the map for a spell that has none.
    const plain = SPELLS_2024.filter((s) => /^\d+ (feet|mile)/.test(s.range));
    expect(plain.length).toBeGreaterThan(20);
    const invented = plain.filter((s) => parseArea(s.range) !== null);
    expect(invented.map((s) => `${s.name}: ${s.range}`)).toEqual([]);
  });
});

describe('the cone angle is a per-system RULE, not one number for both', () => {
  it('5e’s cone is 53.13° — width equals distance', () => {
    expect(CONE_ANGLE_5E).toBeCloseTo(53.13, 1);
  });

  it('PF2’s cone is a quarter circle', () => {
    expect(CONE_ANGLE_PF2).toBe(90);
  });

  it('picks by system rather than assuming', () => {
    expect(coneAngleFor('pathfinder2e')).toBe(CONE_ANGLE_PF2);
    expect(coneAngleFor('dnd5e-2024')).toBeCloseTo(CONE_ANGLE_5E, 6);
  });

  it('and the wider cone really does cover more ground', () => {
    const base = { shape: 'cone' as const, sizeFt: 30, ...O, grid: grid(), directionDeg: 0 };
    const five = templateCells({ ...base, coneAngleDeg: CONE_ANGLE_5E });
    const pf2 = templateCells({ ...base, coneAngleDeg: CONE_ANGLE_PF2 });
    expect(pf2.cells.length).toBeGreaterThan(five.cells.length);
  });
});

describe('circles', () => {
  it('a 10ft radius on a 5ft grid covers the cells within two squares', () => {
    const r = templateCells({ shape: 'radius', sizeFt: 10, ...O, grid: grid() });
    // Centre-inclusion: a disc of radius 10ft over 5ft cells — the 3×3 block plus the four orthogonal
    // extensions, 13 squares.
    expect(r.cells).toHaveLength(13);
  });

  it('"any overlap" covers more than "centre"', () => {
    // Which one a table uses is a ruling, so both are available and the difference is visible.
    const centre = templateCells({ shape: 'radius', sizeFt: 10, ...O, grid: grid(), inclusion: 'centre' });
    const any = templateCells({ shape: 'radius', sizeFt: 10, ...O, grid: grid(), inclusion: 'any' });
    expect(any.cells.length).toBeGreaterThan(centre.cells.length);
  });

  it('an EMANATION includes the caster’s own square', () => {
    const r = templateCells({ shape: 'emanation', sizeFt: 10, ...O, grid: grid() });
    expect(r.includesOrigin).toBe(true);
    expect(r.cells.some((c) => c.col === 0 && c.row === 0)).toBe(true);
  });

  it('a BURST does not — same circle, different rule at the origin square', () => {
    // This is the one square where treating the two as identical is wrong, and it is the square the
    // caster is standing in.
    const r = templateCells({ shape: 'burst', sizeFt: 10, ...O, grid: grid() });
    expect(r.includesOrigin).toBe(false);
    expect(r.cells.some((c) => c.col === 0 && c.row === 0)).toBe(false);
  });

  it('sphere and dome are drawn as the same circle on a flat map', () => {
    const a = templateCells({ shape: 'sphere', sizeFt: 15, ...O, grid: grid() });
    const b = templateCells({ shape: 'dome', sizeFt: 15, ...O, grid: grid() });
    expect(a.cells.length).toBe(b.cells.length);
  });
});

describe('cones point where they are aimed', () => {
  it('east covers cells to the east and none to the west', () => {
    const r = templateCells({ shape: 'cone', sizeFt: 30, ...O, grid: grid(), directionDeg: 0 });
    expect(r.cells.every((c) => c.col >= 0)).toBe(true);
    expect(r.cells.some((c) => c.col > 0)).toBe(true);
  });

  it('south covers cells below and none above', () => {
    // Screen coordinates: +y is down, so 90° is south.
    const r = templateCells({ shape: 'cone', sizeFt: 30, ...O, grid: grid(), directionDeg: 90 });
    expect(r.cells.every((c) => c.row >= 0)).toBe(true);
  });

  it('rotating by 180° mirrors the count', () => {
    const east = templateCells({ shape: 'cone', sizeFt: 30, ...O, grid: grid(), directionDeg: 0 });
    const west = templateCells({ shape: 'cone', sizeFt: 30, ...O, grid: grid(), directionDeg: 180 });
    expect(west.cells.length).toBe(east.cells.length);
  });

  it('a longer cone covers more', () => {
    const short = templateCells({ shape: 'cone', sizeFt: 15, ...O, grid: grid() });
    const long = templateCells({ shape: 'cone', sizeFt: 60, ...O, grid: grid() });
    expect(long.cells.length).toBeGreaterThan(short.cells.length);
  });
});

describe('lines and cubes', () => {
  it('a 60ft line east is one square wide and TWELVE long, not thirteen', () => {
    // 60ft of 5ft squares is 12 squares. A closed interval would count both ends of a span with room for
    // twelve and draw thirteen — a whole extra square of fireball, every time.
    const r = templateCells({ shape: 'line', sizeFt: 60, ...O, grid: grid(), directionDeg: 0 });
    expect(r.cells.every((c) => c.row === 0)).toBe(true);
    expect(r.cells).toHaveLength(12);
  });

  it('a line does not extend backwards from its origin', () => {
    const r = templateCells({ shape: 'line', sizeFt: 30, ...O, grid: grid(), directionDeg: 0 });
    expect(r.cells.every((c) => c.col >= 0)).toBe(true);
  });

  it('a 15ft cube covers 3×3', () => {
    const r = templateCells({ shape: 'cube', sizeFt: 15, ...O, grid: grid(), directionDeg: 0 });
    expect(r.cells).toHaveLength(9);
  });
});

describe('the grid decides what a foot is', () => {
  it('a 10ft-per-square node halves the squares a 30ft cone spans', () => {
    const fine = templateCells({ shape: 'line', sizeFt: 30, ...O, grid: grid(), directionDeg: 0 });
    const coarse = templateCells({ shape: 'line', sizeFt: 30, x: 5, y: 5, grid: grid({ size: 10, unitFt: 10 }), directionDeg: 0 });
    expect(fine.cells.length).toBeGreaterThan(coarse.cells.length);
  });
});

describe('nothing rather than nonsense', () => {
  it('returns no cells for a zero or negative size', () => {
    for (const sizeFt of [0, -10, NaN]) {
      expect(templateCells({ shape: 'radius', sizeFt, ...O, grid: grid() }).cells).toEqual([]);
    }
  });

  it('returns no cells on a degenerate grid', () => {
    expect(templateCells({ shape: 'radius', sizeFt: 20, ...O, grid: grid({ unitFt: 0 }) }).cells).toEqual([]);
  });
});

describe('the label', () => {
  it('reads the way a player would say it', () => {
    expect(describeArea({ shape: 'cone', sizeFt: 15, source: '15-foot cone' })).toBe('15 ft cone');
  });
});
