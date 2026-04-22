# Phase 19 — TNRIS LiDAR Integration & Cross-County Property Detection

**Status:** COMPLETE ✅ v1.0 — March 2026  
**Tests:** 55 unit tests (`__tests__/recon/phase19-lidar-crosscounty.test.ts`)

---

## Goal

Add two data capabilities deferred from earlier phases:

1. **TNRIS LiDAR** — High-resolution elevation data from the Texas Natural Resources Information System. Provides point-cloud DEM coverage for most Texas counties, useful for flood risk assessment and slope analysis.
2. **Cross-County Detection** — Detect properties that straddle two county lines (e.g., a large ranch in both Bell and Coryell counties) and build a dual-research plan covering both county systems.

---

## What Was Built

| File | Purpose |
|------|---------|
| `worker/src/sources/tnris-lidar-client.ts` | TNRISLiDARClient — REST API client for TNRIS LiDAR catalog; gracefully no-ops when `TNRIS_API_KEY` is absent |
| `worker/src/services/cross-county-resolver.ts` | CrossCountyResolver — detects cross-county via bounding-box intersection; 50+ TX county centroids hardcoded |
| `seeds/097_phase19_lidar.sql` | `lidar_data_cache` + `cross_county_properties` tables; RLS; `get_lidar_for_project()` helper |
| `worker/src/index.ts` | 4 new routes: GET /research/lidar/counties, GET /research/lidar/:projectId, POST /research/cross-county/detect, GET /research/cross-county/:projectId |

---

## Architecture

```
Property centroid (lat/lon)
        │
        ▼
TNRISLiDARClient.fetchLiDARData(lat, lon, radiusM)
        │
        ├── searchCollections()   → TNRIS REST API /resources/
        ├── getBestCollection()   → sort by resolution, pick highest
        └── getElevationStats()  → derive min/max/mean/slope from DEM
                │
                ▼
        LiDARResult { collections[], bestCollection, pointStats, dataAvailable }
                │
                ▼
        lidar_data_cache (Supabase)

Property boundary calls
        │
        ▼
CrossCountyResolver.detectCrossCounty(lat, lon, calls[], primaryFIPS)
        │
        ├── Walk traverse from centroid
        ├── Check each endpoint against TEXAS_COUNTY_CENTROIDS bboxes
        └── If any endpoint falls outside primary county bbox → cross-county
                │
                ▼
        CrossCountyDetectionResult { isCrossCounty, secondaryCounties[], strategy }
                │
                ▼
        buildResearchPlan() → CrossCountyResearchPlan { primaryResearch, secondaryResearch[] }
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `TNRIS_API_KEY` | TNRIS API authentication token. Register at https://api.tnris.org |

When `TNRIS_API_KEY` is absent, all LiDAR calls return `{ dataAvailable: false, collections: [] }` — the pipeline continues without error.

---

## Acceptance Criteria

- [x] TNRISLiDARClient instantiates without API key
- [x] `fetchLiDARData` never throws; returns `dataAvailable: false` when unconfigured
- [x] `isConfigured` reflects presence of API key
- [x] CrossCountyResolver detects cross-county via bbox intersection
- [x] `TEXAS_COUNTY_CENTROIDS` covers ≥20 TX counties
- [x] `buildResearchPlan` returns typed plan with primary + secondary research
- [x] SQL schema created for both tables with RLS
- [x] 4 worker API routes registered
- [x] 55 unit tests pass
