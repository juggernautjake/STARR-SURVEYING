// C7 — merging one layer into another.
//
// The planner is pure, which is the point: the refusals and the OPERATION ORDER can be tested
// without a running editor, so the store wrapper is left with nothing interesting to get wrong.
//
// ── THE ORDERING TEST IS THE IMPORTANT ONE ──────────────────────────────────────────────────────
//
// A merge is a move plus a delete. If it lands as two undo entries it can be left half-undone —
// features re-parented back onto a layer that no longer exists — and `getVisibleFeatures` drops a
// feature whose layer is missing SILENTLY. The result is geometry that exists, is selectable, is
// saved, and cannot be seen. That is the exact failure S13d was written to make loud, arriving by a
// different route, so the batch ordering is asserted rather than assumed.

import { describe, it, expect } from 'vitest';
import {
  describeMergeRefusal,
  planLayerMerge,
  type MergeLayersRefusal,
} from '@/lib/cad/operations/merge-layers';
import type { Feature, Layer } from '@/lib/cad/types';

const layer = (over: Partial<Layer> = {}): Layer => ({
  id: 'L1', name: 'Layer 1', visible: true, locked: false, frozen: false,
  color: '#fff', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
  autoAssignCodes: [], ...over,
} as Layer);

const feat = (id: string, layerId: string): Feature => ({
  id, type: 'POINT', layerId,
  geometry: { type: 'POINT', point: { x: 0, y: 0 } },
  properties: {}, style: {},
} as unknown as Feature);

function docWith(layers: Layer[], features: Feature[]) {
  return {
    layers: Object.fromEntries(layers.map((l) => [l.id, l])),
    features: Object.fromEntries(features.map((f) => [f.id, f])),
  };
}

describe('planLayerMerge — what it refuses', () => {
  const cases: Array<[string, () => ReturnType<typeof planLayerMerge>, MergeLayersRefusal]> = [
    ['a layer into itself', () => planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L1', ...docWith([layer()], []),
    }), 'SAME_LAYER'],
    ['a source that is gone', () => planLayerMerge({
      sourceLayerId: 'nope', targetLayerId: 'L1', ...docWith([layer()], []),
    }), 'SOURCE_MISSING'],
    ['a target that is gone', () => planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'nope', ...docWith([layer()], []),
    }), 'TARGET_MISSING'],
    ['a locked target', () => planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith([layer(), layer({ id: 'L2', locked: true })], []),
    }), 'TARGET_LOCKED'],
    ['a locked source, because merging DELETES it', () => planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith([layer({ locked: true }), layer({ id: 'L2' })], []),
    }), 'SOURCE_LOCKED'],
    ['a protected source', () => planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith([layer({ isProtected: true }), layer({ id: 'L2' })], []),
    }), 'SOURCE_PROTECTED'],
  ];

  for (const [name, run, reason] of cases) {
    it(name, () => {
      const r = run();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(reason);
    });
  }

  it('every refusal has a sentence a surveyor can act on', () => {
    const all: MergeLayersRefusal[] = [
      'SAME_LAYER', 'SOURCE_MISSING', 'TARGET_MISSING',
      'TARGET_LOCKED', 'SOURCE_LOCKED', 'SOURCE_PROTECTED',
    ];
    for (const r of all) {
      const msg = describeMergeRefusal(r);
      expect(msg.length, `${r} has no message`).toBeGreaterThan(10);
      expect(msg, `${r} leaks its enum name`).not.toMatch(/_/);
    }
  });
});

describe('planLayerMerge — what it plans', () => {
  it('re-parents every feature on the source layer, and only those', () => {
    const plan = planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith(
        [layer(), layer({ id: 'L2', name: 'Keep' })],
        [feat('a', 'L1'), feat('b', 'L1'), feat('c', 'L2')],
      ),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.featureIds.sort()).toEqual(['a', 'b']);
  });

  it('merges an EMPTY layer — deleting it is still the useful outcome', () => {
    const plan = planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith([layer(), layer({ id: 'L2' })], []),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.featureIds).toEqual([]);
    // Still one operation: the layer removal.
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0].type).toBe('REMOVE_LAYER');
  });

  it('carries the names, so the undo entry and the prompt can say what happened', () => {
    const plan = planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith([layer({ name: 'Trees' }), layer({ id: 'L2', name: 'Vegetation' })], []),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.sourceName).toBe('Trees');
    expect(plan.targetName).toBe('Vegetation');
  });
});

describe('the operation order is what makes undo safe', () => {
  it('removes the layer LAST, so undo restores it FIRST', () => {
    // Undo replays the batch reversed. If the layer removal were first, undo would re-parent the
    // features before recreating their layer — and a feature whose layer is missing is dropped
    // silently by getVisibleFeatures. Invisible, selectable, saved geometry.
    const plan = planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith([layer(), layer({ id: 'L2' })], [feat('a', 'L1'), feat('b', 'L1')]),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const types = plan.operations.map((o) => o.type);
    expect(types.slice(0, -1).every((t) => t === 'MODIFY_FEATURE')).toBe(true);
    expect(types[types.length - 1]).toBe('REMOVE_LAYER');
  });

  it('each feature op records both directions, so undo is exact', () => {
    const plan = planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith([layer(), layer({ id: 'L2' })], [feat('a', 'L1')]),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const op = plan.operations[0].data as { id: string; before: { layerId: string }; after: { layerId: string } };
    expect(op.id).toBe('a');
    expect(op.before.layerId).toBe('L1');
    expect(op.after.layerId).toBe('L2');
  });

  it('the removal op carries the WHOLE layer, not just its id', () => {
    // Undo re-adds it via `addLayer(data)`. An id alone would restore a layer stripped of its
    // colour, line type, weight and description — a silent data loss dressed as a working undo.
    const plan = planLayerMerge({
      sourceLayerId: 'L1', targetLayerId: 'L2',
      ...docWith([layer({ name: 'Trees', color: '#0f0', lineTypeId: 'DASHED' }), layer({ id: 'L2' })], []),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const removed = plan.operations.at(-1)!.data as Layer;
    expect(removed.id).toBe('L1');
    expect(removed.name).toBe('Trees');
    expect(removed.color).toBe('#0f0');
    expect(removed.lineTypeId).toBe('DASHED');
  });
});
