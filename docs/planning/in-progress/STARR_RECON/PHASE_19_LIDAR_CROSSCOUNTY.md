# Phase 19 — TNRIS LiDAR & Cross-County Research

## Purpose
Phase 19 adds LiDAR-backed elevation research and cross-county property
detection to the STARR Recon research pipeline. It lets a research plan
look up the best available TNRIS LiDAR collection for a parcel and detect
when a parcel may span more than one Texas county.

## Core modules
- `TNRISLiDARClient` (`worker/src/sources/tnris-lidar-client.ts`) — TNRIS
  LiDAR collection lookup and elevation statistics. Key methods:
  - `searchCollections(lat, lon)` — find LiDAR collections covering a point.
  - `getBestCollection(lat, lon)` — pick the highest-quality / most recent
    collection for the point.
  - `getElevationStats(lat, lon)` — return elevation statistics for the point.
  When no API key is configured these methods degrade gracefully (empty
  array / `null`) so research can proceed without LiDAR.
- `CrossCountyResolver` (`worker/src/services/cross-county-resolver.ts`) —
  county detection, adjacency checks, and cross-county research planning.

## Data model
Phase 19 adds two tables (see the schema SQL):
- `lidar_data_cache` — cached LiDAR lookups, keyed by `project_id`
  (`project_id ... REFERENCES` the project) to avoid repeat TNRIS calls.
- `cross_county_properties` — detected multi-county parcels, keyed by
  `project_id` (`project_id ... REFERENCES` the project).

## Worker routes (`worker/src/index.ts`)
- `GET /research/lidar/counties` — list counties with LiDAR coverage.
- `GET /research/lidar/:projectId` — LiDAR lookup for a project.
- `POST /research/cross-county/detect` — detect whether a parcel crosses
  county lines.
- `GET /research/cross-county/:projectId` — cross-county results for a project.

The index wires in the `cross-county-resolver` service for these routes.

## Notes
The Cross-County workflow supports research plans for parcels that may span
multiple Texas counties, so adjacent-county records are pulled in alongside
the primary county during recon.
