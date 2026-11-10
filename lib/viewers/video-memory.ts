// lib/viewers/video-memory.ts — what a video remembers, and the arithmetic of its controls.
//
// Owner, 2026-11-09: "whenever I click somewhere else or open another program, the video player
// closes, and in order to go back to the video and where I was in it, I have to reopen it and
// scroll. I need the video player to stay open and keep its place in the video until the user
// clicks the x button … Also, we need better video controls like changing the speed."
//
// A video's place is kept in sessionStorage, keyed by the file (not its signed URL, which changes
// every time it is re-signed), so anything that redraws the viewer — a reload, the page being
// rebuilt behind it — reopens it where it was. The speed is a preference and lives in localStorage.
//
// Pure apart from the two storage wrappers, which swallow every failure: a private window or
// blocked site data loses the memory, never the video.

/** The speeds the player offers, slowest first. */
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** Seconds the J / L keys and the ±10 buttons jump. */
export const SKIP_SECONDS = 10;
/** Seconds the ← / → keys jump. */
export const NUDGE_SECONDS = 5;
/** One frame, near enough: phone and drone footage is 30 fps or faster. */
export const FRAME_SECONDS = 1 / 30;

const POSITION_PREFIX = 'video-pos:';
const SPEED_KEY = 'video-speed';

/** A stable key for a video: its file id when there is one, else its URL without the query string
 *  (a signed URL's token changes every time it is signed; the path does not). */
export function videoKey(id: string | null | undefined, url: string | null | undefined): string {
  if (id) return id;
  if (!url) return '';
  const q = url.indexOf('?');
  return q >= 0 ? url.slice(0, q) : url;
}

/** The next speed up (dir 1) or down (dir -1) from `current`, staying inside SPEEDS. */
export function stepSpeed(current: number, dir: 1 | -1): number {
  const list = SPEEDS as readonly number[];
  if (dir > 0) return list.find((s) => s > current + 1e-9) ?? list[list.length - 1];
  return [...list].reverse().find((s) => s < current - 1e-9) ?? list[0];
}

/** "0:07", "4:56", "1:02:03". */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Where to pick a video up: the saved time, unless it is so near the start or the end that
 *  starting over is what anyone would want. */
export function resumePoint(saved: number | null, duration: number): number {
  if (saved === null || !Number.isFinite(saved) || saved < 1) return 0;
  if (Number.isFinite(duration) && duration > 0 && saved > duration - 1.5) return 0;
  return saved;
}

/** Clamp a seek target into the video. */
export function clampTime(t: number, duration: number): number {
  const end = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return Math.min(Math.max(0, t), end);
}

export function savePosition(key: string, seconds: number): void {
  if (!key) return;
  try { sessionStorage.setItem(POSITION_PREFIX + key, String(Math.round(seconds * 10) / 10)); } catch { /* no storage */ }
}

export function loadPosition(key: string): number | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(POSITION_PREFIX + key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveSpeed(speed: number): void {
  try { localStorage.setItem(SPEED_KEY, String(speed)); } catch { /* no storage */ }
}

export function loadSpeed(): number {
  try {
    const n = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(n) ? n : 1;
  } catch {
    return 1;
  }
}
