// C23 — one answer to "why can't I see this?" (decision D3)
//
// ── THE PROBLEM D3 NAMED ────────────────────────────────────────────────────────────────────────
//
// There are FIVE independent ways for something to be invisible on this canvas, each a different
// field on a different object:
//
//   Layer.visible = false        the layer is switched off
//   Layer.frozen = true          frozen — also excluded from snap and selection
//   Layer.opacity = 0            fully transparent, and NOTHING in the UI calls this hidden
//   Feature.hidden = true        right-click → Hide, on one feature
//   geometry.hiddenSegments      individual edges suppressed
//
// A surveyor staring at a gap in their linework cannot tell which one did it, and "unhide
// everything" would mean five different reversals. D3's rule is that P6 **starts in the model, not
// the panel** — a hidden-items panel built over five flags is a prettier version of the same
// confusion, because it still cannot say what to undo.
//
// So this slice is the model, and the tests are about the two things that make it useful: it
// returns a REASON, and the reason it returns is the one whose reversal actually helps.

import { describe, it, expect } from 'vitest';
import {
  visibility,
  isVisible,
  isRenderable,
  groupHidden,
  countHidden,
  wouldRevealCount,
  RENDER_SUPPRESSING_REASONS,
  HIDDEN_REASON_LABEL,
  HIDDEN_REASON_FIX,
} from '@/lib/cad/visibility';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature, Layer } from '@/lib/cad/types';

const layer = (over: Partial<Layer> = {}): Layer => ({
  id: 'L1', name: 'Layer 1',
  visible: true, locked: false, frozen: false,
  color: '#000000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  ...over,
});

let n = 0;
const feat = (over: Partial<Feature> = {}): Feature => ({
  id: `f${++n}`,
  type: 'LINE',
  geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  layerId: 'L1',
  style: { ...DEFAULT_FEATURE_STYLE },
  properties: {},
  ...over,
});

describe('the five ways to be invisible', () => {
  it('visible when nothing suppresses it', () => {
    const v = visibility(feat(), layer());
    expect(v).toEqual({ visible: true, reason: null, layerId: null, hiddenSegments: [] });
    expect(isVisible(feat(), layer())).toBe(true);
  });

  it.each([
    ['layer-frozen', layer({ frozen: true })],
    ['layer-hidden', layer({ visible: false })],
    ['layer-transparent', layer({ opacity: 0 })],
  ] as const)('reports %s', (reason, l) => {
    const v = visibility(feat(), l);
    expect(v.visible).toBe(false);
    expect(v.reason).toBe(reason);
    expect(v.layerId).toBe('L1');
  });

  it('reports feature-hidden', () => {
    const v = visibility(feat({ hidden: true }), layer());
    expect(v.visible).toBe(false);
    expect(v.reason).toBe('feature-hidden');
  });

  it('treats a missing layer as hidden rather than throwing', () => {
    // A feature whose layer was deleted is exactly what this panel exists to surface. A crash
    // surfaces nothing.
    const v = visibility(feat(), undefined);
    expect(v.visible).toBe(false);
    expect(v.reason).toBe('layer-hidden');
    expect(v.layerId).toBe('L1');
  });

  it('does NOT call a partly-edge-hidden feature hidden', () => {
    // A polygon with one boundary edge suppressed still fills its full area and still reads as
    // present. Calling that hidden would put every fill-styled polygon in the hidden-items panel —
    // which is how a panel meant to reduce confusion becomes the confusion.
    const f = feat({
      geometry: { type: 'POLYLINE', vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], hiddenSegments: [0] },
    });
    const v = visibility(f, layer());
    expect(v.visible).toBe(true);
    expect(v.reason).toBeNull();
    expect(v.hiddenSegments).toEqual([0]);
  });

  it('still reports hidden segments alongside a real reason', () => {
    // Both facts are true at once and the panel may want to show both.
    const f = feat({
      hidden: true,
      geometry: { type: 'POLYLINE', vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }], hiddenSegments: [0] },
    });
    expect(visibility(f, layer()).hiddenSegments).toEqual([0]);
  });
});

describe('reason PRIORITY is the product decision', () => {
  // A feature can be suppressed more than one way at once, and the reason returned has to be the
  // one whose reversal the surveyor must perform FIRST. Unhiding a feature whose layer is still
  // frozen changes nothing on screen — a panel offering that button would be the third thing in a
  // row that appeared to do nothing.

  it('layer reasons outrank the feature reason', () => {
    expect(visibility(feat({ hidden: true }), layer({ frozen: true })).reason).toBe('layer-frozen');
    expect(visibility(feat({ hidden: true }), layer({ visible: false })).reason).toBe('layer-hidden');
  });

  it('frozen outranks hidden outranks transparent', () => {
    expect(visibility(feat(), layer({ frozen: true, visible: false, opacity: 0 })).reason)
      .toBe('layer-frozen');
    expect(visibility(feat(), layer({ visible: false, opacity: 0 })).reason).toBe('layer-hidden');
  });
});

describe('the render predicate is the same model, minus one named exception', () => {
  it('renders nothing that is frozen, layer-hidden, or feature-hidden', () => {
    expect(isRenderable(feat(), layer({ frozen: true }))).toBe(false);
    expect(isRenderable(feat(), layer({ visible: false }))).toBe(false);
    expect(isRenderable(feat({ hidden: true }), layer())).toBe(false);
    expect(isRenderable(feat(), undefined)).toBe(false);
  });

  it('still renders a 0-opacity layer, on purpose', () => {
    // Its features draw at alpha 0 — invisible, but still hit-tested, snappable and rubber-band
    // selectable. Dropping them from the render set would ALSO drop them from selection and snap,
    // because every consumer shares this predicate. That is a behaviour change, not a model
    // unification, and C23 is the model.
    expect(isRenderable(feat(), layer({ opacity: 0 }))).toBe(true);
    expect(isVisible(feat(), layer({ opacity: 0 }))).toBe(false);
  });

  it('the divergence is one named constant, not a second predicate', () => {
    expect(RENDER_SUPPRESSING_REASONS.has('layer-transparent')).toBe(false);
    expect([...RENDER_SUPPRESSING_REASONS].sort())
      .toEqual(['feature-hidden', 'layer-frozen', 'layer-hidden']);
  });
});

