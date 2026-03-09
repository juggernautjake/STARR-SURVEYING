// worker/src/services/address-normalizer.ts
// Stage 1A: Address parsing, variant generation, and geocoding.
//
// Exports three independent functions that the discovery engine consumes:
//   parseAddress()            — split raw string into structured components
//   generateAddressVariants() — produce ordered list of CAD search strings
//   geocodeAddress()          — resolve lat/lon + county FIPS via Census/Nominatim
//
// IMPORTANT: Census geocoder returns preQualifier="FM" separately from
// streetName="436". This module recombines them before generating variants.

import { lookupCountyFIPS } from '../lib/county-fips.js';

// Re-export for consumers that import all address utilities from a single module
export { lookupCountyFIPS } from '../lib/county-fips.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ParsedAddress {
  streetNumber: string;
  streetName: string;
  streetSuffix?: string;
  unitType?: string;
  unitNumber?: string;
  city: string;
  state: string;
  zip?: string;
  county?: string;
  rawInput: string;
}

export interface GeocodedAddress extends ParsedAddress {
  latitude: number;
  longitude: number;
  countyFIPS: string;
  countyName: string;
  formattedAddress: string;
}

export interface AddressVariant {
  searchString: string;
  strategy: string;
  priority: number;  // 1 = try first
}

// ── Road prefix / suffix tables ───────────────────────────────────────────────

// Texas road prefixes → all known CAD index variations
// The first entry is the canonical abbreviation; '' means bare route number
const TX_ROAD_PREFIXES: Record<string, string[]> = {
  'FM':   ['FM', 'FM RD', 'FM ROAD', 'F.M.', 'F M', 'FARM TO MARKET', 'FARM TO MARKET ROAD', 'FARM-TO-MARKET ROAD', ''],
  'RM':   ['RM', 'RM RD', 'RM ROAD', 'R.M.', 'RANCH TO MARKET', 'RANCH-TO-MARKET ROAD', ''],
  'RR':   ['RR', 'RANCH ROAD', 'RANCH RD', ''],
  'CR':   ['CR', 'COUNTY ROAD', 'COUNTY RD', 'CO RD', 'C.R.'],
  'SH':   ['SH', 'STATE HWY', 'STATE HIGHWAY', 'ST HWY', 'S.H.', 'HWY', 'HIGHWAY'],
  'US':   ['US', 'US HWY', 'US HIGHWAY', 'HIGHWAY', 'HWY', 'U.S.'],
  'IH':   ['IH', 'I', 'INTERSTATE', 'INTERSTATE HIGHWAY', 'I-', 'I.H.'],
  'PR':   ['PR', 'PARK RD', 'PARK ROAD'],
  'SPUR': ['SPUR', 'SP', 'STATE SPUR'],
  'LOOP': ['LOOP', 'LP', 'STATE LOOP'],
  'BUS':  ['BUS', 'BUSINESS'],
  'HWY':  ['HWY', 'HIGHWAY'],
};

/** Reverse lookup: long form → canonical abbreviation */
const ROAD_LONG_TO_SHORT: Record<string, string> = {
  'FARM TO MARKET': 'FM', 'FARM-TO-MARKET': 'FM', 'FARM TO MARKET ROAD': 'FM',
  'FARM-TO-MARKET ROAD': 'FM', 'FARM ROAD': 'FM', 'FARM RD': 'FM',
  'RANCH TO MARKET': 'RM', 'RANCH-TO-MARKET': 'RM', 'RANCH TO MARKET ROAD': 'RM',
  'RANCH ROAD': 'RR', 'RANCH RD': 'RR',
  'STATE HIGHWAY': 'SH', 'STATE HWY': 'SH', 'ST HWY': 'SH',
  'US HIGHWAY': 'US', 'U.S. HIGHWAY': 'US',
  'INTERSTATE HIGHWAY': 'IH', 'INTERSTATE': 'IH',
  'COUNTY ROAD': 'CR', 'COUNTY RD': 'CR', 'CO ROAD': 'CR', 'CO RD': 'CR',
  'PARK ROAD': 'PR', 'PARK RD': 'PR',
  'STATE SPUR': 'SPUR', 'STATE LOOP': 'LOOP',
};

