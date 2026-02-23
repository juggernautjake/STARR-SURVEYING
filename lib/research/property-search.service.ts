// lib/research/property-search.service.ts — Property search & document discovery
// Searches Texas public record sources for property-related documents.
// Service area: Belton, TX and surrounding 160-mile radius (~50 Texas counties).
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
  searchUrl: string;
  platform: 'trueautomation' | 'generic';
  trueautoId?: number;
}

const TEXAS_CAD_CONFIGS: Record<string, CADConfig> = {
  // ── Core service area ──
  bell:       { name: 'Bell County Appraisal District',       searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=14', platform: 'trueautomation', trueautoId: 14 },
  coryell:    { name: 'Coryell County Appraisal District',    searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=18', platform: 'trueautomation', trueautoId: 18 },
  mclennan:   { name: 'McLennan County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=25', platform: 'trueautomation', trueautoId: 25 },
  falls:      { name: 'Falls County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=20', platform: 'trueautomation', trueautoId: 20 },
  milam:      { name: 'Milam County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=26', platform: 'trueautomation', trueautoId: 26 },
  lampasas:   { name: 'Lampasas County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=23', platform: 'trueautomation', trueautoId: 23 },
  // ── Austin metro ──
  travis:     { name: 'Travis County Appraisal District',     searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=13', platform: 'trueautomation', trueautoId: 13 },
  williamson: { name: 'Williamson County Appraisal District', searchUrl: 'https://search.wcad.org',                                 platform: 'generic' },
  bastrop:    { name: 'Bastrop County Appraisal District',    searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=2',  platform: 'trueautomation', trueautoId: 2 },
  hays:       { name: 'Hays County Appraisal District',       searchUrl: 'https://hayscad.com/property-search',                   platform: 'generic' },
  // ── Brazos Valley ──
  brazos:     { name: 'Brazos County Appraisal District',     searchUrl: 'https://brazoscad.org',                                  platform: 'generic' },
  burleson:   { name: 'Burleson County Appraisal District',   searchUrl: 'https://burlesoncad.org',                                platform: 'generic' },
  robertson:  { name: 'Robertson County Appraisal District',  searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=29', platform: 'trueautomation', trueautoId: 29 },
  lee:        { name: 'Lee County Appraisal District',        searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=24', platform: 'trueautomation', trueautoId: 24 },
  // ── Central Texas / Hill Country ──
  burnet:     { name: 'Burnet County Appraisal District',     searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=8',  platform: 'trueautomation', trueautoId: 8 },
  llano:      { name: 'Llano County Appraisal District',      searchUrl: 'https://llano-cad.org',                                  platform: 'generic' },
  san_saba:   { name: 'San Saba County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=30', platform: 'trueautomation', trueautoId: 30 },
  hamilton:   { name: 'Hamilton County Appraisal District',   searchUrl: 'https://hamiltoncad.com',                                platform: 'generic' },
  bosque:     { name: 'Bosque County Appraisal District',     searchUrl: 'https://bosquecad.org',                                  platform: 'generic' },
  hill:       { name: 'Hill County Appraisal District',       searchUrl: 'https://hillcad.org',                                    platform: 'generic' },
  limestone:  { name: 'Limestone County Appraisal District',  searchUrl: 'https://limestonecad.org',                               platform: 'generic' },
  freestone:  { name: 'Freestone County Appraisal District',  searchUrl: 'https://freestonecad.org',                               platform: 'generic' },
  leon:       { name: 'Leon County Appraisal District',       searchUrl: 'https://leoncad.org',                                    platform: 'generic' },
  blanco:     { name: 'Blanco County Appraisal District',     searchUrl: 'https://blancocad.com',                                  platform: 'generic' },
  gillespie:  { name: 'Gillespie County Appraisal District',  searchUrl: 'https://gillespiecad.com',                               platform: 'generic' },
  // ── South / Southwest ──
  caldwell:   { name: 'Caldwell County Appraisal District',   searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=9',  platform: 'trueautomation', trueautoId: 9 },
  guadalupe:  { name: 'Guadalupe County Appraisal District',  searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=94', platform: 'trueautomation', trueautoId: 94 },
  comal:      { name: 'Comal County Appraisal District',      searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=46', platform: 'trueautomation', trueautoId: 46 },
  // ── West ──
  brown:      { name: 'Brown County Appraisal District',      searchUrl: 'https://browncad.org',                                   platform: 'generic' },
  comanche:   { name: 'Comanche County Appraisal District',   searchUrl: 'https://comanchecad.org',                                platform: 'generic' },
  erath:      { name: 'Erath County Appraisal District',      searchUrl: 'https://erathcad.org',                                   platform: 'generic' },
  hamilton_co: { name: 'Hamilton County Appraisal District',  searchUrl: 'https://hamiltoncad.com',                                platform: 'generic' },
  mills:      { name: 'Mills County Appraisal District',      searchUrl: 'https://millscad.org',                                   platform: 'generic' },
  mcculloch:  { name: 'McCulloch County Appraisal District',  searchUrl: 'https://mccullochcad.com',                               platform: 'generic' },
  mason:      { name: 'Mason County Appraisal District',      searchUrl: 'https://masoncad.com',                                   platform: 'generic' },
  coleman:    { name: 'Coleman County Appraisal District',    searchUrl: 'https://colemancad.org',                                 platform: 'generic' },
  // ── North / DFW fringe ──
  hood:       { name: 'Hood County Appraisal District',       searchUrl: 'https://hoodcad.net',                                    platform: 'generic' },
  somervell:  { name: 'Somervell County Appraisal District',  searchUrl: 'https://somervellcad.org',                               platform: 'generic' },
  johnson:    { name: 'Johnson County Appraisal District',    searchUrl: 'https://johnsoncad.com',                                 platform: 'generic' },
  ellis:      { name: 'Ellis County Appraisal District',      searchUrl: 'https://elliscad.net',                                   platform: 'generic' },
  navarro:    { name: 'Navarro County Appraisal District',    searchUrl: 'https://navarrocad.com',                                 platform: 'generic' },
  // ── East ──
  anderson:   { name: 'Anderson County Appraisal District',   searchUrl: 'https://andersoncad.org',                                platform: 'generic' },
  henderson:  { name: 'Henderson County Appraisal District',  searchUrl: 'https://hendersoncad.org',                               platform: 'generic' },
  // ── Southeast ──
  grimes:     { name: 'Grimes County Appraisal District',     searchUrl: 'https://grimescad.org',                                  platform: 'generic' },
  washington: { name: 'Washington County Appraisal District', searchUrl: 'https://washingtoncad.org',                              platform: 'generic' },
  fayette:    { name: 'Fayette County Appraisal District',    searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=21', platform: 'trueautomation', trueautoId: 21 },
  austin_co:  { name: 'Austin County Appraisal District',     searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=1',  platform: 'trueautomation', trueautoId: 1 },
};

// ── County Clerk Records ─────────────────────────────────────────────────────

interface ClerkConfig {
  name: string;
  url: string;
}

const TEXAS_CLERK_CONFIGS: Record<string, ClerkConfig> = {
  bell:       { name: 'Bell County Clerk',       url: 'https://bellcountytx.com/county_clerk/real_estate_records.php' },
  coryell:    { name: 'Coryell County Clerk',    url: 'https://www.coryellcounty.org/page/coryell.County.Clerk' },
  mclennan:   { name: 'McLennan County Clerk',   url: 'https://co.mclennan.tx.us/123/County-Clerk' },
  falls:      { name: 'Falls County Clerk',      url: 'https://www.co.falls.tx.us/' },
  milam:      { name: 'Milam County Clerk',      url: 'https://www.co.milam.tx.us/department/?fdd=65' },
  lampasas:   { name: 'Lampasas County Clerk',   url: 'https://www.co.lampasas.tx.us/departments/county-clerk/' },
  travis:     { name: 'Travis County Clerk',     url: 'https://countyclerk.traviscountytx.gov/recording/real-property-records.html' },
  williamson: { name: 'Williamson County Clerk', url: 'https://judicialrecords.wilco.org/PublicAccess/default.aspx' },
  bastrop:    { name: 'Bastrop County Clerk',    url: 'https://bastropcountytexas.gov/departments/county-clerk' },
  hays:       { name: 'Hays County Clerk',       url: 'https://www.hayscountytx.com/departments/county-clerk/' },
  brazos:     { name: 'Brazos County Clerk',     url: 'https://www.brazoscountytx.gov/departments/countyclerk' },
  burleson:   { name: 'Burleson County Clerk',   url: 'https://www.burlesoncountytexas.us/countyclerk' },
  robertson:  { name: 'Robertson County Clerk',  url: 'https://www.co.robertson.tx.us/county_clerk' },
  lee:        { name: 'Lee County Clerk',        url: 'https://www.co.lee.tx.us/county-clerk' },
  burnet:     { name: 'Burnet County Clerk',     url: 'https://www.burnetcountytexas.org/county-clerk' },
  llano:      { name: 'Llano County Clerk',      url: 'https://www.co.llano.tx.us/county-clerk' },
  hill:       { name: 'Hill County Clerk',       url: 'https://www.co.hill.tx.us/county-clerk' },
  limestone:  { name: 'Limestone County Clerk',  url: 'https://www.co.limestone.tx.us/county-clerk' },
  bosque:     { name: 'Bosque County Clerk',     url: 'https://www.co.bosque.tx.us/county-clerk' },
  hamilton:   { name: 'Hamilton County Clerk',   url: 'https://www.hamiltoncountytx.org/county-clerk' },
  freestone:  { name: 'Freestone County Clerk',  url: 'https://www.co.freestone.tx.us/county-clerk' },
  leon:       { name: 'Leon County Clerk',       url: 'https://www.co.leon.tx.us/county-clerk' },
  blanco:     { name: 'Blanco County Clerk',     url: 'https://www.blancocountytx.gov/county-clerk' },
  caldwell:   { name: 'Caldwell County Clerk',   url: 'https://www.co.caldwell.tx.us/county-clerk' },
  comal:      { name: 'Comal County Clerk',      url: 'https://www.co.comal.tx.us/county_clerk' },
  guadalupe:  { name: 'Guadalupe County Clerk',  url: 'https://www.guadalupecounty.org/county-clerk' },
  brown:      { name: 'Brown County Clerk',      url: 'https://www.co.brown.tx.us/county-clerk' },
  comanche:   { name: 'Comanche County Clerk',   url: 'https://www.co.comanche.tx.us/county-clerk' },
  erath:      { name: 'Erath County Clerk',      url: 'https://www.co.erath.tx.us/county-clerk' },
  hood:       { name: 'Hood County Clerk',       url: 'https://www.co.hood.tx.us/county-clerk' },
  somervell:  { name: 'Somervell County Clerk',  url: 'https://www.co.somervell.tx.us/county-clerk' },
  johnson:    { name: 'Johnson County Clerk',    url: 'https://www.johnsoncountytx.org/county-clerk' },
  ellis:      { name: 'Ellis County Clerk',      url: 'https://www.co.ellis.tx.us/county-clerk' },
  navarro:    { name: 'Navarro County Clerk',    url: 'https://www.co.navarro.tx.us/county-clerk' },
  anderson:   { name: 'Anderson County Clerk',   url: 'https://www.co.anderson.tx.us/county-clerk' },
  henderson:  { name: 'Henderson County Clerk',  url: 'https://www.co.henderson.tx.us/county-clerk' },
  grimes:     { name: 'Grimes County Clerk',     url: 'https://www.co.grimes.tx.us/county-clerk' },
  washington: { name: 'Washington County Clerk', url: 'https://www.co.washington.tx.us/county-clerk' },
  fayette:    { name: 'Fayette County Clerk',    url: 'https://www.co.fayette.tx.us/county-clerk' },
};

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

  const cadSearchUrl = req.parcel_id
    ? `https://propaccess.trueautomation.com/clientdb/?cid=14&prop_id=${encodeURIComponent(req.parcel_id)}`
    : req.address
    ? `https://propaccess.trueautomation.com/clientdb/?cid=14&saddr=${encodeURIComponent(req.address)}`
    : 'https://propaccess.trueautomation.com/clientdb/?cid=14';

  const results: PropertySearchResult[] = [];

  // GIS Parcel Viewer
  results.push({
    id: generateResultId('bell_county_gis', 0),
    source: 'bell_county_gis',
    source_name: 'Bell County GIS',
    title: 'Bell County GIS Parcel Viewer',
    url: 'https://gis.co.bell.tx.us/',
    document_type: 'plat',
    relevance: scoreRelevance(0.88, { hasParcelId, hasAddress }),
    is_property_specific: hasAddress || hasParcelId,
    description: [
      `Bell County GIS portal — search parcel boundaries, ownership data, and geographic features.`,
      req.address ? ` Use the search bar to look up: "${req.address}".` : '',
      req.parcel_id ? ` Filter by Property ID: ${req.parcel_id}.` : '',
      ` Click any parcel to see the owner name, legal description, and deed reference.`,
    ].join(''),
    has_cost: false,
    metadata: { search_address: req.address, parcel_id: req.parcel_id, county: 'Bell' },
  });

  // Bell CAD
  results.push({
    id: generateResultId('bell_county_gis', 1),
    source: 'bell_county_gis',
    source_name: 'Bell County Appraisal District (CAD)',
    title: 'Bell County CAD — Property & Legal Description',
    url: cadSearchUrl,
    document_type: 'appraisal_record',
    relevance: scoreRelevance(0.92, { hasParcelId, hasAddress }),
    is_property_specific: hasAddress || hasParcelId,
    description: [
      `Bell County Appraisal District property record — official legal description, improvement schedule, land value, and chain of title.`,
      req.parcel_id ? ` Pre-loaded with Property ID: ${req.parcel_id}.` : '',
      req.address ? ` Pre-loaded with Address: "${req.address}". Click on the matching property.` : '',
      req.owner_name ? ` Also search by Owner Name: "${req.owner_name}".` : '',
      ` The legal description on this record contains the metes-and-bounds calls needed for the survey drawing.`,
    ].join(''),
    has_cost: false,
    metadata: { platform: 'trueautomation', search_address: req.address, search_parcel: req.parcel_id },
  });

  // Bell County Clerk
  results.push({
    id: generateResultId('bell_county_gis', 2),
    source: 'bell_county_gis',
    source_name: 'Bell County Clerk — Real Estate Records',
    title: 'Bell County Clerk — Deed & Plat Records',
    url: 'https://bellcountytx.com/county_clerk/real_estate_records.php',
    document_type: 'deed',
    relevance: scoreRelevance(0.89, { hasAddress }),
    is_property_specific: hasAddress || !!req.owner_name,
    description: [
      `Bell County Clerk real estate records — warranty deeds, plats, easements, and liens.`,
      req.address ? ` Search by property address or grantor/grantee name.` : '',
      req.owner_name ? ` Search by grantor/grantee: "${req.owner_name}".` : '',
      ` Plats show subdivision lot lines, dimensions, bearings, and surveyor certifications.`,
      ` Authoritative source for recorded metes-and-bounds descriptions in Bell County.`,
    ].join(''),
    has_cost: true,
    cost_note: 'Online viewing is free; certified copies are $1/page + $5 certification fee.',
    metadata: { record_type: 'deed_and_plat', county: 'Bell' },
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
    // County is outside our configured service area — point to Texas Comptroller
    const results: PropertySearchResult[] = [];
    if (county) {
      results.push({
        id: generateResultId('county_cad', 0),
        source: 'county_cad',
        source_name: `${county} County Appraisal District`,
        title: `${county} County CAD — Property Search`,
        url: `https://comptroller.texas.gov/taxes/property-tax/county-directory/v/propertytax.comptroller.texas.gov/View.php`,
        document_type: 'appraisal_record',
        relevance: 0.50,
        is_property_specific: false,
        description: `Find the ${county} County Appraisal District website via the Texas Comptroller county directory. Once there, search by address or parcel ID for the legal description and deed references.`,
        has_cost: false,
      });
    }
    return {
      results,
      source: { source: 'county_cad', name: `${county || 'Unknown'} County CAD`, status: results.length > 0 ? 'success' : 'no_results', message: `No direct integration for ${county} County` },
    };
  }

  // Build most targeted URL
  const cadUrl = (cad.platform === 'trueautomation' && cad.trueautoId)
    ? (req.address
      ? `https://propaccess.trueautomation.com/clientdb/?cid=${cad.trueautoId}&saddr=${encodeURIComponent(req.address)}`
      : `https://propaccess.trueautomation.com/clientdb/?cid=${cad.trueautoId}`)
    : cad.searchUrl;

  const results: PropertySearchResult[] = [
    {
      id: generateResultId('county_cad', 0),
      source: 'county_cad',
      source_name: cad.name,
      title: `${county} County CAD — Property Detail`,
      url: cadUrl,
      document_type: 'appraisal_record',
      relevance: scoreRelevance(0.89, { hasParcelId, hasAddress }),
      is_property_specific: hasAddress || hasParcelId,
      description: [
        `Official legal description, improvement data, land value, and ownership history from ${cad.name}.`,
        req.address ? ` Search by address: "${req.address}".` : '',
        req.parcel_id ? ` Or by Property ID: ${req.parcel_id}.` : '',
        req.owner_name ? ` Or by owner name: "${req.owner_name}".` : '',
        ` The legal description here contains the metes-and-bounds calls needed for the survey drawing.`,
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

  const clerkName = clerk?.name || `${county} County Clerk`;
  const clerkUrl = clerk?.url || `https://comptroller.texas.gov/taxes/property-tax/county-directory/`;

  const hasSpecificQuery = hasAddress || !!req.parcel_id || hasOwner;
  const results: PropertySearchResult[] = [];

  // Deed records
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
  const gloGrantUrl = `https://s3.glo.texas.gov/glo/history/archives/land-grants/index.cfm?county=${countyParam}`;

  return {
    results: [
      {
        id: generateResultId('texas_glo', 0),
        source: 'texas_glo',
        source_name: 'Texas General Land Office',
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
      source: { source: 'county_clerk', name: 'TexasFile', status: 'no_results', message: 'County required' },
    };
  }

  const countySlug = county.toLowerCase().replace(/\s+/g, '-');
  const texasFileUrl = `https://www.texasfile.com/texas/${countySlug}-county/deed-records/`;
  const hasSpecificQuery = !!(req.address || req.parcel_id || req.owner_name);

  return {
    results: [
      {
        id: generateResultId('county_clerk', 0),
        source: 'county_clerk',
        source_name: `TexasFile — ${county} County Deed Search`,
        title: `TexasFile Deed Search — ${county} County`,
        url: texasFileUrl,
        document_type: 'deed',
        relevance: scoreRelevance(0.78, { hasAddress: !!req.address }),
        is_property_specific: hasSpecificQuery,
        description: [
          `TexasFile.com — commercial Texas deed search with county clerk record access.`,
          ` ${county} County deed records searchable by grantor, grantee, document type, and date range.`,
          req.owner_name ? ` Search for owner: "${req.owner_name}" as grantor or grantee.` : '',
          ` Quickly trace the chain of title and find deed volume/page references for county clerk lookup.`,
        ].join(''),
        has_cost: true,
        cost_note: 'Basic searches free; full document images may require a TexasFile subscription.',
        metadata: { data_type: 'deed_search', county },
      },
    ],
    source: { source: 'county_clerk', name: `TexasFile — ${county}`, status: 'success' },
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

  const addressParam = encodeURIComponent(req.address);
  const usgsViewerUrl = `https://ngmdb.usgs.gov/topoview/viewer/#14/${addressParam}`;

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
  let matchedKey = '';

  // Only match by explicit city name in address
  for (const [cityKey, cityConf] of Object.entries(TEXAS_CITY_CONFIGS)) {
    if (address.includes(cityKey)) {
      matchedCity = cityConf;
      matchedKey = cityKey;
      break;
    }
  }

  if (!matchedCity) {
    return {
      results: [],
      source: { source: 'city_records', name: 'City Records', status: 'no_results', message: 'No matching city in address' },
    };
  }

  void matchedKey;

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

// ── Rate Limiting & Cache ────────────────────────────────────────────────────

const searchCache = new Map<string, { results: PropertySearchResponse; timestamp: number }>();
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
  // Evict old entries if cache grows too large
  if (searchCache.size > 100) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
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

/**
 * Use AI to normalize the address, identify potential issues, and generate search variants.
 * This runs in parallel with the other searches — failures are non-fatal.
 */
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
      // Don't retry much — this is a non-critical parallel step
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
    // Non-fatal — AI normalization failure should not block the search
    return {};
  }
}

// ── Main Search Function ─────────────────────────────────────────────────────

export async function searchPropertyRecords(
  req: PropertySearchRequest
): Promise<PropertySearchResponse> {
  // Check cache first
  const cached = getCachedResult(req);
  if (cached) return cached;

  const allResults: PropertySearchResult[] = [];
  const sourcesSearched: PropertySearchResponse['sources_searched'] = [];

  // Determine which county to search
  const county = normalizeCounty(req.county || extractCountyFromAddress(req.address));

  // Run AI normalization + all source searches concurrently
  const [normResult, ...providerResults] = await Promise.allSettled([
    normalizeAddressWithAI(req),
    searchBellCountyGIS(req, county),
    searchCountyCAD(req, county),
    searchCountyClerk(req, county),
    searchFEMA(req),
    searchTNRIS(req),
    searchTexasGLO(req, county),
    searchTxDOT(req, county),
    searchUSGS(req),
    searchTexasRRC(req, county),
    searchCityRecords(req, county),
    searchTexasFile(req, county),
  ]);

  // Extract AI normalization data (non-fatal if it failed)
  const normData: AddressNormalization = normResult.status === 'fulfilled' ? normResult.value : {};

  for (const result of providerResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value.results);
      sourcesSearched.push(result.value.source);
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
    // AI normalization results
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

function extractCountyFromAddress(address?: string | null): string {
  if (!address) return '';
  // Check for explicit county name in address
  const match = address.match(/,\s*(\w+)\s+County/i);
  if (match) return match[1];
  // Infer county from common Central Texas cities
  const lc = address.toLowerCase();
  if (/\b(belton|killeen|harker heights|nolanville|rogers|bartlett|troy|temple)\b/.test(lc)) return 'Bell';
  if (/\b(copperas cove|gatesville|oglesby|evant)\b/.test(lc)) return 'Coryell';
  if (/\b(waco|mcgregor|hillsboro|hewitt|woodway|bellmead)\b/.test(lc)) return 'McLennan';
  if (/\b(austin|round rock|pflugerville|manor|del valle)\b/.test(lc)) return 'Travis';
  if (/\b(georgetown|cedar park|leander|taylor|hutto)\b/.test(lc)) return 'Williamson';
  if (/\b(lampasas|kempner|lometa)\b/.test(lc)) return 'Lampasas';
  if (/\b(cameron|rockdale|thorndale)\b/.test(lc)) return 'Milam';
  if (/\b(marlin|lott|rosebud)\b/.test(lc)) return 'Falls';
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

// ── Texas County CAD Lookup URLs ─────────────────────────────────────────────

interface CADConfig {
  name: string;
  searchUrl: string;
  baseUrl: string;
  platform: 'trueautomation' | 'esri' | 'tyler' | 'generic';
  /** TrueAutomation client ID — allows building direct search links */
  trueautoId?: number;
}

const TEXAS_CAD_CONFIGS: Record<string, CADConfig> = {
  bell:       { name: 'Bell County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=14', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation', trueautoId: 14 },
  williamson: { name: 'Williamson County Appraisal District', searchUrl: 'https://search.wcad.org', baseUrl: 'https://search.wcad.org', platform: 'generic' },
  travis:     { name: 'Travis County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=13', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation', trueautoId: 13 },
  mclennan:   { name: 'McLennan County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=25', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation', trueautoId: 25 },
  coryell:    { name: 'Coryell County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=18', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation', trueautoId: 18 },
  lampasas:   { name: 'Lampasas County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=23', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation', trueautoId: 23 },
  milam:      { name: 'Milam County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=26', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation', trueautoId: 26 },
  falls:      { name: 'Falls County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=20', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation', trueautoId: 20 },
};

// ── Bell County GIS (primary source for Bell County jobs) ────────────────────

async function searchBellCountyGIS(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  // Only show Bell County GIS for Bell County or when county is unspecified
  const isBellCounty = !county || county.toLowerCase() === 'bell';

  if (!isBellCounty) {
    return {
      results: [],
      source: { source: 'bell_county_gis', name: 'Bell County GIS', status: 'no_results', message: 'Not applicable for this county' },
    };
  }

  const results: PropertySearchResult[] = [];
  const gisBaseUrl = 'https://gis.co.bell.tx.us/';
  // CAD direct search URL — TrueAutomation supports address/owner search via query string on some deployments
  const cadSearchUrl = req.parcel_id
    ? `https://propaccess.trueautomation.com/clientdb/?cid=14&prop_id=${encodeURIComponent(req.parcel_id)}`
    : req.address
    ? `https://propaccess.trueautomation.com/clientdb/?cid=14&saddr=${encodeURIComponent(req.address)}`
    : 'https://propaccess.trueautomation.com/clientdb/?cid=14';
  const hasSpecificQuery = !!(req.address || req.parcel_id);

  // Bell County GIS Parcel Viewer — the primary tool for property location
  results.push({
    id: generateResultId('bell_county_gis', 0),
    source: 'bell_county_gis',
    source_name: 'Bell County GIS',
    title: 'Bell County GIS Parcel Viewer',
    url: gisBaseUrl,
    document_type: 'plat',
    relevance: 0.97,
    is_property_specific: hasSpecificQuery,
    description: [
      `Bell County GIS portal — the primary source for parcel boundaries, ownership data, and geographic features in Bell County.`,
      req.address ? ` On the GIS viewer, use the search bar to look up: "${req.address}".` : '',
      req.parcel_id ? ` Filter by Property ID: ${req.parcel_id}.` : '',
      ` Click any parcel to see the owner name, legal description, and deed reference.`,
    ].join(''),
    has_cost: false,
    metadata: { search_address: req.address, parcel_id: req.parcel_id, county: 'Bell' },
  });

  // Bell CAD — legal description, improvement schedule, ownership
  results.push({
    id: generateResultId('bell_county_gis', 1),
    source: 'bell_county_gis',
    source_name: 'Bell County Appraisal District (CAD)',
    title: `Appraisal Record — Bell County CAD`,
    url: cadSearchUrl,
    document_type: 'appraisal_record',
    relevance: 0.96,
    is_property_specific: hasSpecificQuery,
    description: [
      `Bell County Appraisal District property record. Contains the official legal description, improvement schedule, land value, and chain of title.`,
      req.address ? ` On the CAD site, search by Address: "${req.address}".` : '',
      req.parcel_id ? ` Or search by Property ID: ${req.parcel_id}.` : '',
      req.owner_name ? ` Or search by Owner Name: "${req.owner_name}".` : '',
      ` The legal description on this record is essential for determining meets-and-bounds data.`,
    ].join(''),
    has_cost: false,
    metadata: { platform: 'trueautomation', search_address: req.address, search_parcel: req.parcel_id },
  });

  // Bell County Clerk — deed history and plats
  results.push({
    id: generateResultId('bell_county_gis', 2),
    source: 'bell_county_gis',
    source_name: 'Bell County Clerk — Real Estate Records',
    title: `Deed & Plat Records — Bell County Clerk`,
    url: 'https://bellcountytx.com/county_clerk/real_estate_records.php',
    document_type: 'deed',
    relevance: 0.93,
    is_property_specific: hasSpecificQuery,
    description: [
      `Bell County Clerk's online real estate records search. Access recorded warranty deeds, plats, easements, and liens.`,
      req.address ? ` Search by property address or grantor/grantee name.` : '',
      ` Plat records here show subdivision lot lines, dimensions, and surveyor certifications.`,
      ` This is the authoritative source for recorded metes-and-bounds deed descriptions in Bell County.`,
    ].join(''),
    has_cost: true,
    cost_note: 'Online viewing is free; certified copies are $1/page + $5 certification fee.',
    metadata: { record_type: 'deed_and_plat', county: 'Bell' },
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
  const countyKey = county.toLowerCase();
  const cad = TEXAS_CAD_CONFIGS[countyKey];

  // Skip Bell County — handled by searchBellCountyGIS above (avoids duplicate results)
  if (countyKey === 'bell') {
    return {
      results: [],
      source: { source: 'county_cad', name: 'Bell County CAD', status: 'success', message: 'Covered by Bell County GIS source' },
    };
  }

  if (!cad) {
    // Generate a generic result pointing to Texas CAD directory
    const results: PropertySearchResult[] = [];

    if (req.address || req.parcel_id || county) {
      results.push({
        id: generateResultId('county_cad', 0),
        source: 'county_cad',
        source_name: county ? `${county} County Appraisal District` : 'Texas County Appraisal District',
        title: `Property Search — ${county || 'Unknown'} County CAD`,
        url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/',
        document_type: 'appraisal_record',
        relevance: 0.55,
        is_property_specific: false,
        description: `Use the Texas Comptroller directory to find the ${county || 'county'} CAD website. Once found, search for the property by address or parcel ID to get the legal description, improvement data, and deed references.`,
        has_cost: false,
      });
    }

    return {
      results,
      source: {
        source: 'county_cad',
        name: county ? `${county} County CAD` : 'County CAD',
        status: county ? 'success' : 'no_results',
        message: county ? `No direct integration for ${county} County — use Texas Comptroller directory` : 'County not specified',
      },
    };
  }

  // We have a configured CAD — generate targeted results
  const results: PropertySearchResult[] = [];
  const hasSpecificQuery = !!(req.address || req.parcel_id || req.owner_name);

  // Build the most targeted URL possible for TrueAutomation platforms
  const cadUrl = (cad.platform === 'trueautomation' && cad.trueautoId)
    ? (req.address
      ? `https://propaccess.trueautomation.com/clientdb/?cid=${cad.trueautoId}&saddr=${encodeURIComponent(req.address)}`
      : `https://propaccess.trueautomation.com/clientdb/?cid=${cad.trueautoId}`)
    : cad.searchUrl;

  // Main property search result
  results.push({
    id: generateResultId('county_cad', 0),
    source: 'county_cad',
    source_name: cad.name,
    title: `Property Detail — ${cad.name}`,
    url: cadUrl,
    document_type: 'appraisal_record',
    relevance: 0.93,
    is_property_specific: hasSpecificQuery,
    description: [
      `Property details including legal description, improvement data, land value, and ownership history from ${cad.name}.`,
      req.address ? ` Search by address: "${req.address}".` : '',
      req.parcel_id ? ` Or by Property ID: ${req.parcel_id}.` : '',
      req.owner_name ? ` Or by owner name: "${req.owner_name}".` : '',
      ` The legal description here will contain the meets-and-bounds calls needed for the survey.`,
    ].join(''),
    has_cost: false,
    metadata: { platform: cad.platform, county, search_address: req.address, search_parcel: req.parcel_id },
  });

  // Ownership history / deed trace
  results.push({
    id: generateResultId('county_cad', 1),
    source: 'county_cad',
    source_name: cad.name,
    title: `Ownership & Deed History — ${county} County CAD`,
    url: cadUrl,
    document_type: 'deed',
    relevance: 0.78,
    is_property_specific: hasSpecificQuery,
    description: `Prior owner history, deed volume/page references, and transfer dates from the appraisal district. Use the deed references to pull the actual deed records from the county clerk.`,
    has_cost: false,
    metadata: { data_type: 'ownership_history', county },
  });

  return {
    results,
    source: { source: 'county_cad', name: cad.name, status: 'success' },
  };
}

// ── County Clerk Records Search ──────────────────────────────────────────────

interface ClerkConfig {
  name: string;
  url: string;
  /** URL supports adding search terms (e.g., OnCore/CSC eRecording portals) */
  searchable_url?: string;
}

const TEXAS_CLERK_CONFIGS: Record<string, ClerkConfig> = {
  bell:       {
    name: 'Bell County Clerk',
    url: 'https://bellcountytx.com/county_clerk/real_estate_records.php',
    searchable_url: 'https://bellcountytx.com/county_clerk/real_estate_records.php',
  },
  williamson: {
    name: 'Williamson County Clerk',
    url: 'https://judicialrecords.wilco.org/PublicAccess/default.aspx',
  },
  travis:     {
    name: 'Travis County Clerk',
    url: 'https://countyclerk.traviscountytx.gov/recording/real-property-records.html',
  },
  mclennan:   {
    name: 'McLennan County Clerk',
    url: 'https://co.mclennan.tx.us/123/County-Clerk',
  },
  coryell:    {
    name: 'Coryell County Clerk',
    url: 'https://www.coryellcounty.org/page/coryell.County.Clerk',
  },
  lampasas:   {
    name: 'Lampasas County Clerk',
    url: 'https://www.co.lampasas.tx.us/departments/county-clerk/',
  },
  milam:      {
    name: 'Milam County Clerk',
    url: 'https://www.co.milam.tx.us/department/?fdd=65',
  },
  falls:      {
    name: 'Falls County Clerk',
    url: 'https://www.co.falls.tx.us/',
  },
};

async function searchCountyClerk(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  const countyKey = county.toLowerCase();
  const clerk = TEXAS_CLERK_CONFIGS[countyKey];

  if (!clerk && !county) {
    return {
      results: [],
      source: { source: 'county_clerk', name: 'County Clerk', status: 'no_results', message: 'County not specified' },
    };
  }

  const clerkName = clerk?.name || `${county} County Clerk`;
  const clerkUrl = clerk?.url || `https://www.google.com/search?q=${encodeURIComponent(`${county} county texas clerk real property records deed search`)}`;
  const hasSpecificQuery = !!(req.address || req.parcel_id || req.owner_name);

  const results: PropertySearchResult[] = [];

  // Deed records — primary source for metes-and-bounds descriptions
  results.push({
    id: generateResultId('county_clerk', 0),
    source: 'county_clerk',
    source_name: clerkName,
    title: `Deed Records — ${county} County Clerk`,
    url: clerkUrl,
    document_type: 'deed',
    relevance: 0.91,
    is_property_specific: hasSpecificQuery,
    description: [
      `${clerkName} real estate records — the authoritative source for warranty deeds, special warranty deeds, and quit claim deeds.`,
      ` Deed documents contain the full metes-and-bounds legal description, grantor/grantee information, and recording data.`,
      req.owner_name ? ` Search by grantor/grantee: "${req.owner_name}".` : '',
      req.address ? ` The deed for ${req.address} should appear under the property's grantor or grantee name.` : '',
      ` Look for the most recent deed first, then trace back through the chain of title for historical boundary data.`,
    ].join(''),
    has_cost: true,
    cost_note: 'Online viewing may be free; certified copies typically $1/page + $5 certification fee.',
    metadata: { record_type: 'deed', county },
  });

  // Plat records
  results.push({
    id: generateResultId('county_clerk', 1),
    source: 'county_clerk',
    source_name: clerkName,
    title: `Plat Records — ${county} County Clerk`,
    url: clerkUrl,
    document_type: 'subdivision_plat',
    relevance: 0.89,
    is_property_specific: hasSpecificQuery,
    description: [
      `Recorded subdivision plats, amended plats, and replats on file with the ${clerkName}.`,
      ` Plats show lot lines, block numbers, lot dimensions, bearings, distances, and surveyor certifications.`,
      ` Essential for confirming lot/block boundaries and establishing the subdivision's control network.`,
      req.address ? ` If the property is in a platted subdivision, search for the subdivision name in the plat index.` : '',
    ].join(''),
    has_cost: true,
    cost_note: 'Certified copies typically $1/page + $5 certification fee.',
    metadata: { record_type: 'plat', county },
  });

  // Easement & ROW records
  results.push({
    id: generateResultId('county_clerk', 2),
    source: 'county_clerk',
    source_name: clerkName,
    title: `Easement & ROW Records — ${county} County Clerk`,
    url: clerkUrl,
    document_type: 'easement',
    relevance: 0.79,
    is_property_specific: false,
    description: `Recorded easements including utility corridors, drainage easements, access easements, and public right-of-way dedications. Search by grantee (utility company or governmental entity) or the property's grantor name.`,
    has_cost: true,
    cost_note: 'Per-page fees may apply for copies.',
    metadata: { record_type: 'easement', county },
  });

  return {
    results,
    source: {
      source: 'county_clerk',
      name: clerkName,
      status: 'success',
      message: !clerk ? `No direct integration — link provided for ${county} County` : undefined,
    },
  };
}

// ── Texas General Land Office — Original Survey Abstracts ───────────────────

async function searchTexasGLO(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  const results: PropertySearchResult[] = [];
  const countyParam = county ? encodeURIComponent(county) : '';

  // GLO Land Grant Records — original survey field notes and patent data
  const gloGrantUrl = county
    ? `https://s3.glo.texas.gov/glo/history/archives/land-grants/index.cfm?county=${countyParam}`
    : 'https://www.glo.texas.gov/history/archives/land-grants/';

  results.push({
    id: generateResultId('texas_glo', 0),
    source: 'texas_glo',
    source_name: 'Texas General Land Office',
    title: `Original Land Grant & Survey Records${county ? ` — ${county} County` : ''}`,
    url: gloGrantUrl,
    document_type: 'survey',
    relevance: 0.85,
    is_property_specific: !!county,
    description: [
      `Texas GLO archives contain the original land grants, patent records, and survey field notes for Texas.`,
      county ? ` Filter by ${county} County to find the original abstract survey that established this parcel.` : '',
      ` Abstract surveys include original bearing calls, distances, and landmark references (trees, rocks, creeks).`,
      ` The abstract number (e.g., A-123) ties all records for a tract together across all government agencies.`,
    ].join(''),
    has_cost: false,
    metadata: { data_type: 'land_grants', county },
  });

  // GLO GIS viewer — spatial data for original surveys
  const gloGisUrl = 'https://maps.glo.texas.gov/viewer/';
  results.push({
    id: generateResultId('texas_glo', 1),
    source: 'texas_glo',
    source_name: 'Texas GLO GIS Viewer',
    title: `GLO GIS Map Viewer — Abstract Surveys`,
    url: gloGisUrl,
    document_type: 'plat',
    relevance: 0.75,
    is_property_specific: false,
    description: `Interactive map showing original Texas survey abstracts, grants, and patents. Overlay parcel lines against original survey boundaries to identify discrepancies between the abstract survey and current deeds.`,
    has_cost: false,
    metadata: { data_type: 'glo_gis' },
  });

  return {
    results,
    source: { source: 'texas_glo', name: 'Texas General Land Office', status: 'success' },
  };
}

// ── TxDOT Right-of-Way Maps ──────────────────────────────────────────────────

async function searchTxDOT(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  const results: PropertySearchResult[] = [];

  // TxDOT District 9 (Waco) covers Bell, Coryell, McLennan, Falls, Lampasas, Milam counties
  const centralTxCounties = ['bell', 'coryell', 'mclennan', 'falls', 'lampasas', 'milam'];
  const isCentralTx = !county || centralTxCounties.includes(county.toLowerCase());
  const districtUrl = isCentralTx
    ? 'https://www.txdot.gov/inside-txdot/forms-publications/right-of-way-maps.html'
    : 'https://www.txdot.gov/inside-txdot/forms-publications/right-of-way-maps.html';

  results.push({
    id: generateResultId('txdot', 0),
    source: 'txdot',
    source_name: 'TxDOT Right-of-Way Division',
    title: `TxDOT ROW Maps${county ? ` — ${county} County` : ''}`,
    url: districtUrl,
    document_type: 'other',
    relevance: 0.72,
    is_property_specific: !!(req.address),
    description: [
      `TxDOT right-of-way maps show the existing and proposed highway ROW widths, taking lines, and control-of-access lines.`,
      county ? ` ${county} County is in TxDOT District ${isCentralTx ? '9 (Waco)' : '—'}.` : '',
      ` Essential for properties adjacent to state highways, FM roads, or US highways.`,
      ` ROW maps define the boundary between the public ROW and private property.`,
    ].join(''),
    has_cost: false,
    metadata: { data_type: 'row_maps', county, district: isCentralTx ? 9 : null },
  });

  // TxDOT ROW information system (ROWIS) — parcel-level data
  results.push({
    id: generateResultId('txdot', 1),
    source: 'txdot',
    source_name: 'TxDOT ROWIS',
    title: `TxDOT ROW Information System`,
    url: 'https://rowis.txdot.gov/',
    document_type: 'other',
    relevance: 0.65,
    is_property_specific: false,
    description: `TxDOT's Right-of-Way Information System contains parcel-level acquisition records, deed descriptions, and takings data for state highway projects. Useful for determining what land was acquired for highway construction adjacent to a property.`,
    has_cost: false,
    metadata: { data_type: 'rowis' },
  });

  return {
    results,
    source: { source: 'txdot', name: 'TxDOT Right-of-Way', status: 'success' },
  };
}

// ── USGS National Map ────────────────────────────────────────────────────────

async function searchUSGS(req: PropertySearchRequest): Promise<ProviderResult> {
  const results: PropertySearchResult[] = [];
  const addressParam = req.address ? encodeURIComponent(req.address) : '';

  // USGS National Map Viewer — topo maps and high-res imagery
  const usgsViewerUrl = addressParam
    ? `https://apps.nationalmap.gov/viewer/viewerApp/component/viewer?searchFilter=${addressParam}`
    : 'https://apps.nationalmap.gov/viewer/';

  results.push({
    id: generateResultId('usgs', 0),
    source: 'usgs',
    source_name: 'USGS National Map',
    title: `USGS Topo Map & Imagery${req.address ? ` — ${req.address}` : ''}`,
    url: usgsViewerUrl,
    document_type: 'topo_map',
    relevance: 0.68,
    is_property_specific: !!req.address,
    description: [
      `USGS National Map provides current and historical topographic maps, aerial imagery, and elevation data.`,
      req.address ? ` Search pre-loaded with address: "${req.address}".` : '',
      ` Historical topo maps (1930s–present) show older fence lines, roads, and landmarks useful for boundary tracing.`,
      ` Use the "Historical Topographic Map Explorer" for vintage maps that may show original survey monuments.`,
    ].join(''),
    has_cost: false,
    metadata: { data_type: 'topo_imagery', search_address: req.address },
  });

  // USGS Historical Topo Maps
  results.push({
    id: generateResultId('usgs', 1),
    source: 'usgs',
    source_name: 'USGS TopoView',
    title: `Historical Topographic Maps`,
    url: req.address
      ? `https://ngmdb.usgs.gov/topoview/viewer/#14/${addressParam}`
      : 'https://ngmdb.usgs.gov/topoview/',
    document_type: 'topo_map',
    relevance: 0.60,
    is_property_specific: !!req.address,
    description: `USGS TopoView provides access to all historical US topo maps. Historical maps (7.5-minute quadrangles) can show original fence lines, roads, watercourses, and landmarks that are referenced in older deed calls.`,
    has_cost: false,
    metadata: { data_type: 'historical_topo' },
  });

  return {
    results,
    source: { source: 'usgs', name: 'USGS National Map', status: 'success' },
  };
}

// ── Texas Railroad Commission ────────────────────────────────────────────────

async function searchTexasRRC(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  const results: PropertySearchResult[] = [];
  const countyParam = county ? encodeURIComponent(county.toUpperCase()) : '';

  // RRC GIS viewer — oil/gas wells, pipelines, and leases
  const rrcGisUrl = county
    ? `https://gis.rrc.texas.gov/GISViewer/?county=${countyParam}`
    : 'https://gis.rrc.texas.gov/GISViewer/';

  results.push({
    id: generateResultId('texas_rrc', 0),
    source: 'texas_rrc',
    source_name: 'Texas Railroad Commission',
    title: `Oil & Gas Locations${county ? ` — ${county} County` : ''}`,
    url: rrcGisUrl,
    document_type: 'other',
    relevance: 0.58,
    is_property_specific: !!county,
    description: [
      `Texas Railroad Commission GIS viewer shows oil/gas well locations, pipeline routes, and mineral lease boundaries.`,
      county ? ` Filtered to ${county} County.` : '',
      ` Relevant for properties where mineral rights or pipeline easements may affect the survey.`,
      ` Pipeline easements and surface use agreements are often recorded in the county clerk's records.`,
    ].join(''),
    has_cost: false,
    metadata: { data_type: 'oil_gas_gis', county },
  });

  return {
    results,
    source: { source: 'texas_rrc', name: 'Texas Railroad Commission', status: 'success' },
  };
}

// ── City Records (permits and plats) ─────────────────────────────────────────

interface CityConfig {
  name: string;
  url: string;
  county: string;
}

const TEXAS_CITY_CONFIGS: Record<string, CityConfig> = {
  belton:         { name: 'City of Belton GIS & Development',    url: 'https://www.belton.org/220/Planning-Development-Services', county: 'bell' },
  killeen:        { name: 'City of Killeen Development Services', url: 'https://www.killeentexas.gov/222/Building-Inspections-Permits',  county: 'bell' },
  temple:         { name: 'City of Temple GIS',                  url: 'https://www.templetx.gov/547/GIS-Services',                county: 'bell' },
  'harker heights': { name: 'City of Harker Heights',            url: 'https://www.hhtx.com/',                                   county: 'bell' },
  nolanville:     { name: 'City of Nolanville',                  url: 'https://www.nolanville.org/',                              county: 'bell' },
  gatesville:     { name: 'City of Gatesville',                  url: 'https://www.gatesvilletx.com/',                            county: 'coryell' },
  waco:           { name: 'City of Waco GIS',                    url: 'https://www.waco-texas.com/cc_content.asp?cid=9988',        county: 'mclennan' },
};

async function searchCityRecords(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  // Attempt to identify the city from the address
  const address = (req.address || '').toLowerCase();
  let matchedCity: CityConfig | null = null;

  for (const [cityKey, cityConf] of Object.entries(TEXAS_CITY_CONFIGS)) {
    // Match if address contains the city name OR if the county matches
    if (address.includes(cityKey) || (county && county.toLowerCase() === cityConf.county)) {
      matchedCity = cityConf;
      break;
    }
  }

  if (!matchedCity) {
    return {
      results: [],
      source: { source: 'city_records', name: 'City Records', status: 'no_results', message: 'No matching city found for this address' },
    };
  }

  const results: PropertySearchResult[] = [];
  const hasSpecificQuery = !!(req.address || req.parcel_id);

  results.push({
    id: generateResultId('city_records', 0),
    source: 'city_records',
    source_name: matchedCity.name,
    title: `City Plats & Permits — ${matchedCity.name}`,
    url: matchedCity.url,
    document_type: 'subdivision_plat',
    relevance: 0.70,
    is_property_specific: hasSpecificQuery,
    description: [
      `${matchedCity.name} development records, approved plats, and building permits.`,
      ` City plats may contain lot dimensions, building setback lines, and utility easement locations not in the county records.`,
      req.address ? ` Search for plans or permits associated with: ${req.address}.` : '',
      ` Approved plats here are filed with the county clerk but city records may contain the original engineer's drawing with more detail.`,
    ].join(''),
    has_cost: false,
    metadata: { data_type: 'city_plats', city: matchedCity.name, county },
  });

  return {
    results,
    source: { source: 'city_records', name: matchedCity.name, status: 'success' },
  };
}

// ── TexasFile Deed Search ────────────────────────────────────────────────────

async function searchTexasFile(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  const countySlug = county ? county.toLowerCase().replace(/\s+/g, '-') : '';
  const texasFileUrl = countySlug
    ? `https://www.texasfile.com/texas/${countySlug}-county/deed-records/`
    : 'https://www.texasfile.com/texas/';

  const results: PropertySearchResult[] = [];
  const hasSpecificQuery = !!(req.address || req.parcel_id || req.owner_name);

  results.push({
    id: generateResultId('county_clerk', 0),
    source: 'county_clerk',
    source_name: `TexasFile — ${county || 'Texas'} County Deed Search`,
    title: `Deed Search via TexasFile${county ? ` — ${county} County` : ''}`,
    url: texasFileUrl,
    document_type: 'deed',
    relevance: 0.82,
    is_property_specific: hasSpecificQuery,
    description: [
      `TexasFile.com is a commercial Texas deed search service with access to county clerk records.`,
      county ? ` ${county} County deed records are searchable by grantor, grantee, document type, and date range.` : '',
      req.owner_name ? ` Search for owner name: "${req.owner_name}" as grantor or grantee.` : '',
      ` Useful for quickly tracing the chain of title and finding deed volume/page references.`,
      ` Some searches require a subscription but basic deed lookups may be free.`,
    ].join(''),
    has_cost: true,
    cost_note: 'Basic searches free; full document images may require a TexasFile subscription.',
    metadata: { data_type: 'deed_search', county },
  });

  return {
    results,
    source: { source: 'county_clerk', name: `TexasFile — ${county || 'Texas'}`, status: 'success' },
  };
}

// ── FEMA Flood Zone Search ───────────────────────────────────────────────────

async function searchFEMA(req: PropertySearchRequest): Promise<ProviderResult> {
  if (!req.address) {
    return {
      results: [],
      source: { source: 'fema', name: 'FEMA Flood Map Service', status: 'no_results', message: 'Address required for flood zone lookup' },
    };
  }

  const results: PropertySearchResult[] = [];
  const femaSearchUrl = `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(req.address)}`;

  results.push({
    id: generateResultId('fema', 0),
    source: 'fema',
    source_name: 'FEMA Flood Map Service Center',
    title: `FEMA Flood Zone — ${req.address}`,
    url: femaSearchUrl,
    document_type: 'other',
    relevance: 0.80,
    is_property_specific: true,
    description: `Flood zone designation, FIRM panel number, and Base Flood Elevation (BFE) for this address. Pre-filled with: "${req.address}". Determines if the property is in a Special Flood Hazard Area (SFHA Zone A or AE) which affects surveying and construction requirements.`,
    has_cost: false,
    metadata: { data_type: 'flood_zone', search_address: req.address },
  });

  return {
    results,
    source: { source: 'fema', name: 'FEMA Flood Map Service', status: 'success' },
  };
}

// ── TNRIS (Texas Natural Resources Information System) ────────────────────────

async function searchTNRIS(req: PropertySearchRequest): Promise<ProviderResult> {
  if (!req.address && !req.county) {
    return {
      results: [],
      source: { source: 'tnris', name: 'TNRIS', status: 'no_results', message: 'Address or county required' },
    };
  }

  const results: PropertySearchResult[] = [];
  const county = normalizeCounty(req.county || extractCountyFromAddress(req.address));

  // TNRIS DataHub — aerial imagery, LiDAR, and parcel data
  results.push({
    id: generateResultId('tnris', 0),
    source: 'tnris',
    source_name: 'Texas Natural Resources Information System',
    title: `Aerial Imagery & LiDAR — ${county || 'Texas'}`,
    url: 'https://data.tnris.org/',
    document_type: 'aerial_photo',
    relevance: 0.68,
    is_property_specific: !!county,
    description: [
      `TNRIS DataHub provides high-resolution aerial imagery, historical aerials, and LiDAR elevation data for Texas.`,
      county ? ` Filter by ${county} County.` : '',
      ` Historical aerials can show fence lines, improvements, and landmarks from past decades.`,
      ` LiDAR data provides precise elevation for drainage analysis, flood determinations, and boundary monument searching.`,
    ].join(''),
    has_cost: false,
    metadata: { data_type: 'aerial_imagery', county },
  });

  // TNRIS Parcel GIS
  results.push({
    id: generateResultId('tnris', 1),
    source: 'tnris',
    source_name: 'TNRIS — Texas Parcels GIS Layer',
    title: `Land Parcels GIS Layer — ${county || 'Texas'}`,
    url: 'https://data.tnris.org/',
    document_type: 'other',
    relevance: 0.55,
    is_property_specific: !!county,
    description: `Statewide GIS parcel boundary dataset compiled from county appraisal districts. Useful for quickly locating the parcel footprint and confirming neighbors. Download as shapefile or GeoJSON.`,
    has_cost: false,
    metadata: { data_type: 'gis_parcels', county },
  });

  return {
    results,
    source: { source: 'tnris', name: 'TNRIS', status: 'success' },
  };
}
