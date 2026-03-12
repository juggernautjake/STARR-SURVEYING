// worker/src/services/bell-county-classifier.ts
// Bell County Property Type Classification & Search Strategy Selection
//
// Bell County Appraisal District (BIS) uses a rich set of property type codes.
// This module detects type from legal descriptions and CAD data, then selects
// the optimal search strategy for each type.
//
// Property Type Codes (Bell CAD):
//   R  — Real Property (land + improvements)         → standard address search
//   C  — Commercial Real Property                    → standard + parcel search
//   M  — Mineral Property                            → surface tract cross-ref
//   MH — Mobile Home                                 → link to land account
//   BP — Business Personal Property                  → pivot to owner's land
//   P  — Personal Property (older code for BP)       → pivot to owner's land
//   U  — Utilities / Special Inventory               → infrastructure search
//   AG — Agricultural (ag-use exemption on R land)   → rural address + legal desc
//
// Subdivision/Addition vs. Abstract Survey:
//   Platted land (in a subdivision) → plat archive search
//   Abstract-survey land (Section/League/Labor) → deed-chain search

// ── Property Type Enum ────────────────────────────────────────────────────────

export type BellPropertyTypeCode =
  | 'R'   // Real property (residential or commercial land)
  | 'C'   // Commercial real property
  | 'M'   // Mineral property
  | 'MH'  // Mobile home
  | 'BP'  // Business personal property (inventory, equipment)
  | 'P'   // Personal property (legacy synonym for BP)
  | 'U'   // Utilities / special inventory
  | 'AG'  // Agricultural real property (ag exemption)
  | 'X'   // Exempt property (churches, government, etc.)
  | 'UNKNOWN';

// ── Land Description Category ─────────────────────────────────────────────────

export type BellLandDescCategory =
  | 'platted_subdivision'    // "SUNRIDGE ESTATES, LOT 3, BLOCK A"
  | 'named_addition'         // "ASH FAMILY TRUST 12.358 ACRE ADDITION"
  | 'abstract_survey'        // "WILLIAM HARTRICK SURVEY A-488"
  | 'rural_acreage'          // "12.358 AC OUT OF WH SURVEY A-488"
  | 'commercial_lot'         // "LOT 1-A, REPL OF COMMERCIAL CENTER"
  | 'mobile_home_site'       // "MH SITE LEASE LOT 4"
  | 'mineral_interest'       // "MINERAL INT HARTRICK SVY"
  | 'personal_property'      // "PERSONAL PROPERTY / BUSINESS ACCT"
  | 'utility_line'           // "PIPELINE ROW THRU HARTRICK SVY"
  | 'unknown';

// ── Search Strategy ────────────────────────────────────────────────────────────

/** The recommended search paths for a Bell County property. */
export interface BellSearchStrategy {
  /** Primary: search by address via CAD */
  searchByAddress: boolean;
  /** Primary: search by property ID directly (fast path) */
  searchByPropertyId: boolean;
  /** Try plat repository (bellcountytx.com) for platted subdivision */
  searchPlatArchive: boolean;
  /** Search clerk by instrument numbers parsed from legal description */
  searchByInstruments: boolean;
  /** Search clerk by owner name (fallback / enrichment) */
  searchByOwnerName: boolean;
  /** Cross-reference: find sibling parcels with same owner */
  searchRelatedParcels: boolean;
  /** For personal property: pivot to find the land account */
  pivotToLandAccount: boolean;
  /** For mineral: look up surface tract */
  lookupSurfaceTract: boolean;
  /** For abstract survey land: deed-chain search is primary */
  deedChainSearch: boolean;
  /** Expected document types to retrieve */
  expectedDocTypes: ('plat' | 'deed' | 'easement' | 'release' | 'mineral' | 'judgment')[];
}

// ── Classification Result ─────────────────────────────────────────────────────

