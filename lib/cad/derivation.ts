// lib/cad/derivation.ts — C30, "show the work"
//
// ── WHAT WAS ALREADY THERE, AND WHAT WAS NOT ────────────────────────────────────────────────────
//
// C27's F1 said provenance exists on one surface and "the field does not exist on `Feature`". Half
// right. `lib/cad/ai/provenance.ts` is a complete five-field model with stamp/read/strip and a
// right-click "Why did AI draw this?" — but it is **AI-scoped**: origin, confidence, prompt hash,
// batch id. None of that means anything for a curve somebody solved in a calculator.
//
// So the calculated half had nothing, and by the end of C29 four surfaces had each invented their
// own vocabulary for it — `calcSource: 'CURVE_CALCULATOR' | 'SPIRAL_CALCULATOR' | 'PARTITION' |
// 'SPLINE_TO_ARCS'`, each with its own ad-hoc `calcRadius` / `calcAreaSqft` / `calcMaxDeviation`
// neighbours. **That drift was introduced by the slices that were fixing the gap**, which is the
// clearest possible argument for doing the model before the next one.
//
// ── WHY THIS MATTERS ON A PLAT ──────────────────────────────────────────────────────────────────
//
// A calculated point that cannot say what it was calculated FROM is indistinguishable from a point
// somebody typed. On a survey deliverable that distinction is the whole question — it is the
// difference between a corner that was solved from two record calls and a corner that was moved
// because it looked wrong. "Show the work" is what makes a calculation defensible when a deed gets
// examined years later.
//
// ── WHY THE PROPERTIES BAG, AND NOT A NEW FIELD ─────────────────────────────────────────────────
//
// Same reason `aiOrigin` lives there: every reader, writer, exporter and undo path already carries
// `properties` verbatim, and a drawing saved before this loads without a migration. A new top-level
// field on `Feature` would need every one of those touched, and would make old files fail the
// stricter validators. C8 and C18 both reached the same conclusion for the same reason.

import type { Feature } from './types';

type FeatureProperties = Record<string, string | number | boolean>;

/** What made this geometry. Values are stable strings, because they are written into saved files
 *  and a rename would orphan every drawing that already carries the old one. */
export type DerivationMethod =
  | 'CURVE_CALCULATOR'
  | 'COMPOUND_CURVE'
  | 'REVERSE_CURVE'
  | 'SPIRAL'
  | 'PARTITION'
  | 'SPLINE_TO_ARCS'
  | 'INTERSECTION'
  | 'CALC_POINT'
  | 'OFFSET'
  | 'STAKEOUT';

export interface Derivation {
  method: DerivationMethod;
  /**
   * The inputs, as the surveyor gave them — `{ radius: 200, delta: 60 }`.
   *
   * Values only, no units in the keys: the drawing has one linear unit and one angular one, and a
   * key like `radiusFt` would be a lie the day somebody works in metres. Where a unit is genuinely
   * part of the value (a percentage grade, an angle in degrees) the key says so.
   */
  inputs: Record<string, number | string>;
  /**
   * What came out, as ACHIEVED rather than as requested.
   *
   * The distinction C29's partition slice turned on: a cut line labelled with the area that was
   * asked for is exactly the failure the calculation exists to prevent.
   */
  outputs?: Record<string, number | string>;
  /** ISO timestamp. */
  at: string;
  /** Features this was derived from, when it was derived from features at all. Empty for a
   *  calculation typed from record data. */
  sourceIds?: string[];
}

/** The keys this module owns. Anything else in `properties` is left alone by stamp/read/strip —
 *  the same contract `AI_PROVENANCE_KEYS` establishes for the AI half. */
export const DERIVATION_KEYS = [
  'derivedMethod',
  'derivedInputs',
  'derivedOutputs',
  'derivedAt',
  'derivedFrom',
] as const;

/**
 * Stamp a derivation onto a properties bag.
 *
 * Objects and arrays are JSON-encoded, because `properties` holds primitives only. Returns a new
 * bag; nothing is mutated, so a caller can build the feature and the undo `before` from the same
 * source without one of them changing under the other.
 */
