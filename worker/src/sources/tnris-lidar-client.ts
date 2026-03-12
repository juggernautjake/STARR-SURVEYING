// worker/src/sources/tnris-lidar-client.ts
// Texas Natural Resources Information System (TNRIS) / TxGIO LiDAR & imagery client.
//
// Note: TNRIS was renamed to Texas Geographic Information Office (TxGIO) in 2023.
// Domain (api.tnris.org) unchanged.
//
// Two distinct API modes are supported:
//
//   1. LiDAR-specific endpoints (authenticated via TNRIS_API_KEY):
//      - /resources/?lat=&lon=&radius=  — collections near a point
//      - /catalog/?lat=&lon=            — elevation statistics
//
//   2. Open TxGIO Resources API (no auth required):
//      - /resources?limit=1000&offset=0 — paginated catalog of ALL resources
//        (345,505 confirmed live as of March 2026)
//      Filter locally by area_type_name and resource_type_abbreviation.
//      Bell County FIPS: 48027 — use area_type_name === "Bell".

export interface LiDARCollection {
  collectionId: string;
  name: string;
  acquisitionDate: string;
  resolution_ft: number;
  coverageBbox: [number, number, number, number];
  dataFormat: 'LAS' | 'LAZ' | 'DEM';
  downloadUrl?: string;
  thumbnailUrl?: string;
  county: string;
  countyFIPS: string;
}

export interface LiDARPointStats {
  minElevation_ft: number;
  maxElevation_ft: number;
  meanElevation_ft: number;
  slopePercent: number;
  hasFloodplain: boolean;
  drainageDirection?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
}

export interface LiDARResult {
  lat: number;
  lon: number;
  radiusM: number;
  collections: LiDARCollection[];
  bestCollection: LiDARCollection | null;
  pointStats: LiDARPointStats | null;
  dataAvailable: boolean;
  fetchedAt: string;
}

// ── TxGIO Open Resources API types ───────────────────────────────────────────
// Returned by GET /api/v1/resources (no auth required)
// Documented in the STARR Bell County Intelligence Report (March 2026)

/**
 * Resource type abbreviations from the TxGIO open resources API.
 * Common types used in Bell County research:
 *   NC-CCM   — Natural Color Compressed County Mosaic (full county aerial)
 *   CIR-CCM  — Color-Infrared County Mosaic
 *   NCCIR-DOQQ — NC/CIR Digital Ortho Quarter Quad (parcel-level tiles)
 *   LPC      — Compressed LiDAR Point Cloud (elevation, tree heights)
 *   DEM      — Digital Elevation Model (flood analysis, topo)
 *   HYPSO    — Hypsography (contour lines)
 *   LP       — Land Parcel (StratMap statewide parcel dataset)
 *   AP       — Address Point (geocoding verification)
 */
export type TxGIOResourceType =
  | 'NC-CCM' | 'CIR-CCM' | 'NCCIR-DOQQ'
  | 'LPC' | 'DEM' | 'HYPSO'
  | 'LP' | 'AP'
  | string;  // allow unknown types from future API additions

/** A single resource record from the TxGIO /resources endpoint */
export interface TxGIOResource {
  resourceId: string;
  /** Direct download URL (S3 ZIP file) */
  resourceUrl: string;
  fileSizeBytes: number | null;
  areaTypeId: string;
  /** County name (e.g., "Bell") or city/watershed name */
  areaTypeName: string;
  collectionId: string;
  /** Human-readable name (e.g., "NC Compressed County Mosaic") */
  resourceTypeName: string;
  /** Short abbreviation (e.g., "NC-CCM") */
  resourceTypeAbbreviation: TxGIOResourceType;
  /** Geographic granularity: "county" | "quad" | "city" | etc. */
  areaType: string;
}

/** Result from `fetchCountyResources()` */
export interface TxGIOCountyResourcesResult {
  countyName: string;
  resources: TxGIOResource[];
  /** Total count from API (may exceed results if pageLimitHit) */
  totalAvailable: number;
  /** Whether pagination was cut off (more resources exist than we fetched) */
  pageLimitHit: boolean;
  fetchedAt: string;
  error?: string;
}

