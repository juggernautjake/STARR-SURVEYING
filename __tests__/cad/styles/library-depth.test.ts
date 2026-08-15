// C21 — library depth pass.
//
// ── WHAT THE MEASUREMENT FOUND ──────────────────────────────────────────────────────────────────
//
// The counts in the plan held — 40 line types, 48 symbols — and the DISTRIBUTION did not.
//
// Line types: 9 basic dash patterns, 9 symbol-in-line patterns, 12 fences, 5 "utility" entries of
// which FOUR were shot-marker helpers rather than utility runs, and 5 specialty. Which is to say a
// boundary-survey product had **no boundary line types**: no section line, no right-of-way, no
// easement, no setback, no lot line, no tie line. And no topo ones: no contour, no edge of
// pavement, no top of bank, no tree line. A surveyor drawing an easement picked "Dashed" and
// remembered what they meant by it — the un-named-style problem C18 fixed for fonts, one axis over.
//
// Symbols: 25 of the 48 were monuments, while STRUCTURE and CURVE were declared in
// `SymbolDefinition['category']` and had **zero members** — categories the picker already drew a
// heading for and then had nothing to put under.
//
// ── WHY THIS TEST IS MOSTLY INTEGRITY, NOT INVENTORY ────────────────────────────────────────────
//
// Asserting "there is an entry called Easement" is worth one line. The failures that actually cost
// a surveyor something are structural: a line type pointing at a symbol id that does not exist
// (draws no mark, throws nothing), two line types claiming the same field code (C22 would pick one
// and the other would silently never apply), a category the picker renders a heading for and then
// leaves empty.

import { describe, it, expect } from 'vitest';
import { BUILTIN_LINE_TYPES } from '@/lib/cad/styles/linetype-library';
import { BUILTIN_SYMBOLS } from '@/lib/cad/styles/symbol-library';
import type { LineTypeDefinition, SymbolDefinition } from '@/lib/cad/styles/types';

const symbolIds = new Set(BUILTIN_SYMBOLS.map((s) => s.id));
const lineTypeIds = new Set(BUILTIN_LINE_TYPES.map((l) => l.id));
const byId = (id: string) => BUILTIN_LINE_TYPES.find((l) => l.id === id);

