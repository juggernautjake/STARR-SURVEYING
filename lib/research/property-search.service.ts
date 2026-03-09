// lib/research/property-search.service.ts — Property search & document discovery
// Searches Texas public record sources for property-related documents.
// Service area: Belton, TX and surrounding 160-mile radius (~35 Texas counties with direct integrations).
// Includes AI-driven address normalization and variant generation.
import type {
  PropertySearchRequest,
  PropertySearchResult,
  PropertySearchResponse,
  SearchSource,
} from '@/types/research';
import { callAI } from './ai-client';

// ── Rate Limiting & Cache ────────────────────────────────────────────────────

const searchCache = new Map<string, { results: PropertySearchResponse; timestamp: number }>();

// Default Central Texas coordinates used as a placeholder until real geocoding is applied.
// These are the approximate center of Temple, TX (Bell County seat of service area).
const CENTRAL_TEXAS_DEFAULT_LAT = 31.0698;
const CENTRAL_TEXAS_DEFAULT_LON = -97.3536;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCacheKey(req: PropertySearchRequest): string {
  return JSON.stringify({
    address: req.address?.trim().toLowerCase(),
    county: req.county?.trim().toLowerCase(),
    parcel_id: req.parcel_id?.trim(),
    owner_name: req.owner_name?.trim().toLowerCase(),
  });
}

function getCachedResult(req: PropertySearchRequest): PropertySearchResponse | null {
  const key = getCacheKey(req);
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }
  if (cached) searchCache.delete(key);
  return null;
}

function setCachedResult(req: PropertySearchRequest, results: PropertySearchResponse): void {
  const key = getCacheKey(req);
  searchCache.set(key, { results, timestamp: Date.now() });
  if (searchCache.size > 100) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
}

// ── Relevance Scoring ────────────────────────────────────────────────────────
//
// Scores are on a 0-1 scale representing how likely this result is to directly
// contain usable property boundary data for THIS specific search query.
//
//  0.90-1.00 — URL is pre-built with this property's address/parcel ID encoded;
//              will open directly to the property record.
//  0.75-0.89 — County-specific portal where a quick targeted search will find
//              this property; clear instructions provided.
//  0.55-0.74 — Supplementary source (flood zone, abstract survey, imagery) with
//              property-specific context.
//  0.40-0.54 — General reference; requires significant navigation to find data.
//  < 0.40    — Not returned to the user.

function scoreRelevance(
  base: number,
  opts: { hasParcelId?: boolean; hasAddress?: boolean; hasCounty?: boolean }
): number {
  let score = base;
  if (opts.hasParcelId) score = Math.min(1.0, score + 0.05);
  if (opts.hasAddress) score = Math.min(1.0, score + 0.03);
  return Math.round(score * 100) / 100;
}

// ── AI Address Normalization ─────────────────────────────────────────────────

interface AddressNormalization {
  normalized_address?: string;
  county?: string;
  city?: string;
  address_confidence?: number;
  address_variants?: string[];
  issues?: string[];
  suggestions?: string[];
  priority_sources?: string[];
}

async function normalizeAddressWithAI(req: PropertySearchRequest): Promise<AddressNormalization> {
  const parts: string[] = [];
  if (req.address) parts.push(`Address: ${req.address}`);
  if (req.county) parts.push(`County: ${req.county}`);
  if (req.parcel_id) parts.push(`Parcel ID: ${req.parcel_id}`);
  if (req.owner_name) parts.push(`Owner: ${req.owner_name}`);

  if (parts.length === 0) return {};

  try {
    const result = await callAI({
      promptKey: 'PROPERTY_RESEARCHER',
      userContent: `Analyze this property information and return normalized address, variants, and potential issues:\n\n${parts.join('\n')}`,
      maxTokens: 1024,
      maxRetries: 1,
      timeoutMs: 20_000,
    });

    const data = result.response as AddressNormalization;
    return {
      normalized_address: data?.normalized_address || undefined,
      county: data?.county || undefined,
      address_confidence: data?.address_confidence ?? undefined,
      address_variants: Array.isArray(data?.address_variants) ? data.address_variants : undefined,
      issues: Array.isArray(data?.issues) && data.issues.length > 0 ? data.issues : undefined,
      suggestions: Array.isArray(data?.suggestions) && data.suggestions.length > 0 ? data.suggestions : undefined,
      priority_sources: Array.isArray(data?.priority_sources) ? data.priority_sources : undefined,
    };
  } catch {
    return {};
  }
}

// ── Main Search Function ─────────────────────────────────────────────────────

