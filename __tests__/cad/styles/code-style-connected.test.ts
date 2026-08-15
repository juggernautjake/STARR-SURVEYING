// C22 — style by code.
//
// ── THE SLICE WAS WRITTEN BACKWARDS ─────────────────────────────────────────────────────────────
//
// It reads: "`lib/cad/codes` already maps codes to styles. Make the mapping **editable in the UI
// and previewable**." Both were already true. `CodeStylePanel` is a complete table — search, a
// symbol picker per row, a line-type picker with a live dash preview, a colour swatch, a layer
// select, per-row and global reset, an amber dot on every modified cell — reachable from the menu
// bar and persisted to localStorage.
//
// What was not true is that any of it did anything.
//
//   resolveCodeStyleMapping   the one function answering "what style does this code get"
//                             → zero callers outside the barrel re-export
//   resolveStyle              the file that calls itself the "4-tier style resolution engine",
//                             whose documented tier 2 is the point-code default
//                             → zero callers, anywhere
//
// The canvas resolved feature → layer → constant. There was no code tier. A surveyor could open the
// panel, set FN01 to Barbed Wire in red, close it, and watch the drawing not change — forever, with
// nothing logged and nothing thrown. The editor was the half that existed.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveCodeStyle,
  resolveFeatureCodeStyle,
  featureCode,
  __resetCodeStyleDefaults,
} from '@/lib/cad/styles/code-style-resolve';
import { MASTER_CODE_LIBRARY } from '@/lib/cad/codes/code-library';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature } from '@/lib/cad/types';

/** A code that certainly exists in the library, taken from the library rather than hard-coded so
 *  this file does not break the day someone renumbers it. */
const sample = MASTER_CODE_LIBRARY[0];

const feature = (properties: Record<string, string | number | boolean>): Feature => ({
  id: 'f1',
  type: 'POINT',
  geometry: { type: 'POINT', point: { x: 0, y: 0 } },
  layerId: 'L',
  style: { ...DEFAULT_FEATURE_STYLE },
  properties,
});

beforeEach(() => __resetCodeStyleDefaults());

describe('reading the code off a feature', () => {
  it('finds the canonical slot', () => {
    expect(featureCode(feature({ code: 'FN01' }))).toBe('FN01');
  });

  it('also accepts pointCode', () => {
    // Imported drawings carry it. Matching only the canonical name would silently give every
    // imported feature no code — a whole-import-sized hole that looks like "the mapping doesn't
    // work" rather than like a missing alias.
    expect(featureCode(feature({ pointCode: 'FN01' }))).toBe('FN01');
  });

  it('treats blank and non-string as absent', () => {
    expect(featureCode(feature({ code: '   ' }))).toBeNull();
    expect(featureCode(feature({ code: 42 }))).toBeNull();
    expect(featureCode(feature({}))).toBeNull();
  });
});

describe('resolving a code to a style', () => {
  it('returns the library default', () => {
    const m = resolveCodeStyle(sample.alphaCode);
    expect(m).not.toBeNull();
    expect(m!.codeAlpha).toBe(sample.alphaCode);
  });

  it('matches the numeric form too', () => {
    // A field crew types the alpha code and a data collector emits the numeric one for the same
    // thing. Handling only one halves the coverage in a way nobody would notice until a plat.
    if (!sample.numericCode) return;
    expect(resolveCodeStyle(sample.numericCode)?.codeAlpha).toBe(sample.alphaCode);
  });

  it('matches case-insensitively', () => {
    expect(resolveCodeStyle(sample.alphaCode.toLowerCase())?.codeAlpha).toBe(sample.alphaCode);
  });

  it('returns null for a code the library does not know', () => {
    // So the caller falls through to the layer tier rather than inventing a style for a code
    // nobody defined.
    expect(resolveCodeStyle('NOT_A_CODE')).toBeNull();
    expect(resolveCodeStyle(null)).toBeNull();
    expect(resolveCodeStyle('')).toBeNull();
  });

  it('applies the surveyor’s override on top', () => {
    const m = resolveCodeStyle(sample.alphaCode, {
      [sample.alphaCode]: { lineTypeId: 'FENCE_BARBED_WIRE', lineColor: '#ff0000' },
    });
    expect(m!.lineTypeId).toBe('FENCE_BARBED_WIRE');
    expect(m!.lineColor).toBe('#ff0000');
    expect(m!.isUserModified).toBe(true);
  });

  it('applies an ALPHA-keyed override to a NUMERIC-coded feature', () => {
    // The subtle one. Overrides are keyed by `codeAlpha`; a naive lookup by the incoming string
    // would style hand-typed features and silently skip every one that arrived as a number — from
    // the same edit, on the same drawing.
    if (!sample.numericCode) return;
    const m = resolveCodeStyle(sample.numericCode, {
      [sample.alphaCode]: { lineColor: '#00ff00' },
    });
    expect(m!.lineColor).toBe('#00ff00');
  });

  it('leaves unmodified codes unmodified', () => {
    const m = resolveCodeStyle(sample.alphaCode, { SOMETHING_ELSE: { lineColor: '#ff0000' } });
    expect(m!.isUserModified).toBe(false);
  });

  it('resolves straight from a feature', () => {
    expect(resolveFeatureCodeStyle(feature({ code: sample.alphaCode }))!.codeAlpha)
      .toBe(sample.alphaCode);
    expect(resolveFeatureCodeStyle(feature({}))).toBeNull();
  });
});