const STREET_SUFFIX_MAP: Record<string, string[]> = {
  'DR':   ['DR', 'DRIVE'],
  'ST':   ['ST', 'STREET'],
  'AVE':  ['AVE', 'AVENUE'],
  'BLVD': ['BLVD', 'BOULEVARD'],
  'LN':   ['LN', 'LANE'],
  'CT':   ['CT', 'COURT'],
  'CIR':  ['CIR', 'CIRCLE'],
  'PL':   ['PL', 'PLACE'],
  'WAY':  ['WAY'],
  'TRL':  ['TRL', 'TRAIL'],
  'RD':   ['RD', 'ROAD'],
  'PKWY': ['PKWY', 'PARKWAY'],
  'HWY':  ['HWY', 'HIGHWAY'],
  'CV':   ['CV', 'COVE'],
  'PT':   ['PT', 'POINT'],
  'RUN':  ['RUN'],
  'PASS': ['PASS'],
  'XING': ['XING', 'CROSSING'],
};

const DIRECTIONAL_MAP: Record<string, string[]> = {
  'N':  ['N', 'NORTH'],
  'S':  ['S', 'SOUTH'],
  'E':  ['E', 'EAST'],
  'W':  ['W', 'WEST'],
  'NE': ['NE', 'NORTHEAST'],
  'NW': ['NW', 'NORTHWEST'],
  'SE': ['SE', 'SOUTHEAST'],
  'SW': ['SW', 'SOUTHWEST'],
};

/** All single-letter directionals for quick checks */
const DIRECTIONAL_ABBREVS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);

/** All directional words (including spelled-out) */
const ALL_DIRECTIONALS = new Set<string>();
for (const forms of Object.values(DIRECTIONAL_MAP)) {
  for (const f of forms) ALL_DIRECTIONALS.add(f);
}

// ── Directional utilities ───────────────────────────────────────────────────

function abbreviateDirectional(dir: string): string {
  const upper = dir.toUpperCase().trim();
  for (const [abbrev, forms] of Object.entries(DIRECTIONAL_MAP)) {
    if (forms.some(f => f === upper)) return abbrev;
  }
  return upper;
}

function expandDirectional(dir: string): string {
  const upper = dir.toUpperCase().trim();
  for (const [, forms] of Object.entries(DIRECTIONAL_MAP)) {
    if (forms.some(f => f === upper)) {
      return forms.reduce((a, b) => a.length > b.length ? a : b);
    }
  }
  return upper;
}

// ── Texas road detection ────────────────────────────────────────────────────

/** TX road type pattern (abbreviations only) */
const TX_ROAD_RE = /\b(FM|RM|RR|SH|US|IH|CR|PR|SPUR|LOOP|HWY|BUS)\b/i;

/**
 * Detect a Texas designated road from a street name string.
 * Returns the canonical prefix and route number, or null.
 *
 * Handles:
 *  "FM 436", "W FM 436", "FARM TO MARKET ROAD 436",
 *  "FARM-TO-MARKET ROAD 436", "F.M. 436", "F M 436"
 */
