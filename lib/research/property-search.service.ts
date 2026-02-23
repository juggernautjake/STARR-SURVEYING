// lib/research/property-search.service.ts — Property search & document discovery
// Searches Texas public record sources for property-related documents.
// Includes AI-driven address normalization and variant generation.
import type {
  PropertySearchRequest,
  PropertySearchResult,
  PropertySearchResponse,
  SearchSource,
  DocumentType,
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
