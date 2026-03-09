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

export class TNRISLiDARClient {
  private apiKey: string | null;
  private baseUrl = 'https://api.tnris.org/api/v1';
  private retryCount = 3;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.TNRIS_API_KEY ?? null;
  }

  get isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

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
