// lib/cad/units/parse-area.ts
//
// Phase 8 §11.5 — area-input parser. Returns canonical square
// feet (the area unit used internally by every annotation +
// computation in the system). Mirrors `parse-length.ts`'s
// shape so the `<UnitInput kind="area">` component can drop
// in either parser interchangeably.

export type AreaUnit = 'SQ_FT' | 'ACRES' | 'SQ_M' | 'HECTARES';

export interface ParsedArea {
  /** Canonical value in square feet. */
  sqft: number;
  sourceUnit: AreaUnit;
  sourceValue: number;
  hadExplicitUnit: boolean;
}

const SQM_TO_SQFT = 1 / (0.3048 * 0.3048);  // 1 m² = 10.7639 sq ft
const ACRE_TO_SQFT = 43560;
const HECTARE_TO_SQFT = 10000 * SQM_TO_SQFT;

const UNIT_TO_SQFT: Record<AreaUnit, number> = {
  SQ_FT:    1,
  ACRES:    ACRE_TO_SQFT,
  SQ_M:     SQM_TO_SQFT,
  HECTARES: HECTARE_TO_SQFT,
};

function suffixToUnit(suffix: string): AreaUnit | null {
  const s = suffix.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  switch (s) {
    case 'sf': case 'sqft': case 'sq ft': case 'sq feet': case 'square feet':
    case 'ft²': case 'ft2': case 'ft^2':
      return 'SQ_FT';
    case 'ac': case 'acre': case 'acres':
      return 'ACRES';
    case 'sqm': case 'sq m': case 'square meters': case 'square metres':
    case 'm²': case 'm2': case 'm^2':
      return 'SQ_M';
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
