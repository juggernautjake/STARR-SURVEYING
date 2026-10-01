// lib/files/upload-resilience.ts — what makes an upload survive a field controller (2026-10-01).
//
// Owner: *"on the tsc5 I … was able to upload job csv file to a job … whenever I tried to do the
// same on the tdc600, I struggled to find the job data and upload it to the website. It told me I
// had network error and wouldn't upload. … make sure that our upload options for jobs and projects
// and stuff is robust for all devices, especially android devices."*
//
// ── WHAT THE "NETWORK ERROR" WAS ────────────────────────────────────────────────────────────────
//
// Production logs for the attempt (2026-10-01 18:23–18:25 UTC): five `POST /api/admin/jobs/files/
// upload` → 200, and not one `POST /api/admin/jobs/files` after them. The server handed out every
// signed URL; every PUT of the bytes straight to storage then died in the browser, three of them
// within two seconds of each other — too fast for a weak signal, which fails slowly.
//
// That is Chrome on Android's `net::ERR_UPLOAD_FILE_CHANGED`: Chrome streams a picked file from
// disk while it uploads, and if the file's modification time is not what it was at the moment of
// picking, it aborts the request. XHR reports that as a bare network error. Two things on a Trimble
// controller trigger it — a `.job` that Trimble Access still has open (it keeps writing to it), and
// a document provider (Google Drive, some OEM file managers) that reports "modified now" every time
// it is asked (crbug 40123366). The TSC5 worked because the file it picked was not being written.
//
// The fix is to READ the file into memory the moment it is picked (`snapshotFile`). Uploading the
// in-memory copy never touches the file on disk again, so nothing can change under it. Survey files
// are small; the snapshot is capped so a 400 MB video still streams.
//
// ── THE REST OF THIS MODULE ─────────────────────────────────────────────────────────────────────
//
// Every decision an upload makes that is not the network itself, kept pure so it can be tested
// without a browser: which content type to send, what a failure MEANS and whether trying again can
// help, how long to wait before trying again, which picker buttons a device should be offered, and
// which folder a file goes to when the one it inherited would refuse it.

import { megabytes } from '@/lib/storage/uploads';

// ── content types ────────────────────────────────────────────────────────────────────────────────

const TYPE_BY_EXT: Record<string, string> = {
  // survey + CAD. `.jxl` is Trimble JobXML here, not JPEG XL — XML is what the bytes are.
  csv: 'text/csv', txt: 'text/plain', xml: 'application/xml', jxl: 'application/xml', landxml: 'application/xml',
  json: 'application/json', geojson: 'application/geo+json', kml: 'application/vnd.google-earth.kml+xml',
  kmz: 'application/vnd.google-earth.kmz', dxf: 'image/vnd.dxf', dwg: 'image/vnd.dwg',
  // documents
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  rtf: 'application/rtf', zip: 'application/zip',
  // images
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp', svg: 'image/svg+xml',
  // video + audio
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', '3gp': 'video/3gpp', '3g2': 'video/3gpp2', mpg: 'video/mpeg', mpeg: 'video/mpeg', hevc: 'video/hevc',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
};

