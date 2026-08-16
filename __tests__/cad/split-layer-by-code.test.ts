// C7b — split a layer into one layer per point code.
//
// C7 deferred this to C22 on the grounds that it depends on `Layer.autoAssignCodes`, which C5 had
// found inert. It does not: `autoAssignCodes` is an IMPORT-TIME routing rule (which layer a code
// should land on) and this is the opposite question, asked of the features already in front of you.
// `autoAssignCodes` is still inert, so had this waited for it, it would still be waiting.
//
// The tests below lean on the two things that are easy to get wrong and invisible when they are:
// the ORDER of the undo operations, and what happens to features the split does not claim.

import { describe, it, expect } from 'vitest';
import { planLayerSplitByCode, describeSplitRefusal } from '@/lib/cad/operations/split-layer-by-code';
import type { Feature, Layer } from '@/lib/cad/types';

function layer(over: Partial<Layer> & { id: string; name: string }): Layer {
  return {
    visible: true, locked: false, frozen: false, color: '#112233', lineWeight: 0.5,
    lineTypeId: 'SOLID', opacity: 1, groupId: null, sortOrder: 0, isDefault: false,
    isProtected: false, autoAssignCodes: [], ...over,
  };
}

function pt(id: string, layerId: string, code?: string): Feature {
  return {
    id, type: 'POINT',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId,
    style: {} as Feature['style'],
    properties: code === undefined ? {} : { code },
  };
}

const ids = () => {
  let n = 0;
  return () => `new-${(n += 1)}`;
};

function doc(features: Feature[], layers: Layer[] = [layer({ id: 'src', name: 'Topo' })]) {
  return {
    layers: Object.fromEntries(layers.map((l) => [l.id, l])),
    features: Object.fromEntries(features.map((f) => [f.id, f])),
  };
}

describe('grouping', () => {
  it('makes one layer per distinct code', () => {
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'EP'), pt('c', 'src', 'FN01')]),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.groups.map((g) => g.code)).toEqual(['FN01', 'EP']);
    expect(plan.groups[0].featureIds).toEqual(['a', 'c']);
    expect(plan.newLayers.map((l) => l.name)).toEqual(['Topo — FN01', 'Topo — EP']);
  });

  it('treats fn01 and FN01 as one code', () => {
    // A field crew types both. Two layers for one code is a bug that looks like a feature until
    // somebody notices the drawing has two fence layers.
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'fn01'), pt('c', 'src', 'EP')]),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.groups).toHaveLength(2);
    expect(plan.groups[0].featureIds).toEqual(['a', 'b']);
    // Named for the spelling actually in the drawing, not an upper-cased normalisation.
    expect(plan.groups[0].layerName).toBe('Topo — FN01');
  });

  it('reads the code off imported features too', () => {
    // `pointCode` is what imports carry; matching only `code` would give every imported feature no
    // code and split a whole survey into nothing.
    const f = pt('a', 'src');
    f.properties = { pointCode: 'IR' };
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src', ...doc([f, pt('b', 'src', 'EP')]), makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.groups.map((g) => g.code).sort()).toEqual(['EP', 'IR']);
  });

  it('leaves uncoded features on the source layer and says how many', () => {
    // Sweeping them into an "Uncoded" layer would empty the layer the surveyor was looking at and
    // move their hand-drawn work somewhere they did not ask for.
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'EP'), pt('c', 'src'), pt('d', 'src')]),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.uncodedCount).toBe(2);
    const moved = plan.groups.flatMap((g) => g.featureIds);
    expect(moved).not.toContain('c');
    expect(moved).not.toContain('d');
  });

  it('ignores features on other layers', () => {
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc(
        [pt('a', 'src', 'FN01'), pt('b', 'src', 'EP'), pt('x', 'other', 'FN01')],
        [layer({ id: 'src', name: 'Topo' }), layer({ id: 'other', name: 'Other' })],
      ),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.groups.flatMap((g) => g.featureIds)).not.toContain('x');
  });
});

