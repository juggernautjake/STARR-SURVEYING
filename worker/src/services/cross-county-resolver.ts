export interface CountyBoundary {
  countyFIPS: string;
  countyName: string;
  bbox: [number, number, number, number];
}

export interface CrossCountyDetectionResult {
  isCrossCounty: boolean;
  primaryCounty: { fips: string; name: string };
  secondaryCounties: { fips: string; name: string; overlapPercent: number }[];
  boundaryLine?: { lat: number; lon: number }[];
  resolutionStrategy: 'primary_only' | 'both_counties' | 'split_research';
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

export interface CrossCountyResearchPlan {
  projectId: string;
  detectionResult: CrossCountyDetectionResult;
  primaryResearch: { countyFIPS: string; propertyId?: string; address: string };
  secondaryResearch: { countyFIPS: string; propertyId?: string; address: string }[];
  estimatedDocuments: number;
  estimatedCost: number;
}

// Approximate centroids and bounding boxes for Texas counties
export const TEXAS_COUNTY_CENTROIDS: Record<
  string,
  { name: string; lat: number; lon: number; bbox: [number, number, number, number] }
> = {
  '48001': { name: 'Anderson', lat: 31.81, lon: -95.65, bbox: [-95.97, 31.57, -95.28, 32.07] },
  '48003': { name: 'Andrews', lat: 32.30, lon: -102.64, bbox: [-103.06, 32.00, -102.23, 32.60] },
  '48005': { name: 'Angelina', lat: 31.25, lon: -94.62, bbox: [-94.97, 31.04, -94.25, 31.50] },
  '48007': { name: 'Aransas', lat: 28.10, lon: -97.03, bbox: [-97.26, 27.88, -96.76, 28.37] },
  '48009': { name: 'Archer', lat: 33.61, lon: -98.68, bbox: [-98.96, 33.38, -98.36, 33.87] },
  '48011': { name: 'Armstrong', lat: 34.97, lon: -101.36, bbox: [-101.63, 34.75, -101.09, 35.18] },
  '48013': { name: 'Atascosa', lat: 28.89, lon: -98.53, bbox: [-98.95, 28.62, -98.06, 29.18] },
  '48015': { name: 'Austin', lat: 29.89, lon: -96.28, bbox: [-96.62, 29.65, -95.90, 30.14] },
  '48019': { name: 'Bandera', lat: 29.73, lon: -99.25, bbox: [-99.68, 29.44, -98.82, 30.05] },
  '48021': { name: 'Bastrop', lat: 30.10, lon: -97.31, bbox: [-97.62, 29.84, -96.99, 30.39] },
  '48023': { name: 'Baylor', lat: 33.61, lon: -99.21, bbox: [-99.49, 33.39, -98.95, 33.84] },
  '48027': { name: 'Bell', lat: 31.06, lon: -97.47, bbox: [-97.93, 30.70, -97.00, 31.45] },
  '48029': { name: 'Bexar', lat: 29.45, lon: -98.52, bbox: [-98.93, 29.09, -98.08, 29.84] },
  '48031': { name: 'Blanco', lat: 30.26, lon: -98.42, bbox: [-98.66, 30.05, -98.10, 30.53] },
  '48041': { name: 'Brazos', lat: 30.66, lon: -96.30, bbox: [-96.62, 30.37, -95.93, 30.95] },
  '48049': { name: 'Brown', lat: 31.77, lon: -99.02, bbox: [-99.31, 31.56, -98.72, 32.01] },
  '48085': { name: 'Collin', lat: 33.19, lon: -96.57, bbox: [-96.91, 32.99, -96.24, 33.39] },
  '48099': { name: 'Coryell', lat: 31.40, lon: -97.80, bbox: [-98.18, 31.07, -97.40, 31.71] },
  '48113': { name: 'Dallas', lat: 32.77, lon: -96.79, bbox: [-97.04, 32.54, -96.45, 33.02] },
  '48121': { name: 'Denton', lat: 33.21, lon: -97.12, bbox: [-97.63, 32.99, -96.61, 33.43] },
  '48141': { name: 'El Paso', lat: 31.77, lon: -106.24, bbox: [-106.63, 31.33, -105.72, 32.20] },
  '48157': { name: 'Fort Bend', lat: 29.53, lon: -95.77, bbox: [-96.22, 29.25, -95.26, 29.80] },
  '48163': { name: 'Frio', lat: 28.87, lon: -99.11, bbox: [-99.51, 28.52, -98.75, 29.19] },
  '48167': { name: 'Galveston', lat: 29.29, lon: -94.86, bbox: [-95.21, 29.07, -94.52, 29.53] },
  '48177': { name: 'Gonzales', lat: 29.45, lon: -97.48, bbox: [-97.93, 29.14, -97.09, 29.73] },
  '48181': { name: 'Grayson', lat: 33.63, lon: -96.67, bbox: [-97.04, 33.38, -96.30, 33.85] },
  '48183': { name: 'Gregg', lat: 32.48, lon: -94.82, bbox: [-95.05, 32.30, -94.58, 32.66] },
  '48187': { name: 'Guadalupe', lat: 29.57, lon: -97.93, bbox: [-98.26, 29.34, -97.58, 29.85] },
  '48201': { name: 'Harris', lat: 29.85, lon: -95.40, bbox: [-95.82, 29.49, -94.89, 30.17] },
  '48209': { name: 'Hays', lat: 30.06, lon: -98.03, bbox: [-98.35, 29.77, -97.62, 30.40] },
  '48215': { name: 'Hidalgo', lat: 26.38, lon: -98.18, bbox: [-98.59, 26.06, -97.73, 26.77] },
  '48225': { name: 'Houston', lat: 31.32, lon: -95.43, bbox: [-95.78, 31.04, -95.05, 31.62] },
  '48231': { name: 'Hunt', lat: 33.12, lon: -96.08, bbox: [-96.42, 32.87, -95.73, 33.38] },
  '48245': { name: 'Jefferson', lat: 30.02, lon: -94.15, bbox: [-94.45, 29.75, -93.83, 30.30] },
  '48251': { name: 'Johnson', lat: 32.38, lon: -97.37, bbox: [-97.65, 32.14, -97.03, 32.64] },
  '48257': { name: 'Kaufman', lat: 32.60, lon: -96.28, bbox: [-96.60, 32.35, -95.93, 32.85] },
  '48303': { name: 'Lubbock', lat: 33.61, lon: -101.82, bbox: [-102.08, 33.39, -101.55, 33.84] },
  '48309': { name: 'McLennan', lat: 31.55, lon: -97.20, bbox: [-97.62, 31.24, -96.81, 31.85] },
  '48323': { name: 'Medina', lat: 29.35, lon: -99.11, bbox: [-99.54, 29.01, -98.67, 29.71] },
  '48329': { name: 'Midland', lat: 31.87, lon: -102.03, bbox: [-102.29, 31.65, -101.77, 32.09] },
  '48339': { name: 'Montgomery', lat: 30.30, lon: -95.50, bbox: [-95.85, 30.05, -95.06, 30.58] },
  '48355': { name: 'Nueces', lat: 27.73, lon: -97.61, bbox: [-97.97, 27.44, -97.10, 28.07] },
  '48361': { name: 'Orange', lat: 30.12, lon: -93.90, bbox: [-94.11, 29.89, -93.66, 30.38] },
  '48367': { name: 'Parker', lat: 32.78, lon: -97.81, bbox: [-98.17, 32.52, -97.47, 33.03] },
  '48375': { name: 'Potter', lat: 35.40, lon: -101.90, bbox: [-102.17, 35.18, -101.63, 35.62] },
  '48381': { name: 'Randall', lat: 34.97, lon: -101.90, bbox: [-102.17, 34.74, -101.63, 35.18] },
  '48423': { name: 'Smith', lat: 32.38, lon: -95.27, bbox: [-95.61, 32.10, -94.93, 32.65] },
  '48439': { name: 'Tarrant', lat: 32.77, lon: -97.29, bbox: [-97.66, 32.54, -96.96, 33.02] },
  '48441': { name: 'Taylor', lat: 32.30, lon: -99.89, bbox: [-100.17, 32.08, -99.61, 32.53] },
  '48453': { name: 'Travis', lat: 30.33, lon: -97.77, bbox: [-98.17, 30.07, -97.38, 30.63] },
  '48469': { name: 'Victoria', lat: 28.79, lon: -96.98, bbox: [-97.33, 28.48, -96.59, 29.09] },
  '48473': { name: 'Waller', lat: 30.00, lon: -95.99, bbox: [-96.31, 29.78, -95.68, 30.22] },
  '48479': { name: 'Webb', lat: 27.76, lon: -99.33, bbox: [-100.07, 27.26, -98.80, 28.21] },
  '48485': { name: 'Wichita', lat: 33.90, lon: -98.70, bbox: [-99.00, 33.69, -98.42, 34.14] },
  '48491': { name: 'Williamson', lat: 30.65, lon: -97.61, bbox: [-98.13, 30.40, -97.11, 30.92] },
  '48497': { name: 'Wise', lat: 33.22, lon: -97.66, bbox: [-97.98, 32.97, -97.33, 33.47] },
  '48507': { name: 'Zapata', lat: 27.00, lon: -99.17, bbox: [-99.51, 26.79, -98.84, 27.30] },
};

// Adjacency table: FIPS -> adjacent county FIPS
const COUNTY_ADJACENCY: Record<string, string[]> = {
  '48027': ['48099', '48309', '48491', '48099', '48181', '48027'],
  '48113': ['48121', '48439', '48085', '48231', '48257', '48251'],
  '48439': ['48113', '48251', '48367', '48497', '48121'],
  '48201': ['48157', '48339', '48245', '48473', '48167'],
  '48029': ['48187', '48019', '48163', '48323', '48013'],
  '48085': ['48113', '48121', '48181', '48231'],
  '48121': ['48085', '48113', '48439', '48497', '48251'],
  '48157': ['48201', '48473', '48339', '48177'],
  '48491': ['48453', '48027', '48187', '48209'],
  '48453': ['48491', '48209', '48021', '48031'],
};

export class CrossCountyResolver {
  detectCrossCounty(
    centerLat: number,
    centerLon: number,
    boundaryCalls: { bearing: string; distance: number }[],
    primaryCountyFIPS: string,
  ): CrossCountyDetectionResult {
    const primaryEntry = TEXAS_COUNTY_CENTROIDS[primaryCountyFIPS];
    const primaryName = primaryEntry?.name ?? 'Unknown';

    const notes: string[] = [];
    const secondaryCounties: { fips: string; name: string; overlapPercent: number }[] = [];

    if (boundaryCalls.length === 0) {
      return {
        isCrossCounty: false,
        primaryCounty: { fips: primaryCountyFIPS, name: primaryName },
        secondaryCounties: [],
        resolutionStrategy: 'primary_only',
        confidence: 'low',
        notes: ['No boundary calls provided; cannot detect cross-county'],
      };
    }

    // Estimate property extent from boundary calls
    let maxDistanceM = 0;
    for (const call of boundaryCalls) {
      maxDistanceM = Math.max(maxDistanceM, call.distance);
    }

    // Convert feet to degrees (rough: 1 deg lat ≈ 111,000m, 1 deg lon ≈ 88,000m at TX latitudes)
    const extentDeg = maxDistanceM / 111000;

    const primaryBbox = primaryEntry?.bbox;
    let crossesCounty = false;

    if (primaryBbox) {
      const [minLon, minLat, maxLon, maxLat] = primaryBbox;
      const nearEdgeLat =
        Math.abs(centerLat - minLat) < extentDeg * 2 ||
        Math.abs(centerLat - maxLat) < extentDeg * 2;
      const nearEdgeLon =
        Math.abs(centerLon - minLon) < extentDeg * 2 ||
        Math.abs(centerLon - maxLon) < extentDeg * 2;

      if (nearEdgeLat || nearEdgeLon) {
        crossesCounty = true;
        notes.push('Property appears near county boundary based on extent analysis');
      }
    }

    // Check adjacent counties for overlap
    const adjacents = this.getAdjacentCounties(primaryCountyFIPS);
    if (crossesCounty && adjacents.length > 0) {
      for (const adjFips of adjacents) {
        const adjEntry = TEXAS_COUNTY_CENTROIDS[adjFips];
        if (!adjEntry) continue;
        const [minLon, minLat, maxLon, maxLat] = adjEntry.bbox;
        const propertyInAdj =
          centerLat + extentDeg > minLat &&
          centerLat - extentDeg < maxLat &&
          centerLon + extentDeg > minLon &&
          centerLon - extentDeg < maxLon;
        if (propertyInAdj) {
          const overlapPercent = Math.min(50, Math.round((extentDeg / (maxLat - minLat)) * 100));
          secondaryCounties.push({ fips: adjFips, name: adjEntry.name, overlapPercent });
        }
      }
    }

    const isCrossCounty = crossesCounty && secondaryCounties.length > 0;
    let resolutionStrategy: CrossCountyDetectionResult['resolutionStrategy'] = 'primary_only';
    let confidence: CrossCountyDetectionResult['confidence'] = 'high';

    if (isCrossCounty) {
      const maxOverlap = Math.max(...secondaryCounties.map((s) => s.overlapPercent));
      if (maxOverlap > 30) {
        resolutionStrategy = 'split_research';
        confidence = 'medium';
        notes.push('Significant overlap detected — split research recommended');
      } else {
        resolutionStrategy = 'both_counties';
        confidence = 'medium';
        notes.push('Minor cross-county overlap — research both counties');
      }
    } else {
      notes.push('Property appears fully within primary county');
    }

    return {
      isCrossCounty,
      primaryCounty: { fips: primaryCountyFIPS, name: primaryName },
      secondaryCounties,
      resolutionStrategy,
      confidence,
      notes,
    };
  }