describe('the default map is built once', () => {
  it('returns the same object across calls', () => {
    // `resolveCodeStyleMapping` rebuilt a 134-code Map on EVERY call. Fine for a panel that renders
    // once; fatal for a render loop asking per feature per frame — the allocation-per-frame shape
    // C3 measured out of `cullIdSets`. Identity here is the cheap proof the memo holds.
    const a = resolveCodeStyle(sample.alphaCode);
    const b = resolveCodeStyle(sample.alphaCode);
    expect(a).toBe(b);
  });

  it('and a fresh one after the test seam resets it', () => {
    const a = resolveCodeStyle(sample.alphaCode);
    __resetCodeStyleDefaults();
    expect(resolveCodeStyle(sample.alphaCode)).not.toBe(a);
  });

  it('an override does not poison the memoised default', () => {
    // The override path spreads into a new object. If it mutated the cached mapping instead, one
    // surveyor edit would permanently restyle that code for every drawing in the session.
    resolveCodeStyle(sample.alphaCode, { [sample.alphaCode]: { lineColor: '#ff0000' } });
    expect(resolveCodeStyle(sample.alphaCode)!.lineColor).not.toBe('#ff0000');
  });
});

// ── The connect ────────────────────────────────────────────────────────────────────────────────
describe('the canvas actually uses the code tier', () => {
  const code = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/CanvasViewport.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const draw = (() => {
    const start = code.indexOf('function drawFeature');
    const end = code.indexOf('function ', start + 40);
    return code.slice(start, end);
  })();

  it('the slice is looking at drawFeature', () => {
    expect(draw.length).toBeGreaterThan(2000);
    expect(draw).toMatch(/g\.clear\(\)/);
  });

  it('resolves the code style once per feature, not per property read', () => {
    expect((draw.match(/resolveFeatureCodeStyle\(/g) ?? []).length).toBe(1);
  });

  it('line type falls through feature → code → layer → SOLID', () => {
    expect(draw).toMatch(
      /feature\.style\.lineTypeId \?\? codeStyle\?\.lineTypeId \?\? doc\.layers\[feature\.layerId\]\?\.lineTypeId \?\? 'SOLID'/,
    );
  });

  it('colour, weight and symbol all consult the code', () => {
    expect(draw).toMatch(/feature\.style\.color \?\? codeStyle\?\.lineColor/);
    expect(draw).toMatch(/feature\.style\.lineWeight \?\? codeStyle\?\.lineWeight/);
    expect(draw).toMatch(/feature\.style\.symbolId \?\? codeStyle\?\.symbolId/);
  });

  it('the feature override still wins every time', () => {
    // The order is the point. A code tier placed FIRST would overwrite every deliberate per-feature
    // edit the surveyor has ever made, which is a far worse bug than the one being fixed.
    for (const m of draw.matchAll(/codeStyle\?\.(lineTypeId|lineColor|lineWeight|symbolId)/g)) {
      const before = draw.slice(Math.max(0, m.index! - 120), m.index!);
      expect(before, `code tier is not behind a feature override at ${m[0]}`).toMatch(/feature\.style\./);
    }
  });

  it('the overrides are read once per FRAME, not once per feature', () => {
    // `drawFeature` runs for every visible feature. A `getState()` in there would be a store read
    // per feature per frame; renderAll runs once.
    const renderAll = code.slice(code.indexOf('function renderAll'));
    expect(renderAll.slice(0, 900)).toMatch(/codeStyleOverridesRef\.current = useCodeStyleStore\.getState\(\)\.overrides/);
    expect(draw).not.toMatch(/useCodeStyleStore\.getState/);
  });

  it('labels fall through to the code’s text style', () => {
    // C18–C21 gave text a model, a picker and an editor. Without this a code could drive the
    // symbol and the line type but not the typography of the labels it produces — "drives the
    // drawing's appearance" for two axes out of three.
    expect(code).toMatch(/label\.style\.textStyleId[\s\S]{0,200}resolveFeatureCodeStyle\(feature, codeStyleOverridesRef\.current\)\?\.textStyleId/);
  });
});

describe('the panel can set the new axis', () => {
  const panel = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/CodeStylePanel.tsx'), 'utf8',
  );

  it('has a Text Style column', () => {
    expect(panel).toMatch(/>Text Style</);
  });

  it('offers every text style the drawing can see', () => {
    expect(panel).toMatch(/listTextStyles\(customTextStyles \?\? \[\]\)/);
  });

  it('clears the override rather than storing an empty id', () => {
    // A stored '' would resolve as a dangling style — the same rule C20 applied when detaching a
    // TEXT feature.
    expect(panel).toMatch(/setOverride\(m\.codeAlpha, 'textStyleId', e\.target\.value \|\| null\)/);
  });

  it('textStyleId is overridable in the store’s own type', () => {
    // Without this the select would compile against a field the store refuses to persist.
    const store = readFileSync(join(process.cwd(), 'lib/cad/store/code-style-store.ts'), 'utf8');
    expect(store).toMatch(/\| 'textStyleId'/);
  });
});
