// lib/cad/units/parse-area.ts
//
// Phase 8 §11.5 — area-input parser. Returns canonical square
// feet (the area unit used internally by every annotation +
// computation in the system). Mirrors `parse-length.ts`'s
// shape so the `<UnitInput kind="area">` component can drop
// in either parser interchangeably.
//
// Slice 227 of cad-area-calculation-multi-unit-2026-05-29.md
// widened the supported unit set so the surveyor can read out (or
// type in) area in every common surveying unit — sq inches, sq
// yards, sq miles, sq centimeters, sq meters, sq kilometers, sq
// feet, acres, hectares.

export type AreaUnit =
  | 'SQ_IN'
  | 'SQ_FT'
  | 'SQ_YD'
  | 'SQ_MI'
  | 'SQ_MM'
  | 'SQ_CM'
  | 'SQ_M'
  | 'SQ_KM'
  | 'ACRES'
  | 'HECTARES';

export interface ParsedArea {
  /** Canonical value in square feet. */
  sqft: number;
  sourceUnit: AreaUnit;
  sourceValue: number;
  hadExplicitUnit: boolean;
}

// Linear conversions used to derive squared multipliers.
const FT_PER_INCH = 1 / 12;
const FT_PER_YARD = 3;
const FT_PER_MILE = 5280;
const FT_PER_METER = 1 / 0.3048;  // US survey foot
const FT_PER_CM = FT_PER_METER / 100;
const FT_PER_MM = FT_PER_METER / 1000;
const FT_PER_KM = FT_PER_METER * 1000;

const SQIN_TO_SQFT  = FT_PER_INCH * FT_PER_INCH;
const SQYD_TO_SQFT  = FT_PER_YARD * FT_PER_YARD;
const SQMI_TO_SQFT  = FT_PER_MILE * FT_PER_MILE;
const SQMM_TO_SQFT  = FT_PER_MM * FT_PER_MM;
const SQCM_TO_SQFT  = FT_PER_CM * FT_PER_CM;
const SQM_TO_SQFT   = FT_PER_METER * FT_PER_METER;
const SQKM_TO_SQFT  = FT_PER_KM * FT_PER_KM;
const ACRE_TO_SQFT  = 43560;
const HECTARE_TO_SQFT = 10000 * SQM_TO_SQFT;

export const UNIT_TO_SQFT: Record<AreaUnit, number> = {
  SQ_IN:    SQIN_TO_SQFT,
  SQ_FT:    1,
  SQ_YD:    SQYD_TO_SQFT,
  SQ_MI:    SQMI_TO_SQFT,
  SQ_MM:    SQMM_TO_SQFT,
  SQ_CM:    SQCM_TO_SQFT,
  SQ_M:     SQM_TO_SQFT,
  SQ_KM:    SQKM_TO_SQFT,
  ACRES:    ACRE_TO_SQFT,
  HECTARES: HECTARE_TO_SQFT,
};

/** Stable abbreviation for each unit (used by status-bar / label
 *  callsites that need a short token without the full
 *  display-preferences pipeline). */
export const UNIT_LABEL: Record<AreaUnit, string> = {
  SQ_IN:    'in²',
  SQ_FT:    'ft²',
  SQ_YD:    'yd²',
  SQ_MI:    'mi²',
  SQ_MM:    'mm²',
  SQ_CM:    'cm²',
  SQ_M:     'm²',
  SQ_KM:    'km²',
  ACRES:    'ac',
  HECTARES: 'ha',
};

function suffixToUnit(suffix: string): AreaUnit | null {
  const s = suffix.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  switch (s) {
    // ── Square inches ──────────────────────────────────────────
    case 'sqin': case 'sq in': case 'sq inch': case 'sq inches':
    case 'square inches': case 'square inch':
    case 'in²': case 'in2': case 'in^2':
      return 'SQ_IN';
    // ── Square feet ────────────────────────────────────────────
    case 'sf': case 'sqft': case 'sq ft': case 'sq feet':
    case 'sq foot': case 'square foot': case 'square feet':
    case 'ft²': case 'ft2': case 'ft^2':
      return 'SQ_FT';
    // ── Square yards ───────────────────────────────────────────
    case 'sy': case 'sqyd': case 'sq yd': case 'sq yard': case 'sq yards':
    case 'square yard': case 'square yards':
    case 'yd²': case 'yd2': case 'yd^2':
      return 'SQ_YD';
    // ── Square miles ───────────────────────────────────────────
    case 'sqmi': case 'sq mi': case 'sq mile': case 'sq miles':
    case 'square mile': case 'square miles':
    case 'mi²': case 'mi2': case 'mi^2':
      return 'SQ_MI';
    // ── Square millimeters ─────────────────────────────────────
    case 'sqmm': case 'sq mm': case 'square millimeter': case 'square millimeters':
    case 'square millimetre': case 'square millimetres':
    case 'mm²': case 'mm2': case 'mm^2':
      return 'SQ_MM';
    // ── Square centimeters ─────────────────────────────────────
    case 'sqcm': case 'sq cm': case 'square centimeter': case 'square centimeters':
    case 'square centimetre': case 'square centimetres':
    case 'cm²': case 'cm2': case 'cm^2':
      return 'SQ_CM';
    // ── Square meters ──────────────────────────────────────────
    case 'sqm': case 'sq m': case 'square meters': case 'square metres':
    case 'square meter': case 'square metre':
    case 'm²': case 'm2': case 'm^2':
      return 'SQ_M';
    // ── Square kilometers ──────────────────────────────────────
    case 'sqkm': case 'sq km': case 'square kilometer': case 'square kilometers':
    case 'square kilometre': case 'square kilometres':
    case 'km²': case 'km2': case 'km^2':
      return 'SQ_KM';
    case 'ac': case 'acre': case 'acres':
      return 'ACRES';
    case 'ha': case 'hectare': case 'hectares':
      return 'HECTARES';
    default:
      return null;
  }
}

const NUMERIC_RE = /^(-?\d+(?:\.\d+)?)(.*)$/;

export function parseArea(
  input: string,
  defaultUnit: AreaUnit = 'SQ_FT',
): ParsedArea | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const m = raw.match(NUMERIC_RE);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const tail = m[2].trim();
  let unit: AreaUnit;
  let hadExplicitUnit: boolean;
  if (!tail) {
    unit = defaultUnit;
    hadExplicitUnit = false;
  } else {
    const u = suffixToUnit(tail);
    if (!u) return null;
    unit = u;
    hadExplicitUnit = true;
  }
  return {
    sqft: value * UNIT_TO_SQFT[unit],
    sourceUnit: unit,
    sourceValue: value,
    hadExplicitUnit,
  };
}

/** Convert canonical sq-ft to any other area unit. */
export function sqftTo(value: number, unit: AreaUnit): number {
  return value / UNIT_TO_SQFT[unit];
}

export function toSqft(value: number, unit: AreaUnit): number {
  return value * UNIT_TO_SQFT[unit];
}