/** The lower-case extension, without the dot ('' when there is none). */
export function extensionOf(name: string | null | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * A content type for ANY file. The browser's own when it has one; otherwise from the extension;
 * otherwise `application/octet-stream`. Android hands over an empty `File.type` for every
 * extension it does not know — `.job`, `.rw5`, `.dc`, `.trv` — and for some it does.
 */
export function contentTypeForAnyFile(name: string | null | undefined, mime?: string | null): string {
  const given = (mime ?? '').trim();
  if (given) return given;
  return TYPE_BY_EXT[extensionOf(name)] ?? 'application/octet-stream';
}

/** Survey-instrument and CAD files — they belong in a job's CAD folder. */
export const SURVEY_FILE_EXT = /\.(job|jxl|dc|rw5|raw|trv|trb|csv|txt|pnezd|pts|gsi|sdr|fbk|crd|cgc|vce|dwg|dxf|dgn|starr|landxml|t0[1-4]|tsf|xml)$/i;

// ── reading a file into memory (the "network error" fix) ─────────────────────────────────────────

/** A file up to this size is copied into memory the moment it is picked. Every Trimble job, CSV,
 *  JobXML and PDF is far below it; a phone video above it streams as before. */
export const SNAPSHOT_MAX_BYTES = 64 * 1024 * 1024;
/** And no more than this many bytes in memory across one list, so forty photos cannot exhaust a
 *  controller with 4 GB of RAM. Files past the budget stream. */
export const SNAPSHOT_BUDGET_BYTES = 256 * 1024 * 1024;

/** Which of these files to copy into memory, in order, within the budget. Pure. */
export function planSnapshots(sizes: readonly number[], alreadyBuffered = 0): boolean[] {
  let used = alreadyBuffered;
  return sizes.map((size) => {
    if (!(size >= 0) || size > SNAPSHOT_MAX_BYTES) return false;
    if (used + size > SNAPSHOT_BUDGET_BYTES) return false;
    used += size;
    return true;
  });
}

/** Read a blob's bytes, with a FileReader fallback for WebViews older than `Blob.arrayBuffer`. */
export function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Why the device would not let the page read a file, in words a crew member can act on. */
export function explainReadFailure(name: string): string {
  return (
    `This device would not let the website read “${name}”. It may have changed after you chose it, `
    + 'or the app holding it would not share it. If it is a Trimble job, close the job in Trimble '
    + 'Access (or export a CSV/JobXML from it), then remove this file and choose it again. Otherwise '
    + 'copy it to Downloads and choose that copy.'
  );
}

/**
 * Copy a picked file into memory, so the upload no longer depends on the file on disk staying the
 * same. Keeps the name and date; fills in a content type from the extension when the device gave
 * none. Throws `UploadError('unreadable')` with the plain-words reason when the device refuses.
 */
export async function snapshotFile(file: File, read: (b: Blob) => Promise<ArrayBuffer> = readBlobBytes): Promise<File> {
  let bytes: ArrayBuffer;
  try {
    bytes = await read(file);
  } catch {
    throw new UploadError(explainReadFailure(file.name), { status: null, phase: 'read', kind: 'unreadable' });
  }
  return new File([bytes], file.name, {
    type: contentTypeForAnyFile(file.name, file.type),
    lastModified: file.lastModified,
  });
}

// ── uploads that pass THROUGH a function ─────────────────────────────────────────────────────────

/**
 * Vercel refuses a serverless function request body over 4.5 MB with `413 FUNCTION_PAYLOAD_TOO_LARGE`
 * — a plain-text page, which `res.json()` cannot read, so it used to surface as "did not reach the
 * server". Routes that take the file in the request (collector import, receipts, email attachments)
 * are held under 4 MB here, leaving room for the multipart wrapping and the other fields.
 */
export const FUNCTION_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

export function fitsThroughFunction(sizeBytes: number): boolean {
  return sizeBytes <= FUNCTION_BODY_LIMIT_BYTES;
}

/** Read a response that might not be JSON (a platform 413 is text). */
export async function readJsonLoose(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  const text = await res.text().catch(() => '');
  try { return JSON.parse(text) as { error?: string }; } catch { return {}; }
}

// ── checks before anything is sent ───────────────────────────────────────────────────────────────

export type PreflightResult = { ok: true } | { ok: false; kind: 'empty' | 'too-large'; message: string };

/** Refuse, before a byte is sent, what the server would refuse after. */
export function preflight(file: { name: string; size: number }, capBytes: number): PreflightResult {
  if (file.size === 0) {
    return {
      ok: false, kind: 'empty',
      message: `“${file.name}” is empty (0 bytes), so there is nothing to upload. If it is a Trimble `
        + 'job, export it again, or copy the file to Downloads and choose that copy.',
    };
  }
  if (file.size > capBytes) {
    return {
      ok: false, kind: 'too-large',
      message: `“${file.name}” is ${megabytes(file.size)} MB — over the ${megabytes(capBytes)} MB limit for one file.`,
    };
  }
  return { ok: true };
}

// ── what a failure means ─────────────────────────────────────────────────────────────────────────

export type UploadPhase = 'read' | 'start' | 'send' | 'save';
export type FailureKind =
  | 'offline' | 'network' | 'timeout' | 'too-large' | 'expired' | 'signed-out' | 'forbidden'
  | 'not-found' | 'rate-limited' | 'server' | 'refused' | 'unreadable' | 'empty';

/** An upload failure that knows which step failed and with what status (null = no answer at all). */
export class UploadError extends Error {
  status: number | null;
  phase: UploadPhase;
  kind?: FailureKind;
  serverMessage?: string;
  responseText?: string;
  constructor(message: string, opts: { status: number | null; phase: UploadPhase; kind?: FailureKind; serverMessage?: string; responseText?: string }) {
    super(message);
    this.name = 'UploadError';
    this.status = opts.status;
    this.phase = opts.phase;
    this.kind = opts.kind;
    this.serverMessage = opts.serverMessage;
    this.responseText = opts.responseText;
  }
}

export interface Classified {
  kind: FailureKind;
  /** Can trying the same thing again plausibly work? */
  transient: boolean;
  message: string;
}

export interface FailureContext {
  fileName: string;
  sizeBytes: number;
  /** Was the file copied into memory? When it was, a dropped upload cannot be a changed file. */
  buffered: boolean;
  /** `navigator.onLine` — false means certainly offline; true means nothing much. */
  online?: boolean;
}

const OFFICE_NOTE_TOO_LARGE =
  " (For the office: raise the bucket's file_size_limit in a seed, then STORAGE_UPLOAD_CAP_BYTES in "
  + 'lib/storage/uploads.ts, and prove it with `node scripts/check-upload-ceiling.mjs`.)';

/**
 * Turn a status and a step into what happened, whether to try again, and a sentence that says what
 * failed and what to do. Never a bare "network error".
 */
export function classifyUploadFailure(
  input: { status: number | null; phase: UploadPhase; serverMessage?: string | null; responseText?: string | null },
  ctx: FailureContext,
): Classified {
  const name = `“${ctx.fileName}”`;
  const { status, phase } = input;
  const server = (input.serverMessage ?? '').trim();
  const body = (input.responseText ?? '').toLowerCase();

  if (ctx.online === false) {
    return { kind: 'offline', transient: true, message: `This device is offline. ${name} will upload when the connection comes back.` };
  }

  if (phase === 'read') {
    return { kind: 'unreadable', transient: false, message: explainReadFailure(ctx.fileName) };
  }

  if (status === null || status === 0) {
    if (phase === 'send' && !ctx.buffered) {
      return {
        kind: 'network', transient: true,
        message: `Sending ${name} stopped before it finished. Either the connection dropped, or the file `
          + 'was changed or locked by another app after you chose it (for example a job still open in '
          + 'Trimble Access). It will try again; if it keeps failing, close the job or move closer to a '
          + 'signal, then press Retry.',
      };
    }
    const step = phase === 'start' ? 'reach the website to start' : phase === 'save' ? 'reach the website to finish' : 'finish sending';
    return {
      kind: 'network', transient: true,
      message: `Could not ${step} ${name} — the connection dropped or is too weak. It will try again automatically.`,
    };
  }

  const tooBig = status === 413 || body.includes('exceeded the maximum allowed size') || body.includes('payload too large')
    || body.includes('"statuscode":"413"') || body.includes('function_payload_too_large');
  if (tooBig) {
    return {
      kind: 'too-large', transient: false,
      message: `${name} (${megabytes(ctx.sizeBytes)} MB) is larger than this upload accepts.`
        + (phase === 'send' ? OFFICE_NOTE_TOO_LARGE : ' Use the Upload files button on the job instead, which takes files up to 500 MB.'),
    };
  }

  if (status === 408 || status === 504) {
    return { kind: 'timeout', transient: true, message: `The upload of ${name} timed out. It will try again.` };
  }
  if (status === 429) {
    return { kind: 'rate-limited', transient: true, message: `Too many uploads at once — ${name} will try again in a moment.` };
  }
  if (status === 401 || status === 403) {
    if (phase === 'send') {
      return { kind: 'expired', transient: true, message: `The upload link for ${name} expired. A fresh one is being requested.` };
    }
    if (status === 401) {
      return {
        kind: 'signed-out', transient: false,
        message: 'You have been signed out. Sign in again in another tab, then come back and press Retry — your files are still listed here.',
      };
    }
    return { kind: 'forbidden', transient: false, message: server || 'Your account cannot upload to this folder. Ask an admin for access.' };
  }
  if (status === 404) {
    return { kind: 'not-found', transient: false, message: server || 'That job or folder no longer exists. Close this and open the job again.' };
  }
  if (status >= 500) {
    return {
      kind: 'server', transient: true,
      message: `The ${phase === 'send' ? 'storage service' : 'website'} had a problem (${status}) with ${name}. It will try again.`,
    };
  }
  return { kind: 'refused', transient: false, message: server || `${name} was refused (${status}).` };
}

/** Run one step's request, turning "no answer at all" (fetch's `TypeError`) into an `UploadError`
 *  that knows which step it was — so the sentence can say "could not reach the website to start"
 *  rather than guess. */
export async function asStep<T>(phase: UploadPhase, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TypeError) throw new UploadError('No answer from the server.', { status: null, phase });
    throw err;
  }
}