function detectTexasRoad(streetName: string): { prefix: string; routeNumber: string; directional: string | null } | null {
  const upper = streetName.toUpperCase().trim();

  // Strip leading directional if present
  let directional: string | null = null;
  let remainder = upper;

  const leadingDirMatch = remainder.match(/^(NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST|NE|NW|SE|SW|N|S|E|W)\s+/i);
  if (leadingDirMatch) {
    directional = abbreviateDirectional(leadingDirMatch[1]);
    remainder = remainder.substring(leadingDirMatch[0].length);
  }

  // Try long-form matches first (sorted by length, longest first)
  const longForms = Object.keys(ROAD_LONG_TO_SHORT).sort((a, b) => b.length - a.length);
  for (const longForm of longForms) {
    if (remainder.startsWith(longForm + ' ')) {
      const routeNum = remainder.substring(longForm.length).trim();
      if (/^\d+/.test(routeNum)) {
        return { prefix: ROAD_LONG_TO_SHORT[longForm], routeNumber: routeNum, directional };
      }
    }
  }

  // Try short-form abbreviation matches
  const shortMatch = remainder.match(/^(FM|RM|RR|SH|US|IH|CR|PR|SPUR|LOOP|HWY|BUS)\s+(?:RD\s+|ROAD\s+)?(\d+.*)$/i);
  if (shortMatch) {
    return { prefix: shortMatch[1].toUpperCase(), routeNumber: shortMatch[2].trim(), directional };
  }

  // Try dotted/spaced abbreviations: "F.M. 436", "F M 436"
  const dottedMatch = remainder.match(/^([A-Z])\.([A-Z])\.\s*(\d+.*)$/);
  if (dottedMatch) {
    const abbrev = dottedMatch[1] + dottedMatch[2];
    if (TX_ROAD_PREFIXES[abbrev]) {
      return { prefix: abbrev, routeNumber: dottedMatch[3].trim(), directional };
    }
  }
  const spacedMatch = remainder.match(/^([A-Z])\s([A-Z])\s+(\d+.*)$/);
  if (spacedMatch) {
    const abbrev = spacedMatch[1] + spacedMatch[2];
    if (TX_ROAD_PREFIXES[abbrev]) {
      return { prefix: abbrev, routeNumber: spacedMatch[3].trim(), directional };
    }
  }

  // Also check trailing directional: "FM 436 W"
  if (!directional) {
    const trailingDirMatch = upper.match(/\s+(N|S|E|W|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST)$/i);
    if (trailingDirMatch) {
      const withoutTrailing = upper.substring(0, upper.length - trailingDirMatch[0].length).trim();
      const inner = detectTexasRoad(withoutTrailing);
      if (inner) {
        inner.directional = abbreviateDirectional(trailingDirMatch[1]);
        return inner;
      }
    }
  }

  return null;
}

/**
 * Strip directional prefixes and suffixes from a Texas road name.
 * "W FM 436" → "FM 436", "FM 436 W" → "FM 436"
 */
function stripDirectionalFromTxRoad(streetName: string): string {
  if (!TX_ROAD_RE.test(streetName)) return streetName;

  let result = streetName;
  // Strip leading directional
  result = result.replace(/^(NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST|NE|NW|SE|SW|N|S|E|W)\s+/i, '');
  // Strip trailing directional
  result = result.replace(/\s+(NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST|NE|NW|SE|SW|N|S|E|W)$/i, '');
  return result.trim();
}

// ── parseAddress ──────────────────────────────────────────────────────────────

