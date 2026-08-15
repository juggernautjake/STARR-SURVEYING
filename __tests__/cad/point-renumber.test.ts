// C11 — bulk renumber and re-code.
//
// The alias sweep is the reason this file exists. A point's number resolves as
// `pointNo ?? pointNumber ?? pointName ?? name`, so writing only the canonical `pointName` on a
// feature that carries `pointNo` renumbers it in the store while every reader still sees the old
// number. Nothing errors; the point simply has two numbers depending on who asks.

import { describe, it, expect } from 'vitest';
import { planRecode, planRenumber } from '@/lib/cad/points/renumber';
import { pointNumberOf } from '@/lib/cad/feature-fields';
import type { Feature } from '@/lib/cad/types';

const pt = (id: string, props: Record<string, string | number> = {}): Feature => ({
  id, type: 'POINT', layerId: 'L1',
  geometry: { type: 'POINT', point: { x: 0, y: 0 } },
  properties: props, style: {},
} as unknown as Feature);

const asMap = (fs: Feature[]) => Object.fromEntries(fs.map((f) => [f.id, f]));

describe('planRenumber — the alias sweep', () => {
  it('rewrites EVERY alias the feature already carries', () => {
    // The one that matters. pointNo wins the resolution, so leaving it stale means the renumber is
    // invisible to every reader.
    const f = pt('a', { pointNo: '12', pointName: '12' });
    const { ops } = planRenumber(['a'], asMap([f]), 40);
    expect(ops[0].after.pointNo).toBe('40');
    expect(ops[0].after.pointName).toBe('40');
  });

  it('proves it by resolving the renumbered feature', () => {
    const f = pt('a', { pointNo: '12', pointName: '12' });
    const { ops } = planRenumber(['a'], asMap([f]), 40);
    const applied = { ...f, properties: { ...f.properties, ...ops[0].after } } as Feature;
    expect(pointNumberOf(applied as never)).toBe('40');
  });

  it('does NOT add aliases the feature never had', () => {
    // Spreading the legacy shape would work against the migration that is trying to retire it.
    const f = pt('a', { pointName: '12' });
    const { ops } = planRenumber(['a'], asMap([f]), 40);
    expect(ops[0].after).not.toHaveProperty('pointNo');
    expect(ops[0].after).not.toHaveProperty('name');
  });

  it('always writes the canonical key, even for a point that had no number', () => {
    const { ops } = planRenumber(['a'], asMap([pt('a')]), 7);
    expect(ops[0].after.pointName).toBe('7');
    expect(ops[0].from).toBeNull();
  });

  it('records the previous values so undo is exact', () => {
    const f = pt('a', { pointNo: '12', pointName: '12' });
    const { ops } = planRenumber(['a'], asMap([f]), 40);
    expect(ops[0].before.pointNo).toBe('12');
    expect(ops[0].before.pointName).toBe('12');
  });
});

describe('planRenumber — order and determinism', () => {
  it('numbers by CURRENT number ascending, preserving relative order', () => {
    const map = asMap([pt('c', { pointName: '30' }), pt('a', { pointName: '10' }), pt('b', { pointName: '20' })]);
    const { ops } = planRenumber(['c', 'a', 'b'], map, 100);
    expect(ops.map((o) => o.featureId)).toEqual(['a', 'b', 'c']);
    expect(ops.map((o) => o.to)).toEqual(['100', '101', '102']);
  });

  it('puts unnumbered points last rather than first', () => {
    const map = asMap([pt('none'), pt('a', { pointName: '5' })]);
    const { ops } = planRenumber(['none', 'a'], map, 1);
    expect(ops.map((o) => o.featureId)).toEqual(['a', 'none']);
  });

  it('breaks ties by id, so the same input always gives the same output', () => {
    // Undo/redo must land exactly where the original did.
    const map = asMap([pt('b', { pointName: '5' }), pt('a', { pointName: '5' })]);
    const first = planRenumber(['b', 'a'], map, 1).ops.map((o) => o.featureId);
    const again = planRenumber(['a', 'b'], map, 1).ops.map((o) => o.featureId);
    expect(first).toEqual(again);
  });

  it('ignores ids that are not points, or are gone', () => {
    const map = asMap([pt('a', { pointName: '1' })]);
    const { ops } = planRenumber(['a', 'missing'], map, 1);
    expect(ops).toHaveLength(1);
  });
});

describe('planRenumber — collisions', () => {
  it('reports a number already held by a point OUTSIDE the selection', () => {
    // Two points numbered 8 make every number-keyed lookup ambiguous — range selection, the AI's
    // "point 8", buildPointNoIndex. parsePointRangeString has an AMBIGUOUS status because of this.
    const map = asMap([pt('a', { pointName: '1' }), pt('outsider', { pointName: '8' })]);
    const { collisions } = planRenumber(['a'], map, 8);
    expect(collisions).toEqual(['8']);
  });

  it('does NOT report a number held by a point inside the selection', () => {
    // Renumbering 5,6,7 to start at 6 passes through numbers the set already owns. Those are not
    // collisions — the set is being rewritten wholesale.
    const map = asMap([pt('a', { pointName: '5' }), pt('b', { pointName: '6' }), pt('c', { pointName: '7' })]);
    const { collisions } = planRenumber(['a', 'b', 'c'], map, 6);
    expect(collisions).toEqual([]);
  });
});

describe('planRecode', () => {
  it('writes properties.code — the same field a single-cell edit writes', () => {
    const { 0: op } = planRecode(['a'], asMap([pt('a', { code: 'OLD' })]), 'BC02');
    expect(op.after.code).toBe('BC02');
    expect(op.before.code).toBe('OLD');
  });

  it('skips points that already have the code, so the batch is only real changes', () => {
    const map = asMap([pt('a', { code: 'BC02' }), pt('b', { code: 'OTHER' })]);
    const ops = planRecode(['a', 'b'], map, 'BC02');
    expect(ops.map((o) => o.featureId)).toEqual(['b']);
  });

  it('trims, and can clear a code to empty', () => {
    expect(planRecode(['a'], asMap([pt('a', { code: 'X' })]), '  BC02 ')[0].after.code).toBe('BC02');
    expect(planRecode(['a'], asMap([pt('a', { code: 'X' })]), '')[0].after.code).toBe('');
  });

  it('needs no alias sweep, because `code` wins its own resolution chain', () => {
    // pointCodeOf reads `code ?? rawCode ?? resolvedAlphaCode`. `code` is FIRST, so writing it
    // always wins — the asymmetry with pointNumberOf, where the canonical key is third, is exactly
    // why renumber needs the sweep and this does not.
    const ops = planRecode(['a'], asMap([pt('a', { code: 'OLD', rawCode: 'LEGACY' })]), 'NEW');
    expect(ops[0].after).not.toHaveProperty('rawCode');
  });
});
