// worker/src/research/capture-runner.ts — take the pictures, read them, file them (plan F5–F7).
//
// ── WHERE THIS SITS ─────────────────────────────────────────────────────────────────────────────
//
//   capture-plan.ts   decides WHAT to photograph and why          (pure)
//   THIS FILE         takes each one, OCRs it, and files it       (effects, injected)
//   project-library   decides whether it is already held          (pure decision, real rows)
//
// The split is not tidiness. The plan is the part with judgement in it — which zoom, which
// neighbours, whether a missing oblique is the county's fault or ours — and judgement that needs a
// browser to test does not get tested. The effects are injected here for the same reason.
//
// ── WHY A CAPTURE IS FILED LIKE ANY OTHER DOCUMENT ──────────────────────────────────────────────
//
// Bell's existing capture writes screenshots through the artifact uploader, which until this plan
// ended in a bare `.insert(row)`. So every re-run filed every screenshot again: 19 of the 53
// duplicate document groups measured in production on 2026-09-01 were one image, re-taken and
// re-inserted.
//
// A capture is a research document. It has a source, a run that produced it, a run that last saw
// it, and an identity. Sending it down the same `fileResearchDocument` path as a deed is what makes
// "keep the old files" and "do not duplicate" both true for imagery — the two requirements that are
// only compatible once a document can name its run.
//
// ── AND WHY OCR IS NOT OPTIONAL ON A MAP ────────────────────────────────────────────────────────
//
// The whole value of a CAD GIS capture is the text on it: lot numbers, dimensions, a scale bar, a
// subdivision name. Stored as pixels it is invisible to every search, every extraction pass and
// every later question. `adaptiveVisionOcr` already exists and reads document images; a map is a
// document image.
//
// An OCR failure never fails the capture. A screenshot with no text extracted is still the
// screenshot, and losing the image because the reader had a bad day would be the worse trade.

import type { CapturePlan, PlannedCaptureItem } from './capture-plan.js';
import { provenanceForCapture, captionForCapture } from './capture-plan.js';
import { contentHash } from './project-library.js';

/** Take a picture of a URL. Injected so the plan can be executed in a test without a browser. */
export type ScreenshotFn = (
  item: PlannedCaptureItem,
) => Promise<{ bytes: Buffer; width?: number; height?: number } | null>;

/** Read the text in an image. Returns null when nothing could be read — which is not an error. */
export type OcrFn = (bytes: Buffer, item: PlannedCaptureItem) => Promise<string | null>;

/** Put the image somewhere durable and return where it went. */
export type StoreFn = (
  item: PlannedCaptureItem,
  bytes: Buffer,
) => Promise<{ storagePath: string; publicUrl: string | null } | null>;

/** File the row. This is `fileResearchDocument` at the call site — the same path a deed takes. */
export type FileFn = (row: Record<string, unknown>, item: PlannedCaptureItem) => Promise<
  { outcome: 'inserted' | 'merged' | 'flagged' | 'error'; reason?: string; error?: string }
>;

export type CaptureLogFn = (level: 'info' | 'warn', message: string) => void;

export interface CaptureRunnerDeps {
  screenshot: ScreenshotFn;
  ocr?: OcrFn;
  store: StoreFn;
  file: FileFn;
  log?: CaptureLogFn;
}

export interface CaptureOutcome {
  key: string;
  label: string;
  kind: PlannedCaptureItem['kind'];
  status: 'filed' | 'already-held' | 'flagged' | 'capture-failed' | 'store-failed' | 'file-failed';
  /** Readable, always. A capture that did not happen must say what happened instead. */
  detail: string;
  ocrChars?: number;
}

export interface CaptureRunReport {
  outcomes: CaptureOutcome[];
  /** Skips decided by the PLAN, carried through so one report explains everything. */
  plannedSkips: Array<{ kind: string; reason: string }>;
  filed: number;
  alreadyHeld: number;
  failed: number;
  summary: string;
}

/**
 * Execute a capture plan.
 *
 * Never throws. A run must not die because a map server was slow — the research is the point and
 * the imagery is supporting evidence. Every failure becomes a recorded outcome with a reason, which
 * is also what stops "no aerial in the packet" from being silently ambiguous.
 */
