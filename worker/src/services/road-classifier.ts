// worker/src/services/road-classifier.ts — Phase 6 §6.3
// Enhanced road classifier for TxDOT ROW Integration.
//
// The basic classifyRoad() in txdot-row.ts checks only exact prefix match.
// This version adds: padded route numbers (for TxDOT API queries), route number
// extraction, full county road matching, and named street detection.
//
// After Phase 6 is deployed, txdot-row.ts imports classifyRoadEnhanced() and
// provides a thin backward-compat wrapper for its existing classifyRoad() export.
//
// Spec §6.3

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoadType =
  | 'farm_to_market'
  | 'ranch_to_market'
  | 'state_highway'
  | 'us_highway'
  | 'interstate'
  | 'spur'
  | 'loop'
  | 'business'
  | 'park_road'
  | 'recreational_road'
  | 'county_road'
  | 'city_street'
  | 'private_road'
  | 'unknown';

export interface ClassifiedRoad {
  /** Original raw road name as extracted from deed/plat */
  name: string;
  /** Human-readable display name (e.g., "FM 436") */
  displayName: string;
  /** Zero-padded TxDOT designation for API queries (e.g., "FM 0436", "SH 0190") */
  txdotDesignation?: string;
  type: RoadType;
  maintainedBy: 'txdot' | 'county' | 'city' | 'private' | 'unknown';
  /** Data-collection strategy for Phase 6 */
  queryStrategy: 'txdot_api' | 'county_records' | 'deed_only' | 'skip';
  /** TxDOT system code (e.g., "FM", "SH", "US", "IH") */
  highwaySystem?: string;
  /** Unpadded route number (e.g., "436", "190", "35") */
  routeNumber?: string;
}

// ── TXDOT_PREFIXES_MAP ────────────────────────────────────────────────────────

/**
 * Maps every recognized TxDOT highway prefix to its canonical system code,
 * road type, and the zero-padding width used in TxDOT database queries.
 *
 * Exported so txdot-row.ts can use it to replace the local TXDOT_PREFIXES constant.
 */
export const TXDOT_PREFIXES_MAP: Record<string, {
  type: RoadType;
  system: string;
  padWidth: number;
}> = {
  'FM':   { type: 'farm_to_market',    system: 'FM',   padWidth: 4 },
  'RM':   { type: 'ranch_to_market',   system: 'RM',   padWidth: 4 },
  'SH':   { type: 'state_highway',     system: 'SH',   padWidth: 4 },
  'US':   { type: 'us_highway',        system: 'US',   padWidth: 4 },
  'IH':   { type: 'interstate',        system: 'IH',   padWidth: 3 },
  'I':    { type: 'interstate',        system: 'IH',   padWidth: 3 },
  'SPUR': { type: 'spur',              system: 'SP',   padWidth: 4 },
  'SP':   { type: 'spur',              system: 'SP',   padWidth: 4 },
  'LOOP': { type: 'loop',              system: 'LP',   padWidth: 4 },
  'LP':   { type: 'loop',              system: 'LP',   padWidth: 4 },
  'BUS':  { type: 'business',          system: 'BS',   padWidth: 4 },
  'BS':   { type: 'business',          system: 'BS',   padWidth: 4 },
  'SL':   { type: 'spur',              system: 'SL',   padWidth: 4 },
  'PR':   { type: 'park_road',         system: 'PR',   padWidth: 4 },
  'RE':   { type: 'recreational_road', system: 'RE',   padWidth: 4 },
};

// ── Private constants ─────────────────────────────────────────────────────────

const COUNTY_PREFIXES = ['CR', 'COUNTY ROAD', 'COUNTY RD', 'CO RD', 'CO. RD', 'CO RD.'];

const STREET_SUFFIXES = [
  'DR', 'DRIVE', 'ST', 'STREET', 'AVE', 'AVENUE', 'BLVD', 'BOULEVARD',
  'LN', 'LANE', 'CT', 'COURT', 'WAY', 'TRL', 'TRAIL', 'RD', 'ROAD',
  'PKWY', 'PARKWAY', 'CIR', 'CIRCLE', 'PL', 'PLACE', 'TERRACE', 'TER',
  'HWY', 'HIGHWAY',
];

// ── classifyRoadEnhanced ──────────────────────────────────────────────────────

