// worker/src/lib/curve-params.ts
// Curve Parameter Completeness Calculator — Starr Software Spec v2.0 §16 (Known Issue #11)
//
// Computes the complete set of 5 circular curve parameters from any combination
// of at least 2 known parameters (R + one other). The five parameters are:
//
//   R  = Radius (feet)
//   L  = Arc Length (feet)        [also written A= in some deeds]
//   Δ  = Delta / Central Angle (degrees)
//   C  = Chord Distance (feet)    [also written LC=]
//   CB = Chord Bearing (bearing string, e.g. "N 45°28'15\" E")
//
// Relationships:
//   L  = R × Δ_rad
//   C  = 2R × sin(Δ/2)
//   Δ  = L / R  (in radians)
//   Δ  = 2 × arcsin(C / (2R))
//
// The chord bearing (CB) requires knowing the entry tangent bearing,
// which is derived from the preceding call's bearing (rotated by Δ/2
// in the curve direction). When entry bearing is unavailable, CB is
// returned as null.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CurveParams {
  /** Radius in feet */
  radius_ft:     number | null;
  /** Arc length in feet */
  arcLength_ft:  number | null;
  /** Central angle in decimal degrees */
  delta_deg:     number | null;
  /** Chord distance in feet */
  chord_ft:      number | null;
  /** Chord bearing as a formatted string (e.g. "N 45°28'15\" E"), null if not computable */
  chordBearing:  string | null;
  /** Curve direction */
  direction:     'left' | 'right' | null;
}

export type KnownCurveParams = Partial<{
  radius_ft:     number;
  arcLength_ft:  number;
  delta_deg:     number;
  chord_ft:      number;
  direction:     'left' | 'right';
}>;