export interface BellPropertyClassification {
  typeCode: BellPropertyTypeCode;
  landCategory: BellLandDescCategory;
  isPersonalProperty: boolean;
  isCommercial: boolean;
  isRuralAcreage: boolean;
  isPlatted: boolean;
  hasAbstractSurvey: boolean;
  hasMineralInterest: boolean;
  isMobileHome: boolean;
  isUtility: boolean;
  subdivisionName: string | null;
  abstractSurveyName: string | null;
  /** For platted land: lot and block parsed from description */
  lotNumber: string | null;
  blockNumber: string | null;
  /** Estimated acreage from description text (not the CAD acreage field) */
  describedAcreage: number | null;
  strategy: BellSearchStrategy;
  /** Human-readable explanation of why this strategy was chosen */
  strategyRationale: string;
}

// ── Type Code Detection ───────────────────────────────────────────────────────

/**
 * Detect the Bell CAD property type code from raw data.
 *
 * Priority: explicit type string → legal description patterns → default R.
 *
 * @param rawTypeCode The PROP_TYPE field value from CAD (may be null/empty)
 * @param legalDescription The full legal description text (may be null)
 * @param ownerName Owner name (used to detect personal property accounts)
 */
export function detectPropertyTypeCode(
  rawTypeCode: string | null | undefined,
  legalDescription: string | null | undefined,
  ownerName: string | null | undefined,
): BellPropertyTypeCode {
  const code = (rawTypeCode ?? '').trim().toUpperCase();
  const legal = (legalDescription ?? '').toUpperCase();
  const owner = (ownerName ?? '').toUpperCase();

  // Explicit code mapping (Bell CAD uses these exact strings)
  switch (code) {
    case 'R':   return 'R';
    case 'C':   return 'C';
    case 'M':   return 'M';
    case 'MH':  return 'MH';
    case 'BP':  return 'BP';
    case 'P':   return 'P';
    case 'U':   return 'U';
    case 'AG':  return 'AG';
    case 'X':   return 'X';
  }

  // Fallback: infer from legal description patterns

  // Business/personal property signals
  if (/business personal property|personal property|bpp\b/i.test(legal)) return 'BP';
  if (/mobile home|manufactured home|mh\b|mh site/i.test(legal)) return 'MH';
  if (/mineral int|mineral interest|mineral rights|royalty int/i.test(legal)) return 'M';
  if (/pipeline row|transmission line|utility easement|utility line/i.test(legal)) return 'U';

  // Agricultural signals
  if (/\bag exempt|\bag use\b|agricultural|farm & ranch|ranch land/i.test(legal)) return 'AG';

  // Commercial signals  
  if (/commercial|retail|office|shopping|strip center|warehouse|industrial/i.test(legal)) return 'C';

  // Owner name-based heuristics (some CAD records only have owner info)
  if (/inc\b|llc\b|ltd\b|corp\b|co\b|company|enterprises|holdings/i.test(owner)) {
    // Business entity — likely commercial or BP
    if (/\bRE\b|\bREALTY\b|PROPERTIES|LAND|RANCH|FARMS?/i.test(owner)) return 'C';
    return 'BP'; // Equipment/inventory account if no land signals
  }

  return 'R'; // Default: real property
}

// ── Legal Description Classification ─────────────────────────────────────────

/**
 * Classify a Bell CAD legal description into a land category.
 *
 * Bell CAD legal descriptions follow these common patterns:
 *   1. "SUBDIVISION NAME, BLOCK X, LOT Y"                 → platted_subdivision
 *   2. "OWNER NAME X.XXX ACRE ADDITION, BLOCK X, LOT Y"   → named_addition
 *   3. "WILLIAM HARTRICK SURVEY A-488"                     → abstract_survey
 *   4. "XX.XX AC OUT OF WH SURVEY A-488, LABEL"           → rural_acreage
 *   5. "LOT 1-A, REPLAT OF COMMERCIAL CENTER"             → commercial_lot
 *   6. "MH SITE LEASE LOT 4"                              → mobile_home_site
 *   7. "MINERAL INT HARTRICK SVY"                         → mineral_interest
 *   8. "BUSINESS PERSONAL PROPERTY / ABC CORP"            → personal_property
 *   9. "PIPELINE ROW 2.35 AC"                             → utility_line
 */
