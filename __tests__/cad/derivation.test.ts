// C30 — "show the work".
//
// ── WHAT C27 GOT HALF RIGHT ─────────────────────────────────────────────────────────────────────
//
// F1 said provenance exists on one surface and "the field does not exist on `Feature`". The first
// half is right; the second is not. `lib/cad/ai/provenance.ts` is a complete five-field model with
// stamp/read/strip and a right-click "Why did AI draw this?" — but it is **AI-scoped**: origin,
// confidence, prompt hash, batch id. None of that means anything for a curve somebody solved in a
// calculator.
//
// So the calculated half had nothing. And by the end of C29, **four surfaces had each invented
// their own vocabulary for it** — `calcSource: 'CURVE_CALCULATOR' | 'SPIRAL_CALCULATOR' |
// 'PARTITION' | 'SPLINE_TO_ARCS'`, each with ad-hoc `calcRadius` / `calcAreaSqft` /
// `calcMaxDeviation` neighbours. That drift was introduced *by the slices that were filling the
// gap*, which is the clearest argument available for doing the model before the next one.
//
// ── WHY IT MATTERS ON A PLAT ────────────────────────────────────────────────────────────────────
//
// A calculated point that cannot say what it was calculated FROM is indistinguishable from a point
// somebody typed. On a deliverable that distinction is the whole question — the difference between
// a corner solved from two record calls and a corner that was moved because it looked wrong.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  stampDerivation,
  readDerivation,
  hasDerivation,
  stripDerivation,
  describeDerivation,
  DERIVATION_KEYS,
  type Derivation,
} from '@/lib/cad/derivation';
import { AI_PROVENANCE_KEYS } from '@/lib/cad/ai/provenance';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature } from '@/lib/cad/types';

const sample = (over: Partial<Derivation> = {}): Derivation => ({
  method: 'CURVE_CALCULATOR',
  inputs: { radius: 200, deltaDeg: 60, direction: 'RIGHT' },
  outputs: { arcLength: 209.44 },
  at: '2026-08-15T12:00:00.000Z',
  ...over,
});

const feature = (properties: Record<string, string | number | boolean>): Feature => ({
  id: 'f1', type: 'ARC',
  geometry: { type: 'ARC' },
  layerId: 'L', style: { ...DEFAULT_FEATURE_STYLE },
  properties,
});

describe('round trip', () => {
  it('survives the properties bag, which holds primitives only', () => {
    const props = stampDerivation({}, sample());
    const back = readDerivation(props)!;
    expect(back).toEqual(sample());
  });

  it('carries source ids when there are any', () => {
    const d = sample({ sourceIds: ['a', 'b'] });
    expect(readDerivation(stampDerivation({}, d))!.sourceIds).toEqual(['a', 'b']);
  });

  it('omits empty outputs and sources rather than storing "{}" ', () => {
    // An empty object in the file is indistinguishable from a real one with nothing in it, and the
    // audit panel would print a "Solved:" heading with nothing under it.
    const props = stampDerivation({}, { method: 'OFFSET', inputs: { distance: 5 }, at: 'now' });
    expect(props.derivedOutputs).toBeUndefined();
    expect(props.derivedFrom).toBeUndefined();
    expect(readDerivation(props)!.outputs).toBeUndefined();
  });

  it('does not mutate the bag it was given', () => {
    // A caller building the feature and the undo `before` from the same source must not have one
    // change under the other.
    const original = { existing: 'kept' };
    const stamped = stampDerivation(original, sample());
    expect(original).toEqual({ existing: 'kept' });
    expect(stamped.existing).toBe('kept');
  });

  it('leaves other properties alone', () => {
    const props = stampDerivation({ pointName: '14', elevation: 250 }, sample());
    expect(props.pointName).toBe('14');
    expect(props.elevation).toBe(250);
  });
});

describe('reading a file somebody edited', () => {
  it('returns null when there is no derivation', () => {
    expect(readDerivation({})).toBeNull();
    expect(readDerivation({ pointName: '14' })).toBeNull();
    expect(readDerivation({ derivedMethod: '' })).toBeNull();
  });

  it('does not throw on malformed JSON', () => {
    // A hand-edited file or a half-written property must not make a feature unreadable. The
    // drawing still has to open, and a missing input list is a far smaller problem than a canvas
    // that will not render.
    const d = readDerivation({ derivedMethod: 'PARTITION', derivedInputs: '{ broken' })!;
    expect(d.method).toBe('PARTITION');
    expect(d.inputs).toEqual({});
  });

  it('tolerates a non-string payload', () => {
    const d = readDerivation({ derivedMethod: 'OFFSET', derivedInputs: 42 })!;
    expect(d.inputs).toEqual({});
  });

  it('hasDerivation agrees with readDerivation', () => {
    expect(hasDerivation(feature(stampDerivation({}, sample())))).toBe(true);
    expect(hasDerivation(feature({}))).toBe(false);
  });
});

