// C8 — named layer states.
//
// The planner is pure so the two cases that actually matter can be tested without an editor:
// layers the state has never seen, and layers it remembers that are gone. Both happen the moment a
// drawing outlives the state saved from it, which is the normal case rather than an edge one.

import { describe, it, expect } from 'vitest';
import {
  captureLayerState,
  isLayerStateCurrent,
  planLayerStateRestore,
  validateLayerStateName,
  type LayerState,
} from '@/lib/cad/styles/layer-states';
import type { Layer } from '@/lib/cad/types';

const layer = (id: string, over: Partial<Layer> = {}): Layer => ({
  id, name: id, visible: true, locked: false, frozen: false,
  color: '#fff', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
  autoAssignCodes: [], ...over,
} as Layer);

const asMap = (ls: Layer[]) => Object.fromEntries(ls.map((l) => [l.id, l]));

describe('captureLayerState', () => {
  it('records visible, frozen and locked for every layer', () => {
    const s = captureLayerState('Field check', asMap([
      layer('A'),
      layer('B', { visible: false, frozen: true, locked: true }),
    ]), '2026-08-15T00:00:00Z', 'st1');
    expect(s.entries.A).toEqual({ visible: true, frozen: false, locked: false });
    expect(s.entries.B).toEqual({ visible: false, frozen: true, locked: true });
  });

  it('does NOT record colour or line style', () => {
    // A state restores what is SHOWN, not what things look like. Carrying style would make it a
    // second source of truth competing with the layer properties C6 just made editable.
    const s = captureLayerState('x', asMap([layer('A', { color: '#f00' })]), 'now', 'st1');
    expect(s.entries.A).not.toHaveProperty('color');
    expect(s.entries.A).not.toHaveProperty('lineTypeId');
  });

  it('trims and caps the name', () => {
    const s = captureLayerState(`  ${'x'.repeat(80)}  `, {}, 'now', 'st1');
    expect(s.name.length).toBe(40);
  });
});

describe('planLayerStateRestore — the two cases that matter', () => {
  const state: LayerState = {
    id: 'st1', name: 'Plat', created: 'now',
    entries: {
      A: { visible: true, frozen: false, locked: false },
      B: { visible: false, frozen: false, locked: false },
      GONE: { visible: true, frozen: false, locked: false },
    },
  };

  it('patches the layers it knows and still exist', () => {
    const plan = planLayerStateRestore(state, asMap([layer('A', { visible: false }), layer('B')]));
    expect(plan.patches.A.visible).toBe(true);
    expect(plan.patches.B.visible).toBe(false);
  });

  it('LEAVES ALONE a layer created after the state was saved', () => {
    // The decision in the header. Hiding an unknown layer would make work the surveyor just did
    // disappear, from a control they may not connect to the disappearance — and geometry that
    // looks deleted is the most expensive failure this editor has. Showing one extra layer is
    // visible and recoverable; hiding one is neither.
    const plan = planLayerStateRestore(state, asMap([layer('A'), layer('B'), layer('NEW')]));
    expect(plan.patches).not.toHaveProperty('NEW');
    expect(plan.unknownLayerIds).toEqual(['NEW']);
  });

  it('reports a remembered layer that no longer exists rather than failing', () => {
    const plan = planLayerStateRestore(state, asMap([layer('A'), layer('B')]));
    expect(plan.missingLayerIds).toEqual(['GONE']);
    expect(plan.patches).not.toHaveProperty('GONE');
  });

  it('an empty drawing yields no patches and no crash', () => {
    const plan = planLayerStateRestore(state, {});
    expect(Object.keys(plan.patches)).toEqual([]);
    expect(plan.missingLayerIds.sort()).toEqual(['A', 'B', 'GONE']);
  });
});

describe('isLayerStateCurrent', () => {
  const state: LayerState = {
    id: 'st1', name: 'Plat', created: 'now',
    entries: { A: { visible: true, frozen: false, locked: false } },
  };

  it('is true when the drawing matches', () => {
    expect(isLayerStateCurrent(state, asMap([layer('A')]))).toBe(true);
  });

  it('is false when any tracked flag differs', () => {
    expect(isLayerStateCurrent(state, asMap([layer('A', { visible: false })]))).toBe(false);
    expect(isLayerStateCurrent(state, asMap([layer('A', { frozen: true })]))).toBe(false);
    expect(isLayerStateCurrent(state, asMap([layer('A', { locked: true })]))).toBe(false);
  });

  it('ignores layers the state never knew — they cannot make it stale', () => {
    // Otherwise adding any layer would mark every saved state as "not current", which is noise.
    expect(isLayerStateCurrent(state, asMap([layer('A'), layer('NEW', { visible: false })]))).toBe(true);
  });

  it('a remembered layer that is gone does not make it stale either', () => {
    // It makes the state partially inapplicable, which the restore plan reports separately. Those
    // are different facts and conflating them would mislabel a state the surveyor is looking at.
    expect(isLayerStateCurrent(
      { ...state, entries: { ...state.entries, GONE: { visible: true, frozen: false, locked: false } } },
      asMap([layer('A')]),
    )).toBe(true);
  });
});

describe('validateLayerStateName', () => {
  const existing: LayerState[] = [{ id: 'a', name: 'Field check', created: 'now', entries: {} }];

  it('accepts a fresh name', () => {
    expect(validateLayerStateName('Client plat', existing)).toBeNull();
  });

  it('rejects blank', () => {
    expect(validateLayerStateName('   ', existing)).toMatch(/name/i);
  });

  it('rejects a duplicate REGARDLESS of case', () => {
    // "Field check" and "field check" in one list is a trap, not a distinction.
    expect(validateLayerStateName('field CHECK', existing)).toMatch(/already exists/i);
  });

  it('lets a state keep its own name when being renamed', () => {
    expect(validateLayerStateName('Field check', existing, 'a')).toBeNull();
  });
});
