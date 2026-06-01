// lib/cad/io/trv-line-style.ts
//
// cad-trv-straight-line-styling Slice 1 — decode a traverse's
// per-line style from its `51` / `71` styling records into Starr
// style fields. The field meanings were cracked by pairing the
// Traverse Drawing Settings dialogs (Fill + Control/Base tabs)
// with the raw records from the live Garland file:
//
//   71,<A>,<B>   — A = TPC internal fill enum.
//                  A < 5  → NO fill.
//                  A >= 5 → dropdown index = A - 5, mapped via
//                  tpcFillIndexToStarr. (DECK "Diagonal /"(0) → 5,
//                  ROAD "5 Percent"(17) → 22 — both confirm the
//                  offset of 5.)
//
//   51,<f0>,<f1>,...  — f0 = line-weight code (BOUNDARY=8 bold,
//                  others=0 hairline); f1 = line-type code
//                  (1=Solid, -43=Fence Wire).
//
// Pure module: no DOM, no React, no store deps.

import type { FillPattern } from '../types';
import { tpcFillIndexToStarr } from './trv-fill-patterns';

export interface TrvLineStyle {
  /** Starr line-type id (SOLID / FENCE_BARBED_WIRE / …). */
  lineTypeId: string;
  /** True when the source line is bold/heavy (e.g. the boundary). */
  isBold: boolean;
  /** Starr fill pattern (NONE when the traverse has no fill). */
  fillPattern: FillPattern;
  /** Fill rotation in degrees (0 when no fill / unrotated). */
  fillRotation: number;
  /** Fill density multiplier (1 when no fill / default). */
  fillDensity: number;
  /** The TPC fill name this decoded to, for audit. Null when no
   *  fill. */
  tpcFillName: string | null;
}

const DEFAULT_STYLE: TrvLineStyle = {
  lineTypeId: 'SOLID',
  isBold: false,
  fillPattern: 'NONE',
  fillRotation: 0,
  fillDensity: 1,
  tpcFillName: null,
};

/** Decode the line style from a traverse's styling records. */
export function decodeTrvLineStyle(
  records: ReadonlyArray<{ code: string; fields: string[] }>,
): TrvLineStyle {
  const out: TrvLineStyle = { ...DEFAULT_STYLE };

  // ── Line type + weight from the first 51 record ──
  const r51 = records.find((r) => r.code === '51');
  if (r51) {
    const f0 = parseIntOr(r51.fields[0], 0);
    const f1 = parseIntOr(r51.fields[1], 1);
    out.isBold = f0 >= 4;
    out.lineTypeId = lineTypeCodeToStarr(f1);
  }

  // ── Fill from the first 71 record (field 0 = TPC fill enum) ──
  const r71 = records.find((r) => r.code === '71');
  if (r71) {
    const a = parseIntOr(r71.fields[0], 0);
    if (a >= 5) {
      const spec = tpcFillIndexToStarr(a - 5);
      if (spec) {
        out.fillPattern = spec.pattern;
        out.fillRotation = spec.rotation;
        out.fillDensity = spec.density;
        out.tpcFillName = spec.tpcName;
      }
    }
  }

  return out;
}

/** Map a TPC `51` line-type code to a Starr line-type id.
 *  Conservative: only the codes confirmed against ground truth
 *  are mapped; everything else falls back to SOLID (the source
 *  record still round-trips verbatim).
 *
 *  cad-trv-drawing-element-rendering Slice 6 — observed-but-
 *  UNCONFIRMED `51` field1 codes across the Hillsboro sample:
 *  `0` (CSV master-list traverses), `6`, `10`, `39`, `40` ("sw
 *  adjoiner line" — likely a dashed neighbor line). These are
 *  deliberately NOT mapped: a single file isn't enough ground
 *  truth to assign a dash pattern without risking wrong styling on
 *  other files. TODO: ground-truth code→line-type across more TPC
 *  exports (pair each with its plotted PDF) before extending this
 *  map. Until then SOLID is the safe default + the records still
 *  round-trip verbatim. */
function lineTypeCodeToStarr(code: number): string {
  if (code === -43) return 'FENCE_BARBED_WIRE'; // TPC "Fence Wire"
  // 1 = Solid (the overwhelming default). Any other code is an
  // unconfirmed TPC line type → SOLID until ground-truthed.
  return 'SOLID';
}

function parseIntOr(s: string | undefined, fallback: number): number {
  if (s === undefined) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}