export function parseAddress(rawAddress: string): ParsedAddress {
  const cleaned = rawAddress.trim().replace(/\s+/g, ' ').toUpperCase();

  // Pattern: {number} {street} {suffix?}, {city}, {state} {zip?}
  const fullPattern = /^(\d+[A-Z]?)\s+(.+?)(?:\s+(SUITE|STE|APT|UNIT|LOT|SPACE|#)\s*(\S+))?\s*,\s*(.+?)\s*,\s*(TX|TEXAS)\s*(\d{5}(?:-\d{4})?)?$/i;
  const match = cleaned.match(fullPattern);

  if (match) {
    return {
      streetNumber: match[1],
      streetName:   match[2].trim(),
      unitType:     match[3] || undefined,
      unitNumber:   match[4] || undefined,
      city:         match[5].trim(),
      state:        'TX',
      zip:          match[7] || undefined,
      rawInput:     rawAddress,
    };
  }

  // Simpler pattern without city/state
  const simplePattern = /^(\d+[A-Z]?)\s+(.+?)$/i;
  const simpleMatch = cleaned.match(simplePattern);
  if (simpleMatch) {
    return {
      streetNumber: simpleMatch[1],
      streetName:   simpleMatch[2].trim(),
      city:         '',
      state:        'TX',
      rawInput:     rawAddress,
    };
  }

  // Return as-is if unparseable
  return {
    streetNumber: '',
    streetName:   cleaned,
    city:         '',
    state:        'TX',
    rawInput:     rawAddress,
  };
}

// ── generateAddressVariants ───────────────────────────────────────────────────

export function generateAddressVariants(parsed: ParsedAddress): AddressVariant[] {
  const variants: AddressVariant[] = [];
  const seen = new Set<string>();
  let priority = 0;

  function add(searchStr: string, strategy: string): void {
    const key = searchStr.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    priority++;
    variants.push({ searchString: searchStr, strategy, priority });
  }

  // Detect if this is a Texas designated road
  const txRoad = detectTexasRoad(parsed.streetName);

  if (txRoad) {
    const { prefix, routeNumber, directional } = txRoad;
    const prefixVariants = TX_ROAD_PREFIXES[prefix] ?? [prefix];

    // === TIER 1: Canonical form WITHOUT directional (highest priority) ===
    // This is what Bell CAD (and most BIS systems) actually indexes.
    // Proven: "3779" + "FM 436" → 1 result on Bell CAD.
    add(`${parsed.streetNumber} ${prefix} ${routeNumber}`, 'tx_canonical_no_dir');

    // === TIER 2: Canonical form WITH directional ===
    if (directional) {
      add(`${parsed.streetNumber} ${directional} ${prefix} ${routeNumber}`, 'tx_canonical_with_dir');
    }

    // === TIER 3: Common CAD variations (FM RD, FM ROAD, etc.) ===
    for (const variation of prefixVariants) {
      if (variation && variation !== prefix) {
        const street = `${variation} ${routeNumber}`;
        add(`${parsed.streetNumber} ${street}`, `tx_variation_${variation.toLowerCase().replace(/[\s.]+/g, '_')}`);
      }
    }

    // === TIER 4: Dotted/spaced abbreviations ===
    if (prefix.length === 2) {
      add(`${parsed.streetNumber} ${prefix[0]}.${prefix[1]}. ${routeNumber}`, 'tx_dotted');
      add(`${parsed.streetNumber} ${prefix[0]} ${prefix[1]} ${routeNumber}`, 'tx_spaced');
    }

    // === TIER 5: With directional + variation combos ===
    if (directional) {
      add(`${parsed.streetNumber} ${directional} ${prefix} RD ${routeNumber}`, 'tx_dir_rd');
      const dirFull = expandDirectional(directional);
      if (dirFull !== directional) {
        add(`${parsed.streetNumber} ${dirFull} ${prefix} ${routeNumber}`, 'tx_dir_full');
      }
    }

    // === TIER 6: Trailing directional ===
    if (directional) {
      add(`${parsed.streetNumber} ${prefix} ${routeNumber} ${directional}`, 'tx_trailing_dir');
    }

    // === TIER 7: HWY as alternate prefix ===
    if (!['CR', 'LOOP', 'SPUR', 'PR'].includes(prefix)) {
      add(`${parsed.streetNumber} HWY ${routeNumber}`, 'tx_hwy_fallback');
      if (directional) {
        add(`${parsed.streetNumber} ${directional} HWY ${routeNumber}`, 'tx_hwy_dir_fallback');
      }
    }

    // === TIER 8: Bare route number (desperation) ===
    add(`${parsed.streetNumber} ${routeNumber}`, 'tx_bare_number');

  } else {
    // ── Regular street address ───────────────────────────────────────────

    // Variant 1: As-entered
    add(`${parsed.streetNumber} ${parsed.streetName}`, 'as_entered');

    // Detect directional in street name
    const streetParts = parsed.streetName.split(' ');
    const firstWord = streetParts[0];
    let detectedDir: string | null = null;
    let streetWithoutDir: string | null = null;

    if (ALL_DIRECTIONALS.has(firstWord)) {
      detectedDir = abbreviateDirectional(firstWord);
      streetWithoutDir = streetParts.slice(1).join(' ');
    }

    // Variant 2: Without directional prefix
    if (detectedDir && streetWithoutDir) {
      add(`${parsed.streetNumber} ${streetWithoutDir}`, `strip_directional_${detectedDir}`);
      // Alternate directional forms
      const forms = DIRECTIONAL_MAP[detectedDir] ?? [];
      for (const altForm of forms) {
        if (altForm !== firstWord) {
          add(`${parsed.streetNumber} ${altForm} ${streetWithoutDir}`, `alt_directional_${altForm}`);
        }
      }
    }

    // Variant 3: Suffix variations (DR ↔ DRIVE, etc.)
    for (const [, forms] of Object.entries(STREET_SUFFIX_MAP)) {
      for (const form of forms) {
        if (parsed.streetName.endsWith(' ' + form)) {
          const baseName = parsed.streetName.slice(0, -(form.length + 1));
          for (const altForm of forms) {
            if (altForm !== form) {
              add(`${parsed.streetNumber} ${baseName} ${altForm}`, `suffix_variant_${altForm}`);
            }
          }
          // Without suffix entirely
          add(`${parsed.streetNumber} ${baseName}`, 'strip_suffix');
          break;
        }
      }
    }

    // Variant 4: UPPERCASE
    const upperName = parsed.streetName.toUpperCase();
    if (upperName !== parsed.streetName) {
      add(`${parsed.streetNumber} ${upperName}`, 'uppercase');
    }
  }

  // Street number only (broadest possible search — last resort, fixed priority 99)
  if (parsed.streetNumber) {
    const numKey = parsed.streetNumber.toLowerCase().trim();
    if (!seen.has(numKey)) {
      seen.add(numKey);
      variants.push({ searchString: parsed.streetNumber, strategy: 'number_only', priority: 99 });
    }
  }

  return variants.sort((a, b) => a.priority - b.priority);
}

// ── geocodeAddress ────────────────────────────────────────────────────────────

export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  // Try Census Bureau Geocoder first (free, no API key needed, US-specific)
  try {
    const encodedAddr = encodeURIComponent(address);
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodedAddr}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

    const response = await fetch(censusUrl, { signal: AbortSignal.timeout(10000) });
    const data = await response.json() as {
      result?: {
        addressMatches?: Array<{
          coordinates: { x: string; y: string };
          matchedAddress: string;
          addressComponents?: {
            fromAddress: string;
            preQualifier: string;
            preDirection: string;
            preType: string;
            streetName: string;
            suffixType: string;
            suffixDirection: string;
          };
          geographies?: { Counties?: Array<{ GEOID: string; NAME: string }> };
        }>;
      };
    };

    const match = data?.result?.addressMatches?.[0];
    if (match) {
      const county = match.geographies?.Counties?.[0];
      const comp = match.addressComponents;

      // Reconstruct street name from Census components.
      // Census returns preQualifier="FM" and streetName="436" separately —
      // we must recombine them to get "FM 436".
      let streetName = '';
      if (comp) {
        const parts: string[] = [];
        // preQualifier is the road type for TX roads (FM, SH, CR, etc.)
        if (comp.preQualifier) parts.push(comp.preQualifier.trim());
        // preType is sometimes used instead of preQualifier
        if (comp.preType && !comp.preQualifier) parts.push(comp.preType.trim());
        parts.push(comp.streetName.trim());
        if (comp.suffixType) parts.push(comp.suffixType.trim());
        streetName = parts.join(' ');
      }

      const parsed = parseAddress(address);
      // Override parsed street name with the properly reconstructed one
      if (streetName) {
        parsed.streetName = streetName.toUpperCase();
      }
      if (comp?.fromAddress) {
        parsed.streetNumber = comp.fromAddress;
      }

      return {
        ...parsed,
        latitude:         parseFloat(match.coordinates.y),
        longitude:        parseFloat(match.coordinates.x),
        countyFIPS:       county?.GEOID ?? '',
        countyName:       county?.NAME ?? '',
        formattedAddress: match.matchedAddress,
      };
    }
  } catch (e) {
    console.warn('Census geocoder failed:', e);
  }

  // Fallback: Nominatim (OpenStreetMap)
  try {
    const encodedAddr = encodeURIComponent(address);
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodedAddr}&format=json&addressdetails=1&countrycodes=us&limit=1`;

    const response = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'StarrSoftware/1.0 (property-research)' },
      signal:  AbortSignal.timeout(10000),
    });
    const data = await response.json() as Array<{
      lat: string;
      lon: string;
      display_name: string;
      address?: { county?: string; road?: string; house_number?: string };
    }>;

    if (data?.length > 0) {
      const result = data[0];
      const rawCounty = result.address?.county?.replace(/ County$/i, '') ?? '';

      // Resolve FIPS from the county name using the shared lookup
      const fips = lookupCountyFIPS(rawCounty, 'TX');

      const parsed = parseAddress(address);

      // Nominatim returns road as "Farm-to-Market Road 436" — convert to "FM 436"
      if (result.address?.road) {
        const convertedRoad = convertNominatimRoad(result.address.road);
        if (convertedRoad) {
          parsed.streetName = convertedRoad.toUpperCase();
        }
      }
      if (result.address?.house_number) {
        parsed.streetNumber = result.address.house_number;
      }

      return {
        ...parsed,
        latitude:         parseFloat(result.lat),
        longitude:        parseFloat(result.lon),
        countyFIPS:       fips,
        countyName:       rawCounty.toUpperCase(),
        formattedAddress: result.display_name,
      };
    }
  } catch (e) {
    console.warn('Nominatim geocoder failed:', e);
  }

  return null;
}

// ── Nominatim road name conversion ──────────────────────────────────────────

// ── AI-Generated Address Variants ──────────────────────────────────────────

/**
 * Ask Claude to generate additional address search variants when deterministic
 * variants all fail. Returns AddressVariant[] that can be passed directly to
 * the CAD adapter's searchByAddress() method.
 *
 * This is a safety net — the deterministic engine handles 95% of cases.
 * AI catches edge cases: local road nicknames, county-specific quirks,
 * unusual abbreviation patterns, historical road name changes.
 */
export async function generateAiAddressVariants(
  rawAddress: string,
  alreadyTried: AddressVariant[],
  anthropicApiKey: string,
): Promise<AddressVariant[]> {
  try {
    const triedList = alreadyTried
      .map((v) => `"${v.searchString}"`)
      .join(', ');

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `I'm searching a Texas county CAD (Central Appraisal District) database for a property at this address:

"${rawAddress}"

The CAD search takes a combined search string (street number + street name). I already tried these search strings and all returned 0 results:
${triedList}

Generate additional search string variants that the CAD system might use to index this address. Consider:
- Texas road naming conventions (FM, SH, CR, RM, RR, US, IH roads)
- Whether directionals (N/S/E/W) should be included, excluded, or repositioned
- Whether road type prefixes should be abbreviated differently
- Common local naming variations or alternate road names
- Whether "RD", "ROAD", "HWY" suffixes might be used

Return ONLY a JSON array of search strings. Example: ["3779 FM 436","3779 FARM MARKET 436","3779 HIGHWAY 436"]

Important: Do NOT repeat strings already tried. Only return NEW variants.`,
      }],
    });

    const text = response.content.find((c) => c.type === 'text');
    if (!text || text.type !== 'text') return [];

    const cleaned = text.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const aiResults = JSON.parse(cleaned) as string[];

    if (!Array.isArray(aiResults) || aiResults.length === 0) return [];

    const triedKeys = new Set(alreadyTried.map((v) => v.searchString.toLowerCase()));
    const newVariants: AddressVariant[] = [];
    let priority = 50;

    for (const searchStr of aiResults) {
      if (typeof searchStr !== 'string' || !searchStr.trim()) continue;
      if (triedKeys.has(searchStr.toLowerCase())) continue;
      triedKeys.add(searchStr.toLowerCase());

      newVariants.push({
        searchString: searchStr.trim(),
        strategy: `ai_variant_${newVariants.length + 1}`,
        priority: priority++,
      });
    }

    return newVariants;
  } catch {
    return [];
  }
}

// ── Nominatim road name conversion ──────────────────────────────────────────

/** Convert Nominatim long-form road names to CAD-friendly abbreviations */
function convertNominatimRoad(road: string): string {
  let result = road.trim();

  // Sort long forms by length (longest first) to match "Farm-to-Market Road" before "Farm-to-Market"
  const longForms = Object.keys(ROAD_LONG_TO_SHORT).sort((a, b) => b.length - a.length);

  for (const longForm of longForms) {
    const re = new RegExp(longForm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(result)) {
      result = result.replace(re, ROAD_LONG_TO_SHORT[longForm]);
      break;
    }
  }

  return result.replace(/\s+/g, ' ').trim();
}
