// lib/cad/integrations/compass.ts
//
// Phase 7 §17.1 — Compass → CAD bootstrap. When a Compass job
// hand-off is dropped into `localStorage` under
// `starr-cad-pending-compass`, CAD picks it up on mount,
// patches the active document's title-block fields from the
// payload, surfaces any field / deed files for one-click
// import, and clears the slot.
//
// Pure modeling layer — no DOM dependencies on this file.
// `consumePendingCompassJob` is the single side-effecting
// reader that touches localStorage; everything else takes
// the parsed payload as input.

import type { DrawingDocument, DrawingSettings } from '../types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface CompassFileRef {
  name: string;
  /** URL the browser can fetch / link to. Compass writes
   *  signed URLs; CAD just hands them to the import dialog. */
  url:  string;
}

export interface CompassJobImport {
  jobId:      string;
  jobName:    string;
  clientName: string;
  address:    string;
  county:     string;
  /** Optional — populated when the surveyor knows it at job
   *  creation time. Falls back to the existing title-block
   *  scale label otherwise. */
  scaleLabel?: string;
  /** Optional — Compass-tracked job number. */
  jobNumber?: string;
  /** Optional — surveyor / RPLS resolved at job creation. */
  rpls?: { name: string; license: string; firmName?: string };
  /** Optional — survey date (ISO yyyy-mm-dd or US m/d/yyyy). */
  surveyDate?: string;
  fieldFiles:  CompassFileRef[];
  deedFiles:   CompassFileRef[];
  /** ISO 8601 timestamp the payload was dropped. Used so the
   *  receiver can warn when it picks up something stale. */
  handedOffAt: string;
}

export const COMPASS_HANDOFF_KEY = 'starr-cad-pending-compass';

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Pull a pending Compass hand-off out of localStorage and
 * clear the slot atomically. Returns null when no payload
 * exists or the JSON is malformed.
 */
export function consumePendingCompassJob(): CompassJobImport | null {
  if (typeof globalThis.localStorage === 'undefined') return null;
  const raw = globalThis.localStorage.getItem(COMPASS_HANDOFF_KEY);
  if (!raw) return null;
  globalThis.localStorage.removeItem(COMPASS_HANDOFF_KEY);
  try {
    return parseCompassJob(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Validate + coerce a raw payload into a `CompassJobImport`.
 * Returns null when required fields are missing so the
 * receiver can ignore garbage instead of crashing.
 */
export function parseCompassJob(raw: unknown): CompassJobImport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const jobId = stringField(r.jobId);
  if (!jobId) return null;
  return {
    jobId,
    jobName: stringField(r.jobName) ?? '',
    clientName: stringField(r.clientName) ?? '',
    address: stringField(r.address) ?? '',
    county: stringField(r.county) ?? '',
    scaleLabel: stringField(r.scaleLabel),
    jobNumber: stringField(r.jobNumber),
    rpls: parseRpls(r.rpls),
    surveyDate: stringField(r.surveyDate),
    fieldFiles: parseFiles(r.fieldFiles),
    deedFiles: parseFiles(r.deedFiles),
    handedOffAt:
      stringField(r.handedOffAt) ?? new Date().toISOString(),
  };
}

/**
 * Build a `Partial<DrawingSettings>` patch the caller can pass
 * to `useDrawingStore.updateSettings`. Only fields that the
 * Compass payload actually carried are populated so we don't
 * blow away values the surveyor may have already typed in.
 */
export function buildSettingsPatch(
  payload: CompassJobImport,
  current: DrawingDocument['settings']
): Partial<DrawingSettings> {
  const tb = current.titleBlock;
  const notesParts: string[] = [];
  const existingNotes = (tb.notes ?? '').trim();
  if (existingNotes.length > 0) notesParts.push(existingNotes);
  if (payload.address && !/address/i.test(existingNotes)) {
    notesParts.push(`Address: ${payload.address}.`);
  }
  if (payload.county && !/county/i.test(existingNotes)) {
    notesParts.push(`County: ${payload.county}.`);
  }
  return {
    titleBlock: {
      ...tb,
      projectName: payload.jobName || tb.projectName,
      projectNumber: payload.jobNumber ?? tb.projectNumber,
      clientName: payload.clientName || tb.clientName,
      surveyDate: payload.surveyDate || tb.surveyDate,
      scaleLabel: payload.scaleLabel ?? tb.scaleLabel,
      surveyorName: payload.rpls?.name ?? tb.surveyorName,
      surveyorLicense: payload.rpls?.license ?? tb.surveyorLicense,
      firmName: payload.rpls?.firmName ?? tb.firmName,
      notes: notesParts.join(' ').trim(),
    },
  };
}

/**
 * `true` when the payload landed in CAD more than `maxAgeMs`
 * ago. The receiver uses this to surface a "this hand-off
 * is stale" warning instead of silently applying old data.
 * Defaults to 24h.
 */
export function isStale(
  payload: CompassJobImport,
  maxAgeMs = 24 * 60 * 60 * 1000
): boolean {
  const ts = Date.parse(payload.handedOffAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > maxAgeMs;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function stringField(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function parseFiles(raw: unknown): CompassFileRef[] {
  if (!Array.isArray(raw)) return [];
  const out: CompassFileRef[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const obj = r as Record<string, unknown>;
    const name = stringField(obj.name);
    const url = stringField(obj.url);
    if (name && url) out.push({ name, url });
  }
  return out;
}

function parseRpls(raw: unknown): CompassJobImport['rpls'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const name = stringField(obj.name);
  const license = stringField(obj.license);
  if (!name || !license) return undefined;
  return {
    name,
    license,
    ...(stringField(obj.firmName)
      ? { firmName: stringField(obj.firmName)! }
      : {}),
  };
}