/** Classify anything a step threw. `TypeError` is what `fetch` throws when there was no answer. */
export function classifyError(err: unknown, ctx: FailureContext, fallbackPhase: UploadPhase = 'send'): Classified {
  if (err instanceof UploadError) {
    if (err.kind === 'unreadable' || err.kind === 'empty') return { kind: err.kind, transient: false, message: err.message };
    return classifyUploadFailure(
      { status: err.status, phase: err.phase, serverMessage: err.serverMessage, responseText: err.responseText ?? err.message },
      ctx,
    );
  }
  if (err instanceof TypeError) return classifyUploadFailure({ status: null, phase: fallbackPhase }, ctx);
  const message = err instanceof Error ? err.message : String(err);
  return { kind: 'refused', transient: false, message: message || `Could not upload “${ctx.fileName}”.` };
}

// ── trying again ─────────────────────────────────────────────────────────────────────────────────

/** Tries per file, counting the first. */
export const MAX_ATTEMPTS = 4;

/** Wait before try `attempt + 1`: 2 s, 6 s, 18 s… capped at 30 s, ±20% so a crew's phones that
 *  dropped together do not all come back in the same second. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 2_000 * 3 ** Math.max(0, attempt - 1));
  const jitter = 0.8 + 0.4 * random();
  return Math.round(base * jitter);
}

export interface RetryOptions {
  maxAttempts?: number;
  classify: (err: unknown) => Classified;
  sleep?: (ms: number) => Promise<void>;
  /** Resolves when there is (probably) a connection. Waiting here does not use up an attempt. */
  waitForOnline?: () => Promise<void>;
  onRetry?: (info: { attempt: number; nextAttempt: number; delayMs: number; failure: Classified }) => void;
  random?: () => number;
}

