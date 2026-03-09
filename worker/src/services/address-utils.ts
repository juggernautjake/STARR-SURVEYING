/**
 * address-utils.ts — Texas Address Normalization & Variant Engine
 * Starr Software — Drop-in replacement
 *
 * Uses project interfaces from ../types/index.ts and ../lib/logger.ts
 */

import { ParsedAddress, AddressVariant, NormalizedAddress } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ━━ TEXAS ROAD PREFIX REGISTRY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TxRoadDef {
  canonical: string;
  fullNames: string[];
  inputVariations: string[];
}

const TX_ROAD_DEFS: TxRoadDef[] = [
  { canonical: 'FM', fullNames: ['Farm to Market', 'Farm-to-Market', 'Farm to Market Road', 'Farm-to-Market Road', 'Farm Road', 'Farm Rd'], inputVariations: ['FM', 'FM RD', 'FM ROAD', 'FMR'] },
  { canonical: 'RM', fullNames: ['Ranch to Market', 'Ranch-to-Market', 'Ranch to Market Road'], inputVariations: ['RM', 'RM RD', 'RM ROAD'] },
  { canonical: 'RR', fullNames: ['Ranch Road', 'Ranch Rd'], inputVariations: ['RR', 'RR RD'] },
  { canonical: 'SH', fullNames: ['State Highway', 'State Hwy', 'State Route', 'St Hwy'], inputVariations: ['SH', 'ST HWY', 'STATE HWY'] },
  { canonical: 'US', fullNames: ['US Highway', 'U.S. Highway', 'US Hwy'], inputVariations: ['US', 'US HWY', 'USH'] },
  { canonical: 'IH', fullNames: ['Interstate Highway', 'Interstate', 'Interstate Hwy'], inputVariations: ['IH', 'INTERSTATE', 'INT'] },
  { canonical: 'CR', fullNames: ['County Road', 'County Rd', 'Co Road', 'Co Rd'], inputVariations: ['CR', 'CO RD', 'COUNTY RD'] },
  { canonical: 'SL', fullNames: ['State Loop', 'Loop'], inputVariations: ['SL', 'LOOP', 'LP'] },
  { canonical: 'SS', fullNames: ['State Spur', 'Spur'], inputVariations: ['SS', 'SPUR', 'SP'] },
  { canonical: 'PR', fullNames: ['Park Road', 'Park Rd'], inputVariations: ['PR', 'PARK RD'] },
  { canonical: 'RE', fullNames: ['Recreational Road'], inputVariations: ['RE', 'REC RD'] },
  { canonical: 'BI', fullNames: ['Business Interstate'], inputVariations: ['BI', 'BUS I', 'BUS IH'] },
  { canonical: 'BU', fullNames: ['Business US', 'Business US Highway'], inputVariations: ['BU', 'BUS US'] },
  { canonical: 'BS', fullNames: ['Business State Highway'], inputVariations: ['BS', 'BUS SH'] },
  { canonical: 'BF', fullNames: ['Business FM'], inputVariations: ['BF', 'BUS FM'] },
];

const TX_PREFIX_LOOKUP = new Map<string, string>();
for (const def of TX_ROAD_DEFS) {
  TX_PREFIX_LOOKUP.set(def.canonical.toUpperCase(), def.canonical);
  for (const v of def.inputVariations) {
    TX_PREFIX_LOOKUP.set(v.toUpperCase().replace(/\./g, ''), def.canonical);
    TX_PREFIX_LOOKUP.set(v.toUpperCase(), def.canonical);
  }
}

const TX_SPELLED_OUT_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [];
for (const def of TX_ROAD_DEFS) {
  for (const fullName of def.fullNames) {
    const escaped = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
    TX_SPELLED_OUT_PATTERNS.push({
      pattern: new RegExp('^' + escaped + '\\s+(\\d+)', 'i'),
      canonical: def.canonical,
    });
  }
}
TX_SPELLED_OUT_PATTERNS.sort((a, b) => b.pattern.source.length - a.pattern.source.length);

