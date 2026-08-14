// lib/jobs/recorder.ts — the decisions a screen recorder makes that are not about the DOM.
// Slice B2 of docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// ── WHY ANY OF THIS IS OUT HERE ─────────────────────────────────────────────────────────────────
//
// A `MediaRecorder` component is untestable in a unit suite: jsdom has no `getDisplayMedia`, no
// `AudioContext` and no encoder. But almost every way this feature fails silently is a *decision*,
// not a stream:
//
//   · picking a codec the browser cannot encode → `MediaRecorder` throws on construction, and the
//     message ("NotSupportedError") reads like the screen-share was refused;
//   · deciding the browser can record when it cannot → a dead button, which is how a platform limit
//     (D2: `getDisplayMedia` does not exist on iOS Safari) gets reported as a bug in our code;
//   · getting the size estimate wrong → he records for forty minutes believing it is 200 MB and
//     finds out at the upload that it is over the ceiling.
//
// So the choices live here, tested, and the component is left holding only the stream plumbing.

/** What the recorder asks for, best first. VP9 is ~30% smaller than VP8 at the same quality, which
 *  on a forty-minute walkthrough is the difference between under and over the 500 MB ceiling.
 *  Safari encodes neither and gets H.264 in an MP4 container; it is last because Chrome will happily
 *  accept it and produce a file other browsers then struggle to seek. */
export const RECORDER_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const;

/**
 * The best container this browser can actually encode.
 *
 * `isTypeSupported` is passed in rather than read off `MediaRecorder` so this is testable, and
 * because the guard for "MediaRecorder does not exist at all" belongs at the call site.
 *
 * Returns `null` when the browser supports none of them — the caller must then refuse to start
 * rather than construct a `MediaRecorder` with no `mimeType` and hope. An unconstrained recorder
 * does work on Chrome and produces an unlabelled blob we cannot name a file extension for.
 */
export function pickRecorderMimeType(isTypeSupported: (t: string) => boolean): string | null {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate;
    } catch {
      // Some implementations throw on a malformed type rather than returning false. Treat that as
      // "no" and keep going — one unsupported candidate must not abort the search.
    }
  }
  return null;
}

/** The file extension implied by a recorder mime type. Used to name the upload, which is what
 *  decides whether a `<video>` element will play it back later. */
export function extensionForMimeType(mimeType: string | null | undefined): string {
  if (!mimeType) return 'webm';
  const base = mimeType.split(';')[0]!.trim().toLowerCase();
  if (base === 'video/mp4') return 'mp4';
  return 'webm';
}

export interface RecorderSupport {
  supported: boolean;
  /** A sentence for the user. Empty when supported. Names the browsers that DO work, per D2 —
   *  "not supported" alone leaves somebody trying the same thing on the same phone. */
  reason: string;
}

/**
 * Can this browser record the screen?
 *
 * Called before the button renders, so a browser that cannot do this says why instead of showing a
 * control that fails on click. The three failures are genuinely different and are told apart here:
 * no screen capture at all (iOS Safari), no recorder (very old browsers), and an insecure origin
 * (which silently strips `mediaDevices` and looks exactly like an unsupported browser).
 */
export function describeRecorderSupport(env: {
  hasDisplayMedia: boolean;
  hasMediaRecorder: boolean;
  hasUserMedia: boolean;
  isSecureContext: boolean;
}): RecorderSupport {
  // Checked first: on `http://` served from anything but localhost the browser removes
  // `navigator.mediaDevices` entirely, so every other check below reports "unsupported" and sends
  // somebody looking for a different browser when the problem is the URL.
  if (!env.isSecureContext) {
    return {
      supported: false,
      reason: 'Screen recording needs a secure connection. Open this page over https:// (or on localhost) and it will work.',
    };
  }
  if (!env.hasDisplayMedia) {
    return {
      supported: false,
      reason: 'This browser cannot capture a screen. Screen recording works in Chrome, Edge and Firefox on a computer — iPhones and iPads cannot do it at all. Record at a desktop; everyone can watch it anywhere, including on a phone.',
    };
  }
  if (!env.hasMediaRecorder) {
    return { supported: false, reason: 'This browser cannot record video. Try Chrome, Edge or Firefox.' };
  }
  if (!env.hasUserMedia) {
    return {
      supported: false,
      reason: 'This browser will not give access to a microphone, so a recording would have no voice on it.',
    };
  }
  return { supported: true, reason: '' };
}

/** Read the environment out of a real browser. Split from the rule above so the rule is testable. */
export function readRecorderSupport(): RecorderSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'Screen recording is only available in a browser.' };
  }
  const md = navigator.mediaDevices as MediaDevices | undefined;
  return describeRecorderSupport({
    hasDisplayMedia: typeof md?.getDisplayMedia === 'function',
    hasUserMedia: typeof md?.getUserMedia === 'function',
    hasMediaRecorder: typeof window.MediaRecorder !== 'undefined',
    isSecureContext: window.isSecureContext !== false,
  });
}

/** mm:ss, or h:mm:ss once it has been going an hour — which on a job walkthrough it will. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

/** Human bytes. One decimal below 10 units, none above — "1.4 GB" and "437 MB" both read at a
 *  glance, "1.42 GB" and "437.2 MB" do not. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

export interface SizeProjection {
  /** Bytes recorded so far. */
  bytes: number;
  /** Where this is heading if he keeps talking for `projectToSeconds`. Null before there is enough
   *  to extrapolate from — a projection off two seconds of a static screen predicts 12 MB for an
   *  hour and is a lie that stops people recording. */
  projectedBytes: number | null;
  /** True once the projection crosses the bucket ceiling. The warning that matters: it is the
   *  difference between stopping at thirty minutes and losing the whole session at the upload. */
  willExceedLimit: boolean;
}

/**
 * Where a recording's size is going.
 *
 * Screen capture bitrate is wildly non-uniform — a still page is nearly free and a scrolled PDF is
 * not — so this projects from the *observed* rate rather than a nominal bitrate, and refuses to
 * project at all until there is enough of a sample to mean anything.
 */
export function projectRecordingSize(args: {
  bytesSoFar: number;
  elapsedSeconds: number;
  projectToSeconds: number;
  limitBytes: number;
}): SizeProjection {
  const { bytesSoFar, elapsedSeconds, projectToSeconds, limitBytes } = args;
  // Ten seconds: long enough that one keyframe does not dominate the average, short enough that the
  // number appears while he is still deciding whether the setup is right.
  if (elapsedSeconds < 10 || bytesSoFar <= 0) {
    return { bytes: bytesSoFar, projectedBytes: null, willExceedLimit: bytesSoFar > limitBytes };
  }
  const projected = Math.round((bytesSoFar / elapsedSeconds) * projectToSeconds);
  return {
    bytes: bytesSoFar,
    projectedBytes: projected,
    // Either already over, or heading over. Both are worth saying; only the first is certain.
    willExceedLimit: bytesSoFar > limitBytes || projected > limitBytes,
  };
}

/**
 * What to call the recording.
 *
 * Named for the job and the moment, because the alternative is twelve files called
 * `Screen Recording.webm` in the job folder — and the job folder is where these land (D4), next to
 * everything else on the job rather than in a briefings-only drawer.
 */
export function recordingFileName(
  jobNumber: string | null | undefined,
  when: Date,
  mimeType: string | null,
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
    + `-${pad(when.getHours())}${pad(when.getMinutes())}`;
  const job = (jobNumber ?? '').trim().replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${job ? `${job}-` : ''}briefing-${stamp}.${extensionForMimeType(mimeType)}`;
}