/** Run `op` until it succeeds, a failure is not worth repeating, or the attempts run out. Throws an
 *  `Error` whose message is the last failure's plain-words sentence. */
export async function runWithRetry<T>(op: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt += 1) {
    if (opts.waitForOnline) await opts.waitForOnline();
    try {
      return await op(attempt);
    } catch (err) {
      const failure = opts.classify(err);
      if (!failure.transient || attempt >= max) {
        const out = new Error(failure.message);
        (out as Error & { failure?: Classified }).failure = failure;
        throw out;
      }
      const delayMs = failure.kind === 'offline' ? 0 : retryDelayMs(attempt, opts.random);
      opts.onRetry?.({ attempt, nextAttempt: attempt + 1, delayMs, failure });
      await sleep(delayMs);
    }
  }
}

// ── which picker buttons a device gets ───────────────────────────────────────────────────────────

export interface PickerEnv {
  userAgent: string;
  /** `'showOpenFilePicker' in window` — Chrome 132+ on Android opens the system Files picker. */
  hasOpenFilePicker: boolean;
  /** `matchMedia('(pointer: coarse)')` — a phone, tablet or controller. */
  coarsePointer: boolean;
  /** `'webkitdirectory' in input`. */
  supportsDirectory: boolean;
}

export interface PickerPlan {
  /** What "Choose files…" opens: the system Files picker, or the browser's own chooser. */
  primary: 'system-files' | 'input';
  /** A second button for the browser's chooser (Drive, Photos, other apps) when the primary is not it. */
  otherApps: boolean;
  /** The gallery (photo picker). */
  photos: boolean;
  /** Camera buttons — never on the general picker, which must stay a picker. */
  camera: boolean;
  /** "Choose a folder…" — desktop only; Android browsers ignore it or pick one file. */
  folder: boolean;
  android: boolean;
}