function getTxRoadDef(canonical: string): TxRoadDef | undefined {
  return TX_ROAD_DEFS.find(d => d.canonical === canonical);
}

// ━━ DIRECTIONALS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DIR_MAP: Record<string, { abbrev: string; full: string }> = {
  'N': { abbrev: 'N', full: 'NORTH' }, 'S': { abbrev: 'S', full: 'SOUTH' },
  'E': { abbrev: 'E', full: 'EAST' },  'W': { abbrev: 'W', full: 'WEST' },
  'NE': { abbrev: 'NE', full: 'NORTHEAST' }, 'NW': { abbrev: 'NW', full: 'NORTHWEST' },
  'SE': { abbrev: 'SE', full: 'SOUTHEAST' }, 'SW': { abbrev: 'SW', full: 'SOUTHWEST' },
  'NORTH': { abbrev: 'N', full: 'NORTH' }, 'SOUTH': { abbrev: 'S', full: 'SOUTH' },
  'EAST': { abbrev: 'E', full: 'EAST' },  'WEST': { abbrev: 'W', full: 'WEST' },
  'NORTHEAST': { abbrev: 'NE', full: 'NORTHEAST' }, 'NORTHWEST': { abbrev: 'NW', full: 'NORTHWEST' },
  'SOUTHEAST': { abbrev: 'SE', full: 'SOUTHEAST' }, 'SOUTHWEST': { abbrev: 'SW', full: 'SOUTHWEST' },
};

function isDirectional(w: string): boolean { return w.toUpperCase() in DIR_MAP; }
function abbrDir(w: string): string { return DIR_MAP[w.toUpperCase()]?.abbrev ?? w; }
function expandDir(w: string): string { return DIR_MAP[w.toUpperCase()]?.full ?? w; }

// ━━ STREET TYPE HANDLING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STREET_TYPE_MAP: Record<string, string[]> = {
  'St': ['Street','St','Str'], 'Dr': ['Drive','Dr','Drv'], 'Ave': ['Avenue','Ave','Av'],
  'Blvd': ['Boulevard','Blvd'], 'Ln': ['Lane','Ln'], 'Rd': ['Road','Rd'],
  'Ct': ['Court','Ct'], 'Cir': ['Circle','Cir'], 'Pl': ['Place','Pl'],
  'Way': ['Way'], 'Pkwy': ['Parkway','Pkwy'], 'Trl': ['Trail','Trl'],
  'Loop': ['Loop','Lp'], 'Hwy': ['Highway','Hwy'], 'Cv': ['Cove','Cv'],
  'Run': ['Run'], 'Pass': ['Pass'], 'Xing': ['Crossing','Xing'],
  'Bnd': ['Bend','Bnd'], 'Trce': ['Trace','Trce'], 'Vw': ['View','Vw'],
  'Ter': ['Terrace','Ter'], 'Spgs': ['Springs','Spgs'],
};

const ABBREV_MAP = new Map<string, string>();
for (const [abbr, forms] of Object.entries(STREET_TYPE_MAP)) {
  for (const f of forms) ABBREV_MAP.set(f.toLowerCase(), abbr);
}

function abbreviateType(t: string): string { return ABBREV_MAP.get(t.toLowerCase()) ?? t; }
function expandType(abbr: string): string | null { return STREET_TYPE_MAP[abbreviateType(abbr)]?.[0] ?? null; }
function isStreetType(w: string): boolean { return ABBREV_MAP.has(w.toLowerCase()); }

// ━━ TEXAS ROAD DETECTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TxRoadDetection {
  canonical: string;
  routeNumber: string;
  directional: string | null;
}

