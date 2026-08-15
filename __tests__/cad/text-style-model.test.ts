// C18 — the font system had no model.
//
// ── WHAT WAS THERE ──────────────────────────────────────────────────────────────────────────────
//
// `TextLabelStyle.fontFamily: string`, set per label, and a parallel copy per layer per label kind
// in `LayerDisplayPreferences` (`bearingTextStyle`, `pointNameTextStyle`, …). Nothing was NAMED.
// "The bearing font" existed only as an identical set of values repeated everywhere a label got
// made, so changing it meant finding every one of those places, and two of them drifting apart was
// invisible until a plat printed.
//
// Line types and symbols each had a definition shape, a built-in library, a custom list on the
// document and a resolver. Text is the third style axis and had none of it.
//
// ── WHAT THIS SLICE IS GRADED ON ────────────────────────────────────────────────────────────────
//
// C18 is the MODEL; C19 adds the editor and picker. The risk specific to a model-only slice is the
// one this doc has recorded four times already — shipping something real with no caller. So the
// tests below cover the library AND the three places that must consume it: the canvas, the DXF
// writer and the PDF writer. A style that renders on screen and exports as Arial is not a style.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILTIN_TEXT_STYLES,
  DEFAULT_TEXT_STYLE_ID,
  getTextStyle,
  listTextStyles,
  resolveTextLabelStyle,
  effectiveWidthFactor,
  effectiveObliqueRadians,
  validateTextStyleName,
} from '@/lib/cad/styles/text-style-library';
import { DEFAULT_TEXT_LABEL_STYLE } from '@/lib/cad/constants';
import type { TextStyleDefinition } from '@/lib/cad/styles/types';
import type { TextLabelStyle } from '@/lib/cad/types';

const custom = (over: Partial<TextStyleDefinition> = {}): TextStyleDefinition => ({
  id: 'FIRM', name: 'Firm Standard', category: 'CUSTOM',
  fontFamily: 'Helvetica', fontSize: 11, fontWeight: 'bold', fontStyle: 'normal',
  widthFactor: 0.9, obliqueAngle: 5,
  isBuiltIn: false, isEditable: true, assignedCodes: [],
  ...over,
});

const label = (over: Partial<TextLabelStyle> = {}): TextLabelStyle => ({
  ...DEFAULT_TEXT_LABEL_STYLE,
  ...over,
});

