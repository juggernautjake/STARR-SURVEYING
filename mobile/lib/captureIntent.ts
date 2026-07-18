// mobile/lib/captureIntent.ts — the pure decision layer behind the Work Mode CAMERA screen (owner 2026-07-18).
//
// The owner's camera screen offers a few capture INTENTS — a plain job photo/video, a receipt, or a document
// for the AI to analyze — and each routes differently: job media → `field_media` (the existing capture path,
// which already stamps GPS/compass/time), a receipt → `receipts` (and the financial page, auto-analyzed), a
// document → `job_files` (analyzed/saved by the AI). This module owns that routing + the unified metadata
// stamp ("every image gets time, location, job, device, crew, recorder") as pure, Expo-free, tested functions —
// the runtime just launches the camera and writes the row the decision names. No redundancy: it reuses the
// existing `field_media` / `receipts` / `job_files` tables rather than inventing a parallel store.

export type CaptureIntent = 'job_photo' | 'job_video' | 'receipt' | 'document';

/** Where a captured intent is stored + what post-processing it triggers. */
export interface CaptureDestination {
  /** The parent table the upload attaches to (the upload queue already supports these three). */
  parentTable: 'field_media' | 'receipts' | 'job_files';
  /** field_media media_type for job captures; null for receipt/document (they are documents, not field media). */
  mediaType: 'photo' | 'video' | null;
  /** Hand the capture to AI after upload (receipt auto-extract, or a document the user wants analyzed). */
  aiAnalyze: boolean;
  /** Also surface it on the financial page (receipts). */
  toFinancials: boolean;
  /** Short label for the camera option button. */
  label: string;
}

const DESTINATIONS: Record<CaptureIntent, CaptureDestination> = {
  job_photo: { parentTable: 'field_media', mediaType: 'photo', aiAnalyze: false, toFinancials: false, label: 'Photo for the job' },
  job_video: { parentTable: 'field_media', mediaType: 'video', aiAnalyze: false, toFinancials: false, label: 'Video for the job' },
  receipt: { parentTable: 'receipts', mediaType: null, aiAnalyze: true, toFinancials: true, label: 'Receipt (auto-logged to financials)' },
  document: { parentTable: 'job_files', mediaType: null, aiAnalyze: true, toFinancials: false, label: 'Document for AI to analyze' },
};

/** The camera screen's option list, in display order. */
export const CAPTURE_INTENTS: readonly CaptureIntent[] = ['job_photo', 'job_video', 'receipt', 'document'] as const;

/** Resolve a capture intent to its destination + post-processing. Falls back to a plain job photo for an
 *  unknown/corrupt value, so the camera can never route a capture to nowhere. */
export function captureDestination(intent: CaptureIntent): CaptureDestination {
  return DESTINATIONS[intent] ?? DESTINATIONS.job_photo;
}

/** True when this intent's capture should be handed to the AI after it uploads (receipt or document). */
export function shouldAnalyze(intent: CaptureIntent): boolean {
  return captureDestination(intent).aiAnalyze;
}

// ── Unified capture metadata ─────────────────────────────────────────────────────────────────────────────
// The owner: "All images will be given metadata including the time and location and job info and what device
// took the image and who was on that job and if possible who recorded the media."

export interface CaptureMetaInput {
  /** ISO timestamp of capture (the caller passes it — this module never reads the clock, so it's testable). */
  capturedAt: string;
  /** Device GPS at capture, when available. */
  location?: { latitude: number; longitude: number; accuracy?: number } | null;
  /** Compass heading (degrees) at capture, when available. */
  headingDeg?: number | null;
  jobId: string;
  jobNumber?: string | null;
  /** Device model string (e.g. "iPhone 15 Pro"). */
  deviceModel?: string | null;
  /** User ids of everyone on the job at capture time. */
  crewUserIds?: string[] | null;
  /** The user who actually took the capture, if known. */
  recordedByUserId?: string | null;
}

export interface CaptureMetadata {
  capturedAt: string;
  jobId: string;
  jobNumber?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  headingDeg?: number;
  deviceModel?: string;
  crewUserIds?: string[];
  recordedByUserId?: string;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Assemble the metadata stamped on every capture, dropping unknown/absent fields so a partial capture (no GPS
 * fix, unknown recorder) still produces a clean object rather than one littered with nulls. `capturedAt` and
 * `jobId` are always present (a capture without a job is not a valid Work Mode capture — the caller guarantees
 * both). Pure — the caller supplies the timestamp, so this never depends on the clock.
 */
export function assembleCaptureMetadata(input: CaptureMetaInput): CaptureMetadata {
  const out: CaptureMetadata = { capturedAt: input.capturedAt, jobId: input.jobId };
  if (input.jobNumber) out.jobNumber = input.jobNumber;
  if (input.location && isNum(input.location.latitude) && isNum(input.location.longitude)) {
    out.latitude = input.location.latitude;
    out.longitude = input.location.longitude;
    if (isNum(input.location.accuracy)) out.accuracy = input.location.accuracy;
  }
  if (isNum(input.headingDeg)) out.headingDeg = input.headingDeg;
  if (input.deviceModel) out.deviceModel = input.deviceModel;
  const crew = (input.crewUserIds ?? []).filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (crew.length) out.crewUserIds = crew;
  if (input.recordedByUserId) out.recordedByUserId = input.recordedByUserId;
  return out;
}