export interface CurveCompletionResult {
  params:    CurveParams;
  computed:  Array<keyof Omit<CurveParams, 'chordBearing' | 'direction'>>;
  warnings:  string[];
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function toRad(deg: number): number { return deg * Math.PI / 180; }
function toDeg(rad: number): number { return rad * 180 / Math.PI; }

/**
 * Format a decimal-degree azimuth (0-360, clockwise from N) to
 * a quadrant bearing string "N DD°MM'SS\" E".
 */
function azimuthToQuadrant(azimuth: number): string {
  const az  = ((azimuth % 360) + 360) % 360;
  let ns: 'N' | 'S';
  let ew: 'E' | 'W';
  let deg: number;

  if (az <= 90) {
    ns = 'N'; ew = 'E'; deg = az;
  } else if (az <= 180) {
    ns = 'S'; ew = 'E'; deg = 180 - az;
  } else if (az <= 270) {
    ns = 'S'; ew = 'W'; deg = az - 180;
  } else {
    ns = 'N'; ew = 'W'; deg = 360 - az;
  }

  const d  = Math.floor(deg);
  const m  = Math.floor((deg - d) * 60);
  const s  = Math.round(((deg - d) * 60 - m) * 60);
  return `${ns} ${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}" ${ew}`;
}

/**
 * Parse "N DD°MM'SS\" E" → decimal-degree azimuth (0-360, clockwise from N).
 */
function quadrantToAzimuth(bearing: string): number | null {
  const m = bearing.match(/([NS])\s*(\d+)[°\s]\s*(\d+)?[''\s]?\s*(\d+(?:\.\d+)?)?[""']?\s*([EW])/i);
  if (!m) return null;
  const ns = m[1].toUpperCase(); const ew = m[5].toUpperCase();
  const d  = parseFloat(m[2] ?? '0');
  const mi = parseFloat(m[3] ?? '0');
  const s  = parseFloat(m[4] ?? '0');
  const deg = d + mi / 60 + s / 3600;
  if (ns === 'N' && ew === 'E') return deg;
  if (ns === 'S' && ew === 'E') return 180 - deg;
  if (ns === 'S' && ew === 'W') return 180 + deg;
  if (ns === 'N' && ew === 'W') return 360 - deg;
  return deg;
}

// ── Curve completion ──────────────────────────────────────────────────────────

/**
 * Compute the complete set of circular curve parameters from the known values.
 *
 * Requires at minimum:
 *   - R + one of (L, Δ, C)
 *   - OR L + Δ  (R = L / Δ_rad)
 *
 * For chord bearing, also provide:
 *   - entryTangentBearing: the bearing of the line approaching the PC (Point of Curvature)
 *   - direction: 'left' or 'right'
 *
 * @param known              Known curve parameters
 * @param entryTangentBearing  Bearing of the entry tangent (optional, for chord bearing)
 */
export function completeCurveParams(
  known: KnownCurveParams,
  entryTangentBearing?: string | null,
): CurveCompletionResult {
  const warnings: string[] = [];
  const computed: Array<keyof Omit<CurveParams, 'chordBearing' | 'direction'>> = [];

  let R  = known.radius_ft     ?? null;
  let L  = known.arcLength_ft  ?? null;
  let D  = known.delta_deg     ?? null;  // central angle in degrees
  let C  = known.chord_ft      ?? null;
  const dir = known.direction ?? null;

  // ── Pass 1: derive R from other pairs ────────────────────────────────────
  if (R === null) {
    if (L !== null && D !== null && D > 0) {
      R = L / toRad(D);
      computed.push('radius_ft');
    } else if (C !== null && D !== null && D > 0) {
      R = C / (2 * Math.sin(toRad(D / 2)));
      computed.push('radius_ft');
    }
  }

  // ── Pass 2: derive Δ ───────────────────────────────────────────────────────
  if (D === null && R !== null && R > 0) {
    if (L !== null) {
      D = toDeg(L / R);
      computed.push('delta_deg');
    } else if (C !== null) {
      const ratio = C / (2 * R);
      if (ratio >= -1 && ratio <= 1) {
        D = toDeg(2 * Math.asin(ratio));
        computed.push('delta_deg');
      } else {
        warnings.push(`Chord (${C.toFixed(2)}ft) > 2R (${(2 * R).toFixed(2)}ft) — impossible geometry`);
      }
    }
  }

  // ── Pass 3: derive L ───────────────────────────────────────────────────────
  if (L === null && R !== null && D !== null && R > 0 && D > 0) {
    L = R * toRad(D);
    computed.push('arcLength_ft');
  }

  // ── Pass 4: derive C ───────────────────────────────────────────────────────
  if (C === null && R !== null && D !== null && R > 0 && D > 0) {
    C = 2 * R * Math.sin(toRad(D / 2));
    computed.push('chord_ft');
  }

  // ── Pass 5: compute chord bearing ─────────────────────────────────────────
  let chordBearing: string | null = null;

  if (entryTangentBearing && D !== null && dir !== null) {
    const entryAz = quadrantToAzimuth(entryTangentBearing);
    if (entryAz !== null && D > 0) {
      // The chord bearing is tangent rotated by Δ/2 in the curve direction
      const halfDelta  = D / 2;
      const chordAz    = dir === 'right'
        ? entryAz + halfDelta
        : entryAz - halfDelta;
      chordBearing = azimuthToQuadrant(((chordAz % 360) + 360) % 360);
    }
  }

  // ── Sanity checks ──────────────────────────────────────────────────────────
  if (R !== null && R <= 0) {
    warnings.push('Radius must be > 0');
    R = null;
  }
  if (D !== null && (D <= 0 || D >= 360)) {
    warnings.push(`Central angle ${D.toFixed(4)}° is out of valid range (0-360°)`);
    D = null;
  }
  if (L !== null && R !== null && D !== null) {
    const expectedL = R * toRad(D);
    if (Math.abs(L - expectedL) > 0.05) {
      warnings.push(`Arc length inconsistency: given L=${L.toFixed(2)}ft, computed L=${expectedL.toFixed(2)}ft from R×Δ`);
    }
  }
  if (C !== null && R !== null && D !== null) {
    const expectedC = 2 * R * Math.sin(toRad(D / 2));
    if (Math.abs(C - expectedC) > 0.05) {
      warnings.push(`Chord inconsistency: given C=${C.toFixed(2)}ft, computed C=${expectedC.toFixed(2)}ft from 2R×sin(Δ/2)`);
    }
  }

  return {
    params: {
      radius_ft:    R,
      arcLength_ft: L,
      delta_deg:    D,
      chord_ft:     C,
      chordBearing,
      direction:    dir,
    },
    computed,
    warnings,
  };
}

/**
 * Convenience: complete curve params from the raw BoundaryCall.curve object
 * returned by ai-extraction.ts, returning a merged object.
 */
export function completeBoundaryCallCurve(
  curve: {
    radius:       { value: number } | null;
    arcLength:    { value: number } | null;
    delta:        { decimalDegrees: number } | null;
    chordBearing: { raw: string }   | null;
    chordDistance: { value: number } | null;
    direction:    'left' | 'right';
  },
  entryTangentBearing?: string | null,
): CurveCompletionResult {
  const known: KnownCurveParams = {
    radius_ft:    curve.radius?.value         ?? undefined,
    arcLength_ft: curve.arcLength?.value      ?? undefined,
    delta_deg:    curve.delta?.decimalDegrees ?? undefined,
    chord_ft:     curve.chordDistance?.value  ?? undefined,
    direction:    curve.direction,
  };

  const result = completeCurveParams(known, entryTangentBearing ?? curve.chordBearing?.raw ?? null);

  return result;
}
