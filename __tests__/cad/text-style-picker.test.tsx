// C19 — the control that makes C18's model reachable.
//
// ── WHY THIS SLICE EXISTS ───────────────────────────────────────────────────────────────────────
//
// C18 built `TextStyleDefinition`, the built-in library and `resolveTextLabelStyle`, and wired the
// canvas and both exporters to read through it. But **nothing could set `textStyleId`**, so every
// label in every drawing still carried none and every one of those code paths took its
// "no named style" branch forever. A model with no way to select from it is a model with no users.
//
// ── WHAT IS ACTUALLY BEING CHECKED ──────────────────────────────────────────────────────────────
//
// The picker's own logic is testable for real (it renders through react-dom/server like the rest
// of this repo's component tests), so the sample, the grouping and the detach behaviour are
// exercised rather than scanned. The two mount points are source-scanned, because both live inside
// components bound to a live canvas or a live store.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import TextStylePicker, { NO_TEXT_STYLE, sampleTransform } from '@/app/admin/cad/components/TextStylePicker';
import { DEFAULT_TEXT_LABEL_STYLE } from '@/lib/cad/constants';
import { resolveTextLabelStyle } from '@/lib/cad/styles/text-style-library';
import type { TextStyleDefinition } from '@/lib/cad/styles/types';
import type { TextLabelStyle } from '@/lib/cad/types';

const label = (over: Partial<TextLabelStyle> = {}): TextLabelStyle => ({
  ...DEFAULT_TEXT_LABEL_STYLE,
  ...over,
});

const firmStyle: TextStyleDefinition = {
  id: 'FIRM', name: 'Firm Standard', category: 'CUSTOM',
  fontFamily: 'Helvetica', fontSize: 13, fontWeight: 'bold', fontStyle: 'normal',
  widthFactor: 0.8, obliqueAngle: 20,
  isBuiltIn: false, isEditable: true, assignedCodes: [],
};

const html = (props: Partial<React.ComponentProps<typeof TextStylePicker>> = {}) =>
  ReactDOMServer.renderToStaticMarkup(
    <TextStylePicker value={label()} onChange={() => {}} {...props} />,
  );

describe('the picker offers the library', () => {
  it('groups the built-ins so a 20-style list stays navigable', () => {
    const out = html();
    for (const g of ['Annotation', 'Survey', 'Titles', 'Tables &amp; legends']) {
      expect(out, `missing group ${g}`).toContain(`label="${g}"`);
    }
  });

  it('names a drawing’s own styles as belonging to the drawing', () => {
    expect(html({ customStyles: [firmStyle] })).toContain('label="This drawing"');
    expect(html({ customStyles: [firmStyle] })).toContain('Firm Standard');
  });

  it('offers an explicit "no named style" option, not a blank one', () => {
    // An empty `value=""` is indistinguishable from "nothing selected" when reading the DOM, which
    // makes both this test and any screenshot of the panel ambiguous.
    const out = html();
    expect(out).toContain(`value="${NO_TEXT_STYLE}"`);
    expect(out).toContain('Custom (this label only)');
  });

  it('shows a style that no longer exists instead of silently reverting', () => {
    // A drawing referring to a deleted style is a real state, and quietly showing "Custom" would
    // hide the fact that the reference is dangling — the surveyor would never know to fix it.
    const out = html({ value: label({ textStyleId: 'DELETED' }) });
    expect(out).toContain('DELETED (missing)');
  });
});

describe('the live sample', () => {
  it('renders the resolved typography, not a description of it', () => {
    const out = html({ value: label({ textStyleId: 'FIRM' }), customStyles: [firmStyle] });
    expect(out).toContain('Helvetica');
    expect(out).toMatch(/font-weight:\s*bold/);
  });

  it('shows the two axes CSS has no font property for', () => {
    const out = html({ value: label({ textStyleId: 'FIRM' }), customStyles: [firmStyle] });
    expect(out).toMatch(/scaleX\(0\.8\)/);
    expect(out).toMatch(/skewX\(-20deg\)/);
  });

  it('leans oblique the same way the canvas does', () => {
    // Both CSS and Pixi have y growing downward, so a POSITIVE skew leans the glyph's top LEFT.
    // A sample that leaned the opposite way from the drawing would be worse than no sample: the
    // surveyor would pick the style that looked right and get the mirror of it on the plat.
    expect(sampleTransform(label({ obliqueAngle: 15 }))).toContain('skewX(-15deg)');
    expect(sampleTransform(label({ obliqueAngle: -15 }))).toContain('skewX(15deg)');
  });

  it('stays untransformed for an ordinary upright style', () => {
    expect(sampleTransform(label())).toBe('none');
  });
});

