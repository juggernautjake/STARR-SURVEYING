// worker/src/services/county-road-defaults.ts — Phase 6 §6.9
// County road ROW width defaults for Texas counties.
//
// TxDOT data does not cover county-maintained roads.
// These defaults apply when no specific county records are available.
//
// Source authority: Texas Transportation Code §251.003 (minimum widths),
// plus individual county road standards and subdivision regulations.
//
// Spec §6.9

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CountyROWDefaults {
  countyName: string;
  /** Typical ROW total width in feet (both sides of centerline combined) */
  defaultROWWidth: number;
  /** Minimum documented ROW width for this county */
  minROWWidth: number;
  /** Maximum documented ROW width for this county (major arterials) */
  maxROWWidth: number;
  /** Authority document or standard cited */
  source: string;
  /** Human-readable notes for surveyors */
  notes: string;
}

// ── COUNTY_ROW_DEFAULTS ────────────────────────────────────────────────────────

/**
 * Per-county overrides keyed by UPPERCASE county name.
 * Counties not listed fall back to TEXAS_STATE_DEFAULT.
 *
 * Values represent the full ROW width (both sides of centerline).
 * Add entries as county-specific knowledge is acquired through field work.
 */
export const COUNTY_ROW_DEFAULTS: Record<string, CountyROWDefaults> = {
  BELL: {
    countyName: 'Bell',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 80,
    source: 'Bell County Road Standards',
    notes:
      "Bell County typically uses 60' ROW (30' each side of centerline). " +
      "Older roads (pre-1960) may be as narrow as 40'. " +
      'Check Bell County Commissioners Court records for specific road.',
  },
  WILLIAMSON: {
    countyName: 'Williamson',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 100,
    source: 'Williamson County Subdivision Regulations',
    notes:
      "Newer subdivisions (post-2000) may require up to 100' ROW for major county roads. " +
      "Standard local roads use 60'.",
  },
  TRAVIS: {
    countyName: 'Travis',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 90,
    source: 'Travis County Transportation Plan',
    notes:
      "Travis County collector roads typically require 80' ROW. " +
      "Local roads 60'. Urban areas may have been dedicated at platting.",
  },
  MCLENNAN: {
    countyName: 'McLennan',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 80,
    source: 'McLennan County Road Standards',
    notes:
      "Standard 60' ROW for county roads in the Waco/McLennan area. " +
      "Verify against original dedication in subdivision plat.",
  },
  BEXAR: {
    countyName: 'Bexar',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 100,
    source: 'Bexar County Subdivision Rules and Regulations',
    notes:
      "Arterial county roads in Bexar County may require 100' ROW. " +
      "Consult San Antonio-Bexar County Metropolitan Planning Organization for major roads.",
  },
  HARRIS: {
    countyName: 'Harris',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 120,
    source: 'Harris County Engineering Design Manual',
    notes:
      "Major arterials in Harris County require 120' ROW. " +
      "Many county roads are in the Harris County Flood Control District. " +
      "Check Harris County Appraisal District for easement records.",
  },
  TARRANT: {
    countyName: 'Tarrant',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 100,
    source: 'Tarrant County Road Standards',
    notes:
      "Tarrant County collector roads typically 80'-100'. " +
      "Check City of Fort Worth vs. Tarrant County jurisdiction boundary before applying.",
  },
  DALLAS: {
    countyName: 'Dallas',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 120,
    source: 'Dallas County Infrastructure Design Manual',
    notes:
      "Most roads in Dallas County have been incorporated into city street networks. " +
      "True county-maintained roads are rare. Verify jurisdiction first.",
  },
  COLLIN: {
    countyName: 'Collin',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 100,
    source: 'Collin County Road Standards Manual',
    notes:
      "Collin County requires 100' ROW for major arterials per 2018 standards update. " +
      "Older roads established before 2000 may only have 60'.",
  },
  DENTON: {
    countyName: 'Denton',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 100,
    source: "Denton County Commissioner's Court Road Standards",
    notes:
      "Denton County standard is 60' for local roads, 80' for collectors. " +
      "Check original subdivision plat for any additional dedication width.",
  },
  BRAZOS: {
    countyName: 'Brazos',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 80,
    source: 'Brazos County Road Standards',
    notes:
      "Standard 60' ROW. College Station and Bryan city limits take precedence. " +
      "Rural roads outside city limits use county standards.",
  },
  LUBBOCK: {
    countyName: 'Lubbock',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 80,
    source: 'Lubbock County Road Standards',
    notes: "West Texas county roads often have 60' ROW on a section-line grid system.",
  },
  HAYS: {
    countyName: 'Hays',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 100,
    source: 'Hays County Development Regulations',
    notes:
      "Hays County fast-growth area; newer roads may have 80'-100' ROW per post-2010 standards. " +
      'Older rural roads typically 60\'.',
  },
  CALDWELL: {
    countyName: 'Caldwell',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 80,
    source: 'Caldwell County Road Standards',
    notes: "Standard Texas minimum for most county roads. Lockhart-area roads may vary.",
  },
  CORYELL: {
    countyName: 'Coryell',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 80,
    source: 'Coryell County Road Standards',
    notes: "Adjacent to Bell County; similar 60' standard. Fort Hood-area roads may have larger ROW.",
  },
  LAMPASAS: {
    countyName: 'Lampasas',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 60,
    source: 'Lampasas County Road Standards',
    notes:
      "Rural Hill Country county; standard 60' ROW. " +
      "Many roads are lightly traveled and have minimal dedicated ROW.",
  },
  BURNET: {
    countyName: 'Burnet',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 60,
    source: 'Burnet County Road Standards',
    notes: "Hill Country county; standard 60' ROW. Many rural roads with old dedications.",
  },
};

/** Default applied when a county is not in COUNTY_ROW_DEFAULTS */
export const TEXAS_STATE_DEFAULT: CountyROWDefaults = {
  countyName: 'Default (Texas State Minimum)',
  defaultROWWidth: 60,
  minROWWidth: 40,
  maxROWWidth: 80,
  source: 'Texas Transportation Code §251.003',
  notes:
    'State minimum ROW for Texas county roads. Actual width may vary significantly. ' +
    "Check county commissioners court records or original dedication plat for authoritative width. " +
    "Many older rural roads were dedicated at 40' or less.",
};

// ── getCountyROWDefaults ──────────────────────────────────────────────────────

/**
 * Get county road ROW width defaults for a named Texas county.
 * Falls back to TEXAS_STATE_DEFAULT if the county is not in the table.
 *
 * @param countyName  County name (case-insensitive, e.g., "Bell", "BELL", "bell")
 * @returns           CountyROWDefaults with default and min/max ROW widths
 *
 * @example
 *   getCountyROWDefaults('Bell')    // → { defaultROWWidth: 60, ... }
 *   getCountyROWDefaults('Unknown') // → TEXAS_STATE_DEFAULT with countyName='Unknown'
 */
export function getCountyROWDefaults(countyName: string): CountyROWDefaults {
  const key = (countyName ?? '').toUpperCase().trim();
  const found = COUNTY_ROW_DEFAULTS[key];
  if (found) return found;

  // Return a copy of the state default with the specific county name
  return {
    ...TEXAS_STATE_DEFAULT,
    countyName: countyName ?? 'Unknown',
  };
}
