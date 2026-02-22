// lib/research/property-search.service.ts — Property search & document discovery
// Searches Texas public record sources for property-related documents.
import type {
  PropertySearchRequest,
  PropertySearchResult,
  PropertySearchResponse,
  SearchSource,
  DocumentType,
} from '@/types/research';

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

  // Run all source searches concurrently
  const searches = [
    searchCountyCAD(req, county),
    searchFEMA(req),
    searchCountyClerk(req, county),
    searchTNRIS(req),
  ];

  const results = await Promise.allSettled(searches);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value.results);
      sourcesSearched.push(result.value.source);
    } else {
      // Fulfilled but with error info will still appear in sources_searched
      console.error('[Property Search] Provider error:', result.reason);
    }
  }

  // Sort by relevance (highest first)
  allResults.sort((a, b) => b.relevance - a.relevance);

  const response: PropertySearchResponse = {
    results: allResults,
    sources_searched: sourcesSearched,
    total: allResults.length,
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
  // Check for common Texas county patterns in address
  const match = address.match(/,\s*(\w+)\s+County/i);
  return match?.[1] || '';
}

function generateResultId(source: SearchSource, index: number): string {
  return `${source}-${Date.now()}-${index}`;
}

// ── Texas County CAD Lookup URLs ─────────────────────────────────────────────

interface CADConfig {
  name: string;
  searchUrl: string;
  baseUrl: string;
  platform: 'trueautomation' | 'esri' | 'tyler' | 'generic';
}