describe('detaching bakes the values in', () => {
  // The behaviour that decides whether "Custom" is usable at all.
  function pickCustom(start: TextLabelStyle, custom: TextStyleDefinition[]) {
    let got: TextLabelStyle | null = null;
    // Reproduces the component's own handler; the select's onChange is not reachable from static
    // markup, and the logic — not the DOM plumbing — is the part that can be wrong.
    const resolved = resolveTextLabelStyle(start, custom);
    got = { ...resolved, textStyleId: null };
    return got;
  }

  it('keeps what the surveyor can see', () => {
    // Without baking, dropping the id snaps the text back to the fields underneath — usually the
    // untouched defaults — so the label visibly jumps to Arial 10 the moment they choose "Custom"
    // in order to tweak it. Detach has to mean "keep this and let me edit it".
    const before = label({ textStyleId: 'FIRM' });
    const after = pickCustom(before, [firmStyle]);
    expect(after.textStyleId).toBeNull();
    expect(after.fontFamily).toBe('Helvetica');
    expect(after.fontSize).toBe(13);
    expect(after.fontWeight).toBe('bold');
    expect(after.widthFactor).toBe(0.8);
    expect(after.obliqueAngle).toBe(20);
    // And the raw start really was different, or this test proves nothing.
    expect(before.fontFamily).not.toBe('Helvetica');
  });

  it('is what the component does', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/admin/cad/components/TextStylePicker.tsx'), 'utf8',
    );
    expect(src).toMatch(/onChange\(\{ \.\.\.resolved, textStyleId: null \}\)/);
  });
});

describe('the picker explains what it took over', () => {
  it('says which style is in force and what it governs', () => {
    // The controls below are about to stop responding, and a disabled field with no explanation
    // reads as broken.
    const out = html({ value: label({ textStyleId: 'FIRM' }), customStyles: [firmStyle] });
    expect(out).toContain('Firm Standard');
    expect(out).toMatch(/sets the font, size, weight, slant/);
  });

  it('says nothing when no style is in force', () => {
    expect(html()).not.toMatch(/sets the font, size, weight/);
  });
});

// ── Mount points ───────────────────────────────────────────────────────────────────────────────
describe('it is mounted everywhere text is placed', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  const viewport = read('app/admin/cad/components/CanvasViewport.tsx');
  const layerPrefs = read('app/admin/cad/components/LayerPreferencesPanel.tsx');

  it('in the on-canvas label editor', () => {
    expect(viewport).toMatch(/<TextStylePicker/);
    expect(viewport).toMatch(/customStyles=\{labelCustomStyles\}/);
  });

  it('in the per-layer label style editor, once for all eight kinds', () => {
    // TextStyleEditor is used eight times (bearing, distance, point name/code/description/
    // elevation/coordinate, area). Mounting the picker inside it rather than at each call site is
    // what keeps those eight from drifting apart, which is the whole reason styles get names.
    expect(layerPrefs).toMatch(/<TextStylePicker/);
    expect((layerPrefs.match(/<TextStylePicker/g) ?? []).length).toBe(1);
    expect((layerPrefs.match(/customTextStyles=\{customTextStyles\}/g) ?? []).length).toBe(8);
  });

  it('reads the optional document field defensively at both mounts', () => {
    // C18 left `customTextStyles` optional so drawings saved before it still load.
    expect(viewport).toMatch(/document\.customTextStyles \?\? \[\]/);
    expect(layerPrefs).toMatch(/document\.customTextStyles \?\? \[\]/);
  });
});

describe('governed controls are disabled, not silently inert', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('the canvas label editor disables the five axes the style owns', () => {
    const v = read('app/admin/cad/components/CanvasViewport.tsx');
    // Leaving them live would let the surveyor change a value, watch nothing happen on the canvas
    // and reasonably conclude the panel is broken — the exact silent no-op C16 removed.
    expect((v.match(/disabled=\{labelStyleGoverned\}/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(v).toMatch(/title=\{labelGovernedHint\}/);
  });

  it('and shows the resolved value while disabled', () => {
    // A control displaying the raw field while the canvas draws the resolved one is two truths and
    // no error — the reason C9 refused to make point coordinates editable in the wrong place.
    const v = read('app/admin/cad/components/CanvasViewport.tsx');
    expect(v).toMatch(/value=\{labelResolved\.fontSize\}/);
    expect(v).toMatch(/value=\{labelResolved\.fontFamily\}/);
  });

  it('the layer panel does the same', () => {
    const l = read('app/admin/cad/components/LayerPreferencesPanel.tsx');
    expect((l.match(/disabled=\{styleGoverned\}/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(l).toMatch(/value=\{resolved\.fontSize\}/);
    expect(l).toMatch(/value=\{resolved\.fontFamily\}/);
  });

  it('the collapsed summary names the style rather than stale raw values', () => {
    const l = read('app/admin/cad/components/LayerPreferencesPanel.tsx');
    expect(l).toMatch(/named \? named\.name : `\$\{resolved\.fontSize\}pt \$\{resolved\.fontFamily\}`/);
  });
});