/**
 * Classify a road name into its type, maintainer, and TxDOT designation.
 *
 * This is the enhanced version for Phase 6. The basic `classifyRoad()` in
 * txdot-row.ts should continue to export its own symbol for backward compatibility
 * with Phase 5, but should internally delegate to this function after Phase 6
 * is deployed.
 *
 * Examples:
 *   "FM 436"          → type: 'farm_to_market', txdotDesignation: 'FM 0436'
 *   "SH 195"          → type: 'state_highway',  txdotDesignation: 'SH 0195'
 *   "Spur 436"        → type: 'spur',           txdotDesignation: 'SP 0436'
 *   "IH 35"           → type: 'interstate',     txdotDesignation: 'IH 035'
 *   "CR 234"          → type: 'county_road',    maintainedBy: 'county'
 *   "County Road 45"  → type: 'county_road',    maintainedBy: 'county'
 *   "Oak Drive"       → type: 'city_street',    maintainedBy: 'city'
 *   "Private Access"  → type: 'private_road',   maintainedBy: 'private'
 */
export function classifyRoadEnhanced(rawName: string): ClassifiedRoad {
  if (!rawName || rawName.trim().length === 0) {
    return {
      name: rawName,
      displayName: rawName,
      type: 'unknown',
      maintainedBy: 'unknown',
      queryStrategy: 'skip',
    };
  }

  const upper = rawName.toUpperCase().trim().replace(/[.\-]/g, ' ').replace(/\s+/g, ' ');

  // ── TxDOT highway prefixes ────────────────────────────────────────────────
  // Must be sorted longest-first to match "SPUR" before "SP", "LOOP" before "LP", etc.
  const sortedPrefixes = Object.entries(TXDOT_PREFIXES_MAP).sort(
    ([a], [b]) => b.length - a.length,
  );

  for (const [prefix, info] of sortedPrefixes) {
    // Match "PREFIX NNN", "PREFIX-NNN", or "PREFIXNNN" at the start of the string
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}[\\s]*(\\d+[A-Z]?)(?:\\s|$)`, 'i');
    const match = upper.match(pattern);
    if (match) {
      const routeNum = match[1];
      const paddedNum = routeNum.replace(/[^0-9]/g, '').padStart(info.padWidth, '0') +
        routeNum.replace(/[0-9]/g, ''); // preserve alpha suffix (e.g., "35E")
      return {
        name: rawName,
        displayName: `${info.system} ${routeNum}`,
        txdotDesignation: `${info.system} ${paddedNum}`,
        type: info.type,
        maintainedBy: 'txdot',
        queryStrategy: 'txdot_api',
        highwaySystem: info.system,
        routeNumber: routeNum,
      };
    }
  }

  // ── County road prefixes ──────────────────────────────────────────────────
  // Sort by length descending to match "COUNTY ROAD" before "CR"
  const sortedCountyPrefixes = [...COUNTY_PREFIXES].sort((a, b) => b.length - a.length);
  for (const prefix of sortedCountyPrefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}[\\s]*(\\d+[A-Z]?)(?:\\s|$)`, 'i');
    const match = upper.match(pattern);
    if (match) {
      return {
        name: rawName,
        displayName: `CR ${match[1]}`,
        type: 'county_road',
        maintainedBy: 'county',
        queryStrategy: 'county_records',
        routeNumber: match[1],
      };
    }
  }

  // ── Private / access roads ─────────────────────────────────────────────────
  // Check BEFORE street suffixes because "Private Access Road" ends in "ROAD"
  // which would incorrectly match the STREET_SUFFIXES check below.
  if (/INTERNAL|PRIVATE|ACCESS ROAD|UNNAMED/i.test(upper)) {
    return {
      name: rawName,
      displayName: rawName,
      type: 'private_road',
      maintainedBy: 'private',
      queryStrategy: 'deed_only',
    };
  }

  // ── Named city / subdivision streets ─────────────────────────────────────
  for (const suffix of STREET_SUFFIXES) {
    if (upper === suffix || upper.endsWith(` ${suffix}`)) {
      return {
        name: rawName,
        displayName: rawName,
        type: 'city_street',
        maintainedBy: 'city',
        queryStrategy: 'deed_only',
      };
    }
  }

  // ── Private / access roads ─────────────────────────────────────────────────
  // (already checked before street suffixes above)

  // ── Unknown ───────────────────────────────────────────────────────────────
  return {
    name: rawName,
    displayName: rawName,
    type: 'unknown',
    maintainedBy: 'unknown',
    queryStrategy: 'deed_only',
  };
}
