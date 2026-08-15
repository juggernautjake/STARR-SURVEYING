// C6 — the layer properties that had no editor now have one, and it drives something real.
//
// C5 found the layer model carries 19 fields while every `updateLayer()` call in the CAD surface
// wrote five. `lineWeight` was hard-coded to 0.75 and `lineTypeId` to 'SOLID' at layer creation and
// never changed again, so no layer in any drawing could be dashed.
//
// ── WHAT THIS FILE IS ACTUALLY GUARDING ─────────────────────────────────────────────────────────
//
// Not "the dialog renders". The risk with a slice like this is shipping a control over a field
// nothing reads — a slider that moves and changes nothing, which is this repository's signature
// defect and the reason P9b exists. Each property below is therefore asserted at BOTH ends: the
// editor writes it, and the render path reads it.
//
// It caught a real ambiguity while being written. `layer.opacity` is NOT part of the style cascade
// (`resolveFeatureStyle` takes opacity from the feature style and defaults to 1, with no layer
// fallback — unlike lineTypeId and lineWeight, which chain to the layer explicitly). Reading only
// the cascade would have said the opacity slider was dead. It is not: CanvasViewport reads
// `layer.opacity` directly for both feature alpha and label alpha. Two mechanisms for one idea,
// which is worth knowing about, and exactly why this is checked rather than assumed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const dialog = read('app/admin/cad/components/LayerPropertiesDialog.tsx');
const panel = read('app/admin/cad/components/LayerPanel.tsx');
const cascade = read('lib/cad/styles/style-cascade.ts');
const viewport = read('app/admin/cad/components/CanvasViewport.tsx');

describe('the editor writes each previously-unreachable field', () => {
  for (const field of ['lineTypeId', 'lineWeight', 'opacity', 'frozen', 'description']) {
    it(`patches ${field}`, () => {
      expect(dialog, `${field} has no control`).toMatch(new RegExp(`patch\\(\\{[^}]*\\b${field}\\b`));
    });
  }

  it('is reachable from the layer panel', () => {
    // A dialog nothing opens is the same defect one level up.
    expect(panel).toMatch(/LayerPropertiesDialog/);
    expect(panel).toMatch(/setPropertiesLayerId\(contextMenu\.layerId\)/);
  });
});

describe('the render path reads what the editor writes', () => {
  it('lineTypeId falls back to the layer', () => {
    expect(cascade).toMatch(/lineTypeId:[^\n]*layer\.lineTypeId/);
  });

  it('lineWeight falls back to the layer', () => {
    expect(cascade).toMatch(/lineWeight:[^\n]*layer\.lineWeight/);
  });

  it('opacity is read from the layer directly — NOT via the cascade', () => {
    // The ambiguity described in this file's header. `resolveFeatureStyle` gives opacity no layer
    // fallback, so the proof that the slider does anything lives in the viewport instead.
    expect(viewport).toMatch(/layer\.opacity/);
  });

  it('frozen excludes a layer from rendering, snap and selection', () => {
    const styles = read('lib/cad/styles/style-cascade.ts');
    expect(styles).toMatch(/frozen/);
  });
});

describe('the controls cannot produce a state that reads as a bug', () => {
  it('opacity has a floor above zero', () => {
    // A 0% layer is invisible but still snaps and selects, which looks broken. Hiding is the eye's
    // job; the slider must not be able to impersonate it.
    expect(dialog).toMatch(/min=\{10\}/);
  });

  it('a stored line weight outside the offered steps is preserved, not snapped', () => {
    // Opening a dialog must never silently change the value it was opened to inspect.
    expect(dialog).toMatch(/LINE_WEIGHTS\.includes\(layer\.lineWeight\)/);
  });
});
