// lib/cad/integrations/forge-sync.ts
//
// Phase 7 §17.3 — CAD → Forge sync. When a sealed drawing
// flips to DELIVERED, CAD pushes the boundary polygon,
// building footprints, and utility lines into Forge (Starr's
// construction-management surface) as the as-built base
// layers for that project.
//
// Coverage in this slice:
//   * Layer classification — `layer.name` regex picks the
//     three Forge categories (BOUNDARY / BUILDINGS /
//     UTILITIES). Anything else is dropped from the payload
//     so we don't ship private survey-only layers (notes,
//     control, traverse) into the construction surface.
//   * Per-category GeoJSON slice — uses the existing GeoJSON
//     writer with a `layerFilter` to slim the FeatureCollection
//     down to features on matching layers.
//   * Optional DXF mirror — we ship the full DXF too so
//     Forge has a CAD-native fallback alongside the GeoJSON
//     slices.
//
// Pure modeling layer; the network round-trip lives behind
// `sendForgeSync`. The server route forwards the payload to
// `FORGE_WEBHOOK_URL` with `X-Starr-Forge-Secret`.

import type { DrawingDocument, Feature, Layer } from '../types';
import type {
  RPLSReviewRecord,
  RPLSWorkflowStatus,
} from '../delivery/rpls-workflow';
import { exportToGeoJSON } from '../delivery/geojson-writer';
import { exportToDxf } from '../delivery/dxf-writer';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type ForgeLayerCategory =
  | 'BOUNDARY'
  | 'BUILDINGS'
  | 'UTILITIES';

export interface ForgeLayerSlice {
  category:    ForgeLayerCategory;
  layerNames:  string[];
  /** GeoJSON `FeatureCollection` JSON for this slice. Empty
   *  collections are dropped before send. */
  geojson:     string;
  featureCount: number;
}

export interface ForgeSyncPayload {
  jobId:           string;
  /** Forge project id stamped onto the doc when the
   *  surveyor wired the link. Falls back to the doc id when
   *  unset. */
  forgeProjectId:  string;
  at:              string;
  signatureHash:   string | null;
  /** Hex SHA-256 of the canonical DXF content. Lets Forge
   *  detect re-syncs and skip duplicates. */
  dxfHash:         string | null;
  slices:          ForgeLayerSlice[];
  /** Full DXF text — Forge can ingest it directly when its
   *  GeoJSON parser doesn't cover something exotic. */
  fullDxf:         string;
  /** Project + RPLS roll-up for the receiver UI. */
  projectName:     string;
  rpls:            { name: string; license: string };
  automatic:       boolean;
}

export interface ForgeSyncInputs {
  doc:           DrawingDocument;
  reviewRecord:  RPLSReviewRecord | null;
  /** Optional Forge project id; falls back to `doc.id`. */
  forgeProjectId?: string;
  /** Pass true when the workflow store auto-triggered. */
  automatic?:    boolean;
}

export interface ForgeSyncResponse {
  ok:           boolean;
  forwardedTo?: string;
  status?:      number;
  message?:     string;
}

// ────────────────────────────────────────────────────────────
// Status gate
// ────────────────────────────────────────────────────────────

const SYNC_STATUSES: ReadonlySet<RPLSWorkflowStatus> = new Set(['DELIVERED']);

export function shouldSync(
  record: RPLSReviewRecord | null
): record is RPLSReviewRecord & { status: 'DELIVERED' } {
  if (!record) return false;
  return SYNC_STATUSES.has(record.status);
}

// ────────────────────────────────────────────────────────────
// Layer classification
// ────────────────────────────────────────────────────────────

const CATEGORY_PATTERNS: Record<ForgeLayerCategory, RegExp> = {
  BOUNDARY: /\bboundary|property\b|^pl\b|right.?of.?way|row\b/i,
  BUILDINGS: /building|footprint|structure|^bl\b/i,
  UTILITIES: /utility|sewer|water|gas|electric|comm|telecom|^ut\b/i,
};

export function classifyLayers(
  layers: Layer[]
): Record<ForgeLayerCategory, Layer[]> {
  const out: Record<ForgeLayerCategory, Layer[]> = {
    BOUNDARY: [],
    BUILDINGS: [],
    UTILITIES: [],
  };
  for (const layer of layers) {
    for (const cat of Object.keys(out) as ForgeLayerCategory[]) {
      if (CATEGORY_PATTERNS[cat].test(layer.name)) {
        out[cat].push(layer);
        break;
      }
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Pure builder. Walks the document, classifies layers into
 * BOUNDARY / BUILDINGS / UTILITIES, slices GeoJSON per
 * category, and bundles the result with the full DXF + RPLS
 * + project context. Returns null when the workflow record
 * isn't in a syncable state.
 */
export async function buildForgePayload(
  inputs: ForgeSyncInputs
): Promise<ForgeSyncPayload | null> {
  const { doc, reviewRecord } = inputs;
  if (!shouldSync(reviewRecord)) return null;
  const tb = doc.settings.titleBlock;
  const seal = doc.settings.sealData ?? null;
  const grouped = classifyLayers(Object.values(doc.layers));

  const slices: ForgeLayerSlice[] = [];
  for (const category of Object.keys(grouped) as ForgeLayerCategory[]) {
    const layers = grouped[category];
    if (layers.length === 0) continue;
    const layerIds = new Set(layers.map((l) => l.id));
    const features = Object.values(doc.features).filter(
      (f): f is Feature => layerIds.has(f.layerId) && !f.hidden
    );
    if (features.length === 0) continue;
    const subset = withFeatures(doc, features);
    slices.push({
      category,
      layerNames: layers.map((l) => l.name),
      geojson: exportToGeoJSON(subset),
      featureCount: features.length,
    });
  }

  const fullDxf = exportToDxf(doc);
  const dxfHash = await sha256Hex(fullDxf);

  return {
    jobId: doc.id,
    forgeProjectId: inputs.forgeProjectId ?? doc.id,
    at: new Date().toISOString(),
    signatureHash: seal?.signatureHash ?? null,
    dxfHash,
    slices,
    fullDxf,
    projectName: tb.projectName || doc.name,
    rpls: {
      name: reviewRecord.rplsName,
      license: reviewRecord.rplsLicense,
    },
    automatic: inputs.automatic ?? false,
  };
}

/**
 * Browser-side fetch wrapper. Returns the structured response
 * so callers can log success / surface a banner on failure.
 */
export async function sendForgeSync(
  payload: ForgeSyncPayload
): Promise<ForgeSyncResponse> {
  try {
    const res = await fetch('/api/admin/cad/forge-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as ForgeSyncResponse & {
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: json.error ?? 'Forge sync failed.',
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

/** Build a stripped copy of `doc` carrying only the supplied
 *  features. The GeoJSON writer is feature-only — layers /
 *  settings / etc. flow through unchanged so the slice
 *  inherits the right CRS hint + project name. */
function withFeatures(
  doc: DrawingDocument,
  features: Feature[]
): DrawingDocument {
  const map: Record<string, Feature> = {};
  for (const f of features) map[f.id] = f;
  return { ...doc, features: map };
}

/** Hex SHA-256 of the input string via Web Crypto. Mirrors
 *  the seal-engine hasher; pure browser-side. */
async function sha256Hex(input: string): Promise<string | null> {
  if (
    typeof globalThis === 'undefined' ||
    !globalThis.crypto?.subtle
  ) {
    return null;
  }
  try {
    const buf = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(digest);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
      out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
  } catch {
    return null;
  }
}
