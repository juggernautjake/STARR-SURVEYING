// lib/cad/operations/apply-offset-from-panel.ts
//
// Pure helper that converts the floating OffsetPanel's user-typed
// distance + unit into a feet-denominated `applyInteractiveOffset`
// call. Extracted from the panel component so it can be unit-tested
// without React.
//
// The world coordinate unit is US Survey Feet; this helper does the
// conversion from whichever unit the surveyor picked in the panel.
//
// Slice 1 of cad-offset-tool-2026-05-29.md.

import { applyInteractiveOffset } from '@/lib/cad/operations';
import type { LinearUnit } from '@/lib/cad/types';

// Conversion table — duplicated tiny constants here so the helper can
// stay decoupled from the parser file (no `parseLength` is needed,
// the panel hands us a numeric value + a unit token directly).
//
// Source of truth for the multipliers is
// `lib/cad/units/parse-length.ts` — keep them in sync if either
// changes.
const FT_PER_INCH = 1 / 12;
const FT_PER_METER = 1 / 0.3048; // US survey foot definition
const UNIT_TO_FT: Record<LinearUnit, number> = {
  FT:   1,
  IN:   FT_PER_INCH,
  MILE: 5280,
  M:    FT_PER_METER,
  CM:   FT_PER_METER / 100,
  MM:   FT_PER_METER / 1000,
};

/** Inputs every offset commit needs to know. Mirrors the shape of
 *  the panel's local state so the panel can pass `{ ...inputs }`
 *  unchanged. */
export interface OffsetPanelInputs {
  /** Feature id the offset is built against. Required. */
  sourceId: string;
  /** Distance the user typed, in the unit they picked. */
  distance: number;
  /** Unit token the user picked (defaults to the drawing's linearUnit
   *  in the panel UI). */
  unit: LinearUnit;
  /** Which side of the source feature to lay the offset on. BOTH
   *  produces two features. */
  side: 'LEFT' | 'RIGHT' | 'BOTH';
  /** Corner-handling mode for polyline / polygon sources. */
  cornerHandling: 'MITER' | 'ROUND' | 'CHAMFER';
}

/** Convert a distance + unit to canonical US Survey Feet. Returns
 *  `null` on bad input so callers can short-circuit without throwing.
 *  Exported for the test suite + so the panel can preview the
 *  feet-equivalent value next to the input. */
export function distanceToFeet(distance: number, unit: LinearUnit): number | null {
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const factor = UNIT_TO_FT[unit];
  if (factor === undefined) return null;
  return distance * factor;
}

/** Commit the offset described by `inputs`. Returns `true` when the
 *  offset reached the drawing store, `false` when the inputs were
 *  rejected (bad distance, missing source, etc.). Pure with respect
 *  to React — safe to call from any handler. */
export function applyOffsetFromPanel(inputs: OffsetPanelInputs): boolean {
  if (!inputs.sourceId) return false;
  const distanceFeet = distanceToFeet(inputs.distance, inputs.unit);
  if (distanceFeet === null) return false;

  applyInteractiveOffset(
    inputs.sourceId,
    distanceFeet,
    inputs.side,
    inputs.cornerHandling,
    {
      mode: 'PARALLEL',
      // Slice 3 — stamp the panel's typed value + unit onto every
      // emitted feature so Phase 2's inspector + the live-edit
      // propagator can find them.
      metadata: {
        typedDistance: inputs.distance,
        typedUnit: inputs.unit,
      },
    },
  );
  return true;
}