describe('integrity', () => {
  it('every inline symbol a line type asks for actually exists', () => {
    // The quiet one. A dangling `symbolId` renders the dashes and simply no marks — a barbed-wire
    // fence that draws as a plain dashed line, with nothing logged and nothing thrown.
    const dangling: string[] = [];
    for (const lt of BUILTIN_LINE_TYPES) {
      for (const s of lt.inlineSymbols) {
        if (!symbolIds.has(s.symbolId)) dangling.push(`${lt.id} → ${s.symbolId}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('ids are unique across both libraries', () => {
    expect(lineTypeIds.size).toBe(BUILTIN_LINE_TYPES.length);
    expect(symbolIds.size).toBe(BUILTIN_SYMBOLS.length);
  });

  it('no field code is claimed by two line types', () => {
    // C22 maps codes to styles. Two claimants means one of them silently never applies, and which
    // one depends on array order — a bug that would look like "the style just doesn't work".
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const lt of BUILTIN_LINE_TYPES) {
      for (const c of lt.assignedCodes) {
        const prev = seen.get(c);
        if (prev) clashes.push(`${c}: ${prev} vs ${lt.id}`);
        else seen.set(c, lt.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('no field code is claimed by two symbols', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const s of BUILTIN_SYMBOLS) {
      for (const c of s.assignedCodes) {
        const prev = seen.get(c);
        if (prev) clashes.push(`${c}: ${prev} vs ${s.id}`);
        else seen.set(c, s.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('every built-in is flagged built-in and not editable', () => {
    // An editable "built-in" would let one drawing redefine what every other drawing means by
    // "Easement".
    for (const lt of BUILTIN_LINE_TYPES) {
      expect(lt.isBuiltIn, lt.id).toBe(true);
      expect(lt.isEditable, lt.id).toBe(false);
    }
    for (const s of BUILTIN_SYMBOLS) {
      expect(s.isBuiltIn, s.id).toBe(true);
      expect(s.isEditable, s.id).toBe(false);
    }
  });

  it('no symbol has an empty paths array', () => {
    // A definition with no paths is invisible: it occupies a slot in the picker, renders a blank
    // thumbnail, and places nothing on the drawing.
    for (const s of BUILTIN_SYMBOLS) {
      expect(s.paths.length, s.id).toBeGreaterThan(0);
    }
  });

  it('no size range is inverted', () => {
    for (const s of BUILTIN_SYMBOLS) {
      expect(s.minSize, s.id).toBeLessThanOrEqual(s.defaultSize);
      expect(s.defaultSize, s.id).toBeLessThanOrEqual(s.maxSize);
    }
  });

  it('every dash pattern is positive — a zero-length dash loops forever', () => {
    for (const lt of BUILTIN_LINE_TYPES) {
      for (const d of lt.dashPattern) {
        expect(d, `${lt.id} has a non-positive dash segment`).toBeGreaterThan(0);
      }
    }
  });
});

describe('no declared category is empty', () => {
  // The specific defect C21 found: the picker renders a heading per declared category, so an empty
  // one is a heading with nothing under it — worse than the category not existing, because it
  // reads as "this drawing has none of those" rather than "this product has none of those".
  const symbolCats: SymbolDefinition['category'][] = [
    'MONUMENT_FOUND', 'MONUMENT_SET', 'MONUMENT_CALC', 'CONTROL', 'UTILITY',
    'VEGETATION', 'STRUCTURE', 'FENCE_INLINE', 'CURVE', 'GENERIC',
  ];
  const lineCats: LineTypeDefinition['category'][] = [
    'BASIC', 'PATTERN', 'FENCE', 'UTILITY', 'BOUNDARY', 'TOPO', 'SPECIALTY',
  ];

  it.each(symbolCats)('symbol category %s has members', (cat) => {
    expect(BUILTIN_SYMBOLS.filter((s) => s.category === cat).length).toBeGreaterThan(0);
  });

  it.each(lineCats)('line type category %s has members', (cat) => {
    expect(BUILTIN_LINE_TYPES.filter((l) => l.category === cat).length).toBeGreaterThan(0);
  });

  it('CUSTOM stays empty in the BUILT-IN libraries', () => {
    // CUSTOM is where a drawing's own definitions land. A built-in sitting in it would be
    // undeletable clutter in every drawing.
    expect(BUILTIN_SYMBOLS.filter((s) => s.category === 'CUSTOM')).toEqual([]);
    expect(BUILTIN_LINE_TYPES.filter((l) => l.category === 'CUSTOM')).toEqual([]);
  });
});

describe('a boundary survey can be drawn', () => {
  // Each of these was absent before C21. Not an inventory for its own sake: this is the list a
  // plat cannot be filed without.
  const required = [
    'BOUNDARY_SUBJECT', 'BOUNDARY_ADJOINER', 'SECTION_LINE', 'QUARTER_SECTION',
    'RIGHT_OF_WAY', 'LOT_LINE', 'EASEMENT', 'EASEMENT_UTILITY', 'EASEMENT_DRAINAGE',
    'BUILDING_SETBACK', 'TIE_LINE', 'CENTERLINE_ROAD',
  ];

  it.each(required)('%s exists and is in the BOUNDARY category', (id) => {
    expect(byId(id), `${id} missing`).toBeDefined();
    expect(byId(id)!.category).toBe('BOUNDARY');
  });

  it('weights say which line is the property line', () => {
    // The convention, and the reason weight is on the definition at all: the subject tract is the
    // heaviest line on the sheet and a tie is the lightest, because a tie is a measurement and
    // must never read as a boundary on a plat someone may rely on.
    const w = (id: string) => byId(id)!.lineWeight ?? 0;
    expect(w('BOUNDARY_SUBJECT')).toBeGreaterThan(w('BOUNDARY_ADJOINER'));
    expect(w('BOUNDARY_ADJOINER')).toBeGreaterThan(w('TIE_LINE'));
    expect(w('BOUNDARY_SUBJECT')).toBeGreaterThan(w('EASEMENT'));
  });

  it('the subject boundary and lot lines are solid', () => {
    expect(byId('BOUNDARY_SUBJECT')!.dashPattern).toEqual([]);
    expect(byId('LOT_LINE')!.dashPattern).toEqual([]);
  });

  it('the deed line and every easement are dashed', () => {
    for (const id of ['BOUNDARY_ADJOINER', 'EASEMENT', 'EASEMENT_UTILITY', 'EASEMENT_DRAINAGE', 'BUILDING_SETBACK']) {
      expect(byId(id)!.dashPattern.length, id).toBeGreaterThan(0);
    }
  });
});

describe('a topo can be drawn', () => {
  const required = [
    'CONTOUR_INDEX', 'CONTOUR_INTERMEDIATE', 'CONTOUR_DEPRESSION',
    'EDGE_PAVEMENT', 'EDGE_GRAVEL', 'CURB_LINE', 'SIDEWALK', 'BUILDING_OUTLINE',
    'DITCH_SWALE', 'TOP_OF_BANK', 'TOE_OF_SLOPE', 'WATER_EDGE', 'TREE_LINE',
  ];

  it.each(required)('%s exists and is in the TOPO category', (id) => {
    expect(byId(id), `${id} missing`).toBeDefined();
    expect(byId(id)!.category).toBe('TOPO');
  });

  it('the index contour is heavier than the intermediate', () => {
    // That difference IS how a contour map is read; equal weights make the interval unreadable.
    expect(byId('CONTOUR_INDEX')!.lineWeight!)
      .toBeGreaterThan(byId('CONTOUR_INTERMEDIATE')!.lineWeight!);
  });

  it('the depression contour is distinguishable from a plain one', () => {
    expect(byId('CONTOUR_DEPRESSION')!.dashPattern.length).toBeGreaterThan(0);
    expect(byId('CONTOUR_INDEX')!.dashPattern).toEqual([]);
  });
});

describe('utility runs, not just utility shot markers', () => {
  const runs = [
    ['UG_ELECTRIC', '#FF0000'],
    ['OH_ELECTRIC', '#FF0000'],
    ['UG_TELEPHONE', '#FF8C00'],
    ['UG_FIBER', '#FF8C00'],
    ['UG_CABLE_TV', '#FF8C00'],
    ['UG_GAS', '#FFD700'],
    ['UG_WATER', '#0000FF'],
    ['SANITARY_SEWER', '#00A550'],
    ['STORM_SEWER', '#00A550'],
    ['FORCE_MAIN', '#00A550'],
    ['IRRIGATION', '#800080'],
  ] as const;

  it.each(runs)('%s uses the APWA colour %s', (id, color) => {
    // APWA is the code a locator paints the ground with, and a plat that disagrees with the paint
    // is worse than a plat with no colour at all.
    expect(byId(id), `${id} missing`).toBeDefined();
    expect(byId(id)!.color).toBe(color);
  });

  it('every run except irrigation carries its letter', () => {
    // Colour alone fails the moment the plat prints in black and white, which is how a plat is
    // filed. Irrigation is the one exception — it has no standard letter.
    for (const [id] of runs) {
      if (id === 'IRRIGATION') continue;
      expect(byId(id)!.inlineSymbols.length, `${id} has no inline letter`).toBeGreaterThan(0);
    }
  });

  it('the letters resolve to real TEXT symbols', () => {
    for (const [id] of runs) {
      for (const s of byId(id)!.inlineSymbols) {
        const sym = BUILTIN_SYMBOLS.find((x) => x.id === s.symbolId)!;
        expect(sym, `${id} → ${s.symbolId}`).toBeDefined();
        expect(sym.paths.some((p) => p.type === 'TEXT'), s.symbolId).toBe(true);
      }
    }
  });

  it('gravity sewer and force main are told apart by pattern, not only by letter', () => {
    // They fail differently, and a contractor digging near one needs to know which it is — but
    // they share the green APWA colour and the SS letter, so the dash pattern has to carry it.
    expect(byId('FORCE_MAIN')!.dashPattern).not.toEqual(byId('SANITARY_SEWER')!.dashPattern);
  });

  it('the original shot-marker helpers are still there', () => {
    // They were miscategorised, not wrong. Removing them would break drawings that use them.
    for (const id of ['UTIL_POLE_LINE', 'FENCE_SHOTS_X', 'SHOT_DOTS', 'OVERHEAD_UTILITY']) {
      expect(byId(id), `${id} was dropped`).toBeDefined();
    }
  });
});

describe('the symbol side of the pass', () => {
  const has = (id: string) => BUILTIN_SYMBOLS.some((s) => s.id === id);

  it('structures exist at all now', () => {
    for (const id of ['STR_BUILDING', 'STR_SHED', 'STR_CULVERT', 'STR_HEADWALL', 'STR_MAILBOX', 'STR_SIGN', 'STR_WELL', 'STR_SEPTIC']) {
      expect(has(id), id).toBe(true);
    }
  });

  it('curve points can be marked', () => {
    // A curve table referencing a PC the plat never marks is a table nobody can check.
    for (const id of ['CURVE_PC', 'CURVE_PT', 'CURVE_PI', 'CURVE_RP']) {
      expect(has(id), id).toBe(true);
    }
  });

  it('the utility appurtenances a topo shoots are covered', () => {
    for (const id of [
      'UTIL_STORM_MANHOLE', 'UTIL_SAN_MANHOLE', 'UTIL_CATCH_BASIN', 'UTIL_LIGHT_POLE',
      'UTIL_GUY_WIRE', 'UTIL_TRANSFORMER', 'UTIL_ELEC_METER', 'UTIL_GAS_METER',
      'UTIL_GAS_VALVE', 'UTIL_TEL_PEDESTAL',
    ]) {
      expect(has(id), id).toBe(true);
    }
  });

  it('storm and sanitary manholes are distinguishable', () => {
    // Both are a circle in the ground. The label is the whole difference, and getting it wrong on
    // a plat sends a crew to open the wrong lid.
    const sd = BUILTIN_SYMBOLS.find((s) => s.id === 'UTIL_STORM_MANHOLE')!;
    const ss = BUILTIN_SYMBOLS.find((s) => s.id === 'UTIL_SAN_MANHOLE')!;
    const text = (s: SymbolDefinition) => s.paths.find((p) => p.type === 'TEXT')?.text;
    expect(text(sd)).toBe('SD');
    expect(text(ss)).toBe('SS');
  });

  it('vegetation covers more than two tree shapes', () => {
    expect(BUILTIN_SYMBOLS.filter((s) => s.category === 'VEGETATION').length).toBeGreaterThanOrEqual(5);
  });

  it('control says how the point was established', () => {
    expect(has('CTRL_GPS')).toBe(true);
    expect(has('CTRL_TBM')).toBe(true);
  });
});

describe('the pass actually deepened things', () => {
  it('both libraries grew past their pre-C21 size', () => {
    // The plan measured 40 and 48. A regression that dropped entries would otherwise pass every
    // named-id check above by coincidence of ordering.
    expect(BUILTIN_LINE_TYPES.length).toBeGreaterThan(40);
    expect(BUILTIN_SYMBOLS.length).toBeGreaterThan(48);
  });

  it('monuments are no longer half the symbol library', () => {
    // 25 of 48 before. The imbalance was the finding, not the count.
    const mon = BUILTIN_SYMBOLS.filter((s) => s.category.startsWith('MONUMENT')).length;
    expect(mon / BUILTIN_SYMBOLS.length).toBeLessThan(0.5);
  });
});