const TEXAS_CAD_CONFIGS: Record<string, CADConfig> = {
  bell:       { name: 'Bell County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=14', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation' },
  williamson: { name: 'Williamson County Appraisal District', searchUrl: 'https://search.wcad.org', baseUrl: 'https://search.wcad.org', platform: 'generic' },
  travis:     { name: 'Travis County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=13', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation' },
  mclennan:   { name: 'McLennan County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=25', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation' },
  coryell:    { name: 'Coryell County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=18', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation' },
  lampasas:   { name: 'Lampasas County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=23', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation' },
  milam:      { name: 'Milam County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=26', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation' },
  falls:      { name: 'Falls County Appraisal District', searchUrl: 'https://propaccess.trueautomation.com/clientdb/?cid=20', baseUrl: 'https://propaccess.trueautomation.com', platform: 'trueautomation' },
};

// ── County Appraisal District Search ─────────────────────────────────────────

interface ProviderResult {
  results: PropertySearchResult[];
  source: PropertySearchResponse['sources_searched'][0];
}

async function searchCountyCAD(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  const countyKey = county.toLowerCase();
  const cad = TEXAS_CAD_CONFIGS[countyKey];

  if (!cad) {
    // Generate a generic result pointing to Texas CAD search
    const results: PropertySearchResult[] = [];

    if (req.address || req.parcel_id) {
      results.push({
        id: generateResultId('county_cad', 0),
        source: 'county_cad',
        source_name: county ? `${county} County Appraisal District` : 'Texas County Appraisal District',
        title: `Property Search — ${county || 'Unknown'} County CAD`,
        url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/',
        document_type: 'appraisal_record',
        relevance: 0.6,
        description: `Search the ${county || 'county'} appraisal district for property details, legal description, and improvement data. Use the Texas Comptroller directory to find the correct CAD website.`,
        has_cost: false,
      });
    }

    return {
      results,
      source: {
        source: 'county_cad',
        name: county ? `${county} County CAD` : 'County CAD',
        status: county ? 'success' : 'no_results',
        message: county ? `No direct integration for ${county} County — generic link provided` : 'County not specified',
      },
    };
  }

  // We have a configured CAD — generate targeted results
  const results: PropertySearchResult[] = [];

  // Main property search result
  results.push({
    id: generateResultId('county_cad', 0),
    source: 'county_cad',
    source_name: cad.name,
    title: `Property Detail — ${cad.name}`,
    url: cad.searchUrl,
    document_type: 'appraisal_record',
    relevance: 0.95,
    description: `Property details including legal description, improvement data, land value, and ownership history from ${cad.name}.${req.address ? ` Search for: ${req.address}` : ''}${req.parcel_id ? ` Parcel ID: ${req.parcel_id}` : ''}`,
    has_cost: false,
    metadata: {
      platform: cad.platform,
      county: county,
      search_address: req.address,
      search_parcel: req.parcel_id,
    },
  });

  // Parcel map result
  results.push({
    id: generateResultId('county_cad', 1),
    source: 'county_cad',
    source_name: cad.name,
    title: `Parcel Map — ${county} County`,
    url: cad.searchUrl,
    document_type: 'plat',
    relevance: 0.85,
    description: `Parcel boundary map and GIS data for the property. View adjoining parcels, lot dimensions, and subdivision layout.`,
    has_cost: false,
    metadata: { data_type: 'parcel_map', county },
  });

  // Ownership history
  results.push({
    id: generateResultId('county_cad', 2),
    source: 'county_cad',
    source_name: cad.name,
    title: `Ownership History — ${county} County`,
    url: cad.searchUrl,
    document_type: 'deed',
    relevance: 0.75,
    description: `Previous owners, deed references, and transfer history from the appraisal district records.`,
    has_cost: false,
    metadata: { data_type: 'ownership_history', county },
  });

  return {
    results,
    source: { source: 'county_cad', name: cad.name, status: 'success' },
  };
}

// ── County Clerk Records Search ──────────────────────────────────────────────

const TEXAS_CLERK_URLS: Record<string, { name: string; url: string }> = {
  bell:       { name: 'Bell County Clerk', url: 'https://bellcountytx.com/county_clerk/real_estate_records.php' },
  williamson: { name: 'Williamson County Clerk', url: 'https://judicialrecords.wilco.org/PublicAccess/default.aspx' },
  travis:     { name: 'Travis County Clerk', url: 'https://countyclerk.traviscountytx.gov/recording/real-property-records.html' },
  mclennan:   { name: 'McLennan County Clerk', url: 'https://co.mclennan.tx.us/123/County-Clerk' },
  coryell:    { name: 'Coryell County Clerk', url: 'https://www.coryellcounty.org/page/coryell.County.Clerk' },
};

async function searchCountyClerk(
  req: PropertySearchRequest,
  county: string
): Promise<ProviderResult> {
  const countyKey = county.toLowerCase();
  const clerk = TEXAS_CLERK_URLS[countyKey];

  if (!clerk && !county) {
    return {
      results: [],
      source: { source: 'county_clerk', name: 'County Clerk', status: 'no_results', message: 'County not specified' },
    };
  }

  const clerkName = clerk?.name || `${county} County Clerk`;
  const clerkUrl = clerk?.url || `https://www.google.com/search?q=${encodeURIComponent(`${county} county texas clerk real property records`)}`;

  const results: PropertySearchResult[] = [];

  // Deed records
  results.push({
    id: generateResultId('county_clerk', 0),
    source: 'county_clerk',
    source_name: clerkName,
    title: `Deed Records — ${county} County Clerk`,
    url: clerkUrl,
    document_type: 'deed',
    relevance: 0.90,
    description: `Warranty deeds, special warranty deeds, and quit claim deeds. Includes grantor/grantee, legal description, recording information.`,
    has_cost: true,
    cost_note: 'County clerk may charge per-page fees for certified copies. Online viewing may be free.',
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
    relevance: 0.88,
    description: `Recorded subdivision plats, amended plats, and replats. Essential for lot/block references and subdivision layouts.`,
    has_cost: true,
    cost_note: 'Certified copies typically $1/page + $5 certification fee.',
    metadata: { record_type: 'plat', county },
  });

  // Easement records
  results.push({
    id: generateResultId('county_clerk', 2),
    source: 'county_clerk',
    source_name: clerkName,
    title: `Easement Records — ${county} County Clerk`,
    url: clerkUrl,
    document_type: 'easement',
    relevance: 0.78,
    description: `Recorded easements including utility, drainage, access, and conservation easements affecting the property.`,
    has_cost: true,
    cost_note: 'Per-page fees may apply for copies.',
    metadata: { record_type: 'easement', county },
  });

  // Restrictive covenants
  results.push({
    id: generateResultId('county_clerk', 3),
    source: 'county_clerk',
    source_name: clerkName,
    title: `Restrictive Covenants — ${county} County Clerk`,
    url: clerkUrl,
    document_type: 'restrictive_covenant',
    relevance: 0.65,
    description: `Deed restrictions, covenants, conditions, and restrictions (CC&Rs) for subdivisions and developments.`,
    has_cost: true,
    cost_note: 'Per-page fees may apply.',
    metadata: { record_type: 'restrictive_covenant', county },
  });

  return {
    results,
    source: {
      source: 'county_clerk',
      name: clerkName,
      status: 'success',
      message: !clerk ? `No direct integration — search link provided for ${county} County` : undefined,
    },
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

  // FEMA Flood Map Service Center
  const femaSearchUrl = `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(req.address)}`;

  results.push({
    id: generateResultId('fema', 0),
    source: 'fema',
    source_name: 'FEMA Flood Map Service Center',
    title: 'FEMA Flood Zone Determination',
    url: femaSearchUrl,
    document_type: 'other',
    relevance: 0.82,
    description: `Flood zone designation, FIRM panel number, and flood insurance rate map for the property. Determines if the property is in a Special Flood Hazard Area (SFHA).`,
    has_cost: false,
    metadata: {
      data_type: 'flood_zone',
      search_address: req.address,
    },
  });

  // FEMA National Flood Hazard Layer
  const nfhlUrl = `https://hazards-fema.maps.arcgis.com/apps/webappviewer/index.html?id=8b0adb51996444d4879338b5529aa9cd`;

  results.push({
    id: generateResultId('fema', 1),
    source: 'fema',
    source_name: 'FEMA National Flood Hazard Layer',
    title: 'Interactive Flood Map Viewer',
    url: nfhlUrl,
    document_type: 'other',
    relevance: 0.72,
    description: `Interactive map viewer showing flood hazard areas, base flood elevations, and floodway boundaries. Use the search bar to locate the property.`,
    has_cost: false,
    metadata: { data_type: 'nfhl_viewer' },
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

  // TNRIS DataHub for aerial imagery
  results.push({
    id: generateResultId('tnris', 0),
    source: 'tnris',
    source_name: 'Texas Natural Resources Information System',
    title: `Aerial Imagery — ${county || 'Texas'}`,
    url: `https://data.tnris.org/`,
    document_type: 'aerial_photo',
    relevance: 0.70,
    description: `High-resolution aerial/satellite imagery and historical aerials. Multiple vintages available for comparison. Free download from TNRIS DataHub.`,
    has_cost: false,
    metadata: { data_type: 'aerial_imagery', county },
  });

  // TNRIS topographic data
  results.push({
    id: generateResultId('tnris', 1),
    source: 'tnris',
    source_name: 'Texas Natural Resources Information System',
    title: `Topographic Data — ${county || 'Texas'}`,
    url: 'https://data.tnris.org/',
    document_type: 'topo_map',
    relevance: 0.60,
    description: `LiDAR elevation data, contour maps, and digital elevation models. Useful for drainage analysis and site planning.`,
    has_cost: false,
    metadata: { data_type: 'topographic', county },
  });

  // Texas Geographic Information Office GIS data
  results.push({
    id: generateResultId('tnris', 2),
    source: 'tnris',
    source_name: 'Texas Natural Resources Information System',
    title: `Land Parcels GIS Layer — ${county || 'Texas'}`,
    url: 'https://data.tnris.org/',
    document_type: 'other',
    relevance: 0.55,
    description: `GIS parcel boundary data, land use classifications, and geographic features. Available as shapefiles and GeoJSON.`,
    has_cost: false,
    metadata: { data_type: 'gis_parcels', county },
  });

  return {
    results,
    source: { source: 'tnris', name: 'TNRIS', status: 'success' },
  };
}