  buildResearchPlan(
    projectId: string,
    address: string,
    detectionResult: CrossCountyDetectionResult,
  ): CrossCountyResearchPlan {
    const { primaryCounty, secondaryCounties, resolutionStrategy } = detectionResult;

    const primaryResearch = {
      countyFIPS: primaryCounty.fips,
      address,
    };

    const secondaryResearch = secondaryCounties.map((sc) => ({
      countyFIPS: sc.fips,
      address,
    }));

    const estimatedDocuments = 3 + secondaryCounties.length * 2;
    const estimatedCost = estimatedDocuments * 3.5;

    return {
      projectId,
      detectionResult,
      primaryResearch,
      secondaryResearch,
      estimatedDocuments,
      estimatedCost,
    };
  }

  getCountyForPoint(lat: number, lon: number): string | null {
    // Texas bounding box check
    if (lat < 25.8 || lat > 36.6 || lon < -106.7 || lon > -93.5) return null;

    let bestFips: string | null = null;
    let bestDist = Infinity;

    for (const [fips, entry] of Object.entries(TEXAS_COUNTY_CENTROIDS)) {
      const [minLon, minLat, maxLon, maxLat] = entry.bbox;
      if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
        const dist = Math.hypot(lat - entry.lat, lon - entry.lon);
        if (dist < bestDist) {
          bestDist = dist;
          bestFips = fips;
        }
      }
    }

    // Fallback: nearest centroid if no bbox match
    if (!bestFips) {
      for (const [fips, entry] of Object.entries(TEXAS_COUNTY_CENTROIDS)) {
        const dist = Math.hypot(lat - entry.lat, lon - entry.lon);
        if (dist < bestDist) {
          bestDist = dist;
          bestFips = fips;
        }
      }
    }

    return bestFips;
  }

  getAdjacentCounties(fips: string): string[] {
    return COUNTY_ADJACENCY[fips] ?? [];
  }
}
