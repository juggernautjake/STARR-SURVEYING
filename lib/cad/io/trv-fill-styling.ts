// lib/cad/io/trv-fill-styling.ts
//
// cad-trv-element-coverage Slice 4 — partial decoder for TRV's
// per-traverse fill styling (records 51 / 70 / 71). Traverse PC
// doesn't publish the binary format of these records; we
// observed the following stable signal across the live samples:
//
//   71,<f0>,<f1>
//
//   f0 = 0  → no fill (default; covers 15 / 20 Garland traverses)
//   f0 > 0  → fill enabled, f1 carries a pattern subtype index
//             (observed: 5/37 on DECK + WEST BUILDING, 22/X on
//             other closed shapes)
//
//   70,<f0>,<scale>,<rotationOrParam>,<angleOrParam>,<f4>
//
//   f0 = 0  → default (every observed 70 record has f0 = 0)
//
//   51,<24+ fields including a 32-bit color packed in field 4>
//   — color decoding deferred (no Traverse PC docs for the
//   encoding; sign-bit-set values suggest a system-palette
//   index rather than RGB).
//
// What this module SHIPS today:
//   - hasTrvFillSpec(records) — detects fill-bearing traverses
//     via the `71 f0 > 0` signal so a downstream consumer can
//     opt into the existing infill UI to set the pattern
//     manually.
//   - extractTrvFillSummary(records) — returns the raw
//     subtype + scale + angle values that DO appear (preserved
//     verbatim for inspection / future ground-truth decoding).
//
// What this module DOES NOT do today:
//   - Pick a specific Starr `fillPattern` (DOT_UNIFORM /
//     CROSSHATCH / BRICK / etc.) for a TRV subtype. Without
//     known-good ground-truth this would mislead the surveyor.
//     Queued for once we have a TRV with an explicit known
//     fill to calibrate against.
//
// Pure module: no DOM, no React, no store deps.

export interface TrvFillSummary {
  /** True when at least one 71 record has field 0 > 0. */
  hasFill: boolean;
  /** Raw subtype index from `71` field 1 (the first 71 with
   *  field 0 > 0). Null when no fill. */
  subtypeIndex: number | null;
  /** Raw 71 field 0 value (the "fill enable / kind" code). Null
   *  when no fill. */
  fillKindCode: number | null;
  /** Scale value from 70 field 1 (every observed 70 record has
   *  this; default 5.0 on the live samples). Null when no 70
   *  record. */
  scale: number | null;
  /** Field 3 of the 70 record (observed values: 170.000000 on
   *  every Garland traverse — likely a rotation in degrees but
   *  ground-truth undecoded). Null when no 70 record. */
  param170: number | null;
}

/** Pure helper: walk a traverse's styling records + summarise
 *  the fill metadata. */
export function extractTrvFillSummary(
  records: ReadonlyArray<{ code: string; fields: string[] }>,
): TrvFillSummary {
  const summary: TrvFillSummary = {
    hasFill: false,
    subtypeIndex: null,
    fillKindCode: null,
    scale: null,
    param170: null,
  };

  for (const r of records) {
    if (r.code === '71') {
      const f0 = parseIntOrNull(r.fields[0]);
      if (f0 !== null && f0 > 0 && !summary.hasFill) {
        summary.hasFill = true;
        summary.fillKindCode = f0;
        summary.subtypeIndex = parseIntOrNull(r.fields[1]);
      }
    }
    if (r.code === '70' && summary.scale === null) {
      summary.scale = parseFloatOrNull(r.fields[1]);
      summary.param170 = parseFloatOrNull(r.fields[3]);
    }
  }
  return summary;
}

/** Convenience: just the boolean for callers that don't need
 *  the full summary. */
export function hasTrvFillSpec(records: ReadonlyArray<{ code: string; fields: string[] }>): boolean {
  return extractTrvFillSummary(records).hasFill;
}

function parseIntOrNull(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
function parseFloatOrNull(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