export async function runCaptures(
  plan: CapturePlan,
  deps: CaptureRunnerDeps,
  ctx: { projectId: string; runId: string | null; county: string },
): Promise<CaptureRunReport> {
  const outcomes: CaptureOutcome[] = [];
  const log = deps.log ?? (() => {});

  for (const item of plan.captures) {
    let shot: { bytes: Buffer; width?: number; height?: number } | null = null;
    try {
      shot = await deps.screenshot(item);
    } catch (e) {
      shot = null;
      log('warn', `[Capture] ${item.label}: screenshot threw — ${String(e)}`);
    }

    if (!shot || shot.bytes.length === 0) {
      outcomes.push({
        key: item.key, label: item.label, kind: item.kind,
        status: 'capture-failed',
        detail:
          `The image could not be captured from ${item.url ?? 'the provider'}. This is a failure to ` +
          'look, not a finding about the property.',
      });
      continue;
    }

    // ── OCR ────────────────────────────────────────────────────────────────────────────────────
    let ocrText: string | null = null;
    if (item.ocr && deps.ocr) {
      try {
        ocrText = await deps.ocr(shot.bytes, item);
      } catch (e) {
        // Never fatal. The picture is worth more than the text on it.
        log('warn', `[Capture] ${item.label}: OCR failed (${String(e)}) — the image is still filed.`);
      }
    }

    // ── Store ──────────────────────────────────────────────────────────────────────────────────
    let stored: { storagePath: string; publicUrl: string | null } | null = null;
    try {
      stored = await deps.store(item, shot.bytes);
    } catch (e) {
      log('warn', `[Capture] ${item.label}: upload threw — ${String(e)}`);
    }
    if (!stored) {
      outcomes.push({
        key: item.key, label: item.label, kind: item.kind,
        status: 'store-failed',
        detail:
          'The image was captured but could not be stored, so it is not in the library. Nothing was ' +
          'filed — a row pointing at a file that was never written is worse than no row.',
      });
      continue;
    }

    // ── File ───────────────────────────────────────────────────────────────────────────────────
    const provenance = provenanceForCapture(item);
    const row = buildCaptureRow(item, ctx, stored, shot.bytes, ocrText, provenance);

    let result: Awaited<ReturnType<FileFn>>;
    try {
      result = await deps.file(row, item);
    } catch (e) {
      result = { outcome: 'error', error: String(e) };
    }

    if (result.outcome === 'merged') {
      outcomes.push({
        key: item.key, label: item.label, kind: item.kind,
        status: 'already-held',
        detail: result.reason ?? 'The project already holds this image; this run saw it again.',
        ocrChars: ocrText?.length,
      });
    } else if (result.outcome === 'flagged') {
      outcomes.push({
        key: item.key, label: item.label, kind: item.kind,
        status: 'flagged',
        detail: `Filed, and flagged as a possible duplicate: ${result.reason ?? 'no reason recorded'}`,
        ocrChars: ocrText?.length,
      });
    } else if (result.outcome === 'error') {
      outcomes.push({
        key: item.key, label: item.label, kind: item.kind,
        status: 'file-failed',
        detail: `The image was stored but the row could not be written: ${result.error ?? 'unknown'}`,
      });
    } else {
      outcomes.push({
        key: item.key, label: item.label, kind: item.kind,
        status: 'filed',
        detail: captionForCapture(item, provenance),
        ocrChars: ocrText?.length,
      });
    }
  }

  const filed = outcomes.filter((o) => o.status === 'filed' || o.status === 'flagged').length;
  const alreadyHeld = outcomes.filter((o) => o.status === 'already-held').length;
  const failed = outcomes.filter((o) => o.status.endsWith('failed')).length;

  return {
    outcomes,
    plannedSkips: plan.skipped.map((s) => ({ kind: s.kind, reason: s.reason })),
    filed,
    alreadyHeld,
    failed,
    summary: describeCaptureRun(filed, alreadyHeld, failed, plan.skipped.length),
  };
}

/**
 * The `research_documents` row for a capture.
 *
 * `content_sha256` is what makes the dedupe work for imagery specifically. A screenshot has no
 * instrument number and no recording date, so the citation-based identity that catches a duplicate
 * deed cannot see it at all — the bytes are the only identity an image has.
 */
export function buildCaptureRow(
  item: PlannedCaptureItem,
  ctx: { projectId: string; runId: string | null; county: string },
  stored: { storagePath: string; publicUrl: string | null },
  bytes: Buffer,
  ocrText: string | null,
  provenance: ReturnType<typeof provenanceForCapture>,
): Record<string, unknown> {
  return {
    research_project_id: ctx.projectId,
    research_run_id: ctx.runId,
    last_seen_run_id: ctx.runId,
    document_label: item.label,
    document_type: documentTypeFor(item.kind),
    source_type: 'pipeline_capture',
    storage_path: stored.storagePath,
    public_url: stored.publicUrl,
    content_sha256: contentHash(bytes),
    page_count: 1,
    processing_status: ocrText ? 'analyzed' : 'stored',
    ocr_text: ocrText,
    harvest_metadata: {
      captureKey: item.key,
      captureKind: item.kind,
      purpose: item.purpose,
      // Provenance travels WITH the row. An aerial whose capture date, scale and source live only
      // in a log cannot support a conclusion in a packet six months later.
      provenance,
      caption: captionForCapture(item, provenance),
      zoom: item.zoom ?? null,
      metresPerPixel: item.metresPerPixel ?? null,
      centre: item.centre ?? null,
      county: ctx.county,
    },
  };
}

/** The document type a capture files under, so the library and the packet can group them. */
function documentTypeFor(kind: PlannedCaptureItem['kind']): string {
  switch (kind) {
    case 'cad_gis': return 'gis_map';
    case 'drawing': return 'drawing';
    case 'streetview': return 'street_view';
    case 'oblique': return 'oblique_aerial';
    case 'aerial_historical': return 'historical_aerial';
    case 'aerial_neighbours': return 'adjoiner_aerial';
    case 'aerial_wide': return 'aerial_wide';
    case 'aerial_close': return 'aerial_close';
    default: return 'aerial';
  }
}

/** One sentence for the run log and the report. */
export function describeCaptureRun(
  filed: number, alreadyHeld: number, failed: number, plannedSkips: number,
): string {
  const parts: string[] = [];
  parts.push(`${filed} image(s) captured and filed`);
  if (alreadyHeld > 0) parts.push(`${alreadyHeld} already held and not re-filed`);
  if (failed > 0) parts.push(`${failed} could not be captured or stored`);
  if (plannedSkips > 0) parts.push(`${plannedSkips} not attempted, each with a stated reason`);
  return `${parts.join('; ')}.`;
}
