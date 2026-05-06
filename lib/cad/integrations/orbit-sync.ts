// lib/cad/integrations/orbit-sync.ts
//
// Phase 7 §17.4 — CAD → Orbit sync. When a sealed drawing
// hits DELIVERED, CAD pushes the field-mapping triplet that
// Orbit (Starr's field-mapping app) needs to navigate to a
// finished site:
//   * Boundary polygon (FeatureCollection slice)
//   * Utility line features (FeatureCollection slice)
//   * Monument points (FeatureCollection slice)
//
// Coordinates ship in source state-plane (US ft); proj4
// isn't in the dependency tree yet so Orbit re-projects to
// WGS84 on import using the EPSG hint we stamp via
// `crs.properties.name`. The spec calls for WGS84
// out-of-the-box; that flips to a writer-side conversion
// once proj4 lands.
//
// Pure modeling here. The send path lives behind
// `sendOrbitSync`; the server route forwards to
// `ORBIT_WEBHOOK_URL` with `X-Starr-Orbit-Secret`.

import type { DrawingDocument, Feature } from '../types';
import type {
  RPLSReviewRecord,
  RPLSWorkflowStatus,
} from '../delivery/rpls-workflow';
import { exportToGeoJSON } from '../delivery/geojson-writer';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface OrbitMonumentRef {
  /** Internal feature id; lets Orbit deep-link back into a
   *  specific point if the surveyor jumps from field map →
   *  CAD review surface. */
  featureId: string;
  /** Raw point code (e.g. `BC02 IRF`). */
  code:      string;
  /** Source layer name. */
  layerName: string;
  /** Optional human-readable text labels copied from the
   *  feature's textLabels[] when present. */
  labels:    string[];
  /** Coordinate in source state-plane (US ft). */
  position:  { northing: number; easting: number };
}

export interface OrbitSyncPayload {
  jobId:           string;
  projectName:     string;
  at:              string;
  /** ISO 8601 — source CRS hint Orbit can use to re-project. */
  sourceCRS:       string;
  rpls:            { name: string; license: string };
  /** Three FeatureCollection JSONs slimmed to the relevant
   *  features. Empty collections are dropped before send. */
  boundaryGeoJSON:  string | null;
  utilitiesGeoJSON: string | null;
  monumentsGeoJSON: string | null;
  monumentRefs:     OrbitMonumentRef[];
  signatureHash:    string | null;
  automatic:        boolean;
}

export interface OrbitSyncInputs {
  doc:           DrawingDocument;
  reviewRecord:  RPLSReviewRecord | null;
  /** Pass true when the workflow store auto-triggered. */
  automatic?:    boolean;
}

export interface OrbitSyncResponse {
  ok:           boolean;
  forwardedTo?: string;
  status?:      number;
  message?:     string;
}

// ────────────────────────────────────────────────────────────
// Status gate
// ────────────────────────────────────────────────────────────

const SYNC_STATUSES: ReadonlySet<RPLSWorkflowStatus> = new Set([
  'DELIVERED',
]);

export function shouldSync(
  record: RPLSReviewRecord | null
): record is RPLSReviewRecord & { status: 'DELIVERED' } {
  if (!record) return false;
  return SYNC_STATUSES.has(record.status);
}

// ────────────────────────────────────────────────────────────
// Feature classifiers
// ────────────────────────────────────────────────────────────

const BOUNDARY_LAYER_RE = /\bboundary|property\b|^pl\b/i;
const UTILITY_LAYER_RE = /utility|sewer|water|gas|electric|comm|telecom|^ut\b/i;
/** Code prefixes that indicate a monument: boundary control
 *  (BC), monument (MN), iron rod (IR / IRF / IRS), iron pipe
 *  (IP / IPF), pinch (PIN), nail / spike (NL / SP). The
 *  prefix can be followed by digits (BC02) or letters (IRF)
 *  so we don't require `\b` after — `^` anchor + uppercased
 *  match is enough. */