function detectTexasRoad(input: string): TxRoadDetection | null {
  const s = input.trim();
  if (!s) return null;

  // 1. Check spelled-out forms
  for (const { pattern, canonical } of TX_SPELLED_OUT_PATTERNS) {
    const m = s.match(pattern);
    if (m) return { canonical, routeNumber: m[m.length - 1], directional: null };
  }

  // 2. Tokenize
  const normalized = s.replace(/\./g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const tokens = normalized.split(' ');

  for (let i = 0; i < tokens.length; i++) {
    const canonical = TX_PREFIX_LOOKUP.get(tokens[i]);
    if (!canonical) continue;

    let routeIdx = -1;
    for (let j = i + 1; j < tokens.length && j <= i + 2; j++) {
      if (/^\d+$/.test(tokens[j])) { routeIdx = j; break; }
      if (/^(RD|ROAD)$/i.test(tokens[j])) continue;
      if (isDirectional(tokens[j])) continue;
      break;
    }
    if (routeIdx === -1) continue;

    let dir: string | null = null;
    if (i > 0 && isDirectional(tokens[i - 1])) dir = abbrDir(tokens[i - 1]);
    if (!dir && routeIdx + 1 < tokens.length && isDirectional(tokens[routeIdx + 1])) dir = abbrDir(tokens[routeIdx + 1]);

    return { canonical, routeNumber: tokens[routeIdx], directional: dir };
  }

  // 3. I-35 style
  const ih = normalized.match(/^(?:([NSEW]|NORTH|SOUTH|EAST|WEST)\s+)?I[- ]?(\d+)$/);
  if (ih) return { canonical: 'IH', routeNumber: ih[2], directional: ih[1] ? abbrDir(ih[1]) : null };

  return null;
}

// ━━ NOMINATIM ROAD PARSER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function parseNominatimRoad(road: string): { name: string; type: string } {
  const tx = detectTexasRoad(road);
  if (tx) return { name: tx.canonical + ' ' + tx.routeNumber, type: '' };

  const words = road.trim().split(/\s+/);
  if (words.length >= 2) {
    const last = words[words.length - 1].replace(/\.$/, '');
    if (isStreetType(last)) return { name: words.slice(0, -1).join(' '), type: abbreviateType(last) };
  }
  return { name: road, type: '' };
}

// ━━ CENSUS POST-PROCESSING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function parseCensusComponents(components: Record<string, string>): ParsedAddress {
  const streetNumber = (components.fromAddress || '').replace(/[^0-9]/g, '');
  const preDir = (components.preDirection || '').trim();
  const preQual = (components.preQualifier || '').trim();
  const streetName = (components.streetName || '').trim();
  const suffixType = (components.suffixType || '').trim();
  const suffixDir = (components.suffixDirection || '').trim();

  // Detect TX designated road: Census puts prefix in preQualifier
  const qualCanonical = TX_PREFIX_LOOKUP.get(preQual.toUpperCase().replace(/\./g, ''));

  if (qualCanonical && /^\d+$/.test(streetName)) {
    return {
      streetNumber,
      streetName: qualCanonical + ' ' + streetName,
      streetType: '',
      preDirection: preDir || null,
      postDirection: suffixDir || null,
      unit: null,
      city: (components.city || '').trim() || null,
      state: (components.state || '').trim() || null,
      zip: (components.zip || '').trim() || null,
    };
  }

  // Standard address
  let fullName = '';
  if (preDir) fullName += preDir + ' ';
  if (preQual) fullName += preQual + ' ';
  fullName += streetName;
  fullName = fullName.trim();

  return {
    streetNumber,
    streetName: fullName,
    streetType: suffixType,
    preDirection: null,
    postDirection: suffixDir || null,
    unit: null,
    city: (components.city || '').trim() || null,
    state: (components.state || '').trim() || null,
    zip: (components.zip || '').trim() || null,
  };
}

// ━━ ADDRESS PARSERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function parseAddress(raw: string): ParsedAddress {
  return manualParse(raw);
}

/** Kept for backward compatibility with callers that used the old export name. */
export function parseAddressManually(raw: string): ParsedAddress {
  return manualParse(raw);
}