export function classifyLegalDescription(
  legalDescription: string | null | undefined,
): BellLandDescCategory {
  if (!legalDescription) return 'unknown';
  const desc = legalDescription.trim().toUpperCase();

  if (!desc) return 'unknown';

  // Personal property — detect first (highest priority, eliminates false matches)
  if (/business personal property|personal property\s*\//i.test(desc)) return 'personal_property';

  // Mobile home site
  if (/mh site|mobile home site|mh lease|manufactured home\s+(?:lot|site)/i.test(desc)) return 'mobile_home_site';

  // Mineral interest
  if (/mineral int|mineral interest|mineral right|royalty int/i.test(desc)) return 'mineral_interest';

  // Utility / pipeline ROW
  if (/pipeline row|transmission line|utility easement|utility line|elec(?:tric)?\s+(?:line|easement)/i.test(desc)) return 'utility_line';

  // Commercial lot (replat, replat of, etc.)
  if (/\breplat\b|\bcommercial\s+(?:lot|park|center|plaza|subdivision)/i.test(desc)) return 'commercial_lot';

  // Named addition (e.g. "ASH FAMILY TRUST 12.358 ACRE ADDITION")
  // Pattern: ends with "ADDITION" or "SUBDIVISION" before BLOCK/LOT
  if (/\baddition\b/i.test(desc) && /\b(?:block|lot)\b/i.test(desc)) {
    return 'named_addition';
  }

  // Platted subdivision (has BLOCK and LOT without "ACRE ADDITION")
  if (/\bblock\b.*\blot\b|\blot\b.*\bblock\b/i.test(desc) && !/\bacre\s+addition\b/i.test(desc)) {
    return 'platted_subdivision';
  }

  // Abstract survey land (Survey A-nnn pattern)
  if (/survey\s+[a-z]-\d+|\babstract\s+\d+|\babs\s+\d+|\ba-\d{3,}/i.test(desc)) {
    // Abstract survey with acreage = rural_acreage
    if (/\d+\.?\d*\s*ac(?:res?)?\b/i.test(desc)) return 'rural_acreage';
    return 'abstract_survey';
  }

  // Rural acreage (has acreage but no abstract pattern — could be county land description)
  if (/\d+\.?\d*\s*ac(?:res?)?\b/i.test(desc)) return 'rural_acreage';

  return 'unknown';
}

// ── Subdivision Name Extraction ───────────────────────────────────────────────

/**
 * Extract the subdivision/addition name from a Bell CAD legal description.
 *
 * Handles all common Bell County formats:
 *   "ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002"
 *     → "ASH FAMILY TRUST 12.358 ACRE ADDITION"
 *   "SUNRIDGE ESTATES PHASE 2, BLOCK A, LOT 3"
 *     → "SUNRIDGE ESTATES PHASE 2"
 *   "LOT 3, BLOCK A, SUNRIDGE ESTATES"
 *     → "SUNRIDGE ESTATES"
 *   "HARTRICK SURVEY A-488"                  → null (not a subdivision)
 *
 * @param legalDescription Bell CAD legal description text
 * @returns Uppercase subdivision/addition name, or null if not found
 */
export function extractSubdivisionNameFromLegal(
  legalDescription: string | null | undefined,
): string | null {
  if (!legalDescription) return null;
  const desc = legalDescription.trim().toUpperCase();

  // Pattern 1: "ADDITION NAME, BLOCK X, LOT Y" — name ends at ", BLOCK"
  // Covers "ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002"
  const additionMatch = desc.match(/^(.+?ADDITION(?:\s+(?:NO\.|NO\s*\d+|\d+))?)\s*,\s*BLOCK/);
  if (additionMatch) return additionMatch[1].trim();

  // Pattern 2: "SUBDIVISION NAME, BLOCK X, LOT Y" — name before ", BLOCK"
  // Covers "SUNRIDGE ESTATES PHASE 2, BLOCK A, LOT 3"
  const beforeBlock = desc.match(/^(.+?),\s*BLOCK\s+[\dA-Z]/);
  if (beforeBlock) {
    const candidate = beforeBlock[1].trim();
    // Exclude fragments that are just "LOT X" (reversed format handled below)
    if (!/^LOT\s+[\dA-Z]+$/i.test(candidate)) return candidate;
  }

  // Pattern 3: "LOT X, BLOCK Y, SUBDIVISION NAME" — name after "BLOCK Y,"
  // Covers "LOT 3, BLOCK A, SUNRIDGE ESTATES"
  const afterBlock = desc.match(/LOT\s+[\dA-Z]+,\s*BLOCK\s+[\dA-Z]+,\s*(.+?)(?:\s*,.*)?$/);
  if (afterBlock) return afterBlock[1].trim();

  // Pattern 4: Pure SUBDIVISION keyword
  const subdivMatch = desc.match(/^(.+?SUBDIVISION)\s*,/i);
  if (subdivMatch) return subdivMatch[1].trim();

  // Not a platted description
  return null;
}

// ── Abstract Survey Extraction ────────────────────────────────────────────────

/**
 * Extract the abstract/survey name from a Bell CAD legal description.
 *
 * Examples:
 *   "WILLIAM HARTRICK SURVEY A-488"         → "WILLIAM HARTRICK SURVEY A-488"
 *   "12.358 AC OUT OF WH SURVEY A-488"      → "WH SURVEY A-488"
 *   "HARTRICK, WILLIAM SURV A-488 12.35 AC" → "HARTRICK, WILLIAM SURV A-488"
 */
export function extractAbstractSurveyName(
  legalDescription: string | null | undefined,
): string | null {
  if (!legalDescription) return null;
  const desc = legalDescription.trim().toUpperCase();

  // Full pattern: "NAME SURVEY A-NNN" or "NAME SURV A-NNN"
  const surveyMatch = desc.match(/([A-Z][A-Z\s,]+(?:SURV(?:EY)?)\s+A-\d{3,})/);
  if (surveyMatch) return surveyMatch[1].trim();

  // Abstract number only: "ABSTRACT 488" or "ABS 488"
  const abstractMatch = desc.match(/(?:ABSTRACT|ABS(?:TRACT)?)\s+(\d+)/);
  if (abstractMatch) return `ABSTRACT ${abstractMatch[1]}`;

  return null;
}

// ── Described Acreage Extraction ──────────────────────────────────────────────

/**
 * Parse any acreage amount mentioned in a legal description.
 * Returns the most precise (most decimal places) value found, or null.
 *
 * Examples:
 *   "12.358 ACRE ADDITION"                    → 12.358
 *   "4.375 AC OUT OF WH SURVEY A-488"         → 4.375
 *   "LOT 3 (0.275 ACRES)"                     → 0.275
 */
export function extractDescribedAcreage(
  legalDescription: string | null | undefined,
): number | null {
  if (!legalDescription) return null;
  const matches = [...legalDescription.matchAll(/(\d+\.?\d*)\s*ac(?:res?)?\b/gi)];
  if (!matches.length) return null;
  // Return the value with the most decimal places (most precise)
  let best: number | null = null;
  let bestDecimals = -1;
  for (const m of matches) {
    const val = parseFloat(m[1]);
    if (isNaN(val)) continue;
    const decimals = m[1].includes('.') ? m[1].split('.')[1].length : 0;
    if (decimals > bestDecimals) {
      best = val;
      bestDecimals = decimals;
    }
  }
  return best;
}

// ── Lot/Block Extraction ──────────────────────────────────────────────────────

/**
 * Extract lot and block numbers from a Bell CAD legal description.
 *
 * Returns both the raw text value (may be "001", "A", "2B") and the
 * normalized label suitable for searching.
 */
export function extractLotBlock(legalDescription: string | null | undefined): {
  lot: string | null;
  block: string | null;
} {
  if (!legalDescription) return { lot: null, block: null };
  const desc = legalDescription.toUpperCase();

  // "BLOCK X, LOT Y" or "LOT Y, BLOCK X"
  const blockFirst = desc.match(/BLOCK\s+([\dA-Z]+)[,\s]+LOT\s+([\dA-Z]+)/);
  if (blockFirst) return { block: blockFirst[1], lot: blockFirst[2] };

  const lotFirst = desc.match(/LOT\s+([\dA-Z]+)[,\s]+BLOCK\s+([\dA-Z]+)/);
  if (lotFirst) return { lot: lotFirst[1], block: lotFirst[2] };

  // Bell CAD zero-padded: "BLOCK 001, LOT 0002"
  const lotOnly = desc.match(/\bLOT\s+([\d]+)/);
  const blockOnly = desc.match(/\bBLOCK\s+([\dA-Z]+)/);
  return {
    lot: lotOnly?.[1] ?? null,
    block: blockOnly?.[1] ?? null,
  };
}

// ── Strategy Builder ──────────────────────────────────────────────────────────

/**
 * Build the optimal search strategy for a Bell County property based on
 * its classification.
 *
 * The strategy is a set of boolean flags that guide the pipeline's search
 * decisions.  Multiple paths can be true simultaneously — they run in
 * parallel or in priority order.
 */
function buildStrategy(
  typeCode: BellPropertyTypeCode,
  landCategory: BellLandDescCategory,
): { strategy: BellSearchStrategy; rationale: string } {
  const base: BellSearchStrategy = {
    searchByAddress:      true,
    searchByPropertyId:   false,
    searchPlatArchive:    false,
    searchByInstruments:  false,
    searchByOwnerName:    false,
    searchRelatedParcels: false,
    pivotToLandAccount:   false,
    lookupSurfaceTract:   false,
    deedChainSearch:      false,
    expectedDocTypes:     ['deed'],
  };

  const parts: string[] = [];

  // Personal property → pivot to land account immediately
  if (typeCode === 'BP' || typeCode === 'P') {
    return {
      strategy: {
        ...base,
        searchByAddress:    false,
        searchByOwnerName:  true,
        pivotToLandAccount: true,
        expectedDocTypes:   ['deed'],
      },
      rationale: 'Personal property account — pivot to owner land records via owner name search',
    };
  }

  // Mineral — needs surface tract cross-reference
  if (typeCode === 'M') {
    return {
      strategy: {
        ...base,
        searchByAddress:     false,
        lookupSurfaceTract:  true,
        searchByOwnerName:   true,
        deedChainSearch:     true,
        expectedDocTypes:    ['deed', 'mineral'],
      },
      rationale: 'Mineral property — cross-reference surface tract and deed chain',
    };
  }

  // Mobile home — search by address AND link to land account
  if (typeCode === 'MH') {
    return {
      strategy: {
        ...base,
        searchRelatedParcels: true,
        expectedDocTypes:     ['deed'],
      },
      rationale: 'Mobile home — address search + related parcel lookup for land account',
    };
  }

  // Utility / pipeline
  if (typeCode === 'U') {
    return {
      strategy: {
        ...base,
        searchByOwnerName:   true,
        searchByInstruments: true,
        deedChainSearch:     true,
        expectedDocTypes:    ['deed', 'easement'],
      },
      rationale: 'Utility/pipeline — search by owner + instrument chain for easement documents',
    };
  }

  // Now handle land categories for real property types (R, C, AG)

  if (landCategory === 'platted_subdivision' || landCategory === 'named_addition') {
    base.searchPlatArchive = true;
    base.searchByInstruments = true;
    base.expectedDocTypes = ['plat', 'deed'];
    parts.push('platted — plat archive search primary');
  }

  if (landCategory === 'abstract_survey' || landCategory === 'rural_acreage') {
    base.searchByInstruments = true;
    base.deedChainSearch = true;
    base.expectedDocTypes = ['deed'];
    parts.push('abstract survey — deed chain primary');
  }

  if (landCategory === 'commercial_lot') {
    base.searchPlatArchive = true;
    base.searchByInstruments = true;
    base.searchRelatedParcels = true;
    base.expectedDocTypes = ['plat', 'deed'];
    parts.push('commercial lot — plat + deed');
  }

  if (typeCode === 'AG') {
    base.searchByInstruments = true;
    base.deedChainSearch = true;
    if (!base.expectedDocTypes.includes('deed')) base.expectedDocTypes.push('deed');
    parts.push('agricultural — deed chain for ag history');
  }

  // Always search by owner name as enrichment/fallback
  base.searchByOwnerName = true;

  const rationale = parts.length > 0
    ? parts.join('; ')
    : `Standard ${typeCode} property — address + owner name search`;

  return { strategy: base, rationale };
}

// ── Main Classification Function ──────────────────────────────────────────────

/**
 * Classify a Bell County property and produce a search strategy.
 *
 * Combines all available data: type code, legal description, owner name.
 * Returns a complete BellPropertyClassification with strategy and rationale.
 *
 * @param rawTypeCode Raw PROP_TYPE value from Bell CAD (may be null/empty)
 * @param legalDescription Full legal description from CAD
 * @param ownerName Property owner name from CAD
 */
export function classifyBellProperty(
  rawTypeCode: string | null | undefined,
  legalDescription: string | null | undefined,
  ownerName: string | null | undefined,
): BellPropertyClassification {
  const typeCode = detectPropertyTypeCode(rawTypeCode, legalDescription, ownerName);
  const landCategory = classifyLegalDescription(legalDescription);
  const subdivisionName = extractSubdivisionNameFromLegal(legalDescription);
  const abstractSurveyName = extractAbstractSurveyName(legalDescription);
  const { lot: lotNumber, block: blockNumber } = extractLotBlock(legalDescription);
  const describedAcreage = extractDescribedAcreage(legalDescription);

  const { strategy, rationale } = buildStrategy(typeCode, landCategory);

  return {
    typeCode,
    landCategory,
    isPersonalProperty: typeCode === 'BP' || typeCode === 'P',
    isCommercial:       typeCode === 'C' || landCategory === 'commercial_lot',
    isRuralAcreage:     landCategory === 'rural_acreage' || landCategory === 'abstract_survey',
    isPlatted:          landCategory === 'platted_subdivision' || landCategory === 'named_addition',
    hasAbstractSurvey:  abstractSurveyName !== null,
    hasMineralInterest: typeCode === 'M' || landCategory === 'mineral_interest',
    isMobileHome:       typeCode === 'MH' || landCategory === 'mobile_home_site',
    isUtility:          typeCode === 'U' || landCategory === 'utility_line',
    subdivisionName,
    abstractSurveyName,
    lotNumber,
    blockNumber,
    describedAcreage,
    strategy,
    strategyRationale: rationale,
  };
}

// ── Address Pattern Helpers ────────────────────────────────────────────────────

/**
 * Determine whether an address looks like a Bell County rural/FM road address.
 * Rural addresses often use FM (Farm-to-Market), SH (State Highway), US, IH, or
 * County Road (CR) designators — these may not geocode well with standard methods.
 *
 * @param address Raw address string
 */
export function isBellCountyRuralAddress(address: string): boolean {
  return /\b(?:FM|SH|US|IH|CR|RR|HWY|HIGHWAY|COUNTY ROAD|FARM\s*(?:TO\s*)?MARKET)\b\s*\d+/i.test(address);
}

/**
 * Extract the FM/CR/SH route number from a Bell County rural address.
 * Returns "436" for "3779 FM 436, Belton TX" or null for city addresses.
 */
export function extractBellCountyRouteNumber(address: string): string | null {
  const m = address.match(/\b(?:FM|SH|US|IH|CR|RR|HWY|HIGHWAY)\s*(\d+)/i);
  return m ? m[1] : null;
}

/**
 * Normalize a Bell County address to CAD-friendly form.
 * Bell CAD indexes FM roads without the "FM" prefix — e.g., "3779 FM 436"
 * is indexed as "3779 436" in the street-address field.
 *
 * This utility is used to generate alternative search variants.
 */
export function normalizeBellCountyAddress(address: string): string[] {
  const variants: string[] = [address];

  // Strip FM/CR/SH prefix from road numbers
  const stripped = address.replace(/\b(FM|CR|SH|HWY)\s+(\d+)/gi, '$2');
  if (stripped !== address) variants.push(stripped);

  // Add numeric-only variant
  const numericOnly = address.replace(/\b(?:FM|CR|SH|US|IH|HWY|HIGHWAY)\s*/gi, '');
  if (numericOnly !== address && numericOnly !== stripped) variants.push(numericOnly);

  return [...new Set(variants)]; // deduplicate
}