describe('grouping, which is what makes a panel readable', () => {
  const layers: Record<string, Layer> = {
    L1: layer({ id: 'L1', frozen: true }),
    L2: layer({ id: 'L2', visible: false }),
    L3: layer({ id: 'L3' }),
  };
  const features = [
    feat({ id: 'a', layerId: 'L1' }),
    feat({ id: 'b', layerId: 'L1' }),
    feat({ id: 'c', layerId: 'L2' }),
    feat({ id: 'd', layerId: 'L3', hidden: true }),
    feat({ id: 'e', layerId: 'L3' }),
  ];

  it('one group per reason per layer, not one row per feature', () => {
    // A frozen layer holding 4,000 features is ONE problem with ONE fix. Listing it 4,000 times is
    // what makes the current situation unreadable.
    const groups = groupHidden(features, layers);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ reason: 'layer-frozen', layerId: 'L1', featureIds: ['a', 'b'] });
    expect(groups[1]).toEqual({ reason: 'layer-hidden', layerId: 'L2', featureIds: ['c'] });
  });

  it('feature-hidden is one group across the whole drawing', () => {
    // It has one control ("unhide these"), unlike layer reasons which have one per layer.
    const groups = groupHidden(features, layers);
    const fh = groups.find((g) => g.reason === 'feature-hidden')!;
    expect(fh.layerId).toBeNull();
    expect(fh.featureIds).toEqual(['d']);
  });

  it('orders by reason then layer, stably', () => {
    // A panel that reshuffles under the cursor as features are unhidden is worse than no panel.
    const many: Record<string, Layer> = {
      B: layer({ id: 'B', visible: false }),
      A: layer({ id: 'A', visible: false }),
      Z: layer({ id: 'Z', frozen: true }),
    };
    const fs = [feat({ layerId: 'B' }), feat({ layerId: 'A' }), feat({ layerId: 'Z' })];
    expect(groupHidden(fs, many).map((g) => `${g.reason}:${g.layerId}`))
      .toEqual(['layer-frozen:Z', 'layer-hidden:A', 'layer-hidden:B']);
  });

  it('leaves visible features out entirely', () => {
    expect(groupHidden(features, layers).flatMap((g) => g.featureIds)).not.toContain('e');
  });

  it('counts what is hidden', () => {
    expect(countHidden(features, layers)).toBe(4);
    expect(countHidden([], layers)).toBe(0);
  });
});

describe('wouldRevealCount tells the truth about a fix', () => {
  it('counts only what this ONE reversal actually reveals', () => {
    // The trap: a feature that is individually hidden AND on a frozen layer is in the frozen
    // group, but thawing the layer will not bring it back. Saying "this will bring back 3
    // features" and bringing back 2 is a small lie that costs exactly the trust this panel exists
    // to build.
    const layers = { L1: layer({ id: 'L1', frozen: true }) };
    const featuresById = {
      a: feat({ id: 'a', layerId: 'L1' }),
      b: feat({ id: 'b', layerId: 'L1' }),
      c: feat({ id: 'c', layerId: 'L1', hidden: true }),
    };
    const group = groupHidden(Object.values(featuresById), layers)[0];
    expect(group.featureIds).toEqual(['a', 'b', 'c']);
    expect(wouldRevealCount(group, featuresById, layers)).toBe(2);
  });

  it('handles each reversal kind', () => {
    const cases: Array<[Partial<Layer>, Partial<Feature>]> = [
      [{ visible: false }, {}],
      [{ opacity: 0 }, {}],
      [{}, { hidden: true }],
    ];
    for (const [lo, fo] of cases) {
      const layers = { L1: layer({ id: 'L1', ...lo }) };
      const f = feat({ id: 'x', layerId: 'L1', ...fo });
      const group = groupHidden([f], layers)[0];
      expect(wouldRevealCount(group, { x: f }, layers), JSON.stringify(lo)).toBe(1);
    }
  });

  it('survives a feature or layer that has since gone', () => {
    const layers = { L1: layer({ id: 'L1', visible: false }) };
    const f = feat({ id: 'x', layerId: 'L1' });
    const group = groupHidden([f], layers)[0];
    expect(wouldRevealCount(group, {}, layers)).toBe(0);
    expect(wouldRevealCount(group, { x: f }, {})).toBe(0);
  });
});

describe('the words the panel will show', () => {
  it('every reason has a label and a fix', () => {
    for (const r of ['layer-frozen', 'layer-hidden', 'layer-transparent', 'feature-hidden'] as const) {
      expect(HIDDEN_REASON_LABEL[r]).toBeTruthy();
      expect(HIDDEN_REASON_FIX[r]).toBeTruthy();
    }
  });

  it('the fix names a control, not a field', () => {
    // "Thaw the layer", not "set frozen to false". The surveyor has to be able to go do it.
    expect(HIDDEN_REASON_FIX['layer-frozen']).toMatch(/thaw/i);
    expect(HIDDEN_REASON_FIX['layer-hidden']).toMatch(/turn the layer on/i);
    for (const v of Object.values(HIDDEN_REASON_FIX)) {
      expect(v).not.toMatch(/true|false|=/);
    }
  });
});