export function stampDerivation(
  properties: FeatureProperties,
  d: Derivation,
): FeatureProperties {
  const out: FeatureProperties = {
    ...properties,
    derivedMethod: d.method,
    derivedInputs: JSON.stringify(d.inputs),
    derivedAt: d.at,
  };
  if (d.outputs && Object.keys(d.outputs).length > 0) {
    out.derivedOutputs = JSON.stringify(d.outputs);
  }
  if (d.sourceIds && d.sourceIds.length > 0) {
    out.derivedFrom = JSON.stringify(d.sourceIds);
  }
  return out;
}

/**
 * Read a derivation back, or null when there is none.
 *
 * **Malformed JSON yields an empty object rather than throwing.** A hand-edited file or a
 * half-written property should not make a feature unreadable — the drawing still has to open, and
 * a missing input list is a far smaller problem than a canvas that will not render.
 */
export function readDerivation(properties: FeatureProperties): Derivation | null {
  const method = properties.derivedMethod;
  if (typeof method !== 'string' || !method) return null;

  const parse = <T>(raw: unknown, fallback: T): T => {
    if (typeof raw !== 'string') return fallback;
    try {
      const v = JSON.parse(raw);
      return (v ?? fallback) as T;
    } catch {
      return fallback;
    }
  };

  return {
    method: method as DerivationMethod,
    inputs: parse<Record<string, number | string>>(properties.derivedInputs, {}),
    outputs: properties.derivedOutputs === undefined
      ? undefined
      : parse<Record<string, number | string>>(properties.derivedOutputs, {}),
    at: typeof properties.derivedAt === 'string' ? properties.derivedAt : '',
    sourceIds: properties.derivedFrom === undefined
      ? undefined
      : parse<string[]>(properties.derivedFrom, []),
  };
}

export function hasDerivation(feature: Feature): boolean {
  return typeof feature.properties?.derivedMethod === 'string'
    && feature.properties.derivedMethod !== '';
}

/** Remove the derivation keys, leaving everything else. Used when a feature is edited by hand:
 *  geometry that has been dragged is no longer the geometry the calculation produced, and leaving
 *  the stamp on would make it claim a derivation it no longer has. */
export function stripDerivation(properties: FeatureProperties): FeatureProperties {
  const out = { ...properties };
  for (const k of DERIVATION_KEYS) delete out[k];
  return out;
}

const METHOD_LABEL: Record<DerivationMethod, string> = {
  CURVE_CALCULATOR: 'Curve calculator',
  COMPOUND_CURVE: 'Compound curve',
  REVERSE_CURVE: 'Reverse curve',
  SPIRAL: 'Clothoid spiral',
  PARTITION: 'Partition to an area',
  SPLINE_TO_ARCS: 'Converted from a spline',
  INTERSECTION: 'Intersection',
  CALC_POINT: 'Calculated point',
  OFFSET: 'Offset',
  STAKEOUT: 'Stakeout',
};

/**
 * Human-readable lines for a derivation, for the audit panel.
 *
 * Inputs and outputs are listed separately and labelled, because "R 200, L 209.44" tells a reader
 * nothing about which of the two was given and which was solved — and on a plat under examination,
 * that is the only thing being asked.
 */
export function describeDerivation(d: Derivation): {
  title: string;
  inputs: Array<[string, string]>;
  outputs: Array<[string, string]>;
} {
  const fmt = (v: number | string) =>
    typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : v;
  return {
    title: METHOD_LABEL[d.method] ?? d.method,
    inputs: Object.entries(d.inputs).map(([k, v]) => [humanKey(k), fmt(v)]),
    outputs: Object.entries(d.outputs ?? {}).map(([k, v]) => [humanKey(k), fmt(v)]),
  };
}

/** `deltaDeg` → `Delta deg`. Cheap, and better than showing a reader a camelCase identifier.
 *
 *  Sentence case, not title case: these are labels in a list, and `Tangent Bearing Deg` is title
 *  case applied for no reason to words that are not a title. */
function humanKey(k: string): string {
  const spaced = k.replace(/([a-z0-9])([A-Z])/g, (_m, a: string, b: string) => `${a} ${b.toLowerCase()}`);
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
