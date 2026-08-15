// lib/cad/points/renumber.ts
//
// C11 of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Renumber and re-code a set of points, as one undoable batch.
//
// ── THE ALIAS CHAIN IS THE WHOLE DIFFICULTY ─────────────────────────────────────────────────────
//
// A point's number is not one field. `pointNumberOf` resolves it as:
//
//     properties.pointNo ?? properties.pointNumber ?? properties.pointName ?? properties.name
//
// with `pointName` as the canonical key that `canonicalizePointName` migrates toward. Historic
// imports, manual draws and older renumber operations each populated different members of that
// chain, so a given drawing can carry any subset of them.
//
// **Writing only the canonical key is therefore wrong.** If a feature carries `pointNo: '12'` and
// you set `pointName: '40'`, `pointNumberOf` still returns 12 — `pointNo` wins. The point renumbers
// in the store, keeps its old number everywhere the resolver is used, and nothing errors. So this
// writes EVERY alias the feature already has, plus the canonical key. It never *adds* aliases a
// feature did not have; that would spread the legacy shape the migration is trying to retire.
//
// ── COLLISIONS ARE REPORTED, NOT SILENTLY ALLOWED ───────────────────────────────────────────────
//
// Renumbering 5-12 into a range that already contains point 8 produces two points numbered 8. Every
// downstream lookup keyed by number (`buildPointNoIndex`, range selection, the AI's "point 8") then
// resolves ambiguously — `parsePointRangeString` has an AMBIGUOUS status precisely because this
// happens. The plan reports the clash rather than proceeding, because the failure surfaces later,
// somewhere else, as a wrong point.

import type { Feature } from '../types';
import { pointNumberOf } from '../feature-fields';

/** Every key `pointNumberOf` consults, in its resolution order. */
const NUMBER_ALIASES = ['pointNo', 'pointNumber', 'pointName', 'name'] as const;
const CANONICAL = 'pointName';

export interface RenumberOp {
  featureId: string;
  before: Record<string, string | number | boolean>;
  after: Record<string, string | number | boolean>;
  from: string | null;
  to: string;
}

export interface RenumberPlan {
  ops: RenumberOp[];
  /** Numbers that would collide with a point OUTSIDE the selection. */
  collisions: string[];
}

/**
 * Assign sequential numbers to the chosen features, starting at `startAt`.
 *
 * Order is by CURRENT number ascending, with unnumbered points last, so renumbering preserves the
 * relative order a surveyor already sees rather than the arbitrary order of a Set. Ties and
 * unnumbered points fall back to feature id for determinism — the same input must always give the
 * same output, or an undo/redo can land differently from the original.
 */
export function planRenumber(
  featureIds: ReadonlyArray<string>,
  features: Readonly<Record<string, Feature>>,
  startAt: number,
): RenumberPlan {
  const chosen = featureIds
    .map((id) => features[id])
    .filter((f): f is Feature => !!f && f.type === 'POINT');

  const numeric = (f: Feature) => {
    const raw = pointNumberOf(f as never);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const ordered = [...chosen].sort((a, b) => {
    const d = numeric(a) - numeric(b);
    return d !== 0 && Number.isFinite(d) ? d : a.id.localeCompare(b.id);
  });

  const selected = new Set(ordered.map((f) => f.id));
  // Numbers held by points NOT being renumbered — the only ones that can be collided with.
  const takenOutside = new Set<string>();
  for (const f of Object.values(features)) {
    if (f.type !== 'POINT' || selected.has(f.id)) continue;
    const n = pointNumberOf(f as never);
    if (n) takenOutside.add(n);
  }

  const ops: RenumberOp[] = [];
  const collisions: string[] = [];

  ordered.forEach((f, i) => {
    const to = String(startAt + i);
    if (takenOutside.has(to)) collisions.push(to);

    const props = (f.properties ?? {}) as Record<string, string | number | boolean>;
    const before: Record<string, string | number | boolean> = {};
    const after: Record<string, string | number | boolean> = {};

    // Every alias the feature ALREADY carries, so no higher-priority stale key shadows the new
    // number. Aliases it does not carry are not added.
    for (const key of NUMBER_ALIASES) {
      if (key in props) {
        before[key] = props[key];
        after[key] = to;
      }
    }
    // The canonical key is always written, even on a feature that had no number at all.
    if (!(CANONICAL in after)) {
      if (CANONICAL in props) before[CANONICAL] = props[CANONICAL];
      after[CANONICAL] = to;
    }

    ops.push({ featureId: f.id, before, after, from: pointNumberOf(f as never), to });
  });

  return { ops, collisions };
}

export interface RecodeOp {
  featureId: string;
  before: Record<string, string | number | boolean>;
  after: Record<string, string | number | boolean>;
}

/**
 * Set the survey code on a set of points.
 *
 * Writes `properties.code`, which is what `rowEditToFeatureUpdate` writes for a single-cell edit —
 * one write path for one field, so a bulk re-code and a typed one cannot disagree.
 *
 * `pointCodeOf` reads `code ?? rawCode ?? resolvedAlphaCode`, so the same shadowing hazard exists
 * here in principle. It does not bite: `code` is FIRST in that chain, so writing it always wins.
 * The asymmetry with `pointNumberOf` — where the canonical key is third — is the reason renumber
 * needs the alias sweep and this does not.
 */
export function planRecode(
  featureIds: ReadonlyArray<string>,
  features: Readonly<Record<string, Feature>>,
  code: string,
): RecodeOp[] {
  const next = code.trim();
  const ops: RecodeOp[] = [];
  for (const id of featureIds) {
    const f = features[id];
    if (!f || f.type !== 'POINT') continue;
    const props = (f.properties ?? {}) as Record<string, string | number | boolean>;
    if (String(props.code ?? '') === next) continue;
    ops.push({
      featureId: id,
      before: { code: props.code ?? '' },
      after: { code: next },
    });
  }
  return ops;
}