const MONUMENT_CODE_RE = /^(?:BC|MN|IR|IP|PIN|NL|SP)/i;

interface ClassifiedFeatures {
  boundary:  Feature[];
  utilities: Feature[];
  monuments: Feature[];
}

export function classifyForOrbit(doc: DrawingDocument): ClassifiedFeatures {
  const boundary: Feature[] = [];
  const utilities: Feature[] = [];
  const monuments: Feature[] = [];
  for (const f of Object.values(doc.features)) {
    if (f.hidden) continue;
    const layerName = doc.layers[f.layerId]?.name ?? '';
    if (
      f.type === 'POLYGON' &&
      BOUNDARY_LAYER_RE.test(layerName)
    ) {
      boundary.push(f);
      continue;
    }
    if (
      (f.type === 'POLYLINE' || f.type === 'LINE') &&
      UTILITY_LAYER_RE.test(layerName)
    ) {
      utilities.push(f);
      continue;
    }
    if (f.type === 'POINT') {
      const rawCode = String(f.properties?.rawCode ?? '').trim();
      if (rawCode.length > 0 && MONUMENT_CODE_RE.test(rawCode)) {
        monuments.push(f);
      }
    }
  }
  return { boundary, utilities, monuments };
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

const SOURCE_CRS = 'urn:ogc:def:crs:EPSG::2277';

export function buildOrbitPayload(
  inputs: OrbitSyncInputs
): OrbitSyncPayload | null {
  const { doc, reviewRecord } = inputs;
  if (!shouldSync(reviewRecord)) return null;
  const tb = doc.settings.titleBlock;
  const seal = doc.settings.sealData ?? null;
  const groups = classifyForOrbit(doc);

  const boundaryGeoJSON =
    groups.boundary.length > 0
      ? exportToGeoJSON(withFeatures(doc, groups.boundary))
      : null;
  const utilitiesGeoJSON =
    groups.utilities.length > 0
      ? exportToGeoJSON(withFeatures(doc, groups.utilities))
      : null;
  const monumentsGeoJSON =
    groups.monuments.length > 0
      ? exportToGeoJSON(withFeatures(doc, groups.monuments))
      : null;

  const monumentRefs: OrbitMonumentRef[] = groups.monuments.map((f) => ({
    featureId: f.id,
    code: String(f.properties?.rawCode ?? '').trim(),
    layerName: doc.layers[f.layerId]?.name ?? '',
    labels:
      Array.isArray(f.textLabels) && f.textLabels.length > 0
        ? f.textLabels
            .map((l) => String(l.text ?? ''))
            .filter((t) => t.length > 0)
        : [],
    position: monumentPosition(f),
  }));

  return {
    jobId: doc.id,
    projectName: tb.projectName || doc.name,
    at: new Date().toISOString(),
    sourceCRS: SOURCE_CRS,
    rpls: {
      name: reviewRecord.rplsName,
      license: reviewRecord.rplsLicense,
    },
    boundaryGeoJSON,
    utilitiesGeoJSON,
    monumentsGeoJSON,
    monumentRefs,
    signatureHash: seal?.signatureHash ?? null,
    automatic: inputs.automatic ?? false,
  };
}

export async function sendOrbitSync(
  payload: OrbitSyncPayload
): Promise<OrbitSyncResponse> {
  try {
    const res = await fetch('/api/admin/cad/orbit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as OrbitSyncResponse & {
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: json.error ?? 'Orbit sync failed.',
      };
    }
    return { ...json, ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function withFeatures(
  doc: DrawingDocument,
  features: Feature[]
): DrawingDocument {
  const map: Record<string, Feature> = {};
  for (const f of features) map[f.id] = f;
  return { ...doc, features: map };
}

function monumentPosition(
  f: Feature
): { northing: number; easting: number } {
  const g = f.geometry;
  const point = g.point ?? g.start ?? g.vertices?.[0];
  if (!point) return { northing: 0, easting: 0 };
  return { northing: point.y, easting: point.x };
}
