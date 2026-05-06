// lib/cad/integrations/compass-sync.ts
//
// Phase 7 §17.2 — CAD → Compass status sync. When the RPLS
// workflow flips to SEALED or DELIVERED, CAD posts a small
// status envelope to /api/admin/cad/compass-sync; the server
// route forwards the payload to Compass with the per-tenant
// secret so the field-management UI can flip the matching
// job into "Survey Complete — Drawing Sealed" without the
// surveyor doing extra paperwork.
//
// Pure modeling here — `buildSyncPayload` is the only export
// the client surface should ever call directly. The send
// path lives behind a single `sendCompassSync` wrapper that
// fires a fetch and resolves with the server's response so
// callers can log a confirmation without inspecting the
// network layer.

import type { DrawingDocument } from '../types';
import type {
  RPLSReviewRecord,
  RPLSWorkflowStatus,
} from '../delivery/rpls-workflow';
import type { SurveyDescription } from '../delivery/description-generator';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type CompassSyncStatus = 'SEALED' | 'DELIVERED';

export interface CompassSyncPayload {
  jobId:           string;
  /** Compass-side status string. Maps directly from the
   *  RPLS workflow record. */
  status:          CompassSyncStatus;
  /** ISO 8601 timestamp the transition fired. */
  at:              string;
  /** Surveyor identity at the moment of seal. */
  rpls:            { name: string; license: string };
  /** Acreage rolled up from the SurveyDescription when
   *  present, else null. */
  acreage:         number | null;
  /** Hex SHA-256 of the canonical drawing content at seal
   *  time. Lets Compass verify the bundle hasn't drifted. */
  signatureHash:   string | null;
  /** Project + title-block roll-up so the field UI can
   *  surface human-readable context. */
  projectName:     string;
  county:          string;
  /** True when the sync was triggered by the workflow
   *  store; false when the surveyor manually fired it. */
  automatic:       boolean;
  /** A digest of the just-emitted deliverable bundle the
   *  receiver can use to short-circuit duplicate jobs. */
  deliverableSummary: {
    files: string[];
    acreage: number | null;
  };
}

export interface CompassSyncInputs {
  doc:           DrawingDocument;
  reviewRecord:  RPLSReviewRecord | null;
  description:   SurveyDescription | null;
  /** Pass `true` when the workflow store auto-triggered the
   *  sync; `false` when the user clicked a manual button. */
  automatic?:    boolean;
}

export interface CompassSyncResponse {
  ok:           boolean;
  forwardedTo?: string;
  status?:      number;
  message?:     string;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/** Status values that warrant a Compass sync. Anything else
 *  silently no-ops so the auto-trigger doesn't fire on
 *  intermediate states like CHANGES_REQUESTED. */
const SYNC_STATUSES: ReadonlySet<RPLSWorkflowStatus> = new Set([
  'SEALED',
  'DELIVERED',
]);

export function shouldSync(
  record: RPLSReviewRecord | null
): record is RPLSReviewRecord & { status: CompassSyncStatus } {
  if (!record) return false;
  return SYNC_STATUSES.has(record.status);
}

/** Pure builder — assembles the payload the route will POST.
 *  Returns null when the workflow isn't in a syncable state
 *  (caller can short-circuit before hitting the network). */
export function buildSyncPayload(
  inputs: CompassSyncInputs
): CompassSyncPayload | null {
  const { doc, reviewRecord, description } = inputs;
  if (!shouldSync(reviewRecord)) return null;
  const tb = doc.settings.titleBlock;
  const seal = doc.settings.sealData ?? null;
  return {
    jobId: doc.id,
    status: reviewRecord.status,
    at: new Date().toISOString(),
    rpls: {
      name: reviewRecord.rplsName,
      license: reviewRecord.rplsLicense,
    },
    acreage: description?.acreage ?? null,
    signatureHash: seal?.signatureHash ?? null,
    projectName: tb.projectName || doc.name,
    county: description?.county ?? '',
    automatic: inputs.automatic ?? false,
    deliverableSummary: {
      files: [
        'drawing.dxf',
        'drawing.geojson',
        'drawing.pdf',
        'metadata.json',
        'README.txt',
      ],
      acreage: description?.acreage ?? null,
    },
  };
}

/**
 * Browser-side wrapper. POSTs the payload to the local API
 * route; the server-side route is responsible for forwarding
 * to Compass with the per-tenant secret. Resolves with the
 * structured response so the caller can log a confirmation
 * (or surface a banner when it fails).
 */
export async function sendCompassSync(
  payload: CompassSyncPayload
): Promise<CompassSyncResponse> {
  try {
    const res = await fetch('/api/admin/cad/compass-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as CompassSyncResponse & {
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: json.error ?? 'Compass sync failed.',
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