export function isAndroid(ua: string): boolean { return /Android/i.test(ua); }
/** An Android WebView (an app showing the site), which cannot be relied on for the newer picker. */
export function isAndroidWebView(ua: string): boolean { return isAndroid(ua) && /; wv\)|Version\/[\d.]+ Chrome/i.test(ua); }

export function planPickers(env: PickerEnv): PickerPlan {
  const android = isAndroid(env.userAgent);
  const systemFiles = android && env.hasOpenFilePicker && !isAndroidWebView(env.userAgent);
  const touch = env.coarsePointer || android || /iPhone|iPad|iPod/i.test(env.userAgent);
  return {
    primary: systemFiles ? 'system-files' : 'input',
    otherApps: systemFiles,
    photos: touch,
    camera: touch,
    folder: !touch && env.supportsDirectory,
    android,
  };
}

/** Files a folder pick brings along that nobody meant to upload. */
export function isJunkFile(name: string): boolean {
  return /^(\.ds_store|thumbs\.db|desktop\.ini)$/i.test(name) || /^\._/.test(name);
}

// ── the same name twice ──────────────────────────────────────────────────────────────────────────

/** Names that more than one DIFFERENT file in the list shares (case-insensitive). Both are kept —
 *  storage keys are unique — but the person is told, so two "Export.csv"s are not a surprise. */
export function duplicateNames(files: ReadonlyArray<{ name: string }>): Set<string> {
  const seen = new Map<string, number>();
  for (const f of files) seen.set(f.name.toLowerCase(), (seen.get(f.name.toLowerCase()) ?? 0) + 1);
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

// ── where a Trimble controller keeps its jobs ────────────────────────────────────────────────────

export const TRIMBLE_HELP = {
  summary: 'Can’t find your Trimble job files?',
  steps: [
    'Tap Choose files… and pick Files (or “Browse”). If the picker opens on Recent or Drive, tap ☰ (top-left) and choose the device’s internal storage (it may show as the controller’s name, e.g. TDC600 or TSC5).',
    'Open Trimble Data → Projects → your project. The job is the .job file; exports you made (.csv, .jxl, .txt) are usually in the same project folder or an Export folder.',
    'Close the job in Trimble Access first, or upload an export (CSV or JobXML) — a job that is open is still being written to.',
    'If Files does not show the folder, export the job to Downloads from Trimble Access and pick it from Downloads.',
  ],
} as const;