describe('the library', () => {
  it('mirrors the shape line types and symbols already use', () => {
    // C20 gives all three axes one editor and C22 drives all three from field codes. A fourth
    // shape here would be a fourth thing for both of those slices to special-case.
    for (const s of BUILTIN_TEXT_STYLES) {
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('category');
      expect(s.isBuiltIn).toBe(true);
      expect(s.isEditable).toBe(false);
      expect(Array.isArray(s.assignedCodes)).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = BUILTIN_TEXT_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers what a plat needs, not just one generic style', () => {
    const cats = new Set(BUILTIN_TEXT_STYLES.map((s) => s.category));
    expect([...cats].sort()).toEqual(['ANNOTATION', 'SURVEY', 'TABLE', 'TITLE']);
    expect(BUILTIN_TEXT_STYLES.length).toBeGreaterThanOrEqual(20);
  });

  it('sizes everything in points on paper', () => {
    // The render path divides by 72 and multiplies by the drawing scale. A style stored in world
    // units would be a different physical size on every plot scale — the same defect this codebase
    // already recorded as "written in units nobody produces".
    for (const s of BUILTIN_TEXT_STYLES) {
      expect(s.fontSize, `${s.id}`).toBeGreaterThan(4);
      expect(s.fontSize, `${s.id}`).toBeLessThan(40);
    }
  });

  it('keeps oblique separate from italic', () => {
    // They are different things: italic swaps in a separately drawn typeface, oblique shears the
    // upright one. The cartographic water convention is the sheared upright, so a library that
    // collapsed them could not express it.
    const hydro = getTextStyle('HYDROGRAPHY');
    expect(hydro!.obliqueAngle).toBeGreaterThan(0);
    expect(hydro!.fontStyle).toBe('normal');
  });

  it('names the default so nothing has to guess', () => {
    expect(getTextStyle(DEFAULT_TEXT_STYLE_ID)).not.toBeNull();
  });
});

describe('lookup', () => {
  it('finds built-ins by id', () => {
    expect(getTextStyle('BEARING_DISTANCE')?.name).toBe('Bearing & Distance');
  });

  it('lets a drawing redefine a built-in id', () => {
    // This is what lets a firm ship a drawing whose STANDARD is their standard.
    const mine = custom({ id: 'STANDARD', name: 'Our Standard' });
    expect(getTextStyle('STANDARD', [mine])?.name).toBe('Our Standard');
    expect(listTextStyles([mine]).filter((s) => s.id === 'STANDARD')).toHaveLength(1);
  });

  it('returns null for an unknown id rather than substituting', () => {
    // A silent fallback would render the drawing in the wrong font with no sign the style it asked
    // for is missing. Null lets the caller decide, and the picker can say so.
    expect(getTextStyle('NOT_A_STYLE')).toBeNull();
    expect(getTextStyle(null)).toBeNull();
    expect(getTextStyle(undefined)).toBeNull();
  });

  it('lists custom styles first', () => {
    expect(listTextStyles([custom()])[0].id).toBe('FIRM');
  });
});

describe('resolution', () => {
  it('leaves a label with no style exactly as it was', () => {
    const s = label();
    expect(resolveTextLabelStyle(s)).toEqual(s);
  });

  it('takes all five typographic axes from the named style', () => {
    const r = resolveTextLabelStyle(label({ textStyleId: 'FIRM' }), [custom()]);
    expect(r.fontFamily).toBe('Helvetica');
    expect(r.fontSize).toBe(11);
    expect(r.fontWeight).toBe('bold');
    expect(r.widthFactor).toBe(0.9);
    expect(r.obliqueAngle).toBe(5);
  });

  it('does NOT take colour from the style', () => {
    // A text style carries typography and nothing else. Putting colour in it would give every
    // label two places that set its colour and no rule for which wins.
    const r = resolveTextLabelStyle(label({ textStyleId: 'FIRM', color: '#ff0000' }), [custom()]);
    expect(r.color).toBe('#ff0000');
    expect(custom()).not.toHaveProperty('color');
  });

  it('keeps the label’s background, border and padding', () => {
    const r = resolveTextLabelStyle(
      label({ textStyleId: 'FIRM', backgroundColor: '#fff', padding: 7 }),
      [custom()],
    );
    expect(r.backgroundColor).toBe('#fff');
    expect(r.padding).toBe(7);
  });

  it('leaves a dangling reference alone rather than re-fonting the page', () => {
    const s = label({ textStyleId: 'DELETED_STYLE', fontFamily: 'Courier New' });
    expect(resolveTextLabelStyle(s).fontFamily).toBe('Courier New');
  });
});

describe('the render clamps', () => {
  it('treats a missing width factor as natural', () => {
    // Every label saved before C18 has no such field, and rendering those at scale 0 would make
    // every existing drawing's text vanish.
    expect(effectiveWidthFactor(label())).toBe(1);
    expect(effectiveObliqueRadians(label())).toBe(0);
  });

  it('refuses a zero or negative width', () => {
    // 0 collapses the glyphs to an invisible sliver and a negative mirrors them — both read as
    // "the text disappeared", which is indistinguishable from a bug.
    expect(effectiveWidthFactor(label({ widthFactor: 0 }))).toBeGreaterThan(0);
    expect(effectiveWidthFactor(label({ widthFactor: -2 }))).toBeGreaterThan(0);
    expect(effectiveWidthFactor(label({ widthFactor: 99 }))).toBeLessThanOrEqual(4);
    expect(effectiveWidthFactor(label({ widthFactor: NaN }))).toBe(1);
  });

  it('clamps the shear to something still readable', () => {
    const max = effectiveObliqueRadians(label({ obliqueAngle: 89 }));
    expect(max).toBeCloseTo((60 * Math.PI) / 180, 6);
    expect(effectiveObliqueRadians(label({ obliqueAngle: -89 }))).toBeCloseTo(-max, 6);
  });

  it('converts degrees to radians', () => {
    expect(effectiveObliqueRadians(label({ obliqueAngle: 15 }))).toBeCloseTo(Math.PI / 12, 6);
  });
});

describe('naming', () => {
  it('refuses blank and duplicate names', () => {
    const list = [custom()];
    expect(validateTextStyleName('  ', list)).toMatch(/name/i);
    expect(validateTextStyleName('Firm Standard', list)).toMatch(/already exists/);
    expect(validateTextStyleName('firm standard', list)).toMatch(/already exists/);
    expect(validateTextStyleName('Other', list)).toBeNull();
  });

  it('lets a style keep its own name while being edited', () => {
    expect(validateTextStyleName('Firm Standard', [custom()], 'FIRM')).toBeNull();
  });
});

describe('backward compatibility', () => {
  it('customTextStyles is optional on the document', async () => {
    // The C8 lesson: every drawing saved before this has no such key, and a REQUIRED field would
    // make each of them fail to load — a far worse bug than this feature is a good one.
    const types = readFileSync(join(process.cwd(), 'lib/cad/types.ts'), 'utf8');
    expect(types).toMatch(/customTextStyles\?:/);
    expect(types).toMatch(/textStyleId\?:/);
  });
});

// ── The part that keeps this from being another library with no callers ────────────────────────
describe('the model has consumers', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('the canvas resolves before it reads any font field', () => {
    const v = read('app/admin/cad/components/CanvasViewport.tsx');
    expect(v).toMatch(/const labelStyle = resolveTextLabelStyle\(label\.style, doc\.customTextStyles \?\? \[\]\)/);
    // Scoped to renderLabels, NOT the whole file. The per-label editor further down reads and
    // WRITES `label.style.fontFamily` directly, and must keep doing so — it edits the label's own
    // override, which is a different thing from what gets drawn. A file-wide assertion here would
    // have failed on correct code, the instrument mistake C3's guard made three times.
    const start = v.indexOf('function renderLabels');
    const render = v.slice(start, v.indexOf('function render', start + 40));
    expect(start).toBeGreaterThan(-1);
    expect(render.length).toBeGreaterThan(2000);
    // If the render still read the raw field, a styled label would draw in the old font and the
    // whole model would be decorative.
    expect(render).not.toMatch(/label\.style\.fontFamily/);
    expect(render).not.toMatch(/label\.style\.fontStyle/);
    expect(render).not.toMatch(/label\.style\.fontSize/);
  });

  it('the canvas applies the two axes Pixi has no field for', () => {
    const v = read('app/admin/cad/components/CanvasViewport.tsx');
    expect(v).toMatch(/effectiveWidthFactor\(labelStyle\)/);
    expect(v).toMatch(/effectiveObliqueRadians\(labelStyle\)/);
    // On the display object, not the TextStyle: this runs for every label every frame, and either
    // one on the style would re-rasterise the texture.
    expect(v).toMatch(/textObj\.scale\.set\(wf, 1\)/);
    expect(v).toMatch(/textObj\.skew\.x = shear/);
  });

  it('the DXF writer exports the resolved font, not the raw field', () => {
    const d = read('lib/cad/delivery/dxf-writer.ts');
    expect(d).toMatch(/resolveTextLabelStyle\(label\.style, doc\.customTextStyles \?\? \[\]\)/);
    expect(d).toMatch(/fontStyleName\(ls\.fontFamily\)/);
  });

  it('the DXF STYLE table is built from resolved fonts too', () => {
    // Otherwise the table omits an entry for every label that names a style, and the reading CAD
    // package silently substitutes — the export looks fine right up until someone opens it.
    const d = read('lib/cad/delivery/dxf-writer.ts');
    expect(d).toMatch(/consider\(resolveTextLabelStyle\(l\.style, customTextStyles\)\.fontFamily\)/);
  });

  it('DXF carries width factor and oblique natively', () => {
    const d = read('lib/cad/delivery/dxf-writer.ts');
    expect(d).toMatch(/push\(lines, 41, widthFactor\)/);
    expect(d).toMatch(/push\(lines, 51, obliqueDeg\)/);
    // Only when they differ from the default, so every existing export is byte-for-byte unchanged.
    expect(d).toMatch(/if \(widthFactor !== 1\)/);
    expect(d).toMatch(/if \(obliqueDeg !== 0\)/);
  });

  it('the PDF writer resolves before plotting', () => {
    const p = read('lib/cad/delivery/pdf-writer.ts');
    expect(p).toMatch(/resolveTextLabelStyle\(label\.style, doc\.customTextStyles \?\? \[\]\)/);
    expect(p).toMatch(/applyFont\(pdf, ls\.fontFamily, ls\.fontWeight, ls\.fontStyle\)/);
    expect(p).not.toMatch(/label\.style\.fontFamily/);
  });
});