export function manualParse(raw: string): ParsedAddress {
  let addr = raw.trim().replace(/\s+/g, ' ');

  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  const full = addr.match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
  if (full) {
    addr = full[1].trim(); city = full[2].trim(); state = full[3].toUpperCase(); zip = full[4] || null;
  } else {
    const short = addr.match(/^(.+?),\s*([^,]+?)\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
    if (short) {
      addr = short[1].trim(); city = short[2].trim(); state = short[3].toUpperCase(); zip = short[4] || null;
    }
  }

  const streetNumber = addr.match(/^(\d+)\s/)?.[1] || addr.split(' ')[0] || '';
  const streetPart = addr.replace(/^\d+\s+/, '');

  // Check for Texas designated road
  const tx = detectTexasRoad(streetPart);
  if (tx) {
    return {
      streetNumber,
      streetName: tx.canonical + ' ' + tx.routeNumber,
      streetType: '',
      preDirection: tx.directional,
      postDirection: null,
      unit: null, city, state, zip,
    };
  }

  // Standard street parsing
  const parts = addr.split(' ');
  let streetName = '';
  let streetType = '';
  let unit: string | null = null;
  let preDirection: string | null = null;

  const unitIdx = parts.findIndex(p => /^(apt|unit|ste|suite|#)\.?$/i.test(p));
  if (unitIdx > 0) {
    unit = parts.slice(unitIdx).join(' ');
    const sParts = parts.slice(1, unitIdx);
    const lastP = sParts[sParts.length - 1];
    if (lastP && isStreetType(lastP)) streetType = abbreviateType(sParts.pop()!);
    streetName = sParts.join(' ');
  } else {
    const rest = parts.slice(1);
    if (rest.length >= 2 && isDirectional(rest[0])) {
      preDirection = abbrDir(rest[0]);
    }
    const lastWord = rest[rest.length - 1];
    if (rest.length >= 2 && lastWord && isStreetType(lastWord)) {
      streetType = abbreviateType(lastWord);
      streetName = rest.slice(0, -1).join(' ');
    } else {
      streetName = rest.join(' ');
    }
  }

  return { streetNumber, streetName, streetType, preDirection, postDirection: null, unit, city, state, zip };
}

// ━━ VARIANT GENERATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateVariants(parsed: ParsedAddress, rawAddress?: string): AddressVariant[] {
  const tx = detectTexasRoad(parsed.streetName);
  if (tx) return generateTexasRoadVariants(parsed.streetNumber, tx, parsed.preDirection);
  return generateStandardVariants(parsed, rawAddress);
}

function generateTexasRoadVariants(num: string, tx: TxRoadDetection, parsedDir: string | null): AddressVariant[] {
  const variants: AddressVariant[] = [];
  const seen = new Set<string>();
  const prefix = tx.canonical;
  const route = tx.routeNumber;
  const dir = tx.directional || parsedDir;
  const def = getTxRoadDef(prefix);
  let priority = 0;

  function add(name: string, format: string, isPartial = false) {
    const key = (num + '|' + name).toUpperCase();
    if (seen.has(key) || !num || !name) return;
    seen.add(key);
    variants.push({ streetNumber: num, streetName: name, format, priority: priority++, isPartial });
  }

  // TIER 1: Canonical WITHOUT directional — PROVEN on Bell CAD
  add(prefix + ' ' + route, 'canonical');

  // TIER 2: Canonical WITH abbreviated directional
  if (dir) add(dir + ' ' + prefix + ' ' + route, 'canonical+dir');

  // TIER 3: Common abbreviation variants (no dir)
  if (def) {
    for (const v of def.inputVariations) {
      if (v === prefix) continue;
      add(v + ' ' + route, 'variation:' + v);
    }
  }

  // TIER 4: With RD/ROAD suffix
  add(prefix + ' RD ' + route, 'canonical+RD');
  add(prefix + ' ROAD ' + route, 'canonical+ROAD');

  // TIER 5: Spelled-out forms
  if (def) {
    for (const fn of def.fullNames) add(fn + ' ' + route, 'full:' + fn);
  }

  // TIER 6: Directional combinations
  if (dir) {
    const dirFull = expandDir(dir);
    add(dirFull + ' ' + prefix + ' ' + route, 'full_dir+canonical');
    add(dir + ' ' + prefix + ' RD ' + route, 'dir+canonical+RD');
    add(prefix + ' ' + route + ' ' + dir, 'canonical+trailing_dir');
    if (def) {
      for (const v of def.inputVariations) add(dir + ' ' + v + ' ' + route, 'dir+variation:' + v);
    }
  }

  // TIER 7: HWY fallback
  if (!['CR','SL','SS','PR','RE'].includes(prefix)) {
    add('HWY ' + route, 'hwy_fallback');
    if (dir) add(dir + ' HWY ' + route, 'dir+hwy_fallback');
  }

  // TIER 8: Route number only — marked non-partial because some BIS CADs (e.g., Bell CAD) index
  // FM/RM roads without the road-type prefix; the route number alone is specific enough.
  add(route, 'route_number_only', false);

  return variants;
}

function generateStandardVariants(parsed: ParsedAddress, rawAddress?: string): AddressVariant[] {
  const variants: AddressVariant[] = [];
  const seen = new Set<string>();
  const num = parsed.streetNumber;
  const name = parsed.streetName;
  const type = parsed.streetType;
  let priority = 0;

  function add(sn: string, format: string, isPartial = false) {
    const key = (num + '|' + sn).toUpperCase();
    if (seen.has(key) || !num || !sn) return;
    seen.add(key);
    variants.push({ streetNumber: num, streetName: sn, format, priority: priority++, isPartial });
  }

  if (name && type) {
    add(name + ' ' + abbreviateType(type), 'name+abbr_type');
    const fullT = expandType(type);
    if (fullT && fullT !== abbreviateType(type)) add(name + ' ' + fullT, 'name+full_type');
  }

  if (name) add(name, 'name_only');

  // Without directional
  if (name) {
    const stripped = name.replace(/^(N|S|E|W|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST)\s+/i, '');
    if (stripped !== name) {
      if (type) add(stripped + ' ' + abbreviateType(type), 'no_dir+type');
      add(stripped, 'no_dir');
    }
  }

  if (rawAddress) {
    const manual = manualParse(rawAddress);
    if (manual.streetName && manual.streetName !== name) {
      if (manual.streetType) add(manual.streetName + ' ' + abbreviateType(manual.streetType), 'manual+type');
      add(manual.streetName, 'manual');
    }
  }

  // Partial fallback
  if (name) add(name.split(' ')[0] || name, 'partial', true);

  return variants;
}

// ━━ FULL NORMALIZATION (with geocoding) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function normalizeAddress(
  rawAddress: string,
  logger: PipelineLogger,
): Promise<NormalizedAddress> {
  const tag = '[ADDRESS]';
  console.log(tag + ' Normalizing: "' + rawAddress + '"');

  const result: NormalizedAddress = {
    raw: rawAddress,
    canonical: null,
    parsed: manualParse(rawAddress),
    geocoded: false,
    source: 'manual',
    variants: [],
    lat: null,
    lon: null,
    detectedCounty: null,
    countyFIPS: null,
  };

  // Layer 0A: Nominatim
  try {
    const nom = await tryNominatim(rawAddress, logger);
    if (nom) {
      result.canonical = nom.displayName;
      result.parsed = nom.parsed;
      result.geocoded = true;
      result.source = 'nominatim';
      result.lat = nom.lat;
      result.lon = nom.lon;
      result.detectedCounty = nom.county;
      result.countyFIPS = nom.countyFIPS;
      console.log(tag + ' Nominatim -> "' + nom.displayName + '"');
    }
  } catch (e: any) {
    console.log(tag + ' Nominatim error: ' + e.message);
  }

  // Layer 0B: Census
  if (!result.geocoded) {
    try {
      const cen = await tryCensus(rawAddress, logger);
      if (cen) {
        result.canonical = cen.displayName;
        result.parsed = cen.parsed;
        result.geocoded = true;
        result.source = 'census';
        result.lat = cen.lat;
        result.lon = cen.lon;
        result.detectedCounty = cen.county;
        result.countyFIPS = cen.countyFIPS;
        console.log(tag + ' Census -> "' + cen.displayName + '"');
      }
    } catch (e: any) {
      console.log(tag + ' Census error: ' + e.message);
    }
  }

  if (!result.geocoded) {
    console.log(tag + ' Geocoding failed -- using manual parse');
  }

  const p = result.parsed;
  console.log(tag + '   Number: "' + p.streetNumber + '" Name: "' + p.streetName + '" Type: "' + p.streetType + '" PreDir: "' + (p.preDirection || '') + '"');

  result.variants = generateVariants(result.parsed, rawAddress);
  console.log(tag + ' Generated ' + result.variants.length + ' search variants:');
  for (const v of result.variants) {
    console.log(tag + '   [p' + v.priority + '|' + (v.format || '') + '] "' + v.streetNumber + '" + "' + v.streetName + '"');
  }

  return result;
}

// ━━ GEOCODERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface GeoResult {
  displayName: string;
  parsed: ParsedAddress;
  lat: number | null;
  lon: number | null;
  county: string | null;
  countyFIPS: string | null;
}