export async function searchPropertyRecords(
  req: PropertySearchRequest
): Promise<PropertySearchResponse> {
  const cached = getCachedResult(req);
  if (cached) return cached;

  const allResults: PropertySearchResult[] = [];
  const sourcesSearched: PropertySearchResponse['sources_searched'] = [];

  const county = normalizeCounty(req.county || extractCountyFromAddress(req.address));

  // Run AI normalization + all source searches concurrently
  const [normResult, ...providerResults] = await Promise.allSettled([
    normalizeAddressWithAI(req),
    searchBellCountyGIS(req, county),
    searchCountyCAD(req, county),
    searchCountyClerk(req, county),
    searchFEMA(req),
    searchTNRIS(req, county),
    searchTexasGLO(req, county),
    searchTxDOT(req),
    searchUSGS(req),
    searchTexasRRC(req, county),
    searchCityRecords(req),
    searchTexasFile(req, county),
  ]);

  const normData: AddressNormalization = normResult.status === 'fulfilled' ? normResult.value : {};

  for (const result of providerResults) {
    if (result.status === 'fulfilled') {
      // Only include results that meet the minimum relevance threshold
      const filtered = result.value.results.filter(r => r.relevance >= 0.40);
      allResults.push(...filtered);
      if (result.value.source.status !== 'no_results' || result.value.results.length > 0) {
        sourcesSearched.push(result.value.source);
      }
    } else {
      console.error('[Property Search] Provider error:', result.reason);
    }
  }

  // Sort: property-specific first, then by relevance
  allResults.sort((a, b) => {
    if (a.is_property_specific && !b.is_property_specific) return -1;
    if (!a.is_property_specific && b.is_property_specific) return 1;
    return b.relevance - a.relevance;
  });

  const response: PropertySearchResponse = {
    results: allResults,
    sources_searched: sourcesSearched,
    total: allResults.length,
    address_normalized: normData.normalized_address,
    address_variants: normData.address_variants,
    address_issues: normData.issues,
    address_suggestions: normData.suggestions,
  };

  setCachedResult(req, response);
  return response;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCounty(county?: string | null): string {
  if (!county) return '';
  return county.replace(/\s+county$/i, '').trim();
}

/** True if the address string references a state or federal highway or FM road. */
function isHighwayAddress(address?: string | null): boolean {
  if (!address) return false;
  return /\b(fm\s*\d|f\.m\.\s*\d|farm.?to.?market|state\s*hwy|sh\s*\d|tx-\d|us\s*-?\s*\d+|hwy\s*\d|us\s*hwy|interstate\s*\d|ih\s*-?\d|i-\d|loop\s*\d|rr\s*\d|ranch\s*road|county\s*road\s*\d|cr\s*\d)/i.test(address);
}

/** Infer county from city/community name in address string.
 *  Covers all cities within the 160-mile service radius centered on Belton, TX. */
function extractCountyFromAddress(address?: string | null): string {
  if (!address) return '';
  // Explicit county name in address
  const explicit = address.match(/,\s*(\w[\w\s]*?)\s+County/i);
  if (explicit) return explicit[1].trim();

  const lc = address.toLowerCase();

  // ── Bell County (home county) ──
  if (/\b(belton|killeen|temple|harker heights|nolanville|rogers|bartlett|troy|pendleton|little river.?academy|academy|morgans point resort|bruceville.?eddy|hewitt|eddy|lacy.?lakeview)\b/.test(lc)) return 'Bell';

  // ── Coryell County ──
  if (/\b(copperas cove|gatesville|oglesby|evant|jonesboro|mcgregor.*coryell|flat)\b/.test(lc)) return 'Coryell';

  // ── McLennan County ──
  if (/\b(waco|hewitt|woodway|bellmead|mcgregor|hillsboro.*mclennan|lorena|china spring|robinson|lacy lakeview|mart|riesel|west.*tx|meridian.*mclennan|axtell|leroy|elm mott|valley mills.*mclennan)\b/.test(lc)) return 'McLennan';

  // ── Falls County ──
  if (/\b(marlin|lott|rosebud|reagan|falls.*county|golinda|chilton|perry)\b/.test(lc)) return 'Falls';

  // ── Milam County ──
  if (/\b(cameron|rockdale|thorndale|milano|buckholts|davilla|gause|milano|bremond.*milam|little river|milam.*county)\b/.test(lc)) return 'Milam';

  // ── Lampasas County ──
  if (/\b(lampasas|kempner|lometa|copperas cove.*lampasas|lampasas.*county)\b/.test(lc)) return 'Lampasas';

  // ── Travis County ──
  if (/\b(austin|pflugerville|manor|del valle|travis.*county|jonestown|lago vista|lakeway|rollingwood|west lake hills|bee cave|bee cave|volente|cedar park.*travis|leander.*travis)\b/.test(lc)) return 'Travis';

  // ── Williamson County ──
  if (/\b(georgetown|round rock|cedar park|leander|taylor|hutto|liberty hill|florence|jarrell|granger|thrall|bartlett.*williamson|brushy creek|williamson.*county)\b/.test(lc)) return 'Williamson';

  // ── Bastrop County ──
  if (/\b(bastrop|elgin|smithville|cedar creek|paige|mcdade|red rock|rosanky|camp swift|cedar creek.*bastrop|bastrop.*county)\b/.test(lc)) return 'Bastrop';

  // ── Lee County ──
  if (/\b(giddings|lexington|dime box|lincoln|fedor|lee.*county)\b/.test(lc)) return 'Lee';

  // ── Burleson County ──
  if (/\b(caldwell|somerville|lyons|snook|burleson.*county)\b/.test(lc)) return 'Burleson';

  // ── Brazos County ──
  if (/\b(bryan|college station|hearne.*brazos|kurten|millican|wixon valley|brazos.*county)\b/.test(lc)) return 'Brazos';

  // ── Robertson County ──
  if (/\b(hearne|calvert|franklin|bruceville|bald prairie|benchley|bremond|bryan.*robertson|robertson.*county)\b/.test(lc)) return 'Robertson';

  // ── Limestone County ──
  if (/\b(groesbeck|mexia|thornton|coolidge|kosse|tehuacana|limestone.*county)\b/.test(lc)) return 'Limestone';

  // ── Freestone County ──
  if (/\b(fairfield|teague|freestone.*county|streetman)\b/.test(lc)) return 'Freestone';

  // ── Leon County ──
  if (/\b(centerville|buffalo|normangee|oakwood|leon.*county)\b/.test(lc)) return 'Leon';

  // ── Hill County ──
  if (/\b(hillsboro|waco.*hill|itasca|covington|blum|aquilla|whitney|hill.*county)\b/.test(lc)) return 'Hill';

  // ── Bosque County ──
  if (/\b(meridian|clifton|valley mills|cranfills gap|bosque.*county|glen rose.*bosque|iredell)\b/.test(lc)) return 'Bosque';

  // ── Hamilton County ──
  if (/\b(hamilton(?!.*williamson)|hico|carlton|evant.*hamilton|pottsville|hamilton.*county)\b/.test(lc)) return 'Hamilton';

  // ── Burnet County ──
  if (/\b(burnet|marble falls|bertram|horseshoe bay.*burnet|buchanan dam|llano.*burnet|burnet.*county)\b/.test(lc)) return 'Burnet';

  // ── Llano County ──
  if (/\b(llano|kingsland|horseshoe bay.*llano|sunrise beach|llano.*county)\b/.test(lc)) return 'Llano';

  // ── San Saba County ──
  if (/\b(san saba|richland springs|san saba.*county)\b/.test(lc)) return 'San Saba';

  // ── Mills County ──
  if (/\b(goldthwaite|mullin|mills.*county|regency)\b/.test(lc)) return 'Mills';

  // ── Brown County ──
  if (/\b(brownwood|early|zephyr|brookesmith|bangs|brown.*county)\b/.test(lc)) return 'Brown';

  // ── Coleman County ──
  if (/\b(coleman|santa anna|novice|valera|rockwood|coleman.*county)\b/.test(lc)) return 'Coleman';

  // ── McCulloch County ──
  if (/\b(brady|lohn|menard.*mcculloch|rochelle|mcculloch.*county)\b/.test(lc)) return 'McCulloch';

  // ── Mason County ──
  if (/\b(mason(?!.*county\s*$)|mason.*county|fredonia|mason.*tx)\b/.test(lc)) return 'Mason';

  // ── Gillespie County ──
  if (/\b(fredericksburg|stonewall|harper|doss|gillespie.*county)\b/.test(lc)) return 'Gillespie';

  // ── Blanco County ──
  if (/\b(blanco|johnson city|blanco.*county|round mountain.*blanco)\b/.test(lc)) return 'Blanco';

  // ── Hays County ──
  if (/\b(san marcos|kyle|buda|wimberley|dripping springs.*hays|hays.*county|buda|mountain city|niederwald|woodcreek)\b/.test(lc)) return 'Hays';

  // ── Caldwell County ──
  if (/\b(lockhart|luling|martindale|maxwell|caldwell.*county|common)\b/.test(lc)) return 'Caldwell';

  // ── Guadalupe County ──
  if (/\b(seguin|schertz|cibolo|new braunfels.*guadalupe|guadalupe.*county|santa clara|universal city.*guadalupe)\b/.test(lc)) return 'Guadalupe';

  // ── Comal County ──
  if (/\b(new braunfels|canyon lake|spring branch|bulverde|comal.*county|garden ridge)\b/.test(lc)) return 'Comal';

  // ── Bexar County (edge of range) ──
  if (/\b(san antonio|bexar.*county|schertz.*bexar|converse|live oak)\b/.test(lc)) return 'Bexar';

  // ── Comanche County ──
  if (/\b(comanche(?!.*county\s*$)|comanche.*county|de leon|gustine|proctor|comanche.*tx)\b/.test(lc)) return 'Comanche';

  // ── Erath County ──
  if (/\b(stephenville|dublin|morgan mill|thurber.*erath|erath.*county|lingleville)\b/.test(lc)) return 'Erath';

  // ── Hood County ──
  if (/\b(granbury|acton|cresson.*hood|lipan.*hood|hood.*county|tolar)\b/.test(lc)) return 'Hood';

  // ── Somervell County ──
  if (/\b(glen rose|somervell.*county)\b/.test(lc)) return 'Somervell';

  // ── Johnson County ──
  if (/\b(burleson(?!.*county)|cleburne|joshua|alvarado|johnson.*county|crowley.*johnson|venus|keene)\b/.test(lc)) return 'Johnson';

  // ── Ellis County ──
  if (/\b(waxahachie|ennis|midlothian|red oak|ellis.*county|italy.*tx|palmer|milford.*ellis)\b/.test(lc)) return 'Ellis';

  // ── Navarro County ──
  if (/\b(corsicana|navarro.*county|ennis.*navarro|kerens|rice|chatfield|dawson.*navarro)\b/.test(lc)) return 'Navarro';

  // ── Grimes County ──
  if (/\b(navasota|grimes.*county|anderson.*grimes|iola)\b/.test(lc)) return 'Grimes';

  // ── Washington County ──
  if (/\b(brenham|chappell hill|washington.*county|independence.*washington|burton)\b/.test(lc)) return 'Washington';

  // ── Fayette County ──
  if (/\b(la grange|flatonia|schulenburg|round top|fayette.*county)\b/.test(lc)) return 'Fayette';

  // ── Colorado County ──
  if (/\b(columbus|eagle lake|weimar|colorado.*county)\b/.test(lc)) return 'Colorado';

  // ── Austin County (the county, not the city) ──
  if (/\b(bellville|sealy|wallis|cat spring|new ulm|austin.*county)\b/.test(lc)) return 'Austin';

  // ── Waller County ──
  if (/\b(hempstead|prairie view|pattison|brookshire.*waller|waller.*county)\b/.test(lc)) return 'Waller';

  // ── Anderson County ──
  if (/\b(palestine|frankston|anderson.*county|tennessee colony|elkhart.*anderson)\b/.test(lc)) return 'Anderson';

  // ── Henderson County ──
  if (/\b(athens(?!.*ga)|henderson.*county|gun barrel city|kemp|tool|mabank)\b/.test(lc)) return 'Henderson';

  return '';
}

function generateResultId(source: SearchSource, index: number): string {
  return `${source}-${Date.now()}-${index}`;
}

// ── Provider Result Type ──────────────────────────────────────────────────────

interface ProviderResult {
  results: PropertySearchResult[];
  source: PropertySearchResponse['sources_searched'][0];
}

// ── Texas County CAD Lookup ──────────────────────────────────────────────────
//
// Covers all counties within 160-mile radius of Belton, TX.
// TrueAutomation client IDs are used where known; otherwise the county CAD portal
// URL is used directly. For unknown counties the Texas Comptroller directory is used.

interface CADConfig {
  name: string;
  /** Portal homepage — always opens to a working page */
  searchUrl: string;
  platform: 'trueautomation' | 'esearch' | 'generic';
  trueautoId?: number;
  /** County-specific e-search portal (overrides searchUrl as primary link) */
  esearchUrl?: string;
}

// ── Texas Comptroller CAD directory — reliable fallback for any TX county ──
const COMPTROLLER_DIR = 'https://comptroller.texas.gov/taxes/property-tax/county-directory/';

const TEXAS_CAD_CONFIGS: Record<string, CADConfig> = {
  // ── Core service area ──
  // Bell County uses their own e-search portal (esearch.bellcad.org) as primary.
  // TrueAutomation (cid=14) still works and is kept for direct prop_id links.
  bell:        { name: 'Bell County Appraisal District',       searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=14', platform: 'trueautomation', trueautoId: 14, esearchUrl: 'https://esearch.bellcad.org/' },
  coryell:     { name: 'Coryell County Appraisal District',    searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=18', platform: 'trueautomation', trueautoId: 18 },
  mclennan:    { name: 'McLennan County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=25', platform: 'trueautomation', trueautoId: 25, esearchUrl: 'https://mclennan-cad.org/property-search/' },
  falls:       { name: 'Falls County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=20', platform: 'trueautomation', trueautoId: 20 },
  milam:       { name: 'Milam County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=26', platform: 'trueautomation', trueautoId: 26 },
  lampasas:    { name: 'Lampasas County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=23', platform: 'trueautomation', trueautoId: 23 },
  // ── Austin metro ──
  travis:      { name: 'Travis County Appraisal District',     searchUrl: 'https://traviscad.org/property-search/',                 platform: 'generic' },
  williamson:  { name: 'Williamson County Appraisal District', searchUrl: 'https://esearch.wcad.org/',                              platform: 'esearch' },
  bastrop:     { name: 'Bastrop County Appraisal District',    searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=2',  platform: 'trueautomation', trueautoId: 2 },
  hays:        { name: 'Hays County Appraisal District',       searchUrl: 'https://esearch.hayscad.com/',                          platform: 'esearch' },
  // ── Brazos Valley ──
  brazos:      { name: 'Brazos County Appraisal District',     searchUrl: 'https://brazoscad.org/',                                 platform: 'generic' },
  burleson:    { name: 'Burleson County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=7',  platform: 'trueautomation', trueautoId: 7 },
  robertson:   { name: 'Robertson County Appraisal District',  searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=29', platform: 'trueautomation', trueautoId: 29 },
  lee:         { name: 'Lee County Appraisal District',        searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=24', platform: 'trueautomation', trueautoId: 24 },
  // ── Central Texas / Hill Country ──
  burnet:      { name: 'Burnet County Appraisal District',     searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=8',  platform: 'trueautomation', trueautoId: 8 },
  llano:       { name: 'Llano County Appraisal District',      searchUrl: 'https://llanocad.org/',                                  platform: 'generic' },
  san_saba:    { name: 'San Saba County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=30', platform: 'trueautomation', trueautoId: 30 },
  hamilton:    { name: 'Hamilton County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=22', platform: 'trueautomation', trueautoId: 22 },
  bosque:      { name: 'Bosque County Appraisal District',     searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=5',  platform: 'trueautomation', trueautoId: 5 },
  hill:        { name: 'Hill County Appraisal District',       searchUrl: 'https://hillcad.net/',                                   platform: 'generic' },
  limestone:   { name: 'Limestone County Appraisal District',  searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=82', platform: 'trueautomation', trueautoId: 82 },
  freestone:   { name: 'Freestone County Appraisal District',  searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=81', platform: 'trueautomation', trueautoId: 81 },
  leon:        { name: 'Leon County Appraisal District',       searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=83', platform: 'trueautomation', trueautoId: 83 },
  blanco:      { name: 'Blanco County Appraisal District',     searchUrl: 'https://blancocad.org/',                                 platform: 'generic' },
  gillespie:   { name: 'Gillespie County Appraisal District',  searchUrl: 'https://gillespiecad.org/',                              platform: 'generic' },
  // ── South / Southwest ──
  caldwell:    { name: 'Caldwell County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=9',  platform: 'trueautomation', trueautoId: 9 },
  guadalupe:   { name: 'Guadalupe County Appraisal District',  searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=94', platform: 'trueautomation', trueautoId: 94 },
  comal:       { name: 'Comal County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=46', platform: 'trueautomation', trueautoId: 46 },
  // ── West ──
  brown:       { name: 'Brown County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=6',  platform: 'trueautomation', trueautoId: 6 },
  comanche:    { name: 'Comanche County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=17', platform: 'trueautomation', trueautoId: 17 },
  erath:       { name: 'Erath County Appraisal District',      searchUrl: 'https://erathcad.org/',                                  platform: 'generic' },
  hamilton_co: { name: 'Hamilton County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=22', platform: 'trueautomation', trueautoId: 22 },
  mills:       { name: 'Mills County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=27', platform: 'trueautomation', trueautoId: 27 },
  mcculloch:   { name: 'McCulloch County Appraisal District',  searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=85', platform: 'trueautomation', trueautoId: 85 },
  mason:       { name: 'Mason County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=84', platform: 'trueautomation', trueautoId: 84 },
  coleman:     { name: 'Coleman County Appraisal District',    searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=16', platform: 'trueautomation', trueautoId: 16 },
  // ── North / DFW fringe ──
  hood:        { name: 'Hood County Appraisal District',       searchUrl: 'https://hoodcad.net/',                                   platform: 'generic' },
  somervell:   { name: 'Somervell County Appraisal District',  searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=31', platform: 'trueautomation', trueautoId: 31 },
  johnson:     { name: 'Johnson County Appraisal District',    searchUrl: 'https://johnsoncad.com/',                                platform: 'generic' },
  ellis:       { name: 'Ellis County Appraisal District',      searchUrl: 'https://elliscad.org/',                                  platform: 'generic' },
  navarro:     { name: 'Navarro County Appraisal District',    searchUrl: 'https://navarrocad.org/',                                platform: 'generic' },
  // ── East ──
  anderson:    { name: 'Anderson County Appraisal District',   searchUrl: 'https://andersoncad.org/',                               platform: 'generic' },
  henderson:   { name: 'Henderson County Appraisal District',  searchUrl: 'https://hendersoncad.org/',                              platform: 'generic' },
  // ── Southeast ──
  grimes:      { name: 'Grimes County Appraisal District',     searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=62', platform: 'trueautomation', trueautoId: 62 },
  washington:  { name: 'Washington County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=35', platform: 'trueautomation', trueautoId: 35 },
  fayette:     { name: 'Fayette County Appraisal District',    searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=21', platform: 'trueautomation', trueautoId: 21 },
  austin_co:   { name: 'Austin County Appraisal District',     searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=1',  platform: 'trueautomation', trueautoId: 1 },
};

// ── County Clerk Records ─────────────────────────────────────────────────────

interface ClerkConfig {
  name: string;
  url: string;
}

const TEXAS_CLERK_CONFIGS: Record<string, ClerkConfig> = {
  bell:       { name: 'Bell County Clerk',       url: 'https://www.bellcountytx.com/county_government/county_clerk/recorded_searches.php' },
  coryell:    { name: 'Coryell County Clerk',    url: 'https://www.coryellcounty.org/page/coryell.County.Clerk' },
  mclennan:   { name: 'McLennan County Clerk',   url: 'https://www.co.mclennan.tx.us/123/County-Clerk' },
  falls:      { name: 'Falls County Clerk',      url: 'https://www.co.falls.tx.us/county-clerk/' },
  milam:      { name: 'Milam County Clerk',      url: 'https://www.co.milam.tx.us/departments/county-clerk/' },
  lampasas:   { name: 'Lampasas County Clerk',   url: 'https://www.co.lampasas.tx.us/departments/county-clerk/' },
  travis:     { name: 'Travis County Clerk',     url: 'https://countyclerk.traviscountytx.gov/recording/real-property-records.html' },
  williamson: { name: 'Williamson County Clerk', url: 'https://judicialrecords.wilco.org/PublicAccess/default.aspx' },
  bastrop:    { name: 'Bastrop County Clerk',    url: 'https://bastropcountytexas.gov/departments/county-clerk/' },
  hays:       { name: 'Hays County Clerk',       url: 'https://www.hayscountytx.com/departments/county-clerk/' },
  brazos:     { name: 'Brazos County Clerk',     url: 'https://www.brazoscountytx.gov/departments/countyclerk/' },
  burleson:   { name: 'Burleson County Clerk',   url: 'https://www.burlesoncountytexas.us/county-clerk/' },
  robertson:  { name: 'Robertson County Clerk',  url: 'https://www.co.robertson.tx.us/departments/county-clerk/' },
  lee:        { name: 'Lee County Clerk',        url: 'https://www.co.lee.tx.us/departments/county-clerk/' },
  burnet:     { name: 'Burnet County Clerk',     url: 'https://www.burnetcountytexas.org/county-clerk/' },
  llano:      { name: 'Llano County Clerk',      url: 'https://www.co.llano.tx.us/county-clerk/' },
  hill:       { name: 'Hill County Clerk',       url: 'https://www.co.hill.tx.us/departments/county-clerk/' },
  limestone:  { name: 'Limestone County Clerk',  url: 'https://www.co.limestone.tx.us/departments/county-clerk/' },
  bosque:     { name: 'Bosque County Clerk',     url: 'https://www.co.bosque.tx.us/county-clerk/' },
  hamilton:   { name: 'Hamilton County Clerk',   url: 'https://www.hamiltoncountytx.org/departments/county-clerk/' },
  freestone:  { name: 'Freestone County Clerk',  url: 'https://www.co.freestone.tx.us/departments/county-clerk/' },
  leon:       { name: 'Leon County Clerk',       url: 'https://www.co.leon.tx.us/departments/county-clerk/' },
  blanco:     { name: 'Blanco County Clerk',     url: 'https://www.blancocountytx.gov/county-clerk/' },
  caldwell:   { name: 'Caldwell County Clerk',   url: 'https://www.co.caldwell.tx.us/departments/county-clerk/' },
  comal:      { name: 'Comal County Clerk',      url: 'https://www.co.comal.tx.us/departments/county-clerk/' },
  guadalupe:  { name: 'Guadalupe County Clerk',  url: 'https://www.guadalupecounty.org/departments/county-clerk/' },
  brown:      { name: 'Brown County Clerk',      url: 'https://www.co.brown.tx.us/departments/county-clerk/' },
  comanche:   { name: 'Comanche County Clerk',   url: 'https://www.co.comanche.tx.us/departments/county-clerk/' },
  erath:      { name: 'Erath County Clerk',      url: 'https://www.co.erath.tx.us/departments/county-clerk/' },
  hood:       { name: 'Hood County Clerk',       url: 'https://www.co.hood.tx.us/departments/county-clerk/' },
  somervell:  { name: 'Somervell County Clerk',  url: 'https://www.co.somervell.tx.us/departments/county-clerk/' },
  johnson:    { name: 'Johnson County Clerk',    url: 'https://www.johnsoncountytx.org/departments/county-clerk/' },
  ellis:      { name: 'Ellis County Clerk',      url: 'https://www.co.ellis.tx.us/departments/county-clerk/' },
  navarro:    { name: 'Navarro County Clerk',    url: 'https://www.co.navarro.tx.us/departments/county-clerk/' },
  anderson:   { name: 'Anderson County Clerk',   url: 'https://www.co.anderson.tx.us/departments/county-clerk/' },
  henderson:  { name: 'Henderson County Clerk',  url: 'https://www.co.henderson.tx.us/departments/county-clerk/' },
  grimes:     { name: 'Grimes County Clerk',     url: 'https://www.co.grimes.tx.us/departments/county-clerk/' },
  washington: { name: 'Washington County Clerk', url: 'https://www.co.washington.tx.us/departments/county-clerk/' },
  fayette:    { name: 'Fayette County Clerk',    url: 'https://www.co.fayette.tx.us/departments/county-clerk/' },
};

// ── publicsearch.us County Clerk Online Records Portal ───────────────────────
// Many Texas counties use the Tyler Technologies / Kofile publicsearch.us platform
// for online access to recorded instruments (deeds, plats, easements, liens).
// Once the CAD property ID is known, a full-text search on this platform returns
// every recorded instrument that mentions it — the single most powerful deed lookup.
//
// Deed search URL: https://{subdomain}/results?search=index,fullText&q={propertyId}

const PUBLICSEARCH_BY_COUNTY: Record<string, string> = {
  bell:       'bell.tx.publicsearch.us',
  coryell:    'coryell.tx.publicsearch.us',
  mclennan:   'mclennan.tx.publicsearch.us',
  falls:      'falls.tx.publicsearch.us',
  milam:      'milam.tx.publicsearch.us',
  lampasas:   'lampasas.tx.publicsearch.us',
  travis:     'travis.tx.publicsearch.us',
  williamson: 'williamson.tx.publicsearch.us',
  bastrop:    'bastrop.tx.publicsearch.us',
  hays:       'hays.tx.publicsearch.us',
  brazos:     'brazos.tx.publicsearch.us',
  burleson:   'burleson.tx.publicsearch.us',
  robertson:  'robertson.tx.publicsearch.us',
  lee:        'lee.tx.publicsearch.us',
  burnet:     'burnet.tx.publicsearch.us',
  llano:      'llano.tx.publicsearch.us',
  hill:       'hill.tx.publicsearch.us',
  limestone:  'limestone.tx.publicsearch.us',
  bosque:     'bosque.tx.publicsearch.us',
  hamilton:   'hamilton.tx.publicsearch.us',
  leon:       'leon.tx.publicsearch.us',
  blanco:     'blanco.tx.publicsearch.us',
  caldwell:   'caldwell.tx.publicsearch.us',
  comal:      'comal.tx.publicsearch.us',
  guadalupe:  'guadalupe.tx.publicsearch.us',
  brown:      'brown.tx.publicsearch.us',
  comanche:   'comanche.tx.publicsearch.us',
  erath:      'erath.tx.publicsearch.us',
  hood:       'hood.tx.publicsearch.us',
  johnson:    'johnson.tx.publicsearch.us',
  ellis:      'ellis.tx.publicsearch.us',
  grimes:     'grimes.tx.publicsearch.us',
  washington: 'washington.tx.publicsearch.us',
  fayette:    'fayette.tx.publicsearch.us',
  // Major metro counties (verified on publicsearch.us 2026-03-09)
  dallas:     'dallas.tx.publicsearch.us',
  tarrant:    'tarrant.tx.publicsearch.us',
  collin:     'collin.tx.publicsearch.us',
  denton:     'denton.tx.publicsearch.us',
  bexar:      'bexar.tx.publicsearch.us',
  montgomery: 'montgomery.tx.publicsearch.us',
  // fort_bend: ccweb.co.fort-bend.tx.us (custom portal, NOT publicsearch.us)
  // galveston: ava.fidlar.com/TXGalveston/AvaWeb/ (Fidlar, NOT publicsearch.us)
  // brazoria: texasfile.com/search/texas/brazoria-county/ (TexasFile, NOT publicsearch.us)
  nueces:     'nueces.tx.publicsearch.us',
  potter:     'potter.tx.publicsearch.us',
};

/** Build the deed-search URL for the county clerk publicsearch.us portal. */
function buildPublicsearchUrl(countyKey: string, propertyId?: string, ownerName?: string): string | null {
  const subdomain = PUBLICSEARCH_BY_COUNTY[countyKey];
  if (!subdomain) return null;
  if (propertyId) {
    return `https://${subdomain}/results?search=index,fullText&q=${encodeURIComponent(propertyId)}`;
  }
  if (ownerName) {
    return `https://${subdomain}/results?search=index,fullText&q=${encodeURIComponent(ownerName)}`;
  }
  return `https://${subdomain}/`;
}

/** Build a publicsearch.us URL to search by grantor/grantee (owner) name */
function buildPublicsearchGrantorUrl(countyKey: string, ownerName: string): string | null {
  const subdomain = PUBLICSEARCH_BY_COUNTY[countyKey];
  if (!subdomain || !ownerName.trim()) return null;
  return `https://${subdomain}/results?search=GBGranteeGrantor&q=${encodeURIComponent(ownerName.trim())}`;
}

/** Build a Bell CAD eSearch address pre-filled URL */
function buildBellCadSearchUrl(query: string, type: 'address' | 'owner' | 'account'): string {
  const year = new Date().getFullYear();
  return `https://esearch.bellcad.org/Property/Search?type=${type}&value=${encodeURIComponent(query)}&year=${year}`;
}

// ── Bell County GIS (primary source for Bell County jobs) ────────────────────

async function searchBellCountyGIS(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  const isBellCounty = !county || county.toLowerCase() === 'bell';

  if (!isBellCounty) {
    return {
      results: [],
      source: { source: 'bell_county_gis', name: 'Bell County GIS', status: 'no_results', message: 'Not applicable for this county' },
    };
  }

  const hasParcelId = !!req.parcel_id;
  const hasAddress = !!req.address;
  const currentYear = new Date().getFullYear();

  // Bell CAD config from the shared configs table — avoids hardcoding the CID here.
  const bellConfig = TEXAS_CAD_CONFIGS['bell'];
  const bellCadEsearchUrl = bellConfig?.esearchUrl ?? 'https://esearch.bellcad.org/';
  const bellCadBaseUrl = bellConfig?.searchUrl ?? 'https://propaccess.trueautomation.com/clientdb/?cid=14';
  const bellCadDirectUrl = req.parcel_id && bellConfig?.trueautoId
    ? `https://propaccess.trueautomation.com/clientdb/?cid=${bellConfig.trueautoId}&prop_id=${encodeURIComponent(req.parcel_id)}`
    : bellCadBaseUrl;

  // Bell CAD esearch direct property view — the highest-value link when property ID is known
  const bellEsearchPropertyUrl = req.parcel_id
    ? `https://esearch.bellcad.org/Property/View/${encodeURIComponent(req.parcel_id)}?year=${currentYear}`
    : null;

  // publicsearch.us deed search pre-loaded with property ID
  const bellPublicsearchUrl = buildPublicsearchUrl('bell', req.parcel_id, req.owner_name);

  const results: PropertySearchResult[] = [];

  // Bell CAD esearch direct property view — top result when property ID is known
  if (bellEsearchPropertyUrl) {
    results.push({
      id: generateResultId('bell_county_gis', 10),
      source: 'bell_county_gis',
      source_name: 'Bell CAD e-Search — Direct Property View',
      title: `Bell CAD Property ${req.parcel_id} — Direct View (${currentYear})`,
      url: bellEsearchPropertyUrl,
      document_type: 'appraisal_record',
      relevance: 1.00,
      is_property_specific: true,
      description: [
        `Direct link to Bell CAD e-Search for Property ID ${req.parcel_id} (tax year ${currentYear}).`,
        ` Shows the full property record: legal description, owner details, acreage, improvement schedule, deed volume/page reference, and value history.`,
        ` This is the authoritative source for the legal description needed to draw the survey.`,
      ].join(''),
      has_cost: false,
      metadata: { platform: 'esearch', prop_id: req.parcel_id, year: currentYear },
    });
  }

  // Bell County Clerk publicsearch.us deed search — pre-loaded with property ID
  if (bellPublicsearchUrl) {
    results.push({
      id: generateResultId('bell_county_gis', 11),
      source: 'bell_county_gis',
      source_name: 'Bell County Clerk — Online Deed Search',
      title: hasParcelId
        ? `Bell County Deed Search — Property ID ${req.parcel_id}`
        : `Bell County Deed Search${req.owner_name ? ` — ${req.owner_name}` : ''}`,
      url: bellPublicsearchUrl,
      document_type: 'deed',
      relevance: scoreRelevance(hasParcelId ? 0.99 : 0.88, { hasParcelId, hasAddress }),
      is_property_specific: hasParcelId || !!req.owner_name || hasAddress,
      description: [
        hasParcelId
          ? `Bell County Clerk online records searched by Property ID ${req.parcel_id} — returns every recorded instrument (deeds, plats, easements, liens) that references this property.`
          : `Bell County Clerk online deed and instrument search.`,
        ` Full-text OCR search finds deeds, warranty deeds, plats, and easements even when recorded before digital indexing.`,
        hasParcelId ? ` Typical results include 2–5 deeds with the full metes-and-bounds legal description required for the survey.` : '',
        ` Powered by the Tyler Technologies publicsearch.us platform.`,
      ].join(''),
      has_cost: false,
      cost_note: 'Viewing is free online; certified copies are $1/page + $5 fee.',
      metadata: { platform: 'publicsearch', prop_id: req.parcel_id, county: 'Bell' },
    });
  }

  // Bell CAD e-search portal — general search entry point
  results.push({
    id: generateResultId('bell_county_gis', 0),
    source: 'bell_county_gis',
    source_name: 'Bell County Appraisal District (CAD)',
    title: 'Bell CAD e-Search — Property & Legal Description',
    url: bellCadEsearchUrl,
    document_type: 'appraisal_record',
    relevance: scoreRelevance(0.95, { hasParcelId, hasAddress }),
    is_property_specific: hasAddress || hasParcelId,
    description: [
      `Bell County CAD official e-search portal — search by address, property ID, or owner name to retrieve the legal description, acreage, improvement schedule, and deed references.`,
      req.address ? ` Search for: "${req.address}".` : '',
      req.parcel_id ? ` Enter Property ID: ${req.parcel_id}.` : '',
      req.owner_name ? ` Or search by owner name: "${req.owner_name}".` : '',
      ` The legal description on this page contains the metes-and-bounds calls required for the survey.`,
    ].join(''),
    has_cost: false,
    metadata: { platform: 'esearch', search_address: req.address, search_parcel: req.parcel_id },
  });

  // TrueAutomation direct-property link — only shown when a prop_id is available
  if (hasParcelId) {
    results.push({
      id: generateResultId('bell_county_gis', 1),
      source: 'bell_county_gis',
      source_name: 'Bell County CAD — TrueAutomation Record',
      title: `Bell CAD Property Record — ID ${req.parcel_id} (TrueAutomation)`,
      url: bellCadDirectUrl,
      document_type: 'appraisal_record',
      relevance: 0.96,
      is_property_specific: true,
      description: [
        `TrueAutomation direct link to Bell County CAD property record for Property ID ${req.parcel_id}.`,
        ` Opens the full property detail: owner, legal description, acreage, deed volume/page, and value history.`,
      ].join(''),
      has_cost: false,
      metadata: { platform: 'trueautomation', prop_id: req.parcel_id },
    });
  }

  // Bell County GIS Parcel Viewer
  results.push({
    id: generateResultId('bell_county_gis', 2),
    source: 'bell_county_gis',
    source_name: 'Bell County GIS',
    title: 'Bell County GIS Parcel Viewer (BIS Client)',
    url: 'https://gis.bisclient.com/bellcad/',
    document_type: 'plat',
    relevance: scoreRelevance(0.85, { hasParcelId, hasAddress }),
    is_property_specific: hasAddress || hasParcelId,
    description: [
      `Bell County CAD GIS interactive parcel map — search parcel boundaries, ownership, and geographic features.`,
      req.address ? ` Search by address: "${req.address}".` : '',
      req.parcel_id ? ` Or filter by Property ID: ${req.parcel_id}.` : '',
      ` Click any parcel to see the owner, legal description, and deed reference.`,
    ].join(''),
    has_cost: false,
    metadata: { search_address: req.address, parcel_id: req.parcel_id, county: 'Bell' },
  });

  // Bell County Clerk general page (kept as fallback / reference)
  results.push({
    id: generateResultId('bell_county_gis', 3),
    source: 'bell_county_gis',
    source_name: 'Bell County Clerk — Real Estate Records',
    title: 'Bell County Clerk — Deed & Plat Records',
    url: 'https://www.bellcountytx.com/county_government/county_clerk/recorded_searches.php',
    document_type: 'deed',
    relevance: scoreRelevance(0.80, { hasAddress }),
    is_property_specific: hasAddress || !!req.owner_name,
    description: [
      `Bell County Clerk recorded searches page — warranty deeds, plats, easements, and liens.`,
      ` Use the online deed search link on this page (bell.tx.publicsearch.us) to search by property ID or owner name.`,
      req.owner_name ? ` Search by grantor/grantee: "${req.owner_name}".` : '',
      ` Plats show subdivision lot lines, dimensions, bearings, and surveyor certifications.`,
      ` Federal Tax Liens: $10.00 per name searched (out-of-state checks not accepted).`,
    ].join(''),
    has_cost: true,
    cost_note: 'Online viewing is free; certified copies are $1/page + $5 certification fee. Federal Tax Lien search: $10/name.',
    metadata: { record_type: 'deed_and_plat', county: 'Bell' },
  });

  // Bell CAD eSearch pre-filled address search link (deep link directly into the search box)
  if (req.address) {
    const streetOnly = req.address.split(',')[0].replace(/\./g, '').trim();
    results.push({
      id: generateResultId('bell_county_gis', 12),
      source: 'bell_county_gis',
      source_name: 'Bell CAD e-Search — Address Pre-filled',
      title: `Bell CAD e-Search: "${streetOnly}"`,
      url: buildBellCadSearchUrl(streetOnly, 'address'),
      document_type: 'appraisal_record',
      relevance: scoreRelevance(0.93, { hasAddress: true }),
      is_property_specific: true,
      description: `Bell CAD e-Search portal with the address "${streetOnly}" pre-loaded — click Search to retrieve the property record directly. Contains the legal description, deed volume/page, and ownership history.`,
      has_cost: false,
      metadata: { platform: 'esearch', search_type: 'address', query: streetOnly },
    });
  }

  // Bell CAD eSearch owner-name search (when owner name is known)
  if (req.owner_name) {
    results.push({
      id: generateResultId('bell_county_gis', 13),
      source: 'bell_county_gis',
      source_name: 'Bell CAD e-Search — Owner Name Pre-filled',
      title: `Bell CAD e-Search by Owner: "${req.owner_name}"`,
      url: buildBellCadSearchUrl(req.owner_name, 'owner'),
      document_type: 'appraisal_record',
      relevance: scoreRelevance(0.94, { hasParcelId: false, hasAddress: !!req.address }),
      is_property_specific: true,
      description: `Bell CAD e-Search portal with owner name "${req.owner_name}" pre-loaded. Returns all properties owned by this name — look for the matching address to get the property ID and legal description.`,
      has_cost: false,
      metadata: { platform: 'esearch', search_type: 'owner', query: req.owner_name },
    });
  }

  // Bell County Clerk grantor/grantee deed search (when owner name is known)
  if (req.owner_name) {
    const grantorUrl = buildPublicsearchGrantorUrl('bell', req.owner_name);
    if (grantorUrl) {
      results.push({
        id: generateResultId('bell_county_gis', 14),
        source: 'bell_county_gis',
        source_name: 'Bell County Clerk — Grantor/Grantee Deed Search',
        title: `Bell County Deed Search by Grantor/Grantee: "${req.owner_name}"`,
        url: grantorUrl,
        document_type: 'deed',
        relevance: scoreRelevance(0.96, { hasParcelId: !!req.parcel_id, hasAddress: !!req.address }),
        is_property_specific: true,
        description: `Bell County Clerk online records searched by grantor/grantee name "${req.owner_name}" — returns every deed, warranty deed, quit claim deed, and instrument where this name appears as grantor OR grantee. Directly surfaces chain-of-title deeds with full legal descriptions.`,
        has_cost: false,
        cost_note: 'Online viewing is free; certified copies available from the county clerk.',
        metadata: { platform: 'publicsearch', search_type: 'grantor_grantee', query: req.owner_name, county: 'Bell' },
      });
    }
  }

  // Bell CAD Map Search — visual GIS parcel boundary viewer with property ID lookup
  results.push({
    id: generateResultId('bell_county_gis', 20),
    source: 'bell_county_gis',
    source_name: 'Bell CAD — GIS Map Search',
    title: 'Bell CAD Map Search — Parcel Boundaries (TrueAutomation)',
    url: hasParcelId
      ? `https://propaccess.trueautomation.com/mapSearch/?cid=66&prop_id=${encodeURIComponent(req.parcel_id!)}`
      : 'https://propaccess.trueautomation.com/mapSearch/?cid=66',
    document_type: 'plat',
    relevance: scoreRelevance(0.82, { hasParcelId, hasAddress }),
    is_property_specific: hasParcelId,
    description: [
      `TrueAutomation GIS map search for Bell CAD — displays parcel boundaries overlaid on aerial imagery.`,
      hasParcelId ? ` Loads directly to Property ID ${req.parcel_id}.` : ` Click a parcel on the map or search by address to identify the property.`,
      ` Useful for confirming parcel shape and verifying boundary calls against the mapped outline.`,
    ].join(''),
    has_cost: false,
    metadata: { platform: 'trueautomation_map', cid: 66, prop_id: req.parcel_id },
  });

  // CourthouseDirect — scanned historical deed images and indexes for Bell County
  results.push({
    id: generateResultId('bell_county_gis', 21),
    source: 'bell_county_gis',
    source_name: 'CourthouseDirect — Bell County',
    title: 'CourthouseDirect — Bell County Deed & Plat Records',
    url: req.address
      ? `https://www.courthousedirect.com/PropertySearch/Texas/Bell?address=${encodeURIComponent(req.address.split(',')[0].trim())}`
      : 'https://www.courthousedirect.com/PropertySearch/Texas/Bell',
    document_type: 'deed',
    relevance: scoreRelevance(0.78, { hasAddress }),
    is_property_specific: hasAddress,
    description: [
      `CourthouseDirect FileViewer for Bell County — scanned indexes and images of historical and current deeds, plats, and instruments.`,
      ` Especially useful for chain-of-title research on older properties where deeds reference prior Volume/Page instruments.`,
      req.address ? ` Search by address: "${req.address.split(',')[0].trim()}".` : '',
      ` Covers recorded instruments from Bell County official public records.`,
    ].join(''),
    has_cost: true,
    cost_note: 'Basic index searches free; document image downloads require a subscription.',
    metadata: { platform: 'courthousedirect', county: 'Bell', state: 'Texas' },
  });

  // Bell CAD Data Portal — bulk appraisal roll export (useful when all search methods fail)
  results.push({
    id: generateResultId('bell_county_gis', 22),
    source: 'bell_county_gis',
    source_name: 'Bell CAD — Data Portal',
    title: 'Bell CAD Data Portal — Bulk Property Data Export',
    url: 'https://www.bellcad.org/data-portal/',
    document_type: 'appraisal_record',
    relevance: scoreRelevance(0.55, {}),
    is_property_specific: false,
    description: `Bell CAD Data Portal — download bulk appraisal roll data including legal descriptions, owner names, acreage, and property IDs for all Bell County parcels. Use as a last resort when the eSearch portal is unavailable or returns no results for the address.`,
    has_cost: false,
    metadata: { platform: 'bellcad_data', county: 'Bell' },
  });

  return {
    results,
    source: { source: 'bell_county_gis', name: 'Bell County GIS', status: 'success' },
  };
}

// ── County Appraisal District Search ─────────────────────────────────────────

async function searchCountyCAD(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  // Bell is handled by searchBellCountyGIS
  if (!county || county.toLowerCase() === 'bell') {
    return {
      results: [],
      source: { source: 'county_cad', name: 'County CAD', status: 'no_results', message: 'Bell handled by dedicated source' },
    };
  }

  const countyKey = county.toLowerCase().replace(/\s+/g, '_');
  const cad = TEXAS_CAD_CONFIGS[countyKey] || TEXAS_CAD_CONFIGS[county.toLowerCase()];
  const hasParcelId = !!req.parcel_id;
  const hasAddress = !!req.address;

  if (!cad) {
    // County is outside our configured service area — point to Texas Comptroller directory
    const results: PropertySearchResult[] = [];
    if (county) {
      results.push({
        id: generateResultId('county_cad', 0),
        source: 'county_cad',
        source_name: `${county} County Appraisal District`,
        title: `${county} County CAD — Texas Comptroller Directory`,
        url: COMPTROLLER_DIR,
        document_type: 'appraisal_record',
        relevance: 0.50,
        is_property_specific: false,
        description: `Find the ${county} County Appraisal District website via the Texas Comptroller county directory. Select "${county}" county to get the direct link to their CAD search portal, then search by address or parcel ID for the legal description and deed references.`,
        has_cost: false,
      });
    }
    return {
      results,
      source: { source: 'county_cad', name: `${county || 'Unknown'} County CAD`, status: results.length > 0 ? 'success' : 'no_results', message: `No direct integration for ${county} County` },
    };
  }

  // Build most targeted URL:
  // - If a parcel_id is provided and county uses TrueAutomation, link directly to the property record.
  // - Otherwise use the e-search portal (if available) or the CAD homepage.
  // NOTE: TrueAutomation does NOT support address pre-fill via URL — users must type in address.
  let cadUrl: string;
  if (cad.platform === 'trueautomation' && cad.trueautoId && req.parcel_id) {
    cadUrl = `https://propaccess.trueautomation.com/clientdb/?cid=${cad.trueautoId}&prop_id=${encodeURIComponent(req.parcel_id)}`;
  } else if (cad.esearchUrl) {
    cadUrl = cad.esearchUrl;
  } else {
    cadUrl = cad.searchUrl;
  }

  const results: PropertySearchResult[] = [
    {
      id: generateResultId('county_cad', 0),
      source: 'county_cad',
      source_name: cad.name,
      title: req.parcel_id
        ? `${county} County CAD — Property ID ${req.parcel_id}`
        : `${county} County CAD — Property Search`,
      url: cadUrl,
      document_type: 'appraisal_record',
      relevance: scoreRelevance(req.parcel_id ? 0.95 : 0.89, { hasParcelId, hasAddress }),
      is_property_specific: hasAddress || hasParcelId,
      description: [
        `Official legal description, improvement data, land value, and ownership history from ${cad.name}.`,
        req.parcel_id ? ` Direct link to Property ID ${req.parcel_id}.` : '',
        !req.parcel_id && req.address ? ` Enter address "${req.address}" in the search box.` : '',
        req.owner_name ? ` Or search by owner name: "${req.owner_name}".` : '',
        ` The legal description contains the metes-and-bounds calls needed for the survey drawing.`,
      ].join(''),
      has_cost: false,
      metadata: { platform: cad.platform, county, search_address: req.address, search_parcel: req.parcel_id },
    },
  ];

  return { results, source: { source: 'county_cad', name: cad.name, status: 'success' } };
}

// ── County Clerk Records Search ──────────────────────────────────────────────

async function searchCountyClerk(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  if (!county) {
    return {
      results: [],
      source: { source: 'county_clerk', name: 'County Clerk', status: 'no_results', message: 'County not determined' },
    };
  }

  const countyKey = county.toLowerCase().replace(/\s+/g, '_');
  const clerk = TEXAS_CLERK_CONFIGS[countyKey] || TEXAS_CLERK_CONFIGS[county.toLowerCase()];
  const hasAddress = !!req.address;
  const hasOwner = !!req.owner_name;
  const hasParcelId = !!req.parcel_id;

  const clerkName = clerk?.name || `${county} County Clerk`;
  const clerkUrl = clerk?.url || `https://comptroller.texas.gov/taxes/property-tax/county-directory/`;

  const hasSpecificQuery = hasAddress || hasParcelId || hasOwner;
  const results: PropertySearchResult[] = [];

  // publicsearch.us — pre-loaded with property ID (top result when property ID is known)
  const publicsearchUrl = buildPublicsearchUrl(countyKey, req.parcel_id, req.owner_name);
  if (publicsearchUrl) {
    results.push({
      id: generateResultId('county_clerk', 2),
      source: 'county_clerk',
      source_name: `${clerkName} — Online Records (publicsearch.us)`,
      title: hasParcelId
        ? `${county} County Deed Search — Property ID ${req.parcel_id}`
        : hasOwner
          ? `${county} County Deed Search — ${req.owner_name}`
          : `${county} County Deed Search (publicsearch.us)`,
      url: publicsearchUrl,
      document_type: 'deed',
      relevance: scoreRelevance(hasParcelId ? 0.98 : hasOwner ? 0.90 : 0.85, { hasParcelId, hasAddress }),
      is_property_specific: hasSpecificQuery,
      description: [
        hasParcelId
          ? `${clerkName} online deed search pre-loaded with Property ID ${req.parcel_id} — returns every recorded instrument (deeds, plats, easements, liens) referencing this property.`
          : `${clerkName} online deed and instrument search via the publicsearch.us platform.`,
        ` Full-text OCR search (search type: index + full text) finds deeds and legal descriptions even in older scanned documents.`,
        hasParcelId ? ` Expected results: 2–5 deeds containing the metes-and-bounds legal description.` : '',
        hasOwner ? ` Searching by grantor/grantee name: "${req.owner_name}".` : '',
      ].join(''),
      has_cost: false,
      cost_note: 'Online viewing is free; certified copies available from the county clerk.',
      metadata: { record_type: 'deed', county, platform: 'publicsearch', prop_id: req.parcel_id },
    });
  }

  // publicsearch.us grantor/grantee search — searches by owner name as grantor OR grantee
  if (req.owner_name) {
    const grantorUrl = buildPublicsearchGrantorUrl(countyKey, req.owner_name);
    if (grantorUrl) {
      results.push({
        id: generateResultId('county_clerk', 3),
        source: 'county_clerk',
        source_name: `${clerkName} — Grantor/Grantee Search`,
        title: hasParcelId
          ? `${county} County Deed Search — Grantor/Grantee: ${req.owner_name}`
          : `${county} County Deed Search by Owner: ${req.owner_name}`,
        url: grantorUrl,
        document_type: 'deed',
        relevance: scoreRelevance(0.95, { hasParcelId, hasAddress }),
        is_property_specific: true,
        description: [
          `${clerkName} records searched by grantor/grantee name "${req.owner_name}" — finds every instrument (deeds, mortgages, easements) where this name appears as grantor or grantee.`,
          ` Especially useful when the property ID is unknown — trace the chain of title by name to find all recorded deeds with legal descriptions.`,
        ].join(''),
        has_cost: false,
        cost_note: 'Online viewing is free; certified copies available from the county clerk.',
        metadata: { record_type: 'deed', county, platform: 'publicsearch', search_type: 'grantor_grantee' },
      });
    }
  }

  // Deed records via county clerk homepage
  results.push({
    id: generateResultId('county_clerk', 0),
    source: 'county_clerk',
    source_name: clerkName,
    title: `${county} County Clerk — Deed Records`,
    url: clerkUrl,
    document_type: 'deed',
    relevance: scoreRelevance(0.87, { hasAddress }),
    is_property_specific: hasSpecificQuery,
    description: [
      `${clerkName} real estate records — warranty deeds, quit claim deeds, and special warranty deeds.`,
      ` Deed documents contain the full metes-and-bounds legal description, grantor/grantee, and recording reference.`,
      hasOwner ? ` Search by grantor/grantee: "${req.owner_name}".` : '',
      hasAddress ? ` Trace the deed for property at: ${req.address}.` : '',
      ` Find the most recent deed first, then trace the chain of title for all boundary history.`,
    ].join(''),
    has_cost: true,
    cost_note: 'Online viewing may be free; certified copies typically $1/page + $5 certification fee.',
    metadata: { record_type: 'deed', county },
  });

  // Plat records (only if there's a specific query)
  if (hasSpecificQuery) {
    results.push({
      id: generateResultId('county_clerk', 1),
      source: 'county_clerk',
      source_name: clerkName,
      title: `${county} County Clerk — Plat Records`,
      url: clerkUrl,
      document_type: 'subdivision_plat',
      relevance: scoreRelevance(0.84, { hasAddress }),
      is_property_specific: hasSpecificQuery,
      description: [
        `Recorded subdivision plats, amended plats, and replats on file with the ${clerkName}.`,
        ` Plats show lot lines, block numbers, dimensions, bearings, distances, and surveyor certifications.`,
        hasAddress ? ` If this property is in a platted subdivision, search for the subdivision name in the plat index.` : '',
      ].join(''),
      has_cost: true,
      cost_note: 'Certified copies typically $1/page + $5 certification fee.',
      metadata: { record_type: 'plat', county },
    });
  }

  return {
    results,
    source: { source: 'county_clerk', name: clerkName, status: 'success', message: !clerk ? `No direct integration — Texas Comptroller link provided` : undefined },
  };
}

// ── Texas General Land Office — Original Survey Abstracts ───────────────────

async function searchTexasGLO(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  // GLO abstract surveys are always relevant for Texas land — but only when county is known
  if (!county) {
    return {
      results: [],
      source: { source: 'texas_glo', name: 'Texas GLO', status: 'no_results', message: 'County required for GLO abstract lookup' },
    };
  }

  const countyParam = encodeURIComponent(county);
  // GLO archives viewer with county filter — lands at a map/list of original grants for the county
  const gloGrantUrl = `https://s3.glo.texas.gov/glo/history/archives/land-grants/index.cfm?county=${countyParam}`;
  // GLO Clarity portal for spatial search of land grants
  const gloClarityUrl = `https://clarity.texas.gov/web/app.jsp#Viewer?app=72018e7c5beb4a7fb13dc9c0f6804b71`;

  return {
    results: [
      {
        id: generateResultId('texas_glo', 0),
        source: 'texas_glo',
        source_name: 'Texas General Land Office — Land Grants Archive',
        title: `Texas GLO — Original Survey Abstracts (${county} County)`,
        url: gloGrantUrl,
        document_type: 'survey',
        relevance: scoreRelevance(0.75, { hasAddress: !!req.address }),
        is_property_specific: true,
        description: [
          `Texas GLO archives — original land grants, patent records, and survey field notes for ${county} County.`,
          ` Abstract surveys include original bearing calls, distances, and landmark references (trees, creeks, blazed lines).`,
          ` The abstract number (e.g., A-123) ties all records for a tract together across government agencies.`,
          ` Essential for rural/agricultural parcels where the original survey is the controlling boundary document.`,
        ].join(''),
        has_cost: false,
        metadata: { data_type: 'land_grants', county },
      },
      {
        id: generateResultId('texas_glo', 1),
        source: 'texas_glo',
        source_name: 'Texas GLO Clarity — Spatial Land Grant Viewer',
        title: `Texas GLO Clarity — Interactive Land Grant Map`,
        url: gloClarityUrl,
        document_type: 'survey',
        relevance: scoreRelevance(0.70, { hasAddress: !!req.address }),
        is_property_specific: !!county,
        description: `Texas GLO Clarity spatial viewer — search original land grant boundaries on an interactive map. Zoom to ${county} County to see original survey abstract boundaries overlaid on modern parcels.`,
        has_cost: false,
        metadata: { data_type: 'land_grants_gis', county },
      },
    ],
    source: { source: 'texas_glo', name: 'Texas General Land Office', status: 'success' },
  };
}

// ── TexasFile Deed Search ────────────────────────────────────────────────────

async function searchTexasFile(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  if (!county) {
    return {
      results: [],
      source: { source: 'texas_file', name: 'TexasFile', status: 'no_results', message: 'County required' },
    };
  }

  // TexasFile county search URL — search by county, then filter by grantor/grantee name or document type.
  const countyEncoded = encodeURIComponent(county);
  const texasFileUrl = req.owner_name
    ? `https://www.texasfile.com/search/?county=${countyEncoded}&name=${encodeURIComponent(req.owner_name)}&type=deed`
    : `https://www.texasfile.com/search/?county=${countyEncoded}&type=deed`;
  const hasSpecificQuery = !!(req.address || req.parcel_id || req.owner_name);

  return {
    results: [
      {
        id: generateResultId('texas_file', 0),
        source: 'texas_file',
        source_name: `TexasFile — ${county} County Deed Search`,
        title: `TexasFile Deed Search — ${county} County`,
        url: texasFileUrl,
        document_type: 'deed',
        relevance: scoreRelevance(0.78, { hasAddress: !!req.address }),
        is_property_specific: hasSpecificQuery,
        description: [
          `TexasFile.com — Texas deed search with county clerk record access for ${county} County.`,
          ` Search by grantor/grantee name, document type, and date range to trace chain of title.`,
          req.owner_name ? ` Pre-filtered by owner name: "${req.owner_name}".` : '',
          ` Find deed volume/page references for certified copies from the county clerk.`,
        ].join(''),
        has_cost: true,
        cost_note: 'Basic searches free; full document images require a TexasFile subscription.',
        metadata: { data_type: 'deed_search', county },
      },
    ],
    source: { source: 'texas_file', name: `TexasFile — ${county}`, status: 'success' },
  };
}

// ── FEMA Flood Zone Search ───────────────────────────────────────────────────

async function searchFEMA(req: PropertySearchRequest): Promise<ProviderResult> {
  if (!req.address) {
    return {
      results: [],
      source: { source: 'fema', name: 'FEMA Flood Map Service', status: 'no_results', message: 'Address required' },
    };
  }

  const femaSearchUrl = `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(req.address)}`;

  return {
    results: [
      {
        id: generateResultId('fema', 0),
        source: 'fema',
        source_name: 'FEMA Flood Map Service Center',
        title: `FEMA Flood Zone — ${req.address}`,
        url: femaSearchUrl,
        document_type: 'other',
        relevance: 0.72,
        is_property_specific: true,
        description: `Flood zone designation, FIRM panel number, and Base Flood Elevation for: "${req.address}". Determines if the property is in a Special Flood Hazard Area (Zone A or AE), which affects surveying requirements and construction setbacks.`,
        has_cost: false,
        metadata: { data_type: 'flood_zone', search_address: req.address },
      },
    ],
    source: { source: 'fema', name: 'FEMA Flood Map Service', status: 'success' },
  };
}

// ── TNRIS Aerial Imagery ──────────────────────────────────────────────────────
// Only returned when county is known; score lower than direct property databases.

async function searchTNRIS(req: PropertySearchRequest, county: string): Promise<ProviderResult> {
  if (!county && !req.address) {
    return {
      results: [],
      source: { source: 'tnris', name: 'TNRIS', status: 'no_results', message: 'Address or county required' },
    };
  }

  return {
    results: [
      {
        id: generateResultId('tnris', 0),
        source: 'tnris',
        source_name: 'Texas Natural Resources Information System',
        title: `Aerial Imagery & LiDAR${county ? ` — ${county} County` : ''}`,
        url: 'https://data.tnris.org/',
        document_type: 'aerial_photo',
        relevance: scoreRelevance(0.58, { hasCounty: !!county }),
        is_property_specific: false,
        description: [
          `TNRIS DataHub — high-resolution aerial imagery, historical aerials, and LiDAR elevation data.`,
          county ? ` Filter by ${county} County.` : '',
          ` Historical aerials show fence lines, improvements, and landmarks from past decades.`,
          ` LiDAR provides precise elevation for drainage analysis and boundary monument searching.`,
        ].join(''),
        has_cost: false,
        metadata: { data_type: 'aerial_imagery', county },
      },
    ],
    source: { source: 'tnris', name: 'TNRIS', status: 'success' },
  };
}

// ── TxDOT Right-of-Way Maps ──────────────────────────────────────────────────
// Only returned when the address references a highway, FM road, or state route.

async function searchTxDOT(req: PropertySearchRequest): Promise<ProviderResult> {
  if (!isHighwayAddress(req.address)) {
    return {
      results: [],
      source: { source: 'txdot', name: 'TxDOT ROW', status: 'no_results', message: 'Address does not reference a highway or FM road' },
    };
  }

  return {
    results: [
      {
        id: generateResultId('txdot', 0),
        source: 'txdot',
        source_name: 'TxDOT Right-of-Way Division',
        title: `TxDOT ROW Maps — Highway-Adjacent Property`,
        url: 'https://www.txdot.gov/inside-txdot/forms-publications/right-of-way-maps.html',
        document_type: 'other',
        relevance: 0.68,
        is_property_specific: true,
        description: [
          `TxDOT right-of-way maps — ROW widths, taking lines, and control-of-access lines for the highway adjacent to this property.`,
          ` The ROW map defines the exact boundary between public highway right-of-way and private property.`,
          ` Essential when surveying a property that fronts on a state highway or FM road.`,
        ].join(''),
        has_cost: false,
        metadata: { data_type: 'row_maps' },
      },
    ],
    source: { source: 'txdot', name: 'TxDOT Right-of-Way', status: 'success' },
  };
}

// ── USGS National Map ────────────────────────────────────────────────────────
// Only returned when address is provided; one result only, focused on historical topo.

async function searchUSGS(req: PropertySearchRequest): Promise<ProviderResult> {
  if (!req.address) {
    return {
      results: [],
      source: { source: 'usgs', name: 'USGS National Map', status: 'no_results', message: 'Address required for topo map search' },
    };
  }

  // NOTE: USGS TopoView uses #zoom/lat/lon, not an address string.
  // We build a fallback search URL now; the search route will patch it with actual
  // geocoded coordinates after parallel geocoding completes.
  const usgsViewerUrl = `https://ngmdb.usgs.gov/topoview/viewer/#14/${CENTRAL_TEXAS_DEFAULT_LAT}/${CENTRAL_TEXAS_DEFAULT_LON}`;

  return {
    results: [
      {
        id: generateResultId('usgs', 0),
        source: 'usgs',
        source_name: 'USGS TopoView',
        title: `Historical Topo Maps — ${req.address}`,
        url: usgsViewerUrl,
        document_type: 'topo_map',
        relevance: 0.55,
        is_property_specific: true,
        description: `USGS historical topographic maps (7.5-minute quads, 1930s–present) for: "${req.address}". Shows original fence lines, roads, watercourses, and landmarks that may be referenced in older deed calls.`,
        has_cost: false,
        metadata: { data_type: 'historical_topo', search_address: req.address },
      },
    ],
    source: { source: 'usgs', name: 'USGS National Map', status: 'success' },
  };
}

// ── Texas Railroad Commission ─────────────────────────────────────────────────
// Only returned for rural/agricultural counties where mineral rights are common.

const RRC_RELEVANT_COUNTIES = new Set([
  'bell', 'coryell', 'mclennan', 'falls', 'milam', 'lampasas', 'hamilton',
  'san saba', 'mills', 'brown', 'coleman', 'mcculloch', 'mason', 'llano',
  'blanco', 'gillespie', 'comanche', 'erath', 'bosque', 'hill',
]);

async function searchTexasRRC(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  if (!county || !RRC_RELEVANT_COUNTIES.has(county.toLowerCase())) {
    return {
      results: [],
      source: { source: 'texas_rrc', name: 'Texas RRC', status: 'no_results', message: 'RRC data less relevant for this county' },
    };
  }

  const countyParam = encodeURIComponent(county.toUpperCase());
  const rrcGisUrl = `https://gis.rrc.texas.gov/GISViewer/?county=${countyParam}`;

  return {
    results: [
      {
        id: generateResultId('texas_rrc', 0),
        source: 'texas_rrc',
        source_name: 'Texas Railroad Commission',
        title: `Oil, Gas & Pipeline Locations — ${county} County`,
        url: rrcGisUrl,
        document_type: 'other',
        relevance: 0.52,
        is_property_specific: !!county,
        description: `Texas RRC GIS viewer — oil/gas well locations, pipeline routes, and mineral lease boundaries for ${county} County. Relevant when pipeline easements or surface use agreements may affect the survey boundary.`,
        has_cost: false,
        metadata: { data_type: 'oil_gas_gis', county },
      },
    ],
    source: { source: 'texas_rrc', name: 'Texas Railroad Commission', status: 'success' },
  };
}

// ── City Records (permits and plats) ─────────────────────────────────────────
// Only matched when the specific city name is found in the address.

interface CityConfig {
  name: string;
  url: string;
  county: string;
}

const TEXAS_CITY_CONFIGS: Record<string, CityConfig> = {
  // Bell County
  belton:             { name: 'City of Belton',         url: 'https://www.belton.org/220/Planning-Development-Services',          county: 'bell' },
  killeen:            { name: 'City of Killeen',         url: 'https://www.killeentexas.gov/222/Building-Inspections-Permits',      county: 'bell' },
  temple:             { name: 'City of Temple GIS',     url: 'https://www.templetx.gov/547/GIS-Services',                          county: 'bell' },
  'harker heights':   { name: 'City of Harker Heights', url: 'https://www.hhtx.com/',                                              county: 'bell' },
  nolanville:         { name: 'City of Nolanville',     url: 'https://www.nolanville.org/',                                        county: 'bell' },
  // Coryell County
  gatesville:         { name: 'City of Gatesville',     url: 'https://www.gatesvilletx.com/',                                      county: 'coryell' },
  'copperas cove':    { name: 'City of Copperas Cove',  url: 'https://www.copperascovetx.gov/departments/planning-development',    county: 'coryell' },
  // McLennan County
  waco:               { name: 'City of Waco GIS',       url: 'https://www.waco-texas.com/cc_content.asp?cid=9988',                 county: 'mclennan' },
  // Williamson County
  'round rock':       { name: 'City of Round Rock',     url: 'https://www.roundrocktexas.gov/departments/planning-development/',   county: 'williamson' },
  georgetown:         { name: 'City of Georgetown GIS', url: 'https://gis.georgetown.org/',                                        county: 'williamson' },
  'cedar park':       { name: 'City of Cedar Park',     url: 'https://www.cedarparktexas.gov/departments/planning-development',    county: 'williamson' },
  // Travis County
  austin:             { name: 'City of Austin GIS',     url: 'https://www.austintexas.gov/department/gis',                         county: 'travis' },
  // Hays County
  'san marcos':       { name: 'City of San Marcos',     url: 'https://www.sanmarcostx.gov/225/Planning-Zoning',                    county: 'hays' },
  kyle:               { name: 'City of Kyle',           url: 'https://www.cityofkyle.com/planning',                                county: 'hays' },
  buda:               { name: 'City of Buda',           url: 'https://www.cityofbuda.org/214/Planning-Development',                county: 'hays' },
  // Brazos County
  bryan:              { name: 'City of Bryan GIS',      url: 'https://www.bryantx.gov/gis/',                                       county: 'brazos' },
  'college station':  { name: 'City of College Station GIS', url: 'https://gis.cstx.gov/',                                        county: 'brazos' },
};

async function searchCityRecords(req: PropertySearchRequest): Promise<ProviderResult> {
  const address = (req.address || '').toLowerCase();
  let matchedCity: CityConfig | null = null;

  // Only match by explicit city name in address
  for (const [cityKey, cityConf] of Object.entries(TEXAS_CITY_CONFIGS)) {
    if (address.includes(cityKey)) {
      matchedCity = cityConf;
      break;
    }
  }

  if (!matchedCity) {
    return {
      results: [],
      source: { source: 'city_records', name: 'City Records', status: 'no_results', message: 'No matching city in address' },
    };
  }

  return {
    results: [
      {
        id: generateResultId('city_records', 0),
        source: 'city_records',
        source_name: matchedCity.name,
        title: `City Plats & Permits — ${matchedCity.name}`,
        url: matchedCity.url,
        document_type: 'subdivision_plat',
        relevance: scoreRelevance(0.68, { hasAddress: !!req.address }),
        is_property_specific: true,
        description: [
          `${matchedCity.name} development records, approved plats, and building permits.`,
          ` City plats contain lot dimensions, building setback lines, and utility easement locations not always in county records.`,
          req.address ? ` Search for plans or permits associated with: ${req.address}.` : '',
        ].join(''),
        has_cost: false,
        metadata: { data_type: 'city_plats', city: matchedCity.name, county: matchedCity.county },
      },
    ],
    source: { source: 'city_records', name: matchedCity.name, status: 'success' },
  };
}