export class TNRISLiDARClient {
  private apiKey: string | null;
  private baseUrl = 'https://api.tnris.org/api/v1';
  private retryCount = 3;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.TNRIS_API_KEY ?? null;
  }

  /**
   * True when an API key is configured for authenticated LiDAR endpoints.
   * Note: The open TxGIO Resources API (fetchCountyResources / fetchBellCountyAerialImagery)
   * does NOT require an API key and is always available.
   */
  get isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  // ── Authenticated LiDAR methods (require TNRIS_API_KEY) ──────────────────

  async searchCollections(lat: number, lon: number, radiusM = 5000): Promise<LiDARCollection[]> {
    if (!this.isConfigured) return [];

    const url = `${this.baseUrl}/resources/?lat=${lat}&lon=${lon}&radius=${radiusM}`;
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Token ${this.apiKey}` },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: unknown[] };
        const results = Array.isArray(data?.results) ? data.results : [];
        return results
          .map((r: unknown) => this.parseCollection(r))
          .filter((c): c is LiDARCollection => c !== null)
          .sort((a, b) => a.resolution_ft - b.resolution_ft);
      } catch {
        if (attempt === this.retryCount - 1) return [];
      }
    }
    return [];
  }

  async getBestCollection(lat: number, lon: number): Promise<LiDARCollection | null> {
    if (!this.isConfigured) return null;
    const cols = await this.searchCollections(lat, lon);
    return cols.length > 0 ? cols[0] : null;
  }

  async getElevationStats(lat: number, lon: number, _radiusM = 500): Promise<LiDARPointStats | null> {
    if (!this.isConfigured) return null;

    const url = `${this.baseUrl}/catalog/?lat=${lat}&lon=${lon}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, unknown>;
      return this.parseStats(data);
    } catch {
      return null;
    }
  }

  async fetchLiDARData(lat: number, lon: number, radiusM = 500): Promise<LiDARResult> {
    const fetchedAt = new Date().toISOString();
    if (!this.isConfigured) {
      return {
        lat,
        lon,
        radiusM,
        collections: [],
        bestCollection: null,
        pointStats: null,
        dataAvailable: false,
        fetchedAt,
      };
    }

    try {
      const [collections, pointStats] = await Promise.all([
        this.searchCollections(lat, lon, radiusM),
        this.getElevationStats(lat, lon, radiusM),
      ]);
      const bestCollection = collections.length > 0 ? collections[0] : null;
      return {
        lat,
        lon,
        radiusM,
        collections,
        bestCollection,
        pointStats,
        dataAvailable: collections.length > 0,
        fetchedAt,
      };
    } catch {
      return {
        lat,
        lon,
        radiusM,
        collections: [],
        bestCollection: null,
        pointStats: null,
        dataAvailable: false,
        fetchedAt,
      };
    }
  }

  async listCoveredCounties(): Promise<{ countyFIPS: string; countyName: string; collections: number }[]> {
    if (!this.isConfigured) return [];

    try {
      const res = await fetch(`${this.baseUrl}/catalog/`, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: unknown[] };
      const results = Array.isArray(data?.results) ? data.results : [];
      const countyMap = new Map<string, { countyName: string; collections: number }>();
      for (const r of results) {
        const rec = r as Record<string, unknown>;
        const fips = String(rec['county_fips'] ?? '');
        const name = String(rec['county'] ?? '');
        if (!fips) continue;
        const existing = countyMap.get(fips);
        if (existing) {
          existing.collections++;
        } else {
          countyMap.set(fips, { countyName: name, collections: 1 });
        }
      }
      return Array.from(countyMap.entries()).map(([countyFIPS, v]) => ({
        countyFIPS,
        countyName: v.countyName,
        collections: v.collections,
      }));
    } catch {
      return [];
    }
  }

  // ── Open TxGIO Resources API (no auth required) ───────────────────────────

  /**
   * Fetch all resources for a given Texas county from the open TxGIO API.
   *
   * The open API at /resources returns up to 345,505 total records (paginated).
   * We filter locally to `area_type_name === countyName && area_type === "county"`.
   *
   * Bell County: countyName = "Bell" (not FIPS code).
   *
   * @param countyName County name as used in TxGIO data (e.g., "Bell", "Travis")
   * @param maxPages Safety limit on pagination (default: 50 pages × 1000 = 50,000 records)
   */
  async fetchCountyResources(
    countyName: string,
    maxPages = 50,
  ): Promise<TxGIOCountyResourcesResult> {
    const fetchedAt = new Date().toISOString();
    const resources: TxGIOResource[] = [];
    const countyNameLower = countyName.toLowerCase(); // computed once for loop efficiency
    let totalAvailable = 0;
    let pageLimitHit = false;

    try {
      let nextUrl: string | null = `${this.baseUrl}/resources?limit=1000&offset=0`;
      let pagesLoaded = 0;

      while (nextUrl && pagesLoaded < maxPages) {
        const res = await fetch(nextUrl, {
          signal: AbortSignal.timeout(30_000),
          headers: { 'User-Agent': 'STARR-SURVEYING/1.0' },
        });

        if (!res.ok) {
          throw new Error(`TxGIO API HTTP ${res.status} from ${nextUrl}`);
        }

        const page = (await res.json()) as {
          count?: number;
          next?: string | null;
          results?: unknown[];
        };

        if (pagesLoaded === 0) {
          totalAvailable = typeof page.count === 'number' ? page.count : 0;
        }

        const pageResults = Array.isArray(page.results) ? page.results : [];
        for (const r of pageResults) {
          const parsed = this.parseTxGIOResource(r);
          if (
            parsed &&
            parsed.areaTypeName.toLowerCase() === countyNameLower &&
            parsed.areaType === 'county'
          ) {
            resources.push(parsed);
          }
        }

        nextUrl = page.next ?? null;
        pagesLoaded++;

        // If there's no next page, we're done
        if (!nextUrl) break;

        // Add a small politeness delay between pages
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (nextUrl && pagesLoaded >= maxPages) {
        pageLimitHit = true;
      }

      return { countyName, resources, totalAvailable, pageLimitHit, fetchedAt };
    } catch (err) {
      return {
        countyName,
        resources,
        totalAvailable,
        pageLimitHit,
        fetchedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Convenience: fetch the best Bell County aerial imagery resources from the open API.
   *
   * Returns NC-CCM (Natural Color County Mosaic) resources first, then CIR-CCM,
   * then any other county-level imagery types.  Suitable for full-county aerial coverage.
   *
   * Does NOT require an API key — the TxGIO resources API is open.
   */
  async fetchBellCountyAerialImagery(): Promise<TxGIOResource[]> {
    const result = await this.fetchCountyResources('Bell');
    if (result.error || result.resources.length === 0) return [];

    // Prioritize: NC-CCM > CIR-CCM > NCCIR-DOQQ > others
    const priority: Record<string, number> = {
      'NC-CCM': 1, 'CIR-CCM': 2, 'NCCIR-DOQQ': 3,
    };
    return result.resources
      .filter((r) => /NC-CCM|CIR-CCM|NCCIR-DOQQ|DOQQ/i.test(r.resourceTypeAbbreviation))
      .sort((a, b) => {
        const pa = priority[a.resourceTypeAbbreviation] ?? 99;
        const pb = priority[b.resourceTypeAbbreviation] ?? 99;
        return pa - pb;
      });
  }

  /**
   * Filter a resource list to a specific resource type abbreviation.
   * Convenience wrapper around the result of `fetchCountyResources()`.
   */
  filterByType(resources: TxGIOResource[], type: TxGIOResourceType): TxGIOResource[] {
    return resources.filter((r) => r.resourceTypeAbbreviation === type);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private parseTxGIOResource(r: unknown): TxGIOResource | null {
    if (!r || typeof r !== 'object') return null;
    const rec = r as Record<string, unknown>;
    const resourceId = String(rec['resource_id'] ?? rec['id'] ?? '');
    if (!resourceId) return null;
    return {
      resourceId,
      resourceUrl: String(rec['resource'] ?? rec['download_url'] ?? ''),
      fileSizeBytes: typeof rec['filesize'] === 'number' ? rec['filesize'] : null,
      areaTypeId: String(rec['area_type_id'] ?? ''),
      areaTypeName: String(rec['area_type_name'] ?? rec['county'] ?? ''),
      collectionId: String(rec['collection_id'] ?? ''),
      resourceTypeName: String(rec['resource_type_name'] ?? ''),
      resourceTypeAbbreviation: String(rec['resource_type_abbreviation'] ?? '') as TxGIOResourceType,
      areaType: String(rec['area_type'] ?? 'county'),
    };
  }

  private parseCollection(r: unknown): LiDARCollection | null {
    if (!r || typeof r !== 'object') return null;
    const rec = r as Record<string, unknown>;
    return {
      collectionId: String(rec['collection_id'] ?? rec['id'] ?? ''),
      name: String(rec['name'] ?? rec['title'] ?? ''),
      acquisitionDate: String(rec['acquisition_date'] ?? rec['year'] ?? ''),
      resolution_ft: Number(rec['resolution_ft'] ?? rec['resolution'] ?? 1),
      coverageBbox: (rec['bbox'] as [number, number, number, number]) ?? [0, 0, 0, 0],
      dataFormat: (rec['data_format'] as 'LAS' | 'LAZ' | 'DEM') ?? 'LAS',
      downloadUrl: rec['download_url'] as string | undefined,
      thumbnailUrl: rec['thumbnail_url'] as string | undefined,
      county: String(rec['county'] ?? ''),
      countyFIPS: String(rec['county_fips'] ?? ''),
    };
  }

  private parseStats(data: Record<string, unknown>): LiDARPointStats {
    return {
      minElevation_ft: Number(data['min_elevation_ft'] ?? data['min_elev'] ?? 0),
      maxElevation_ft: Number(data['max_elevation_ft'] ?? data['max_elev'] ?? 0),
      meanElevation_ft: Number(data['mean_elevation_ft'] ?? data['mean_elev'] ?? 0),
      slopePercent: Number(data['slope_percent'] ?? data['slope'] ?? 0),
      hasFloodplain: Boolean(data['has_floodplain'] ?? data['floodplain'] ?? false),
      drainageDirection: data['drainage_direction'] as LiDARPointStats['drainageDirection'] | undefined,
    };
  }
}