async function tryNominatim(address: string, logger: PipelineLogger): Promise<GeoResult | null> {
  const tracker = logger.startAttempt({ layer: 'Stage0A', source: 'Nominatim', method: 'geocode', input: address });

  try {
    const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(address) + '&format=json&addressdetails=1&limit=3&countrycodes=us';
    tracker.step('GET ' + url);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'StarrSurveyingWorker/5.1 (property-research)', 'Accept': 'application/json' },
    });
    if (!res.ok) { tracker({ status: 'fail', error: 'HTTP ' + res.status }); return null; }

    const data: any[] = await res.json();
    tracker.step('Nominatim returned ' + (data?.length || 0) + ' result(s)');
    if (!data?.length) { tracker({ status: 'fail', error: 'No results' }); return null; }

    const hit = data[0];
    const a = hit.address || {};
    const road = a.road || '';
    const houseNumber = a.house_number || '';

    if (!houseNumber) { tracker({ status: 'fail', error: 'No house number in result' }); return null; }

    const roadParsed = parseNominatimRoad(road);
    const tx = detectTexasRoad(road);

    const parsed: ParsedAddress = {
      streetNumber: houseNumber,
      streetName: roadParsed.name,
      streetType: roadParsed.type,
      preDirection: tx?.directional || null,
      postDirection: null,
      unit: null,
      city: a.city || a.town || a.village || a.hamlet || null,
      state: a.state || null,
      zip: a.postcode || null,
    };

    const county = a.county?.replace(/\s+County$/i, '') || null;

    tracker({ status: 'success', dataPointsFound: 1, details: 'Matched: ' + houseNumber + ' ' + road });
    return {
      displayName: hit.display_name,
      parsed,
      lat: parseFloat(hit.lat) || null,
      lon: parseFloat(hit.lon) || null,
      county,
      countyFIPS: null,
    };
  } catch (err: any) {
    tracker({ status: 'fail', error: err.message });
    return null;
  }
}