describe('stripping', () => {
  it('removes every key it owns and nothing else', () => {
    // Geometry that has been dragged is no longer the geometry the calculation produced, and
    // leaving the stamp on would make it claim a derivation it no longer has.
    const props = stampDerivation({ pointName: '14' }, sample({ sourceIds: ['x'] }));
    const stripped = stripDerivation(props);
    for (const k of DERIVATION_KEYS) expect(stripped[k]).toBeUndefined();
    expect(stripped.pointName).toBe('14');
    expect(readDerivation(stripped)).toBeNull();
  });
});

describe('it does not collide with the AI provenance model', () => {
  it('owns a disjoint set of keys', () => {
    // Both live in the same properties bag. An overlap would mean stripping one silently damaged
    // the other, and a feature that is both AI-authored and calculated is an ordinary thing.
    const overlap = DERIVATION_KEYS.filter((k) => (AI_PROVENANCE_KEYS as readonly string[]).includes(k));
    expect(overlap).toEqual([]);
  });

  it('a feature can carry both', () => {
    const props = stampDerivation({ aiOrigin: 'COMMAND_addPoint', aiConfidence: 0.9 }, sample());
    expect(readDerivation(props)!.method).toBe('CURVE_CALCULATOR');
    expect(props.aiOrigin).toBe('COMMAND_addPoint');
    // And stripping one leaves the other intact.
    expect(stripDerivation(props).aiOrigin).toBe('COMMAND_addPoint');
  });
});

describe('what the audit panel shows', () => {
  it('separates what was GIVEN from what was SOLVED', () => {
    // "R 200, L 209.44" tells a reader nothing about which was which, and on a plat under
    // examination that is the only thing being asked.
    const d = describeDerivation(sample());
    expect(d.inputs.map(([k]) => k)).toContain('Radius');
    expect(d.outputs.map(([k]) => k)).toContain('Arc length');
    expect(d.inputs.map(([k]) => k)).not.toContain('Arc length');
  });

  it('names the method in words', () => {
    expect(describeDerivation(sample()).title).toBe('Curve calculator');
    expect(describeDerivation(sample({ method: 'SPLINE_TO_ARCS' })).title)
      .toBe('Converted from a spline');
  });

  it('humanises the keys instead of printing identifiers', () => {
    const d = describeDerivation(sample({ inputs: { tangentBearingDeg: 137.5 } }));
    expect(d.inputs[0][0]).toBe('Tangent bearing deg');
  });

  it('does not print float noise', () => {
    const d = describeDerivation(sample({ inputs: { radius: 0.1 + 0.2 } }));
    expect(d.inputs[0][1]).toBe('0.3');
  });

  it('falls back to the raw method for an unknown one', () => {
    // A drawing saved by a newer build must still render its audit line rather than "undefined".
    const d = describeDerivation({ method: 'FUTURE_METHOD' as never, inputs: {}, at: '' });
    expect(d.title).toBe('FUTURE_METHOD');
  });
});

// ── The migration: four vocabularies became one ────────────────────────────────────────────────
describe('every calculated surface uses the shared model', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  const surfaces = [
    'lib/cad/calculators/place-curve.ts',
    'app/admin/cad/components/AdvancedCurveCalculator.tsx',
    'app/admin/cad/components/PartitionCalculator.tsx',
    'app/admin/cad/components/FeatureContextMenu.tsx',
  ];

  it.each(surfaces)('%s stamps a derivation', (p) => {
    expect(read(p)).toMatch(/stampDerivation\(/);
  });

  it('and none of them still writes the ad-hoc calcSource key', () => {
    // The drift this slice exists to remove. Four surfaces, four vocabularies, all written by the
    // slices that were filling the gap.
    for (const p of surfaces) {
      expect(read(p), p).not.toMatch(/calcSource:/);
    }
  });

  it('the partition keeps requested and achieved on OPPOSITE sides', () => {
    // The split the shared model enforces is exactly the one that calculation turns on.
    const src = read('app/admin/cad/components/PartitionCalculator.tsx');
    expect(src).toMatch(/inputs: \{[\s\S]{0,200}requestedSqft/);
    expect(src).toMatch(/outputs: \{[\s\S]{0,200}achievedSqft/);
  });

  it('the spline conversion records what it came FROM', () => {
    // Those arcs came from a specific spline that no longer exists, and that lineage is the only
    // way to answer "where did this curve come from" once the original is gone.
    const src = read('app/admin/cad/components/FeatureContextMenu.tsx');
    expect(src).toMatch(/sourceIds: \[f\.id\]/);
  });
});

describe('the surveyor can read it back', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/FeatureContextMenu.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('there is a "How was this made?" row', () => {
    expect(src).toMatch(/How was this made\?/);
    expect(src).toMatch(/readDerivation\(feature\.properties\)/);
  });

  it('only on features that carry one', () => {
    expect(src).toMatch(/if \(derivation\) \{/);
  });

  it('it is a separate row from the AI explanation', () => {
    // They answer different questions with different evidence; folding them together would mean
    // neither answer could be as specific as it should be.
    expect(src).toMatch(/id: 'whyAi'/);
    expect(src).toMatch(/id: 'howMade'/);
  });

  it('labels the given values as given and the solved as solved', () => {
    expect(src).toMatch(/'Given:'/);
    expect(src).toMatch(/'Solved:'/);
  });
});