describe('the new layers', () => {
  it('inherit the source’s appearance — a split reorganises, it does not restyle', () => {
    const src = layer({ id: 'src', name: 'Topo', color: '#ff8800', lineWeight: 1.25, opacity: 0.5, frozen: true });
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'EP')], [src]),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    for (const l of plan.newLayers) {
      expect(l.color).toBe('#ff8800');
      expect(l.lineWeight).toBe(1.25);
      expect(l.opacity).toBe(0.5);
      expect(l.frozen).toBe(true);
    }
  });

  it('are never protected, however protected the source was', () => {
    // A protected copy could not be deleted, so an accidental split would leave permanent layers.
    const src = layer({ id: 'src', name: 'Survey Info', isProtected: true, isDefault: true });
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'EP')], [src]),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.newLayers.every((l) => !l.isProtected)).toBe(true);
    expect(plan.newLayers.every((l) => !l.isDefault)).toBe(true);
  });

  it('do not collide with a name already in the drawing', () => {
    // Splitting a drawing that has been split before must not reuse "Topo — FN01" — merging a
    // second survey's shots into the first survey's layer silently is worse than an ugly name.
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc(
        [pt('a', 'src', 'FN01'), pt('b', 'src', 'EP')],
        [layer({ id: 'src', name: 'Topo' }), layer({ id: 'old', name: 'Topo — FN01' })],
      ),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.newLayers[0].name).toBe('Topo — FN01 (2)');
  });
});

describe('the undo batch', () => {
  it('adds the layers BEFORE moving features onto them', () => {
    // Undo replays reversed, so this ordering is what puts the features back on the source before
    // the new layers are removed. The other order strands them on a layer mid-deletion, and
    // `getVisibleFeatures` drops a feature whose layer is missing SILENTLY — geometry that exists,
    // is selectable, is saved, and cannot be seen.
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'EP')]),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const lastAdd = plan.operations.map((o) => o.type).lastIndexOf('ADD_LAYER');
    const firstMove = plan.operations.map((o) => o.type).indexOf('MODIFY_FEATURE');
    expect(lastAdd).toBeGreaterThan(-1);
    expect(firstMove).toBeGreaterThan(lastAdd);
  });

  it('records the source layer as each feature’s "before"', () => {
    // Without it undo would have nowhere to put the feature back.
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'EP')]),
      makeLayerId: ids(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    for (const op of plan.operations.filter((o) => o.type === 'MODIFY_FEATURE')) {
      expect((op.data as { before: { layerId: string } }).before.layerId).toBe('src');
    }
  });
});

describe('refusals', () => {
  it('refuses a locked layer', () => {
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src',
      ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'EP')], [layer({ id: 'src', name: 'Topo', locked: true })]),
      makeLayerId: ids(),
    });
    expect(plan).toEqual({ ok: false, reason: 'SOURCE_LOCKED' });
  });

  it('refuses a layer that no longer exists', () => {
    const plan = planLayerSplitByCode({ sourceLayerId: 'gone', ...doc([]), makeLayerId: ids() });
    expect(plan).toEqual({ ok: false, reason: 'SOURCE_MISSING' });
  });

  it('refuses when nothing carries a code', () => {
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src', ...doc([pt('a', 'src'), pt('b', 'src')]), makeLayerId: ids(),
    });
    expect(plan).toEqual({ ok: false, reason: 'NO_CODED_FEATURES' });
  });

  it('refuses when every feature shares one code', () => {
    // The "button that always produces one layer" C7 wanted avoided. Producing an identical copy
    // and calling it a split is the outcome a surveyor would have to notice and undo themselves.
    const plan = planLayerSplitByCode({
      sourceLayerId: 'src', ...doc([pt('a', 'src', 'FN01'), pt('b', 'src', 'fn01')]), makeLayerId: ids(),
    });
    expect(plan).toEqual({ ok: false, reason: 'SINGLE_CODE' });
  });

  it('every refusal has a sentence a surveyor can act on', () => {
    for (const reason of ['SOURCE_MISSING', 'SOURCE_LOCKED', 'NO_CODED_FEATURES', 'SINGLE_CODE'] as const) {
      const msg = describeSplitRefusal(reason);
      expect(msg.length).toBeGreaterThan(20);
      // C16's rule: a refusal names the cause, it does not just decline.
      expect(msg).toMatch(/[.!]$/);
    }
  });
});