async function tryCensus(address: string, logger: PipelineLogger): Promise<GeoResult | null> {
  const tracker = logger.startAttempt({ layer: 'Stage0B', source: 'Census', method: 'geocode', input: address });

  try {
    const url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=' + encodeURIComponent(address) + '&benchmark=Public_AR_Current&format=json';
    tracker.step('GET ' + url);

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) { tracker({ status: 'fail', error: 'HTTP ' + res.status }); return null; }

    const data: any = await res.json();
    const matches = data?.result?.addressMatches;
    tracker.step('Census returned ' + (matches?.length || 0) + ' match(es)');
    if (!matches?.length) { tracker({ status: 'fail', error: 'No matches' }); return null; }

    const match = matches[0];
    const matchedAddr = (match.matchedAddress || '').trim();
    const components = match.addressComponents || {};
    const coords = match.coordinates || {};

    const parsed = parseCensusComponents(components);

    // PATCH 1: Census 'fromAddress' gives the street segment start (e.g., 3701),
    // not the exact house number from the input (e.g., 3779). Extract the actual
    // street number from the matchedAddress string instead.
    const matchedNumMatch = matchedAddr.match(/^(\d+)/);
    if (matchedNumMatch) {
      parsed.streetNumber = matchedNumMatch[1];
    }

    // PATCH 2: Census components sometimes omit TX road qualifier (FM/RM/etc.)
    // from 'preQualifier', leaving streetName as a bare number (e.g., "436" or
    // "W 436"). When the parsed street name is not a recognised TX designated
    // road, re-extract the full road designation from the matchedAddress string.
    if (!detectTexasRoad(parsed.streetName)) {
      const txRoadMatch = matchedAddr.match(
        /^\d+\s+(?:[NSEW]\s+)?(FM|RM|RR|SH|US|IH|CR|PR|SPUR|LOOP|HWY|BUS)\s+(\d+)/i,
      );
      if (txRoadMatch) {
        const prefix = txRoadMatch[1].toUpperCase();
        const canonical = TX_PREFIX_LOOKUP.get(prefix) ?? prefix;
        parsed.streetName = canonical + ' ' + txRoadMatch[2];
        // Also capture the directional that precedes the road prefix, if present.
        if (!parsed.preDirection) {
          const dirMatch = matchedAddr.match(
            /^\d+\s+([NSEW])\s+(?:FM|RM|RR|SH|US|IH|CR|PR|SPUR|LOOP|HWY|BUS)/i,
          );
          if (dirMatch) parsed.preDirection = dirMatch[1].toUpperCase();
        }
      }
    }

    if (!parsed.streetNumber) { tracker({ status: 'fail', error: 'No street number' }); return null; }

    const street = components.streetName || '';
    const preDir = components.preDirection || '';
    const preQual = components.preQualifier || '';
    tracker.step('Census matched: "' + matchedAddr + '" | street="' + street + '", preDir="' + preDir + '", preQual="' + preQual + '"');

    tracker({ status: 'success', dataPointsFound: 1, details: 'Matched: ' + matchedAddr });
    return {
      displayName: matchedAddr,
      parsed,
      lat: parseFloat(coords.y) || null,
      lon: parseFloat(coords.x) || null,
      county: null,
      countyFIPS: null,
    };
  } catch (err: any) {
    tracker({ status: 'fail', error: err.message });
    return null;
  }
}

// ━━ LEGACY EXPORTS (kept for backward compatibility) ━━━━━━━━━━━━━━━━━━━━━━

/** @deprecated Use parseAddress() instead */
export function parseRoadString(road: string): string {
  const tx = detectTexasRoad(road);
  if (tx) return tx.canonical + ' ' + tx.routeNumber;
  return road;
}

/** @deprecated Use normalizeAddress() for county detection */
export function detectCountyFromCity(city: string | null): string | null {
  if (!city) return null;
  const CITY_COUNTY: Record<string, string> = {
    'KILLEEN': 'bell', 'TEMPLE': 'bell', 'BELTON': 'bell', 'COPPERAS COVE': 'coryell',
    'GATESVILLE': 'coryell', 'WACO': 'mclennan', 'ROUND ROCK': 'williamson',
    'CEDAR PARK': 'williamson', 'GEORGETOWN': 'williamson', 'AUSTIN': 'travis',
    'SAN ANTONIO': 'bexar', 'HOUSTON': 'harris', 'DALLAS': 'dallas',
    'FORT WORTH': 'tarrant', 'ARLINGTON': 'tarrant',
  };
  return CITY_COUNTY[city.toUpperCase()] ?? null;
}
