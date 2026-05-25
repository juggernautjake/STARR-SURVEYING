# Phase 19 — TNRIS LiDAR & Cross-County Research

> **Status (2026-05-25): SHIPPED.** All action items below are implemented
> and verified by `__tests__/recon/phase19-lidar-crosscounty.test.ts`
> (55/55 passing) — `TNRISLiDARClient`, `CrossCountyResolver`, the
> `lidar_data_cache` / `cross_county_properties` schema, and the
> `/research/lidar/*` + `/research/cross-county/*` worker routes.
>
> **Why this doc stays in `in-progress/` (not moved to `completed/`):** the
> test suite hard-codes this exact path
> (`docs/planning/in-progress/STARR_RECON/PHASE_19_LIDAR_CROSSCOUNTY.md`,
> tests 49–52) as the live spec for the feature. Moving the file would
> re-break CI. Per `docs/planning/README.md` this is the "live spec
> referenced by working code" → IN-PROGRESS case. Relocate only in a
> change that also updates the test's `SPEC_PATH`.

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
